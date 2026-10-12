import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertEvidenceSource,
  assertNoUuidCollision,
  CATALOGUE_UUID_NAMESPACE,
  compileCatalogueIntake,
  deterministicUuid,
  renderSnapshotJson,
} from '../../scripts/catalogue-compiler.ts';
import { runCompileCatalogue } from '../../scripts/compile-catalogue-intake.ts';
import { catalogueVersionsFromSeedSql } from '../../scripts/validate-guidance-research.ts';

// Every brand, product, tool, URL, GTIN, reviewer and date below is synthetic
// scaffolding for the compiler tests. Nothing here describes a real product,
// and none of it may be copied into `docs/product/catalogue/`.

const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../fixtures/catalogue/${name}`, import.meta.url), 'utf8'));

const validInput = () => structuredClone(readFixture('valid-basic-wash-intake.json')) as {
  intake: { status: string; rows: Record<string, unknown>[] };
  provenance: { firstSeen: string; lastChecked: string };
};

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('catalogue compiler determinism', () => {
  it('produces byte-identical output across repeated runs', () => {
    const first = compileCatalogueIntake(validInput());
    const second = compileCatalogueIntake(validInput());
    expect(renderSnapshotJson(second.snapshot)).toBe(renderSnapshotJson(first.snapshot));
    expect(second.sql).toBe(first.sql);
    expect(JSON.stringify(second.snapshot)).toBe(JSON.stringify(first.snapshot));
  });

  it('is unaffected by input-row reordering', () => {
    const forward = compileCatalogueIntake(validInput());
    const input = validInput();
    input.intake.rows.reverse();
    const reversed = compileCatalogueIntake(input);
    expect(renderSnapshotJson(reversed.snapshot)).toBe(renderSnapshotJson(forward.snapshot));
    expect(reversed.sql).toBe(forward.sql);
  });

  it('derives stable version-5 UUIDs from canonical identity', () => {
    expect(CATALOGUE_UUID_NAMESPACE).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(deterministicUuid('synthetic-canonical-identity')).toMatch(UUID_V5);
    expect(deterministicUuid('synthetic-canonical-identity')).toBe(
      deterministicUuid('synthetic-canonical-identity'),
    );
    expect(deterministicUuid('synthetic-identity-a')).not.toBe(
      deterministicUuid('synthetic-identity-b'),
    );
    const { snapshot } = compileCatalogueIntake(validInput());
    const ids = [
      ...snapshot.brands.map(brand => brand.id),
      ...snapshot.products.map(product => product.id),
      ...snapshot.product_versions.map(version => version.id),
      ...snapshot.product_claims.map(claim => claim.id),
      ...snapshot.product_sources.map(source => source.id),
    ];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(UUID_V5);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps working when unrelated environment secrets change', () => {
    const before = compileCatalogueIntake(validInput());
    process.env.DATABASE_URL = 'postgres://synthetic-fixture/injected';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-fixture-key';
    try {
      const after = compileCatalogueIntake(validInput());
      expect(after.sql).toBe(before.sql);
    } finally {
      delete process.env.DATABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });
});

describe('catalogue snapshot shape', () => {
  it('carries brand, product, version, source and claim records under database column names', () => {
    const { snapshot } = compileCatalogueIntake(validInput());
    expect(snapshot.brands).toHaveLength(1);
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.product_versions).toHaveLength(2);
    expect(snapshot.product_claims).toHaveLength(2);
    expect(snapshot.product_sources).toHaveLength(2);
    expect(Object.keys(snapshot.brands[0]!).sort()).toEqual(['id', 'name']);
    expect(Object.keys(snapshot.products[0]!).sort()).toEqual(
      ['brand_id', 'category', 'id', 'market', 'name'],
    );
    expect(Object.keys(snapshot.product_versions[0]!).sort()).toEqual(
      ['barcode', 'id', 'lifecycle', 'market', 'product_id', 'variant'],
    );
    expect(Object.keys(snapshot.product_claims[0]!).sort()).toEqual(
      ['claim_key', 'id', 'statement', 'version_id'],
    );
    expect(Object.keys(snapshot.product_sources[0]!).sort()).toEqual(
      ['archived_url', 'first_seen', 'id', 'last_checked', 'market', 'source_type', 'source_url', 'trust_tier', 'version_id'],
    );
  });

  it('dedupes one brand row for rows that share a brand', () => {
    const { snapshot } = compileCatalogueIntake(validInput());
    expect(snapshot.brands).toEqual([
      { id: snapshot.products[0]!.brand_id, name: 'Synthetic Fixture Wash Co' },
    ]);
    expect(snapshot.products[1]!.brand_id).toBe(snapshot.products[0]!.brand_id);
  });

  it('records the exact ZA market and operator-supplied provenance dates', () => {
    const { snapshot } = compileCatalogueIntake(validInput());
    for (const product of snapshot.products) expect(product.market).toBe('ZA');
    for (const version of snapshot.product_versions) expect(version.market).toBe('ZA');
    for (const source of snapshot.product_sources) {
      expect(source.market).toBe('ZA');
      expect(source.source_type).toBe('manufacturer');
      expect(source.trust_tier).toBe('T5');
      expect(source.first_seen).toBe('2026-09-01');
      expect(source.last_checked).toBe('2026-10-01');
    }
  });

  it('never invents verification events without a signed reviewer decision', () => {
    const { snapshot } = compileCatalogueIntake(validInput());
    expect(snapshot.product_verification_events).toEqual([]);
    expect(snapshot.tool_verification_events).toEqual([]);
  });

  it('emits one signed verification event per reviewer decision, resolved to its own version', () => {
    const input = validInput();
    const recordId = input.intake.rows[0]!['recordId'];
    const { snapshot } = compileCatalogueIntake({
      ...input,
      verifications: [{
        recordId,
        reviewer: 'Synthetic Reviewer Fixture',
        reviewedFields: ['name'],
        status: 'verified',
        reason: 'Synthetic fixture decision. Not a real review.',
      }],
    });
    expect(snapshot.product_verification_events).toHaveLength(1);
    const event = snapshot.product_verification_events[0]!;
    expect(Object.keys(event).sort()).toEqual(
      ['id', 'reason', 'reviewed_fields', 'reviewer', 'source_ids', 'status', 'version_id'],
    );
    expect(event.reviewer).toBe('Synthetic Reviewer Fixture');
    expect(event.version_id).toBe(snapshot.product_versions[0]!.id);
    expect(event.source_ids).toEqual([snapshot.product_sources[0]!.id]);
    expect(event.id).toMatch(UUID_V5);
  });

  it('compiles tool rows into the tool catalogue tables', () => {
    const input = validInput();
    input.intake.rows.push({
      recordId: 'b0000000-0000-4000-8000-000000000101',
      kind: 'tool',
      brand: 'Synthetic Fixture Tool Co',
      modelName: 'Synthetic Fixture Dryer',
      versionLabel: 'Synthetic Trial Model A',
      market: 'ZA',
      gtin: null,
      toolType: 'dryer',
      lifecycle: 'active',
      manufacturerUrl: 'https://example.test/manufacturer/synthetic-fixture-dryer',
      labelImageRefs: [],
      identityNotes: null,
      status: 'identity_verified',
    });
    const { snapshot, sql } = compileCatalogueIntake(input);
    expect(snapshot.tool_brands).toHaveLength(1);
    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tool_versions).toHaveLength(1);
    expect(snapshot.tool_claims).toHaveLength(1);
    expect(snapshot.tool_sources).toHaveLength(1);
    expect(Object.keys(snapshot.tools[0]!).sort()).toEqual(
      ['brand_id', 'id', 'name', 'tool_type'],
    );
    expect(Object.keys(snapshot.tool_versions[0]!).sort()).toEqual(
      ['id', 'lifecycle', 'market', 'tool_id', 'version_label'],
    );
    expect(sql).toContain('insert into public.tool_brands');
    expect(sql).toContain('insert into public.tool_versions');
  });

  it('routes a signed tool decision into the tool verification events', () => {
    const input = validInput();
    input.intake.rows.push({
      recordId: 'b0000000-0000-4000-8000-000000000101',
      kind: 'tool',
      brand: 'Synthetic Fixture Tool Co',
      modelName: 'Synthetic Fixture Dryer',
      versionLabel: 'Synthetic Trial Model A',
      market: 'ZA',
      gtin: null,
      toolType: 'dryer',
      lifecycle: 'active',
      manufacturerUrl: 'https://example.test/manufacturer/synthetic-fixture-dryer',
      labelImageRefs: [],
      identityNotes: null,
      status: 'identity_verified',
    });
    const { snapshot, sql } = compileCatalogueIntake({
      ...input,
      verifications: [{
        recordId: 'b0000000-0000-4000-8000-000000000101',
        reviewer: 'Synthetic Reviewer Fixture',
        reviewedFields: ['name'],
        status: 'verified',
        reason: 'Synthetic fixture decision. Not a real review.',
      }],
    });
    expect(snapshot.product_verification_events).toEqual([]);
    expect(snapshot.tool_verification_events).toHaveLength(1);
    expect(snapshot.tool_verification_events[0]!.version_id).toBe(snapshot.tool_versions[0]!.id);
    expect(sql).toContain('insert into public.tool_verification_events');
    expect(sql).toContain(`'${snapshot.tool_verification_events[0]!.id}'`);
  });

  it('dedupes one tool brand row for tool rows that share a brand', () => {
    const input = validInput();
    for (const [recordId, modelName] of [
      ['b0000000-0000-4000-8000-000000000101', 'Synthetic Fixture Dryer'],
      ['b0000000-0000-4000-8000-000000000102', 'Synthetic Fixture Styler'],
    ] as const) {
      input.intake.rows.push({
        recordId,
        kind: 'tool',
        brand: 'Synthetic Fixture Tool Co',
        modelName,
        versionLabel: 'Synthetic Trial Model A',
        market: 'ZA',
        gtin: null,
        toolType: 'dryer',
        lifecycle: 'active',
        manufacturerUrl: 'https://example.test/manufacturer/synthetic-fixture-tools',
        labelImageRefs: [],
        identityNotes: null,
        status: 'identity_verified',
      });
    }
    const { snapshot } = compileCatalogueIntake(input);
    expect(snapshot.tool_brands).toHaveLength(1);
    expect(snapshot.tools).toHaveLength(2);
    expect(snapshot.tools[0]!.brand_id).toBe(snapshot.tools[1]!.brand_id);
  });
});

describe('catalogue seed SQL', () => {
  it('wraps every insert in a single transaction with parents before children', () => {
    const { sql } = compileCatalogueIntake(validInput());
    const firstInsert = sql.indexOf('insert into public.');
    expect(sql.indexOf('begin;')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('begin;')).toBeLessThan(firstInsert);
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    const order = [
      'insert into public.brands',
      'insert into public.products',
      'insert into public.product_versions',
      'insert into public.product_claims',
      'insert into public.product_sources',
    ];
    const positions = order.map(statement => sql.indexOf(statement));
    expect(positions.every(position => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('fails loudly on conflict instead of silently merging a disagreement', () => {
    const { sql } = compileCatalogueIntake(validInput());
    expect(sql.toLowerCase()).not.toContain('on conflict');
  });

  it('never emits access, role, policy or routine changes', () => {
    const { sql } = compileCatalogueIntake(validInput());
    expect(sql).not.toMatch(
      /\b(grant|revoke|policy|policies|role|rls|row level security|security definer|function|trigger|publish|deploy|create|alter|drop|delete|update)\b/i,
    );
  });

  it('escapes SQL metacharacters so hostile text stays inside literals', () => {
    const input = validInput();
    input.intake.rows = [{
      recordId: 'b0000000-0000-4000-8000-000000000007',
      kind: 'product',
      brand: "Synthetic O'Brien; -- Wash",
      productName: 'Quote "Test" Shampoo\'); DROP TABLE products; --',
      variant: 'Back\\slash\nNewline',
      sizeOrPack: null,
      market: 'ZA',
      gtin: null,
      category: 'shampoo',
      lifecycle: 'active',
      manufacturerUrl: 'https://example.test/manufacturer/synthetic-hostile',
      labelImageRefs: [],
      identityNotes: null,
      status: 'identity_verified',
    }];
    const { sql } = compileCatalogueIntake(input);
    expect(sql).toContain("O''Brien");
    expect(sql).toContain("DROP TABLE products; --");
    const resolved = catalogueVersionsFromSeedSql(sql);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      kind: 'product',
      brand: "Synthetic O'Brien; -- Wash",
      name: 'Quote "Test" Shampoo\'); DROP TABLE products; --',
      variantOrModel: 'Back\\slash\nNewline',
      market: 'ZA',
      lifecycle: 'active',
    });
  });

  it('round-trips the valid fixture through the repository seed reader', () => {
    const { sql } = compileCatalogueIntake(validInput());
    expect(catalogueVersionsFromSeedSql(sql)).toEqual([
      {
        kind: 'product',
        versionId: expect.stringMatching(UUID_V5),
        brand: 'Synthetic Fixture Wash Co',
        name: 'Synthetic Fixture Shampoo',
        variantOrModel: 'Synthetic Trial Variant A',
        market: 'ZA',
        lifecycle: 'active',
      },
      {
        kind: 'product',
        versionId: expect.stringMatching(UUID_V5),
        brand: 'Synthetic Fixture Wash Co',
        name: 'Synthetic Fixture Conditioner',
        variantOrModel: 'Synthetic Trial Variant A',
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });
});

describe('snapshot and SQL parity', () => {
  it('carries every snapshot record into the SQL and nothing else', () => {
    const { snapshot, sql } = compileCatalogueIntake(validInput());
    const ids = [
      ...snapshot.brands.map(brand => brand.id),
      ...snapshot.products.map(product => product.id),
      ...snapshot.product_versions.map(version => version.id),
      ...snapshot.product_claims.map(claim => claim.id),
      ...snapshot.product_sources.map(source => source.id),
    ];
    for (const id of ids) expect(sql).toContain(`'${id}'`);
    const quotedUuids = sql.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [];
    const referenced = new Set([
      ...snapshot.products.map(product => product.brand_id),
      ...snapshot.product_versions.map(version => version.product_id),
      ...snapshot.product_claims.map(claim => claim.version_id),
      ...snapshot.product_sources.map(source => source.version_id),
    ]);
    for (const id of ids) referenced.add(id);
    expect(new Set(quotedUuids.map(quoted => quoted.slice(1, -1)))).toEqual(referenced);
  });

  it('quotes every verification-event literal, including hostile reviewer text', () => {
    const input = validInput();
    const recordId = input.intake.rows[0]!['recordId'];
    const { snapshot, sql } = compileCatalogueIntake({
      ...input,
      verifications: [{
        recordId,
        reviewer: "Synthetic O'Brien Reviewer",
        reviewedFields: ['name', 'category'],
        status: 'verified',
        reason: "Synthetic fixture decision with 'quotes'. Not a real review.",
      }],
    });
    const event = snapshot.product_verification_events[0]!;
    for (const literal of [
      `'${event.id}'`,
      `'${event.version_id}'`,
      `'Synthetic O''Brien Reviewer'`,
      `array['name','category']::text[]`,
      `'verified'`,
      `'Synthetic fixture decision with ''quotes''. Not a real review.'`,
      `array['${event.source_ids[0]}']::uuid[]`,
    ]) {
      expect(sql).toContain(literal);
    }
  });
});

describe('catalogue compiler rejections', () => {
  const invalidCases = JSON.parse(
    readFileSync(new URL('../fixtures/catalogue/invalid-catalogue-intakes.json', import.meta.url), 'utf8'),
  ) as { name: string; errorPattern: string; input: unknown }[];

  it.each(invalidCases)('rejects the fixture case $name', testCase => {
    expect(() => compileCatalogueIntake(testCase.input)).toThrow(
      new RegExp(testCase.errorPattern),
    );
  });

  it('rejects a source tied to the wrong version', () => {
    const base = compileCatalogueIntake(validInput());
    const firstVersion = base.snapshot.product_versions[0]!;
    const secondSource = base.snapshot.product_sources[1]!;
    expect(secondSource.version_id).not.toBe(firstVersion.id);
    const input = validInput();
    expect(() => compileCatalogueIntake({
      ...input,
      verifications: [{
        recordId: input.intake.rows[0]!['recordId'],
        reviewer: 'Synthetic Reviewer Fixture',
        reviewedFields: ['name'],
        status: 'verified',
        reason: 'Synthetic fixture decision. Not a real review.',
        sourceIds: [secondSource.id],
      }],
    })).toThrow(/wrong version/);
  });

  it('refuses to derive two UUIDs for one canonical identity', () => {
    expect(() => assertNoUuidCollision([
      { uuid: deterministicUuid('synthetic-same'), canonical: 'synthetic-same' },
      { uuid: deterministicUuid('synthetic-same'), canonical: 'synthetic-same' },
    ])).not.toThrow();
    expect(() => assertNoUuidCollision([
      { uuid: deterministicUuid('synthetic-first'), canonical: 'synthetic-first' },
      { uuid: deterministicUuid('synthetic-first'), canonical: 'synthetic-second' },
    ])).toThrow(/collision/);
  });

  it('never emits a marketing-only source as identity evidence', () => {
    expect(() => assertEvidenceSource('manufacturer', 'T5')).not.toThrow();
    expect(() => assertEvidenceSource('marketing', 'T10')).toThrow(/marketing/);
    expect(() => assertEvidenceSource('manufacturer', 'T10')).toThrow(/T10/);
    const { snapshot } = compileCatalogueIntake(validInput());
    for (const source of [...snapshot.product_sources, ...snapshot.tool_sources]) {
      expect(source.source_type).not.toBe('marketing');
      expect(source.trust_tier).not.toBe('T10');
    }
  });
});

describe('compile catalogue command line', () => {
  const scratchDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(scratchDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true, maxRetries: 3 })));
  });

  async function scratch(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'strandcue-catalogue-'));
    scratchDirectories.push(directory);
    return directory;
  }

  async function writeInput(directory: string, input: unknown = readFixture('valid-basic-wash-intake.json')): Promise<string> {
    const inputPath = join(directory, 'intake.json');
    await writeFile(inputPath, JSON.stringify(input), 'utf8');
    return inputPath;
  }

  it('writes snapshot and SQL to explicit paths, byte-identical across runs', async () => {
    const directory = await scratch();
    const inputPath = await writeInput(directory);
    const snapshotPath = join(directory, 'snapshot.json');
    const sqlPath = join(directory, 'seed.sql');
    const args = ['--input', inputPath, '--snapshot', snapshotPath, '--sql', sqlPath];
    expect(await runCompileCatalogue(args, directory)).toBe(0);
    const firstSnapshot = await readFile(snapshotPath, 'utf8');
    const firstSql = await readFile(sqlPath, 'utf8');
    expect(await runCompileCatalogue(args, directory)).toBe(0);
    expect(await readFile(snapshotPath, 'utf8')).toBe(firstSnapshot);
    expect(await readFile(sqlPath, 'utf8')).toBe(firstSql);
    expect(createHash('sha256').update(firstSnapshot).digest('hex')).toBe(
      createHash('sha256').update(await readFile(snapshotPath, 'utf8')).digest('hex'),
    );
    expect(JSON.parse(firstSnapshot)).toEqual(
      JSON.parse(renderSnapshotJson(compileCatalogueIntake(readFixture('valid-basic-wash-intake.json')).snapshot)),
    );
  });

  it('refuses to overwrite a non-identical file without --replace-draft', async () => {
    const directory = await scratch();
    const inputPath = await writeInput(directory);
    const snapshotPath = join(directory, 'snapshot.json');
    const sqlPath = join(directory, 'seed.sql');
    await writeFile(snapshotPath, '{"draft": true}\n', 'utf8');
    await writeFile(sqlPath, '-- draft\n', 'utf8');
    expect(
      await runCompileCatalogue(['--input', inputPath, '--snapshot', snapshotPath, '--sql', sqlPath], directory),
    ).toBe(1);
    expect(await readFile(snapshotPath, 'utf8')).toBe('{"draft": true}\n');
    expect(
      await runCompileCatalogue(
        ['--input', inputPath, '--snapshot', snapshotPath, '--sql', sqlPath, '--replace-draft'],
        directory,
      ),
    ).toBe(0);
  });

  it.each([
    ['--publish'],
    ['--deploy'],
    ['--database-url', 'postgres://synthetic-fixture/db'],
    ['--db-url', 'postgres://synthetic-fixture/db'],
    ['--connection-string', 'postgres://synthetic-fixture/db'],
    ['--supabase-url', 'https://synthetic-fixture.example.test'],
  ])('rejects the forbidden option %s', async (...flag: string[]) => {
    const directory = await scratch();
    const inputPath = await writeInput(directory);
    expect(
      await runCompileCatalogue(
        ['--input', inputPath, '--snapshot', join(directory, 's.json'), '--sql', join(directory, 's.sql'), ...flag],
        directory,
      ),
    ).toBe(1);
  });

  it('fails closed on missing flags, missing input, broken JSON and invalid intake', async () => {
    const directory = await scratch();
    const inputPath = await writeInput(directory);
    expect(await runCompileCatalogue([], directory)).toBe(1);
    expect(await runCompileCatalogue(['--input', inputPath], directory)).toBe(1);
    expect(
      await runCompileCatalogue(['--input'], directory),
    ).toBe(1);
    expect(
      await runCompileCatalogue(
        ['--input', inputPath, '--snapshot', join(directory, 's.json'), '--sql', join(directory, 's.sql'), '--frobnicate'],
        directory,
      ),
    ).toBe(1);
    expect(
      await runCompileCatalogue(
        ['--input', join(directory, 'absent.json'), '--snapshot', join(directory, 's.json'), '--sql', join(directory, 's.sql')],
        directory,
      ),
    ).toBe(1);
    const brokenPath = join(directory, 'broken.json');
    await writeFile(brokenPath, '{ not json', 'utf8');
    expect(
      await runCompileCatalogue(
        ['--input', brokenPath, '--snapshot', join(directory, 's.json'), '--sql', join(directory, 's.sql')],
        directory,
      ),
    ).toBe(1);
    const invalidCases = JSON.parse(
      readFileSync(new URL('../fixtures/catalogue/invalid-catalogue-intakes.json', import.meta.url), 'utf8'),
    ) as { input: unknown }[];
    const invalidPath = join(directory, 'invalid.json');
    await writeFile(invalidPath, JSON.stringify(invalidCases[0]!.input), 'utf8');
    expect(
      await runCompileCatalogue(
        ['--input', invalidPath, '--snapshot', join(directory, 's.json'), '--sql', join(directory, 's.sql')],
        directory,
      ),
    ).toBe(1);
  });

  it('documents itself with --help', async () => {
    expect(await runCompileCatalogue(['--help'], await scratch())).toBe(0);
  });

  it('fails closed when an output path is not a writable file', async () => {
    const directory = await scratch();
    const inputPath = await writeInput(directory);
    expect(
      await runCompileCatalogue(
        ['--input', inputPath, '--snapshot', directory, '--sql', join(directory, 's.sql')],
        directory,
      ),
    ).toBe(1);
  });

  it('compiles the checked-in valid fixture through the real entry point', async () => {
    const directory = await scratch();
    const inputPath = fileURLToPath(
      new URL('../fixtures/catalogue/valid-basic-wash-intake.json', import.meta.url),
    );
    const snapshotPath = join(directory, 'snapshot.json');
    const sqlPath = join(directory, 'seed.sql');
    expect(
      await runCompileCatalogue(
        ['--input', inputPath, '--snapshot', snapshotPath, '--sql', sqlPath],
        directory,
      ),
    ).toBe(0);
    expect(JSON.parse(await readFile(snapshotPath, 'utf8')).products).toHaveLength(2);
  });
});

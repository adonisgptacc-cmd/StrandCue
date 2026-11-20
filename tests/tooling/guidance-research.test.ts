import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHECKED_IN_EVIDENCE_REGISTRY } from '../../apps/mobile/src/guidance/evidence-registry.ts';
import { CURRENT_HEAT_RULE_PUBLICATION } from '../../apps/mobile/src/guidance/heat-rule-publication.ts';
import { GuidanceEvidenceRegistrySchema } from '../../packages/domain/src/guidance/index.ts';
import {
  catalogueVersionsFromSeedSql,
  catalogueVersionsFromSnapshot,
  resolveCatalogue,
  runGuidanceResearch,
  validateHeatResearchDraft,
  validateGuidanceResearch,
  type GuidanceResearchCatalogueVersion,
} from '../../scripts/validate-guidance-research.ts';

const root = new URL('../..', import.meta.url);
const PACK = 'docs/product/evidence/basic-wash-v1';
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, root), 'utf8');

// Every value below is test scaffolding. It exists to prove the validator
// refuses fabricated or unmatched content, and it must never be copied into
// `docs/product/evidence/`: no catalogue id, product, brand, reviewer or date
// in this file describes a real thing.
const PRODUCT_VERSION = '3f2a1c84-5d6b-4e7a-9c10-2b8f4e6d0a11';
const TOOL_VERSION = '7c4e9b02-18a3-4d5e-8f61-0a2b3c4d5e6f';
const FOREIGN_VERSION = '5e8b0a13-2c4d-4f60-9b27-1d3e5f7092a4';
const UNKNOWN_VERSION = '9c1d5e77-3a8b-4c02-b6d4-5e7f8091a2b3';
const FIXTURE_VERSION = 'b0000000-0000-4000-8000-000000000003';

const catalogueVersion = (
  overrides: Partial<GuidanceResearchCatalogueVersion> & { versionId: string },
): GuidanceResearchCatalogueVersion => ({
  kind: 'product',
  brand: 'Fixture Haircare',
  name: 'Fixture Gentle Wash',
  variantOrModel: '250ml',
  market: 'ZA',
  lifecycle: 'active',
  ...overrides,
});

const CATALOGUE: readonly GuidanceResearchCatalogueVersion[] = [
  catalogueVersion({ versionId: PRODUCT_VERSION }),
  catalogueVersion({
    kind: 'tool',
    versionId: TOOL_VERSION,
    brand: 'Fixture Tools',
    name: 'Fixture Dryer',
    variantOrModel: 'Model FD1',
  }),
  catalogueVersion({
    versionId: FOREIGN_VERSION,
    brand: 'Fixture Overseas',
    name: 'Fixture Wash Export',
    market: 'unknown',
  }),
  catalogueVersion({ versionId: FIXTURE_VERSION }),
];

/** The catalogue that carries no formulation or model identity for a version. */
const CATALOGUE_WITHOUT_IDENTITY: readonly GuidanceResearchCatalogueVersion[] = CATALOGUE.map(entry =>
  entry.versionId === PRODUCT_VERSION ? { ...entry, variantOrModel: null } : entry);

/** A catalogue in which one version id appears twice under different brands. */
const CATALOGUE_WITH_AMBIGUOUS_VERSION: readonly GuidanceResearchCatalogueVersion[] = [
  ...CATALOGUE,
  catalogueVersion({ versionId: PRODUCT_VERSION, brand: 'Second Fixture Brand' }),
];

const RESEARCH_LOG = '# Research log\n\nBlocking gap: no catalogue version exists to research.\n';

function identitySource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceUrl: 'https://example.org/manufacturer-directions',
    archivedUrl: null,
    sourceType: 'manufacturer',
    trustTier: 'T5',
    market: 'ZA',
    firstSeen: '2026-10-01',
    lastChecked: '2026-10-10',
    ...overrides,
  };
}

function inventoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    brand: 'Fixture Haircare',
    name: 'Fixture Gentle Wash',
    variantOrModel: '250ml',
    market: 'ZA',
    lifecycle: 'active',
    source: identitySource(),
    ...overrides,
  };
}

function toolRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return inventoryRow({
    kind: 'tool',
    versionId: TOOL_VERSION,
    brand: 'Fixture Tools',
    name: 'Fixture Dryer',
    variantOrModel: 'Model FD1',
    ...overrides,
  });
}

function inventory(rows: unknown[] = [], overrides: Record<string, unknown> = {}): unknown {
  return { inventoryId: 'basic-wash-v1', version: '1', rows, ...overrides };
}

function evidenceRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidenceId: 'ev-directions-1',
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Manufacturer directions for the exact reviewed version',
    sourceUrl: 'https://example.org/manufacturer-directions',
    archivedUrl: null,
    publisher: 'Fixture Haircare',
    market: 'ZA',
    versionIds: [PRODUCT_VERSION],
    claim: 'The reviewed version is used to cleanse scalp and hair.',
    limitations: 'Directions describe use; they do not establish comparative efficacy.',
    checkedAt: '2026-10-10T10:00:00.000Z',
    authoredBy: 'Evidence Author Fixture',
    reviewedAt: null,
    reviewedBy: null,
    status: 'draft',
    ...overrides,
  };
}

function registry(records: unknown[] = [], overrides: Record<string, unknown> = {}): unknown {
  return { registryId: 'basic-wash-evidence', version: '1', records, ...overrides };
}

function findings(
  inventoryArtifact: unknown,
  registryArtifact: unknown,
  catalogue: readonly GuidanceResearchCatalogueVersion[] = CATALOGUE,
  researchLog: string = RESEARCH_LOG,
) {
  return validateGuidanceResearch(
    { inventory: inventoryArtifact, registry: registryArtifact, researchLog },
    catalogue,
  );
}

function codes(
  inventoryArtifact: unknown,
  registryArtifact: unknown,
  catalogue: readonly GuidanceResearchCatalogueVersion[] = CATALOGUE,
): string[] {
  return findings(inventoryArtifact, registryArtifact, catalogue).map(finding => finding.code);
}

describe('guidance research pack checked into the repository', () => {
  it('keeps production Heat Coach research as an empty draft', () => {
    expect(validateHeatResearchDraft(CURRENT_HEAT_RULE_PUBLICATION)).toEqual([]);
    expect(validateHeatResearchDraft({ ...CURRENT_HEAT_RULE_PUBLICATION, state: 'reviewed' })).toContainEqual(
      expect.objectContaining({ code: 'HEAT_PUBLICATION_NOT_DRAFT' }),
    );
    expect(validateHeatResearchDraft({ ...CURRENT_HEAT_RULE_PUBLICATION, rules: [{}] })).toContainEqual(
      expect.objectContaining({ code: 'HEAT_PUBLICATION_NOT_EMPTY' }),
    );
  });

  it('parses the evidence registry with the reviewed evidence contract', () => {
    const parsed = GuidanceEvidenceRegistrySchema.parse(
      JSON.parse(read(`${PACK}/evidence-registry.json`)),
    );
    expect(parsed.records.every(record => record.status === 'draft')).toBe(true);
  });

  it('passes the research validator as an executed command', () => {
    const output = execFileSync(process.execPath, ['scripts/validate-guidance-research.ts'], {
      cwd: new URL('.', root),
      encoding: 'utf8',
    });
    expect(output).toContain('GUIDANCE-RESEARCH-PASS');
  });

  it('carries only catalogue-resolved ids and migration-backed manufacturer URLs in the pack', async () => {
    // The pack is no longer empty: Task 6 inventoried the first two real
    // local versions, and Task 7 recorded six draft claim-scoped records
    // about them. Absence is therefore asserted as resolution instead —
    // every catalogue id in the pack resolves to exactly one catalogue
    // version, and every evidence URL is a manufacturer URL the seed
    // migration itself carries. Nothing here is invented.
    const catalogue = await resolveCatalogue();
    expect(catalogue).toHaveLength(2);
    const seedSql = read('supabase/migrations/20261012184009_basic_wash_catalogue_seed.sql');
    for (const artifact of ['inventory.json', 'research-log.md']) {
      const content = read(`${PACK}/${artifact}`);
      // Non-catalogue UUIDs the pack itself documents: the registry's
      // evidence ids and the single UUIDv5 namespace they derive from.
      const documented = new Set(
        (JSON.parse(read(`${PACK}/evidence-registry.json`)) as { records: { evidenceId: string }[] }).records.map(
          record => record.evidenceId.toLowerCase(),
        ),
      );
      documented.add('f498ad3d-744b-591d-a73c-7c5b8efa24ff');
      const ids = new Set(
        [...content.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)]
          .map(match => match[0].toLowerCase()),
      );
      for (const id of ids) {
        const catalogueHits = catalogue.filter(entry => entry.versionId.toLowerCase() === id).length;
        expect(
          catalogueHits === 1 || (artifact === 'research-log.md' && documented.has(id)),
          `${artifact} id ${id} resolves to exactly one catalogue version or is a documented evidence id`,
        ).toBe(true);
      }
      const urls = new Set(
        [...content.matchAll(/https?:\/\/[^\s"')\]]+/gi)].map(match => match[0]),
      );
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\//);
        expect(url, `${artifact} URL is backed by the seed migration`).not.toContain('example');
        expect(seedSql, `${artifact} URL ${url} is carried by the seed migration`).toContain(url);
      }
    }
    {
      // The registry carries its own evidence ids, which are not catalogue
      // ids: only its version scopes and its URLs resolve against the seed.
      const content = read(`${PACK}/evidence-registry.json`);
      const parsed = JSON.parse(content) as {
        records: { evidenceId: string; versionIds: string[]; sourceUrl: string }[];
      };
      const evidenceIds = parsed.records.map(record => record.evidenceId);
      expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
      for (const record of parsed.records) {
        for (const id of record.versionIds) {
          expect(
            catalogue.filter(entry => entry.versionId.toLowerCase() === id.toLowerCase()),
            `evidence-registry.json version scope ${id} resolves to exactly one catalogue version`,
          ).toHaveLength(1);
        }
        expect(record.sourceUrl).toMatch(/^https:\/\//);
        expect(record.sourceUrl).not.toContain('example');
        expect(seedSql, `evidence URL ${record.sourceUrl} is carried by the seed migration`).toContain(record.sourceUrl);
      }
    }
    for (const artifact of ['inventory.json', 'evidence-registry.json']) {
      expect(read(`${PACK}/${artifact}`).toLowerCase(), `${artifact} must not name a test host`).not.toContain('example');
    }
    const registry = GuidanceEvidenceRegistrySchema.parse(JSON.parse(read(`${PACK}/evidence-registry.json`)));
    expect(registry.records).toHaveLength(6);
    for (const record of registry.records) {
      expect(record.status).toBe('draft');
      expect(record.sourceType).toBe('manufacturer');
      expect(record.trustTier).toBe('T5');
      expect(record.market).toBe('ZA');
      expect(record.authoredBy).toBe('task-07-draft-research');
      expect(record.reviewedBy).toBeNull();
      expect(record.reviewedAt).toBeNull();
      expect(record.checkedAt.startsWith('2026-10-12')).toBe(true);
      expect(record.versionIds).toHaveLength(1);
      expect(record.claim.trim()).not.toBe('');
      expect(record.limitations.trim()).not.toBe('');
    }
    expect(read(`${PACK}/evidence-registry.json`)).not.toContain('2026-10-13');
  });

  it('mirrors the docs evidence registry into the mobile copy exactly', () => {
    expect(JSON.parse(JSON.stringify(CHECKED_IN_EVIDENCE_REGISTRY))).toEqual(
      JSON.parse(read(`${PACK}/evidence-registry.json`)),
    );
  });

  it('records the blocking catalogue gap whenever no version is inventoried', () => {
    if (JSON.parse(read(`${PACK}/inventory.json`)).rows.length > 0) return;
    const log = read(`${PACK}/research-log.md`);
    expect(log).toMatch(/blocking/i);
    expect(log).toMatch(/product_versions/);
    expect(log).toMatch(/tool_versions/);
  });
});

describe('research pack catalogue resolution', () => {
  it('accepts rows that resolve to exactly one catalogue version each', () => {
    expect(codes(inventory([inventoryRow(), toolRow()]), registry([evidenceRecord()]))).toEqual([]);
  });

  it('accepts an empty pack when the repository holds no catalogue version', () => {
    expect(findings(inventory([]), registry([]), [])).toEqual([]);
  });

  it('reads seeded catalogue versions out of a reviewed migration', () => {
    const seed = [
      `insert into public.brands (id, name) values ('11111111-1111-4111-8111-111111111111', 'Seed Brand');`,
      `insert into public.products (id, brand_id, name, category, market) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Seed Wash', 'shampoo', 'ZA');`,
      `insert into public.product_versions (id, product_id, variant, market, lifecycle) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '400ml', 'ZA', 'active'), ('44444444-4444-4444-8444-444444444444', gen_random_uuid(), '200ml', 'ZA', 'active');`,
      `insert into public.tool_brands (id, name) values ('55555555-5555-4555-8555-555555555555', 'Seed Tools');`,
      `insert into public.tools (id, brand_id, name, tool_type) values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'Seed Dryer', 'dryer');`,
      `insert into public.tool_versions (id, tool_id, version_label, market, lifecycle) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', 'Model SD2', 'ZA', 'active');`,
    ].join('\n');

    expect(catalogueVersionsFromSeedSql(seed)).toEqual([
      {
        kind: 'product',
        versionId: '33333333-3333-4333-8333-333333333333',
        brand: 'Seed Brand',
        name: 'Seed Wash',
        variantOrModel: '400ml',
        market: 'ZA',
        lifecycle: 'active',
      },
      {
        kind: 'tool',
        versionId: '77777777-7777-4777-8777-777777777777',
        brand: 'Seed Tools',
        name: 'Seed Dryer',
        variantOrModel: 'Model SD2',
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });

  it('resolves nothing from a migration that only creates tables', () => {
    expect(
      catalogueVersionsFromSeedSql(read('supabase/migrations/20260924170000_shelf_catalogue.sql')),
    ).toEqual([]);
  });

  it('reads an explicitly exported read-only catalogue snapshot', () => {
    expect(catalogueVersionsFromSnapshot({
      snapshotId: 'export-name',
      products: [{
        versionId: PRODUCT_VERSION,
        brand: 'Exported Haircare',
        name: 'Exported Wash',
        variantOrModel: '400ml',
        market: 'ZA',
        lifecycle: 'retired',
      }],
      tools: [{
        versionId: TOOL_VERSION,
        brand: 'Exported Tools',
        name: 'Exported Dryer',
        variantOrModel: null,
        market: 'ZA',
        lifecycle: 'active',
      }],
    })).toEqual([
      {
        kind: 'product',
        versionId: PRODUCT_VERSION,
        brand: 'Exported Haircare',
        name: 'Exported Wash',
        variantOrModel: '400ml',
        market: 'ZA',
        lifecycle: 'retired',
      },
      {
        kind: 'tool',
        versionId: TOOL_VERSION,
        brand: 'Exported Tools',
        name: 'Exported Dryer',
        variantOrModel: null,
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });

  it('refuses a catalogue snapshot that does not match its contract', () => {
    expect(() => catalogueVersionsFromSnapshot({ snapshotId: 'export-name', products: 'all' })).toThrow();
  });
});

describe('research pack rejections', () => {
  const cases: {
    reason: string;
    inventory: unknown;
    registry: unknown;
    expected: string;
    catalogue?: readonly GuidanceResearchCatalogueVersion[];
  }[] = [
    {
      reason: 'a test-fixture catalogue id',
      inventory: inventory([inventoryRow({ versionId: FIXTURE_VERSION })]),
      registry: registry(),
      expected: 'INVENTORY_FIXTURE_ID',
    },
    {
      reason: 'a version listed twice in the inventory',
      inventory: inventory([inventoryRow(), inventoryRow()]),
      registry: registry(),
      expected: 'INVENTORY_DUPLICATE',
    },
    {
      reason: 'a manual shelf entry that matches no catalogue version',
      inventory: inventory([inventoryRow({ versionId: UNKNOWN_VERSION })]),
      registry: registry(),
      expected: 'INVENTORY_UNRESOLVED',
    },
    {
      reason: 'a version that resolves to more than one catalogue row',
      inventory: inventory([inventoryRow()]),
      registry: registry(),
      expected: 'INVENTORY_AMBIGUOUS',
      catalogue: CATALOGUE_WITH_AMBIGUOUS_VERSION,
    },
    {
      reason: 'a version outside the initial ZA market',
      inventory: inventory([
        inventoryRow({
          versionId: FOREIGN_VERSION,
          brand: 'Fixture Overseas',
          name: 'Fixture Wash Export',
        }),
      ]),
      registry: registry(),
      expected: 'INVENTORY_NOT_ZA',
    },
    {
      reason: 'an inventory row recorded outside the initial ZA market',
      inventory: inventory([inventoryRow({ market: 'unknown' })]),
      registry: registry(),
      expected: 'INVENTORY_NOT_ZA',
    },
    {
      reason: 'a formulation or model identity the catalogue does not carry',
      inventory: inventory([inventoryRow()]),
      registry: registry(),
      expected: 'INVENTORY_IDENTITY_INCOMPLETE',
      catalogue: CATALOGUE_WITHOUT_IDENTITY,
    },
    {
      reason: 'an identity that disagrees with the catalogue',
      inventory: inventory([inventoryRow({ brand: 'Another Fixture Brand' })]),
      registry: registry(),
      expected: 'INVENTORY_FIELD_MISMATCH',
    },
    {
      reason: 'an identity source recorded for another market',
      inventory: inventory([inventoryRow({ source: identitySource({ market: 'unknown' }) })]),
      registry: registry(),
      expected: 'INVENTORY_FIELD_MISMATCH',
    },
    {
      reason: 'a blank formulation or model identity',
      inventory: inventory([inventoryRow({ variantOrModel: '   ' })]),
      registry: registry(),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'an extra column on an inventory row',
      inventory: inventory([inventoryRow({ capability: 'cleanse' })]),
      registry: registry(),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'an evidence claim about a version the catalogue does not hold',
      inventory: inventory([inventoryRow()]),
      registry: registry([evidenceRecord({ versionIds: [UNKNOWN_VERSION] })]),
      expected: 'EVIDENCE_DANGLING_VERSION',
    },
    {
      reason: 'a ZA claim about a version the catalogue places outside ZA',
      inventory: inventory([inventoryRow()]),
      registry: registry([evidenceRecord({ versionIds: [FOREIGN_VERSION] })]),
      expected: 'EVIDENCE_MARKET_MISMATCH',
    },
    {
      reason: 'an executable claim marked reviewed before human approval',
      inventory: inventory([inventoryRow()]),
      registry: registry([
        evidenceRecord({
          status: 'reviewed',
          reviewedAt: '2026-10-10T10:00:00.000Z',
          reviewedBy: 'Second Reviewer Fixture',
        }),
      ]),
      expected: 'EVIDENCE_NOT_DRAFT',
    },
    {
      reason: 'an executable claim supported only by marketing',
      inventory: inventory([inventoryRow()]),
      registry: registry([
        evidenceRecord({
          sourceType: 'marketing',
          trustTier: 'T10',
          publisher: 'Fixture Haircare marketing',
          status: 'reviewed',
          reviewedAt: '2026-10-10T10:00:00.000Z',
          reviewedBy: 'Second Reviewer Fixture',
        }),
      ]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a record that does not parse as evidence',
      inventory: inventory([inventoryRow()]),
      registry: registry([{ evidenceId: 'ev-broken' }]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a pack that is not JSON at all',
      inventory: null,
      registry: registry(),
      expected: 'ARTIFACT_SHAPE',
    },
  ];

  it.each(cases)('rejects $reason', testCase => {
    const reported = findings(
      testCase.inventory,
      testCase.registry,
      testCase.catalogue ?? CATALOGUE,
    );
    expect(reported.map(finding => finding.code)).toContain(testCase.expected);
  });

  it('requires the research log to state the gap while the inventory is empty', () => {
    const reported = validateGuidanceResearch(
      { inventory: inventory([]), registry: registry([]), researchLog: '# Research log\n\nNothing found.\n' },
      [],
    );
    expect(reported.map(finding => finding.code)).toContain('RESEARCH_LOG');
  });

  it('refuses a pack with no research log at all', () => {
    const reported = validateGuidanceResearch(
      { inventory: inventory([]), registry: registry([]), researchLog: '   ' },
      [],
    );
    expect(reported.map(finding => finding.code)).toContain('RESEARCH_LOG');
  });

  it('reports every mismatch rather than stopping at the first', () => {
    expect(
      codes(
        inventory([
          inventoryRow({ versionId: UNKNOWN_VERSION }),
          inventoryRow({ versionId: PRODUCT_VERSION }),
          toolRow({ brand: 'Fixture Haircare', name: 'Fixture Gentle Wash' }),
        ]),
        registry([evidenceRecord({ versionIds: [UNKNOWN_VERSION], market: 'unknown' })]),
      ).length,
    ).toBeGreaterThan(1);
  });
});

describe('seed parsing is fail closed', () => {
  const brand = `insert into public.brands (id, name) values ('11111111-1111-4111-8111-111111111111', 'Seed Brand');`;
  const product = `insert into public.products (id, brand_id, name, category, market) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Seed Wash', 'shampoo', 'ZA');`;

  it('reads a doubled quote as one apostrophe', () => {
    const versions = catalogueVersionsFromSeedSql([
      brand,
      product,
      `insert into public.product_versions (id, product_id, variant) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'O''Brien 400ml');`,
    ].join('\n'));
    expect(versions.map(version => version.variantOrModel)).toEqual(["O'Brien 400ml"]);
  });

  it('takes the declared column default for a column the seed omits', () => {
    const versions = catalogueVersionsFromSeedSql([
      brand,
      product,
      `insert into public.product_versions (id, product_id, variant) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '400ml');`,
    ].join('\n'));
    expect(versions[0]).toMatchObject({ market: 'ZA', lifecycle: 'active', variantOrModel: '400ml' });
  });

  it('reads a numeric literal, an explicit null and a missing variant', () => {
    const versions = catalogueVersionsFromSeedSql([
      `insert into public.tool_brands (id, name) values ('55555555-5555-4555-8555-555555555555', 'Seed Tools');`,
      `insert into public.tools (id, brand_id, name, tool_type) values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555', 'Seed Dryer', 'dryer');`,
      `insert into public.tool_versions (id, tool_id, version_label, market, lifecycle) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', null, NULL, 'active'), ('88888888-8888-4888-8888-888888888888', '66666666-6666-4666-8666-666666666666', 'Model SD3', 'ZA', 'active');`,
    ].join('\n'));
    expect(versions).toEqual([
      {
        kind: 'tool',
        versionId: '77777777-7777-4777-8777-777777777777',
        brand: 'Seed Tools',
        name: 'Seed Dryer',
        variantOrModel: null,
        market: 'ZA',
        lifecycle: 'active',
      },
      {
        kind: 'tool',
        versionId: '88888888-8888-4888-8888-888888888888',
        brand: 'Seed Tools',
        name: 'Seed Dryer',
        variantOrModel: 'Model SD3',
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });

  it.each([
    ['a doubled quote that never closes', `${brand}\ninsert into public.products (id, brand_id, name) values ('2', '1', 'unterminated);`],
    ['an expression where a value belongs', `${brand}\ninsert into public.products (id, brand_id, name) values (coalesce('2', ''), '1', 'Derived');`],
    ['an insert with no values clause', `${brand}\ninsert into public.products (id, brand_id, name) select '2', '1', 'Derived';`],
    ['a tuple that is never closed', `${brand}\ninsert into public.products (id, brand_id, name) values ('2', '1',`],
    ['a column list that is never closed', `${brand}\ninsert into public.products (id, brand_id, name values ('2', '1', 'Derived');`],
    ['a table that is not a catalogue table', `insert into public.profiles (id, username) values ('99999999-9999-4999-8999-999999999999', 'seed');`],
    ['a seed row with no id column', `insert into public.brands (name) values ('Nameless');`],
    [
      'a version whose product was never seeded',
      `${brand}\ninsert into public.product_versions (id, product_id, variant) values ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '400ml');`,
    ],
    [
      'a version whose market is not a catalogue market',
      `${brand}\n${product}\ninsert into public.product_versions (id, product_id, variant, market) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '400ml', 'NAR');`,
    ],
    [
      'a tool version whose tool brand was never seeded',
      `insert into public.tool_brands (id, name) values ('55555555-5555-4555-8555-555555555555', 'Seed Tools');\ninsert into public.tools (id, brand_id, name, tool_type) values ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444', 'Seed Dryer', 'dryer');\ninsert into public.tool_versions (id, tool_id, version_label) values ('77777777-7777-4777-8777-777777777777', '66666666-6666-4666-8666-666666666666', 'Model SD2');`,
    ],
    [
      'a tool version whose tool was never seeded',
      `insert into public.tool_versions (id, tool_id, version_label) values ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', 'Model SD2');`,
    ],
  ])('resolves no catalogue version from %s', (_reason, sql) => {
    expect(catalogueVersionsFromSeedSql(sql)).toEqual([]);
  });
});

describe('guidance research command line', () => {
  const scratchDirectories: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(scratchDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true, maxRetries: 3 })));
  });

  async function scratch(files: Readonly<Record<string, string>>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'strandcue-guidance-'));
    scratchDirectories.push(directory);
    for (const [name, content] of Object.entries(files)) {
      await mkdir(dirname(join(directory, name)), { recursive: true });
      await writeFile(join(directory, name), content, 'utf8');
    }
    return directory;
  }

  const emptyPack = {
    'docs/product/evidence/basic-wash-v1/inventory.json': JSON.stringify(inventory([])),
    'docs/product/evidence/basic-wash-v1/evidence-registry.json': JSON.stringify(registry([])),
    'docs/product/evidence/basic-wash-v1/research-log.md': RESEARCH_LOG,
    'supabase/migrations/20260924170000_shelf_catalogue.sql': '-- no seed rows\n',
  };

  const captureOutput = () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { stdout.push(String(chunk)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { stderr.push(String(chunk)); return true; });
    return {
      stdout,
      stderr,
      get reported(): string { return stdout.join('') + stderr.join(''); },
    };
  };

  it('resolves the repository pack against its own migrations and export', async () => {
    // The first real local seed ships exactly two product versions: the
    // Banana Hair Food shampoo and its matching conditioner, ZA/active.
    expect(await resolveCatalogue()).toEqual([
      {
        kind: 'product',
        versionId: '6ae2cd7a-2d89-5d16-a07d-36ca44139c59',
        brand: 'Garnier Ultimate Blends',
        name: 'Ultimate Blends Hair Food Nourishing Banana Hair Food Conditioner For Dry Hair',
        variantOrModel: 'Hair Food Banana and Coconut for dry hair',
        market: 'ZA',
        lifecycle: 'active',
      },
      {
        kind: 'product',
        versionId: '96759932-6d87-56c2-8165-8f95260447f4',
        brand: 'Garnier Ultimate Blends',
        name: 'Ultimate Blends Hair Food Nourishing Banana Hair Food Shampoo For Dry Hair',
        variantOrModel: 'Hair Food Banana and Coconut for dry hair',
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });

  it('resolves seeded versions and lets an approved export override the same id', async () => {
    const directory = await scratch({
      'supabase/migrations/20260924170000_shelf_catalogue.sql': [
        `insert into public.brands (id, name) values ('11111111-1111-4111-8111-111111111111', 'Seed Brand');`,
        `insert into public.products (id, brand_id, name, category) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Seed Wash', 'shampoo');`,
        `insert into public.product_versions (id, product_id, variant) values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', '400ml');`,
      ].join('\n'),
      'docs/product/evidence/basic-wash-v1/catalogue-snapshot.json': JSON.stringify({
        snapshotId: 'approved-export',
        products: [{
          versionId: '33333333-3333-4333-8333-333333333333',
          brand: 'Exported Brand',
          name: 'Seed Wash',
          variantOrModel: '400ml',
          market: 'ZA',
          lifecycle: 'active',
        }],
        tools: [{
          versionId: TOOL_VERSION,
          brand: 'Exported Tools',
          name: 'Exported Dryer',
          variantOrModel: 'Model ED1',
          market: 'ZA',
          lifecycle: 'active',
        }],
      }),
    });

    const resolved = await resolveCatalogue(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    );
    expect(resolved).toEqual([
      {
        kind: 'product',
        versionId: '33333333-3333-4333-8333-333333333333',
        brand: 'Exported Brand',
        name: 'Seed Wash',
        variantOrModel: '400ml',
        market: 'ZA',
        lifecycle: 'active',
      },
      {
        kind: 'tool',
        versionId: TOOL_VERSION,
        brand: 'Exported Tools',
        name: 'Exported Dryer',
        variantOrModel: 'Model ED1',
        market: 'ZA',
        lifecycle: 'active',
      },
    ]);
  });

  it('passes a structurally valid pack and reports success', async () => {
    const directory = await scratch(emptyPack);
    const output = captureOutput();
    const exitCode = await runGuidanceResearch(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    );

    expect(exitCode).toBe(0);
    expect(output.reported).toContain('GUIDANCE-RESEARCH-PASS rows=0 catalogue=0 evidence=0');
    expect(output.stderr).toEqual([]);
  });

  it('refuses a fabricated pack and exits non-zero', async () => {
    const directory = await scratch({
      ...emptyPack,
      'docs/product/evidence/basic-wash-v1/inventory.json': JSON.stringify(
        inventory([inventoryRow({ versionId: FIXTURE_VERSION })]),
      ),
    });
    const output = captureOutput();
    const exitCode = await runGuidanceResearch(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    );

    expect(exitCode).toBe(1);
    expect(output.reported).toContain('INVENTORY_FIXTURE_ID');
    expect(output.reported).toContain('INVENTORY_UNRESOLVED');
    expect(output.reported).not.toContain('GUIDANCE-RESEARCH-PASS');
  });

  it('fails closed when an approved export does not match its contract', async () => {
    const directory = await scratch({
      ...emptyPack,
      'docs/product/evidence/basic-wash-v1/catalogue-snapshot.json': '{ "snapshotId": "broken" }',
    });
    const output = captureOutput();

    expect(await runGuidanceResearch(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    )).toBe(1);
    expect(output.reported).toContain('GUIDANCE-RESEARCH-HOLD:');
    expect(output.reported).toContain('catalogue-snapshot.json');
  });

  it('fails closed when an artifact cannot be read', async () => {
    const directory = await scratch({
      ...emptyPack,
      'docs/product/evidence/basic-wash-v1/inventory.json': '{ not json',
    });
    const output = captureOutput();

    expect(await runGuidanceResearch(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    )).toBe(1);
    expect(output.reported).toContain('inventory.json is not readable JSON');
  });

  it('fails closed when an artifact is missing', async () => {
    // Exactly one artifact is absent. The validator reads all four concurrently,
    // so a fixture missing two would surface whichever ENOENT won the race
    // rather than testing anything about a missing artifact.
    const directory = await scratch(emptyPack);
    await rm(join(directory, 'docs/product/evidence/basic-wash-v1/research-log.md'));
    const output = captureOutput();

    expect(await runGuidanceResearch(
      join(directory, 'docs/product/evidence/basic-wash-v1'),
      join(directory, 'supabase/migrations'),
    )).toBe(1);
    expect(output.reported).toContain('GUIDANCE-RESEARCH-HOLD:');
    expect(output.reported).toContain('research-log.md');
  });
});

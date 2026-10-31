import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

import { compileCatalogueIntake } from '../../scripts/catalogue-compiler.ts';
import { asUser, database, USER_A, USER_B } from './harness.ts';

// Task 4: catalogue seed isolation (fixture only — no production migration).
//
// The SQL under test is compiler-emitted, never hand-written: the harness
// calls `compileCatalogueIntake` on the synthetic
// `tests/fixtures/catalogue/valid-basic-wash-intake.json` intake (two
// clearly-labelled synthetic wash rows, one shared brand, no tools, no
// verifications) and replays the emitted INSERTs as postgres — the same
// privilege a reviewed seed migration would run with. Reads and denied
// writes are then asserted as `authenticated` / `anon`.
//
// Second-apply behaviour (documented, not worked around): the compiler
// emits plain INSERTs with no upsert handling, so replaying ANY conflicting
// seed — byte-identical or semantically disagreeing — aborts the
// transaction instead of merging. Re-seeding is therefore NOT supported;
// a changed catalogue ships as a new reviewed migration.

const PRODUCT_TABLES = [
  'brands',
  'products',
  'product_versions',
  'product_claims',
  'product_sources',
  'product_verification_events',
] as const;

const TOOL_TABLES = [
  'tool_brands',
  'tools',
  'tool_versions',
  'tool_claims',
  'tool_sources',
  'tool_verification_events',
] as const;

function fixtureInput(): unknown {
  return JSON.parse(
    readFileSync(new URL('../fixtures/catalogue/valid-basic-wash-intake.json', import.meta.url), 'utf8'),
  );
}

async function seedFromCompiler(db: PGlite): Promise<{ snapshot: ReturnType<typeof compileCatalogueIntake>['snapshot']; sql: string }> {
  const { snapshot, sql } = compileCatalogueIntake(fixtureInput());
  // The compiler must emit data INSERTs only — never access changes.
  expect(sql).not.toMatch(/create\s+(policy|trigger|function|role|index)/i);
  expect(sql).not.toMatch(/grant\s|revoke\s|alter\s+table|rls|row level security/i);
  await db.exec('set session authorization postgres');
  await db.exec(sql);
  return { snapshot, sql };
}

async function tableCount(db: PGlite, table: string): Promise<number> {
  const rows = await db.query<{ count: string }>(`select count(*)::text count from public.${table}`);
  return Number(rows.rows[0].count);
}

async function catalogueBaseline(db: PGlite): Promise<Record<(typeof PRODUCT_TABLES)[number], number>> {
  // The reviewed seed migration (Task 6) ships real local rows through the
  // same `database()` harness, so fixture assertions measure their own
  // compiler output relative to whatever the harness already seeded.
  const baseline = {} as Record<(typeof PRODUCT_TABLES)[number], number>;
  for (const table of PRODUCT_TABLES) {
    baseline[table] = await tableCount(db, table);
  }
  return baseline;
}

describe('catalogue seed isolation (compiler fixture)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await database();
  }, 60_000);
  afterEach(async () => {
    await db?.close();
  });

  it('replays compiler SQL with exact row counts and intact foreign keys', async () => {
    const baseline = await catalogueBaseline(db);
    const { snapshot } = await seedFromCompiler(db);
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.brands).toHaveLength(1);
    expect(await tableCount(db, 'brands')).toBe(baseline.brands + snapshot.brands.length);
    expect(await tableCount(db, 'products')).toBe(baseline.products + snapshot.products.length);
    expect(await tableCount(db, 'product_versions')).toBe(baseline.product_versions + snapshot.product_versions.length);
    expect(await tableCount(db, 'product_claims')).toBe(baseline.product_claims + snapshot.product_claims.length);
    expect(await tableCount(db, 'product_sources')).toBe(baseline.product_sources + snapshot.product_sources.length);
    expect(await tableCount(db, 'product_verification_events')).toBe(
      baseline.product_verification_events + snapshot.product_verification_events.length,
    );
    for (const table of TOOL_TABLES) {
      expect(await tableCount(db, table)).toBe(0);
    }
    const orphans = await db.query(
      `select v.id from public.product_versions v
        left join public.products p on p.id = v.product_id
        left join public.brands b on b.id = p.brand_id
       where p.id is null or b.id is null
       union all
       select c.id from public.product_claims c
        left join public.product_versions v on v.id = c.version_id
       where v.id is null
       union all
       select s.id from public.product_sources s
        left join public.product_versions v on v.id = s.version_id
       where v.id is null`,
    );
    expect(orphans.rows).toEqual([]);
  });

  it('lets authenticated users read catalogue rows but denies anon reads', async () => {
    const baseline = await catalogueBaseline(db);
    await seedFromCompiler(db);
    await asUser(db, USER_A);
    // Consumers read identity and lifecycle only: draft claims, sources and verification events are closed to
    // them (20261022120000); the rows exist and are checked as the table owner above.
    for (const table of ['brands', 'products']) {
      expect((await db.query(`select * from public.${table} limit 10`)).rows.length).toBeGreaterThan(0);
    }
    expect((await db.query('select id, variant, market, barcode, lifecycle from public.product_versions limit 10')).rows.length).toBeGreaterThan(0);
    for (const table of ['product_claims', 'product_sources', 'product_verification_events']) {
      await expect(db.query(`select * from public.${table} limit 10`)).rejects.toThrow(/permission denied/i);
    }
    await asUser(db, USER_B);
    const brands = await db.query<{ name: string }>('select name from public.brands');
    expect(brands.rows).toContainEqual({ name: 'Synthetic Fixture Wash Co' });
    expect(brands.rows).toHaveLength(baseline.brands + 1);
    await asUser(db, null);
    await expect(db.query('select * from public.brands')).rejects.toThrow(/permission denied/i);
    await expect(db.query('select * from public.products')).rejects.toThrow(/permission denied/i);
  });

  it('denies every authenticated write to catalogue tables', async () => {
    const { snapshot } = await seedFromCompiler(db);
    await asUser(db, USER_A);
    const versionId = snapshot.product_versions[0].id;
    await expect(db.exec(`insert into public.brands(name) values ('Sneaky')`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      db.exec(`update public.products set name = 'Sneaky' where id = '${snapshot.products[0].id}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.exec(`delete from public.product_claims where id = '${snapshot.product_claims[0].id}'`))
      .rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`update public.product_versions set variant = 'tampered' where id = '${versionId}'`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(
        `insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked)
         values (gen_random_uuid(), '${versionId}', 'https://example.test/sneaky', 'manufacturer', 'T5', 'ZA', '2026-01-01', '2026-01-01')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(
        `insert into public.product_verification_events(id, version_id, reviewer, reviewed_fields, status, reason)
         values (gen_random_uuid(), '${versionId}', 'self', '{name}', 'verified', 'self-approved')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.exec(`insert into public.tool_brands(name) values ('Sneaky')`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('keeps version identity immutable and parent deletes restricted', async () => {
    const { snapshot } = await seedFromCompiler(db);
    const versionId = snapshot.product_versions[0].id;
    await asUser(db, USER_A);
    await expect(
      db.exec(`update public.product_versions set barcode = 'tampered' where id = '${versionId}'`),
    ).rejects.toThrow(/permission denied/i);
    await db.exec('set session authorization postgres');
    await expect(db.exec(`delete from public.brands where id = '${snapshot.brands[0].id}'`)).rejects
      .toThrow(/restrict|violates|foreign key/i);
    await expect(
      db.exec(`delete from public.products where id = '${snapshot.products[0].id}'`),
    ).rejects.toThrow(/restrict|violates|foreign key/i);
    await expect(db.exec(`delete from public.product_versions where id = '${versionId}'`)).rejects
      .toThrow(/restrict|violates|foreign key/i);
  });

  it('carries source and claim scope on every version', async () => {
    const { snapshot } = await seedFromCompiler(db);
    await db.exec('set session authorization postgres');
    const columns = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and table_name in ('product_sources', 'product_claims')`,
    );
    const byTable = new Map<string, Set<string>>();
    for (const row of columns.rows) {
      const set = byTable.get(row.table_name) ?? new Set<string>();
      set.add(row.column_name);
      byTable.set(row.table_name, set);
    }
    for (const column of [
      'source_url', 'archived_url', 'source_type', 'trust_tier', 'market', 'first_seen', 'last_checked',
    ]) {
      expect(byTable.get('product_sources')?.has(column)).toBe(true);
    }
    for (const column of ['claim_key', 'statement']) {
      expect(byTable.get('product_claims')?.has(column)).toBe(true);
    }
    const scoped = await db.query(
      `select v.id from public.product_versions v
       where not exists (
         select 1 from public.product_claims c
         where c.version_id = v.id and c.claim_key = 'name' and c.statement is not null
       ) or not exists (
         select 1 from public.product_sources s
         where s.version_id = v.id and s.source_url like 'https://%'
           and s.source_type = 'manufacturer' and s.trust_tier = 'T5'
           and s.market = 'ZA' and s.last_checked >= s.first_seen
       )`,
    );
    expect(scoped.rows).toEqual([]);
    expect(snapshot.product_sources.every(source => source.source_type === 'manufacturer')).toBe(true);
    expect(snapshot.product_sources.every(source => source.trust_tier === 'T5')).toBe(true);
    expect(snapshot.product_claims.every(claim => claim.claim_key === 'name')).toBe(true);
  });

  it('exposes lifecycle and successor semantics per DDL', async () => {
    await seedFromCompiler(db);
    await db.exec('set session authorization postgres');
    const successorFk = await db.query(
      `select confdeltype from pg_constraint
       where conname = 'product_versions_successor_version_id_fkey'`,
    );
    expect(successorFk.rows.map(row => (row as { confdeltype: string }).confdeltype)).toEqual(['r']);
    const lifecycleCheck = await db.query<{ check: string }>(
      `select pg_get_constraintdef(oid) "check" from pg_constraint
       where conrelid = 'public.product_versions'::regclass and contype = 'c'`,
    );
    expect(lifecycleCheck.rows.some(row => row.check.includes('active') && row.check.includes('retired')))
      .toBe(true);
    const fixtureVersion = await db.query<{ lifecycle: string }>(
      `select lifecycle from public.product_versions limit 1`,
    );
    expect(fixtureVersion.rows[0].lifecycle).toBe('active');
    const productId = (await db.query<{ id: string }>('select id from public.products limit 1')).rows[0].id;
    const successorId = crypto.randomUUID();
    const originalId = crypto.randomUUID();
    await db.exec(
      `insert into public.product_versions(id, product_id, variant, market, lifecycle, successor_version_id)
       values ('${successorId}', '${productId}', 'reformulated', 'ZA', 'active', null)`,
    );
    await db.exec(
      `insert into public.product_versions(id, product_id, variant, market, lifecycle, successor_version_id)
       values ('${originalId}', '${productId}', 'original', 'ZA', 'retired', '${successorId}')`,
    );
    const original = await db.query<{ lifecycle: string; successor_version_id: string }>(
      `select lifecycle, successor_version_id from public.product_versions where id = '${originalId}'`,
    );
    expect(original.rows).toEqual([{ lifecycle: 'retired', successor_version_id: successorId }]);
    await expect(db.exec(`delete from public.product_versions where id = '${successorId}'`)).rejects
      .toThrow(/restrict|violates|foreign key/i);
  });

  it('carries zero owner or private data in catalogue rows', async () => {
    const { sql } = await seedFromCompiler(db);
    await db.exec('set session authorization postgres');
    const suspect = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public'
         and table_name in ('brands','products','product_versions','product_claims','product_sources',
           'product_verification_events','tool_brands','tools','tool_versions','tool_claims',
           'tool_sources','tool_verification_events')
         and column_name ~* 'owner|subject|private|email|profile|user|account'`,
    );
    expect(suspect.rows).toEqual([]);
    expect(sql).not.toMatch(/owner|subject|private|email/i);
    const nonZa = await db.query(
      `select id from public.products where market <> 'ZA'
       union all select id from public.product_versions where market <> 'ZA'`,
    );
    expect(nonZa.rows).toEqual([]);
  });

  it('aborts a second apply of identical SQL instead of merging', async () => {
    const baseline = await catalogueBaseline(db);
    const { snapshot, sql } = await seedFromCompiler(db);
    const before = await tableCount(db, 'products');
    expect(before).toBe(baseline.products + snapshot.products.length);
    await db.exec('set session authorization postgres');
    await expect(db.exec(sql)).rejects.toThrow(/duplicate|already exists|violates|conflict|aborted/i);
    // The conflicting batch leaves the session inside an aborted
    // transaction; roll it back so the unchanged counts can be read.
    await db.exec('rollback').catch(() => undefined);
    expect(await tableCount(db, 'brands')).toBe(baseline.brands + snapshot.brands.length);
    expect(await tableCount(db, 'products')).toBe(before);
    expect(await tableCount(db, 'product_versions')).toBe(baseline.product_versions + snapshot.product_versions.length);
  });

  it.each([
    ['brand', 'brands', 'name'],
    ['product', 'products', 'name'],
    ['market', 'products', 'market'],
    ['variant', 'product_versions', 'variant'],
    ['source URL', 'product_sources', 'source_url'],
    ['claim', 'product_claims', 'claim_key'],
  ])('fails a reused id with a different %s', async (_label, table, column) => {
    const { snapshot } = await seedFromCompiler(db);
    await db.exec('set session authorization postgres');
    const brandId = snapshot.brands[0].id;
    const productId = snapshot.products[0].id;
    const versionId = snapshot.product_versions[0].id;
    // Each statement reuses a real seeded id but disagrees on one semantic
    // field. Every value is constraint-valid on its own, so only the
    // primary-key conflict can reject it — proving a reused id can never
    // smuggle a disagreement into the transaction.
    const disagreeingInsert: Record<string, string> = {
      brands:
        `insert into public.brands(id, name) values ('${brandId}', 'A Different Brand Altogether')`,
      products: table === 'products' && column === 'market'
        ? `insert into public.products(id, brand_id, name, category, market)
           values ('${productId}', '${brandId}', '${snapshot.products[0].name}', '${snapshot.products[0].category}', 'unknown')`
        : `insert into public.products(id, brand_id, name, category, market)
           values ('${productId}', '${brandId}', 'A Different Product Altogether', 'shampoo', 'ZA')`,
      product_versions:
        `insert into public.product_versions(id, product_id, variant, market, lifecycle)
         values ('${versionId}', '${productId}', 'A Different Variant Altogether', 'ZA', 'active')`,
      product_sources:
        `insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked)
         values ('${snapshot.product_sources[0].id}', '${versionId}', 'https://example.test/manufacturer/disagreeing-source',
           'manufacturer', 'T5', 'ZA', '2026-09-01', '2026-10-01')`,
      product_claims:
        `insert into public.product_claims(id, version_id, claim_key, statement)
         values ('${snapshot.product_claims[0].id}', '${versionId}', 'ingredients', 'A disagreeing statement')`,
    };
    const idByTable: Record<string, string> = {
      brands: brandId,
      products: productId,
      product_versions: versionId,
      product_sources: snapshot.product_sources[0].id,
      product_claims: snapshot.product_claims[0].id,
    };
    await expect(db.exec(disagreeingInsert[table])).rejects.toThrow(/duplicate|already exists|violates|conflict/i);
    const current = await db.query<{ current: string }>(
      `select ${column}::text current from public.${table} where id = '${idByTable[table]}'`,
    );
    expect(current.rows).toHaveLength(1);
    // The failed statement changed nothing: the seeded semantic value stands.
    const seededRows = snapshot[
      table === 'brands' ? 'brands'
      : table === 'products' ? 'products'
      : table === 'product_versions' ? 'product_versions'
      : table === 'product_sources' ? 'product_sources'
      : 'product_claims'
    ] as readonly Record<string, unknown>[];
    expect(String(current.rows[0].current)).toBe(String(seededRows[0][column]));
  });

  it('compiles the intake fixture deterministically', () => {
    const first = compileCatalogueIntake(fixtureInput());
    const second = compileCatalogueIntake(fixtureInput());
    expect(second.sql).toBe(first.sql);
    expect(second.snapshot).toEqual(first.snapshot);
  });
});

// Task 6: first real local catalogue seed (reviewed compiler output only).
//
// The SQL under test is compiler-emitted, never hand-written: the migration
// file must carry the byte-identical compiler output for the two
// source-backed ZA rows (one shampoo, one conditioner), and the checked-in
// snapshot must be the same compiler output. The harness `database()` applies
// every migration including the seed, so these assertions read the seeded
// rows back. Local only: nothing here touches hosted Supabase.
const SEED_MIGRATION = '20261012184009_basic_wash_catalogue_seed.sql';
const SEED_BRAND = '0c9e273f-ed2e-5035-9649-bb657101d97e';
const SHAMPOO_PRODUCT = '2bc26c97-9e88-552c-9bf0-173dc44e4636';
const CONDITIONER_PRODUCT = '313c012b-4636-574b-babc-16c0772517fa';
const SHAMPOO_VERSION = '96759932-6d87-56c2-8165-8f95260447f4';
const CONDITIONER_VERSION = '6ae2cd7a-2d89-5d16-a07d-36ca44139c59';
const SHAMPOO_NAME = 'Ultimate Blends Hair Food Nourishing Banana Hair Food Shampoo For Dry Hair';
const CONDITIONER_NAME = 'Ultimate Blends Hair Food Nourishing Banana Hair Food Conditioner For Dry Hair';
const BANANA_VARIANT = 'Hair Food Banana and Coconut for dry hair';
const SEED_BRAND_NAME = 'Garnier Ultimate Blends';
const SHAMPOO_URL = 'https://africa.garnier.com/en-za/about-our-brands/ultimate-blends-hub/ultimate-blends/hair-food/ultimate-blends-hair-food-banana-shampoo';
const CONDITIONER_URL = 'https://africa.garnier.com/en-za/about-our-brands/ultimate-blends-hub/ultimate-blends/hair-food/ultimate-blends-hair-food-banana-conditioner';

function seedMigrationSql(): string {
  return readFileSync(`supabase/migrations/${SEED_MIGRATION}`, 'utf8');
}

function seedSnapshot(): ReturnType<typeof compileCatalogueIntake>['snapshot'] {
  return JSON.parse(
    readFileSync('docs/product/catalogue/basic-wash-v1/catalogue-snapshot.json', 'utf8'),
  ) as ReturnType<typeof compileCatalogueIntake>['snapshot'];
}

describe('first reviewed catalogue seed (local migration)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await database();
  }, 60_000);
  afterEach(async () => {
    await db?.close();
  });

  it('ships compiler SQL in the CLI-generated migration and nothing else', () => {
    const sql = seedMigrationSql();
    expect(sql.length).toBeGreaterThan(0);
    expect(sql).toContain('-- Catalogue seed compiled by `npm run compile:catalogue`');
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
    // Catalogue INSERTs plus the explicit transaction only: no access change.
    expect(sql).not.toMatch(/create\s+(policy|trigger|function|role|index)/i);
    expect(sql).not.toMatch(/grant\s|revoke\s|alter\s+table|rls|row level security/i);
    expect(sql).not.toMatch(/example\.test/i);
    for (const statement of sql.split(';')) {
      const trimmed = statement.trim();
      if (trimmed === '' || trimmed.startsWith('--') || trimmed === 'begin' || trimmed === 'commit') continue;
      expect(trimmed.toLowerCase().startsWith('insert into public.')).toBe(true);
    }
    expect(sql).toContain(SHAMPOO_VERSION);
    expect(sql).toContain(CONDITIONER_VERSION);
  });

  it('carries the exact two reviewed versions in the checked-in snapshot', () => {
    const snapshot = seedSnapshot();
    expect(snapshot.brands).toEqual([{ id: SEED_BRAND, name: SEED_BRAND_NAME }]);
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.product_versions).toHaveLength(2);
    expect(snapshot.product_sources).toHaveLength(2);
    expect(snapshot.product_claims).toHaveLength(2);
    expect(snapshot.product_verification_events).toEqual([]);
    expect(snapshot.tools).toEqual([]);
    expect(snapshot.tool_versions).toEqual([]);
    const shampoo = snapshot.products.find(product => product.id === SHAMPOO_PRODUCT);
    const conditioner = snapshot.products.find(product => product.id === CONDITIONER_PRODUCT);
    expect(shampoo).toMatchObject({ brand_id: SEED_BRAND, name: SHAMPOO_NAME, category: 'shampoo', market: 'ZA' });
    expect(conditioner).toMatchObject({ brand_id: SEED_BRAND, name: CONDITIONER_NAME, category: 'conditioner', market: 'ZA' });
    const shampooVersion = snapshot.product_versions.find(version => version.id === SHAMPOO_VERSION);
    const conditionerVersion = snapshot.product_versions.find(version => version.id === CONDITIONER_VERSION);
    expect(shampooVersion).toMatchObject({ product_id: SHAMPOO_PRODUCT, variant: BANANA_VARIANT, market: 'ZA', barcode: null, lifecycle: 'active' });
    expect(conditionerVersion).toMatchObject({ product_id: CONDITIONER_PRODUCT, variant: BANANA_VARIANT, market: 'ZA', barcode: null, lifecycle: 'active' });
    for (const source of snapshot.product_sources) {
      expect(source).toMatchObject({ source_type: 'manufacturer', trust_tier: 'T5', market: 'ZA', first_seen: '2026-10-12', last_checked: '2026-10-12', archived_url: null });
    }
    expect(snapshot.product_sources.map(source => source.source_url).sort()).toEqual(
      [CONDITIONER_URL, SHAMPOO_URL].sort(),
    );
    expect(snapshot.product_claims.every(claim => claim.claim_key === 'name')).toBe(true);
  });

  it('seeds the shampoo and conditioner as two separate ZA versions', async () => {
    const rows = await db.query<{
      version_id: string; brand: string; name: string; category: string;
      variant: string | null; market: string; barcode: string | null; lifecycle: string;
    }>(
      `select v.id version_id, b.name brand, p.name, p.category, v.variant, v.market, v.barcode, v.lifecycle
        from public.product_versions v
        join public.products p on p.id = v.product_id
        join public.brands b on b.id = p.brand_id
        where v.id in ('${SHAMPOO_VERSION}', '${CONDITIONER_VERSION}')
        order by v.id`,
    );
    expect(rows.rows).toEqual([
      { version_id: CONDITIONER_VERSION, brand: SEED_BRAND_NAME, name: CONDITIONER_NAME, category: 'conditioner', variant: BANANA_VARIANT, market: 'ZA', barcode: null, lifecycle: 'active' },
      { version_id: SHAMPOO_VERSION, brand: SEED_BRAND_NAME, name: SHAMPOO_NAME, category: 'shampoo', variant: BANANA_VARIANT, market: 'ZA', barcode: null, lifecycle: 'active' },
    ]);
    // Separate products, separate categories: never merged across the wash pair.
    const products = await db.query<{ id: string }>(
      `select distinct product_id id from public.product_versions where id in ('${SHAMPOO_VERSION}', '${CONDITIONER_VERSION}')`,
    );
    expect(products.rows).toHaveLength(2);
  });

  it('keeps every evidence-inventory UUID inside the migration and the snapshot', () => {
    const inventory = JSON.parse(
      readFileSync('docs/product/evidence/basic-wash-v1/inventory.json', 'utf8'),
    ) as { rows: { kind: string; versionId: string }[] };
    const sql = seedMigrationSql();
    const snapshot = seedSnapshot();
    expect(inventory.rows.map(row => row.versionId).sort()).toEqual(
      [CONDITIONER_VERSION, SHAMPOO_VERSION].sort(),
    );
    for (const row of inventory.rows) {
      expect(row.kind).toBe('product');
      expect(sql).toContain(row.versionId);
      expect(snapshot.product_versions.some(version => version.id === row.versionId)).toBe(true);
    }
  });

  it('aborts a conflicting reseed of the reviewed versions instead of merging', async () => {
    const sql = seedMigrationSql();
    const before = await tableCount(db, 'product_versions');
    await db.exec('set session authorization postgres');
    await expect(db.exec(sql)).rejects.toThrow(/duplicate|already exists|violates|conflict|aborted/i);
    await db.exec('rollback').catch(() => undefined);
    expect(await tableCount(db, 'product_versions')).toBe(before);
  });
});

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

describe('catalogue seed isolation (compiler fixture)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await database();
  }, 60_000);
  afterEach(async () => {
    await db?.close();
  });

  it('replays compiler SQL with exact row counts and intact foreign keys', async () => {
    const { snapshot } = await seedFromCompiler(db);
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.brands).toHaveLength(1);
    expect(await tableCount(db, 'brands')).toBe(snapshot.brands.length);
    expect(await tableCount(db, 'products')).toBe(snapshot.products.length);
    expect(await tableCount(db, 'product_versions')).toBe(snapshot.product_versions.length);
    expect(await tableCount(db, 'product_claims')).toBe(snapshot.product_claims.length);
    expect(await tableCount(db, 'product_sources')).toBe(snapshot.product_sources.length);
    expect(await tableCount(db, 'product_verification_events')).toBe(
      snapshot.product_verification_events.length,
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
    await seedFromCompiler(db);
    await asUser(db, USER_A);
    for (const table of PRODUCT_TABLES) {
      const rows = await db.query(`select * from public.${table} limit 10`);
      if (table === 'product_verification_events') {
        expect(rows.rows).toEqual([]);
      } else {
        expect(rows.rows.length).toBeGreaterThan(0);
      }
    }
    await asUser(db, USER_B);
    const brands = await db.query<{ name: string }>('select name from public.brands');
    expect(brands.rows).toEqual([{ name: 'Synthetic Fixture Wash Co' }]);
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
    const { snapshot, sql } = await seedFromCompiler(db);
    const before = await tableCount(db, 'products');
    await db.exec('set session authorization postgres');
    await expect(db.exec(sql)).rejects.toThrow(/duplicate|already exists|violates|conflict|aborted/i);
    // The conflicting batch leaves the session inside an aborted
    // transaction; roll it back so the unchanged counts can be read.
    await db.exec('rollback').catch(() => undefined);
    expect(await tableCount(db, 'brands')).toBe(snapshot.brands.length);
    expect(await tableCount(db, 'products')).toBe(before);
    expect(await tableCount(db, 'product_versions')).toBe(snapshot.product_versions.length);
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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

const CATALOGUE_TABLES = [
  'brands',
  'products',
  'product_versions',
  'product_claims',
  'product_sources',
  'product_verification_events',
];

async function seedCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.brands(id, name) values
    ('b0000000-0000-4000-8000-000000000001', 'House Brand')`);
  await db.exec(`insert into public.products(id, brand_id, name, category, market) values
    ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
  await db.exec(`insert into public.product_versions(id, product_id, variant, market, structured_directions, ingredients, lifecycle, successor_version_id) values
    ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', null, 'ZA', '{}', null, 'active', null)`);
  await db.exec(`insert into public.product_claims(id, version_id, claim_key, statement) values
    ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'name', 'House Brand Gentle Shampoo')`);
  await db.exec(`insert into public.product_sources(id, version_id, source_url, archived_url, source_type, trust_tier, market, first_seen, last_checked) values
    ('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 'https://example.test/directions', null, 'manufacturer', 'T5', 'ZA', '2024-01-01', '2024-06-01')`);
  await db.exec(`insert into public.product_verification_events(id, version_id, reviewer, reviewed_fields, status, reason, source_ids) values
    ('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 'seed-review', '{name}', 'verified', 'Seed review', '{b0000000-0000-4000-8000-000000000005}')`);
}

describe('shelf catalogue immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    for (const table of [...CATALOGUE_TABLES].reverse()) {
      await db.exec(`delete from public.${table}`);
    }
  });
  afterAll(async () => { await db?.close(); });

  it('enforces RLS on every catalogue table', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1)`,
      [CATALOGUE_TABLES],
    );
    expect(rows.rows.map((row) => row.tablename).sort()).toEqual([...CATALOGUE_TABLES].sort());
    const unprotected = await db.query(
      `select relname from pg_class where relname = any($1) and (not relrowsecurity or not relforcerowsecurity)`,
      [CATALOGUE_TABLES],
    );
    expect(unprotected.rows).toEqual([]);
    const policies = await db.query<{ tablename: string; policyname: string; roles: string[]; cmd: string }>(
      `select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename = any($1)`,
      [CATALOGUE_TABLES],
    );
    // Only SELECT policies exist — no consumer write path at all.
    expect(policies.rows.length).toBeGreaterThan(0);
    expect(policies.rows.every((row) => row.cmd === 'SELECT')).toBe(true);
  });

  it('lets any authenticated user read catalogue rows', async () => {
    await seedCatalogue(db);
    await asUser(db, USER_A);
    for (const table of CATALOGUE_TABLES) {
      const rows = await db.query(`select * from public.${table}`);
      expect(rows.rows.length).toBeGreaterThan(0);
    }
    await asUser(db, USER_B);
    const brands = await db.query<{ name: string }>('select name from public.brands');
    expect(brands.rows).toEqual([{ name: 'House Brand' }]);
  });

  it('denies every authenticated write to catalogue tables', async () => {
    await complete(db);
    await seedCatalogue(db);
    await asUser(db, USER_A);
    await expect(db.exec(`insert into public.brands(name) values ('Sneaky')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.products set name = 'Sneaky' where id = 'b0000000-0000-4000-8000-000000000002'`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.product_versions set ingredients = '{"x":"y"}' where id = 'b0000000-0000-4000-8000-000000000003'`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`delete from public.product_claims where id = 'b0000000-0000-4000-8000-000000000004'`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000003', 'https://example.test/x', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-01-01')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.product_verification_events(id, version_id, reviewer, reviewed_fields, status, reason) values (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000003', 'self', '{name}', 'verified', 'self-approved')`)).rejects.toThrow(/permission denied|violates/i);
  });

  it('preserves version payloads across successor links', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('b0000000-0000-4000-8000-000000000101', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000101', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    // Reformulation arrives as a successor; the original payload row is never rewritten.
    await db.exec(`insert into public.product_versions(id, product_id, variant, market, structured_directions, ingredients, lifecycle, successor_version_id) values
      ('b0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000102', 'new formula', 'ZA', '{}', '{"changed":true}', 'active', null)`);
    await db.exec(`insert into public.product_versions(id, product_id, variant, market, structured_directions, ingredients, lifecycle, successor_version_id) values
      ('b0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000102', 'original', 'ZA', '{}', null, 'active', 'b0000000-0000-4000-8000-000000000104')`);
    const original = await db.query<{ ingredients: unknown; successor_version_id: string }>(
      `select ingredients, successor_version_id from public.product_versions where id = 'b0000000-0000-4000-8000-000000000103'`,
    );
    expect(original.rows).toEqual([{ ingredients: null, successor_version_id: 'b0000000-0000-4000-8000-000000000104' }]);
    // Catalogue protects its own history: versions cannot be removed while claims reference them.
    await db.exec(`insert into public.product_claims(id, version_id, claim_key, statement) values
      ('b0000000-0000-4000-8000-000000000105', 'b0000000-0000-4000-8000-000000000103', 'name', 'Gentle Shampoo')`);
    await expect(db.exec(`delete from public.product_versions where id = 'b0000000-0000-4000-8000-000000000103'`)).rejects.toThrow(/restrict|violates/i);
  });
});

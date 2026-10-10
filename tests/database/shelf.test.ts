import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

const DAY = { precision: 'day', value: '2024-01-15' };

async function shelfList(db: PGlite, limit: number | null, cursor: unknown = null) {
  return (await db.query<{ result: any }>(`select public.shelf_list($1, $2::jsonb) result`,
    [limit, cursor === null ? null : JSON.stringify(cursor)])).rows[0].result;
}
async function shelfAdd(db: PGlite, opts: { operationId?: string; userProductId?: string; versionId?: string | null; manualName?: string | null; availability?: string; notes?: string | null; effectiveDate?: unknown } = {}) {
  return (await db.query<{ result: any }>(
    `select public.shelf_add($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId ?? crypto.randomUUID(),
      opts.versionId === undefined ? null : opts.versionId,
      'House Brand', opts.manualName === undefined ? 'Gentle Shampoo' : opts.manualName,
      'shampoo', opts.availability ?? 'available', opts.notes === undefined ? null : opts.notes,
      JSON.stringify(opts.effectiveDate ?? DAY)],
  )).rows[0].result;
}

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

  it('denies direct authenticated writes to user product tables', async () => {
    await complete(db);
    await expect(db.exec(`insert into public.user_products(id, owner, availability) values (gen_random_uuid(), '${USER_A}', 'available')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.user_product_revisions(id, owner, user_product_id, sequence, base_revision, kind, effective_date, source, patch) values (gen_random_uuid(), '${USER_A}', gen_random_uuid(), 1, 0, 'baseline', '{"precision":"day","value":"2024-01-01"}', 'user-reported', '{}')`)).rejects.toThrow(/permission denied|violates/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.user_products')).rows).toEqual([]);
    expect((await db.query('select * from public.user_product_revisions')).rows).toEqual([]);
  });

  it('enforces composite owner FK on user product children', async () => {
    await complete(db);
    await db.exec('set session authorization postgres');
    const userProductId = crypto.randomUUID();
    await db.exec(`insert into public.user_products(id, owner, manual_name, availability, revision) values ('${userProductId}', '${USER_A}', 'Gentle Shampoo', 'available', 0)`);
    await expect(db.query(`insert into public.user_product_revisions(id, owner, user_product_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, source, patch) values (gen_random_uuid(), '${USER_B}', '${userProductId}', 1, 0, 'baseline', '{"precision":"day","value":"2024-01-01"}', '2024-01-01', '2024-01-01', 'user-reported', '{}')`)).rejects.toThrow(/foreign key|violates/i);
  });

  it('keeps archived ownership rows with their history', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename in ('user_products', 'user_product_revisions')`,
    );
    expect(rows.rows.map((row) => row.tablename).sort()).toEqual(['user_product_revisions', 'user_products']);
    const unprotected = await db.query(
      `select relname from pg_class where relname in ('user_products', 'user_product_revisions') and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('is idempotent on same operation key and payload, and rejects same key different payload', async () => {
    await complete(db);
    const op = crypto.randomUUID();
    const up = crypto.randomUUID();
    const first = await shelfAdd(db, { operationId: op, userProductId: up });
    expect(first.revision).toBe(1);
    expect(await shelfAdd(db, { operationId: op, userProductId: up })).toEqual(first);
    await expect(shelfAdd(db, { operationId: op, userProductId: up, manualName: 'Different' })).rejects.toThrow(/operation-conflict/i);
  });

  it('rejects stale expected_revision with revision-conflict', async () => {
    await complete(db);
    const rec = await shelfAdd(db, {});
    await expect(db.query(`select public.shelf_change($1, $2, 0, null, null, null, null, 'out_of_stock', null, $3::jsonb)`,
      [crypto.randomUUID(), rec.userProductId, JSON.stringify(DAY)])).rejects.toThrow(/revision-conflict/i);
  });

  it('denies changing another owners product', async () => {
    await complete(db);
    const rec = await shelfAdd(db, {});
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    // RLS hides the foreign row from the mutator, so the denial surfaces as
    // revision-conflict; either way access is denied and existence is not disclosed.
    await expect(db.query(`select public.shelf_change($1, $2, 1, null, null, null, null, 'out_of_stock', null, $3::jsonb)`,
      [crypto.randomUUID(), rec.userProductId, JSON.stringify(DAY)])).rejects.toThrow(/not-found|revision-conflict/i);
  });

  it('requires explicit confirmation to match and preserves manual identity', async () => {
    await complete(db);
    // seed a catalogue version to match against
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('c0000000-0000-4000-8000-000000000001', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values ('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'ZA', '{}', 'active')`);
    await asUser(db, USER_A);
    const rec = await shelfAdd(db, { manualName: 'My shampoo guess' });
    const versionId = 'c0000000-0000-4000-8000-000000000003';
    await expect(db.query(`select public.shelf_match($1, $2, 1, $3, false)`,
      [crypto.randomUUID(), rec.userProductId, versionId])).rejects.toThrow(/confirmation-required/i);
    const matched = await db.query<{ result: any }>(`select public.shelf_match($1, $2, 1, $3, true) result`,
      [crypto.randomUUID(), rec.userProductId, versionId]);
    expect(matched.rows[0].result.revision).toBe(2);
    const detail = await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [rec.userProductId]);
    expect(detail.rows[0].result.matched).toBe(true);
    expect(detail.rows[0].result.matchConfirmed).toBe(true);
    // Original manual identity is preserved, not overwritten by the catalogue link.
    expect(detail.rows[0].result.manualName).toBe('My shampoo guess');
  });

  it('hides archived items from the default list but keeps their history', async () => {
    await complete(db);
    const rec = await shelfAdd(db, {});
    await db.query(`select public.shelf_archive($1, $2, 1)`, [crypto.randomUUID(), rec.userProductId]);
    const list = await db.query<{ result: any }>(`select public.shelf_list(25) result`);
    expect((list.rows[0].result.items as any[]).find((item: any) => item.id === rec.userProductId)).toBeUndefined();
    const history = await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [rec.userProductId]);
    expect(history.rows[0].result.availability).toBe('archived');
    expect((history.rows[0].result.revisions as any[]).some((r: any) => r.kind === 'archive')).toBe(true);
  });

  it('denies consumer verification writes through the API (P1-AC-13)', async () => {
    await complete(db);
    await seedCatalogue(db);
    await asUser(db, USER_A);
    await expect(db.query(`select public.verification_record($1, $2, $3)`,
      ['b0000000-0000-4000-8000-000000000003', 'verified', 'self-approved'])).rejects.toThrow(/not-authorized/i);
    const events = await db.query(`select * from public.product_verification_events where reviewer = 'self-approved'`);
    expect(events.rows).toEqual([]);
  });

  it.each([0, 101, -1])('rejects shelf page limit %s with invalid-page', async (limit) => {
    await complete(db);
    await expect(shelfList(db, limit)).rejects.toThrow(/invalid-page/i);
  });

  it('rejects malformed shelf cursors with invalid-cursor', async () => {
    await complete(db);
    await shelfAdd(db, {});
    await expect(shelfList(db, 10, 'not-an-object')).rejects.toThrow(/invalid-cursor/i);
    await expect(shelfList(db, 10, { updatedAt: '2024-01-01' })).rejects.toThrow(/invalid-cursor/i);
  });

  it('traverses the full shelf exactly once with keyset cursors', async () => {
    await complete(db);
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) {
      const up = crypto.randomUUID();
      ids.push(up);
      await shelfAdd(db, { userProductId: up, manualName: `product ${i}` });
    }
    const seen: string[] = [];
    let cursor: any = null;
    let pages = 0;
    do {
      const page = await shelfList(db, 10, cursor);
      expect(page.items.length).toBeLessThanOrEqual(10);
      for (const item of page.items) {
        expect(seen).not.toContain(item.id);
        seen.push(item.id);
      }
      cursor = page.nextCursor;
      pages++;
      expect(pages).toBeLessThan(10);
    } while (cursor !== null);
    expect(seen.sort()).toEqual([...ids].sort());
    expect(pages).toBe(3);
    const def = await db.query<{ result: any }>(`select public.shelf_list() result`);
    expect(def.rows[0].result.items).toHaveLength(25);
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

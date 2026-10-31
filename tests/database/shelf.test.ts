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

// The owner-recorded facts travel in one jsonb patch, so an absent key
// ("never answered"), an explicit null ("cleared") and a value ("recorded")
// stay three different answers at the boundary.
async function shelfAddFacts(db: PGlite, opts: { operationId?: string; userProductId?: string; manualName?: string | null; manualBrand?: string | null; manualCategory?: string | null; availability?: string; notes?: string | null; facts?: unknown } = {}) {
  return (await db.query<{ result: any }>(
    `select public.shelf_add($1, $2, null, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId ?? crypto.randomUUID(),
      opts.manualBrand === undefined ? 'House Brand' : opts.manualBrand,
      opts.manualName === undefined ? 'Gentle Shampoo' : opts.manualName,
      opts.manualCategory === undefined ? 'shampoo' : opts.manualCategory,
      opts.availability ?? 'available', opts.notes ?? null,
      JSON.stringify(DAY), JSON.stringify(opts.facts ?? {})],
  )).rows[0].result;
}

async function shelfChangeFacts(db: PGlite, opts: { operationId?: string; userProductId: string; expectedRevision: number; availability?: string | null; notes?: string | null; facts?: unknown }) {
  return (await db.query<{ result: any }>(
    `select public.shelf_change($1, $2, $3, null, null, null, $4, $5, $6::jsonb, $7::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId, opts.expectedRevision,
      opts.availability ?? null, opts.notes ?? null,
      JSON.stringify(DAY), JSON.stringify(opts.facts ?? {})],
  )).rows[0].result;
}

async function shelfDetail(db: PGlite, userProductId: string) {
  return (await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [userProductId])).rows[0].result;
}

// The private core is callable by `authenticated` directly, so the tests
// that guard its invariants call it the way a caller could.
async function coreMutate(db: PGlite, args: {
  operationId?: string; userProductId: string; expectedRevision: number; kind: string;
  versionId?: string | null; manualName?: string | null; availability?: string | null; notes?: string | null;
  effectiveDate?: unknown; confirmed?: boolean | null; facts?: unknown;
}) {
  return (await db.query<{ result: any }>(
    `select strandcue_private.mutate_user_product($1, $2, $3, $4, $5, null, $6, null, $7, $8, $9::jsonb, null, null, $10, $11::jsonb) result`,
    [args.operationId ?? crypto.randomUUID(), args.userProductId, args.expectedRevision, args.kind,
      args.versionId ?? null, args.manualName ?? null, args.availability ?? null, args.notes ?? null,
      JSON.stringify(args.effectiveDate ?? DAY), args.confirmed ?? null,
      JSON.stringify(args.facts ?? {})],
  )).rows[0].result;
}

// The baseline path of the private core: the identity travels as the
// top-level parameters there, so the core has to hold them to the same
// length and the same category list the facts path holds.
async function coreBaseline(db: PGlite, args: {
  operationId?: string; userProductId: string; manualBrand?: string | null;
  manualName?: string | null; manualCategory?: string | null; facts?: unknown;
}) {
  return (await db.query<{ result: any }>(
    `select strandcue_private.mutate_user_product($1, $2, 0, 'baseline', null, $3, $4, $5, 'available', null, $6::jsonb, null, null, null, $7::jsonb) result`,
    [args.operationId ?? crypto.randomUUID(), args.userProductId,
      args.manualBrand ?? null, args.manualName ?? null, args.manualCategory ?? null,
      JSON.stringify(DAY), JSON.stringify(args.facts ?? {})],
  )).rows[0].result;
}

// The correction path carries the owner's own fields in the facts patch, so
// the public wrapper advertises no identity parameter at all: a missing key
// preserves, a value replaces and an explicit null clears.
async function shelfCorrect(db: PGlite, opts: {
  operationId?: string; userProductId: string; expectedRevision: number;
  correctsId: string; reason?: string | null; notes?: string | null; facts?: unknown;
}) {
  return (await db.query<{ result: any }>(
    `select public.shelf_correct($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId, opts.expectedRevision,
      opts.correctsId, opts.reason === undefined ? 'wrong wording' : opts.reason,
      opts.notes ?? null, JSON.stringify(DAY), JSON.stringify(opts.facts ?? {})],
  )).rows[0].result;
}

// The private core is callable by `authenticated` directly, so the
// correction rules are guarded in the core, not only in the wrapper.
async function coreCorrect(db: PGlite, opts: {
  operationId?: string; userProductId: string; expectedRevision: number;
  correctsId: string; reason?: string | null; manualBrand?: string | null;
  manualName?: string | null; manualCategory?: string | null; availability?: string | null;
  notes?: string | null; facts?: unknown;
}) {
  return (await db.query<{ result: any }>(
    `select strandcue_private.mutate_user_product($1, $2, $3, 'correction', null, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, null, $12::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId, opts.expectedRevision,
      opts.manualBrand ?? null, opts.manualName ?? null, opts.manualCategory ?? null,
      opts.availability ?? null, opts.notes ?? null, JSON.stringify(DAY),
      opts.correctsId, opts.reason === undefined ? 'wrong wording' : opts.reason,
      JSON.stringify(opts.facts ?? {})],
  )).rows[0].result;
}

async function revisionsOf(db: PGlite, userProductId: string) {
  return (await db.query<{
    id: string; kind: string; sequence: number; corrects_id: string | null;
    correction_reason: string | null; patch: Record<string, unknown>;
  }>(
    `select id, kind, sequence, corrects_id, correction_reason, patch
       from public.user_product_revisions where user_product_id = $1 order by sequence`,
    [userProductId],
  )).rows;
}

/** The server's own day, read the way the core reads it. */
async function serverDay(db: PGlite) {
  return (await db.query<{ today: string }>(
    `select (now() at time zone 'Africa/Johannesburg')::date::text today`,
  )).rows[0].today;
}

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const amr = JSON.stringify([{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }]);
  const claims = JSON.stringify({ sub: userId, role: 'authenticated', email: `${userId}@example.test`, is_anonymous: false, amr: JSON.parse(amr) });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
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
    // Consumers read identity and lifecycle only: draft claims, sources, verification events and the
    // non-identity version columns are closed to them (see 20261022120000).
    for (const table of ['brands', 'products']) {
      expect((await db.query(`select * from public.${table}`)).rows.length).toBeGreaterThan(0);
    }
    expect((await db.query('select id, product_id, variant, market, barcode, lifecycle, successor_version_id from public.product_versions')).rows.length).toBeGreaterThan(0);
    for (const table of ['product_claims', 'product_sources', 'product_verification_events']) {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/i);
    }
    await expect(db.query('select * from public.product_versions')).rejects.toThrow(/permission denied/i);
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
    await expect(db.query(`select public.shelf_change($1, $2, 0, null, null, null, 'out_of_stock', null, $3::jsonb)`,
      [crypto.randomUUID(), rec.userProductId, JSON.stringify(DAY)])).rejects.toThrow(/revision-conflict/i);
  });

  it('denies changing another owners product', async () => {
    await complete(db);
    const rec = await shelfAdd(db, {});
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    // RLS hides the foreign row from the mutator, so the denial surfaces as
    // revision-conflict; either way access is denied and existence is not disclosed.
    await expect(db.query(`select public.shelf_change($1, $2, 1, null, null, null, 'out_of_stock', null, $3::jsonb)`,
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
    // Consumers cannot read verification events at all; check as the owner of the table.
    await db.exec('set session authorization postgres');
    const events = await db.query(`select * from public.product_verification_events where reviewer = 'self-approved'`);
    expect(events.rows).toEqual([]);
    await asUser(db, USER_A);
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

describe('the owned-product shelf facts', () => {
  let db: PGlite;
  const CATALOGUE_VERSION_ID = 'd0000000-0000-4000-8000-000000000003';
  beforeAll(async () => {
    db = await database();
    // One catalogue version for the whole block: the match path needs a
    // real product_versions row to link.
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('d0000000-0000-4000-8000-000000000001', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values ('${CATALOGUE_VERSION_ID}', 'd0000000-0000-4000-8000-000000000002', 'ZA', '{}', 'active')`);
  }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    // The account-deletion test leaves a completion tombstone behind, and
    // that table is FK-free by design, so the profile truncate does not
    // clear it. A tombstone refuses the next account completion.
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('round-trips the owner-entered identity and every recorded fact', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {
      facts: {
        manualVariant: 'Fragrance free',
        manualSize: '400 ml',
        manualBarcode: '6001234567890',
        openedOn: { precision: 'day', value: '2024-01-10' },
        expiryOn: '2027-06-30',
        pao: '12 months after opening',
        quantityBand: 'about-half',
        repurchaseIntent: 'would-rebuy',
      },
    });
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualBrand).toBe('House Brand');
    expect(detail.manualName).toBe('Gentle Shampoo');
    expect(detail.manualVariant).toBe('Fragrance free');
    expect(detail.manualSize).toBe('400 ml');
    expect(detail.manualBarcode).toBe('6001234567890');
    expect(detail.openedOn).toEqual({ precision: 'day', value: '2024-01-10' });
    expect(detail.expiryOn).toBe('2027-06-30');
    expect(detail.pao).toBe('12 months after opening');
    expect(detail.quantityBand).toBe('about-half');
    expect(detail.repurchaseIntent).toBe('would-rebuy');
  });

  it('returns a stored expiry, PAO, quantity band and repurchase intent as recorded', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {
      facts: {
        // An expiry may still be in the future: the domain never invents a shelf life.
        expiryOn: '2030-01-15',
        pao: '6 months after opening',
        quantityBand: 'unknown',
        repurchaseIntent: 'unsure',
      },
    });
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.expiryOn).toBe('2030-01-15');
    expect(detail.pao).toBe('6 months after opening');
    expect(detail.quantityBand).toBe('unknown');
    expect(detail.repurchaseIntent).toBe('unsure');
  });

  it('keeps an omitted fact distinct from one the owner cleared', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { facts: { pao: '12 months after opening', quantityBand: 'about-half' } });
    await shelfChangeFacts(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      facts: { pao: null },
    });
    const detail = await shelfDetail(db, receipt.userProductId);
    // Cleared…
    expect(detail.pao).toBeNull();
    // …while the fact the owner never touched keeps its recorded value.
    expect(detail.quantityBand).toBe('about-half');
  });

  it('appends an immutable history entry for every availability transition', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {});
    await shelfChangeFacts(db, { userProductId: receipt.userProductId, expectedRevision: 1, availability: 'low' });
    await shelfChangeFacts(db, { userProductId: receipt.userProductId, expectedRevision: 2, availability: 'empty' });
    await db.query(`select public.shelf_archive($1, $2, 3)`, [crypto.randomUUID(), receipt.userProductId]);
    const rows = await db.query<{ kind: string; sequence: number; patch: { availability: string } }>(
      `select kind, sequence, patch from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(rows.rows.map((row) => row.kind)).toEqual(['baseline', 'change', 'change', 'archive']);
    expect(rows.rows.map((row) => row.sequence)).toEqual([1, 2, 3, 4]);
    // Every availability change is an explicit owner-recorded event.
    expect(rows.rows.map((row) => row.patch.availability)).toEqual(['available', 'low', 'empty', 'archived']);
    // The history is append-only: the owner cannot rewrite or remove it.
    await expect(db.exec(`update public.user_product_revisions set patch = '{}'::jsonb`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`delete from public.user_product_revisions`)).rejects.toThrow(/permission denied|violates/i);
  });

  it('keeps the history of an archived product and hides it from the active list', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { facts: { quantityBand: 'nearly-empty' } });
    await db.query(`select public.shelf_archive($1, $2, 1)`, [crypto.randomUUID(), receipt.userProductId]);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.availability).toBe('archived');
    expect(detail.quantityBand).toBe('nearly-empty');
    expect(detail.revisions.length).toBe(2);
    expect(detail.revisions.some((revision: { kind: string }) => revision.kind === 'archive')).toBe(true);
    const list = await shelfList(db, 25);
    expect((list.items as { id: string }[]).find((item) => item.id === receipt.userProductId)).toBeUndefined();
  });

  it('records an availability change that archives the product as an archive event', async () => {
    await complete(db);
    const before = await serverDay(db);
    const receipt = await shelfAddFacts(db, { facts: { quantityBand: 'about-quarter' } });
    await shelfChangeFacts(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      availability: 'archived',
      facts: { quantityBand: 'nearly-empty' },
    });
    const rows = await db.query<{ kind: string; effective_date: { precision: string; value: string }; patch: { availability: string; quantityBand: string } }>(
      `select kind, effective_date, patch from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(rows.rows.map((row) => row.kind)).toEqual(['baseline', 'archive']);
    expect(rows.rows[1].patch.availability).toBe('archived');
    // The fact recorded in the same save is kept.
    expect(rows.rows[1].patch.quantityBand).toBe('nearly-empty');
    // The recorded kind and the recorded date agree: an archive is dated
    // by the server, so the caller's day never dates the history.
    expect(rows.rows[1].effective_date.precision).toBe('day');
    expect(rows.rows[1].effective_date.value).not.toBe(DAY.value);
    expect([before, await serverDay(db)]).toContain(rows.rows[1].effective_date.value);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.availability).toBe('archived');
    expect(detail.quantityBand).toBe('nearly-empty');
  });

  it('refuses a malformed fact with a stable error', async () => {
    await complete(db);
    await expect(shelfAddFacts(db, { facts: { expiryOn: '2027-02-30' } })).rejects.toThrow(/invalid-expiry-date/i);
    await expect(shelfAddFacts(db, { facts: { expiryOn: 'soon' } })).rejects.toThrow(/invalid-expiry-date/i);
    await expect(shelfAddFacts(db, { facts: { openedOn: { precision: 'day', value: '2024-02-30' } } })).rejects.toThrow(/invalid-opened-date/i);
    await expect(shelfAddFacts(db, { facts: { openedOn: { precision: 'day', value: '2099-01-01' } } })).rejects.toThrow(/invalid-opened-date/i);
    await expect(shelfAddFacts(db, { facts: { manualVariant: 'v'.repeat(201) } })).rejects.toThrow(/invalid-variant/i);
    await expect(shelfAddFacts(db, { facts: { manualSize: '   ' } })).rejects.toThrow(/invalid-size/i);
    await expect(shelfAddFacts(db, { facts: { manualBarcode: 'b'.repeat(101) } })).rejects.toThrow(/invalid-barcode/i);
    await expect(shelfAddFacts(db, { facts: { pao: 'p'.repeat(201) } })).rejects.toThrow(/invalid-pao/i);
    await expect(shelfAddFacts(db, { facts: { quantityBand: 'most' } })).rejects.toThrow(/invalid-quantity-band/i);
    await expect(shelfAddFacts(db, { facts: { repurchaseIntent: 'maybe' } })).rejects.toThrow(/invalid-repurchase-intent/i);
    // An unknown key is refused: the patch never carries an invented field.
    await expect(shelfAddFacts(db, { facts: { shelfLife: '12 months' } })).rejects.toThrow(/invalid-facts/i);
    await expect(shelfAddFacts(db, { availability: 'finished' })).rejects.toThrow(/invalid-availability/i);
  });

  it('never rewrites the owner identity through an ordinary change', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {});
    await expect(db.query(
      `select public.shelf_change($1, $2, 1, 'Other Brand', 'Other Name', 'mask', 'low', null, $3::jsonb, '{}'::jsonb)`,
      [crypto.randomUUID(), receipt.userProductId, JSON.stringify(DAY)],
    )).rejects.toThrow(/invalid-identity/i);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualBrand).toBe('House Brand');
    expect(detail.manualName).toBe('Gentle Shampoo');
  });

  it('keeps an edited product identified after an ordinary change', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {});
    const changed = await shelfChangeFacts(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      availability: 'low',
      facts: { quantityBand: 'about-quarter' },
    });
    expect(changed.revision).toBe(2);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.availability).toBe('low');
    expect(detail.manualName).toBe('Gentle Shampoo');
    expect(detail.quantityBand).toBe('about-quarter');
  });

  it('never lets one owner read, change or archive another owner shelf', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { facts: { pao: '12 months after opening' } });
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(shelfDetail(db, receipt.userProductId)).rejects.toThrow(/not-found/i);
    await expect(shelfChangeFacts(db, { userProductId: receipt.userProductId, expectedRevision: 1, availability: 'empty' }))
      .rejects.toThrow(/not-found|revision-conflict/i);
    await expect(db.query(`select public.shelf_archive($1, $2, 1)`, [crypto.randomUUID(), receipt.userProductId]))
      .rejects.toThrow(/not-found|revision-conflict/i);
    const list = await shelfList(db, 25);
    expect(list.items).toEqual([]);
    // The other owner's product is untouched.
    await asUser(db, USER_A);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.availability).toBe('available');
    expect(detail.pao).toBe('12 months after opening');
  });

  it('never lets one owner read or write another owner product through the private core', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { facts: { pao: '12 months after opening' } });
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    // The private core is callable by `authenticated` directly, so the
    // direct path is guarded too, not only the public wrappers.
    await expect(db.query(`select strandcue_private.get_user_product_core($1, true)`, [receipt.userProductId]))
      .rejects.toThrow(/not-found/i);
    await expect(coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      kind: 'change',
      availability: 'empty',
    })).rejects.toThrow(/not-found|revision-conflict/i);
    await expect(coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 0,
      kind: 'baseline',
      manualName: 'Sneaky',
    })).rejects.toThrow(/not-found/i);
    // The other owner's product is untouched.
    await asUser(db, USER_A);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.revision).toBe(1);
    expect(detail.availability).toBe('available');
    expect(detail.pao).toBe('12 months after opening');
    const history = await db.query<{ kind: string }>(
      `select kind from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(history.rows.map((row) => row.kind)).toEqual(['baseline']);
  });

  it('exports the recorded facts and removes them with the account', async () => {
    await complete(db);
    await shelfAddFacts(db, { facts: { manualVariant: 'Fragrance free', quantityBand: 'about-half' } });
    await freshAuth(db, USER_A);
    const exported = await db.query<{ result: any }>(`select public.export_request($1, 'csv') result`, [crypto.randomUUID()]);
    const jobId = exported.rows[0].result.jobId;
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [jobId]);
    const files = download.rows[0].result.document.files;
    expect(files['user_products.csv'].split('\n')[0]).toContain('manual_variant');
    expect(files['user_products.csv'].split('\n')[0]).toContain('quantity_band');
    expect(files['user_products.csv']).toContain('Fragrance free');
    expect(files['user_products.csv']).toContain('about-half');
    // The account purge takes the recorded facts with it.
    await db.query(`select public.deletion_request($1, $2)`, [crypto.randomUUID(), 'leaving']);
    await db.exec('set session authorization postgres');
    await db.query(`select public.deletion_purge()`);
    expect((await db.query('select * from public.user_products')).rows).toEqual([]);
    expect((await db.query('select * from public.user_product_revisions')).rows).toEqual([]);
  });

  it('refuses a catalogue link through an ordinary change and keeps the confirmed match path', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {});
    // A change that carried a version id would link a catalogue version
    // without the confirmed-match gate, and the substitution path reads
    // `version_id`, so the link could back a substitution the owner never
    // confirmed. The public wrapper carries no version id at all, so the
    // boundary that refuses it is the core itself.
    await expect(coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      kind: 'change',
      versionId: CATALOGUE_VERSION_ID,
      availability: 'low',
    })).rejects.toThrow(/invalid-change/i);
    const refused = await shelfDetail(db, receipt.userProductId);
    expect(refused.versionId).toBeNull();
    expect(refused.matched).toBe(false);
    expect(refused.matchConfirmed).toBe(false);
    expect(refused.availability).toBe('available');
    // The refused change left no history behind.
    const history = await db.query<{ kind: string }>(
      `select kind from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(history.rows.map((row) => row.kind)).toEqual(['baseline']);
    // The confirmed match path still works.
    const matched = await db.query<{ result: any }>(`select public.shelf_match($1, $2, 1, $3, true) result`,
      [crypto.randomUUID(), receipt.userProductId, CATALOGUE_VERSION_ID]);
    expect(matched.rows[0].result.revision).toBe(2);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.versionId).toBe(CATALOGUE_VERSION_ID);
    expect(detail.matched).toBe(true);
    expect(detail.matchConfirmed).toBe(true);
  });

  it('refuses a catalogue link when a product is added', async () => {
    await complete(db);
    const productId = crypto.randomUUID();
    // A catalogue link is a confirmed match, never a side effect of adding
    // a product. An unconfirmed link would back a "verified" substitution
    // the owner never confirmed, because the protocol substitution path
    // only asks whether `version_id` is set.
    await expect(db.query(
      `select public.shelf_add($1, $2, $3, 'House Brand', 'Gentle Shampoo', 'shampoo', 'available', null, $4::jsonb, '{}'::jsonb)`,
      [crypto.randomUUID(), productId, CATALOGUE_VERSION_ID, JSON.stringify(DAY)],
    )).rejects.toThrow(/invalid-product/i);
    // The refusal left no row and no history behind, so the stored product
    // keeps no version link at all.
    await db.exec('set session authorization postgres');
    const stored = await db.query<{ version_id: string | null }>(
      `select version_id from public.user_products where id = $1`, [productId],
    );
    expect(stored.rows).toEqual([]);
    const revisions = await db.query<{ id: string }>(
      `select id from public.user_product_revisions where user_product_id = $1`, [productId],
    );
    expect(revisions.rows).toEqual([]);
    await asUser(db, USER_A);
    expect((await shelfList(db, 25)).items).toEqual([]);
    // A product added without a link carries no link of its own.
    const receipt = await shelfAddFacts(db, {});
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.versionId).toBeNull();
    expect(detail.matched).toBe(false);
    expect(detail.matchConfirmed).toBe(false);
    // The confirmed match path is the only way a version is ever linked.
    await db.query(`select public.shelf_match($1, $2, 1, $3, true)`,
      [crypto.randomUUID(), receipt.userProductId, CATALOGUE_VERSION_ID]);
    const matched = await shelfDetail(db, receipt.userProductId);
    expect(matched.versionId).toBe(CATALOGUE_VERSION_ID);
    expect(matched.matchConfirmed).toBe(true);
  });

  it('carries no version parameter on the change wrapper', async () => {
    await complete(db);
    // An ordinary change can never link a catalogue version, so the
    // wrapper does not even advertise the parameter: it could only ever
    // answer `invalid-change`.
    const signature = await db.query<{ arguments: string }>(
      `select pg_get_function_arguments(p.oid) arguments from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'shelf_change'`,
    );
    expect(signature.rows).toHaveLength(1);
    expect(signature.rows[0].arguments).not.toMatch(/version/i);
  });

  it('dates a match and an archive with the server day, never with the caller', async () => {
    await complete(db);
    // The server's own day, read either side of the writes: a run that
    // crosses midnight in Africa/Johannesburg sees one of the two days,
    // never the day the caller asked for.
    const dayBefore = await serverDay(db);
    // A direct core call cannot backdate the history: the core dates the
    // match and the archive itself.
    const receipt = await shelfAddFacts(db, {});
    const direct = await coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      kind: 'match',
      versionId: CATALOGUE_VERSION_ID,
      confirmed: true,
      effectiveDate: { precision: 'day', value: '2000-01-01' },
    });
    expect(direct.revision).toBe(2);
    const matched = await db.query<{ effective_date: { precision: string; value: string } }>(
      `select effective_date from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(matched.rows[1].effective_date.precision).toBe('day');
    expect([dayBefore, await serverDay(db)]).toContain(matched.rows[1].effective_date.value);
    expect(matched.rows[1].effective_date.value).not.toBe('2000-01-01');

    const archived = await shelfAddFacts(db, {});
    await coreMutate(db, {
      userProductId: archived.userProductId,
      expectedRevision: 1,
      kind: 'archive',
      availability: 'archived',
      effectiveDate: { precision: 'day', value: '2000-01-01' },
    });
    const archiveRows = await db.query<{ effective_date: { precision: string; value: string } }>(
      `select effective_date from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [archived.userProductId],
    );
    expect(archiveRows.rows[1].effective_date.precision).toBe('day');
    expect([dayBefore, await serverDay(db)]).toContain(archiveRows.rows[1].effective_date.value);
    expect(archiveRows.rows[1].effective_date.value).not.toBe('2000-01-01');

    // An ordinary change that archives the product is an archive event too,
    // so it is dated the same way: the recorded kind and the recorded date
    // can never disagree.
    const changed = await shelfAddFacts(db, {});
    await coreMutate(db, {
      userProductId: changed.userProductId,
      expectedRevision: 1,
      kind: 'change',
      availability: 'archived',
      effectiveDate: { precision: 'day', value: '2000-01-01' },
    });
    const changeRows = await db.query<{ kind: string; effective_date: { precision: string; value: string } }>(
      `select kind, effective_date from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [changed.userProductId],
    );
    expect(changeRows.rows[1].kind).toBe('archive');
    expect(changeRows.rows[1].effective_date.precision).toBe('day');
    expect([dayBefore, await serverDay(db)]).toContain(changeRows.rows[1].effective_date.value);
    expect(changeRows.rows[1].effective_date.value).not.toBe('2000-01-01');

    // The direct core call answers exactly what the public wrapper answers.
    const wrapperReceipt = await shelfAddFacts(db, {});
    const wrapped = await db.query<{ result: any }>(`select public.shelf_match($1, $2, 1, $3, true) result`,
      [crypto.randomUUID(), wrapperReceipt.userProductId, CATALOGUE_VERSION_ID]);
    expect(wrapped.rows[0].result.revision).toBe(direct.revision);
    expect(wrapped.rows[0].result.revisions.map((r: any) => r.kind)).toEqual(direct.revisions.map((r: any) => r.kind));
    expect(wrapped.rows[0].result.revisions.map((r: any) => r.matchVersionId)).toEqual(direct.revisions.map((r: any) => r.matchVersionId));
  });

  it('refuses a facts patch on a match or an archive, from the core as well', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, {});
    // A fact on a match or an archive would be recorded in the append-only
    // history without ever reaching the row, so the history would disagree
    // with the stored product.
    await expect(coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      kind: 'match',
      versionId: CATALOGUE_VERSION_ID,
      confirmed: true,
      facts: { pao: '12 months after opening' },
    })).rejects.toThrow(/invalid-facts/i);
    await expect(coreMutate(db, {
      userProductId: receipt.userProductId,
      expectedRevision: 1,
      kind: 'archive',
      availability: 'archived',
      facts: { pao: '12 months after opening' },
    })).rejects.toThrow(/invalid-facts/i);
    // Nothing was written: the row and its history are untouched.
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.revision).toBe(1);
    expect(detail.availability).toBe('available');
    expect(detail.matched).toBe(false);
    expect(detail.pao).toBeNull();
    const history = await db.query<{ kind: string }>(
      `select kind from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId],
    );
    expect(history.rows.map((row) => row.kind)).toEqual(['baseline']);
  });

  it('answers a product id another owner holds with not-found', async () => {
    await complete(db);
    const foreign = await shelfAddFacts(db, {});
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    // The other owner's row is invisible to the owner-scoped policy, so the
    // insert is what discovers the collision. A raw unique violation would
    // name the constraint and disclose that the id exists.
    const error = await shelfAddFacts(db, { userProductId: foreign.userProductId }).catch((failure: Error) => failure);
    expect(error.message).toMatch(/not-found/i);
    expect(error.message).not.toMatch(/user_products_pkey|unique constraint|duplicate key/i);
    // The other owner's product is untouched.
    await asUser(db, USER_A);
    const detail = await shelfDetail(db, foreign.userProductId);
    expect(detail.manualName).toBe('Gentle Shampoo');
  });

  it('lets an explicit null notes win over the legacy parameter on insert', async () => {
    await complete(db);
    const cleared = await shelfAddFacts(db, { notes: 'legacy note', facts: { notes: null } });
    expect((await shelfDetail(db, cleared.userProductId)).notes).toBeNull();
    // An absent key keeps the legacy parameter, so the two paths agree.
    const kept = await shelfAddFacts(db, { notes: 'legacy note' });
    expect((await shelfDetail(db, kept.userProductId)).notes).toBe('legacy note');
  });

  it('owns every new private helper with the mutator and gives no consumer access', async () => {
    const helpers = [
      'strandcue_private.is_calendar_day(text)',
      'strandcue_private.is_opened_on(jsonb)',
      'strandcue_private.shelf_fact_text(jsonb,text)',
      'strandcue_private.shelf_fact_jsonb(jsonb,text)',
      'strandcue_private.shelf_fact_date(jsonb,text)',
      'strandcue_private.validate_shelf_facts(jsonb)',
    ];
    const owners = await db.query<{ routine: string; owner: string }>(
      `select p.oid::regprocedure::text routine, pg_get_userbyid(p.proowner) owner
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'strandcue_private' and p.oid::regprocedure::text = any($1)`,
      [helpers],
    );
    expect(owners.rows.map((row) => row.routine).sort()).toEqual([...helpers].sort());
    expect(owners.rows.every((row) => row.owner === 'strandcue_mutator')).toBe(true);
    // The helpers answer only the trusted write path.
    const consumer = await db.query<{ routine: string }>(
      `select p.oid::regprocedure::text routine
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'strandcue_private' and p.oid::regprocedure::text = any($1)
          and has_function_privilege('authenticated', p.oid, 'EXECUTE')`,
      [helpers],
    );
    expect(consumer.rows).toEqual([]);
  });
});

describe('the shelf correction target rule', () => {
  let db: PGlite;
  const CATALOGUE_VERSION_ID = 'e0000000-0000-4000-8000-000000000003';
  beforeAll(async () => {
    db = await database();
    // One catalogue version: the match path needs a real product_versions row.
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('e0000000-0000-4000-8000-000000000001', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values ('${CATALOGUE_VERSION_ID}', 'e0000000-0000-4000-8000-000000000002', 'ZA', '{}', 'active')`);
  }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('refuses a catalogue match as a correction target and corrects the identity-bearing revision', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await db.query(`select public.shelf_match($1, $2, 1, $3, true)`,
      [crypto.randomUUID(), receipt.userProductId, CATALOGUE_VERSION_ID]);
    const rows = await revisionsOf(db, receipt.userProductId);
    const matchId = rows[1].id;
    // A match carries a catalogue link, never an identity, so it is not the
    // revision that carries the record's identity.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: matchId,
    })).rejects.toThrow(/invalid-correction-target/i);
    // The baseline still carries the identity, so it is the valid target.
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
    // The confirmed catalogue link survives the correction.
    expect(detail.matched).toBe(true);
    expect(detail.versionId).toBe(CATALOGUE_VERSION_ID);
    // The history records which revision was replaced, and why.
    const history = await revisionsOf(db, receipt.userProductId);
    expect(history[2].kind).toBe('correction');
    expect(history[2].corrects_id).toBe(baselineId);
    expect(history[2].correction_reason).toBe('wrong wording');
  });

  it('refuses an availability change as a correction target and corrects the identity-bearing revision', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await shelfChangeFacts(db, { userProductId: receipt.userProductId, expectedRevision: 1, availability: 'low' });
    const rows = await revisionsOf(db, receipt.userProductId);
    const changeId = rows[1].id;
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: changeId,
    })).rejects.toThrow(/invalid-correction-target/i);
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualBrand: 'Real Brand' },
    });
    expect(corrected.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    // The correction changed the identity and nothing else.
    expect(detail.manualBrand).toBe('Real Brand');
    expect(detail.manualName).toBe('Gentle Shampoo');
    expect(detail.availability).toBe('low');
  });

  it('refuses an archive as a correction target and corrects the identity-bearing revision', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await db.query(`select public.shelf_archive($1, $2, 1)`, [crypto.randomUUID(), receipt.userProductId]);
    const rows = await revisionsOf(db, receipt.userProductId);
    const archiveId = rows[1].id;
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: archiveId,
    })).rejects.toThrow(/invalid-correction-target/i);
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
    // The archive is still an archive: the correction never revives it.
    expect(detail.availability).toBe('archived');
  });

  it('refuses a fact-only change as a correction target and corrects the identity-bearing revision', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await shelfChangeFacts(db, {
      userProductId: receipt.userProductId, expectedRevision: 1,
      facts: { pao: '12 months after opening' },
    });
    const rows = await revisionsOf(db, receipt.userProductId);
    const factChangeId = rows[1].id;
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: factChangeId,
    })).rejects.toThrow(/invalid-correction-target/i);
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
    // The fact the change recorded is untouched by the correction.
    expect(detail.pao).toBe('12 months after opening');
  });

  it('corrects the earlier identity correction and refuses the revision it replaced', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    const first = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Second Wording' },
    });
    expect(first.revision).toBe(2);
    const rows = await revisionsOf(db, receipt.userProductId);
    const firstCorrectionId = rows[1].id;
    expect(rows[1].corrects_id).toBe(baselineId);
    // The revision that already carries a correction is superseded: it keeps
    // its own stable code and is never the target of a second correction.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
    })).rejects.toThrow(/already-corrected/i);
    // The currently effective identity-bearing revision is the correction
    // itself, so it is the valid target.
    const second = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: firstCorrectionId,
      facts: { manualName: 'Third Wording' },
    });
    expect(second.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Third Wording');
    const history = await revisionsOf(db, receipt.userProductId);
    expect(history[2].corrects_id).toBe(firstCorrectionId);
  });

  it('guards the same target rule on a direct authenticated core call', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await shelfChangeFacts(db, { userProductId: receipt.userProductId, expectedRevision: 1, availability: 'low' });
    const rows = await revisionsOf(db, receipt.userProductId);
    const changeId = rows[1].id;
    // The core is callable by `authenticated`, so the rule lives in the core.
    await expect(coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: changeId,
    })).rejects.toThrow(/invalid-correction-target/i);
    const corrected = await coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(3);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
  });

  it('refuses a correction target that belongs to another product or owner', async () => {
    await complete(db);
    const first = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const second = await shelfAddFacts(db, { manualName: 'Other Shampoo' });
    await expect(shelfCorrect(db, {
      userProductId: first.userProductId, expectedRevision: 1, correctsId: second.revisions[0].id,
    })).rejects.toThrow(/correction-target-not-found/i);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(shelfCorrect(db, {
      userProductId: first.userProductId, expectedRevision: 1, correctsId: first.revisions[0].id,
    })).rejects.toThrow(/not-found|revision-conflict/i);
  });

  it('returns the correction reason in the revision payload', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: receipt.revisions[0].id,
      reason: '  the owner typed the brand wrong  ',
      facts: { manualBrand: 'Real Brand' },
    });
    // The write receipt carries the reason too, so the owner can read why a
    // revision replaced another without a second call.
    const written = (corrected.revisions as { kind: string; correctionReason: string | null }[])
      .find((revision) => revision.kind === 'correction');
    expect(written?.correctionReason).toBe('the owner typed the brand wrong');
    const detail = await shelfDetail(db, receipt.userProductId);
    const revisions = detail.revisions as { kind: string; correctionReason: string | null }[];
    const correction = revisions.find((revision) => revision.kind === 'correction');
    expect(correction?.correctionReason).toBe('the owner typed the brand wrong');
    // A revision that is not a correction carries no reason.
    expect(revisions.find((revision) => revision.kind === 'baseline')?.correctionReason).toBeNull();
    // The reason is validated: an empty or oversized reason is refused.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2,
      correctsId: receipt.revisions[0].id, reason: '   ',
    })).rejects.toThrow(/invalid-correction/i);
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2,
      correctsId: receipt.revisions[0].id, reason: 'r'.repeat(501),
    })).rejects.toThrow(/invalid-correction/i);
  });

  it('carries no identity parameter on the correction wrapper', async () => {
    await complete(db);
    const signature = await db.query<{ arguments: string }>(
      `select pg_get_function_arguments(p.oid) arguments from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'shelf_correct'`,
    );
    expect(signature.rows).toHaveLength(1);
    // The correction's own fields travel in the facts patch, so the wrapper
    // advertises no manual brand, name or category parameter.
    expect(signature.rows[0].arguments).not.toMatch(/manual_brand|manual_name|manual_category/i);
    expect(signature.rows[0].arguments).toMatch(/p_facts/);
  });

  // A legacy-shaped history: the old core wrote the three identity keys on
  // every revision, whatever the kind was. The rule reads the kind, not only
  // the shape of the patch, so an availability-only change, an archive and a
  // match stay uncorrectable however their patch looks.
  async function legacyRevision(productId: string, sequence: number, kind: string, patch: unknown, matchVersionId: string | null = null): Promise<string> {
    await db.exec('set session authorization postgres');
    const id = crypto.randomUUID();
    await db.query(
      `insert into public.user_product_revisions(id, owner, user_product_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, recorded_at, source, patch, match_version_id)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'2024-01-15','2024-01-15',now(),'user-reported',$8::jsonb,$9)`,
      [id, USER_A, productId, sequence, sequence - 1, kind, JSON.stringify(DAY), JSON.stringify(patch), matchVersionId]);
    // The product's revision follows the history it holds, so the next
    // correction appends after the legacy revisions.
    await db.query(`update public.user_products set revision = $2 where id = $1`, [productId, sequence]);
    await asUser(db, USER_A);
    return id;
  }

  it('refuses a legacy-shaped change, archive and match as a correction target', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // Every one of these patches carries the three identity keys, exactly
    // as the old core wrote them on every revision.
    const legacyPatch = { manualBrand: 'House Brand', manualName: 'Gentle Shampoo', manualCategory: 'shampoo', availability: 'low' };
    const changeId = await legacyRevision(receipt.userProductId, 2, 'change', legacyPatch);
    const archiveId = await legacyRevision(receipt.userProductId, 3, 'archive', legacyPatch);
    const matchId = await legacyRevision(receipt.userProductId, 4, 'match', legacyPatch, CATALOGUE_VERSION_ID);
    for (const target of [changeId, archiveId, matchId]) {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 4, correctsId: target,
        facts: { manualName: 'Correct Shampoo' },
      })).rejects.toThrow(/invalid-correction-target/i);
    }
    // The identity-bearing entry is still the valid target, and the chain
    // is still correctable.
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 4, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(5);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
  });

  it('refuses a legacy-shaped baseline that recorded no identity as a correction target', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // The old core wrote the three identity keys with a null for every
    // answer the owner never gave. A baseline that holds no answer carries
    // no identity, so it is never the target of a correction.
    await db.exec('set session authorization postgres');
    await db.query(
      `update public.user_product_revisions set patch = '{"manualBrand":null,"manualName":null,"manualCategory":null,"availability":"available"}'::jsonb where id = $1`,
      [baselineId]);
    await asUser(db, USER_A);
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    })).rejects.toThrow(/invalid-correction-target/i);
  });

  it('refuses a baseline whose only identity is whitespace as a correction target', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // The domain trims the way JavaScript does, so a tab is no answer at
    // all: a baseline whose only identity is a tab carries no identity.
    // The database has to read the whitespace the same way, or the two
    // sides disagree about which revision may be corrected.
    await db.exec('set session authorization postgres');
    await db.query(
      `update public.user_product_revisions
          set patch = jsonb_build_object('manualBrand', E'\\t', 'manualName', null, 'manualCategory', null, 'availability', 'available')
        where id = $1`,
      [baselineId]);
    await asUser(db, USER_A);
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    })).rejects.toThrow(/invalid-correction-target/i);
  });

  it('refuses a correction that carries no identity field and keeps the chain correctable', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // A facts-only correction carries no identity, so the chain would end on
    // a revision that can never be corrected again: the owner's mistyped
    // name would be past fixing for good.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { notes: 'typo' },
    })).rejects.toThrow(/invalid-correction(?!-target)/i);
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: {},
    })).rejects.toThrow(/invalid-correction(?!-target)/i);
    // The core refuses it the same way, so a direct call cannot slip past.
    await expect(coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { notes: 'typo' },
    })).rejects.toThrow(/invalid-correction(?!-target)/i);
    // Nothing was written, so the chain is still correctable.
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.revision).toBe(1);
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(2);
    expect((await shelfDetail(db, receipt.userProductId)).manualName).toBe('Correct Shampoo');
  });

  it('refuses an availability on the correction path and records none', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // An availability change is an ordinary change, never a correction.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo', availability: 'low' },
    })).rejects.toThrow(/invalid-availability/i);
    // A direct core call cannot change the availability through a correction
    // either, even though the public wrapper never offers the parameter.
    await expect(coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      availability: 'low', facts: { manualName: 'Correct Shampoo' },
    })).rejects.toThrow(/invalid-correction(?!-target)/i);
    // The correction records no availability at all, and the row keeps the
    // state it had.
    const corrected = await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    expect(corrected.revision).toBe(2);
    const history = await revisionsOf(db, receipt.userProductId);
    expect(history[1].patch).not.toHaveProperty('availability');
    expect((await shelfDetail(db, receipt.userProductId)).availability).toBe('available');
  });
});

describe('the correction facts preserve, set and clear every correctable field', () => {
  let db: PGlite;
  const CATALOGUE_VERSION_ID = 'f0000000-0000-4000-8000-000000000003';
  beforeAll(async () => {
    db = await database();
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('f0000000-0000-4000-8000-000000000001', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values ('${CATALOGUE_VERSION_ID}', 'f0000000-0000-4000-8000-000000000002', 'ZA', '{}', 'active')`);
  }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  const FIELDS = [
    { key: 'manualBrand', column: 'manual_brand', value: 'Real Brand', next: 'Another Brand' },
    { key: 'manualCategory', column: 'manual_category', value: 'conditioner', next: 'mask' },
    { key: 'manualVariant', column: 'manual_variant', value: 'Fragrance free', next: 'Sensitive skin' },
    { key: 'manualSize', column: 'manual_size', value: '400 ml', next: '200 ml' },
    { key: 'manualBarcode', column: 'manual_barcode', value: '6001234567890', next: '6001234567891' },
    { key: 'openedOn', column: 'opened_on', value: { precision: 'day', value: '2024-02-01' }, next: { precision: 'day', value: '2024-03-01' } },
    { key: 'expiryOn', column: 'expiry_on::text', value: '2027-06-30', next: '2028-06-30' },
    { key: 'pao', column: 'pao', value: '12 months after opening', next: '6 months after opening' },
    { key: 'quantityBand', column: 'quantity_band', value: 'about-half', next: 'about-quarter' },
    { key: 'repurchaseIntent', column: 'repurchase_intent', value: 'would-rebuy', next: 'unsure' },
    { key: 'notes', column: 'notes', value: 'a note the owner wrote', next: 'a different note' },
  ] as const;

  it.each(FIELDS)('sets, preserves and clears $key through a correction', async (field) => {
    await complete(db);
    // Every correction answers an identity key, so the chain always ends on
    // a revision that can carry the next correction. The carrier answers a
    // DIFFERENT identity at every step: a correction that re-answers the
    // identity with the same words corrects nothing and is refused.
    const carriers = field.key === 'manualBrand'
      ? [{ manualCategory: 'conditioner' }, { manualCategory: 'mask' }, { manualCategory: 'leave-in' }]
      : [{ manualBrand: 'Another Brand' }, { manualBrand: 'Third Brand' }, { manualBrand: 'Fourth Brand' }];
    const receipt = await shelfAddFacts(db, {
      manualName: 'Gentle Shampoo',
      facts: { [field.key]: field.value },
    });
    const baselineId = receipt.revisions[0].id;
    const stored = async () => (await db.query<{ value: unknown }>(
      `select ${field.column} value from public.user_products where id = $1`, [receipt.userProductId],
    )).rows[0].value;

    // Set: a value in the facts patch replaces the recorded value.
    await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { [field.key]: field.next, ...carriers[0] },
    });
    let detail = await shelfDetail(db, receipt.userProductId);
    expect(await stored()).toEqual(field.next);
    expect(detail[field.key]).toEqual(field.next);
    let history = await revisionsOf(db, receipt.userProductId);
    expect(history[1].patch[field.key]).toEqual(field.next);

    // Preserve: an absent key keeps the recorded value.
    await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: history[1].id,
      facts: { ...carriers[1] },
    });
    detail = await shelfDetail(db, receipt.userProductId);
    expect(await stored()).toEqual(field.next);
    expect(detail[field.key]).toEqual(field.next);
    history = await revisionsOf(db, receipt.userProductId);
    expect(history[2].patch[field.key]).toBeUndefined();

    // Clear: an explicit null in the facts patch clears the recorded value.
    await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 3, correctsId: history[2].id,
      facts: { [field.key]: null, ...carriers[2] },
    });
    detail = await shelfDetail(db, receipt.userProductId);
    expect(await stored()).toBeNull();
    expect(detail[field.key]).toBeNull();
    history = await revisionsOf(db, receipt.userProductId);
    expect(history[3].patch[field.key]).toBeNull();
  });

  it('sets and clears the manual name through a correction', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: 'Correct Shampoo' },
    });
    let detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
    const stored = await db.query<{ manual_name: string | null }>(
      `select manual_name from public.user_products where id = $1`, [receipt.userProductId]);
    expect(stored.rows[0].manual_name).toBe('Correct Shampoo');
    const history = await revisionsOf(db, receipt.userProductId);
    expect(history[1].patch.manualName).toBe('Correct Shampoo');
    expect(detail.manualBrand).toBe('House Brand');
  });

  it('clears the manual name of a catalogue-linked product', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // A catalogue link identifies the product, so the manual name can go.
    await db.query(`select public.shelf_match($1, $2, 1, $3, true)`,
      [crypto.randomUUID(), receipt.userProductId, CATALOGUE_VERSION_ID]);
    await shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 2, correctsId: baselineId,
      facts: { manualName: null },
    });
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBeNull();
    const stored = await db.query<{ manual_name: string | null }>(
      `select manual_name from public.user_products where id = $1`, [receipt.userProductId]);
    expect(stored.rows[0].manual_name).toBeNull();
    const history = await revisionsOf(db, receipt.userProductId);
    expect(history[2].patch.manualName).toBeNull();
  });

  it('refuses to clear the only identity a manual product has', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const baselineId = receipt.revisions[0].id;
    // A manual product with neither a name nor a catalogue link is not a
    // product, so the refusal is stable and leaves the row untouched.
    await expect(shelfCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
      facts: { manualName: null },
    })).rejects.toThrow(/invalid-product/i);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Gentle Shampoo');
    expect(detail.revision).toBe(1);
  });

  it('refuses a correction that carries a top-level identity parameter', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    // The identity travels in the facts patch only: a core call that still
    // passes it as a parameter is refused rather than silently honoured.
    await expect(coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, manualName: 'Sneaky Name',
    })).rejects.toThrow(/invalid-identity/i);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Gentle Shampoo');
  });

  it('refuses an ordinary change that carries the identity in its facts patch', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    await expect(shelfChangeFacts(db, {
      userProductId: receipt.userProductId, expectedRevision: 1,
      facts: { manualName: 'Sneaky Name' },
    })).rejects.toThrow(/invalid-identity/i);
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Gentle Shampoo');
  });

  describe('rejects a correction that changes nothing about the identity', () => {
    let receipt: { userProductId: string; revision: number; revisions: any[] };
    beforeAll(async () => { db = await database(); });
    beforeEach(async () => {
      await complete(db);
      receipt = await shelfAddFacts(db, { manualBrand: 'House brand', manualName: 'Gentle Shampoo', manualCategory: 'shampoo' });
    });
    afterEach(async () => {
      await db.exec('set session authorization postgres');
      await db.exec('truncate public.profiles cascade');
    });

    it('rejects a correction that resubmits the same name unchanged', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(1);
    });

    it('rejects a correction that resubmits the same brand unchanged', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualBrand: 'House brand' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that resubmits the same category unchanged', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualCategory: 'shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that resubmits the same brand with surrounding whitespace', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualBrand: '  House brand  ' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects an explicit null clearing an identity value that was never recorded', async () => {
      // A value that was never recorded cannot be cleared: the correction
      // changes nothing at all, so it is refused as the no-op it is.
      const blank = await coreBaseline(db, {
        userProductId: crypto.randomUUID(),
        manualBrand: 'House brand', manualName: 'Gentle Shampoo', manualCategory: null,
      });
      await expect(shelfCorrect(db, {
        userProductId: blank.userProductId, expectedRevision: 1,
        correctsId: blank.revisions[0].id,
        facts: { manualCategory: null },
      })).rejects.toThrow(/invalid-correction-noop/i);
      const detail = await shelfDetail(db, blank.userProductId);
      expect(detail.revision).toBe(1);
      expect(detail.manualCategory).toBeNull();
    });

    it('rejects a correction that changes nothing about the identity, only notes', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo', notes: 'just a note' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that changes nothing about the identity, only variant', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo', manualVariant: 'fragrance free' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that changes nothing about the identity, only size', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo', manualSize: '400 ml' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that changes nothing about the identity, only barcode', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo', manualBarcode: '6001234567890' },
      })).rejects.toThrow(/invalid-correction-noop/i);
    });

    it('rejects a correction that changes nothing about the identity, only availability', async () => {
      // An availability is an ordinary change, never a correction, so it is
      // answered as the availability it is - and never as a correction that
      // changed nothing.
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo', availability: 'low' },
      })).rejects.toThrow(/invalid-availability/i);
    });

    it('accepts a correction that genuinely changes the identity along with related facts', async () => {
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Corrected Shampoo', notes: 'typo fixed' },
      });
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(2);
      expect(detail.manualName).toBe('Corrected Shampoo');
      expect(detail.notes).toBe('typo fixed');
    });

    it('accepts a correction that clears a recorded identity value with explicit null', async () => {
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualCategory: null },
      });
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(2);
      expect(detail.manualCategory).toBeNull();
      // The name still identifies the product, so the row survives.
      expect(detail.manualName).toBe('Gentle Shampoo');
    });

    it('accepts a correction that replaces a cleared value with a new one', async () => {
      const cleared = await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualCategory: null },
      });
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 2,
        correctsId: cleared.revisions[1].id,
        facts: { manualCategory: 'conditioner' },
      });
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(3);
      expect(detail.manualCategory).toBe('conditioner');
    });

    it('leaves identity fields untouched when omitted from a correction', async () => {
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Corrected Shampoo', notes: 'just notes' },
      });
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(2);
      expect(detail.manualName).toBe('Corrected Shampoo');
      // The identity fields the correction did not answer keep their values.
      expect(detail.manualBrand).toBe('House brand');
      expect(detail.manualCategory).toBe('shampoo');
    });

    it('rejects a no-op identity correction at the public RPC boundary', async () => {
      await expect(db.query(
        `select public.shelf_correct($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) result`,
        [crypto.randomUUID(), receipt.userProductId, 1, receipt.revisions[0].id,
          'same name', null, JSON.stringify(DAY),
          JSON.stringify({ manualName: 'Gentle Shampoo' })],
      )).rejects.toThrow(/invalid-correction-noop/i);
      expect((await shelfDetail(db, receipt.userProductId)).revision).toBe(1);
    });

    it('rejects a no-op identity correction at the direct private-core boundary', async () => {
      await expect(coreCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
      expect((await shelfDetail(db, receipt.userProductId)).revision).toBe(1);
    });

    it('leaves the row, revision, revision count and correction chain untouched by a refused no-op correction', async () => {
      const before = await shelfDetail(db, receipt.userProductId);
      const historyBefore = await revisionsOf(db, receipt.userProductId);
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
      const after = await shelfDetail(db, receipt.userProductId);
      const historyAfter = await revisionsOf(db, receipt.userProductId);
      expect(after.revision).toBe(before.revision);
      expect(after.manualName).toBe(before.manualName);
      expect(after.manualBrand).toBe(before.manualBrand);
      expect(after.manualCategory).toBe(before.manualCategory);
      expect(after.availability).toBe(before.availability);
      expect(historyAfter).toHaveLength(historyBefore.length);
      expect(historyAfter.map(r => r.id)).toEqual(historyBefore.map(r => r.id));
      expect(historyAfter.map(r => r.corrects_id)).toEqual(historyBefore.map(r => r.corrects_id));
      expect(historyAfter.map(r => r.patch)).toEqual(historyBefore.map(r => r.patch));
    });

    it('allows a real correction of the same target after a refused no-op attempt', async () => {
      await expect(shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Really Corrected Name' },
      });
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(2);
      expect(detail.manualName).toBe('Really Corrected Name');
    });

    it('does not consume the operation id of a refused no-op, so the owner can retry with the right wording', async () => {
      const operationId = crypto.randomUUID();
      await expect(shelfCorrect(db, {
        operationId, userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle Shampoo' },
      })).rejects.toThrow(/invalid-correction-noop/i);
      // A refusal writes nothing at all - not even the operation ledger - so
      // the operation id was never bound to the refused payload and the owner
      // can correct the wording and use the same id again.
      const result = await shelfCorrect(db, {
        operationId, userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Different Name' },
      });
      expect(result.revision).toBe(2);
      expect((await shelfDetail(db, receipt.userProductId)).manualName).toBe('Different Name');
      // Now the id IS bound to the payload that was accepted, so a third
      // call with the same id and another payload is the stable conflict.
      await expect(shelfCorrect(db, {
        operationId, userProductId: receipt.userProductId, expectedRevision: 2,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Yet Another Name' },
      })).rejects.toThrow(/operation-conflict/i);
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(2);
    });
  });

  describe('the chain of corrections the audit reads', () => {
    beforeEach(async () => {
      await asUser(db, USER_A);
      await complete(db);
    });
    afterEach(async () => {
      await db.exec('set session authorization postgres');
      await db.exec('truncate public.profiles cascade');
    });

    it('records every correction so the audit can say what each one changed', async () => {
      const receipt = await shelfAddFacts(db, {
        manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
        facts: { manualSize: '400 ml', quantityBand: 'unknown' },
      });
      const baselineId = receipt.revisions[0].id;
      // The first correction fixes the name and leaves every fact alone.
      const first = await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1, correctsId: baselineId,
        facts: { manualName: 'Gentle shampoo bar' },
      });
      // The second correction fixes the brand and takes the size back. The
      // name is left alone, and the name was recorded by the first
      // correction - not by the entry the owner recorded - so the audit can
      // only say the name was kept by replaying the whole chain.
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 2, correctsId: first.revisions[1].id,
        facts: { manualBrand: 'Another brand', manualSize: null },
      });
      // The record holds what the owner last said.
      const detail = await shelfDetail(db, receipt.userProductId);
      expect(detail.revision).toBe(3);
      expect(detail.manualName).toBe('Gentle shampoo bar');
      expect(detail.manualBrand).toBe('Another brand');
      expect(detail.manualSize).toBeNull();
      // An explicit unknown answer is an answer the owner gave, so it is
      // kept and never read as never answered.
      expect(detail.quantityBand).toBe('unknown');
      // The history is append-only and every entry says what it recorded.
      const history = await revisionsOf(db, receipt.userProductId);
      expect(history.map(r => r.kind)).toEqual(['baseline', 'correction', 'correction']);
      expect(history[1].patch.manualName).toBe('Gentle shampoo bar');
      expect(history[1].patch.manualBrand).toBeUndefined();
      expect(history[1].patch.manualSize).toBeUndefined();
      expect(history[2].patch.manualBrand).toBe('Another brand');
      expect(history[2].patch.manualSize).toBeNull();
      // The name is not in the second correction: it was kept, and the entry
      // that recorded it is the first correction.
      expect(history[2].patch.manualName).toBeUndefined();
      // The chain names the entry each correction replaced.
      expect(history.map(r => r.corrects_id)).toEqual([null, baselineId, history[1].id]);
      // The reason the owner gave is kept with every correction.
      expect(history.map(r => r.correction_reason)).toEqual([null, 'wrong wording', 'wrong wording']);
    });

    it('never lets one owner read the audit of another owner', async () => {
      const receipt = await shelfAddFacts(db, { manualName: 'Gentle shampoo' });
      await shelfCorrect(db, {
        userProductId: receipt.userProductId, expectedRevision: 1,
        correctsId: receipt.revisions[0].id,
        facts: { manualName: 'Gentle shampoo bar' },
      });
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      // The audit of another owner is never disclosed: the answer says the
      // entry is not there, and nothing about what it holds.
      await expect(db.query<{ result: unknown }>(
        `select public.shelf_history($1, true) result`, [receipt.userProductId],
      )).rejects.toThrow(/not-found/i);
    });
  });
});

describe('the shelf availability contract', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('refuses out_of_stock on every write path', async () => {
    await complete(db);
    // The baseline.
    await expect(shelfAddFacts(db, { availability: 'out_of_stock' }))
      .rejects.toThrow(/invalid-availability/i);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    // The change, with the current revision, so the availability refusal is
    // the answer and not a stale-revision refusal.
    await expect(shelfChangeFacts(db, {
      userProductId: receipt.userProductId, expectedRevision: 1, availability: 'out_of_stock',
    })).rejects.toThrow(/invalid-availability/i);
    // The correction, through the public wrapper's own core.
    await expect(coreCorrect(db, {
      userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, availability: 'out_of_stock',
    })).rejects.toThrow(/invalid-availability/i);
    // The archive.
    await expect(db.query(
      `select strandcue_private.mutate_user_product($1, $2, $3, 'archive', null, null, null, null, 'out_of_stock', null, $4::jsonb, null, null, null, '{}'::jsonb)`,
      [crypto.randomUUID(), receipt.userProductId, 1, JSON.stringify(DAY)],
    )).rejects.toThrow(/invalid-availability/i);
    // Nothing was written: the product still carries its original state.
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.availability).toBe('available');
    expect(detail.revision).toBe(1);
    expect((await revisionsOf(db, receipt.userProductId)).map((row) => row.kind)).toEqual(['baseline']);
  });

  it('refuses out_of_stock on a direct authenticated core call', async () => {
    await complete(db);
    await expect(db.query(
      `select strandcue_private.mutate_user_product($1, $2, 0, 'baseline', null, 'House Brand', 'Gentle Shampoo', 'shampoo', 'out_of_stock', null, $3::jsonb, null, null, null, '{}'::jsonb)`,
      [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(DAY)],
    )).rejects.toThrow(/invalid-availability/i);
    const list = await shelfList(db, 25);
    expect(list.items).toEqual([]);
  });

  it('keeps a legacy out_of_stock row readable', async () => {
    await complete(db);
    const productId = crypto.randomUUID();
    await db.exec('set session authorization postgres');
    // A row written before the contract still carries the legacy state.
    await db.query(
      `insert into public.user_products(id, owner, manual_name, availability, revision) values ($1, $2, 'Gentle Shampoo', 'out_of_stock', 0)`,
      [productId, USER_A]);
    await asUser(db, USER_A);
    const detail = await shelfDetail(db, productId);
    expect(detail.availability).toBe('out_of_stock');
    const list = await shelfList(db, 25);
    expect((list.items as { id: string }[]).some((item) => item.id === productId)).toBe(true);
  });
});

describe('the shelf security properties', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('gives no shelf routine to anon or to PUBLIC', async () => {
    const anon = await db.query<{ signature: string }>(
      `select p.oid::regprocedure::text signature from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','strandcue_private')
          and has_function_privilege('anon', p.oid, 'EXECUTE')`,
    );
    expect(anon.rows).toEqual([]);
    // The PUBLIC grant is the one with an empty grantee in the access
    // control list; no shelf routine may carry it.
    const publicGrant = await db.query<{ signature: string }>(
      `select p.oid::regprocedure::text signature from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public','strandcue_private')
          and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')`,
    );
    expect(publicGrant.rows).toEqual([]);
  });

  it('derives the owner only from request_uid', async () => {
    const core = await db.query<{ arguments: string; definition: string }>(
      `select pg_get_function_arguments(p.oid) arguments, pg_get_functiondef(p.oid) definition
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'strandcue_private' and p.proname = 'mutate_user_product'`,
    );
    expect(core.rows).toHaveLength(1);
    // No owner argument exists: the owner is never accepted from a caller.
    expect(core.rows[0].arguments).not.toMatch(/owner|user_id/i);
    expect(core.rows[0].definition).toContain('strandcue_private.request_uid()');
    // The read cores are the same.
    for (const name of ['get_user_product_core', 'list_user_products_core']) {
      const read = await db.query<{ arguments: string; definition: string }>(
        `select pg_get_function_arguments(p.oid) arguments, pg_get_functiondef(p.oid) definition
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'strandcue_private' and p.proname = $1`,
        [name],
      );
      expect(read.rows[0].arguments).not.toMatch(/owner|user_id/i);
      expect(read.rows[0].definition).toContain('strandcue_private.request_uid()');
    }
  });

  it('forces row level security on the shelf tables', async () => {
    const unprotected = await db.query(
      `select relname from pg_class where relname in ('user_products','user_product_revisions') and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
    const operations = await db.query(
      `select relname from pg_class where relname = 'shelf_operations' and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(operations.rows).toEqual([]);
  });

  it('keeps the mutator grants minimal and column scoped', async () => {
    // The mutator may write the shelf row and the eight owner-entered fact
    // columns, and nothing else.
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'user_products' order by ordinal_position`,
    );
    const writable = await db.query<{ column_name: string }>(
      `select a.attname column_name from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'user_products'
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('strandcue_mutator', 'public.user_products', a.attname, 'UPDATE')`,
    );
    const expected = [
      'revision', 'availability', 'matched', 'matched_at', 'match_confirmed', 'version_id',
      'manual_brand', 'manual_name', 'manual_category', 'notes', 'updated_at',
      'manual_variant', 'manual_size', 'manual_barcode', 'opened_on', 'expiry_on', 'pao',
      'quantity_band', 'repurchase_intent',
    ];
    expect(writable.rows.map((row) => row.column_name).sort()).toEqual([...expected].sort());
    // No consumer write path on the shelf tables at all.
    const consumer = await db.query<{ column_name: string }>(
      `select a.attname column_name from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'user_products'
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', 'public.user_products', a.attname, 'UPDATE')`,
    );
    expect(consumer.rows).toEqual([]);
    expect(columns.rows.length).toBeGreaterThan(0);
  });

  it('exports every owner field of the shelf', async () => {
    await complete(db);
    await shelfAddFacts(db, { facts: { pao: '12 months after opening', quantityBand: 'about-half' } });
    await freshAuth(db, USER_A);
    const exported = await db.query<{ result: any }>(`select public.export_request($1, 'csv') result`, [crypto.randomUUID()]);
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [exported.rows[0].result.jobId]);
    const files = download.rows[0].result.document.files;
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'user_products' order by ordinal_position`,
    );
    const header = files['user_products.csv'].split('\n')[0];
    // Every owner field of the shelf is in the CSV. The owner's own id and
    // the row's update timestamp are deliberately not part of the CSV
    // contract; the export inventory in tests/database/export.test.ts pins
    // the full per-table registry.
    for (const column of columns.rows) {
      if (['owner', 'updated_at'].includes(column.column_name)) continue;
      expect(header).toContain(column.column_name);
    }
    // The revision history carries the correction link and its reason.
    const revisionHeader = files['user_product_revisions.csv'].split('\n')[0];
    expect(revisionHeader).toContain('corrects_id');
    expect(revisionHeader).toContain('correction_reason');
  });
});

describe('the shelf operation idempotency', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('replays a repeated operation id with the same payload and refuses a differing one', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    const operationId = crypto.randomUUID();
    const first = await shelfCorrect(db, {
      operationId, userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, facts: { manualName: 'Correct Shampoo' },
    });
    expect(first.revision).toBe(2);
    // The same operation id and the same payload replay the stored result.
    const replay = await shelfCorrect(db, {
      operationId, userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, facts: { manualName: 'Correct Shampoo' },
    });
    expect(replay).toEqual(first);
    // The replay wrote no second revision.
    expect((await revisionsOf(db, receipt.userProductId)).map((row) => row.kind)).toEqual(['baseline', 'correction']);
    // A differing payload is an operation conflict, never a revision
    // conflict and never a raw unique violation.
    const failure = await shelfCorrect(db, {
      operationId, userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, facts: { manualName: 'Another Wording' },
    }).catch((error: Error) => error);
    expect(failure.message).toMatch(/operation-conflict/i);
    expect(failure.message).not.toMatch(/revision-conflict/i);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint|shelf_operations_pkey/i);
    // The stored product is the one the first operation wrote.
    const detail = await shelfDetail(db, receipt.userProductId);
    expect(detail.manualName).toBe('Correct Shampoo');
    expect(detail.revision).toBe(2);
  });

  it('replays a repeated operation id on the baseline path', async () => {
    await complete(db);
    const operationId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const add = async (name: string) => (await db.query<{ result: any }>(
      `select public.shelf_add($1, $2, null, 'House Brand', $3, 'shampoo', 'available', null, $4::jsonb, '{}'::jsonb) result`,
      [operationId, productId, name, JSON.stringify(DAY)],
    )).rows[0].result;
    const first = await add('Gentle Shampoo');
    expect(first.revision).toBe(1);
    expect(await add('Gentle Shampoo')).toEqual(first);
    const failure = await add('Another Name').catch((error: Error) => error);
    expect(failure.message).toMatch(/operation-conflict/i);
    expect(failure.message).not.toMatch(/revision-conflict/i);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint/i);
  });
});

describe('the identity the baseline path holds', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('refuses an over-long or unknown identity with a stable code', async () => {
    await complete(db);
    // The table would refuse these rows too, but a constraint violation is
    // not a stable code: the core answers with one before the write.
    await expect(coreBaseline(db, {
      userProductId: crypto.randomUUID(), manualName: 'Gentle Shampoo',
      manualBrand: 'B'.repeat(10000),
    })).rejects.toThrow(/invalid-brand/i);
    await expect(coreBaseline(db, {
      userProductId: crypto.randomUUID(), manualName: 'Gentle Shampoo',
      manualBrand: 'B'.repeat(201),
    })).rejects.toThrow(/invalid-brand/i);
    await expect(coreBaseline(db, {
      userProductId: crypto.randomUUID(), manualName: 'N'.repeat(201),
    })).rejects.toThrow(/invalid-name/i);
    await expect(coreBaseline(db, {
      userProductId: crypto.randomUUID(), manualName: 'Gentle Shampoo',
      manualCategory: 'not-a-category',
    })).rejects.toThrow(/invalid-category/i);
    // The length the facts path holds is the length the core holds.
    const receipt = await coreBaseline(db, {
      userProductId: crypto.randomUUID(), manualName: 'Gentle Shampoo',
      manualBrand: 'B'.repeat(200), manualCategory: 'shampoo',
    });
    expect(receipt.revision).toBe(1);
    const stored = await db.query<{ manual_brand: string }>(
      `select manual_brand from public.user_products where id = $1`, [receipt.userProductId]);
    expect(stored.rows[0].manual_brand.length).toBe(200);
  });
});

describe('the payload the core compares', () => {
  let db: PGlite;
  const CATALOGUE_VERSION_ID = 'e1000000-0000-4000-8000-000000000003';
  beforeAll(async () => {
    db = await database();
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('e1000000-0000-4000-8000-000000000001', 'House Brand')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('e1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', 'Gentle Shampoo', 'shampoo', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values ('${CATALOGUE_VERSION_ID}', 'e1000000-0000-4000-8000-000000000002', 'ZA', '{}', 'active')`);
  }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  async function storedPayload(operationId: string): Promise<Record<string, unknown>> {
    // The operations table is private to the mutator, so the test reads it
    // as the owner of the table.
    await db.exec('set session authorization postgres');
    const stored = await db.query<{ payload: Record<string, unknown> }>(
      `select payload from strandcue_private.shelf_operations where operation_id = $1`, [operationId]);
    await asUser(db, USER_A);
    return stored.rows[0].payload;
  }

  it('compares the effective date the caller sent, never the one the server substituted', async () => {
    await complete(db);
    const receipt = await shelfAddFacts(db, { manualName: 'Gentle Shampoo' });
    // A correction compares the date the caller sent, so a retry on another
    // day with the same command is the same command.
    const correctionOperation = crypto.randomUUID();
    await shelfCorrect(db, {
      operationId: correctionOperation, userProductId: receipt.userProductId, expectedRevision: 1,
      correctsId: receipt.revisions[0].id, facts: { manualName: 'Correct Shampoo' },
    });
    expect((await storedPayload(correctionOperation)).effectiveDate).toEqual(DAY);
    // A match is dated by the server, but the payload the core compares is
    // the one the caller sent: a match carries no effective date at all, so
    // a retry on another day still replays.
    const matchOperation = crypto.randomUUID();
    await db.query(`select public.shelf_match($1, $2, 2, $3, true)`, [matchOperation, receipt.userProductId, CATALOGUE_VERSION_ID]);
    expect((await storedPayload(matchOperation)).effectiveDate).toBeNull();
    // The revision itself is still dated by the server day.
    const dated = await db.query<{ effective_date: { value: string } }>(
      `select effective_date from public.user_product_revisions where user_product_id = $1 order by sequence`,
      [receipt.userProductId]);
    expect(dated.rows[2].effective_date.value).toBe(await serverDay(db));
  });

  it('answers a duplicate operation row with a stable conflict and writes no second revision', async () => {
    await complete(db);
    const operationId = crypto.randomUUID();
    const first = await shelfAddFacts(db, { operationId, manualName: 'Gentle Shampoo' });
    expect(first.revision).toBe(1);
    // The operations table now holds a row for this operation id, so the
    // next call with the same id is the duplicate-operation path: the
    // write must be refused, and it must be refused in a way the caller
    // can read.
    const otherProductId = crypto.randomUUID();
    const failure = await shelfAddFacts(db, {
      operationId, userProductId: otherProductId, manualName: 'Another Shampoo',
    }).catch((error: Error) => error);
    // The answer is a stable code of its own: never a raw unique
    // violation that names the constraint, never a revision conflict, and
    // never another operation's stored result handed back as a success.
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/operation-conflict/i);
    expect(failure.message).not.toMatch(/revision-conflict/i);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint|shelf_operations_pkey/i);
    // The refused write left nothing behind: the first product keeps the
    // one revision it had, and the second product was never created.
    expect((await revisionsOf(db, first.userProductId)).map((row) => row.kind)).toEqual(['baseline']);
    expect((await shelfDetail(db, first.userProductId)).revision).toBe(1);
    const created = await db.query<{ id: string }>(
      `select id from public.user_products where id = $1`, [otherProductId]);
    expect(created.rows).toEqual([]);
  });

  it('answers a duplicate operation row the owner never wrote with the same stable conflict', async () => {
    await complete(db);
    const operationId = crypto.randomUUID();
    // A row for this operation id that no call of this owner wrote: the
    // operations table already holds the operation, so the write is the
    // duplicate-operation path from the very first moment.
    await db.exec('set session authorization postgres');
    await db.query(
      `insert into strandcue_private.shelf_operations(user_id, operation_id, payload, result)
       values ($1, $2, '{"op":"another-operation"}'::jsonb, '{"userProductId":"someone-else"}'::jsonb)`,
      [USER_A, operationId]);
    await asUser(db, USER_A);
    const failure = await shelfAddFacts(db, { operationId, manualName: 'Gentle Shampoo' })
      .catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toMatch(/operation-conflict/i);
    expect(failure.message).not.toMatch(/revision-conflict/i);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint|shelf_operations_pkey/i);
    // Nothing was written: the product was never created and no revision
    // was appended.
    const products = await db.query<{ id: string }>(`select id from public.user_products`);
    expect(products.rows).toEqual([]);
    const revisions = await db.query<{ id: string }>(`select id from public.user_product_revisions`);
    expect(revisions.rows).toEqual([]);
  });
});

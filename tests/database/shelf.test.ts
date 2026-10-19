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
async function shelfAddFacts(db: PGlite, opts: { operationId?: string; userProductId?: string; manualName?: string | null; manualBrand?: string | null; availability?: string; notes?: string | null; facts?: unknown } = {}) {
  return (await db.query<{ result: any }>(
    `select public.shelf_add($1, $2, null, $3, $4, 'shampoo', $5, $6, $7::jsonb, $8::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId ?? crypto.randomUUID(),
      opts.manualBrand === undefined ? 'House Brand' : opts.manualBrand,
      opts.manualName === undefined ? 'Gentle Shampoo' : opts.manualName,
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

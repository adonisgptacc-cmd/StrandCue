import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import {
  id,
  PRODUCT_SHAMPOO,
  V_SHAMPOO_PLAIN,
  V_SHAMPOO_TRAVEL,
  V_CONDITIONER,
  V_MASK_RETIRED,
  V_MASK_SUCCESSOR,
  SECRET_CLAIM,
  SECRET_INGREDIENT,
  SECRET_DIRECTION,
  SECRET_SOURCE,
  seedCatalogue,
  CATALOGUE_TABLES,
} from '../helpers/catalogue-fixture.ts';

const DAY = { precision: 'day', value: '2024-01-15' };
async function search(db: PGlite, query: string | null, limit: number | null = 10) {
  return (await db.query<{ result: any }>(`select public.catalogue_search($1, $2) result`, [query, limit])).rows[0].result;
}
async function shelfAdd(db: PGlite, opts: { operationId?: string; userProductId?: string; manualName?: string } = {}) {
  return (await db.query<{ result: any }>(
    `select public.shelf_add($1, $2, null, 'House brand', $3, 'shampoo', 'available', null, $4::jsonb, '{}'::jsonb) result`,
    [opts.operationId ?? crypto.randomUUID(), opts.userProductId ?? crypto.randomUUID(), opts.manualName ?? 'My guess', JSON.stringify(DAY)],
  )).rows[0].result;
}
async function match(db: PGlite, operationId: string, userProductId: string, revision: number, versionId: string, confirmed = true) {
  return (await db.query<{ result: any }>(`select public.shelf_match($1, $2, $3, $4, $5) result`,
    [operationId, userProductId, revision, versionId, confirmed])).rows[0].result;
}
async function counts(db: PGlite, viewer: string = USER_A) {
  await db.exec('set session authorization postgres');
  const read = async (table: string) => Number((await db.query<{ n: string }>(`select count(*)::text n from ${table}`)).rows[0].n);
  const result = {
    products: await read('public.user_products'),
    revisions: await read('public.user_product_revisions'),
    operations: await read('strandcue_private.shelf_operations'),
  };
  await asUser(db, viewer);
  return result;
}
async function state(db: PGlite, userProductId: string) {
  await db.exec('set session authorization postgres');
  const row = (await db.query<{ revision: number; version_id: string | null; matched: boolean; manual_name: string | null }>(
    `select revision, version_id, matched, manual_name from public.user_products where id = $1`, [userProductId])).rows[0];
  await asUser(db, USER_A);
  return row;
}

describe('catalogue search (authenticated, owner-agnostic, read-only)', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db); await seedCatalogue(db); await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('drop policy if exists hide_travel on public.product_versions');
    await db.exec('truncate public.profiles cascade');
    for (const table of [...CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
  });
  afterAll(async () => { await db?.close(); });

  it('finds exact versions by brand, name, variant, category and barcode', async () => {
    const byBrand = await search(db, 'house brand');
    expect(byBrand.results.map((r: any) => r.versionId).sort()).toEqual([V_CONDITIONER, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL].sort());
    expect((await search(db, 'gentle conditioner')).results.map((r: any) => r.versionId)).toEqual([V_CONDITIONER]);
    expect((await search(db, 'travel 50')).results.map((r: any) => r.versionId)).toEqual([V_SHAMPOO_TRAVEL]);
    expect((await search(db, 'mask')).results.map((r: any) => r.versionId).sort()).toEqual([V_MASK_RETIRED, V_MASK_SUCCESSOR].sort());
    expect((await search(db, '6001234567890')).results.map((r: any) => r.versionId)).toEqual([V_SHAMPOO_PLAIN]);
    expect((await search(db, '6001 2345-67890')).results).toEqual([]);
  });

  it('requires every word to match, in any order and any case', async () => {
    expect((await search(db, 'SHAMPOO house')).results.length).toBe(2);
    expect((await search(db, 'shampoo conditioner')).results).toEqual([]);
  });

  it('names the exact version separately from its product family', async () => {
    const { results } = await search(db, 'gentle shampoo');
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r: any) => r.productId))).toEqual(new Set([PRODUCT_SHAMPOO]));
    expect(new Set(results.map((r: any) => r.versionId)).size).toBe(2);
  });

  it('reports lifecycle and successor, and keeps unknown facts null', async () => {
    const { results } = await search(db, 'deep mask');
    const retired = results.find((r: any) => r.versionId === V_MASK_RETIRED);
    expect(retired).toMatchObject({ lifecycle: 'retired', successorVersionId: V_MASK_SUCCESSOR, barcode: null });
    const plain = (await search(db, 'gentle shampoo')).results.find((r: any) => r.versionId === V_SHAMPOO_PLAIN);
    expect(plain.variant).toBeNull();
  });

  it('returns identity and lifecycle fields only, never claims, evidence, ingredients or directions', async () => {
    const response = await search(db, 'gentle shampoo');
    for (const result of response.results) {
      expect(Object.keys(result).sort()).toEqual([
        'barcode', 'brand', 'category', 'lifecycle', 'market', 'productId', 'productName', 'successorVersionId', 'variant', 'versionId',
      ]);
    }
    const text = JSON.stringify(response);
    for (const secret of [SECRET_CLAIM, SECRET_INGREDIENT, SECRET_DIRECTION, SECRET_SOURCE]) expect(text).not.toContain(secret);
    expect(Object.keys(response).sort()).toEqual(['results', 'truncated']);
  });

  it('orders deterministically: current versions first, then brand, name, variant and id', async () => {
    const first = await search(db, 'mask');
    expect(first.results.map((r: any) => r.versionId)).toEqual([V_MASK_SUCCESSOR, V_MASK_RETIRED]);
    expect(await search(db, 'mask')).toEqual(first);
    const family = (await search(db, 'house brand')).results.map((r: any) => r.versionId);
    expect(family).toEqual([V_CONDITIONER, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL]);
  });

  it('bounds the result count and says when results were cut', async () => {
    const limited = await search(db, 'house brand', 2);
    expect(limited.results).toHaveLength(2);
    expect(limited.truncated).toBe(true);
    const exact = await search(db, 'house brand', 3);
    expect(exact.results).toHaveLength(3);
    expect(exact.truncated).toBe(false);
  });

  it('refuses malformed searches with one stable code', async () => {
    const bad: [string | null, number | null][] = [
      [null, 10], ['', 10], ['a', 10], ['   ', 10], ['a'.repeat(81), 10],
      ['one two three four five six seven', 10], ['gentle\u0001shampoo', 10], ['gentle‮shampoo', 10],
      ['gentle', 0], ['gentle', 26], ['gentle', null], ['gentle', -3],
    ];
    for (const [query, limit] of bad) {
      await expect(search(db, query, limit)).rejects.toThrow(/invalid-search/);
    }
  });

  it('accepts the boundaries it documents', async () => {
    expect((await search(db, 'ho')).results.length).toBeGreaterThan(0);
    expect((await search(db, 'ab cd ef gh ij kl')).results).toEqual([]);
    expect((await search(db, 'a'.repeat(80))).results).toEqual([]);
    expect((await search(db, 'house brand', 25)).results).toHaveLength(3);
    // Over the bounds by one is refused.
    await expect(search(db, 'a'.repeat(81))).rejects.toThrow(/invalid-search/);
    await expect(search(db, 'ab cd ef gh ij kl mn')).rejects.toThrow(/invalid-search/);
    await expect(search(db, 'gentle a')).rejects.toThrow(/invalid-search/);
    await expect(search(db, 'gentle ' + ' '.repeat(2000))).rejects.toThrow(/invalid-search/);
    await expect(search(db, 'gentle shampoo' + 'x'.repeat(400))).rejects.toThrow(/invalid-search/);
  });

  it('folds compatibility characters like the client does', async () => {
    expect((await search(db, 'Ｇｅｎｔｌｅ conditioner')).results.map((r: any) => r.versionId)).toEqual([V_CONDITIONER]);
  });

  it('matches a barcode only exactly: not a prefix, not short, hyphens allowed in the word', async () => {
    expect((await search(db, '60012345')).results).toEqual([]);
    expect((await search(db, '600123456789')).results).toEqual([]);
    expect((await search(db, '6001-234567-890')).results.map((r: any) => r.versionId)).toEqual([V_SHAMPOO_PLAIN]);
  });

  it('ranks best word coverage in brand and name above alphabetical order', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.brands(id, name) values ('${id(61)}', 'Aaa Co')`);
    await db.exec(`insert into public.products(id, brand_id, name, category, market) values ('${id(62)}', '${id(61)}', 'Zed Cream', 'styling cream', 'ZA')`);
    await db.exec(`insert into public.product_versions(id, product_id, variant, market, lifecycle) values ('${id(63)}', '${id(62)}', 'Gentle', 'ZA', 'active')`);
    await asUser(db, USER_A);
    const ids = (await search(db, 'gentle')).results.map((r: any) => r.versionId);
    // 'Aaa Co' sorts first alphabetically, but its only match is the variant, so it ranks last.
    expect(ids).toEqual([V_CONDITIONER, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL, id(63)]);
  });

  it('trims and collapses the words on the server too', async () => {
    expect(await search(db, '  gentle \t  shampoo  ')).toEqual(await search(db, 'gentle shampoo'));
  });

  it('handles injection-shaped text as data and treats % and _ as plain characters', async () => {
    const before = await counts(db);
    for (const query of ["x'; drop table public.brands; --", "'' or ''1''=''1", '%%', '__', '%_', 'gentle%', '\\\\', '"; select 1; --', "x'); delete from public.brands; --"]) {
      expect((await search(db, query)).results).toEqual([]);
    }
    expect((await db.query('select count(*)::int n from public.brands')).rows[0]).toEqual({ n: 2 });
    expect(await counts(db)).toEqual(before);
  });

  it('is read-only: a search writes no product, revision or operation', async () => {
    await shelfAdd(db);
    const before = await counts(db);
    await search(db, 'gentle shampoo');
    await search(db, 'nothing matches this');
    expect(await counts(db)).toEqual(before);
  });

  it('runs as the caller: a version the caller cannot read never appears', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`create policy hide_travel on public.product_versions as restrictive for select to authenticated using (id <> '${V_SHAMPOO_TRAVEL}')`);
    await asUser(db, USER_A);
    const ids = (await search(db, 'gentle shampoo')).results.map((r: any) => r.versionId);
    expect(ids).toEqual([V_SHAMPOO_PLAIN]);
  });

  it('is security invoker and closed to anonymous callers', async () => {
    await db.exec('set session authorization postgres');
    const meta = (await db.query<{ prosecdef: boolean; acl: string | null }>(
      `select prosecdef, proacl::text acl from pg_proc where proname = 'catalogue_search' and pronamespace = 'public'::regnamespace`)).rows;
    expect(meta).toHaveLength(1);
    expect(meta[0].prosecdef).toBe(false);
    const detail = (await db.query<{ volatility: string; config: string[] | null; authenticated: boolean }>(
      `select provolatile as volatility, proconfig as config, has_function_privilege('authenticated', oid, 'execute') as authenticated
         from pg_proc where proname = 'catalogue_search' and pronamespace = 'public'::regnamespace`)).rows[0];
    expect(detail.volatility).toBe('s');
    expect(detail.config).toContain('search_path=""');
    expect(detail.authenticated).toBe(true);
    expect(meta[0].acl).not.toMatch(/(^|[{,])=X/);
    expect(meta[0].acl).not.toContain('anon=');
    await asUser(db, null);
    await expect(search(db, 'gentle shampoo')).rejects.toThrow(/permission denied/i);
    await expect(db.query('select * from public.product_versions')).rejects.toThrow(/permission denied/i);
  });

  it('refuses a caller whose token carries no user', async () => {
    await db.exec('set session authorization postgres');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
    await db.exec('set session authorization authenticated');
    await expect(search(db, 'gentle shampoo')).rejects.toThrow(/authentication-required/);
  });
});

describe('confirmed matching through the trusted boundary (characterization and Task 2.2 guarantees)', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db); await seedCatalogue(db); await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    for (const table of [...CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
  });
  afterAll(async () => { await db?.close(); });

  it('searching and not confirming writes nothing', async () => {
    const rec = await shelfAdd(db);
    const before = await counts(db);
    await search(db, 'gentle shampoo');
    await expect(match(db, crypto.randomUUID(), rec.userProductId, 1, V_SHAMPOO_PLAIN, false)).rejects.toThrow(/confirmation-required/);
    expect(await counts(db)).toEqual(before);
    expect(await state(db, rec.userProductId)).toMatchObject({ revision: 1, version_id: null, matched: false });
  });

  it('a confirmed match appends a revision and keeps the manual baseline readable', async () => {
    const rec = await shelfAdd(db, { manualName: 'My shampoo guess' });
    const receipt = await match(db, crypto.randomUUID(), rec.userProductId, 1, V_SHAMPOO_PLAIN);
    expect(receipt.revision).toBe(2);
    const detail = (await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [rec.userProductId])).rows[0].result;
    expect(detail).toMatchObject({ matched: true, matchConfirmed: true, versionId: V_SHAMPOO_PLAIN, manualName: 'My shampoo guess' });
    expect(detail.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'match']);
    expect(detail.revisions[0].patch).toMatchObject({ manualName: 'My shampoo guess', manualBrand: 'House brand' });
    expect(detail.revisions[1].matchVersionId).toBe(V_SHAMPOO_PLAIN);
  });

  it('never copies catalogue text, claims or ingredients into the owner record', async () => {
    const rec = await shelfAdd(db, { manualName: 'My shampoo guess' });
    await match(db, crypto.randomUUID(), rec.userProductId, 1, V_SHAMPOO_PLAIN);
    await db.exec('set session authorization postgres');
    const row = (await db.query<Record<string, unknown>>(`select * from public.user_products where id = $1`, [rec.userProductId])).rows[0];
    const revisions = (await db.query<Record<string, unknown>>(`select patch from public.user_product_revisions where user_product_id = $1`, [rec.userProductId])).rows;
    const text = JSON.stringify([row, revisions]);
    for (const secret of [SECRET_CLAIM, SECRET_INGREDIENT, SECRET_DIRECTION, SECRET_SOURCE, 'Gentle Shampoo']) expect(text).not.toContain(secret);
    expect(row.manual_name).toBe('My shampoo guess');
    await asUser(db, USER_A);
  });

  it('replays an identical operation without a second revision', async () => {
    const rec = await shelfAdd(db);
    const op = crypto.randomUUID();
    const first = await match(db, op, rec.userProductId, 1, V_SHAMPOO_PLAIN);
    const again = await match(db, op, rec.userProductId, 1, V_SHAMPOO_PLAIN);
    expect(again).toEqual(first);
    const detail = (await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [rec.userProductId])).rows[0].result;
    expect(detail.revisions).toHaveLength(2);
  });

  it('conflicts when an operation id is reused with a different version, changing nothing', async () => {
    const rec = await shelfAdd(db);
    const op = crypto.randomUUID();
    await match(db, op, rec.userProductId, 1, V_SHAMPOO_PLAIN);
    const before = await counts(db);
    await expect(match(db, op, rec.userProductId, 1, V_CONDITIONER)).rejects.toThrow(/operation-conflict/);
    expect(await counts(db)).toEqual(before);
    expect(await state(db, rec.userProductId)).toMatchObject({ version_id: V_SHAMPOO_PLAIN, revision: 2 });
  });

  it('fails safely on a stale expected revision and leaves everything unchanged', async () => {
    const rec = await shelfAdd(db);
    await match(db, crypto.randomUUID(), rec.userProductId, 1, V_SHAMPOO_PLAIN);
    const before = await counts(db);
    await expect(match(db, crypto.randomUUID(), rec.userProductId, 1, V_CONDITIONER)).rejects.toThrow(/revision-conflict/);
    expect(await counts(db)).toEqual(before);
    expect(await state(db, rec.userProductId)).toMatchObject({ version_id: V_SHAMPOO_PLAIN });
  });

  it('refuses an unknown catalogue version and leaves the product, history and ledger unchanged', async () => {
    const rec = await shelfAdd(db);
    const before = await counts(db);
    await expect(match(db, crypto.randomUUID(), rec.userProductId, 1, id(99))).rejects.toThrow(/version-not-found/);
    expect(await counts(db)).toEqual(before);
    expect(await state(db, rec.userProductId)).toMatchObject({ revision: 1, version_id: null, matched: false });
  });

  it('rejects another owner matching this product and discloses nothing', async () => {
    const rec = await shelfAdd(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    const before = await counts(db, USER_B);
    await expect(match(db, crypto.randomUUID(), rec.userProductId, 1, V_SHAMPOO_PLAIN)).rejects.toThrow(/not-found|revision-conflict/);
    expect(await counts(db, USER_B)).toEqual(before);
    // A foreign product answers exactly as a product that does not exist.
    const read = (productId: string) => db.query(`select public.shelf_history($1, true) result`, [productId]);
    await expect(read(rec.userProductId)).rejects.toThrow(/not-found/);
    await expect(read(crypto.randomUUID())).rejects.toThrow(/not-found/);
    expect((await db.query<{ result: any }>(`select public.shelf_list(25, null) result`)).rows[0].result.items).toEqual([]);
    await asUser(db, USER_A);
    expect(await state(db, rec.userProductId)).toMatchObject({ version_id: null, matched: false });
  });

  it('lets the owner rematch later; the earlier match stays in the append-only history', async () => {
    const rec = await shelfAdd(db);
    await match(db, crypto.randomUUID(), rec.userProductId, 1, V_CONDITIONER);
    await match(db, crypto.randomUUID(), rec.userProductId, 2, V_SHAMPOO_PLAIN);
    const detail = (await db.query<{ result: any }>(`select public.shelf_history($1, true) result`, [rec.userProductId])).rows[0].result;
    expect(detail.revisions.map((r: any) => [r.kind, r.matchVersionId])).toEqual([
      ['baseline', null], ['match', V_CONDITIONER], ['match', V_SHAMPOO_PLAIN],
    ]);
    expect(detail.versionId).toBe(V_SHAMPOO_PLAIN);
    expect(detail.manualName).toBe('My guess');
  });
});

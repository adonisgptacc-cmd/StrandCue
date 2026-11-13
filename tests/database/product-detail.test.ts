import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import {
  CATALOGUE_TABLES, SECRET_CLAIM, SECRET_DIRECTION, SECRET_INGREDIENT, SECRET_SOURCE, id, seedCatalogue,
  V_CONDITIONER, V_MASK_RETIRED, V_MASK_SUCCESSOR, V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL,
} from '../helpers/catalogue-fixture.ts';

const DAY = { precision: 'day', value: '2024-01-15' };
const CLAIM = id(41); // 'repair' claim of V_SHAMPOO_PLAIN, seeded as draft text
const SOURCE = id(51); // marketing source of V_SHAMPOO_PLAIN
const BANANA_VERSION = '6ae2cd7a-2d89-5d16-a07d-36ca44139c59';
const REVIEWER = 'Reviewer Rita';
const AUTHOR = 'Author Ann';

const DIRECTIONS = {
  routinePlacement: 'After shampoo', instructions: 'Apply to wet hair.', applicationOrder: 2, rinseMode: 'rinse-out',
  waitMinutes: 3, frequency: { count: 2, unit: 'week' }, requiredTools: ['wide-tooth comb'],
  incompatibilities: ['Do not combine with product X.'], note: SECRET_DIRECTION, ratings: { score: 9 },
};

async function detail(db: PGlite, versionId: string | null, userProductId: string | null = null) {
  return (await db.query<{ result: any }>(`select public.catalogue_product_detail($1, $2) result`, [versionId, userProductId])).rows[0].result;
}
async function admin(db: PGlite, sql: string, values: unknown[] = []) {
  await db.exec('set session authorization postgres');
  try { return await db.query<any>(sql, values); } finally { await asUser(db, USER_A); }
}
async function publication(db: PGlite, o: { version: string; subject: string; claim?: string | null; state?: string; reviewer?: string | null; author?: string; reviewedAt?: string | null; publishedAt?: string | null }) {
  const state = o.state ?? 'published';
  const review = state === 'review' || state === 'published';
  const insert = (rowState: string) => admin(db, `insert into public.product_publications(version_id, subject, claim_id, state, authored_by, reviewed_by, reviewed_at, published_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8)`, [
    o.version, o.subject, o.claim ?? null, rowState, o.author ?? AUTHOR,
    rowState === 'review' ? null : (o.reviewer === undefined ? REVIEWER : o.reviewer),
    rowState === 'review' ? null : (o.reviewedAt === undefined ? '2024-06-02T10:00:00Z' : o.reviewedAt),
    rowState === 'review' ? null : (o.publishedAt === undefined ? '2024-06-03T10:00:00Z' : o.publishedAt),
  ]);
  if (!review) { await insert(state); return; }
  // A publication always starts as a review of the content as it stands, then is published.
  await insert('review');
  if (state === 'published') {
    await admin(db, `update public.product_publications set state = 'published', reviewed_by = $4, reviewed_at = $5, published_at = $6
      where version_id = $1 and subject = $2 and claim_id is not distinct from $3 and state = 'review'`, [
      o.version, o.subject, o.claim ?? null, o.reviewer === undefined ? REVIEWER : o.reviewer,
      o.reviewedAt === undefined ? '2024-06-02T10:00:00Z' : o.reviewedAt, o.publishedAt === undefined ? '2024-06-03T10:00:00Z' : o.publishedAt]);
  }
}
async function evidence(db: PGlite, o: { claim?: string; version?: string; source?: string; state?: string; title?: string; approved?: boolean; tier?: string }) {
  const state = o.state ?? 'published';
  const evidenceId = crypto.randomUUID();
  const insert = (rowState: string) => admin(db, `insert into public.product_claim_evidence(id, claim_id, version_id, source_id, title, publisher, applicability, limitations, excerpt, excerpt_consumer_approved, state, authored_by, reviewed_by, reviewed_at, published_at)
    values ($1, $2, $3, $4, $5, 'House Brand', 'This exact version only.', 'A statement, not a test.', 'Approved excerpt text', $6, $7, $8, $9, $10, $11)`, [
    evidenceId, o.claim ?? CLAIM, o.version ?? V_SHAMPOO_PLAIN, o.source ?? SOURCE, o.title ?? 'Source title', o.approved ?? false, rowState, AUTHOR,
    rowState === 'review' ? null : REVIEWER, rowState === 'review' ? null : '2024-06-02T10:00:00Z', rowState === 'review' ? null : '2024-06-03T10:00:00Z',
  ]);
  if (state === 'review' || state === 'published') {
    // Evidence starts as a review of the text and source as they stand, then is published.
    await insert('review');
    if (state === 'published') {
      await admin(db, `update public.product_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = '2024-06-02T10:00:00Z', published_at = '2024-06-03T10:00:00Z' where id = $1`, [evidenceId, REVIEWER]);
    }
  } else await insert(state);
  return evidenceId;
}
async function shelfAdd(db: PGlite, name = 'My guess') {
  return (await db.query<{ result: any }>(
    `select public.shelf_add($1, $2, null, 'House brand', $3, 'shampoo', 'available', null, $4::jsonb, '{"manualSize":"250 ml","notes":"Mine"}'::jsonb) result`,
    [crypto.randomUUID(), crypto.randomUUID(), name, JSON.stringify(DAY)])).rows[0].result;
}
async function match(db: PGlite, userProductId: string, versionId: string) {
  await db.query(`select public.shelf_match($1, $2, 1, $3, true)`, [crypto.randomUUID(), userProductId, versionId]);
}
async function counts(db: PGlite) {
  const read = async (table: string) => Number((await admin(db, `select count(*)::text n from ${table}`)).rows[0].n);
  return { products: await read('public.user_products'), revisions: await read('public.user_product_revisions'), operations: await read('strandcue_private.shelf_operations'),
    publications: await read('public.product_publications'), evidence: await read('public.product_claim_evidence') };
}

describe('the shipped catalogue holds no publication', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('shows the draft Banana version as identity with every section unpublished, and publishes nothing', async () => {
    await asUser(db, USER_A);
    await complete(db, 'user_a');
    const result = await detail(db, BANANA_VERSION);
    expect(result.identity.versionId).toBe(BANANA_VERSION);
    for (const section of ['formulationReference', 'directions', 'ingredients', 'claims']) expect(result[section]).toEqual({ state: 'not_published' });
    expect(result.owner).toBeNull();
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/Reviewer|reviewed|authored/i);
    const counts = await admin(db, 'select (select count(*) from public.product_publications)::int p, (select count(*) from public.product_claim_evidence)::int e, (select count(*) from public.product_claims)::int c');
    // The draft claim rows exist, and not one of them is published.
    expect(counts.rows[0]).toMatchObject({ p: 0, e: 0 });
    expect(counts.rows[0].c).toBeGreaterThan(0);
  });
});

describe('consumer product detail and the publication boundary', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db, 'user_a'); await seedCatalogue(db); await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('alter table public.product_publications disable trigger user; alter table public.product_claim_evidence disable trigger user');
    await db.exec('delete from public.product_claim_evidence; delete from public.product_publications');
    await db.exec('alter table public.product_publications enable trigger user; alter table public.product_claim_evidence enable trigger user');
    for (const table of [...CATALOGUE_TABLES].reverse()) await db.exec(`delete from public.${table}`);
  });
  afterAll(async () => { await db?.close(); });

  describe('what a consumer can read directly', () => {
    it('closes draft claims, sources, verification events and non-identity version columns to consumers', async () => {
      for (const table of ['product_claims', 'product_sources', 'product_verification_events', 'product_publications', 'product_claim_evidence']) {
        await expect(db.query(`select 1 from public.${table}`)).rejects.toThrow(/permission denied/i);
      }
      for (const column of ['ingredients', 'structured_directions', 'formulation_ref']) {
        await expect(db.query(`select ${column} from public.product_versions`)).rejects.toThrow(/permission denied/i);
      }
      await expect(db.query('select * from public.product_versions')).rejects.toThrow(/permission denied/i);
    });

    it('keeps the identity columns readable, as the catalogue search needs', async () => {
      const rows = await db.query<{ id: string }>('select id, product_id, variant, market, barcode, lifecycle, successor_version_id from public.product_versions');
      expect(rows.rows.length).toBe(5);
      expect((await db.query('select name from public.brands')).rows.length).toBe(2);
      expect((await db.query('select name from public.products')).rows.length).toBe(3);
    });

    it('gives no consumer a write path to the catalogue or the publication tables', async () => {
      for (const sql of [
        `insert into public.product_publications(version_id, subject, state, authored_by) values ('${V_SHAMPOO_PLAIN}', 'directions', 'review', 'x')`,
        `update public.product_publications set state = 'published'`,
        `delete from public.product_publications`,
        `insert into public.product_claim_evidence(claim_id, version_id, source_id, title, publisher, applicability, limitations, state, authored_by) values ('${CLAIM}', '${V_SHAMPOO_PLAIN}', '${SOURCE}', 't', 'p', 'a', 'l', 'review', 'x')`,
        `update public.product_claim_evidence set state = 'published'`,
        `update public.product_versions set lifecycle = 'retired'`,
        `delete from public.product_claims`,
      ]) await expect(db.exec(sql)).rejects.toThrow(/permission denied|violates/i);
      for (const role of ['anon', 'authenticated']) {
        const grants = await admin(db, `select count(*)::int n from information_schema.role_table_grants where grantee = $1 and table_name in ('product_publications','product_claim_evidence') and privilege_type <> 'SELECT'`, [role]);
        expect(grants.rows[0].n).toBe(0);
      }
    });
  });

  describe('the detail read', () => {
    it('returns identity and honest unpublished states for a draft-only version, and no draft text', async () => {
      const result = await detail(db, V_SHAMPOO_PLAIN);
      expect(Object.keys(result).sort()).toEqual(['claims', 'directions', 'formulationReference', 'identity', 'ingredients', 'lifecycle', 'owner']);
      expect(result.identity).toMatchObject({ versionId: V_SHAMPOO_PLAIN, brand: 'House Brand', productName: 'Gentle Shampoo', barcode: '6001234567890', market: 'ZA' });
      expect(result.lifecycle).toEqual({ state: 'active', successor: { state: 'none' } });
      for (const section of ['formulationReference', 'directions', 'ingredients', 'claims']) expect(result[section]).toEqual({ state: 'not_published' });
      expect(result.owner).toBeNull();
      const text = JSON.stringify(result);
      for (const secret of [SECRET_CLAIM, SECRET_INGREDIENT, SECRET_DIRECTION, SECRET_SOURCE]) expect(text).not.toContain(secret);
    });

    it('publishes directions through an allowlist: unknown and out-of-contract keys never leave', async () => {
      await admin(db, `update public.product_versions set structured_directions = $2::jsonb where id = $1`, [V_SHAMPOO_PLAIN, JSON.stringify(DIRECTIONS)]);
      expect((await detail(db, V_SHAMPOO_PLAIN)).directions).toEqual({ state: 'not_published' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      const { directions } = await detail(db, V_SHAMPOO_PLAIN);
      expect(directions.state).toBe('published');
      expect(directions.content).toEqual({
        routinePlacement: 'After shampoo', instructions: 'Apply to wet hair.', applicationOrder: 2, rinseMode: 'rinse-out', waitMinutes: 3,
        frequency: { count: 2, unit: 'week' }, activation: null, requiredTools: ['wide-tooth comb'], requiredConditions: null,
        incompatibilities: ['Do not combine with product X.'], limitations: null,
      });
      expect(JSON.stringify(directions)).not.toContain(SECRET_DIRECTION);
      expect(JSON.stringify(directions)).not.toContain('ratings');
    });

    it('withholds directions whole when a field is mistyped, a list item is dropped or a list is cut', async () => {
      await admin(db, `update public.product_versions set structured_directions = $2::jsonb where id = $1`, [V_SHAMPOO_PLAIN,
        JSON.stringify({ instructions: 5, applicationOrder: 'two', rinseMode: 'sometimes', waitMinutes: -4, frequency: { count: 0, unit: 'fortnight' }, requiredTools: 'comb', incompatibilities: [1, 'ok'] })]);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      expect((await detail(db, V_SHAMPOO_PLAIN)).directions).toEqual({ state: 'not_published' });
      // Safety content is never shown as complete when part of it was lost on the way.
      await admin(db, `update public.product_versions set structured_directions = $2::jsonb where id = $1`, [V_SHAMPOO_TRAVEL, JSON.stringify({ instructions: 'Apply.', incompatibilities: [1, 'Product X'] })]);
      await publication(db, { version: V_SHAMPOO_TRAVEL, subject: 'directions' });
      expect((await detail(db, V_SHAMPOO_TRAVEL)).directions).toEqual({ state: 'not_published' });
      await admin(db, `update public.product_versions set structured_directions = $2::jsonb where id = $1`, [V_CONDITIONER, JSON.stringify({ instructions: 'Apply.', incompatibilities: Array.from({ length: 21 }, (_, n) => `P${n}`) })]);
      await publication(db, { version: V_CONDITIONER, subject: 'directions' });
      expect((await detail(db, V_CONDITIONER)).directions).toEqual({ state: 'not_published' });
    });

    it('does not show published directions from which nothing survives the allowlist', async () => {
      await admin(db, `update public.product_versions set structured_directions = $2::jsonb where id = $1`, [V_SHAMPOO_PLAIN, JSON.stringify({ note: SECRET_DIRECTION, ratings: { score: 9 }, instructions: 5 })]);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      expect((await detail(db, V_SHAMPOO_PLAIN)).directions).toEqual({ state: 'not_published' });
      await admin(db, `update public.product_versions set structured_directions = '[]'::jsonb where id = $1`, [V_SHAMPOO_TRAVEL]).catch(() => undefined);
      await publication(db, { version: V_SHAMPOO_TRAVEL, subject: 'directions' });
      expect((await detail(db, V_SHAMPOO_TRAVEL)).directions).toEqual({ state: 'not_published' });
    });

    it('publishes ingredients as label text only, and formulation reference only when published', async () => {
      await admin(db, `update public.product_versions set ingredients = '{"text":"Aqua, Keratin","efficacy":"repairs"}'::jsonb, formulation_ref = 'F-2024-A' where id = $1`, [V_SHAMPOO_PLAIN]);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'ingredients' });
      let result = await detail(db, V_SHAMPOO_PLAIN);
      expect(result.ingredients).toEqual({ state: 'published', content: { text: 'Aqua, Keratin' } });
      expect(result.formulationReference).toEqual({ state: 'not_published' });
      expect(JSON.stringify(result)).not.toContain('efficacy');
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'formulation_reference' });
      result = await detail(db, V_SHAMPOO_PLAIN);
      expect(result.formulationReference).toEqual({ state: 'published', content: { value: 'F-2024-A' } });
    });

    it('treats published ingredients without recorded text as not published, never as an empty fact', async () => {
      await publication(db, { version: V_SHAMPOO_TRAVEL, subject: 'ingredients' });
      expect((await detail(db, V_SHAMPOO_TRAVEL)).ingredients).toEqual({ state: 'not_published' });
    });

    it('distinguishes under review, withdrawn, superseded and rejected', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions', state: 'review' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'ingredients', state: 'withdrawn' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'formulation_reference', state: 'superseded' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'successor', state: 'rejected' });
      const result = await detail(db, V_SHAMPOO_PLAIN);
      expect(result.directions).toEqual({ state: 'under_review' });
      expect(result.ingredients).toEqual({ state: 'withdrawn' });
      expect(result.formulationReference).toEqual({ state: 'not_published' });
      expect(result.claims).toEqual({ state: 'not_published' });
    });

    it('shows a claim only when its publication is published, and its evidence only when that is published too', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM, state: 'review' });
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims).toEqual({ state: 'under_review' });
      await evidence(db, {});
      expect(JSON.stringify(await detail(db, V_SHAMPOO_PLAIN))).not.toContain(SECRET_CLAIM);
      await admin(db, `update public.product_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now() where claim_id = $2`, [REVIEWER, CLAIM]);
      const claims = (await detail(db, V_SHAMPOO_PLAIN)).claims;
      expect(claims.state).toBe('published');
      expect(claims.content.items).toHaveLength(1);
      expect(claims.content.items[0]).toMatchObject({ claimKey: 'repair', statement: SECRET_CLAIM, evidence: [{ sourceType: 'marketing', trustTier: 'T10', title: 'Source title', excerpt: null }] });
    });

    it('keeps evidence from unpublished claims, and unpublished evidence of published claims, invisible', async () => {
      const draftEvidence = await evidence(db, { state: 'review', title: 'In review' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      const claims = (await detail(db, V_SHAMPOO_PLAIN)).claims;
      expect(claims.content.items[0].evidence).toEqual([]);
      expect(JSON.stringify(claims)).not.toContain('In review');
      expect(draftEvidence).toBeTruthy();
    });

    it('never shows superseded, withdrawn or rejected evidence as current', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      await evidence(db, { state: 'superseded', title: 'Old' });
      await evidence(db, { state: 'withdrawn', title: 'Gone' });
      await evidence(db, { state: 'rejected', title: 'Refused' });
      const text = JSON.stringify((await detail(db, V_SHAMPOO_PLAIN)).claims);
      for (const title of ['Old', 'Gone', 'Refused']) expect(text).not.toContain(title);
    });

    it('hides a superseded or withdrawn claim even when its evidence is published', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM, state: 'superseded' });
      await evidence(db, { title: 'Orphaned' });
      const result = await detail(db, V_SHAMPOO_PLAIN);
      expect(result.claims).toEqual({ state: 'not_published' });
      expect(JSON.stringify(result)).not.toContain('Orphaned');
    });

    it('shows an excerpt only when the record approved it, and never reviewer or author names', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      await evidence(db, { title: 'Hidden excerpt', approved: false });
      await evidence(db, { title: 'Shown excerpt', approved: true });
      const result = await detail(db, V_SHAMPOO_PLAIN);
      const items = result.claims.content.items[0].evidence;
      expect(items.find((e: any) => e.title === 'Hidden excerpt').excerpt).toBeNull();
      expect(items.find((e: any) => e.title === 'Shown excerpt').excerpt).toBe('Approved excerpt text');
      const text = JSON.stringify(result);
      for (const internal of [REVIEWER, AUTHOR, 'reviewed', 'authored', 'published_at', 'reviewer']) expect(text).not.toContain(internal);
      expect(Object.keys(items[0]).sort()).toEqual(['applicability', 'archivedUrl', 'evidenceId', 'excerpt', 'firstSeen', 'lastChecked', 'limitations', 'market', 'publisher', 'sourceType', 'sourceUrl', 'title', 'trustTier']);
    });

    it('orders claims and evidence by code unit: the same order on every device', async () => {
      await admin(db, `insert into public.product_claims(id, version_id, claim_key, statement) values ($1, $3, 'Zed', 'Z'), ($2, $3, 'alpha', 'A')`, [id(81), id(82), V_SHAMPOO_PLAIN]);
      for (const claim of [CLAIM, id(81), id(82)]) await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim });
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims.content.items.map((c: any) => c.claimKey)).toEqual(['Zed', 'alpha', 'repair']);
      await admin(db, `insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values ($1, $2, 'https://example.test/t1', 'regulator', 'T1', 'ZA', '2024-01-01', '2024-06-01')`, [id(83), V_SHAMPOO_PLAIN]);
      await evidence(db, { title: 'B marketing' });
      await evidence(db, { title: 'A regulator', source: id(83) });
      const order = (await detail(db, V_SHAMPOO_PLAIN)).claims.content.items.find((c: any) => c.claimKey === 'repair').evidence.map((e: any) => e.title);
      expect(order).toEqual(['A regulator', 'B marketing']);
    });

    it('orders by the text that is shown: stray spaces never reorder claims or evidence', async () => {
      await admin(db, `insert into public.product_claims(id, version_id, claim_key, statement) values ($1, $3, ' b', 'B'), ($2, $3, 'a', 'A')`, [id(84), id(85), V_SHAMPOO_PLAIN]);
      for (const claim of [id(84), id(85)]) await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim });
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims.content.items.map((c: any) => c.claimKey)).toEqual(['a', 'b']);
    });

    it('caps the owner history summary at 500 entries so the detail always parses', async () => {
      const rec = await shelfAdd(db);
      await match(db, rec.userProductId, V_SHAMPOO_PLAIN);
      const result = await detail(db, V_SHAMPOO_PLAIN, rec.userProductId);
      expect(result.owner.revisions.length).toBeLessThanOrEqual(500);
    });

    it('bounds the response: at most 50 claims and 20 evidence entries per claim', async () => {
      for (let n = 0; n < 55; n += 1) {
        const claim = id(1000 + n);
        await admin(db, `insert into public.product_claims(id, version_id, claim_key, statement) values ($1, $2, $3, 's')`, [claim, V_SHAMPOO_PLAIN, `k${String(n).padStart(3, '0')}`]);
        await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim });
      }
      const kept = (await detail(db, V_SHAMPOO_PLAIN)).claims.content.items.map((c: any) => c.claimKey);
      expect(kept).toHaveLength(50);
      expect(kept).toEqual(Array.from({ length: 50 }, (_, n) => `k${String(n).padStart(3, '0')}`));
    });

    it('bounds the evidence of one claim at 20, keeping the first in stable order', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      for (let n = 0; n < 22; n += 1) await evidence(db, { title: `E${String(n).padStart(2, '0')}` });
      const shown = (await detail(db, V_SHAMPOO_PLAIN)).claims.content.items[0].evidence;
      expect(shown).toHaveLength(20);
      expect(shown.map((e: any) => e.title)).toEqual(Array.from({ length: 20 }, (_, n) => `E${String(n).padStart(2, '0')}`));
    });

    it('keeps a retired version readable and labelled retired, with no automatic successor', async () => {
      const result = await detail(db, V_MASK_RETIRED);
      expect(result.identity.versionId).toBe(V_MASK_RETIRED);
      expect(result.lifecycle).toEqual({ state: 'retired', successor: { state: 'not_published' } });
      expect(JSON.stringify(result)).not.toContain(V_MASK_SUCCESSOR);
      await publication(db, { version: V_MASK_RETIRED, subject: 'successor', state: 'review' });
      expect((await detail(db, V_MASK_RETIRED)).lifecycle.successor).toEqual({ state: 'under_review' });
      await admin(db, `update public.product_publications set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where version_id = $1 and subject = 'successor'`, [V_MASK_RETIRED, REVIEWER]);
      const published = await detail(db, V_MASK_RETIRED);
      expect(published.identity.versionId).toBe(V_MASK_RETIRED);
      expect(published.lifecycle.successor).toEqual({ state: 'published', version: { versionId: V_MASK_SUCCESSOR, brand: 'Other Co', productName: 'Deep Mask', variant: 'Reformulated' } });
    });

    it('returns the exact version asked for, in its own market, never a sibling or a successor', async () => {
      for (const version of [V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL, V_CONDITIONER, V_MASK_SUCCESSOR]) {
        expect((await detail(db, version)).identity.versionId).toBe(version);
      }
    });

    it('fails safely for a missing, nonexistent or malformed version', async () => {
      await expect(detail(db, null)).rejects.toThrow(/invalid-detail/);
      await expect(detail(db, crypto.randomUUID())).rejects.toThrow(/not-found/);
      await expect(db.query(`select public.catalogue_product_detail($1, null)`, ["x'; drop table public.brands; --"])).rejects.toThrow(/invalid input syntax for type uuid/);
      await expect(db.query(`select public.catalogue_product_detail($1, null)`, ['not-a-uuid'])).rejects.toThrow(/invalid input syntax/);
      expect((await db.query('select count(*)::int n from public.brands')).rows[0]).toEqual({ n: 2 });
    });

    it('is closed to anonymous callers and to a token with no user', async () => {
      await asUser(db, null);
      await expect(detail(db, V_SHAMPOO_PLAIN)).rejects.toThrow(/permission denied/i);
      await db.exec('set session authorization postgres');
      await db.query(`select set_config('request.jwt.claim.sub','',false)`);
      await db.query(`select set_config('request.jwt.claims','{"role":"authenticated"}',false)`);
      await db.exec('set session authorization authenticated');
      await expect(detail(db, V_SHAMPOO_PLAIN)).rejects.toThrow(/authentication-required/);
    });

    it('is read-only: a detail read writes nothing', async () => {
      await shelfAdd(db);
      const before = await counts(db);
      await detail(db, V_SHAMPOO_PLAIN);
      expect(await counts(db)).toEqual(before);
    });

    it('is defined as a narrow definer core behind an invoker wrapper, with no anonymous execute', async () => {
      const meta = await admin(db, `select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig, p.provolatile,
          has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authed
        from pg_proc p where p.proname in ('catalogue_product_detail', 'catalogue_detail_core') order by p.proname`);
      const byName = Object.fromEntries(meta.rows.map((row: any) => [row.proname, row]));
      expect(byName.catalogue_product_detail).toMatchObject({ prosecdef: false, anon: false, authed: true, provolatile: 's' });
      expect(byName.catalogue_detail_core).toMatchObject({ prosecdef: true, owner: 'strandcue_catalogue_reader', anon: false, authed: true, provolatile: 's' });
      for (const row of meta.rows) expect(row.proconfig).toContain('search_path=""');
      const reader = await admin(db, `select rolsuper, rolbypassrls, rolcanlogin, rolinherit from pg_roles where rolname = 'strandcue_catalogue_reader'`);
      expect(reader.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: false, rolinherit: false });
    });
  });

  describe('the owner context', () => {
    it('returns no owner facts without a Shelf context, and the owner own facts with one', async () => {
      const rec = await shelfAdd(db, 'My shampoo guess');
      await match(db, rec.userProductId, V_SHAMPOO_PLAIN);
      expect((await detail(db, V_SHAMPOO_PLAIN)).owner).toBeNull();
      const result = await detail(db, V_SHAMPOO_PLAIN, rec.userProductId);
      expect(result.owner).toMatchObject({
        userProductId: rec.userProductId, matched: true, matchConfirmed: true, manualBrand: 'House brand', manualName: 'My shampoo guess',
        manualSize: '250 ml', notes: 'Mine', availability: 'available',
      });
      expect(result.owner.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'match']);
      expect(Object.keys(result.owner.revisions[0]).sort()).toEqual(['correctsId', 'id', 'kind', 'matchVersionId']);
      // The catalogue facts stay the catalogue's: the owner wording never replaces them.
      expect(result.identity.productName).toBe('Gentle Shampoo');
      expect(JSON.stringify(result.identity)).not.toContain('My shampoo guess');
    });

    it('refuses a foreign, unmatched or differently matched product with one answer, and discloses nothing', async () => {
      const mine = await shelfAdd(db, 'Mine');
      await match(db, mine.userProductId, V_SHAMPOO_PLAIN);
      const unmatched = await shelfAdd(db, 'Unmatched');
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      const theirs = await shelfAdd(db, 'Owner B private');
      await match(db, theirs.userProductId, V_SHAMPOO_PLAIN);
      // Owner A asks for Owner B's product.
      await asUser(db, USER_A);
      await expect(detail(db, V_SHAMPOO_PLAIN, theirs.userProductId)).rejects.toThrow(/not-found/);
      await expect(detail(db, V_SHAMPOO_PLAIN, crypto.randomUUID())).rejects.toThrow(/not-found/);
      // Their own product, but not matched to this exact version.
      await expect(detail(db, V_CONDITIONER, mine.userProductId)).rejects.toThrow(/not-found/);
      await expect(detail(db, V_SHAMPOO_PLAIN, unmatched.userProductId)).rejects.toThrow(/not-found/);
      // The mirror image.
      await asUser(db, USER_B);
      await expect(detail(db, V_SHAMPOO_PLAIN, mine.userProductId)).rejects.toThrow(/not-found/);
      expect((await detail(db, V_SHAMPOO_PLAIN, theirs.userProductId)).owner.manualName).toBe('Owner B private');
      expect(JSON.stringify(await detail(db, V_SHAMPOO_PLAIN))).not.toContain('Mine');
    });

    it('keeps the historical version for an owned retired match, with no successor swapped in', async () => {
      const rec = await shelfAdd(db);
      await match(db, rec.userProductId, V_MASK_RETIRED);
      await publication(db, { version: V_MASK_RETIRED, subject: 'successor' });
      const result = await detail(db, V_MASK_RETIRED, rec.userProductId);
      expect(result.identity.versionId).toBe(V_MASK_RETIRED);
      expect(result.lifecycle.state).toBe('retired');
      expect(result.owner.userProductId).toBe(rec.userProductId);
      await expect(detail(db, V_MASK_SUCCESSOR, rec.userProductId)).rejects.toThrow(/not-found/);
    });
  });

  describe('immutability and constraints of published content', () => {
    it('refuses to edit or delete a published publication, allowing only withdrawal or supersession', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      await expect(admin(db, `update public.product_publications set authored_by = 'Someone else'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.product_publications set reviewed_by = 'Someone else'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.product_publications`)).rejects.toThrow(/published-immutable/);
      await admin(db, `update public.product_publications set state = 'withdrawn'`);
      expect((await detail(db, V_SHAMPOO_PLAIN)).directions).toEqual({ state: 'withdrawn' });
      await expect(admin(db, `update public.product_publications set state = 'published'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.product_publications`)).rejects.toThrow(/published-immutable/);
    });

    it('refuses to edit published evidence, and the content a publication points at', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      await evidence(db, {});
      await expect(admin(db, `update public.product_claim_evidence set limitations = 'changed'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.product_claim_evidence`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.product_claims set statement = 'changed' where id = $1`, [CLAIM])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.product_sources set source_url = 'https://example.test/other'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.product_versions set structured_directions = '{}' where id = $1`, [V_SHAMPOO_PLAIN])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.product_versions set barcode = '6001234567899' where id = $1`, [V_SHAMPOO_PLAIN])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.product_versions where id = $1`, [V_SHAMPOO_PLAIN])).rejects.toThrow(/published-immutable/);
      // Retirement is a lifecycle transition, not an edit: allowed once, never undone, and the version stays itself.
      await admin(db, `update public.product_versions set lifecycle = 'retired' where id = $1`, [V_SHAMPOO_PLAIN]);
      await expect(admin(db, `update public.product_versions set lifecycle = 'active' where id = $1`, [V_SHAMPOO_PLAIN])).rejects.toThrow(/published-immutable/);
      expect((await detail(db, V_SHAMPOO_PLAIN)).identity.versionId).toBe(V_SHAMPOO_PLAIN);
      // A version nothing was published for stays an ordinary draft row.
      await admin(db, `update public.product_versions set structured_directions = '{}' where id = $1`, [V_CONDITIONER]);
    });

    it('requires a second, named person and a review date before anything is published', async () => {
      const insert = async (reviewer: string | null, author: string, reviewedAt: string | null, publishedAt: string | null) => {
        await admin(db, `delete from public.product_publications where version_id = $1`, [V_SHAMPOO_PLAIN]);
        await admin(db, `insert into public.product_publications(version_id, subject, state, authored_by) values ($1, 'directions', 'review', $2)`, [V_SHAMPOO_PLAIN, author]);
        await admin(db, `update public.product_publications set state = 'published', reviewed_by = $2, reviewed_at = $3, published_at = $4 where version_id = $1`, [V_SHAMPOO_PLAIN, reviewer, reviewedAt, publishedAt]);
      };
      await expect(insert(null, AUTHOR, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).rejects.toThrow(/product_publication_review/);
      await expect(insert(AUTHOR, AUTHOR, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).rejects.toThrow(/violates/i);
      await expect(insert(' author ann', AUTHOR, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).rejects.toThrow(/violates/i);
      for (const placeholder of ['unknown', 'Unassigned', 'TBD', 'reviewer-a', 'test', 'fixture']) {
        await expect(insert(placeholder, AUTHOR, '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).rejects.toThrow(/violates/i);
      }
      await expect(insert(REVIEWER, AUTHOR, null, '2024-01-02T00:00:00Z')).rejects.toThrow(/violates/i);
      await expect(insert(REVIEWER, AUTHOR, '2024-01-01T00:00:00Z', null)).rejects.toThrow(/violates/i);
      await expect(insert(REVIEWER, ' ', '2024-01-01T00:00:00Z', '2024-01-02T00:00:00Z')).rejects.toThrow(/violates/i);
    });

    it('requires the same second-person rule for evidence', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      const attempt = async (reviewer: string | null, author: string) => {
        const evidenceId = crypto.randomUUID();
        await admin(db, `insert into public.product_claim_evidence(id, claim_id, version_id, source_id, title, publisher, applicability, limitations, state, authored_by)
          values ($1, $2, $3, $4, 't', 'p', 'a', 'l', 'review', $5)`, [evidenceId, CLAIM, V_SHAMPOO_PLAIN, SOURCE, author]);
        await admin(db, `update public.product_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where id = $1`, [evidenceId, reviewer]);
      };
      for (const [reviewer, author] of [[null, AUTHOR], [AUTHOR, AUTHOR], ['unknown', AUTHOR], ['TBD', AUTHOR]] as const) {
        await expect(attempt(reviewer, author)).rejects.toThrow(/product_evidence_review/);
      }
      await expect(attempt(REVIEWER, AUTHOR)).resolves.toBeUndefined();
    });

    it('binds review to content: publishing is refused if the content changed after review began', async () => {
      await admin(db, `update public.product_versions set structured_directions = '{"instructions":"Apply once."}'::jsonb where id = $1`, [V_SHAMPOO_PLAIN]);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions', state: 'review' });
      await admin(db, `update public.product_versions set structured_directions = '{"instructions":"Apply twice."}'::jsonb where id = $1`, [V_SHAMPOO_PLAIN]);
      await expect(admin(db, `update public.product_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now()`, [REVIEWER])).rejects.toThrow(/content-changed-since-review/);
      // A claim is bound the same way.
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM, state: 'review' });
      await admin(db, `update public.product_claims set statement = 'Edited after review' where id = $1`, [CLAIM]);
      await expect(admin(db, `update public.product_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now() where claim_id = $2`, [REVIEWER, CLAIM])).rejects.toThrow(/content-changed-since-review/);
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims).toEqual({ state: 'under_review' });
    });

    it('binds evidence to its review too: text or source changed after review, and rows never reviewed, are refused', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      const edited = await evidence(db, { state: 'review', title: 'Reviewed title' });
      await admin(db, `update public.product_claim_evidence set limitations = 'Edited after review' where id = $1`, [edited]);
      await expect(admin(db, `update public.product_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where id = $1`, [edited, REVIEWER])).rejects.toThrow(/content-changed-since-review/);
      const cited = await evidence(db, { state: 'review', title: 'Source edited later' });
      await admin(db, `update public.product_sources set source_url = 'https://example.test/changed' where id = $1`, [SOURCE]);
      await expect(admin(db, `update public.product_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where id = $1`, [cited, REVIEWER])).rejects.toThrow(/content-changed-since-review/);
      await expect(admin(db, `insert into public.product_claim_evidence(claim_id, version_id, source_id, title, publisher, applicability, limitations, state, authored_by, reviewed_by, reviewed_at, published_at)
        values ($1, $2, $3, 't', 'p', 'a', 'l', 'published', $4, $5, now(), now())`, [CLAIM, V_SHAMPOO_PLAIN, SOURCE, AUTHOR, REVIEWER])).rejects.toThrow(/review-required/);
      expect(JSON.stringify((await detail(db, V_SHAMPOO_PLAIN)).claims)).not.toContain('Reviewed title');
    });

    it('refuses to publish a row that was never in review', async () => {
      await expect(admin(db, `insert into public.product_publications(version_id, subject, state, authored_by, reviewed_by, reviewed_at, published_at)
        values ($1, 'directions', 'published', $2, $3, now(), now())`, [V_SHAMPOO_PLAIN, AUTHOR, REVIEWER])).rejects.toThrow(/review-required/);
    });

    it('locks a reviewed successor link, and refuses truncating publication records', async () => {
      await admin(db, `update public.product_versions set structured_directions = '{"instructions":"Apply."}'::jsonb where id = $1`, [V_SHAMPOO_PLAIN]);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'successor', state: 'review' });
      await expect(admin(db, `update public.product_versions set successor_version_id = $2 where id = $1`, [V_SHAMPOO_PLAIN, V_SHAMPOO_TRAVEL])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, 'truncate public.product_publications')).rejects.toThrow(/published-immutable/);
      await expect(admin(db, 'truncate public.product_claim_evidence')).rejects.toThrow(/published-immutable/);
    });

    it('keeps withdrawn and superseded rows final, for claims and evidence too', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      const evidenceId = await evidence(db, {});
      await admin(db, `update public.product_claim_evidence set state = 'withdrawn' where id = $1`, [evidenceId]);
      await expect(admin(db, `update public.product_claim_evidence set state = 'published' where id = $1`, [evidenceId])).rejects.toThrow(/published-immutable/);
      await admin(db, `update public.product_publications set state = 'superseded' where claim_id = $1`, [CLAIM]);
      await expect(admin(db, `update public.product_publications set state = 'published' where claim_id = $1`, [CLAIM])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.product_publications where claim_id = $1`, [CLAIM])).rejects.toThrow(/published-immutable/);
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims).toEqual({ state: 'not_published' });
    });

    it('keeps a withdrawn claim publication apart from one never published', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM, state: 'withdrawn' });
      expect((await detail(db, V_SHAMPOO_PLAIN)).claims).toEqual({ state: 'withdrawn' });
    });

    it('fails closed for a role that cannot see the publication tables: a guard error, never a silent edit', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      await db.exec('set session authorization postgres');
      await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'catalogue_admin_probe') then create role catalogue_admin_probe nologin nobypassrls; end if; end $$`);
      await db.exec(`grant usage on schema public, strandcue_private to catalogue_admin_probe; grant select, update on public.product_claims to catalogue_admin_probe`);
      await db.exec(`drop policy if exists probe_update on public.product_claims; create policy probe_update on public.product_claims for all to catalogue_admin_probe using (true) with check (true)`);
      await db.exec('set role catalogue_admin_probe');
      let failure: unknown;
      try { await db.query(`update public.product_claims set statement = 'Silently edited' where id = $1`, [CLAIM]); } catch (error) { failure = error; }
      await db.exec('reset role');
      await asUser(db, USER_A);
      expect(failure).toBeTruthy();
      expect((await admin(db, 'select statement from public.product_claims where id = $1', [CLAIM])).rows[0].statement).toBe(SECRET_CLAIM);
    });

    it('orders evidence by tier number: T2 before T10', async () => {
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'claim', claim: CLAIM });
      await admin(db, `insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values ($1, $2, 'https://example.test/t2', 'professional_body', 'T2', 'ZA', '2024-01-01', '2024-06-01')`, [id(86), V_SHAMPOO_PLAIN]);
      await evidence(db, { title: 'Marketing page' });
      await evidence(db, { title: 'Professional body', source: id(86) });
      const titles = (await detail(db, V_SHAMPOO_PLAIN)).claims.content.items[0].evidence.map((e: any) => e.title);
      expect(titles).toEqual(['Professional body', 'Marketing page']);
    });

    it('keeps draft catalogue content out of the owner export', async () => {
      const rec = await shelfAdd(db);
      await match(db, rec.userProductId, V_SHAMPOO_PLAIN);
      await db.exec('set session authorization postgres');
      await db.query(
        `insert into public.product_verification_events(id, version_id, reviewer, reviewed_fields, status, reason)
         values (gen_random_uuid(), $1, 'Draft Reviewer Dora', '{name}', 'verified', 'draft review')`, [V_SHAMPOO_PLAIN]);
      await asUser(db, USER_A);
      const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }];
      await db.query(`select set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ sub: USER_A, role: 'authenticated', email: `${USER_A}@example.test`, is_anonymous: false, amr })]);
      const receipt = (await db.query<{ result: any }>(`select public.export_request($1, 'json') result`, [crypto.randomUUID()])).rows[0].result;
      const download = (await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId])).rows[0].result;
      const entry = download.document.userProducts[0];
      expect(entry.catalogueVersion).toMatchObject({ id: V_SHAMPOO_PLAIN, lifecycle: 'active' });
      expect(entry.claims).toEqual([]);
      expect(entry.verificationEvents).toEqual([]);
      const text = JSON.stringify(download.document);
      for (const draft of [SECRET_CLAIM, SECRET_INGREDIENT, SECRET_DIRECTION, SECRET_SOURCE, 'Draft Reviewer Dora']) expect(text).not.toContain(draft);
      expect(entry.product.manual_name).toBe('My guess');
    });

    it('gives the read-only role no write privileges and no login', async () => {
      const writes = await admin(db, `select count(*)::int n from information_schema.role_table_grants where grantee = 'strandcue_catalogue_reader' and privilege_type <> 'SELECT'`);
      expect(writes.rows[0].n).toBe(0);
    });

    it('keeps a claim publication tied to a claim of the same version, and one published copy at a time', async () => {
      await expect(admin(db, `insert into public.product_publications(version_id, subject, state, authored_by) values ($1, 'claim', 'review', 'x')`, [V_SHAMPOO_PLAIN])).rejects.toThrow(/violates/i);
      await expect(admin(db, `insert into public.product_publications(version_id, subject, claim_id, state, authored_by) values ($1, 'directions', $2, 'review', 'x')`, [V_SHAMPOO_PLAIN, CLAIM])).rejects.toThrow(/violates/i);
      await expect(admin(db, `insert into public.product_publications(version_id, subject, claim_id, state, authored_by) values ($1, 'claim', $2, 'review', 'x')`, [V_CONDITIONER, CLAIM])).rejects.toThrow(/violates|foreign key/i);
      await publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' });
      await expect(publication(db, { version: V_SHAMPOO_PLAIN, subject: 'directions' })).rejects.toThrow(/unique|duplicate/i);
    });

    it('keeps evidence tied to a source and a claim of the same exact version', async () => {
      await expect(evidence(db, { version: V_CONDITIONER })).rejects.toThrow(/violates|foreign key/i);
      await admin(db, `insert into public.product_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values ($1, $2, 'https://example.test/c', 'manufacturer', 'T5', 'ZA', '2024-01-01', '2024-06-01')`, [id(91), V_CONDITIONER]);
      await expect(evidence(db, { source: id(91) })).rejects.toThrow(/violates|foreign key/i);
    });

    it('enforces row-level security on the new tables', async () => {
      const rows = await admin(db, `select relname from pg_class where relname in ('product_publications','product_claim_evidence') and (not relrowsecurity or not relforcerowsecurity)`);
      expect(rows.rows).toEqual([]);
    });
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import {
  T_CLAIM, T_SECRET_CLAIM, T_SECRET_REVIEWER, T_SECRET_SOURCE, T_SOURCE, TV_DRYER, TV_IRON, TV_STEAMER_NEW, TV_STEAMER_OLD,
  clearToolCatalogue, seedToolCatalogue, tid,
} from '../helpers/tool-catalogue-fixture.ts';

const DAY = { precision: 'day', value: '2026-03-01' };
const REVIEWER = 'Reviewer Rita';
const AUTHOR = 'Author Ann';
const acting = { user: USER_A };

async function admin<T extends Record<string, any>>(db: PGlite, sql: string, values: unknown[] = []): Promise<T[]> {
  await db.exec('set session authorization postgres');
  try { return (await db.query<T>(sql, values)).rows; } finally { await asUser(db, acting.user); }
}
const search = async (db: PGlite, query: string | null, limit: number | null = 10) =>
  (await db.query<{ result: any }>(`select public.tool_catalogue_search($1, $2) result`, [query, limit])).rows[0].result;
const detail = async (db: PGlite, versionId: string | null, userToolId: string | null = null) =>
  (await db.query<{ result: any }>(`select public.tool_catalogue_detail($1, $2) result`, [versionId, userToolId])).rows[0].result;

async function publish(db: PGlite, o: { version: string; subject: string; claim?: string | null; state?: string; reviewer?: string | null }) {
  const state = o.state ?? 'published';
  const insert = (rowState: string) => admin(db, `insert into public.tool_publications(version_id, subject, claim_id, state, authored_by, reviewed_by, reviewed_at, published_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8)`, [o.version, o.subject, o.claim ?? null, rowState, AUTHOR,
    rowState === 'review' ? null : (o.reviewer === undefined ? REVIEWER : o.reviewer),
    rowState === 'review' ? null : '2024-06-02T10:00:00Z', rowState === 'review' ? null : '2024-06-03T10:00:00Z']);
  if (state !== 'review' && state !== 'published') { await insert(state); return; }
  await insert('review');
  if (state === 'published') {
    await admin(db, `update public.tool_publications set state = 'published', reviewed_by = $4, reviewed_at = '2024-06-02T10:00:00Z', published_at = '2024-06-03T10:00:00Z'
      where version_id = $1 and subject = $2 and claim_id is not distinct from $3 and state = 'review'`,
    [o.version, o.subject, o.claim ?? null, o.reviewer === undefined ? REVIEWER : o.reviewer]);
  }
}
async function evidence(db: PGlite, o: { title?: string; state?: string; approved?: boolean; source?: string } = {}) {
  const evidenceId = crypto.randomUUID();
  const state = o.state ?? 'published';
  const insert = (rowState: string) => admin(db, `insert into public.tool_claim_evidence(id, claim_id, version_id, source_id, title, publisher, applicability, limitations, excerpt, excerpt_consumer_approved, state, authored_by, reviewed_by, reviewed_at, published_at)
    values ($1, $2, $3, $4, $5, 'Salon Brand', 'This exact version only.', 'A statement, not a test.', 'Approved excerpt', $6, $7, $8, $9, $10, $11)`,
  [evidenceId, T_CLAIM, TV_DRYER, o.source ?? T_SOURCE, o.title ?? 'Spec sheet', o.approved ?? false, rowState, AUTHOR,
    rowState === 'review' ? null : REVIEWER, rowState === 'review' ? null : '2024-06-02T10:00:00Z', rowState === 'review' ? null : '2024-06-03T10:00:00Z']);
  if (state === 'review' || state === 'published') {
    await insert('review');
    if (state === 'published') await admin(db, `update public.tool_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where id = $1`, [evidenceId, REVIEWER]);
  } else await insert(state);
  return evidenceId;
}
async function addTool(db: PGlite, facts: unknown = { manualBrand: 'Mine', manualModel: 'My dryer', toolType: 'dryer', wattageWatts: 1900, settings: { state: 'recorded', items: [{ label: 'High', temperature: null }] }, notes: 'Private' }) {
  return (await db.query<{ result: any }>(`select public.tool_add($1, $2, 'available', $3::jsonb, $4::jsonb) result`,
    [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(DAY), JSON.stringify(facts)])).rows[0].result;
}
const match = (db: PGlite, id: string, versionId: string, revision = 1) => db.query(`select public.tool_match($1, $2, $3, $4, true)`, [crypto.randomUUID(), id, revision, versionId]);

describe('tool catalogue publication boundary', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { acting.user = USER_A; await asUser(db, USER_A); await complete(db, 'user_a'); await seedToolCatalogue(db); await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('alter table public.tool_publications disable trigger user; alter table public.tool_claim_evidence disable trigger user');
    await db.exec('delete from public.tool_claim_evidence; delete from public.tool_publications');
    await db.exec('alter table public.tool_publications enable trigger user; alter table public.tool_claim_evidence enable trigger user');
    await clearToolCatalogue(db);
  });
  afterAll(async () => { await db?.close(); });

  describe('what a consumer can read directly', () => {
    it('closes draft claims, sources, events, publications and capability columns', async () => {
      for (const table of ['tool_claims', 'tool_sources', 'tool_verification_events', 'tool_publications', 'tool_claim_evidence']) {
        await expect(db.query(`select 1 from public.${table}`), table).rejects.toThrow(/permission denied/i);
      }
      for (const column of ['wattage_watts', 'temperature_max_celsius', 'adjustable_temp', 'contact_heat', 'air_heat', 'successor_version_id']) {
        await expect(db.query(`select ${column} from public.tool_versions`), column).rejects.toThrow(/permission denied/i);
      }
      await expect(db.query('select * from public.tool_versions')).rejects.toThrow(/permission denied/i);
    });

    it('keeps identity and lifecycle readable, and gives no write path to anyone', async () => {
      expect((await db.query('select id, tool_id, version_label, market, lifecycle from public.tool_versions')).rows).toHaveLength(4);
      expect((await db.query('select name from public.tool_brands')).rows).toHaveLength(2);
      expect((await db.query('select name, tool_type from public.tools')).rows).toHaveLength(3);
      for (const sql of [
        `insert into public.tool_publications(version_id, subject, state, authored_by) values ('${TV_DRYER}', 'capabilities', 'review', 'x')`,
        `update public.tool_publications set state = 'published'`, `delete from public.tool_publications`,
        `update public.tool_claim_evidence set state = 'published'`, `update public.tool_versions set lifecycle = 'retired'`, `delete from public.tool_claims`,
      ]) await expect(db.exec(sql)).rejects.toThrow(/permission denied|violates/i);
      for (const role of ['anon', 'authenticated']) {
        const grants = await admin(db, `select count(*)::int n from information_schema.role_table_grants where grantee = $1 and table_name in ('tool_publications','tool_claim_evidence') and privilege_type <> 'SELECT'`, [role]);
        expect(grants[0].n).toBe(0);
      }
      const rls = await admin(db, `select relname from pg_class where relname in ('tool_publications','tool_claim_evidence') and (not relrowsecurity or not relforcerowsecurity)`);
      expect(rls).toEqual([]);
    });
  });

  describe('search', () => {
    it('finds exact versions by brand, tool, version label and type, in a fixed order', async () => {
      expect((await search(db, 'pro dryer')).results.map((r: any) => r.versionId)).toEqual([TV_DRYER]);
      expect((await search(db, 'salon brand')).results.map((r: any) => r.versionId)).toEqual([TV_DRYER, TV_IRON]);
      expect((await search(db, 'gen')).results.map((r: any) => r.versionId)).toEqual([TV_IRON]);
      expect((await search(db, 'flat-iron')).results.map((r: any) => r.versionId)).toEqual([TV_IRON]);
      expect((await search(db, 'steam press')).results.map((r: any) => r.versionId)).toEqual([TV_STEAMER_NEW, TV_STEAMER_OLD]);
      const limited = await search(db, 'salon brand', 1);
      expect(limited).toMatchObject({ truncated: true });
      expect(limited.results).toHaveLength(1);
    });

    it('answers identity and lifecycle only, never a capability, claim, source, reviewer or successor id', async () => {
      const response = await search(db, 'steam press');
      for (const result of response.results) {
        expect(Object.keys(result).sort()).toEqual(['brand', 'lifecycle', 'market', 'toolId', 'toolName', 'toolType', 'versionId', 'versionLabel']);
      }
      expect(response.results.find((r: any) => r.versionId === TV_STEAMER_OLD).lifecycle).toBe('retired');
      const text = JSON.stringify(await search(db, 'pro dryer'));
      for (const secret of [T_SECRET_CLAIM, T_SECRET_SOURCE, T_SECRET_REVIEWER, '2200', 'wattage', 'contact', TV_STEAMER_NEW]) expect(text).not.toContain(secret);
    });

    it('bounds and validates its input, treats text as data and is closed to anonymous callers', async () => {
      for (const [query, limit] of [[null, 10], ['', 10], ['a', 10], ['gentle a', 10], ['x'.repeat(81), 10], ['one two three four five six seven', 10], ['bad\u0001text', 10], ['dryer', 0], ['dryer', 26], ['dryer', null]] as [string | null, number | null][]) {
        await expect(search(db, query, limit)).rejects.toThrow(/invalid-search/);
      }
      for (const query of ["x'; drop table public.tools; --", '%%', '__', "'' or ''1''=''1"]) expect((await search(db, query)).results).toEqual([]);
      expect((await db.query('select count(*)::int n from public.tools')).rows[0]).toEqual({ n: 3 });
      await asUser(db, null);
      await expect(search(db, 'pro dryer')).rejects.toThrow(/permission denied/i);
    });
  });

  describe('detail', () => {
    it('shows identity and honest unpublished states for a draft-only version, and no draft fact', async () => {
      const result = await detail(db, TV_DRYER);
      expect(Object.keys(result).sort()).toEqual(['capabilities', 'claims', 'identity', 'lifecycle', 'owner']);
      expect(result.identity).toMatchObject({ versionId: TV_DRYER, brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer' });
      expect(result.capabilities).toEqual({ state: 'not_published' });
      expect(result.claims).toEqual({ state: 'not_published' });
      expect(result.owner).toBeNull();
      const text = JSON.stringify(result);
      for (const secret of [T_SECRET_CLAIM, T_SECRET_SOURCE, T_SECRET_REVIEWER, '2200', 'airHeat']) expect(text).not.toContain(secret);
    });

    it('shows published capabilities with their independent unknowns, and only then', async () => {
      await publish(db, { version: TV_DRYER, subject: 'capabilities' });
      const { capabilities } = await detail(db, TV_DRYER);
      expect(capabilities).toEqual({ state: 'published', content: { wattageWatts: 2200, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'no', airHeat: 'yes' } });
      // A known wattage is not a temperature, and the iron stays its own version.
      expect((await detail(db, TV_IRON)).capabilities).toEqual({ state: 'not_published' });
    });

    it('keeps under review, withdrawn, superseded and rejected apart and never current', async () => {
      await publish(db, { version: TV_DRYER, subject: 'capabilities', state: 'review' });
      expect((await detail(db, TV_DRYER)).capabilities).toEqual({ state: 'under_review' });
      await publish(db, { version: TV_IRON, subject: 'capabilities', state: 'withdrawn' });
      expect((await detail(db, TV_IRON)).capabilities).toEqual({ state: 'withdrawn' });
      await publish(db, { version: TV_STEAMER_NEW, subject: 'capabilities', state: 'superseded' });
      expect((await detail(db, TV_STEAMER_NEW)).capabilities).toEqual({ state: 'not_published' });
      await publish(db, { version: TV_STEAMER_OLD, subject: 'capabilities', state: 'rejected' });
      expect((await detail(db, TV_STEAMER_OLD)).capabilities).toEqual({ state: 'not_published' });
    });

    it('shows a published claim with its published evidence only, without reviewer or author names', async () => {
      await publish(db, { version: TV_DRYER, subject: 'claim', claim: T_CLAIM });
      await evidence(db, { title: 'Hidden', state: 'review' });
      await evidence(db, { title: 'Old', state: 'superseded' });
      await evidence(db, { title: 'Shown', approved: true });
      const result = await detail(db, TV_DRYER);
      const [claim] = result.claims.content.items;
      expect(claim).toMatchObject({ claimKey: 'even-heat', statement: T_SECRET_CLAIM });
      expect(claim.evidence.map((e: any) => e.title)).toEqual(['Shown']);
      expect(claim.evidence[0]).toMatchObject({ sourceType: 'marketing', trustTier: 'T10', excerpt: 'Approved excerpt' });
      const text = JSON.stringify(result);
      for (const internal of [REVIEWER, AUTHOR, T_SECRET_REVIEWER, 'Hidden', 'Old', 'reviewed_by']) expect(text).not.toContain(internal);
    });

    it('hides a claim that is only in review and evidence of an unpublished claim', async () => {
      await publish(db, { version: TV_DRYER, subject: 'claim', claim: T_CLAIM, state: 'review' });
      await evidence(db, {});
      const result = await detail(db, TV_DRYER);
      expect(result.claims).toEqual({ state: 'under_review' });
      expect(JSON.stringify(result)).not.toContain(T_SECRET_CLAIM);
    });

    it('keeps a retired version readable, and a successor is a pointer that needs its own publication', async () => {
      let result = await detail(db, TV_STEAMER_OLD);
      expect(result.identity.versionId).toBe(TV_STEAMER_OLD);
      expect(result.lifecycle).toEqual({ state: 'retired', successor: { state: 'not_published' } });
      expect(JSON.stringify(result)).not.toContain(TV_STEAMER_NEW);
      await publish(db, { version: TV_STEAMER_OLD, subject: 'successor' });
      result = await detail(db, TV_STEAMER_OLD);
      expect(result.identity.versionId).toBe(TV_STEAMER_OLD);
      expect(result.lifecycle.successor).toEqual({ state: 'published', version: { versionId: TV_STEAMER_NEW, brand: 'Other Co', toolName: 'Steam Press', versionLabel: 'Reformulated' } });
    });

    it('fails safely for a missing, unknown or malformed version', async () => {
      await expect(detail(db, null)).rejects.toThrow(/invalid-detail/);
      await expect(detail(db, crypto.randomUUID())).rejects.toThrow(/not-found/);
      await expect(db.query(`select public.tool_catalogue_detail($1, null)`, ["x'; drop table public.tools; --"])).rejects.toThrow(/invalid input syntax/);
      expect((await db.query('select count(*)::int n from public.tools')).rows[0]).toEqual({ n: 3 });
      await asUser(db, null);
      await expect(detail(db, TV_DRYER)).rejects.toThrow(/permission denied/i);
    });

    it('binds an owner context to the caller and to the exact version, and discloses nothing else', async () => {
      const mine = await addTool(db);
      await match(db, mine.userToolId, TV_DRYER);
      expect((await detail(db, TV_DRYER)).owner).toBeNull();
      const result = await detail(db, TV_DRYER, mine.userToolId);
      expect(result.owner).toMatchObject({ userToolId: mine.userToolId, matched: true, matchConfirmed: true, manualBrand: 'Mine', manualModel: 'My dryer', wattageWatts: 1900, notes: 'Private' });
      expect(result.owner.settings).toEqual({ state: 'recorded', items: [{ label: 'High', temperature: null }] });
      expect(Object.keys(result.owner.revisions[0]).sort()).toEqual(['correctsId', 'id', 'kind', 'matchVersionId']);
      // The owner's wattage and the catalogue's stay separate answers.
      expect(result.capabilities).toEqual({ state: 'not_published' });
      expect(JSON.stringify(result.identity)).not.toContain('Mine');
      const unmatched = await addTool(db, { manualModel: 'Unmatched' });
      await asUser(db, USER_B);
      acting.user = USER_B;
      await complete(db, 'user_b');
      const theirs = await addTool(db, { manualModel: 'Owner B private' });
      await match(db, theirs.userToolId, TV_DRYER);
      acting.user = USER_A;
      await asUser(db, USER_A);
      await expect(detail(db, TV_DRYER, theirs.userToolId)).rejects.toThrow(/not-found/);
      await expect(detail(db, TV_DRYER, crypto.randomUUID())).rejects.toThrow(/not-found/);
      await expect(detail(db, TV_IRON, mine.userToolId)).rejects.toThrow(/not-found/);
      await expect(detail(db, TV_DRYER, unmatched.userToolId)).rejects.toThrow(/not-found/);
      acting.user = USER_B;
      await asUser(db, USER_B);
      await expect(detail(db, TV_DRYER, mine.userToolId)).rejects.toThrow(/not-found/);
      expect((await detail(db, TV_DRYER, theirs.userToolId)).owner.manualModel).toBe('Owner B private');
    });

    it('keeps an owned retired version historical, with no successor swapped in', async () => {
      const mine = await addTool(db);
      await match(db, mine.userToolId, TV_STEAMER_OLD);
      await publish(db, { version: TV_STEAMER_OLD, subject: 'successor' });
      const result = await detail(db, TV_STEAMER_OLD, mine.userToolId);
      expect(result.identity.versionId).toBe(TV_STEAMER_OLD);
      expect(result.lifecycle.state).toBe('retired');
      await expect(detail(db, TV_STEAMER_NEW, mine.userToolId)).rejects.toThrow(/not-found/);
    });

    it('is read-only, uses a narrow definer core behind an invoker wrapper, and has no anonymous execute', async () => {
      const mine = await addTool(db);
      const before = (await admin<{ n: string }>(db, 'select (select count(*) from public.user_tool_revisions)::text || (select count(*) from strandcue_private.tool_operations)::text n'))[0].n;
      await detail(db, TV_DRYER, mine.userToolId).catch(() => undefined);
      await search(db, 'dryer');
      expect((await admin<{ n: string }>(db, 'select (select count(*) from public.user_tool_revisions)::text || (select count(*) from strandcue_private.tool_operations)::text n'))[0].n).toBe(before);
      const meta = await admin(db, `select p.proname, p.prosecdef, pg_get_userbyid(p.proowner) owner, p.proconfig, p.provolatile,
          has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') authed
        from pg_proc p where p.proname in ('tool_catalogue_detail', 'tool_catalogue_search', 'tool_detail_core')`);
      const byName = Object.fromEntries(meta.map((row: any) => [row.proname, row]));
      expect(byName.tool_catalogue_detail).toMatchObject({ prosecdef: false, anon: false, authed: true, provolatile: 's' });
      expect(byName.tool_catalogue_search).toMatchObject({ prosecdef: false, anon: false, authed: true, provolatile: 's' });
      expect(byName.tool_detail_core).toMatchObject({ prosecdef: true, owner: 'strandcue_catalogue_reader', anon: false, provolatile: 's' });
      for (const row of meta) expect(row.proconfig).toContain('search_path=""');
    });
  });

  describe('immutability and review binding', () => {
    it('refuses to edit or delete published rows, allowing only withdrawal or supersession', async () => {
      await publish(db, { version: TV_DRYER, subject: 'capabilities' });
      await expect(admin(db, `update public.tool_publications set authored_by = 'Someone else'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.tool_publications`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `update public.tool_versions set wattage_watts = 1 where id = $1`, [TV_DRYER])).rejects.toThrow(/published-immutable/);
      await expect(admin(db, `delete from public.tool_versions where id = $1`, [TV_DRYER])).rejects.toThrow(/published-immutable/);
      await admin(db, `update public.tool_versions set lifecycle = 'retired' where id = $1`, [TV_DRYER]);
      await expect(admin(db, `update public.tool_versions set lifecycle = 'active' where id = $1`, [TV_DRYER])).rejects.toThrow(/published-immutable/);
      await admin(db, `update public.tool_publications set state = 'withdrawn'`);
      expect((await detail(db, TV_DRYER)).capabilities).toEqual({ state: 'withdrawn' });
      await expect(admin(db, `update public.tool_publications set state = 'published'`)).rejects.toThrow(/published-immutable/);
      await expect(admin(db, 'truncate public.tool_publications')).rejects.toThrow(/published-immutable/);
    });

    it('binds review to each capability on its own: a wattage and a temperature cannot swap places unseen', async () => {
      await admin(db, `update public.tool_versions set wattage_watts = 250, temperature_max_celsius = null where id = $1`, [TV_DRYER]);
      await publish(db, { version: TV_DRYER, subject: 'capabilities', state: 'review' });
      await admin(db, `update public.tool_versions set wattage_watts = null, temperature_max_celsius = 250 where id = $1`, [TV_DRYER]);
      await expect(admin(db, `update public.tool_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now()`, [REVIEWER])).rejects.toThrow(/content-changed-since-review/);
    });

    it('binds review to content: a change after review began, or a row never reviewed, cannot be published', async () => {
      await publish(db, { version: TV_DRYER, subject: 'capabilities', state: 'review' });
      await admin(db, `update public.tool_versions set temperature_max_celsius = 250 where id = $1`, [TV_DRYER]);
      await expect(admin(db, `update public.tool_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now()`, [REVIEWER])).rejects.toThrow(/content-changed-since-review/);
      await expect(admin(db, `insert into public.tool_publications(version_id, subject, state, authored_by, reviewed_by, reviewed_at, published_at)
        values ($1, 'capabilities', 'published', $2, $3, now(), now())`, [TV_IRON, AUTHOR, REVIEWER])).rejects.toThrow(/review-required/);
      await publish(db, { version: TV_DRYER, subject: 'claim', claim: T_CLAIM, state: 'review' });
      await admin(db, `update public.tool_claims set statement = 'Edited after review' where id = $1`, [T_CLAIM]);
      await expect(admin(db, `update public.tool_publications set state = 'published', reviewed_by = $1, reviewed_at = now(), published_at = now() where claim_id = $2`, [REVIEWER, T_CLAIM])).rejects.toThrow(/content-changed-since-review/);
      const reviewed = await evidence(db, { state: 'review' });
      await admin(db, `update public.tool_claim_evidence set limitations = 'Edited after review' where id = $1`, [reviewed]);
      await expect(admin(db, `update public.tool_claim_evidence set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where id = $1`, [reviewed, REVIEWER])).rejects.toThrow(/content-changed-since-review/);
    });

    it('requires a second, named person before anything is published', async () => {
      const attempt = async (reviewer: string | null, author: string) => {
        await admin(db, `delete from public.tool_publications where version_id = $1`, [TV_IRON]);
        await admin(db, `insert into public.tool_publications(version_id, subject, state, authored_by) values ($1, 'capabilities', 'review', $2)`, [TV_IRON, author]);
        await admin(db, `update public.tool_publications set state = 'published', reviewed_by = $2, reviewed_at = now(), published_at = now() where version_id = $1`, [TV_IRON, reviewer]);
      };
      for (const [reviewer, author] of [[null, AUTHOR], [AUTHOR, AUTHOR], [' author ann', AUTHOR], ['unknown', AUTHOR], ['TBD', AUTHOR], ['reviewer-a', AUTHOR], [REVIEWER, ' ']] as const) {
        await expect(attempt(reviewer, author)).rejects.toThrow(/tool_publication_review|violates/);
      }
      await expect(attempt(REVIEWER, AUTHOR)).resolves.toBeUndefined();
    });

    it('ties publications to the same exact version and keeps one published copy', async () => {
      await expect(admin(db, `insert into public.tool_publications(version_id, subject, state, authored_by) values ($1, 'claim', 'review', 'x')`, [TV_DRYER])).rejects.toThrow(/violates/i);
      await expect(admin(db, `insert into public.tool_publications(version_id, subject, claim_id, state, authored_by) values ($1, 'claim', $2, 'review', 'x')`, [TV_IRON, T_CLAIM])).rejects.toThrow(/violates|foreign key/i);
      await expect(admin(db, `insert into public.tool_publications(version_id, subject, state, authored_by) values ($1, 'directions', 'review', 'x')`, [TV_DRYER])).rejects.toThrow(/violates/i);
      await publish(db, { version: TV_DRYER, subject: 'capabilities' });
      await expect(publish(db, { version: TV_DRYER, subject: 'capabilities' })).rejects.toThrow(/unique|duplicate/i);
    });
  });

  describe('the owner export', () => {
    async function exportDocument() {
      const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }];
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: acting.user, role: 'authenticated', email: `${acting.user}@example.test`, is_anonymous: false, amr })]);
      const receipt = (await db.query<{ result: any }>(`select public.export_request($1, 'json') result`, [crypto.randomUUID()])).rows[0].result;
      return (await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId])).rows[0].result.document;
    }

    it('carries the owner facts and history, and the matched identity, but no draft catalogue content', async () => {
      const mine = await addTool(db, { manualBrand: 'Mine', manualModel: 'My dryer', toolType: 'dryer', wattageWatts: 1900, adjustableTemp: 'unknown', condition: 'worn', heatMethods: { state: 'recorded', methods: ['heated-air'] }, notes: 'Private' });
      await match(db, mine.userToolId, TV_DRYER);
      await publish(db, { version: TV_DRYER, subject: 'capabilities', state: 'review' });
      const document = await exportDocument();
      expect(document.schemaVersions.export).toBe(4);
      const [entry] = document.userTools;
      expect(entry.tool).toMatchObject({ manual_model: 'My dryer', wattage_watts: 1900, adjustable_temp: 'unknown', condition: 'worn', notes: 'Private', matched: true, version_id: TV_DRYER });
      expect(entry.tool.heat_methods).toEqual({ state: 'recorded', methods: ['heated-air'] });
      expect(entry.revisions.map((r: any) => r.kind)).toEqual(['baseline', 'match']);
      expect(entry.catalogueVersion).toEqual({ id: TV_DRYER, tool_id: tid(21), version_label: '2024', market: 'ZA', lifecycle: 'active', created_at: expect.any(String) });
      expect(entry.claims).toEqual([]);
      expect(entry.verificationEvents).toEqual([]);
      const text = JSON.stringify(document);
      for (const draft of [T_SECRET_CLAIM, T_SECRET_SOURCE, T_SECRET_REVIEWER, 'wattage_watts":2200', 'temperature_max_celsius', 'contact_heat', 'air_heat', TV_STEAMER_NEW]) expect(text).not.toContain(draft);
    });

    it('exports the owner tool facts in the CSV too, with the new schema version', async () => {
      const mine = await addTool(db, { manualModel: 'My dryer', wattageWatts: 1900, settings: { state: 'recorded', items: [{ label: 'High', temperature: null }] }, condition: 'good' });
      await match(db, mine.userToolId, TV_DRYER);
      const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }];
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: acting.user, role: 'authenticated', email: `${acting.user}@example.test`, is_anonymous: false, amr })]);
      const receipt = (await db.query<{ result: any }>(`select public.export_request($1, 'csv') result`, [crypto.randomUUID()])).rows[0].result;
      const files = (await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId])).rows[0].result.document.files;
      const [header] = files['user_tools.csv'].split('\n');
      for (const column of ['wattage_watts', 'adjustable_temp', 'settings', 'attachments', 'condition', 'heat_methods']) expect(header).toContain(column);
      expect(files['user_tools.csv']).toContain('1900');
      expect(files['schema_versions.csv']).toContain('export,4');
      expect(JSON.stringify(files)).not.toContain(T_SECRET_REVIEWER);
    });
  });

  describe('the shipped catalogue', () => {
    it('holds no tool publication or tool evidence', async () => {
      const counts = await admin(db, 'select (select count(*) from public.tool_publications)::int p, (select count(*) from public.tool_claim_evidence)::int e');
      expect(counts[0]).toEqual({ p: 0, e: 0 });
    });
  });
});

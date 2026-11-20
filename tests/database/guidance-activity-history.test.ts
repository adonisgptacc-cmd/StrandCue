import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { GuidanceActivityHistoryPageSchema } from '../../packages/domain/src/guidance/schemas.ts';
import { asUser, complete, database, UNVERIFIED, USER_A, USER_B } from './harness.ts';

const BASELINE_TIME = '2026-06-01T10:00:00.000000Z';
const CUTOFF = '2026-06-10T10:00:00.000000Z';
const AFTER_CUTOFF = '2026-06-10T10:00:00.000001Z';
const BASE_PATCH = { activityKind: 'wash', precision: 'exact_day', zones: [], notes: 'private note', status: 'active' };

async function page(db: PGlite, options: {
  effective?: string | null; recorded?: string | null; limit?: number | null; cursor?: unknown;
} = {}) {
  const result = await db.query<{ result: unknown }>(
    'select public.list_guidance_activity_histories($1::date,$2::timestamptz,$3,$4::jsonb) result',
    [options.effective === undefined ? '2026-06-05' : options.effective,
      options.recorded === undefined ? CUTOFF : options.recorded,
      options.limit === undefined ? 100 : options.limit,
      options.cursor === undefined ? null : JSON.stringify(options.cursor)],
  );
  return GuidanceActivityHistoryPageSchema.parse(result.rows[0].result);
}

async function baseline(db: PGlite, options: {
  owner?: string; recorded?: string; precision?: string; activityId?: string;
} = {}) {
  const owner = options.owner ?? USER_A;
  const activityId = options.activityId ?? crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const precision = options.precision ?? 'exact_day';
  await db.exec('set session authorization postgres');
  await db.query(`insert into public.activities(id,owner,kind,occurred_at,precision)
    values ($1,$2,'wash','2026-05-17T09:00:00Z',$3)`, [activityId, owner, precision]);
  await db.query(`insert into public.activity_revisions
    (id,owner,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch)
    values ($1,$2,$3,1,0,'baseline',$4::jsonb,$5,'user-reported',$6::jsonb)`,
  [revisionId, owner, activityId, JSON.stringify({ precision, value: '2026-05-17' }),
    options.recorded ?? BASELINE_TIME, JSON.stringify({ ...BASE_PATCH, precision })]);
  await asUser(db, owner);
  return { activityId, revisionId };
}

async function revision(db: PGlite, activityId: string, options: {
  sequence: number; kind: 'change' | 'correction' | 'void'; recorded: string; correctsId?: string;
}) {
  const id = crypto.randomUUID();
  await db.exec('set session authorization postgres');
  await db.query(`insert into public.activity_revisions
    (id,owner,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,
      corrects_id,correction_reason,void_reason)
    values ($1,$2,$3,$4,$5,$6,'{"precision":"exact_day","value":"2026-05-17"}',
      $7,'user-reported',$8::jsonb,$9,$10,$11)`,
  [id, USER_A, activityId, options.sequence, options.sequence - 1, options.kind, options.recorded,
    JSON.stringify(options.kind === 'void' ? {} : { notes: 'updated private note' }),
    options.correctsId ?? null, options.kind === 'correction' ? 'private correction reason' : null,
    options.kind === 'void' ? 'private void reason' : null]);
  await asUser(db, USER_A);
  return id;
}

describe('owner-scoped bitemporal guidance activity histories', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 120_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('isolates every history and revision by owner without exposing owner or operation data', async () => {
    const own = await baseline(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    const other = await baseline(db, { owner: USER_B });
    expect((await page(db)).items.map(item => item.activityId)).toEqual([other.activityId]);
    await asUser(db, USER_A);
    const result = await page(db);
    expect(result.items.map(item => item.activityId)).toEqual([own.activityId]);
    const text = JSON.stringify(result);
    expect(text).not.toContain(USER_A);
    expect(text).not.toContain(USER_B);
    expect(text).not.toMatch(/operation|payload|userId|email/);
  });

  it('rejects anonymous, unverified, inactive, and deleted accounts', async () => {
    await asUser(db, null);
    await expect(page(db)).rejects.toThrow(/permission denied/);
    await asUser(db, UNVERIFIED);
    await expect(page(db)).rejects.toThrow('account-not-active');
    await db.exec('set session authorization postgres');
    await db.query("update public.profiles set account_status='deleting' where user_id=$1", [USER_A]);
    await asUser(db, USER_A);
    await expect(page(db)).rejects.toThrow('account-not-active');
    await db.exec('set session authorization postgres');
    await db.query('delete from public.profiles where user_id=$1', [USER_A]);
    await asUser(db, USER_A);
    await expect(page(db)).rejects.toThrow('account-not-active');
    await asUser(db, null);
    await db.exec('set session authorization authenticated');
    await expect(page(db)).rejects.toThrow('authentication-required');
  });

  it('excludes a baseline recorded one microsecond after the cutoff', async () => {
    const at = await baseline(db, { recorded: CUTOFF });
    await baseline(db, { recorded: AFTER_CUTOFF });
    expect((await page(db)).items.map(item => item.activityId)).toEqual([at.activityId]);
  });

  it.each(['correction', 'void'] as const)('includes %s at the cutoff and excludes one microsecond later', async kind => {
    const first = await baseline(db);
    const second = await baseline(db);
    const at = await revision(db, first.activityId, {
      sequence: 2, kind, recorded: CUTOFF, correctsId: kind === 'correction' ? first.revisionId : undefined,
    });
    await revision(db, second.activityId, {
      sequence: 2, kind, recorded: AFTER_CUTOFF, correctsId: kind === 'correction' ? second.revisionId : undefined,
    });
    const items = (await page(db)).items;
    expect(items.find(item => item.activityId === first.activityId)?.revisions.map(r => r.id)).toEqual([first.revisionId, at]);
    expect(items.find(item => item.activityId === second.activityId)?.revisions.map(r => r.id)).toEqual([second.revisionId]);
  });

  it('orders all revision kinds by sequence with exact discriminated fields', async () => {
    const activity = await baseline(db);
    const change = await revision(db, activity.activityId, { sequence: 2, kind: 'change', recorded: '2026-06-02T10:00:00Z' });
    const correction = await revision(db, activity.activityId, {
      sequence: 3, kind: 'correction', recorded: '2026-06-03T10:00:00Z', correctsId: change,
    });
    const voidId = await revision(db, activity.activityId, { sequence: 4, kind: 'void', recorded: CUTOFF });
    const revisions = (await page(db)).items[0].revisions;
    expect(revisions.map(r => r.id)).toEqual([activity.revisionId, change, correction, voidId]);
    expect(revisions.map(r => [r.sequence, r.baseRevision])).toEqual([[1, 0], [2, 1], [3, 2], [4, 3]]);
    const baseKeys = ['id', 'activityId', 'sequence', 'baseRevision', 'kind', 'effectiveDate', 'recordedAt', 'source', 'patch'];
    expect(Object.keys(revisions[0]).sort()).toEqual([...baseKeys].sort());
    expect(Object.keys(revisions[1]).sort()).toEqual([...baseKeys].sort());
    expect(Object.keys(revisions[2]).sort()).toEqual([...baseKeys, 'correctsId', 'correctionReason'].sort());
    expect(Object.keys(revisions[3]).sort()).toEqual([...baseKeys, 'voidReason'].sort());
    expect(revisions[3].recordedAt).toBe(CUTOFF);
  });

  it.each([
    ['exact_day', { precision: 'day', value: '2026-05-17' }],
    ['exact_month', { precision: 'month', value: '2026-05' }],
    ['exact_year', { precision: 'year', value: '2026' }],
    ['unknown', { precision: 'unknown', value: null }],
  ])('truncates %s to the exact domain effective-date value', async (precision, expected) => {
    await baseline(db, { precision: precision as string });
    expect((await page(db)).items[0].revisions[0].effectiveDate).toEqual(expected);
  });

  it('returns complete histories even for effective dates after the requested effective cutoff', async () => {
    await baseline(db);
    expect((await page(db, { effective: '2026-01-01' })).items[0].revisions).toHaveLength(1);
  });

  it('normalizes existing nullable notes at the read boundary without changing stored revisions', async () => {
    const activityId = crypto.randomUUID();
    const created = (await db.query<{ result: { revisions: { id: string }[] } }>(
      "select public.record_activity($1,$2,'wash','2026-05-17T09:00:00Z','exact_day','[]',null) result",
      [crypto.randomUUID(), activityId],
    )).rows[0].result;
    await db.query('select public.correct_activity($1,$2,1,$3,$4,null)',
      [crypto.randomUUID(), activityId, created.revisions[0].id, 'correction']);
    // The live writes use transaction time; fetch at database time rather than a guessed wall-clock cutoff.
    const live = GuidanceActivityHistoryPageSchema.parse((await db.query<{ result: unknown }>(
      "select public.list_guidance_activity_histories('2026-06-05',transaction_timestamp()) result",
    )).rows[0].result);
    expect(live.items[0].revisions[0].patch).toHaveProperty('notes', '');
    expect(live.items[0].revisions[1].patch).not.toHaveProperty('notes');
    expect((await db.query<{ notes: unknown }>("select patch->'notes' notes from public.activity_revisions order by sequence")).rows)
      .toEqual([{ notes: null }, { notes: null }]);
  });

  it.each([0, 101, -1, null])('rejects page size %s', async limit => {
    await expect(page(db, { limit })).rejects.toThrow('invalid-page');
  });

  it.each([
    { effective: null }, { effective: 'infinity' }, { effective: '-infinity' },
    { recorded: null }, { recorded: 'infinity' }, { recorded: '-infinity' }, { recorded: '2099-01-01T00:00:00Z' },
  ])('rejects null, infinite, and future recorded cutoffs: %j', async options => {
    await expect(page(db, options)).rejects.toThrow(/invalid-effective-date|invalid-recorded-cutoff/);
  });

  it('defaults to 100 and uses the immutable baseline tuple including tied timestamps', async () => {
    await db.exec('set session authorization postgres');
    await db.query(`insert into public.activities(id,owner,kind,occurred_at,precision)
      select ('aaaaaaaa-aaaa-4aaa-8aaa-' || lpad(i::text,12,'0'))::uuid,$1,'wash','2026-05-17','exact_day'
      from generate_series(1,101) i`, [USER_A]);
    await db.query(`insert into public.activity_revisions(owner,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch)
      select owner,id,1,0,'baseline','{"precision":"exact_day","value":"2026-05-17"}',$1,'user-reported',$2::jsonb
      from public.activities`, [BASELINE_TIME, JSON.stringify(BASE_PATCH)]);
    await asUser(db, USER_A);
    const first = GuidanceActivityHistoryPageSchema.parse((await db.query<{ result: unknown }>(
      'select public.list_guidance_activity_histories($1::date,$2::timestamptz) result', ['2026-06-05', CUTOFF],
    )).rows[0].result);
    expect(first.items).toHaveLength(100);
    expect(first.items[0].activityId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-000000000101');
    expect(first.nextCursor).toEqual({ baselineRecordedAt: BASELINE_TIME, activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002' });
    const second = await page(db, { cursor: first.nextCursor });
    expect(second.items.map(item => item.activityId)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-000000000001']);
    expect(second.nextCursor).toBeNull();
  });

  it.each([
    {}, [], 'bad', { baselineRecordedAt: BASELINE_TIME }, { activityId: USER_A },
    { baselineRecordedAt: BASELINE_TIME, activityId: USER_A, owner: USER_A },
    { baselineRecordedAt: null, activityId: USER_A }, { baselineRecordedAt: 1, activityId: USER_A },
    { baselineRecordedAt: BASELINE_TIME, activityId: 123 }, { baselineRecordedAt: BASELINE_TIME, activityId: 'bad' },
    { baselineRecordedAt: 'infinity', activityId: USER_A }, { baselineRecordedAt: '-infinity', activityId: USER_A },
    { baselineRecordedAt: '2026-06-01', activityId: USER_A }, { baselineRecordedAt: 'garbage', activityId: USER_A },
  ].map(cursor => [cursor]))('rejects a malformed cursor %j', async cursor => {
    await expect(page(db, { cursor })).rejects.toThrow('invalid-cursor');
  });

  it('rejects foreign, absent, mismatched, and beyond-cutoff cursor tuples identically', async () => {
    const own = await baseline(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    const foreign = await baseline(db, { owner: USER_B });
    await asUser(db, USER_A);
    for (const cursor of [
      { baselineRecordedAt: BASELINE_TIME, activityId: foreign.activityId },
      { baselineRecordedAt: BASELINE_TIME, activityId: crypto.randomUUID() },
      { baselineRecordedAt: '2026-06-02T10:00:00Z', activityId: own.activityId },
      { baselineRecordedAt: AFTER_CUTOFF, activityId: own.activityId },
    ]) await expect(page(db, { cursor })).rejects.toThrow(/^invalid-cursor$/);
  });

  it('keeps page membership and known revisions fixed when a later correction arrives between reads', async () => {
    const oldest = await baseline(db);
    const middle = await baseline(db, { recorded: '2026-06-02T10:00:00Z' });
    const newest = await baseline(db, { recorded: '2026-06-03T10:00:00Z' });
    const first = await page(db, { limit: 1 });
    expect(first.items.map(item => item.activityId)).toEqual([newest.activityId]);
    await revision(db, middle.activityId, { sequence: 2, kind: 'correction', recorded: AFTER_CUTOFF, correctsId: middle.revisionId });
    await db.exec('set session authorization postgres');
    await db.query("update public.activities set updated_at='2026-06-20',revision=2 where id=$1", [middle.activityId]);
    await asUser(db, USER_A);
    expect(await page(db, { limit: 1 })).toEqual(first);
    const second = await page(db, { limit: 1, cursor: first.nextCursor });
    expect(second.items[0].activityId).toBe(middle.activityId);
    expect(second.items[0].revisions.map(r => r.id)).toEqual([middle.revisionId]);
    const third = await page(db, { limit: 1, cursor: second.nextCursor });
    expect(third.items[0].activityId).toBe(oldest.activityId);
    expect(third.nextCursor).toBeNull();
  });

  it('restricts execution and fixes wrapper/core ownership and search paths', async () => {
    await db.exec('set session authorization postgres');
    const functions = await db.query<{ schema: string; owner: string; definer: boolean; anon: boolean; authenticated: boolean; publicExecute: boolean; config: string[] }>(`
      select n.nspname schema, pg_get_userbyid(p.proowner) owner,p.prosecdef definer,p.proconfig config,
        has_function_privilege('anon',p.oid,'EXECUTE') anon,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
        exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) where grantee=0 and privilege_type='EXECUTE') "publicExecute"
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname in ('list_guidance_activity_histories','list_guidance_activity_histories_core') order by n.nspname`);
    expect(functions.rows).toEqual([
      { schema: 'public', owner: 'postgres', definer: false, config: ['search_path=""'], anon: false, authenticated: true, publicExecute: false },
      { schema: 'strandcue_private', owner: 'strandcue_mutator', definer: true, config: ['search_path=""'], anon: false, authenticated: true, publicExecute: false },
    ]);
  });

  it('provides baseline pagination and revision cutoff access-path indexes', async () => {
    const indexes = (await db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where schemaname='public' and tablename='activity_revisions'",
    )).rows.map(row => row.indexdef);
    expect(indexes.some(index => /\(owner, recorded_at DESC, activity_id DESC\).*WHERE.*kind.*baseline/.test(index))).toBe(true);
    expect(indexes.some(index => /\(owner, activity_id, recorded_at, sequence\)/.test(index))).toBe(true);
  });
});

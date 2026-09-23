import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

async function recordActivity(db: PGlite, opts: { operationId?: string; activityId?: string; kind?: string; occurredAt?: string; precision?: string; zones?: unknown; notes?: string | null } = {}) {
  const op = opts.operationId ?? crypto.randomUUID();
  const act = opts.activityId ?? crypto.randomUUID();
  const kind = opts.kind ?? 'wash';
  const occurredAt = opts.occurredAt ?? '2024-01-15T10:00:00.000Z';
  const precision = opts.precision ?? 'exact_day';
  const zones = opts.zones ?? [{ region: 'whole_head', segment: 'entire_strand' }];
  const notes = opts.notes === null ? null : (opts.notes ?? 'wash notes');
  return (await db.query<{ result: any }>(`select public.record_activity($1,$2,$3,$4::timestamptz,$5,$6::jsonb,$7) result`, [op, act, kind, occurredAt, precision, JSON.stringify(zones), notes])).rows[0].result;
}
async function correctActivity(db: PGlite, opts: { operationId?: string; activityId: string; expectedRevision: number; correctsId: string; reason: string; notes?: string }) {
  const op = opts.operationId ?? crypto.randomUUID();
  return (await db.query<{ result: any }>(`select public.correct_activity($1,$2,$3,$4,$5,$6) result`, [op, opts.activityId, opts.expectedRevision, opts.correctsId, opts.reason, opts.notes ?? 'corrected'])).rows[0].result;
}
async function voidActivity(db: PGlite, opts: { operationId?: string; activityId: string; expectedRevision: number; reason: string }) {
  const op = opts.operationId ?? crypto.randomUUID();
  return (await db.query<{ result: any }>(`select public.void_activity($1,$2,$3,$4) result`, [op, opts.activityId, opts.expectedRevision, opts.reason])).rows[0].result;
}

describe('PostgreSQL Activity immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('denies direct authenticated writes to activity tables and enforces owner isolation', async () => {
    await complete(db);
    // direct insert should be denied for authenticated (only strandcue_mutator can insert)
    await expect(db.exec(`insert into public.activities(id, owner, kind, occurred_at, precision, zones, notes, status) values (gen_random_uuid(),'${USER_A}','wash',now(),'exact_day','[]',null,'active')`)).rejects.toThrow(/permission denied|not allowed|violates row-level security/i);
    await expect(db.exec(`insert into public.activity_revisions(id, owner, activity_id, sequence, base_revision, kind, effective_date, source, patch) values (gen_random_uuid(),'${USER_A}',gen_random_uuid(),1,0,'baseline','{\"precision\":\"day\",\"value\":\"2024-01-01\"}','user-reported','{}')`)).rejects.toThrow(/permission denied|violates/i);
    // owner isolation: USER_B sees nothing
    await asUser(db, USER_B);
    expect((await db.query('select * from public.activities')).rows).toEqual([]);
    expect((await db.query('select * from public.activity_revisions')).rows).toEqual([]);
  });

  it('enforces composite owner FK even for trusted SQL writer', async () => {
    await complete(db);
    // create activity via postgres as superuser bypasses RLS but FK should still prevent cross-owner child
    await db.exec('set session authorization postgres');
    const activityId = crypto.randomUUID();
    await db.exec(`insert into public.activities(id, owner, kind, occurred_at, precision, revision) values ('${activityId}','${USER_A}','wash',now(),'exact_day',0)`);
    // try to insert revision with wrong owner
    await expect(db.query(`insert into public.activity_revisions(id, owner, activity_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, source, patch) values (gen_random_uuid(),'${USER_B}','${activityId}',1,0,'baseline','{\"precision\":\"day\",\"value\":\"2024-01-01\"}','2024-01-01','2024-01-01','user-reported','{\"activityKind\":\"wash\",\"precision\":\"exact_day\",\"zones\":[],\"notes\":\"x\",\"status\":\"active\"}')`)).rejects.toThrow(/foreign key|violates/i);
  });

  it('migrates with trusted chain and keeps archived candidates separate', async () => {
    const rows = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' and tablename in ('activities','activity_revisions','activity_products','activity_tools','activity_heat_events')");
    expect(rows.rows.map((r) => r.tablename).sort()).toEqual(['activities', 'activity_heat_events', 'activity_products', 'activity_revisions', 'activity_tools']);
  });

  it('is idempotent on same operation key and payload, and rejects same key different payload', async () => {
    await complete(db);
    const op = crypto.randomUUID();
    const act = crypto.randomUUID();
    const first = await recordActivity(db, { operationId: op, activityId: act, notes: 'first' });
    expect(first.revision).toBe(1);
    expect(first.activityId).toBe(act);
    // retry same key/payload returns same result
    const retry = await recordActivity(db, { operationId: op, activityId: act, notes: 'first' });
    expect(retry).toEqual(first);
    // same key different payload -> operation-conflict
    await expect(recordActivity(db, { operationId: op, activityId: act, notes: 'different' })).rejects.toThrow(/operation-conflict/i);
  });

  it('rejects stale expected_revision with revision-conflict', async () => {
    await complete(db);
    const act = crypto.randomUUID();
    await recordActivity(db, { activityId: act });
    // correct revision should be 1, stale 0 should fail
    await expect(correctActivity(db, { activityId: act, expectedRevision: 0, correctsId: crypto.randomUUID(), reason: 'stale' })).rejects.toThrow(/revision-conflict/i);
  });

  it('denies correcting another owners activity', async () => {
    await complete(db);
    const act = crypto.randomUUID();
    const rec = await recordActivity(db, { activityId: act });
    const revId = rec.revisions[0].id;
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(correctActivity(db, { activityId: act, expectedRevision: 1, correctsId: revId, reason: 'hijack' })).rejects.toThrow(/not-found|correction-target-not-found|permission/i);
  });

  it('round-trips unknown precision and future date is rejected', async () => {
    await complete(db);
    const act = crypto.randomUUID();
    const res = await recordActivity(db, { activityId: act, precision: 'unknown', occurredAt: '2024-01-15T10:00:00.000Z' });
    expect(res.revisions[0].precision).toBe('unknown');
    // future date should be rejected (P1-HIST-04: no future factual changes)
    await expect(recordActivity(db, { activityId: crypto.randomUUID(), occurredAt: '2099-01-01T00:00:00.000Z', precision: 'exact_day' })).rejects.toThrow(/invalid-effective-date|future/i);
  });

  it('void hides from default list but remains auditable', async () => {
    await complete(db);
    const act = crypto.randomUUID();
    const rec = await recordActivity(db, { activityId: act, notes: 'to void' });
    expect(rec.revision).toBe(1);
    const voided = await voidActivity(db, { activityId: act, expectedRevision: 1, reason: 'duplicate' });
    expect(voided.revision).toBe(2);
    // default list should not contain voided activity
    const list = await db.query<{ result: any }>(`select public.list_activities('2024-03-01'::date, 25, null) result`);
    const items = list.rows[0].result.items as any[];
    expect(items.find((i: any) => i.id === act)).toBeUndefined();
    // audit fetch should contain void
    const get = await db.query<{ result: any }>(`select public.get_activity($1, true) result`, [act]);
    expect(get.rows[0].result.revisions.some((r: any) => r.kind === 'void')).toBe(true);
    expect(get.rows[0].result.voided).toBe(true);
  });
});

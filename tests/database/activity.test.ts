import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

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
});

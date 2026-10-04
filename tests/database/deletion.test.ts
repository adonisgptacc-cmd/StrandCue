import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, current, database, mutate, USER_A, USER_B } from './harness.ts';

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false, amr: [{ method: 'password', timestamp: Math.floor(Date.now()/1000) }],
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function staleAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false, amr: [{ method: 'password', timestamp: 1577836800 }],
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function deletionRequest(db: PGlite, operationId = crypto.randomUUID(), reason = 'leaving') {
  return (await db.query<{ result: any }>(`select public.deletion_request($1, $2) result`, [operationId, reason])).rows[0].result;
}

describe('account deletion lifecycle and tombstones', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
  });
  afterAll(async () => { await db?.close(); });

  it('keeps tombstones minimal: no email, no secrets', async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'deletion_tombstones'`,
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names).toContain('user_id');
    expect(names).toContain('username');
    expect(names).toContain('purge_completed_at');
    expect(names).not.toContain('email');
    expect(names.join(' ')).not.toMatch(/password|secret|token/i);
    const unprotected = await db.query(
      `select relname from pg_class where relname = 'deletion_tombstones' and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('requires recent authentication to request deletion', async () => {
    await complete(db);
    await staleAuth(db, USER_A);
    await expect(deletionRequest(db)).rejects.toThrow(/recent-auth-required/i);
    await freshAuth(db, USER_A);
    const receipt = await deletionRequest(db);
    expect(receipt.accountStatus).toBe('deleting');
  });

  it('blocks data access immediately after the request', async () => {
    await complete(db);
    await mutate(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    // Same session, same JWT: every private read and mutation now denies.
    await expect(current(db)).rejects.toThrow(/account-not-active/i);
    await expect(mutate(db, { kind: 'change', revision: 1, patch: { goals: ['shine'] } })).rejects.toThrow(/account-not-active/i);
    expect((await db.query('select * from public.passport_revisions')).rows).toEqual([]);
  });

  it('is idempotent on same operation key and payload', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const op = crypto.randomUUID();
    const first = await deletionRequest(db, op, 'leaving');
    expect(await deletionRequest(db, op, 'leaving')).toEqual(first);
    await expect(deletionRequest(db, op, 'different reason')).rejects.toThrow(/operation-conflict/i);
  });

  it('cancels deletion and restores access while purging has not run', async () => {
    await complete(db);
    await mutate(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    const cancelled = await db.query<{ result: any }>(`select public.deletion_cancel() result`);
    expect(cancelled.rows[0].result.accountStatus).toBe('active');
    expect((await current(db)).revision).toBe(1);
    const tombstones = await db.query(`select * from public.deletion_tombstones`);
    expect(tombstones.rows).toEqual([]);
  });

  it('purges all user data but keeps the tombstone', async () => {
    await complete(db);
    await mutate(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db, crypto.randomUUID(), 'leaving');
    await db.exec('set session authorization postgres');
    const purged = await db.query<{ result: any }>(`select public.deletion_purge() result`);
    expect(purged.rows[0].result.purged).toBeGreaterThanOrEqual(1);
    // Personal rows are gone…
    expect((await db.query('select * from public.profiles')).rows).toEqual([]);
    expect((await db.query('select * from public.passport_revisions')).rows).toEqual([]);
    // …but the tombstone survives for restore detection.
    const tombstones = await db.query<{ user_id: string; purge_completed_at: string | null }>(
      `select user_id, purge_completed_at from public.deletion_tombstones`,
    );
    expect(tombstones.rows).toHaveLength(1);
    expect(tombstones.rows[0].user_id).toBe(USER_A);
    expect(tombstones.rows[0].purge_completed_at).not.toBeNull();
  });

  it('denies profile recreation with an old JWT after purge', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    await db.query('select public.deletion_purge()');
    await freshAuth(db, USER_A);
    await expect(complete(db)).rejects.toThrow(/account-deleted/i);
  });
  it('keeps a second tombstone guard immediately before missing-profile completion insert', async () => {
    const migration = await readFile('supabase/migrations/20261004132013_deletion_completion_guard.sql', 'utf8');
    const guards = migration.match(/exists\(select 1 from public\.deletion_tombstones where user_id = uid\)/g) ?? [];
    expect(guards).toHaveLength(2);
    expect(migration).toMatch(/else[\s\S]*if exists\(select 1 from public\.deletion_tombstones where user_id = uid\) then[\s\S]*raise exception 'account-deleted'[\s\S]*insert into public\.profiles/);
  });
  it('leases a resumable purge and rejects an obsolete worker receipt', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    const lease=crypto.randomUUID();
    const claim=(await db.query<{ result: any }>('select public.deletion_worker_claim($1) result',[lease])).rows[0].result;
    expect(claim).toEqual({ userId:USER_A,lease });
    expect((await db.query('select * from public.profiles')).rows).toEqual([]);
    expect((await db.query<{result:any}>('select public.deletion_worker_claim($1) result',[crypto.randomUUID()])).rows[0].result).toBeNull();
    expect((await db.query<{result:boolean}>('select public.deletion_worker_finish($1,$2,null) result',[USER_A,crypto.randomUUID()])).rows[0].result).toBe(false);
    await db.exec("update public.deletion_tombstones set worker_lease_until=now()-interval '1 second'");
    const resumed=crypto.randomUUID();
    expect((await db.query<{result:any}>('select public.deletion_worker_claim($1) result',[resumed])).rows[0].result.lease).toBe(resumed);
    expect((await db.query<{result:boolean}>('select public.deletion_worker_finish($1,$2,null) result',[USER_A,lease])).rows[0].result).toBe(false);
    expect((await db.query<{result:boolean}>('select public.deletion_worker_finish($1,$2,null) result',[USER_A,resumed])).rows[0].result).toBe(true);
    expect((await db.query<{result:any}>('select public.deletion_worker_claim($1) result',[crypto.randomUUID()])).rows[0].result).toBeNull();
  });

  it('denies maintenance routines to consumers', async () => {
    for(const routine of ['deletion_purge()','deletion_reapply()','export_retention_cleanup()',`deletion_worker_claim('${crypto.randomUUID()}')`,`deletion_worker_finish('${USER_A}','${crypto.randomUUID()}',null)`]) {
      await expect(db.query(`select public.${routine}`)).rejects.toThrow(/permission denied/i);
    }
  });

  it('backs off failed Auth deletion without losing its durable job', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    const lease=crypto.randomUUID();
    await db.query('select public.deletion_worker_claim($1)',[lease]);
    await db.query('select public.deletion_worker_finish($1,$2,$3)',[USER_A,lease,'auth-delete-failed']);
    expect((await db.query<{result:any}>('select public.deletion_worker_claim($1) result',[crypto.randomUUID()])).rows[0].result).toBeNull();
    await db.exec("update public.deletion_tombstones set worker_retry_at=now()-interval '1 second'");
    expect((await db.query<{result:any}>('select public.deletion_worker_claim($1) result',[crypto.randomUUID()])).rows[0].result.userId).toBe(USER_A);
  });
  it('reapplies deletion to data resurrected by a restore', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    await db.query(`select public.deletion_purge()`);
    // Simulate a backup restore resurrecting the profile row.
    await db.exec(`insert into public.profiles(user_id, username, eligible) values ('${USER_A}', 'user_a', true)`);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(1);
    await db.query(`select public.deletion_reapply()`);
    expect((await db.query('select * from public.profiles')).rows).toEqual([]);
    // Tombstone is retained through reapplication.
    expect((await db.query('select * from public.deletion_tombstones')).rows).toHaveLength(1);
  });

  it('refuses cancel after purge and hides foreign tombstones', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    await db.query(`select public.deletion_purge()`);
    await freshAuth(db, USER_A);
    await expect(db.query(`select public.deletion_cancel() result`)).rejects.toThrow(/account-not-active|profile-not-found|deletion-not-in-progress/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.deletion_tombstones')).rows).toEqual([]);
  });
});

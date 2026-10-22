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
    await db.exec('delete from public.profiles');
    await db.exec('delete from public.deletion_tombstones');
    await db.exec('delete from strandcue_private.deletion_lifecycle_events');
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
    for(const routine of ['deletion_purge()','deletion_reapply()','export_retention_cleanup()','protocol_execution_retention_cleanup()',`deletion_worker_claim('${crypto.randomUUID()}')`,`deletion_worker_finish('${USER_A}','${crypto.randomUUID()}',null)`]) {
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

  describe('cancellation recent authentication and audit (AU-001, AU-004)', () => {
    it('requires recent authentication to cancel and changes nothing on stale credentials', async () => {
      await complete(db);
      await freshAuth(db, USER_A);
      await deletionRequest(db, crypto.randomUUID(), 'leaving');
      await staleAuth(db, USER_A);
      await expect(db.query(`select public.deletion_cancel() result`)).rejects.toThrow(/recent-auth-required/i);
      await db.exec('set session authorization postgres');
      expect((await db.query<{ account_status: string }>('select account_status from public.profiles')).rows)
        .toEqual([{ account_status: 'deleting' }]);
      expect((await db.query('select * from public.deletion_tombstones')).rows).toHaveLength(1);
      expect((await db.query('select * from strandcue_private.deletion_lifecycle_events')).rows).toEqual([]);
    });

    it('preserves the request as immutable history and appends a cancellation audit event', async () => {
      await complete(db);
      await freshAuth(db, USER_A);
      await deletionRequest(db, crypto.randomUUID(), 'leaving');
      const cancelled = await db.query<{ result: any }>(`select public.deletion_cancel() result`);
      expect(cancelled.rows[0].result.accountStatus).toBe('active');
      await db.exec('set session authorization postgres');
      expect((await db.query('select * from public.deletion_tombstones')).rows).toEqual([]);
      const events = await db.query<{
        user_id: string; event: string; occurred_at: string; details: Record<string, unknown>;
      }>('select user_id, event, occurred_at, details from strandcue_private.deletion_lifecycle_events');
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].user_id).toBe(USER_A);
      expect(events.rows[0].event).toBe('cancelled');
      expect(events.rows[0].occurred_at).not.toBeNull();
      expect(events.rows[0].details).toMatchObject({ username: 'user_a', reason: 'leaving' });
      expect(events.rows[0].details['deleted_at']).toBeTruthy();
      expect((await db.query<{ account_status: string }>('select account_status from public.profiles')).rows)
        .toEqual([{ account_status: 'active' }]);
    });

    it('stays paramless and fails a second cancel closed without new history', async () => {
      await complete(db);
      await freshAuth(db, USER_A);
      await deletionRequest(db);
      await db.query(`select public.deletion_cancel() result`);
      await expect(db.query(`select public.deletion_cancel() result`)).rejects.toThrow(/deletion-not-in-progress/i);
      await db.exec('set session authorization postgres');
      expect((await db.query('select * from strandcue_private.deletion_lifecycle_events')).rows).toHaveLength(1);
    });

    it('never purges a cancelled account', async () => {
      await complete(db);
      await freshAuth(db, USER_A);
      await deletionRequest(db);
      await db.query(`select public.deletion_cancel() result`);
      await db.exec('set session authorization postgres');
      const purged = await db.query<{ result: any }>(`select public.deletion_purge() result`);
      expect(purged.rows[0].result.purged).toBe(0);
      expect((await db.query<{ account_status: string }>('select account_status from public.profiles')).rows)
        .toEqual([{ account_status: 'active' }]);
      expect((await db.query('select * from public.deletion_tombstones')).rows).toEqual([]);
    });

    it('rejects cancel without an active deletion', async () => {
      await complete(db);
      await freshAuth(db, USER_A);
      await expect(db.query(`select public.deletion_cancel() result`)).rejects.toThrow(/deletion-not-in-progress/i);
      await db.exec('set session authorization postgres');
      expect((await db.query('select * from strandcue_private.deletion_lifecycle_events')).rows).toEqual([]);
    });

    it('keeps lifecycle history append-only: mutator append plus owner read, nothing else', async () => {
      await db.exec('set session authorization postgres');
      const rel = await db.query<{ missing: boolean }>(`
        select (not relrowsecurity or not relforcerowsecurity) missing
        from pg_class where relname = 'deletion_lifecycle_events'`);
      expect(rel.rows).toEqual([{ missing: false }]);
      expect((await db.query<{ can_write: boolean }>(`
        select has_table_privilege('authenticated', 'strandcue_private.deletion_lifecycle_events', 'INSERT,UPDATE,DELETE') can_write`)).rows)
        .toEqual([{ can_write: false }]);
      expect((await db.query<{ can_read: boolean }>(`
        select has_table_privilege('anon', 'strandcue_private.deletion_lifecycle_events', 'SELECT') can_read`)).rows)
        .toEqual([{ can_read: false }]);
      expect((await db.query<{ can_append: boolean; can_read: boolean; can_rewrite: boolean }>(`
        select has_table_privilege('strandcue_mutator', 'strandcue_private.deletion_lifecycle_events', 'SELECT,INSERT') can_append,
          has_table_privilege('strandcue_mutator', 'strandcue_private.deletion_lifecycle_events', 'SELECT') can_read,
          has_table_privilege('strandcue_mutator', 'strandcue_private.deletion_lifecycle_events', 'UPDATE,DELETE') can_rewrite`)).rows)
        .toEqual([{ can_append: true, can_read: true, can_rewrite: false }]);
    });

    it('reserves the lifecycle vocabulary for request, purge and auth-delete events without schema change', async () => {
      await db.exec('set session authorization postgres');
      for (const event of ['requested', 'purged', 'auth-deleted']) {
        await db.query(`insert into strandcue_private.deletion_lifecycle_events(user_id, event) values ($1, $2)`, [USER_A, event]);
      }
      await expect(db.query(`insert into strandcue_private.deletion_lifecycle_events(user_id, event) values ($1, 'bogus')`, [USER_A]))
        .rejects.toThrow(/check|constraint/i);
      await db.exec('delete from strandcue_private.deletion_lifecycle_events');
    });
  });
});

describe('account deletion removes Cue Check owner content', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('delete from public.profiles');
    await db.exec('delete from public.deletion_tombstones');
    await db.exec('delete from strandcue_private.deletion_lifecycle_events');
  });
  afterAll(async () => { await db?.close(); });

  /** Seeds one owner with a terminal execution plus one active Cue Check. */
  async function seedCueCheckFor(owner: string, username: string) {
    await asUser(db, owner);
    await complete(db, username);
    const runId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    const decision = {
      status: 'ready', requestId: runId,
      steps: [1, 2].map((position) => ({
        stepId: `step-${position}`, position, action: `Test action ${position}`,
        productId: null, productVersionId: null, toolId: null, toolVersionId: null,
        waitSeconds: null, rinse: null, reasons: ['test reason'],
      })),
    };
    await db.exec('set session authorization postgres');
    await db.exec('set session authorization strandcue_mutator');
    try {
      await db.query(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        [runId, 'd'.repeat(64), '2026-10-13T08:00:00.000Z', '1', 'bundle-synthetic', '1', 'ready',
          JSON.stringify({ requestId: runId, goal: 'basic_wash' }), JSON.stringify(decision)],
      );
    } finally {
      await asUser(db, owner);
    }
    await db.query(`select public.start_protocol_execution($1,$2,$3,$4::timestamptz)`,
      [crypto.randomUUID(), executionId, runId, new Date().toISOString()]);
    const transition = (expectedRevision: number, command: unknown) =>
      db.query(`select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz)`,
        [crypto.randomUUID(), executionId, expectedRevision, JSON.stringify(command), new Date().toISOString()]);
    await transition(0, { kind: 'complete-step', stepId: 'step-1' });
    await transition(1, { kind: 'complete-step', stepId: 'step-2' });
    await transition(2, { kind: 'complete' });
    const created = (await db.query<{ result: any }>(
      'select public.record_cue_check($1,$2,$3::jsonb) result',
      [crypto.randomUUID(), executionId,
        JSON.stringify({ timing: 'immediate', observedAt: new Date().toISOString(), overallResult: 'better' })],
    )).rows[0].result;
    return created;
  }

  async function cueCounts() {
    await db.exec('set session authorization postgres');
    try {
      const counts = await db.query(`
        select
          (select count(*) from public.cue_checks where user_id = '${USER_A}')::int as a_records,
          (select count(*) from public.cue_check_revisions where user_id = '${USER_A}')::int as a_revisions,
          (select count(*) from strandcue_private.cue_check_operations where user_id = '${USER_A}')::int as a_operations,
          (select count(*) from public.cue_checks where user_id = '${USER_B}')::int as b_records,
          (select count(*) from public.cue_check_revisions where user_id = '${USER_B}')::int as b_revisions,
          (select count(*) from strandcue_private.cue_check_operations where user_id = '${USER_B}')::int as b_operations`);
      return counts.rows[0];
    } finally {
      await asUser(db, USER_A);
    }
  }

  it('blocks Cue Check access immediately after the deletion request', async () => {
    const created = await seedCueCheckFor(USER_A, 'user_a');
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await expect(db.query(`select public.get_cue_check($1) result`, [created.recordId]))
      .rejects.toThrow(/account-not-active/i);
    await expect(db.query('select public.list_cue_checks(25,null) result'))
      .rejects.toThrow(/account-not-active/i);
    await expect(db.query(`select public.record_cue_check($1,$2,$3::jsonb)`,
      [crypto.randomUUID(), crypto.randomUUID(),
        JSON.stringify({ timing: 'immediate', observedAt: new Date().toISOString(), overallResult: 'better' })]))
      .rejects.toThrow(/account-not-active/i);
  });

  it('purges Cue Check records, history and operation receipts with the profile', async () => {
    await seedCueCheckFor(USER_A, 'user_a');
    await seedCueCheckFor(USER_B, 'user_b');
    await asUser(db, USER_A);
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.exec('set session authorization postgres');
    await db.query(`select public.deletion_purge()`);
    const after = await cueCounts();
    expect(after).toEqual({
      a_records: 0, a_revisions: 0, a_operations: 0,
      b_records: 1, b_revisions: 1, b_operations: 1,
    });
  });

  it('preserves Cue Check data when cancellation precedes the purge', async () => {
    const created = await seedCueCheckFor(USER_A, 'user_a');
    await freshAuth(db, USER_A);
    await deletionRequest(db);
    await db.query(`select public.deletion_cancel() result`);
    const detail = (await db.query<{ result: any }>(
      `select public.get_cue_check($1) result`, [created.recordId])).rows[0].result;
    expect(detail).toMatchObject({ recordId: created.recordId, lifecycle: 'active', revision: 1 });
    const after = await cueCounts();
    expect(after).toMatchObject({ a_records: 1, a_revisions: 1, a_operations: 1 });
  });

  it('denies direct owner deletion of Cue Check rows', async () => {
    await seedCueCheckFor(USER_A, 'user_a');
    await expect(db.exec('delete from public.cue_checks')).rejects.toThrow(/permission denied/i);
    await expect(db.exec('delete from public.cue_check_revisions')).rejects.toThrow(/permission denied/i);
  });
});

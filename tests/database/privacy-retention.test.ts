import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A } from './harness.ts';

// Privacy retention enforcement (Task 13). Time is frozen by seeding every
// row with an explicit timestamp relative to one captured instant per test;
// day-scale margins around the 90/30-day windows keep the suite deterministic
// regardless of millisecond drift between seed and cleanup.
const DAY_MS = 86_400_000;
const RUN_ID = '55555555-5555-4555-8555-555555555555';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function executionSnapshot(executionId: string, status: string, finishedAt: string | null) {
  return {
    executionId,
    recommendationRunId: RUN_ID,
    startedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: finishedAt ?? '2026-01-01T00:00:00.000Z',
    status,
    steps: [],
    finishedAt,
    closeReason: status === 'abandoned' ? 'stale' : null,
  };
}

async function seedRun(db: PGlite) {
  await db.exec('set session authorization postgres');
  try {
    await db.query(
      `insert into public.recommendation_runs(
         user_id, request_id, input_fingerprint, as_of, engine_version,
         bundle_id, bundle_version, status, input, decision)
       values ($1, $2, $3, $4::timestamptz, '1', 'bundle-synthetic', '1',
         'ready', '{}'::jsonb, '{}'::jsonb)
       on conflict (user_id, request_id) do nothing`,
      [USER_A, RUN_ID, 'd'.repeat(64), '2026-01-01T00:00:00.000Z'],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function seedExecution(
  db: PGlite,
  executionId: string,
  status: string,
  finishedDaysAgo: number | null,
  legalHold = false,
) {
  const finishedAt = finishedDaysAgo === null ? null : isoDaysAgo(finishedDaysAgo);
  await db.exec('set session authorization postgres');
  try {
    await db.query(
      `insert into public.protocol_executions(
         user_id, execution_id, recommendation_run_id, decision, execution,
         revision, status, legal_hold)
       values ($1, $2, $3, '{}'::jsonb, $4::jsonb, 0, $5, $6)`,
      [USER_A, executionId, RUN_ID, JSON.stringify(executionSnapshot(executionId, status, finishedAt)), status, legalHold],
    );
    await db.query(
      `insert into public.protocol_execution_events(
         user_id, execution_id, sequence, kind, command, revision)
       values ($1, $2, 1, 'started', '{"kind":"start"}'::jsonb, 0)`,
      [USER_A, executionId],
    );
    await db.query(
      `insert into strandcue_private.protocol_execution_operations(
         user_id, operation_id, request, result)
       values ($1, $2, $3::jsonb, '{}'::jsonb)`,
      [
        USER_A,
        executionId,
        JSON.stringify({ operationId: executionId, executionId, recommendationRunId: RUN_ID }),
      ],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function seedExportJob(db: PGlite, jobId: string, completedDaysAgo: number | null) {
  await db.exec('set session authorization postgres');
  try {
    if (completedDaysAgo === null) {
      await db.query(
        `insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
         values ($1, $2, 'json', 'completed', '{"profile":{}}'::jsonb, 1, now(), now() + interval '24 hours')`,
        [jobId, USER_A],
      );
    } else {
      await db.query(
        `insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
         values ($1, $2, 'json', 'completed', '{"profile":{}}'::jsonb, 1,
           now() - ($3 || ' days')::interval, now() - ($3 || ' days')::interval + interval '24 hours')`,
        [jobId, USER_A, String(completedDaysAgo)],
      );
    }
  } finally {
    await asUser(db, USER_A);
  }
}

async function retentionCleanup(db: PGlite) {
  await db.exec('set session authorization postgres');
  try {
    const exported = (await db.query<{ export_retention_cleanup: number }>(
      'select public.export_retention_cleanup() export_retention_cleanup',
    )).rows[0].export_retention_cleanup;
    const executions = (await db.query<{ protocol_execution_retention_cleanup: unknown }>(
      'select public.protocol_execution_retention_cleanup() protocol_execution_retention_cleanup',
    )).rows[0].protocol_execution_retention_cleanup;
    return { exported, executions };
  } finally {
    await asUser(db, USER_A);
  }
}

async function executionIds(db: PGlite): Promise<string[]> {
  return (await db.query<{ execution_id: string }>(
    'select execution_id from public.protocol_executions order by execution_id',
  )).rows.map((row) => row.execution_id);
}

describe('privacy retention cleanup', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => {
    await asUser(db, USER_A);
    await complete(db);
    await seedRun(db);
  });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.deletion_tombstones');
    await db.exec('delete from strandcue_private.deletion_lifecycle_events');
    await db.exec('delete from public.consent_records');
  });
  afterAll(async () => { await db?.close(); });

  it('purges expired completed and abandoned executions with their events and operations', async () => {
    await seedExecution(db, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'completed', 91);
    await seedExecution(db, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'abandoned', 31);
    const result = await retentionCleanup(db);
    expect(result.executions).toMatchObject({ executions: 2, events: 2, operations: 2 });
    expect(await executionIds(db)).toEqual([]);
    await db.exec('set session authorization postgres');
    expect((await db.query('select * from public.protocol_execution_events')).rows).toEqual([]);
    expect((await db.query('select * from strandcue_private.protocol_execution_operations')).rows).toEqual([]);
    await asUser(db, USER_A);
  });

  it('keeps fresh terminal executions inside their windows', async () => {
    await seedExecution(db, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'completed', 89);
    await seedExecution(db, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'abandoned', 29);
    const result = await retentionCleanup(db);
    expect(result.executions).toMatchObject({ executions: 0, events: 0, operations: 0 });
    expect(await executionIds(db)).toEqual([
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    ]);
  });

  it('never purges non-terminal executions no matter their age', async () => {
    await seedExecution(db, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'in_progress', null);
    await db.exec('set session authorization postgres');
    await db.exec(
      `update public.protocol_executions set created_at = now() - interval '400 days'
        where execution_id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'`,
    );
    await asUser(db, USER_A);
    await retentionCleanup(db);
    expect(await executionIds(db)).toEqual(['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']);
  });

  it('never purges executions under legal hold', async () => {
    await seedExecution(db, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'completed', 400, true);
    await seedExecution(db, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', 'abandoned', 400, true);
    const result = await retentionCleanup(db);
    expect(result.executions).toMatchObject({ executions: 0, events: 0, operations: 0 });
    expect(await executionIds(db)).toEqual([
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    ]);
  });

  it('never purges recommendation runs when their executions expire', async () => {
    await seedExecution(db, 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'completed', 91);
    await retentionCleanup(db);
    expect(await executionIds(db)).toEqual([]);
    const runs = await db.query('select * from public.recommendation_runs');
    expect(runs.rows).toHaveLength(1);
  });

  it('nulls expired export documents while keeping receipts and fresh jobs', async () => {
    const expired = crypto.randomUUID();
    const fresh = crypto.randomUUID();
    const current = crypto.randomUUID();
    await seedExportJob(db, expired, 8);
    await seedExportJob(db, fresh, 6);
    await seedExportJob(db, current, null);
    const result = await retentionCleanup(db);
    expect(result.exported).toBe(1);
    const rows = (await db.query<{ id: string; document: unknown; status: string }>(
      'select id, document, status from public.export_jobs',
    )).rows;
    expect(rows).toHaveLength(3);
    expect(rows.find((row) => row.id === expired)?.document).toBeNull();
    expect(rows.find((row) => row.id === fresh)?.document).not.toBeNull();
    expect(rows.find((row) => row.id === current)?.document).not.toBeNull();
  });

  it('retains completed deletion tombstones and lifecycle events under the legal rule', async () => {
    await db.exec('set session authorization postgres');
    try {
      await db.query(
        `insert into public.deletion_tombstones(user_id, username, deleted_at, purge_completed_at, auth_deleted_at)
         values ($1, 'user_a', now() - interval '400 days', now() - interval '400 days', now() - interval '400 days')`,
        [USER_A],
      );
      await db.query(
        `insert into strandcue_private.deletion_lifecycle_events(user_id, event, details)
         values ($1, 'purged', '{}'::jsonb), ($1, 'auth-deleted', '{}'::jsonb)`,
        [USER_A],
      );
    } finally {
      await asUser(db, USER_A);
    }
    await retentionCleanup(db);
    await db.exec('set session authorization postgres');
    expect((await db.query('select * from public.deletion_tombstones')).rows).toHaveLength(1);
    expect((await db.query('select * from strandcue_private.deletion_lifecycle_events')).rows).toHaveLength(2);
    await asUser(db, USER_A);
  });

  it('denies the execution retention routine to consumers', async () => {
    await expect(
      db.query('select public.protocol_execution_retention_cleanup()'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('grants execution retention only to the scheduler path', async () => {
    const anon = await db.query<{ can_run: boolean }>(
      `select has_function_privilege('anon', 'public.protocol_execution_retention_cleanup()', 'EXECUTE') can_run`,
    );
    const consumer = await db.query<{ can_run: boolean }>(
      `select has_function_privilege('authenticated', 'public.protocol_execution_retention_cleanup()', 'EXECUTE') can_run`,
    );
    expect(anon.rows).toEqual([{ can_run: false }]);
    expect(consumer.rows).toEqual([{ can_run: false }]);
  });
});

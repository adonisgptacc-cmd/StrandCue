import type { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import {
  applyExecutionCommand,
  type ExecutionCommand,
} from '../../packages/domain/src/protocol-execution.ts';

const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const STARTED_AT = '2026-10-13T09:00:00.000Z';
const AT = '2026-10-13T09:05:00.000Z';

function stepFixture(stepId: string, position: number) {
  return {
    stepId,
    position,
    action: `Test action ${position}`,
    productId: null,
    productVersionId: null,
    toolId: null,
    toolVersionId: null,
    waitSeconds: null,
    rinse: null,
    reasons: ['test reason'],
  };
}

function decisionFixture(requestId: string, statuses = 'ready', stepCount = 2) {
  return {
    status: statuses,
    requestId,
    steps: Array.from({ length: stepCount }, (_, index) =>
      stepFixture(`step-${index + 1}`, index + 1),
    ),
  };
}

async function recordRun(
  db: PGlite,
  overrides: { requestId?: string; decision?: unknown; status?: string } = {},
) {
  const requestId = overrides.requestId ?? RUN_ID;
  const decision = overrides.decision ?? decisionFixture(requestId);
  // SC-001: ready decisions are executable, so the authenticated public RPC
  // no longer persists them. The harness seeds through the dedicated
  // trusted-writer path as strandcue_mutator; the request identity still
  // comes from request.jwt.claim.sub, so rows stay owned by USER_A.
  // SC-002: the trusted path marks rows trusted=true; see seedUntrustedReady
  // for the pre-Task-2 shape (trusted=false).
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    return (
      await db.query<{ result: any }>(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result`,
        [
          requestId,
          'd'.repeat(64),
          '2026-10-13T08:00:00.000Z',
          '1',
          'bundle-synthetic',
          '1',
          overrides.status ?? 'ready',
          JSON.stringify({ requestId, goal: 'basic_wash' }),
          JSON.stringify(decision),
        ],
      )
    ).rows[0].result;
  } finally {
    await asUser(db, USER_A);
  }
}

/**
 * Seeds a ready row shaped exactly like a pre-Task-2 public-path write:
 * status='ready' but trusted=false (the column default; the old public path
 * never sets it). Inserted as postgres, bypassing RLS the way the old
 * permissive RPC did for the owning user.
 */
async function seedUntrustedReady(
  db: PGlite,
  overrides: { requestId?: string; decision?: unknown } = {},
) {
  const requestId = overrides.requestId ?? RUN_ID;
  const decision = overrides.decision ?? decisionFixture(requestId);
  await db.exec('set session authorization postgres');
  try {
    await db.query(
      `insert into public.recommendation_runs(
         user_id, request_id, input_fingerprint, as_of, engine_version,
         bundle_id, bundle_version, status, input, decision)
       values ($1,$2,$3::text,$4::timestamptz,$5,$6,$7,'ready',$8::jsonb,$9::jsonb)`,
      [
        USER_A,
        requestId,
        'd'.repeat(64),
        '2026-10-13T08:00:00.000Z',
        '1',
        'bundle-synthetic',
        '1',
        JSON.stringify({ requestId, goal: 'basic_wash' }),
        JSON.stringify(decision),
      ],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function start(
  db: PGlite,
  overrides: {
    operationId?: string;
    executionId?: string;
    runId?: string;
    startedAt?: string;
  } = {},
) {
  // SC-002: the caller supplies only owned-run identity plus bounded
  // operation metadata. There is no decision argument: the snapshot derives
  // solely from the stored trusted decision.
  return (
    await db.query<{ result: any }>(
      `select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result`,
      [
        overrides.operationId ?? crypto.randomUUID(),
        overrides.executionId ?? EXECUTION_ID,
        overrides.runId ?? RUN_ID,
        overrides.startedAt ?? STARTED_AT,
      ],
    )
  ).rows[0].result;
}

async function transition(
  db: PGlite,
  options: {
    operationId?: string;
    executionId?: string;
    expectedRevision?: number;
    command?: unknown;
    at?: string;
  } = {},
) {
  // SC-003: the transition RPC carries only the bounded command. There is
  // no result snapshot at any layer; the server constructs the execution.
  return (
    await db.query<{ result: any }>(
      `select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz) result`,
      [
        options.operationId ?? crypto.randomUUID(),
        options.executionId ?? EXECUTION_ID,
        options.expectedRevision ?? 0,
        JSON.stringify(options.command ?? { kind: 'pause' }),
        options.at ?? AT,
      ],
    )
  ).rows[0].result;
}

function startedExecution(result: any) {
  return result.execution;
}

/**
 * Canonical form for server-vs-preview parity: everything must match
 * byte-for-byte except the server-owned `updatedAt`, and timestamps are
 * compared as instants (PostgreSQL renders `+00:00` where the client sent
 * `Z` for the same instant).
 */
function normalized(execution: any) {
  const { updatedAt: _serverOwned, ...rest } = execution;
  void _serverOwned;
  return JSON.parse(
    JSON.stringify(rest, (_key, value) =>
      typeof value === 'string' && !Number.isNaN(Date.parse(value)) && /[T]/.test(value)
        ? new Date(value).getTime()
        : value,
    ),
  );
}

async function listExecutionRows(db: PGlite): Promise<any[]> {
  await db.exec('set session authorization postgres');
  const rows = (await db.query('select * from public.protocol_executions')).rows;
  await asUser(db, USER_A);
  return rows;
}

async function listEventRows(db: PGlite): Promise<any[]> {
  await db.exec('set session authorization postgres');
  const rows = (
    await db.query('select * from public.protocol_execution_events order by sequence')
  ).rows;
  await asUser(db, USER_A);
  return rows;
}

async function getActive(db: PGlite) {
  return (await db.query<{ result: any }>('select public.get_active_protocol_execution() result'))
    .rows[0].result;
}

async function listHistory(db: PGlite, limit = 25, cursor: unknown = null) {
  return (
    await db.query<{ result: any }>('select public.list_protocol_executions($1,$2::jsonb) result', [
      limit,
      JSON.stringify(cursor),
    ])
  ).rows[0].result;
}

describe('protocol executions owner-isolated idempotent persistence', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await database();
  }, 60_000);
  beforeEach(async () => {
    await asUser(db, USER_A);
  });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.protocol_executions');
    await db.exec('delete from public.protocol_execution_events');
    await db.exec('delete from strandcue_private.protocol_execution_operations');
    await db.exec('delete from public.recommendation_runs');
  });
  afterAll(async () => {
    await db?.close();
  });

  it('starts an execution owned by the authenticated caller', async () => {
    await complete(db);
    await recordRun(db);
    const result = await start(db);
    expect(result).toMatchObject({
      executionId: EXECUTION_ID,
      recommendationRunId: RUN_ID,
      status: 'in_progress',
      revision: 0,
    });
    const rows = await listExecutionRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_A);
    expect(startedExecution(result)).toMatchObject({
      executionId: EXECUTION_ID,
      status: 'in_progress',
    });
    expect(startedExecution(result).steps).toHaveLength(2);
  });

  it('takes the owner from auth.uid and never from an argument', async () => {
    const signatures = (
      await db.query<{ args: string }>(
        `select pg_get_function_arguments(oid) args from pg_proc
         where proname in ('start_protocol_execution','apply_protocol_execution_command',
           'get_active_protocol_execution','list_protocol_executions')
           and pronamespace = 'public'::regnamespace`,
      )
    ).rows.map(row => row.args);
    expect(signatures).toHaveLength(4);
    for (const signature of signatures) expect(signature).not.toMatch(/owner|user_id/i);
  });

  it('refuses to start against a run owned by another owner without writing rows', async () => {
    await complete(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    const runId = crypto.randomUUID();
    await recordRun(db, { requestId: runId });
    await asUser(db, USER_A);
    await expect(start(db, { runId })).rejects.toThrow(/run-not-owned/i);
    expect(await listExecutionRows(db)).toEqual([]);
    expect(await listEventRows(db)).toEqual([]);
  });

  it('requires a stored ready decision with at least one step', async () => {
    await complete(db);
    // A non-ready stored run refuses even though the caller asks correctly.
    await recordRun(db, { status: 'needs_input', decision: decisionFixture(RUN_ID, 'needs_input') });
    await expect(start(db)).rejects.toThrow(/not-ready-decision/i);
    expect(await listExecutionRows(db)).toEqual([]);
    await db.exec('set session authorization postgres');
    await db.exec('delete from public.recommendation_runs');
    await db.exec('delete from strandcue_private.protocol_execution_operations');
    await asUser(db, USER_A);
    // A stored ready decision with no steps refuses with empty-plan.
    await recordRun(db, { decision: decisionFixture(RUN_ID, 'ready', 0) });
    await expect(start(db)).rejects.toThrow(/empty-plan/i);
    expect(await listExecutionRows(db)).toEqual([]);
  });

  it('exposes no caller-supplied decision on the start RPC', async () => {
    await db.exec('set session authorization postgres');
    const rows = (
      await db.query<{ args: string }>(
        `select pg_get_function_arguments(oid) args from pg_proc
          where proname = 'start_protocol_execution'
            and pronamespace = 'public'::regnamespace`,
      )
    ).rows;
    await asUser(db, USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].args).not.toMatch(/decision/i);
    expect(rows[0].args).toMatch(/p_operation_id/);
    expect(rows[0].args).toMatch(/p_execution_id/);
    expect(rows[0].args).toMatch(/p_recommendation_run_id/);
    expect(rows[0].args).toMatch(/p_started_at/);
  });

  it('derives the initial snapshot solely from the stored trusted decision', async () => {
    await complete(db);
    const stored = {
      status: 'ready',
      requestId: RUN_ID,
      steps: [
        { ...stepFixture('stored-step-1', 1), action: 'Stored action one' },
        { ...stepFixture('stored-step-2', 2), action: 'Stored action two' },
      ],
    };
    await recordRun(db, { decision: stored });
    const result = await start(db);
    expect(result.execution.steps.map((step: any) => step.stepId)).toEqual([
      'stored-step-1',
      'stored-step-2',
    ]);
    expect(result.execution.steps[0].planned.action).toBe('Stored action one');
    const rows = await listExecutionRows(db);
    expect(rows[0].decision).toEqual(stored);
  });

  it('refuses a ready run minted outside the trusted path', async () => {
    await complete(db);
    await seedUntrustedReady(db);
    await expect(start(db)).rejects.toThrow(/untrusted-decision/i);
    expect(await listExecutionRows(db)).toEqual([]);
    expect(await listEventRows(db)).toEqual([]);
  });

  it('refuses a missing run without writing rows', async () => {
    await complete(db);
    await expect(start(db, { runId: crypto.randomUUID() })).rejects.toThrow(/run-not-owned/i);
    expect(await listExecutionRows(db)).toEqual([]);
    expect(await listEventRows(db)).toEqual([]);
  });

  it('refuses a start when the owning account is deleted or blocked', async () => {
    await complete(db);
    await recordRun(db);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'deleting' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    await expect(start(db)).rejects.toThrow(/account-not-active/i);
    expect(await listExecutionRows(db)).toEqual([]);
  });
  it('requires a stored decision of object shape', async () => {
    await complete(db);
    await recordRun(db, { decision: { status: 'ready', steps: 'not-an-array' } });
    await expect(start(db)).rejects.toThrow(/malformed-protocol/i);
    expect(await listExecutionRows(db)).toEqual([]);
  });

  it('requires well-formed stored steps', async () => {
    await complete(db);
    const badSteps = [
      { status: 'ready', requestId: RUN_ID, steps: [{ position: 1 }] },
      { status: 'ready', requestId: RUN_ID, steps: [{ stepId: 'step-1', position: 'first' }] },
      { status: 'ready', requestId: RUN_ID, steps: [{ stepId: 'step-1', position: 0 }] },
      { status: 'ready', requestId: RUN_ID, steps: ['step-1'] },
    ];
    for (const decision of badSteps) {
      const runId = crypto.randomUUID();
      await recordRun(db, { requestId: runId, decision: { ...decision, requestId: runId } });
      await expect(start(db, { runId })).rejects.toThrow(/malformed-protocol/i);
      expect((await listExecutionRows(db)).filter(row => row.recommendation_run_id === runId)).toEqual(
        [],
      );
    }
    expect(await listExecutionRows(db)).toEqual([]);
  });

  it('requires an active account to start or transition', async () => {
    await expect(start(db)).rejects.toThrow(/account-not-active/i);
    await complete(db);
    await recordRun(db);
    const result = await start(db);
    expect(result.revision).toBe(0);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'deleting' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    await expect(transition(db)).rejects.toThrow(/account-not-active/i);
    await expect(getActive(db)).rejects.toThrow(/account-not-active/i);
  });

  it('denies anonymous callers on every RPC', async () => {
    await asUser(db, null);
    await expect(start(db)).rejects.toThrow(/authentication|permission denied/i);
    await expect(transition(db)).rejects.toThrow(/authentication|permission denied/i);
    await expect(getActive(db)).rejects.toThrow(/authentication|permission denied/i);
    await expect(listHistory(db)).rejects.toThrow(/authentication|permission denied/i);
  });

  it('hides another owner executions from reads', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    expect(await getActive(db)).toBeNull();
    expect((await listHistory(db)).items).toEqual([]);
  });

  it('refuses cross-owner transitions without touching rows', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const before = await listExecutionRows(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(transition(db)).rejects.toThrow(/execution-not-found|run-not-owned/i);
    await asUser(db, USER_A);
    expect(await listExecutionRows(db)).toEqual(before);
    expect((await listEventRows(db)).map(row => row.sequence)).toEqual([1]);
  });

  it('returns the same result for an identical operation retry without new rows or events', async () => {
    await complete(db);
    await recordRun(db);
    const operationId = crypto.randomUUID();
    const first = await start(db, { operationId });
    const second = await start(db, { operationId });
    expect(second).toEqual(first);
    expect(await listExecutionRows(db)).toHaveLength(1);
    expect(await listEventRows(db)).toHaveLength(1);
  });

  it('replays an identical transition without duplicating events', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const operationId = crypto.randomUUID();
    const command = { kind: 'complete-step', stepId: 'step-1' };
    const first = await transition(db, { operationId, command });
    const second = await transition(db, { operationId, command });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ revision: 1 });
    expect(first.execution.steps.find((step: any) => step.stepId === 'step-1')).toMatchObject({
      state: 'confirmed',
    });
    expect(await listEventRows(db)).toHaveLength(2);
  });

  it('fails a reused operation id with a different payload', async () => {
    await complete(db);
    await recordRun(db);
    const operationId = crypto.randomUUID();
    await start(db, { operationId });
    await expect(start(db, { operationId, startedAt: '2026-10-13T10:00:00.000Z' })).rejects.toThrow(
      /operation-conflict/i,
    );
    expect(await listExecutionRows(db)).toHaveLength(1);
  });

  it('rejects a stale expected revision without overwriting', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await transition(db, { command: { kind: 'complete-step', stepId: 'step-1' } });
    // A still-legal command on the next step with a stale revision must hit the
    // guarded update predicate, not a legality gate.
    await expect(
      transition(db, {
        expectedRevision: 0,
        command: { kind: 'complete-step', stepId: 'step-2' },
      }),
    ).rejects.toThrow(/revision-conflict/i);
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(1);
    expect(rows[0].execution.steps[0]).toMatchObject({ state: 'confirmed' });
    expect(rows[0].execution.steps[1]).toMatchObject({ state: 'pending' });
  });

  it('enforces status legality for pause, resume, and terminal commands', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await transition(db);
    await expect(
      transition(db, { expectedRevision: 1, command: { kind: 'pause' } }),
    ).rejects.toThrow(/invalid-status-transition/i);
    const afterResume = await transition(db, {
      expectedRevision: 1,
      command: { kind: 'resume' },
    });
    expect(afterResume).toMatchObject({ revision: 2 });
    await expect(
      transition(db, {
        expectedRevision: 2,
        command: { kind: 'complete' },
      }),
    ).rejects.toThrow(/pending-steps-remain/i);
  });

  it('rejects step commands while paused and every command once terminal', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await transition(db);
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'complete-step', stepId: 'step-1' },
      }),
    ).rejects.toThrow(/execution-not-active/i);
    await transition(db, {
      expectedRevision: 1,
      command: { kind: 'abandon', reason: 'owner stopped' },
    });
    await expect(
      transition(db, {
        expectedRevision: 2,
        command: { kind: 'pause' },
      }),
    ).rejects.toThrow(/execution-terminal/i);
  });

  it('rejects unknown steps, resolved steps, and unknown commands', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await expect(
      transition(db, {
        command: { kind: 'complete-step', stepId: 'step-99' },
      }),
    ).rejects.toThrow(/unknown-step/i);
    await transition(db, { command: { kind: 'complete-step', stepId: 'step-1' } });
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'complete-step', stepId: 'step-1' },
      }),
    ).rejects.toThrow(/step-already-resolved/i);
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'celebrate' },
      }),
    ).rejects.toThrow(/unknown-command/i);
  });

  it('appends events in order and forbids direct rewrites', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await transition(db, {
      command: { kind: 'complete-step', stepId: 'step-1' },
    });
    const events = await listEventRows(db);
    expect(events.map(row => row.sequence)).toEqual([1, 2]);
    expect(events[0]).toMatchObject({ user_id: USER_A, kind: 'started' });
    expect(events[1].command).toMatchObject({ kind: 'complete-step', stepId: 'step-1' });
    await asUser(db, USER_A);
    await expect(db.exec(`update public.protocol_execution_events set kind = 'rewritten'`))
      .rejects.toThrow(/permission denied|row-level security/i);
    await expect(db.exec(`delete from public.protocol_execution_events`)).rejects.toThrow(
      /permission denied|row-level security/i,
    );
    await expect(
      db.exec(
        `insert into public.protocol_executions(user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
         values ('${USER_A}','${crypto.randomUUID()}','${RUN_ID}','{}'::jsonb,'{}'::jsonb,0,'in_progress')`,
      ),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('keeps stored decision bytes immutable across transitions', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const before = (await listExecutionRows(db))[0].decision;
    await transition(db, {
      command: { kind: 'complete-step', stepId: 'step-1' },
    });
    const after = (await listExecutionRows(db))[0];
    expect(after.decision).toEqual(before);
    expect(after.decision).toMatchObject({ status: 'ready', requestId: RUN_ID });
    await asUser(db, USER_A);
    await expect(
      db.exec(`update public.protocol_executions set decision = '{}'::jsonb`),
    ).rejects.toThrow(/permission denied|row-level security/i);
    await expect(db.exec(`delete from public.protocol_executions`)).rejects.toThrow(
      /permission denied|row-level security/i,
    );
  });

  it('reads the active execution and lists history newest first', async () => {
    await complete(db);
    await recordRun(db);
    expect(await getActive(db)).toBeNull();
    const started = await start(db);
    expect(await getActive(db)).toMatchObject({ executionId: EXECUTION_ID, revision: 0 });
    const secondExecution = '66666666-6666-4666-8666-666666666666';
    const secondRun = crypto.randomUUID();
    await recordRun(db, { requestId: secondRun, decision: decisionFixture(secondRun) });
    await start(db, { executionId: secondExecution, runId: secondRun });
    const history = await listHistory(db);
    expect(history.items.map((item: any) => item.executionId)).toEqual([
      secondExecution,
      EXECUTION_ID,
    ]);
    expect(history.items[0]).toMatchObject({ status: 'in_progress', revision: 0 });
    expect(started.execution.steps[0].planned).toMatchObject({ stepId: 'step-1', position: 1 });
  });

  it('returns null from read-active once the execution is terminal', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await transition(db);
    await transition(db, {
      expectedRevision: 1,
      command: { kind: 'abandon', reason: 'owner stopped' },
    });
    expect(await getActive(db)).toBeNull();
    expect((await listHistory(db)).items).toHaveLength(1);
  });

  it('hides executions of a deleting owner from reads', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'deleting' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    await expect(getActive(db)).rejects.toThrow(/account-not-active/i);
    await expect(listHistory(db)).rejects.toThrow(/account-not-active/i);
  });

  it('protects every table with forced row level security', async () => {
    await db.exec('set session authorization postgres');
    const unprotected = await db.query(
      `select relname from pg_class
       where relname in ('protocol_executions','protocol_execution_events','protocol_execution_operations')
         and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
    await asUser(db, USER_A);
  });

  it('grants execution to authenticated but never to anon or PUBLIC', async () => {
    await db.exec('set session authorization postgres');
    const rows = await db.query<{ name: string; grantee: string }>(
      `select p.proname name, coalesce(r.rolname, 'PUBLIC') grantee
       from pg_proc p, aclexplode(p.proacl) x
       left join pg_roles r on r.oid = x.grantee
       where p.proname in ('start_protocol_execution','apply_protocol_execution_command',
         'get_active_protocol_execution','list_protocol_executions')
         and p.pronamespace = 'public'::regnamespace
         and x.privilege_type = 'EXECUTE'`,
    );
    const byFunction = new Map<string, string[]>();
    for (const row of rows.rows) {
      byFunction.set(row.name, [...(byFunction.get(row.name) ?? []), row.grantee]);
    }
    expect([...byFunction.keys()].sort()).toEqual([
      'apply_protocol_execution_command',
      'get_active_protocol_execution',
      'list_protocol_executions',
      'start_protocol_execution',
    ]);
    for (const grantees of byFunction.values()) {
      expect(grantees).toContain('authenticated');
      expect(grantees).not.toContain('anon');
      expect(grantees).not.toContain('PUBLIC');
    }
    await asUser(db, USER_A);
  });

  it('keeps service-role maintenance narrow and owner-confined', async () => {
    await db.exec('set session authorization postgres');
    const policies = await db.query<{ policyname: string; roles: string[]; qual: string; with_check: string }>(
      `select policyname, roles, qual, with_check from pg_policies
       where (schemaname = 'public'
         and tablename in ('protocol_executions','protocol_execution_events'))
         or (schemaname = 'strandcue_private' and tablename = 'protocol_execution_operations')`,
    );
    expect(policies.rows.length).toBeGreaterThan(0);
    for (const policy of policies.rows) {
      for (const role of policy.roles) {
        expect(['authenticated', 'strandcue_mutator']).toContain(role);
      }
      expect(policy.roles).not.toContain('service_role');
      expect(policy.roles).not.toContain('anon');
      expect(policy.roles).not.toContain('PUBLIC');
      const confinement = `${policy.qual ?? ''} ${policy.with_check ?? ''}`;
      expect(confinement).toMatch(/request_uid/);
    }
    const grants = await db.query<{ table: string; grantee: string; privilege: string }>(
      `select table_schema || '.' || table_name "table", grantee, privilege_type privilege
       from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('protocol_executions','protocol_execution_events')
         and grantee in ('authenticated','anon','PUBLIC','service_role')`,
    );
    for (const grant of grants.rows) {
      expect(grant.grantee).toBe('authenticated');
      expect(grant.privilege).toBe('SELECT');
    }
    expect(grants.rows.length).toBeGreaterThan(0);
    await asUser(db, USER_A);
  });

  it('exposes no result snapshot on the transition RPC (SC-003 closed)', async () => {
    await db.exec('set session authorization postgres');
    const rows = (
      await db.query<{ name: string; args: string }>(
        `select p.proname name, pg_get_function_arguments(p.oid) args from pg_proc p
          where p.proname in ('apply_protocol_execution_command','apply_execution_command')`,
      )
    ).rows;
    await asUser(db, USER_A);
    const signatures = rows.map(row => `${row.name}(${row.args})`);
    expect(signatures).toHaveLength(2);
    for (const signature of signatures) {
      expect(signature).not.toMatch(/p_result/i);
    }
    expect(signatures).toContainEqual(
      expect.stringMatching(/^apply_protocol_execution_command\(.*p_operation_id.*p_execution_id.*p_expected_revision.*p_command.*p_at.*\)$/),
    );
    // The old 6-argument result-carrying forms are gone at both layers.
    await expect(
      db.query('select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz,$6::jsonb)',
        [crypto.randomUUID(), EXECUTION_ID, 0, '{}', AT, '{}']),
    ).rejects.toThrow(/does not exist|no function/i);
  });

  it('constructs the next snapshot on the server with server-owned updatedAt', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const receipt = await transition(db, { command: { kind: 'pause' } });
    expect(receipt).toMatchObject({ status: 'paused', revision: 1 });
    expect(receipt.execution.steps).toEqual(started.execution.steps);
    expect(Object.keys(receipt.execution).sort()).toEqual(
      ['closeReason', 'executionId', 'finishedAt', 'recommendationRunId', 'startedAt', 'status', 'steps', 'updatedAt'],
    );
    // updatedAt is server-owned: the caller-sent `at` is never copied there.
    expect(receipt.execution.updatedAt).not.toBe(AT);
    expect(Number.isNaN(Date.parse(receipt.execution.updatedAt))).toBe(false);
    const rows = await listExecutionRows(db);
    expect(rows[0].execution).toEqual(receipt.execution);
    expect(new Date(receipt.updatedAt).getTime()).toBe(
      new Date(rows[0].updated_at).getTime(),
    );
  });

  it('matches the domain preview for every legal state x command pair', async () => {
    await complete(db);
    await recordRun(db);
    const replacement = { productId: 'prod-owned', productVersionId: 'v9', owned: true };
    const legal: { command: unknown }[] = [
      { command: { kind: 'complete-step', stepId: 'step-1' } },
      { command: { kind: 'skip-step', stepId: 'step-1', reason: 'owner skipped' } },
      { command: { kind: 'substitute-step', stepId: 'step-1', reason: 'owner swapped', replacement } },
      { command: { kind: 'modify-step', stepId: 'step-1', reason: 'owner changed', detail: 'less water' } },
      { command: { kind: 'pause' } },
      { command: { kind: 'abandon', reason: 'owner stopped' } },
    ];
    for (const { command } of legal) {
      const executionId = crypto.randomUUID();
      const started = await start(db, { executionId });
      const preview = applyExecutionCommand(started.execution, command as ExecutionCommand, { at: AT });
      const receipt = await transition(db, { executionId, command });
      expect(normalized(receipt.execution)).toEqual(normalized(preview));
      expect(receipt).toMatchObject({ status: preview.status, revision: 1 });
      await db.exec('set session authorization postgres');
      await db.exec('delete from public.protocol_executions');
      await db.exec('delete from public.protocol_execution_events');
      await db.exec('delete from strandcue_private.protocol_execution_operations');
      await asUser(db, USER_A);
    }
  });

  it('matches the domain preview across multi-step and paused sequences', async () => {
    await complete(db);
    await recordRun(db);
    const executionId = crypto.randomUUID();
    let expected = (await start(db, { executionId })).execution;
    let revision = 0;
    const sequence: unknown[] = [
      { kind: 'complete-step', stepId: 'step-1' },
      { kind: 'pause' },
      { kind: 'resume' },
      { kind: 'skip-step', stepId: 'step-2', reason: 'owner skipped' },
      { kind: 'complete' },
    ];
    for (const command of sequence) {
      expected = applyExecutionCommand(expected, command as ExecutionCommand, { at: AT });
      const receipt = await transition(db, { executionId, expectedRevision: revision, command });
      revision += 1;
      expect(normalized(receipt.execution)).toEqual(normalized(expected));
      expect(receipt).toMatchObject({ status: expected.status, revision });
    }
    const events = await listEventRows(db);
    expect(events.map(row => row.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('agrees with the domain on illegal state x command pairs (both fail closed)', async () => {
    await complete(db);
    await recordRun(db);
    const executionId = crypto.randomUUID();
    const started = (await start(db, { executionId })).execution;
    const paused = applyExecutionCommand(started, { kind: 'pause' }, { at: AT });
    const cases: { base: unknown; command: unknown; pattern: RegExp }[] = [
      { base: started, command: { kind: 'resume' }, pattern: /invalid-status-transition/i },
      { base: started, command: { kind: 'complete' }, pattern: /pending-steps-remain/i },
      { base: paused, command: { kind: 'pause' }, pattern: /invalid-status-transition/i },
      { base: paused, command: { kind: 'complete-step', stepId: 'step-1' }, pattern: /execution-not-active/i },
      { base: paused, command: { kind: 'complete' }, pattern: /invalid-status-transition/i },
    ];
    for (const { base, command, pattern } of cases) {
      expect(() => applyExecutionCommand(base as any, command as ExecutionCommand, { at: AT })).toThrow();
      const id = crypto.randomUUID();
      let revision = 0;
      let status = (await start(db, { executionId: id })).status;
      if ((base as any).status === 'paused') {
        const pausedReceipt = await transition(db, { executionId: id, command: { kind: 'pause' } });
        status = pausedReceipt.status;
        revision = 1;
      }
      expect(status).toBe((base as any).status);
      await expect(
        transition(db, { executionId: id, expectedRevision: revision, command }),
      ).rejects.toThrow(pattern);
      await db.exec('set session authorization postgres');
      await db.exec(`delete from public.protocol_executions where execution_id = '${id}'`);
      await db.exec(`delete from public.protocol_execution_events where execution_id = '${id}'`);
      await db.exec('delete from strandcue_private.protocol_execution_operations');
      await asUser(db, USER_A);
    }
  });

  it('rejects unknown top-level command keys with invalid-command', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const smuggled = {
      kind: 'pause',
      result: { ...started.execution, status: 'paused', forgedKey: 'attacker-controlled' },
    };
    const malformed: [unknown, RegExp][] = [
      [smuggled, /invalid-command/i],
      [{ kind: 'pause', extra: true }, /invalid-command/i],
      [{ kind: 'pause', stepId: 'step-1' }, /invalid-command/i],
      [{ kind: 'complete-step' }, /invalid-command/i],
      [{ kind: 'complete-step', stepId: 'step-1', reason: 'not allowed here' }, /invalid-command/i],
      [{ kind: 'skip-step', stepId: 'step-1' }, /invalid-command/i],
      [{ kind: 'substitute-step', stepId: 'step-1', reason: 'x' }, /invalid-command/i],
      [{ kind: 'modify-step', stepId: 'step-1', reason: 'x' }, /invalid-command/i],
      [{ kind: 'abandon' }, /invalid-command/i],
      [{ kind: 'complete', reason: 'x' }, /invalid-command/i],
      ['"pause"', /invalid-command/i],
      // No kind at all is outside the transition allowlist.
      [{ stepId: 'step-1' }, /unknown-command/i],
    ];
    for (const [command, pattern] of malformed) {
      await expect(transition(db, { command })).rejects.toThrow(pattern);
    }
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].execution).toEqual(started.execution);
    expect(await listEventRows(db)).toHaveLength(1);
  });

  it('rejects oversize deviation text with text-too-large at the 2 KiB boundary', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const over = 'r'.repeat(2049);
    await expect(
      transition(db, { command: { kind: 'skip-step', stepId: 'step-1', reason: over } }),
    ).rejects.toThrow(/text-too-large/i);
    await expect(
      transition(db, {
        command: { kind: 'modify-step', stepId: 'step-1', reason: 'owner changed', detail: over },
      }),
    ).rejects.toThrow(/text-too-large/i);
    const boundary = 'r'.repeat(2048);
    const receipt = await transition(db, {
      command: { kind: 'skip-step', stepId: 'step-1', reason: boundary },
    });
    expect(receipt).toMatchObject({ revision: 1 });
    expect(
      receipt.execution.steps.find((step: any) => step.stepId === 'step-1').deviation,
    ).toEqual({ kind: 'skip', reason: boundary });
  });

  it('rejects malformed substitute replacements without touching rows', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const base = { kind: 'substitute-step', stepId: 'step-1', reason: 'owner swapped' };
    await expect(
      transition(db, {
        command: { ...base, replacement: { productId: 'p', productVersionId: 'v', owned: false } },
      }),
    ).rejects.toThrow(/unowned-substitution/i);
    const malformed: unknown[] = [
      { ...base, replacement: { productId: 'p', productVersionId: 'v' } },
      { ...base, replacement: { productId: 'p', productVersionId: 'v', owned: true, extra: 1 } },
      { ...base, replacement: { productId: '', productVersionId: 'v', owned: true } },
      { ...base, replacement: { productId: 'p', productVersionId: 'v', owned: 'yes' } },
      { ...base, replacement: 'prod-owned' },
      { ...base, reason: '   ' },
      { ...base, reason: 'owner swapped', detail: 'not allowed here' },
    ];
    for (const command of malformed) {
      await expect(transition(db, { command })).rejects.toThrow(/invalid-command/i);
    }
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].execution).toEqual(started.execution);
    expect(await listEventRows(db)).toHaveLength(1);
  });

  it('keeps owner, run, and protocol identities from the stored row', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const receipt = await transition(db, {
      command: {
        kind: 'substitute-step',
        stepId: 'step-1',
        reason: 'owner swapped',
        replacement: { productId: 'prod-owned', productVersionId: 'v9', owned: true },
      },
    });
    expect(receipt.execution).toMatchObject({
      executionId: EXECUTION_ID,
      recommendationRunId: RUN_ID,
    });
    // startedAt renders in the session zone; compare as an instant.
    expect(new Date(receipt.execution.startedAt).getTime()).toBe(new Date(STARTED_AT).getTime());
    expect(receipt.execution.steps[0].planned).toEqual(started.execution.steps[0].planned);
    expect(receipt.execution.steps[0]).toMatchObject({
      state: 'substituted',
      deviation: {
        kind: 'substitute',
        reason: 'owner swapped',
        replacement: { productId: 'prod-owned', productVersionId: 'v9', owned: true },
      },
    });
    expect(receipt.execution.steps[1]).toEqual(started.execution.steps[1]);
  });

  it('stores the bounded command (never a snapshot) in the event row', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const command = { kind: 'modify-step', stepId: 'step-1', reason: 'owner changed', detail: 'less water' };
    await transition(db, { command });
    const events = await listEventRows(db);
    expect(events).toHaveLength(2);
    expect(events[1].command).toEqual(command);
    expect(events[1]).toMatchObject({ kind: 'command', revision: 1 });
  });

  it('replays an identical bounded command but conflicts on a differing one', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    const operationId = crypto.randomUUID();
    const command = { kind: 'pause' };
    const first = await transition(db, { operationId, command });
    const second = await transition(db, { operationId, command });
    expect(second).toEqual(first);
    expect(await listEventRows(db)).toHaveLength(2);
    await expect(
      transition(db, { operationId, command: { kind: 'resume' } }),
    ).rejects.toThrow(/operation-conflict/i);
    expect(await listEventRows(db)).toHaveLength(2);
  });

  it('rejects empty deviation text and empty step ids', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await expect(
      transition(db, { command: { kind: 'skip-step', stepId: 'step-1', reason: '' } }),
    ).rejects.toThrow(/invalid-command/i);
    await expect(
      transition(db, { command: { kind: 'complete-step', stepId: '' } }),
    ).rejects.toThrow(/invalid-command/i);
    await expect(
      transition(db, { command: { kind: 'abandon', reason: '' } }),
    ).rejects.toThrow(/invalid-command/i);
    expect((await listExecutionRows(db))[0].execution).toEqual(started.execution);
  });

  it('limits mutator table grants to the writes the core performs', async () => {
    await db.exec('set session authorization postgres');
    const privileges = async (schema: string, table: string) =>
      (
        await db.query<{ privilege_type: string }>(
          `select privilege_type from information_schema.role_table_grants
           where grantee = 'strandcue_mutator' and table_schema = $1 and table_name = $2
           order by 1`,
          [schema, table],
        )
      ).rows.map(row => row.privilege_type);
    expect(await privileges('public', 'protocol_executions')).toEqual([
      'INSERT',
      'SELECT',
      'UPDATE',
    ]);
    expect(await privileges('public', 'protocol_execution_events')).toEqual(['INSERT', 'SELECT']);
    expect(await privileges('strandcue_private', 'protocol_execution_operations')).toEqual([
      'INSERT',
      'SELECT',
    ]);
    const commands = await db.query<{ tablename: string; cmd: string }>(
      `select tablename, cmd from pg_policies where schemaname = 'public'
       and tablename in ('protocol_executions','protocol_execution_events')`,
    );
    const byTable = new Map<string, string[]>();
    for (const row of commands.rows) {
      byTable.set(row.tablename, [...(byTable.get(row.tablename) ?? []), row.cmd]);
    }
    expect(byTable.get('protocol_executions')).not.toContain('ALL');
    expect(byTable.get('protocol_executions')).not.toContain('DELETE');
    expect(byTable.get('protocol_execution_events')).not.toContain('UPDATE');
    expect(byTable.get('protocol_execution_events')).not.toContain('DELETE');
    expect(byTable.get('protocol_execution_events')).not.toContain('ALL');
    await asUser(db, USER_A);
  });

  it('refuses decision rewrites at the database while allowing legitimate updates', async () => {
    await complete(db);
    await recordRun(db);
    await start(db);
    await db.exec('set session authorization postgres');
    await expect(
      db.query(`update public.protocol_executions set decision = '{}'::jsonb`),
    ).rejects.toThrow(/decision-immutable/i);
    await db.query(`update public.protocol_executions set status = 'paused'`);
    const rows = (
      await db.query<{ status: string; decision: any }>(
        'select status, decision from public.protocol_executions',
      )
    ).rows;
    expect(rows[0].status).toBe('paused');
    expect(rows[0].decision).toMatchObject({ status: 'ready' });
    await asUser(db, USER_A);
  });

  it('guards the revision predicate inside the transition update', async () => {
    const sql = await readFile(
      'supabase/migrations/20261014194531_protocol_transition_server_constructed.sql',
      'utf8',
    );
    expect(sql).toMatch(/and revision = p_expected_revision/);
  });

  it('pages history through cursors to a terminal null', async () => {
    await complete(db);
    await recordRun(db);
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const executionId of ids) await start(db, { executionId });
    const first = await listHistory(db, 2);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listHistory(db, 2, first.nextCursor);
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.items, ...second.items]
      .map((item: any) => item.executionId)
      .sort();
    expect(seen).toEqual([...ids].sort());
  });

  it('states run-ownership verification as before any execution write', async () => {
    const sql = await readFile(
      'supabase/migrations/20261013175703_protocol_executions.sql',
      'utf8',
    );
    expect(sql).toMatch(/any execution write/);
    expect(sql).not.toMatch(/row is touched/);
  });

  it('never gates persistence on substitution availability', async () => {
    const legacy = await readFile(
      'supabase/migrations/20261013175703_protocol_executions.sql',
      'utf8',
    ).catch(() => '');
    const constructed = await readFile(
      'supabase/migrations/20261014194531_protocol_transition_server_constructed.sql',
      'utf8',
    ).catch(() => '');
    expect(legacy).not.toBe('');
    expect(constructed).not.toBe('');
    for (const sql of [legacy, constructed]) {
      expect(sql).not.toMatch(/stock|availability|inventory|owned_product|user_products/i);
    }
  });
});

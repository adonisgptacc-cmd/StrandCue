import type { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

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

async function recordRun(db: PGlite, overrides: { requestId?: string; decision?: unknown } = {}) {
  const requestId = overrides.requestId ?? RUN_ID;
  const decision = overrides.decision ?? decisionFixture(requestId);
  return (
    await db.query<{ result: any }>(
      `select public.record_recommendation_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result`,
      [
        requestId,
        'd'.repeat(64),
        '2026-10-13T08:00:00.000Z',
        '1',
        'bundle-synthetic',
        '1',
        'ready',
        JSON.stringify({ requestId, goal: 'basic_wash' }),
        JSON.stringify(decision),
      ],
    )
  ).rows[0].result;
}

async function start(
  db: PGlite,
  overrides: {
    operationId?: string;
    executionId?: string;
    runId?: string;
    decision?: unknown;
    startedAt?: string;
  } = {},
) {
  const decision = overrides.decision ?? decisionFixture(overrides.runId ?? RUN_ID);
  return (
    await db.query<{ result: any }>(
      `select public.start_protocol_execution($1,$2,$3,$4::jsonb,$5::timestamptz) result`,
      [
        overrides.operationId ?? crypto.randomUUID(),
        overrides.executionId ?? EXECUTION_ID,
        overrides.runId ?? RUN_ID,
        JSON.stringify(decision),
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
    result?: unknown;
  } = {},
) {
  return (
    await db.query<{ result: any }>(
      `select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz,$6::jsonb) result`,
      [
        options.operationId ?? crypto.randomUUID(),
        options.executionId ?? EXECUTION_ID,
        options.expectedRevision ?? 0,
        JSON.stringify(options.command ?? { kind: 'pause' }),
        options.at ?? AT,
        JSON.stringify(options.result ?? pausedResult()),
      ],
    )
  ).rows[0].result;
}

function startedExecution(result: any) {
  return result.execution;
}

function pausedResult(execution?: any) {
  const base =
    execution ??
    ({
      executionId: EXECUTION_ID,
      recommendationRunId: RUN_ID,
      startedAt: STARTED_AT,
      updatedAt: AT,
      status: 'paused',
      steps: [pendingStep('step-1', 1), pendingStep('step-2', 2)],
      finishedAt: null,
      closeReason: null,
    } as const);
  return { ...base, status: 'paused', updatedAt: AT };
}

function pendingStep(stepId: string, position: number) {
  const planned = stepFixture(stepId, position);
  return { stepId, position, planned, state: 'pending', confirmedAt: null, deviation: null };
}

function confirmedResult(execution: any, stepId: string, at: string) {
  return {
    ...execution,
    status: 'in_progress',
    updatedAt: at,
    steps: execution.steps.map((step: any) =>
      step.stepId === stepId
        ? { ...step, state: 'confirmed', confirmedAt: at, deviation: null }
        : step,
    ),
  };
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

  it('requires a ready decision with at least one step', async () => {
    await complete(db);
    await recordRun(db);
    await expect(
      start(db, { decision: decisionFixture(RUN_ID, 'needs_input') }),
    ).rejects.toThrow(/not-ready-decision/i);
    await expect(start(db, { decision: decisionFixture(RUN_ID, 'ready', 0) })).rejects.toThrow(
      /empty-plan/i,
    );
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
    const started = await start(db);
    const operationId = crypto.randomUUID();
    const command = { kind: 'complete-step', stepId: 'step-1' };
    const result = confirmedResult(started.execution, 'step-1', AT);
    const first = await transition(db, { operationId, command, result });
    const second = await transition(db, { operationId, command, result });
    expect(second).toEqual(first);
    expect(first).toMatchObject({ revision: 1 });
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
    const started = await start(db);
    const first = confirmedResult(started.execution, 'step-1', AT);
    await transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: first });
    // A still-legal command on the next step with a stale revision must hit the
    // guarded update predicate, not a legality gate.
    const second = confirmedResult(first, 'step-2', AT);
    await expect(
      transition(db, {
        expectedRevision: 0,
        command: { kind: 'complete-step', stepId: 'step-2' },
        result: second,
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
    const started = await start(db);
    await transition(db);
    await expect(
      transition(db, { expectedRevision: 1, command: { kind: 'pause' }, result: pausedResult() }),
    ).rejects.toThrow(/invalid-status-transition/i);
    const resumed = { ...started.execution, status: 'in_progress', updatedAt: AT };
    const afterResume = await transition(db, {
      expectedRevision: 1,
      command: { kind: 'resume' },
      result: resumed,
    });
    expect(afterResume).toMatchObject({ revision: 2 });
    await expect(
      transition(db, {
        expectedRevision: 2,
        command: { kind: 'complete' },
        result: { ...resumed, status: 'completed', updatedAt: AT, finishedAt: AT, closeReason: null },
      }),
    ).rejects.toThrow(/pending-steps-remain/i);
  });

  it('rejects step commands while paused and every command once terminal', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await transition(db);
    const stepResult = confirmedResult({ ...started.execution, status: 'paused' }, 'step-1', AT);
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'complete-step', stepId: 'step-1' },
        result: stepResult,
      }),
    ).rejects.toThrow(/execution-not-active/i);
    const abandoned = {
      ...started.execution,
      status: 'abandoned',
      updatedAt: AT,
      finishedAt: AT,
      closeReason: 'owner stopped',
    };
    await transition(db, {
      expectedRevision: 1,
      command: { kind: 'abandon', reason: 'owner stopped' },
      result: abandoned,
    });
    await expect(
      transition(db, {
        expectedRevision: 2,
        command: { kind: 'pause' },
        result: pausedResult(),
      }),
    ).rejects.toThrow(/execution-terminal/i);
  });

  it('rejects unknown steps, resolved steps, and unknown commands', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await expect(
      transition(db, {
        command: { kind: 'complete-step', stepId: 'step-99' },
        result: started.execution,
      }),
    ).rejects.toThrow(/unknown-step/i);
    const once = confirmedResult(started.execution, 'step-1', AT);
    await transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: once });
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'complete-step', stepId: 'step-1' },
        result: once,
      }),
    ).rejects.toThrow(/step-already-resolved/i);
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'celebrate' },
        result: once,
      }),
    ).rejects.toThrow(/unknown-command/i);
  });

  it('appends events in order and forbids direct rewrites', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await transition(db, {
      command: { kind: 'complete-step', stepId: 'step-1' },
      result: confirmedResult(started.execution, 'step-1', AT),
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
    const started = await start(db);
    const before = (await listExecutionRows(db))[0].decision;
    await transition(db, {
      command: { kind: 'complete-step', stepId: 'step-1' },
      result: confirmedResult(started.execution, 'step-1', AT),
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
    await start(db, { executionId: secondExecution, runId: secondRun, decision: decisionFixture(secondRun) });
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
    const started = await start(db);
    await transition(db);
    const abandoned = {
      ...started.execution,
      status: 'abandoned',
      updatedAt: AT,
      finishedAt: AT,
      closeReason: 'owner stopped',
    };
    await transition(db, {
      expectedRevision: 1,
      command: { kind: 'abandon', reason: 'owner stopped' },
      result: abandoned,
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

  it('refuses a forged result that resolves the wrong step', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const forged = confirmedResult(started.execution, 'step-2', AT);
    await expect(
      transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: forged }),
    ).rejects.toThrow(/result-mismatch/i);
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].execution.steps).toEqual(started.execution.steps);
    expect(await listEventRows(db)).toHaveLength(1);
  });

  it('refuses a forged result that resolves no step', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await expect(
      transition(db, {
        command: { kind: 'complete-step', stepId: 'step-1' },
        result: started.execution,
      }),
    ).rejects.toThrow(/result-mismatch/i);
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].execution.steps).toEqual(started.execution.steps);
  });

  it('refuses a forged result that resurrects a resolved step', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const first = confirmedResult(started.execution, 'step-1', AT);
    await transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: first });
    const resurrected = {
      ...first,
      steps: [
        { ...first.steps[0], state: 'pending', confirmedAt: null },
        { ...first.steps[1], state: 'confirmed', confirmedAt: AT, deviation: null },
      ],
    };
    await expect(
      transition(db, {
        expectedRevision: 1,
        command: { kind: 'complete-step', stepId: 'step-2' },
        result: resurrected,
      }),
    ).rejects.toThrow(/result-mismatch/i);
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(1);
    expect(rows[0].execution.steps).toEqual(first.steps);
    expect(await listEventRows(db)).toHaveLength(2);
  });

  it('refuses a fabricated confirmation timestamp', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const forged = confirmedResult(started.execution, 'step-1', '2026-10-13T09:06:00.000Z');
    await expect(
      transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: forged }),
    ).rejects.toThrow(/result-mismatch/i);
    expect((await listExecutionRows(db))[0].revision).toBe(0);
  });

  it('refuses deviation content that does not match the command', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const forged = {
      ...started.execution,
      updatedAt: AT,
      steps: started.execution.steps.map((step: any) =>
        step.stepId === 'step-1'
          ? { ...step, state: 'skipped', deviation: { kind: 'skip', reason: 'forged reason' } }
          : step,
      ),
    };
    await expect(
      transition(db, {
        command: { kind: 'skip-step', stepId: 'step-1', reason: 'owner skipped' },
        result: forged,
      }),
    ).rejects.toThrow(/result-mismatch/i);
    expect((await listExecutionRows(db))[0].revision).toBe(0);
  });

  it('refuses a forged result that rewrites the copied plan', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    const forged = confirmedResult(started.execution, 'step-1', AT);
    forged.steps[0] = {
      ...forged.steps[0],
      planned: { ...forged.steps[0].planned, action: 'Forged action' },
    };
    await expect(
      transition(db, { command: { kind: 'complete-step', stepId: 'step-1' }, result: forged }),
    ).rejects.toThrow(/result-mismatch/i);
    expect((await listExecutionRows(db))[0].revision).toBe(0);
  });

  it('refuses results with mismatched identity, status, or step ids', async () => {
    await complete(db);
    await recordRun(db);
    const started = await start(db);
    await expect(
      transition(db, { command: { kind: 'pause' }, result: started.execution }),
    ).rejects.toThrow(/result-mismatch/i);
    await expect(
      transition(db, {
        command: { kind: 'pause' },
        result: { ...pausedResult(), executionId: crypto.randomUUID() },
      }),
    ).rejects.toThrow(/result-mismatch/i);
    await expect(
      transition(db, {
        command: { kind: 'pause' },
        result: { ...pausedResult(), recommendationRunId: crypto.randomUUID() },
      }),
    ).rejects.toThrow(/result-mismatch/i);
    const dropped = pausedResult();
    await expect(
      transition(db, {
        command: { kind: 'pause' },
        result: { ...dropped, steps: [dropped.steps[0]] },
      }),
    ).rejects.toThrow(/result-mismatch/i);
    const rows = await listExecutionRows(db);
    expect(rows[0].revision).toBe(0);
    expect(rows[0].execution.steps).toEqual(started.execution.steps);
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
      'supabase/migrations/20261013175703_protocol_executions.sql',
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
    const sql = await readFile(
      'supabase/migrations/20261013175703_protocol_executions.sql',
      'utf8',
    ).catch(() => '');
    expect(sql).not.toBe('');
    expect(sql).not.toMatch(/stock|availability|inventory|owned_product|user_products/i);
  });
});

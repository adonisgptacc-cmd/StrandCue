import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

const EXECUTION_ID = '77777777-7777-4777-8777-777777777777';
const RUN_ID = '88888888-8888-4888-8888-888888888888';

function nowIso(): string {
  return new Date().toISOString();
}

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

function decisionFixture(requestId: string) {
  return {
    status: 'ready',
    requestId,
    steps: [stepFixture('step-1', 1), stepFixture('step-2', 2)],
  };
}

async function recordTrustedRun(db: PGlite, requestId: string = RUN_ID) {
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    await db.query(
      `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        requestId,
        'e'.repeat(64),
        '2026-10-13T08:00:00.000Z',
        '1',
        'bundle-synthetic',
        '1',
        'ready',
        JSON.stringify({ requestId, goal: 'basic_wash' }),
        JSON.stringify(decisionFixture(requestId)),
      ],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function start(db: PGlite, executionId: string = EXECUTION_ID, runId: string = RUN_ID) {
  return (
    await db.query<{ result: any }>(
      `select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result`,
      [crypto.randomUUID(), executionId, runId, nowIso()],
    )
  ).rows[0].result;
}

async function transition(db: PGlite, command: unknown, expectedRevision = 0) {
  return (
    await db.query<{ result: any }>(
      `select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz) result`,
      [crypto.randomUUID(), EXECUTION_ID, expectedRevision, JSON.stringify(command), nowIso()],
    )
  ).rows[0].result;
}

async function getActiveWithDecision(db: PGlite) {
  return (
    await db.query<{ result: any }>('select public.get_active_execution_with_decision() result')
  ).rows[0].result;
}

async function rowCounts(db: PGlite) {
  await db.exec('set session authorization postgres');
  try {
    const executions = (await db.query('select count(*)::int c from public.protocol_executions')).rows[0] as { c: number };
    const events = (await db.query('select count(*)::int c from public.protocol_execution_events')).rows[0] as { c: number };
    const operations = (await db.query('select count(*)::int c from strandcue_private.protocol_execution_operations')).rows[0] as { c: number };
    return { executions: executions.c, events: events.c, operations: operations.c };
  } finally {
    await asUser(db, USER_A);
  }
}

describe('fix E: active execution with stored decision aggregate', () => {
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

  it('returns the paused execution with its stored run row and decision', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await transition(db, { kind: 'pause' });
    const bundle = await getActiveWithDecision(db);
    expect(bundle.execution).toMatchObject({
      executionId: EXECUTION_ID,
      recommendationRunId: RUN_ID,
      status: 'paused',
      revision: 1,
    });
    expect(bundle.execution.execution.steps).toHaveLength(2);
    expect(bundle.run).toMatchObject({
      requestId: RUN_ID,
      inputFingerprint: 'e'.repeat(64),
      engineVersion: '1',
      bundleId: 'bundle-synthetic',
      bundleVersion: '1',
      status: 'ready',
      trusted: true,
    });
    expect(bundle.run.decision).toMatchObject({ status: 'ready', requestId: RUN_ID });
    expect(bundle.run.decision.steps).toHaveLength(2);
    // The execution row's own stored copy agrees with the run decision.
    expect(bundle.storedDecision).toEqual(bundle.run.decision);
  });

  it('returns an in-progress execution at its current revision', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await transition(db, { kind: 'pause' });
    await transition(db, { kind: 'resume' }, 1);
    const bundle = await getActiveWithDecision(db);
    expect(bundle.execution).toMatchObject({ status: 'in_progress', revision: 2 });
    expect(bundle.run.requestId).toBe(RUN_ID);
  });

  it('returns null when no execution is active', async () => {
    await complete(db);
    await expect(getActiveWithDecision(db)).resolves.toBeNull();
  });

  it('returns null once the execution is terminal', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await transition(db, { kind: 'abandon', reason: 'owner stopped' });
    await expect(getActiveWithDecision(db)).resolves.toBeNull();
  });

  it('keeps the read side-effect free: retries write nothing', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    const before = await rowCounts(db);
    await getActiveWithDecision(db);
    await getActiveWithDecision(db);
    expect(await rowCounts(db)).toEqual(before);
  });

  it('hides another owner execution and run from the aggregate', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(getActiveWithDecision(db)).resolves.toBeNull();
    await asUser(db, USER_A);
    const bundle = await getActiveWithDecision(db);
    expect(bundle.execution.executionId).toBe(EXECUTION_ID);
  });

  it('cascades the execution away with a deleted run, so the aggregate is null', async () => {
    // DB-003 (20261014211011): protocol_executions references its run with
    // ON DELETE CASCADE, so an execution can never strand without its run.
    // The aggregate's `run: null` shape stays purely defensive; in the real
    // schema a deleted run means no active execution (normal idle).
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await db.exec('set session authorization postgres');
    await db.exec(`delete from public.recommendation_runs where request_id = '${RUN_ID}'`);
    const remaining = (await db.query('select count(*)::int c from public.protocol_executions')).rows[0] as { c: number };
    expect(remaining.c).toBe(0);
    await asUser(db, USER_A);
    await expect(getActiveWithDecision(db)).resolves.toBeNull();
  });

  it('denies anonymous callers on the aggregate', async () => {
    await asUser(db, null);
    await expect(getActiveWithDecision(db)).rejects.toThrow(/authentication|permission denied/i);
    await asUser(db, USER_A);
  });

  it('denies a deleting owner on the aggregate', async () => {
    await complete(db);
    await recordTrustedRun(db);
    await start(db);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'deleting' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    await expect(getActiveWithDecision(db)).rejects.toThrow(/account-not-active/i);
  });

  it('takes no owner or decision argument on either layer', async () => {
    await db.exec('set session authorization postgres');
    try {
      const signatures = (
        await db.query<{ args: string }>(
          `select pg_get_function_arguments(oid) args from pg_proc
           where proname = 'get_active_execution_with_decision'`,
        )
      ).rows.map(row => row.args);
      expect(signatures).toHaveLength(2);
      for (const signature of signatures) {
        expect(signature).toBe('');
      }
    } finally {
      await asUser(db, USER_A);
    }
  });

  it('grants the aggregate to authenticated but never to anon or PUBLIC', async () => {
    await db.exec('set session authorization postgres');
    try {
      const rows = await db.query<{ schema: string; name: string; grantee: string }>(
        `select n.nspname "schema", p.proname name, coalesce(r.rolname, 'PUBLIC') grantee
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace,
         aclexplode(p.proacl) x
         left join pg_roles r on r.oid = x.grantee
         where p.proname = 'get_active_execution_with_decision'
           and x.privilege_type = 'EXECUTE'`,
      );
      const byLayer = new Map<string, string[]>();
      for (const row of rows.rows) {
        const key = `${row.schema}.${row.name}`;
        byLayer.set(key, [...(byLayer.get(key) ?? []), row.grantee]);
      }
      // Both layers grant authenticated and never anon/PUBLIC; the private
      // core additionally grants the definer owner role. (Containment, like
      // the existing execution grant tests: the migration owner itself also
      // appears in the ACL and is not named here.)
      expect(byLayer.size).toBe(2);
      for (const grantees of byLayer.values()) {
        expect(grantees).toContain('authenticated');
        expect(grantees).not.toContain('anon');
        expect(grantees).not.toContain('PUBLIC');
      }
      expect(
        byLayer.get('strandcue_private.get_active_execution_with_decision'),
      ).toContain('strandcue_mutator');
    } finally {
      await asUser(db, USER_A);
    }
  });

  it('re-derives the owner inside the definer core', async () => {
    await db.exec('set session authorization postgres');
    try {
      const core = (
        await db.query<{ secdef: boolean; body: string }>(
          `select prosecdef secdef, prosrc body from pg_proc
           where proname = 'get_active_execution_with_decision'
             and pronamespace = 'strandcue_private'::regnamespace`,
        )
      ).rows[0];
      expect(core.secdef).toBe(true);
      expect(core.body).toMatch(/request_uid/);
      const wrapper = (
        await db.query<{ secdef: boolean }>(
          `select prosecdef secdef from pg_proc
           where proname = 'get_active_execution_with_decision'
             and pronamespace = 'public'::regnamespace`,
        )
      ).rows[0];
      expect(wrapper.secdef).toBe(false);
    } finally {
      await asUser(db, USER_A);
    }
  });
});

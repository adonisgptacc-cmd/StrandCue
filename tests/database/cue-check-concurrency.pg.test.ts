// Opt-in, disposable numeric-loopback PostgreSQL only. No hosted targets.
// The optional pg driver is supplied in an ignored scratch environment.
//
// Real two-session proof for Cue Check operation idempotency (Task I5.0): two sessions that retry ONE
// operation id with the SAME payload must not both write; the loser of the serializing lock re-reads
// the stored receipt and replays it. A different payload gets operation-conflict, and two different
// operation ids for one routine and timing get duplicate-active, never a raw unique violation.
//
// Without a configured real PostgreSQL the suite is SKIPPED and reports itself as blocked. A skip is
// never reported as a concurrency pass.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusalReason } from '../helpers/local-postgres-target';
type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;

const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
const suiteName = refusal === null
  ? 'real-Postgres two-session Cue Check operation retry (Cue Check idempotency proof)'
  : `real-Postgres two-session Cue Check operation retry (SKIPPED/BLOCKED: ${refusal})`;
if (refusal) console.warn(`[cue-check-concurrency.pg] SKIP/BLOCKED - real-Postgres concurrency proof not run: ${refusal}`);

suite(suiteName, () => {
  let admin: PgClient | undefined;
  let Client: PgConstructor;
  const ownerId = crypto.randomUUID();

  const newClient = async () => {
    const client = new Client({ connectionString: dsn });
    await client.connect();
    await client.query("set statement_timeout = '15000'");
    return client;
  };
  const asOwner = async (client: PgClient) => {
    await client.query('reset role');
    await client.query(
      "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [ownerId, JSON.stringify({ sub: ownerId, role: 'authenticated', email: 'pgproof@example.test', is_anonymous: false })],
    );
    await client.query('set role authenticated');
  };
  const backend = async (client: PgClient) => (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
  const observeBlocking = async (waitingPid: number, blockerPid: number, waitEvent = 'advisory') => {
    await admin!.query('reset role');
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const observation = (await admin!.query<{ wait_event_type: string; wait_event: string; blockers: number[] }>(
        'select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1', [waitingPid])).rows[0];
      if (observation?.wait_event_type === 'Lock' && observation.wait_event === waitEvent && observation.blockers.includes(blockerPid)) {
        console.log(`LOCAL-PG-CUE-BLOCKING pid=${waitingPid} blocker=${blockerPid} Lock/${observation.wait_event}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`The second session was not blocked by the serializing ${waitEvent} lock`);
  };

  const recordSql = 'select public.record_cue_check($1::uuid,$2::uuid,$3::jsonb) as result';
  const observationOf = (notes: string) => JSON.stringify({ timing: 'immediate', observedAt: new Date(Date.now() - 1000).toISOString(), overallResult: 'better', notes });

  /** A completed execution for the owner, bound to a trusted run, built through the real RPCs. */
  const seedExecution = async (): Promise<string> => {
    const runId = crypto.randomUUID();
    const executionId = crypto.randomUUID();
    await admin!.query('reset role');
    await admin!.query("select set_config('request.jwt.claim.sub', $1, false)", [ownerId]);
    const decision = {
      status: 'ready', requestId: runId,
      steps: [1, 2].map(n => ({ stepId: `step-${n}`, position: n, action: `Action ${n}`, productId: null, productVersionId: null, toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['r'] })),
    };
    await admin!.query('set role strandcue_mutator');
    await admin!.query('select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)',
      [runId, 'd'.repeat(64), '2026-10-13T08:00:00.000Z', '1', 'bundle-synthetic', '1', 'ready', JSON.stringify({ requestId: runId, goal: 'basic_wash' }), JSON.stringify(decision)]);
    await asOwner(admin!);
    await admin!.query('select public.start_protocol_execution($1,$2,$3,now())', [crypto.randomUUID(), executionId, runId]);
    let revision = 0;
    for (const command of [{ kind: 'complete-step', stepId: 'step-1' }, { kind: 'complete-step', stepId: 'step-2' }, { kind: 'complete' }]) {
      await admin!.query('select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,now())', [crypto.randomUUID(), executionId, revision, JSON.stringify(command)]);
      revision += 1;
    }
    return executionId;
  };

  const settle = async (pending: Promise<unknown>) => pending.then(value => ({ ok: true as const, value }), (error: Error) => ({ ok: false as const, error }));

  beforeAll(async () => {
    ({ Client } = createRequire(import.meta.url)('pg'));
    admin = await newClient();
    const signature = await admin.query<{ signature: string | null }>("select to_regprocedure('public.record_cue_check(uuid,uuid,jsonb)')::text as signature");
    expect(signature.rows[0].signature).toBeTruthy();
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [ownerId]);
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgproof_${ownerId.replaceAll('-', '').slice(0, 12)}`]);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id=$1', [ownerId]);
      const count = await admin.query<{ n: number }>(`select (
        (select count(*) from auth.users where id=$1) + (select count(*) from public.profiles where user_id=$1) +
        (select count(*) from public.cue_checks where user_id=$1) + (select count(*) from public.cue_check_revisions where user_id=$1) +
        (select count(*) from strandcue_private.cue_check_operations where user_id=$1))::int as n`, [ownerId]);
      expect(count.rows[0].n).toBe(0);
      console.log('LOCAL-PG-CUE-CLEANUP-PASS');
    } finally {
      await admin.end();
    }
  });

  const twoSessions = async (run: (a: PgClient, b: PgClient, pids: { a: number; b: number }) => Promise<void>) => {
    const a = await newClient();
    const b = await newClient();
    try {
      await asOwner(a);
      await asOwner(b);
      await run(a, b, { a: await backend(a), b: await backend(b) });
    } finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  };

  it('replays the stored receipt when a second session retries the same operation id and payload', async () => {
    const executionId = await seedExecution();
    const operationId = crypto.randomUUID();
    const payload = observationOf('concurrent create');
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      const winner = (await a.query<{ result: unknown }>(recordSql, [operationId, executionId, payload])).rows[0].result;
      const retry = settle(b.query<{ result: { recordId: string } }>(recordSql, [operationId, executionId, payload]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await retry;
      expect(outcome.ok, outcome.ok ? '' : String((outcome as { error: Error }).error.message)).toBe(true);
      expect((outcome as { value: { rows: { result: unknown }[] } }).value.rows[0].result).toEqual(winner);
    });
    const counts = await admin!.query<{ checks: number; revisions: number; receipts: number }>(
      `select (select count(*) from public.cue_checks where execution_id=$1)::int checks,
              (select count(*) from public.cue_check_revisions r join public.cue_checks c using(record_id) where c.execution_id=$1)::int revisions,
              (select count(*) from strandcue_private.cue_check_operations where operation_id=$2)::int receipts`, [executionId, operationId]);
    expect(counts.rows[0]).toEqual({ checks: 1, revisions: 1, receipts: 1 });
  }, 60_000);

  it('answers a concurrent retry with a different payload with operation-conflict, not a unique violation', async () => {
    const executionId = await seedExecution();
    const operationId = crypto.randomUUID();
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(recordSql, [operationId, executionId, observationOf('first')]);
      const conflicting = settle(b.query(recordSql, [operationId, executionId, observationOf('second')]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await conflicting;
      expect(outcome.ok).toBe(false);
      const message = (outcome as { error: Error }).error.message;
      expect(message).toMatch(/operation-conflict/i);
      expect(message).not.toMatch(/duplicate key|unique constraint/i);
    });
  }, 60_000);

  it('answers two different operation ids for one routine and timing with duplicate-active, not a unique violation', async () => {
    const executionId = await seedExecution();
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(recordSql, [crypto.randomUUID(), executionId, observationOf('first')]);
      const second = settle(b.query(recordSql, [crypto.randomUUID(), executionId, observationOf('second')]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await second;
      expect(outcome.ok).toBe(false);
      const message = (outcome as { error: Error }).error.message;
      expect(message).toMatch(/duplicate-active/i);
      expect(message).not.toMatch(/duplicate key|unique constraint|cue_checks_one_active/i);
    });
  }, 60_000);

  it('replays a concurrent identical correction instead of reporting a revision conflict', async () => {
    const executionId = await seedExecution();
    const created = (await admin!.query<{ result: { recordId: string } }>(recordSql, [crypto.randomUUID(), executionId, observationOf('base')])).rows[0].result;
    const operationId = crypto.randomUUID();
    const corrected = JSON.stringify({ timing: 'immediate', observedAt: new Date(Date.now() - 500).toISOString(), overallResult: 'same', notes: 'fixed' });
    const correctSql = 'select public.correct_cue_check($1::uuid,$2::uuid,1,$3::jsonb,$4) as result';
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      const winner = (await a.query<{ result: unknown }>(correctSql, [operationId, created.recordId, corrected, 'concurrent'])).rows[0].result;
      const retry = settle(b.query<{ result: unknown }>(correctSql, [operationId, created.recordId, corrected, 'concurrent']));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await retry;
      expect(outcome.ok, outcome.ok ? '' : String((outcome as { error: Error }).error.message)).toBe(true);
      expect((outcome as { value: { rows: { result: unknown }[] } }).value.rows[0].result).toEqual(winner);
    });
  }, 60_000);
});

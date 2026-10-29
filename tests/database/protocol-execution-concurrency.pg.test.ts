// Opt-in, disposable numeric-loopback PostgreSQL only. No hosted targets.
// The optional pg driver is supplied in an ignored scratch environment.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {refusalReason} from '../helpers/local-postgres-target';
type PgClient = import('pg').Client;
type PgConstructor = new (config: {connectionString: string}) => PgClient;
const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
if (refusal) console.warn(`[protocol-execution-concurrency.pg] SKIP: ${refusal}`);

suite('real-Postgres two-session op-id blocking (DB-002 local proof)', () => {
  let admin: PgClient | undefined;
  let Client: PgConstructor;
  const ownerId = crypto.randomUUID();
  const newClient = async () => {
    const client = new Client({connectionString: dsn});
    await client.connect();
    await client.query("set statement_timeout = '10000'");
    return client;
  };
  const asOwner = async (client: PgClient) => {
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [ownerId, JSON.stringify({sub: ownerId, role: 'authenticated', email: 'pgproof@example.test', is_anonymous: false})]);
    await client.query('set role authenticated');
  };
  const seedRun = async () => {
    const id = crypto.randomUUID();
    const decision = {status: 'ready', requestId: id, steps: [{stepId: 'synthetic-1', position: 1,
      action: 'Synthetic test', productId: null, productVersionId: null, toolId: null,
      toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['fixture']}]};
    await asOwner(admin!);
    await admin!.query('reset role');
    await admin!.query('set role strandcue_mutator');
    try {
      await admin!.query(`select strandcue_private.record_trusted_run($1,$2,now(),'synthetic','pgproof-synthetic','1','ready',$3::jsonb,$4::jsonb)`,
        [id, 'd'.repeat(64), JSON.stringify({requestId: id, goal: 'basic_wash'}), JSON.stringify(decision)]);
    } finally { await admin!.query('reset role'); }
    return id;
  };
  const seedServerRun = async () => {
    const id = crypto.randomUUID();
    const fingerprint = 'e'.repeat(64);
    const decision = {status: 'ready', requestId: id, steps: [{stepId: 'synthetic-1', position: 1,
      action: 'Synthetic test', productId: null, productVersionId: null, toolId: null,
      toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['fixture']}]};
    await admin!.query('reset role');
    const revision = (await admin!.query<{revision: string}>(
      'select revision::text from strandcue_private.guidance_source_revisions where user_id=$1', [ownerId],
    )).rows[0].revision;
    await admin!.query('set role service_role');
    try {
      await admin!.query(`select public.record_server_recommendation_run(
        $1::uuid,$2::uuid,$3,now(),'synthetic','pgproof-synthetic','1','ready',$4::jsonb,$5::jsonb,$6::bigint)`,
      [ownerId, id, fingerprint, JSON.stringify({requestId: id, goal: 'basic_wash'}), JSON.stringify(decision), revision]);
    } finally { await admin!.query('reset role'); }
    return id;
  };
  const startSql = 'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz) as result';
  const startArgs = (runId: string) => [crypto.randomUUID(), crypto.randomUUID(), runId, new Date().toISOString()];
  const backend = async (client: PgClient) => (await client.query<{pid: number}>('select pg_backend_pid() as pid')).rows[0].pid;
  const observeBlocking = async (waitingPid: number, blockerPid: number) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const observation = (await admin!.query<{wait_event_type: string; wait_event: string; blockers: number[]}>(
        'select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1', [waitingPid])).rows[0];
      if (observation?.wait_event_type === 'Lock' && observation.blockers.includes(blockerPid)) {
        expect(['transactionid', 'advisory']).toContain(observation.wait_event);
        console.log(`LOCAL-PG-BLOCKING pid=${waitingPid} blocker=${blockerPid} Lock/${observation.wait_event}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Exact session B was not blocked by exact session A');
  };
  beforeAll(async () => {
    // eslint-disable-next-line import/no-unresolved -- optional scratch driver, opt-in local suite only
    ({Client} = await import('pg'));
    admin = await newClient();
    const chain = await admin.query<{signature: string | null}>("select to_regprocedure('public.start_protocol_execution(uuid,uuid,uuid,timestamp with time zone)')::text as signature");
    expect(chain.rows[0].signature).toBeTruthy();
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [ownerId]);
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgproof_${ownerId.replaceAll('-', '').slice(0,12)}`]);
    await admin.query('reset role');
    await admin.query('insert into public.hair_passports(user_id,revision) values($1,0) on conflict(user_id) do nothing', [ownerId]);
  });
  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id=$1', [ownerId]);
      const count = await admin.query<{n: number}>(`select (
        (select count(*) from auth.users where id=$1) +
        (select count(*) from public.profiles where user_id=$1) +
        (select count(*) from public.recommendation_runs where user_id=$1) +
        (select count(*) from public.protocol_executions where user_id=$1) +
        (select count(*) from public.protocol_execution_events where user_id=$1) +
        (select count(*) from strandcue_private.protocol_execution_operations where user_id=$1)
      )::int as n`, [ownerId]);
      expect(count.rows[0].n).toBe(0);
      console.log('LOCAL-PG-SYNTHETIC-CLEANUP-PASS');
    } finally { await admin.end(); }
  });
  it.each(['start', 'transition'])('identical %s operation blocks then replays the complete receipt', async kind => {
    const runId = await seedRun();
    const args = startArgs(runId);
    if (kind === 'transition') {
      await asOwner(admin!);
      await admin!.query(startSql, args);
      await admin!.query('reset role');
    }
    const sql = kind === 'start' ? startSql : 'select public.apply_protocol_execution_command($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::timestamptz) as result';
    const operation = kind === 'start' ? args : [crypto.randomUUID(), args[1], 0, JSON.stringify({kind: 'pause'}), args[3]];
    const a = await newClient(), b = await newClient();
    let pending: Promise<unknown> | undefined;
    try {
      await asOwner(a); await asOwner(b);
      const pidA = await backend(a), pidB = await backend(b);
      await a.query('begin');
      const winner = (await a.query<{result: unknown}>(sql, operation)).rows[0].result;
      const replay = b.query<{result: unknown}>(sql, operation);
      pending = replay;
      // Attach rejection handling before observation to avoid unhandled rejection.
      void replay.catch(() => undefined);
      await observeBlocking(pidB, pidA);
      await a.query('commit');
      expect((await replay).rows[0].result).toEqual(winner);
    } finally {
      await a.query('rollback');
      await pending?.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  });
  it('distinct runs and operations complete while the first transaction remains open', async () => {
    const argsA = startArgs(await seedRun()), argsB = startArgs(await seedRun());
    const a = await newClient(), b = await newClient();
    try {
      await asOwner(a); await asOwner(b);
      await b.query("set statement_timeout = '2000'");
      await a.query('begin');
      const first = (await a.query<{result: {executionId: string}}>(startSql, argsA)).rows[0].result;
      const second = (await b.query<{result: {executionId: string}}>(startSql, argsB)).rows[0].result;
      expect(first.executionId).not.toBe(second.executionId);
      // A is still uncommitted: success on B is direct non-contention evidence.
      await a.query('commit');
    } finally { await a.query('rollback'); await Promise.all([a.end(), b.end()]); }
  });
  it('blocks a server-run start behind a source correction, then rejects the stale run without an execution', async () => {
    const runId = await seedServerRun();
    const a = await newClient(), b = await newClient();
    let pending: Promise<unknown> | undefined;
    try {
      await asOwner(b);
      const pidA = await backend(a), pidB = await backend(b);
      await a.query('begin');
      await a.query('update public.hair_passports set revision=revision+1 where user_id=$1', [ownerId]);
      const start = b.query(startSql, startArgs(runId));
      pending = start;
      void start.catch(() => undefined);
      await observeBlocking(pidB, pidA);
      await a.query('commit');
      await expect(start).rejects.toThrow(/source-changed/);
      const count = await admin!.query<{n: number}>(
        'select count(*)::int n from public.protocol_executions where user_id=$1 and recommendation_run_id=$2',
        [ownerId, runId],
      );
      expect(count.rows[0].n).toBe(0);
    } finally {
      await a.query('rollback').catch(() => undefined);
      await pending?.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  }, 60_000);
  it('blocks a correction behind a started server run and rejects a later new start', async () => {
    const runId = await seedServerRun();
    const a = await newClient(), b = await newClient();
    let pending: Promise<unknown> | undefined;
    try {
      await asOwner(a);
      const pidA = await backend(a), pidB = await backend(b);
      await a.query('begin');
      const first = (await a.query<{result: {executionId: string}}>(startSql, startArgs(runId))).rows[0].result;
      const correction = b.query('update public.hair_passports set revision=revision+1 where user_id=$1', [ownerId]);
      pending = correction;
      void correction.catch(() => undefined);
      await observeBlocking(pidB, pidA);
      await a.query('commit');
      await correction;
      await asOwner(a);
      await expect(a.query(startSql, startArgs(runId))).rejects.toThrow(/source-changed/);
      const count = await admin!.query<{n: number}>(
        'select count(*)::int n from public.protocol_executions where user_id=$1 and recommendation_run_id=$2',
        [ownerId, runId],
      );
      expect(count.rows[0].n).toBe(1);
      expect(first.executionId).toBeTruthy();
    } finally {
      await a.query('rollback').catch(() => undefined);
      await pending?.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  }, 60_000);
});

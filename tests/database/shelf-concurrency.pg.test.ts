// Opt-in, disposable numeric-loopback PostgreSQL only. No hosted targets.
// The optional pg driver is supplied in an ignored scratch environment.
//
// This suite proves the concurrency half of the shelf operation
// idempotency contract: two sessions that retry ONE operation id with the
// SAME payload must not both write. The loser of the serializing lock
// re-reads the stored operation and replays it.
//
// Without a configured real PostgreSQL the suite is SKIPPED and reports
// itself as blocked. A skip is never reported as a concurrency pass.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusalReason } from '../helpers/local-postgres-target';
type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;

const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
// A skip is reported as a block, never as a concurrency pass. The reason
// travels with the suite name, so the report CI shows says why the proof
// did not run instead of showing a bare skip.
const suiteName = refusal === null
  ? 'real-Postgres two-session shelf op-id retry (shelf idempotency proof)'
  : `real-Postgres two-session shelf op-id retry (SKIPPED/BLOCKED: ${refusal})`;
if (refusal) console.warn(`[shelf-concurrency.pg] SKIP/BLOCKED - real-Postgres concurrency proof not run: ${refusal}`);

suite(suiteName, () => {
  let admin: PgClient | undefined;
  let Client: PgConstructor;
  const ownerId = crypto.randomUUID();

  const newClient = async () => {
    const client = new Client({ connectionString: dsn });
    await client.connect();
    await client.query("set statement_timeout = '10000'");
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
  const backend = async (client: PgClient) =>
    (await client.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
  const observeBlocking = async (waitingPid: number, blockerPid: number) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const observation = (await admin!.query<{ wait_event_type: string; wait_event: string; blockers: number[] }>(
        'select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid=$1',
        [waitingPid])).rows[0];
      if (observation?.wait_event_type === 'Lock' && observation.blockers.includes(blockerPid)) {
        console.log(`LOCAL-PG-SHELF-BLOCKING pid=${waitingPid} blocker=${blockerPid} Lock/${observation.wait_event}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('The retrying session was not blocked by the serializing lock');
  };

  const addSql = 'select public.shelf_add($1::uuid,$2::uuid,null,$3,$4,$5,$6,null,$7::jsonb,$8::jsonb) as result';
  const addArgs = (operationId: string, productId: string, name: string) => [
    operationId, productId, 'House Brand', name, 'shampoo', 'available',
    JSON.stringify({ precision: 'day', value: '2024-01-15' }), JSON.stringify({}),
  ];

  beforeAll(async () => {
    ({ Client } = createRequire(import.meta.url)('pg'));
    admin = await newClient();
    const signature = await admin.query<{ signature: string | null }>(
      "select to_regprocedure('public.shelf_add(uuid,uuid,uuid,text,text,text,text,text,jsonb,jsonb)')::text as signature");
    expect(signature.rows[0].signature).toBeTruthy();
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [ownerId]);
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgproof_${ownerId.replaceAll('-', '').slice(0, 12)}`]);
    await admin.query('reset role');
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id=$1', [ownerId]);
      const count = await admin.query<{ n: number }>(`select (
        (select count(*) from auth.users where id=$1) +
        (select count(*) from public.profiles where user_id=$1) +
        (select count(*) from public.user_products where owner=$1) +
        (select count(*) from public.user_product_revisions where owner=$1) +
        (select count(*) from strandcue_private.shelf_operations where user_id=$1)
      )::int as n`, [ownerId]);
      expect(count.rows[0].n).toBe(0);
      console.log('LOCAL-PG-SHELF-CLEANUP-PASS');
    } finally {
      await admin.end();
    }
  });

  it('replays the stored result when a second session retries the same operation id', async () => {
    const operationId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const a = await newClient();
    const b = await newClient();
    let pending: Promise<unknown> | undefined;
    try {
      await asOwner(a);
      await asOwner(b);
      const pidA = await backend(a);
      const pidB = await backend(b);
      await a.query('begin');
      const winner = (await a.query<{ result: unknown }>(addSql, addArgs(operationId, productId, 'Gentle Shampoo'))).rows[0].result;
      const replay = b.query<{ result: unknown }>(addSql, addArgs(operationId, productId, 'Gentle Shampoo'));
      pending = replay;
      void replay.catch(() => undefined);
      // The retry waits for the serializing lock: the profile row of the
      // owner is what serializes one owner's writes.
      await observeBlocking(pidB, pidA);
      await a.query('commit');
      const replayed = (await replay).rows[0].result;
      expect(replayed).toEqual(winner);
    } finally {
      await a.query('rollback');
      await pending?.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  }, 60_000);

  it('answers a differing payload with operation-conflict instead of a unique violation', async () => {
    const operationId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const a = await newClient();
    const b = await newClient();
    let pending: Promise<unknown> | undefined;
    try {
      await asOwner(a);
      await asOwner(b);
      const pidA = await backend(a);
      const pidB = await backend(b);
      await a.query('begin');
      await a.query(addSql, addArgs(operationId, productId, 'Gentle Shampoo'));
      const conflicting = b.query(addSql, addArgs(operationId, productId, 'Another Shampoo'));
      pending = conflicting;
      void conflicting.catch(() => undefined);
      await observeBlocking(pidB, pidA);
      await a.query('commit');
      const failure = await pending.then(() => null).catch((error: Error) => error);
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(/operation-conflict/i);
      expect((failure as Error).message).not.toMatch(/revision-conflict/i);
      expect((failure as Error).message).not.toMatch(/duplicate key|unique constraint/i);
    } finally {
      await a.query('rollback');
      await pending?.catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  }, 60_000);
});

// Real-Postgres two-session op-id concurrency proof (DB-002 live gate).
//
// SPECIFIED, NEVER EXECUTED HERE. This suite SKIPS unless the operator sets
// STRANDCUE_PG_DSN to a real LOCAL/STAGING Postgres with the full migration
// chain applied. It NEVER defaults to any hosted DSN, reads the DSN only from
// the environment, and refuses known production hosts with a hard skip.
// Normative choreography: ./protocol-execution-concurrency.pg-spec.md.
// PGlite proves replay-convergence only; only this suite can prove
// wire-level blocking (see the spec's binding PGlite-limits section).
//
// The `pg` driver is intentionally NOT a repo dependency: it is loaded with a
// dynamic import inside beforeAll, so default CI (no DSN) never needs it.
// To run: STRANDCUE_PG_DSN=postgres://... npx vitest run
//   tests/database/protocol-execution-concurrency.pg.test.ts
// with `pg` resolvable in a scratch environment (never commit it).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Minimal structural contract for the dynamically loaded `pg` driver lives in
// ./pg-driver.d.ts (ambient declaration; `pg` is intentionally NOT a repo
// dependency) so typecheck passes with zero new dependencies.
type PgClient = import('pg').Client;

const DSN = process.env.STRANDCUE_PG_DSN ?? '';

function refusalReason(dsn: string): string | null {
  if (!dsn) return 'STRANDCUE_PG_DSN is not set';
  let host = '';
  try {
    host = new URL(dsn).hostname.toLowerCase();
  } catch {
    return 'STRANDCUE_PG_DSN is not a parseable Postgres URL';
  }
  if (host.endsWith('supabase.co') || host.includes('pooler')) {
    return `refusing production-looking host '${host}' (supabase.co / pooler pattern)`;
  }
  return null;
}

const refusal = refusalReason(DSN);
const enabled = refusal === null;
const describeGated = enabled ? describe : describe.skip;

if (!enabled) {
  const why = DSN
    ? `HARD SKIP with warning: ${refusal}. This suite never touches hosted databases.`
    : 'SKIP: STRANDCUE_PG_DSN is not set — real-Postgres wire-level blocking proof not run (PGlite replay-convergence suites still cover convergence).';
  console.warn(`[protocol-execution-concurrency.pg] ${why}`);
}

describeGated('real-Postgres two-session op-id blocking (DB-002 live proof)', () => {
  let admin: PgClient;
  let ownerId: string;

  const asOwner = async (client: PgClient, uid: string): Promise<void> => {
    await client.query('reset role');
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await client.query(
      "select set_config('request.jwt.claims', $1, false)",
      [JSON.stringify({ sub: uid, role: 'authenticated', email: `${uid}@example.test`, is_anonymous: false })],
    );
    await client.query('set role authenticated');
  };

  const newClient = async (Client: new (config: { connectionString: string }) => PgClient): Promise<PgClient> => {
    const client = new Client({ connectionString: DSN });
    await client.connect();
    return client;
  };

  const loadDriver = async (): Promise<new (config: { connectionString: string }) => PgClient> => {
    try {
      // eslint-disable-next-line import/no-unresolved -- 'pg' is an optional operator-provided driver, resolved only when STRANDCUE_PG_DSN is set
      const { Client } = await import('pg');
      return Client;
    } catch {
      throw new Error(
        "STRANDCUE_PG_DSN is set but the 'pg' driver is not resolvable. Install it in a scratch environment " +
          '(never commit it as a dependency) and re-run this suite against a local/staging Postgres only.',
      );
    }
  };

  beforeAll(async () => {
    const Client = await loadDriver();
    admin = await newClient(Client);

    // 1. The full migration chain must be present, or fail loudly.
    const chain = await admin.query<{ start_fn: unknown; ops_table: unknown }>(
      `select to_regproc('public.start_protocol_execution') as start_fn,
              to_regclass('strandcue_private.protocol_execution_operations') as ops_table`,
    );
    expect(chain.rows[0].start_fn, 'start_protocol_execution must exist: apply the full migration chain').toBeTruthy();
    expect(chain.rows[0].ops_table, 'protocol_execution_operations must exist: apply the full migration chain').toBeTruthy();

    // 2-3. Fresh owner + completed profile + one trusted run (spec setup).
    ownerId = crypto.randomUUID();
    await admin.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [ownerId]);
    await asOwner(admin, ownerId);
    await admin.query('select public.complete_account($1, true)', [`pgproof_${Date.now()}`]);
  }, 60_000);

  afterAll(async () => {
    if (admin) await admin.end();
  });

  it('pair 1: identical op blocks on the open transaction, then returns the winner receipt with zero raw 23505', async () => {
    const Client = await loadDriver();
    const sessionA = await newClient(Client);
    const sessionB = await newClient(Client);
    try {
      await asOwner(sessionA, ownerId);
      await asOwner(sessionB, ownerId);
      const opX = crypto.randomUUID();
      const runId = crypto.randomUUID();
      const execA = crypto.randomUUID();

      // Session A: begin, start with op X, hold the xact (and its advisory lock) open.
      await sessionA.query('begin');
      const receiptA = (
        await sessionA.query<{ result: { executionId: string } }>(
          'select public.start_protocol_execution($1, $2, $3) as result',
          [opX, execA, runId],
        )
      ).rows[0].result;
      const holdOpen = sessionA.query('select pg_sleep(5)');
      // Give A a moment to enter pg_sleep holding the advisory xact lock.
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      // Session B: identical op X must BLOCK, then converge after A commits.
      const startedAt = Date.now();
      const pendingB = sessionB.query<{ result: { executionId: string } }>(
        'select public.start_protocol_execution($1, $2, $3) as result',
        [opX, crypto.randomUUID(), runId],
      );
      // While B is in flight, observe lock waiting on B's backend.
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const waiting = await admin.query<{ wait_event_type: string | null; wait_event: string | null }>(
        `select wait_event_type, wait_event from pg_stat_activity
          where datname = current_database() and usename <> 'postgres'
            and wait_event_type = 'Lock' limit 1`,
      );
      expect(
        waiting.rows.length,
        'session B must be observably lock-waiting while session A holds the op (pg_stat_activity Lock)',
      ).toBeGreaterThan(0);

      await holdOpen;
      await sessionA.query('commit');
      const receiptB = (await pendingB).rows[0].result;
      const elapsedMs = Date.now() - startedAt;

      expect(elapsedMs, 'session B must demonstrably block until A commits').toBeGreaterThanOrEqual(4_000);
      expect(receiptB.executionId, 'replayed op returns the winner receipt').toBe(receiptA.executionId);
      // Zero raw 23505: any constraint violation escaping the mapped stable
      // errors would reject the query above instead of returning a receipt.
    } finally {
      try {
        await sessionA.query('rollback');
      } catch {
        // Already committed; ignore.
      }
      await sessionA.end();
      await sessionB.end();
    }
  }, 120_000);

  it('pair 2 (sanity): distinct ops do not cross-block', async () => {
    const Client = await loadDriver();
    const sessionC = await newClient(Client);
    const sessionD = await newClient(Client);
    try {
      await asOwner(sessionC, ownerId);
      await asOwner(sessionD, ownerId);
      const runId = crypto.randomUUID();
      const startedAt = Date.now();
      const [receiptC, receiptD] = await Promise.all([
        sessionC.query<{ result: { executionId: string } }>(
          'select public.start_protocol_execution($1, $2, $3) as result',
          [crypto.randomUUID(), crypto.randomUUID(), runId],
        ),
        sessionD.query<{ result: { executionId: string } }>(
          'select public.start_protocol_execution($1, $2, $3) as result',
          [crypto.randomUUID(), crypto.randomUUID(), runId],
        ),
      ]);
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs, 'distinct ops must complete near the no-contention baseline').toBeLessThan(30_000);
      expect(
        receiptC.rows[0].result.executionId,
        'distinct ops mint distinct executions (op-scoped lock, not owner-scoped)',
      ).not.toBe(receiptD.rows[0].result.executionId);
    } finally {
      await sessionC.end();
      await sessionD.end();
    }
  }, 120_000);
});

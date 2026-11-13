// Opt-in, disposable numeric-loopback PostgreSQL only. No hosted targets.
// The optional pg driver is supplied in an ignored scratch environment.
//
// Real two-session proof for treatment-programme operations (Task I5.4): two sessions that retry ONE
// operation id with the SAME command converge on one stored receipt; a different command gets
// operation-conflict; two operations that cannot both win (a duplicate active enrolment, two changes
// against one revision, a quota race) leave exactly one winner and the loser gets a stable code, never a
// raw constraint or serialisation error. Each test asserts the second session actually waited on the
// serialising advisory lock, so a pass cannot come from the sessions merely running one after the other.
//
// Without a configured real PostgreSQL the suite is SKIPPED and reports itself as blocked. A skip is
// never reported as a concurrency pass. The published rule and catalogue fixtures are immutable by
// design and stay in the disposable database; every owner row is removed with the owner.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusalReason } from '../helpers/local-postgres-target';
type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;

const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
const suiteName = refusal === null
  ? 'real-Postgres two-session treatment-programme operations (programme idempotency proof)'
  : `real-Postgres two-session treatment-programme operations (SKIPPED/BLOCKED: ${refusal})`;
if (refusal) console.warn(`[treatment-programme-concurrency.pg] SKIP/BLOCKED - real-Postgres concurrency proof not run: ${refusal}`);

suite(suiteName, () => {
  let admin: PgClient | undefined;
  let Client: PgConstructor;
  const ownerId = crypto.randomUUID();
  const quotaOwnerId = crypto.randomUUID();
  const abandonOwnerId = crypto.randomUUID();
  /** The owner every session acts as; the quota test switches to its own owner. */
  let actor = ownerId;
  const tag = ownerId.replaceAll('-', '').slice(0, 10);
  const brandId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const START = '2026-09-01T08:00:00.000Z';

  const newClient = async () => {
    const client = new Client({ connectionString: dsn });
    await client.connect();
    await client.query("set statement_timeout = '20000'");
    return client;
  };
  const asOwner = async (client: PgClient) => {
    await client.query('reset role');
    await client.query(
      "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
      [actor, JSON.stringify({ sub: actor, role: 'authenticated', email: 'pgproof@example.test', is_anonymous: false })],
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
        console.log(`LOCAL-PG-PROGRAMME-BLOCKING pid=${waitingPid} blocker=${blockerPid} Lock/${observation.wait_event}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`The second session was not blocked by the serializing ${waitEvent} lock`);
  };

  const enrolSql = 'select public.enrol_programme($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7) as result';
  const changeSql = 'select public.change_programme($1::uuid,$2::uuid,$3,$4::jsonb) as result';
  const enrolArgs = (operationId: string, ruleId: string, start = START) =>
    [operationId, productId, versionId, ruleId, '1', JSON.stringify({ precision: 'exact', value: start }), null];

  /** A reviewed rule fixture, published directly as a privileged setup step. */
  const publishRule = async (): Promise<{ ruleId: string; artifactId: string }> => {
    const ruleId = `pg-rule-${tag}-${crypto.randomUUID().slice(0, 8)}`;
    const artifactId = `pg-artifact-${ruleId}`;
    const rule = {
      ruleId, ruleVersion: '1', productId, productVersionId: versionId, unit: 'wash', applicationWashCounts: false,
      range: { minimum: 2, maximum: 4 }, transitionPolicy: { initialPhaseLimit: 1, reassessmentThreshold: 3, maintenanceThreshold: 3 },
      resumptionRule: { ruleId: 'resume-fixture', ruleVersion: '1', policy: 'resume_from_pause' },
    };
    await admin!.query('reset role');
    await admin!.query(
      `insert into strandcue_private.programme_rule_publications(artifact_id, artifact_version, content_digest, rule, state, authored_by, reviewed_by, reviewed_at, published_at)
       select $1, '1', 'sha256:' || encode(sha256(convert_to(r::text, 'UTF8')), 'hex'), r, 'published', 'Programme proof author', 'Programme proof reviewer', now(), now()
         from (select $2::jsonb r) x`, [artifactId, JSON.stringify(rule)]);
    return { ruleId, artifactId };
  };

  const settle = async (pending: Promise<unknown>) => pending.then(value => ({ ok: true as const, value }), (error: Error) => ({ ok: false as const, error }));
  const messageOf = (outcome: { ok: boolean }) => String((outcome as { error?: Error }).error?.message ?? '');
  const resultOf = (outcome: { ok: boolean }) => (outcome as unknown as { value: { rows: { result: unknown }[] } }).value.rows[0].result;

  const countsFor = async (ruleId: string) => {
    await admin!.query('reset role');
    return (await admin!.query<{ heads: number; events: number; receipts: number }>(
      `select (select count(*) from public.treatment_programmes where user_id=$1 and rule_id=$2)::int heads,
              (select count(*) from public.treatment_programme_events e join public.treatment_programmes p using (enrolment_id) where p.user_id=$1 and p.rule_id=$2)::int events,
              (select count(*) from strandcue_private.treatment_programme_operations where user_id=$1)::int receipts`, [actor, ruleId])).rows[0];
  };

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

  beforeAll(async () => {
    ({ Client } = createRequire(import.meta.url)('pg'));
    admin = await newClient();
    const signature = await admin.query<{ signature: string | null }>("select to_regprocedure('public.enrol_programme(uuid,uuid,uuid,text,text,jsonb,text)')::text as signature");
    expect(signature.rows[0].signature).toBeTruthy();
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [ownerId]);
    await admin.query('insert into public.brands(id, name) values($1, $2)', [brandId, `Programme proof brand ${tag}`]);
    await admin.query(`insert into public.products(id, brand_id, name, category, market) values($1, $2, 'Proof treatment', 'bond/protein treatment', 'ZA')`, [productId, brandId]);
    await admin.query(`insert into public.product_versions(id, product_id, market, structured_directions, lifecycle) values($1, $2, 'ZA', '{}', 'active')`, [versionId, productId]);
    await admin.query(`insert into public.product_verification_events(version_id, reviewer, reviewed_fields, status, reason) values($1, 'proof-verifier', array['identity'], 'verified', 'synthetic proof')`, [versionId]);
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [quotaOwnerId]);
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [abandonOwnerId]);
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgprog_${tag}`]);
    actor = quotaOwnerId;
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgquota_${tag}`]);
    actor = abandonOwnerId;
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`pgabandon_${tag}`]);
    actor = ownerId;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id = any($1::uuid[])', [[ownerId, quotaOwnerId, abandonOwnerId]]);
      const count = await admin.query<{ n: number }>(`select (
        (select count(*) from auth.users where id = any($1::uuid[])) + (select count(*) from public.profiles where user_id = any($1::uuid[])) +
        (select count(*) from public.treatment_programmes where user_id = any($1::uuid[])) + (select count(*) from public.treatment_programme_events where user_id = any($1::uuid[])) +
        (select count(*) from strandcue_private.treatment_programme_operations where user_id = any($1::uuid[])))::int as n`, [[ownerId, quotaOwnerId, abandonOwnerId]]);
      expect(count.rows[0].n).toBe(0);
      console.log('LOCAL-PG-PROGRAMME-CLEANUP-PASS');
    } finally {
      await admin.end();
    }
  });

  it('replays the stored receipt when a second session retries the same enrolment operation id and command', async () => {
    const { ruleId } = await publishRule();
    const operationId = crypto.randomUUID();
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      const winner = (await a.query<{ result: unknown }>(enrolSql, enrolArgs(operationId, ruleId))).rows[0].result;
      const retry = settle(b.query(enrolSql, enrolArgs(operationId, ruleId)));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await retry;
      expect(outcome.ok, messageOf(outcome)).toBe(true);
      expect(resultOf(outcome)).toEqual(winner);
    });
    expect(await countsFor(ruleId)).toMatchObject({ heads: 1, events: 1 });
  }, 60_000);

  it('answers a concurrent retry with a different command with operation-conflict, not a unique violation', async () => {
    const { ruleId } = await publishRule();
    const operationId = crypto.randomUUID();
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(enrolSql, enrolArgs(operationId, ruleId));
      const conflicting = settle(b.query(enrolSql, enrolArgs(operationId, ruleId, '2026-09-02T08:00:00.000Z')));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await conflicting;
      expect(outcome.ok).toBe(false);
      expect(messageOf(outcome)).toMatch(/operation-conflict/);
      expect(messageOf(outcome)).not.toMatch(/duplicate key|unique constraint/i);
    });
    expect((await countsFor(ruleId)).heads).toBe(1);
  }, 60_000);

  it('answers two operation ids enrolling one rule with duplicate-active, never a unique violation', async () => {
    const { ruleId } = await publishRule();
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(enrolSql, enrolArgs(crypto.randomUUID(), ruleId));
      const second = settle(b.query(enrolSql, enrolArgs(crypto.randomUUID(), ruleId)));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await second;
      expect(outcome.ok).toBe(false);
      expect(messageOf(outcome)).toMatch(/duplicate-active/);
      expect(messageOf(outcome)).not.toMatch(/duplicate key|unique constraint|treatment_programmes_one_active/i);
    });
    expect((await countsFor(ruleId)).heads).toBe(1);
  }, 60_000);

  it('replays a concurrent identical change instead of reporting a revision conflict', async () => {
    const { ruleId } = await publishRule();
    await asOwner(admin!);
    const record = (await admin!.query<{ result: { enrolmentId: string } }>(enrolSql, enrolArgs(crypto.randomUUID(), ruleId))).rows[0].result;
    const operationId = crypto.randomUUID();
    const pause = JSON.stringify({ kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' });
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      const winner = (await a.query<{ result: unknown }>(changeSql, [operationId, record.enrolmentId, 1, pause])).rows[0].result;
      const retry = settle(b.query(changeSql, [operationId, record.enrolmentId, 1, pause]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await retry;
      expect(outcome.ok, messageOf(outcome)).toBe(true);
      expect(resultOf(outcome)).toEqual(winner);
    });
    expect(await countsFor(ruleId)).toMatchObject({ heads: 1, events: 2 });
  }, 60_000);

  it('lets exactly one of two conflicting changes at the same revision win', async () => {
    const { ruleId } = await publishRule();
    await asOwner(admin!);
    const record = (await admin!.query<{ result: { enrolmentId: string } }>(enrolSql, enrolArgs(crypto.randomUUID(), ruleId))).rows[0].result;
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(changeSql, [crypto.randomUUID(), record.enrolmentId, 1, JSON.stringify({ kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' })]);
      const loser = settle(b.query(changeSql, [crypto.randomUUID(), record.enrolmentId, 1, JSON.stringify({ kind: 'pause', pausedAt: '2026-09-10T00:00:00.000Z', reasonCode: 'illness' })]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await loser;
      expect(outcome.ok).toBe(false);
      expect(messageOf(outcome)).toMatch(/revision-conflict/);
      expect(messageOf(outcome)).not.toMatch(/duplicate key|unique constraint|could not serialize/i);
    });
    const state = await admin!.query<{ reason_code: string }>(
      `select reason_code from public.treatment_programme_events where enrolment_id=$1 and kind='pause'`, [record.enrolmentId]);
    expect(state.rows).toEqual([{ reason_code: 'travel' }]);
    expect(await countsFor(ruleId)).toMatchObject({ heads: 1, events: 2 });
  }, 60_000);

  it('lets exactly one of a concurrent abandon and a concurrent pause at the same revision win', async () => {
    actor = abandonOwnerId;
    const { ruleId } = await publishRule();
    await asOwner(admin!);
    const record = (await admin!.query<{ result: { enrolmentId: string } }>(enrolSql, enrolArgs(crypto.randomUUID(), ruleId))).rows[0].result;
    await twoSessions(async (a, b, pids) => {
      await a.query('begin');
      await a.query(changeSql, [crypto.randomUUID(), record.enrolmentId, 1, JSON.stringify({ kind: 'abandon' })]);
      const loser = settle(b.query(changeSql, [crypto.randomUUID(), record.enrolmentId, 1, JSON.stringify({ kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' })]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await loser;
      expect(outcome.ok).toBe(false);
      expect(messageOf(outcome)).toMatch(/revision-conflict/);
    });
    const state = await admin!.query<{ status: string; revision: number }>('select status, revision from public.treatment_programmes where enrolment_id=$1', [record.enrolmentId]);
    expect(state.rows).toEqual([{ status: 'abandoned', revision: 2 }]);
    actor = ownerId;
  }, 60_000);

  it('enforces the active-enrolment quota atomically when two sessions enrol at the limit', async () => {
    // A dedicated owner, filled to four of the five allowed active programmes.
    actor = quotaOwnerId;
    try {
      for (let index = 0; index < 4; index += 1) {
        const { ruleId } = await publishRule();
        await asOwner(admin!);
        await admin!.query(enrolSql, enrolArgs(crypto.randomUUID(), ruleId));
      }
      const first = await publishRule();
      const second = await publishRule();
      await twoSessions(async (a, b, pids) => {
        await a.query('begin');
        await a.query(enrolSql, enrolArgs(crypto.randomUUID(), first.ruleId));
        const raced = settle(b.query(enrolSql, enrolArgs(crypto.randomUUID(), second.ruleId)));
        await observeBlocking(pids.b, pids.a);
        await a.query('commit');
        const outcome = await raced;
        expect(outcome.ok).toBe(false);
        expect(messageOf(outcome)).toMatch(/quota-exceeded/);
      });
      await admin!.query('reset role');
      const total = await admin!.query<{ n: number }>(`select count(*)::int n from public.treatment_programmes where user_id=$1 and status='active'`, [quotaOwnerId]);
      expect(total.rows[0].n).toBe(5);
      expect((await countsFor(second.ruleId)).heads).toBe(0);
    } finally {
      actor = ownerId;
    }
  }, 120_000);
});

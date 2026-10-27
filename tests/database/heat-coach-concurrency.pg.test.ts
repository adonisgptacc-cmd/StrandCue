// Opt-in proof against disposable numeric-loopback PostgreSQL only. Never target hosted or production.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { refusalReason } from '../helpers/local-postgres-target.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule, type SyntheticRegistryIdentity } from './support/heat-publication-fixtures.ts';

type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;
const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
const suite = refusal === null ? describe : describe.skip;
if (refusal) console.warn(`[heat-coach-concurrency.pg] SKIP/BLOCKED - real-Postgres proof not run: ${refusal}`);

suite(refusal === null ? 'real-Postgres Heat Coach races' : `real-Postgres Heat Coach (SKIPPED/BLOCKED: ${refusal})`, () => {
  let Client: PgConstructor;
  let admin: PgClient;
  const owner = crypto.randomUUID();
  const quotaOwner = crypto.randomUUID();
  const sourceOwner = crypto.randomUUID();
  const publication = crypto.randomUUID();
  const quotaPublicationA = crypto.randomUUID();
  const quotaPublicationB = crypto.randomUUID();
  const publications = [publication, quotaPublicationA, quotaPublicationB];
  const digests = new Map<string, string>();
  let registry: SyntheticRegistryIdentity;
  const intent = JSON.stringify({ method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' }, passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [] });

  const client = async () => {
    const value = new Client({ connectionString: dsn });
    await value.connect();
    await value.query("set statement_timeout='20000'");
    return value;
  };
  const asOwner = async (value: PgClient, actor = owner) => {
    await value.query('reset role');
    await value.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [actor, JSON.stringify({ sub: actor, role: 'authenticated', email: 'heat-proof@example.test', is_anonymous: false })]);
    await value.query('set role authenticated');
  };
  const call = (value: PgClient, operation: string, id = publication, body = intent) => value.query<{ result: any }>(
    'select public.create_heat_coach_assessment($1::uuid,$2::uuid,$3,$4::jsonb) result',
    [operation, id, digests.get(id), body],
  );
  const settle = async <T>(pending: Promise<T>) => pending.then(value => ({ ok: true as const, value }), (error: Error) => ({ ok: false as const, error }));
  const backend = async (value: PgClient) => (await value.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
  const observeBlocking = async (waitingPid: number, blockerPid: number) => {
    await admin.query('reset role');
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const row = (await admin.query<{ wait_event_type: string; wait_event: string; blockers: number[] }>(
        'select wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1', [waitingPid],
      )).rows[0];
      if (row?.wait_event_type === 'Lock' && row.wait_event === 'advisory' && row.blockers.includes(blockerPid)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Session ${waitingPid} did not wait on ${blockerPid}'s advisory lock`);
  };
  const withClients = async (run: (a: PgClient, b: PgClient, pids: { a: number; b: number }) => Promise<void>) => {
    const a = await client();
    const b = await client();
    try { await run(a, b, { a: await backend(a), b: await backend(b) }); }
    finally {
      await a.query('rollback').catch(() => undefined);
      await b.query('rollback').catch(() => undefined);
      await Promise.all([a.end(), b.end()]);
    }
  };

  const publish = async (id: string) => {
    const rule = { schemaVersion: 1, publicationId: id, ruleVersion: '1.0.0', digest: '0'.repeat(64), lifecycle: 'reviewed', validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, requiredProductCapability: null, allowedMethods: ['heated-air'], limits: { temperatures: [], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null }, necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit' };
    const published = await seedSyntheticHeatRule((sql, values) => admin.query(sql, values), id, rule, registry);
    digests.set(id, published.contentDigest);
  };

  beforeAll(async () => {
    // Optional scratch driver. NODE_PATH may point at an external temporary install.
    ({ Client } = createRequire(import.meta.url)('pg'));
    admin = await client();
    expect((await admin.query("select to_regprocedure('public.create_heat_coach_assessment(uuid,uuid,text,jsonb)') signature")).rows[0].signature).toBeTruthy();
    for (const actor of [owner, quotaOwner, sourceOwner]) {
      await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [actor]);
      await asOwner(admin, actor);
      await admin.query('select public.complete_account($1,true)', [`heatpg_${actor.slice(0, 8)}`]);
      await admin.query('reset role');
    }
    await admin.query('insert into public.hair_passports(user_id,revision) values($1,0) on conflict(user_id) do nothing', [sourceOwner]);
    registry = await seedSyntheticHeatCapabilityRegistry((sql, values) => admin.query(sql, values));
    for (const id of publications) await publish(id);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id=any($1::uuid[])', [[owner, quotaOwner, sourceOwner]]);
      await admin.query('alter table strandcue_private.heat_rule_publications disable trigger user');
      try { await admin.query('delete from strandcue_private.heat_rule_publications where id=any($1::uuid[])', [publications]); }
      finally { await admin.query('alter table strandcue_private.heat_rule_publications enable trigger user'); }
    } finally { await admin.end(); }
  });

  it('converges identical retries and same-intent creates while changed replay conflicts', async () => {
    await withClients(async (a, b, pids) => {
      await asOwner(a); await asOwner(b);
      const operation = crypto.randomUUID();
      await a.query('begin');
      const first = (await call(a, operation)).rows[0].result;
      const retry = settle(call(b, operation));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const second = await retry;
      expect(second.ok, String(second.ok ? '' : second.error.message)).toBe(true);
      if (second.ok) expect(second.value.rows[0].result).toEqual(first);
      const third = await call(b, crypto.randomUUID());
      expect(third.rows[0].result.assessmentId).toBe(first.assessmentId);
      const changed = JSON.stringify({ ...JSON.parse(intent), zones: [{ region: 'whole_head', segment: 'entire_strand' }] });
      await expect(call(b, operation, publication, changed)).rejects.toThrow(/operation-conflict/);
    });
    const count = await admin.query<{ count: number }>('select count(*)::int count from public.heat_coach_assessments where owner=$1', [owner]);
    expect(count.rows[0].count).toBe(1);
  }, 60_000);

  it('serializes the owner-wide quota across different publications', async () => {
    await admin.query('reset role');
    await admin.query(`insert into public.heat_coach_assessments(owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
      select $1,$2,$3,'{}'::jsonb,'{}'::jsonb,'needs_input','{}'::jsonb,'sha256:'||repeat('0',64) from generate_series(1,999)`,
    [quotaOwner, quotaPublicationA, digests.get(quotaPublicationA)]);
    await withClients(async (a, b, pids) => {
      await asOwner(a, quotaOwner); await asOwner(b, quotaOwner);
      await a.query('begin');
      const winner = (await call(a, crypto.randomUUID(), quotaPublicationA)).rows[0].result;
      const losingOperation = crypto.randomUUID();
      const loser = settle(call(b, losingOperation, quotaPublicationB));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await loser;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.message).toMatch(/assessment-quota-exceeded/);
        expect(outcome.error.message).not.toMatch(/duplicate key|23505|constraint|serialization/i);
      }
      expect(winner.assessmentId).toBeTruthy();
      const receipt = await admin.query<{ count: number }>(
        'select count(*)::int count from strandcue_private.heat_coach_operations where owner=$1 and operation_id=$2',
        [quotaOwner, losingOperation],
      );
      expect(receipt.rows[0].count).toBe(0);
    });
    const count = await admin.query<{ count: number }>('select count(*)::int count from public.heat_coach_assessments where owner=$1', [quotaOwner]);
    expect(count.rows[0].count).toBe(1000);
  }, 60_000);

  it('captures the committed source snapshot while a source correction is uncommitted, then marks history stale', async () => {
    await withClients(async (a, b) => {
      await a.query('begin');
      await a.query('update public.hair_passports set revision=revision+1 where user_id=$1', [sourceOwner]);
      await asOwner(b, sourceOwner);
      const assessment = (await call(b, crypto.randomUUID())).rows[0].result;
      const stored = await admin.query<{ revision: number }>(
        "select (source_revisions#>>'{passport,revision}')::int revision from public.heat_coach_assessments where id=$1",
        [assessment.assessmentId],
      );
      expect(stored.rows[0].revision).toBe(0);
      await a.query('commit');
      const restored = await b.query<{ result: any }>('select public.get_heat_coach_assessment($1::uuid) result', [assessment.assessmentId]);
      expect(restored.rows[0].result.stale).toBe(true);
    });
  }, 60_000);

  it('makes withdrawal wait for an in-flight assessment and invalidates that history afterward', async () => {
    await withClients(async (a, b, pids) => {
      await asOwner(a);
      await a.query('begin');
      const assessment = (await call(a, crypto.randomUUID())).rows[0].result;
      const withdrawing = settle(b.query("update strandcue_private.heat_rule_publications set state='withdrawn' where id=$1", [publication]));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const withdrawn = await withdrawing;
      expect(withdrawn.ok, String(withdrawn.ok ? '' : withdrawn.error.message)).toBe(true);
      await asOwner(a);
      const restored = await a.query<{ result: any }>('select public.get_heat_coach_assessment($1::uuid) result', [assessment.assessmentId]);
      expect(restored.rows[0].result.stale).toBe(true);
      await expect(call(a, crypto.randomUUID())).rejects.toThrow(/heat-content-pending/);
    });
  }, 60_000);

  it('makes capability-registry withdrawal wait for an in-flight assessment', async () => {
    await withClients(async (a, b, pids) => {
      await asOwner(a, sourceOwner);
      await a.query('begin');
      const assessment = (await call(a, crypto.randomUUID(), quotaPublicationB)).rows[0].result;
      const withdrawing = settle(b.query(
        "update strandcue_private.heat_capability_publications set state='withdrawn' where id=$1", [registry.id],
      ));
      await observeBlocking(pids.b, pids.a);
      await a.query('commit');
      const outcome = await withdrawing;
      expect(outcome.ok, String(outcome.ok ? '' : outcome.error.message)).toBe(true);
      const restored = await a.query<{ result: any }>('select public.get_heat_coach_assessment($1::uuid) result', [assessment.assessmentId]);
      expect(restored.rows[0].result.stale).toBe(true);
      await expect(call(a, crypto.randomUUID(), quotaPublicationB)).rejects.toThrow(/heat-content-pending/);
    });
  }, 60_000);
});

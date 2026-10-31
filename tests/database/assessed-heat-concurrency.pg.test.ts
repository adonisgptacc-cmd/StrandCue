// Opt-in two-session proof against a disposable numeric-loopback PostgreSQL database.
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { conformance } from '../fixtures/heat-coach-conformance.ts';
import { refusalReason } from '../helpers/local-postgres-target.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

type PgClient = import('pg').Client;
type PgConstructor = new (config: { connectionString: string }) => PgClient;
const dsn = process.env.STRANDCUE_PG_DSN ?? '';
const refusal = refusalReason(dsn);
if (refusal) console.warn(`[assessed-heat-concurrency.pg] SKIP/BLOCKED: ${refusal}`);
const suite = refusal === null ? describe : describe.skip;

suite('real-Postgres assessed heat start and withdrawal', () => {
  let Client: PgConstructor;
  let admin: PgClient;
  const owner = crypto.randomUUID();
  const product = crypto.randomUUID();
  const tool = crypto.randomUUID();
  const productBrand = crypto.randomUUID();
  const productCatalogue = crypto.randomUUID();
  const productVersion = crypto.randomUUID();
  const toolBrand = crypto.randomUUID();
  const toolCatalogue = crypto.randomUUID();
  const toolVersion = crypto.randomUUID();
  const firstPublication = crypto.randomUUID();
  const withdrawnPublication = crypto.randomUUID();
  const registryWithdrawalPublication = crypto.randomUUID();
  const correctedToolPublication = crypto.randomUUID();
  const registryId = crypto.randomUUID();
  const digests = new Map<string, string>();

  const client = async () => {
    const value = new Client({ connectionString: dsn });
    await value.connect();
    await value.query("set statement_timeout='20000'");
    return value;
  };
  const asOwner = async (value: PgClient) => {
    await value.query('reset role');
    await value.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [owner, JSON.stringify({ sub: owner, role: 'authenticated',
        email: 'assessed-heat-proof@example.test', is_anonymous: false })]);
    await value.query('set role authenticated');
  };
  const publish = async (id: string, registry: { id: string; digest: string }) => {
    const rule = {
      schemaVersion: 1, publicationId: id, ruleVersion: '1.0.0', lifecycle: 'reviewed',
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
      requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
      limits: { temperatures: [{ unit: 'C', maximum: 150 }, { unit: 'F', maximum: 302 }],
        namedSettings: [], maximumPasses: 2, maximumDurationMinutes: 20 },
      necessityRules: [], hardRestrictions: [], alternatives: [],
      reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit',
    };
    const published = await seedSyntheticHeatRule((sql, values) => admin.query(sql, values), id, rule, registry);
    digests.set(id, published.contentDigest);
    return rule;
  };
  const seedRun = async (publicationId: string, rule: Record<string, unknown>) => {
    const request = crypto.randomUUID();
    const assessment = crypto.randomUUID();
    const fingerprint = `sha256:${'e'.repeat(64)}`;
    const base = conformance.baselineInput;
    const input = { ...base,
      preparedInput: { ...base.preparedInput,
        products: [{ ...base.preparedInput.products[0]!, ownerItemId: product,
          versionId: productVersion }],
        tools: [{ ...base.preparedInput.tools[0]!, ownerItemId: tool,
          versionId: toolVersion }],
      }, request: { ...base.request, productOwnerItemId: product, toolOwnerItemId: tool },
    };
    await admin.query('reset role');
    const evaluation = (await admin.query<{ result: { state: string; selected: Record<string, unknown> } }>(
      'select strandcue_private.heat_evaluate($1::jsonb,$2::jsonb) result',
      [JSON.stringify(input), JSON.stringify(rule)])).rows[0].result;
    expect(evaluation.state).toBe('appropriate');
    const digest = digests.get(publicationId)!;
    await admin.query(`insert into public.heat_coach_assessments
      (id,owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
      values($1,$2,$3,$4,$5::jsonb,$6::jsonb,'appropriate',
        strandcue_private.heat_source_revisions($2::uuid),$7)`,
    [assessment, owner, publicationId, digest, JSON.stringify(input), JSON.stringify(evaluation), fingerprint]);
    const revision = (await admin.query<{ revision: string }>(
      'select revision::text from strandcue_private.guidance_source_revisions where user_id=$1',
      [owner])).rows[0].revision;
    const decision = { status: 'ready', requestId: request, steps: [
      { stepId: 'protectant', position: 1, action: 'apply', productId: product,
        productVersionId: productVersion, toolId: null, toolVersionId: null },
      { stepId: 'heat', position: 2, action: 'heat', productId: null, productVersionId: null,
        toolId: tool, toolVersionId: toolVersion,
        heatActionRef: { publicationId, publicationDigest: digest },
        heatPrescription: evaluation.selected },
    ], heatAssessmentBinding: { assessmentId: assessment, sourceFingerprint: fingerprint,
      publicationId, publicationDigest: digest } };
    await asOwner(admin);
    await admin.query('reset role');
    await admin.query('set role service_role');
    await admin.query(`select public.record_server_recommendation_run(
      $1::uuid,$2::uuid,$3,now(),'1','synthetic','2','ready',$4::jsonb,$5::jsonb,$6::bigint)`,
    [owner, request, 'a'.repeat(64), JSON.stringify({ requestId: request, goal: 'basic_wash' }),
      JSON.stringify(decision), revision]);
    await admin.query('reset role');
    return { request, selected: evaluation.selected, digest };
  };
  const start = (value: PgClient, request: string) => value.query<{ result: {
    execution: { steps: { planned: Record<string, unknown> }[] } } }>(
    'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now()) result',
    [crypto.randomUUID(), crypto.randomUUID(), request]);

  beforeAll(async () => {
    ({ Client } = createRequire(import.meta.url)('pg'));
    admin = await client();
    const role = (await admin.query<{ superuser: boolean }>(
      'select rolsuper superuser from pg_roles where rolname=current_user')).rows[0];
    if (!role?.superuser) throw new Error('Local synthetic fixture requires a superuser DSN');
    await admin.query('insert into auth.users(id,email_confirmed_at) values($1,now())', [owner]);
    await asOwner(admin);
    await admin.query('select public.complete_account($1,true)', [`assessedpg_${owner.slice(0, 8)}`]);
    await admin.query('reset role');
    await admin.query('insert into public.brands(id,name) values($1,$2)',
      [productBrand, `Synthetic assessed brand ${productBrand.slice(0, 8)}`]);
    await admin.query('insert into public.products(id,brand_id,name,category) values($1,$2,$3,$4)',
      [productCatalogue, productBrand, 'Synthetic assessed protection', 'heat protectant']);
    await admin.query('insert into public.product_versions(id,product_id) values($1,$2)',
      [productVersion, productCatalogue]);
    await admin.query('insert into public.tool_brands(id,name) values($1,$2)',
      [toolBrand, `Synthetic assessed tool brand ${toolBrand.slice(0, 8)}`]);
    await admin.query('insert into public.tools(id,brand_id,name,tool_type) values($1,$2,$3,$4)',
      [toolCatalogue, toolBrand, 'Synthetic assessed dryer', 'dryer']);
    await admin.query('insert into public.tool_versions(id,tool_id,version_label) values($1,$2,$3)',
      [toolVersion, toolCatalogue, 'Synthetic exact version']);
    const registry = await seedSyntheticHeatCapabilityRegistry(
      (sql, values) => admin.query(sql, values), { id: registryId,
        productVersionId: productVersion, toolVersionId: toolVersion });
    await admin.query('reset session authorization');
    await admin.query(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [product, owner, productVersion]);
    await admin.query(`insert into public.user_tools(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [tool, owner, toolVersion]);
    const ruleA = await publish(firstPublication, registry);
    const ruleB = await publish(withdrawnPublication, registry);
    const ruleC = await publish(registryWithdrawalPublication, registry);
    const ruleD = await publish(correctedToolPublication, registry);
    await seedRun(firstPublication, ruleA);
    await seedRun(withdrawnPublication, ruleB);
    await seedRun(registryWithdrawalPublication, ruleC);
    await seedRun(correctedToolPublication, ruleD);
  }, 60_000);
  afterAll(async () => {
    if (!admin) return;
    try {
      await admin.query('reset role');
      await admin.query('delete from auth.users where id=$1', [owner]);
      await admin.query('alter table strandcue_private.heat_rule_publications disable trigger user');
      try { await admin.query('delete from strandcue_private.heat_rule_publications where id=any($1::uuid[])',
        [[firstPublication, withdrawnPublication, registryWithdrawalPublication,
          correctedToolPublication]]); }
      finally { await admin.query('alter table strandcue_private.heat_rule_publications enable trigger user'); }
      await admin.query('alter table strandcue_private.heat_capability_publications disable trigger user');
      try { await admin.query('delete from strandcue_private.heat_capability_publications where id=$1', [registryId]); }
      finally { await admin.query('alter table strandcue_private.heat_capability_publications enable trigger user'); }
      await admin.query('delete from public.product_versions where id=$1', [productVersion]);
      await admin.query('delete from public.tool_versions where id=$1', [toolVersion]);
      await admin.query('delete from public.products where id=$1', [productCatalogue]);
      await admin.query('delete from public.tools where id=$1', [toolCatalogue]);
      await admin.query('delete from public.brands where id=$1', [productBrand]);
      await admin.query('delete from public.tool_brands where id=$1', [toolBrand]);
    } finally { await admin.end(); }
  });

  it('starts an exact assessed heat run and preserves its prescription without an actual heat event', async () => {
    const row = (await admin.query<{ request_id: string; decision: { steps: { heatPrescription?: unknown }[] } }>(
      `select request_id,decision from public.recommendation_runs where user_id=$1
        and decision#>>'{heatAssessmentBinding,publicationId}'=$2`,
      [owner, firstPublication])).rows[0];
    const actor = await client();
    try {
      await asOwner(actor);
      const result = (await start(actor, row.request_id)).rows[0].result;
      expect(result.execution.steps[1]?.planned).toMatchObject({
        action: 'heat', heatPrescription: row.decision.steps[1]?.heatPrescription,
        heatActionRef: { publicationId: firstPublication, publicationDigest: digests.get(firstPublication) },
      });
      const count = (await admin.query<{ n: number }>(`select
        (select count(*)::int from public.heat_events where user_id=$1) +
        (select count(*)::int from public.activity_heat_events where owner=$1) n`, [owner])).rows[0].n;
      expect(count).toBe(0);
    } finally { await actor.end(); }
  });

  it('blocks the assessed heat start behind publication withdrawal and writes no execution', async () => {
    const request = (await admin.query<{ request_id: string }>(
      `select request_id from public.recommendation_runs where user_id=$1
        and decision#>>'{heatAssessmentBinding,publicationId}'=$2`,
      [owner, withdrawnPublication])).rows[0].request_id;
    const actor = await client();
    const withdrawing = await client();
    try {
      await asOwner(actor);
      await withdrawing.query('begin');
      await withdrawing.query(`update strandcue_private.heat_rule_publications
        set state='withdrawn' where id=$1`, [withdrawnPublication]);
      const actorPid = (await actor.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const blockerPid = (await withdrawing.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const pending = start(actor, request).then(value => ({ ok: true as const, value }),
        (error: Error) => ({ ok: false as const, error }));
      let blocked = false;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const row = (await admin.query<{ blockers: number[] }>(
          'select pg_blocking_pids($1) blockers', [actorPid])).rows[0];
        if (row.blockers.includes(blockerPid)) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await withdrawing.query('commit');
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/stale-heat-binding/);
      const count = (await admin.query<{ n: number }>(
        'select count(*)::int n from public.protocol_executions where user_id=$1 and recommendation_run_id=$2',
        [owner, request])).rows[0].n;
      expect(count).toBe(0);
    } finally {
      await withdrawing.query('rollback').catch(() => undefined);
      await actor.end();
      await withdrawing.end();
    }
  }, 60_000);

  it('blocks the assessed heat start behind capability withdrawal and writes no execution', async () => {
    const request = (await admin.query<{ request_id: string }>(
      `select request_id from public.recommendation_runs where user_id=$1
        and decision#>>'{heatAssessmentBinding,publicationId}'=$2`,
      [owner, registryWithdrawalPublication])).rows[0].request_id;
    const actor = await client();
    const withdrawing = await client();
    try {
      await asOwner(actor);
      await withdrawing.query('begin');
      await withdrawing.query(`update strandcue_private.heat_capability_publications
        set state='withdrawn' where id=$1`, [registryId]);
      const actorPid = (await actor.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const blockerPid = (await withdrawing.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const pending = start(actor, request).then(value => ({ ok: true as const, value }),
        (error: Error) => ({ ok: false as const, error }));
      let blocked = false;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const row = (await admin.query<{ blockers: number[] }>(
          'select pg_blocking_pids($1) blockers', [actorPid])).rows[0];
        if (row.blockers.includes(blockerPid)) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await withdrawing.query('commit');
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/stale-heat-binding/);
      const count = (await admin.query<{ n: number }>(
        'select count(*)::int n from public.protocol_executions where user_id=$1 and recommendation_run_id=$2',
        [owner, request])).rows[0].n;
      expect(count).toBe(0);
    } finally {
      await withdrawing.query('rollback').catch(() => undefined);
      await actor.end();
      await withdrawing.end();
    }
  }, 60_000);

  it('serializes an owner tool correction before assessed heat start', async () => {
    const request = (await admin.query<{ request_id: string }>(
      `select request_id from public.recommendation_runs where user_id=$1
        and decision#>>'{heatAssessmentBinding,publicationId}'=$2`,
      [owner, correctedToolPublication])).rows[0].request_id;
    const actor = await client();
    const correcting = await client();
    try {
      await asOwner(actor);
      await correcting.query('begin');
      await correcting.query(`update public.user_tools set availability='archived'
        where id=$1 and owner=$2`, [tool, owner]);
      const actorPid = (await actor.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const blockerPid = (await correcting.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0].pid;
      const pending = start(actor, request).then(value => ({ ok: true as const, value }),
        (error: Error) => ({ ok: false as const, error }));
      let blocked = false;
      for (let attempt = 0; attempt < 150; attempt += 1) {
        const row = (await admin.query<{ blockers: number[] }>(
          'select pg_blocking_pids($1) blockers', [actorPid])).rows[0];
        if (row.blockers.includes(blockerPid)) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked).toBe(true);
      await correcting.query('commit');
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toMatch(/source-changed/);
      const count = (await admin.query<{ n: number }>(
        'select count(*)::int n from public.protocol_executions where user_id=$1 and recommendation_run_id=$2',
        [owner, request])).rows[0].n;
      expect(count).toBe(0);
    } finally {
      await correcting.query('rollback').catch(() => undefined);
      await actor.end();
      await correcting.end();
    }
  }, 60_000);
});

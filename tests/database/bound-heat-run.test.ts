import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, mutate, USER_A, USER_B } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

const RULE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSESSMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FINGERPRINT = `sha256:${'b'.repeat(64)}`;
let db: PGlite;

async function privileged(sql: string, params: unknown[] = []) {
  await db.exec('set session authorization postgres');
  return db.query<Record<string, unknown>>(sql, params);
}

async function write(binding: Record<string, unknown>, owner = USER_A, request = REQUEST, action = 'wait') {
  await db.exec('set session authorization postgres');
  const revision = (await db.query<{ revision: number }>(
    'select revision from strandcue_private.guidance_source_revisions where user_id=$1', [owner],
  )).rows[0]?.revision ?? 0;
  await db.exec('set session authorization service_role');
  return db.query(`select public.record_server_recommendation_run(
    $1::uuid,$2::uuid,$3,now(),'1','synthetic','1','ready',$4::jsonb,$5::jsonb,$6::bigint)`,
  [owner, request, 'a'.repeat(64), JSON.stringify({ requestId: request, goal: 'basic_wash' }),
    JSON.stringify({ status: 'ready', requestId: request, steps: [{ stepId: 'one', position: 1, action }], heatAssessmentBinding: binding }),
    revision]);
}

describe('trusted Heat Coach run binding', () => {
  let digest: string;
  let registryId: string;
  beforeAll(async () => {
    db = await database();
    await asUser(db, USER_A);
    await complete(db);
    const registry = await seedSyntheticHeatCapabilityRegistry(privileged);
    registryId = registry.id;
    const rule = {
      schemaVersion: 1, publicationId: RULE, ruleVersion: '1.0.0', lifecycle: 'reviewed',
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
      requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
      limits: { temperatures: [], namedSettings: [], maximumPasses: 2, maximumDurationMinutes: 20 },
      necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit',
    };
    digest = (await seedSyntheticHeatRule(privileged, RULE, rule, registry)).contentDigest;
    await privileged(`insert into public.heat_coach_assessments
      (id,owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
      values($1,$2,$3,$4,'{"preparedInput":{"products":[],"tools":[]}}'::jsonb,'{}'::jsonb,'no_heat',
        strandcue_private.heat_source_revisions($2::uuid),$5)`,
    [ASSESSMENT, USER_A, RULE, digest, FINGERPRINT]);
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('accepts only the exact owned current assessment and published digest', async () => {
    const binding = { assessmentId: ASSESSMENT, sourceFingerprint: FINGERPRINT, publicationId: RULE, publicationDigest: digest };
    await expect(write({ ...binding, sourceFingerprint: `sha256:${'c'.repeat(64)}` })).rejects.toThrow(/invalid-heat-binding/);
    await expect(write(binding, USER_A, REQUEST, 'direct-heat')).rejects.toThrow(/invalid-heat-binding/);
    await expect(write(binding, USER_B)).rejects.toThrow(/account-not-active|invalid-heat-binding/);
    await expect(write(binding)).resolves.toBeDefined();
    await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await privileged('update strandcue_private.heat_rule_publications set state=$1 where id=$2', ['withdrawn', RULE]);
    await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    await asUser(db, USER_A);
    await expect(db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now())',
      [crypto.randomUUID(), crypto.randomUUID(), REQUEST])).rejects.toThrow(/stale-heat-binding/);
    await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await privileged('update strandcue_private.heat_rule_publications set state=$1 where id=$2', ['published', RULE]);
    await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    await asUser(db, USER_A);
    const operation = crypto.randomUUID();
    const execution = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const first = (await db.query<{ receipt: unknown }>(
      'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz) receipt',
      [operation, execution, REQUEST, startedAt],
    )).rows[0].receipt;
    await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await privileged('update strandcue_private.heat_rule_publications set state=$1 where id=$2', ['withdrawn', RULE]);
    await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    await asUser(db, USER_A);
    const replay = (await db.query<{ receipt: unknown }>(
      'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz) receipt',
      [operation, execution, REQUEST, startedAt],
    )).rows[0].receipt;
    expect(replay).toEqual(first);
    await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await privileged('update strandcue_private.heat_rule_publications set state=$1 where id=$2', ['published', RULE]);
    await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    await asUser(db, USER_A);
    await mutate(db);
    await expect(write(binding, USER_A, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')).rejects.toThrow(/stale-heat-binding/);
  });

  it('refuses a new bound start after the reviewed capability registry is withdrawn', async () => {
    const assessment = crypto.randomUUID();
    const request = crypto.randomUUID();
    const binding = { assessmentId: assessment, sourceFingerprint: FINGERPRINT,
      publicationId: RULE, publicationDigest: digest };
    await privileged(`insert into public.heat_coach_assessments
      (id,owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
      values($1,$2,$3,$4,'{"preparedInput":{"products":[],"tools":[]}}'::jsonb,'{}'::jsonb,'no_heat',
        strandcue_private.heat_source_revisions($2::uuid),$5)`,
    [assessment, USER_A, RULE, digest, FINGERPRINT]);
    await write(binding, USER_A, request);
    await privileged(`update strandcue_private.heat_capability_publications
      set state='withdrawn' where id=$1`, [registryId]);
    const ruleState = await privileged('select state from strandcue_private.heat_rule_publications where id=$1', [RULE]);
    expect(ruleState.rows[0].state).toBe('published');
    await asUser(db, USER_A);
    const saved = (await db.query<{ result: { stale: boolean } }>(
      'select public.get_heat_coach_assessment($1::uuid) result', [assessment],
    )).rows[0].result;
    expect(saved.stale).toBe(true);
    await expect(db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now())',
      [crypto.randomUUID(), crypto.randomUUID(), request])).rejects.toThrow(/stale-heat-binding/);
    const executions = await privileged('select count(*)::integer n from public.protocol_executions where recommendation_run_id=$1', [request]);
    expect(executions.rows[0].n).toBe(0);
  });
});

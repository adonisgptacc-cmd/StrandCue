import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

import { conformance } from '../fixtures/heat-coach-conformance.ts';
import { asUser, complete, database, USER_A } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry, SYNTHETIC_PRODUCT_VERSION_ID,
  SYNTHETIC_TOOL_VERSION_ID } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

const RULE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ASSESSMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOOL = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const FINGERPRINT = `sha256:${'b'.repeat(64)}`;
let db: PGlite;
let digest: string;
let assessedInput: Record<string, unknown>;
let selected: Record<string, unknown>;

async function privileged<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec('set session authorization postgres');
  return db.query<T>(sql, params);
}

function steps(overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
  return [
    { stepId: 'protectant', position: 1, action: 'apply',
      productId: PRODUCT, productVersionId: SYNTHETIC_PRODUCT_VERSION_ID,
      toolId: null, toolVersionId: null },
    { stepId: 'heat', position: 2, action: 'heat', productId: null, productVersionId: null,
      toolId: TOOL, toolVersionId: SYNTHETIC_TOOL_VERSION_ID,
      heatActionRef: { publicationId: RULE, publicationDigest: digest },
      heatPrescription: selected, ...overrides },
  ];
}

async function write(nextSteps = steps(), request = crypto.randomUUID()) {
  const revision = (await privileged('select revision from strandcue_private.guidance_source_revisions where user_id=$1',
    [USER_A])).rows[0]?.revision ?? 0;
  await db.exec('set session authorization service_role');
  const binding = { assessmentId: ASSESSMENT, sourceFingerprint: FINGERPRINT,
    publicationId: RULE, publicationDigest: digest };
  return db.query(`select public.record_server_recommendation_run(
    $1::uuid,$2::uuid,$3,now(),'1','synthetic','2','ready',$4::jsonb,$5::jsonb,$6::bigint)`,
  [USER_A, request, 'a'.repeat(64), JSON.stringify({ requestId: request, goal: 'basic_wash' }),
    JSON.stringify({ status: 'ready', requestId: request, steps: nextSteps,
      heatAssessmentBinding: binding }), revision]);
}

describe('assessed heat protocol binding', () => {
  beforeAll(async () => {
    db = await database();
    await asUser(db, USER_A);
    await complete(db);
    const registry = await seedSyntheticHeatCapabilityRegistry(privileged);
    const rule = {
      schemaVersion: 1, publicationId: RULE, ruleVersion: '1.0.0', lifecycle: 'reviewed',
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
      requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
      limits: { temperatures: [{ unit: 'C', maximum: 150 }, { unit: 'F', maximum: 302 }],
        namedSettings: [],
        maximumPasses: 2, maximumDurationMinutes: 20 },
      necessityRules: [], hardRestrictions: [], alternatives: [],
      reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit',
    };
    digest = (await seedSyntheticHeatRule(privileged, RULE, rule, registry)).contentDigest;
    await privileged(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [PRODUCT, USER_A, SYNTHETIC_PRODUCT_VERSION_ID]);
    await privileged(`insert into public.user_tools(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [TOOL, USER_A, SYNTHETIC_TOOL_VERSION_ID]);
    const base = conformance.baselineInput;
    assessedInput = { ...base,
      preparedInput: { ...base.preparedInput,
        products: [{ ...base.preparedInput.products[0]!, ownerItemId: PRODUCT,
          versionId: SYNTHETIC_PRODUCT_VERSION_ID }],
        tools: [{ ...base.preparedInput.tools[0]!, ownerItemId: TOOL,
          versionId: SYNTHETIC_TOOL_VERSION_ID }],
      },
      request: { ...base.request, toolOwnerItemId: TOOL, productOwnerItemId: PRODUCT },
    };
    const evaluation = await privileged<{ result: { state: string; selected: Record<string, unknown> } }>(
      'select strandcue_private.heat_evaluate($1::jsonb,$2::jsonb) result',
      [JSON.stringify(assessedInput), JSON.stringify(rule)],
    );
    expect(evaluation.rows[0]?.result.state).toBe('appropriate');
    selected = evaluation.rows[0]!.result.selected;
    await privileged(`insert into public.heat_coach_assessments
      (id,owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
      values($1,$2,$3,$4,$5::jsonb,$6::jsonb,'appropriate',
        strandcue_private.heat_source_revisions($2::uuid),$7)`,
    [ASSESSMENT, USER_A, RULE, digest, JSON.stringify(assessedInput),
      JSON.stringify(evaluation.rows[0]!.result), FINGERPRINT]);
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('persists and starts only the exact synthetic assessed heat prescription', async () => {
    const request = crypto.randomUUID();
    await expect(write(steps(), request)).resolves.toBeDefined();
    await asUser(db, USER_A);
    const result = await db.query<{ value: { execution: { steps: { planned: Record<string, unknown> }[] } } }>(
      'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now()) value',
      [crypto.randomUUID(), crypto.randomUUID(), request]);
    expect(result.rows[0]?.value.execution.steps[1]?.planned).toMatchObject({
      action: 'heat', heatActionRef: { publicationId: RULE, publicationDigest: digest },
      heatPrescription: selected, toolId: TOOL, toolVersionId: SYNTHETIC_TOOL_VERSION_ID,
    });
    const events = await privileged<{ n: number }>(`select
      (select count(*) from public.heat_events) +
      (select count(*) from public.activity_heat_events) n`);
    expect(Number(events.rows[0]?.n)).toBe(0);
  });

  it.each([
    ['wrong method', { heatPrescription: { ...selected, method: 'steam' } }],
    ['wrong temperature', { heatPrescription: { ...selected, temperature: { unit: 'C', value: 140 } } }],
    ['wrong unit', { heatPrescription: { ...selected, temperature: { unit: 'F', value: 120 } } }],
    ['wrong setting', { heatPrescription: { ...selected, setting: 'High' } }],
    ['wrong passes', { heatPrescription: { ...selected, passes: 2 } }],
    ['wrong duration', { heatPrescription: { ...selected, durationMinutes: 20 } }],
    ['wrong zones', { heatPrescription: { ...selected, zones: [] } }],
    ['wrong tool', { toolId: crypto.randomUUID() }],
    ['wrong tool version', { toolVersionId: crypto.randomUUID() }],
    ['wrong publication', { heatActionRef: { publicationId: RULE,
      publicationDigest: `sha256:${'c'.repeat(64)}` } }],
  ])('rejects %s at trusted insertion', async (_label, override) => {
    await expect(write(steps(override))).rejects.toThrow(/invalid-heat-binding/);
  });

  it('requires the exact protectant before the heat step', async () => {
    await expect(write(steps().slice(1))).rejects.toThrow(/invalid-heat-binding/);
    await expect(write([{ ...steps()[0], position: 3 }, steps()[1]])).rejects.toThrow(/invalid-heat-binding/);
    await expect(write([{ ...steps()[0], productId: crypto.randomUUID() }, steps()[1]]))
      .rejects.toThrow(/invalid-heat-binding/);
  });

  it('exposes only the exact reviewed rule through the service-only RPC', async () => {
    await db.exec('set session authorization service_role');
    const row = await db.query<{ value: { publication: { publicationId: string }; publicationDigest: string } }>(
      'select public.get_published_heat_rule_for_today($1::uuid,$2) value', [RULE, digest]);
    expect(row.rows[0]?.value).toMatchObject({ publication: { publicationId: RULE },
      publicationDigest: digest });
    const missing = await db.query<{ value: unknown }>(
      'select public.get_published_heat_rule_for_today($1::uuid,$2) value',
      [RULE, `sha256:${'c'.repeat(64)}`]);
    expect(missing.rows[0]?.value).toBeNull();
    await asUser(db, USER_A);
    await expect(db.query('select public.get_published_heat_rule_for_today($1::uuid,$2)',
      [RULE, digest])).rejects.toThrow(/permission denied/);
  });

  it('rejects a direct execution snapshot with a changed heat prescription', async () => {
    const request = crypto.randomUUID();
    await write(steps(), request);
    await expect(privileged(`with run as (
      select decision from public.recommendation_runs where user_id=$1::uuid and request_id=$2::uuid
    ), snapshot as (
      select decision, strandcue_private.build_initial_execution(
        $3::uuid,$2::uuid,decision,now()) execution from run
    ) insert into public.protocol_executions
      (user_id,execution_id,recommendation_run_id,decision,execution,revision,status)
      select $1::uuid,$3::uuid,$2::uuid,decision,
        jsonb_set(execution,'{steps,1,planned,heatPrescription,passes}','9'::jsonb),
        0,'in_progress' from snapshot`, [USER_A, request, crypto.randomUUID()]))
      .rejects.toThrow(/invalid-heat-binding/);
  });

  it('rejects a direct execution insert with forged completed state', async () => {
    const request = crypto.randomUUID();
    await write(steps(), request);
    await expect(privileged(`with run as (
      select decision from public.recommendation_runs where user_id=$1::uuid and request_id=$2::uuid
    ), snapshot as (
      select decision, strandcue_private.build_initial_execution(
        $3::uuid,$2::uuid,decision,now()) execution from run
    ) insert into public.protocol_executions
      (user_id,execution_id,recommendation_run_id,decision,execution,revision,status)
      select $1::uuid,$3::uuid,$2::uuid,decision,
        jsonb_set(execution,'{status}','"completed"'::jsonb),
        0,'completed' from snapshot`, [USER_A, request, crypto.randomUUID()]))
      .rejects.toThrow(/invalid-heat-binding/);
  });

  it('keeps a started heat prescription immutable during execution updates', async () => {
    const request = crypto.randomUUID();
    const execution = crypto.randomUUID();
    await write(steps(), request);
    await asUser(db, USER_A);
    await db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now())',
      [crypto.randomUUID(), execution, request]);
    await expect(privileged(`update public.protocol_executions set execution=jsonb_set(
      execution,'{steps,1,planned,heatPrescription,passes}','9'::jsonb)
      where user_id=$1::uuid and execution_id=$2::uuid`, [USER_A, execution]))
      .rejects.toThrow(/invalid-heat-binding/);
  });

  it('rejects a status-only update that forges completion', async () => {
    const request = crypto.randomUUID();
    const execution = crypto.randomUUID();
    await write(steps(), request);
    await asUser(db, USER_A);
    await db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now())',
      [crypto.randomUUID(), execution, request]);
    await expect(privileged(`update public.protocol_executions set status='completed'
      where user_id=$1::uuid and execution_id=$2::uuid`, [USER_A, execution]))
      .rejects.toThrow(/invalid-heat-binding/);
  });


  it('rejects start after the published rule is withdrawn', async () => {
    const request = crypto.randomUUID();
    await write(steps(), request);
    await privileged(`update strandcue_private.heat_rule_publications set state='withdrawn'
      where id=$1::uuid`, [RULE]);
    await asUser(db, USER_A);
    await expect(db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,now())',
      [crypto.randomUUID(), crypto.randomUUID(), request])).rejects.toThrow(/stale-heat-binding/);
  });
});

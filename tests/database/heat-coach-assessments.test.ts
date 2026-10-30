import type { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HeatCoachDecisionSchema, HeatCoachInputSchema } from '../../packages/domain/src/index.ts';
import { asUser, complete, database, mutate, USER_A, USER_B, UNVERIFIED } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry, SYNTHETIC_PRODUCT_VERSION_ID, SYNTHETIC_TOOL_VERSION_ID } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

const RULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPERATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let DIGEST = `sha256:${'a'.repeat(64)}`;

let db: PGlite;

const privileged = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  await db.exec('set session authorization postgres');
  return db.query<T>(sql, params);
};

const create = async (options: { operationId?: string; publicationId?: string; digest?: string; intent?: unknown } = {}) =>
  (await db.query<{ result: any }>(
    'select public.create_heat_coach_assessment($1,$2,$3,$4::jsonb) result',
    [options.operationId ?? OPERATION_ID, options.publicationId ?? RULE_ID,
      options.digest ?? DIGEST, JSON.stringify(options.intent ?? {
        method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
        passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
      })],
  )).rows[0]!.result;

const seedRule = async (state: 'draft' | 'published' | 'withdrawn' = 'published') => {
  const registry = await seedSyntheticHeatCapabilityRegistry(privileged);
  const rule = {
    schemaVersion: 1, publicationId: RULE_ID, ruleVersion: '1.0.0',
    lifecycle: state === 'published' ? 'reviewed' : state, validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
    requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
    limits: { temperatures: [{ unit: 'C', maximum: 180 }, { unit: 'F', maximum: 356 }], namedSettings: [], maximumPasses: 2, maximumDurationMinutes: 20 },
    necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit',
  };
  const inserted = await seedSyntheticHeatRule(privileged, RULE_ID, rule, registry, state);
  DIGEST = inserted.contentDigest;
};

beforeAll(async () => { db = await database(); });
beforeEach(async () => { await asUser(db, USER_A); await complete(db, 'user_a'); await seedRule(); await asUser(db, USER_A); });
afterEach(async () => {
  await privileged('delete from public.profiles');
  await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
  await privileged('delete from strandcue_private.heat_rule_publications');
  await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
});
afterAll(async () => { await db?.close(); });

describe('Heat Coach assessment trust boundary', () => {
  it('stores the exact Today check-in time and condition for a later bound run', async () => {
    const result = await create({ intent: {
      method: { state: 'unknown' }, temperature: { state: 'unknown' },
      setting: { state: 'unknown' }, passes: { state: 'unknown' },
      durationMinutes: { state: 'unknown' }, zones: [], availableMinutes: 20,
      currentCondition: { observedAt: '2026-10-29T09:00:00.000Z',
        concerns: ['heat-concern'], explicitNone: false, zones: [], zoneConcerns: [] },
    } });
    expect(result.input.preparedInput.availableMinutes).toBe(20);
    expect(result.input.preparedInput.currentCondition).toMatchObject({ concerns: ['heat-concern'] });
  });

  it('keeps actual heat, treatment, wash, inventory and publication state unchanged while assessing and viewing', async () => {
    await privileged(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [crypto.randomUUID(), USER_A, SYNTHETIC_PRODUCT_VERSION_ID]);
    await privileged(`insert into public.user_tools(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [crypto.randomUUID(), USER_A, SYNTHETIC_TOOL_VERSION_ID]);
    const snapshot = async () => (await privileged<{ state: unknown }>(`select jsonb_build_object(
      'serviceHeat', (select count(*) from public.heat_events),
      'activityHeat', (select count(*) from public.activity_heat_events),
      'activities', (select count(*) from public.activities),
      'activityRevisions', (select count(*) from public.activity_revisions),
      'executions', (select count(*) from public.protocol_executions),
      'treatments', (select count(*) from public.treatment_programmes),
      'treatmentEvents', (select count(*) from public.treatment_programme_events),
      'products', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from public.user_products p),
      'tools', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from public.user_tools t),
      'rules', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from strandcue_private.heat_rule_publications r),
      'capabilities', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb) from strandcue_private.heat_capability_publications c)
    ) state`)).rows[0]!.state;
    const before = await snapshot();
    await asUser(db, USER_A);
    const assessment = await create();
    await db.query('select public.get_heat_coach_assessment($1)', [assessment.assessmentId]);
    await db.query('select public.list_heat_coach_assessments(10,null)');
    expect(await snapshot()).toEqual(before);
  });

  it('uses the published exact capability registry when capturing a server assessment', async () => {
    const productId = crypto.randomUUID();
    const toolId = crypto.randomUUID();
    await privileged(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [productId, USER_A, SYNTHETIC_PRODUCT_VERSION_ID]);
    await privileged(`insert into public.user_tools(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [toolId, USER_A, SYNTHETIC_TOOL_VERSION_ID]);
    await asUser(db, USER_A);
    const result = await create();
    expect(result.input.preparedInput.products).toContainEqual(expect.objectContaining({
      ownerItemId: productId, review: 'reviewed', verifiedCapabilities: ['heat-protection'], satisfiesExactCapability: true,
    }));
    expect(result.input.preparedInput.tools).toContainEqual(expect.objectContaining({
      ownerItemId: toolId, review: 'reviewed', verifiedCapabilities: ['heat-tool'], satisfiesExactCapability: true,
    }));
  });

  it('replays the forward evaluator and capture corrections without privilege drift', async () => {
    await privileged('select 1');
    await db.exec(await readFile('supabase/migrations/20261027120000_align_heat_coach_evaluator.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/20261027121000_harden_heat_coach_capture.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/20261027122000_heat_capability_registry.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/20261027123000_validate_heat_publication.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/20261027124000_bind_heat_registry_assessment.sql', 'utf8'));
    const privileges = await privileged<{ member: boolean; core: boolean }>(`select
      exists(select 1 from pg_auth_members memberships
        join pg_roles granted on granted.oid=memberships.roleid
        join pg_roles recipient on recipient.oid=memberships.member
        where granted.rolname='strandcue_mutator' and recipient.rolname=current_user) member,
      has_function_privilege('authenticated','strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb)','EXECUTE') core`);
    expect(privileges.rows[0]).toEqual({ member: false, core: true });
  });

  it('creates an immutable server-owned assessment bound to the exact publication', async () => {
    const validity = await privileged<{ valid: boolean }>(
      'select strandcue_private.heat_intent_valid($1::jsonb) valid',
      [JSON.stringify({ method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' }, passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [] })],
    );
    expect(validity.rows[0]!.valid).toBe(true);
    const result = await create();
    expect(result).toMatchObject({
      assessmentId: expect.any(String), publicationId: RULE_ID, publicationDigest: DIGEST,
      status: 'needs_input', stale: false, revision: 1,
    });
    expect(result.input).toMatchObject({ schemaVersion: 1, request: { method: { state: 'unknown' } } });
    expect(result.result).toMatchObject({ schemaVersion: 1, state: 'needs_input' });
    expect(HeatCoachInputSchema.parse(result.input)).toEqual(result.input);
    expect(HeatCoachDecisionSchema.parse(result.result)).toEqual(result.result);
    expect(result.sourceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    const restored = (await db.query<{ result: any }>(
      'select public.get_heat_coach_assessment($1) result',
      [result.assessmentId],
    )).rows[0]!.result;
    expect(result.stale).toBe(restored.stale);
    expect(result.sourceRevisions).toEqual(restored.sourceRevisions);

    await expect(db.exec(`update public.heat_coach_assessments set result='{}'::jsonb`)).rejects.toThrow(/permission denied|immutable/i);
    await expect(db.exec(`delete from public.heat_coach_assessments`)).rejects.toThrow(/permission denied|immutable/i);
  });

  it('is idempotent for identical operations and conflicts on a changed payload', async () => {
    const first = await create();
    expect(await create()).toEqual(first);
    await expect(create({ intent: {
      method: { state: 'known', value: 'heated-air' }, temperature: { state: 'unknown' },
      setting: { state: 'unknown' }, passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
    } })).rejects.toThrow(/operation-conflict/);
    const count = await privileged<{ count: number }>('select count(*)::integer count from public.heat_coach_assessments');
    expect(count.rows[0]!.count).toBe(1);
  });

  it('converges a second operation carrying the same intent and unchanged source snapshot', async () => {
    const first = await create();
    const second = await create({ operationId: crypto.randomUUID() });
    expect(second.assessmentId).toBe(first.assessmentId);
    const counts = await privileged<{ assessments: number; receipts: number }>(`select
      (select count(*) from public.heat_coach_assessments)::integer assessments,
      (select count(*) from strandcue_private.heat_coach_operations)::integer receipts`);
    expect(counts.rows[0]).toEqual({ assessments: 1, receipts: 2 });
  });

  it('refuses draft, withdrawn, missing and mismatched publication bindings without residue', async () => {
    await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await privileged('delete from strandcue_private.heat_rule_publications');
    await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    for (const state of ['draft', 'withdrawn'] as const) {
      await seedRule(state);
      await asUser(db, USER_A);
      await expect(create()).rejects.toThrow(/heat-content-pending/);
      await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
      await privileged('delete from strandcue_private.heat_rule_publications');
      await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    }
    await asUser(db, USER_A);
    await expect(create()).rejects.toThrow(/heat-content-pending/);
    await seedRule(); await asUser(db, USER_A);
    await expect(create({ digest: `sha256:${'b'.repeat(64)}` })).rejects.toThrow(/publication-mismatch/);
    const count = await privileged<{ count: number }>('select count(*)::integer count from public.heat_coach_assessments');
    expect(count.rows[0]!.count).toBe(0);
  });

  it('does not accept caller-owned decisions or identity fields', async () => {
    for (const forged of [
      { owner: USER_B }, { status: 'appropriate' }, { restriction: 'none' }, { result: { status: 'appropriate' } },
      { explanation: 'invented' }, { publicationDigest: `sha256:${'b'.repeat(64)}` },
    ]) {
      await expect(create({ operationId: crypto.randomUUID(), intent: forged })).rejects.toThrow(/invalid-heat-intent/);
    }
  });

  it('rejects request values outside the Heat Coach input contract before writing', async () => {
    const base = {
      method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
    };
    for (const intent of [
      { ...base, method: { state: 'recorded', value: 'heated-air' } },
      { ...base, method: { state: 'known', value: 'laser' } },
      { ...base, temperature: { state: 'known', value: { value: '170', unit: 'C' } } },
      { ...base, passes: { state: 'known', value: 101 } },
      { ...base, zones: [{ region: 'whole-head', segment: 'entire_strand' }] },
      { ...base, currentCondition: {} },
      { ...base, currentCondition: {
        observedAt: 'not-an-instant', concerns: ['dryness'], explicitNone: false,
        zones: [], zoneConcerns: [],
      } },
      { ...base, currentCondition: {
        observedAt: '2026-01-01T00:00:00.000Z', concerns: ['invented-concern'], explicitNone: false,
        zones: [], zoneConcerns: [],
      } },
      { ...base, currentCondition: {
        observedAt: '2026-01-01T00:00:00.000Z', concerns: ['dryness'], explicitNone: false,
        zones: [{ region: 'whole_head', segment: 'entire-strand' }], zoneConcerns: [],
      } },
      { ...base, currentCondition: {
        observedAt: '2026-01-01T00:00:00.000Z', concerns: ['dryness'], explicitNone: false,
        zones: [], zoneConcerns: [{ zone: { region: 'whole-head', segment: 'ends' }, concerns: ['none'] }],
      } },
    ]) {
      await expect(create({ operationId: crypto.randomUUID(), intent })).rejects.toThrow(/invalid-heat-intent/);
    }
    const count = await privileged<{ count: number }>('select count(*)::integer count from public.heat_coach_assessments');
    expect(count.rows[0]!.count).toBe(0);
  });

  it('accepts a complete current-condition value and stores schema-valid input', async () => {
    const result = await create({ operationId: crypto.randomUUID(), intent: {
      method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
      currentCondition: {
        observedAt: '2026-01-01T00:00:00.000Z', concerns: ['dryness'], explicitNone: false,
        zones: [{ region: 'whole-head', segment: 'entire-strand' }, { region: 'whole-head', segment: 'ends' }],
        zoneConcerns: [{ zone: { region: 'whole-head', segment: 'ends' }, concerns: ['dryness'] }],
      },
    } });
    expect(HeatCoachInputSchema.parse(result.input)).toEqual(result.input);
  });

  it('refuses a 1,001st assessment without leaving an operation receipt', async () => {
    const first = await create();
    await privileged(`insert into public.heat_coach_assessments
      (id,owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint,created_at,revision)
      select gen_random_uuid(),owner,publication_id,publication_digest,
        jsonb_set(input,'{request,zones}',jsonb_build_array(jsonb_build_object('region','front','segment','roots'))),
        result,status,source_revisions,source_fingerprint,created_at + (n || ' milliseconds')::interval,revision
      from public.heat_coach_assessments cross join generate_series(1,999) n where id=$1`, [first.assessmentId]);
    const refusedOperation = crypto.randomUUID();
    await expect(create({ operationId: refusedOperation, intent: {
      method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
    } })).rejects.toThrow(/assessment-quota-exceeded/);
    const counts = await privileged<{ assessments: number; refusedReceipts: number }>(`select
      (select count(*) from public.heat_coach_assessments where owner=$1)::integer assessments,
      (select count(*) from strandcue_private.heat_coach_operations where owner=$1 and operation_id=$2)::integer "refusedReceipts"`,
    [USER_A, refusedOperation]);
    expect(counts.rows[0]).toEqual({ assessments: 1000, refusedReceipts: 0 });
  });

  it('fails closed when caller-supplied item ids are not exact reviewed owner records', async () => {
    const result = await create({ operationId: crypto.randomUUID(), intent: {
      method: { state: 'known', value: 'heated-air' },
      toolOwnerItemId: crypto.randomUUID(),
      productOwnerItemId: crypto.randomUUID(),
      temperature: { state: 'known', value: { value: 170, unit: 'C' } },
      setting: { state: 'known', value: 'medium' },
      passes: { state: 'known', value: 1 },
      durationMinutes: { state: 'known', value: 10 },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
    } });
    expect(result.status).toBe('unavailable');
    expect(result.result).toMatchObject({
      state: 'unavailable',
      reasons: [{ reasonCode: 'tool_unavailable', copyKey: 'heat.unavailable.tool' }],
    });
  });

  it('returns a schema-valid no-heat decision without requiring a product or tool', async () => {
    const result = await create({ operationId: crypto.randomUUID(), intent: {
      method: { state: 'known', value: 'unheated' },
      temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
    } });
    expect(result.status).toBe('no_heat');
    expect(HeatCoachDecisionSchema.parse(result.result)).toEqual(result.result);
  });

  it('allows only the owner to read and makes foreign and random ids indistinguishable', async () => {
    const own = await create();
    expect((await db.query<{ result: any }>('select public.get_heat_coach_assessment($1) result', [own.assessmentId])).rows[0]!.result.assessmentId).toBe(own.assessmentId);
    await asUser(db, USER_B); await complete(db, 'user_b');
    for (const id of [own.assessmentId, crypto.randomUUID()]) {
      await expect(db.query('select public.get_heat_coach_assessment($1)', [id])).rejects.toThrow(/assessment-not-found/);
    }
    expect((await db.query<{ result: any }>('select public.list_heat_coach_assessments(10,null) result')).rows[0]!.result.items).toEqual([]);
  });

  it('returns a deterministic continuation cursor without duplicating assessments', async () => {
    const first = await create();
    const second = await create({ operationId: crypto.randomUUID(), intent: {
      method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
    } });
    const pageOne = (await db.query<{ result: any }>(
      'select public.list_heat_coach_assessments(1,null) result',
    )).rows[0]!.result;
    expect(pageOne.items).toHaveLength(1);
    expect(pageOne.nextCursor).toEqual({
      createdAt: pageOne.items[0].createdAt,
      assessmentId: pageOne.items[0].assessmentId,
    });
    const pageTwo = (await db.query<{ result: any }>(
      'select public.list_heat_coach_assessments(1,$1::jsonb) result', [JSON.stringify(pageOne.nextCursor)],
    )).rows[0]!.result;
    expect(pageTwo.items.map((item: any) => item.assessmentId)).toEqual([
      [first.assessmentId, second.assessmentId].find(id => id !== pageOne.items[0].assessmentId),
    ]);
    expect(pageTwo.nextCursor).toBeNull();
  });

  it('marks the historical decision stale after a bound source revision changes without recomputing it', async () => {
    await mutate(db);
    const operationId = crypto.randomUUID();
    const own = await create({ operationId });
    const before = own.result;
    await mutate(db, { revision: 1, kind: 'change', patch: { concerns: ['frizz'] } });
    const restored = (await db.query<{ result: any }>('select public.get_heat_coach_assessment($1) result', [own.assessmentId])).rows[0]!.result;
    expect(restored.stale).toBe(true);
    expect(restored.result).toEqual(before);
    const replay = await create({ operationId });
    expect(replay.assessmentId).toBe(own.assessmentId);
    expect(replay.stale).toBe(true);
    const current = await create({ operationId: crypto.randomUUID() });
    expect(current.assessmentId).not.toBe(own.assessmentId);
    expect(current.stale).toBe(false);
  });

  it('marks a historical decision stale after its publication is withdrawn without recomputing it', async () => {
    const operationId = crypto.randomUUID();
    const own = await create({ operationId });
    const before = own.result;
    await privileged(`update strandcue_private.heat_rule_publications set state='withdrawn' where id=$1`, [RULE_ID]);
    await asUser(db, USER_A);
    const restored = (await db.query<{ result: any }>('select public.get_heat_coach_assessment($1) result', [own.assessmentId])).rows[0]!.result;
    expect(restored.stale).toBe(true);
    expect(restored.result).toEqual(before);
    expect((await create({ operationId })).stale).toBe(true);
  });

  it('marks a reviewed exact product binding stale when its catalogue version retires', async () => {
    const productId = crypto.randomUUID();
    await privileged(`insert into public.user_products(id,owner,version_id,matched,match_confirmed,matched_at)
      values($1,$2,$3,true,true,now())`, [productId, USER_A, SYNTHETIC_PRODUCT_VERSION_ID]);
    await asUser(db, USER_A);
    const own = await create();
    expect(own.stale).toBe(false);
    await privileged('begin');
    try {
      await privileged("update public.product_versions set lifecycle='retired' where id=$1", [SYNTHETIC_PRODUCT_VERSION_ID]);
      await asUser(db, USER_A);
      const restored = (await db.query<{ result: any }>(
        'select public.get_heat_coach_assessment($1) result', [own.assessmentId])).rows[0]!.result;
      expect(restored.stale).toBe(true);
      expect(restored.result).toEqual(own.result);
    } finally {
      await db.exec('rollback');
    }
  });

  it('refuses anonymous, unverified and deleting accounts on every RPC', async () => {
    await asUser(db, null);
    await expect(create()).rejects.toThrow(/permission denied/i);
    await asUser(db, UNVERIFIED);
    for (const sql of [
      () => create(),
      () => db.query('select public.get_heat_coach_assessment($1)', [crypto.randomUUID()]),
      () => db.query('select public.list_heat_coach_assessments(10,null)'),
    ]) await expect(sql()).rejects.toThrow(/account-not-active/);
    await asUser(db, USER_A);
    await privileged(`update public.profiles set account_status='deleting' where user_id=$1`, [USER_A]);
    await asUser(db, USER_A);
    await expect(create()).rejects.toThrow(/account-not-active/);
  });

  it('exposes no direct write or private publication access to clients', async () => {
    const grants = await privileged<Record<string, boolean>>(`select
      has_table_privilege('authenticated','public.heat_coach_assessments','SELECT') assessment_read,
      has_table_privilege('authenticated','public.heat_coach_assessments','INSERT,UPDATE,DELETE,TRUNCATE') assessment_write,
      has_table_privilege('authenticated','strandcue_private.heat_rule_publications','SELECT,INSERT,UPDATE,DELETE') publication_access,
      has_table_privilege('authenticated','strandcue_private.heat_coach_operations','SELECT,INSERT,UPDATE,DELETE') receipt_access,
      has_table_privilege('anon','public.heat_coach_assessments','SELECT') anon_read`);
    expect(grants.rows[0]).toEqual({ assessment_read: true, assessment_write: false, publication_access: false, receipt_access: false, anon_read: false });
  });

  it('cascades assessments and receipts on account deletion', async () => {
    await create();
    await privileged('delete from public.profiles where user_id=$1', [USER_A]);
    const counts = await privileged<{ assessments: number; receipts: number }>(`select
      (select count(*) from public.heat_coach_assessments)::integer assessments,
      (select count(*) from strandcue_private.heat_coach_operations)::integer receipts`);
    expect(counts.rows[0]).toEqual({ assessments: 0, receipts: 0 });
  });

  it('purges only operation receipts strictly older than thirty days and keeps assessments', async () => {
    const old = await create({ operationId: crypto.randomUUID() });
    const fresh = await create({ operationId: crypto.randomUUID(), intent: {
      method:{state:'unknown'},temperature:{state:'unknown'},setting:{state:'unknown'},passes:{state:'unknown'},durationMinutes:{state:'unknown'},zones:[{region:'whole_head',segment:'entire_strand'}],
    } });
    await privileged(`update strandcue_private.heat_coach_operations set recorded_at='2026-01-01T00:00:00Z' where result->>'assessmentId'=$1`, [old.assessmentId]);
    await privileged(`update strandcue_private.heat_coach_operations set recorded_at='2026-02-01T00:00:00Z' where result->>'assessmentId'=$1`, [fresh.assessmentId]);
    const removed=await privileged<{ result:number }>(`select public.heat_coach_operation_retention_cleanup('2026-02-01T00:00:00Z') result`);
    expect(removed.rows[0]!.result).toBe(1);
    const counts=await privileged<{assessments:number;receipts:number}>(`select (select count(*) from public.heat_coach_assessments)::int assessments,(select count(*) from strandcue_private.heat_coach_operations)::int receipts`);
    expect(counts.rows[0]).toEqual({assessments:2,receipts:1});
  });
});

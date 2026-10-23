import type { PGlite } from '@electric-sql/pglite';

import { CareEventSchema, type CareEvent } from '../../../packages/domain/src/care-events.ts';
import { asUser, USER_A } from '../harness.ts';
import { privileged } from './cue-fixtures.ts';

/**
 * Synthetic treatment-programme fixtures (Task I5.4). Test data only: a catalogue product, a reviewed
 * rule publication row, executions with trusted care classifications and recorded washes. Nothing here
 * is, or imitates, production content; the rule and the two review names exist only inside a disposable
 * test database.
 */

export const BRAND_ID = 'c0000000-0000-4000-8000-000000000001';
export const PRODUCT_ID = 'c0000000-0000-4000-8000-000000000002';
export const VERSION_ID = 'c0000000-0000-4000-8000-000000000003';
export const OTHER_PRODUCT_ID = 'c0000000-0000-4000-8000-000000000012';
export const OTHER_VERSION_ID = 'c0000000-0000-4000-8000-000000000013';
export const UNVERIFIED_VERSION_ID = 'c0000000-0000-4000-8000-000000000023';
export const AUTHOR = 'Programme rule fixture author';
export const REVIEWER = 'Programme rule fixture reviewer';

export type RuleJson = Record<string, unknown>;

let counter = 0;
/** A unique rule and artifact identity per call, so published rows never collide across tests. */
export function nextIdentity() {
  counter += 1;
  return { ruleId: `rule-fixture-${counter}`, ruleVersion: '1', artifactId: `artifact-fixture-${counter}`, artifactVersion: '1' };
}

export function ruleFixture(identity: { ruleId: string; ruleVersion: string }, overrides: RuleJson = {}): RuleJson {
  return {
    ruleId: identity.ruleId,
    ruleVersion: identity.ruleVersion,
    productId: PRODUCT_ID,
    productVersionId: VERSION_ID,
    unit: 'wash',
    applicationWashCounts: false,
    range: { minimum: 2, maximum: 4 },
    transitionPolicy: { initialPhaseLimit: 1, reassessmentThreshold: 3, maintenanceThreshold: 3 },
    resumptionRule: { ruleId: 'resume-fixture', ruleVersion: '1', policy: 'resume_from_pause' },
    ...overrides,
  };
}

export async function seedProgrammeCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.brands(id, name) values ('${BRAND_ID}', 'Programme Fixture Brand') on conflict do nothing`);
  await db.exec(`insert into public.products(id, brand_id, name, category, market) values
    ('${PRODUCT_ID}', '${BRAND_ID}', 'Fixture Treatment', 'bond/protein treatment', 'ZA'),
    ('${OTHER_PRODUCT_ID}', '${BRAND_ID}', 'Other Fixture Treatment', 'mask', 'ZA') on conflict do nothing`);
  await db.exec(`insert into public.product_versions(id, product_id, variant, market, structured_directions, lifecycle) values
    ('${VERSION_ID}', '${PRODUCT_ID}', null, 'ZA', '{}', 'active'),
    ('${OTHER_VERSION_ID}', '${OTHER_PRODUCT_ID}', null, 'ZA', '{}', 'active'),
    ('${UNVERIFIED_VERSION_ID}', '${PRODUCT_ID}', 'Unverified', 'ZA', '{}', 'active') on conflict do nothing`);
  await db.exec(`insert into public.product_verification_events(version_id, reviewer, reviewed_fields, status, reason) values
    ('${VERSION_ID}', 'fixture-verifier', array['identity'], 'verified', 'synthetic fixture'),
    ('${OTHER_VERSION_ID}', 'fixture-verifier', array['identity'], 'verified', 'synthetic fixture'),
    ('${UNVERIFIED_VERSION_ID}', 'fixture-verifier', array['identity'], 'pending_verification', 'synthetic fixture')`);
}

export async function seedRulePublication(db: PGlite, options: {
  identity: { ruleId: string; ruleVersion: string; artifactId: string; artifactVersion: string };
  state?: 'draft' | 'published' | 'withdrawn';
  rule?: RuleJson;
  digestOverride?: string;
}) {
  const state = options.state ?? 'published';
  const rule = options.rule ?? ruleFixture(options.identity);
  await privileged(db,
    `insert into strandcue_private.programme_rule_publications
       (artifact_id, artifact_version, content_digest, rule, state, authored_by, reviewed_by, reviewed_at, published_at)
     select $1, $2, coalesce($4, 'sha256:' || encode(sha256(convert_to(r::text, 'UTF8')), 'hex')), r, $3,
            $5, case when $3 = 'draft' then null else $6 end,
            case when $3 = 'draft' then null else now() end, case when $3 = 'draft' then null else now() end
       from (select $7::jsonb r) x`,
    [options.identity.artifactId, options.identity.artifactVersion, state, options.digestOverride ?? null, AUTHOR, REVIEWER, JSON.stringify(rule)]);
  return rule;
}

export async function publishedRule(db: PGlite, overrides: RuleJson = {}, identity = nextIdentity()) {
  const rule = await seedRulePublication(db, { identity, rule: ruleFixture(identity, overrides) });
  return { identity, rule };
}

export function composeEventId(parts: readonly string[]): string {
  return parts.map(part => `${part.length}:${part}`).join(':');
}

export type CareSpec = {
  kind: 'wash' | 'application';
  /** An exact instant for an execution event. */
  at: string;
  /** Events sharing a label belong to one execution (one session). */
  session: string;
  shampoo?: 'yes' | 'no' | 'unknown';
  productId?: string | null;
  versionId?: string | null;
};

type SeededCare = CareSpec & { executionId: string; runId: string; stepId: string; eventId: string; position: number };

/** Inserts completed executions and their trusted classifications directly, as a privileged fixture. */
export async function seedExecutionCare(db: PGlite, owner: string, specs: readonly CareSpec[]): Promise<SeededCare[]> {
  const sessions = new Map<string, { executionId: string; runId: string; specs: CareSpec[] }>();
  for (const spec of specs) {
    if (!sessions.has(spec.session)) sessions.set(spec.session, { executionId: crypto.randomUUID(), runId: crypto.randomUUID(), specs: [] });
    sessions.get(spec.session)!.specs.push(spec);
  }
  const seeded: SeededCare[] = [];
  for (const session of sessions.values()) {
    const steps = session.specs.map((spec, index) => {
      const stepId = `step-${index + 1}`;
      const productId = spec.productId === undefined ? PRODUCT_ID : spec.productId;
      const versionId = spec.versionId === undefined ? VERSION_ID : spec.versionId;
      seeded.push({ ...spec, executionId: session.executionId, runId: session.runId, stepId, position: index + 1, eventId: composeEventId(['execution-confirmed', session.executionId, stepId]) });
      return {
        stepId, position: index + 1, state: 'confirmed', confirmedAt: spec.at, deviation: null,
        planned: {
          stepId, position: index + 1, action: `Fixture ${spec.kind}`,
          productId, productVersionId: versionId,
          toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: [],
        },
      };
    });
    const execution = { executionId: session.executionId, recommendationRunId: session.runId, steps, status: 'completed' };
    await privileged(db,
      `insert into public.protocol_executions(user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
       values ($1, $2, $3, '{}'::jsonb, $4::jsonb, 1, 'completed')`,
      [owner, session.executionId, session.runId, JSON.stringify(execution)], owner);
    for (const [index, spec] of session.specs.entries()) {
      await privileged(db,
        `insert into strandcue_private.execution_step_care(user_id, execution_id, step_id, run_id, kind, shampoo_used)
         values ($1, $2, $3, $4, $5, $6)`,
        [owner, session.executionId, `step-${index + 1}`, session.runId, spec.kind, spec.kind === 'wash' ? (spec.shampoo ?? 'yes') : null], owner);
    }
  }
  return seeded;
}

/** An owner-recorded wash activity, through the public RPC as the owner. */
export async function recordWashActivity(db: PGlite, owner: string, occurredAt: string, precision = 'exact_day') {
  await asUser(db, owner);
  const activityId = crypto.randomUUID();
  await db.query('select public.record_activity($1,$2,$3,$4::timestamptz,$5,$6::jsonb,$7)',
    [crypto.randomUUID(), activityId, 'wash', occurredAt, precision, '[]', null]);
  return { activityId, eventId: composeEventId(['activity-recorded', activityId]) };
}

export async function enrolProgramme(db: PGlite, options: {
  operationId?: string; productId?: string; versionId?: string; ruleId: string; ruleVersion?: string;
  startDate?: unknown; selectedApplicationEventId?: string | null;
}) {
  return (await db.query<{ result: any }>('select public.enrol_programme($1,$2,$3,$4,$5,$6::jsonb,$7) result', [
    options.operationId ?? crypto.randomUUID(), options.productId ?? PRODUCT_ID, options.versionId ?? VERSION_ID,
    options.ruleId, options.ruleVersion ?? '1',
    JSON.stringify(options.startDate ?? { precision: 'exact', value: '2026-09-01T08:00:00.000Z' }),
    options.selectedApplicationEventId ?? null,
  ])).rows[0].result;
}

export async function changeProgramme(db: PGlite, options: {
  operationId?: string; enrolmentId: string; expectedRevision: number; command: unknown;
}) {
  return (await db.query<{ result: any }>('select public.change_programme($1,$2,$3,$4::jsonb) result', [
    options.operationId ?? crypto.randomUUID(), options.enrolmentId, options.expectedRevision, JSON.stringify(options.command),
  ])).rows[0].result;
}

export async function getProgramme(db: PGlite, enrolmentId: string) {
  return (await db.query<{ result: any }>('select public.get_programme($1) result', [enrolmentId])).rows[0].result;
}

export async function listProgrammes(db: PGlite, limit = 20, cursor: unknown = null) {
  return (await db.query<{ result: any }>('select public.list_programmes($1,$2::jsonb) result', [limit, cursor === null ? null : JSON.stringify(cursor)])).rows[0].result;
}

export async function programmeCounts(db: PGlite) {
  const { rows } = await privileged<{ heads: string; events: string; receipts: string }>(db,
    `select (select count(*) from public.treatment_programmes)::text heads,
            (select count(*) from public.treatment_programme_events)::text events,
            (select count(*) from strandcue_private.treatment_programme_operations)::text receipts`);
  return { heads: Number(rows[0].heads), events: Number(rows[0].events), receipts: Number(rows[0].receipts) };
}

/** Builds the TypeScript canonical events that the SQL join should be equivalent to. */
export function tsCareEvents(seeded: readonly SeededCare[], activities: readonly { eventId: string; activityId: string; date: CareEvent['date'] }[] = []): CareEvent[] {
  const events: CareEvent[] = seeded.map(item => {
    const productId = item.productId === undefined ? PRODUCT_ID : item.productId;
    const versionId = item.versionId === undefined ? VERSION_ID : item.versionId;
    const product = productId !== null && versionId !== null
      ? { identity: 'known' as const, productId, productVersionId: versionId }
      : { identity: 'unknown' as const };
    const base = {
      eventId: item.eventId,
      date: { precision: 'exact' as const, value: item.at },
      provenance: 'execution-confirmed' as const,
      lifecycle: 'active' as const,
      source: { recordId: item.executionId, revision: null, stepId: item.stepId, position: item.position, runId: item.runId },
    };
    return item.kind === 'wash'
      ? CareEventSchema.parse({ ...base, kind: 'wash', wash: { shampooUsed: item.shampoo ?? 'yes', lathers: { state: 'unknown' }, product, zones: [] } })
      : CareEventSchema.parse({ ...base, kind: 'application', application: { product, zones: [] } });
  });
  for (const activity of activities) {
    events.push(CareEventSchema.parse({
      eventId: activity.eventId, kind: 'wash', date: activity.date, provenance: 'activity-recorded', lifecycle: 'active',
      source: { recordId: activity.activityId, revision: 1, stepId: null, position: null, runId: null },
      wash: { shampooUsed: 'unknown', lathers: { state: 'unknown' }, product: { identity: 'unknown' }, zones: [] },
    }));
  }
  return events;
}

export { asUser, USER_A };

import { evaluateProgramme, type ProgrammeEvaluation } from '../../../packages/domain/src/treatment-programme.ts';
import { CareEventSchema, type CareEvent } from '../../../packages/domain/src/care-events.ts';
import { ProgrammeError } from '../../../apps/mobile/src/programme-errors.ts';
import type {
  ProgrammeApi,
  ProgrammeCursor,
  ProgrammeDetail,
  ProgrammePage,
  ProgrammeRecord,
} from '../../../apps/mobile/src/programme-api.ts';
export type { ProgrammeApi } from '../../../apps/mobile/src/programme-api.ts';

/**
 * An in-memory stand-in for the four treatment-programme RPCs (Task I5.5).
 *
 * It mirrors the committed I5.4 contract exactly: the owner is derived by the
 * server and never supplied by the client, every mutation is idempotent by
 * operation id, the expected revision is enforced, the lifecycle is append-only,
 * and counts, due status and programme state are derived on every read with the
 * pure domain evaluator from I5.3 — never stored, never accepted from a caller.
 * Rule publications are synthetic test fixtures only; nothing here is, or
 * imitates, production treatment content.
 *
 * Every refusal raises a `ProgrammeError` carrying the stable server code, so
 * the client's own error mapping is what the tests exercise.
 */

export type CareKind = 'wash' | 'application';

export interface ProgrammeCareSpec {
  readonly kind: CareKind;
  /** An exact confirmed instant. */
  readonly at: string;
  /** Specs sharing a label belong to one confirmed execution session. */
  readonly session: string;
  readonly shampoo?: 'yes' | 'no' | 'unknown';
  readonly productId?: string | null;
  readonly productVersionId?: string | null;
}

export interface ProgrammeRuleSeed {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly artifactId: string;
  readonly artifactVersion: string;
  readonly contentDigest: string;
  readonly state: 'draft' | 'published' | 'withdrawn';
  readonly rule: Record<string, unknown>;
}

export interface ProgrammeServerSeed {
  readonly rules: readonly ProgrammeRuleSeed[];
  readonly care: readonly ProgrammeCareSpec[];
  readonly productId: string;
  readonly productVersionId: string;
  /** Models an unverified product version, so the evaluator fails closed. */
  readonly unverified?: boolean;
}

type Json = Record<string, unknown>;

interface StoredEvent {
  readonly sequence: number;
  readonly kind: 'enrol' | 'change' | 'pause' | 'resume' | 'maintenance' | 'complete' | 'abandon';
  readonly recordedAt: string;
  readonly occurredAt?: string;
  readonly reasonCode?: string;
  readonly ruleId?: string;
  readonly ruleVersion?: string;
  readonly selectedApplicationEventId?: string;
  readonly snapshot?: Json;
}

interface StoredProgramme {
  readonly enrolmentId: string;
  readonly productId: string;
  readonly productVersionId: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly artifactId: string;
  readonly artifactVersion: string;
  readonly contentDigest: string;
  readonly startDate: { precision: 'exact' | 'day'; value: string };
  selectedApplicationEventId: string | null;
  status: 'active' | 'completed' | 'abandoned';
  revision: number;
  readonly createdAt: string;
  updatedAt: string;
  readonly events: StoredEvent[];
}

const PRODUCT_LABEL = 'Fixture treatment product';

function composeEventId(parts: readonly string[]): string {
  return parts.map(part => `${part.length}:${part}`).join(':');
}

function uuid(prefix: string, n: number): string {
  return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** Builds the canonical execution-confirmed care events the server would derive. */
function careEvents(seed: ProgrammeServerSeed): readonly CareEvent[] {
  const sessions = new Map<string, { executionId: string; runId: string; specs: ProgrammeCareSpec[] }>();
  for (const spec of seed.care) {
    if (!sessions.has(spec.session)) {
      const index = sessions.size + 1;
      sessions.set(spec.session, {
        executionId: uuid('eeeeeeee', index),
        runId: uuid('ffffffff', index),
        specs: [],
      });
    }
    sessions.get(spec.session)!.specs.push(spec);
  }
  const events: CareEvent[] = [];
  for (const session of sessions.values()) {
    session.specs.forEach((spec, index) => {
      const stepId = `step-${index + 1}`;
      const productId = spec.productId === undefined ? seed.productId : spec.productId;
      const productVersionId = spec.productVersionId === undefined ? seed.productVersionId : spec.productVersionId;
      const product = productId !== null && productVersionId !== null
        ? { identity: 'known' as const, productId, productVersionId }
        : { identity: 'unknown' as const };
      const base = {
        eventId: composeEventId(['execution-confirmed', session.executionId, stepId]),
        date: { precision: 'exact' as const, value: spec.at },
        provenance: 'execution-confirmed' as const,
        lifecycle: 'active' as const,
        source: { recordId: session.executionId, revision: null, stepId, position: index + 1, runId: session.runId },
      };
      events.push(CareEventSchema.parse(spec.kind === 'wash'
        ? { ...base, kind: 'wash', wash: { shampooUsed: spec.shampoo ?? 'yes', lathers: { state: 'unknown' }, product, zones: [] } }
        : { ...base, kind: 'application', application: { product, zones: [] } }));
    });
  }
  return events;
}

/** The evaluator the server runs on every read, from the owner's own facts. */
function evaluate(programme: StoredProgramme, seed: ProgrammeServerSeed): ProgrammeEvaluation {
  const rule = seed.rules.find(entry =>
    entry.ruleId === programme.ruleId && entry.ruleVersion === programme.ruleVersion);
  const enrolment: Json = {
    enrolmentId: programme.enrolmentId,
    productId: programme.productId,
    productVersionId: programme.productVersionId,
    productVerificationStatus: seed.unverified === true ? 'unverified' : 'verified',
    ruleId: programme.ruleId,
    ruleVersion: programme.ruleVersion,
    rulePublication: {
      artifactId: programme.artifactId,
      artifactVersion: programme.artifactVersion,
      contentDigest: programme.contentDigest,
    },
    state: programme.status === 'completed'
      ? 'completed'
      : programme.status === 'abandoned'
        ? 'not_started'
        : programme.events.some(event => event.kind === 'pause' && !programme.events.some(other => other.kind === 'resume'))
          ? 'paused'
          : programme.events.some(event => event.kind === 'maintenance')
            ? 'maintenance'
            : 'initial',
    startDate: programme.startDate,
    revision: programme.revision,
  };
  if (programme.selectedApplicationEventId !== null) {
    enrolment.selectedApplicationEventId = programme.selectedApplicationEventId;
  }
  const pause = programme.events.find(event => event.kind === 'pause');
  const resume = programme.events.find(event => event.kind === 'resume');
  const maintenance = programme.events.find(event => event.kind === 'maintenance');
  const complete = programme.events.find(event => event.kind === 'complete');
  if (pause !== undefined && resume === undefined) {
    enrolment.paused = { pausedAt: { precision: 'exact', value: pause.occurredAt }, pauseReasonCode: pause.reasonCode };
  }
  if (pause !== undefined && resume !== undefined) {
    enrolment.paused = { pausedAt: { precision: 'exact', value: pause.occurredAt }, pauseReasonCode: pause.reasonCode };
    enrolment.resumed = {
      resumptionRuleId: resume.ruleId,
      resumptionRuleVersion: resume.ruleVersion,
      resumedAt: { precision: 'exact', value: resume.occurredAt },
    };
  }
  if (maintenance !== undefined) {
    enrolment.maintenanceTransition = {
      ruleId: maintenance.ruleId,
      ruleVersion: maintenance.ruleVersion,
      transitionedAt: { precision: 'exact', value: maintenance.occurredAt },
    };
  }
  if (complete !== undefined) enrolment.completed = { snapshot: complete.snapshot };

  const programmeRule = rule === undefined
    ? undefined
    : {
      ...rule.rule,
      publicationStatus: rule.state,
      publication: {
        artifactId: programme.artifactId,
        artifactVersion: programme.artifactVersion,
        contentDigest: rule.contentDigest,
      },
    };
  // An abandoned programme is never evaluated: the server returns a null evaluation.
  if (programme.status === 'abandoned' || programmeRule === undefined) {
    return evaluateProgramme(enrolment, [], programmeRule ?? {}, programme.updatedAt);
  }
  return evaluateProgramme(enrolment, careEvents(seed), programmeRule, programme.updatedAt);
}

function recordOf(programme: StoredProgramme, seed: ProgrammeServerSeed): ProgrammeRecord {
  const pause = programme.events.find(event => event.kind === 'pause');
  const resume = programme.events.find(event => event.kind === 'resume');
  const maintenance = programme.events.find(event => event.kind === 'maintenance');
  const complete = programme.events.find(event => event.kind === 'complete');
  const record: Json = {
    enrolmentId: programme.enrolmentId,
    productId: programme.productId,
    productVersionId: programme.productVersionId,
    productLabel: PRODUCT_LABEL,
    ruleId: programme.ruleId,
    ruleVersion: programme.ruleVersion,
    rulePublication: {
      artifactId: programme.artifactId,
      artifactVersion: programme.artifactVersion,
      contentDigest: programme.contentDigest,
    },
    startDate: programme.startDate,
    status: programme.status,
    revision: programme.revision,
    paused: pause === undefined ? null : { pausedAt: pause.occurredAt, reasonCode: pause.reasonCode },
    resumed: resume === undefined ? null : {
      resumptionRuleId: resume.ruleId,
      resumptionRuleVersion: resume.ruleVersion,
      resumedAt: resume.occurredAt,
    },
    maintenanceTransition: maintenance === undefined ? null : {
      ruleId: maintenance.ruleId,
      ruleVersion: maintenance.ruleVersion,
      transitionedAt: maintenance.occurredAt,
    },
    completed: complete === undefined ? null : { snapshot: complete.snapshot },
    createdAt: programme.createdAt,
    updatedAt: programme.updatedAt,
  };
  if (programme.selectedApplicationEventId !== null) {
    record.selectedApplicationEventId = programme.selectedApplicationEventId;
  }
  return record as unknown as ProgrammeRecord;
}

function detailOf(programme: StoredProgramme, seed: ProgrammeServerSeed): ProgrammeDetail {
  const record = recordOf(programme, seed) as unknown as Json;
  const evaluation = programme.status === 'abandoned' ? null : evaluate(programme, seed);
  return {
    ...record,
    history: programme.events.map(event => {
      const entry: Json = { sequence: event.sequence, kind: event.kind, recordedAt: event.recordedAt };
      if (event.occurredAt !== undefined) entry.occurredAt = event.occurredAt;
      if (event.reasonCode !== undefined) entry.reasonCode = event.reasonCode;
      if (event.ruleId !== undefined) entry.ruleId = event.ruleId;
      if (event.ruleVersion !== undefined) entry.ruleVersion = event.ruleVersion;
      if (event.selectedApplicationEventId !== undefined) entry.selectedApplicationEventId = event.selectedApplicationEventId;
      return entry;
    }),
    evaluation: evaluation as unknown as ProgrammeDetail['evaluation'],
  } as unknown as ProgrammeDetail;
}

function failed(code: ProgrammeError['code']): ProgrammeError {
  return new ProgrammeError(code);
}

function isInstant(value: unknown): boolean {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

function isCode(value: unknown): boolean {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
}

/** The synthetic reviewed rule the owner may enrol against, or undefined in production. */
function publishedRuleFor(seed: ProgrammeServerSeed, ruleId: string, ruleVersion: string): ProgrammeRuleSeed | undefined {
  return seed.rules.find(rule =>
    rule.state === 'published' && rule.ruleId === ruleId && rule.ruleVersion === ruleVersion);
}

export function createFakeProgrammeServer(seed: ProgrammeServerSeed) {
  const programmes = new Map<string, StoredProgramme>();
  const operations = new Map<string, { payload: string; result: Json }>();
  const calls: { name: string; args: unknown }[] = [];
  const gates = new Map<string, Promise<void>>();
  const lose = new Set<string>();
  const failures = new Set<string>();
  let counter = 0;
  let offline = false;
  let clockMs = Date.parse('2026-09-20T10:00:00.000Z');

  const tick = (): string => {
    clockMs += 1000;
    return new Date(clockMs).toISOString().replace('Z', '+00:00');
  };

  const enter = async (name: string, args: unknown): Promise<void> => {
    calls.push({ name, args });
    const gate = gates.get(name);
    if (gate !== undefined) {
      gates.delete(name);
      await gate;
    }
    if (offline || failures.delete(name)) throw failed('offline');
  };

  const idempotent = <T>(name: string, operationId: string, payload: unknown, build: () => T): T => {
    const text = JSON.stringify(payload);
    // The committed database ledger scopes an operation to its command
    // boundary. The same UUID may therefore be used once for enrolment and
    // once for a later change without turning the later command into a replay
    // of a different RPC.
    const operationKey = `${name}:${operationId}`;
    const prior = operations.get(operationKey);
    if (prior !== undefined) {
      if (prior.payload !== text) throw failed('operation-conflict');
      return prior.result as unknown as T;
    }
    const result = build();
    operations.set(operationKey, { payload: text, result: result as unknown as Json });
    return result;
  };

  const raw = {
    async enrolProgramme(command: unknown) {
      const c = command as {
        operationId: string;
        offer: { productId: string; productVersionId: string; ruleId: string; ruleVersion: string };
        startDate: { precision: 'exact' | 'day'; value: string };
        selectedApplicationEventId?: string;
      };
      await enter('enrol_programme', c);
      return idempotent('enrol', c.operationId, c, () => {
        const published = publishedRuleFor(seed, c.offer.ruleId, c.offer.ruleVersion);
        if (published === undefined) {
          const withdrawn = seed.rules.find(rule =>
            rule.state === 'withdrawn' && rule.ruleId === c.offer.ruleId && rule.ruleVersion === c.offer.ruleVersion);
          if (withdrawn !== undefined) throw failed('rule-withdrawn');
          throw failed('rule-content-pending');
        }
        const ruleProductId = published.rule.productId as string;
        const ruleVersionId = published.rule.productVersionId as string;
        if (ruleProductId !== c.offer.productId || ruleVersionId !== c.offer.productVersionId) {
          throw failed('product-mismatch');
        }
        if (programmes.size >= 20) throw failed('quota-exceeded');
        const duplicate = [...programmes.values()].some(programme =>
          programme.productVersionId === c.offer.productVersionId
          && programme.ruleId === c.offer.ruleId
          && programme.ruleVersion === c.offer.ruleVersion
          && programme.status === 'active');
        if (duplicate) throw failed('duplicate-active');
        if (c.selectedApplicationEventId !== undefined) {
          const events = careEvents(seed);
          if (!events.some(event => event.eventId === c.selectedApplicationEventId && event.kind === 'application')) {
            throw failed('application-missing');
          }
        }
        counter += 1;
        const at = tick();
        const created: StoredProgramme = {
          enrolmentId: uuid('aaaaaaaa', counter),
          productId: c.offer.productId,
          productVersionId: c.offer.productVersionId,
          ruleId: c.offer.ruleId,
          ruleVersion: c.offer.ruleVersion,
          artifactId: published.artifactId,
          artifactVersion: published.artifactVersion,
          contentDigest: published.contentDigest,
          startDate: c.startDate,
          selectedApplicationEventId: c.selectedApplicationEventId ?? null,
          status: 'active',
          revision: 1,
          createdAt: at,
          updatedAt: at,
          events: [{ sequence: 1, kind: 'enrol', recordedAt: at }],
        };
        programmes.set(created.enrolmentId, created);
        return recordOf(created, seed) as unknown as Json;
      });
    },
    async changeProgramme(command: unknown) {
      const c = command as {
        operationId: string;
        enrolmentId: string;
        expectedRevision: number;
        command: Json;
      };
      await enter('change_programme', c);
      const inner = c.command;
      if (inner === null || typeof inner !== 'object' || typeof inner.kind !== 'string') {
        throw failed('invalid-command');
      }
      const allowed: Record<string, readonly string[]> = {
        'select-application': ['kind', 'eventId'],
        pause: ['kind', 'pausedAt', 'reasonCode'],
        resume: ['kind', 'resumedAt', 'resumptionRuleId', 'resumptionRuleVersion'],
        maintenance: ['kind', 'transitionedAt', 'ruleId', 'ruleVersion'],
        abandon: ['kind'],
        complete: ['kind', 'completedAt'],
      };
      const keys = allowed[inner.kind as string];
      if (keys === undefined) throw failed('invalid-command');
      const extra = Object.keys(inner).filter(key => !keys.includes(key));
      const missing = keys.filter(key => !(key in inner));
      if (extra.length > 0 || missing.length > 0) throw failed('invalid-command');
      if (inner.kind === 'pause' && (!isInstant(inner.pausedAt) || !isCode(inner.reasonCode))) {
        throw failed('invalid-command');
      }
      if ((inner.kind === 'resume' || inner.kind === 'maintenance' || inner.kind === 'complete') && !isInstant(
        inner.resumedAt ?? inner.transitionedAt ?? inner.completedAt)) {
        throw failed('invalid-command');
      }
      return idempotent('change', c.operationId, c, () => {
        const programme = programmes.get(c.enrolmentId);
        if (programme === undefined) throw failed('programme-not-found');
        if (programme.revision !== c.expectedRevision) throw failed('revision-conflict');
        if (programme.status === 'completed') throw failed('already-completed');
        if (programme.status === 'abandoned') throw failed('already-abandoned');
        const rule = seed.rules.find(entry =>
          entry.artifactId === programme.artifactId && entry.artifactVersion === programme.artifactVersion);
        if (inner.kind !== 'abandon') {
          if (rule === undefined) throw failed('rule-publication-mismatch');
          if (rule.state === 'withdrawn') throw failed('rule-withdrawn');
          if (rule.state !== 'published') throw failed('rule-content-pending');
        }
        const next = programme.revision + 1;
        const at = tick();
        const when = (inner.resumedAt ?? inner.transitionedAt ?? inner.completedAt ?? inner.pausedAt) as string | undefined;
        if (inner.kind === 'abandon') {
          programme.events.push({ sequence: next, kind: 'abandon', recordedAt: at });
          programme.status = 'abandoned';
        } else if (inner.kind === 'pause') {
          if (programme.events.some(event => event.kind === 'pause')) throw failed('invalid-lifecycle');
          const resumptionRule = rule?.rule.resumptionRule as Json | undefined;
          if (resumptionRule === undefined || resumptionRule === null) throw failed('pause-resumption-required');
          if (when! < (programme.startDate.precision === 'exact' ? programme.startDate.value : `${programme.startDate.value}T00:00:00.000Z`)) {
            throw failed('invalid-chronology');
          }
          programme.events.push({
            sequence: next, kind: 'pause', recordedAt: at, occurredAt: when, reasonCode: inner.reasonCode as string,
          });
        } else if (inner.kind === 'complete') {
          const evaluation = evaluate(programme, seed);
          if (evaluation.dueStatus === 'needs_input' || evaluation.count === undefined || evaluation.application === null) {
            throw failed(evaluation.missing[0]?.code === 'interruption-without-resumption'
              ? 'pause-resumption-required'
              : 'application-missing');
          }
          const used = [...evaluation.eventsUsed];
          if (!used.some(reference => reference.eventId === evaluation.application!.eventId)) {
            used.push(evaluation.application!);
          }
          used.sort((left, right) => {
            const leftKey = `${left.date.precision}\u0000${left.date.value ?? ''}\u0000${left.kind}\u0000${left.eventId}`;
            const rightKey = `${right.date.precision}\u0000${right.date.value ?? ''}\u0000${right.kind}\u0000${right.eventId}`;
            return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
          });
          programme.events.push({
            sequence: next,
            kind: 'complete',
            recordedAt: at,
            occurredAt: when,
            snapshot: {
              enrolmentId: programme.enrolmentId,
              productId: programme.productId,
              productVersionId: programme.productVersionId,
              ruleId: programme.ruleId,
              ruleVersion: programme.ruleVersion,
              rulePublication: {
                artifactId: programme.artifactId,
                artifactVersion: programme.artifactVersion,
                contentDigest: programme.contentDigest,
              },
              state: 'completed',
              dueStatus: evaluation.dueStatus,
              unit: evaluation.unit,
              count: evaluation.count,
              ...(evaluation.range === undefined ? {} : { range: evaluation.range }),
              eventsUsed: used,
              application: evaluation.application,
              asOf: evaluation.asOf,
              completedAt: when,
            },
          });
          programme.status = 'completed';
        } else if (inner.kind === 'select-application') {
          const events = careEvents(seed);
          if (!events.some(event => event.eventId === inner.eventId && event.kind === 'application')) {
            throw failed('application-missing');
          }
          programme.events.push({
            sequence: next, kind: 'change', recordedAt: at, selectedApplicationEventId: inner.eventId as string,
          });
          programme.selectedApplicationEventId = inner.eventId as string;
        } else {
          // A resume through the committed contract needs the server-approved
          // resumption rule identity, which the response contract never exposes.
          throw failed('pause-resumption-required');
        }
        programme.revision = next;
        programme.updatedAt = at;
        return recordOf(programme, seed) as unknown as Json;
      });
    },
    async listProgrammes(query: unknown) {
      const q = query as { limit: number; cursor: ProgrammeCursor | null };
      await enter('list_programmes', q);
      if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 20) throw failed('invalid-page');
      const ordered = [...programmes.values()].sort((left, right) =>
        left.createdAt === right.createdAt
          ? (left.enrolmentId < right.enrolmentId ? 1 : -1)
          : left.createdAt < right.createdAt ? 1 : -1);
      const start = q.cursor === null
        ? 0
        : ordered.findIndex(programme => programme.enrolmentId === q.cursor!.enrolmentId) + 1;
      if (q.cursor !== null && start === 0) throw failed('invalid-cursor');
      const slice = ordered.slice(start, start + q.limit);
      const last = slice[slice.length - 1];
      const more = start + q.limit < ordered.length;
      const page: Json = {
        items: slice.map(programme => {
          const record = { ...(recordOf(programme, seed) as unknown as Json) };
          record.evaluation = programme.status === 'abandoned' ? null : evaluate(programme, seed);
          return record;
        }),
        nextCursor: more && last !== undefined
          ? { createdAt: last.createdAt, enrolmentId: last.enrolmentId }
          : null,
      };
      return page as unknown as ProgrammePage;
    },
    async getProgramme(enrolmentId: unknown) {
      await enter('get_programme', enrolmentId);
      const programme = programmes.get(enrolmentId as string);
      if (programme === undefined) throw failed('programme-not-found');
      return detailOf(programme, seed);
    },
  };

  const wrap = <A extends unknown[], R>(name: string, call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      const result = await call(...args);
      if (lose.delete(name)) throw failed('offline');
      return result;
    };

  const api: ProgrammeApi = {
    enrolProgramme: wrap('enrol_programme', raw.enrolProgramme as never),
    changeProgramme: wrap('change_programme', raw.changeProgramme as never),
    listProgrammes: wrap('list_programmes', raw.listProgrammes as never),
    getProgramme: wrap('get_programme', raw.getProgramme as never),
  };

  return {
    api,
    calls,
    seed,
    callsNamed: (name: string) => calls.filter(call => call.name === name),
    /** Every rule the fake holds, so a test can assert nothing was invented. */
    rules: () => seed.rules,
    setClock: (iso: string) => {
      clockMs = Date.parse(iso);
    },
    setOffline: (value: boolean) => {
      offline = value;
    },
    hold(name: string): () => void {
      let release: () => void = () => undefined;
      gates.set(name, new Promise<void>(resolve => {
        release = resolve;
      }));
      return release;
    },
    failNext(name: string): void {
      failures.add(name);
    },
    loseResponse(name: string): void {
      lose.add(name);
    },
    /** Another session moves the programme on: a coherent, higher revision. */
    changeElsewhere(enrolmentId: string): void {
      const programme = programmes.get(enrolmentId)!;
      const at = tick();
      programme.events.push({
        sequence: programme.revision + 1,
        kind: 'change',
        recordedAt: at,
        selectedApplicationEventId: careEvents(seed).find(event => event.kind === 'application')?.eventId,
      });
      programme.revision += 1;
      programme.updatedAt = at;
    },
  };
}

/** A production-shaped seed: no reviewed rule publication exists at all. */
export const PRODUCTION_SEED: ProgrammeServerSeed = {
  rules: [],
  care: [],
  productId: 'c0000000-0000-4000-8000-000000000002',
  productVersionId: 'c0000000-0000-4000-8000-000000000003',
};

/** A synthetic reviewed rule publication, used only to exercise a full journey. */
export function reviewedRuleSeed(overrides: Record<string, unknown> = {}): ProgrammeRuleSeed {
  const ruleId = 'rule-fixture-1';
  return {
    ruleId,
    ruleVersion: '1',
    artifactId: 'artifact-fixture-1',
    artifactVersion: '1',
    contentDigest: `sha256:${'a'.repeat(64)}`,
    state: 'published',
    rule: {
      ruleId,
      ruleVersion: '1',
      productId: PRODUCTION_SEED.productId,
      productVersionId: PRODUCTION_SEED.productVersionId,
      unit: 'wash',
      applicationWashCounts: false,
      range: { minimum: 2, maximum: 4 },
      transitionPolicy: { initialPhaseLimit: 1, reassessmentThreshold: 3, maintenanceThreshold: 3 },
      resumptionRule: { ruleId: 'resume-fixture', ruleVersion: '1', policy: 'resume_from_pause' },
      ...overrides,
    },
  };
}

export const REVIEWED_SEED: ProgrammeServerSeed = {
  rules: [reviewedRuleSeed()],
  productId: PRODUCTION_SEED.productId,
  productVersionId: PRODUCTION_SEED.productVersionId,
  care: [
    { kind: 'application', at: '2026-09-02T08:00:00.000Z', session: 'app' },
    { kind: 'wash', at: '2026-09-05T08:00:00.000Z', session: 'wash-1' },
    { kind: 'wash', at: '2026-09-08T08:00:00.000Z', session: 'wash-2' },
    { kind: 'wash', at: '2026-09-11T08:00:00.000Z', session: 'wash-3' },
  ],
};

/** A seed with several reviewed rules for one product, so paging can be proven. */
export function multiRuleSeed(count: number): ProgrammeServerSeed {
  return {
    ...REVIEWED_SEED,
    rules: Array.from({ length: count }, (_, index) => {
      const ruleId = `rule-fixture-${index + 1}`;
      return {
        ruleId,
        ruleVersion: '1',
        artifactId: `artifact-fixture-${index + 1}`,
        artifactVersion: '1',
        contentDigest: `sha256:${'a'.repeat(64)}`,
        state: 'published' as const,
        rule: {
          ...reviewedRuleSeed().rule,
          ruleId,
        },
      };
    }),
  };
}

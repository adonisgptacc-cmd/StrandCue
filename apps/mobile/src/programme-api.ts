import { z } from 'zod';

import {
  ProgrammeMissingFactCodeSchema,
} from '../../../packages/domain/src/treatment-programme.ts';
import { WashCountRangeSchema, WashCountUnitSchema } from '../../../packages/domain/src/wash-count.ts';
import { supabase } from './client.ts';
import { ProgrammeError, mapServerMessage, type ProgrammeErrorCode } from './programme-errors.ts';

/**
 * Owner-scoped client boundary for treatment programmes (Task I5.5).
 *
 * The caller supplies only the owner's own facts and an operation id. The owner
 * identity, the counts, the due status, the programme state, the maintenance
 * count, the publication binding, the rule and product capabilities, the
 * evidence list, the completion snapshot and every reviewer fact are derived or
 * built by the server; strict command schemas reject any attempt to send them.
 * Every response is parsed through strict schemas, so an unexpected shape fails
 * closed instead of being trusted and no unvalidated field is ever rendered.
 *
 * Four RPCs are called; the tables are never read or written directly. There is
 * deliberately no resume, maintenance or application-substitution wrapper here:
 * the committed I5.4 contract gives the client no server-approved resumption
 * rule identity and no owner-safe label for a recorded application event, so
 * those changes cannot be requested without the client inventing authoritative
 * facts.
 */

const uuid = z.string().uuid();
/** Bounded strings, matching the database boundary exactly. */
const bounded200 = z.string().trim().min(1).max(200);
const bounded400 = z.string().trim().min(1).max(400);
const bounded1000 = z.string().trim().min(1).max(1000);
const reasonCode = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const expectedRevision = z.number().int().positive().max(50);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/** A strict offset-aware instant, or a calendar day; never a local time. */
const instant = z.string().refine(value => {
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && !Number.isNaN(Date.parse(value));
}, 'Expected an ISO instant with an offset');

const calendarDay = z.string().refine(value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Expected a calendar date');

/** The owner's own programme start, with the precision they recorded. */
export const ProgrammeStartDateSchema = z
  .object({ precision: z.enum(['exact', 'day']), value: z.string() })
  .strict()
  .superRefine((start, context) => {
    if (start.precision === 'exact' && !instant.safeParse(start.value).success) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Expected an offset-aware instant' });
    }
    if (start.precision === 'day' && !calendarDay.safeParse(start.value).success) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'Expected a calendar date' });
    }
  });
export type ProgrammeStartDate = z.output<typeof ProgrammeStartDateSchema>;

/**
 * A reviewed programme the server has confirmed is available for one of the
 * owner's products. The rule identity is never invented by the client: it is
 * supplied by a reviewed-content surface, and only then is enrolment offered.
 */
export const ProgrammeOfferSchema = z
  .object({ productId: uuid, productVersionId: uuid, ruleId: bounded200, ruleVersion: bounded200 })
  .strict();
export type ProgrammeOffer = z.output<typeof ProgrammeOfferSchema>;

/**
 * Pages are keyed on a programme's creation instant and its row id: both are
 * immutable, so a change made elsewhere can never move a programme past an
 * owner's cursor and hide it.
 */
export const ProgrammeCursorSchema = z.object({ createdAt: instant, enrolmentId: uuid }).strict();
export type ProgrammeCursor = z.output<typeof ProgrammeCursorSchema>;

// ---------------------------------------------------------------------------
// Commands: one strict schema per mutation
// ---------------------------------------------------------------------------

const EnrolProgrammeCommandSchema = z
  .object({
    operationId: uuid,
    offer: ProgrammeOfferSchema,
    startDate: ProgrammeStartDateSchema,
    /**
     * Which recorded application the programme runs from, when more than one
     * exists. An internal reference the owner cannot read, so it is accepted
     * only when a server response supplied it.
     */
    selectedApplicationEventId: bounded400.optional(),
  })
  .strict();

const PauseCommandSchema = z
  .object({
    operationId: uuid,
    enrolmentId: uuid,
    expectedRevision,
    command: z.object({ kind: z.literal('pause'), pausedAt: instant, reasonCode }).strict(),
  })
  .strict();

const AbandonCommandSchema = z
  .object({
    operationId: uuid,
    enrolmentId: uuid,
    expectedRevision,
    command: z.object({ kind: z.literal('abandon') }).strict(),
  })
  .strict();

const CompleteCommandSchema = z
  .object({
    operationId: uuid,
    enrolmentId: uuid,
    expectedRevision,
    command: z.object({ kind: z.literal('complete'), completedAt: instant }).strict(),
  })
  .strict();

/** Three separate command schemas; none admits another command's fields. */
export const ProgrammeChangeCommandSchema = z.union([PauseCommandSchema, AbandonCommandSchema, CompleteCommandSchema]);

const ListProgrammesQuerySchema = z
  .object({ limit: z.number().int().min(1).max(20), cursor: ProgrammeCursorSchema.nullable().optional() })
  .strict();

// ---------------------------------------------------------------------------
// Responses: strict, self-consistent, fail-closed
// ---------------------------------------------------------------------------

/** A recorded date as the owner recorded it: precision is never widened. */
const CareEventDateSchema = z
  .object({ precision: z.enum(['exact', 'day', 'approximate', 'unknown']), value: z.string().nullable() })
  .strict()
  .superRefine((date, context) => {
    if (date.precision === 'exact' && (date.value === null || !instant.safeParse(date.value).success)) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'An exact date needs an instant' });
    }
    if (date.precision === 'day' && (date.value === null || !calendarDay.safeParse(date.value).success)) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'A day date needs a calendar date' });
    }
    if (date.precision === 'unknown' && date.value !== null) {
      context.addIssue({ code: 'custom', path: ['value'], message: 'An unknown date carries no value' });
    }
  });

/** One recorded event reference. Its id is never shown to the owner. */
export const ProgrammeEventReferenceSchema = z
  .object({ eventId: bounded400, kind: z.enum(['wash', 'application', 'heat']), date: CareEventDateSchema })
  .strict();
export type ProgrammeEventReference = z.output<typeof ProgrammeEventReferenceSchema>;

export const ProgrammeMissingFactSchema = z
  .object({ code: ProgrammeMissingFactCodeSchema, eventId: bounded400.optional(), explanation: bounded1000 })
  .strict();
export type ProgrammeMissingFact = z.output<typeof ProgrammeMissingFactSchema>;

function referenceOrder(reference: ProgrammeEventReference): string {
  const value = reference.date.value ?? '';
  return `${reference.date.precision}\u0000${value}\u0000${reference.kind}\u0000${reference.eventId}`;
}

export const ProgrammeEvaluationSchema = z
  .object({
    state: z.enum(['not_started', 'initial', 'reassessment', 'maintenance', 'paused', 'completed']),
    dueStatus: z.enum(['not_due', 'eligible', 'due', 'needs_input']),
    unit: WashCountUnitSchema,
    count: z.number().int().nonnegative().optional(),
    range: WashCountRangeSchema.optional(),
    eventsUsed: z.array(ProgrammeEventReferenceSchema).max(1001),
    application: ProgrammeEventReferenceSchema.nullable(),
    asOf: instant,
    missing: z.array(ProgrammeMissingFactSchema),
    reasonCodes: z.array(bounded200),
    fromCompletedSnapshot: z.boolean(),
    ruleId: bounded200,
    ruleVersion: bounded200,
  })
  .strict()
  .superRefine((evaluation, context) => {
    const fail = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
    if (evaluation.fromCompletedSnapshot) {
      if (evaluation.state !== 'completed') fail('state', 'A snapshot evaluation must be completed');
      if (evaluation.count === undefined) fail('count', 'A snapshot evaluation must carry a count');
    } else if (evaluation.state === 'completed') {
      fail('fromCompletedSnapshot', 'A completed state must come from its immutable snapshot');
    }
    if (evaluation.application !== null && evaluation.application.kind !== 'application') {
      fail('application', 'The application reference must be an application event');
    }
    if (evaluation.count === undefined && evaluation.eventsUsed.length > 0) fail('eventsUsed', 'An uncounted evaluation lists no events');
    const ids = evaluation.eventsUsed.map(reference => reference.eventId);
    if (new Set(ids).size !== ids.length) fail('eventsUsed', 'Event references must be unique');
    const keys = evaluation.eventsUsed.map(referenceOrder);
    for (let index = 1; index < keys.length; index += 1) {
      if (keys[index - 1]! > keys[index]!) fail('eventsUsed', 'Event references must be in canonical order');
    }
    if (evaluation.application !== null && !ids.includes(evaluation.application.eventId)) {
      // The application is counted as evidence only when the count uses it.
      if (evaluation.count !== undefined) fail('application', 'A counted evaluation includes its application');
    }
  });
export type ProgrammeEvaluation = z.output<typeof ProgrammeEvaluationSchema>;

const RulePublicationSchema = z
  .object({ artifactId: bounded200, artifactVersion: bounded200, contentDigest: digest })
  .strict();

const CompletedSnapshotSchema = z
  .object({
    enrolmentId: z.string().min(1).max(200),
    productId: z.string().min(1).max(200),
    productVersionId: z.string().min(1).max(200),
    ruleId: bounded200,
    ruleVersion: bounded200,
    rulePublication: RulePublicationSchema,
    state: z.literal('completed'),
    dueStatus: z.enum(['not_due', 'eligible', 'due']),
    unit: WashCountUnitSchema,
    count: z.number().int().nonnegative(),
    range: WashCountRangeSchema.optional(),
    eventsUsed: z.array(z.object({ eventId: bounded400, kind: z.enum(['wash', 'application']), date: CareEventDateSchema }).strict()).min(1).max(1001),
    application: z
      .object({ eventId: bounded400, kind: z.literal('application'), date: CareEventDateSchema })
      .strict(),
    asOf: instant,
    completedAt: instant,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const fail = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
    if (snapshot.application.date.precision !== 'exact') fail('application', 'The completed application must have an exact time');
    if (Date.parse(snapshot.completedAt) > Date.parse(snapshot.asOf)) fail('completedAt', 'Completion cannot be after the as-of time');
    const ids = snapshot.eventsUsed.map(reference => reference.eventId);
    if (new Set(ids).size !== ids.length) fail('eventsUsed', 'Event references must be unique');
    if (!snapshot.eventsUsed.some(reference => reference.eventId === snapshot.application.eventId)) {
      fail('eventsUsed', 'The snapshot must include its application');
    }
    const keys = snapshot.eventsUsed.map(referenceOrder);
    for (let index = 1; index < keys.length; index += 1) {
      if (keys[index - 1]! > keys[index]!) fail('eventsUsed', 'Event references must be in canonical order');
    }
  });

export const ProgrammeRecordSchema = z
  .object({
    enrolmentId: uuid,
    productId: uuid,
    productVersionId: uuid,
    /** Owner-safe product wording, shown only when the server supplies it. */
    productLabel: bounded200.optional(),
    ruleId: bounded200,
    ruleVersion: bounded200,
    rulePublication: RulePublicationSchema,
    startDate: ProgrammeStartDateSchema,
    selectedApplicationEventId: bounded400.optional(),
    status: z.enum(['active', 'completed', 'abandoned']),
    revision: expectedRevision,
    paused: z
      .object({ pausedAt: instant, reasonCode })
      .strict()
      .nullable(),
    resumed: z
      .object({ resumptionRuleId: bounded200, resumptionRuleVersion: bounded200, resumedAt: instant })
      .strict()
      .nullable(),
    maintenanceTransition: z
      .object({ ruleId: bounded200, ruleVersion: bounded200, transitionedAt: instant })
      .strict()
      .nullable(),
    completed: z.object({ snapshot: CompletedSnapshotSchema }).strict().nullable(),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
  .superRefine((record, context) => {
    const fail = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
    if ((record.status === 'completed') !== (record.completed !== null)) {
      fail('completed', 'A completed programme records its snapshot, and only a completed one does');
    }
    if (record.status === 'completed' && record.completed !== null) {
      if (record.completed.snapshot.enrolmentId !== record.enrolmentId) fail('completed', 'The snapshot belongs to this programme');
      if (record.completed.snapshot.productId !== record.productId) fail('completed', 'The snapshot belongs to this product');
      if (record.completed.snapshot.ruleId !== record.ruleId) fail('completed', 'The snapshot belongs to this rule');
    }
    if (record.status === 'abandoned' && record.completed !== null) fail('completed', 'A stopped programme has no snapshot');
  });
export type ProgrammeRecord = z.output<typeof ProgrammeRecordSchema>;

export const ProgrammeHistoryEntrySchema = z
  .object({
    sequence: z.number().int().positive().max(50),
    kind: z.enum(['enrol', 'change', 'pause', 'resume', 'maintenance', 'complete', 'abandon']),
    recordedAt: instant,
    occurredAt: instant.optional(),
    reasonCode: reasonCode.optional(),
    ruleId: bounded200.optional(),
    ruleVersion: bounded200.optional(),
    selectedApplicationEventId: bounded400.optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    const fail = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
    const has = (key: 'occurredAt' | 'reasonCode' | 'ruleId' | 'ruleVersion' | 'selectedApplicationEventId') =>
      entry[key] !== undefined;
    const none = (keys: readonly (keyof typeof entry)[]) => keys.every(key => entry[key as 'occurredAt'] === undefined);
    if (entry.kind === 'enrol') {
      if (entry.sequence !== 1) fail('sequence', 'An enrolment is the first event');
      if (!none(['occurredAt', 'reasonCode', 'ruleId', 'ruleVersion', 'selectedApplicationEventId'])) {
        fail('kind', 'An enrolment records no other fact');
      }
    }
    if (entry.kind === 'change' && !has('selectedApplicationEventId')) fail('selectedApplicationEventId', 'A change records the chosen application');
    if (entry.kind === 'change' && (has('occurredAt') || has('reasonCode') || has('ruleId') || has('ruleVersion'))) fail('kind', 'A change records nothing else');
    if (entry.kind === 'pause' && (!has('occurredAt') || !has('reasonCode'))) fail('reasonCode', 'A pause records when and why');
    if (entry.kind === 'pause' && (has('ruleId') || has('ruleVersion') || has('selectedApplicationEventId'))) fail('kind', 'A pause records nothing else');
    if ((entry.kind === 'resume' || entry.kind === 'maintenance') && (!has('occurredAt') || !has('ruleId') || !has('ruleVersion'))) {
      fail('ruleId', 'A resumption or transition records its reviewed rule');
    }
    if ((entry.kind === 'resume' || entry.kind === 'maintenance') && (has('reasonCode') || has('selectedApplicationEventId'))) {
      fail('kind', 'A resumption or transition records nothing else');
    }
    if (entry.kind === 'complete' && !has('occurredAt')) fail('occurredAt', 'A completion records when it happened');
    if (entry.kind === 'complete' && (has('reasonCode') || has('ruleId') || has('selectedApplicationEventId'))) fail('kind', 'A completion records nothing else');
    if (entry.kind === 'abandon') {
      if (entry.sequence < 2) fail('sequence', 'A programme is stopped after it is enrolled');
      if (!none(['occurredAt', 'reasonCode', 'ruleId', 'ruleVersion', 'selectedApplicationEventId'])) fail('kind', 'A stop records no other fact');
    }
  });
export type ProgrammeHistoryEntry = z.output<typeof ProgrammeHistoryEntrySchema>;

export const ProgrammeSummarySchema = ProgrammeRecordSchema.and(
  z.object({ evaluation: ProgrammeEvaluationSchema.nullable() }).strict(),
).superRefine((summary, context) => {
  if ((summary.status === 'abandoned') !== (summary.evaluation === null)) {
    context.addIssue({ code: 'custom', path: ['evaluation'], message: 'Only a live programme is evaluated' });
  }
});
export type ProgrammeSummary = z.output<typeof ProgrammeSummarySchema>;

export const ProgrammeDetailSchema = ProgrammeRecordSchema.and(
  z
    .object({ history: z.array(ProgrammeHistoryEntrySchema).min(1).max(50), evaluation: ProgrammeEvaluationSchema.nullable() })
    .strict(),
).superRefine((detail, context) => {
  const fail = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
  if ((detail.status === 'abandoned') !== (detail.evaluation === null)) fail('evaluation', 'Only a live programme is evaluated');
  if (detail.evaluation !== null && detail.evaluation.state === 'completed' && detail.completed === null) {
    fail('completed', 'A completed evaluation needs its recorded snapshot');
  }
  detail.history.forEach((entry, index) => {
    if (entry.sequence !== index + 1) fail('history', 'History sequences must be contiguous from one');
  });
  if (detail.history[0]?.kind !== 'enrol') fail('history', 'A history starts with the enrolment');
  for (const kind of ['pause', 'resume', 'maintenance', 'complete', 'abandon'] as const) {
    if (detail.history.filter(entry => entry.kind === kind).length > 1) fail('history', `A programme records ${kind} once`);
  }
  // Every head row moves the revision by exactly one, so the revision is the
  // number of recorded events.
  if (detail.revision !== detail.history.length) fail('revision', 'The revision must match the recorded history');
});
export type ProgrammeDetail = z.output<typeof ProgrammeDetailSchema>;

export const ProgrammePageSchema = z
  .object({ items: z.array(ProgrammeSummarySchema), nextCursor: ProgrammeCursorSchema.nullable() })
  .strict()
  .superRefine((page, context) => {
    if (page.nextCursor !== null && page.items.length === 0) {
      context.addIssue({ code: 'custom', path: ['nextCursor'], message: 'A page with nothing on it has no next page' });
    }
    const ids = page.items.map(item => item.enrolmentId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'A page lists each programme once' });
    }
  });
export type ProgrammePage = z.output<typeof ProgrammePageSchema>;

export type EnrolProgrammeCommand = z.input<typeof EnrolProgrammeCommandSchema>;
export type ChangeProgrammeCommand = z.input<typeof ProgrammeChangeCommandSchema>;
export type ListProgrammesQuery = z.input<typeof ListProgrammesQuerySchema>;

/** The four calls the state controller needs; injected so state stays network-free. */
export interface ProgrammeApi {
  readonly enrolProgramme: (command: unknown) => Promise<ProgrammeRecord>;
  readonly changeProgramme: (command: unknown) => Promise<ProgrammeRecord>;
  readonly listProgrammes: (query: unknown) => Promise<ProgrammePage>;
  readonly getProgramme: (enrolmentId: unknown) => Promise<ProgrammeDetail>;
}

// ---------------------------------------------------------------------------
// Boundary
// ---------------------------------------------------------------------------

function parseRequest<T extends z.ZodType>(
  schema: T,
  value: unknown,
  fallback: ProgrammeErrorCode,
): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ProgrammeError(fallback);
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
    return Object.freeze(value) as T;
  }
  return value;
}

/**
 * Call one RPC and parse its answer. A thrown transport failure or a database
 * error is mapped to stable copy; a payload that does not match the strict
 * schema is `malformed-response`. No server text, payload or identifier is
 * ever attached to the thrown error.
 */
async function callRpc<T>(name: string, args: Record<string, unknown>, parse: (data: unknown) => T): Promise<T> {
  if (!supabase) throw new ProgrammeError('unavailable');
  let response: { data: unknown; error: { message?: unknown } | null };
  try {
    response = await supabase.rpc(name, args);
  } catch (thrown) {
    throw new ProgrammeError(mapServerMessage(thrown instanceof Error ? thrown.message : undefined));
  }
  if (response.error) throw new ProgrammeError(mapServerMessage(response.error.message));
  try {
    return parse(response.data);
  } catch {
    throw new ProgrammeError('malformed-response');
  }
}

/**
 * Enrol against a reviewed programme the server has confirmed is available.
 * The server loads the publication binding itself; only the owner's chosen
 * product, version and start date travel.
 */
export async function enrolProgramme(command: unknown): Promise<ProgrammeRecord> {
  const parsed = parseRequest(EnrolProgrammeCommandSchema, command, 'malformed-request');
  return callRpc(
    'enrol_programme',
    {
      p_operation_id: parsed.operationId,
      p_product_id: parsed.offer.productId,
      p_product_version_id: parsed.offer.productVersionId,
      p_rule_id: parsed.offer.ruleId,
      p_rule_version: parsed.offer.ruleVersion,
      p_start_date: parsed.startDate,
      p_selected_application_event_id: parsed.selectedApplicationEventId ?? null,
    },
    data => deepFreeze(ProgrammeRecordSchema.parse(data)),
  );
}

/**
 * Pause, stop or complete a programme. The client requests the change; the
 * server decides whether it is allowed, applies the expected revision, and
 * builds the immutable completion snapshot itself.
 */
export async function changeProgramme(command: unknown): Promise<ProgrammeRecord> {
  const parsed = parseRequest(ProgrammeChangeCommandSchema, command, 'malformed-request');
  return callRpc(
    'change_programme',
    {
      p_operation_id: parsed.operationId,
      p_enrolment_id: parsed.enrolmentId,
      p_expected_revision: parsed.expectedRevision,
      p_command: parsed.command,
    },
    data => deepFreeze(ProgrammeRecordSchema.parse(data)),
  );
}

export async function listProgrammes(query: unknown): Promise<ProgrammePage> {
  const parsed = parseRequest(ListProgrammesQuerySchema, query, 'malformed-request');
  return callRpc('list_programmes', { p_limit: parsed.limit, p_cursor: parsed.cursor ?? null }, data => {
    const page = ProgrammePageSchema.parse(data);
    if (page.items.length > parsed.limit) throw new RangeError('page larger than requested');
    return deepFreeze(page);
  });
}

export async function getProgramme(enrolmentId: unknown): Promise<ProgrammeDetail> {
  const id = parseRequest(uuid, enrolmentId, 'malformed-request');
  return callRpc('get_programme', { p_enrolment_id: id }, data => {
    const detail = ProgrammeDetailSchema.parse(data);
    if (detail.enrolmentId !== id) throw new RangeError('detail for a different programme');
    return deepFreeze(detail);
  });
}

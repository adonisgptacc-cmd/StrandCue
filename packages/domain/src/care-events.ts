/**
 * Internal canonical care-event ledger (TR-01 groundwork, TL-03, TL-04).
 * It derives immutable, deterministic wash/application/heat events only from
 * confirmed execution steps and recorded activity histories. Plans, guidance,
 * skipped or deviated steps, Cue Checks, catalogue facts and free text never
 * become occurrences. Unknown facts and dates remain unknown.
 *
 * Activity projection supplies current corrected facts while the baseline
 * keeps occurrence identity and date stable. Owner and execution/run bindings
 * fail closed. This module is intentionally absent from the public barrel:
 * I5.4 must construct inputs through its authenticated owner-scoped server join.
 */

import { z } from 'zod';

import {
  ActivityRevisionSchema,
  ZoneSchema,
  projectActivityHistory,
  type Activity,
  type ActivityPrecision,
  type ActivityRevision,
} from './activity.ts';
import { DateOnlySchema, type EffectiveDate } from './dates.ts';
import { deepFreeze, frozen, nonEmptyString } from './guidance/schemas.ts';
import {
  ProtocolExecutionSchema,
  type ExecutionStep,
  type ProtocolExecution,
} from './protocol-execution.ts';
import {
  ToolAttachmentSchema,
  ToolHeatMethodSchema,
  ToolSettingTemperatureSchema,
  YesNoUnknownSchema,
} from './tools.ts';

// --- Kind, precision, provenance and lifecycle ------------------------------

export const CareEventKindSchema = z.enum(['wash', 'application', 'heat']);
export type CareEventKind = z.output<typeof CareEventKindSchema>;

/**
 * How exactly the recorded date is known. `exact` is a full offset-aware
 * instant, `day` a real calendar day, `approximate` a recorded month or year,
 * and `unknown` no date at all. A missing or low-precision date is never
 * widened and never defaulted to today.
 */
export const CareEventPrecisionSchema = z.enum(['exact', 'day', 'approximate', 'unknown']);
export type CareEventPrecision = z.output<typeof CareEventPrecisionSchema>;

export const CareEventProvenanceSchema = z.enum(['execution-confirmed', 'activity-recorded']);
export type CareEventProvenance = z.output<typeof CareEventProvenanceSchema>;

/**
 * `active` is a current fact; `corrected` is a fact a later correction to the
 * same occurrence replaced (kept for audit and recomputation); `voided` is a
 * fact the owner removed. A corrected or voided event is never active.
 */
export const CareEventLifecycleSchema = z.enum(['active', 'corrected', 'voided']);
export type CareEventLifecycle = z.output<typeof CareEventLifecycleSchema>;

// --- Recorded date ----------------------------------------------------------

const ApproximateDateSchema = z
  .string()
  .regex(/^[1-9]\d{3}(-(0[1-9]|1[0-2]))?$/, 'Expected a recorded year or year-month');

export const CareEventDateSchema = frozen(
  z.discriminatedUnion('precision', [
    z.object({ precision: z.literal('exact'), value: z.iso.datetime({ offset: true }) }).strict(),
    z.object({ precision: z.literal('day'), value: DateOnlySchema }).strict(),
    z.object({ precision: z.literal('approximate'), value: ApproximateDateSchema }).strict(),
    z.object({ precision: z.literal('unknown'), value: z.null() }).strict(),
  ]),
);
export type CareEventDate = z.output<typeof CareEventDateSchema>;

// --- Known / unknown facts --------------------------------------------------

/**
 * One recorded fact that is either known (with its exact value) or explicitly
 * unknown. There is no third state and no default: a fact the source did not
 * record is `unknown`, never a guess.
 */
export type CareKnownValue<T> =
  | { readonly state: 'known'; readonly value: T }
  | { readonly state: 'unknown' };

function knownValueSchema<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('known'), value }).strict(),
    z.object({ state: z.literal('unknown') }).strict(),
  ]);
}

const nonEmptyText = (max: number) => nonEmptyString.max(max);

export const CareLathersSchema = knownValueSchema(z.number().int().positive());
export const CarePassesSchema = knownValueSchema(z.number().int().nonnegative());
export const CareDurationMinutesSchema = knownValueSchema(z.number().int().nonnegative());
export const CareDurationBandSchema = knownValueSchema(nonEmptyText(60));
export const CareSettingSchema = knownValueSchema(nonEmptyText(60));
/** The exact temperature the owner read, in the unit they read it in. Nothing is converted. */
export const CareTemperatureSchema = knownValueSchema(ToolSettingTemperatureSchema);
export const CareAttachmentSchema = knownValueSchema(ToolAttachmentSchema);
export const CareHeatMethodSchema = knownValueSchema(ToolHeatMethodSchema);
export const CareToolIdentitySchema = knownValueSchema(
  z.object({ toolId: nonEmptyString, toolVersionId: nonEmptyString }).strict(),
);

/**
 * The recorded product identity for an event, or a stable unknown when the
 * identity is absent or unverified (`identity: 'unknown'` covers both, exactly
 * as the specification requires; a partially-recorded id is unverified).
 */
export const CareProductIdentitySchema = frozen(
  z.discriminatedUnion('identity', [
    z
      .object({
        identity: z.literal('known'),
        productId: nonEmptyString,
        productVersionId: nonEmptyString,
      })
      .strict(),
    z.object({ identity: z.literal('unknown') }).strict(),
  ]),
);
export type CareProductIdentity = z.output<typeof CareProductIdentitySchema>;

const CareZonesSchema = z.array(ZoneSchema.strict()).max(36);

// --- Kind-specific facts ----------------------------------------------------

/**
 * What a confirmed wash proves, each fact on its own: a wash occurred (the
 * event itself), whether shampoo was used, the count of confirmed
 * shampoo/lather actions when the source records them, the recorded product
 * identity or a stable unknown, and any recorded zones. Two lathers in one
 * wash remain two recorded facts here; this module does not decide the
 * wash-counting rule (I5.2).
 */
export const CareWashFactsSchema = frozen(
  z
    .object({
      shampooUsed: YesNoUnknownSchema,
      lathers: CareLathersSchema,
      product: CareProductIdentitySchema,
      zones: CareZonesSchema,
    })
    .strict(),
);
export type CareWashFacts = z.output<typeof CareWashFactsSchema>;

/** What a confirmed application proves: the product identity (or unknown) and any recorded zones. */
export const CareApplicationFactsSchema = frozen(
  z
    .object({
      product: CareProductIdentitySchema,
      zones: CareZonesSchema,
    })
    .strict(),
);
export type CareApplicationFacts = z.output<typeof CareApplicationFactsSchema>;

/**
 * Independently recorded heat values. Wattage, a model name, a tool category,
 * an attachment or a heat method never imply a temperature: `temperature` is
 * its own fact and stays exactly as recorded, so an unknown temperature stays
 * unknown.
 */
const heatFactShape = {
  method: CareHeatMethodSchema,
  temperature: CareTemperatureSchema,
  setting: CareSettingSchema,
  passes: CarePassesSchema,
  durationMinutes: CareDurationMinutesSchema,
  durationBand: CareDurationBandSchema,
  zones: CareZonesSchema,
  attachment: CareAttachmentSchema,
} as const;

export const CareHeatFactsSchema = frozen(
  z.object({ toolIdentity: CareToolIdentitySchema, ...heatFactShape }).strict(),
);
export type CareHeatFacts = z.output<typeof CareHeatFactsSchema>;

// --- The event --------------------------------------------------------------

const CareEventSourceRefSchema = z
  .object({
    /** The execution id or activity id the event derives from. */
    recordId: nonEmptyString,
    /** The activity revision sequence, when the provenance is an activity. */
    revision: z.number().int().positive().nullable(),
    /** The confirmed execution step identity, when the provenance is an execution. */
    stepId: nonEmptyString.nullable(),
    position: z.number().int().positive().nullable(),
    /** The immutable recommendation run id, when the provenance is an execution. */
    runId: nonEmptyString.nullable(),
  })
  .strict();
export type CareEventSourceRef = z.output<typeof CareEventSourceRefSchema>;

const careEventBaseShape = {
  /** A stable identity derived only from the trusted source identity. */
  eventId: nonEmptyString,
  date: CareEventDateSchema,
  provenance: CareEventProvenanceSchema,
  lifecycle: CareEventLifecycleSchema,
  source: CareEventSourceRefSchema,
} as const;

const CareEventUnionSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('wash'), ...careEventBaseShape, wash: CareWashFactsSchema }).strict(),
    z
      .object({ kind: z.literal('application'), ...careEventBaseShape, application: CareApplicationFactsSchema })
      .strict(),
    z.object({ kind: z.literal('heat'), ...careEventBaseShape, heat: CareHeatFactsSchema }).strict(),
  ])
  .superRefine((event, context) => {
    // The source reference is provenance-conditional: an execution event names
    // its step, position and run and carries no activity revision; an activity
    // event names its revision and carries no execution step facts. An
    // execution fact is always active (only an owner activity can be corrected
    // or voided), and the date precision belongs to the provenance.
    if (event.provenance === 'execution-confirmed') {
      if (event.source.revision !== null) {
        context.addIssue({
          code: 'custom',
          path: ['source', 'revision'],
          message: 'An execution-confirmed event carries no activity revision',
        });
      }
      if (event.source.stepId === null || event.source.position === null || event.source.runId === null) {
        context.addIssue({
          code: 'custom',
          path: ['source'],
          message: 'An execution-confirmed event names its step, position and run',
        });
      }
      if (event.lifecycle !== 'active') {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle'],
          message: 'A confirmed execution fact is always active',
        });
      }
      if (event.date.precision !== 'exact' && event.date.precision !== 'unknown') {
        context.addIssue({
          code: 'custom',
          path: ['date', 'precision'],
          message: 'An execution-confirmed event records an exact instant or an unknown date',
        });
      }
    } else {
      if (event.source.revision === null) {
        context.addIssue({
          code: 'custom',
          path: ['source', 'revision'],
          message: 'An activity-recorded event names its revision',
        });
      }
      if (event.source.stepId !== null || event.source.position !== null || event.source.runId !== null) {
        context.addIssue({
          code: 'custom',
          path: ['source'],
          message: 'An activity-recorded event carries no execution step facts',
        });
      }
      if (event.date.precision === 'exact') {
        context.addIssue({
          code: 'custom',
          path: ['date', 'precision'],
          message: 'An activity-recorded event records a calendar precision, never an instant',
        });
      }
    }
  });

export const CareEventSchema = frozen(CareEventUnionSchema);
export type CareEvent = z.output<typeof CareEventSchema>;

// --- Trusted sources --------------------------------------------------------

/**
 * The care kind of one execution step, recorded by the trusted writer. Kept
 * apart from the free-form plan action: this module never infers the kind.
 * Heat facts are only ever the values the source records.
 */
export const StepCareClassificationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('none'),
    stepId: nonEmptyString,
    executionId: nonEmptyString,
    recommendationRunId: nonEmptyString,
  }).strict(),
  z
    .object({
      kind: z.literal('wash'),
      stepId: nonEmptyString,
      executionId: nonEmptyString,
      recommendationRunId: nonEmptyString,
      shampooUsed: YesNoUnknownSchema,
      lathers: CareLathersSchema,
      zones: CareZonesSchema,
    })
    .strict(),
  z.object({
    kind: z.literal('application'),
    stepId: nonEmptyString,
    executionId: nonEmptyString,
    recommendationRunId: nonEmptyString,
    zones: CareZonesSchema,
  }).strict(),
  z
    .object({
      kind: z.literal('heat'),
      stepId: nonEmptyString,
      executionId: nonEmptyString,
      recommendationRunId: nonEmptyString,
      heat: z.object(heatFactShape).strict(),
    })
    .strict(),
]);
export type StepCareClassification = z.output<typeof StepCareClassificationSchema>;
type CareEventClassification = Exclude<StepCareClassification, { readonly kind: 'none' }>;

/**
 * One trusted source. An execution source reuses the whole protocol-execution
 * contract so only a `confirmed` step can ever become an event. An activity
 * source is one activity's append-only revision
 * history.
 *
 * Strict throughout: any key this module does not model - a reviewer, an
 * evidence id or client payload field - is refused rather than silently stripped.
 */
export const CareEventSourceSchema = frozen(
  z.discriminatedUnion('provenance', [
    z
      .object({
        provenance: z.literal('execution-confirmed'),
        ownerId: z.string().uuid(),
        execution: ProtocolExecutionSchema,
        care: z.array(StepCareClassificationSchema).max(200),
      })
      .strict(),
    z
      .object({
        provenance: z.literal('activity-recorded'),
        ownerId: z.string().uuid(),
        revisions: z.array(ActivityRevisionSchema).min(1).max(200),
      })
      .strict(),
  ]),
);
export type CareEventSource = z.output<typeof CareEventSourceSchema>;

/** The derivation input: a flat list of trusted sources. */
export const CareEventDerivationInputSchema = frozen(z.array(CareEventSourceSchema).max(200));
export type CareEventDerivationInput = z.output<typeof CareEventDerivationInputSchema>;

export type CareEventErrorCode =
  | 'duplicate-classification'
  | 'unknown-step'
  | 'classification-binding-mismatch'
  | 'owner-mismatch'
  | 'source-too-large'
  | 'unclassified-actual-use'
  | 'duplicate-source'
  | 'ambiguous-activity-fact';

export class CareEventError extends Error {
  readonly code: CareEventErrorCode;

  constructor(code: CareEventErrorCode, message: string) {
    super(message);
    this.name = 'CareEventError';
    this.code = code;
  }
}

// --- Event identity ---------------------------------------------------------

/**
 * A collision-safe identity: every part is length-prefixed, so two different
 * part lists can never compose the same string even if a part contains the
 * separator.
 */
function composeEventId(parts: readonly string[]): string {
  return parts.map(part => `${part.length}:${part}`).join(':');
}

// --- Execution-confirmed events ---------------------------------------------

function productIdentity(source: {
  readonly productId: string | null;
  readonly productVersionId: string | null;
}): CareProductIdentity {
  if (source.productId !== null && source.productVersionId !== null) {
    return { identity: 'known', productId: source.productId, productVersionId: source.productVersionId };
  }
  return { identity: 'unknown' };
}

const UNKNOWN_TOOL_IDENTITY: CareKnownValue<{ toolId: string; toolVersionId: string }> = { state: 'unknown' };

function toolIdentity(toolId: string | null, toolVersionId: string | null): CareToolIdentityValue {
  if (toolId !== null && toolVersionId !== null) {
    return { state: 'known', value: { toolId, toolVersionId } };
  }
  return UNKNOWN_TOOL_IDENTITY;
}

type CareToolIdentityValue = CareKnownValue<{ toolId: string; toolVersionId: string }>;

function buildStepEvent(args: {
  readonly execution: ProtocolExecution;
  readonly step: ExecutionStep;
  readonly classification: CareEventClassification;
  readonly product: CareProductIdentity;
  readonly toolIdentity: CareToolIdentityValue;
  readonly date: CareEventDate;
}): CareEvent {
  const { execution, step, classification, product, toolIdentity: tool, date } = args;
  const source: CareEventSourceRef = {
    recordId: execution.executionId,
    revision: null,
    stepId: step.stepId,
    position: step.position,
    runId: execution.recommendationRunId,
  };
  const eventId = composeEventId(['execution-confirmed', execution.executionId, step.stepId]);
  const base = {
    eventId,
    date,
    provenance: 'execution-confirmed' as const,
    lifecycle: 'active' as const,
    source,
  };

  switch (classification.kind) {
    case 'wash':
      return CareEventSchema.parse({
        kind: 'wash',
        ...base,
        wash: {
          shampooUsed: classification.shampooUsed,
          lathers: classification.lathers,
          product,
          zones: classification.zones,
        },
      });
    case 'application':
      return CareEventSchema.parse({
        kind: 'application',
        ...base,
        application: { product, zones: classification.zones },
      });
    case 'heat':
      return CareEventSchema.parse({
        kind: 'heat',
        ...base,
        heat: { toolIdentity: tool, ...classification.heat },
      });
  }
}

function executionCareEvents(source: {
  readonly execution: ProtocolExecution;
  readonly care: readonly StepCareClassification[];
}): CareEvent[] {
  if (source.execution.steps.length > 200) {
    throw new CareEventError('source-too-large', 'An execution has too many steps to derive safely');
  }
  const byStepId = new Map<string, StepCareClassification>();
  for (const entry of source.care) {
    if (
      entry.executionId !== source.execution.executionId ||
      entry.recommendationRunId !== source.execution.recommendationRunId
    ) {
      throw new CareEventError(
        'classification-binding-mismatch',
        'A care classification is not bound to this execution and recommendation run',
      );
    }
    if (byStepId.has(entry.stepId)) {
      throw new CareEventError(
        'duplicate-classification',
        'A step carries more than one care classification',
      );
    }
    byStepId.set(entry.stepId, entry);
  }
  const knownStepIds = new Set(source.execution.steps.map(step => step.stepId));
  for (const entry of source.care) {
    if (!knownStepIds.has(entry.stepId)) {
      throw new CareEventError('unknown-step', 'A classification names a step the execution does not have');
    }
  }

  const ordered = [...source.execution.steps].sort((left, right) => left.position - right.position);
  const events: CareEvent[] = [];
  for (const step of ordered) {
    // The execution contract defines only `confirmed` as an occurrence.
    // Pending, skipped, substituted and modified states are plan/deviation
    // history and never prove that care actually happened.
    if (step.state !== 'confirmed' || step.confirmedAt === null) continue;

    const classification = byStepId.get(step.stepId);
    if (classification === undefined) {
      // A step that records an actual use without a trusted classification
      // could undercount care events, so this fails closed instead of
      // silently discarding it.
      throw new CareEventError(
        'unclassified-actual-use',
        'A confirmed step carries no trusted care classification',
      );
    }
    if (classification.kind === 'none') continue;

    events.push(
      buildStepEvent({
        execution: source.execution,
        step,
        classification,
        product: productIdentity({
          productId: step.planned.productId,
          productVersionId: step.planned.productVersionId,
        }),
        toolIdentity: toolIdentity(step.planned.toolId, step.planned.toolVersionId),
        date: { precision: 'exact', value: step.confirmedAt },
      }),
    );
  }
  return events;
}

// --- Activity-recorded events -----------------------------------------------

/**
 * A fixed instant after every recordable fact. Used only to ask the activity
 * projection to validate a history: the projection date never becomes an event
 * date and is never the wall clock.
 */
const ACTIVITY_PROJECTION_AS_OF = '9999-12-31';

function assertCoherentActivityHistory(revisions: readonly ActivityRevision[]): void {
  // Reuse the activity projection's own coherence rules - one baseline,
  // contiguous sequences, valid correction targets, no cycles, and a baseline
  // correction that stays complete - so an incoherent history fails closed
  // here exactly as it does there, rather than duplicating the checks. Only the
  // validation result is used; its projection date is discarded.
  projectActivityHistory(revisions, { asOf: ACTIVITY_PROJECTION_AS_OF });
}

/**
 * The recorded date of an activity event. The patch's own `precision` decides
 * the output precision (so an exact month is never widened to a day), and the
 * effective date supplies the value, coarsened to match. An unknown precision
 * on either side stays unknown.
 */
function careEventDate(effectiveDate: EffectiveDate, precision: ActivityPrecision): CareEventDate {
  if (precision === 'unknown' || effectiveDate.precision === 'unknown') {
    return { precision: 'unknown', value: null };
  }
  const year = effectiveDate.value.slice(0, 4);
  const month =
    effectiveDate.precision === 'month'
      ? effectiveDate.value
      : effectiveDate.precision === 'day'
        ? effectiveDate.value.slice(0, 7)
        : null;
  if (precision === 'exact_day' && effectiveDate.precision === 'day') {
    return { precision: 'day', value: effectiveDate.value };
  }
  if (precision === 'exact_year') {
    return { precision: 'approximate', value: year };
  }
  return { precision: 'approximate', value: month ?? year };
}

function activityWashEvent(args: {
  readonly activityId: string;
  readonly sequence: number;
  readonly date: CareEventDate;
  readonly zones: Activity['zones'];
}): CareEvent {
  return CareEventSchema.parse({
    kind: 'wash',
    eventId: composeEventId(['activity-recorded', args.activityId]),
    date: args.date,
    provenance: 'activity-recorded',
    lifecycle: 'active',
    source: {
      recordId: args.activityId,
      revision: args.sequence,
      stepId: null,
      position: null,
      runId: null,
    },
    // An activity records that a wash happened; it never records shampoo use,
    // a lather count or a product identity, so those stay unknown.
    wash: {
      shampooUsed: 'unknown',
      lathers: { state: 'unknown' },
      product: { identity: 'unknown' },
      zones: args.zones,
    },
  });
}

/**
 * The facts this ledger reads from an activity. A field the projection cannot
 * resolve (an overlapping effective interval with a different value) fails
 * closed rather than being silently dropped.
 */
const ACTIVITY_FIELDS_READ = ['activityKind', 'precision', 'status', 'zones'] as const;

function activityCareEvents(source: { readonly revisions: readonly ActivityRevision[] }): CareEvent[] {
  const revisions = source.revisions;
  assertCoherentActivityHistory(revisions);
  const sorted = [...revisions].sort((left, right) => left.sequence - right.sequence);
  const activityId = (sorted[0] as ActivityRevision).activityId;
  // Facts are read through the canonical activity projection, so per-field
  // precedence matches every other reader. No projection ever includes a void
  // revision, so a voided activity still yields the facts that were voided.
  const firstVoid = sorted.find(revision => revision.kind === 'void');
  const maxFactCutoff = firstVoid === undefined ? Number.POSITIVE_INFINITY : firstVoid.sequence - 1;
  const factsAt = (cutoff: number): Partial<Activity> => {
    const scope = sorted.filter(revision => revision.sequence <= Math.min(cutoff, maxFactCutoff));
    const projection = projectActivityHistory(scope, { asOf: ACTIVITY_PROJECTION_AS_OF });
    const values: Partial<Activity> = { ...projection.values };
    for (const field of ACTIVITY_FIELDS_READ) {
      const ambiguity = projection.ambiguousFields[field];
      if (ambiguity === undefined) continue;

      // An unknown effective date makes the general activity projector unsure
      // whether a recorded fact applies *as of* any particular day.  The care
      // ledger is not an as-of snapshot: it preserves the occurrence and its
      // unknown date.  A single recorded value (or several identical values)
      // is therefore usable without upgrading the date.  Conflicting values
      // and overlapping intervals still fail closed.
      const first = ambiguity.candidates[0];
      const carriesOneRecordedValue =
        ambiguity.reason === 'uncertain-as-of' &&
        first !== undefined &&
        ambiguity.candidates.every(candidate => JSON.stringify(candidate.value) === JSON.stringify(first.value));
      if (!carriesOneRecordedValue) {
        throw new CareEventError(
          'ambiguous-activity-fact',
          `The activity's recorded ${field} is ambiguous and cannot become a care event`,
        );
      }
      values[field] = first.value as never;
    }
    if (values.activityKind === undefined) {
      throw new CareEventError('ambiguous-activity-fact', "The activity's effective kind is unknown");
    }
    return values;
  };

  const events: CareEvent[] = [];

  // Corrected facts are audit history rather than additional occurrences.
  // A voided activity is likewise absent from the active canonical ledger.
  const effectiveRevision = sorted[sorted.length - 1] as ActivityRevision;
  const merged = factsAt(Number.POSITIVE_INFINITY);
  if (firstVoid === undefined && merged.status !== 'voided' && merged.activityKind === 'wash') {
    const baseline = sorted[0] as ActivityRevision;
    events.push(
      activityWashEvent({
        activityId,
        sequence: effectiveRevision.sequence,
        // Later corrections may refine facts but never move or re-identify the
        // recorded occurrence. Its date and identity come from the baseline.
        date: careEventDate(baseline.effectiveDate, merged.precision ?? 'unknown'),
        zones: merged.zones ?? [],
      }),
    );
  }

  return events;
}

// --- Deterministic ordering -------------------------------------------------

function dateOrderValue(date: CareEventDate): number | null {
  switch (date.precision) {
    case 'exact':
      return Date.parse(date.value);
    case 'day':
      return Date.parse(`${date.value}T00:00:00.000Z`);
    case 'approximate':
      return Date.parse(
        date.value.length === 7 ? `${date.value}-01T00:00:00.000Z` : `${date.value}-01-01T00:00:00.000Z`,
      );
    case 'unknown':
      return null;
  }
}

/**
 * Canonical order: by the recorded date where one is known (unknown last),
 * then by the stable event identity. The tie-break is an explicit source key,
 * so any input array or object order yields byte-identical output.
 */
export function compareCareEvents(left: CareEvent, right: CareEvent): number {
  const leftValue = dateOrderValue(left.date);
  const rightValue = dateOrderValue(right.date);
  if (leftValue === null && rightValue !== null) return 1;
  if (leftValue !== null && rightValue === null) return -1;
  if (leftValue !== null && rightValue !== null && leftValue !== rightValue) {
    return leftValue < rightValue ? -1 : 1;
  }
  if (left.eventId === right.eventId) return 0;
  return left.eventId < right.eventId ? -1 : 1;
}

// --- Derivation -------------------------------------------------------------

function sourceRecordId(source: CareEventSource): string {
  return source.provenance === 'execution-confirmed'
    ? source.execution.executionId
    : (source.revisions[0] as ActivityRevision).activityId;
}

/**
 * Derive the canonical care events from trusted sources. Pure: never mutates
 * its input, returns a new frozen array of new frozen events, and uses no
 * wall-clock value for dating or ordering. Fails closed on a malformed,
 * duplicated or unclassifiable source.
 *
 * @internal `expectedOwnerId` comes from the authenticated request context.
 * Only the I5.4 owner-scoped server adapter may construct `sources`.
 */
export function deriveCareEvents(sources: unknown, expectedOwnerId: unknown): readonly CareEvent[] {
  if (Array.isArray(sources)) {
    for (const source of sources) {
      if (
        typeof source === 'object' && source !== null &&
        'execution' in source &&
        typeof source.execution === 'object' && source.execution !== null &&
        'steps' in source.execution &&
        Array.isArray(source.execution.steps) &&
        source.execution.steps.length > 200
      ) {
        throw new CareEventError('source-too-large', 'An execution has too many steps to derive safely');
      }
    }
  }
  const ownerId = z.string().uuid().parse(expectedOwnerId);
  const parsed = CareEventDerivationInputSchema.parse(sources);
  const ownerIds = new Set(parsed.map(source => source.ownerId));
  if (ownerIds.size > 1 || [...ownerIds].some(sourceOwnerId => sourceOwnerId !== ownerId)) {
    throw new CareEventError('owner-mismatch', 'Care-event sources must belong to one owner');
  }

  // Two sources that share one record identity must derive the same events; two
  // different partial views of one activity, or of one execution, would
  // otherwise become two events and overcount. The fingerprint is the derived
  // events, so a reordered `care` or `revisions` array is not a difference.
  const fingerprints = new Map<string, string>();
  const collected: CareEvent[] = [];
  for (const source of parsed) {
    const recordId = sourceRecordId(source);
    const key = `${source.provenance}\u0000${recordId}`;
    const events = source.provenance === 'execution-confirmed'
      ? executionCareEvents(source)
      : activityCareEvents(source);
    const fingerprint = JSON.stringify([...events].sort(compareCareEvents));
    const previous = fingerprints.get(key);
    if (previous === undefined) {
      fingerprints.set(key, fingerprint);
    } else if (previous !== fingerprint) {
      throw new CareEventError(
        'duplicate-source',
        'Two different sources share one record identity',
      );
    }
    collected.push(...events);
  }

  // A shared identity can only ever carry identical events (any divergence is
  // refused above), so collapsing duplicates is a plain idempotency step.
  const byId = new Map<string, CareEvent>();
  for (const event of collected) {
    if (!byId.has(event.eventId)) byId.set(event.eventId, event);
  }

  const ordered = [...byId.values()].sort(compareCareEvents);
  return deepFreeze(ordered);
}

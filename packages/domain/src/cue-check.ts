/**
 * Private Cue Check observation contracts (CC-01..CC-03, P-04, P-07, P-09,
 * P-10, SF-04).
 *
 * A Cue Check is one owner's cosmetic self-report about their own experience
 * of a single confirmed protocol execution. It is an observation, never a
 * claim: nothing here may be phrased or interpreted as diagnosis, treatment,
 * repair, growth, causation, proof or a guaranteed outcome, and the optional
 * note is stored exactly as recorded and never interpreted, derived from or
 * diagnosed.
 *
 * Most answers are optional and unknown-aware (CC-02, P-04): a missing answer
 * stays missing and an explicit `unknown` stays unknown. Neither is ever
 * converted into a negative answer.
 *
 * History is append-only (P-07): a correction appends a new revision and a
 * void appends an audit event. Nothing rewrites a recorded observation.
 */

import { z } from 'zod';

import { frozen, GuidanceGoalIdSchema, nonEmptyString } from './guidance/schemas.ts';

/** When the owner recorded the observation relative to the execution. */
export const CueCheckTimingSchema = z.enum(['immediate', 'delayed']);
export type CueCheckTiming = z.output<typeof CueCheckTimingSchema>;

/** Lifecycle of one recorded observation row. */
export const CueCheckLifecycleSchema = z.enum(['active', 'corrected', 'voided']);
export type CueCheckLifecycle = z.output<typeof CueCheckLifecycleSchema>;

/** Goal under pursuit; mirrors the guidance goal vocabulary exactly. */
export const CueCheckGoalSchema = GuidanceGoalIdSchema;
export type CueCheckGoal = z.output<typeof CueCheckGoalSchema>;

/**
 * Offset-aware instant, shared everywhere a Cue Check records a time: the
 * owner-observed moment and the server receipt moment both carry an explicit
 * offset and are never widened or defaulted.
 */
export const CueCheckTimestampSchema = z.iso.datetime({ offset: true });

/**
 * Comparative direction for the hair-feel answers: how this use felt compared
 * with what the owner usually experiences. `unknown` is an explicit answer, not
 * a missing one.
 */
export const CueCheckComparativeSchema = z.enum(['less', 'same', 'more', 'unknown']);

/** Overall result compared with a usual result. */
export const CueCheckOverallResultSchema = z.enum(['better', 'same', 'worse', 'unknown']);

/** How satisfied the owner felt about this use. */
export const CueCheckSatisfactionSchema = z.enum(['satisfied', 'neutral', 'dissatisfied', 'unknown']);

/** How long the style lasted compared with usual; only observable later. */
export const CueCheckStyleLongevitySchema = z.enum(['shorter', 'similar', 'longer', 'unknown']);

/**
 * Reaction noticed right after use. An observation report only: it is never a
 * diagnosis or a severity assessment, and it never becomes global evidence.
 */
export const CueCheckImmediateReactionSchema = z.enum(['none-noticed', 'some-noticed', 'unknown']);

/** Whether the owner would use this routine again. */
export const CueCheckWouldUseAgainSchema = z.enum(['yes', 'no', 'unsure', 'unknown']);

/** Canonical observation-field order; summaries and exports follow it. */
export const CUE_CHECK_OBSERVATION_FIELDS = [
  'overallResult',
  'satisfaction',
  'dryness',
  'frizz',
  'softness',
  'tangling',
  'buildup',
  'breakage',
  'styleLongevity',
  'immediateReaction',
  'wouldUseAgain',
] as const;

export type CueCheckObservationField = (typeof CUE_CHECK_OBSERVATION_FIELDS)[number];

export const CueCheckObservationFieldSchema = z.enum(CUE_CHECK_OBSERVATION_FIELDS);

/** The structured-answer schema for each observation field, keyed by field. */
export const CueCheckOutcomeFieldSchemas = {
  overallResult: CueCheckOverallResultSchema,
  satisfaction: CueCheckSatisfactionSchema,
  dryness: CueCheckComparativeSchema,
  frizz: CueCheckComparativeSchema,
  softness: CueCheckComparativeSchema,
  tangling: CueCheckComparativeSchema,
  buildup: CueCheckComparativeSchema,
  breakage: CueCheckComparativeSchema,
  styleLongevity: CueCheckStyleLongevitySchema,
  immediateReaction: CueCheckImmediateReactionSchema,
  wouldUseAgain: CueCheckWouldUseAgainSchema,
} as const;

/**
 * Every definite structured answer a summary may count, across all fields.
 * `unknown` is deliberately absent: it never joins a comparable denominator.
 */
export const CueCheckDefiniteValueSchema = z.enum([
  'better',
  'same',
  'worse',
  'satisfied',
  'neutral',
  'dissatisfied',
  'less',
  'more',
  'shorter',
  'similar',
  'longer',
  'none-noticed',
  'some-noticed',
  'yes',
  'no',
  'unsure',
]);
export type CueCheckDefiniteValue = z.output<typeof CueCheckDefiniteValueSchema>;

/**
 * Owner note, bounded and preserved exactly as recorded: never trimmed,
 * interpreted, diagnosed or summarized into facts.
 */
const CueCheckNotesSchema = z.string().max(2000).optional();

/**
 * Structured answer fields derived from the canonical field list and its
 * schemas, so the list, the value schemas and the input/record shapes cannot
 * drift apart: a field added to the list gains its shape here automatically,
 * and a field nobody lists can no longer be accepted silently.
 */
const observationAnswers = Object.fromEntries(
  CUE_CHECK_OBSERVATION_FIELDS.map(field => [field, CueCheckOutcomeFieldSchemas[field].optional()]),
) as { readonly [K in CueCheckObservationField]: z.ZodOptional<(typeof CueCheckOutcomeFieldSchemas)[K]> };

/** Answers shared by the owner input and the stored record projection. */
const observationShape = {
  timing: CueCheckTimingSchema,
  observedAt: CueCheckTimestampSchema,
  ...observationAnswers,
  notes: CueCheckNotesSchema,
} as const;

/**
 * Cross-field answer rules shared by the input and the record projection:
 * an observation must record something, and style longevity — which can only
 * be noticed after time has passed — cannot appear on an immediate check.
 */
function refineObservationAnswers(
  observation: { timing: CueCheckTiming; styleLongevity?: unknown; notes?: unknown },
  context: z.RefinementCtx,
): void {
  const hasAnswer = CUE_CHECK_OBSERVATION_FIELDS.some(
    field => (observation as unknown as Record<string, unknown>)[field] !== undefined,
  );
  const hasNote = typeof observation.notes === 'string' && observation.notes.length > 0;
  if (!hasAnswer && !hasNote) {
    context.addIssue({
      code: 'custom',
      path: [],
      message: 'A Cue Check must record at least one answer or a note',
    });
  }
  if (observation.styleLongevity !== undefined && observation.timing === 'immediate') {
    context.addIssue({
      code: 'custom',
      path: ['styleLongevity'],
      message: 'Style longevity can only be recorded on a delayed Cue Check',
    });
  }
  // Deliberately asymmetric: a delayed check may still report the reaction
  // noticed right after use, because the owner answers about that earlier
  // moment; style longevity is the only answer bound to delayed timing.
}

/** The owner-supplied observation content of one Cue Check. */
export const CueCheckInputSchema = frozen(
  z.object(observationShape).strict().superRefine(refineObservationAnswers),
);
export type CueCheckInput = z.output<typeof CueCheckInputSchema>;

/**
 * One stored Cue Check row as projected to its owner: identity, the exact
 * authoritative execution and recommendation run it binds to, the comparable
 * goal context, the append-only revision state and the preserved answers.
 * The server derives every binding; a client never supplies them as facts.
 */
export const CueCheckRecordSchema = frozen(
  z
    .object({
      recordId: z.string().uuid(),
      executionId: nonEmptyString,
      recommendationRunId: nonEmptyString,
      goal: CueCheckGoalSchema,
      revision: z.number().int().positive(),
      lifecycle: CueCheckLifecycleSchema,
      ...observationShape,
    })
    .strict()
    .superRefine(refineObservationAnswers),
);
export type CueCheckRecord = z.output<typeof CueCheckRecordSchema>;

export const CueCheckRevisionKindSchema = z.enum(['create', 'correct', 'void']);
export type CueCheckRevisionKind = z.output<typeof CueCheckRevisionKindSchema>;

const trimmedReason = z.string().trim().min(1).max(500);

/** A correction or void appends after the first revision; it can never be it. */
function refineFollowsFirstRevision(
  revision: { sequence: number },
  context: z.RefinementCtx,
): void {
  if (revision.sequence < 2) {
    context.addIssue({
      code: 'custom',
      path: ['sequence'],
      message: 'A correction or void follows the first revision of a Cue Check',
    });
  }
}

/**
 * A revision cannot carry an observation its receipt predates. This is
 * clock-free internal consistency, unlike the input path's injected-clock
 * future check.
 */
function refineObservationNotAfterReceipt(
  revision: { observation: { observedAt: string }; receivedAt: string },
  context: z.RefinementCtx,
): void {
  if (Date.parse(revision.observation.observedAt) > Date.parse(revision.receivedAt)) {
    context.addIssue({
      code: 'custom',
      path: ['observation', 'observedAt'],
      message: 'A Cue Check observation must not be observed after the revision was received',
    });
  }
}

const revisionBaseShape = {
  revisionId: z.string().uuid(),
  recordId: z.string().uuid(),
  sequence: z.number().int().positive(),
  // Server receipt time, stored separately from the owner-observed time.
  receivedAt: CueCheckTimestampSchema,
} as const;

const CueCheckCreateRevisionSchema = z
  .object({ ...revisionBaseShape, kind: z.literal('create'), observation: CueCheckInputSchema })
  .strict()
  .superRefine((revision, context) => {
    if (revision.sequence !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['sequence'],
        message: 'A create revision is the first revision of a Cue Check',
      });
    }
    refineObservationNotAfterReceipt(revision, context);
  });

const CueCheckCorrectRevisionSchema = z
  .object({
    ...revisionBaseShape,
    kind: z.literal('correct'),
    observation: CueCheckInputSchema,
    correctsRevisionId: z.string().uuid(),
    correctionReason: trimmedReason,
  })
  .strict()
  .superRefine(refineFollowsFirstRevision)
  .superRefine((revision, context) => {
    if (revision.correctsRevisionId === revision.revisionId) {
      context.addIssue({
        code: 'custom',
        path: ['correctsRevisionId'],
        message: 'A correction cannot target itself',
      });
    }
    refineObservationNotAfterReceipt(revision, context);
  });

/** A void appends an audit event; it never carries or rewrites answers. */
const CueCheckVoidRevisionSchema = z
  .object({ ...revisionBaseShape, kind: z.literal('void'), voidReason: trimmedReason })
  .strict()
  .superRefine(refineFollowsFirstRevision);

export const CueCheckRevisionSchema = frozen(
  z.discriminatedUnion('kind', [
    CueCheckCreateRevisionSchema,
    CueCheckCorrectRevisionSchema,
    CueCheckVoidRevisionSchema,
  ]),
);
export type CueCheckRevision = z.output<typeof CueCheckRevisionSchema>;

/**
 * One record's append-only revision history as a coherent whole: one record
 * identity, each revision identity exactly once, exactly one create,
 * contiguous sequences from one, and corrections that target an existing
 * earlier revision at most once. Mirrors the activity-history checks so an
 * incoherent history cannot pass a domain boundary.
 */
export const CueCheckHistorySchema = frozen(
  z
    .array(CueCheckRevisionSchema)
    .min(1)
    .superRefine((revisions, context) => {
      const recordIds = new Set(revisions.map(revision => revision.recordId));
      if (recordIds.size > 1) {
        context.addIssue({
          code: 'custom',
          path: [],
          message: 'A Cue Check history carries one record identity',
        });
      }
      const revisionIds = revisions.map(revision => revision.revisionId);
      if (new Set(revisionIds).size !== revisionIds.length) {
        context.addIssue({
          code: 'custom',
          path: [],
          message: 'A Cue Check history carries each revision identity exactly once',
        });
      }
      const creates = revisions.filter(revision => revision.kind === 'create');
      if (creates.length !== 1) {
        context.addIssue({
          code: 'custom',
          path: [],
          message: 'A Cue Check history has exactly one create revision',
        });
      }
      const sequences = revisions.map(revision => revision.sequence).sort((left, right) => left - right);
      if (sequences.some((sequence, index) => sequence !== index + 1)) {
        context.addIssue({
          code: 'custom',
          path: [],
          message: 'A Cue Check history must have contiguous revision sequences starting at one',
        });
      }
      const byId = new Map(revisions.map(revision => [revision.revisionId, revision]));
      const correctedTargets = new Set<string>();
      for (const revision of revisions) {
        if (revision.kind !== 'correct') continue;
        const target = byId.get(revision.correctsRevisionId);
        if (target === undefined) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'A correction must target an existing revision of the same Cue Check',
          });
        } else {
          if (target.sequence >= revision.sequence) {
            context.addIssue({
              code: 'custom',
              path: [],
              message: 'A correction target must precede the correction',
            });
          }
          if (Date.parse(target.receivedAt) > Date.parse(revision.receivedAt)) {
            context.addIssue({
              code: 'custom',
              path: [],
              message: 'A correction target must have been received no later than the correction',
            });
          }
        }
        if (correctedTargets.has(revision.correctsRevisionId)) {
          context.addIssue({
            code: 'custom',
            path: [],
            message: 'Each revision is corrected at most once',
          });
        }
        correctedTargets.add(revision.correctsRevisionId);
      }
    }),
);
export type CueCheckHistory = z.output<typeof CueCheckHistorySchema>;

/**
 * Validate a raw revision list into one immutable, coherent history. Rejects
 * with a single ZodError that aggregates every incoherence; nothing is
 * repaired or reordered.
 */
export function validateCueCheckHistory(input: unknown): CueCheckHistory {
  return CueCheckHistorySchema.parse(input);
}

/**
 * Validate a raw observation into an immutable `CueCheckInput`.
 *
 * Pure: never mutates its argument and returns a frozen value built from new
 * objects. `observedAt` must carry an explicit offset and must not be later
 * than the injected `now`; callers pass `now` explicitly so no wall-clock read
 * hides inside validation.
 */
export function normalizeCueCheckInput(input: unknown, now: Date = new Date()): CueCheckInput {
  const parsed = CueCheckInputSchema.parse(input);
  if (Date.parse(parsed.observedAt) > now.getTime()) {
    throw new RangeError('Cue Check observedAt must not be in the future');
  }
  return parsed;
}

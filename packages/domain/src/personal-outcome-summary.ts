/**
 * Deterministic, non-causal personal outcome summaries (CC-04, CC-05, P-06).
 *
 * A summary counts one owner's own reported answers across comparable recorded
 * uses. It states what the owner reported and how many of the answered,
 * comparable uses the count covers — never more. It never says or implies that
 * a product caused an outcome, fixed or repaired hair, produced growth,
 * proved anything, guarantees a result, is universally safe or is the best
 * option, and it never converts a missing or unknown answer into a negative
 * one.
 *
 * The function is pure: it never mutates its inputs and returns frozen values
 * built from fresh objects, so equivalent inputs always produce byte-identical
 * output in a canonical order.
 */

import { z } from 'zod';

import {
  CUE_CHECK_OBSERVATION_FIELDS,
  CueCheckDefiniteValueSchema,
  CueCheckGoalSchema,
  CueCheckObservationFieldSchema,
  CueCheckOutcomeFieldSchemas,
  CueCheckTimestampSchema,
  CueCheckTimingSchema,
  type CueCheckObservationField,
  type CueCheckRecord,
  type CueCheckTiming,
} from './cue-check.ts';
import { frozen } from './guidance/schemas.ts';

/**
 * The explicit minimum number of definite comparable answers a single
 * observation must reach before any pattern wording is produced. Below it the
 * wording stays an honest insufficient-evidence sentence and never invents a
 * trend.
 */
export const MINIMUM_COMPARABLE_SAMPLE = 3;

const TIMING_ORDER = ['immediate', 'delayed'] as const satisfies readonly CueCheckTiming[];

/** The comparable context being summarized; records outside it never combine. */
export const PersonalOutcomeSummarizationContextSchema = z
  .object({ goal: CueCheckGoalSchema })
  .strict();
export type PersonalOutcomeSummarizationContext = z.output<
  typeof PersonalOutcomeSummarizationContextSchema
>;

/** When the comparable answers were observed, oldest to newest. */
export const PersonalOutcomeRecencySchema = z
  .object({
    firstObservedAt: CueCheckTimestampSchema,
    latestObservedAt: CueCheckTimestampSchema,
  })
  .strict();
export type PersonalOutcomeRecency = z.output<typeof PersonalOutcomeRecencySchema>;

/** The definite answers one field accepts. */
type DefiniteFieldValues<K extends CueCheckObservationField> = Exclude<
  z.output<(typeof CueCheckOutcomeFieldSchemas)[K]>,
  'unknown'
>;

/** Owner-facing subject of the insufficient-evidence sentence, per field. */
const INSUFFICIENT_SUBJECTS: { readonly [K in CueCheckObservationField]: string } = {
  overallResult: 'your overall result',
  satisfaction: 'how satisfied you felt',
  dryness: 'dryness',
  frizz: 'frizz',
  softness: 'softness',
  tangling: 'tangling',
  buildup: 'buildup or heaviness',
  breakage: 'breakage',
  styleLongevity: 'how long your style lasted',
  immediateReaction: 'reactions',
  wouldUseAgain: 'using this routine again',
};

/**
 * Owner-facing phrase for each definite answer of each field, inside the
 * fixed sentence "You reported … in N of M comparable uses you answered."
 * The typing requires a phrase for every definite value of every field, so a
 * vocabulary addition without its phrase fails to compile instead of
 * reaching an owner as "undefined".
 */
const REPORTED_PHRASES: {
  readonly [K in CueCheckObservationField]: Readonly<Record<DefiniteFieldValues<K>, string>>;
} = {
  overallResult: {
    better: 'a better result than usual',
    same: 'a similar result to usual',
    worse: 'a worse result than usual',
  },
  satisfaction: {
    satisfied: 'feeling satisfied',
    neutral: 'feeling neutral',
    dissatisfied: 'feeling dissatisfied',
  },
  dryness: { less: 'less dryness', same: 'similar dryness', more: 'more dryness' },
  frizz: { less: 'less frizz', same: 'similar frizz', more: 'more frizz' },
  softness: { less: 'less softness', same: 'similar softness', more: 'more softness' },
  tangling: { less: 'less tangling', same: 'similar tangling', more: 'more tangling' },
  buildup: {
    less: 'less buildup or heaviness',
    same: 'similar buildup or heaviness',
    more: 'more buildup or heaviness',
  },
  breakage: {
    less: 'noticing less breakage',
    same: 'noticing similar breakage',
    more: 'noticing more breakage',
  },
  styleLongevity: {
    shorter: 'a shorter-lasting style',
    similar: 'a similar-lasting style',
    longer: 'a longer-lasting style',
  },
  immediateReaction: {
    'none-noticed': 'noticing no reaction',
    'some-noticed': 'noticing a reaction',
  },
  wouldUseAgain: {
    yes: 'you would use this routine again',
    no: 'you would not use this routine again',
    unsure: 'you were unsure about using this routine again',
  },
};

function insufficientWording(field: CueCheckObservationField): string {
  return `Not enough comparable answers yet to show a pattern about ${INSUFFICIENT_SUBJECTS[field]}.`;
}

function patternWording<K extends CueCheckObservationField>(
  field: K,
  value: DefiniteFieldValues<K>,
  numerator: number,
  denominator: number,
): string {
  return `You reported ${REPORTED_PHRASES[field][value]} in ${numerator} of ${denominator} comparable uses you answered.`;
}

/** The definite answers one field accepts, in canonical vocabulary order. */
function definiteValuesOf<K extends CueCheckObservationField>(
  field: K,
): readonly DefiniteFieldValues<K>[] {
  const options: readonly string[] = CueCheckOutcomeFieldSchemas[field].options;
  // The generic cast cannot be proven for an unresolved K; the options tuple
  // and the phrase map exhaustiveness are pinned by the drift tests.
  return options.filter(value => value !== 'unknown') as unknown as readonly DefiniteFieldValues<K>[];
}

export const PersonalOutcomeEvidenceSchema = z.enum(['sufficient', 'insufficient']);
export type PersonalOutcomeEvidence = z.output<typeof PersonalOutcomeEvidenceSchema>;

/**
 * One owner-facing summary entry. Every field is data: the UI never needs to
 * re-derive counts from the sentence. The schema itself enforces the honesty
 * invariants — including the minimum comparable sample behind pattern
 * wording — and the canonical wording template, so a hand-built summary
 * that breaks either cannot cross a boundary that validates with it.
 */
export const PersonalOutcomeSummarySchema = frozen(
  z
    .object({
      observation: CueCheckObservationFieldSchema,
      timing: CueCheckTimingSchema,
      comparableContext: PersonalOutcomeSummarizationContextSchema,
      /** The definite answer this entry counts, or null when only unknowns exist. */
      reportedValue: CueCheckDefiniteValueSchema.nullable(),
      numerator: z.number().int().nonnegative(),
      denominator: z.number().int().nonnegative(),
      /** Explicit `unknown` answers for this observation; never in the denominator. */
      unknownCount: z.number().int().nonnegative(),
      recency: PersonalOutcomeRecencySchema.nullable(),
      evidence: PersonalOutcomeEvidenceSchema,
      wording: z.string(),
    })
    .strict()
    .superRefine((summary, context) => {
      if (summary.evidence === 'sufficient' && summary.denominator < MINIMUM_COMPARABLE_SAMPLE) {
        context.addIssue({
          code: 'custom',
          path: ['evidence'],
          message: 'Pattern wording requires at least the minimum comparable sample',
        });
      }
      if (summary.numerator > summary.denominator) {
        context.addIssue({
          code: 'custom',
          path: ['numerator'],
          message: 'A summary numerator cannot exceed its denominator',
        });
      }
      if ((summary.reportedValue === null) !== (summary.denominator === 0)) {
        context.addIssue({
          code: 'custom',
          path: ['reportedValue'],
          message: 'A summary without definite answers has no reported value and no denominator',
        });
      }
      if ((summary.recency === null) !== (summary.denominator === 0)) {
        context.addIssue({
          code: 'custom',
          path: ['recency'],
          message: 'A summary without definite answers has no recency window',
        });
      }
      if (summary.reportedValue !== null) {
        const fieldValues = CueCheckOutcomeFieldSchemas[summary.observation]
          .options as readonly string[];
        if (!fieldValues.includes(summary.reportedValue)) {
          context.addIssue({
            code: 'custom',
            path: ['reportedValue'],
            message: 'A summary reported value must be a definite answer of its observation field',
          });
        }
      }
      const expectedWording =
        summary.evidence === 'sufficient' && summary.reportedValue !== null
          ? patternWording(
              summary.observation,
              summary.reportedValue as DefiniteFieldValues<CueCheckObservationField>,
              summary.numerator,
              summary.denominator,
            )
          : insufficientWording(summary.observation);
      if (summary.wording !== expectedWording) {
        context.addIssue({
          code: 'custom',
          path: ['wording'],
          message: 'Summary wording must follow the canonical owner-facing template',
        });
      }
    }),
);
export type PersonalOutcomeSummary = z.output<typeof PersonalOutcomeSummarySchema>;

/**
 * Recency window over the comparable definite answers. Ties between equal
 * instants written in different offset forms resolve to the lexicographically
 * smallest (first) or largest (latest) string, so the window never depends on
 * the order records arrived in.
 */
function recencyWindow(records: readonly CueCheckRecord[]): PersonalOutcomeRecency {
  let first = records[0].observedAt;
  let latest = records[0].observedAt;
  for (const record of records) {
    const instant = Date.parse(record.observedAt);
    if (instant < Date.parse(first) || (instant === Date.parse(first) && record.observedAt < first)) {
      first = record.observedAt;
    }
    if (instant > Date.parse(latest) || (instant === Date.parse(latest) && record.observedAt > latest)) {
      latest = record.observedAt;
    }
  }
  return { firstObservedAt: first, latestObservedAt: latest };
}

interface SummaryParts {
  readonly observation: CueCheckObservationField;
  readonly timing: CueCheckTiming;
  readonly context: PersonalOutcomeSummarizationContext;
  readonly reportedValue: string | null;
  readonly numerator: number;
  readonly denominator: number;
  readonly unknownCount: number;
  readonly recency: PersonalOutcomeRecency | null;
  readonly evidence: PersonalOutcomeEvidence;
  readonly wording: string;
}

/** Build one immutable summary; the schema validates, enforces and freezes it. */
function buildSummary(parts: SummaryParts): PersonalOutcomeSummary {
  return PersonalOutcomeSummarySchema.parse({
    observation: parts.observation,
    timing: parts.timing,
    comparableContext: parts.context,
    reportedValue: parts.reportedValue,
    numerator: parts.numerator,
    denominator: parts.denominator,
    unknownCount: parts.unknownCount,
    recency: parts.recency,
    evidence: parts.evidence,
    wording: parts.wording,
  });
}

/**
 * Summarize one owner's recorded Cue Checks for one comparable context.
 *
 * Precondition: `records` are single-owner, already-validated
 * `CueCheckRecord` projections (the persistence layer owns that; nothing here
 * re-derives ownership). Only active records in the requested context count:
 * corrected and voided history and records answering to a different goal
 * never join a denominator, and immediate and delayed observations stay
 * separate. Missing answers stay missing; explicit `unknown` answers are
 * counted as unknown and never as negatives. An answer outside the field's
 * vocabulary cannot join any count. Pattern wording requires at least
 * MINIMUM_COMPARABLE_SAMPLE definite comparable answers; anything sparser
 * produces the honest insufficient-evidence sentence. Unparseable observation
 * times and two active records for one execution and timing fail closed with
 * explicit errors rather than producing dishonest counts.
 */
export function summarizePersonalOutcomes(
  records: readonly CueCheckRecord[],
  context: PersonalOutcomeSummarizationContext,
): readonly PersonalOutcomeSummary[] {
  const requestedContext = PersonalOutcomeSummarizationContextSchema.parse(context);
  const comparable = records.filter(
    record => record.lifecycle === 'active' && record.goal === requestedContext.goal,
  );

  const seenExecutionTimings = new Set<string>();
  for (const record of comparable) {
    if (!CueCheckTimestampSchema.safeParse(record.observedAt).success) {
      throw new RangeError('Cue Check records must carry a parseable observedAt timestamp');
    }
    const executionTiming = `${record.executionId}\u0000${record.timing}`;
    if (seenExecutionTimings.has(executionTiming)) {
      throw new Error('An execution cannot contribute two active Cue Checks with the same timing');
    }
    seenExecutionTimings.add(executionTiming);
  }

  const summaries: PersonalOutcomeSummary[] = [];
  for (const field of CUE_CHECK_OBSERVATION_FIELDS) {
    for (const timing of TIMING_ORDER) {
      const fieldSchema: z.ZodType = CueCheckOutcomeFieldSchemas[field];
      const candidates = comparable.filter(record => {
        const answer = record[field];
        return record.timing === timing && answer !== undefined && fieldSchema.safeParse(answer).success;
      });
      if (candidates.length === 0) continue;

      const definite = candidates.filter(record => record[field] !== 'unknown');
      const unknownCount = candidates.length - definite.length;

      if (definite.length === 0) {
        summaries.push(
          buildSummary({
            observation: field,
            timing,
            context: requestedContext,
            reportedValue: null,
            numerator: 0,
            denominator: 0,
            unknownCount,
            recency: null,
            evidence: 'insufficient',
            wording: insufficientWording(field),
          }),
        );
        continue;
      }

      const evidence: PersonalOutcomeEvidence =
        definite.length >= MINIMUM_COMPARABLE_SAMPLE ? 'sufficient' : 'insufficient';
      const recency = recencyWindow(definite);
      for (const value of definiteValuesOf(field)) {
        const numerator = definite.filter(record => record[field] === value).length;
        if (numerator === 0) continue;
        summaries.push(
          buildSummary({
            observation: field,
            timing,
            context: requestedContext,
            reportedValue: value,
            numerator,
            denominator: definite.length,
            unknownCount,
            recency,
            evidence,
            wording:
              evidence === 'sufficient'
                ? patternWording(field, value, numerator, definite.length)
                : insufficientWording(field),
          }),
        );
      }
    }
  }
  return Object.freeze(summaries);
}

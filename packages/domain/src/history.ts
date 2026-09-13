import { z } from 'zod';

import {
  DateOnlySchema,
  EffectiveDateSchema,
  currentDateOnly,
  effectiveDateToInterval,
  type EffectiveDate,
  type EffectiveInterval,
} from './dates.ts';
import {
  PassportPatchSchema,
  PassportSchema,
  type Passport,
  type PassportField,
  type PassportPatch,
} from './passport.ts';

const RevisionBaseSchema = z.object({
  id: z.string().uuid(),
  passportId: z.string().uuid(),
  sequence: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative(),
  effectiveDate: EffectiveDateSchema,
  recordedAt: z.string().datetime({ offset: true }),
  source: z.enum([
    'user-reported',
    'user-estimated',
    'verified-catalogue-reference',
  ]),
});

export const BaselineRevisionSchema = RevisionBaseSchema.extend({
  kind: z.literal('baseline'),
  patch: PassportSchema,
}).strict();

export const ChangeRevisionSchema = RevisionBaseSchema.extend({
  kind: z.literal('change'),
  patch: PassportPatchSchema,
}).strict();

export const CorrectionRevisionSchema = RevisionBaseSchema.extend({
  kind: z.literal('correction'),
  patch: PassportPatchSchema,
  correctsId: z.string().uuid(),
  correctionReason: z.string().trim().min(1).max(500),
}).strict();

export const PassportRevisionSchema = z.discriminatedUnion('kind', [
  BaselineRevisionSchema,
  ChangeRevisionSchema,
  CorrectionRevisionSchema,
]);

export type BaselineRevision = z.output<typeof BaselineRevisionSchema>;
export type ChangeRevision = z.output<typeof ChangeRevisionSchema>;
export type CorrectionRevision = z.output<typeof CorrectionRevisionSchema>;
export type PassportRevision = z.output<typeof PassportRevisionSchema>;

export interface ProjectHistoryOptions {
  readonly asOf?: string;
}

export type CandidateApplicability = 'definite' | 'possible';

export interface AmbiguousFieldCandidate {
  readonly revisionId: string;
  readonly value: unknown;
  readonly applicability: CandidateApplicability;
}

export interface AmbiguousField {
  readonly reason: 'overlapping-effective-intervals' | 'uncertain-as-of';
  readonly candidates: readonly AmbiguousFieldCandidate[];
}

export interface HistoryProjection {
  readonly asOf: string;
  readonly values: Partial<Passport>;
  readonly ambiguousFields: Partial<Record<PassportField, AmbiguousField>>;
  readonly appliedRevisionIds: readonly string[];
  readonly supersededRevisionIds: readonly string[];
}

export type HistoryValidationErrorCode =
  | 'missing-baseline'
  | 'multiple-baselines'
  | 'mixed-passports'
  | 'duplicate-revision-id'
  | 'duplicate-sequence'
  | 'noncontiguous-sequence'
  | 'invalid-base-revision'
  | 'invalid-baseline-order'
  | 'missing-correction-target'
  | 'branching-correction'
  | 'correction-cycle'
  | 'invalid-correction-order'
  | 'invalid-baseline-correction';

export class HistoryValidationError extends Error {
  readonly code: HistoryValidationErrorCode;

  constructor(code: HistoryValidationErrorCode, message: string) {
    super(message);
    this.name = 'HistoryValidationError';
    this.code = code;
  }
}

interface ActiveFact {
  readonly revision: PassportRevision;
  readonly interval: EffectiveInterval;
}

interface FieldFact {
  readonly revisionId: string;
  readonly sequence: number;
  readonly value: unknown;
  readonly interval: EffectiveInterval;
  readonly applicability: CandidateApplicability;
}

function assertSinglePassport(revisions: readonly PassportRevision[]): void {
  const passportIds = new Set(revisions.map((revision) => revision.passportId));
  if (passportIds.size > 1) {
    throw new HistoryValidationError(
      'mixed-passports',
      'All revisions must belong to the same Passport',
    );
  }
}

function assertUniqueRevisionIdentity(
  revisions: readonly PassportRevision[],
): void {
  const ids = revisions.map((revision) => revision.id);
  if (new Set(ids).size !== ids.length) {
    throw new HistoryValidationError(
      'duplicate-revision-id',
      'Revision IDs must be unique',
    );
  }

  const sequences = revisions.map((revision) => revision.sequence);
  if (new Set(sequences).size !== sequences.length) {
    throw new HistoryValidationError(
      'duplicate-sequence',
      'Revision sequences must be unique',
    );
  }
}

function findBaseline(revisions: readonly PassportRevision[]): BaselineRevision {
  const baselines = revisions.filter(
    (revision): revision is BaselineRevision => revision.kind === 'baseline',
  );

  if (baselines.length === 0) {
    throw new HistoryValidationError(
      'missing-baseline',
      'History requires one complete baseline revision',
    );
  }

  if (baselines.length > 1) {
    throw new HistoryValidationError(
      'multiple-baselines',
      'History cannot contain multiple baseline revisions',
    );
  }

  return baselines[0];
}

function assertCompleteRevisionChain(
  revisions: readonly PassportRevision[],
  baseline: BaselineRevision,
): void {
  if (baseline.sequence !== 1 || baseline.baseRevision !== 0) {
    throw new HistoryValidationError(
      'invalid-baseline-order',
      'The complete baseline must be the first revision',
    );
  }

  const revisionsBySequence = [...revisions].sort(
    (left, right) => left.sequence - right.sequence,
  );

  for (const [index, revision] of revisionsBySequence.entries()) {
    const expectedSequence = index + 1;
    if (revision.sequence !== expectedSequence) {
      throw new HistoryValidationError(
        'noncontiguous-sequence',
        'Complete history revision sequences must be contiguous',
      );
    }

    if (revision.baseRevision !== index) {
      throw new HistoryValidationError(
        'invalid-base-revision',
        `Revision ${revision.id} has an invalid base revision`,
      );
    }
  }
}

function buildCorrectionIndex(
  revisions: readonly PassportRevision[],
): ReadonlyMap<string, CorrectionRevision> {
  const revisionsById = new Map(
    revisions.map((revision) => [revision.id, revision] as const),
  );
  const corrections = revisions.filter(
    (revision): revision is CorrectionRevision =>
      revision.kind === 'correction',
  );

  return corrections.reduce<ReadonlyMap<string, CorrectionRevision>>(
    (index, correction) => {
      if (!revisionsById.has(correction.correctsId)) {
        throw new HistoryValidationError(
          'missing-correction-target',
          `Correction ${correction.id} targets a missing revision`,
        );
      }

      if (index.has(correction.correctsId)) {
        throw new HistoryValidationError(
          'branching-correction',
          `Branching correction found for revision ${correction.correctsId}`,
        );
      }

      return new Map(index).set(correction.correctsId, correction);
    },
    new Map<string, CorrectionRevision>(),
  );
}

function finalReplacement(
  root: PassportRevision,
  correctionByTarget: ReadonlyMap<string, CorrectionRevision>,
): PassportRevision {
  let current = root;
  let visitedIds = new Set<string>();

  while (correctionByTarget.has(current.id)) {
    if (visitedIds.has(current.id)) {
      throw new HistoryValidationError(
        'correction-cycle',
        `Correction cycle includes revision ${current.id}`,
      );
    }

    visitedIds = new Set([...visitedIds, current.id]);
    current = correctionByTarget.get(current.id)!;
  }

  return current;
}

function resolveActiveFacts(
  revisions: readonly PassportRevision[],
  correctionByTarget: ReadonlyMap<string, CorrectionRevision>,
): readonly ActiveFact[] {
  const roots = revisions.filter((revision) => revision.kind !== 'correction');

  return roots.map((root) => {
    const replacement = finalReplacement(root, correctionByTarget);
    if (root.kind === 'baseline') {
      const correctedBaseline = PassportSchema.safeParse(replacement.patch);
      if (!correctedBaseline.success) {
        throw new HistoryValidationError(
          'invalid-baseline-correction',
          'A correction replacing the baseline must remain a complete Passport',
        );
      }
    }

    return {
      revision: replacement,
      interval: effectiveDateToInterval(replacement.effectiveDate),
    };
  });
}

function applicabilityAt(
  interval: EffectiveInterval,
  asOf: string,
): CandidateApplicability | null {
  if (interval.start !== null && interval.start > asOf) {
    return null;
  }

  if (interval.end !== null && interval.end <= asOf) {
    return 'definite';
  }

  return 'possible';
}

function factsByField(
  activeFacts: readonly ActiveFact[],
  asOf: string,
): Partial<Record<PassportField, readonly FieldFact[]>> {
  return activeFacts.reduce<
    Partial<Record<PassportField, readonly FieldFact[]>>
  >((fields, fact) => {
    const applicability = applicabilityAt(fact.interval, asOf);
    if (applicability === null) {
      return fields;
    }

    return Object.entries(fact.revision.patch).reduce<
      Partial<Record<PassportField, readonly FieldFact[]>>
    >((updatedFields, [rawField, value]) => {
      const field = rawField as PassportField;
      const existing = updatedFields[field] ?? [];
      return {
        ...updatedFields,
        [field]: [
          ...existing,
          {
            revisionId: fact.revision.id,
            sequence: fact.revision.sequence,
            value,
            interval: fact.interval,
            applicability,
          },
        ],
      };
    }, fields);
  }, {});
}

function isDefinitelyBefore(left: FieldFact, right: FieldFact): boolean {
  return (
    left.interval.end !== null &&
    right.interval.start !== null &&
    left.interval.end < right.interval.start
  );
}

function latestDefiniteFacts(facts: readonly FieldFact[]): readonly FieldFact[] {
  const definiteFacts = facts.filter(
    (fact) => fact.applicability === 'definite',
  );
  return definiteFacts.filter(
    (candidate) =>
      !definiteFacts.some(
        (other) =>
          other.revisionId !== candidate.revisionId &&
          isDefinitelyBefore(candidate, other),
      ),
  );
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueRevisionIds(revisionIds: readonly string[]): readonly string[] {
  return [...new Set(revisionIds)];
}

interface ProjectionAccumulator {
  readonly values: Partial<Passport>;
  readonly ambiguousFields: Partial<Record<PassportField, AmbiguousField>>;
  readonly appliedRevisionIds: readonly string[];
}

function projectFields(
  groupedFacts: Partial<Record<PassportField, readonly FieldFact[]>>,
): ProjectionAccumulator {
  return (Object.entries(groupedFacts) as [PassportField, FieldFact[]][]).reduce<ProjectionAccumulator>(
    (projection, [field, facts]) => {
      const definiteCandidates = latestDefiniteFacts(facts);
      const possibleCandidates = facts.filter(
        (fact) => fact.applicability === 'possible',
      );
      const candidates = [...definiteCandidates, ...possibleCandidates].sort(
        (left, right) => left.sequence - right.sequence,
      );
      const firstCandidate = candidates[0];

      if (firstCandidate === undefined) {
        return projection;
      }

      const hasPossibleAbsence =
        possibleCandidates.length > 0 && definiteCandidates.length === 0;
      const hasDistinctValues = candidates.some(
        (candidate) => !valuesEqual(candidate.value, firstCandidate.value),
      );

      if (hasPossibleAbsence || hasDistinctValues) {
        return {
          ...projection,
          ambiguousFields: {
            ...projection.ambiguousFields,
            [field]: {
              reason:
                possibleCandidates.length > 0
                  ? 'uncertain-as-of'
                  : 'overlapping-effective-intervals',
              candidates: candidates.map((candidate) => ({
                revisionId: candidate.revisionId,
                value: candidate.value,
                applicability: candidate.applicability,
              })),
            },
          },
        };
      }

      return {
        ...projection,
        values: { ...projection.values, [field]: firstCandidate.value },
        appliedRevisionIds: uniqueRevisionIds([
          ...projection.appliedRevisionIds,
          ...candidates.map((candidate) => candidate.revisionId),
        ]),
      };
    },
    {
      values: {},
      ambiguousFields: {},
      appliedRevisionIds: [],
    } satisfies ProjectionAccumulator,
  );
}

function validateCorrectionCycles(
  revisions: readonly PassportRevision[],
  correctionByTarget: ReadonlyMap<string, CorrectionRevision>,
): void {
  for (const revision of revisions) {
    finalReplacement(revision, correctionByTarget);
  }
}

function assertCorrectionTargetsPrecede(
  revisions: readonly PassportRevision[],
): void {
  const revisionsById = new Map(
    revisions.map((revision) => [revision.id, revision] as const),
  );

  for (const correction of revisions) {
    if (correction.kind !== 'correction') {
      continue;
    }

    const target = revisionsById.get(correction.correctsId)!;
    const targetWasRecordedLater =
      Date.parse(target.recordedAt) > Date.parse(correction.recordedAt);
    if (
      target.sequence >= correction.sequence ||
      targetWasRecordedLater
    ) {
      throw new HistoryValidationError(
        'invalid-correction-order',
        `Target ${target.id} must precede the correction`,
      );
    }
  }
}

export function projectHistory(
  inputRevisions: readonly PassportRevision[],
  options: ProjectHistoryOptions = {},
): HistoryProjection {
  const revisions = PassportRevisionSchema.array().parse(inputRevisions);
  const baseline = findBaseline(revisions);
  assertSinglePassport(revisions);
  assertUniqueRevisionIdentity(revisions);
  assertCompleteRevisionChain(revisions, baseline);

  const correctionByTarget = buildCorrectionIndex(revisions);
  validateCorrectionCycles(revisions, correctionByTarget);
  assertCorrectionTargetsPrecede(revisions);
  const activeFacts = resolveActiveFacts(revisions, correctionByTarget);
  const asOf = DateOnlySchema.parse(
    options.asOf ?? currentDateOnly(),
  );
  const fieldProjection = projectFields(factsByField(activeFacts, asOf));
  const sequencesById = new Map(
    revisions.map((revision) => [revision.id, revision.sequence] as const),
  );
  const supersededRevisionIds = [...correctionByTarget.keys()].sort(
    (left, right) => sequencesById.get(left)! - sequencesById.get(right)!,
  );

  return {
    asOf,
    ...fieldProjection,
    supersededRevisionIds,
  };
}

export type { EffectiveDate, Passport, PassportField, PassportPatch };

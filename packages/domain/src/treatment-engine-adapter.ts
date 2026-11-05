import type { TreatmentProgrammeProjection } from '@strandcue/engine';
import type { ProgrammeEvaluation } from './treatment-programme.ts';

/** Maps the canonical programme evaluation into the engine's compact, immutable projection. */
export const toEngineTreatmentProgrammeProjection = (
  programmeId: string,
  evaluation: ProgrammeEvaluation,
  prospective = false,
): TreatmentProgrammeProjection => ({
  programmeId,
  state: evaluation.state,
  dueStatus: evaluation.dueStatus === 'due'
    ? 'due'
    : evaluation.dueStatus === 'not_due' || evaluation.dueStatus === 'eligible'
      ? 'not_due'
      : 'unknown',
  ruleId: evaluation.ruleId,
  ruleVersion: evaluation.ruleVersion,
  evaluatedAt: evaluation.asOf,
  sourceEventIds: [...new Set([
    ...evaluation.eventsUsed.map((event) => event.eventId),
    ...(evaluation.application ? [evaluation.application.eventId] : []),
  ])].sort(),
  prospective,
});

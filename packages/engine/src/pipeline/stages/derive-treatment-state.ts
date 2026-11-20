import type { PipelineState, TreatmentSummary } from '../state.js';
import { defineStage } from '../stage-runner.js';

export const treatmentDueStatusFactId = (programmeId: string): string => `treatment:${programmeId}:due_status`;

/** Consumes due-state projections made by the canonical treatment-programme evaluator. */
export const summariseTreatment = (state: PipelineState): TreatmentSummary => {
  return { programmes: [...(state.input.snapshot.treatmentPrograms ?? [])] };
};

const treatmentFacts = (state: PipelineState): PipelineState['facts'] => {
  const facts = new Map(state.facts);
  for (const programme of state.input.snapshot.treatmentPrograms ?? []) {
    if (programme.prospective) continue;
    const factId = treatmentDueStatusFactId(programme.programmeId);
    facts.set(factId, {
      factId,
      resolution: programme.dueStatus === 'unknown' ? 'unknown' : 'verified',
      fact: undefined,
      ...(programme.dueStatus === 'unknown' ? {} : { derivedValue: programme.dueStatus }),
    });
  }
  return facts;
};

export const deriveTreatmentState = defineStage({
  stageId: 'derive_treatment_state',
  intrinsic: true,
  before: (state) => ({ ...state, treatment: summariseTreatment(state), facts: treatmentFacts(state) }),
});

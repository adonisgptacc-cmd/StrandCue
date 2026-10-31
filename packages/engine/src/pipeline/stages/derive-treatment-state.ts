import type { PipelineState, TreatmentSummary } from '../state.js';
import { compareStrings } from '../state.js';
import { defineStage } from '../stage-runner.js';

/** Counts confirmed events per type in a canonical order; independent of array order. */
export const summariseTreatment = (state: PipelineState): TreatmentSummary => {
  const byType = new Map<string, { count: number; latestHappenedAt: string }>();
  state.input.snapshot.eventHistory.forEach((event) => {
    const current = byType.get(event.eventType);
    const latest = current && Date.parse(current.latestHappenedAt) >= Date.parse(event.happenedAt)
      ? current.latestHappenedAt
      : event.happenedAt;
    byType.set(event.eventType, { count: (current?.count ?? 0) + 1, latestHappenedAt: latest });
  });
  return {
    eventTypes: [...byType.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([eventType, value]) => ({ eventType, ...value })),
  };
};

export const deriveTreatmentState = defineStage({
  stageId: 'derive_treatment_state',
  intrinsic: true,
  before: (state) => ({ ...state, treatment: summariseTreatment(state) }),
});

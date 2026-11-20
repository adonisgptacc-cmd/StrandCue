import { defineStage, ruleProvenance } from '../stage-runner.js';

/** Hard compatibility/order filtering: removes excluded candidates and records why. */
export const filterCandidates = defineStage({
  stageId: 'filter_candidates',
  intrinsic: false,
  onEffect: (state, rule, effect) => {
    if (effect.kind !== 'exclude_candidate' || !state.candidates.has(effect.candidateId)) return state;
    const candidates = new Map(state.candidates);
    candidates.delete(effect.candidateId);
    return {
      ...state,
      candidates,
      omissions: [
        ...state.omissions,
        {
          candidateId: effect.candidateId,
          reasonCode: effect.reasonCode,
          reasonSeverity: effect.reasonSeverity ?? 'caution',
          ruleIds: [...ruleProvenance(rule).ruleIds],
          ruleRefs: [...ruleProvenance(rule).ruleRefs],
          claimIds: [...ruleProvenance(rule).claimIds],
          evidenceIds: [...ruleProvenance(rule).evidenceIds],
        },
      ],
    };
  },
});

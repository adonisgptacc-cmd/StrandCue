import { addBlocker, defineStage, ruleApplicability, ruleProvenance } from '../stage-runner.js';
import type { CandidateRecord } from '../state.js';
import { compareStrings, mergeProvenance } from '../state.js';

/**
 * Loads the reviewed capability facts that apply to what the person owns and
 * generates the candidate pool. A hard rule whose capability review has
 * expired (or is not yet effective) cannot be relied on, so it blocks.
 */
export const loadVerifiedFacts = defineStage({
  stageId: 'load_verified_facts',
  intrinsic: true,
  before: (state) => {
    let next = state;
    [...state.input.ruleset.rules]
      .sort((left, right) => compareStrings(left.ruleId, right.ruleId))
      .forEach((rule) => {
        if (rule.severity === 'hard' && ruleApplicability(rule, state.input, state.evaluatedAtMs) === 'inert') {
          next = addBlocker(next, 'capability_unavailable', ruleProvenance(rule));
        }
      });
    return next;
  },
  onEffect: (state, rule, effect) => {
    if (effect.kind !== 'include_candidate') return state;
    const existing = state.candidates.get(effect.candidateId);
    const record: CandidateRecord = {
      candidateId: effect.candidateId,
      goalSuitability: Math.max(existing?.goalSuitability ?? 0, effect.goalSuitability ?? 0),
      provenance: mergeProvenance(existing?.provenance ?? { ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [] }, ruleProvenance(rule)),
    };
    return { ...state, candidates: new Map(state.candidates).set(effect.candidateId, record) };
  },
});

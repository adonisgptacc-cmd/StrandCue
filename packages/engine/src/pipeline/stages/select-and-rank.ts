import { defineStage } from '../stage-runner.js';
import type { CandidateRecord } from '../state.js';
import { compareStrings } from '../state.js';

/**
 * Eligibility and hard constraints have already run. Use only explicitly
 * authored goal suitability; rule authority is not a preference score. Heat,
 * product-use and personal-outcome hints remain deferred until the engine
 * contract receives reviewed candidate metadata for those factors.
 */
export const compareCandidates = (left: CandidateRecord, right: CandidateRecord): number =>
  right.goalSuitability - left.goalSuitability || compareStrings(left.candidateId, right.candidateId);

export const selectAndRank = defineStage({
  stageId: 'select_and_rank',
  intrinsic: true,
  before: (state) => ({
    ...state,
    ranking: [...state.candidates.values()].sort(compareCandidates).map((candidate) => candidate.candidateId),
  }),
});

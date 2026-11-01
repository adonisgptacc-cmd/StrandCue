import { defineStage } from '../stage-runner.js';
import type { CandidateRecord } from '../state.js';
import { compareStrings } from '../state.js';

/**
 * Ranking factors implemented against the frozen contract, in order:
 * 1. goal suitability (summed severity weight of the rules that include the candidate),
 * 2. stable candidate-id tie-break.
 * Heat/product minimisation and personal-outcome ranking have no inputs in the
 * contract yet, so they are intentionally absent rather than faked.
 */
export const compareCandidates = (left: CandidateRecord, right: CandidateRecord): number =>
  right.suitability - left.suitability || compareStrings(left.candidateId, right.candidateId);

export const selectAndRank = defineStage({
  stageId: 'select_and_rank',
  intrinsic: true,
  before: (state) => ({
    ...state,
    ranking: [...state.candidates.values()].sort(compareCandidates).map((candidate) => candidate.candidateId),
  }),
});

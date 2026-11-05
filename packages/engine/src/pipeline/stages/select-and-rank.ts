import { defineStage } from '../stage-runner.js';
import type { CandidateRecord } from '../state.js';
import { compareStrings } from '../state.js';

/** Eligibility is settled; suitability is primary, followed by reviewed heat/product Pareto frontiers. */
const sameRulesetPin = (left: CandidateRecord, right: CandidateRecord): boolean =>
  left.rulesetRef.rulesetId === right.rulesetRef.rulesetId
  && left.rulesetRef.contentHash === right.rulesetRef.contentHash
  && left.rulesetRef.schemaVersion === right.rulesetRef.schemaVersion
  && left.rulesetRef.evaluatorVersion === right.rulesetRef.evaluatorVersion;

export const compareCandidates = (left: CandidateRecord, right: CandidateRecord): number => {
  if (!sameRulesetPin(left, right)) {
    throw new Error('Cannot compare candidates from different rulesets.');
  }
  return right.goalSuitability - left.goalSuitability || compareStrings(left.candidateId, right.candidateId);
};

const dominates = (left: CandidateRecord, right: CandidateRecord): boolean => {
  const leftHeat = left.heatExposureOrdinal;
  const rightHeat = right.heatExposureOrdinal;
  const leftProducts = left.distinctRequiredProductCount;
  const rightProducts = right.distinctRequiredProductCount;
  if (leftHeat === null || rightHeat === null || leftProducts === null || rightProducts === null) return false;

  return leftHeat <= rightHeat
    && leftProducts <= rightProducts
    && (leftHeat < rightHeat || leftProducts < rightProducts);
};

const rankParetoFrontiers = (candidates: readonly CandidateRecord[]): CandidateRecord[] => {
  let remaining = [...candidates];
  const ranked: CandidateRecord[] = [];

  while (remaining.length > 0) {
    const frontier = remaining.filter((candidate) =>
      !remaining.some((other) => other !== candidate && dominates(other, candidate)));
    const frontierSet = new Set(frontier);
    ranked.push(...frontier);
    remaining = remaining.filter((candidate) => !frontierSet.has(candidate));
  }

  return ranked;
};

const rankCandidates = (candidates: readonly CandidateRecord[]): CandidateRecord[] => {
  const [first, ...rest] = candidates;
  if (first !== undefined && rest.some((candidate) => !sameRulesetPin(first, candidate))) {
    throw new Error('Cannot compare candidates from different rulesets.');
  }

  const ordered = [...candidates].sort(compareCandidates);
  const suitabilityGroups: CandidateRecord[][] = [];
  for (const candidate of ordered) {
    const current = suitabilityGroups[suitabilityGroups.length - 1];
    if (current?.[0]?.goalSuitability === candidate.goalSuitability) current.push(candidate);
    else suitabilityGroups.push([candidate]);
  }

  return suitabilityGroups.flatMap(rankParetoFrontiers);
};

export const selectAndRank = defineStage({
  stageId: 'select_and_rank',
  intrinsic: true,
  before: (state) => ({
    ...state,
    ranking: rankCandidates([...state.candidates.values()]).map((candidate) => candidate.candidateId),
  }),
});

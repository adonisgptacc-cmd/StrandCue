import type {
  AdvisoryPreference,
} from './apply-effects.ts';
import type {
  ProductCandidate,
  RejectedCandidateEntry,
  ToolCandidate,
} from './types.ts';

export interface RankInput {
  readonly products: readonly ProductCandidate[];
  readonly tools: readonly ToolCandidate[];
  readonly requiredCapabilities: readonly string[];
  readonly excludedCapabilities: readonly string[];
  readonly advisory: readonly AdvisoryPreference[];
}

export interface CandidateScore {
  readonly candidateId: string;
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly name: string;
  readonly hardPass: boolean;
  readonly verifiedCoverage: number;
  readonly advisoryMatches: number;
  readonly owned: boolean;
  readonly available: boolean;
}

export interface CandidateRanking {
  readonly ranked: readonly CandidateScore[];
  readonly rejected: readonly RejectedCandidateEntry[];
}

function preferenceSatisfied(
  preference: AdvisoryPreference,
  verified: readonly string[],
  unknown: readonly string[],
): boolean {
  if (preference.polarity === 'exclude') {
    return !verified.includes(preference.capability) && !unknown.includes(preference.capability);
  }
  return verified.includes(preference.capability);
}

function scoreCandidate(
  candidate: ProductCandidate | ToolCandidate,
  kind: 'product' | 'tool',
  required: readonly string[],
  excluded: readonly string[],
  advisory: readonly AdvisoryPreference[],
  relevant: readonly string[],
): { score: CandidateScore; rejectionReasons: readonly string[] } {
  const unknown = kind === 'product' ? candidate.unknownCapabilities : [];
  const missing = required.filter(capability => !candidate.verifiedCapabilities.includes(capability));
  const clashes = excluded.filter(
    capability => candidate.verifiedCapabilities.includes(capability) || unknown.includes(capability),
  );
  const rejectionReasons = [
    ...missing.map(capability => `missing required capability '${capability}'`),
    ...clashes.map(capability => `carries excluded capability '${capability}'`),
  ].sort();
  const owned = kind === 'product' ? candidate.owned : false;
  return {
    score: {
      candidateId: kind === 'product' ? candidate.productId : candidate.toolId,
      kind,
      versionId: candidate.versionId,
      name: candidate.name,
      hardPass: rejectionReasons.length === 0,
      verifiedCoverage: relevant.filter(capability =>
        candidate.verifiedCapabilities.includes(capability),
      ).length,
      advisoryMatches: advisory.filter(preference =>
        preferenceSatisfied(preference, candidate.verifiedCapabilities, unknown),
      ).length,
      owned,
      available: candidate.available,
    },
    rejectionReasons,
  };
}

function compareScores(left: CandidateScore, right: CandidateScore): number {
  if (left.hardPass !== right.hardPass) {
    return left.hardPass ? -1 : 1;
  }
  if (left.verifiedCoverage !== right.verifiedCoverage) {
    return right.verifiedCoverage - left.verifiedCoverage;
  }
  if (left.advisoryMatches !== right.advisoryMatches) {
    return right.advisoryMatches - left.advisoryMatches;
  }
  if (left.owned !== right.owned) {
    return left.owned ? -1 : 1;
  }
  if (left.available !== right.available) {
    return left.available ? -1 : 1;
  }
  return left.candidateId < right.candidateId ? -1 : 1;
}

export function rankCandidates(input: RankInput): CandidateRanking {
  const relevant = [...new Set(input.requiredCapabilities)];
  const scores: CandidateScore[] = [];
  const rejected: RejectedCandidateEntry[] = [];
  const consider = (
    candidate: ProductCandidate | ToolCandidate,
    kind: 'product' | 'tool',
  ): void => {
    const { score, rejectionReasons } = scoreCandidate(
      candidate,
      kind,
      input.requiredCapabilities,
      input.excludedCapabilities,
      input.advisory,
      relevant,
    );
    if (score.hardPass) {
      scores.push(score);
    } else {
      rejected.push({
        candidateId: score.candidateId,
        kind,
        versionId: score.versionId,
        name: score.name,
        reasons: rejectionReasons,
      });
    }
  };
  for (const product of input.products) {
    consider(product, 'product');
  }
  for (const tool of input.tools) {
    consider(tool, 'tool');
  }
  scores.sort(compareScores);
  rejected.sort((left, right) => (left.candidateId < right.candidateId ? -1 : 1));
  return { ranked: scores, rejected };
}

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

interface Scorable {
  readonly candidateId: string;
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly name: string;
  readonly verified: readonly string[];
  readonly unknown: readonly string[];
  readonly owned: boolean;
  readonly available: boolean;
}

function scorableProduct(candidate: ProductCandidate): Scorable {
  return {
    candidateId: candidate.productId,
    kind: 'product',
    versionId: candidate.versionId,
    name: candidate.name,
    verified: candidate.verifiedCapabilities,
    unknown: candidate.unknownCapabilities,
    owned: candidate.owned,
    available: candidate.available,
  };
}

function scorableTool(candidate: ToolCandidate): Scorable {
  return {
    candidateId: candidate.toolId,
    kind: 'tool',
    versionId: candidate.versionId,
    name: candidate.name,
    verified: candidate.verifiedCapabilities,
    unknown: [],
    owned: false,
    available: candidate.available,
  };
}

function scoreCandidate(
  scorable: Scorable,
  excluded: readonly string[],
  advisory: readonly AdvisoryPreference[],
  relevant: readonly string[],
): { score: CandidateScore; rejectionReasons: readonly string[] } {
  const clashes = excluded.filter(
    capability => scorable.verified.includes(capability) || scorable.unknown.includes(capability),
  );
  const rejectionReasons = clashes
    .map(capability => `carries excluded capability '${capability}'`)
    .sort();
  return {
    score: {
      candidateId: scorable.candidateId,
      kind: scorable.kind,
      versionId: scorable.versionId,
      name: scorable.name,
      hardPass: rejectionReasons.length === 0,
      verifiedCoverage: relevant.filter(capability =>
        scorable.verified.includes(capability),
      ).length,
      advisoryMatches: advisory.filter(preference =>
        preferenceSatisfied(preference, scorable.verified, scorable.unknown),
      ).length,
      owned: scorable.owned,
      available: scorable.available,
    },
    rejectionReasons,
  };
}

function compareScores(left: CandidateScore, right: CandidateScore): number {
  // MARK: Only hard-passing candidates reach this comparator; rejection
  // happens before sorting, so "passes every hard rule" is structural.
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
  if (left.candidateId !== right.candidateId) {
    return left.candidateId < right.candidateId ? -1 : 1;
  }
  if (left.versionId !== right.versionId) {
    return left.versionId < right.versionId ? -1 : 1;
  }
  return left.kind === right.kind ? 0 : left.kind < right.kind ? -1 : 1;
}

export function rankCandidates(input: RankInput): CandidateRanking {
  const relevant = [...new Set(input.requiredCapabilities)];
  const scores: CandidateScore[] = [];
  const rejected: RejectedCandidateEntry[] = [];
  const consider = (scorable: Scorable): void => {
    const { score, rejectionReasons } = scoreCandidate(
      scorable,
      input.excludedCapabilities,
      input.advisory,
      relevant,
    );
    if (score.hardPass) {
      scores.push(score);
    } else {
      rejected.push({
        candidateId: score.candidateId,
        kind: score.kind,
        versionId: score.versionId,
        name: score.name,
        reasons: rejectionReasons,
      });
    }
  };
  for (const product of input.products) {
    consider(scorableProduct(product));
  }
  for (const tool of input.tools) {
    consider(scorableTool(tool));
  }
  scores.sort(compareScores);
  rejected.sort((left, right) => (left.candidateId < right.candidateId ? -1 : 1));
  return { ranked: scores, rejected };
}

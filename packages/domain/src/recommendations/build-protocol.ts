import { ruleRefOf, type AttributedOrder, type CollectedEffects } from './apply-effects.ts';
import type { CandidateRanking, CandidateScore } from './rank-candidates.ts';
import type {
  AppliedRestriction,
  AuditRuleEntry,
  Confidence,
  DecisionStatus,
  ProductCandidate,
  ProtocolDecision,
  ProtocolStep,
  RecommendationAudit,
  RecommendationContext,
  RecommendationRule,
  RuleEvaluation,
  RulesEvaluation,
  ToolCandidate,
} from './types.ts';

export const RECOMMENDATION_ENGINE_VERSION = '1';

export interface ProtocolBuildArgs {
  readonly requestId: string;
  readonly context: RecommendationContext;
  readonly evaluation: RulesEvaluation;
  readonly collected: CollectedEffects;
  readonly ranking: CandidateRanking;
}

function ruleStrengths(rules: readonly RecommendationRule[]): ReadonlyMap<string, string> {
  return new Map(rules.map(rule => [ruleRefOf(rule.ruleId, rule.versionId), rule.strength]));
}

function hardUnknown(evaluation: RulesEvaluation, rules: readonly RecommendationRule[]): readonly RuleEvaluation[] {
  const strengths = ruleStrengths(rules);
  return evaluation.unknown.filter(
    entry => strengths.get(ruleRefOf(entry.ruleId, entry.versionId)) === 'hard',
  );
}

function unionFacts(evaluations: readonly RuleEvaluation[]): readonly string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const entry of evaluations) {
    for (const fact of entry.missingFacts) {
      if (!seen.has(fact)) {
        seen.add(fact);
        ordered.push(fact);
      }
    }
  }
  return ordered;
}

function candidateCovers(
  candidate: ProductCandidate | ToolCandidate,
  capability: string,
  excluded: readonly string[],
): boolean {
  const unknown = 'unknownCapabilities' in candidate ? candidate.unknownCapabilities : [];
  return (
    candidate.available &&
    candidate.verifiedCapabilities.includes(capability) &&
    !excluded.some(
      blocked =>
        candidate.verifiedCapabilities.includes(blocked) || unknown.includes(blocked),
    )
  );
}

function unsupportedGap(
  context: RecommendationContext,
  required: readonly string[],
  excluded: readonly string[],
): string | null {
  const candidates: readonly (ProductCandidate | ToolCandidate)[] = [
    ...context.products,
    ...context.tools,
  ];
  for (const capability of [...required].sort()) {
    if (!candidates.some(candidate => candidateCovers(candidate, capability, excluded))) {
      return `No verified available candidate provides required capability '${capability}'`;
    }
  }
  return null;
}

function orderCapabilities(
  required: readonly string[],
  edges: readonly AttributedOrder[],
): readonly string[] {
  const nodes = [...new Set(required)].sort();
  const inSet = new Set(nodes);
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>(nodes.map(node => [node, 0]));
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!inSet.has(edge.before) || !inSet.has(edge.after)) {
      continue;
    }
    const key = `${edge.before}\u0000${edge.after}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    outgoing.set(edge.before, [...(outgoing.get(edge.before) ?? []), edge.after]);
    indegree.set(edge.after, (indegree.get(edge.after) ?? 0) + 1);
  }
  const ready = nodes.filter(node => indegree.get(node) === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    ready.sort();
    const node = ready.shift() as string;
    ordered.push(node);
    for (const next of outgoing.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
      }
    }
  }
  return ordered;
}

function verifiedCapsOf(candidateId: string, context: RecommendationContext): readonly string[] {
  const candidate = [...context.products, ...context.tools].find(
    entry => candidateIdOf(entry) === candidateId,
  );
  return candidate === undefined ? [] : candidate.verifiedCapabilities;
}

function hardRefsForCapability(collected: CollectedEffects, capability: string): readonly string[] {
  return collected.hard.required
    .filter(entry => entry.capability === capability)
    .map(entry => entry.ruleRef);
}

function describeRestrictions(collected: CollectedEffects): AppliedRestriction[] {
  const restrictions: AppliedRestriction[] = [];
  for (const entry of collected.hard.frequencies) {
    const bounds = [
      entry.min !== undefined ? `at least ${entry.min}` : null,
      entry.max !== undefined ? `at most ${entry.max}` : null,
    ].filter(part => part !== null);
    restrictions.push({
      ruleRef: entry.ruleRef,
      description: `Frequency for '${entry.unit}' (${entry.ruleRef}): ${bounds.join(' and ')}`,
    });
  }
  for (const entry of collected.hard.heat) {
    if (entry.prohibited) {
      restrictions.push({ ruleRef: entry.ruleRef, description: `Avoid '${entry.exposure}' heat (${entry.ruleRef})` });
    } else if (entry.maxTemperatureCelsius !== undefined) {
      restrictions.push({
        ruleRef: entry.ruleRef,
        description: `Limit '${entry.exposure}' heat to ${entry.maxTemperatureCelsius} C (${entry.ruleRef})`,
      });
    } else {
      restrictions.push({
        ruleRef: entry.ruleRef,
        description: `Only '${entry.exposure}' heat is permitted (${entry.ruleRef})`,
      });
    }
  }
  for (const note of collected.advisoryNotes) {
    restrictions.push({
      ruleRef: note.ruleRef,
      description: `Advisory ${note.kind} from ${note.ruleRef} recorded without constraining the plan`,
    });
  }
  return restrictions;
}

function deriveConfidence(
  evaluation: RulesEvaluation,
  context: RecommendationContext,
  collected: CollectedEffects,
  selectedIds: ReadonlySet<string>,
): Confidence {
  const interesting = new Set([
    ...collected.hard.required.map(entry => entry.capability),
    ...collected.advisory.map(entry => entry.capability),
  ]);
  const selected = [...context.products, ...context.tools].filter(candidate =>
    selectedIds.has(candidateIdOf(candidate)),
  );
  const uncertain = selected.some(
    candidate =>
      'unknownCapabilities' in candidate &&
      candidate.unknownCapabilities.some(capability => interesting.has(capability)),
  );
  if (uncertain) {
    return 'limited';
  }
  return evaluation.unknown.length === 0 ? 'high' : 'moderate';
}

function candidateIdOf(candidate: ProductCandidate | ToolCandidate): string {
  return 'productId' in candidate ? candidate.productId : candidate.toolId;
}

function assembleEntries(evaluation: RulesEvaluation): AuditRuleEntry[] {
  const buckets = [evaluation.applied, evaluation.notApplicable, evaluation.unknown, evaluation.withdrawn];
  return buckets.flatMap(bucket =>
    bucket.map(entry => ({
      ruleId: entry.ruleId,
      versionId: entry.versionId,
      outcome: entry.outcome,
      reason: entry.reason,
    })),
  );
}

function assembleAudit(
  args: ProtocolBuildArgs,
  selectedIds: ReadonlySet<string>,
  missingInputs: readonly string[],
): RecommendationAudit {
  return {
    requestId: args.requestId,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    evaluatedRules: assembleEntries(args.evaluation),
    conflicts: [...args.collected.conflicts],
    rankedCandidates: args.ranking.ranked.map(score => ({
      candidateId: score.candidateId,
      kind: score.kind,
      versionId: score.versionId,
      selected: selectedIds.has(score.candidateId),
      hardPass: score.hardPass,
      verifiedCoverage: score.verifiedCoverage,
      advisoryMatches: score.advisoryMatches,
      owned: score.owned,
      available: score.available,
    })),
    rejectedCandidates: args.ranking.rejected.map(entry => ({ ...entry })),
    restrictions: describeRestrictions(args.collected),
    missingInputs: [...missingInputs],
  };
}

function blockedDecision(
  args: ProtocolBuildArgs,
  status: DecisionStatus,
  missingInputs: readonly string[],
  omissions: readonly string[],
): ProtocolDecision {
  return {
    status,
    requestId: args.requestId,
    confidence: 'limited',
    steps: [],
    omissions: [...omissions],
    alternatives: [],
    missingInputs: [...missingInputs],
    audit: assembleAudit(args, new Set(), missingInputs),
  };
}

interface StepContent {
  readonly action: string;
  readonly productId: string | null;
  readonly toolId: string | null;
  readonly waitSeconds: number | null;
  readonly rinse: boolean | null;
  readonly reasons: readonly string[];
}

function applyStepContents(
  args: ProtocolBuildArgs,
  ordered: readonly string[],
): { contents: StepContent[]; selectedIds: Set<string> } {
  const contents: StepContent[] = [];
  const selectedIds = new Set<string>();
  for (const capability of ordered) {
    const covering = args.ranking.ranked.filter(
      score => score.available && score.hardPass && scoreMatches(score, args.context, capability),
    );
    const selected = covering.length === 0 ? null : covering[0];
    if (selected === null) {
      continue;
    }
    selectedIds.add(selected.candidateId);
    const selectedVerified = verifiedCapsOf(selected.candidateId, args.context);
    contents.push({
      action: 'apply',
      productId: selected.kind === 'product' ? selected.candidateId : null,
      toolId: selected.kind === 'tool' ? selected.candidateId : null,
      waitSeconds: null,
      rinse: null,
      reasons: [
        ...hardRefsForCapability(args.collected, capability).map(ref => `${ref} requires '${capability}'`),
        ...args.collected.hard.order
          .filter(edge => edge.before === capability || edge.after === capability)
          .map(edge => `Ordered by ${edge.ruleRef}: '${edge.before}' before '${edge.after}'`),
        ...args.collected.advisory
          .filter(entry => entry.polarity !== 'exclude' && selectedVerified.includes(entry.capability))
          .map(entry => `Advisory preference from ${entry.ruleRef} for '${entry.capability}'`),
      ],
    });
  }
  return { contents, selectedIds };
}

function timedStepContents(collected: CollectedEffects): StepContent[] {
  return [
    ...collected.hard.waits.map(wait => ({
      action: 'wait',
      productId: null,
      toolId: null,
      waitSeconds: wait.durationSeconds,
      rinse: null,
      reasons: [`${wait.ruleRef} requires a ${wait.durationSeconds}s wait`],
    })),
    ...collected.hard.rinses.map(rinse => ({
      action: rinse.value ? 'rinse' : 'leave_in',
      productId: null,
      toolId: null,
      waitSeconds: null,
      rinse: rinse.value,
      reasons: [`${rinse.ruleRef} ${rinse.value ? 'requires rinsing' : 'requires no rinse'}`],
    })),
  ];
}

function omissionEntries(ranking: CandidateRanking): string[] {
  return [
    ...ranking.rejected.map(
      entry => `Omitted ${entry.name} (${entry.candidateId}): ${entry.reasons.join('; ')}`,
    ),
    ...ranking.ranked
      .filter(score => !score.available)
      .map(score => `Unavailable ${score.name} (${score.candidateId}): not currently available`),
  ];
}

function alternativeEntries(ranking: CandidateRanking, selectedIds: ReadonlySet<string>): string[] {
  return ranking.ranked
    .filter(score => score.available && !selectedIds.has(score.candidateId))
    .slice(0, 2)
    .map(score => `Alternative: ${score.name} (${score.candidateId})`);
}

function buildReadyDecision(args: ProtocolBuildArgs): ProtocolDecision {
  const required = [...new Set(args.collected.hard.required.map(entry => entry.capability))];
  const ordered = orderCapabilities(required, args.collected.hard.order);
  const { contents, selectedIds } = applyStepContents(args, ordered);
  const steps: ProtocolStep[] = [...contents, ...timedStepContents(args.collected)].map(
    (content, index) => ({ ...content, stepId: `step-${index + 1}`, position: index + 1 }),
  );
  return {
    status: 'ready',
    requestId: args.requestId,
    confidence: deriveConfidence(args.evaluation, args.context, args.collected, selectedIds),
    steps,
    omissions: omissionEntries(args.ranking),
    alternatives: alternativeEntries(args.ranking, selectedIds),
    missingInputs: [],
    audit: assembleAudit(args, selectedIds, []),
  };
}

function scoreMatches(
  score: CandidateScore,
  context: RecommendationContext,
  capability: string,
): boolean {
  const candidate = [...context.products, ...context.tools].find(
    entry => candidateIdOf(entry) === score.candidateId,
  );
  return candidate !== undefined && candidate.verifiedCapabilities.includes(capability);
}

export function buildProtocolDecision(args: ProtocolBuildArgs): ProtocolDecision {
  const missing = hardUnknown(args.evaluation, args.context.rules);
  if (missing.length > 0) {
    return blockedDecision(args, 'needs_input', unionFacts(missing), []);
  }
  if (args.collected.conflicts.length > 0) {
    return blockedDecision(args, 'rule_conflict', [], []);
  }
  const required = [...new Set(args.collected.hard.required.map(entry => entry.capability))];
  const excluded = [...new Set(args.collected.hard.excluded.map(entry => entry.capability))];
  const gap = unsupportedGap(args.context, required, excluded);
  if (gap !== null) {
    return blockedDecision(args, 'unsupported', [], [gap]);
  }
  return buildReadyDecision(args);
}

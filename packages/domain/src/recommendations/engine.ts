import { collectEffects } from './apply-effects.ts';
import { buildProtocolDecision } from './build-protocol.ts';
import { evaluateRules } from './evaluate-rules.ts';
import { rankCandidates } from './rank-candidates.ts';
import { parseRecommendationContext } from './validate.ts';
import type { ProtocolDecision } from './types.ts';

export function generateProtocol(input: unknown): ProtocolDecision {
  const context = parseRecommendationContext(input);
  const evaluation = evaluateRules(context);
  const collected = collectEffects(evaluation, context.rules);
  const requiredCapabilities = [
    ...collected.hard.required.map(entry => entry.capability),
    ...collected.hard.activations.map(entry => entry.capability),
  ];
  const excludedCapabilities = [
    ...collected.hard.excluded.map(entry => entry.capability),
    ...collected.hard.heat.filter(entry => entry.prohibited).map(entry => entry.exposure),
  ];
  const ranking = rankCandidates({
    products: context.products,
    tools: context.tools,
    requiredCapabilities,
    excludedCapabilities,
    advisory: collected.advisory,
  });
  return buildProtocolDecision({
    requestId: context.requestId,
    context,
    evaluation,
    collected,
    ranking,
  });
}

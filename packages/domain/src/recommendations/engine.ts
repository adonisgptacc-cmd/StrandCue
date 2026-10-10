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
  const ranking = rankCandidates({
    products: context.products,
    tools: context.tools,
    requiredCapabilities: collected.hard.required.map(entry => entry.capability),
    excludedCapabilities: collected.hard.excluded.map(entry => entry.capability),
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

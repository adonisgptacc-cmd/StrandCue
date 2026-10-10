import type {
  FactValue,
  RecommendationCondition,
  RecommendationContext,
} from './types.ts';

export type ConditionValue = 'true' | 'false' | 'unknown';

export interface ConditionResult {
  readonly value: ConditionValue;
  readonly missingFacts: readonly string[];
}

function buildFactMap(context: RecommendationContext): ReadonlyMap<string, FactValue> {
  const merged = new Map<string, FactValue>();
  const sources = [context.environmentFacts, context.historyFacts, context.profileFacts];
  for (const source of sources) {
    for (const [fact, value] of Object.entries(source)) {
      if (!merged.has(fact)) {
        merged.set(fact, value);
      }
    }
  }
  if (!merged.has('goal')) {
    merged.set('goal', context.goal);
  }
  return merged;
}

function hasVerifiedAvailableCapability(
  context: RecommendationContext,
  capability: string,
): boolean {
  const candidates = [...context.products, ...context.tools];
  return candidates.some(
    candidate => candidate.available && candidate.verifiedCapabilities.includes(capability),
  );
}

function unionMissing(lists: readonly (readonly string[])[]): readonly string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const list of lists) {
    for (const fact of list) {
      if (!seen.has(fact)) {
        seen.add(fact);
        ordered.push(fact);
      }
    }
  }
  return ordered;
}

function evaluateLeaf(
  fact: string,
  test: (value: FactValue) => boolean,
  facts: ReadonlyMap<string, FactValue>,
): ConditionResult {
  if (!facts.has(fact) || facts.get(fact) === null) {
    return { value: 'unknown', missingFacts: [fact] };
  }
  return { value: test(facts.get(fact) as FactValue) ? 'true' : 'false', missingFacts: [] };
}

function evaluateNode(
  condition: RecommendationCondition,
  facts: ReadonlyMap<string, FactValue>,
  hasCapability: (capability: string) => boolean,
): ConditionResult {
  switch (condition.kind) {
    case 'fact_equals':
      return evaluateLeaf(condition.fact, value => value === condition.value, facts);
    case 'fact_in':
      return evaluateLeaf(condition.fact, value => condition.values.some(entry => entry === value), facts);
    case 'capability_available':
      return { value: hasCapability(condition.capability) ? 'true' : 'false', missingFacts: [] };
    case 'not': {
      const inner = evaluateNode(condition.condition, facts, hasCapability);
      if (inner.value === 'unknown') {
        return inner;
      }
      return { value: inner.value === 'true' ? 'false' : 'true', missingFacts: inner.missingFacts };
    }
    case 'all': {
      const results = condition.conditions.map(child => evaluateNode(child, facts, hasCapability));
      const missingFacts = unionMissing(results.map(result => result.missingFacts));
      if (results.some(result => result.value === 'false')) {
        return { value: 'false', missingFacts };
      }
      if (results.some(result => result.value === 'unknown')) {
        return { value: 'unknown', missingFacts };
      }
      return { value: 'true', missingFacts };
    }
    case 'any': {
      const results = condition.conditions.map(child => evaluateNode(child, facts, hasCapability));
      const missingFacts = unionMissing(results.map(result => result.missingFacts));
      if (results.some(result => result.value === 'true')) {
        return { value: 'true', missingFacts };
      }
      if (results.some(result => result.value === 'unknown')) {
        return { value: 'unknown', missingFacts };
      }
      return { value: 'false', missingFacts };
    }
  }
}

export function evaluateCondition(
  condition: RecommendationCondition,
  context: RecommendationContext,
): ConditionResult {
  return evaluateNode(
    condition,
    buildFactMap(context),
    capability => hasVerifiedAvailableCapability(context, capability),
  );
}

import { evaluateCondition } from './evaluate-condition.ts';
import type { RecommendationContext, RecommendationRule } from './types.ts';

export type RuleOutcome = 'applied' | 'not_applicable' | 'unknown' | 'withdrawn';

export interface RuleEvaluation {
  readonly ruleId: string;
  readonly versionId: string;
  readonly outcome: RuleOutcome;
  readonly missingFacts: readonly string[];
  readonly reason: string;
}

export interface RulesEvaluation {
  readonly applied: readonly RuleEvaluation[];
  readonly notApplicable: readonly RuleEvaluation[];
  readonly unknown: readonly RuleEvaluation[];
  readonly withdrawn: readonly RuleEvaluation[];
}

function compareRuleIdentity(left: RecommendationRule, right: RecommendationRule): number {
  if (left.ruleId !== right.ruleId) {
    return left.ruleId < right.ruleId ? -1 : 1;
  }
  if (left.versionId !== right.versionId) {
    return left.versionId < right.versionId ? -1 : 1;
  }
  return 0;
}

function evaluatePublishedRule(rule: RecommendationRule, context: RecommendationContext): RuleEvaluation {
  const result = evaluateCondition(rule.condition, context);
  const outcome: RuleOutcome =
    result.value === 'true' ? 'applied' : result.value === 'false' ? 'not_applicable' : 'unknown';
  return {
    ruleId: rule.ruleId,
    versionId: rule.versionId,
    outcome,
    missingFacts: result.missingFacts,
    reason: rule.reason,
  };
}

export function evaluateRules(context: RecommendationContext): RulesEvaluation {
  const ordered = [...context.rules].sort(compareRuleIdentity);
  const applied: RuleEvaluation[] = [];
  const notApplicable: RuleEvaluation[] = [];
  const unknown: RuleEvaluation[] = [];
  const withdrawn: RuleEvaluation[] = [];
  for (const rule of ordered) {
    if (rule.status === 'withdrawn') {
      withdrawn.push({
        ruleId: rule.ruleId,
        versionId: rule.versionId,
        outcome: 'withdrawn',
        missingFacts: [],
        reason: rule.reason,
      });
      continue;
    }
    const evaluation = evaluatePublishedRule(rule, context);
    if (evaluation.outcome === 'applied') {
      applied.push(evaluation);
    } else if (evaluation.outcome === 'unknown') {
      unknown.push(evaluation);
    } else {
      notApplicable.push(evaluation);
    }
  }
  return { applied, notApplicable, unknown, withdrawn };
}

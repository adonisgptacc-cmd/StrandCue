import type { RuleExpression } from '../contracts.js';
import type { FactResolution, ResolvedFact } from './state.js';
import { uniqueSorted } from './state.js';

export type Tristate = 'true' | 'false' | 'unknown';

export interface FactIssue {
  readonly factId: string;
  readonly resolution: Exclude<FactResolution, 'verified'>;
}

export interface ExpressionResult {
  readonly value: Tristate;
  readonly issues: readonly FactIssue[];
}

const resolve = (facts: ReadonlyMap<string, ResolvedFact>, factId: string): ResolvedFact =>
  facts.get(factId) ?? { factId, resolution: 'missing', fact: undefined };

const unresolved = (fact: ResolvedFact): ExpressionResult => ({
  value: 'unknown',
  issues: [{ factId: fact.factId, resolution: fact.resolution === 'verified' ? 'unknown' : fact.resolution }],
});

/**
 * Three-valued evaluation: only a current, verified fact can make a condition
 * true or false. Anything else is `unknown` and carries the reason, so callers
 * can fail closed instead of treating a missing fact as "no".
 */
export const evaluateExpression = (
  expression: RuleExpression,
  facts: ReadonlyMap<string, ResolvedFact>,
): ExpressionResult => {
  switch (expression.kind) {
    case 'fact_equals': {
      const fact = resolve(facts, expression.factId);
      const value = fact.fact?.value !== undefined ? fact.fact.value : fact.derivedValue;
      if (fact.resolution !== 'verified' || value === undefined) return unresolved(fact);
      return { value: value === expression.value ? 'true' : 'false', issues: [] };
    }
    case 'fact_in': {
      const fact = resolve(facts, expression.factId);
      const value = fact.fact?.value !== undefined ? fact.fact.value : fact.derivedValue;
      if (fact.resolution !== 'verified' || value === undefined) return unresolved(fact);
      return { value: expression.values.some((candidate) => candidate === value) ? 'true' : 'false', issues: [] };
    }
    case 'fact_exists': {
      const fact = resolve(facts, expression.factId);
      return fact.resolution === 'verified' ? { value: 'true', issues: [] } : unresolved(fact);
    }
    case 'not': {
      const inner = evaluateExpression(expression.expression, facts);
      if (inner.value === 'unknown') return inner;
      return { value: inner.value === 'true' ? 'false' : 'true', issues: [] };
    }
    case 'all':
    case 'any': {
      const results = expression.expressions.map((child) => evaluateExpression(child, facts));
      const decisive = expression.kind === 'all' ? 'false' : 'true';
      if (results.some((result) => result.value === decisive)) return { value: decisive, issues: [] };
      const open = results.filter((result) => result.value === 'unknown');
      if (open.length > 0) return { value: 'unknown', issues: dedupeIssues(open.flatMap((result) => result.issues)) };
      return { value: expression.kind === 'all' ? 'true' : 'false', issues: [] };
    }
  }
};

const dedupeIssues = (issues: readonly FactIssue[]): readonly FactIssue[] => {
  const byFact = new Map<string, FactIssue>();
  issues.forEach((issue) => {
    const existing = byFact.get(issue.factId);
    if (!existing || isBlockingResolution(issue.resolution)) byFact.set(issue.factId, issue);
  });
  return [...byFact.values()].sort((left, right) => (left.factId < right.factId ? -1 : left.factId > right.factId ? 1 : 0));
};

/** Withdrawn or contradictory facts cannot be fixed by asking again; they block. */
export const isBlockingResolution = (resolution: FactResolution): boolean =>
  resolution === 'withdrawn' || resolution === 'contradictory';

export const collectFactIds = (expression: RuleExpression): readonly string[] => {
  switch (expression.kind) {
    case 'fact_equals':
    case 'fact_in':
    case 'fact_exists':
      return [expression.factId];
    case 'not':
      return collectFactIds(expression.expression);
    case 'all':
    case 'any':
      return uniqueSorted(expression.expressions.flatMap(collectFactIds));
  }
};

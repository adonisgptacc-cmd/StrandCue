import type {
  RuleAuthoringBundle,
  RuleDiagnostic,
  RuleEffect,
  RuleExpression,
} from '../contracts.ts';
import { authoringDiagnostics } from './authoring-schema.ts';

type FactDomain = { readonly allowed: ReadonlySet<string> | undefined };
type ConjunctionDomain = { readonly facts: ReadonlyMap<string, FactDomain>; readonly impossible: boolean };

const valueKey = (value: string | number | boolean): string => JSON.stringify([typeof value, value]);

function conjunctionDomain(expression: RuleExpression): ConjunctionDomain | undefined {
  if (expression.kind === 'fact_exists') {
    return { facts: new Map([[expression.factId, { allowed: undefined }]]), impossible: false };
  }
  if (expression.kind === 'fact_equals' || expression.kind === 'fact_in') {
    const values = expression.kind === 'fact_equals' ? [expression.value] : expression.values;
    return { facts: new Map([[expression.factId, { allowed: new Set(values.map(valueKey)) }]]), impossible: false };
  }
  if (expression.kind !== 'all') return undefined;

  let merged: ConjunctionDomain = { facts: new Map(), impossible: false };
  for (const child of expression.expressions) {
    const next = conjunctionDomain(child);
    if (next === undefined) return undefined;
    if (merged.impossible || next.impossible) return { facts: merged.facts, impossible: true };
    const facts = new Map(merged.facts);
    for (const [factId, domain] of next.facts) {
      const current = facts.get(factId);
      if (current?.allowed === undefined) {
        facts.set(factId, domain);
      } else if (domain.allowed !== undefined) {
        const allowed = new Set([...current.allowed].filter((value) => domain.allowed?.has(value)));
        if (allowed.size === 0) return { facts, impossible: true };
        facts.set(factId, { allowed });
      }
    }
    merged = { facts, impossible: false };
  }
  return merged;
}

function impliesCondition(candidate: RuleExpression, prior: RuleExpression): boolean {
  const candidateDomain = conjunctionDomain(candidate);
  const priorDomain = conjunctionDomain(prior);
  if (candidateDomain?.impossible) return true;
  if (candidateDomain === undefined || priorDomain === undefined || priorDomain.impossible) return false;
  for (const [factId, priorFact] of priorDomain.facts) {
    const candidateFact = candidateDomain.facts.get(factId);
    if (candidateFact === undefined) return false;
    if (priorFact.allowed === undefined) continue;
    if (candidateFact.allowed === undefined) return false;
    if ([...candidateFact.allowed].some((value) => !priorFact.allowed?.has(value))) return false;
  }
  return true;
}

function provablyDisjoint(left: RuleExpression, right: RuleExpression): boolean {
  const leftDomain = conjunctionDomain(left);
  const rightDomain = conjunctionDomain(right);
  if (leftDomain?.impossible || rightDomain?.impossible) return true;
  if (leftDomain === undefined || rightDomain === undefined) return false;
  for (const [factId, leftFact] of leftDomain.facts) {
    const rightFact = rightDomain.facts.get(factId);
    if (leftFact.allowed !== undefined && rightFact?.allowed !== undefined
      && ![...leftFact.allowed].some((value) => rightFact.allowed?.has(value))) return true;
  }
  return false;
}

interface RuleView {
  readonly ruleId: string;
  readonly version: string;
  readonly severity: 'hard' | 'caution' | 'info';
  readonly effects: readonly RuleEffect[];
}

function toView(ruleId: string, version: string, severity: 'hard' | 'caution' | 'info', effects: readonly RuleEffect[]): RuleView {
  return { ruleId, version, severity, effects };
}

/**
 * Detect hard-rule capability conflicts: a capability that is both required
 * and excluded by hard rules cannot be satisfied, so publication must fail.
 */
function capabilityConflicts(ruleViews: readonly RuleView[]): RuleDiagnostic[] {
  const excludedBy = new Map<string, string[]>();
  const requiredBy = new Map<string, string[]>();
  for (const rule of ruleViews) {
    if (rule.severity !== 'hard') {
      continue;
    }
    for (const effect of rule.effects) {
      if (effect.kind === 'exclude_candidate') {
        const refs = excludedBy.get(effect.candidateId) ?? [];
        refs.push(`${rule.ruleId}@${rule.version}`);
        excludedBy.set(effect.candidateId, refs);
      } else if (effect.kind === 'include_candidate') {
        const refs = requiredBy.get(effect.candidateId) ?? [];
        refs.push(`${rule.ruleId}@${rule.version}`);
        requiredBy.set(effect.candidateId, refs);
      }
    }
  }
  const diagnostics: RuleDiagnostic[] = [];
  for (const [candidateId, requiredRefs] of requiredBy) {
    const excludedRefs = excludedBy.get(candidateId);
    if (excludedRefs === undefined) {
      continue;
    }
    const ruleId = [...new Set([...requiredRefs, ...excludedRefs])].sort()[0];
    diagnostics.push({
      code: 'hard-capability-conflict',
      severity: 'error',
      messageKey: 'hard.capability-conflict',
      ruleId,
    });
  }
  return diagnostics;
}

/**
 * Static analysis of an authoring bundle. Returns diagnostics (never throws)
 * for problems that must block publication:
 *
 * - unreachable rows: in a `first` hit-policy table, a later row with the same
 *   condition as an earlier row can never fire;
 * - overlapping cells: in a `unique` hit-policy table, two rows with the same
 *   condition are inconsistent with the hit policy;
 * - unresolved hard conflicts: a capability both required and excluded by hard
 *   rules cannot be satisfied, so publication must fail;
 * - missing fixtures: a hard rule without a required-fixture entry covering
 *   both a positive and a negative fixture.
 */
export function analyzeRules(bundle: RuleAuthoringBundle): readonly RuleDiagnostic[] {
  const diagnostics: RuleDiagnostic[] = [];

  for (const problem of authoringDiagnostics(bundle)) {
    diagnostics.push({
      code: problem.code,
      severity: 'error',
      messageKey: `authoring.${problem.code}`,
    });
  }

  // Flatten tables and constraints into rule views for conflict analysis.
  const ruleViews: RuleView[] = [];
  for (const table of bundle.tables) {
    for (const row of table.rows) {
      ruleViews.push(toView(`${table.tableId}::${row.rowId}`, '1', row.severity, row.effects));
    }
  }
  for (const constraint of bundle.constraints) {
    ruleViews.push(toView(constraint.ruleId, constraint.version, constraint.severity, constraint.effects));
  }

  diagnostics.push(...capabilityConflicts(ruleViews));

  // Hit-policy row analysis. Unsupported unique expressions are treated as
  // potentially overlapping; a unique table must prove each pair disjoint.
  for (const table of bundle.tables) {
    for (let index = 0; index < table.rows.length; index += 1) {
      const row = table.rows[index];
      const previousRows = table.rows.slice(0, index);
      if (table.hitPolicy === 'first' && previousRows.some((prior) => impliesCondition(row.when, prior.when))) {
        diagnostics.push({
          code: 'unreachable-row',
          severity: 'error',
          messageKey: 'first.unreachable-row',
          ruleId: `${table.tableId}::${row.rowId}`,
          rowId: row.rowId,
        });
      }
      if (table.hitPolicy === 'unique' && previousRows.some((prior) => !provablyDisjoint(row.when, prior.when))) {
        diagnostics.push({
          code: 'overlapping-cells-unique',
          severity: 'error',
          messageKey: 'unique.overlapping-cells',
          ruleId: `${table.tableId}::${row.rowId}`,
          rowId: row.rowId,
        });
      }
    }
  }

  // Fixture coverage: every hard rule must declare positive and negative fixtures.
  const hardRuleIds = new Set<string>();
  for (const view of ruleViews) {
    if (view.severity === 'hard') {
      hardRuleIds.add(view.ruleId);
    }
  }
  const coveredRuleIds = new Set(bundle.requiredFixtures.map((fixture) => fixture.ruleId));
  for (const ruleId of [...hardRuleIds].sort()) {
    if (coveredRuleIds.has(ruleId)) {
      continue;
    }
    diagnostics.push({
      code: 'missing-fixture',
      severity: 'error',
      messageKey: 'hard.missing-fixture',
      ruleId,
    });
  }

  return diagnostics;
}

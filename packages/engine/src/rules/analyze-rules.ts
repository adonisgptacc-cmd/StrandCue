import type {
  RuleAuthoringBundle,
  RuleDiagnostic,
  RuleEffect,
  RuleExpression,
} from '../contracts.ts';
import { collectFactIds } from '../pipeline/evaluate-expression.ts';
import { authoringDiagnostics } from './authoring-schema.ts';

const valueKey = (value: string | number | boolean): string => JSON.stringify([typeof value, value]);

type AtomicExpression = Extract<RuleExpression, { readonly kind: 'fact_equals' | 'fact_in' | 'fact_exists' }>;
type Satisfiability = 'satisfiable' | 'unsatisfiable' | 'unknown';
const MAX_SAT_ASSIGNMENTS = 4096;
const OTHER_VALUE: unique symbol = Symbol('other fact value');
type AbstractValue = string | number | boolean | typeof OTHER_VALUE | undefined;
interface AbstractFact {
  readonly verified: boolean;
  readonly value: AbstractValue;
}
type FactAssignment = ReadonlyMap<string, AbstractFact>;
type TruthValue = 'true' | 'false' | 'unknown';

function collectFactValues(expression: RuleExpression, values: Map<string, Map<string, string | number | boolean>>): void {
  if (expression.kind === 'not') {
    collectFactValues(expression.expression, values);
    return;
  }
  if (expression.kind === 'all' || expression.kind === 'any') {
    expression.expressions.forEach((child) => collectFactValues(child, values));
    return;
  }
  const atomic = expression as AtomicExpression;
  if (atomic.kind === 'fact_exists') return;

  const factValues = values.get(atomic.factId) ?? new Map<string, string | number | boolean>();
  const testedValues = atomic.kind === 'fact_equals' ? [atomic.value] : atomic.values;
  testedValues.forEach((value) => factValues.set(valueKey(value), value));
  values.set(atomic.factId, factValues);
}

function evaluateAbstractExpression(expression: RuleExpression, facts: FactAssignment): TruthValue {
  if (expression.kind === 'not') {
    const inner = evaluateAbstractExpression(expression.expression, facts);
    return inner === 'unknown' ? 'unknown' : inner === 'true' ? 'false' : 'true';
  }
  if (expression.kind === 'fact_exists') {
    return facts.get(expression.factId)?.verified === true ? 'true' : 'unknown';
  }
  if (expression.kind === 'fact_equals' || expression.kind === 'fact_in') {
    const fact = facts.get(expression.factId);
    if (fact?.verified !== true) return 'unknown';
    const testedValues = expression.kind === 'fact_equals' ? [expression.value] : expression.values;
    return testedValues.some((value) => value === fact.value) ? 'true' : 'false';
  }

  const results = expression.expressions.map((child) => evaluateAbstractExpression(child, facts));
  if (expression.kind === 'all') {
    if (results.includes('false')) return 'false';
    return results.includes('unknown') ? 'unknown' : 'true';
  }
  if (results.includes('true')) return 'true';
  return results.includes('unknown') ? 'unknown' : 'false';
}

/**
 * Enumerate representative fact states for a finite abstraction of the DSL.
 * Each referenced value gets an exact domain point, alongside an unverified
 * state and an "other" verified value. Enumeration is bounded; overflow is
 * unknown and therefore never proves disjointness or implication.
 */
function findSatisfyingAssignment(
  expressions: readonly RuleExpression[],
  predicate: (facts: FactAssignment) => boolean,
): Satisfiability {
  const values = new Map<string, Map<string, string | number | boolean>>();
  expressions.forEach((expression) => collectFactValues(expression, values));
  const factIds = [...new Set(expressions.flatMap((expression) => collectFactIds(expression)))].sort();
  const domains: readonly AbstractFact[][] = factIds.map((factId) => {
    const exactValues = [...(values.get(factId)?.values() ?? [])].map((value): AbstractFact => ({ verified: true, value }));
    return [{ verified: false, value: undefined }, ...exactValues, { verified: true, value: OTHER_VALUE }];
  });
  const assignmentCount = domains.reduce((count, domain) => count * domain.length, 1);
  if (assignmentCount > MAX_SAT_ASSIGNMENTS) return 'unknown';

  const assignment = new Map<string, AbstractFact>();
  const visit = (index: number): boolean => {
    if (index === factIds.length) return predicate(assignment);
    const factId = factIds[index];
    for (const value of domains[index]) {
      assignment.set(factId, value);
      if (visit(index + 1)) return true;
    }
    assignment.delete(factId);
    return false;
  };
  return visit(0) ? 'satisfiable' : 'unsatisfiable';
}

function provablyDisjoint(left: RuleExpression, right: RuleExpression): boolean {
  return findSatisfyingAssignment([left, right], (facts) =>
    evaluateAbstractExpression(left, facts) === 'true'
      && evaluateAbstractExpression(right, facts) === 'true') === 'unsatisfiable';
}

const preservesRestriction = (effects: readonly RuleEffect[]): boolean => effects.length > 0 && effects.every((effect) => {
  if (effect.kind === 'block' || effect.kind === 'ask_question' || effect.kind === 'exclude_candidate'
    || effect.kind === 'require_prerequisite' || effect.kind === 'insert_wait') return true;
  return effect.kind === 'set_heat_assessment' && (effect.state === 'no_heat' || effect.state === 'restricted');
});

function canSelectFirstHitRow(
  table: RuleAuthoringBundle['tables'][number],
  tableRules: readonly RuleView[],
  rowIndex: number,
): Satisfiability {
  const expressions = table.rows.map((row) => row.when);
  return findSatisfyingAssignment(expressions, (facts) => {
    const matches = table.rows.map((row, index) => {
      const rule = tableRules.find((candidate) => candidate.table?.rowOrder === index);
      if (index < rowIndex && (rule?.capabilityIds.length ?? 0) > 0) return 'false';
      return evaluateAbstractExpression(row.when, facts);
    });
    const firstIndex = matches.findIndex((value) => value !== 'false');
    if (firstIndex < 0) return false;
    if (matches[firstIndex] === 'true') return firstIndex === rowIndex;
    if (firstIndex === rowIndex) return true;
    return rowIndex > firstIndex
      && table.rows[rowIndex].severity === 'hard'
      && matches[rowIndex] !== 'false'
      && preservesRestriction(table.rows[rowIndex].effects);
  });
}

function stageForEffect(effect: RuleEffect): string {
  switch (effect.kind) {
    case 'block': return 'apply_safety_restrictions';
    case 'set_heat_assessment': return 'evaluate_heat';
    case 'require_prerequisite':
    case 'insert_wait': return 'build_dependency_graph';
    case 'exclude_candidate': return 'filter_candidates';
    case 'include_candidate': return 'load_verified_facts';
    case 'ask_question': return 'select_and_rank';
  }
}

interface RuleView {
  readonly ruleId: string;
  readonly version: string;
  readonly severity: 'hard' | 'caution' | 'info';
  readonly effects: readonly RuleEffect[];
  readonly when: RuleExpression;
  readonly capabilityIds: readonly string[];
  readonly table?: { readonly tableId: string; readonly hitPolicy: 'first' | 'collect' | 'unique'; readonly rowOrder: number };
}

function toView(
  ruleId: string,
  version: string,
  severity: 'hard' | 'caution' | 'info',
  effects: readonly RuleEffect[],
  when: RuleExpression,
  capabilityIds: readonly string[],
  table?: RuleView['table'],
): RuleView {
  return { ruleId, version, severity, effects, when, capabilityIds, table };
}

/**
 * Detect hard-rule capability conflicts: a capability that is both required
 * and excluded by hard rules cannot be satisfied, so publication must fail.
 */
function capabilityConflicts(ruleViews: readonly RuleView[]): RuleDiagnostic[] {
  const excludedBy = new Map<string, RuleView[]>();
  const requiredBy = new Map<string, RuleView[]>();
  for (const rule of ruleViews) {
    if (rule.severity !== 'hard') {
      continue;
    }
    for (const effect of rule.effects) {
      if (effect.kind === 'exclude_candidate') {
        const refs = excludedBy.get(effect.candidateId) ?? [];
        refs.push(rule);
        excludedBy.set(effect.candidateId, refs);
      } else if (effect.kind === 'include_candidate') {
        const refs = requiredBy.get(effect.candidateId) ?? [];
        refs.push(rule);
        requiredBy.set(effect.candidateId, refs);
      }
    }
  }
  const diagnostics: RuleDiagnostic[] = [];
  for (const [candidateId, requiredRules] of requiredBy) {
    for (const required of requiredRules) {
      const conflicting = (excludedBy.get(candidateId) ?? []).find((excluded) => {
        const sameFirstTable = required.table?.tableId === excluded.table?.tableId
          && required.table?.hitPolicy === 'first'
          && excluded.table?.hitPolicy === 'first';
        if (sameFirstTable) return false;
        return !provablyDisjoint(required.when, excluded.when);
      });
      if (conflicting === undefined) continue;
      diagnostics.push({
        code: 'hard-capability-conflict',
        severity: 'error',
        messageKey: 'hard.capability-conflict',
        ruleId: [required, conflicting].map((rule) => `${rule.ruleId}@${rule.version}`).sort()[0],
      });
    }
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
    for (const [rowOrder, row] of table.rows.entries()) {
      ruleViews.push(toView(`${table.tableId}::${row.rowId}`, '1', row.severity, row.effects, row.when, row.capabilityIds, {
        tableId: table.tableId,
        hitPolicy: table.hitPolicy,
        rowOrder,
      }));
    }
  }
  for (const constraint of bundle.constraints) {
    ruleViews.push(toView(constraint.ruleId, constraint.version, constraint.severity, constraint.effects, constraint.when, constraint.capabilityIds));
  }

  diagnostics.push(...capabilityConflicts(ruleViews));

  // A compiled rule has one stage owner; effects from multiple owners cannot
  // be routed atomically by the current evaluator.
  for (const rule of ruleViews) {
    const stages = new Set(rule.effects.map(stageForEffect));
    if (stages.size > 1) {
      diagnostics.push({
        code: 'cross-stage-effects',
        severity: 'error',
        messageKey: 'effects.cross-stage',
        ruleId: rule.ruleId,
      });
    }
  }

  // Hit-policy row analysis. Unsupported unique expressions are treated as
  // potentially overlapping; a unique table must prove each pair disjoint.
  for (const table of bundle.tables) {
    for (let index = 0; index < table.rows.length; index += 1) {
      const row = table.rows[index];
      const previousRows = table.rows.slice(0, index);
      const tableRules = ruleViews.filter((rule) => rule.table?.tableId === table.tableId);
      if (table.hitPolicy === 'first' && canSelectFirstHitRow(table, tableRules, index) === 'unsatisfiable') {
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

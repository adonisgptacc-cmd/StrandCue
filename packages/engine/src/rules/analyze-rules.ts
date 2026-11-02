import type {
  RuleAuthoringBundle,
  RuleDiagnostic,
  RuleEffect,
  RuleExpression,
} from '../contracts.ts';
import { authoringDiagnostics } from './authoring-schema.ts';

const valueKey = (value: string | number | boolean): string => JSON.stringify([typeof value, value]);

type AtomicExpression = Extract<RuleExpression, { readonly kind: 'fact_equals' | 'fact_in' | 'fact_exists' }>;
interface Literal {
  readonly expression: AtomicExpression;
  readonly positive: boolean;
}
type Dnf = readonly (readonly Literal[])[];
type Satisfiability = 'satisfiable' | 'unsatisfiable' | 'unknown';
const MAX_DNF_TERMS = 256;

/** Convert supported boolean expressions to bounded DNF, retaining unknown on overflow. */
function toDnf(expression: RuleExpression, negated = false): Dnf | undefined {
  if (expression.kind === 'not') return toDnf(expression.expression, !negated);
  if (expression.kind !== 'all' && expression.kind !== 'any') {
    return [[{ expression: expression as AtomicExpression, positive: !negated }]];
  }

  const isConjunction = (expression.kind === 'all') !== negated;
  const children = expression.expressions.map((child) => toDnf(child, negated));
  if (children.some((child) => child === undefined)) return undefined;
  const alternatives = children as Dnf[];
  if (!isConjunction) {
    const terms = alternatives.flat();
    return terms.length <= MAX_DNF_TERMS ? terms : undefined;
  }

  let terms: Dnf = [[]];
  for (const childTerms of alternatives) {
    const product: Literal[][] = [];
    for (const term of terms) {
      for (const childTerm of childTerms) {
        product.push([...term, ...childTerm]);
        if (product.length > MAX_DNF_TERMS) return undefined;
      }
    }
    terms = product;
  }
  return terms;
}

function termSatisfiable(term: readonly Literal[]): boolean {
  const facts = new Map<string, { verified: boolean; absent: boolean; included?: Set<string>; excluded: Set<string> }>();
  for (const { expression, positive } of term) {
    const current = facts.get(expression.factId) ?? { verified: false, absent: false, excluded: new Set<string>() };
    if (expression.kind === 'fact_exists') {
      if (positive) current.verified = true;
      else current.absent = true;
    } else {
      current.verified = true;
      const values = expression.kind === 'fact_equals' ? [expression.value] : expression.values;
      const valueKeys = values.map(valueKey);
      if (positive) {
        const allowed = new Set(valueKeys);
        current.included = current.included === undefined
          ? allowed
          : new Set([...current.included].filter((value) => allowed.has(value)));
      } else {
        valueKeys.forEach((value) => current.excluded.add(value));
      }
    }
    if (current.verified && current.absent) return false;
    if (current.included !== undefined
      && (current.included.size === 0 || [...current.included].every((value) => current.excluded.has(value)))) return false;
    facts.set(expression.factId, current);
  }
  return true;
}

function expressionSatisfiable(expression: RuleExpression): Satisfiability {
  const terms = toDnf(expression);
  if (terms === undefined) return 'unknown';
  return terms.some(termSatisfiable) ? 'satisfiable' : 'unsatisfiable';
}

function conjunctionSatisfiable(left: RuleExpression, right: RuleExpression): Satisfiability {
  return expressionSatisfiable({ kind: 'all', expressions: [left, right] });
}

function impliesCondition(candidate: RuleExpression, prior: RuleExpression): boolean {
  const notPrior: RuleExpression = { kind: 'not', expression: prior };
  return conjunctionSatisfiable(candidate, notPrior) === 'unsatisfiable';
}

function provablyDisjoint(left: RuleExpression, right: RuleExpression): boolean {
  return conjunctionSatisfiable(left, right) === 'unsatisfiable';
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
  readonly table?: { readonly tableId: string; readonly hitPolicy: 'first' | 'collect' | 'unique'; readonly rowOrder: number };
}

function toView(
  ruleId: string,
  version: string,
  severity: 'hard' | 'caution' | 'info',
  effects: readonly RuleEffect[],
  when: RuleExpression,
  table?: RuleView['table'],
): RuleView {
  return { ruleId, version, severity, effects, when, table };
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
      ruleViews.push(toView(`${table.tableId}::${row.rowId}`, '1', row.severity, row.effects, row.when, {
        tableId: table.tableId,
        hitPolicy: table.hitPolicy,
        rowOrder,
      }));
    }
  }
  for (const constraint of bundle.constraints) {
    ruleViews.push(toView(constraint.ruleId, constraint.version, constraint.severity, constraint.effects, constraint.when));
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

import type {
  RuleAuthoringBundle,
  RuleDiagnostic,
  RuleEffect,
} from '../contracts.ts';
import { authoringDiagnostics } from './authoring-schema.ts';

function expressionKey(expression: unknown): string {
  return JSON.stringify(expression);
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

  // Hit-policy row analysis.
  for (const table of bundle.tables) {
    const seenConditions = new Map<string, string>();
    for (const row of table.rows) {
      const key = expressionKey(row.when);
      const previous = seenConditions.get(key);
      if (previous === undefined) {
        seenConditions.set(key, row.rowId);
        continue;
      }
      if (table.hitPolicy === 'unique') {
        diagnostics.push({
          code: 'overlapping-cells-unique',
          severity: 'error',
          messageKey: 'unique.overlapping-cells',
          ruleId: `${table.tableId}::${row.rowId}`,
          rowId: row.rowId,
        });
      } else if (table.hitPolicy === 'first') {
        diagnostics.push({
          code: 'unreachable-row',
          severity: 'warning',
          messageKey: 'first.unreachable-row',
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

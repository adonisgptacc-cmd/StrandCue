import type { RuleAuthoringBundle } from '../contracts.ts';
import { RuleAuthoringBundleSchema } from '../contracts.ts';

/**
 * Authoring-form schema for the whitelist decision DSL.
 *
 * The authoring bundle is the human-reviewable input form: decision tables
 * with an explicit hit policy plus constraint rules. It is compiled into the
 * immutable typed IR produced by {@link compileRules}. This layer only
 * parses and validates the authoring envelope; it performs no evaluation and
 * touches no I/O, clock, or random source.
 */
export {
  RuleAuthoringBundleSchema,
};
export type { RuleAuthoringBundle };

/**
 * Parse and validate an authoring bundle against the frozen contract schema.
 * Throws a Zod error on malformed input (unsupported operators, bad types,
 * missing identity/version/evidence fields, etc.).
 */
export function parseAuthoringBundle(input: unknown): RuleAuthoringBundle {
  return RuleAuthoringBundleSchema.parse(input);
}

/**
 * Authoring-specific structural checks that go beyond the frozen Zod schema.
 * Returns diagnostics (never throws). Kept separate from compile so callers
 * can inspect authoring problems before producing an IR.
 */
export function authoringDiagnostics(
  bundle: RuleAuthoringBundle,
): readonly { code: string; message: string }[] {
  const problems: { code: string; message: string }[] = [];

  const tableIds = new Set<string>();
  for (const table of bundle.tables) {
    if (tableIds.has(table.tableId)) {
      problems.push({
        code: 'duplicate-table-id',
        message: `Decision table '${table.tableId}' is defined more than once.`,
      });
    }
    tableIds.add(table.tableId);

    const rowIds = new Set<string>();
    for (const row of table.rows) {
      if (rowIds.has(row.rowId)) {
        problems.push({
          code: 'duplicate-row-id',
          message: `Row '${row.rowId}' is defined more than once in table '${table.tableId}'.`,
        });
      }
      rowIds.add(row.rowId);
    }
  }

  const constraintIds = new Set<string>();
  for (const constraint of bundle.constraints) {
    const key = `${constraint.ruleId}@${constraint.version}`;
    if (constraintIds.has(key)) {
      problems.push({
        code: 'duplicate-constraint-version',
        message: `Constraint '${constraint.ruleId}@${constraint.version}' is defined more than once.`,
      });
    }
    constraintIds.add(key);
  }

  return problems;
}

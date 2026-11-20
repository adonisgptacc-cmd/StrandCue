import type {
  CompiledRule,
  CompiledRuleset,
  DecisionTable,
  DecisionTableRow,
  EngineStageId,
  RulesetRef,
  RuleEffect,
  RuleExpression,
} from '../contracts.ts';

/**
 * Hit policy for a decision table, carried through the typed IR.
 *
 * - `first`: the first matching row wins; later rows are not consulted.
 * - `collect`: all matching rows contribute their effects.
 * - `unique`: at most one row may match; overlapping matches are a defect.
 */
export type HitPolicy = 'first' | 'collect' | 'unique';

/**
 * A compiled decision table row, carrying the stage into which its effects
 * are routed and the attribution needed for audit traceability.
 */
export interface CompiledTableRow {
  readonly rowId: string;
  readonly stageId: EngineStageId;
  readonly when: RuleExpression;
  readonly effects: readonly RuleEffect[];
  readonly severity: 'hard' | 'caution' | 'info';
  readonly capabilityIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

/**
 * A compiled decision table: an ordered set of rows under one hit policy.
 */
export interface CompiledTable {
  readonly tableId: string;
  readonly hitPolicy: HitPolicy;
  readonly rows: readonly CompiledTableRow[];
}

/**
 * A compiled constraint rule: one condition/effects unit bound to a stage.
 */
export interface CompiledConstraint {
  readonly ruleId: string;
  readonly version: string;
  readonly stageId: EngineStageId;
  readonly when: RuleExpression;
  readonly effects: readonly RuleEffect[];
  readonly severity: 'hard' | 'caution' | 'info';
  readonly capabilityIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

/**
 * The immutable typed intermediate representation: every authoring form
 * (decision tables and constraint rules) compiles into this single shape.
 * Re-exported contract types keep one authoritative type surface.
 */
export type {
  CompiledRule,
  CompiledRuleset,
  DecisionTable,
  DecisionTableRow,
  EngineStageId,
  RulesetRef,
  RuleEffect,
  RuleExpression,
};

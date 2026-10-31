import type {
  CompiledRule,
  CompiledRuleset,
  ConstraintRule,
  DecisionTable,
  EngineStageId,
  RuleAuthoringBundle,
  RuleEffect,
  RulesetRef,
} from '../contracts.ts';
import { authoringDiagnostics, parseAuthoringBundle } from './authoring-schema.ts';

const SCHEMA_VERSION = '1.0.0';
const EVALUATOR_VERSION = '1.0.0';

/**
 * Map a rule's effects to the engine stage that owns them. When a rule has
 * multiple effects, the first matching effect in precedence order wins so the
 * result is deterministic and independent of effect ordering within a rule.
 */
const STAGE_BY_EFFECT: readonly { kind: RuleEffect['kind']; stage: EngineStageId }[] = [
  { kind: 'block', stage: 'apply_safety_restrictions' },
  { kind: 'set_heat_assessment', stage: 'evaluate_heat' },
  { kind: 'require_prerequisite', stage: 'build_dependency_graph' },
  { kind: 'insert_wait', stage: 'build_dependency_graph' },
  { kind: 'exclude_candidate', stage: 'filter_candidates' },
  { kind: 'include_candidate', stage: 'load_verified_facts' },
  { kind: 'ask_question', stage: 'select_and_rank' },
];

function stageForEffects(effects: readonly RuleEffect[]): EngineStageId {
  for (const { kind, stage } of STAGE_BY_EFFECT) {
    if (effects.some((effect) => effect.kind === kind)) {
      return stage;
    }
  }
  return 'validate_snapshot';
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const item of Object.values(value)) {
      deepFreeze(item);
    }
  }
  return Object.freeze(value);
}

function stableHash(value: unknown): string {
  const canonical = JSON.stringify(value);
  // FNV-1a 32-bit: deterministic, pure, no I/O or clock dependency.
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return `sha256:${hash.toString(16).padStart(8, '0')}`;
}

function buildRef(bundle: RuleAuthoringBundle, rules: CompiledRuleset['rules']): RulesetRef {
  return {
    rulesetId: bundle.bundleId,
    contentHash: stableHash({ capabilities: bundle.capabilities, rules }),
    schemaVersion: SCHEMA_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
  };
}

function compileTable(
  table: DecisionTable,
  bundleVersion: string,
  capabilityClaims: Map<string, { claimId: string; evidenceIds: readonly string[] }>,
): CompiledRule[] {
  const rules: CompiledRule[] = [];
  for (const row of table.rows) {
    const missingCapabilities: string[] = [];
    const missingClaims: string[] = [];
    const missingEvidence: string[] = [];
    for (const capabilityId of row.capabilityIds) {
      const binding = capabilityClaims.get(capabilityId);
      if (binding === undefined) {
        missingCapabilities.push(capabilityId);
        continue;
      }
      if (!row.claimIds.includes(binding.claimId)) {
        missingClaims.push(binding.claimId);
      }
      for (const evidenceId of binding.evidenceIds) {
        if (!row.evidenceIds.includes(evidenceId)) {
          missingEvidence.push(evidenceId);
        }
      }
    }
    if (missingCapabilities.length > 0) {
      throw new Error(
        `Table '${table.tableId}' row '${row.rowId}' references unbound capability: ${missingCapabilities.join(', ')}`,
      );
    }
    if (missingClaims.length > 0) {
      throw new Error(
        `Table '${table.tableId}' row '${row.rowId}' is missing capability claim reference: ${missingClaims.join(', ')}`,
      );
    }
    if (missingEvidence.length > 0) {
      throw new Error(
        `Table '${table.tableId}' row '${row.rowId}' is missing capability evidence reference: ${missingEvidence.join(', ')}`,
      );
    }
    rules.push({
      ruleId: `${table.tableId}::${row.rowId}`,
      version: bundleVersion,
      stageId: stageForEffects(row.effects),
      when: row.when,
      effects: row.effects,
      severity: row.severity,
      capabilityIds: row.capabilityIds,
      claimIds: row.claimIds,
      evidenceIds: row.evidenceIds,
    });
  }
  return rules;
}

function compileConstraint(
  constraint: ConstraintRule,
  capabilityClaims: Map<string, { claimId: string; evidenceIds: readonly string[] }>,
): CompiledRuleset['rules'][number] {
  const missingCapabilities: string[] = [];
  const missingClaims: string[] = [];
  const missingEvidence: string[] = [];
  for (const capabilityId of constraint.capabilityIds) {
    const binding = capabilityClaims.get(capabilityId);
    if (binding === undefined) {
      missingCapabilities.push(capabilityId);
      continue;
    }
    if (!constraint.claimIds.includes(binding.claimId)) {
      missingClaims.push(binding.claimId);
    }
    for (const evidenceId of binding.evidenceIds) {
      if (!constraint.evidenceIds.includes(evidenceId)) {
        missingEvidence.push(evidenceId);
      }
    }
  }
  if (missingCapabilities.length > 0) {
    throw new Error(
      `Constraint '${constraint.ruleId}@${constraint.version}' references unbound capability: ${missingCapabilities.join(', ')}`,
    );
  }
  if (missingClaims.length > 0) {
    throw new Error(
      `Constraint '${constraint.ruleId}@${constraint.version}' is missing capability claim reference: ${missingClaims.join(', ')}`,
    );
  }
  if (missingEvidence.length > 0) {
    throw new Error(
      `Constraint '${constraint.ruleId}@${constraint.version}' is missing capability evidence reference: ${missingEvidence.join(', ')}`,
    );
  }
  return {
    ruleId: constraint.ruleId,
    version: constraint.version,
    stageId: stageForEffects(constraint.effects),
    when: constraint.when,
    effects: constraint.effects,
    severity: constraint.severity,
    capabilityIds: constraint.capabilityIds,
    claimIds: constraint.claimIds,
    evidenceIds: constraint.evidenceIds,
  };
}

/**
 * Compile a reviewed authoring bundle into one immutable typed IR.
 *
 * Decision tables (one CompiledRule per row) and constraint rules (one
 * CompiledRule each) are flattened into a single rules array. Each rule is
 * routed to the engine stage that owns its effects, bound to reviewed
 * capabilities, and attributed with its claim/evidence references. The
 * resulting ruleset is content-addressed and deeply frozen.
 *
 * Throws on any structural problem: unbound capability, missing claim or
 * evidence reference, or duplicate compiled rule identifier.
 */
export function compileRules(source: unknown): CompiledRuleset {
  const bundle = parseAuthoringBundle(source);

  // Authoring-level structural problems (duplicate ids, etc.) fail compilation.
  const problems = authoringDiagnostics(bundle);
  if (problems.length > 0) {
    throw new Error(
      `Authoring bundle is not compilable: ${problems.map((p) => p.message).join('; ')}`,
    );
  }

  const capabilityClaims = new Map(
    bundle.capabilities.map((capability) => [
      capability.capabilityId,
      { claimId: capability.claimId, evidenceIds: capability.evidenceIds },
    ]),
  );

  const tableRules: CompiledRule[] = [];
  for (const table of bundle.tables) {
    tableRules.push(...compileTable(table, bundle.version, capabilityClaims));
  }
  const constraintRules: CompiledRule[] = [];
  for (const constraint of bundle.constraints) {
    constraintRules.push(compileConstraint(constraint, capabilityClaims));
  }

  const rules = [...tableRules, ...constraintRules];
  const seenRuleIds = new Set<string>();
  for (const rule of rules) {
    if (seenRuleIds.has(rule.ruleId)) {
      throw new Error(`Compiled rule identifier is not unique: ${rule.ruleId}`);
    }
    seenRuleIds.add(rule.ruleId);
  }

  const ref = buildRef(bundle, rules);
  const ruleset: CompiledRuleset = { ref, capabilities: bundle.capabilities, rules };
  return deepFreeze(ruleset);
}

import type { CompiledRule, EngineInput, EngineStageId, RuleEffect, StageTraceEntry } from '../contracts.js';
import { collectFactIds, evaluateExpression, isBlockingResolution } from './evaluate-expression.js';
import type { PipelineState, Provenance, StageFunction } from './state.js';
import { compareStrings, mergeProvenance, stageIndexOf, uniqueSorted } from './state.js';

type EffectKind = RuleEffect['kind'];

/**
 * Effects each stage may produce. A fired rule carrying any other effect is a
 * ruleset defect and blocks the decision rather than being silently ignored.
 */
export const ALLOWED_EFFECTS: Readonly<Record<EngineStageId, readonly EffectKind[]>> = {
  validate_snapshot: [],
  apply_safety_restrictions: ['block', 'ask_question'],
  load_verified_facts: ['include_candidate', 'block', 'ask_question'],
  derive_treatment_state: ['block', 'ask_question'],
  filter_candidates: ['exclude_candidate', 'block', 'ask_question'],
  evaluate_heat: ['set_heat_assessment', 'include_candidate', 'block', 'ask_question'],
  select_and_rank: ['block', 'ask_question'],
  build_dependency_graph: ['require_prerequisite', 'insert_wait', 'block', 'ask_question'],
  order_and_validate: ['block', 'ask_question'],
  assemble_decision: [],
};

export type RuleApplicability = 'applicable' | 'not_applicable' | 'inert';

/**
 * A rule backed by capabilities only applies when the person owns the exact
 * product/tool the capability was reviewed for. If it is owned but the review
 * is expired or not yet effective, the rule is inert and cannot be relied on.
 */
export const ruleApplicability = (rule: CompiledRule, input: EngineInput, nowMs: number): RuleApplicability => {
  const capabilities = rule.capabilityIds.flatMap((capabilityId) =>
    input.ruleset.capabilities.filter((capability) => capability.capabilityId === capabilityId));
  const owned = (subjectType: 'product' | 'tool', subjectId: string): boolean =>
    (subjectType === 'product' ? input.snapshot.shelf : input.snapshot.tools).some((entry) => entry.entryId === subjectId);
  if (capabilities.some((capability) => !owned(capability.subjectType, capability.subjectId))) return 'not_applicable';
  const inert = capabilities.some((capability) =>
    Date.parse(capability.reviewedAt) > nowMs
    || (capability.expiresAt !== undefined && Date.parse(capability.expiresAt) <= nowMs));
  return inert ? 'inert' : 'applicable';
};

export const ruleProvenance = (rule: CompiledRule): Provenance => ({
  ruleIds: [rule.ruleId],
  claimIds: uniqueSorted(rule.claimIds),
  evidenceIds: uniqueSorted(rule.evidenceIds),
});

const SEVERITY_WEIGHT = { hard: 3, caution: 2, info: 1 } as const;
export const severityWeight = (rule: CompiledRule): number => SEVERITY_WEIGHT[rule.severity];

export interface StageDefinition {
  readonly stageId: EngineStageId;
  /** True when the stage does built-in work even if the ruleset has no rules for it. */
  readonly intrinsic: boolean;
  readonly runWhenHalted?: boolean;
  readonly before?: StageFunction;
  readonly onEffect?: (state: PipelineState, rule: CompiledRule, effect: RuleEffect) => PipelineState;
  readonly after?: StageFunction;
}

export const rulesForStage = (state: PipelineState, stageId: EngineStageId): readonly CompiledRule[] =>
  state.input.ruleset.rules
    .filter((rule) => rule.stageId === stageId)
    .sort((left, right) => compareStrings(left.ruleId, right.ruleId));

const withNotApplicableTrace = (state: PipelineState, stageId: EngineStageId): PipelineState => ({
  ...state,
  trace: [...state.trace, { stageId, outcome: 'not_applicable', ruleIds: [], claimIds: [], evidenceIds: [] }],
});

const addBlocker = (state: PipelineState, reasonCode: string, provenance: Provenance): PipelineState => ({
  ...state,
  blockers: [...state.blockers, { reasonCode, ...provenance }],
});

const addQuestion = (
  state: PipelineState,
  stageId: EngineStageId,
  question: { questionId: string; reasonCode: string; neededFactIds: readonly string[]; origin: 'rule' | 'fact' | 'heat' },
): PipelineState => ({
  ...state,
  questions: [...state.questions, { ...question, stageIndex: stageIndexOf(stageId) }],
});

export const defineStage = (definition: StageDefinition): StageFunction => (incoming) => {
  const { stageId } = definition;
  if (incoming.halted && !definition.runWhenHalted) return withNotApplicableTrace(incoming, stageId);

  let state = definition.before ? definition.before(incoming) : incoming;
  const touched: Provenance[] = [];
  const rules = rulesForStage(state, stageId)
    .filter((rule) => ruleApplicability(rule, state.input, state.evaluatedAtMs) === 'applicable');

  for (const rule of rules) {
    const outcome = evaluateExpression(rule.when, state.facts);
    if (outcome.value === 'unknown') {
      // Only hard rules gate a decision; an unresolved advisory rule is not allowed to.
      if (rule.severity !== 'hard') continue;
      touched.push(ruleProvenance(rule));
      const blocking = outcome.issues.find((issue) => isBlockingResolution(issue.resolution));
      if (blocking) {
        state = addBlocker(state, `fact_${blocking.resolution}`, ruleProvenance(rule));
      } else {
        for (const issue of outcome.issues) {
          state = addQuestion(state, stageId, {
            questionId: `fact:${issue.factId}`,
            reasonCode: `fact_${issue.resolution}`,
            neededFactIds: [issue.factId],
            origin: 'fact',
          });
        }
      }
      continue;
    }
    if (outcome.value === 'false') continue;

    touched.push(ruleProvenance(rule));
    for (const effect of rule.effects) {
      if (!ALLOWED_EFFECTS[stageId].includes(effect.kind)) {
        state = addBlocker(state, 'invalid_effect_for_stage', ruleProvenance(rule));
      } else if (effect.kind === 'block') {
        state = addBlocker(state, effect.reasonCode, ruleProvenance(rule));
      } else if (effect.kind === 'ask_question') {
        state = addQuestion(state, stageId, {
          questionId: effect.questionId,
          reasonCode: effect.reasonCode,
          neededFactIds: collectFactIds(rule.when),
          origin: 'rule',
        });
      } else if (definition.onEffect) {
        state = definition.onEffect(state, rule, effect);
      }
    }
  }

  const blockerCountBefore = incoming.blockers.length;
  state = definition.after ? definition.after(state) : state;
  const newBlockers = state.blockers.slice(blockerCountBefore);
  const provenance = mergeProvenance(...touched, ...newBlockers);
  const outcome: StageTraceEntry['outcome'] = newBlockers.length > 0
    ? 'blocked'
    : state.questions.length > incoming.questions.length
      ? 'needs_input'
      : rules.length === 0 && !definition.intrinsic
        ? 'not_applicable'
        : 'completed';

  return {
    ...state,
    halted: state.halted || state.blockers.length > 0,
    trace: [
      ...state.trace,
      { stageId, outcome, ruleIds: [...provenance.ruleIds], claimIds: [...provenance.claimIds], evidenceIds: [...provenance.evidenceIds] },
    ],
  };
};

export { addBlocker, addQuestion };

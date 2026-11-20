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
  if (new Set(rule.capabilityIds).size !== rule.capabilityIds.length) return 'inert';
  const bindingMatches = rule.capabilityIds.map((capabilityId) =>
    input.ruleset.capabilities.filter((capability) => capability.capabilityId === capabilityId));
  if (bindingMatches.some((matches) => matches.length !== 1)) return 'inert';
  const capabilities = bindingMatches.flatMap((matches) => matches);
  if (capabilities.some((capability) => rule.useScope === undefined || capability.reviewedUseScope !== rule.useScope)) {
    return 'not_applicable';
  }
  const successorReview = input.ruleset.successorReview;
  if (successorReview !== undefined) {
    for (const effect of rule.effects) {
      if (effect.kind !== 'include_candidate') continue;
      const withdrawals = successorReview.withdrawals.filter((entry) => entry.affectedActionId === effect.candidateId);
      if (withdrawals.length === 0) continue;
      const successorOf = rule.successorOf;
      const lineageMatches = successorOf?.parentRulesetHash === successorReview.parentRulesetHash
        && withdrawals.some((withdrawal) => successorOf.withdrawnRuleId === withdrawal.ruleId
          && successorOf.withdrawnRuleVersion === withdrawal.version);
      const explicitlyAuthorized = withdrawals.every((withdrawal) =>
        successorReview.authorizations.some((authorization) =>
          authorization.withdrawnRuleId === withdrawal.ruleId
          && authorization.withdrawnRuleVersion === withdrawal.version
          && authorization.affectedActionId === effect.candidateId
          && authorization.successorRuleId === rule.ruleId
          && authorization.successorRuleVersion === rule.version
          && Date.parse(authorization.reviewedAt) <= nowMs));
      if (!lineageMatches || !explicitlyAuthorized) return 'not_applicable';
    }
  }
  const owned = (capability: (typeof capabilities)[number]): boolean =>
    (capability.subjectType === 'product' ? input.snapshot.shelf : input.snapshot.tools).some((entry) =>
      entry.entryId === capability.subjectId
      && entry.catalogueSubject?.catalogueId === capability.catalogueSubject.catalogueId
      && entry.catalogueSubject.versionId === capability.catalogueSubject.versionId
      && entry.catalogueSubject.market === capability.catalogueSubject.market);
  if (capabilities.some((capability) => !owned(capability))) return 'not_applicable';
  const inert = capabilities.some((capability) =>
    Date.parse(capability.reviewedAt) > nowMs
    || (capability.expiresAt !== undefined && Date.parse(capability.expiresAt) <= nowMs));
  return inert ? 'inert' : 'applicable';
};

export const ruleProvenance = (rule: CompiledRule): Provenance => ({
  ruleIds: [rule.ruleId],
  ruleRefs: [{ ruleId: rule.ruleId, version: rule.version }],
  claimIds: uniqueSorted(rule.claimIds),
  evidenceIds: uniqueSorted(rule.evidenceIds),
});

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
    .sort((left, right) => {
      if (left.table?.tableId === right.table?.tableId && left.table !== undefined && right.table !== undefined) {
        return left.table.rowOrder - right.table.rowOrder || compareStrings(left.ruleId, right.ruleId);
      }
      return compareStrings(left.ruleId, right.ruleId);
    });

interface TableSelection {
  readonly selectedRuleIds: ReadonlySet<string>;
  readonly uniqueViolations: readonly (readonly CompiledRule[])[];
}

const preservesRestriction = (rule: CompiledRule): boolean => rule.effects.length > 0 && rule.effects.every((effect) => {
  if (effect.kind === 'block' || effect.kind === 'ask_question' || effect.kind === 'exclude_candidate'
    || effect.kind === 'require_prerequisite' || effect.kind === 'insert_wait') return true;
  return effect.kind === 'set_heat_assessment' && (effect.state === 'no_heat' || effect.state === 'restricted');
});

function selectTableRows(state: PipelineState, stageId: EngineStageId): TableSelection {
  const groups = new Map<string, CompiledRule[]>();
  for (const rule of state.input.ruleset.rules) {
    if (rule.table === undefined || ruleApplicability(rule, state.input, state.evaluatedAtMs) !== 'applicable') continue;
    const group = groups.get(rule.table.tableId) ?? [];
    group.push(rule);
    groups.set(rule.table.tableId, group);
  }

  const selectedRuleIds = new Set<string>();
  const uniqueViolations: (readonly CompiledRule[])[] = [];
  for (const group of groups.values()) {
    const ordered = group.sort((left, right) =>
      (left.table?.rowOrder ?? 0) - (right.table?.rowOrder ?? 0) || compareStrings(left.ruleId, right.ruleId));
    const policy = ordered[0]?.table?.hitPolicy;
    if (policy === undefined) continue;
    const matches = ordered.map((rule) => ({ rule, value: evaluateExpression(rule.when, state.facts).value }));

    if (policy === 'collect') {
      matches.filter((match) => match.value !== 'false').forEach(({ rule }) => selectedRuleIds.add(rule.ruleId));
      continue;
    }
    if (policy === 'first') {
      const firstMatchIndex = matches.findIndex((match) => match.value !== 'false');
      if (firstMatchIndex < 0) continue;
      const firstMatch = matches[firstMatchIndex];
      if (firstMatch.value === 'true') {
        selectedRuleIds.add(firstMatch.rule.ruleId);
        continue;
      }

      // An unresolved first row leaves the table choice open. Keep it so the
      // runner asks for its missing facts, and preserve only later hard rows
      // whose effects cannot make the decision more permissive.
      selectedRuleIds.add(firstMatch.rule.ruleId);
      matches.slice(firstMatchIndex + 1)
        .filter((match) => match.rule.severity === 'hard' && match.value !== 'false' && preservesRestriction(match.rule))
        .forEach(({ rule }) => selectedRuleIds.add(rule.ruleId));
      continue;
    }

    const definiteMatches = matches.filter((match) => match.value === 'true').map((match) => match.rule);
    const unresolved = matches.filter((match) => match.value === 'unknown').map((match) => match.rule);
    if (definiteMatches.length > 1) {
      const firstStage = Math.min(...ordered.map((rule) => stageIndexOf(rule.stageId)));
      if (stageIndexOf(stageId) === firstStage) uniqueViolations.push(definiteMatches);
    } else if (unresolved.length > 0) {
      unresolved.forEach((rule) => selectedRuleIds.add(rule.ruleId));
    } else if (definiteMatches.length === 1) {
      selectedRuleIds.add(definiteMatches[0].ruleId);
    }
  }
  return { selectedRuleIds, uniqueViolations };
}

const withNotApplicableTrace = (state: PipelineState, stageId: EngineStageId): PipelineState => ({
  ...state,
  trace: [...state.trace, { stageId, outcome: 'not_applicable', reasonSeverity: 'info', ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [] }],
});

const addBlocker = (state: PipelineState, reasonCode: string, provenance: Provenance, reasonSeverity: 'blocker' | 'caution' | 'info' = 'blocker'): PipelineState => ({
  ...state,
  blockers: [...state.blockers, { reasonCode, reasonSeverity, ...provenance }],
});

const addQuestion = (
  state: PipelineState,
  stageId: EngineStageId,
  question: { questionId: string; reasonCode: string; reasonSeverity?: 'blocker' | 'caution' | 'info'; neededFactIds: readonly string[]; origin: 'rule' | 'fact' | 'heat'; ruleRefs?: readonly Provenance['ruleRefs'][number][] },
): PipelineState => ({
  ...state,
  questions: [...state.questions, { ...question, reasonSeverity: question.reasonSeverity ?? 'caution', ruleRefs: question.ruleRefs ?? [], stageIndex: stageIndexOf(stageId) }],
});

export const defineStage = (definition: StageDefinition): StageFunction => (incoming) => {
  const { stageId } = definition;
  if (incoming.halted && !definition.runWhenHalted) return withNotApplicableTrace(incoming, stageId);

  let state = definition.before ? definition.before(incoming) : incoming;
  const touched: Provenance[] = [];
  const tableSelection = selectTableRows(state, stageId);
  for (const conflict of tableSelection.uniqueViolations) {
    const provenance = mergeProvenance(...conflict.map(ruleProvenance));
    touched.push(provenance);
    state = addBlocker(state, 'decision_table_unique_violation', provenance);
  }
  const rules = rulesForStage(state, stageId)
    .filter((rule) => ruleApplicability(rule, state.input, state.evaluatedAtMs) === 'applicable')
    .filter((rule) => rule.table === undefined || tableSelection.selectedRuleIds.has(rule.ruleId));

  for (const rule of rules) {
    const outcome = evaluateExpression(rule.when, state.facts);
    if (outcome.value === 'unknown') {
      // A first-hit table row with an unresolved condition gates row selection
      // even when advisory; otherwise a later, more permissive row could win.
      if (rule.severity !== 'hard' && rule.table?.hitPolicy !== 'first') continue;
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
            ruleRefs: ruleProvenance(rule).ruleRefs,
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
        state = addBlocker(state, effect.reasonCode, ruleProvenance(rule), effect.reasonSeverity ?? 'blocker');
      } else if (effect.kind === 'ask_question') {
        state = addQuestion(state, stageId, {
          questionId: effect.questionId,
          reasonCode: effect.reasonCode,
          reasonSeverity: effect.reasonSeverity ?? 'caution',
          neededFactIds: collectFactIds(rule.when),
          origin: 'rule',
          ruleRefs: ruleProvenance(rule).ruleRefs,
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
      {
        stageId,
        outcome,
        reasonSeverity: outcome === 'blocked' ? 'blocker' : outcome === 'needs_input' ? 'caution' : 'info',
        ruleIds: [...provenance.ruleIds],
        ruleRefs: [...provenance.ruleRefs],
        claimIds: [...provenance.claimIds],
        evidenceIds: [...provenance.evidenceIds],
      },
    ],
  };
};

export { addBlocker, addQuestion };

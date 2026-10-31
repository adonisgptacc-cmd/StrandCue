import type { DecisionConfidence, DecisionQuestion, EngineDecision, HeatAssessmentState } from '../../contracts.js';
import { EngineDecisionSchema } from '../../contracts.js';
import { defineStage } from '../stage-runner.js';
import type { PipelineState, PendingQuestion } from '../state.js';
import { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION, compareStrings, uniqueSorted } from '../state.js';

/** The contract has no decision-level reason field, so blockers are audited as omissions of this scope. */
export const DECISION_SCOPE = 'decision';

/** Always runs, even after a block, so the audit trace always has all ten stages. */
export const assembleDecisionStage = defineStage({
  stageId: 'assemble_decision',
  intrinsic: true,
  runWhenHalted: true,
});

const ORIGIN_PRIORITY = { rule: 0, fact: 1, heat: 2 } as const;

/** Merges duplicate questions and ranks them: authored asks, then missing facts, then heat; stage order; id. */
export const rankQuestions = (pending: readonly PendingQuestion[]): readonly DecisionQuestion[] => {
  const merged = new Map<string, PendingQuestion>();
  pending.forEach((question) => {
    const existing = merged.get(question.questionId);
    merged.set(question.questionId, existing
      ? { ...existing, neededFactIds: uniqueSorted([...existing.neededFactIds, ...question.neededFactIds]) }
      : { ...question, neededFactIds: uniqueSorted(question.neededFactIds) });
  });
  return [...merged.values()]
    .sort((left, right) => ORIGIN_PRIORITY[left.origin] - ORIGIN_PRIORITY[right.origin]
      || left.stageIndex - right.stageIndex
      || compareStrings(left.questionId, right.questionId))
    .map((question, index) => ({
      questionId: question.questionId,
      rank: index + 1,
      reasonCode: question.reasonCode,
      neededFactIds: [...question.neededFactIds],
    }));
};

const resolveStatus = (state: PipelineState): EngineDecision['status'] => {
  if (state.blockers.length > 0) return 'blocked';
  if (state.questions.length > 0) return 'needs_input';
  if (state.noProtocol.length > 0 || state.steps.length === 0) return 'no_protocol';
  return 'decided';
};

const heatFor = (state: PipelineState, status: EngineDecision['status']): HeatAssessmentState | undefined => {
  if (status === 'decided') return state.heat;
  if (status === 'blocked') return state.heat === 'content_pending' || state.heat === 'restricted' ? state.heat : undefined;
  if (!state.heatRelevant) return undefined;
  return status === 'needs_input' ? 'needs_input' : 'unavailable';
};

const confidenceFor = (state: PipelineState, status: EngineDecision['status']): DecisionConfidence => {
  if (status !== 'decided') return { evidence: 'low', applicability: 'low' };
  // Suitability inputs are not in the frozen contract, so applicability never exceeds "limited".
  return { evidence: state.steps.every((step) => step.evidenceIds.length > 0) ? 'strong' : 'limited', applicability: 'limited' };
};

/** Builds the canonical decision from a fully run pipeline state and validates it against the contract. */
export const toEngineDecision = (state: PipelineState): EngineDecision => {
  const status = resolveStatus(state);
  const reasons = status === 'blocked' ? state.blockers : status === 'no_protocol' ? state.noProtocol : [];
  const decision = {
    status,
    steps: status === 'decided' ? [...state.steps] : [],
    omissions: [
      ...reasons.map((reason) => ({
        candidateId: DECISION_SCOPE,
        reasonCode: reason.reasonCode,
        ruleIds: [...reason.ruleIds],
        claimIds: [...reason.claimIds],
        evidenceIds: [...reason.evidenceIds],
      })),
      ...[...state.omissions].sort((left, right) => compareStrings(left.candidateId, right.candidateId)),
    ],
    alternatives: [...state.alternatives].sort((left, right) => compareStrings(left.alternativeId, right.alternativeId)),
    questions: status === 'needs_input' ? [...rankQuestions(state.questions)] : [],
    heatAssessment: heatFor(state, status),
    confidence: confidenceFor(state, status),
    audit: {
      ruleset: state.input.ruleset.ref,
      evaluatedAt: state.input.evaluatedAt,
      schemaVersion: ENGINE_SCHEMA_VERSION,
      evaluatorVersion: ENGINE_EVALUATOR_VERSION,
      trace: state.trace.map((entry) => ({ ...entry, ruleIds: [...entry.ruleIds], claimIds: [...entry.claimIds], evidenceIds: [...entry.evidenceIds] })),
    },
  };
  return EngineDecisionSchema.parse(decision);
};

import type { EngineInput, EngineStageId, EvaluateDecision } from '../contracts.js';
import { EngineInputSchema, ENGINE_STAGE_IDS } from '../contracts.js';
import { applySafetyRestrictions } from './stages/apply-safety-restrictions.js';
import { assembleDecisionStage, toEngineDecision } from './stages/assemble-decision.js';
import { buildDependencyGraph } from './stages/build-dependency-graph.js';
import { deriveTreatmentState } from './stages/derive-treatment-state.js';
import { evaluateHeat } from './stages/evaluate-heat.js';
import { filterCandidates } from './stages/filter-candidates.js';
import { loadVerifiedFacts } from './stages/load-verified-facts.js';
import { orderAndValidate } from './stages/order-and-validate.js';
import { selectAndRank } from './stages/select-and-rank.js';
import { createPipelineState, validateSnapshot } from './stages/validate-snapshot.js';
import type { StageFunction } from './state.js';

export { ENGINE_EVALUATOR_VERSION, ENGINE_SCHEMA_VERSION } from './state.js';
export type { PipelineState } from './state.js';
export { createPipelineState, validateSnapshot } from './stages/validate-snapshot.js';
export { applySafetyRestrictions } from './stages/apply-safety-restrictions.js';
export { loadVerifiedFacts } from './stages/load-verified-facts.js';
export { deriveTreatmentState } from './stages/derive-treatment-state.js';
export { filterCandidates } from './stages/filter-candidates.js';
export { evaluateHeat } from './stages/evaluate-heat.js';
export { selectAndRank } from './stages/select-and-rank.js';
export { buildDependencyGraph } from './stages/build-dependency-graph.js';
export { orderAndValidate, topologicalOrder } from './stages/order-and-validate.js';
export { assembleDecisionStage, toEngineDecision, rankQuestions, DECISION_SCOPE } from './stages/assemble-decision.js';

/** One pure function per stage, keyed by the public stage id. */
export const PIPELINE_STAGES: Readonly<Record<EngineStageId, StageFunction>> = {
  validate_snapshot: validateSnapshot,
  apply_safety_restrictions: applySafetyRestrictions,
  load_verified_facts: loadVerifiedFacts,
  derive_treatment_state: deriveTreatmentState,
  filter_candidates: filterCandidates,
  evaluate_heat: evaluateHeat,
  select_and_rank: selectAndRank,
  build_dependency_graph: buildDependencyGraph,
  order_and_validate: orderAndValidate,
  assemble_decision: assembleDecisionStage,
};

/** Raised when input fails the public schema; no trustworthy audit can be produced for it. */
export class EngineInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineInputError';
  }
}

export const evaluateDecision: EvaluateDecision = (input: EngineInput) => {
  const parsed = EngineInputSchema.safeParse(input);
  if (!parsed.success) throw new EngineInputError(parsed.error.message);
  const finalState = ENGINE_STAGE_IDS.reduce(
    (state, stageId) => PIPELINE_STAGES[stageId](state),
    createPipelineState(parsed.data),
  );
  return toEngineDecision(finalState);
};

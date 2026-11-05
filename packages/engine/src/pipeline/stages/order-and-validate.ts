import type { DecisionStep } from '../../contracts.js';
import { defineStage } from '../stage-runner.js';
import type { DependencyGraph, PipelineState } from '../state.js';
import { EMPTY_PROVENANCE, compareStrings, mergeProvenance } from '../state.js';

/** Kahn's algorithm; among ready nodes the best-ranked one goes first, so ordering is stable. */
export const topologicalOrder = (graph: DependencyGraph): { readonly order: readonly string[]; readonly cyclic: boolean } => {
  const rank = new Map(graph.nodes.map((node, index) => [node, index]));
  const remaining = new Map(graph.nodes.map((node) => [node, graph.edges.filter((edge) => edge.to === node).map((edge) => edge.from)]));
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.every((dependency) => !remaining.has(dependency)))
      .map(([node]) => node)
      .sort((left, right) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0));
    const next = ready[0];
    if (next === undefined) return { order, cyclic: true };
    order.push(next);
    remaining.delete(next);
  }
  return { order, cyclic: false };
};

const buildSteps = (state: PipelineState, graph: DependencyGraph, order: readonly string[]): readonly DecisionStep[] =>
  order.map((actionId) => {
    const incoming = graph.edges.filter((edge) => edge.to === actionId);
    const candidate = state.candidates.get(actionId);
    const provenance = mergeProvenance(candidate?.provenance ?? EMPTY_PROVENANCE, ...incoming.map((edge) => edge.provenance), graph.waits.get(actionId)?.provenance ?? EMPTY_PROVENANCE);
    const wait = graph.waits.get(actionId);
    return {
      stepId: `step:${actionId}`,
      actionId,
      labelKey: `step.${actionId}`,
      reasonCode: 'selected_candidate',
      reasonSeverity: 'info',
      ruleIds: [...provenance.ruleIds],
      ruleRefs: [...provenance.ruleRefs],
      claimIds: [...provenance.claimIds],
      evidenceIds: [...provenance.evidenceIds],
      prerequisiteIds: [...new Set(incoming.map((edge) => edge.from))].sort(compareStrings),
      ...(wait ? { waitMinutes: wait.minutes } : {}),
    };
  });

/** Cycles and unmet hard requirements produce a non-actionable result, never a partial plan. */
export const orderAndValidate = defineStage({
  stageId: 'order_and_validate',
  intrinsic: true,
  after: (state) => {
    const graph = state.graph;
    if (!graph || state.noProtocol.length > 0 || state.blockers.length > 0 || state.questions.length > 0) return state;
    const { order, cyclic } = topologicalOrder(graph);
    if (cyclic) {
      const cycleNodes = new Set(graph.nodes.filter((node) => !order.includes(node)));
      const provenance = mergeProvenance(...graph.edges.filter((edge) => cycleNodes.has(edge.from) && cycleNodes.has(edge.to)).map((edge) => edge.provenance));
      return { ...state, steps: [], noProtocol: [...state.noProtocol, { reasonCode: 'dependency_cycle', reasonSeverity: 'blocker', ...provenance }] };
    }
    if (order.length === 0) {
      return { ...state, steps: [], noProtocol: [...state.noProtocol, { reasonCode: 'no_eligible_candidates', reasonSeverity: 'blocker', ...EMPTY_PROVENANCE }] };
    }
    return { ...state, steps: buildSteps(state, graph, order) };
  },
});

import { defineStage, ruleProvenance } from '../stage-runner.js';
import type { DependencyEdge, NoProtocolReason } from '../state.js';
import { compareStrings, mergeProvenance } from '../state.js';

/**
 * A prerequisite must come before every other selected step. Two mutual
 * prerequisites therefore form a cycle that the next stage reports, and a
 * prerequisite that is not part of the selection is an unmet requirement.
 */
export const buildDependencyGraph = defineStage({
  stageId: 'build_dependency_graph',
  intrinsic: true,
  onEffect: (state, rule, effect) => {
    if (effect.kind === 'require_prerequisite') {
      return {
        ...state,
        requirements: [...state.requirements, { prerequisiteId: effect.prerequisiteId, hard: rule.severity === 'hard', provenance: ruleProvenance(rule) }],
      };
    }
    if (effect.kind === 'insert_wait') {
      return {
        ...state,
        waits: [...state.waits, { afterActionId: effect.afterActionId, minutes: effect.minutes, provenance: ruleProvenance(rule) }],
      };
    }
    return state;
  },
  after: (state) => {
    const nodes = state.ranking;
    const selected = new Set(nodes);
    const edges: DependencyEdge[] = [];
    const unmet: NoProtocolReason[] = [];

    [...state.requirements]
      .sort((left, right) => compareStrings(left.prerequisiteId, right.prerequisiteId))
      .forEach((requirement) => {
        if (!selected.has(requirement.prerequisiteId)) {
          if (requirement.hard) unmet.push({ reasonCode: `prerequisite_unmet:${requirement.prerequisiteId}`, reasonSeverity: 'blocker', ...requirement.provenance });
          return;
        }
        nodes
          .filter((node) => node !== requirement.prerequisiteId)
          .forEach((node) => edges.push({ from: requirement.prerequisiteId, to: node, provenance: requirement.provenance }));
      });

    const waits = new Map<string, { minutes: number; provenance: ReturnType<typeof mergeProvenance> }>();
    [...state.waits]
      .sort((left, right) => compareStrings(left.afterActionId, right.afterActionId) || left.minutes - right.minutes)
      .filter((wait) => selected.has(wait.afterActionId))
      .forEach((wait) => {
        const existing = waits.get(wait.afterActionId);
        // The longest reviewed wait applies; shorter waits never shorten it.
        waits.set(wait.afterActionId, {
          minutes: Math.max(existing?.minutes ?? 0, wait.minutes),
          provenance: mergeProvenance(existing?.provenance ?? wait.provenance, wait.provenance),
        });
      });

    return { ...state, graph: { nodes, edges, waits }, noProtocol: [...state.noProtocol, ...unmet] };
  },
});

import type { DecisionStatus, HeatAssessmentState } from '@strandcue/engine';

import { HeatCoachStateSchema } from '../heat-coach.ts';
import type { HeatCoachDecision } from '../heat-coach.ts';

/**
 * The shared engine and Heat Coach each define a heat vocabulary. They are the
 * same seven names, so this module only pairs each Heat Coach state with the
 * engine status that may accompany it. It evaluates nothing: `evaluateHeatCoach`
 * (and its PostgreSQL twin) remain the single authority for a heat decision.
 */
export type HeatCoachState = HeatCoachDecision['state'];

export interface HeatEngineOutcome {
  readonly status: DecisionStatus;
  readonly heatAssessment: HeatAssessmentState;
}

export const HEAT_ENGINE_OUTCOMES: Readonly<Record<HeatCoachState, HeatEngineOutcome>> = {
  appropriate: { status: 'decided', heatAssessment: 'appropriate' },
  lower_heat: { status: 'decided', heatAssessment: 'lower_heat' },
  no_heat: { status: 'decided', heatAssessment: 'no_heat' },
  needs_input: { status: 'needs_input', heatAssessment: 'needs_input' },
  restricted: { status: 'blocked', heatAssessment: 'restricted' },
  content_pending: { status: 'blocked', heatAssessment: 'content_pending' },
  unavailable: { status: 'no_protocol', heatAssessment: 'unavailable' },
};

export function heatStateToEngineOutcome(state: HeatCoachState): HeatEngineOutcome {
  const parsed = HeatCoachStateSchema.parse(state);
  return HEAT_ENGINE_OUTCOMES[parsed];
}

export function heatDecisionToEngineOutcome(decision: Pick<HeatCoachDecision, 'state'>): HeatEngineOutcome {
  return heatStateToEngineOutcome(decision.state);
}

/**
 * Reads an engine status/heat pair back into a Heat Coach state. Any pair that
 * is not one of the seven allowed combinations throws; callers must treat a
 * throw as "do not show or act on this".
 */
export function engineOutcomeToHeatState(status: unknown, heatAssessment: unknown): HeatCoachState {
  const state = HeatCoachStateSchema.parse(heatAssessment);
  if (HEAT_ENGINE_OUTCOMES[state].status !== status) {
    throw new Error(`Engine status ${String(status)} cannot carry Heat Coach state ${state}`);
  }
  return state;
}

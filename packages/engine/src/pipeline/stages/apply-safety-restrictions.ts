import { defineStage } from '../stage-runner.js';

/** Medical-boundary and active-reaction restrictions: `block` and `ask_question` only. */
export const applySafetyRestrictions = defineStage({
  stageId: 'apply_safety_restrictions',
  intrinsic: false,
});

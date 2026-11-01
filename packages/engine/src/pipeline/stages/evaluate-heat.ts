import type { HeatAssessmentState } from '../../contracts.js';
import { addBlocker, addQuestion, defineStage, rulesForStage, ruleApplicability, ruleProvenance } from '../stage-runner.js';
import { mergeProvenance, stageIndexOf } from '../state.js';

/** Most restrictive first; the first state present among fired rules wins. */
const RESTRICTIVENESS: readonly HeatAssessmentState[] = [
  'content_pending',
  'restricted',
  'needs_input',
  'unavailable',
  'no_heat',
  'lower_heat',
  'appropriate',
];

export const evaluateHeat = defineStage({
  stageId: 'evaluate_heat',
  intrinsic: false,
  before: (state) => {
    const relevant = rulesForStage(state, 'evaluate_heat')
      .some((rule) => ruleApplicability(rule, state.input, state.evaluatedAtMs) === 'applicable');
    return { ...state, heatRelevant: relevant };
  },
  onEffect: (state, rule, effect) => {
    if (effect.kind === 'include_candidate') {
      // Lower-exposure alternatives are offered, never silently added to the plan.
      const provenance = ruleProvenance(rule);
      return {
        ...state,
        alternatives: [
          ...state.alternatives,
          {
            alternativeId: effect.candidateId,
            labelKey: `alternative.${effect.candidateId}`,
            reasonCode: 'lower_exposure_alternative',
            ruleIds: [...provenance.ruleIds],
            claimIds: [...provenance.claimIds],
            evidenceIds: [...provenance.evidenceIds],
          },
        ],
      };
    }
    if (effect.kind !== 'set_heat_assessment') return state;
    return { ...state, heatSignals: [...state.heatSignals, { state: effect.state, provenance: ruleProvenance(rule) }] };
  },
  after: (state) => {
    if (!state.heatRelevant) return state;
    const strictest = RESTRICTIVENESS.find((candidate) => state.heatSignals.some((signal) => signal.state === candidate));
    const provenance = mergeProvenance(
      ...state.heatSignals.filter((signal) => signal.state === strictest).map((signal) => signal.provenance),
    );

    if (strictest === 'content_pending' || strictest === 'restricted') {
      return addBlocker({ ...state, heat: strictest }, `heat_${strictest}`, provenance);
    }
    if (strictest === 'needs_input') {
      return addQuestion({ ...state, heat: strictest }, 'evaluate_heat', {
        questionId: 'heat_input_required',
        reasonCode: 'heat_needs_input',
        neededFactIds: [],
        origin: 'heat',
      });
    }
    if (strictest === 'unavailable') {
      return { ...state, heat: strictest, noProtocol: [...state.noProtocol, { reasonCode: 'heat_unavailable', ...provenance }] };
    }
    if (strictest !== undefined) return { ...state, heat: strictest };

    // Heat rules exist but none established a state: unknown must never read as appropriate.
    const heatIndex = stageIndexOf('evaluate_heat');
    if (state.questions.some((question) => question.stageIndex === heatIndex)) return { ...state, heat: 'needs_input' };
    return addBlocker({ ...state, heat: 'content_pending' }, 'heat_content_pending', provenance);
  },
});

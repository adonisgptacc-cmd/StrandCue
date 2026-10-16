import type { CurrentConditionConcern } from '../../../../packages/domain/src/current-condition.ts';
import type { TodayGuidanceResult } from './today-guidance-service.ts';

/**
 * Today preflight state machine (HP-06, TD-01–TD-04, SF-01, UX-01–UX-04).
 *
 * States: `idle → checking_in → ready_to_generate → generating → result`.
 * The check-in is a temporary cosmetic self-report for one routine only: it
 * is session-only and never writes to the Passport, and concerns arrive
 * sorted by `normalizeCurrentCondition` downstream, so this reducer never
 * depends on tap order.
 *
 * Epochs: `ownerEpoch` counts owner changes (an owner change resets the whole
 * machine to `idle` and discards in-flight responses); `requestEpoch` counts
 * generation starts (only the response carrying the current epoch may apply,
 * so duplicate taps and late responses cannot generate twice or overwrite).
 * Nothing here reads the wall clock: observation and reference times travel
 * in the actions so every transition stays deterministic.
 */

export type PreflightPhase =
  | 'idle'
  | 'checking_in'
  | 'ready_to_generate'
  | 'generating'
  | 'result';

export const CHECK_IN_CONCERNS: readonly CurrentConditionConcern[] = [
  'dryness',
  'frizz',
  'tangling',
  'breakage',
  'stiffness',
  'dullness',
  'scalp-dryness',
  'scalp-oiliness',
  'reported-damage',
  'none',
  'unknown',
];

export type CheckInGoal = 'basic_wash';

export interface CheckInDraft {
  readonly concerns: readonly CurrentConditionConcern[];
  readonly goal: CheckInGoal;
  readonly availableMinutes: number | null;
  readonly observedAt: string | null;
}

export type CheckInErrorCode =
  | 'concerns_required'
  | 'concerns_exclusive'
  | 'time_required'
  | 'time_range'
  | 'observed_at_required'
  | 'observed_at_invalid'
  | 'observed_at_future';

export interface PreflightState {
  readonly phase: PreflightPhase;
  readonly ownerId: string;
  readonly ownerEpoch: number;
  readonly requestEpoch: number;
  readonly checkIn: CheckInDraft;
  readonly errors: readonly CheckInErrorCode[];
  readonly result: TodayGuidanceResult | null;
}

export type PreflightAction =
  | { readonly type: 'begin_check_in'; readonly observedAt: string }
  | { readonly type: 'toggle_concern'; readonly concern: CurrentConditionConcern }
  | { readonly type: 'set_goal'; readonly goal: CheckInGoal }
  | { readonly type: 'set_available_minutes'; readonly minutes: number | null }
  | { readonly type: 'refresh_observed_at'; readonly observedAt: string }
  | { readonly type: 'complete_check_in'; readonly now: string }
  | { readonly type: 'back_to_check_in' }
  | { readonly type: 'reset' }
  | { readonly type: 'owner_changed'; readonly ownerId: string }
  | { readonly type: 'generation_started'; readonly requestEpoch: number }
  | {
      readonly type: 'generation_finished';
      readonly requestEpoch: number;
      readonly result: TodayGuidanceResult;
    };

const EMPTY_DRAFT: CheckInDraft = {
  concerns: [],
  goal: 'basic_wash',
  availableMinutes: null,
  observedAt: null,
};

export function initialPreflight(ownerId: string): PreflightState {
  return {
    phase: 'idle',
    ownerId,
    ownerEpoch: 0,
    requestEpoch: 0,
    checkIn: EMPTY_DRAFT,
    errors: [],
    result: null,
  };
}

/**
 * Multi-select with exclusive `none`/`unknown`, mirroring the domain schema:
 * either exclusive answer stands alone, and picking an ordinary concern
 * clears a standing exclusive answer. An empty draft is allowed here so the
 * check-in step can report `concerns_required` instead of inventing one.
 */
function toggleConcern(
  selected: readonly CurrentConditionConcern[],
  concern: CurrentConditionConcern,
): readonly CurrentConditionConcern[] {
  if (concern === 'none' || concern === 'unknown') return [concern];
  if (selected.includes(concern)) return selected.filter(entry => entry !== concern);
  return [...selected.filter(entry => entry !== 'none' && entry !== 'unknown'), concern];
}

function hasExplicitOffset(value: string): boolean {
  return /([+-]\d{2}:?\d{2}|z)$/i.test(value.trim());
}

/**
 * Pure validation of a check-in draft against an explicit reference instant.
 * Mirrors `CurrentConditionSchema` plus the non-future `observedAt` rule, so
 * the form reports targeted errors before anything reaches the service; the
 * service boundary normalizes again and never trusts this result.
 */
export function validateCheckIn(draft: CheckInDraft, now: string): CheckInErrorCode[] {
  const errors: CheckInErrorCode[] = [];
  if (draft.concerns.length === 0) {
    errors.push('concerns_required');
  } else {
    const exclusive = draft.concerns.filter(
      concern => concern === 'none' || concern === 'unknown',
    );
    if (exclusive.length > 0 && draft.concerns.length > 1) errors.push('concerns_exclusive');
  }
  if (draft.availableMinutes === null) {
    errors.push('time_required');
  } else if (
    !Number.isInteger(draft.availableMinutes) ||
    draft.availableMinutes < 0 ||
    draft.availableMinutes > 1440
  ) {
    errors.push('time_range');
  }
  if (draft.observedAt === null || draft.observedAt.trim() === '') {
    errors.push('observed_at_required');
  } else {
    const parsed = Date.parse(draft.observedAt);
    if (Number.isNaN(parsed) || !hasExplicitOffset(draft.observedAt)) {
      errors.push('observed_at_invalid');
    } else if (parsed > Date.parse(now)) {
      errors.push('observed_at_future');
    }
  }
  return errors;
}

function edit(
  state: PreflightState,
  checkIn: CheckInDraft,
): PreflightState {
  if (state.phase !== 'checking_in') return state;
  return { ...state, checkIn, errors: [] };
}

export function preflightReducer(
  state: PreflightState,
  action: PreflightAction,
): PreflightState {
  switch (action.type) {
    case 'begin_check_in': {
      if (state.phase !== 'idle' && state.phase !== 'result') return state;
      return {
        ...state,
        phase: 'checking_in',
        checkIn: { ...EMPTY_DRAFT, observedAt: action.observedAt },
        errors: [],
        result: null,
      };
    }
    case 'toggle_concern':
      return edit(state, {
        ...state.checkIn,
        concerns: toggleConcern(state.checkIn.concerns, action.concern),
      });
    case 'set_goal':
      return edit(state, { ...state.checkIn, goal: action.goal });
    case 'set_available_minutes':
      return edit(state, { ...state.checkIn, availableMinutes: action.minutes });
    case 'refresh_observed_at':
      return edit(state, { ...state.checkIn, observedAt: action.observedAt });
    case 'complete_check_in': {
      if (state.phase !== 'checking_in') return state;
      const errors = validateCheckIn(state.checkIn, action.now);
      if (errors.length > 0) return { ...state, errors };
      return { ...state, phase: 'ready_to_generate', errors: [] };
    }
    case 'back_to_check_in': {
      if (state.phase !== 'ready_to_generate' && state.phase !== 'result') return state;
      return { ...state, phase: 'checking_in', errors: [] };
    }
    case 'reset': {
      if (state.phase === 'generating') return state;
      return { ...state, phase: 'idle', checkIn: EMPTY_DRAFT, errors: [], result: null };
    }
    case 'owner_changed': {
      if (action.ownerId === state.ownerId) return state;
      return {
        ...initialPreflight(action.ownerId),
        ownerEpoch: state.ownerEpoch + 1,
      };
    }
    case 'generation_started': {
      // The in-flight guard: a second tap while generating (or from any other
      // state) changes nothing, so one epoch means one generation. A retry
      // from `result` reuses the same validated check-in.
      if (state.phase !== 'ready_to_generate' && state.phase !== 'result') return state;
      return { ...state, phase: 'generating', requestEpoch: action.requestEpoch };
    }
    case 'generation_finished': {
      if (state.phase !== 'generating') return state;
      if (action.requestEpoch !== state.requestEpoch) return state;
      return { ...state, phase: 'result', result: action.result };
    }
  }
}

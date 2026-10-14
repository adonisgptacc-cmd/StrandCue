import type { CurrentConditionConcern, GuidanceGapKind } from '../../../../packages/domain/src/index';
import type { DestinationId } from '../navigation';
import type { CheckInErrorCode, CheckInGoal } from './current-condition-state';
import type { TodayGuidanceResult } from './today-guidance-service';

/**
 * Every string Today shows, in one place.
 *
 * Wording rules for this file:
 * - Cosmetic hair-care guidance only. No diagnosis, no treatment, no promise.
 * - No shame, no purchase pressure, no invented product claims.
 * - Say what is missing and where to fix it, instead of offering generic
 *   advice as a substitute.
 */

export const CONTENT_PENDING_TITLE = 'Reviewed guidance content is still being prepared';
export const CONTENT_PENDING_BODY =
  'StrandCue only produces a plan from reviewed content that a person has checked. None is published yet, so nothing is being generated from your records.';

export const LOADING_LABEL = 'Loading your records…';
export const GENERATE_LABEL = 'Generate my plan';
export const RETRY_LABEL = 'Retry';
export const GENERATING_LABEL = 'Working…';

export const SAVE_FAILED =
  'Plan created, audit save failed. Your plan is shown below, but this decision was not stored privately.';

export const DESTINATION_LABELS: Readonly<Record<DestinationId, string>> = {
  today: 'Go to Today',
  my_hair: 'Go to My Hair',
  my_shelf: 'Go to My Shelf',
  my_tools: 'Go to My Tools',
  journey: 'Go to Journey',
  settings: 'Go to Settings',
};

/**
 * Where a setup gap can actually be fixed. A gap with no destination is
 * explained in text instead — a button that goes nowhere is worse than none.
 */
const GAP_DESTINATION: Readonly<Record<GuidanceGapKind, DestinationId | null>> = {
  hair_profile: 'my_hair',
  service_presence: 'my_hair',
  product_version: 'my_shelf',
  product_capability: 'my_shelf',
  tool_version: 'my_tools',
  tool_capability: 'my_tools',
  source_incomplete: 'journey',
  reviewed_content: null,
  // A temporary check-in answer is fixed in the check-in step itself: the
  // result screen offers "Review check-in answers", which returns to the form
  // with the draft intact. No records destination can fix it.
  current_condition: null,
};

export function gapDestination(kind: GuidanceGapKind): DestinationId | null {
  return GAP_DESTINATION[kind];
}

export const READY_TITLE = 'Your plan is ready';
export const NEEDS_SETUP_TITLE = 'A few things are needed first';
export const SOURCE_ERROR_TITLE = 'Your records could not be read completely';

/**
 * Heading for the engine's own omission lines on the `unsupported` state.
 * The lines name the reviewed capability no owned item could cover; the
 * heading only labels them, and neither names a retailer nor suggests that
 * buying anything would guarantee an outcome.
 */
export const MISSING_HEADING = 'What is missing';

export function statusTitle(result: TodayGuidanceResult): string {
  switch (result.status) {
    case 'ready':
      return READY_TITLE;
    case 'needs_setup':
      return NEEDS_SETUP_TITLE;
    case 'content_pending':
      return CONTENT_PENDING_TITLE;
    case 'needs_input':
      return 'needs input — this plan needs more from you';
    case 'rule_conflict':
      return 'rule conflict — reviewed rules disagree here';
    case 'unsupported':
      return 'unsupported — no reviewed guidance covers this yet';
    case 'source_error':
      return SOURCE_ERROR_TITLE;
    default:
      return SOURCE_ERROR_TITLE;
  }
}

export function stepLabel(position: number): string {
  return `Step ${position}`;
}

export const CONFIDENCE_LABELS = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  limited: 'Limited confidence',
} as const;

export function confidenceLabel(confidence: keyof typeof CONFIDENCE_LABELS): string {
  return CONFIDENCE_LABELS[confidence];
}

export const NO_PURCHASE_NEEDED = 'No purchase needed — what you own can do this.';

/**
 * Today preflight check-in copy (HP-06, TD-02–TD-03, SF-01, UX-01–UX-03).
 *
 * The check-in collects temporary cosmetic self-reports for one routine
 * only. Wording rules, in addition to the file header: name only what can be
 * seen or felt today, never a diagnosis or treatment; never promise an
 * outcome; never direct to a retailer; "unknown" and "none" are valid,
 * shame-free answers.
 */

export const CHECK_IN_TITLE = 'How is your hair today?';
export const CHECK_IN_START_LABEL = 'Start check-in';
export const CHECK_IN_IDLE_BODY =
  'Start with a quick check-in about how your hair looks and feels today. Nothing is created until you ask for a plan.';
export const CHECK_IN_CONTINUE_LABEL = 'Continue to plan';
export const REVIEW_CHECK_IN_LABEL = 'Review check-in answers';
export const START_OVER_LABEL = 'Start a new check-in';

export const CHECK_IN_BOUNDARY =
  'Your answers are self-reported observations about how your hair looks and feels today. They are not a diagnosis, they change nothing in My Hair unless you choose to save them, and they promise no result.';

export const CONCERNS_LABEL = 'What do you notice today?';
export const CONCERNS_HINT = 'Choose all that apply. “I am not sure” and “None of these” each stand alone.';

export const CONCERN_LABELS: Readonly<Record<CurrentConditionConcern, string>> = {
  dryness: 'Dryness',
  frizz: 'Frizz',
  tangling: 'Tangling',
  breakage: 'Breakage',
  stiffness: 'Stiffness',
  dullness: 'Dullness',
  'scalp-dryness': 'Scalp dryness',
  'scalp-oiliness': 'Scalp oiliness',
  'reported-damage': 'Damage you can see or feel',
  none: 'None of these',
  unknown: 'I am not sure',
};

export const CHECK_IN_GOAL_LABEL = 'Goal for this plan';
// Keyed by the goal union itself (not `string`): adding a goal without a
// label — or dispatching anything outside the union — becomes a compile
// error instead of a silent mismatch.
export const CHECK_IN_GOAL_LABELS: Readonly<Record<CheckInGoal, string>> = {
  basic_wash: 'Basic wash',
};

export const TIME_LABEL = 'Time available (minutes)';
export const TIME_HELP =
  'Whole minutes from 0 to 1440 (one day). Use 0 when you have no time to spare today.';

export const OBSERVED_AT_LABEL = 'Observation time';
export const REFRESH_TIME_LABEL = 'Use current time';

export const SAVE_LABEL = 'Save these answers to My Hair';
export const SAVE_HELP =
  'Off unless you turn it on. Nothing here changes My Hair by itself.';

export const CHECK_IN_ERRORS_HEADING = 'Check your check-in answers';

export const CHECK_IN_ERROR_TEXT: Readonly<Record<CheckInErrorCode, string>> = {
  concerns_required: 'Choose at least one answer for what you notice today.',
  concerns_exclusive:
    '“I am not sure” and “None of these” each stand alone. Choose one of them, or choose from the other observations.',
  time_required: 'Enter the time you have available in minutes.',
  time_range: 'Enter whole minutes from 0 to 1440 (one day).',
  observed_at_required: 'Record when you made these observations.',
  observed_at_invalid: 'Record the observation time with its timezone, for example 2026-10-13T08:00:00+02:00.',
  observed_at_future: 'Record an observation time that is not later than now.',
};

export const CHECK_IN_SUMMARY_HEADING = 'Your check-in';
export const CHECK_IN_SUMMARY_TIME = (minutes: number): string =>
  minutes === 1 ? '1 minute available' : `${minutes} minutes available`;
export const CHECK_IN_SUMMARY_SAVE_ON = 'You chose to save these answers to My Hair.';
export const CHECK_IN_SUMMARY_SAVE_OFF = 'These answers stay with this plan request only';

/**
 * Protocol execution copy (TD-07–TD-08).
 *
 * The execution surface records what actually happened while following one
 * stored plan. Wording rules, in addition to the file header: planned and
 * actually-done stay in separate sections and are never merged; deviation
 * reasons are shown as record text only; nothing promises an outcome and
 * nothing names a diagnosis, treatment, retailer or purchase.
 */

export const EXECUTION_START_LABEL = 'Start this plan';
export const EXECUTION_STARTING_LABEL = 'Starting…';
export const EXECUTION_START_BODY =
  'Follow your plan step by step. Nothing is recorded until you confirm it here.';
export const EXECUTION_PLANNED_HEADING = 'Planned steps';
export const EXECUTION_ACTUAL_HEADING = 'Actually done';
export const EXECUTION_NOTHING_CONFIRMED =
  'Nothing confirmed yet. What you confirm here becomes your private record.';
export const EXECUTION_SAVE_FAILED =
  'Your confirmation could not be saved. Nothing was recorded yet.';
export const EXECUTION_START_FAILED =
  'Your plan could not be started. Nothing was recorded yet.';
export const EXECUTION_RETRY_LABEL = 'Retry save';
export const EXECUTION_PAUSE_LABEL = 'Pause this plan';
export const EXECUTION_RESUME_LABEL = 'Resume this plan';
export const EXECUTION_FINISH_LABEL = 'Finish plan';
export const EXECUTION_FINISH_HINT =
  'Confirm every step above before finishing. Skipped, substituted and changed steps count as handled.';
export const EXECUTION_ABANDON_LABEL = 'Stop this plan';
export const EXECUTION_CONFIRM_STOP_LABEL = 'Confirm stop';
export const EXECUTION_CANCEL_LABEL = 'Cancel';
export const EXECUTION_STATUS_LABELS = {
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Stopped',
} as const;
export const EXECUTION_BOUNDARY =
  'Cosmetic hair-care guidance from your own records, not a diagnosis. Confirming a step records what you did; it promises no result.';

export const markDoneLabel = (position: number): string => `Mark done: Step ${position}`;
export const confirmDoneLabel = (position: number): string => `Confirm done: Step ${position}`;
export const skipLabel = (position: number): string => `Skip: Step ${position}`;
export const confirmSkipLabel = (position: number): string => `Confirm skip: Step ${position}`;
export const substituteLabel = (position: number): string => `Substitute: Step ${position}`;
export const confirmSubstituteLabel = (position: number): string =>
  `Confirm substitution: Step ${position}`;
export const modifyLabel = (position: number): string => `Change: Step ${position}`;
export const confirmModifyLabel = (position: number): string => `Confirm change: Step ${position}`;

export const EXECUTION_REASON_SKIP_LABEL = 'Reason for skipping';
export const EXECUTION_REASON_SUBSTITUTE_LABEL = 'Reason for substituting';
export const EXECUTION_REASON_MODIFY_LABEL = 'Reason for changing';
export const EXECUTION_DETAIL_MODIFY_LABEL = 'What changed';
export const EXECUTION_SHELF_PICKER_LABEL = 'Choose from your shelf';
export const EXECUTION_SHELF_ITEM_HELP =
  'Choose a product you own from your shelf. Only items on your shelf are accepted; anything else is rejected.';
export const EXECUTION_SHELF_LOADING = 'Loading your shelf...';
export const EXECUTION_SHELF_EMPTY =
  'Your shelf is empty. Add a product to your shelf before substituting.';
export const EXECUTION_SHELF_LOAD_FAILED =
  'Your shelf could not be loaded. Check your connection and try again.';
export const EXECUTION_SHELF_REQUIRED =
  'Choose a product from your shelf so your record stays honest.';
export const shelfItemOptionLabel = (id: string): string => `Use shelf item ${id}`;
export const selectedShelfItemLabel = (id: string): string => `Selected shelf item ${id}`;
export const shelfItemVersionLabel = (versionId: string): string => `Exact version ${versionId}`;
export const EXECUTION_REASON_ABANDON_LABEL = 'Reason for stopping';
export const EXECUTION_EMPTY_REASON = 'Add a short reason so your record stays honest.';
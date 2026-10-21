import type {
  CurrentConditionConcern,
  GuidanceGapState,
  GuidanceSourceName,
} from '../../../../packages/domain/src/index';
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

export const LOADING_LABEL = 'Loading your records…';
export const GENERATE_LABEL = 'Generate my plan';
export const GENERATING_LABEL = 'Working…';

export const SAVE_FAILED =
  'Plan created, audit save failed. Your plan is shown below, but this decision was not stored privately.';

/** A short lead-in that says why the gap stops the plan, so the six states read differently. */
export const GAP_STATE_LEAD: Readonly<Record<GuidanceGapState, string>> = {
  missing: 'Not answered yet',
  unknown: 'Marked as not sure',
  failed_source: 'We could not check this',
  contradictory: 'These answers do not agree',
  unsupported: 'Not covered yet',
  content_pending: 'Not available yet',
};

export const SOURCE_AREA_NAMES: Readonly<Record<GuidanceSourceName, string>> = {
  passport: 'My Hair',
  services: 'your chemical services',
  activities: 'your recorded activity',
  products: 'My Shelf',
  tools: 'My Tools',
};

/**
 * What a failed read says. It names the area, says the app could not read it,
 * and asks for one retry. It never blames the owner and never says their
 * records are wrong.
 */
export const FAILED_SOURCE_BODY = (area: string): string =>
  `We could not read ${area}. Nothing was changed, and nothing was guessed.`;
export const FAILED_SOURCE_UNKNOWN_BODY =
  'We could not read your records. Nothing was changed, and nothing was guessed.';
export const RETRY_DATA_LABEL = 'Try again';
export const RETRY_DATA_ACCESSIBILITY = 'Try again';
export const RETRY_DATA_BUSY_LABEL = 'Trying again…';
export const RETRY_FAILED_MESSAGE = 'We could not read your records again. Try again.';

/**
 * Content that is not published yet. The owner's information was read; the
 * reviewed guidance for their situation is what is missing. Nothing here
 * routes the owner to change their own records, because their records are not
 * the limitation.
 */
export const CONTENT_PENDING_ITEM_TITLE =
  'Reviewed guidance for this situation is not available yet.';
export const CONTENT_PENDING_ITEM_BODY =
  'We read your information. StrandCue did not guess, and did not produce a plan.';

/**
 * The resolver's own words. The heading says what the screen is; the
 * announcement says the new state once; nothing here repeats a section title
 * inside every item's label.
 */
export const RESOLVER_HEADING = 'What is needed before a plan';
export const RESOLVER_SETUP_HEADING = 'What you could add next';
export const RESOLVER_FAILED_HEADING = 'What we could not read';
export const RESOLVER_CONTENT_HEADING = 'What is not available yet';
export const RESOLVER_ANNOUNCEMENT_ONE = 'One thing needs your attention.';
export const RESOLVER_ANNOUNCEMENT_MANY = (count: number): string =>
  `${count} things need your attention.`;
export const RESOLVER_SETUP_ANNOUNCEMENT_ONE = 'One thing you could add next.';
export const RESOLVER_SETUP_ANNOUNCEMENT_MANY = (count: number): string =>
  `${count} things you could add next.`;
export const RESOLVER_FAILED_ANNOUNCEMENT = 'We could not read everything we needed.';
export const RESOLVER_CONTENT_ANNOUNCEMENT =
  'Reviewed guidance for this situation is not available yet.';

/** The one primary action for each destination, and where it goes. */
export const RESOLVER_ACTIONS = {
  addInMyHair: {
    id: 'add_in_my_hair',
    label: 'Add this in My Hair',
    accessibilityLabel: 'Add this in My Hair',
  },
  reviewServices: {
    id: 'review_chemical_services',
    label: 'Review your chemical services',
    accessibilityLabel: 'Review your chemical services in My Hair',
  },
  reviewShelf: {
    id: 'review_my_shelf',
    label: 'Review My Shelf',
    accessibilityLabel: 'Review My Shelf',
  },
  addProduct: {
    id: 'add_product',
    label: 'Add a product',
    accessibilityLabel: 'Add a product to My Shelf',
  },
  matchProduct: {
    id: 'match_product',
    label: 'Match this product',
    accessibilityLabel: 'Match this product in My Shelf',
  },
  chooseAvailableProduct: {
    id: 'choose_available_product',
    label: 'Choose an available product',
    accessibilityLabel: 'Choose an available product in My Shelf',
  },
  reviewTools: {
    id: 'review_my_tools',
    label: 'Review My Tools',
    accessibilityLabel: 'Review My Tools',
  },
  addTool: {
    id: 'add_tool',
    label: 'Add a tool',
    accessibilityLabel: 'Add a tool to My Tools',
  },
  matchTool: {
    id: 'match_tool',
    label: 'Match this tool',
    accessibilityLabel: 'Match this tool in My Tools',
  },
  addTemperature: {
    id: 'add_temperature',
    label: 'Add the exact temperature for this tool',
    accessibilityLabel: 'Add the exact temperature for this tool in My Tools',
  },
  addHeatMethod: {
    id: 'add_heat_method',
    label: 'Add the heat method for this tool',
    accessibilityLabel: 'Add the heat method for this tool in My Tools',
  },
  reviewCheckIn: {
    id: 'review_check_in',
    label: 'Review check-in answers',
    accessibilityLabel: 'Review check-in answers',
  },
} as const;

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
      return 'This plan needs a little more from you';
    case 'rule_conflict':
      return 'Two reviewed rules disagree here';
    case 'unsupported':
      return 'Nothing reviewed covers this yet';
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
  'Your answers are self-reported observations about how your hair looks and feels today. They are not a diagnosis. They stay on this device for this session. If you ask for a plan, the facts that plan used are kept in your private record. Nothing is added to My Hair, and nothing here promises a result.';

export const CONCERNS_LABEL = 'What do you notice today?';
export const CONCERNS_HINT = 'Choose all that apply. “I am not sure” and “None of these” each stand alone.';

export const EXCLUSIVE_CONCERN_HINT = 'Clears your other choices';

export const CONCERN_LABELS: Readonly<Record<CurrentConditionConcern, string>> = {
  dryness: 'Dryness',
  frizz: 'Frizz',
  tangling: 'Tangling',
  breakage: 'Breakage',
  stiffness: 'Stiffness',
  dullness: 'Dullness',
  buildup: 'Product buildup or a coated feel',
  'scalp-dryness': 'Scalp dryness',
  'scalp-oiliness': 'Scalp oiliness',
  'scalp-discomfort': 'Scalp discomfort',
  'reported-damage': 'Damage you can see or feel',
  'chemical-processing-concern': 'Worried about chemical services',
  'heat-concern': 'Worried about heat styling',
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
export const TIME_INPUT_LABEL = 'Minutes of time available';
export const TIME_HELP =
  'Whole minutes from 0 to 1440 (one day). Use 0 when you have no time to spare today.';

export const OBSERVED_AT_LABEL = 'Observation time';
export const OBSERVED_AT_NOT_SET = 'Not set yet.';
export const REFRESH_TIME_LABEL = 'Use current time';

export const CHECK_IN_ERRORS_HEADING = 'Check your check-in answers';

export const CHECK_IN_ERROR_TEXT: Readonly<Record<CheckInErrorCode, string>> = {
  concerns_required: 'Choose at least one answer for what you notice today.',
  concerns_exclusive:
    '“I am not sure” and “None of these” each stand alone. Choose one of them, or choose from the other observations.',
  time_required: 'Enter the time you have available in minutes.',
  time_range: 'Enter whole minutes from 0 to 1440 (one day).',
  observed_at_required: 'Record when you made these observations.',
  observed_at_invalid:
    'Record the observation time with your timezone, for example 13 October 2026, 8:00 am.',
  observed_at_future: 'Record an observation time that is not later than now.',
  zone_concerns_required:
    'You chose where you notice it. Choose what you notice there as well, or remove the area.',
  zone_concern_unreported:
    'A thing you noticed in an area is not in your answers. Tick it there, or remove the area.',
  check_in_unusable:
    'Today’s check-in could not be used as it stands. Review your answers and try again.',
};

/** The exclusive answers clear the others; the owner is told when it happens. */
export const CONCERNS_CLEARED_STATUS = 'Your other answers were cleared.';

/**
 * The zone step (Task 3.2). Zone detail is optional: an owner may say only
 * what they notice. Where they do name an area, they also say what they
 * notice there, so the answer is never half finished.
 */
export const ZONE_LABEL = 'Where do you notice it';
export const ZONE_HINT =
  'Optional. Choose an area, then choose which part of your hair you mean. You can choose more than one area. An area you choose also needs what you notice there.';
export const ZONE_REGION_LABEL = 'Area';
export const ZONE_SEGMENT_LABEL = 'Part of the hair';
export const ZONE_SELECTED_LABEL = 'Areas you chose';
export const ZONE_CONCERNS_LABEL = 'What do you notice there';
export const ZONE_CONCERNS_EMPTY =
  'Tick what you notice first, then choose it here.';

export const ZONE_REGION_LABELS: Readonly<Record<string, string>> = {
  'whole-head': 'Whole head',
  front: 'Front',
  crown: 'Crown',
  nape: 'Nape',
  other: 'Another area',
  unknown: 'Not sure where',
};

export const ZONE_SEGMENT_LABELS: Readonly<Record<string, string>> = {
  'entire-strand': 'All of the hair',
  roots: 'Roots',
  'mid-lengths': 'Mid-lengths',
  ends: 'Ends',
  other: 'Another part',
  unknown: 'Not sure which part',
};

/** The plain name of one zone, in the order the owner reads it. */
export function zoneLabel(zone: { readonly region: string; readonly segment: string }): string {
  const region = ZONE_REGION_LABELS[zone.region] ?? 'Another area';
  const segment = ZONE_SEGMENT_LABELS[zone.segment] ?? 'Another part';
  return `${region}, ${segment}`;
}

export const ZONE_REMOVE_LABEL = (zone: string): string => `Remove ${zone}`;
export const ZONE_ADDED_STATUS = (zone: string): string => `${zone} added.`;
export const ZONE_REMOVED_STATUS = (zone: string): string => `${zone} removed.`;
export const ZONE_CONCERN_LABEL = (zone: string, concern: string): string =>
  `${zone}: ${concern}`;

export const CHECK_IN_SUMMARY_HEADING = 'Your check-in';
export const CHECK_IN_SUMMARY_TIME = (minutes: number): string =>
  minutes === 1 ? '1 minute available' : `${minutes} minutes available`;
export const CHECK_IN_SUMMARY_SESSION_ONLY =
  'These answers are used for this plan request only. Nothing is saved to My Hair.';

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
export const EXECUTION_LOADING_LABEL = 'Checking for a saved plan…';
export const EXECUTION_LOAD_FAILED =
  'Your saved plan could not be loaded. Nothing is shown yet.';
export const EXECUTION_LOAD_OFFLINE =
  'You appear to be offline. Your saved plan could not be loaded. Nothing is shown yet.';
export const EXECUTION_RESUME_UNVERIFIED =
  'This saved plan could not be verified. Nothing is shown yet.';
export const EXECUTION_RELOAD_LABEL = 'Try again';
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
export const shelfItemOptionLabel = (name: string, availability: string): string =>
  `Use ${name} (${availability})`;
export const selectedShelfItemLabel = (name: string, availability: string): string =>
  `Selected ${name} (${availability})`;
/**
 * The shelf item is chosen but the app cannot name it yet: the shelf is
 * still loading, or the entry is not in the list. The owner is told that a
 * product is selected, never shown an internal identifier.
 */
export const selectedShelfItemUnknownLabel = 'A product from your shelf is selected';
export const shelfItemVersionLabel = (name: string): string => `The exact version of ${name}`;
export const EXECUTION_REASON_ABANDON_LABEL = 'Reason for stopping';
export const EXECUTION_EMPTY_REASON = 'Add a short reason so your record stays honest.';
import type {
  ProgrammeDueStatus,
  ProgrammeMissingFactCode,
  ProgrammeState,
} from '../../../packages/domain/src/treatment-programme.ts';
import type { WashCountRange, WashCountUnit } from '../../../packages/domain/src/wash-count.ts';

/**
 * Owner-facing wording for treatment programmes.
 *
 * Every label describes a scheduling fact the evaluator derived from the
 * owner's own recorded events and a reviewed rule. Nothing here claims a
 * product worked, that hair health was assessed, that a treatment was
 * effective, or that an owner is overdue, non-compliant or at fault. Technical
 * keys, identifiers, digests, rule identities, reviewer names and raw database
 * timestamps never reach the screen.
 */

/** The plain label for each programme state. */
export const PROGRAMME_STATE_LABELS: Readonly<Record<ProgrammeState, string>> = {
  not_started: 'Not started',
  initial: 'Initial phase',
  reassessment: 'Ready for review',
  maintenance: 'Maintenance phase',
  paused: 'Paused',
  completed: 'Completed',
};

/** The plain label for each due status. */
export const PROGRAMME_DUE_LABELS: Readonly<Record<ProgrammeDueStatus, string>> = {
  not_due: 'Not due yet',
  eligible: 'Within the reviewed range',
  due: 'Ready for review',
  needs_input: 'More information needed',
};

/** The named counting unit, never collapsed to a generic "washes". */
export const PROGRAMME_UNIT_LABELS: Readonly<Record<WashCountUnit, string>> = {
  wash: 'Washes',
  'shampoo-session': 'Shampoo sessions',
};

/** A single counted unit, for a count of one. */
const UNIT_SINGULAR: Readonly<Record<WashCountUnit, string>> = {
  wash: 'wash',
  'shampoo-session': 'shampoo session',
};

/** Owner-safe wording for each kind of recorded event. */
export const PROGRAMME_EVENT_KIND_LABELS: Readonly<Record<'wash' | 'application' | 'heat', string>> = {
  wash: 'Wash',
  application: 'Treatment application',
  heat: 'Heat use',
};

/** The plain label for each append-only lifecycle event kind. */
export const PROGRAMME_HISTORY_LABELS: Readonly<Record<string, string>> = {
  enrol: 'Enrolled',
  change: 'Updated',
  pause: 'Paused',
  resume: 'Resumed',
  maintenance: 'Entered maintenance',
  complete: 'Completed',
  abandon: 'Stopped',
};

const SAFE_PAUSE_REASONS: Readonly<Record<string, string>> = {
  'personal-choice': 'Owner chose to pause',
  scheduling: 'Schedule changed',
  'product-change': 'Product changed',
  'need-more-time': 'More time needed',
};

export function programmeHistoryLabel(entry: {
  readonly kind: string;
  readonly reasonCode?: string;
  readonly selectedApplicationEventId?: string;
}): string {
  if (entry.kind === 'pause') return SAFE_PAUSE_REASONS[entry.reasonCode ?? ''] ?? PROGRAMME_HISTORY_LABELS.pause;
  if (entry.kind === 'change' && entry.selectedApplicationEventId !== undefined) return 'Chosen application changed';
  return PROGRAMME_HISTORY_LABELS[entry.kind] ?? 'Programme details changed';
}

const TECHNICAL_LABEL = /(?:https?:\/\/|\bsha-?256\b|\brule[_@:-]|\bartifact[_@:-]|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

export function ownerSafeProductLabel(value: string | null | undefined): string {
  const candidate = value?.trim() ?? '';
  return candidate !== '' && !TECHNICAL_LABEL.test(candidate) ? candidate : 'Treatment product';
}

/**
 * Where an owner can resolve something that is missing. The programme screen
 * never names a field path, an identifier or an enum key: it names a place the
 * owner can actually go.
 */
export type ProgrammeDestination = 'my_shelf' | 'journey_activities' | 'journey_routines' | 'blocked_content'
  | 'programme_history' | 'retry';

/** Every destination a missing fact can route to. */
export const PROGRAMME_ACTIVITY_DESTINATION: readonly ProgrammeDestination[] = [
  'my_shelf',
  'journey_activities',
  'journey_routines',
  'blocked_content',
  'programme_history',
  'retry',
];

const MY_SHELF = 'Go to My Shelf';
const JOURNEY_ACTIVITIES = 'Go to Journey activity history';
const JOURNEY_ROUTINES = 'Go to Journey routine history';
const PROGRAMME_HISTORY = 'See this programme’s history';
const BLOCKED_CONTENT = 'Reviewed guidance is needed';

export interface ProgrammeMissingGuidance {
  readonly destination: ProgrammeDestination;
  readonly action: string;
  readonly explanation: string;
}

/**
 * Every structured missing fact becomes an actionable destination. A missing
 * reviewed rule never invents a fix: it says reviewed information is required.
 */
export const MISSING_FACT_GUIDANCE: Readonly<Record<ProgrammeMissingFactCode, ProgrammeMissingGuidance>> = {
  'missing-treatment-application': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'No confirmed treatment application has been recorded to count from yet.',
  },
  'multiple-treatment-applications': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'More than one confirmed treatment application was recorded, so one has to be chosen.',
  },
  'application-date-unknown': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'The treatment application date is not known exactly, so washes cannot be placed around it.',
  },
  'application-start-date-unknown': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The programme start date is not precise enough to place the treatment application.',
  },
  'application-before-enrolment': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The recorded treatment application is earlier than this programme started.',
  },
  'wash-date-unknown': {
    destination: 'journey_activities', action: JOURNEY_ACTIVITIES,
    explanation: 'A recorded wash has no known date, so it cannot be placed relative to the treatment.',
  },
  'date-precision-too-coarse': {
    destination: 'journey_activities', action: JOURNEY_ACTIVITIES,
    explanation: 'A recorded wash is only known to a month or a year, so it cannot be placed reliably.',
  },
  'event-after-asof': {
    destination: 'journey_activities', action: JOURNEY_ACTIVITIES,
    explanation: 'A recorded wash is dated later than the date this programme was read on.',
  },
  'shampoo-use-unknown': {
    destination: 'journey_activities', action: JOURNEY_ACTIVITIES,
    explanation: 'Whether shampoo was used is not recorded for a wash this count depends on.',
  },
  'application-wash-relationship-unknown': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'The wash that carried the treatment cannot be identified from what was recorded.',
  },
  'invalid-or-unsupported-event-facts': {
    destination: 'journey_activities', action: JOURNEY_ACTIVITIES,
    explanation: 'Some of your recorded activity could not be read safely, so the count cannot be worked out.',
  },
  'product-unverified': {
    destination: 'my_shelf', action: MY_SHELF,
    explanation: 'The product version this programme runs on is not verified.',
  },
  'product-version-missing': {
    destination: 'my_shelf', action: MY_SHELF,
    explanation: 'The exact product version this programme runs on is not recorded.',
  },
  'product-rule-mismatch': {
    destination: 'my_shelf', action: MY_SHELF,
    explanation: 'This programme was started for a different product than its reviewed guidance covers.',
  },
  'product-version-mismatch': {
    destination: 'my_shelf', action: MY_SHELF,
    explanation: 'This programme was started for a different product version than its reviewed guidance covers.',
  },
  'application-product-unknown': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'The recorded treatment application does not name the product it used.',
  },
  'application-product-mismatch': {
    destination: 'journey_routines', action: JOURNEY_ROUTINES,
    explanation: 'The recorded treatment application used a different product or version.',
  },
  'rule-draft': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'The guidance for this programme has not been reviewed for use yet.',
  },
  'rule-withdrawn': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'The guidance for this programme has been withdrawn and can no longer be used.',
  },
  'rule-id-mismatch': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'This programme no longer matches the reviewed guidance it started from.',
  },
  'rule-version-mismatch': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'This programme no longer matches the reviewed guidance it started from.',
  },
  'rule-publication-mismatch': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'This programme no longer matches the reviewed guidance it started from.',
  },
  'missing-transition-policy': {
    destination: 'blocked_content', action: BLOCKED_CONTENT,
    explanation: 'The reviewed guidance for this programme does not say how its phases change.',
  },
  'maintenance-transition-missing': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'Moving into the maintenance phase needs a recorded transition first.',
  },
  'maintenance-transition-mismatch': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The recorded transition does not match the reviewed guidance for this programme.',
  },
  'interruption-without-resumption': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'This programme is paused or was interrupted without an approved way back.',
  },
  'resumption-version-mismatch': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The approved resumption recorded here does not match the reviewed guidance.',
  },
  'resumption-date-invalid': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The recorded resumption could not be placed after the pause.',
  },
  'snapshot-mismatch': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The completed record for this programme no longer matches it.',
  },
  'snapshot-invalid': {
    destination: 'programme_history', action: PROGRAMME_HISTORY,
    explanation: 'The completed record for this programme could not be read.',
  },
};

/** The honest blocked-content copy, used whenever no reviewed rule can serve. */
export const BLOCKED_CONTENT_COPY: Readonly<{
  pending: string;
  withdrawn: string;
  mismatch: string;
  product: string;
}> = {
  pending: 'Treatment programme guidance is not available yet. It needs reviewed product instructions before StrandCue can use it.',
  withdrawn: 'The guidance this programme was reviewed under has been withdrawn. Your recorded history is still here, and you can stop this programme if you want to.',
  mismatch: 'This programme no longer matches the reviewed guidance it started from. Your recorded history is still here, and you can stop this programme if you want to.',
  product: 'This programme does not match a product on your shelf, so it cannot be checked.',
};

/** The owner-selectable pause reasons. Neutral codes only, never medical wording. */
export const PAUSE_REASON_CODES: readonly string[] = [
  'personal-choice',
  'scheduling',
  'product-change',
  'need-more-time',
];

export const PAUSE_REASON_LABELS: Readonly<Record<string, string>> = {
  'personal-choice': 'I chose to pause',
  scheduling: 'My schedule changed',
  'product-change': 'I changed products',
  'need-more-time': 'I need more time',
};

/**
 * Wording that must never appear: the evaluator reports scheduling facts, not
 * product effectiveness, and never a diagnosis or a guaranteed outcome.
 */
export const FORBIDDEN_PHRASES: readonly string[] = [
  'effective',
  'working',
  'successful treatment',
  'repaired',
  'restored',
  'healed',
  'cured',
  'corrected damage',
  'clinically proven',
  'diagnosed',
  'safe for everyone',
  'guaranteed',
  'overdue',
  'failed',
  'non-compliant',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * A stored date or timestamp as owner-friendly wording. Month/year precision is
 * preserved as written and never widened to a day, and an unreadable value is
 * stated as unrecorded rather than guessed.
 */
export function formatProgrammeDate(value: unknown): string {
  if (typeof value !== 'string') return 'Date not recorded';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (day !== null) return dayOnly(day[1]!, day[2]!, day[3]!);
  const instant = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/
    .exec(value.trim());
  if (instant !== null) {
    return `${dayOnly(instant[1]!, instant[2]!, instant[3]!)}, ${instant[4]}:${instant[5]}`;
  }
  return 'Date not recorded';
}

function dayOnly(year: string, month: string, day: string): string {
  const monthName = MONTHS[Number(month) - 1];
  if (monthName === undefined) return 'Date not recorded';
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    return 'Date not recorded';
  }
  return `${Number(day)} ${monthName} ${year}`;
}

/** A count in its named unit, with the singular form for one. */
export function formatProgrammeCount(count: number, unit: WashCountUnit): string {
  return count === 1 ? `1 ${UNIT_SINGULAR[unit]}` : `${count} ${PROGRAMME_UNIT_LABELS[unit].toLowerCase()}`;
}

/** A reviewed range, preserved as a range and never collapsed to one number. */
export function programmeRangeSentence(range: WashCountRange, unit: WashCountUnit): string {
  if (range.minimum === range.maximum) {
    return formatProgrammeCount(range.minimum, unit);
  }
  // The unit is stated once: "Between 2 and 4 washes" is still a range, and the
  // owner never sees a single invented due number.
  return `Between ${range.minimum} and ${range.maximum} ${PROGRAMME_UNIT_LABELS[unit].toLowerCase()}`;
}

export function formatProgrammeRange(range: WashCountRange, unit: WashCountUnit): string {
  return programmeRangeSentence(range, unit);
}

/** The labelled owner-safe description of one recorded event reference. */
export function programmeEventLabel(kind: 'wash' | 'application' | 'heat', dateValue: unknown): string {
  return `${PROGRAMME_EVENT_KIND_LABELS[kind]} on ${formatProgrammeDate(dateValue)}`;
}

/** The plain sentence describing what is missing and where to go. */
export function missingFactSentence(code: ProgrammeMissingFactCode): ProgrammeMissingGuidance {
  return MISSING_FACT_GUIDANCE[code];
}

import type { CueCheckGoal, CueCheckObservationField, CueCheckTiming } from '../../../packages/domain/src/index';

/**
 * Owner-facing wording for Cue Checks. Every question, answer and label is
 * plain language; technical keys never reach the screen. The wording
 * describes what an owner noticed. It never claims a product or routine
 * caused, fixed, repaired, healed or guaranteed anything, and never reads
 * like medical or scalp-condition advice.
 */

export interface CueAnswerOption {
  /** The stored vocabulary value this label stands for. */
  readonly value: string;
  readonly label: string;
}

export interface CueQuestion {
  readonly field: CueCheckObservationField;
  /** Short name used in change summaries and answer lists. */
  readonly label: string;
  readonly prompt: string;
  /** Definite answers only; "Not sure" is offered for every question. */
  readonly options: readonly CueAnswerOption[];
}

const SAME = { value: 'same', label: 'About the same' } as const;

export const CUE_QUESTIONS: readonly CueQuestion[] = [
  {
    field: 'overallResult',
    label: 'Overall result',
    prompt: 'Overall, how did this result compare with your usual result?',
    options: [
      { value: 'better', label: 'Better than usual' },
      SAME,
      { value: 'worse', label: 'Worse than usual' },
    ],
  },
  {
    field: 'satisfaction',
    label: 'Satisfaction',
    prompt: 'How satisfied were you with this use?',
    options: [
      { value: 'satisfied', label: 'Satisfied' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'dissatisfied', label: 'Not satisfied' },
    ],
  },
  {
    field: 'dryness',
    label: 'Dryness',
    prompt: 'Did your hair feel drier, about the same, or less dry than usual?',
    options: [{ value: 'less', label: 'Less dry' }, SAME, { value: 'more', label: 'Drier' }],
  },
  {
    field: 'frizz',
    label: 'Frizz',
    prompt: 'Compared with usual, how much frizz did you notice?',
    options: [{ value: 'less', label: 'Less frizz' }, SAME, { value: 'more', label: 'More frizz' }],
  },
  {
    field: 'softness',
    label: 'Softness',
    prompt: 'Compared with usual, how soft did your hair feel?',
    options: [{ value: 'less', label: 'Less soft' }, SAME, { value: 'more', label: 'Softer' }],
  },
  {
    field: 'tangling',
    label: 'Tangling',
    prompt: 'Compared with usual, how much tangling did you notice?',
    options: [{ value: 'less', label: 'Less tangling' }, SAME, { value: 'more', label: 'More tangling' }],
  },
  {
    field: 'buildup',
    label: 'Buildup or heaviness',
    prompt: 'Compared with usual, how much buildup or heaviness did you notice?',
    options: [
      { value: 'less', label: 'Less buildup or heaviness' },
      SAME,
      { value: 'more', label: 'More buildup or heaviness' },
    ],
  },
  {
    field: 'breakage',
    label: 'Breakage',
    prompt: 'Compared with usual, how much breakage did you notice?',
    options: [{ value: 'less', label: 'Less breakage' }, SAME, { value: 'more', label: 'More breakage' }],
  },
  {
    field: 'styleLongevity',
    label: 'Style lasting',
    prompt: 'How long did your style last compared with usual?',
    options: [
      { value: 'shorter', label: 'Shorter than usual' },
      { value: 'similar', label: 'About the same' },
      { value: 'longer', label: 'Longer than usual' },
    ],
  },
  {
    field: 'immediateReaction',
    label: 'Immediate reaction',
    prompt: 'Did you notice any immediate reaction?',
    options: [
      { value: 'none-noticed', label: 'No reaction noticed' },
      { value: 'some-noticed', label: 'I noticed a reaction' },
    ],
  },
  {
    field: 'wouldUseAgain',
    label: 'Choose again',
    prompt: 'Would you choose this routine again?',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
      { value: 'unsure', label: 'Undecided' },
    ],
  },
];

export const NOT_SURE_LABEL = 'Not sure';
export const NOT_ANSWERED_LABEL = 'Not answered';
export const NOTES_PROMPT = 'Anything else you noticed?';
export const NOTES_LABEL = 'Your note';

/** Style longevity can only be noticed later, so an immediate check never asks it. */
export function questionsFor(timing: CueCheckTiming): readonly CueQuestion[] {
  return CUE_QUESTIONS.filter(question => timing === 'delayed' || question.field !== 'styleLongevity');
}

export function questionFor(field: CueCheckObservationField): CueQuestion {
  return CUE_QUESTIONS.find(question => question.field === field)!;
}

/** The words for a stored answer; `unknown` is always "Not sure". */
export function answerLabel(field: CueCheckObservationField, value: unknown): string {
  if (value === undefined) return NOT_ANSWERED_LABEL;
  if (value === 'unknown') return NOT_SURE_LABEL;
  return questionFor(field).options.find(option => option.value === value)?.label ?? NOT_ANSWERED_LABEL;
}

const GOAL_LABELS: Readonly<Record<CueCheckGoal, string>> = { basic_wash: 'Basic wash' };

export function goalLabel(goal: CueCheckGoal): string {
  return GOAL_LABELS[goal];
}

export function timingLabel(timing: CueCheckTiming): string {
  return timing === 'immediate' ? 'Right after your routine' : 'A later check-in';
}

export function routineLabel(status: string): string {
  return status === 'abandoned' ? 'Stopped routine' : 'Completed routine';
}

export const SUMMARY_TIMING_HEADINGS: Readonly<Record<CueCheckTiming, string>> = {
  immediate: 'Right after your routines',
  delayed: 'Later check-ins',
};

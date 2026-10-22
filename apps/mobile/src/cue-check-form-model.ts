import { CUE_CHECK_OBSERVATION_FIELDS } from '../../../packages/domain/src/index';
import { NOTES_LABEL, answerLabel, questionFor } from './cue-check-copy';
import type { CueCheckDraft } from './cue-check-state';

/**
 * Pure rules for the Cue Check form. The draft holds only what the owner
 * chose: a skipped question stays absent, "Not sure" is stored as `unknown`,
 * and clearing an answer removes it. Nothing here fills in, infers or
 * interprets an answer or a note.
 */

export const NOTES_LIMIT = 2000;
export const REASON_LIMIT = 500;

export interface ChangeLine {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

function notesOf(draft: CueCheckDraft): string {
  const notes = draft.notes;
  return typeof notes === 'string' ? notes : '';
}

/** At least one structured answer or a note with something in it. */
export function hasContent(draft: CueCheckDraft): boolean {
  const answered = CUE_CHECK_OBSERVATION_FIELDS.some(field => draft[field] !== undefined);
  return answered || notesOf(draft).trim().length > 0;
}

export function canSaveNew(draft: CueCheckDraft): boolean {
  return hasContent(draft) && notesOf(draft).length <= NOTES_LIMIT;
}

/** What a correction changes, in plain words; unchanged answers are omitted. */
export function describeChanges(before: CueCheckDraft, after: CueCheckDraft): readonly ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const field of CUE_CHECK_OBSERVATION_FIELDS) {
    if (before[field] === after[field]) continue;
    lines.push({
      label: questionFor(field).label,
      from: answerLabel(field, before[field]),
      to: answerLabel(field, after[field]),
    });
  }
  const earlier = notesOf(before);
  const later = notesOf(after);
  if (earlier !== later) {
    lines.push({
      label: NOTES_LABEL,
      from: earlier === '' ? 'No note' : 'Earlier note',
      to: later === '' ? 'Note removed' : earlier === '' ? 'Note added' : 'Note edited',
    });
  }
  return lines;
}

export function canSaveCorrection(input: {
  readonly draft: CueCheckDraft;
  readonly original: CueCheckDraft;
  readonly reason: string;
}): boolean {
  const reason = input.reason.trim();
  return (
    canSaveNew(input.draft) &&
    reason.length > 0 &&
    reason.length <= REASON_LIMIT &&
    describeChanges(input.original, input.draft).length > 0
  );
}

/** One change as a sentence; no arrows, because a screen reader reads them aloud. */
export function changeSentence(line: ChangeLine): string {
  return `${line.label}: changed from ${line.from} to ${line.to}`;
}

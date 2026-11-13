import type { CueCheckState } from './cue-check-state';

const SAVED: Readonly<Record<'new' | 'correction' | 'void', string>> = {
  new: 'Check-in saved.',
  correction: 'Correction saved.',
  void: 'Check-in removed from active history.',
};

const READS: ReadonlySet<string> = new Set(['list', 'page', 'detail']);

function loadedMore(added: number): string {
  return `Loaded ${added} more check-in${added === 1 ? '' : 's'}.`;
}

/**
 * What a screen reader should be told when the Cue Check state moves from
 * `previous` to `next`. Each transition is announced once; unchanged state and
 * background refreshes say nothing.
 *
 * An outcome is recognised by the reducer's explicit `lastSaved` marker, not by
 * seeing the brief "saving" phase, so a fast save is still announced and a
 * cancel never is. Load failures are spoken here once; failures inside a form
 * are announced by moving focus to their visible alert, never twice.
 */
export function announcementFor(previous: CueCheckState, next: CueCheckState): string | null {
  if (previous.ownerKey !== next.ownerKey) return null;
  // A confirmed save is its own marker. Cancelling or a reload that ends an edit
  // changes the screen but never sets it, so those stay silent.
  if (next.lastSaved !== null && next.lastSaved !== previous.lastSaved) return SAVED[next.lastSaved.mode];
  const loadFailure = next.failure;
  if (loadFailure !== null && loadFailure !== previous.failure && next.compose === null && READS.has(loadFailure.source)) {
    return loadFailure.message;
  }
  const added = next.items.length - previous.items.length;
  if (previous.phase === 'list-ready' && next.phase === 'list-ready' && added > 0) return loadedMore(added);
  if (previous.phase === next.phase) return null;
  switch (next.phase) {
    case 'saving-new':
      return 'Saving your check-in…';
    case 'saving-correction':
      return 'Saving your correction…';
    case 'voiding':
      return 'Removing this check-in from active history…';
    case 'list-ready':
      if (previous.activeRequest?.kind !== 'page') return null;
      return added > 0 ? loadedMore(added) : 'No more check-ins to load.';
    default:
      return null;
  }
}

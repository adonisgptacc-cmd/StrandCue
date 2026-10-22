import type { CueCheckState } from './cue-check-state';

const SAVED: Readonly<Record<'new' | 'correction' | 'void', string>> = {
  new: 'Check-in saved.',
  correction: 'Correction saved.',
  void: 'Check-in removed from active history.',
};

function loadedMore(added: number): string {
  return `Loaded ${added} more check-in${added === 1 ? '' : 's'}.`;
}

/**
 * What a screen reader should be told when the Cue Check state moves from
 * `previous` to `next`. Each transition is announced once; unchanged state and
 * background refreshes say nothing, and failures are announced by their own
 * visible alert instead of here.
 *
 * An outcome is recognised by the edit session ending in a confirmed record,
 * not by seeing the brief "saving" phase, so a fast save is still announced.
 */
export function announcementFor(previous: CueCheckState, next: CueCheckState): string | null {
  if (previous.ownerKey !== next.ownerKey) return null;
  if (previous.compose !== null && next.compose === null && next.phase === 'detail-ready' && next.failure === null) {
    return SAVED[previous.compose.mode];
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

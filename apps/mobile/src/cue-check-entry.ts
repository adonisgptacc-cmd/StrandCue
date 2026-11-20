import type { CueCheckReceipt } from './cue-check-api';
import type { TerminalExecutionContext } from './cue-check-state';

/**
 * Which Cue Checks a routine offers. Only a routine the server confirmed as
 * completed or stopped may take one; an active check of the same timing is
 * opened instead of duplicated; a removed check never blocks a new one. The
 * answer comes from the check-ins already loaded, so the server's own
 * one-active-check rule remains the final authority.
 */

export type EntryAction = { readonly kind: 'start' } | { readonly kind: 'open'; readonly recordId: string };

export interface EntryOptions {
  readonly eligible: boolean;
  readonly immediate: EntryAction | null;
  readonly delayed: EntryAction | null;
}

export function isTerminalStatus(status: string): status is 'completed' | 'abandoned' {
  return status === 'completed' || status === 'abandoned';
}

export function entryOptions(
  execution: TerminalExecutionContext,
  items: readonly CueCheckReceipt[],
): EntryOptions {
  if (!isTerminalStatus(execution.status)) return { eligible: false, immediate: null, delayed: null };
  const actionFor = (timing: 'immediate' | 'delayed'): EntryAction => {
    const existing = items.find(
      item => item.executionId === execution.executionId && item.timing === timing && item.lifecycle === 'active',
    );
    return existing === undefined ? { kind: 'start' } : { kind: 'open', recordId: existing.recordId };
  };
  return { eligible: true, immediate: actionFor('immediate'), delayed: actionFor('delayed') };
}

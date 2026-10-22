import { describe, expect, it } from 'vitest';

import { announcementFor } from '../../apps/mobile/src/cue-check-announce';
import { initialCueCheckState, type CueCheckState } from '../../apps/mobile/src/cue-check-state';

const base = initialCueCheckState('owner-a');
const state = (overrides: Partial<CueCheckState>): CueCheckState => ({ ...base, ...overrides });
const newCompose = { mode: 'new', executionId: 'e' } as const;
const fixCompose = { mode: 'correction', recordId: 'r', expectedRevision: 1 } as const;
const voidCompose = { mode: 'void', recordId: 'r', expectedRevision: 1 } as const;
const item = (n: number) => ({ recordId: String(n) }) as never;

describe('what is announced to a screen reader', () => {
  it('announces each saving state', () => {
    expect(announcementFor(base, state({ phase: 'saving-new' }))).toBe('Saving your check-in…');
    expect(announcementFor(base, state({ phase: 'saving-correction' }))).toBe('Saving your correction…');
    expect(announcementFor(base, state({ phase: 'voiding' }))).toBe('Removing this check-in from active history…');
  });

  it('announces each confirmed outcome once, even if saving was never drawn', () => {
    expect(announcementFor(state({ compose: newCompose, phase: 'editing-new' }), state({ phase: 'detail-ready' }))).toBe('Check-in saved.');
    expect(announcementFor(state({ compose: fixCompose, phase: 'saving-correction' }), state({ phase: 'detail-ready' }))).toBe('Correction saved.');
    expect(announcementFor(state({ compose: voidCompose, phase: 'voiding' }), state({ phase: 'detail-ready' }))).toBe('Check-in removed from active history.');
  });

  it('says nothing for a failure, an unchanged state or a background refresh', () => {
    const saving = state({ compose: newCompose, phase: 'saving-new' });
    expect(announcementFor(saving, state({ compose: newCompose, phase: 'failed' }))).toBeNull();
    expect(announcementFor(base, base)).toBeNull();
    const detail = state({ phase: 'detail-ready' });
    expect(announcementFor(detail, state({ phase: 'detail-ready', activeRequest: { requestId: 2, kind: 'detail', background: true } }))).toBeNull();
    const failed = state({ phase: 'detail-ready', failure: { code: 'offline', message: 'x', retryable: true, source: 'create' } });
    expect(announcementFor(saving, failed)).toBeNull();
  });

  it('announces how many more check-ins a page added, or that there were none', () => {
    const before = state({ phase: 'loading-list', items: [item(1)], activeRequest: { requestId: 2, kind: 'page', background: false } });
    expect(announcementFor(before, state({ phase: 'list-ready', items: [item(1), item(2)] }))).toBe('Loaded 1 more check-in.');
    expect(announcementFor(before, state({ phase: 'list-ready', items: [item(1), item(2), item(3)] }))).toBe('Loaded 2 more check-ins.');
    expect(announcementFor(before, state({ phase: 'list-ready', items: [item(1)] }))).toBe('No more check-ins to load.');
    expect(announcementFor(state({ phase: 'list-ready', items: [item(1)] }), state({ phase: 'list-ready', items: [item(1), item(2)] }))).toBe('Loaded 1 more check-in.');
  });

  it('does not announce the first list load or another owner’s state', () => {
    const loading = state({ phase: 'loading-list', activeRequest: { requestId: 1, kind: 'list', background: false } });
    expect(announcementFor(loading, state({ phase: 'list-ready', items: [item(1), item(2)] }))).toBeNull();
    expect(announcementFor(base, { ...initialCueCheckState('owner-b'), phase: 'saving-new' })).toBeNull();
  });
});

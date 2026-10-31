import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CueCheckDetail as DetailRecord, CueCheckReceipt } from '../../apps/mobile/src/cue-check-api';
import { CueCheckDetail } from '../../apps/mobile/src/CueCheckDetail';
import { CueCheckHistory, type CueCheckHistoryProps } from '../../apps/mobile/src/CueCheckHistory';
import { CueCheckVoidConfirmation } from '../../apps/mobile/src/CueCheckVoidConfirmation';
import { formatWhen } from '../../apps/mobile/src/cue-check-records';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

const EXEC = '44444444-4444-4444-8444-444444444444';
const RUN = '55555555-5555-4555-8555-555555555555';
const T0 = '2026-10-22T09:30:00-05:00';
const R0 = '2026-10-22T14:31:00.000000+00:00';
const R1 = '2026-10-23T08:00:00.000000+00:00';

const step = {
  stepId: 'step-1',
  position: 1,
  confirmedAt: '2026-10-22T14:20:00+00:00',
  action: 'Rinse with lukewarm water',
  productId: 'prod-secret-id',
  productVersionId: '99999999-9999-4999-8999-999999999999',
  toolId: null,
  toolVersionId: null,
};

function receipt(n: number, overrides: Record<string, unknown> = {}): CueCheckReceipt {
  const timing = (overrides.timing as string | undefined) ?? 'immediate';
  return {
    recordId: `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`,
    executionId: EXEC,
    recommendationRunId: RUN,
    goal: 'basic_wash',
    timing,
    lifecycle: 'active',
    revision: 1,
    observedAt: T0,
    receivedAt: R0,
    observation: { timing, observedAt: T0, overallResult: 'better', dryness: 'unknown', notes: '  my note\nline two ' },
    confirmedSteps: [step],
    executionStatus: 'completed',
    createdAt: R0,
    updatedAt: R0,
    ...overrides,
  } as unknown as CueCheckReceipt;
}

function revision(n: number, kind: string, extra: Record<string, unknown>) {
  return {
    revisionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`,
    sequence: n,
    kind,
    observation: null,
    correctsId: null,
    correctionReason: null,
    voidReason: null,
    receivedAt: R0,
    state: null,
    ...extra,
  };
}

const first = { timing: 'immediate', observedAt: T0, overallResult: 'better', dryness: 'unknown', notes: '  my note\nline two ' };
const second = { timing: 'immediate', observedAt: T0, overallResult: 'worse', dryness: 'more' };

function correctedDetail(): DetailRecord {
  return {
    ...receipt(1, { revision: 2, observation: second, receivedAt: R1 }),
    revisions: [
      revision(1, 'create', { observation: first, state: 'corrected' }),
      revision(2, 'correct', { observation: second, correctsId: revision(1, 'create', {}).revisionId, correctionReason: 'I tapped the wrong answer', receivedAt: R1, state: 'active' }),
    ],
  } as unknown as DetailRecord;
}

function voidedDetail(): DetailRecord {
  return {
    ...receipt(1, { revision: 3, lifecycle: 'voided', observation: second, receivedAt: R1 }),
    revisions: [
      revision(1, 'create', { observation: first, state: 'corrected' }),
      revision(2, 'correct', { observation: second, correctsId: revision(1, 'create', {}).revisionId, correctionReason: 'I tapped the wrong answer', state: 'voided' }),
      revision(3, 'void', { correctsId: revision(2, 'correct', {}).revisionId, voidReason: 'Entered on the wrong day', receivedAt: R1 }),
    ],
  } as unknown as DetailRecord;
}

function activeDetail(): DetailRecord {
  return { ...receipt(1), revisions: [revision(1, 'create', { observation: first, state: 'active' })] } as unknown as DetailRecord;
}

const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

async function render(element: ReturnType<typeof createElement>): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const buttons = (renderer: ReactTestRenderer) => renderer.root.findAll(node => node.type === 'button').map(node => node.props.accessibilityLabel as string);
const press = async (renderer: ReactTestRenderer, label: string) =>
  act(async () => renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label).props.onPress());

const TECHNICAL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}|operation|"lifecycle"|correctsId|revisionId|none-noticed|some-noticed|overallResult/;
const INTERNAL_WORDS = /voided|lifecycle|revision|sequence|mutation|append-only|head record|tombstone/i;

function historyProps(overrides: Partial<CueCheckHistoryProps> = {}): CueCheckHistoryProps {
  return {
    items: [],
    status: 'ready',
    hasMore: false,
    loadingMore: false,
    failure: null,
    onOpen: vi.fn(),
    onLoadMore: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('check-in list in Journey', () => {
  it('lists check-ins in the order given with only owner-facing facts', async () => {
    const items = [receipt(2, { timing: 'delayed', receivedAt: R1 }), receipt(1, { lifecycle: 'voided', executionStatus: 'abandoned' })];
    const renderer = await render(createElement(CueCheckHistory, historyProps({ items })));
    const out = text(renderer);
    expect(out.indexOf('A later check-in')).toBeGreaterThan(-1);
    expect(out.indexOf('A later check-in')).toBeLessThan(out.indexOf('Right after your routine'));
    expect(out).toContain('Basic wash');
    expect(out).toContain(formatWhen(T0));
    expect(out).toContain('Completed routine');
    expect(out).toContain('Stopped routine');
    expect(out).toContain('Removed from active history');
    expect(out).toContain('Overall result: Better than usual');
    expect(out).toContain('Dryness: Not sure');
    expect(out).not.toMatch(TECHNICAL);
    expect(out).not.toMatch(INTERNAL_WORDS);
  });

  it('shows a short selection of answers without interpreting them', async () => {
    const many = receipt(1, { observation: { ...first, frizz: 'less', softness: 'more', tangling: 'same', buildup: 'less', breakage: 'same' } });
    const renderer = await render(createElement(CueCheckHistory, historyProps({ items: [many] })));
    const out = text(renderer);
    expect(out).toContain('and 4 more answers');
    expect(out).not.toMatch(/improv|better overall|score|%/i);
  });

  it('opens a record from a uniquely named control', async () => {
    const p = historyProps({ items: [receipt(1), receipt(2)] });
    const renderer = await render(createElement(CueCheckHistory, p));
    const names = buttons(renderer).filter(label => label.startsWith('Open check-in'));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toContain('Open check-in 1:');
    expect(names[0]).toContain('Basic wash');
    expect(names[0]).toContain('Overall result: Better than usual');
    expect(names[0]).not.toMatch(/ of \d/);
    await press(renderer, names[1]!);
    expect(p.onOpen).toHaveBeenCalledWith(receipt(2).recordId);
  });

  it('marks the empty-state title as a heading and announces a failure through one channel', async () => {
    const empty = await render(createElement(CueCheckHistory, historyProps()));
    expect(empty.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'header').length).toBeGreaterThan(0);
    const failed = await render(createElement(CueCheckHistory, historyProps({ status: 'failed', failure: { code: 'offline', message: 'x', retryable: true, source: 'list' } })));
    expect(failed.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLiveRegion !== undefined)).toHaveLength(0);
  });

  it('shows loading, empty, failed and end states', async () => {
    expect(text(await render(createElement(CueCheckHistory, historyProps({ status: 'loading' }))))).toContain('Loading your check-ins…');
    expect(text(await render(createElement(CueCheckHistory, historyProps())))).toContain('No check-ins yet.');
    const onRetry = vi.fn();
    const failed = await render(
      createElement(CueCheckHistory, historyProps({ status: 'failed', onRetry, failure: { code: 'offline', message: 'You appear to be offline. Check your connection and try again.', retryable: true, source: 'list' } })),
    );
    expect(text(failed)).toContain('You appear to be offline');
    await press(failed, 'Try again');
    expect(onRetry).toHaveBeenCalledTimes(1);
    const end = await render(createElement(CueCheckHistory, historyProps({ items: [receipt(1)] })));
    expect(text(end)).toContain('That is everything you have recorded.');
  });

  it('offers more only when there is more and keeps shown rows while a page loads', async () => {
    const p = historyProps({ items: [receipt(1)], hasMore: true });
    const renderer = await render(createElement(CueCheckHistory, p));
    expect(text(renderer)).not.toContain('That is everything');
    await press(renderer, 'Load more check-ins');
    expect(p.onLoadMore).toHaveBeenCalledTimes(1);
    const loading = await render(createElement(CueCheckHistory, historyProps({ items: [receipt(1)], hasMore: true, loadingMore: true })));
    expect(text(loading)).toContain('Loading more check-ins…');
    expect(text(loading)).toContain('Right after your routine');
  });
});

describe('check-in detail and history of changes', () => {
  const noop = { onCorrect: vi.fn(), onRemove: vi.fn(), onBack: vi.fn(), onAddLater: vi.fn() };

  it('shows what was recorded exactly, with plain labels', async () => {
    const renderer = await render(createElement(CueCheckDetail, { ...noop, detail: activeDetail(), canAddLater: false }));
    const out = text(renderer);
    expect(out).toContain('Right after your routine');
    expect(out).toContain('Basic wash');
    expect(out).toContain('Noticed on');
    expect(out).not.toContain('You felt this on');
    expect(out).toContain(formatWhen(T0));
    expect(out).toContain('Saved to your record');
    expect(out).toContain('Overall, how did this result compare with your usual result?');
    expect(out).toContain('Better than usual');
    expect(out).toContain('Not sure');
    expect(out).toContain('  my note\\nline two ');
    expect(out).not.toMatch(TECHNICAL);
    expect(out).not.toMatch(INTERNAL_WORDS);
    expect(out).not.toContain('Frizz');
  });

  it('lists only confirmed routine steps by their action sentence, never identifiers', async () => {
    const renderer = await render(createElement(CueCheckDetail, { ...noop, detail: activeDetail(), canAddLater: false }));
    const out = text(renderer);
    expect(out).toContain('Steps you confirmed');
    expect(out).toContain('Rinse with lukewarm water');
    expect(out).not.toContain('prod-secret-id');
    const none = await render(createElement(CueCheckDetail, { ...noop, detail: { ...activeDetail(), confirmedSteps: [] } as DetailRecord, canAddLater: false }));
    expect(text(none)).toContain('No completed step was recorded for this routine.');
    expect(text(none)).not.toContain('Rinse');
  });

  it('keeps earlier answers visibly separate from the current ones', async () => {
    const renderer = await render(createElement(CueCheckDetail, { ...noop, detail: correctedDetail(), canAddLater: false }));
    const out = text(renderer);
    expect(out).toContain('Current answers');
    expect(out).toContain('First recorded');
    expect(out).toContain('Corrected');
    expect(out).toContain('Earlier answers (replaced)');
    expect(out).toContain('I tapped the wrong answer');
    const current = out.slice(out.indexOf('Current answers'), out.indexOf('Steps you confirmed') > -1 ? out.indexOf('Steps you confirmed') : undefined);
    expect(current).toContain('Worse than usual');
    expect(current).not.toContain('Better than usual');
    const earlier = out.slice(out.indexOf('Earlier answers (replaced)'));
    expect(earlier).toContain('Better than usual');
  });

  it('shows a removed check-in as removed, keeps its timeline and offers no correction', async () => {
    const renderer = await render(createElement(CueCheckDetail, { ...noop, detail: voidedDetail(), canAddLater: true }));
    const out = text(renderer);
    expect(out).toContain('Removed from active history');
    expect(out).toContain('Entered on the wrong day');
    expect(out).toContain('First recorded');
    expect(out).toContain('Corrected');
    expect(out).toContain('Answers when it was removed');
    expect(out).not.toContain('Current answers');
    expect(out).not.toMatch(INTERNAL_WORDS);
    const labels = buttons(renderer);
    expect(labels).not.toContain('Correct this check-in');
    expect(labels).not.toContain('Remove from active history');
    expect(labels).toContain('Back to check-ins');
  });

  it('offers correct, remove and add-later actions that only call their handlers', async () => {
    const handlers = { onCorrect: vi.fn(), onRemove: vi.fn(), onBack: vi.fn(), onAddLater: vi.fn() };
    const renderer = await render(createElement(CueCheckDetail, { ...handlers, detail: activeDetail(), canAddLater: true }));
    await press(renderer, 'Correct this check-in');
    await press(renderer, 'Remove from active history');
    await press(renderer, 'Add a later check-in for this routine');
    await press(renderer, 'Back to check-ins');
    expect(handlers.onCorrect).toHaveBeenCalledTimes(1);
    expect(handlers.onRemove).toHaveBeenCalledTimes(1);
    expect(handlers.onAddLater).toHaveBeenCalledTimes(1);
    expect(handlers.onBack).toHaveBeenCalledTimes(1);
    const hidden = await render(createElement(CueCheckDetail, { ...noop, detail: activeDetail(), canAddLater: false }));
    expect(buttons(hidden)).not.toContain('Add a later check-in for this routine');
  });

  it('offers a retry when the full history could not be loaded, instead of loading forever', async () => {
    const { revisions: _omit, ...bare } = activeDetail() as DetailRecord & { revisions: unknown };
    const onReloadHistory = vi.fn();
    const renderer = await render(createElement(CueCheckDetail, { ...noop, onReloadHistory, historyUnavailable: true, detail: bare as unknown as CueCheckReceipt, canAddLater: false }));
    expect(text(renderer)).toContain('The full history could not be loaded.');
    expect(text(renderer)).not.toContain('Loading the full history…');
    await press(renderer, 'Try loading the history again');
    expect(onReloadHistory).toHaveBeenCalledTimes(1);
  });

  it('moves focus to the detail heading when it opens', async () => {
    const { focusOn } = await import('../../apps/mobile/src/focus');
    vi.mocked(focusOn).mockClear();
    await render(createElement(CueCheckDetail, { ...noop, detail: activeDetail(), canAddLater: false }));
    expect(focusOn).toHaveBeenCalledTimes(1);
  });

  it('says the history is still loading when only the receipt is known', async () => {
    const { revisions: _omit, ...bare } = activeDetail() as DetailRecord & { revisions: unknown };
    const renderer = await render(createElement(CueCheckDetail, { ...noop, detail: bare as unknown as CueCheckReceipt, canAddLater: false }));
    expect(text(renderer)).toContain('Loading the full history…');
  });

  it('labels a later check-in and a stopped routine plainly', async () => {
    const detail = { ...activeDetail(), timing: 'delayed', executionStatus: 'abandoned', observation: { ...first, timing: 'delayed', styleLongevity: 'longer' } } as unknown as DetailRecord;
    const out = text(await render(createElement(CueCheckDetail, { ...noop, detail, canAddLater: false })));
    expect(out).toContain('A later check-in');
    expect(out).toContain('Stopped routine');
    expect(out).toContain('Longer than usual');
  });

  it('keeps wording non-causal and non-medical', async () => {
    const out = text(await render(createElement(CueCheckDetail, { ...noop, detail: correctedDetail(), canAddLater: true })));
    expect(out).not.toMatch(/caus|proved|repair|heal|\bfix|treat|grew|growth|strengthen|guarantee|universally safe/i);
  });
});

describe('removing a check-in from active history', () => {
  const base = { whenLabel: formatWhen(T0), timing: 'immediate' as const, reason: '', saving: false, failure: null };

  it('names the check-in and explains what stays and what is untouched', async () => {
    const renderer = await render(
      createElement(CueCheckVoidConfirmation, { ...base, onReason: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() }),
    );
    const dialog = renderer.root.find(node => typeof node.type === 'string' && node.props.role === 'alertdialog');
    expect(dialog.props.accessibilityLabel).toContain('Remove this check-in from active history');
    expect(dialog.props.accessibilityLabel).toContain(formatWhen(T0));
    const out = text(renderer);
    expect(out).toContain('This check-in will no longer count as an active check-in.');
    expect(out).toContain('Your original answers stay in your private history.');
    expect(out).toContain('This does not change the product catalogue or anyone else’s records.');
    expect(out).not.toMatch(/erase|delet|permanent|destroy/i);
  });

  it('is not a modal that hides the rest of the screen, moves focus in, and ties its hint to the button', async () => {
    const { focusOn } = await import('../../apps/mobile/src/focus');
    vi.mocked(focusOn).mockClear();
    const renderer = await render(createElement(CueCheckVoidConfirmation, { ...base, onReason: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() }));
    expect(renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityViewIsModal === true)).toHaveLength(0);
    expect(focusOn).toHaveBeenCalledTimes(1);
    const confirm = renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === 'Remove from active history');
    expect(confirm.props.accessibilityHint).toBe('Add a reason to remove this check-in.');
  });

  it('always offers the reload after a conflict, even without a visible failure', async () => {
    const onReload = vi.fn();
    const renderer = await render(createElement(CueCheckVoidConfirmation, { ...base, reason: 'x', reloadRequired: true, onReload, onReason: vi.fn(), onConfirm: vi.fn(), onCancel: vi.fn() }));
    await press(renderer, 'Reload this check-in');
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === 'Remove from active history').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('requires a reason before confirming', async () => {
    const onConfirm = vi.fn();
    const empty = await render(createElement(CueCheckVoidConfirmation, { ...base, onReason: vi.fn(), onConfirm, onCancel: vi.fn() }));
    const confirm = empty.root.find(node => node.type === 'button' && node.props.accessibilityLabel === 'Remove from active history');
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => confirm.props.onPress());
    expect(onConfirm).not.toHaveBeenCalled();
    const filled = await render(createElement(CueCheckVoidConfirmation, { ...base, reason: 'Wrong day', onReason: vi.fn(), onConfirm, onCancel: vi.fn() }));
    await press(filled, 'Remove from active history');
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without confirming and shows failures visibly', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const failure = { code: 'revision-conflict', message: 'This check-in changed on another session. Reload it before trying again.', retryable: false, source: 'void' } as const;
    const renderer = await render(createElement(CueCheckVoidConfirmation, { ...base, failure, reason: 'x', onReason: vi.fn(), onConfirm, onCancel }));
    await press(renderer, 'Keep this check-in');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(text(renderer)).toContain(failure.message);
  });
});

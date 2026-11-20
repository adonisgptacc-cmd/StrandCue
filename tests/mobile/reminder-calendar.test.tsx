import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReminderCalendar } from '../../apps/mobile/src/ReminderCalendar';

const mocks = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  listProtocolExecutions: vi.fn(),
  loadCalendarHistoryPage: vi.fn(),
  reconcileDeviceReminders: vi.fn(),
  requestReminderPermissionAfterExplanation: vi.fn(),
}));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    ActivityIndicator: host('progress'),
    ScrollView: host('main'),
    Text: host('span'),
    TextInput: host('input'),
    View: host('section'),
  };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => 'new-plan-id' }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  secureStorage: { getItem: mocks.getItem, setItem: mocks.setItem, removeItem: mocks.removeItem },
}));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api.ts', () => ({
  listProtocolExecutions: mocks.listProtocolExecutions,
}));
vi.mock('../../apps/mobile/src/calendar-history', () => ({ loadCalendarHistoryPage: mocks.loadCalendarHistoryPage }));
vi.mock('../../apps/mobile/src/reminder-notifications.ts', () => ({
  reconcileDeviceReminders: mocks.reconcileDeviceReminders,
  requestReminderPermissionAfterExplanation: mocks.requestReminderPermissionAfterExplanation,
}));

const owner = '11111111-1111-4111-8111-111111111111';
const enabledState = {
  version: 1,
  ownerKey: owner,
  preferences: {
    ownerKey: owner,
    enabled: { planned_routine: true, delayed_cue_check: false, product_review: true },
    quietHours: null,
  },
  plans: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

async function mount(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ReminderCalendar, { owner })); });
  return renderer;
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(node => node.type === 'span'
    && node.props.accessibilityRole === 'button'
    && renderedText(node.props.children).includes(label));
}

function renderedText(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderedText).join('');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCalendarHistoryPage.mockReset();
  mocks.listProtocolExecutions.mockResolvedValue({ items: [], nextCursor: null });
  mocks.loadCalendarHistoryPage.mockResolvedValue({ items: [], nextCursor: null });
  mocks.reconcileDeviceReminders.mockResolvedValue(undefined);
  mocks.requestReminderPermissionAfterExplanation.mockResolvedValue(true);
});

describe('ReminderCalendar mutation lifecycle', () => {
  it('lets the owner retry account history after a transient load failure', async () => {
    mocks.getItem.mockResolvedValueOnce(JSON.stringify(enabledState));
    mocks.loadCalendarHistoryPage
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        items: [{ id: 'history-recovered', source: 'activity', title: 'Recovered activity', date: 'Date unknown', dateKey: null, sortAt: 0, status: 'unknown', kind: 'history' }],
        nextCursor: null,
      });
    const renderer = await mount();
    await settle();

    const retry = button(renderer, 'Retry calendar history');
    await act(async () => { retry.props.onPress(); });
    expect(renderedText(renderer.root.findAllByType('span').map(node => node.props.children))).toContain('Recovered activity');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps history pagination available when reminder settings fail to load', async () => {
    mocks.getItem.mockRejectedValueOnce(new Error('secure storage unavailable'));
    const historyCursor = { protocol: 'history-page-2', activity: null, cueCheck: null, programme: null, service: null, passportLoaded: true };
    mocks.loadCalendarHistoryPage
      .mockResolvedValueOnce({ items: [], nextCursor: historyCursor })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const renderer = await mount();
    await settle();

    const loadMore = button(renderer, 'Load more history');
    expect(loadMore.props.accessibilityState).toEqual({ disabled: false });
    await act(async () => { loadMore.props.onPress(); });

    expect(mocks.loadCalendarHistoryPage).toHaveBeenNthCalledWith(2, historyCursor);
    await act(async () => { renderer.unmount(); });
  });

  it('shows account history sources and filters dated records by month', async () => {
    mocks.getItem.mockResolvedValueOnce(JSON.stringify(enabledState));
    mocks.loadCalendarHistoryPage.mockResolvedValueOnce({
      items: [
        { id: 'activity-oct', source: 'activity', title: 'Recorded activity', date: '2026-10-08', dateKey: '2026-10-08', sortAt: 1, status: 'unknown', kind: 'history' },
        { id: 'check-sep', source: 'cue_check', title: 'Saved check-in', date: '2026-09-12', dateKey: '2026-09-12', sortAt: 2, status: 'completed', kind: 'history' },
      ],
      nextCursor: null,
    });
    const renderer = await mount();
    await settle();

    const month = renderer.root.find(node => node.type === 'input' && node.props.accessibilityLabel === 'Calendar month (YYYY-MM)');
    await act(async () => { month.props.onChangeText('2026-10'); });
    const octoberText = renderedText(renderer.root.findAllByType('span').map(node => node.props.children));
    expect(octoberText).toContain('2026-10-08');
    expect(octoberText).not.toContain('2026-09-12');
    const octoberDay = button(renderer, '2026-10-08');
    await act(async () => { octoberDay.props.onPress(); });
    expect(renderedText(renderer.root.findAllByType('span').map(node => node.props.children))).toContain('Recorded activity');
    await act(async () => { month.props.onChangeText('2026-09'); });
    expect(renderedText(renderer.root.findAllByType('span').map(node => node.props.children))).toContain('2026-09-12');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps controls disabled and refuses writes while saved settings are loading', async () => {
    const load = deferred<string | null>();
    mocks.getItem.mockReturnValueOnce(load.promise);
    const renderer = await mount();

    const savePlan = button(renderer, 'Save planned routine');
    expect(savePlan.props.accessibilityState).toEqual({ disabled: true });
    await act(async () => { savePlan.props.onPress(); });
    expect(mocks.setItem).not.toHaveBeenCalled();

    load.resolve(null);
    await settle();
    await act(async () => { renderer.unmount(); });
  });

  it('serializes fast category opt-outs so the later save cannot restore the earlier toggle', async () => {
    mocks.getItem.mockResolvedValueOnce(JSON.stringify(enabledState));
    const save = deferred<void>();
    mocks.setItem.mockReturnValueOnce(save.promise);
    const renderer = await mount();
    await settle();

    const firstCategory = button(renderer, 'Planned routine — on');
    const secondCategory = button(renderer, 'Product review — on');
    await act(async () => { firstCategory.props.onPress(); });
    await act(async () => { secondCategory.props.onPress(); });

    expect(mocks.setItem).toHaveBeenCalledTimes(1);
    const [, serialized] = mocks.setItem.mock.calls[0] as [string, string];
    const persisted = JSON.parse(serialized) as typeof enabledState;
    expect(persisted.preferences.enabled).toEqual({ planned_routine: false, delayed_cue_check: false, product_review: true });

    await act(async () => { save.resolve(); await save.promise; });
    await act(async () => { renderer.unmount(); });
  });

  it('does not recreate cleared settings when notification permission resolves after sign-out', async () => {
    mocks.getItem.mockResolvedValueOnce(JSON.stringify(enabledState));
    const permission = deferred<boolean>();
    mocks.requestReminderPermissionAfterExplanation.mockReturnValueOnce(permission.promise);
    const renderer = await mount();
    await settle();

    await act(async () => { button(renderer, 'Delayed check-in — off').props.onPress(); });
    await act(async () => { button(renderer, 'Continue to notification permission').props.onPress(); });
    await act(async () => { renderer.unmount(); });
    await mocks.removeItem(`strandcue-reminders-v1-${owner}`);
    permission.resolve(true);
    await settle();

    expect(mocks.setItem).not.toHaveBeenCalled();
  });

  it('does not reconcile a planned reminder after its owner leaves while the save is pending', async () => {
    mocks.getItem.mockResolvedValueOnce(JSON.stringify(enabledState));
    const write = deferred<void>();
    mocks.setItem.mockReturnValueOnce(write.promise);
    const renderer = await mount();
    await settle();
    const initialReconciliations = mocks.reconcileDeviceReminders.mock.calls.length;
    const date = renderer.root.find(node => node.type === 'input' && node.props.accessibilityLabel === 'Date (YYYY-MM-DD)');
    await act(async () => { date.props.onChangeText('2030-01-02'); });
    await act(async () => { button(renderer, 'Save planned routine').props.onPress(); });
    await vi.waitFor(() => expect(mocks.setItem).toHaveBeenCalled());
    await act(async () => { renderer.unmount(); });

    write.resolve();
    await settle();

    expect(mocks.reconcileDeviceReminders).toHaveBeenCalledTimes(initialReconciliations);
  });
});

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodayGuidance, todayHasHeatContext } from '../../apps/mobile/src/TodayGuidance';
import { clearAllCheckInDrafts, type CheckInDraft } from '../../apps/mobile/src/guidance/current-condition-state';
import { CHECK_IN_CONTINUE_LABEL, CHECK_IN_START_LABEL, CONCERN_LABELS, TIME_INPUT_LABEL } from '../../apps/mobile/src/guidance/guidance-copy';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), recordRun: vi.fn(), restore: vi.fn(), getActive: vi.fn(),
}));
vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('expo-crypto', () => ({ randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
vi.mock('../../apps/mobile/src/client', () => ({ supabase: null }));
vi.mock('../../apps/mobile/src/guidance/today-guidance-service', () => ({ generateTodayGuidance: mocks.generate }));
vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({ recordRecommendationRun: mocks.recordRun }));
vi.mock('../../apps/mobile/src/guidance/protocol-preview-model', () => ({ buildProtocolPreview: () => null }));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  getActiveExecutionWithDecision: mocks.restore, getActiveProtocolExecution: mocks.getActive,
}));
vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserProduct: vi.fn(async () => null),
}));

const original = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (!String(message).includes('react-test-renderer is deprecated')) original(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  clearAllCheckInDrafts();
  mocks.restore.mockResolvedValue(null);
  mocks.getActive.mockResolvedValue(null);
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: 'request-1' });
});

const draft = (concerns: CheckInDraft['concerns']): CheckInDraft => ({
  concerns, goal: 'basic_wash', availableMinutes: null, observedAt: null,
  zones: [], zoneConcerns: [],
});
const entry = (renderer: ReactTestRenderer) => renderer.root.findAll(node =>
  node.type === 'button' && node.props.accessibilityLabel === 'Review heat choices in Heat Coach');

describe('Today Heat Coach entry', () => {
  it('routes only an explicit heat concern; a tool-bearing step alone is not heat evidence', () => {
    expect(todayHasHeatContext(draft([]))).toBe(false);
    expect(todayHasHeatContext(draft(['dryness']))).toBe(false);
    expect(todayHasHeatContext(draft(['heat-concern']))).toBe(true);
  });

  it('shows a neutral 48dp entry only after a heat concern and calls the parent once', async () => {
    const onOpenHeatCoach = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(TodayGuidance, {
      ownerId: 'owner-a', onNavigate: vi.fn(), onOpenHeatCoach,
    })); });
    expect(entry(renderer)).toHaveLength(0);
    const button = (label: string) => renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label);
    await act(async () => { button(CHECK_IN_START_LABEL).props.onPress(); });
    expect(entry(renderer)).toHaveLength(0);
    await act(async () => { button(CONCERN_LABELS['heat-concern']).props.onPress(); });
    expect(entry(renderer)).toHaveLength(1);
    expect(entry(renderer)[0]!.props.style[0].minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => { entry(renderer)[0]!.props.onPress(); });
    expect(onOpenHeatCoach).toHaveBeenCalledOnce();
    expect(onOpenHeatCoach).toHaveBeenCalledWith(null);
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('hands the exact completed check-in to Heat Coach without generating a plan', async () => {
    const onOpenHeatCoach = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(TodayGuidance, {
      ownerId: 'owner-a', onNavigate: vi.fn(), onOpenHeatCoach,
    })); });
    const button = (label: string) => renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label);
    await act(async () => { button(CHECK_IN_START_LABEL).props.onPress(); });
    await act(async () => { button(CONCERN_LABELS['heat-concern']).props.onPress(); });
    const time = renderer.root.find(node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL);
    await act(async () => { time.props.onChangeText('20'); });
    await act(async () => { button(CHECK_IN_CONTINUE_LABEL).props.onPress(); });
    await act(async () => { entry(renderer)[0]!.props.onPress(); });
    expect(onOpenHeatCoach).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      goal: 'basic_wash', availableMinutes: 20, concerns: ['heat-concern'], observedAt: expect.any(String),
    }));
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not add a button without a parent route', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(TodayGuidance, {
      ownerId: 'owner-a', onNavigate: vi.fn(),
    })); });
    const button = renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === CHECK_IN_START_LABEL);
    await act(async () => { button.props.onPress(); });
    const concern = renderer.root.find(node => node.type === 'button'
      && node.props.accessibilityLabel === CONCERN_LABELS['heat-concern']);
    await act(async () => { concern.props.onPress(); });
    expect(entry(renderer)).toHaveLength(0);
    await act(async () => { renderer.unmount(); });
  });
});

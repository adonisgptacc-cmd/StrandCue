import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllCheckInDrafts } from '../../apps/mobile/src/guidance/current-condition-state';

import { TodayCheckIn } from '../../apps/mobile/src/TodayCheckIn';
import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';
import {
  CHECK_IN_BOUNDARY,
  CHECK_IN_CONTINUE_LABEL,
  CHECK_IN_START_LABEL,
  TIME_INPUT_LABEL,
} from '../../apps/mobile/src/guidance/guidance-copy';
import {
  initialPreflight,
  type CheckInDraft,
  type CheckInErrorCode,
} from '../../apps/mobile/src/guidance/current-condition-state';
import { normalizeCurrentCondition } from '../../packages/domain/src/index.ts';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  recordRun: vi.fn(),
  uuidCounter: { value: 0 },
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
    Platform: { OS: 'web' },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));

vi.mock('../../apps/mobile/src/guidance/today-guidance-service', () => ({
  generateTodayGuidance: mocks.generate,
}));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({
  recordRecommendationRun: mocks.recordRun,
}));

vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: vi.fn(),
  transitionProtocolExecution: vi.fn(),
  getActiveProtocolExecution: vi.fn(async () => null),
  getActiveExecutionWithDecision: vi.fn(async () => null),
}));

vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserProduct: vi.fn(async () => null),
}));

const OWNER = 'owner-1';
const NOW = new Date('2026-10-13T12:00:00+02:00');

function checkInDraft(): CheckInDraft {
  return {
    concerns: [],
    goal: 'basic_wash',
    availableMinutes: null,
    // @ts-expect-error RED: the save flag must disappear from the draft shape.
    saveToPassport: false,
    observedAt: null,
    zones: [],
    zoneConcerns: [],
  };
}

function textOf(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => { consoleErrorSpy.mockRestore(); });

beforeEach(() => {
  clearAllCheckInDrafts();
  vi.clearAllMocks();
  mocks.uuidCounter.value = 0;
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: 'request-1' });
});

describe('task 16: no My Hair save promise on the check-in', () => {
  it('renders no save switch on the check-in form', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(TodayCheckIn, {
          draft: checkInDraft(),
          errors: [] as readonly CheckInErrorCode[],
          nowIso: () => '2026-10-13T10:00:00+02:00',
          dispatch: vi.fn(),
        }),
      );
      await Promise.resolve();
    });
    const switches = renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityRole === 'switch',
    );
    expect(switches).toEqual([]);
    expect(textOf(renderer)).not.toContain('save these answers to my hair');
    await act(async () => { renderer.unmount(); });
  });

  it('carries no save flag in the check-in draft state', () => {
    expect('saveToPassport' in initialPreflight(OWNER).checkIn).toBe(false);
  });

  it('states plainly that answers are session-only and change nothing in My Hair', () => {
    expect(CHECK_IN_BOUNDARY.toLowerCase()).toContain('session');
    expect(CHECK_IN_BOUNDARY).not.toContain('unless you choose to save them');
  });

  it('rejects a saveToPassport field at the domain boundary', () => {
    expect(() =>
      normalizeCurrentCondition(
        {
          observedAt: '2026-10-13T11:30:00+02:00',
          concerns: ['dryness'],
          goal: 'basic_wash',
          availableMinutes: 30,
          saveToPassport: true,
        },
        NOW,
      ),
    ).toThrow();
  });

  it('invokes no save path on generate: the generated check-in carries no save flag', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(TodayGuidance, { ownerId: OWNER, onNavigate: vi.fn() }),
      );
      await Promise.resolve();
    });
    const press = async (label: string): Promise<void> => {
      await act(async () => {
        renderer.root.find(
          node => node.type === 'button' && node.props.accessibilityLabel === label,
        ).props.onPress();
        await Promise.resolve();
      });
    };
    await press(CHECK_IN_START_LABEL);
    await press('Dryness');
    await act(async () => {
      renderer.root.find(
        node => node.type === 'input' && node.props.accessibilityLabel === TIME_INPUT_LABEL,
      ).props.onChangeText('20');
      await Promise.resolve();
    });
    await press(CHECK_IN_CONTINUE_LABEL);
    await press('Generate my plan');
    await act(async () => { await Promise.resolve(); });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const request = mocks.generate.mock.calls[0][0] as {
      currentCondition: Record<string, unknown>;
    };
    expect(request.currentCondition).not.toHaveProperty('saveToPassport');
    await act(async () => { renderer.unmount(); });
  });
});

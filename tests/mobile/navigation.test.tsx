import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllCheckInDrafts } from '../../apps/mobile/src/guidance/current-condition-state';
import type { User } from '@supabase/supabase-js';

import {
  DESTINATIONS,
  INITIAL_DESTINATION,
  type DestinationId,
} from '../../apps/mobile/src/navigation';
import { Records } from '../../apps/mobile/src/records';

const navigationMocks = vi.hoisted(() => ({
  loadPassport: vi.fn(),
  loadProfile: vi.fn(),
  loadService: vi.fn(),
  loadServices: vi.fn(),
  generateGuidance: vi.fn(),
  storage: {
    getItem: vi.fn(),
    removeItem: vi.fn(),
    setItem: vi.fn(),
  },
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
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    Platform: { OS: 'web' },
    Image: host('img'),
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'strandcue-recovery',
  secureStorage: navigationMocks.storage,
  supabase: {
    auth: {},
    from: () => ({
      select: () => ({ maybeSingle: navigationMocks.loadProfile }),
    }),
    rpc: vi.fn(),
  },
}));

vi.mock('../../apps/mobile/src/passport-api.ts', () => ({
  loadPassport: navigationMocks.loadPassport,
  savePassport: vi.fn(),
}));

vi.mock('../../apps/mobile/src/services-api.ts', () => ({
  loadService: navigationMocks.loadService,
  loadServices: navigationMocks.loadServices,
}));

vi.mock('../../apps/mobile/src/guidance/today-guidance-service', () => ({
  generateTodayGuidance: navigationMocks.generateGuidance,
}));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({
  recordRecommendationRun: vi.fn(),
}));

// Fix E: the Today journey restores an active execution on mount through this
// aggregate. Resolving null keeps navigation tests on the normal idle
// journey; recovery itself is proven in today-restore.test.tsx.
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: vi.fn(),
  transitionProtocolExecution: vi.fn(),
  getActiveProtocolExecution: vi.fn(async () => null),
  getActiveExecutionWithDecision: vi.fn(async () => null),
}));

vi.mock('../../apps/mobile/src/activities.tsx', () => ({
  Activities: () => createElement('span', null, 'ACTIVITIES SCREEN'),
}));

vi.mock('../../apps/mobile/src/shelf.tsx', () => ({
  Shelf: () => createElement('span', null, 'SHELF SCREEN'),
}));

vi.mock('../../apps/mobile/src/tools.tsx', () => ({
  Tools: () => createElement('span', null, 'TOOLS SCREEN'),
}));

vi.mock('../../apps/mobile/src/screens/ExportScreen.tsx', () => ({
  ExportScreen: () => createElement('span', null, 'EXPORT SCREEN'),
}));

vi.mock('../../apps/mobile/src/screens/DeletionScreen.tsx', () => ({
  DeletionScreen: () => createElement('span', null, 'DELETION SCREEN'),
}));

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function press(renderer: ReactTestRenderer, accessibilityLabel: string): void {
  const button = renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === accessibilityLabel,
  );
  button.props.onPress();
}

const owner = '20000000-0000-4000-8000-000000000001';
const confirmedUser = {
  id: owner,
  email_confirmed_at: '2026-09-01T00:00:00.000Z',
} as User;

async function renderRecords(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Records, { user: confirmedUser }));
    await Promise.resolve();
  });
  return renderer;
}

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...details: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...details);
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  clearAllCheckInDrafts();
  vi.clearAllMocks();
  navigationMocks.storage.getItem.mockResolvedValue(null);
  navigationMocks.storage.removeItem.mockResolvedValue(undefined);
  navigationMocks.storage.setItem.mockResolvedValue(undefined);
  navigationMocks.loadProfile.mockResolvedValue({
    data: { username: 'fixture-owner' },
    error: null,
  });
  navigationMocks.loadPassport.mockResolvedValue(null);
});

describe('product destinations', () => {
  it('exposes the approved destinations in order with Today first', () => {
    expect(DESTINATIONS.map(entry => entry.id)).toEqual([
      'today',
      'my_hair',
      'my_shelf',
      'my_tools',
      'journey',
      'settings',
    ]);
    expect(INITIAL_DESTINATION).toBe('today');
  });

  it('uses unique ids, labels, and accessibility labels', () => {
    const ids = DESTINATIONS.map(entry => entry.id);
    const labels = DESTINATIONS.map(entry => entry.label);
    const accessibilityLabels = DESTINATIONS.map(entry => entry.accessibilityLabel);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(accessibilityLabels).size).toBe(accessibilityLabels.length);
  });

  it('keeps Today honest: no score, purchase, or medical claim before generation', async () => {
    const renderer = await renderRecords();
    const text = renderedText(renderer).toLowerCase();
    // Today now prepares reviewed guidance, so it no longer claims guidance is
    // unavailable. What must stay true: nothing is generated on mount, and no
    // score, purchase or diagnostic language appears.
    expect(text).not.toContain('score');
    expect(text).not.toContain('buy');
    // The app keeps its cosmetic boundary wording; Today must not make a
    // medical claim, promise an outcome, or offer treatment.
    expect(text).toContain('not a diagnosis');
    expect(text).not.toContain('diagnose your');
    expect(text).not.toContain('treatment');
    expect(text).not.toContain('cure');
    expect(text).not.toContain('guarantee');
    expect(text).not.toContain('step 1');
    expect(navigationMocks.generateGuidance).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('opens on Today and keeps existing screens reachable', async () => {
    const renderer = await renderRecords();
    // Today opens on the preflight check-in entry: nothing generates until
    // the owner completes a check-in and asks for a plan.
    expect(renderedText(renderer)).toContain('Start check-in');

    await act(async () => { press(renderer, 'My Hair: passport and services'); });
    expect(renderedText(renderer)).toContain('Your Hair Passport');

    await act(async () => { press(renderer, 'Services'); });
    expect(renderedText(renderer)).toContain('Your chemical services');

    await act(async () => { press(renderer, 'Journey: activities and history'); });
    await act(async () => { press(renderer, 'History'); });
    expect(renderedText(renderer)).toContain('Every change has a story.');

    await act(async () => { press(renderer, 'Settings: account and privacy'); });
    expect(renderedText(renderer)).toContain('Your account, your say.');

    await act(async () => { renderer.unmount(); });
  });

  it('keeps passport data entry reachable from My Hair', async () => {
    const renderer = await renderRecords();
    await act(async () => { press(renderer, 'My Hair: passport and services'); });
    await act(async () => { press(renderer, 'Create my Hair Passport'); });
    expect(renderedText(renderer)).toContain('Save to my record');
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the recovered shelf, tools, and activities screens reachable', async () => {
    const renderer = await renderRecords();
    await act(async () => { press(renderer, 'My Shelf: owned products'); });
    let text = renderedText(renderer);
    expect(text).toContain('SHELF SCREEN');

    await act(async () => { press(renderer, 'My Tools: owned tools'); });
    text = renderedText(renderer);
    expect(text).toContain('TOOLS SCREEN');

    await act(async () => { press(renderer, 'Journey: activities and history'); });
    await act(async () => { press(renderer, 'Activities'); });
    text = renderedText(renderer);
    expect(text).toContain('ACTIVITIES SCREEN');
    await act(async () => { renderer.unmount(); });
  });

  it('uses destination ids from the shared contract', () => {
    const ids: readonly DestinationId[] = DESTINATIONS.map(entry => entry.id);
    expect(ids).toContain('today');
    expect(ids).toContain('settings');
  });
});

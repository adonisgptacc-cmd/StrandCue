import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

import { Records } from '../../apps/mobile/src/records';

const mocks = vi.hoisted(() => ({
  loadProfile: vi.fn(),
  journeyProps: [] as Record<string, unknown>[],
  today: { onCueCheck: undefined as undefined | ((execution: unknown) => void) },
}));

vi.mock('react-native', async () => {
  const { rnMock } = await import('./support/rn-mock');
  return { ...rnMock, AppState: { addEventListener: () => ({ remove: () => undefined }) } };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => '30000000-0000-4000-8000-000000000001' }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'strandcue-recovery',
  secureStorage: { getItem: vi.fn(), removeItem: vi.fn(), setItem: vi.fn() },
  supabase: { auth: {}, from: () => ({ select: () => ({ maybeSingle: mocks.loadProfile }) }), rpc: vi.fn() },
}));
vi.mock('../../apps/mobile/src/passport-api.ts', () => ({ loadPassport: vi.fn(async () => null), savePassport: vi.fn() }));
vi.mock('../../apps/mobile/src/TodayGuidance.tsx', () => ({
  TodayGuidance: (props: { onCueCheck?: (execution: unknown) => void }) => {
    mocks.today.onCueCheck = props.onCueCheck;
    return createElement('span', null, 'TODAY SCREEN');
  },
}));
vi.mock('../../apps/mobile/src/CueCheckJourney.tsx', () => ({
  CueCheckJourney: (props: Record<string, unknown>) => {
    mocks.journeyProps.push(props);
    return createElement('span', null, `CHECK-INS SCREEN for ${String(props.owner)}`);
  },
}));
vi.mock('../../apps/mobile/src/shelf.tsx', () => ({ Shelf: () => createElement('span', null, 'SHELF SCREEN') }));
vi.mock('../../apps/mobile/src/tools.tsx', () => ({ Tools: () => createElement('span', null, 'TOOLS SCREEN') }));
vi.mock('../../apps/mobile/src/screens/ExportScreen.tsx', () => ({ ExportScreen: () => createElement('span', null, 'EXPORT SCREEN') }));
vi.mock('../../apps/mobile/src/screens/DeletionScreen.tsx', () => ({ DeletionScreen: () => createElement('span', null, 'DELETION SCREEN') }));
vi.mock('../../apps/mobile/src/activities.tsx', () => ({ Activities: () => createElement('span', null, 'ACTIVITIES SCREEN') }));

const owner = '20000000-0000-4000-8000-000000000001';
const user = { id: owner, email_confirmed_at: '2026-09-01T00:00:00.000Z' } as User;

const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  mocks.journeyProps.length = 0;
  mocks.loadProfile.mockResolvedValue({ data: { username: 'fixture-owner' }, error: null });
});

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Records, { user }));
    await Promise.resolve();
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
async function press(renderer: ReactTestRenderer, label: string) {
  await act(async () => {
    renderer.root.find(node => node.type === 'button' && node.props.accessibilityLabel === label).props.onPress();
    await Promise.resolve();
  });
}

describe('Cue Checks inside the Journey destination', () => {
  it('offers a Check-ins view beside History and Activities, titled in plain words', async () => {
    const renderer = await render();
    await press(renderer, 'Journey: activities and history');
    expect(text(renderer)).not.toContain('CHECK-INS SCREEN');
    await press(renderer, 'Check-ins');
    expect(text(renderer)).toContain(`CHECK-INS SCREEN for ${owner}`);
    expect(text(renderer)).toContain('How your hair felt');
    expect(mocks.journeyProps.at(-1)).toMatchObject({ owner, intent: null });
    await press(renderer, 'History');
    expect(text(renderer)).not.toContain('CHECK-INS SCREEN');
  });

  it('opens Check-ins on the routine when Today hands over a finished routine, then clears the request', async () => {
    const renderer = await render();
    expect(mocks.today.onCueCheck).toBeTypeOf('function');
    await act(async () => mocks.today.onCueCheck!({ executionId: 'exec-1', status: 'completed' }));
    expect(text(renderer)).toContain('CHECK-INS SCREEN');
    const props = mocks.journeyProps.at(-1)!;
    expect(props.intent).toEqual({ executionId: 'exec-1', status: 'completed' });
    await act(async () => (props.onIntentHandled as () => void)());
    expect(mocks.journeyProps.at(-1)!.intent).toBeNull();
  });
});

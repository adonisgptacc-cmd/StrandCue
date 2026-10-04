import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

import { AuthScreen, serviceDraftCleanupNotice } from '../../apps/mobile/src/auth';
import { PassportEditor } from '../../apps/mobile/src/passport-editor';
import { Records } from '../../apps/mobile/src/records';
import { Services } from '../../apps/mobile/src/services';
import type { ServiceCursor, ServiceList, ServiceSummary } from '../../apps/mobile/src/services-api';

const componentMocks = vi.hoisted(() => ({
  loadPassport: vi.fn(),
  loadProfile: vi.fn(),
  loadService: vi.fn(),
  loadServices: vi.fn(),
  randomUUID: vi.fn(() => '30000000-0000-4000-8000-000000000001'),
  resetPasswordForEmail: vi.fn(),
  rpc: vi.fn(),
  savePassport: vi.fn(),
  signUp: vi.fn(),
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
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

vi.mock('expo-linking', () => ({
  addEventListener: () => ({ remove: () => undefined }),
  getInitialURL: async () => null,
}));

vi.mock('expo-crypto', () => ({ randomUUID: componentMocks.randomUUID }));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'strandcue-recovery',
  secureStorage: componentMocks.storage,
  supabase: {
    auth: {
      resetPasswordForEmail: componentMocks.resetPasswordForEmail,
      signUp: componentMocks.signUp,
    },
    from: () => ({
      select: () => ({ maybeSingle: componentMocks.loadProfile }),
    }),
    rpc: componentMocks.rpc,
  },
}));

vi.mock('../../apps/mobile/src/passport-api.ts', () => ({
  loadPassport: componentMocks.loadPassport,
  savePassport: componentMocks.savePassport,
}));

vi.mock('../../apps/mobile/src/services-api.ts', () => ({
  loadService: componentMocks.loadService,
  loadServices: componentMocks.loadServices,
}));

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function press(renderer: ReactTestRenderer, accessibilityLabel: string): void {
  const button = renderer.root.find(node =>
    node.type === 'button' && node.props.accessibilityLabel === accessibilityLabel,
  );
  button.props.onPress();
}

function serviceSummary(serviceId: string, serviceType: 'keratin' | 'nanoplasty'): ServiceSummary {
  return {
    serviceId,
    revision: 1,
    revisionId: serviceId,
    facts: {
      serviceType,
      occurredOn: { precision: 'month', value: '2026-02' },
      zones: [{ region: 'front', segment: 'roots' }],
    },
    currentObservation: null,
    currentPresence: 'unknown',
  };
}

const ownerA = '20000000-0000-4000-8000-000000000001';
const ownerB = '20000000-0000-4000-8000-000000000002';
const serviceA = '10000000-0000-4000-8000-000000000001';
const serviceB = '10000000-0000-4000-8000-000000000002';
const nextCursor: ServiceCursor = {
  asOf: '2026-09-01',
  effectiveStart: '2026-02-01',
  recordedAt: '2026-02-01T10:00:00.000000Z',
  serviceId: serviceA,
};

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
  vi.clearAllMocks();
  componentMocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  componentMocks.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
  componentMocks.storage.getItem.mockResolvedValue(null);
  componentMocks.storage.removeItem.mockResolvedValue(undefined);
  componentMocks.storage.setItem.mockResolvedValue(undefined);
  componentMocks.loadProfile.mockResolvedValue({
    data: { username: 'fixture-owner' },
    error: null,
  });
  componentMocks.loadPassport.mockResolvedValue(null);
  componentMocks.rpc.mockResolvedValue({ data: { available: true, suggestions: [], rateLimited: false }, error: null });
});

describe('mobile component state contracts', () => {
  it('renders the complete seven-section navigation for a signed-in profile', async () => {
    const user = { id: ownerA, email_confirmed_at: '2026-09-01T00:00:00.000Z' } as User;
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Records, { user })); await Promise.resolve(); });
    const labels = renderer.root.findAll(node => node.type === 'button').map(node => node.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining(['Passport', 'Services', 'Activities', 'Shelf', 'Tools', 'History', 'Settings']));
    await act(async () => { renderer.unmount(); });
  });

  it('routes signup confirmation back into the StrandCue app', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(AuthScreen, { notice: '' })); });
    const input = (label: string) => renderer.root.find(node =>
      node.type === 'input' && node.props.accessibilityLabel === label,
    );

    await act(async () => {
      input('Email').props.onChangeText('new.user@example.com');
      input('Password').props.onChangeText('a-secure-password');
      press(renderer, 'Confirm: I am 18 or older');
    });
    await act(async () => {
      press(renderer, 'Create account');
      await Promise.resolve();
    });

    expect(componentMocks.signUp).toHaveBeenCalledWith({
      email: 'new.user@example.com',
      password: 'a-secure-password',
      options: { emailRedirectTo: 'strandcue://auth/callback' },
    });
    await act(async () => { renderer.unmount(); });
  });

  it('routes recovery email confirmation back into the StrandCue app', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(AuthScreen, { notice: '' })); });
    const input = (label: string) => renderer.root.find(node =>
      node.type === 'input' && node.props.accessibilityLabel === label,
    );

    await act(async () => { press(renderer, 'Already have an account? Sign in'); });
    await act(async () => { press(renderer, 'Forgot password?'); });
    await act(async () => { input('Email').props.onChangeText('recover.user@example.com'); });
    await act(async () => {
      press(renderer, 'Send recovery link');
      await Promise.resolve();
    });

    expect(componentMocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'recover.user@example.com',
      { redirectTo: 'strandcue://auth/callback' },
    );
    expect(componentMocks.storage.setItem).toHaveBeenCalledWith('strandcue-recovery', expect.any(String));
    await act(async () => { renderer.unmount(); });
  });

  it('shows the same renewed external cleanup warning after it was locally dismissed', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(AuthScreen, { notice: '' })); });

    await act(async () => { renderer.update(createElement(AuthScreen, { notice: serviceDraftCleanupNotice })); });
    expect(renderedText(renderer)).toContain(serviceDraftCleanupNotice);

    await act(async () => { press(renderer, 'Already have an account? Sign in'); });
    expect(renderedText(renderer)).not.toContain(serviceDraftCleanupNotice);

    await act(async () => { renderer.update(createElement(AuthScreen, { notice: '' })); });
    await act(async () => { renderer.update(createElement(AuthScreen, { notice: serviceDraftCleanupNotice })); });

    expect(renderedText(renderer)).toContain(serviceDraftCleanupNotice);
    await act(async () => { renderer.unmount(); });
  });

  it('shows a renewed Records warning after retry dismissal and an empty notice transition', async () => {
    const user = {
      id: ownerA,
      email_confirmed_at: '2026-09-01T00:00:00.000Z',
    } as User;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Records, { user, notice: serviceDraftCleanupNotice }));
      await Promise.resolve();
    });
    expect(renderedText(renderer)).toContain(serviceDraftCleanupNotice);

    await act(async () => {
      press(renderer, 'Retry loading');
      await Promise.resolve();
    });
    expect(renderedText(renderer)).not.toContain(serviceDraftCleanupNotice);

    await act(async () => {
      renderer.update(createElement(Records, { user, notice: '' }));
    });
    await act(async () => {
      renderer.update(createElement(Records, { user, notice: serviceDraftCleanupNotice }));
    });

    expect(renderedText(renderer)).toContain(serviceDraftCleanupNotice);
    await act(async () => { renderer.unmount(); });
  });

  it('ignores a stale service result after the owner-keyed child remounts', async () => {
    const firstOwnerLoad = deferred<ServiceList>();
    const secondOwnerLoad = deferred<ServiceList>();
    componentMocks.loadServices
      .mockReturnValueOnce(firstOwnerLoad.promise)
      .mockReturnValueOnce(secondOwnerLoad.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Services, { owner: ownerA })); });
    await act(async () => { renderer.update(createElement(Services, { owner: ownerB })); });

    await act(async () => {
      secondOwnerLoad.resolve({ items: [serviceSummary(serviceB, 'keratin')], nextCursor: null });
      await secondOwnerLoad.promise;
    });
    expect(renderedText(renderer)).toContain('keratin');

    await act(async () => {
      firstOwnerLoad.resolve({ items: [serviceSummary(serviceA, 'nanoplasty')], nextCursor: null });
      await firstOwnerLoad.promise;
    });
    expect(renderedText(renderer)).toContain('keratin');
    expect(renderedText(renderer)).not.toContain('nanoplasty');
    await act(async () => { renderer.unmount(); });
  });

  it('dispatches only one Passport save when the submit control fires twice rapidly', async () => {
    const save = deferred<void>();
    componentMocks.savePassport.mockReturnValue(save.promise);
    const onSaved = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(PassportEditor, {
        owner: ownerA,
        record: null,
        onSaved,
        onCancel: vi.fn(),
      }));
    });

    await act(async () => {
      press(renderer, 'Save to my record');
      press(renderer, 'Save to my record');
      await Promise.resolve();
    });

    expect(componentMocks.savePassport).toHaveBeenCalledTimes(1);
    expect(componentMocks.randomUUID).toHaveBeenCalledTimes(1);
    save.resolve();
    await act(async () => { await save.promise; });
    expect(onSaved).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the initial service page before a later appended page', async () => {
    const initialLoad = deferred<ServiceList>();
    const appendLoad = deferred<ServiceList>();
    componentMocks.loadServices
      .mockReturnValueOnce(initialLoad.promise)
      .mockReturnValueOnce(appendLoad.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Services, { owner: ownerA })); });

    await act(async () => {
      initialLoad.resolve({ items: [serviceSummary(serviceA, 'nanoplasty')], nextCursor });
      await initialLoad.promise;
    });
    await act(async () => {
      press(renderer, 'Load more services');
      await Promise.resolve();
    });
    await act(async () => {
      appendLoad.resolve({ items: [serviceSummary(serviceB, 'keratin')], nextCursor: null });
      await appendLoad.promise;
    });

    const text = renderedText(renderer);
    expect(text.indexOf('nanoplasty')).toBeLessThan(text.indexOf('keratin'));
    expect(componentMocks.loadServices).toHaveBeenNthCalledWith(2, expect.any(String), { cursor: nextCursor });
    await act(async () => { renderer.unmount(); });
  });

  it('debounces username availability and offers neutral plus personalized checked suggestions', async () => {
    vi.useFakeTimers();
    componentMocks.loadProfile.mockResolvedValue({ data: null, error: null });
    componentMocks.rpc.mockResolvedValue({
      data: { available: false, suggestions: ['mark_za_curls', 'mark_2', 'mark_3'], rateLimited: false }, error: null,
    });
    const user = { id: ownerA, email_confirmed_at: '2026-09-01T00:00:00.000Z' } as User;
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Records, { user })); await Promise.resolve(); });
    const input = (label: string) => renderer.root.find(node => node.type === 'input' && node.props.accessibilityLabel === label);
    await act(async () => {
      input('Username').props.onChangeText('Mark');
      input('Optional personal suffix').props.onChangeText('ZA curls!');
    });
    expect(componentMocks.rpc).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(componentMocks.rpc).toHaveBeenCalledTimes(1);
    expect(componentMocks.rpc).toHaveBeenCalledWith('username_options', { p_username: 'mark', p_suffix: 'za_curls' });
    expect(renderedText(renderer)).toContain('is already taken.');
    expect(renderedText(renderer)).toContain('Use @mark_za_curls');
    await act(async () => { renderer.unmount(); });
    vi.useRealTimers();
  });

  it('reports a throttled username check accurately instead of claiming availability or a collision', async () => {
    vi.useFakeTimers();
    componentMocks.loadProfile.mockResolvedValue({ data: null, error: null });
    componentMocks.rpc.mockResolvedValue({ data: { available: true, suggestions: [], rateLimited: true }, error: null });
    const user = { id: ownerA, email_confirmed_at: '2026-09-01T00:00:00.000Z' } as User;
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Records, { user })); await Promise.resolve(); });
    const input = renderer.root.find(node => node.type === 'input' && node.props.accessibilityLabel === 'Username');
    await act(async () => { input.props.onChangeText('mark'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const text = renderedText(renderer);
    expect(text).toContain('Too many username checks');
    expect(text).not.toContain('is available.');
    expect(text).not.toContain('is already taken.');
    await act(async () => { renderer.unmount(); });
    vi.useRealTimers();
  });
});

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
  savePassport: vi.fn(),
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
    from: () => ({
      select: () => ({ maybeSingle: componentMocks.loadProfile }),
    }),
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
  componentMocks.storage.getItem.mockResolvedValue(null);
  componentMocks.storage.removeItem.mockResolvedValue(undefined);
  componentMocks.storage.setItem.mockResolvedValue(undefined);
  componentMocks.loadProfile.mockResolvedValue({
    data: { username: 'fixture-owner' },
    error: null,
  });
  componentMocks.loadPassport.mockResolvedValue(null);
});

describe('mobile component state contracts', () => {
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
});

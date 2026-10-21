import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '../../apps/mobile/app/index';

const switchMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
  transitionOwner: vi.fn(),
  renderedOwners: [] as string[],
}));

let authCallback: ((event: string) => void) | undefined;

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

vi.mock('expo-linking', () => ({
  getInitialURL: async () => null,
  addEventListener: () => ({ remove: () => undefined }),
}));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'recovery',
  RECOVERY_ACTIVE_KEY: 'recovery-active',
  secureStorage: {
    getItem: switchMocks.storageGet,
    setItem: switchMocks.storageSet,
    removeItem: switchMocks.storageRemove,
  },
  supabase: {
    auth: {
      getUser: switchMocks.getUser,
      signOut: switchMocks.signOut,
      exchangeCodeForSession: vi.fn(),
      onAuthStateChange: (callback: (event: string) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
    },
  },
}));

vi.mock('../../apps/mobile/src/service-form.ts', () => ({
  transitionServiceDraftOwner: switchMocks.transitionOwner,
}));

vi.mock('../../apps/mobile/src/records.tsx', () => ({
  Records: ({ user }: { user: { id: string } }) => {
    switchMocks.renderedOwners.push(user.id);
    return createElement('records-mock', { userId: user.id });
  },
}));

const ownerA = '11111111-1111-1111-1111-111111111111';
const ownerB = '22222222-2222-2222-2222-222222222222';

const tick = async (ms = 5) => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

function recordsNodes(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(node => (node.type as unknown as string) === 'records-mock')
    .map(node => node.props.userId as string);
}

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  vi.clearAllMocks();
  authCallback = undefined;
  switchMocks.renderedOwners.length = 0;
  switchMocks.storageGet.mockResolvedValue(null);
  switchMocks.storageSet.mockResolvedValue(undefined);
  switchMocks.storageRemove.mockResolvedValue(undefined);
  switchMocks.transitionOwner.mockResolvedValue(undefined);
  switchMocks.signOut.mockResolvedValue({ error: null });
});

describe('owner switching never paints prior-owner data', () => {
  it('renders clean state first frame across sign-out and sign-in as another owner', async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(done => {
        resolve = done;
      });
      return { promise, resolve };
    }

    const initial = deferred<{ data: { user: unknown }; error: null }>();
    switchMocks.getUser.mockReturnValueOnce(initial.promise);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Home));
      await tick();
    });
    expect(recordsNodes(renderer)).toEqual([]);
    expect(renderedText(renderer)).toContain('Opening StrandCue');

    await act(async () => {
      initial.resolve({ data: { user: { id: ownerA } }, error: null });
      await initial.promise;
      await tick();
    });
    expect(recordsNodes(renderer)).toEqual([ownerA]);

    await act(async () => {
      authCallback?.('SIGNED_OUT');
      await tick(10);
    });
    expect(recordsNodes(renderer)).toEqual([]);
    expect(renderedText(renderer)).toContain('Begin your hair record');
    expect(renderedText(renderer)).not.toContain(ownerA);
    const ownersAfterSignOut = [...switchMocks.renderedOwners];

    const next = deferred<{ data: { user: unknown }; error: null }>();
    switchMocks.getUser.mockReturnValueOnce(next.promise);
    await act(async () => {
      authCallback?.('SIGNED_IN');
      await tick(10);
    });
    // First frame with the new owner pending: loading state, no owner data —
    // neither the prior owner's record nor the incoming one.
    expect(recordsNodes(renderer)).toEqual([]);
    expect(renderedText(renderer)).toContain('Opening StrandCue');
    expect(renderedText(renderer)).not.toContain(ownerA);

    await act(async () => {
      next.resolve({ data: { user: { id: ownerB } }, error: null });
      await next.promise;
      await tick();
    });
    expect(recordsNodes(renderer)).toEqual([ownerB]);

    const ownersAfterSwitch = switchMocks.renderedOwners.slice(ownersAfterSignOut.length);
    expect(ownersAfterSwitch).toEqual([ownerB]);
    await act(async () => {
      renderer.unmount();
    });
  });
});

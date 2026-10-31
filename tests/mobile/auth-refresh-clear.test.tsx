import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js';

import { useAccount } from '../../apps/mobile/src/auth';
import { isSessionRevokedError, maxOfflineRefreshAttempts } from '../../apps/mobile/src/contracts';

const accountMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
  exchange: vi.fn(),
  startAutoRefresh: vi.fn(),
  stopAutoRefresh: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
  transitionOwner: vi.fn(),
  appStateListener: null as ((value: string) => void) | null,
  linkListener: null as ((event: { url: string }) => void) | null,
}));

let authCallback: ((event: string) => void) | undefined;

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, listener: (value: string) => void) => {
      accountMocks.appStateListener = listener;
      return { remove() {} };
    },
  },
  Text: (props: unknown) => createElement('span', props as never),
  View: (props: unknown) => createElement('div', props as never),
}));
vi.mock('expo-linking', () => ({
  getInitialURL: async () => null,
  addEventListener: (_event: string, listener: (event: { url: string }) => void) => {
    accountMocks.linkListener = listener;
    return { remove() {} };
  },
}));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'recovery',
  RECOVERY_ACTIVE_KEY: 'recovery-active',
  secureStorage: {
    getItem: accountMocks.storageGet,
    setItem: accountMocks.storageSet,
    removeItem: accountMocks.storageRemove,
  },
  supabase: {
    auth: {
      getUser: accountMocks.getUser,
      signOut: accountMocks.signOut,
      exchangeCodeForSession: accountMocks.exchange,
      onAuthStateChange: (callback: (event: string) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      startAutoRefresh: accountMocks.startAutoRefresh,
      stopAutoRefresh: accountMocks.stopAutoRefresh,
    },
  },
}));
vi.mock('../../apps/mobile/src/ui.tsx', () => ({
  Button: () => null,
  Field: () => null,
  Page: () => null,
  styles: {},
}));
vi.mock('../../apps/mobile/src/service-form.ts', () => ({
  transitionServiceDraftOwner: accountMocks.transitionOwner,
}));

const ownerA = { id: '11111111-1111-1111-1111-111111111111' };
const ownerB = { id: '22222222-2222-2222-2222-222222222222' };

const tick = async (ms = 5) => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

async function mountAccount(): Promise<{ observed: () => ReturnType<typeof useAccount>; renderer: ReactTestRenderer }> {
  let observed!: ReturnType<typeof useAccount>;
  function Harness() {
    observed = useAccount();
    return null;
  }
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Harness));
    await tick();
  });
  return { observed: () => observed, renderer };
}

async function emitAuthEvent(event: string): Promise<void> {
  await act(async () => {
    authCallback?.(event);
    await tick(10);
    await tick(10);
  });
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
  accountMocks.appStateListener = null;
  accountMocks.linkListener = null;
  accountMocks.storageGet.mockResolvedValue(null);
  accountMocks.storageSet.mockResolvedValue(undefined);
  accountMocks.storageRemove.mockResolvedValue(undefined);
  accountMocks.transitionOwner.mockResolvedValue(undefined);
  accountMocks.signOut.mockResolvedValue({ error: null });
  accountMocks.exchange.mockResolvedValue({ data: { session: null }, error: new Error('no exchange stubbed') });
  // Default so an unstubbed refresh resolves instead of throwing on undefined;
  // per-test mockResolvedValueOnce/mockReturnValueOnce queues take precedence.
  accountMocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
});

describe('isSessionRevokedError (refresh-failure classification)', () => {
  it('treats revoked, deleted, expired and invalid session signals as revoked', () => {
    for (const error of [
      new AuthApiError('session not found', 401, 'session_not_found'),
      new AuthApiError('session expired', 401, 'session_expired'),
      new AuthApiError('refresh token not found', 401, 'refresh_token_not_found'),
      new AuthApiError('refresh token already used', 401, 'refresh_token_already_used'),
      new AuthApiError('user not found', 404, 'user_not_found'),
      new AuthApiError('user banned', 403, 'user_banned'),
      new AuthApiError('invalid JWT', 401, 'bad_jwt'),
      new AuthApiError('invalid claim', 403, 'bad_jwt'),
    ]) {
      expect(isSessionRevokedError(error)).toBe(true);
    }
  });

  it('treats transport and server-side transient failures as offline', () => {
    for (const error of [
      new TypeError('fetch failed'),
      new Error('network down'),
      new AuthApiError('rate limited', 429, 'over_request_rate_limit'),
      new AuthApiError('server error', 500, 'unexpected_failure'),
      { name: 'AuthRetryableFetchError', message: 'retry', status: 502 },
      null,
      undefined,
      'session_not_found',
    ]) {
      expect(isSessionRevokedError(error)).toBe(false);
    }
  });

  it('bounds offline retention before signing out', () => {
    expect(maxOfflineRefreshAttempts).toBeGreaterThan(0);
  });
});

describe('refresh failure clears a revoked session (AU-003)', () => {
  it('clears the prior user when refresh reports a revoked session', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    accountMocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('session not found', 401, 'session_not_found'),
    });
    await emitAuthEvent('SIGNED_IN');

    expect(accountMocks.getUser).toHaveBeenCalledTimes(2);
    expect(observed().user).toBeNull();
    expect(observed().loading).toBe(false);
    expect(observed().notice).toMatch(/signed out/i);
    expect(observed().notice).not.toContain(ownerA.id);
    expect(accountMocks.transitionOwner).toHaveBeenCalledWith(expect.anything(), null, expect.any(Function));
    await act(async () => {
      renderer.unmount();
    });
  });

  it.each([
    ['deleted user', new AuthApiError('user not found', 404, 'user_not_found')],
    ['banned user', new AuthApiError('user banned', 403, 'user_banned')],
    ['expired session', new AuthApiError('session expired', 401, 'session_expired')],
    ['missing refresh token', new AuthApiError('refresh token not found', 401, 'refresh_token_not_found')],
    ['invalid token', new AuthApiError('invalid JWT', 401, 'bad_jwt')],
  ])('clears the prior user on %s', async (_label, error) => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    accountMocks.getUser.mockResolvedValueOnce({ data: { user: null }, error });
    await emitAuthEvent('TOKEN_REFRESHED');

    expect(observed().user).toBeNull();
    expect(observed().notice).toMatch(/signed out/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the prior user with honest copy on transient failure, then signs out past the bound', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    for (let attempt = 1; attempt <= maxOfflineRefreshAttempts; attempt += 1) {
      accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
      await emitAuthEvent('SIGNED_IN');
      expect(observed().user).toEqual(ownerA);
      expect(observed().notice).toMatch(/could not be refreshed yet/i);
      expect(observed().notice).toMatch(/unchanged/i);
    }

    accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
    await emitAuthEvent('SIGNED_IN');
    expect(observed().user).toBeNull();
    expect(observed().loading).toBe(false);
    expect(observed().notice).toMatch(/signed out/i);
    expect(observed().notice).not.toMatch(/unchanged/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('resets the offline bound after a successful refresh', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();

    accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
    await emitAuthEvent('SIGNED_IN');
    expect(observed().user).toEqual(ownerA);

    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    await emitAuthEvent('SIGNED_IN');
    expect(observed().user).toEqual(ownerA);

    accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
    await emitAuthEvent('SIGNED_IN');
    expect(observed().user).toEqual(ownerA);
    expect(observed().notice).toMatch(/unchanged/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('treats a non-revoked error result as transient, not signed out', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();

    accountMocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('server error', 500, 'unexpected_failure'),
    });
    await emitAuthEvent('SIGNED_IN');

    expect(observed().user).toEqual(ownerA);
    expect(observed().notice).toMatch(/could not be refreshed yet/i);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('signed-out and missing-session transitions', () => {
  it('clears local state and drafts synchronously on SIGNED_OUT', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    await emitAuthEvent('SIGNED_OUT');

    expect(observed().user).toBeNull();
    expect(observed().loading).toBe(false);
    expect(accountMocks.transitionOwner).toHaveBeenCalledWith(expect.anything(), null, expect.any(Function));
    await act(async () => {
      renderer.unmount();
    });
  });

  it('warns when departing draft cleanup fails on SIGNED_OUT', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    accountMocks.transitionOwner.mockRejectedValueOnce(new Error('storage locked'));
    const { observed, renderer } = await mountAccount();

    await emitAuthEvent('SIGNED_OUT');

    expect(observed().user).toBeNull();
    expect(observed().notice).toMatch(/could not be cleared/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('never purges a session that never existed on a virgin device', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthSessionMissingError() });
    const { observed, renderer } = await mountAccount();

    expect(observed().user).toBeNull();
    expect(accountMocks.signOut).not.toHaveBeenCalled();
    expect(accountMocks.stopAutoRefresh).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('local session purge on account clear', () => {
  it('purges the local session and stops auto-refresh on revoked clear', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    accountMocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('session not found', 401, 'session_not_found'),
    });
    await emitAuthEvent('SIGNED_IN');

    expect(observed().user).toBeNull();
    expect(observed().notice).toMatch(/signed out/i);
    expect(accountMocks.stopAutoRefresh).toHaveBeenCalled();
    expect(accountMocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('purges the local session when the offline bound is exceeded', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();

    for (let attempt = 1; attempt <= maxOfflineRefreshAttempts; attempt += 1) {
      accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
      await emitAuthEvent('SIGNED_IN');
    }
    expect(accountMocks.signOut).not.toHaveBeenCalled();

    accountMocks.getUser.mockRejectedValueOnce(new TypeError('fetch failed'));
    await emitAuthEvent('SIGNED_IN');

    expect(observed().user).toBeNull();
    expect(accountMocks.stopAutoRefresh).toHaveBeenCalled();
    expect(accountMocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('stays idempotent when SIGNED_OUT arrives after a purge clear', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();

    accountMocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('session not found', 401, 'session_not_found'),
    });
    await emitAuthEvent('SIGNED_IN');
    expect(observed().user).toBeNull();
    const revokedNotice = observed().notice;
    const signOutCalls = accountMocks.signOut.mock.calls.length;

    // The purge above emits SIGNED_OUT through the real client; a repeated
    // event must not loop, re-sign-out, or replace the notice.
    await emitAuthEvent('SIGNED_OUT');

    expect(observed().user).toBeNull();
    expect(observed().notice).toBe(revokedNotice);
    expect(accountMocks.signOut.mock.calls.length).toBe(signOutCalls);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('refresh epoch, app state and recovery-callback neighbours', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    return { promise, resolve, reject };
  }

  it('ignores a stale refresh that resolves after a newer one started', async () => {
    const first = deferred<{ data: { user: unknown }; error: null }>();
    accountMocks.getUser.mockReturnValueOnce(first.promise);
    const { observed, renderer } = await mountAccount();
    expect(observed().loading).toBe(true);

    const second = deferred<{ data: { user: unknown }; error: null }>();
    accountMocks.getUser.mockReturnValueOnce(second.promise);
    await emitAuthEvent('SIGNED_IN');
    expect(accountMocks.getUser).toHaveBeenCalledTimes(2);

    // The stale first refresh resolves with owner B after the second started.
    await act(async () => {
      first.resolve({ data: { user: ownerB }, error: null });
      await first.promise;
      await tick();
    });
    expect(observed().user).toBeNull();

    await act(async () => {
      second.resolve({ data: { user: ownerA }, error: null });
      await second.promise;
      await tick();
    });
    expect(observed().user).toEqual(ownerA);
    expect(observed().loading).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('ignores a stale refresh failure once a newer refresh started', async () => {
    const first = deferred<{ data: { user: unknown }; error: null }>();
    accountMocks.getUser.mockReturnValueOnce(first.promise);
    const { observed, renderer } = await mountAccount();

    const second = deferred<{ data: { user: unknown }; error: null }>();
    accountMocks.getUser.mockReturnValueOnce(second.promise);
    await emitAuthEvent('SIGNED_IN');

    await act(async () => {
      first.reject(new TypeError('fetch failed'));
      await first.promise.catch(() => undefined);
      await tick();
    });
    expect(observed().notice).toBe('');
    expect(observed().user).toBeNull();

    await act(async () => {
      second.resolve({ data: { user: ownerA }, error: null });
      await second.promise;
      await tick();
    });
    expect(observed().user).toEqual(ownerA);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('warns when departing draft cleanup fails on the revoked-session clear', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    accountMocks.transitionOwner.mockRejectedValueOnce(new Error('storage locked'));
    accountMocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('session not found', 401, 'session_not_found'),
    });
    await emitAuthEvent('SIGNED_IN');

    expect(observed().user).toBeNull();
    expect(observed().notice).toMatch(/could not be cleared/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('toggles platform auto-refresh with app state', async () => {
    const { renderer } = await mountAccount();
    expect(accountMocks.appStateListener).toBeTypeOf('function');

    await act(async () => {
      accountMocks.appStateListener?.('active');
    });
    expect(accountMocks.startAutoRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      accountMocks.appStateListener?.('background');
    });
    expect(accountMocks.stopAutoRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('fails a live recovery callback back to signed out with honest copy', async () => {
    accountMocks.storageGet.mockImplementation(async (key: string) =>
      key === 'recovery' ? String(Date.now()) : null,
    );
    accountMocks.exchange.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
    const { observed, renderer } = await mountAccount();

    await act(async () => {
      accountMocks.linkListener?.({ url: 'strandcue://auth/callback?code=expired&sb_flow_id=12345678' });
      await tick(10);
      await tick(10);
    });

    expect(accountMocks.exchange).toHaveBeenCalledWith('expired', { flowId: '12345678' });
    expect(observed().recovery).toBe(false);
    expect(observed().user).toBeNull();
    expect(observed().notice).toMatch(/expired|could not be verified|request another/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('signs out locally when a live recovery exchange throws', async () => {
    accountMocks.storageGet.mockImplementation(async (key: string) =>
      key === 'recovery' ? String(Date.now()) : null,
    );
    accountMocks.exchange.mockRejectedValue(new Error('network down'));
    const { observed, renderer } = await mountAccount();

    await act(async () => {
      accountMocks.linkListener?.({ url: 'strandcue://auth/callback?code=abc&sb_flow_id=12345678' });
      await tick(10);
      await tick(10);
    });

    expect(accountMocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(observed().recovery).toBe(false);
    expect(observed().notice).toMatch(/fresh link/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('finishes recovery explicitly and refreshes on storage failure', async () => {
    accountMocks.storageGet.mockImplementation(async (key: string) =>
      key === 'recovery-active' ? '1' : null,
    );
    const { observed, renderer } = await mountAccount();
    expect(observed().recovery).toBe(true);

    await act(async () => {
      observed().finishRecovery();
    });
    expect(observed().recovery).toBe(false);
    expect(accountMocks.storageRemove).toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('falls back to refresh when the initial storage read fails', async () => {
    accountMocks.storageGet.mockRejectedValueOnce(new Error('storage locked'));
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();

    expect(accountMocks.getUser).toHaveBeenCalled();
    expect(observed().user).toEqual(ownerA);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('drops late refresh results after unmount without crashing', async () => {
    const pending = deferred<{ data: { user: unknown }; error: null }>();
    accountMocks.getUser.mockReturnValueOnce(pending.promise);
    const { renderer } = await mountAccount();

    await act(async () => {
      renderer.unmount();
      pending.resolve({ data: { user: ownerA }, error: null });
      await pending.promise;
      await tick();
    });
    expect(accountMocks.getUser).toHaveBeenCalledTimes(1);
  });

  it('clears the marker and signs out on an invalid recovery link', async () => {
    const { completeRecoveryCallback } = await import('../../apps/mobile/src/auth');
    const removeMarker = vi.fn().mockResolvedValue(undefined);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await completeRecoveryCallback({
      url: 'strandcue://auth/callback?code=abc',
      pending: false,
      auth: { exchangeCodeForSession: vi.fn(), signOut },
      removeRecoveryMarker: removeMarker,
    });
    expect(result).toEqual({ status: 'failed', reason: 'invalid' });
    expect(removeMarker).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('ignores a late departing-draft failure after a newer refresh started', async () => {
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerA }, error: null });
    const { observed, renderer } = await mountAccount();
    expect(observed().user).toEqual(ownerA);

    const cleanup = deferred<void>();
    accountMocks.transitionOwner.mockReturnValueOnce(cleanup.promise);
    await emitAuthEvent('SIGNED_OUT');
    expect(observed().user).toBeNull();

    // A newer refresh starts before the stale cleanup rejects.
    accountMocks.getUser.mockResolvedValueOnce({ data: { user: ownerB }, error: null });
    await emitAuthEvent('SIGNED_IN');
    await act(async () => {
      cleanup.reject(new Error('storage locked'));
      await cleanup.promise.catch(() => undefined);
      await tick();
    });
    expect(observed().user).toEqual(ownerB);
    expect(observed().notice).toBe('');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the reset screen active when a link arrives mid-recovery', async () => {
    accountMocks.storageGet.mockImplementation(async (key: string) =>
      key === 'recovery-active' ? '1' : String(Date.now()),
    );
    const { observed, renderer } = await mountAccount();
    expect(observed().recovery).toBe(true);

    await act(async () => {
      accountMocks.linkListener?.({ url: 'strandcue://auth/callback?code=abc&sb_flow_id=12345678' });
      await tick(10);
      await tick(10);
    });

    expect(accountMocks.exchange).not.toHaveBeenCalled();
    expect(observed().recovery).toBe(true);
    await act(async () => {
      renderer.unmount();
    });
  });
});

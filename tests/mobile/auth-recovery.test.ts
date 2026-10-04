import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeRecoveryCallback, createRecoveryCallbackGate, useAccount } from '../../apps/mobile/src/auth';
const recoveryMocks = vi.hoisted(() => ({
  getInitialURL: vi.fn(), getUser: vi.fn(), exchange: vi.fn(), signOut: vi.fn(), authChange: vi.fn(),
  storageGet: vi.fn(), storageSet: vi.fn(), storageRemove: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove() {} }) }, Text: (props: unknown) => createElement('span', props as never), View: (props: unknown) => createElement('div', props as never) }));
vi.mock('expo-linking', () => ({ getInitialURL: recoveryMocks.getInitialURL, addEventListener: () => ({ remove() {} }) }));
vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'recovery', RECOVERY_ACTIVE_KEY: 'recovery-active',
  secureStorage: { getItem: recoveryMocks.storageGet, setItem: recoveryMocks.storageSet, removeItem: recoveryMocks.storageRemove },
  supabase: { auth: {
    getUser: recoveryMocks.getUser, exchangeCodeForSession: recoveryMocks.exchange, signOut: recoveryMocks.signOut,
    onAuthStateChange: recoveryMocks.authChange, startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn(),
  } },
}));
vi.mock('../../apps/mobile/src/ui.tsx', () => ({ Button: () => null, Field: () => null, Page: () => null, styles: {} }));
vi.mock('../../apps/mobile/src/service-form.ts', () => ({ transitionServiceDraftOwner: vi.fn().mockResolvedValue(undefined) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  recoveryMocks.authChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  recoveryMocks.storageGet.mockResolvedValue(String(Date.now()));
  recoveryMocks.storageSet.mockResolvedValue(undefined);
  recoveryMocks.storageRemove.mockResolvedValue(undefined);
  recoveryMocks.signOut.mockResolvedValue({ error: null });
});

describe('recovery callback transition', () => {
  it('runs a duplicated recovery callback only once and reuses its successful result', async () => {
    const gate = createRecoveryCallbackGate();
    const pending = deferred<{status: 'ready'}>();
    const operation = vi.fn(() => pending.promise);
    const first = gate.run(operation);
    const duplicate = gate.run(operation);
    expect(operation).toHaveBeenCalledTimes(1);
    pending.resolve({status: 'ready'});
    await expect(first).resolves.toEqual({status: 'ready'});
    await expect(duplicate).resolves.toEqual({status: 'ready'});
    await expect(gate.run(operation)).resolves.toEqual({status: 'ready'});
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('enters password reset only after a verified recovery exchange', async () => {
    const removeItem = vi.fn().mockResolvedValue(undefined);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: { access_token: 'not-exposed' }, redirectType: 'recovery' }, error: null,
    });
    const result = await completeRecoveryCallback({
      url: 'strandcue://auth/callback?code=abc&sb_flow_id=12345678', pending: true,
      auth: { exchangeCodeForSession, signOut }, removeRecoveryMarker: removeItem,
    });
    expect(result).toEqual({ status: 'ready' });
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc', {flowId: '12345678'});
    expect(signOut).not.toHaveBeenCalled();
    expect(removeItem).toHaveBeenCalledTimes(1);
  });

  it('clears temporary state and local session after an invalid or expired exchange', async () => {
    const removeItem = vi.fn().mockResolvedValue(undefined);
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const result = await completeRecoveryCallback({
      url: 'strandcue://auth/callback?code=expired&sb_flow_id=12345678', pending: true,
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: null }, error: new Error('provider secret') }),
        signOut,
      },
      removeRecoveryMarker: removeItem,
    });
    expect(result).toEqual({ status: 'failed', reason: 'expired' });
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('checks and completes a cold-start recovery callback before normal account refresh', async () => {
    const initial = deferred<string | null>();
    const exchange = deferred<{data: {session: object; redirectType: string}; error: null}>();
    recoveryMocks.getInitialURL.mockReturnValue(initial.promise);
    recoveryMocks.exchange.mockReturnValue(exchange.promise);
    recoveryMocks.getUser.mockResolvedValue({ data: { user: { id: 'wrong-route' } }, error: null });
    let observed: ReturnType<typeof useAccount> | undefined;
    function Harness() { observed = useAccount(); return null; }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Harness)); });
    expect(recoveryMocks.getUser).not.toHaveBeenCalled();
    initial.resolve('strandcue://auth/callback?code=abc&sb_flow_id=12345678');
    await act(async () => { await initial.promise; await Promise.resolve(); });
    expect(recoveryMocks.exchange).toHaveBeenCalledWith('abc', {flowId: '12345678'});
    expect(recoveryMocks.getUser).not.toHaveBeenCalled();
    expect(observed?.recovery).toBe(false);
    exchange.resolve({ data: { session: {}, redirectType: 'recovery' }, error: null });
    await act(async () => { await exchange.promise; await Promise.resolve(); });
    expect(observed?.recovery).toBe(true);
    expect(recoveryMocks.getUser).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the password reset screen active across an auth hook remount', async () => {
    recoveryMocks.getInitialURL.mockResolvedValue(null);
    recoveryMocks.storageGet.mockImplementation(async (key: string) => key === 'recovery-active' ? '1' : null);
    let observed: ReturnType<typeof useAccount> | undefined;
    function Harness() { observed = useAccount(); return null; }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Harness)); await Promise.resolve(); });
    expect(observed?.recovery).toBe(true);
    expect(recoveryMocks.getUser).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});


import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResetPassword, isReauthenticationRequired } from '../../apps/mobile/src/auth';

const passwordMocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
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

vi.mock('expo-linking', () => ({
  addEventListener: () => ({ remove: () => undefined }),
  getInitialURL: async () => null,
}));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  RECOVERY_KEY: 'strandcue-recovery',
  RECOVERY_ACTIVE_KEY: 'strandcue-recovery-active',
  secureStorage: passwordMocks.storage,
  supabase: { auth: { updateUser: passwordMocks.updateUser } },
}));

vi.mock('../../apps/mobile/src/service-form.ts', () => ({
  transitionServiceDraftOwner: vi.fn().mockResolvedValue(undefined),
}));

const REAUTH_COPY = 'fresh sign-in';

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function typePassword(renderer: ReactTestRenderer, value: string): void {
  const input = renderer.root.find(node => node.type === 'input');
  input.props.onChangeText(value);
}

function passwordValue(renderer: ReactTestRenderer): string {
  return renderer.root.find(node => node.type === 'input').props.value as string;
}

async function submit(renderer: ReactTestRenderer): Promise<void> {
  const button = renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === 'Save new password',
  );
  await act(async () => {
    await button.props.onPress();
  });
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
  vi.clearAllMocks();
  passwordMocks.storage.getItem.mockResolvedValue(null);
  passwordMocks.storage.removeItem.mockResolvedValue(undefined);
  passwordMocks.storage.setItem.mockResolvedValue(undefined);
});

describe('ResetPassword with secure password change', () => {
  it('completes a fresh-session password change unchanged', async () => {
    passwordMocks.updateUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    const onComplete = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ResetPassword, { onComplete }));
    });
    await act(async () => {
      typePassword(renderer, 'a-fresh-password-1');
    });
    await submit(renderer);
    expect(passwordMocks.updateUser).toHaveBeenCalledWith({ password: 'a-fresh-password-1' });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(passwordValue(renderer)).toBe('');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('directs a stale session to sign in again instead of failing silently', async () => {
    // Stable supabase-js identifier: AuthError.code === 'reauthentication_needed'
    // (node_modules/@supabase/auth-js/src/lib/error-codes.ts), raised by
    // updateUser when secure password change is on and the session is stale.
    passwordMocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'reauthentication needed', status: 422, code: 'reauthentication_needed' },
    });
    const onComplete = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ResetPassword, { onComplete }));
    });
    await act(async () => {
      typePassword(renderer, 'a-stale-session-password-1');
    });
    await submit(renderer);
    expect(renderedText(renderer)).toContain(REAUTH_COPY);
    expect(onComplete).not.toHaveBeenCalled();
    expect(passwordValue(renderer)).toBe('a-stale-session-password-1');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps the generic copy for non-reauth failures', async () => {
    passwordMocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthApiError', message: 'network failure', status: 500, code: 'unexpected_failure' },
    });
    const onComplete = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ResetPassword, { onComplete }));
    });
    await act(async () => {
      typePassword(renderer, 'another-valid-password-1');
    });
    await submit(renderer);
    expect(renderedText(renderer)).toContain('Request a new recovery link');
    expect(renderedText(renderer)).not.toContain(REAUTH_COPY);
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('rejects a short password before contacting the provider', async () => {
    const onComplete = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ResetPassword, { onComplete }));
    });
    await act(async () => {
      typePassword(renderer, 'short');
    });
    await submit(renderer);
    expect(passwordMocks.updateUser).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Use at least 12 characters.');
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('isReauthenticationRequired', () => {
  it('matches the stable supabase-js error code regardless of case', () => {
    expect(isReauthenticationRequired({ code: 'reauthentication_needed' })).toBe(true);
    expect(isReauthenticationRequired({ code: 'REAUTHENTICATION_NEEDED' })).toBe(true);
  });

  it('falls back to the server message when no code is present', () => {
    expect(isReauthenticationRequired({ message: 'Reauthentication needed' })).toBe(true);
    expect(isReauthenticationRequired({ message: 'network failure', code: 'unexpected_failure' })).toBe(false);
  });

  it('rejects null, non-object, and empty failures', () => {
    expect(isReauthenticationRequired(null)).toBe(false);
    expect(isReauthenticationRequired(undefined)).toBe(false);
    expect(isReauthenticationRequired('reauthentication_needed')).toBe(false);
    expect(isReauthenticationRequired({})).toBe(false);
  });
});

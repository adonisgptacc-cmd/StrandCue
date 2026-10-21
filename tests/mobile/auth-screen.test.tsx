import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthScreen } from '../../apps/mobile/src/auth';

const screenMocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  resetPassword: vi.fn(),
  storageSet: vi.fn(),
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
  RECOVERY_KEY: 'recovery',
  RECOVERY_ACTIVE_KEY: 'recovery-active',
  secureStorage: {
    getItem: async () => null,
    setItem: screenMocks.storageSet,
    removeItem: async () => undefined,
  },
  supabase: {
    auth: {
      signUp: screenMocks.signUp,
      signInWithPassword: screenMocks.signIn,
      resetPasswordForEmail: screenMocks.resetPassword,
    },
  },
}));

vi.mock('../../apps/mobile/src/service-form.ts', () => ({
  transitionServiceDraftOwner: vi.fn().mockResolvedValue(undefined),
}));

function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

function typeField(renderer: ReactTestRenderer, label: string, value: string): void {
  act(() => {
    const input = renderer.root.find(
      node => node.type === 'input' && node.props.accessibilityLabel === label,
    );
    input.props.onChangeText(value);
  });
}

function pressButton(renderer: ReactTestRenderer, label: string): Promise<void> {
  const button = renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === label,
  );
  return act(async () => {
    button.props.onPress();
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

async function renderScreen(notice = ''): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AuthScreen, { notice }));
  });
  return renderer;
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  vi.clearAllMocks();
  screenMocks.signUp.mockResolvedValue({ error: null });
  screenMocks.signIn.mockResolvedValue({ error: null });
  screenMocks.resetPassword.mockResolvedValue({ error: null });
  screenMocks.storageSet.mockResolvedValue(undefined);
});

describe('AuthScreen', () => {
  it('rejects an invalid email before contacting the provider', async () => {
    const renderer = await renderScreen();
    typeField(renderer, 'Email', 'not-an-email');
    await pressButton(renderer, 'Create account');
    expect(renderedText(renderer)).toContain('Enter a valid email address.');
    expect(screenMocks.signUp).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requires adult confirmation and a long password for signup', async () => {
    const renderer = await renderScreen();
    typeField(renderer, 'Email', 'user@example.test');
    typeField(renderer, 'Password', 'short');
    await pressButton(renderer, 'Create account');
    expect(renderedText(renderer)).toContain('18 or older');
    expect(screenMocks.signUp).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('creates an account and moves to sign in', async () => {
    const renderer = await renderScreen();
    typeField(renderer, 'Email', 'user@example.test');
    typeField(renderer, 'Password', 'a-long-enough-password-1');
    await pressButton(renderer, 'Confirm: I am 18 or older');
    await pressButton(renderer, 'Create account');
    expect(screenMocks.signUp).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'a-long-enough-password-1',
      options: { emailRedirectTo: 'https://strandcue.adonisgptacc.workers.dev/auth/callback' },
    });
    expect(renderedText(renderer)).toContain('Welcome back');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps provider signup failures generic', async () => {
    screenMocks.signUp.mockResolvedValue({ error: new Error('email exists') });
    const renderer = await renderScreen();
    typeField(renderer, 'Email', 'user@example.test');
    typeField(renderer, 'Password', 'a-long-enough-password-1');
    await pressButton(renderer, 'Confirm: I am 18 or older');
    await pressButton(renderer, 'Create account');
    const text = renderedText(renderer);
    expect(text).toContain('could not complete');
    expect(text).not.toContain('email exists');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('signs in with the entered credentials', async () => {
    const renderer = await renderScreen();
    await pressButton(renderer, 'Already have an account? Sign in');
    expect(renderedText(renderer)).toContain('Welcome back');
    typeField(renderer, 'Email', 'user@example.test');
    typeField(renderer, 'Password', 'a-long-enough-password-1');
    await pressButton(renderer, 'Sign in');
    expect(screenMocks.signIn).toHaveBeenCalledWith({
      email: 'user@example.test',
      password: 'a-long-enough-password-1',
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps provider sign-in failures generic', async () => {
    screenMocks.signIn.mockResolvedValue({ error: new Error('Invalid login credentials') });
    const renderer = await renderScreen();
    await pressButton(renderer, 'Already have an account? Sign in');
    typeField(renderer, 'Email', 'user@example.test');
    typeField(renderer, 'Password', 'a-long-enough-password-1');
    await pressButton(renderer, 'Sign in');
    const text = renderedText(renderer);
    expect(text).toContain('could not complete');
    expect(text).not.toContain('Invalid login credentials');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('sends a recovery link and marks the flow pending', async () => {
    const renderer = await renderScreen();
    await pressButton(renderer, 'Already have an account? Sign in');
    await pressButton(renderer, 'Forgot password?');
    expect(renderedText(renderer)).toContain('Recover your account');
    typeField(renderer, 'Email', 'user@example.test');
    await pressButton(renderer, 'Send recovery link');
    expect(screenMocks.storageSet).toHaveBeenCalled();
    expect(screenMocks.resetPassword).toHaveBeenCalledWith('user@example.test', {
      redirectTo: 'https://strandcue.adonisgptacc.workers.dev/auth/callback',
    });
    expect(renderedText(renderer)).toContain('recovery email is on its way');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('switches back to account creation from sign in', async () => {
    const renderer = await renderScreen();
    await pressButton(renderer, 'Already have an account? Sign in');
    await pressButton(renderer, 'Create an account');
    expect(renderedText(renderer)).toContain('Begin your hair record');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('adopts an incoming account notice', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(AuthScreen, { notice: '' }));
    });
    expect(renderedText(renderer)).not.toContain('signed out');
    await act(async () => {
      renderer.update(createElement(AuthScreen, { notice: 'Your session is no longer valid.' }));
    });
    expect(renderedText(renderer)).toContain('Your session is no longer valid.');
    await act(async () => {
      renderer.unmount();
    });
  });
});

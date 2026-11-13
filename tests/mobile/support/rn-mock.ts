import { createElement } from 'react';
import { vi } from 'vitest';

const host = (tag: string) => {
  function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
    return createElement(tag, props, children as never);
  }
  HostComponent.displayName = `Mock${tag}`;
  return HostComponent;
};

let appStateListener: ((state: string) => void) | null = null;

export function emitAppStateChange(state: string): void {
  appStateListener?.(state);
}

/** The react-native surface the Cue Check screens use, as plain host elements. */
export const rnMock = {
  Platform: { OS: 'web' },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appStateListener = listener;
      return { remove: () => { if (appStateListener === listener) appStateListener = null; } };
    },
  },
  Pressable: host('button'),
  ScrollView: host('main'),
  StyleSheet: { create: (value: unknown) => value },
  Text: host('span'),
  TextInput: host('input'),
  View: host('div'),
  Image: host('img'),
  AccessibilityInfo: { announceForAccessibility: vi.fn() },
  findNodeHandle: () => null,
};

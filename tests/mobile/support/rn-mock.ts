import { createElement } from 'react';
import { vi } from 'vitest';

const host = (tag: string) => {
  function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
    return createElement(tag, props, children as never);
  }
  HostComponent.displayName = `Mock${tag}`;
  return HostComponent;
};

/** The react-native surface the Cue Check screens use, as plain host elements. */
export const rnMock = {
  Platform: { OS: 'web' },
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

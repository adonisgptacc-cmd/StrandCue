import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { afterAll, beforeAll, vi } from 'vitest';
import { rnMock } from './rn-mock.ts';

/**
 * Shared mounting helpers for the treatment-programme screens. The screens are
 * rendered through the same react-native mock the other mobile suites use, so
 * every assertion is made against the props a screen reader would read.
 */

vi.mock('react-native', async () => (await import('./rn-mock.ts')).rnMock);
vi.mock('../../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));
vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  let n = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash('sha256').update(value, 'utf8').digest('hex'),
    randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));

const originalConsoleError = console.error.bind(console);

/** Silence the react-test-renderer deprecation notice, as the other suites do. */
export function setupProgrammeDom(): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
}

export function teardownProgrammeDom(): void {
  vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
}

/** Mount a tree and settle its first render. */
export async function mount(element: ReactNode | { readonly type: unknown; readonly props: Record<string, unknown> }): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  const renderable = element !== null && typeof element === 'object' && 'type' in element && 'props' in element
    ? createElement(element.type as never, element.props as never)
    : element;
  await act(async () => {
    renderer = create(renderable as ReactElement);
  });
  await settle();
  return renderer!;
}

export const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

/** Every text node and accessibility label the tree renders. */
export function visibleText(renderer: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object') {
      const record = node as { accessibilityLabel?: unknown; children?: unknown };
      if (typeof record.accessibilityLabel === 'string') out.push(record.accessibilityLabel);
      walk(record.children);
    }
  };
  walk(renderer.toJSON());
  return out.join(' | ');
}

export function findByLabel(renderer: ReactTestRenderer, label: string): readonly unknown[] {
  return renderer.root.findAll(node =>
    typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string' &&
    (node.props.accessibilityLabel === label || node.props.accessibilityLabel.startsWith(`${label}:`)));
}

export const hasLabel = (renderer: ReactTestRenderer, label: string): boolean =>
  findByLabel(renderer, label).length > 0;

export async function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  const found = findByLabel(renderer, label);
  if (found.length !== 1) {
    throw new Error(`expected exactly one control labelled "${label}", found ${found.length}`);
  }
  await act(async () => {
    (found[0] as { props: { onPress: () => void } }).props.onPress();
    await Promise.resolve();
  });
  await settle();
}

export async function typeInto(renderer: ReactTestRenderer, label: string, value: string): Promise<void> {
  const found = findByLabel(renderer, label);
  if (found.length !== 1) {
    throw new Error(`expected exactly one field labelled "${label}", found ${found.length}`);
  }
  await act(async () => {
    (found[0] as { props: { onChangeText: (value: string) => void } }).props.onChangeText(value);
    await Promise.resolve();
  });
}

export function announced(): unknown[] {
  return vi.mocked(rnMock.AccessibilityInfo.announceForAccessibility).mock.calls.map(call => call[0]);
}

/** The shared UI kit's minimum touch target, in points. */
export const TOUCH_TARGET = 44;

/** The rendered JSON of a tree, for a first-commit capture. */
export const snapshotOf = (renderer: ReactTestRenderer): string => JSON.stringify(renderer.toJSON());

export const element = (component: unknown, props: Record<string, unknown>): ReactNode =>
  createElement(component as never, props);

export const withSetup = (body: () => void): void => {
  beforeAll(setupProgrammeDom);
  afterAll(teardownProgrammeDom);
  body();
};

import { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

/** Helpers shared by the rendered mobile journeys. They only read the tree and press what a person could press. */

export function walk(node: ReactTestInstance | null, visit: (node: ReactTestInstance) => void): void {
  if (node === null) return;
  visit(node);
  for (const child of node.children) {
    if (typeof child === 'object' && child !== null) walk(child as ReactTestInstance, visit);
  }
}

const textOf = (node: ReactTestInstance) => node.children.filter((child): child is string => typeof child === 'string').join('');

export function renderedText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  walk(renderer.root, node => {
    const text = textOf(node);
    if (text !== '') parts.push(text);
  });
  return parts.join(' | ');
}

export function labelsOf(renderer: ReactTestRenderer): string[] {
  const found: string[] = [];
  walk(renderer.root, node => {
    if (typeof node.props?.accessibilityLabel === 'string') found.push(node.props.accessibilityLabel as string);
  });
  return found;
}

function spokenText(node: ReactTestInstance): string {
  const parts: string[] = [];
  const collect = (current: ReactTestInstance) => {
    for (const child of current.children) {
      if (typeof child === 'string') parts.push(child);
      else if (typeof child === 'object' && child !== null) collect(child as ReactTestInstance);
    }
  };
  collect(node);
  return parts.join(' ');
}

/** The text of every node a screen reader announces without being asked. */
export function announcedTexts(renderer: ReactTestRenderer): string[] {
  const texts: string[] = [];
  walk(renderer.root, node => {
    if (node.props?.accessibilityRole === 'alert' || typeof node.props?.accessibilityLiveRegion === 'string') {
      texts.push(spokenText(node));
    }
  });
  return texts;
}

export function press(renderer: ReactTestRenderer, label: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label && typeof candidate.props?.onPress === 'function');
  if (node.length === 0) throw new Error(`No pressable labelled "${label}"`);
  act(() => { node[0].props.onPress(); });
}

export function hasPressable(renderer: ReactTestRenderer, label: string): boolean {
  return renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label && typeof candidate.props?.onPress === 'function').length > 0;
}

export function type(renderer: ReactTestRenderer, label: string, value: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label && typeof candidate.props?.onChangeText === 'function');
  if (node.length === 0) throw new Error(`No input labelled "${label}"`);
  act(() => { node[0].props.onChangeText(value); });
}

export function inputValue(renderer: ReactTestRenderer, label: string): string {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label);
  if (node.length === 0) throw new Error(`No input labelled "${label}"`);
  return String(node[0].props.value ?? '');
}

export async function flush(times = 4): Promise<void> {
  for (let index = 0; index < times; index++) {
    await act(async () => { await Promise.resolve(); });
  }
}

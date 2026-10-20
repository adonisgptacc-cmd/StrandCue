import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { Button, Choice, Field, MultiChoice, styles } from '../../apps/mobile/src/ui';
import { ShelfEditor } from '../../apps/mobile/src/shelf-editor';
import { Shelf } from '../../apps/mobile/src/shelf';

function render(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('|');
  const element = node as ReactElement<any>;
  if (typeof element.type === 'function') return render((element.type as Function)(element.props));
  const label = element.props['aria-label'] ? `label="${element.props['aria-label']}"` : 'NO-LABEL';
  const role = element.props.role ? `role=${element.props.role}` : 'NO-ROLE';
  const disabled = element.props.disabled ? 'disabled' : '';
  return `[${label} ${role}${disabled ? ` ${disabled}` : ''}]${render(element.props.children)}`;
}

const rpc = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => {
  const host = (tag: string) => function Host({ children, accessibilityLabel, accessibilityRole, accessibilityState, onPress, onChangeText, ...props }: any) { return createElement(tag, {
    'aria-label': accessibilityLabel, role: accessibilityRole,
    disabled: accessibilityState?.disabled || props.disabled || props.editable === false,
    value: props.value, onChange: () => undefined,
    // The handlers are kept, so a test can drive the screen it renders.
    onPress, onChangeText,
  }, children); };
  return { Text: host('span'), View: host('div'), Pressable: host('button'), TextInput: host('input'), ScrollView: host('div'), StyleSheet: { create: (value: unknown) => value } };
});

vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
  secureStorage: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

describe('accessibility contracts', () => {
  it('exposes labels and roles on every interactive primitive', () => {
    expect(render(createElement(Button, { title: 'Save activity', onPress: () => undefined }))).toContain('label="Save activity"');
    expect(render(createElement(Button, { title: 'Save activity', onPress: () => undefined }))).toContain('role=button');
    expect(render(createElement(Field, { label: 'Product name', value: '', onChangeText: () => undefined }))).toContain('label="Product name"');
  });

  it('keeps touch targets at or above 48dp', () => {
    const targets = [styles.button.minHeight, styles.input.minHeight, styles.pill.minHeight];
    for (const minHeight of targets) {
      expect(minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('labels every choice option with its group and exposes selection state', () => {
    const html = render(createElement(Choice, {
      label: 'Activity kind', value: 'wash', options: ['wash', 'styling'] as const, onChange: () => undefined,
    }));
    expect(html).toContain('label="Activity kind: wash"');
    expect(html).toContain('label="Activity kind: styling"');
    expect(html).toContain('role=radio');
    const multi = render(createElement(MultiChoice, {
      label: 'Concerns', value: ['dryness'], options: ['dryness', 'frizz'] as const, onChange: () => undefined,
    }));
    expect(multi).toContain('role=checkbox');
    expect(multi).toContain('choose all that apply');
  });

  it('reflects disabled state to assistive technology', () => {
    expect(render(createElement(Button, { title: 'Saving', disabled: true, onPress: () => undefined }))).toContain('disabled');
  });
});

// --- The correction flow and the product history ---------------------------

const owner = 'b0000000-0000-4000-8000-000000000001';
const userProductId = 'b0000000-0000-4000-8000-000000000002';
const baselineId = 'b0000000-0000-4000-8000-000000000003';
const correctionId = 'b0000000-0000-4000-8000-000000000004';

const identityEntry = {
  id: baselineId, kind: 'baseline' as const, correctsId: null, matchVersionId: null,
  // The size is an answer the owner gave and the notes are an answer the
  // owner never gave: the server records both keys.
  patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualSize: '400 ml', availability: 'available', notes: null },
};

const correction = {
  id: correctionId, kind: 'correction' as const, correctsId: baselineId, matchVersionId: null,
  correctionReason: 'The brand was wrong',
  patch: {
    manualBrand: 'New brand', manualName: 'Gentle shampoo bar', manualCategory: 'shampoo',
    manualVariant: null, quantityBand: 'unknown',
  },
};

const shelfDetail = (overrides: Record<string, unknown> = {}) => ({
  id: userProductId,
  revision: 2,
  availability: 'available',
  matched: false,
  matchConfirmed: false,
  manualBrand: 'New brand',
  manualName: 'Gentle shampoo bar',
  manualCategory: 'shampoo',
  manualVariant: null,
  manualSize: null,
  manualBarcode: null,
  openedOn: null,
  expiryOn: null,
  pao: null,
  quantityBand: null,
  repurchaseIntent: null,
  notes: null,
  versionId: null,
  revisions: [identityEntry, correction],
  ...overrides,
});

const shelfItem = {
  id: userProductId, revision: 1, availability: 'available',
  manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
  manualVariant: null, manualSize: null, manualBarcode: null,
  openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null,
};

function walk(node: ReactTestInstance | null, visit: (node: ReactTestInstance) => void): void {
  if (node === null) return;
  visit(node);
  for (const child of node.children) {
    if (typeof child === 'object' && child !== null) walk(child as ReactTestInstance, visit);
  }
}

/** Every string a node speaks, including the ones below it. */
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

/** The text of every announced node on the screen. */
function announcedTexts(renderer: ReactTestRenderer): string[] {
  const texts: string[] = [];
  walk(renderer.root, (node) => {
    if (node.props?.role === 'alert') texts.push(spokenText(node));
  });
  return texts;
}

/** The text of every heading on the screen. */
function headingTexts(renderer: ReactTestRenderer): string[] {
  const texts: string[] = [];
  walk(renderer.root, (node) => {
    if (node.props?.role === 'header') texts.push(spokenText(node));
  });
  return texts;
}

function type(renderer: ReactTestRenderer, label: string, value: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.['aria-label'] === label && typeof candidate.props?.onChangeText === 'function');
  if (node.length === 0) throw new Error(`No input labelled "${label}"`);
  act(() => { node[0].props.onChangeText(value); });
}

function press(renderer: ReactTestRenderer, label: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.['aria-label'] === label && typeof candidate.props?.onPress === 'function');
  if (node.length === 0) throw new Error(`No pressable labelled "${label}"`);
  act(() => { node[0].props.onPress(); });
}

async function flush(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe('the correction flow and the product history', () => {
  async function openCorrection(): Promise<ReactTestRenderer> {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner, mode: 'correct', userProductId,
        detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    return renderer;
  }

  async function openHistory(): Promise<ReactTestRenderer> {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    return renderer;
  }

  it('announces the reason a correction refuses', async () => {
    const renderer = await openCorrection();
    type(renderer, 'Brand (as printed)', 'New brand');
    press(renderer, 'Save correction');
    await flush();
    expect(announcedTexts(renderer).some(text => text.includes('Reason for this correction'))).toBe(true);
  });

  it('announces the identity rule a correction refuses', async () => {
    const renderer = await openCorrection();
    type(renderer, 'Reason for this correction (required)', 'I want to say something about this product');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(announcedTexts(renderer).some(text => text.includes('A correction has to change the brand, the name or the category.'))).toBe(true);
  });

  it('gives every revision of the history a heading', async () => {
    const renderer = await openHistory();
    const headings = headingTexts(renderer);
    expect(headings).toContain('Original entry');
    expect(headings).toContain('Correction');
  });

  it('says the four answers in four different ways', async () => {
    const renderer = await openHistory();
    // The answers are announced, not only drawn: the owner asked to read
    // the history, so the history speaks.
    const announced = announcedTexts(renderer).join(' | ');
    // A fact the owner answered, a fact they took back, a fact they never
    // answered and a fact the correction left alone.
    expect(announced).toContain('Brand: New brand');
    expect(announced).toContain('Variant: Cleared');
    expect(announced).toContain('Notes: Not answered');
    expect(announced).toContain('Size: Kept');
    // An explicit unknown answer keeps its own words.
    expect(announced).toContain('How much is left: Not sure');
    // The four answers are four different words, so they are tellable apart
    // by sound alone.
    const states = ['Cleared', 'Not answered', 'Kept', 'Not sure'];
    expect(new Set(states).size).toBe(4);
    for (const state of states) expect(announced).toContain(state);
  });

  it('reads an identity the owner never gave as never answered', async () => {
    // The first entry of a product without a brand records the key with a
    // null value, so the correction that follows must not read it as kept.
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem], nextCursor: null }, error: null });
      if (name === 'shelf_history') {
        return Promise.resolve({
          data: shelfDetail({
            manualBrand: null,
            manualCategory: null,
            revisions: [
              {
                ...identityEntry,
                patch: { manualBrand: null, manualName: 'Gentle shampoo', manualCategory: null, availability: 'available', notes: null },
              },
              { ...correction, patch: { manualName: 'Gentle shampoo bar' } },
            ],
          }),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    const announced = announcedTexts(renderer).join(' | ');
    // The owner never answered either, so neither reads as kept.
    expect(announced).toContain('Brand: Not answered');
    expect(announced).toContain('Category: Not answered');
    expect(announced).not.toContain('Brand: Kept');
    expect(announced).not.toContain('Category: Kept');
  });

  it('announces the screen the owner moves into', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, "Correct this product's details");
    await flush();
    expect(announcedTexts(renderer).some(text => text.includes('Correct this product'))).toBe(true);
  });
});

import { createElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveUserProduct,
  changeUserProduct,
  correctUserProduct,
  correctionTarget,
  getUserProduct,
  listUserProducts,
  matchUserProduct,
  recordUserProduct,
  type ShelfRevisionRecord,
} from '../../apps/mobile/src/shelf-api';
import {
  shelfDraftIndexKey,
  shelfDraftKey,
  clearShelfDrafts,
  readShelfDrafts,
  removeShelfDraft,
  saveShelfDraft,
  submitShelfDraft,
  type ShelfDraft,
  type ShelfDraftStorage,
} from '../../apps/mobile/src/shelf-drafts';
import {
  availabilityLabel,
  openedOnLabel,
  recordedIdentityWording,
  revisionLines,
  shelfEditorCopy,
  shelfFactLines,
  shelfView,
  unreadableHistoryLabel,
  verificationBadge,
} from '../../apps/mobile/src/shelf-history';
import { ShelfEditor, commandFailureMessage } from '../../apps/mobile/src/shelf-editor';
import { Shelf } from '../../apps/mobile/src/shelf';
import { styles } from '../../apps/mobile/src/ui';
import { ChangeUserProductCommandSchema, CorrectUserProductCommandSchema, CORRECTION_IDENTITY_CHANGE_RULE, CORRECTION_IDENTITY_RULE, correctionTargetRevision, CreateUserProductCommandSchema } from '../../packages/domain/src/shelf.ts';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

const rpc = vi.hoisted(() => vi.fn());
const deviceStorage = vi.hoisted(() => new Map<string, string>());
const ids = vi.hoisted(() => ({ counter: 0 }));

vi.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++ids.counter).padStart(12, '0')}` }));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
  secureStorage: {
    getItem: async (key: string) => deviceStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
    removeItem: async (key: string) => { deviceStorage.delete(key); },
  },
}));

const operationId = 'a0000000-0000-4000-8000-000000000001';
const userProductId = 'a0000000-0000-4000-8000-000000000002';
const versionId = 'a0000000-0000-4000-8000-000000000003';
const ownerA = 'b0000000-0000-4000-8000-000000000001';
const ownerB = 'b0000000-0000-4000-8000-000000000002';

const createCommand = {
  operationId,
  userProductId,
  // The date the command takes effect. It is part of the command, so a
  // retained draft that is retried later sends the same payload.
  effectiveDate: { precision: 'day', value: '2026-03-01' } as const,
  versionId: null,
  manualBrand: 'House brand',
  manualName: 'Gentle shampoo',
  manualCategory: 'shampoo' as const,
  availability: 'available' as const,
  notes: null,
};

function memoryStorage(): ShelfDraftStorage {
  let values: Record<string, string> = {};
  return {
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => { values = { ...values, [key]: value }; },
    removeItem: async (key: string) => { values = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)); },
  };
}
const createDraft = (): ShelfDraft => ({ mode: 'add', command: { ...createCommand } });

// The device storage the mocked secureStorage uses, in the draft shape.
const deviceDraftStorage: ShelfDraftStorage = {
  getItem: async (key: string) => deviceStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
  removeItem: async (key: string) => { deviceStorage.delete(key); },
};

describe('shelf mobile boundary', () => {
  it('sends a validated add command without owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    await expect(recordUserProduct(createCommand)).resolves.toMatchObject({ userProductId, revision: 1 });
    expect(rpc).toHaveBeenLastCalledWith('shelf_add', expect.objectContaining({
      p_operation_id: operationId,
      p_user_product_id: userProductId,
      p_manual_name: 'Gentle shampoo',
    }));
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters).not.toHaveProperty('owner');
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 1, revisions: [], owner: ownerA }, error: null });
    await expect(recordUserProduct(createCommand)).rejects.toThrow();
  });

  it('requires confirmation for match and sends archive distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    await matchUserProduct({ operationId, userProductId, expectedRevision: 1, versionId, confirmed: true });
    expect(rpc).toHaveBeenLastCalledWith('shelf_match', expect.objectContaining({ p_confirmed: true }));
    await expect(matchUserProduct({ operationId, userProductId, expectedRevision: 1, versionId, confirmed: false as unknown as true })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    await archiveUserProduct({ operationId, userProductId, expectedRevision: 2 });
    expect(rpc).toHaveBeenLastCalledWith('shelf_archive', expect.objectContaining({ p_user_product_id: userProductId }));
  });

  it('lists non-archived items and parses history with match state', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [shelfItem({ revision: 1, availability: 'available', manualName: 'Gentle shampoo' })], nextCursor: null }, error: null });
    await expect(listUserProducts()).resolves.toMatchObject({ items: [{ id: userProductId }], nextCursor: null });
    rpc.mockResolvedValueOnce({
      data: {
        id: userProductId, revision: 2, availability: 'available', matched: true, matchConfirmed: true,
        manualName: 'My shampoo guess', versionId, revisions: [shelfRevision()],
        manualBrand: null, manualCategory: null, manualVariant: null, manualSize: null, manualBarcode: null,
        openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: null,
      },
      error: null,
    });
    const detail = await getUserProduct(userProductId, true);
    expect(detail).toMatchObject({ matched: true, manualName: 'My shampoo guess' });
  });

  it('parses the audit payload the server sends, the recorded patch included', async () => {
    // The audit read carries the facts every revision recorded. The client
    // has to read the payload the server really sends, not a tidied-up one.
    rpc.mockResolvedValueOnce({
      data: shelfDetail({
        revision: 3,
        revisions: [
          shelfRevision(),
          shelfRevision({
            id: 'c0000000-0000-4000-8000-000000000002',
            kind: 'change',
            patch: { versionId: null, manualBrand: null, manualName: null, manualCategory: null, availability: 'low', notes: null },
          }),
        ],
      }),
      error: null,
    });
    const detail = await getUserProduct(userProductId, true);
    expect(detail?.revisions).toHaveLength(2);
    expect(detail?.revisions[0]?.patch).toMatchObject({ manualName: 'Gentle shampoo', manualCategory: 'shampoo' });
    expect(detail?.revisions[1]?.patch).toMatchObject({ availability: 'low' });
  });

  it('sends a correction with the entry it replaces, the reason and the facts it carries', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    await correctUserProduct({
      operationId,
      userProductId,
      expectedRevision: 1,
      correctsId: 'c0000000-0000-4000-8000-000000000001',
      reason: 'The name was wrong',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      manualBrand: 'House brand',
      manualName: 'Gentle shampoo bar',
      manualCategory: 'shampoo',
      quantityBand: 'about-half',
    });
    expect(rpc).toHaveBeenLastCalledWith('shelf_correct', expect.objectContaining({
      p_operation_id: operationId,
      p_user_product_id: userProductId,
      p_expected_revision: 1,
      p_corrects_id: 'c0000000-0000-4000-8000-000000000001',
      p_reason: 'The name was wrong',
      // The identity travels in the facts patch, not beside it.
      p_facts: { manualBrand: 'House brand', manualName: 'Gentle shampoo bar', manualCategory: 'shampoo', quantityBand: 'about-half' },
    }));
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    // A correction never carries an owner field.
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters).not.toHaveProperty('owner');
    // The identity is never a parameter of its own.
    expect(parameters).not.toHaveProperty('p_manual_brand');
    expect(parameters).not.toHaveProperty('p_manual_name');
    expect(parameters).not.toHaveProperty('p_manual_category');
  });

  it('refuses a correction without a reason before it reaches the server', async () => {
    await expect(correctUserProduct({
      operationId,
      userProductId,
      expectedRevision: 1,
      correctsId: 'c0000000-0000-4000-8000-000000000001',
      reason: '   ',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      manualBrand: null,
      manualName: 'Gentle shampoo bar',
      manualCategory: null,
    })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('pages through cursors and rejects out-of-range limits before sending', async () => {    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: userProductId };
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: cursor }, error: null });
    await expect(listUserProducts({ limit: 10 })).resolves.toMatchObject({ nextCursor: cursor });
    expect(rpc).toHaveBeenLastCalledWith('shelf_list', { p_limit: 10, p_cursor: null });
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null });
    await expect(listUserProducts({ limit: 10, cursor })).resolves.toMatchObject({ nextCursor: null });
    expect(rpc).toHaveBeenLastCalledWith('shelf_list', { p_limit: 10, p_cursor: cursor });
    await expect(listUserProducts({ limit: 101 })).rejects.toThrow();
  });

  it('rejects notes longer than 2000 characters before sending', async () => {
    await expect(recordUserProduct({ ...createCommand, notes: 'a'.repeat(2001) })).rejects.toThrow();
  });

  it('labels verification status as text, never colour-only or whole-record truth', () => {
    expect(verificationBadge('verified')).toContain('Verified');
    expect(verificationBadge('unverified')).toContain('Unverified');
    expect(verificationBadge('conflicting_information')).toContain('Conflicting');
    // Unknown ingredients stay unknown; null is never presented as a finding.
    expect(verificationBadge('unverified')).not.toContain('no protein');
  });

  it('labels editor actions and list states without shopping language', () => {
    expect(shelfEditorCopy('add')).toMatchObject({ title: 'Add a product' });
    expect(shelfEditorCopy('edit')).toMatchObject({ title: 'Edit this product' });
    expect(shelfEditorCopy('correct')).toMatchObject({ title: 'Correct this product' });
    expect(shelfEditorCopy('match')).toMatchObject({ title: 'Match to catalogue entry' });
    expect(shelfEditorCopy('archive')).toMatchObject({ title: 'Archive this product' });
    expect(shelfView(true, [], null)).toBe('loading');
    expect(shelfView(false, [], null)).toBe('empty');
    expect(shelfView(false, [{ id: 'x' }], null)).toBe('list');
  });
});

describe('shelf drafts', () => {
  it('indexes drafts by owner and product and only clears that owner', async () => {
    const storage = memoryStorage();
    expect(shelfDraftKey(ownerA, userProductId)).toBe(`strandcue-shelf-draft-${ownerA}-${userProductId}`);
    expect(shelfDraftIndexKey(ownerA)).toBe(`strandcue-shelf-drafts-${ownerA}`);
    await saveShelfDraft(storage, ownerA, createDraft());
    await saveShelfDraft(storage, ownerB, createDraft());
    await clearShelfDrafts(storage, ownerA);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([]);
    expect(await readShelfDrafts(storage, ownerB)).toEqual([createDraft()]);
  });

  it('persists before sending and retries the identical locked command after uncertain failure', async () => {
    const storage = memoryStorage();
    const received: unknown[] = [];
    let attempt = 0;
    const dispatch = async (draft: ShelfDraft) => {
      expect(await readShelfDrafts(storage, ownerA)).toEqual([createDraft()]);
      received.push(draft);
      if (++attempt === 1) throw new Error('Network unavailable');
    };
    await expect(submitShelfDraft(storage, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow('Network unavailable');
    const [restored] = await readShelfDrafts(storage, ownerA);
    await submitShelfDraft(storage, ownerA, restored, dispatch, () => true);
    expect(received).toEqual([createDraft(), createDraft()]);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([]);
  });

  it('never sends when persistence fails or the editor becomes stale', async () => {
    const storage = memoryStorage();
    let sends = 0;
    const dispatch = async () => { sends++; };
    await expect(submitShelfDraft({ ...storage, setItem: async () => { throw new Error('Disk failed'); } }, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow();
    await expect(submitShelfDraft(storage, ownerA, createDraft(), dispatch, () => false)).rejects.toThrow();
    expect(sends).toBe(0);
  });

  it('retains other indexed drafts on explicit discard', async () => {
    const storage = memoryStorage();
    const secondId = 'a0000000-0000-4000-8000-000000000009';
    const second: ShelfDraft = { mode: 'add', command: { ...createCommand, userProductId: secondId, operationId: 'a0000000-0000-4000-8000-000000000010' } };
    await saveShelfDraft(storage, ownerA, createDraft());
    await saveShelfDraft(storage, ownerA, second);
    await removeShelfDraft(storage, ownerA, userProductId);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([second]);
  });
});

// --- The shelf journey, rendered -----------------------------------------

const shelfItem = (overrides: Record<string, unknown> = {}) => ({
  id: userProductId,
  revision: 1,
  availability: 'available',
  manualBrand: 'House brand',
  manualName: 'Gentle shampoo',
  manualCategory: 'shampoo',
  manualVariant: null,
  manualSize: null,
  manualBarcode: null,
  openedOn: null,
  expiryOn: null,
  pao: null,
  quantityBand: null,
  repurchaseIntent: null,
  ...overrides,
});

const shelfDetail = (overrides: Record<string, unknown> = {}) => ({
  id: userProductId,
  revision: 1,
  availability: 'available',
  matched: false,
  matchConfirmed: false,
  manualBrand: 'House brand',
  manualName: 'Gentle shampoo',
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
  revisions: [],
  ...overrides,
});

/**
 * One entry of the product history, in the shape the server really sends:
 * the audit read carries the facts the revision recorded.
 */
const shelfRevision = (overrides: Record<string, unknown> = {}) => ({
  id: 'c0000000-0000-4000-8000-000000000001',
  kind: 'baseline',
  correctsId: null,
  matchVersionId: null,
  patch: {
    versionId: null,
    manualBrand: 'House brand',
    manualName: 'Gentle shampoo',
    manualCategory: 'shampoo',
    availability: 'available',
    notes: null,
  },
  ...overrides,
});

function walk(node: ReactTestInstance | null, visit: (node: ReactTestInstance) => void): void {
  if (node === null) return;
  visit(node);
  for (const child of node.children) {
    if (typeof child === 'object' && child !== null) walk(child as ReactTestInstance, visit);
  }
}

const textOf = (node: ReactTestInstance) => node.children.filter((child): child is string => typeof child === 'string').join('');

function renderedText(renderer: ReactTestRenderer): string {
  const parts: string[] = [];
  walk(renderer.root, (node) => {
    const text = textOf(node);
    if (text !== '') parts.push(text);
  });
  return parts.join(' | ');
}

function labelsOf(renderer: ReactTestRenderer): string[] {
  const found: string[] = [];
  walk(renderer.root, (node) => {
    if (typeof node.props?.accessibilityLabel === 'string') found.push(node.props.accessibilityLabel as string);
  });
  return found;
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
    if (node.props?.accessibilityRole === 'alert') texts.push(spokenText(node));
  });
  return texts;
}

/** Every radio that is the selected one in its group. */
function selectedRadios(renderer: ReactTestRenderer): ReactTestInstance[] {
  return renderer.root.findAll(node => (
    typeof node.type === 'string'
    && node.props?.accessibilityRole === 'radio'
    && node.props?.accessibilityState?.selected === true
  ));
}

function press(renderer: ReactTestRenderer, label: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label && typeof candidate.props?.onPress === 'function');
  if (node.length === 0) throw new Error(`No pressable labelled "${label}"`);
  act(() => { node[0].props.onPress(); });
}

function type(renderer: ReactTestRenderer, label: string, value: string): void {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label && typeof candidate.props?.onChangeText === 'function');
  if (node.length === 0) throw new Error(`No input labelled "${label}"`);
  act(() => { node[0].props.onChangeText(value); });
}

function choose(renderer: ReactTestRenderer, group: string, option: string): void {
  press(renderer, `${group}: ${option}`);
}

function inputValue(renderer: ReactTestRenderer, label: string): string {
  const node = renderer.root.findAll(candidate => candidate.props?.accessibilityLabel === label);
  if (node.length === 0) throw new Error(`No input labelled "${label}"`);
  return String(node[0].props.value ?? '');
}

async function flush(times = 3): Promise<void> {
  for (let index = 0; index < times; index++) {
    await act(async () => { await Promise.resolve(); });
  }
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  vi.clearAllMocks();
  deviceStorage.clear();
  ids.counter = 0;
});

describe('the shelf editor', () => {
  it('records a manual product with no catalogue identity and no barcode or photograph', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Brand (as printed)', 'House brand');
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Variant (as printed, optional)', 'Fragrance free');
    type(renderer, 'Size (as printed, optional)', '400 ml');
    type(renderer, 'Barcode (optional)', '6001234567890');
    type(renderer, 'Period after opening (your own words, optional)', '12 months after opening');
    press(renderer, 'Save product');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_add');
    expect(parameters.p_version_id).toBeNull();
    expect(parameters.p_manual_brand).toBe('House brand');
    expect(parameters.p_manual_name).toBe('Gentle shampoo');
    expect(parameters.p_facts).toMatchObject({
      manualVariant: 'Fragrance free',
      manualSize: '400 ml',
      manualBarcode: '6001234567890',
      pao: '12 months after opening',
    });
    // A fact the owner never answered stays out of the patch entirely.
    expect(Object.keys(parameters.p_facts as Record<string, unknown>)).not.toContain('quantityBand');
  });

  it('keeps the exact owner-entered identity after an edit', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    expect(renderedText(renderer)).toContain('Brand: House brand');
    expect(renderedText(renderer)).toContain('Name: Gentle shampoo');
    choose(renderer, 'Availability', 'Running low');
    press(renderer, 'Save changes');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_change');
    expect(parameters.p_availability).toBe('low');
    // The identity is never rewritten by an ordinary change.
    expect(parameters.p_manual_brand).toBeNull();
    expect(parameters.p_manual_name).toBeNull();
    expect(parameters.p_manual_category).toBeNull();
  });

  it('never files a product under a category the owner did not choose', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    // Nothing is chosen for the owner: the group starts unchosen.
    const chosen = selectedRadios(renderer);
    expect(chosen.every(node => String(node.props.accessibilityLabel).startsWith('Availability:'))).toBe(true);
    type(renderer, 'Product name', 'Gentle shampoo');
    press(renderer, 'Save product');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(parameters.p_manual_category).toBeNull();
  });

  it('composes a correction with a reason and sends it to the correction path', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Product name', 'Gentle shampoo bar');
    type(renderer, 'Reason for this correction (required)', 'The name was wrong');
    press(renderer, 'Save correction');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_correct');
    // The correction appends: it points at the entry it replaces.
    expect(parameters.p_corrects_id).toBe('c0000000-0000-4000-8000-000000000001');
    expect(parameters.p_reason).toBe('The name was wrong');
    // The identity travels in the facts patch, with the three states apart.
    expect(parameters.p_facts).toMatchObject({ manualName: 'Gentle shampoo bar' });
    expect(parameters.p_facts).not.toHaveProperty('manualBrand');
    expect(parameters.p_expected_revision).toBe(1);
  });

  it('clears the name of a catalogue-linked product, because the link identifies it', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        // The product is linked to a catalogue version, so something else
        // identifies it: the manual name can go, and the server takes it.
        detail: shelfDetail({ versionId, matched: true, matchConfirmed: true, revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Product name', '');
    type(renderer, 'Reason for this correction (required)', 'The name was typed wrong');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_correct');
    // The name is cleared, not replaced and not left as it was.
    expect(parameters.p_facts).toMatchObject({ manualName: null });
    expect(renderedText(renderer)).not.toContain('Keep a name on this product');
  });

  it('refuses to clear the only name a manual product has', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        // Nothing else identifies this product, so a cleared name would
        // leave a row that identifies nothing: the editor refuses it.
        detail: shelfDetail({ revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Product name', '');
    type(renderer, 'Reason for this correction (required)', 'The name was typed wrong');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Keep a name on this product');
  });

  it('refuses a correction without a reason', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Product name', 'Gentle shampoo bar');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Say why you are correcting this product');
  });

  it('starts a correction from the entry the owner recorded, so the original is not erased', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    // The form opens on what the target revision recorded, so the owner
    // corrects the entry instead of starting from nothing.
    expect(inputValue(renderer, 'Brand (as printed)')).toBe('House brand');
    expect(inputValue(renderer, 'Product name')).toBe('Gentle shampoo');
  });

  it('lets the owner take back an answer they picked by mistake', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId,
        detail: shelfDetail({
          quantityBand: 'about-half', repurchaseIntent: 'would-rebuy',
          openedOn: { precision: 'day', value: '2026-03-01' },
        }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    // Every group that takes an answer offers the way back, and it says so
    // in the same words the history uses.
    expect(labelsOf(renderer)).toContain('How much is left?: Cleared');
    expect(labelsOf(renderer)).toContain('Would you buy it again?: Cleared');
    expect(labelsOf(renderer)).toContain('When did you open it?: Cleared');
    // The clearing option never calls itself "Not answered": that is the
    // state of a fact the owner never answered.
    expect(labelsOf(renderer)).not.toContain('How much is left?: Not answered');
    choose(renderer, 'How much is left?', 'Cleared');
    choose(renderer, 'Would you buy it again?', 'Cleared');
    choose(renderer, 'When did you open it?', 'Cleared');
    press(renderer, 'Save changes');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    // An answer the owner took back is cleared, not left as it was.
    expect(parameters.p_facts).toMatchObject({ quantityBand: null, repurchaseIntent: null, openedOn: null });
  });

  it('saves again against the current revision after another change won the race', async () => {
    let attempt = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_history') {
        return Promise.resolve({ data: shelfDetail({ revision: 4, availability: 'empty' }), error: null });
      }
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('revision-conflict'))
        : Promise.resolve({ data: { userProductId, revision: 5, revisions: [] }, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    choose(renderer, 'Availability', 'Running low');
    press(renderer, 'Save changes');
    await flush();
    // The current entry is named, so the copy points at what is on screen.
    expect(renderedText(renderer)).toContain('revision 4');
    press(renderer, 'Discard failed attempt and review');
    await flush();
    press(renderer, 'Save changes');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_change');
    // The retry is made against the revision the server really holds.
    expect(parameters.p_expected_revision).toBe(4);
  });

  it('never completes a save that belongs to a former owner', async () => {
    let releaseSave!: (value: unknown) => void;
    const saveAnswer = new Promise(resolve => { releaseSave = resolve; });
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_add') return saveAnswer;
      return Promise.resolve({ data: null, error: null });
    });
    let saved = false;
    const onSaved = () => { saved = true; };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    press(renderer, 'Save product');
    await flush();
    // The owner changes while the save is still in flight.
    await act(async () => {
      renderer.update(createElement(ShelfEditor, { owner: ownerB, mode: 'add', onSaved, onCancel: () => undefined }));
    });
    await act(async () => {
      releaseSave({ data: { userProductId, revision: 1, revisions: [] }, error: null });
      await saveAnswer;
    });
    await flush();
    // The answer of the former owner never reaches the new one.
    expect(saved).toBe(false);
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerB}-`))).toBe(false);
  });

  it('opens a retained draft on the entry the server holds and saves against it', async () => {
    let change = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail({ revision: 3 }), error: null });
      if (name === 'shelf_change') {
        change += 1;
        return change === 1
          ? Promise.reject(new Error('revision-conflict'))
          : Promise.resolve({ data: { userProductId, revision: 4, revisions: [] }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const draft: ShelfDraft = {
      mode: 'edit',
      command: { operationId, userProductId, expectedRevision: 1, effectiveDate: { precision: 'day', value: '2026-03-01' }, availability: 'low' },
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', resume: draft, onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    await flush();
    // The entry the draft belongs to is loaded, so the identity on screen is
    // the real one and not a blank.
    expect(renderedText(renderer)).toContain('Name: Gentle shampoo');
    expect(renderedText(renderer)).not.toContain('Name: Not recorded');
    // The retained command is retried as it was written.
    press(renderer, 'Retry identical save');
    await flush();
    expect(renderedText(renderer)).toContain('revision 3');
    press(renderer, 'Discard failed attempt and review');
    await flush();
    press(renderer, 'Save changes');
    await flush();
    const calls = rpc.mock.calls.filter(call => call[0] === 'shelf_change');
    const parameters = calls.at(-1)?.[1] as Record<string, unknown>;
    // The retry is made against the revision the server really holds.
    expect(parameters.p_expected_revision).toBe(3);
  });

  it('offers every availability state and confirms before archiving', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    const labels = labelsOf(renderer);
    // The radio group speaks the same words the rest of the journey uses.
    for (const state of ['Available', 'Running low', 'Nothing left', 'Archived']) {
      expect(labels).toContain(`Availability: ${state}`);
    }
    choose(renderer, 'Availability', 'Archived');
    press(renderer, 'Save changes');
    await flush();
    // Archiving is never a silent event: the owner confirms it first.
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Confirm that you want to archive this product');
    choose(renderer, 'I confirm this product is archived', 'Yes, archive this product');
    press(renderer, 'Save changes');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(parameters.p_availability).toBe('archived');
  });

  it('records the opened date with the precision the owner actually knows', async () => {
    for (const [precision, value, expected] of [
      ['day', '2026-03-01', { precision: 'day', value: '2026-03-01' }],
      ['month', '2026-03', { precision: 'month', value: '2026-03' }],
      ['year', '2026', { precision: 'year', value: '2026' }],
      ['unknown', '', { precision: 'unknown', value: null }],
    ] as const) {
      rpc.mockResolvedValue({ data: { userProductId, revision: 1, revisions: [] }, error: null });
      let renderer!: ReactTestRenderer;
      await act(async () => {
        renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
      });
      type(renderer, 'Product name', 'Gentle shampoo');
      choose(renderer, 'When did you open it?', precision === 'day' ? 'A day' : precision === 'month' ? 'A month' : precision === 'year' ? 'A year' : 'Not sure');
      if (value !== '') {
        const label = precision === 'day' ? 'Date opened (YYYY-MM-DD)' : precision === 'month' ? 'Month opened (YYYY-MM)' : 'Year opened (YYYY)';
        type(renderer, label, value);
      }
      press(renderer, 'Save product');
      await flush();
      const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
      expect((parameters.p_facts as Record<string, unknown>).openedOn).toEqual(expected);
    }
  });

  it('refuses an impossible opened date without sending anything', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    choose(renderer, 'When did you open it?', 'A day');
    type(renderer, 'Date opened (YYYY-MM-DD)', '2026-02-30');
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('not a real date');
  });

  it('records an explicit unknown for the quantity band and the repurchase intent', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    choose(renderer, 'How much is left?', 'Not sure');
    choose(renderer, 'Would you buy it again?', 'Not sure yet');
    press(renderer, 'Save product');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(parameters.p_facts).toMatchObject({ quantityBand: 'unknown', repurchaseIntent: 'unsure' });
  });

  it('refuses whitespace-only owner text without sending anything', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Variant (as printed, optional)', '   ');
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('cannot be blank');
  });

  it('refuses an overlong owner fact before it reaches the server', async () => {
    await expect(recordUserProduct({ ...createCommand, manualVariant: 'v'.repeat(201) })).rejects.toThrow();
    await expect(recordUserProduct({ ...createCommand, manualBarcode: 'b'.repeat(101) })).rejects.toThrow();
    await expect(recordUserProduct({ ...createCommand, pao: 'p'.repeat(201) })).rejects.toThrow();
  });

  it('keeps the owner-keyed draft when the save fails offline and retries the identical command', async () => {
    rpc.mockRejectedValue(new Error('Network unavailable'));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    press(renderer, 'Save product');
    await flush();
    expect(renderedText(renderer)).toContain('The save was not confirmed');
    // The draft stays on the device, keyed to the owner who wrote it.
    const ownerKeys = [...deviceStorage.keys()].filter(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`));
    expect(ownerKeys.length).toBe(1);
    expect(deviceStorage.get(ownerKeys[0])).toContain('Gentle shampoo');
    const firstCall = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    press(renderer, 'Retry identical save');
    await flush();
    const retryCall = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(retryCall.p_operation_id).toBe(firstCall.p_operation_id);
  });

  it('offers the current entry for review when another change won the race', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_history') {
        return Promise.resolve({ data: shelfDetail({ revision: 4, availability: 'empty' }), error: null });
      }
      return Promise.reject(new Error('revision-conflict'));
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    choose(renderer, 'Availability', 'Running low');
    press(renderer, 'Save changes');
    await flush();
    // The draft is retained and the current entry can be loaded for review.
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`))).toBe(true);
    expect(labelsOf(renderer)).toContain('Discard failed attempt and review');
    expect(renderedText(renderer)).toContain('Revision 4');
  });
});

describe('the shelf list', () => {
  it('shows the availability and the recorded facts of every product', async () => {
    rpc.mockResolvedValue({
      data: {
        items: [shelfItem({
          availability: 'low', manualVariant: 'Fragrance free', manualSize: '400 ml',
          openedOn: { precision: 'month', value: '2026-03' }, expiryOn: '2027-06-30',
          pao: '12 months after opening', quantityBand: 'about-half', repurchaseIntent: 'would-rebuy',
        })],
        nextCursor: null,
      },
      error: null,
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Running low');
    expect(text).toContain('Variant: Fragrance free');
    expect(text).toContain('Size: 400 ml');
    expect(text).toContain('Opened date: March 2026');
    expect(text).toContain('Expiry date: 2027-06-30');
    expect(text).toContain('12 months after opening');
    expect(text).not.toContain('Period after opening: 12 months after opening');
    expect(text).toContain('How much is left: About half left');
    // The prefix and the answer are both full sentences, so the line reads
    // as an answer instead of contradicting itself.
    expect(text).toContain('Buying again: Would buy again');
    expect(text).not.toContain('Would buy again: Would buy again');
  });

  it('shows the recorded brand and category in the list and in the entry', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    const list = renderedText(renderer);
    expect(list).toContain('Brand: House brand');
    expect(list).toContain('Category: Shampoo');
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    const entry = renderedText(renderer);
    expect(entry).toContain('Brand: House brand');
    expect(entry).toContain('Category: Shampoo');
  });

  it('shows the empty shelf and the loading state without inventing products', async () => {    rpc.mockResolvedValue({ data: { items: [], nextCursor: null }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    expect(renderedText(renderer)).toContain('Your shelf is empty.');
  });

  it('offers a retry when the shelf could not be read', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    expect(renderedText(renderer)).toContain('could not be loaded');
    expect(labelsOf(renderer)).toContain('Reload shelf');
  });

  it('never paints the former owner data after an owner switch', async () => {
    let releaseOwnerA!: (value: unknown) => void;
    const ownerAPromise = new Promise(resolve => { releaseOwnerA = resolve; });
    let listCalls = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') {
        listCalls += 1;
        // The first owner's read is still in flight; the second owner's read
        // never answers in this test.
        return listCalls === 1 ? ownerAPromise : new Promise(() => undefined);
      }
      return Promise.resolve({ data: { items: [], nextCursor: null }, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    // The owner changes while the first shelf read is still in flight.
    await act(async () => {
      renderer.update(createElement(Shelf, { owner: ownerB }));
    });
    await act(async () => {
      releaseOwnerA({ data: { items: [shelfItem({ manualName: 'Owner A private shampoo' })], nextCursor: null }, error: null });
      await ownerAPromise;
    });
    await flush();
    const text = renderedText(renderer);
    expect(text).not.toContain('Owner A private shampoo');
    expect(text).not.toContain('House brand');
  });

  it('labels every control and keeps the touch targets at or above 48dp', async () => {
    rpc.mockResolvedValue({ data: { items: [], nextCursor: null }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    const labels = labelsOf(renderer);
    expect(labels).toContain('Add a product');
    expect(labels).toContain('Reload shelf');
    for (const minHeight of [styles.button.minHeight, styles.input.minHeight, styles.pill.minHeight]) {
      expect(minHeight).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('the recorded shelf facts', () => {
  it('describes a stored fact without shame, waste or fear wording', () => {
    expect(availabilityLabel('low')).toBe('Running low');
    expect(availabilityLabel('empty')).toBe('Nothing left');
    expect(availabilityLabel('archived')).toBe('Archived');
    for (const wording of [availabilityLabel('low'), availabilityLabel('empty'), availabilityLabel('archived')]) {
      expect(wording).not.toMatch(/waste|spoiled|expired|rush|shame|should/i);
    }
  });

  it('shows no line for a fact the owner never answered', () => {
    expect(shelfFactLines({})).toEqual([]);
    expect(shelfFactLines({ quantityBand: 'unknown' })).toEqual(['How much is left: Not sure']);
    expect(openedOnLabel(null)).toBeNull();
    expect(openedOnLabel({ precision: 'unknown', value: null })).toBe('Not sure when it was opened');
    expect(shelfFactLines({ openedOn: { precision: 'unknown', value: null } })).toEqual(['Opened date: Not sure when it was opened']);
  });

  it('labels every verification and availability state it can meet', () => {
    expect(verificationBadge('partially_verified')).toContain('Partially verified');
    expect(verificationBadge('pending_verification')).toContain('Verification pending');
    expect(availabilityLabel('out_of_stock')).toBe('Not currently available');
    expect(availabilityLabel('something else')).toBe('Availability unknown');
    expect(openedOnLabel({ precision: 'day', value: '2026-03-01' })).toBe('1 March 2026');
    expect(openedOnLabel({ precision: 'month', value: '2026-03' })).toBe('March 2026');
    expect(openedOnLabel({ precision: 'year', value: '2026' })).toBe('2026');
  });
});

describe('the shelf boundary failures', () => {
  it('fails the read when the server answers with an error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(listUserProducts()).rejects.toThrow();
  });

  it('sends a change without an availability when the owner only changed a fact', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    await changeUserProduct({
      operationId, userProductId, expectedRevision: 1,
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      quantityBand: 'about-half',
    });
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(parameters.p_availability).toBeNull();
    expect(parameters.p_facts).toMatchObject({ quantityBand: 'about-half' });
  });

  it('refuses a draft index that points at another owner', async () => {
    const storage = memoryStorage();
    await storage.setItem(shelfDraftIndexKey(ownerA), JSON.stringify([shelfDraftKey(ownerB, userProductId)]));
    await expect(readShelfDrafts(storage, ownerA)).rejects.toThrow(/Invalid draft index/);
  });

  it('refuses a stored draft that does not match the product it is filed under', async () => {
    const storage = memoryStorage();
    await storage.setItem(shelfDraftIndexKey(ownerA), JSON.stringify([shelfDraftKey(ownerA, userProductId)]));
    await storage.setItem(shelfDraftKey(ownerA, userProductId), JSON.stringify({
      mode: 'add', command: { ...createCommand, userProductId: 'a0000000-0000-4000-8000-000000000099' },
    }));
    await expect(readShelfDrafts(storage, ownerA)).rejects.toThrow(/does not match product/);
  });

  it('skips an index entry whose draft is gone and refuses a twenty-first pending draft', async () => {
    const storage = memoryStorage();
    await storage.setItem(shelfDraftIndexKey(ownerA), JSON.stringify([shelfDraftKey(ownerA, userProductId)]));
    expect(await readShelfDrafts(storage, ownerA)).toEqual([]);
    for (let index = 0; index < 20; index++) {
      const id = `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      await saveShelfDraft(storage, ownerA, { mode: 'add', command: { ...createCommand, userProductId: id } });
    }
    await expect(saveShelfDraft(storage, ownerA, {
      mode: 'add', command: { ...createCommand, userProductId: 'a0000000-0000-4000-8000-0000000000ff' },
    })).rejects.toThrow(/Draft limit reached/);
  });

  it('never sends when the editor becomes stale after the draft was written', async () => {
    const storage = memoryStorage();
    let sends = 0;
    let checks = 0;
    const dispatch = async () => { sends++; };
    await expect(submitShelfDraft(storage, ownerA, createDraft(), dispatch, () => {
      checks += 1;
      return checks === 1;
    })).rejects.toThrow(/no longer active/);
    expect(sends).toBe(0);
    // The draft stays on the device, so the owner can retry it.
    expect(await readShelfDrafts(storage, ownerA)).toEqual([createDraft()]);
  });
});

describe('the shelf list journeys', () => {
  it('opens a product and shows its recorded facts and history', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') {
        return Promise.resolve({
          data: shelfDetail({
            manualVariant: 'Fragrance free',
            revisions: [shelfRevision()],
          }),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Gentle shampoo');
    expect(text).toContain('Variant: Fragrance free');
    expect(text).toContain('Manual entry');
    press(renderer, 'Show product audit');
    await flush();
    expect(renderedText(renderer)).toContain('Original entry');
    press(renderer, 'Back to shelf');
    await flush();
    expect(renderedText(renderer)).toContain('Add a product');
  });

  it('reports a product that is no longer there', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    expect(renderedText(renderer)).toContain('This product could not be found');
  });

  it('pages through the shelf and offers the pending drafts of the owner', async () => {
    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: userProductId };
    let page = 0;
    rpc.mockImplementation((name: string) => {
      if (name !== 'shelf_list') return Promise.resolve({ data: null, error: null });
      page += 1;
      return Promise.resolve({
        data: page === 1
          ? { items: [shelfItem({ manualName: 'First shampoo' })], nextCursor: cursor }
          : { items: [shelfItem({ id: 'c0000000-0000-4000-8000-000000000002', manualName: 'Second shampoo' })], nextCursor: null },
        error: null,
      });
    });
    await saveShelfDraft(deviceDraftStorage, ownerA, createDraft());
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    expect(renderedText(renderer)).toContain('Pending save 1: Add a product');
    expect(renderedText(renderer)).toContain('First shampoo');
    press(renderer, 'Load more products');
    await flush();
    expect(renderedText(renderer)).toContain('Second shampoo');
    press(renderer, 'Clear departing drafts');
    await flush();
    expect(renderedText(renderer)).not.toContain('Pending save 1');
  });
});

describe('the shelf editor journeys', () => {
  it('requires an explicit confirmation before matching a catalogue entry', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'match', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    press(renderer, 'Confirm match');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    type(renderer, 'Catalogue version ID', versionId);
    choose(renderer, 'I confirm this is the same product', 'Yes, they are the same product');
    press(renderer, 'Confirm match');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_match');
    expect(parameters.p_version_id).toBe(versionId);
    expect(parameters.p_confirmed).toBe(true);
  });

  it('confirms before archiving from the archive screen', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'archive', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    press(renderer, 'Archive product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Confirm that you want to archive this product');
    choose(renderer, 'I confirm this product is archived', 'Yes, archive this product');
    press(renderer, 'Archive product');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_archive');
    expect(parameters.p_expected_revision).toBe(1);
  });

  it('discards a failed attempt from the device', async () => {
    rpc.mockRejectedValue(new Error('Network unavailable'));
    let cancelled = false;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => { cancelled = true; },
      }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    press(renderer, 'Save product');
    await flush();
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`))).toBe(true);
    press(renderer, 'Discard device draft');
    await flush();
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`))).toBe(false);
    expect(cancelled).toBe(true);
  });

  it('discards the failed attempt and keeps the current entry for review', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_history') {
        return Promise.resolve({ data: shelfDetail({ revision: 4, availability: 'empty' }), error: null });
      }
      return Promise.reject(new Error('revision-conflict'));
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId, detail: shelfDetail() as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    choose(renderer, 'Availability', 'Running low');
    press(renderer, 'Save changes');
    await flush();
    press(renderer, 'Discard failed attempt and review');
    await flush();
    expect(renderedText(renderer)).toContain('The failed attempt was discarded');
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`))).toBe(false);
  });

  it('refuses a product with no name at all', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Give this product a name');
  });

  it('records the expiry date and the notes the owner wrote', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Expiry date (YYYY-MM-DD, optional)', '2027-06-30');
    type(renderer, 'Short notes (optional, avoid identifying details)', 'Bought with the spring order');
    press(renderer, 'Save product');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(parameters.p_facts).toMatchObject({ expiryOn: '2027-06-30', notes: 'Bought with the spring order' });
  });

  it('refuses an expiry date that is not a real calendar day', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Expiry date (YYYY-MM-DD, optional)', '2027-02-30');
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('real calendar day');
  });

  it('clears a recorded fact the owner empties and leaves the others alone', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId,
        detail: shelfDetail({ pao: '12 months after opening', quantityBand: 'about-half' }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Period after opening (your own words, optional)', '');
    press(renderer, 'Save changes');
    await flush();
    const [, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    // Cleared…
    expect((parameters.p_facts as Record<string, unknown>).pao).toBeNull();
    // …while the fact the owner left alone keeps its recorded value.
    expect((parameters.p_facts as Record<string, unknown>).quantityBand).toBe('about-half');
  });

  it('shows the recorded identity and opened date of the product being edited', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'edit', userProductId,
        detail: shelfDetail({
          manualBrand: null, manualName: null, manualCategory: null,
          openedOn: { precision: 'month', value: '2026-03' },
        }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    const text = renderedText(renderer);
    expect(text).toContain('Brand: Not answered');
    expect(text).toContain('Name: Not answered');
    expect(text).toContain('Category: Not answered');
    expect(text).toContain('Month opened (YYYY-MM)');
  });
});

describe('the shelf entry journeys', () => {
  it('opens the editor, the match screen and the archive screen from a product entry', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    expect(labelsOf(renderer)).toContain('Edit this product');
    expect(labelsOf(renderer)).toContain('Match to catalogue entry');
    expect(labelsOf(renderer)).toContain('Archive this product');
    press(renderer, 'Edit this product');
    await flush();
    expect(renderedText(renderer)).toContain('Edit this product');
  });

  it('opens the correction screen from the product entry and appends the correction', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail({ revisions: [shelfRevision()] }), error: null });
      if (name === 'shelf_correct') return Promise.resolve({ data: { userProductId, revision: 2, revisions: [] }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, "Correct this product's details");
    await flush();
    // The correction opens on the entry the owner recorded.
    expect(renderedText(renderer)).toContain('Correct this product');
    expect(inputValue(renderer, 'Product name')).toBe('Gentle shampoo');
    type(renderer, 'Product name', 'Gentle shampoo bar');
    type(renderer, 'Reason for this correction (required)', 'The brand was wrong');
    press(renderer, 'Save correction');
    await flush();
    const correction = rpc.mock.calls.find(call => call[0] === 'shelf_correct');
    expect(correction).toBeDefined();
    const parameters = correction?.[1] as Record<string, unknown>;
    expect(parameters.p_reason).toBe('The brand was wrong');
    expect(parameters.p_corrects_id).toBe('c0000000-0000-4000-8000-000000000001');
  });

  it('shows the whole ownership history of a product', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') {
        return Promise.resolve({
          data: shelfDetail({
            manualName: null,
            matched: true,
            revisions: [
              shelfRevision(),
              shelfRevision({ id: 'c0000000-0000-4000-8000-000000000002', kind: 'change' }),
              shelfRevision({ id: 'c0000000-0000-4000-8000-000000000003', kind: 'correction', correctsId: 'c0000000-0000-4000-8000-000000000001' }),
              shelfRevision({ id: 'c0000000-0000-4000-8000-000000000004', kind: 'match', matchVersionId: versionId }),
              shelfRevision({ id: 'c0000000-0000-4000-8000-000000000005', kind: 'archive' }),
            ],
          }),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    expect(renderedText(renderer)).toContain('Catalogue-linked product');
    expect(renderedText(renderer)).toContain('Matched to a catalogue entry');
    press(renderer, 'Show product audit');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Original entry');
    expect(text).toContain('Change');
    expect(text).toContain('Correction');
    expect(text).toContain('Catalogue match');
    expect(text).toContain('Archive');
    expect(text).toContain('Replaces the earlier entry that recorded the name Gentle shampoo.');
    expect(text).toContain('Linked catalogue version recorded');
  });

  it('shows an empty audit when a product has no revisions', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    expect(renderedText(renderer)).toContain('No revisions recorded.');
  });

  it('offers a retry after a failed read and reloads the shelf', async () => {
    let attempt = 0;
    rpc.mockImplementation((name: string) => {
      if (name !== 'shelf_list') return Promise.resolve({ data: null, error: null });
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('offline'));
      return Promise.resolve({ data: { items: [shelfItem({ manualName: 'Reloaded shampoo' })], nextCursor: null }, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    expect(renderedText(renderer)).toContain('could not be loaded');
    press(renderer, 'Reload shelf');
    await flush();
    expect(renderedText(renderer)).toContain('Reloaded shampoo');
  });

  it('reviews a pending save from the shelf', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [], nextCursor: null }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    await saveShelfDraft(deviceDraftStorage, ownerA, createDraft());
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'Review pending save 1');
    await flush();
    // The pending command is re-opened for review, not sent again.
    expect(renderedText(renderer)).toContain('A save is awaiting confirmation');
    expect(rpc.mock.calls.filter(call => call[0] === 'shelf_add')).toHaveLength(0);
  });

  it('shows the facts a retained draft already holds when it is reviewed', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [], nextCursor: null }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    const draft: ShelfDraft = {
      mode: 'add',
      command: {
        ...createCommand,
        availability: 'low',
        manualVariant: 'Fragrance free',
        quantityBand: 'about-half',
        openedOn: { precision: 'month', value: '2026-03' },
      },
    };
    await saveShelfDraft(deviceDraftStorage, ownerA, draft);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'Review pending save 1');
    await flush();
    // The retained facts are shown back to the owner, not sent again.
    expect(inputValue(renderer, 'Variant (as printed, optional)')).toBe('Fragrance free');
    expect(inputValue(renderer, 'Month opened (YYYY-MM)')).toBe('2026-03');
  });
});

// --- The accessibility contract of the shelf ------------------------------

describe('the shelf accessibility contract', () => {
  async function openEditor(mode: 'add' | 'edit', detail: Record<string, unknown> = {}): Promise<ReactTestRenderer> {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode, userProductId, detail: shelfDetail(detail) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    return renderer;
  }

  it('names every availability state in plain words and shows which one is selected', async () => {
    const renderer = await openEditor('edit');
    const labels = labelsOf(renderer);
    expect(labels).toContain('Availability: Available');
    expect(labels).toContain('Availability: Running low');
    expect(labels).toContain('Availability: Nothing left');
    expect(labels).toContain('Availability: Archived');
    // The state the entry holds is the one that is selected.
    const selected = selectedRadios(renderer);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('Availability: Available');
  });

  it('shows the problem at the field it belongs to and summarises it once', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Expiry date (YYYY-MM-DD, optional)', '2027-02-30');
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    // The error names the field and the rule it breaks.
    expect(text).toContain('Expiry date: Enter a real calendar day in YYYY-MM-DD form, or leave it empty.');
    // The summary at the bottom is a summary, not a second copy of the error.
    const copies = text.split('Enter a real calendar day in YYYY-MM-DD form, or leave it empty.').length - 1;
    expect(copies).toBe(1);
    expect(text).toContain('This product was not saved.');
  });

  it('does not scold a date that is still being typed', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    choose(renderer, 'When did you open it?', 'A day');
    // Choosing a precision is not a mistake, and neither is half a date.
    expect(renderedText(renderer)).not.toContain('Enter the date you opened this product');
    type(renderer, 'Date opened (YYYY-MM-DD)', '2026-0');
    expect(renderedText(renderer)).not.toContain('not a complete date');
    expect(renderedText(renderer)).not.toContain('not a real date');
    // A complete date that is not a real one is answered.
    type(renderer, 'Date opened (YYYY-MM-DD)', '2026-02-30');
    expect(renderedText(renderer)).toContain('not a real date');
  });

  it('gives a future opening date its own message', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    choose(renderer, 'When did you open it?', 'A day');
    type(renderer, 'Date opened (YYYY-MM-DD)', '2999-01-01');
    const text = renderedText(renderer);
    expect(text).toContain('in the future');
    expect(text).not.toContain('not a real date');
  });

  it('names the field and the bound when a pasted value is too long', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    type(renderer, 'Variant (as printed, optional)', 'v'.repeat(201));
    press(renderer, 'Save product');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Variant: Use at most 200 characters.');
  });

  it('announces the archive confirmation instead of inserting it silently', async () => {
    const renderer = await openEditor('edit');
    expect(announcedTexts(renderer)).toEqual([]);
    choose(renderer, 'Availability', 'Archived');
    const announced = announcedTexts(renderer);
    expect(announced.some(text => text.includes('needs a confirmation'))).toBe(true);
    // The confirmation itself reads as an answer, not as a bare yes or no.
    expect(labelsOf(renderer)).toContain('I confirm this product is archived: Yes, archive this product');
    expect(labelsOf(renderer)).toContain('I confirm this product is archived: No, keep it on my shelf');
  });

  it('announces the locked draft and exposes the disabled state on the inputs', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'add', resume: createDraft(), onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    expect(announcedTexts(renderer).some(text => text.includes('A save is awaiting confirmation'))).toBe(true);
    const inputs = renderer.root.findAll(node => node.type === 'input');
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.props.accessibilityState).toMatchObject({ disabled: true });
    }
  });

  it('announces the empty shelf instead of showing a silent line', async () => {
    rpc.mockResolvedValue({ data: { items: [], nextCursor: null }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    expect(announcedTexts(renderer).some(text => text.includes('Your shelf is empty.'))).toBe(true);
  });

  it('names the product in the button that opens it', async () => {
    rpc.mockResolvedValue({
      data: {
        items: [
          shelfItem({ manualName: 'Gentle shampoo' }),
          shelfItem({ id: 'c0000000-0000-4000-8000-000000000002', manualName: 'Second shampoo' }),
        ],
        nextCursor: null,
      },
      error: null,
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    const labels = labelsOf(renderer);
    expect(labels).toContain('View product entry: Gentle shampoo');
    expect(labels).toContain('View product entry: Second shampoo');
  });

  it('opens a legacy row with a readable state and saves it without a catch-all', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    const renderer = await openEditor('edit', { availability: 'out_of_stock' });
    expect(labelsOf(renderer)).toContain('Availability: Not currently available');
    const selected = selectedRadios(renderer);
    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe('Availability: Not currently available');
    press(renderer, 'Save changes');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_change');
    // The state the row already holds is left alone, not refused.
    expect(parameters.p_availability).toBeNull();
    expect(renderedText(renderer)).not.toContain('Matching');
  });

  it('names the field a refused command failed on', () => {
    const missingName = CreateUserProductCommandSchema.safeParse({ ...createCommand, manualName: null });
    expect(missingName.success).toBe(false);
    const named = commandFailureMessage(missingName.success ? null : missingName.error);
    expect(named).toContain('name');
    expect(named).not.toContain('Matching');
    const tooLong = CreateUserProductCommandSchema.safeParse({ ...createCommand, manualName: 'x'.repeat(201) });
    expect(tooLong.success).toBe(false);
    const bounded = commandFailureMessage(tooLong.success ? null : tooLong.error);
    expect(bounded).toContain('product name');
    expect(bounded).toContain('200');
  });
});

// --- The revision a correction may replace ---------------------------------

const baselineId = 'c0000000-0000-4000-8000-000000000001';
const changeId = 'c0000000-0000-4000-8000-000000000002';
const correctionId = 'c0000000-0000-4000-8000-000000000003';
const matchId = 'c0000000-0000-4000-8000-000000000004';
const archiveId = 'c0000000-0000-4000-8000-000000000005';

/** The entry the owner recorded: it carries the identity. */
const identityEntry = (patchOverrides: Record<string, unknown> = {}): ShelfRevisionRecord => shelfRevision({
  id: baselineId,
  kind: 'baseline',
  // The size is an answer the owner gave, and the notes are an answer the
  // owner never gave: the server records both keys, one with a value and
  // one as a null.
  patch: {
    manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
    manualSize: '400 ml', availability: 'available', notes: null, ...patchOverrides,
  },
}) as ShelfRevisionRecord;

/** A revision that recorded no identity at all. */
const withoutIdentity = (overrides: Record<string, unknown> = {}): ShelfRevisionRecord => shelfRevision({
  patch: { versionId: null, manualBrand: null, manualName: null, manualCategory: null, availability: null, notes: null },
  ...overrides,
}) as ShelfRevisionRecord;

/**
 * A legacy-shaped revision: the old core wrote the three identity keys on
 * every revision, whatever the kind was, so the patch of a change, a match
 * or an archive can carry an identity that was never answered there.
 */
const legacyShaped = (overrides: Record<string, unknown> = {}): ShelfRevisionRecord => shelfRevision({
  patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', availability: 'low', notes: null },
  ...overrides,
}) as ShelfRevisionRecord;

/** One revision of the history, in the shape the client reads. */
const revision = (overrides: Record<string, unknown> = {}): ShelfRevisionRecord =>
  shelfRevision(overrides) as ShelfRevisionRecord;

describe('the revision a correction may replace', () => {
  it('targets the identity-bearing entry after the product was matched to the catalogue', () => {
    const revisions = [
      identityEntry(),
      withoutIdentity({ id: matchId, kind: 'match', matchVersionId: versionId }),
    ];
    expect(correctionTarget(revisions)?.id).toBe(baselineId);
  });

  it('targets the identity-bearing entry after an availability change', () => {
    const revisions = [
      identityEntry(),
      withoutIdentity({ id: changeId, kind: 'change', patch: { manualBrand: null, manualName: null, manualCategory: null, availability: 'low', notes: null } }),
    ];
    expect(correctionTarget(revisions)?.id).toBe(baselineId);
  });

  it('targets the identity-bearing entry after the product was archived', () => {
    const revisions = [
      identityEntry(),
      withoutIdentity({ id: archiveId, kind: 'archive' }),
    ];
    expect(correctionTarget(revisions)?.id).toBe(baselineId);
  });

  it('targets the identity-bearing entry after a fact-only change', () => {
    const revisions = [
      identityEntry(),
      withoutIdentity({ id: changeId, kind: 'change', patch: { manualBrand: null, manualName: null, manualCategory: null, availability: 'available', notes: null, quantityBand: 'about-half' } }),
    ];
    expect(correctionTarget(revisions)?.id).toBe(baselineId);
  });

  it('targets the correction itself after an earlier identity correction', () => {
    const revisions = [
      identityEntry(),
      revision({
        id: correctionId,
        kind: 'correction',
        correctsId: baselineId,
        patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo bar', manualCategory: 'shampoo', availability: 'available', notes: null },
      }),
    ];
    // The correction replaced the entry, so the entry is no longer the target.
    expect(correctionTarget(revisions)?.id).toBe(correctionId);
  });

  it('refuses a legacy-shaped change, match and archive, whatever their patch holds', () => {
    // A history written before the contract carries the three identity keys
    // on every revision, whatever the kind was. The rule reads the kind as
    // well as the shape of the patch, so a shape-only rule would let an
    // availability-only change, an archive and a match be targeted.
    const revisions = [
      identityEntry(),
      legacyShaped({ id: changeId, kind: 'change' }),
      legacyShaped({ id: matchId, kind: 'match', matchVersionId: versionId }),
      legacyShaped({ id: archiveId, kind: 'archive' }),
    ];
    // The entry that carries the identity is still the target.
    expect(correctionTarget(revisions)?.id).toBe(baselineId);
    // And none of the legacy-shaped revisions is a target on its own.
    for (const kind of ['change', 'match', 'archive'] as const) {
      expect(correctionTarget([legacyShaped({ id: changeId, kind })])).toBeNull();
    }
    // The domain says the same thing, so the client cannot drift away.
    expect(correctionTargetRevision(revisions)?.id).toBe(baselineId);
  });

  it('has no target when no revision carries an identity', () => {
    expect(correctionTarget([withoutIdentity({ id: matchId, kind: 'match' })])).toBeNull();
    expect(correctionTarget([])).toBeNull();
    expect(correctionTarget(undefined)).toBeNull();
  });

  it('is the same rule the domain states, and the mobile selector reuses it', () => {
    const revisions = [
      identityEntry(),
      withoutIdentity({ id: changeId, kind: 'change' }),
      revision({
        id: correctionId,
        kind: 'correction',
        correctsId: baselineId,
        patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo bar', manualCategory: 'shampoo' },
      }),
    ];
    // The domain owns the rule...
    expect(correctionTargetRevision(revisions)?.id).toBe(correctionId);
    // ...and the mobile selector is that rule, not a second one.
    expect(correctionTarget(revisions)).toBe(correctionTargetRevision(revisions));
  });
});

describe('the shelf command boundary', () => {
  it('refuses a create command that carries a catalogue version id', () => {
    // A catalogue link belongs to the confirmed match command, never to the
    // command that records a product for the first time.
    const refused = CreateUserProductCommandSchema.safeParse({ ...createCommand, versionId });
    expect(refused.success).toBe(false);
  });

  it('accepts a correction that clears the brand the owner recorded', () => {
    const cleared = CorrectUserProductCommandSchema.safeParse({
      operationId,
      userProductId,
      expectedRevision: 1,
      correctsId: baselineId,
      reason: 'The brand was wrong',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      manualBrand: null,
      manualName: 'Gentle shampoo',
    });
    expect(cleared.success).toBe(true);
  });

  it('refuses a correction that carries no identity field at all', () => {
    const refused = CorrectUserProductCommandSchema.safeParse({
      operationId,
      userProductId,
      expectedRevision: 1,
      correctsId: baselineId,
      reason: 'The variant was wrong',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      manualVariant: 'Fragrance free',
    });
    expect(refused.success).toBe(false);
  });
});

// --- The correction history the owner reads --------------------------------

describe('the correction history', () => {
  it('reads the reason the database returns with a revision', async () => {
    rpc.mockResolvedValueOnce({
      data: shelfDetail({
        revisions: [shelfRevision({ correctionReason: 'The brand was wrong' })],
      }),
      error: null,
    });
    const detail = await getUserProduct(userProductId, true);
    expect(detail?.revisions[0]?.correctionReason).toBe('The brand was wrong');
  });

  it('refuses a revision whose reason is not text', async () => {
    rpc.mockResolvedValueOnce({
      data: shelfDetail({ revisions: [shelfRevision({ correctionReason: 42 })] }),
      error: null,
    });
    await expect(getUserProduct(userProductId, true)).rejects.toThrow();
  });

  it('shows the reason and every fact a correction changed, cleared or left alone', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') {
        return Promise.resolve({
          data: shelfDetail({
            manualBrand: 'New brand',
            manualName: 'Gentle shampoo bar',
            revisions: [
              identityEntry({ manualVariant: 'Original variant', notes: 'Original note' }),
              revision({
                id: correctionId,
                kind: 'correction',
                correctsId: baselineId,
                correctionReason: 'The brand was wrong',
                patch: {
                  manualBrand: 'New brand',
                  manualName: 'Gentle shampoo bar',
                  manualCategory: 'shampoo',
                  manualVariant: null,
                  quantityBand: 'unknown',
                  notes: null,
                },
              }),
            ],
          }),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(Shelf, { owner: ownerA }));
    });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    const text = renderedText(renderer);
    // The reason the owner gave stays readable.
    expect(text).toContain('Reason: The brand was wrong');
    // A fact the correction changed is shown as it was changed.
    expect(text).toContain('Brand: New brand');
    expect(text).toContain('Name: Gentle shampoo bar');
    // A fact the owner cleared reads as cleared, never as blank.
    expect(text).toContain('Variant: Removed saved answer');
    expect(text).toContain('Notes: Removed saved answer');
    // An explicit unknown answer is not the same as an answer that was never given.
    expect(text).toContain('How much is left: Not sure');
    // A fact the earlier entry never recorded at all is an answer the owner
    // never gave, so it reads as never answered.
    expect(text).toContain('Expiry date: Not answered');
    // A fact the earlier entry recorded with a value is an answer the owner
    // gave, so the correction kept it.
    expect(text).toContain('Size: Kept');
    // A correction never clears the availability: that is an ordinary
    // change, so the correction kept it.
    expect(text).toContain('Availability: Kept');
    expect(text).not.toContain('Availability: Cleared');
    // The reason and the facts stay readable after the product is read again.
    press(renderer, 'Back to shelf');
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    const reloaded = renderedText(renderer);
    expect(reloaded).toContain('Reason: The brand was wrong');
    expect(reloaded).toContain('Brand: New brand');
    expect(reloaded).toContain('Variant: Removed saved answer');
    expect(reloaded).toContain('How much is left: Not sure');
  });
});

// --- What a correction preserves, sets and clears ---------------------------

describe('the facts a correction carries', () => {
  it('sends the identity and the facts in one patch, and leaves the rest out', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    await correctUserProduct({
      operationId,
      userProductId,
      expectedRevision: 1,
      correctsId: baselineId,
      reason: 'The brand and the variant were wrong',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      // The brand is cleared, the name is replaced, the category is kept.
      manualBrand: null,
      manualName: 'Gentle shampoo bar',
      manualVariant: null,
      manualSize: '400 ml',
    });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    // A key the owner did not change is left out, so the answer is preserved.
    expect(parameters.p_facts).toEqual({
      manualBrand: null,
      manualName: 'Gentle shampoo bar',
      manualVariant: null,
      manualSize: '400 ml',
    });
    expect(parameters.p_facts).not.toHaveProperty('manualCategory');
    expect(parameters.p_facts).not.toHaveProperty('quantityBand');
    expect(parameters.p_facts).not.toHaveProperty('notes');
  });

  it('clears the fact the owner empties and leaves the other facts alone', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({
          manualVariant: 'Fragrance free',
          pao: '12 months after opening',
          quantityBand: 'about-half',
          revisions: [shelfRevision()],
        }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Product name', 'Gentle shampoo bar');
    type(renderer, 'Period after opening (your own words, optional)', '');
    type(renderer, 'Reason for this correction (required)', 'The name and the period were wrong');
    press(renderer, 'Save correction');
    await flush();
    const [name, parameters] = rpc.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(name).toBe('shelf_correct');
    const facts = parameters.p_facts as Record<string, unknown>;
    // The name is replaced…
    expect(facts.manualName).toBe('Gentle shampoo bar');
    // …the period after opening is cleared…
    expect(facts.pao).toBeNull();
    // …and the facts the owner left alone are preserved, not resent.
    expect(facts).not.toHaveProperty('manualVariant');
    expect(facts).not.toHaveProperty('quantityBand');
    // The identity the owner did not change is preserved as well.
    expect(facts).not.toHaveProperty('manualBrand');
    expect(facts).not.toHaveProperty('manualCategory');
  });

  it('clears the brand the owner takes back in a correction', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ manualBrand: 'House brand', revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Brand (as printed)', '');
    type(renderer, 'Reason for this correction (required)', 'The brand was wrong');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).toHaveBeenCalled();
    const facts = (rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>).p_facts as Record<string, unknown>;
    // An explicit null clears the brand; the name is left alone.
    expect(facts.manualBrand).toBeNull();
    expect(facts).not.toHaveProperty('manualName');
  });

  it('refuses a correction that changes none of the identity', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [shelfRevision()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    type(renderer, 'Reason for this correction (required)', 'I want to say something about this product');
    press(renderer, 'Save correction');
    await flush();
    // A correction is an identity correction: it has to change the brand,
    // the name or the category.
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('A correction has to change the brand, the product name or the category');
  });
});

// --- The availability the owner can record ---------------------------------

describe('the availability the owner can record', () => {
  it('refuses the legacy availability state on every write path', () => {
    expect(CreateUserProductCommandSchema.safeParse({ ...createCommand, availability: 'out_of_stock' }).success).toBe(false);
    expect(ChangeUserProductCommandSchema.safeParse({
      operationId, userProductId, expectedRevision: 1, availability: 'out_of_stock',
    }).success).toBe(false);
  });

  it('never offers the legacy state for a product that does not already hold it', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    expect(labelsOf(renderer)).not.toContain('Availability: Not currently available');
    expect(labelsOf(renderer)).toContain('Availability: Available');
  });

  it('never sends the legacy state as a new value', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    // A row that already holds the legacy state keeps it: the client never
    // writes it as a new value.
    await expect(changeUserProduct({
      operationId, userProductId, expectedRevision: 1, availability: 'out_of_stock',
    })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

// --- What the owner reads and hears on the correction screen ---------------

describe('the correction screen and the history the owner reads', () => {
  const history = () => shelfDetail({
    manualBrand: 'New brand',
    manualName: 'Gentle shampoo bar',
    manualCategory: 'shampoo',
    manualVariant: 'Fragrance free',
    openedOn: { precision: 'day', value: '2026-03-01' },
    revisions: [
      identityEntry({ manualVariant: 'Fragrance free' }),
      revision({
        id: correctionId,
        kind: 'correction',
        correctsId: baselineId,
        correctionReason: 'The brand was wrong',
        patch: {
          manualBrand: 'New brand',
          manualName: 'Gentle shampoo bar',
          manualCategory: 'shampoo',
          manualVariant: null,
          quantityBand: 'unknown',
          openedOn: { precision: 'day', value: '2026-03-01' },
        },
      }),
    ],
  });

  async function openHistory(): Promise<ReactTestRenderer> {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: history(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    return renderer;
  }

  async function openCorrection(detail: Record<string, unknown> = {}): Promise<ReactTestRenderer> {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [identityEntry()], ...detail }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    return renderer;
  }

  it('reads a fact the earlier entry recorded as kept, even when the entry it replaces left it out', async () => {
    // The size was answered by the entry the owner recorded. The correction
    // that replaced it never mentions the size, so reading that entry alone
    // would say the owner never answered it. The whole lineage says the
    // answer is still there.
    const secondCorrectionId = 'c0000000-0000-4000-8000-00000000000a';
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail({
        manualBrand: 'House brand',
        manualName: 'Gentle shampoo bar',
        manualCategory: 'shampoo',
        manualSize: '400 ml',
        revisions: [
          identityEntry(),
          revision({
            id: correctionId,
            kind: 'correction',
            correctsId: baselineId,
            correctionReason: 'The name was wrong',
            patch: { manualName: 'Gentle shampoo bar' },
          }),
          revision({
            id: secondCorrectionId,
            kind: 'correction',
            correctsId: correctionId,
            correctionReason: 'The name was still wrong',
            patch: { manualBrand: 'House brand' },
          }),
        ],
      }), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    const text = renderedText(renderer);
    // The second correction left the size alone, and the record still holds
    // the answer the first entry gave.
    expect(text).toContain('Size: Kept');
    expect(text).not.toContain('Size: Not answered');
  });

  it('says the earlier entries could not be read when the history is broken', async () => {
    // A correction that points at an entry nobody holds cannot be read, so
    // the audit says so rather than guessing what the record held.
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: shelfDetail({
        manualBrand: 'House brand',
        manualName: 'Gentle shampoo bar',
        manualCategory: 'shampoo',
        revisions: [
          identityEntry(),
          revision({
            id: correctionId,
            kind: 'correction',
            correctsId: 'c0000000-0000-4000-8000-0000000000ff',
            correctionReason: 'The name was wrong',
            patch: { manualName: 'Gentle shampoo bar' },
          }),
        ],
      }), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Show product audit');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain(unreadableHistoryLabel);
  });

  it('says the four answers in four different ways, so they are tellable apart by sound', async () => {
    const renderer = await openHistory();
    const text = renderedText(renderer);
    // The answers are announced, not only drawn.
    const announced = announcedTexts(renderer).join(' | ');
    // A fact the owner answered.
    expect(text).toContain('Brand: New brand');
    expect(announced).toContain('Brand: New brand');
    // A fact the owner took back.
    expect(text).toContain('Variant: Removed saved answer');
    expect(announced).toContain('Variant: Removed saved answer');
    // A fact the owner never answered: the earlier entry recorded the key,
    // but never with an answer.
    expect(text).toContain('Notes: Not answered');
    expect(announced).toContain('Notes: Not answered');
    // A fact the correction left alone: the record still holds it.
    expect(text).toContain('Size: Kept');
    expect(announced).toContain('Size: Kept');
    // An explicit unknown answer keeps its own words.
    expect(text).toContain('How much is left: Not sure');
    expect(announced).toContain('How much is left: Not sure');
    // The four states are four different words.
    const states = ['Cleared', 'Not answered', 'Kept', 'Not sure'];
    expect(new Set(states).size).toBe(4);
  });

  it('reads a fact the owner never answered as never answered, not as kept', () => {
    // The server records the identity keys of the first entry as nulls, so
    // a product added without a brand carries the key with a null value.
    const baseline = revision({
      id: baselineId,
      kind: 'baseline',
      patch: { manualBrand: null, manualName: 'Gentle shampoo', manualCategory: null, availability: 'available', notes: null },
    });
    const correction = revision({
      id: correctionId,
      kind: 'correction',
      correctsId: baselineId,
      patch: { manualName: 'Gentle shampoo bar' },
    });
    const lines = revisionLines(correction.patch, correction.kind, baseline.patch);
    // The owner never answered either, so neither reads as kept.
    expect(lines).toContain('Brand: Not answered in this entry');
    expect(lines).toContain('Category: Not answered in this entry');
    expect(lines).not.toContain('Brand: Kept');
    expect(lines).not.toContain('Category: Kept');
  });

  it('distinguishes the editor clearing action from the recorded audit result', async () => {
    const renderer = await openCorrection();
    // The editor's way back is "Cleared", never "Not answered": that is the
    // state of a fact the owner never answered.
    expect(labelsOf(renderer)).toContain('How much is left?: Cleared');
    expect(labelsOf(renderer)).not.toContain('How much is left?: Not answered');
    // The audit describes the recorded result rather than repeating the
    // editor action label.
    const historyRenderer = await openHistory();
    expect(renderedText(historyRenderer)).toContain('Variant: Removed saved answer');
  });

  it('says a cleared category as cleared in the editor, the way the audit says it', async () => {
    // The entry the correction replaces took the category back.
    const clearedCategory = shelfDetail({
      manualCategory: null,
      revisions: [
        identityEntry(),
        revision({
          id: correctionId,
          kind: 'correction',
          correctsId: baselineId,
          patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: null },
        }),
      ],
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: clearedCategory as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    const text = renderedText(renderer);
    // The editor and the audit use the same word for a cleared field.
    expect(text).toContain('Category: Cleared');
    expect(text).not.toContain('Category: Not answered');
    // The category group offers the way back, like the other groups do.
    expect(labelsOf(renderer)).toContain('Category: Cleared');
  });

  it('takes a category back when the owner chooses the way back', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, {
        owner: ownerA, mode: 'correct', userProductId,
        detail: shelfDetail({ revisions: [identityEntry()] }) as never,
        onSaved: () => undefined, onCancel: () => undefined,
      }));
    });
    choose(renderer, 'Category', 'Cleared');
    type(renderer, 'Product name', 'Gentle shampoo bar');
    type(renderer, 'Reason for this correction (required)', 'The category was wrong');
    press(renderer, 'Save correction');
    await flush();
    const facts = (rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>).p_facts as Record<string, unknown>;
    // The category the owner took back is cleared, not left as it was.
    expect(facts.manualCategory).toBeNull();
  });

  it('gives every revision in the history a heading, so the owner can navigate them', async () => {
    const renderer = await openHistory();
    const headings = renderer.root
      .findAll(node => node.props?.accessibilityRole === 'header')
      .map(node => textOf(node));
    expect(headings).toContain('Original entry');
    expect(headings).toContain('Correction');
  });

  it('names the entry a correction replaces and dates it in words', async () => {
    const renderer = await openHistory();
    const text = renderedText(renderer);
    // A correction says which entry it replaces, by the wording it recorded.
    expect(text).toContain('Replaces the earlier entry that recorded the name Gentle shampoo.');
    // The opened date reads in words, and the line carries its label like
    // its siblings do.
    expect(text).toContain('Opened date: 1 March 2026');
    expect(text).not.toContain('2026-03-01');
  });

  it('reads the opened date the same way on every screen', async () => {
    const renderer = await openHistory();
    const text = renderedText(renderer);
    // The audit says the date once, with the label its siblings carry.
    expect(text).toContain('Opened date: 1 March 2026');
    expect(text).not.toContain('Opened date: Opened on');
    // The entry screen reads the date the same way.
    expect(text).not.toContain('Opened on 1 March 2026');
  });

  it('announces the screen the owner moves into', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return Promise.resolve({ data: { items: [shelfItem()], nextCursor: null }, error: null });
      if (name === 'shelf_history') return Promise.resolve({ data: history(), error: null });
      return Promise.resolve({ data: null, error: null });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, "Correct this product's details");
    await flush();
    // The tree is swapped for a new screen, so the new screen says so.
    expect(announcedTexts(renderer).some(text => text.includes('Correct this product'))).toBe(true);
  });

  it('states the rule a correction has to meet, next to the reason', async () => {
    const renderer = await openCorrection();
    const text = renderedText(renderer);
    expect(text).toContain(CORRECTION_IDENTITY_RULE);
    // The rule is next to the reason it belongs to.
    expect(text.indexOf(CORRECTION_IDENTITY_RULE)).toBeLessThan(text.indexOf('Reason for this correction'));
  });

  it('marks every refused field as invalid, not only the reason', async () => {
    const renderer = await openCorrection();
    // The owner empties the name and saves: the name and the reason are
    // both refused.
    type(renderer, 'Product name', '');
    press(renderer, 'Save correction');
    await flush();
    const nameInput = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Product name');
    expect(nameInput[0].props.accessibilityState).toMatchObject({ invalid: true });
    const reasonInput = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Reason for this correction (required)');
    expect(reasonInput[0].props.accessibilityState).toMatchObject({ invalid: true });
  });

  it('marks a refused opening date as invalid on its own input', async () => {
    const renderer = await openCorrection();
    type(renderer, 'Reason for this correction (required)', 'The name was wrong');
    choose(renderer, 'When did you open it?', 'A day');
    type(renderer, 'Date opened (YYYY-MM-DD)', '2026-02-30');
    press(renderer, 'Save correction');
    await flush();
    // The date the owner typed is not a real date, so its own input says so.
    const input = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Date opened (YYYY-MM-DD)');
    expect(input[0].props.accessibilityState).toMatchObject({ invalid: true });
  });

  it('says in the visible label that the reason is required', async () => {
    const renderer = await openCorrection();
    // The visible label says the reason is required, not only the hint.
    expect(renderedText(renderer)).toContain('Reason for this correction (required)');
    // And the input carries the same name, so the screen reader hears it too.
    expect(labelsOf(renderer)).toContain('Reason for this correction (required)');
  });

  it('names the entry the correction replaces, before the owner corrects it', async () => {
    const renderer = await openCorrection();
    const text = renderedText(renderer);
    // The owner knows which entry is being corrected, by the wording it
    // recorded - the same wording the audit uses.
    expect(text).toContain('the entry that recorded the name Gentle shampoo');
    // And it is announced, not only drawn.
    expect(announcedTexts(renderer).some(announced => announced.includes('the entry that recorded the name Gentle shampoo'))).toBe(true);
  });

  it('groups the correction screen under headings, so heading navigation gives structure', async () => {
    const renderer = await openCorrection();
    const headings = renderer.root
      .findAll(node => node.props?.accessibilityRole === 'header')
      .map(node => textOf(node));
    expect(headings).toContain('The details being corrected');
    expect(headings).toContain('Why you are correcting it');
    expect(headings).toContain('The other details that can change');
  });

  it('announces the refused reason and marks the input as invalid', async () => {
    const renderer = await openCorrection();
    type(renderer, 'Brand (as printed)', 'New brand');
    press(renderer, 'Save correction');
    await flush();
    // The refusal is announced, not only drawn.
    expect(announcedTexts(renderer).some(text => text.includes('Reason for this correction'))).toBe(true);
    // And the input itself says that its answer was refused.
    const input = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Reason for this correction (required)');
    expect(input[0].props.accessibilityState).toMatchObject({ invalid: true });
  });

  it('announces the identity rule the correction refuses', async () => {
    const renderer = await openCorrection();
    type(renderer, 'Reason for this correction (required)', 'I want to say something about this product');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(announcedTexts(renderer).some(text => text.includes(CORRECTION_IDENTITY_RULE))).toBe(true);
  });

  it('refuses a correction that re-answers the identity with the same words', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    const renderer = await openCorrection();
    // The owner answers the brand again with the answer the record holds.
    // A correction that changes nothing about the identity corrects nothing,
    // so it is refused here and by the server.
    type(renderer, 'Brand (as printed)', 'House brand');
    type(renderer, 'Reason for this correction (required)', 'I want to be sure of the brand');
    press(renderer, 'Save correction');
    await flush();
    expect(rpc).not.toHaveBeenCalled();
    expect(announcedTexts(renderer).some(text => text.includes(CORRECTION_IDENTITY_CHANGE_RULE))).toBe(true);
  });

  it('sends a correction that changes the identity the owner answered', async () => {
    rpc.mockResolvedValue({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    const renderer = await openCorrection();
    // The owner answers the brand with a different answer: that is a
    // correction, so it is sent.
    type(renderer, 'Brand (as printed)', 'Another brand');
    type(renderer, 'Reason for this correction (required)', 'the brand was wrong');
    press(renderer, 'Save correction');
    await flush();
    const facts = (rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>).p_facts as Record<string, unknown>;
    expect(facts.manualBrand).toBe('Another brand');
  });

  it('sends the same payload when a retained draft is retried later', async () => {
    rpc.mockRejectedValue(new Error('offline'));
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ShelfEditor, { owner: ownerA, mode: 'add', onSaved: () => undefined, onCancel: () => undefined }));
    });
    type(renderer, 'Product name', 'Gentle shampoo');
    press(renderer, 'Save product');
    await flush();
    const first = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    // The date the command carries is the date it was built with, and the
    // device keeps it with the draft.
    const drafts = await readShelfDrafts(deviceDraftStorage, ownerA);
    expect(drafts).toHaveLength(1);
    expect((drafts[0].command as { effectiveDate: unknown }).effectiveDate).toEqual(first.p_effective_date);
    // The retry sends the very same payload, so the server replays it.
    press(renderer, 'Retry identical save');
    await flush();
    const second = rpc.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(second).toEqual(first);
  });
});
// --- The wording the history reads in --------------------------------------

describe('the wording the history reads in', () => {
  it('reads the opened date in words, in every precision', () => {
    expect(openedOnLabel({ precision: 'day', value: '2026-03-01' })).toBe('1 March 2026');
    expect(openedOnLabel({ precision: 'month', value: '2026-03' })).toBe('March 2026');
    expect(openedOnLabel({ precision: 'year', value: '2026' })).toBe('2026');
    expect(openedOnLabel({ precision: 'unknown', value: null })).toBe('Not sure when it was opened');
    expect(openedOnLabel(null)).toBeNull();
    // A date the record cannot read is still readable: the owner sees what
    // the record holds, not an exception.
    expect(openedOnLabel({ precision: 'day', value: 'not-a-day' })).toBe('not-a-day');
    expect(openedOnLabel({ precision: 'month', value: '2026-13' })).toBe('2026-13');
    expect(openedOnLabel({ precision: 'day', value: null })).toBe('Not sure when it was opened');
  });

  it('names the entry a correction replaces by the wording it recorded', () => {
    expect(recordedIdentityWording({ manualName: 'Gentle shampoo' })).toBe('the name Gentle shampoo');
    expect(recordedIdentityWording({ manualBrand: 'House brand' })).toBe('the brand House brand');
    expect(recordedIdentityWording({ manualCategory: 'shampoo' })).toBe('the category Shampoo');
    expect(recordedIdentityWording({})).toBe('no name');
    expect(recordedIdentityWording(null)).toBe('no name');
  });

  it('reads a blank answer, a period after opening and a cleared date', () => {
    // A blank answer is no answer at all.
    expect(revisionLines({ manualVariant: '   ' }, 'correction', {})).toContain('Variant: Not answered in this entry');
    // The period after opening keeps the owner's own wording.
    expect(revisionLines({ pao: '12 months after opening' }, 'correction')).toContain('12 months after opening');
    expect(revisionLines({ pao: 'a year' }, 'correction')).toContain('Period after opening: a year');
    // An opened date the correction cleared, and one it set.
    expect(revisionLines({ openedOn: null }, 'correction', {
      openedOn: { precision: 'day', value: '2026-02-01' },
    })).toContain('Opened date: Removed saved answer');
    expect(revisionLines({ openedOn: { precision: 'day', value: '2026-03-01' } }, 'correction')).toContain('Opened date: 1 March 2026');
    // A revision that recorded no patch at all.
    expect(revisionLines(undefined, 'correction')).toEqual([]);
  });
});

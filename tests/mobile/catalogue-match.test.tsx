import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueMatch } from '../../apps/mobile/src/CatalogueMatch';
import { Shelf } from '../../apps/mobile/src/shelf';
import { saveShelfDraft } from '../../apps/mobile/src/shelf-drafts';
import { styles } from '../../apps/mobile/src/ui';
import { announcedTexts, flush, hasPressable, inputValue, labelsOf, press, renderedText, type as typeInto } from '../helpers/native-render';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: (text: string) => { spoken.push(text); } },
    Pressable: host('button'), ScrollView: host('main'), StyleSheet: { create: (value: unknown) => value },
    Text: host('span'), TextInput: host('input'), View: host('div'),
  };
});

const rpc = vi.hoisted(() => vi.fn());
const spoken = vi.hoisted(() => [] as string[]);
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

const ownerA = 'b0000000-0000-4000-8000-000000000001';
const ownerB = 'b0000000-0000-4000-8000-000000000002';
const userProductId = 'a0000000-0000-4000-8000-000000000002';
const V1 = 'a0000000-0000-4000-8000-0000000000f1';
const V2 = 'a0000000-0000-4000-8000-0000000000f2';
const V3 = 'a0000000-0000-4000-8000-0000000000f3';
const PRODUCT = 'a0000000-0000-4000-8000-0000000000a1';

const cand = (overrides: Record<string, unknown> = {}) => ({
  versionId: V1, productId: PRODUCT, brand: 'House Brand', productName: 'Gentle Shampoo', variant: null,
  category: 'shampoo', market: 'ZA', barcode: null, lifecycle: 'active', successorVersionId: null, ...overrides,
});
const C1 = cand();
const C2 = cand({ versionId: V2, variant: 'Travel 50 ml', barcode: '6001234567890' });
const C3 = cand({ versionId: V3, productId: 'a0000000-0000-4000-8000-0000000000a2', brand: 'Other Co', productName: 'Deep Mask', category: 'mask', lifecycle: 'retired', successorVersionId: V1 });

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: userProductId, revision: 1, availability: 'available', matched: false, matchConfirmed: false,
  manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
  manualVariant: null, manualSize: '250 ml', manualBarcode: null, openedOn: null, expiryOn: null, pao: null,
  quantityBand: null, repurchaseIntent: null, notes: null, versionId: null,
  revisions: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo' } }],
  ...overrides,
});

const answer = (data: unknown) => Promise.resolve({ data, error: null });
const results = (...items: unknown[]) => ({ results: items, truncated: false });
const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name);
const receipt = { userProductId, revision: 2, revisions: [] };

type Handlers = { onMatched: () => void; onCancel: () => void; onLeaveWithDraft: () => void; onStale: () => void };
const handlers = (): Handlers => ({ onMatched: vi.fn(), onCancel: vi.fn(), onLeaveWithDraft: vi.fn(), onStale: vi.fn() });

async function mount(extra: Record<string, unknown> = {}, h: Handlers = handlers(), owner = ownerA): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(CatalogueMatch, { owner, detail: detail() as never, ...h, ...extra }));
  });
  return renderer;
}
async function search(renderer: ReactTestRenderer, words = 'house shampoo') {
  typeInto(renderer, 'Search the catalogue', words);
  press(renderer, 'Search catalogue');
  await flush();
}

beforeEach(() => { rpc.mockReset(); deviceStorage.clear(); ids.counter = 0; spoken.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('searching the catalogue from a manual product', () => {
  it('starts empty, prefills words from the owner record and reads nothing until asked', async () => {
    const renderer = await mount();
    expect(inputValue(renderer, 'Search the catalogue')).toBe('House brand Gentle shampoo');
    expect(rpc).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    expect(text).toContain('Match to catalogue');
    expect(text).toContain('Choosing a result does not change your entry');
    expect(text).not.toContain('catalogue versions found');
  });

  it('refuses words that are too short, without asking the server', async () => {
    const renderer = await mount();
    await search(renderer, 'a');
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Type at least two characters to search.');
  });

  it('shows a loading state, then exact versions with unknown facts named', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const renderer = await mount();
    await search(renderer);
    expect(announcedTexts(renderer).join(' ')).toContain('Searching the catalogue');
    expect(calls('catalogue_search')[0][1]).toEqual({ p_query: 'house shampoo', p_limit: 10 });
    await act(async () => { release({ data: results(C1, C2, C3), error: null }); });
    await flush();
    const text = renderedText(renderer);
    expect(announcedTexts(renderer).join(' ')).toContain('3 catalogue versions found.');
    expect(text).toContain('House Brand: Gentle Shampoo');
    expect(text).toContain('Variant: Not recorded in the catalogue');
    expect(text).toContain('Variant: Travel 50 ml');
    expect(text).toContain('Barcode: 6001234567890');
    expect(text).toContain('Size: Not recorded in the catalogue');
    expect(text).toContain('Catalogue status: current version');
    expect(text).toContain('Catalogue status: retired version. A newer version exists in the catalogue.');
    expect(text).toContain('Catalogue code (last 8 characters): 000000f1');
    // Two versions of one product are told apart, never merged.
    expect(text).toContain('2 versions of this product are listed');
  });

  it('says when nothing matched and when the list was cut', async () => {
    rpc.mockImplementation(() => answer(results()));
    const renderer = await mount();
    await search(renderer);
    expect(announcedTexts(renderer).join(' ')).toContain('No catalogue versions matched.');
    rpc.mockImplementation(() => answer({ results: [C1], truncated: true }));
    await search(renderer, 'house');
    expect(renderedText(renderer)).toContain('More versions matched than are shown. Add a word to narrow the search.');
    expect(announcedTexts(renderer).join(' ')).toContain('1 catalogue version found.');
  });

  it('fails closed and offers a retry, writing nothing', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('boom: select secret from products')));
    const renderer = await mount();
    await search(renderer);
    const text = renderedText(renderer);
    expect(text).toContain('The catalogue search could not be completed. Nothing was changed. Try again.');
    expect(text).not.toContain('secret');
    rpc.mockImplementation(() => answer(results(C1)));
    press(renderer, 'Try search again');
    await flush();
    expect(renderedText(renderer)).toContain('House Brand: Gentle Shampoo');
    expect(calls('shelf_match')).toHaveLength(0);
  });

  it('refuses a response that leaks anything beyond identity and lifecycle', async () => {
    rpc.mockImplementation(() => answer(results({ ...C1, ingredients: { list: 'secret-ingredient' }, claims: ['Repairs overnight'] })));
    const renderer = await mount();
    await search(renderer);
    const text = renderedText(renderer);
    expect(text).not.toContain('secret-ingredient');
    expect(text).not.toContain('Repairs overnight');
    expect(text).toContain('could not be completed');
  });

  it('never shows results for words the owner has since changed', async () => {
    let releaseFirst!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }));
    const renderer = await mount();
    await search(renderer, 'house');
    typeInto(renderer, 'Search the catalogue', 'something else');
    await act(async () => { releaseFirst({ data: results(C1), error: null }); });
    await flush();
    expect(renderedText(renderer)).not.toContain('House Brand: Gentle Shampoo');
  });

  it('keeps only the newest search when two overlap', async () => {
    const pending: ((value: unknown) => void)[] = [];
    rpc.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    const renderer = await mount();
    await search(renderer, 'house');
    typeInto(renderer, 'Search the catalogue', 'house brand');
    press(renderer, 'Search catalogue');
    await flush();
    await act(async () => { pending[1]({ data: results(C2), error: null }); });
    await flush();
    await act(async () => { pending[0]({ data: results(C1), error: null }); });
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Variant: Travel 50 ml');
    expect(text).not.toContain('Catalogue code (last 8 characters): 000000f1');
    expect(announcedTexts(renderer).join(' ')).toContain('1 catalogue version found.');
  });

  it('clears results when the words change, so a stale list cannot be chosen from', async () => {
    rpc.mockImplementation(() => answer(results(C1)));
    const renderer = await mount();
    await search(renderer);
    typeInto(renderer, 'Search the catalogue', 'house brand');
    expect(labelsOf(renderer).some(label => label.startsWith('Compare with my record'))).toBe(false);
    expect(renderedText(renderer)).toContain('The search words changed. Search again to see matching products.');
  });
});

describe('comparing and confirming', () => {
  async function toCompare(extra: Record<string, unknown> = {}, h: Handlers = handlers()) {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1, C2, C3)) : answer(receipt)));
    const renderer = await mount(extra, h);
    await search(renderer);
    return { renderer, h };
  }

  it('selecting a result changes nothing and opens a side-by-side comparison', async () => {
    const { renderer } = await toCompare();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo (Travel 50 ml), barcode 6001234567890');
    await flush();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['catalogue_search']);
    const text = renderedText(renderer);
    expect(text).toContain('Compare with your record');
    expect(text).toContain('Your record');
    expect(text).toContain('Size: 250 ml');
    expect(text).toContain('Variant: Not answered');
    expect(text).toContain('Catalogue version');
    expect(text).toContain('Variant: Travel 50 ml');
    expect(text).toContain('How your record compares');
    expect(text).toContain('Brand: the same wording in both.');
    expect(text).toContain('Size: you recorded "250 ml"; the catalogue does not hold it, so it cannot be compared.');
    expect(text).toContain('Variant: the catalogue lists "Travel 50 ml"; you did not record one, so it cannot be compared.');
    expect(text).toContain('Nothing from the catalogue is copied into your record');
  });

  it('writes nothing until the explicit confirmation, then links the exact version once', async () => {
    const { renderer, h } = await toCompare();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    expect(calls('shelf_match')).toHaveLength(0);
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    const [call] = calls('shelf_match');
    expect(call[1]).toMatchObject({ p_user_product_id: userProductId, p_expected_revision: 1, p_version_id: V1, p_confirmed: true });
    expect(calls('shelf_match')).toHaveLength(1);
    expect(h.onMatched).toHaveBeenCalledTimes(1);
    // The sent command carries the identity of the version only: no catalogue text, claims or facts.
    expect(Object.keys(call[1] as object).sort()).toEqual(['p_confirmed', 'p_expected_revision', 'p_operation_id', 'p_user_product_id', 'p_version_id']);
    // The device draft is gone after the match was recorded.
    expect([...deviceStorage.keys()].filter(key => key.startsWith('strandcue-shelf-draft-'))).toEqual([]);
  });

  it('cancelling performs no write and keeps the entry as it is', async () => {
    const { renderer, h } = await toCompare();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Cancel and keep my entry as it is');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(calls('shelf_match')).toHaveLength(0);
    expect(deviceStorage.size).toBe(0);
  });

  it('lets the owner go back and choose a different version with no intermediate write', async () => {
    const { renderer, h } = await toCompare();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Back to search results');
    await flush();
    expect(renderedText(renderer)).toContain('Variant: Travel 50 ml');
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo (Travel 50 ml), barcode 6001234567890');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['catalogue_search', 'shelf_match']);
    expect(calls('shelf_match')[0][1]).toMatchObject({ p_version_id: V2 });
    expect(h.onMatched).toHaveBeenCalledTimes(1);
  });

  it('warns about a retired version without hiding it', async () => {
    const { renderer } = await toCompare();
    press(renderer, 'Compare with my record: Other Co: Deep Mask, retired version');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Catalogue status: retired version. A newer version exists in the catalogue.');
    expect(text).toContain('Category: different. You recorded "Shampoo"; the catalogue lists "Mask".');
    expect(hasPressable(renderer, 'Confirm match to this catalogue version')).toBe(true);
  });

  it('retries a failed match with the same command, so nothing is recorded twice', async () => {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('Network request failed'))));
    const h = handlers();
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('The match could not be saved. Nothing was linked yet.');
    expect(h.onMatched).not.toHaveBeenCalled();
    // The failed command is kept on the device and the screen locks on it.
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-shelf-draft-${ownerA}-`))).toBe(true);
    expect(hasPressable(renderer, 'Back to search results')).toBe(false);
    rpc.mockImplementation(() => answer(receipt));
    press(renderer, 'Try saving the match again');
    await flush(6);
    const sent = calls('shelf_match');
    expect(sent).toHaveLength(2);
    expect(sent[1][1]).toEqual(sent[0][1]);
    expect(h.onMatched).toHaveBeenCalledTimes(1);
  });

  it('discards a failed attempt and returns to the comparison with nothing linked', async () => {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('Network request failed'))));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    press(renderer, 'Delete the saved attempt');
    await flush(4);
    expect(deviceStorage.size).toBe(0);
    expect(renderedText(renderer)).toContain('The failed attempt was discarded. Nothing was linked.');
    expect(hasPressable(renderer, 'Back to search results')).toBe(true);
  });

  it('refuses to retry a stale entry and shows the latest one instead', async () => {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('revision-conflict'))));
    const h = handlers();
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('This product changed elsewhere');
    expect(hasPressable(renderer, 'Try saving the match again')).toBe(false);
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Show the latest entry');
    expect(h.onStale).toHaveBeenCalledTimes(1);
    expect(calls('shelf_match')).toHaveLength(1);
  });

  it('answers a refusal in plain words and lets the owner go back', async () => {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('version-not-found'))));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('That catalogue version is no longer available. Nothing was linked.');
    expect(deviceStorage.size).toBe(0);
    expect(hasPressable(renderer, 'Back to search results')).toBe(true);
  });

  it('does not offer a match to the version the entry is already linked to', async () => {
    rpc.mockImplementation(() => answer(results(C1)));
    const renderer = await mount({ detail: detail({ matched: true, matchConfirmed: true, versionId: V1, revision: 2 }) });
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    expect(renderedText(renderer)).toContain('Your entry is already linked to this catalogue version.');
    expect(hasPressable(renderer, 'Confirm match to this catalogue version')).toBe(false);
  });

  it('can rematch a matched entry; the choice is recorded as a new match, not an edit', async () => {
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C2)) : answer({ ...receipt, revision: 3 })));
    const renderer = await mount({ detail: detail({ matched: true, matchConfirmed: true, versionId: V1, revision: 2 }) });
    expect(renderedText(renderer)).toContain('Choose a different catalogue version');
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo (Travel 50 ml), barcode 6001234567890');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(calls('shelf_match')[0][1]).toMatchObject({ p_expected_revision: 2, p_version_id: V2 });
  });
});

describe('a pending confirmed match kept on the device', () => {
  const pendingDraft = () => ({
    mode: 'match' as const,
    command: { operationId: 'e0000000-0000-4000-8000-000000000001', userProductId, expectedRevision: 1, versionId: V2, confirmed: true as const },
  });

  it('shows the pending match and retries exactly the saved command', async () => {
    await saveShelfDraft({
      getItem: async key => deviceStorage.get(key) ?? null,
      setItem: async (key, value) => { deviceStorage.set(key, value); },
      removeItem: async key => { deviceStorage.delete(key); },
    }, ownerA, pendingDraft());
    rpc.mockImplementation(() => answer(receipt));
    const h = handlers();
    const renderer = await mount({ resume: pendingDraft() }, h);
    expect(renderedText(renderer)).toContain('A confirmed match is waiting to be saved.');
    expect(hasPressable(renderer, 'Search catalogue')).toBe(false);
    press(renderer, 'Try saving the match again');
    await flush(6);
    expect(calls('shelf_match')[0][1]).toEqual({
      p_operation_id: 'e0000000-0000-4000-8000-000000000001', p_user_product_id: userProductId,
      p_expected_revision: 1, p_version_id: V2, p_confirmed: true,
    });
    expect(h.onMatched).toHaveBeenCalledTimes(1);
  });

  it('can discard the pending match or leave it for later', async () => {
    const storage = {
      getItem: async (key: string) => deviceStorage.get(key) ?? null,
      setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
      removeItem: async (key: string) => { deviceStorage.delete(key); },
    };
    await saveShelfDraft(storage, ownerA, pendingDraft());
    const h = handlers();
    const renderer = await mount({ resume: pendingDraft() }, h);
    press(renderer, 'Back to shelf (keep for later)');
    expect(h.onLeaveWithDraft).toHaveBeenCalledTimes(1);
    expect(deviceStorage.size).toBeGreaterThan(0);
    press(renderer, 'Delete the saved attempt');
    await flush(4);
    expect(deviceStorage.size).toBe(0);
    expect(renderedText(renderer)).toContain('Nothing was linked.');
    expect(hasPressable(renderer, 'Search catalogue')).toBe(true);
  });
});

describe('owner isolation', () => {
  const shelfItem = { id: userProductId, revision: 1, availability: 'available', manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null };

  function shelfRpc(searchAnswer: () => Promise<unknown>) {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [shelfItem], nextCursor: null });
      if (name === 'shelf_history') return answer(detail());
      if (name === 'catalogue_search') return searchAnswer();
      return answer(receipt);
    });
  }

  it('clears results and a pending selection when the owner changes', async () => {
    shelfRpc(() => answer(results(C1)));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Match to catalogue');
    await flush();
    typeInto(renderer, 'Search the catalogue', 'house');
    press(renderer, 'Search catalogue');
    await flush();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    expect(renderedText(renderer)).toContain('Compare with your record');
    await act(async () => { renderer.update(createElement(Shelf, { owner: ownerB })); });
    await flush();
    const text = renderedText(renderer);
    expect(text).not.toContain('Compare with your record');
    expect(text).not.toContain('House Brand: Gentle Shampoo');
    expect(labelsOf(renderer)).not.toContain('Confirm match to this catalogue version');
    expect(calls('shelf_match')).toHaveLength(0);
  });

  it('ignores a search that finishes after the owner changed', async () => {
    let release!: (value: unknown) => void;
    shelfRpc(() => new Promise(resolve => { release = resolve; }));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Match to catalogue');
    await flush();
    press(renderer, 'Search catalogue');
    await flush();
    await act(async () => { renderer.update(createElement(Shelf, { owner: ownerB })); });
    await act(async () => { release({ data: results(C1), error: null }); });
    await flush();
    expect(renderedText(renderer)).not.toContain('House Brand: Gentle Shampoo');
  });

  it('does not offer the match flow to an archived entry', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [{ ...shelfItem, availability: 'archived' }], nextCursor: null });
      return answer(detail({ availability: 'archived' }));
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    expect(labelsOf(renderer)).not.toContain('Match to catalogue');
    expect(labelsOf(renderer)).not.toContain('Choose a different catalogue match');
  });
});

describe('the Shelf journey', () => {
  const shelfItem = { id: userProductId, revision: 1, availability: 'available', manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null };

  it('moves from an unmatched product through confirmation to the matched detail', async () => {
    let matched = false;
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [shelfItem], nextCursor: null });
      if (name === 'shelf_history') {
        return answer(matched
          ? detail({ matched: true, matchConfirmed: true, versionId: V1, revision: 2, revisions: [...detail().revisions, { id: 'c0000000-0000-4000-8000-000000000002', kind: 'match', correctsId: null, matchVersionId: V1, patch: { versionId: V1 } }] })
          : detail());
      }
      if (name === 'catalogue_search') return answer(results(C1));
      matched = true;
      return answer(receipt);
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    expect(renderedText(renderer)).toContain('Manual entry — not matched to the catalogue.');
    press(renderer, 'Match to catalogue');
    await flush();
    press(renderer, 'Search catalogue');
    await flush();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(8);
    const text = renderedText(renderer);
    expect(text).toContain('Matched to a catalogue entry (confirmed). Original manual details kept.');
    expect(labelsOf(renderer)).toContain('Choose a different catalogue match');
    expect(labelsOf(renderer)).not.toContain('Match to catalogue');
    press(renderer, 'Show product audit');
    expect(renderedText(renderer)).toContain('Original entry');
    expect(renderedText(renderer)).toContain('Catalogue match');
  });

  it('cancelling returns to the unchanged product', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [shelfItem], nextCursor: null });
      return answer(detail());
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Match to catalogue');
    await flush();
    press(renderer, 'Cancel and keep my entry as it is');
    await flush();
    expect(renderedText(renderer)).toContain('Manual entry — not matched to the catalogue.');
    expect(calls('shelf_match')).toHaveLength(0);
  });

  it('reopens a pending match from the shelf list on the pending screen', async () => {
    await saveShelfDraft({
      getItem: async key => deviceStorage.get(key) ?? null,
      setItem: async (key, value) => { deviceStorage.set(key, value); },
      removeItem: async key => { deviceStorage.delete(key); },
    }, ownerA, { mode: 'match', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userProductId, expectedRevision: 1, versionId: V2, confirmed: true } });
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [shelfItem], nextCursor: null });
      return answer(detail());
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    expect(renderedText(renderer)).toContain('Pending save 1: Match to catalogue entry.');
    press(renderer, 'Review pending save 1');
    await flush(6);
    expect(renderedText(renderer)).toContain('A confirmed match is waiting to be saved.');
  });
});

describe('review hardening', () => {
  const storage = {
    getItem: async (key: string) => deviceStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
    removeItem: async (key: string) => { deviceStorage.delete(key); },
  };
  const matchDraft = { mode: 'match' as const, command: { operationId: 'e0000000-0000-4000-8000-000000000001', userProductId, expectedRevision: 1, versionId: V2, confirmed: true as const } };

  it('sends one command when Confirm is pressed twice before the first save settles', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : new Promise(resolve => { release = resolve; })));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    const confirmButton = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Confirm match to this catalogue version' && typeof node.props?.onPress === 'function')[0];
    await act(async () => { confirmButton.props.onPress(); confirmButton.props.onPress(); });
    await flush();
    expect(calls('shelf_match')).toHaveLength(1);
    await act(async () => { release({ data: receipt, error: null }); });
    await flush(6);
  });

  it('shows the latest entry when a resumed match turns out to be stale', async () => {
    await saveShelfDraft(storage, ownerA, matchDraft);
    rpc.mockImplementation(() => Promise.reject(new Error('revision-conflict')));
    const h = handlers();
    const renderer = await mount({ resume: matchDraft }, h);
    press(renderer, 'Try saving the match again');
    await flush(6);
    expect(renderedText(renderer)).toContain('This product changed elsewhere');
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Show the latest entry');
    expect(h.onStale).toHaveBeenCalledTimes(1);
  });

  it('tells look-alike versions apart by their catalogue code', async () => {
    rpc.mockImplementation(() => answer(results(C1, cand({ versionId: V3 }))));
    const renderer = await mount();
    await search(renderer);
    const labels = labelsOf(renderer).filter(label => label.startsWith('Compare with my record'));
    expect(new Set(labels).size).toBe(2);
    expect(labels[0]).toContain('catalogue code 000000f1');
  });

  it('never overwrites another saved command when a match is started', async () => {
    await saveShelfDraft(storage, ownerA, {
      mode: 'edit', command: { operationId: 'e0000000-0000-4000-8000-000000000002', userProductId, expectedRevision: 1, effectiveDate: { precision: 'day', value: '2026-03-01' }, availability: 'low' },
    });
    const item = { id: userProductId, revision: 1, availability: 'available', manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null };
    rpc.mockImplementation((name: string) => (name === 'shelf_list' ? answer({ items: [item], nextCursor: null }) : answer(detail())));
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerA })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    press(renderer, 'Match to catalogue');
    await flush();
    expect(renderedText(renderer)).toContain('This product has an unsent change saved on your device.');
    expect(hasPressable(renderer, 'Search catalogue')).toBe(false);
    expect(JSON.parse([...deviceStorage.entries()].find(([key]) => key.includes(userProductId))![1]).mode).toBe('edit');
  });
});

describe('accessibility and wording', () => {
  it('speaks each outcome once through the screen reader instead of relying on mounted text', async () => {
    rpc.mockImplementationOnce(() => answer(results(C1, C2)));
    const renderer = await mount();
    await search(renderer);
    expect(spoken).toEqual(['Searching the catalogue.', '2 catalogue versions found.']);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Back to search results');
    expect(spoken.slice(2)).toEqual(['Compare with your record.', 'Back to the search results. Nothing was changed.']);
    rpc.mockImplementationOnce(() => answer(results()));
    press(renderer, 'Search catalogue');
    await flush();
    expect(spoken.at(-1)).toBe('No catalogue versions matched.');
    rpc.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    press(renderer, 'Search catalogue');
    await flush();
    expect(spoken.at(-1)).toBe('The catalogue search could not be completed. Nothing was changed. Try again.');
  });

  it('keeps one primary button in place from the first tap, with a label that follows progress', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation((name: string) => (name === 'catalogue_search' ? answer(results(C1)) : new Promise(resolve => { release = resolve; })));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush();
    expect(labelsOf(renderer)).toContain('Saving the match');
    expect(labelsOf(renderer)).not.toContain('Cancel and keep my entry as it is');
    await act(async () => { release({ data: receipt, error: null }); });
    await flush(6);
  });

  const banned = /verified|recommend|\bsafe\b|safety|effective|efficacy|proven|best match|cures?\b|repairs?\b/i;

  it('labels every control, orders them naturally and keeps touch targets large', async () => {
    rpc.mockImplementation(() => answer(results(C1, C2)));
    const renderer = await mount();
    await search(renderer);
    const labels = labelsOf(renderer);
    expect(labels).toEqual(expect.arrayContaining(['Search the catalogue', 'Search catalogue', 'Cancel and keep my entry as it is']));
    // The search box comes before its button, the results before the way out.
    expect(labels.indexOf('Search the catalogue')).toBeLessThan(labels.indexOf('Search catalogue'));
    expect(labels.indexOf('Search catalogue')).toBeLessThan(labels.findIndex(label => label.startsWith('Compare with my record')));
    expect(labels.findIndex(label => label.startsWith('Compare with my record'))).toBeLessThan(labels.indexOf('Cancel and keep my entry as it is'));
    for (const minHeight of [styles.button.minHeight, styles.input.minHeight, styles.pill.minHeight]) expect(minHeight).toBeGreaterThanOrEqual(48);
    const headers = renderer.root.findAll(node => node.props?.accessibilityRole === 'header');
    expect(headers.length).toBeGreaterThanOrEqual(3);
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    const compareLabels = labelsOf(renderer);
    expect(compareLabels.indexOf('Confirm match to this catalogue version')).toBeLessThan(compareLabels.indexOf('Back to search results'));
    expect(compareLabels.indexOf('Back to search results')).toBeLessThan(compareLabels.indexOf('Cancel and keep my entry as it is'));
  });

  it('never uses verified, recommended, safe or efficacy language on any screen state', async () => {
    const seen: string[] = [];
    rpc.mockImplementation(() => answer(results(C1, C2, C3)));
    const renderer = await mount();
    seen.push(renderedText(renderer));
    await search(renderer);
    seen.push(renderedText(renderer));
    press(renderer, 'Compare with my record: Other Co: Deep Mask, retired version');
    await flush();
    seen.push(renderedText(renderer));
    rpc.mockImplementation(() => Promise.reject(new Error('Network request failed')));
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    seen.push(renderedText(renderer));
    for (const text of seen) expect(text).not.toMatch(banned);
  });
});

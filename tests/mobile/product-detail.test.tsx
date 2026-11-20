import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogueMatch } from '../../apps/mobile/src/CatalogueMatch';
import { ProductDetail } from '../../apps/mobile/src/ProductDetail';
import { Shelf } from '../../apps/mobile/src/shelf';
import { announcedTexts, flush, hasPressable, labelsOf, press, renderedText, type as typeInto, walk } from '../helpers/native-render';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: (text: string) => { spoken.push(text); }, setAccessibilityFocus: (tag: unknown) => { focused.push(String(tag)); } },
    findNodeHandle: (node: { name?: string } | null) => (node ? node.name ?? 'node' : null),
    Linking: { openURL: (url: string) => { opened.push(url); return linkFails.value ? Promise.reject(new Error('cannot open')) : Promise.resolve(); } },
    Pressable: host('button'), ScrollView: host('main'), StyleSheet: { create: (value: unknown) => value },
    Text: host('span'), TextInput: host('input'), View: host('div'),
  };
});

const rpc = vi.hoisted(() => vi.fn());
const spoken = vi.hoisted(() => [] as string[]);
const focused = vi.hoisted(() => [] as string[]);
const opened = vi.hoisted(() => [] as string[]);
const linkFails = vi.hoisted(() => ({ value: false }));
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
const PRODUCT = 'a0000000-0000-4000-8000-0000000000a1';
const E1 = 'a0000000-0000-4000-8000-0000000000e1';
const C1 = 'a0000000-0000-4000-8000-0000000000c1';

const identity = (versionId = V1, overrides: Record<string, unknown> = {}) => ({
  versionId, productId: PRODUCT, brand: 'House Brand', productName: 'Gentle Shampoo', variant: null, category: 'shampoo', market: 'ZA', barcode: null, ...overrides,
});
const detail = (overrides: Record<string, unknown> = {}, versionId = V1) => ({
  identity: identity(versionId),
  lifecycle: { state: 'active', successor: { state: 'none' } },
  formulationReference: { state: 'not_published' },
  directions: { state: 'not_published' },
  ingredients: { state: 'not_published' },
  claims: { state: 'not_published' },
  owner: null,
  ...overrides,
});
const evidence = (overrides: Record<string, unknown> = {}) => ({
  evidenceId: E1, sourceType: 'marketing', trustTier: 'T10', title: 'Launch page', publisher: 'House Brand', market: 'ZA', firstSeen: '2024-01-01', lastChecked: '2024-06-01',
  applicability: 'This exact version.', limitations: 'A promotional statement.', sourceUrl: 'https://example.test/launch', archivedUrl: null, excerpt: null, ...overrides,
});
const publishedClaims = (items: unknown[] = [{ claimId: C1, claimKey: 'smoothness', statement: 'Leaves hair feeling smoother.', evidence: [evidence()] }]) => ({ state: 'published', content: { items } });
const publishedDirections = {
  state: 'published', content: {
    routinePlacement: 'After shampoo', instructions: 'Apply to wet hair.', applicationOrder: 2, rinseMode: 'rinse-out', waitMinutes: 3,
    frequency: { count: 2, unit: 'week' }, activation: null, requiredTools: null, requiredConditions: null, incompatibilities: ['Product X'], limitations: null,
  },
};
const owner = (overrides: Record<string, unknown> = {}) => ({
  userProductId, revision: 2, availability: 'low', matched: true, matchConfirmed: true, manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
  manualVariant: null, manualSize: '250 ml', manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: 'Private note',
  revisions: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null }, { id: 'c0000000-0000-4000-8000-000000000002', kind: 'match', correctsId: null, matchVersionId: V1 }],
  ...overrides,
});

const answer = (data: unknown) => Promise.resolve({ data, error: null });
const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name);

async function mount(props: Record<string, unknown> = {}, onBack: () => void = () => undefined, ownerId = ownerA): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ProductDetail, { owner: ownerId, versionId: V1, userProductId: null, backLabel: 'search results', onBack, ...props }),
      { createNodeMock: element => ({ name: String((element.props as Record<string, unknown> | undefined)?.accessibilityRole ?? element.type) }) });
  });
  await flush();
  return renderer;
}

beforeEach(() => { rpc.mockReset(); spoken.length = 0; focused.length = 0; linkFails.value = false; opened.length = 0; deviceStorage.clear(); ids.counter = 0; });

describe('the product detail screen', () => {
  it('shows only a loading state until the publication gate has answered, then announces once', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('Loading product details…');
    expect(text).not.toContain('Exact catalogue identity');
    expect(text).not.toContain('Gentle Shampoo');
    expect(spoken).toEqual(['Loading product details.']);
    await act(async () => { release({ data: detail(), error: null }); });
    await flush();
    expect(spoken).toEqual(['Loading product details.', 'Product details loaded.']);
    expect(renderedText(renderer)).not.toContain('Loading product details…');
  });

  it('presents the exact identity and asks for the version only, with no owner context', async () => {
    rpc.mockImplementation(() => answer(detail({ identity: identity(V1, { variant: 'Travel 50 ml', barcode: '6001234567890' }) })));
    const renderer = await mount();
    expect(calls('catalogue_product_detail')[0][1]).toEqual({ p_version_id: V1, p_user_product_id: null });
    const text = renderedText(renderer);
    expect(text).toContain('Exact catalogue identity');
    for (const line of ['Brand: House Brand', 'Product: Gentle Shampoo', 'Variant: Travel 50 ml', 'Barcode: 6001234567890', 'Market: South Africa',
      'Size: Not recorded in the catalogue for this version', 'Reference code (last 8 characters): 000000f1']) expect(text).toContain(line);
    expect(text).toContain('Version status: current catalogue version.');
    expect(text).not.toContain('Your private record');
  });

  it('shows honest unpublished states, each with its own cause, and never a draft', async () => {
    rpc.mockImplementation(() => answer(detail({ directions: { state: 'not_published' }, claims: { state: 'under_review' }, ingredients: { state: 'withdrawn' } })));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('No published directions are available for this exact version.');
    expect(text).toContain('Claims for this version are under review and are not shown yet.');
    expect(text).toContain('Ingredients were published and later withdrawn. They are not shown.');
    expect(text).toContain('No formula reference is published for this version.');
    expect(text).not.toContain('Manual product not matched');
  });

  it('shows published directions field by field', async () => {
    rpc.mockImplementation(() => answer(detail({ directions: publishedDirections })));
    const text = renderedText(await mount());
    for (const line of ['Where it fits: After shampoo', 'Directions: Apply to wet hair.', 'Application order: step 2', 'Rinse-out or leave-in: Rinse-out', 'Wait time: 3 minutes',
      'How often: 2 times a week', 'Do not combine with: Product X', 'Needs activation: Not stated in the reviewed directions']) expect(text).toContain(line);
  });

  it('shows claims with their evidence collapsed, expandable, and tied to each claim', async () => {
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims() })));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('Leaves hair feeling smoother.');
    expect(renderedText(renderer)).not.toContain('Launch page');
    const toggle = () => renderer.root.findAll(node => node.props?.accessibilityLabel === 'Show evidence and limitations for: Leaves hair feeling smoother.' && typeof node.props?.onPress === 'function')[0]
      ?? renderer.root.findAll(node => node.props?.accessibilityLabel === 'Hide evidence and limitations for: Leaves hair feeling smoother.' && typeof node.props?.onPress === 'function')[0];
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: false });
    press(renderer, 'Show evidence and limitations for: Leaves hair feeling smoother.');
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: true });
    const text = renderedText(renderer);
    expect(text).toContain('Kind of source: Marketing statement, not independent evidence');
    expect(text).toContain('Source: Launch page');
    expect(text).toContain('Limits: A promotional statement.');
    expect(text).toContain('Applies to: This exact version.');
    press(renderer, 'Hide evidence and limitations for: Leaves hair feeling smoother.');
    expect(renderedText(renderer)).not.toContain('Launch page');
  });

  it('says when a published claim has no published source', async () => {
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims([{ claimId: C1, claimKey: 'smoothness', statement: null, evidence: [] }]) })));
    const renderer = await mount();
    press(renderer, 'Show evidence and limitations for: Claim 1');
    const text = renderedText(renderer);
    expect(text).toContain('No published source is available for this claim.');
    expect(text).toContain('The reviewed record gives no statement for this claim.');
  });

  it('opens a source link only when the owner asks, with a descriptive label', async () => {
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims() })));
    const renderer = await mount();
    press(renderer, 'Show evidence and limitations for: Leaves hair feeling smoother.');
    const links = renderer.root.findAll(node => typeof node.type === 'string' && node.props?.accessibilityRole === 'link');
    expect(links.length).toBe(1);
    expect(links[0].props.accessibilityLabel).toBe('Open source: Launch page, published by House Brand');
    expect(opened).toEqual([]);
    press(renderer, 'Open source: Launch page, published by House Brand');
    expect(opened).toEqual(['https://example.test/launch']);
  });

  it('shows ingredients as label text with a factual-only explanation and no interpretation', async () => {
    rpc.mockImplementation(() => answer(detail({ ingredients: { state: 'published', content: { text: 'Aqua, Keratin, Parfum' } } })));
    const text = renderedText(await mount());
    expect(text).toContain('Aqua, Keratin, Parfum');
    expect(text).toContain('Ingredient text is shown as printed on the label. It does not say whether the product will suit you or how it will work.');
    expect(text).not.toMatch(/protein overload|toxic|score|rating|suitable for|will repair|diagnos/i);
  });

  it('warns that a retired version is a historical one and never swaps in its successor', async () => {
    rpc.mockImplementation(() => answer(detail({ lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: V2, brand: 'House Brand', productName: 'Gentle Shampoo', variant: 'Reformulated' } } } })));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('Version status: retired version. This is a historical version, not the current formulation.');
    expect(text).toContain('A reviewed newer version is listed: House Brand: Gentle Shampoo (Reformulated). Your product stays linked to this version.');
    expect(text).toContain('Reference code (last 8 characters): 000000f1');
    expect(text).not.toContain('000000f2');
    expect(hasPressable(renderer, 'Open the newer version')).toBe(false);
    expect(spoken).toEqual(['Loading product details.', 'Product details loaded. This is a retired version.']);
  });

  it('keeps the owner record in its own section and only in a Shelf context', async () => {
    rpc.mockImplementation(() => answer(detail({ owner: owner() })));
    const renderer = await mount({ userProductId });
    expect(calls('catalogue_product_detail')[0][1]).toEqual({ p_version_id: V1, p_user_product_id: userProductId });
    const text = renderedText(renderer);
    expect(text).toContain('Your private record');
    for (const line of ['Status: Running low', 'Size you recorded: 250 ml', 'Your notes: Private note', 'Opened: Not provided by you', 'Linked to this catalogue version by you, after you confirmed it.']) expect(text).toContain(line);
    expect(text).toContain('Original entry');
    expect(text).toContain('Catalogue match');
    // The owner's wording never replaces the catalogue's.
    expect(text).toContain('Product: Gentle Shampoo');
  });

  it('refuses a response with internal or draft fields and shows nothing of it', async () => {
    rpc.mockImplementation(() => answer({ ...detail({ directions: { state: 'published', content: { instructions: 'DRAFT TEXT' } } }), reviewer: 'Someone' }));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).not.toContain('DRAFT TEXT');
    expect(text).not.toContain('Someone');
    expect(text).toContain('The product details could not be loaded. Nothing was changed. Try again.');
  });

  it('fails with a retry that reads again and writes nothing', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('The product details could not be loaded. Nothing was changed. Try again.');
    expect(spoken).toEqual(['Loading product details.', 'The product details could not be loaded. Nothing was changed. Try again.']);
    rpc.mockImplementation(() => answer(detail()));
    press(renderer, 'Try loading the product details again');
    await flush();
    expect(renderedText(renderer)).toContain('Exact catalogue identity');
    expect(spoken.slice(2)).toEqual(['Loading product details.', 'Product details loaded.']);
    expect(rpc.mock.calls.every(([name]) => name === 'catalogue_product_detail')).toBe(true);
  });

  it('tells a missing product from a failed read and offers no retry for it', async () => {
    rpc.mockImplementation(() => Promise.reject(new Error('not-found')));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('These product details are no longer available. Go back and choose again.');
    expect(hasPressable(renderer, 'Try loading the product details again')).toBe(false);
    expect(hasPressable(renderer, 'Back to search results')).toBe(true);
  });

  it('goes back to the screen it came from', async () => {
    rpc.mockImplementation(() => answer(detail()));
    const onBack = vi.fn();
    const renderer = await mount({ backLabel: 'your product' }, onBack);
    press(renderer, 'Back to your product');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ignores an answer that arrives after the owner changed or the screen closed', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const renderer = await mount();
    await act(async () => { renderer.unmount(); });
    await act(async () => { release({ data: detail(), error: null }); });
    await flush();
    expect(spoken).toEqual(['Loading product details.']);
  });

  it('reads again for a different version and never paints the earlier one', async () => {
    rpc.mockImplementation((name: string, params: { p_version_id: string }) => answer(detail({}, params.p_version_id)));
    const renderer = await mount();
    await act(async () => { renderer.update(createElement(ProductDetail, { owner: ownerA, versionId: V2, userProductId: null, backLabel: 'search results', onBack: () => undefined })); });
    await flush();
    expect(calls('catalogue_product_detail').map(call => (call[1] as { p_version_id: string }).p_version_id)).toEqual([V1, V2]);
    expect(renderedText(renderer)).toContain('Reference code (last 8 characters): 000000f2');
  });

  it('is accessible: one title, headings, labelled controls, large targets, no colour-only meaning', async () => {
    rpc.mockImplementation(() => answer(detail({ directions: publishedDirections, claims: publishedClaims(), owner: owner(), ingredients: { state: 'published', content: { text: 'Aqua' } } })));
    const renderer = await mount({ userProductId });
    const headers: string[] = [];
    walk(renderer.root, node => {
      if (typeof node.type === 'string' && node.props?.accessibilityRole === 'header') headers.push(node.children.filter(child => typeof child === 'string').join(''));
    });
    expect(headers.filter(header => header === 'Product details')).toHaveLength(1);
    expect(headers[0]).toBe('Product details');
    for (const heading of ['Exact catalogue identity', 'Version status', 'Directions', 'Claims and evidence', 'Ingredients', 'Your private record (only you can see this)']) expect(headers).toContain(heading);
    const unlabelled = renderer.root.findAll(node => typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel !== 'string');
    expect(unlabelled).toEqual([]);
    expect(labelsOf(renderer).some(label => /^[0-9a-f-]{36}$/i.test(label))).toBe(false);
    expect(renderedText(renderer)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    // Every state is carried by words: the unpublished sections also read without colour.
    expect(announcedTexts(renderer).join(' ')).not.toMatch(/undefined|null/);
  });

  it('uses no verified, recommended, safe, effective or personalised wording in any state', async () => {
    const banned = /verified|recommend|\bsafe\b|safety score|effective|efficacy|proven|best for you|suitable for you/i;
    const seen: string[] = [];
    for (const data of [
      detail(),
      detail({ directions: publishedDirections, claims: publishedClaims(), ingredients: { state: 'published', content: { text: 'Aqua' } }, owner: owner(), lifecycle: { state: 'retired', successor: { state: 'none' } } }),
      detail({ directions: { state: 'under_review' }, claims: { state: 'withdrawn' }, ingredients: { state: 'under_review' } }),
    ]) {
      rpc.mockImplementation(() => answer(data));
      const renderer = await mount({ userProductId: (data as { owner: unknown }).owner ? userProductId : null });
      if ((data as { claims: { state: string } }).claims.state === 'published') press(renderer, 'Show evidence and limitations for: Leaves hair feeling smoother.');
      seen.push(renderedText(renderer));
    }
    for (const text of seen) expect(text).not.toMatch(banned);
  });
});

describe('review hardening of the detail screen', () => {
  it('names a claim by its own statement, never by its internal key, and still shows a long statement in full', async () => {
    const long = 'Leaves hair feeling noticeably smoother and softer after one use when applied to wet hair as directed.';
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims([{ claimId: C1, claimKey: 'internal_slug_key', statement: long, evidence: [] }]) })));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).not.toContain('internal_slug_key');
    expect(labelsOf(renderer).some(label => label.includes('internal_slug_key'))).toBe(false);
    expect(text).toContain(long);
    expect(labelsOf(renderer).find(label => label.startsWith('Show evidence and limitations for: '))).toMatch(/…$/);
    const claimHeaders: string[] = [];
    walk(renderer.root, node => { if (typeof node.type === 'string' && node.props?.accessibilityRole === 'header') claimHeaders.push(node.children.join('')); });
    expect(claimHeaders.some(header => header.includes('Leaves hair'))).toBe(false);
  });

  it('says what kinds of source stand behind a claim before it is opened', async () => {
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims() })));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('Source kinds: Marketing statement, not independent evidence');
  });

  it('moves screen-reader focus to the status, then to the title, and again on retry', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('Network request failed')));
    const renderer = await mount();
    expect(focused.length).toBeGreaterThan(0);
    const afterFailure = focused.length;
    rpc.mockImplementation(() => answer(detail()));
    press(renderer, 'Try loading the product details again');
    await flush();
    expect(focused.length).toBeGreaterThan(afterFailure);
    expect(focused.at(-1)).toBe('header');
  });

  it('puts a retired version at the very top, before the identity', async () => {
    rpc.mockImplementation(() => answer(detail({ lifecycle: { state: 'retired', successor: { state: 'none' } } })));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text.indexOf('Retired version: this is a historical version, not the current formulation.')).toBeGreaterThan(-1);
    expect(text.indexOf('Retired version: this is a historical version')).toBeLessThan(text.indexOf('Exact catalogue identity'));
  });

  it('hints that a source link leaves the app, and words dates in full', async () => {
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims([{ claimId: C1, claimKey: 'k', statement: 'A claim.', evidence: [evidence({ archivedUrl: 'https://archive.test/x' })] }]) })));
    const renderer = await mount();
    press(renderer, 'Show evidence and limitations for: A claim.');
    const links = renderer.root.findAll(node => typeof node.type === 'string' && node.props?.accessibilityRole === 'link');
    expect(links.map(link => link.props.accessibilityHint)).toEqual(['Opens in your browser', 'Opens in your browser']);
    expect(labelsOf(renderer)).toContain('Open archived copy: Launch page, published by House Brand');
    expect(renderedText(renderer)).toContain('First seen 1 January 2024; last checked 1 June 2024');
  });

  it('says a matched entry was linked but not confirmed, instead of claiming it is not linked', async () => {
    rpc.mockImplementation(() => answer(detail({ owner: owner({ matchConfirmed: false }) })));
    const text = renderedText(await mount({ userProductId }));
    expect(text).toContain('Linked to this catalogue version, but the link was not confirmed.');
    expect(text).not.toContain('Not linked to this catalogue version.');
  });

  it('tells the owner once when a link cannot be opened, and a new read clears it', async () => {
    linkFails.value = true;
    rpc.mockImplementation(() => answer(detail({ claims: publishedClaims() })));
    const renderer = await mount();
    press(renderer, 'Show evidence and limitations for: Leaves hair feeling smoother.');
    expect(renderedText(renderer)).not.toContain('The link could not be opened.');
    press(renderer, 'Open source: Launch page, published by House Brand');
    await flush();
    expect(renderedText(renderer)).toContain('The link could not be opened. Nothing was changed.');
    expect(spoken.filter(text => text === 'The link could not be opened. Nothing was changed.')).toHaveLength(1);
    await act(async () => { renderer.update(createElement(ProductDetail, { owner: ownerA, versionId: V2, userProductId: null, backLabel: 'search results', onBack: () => undefined })); });
    await flush();
    expect(renderedText(renderer)).not.toContain('The link could not be opened.');
  });
});

describe('opening the detail from the match journey', () => {
  const candidate = (versionId: string, overrides: Record<string, unknown> = {}) => ({
    versionId, productId: PRODUCT, brand: 'House Brand', productName: 'Gentle Shampoo', variant: null, category: 'shampoo', market: 'ZA', barcode: null, lifecycle: 'active', successorVersionId: null, ...overrides,
  });
  const shelfDetail = (overrides: Record<string, unknown> = {}) => ({
    id: userProductId, revision: 1, availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
    manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: null, versionId: null,
    revisions: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualName: 'Gentle shampoo' } }], ...overrides,
  });
  const handlers = () => ({ onMatched: vi.fn(), onCancel: vi.fn(), onLeaveWithDraft: vi.fn(), onStale: vi.fn() });

  async function mountMatch() {
    rpc.mockImplementation((name: string) => {
      if (name === 'catalogue_search') return answer({ results: [candidate(V1), candidate(V2, { variant: 'Travel 50 ml' })], truncated: false });
      if (name === 'catalogue_product_detail') return answer(detail());
      return answer({ userProductId, revision: 2, revisions: [] });
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(CatalogueMatch, { owner: ownerA, detail: shelfDetail() as never, ...handlers() })); });
    typeInto(renderer, 'Search the catalogue', 'house shampoo');
    press(renderer, 'Search catalogue');
    await flush();
    return renderer;
  }

  it('opens from a search result with no owner context, and returns to the same results', async () => {
    const renderer = await mountMatch();
    press(renderer, 'View product details: House Brand: Gentle Shampoo');
    await flush();
    expect(calls('catalogue_product_detail')[0][1]).toEqual({ p_version_id: V1, p_user_product_id: null });
    expect(renderedText(renderer)).toContain('Exact catalogue identity');
    expect(renderedText(renderer)).not.toContain('Your private record');
    press(renderer, 'Back to search results');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('2 catalogue versions found.');
    expect(text).toContain('Variant: Travel 50 ml');
    expect(calls('shelf_match')).toHaveLength(0);
  });

  it('opens from the comparison and returns to it, writing nothing', async () => {
    const renderer = await mountMatch();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'View product details for this catalogue version');
    await flush();
    expect(renderedText(renderer)).toContain('Exact catalogue identity');
    press(renderer, 'Back to the comparison');
    await flush();
    expect(renderedText(renderer)).toContain('How your record compares');
    expect(hasPressable(renderer, 'Confirm match to this catalogue version')).toBe(true);
    expect(calls('shelf_match')).toHaveLength(0);
    expect(deviceStorage.size).toBe(0);
  });

  it('then lets the owner explicitly match after viewing the detail', async () => {
    const renderer = await mountMatch();
    press(renderer, 'View product details: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Back to search results');
    await flush();
    press(renderer, 'Compare with my record: House Brand: Gentle Shampoo');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(calls('shelf_match')).toHaveLength(1);
  });
});

describe('opening the detail from My Shelf', () => {
  const shelfItem = { id: userProductId, revision: 2, availability: 'low', manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: '250 ml', manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null };
  const shelfDetail = (overrides: Record<string, unknown> = {}) => ({
    ...shelfItem, matched: true, matchConfirmed: true, notes: 'Private note', versionId: V1,
    revisions: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualName: 'Gentle shampoo' } }], ...overrides,
  });

  async function openShelf(detailOverrides: Record<string, unknown> = {}, ownerId = ownerA) {
    rpc.mockImplementation((name: string) => {
      if (name === 'shelf_list') return answer({ items: [shelfItem], nextCursor: null });
      if (name === 'shelf_history') return answer(shelfDetail(detailOverrides));
      if (name === 'catalogue_product_detail') return answer(detail({ owner: owner() }));
      return answer({});
    });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Shelf, { owner: ownerId })); });
    await flush();
    press(renderer, 'View product entry: Gentle shampoo');
    await flush();
    return renderer;
  }

  it('opens the catalogue details of a matched product with the owner context, and returns to the product', async () => {
    const renderer = await openShelf();
    press(renderer, 'View product details');
    await flush();
    expect(calls('catalogue_product_detail')[0][1]).toEqual({ p_version_id: V1, p_user_product_id: userProductId });
    const text = renderedText(renderer);
    expect(text).toContain('Exact catalogue identity');
    expect(text).toContain('Your private record');
    press(renderer, 'Back to your product');
    await flush();
    expect(renderedText(renderer)).toContain('Matched to a catalogue entry (confirmed). Original manual details kept.');
    expect(calls('shelf_match')).toHaveLength(0);
  });

  it('offers no catalogue details for an unmatched manual product, which stays honest', async () => {
    const renderer = await openShelf({ matched: false, matchConfirmed: false, versionId: null });
    expect(labelsOf(renderer)).not.toContain('View product details');
    expect(renderedText(renderer)).toContain('Manual entry — not matched to the catalogue.');
    expect(calls('catalogue_product_detail')).toHaveLength(0);
  });

  it('clears the detail when the owner switches and ignores a late answer', async () => {
    let release!: (value: unknown) => void;
    const renderer = await openShelf();
    rpc.mockImplementation((name: string) => {
      if (name === 'catalogue_product_detail') return new Promise(resolve => { release = resolve; });
      if (name === 'shelf_list') return answer({ items: [], nextCursor: null });
      return answer({});
    });
    press(renderer, 'View product details');
    await flush();
    await act(async () => { renderer.update(createElement(Shelf, { owner: ownerB })); });
    await flush();
    await act(async () => { release({ data: detail({ owner: owner({ notes: 'Owner A private' }) }), error: null }); });
    await flush();
    const text = renderedText(renderer);
    expect(text).not.toContain('Owner A private');
    expect(text).not.toContain('Exact catalogue identity');
    expect(text).toContain('Your shelf is empty.');
  });

  it('shows a retired owned version as it was, with no successor replacing it', async () => {
    const renderer = await openShelf();
    rpc.mockImplementation((name: string) => {
      if (name === 'catalogue_product_detail') return answer(detail({ owner: owner(), lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: V2, brand: 'House Brand', productName: 'Gentle Shampoo', variant: 'Reformulated' } } } }));
      return answer({});
    });
    press(renderer, 'View product details');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('retired version. This is a historical version');
    expect(text).toContain('Your product stays linked to this version.');
    expect(text).toContain('Reference code (last 8 characters): 000000f1');
  });
});

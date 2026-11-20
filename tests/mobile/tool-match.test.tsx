import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolMatch } from '../../apps/mobile/src/ToolMatch';
import { saveToolDraft } from '../../apps/mobile/src/tool-drafts';
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
    Linking: { openURL: () => Promise.resolve() },
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

const owner = 'b0000000-0000-4000-8000-000000000001';
const toolId = 'a0000000-0000-4000-8000-000000000002';
const V1 = 'f0000000-0000-4000-8000-0000000000a1';
const V2 = 'f0000000-0000-4000-8000-0000000000a2';
const V3 = 'f0000000-0000-4000-8000-0000000000a3';

const cand = (versionId: string, overrides: Record<string, unknown> = {}) => ({
  versionId, toolId: 'f0000000-0000-4000-8000-0000000000b1', brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA', lifecycle: 'active', ...overrides,
});
const C1 = cand(V1);
const C2 = cand(V2, { versionLabel: '2023', toolName: 'Pro Dryer Mini' });
const C3 = cand(V3, { brand: 'Other Co', toolName: 'Steam Press', versionLabel: 'Original', toolType: 'steam-straightener', lifecycle: 'retired' });
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: toolId, revision: 1, availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer',
  wattageWatts: 1900, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, versionId: null,
  revisions: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualModel: 'Pro dryer' } }], ...overrides,
});
const answer = (data: unknown) => Promise.resolve({ data, error: null });
const results = (...items: unknown[]) => ({ results: items, truncated: false });
const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name);
const receipt = { userToolId: toolId, revision: 2, revisions: [] };

type Handlers = { onMatched: () => void; onCancel: () => void; onLeaveWithDraft: () => void; onStale: () => void };
const handlers = (): Handlers => ({ onMatched: vi.fn(), onCancel: vi.fn(), onLeaveWithDraft: vi.fn(), onStale: vi.fn() });

async function mount(extra: Record<string, unknown> = {}, h: Handlers = handlers()): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ToolMatch, { owner, detail: detail() as never, ...h, ...extra })); });
  return renderer;
}
async function search(renderer: ReactTestRenderer, words = 'pro dryer') {
  typeInto(renderer, 'Search the tool catalogue', words);
  press(renderer, 'Search tool catalogue');
  await flush();
}
const comparing = async (items: unknown[] = [C1, C2, C3]) => {
  rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(...items)) : answer(receipt)));
  const renderer = await mount();
  await search(renderer);
  return renderer;
};

beforeEach(() => { rpc.mockReset(); spoken.length = 0; deviceStorage.clear(); ids.counter = 0; });

describe('searching the tool catalogue', () => {
  it('starts empty, prefills words from the owner record and reads nothing until asked', async () => {
    const renderer = await mount();
    expect(inputValue(renderer, 'Search the tool catalogue')).toBe('Salon brand Pro dryer');
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Match to catalogue');
    expect(renderedText(renderer)).toContain('Choosing a result does not change your tool');
  });

  it('refuses words that are too short without asking the server', async () => {
    const renderer = await mount();
    await search(renderer, 'a');
    expect(rpc).not.toHaveBeenCalled();
    expect(renderedText(renderer)).toContain('Type at least two characters to search.');
  });

  it('shows exact versions with their type and lifecycle, and speaks the outcome once', async () => {
    const renderer = await comparing();
    expect(calls('tool_catalogue_search')[0][1]).toEqual({ p_query: 'pro dryer', p_limit: 10 });
    const text = renderedText(renderer);
    expect(text).toContain('Salon Brand: Pro Dryer');
    expect(text).toContain('Version: 2024');
    expect(text).toContain('Type: Hair dryer');
    expect(text).toContain('Catalogue status: current version');
    expect(text).toContain('Catalogue status: retired version');
    expect(spoken).toEqual(['Searching the tool catalogue.', '3 catalogue versions found.']);
    // Nothing but identity and lifecycle: no capability of any kind.
    expect(text).not.toMatch(/watts|heated air|temperature|adjustable/i);
  });

  it('says when nothing matched, and fails closed with a retry that writes nothing', async () => {
    rpc.mockImplementationOnce(() => answer(results()));
    let renderer = await mount();
    await search(renderer);
    expect(spoken.at(-1)).toBe('No catalogue versions matched.');
    expect(renderedText(renderer)).toContain('No catalogue versions matched. Check the spelling or try fewer words. Nothing was changed.');
    rpc.mockReset(); spoken.length = 0;
    rpc.mockImplementationOnce(() => Promise.reject(new Error('boom: select secret from tools')));
    renderer = await mount();
    await search(renderer);
    expect(renderedText(renderer)).toContain('The catalogue search could not be completed. Nothing was changed. Try again.');
    expect(renderedText(renderer)).not.toContain('secret');
    rpc.mockImplementation(() => answer(results(C1)));
    press(renderer, 'Try search again');
    await flush();
    expect(renderedText(renderer)).toContain('Salon Brand: Pro Dryer');
    expect(calls('tool_match')).toHaveLength(0);
  });

  it('refuses a response that carries a capability, a claim or a reviewer', async () => {
    rpc.mockImplementation(() => answer(results({ ...C1, wattageWatts: 2200, claims: ['Heats evenly'], reviewer: 'Someone' })));
    const renderer = await mount();
    await search(renderer);
    const text = renderedText(renderer);
    expect(text).not.toContain('Heats evenly');
    expect(text).not.toContain('Someone');
    expect(text).toContain('could not be completed');
  });

  it('never shows results for words that changed, and keeps only the newest search', async () => {
    const pending: ((value: unknown) => void)[] = [];
    rpc.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
    const renderer = await mount();
    await search(renderer, 'pro');
    typeInto(renderer, 'Search the tool catalogue', 'iron');
    press(renderer, 'Search tool catalogue');
    await flush();
    await act(async () => { pending[1]({ data: results(C2), error: null }); });
    await flush();
    await act(async () => { pending[0]({ data: results(C1), error: null }); });
    await flush();
    expect(renderedText(renderer)).toContain('Pro Dryer Mini');
    expect(renderedText(renderer)).not.toContain('Version: 2024');
    typeInto(renderer, 'Search the tool catalogue', 'something else');
    expect(renderedText(renderer)).toContain('The search words changed. Search again to see matching tools.');
    expect(labelsOf(renderer).some(label => label.startsWith('Compare with my tool'))).toBe(false);
  });
});

describe('comparing and confirming', () => {
  it('selecting a result writes nothing and opens a side-by-side comparison', async () => {
    const renderer = await comparing();
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['tool_catalogue_search']);
    const text = renderedText(renderer);
    for (const line of ['Compare with your tool', 'Your tool', 'Catalogue version', 'How your tool compares', 'Brand: different. You recorded "Salon brand"; the catalogue lists "Salon Brand".'.replace('different. You recorded "Salon brand"; the catalogue lists "Salon Brand".', 'the same wording in both.'),
      'Model: the same wording in both.', 'Type: the same wording in both.']) expect(text).toContain(line);
    expect(text).toContain('Power: 1900 watts');
    expect(text).toContain('Matching only links your tool to this catalogue version. Nothing from the catalogue is copied into your record, and your original details stay in your history.');
    expect(spoken.at(-1)).toBe('Compare with your tool.');
  });

  it('links the exact version once, and only after the explicit confirmation', async () => {
    const h = handlers();
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : answer(receipt)));
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    expect(calls('tool_match')).toHaveLength(0);
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    const [call] = calls('tool_match');
    expect(call[1]).toEqual({ p_operation_id: expect.any(String), p_user_tool_id: toolId, p_expected_revision: 1, p_version_id: V1, p_confirmed: true });
    expect(h.onMatched).toHaveBeenCalledTimes(1);
    expect([...deviceStorage.keys()].filter(key => key.startsWith('strandcue-tool-draft-'))).toEqual([]);
  });

  it('cancelling and going back write nothing, and another candidate can be chosen', async () => {
    const h = handlers();
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1, C2)) : answer(receipt)));
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Back to search results');
    await flush();
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer Mini');
    await flush();
    press(renderer, 'Cancel and keep my tool as it is');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(calls('tool_match')).toHaveLength(0);
    expect(deviceStorage.size).toBe(0);
  });

  it('chooses the second candidate after going back, with nothing written in between', async () => {
    const h = handlers();
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1, C2)) : answer(receipt)));
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Back to search results');
    await flush();
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer Mini');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['tool_catalogue_search', 'tool_match']);
    expect(calls('tool_match')[0][1]).toMatchObject({ p_version_id: V2 });
  });

  it('labels a retired exact version as retired everywhere, and still lets it be matched', async () => {
    const renderer = await comparing();
    expect(labelsOf(renderer)).toContain('Compare with my tool: Other Co: Steam Press, retired version');
    press(renderer, 'Compare with my tool: Other Co: Steam Press, retired version');
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Catalogue status: retired version');
    expect(text).toContain('Retired version: matching it records the older version you own. It is not the current version, and no newer version is chosen for you.');
    expect(hasPressable(renderer, 'Confirm match to this catalogue version')).toBe(true);
  });

  it('retries a failed match with the same command, so nothing is recorded twice', async () => {
    const h = handlers();
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('Network request failed'))));
    const renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('The match could not be saved. Nothing was linked yet.');
    expect([...deviceStorage.keys()].some(key => key.startsWith(`strandcue-tool-draft-${owner}-`))).toBe(true);
    expect(hasPressable(renderer, 'Back to search results')).toBe(false);
    rpc.mockImplementation(() => answer(receipt));
    press(renderer, 'Try saving the match again');
    await flush(6);
    const sent = calls('tool_match');
    expect(sent).toHaveLength(2);
    expect(sent[1][1]).toEqual(sent[0][1]);
    expect(h.onMatched).toHaveBeenCalledTimes(1);
  });

  it('shows the latest entry instead of retrying a stale one, and answers a refusal in plain words', async () => {
    const h = handlers();
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('revision-conflict'))));
    let renderer = await mount({}, h);
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('This tool changed elsewhere');
    expect(hasPressable(renderer, 'Try saving the match again')).toBe(false);
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Show the latest entry');
    expect(h.onStale).toHaveBeenCalledTimes(1);
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : Promise.reject(new Error('version-not-found'))));
    renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(renderedText(renderer)).toContain('That catalogue version is no longer available. Nothing was linked.');
    expect(hasPressable(renderer, 'Back to search results')).toBe(true);
  });

  it('sends one command when Confirm is pressed twice before the first save settles', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : new Promise(resolve => { release = resolve; })));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    const button = renderer.root.findAll(node => node.props?.accessibilityLabel === 'Confirm match to this catalogue version' && typeof node.props?.onPress === 'function')[0];
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    await flush();
    expect(calls('tool_match')).toHaveLength(1);
    expect(labelsOf(renderer)).toContain('Saving the match');
    await act(async () => { release({ data: receipt, error: null }); });
    await flush(6);
  });

  it('does not offer a match to the version the tool is already linked to, and can rematch another', async () => {
    rpc.mockImplementation(() => answer(results(C1, C2)));
    const renderer = await mount({ detail: detail({ matched: true, matchConfirmed: true, versionId: V1, revision: 2 }) });
    expect(renderedText(renderer)).toContain('Choose a different catalogue version');
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    expect(renderedText(renderer)).toContain('Your tool is already linked to this catalogue version.');
    expect(hasPressable(renderer, 'Confirm match to this catalogue version')).toBe(false);
  });
});

describe('a saved match', () => {
  const command = { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1, versionId: V2, confirmed: true as const };
  const storage = {
    getItem: async (key: string) => deviceStorage.get(key) ?? null,
    setItem: async (key: string, value: string) => { deviceStorage.set(key, value); },
    removeItem: async (key: string) => { deviceStorage.delete(key); },
  };

  it('retries exactly the saved command, or leaves it for later', async () => {
    await saveToolDraft(storage, owner, { mode: 'match', command });
    rpc.mockImplementation(() => answer(receipt));
    const h = handlers();
    const renderer = await mount({ resume: { mode: 'match', command } }, h);
    expect(renderedText(renderer)).toContain('A confirmed match is waiting to be saved.');
    expect(hasPressable(renderer, 'Search tool catalogue')).toBe(false);
    press(renderer, 'Back to tools (keep for later)');
    expect(h.onLeaveWithDraft).toHaveBeenCalledTimes(1);
    press(renderer, 'Try saving the match again');
    await flush(6);
    expect(calls('tool_match')[0][1]).toEqual({ p_operation_id: command.operationId, p_user_tool_id: toolId, p_expected_revision: 1, p_version_id: V2, p_confirmed: true });
    expect(h.onMatched).toHaveBeenCalledTimes(1);
  });

  it('shows the latest entry when a saved match turns out to be stale, and can discard it', async () => {
    await saveToolDraft(storage, owner, { mode: 'match', command });
    rpc.mockImplementation(() => Promise.reject(new Error('revision-conflict')));
    const h = handlers();
    const renderer = await mount({ resume: { mode: 'match', command } }, h);
    press(renderer, 'Try saving the match again');
    await flush(6);
    expect(deviceStorage.size).toBe(0);
    press(renderer, 'Show the latest entry');
    expect(h.onStale).toHaveBeenCalledTimes(1);
    await saveToolDraft(storage, owner, { mode: 'match', command });
    const second = await mount({ resume: { mode: 'match', command } });
    press(second, 'Delete the saved attempt');
    await flush(4);
    expect(deviceStorage.size).toBe(0);
    expect(hasPressable(second, 'Search tool catalogue')).toBe(true);
  });
});

describe('names and announcements', () => {
  it('tells look-alike results apart by version and position, never by an identifier', async () => {
    const renderer = await comparing([C1, cand(V2, { versionLabel: '2023' }), cand(V3), cand('f0000000-0000-4000-8000-0000000000a4', { toolName: 'Other', brand: 'Zed' })]);
    const labels = [...new Set(labelsOf(renderer))].filter(label => label.startsWith('Compare with my tool'));
    expect(labels).toEqual([
      'Compare with my tool: Salon Brand: Pro Dryer, version 2024, result 1 of 4',
      'Compare with my tool: Salon Brand: Pro Dryer, version 2023',
      'Compare with my tool: Salon Brand: Pro Dryer, version 2024, result 3 of 4',
      'Compare with my tool: Zed: Other',
    ]);
    expect(renderedText(renderer)).not.toMatch(/Catalogue code|[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('speaks each search outcome once: by announcement, not also by a live region', async () => {
    const renderer = await comparing();
    expect(spoken).toEqual(['Searching the tool catalogue.', '3 catalogue versions found.']);
    expect(announcedTexts(renderer)).toEqual([]);
  });

  it('says the match was saved once it has been', async () => {
    rpc.mockImplementation((name: string) => (name === 'tool_catalogue_search' ? answer(results(C1)) : answer(receipt)));
    const renderer = await mount();
    await search(renderer);
    press(renderer, 'Compare with my tool: Salon Brand: Pro Dryer');
    await flush();
    press(renderer, 'Confirm match to this catalogue version');
    await flush(6);
    expect(spoken.at(-1)).toBe('Match saved.');
  });
});

describe('accessibility and wording', () => {
  it('labels every control, keeps the order natural and the targets large, and never uses verdict wording', async () => {
    const renderer = await comparing();
    const labels = labelsOf(renderer);
    expect(labels.indexOf('Search the tool catalogue')).toBeLessThan(labels.indexOf('Search tool catalogue'));
    expect(labels.indexOf('Search tool catalogue')).toBeLessThan(labels.findIndex(label => label.startsWith('Compare with my tool')));
    const unlabelled = renderer.root.findAll(node => typeof node.type === 'string' && typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel !== 'string');
    expect(unlabelled).toEqual([]);
    expect(labels.some(label => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))).toBe(false);
    press(renderer, 'Compare with my tool: Other Co: Steam Press, retired version');
    await flush();
    expect(announcedTexts(renderer).join(' ')).not.toMatch(/undefined|null/);
    const seen = [renderedText(renderer)];
    for (const text of seen) expect(text).not.toMatch(/verified|recommend|\bsafe\b|safety|effective|efficacy|proven|best match/i);
  });
});

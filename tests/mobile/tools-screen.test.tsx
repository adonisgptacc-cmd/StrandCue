import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Tools } from '../../apps/mobile/src/tools';
import { saveToolDraft } from '../../apps/mobile/src/tool-drafts';
import { announcedTexts, flush, hasPressable, labelsOf, press, renderedText } from '../helpers/native-render';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    AccessibilityInfo: { announceForAccessibility: (text: string) => { spoken.push(text); }, setAccessibilityFocus: () => undefined },
    findNodeHandle: () => 1,
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

const ownerA = 'b0000000-0000-4000-8000-000000000001';
const ownerB = 'b0000000-0000-4000-8000-000000000002';
const toolId = 'a0000000-0000-4000-8000-000000000002';
const toolId2 = 'a0000000-0000-4000-8000-000000000003';
const versionId = 'f0000000-0000-4000-8000-0000000000a1';
const R1 = 'c0000000-0000-4000-8000-000000000001';
const R2 = 'c0000000-0000-4000-8000-000000000002';
const R3 = 'c0000000-0000-4000-8000-000000000003';
const R4 = 'c0000000-0000-4000-8000-000000000004';

const item = (overrides: Record<string, unknown> = {}) => ({
  id: toolId, revision: 1, availability: 'available', manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer', matched: false,
  catalogueLifecycle: null, condition: null, heatMethods: null, ...overrides,
});
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: toolId, revision: 1, availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer',
  wattageWatts: 1900, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, versionId: null,
  revisions: [{ id: R1, kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer', availability: 'available', wattageWatts: 1900 } }],
  ...overrides,
});
const page = (...items: unknown[]) => ({ items, nextCursor: null });
const answer = (data: unknown) => Promise.resolve({ data, error: null });

type Routes = Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
const route = (routes: Routes) => rpc.mockImplementation((name: string, args: Record<string, unknown>) => (routes[name] ? routes[name](args) : Promise.reject(new Error(`unexpected ${name}`))));
const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name);

async function mount(owner = ownerA): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(Tools, { owner })); });
  await flush(8);
  return renderer;
}
const open = async (renderer: ReactTestRenderer, label: string) => { press(renderer, label); await flush(8); };

beforeEach(() => { rpc.mockReset(); spoken.length = 0; deviceStorage.clear(); ids.counter = 0; });

describe('the list', () => {
  it('says it is loading, then that nothing is recorded, and offers to add a tool', async () => {
    let release!: (value: unknown) => void;
    route({ tool_list: () => new Promise(resolve => { release = resolve; }) });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Tools, { owner: ownerA })); });
    expect(renderedText(renderer)).toContain('Loading tools…');
    expect(renderedText(renderer)).not.toContain('No tools recorded yet.');
    await act(async () => { release({ data: page(), error: null }); });
    await flush(8);
    const text = renderedText(renderer);
    expect(text).toContain('No tools recorded yet.');
    expect(text).toContain('Brand, model, temperature and wattage can all be left as not answered.');
    expect(hasPressable(renderer, 'Add a tool')).toBe(true);
    expect(text).not.toContain('Loading tools…');
  });

  it('shows only what is useful and recorded on each row, and nothing inferred', async () => {
    route({ tool_list: () => answer(page(
      item(),
      item({ id: toolId2, manualBrand: null, manualModel: null, toolType: null, availability: 'out_of_stock' }),
      item({ id: 'a0000000-0000-4000-8000-000000000004', manualBrand: null, manualModel: 'Old iron', toolType: 'flat-iron', condition: 'worn', heatMethods: { state: 'recorded', methods: ['direct-contact'] }, matched: true, catalogueLifecycle: 'retired' }),
    )) });
    const renderer = await mount();
    const text = renderedText(renderer);
    for (const line of ['Salon brand Pro dryer', 'Tool with no name recorded', 'Old iron', 'Brand: Salon brand', 'Type: Hair dryer', 'Type: Not answered', 'Status: Available', 'Status: Not available right now',
      'Condition: Some wear', 'How it heats: Direct-contact heat', 'Manual entry, not linked to the catalogue.', 'Linked to a retired catalogue version.']) expect(text, line).toContain(line);
    // A row whose heat methods were never recorded says nothing about heat, and no list row states a power or a temperature.
    expect(text.match(/How it heats/g)).toHaveLength(1);
    expect(text).not.toMatch(/Power:|Temperature|Adjustable|watts/);
    expect(labelsOf(renderer)).toContain('View tool entry: Salon brand Pro dryer');
    expect(labelsOf(renderer)).toContain('View tool entry: Tool with no name recorded');
  });

  it('fails in plain words, keeps drafts visible, and a reload recovers', async () => {
    await saveToolDraft({ getItem: async k => deviceStorage.get(k) ?? null, setItem: async (k, v) => { deviceStorage.set(k, v); }, removeItem: async k => { deviceStorage.delete(k); } }, ownerA,
      { mode: 'archive', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1 } });
    route({ tool_list: () => Promise.reject(new Error('Network request failed: select * from user_tools')) });
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('Tools or device drafts could not be loaded. Please try again.');
    expect(text).not.toContain('user_tools');
    expect(text).toContain('Pending save 1: Archive this tool.');
    expect(text).not.toContain('No tools recorded yet.');
    route({ tool_list: () => answer(page(item())) });
    await open(renderer, 'Reload tools');
    expect(renderedText(renderer)).toContain('Salon brand Pro dryer');
    expect(renderedText(renderer)).not.toContain('could not be loaded');
  });

  it('loads further pages without repeating a tool', async () => {
    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: toolId };
    route({ tool_list: args => answer(args.p_cursor ? page(item(), item({ id: toolId2, manualModel: 'Second' })) : { items: [item()], nextCursor: cursor }) });
    const renderer = await mount();
    await open(renderer, 'Load more tools');
    expect(renderedText(renderer).match(/Salon brand Pro dryer/g)).toHaveLength(1);
    expect(renderedText(renderer)).toContain('Second');
    expect(hasPressable(renderer, 'Load more tools')).toBe(false);
  });

  it('refuses a list row that carries anything beyond the useful fields', async () => {
    route({ tool_list: () => answer(page({ ...item(), wattageWatts: 2200, notes: 'private' })) });
    const renderer = await mount();
    expect(renderedText(renderer)).not.toContain('private');
    expect(renderedText(renderer)).toContain('could not be loaded');
  });
});

describe('a tool', () => {
  const base = (): Routes => ({ tool_list: () => answer(page(item())), tool_history: () => answer(detail()) });

  it('opens with the history read, shows the owner facts and every action', async () => {
    route(base());
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    expect(calls('tool_history')[0][1]).toEqual({ p_user_tool_id: toolId, p_include_audit: true });
    const text = renderedText(renderer);
    for (const line of ['Salon brand Pro dryer', 'Manual entry, not linked to the catalogue.', 'Brand: Salon brand', 'Model: Pro dryer', 'Power: 1900 watts', 'Temperature: Not recorded', 'How it heats: Not answered']) expect(text, line).toContain(line);
    const labels = labelsOf(renderer);
    for (const label of ['Edit this tool', 'Correct this tool\'s identity', 'Match to catalogue', 'Archive this tool', 'Show tool history', 'Back to tools']) expect(labels, label).toContain(label);
    expect(labels).not.toContain('View catalogue details');
    // The wattage never reads as a temperature.
    expect(text).not.toMatch(/degrees/);
  });

  it('says plainly when a tool cannot be found or read, and stays on the list', async () => {
    route({ ...base(), tool_history: () => answer(null) });
    let renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    expect(renderedText(renderer)).toContain('This tool could not be found. Reload the list to check your saved entries.');
    route({ ...base(), tool_history: () => Promise.reject(new Error('boom')) });
    renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    expect(renderedText(renderer)).toContain('This tool could not be loaded. Please try again.');
    expect(hasPressable(renderer, 'Reload tools')).toBe(true);
  });

  it('shows the history on request: baseline, change, correction and the answers kept apart', async () => {
    const revisions = [
      { id: R1, kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualBrand: 'Saln', manualModel: 'Pro drier', toolType: 'dryer', availability: 'available', wattageWatts: 1900, notes: 'Second hand' } },
      { id: R2, kind: 'change', correctsId: null, matchVersionId: null, patch: { wattageWatts: null, condition: 'unknown' } },
      { id: R3, kind: 'correction', correctsId: R1, matchVersionId: null, correctionReason: 'Spelling', patch: { manualBrand: 'Salon', manualModel: 'Pro dryer' } },
      { id: R4, kind: 'match', correctsId: null, matchVersionId: versionId, patch: {} },
    ];
    route({ ...base(), tool_history: () => answer(detail({ revisions, matched: true, matchConfirmed: true, versionId, manualBrand: 'Salon', wattageWatts: null })) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    expect(renderedText(renderer)).not.toContain('Original entry');
    press(renderer, 'Show tool history');
    const text = renderedText(renderer);
    for (const line of ['Original entry', 'Change', 'Correction', 'Catalogue match', 'Brand: Saln', 'Model: Pro drier', 'Power: Removed saved answer', 'Condition: Not sure',
      'Replaces the earlier entry that recorded Saln, Pro drier, Hair dryer.', 'Reason: Spelling', 'Brand: Salon', 'Model: Pro dryer', 'Type: Kept as it was', 'Power: Not answered', 'Your notes: Kept as it was',
      'Matched to an exact catalogue version. Your own brand, model and type stay as you recorded them. What the catalogue lists is not something you recorded.']) expect(text, line).toContain(line);
    expect(labelsOf(renderer)).toContain('Hide tool history');
    // Opening the history is the owner's own action: its entries are read in place, not announced all at once.
    expect(announcedTexts(renderer)).toEqual([]);
  });

  it('fails closed when a history cannot be read, and never guesses what it held', async () => {
    const revisions = [
      { id: R1, kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualModel: 'Pro dryer' } },
      { id: R2, kind: 'correction', correctsId: 'c0000000-0000-4000-8000-0000000000ff', matchVersionId: null, correctionReason: 'Fix', patch: { manualModel: 'Pro' } },
    ];
    route({ ...base(), tool_history: () => answer(detail({ revisions })) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    press(renderer, 'Show tool history');
    const text = renderedText(renderer);
    expect(text).toContain('Replaces an earlier entry that could not be read.');
    expect(text).toContain('The earlier entry could not be read, so what it recorded is not shown.');
    expect(text).not.toContain('Kept as it was');
  });

  it('offers the catalogue details and a different match once a tool is linked, and no actions once archived', async () => {
    route({ ...base(), tool_history: () => answer(detail({ matched: true, matchConfirmed: true, versionId, revision: 2 })) });
    let renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    expect(labelsOf(renderer)).toContain('View catalogue details');
    expect(labelsOf(renderer)).toContain('Choose a different catalogue match');
    expect(renderedText(renderer)).toContain('Linked to a catalogue version. Your own brand, model and type are kept as you recorded them.');
    route({ ...base(), tool_history: () => answer(detail({ availability: 'archived' })) });
    renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    const labels = labelsOf(renderer);
    for (const gone of ['Edit this tool', 'Match to catalogue', 'Archive this tool', 'Correct this tool\'s identity']) expect(labels, gone).not.toContain(gone);
    expect(renderedText(renderer)).toContain('This tool is archived. Its history stays readable and nothing was deleted.');
  });

  it('opens the editor, the match screen and the catalogue detail, and returns to the tool', async () => {
    route({ ...base(), tool_history: () => answer(detail({ matched: true, matchConfirmed: true, versionId, revision: 2 })), tool_catalogue_detail: () => Promise.reject(new Error('not-found')) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    await open(renderer, 'Edit this tool');
    expect(renderedText(renderer)).toContain('Edit this tool screen opened.');
    expect(hasPressable(renderer, 'Save changes') || hasPressable(renderer, 'Cancel without saving')).toBe(true);
    await open(renderer, 'Cancel without saving');
    expect(calls('tool_list')).toHaveLength(2);
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    await open(renderer, 'Choose a different catalogue match');
    expect(renderedText(renderer)).toContain('Match to catalogue');
    expect(hasPressable(renderer, 'Search tool catalogue')).toBe(true);
    await open(renderer, 'Cancel and keep my tool as it is');
    expect(renderedText(renderer)).toContain('Brand: Salon brand');
    await open(renderer, 'View catalogue details');
    expect(calls('tool_catalogue_detail')[0][1]).toEqual({ p_version_id: versionId, p_user_tool_id: toolId });
    expect(labelsOf(renderer)).toContain('Back to your tool');
    await open(renderer, 'Back to your tool');
    expect(renderedText(renderer)).toContain('Brand: Salon brand');
  });
});

describe('guards and recovery', () => {
  const storage = { getItem: async (k: string) => deviceStorage.get(k) ?? null, setItem: async (k: string, v: string) => { deviceStorage.set(k, v); }, removeItem: async (k: string) => { deviceStorage.delete(k); } };
  const base = (): Routes => ({ tool_list: () => answer(page(item())), tool_history: () => answer(detail()) });

  it('never opens an editor over a different unsent command for the same tool', async () => {
    await saveToolDraft(storage, ownerA, { mode: 'archive', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1 } });
    route(base());
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    for (const [button, verb] of [['Edit this tool', 'editing'], ["Correct this tool's identity", 'correcting'], ['Archive this tool', 'archiving']]) {
      press(renderer, button);
      expect(renderedText(renderer)).toContain(`This tool has an unsent change saved on your device. Review it from the pending saves in your tools before ${verb}.`);
      expect(renderedText(renderer)).not.toContain('screen opened.');
    }
  });

  it('tells two tools with the same name apart by position', async () => {
    route({ tool_list: () => answer(page(item(), item({ id: toolId2 }))), tool_history: () => answer(detail()) });
    const renderer = await mount();
    const labels = [...new Set(labelsOf(renderer))].filter(label => label.startsWith('View tool entry'));
    expect(labels).toEqual(['View tool entry: Salon brand Pro dryer, number 1 of 2', 'View tool entry: Salon brand Pro dryer, number 2 of 2']);
  });

  it('shows a history value it cannot read as unreadable instead of crashing', async () => {
    const revisions = [{ id: R1, kind: 'baseline', correctsId: null, matchVersionId: null, patch: { manualModel: 'Pro dryer', settings: 'not a settings record', heatMethods: 7 } }];
    route({ ...base(), tool_history: () => answer(detail({ revisions })) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    press(renderer, 'Show tool history');
    expect(renderedText(renderer)).toContain('The earlier entry could not be read, so what it recorded is not shown.');
  });

  it('can clear a damaged device index, and the list recovers', async () => {
    deviceStorage.set(`strandcue-tool-drafts-${ownerA}`, '{not json');
    route({ tool_list: () => answer(page(item())) });
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('Tools or device drafts could not be loaded. Please try again.');
    await open(renderer, 'Delete unsent saves on this device');
    expect(renderedText(renderer)).toContain('Salon brand Pro dryer');
    expect(renderedText(renderer)).not.toContain('could not be loaded');
  });

  it('says why the latest entry could not be loaded, from the editor too', async () => {
    route({ tool_list: () => answer(page(item())), tool_history: () => answer(detail({ revision: 1 })) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    await open(renderer, 'Edit this tool');
    route({ tool_list: () => answer(page(item())), tool_history: () => Promise.reject(new Error('revision-conflict')), tool_change: () => Promise.reject(new Error('revision-conflict')) });
    press(renderer, 'Condition: Some wear');
    await open(renderer, 'Save changes');
    route({ tool_list: () => answer(page(item())), tool_history: () => Promise.reject(new Error('boom')) });
    await open(renderer, 'Show the latest entry');
    expect(renderedText(renderer)).toContain('This tool could not be loaded. Please try again.');
  });
});

describe('pending saves and owners', () => {
  const storage = { getItem: async (k: string) => deviceStorage.get(k) ?? null, setItem: async (k: string, v: string) => { deviceStorage.set(k, v); }, removeItem: async (k: string) => { deviceStorage.delete(k); } };

  it('lists a saved command and reviews it where it stopped', async () => {
    await saveToolDraft(storage, ownerA, { mode: 'match', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1, versionId, confirmed: true } });
    route({ tool_list: () => answer(page(item())), tool_history: () => answer(detail()) });
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('Pending save 1: Match to catalogue.');
    await open(renderer, 'Review pending save 1: Match to catalogue');
    expect(calls('tool_history')).toHaveLength(1);
    expect(renderedText(renderer)).toContain('A confirmed match is waiting to be saved.');
  });

  it('does not start a match over a different saved change for the same tool', async () => {
    await saveToolDraft(storage, ownerA, { mode: 'archive', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1 } });
    route({ tool_list: () => answer(page(item())), tool_history: () => answer(detail()) });
    const renderer = await mount();
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    press(renderer, 'Match to catalogue');
    expect(renderedText(renderer)).toContain('This tool has an unsent change saved on your device. Review it from the pending saves in your tools before matching.');
    expect(hasPressable(renderer, 'Search tool catalogue')).toBe(false);
  });

  it('never shows another owner\'s tools, and ignores a late answer for the earlier owner', async () => {
    let releaseA!: (value: unknown) => void;
    route({ tool_list: () => new Promise(resolve => { releaseA = resolve; }) });
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement(Tools, { owner: ownerA })); });
    route({ tool_list: () => answer(page(item({ id: toolId2, manualModel: 'Owner B iron', manualBrand: null }))) });
    await act(async () => { renderer.update(createElement(Tools, { owner: ownerB })); });
    await flush(8);
    await act(async () => { releaseA({ data: page(item({ manualModel: 'Owner A dryer' })), error: null }); });
    await flush(8);
    const text = renderedText(renderer);
    expect(text).toContain('Owner B iron');
    expect(text).not.toContain('Owner A dryer');
  });

  it('keeps drafts of one owner away from another', async () => {
    await saveToolDraft(storage, ownerA, { mode: 'archive', command: { operationId: 'e0000000-0000-4000-8000-000000000001', userToolId: toolId, expectedRevision: 1 } });
    route({ tool_list: () => answer(page()) });
    const renderer = await mount(ownerB);
    expect(renderedText(renderer)).not.toContain('Pending save');
    expect(renderedText(renderer)).toContain('No tools recorded yet.');
  });
});

describe('accessibility', () => {
  it('labels every control, uses no identifiers in names, and announces loading and results through live regions', async () => {
    route({ tool_list: () => answer(page(item(), item({ id: toolId2, manualBrand: null, manualModel: null }))), tool_history: () => answer(detail()) });
    const renderer = await mount();
    const unlabelled = renderer.root.findAll(node => typeof node.type === 'string' && typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel !== 'string');
    expect(unlabelled).toEqual([]);
    const labels = labelsOf(renderer);
    expect(labels.some(label => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))).toBe(false);
    expect(new Set(labels.filter(label => label.startsWith('View tool entry'))).size).toBe(2);
    await open(renderer, 'View tool entry: Salon brand Pro dryer');
    const headings = renderer.root.findAll(node => node.props?.accessibilityRole === 'header');
    expect(headings.length).toBeGreaterThan(0);
    expect(announcedTexts(renderer).join(' ')).not.toMatch(/undefined|null/);
    expect(renderedText(renderer)).not.toMatch(/verified|recommend|\bsafe\b|safety|effective|efficacy|proven/i);
  });
});

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToolCatalogueDetail } from '../../apps/mobile/src/ToolCatalogueDetail';
import { catalogueCapabilityLines, ownerToolLines } from '../../apps/mobile/src/tool-copy';
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
vi.mock('../../apps/mobile/src/client.ts', () => ({ supabase: { rpc } }));

const owner = 'b0000000-0000-4000-8000-000000000001';
const otherOwner = 'b0000000-0000-4000-8000-000000000002';
const versionId = 'f0000000-0000-4000-8000-0000000000a1';
const userToolId = 'a0000000-0000-4000-8000-000000000002';

const identity = { versionId, toolId: 'f0000000-0000-4000-8000-0000000000b1', brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA' };
const unpublished = { state: 'not_published' };
const detail = (overrides: Record<string, unknown> = {}) => ({
  identity, lifecycle: { state: 'active', successor: { state: 'none' } }, capabilities: unpublished, claims: unpublished, owner: null, ...overrides,
});
const ownerRecord = (overrides: Record<string, unknown> = {}) => ({
  userToolId, revision: 3, availability: 'available', matched: true, matchConfirmed: true, manualBrand: 'My Brand', manualModel: 'My dryer guess', toolType: 'dryer',
  wattageWatts: 1900, adjustableTemp: 'unknown', settings: null, attachments: { state: 'recorded', items: [{ kind: 'diffuser' }] }, condition: 'good', heatMethods: { state: 'recorded', methods: ['heated-air'] }, notes: 'Bought second hand',
  revisions: [
    { id: 'c0000000-0000-4000-8000-000000000001', kind: 'baseline', correctsId: null, matchVersionId: null },
    { id: 'c0000000-0000-4000-8000-000000000002', kind: 'match', correctsId: null, matchVersionId: versionId },
  ], ...overrides,
});
const evidence = { evidenceId: 'a0000000-0000-4000-8000-0000000000e1', sourceType: 'manufacturer', trustTier: 'T5', title: 'Manual', publisher: 'Maker', market: 'ZA',
  firstSeen: '2024-01-01', lastChecked: '2024-02-01', applicability: 'Applies to this model', limitations: 'Marketing page', sourceUrl: 'https://example.com/manual', archivedUrl: null, excerpt: null };
const claims = { state: 'published', content: { items: [{ claimId: 'a0000000-0000-4000-8000-0000000000c1', claimKey: 'k', statement: 'Dries with warm air', evidence: [evidence] }] } };
const answer = (data: unknown) => Promise.resolve({ data, error: null });

async function mount(extra: Record<string, unknown> = {}, onBack = vi.fn()): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(ToolCatalogueDetail, { owner, versionId, userToolId: null, backLabel: 'search results', onBack, ...extra })); });
  await flush(6);
  return renderer;
}

beforeEach(() => { rpc.mockReset(); spoken.length = 0; });

describe('reading a tool version', () => {
  it('paints nothing but a loading state until the server answers, then the identity and lifecycle', async () => {
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const renderer = await mount();
    expect(rpc).toHaveBeenCalledWith('tool_catalogue_detail', { p_version_id: versionId, p_user_tool_id: null });
    expect(renderedText(renderer)).toContain('Loading tool details…');
    expect(renderedText(renderer)).not.toContain('Salon Brand');
    expect(spoken).toEqual(['Loading tool details.']);
    await act(async () => { release({ data: detail(), error: null }); });
    await flush(6);
    const text = renderedText(renderer);
    for (const line of ['Tool details', 'Exact catalogue identity', 'Brand: Salon Brand', 'Tool: Pro Dryer', 'Version: 2024', 'Type: Hair dryer', 'Version status: current catalogue version.']) expect(text).toContain(line);
    expect(spoken).toEqual(['Loading tool details.', 'Tool details loaded.']);
    expect(text).not.toContain('Your private record');
  });

  it('says honestly that capabilities and claims are not published, and invents none', async () => {
    rpc.mockImplementation(() => answer(detail()));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('No capabilities are published for this exact version. Nothing is assumed.');
    expect(text).toContain('No reviewed claims are published for this exact version.');
    expect(text).not.toMatch(/Power:|Highest temperature|Heated air|Direct-contact/);
  });

  it('tells apart under review and withdrawn', async () => {
    rpc.mockImplementation(() => answer(detail({ capabilities: { state: 'under_review' }, claims: { state: 'withdrawn' } })));
    const text = renderedText(await mount());
    expect(text).toContain('Capabilities for this version are under review and are not shown yet.');
    expect(text).toContain('Claims were published and later withdrawn. They are not shown.');
  });

  it('shows published capabilities as stated, so a wattage is never read as a temperature', async () => {
    const content = { wattageWatts: 1800, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'no', airHeat: 'yes' };
    rpc.mockImplementation(() => answer(detail({ capabilities: { state: 'published', content } })));
    const text = renderedText(await mount());
    for (const line of catalogueCapabilityLines(content as never)) expect(text).toContain(line);
    expect(text).toContain('Power: 1800 watts');
    expect(text).toContain('Highest temperature: Not recorded in the catalogue');
  });

  it('shows published claims with their evidence closed until asked', async () => {
    rpc.mockImplementation(() => answer(detail({ claims })));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('Dries with warm air');
    expect(renderedText(renderer)).not.toContain('Marketing page');
    press(renderer, 'Show evidence and limitations for: Dries with warm air');
    expect(renderedText(renderer)).toContain('Marketing page');
  });

  it('labels a retired version, announces it, and never substitutes the successor', async () => {
    const successor = { versionId: 'f0000000-0000-4000-8000-0000000000a9', brand: 'Salon Brand', toolName: 'Pro Dryer 2', versionLabel: '2026' };
    rpc.mockImplementation(() => answer(detail({ lifecycle: { state: 'retired', successor: { state: 'published', version: successor } } })));
    const renderer = await mount();
    const text = renderedText(renderer);
    expect(text).toContain('Retired version: this is an older version, not the current one.');
    expect(text).toContain('A reviewed newer version is listed: Salon Brand: Pro Dryer 2 (2026). Your tool stays linked to this version.');
    expect(text).toContain('Brand: Salon Brand');
    expect(spoken.at(-1)).toBe('Tool details loaded. This is a retired version.');
    // The retirement is spoken by the announcement alone, not twice.
    expect(announcedTexts(renderer)).toEqual([]);
    for (const [state, line] of [['none', 'No newer version is recorded.'], ['not_published', 'A newer version is recorded, but the link has not been published, so it is not shown.'], ['under_review', 'A newer version is recorded, and the link is under review, so it is not shown yet.']]) {
      rpc.mockImplementation(() => answer(detail({ lifecycle: { state: 'retired', successor: { state } } })));
      expect(renderedText(await mount())).toContain(line);
    }
  });
});

describe('the owner context', () => {
  it('shows the owner record in its own section, apart from what the catalogue says', async () => {
    rpc.mockImplementation(() => answer(detail({ capabilities: { state: 'published', content: { wattageWatts: 1800, temperatureMaxCelsius: null, adjustableTemp: 'yes', contactHeat: 'no', airHeat: 'yes' } }, owner: ownerRecord() })));
    const renderer = await mount({ userToolId });
    expect(rpc).toHaveBeenCalledWith('tool_catalogue_detail', { p_version_id: versionId, p_user_tool_id: userToolId });
    const text = renderedText(renderer);
    expect(text).toContain('Your private record (only you can see this)');
    for (const line of ownerToolLines(ownerRecord() as never)) expect(text).toContain(line);
    expect(text).toContain('Entry 1: Original entry');
    expect(text).toContain('Entry 2: Catalogue match');
    expect(text).toContain('What the catalogue lists is not something you observed. What you recorded is listed separately, under your private record.');
    // The owner's wattage and the catalogue's wattage stay apart.
    expect(text).toContain('Power: 1900 watts');
    expect(text).toContain('Power: 1800 watts');
  });

  it('refuses an answer that is for another version or another context', async () => {
    rpc.mockImplementation(() => answer(detail({ identity: { ...identity, versionId: 'f0000000-0000-4000-8000-0000000000ff' } })));
    expect(renderedText(await mount())).toContain('The tool details could not be loaded. Nothing was changed. Try again.');
    rpc.mockImplementation(() => answer(detail({ owner: ownerRecord() })));
    const renderer = await mount();
    expect(renderedText(renderer)).not.toContain('My dryer guess');
    expect(renderedText(renderer)).toContain('could not be loaded');
  });

  it('refuses an answer carrying a reviewer, a draft or an internal field', async () => {
    rpc.mockImplementation(() => answer({ ...detail(), reviewerName: 'Someone', draftClaims: ['secret'] }));
    const text = renderedText(await mount());
    expect(text).not.toContain('Someone');
    expect(text).not.toContain('secret');
    expect(text).toContain('could not be loaded');
  });

  it('never paints the previous owner\'s record when the owner changes', async () => {
    rpc.mockImplementation(() => answer(detail({ owner: ownerRecord() })));
    const renderer = await mount({ userToolId });
    expect(renderedText(renderer)).toContain('My dryer guess');
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    await act(async () => { renderer.update(createElement(ToolCatalogueDetail, { owner: otherOwner, versionId, userToolId, backLabel: 'your tool', onBack: vi.fn() })); });
    expect(renderedText(renderer)).toContain('Loading tool details…');
    expect(renderedText(renderer)).not.toContain('My dryer guess');
    await act(async () => { release({ data: detail(), error: null }); });
  });
});

describe('failures, retry and navigation', () => {
  it('fails closed in plain words, retries, and never repeats raw error text', async () => {
    rpc.mockImplementationOnce(() => Promise.reject(new Error('boom: select draft from tool_claims')));
    const renderer = await mount();
    const failed = renderedText(renderer);
    expect(failed).toContain('The tool details could not be loaded. Nothing was changed. Try again.');
    expect(failed).not.toContain('draft');
    expect(spoken.at(-1)).toBe('The tool details could not be loaded. Nothing was changed. Try again.');
    rpc.mockImplementation(() => answer(detail()));
    press(renderer, 'Try loading the tool details again');
    await flush(6);
    expect(renderedText(renderer)).toContain('Brand: Salon Brand');
  });

  it('offers no retry when the version is gone', async () => {
    rpc.mockImplementation(() => Promise.reject(new Error('not-found')));
    const renderer = await mount();
    expect(renderedText(renderer)).toContain('These tool details are no longer available. Go back and choose again.');
    expect(hasPressable(renderer, 'Try loading the tool details again')).toBe(false);
  });

  it('goes back with a label that says where, and ignores an answer that arrives after it closed', async () => {
    const onBack = vi.fn();
    let release!: (value: unknown) => void;
    rpc.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const renderer = await mount({ backLabel: 'the comparison' }, onBack);
    press(renderer, 'Back to the comparison');
    expect(onBack).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
    await act(async () => { release({ data: detail(), error: null }); });
    expect(spoken).toEqual(['Loading tool details.']);
  });

  it('has one title, labelled controls and no verdict wording or identifiers', async () => {
    rpc.mockImplementation(() => answer(detail({ claims, capabilities: { state: 'published', content: { wattageWatts: 1800, temperatureMaxCelsius: 200, adjustableTemp: 'yes', contactHeat: 'no', airHeat: 'yes' } }, owner: ownerRecord() })));
    const renderer = await mount({ userToolId });
    const titles = renderer.root.findAll(node => node.props?.accessibilityRole === 'header' && node.children.join('') === 'Tool details');
    expect(titles).toHaveLength(1);
    const unlabelled = renderer.root.findAll(node => typeof node.type === 'string' && typeof node.props?.onPress === 'function' && typeof node.props?.accessibilityLabel !== 'string');
    expect(unlabelled).toEqual([]);
    expect(labelsOf(renderer).some(label => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(label))).toBe(false);
    expect(renderedText(renderer)).not.toMatch(/verified|recommend|\bsafe\b|safety|effective|efficacy|proven|best match/i);
    expect(announcedTexts(renderer).join(' ')).not.toMatch(/undefined|null/);
  });
});

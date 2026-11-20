import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  archiveUserTool, changeUserTool, correctUserTool, getUserTool, listUserTools, matchUserTool, recordUserTool,
} from '../../apps/mobile/src/tool-api';
import { getToolCatalogueDetail, searchToolCatalogue } from '../../apps/mobile/src/tool-catalogue-api';

const rpc = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ supabase: { rpc } as { rpc: typeof rpc } | null }));
vi.mock('../../apps/mobile/src/client.ts', () => ({ get supabase() { return client.supabase; } }));

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = { precision: 'day', value: '2026-03-01' } as const;
const create = (overrides: Record<string, unknown> = {}) => ({
  operationId: id(1), userToolId: id(2), effectiveDate: DAY, versionId: null, manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer', availability: 'available', ...overrides,
});
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: id(2), revision: 1, availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer',
  wattageWatts: null, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, versionId: null, revisions: [], ...overrides,
});
const receipt = { userToolId: id(2), revision: 1, revisions: [] };

beforeEach(() => { rpc.mockReset(); client.supabase = { rpc }; });

describe('owner tool commands', () => {
  it('sends a validated add with identity and facts in one patch, and no owner field', async () => {
    rpc.mockResolvedValueOnce({ data: receipt, error: null });
    await recordUserTool(create({ wattageWatts: 2200, adjustableTemp: 'unknown', condition: 'worn', heatMethods: { state: 'recorded', methods: ['heated-air'] } }));
    const [name, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('tool_add');
    expect(params).toEqual({
      p_operation_id: id(1), p_user_tool_id: id(2), p_availability: 'available', p_effective_date: DAY,
      p_facts: { manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer', wattageWatts: 2200, adjustableTemp: 'unknown', condition: 'worn', heatMethods: { state: 'recorded', methods: ['heated-air'] } },
    });
    expect(Object.keys(params)).not.toContain('owner');
  });

  it('keeps a known wattage with an unknown temperature exactly that', async () => {
    rpc.mockResolvedValueOnce({ data: receipt, error: null });
    await recordUserTool(create({ wattageWatts: 1800 }));
    const facts = (rpc.mock.calls[0][1] as { p_facts: Record<string, unknown> }).p_facts;
    expect(facts.wattageWatts).toBe(1800);
    expect('settings' in facts).toBe(false);
    expect('temperature' in facts).toBe(false);
    expect('adjustableTemp' in facts).toBe(false);
  });

  it('sends a change as a patch where absent, cleared and recorded stay different', async () => {
    rpc.mockResolvedValueOnce({ data: { ...receipt, revision: 2 }, error: null });
    await changeUserTool({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY, availability: 'out_of_stock', condition: null, notes: 'Lent', settings: { state: 'unknown' } });
    expect(rpc.mock.calls[0]).toEqual(['tool_change', {
      p_operation_id: id(3), p_user_tool_id: id(2), p_expected_revision: 1, p_availability: 'out_of_stock', p_effective_date: DAY,
      p_facts: { condition: null, notes: 'Lent', settings: { state: 'unknown' } },
    }]);
  });

  it('sends a correction with its target, reason and identity patch', async () => {
    rpc.mockResolvedValueOnce({ data: { ...receipt, revision: 2 }, error: null });
    await correctUserTool({ operationId: id(4), userToolId: id(2), expectedRevision: 1, correctsId: id(5), reason: 'Typo', effectiveDate: DAY, manualModel: 'Pro dryer 2', manualBrand: null });
    expect(rpc.mock.calls[0]).toEqual(['tool_correct', {
      p_operation_id: id(4), p_user_tool_id: id(2), p_expected_revision: 1, p_corrects_id: id(5), p_reason: 'Typo', p_effective_date: DAY,
      p_facts: { manualBrand: null, manualModel: 'Pro dryer 2' },
    }]);
  });

  it('requires confirmation to match, and sends an archive distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: { ...receipt, revision: 2 }, error: null });
    await matchUserTool({ operationId: id(6), userToolId: id(2), expectedRevision: 1, versionId: id(7), confirmed: true });
    expect(rpc.mock.calls[0]).toEqual(['tool_match', { p_operation_id: id(6), p_user_tool_id: id(2), p_expected_revision: 1, p_version_id: id(7), p_confirmed: true }]);
    await expect(matchUserTool({ operationId: id(6), userToolId: id(2), expectedRevision: 1, versionId: id(7), confirmed: false })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { ...receipt, revision: 3 }, error: null });
    await archiveUserTool({ operationId: id(8), userToolId: id(2), expectedRevision: 2 });
    expect(rpc.mock.calls[1][0]).toBe('tool_archive');
  });

  it('refuses an invalid command before any network call', async () => {
    await expect(recordUserTool(create({ manualModel: null }))).rejects.toThrow();
    await expect(recordUserTool(create({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: 'yes' }))).rejects.toThrow();
    await expect(recordUserTool(create({ temperatureMaxCelsius: 230 }))).rejects.toThrow();
    await expect(changeUserTool({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY, manualModel: 'x' })).rejects.toThrow();
    await expect(correctUserTool({ operationId: id(4), userToolId: id(2), expectedRevision: 1, correctsId: id(5), reason: 'r', effectiveDate: DAY, condition: 'worn' })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { ...receipt, owner: id(9) }, error: null });
    await expect(recordUserTool(create())).rejects.toThrow();
  });

  it('surfaces a server refusal, an unconfigured client and never logs a payload', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined));
    rpc.mockResolvedValueOnce({ data: null, error: new Error('revision-conflict') });
    await expect(changeUserTool({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY, notes: 'secret note' })).rejects.toThrow('revision-conflict');
    client.supabase = null;
    await expect(recordUserTool(create())).rejects.toThrow(/unavailable/);
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  });
});

describe('owner tool reads', () => {
  it('reads a detail with unknown, none and absent answers surviving untouched', async () => {
    rpc.mockResolvedValueOnce({ data: detail({ wattageWatts: 1800, adjustableTemp: 'unknown', settings: { state: 'unknown' }, attachments: { state: 'none' }, heatMethods: { state: 'unknown' }, condition: 'unknown' }), error: null });
    const result = await getUserTool(id(2), true);
    expect(rpc).toHaveBeenCalledWith('tool_history', { p_user_tool_id: id(2), p_include_audit: true });
    expect(result).toMatchObject({ wattageWatts: 1800, adjustableTemp: 'unknown', settings: { state: 'unknown' }, attachments: { state: 'none' }, heatMethods: { state: 'unknown' }, condition: 'unknown' });
    rpc.mockResolvedValueOnce({ data: detail(), error: null });
    expect(await getUserTool(id(2))).toMatchObject({ wattageWatts: null, settings: null, attachments: null, heatMethods: null, condition: null, adjustableTemp: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await getUserTool(id(2))).toBeNull();
  });

  it('fails closed on a stored answer the domain would refuse', async () => {
    const bad = [
      detail({ settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 900, unit: 'C' } }] } }),
      detail({ heatMethods: { state: 'recorded', methods: ['heated-air', 'unheated'] } }),
      detail({ attachments: { state: 'recorded', items: [{ kind: 'diffuser', heatSource: true }] } }),
      detail({ wattageWatts: 0 }), detail({ condition: 'safe' }), detail({ toolType: 'toaster' }),
      { ...detail(), temperatureMaxCelsius: 230 }, { ...detail(), owner: id(9) },
    ];
    for (const data of bad) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getUserTool(id(2))).rejects.toThrow();
    }
    await expect(getUserTool('not-a-uuid')).rejects.toThrow();
  });

  it('lists with a bounded page and a strict item shape', async () => {
    const item = { id: id(2), revision: 1, availability: 'available', manualBrand: null, manualModel: 'Dryer', toolType: null, matched: false, catalogueLifecycle: null, condition: null, heatMethods: null };
    rpc.mockResolvedValueOnce({ data: { items: [item], nextCursor: null }, error: null });
    expect((await listUserTools({ limit: 5 })).items).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith('tool_list', { p_limit: 5, p_cursor: null });
    await expect(listUserTools({ limit: 101 })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { items: [{ ...item, wattageWatts: 2200 }], nextCursor: null }, error: null });
    await expect(listUserTools()).rejects.toThrow();
  });
});

describe('tool catalogue reads', () => {
  const candidate = { versionId: id(31), toolId: id(21), brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA', lifecycle: 'active' };
  const toolDetail = (overrides: Record<string, unknown> = {}) => ({
    identity: { versionId: id(31), toolId: id(21), brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA' },
    lifecycle: { state: 'active', successor: { state: 'none' } }, capabilities: { state: 'not_published' }, claims: { state: 'not_published' }, owner: null, ...overrides,
  });

  it('searches with normalized words and refuses anything but identity', async () => {
    rpc.mockResolvedValueOnce({ data: { results: [candidate], truncated: false }, error: null });
    await searchToolCatalogue({ query: '  pro   dryer ', limit: 5 });
    expect(rpc).toHaveBeenCalledWith('tool_catalogue_search', { p_query: 'pro dryer', p_limit: 5 });
    await expect(searchToolCatalogue({ query: 'a' })).rejects.toThrow();
    await expect(searchToolCatalogue({ query: 'dryer', limit: 99 })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { results: [{ ...candidate, wattageWatts: 2200 }], truncated: false }, error: null });
    await expect(searchToolCatalogue({ query: 'dryer' })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { results: [candidate, { ...candidate, versionId: id(32) }], truncated: false }, error: null });
    await expect(searchToolCatalogue({ query: 'dryer', limit: 1 })).rejects.toThrow();
  });

  it('reads a detail for the version asked for, with an owner only when asked', async () => {
    rpc.mockResolvedValueOnce({ data: toolDetail(), error: null });
    expect((await getToolCatalogueDetail({ versionId: id(31) })).owner).toBeNull();
    expect(rpc).toHaveBeenCalledWith('tool_catalogue_detail', { p_version_id: id(31), p_user_tool_id: null });
    rpc.mockResolvedValueOnce({ data: toolDetail({ identity: { ...toolDetail().identity, versionId: id(32) } }), error: null });
    await expect(getToolCatalogueDetail({ versionId: id(31) })).rejects.toThrow(/detail-mismatch/);
    const owner = { userToolId: id(2), revision: 2, availability: 'available', matched: true, matchConfirmed: true, manualBrand: null, manualModel: 'M', toolType: null,
      wattageWatts: null, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, revisions: [] };
    rpc.mockResolvedValueOnce({ data: toolDetail({ owner }), error: null });
    await expect(getToolCatalogueDetail({ versionId: id(31) })).rejects.toThrow(/detail-mismatch/);
    rpc.mockResolvedValueOnce({ data: toolDetail({ owner }), error: null });
    expect((await getToolCatalogueDetail({ versionId: id(31), userToolId: id(2) })).owner?.userToolId).toBe(id(2));
    rpc.mockResolvedValueOnce({ data: toolDetail(), error: null });
    await expect(getToolCatalogueDetail({ versionId: id(31), userToolId: id(2) })).rejects.toThrow(/detail-mismatch/);
    await expect(getToolCatalogueDetail({ versionId: 'x' })).rejects.toThrow();
  });

  it('fails closed on a draft or internal field and on a server refusal', async () => {
    for (const data of [
      { ...toolDetail(), reviewer: 'x' }, toolDetail({ capabilities: { state: 'draft' } }), toolDetail({ capabilities: { state: 'published' } }),
      toolDetail({ capabilities: { state: 'under_review', content: { wattageWatts: 2200, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'unknown', airHeat: 'unknown' } } }),
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getToolCatalogueDetail({ versionId: id(31) })).rejects.toThrow();
    }
    rpc.mockResolvedValueOnce({ data: null, error: new Error('not-found') });
    await expect(getToolCatalogueDetail({ versionId: id(31) })).rejects.toThrow('not-found');
    client.supabase = null;
    await expect(getToolCatalogueDetail({ versionId: id(31) })).rejects.toThrow(/unavailable/);
    await expect(searchToolCatalogue({ query: 'dryer' })).rejects.toThrow(/unavailable/);
  });
});

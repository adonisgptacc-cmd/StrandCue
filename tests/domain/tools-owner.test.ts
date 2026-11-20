import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_ORDER,
  ChangeUserToolCommandSchema,
  CorrectUserToolCommandSchema,
  CreateUserToolCommandSchema,
  HEAT_METHOD_ORDER,
  ToolAttachmentsSchema,
  ToolCapabilitiesSchema,
  ToolConditionSchema,
  ToolHeatMethodsSchema,
  ToolSettingsSchema,
  knownSettingTemperatures,
  normalizeAttachments,
  normalizeHeatMethods,
  toolCorrectionChangesIdentity,
  toolCorrectionTargetRevision,
  toolFactsConflicts,
  toolStateBefore,
  type ToolRevision,
} from '../../packages/domain/src/tools.ts';
import * as domain from '../../packages/domain/src/index.ts';

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = { precision: 'day', value: '2026-03-01' } as const;
const create = (overrides: Record<string, unknown> = {}) => ({
  operationId: id(1), userToolId: id(2), effectiveDate: DAY, versionId: null,
  manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer', availability: 'available', ...overrides,
});

describe('heat methods', () => {
  it('keeps each method on its own and unknown as an answer of its own', () => {
    expect(HEAT_METHOD_ORDER).toEqual(['direct-contact', 'heated-air', 'hooded', 'steam', 'unheated']);
    for (const method of HEAT_METHOD_ORDER) {
      expect(ToolHeatMethodsSchema.parse({ state: 'recorded', methods: [method] })).toEqual({ state: 'recorded', methods: [method] });
    }
    expect(ToolHeatMethodsSchema.parse({ state: 'unknown' })).toEqual({ state: 'unknown' });
    // Unknown survives a round trip and never gains a method.
    const round = ToolHeatMethodsSchema.parse(JSON.parse(JSON.stringify(ToolHeatMethodsSchema.parse({ state: 'unknown' }))));
    expect(round).toEqual({ state: 'unknown' });
    expect(ToolHeatMethodsSchema.safeParse({ state: 'unknown', methods: ['steam'] }).success).toBe(false);
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: [] }).success).toBe(false);
  });

  it('treats steam, hooded heat and heated air as three different methods', () => {
    const steam = ToolHeatMethodsSchema.parse({ state: 'recorded', methods: ['steam'] });
    const air = ToolHeatMethodsSchema.parse({ state: 'recorded', methods: ['heated-air'] });
    const hooded = ToolHeatMethodsSchema.parse({ state: 'recorded', methods: ['hooded'] });
    expect(steam).not.toEqual(air);
    expect(hooded).not.toEqual(air);
    // A steamer that also dries with air is two explicit answers, never one inferred from the other.
    const heat = ToolHeatMethodsSchema.parse({ state: 'recorded', methods: ['heated-air', 'steam'] });
    expect(heat.state === 'recorded' ? heat.methods : null).toEqual(['heated-air', 'steam']);
  });

  it('refuses an unheated tool that also records a heated method, and never repairs it', () => {
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: ['heated-air', 'unheated'] }).success).toBe(false);
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: ['unheated'] }).success).toBe(true);
  });

  it('wants a canonical list: no duplicates, fixed order', () => {
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: ['steam', 'heated-air'] }).success).toBe(false);
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: ['steam', 'steam'] }).success).toBe(false);
    expect(normalizeHeatMethods(['steam', 'heated-air', 'steam'])).toEqual(['heated-air', 'steam']);
  });

  it('does not accept a diffuser, a model or a tool type as a method', () => {
    for (const method of ['diffuser', 'hair-dryer', 'dryer', 'contact', 'air']) {
      expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: [method] }).success).toBe(false);
    }
  });
});

describe('attachments', () => {
  it('records none, unknown or a bounded list, and a diffuser is never a heat source', () => {
    expect(ToolAttachmentsSchema.parse({ state: 'none' })).toEqual({ state: 'none' });
    expect(ToolAttachmentsSchema.parse({ state: 'unknown' })).toEqual({ state: 'unknown' });
    const diffuser = ToolAttachmentsSchema.parse({ state: 'recorded', items: [{ kind: 'diffuser' }] });
    expect(diffuser.state).toBe('recorded');
    expect(JSON.stringify(diffuser)).not.toMatch(/heat|air|steam/i);
    // No capability member exists on an attachment.
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'diffuser', heatSource: true }] }).success).toBe(false);
    expect(ToolHeatMethodsSchema.safeParse({ state: 'recorded', methods: ['diffuser'] }).success).toBe(false);
  });

  it('requires bounded owner wording for other, and none for a known kind', () => {
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'other' }] }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'other', other: '  ' }] }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'other', other: 'x'.repeat(61) }] }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'diffuser', other: 'finger diffuser' }] }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'other', other: 'Travel pouch' }] }).success).toBe(true);
  });

  it('is deduplicated, deterministically ordered and bounded', () => {
    expect(ATTACHMENT_ORDER).toEqual(['diffuser', 'concentrator', 'comb', 'brush', 'other']);
    expect(normalizeAttachments([{ kind: 'comb' }, { kind: 'diffuser' }, { kind: 'comb' }, { kind: 'other', other: 'b' }, { kind: 'other', other: 'a' }, { kind: 'other', other: 'a' }]))
      .toEqual([{ kind: 'diffuser' }, { kind: 'comb' }, { kind: 'other', other: 'a' }, { kind: 'other', other: 'b' }]);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'comb' }, { kind: 'diffuser' }] }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [{ kind: 'comb' }, { kind: 'comb' }] }).success).toBe(false);
    const many = Array.from({ length: 11 }, (_, n) => ({ kind: 'other', other: `a${String(n).padStart(2, '0')}` }));
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: many }).success).toBe(false);
    expect(ToolAttachmentsSchema.safeParse({ state: 'recorded', items: [] }).success).toBe(false);
  });
});

describe('settings and units', () => {
  it('keeps the owner words and any temperature in the unit it was recorded in', () => {
    const settings = ToolSettingsSchema.parse({ state: 'recorded', items: [
      { label: 'Low', temperature: null }, { label: 'High', temperature: null }, { label: 'Plate 2', temperature: { value: 180, unit: 'C' } },
      { label: 'Plate 3', temperature: { value: 350, unit: 'F' } },
    ] });
    expect(settings.state === 'recorded' && settings.items.map(item => item.label)).toEqual(['Low', 'High', 'Plate 2', 'Plate 3']);
    // The original value and unit are preserved: nothing is converted or rounded.
    expect(settings.state === 'recorded' && settings.items[3].temperature).toEqual({ value: 350, unit: 'F' });
  });

  it('never turns a label into a temperature', () => {
    const settings = ToolSettingsSchema.parse({ state: 'recorded', items: [{ label: 'High', temperature: null }, { label: 'Hot', temperature: null }] });
    expect(knownSettingTemperatures({ settings })).toEqual([]);
    expect(knownSettingTemperatures({ settings: ToolSettingsSchema.parse({ state: 'unknown' }) })).toEqual([]);
    expect(knownSettingTemperatures({ settings: null })).toEqual([]);
  });

  it('only reports temperatures the owner recorded, with their own unit', () => {
    const settings = ToolSettingsSchema.parse({ state: 'recorded', items: [
      { label: 'A', temperature: { value: 150, unit: 'C' } }, { label: 'B', temperature: null }, { label: 'C', temperature: { value: 300, unit: 'F' } },
    ] });
    expect(knownSettingTemperatures({ settings })).toEqual([{ label: 'A', value: 150, unit: 'C' }, { label: 'C', value: 300, unit: 'F' }]);
  });

  it('validates units and ranges instead of guessing', () => {
    const one = (temperature: unknown) => ToolSettingsSchema.safeParse({ state: 'recorded', items: [{ label: 'X', temperature }] }).success;
    expect(one({ value: 180, unit: 'C' })).toBe(true);
    expect(one({ value: 180, unit: 'K' })).toBe(false);
    expect(one({ value: 180 })).toBe(false);
    expect(one({ unit: 'C' })).toBe(false);
    expect(one({ value: 29, unit: 'C' })).toBe(false);
    expect(one({ value: 301, unit: 'C' })).toBe(false);
    expect(one({ value: 85, unit: 'F' })).toBe(false);
    expect(one({ value: 573, unit: 'F' })).toBe(false);
    expect(one({ value: 180.5, unit: 'C' })).toBe(false);
    expect(one({ value: '180', unit: 'C' })).toBe(false);
  });

  it('bounds the list and the words, and refuses repeated labels', () => {
    const item = (label: string) => ({ label, temperature: null });
    expect(ToolSettingsSchema.safeParse({ state: 'recorded', items: [] }).success).toBe(false);
    expect(ToolSettingsSchema.safeParse({ state: 'recorded', items: Array.from({ length: 11 }, (_, n) => item(`S${n}`)) }).success).toBe(false);
    expect(ToolSettingsSchema.safeParse({ state: 'recorded', items: [item('x'.repeat(61))] }).success).toBe(false);
    expect(ToolSettingsSchema.safeParse({ state: 'recorded', items: [item('  ')] }).success).toBe(false);
    expect(ToolSettingsSchema.safeParse({ state: 'recorded', items: [item('Low'), item('Low')] }).success).toBe(false);
    expect(ToolSettingsSchema.safeParse({ state: 'unknown', items: [item('Low')] }).success).toBe(false);
  });
});

describe('condition', () => {
  it('has an explicit unknown and no verdict about safety', () => {
    expect(ToolConditionSchema.options).toEqual(['good', 'worn', 'damaged', 'unknown']);
    for (const bad of ['safe', 'unsafe', 'broken-do-not-use', 'certified', '']) expect(ToolConditionSchema.safeParse(bad).success).toBe(false);
  });
});

describe('owner facts stay apart from catalogue capabilities', () => {
  it('keeps wattage and temperature independent in the owner record', () => {
    const parsed = CreateUserToolCommandSchema.parse(create({ wattageWatts: 2200, adjustableTemp: 'unknown' }));
    expect(parsed.wattageWatts).toBe(2200);
    expect(parsed.settings).toBeUndefined();
    expect(knownSettingTemperatures({ settings: parsed.settings ?? null })).toEqual([]);
    // Unknown, absent and cleared are three different answers.
    expect(CreateUserToolCommandSchema.parse(create({ wattageWatts: null })).wattageWatts).toBeNull();
    expect('wattageWatts' in CreateUserToolCommandSchema.parse(create())).toBe(false);
    expect(CreateUserToolCommandSchema.parse(create({ adjustableTemp: 'unknown' })).adjustableTemp).toBe('unknown');
    expect(CreateUserToolCommandSchema.safeParse(create({ wattageWatts: 0 })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ wattageWatts: 10001 })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ wattageWatts: 2200.5 })).success).toBe(false);
  });

  it('refuses any catalogue capability or inferred temperature on an owner command', () => {
    for (const extra of [{ temperatureMaxCelsius: 230 }, { contactHeat: 'yes' }, { airHeat: 'yes' }, { capabilities: {} }, { safeTemperature: 180 }, { temperature: 200 }]) {
      expect(CreateUserToolCommandSchema.safeParse(create(extra)).success).toBe(false);
      expect(ChangeUserToolCommandSchema.safeParse({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY, ...extra }).success).toBe(false);
    }
    // The catalogue's own capability record is unchanged and keeps its own independent unknowns.
    expect(ToolCapabilitiesSchema.parse({ wattageWatts: 2200, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'unknown', airHeat: 'unknown' }).temperatureMaxCelsius).toBeNull();
  });

  it('infers nothing from a model name, a tool type or a heat method', () => {
    const named = CreateUserToolCommandSchema.parse(create({ manualModel: 'Ceramic 230C Pro 2200W', toolType: 'flat-iron', heatMethods: { state: 'recorded', methods: ['direct-contact'] } }));
    expect(named.settings).toBeUndefined();
    expect(named.wattageWatts).toBeUndefined();
    expect(named.adjustableTemp).toBeUndefined();
    expect(knownSettingTemperatures({ settings: named.settings ?? null })).toEqual([]);
    expect(CreateUserToolCommandSchema.parse(create({ toolType: 'diffuser' })).heatMethods).toBeUndefined();
    expect(CreateUserToolCommandSchema.parse(create({ toolType: 'hood-dryer' })).heatMethods).toBeUndefined();
  });

  it('refuses contradictory combinations instead of repairing them', () => {
    expect(toolFactsConflicts({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: 'yes', settings: null })).toEqual(['unheated-adjustable-temperature']);
    expect(toolFactsConflicts({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: null,
      settings: { state: 'recorded', items: [{ label: 'A', temperature: { value: 150, unit: 'C' } }] } })).toEqual(['unheated-setting-temperature']);
    expect(toolFactsConflicts({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: 'unknown', settings: { state: 'recorded', items: [{ label: 'Fast', temperature: null }] } })).toEqual([]);
    expect(toolFactsConflicts({ heatMethods: { state: 'unknown' }, adjustableTemp: 'yes', settings: null })).toEqual([]);
    expect(CreateUserToolCommandSchema.safeParse(create({ heatMethods: { state: 'recorded', methods: ['unheated'] }, adjustableTemp: 'yes' })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ heatMethods: { state: 'recorded', methods: ['unheated'] }, settings: { state: 'recorded', items: [{ label: 'A', temperature: { value: 150, unit: 'C' } }] } })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ heatMethods: { state: 'recorded', methods: ['heated-air'] }, adjustableTemp: 'yes' })).success).toBe(true);
  });

  it('keeps manual identity required for a manual entry and a link out of a baseline', () => {
    expect(CreateUserToolCommandSchema.safeParse(create({ manualModel: null })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ versionId: id(9) })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ manualBrand: null })).success).toBe(true);
    expect(CreateUserToolCommandSchema.safeParse(create({ toolType: null })).success).toBe(true);
    expect(CreateUserToolCommandSchema.safeParse(create({ notes: 'x'.repeat(2001) })).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse({ ...create(), owner: id(8) }).success).toBe(false);
    expect(CreateUserToolCommandSchema.safeParse(create({ availability: 'sold' })).success).toBe(false);
  });

  it('records condition with its own unknown, and every fact can be cleared', () => {
    expect(CreateUserToolCommandSchema.parse(create({ condition: 'unknown' })).condition).toBe('unknown');
    const change = ChangeUserToolCommandSchema.parse({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY,
      condition: null, settings: null, attachments: null, heatMethods: null, wattageWatts: null, adjustableTemp: null, notes: null });
    expect(change).toMatchObject({ condition: null, settings: null, attachments: null, heatMethods: null, wattageWatts: null, adjustableTemp: null, notes: null });
    // An ordinary change never carries the identity.
    for (const identity of [{ manualBrand: 'x' }, { manualModel: 'x' }, { toolType: 'dryer' }]) {
      expect(ChangeUserToolCommandSchema.safeParse({ operationId: id(3), userToolId: id(2), expectedRevision: 1, effectiveDate: DAY, ...identity }).success).toBe(false);
    }
  });
});

describe('identity corrections', () => {
  const correction = (overrides: Record<string, unknown> = {}) => ({
    operationId: id(4), userToolId: id(2), expectedRevision: 2, correctsId: id(5), reason: 'Typo', effectiveDate: DAY, ...overrides,
  });

  it('must carry an identity field, and facts alone cannot make a correction', () => {
    expect(CorrectUserToolCommandSchema.safeParse(correction({ manualModel: 'Pro dryer 2' })).success).toBe(true);
    expect(CorrectUserToolCommandSchema.safeParse(correction({ toolType: 'flat-iron' })).success).toBe(true);
    expect(CorrectUserToolCommandSchema.safeParse(correction({ manualBrand: null })).success).toBe(true);
    expect(CorrectUserToolCommandSchema.safeParse(correction({ condition: 'worn' })).success).toBe(false);
    expect(CorrectUserToolCommandSchema.safeParse(correction()).success).toBe(false);
    expect(CorrectUserToolCommandSchema.safeParse(correction({ manualModel: 'x', reason: '  ' })).success).toBe(false);
    expect(CorrectUserToolCommandSchema.safeParse(correction({ manualModel: 'x', availability: 'archived' })).success).toBe(false);
  });

  it('refuses a no-op, trims words, never folds case, and lets a clear count only over a recorded value', () => {
    const current = { manualBrand: 'Salon brand', manualModel: 'Pro dryer', toolType: 'dryer' };
    expect(toolCorrectionChangesIdentity(current, { manualModel: 'Pro dryer' })).toBe(false);
    expect(toolCorrectionChangesIdentity(current, { manualModel: '  Pro dryer  ' })).toBe(false);
    expect(toolCorrectionChangesIdentity(current, { manualModel: 'pro dryer' })).toBe(true);
    expect(toolCorrectionChangesIdentity(current, { toolType: 'flat-iron' })).toBe(true);
    expect(toolCorrectionChangesIdentity(current, { notes: 'x', condition: 'worn', wattageWatts: 2000 })).toBe(false);
    expect(toolCorrectionChangesIdentity(current, { manualBrand: null })).toBe(true);
    expect(toolCorrectionChangesIdentity({ manualBrand: null, manualModel: 'M', toolType: null }, { manualBrand: null })).toBe(false);
    expect(toolCorrectionChangesIdentity(null, null)).toBe(false);
  });

  const rev = (n: number, kind: ToolRevision['kind'], patch: Record<string, unknown> | null, correctsId: string | null = null): ToolRevision =>
    ({ id: id(100 + n), kind, correctsId, patch });

  it('targets only the last revision in force that carries the identity', () => {
    const history = [
      rev(1, 'baseline', { manualModel: 'Pro dryer', toolType: 'dryer' }), rev(2, 'change', { condition: 'worn' }), rev(3, 'match', { versionId: id(9) }),
    ];
    expect(toolCorrectionTargetRevision(history)?.id).toBe(id(101));
    const corrected = [...history, rev(4, 'correction', { manualModel: 'Pro dryer 2' }, id(101))];
    expect(toolCorrectionTargetRevision(corrected)?.id).toBe(id(104));
    expect(toolCorrectionTargetRevision([rev(1, 'baseline', {}), rev(2, 'archive', { availability: 'archived' })])).toBeNull();
    expect(toolCorrectionTargetRevision(null)).toBeNull();
    expect(toolCorrectionTargetRevision([])).toBeNull();
  });

  it('replays the history before a correction and fails closed on a broken one', () => {
    const history = [
      rev(1, 'baseline', { manualModel: 'Pro dryer', condition: 'good' }), rev(2, 'change', { condition: 'worn', notes: 'n' }),
      rev(3, 'correction', { manualModel: 'Pro dryer 2', notes: null }, id(101)),
    ];
    // The state through the entry a correction names, replayed from the whole history before it.
    expect(toolStateBefore(history, id(101))).toEqual({ manualModel: 'Pro dryer', condition: 'good' });
    expect(toolStateBefore(history, id(102))).toEqual({ manualModel: 'Pro dryer', condition: 'worn', notes: 'n' });
    expect(toolStateBefore(history, id(999))).toBeNull();
    expect(toolStateBefore([...history, rev(1, 'change', {})], id(103))).toBeNull();
    expect(toolStateBefore([rev(3, 'correction', {}, id(555))], id(103))).toBeNull();
    expect(toolStateBefore(history, null)).toBeNull();
    expect(toolStateBefore([], id(101))).toBeNull();
  });
});

describe('barrel', () => {
  it('is exported from the domain index', () => {
    expect(domain.ToolHeatMethodsSchema).toBe(ToolHeatMethodsSchema);
  });
});

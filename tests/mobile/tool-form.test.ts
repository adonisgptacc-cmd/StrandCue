import { describe, expect, it } from 'vitest';

import {
  emptyToolForm,
  factsFromForm,
  factsPatch,
  formFromDetail,
  formProblems,
  identityPatch,
  toggleAttachmentKind,
  toggleHeatMethod,
  type ToolForm,
} from '../../apps/mobile/src/tool-form';

const form = (overrides: Partial<ToolForm> = {}): ToolForm => ({ ...emptyToolForm(), model: 'Pro dryer', ...overrides });
const detail = (overrides: Record<string, unknown> = {}) => ({
  id: 'c0000000-0000-4000-8000-000000000002', revision: 1, availability: 'available', matched: false, matchConfirmed: false,
  manualBrand: 'Salon', manualModel: 'Pro dryer', toolType: 'dryer', wattageWatts: null, adjustableTemp: null, settings: null, attachments: null,
  condition: null, heatMethods: null, notes: null, versionId: null, revisions: [], ...overrides,
}) as never;

describe('the form starts unanswered and reads back what was stored', () => {
  it('has no answer for any fact until the owner gives one', () => {
    const empty = emptyToolForm();
    expect(factsFromForm(empty)).toEqual({});
    expect(empty).toMatchObject({ toolType: '', adjustable: '', settingsState: '', attachmentsState: '', condition: '', heatState: '', wattage: '' });
  });

  it('round-trips a stored record, keeping unknown, none and recorded apart', () => {
    const stored = detail({
      wattageWatts: 2200, adjustableTemp: 'unknown', condition: 'worn', notes: 'Mine',
      settings: { state: 'recorded', items: [{ label: 'Plate 2', temperature: { value: 350, unit: 'F' } }, { label: 'Low', temperature: null }] },
      attachments: { state: 'recorded', items: [{ kind: 'diffuser' }, { kind: 'other', other: 'Travel pouch' }] },
      heatMethods: { state: 'recorded', methods: ['heated-air', 'steam'] },
    });
    const read = formFromDetail(stored);
    expect(read).toMatchObject({ wattage: '2200', adjustable: 'unknown', condition: 'worn', notes: 'Mine', settingsState: 'recorded', attachmentsState: 'recorded', heatState: 'recorded' });
    expect(read.settings).toEqual([{ label: 'Plate 2', value: '350', unit: 'F' }, { label: 'Low', value: '', unit: 'C' }]);
    expect(read.attachmentKinds).toEqual(['diffuser', 'other']);
    expect(read.attachmentOther).toBe('Travel pouch');
    expect(factsFromForm(read)).toEqual({
      wattageWatts: 2200, adjustableTemp: 'unknown', condition: 'worn', notes: 'Mine',
      settings: { state: 'recorded', items: [{ label: 'Plate 2', temperature: { value: 350, unit: 'F' } }, { label: 'Low', temperature: null }] },
      attachments: { state: 'recorded', items: [{ kind: 'diffuser' }, { kind: 'other', other: 'Travel pouch' }] },
      heatMethods: { state: 'recorded', methods: ['heated-air', 'steam'] },
    });
    const unknowns = formFromDetail(detail({ settings: { state: 'unknown' }, attachments: { state: 'none' }, heatMethods: { state: 'unknown' } }));
    expect(factsFromForm(unknowns)).toEqual({ settings: { state: 'unknown' }, attachments: { state: 'none' }, heatMethods: { state: 'unknown' } });
    expect(formFromDetail(null)).toEqual(emptyToolForm());
  });
});

describe('facts built from the form', () => {
  it('never derives a temperature from a wattage, a label, a name or a method', () => {
    const facts = factsFromForm(form({ model: 'Ceramic 230C 2200W', wattage: '2200', toolType: 'flat-iron', heatState: 'recorded', heatMethods: ['direct-contact'],
      settingsState: 'recorded', settings: [{ label: 'High', value: '', unit: 'C' }] }));
    expect(facts.wattageWatts).toBe(2200);
    expect(facts.settings).toEqual({ state: 'recorded', items: [{ label: 'High', temperature: null }] });
    expect(JSON.stringify(facts)).not.toMatch(/"value"/);
  });

  it('reads a temperature only with its unit, trims words and normalizes the lists', () => {
    const facts = factsFromForm(form({
      settingsState: 'recorded', settings: [{ label: '  Plate 2 ', value: ' 180 ', unit: 'C' }],
      attachmentsState: 'recorded', attachmentKinds: ['other', 'comb', 'diffuser'], attachmentOther: '  Pouch ',
      heatState: 'recorded', heatMethods: ['steam', 'heated-air'], wattage: ' 1800 ', notes: '  note  ',
    }));
    expect(facts.settings).toEqual({ state: 'recorded', items: [{ label: 'Plate 2', temperature: { value: 180, unit: 'C' } }] });
    expect(facts.attachments).toEqual({ state: 'recorded', items: [{ kind: 'diffuser' }, { kind: 'comb' }, { kind: 'other', other: 'Pouch' }] });
    expect(facts.heatMethods).toEqual({ state: 'recorded', methods: ['heated-air', 'steam'] });
    expect(facts.wattageWatts).toBe(1800);
    expect(facts.notes).toBe('note');
  });

  it('keeps an unfinished list unanswered rather than inventing an entry', () => {
    expect(factsFromForm(form({ settingsState: 'recorded', settings: [] })).settings).toBeUndefined();
    expect(factsFromForm(form({ attachmentsState: 'recorded', attachmentKinds: [] })).attachments).toBeUndefined();
    expect(factsFromForm(form({ heatState: 'recorded', heatMethods: [] })).heatMethods).toBeUndefined();
  });
});

describe('toggling', () => {
  it('lets unheated stand alone and a heated method displace it', () => {
    expect(toggleHeatMethod(['heated-air', 'steam'], 'unheated')).toEqual(['unheated']);
    expect(toggleHeatMethod(['unheated'], 'steam')).toEqual(['steam']);
    expect(toggleHeatMethod(['steam'], 'steam')).toEqual([]);
    expect(toggleHeatMethod(['steam'], 'heated-air')).toEqual(['heated-air', 'steam']);
  });

  it('keeps a diffuser an attachment: it never selects a heat method', () => {
    expect(toggleAttachmentKind([], 'diffuser')).toEqual(['diffuser']);
    expect(toggleAttachmentKind(['diffuser'], 'diffuser')).toEqual([]);
    expect(toggleAttachmentKind(['comb'], 'diffuser')).toEqual(['diffuser', 'comb']);
    const state = form({ attachmentsState: 'recorded', attachmentKinds: toggleAttachmentKind([], 'diffuser') });
    expect(factsFromForm(state).heatMethods).toBeUndefined();
  });
});

describe('problems are said plainly, field by field', () => {
  it('accepts a clean form', () => { expect(formProblems(form())).toEqual({}); });

  it('refuses a "I will list them" choice with nothing listed, so an edit never drops a saved answer silently', () => {
    expect(formProblems(form({ settingsState: 'recorded', settings: [] })).settings).toBe('Add at least one setting, or choose Not sure or Not answered.');
    expect(formProblems(form({ attachmentsState: 'recorded', attachmentKinds: [] })).attachments).toBe('Choose at least one attachment, or choose None, Not sure or Not answered.');
    expect(formProblems(form({ heatState: 'recorded', heatMethods: [] })).heat).toBe('Choose at least one heat method, or choose Not sure or Not answered.');
  });

  it('refuses a power that is not a whole number of watts', () => {
    for (const wattage of ['0', '10001', '22.5', 'abc', '-3']) expect(formProblems(form({ wattage })).wattage, wattage).toBe('Power is a whole number of watts, from 1 to 10000.');
    expect(formProblems(form({ wattage: '' })).wattage).toBeUndefined();
  });

  it('refuses a temperature without a valid number for its unit, a nameless setting and a repeated one', () => {
    const rows = (settings: ToolForm['settings']) => formProblems(form({ settingsState: 'recorded', settings })).settings;
    expect(rows([{ label: 'A', value: '29', unit: 'C' }])).toContain('between 30 and 300 degrees Celsius');
    expect(rows([{ label: 'A', value: '85', unit: 'F' }])).toContain('between 86 and 572 degrees Fahrenheit');
    expect(rows([{ label: 'A', value: '18x', unit: 'C' }])).toContain('whole number');
    expect(rows([{ label: ' ', value: '', unit: 'C' }])).toBe('Give each setting a name.');
    expect(rows([{ label: 'A', value: '', unit: 'C' }, { label: 'A', value: '', unit: 'F' }])).toBe('Each setting is listed once.');
    expect(rows([{ label: 'x'.repeat(61), value: '', unit: 'C' }])).toBe('A setting name is at most 60 characters.');
    expect(rows(Array.from({ length: 11 }, (_, n) => ({ label: `S${n}`, value: '', unit: 'C' as const })))).toBe('Use at most 10 settings.');
    expect(rows([{ label: 'High', value: '', unit: 'C' }])).toBeUndefined();
  });

  it('refuses other without a name', () => {
    expect(formProblems(form({ attachmentsState: 'recorded', attachmentKinds: ['other'], attachmentOther: ' ' })).attachments).toBe('Name the other attachment.');
    expect(formProblems(form({ attachmentsState: 'recorded', attachmentKinds: ['other'], attachmentOther: 'x'.repeat(61) })).attachments).toBe('An attachment name is at most 60 characters.');
    expect(formProblems(form({ attachmentsState: 'recorded', attachmentKinds: ['other'], attachmentOther: 'Pouch' })).attachments).toBeUndefined();
  });

  it('refuses an unheated tool that states a temperature, and does not repair it', () => {
    const unheated = { heatState: 'recorded' as const, heatMethods: ['unheated' as const] };
    expect(formProblems(form({ ...unheated, adjustable: 'yes' })).heat).toBe('A tool cannot be both unheated and have a temperature. Change one of those answers.');
    expect(formProblems(form({ ...unheated, settingsState: 'recorded', settings: [{ label: 'A', value: '150', unit: 'C' }] })).heat)
      .toBe('A tool cannot be both unheated and have a temperature. Change one of those answers.');
    expect(formProblems(form({ ...unheated, adjustable: 'unknown', settingsState: 'recorded', settings: [{ label: 'Fast', value: '', unit: 'C' }] })).heat).toBeUndefined();
    expect(formProblems(form({ heatState: 'recorded', heatMethods: ['heated-air'], adjustable: 'yes' })).heat).toBeUndefined();
  });

  it('wants a model for a manual tool and bounds the words', () => {
    expect(formProblems(form({ model: ' ' }), 'add').model).toBe('A tool you add by hand needs a model.');
    expect(formProblems(form({ model: 'x'.repeat(201) }), 'add').model).toBe('The model is at most 200 characters.');
    expect(formProblems(form({ brand: 'x'.repeat(201) }), 'add').brand).toBe('The brand is at most 200 characters.');
    expect(formProblems(form({ notes: 'x'.repeat(2001) })).notes).toBe('Notes are at most 2000 characters.');
    expect(formProblems(form({ model: ' ' }), 'edit').model).toBeUndefined();
  });
});

describe('what an edit sends', () => {
  const start = formFromDetail(detail({ wattageWatts: 2200, condition: 'worn', settings: { state: 'unknown' }, notes: 'Mine' }));

  it('sends nothing for an untouched form', () => { expect(factsPatch(start, start)).toEqual({}); });

  it('keeps cleared, unknown and recorded apart', () => {
    const next = { ...start, wattage: '', settingsState: 'recorded' as const, settings: [{ label: 'High', value: '', unit: 'C' as const }], condition: 'unknown' as const, notes: '  ' };
    expect(factsPatch(start, next)).toEqual({
      wattageWatts: null, settings: { state: 'recorded', items: [{ label: 'High', temperature: null }] }, condition: 'unknown', notes: null,
    });
  });

  it('does not send a taken-back answer as null when it was never answered', () => {
    const blank = formFromDetail(detail());
    expect(factsPatch(blank, { ...blank, wattage: '' })).toEqual({});
    expect(factsPatch(blank, { ...blank, adjustable: 'unknown' })).toEqual({ adjustableTemp: 'unknown' });
    expect(factsPatch(start, { ...start, settingsState: '' })).toEqual({ settings: null });
  });

  it('treats a different order of attachments as the same answer', () => {
    const a = { ...blankWith(), attachmentsState: 'recorded' as const, attachmentKinds: ['comb', 'diffuser'] };
    const b = { ...a, attachmentKinds: ['diffuser', 'comb'] };
    expect(factsPatch(a, b)).toEqual({});
    function blankWith() { return formFromDetail(detail()); }
  });
});

describe('what a correction sends', () => {
  const start = formFromDetail(detail());

  it('sends only the identity that changed, and null for a cleared part', () => {
    expect(identityPatch(start, { ...start, model: 'Pro dryer 2' })).toEqual({ manualModel: 'Pro dryer 2' });
    expect(identityPatch(start, { ...start, brand: '' })).toEqual({ manualBrand: null });
    expect(identityPatch(start, { ...start, toolType: 'flat-iron' })).toEqual({ toolType: 'flat-iron' });
    expect(identityPatch(start, { ...start, toolType: '' })).toEqual({ toolType: null });
  });

  it('reports no change for the same words, trimmed, and for facts alone', () => {
    expect(identityPatch(start, { ...start, model: '  Pro dryer  ' })).toEqual({});
    expect(identityPatch(start, { ...start, condition: 'worn', notes: 'x', wattage: '1500' })).toEqual({});
    expect(identityPatch(start, { ...start, model: 'pro dryer' })).toEqual({ manualModel: 'pro dryer' });
    const unnamed = formFromDetail(detail({ manualBrand: null }));
    expect(identityPatch(unnamed, { ...unnamed, brand: '' })).toEqual({});
  });
});

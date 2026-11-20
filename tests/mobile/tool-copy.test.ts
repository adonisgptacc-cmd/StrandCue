import { describe, expect, it } from 'vitest';
import type { ToolSettings } from '../../packages/domain/src/index';

import {
  adjustableTempLine, attachmentsLine, catalogueCapabilityLines, conditionLabel, heatMethodsLine, ownerToolLines, recordedToolIdentityWording, settingsLines,
  temperatureLine, toolAvailabilityLabel, toolCandidateLines, toolCardLines, toolComparisonLine, toolDetailFailure, toolLifecycleLine, toolRevisionKindLabel,
  toolMatchFailure, toolRevisionLines, toolSaveFailure, toolTypeLabel, wattageLine,
} from '../../apps/mobile/src/tool-copy';

const settings = { state: 'recorded', items: [{ label: 'Low', temperature: null }, { label: 'Plate 2', temperature: { value: 350, unit: 'F' } }, { label: 'Plate 3', temperature: { value: 180, unit: 'C' } }] } as unknown as ToolSettings;

describe('owner tool wording', () => {
  it('keeps not answered, not sure and none apart', () => {
    expect(heatMethodsLine(null)).toBe('How it heats: Not answered');
    expect(heatMethodsLine({ state: 'unknown' })).toBe('How it heats: Not sure');
    expect(attachmentsLine(null)).toBe('Attachments: Not answered');
    expect(attachmentsLine({ state: 'unknown' })).toBe('Attachments: Not sure');
    expect(attachmentsLine({ state: 'none' })).toBe('Attachments: None');
    expect(settingsLines(null)).toEqual(['Settings: Not answered']);
    expect(settingsLines({ state: 'unknown' })).toEqual(['Settings: Not sure']);
    expect(adjustableTempLine(null)).toBe('Adjustable temperature: Not answered');
    expect(adjustableTempLine('unknown')).toBe('Adjustable temperature: Not sure');
    expect(adjustableTempLine('yes')).toBe('Adjustable temperature: Yes');
    expect(adjustableTempLine('no')).toBe('Adjustable temperature: No');
    expect(conditionLabel(null)).toBe('Not answered');
    expect(conditionLabel('unknown')).toBe('Not sure');
    expect(toolTypeLabel(null)).toBe('Not answered');
  });

  it('says each heat method on its own, and lists attachments without a word about heat', () => {
    expect(heatMethodsLine({ state: 'recorded', methods: ['heated-air', 'hooded', 'steam'] })).toBe('How it heats: Heated air; Hooded heat; Steam');
    expect(heatMethodsLine({ state: 'recorded', methods: ['unheated'] })).toBe('How it heats: Unheated');
    expect(heatMethodsLine({ state: 'recorded', methods: ['direct-contact'] })).toBe('How it heats: Direct-contact heat');
    const line = attachmentsLine({ state: 'recorded', items: [{ kind: 'diffuser' }, { kind: 'concentrator' }, { kind: 'other', other: 'Travel pouch' }] });
    expect(line).toBe('Attachments: Diffuser; Concentrator nozzle; Travel pouch');
    expect(line).not.toMatch(/heat|air|steam/i);
  });

  it('says a temperature with its own unit and never derives one', () => {
    expect(settingsLines(settings)).toEqual(['Setting: Low', 'Setting: Plate 2, 350 degrees Fahrenheit', 'Setting: Plate 3, 180 degrees Celsius']);
    expect(temperatureLine(settings)).toBe('Temperatures you recorded: Plate 2 350 degrees Fahrenheit; Plate 3 180 degrees Celsius');
    expect(temperatureLine({ state: 'recorded', items: [{ label: 'High', temperature: null }] })).toBe('Temperature: Not recorded');
    expect(temperatureLine(null)).toBe('Temperature: Not recorded');
    expect(temperatureLine({ state: 'unknown' })).toBe('Temperature: Not recorded');
    expect(wattageLine(2200)).toBe('Power: 2200 watts');
    expect(wattageLine(null)).toBe('Power: Not answered');
  });

  it('shows a known wattage next to an unrecorded temperature, with nothing between them', () => {
    const lines = ownerToolLines({
      availability: 'available', matched: false, matchConfirmed: false, manualBrand: 'Salon', manualModel: 'Quiet dryer', toolType: 'dryer', wattageWatts: 1800,
      adjustableTemp: 'unknown', settings: null, attachments: null, condition: null, heatMethods: { state: 'recorded', methods: ['heated-air'] }, notes: null,
    });
    expect(lines).toEqual([
      'Brand: Salon', 'Model: Quiet dryer', 'Type: Hair dryer', 'Status: Available', 'Power: 1800 watts', 'Adjustable temperature: Not sure', 'Settings: Not answered',
      'Temperature: Not recorded', 'How it heats: Heated air', 'Attachments: Not answered', 'Condition: Not answered', 'Your notes: Not answered',
    ]);
  });

  it('words condition as an observation, never a verdict about safety', () => {
    expect(conditionLabel('good')).toBe('No problems noticed');
    expect(conditionLabel('worn')).toBe('Some wear');
    expect(conditionLabel('damaged')).toBe('Damaged or faulty, as you recorded it');
    for (const value of ['good', 'worn', 'damaged', 'unknown']) expect(conditionLabel(value)).not.toMatch(/\bsafe\b|unsafe|hazard|danger|do not use|certified|electrical/i);
    expect(toolAvailabilityLabel('out_of_stock')).toBe('Not available right now');
    expect(toolAvailabilityLabel('mystery')).toBe('Availability unknown');
  });

  it('words the list card', () => {
    expect(toolCardLines({ manualBrand: 'Salon', toolType: 'flat-iron', condition: 'worn', heatMethods: { state: 'unknown' }, matched: true }))
      .toEqual(['Brand: Salon', 'Type: Flat iron', 'Condition: Some wear', 'How it heats: Not sure', 'Linked to a catalogue version.']);
    expect(toolCardLines({ manualBrand: null, toolType: null, condition: null, heatMethods: null, matched: false }))
      .toEqual(['Type: Not answered', 'Manual entry, not linked to the catalogue.']);
  });
});

describe('history wording', () => {
  it('keeps recorded, not sure, removed and not answered apart', () => {
    const lines = toolRevisionLines({ manualModel: 'Pro dryer', wattageWatts: 2200, condition: 'unknown', settings: null, notes: null, attachments: { state: 'none' }, heatMethods: { state: 'recorded', methods: ['steam'] } },
      { settings: { state: 'unknown' } });
    expect(lines).toEqual([
      'Model: Pro dryer', 'Power: 2200 watts', 'Settings: Removed saved answer', 'Attachments: None', 'Condition: Not sure', 'How it heats: Steam', 'Your notes: Not answered in this entry',
    ]);
    expect(toolRevisionLines(undefined, null)).toEqual([]);
    expect(toolRevisionLines({ availability: 'archived', toolType: 'dryer', adjustableTemp: 'yes' }, null)).toEqual(['Type: Hair dryer', 'Status: Archived', 'Adjustable temperature: Yes']);
    expect(toolRevisionLines({ settings: { state: 'recorded', items: [{ label: 'High', temperature: { value: 200, unit: 'C' } }] } }, null)).toEqual(['Settings: High, 200 degrees Celsius']);
  });

  it('tells a correction apart: what it changed, what it kept, what it removed and what was never answered', () => {
    const before = { manualModel: 'Pro', wattageWatts: 1800, notes: 'Second hand' };
    expect(toolRevisionLines({ manualModel: 'Pro 2', wattageWatts: null }, before, 'correction')).toEqual([
      'Brand: Not answered', 'Model: Pro 2', 'Type: Not answered', 'Power: Removed saved answer', 'Adjustable temperature: Not answered',
      'Settings: Not answered', 'Attachments: Not answered', 'Condition: Not answered', 'How it heats: Not answered', 'Your notes: Kept as it was',
    ]);
    // An ordinary change lists only what it recorded, and says a taken-back answer was taken back.
    expect(toolRevisionLines({ wattageWatts: null }, before, 'change')).toEqual(['Power: Removed saved answer']);
    expect(toolRevisionLines({ condition: null }, before, 'change')).toEqual(['Condition: Not answered in this entry']);
  });

  it('names revision kinds and the identity an entry recorded', () => {
    expect(['baseline', 'match', 'archive', 'correction', 'change'].map(toolRevisionKindLabel)).toEqual(['Original entry', 'Catalogue match', 'Archive', 'Correction', 'Change']);
    expect(recordedToolIdentityWording({ manualBrand: 'Salon', manualModel: 'Pro', toolType: 'dryer' })).toBe('Salon, Pro, Hair dryer');
    expect(recordedToolIdentityWording({ manualBrand: null })).toBe('no identity');
    expect(recordedToolIdentityWording(undefined)).toBe('no identity');
  });
});

describe('catalogue wording', () => {
  const candidate = { versionId: 'f0000000-0000-4000-8000-0000000000a1', toolId: 'f0000000-0000-4000-8000-0000000000b1', brand: 'Salon Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA', lifecycle: 'retired' } as const;

  it('presents the exact version and labels a retired one as retired', () => {
    expect(toolCandidateLines(candidate)).toEqual(['Brand: Salon Brand', 'Tool: Pro Dryer', 'Version: 2024', 'Type: Hair dryer', 'Market: South Africa']);
    expect(toolCandidateLines({ ...candidate, market: 'unknown' })).toContain('Market: Not recorded in the catalogue');
    expect(toolLifecycleLine(candidate)).toBe('Catalogue status: retired version');
    expect(toolLifecycleLine({ lifecycle: 'active' })).toBe('Catalogue status: current version');
  });

  it('words each comparison without calling an unknown a difference', () => {
    expect(toolComparisonLine({ field: 'brand', manual: 'A', catalogue: 'A', status: 'same' })).toBe('Brand: the same wording in both.');
    expect(toolComparisonLine({ field: 'toolType', manual: 'dryer', catalogue: 'flat-iron', status: 'different' })).toBe('Type: different. You recorded "Hair dryer"; the catalogue lists "Flat iron".');
    expect(toolComparisonLine({ field: 'model', manual: null, catalogue: 'Pro Dryer', status: 'unknown' })).toBe('Model: you did not record one; the catalogue lists "Pro Dryer", so it cannot be compared.');
  });

  it('states published capabilities exactly, keeping a wattage apart from a temperature', () => {
    expect(catalogueCapabilityLines({ wattageWatts: 2200, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'no', airHeat: 'yes' })).toEqual([
      'Power: 2200 watts', 'Highest temperature: Not recorded in the catalogue', 'Adjustable temperature: Not recorded in the catalogue', 'Direct-contact heat: No', 'Heated air: Yes',
    ]);
    expect(catalogueCapabilityLines({ wattageWatts: null, temperatureMaxCelsius: 230, adjustableTemp: 'yes', contactHeat: 'yes', airHeat: 'unknown' })[1]).toBe('Highest temperature: 230 degrees Celsius');
  });
});

describe('failure wording', () => {
  it('words a failed match about a tool, never about a product', () => {
    expect(toolMatchFailure(new Error('revision-conflict'))).toMatchObject({ kind: 'conflict', message: expect.stringContaining('This tool changed elsewhere') });
    expect(toolMatchFailure(new Error('authentication-required')).kind).toBe('retry');
    expect(toolMatchFailure(new Error('version-not-found')).message).toBe('That catalogue version is no longer available. Nothing was linked. Go back and search again.');
    expect(toolMatchFailure(new Error('confirmation-required')).kind).toBe('refused');
    expect(toolMatchFailure(new Error('Network request failed')).message).toContain('The match could not be saved. Nothing was linked yet.');
    for (const code of ['revision-conflict', 'authentication-required', 'version-not-found', 'invalid-x', 'boom']) expect(toolMatchFailure(new Error(code)).message).not.toMatch(/product/i);
  });

  it('classifies a failed save and never repeats server text', () => {
    expect(toolSaveFailure(new Error('revision-conflict'))).toMatchObject({ kind: 'conflict' });
    expect(toolSaveFailure(new Error('revision-conflict')).message).toContain('changed elsewhere');
    expect(toolSaveFailure(new Error('invalid-heat-combination')).message).toBe('A tool cannot be both unheated and have a temperature. Change one of those answers.');
    expect(toolSaveFailure(new Error('invalid-correction-noop')).message).toContain('same as before');
    expect(toolSaveFailure(new Error('already-corrected')).kind).toBe('refused');
    // A signed-out save keeps its command: signing in again lets the same save go through.
    expect(toolSaveFailure(new Error('authentication-required'))).toMatchObject({ kind: 'retry' });
    expect(toolSaveFailure(new Error('authentication-required')).message).toContain('Sign in again');
    // A failure that retrying cannot cure is not offered as a retry.
    expect(toolSaveFailure(new Error('Draft limit reached'))).toMatchObject({ kind: 'refused', message: expect.stringContaining('unsent saves') });
    expect(toolSaveFailure(new Error('account-not-active')).kind).toBe('refused');
    expect(toolSaveFailure(new Error('invalid-something-new')).kind).toBe('refused');
    for (const code of ['invalid-correction-target', 'invalid-correction', 'invalid-identity', 'invalid-tool', 'invalid-wattage', 'invalid-settings', 'invalid-attachments', 'invalid-heat-methods', 'invalid-condition', 'invalid-notes']) {
      const failure = toolSaveFailure(new Error(code));
      expect(failure.kind).toBe('refused');
      expect(failure.message).not.toContain(code);
    }
    const network = toolSaveFailure(new Error('Network request failed: secret detail'));
    expect(network.kind).toBe('retry');
    expect(network.message).not.toContain('secret');
    expect(network.message).toContain('retry');
  });

  it('classifies a failed read', () => {
    expect(toolDetailFailure(new Error('not-found')).kind).toBe('not_found');
    expect(toolDetailFailure(new Error('authentication-required')).kind).toBe('auth');
    expect(toolDetailFailure(new Error('boom: select secret')).message).toBe('The tool details could not be loaded. Nothing was changed. Try again.');
  });
});

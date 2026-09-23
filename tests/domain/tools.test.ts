import { describe, expect, it } from 'vitest';

import {
  ArchiveUserToolCommandSchema,
  ChangeUserToolCommandSchema,
  CreateUserToolCommandSchema,
  MatchUserToolCommandSchema,
  ToolCapabilitiesSchema,
  describeCapabilities,
} from '../../packages/domain/src/tools.ts';

describe('tools capability and ownership domain', () => {
  it('keeps wattage and temperature as independent unknowns', () => {
    const knownWattage = ToolCapabilitiesSchema.parse({
      wattageWatts: 2200,
      temperatureMaxCelsius: null,
      adjustableTemp: 'unknown',
      contactHeat: 'unknown',
      airHeat: 'unknown',
    });
    // Known wattage must never imply a temperature.
    expect(knownWattage.wattageWatts).toBe(2200);
    expect(knownWattage.temperatureMaxCelsius).toBeNull();
    const knownTemp = ToolCapabilitiesSchema.parse({ ...knownWattage, wattageWatts: null, temperatureMaxCelsius: 230 });
    expect(knownTemp.wattageWatts).toBeNull();
    expect(knownTemp.temperatureMaxCelsius).toBe(230);
    const bothUnknown = ToolCapabilitiesSchema.parse({
      wattageWatts: null,
      temperatureMaxCelsius: null,
      adjustableTemp: 'unknown',
      contactHeat: 'unknown',
      airHeat: 'unknown',
    });
    expect(bothUnknown).toMatchObject({ wattageWatts: null, temperatureMaxCelsius: null });
  });

  it('describes capabilities with explicit unknown labels, never blanks or guesses', () => {
    expect(describeCapabilities({
      wattageWatts: 2200,
      temperatureMaxCelsius: null,
      adjustableTemp: 'unknown',
      contactHeat: 'unknown',
      airHeat: 'unknown',
    })).toMatchObject({ wattage: '2200 W', temperature: 'Unknown', adjustableTemp: 'Unknown' });
    expect(describeCapabilities({
      wattageWatts: null,
      temperatureMaxCelsius: 230,
      adjustableTemp: 'yes',
      contactHeat: 'yes',
      airHeat: 'no',
    })).toMatchObject({ wattage: 'Unknown', temperature: '230 °C' });
  });

  it('accepts manual-only tools and catalogue links, but not empty entries', () => {
    const manual = {
      operationId: 'c0000000-0000-4000-8000-000000000020',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      versionId: null,
      manualBrand: 'Salon brand',
      manualModel: 'Pro dryer',
      toolType: 'dryer',
      availability: 'available',
      notes: null,
    };
    expect(() => CreateUserToolCommandSchema.parse(manual)).not.toThrow();
    const linked = { ...manual, versionId: 'c0000000-0000-4000-8000-000000000022', manualBrand: null, manualModel: null, toolType: null };
    expect(() => CreateUserToolCommandSchema.parse(linked)).not.toThrow();
    expect(() => CreateUserToolCommandSchema.parse({ ...manual, manualModel: null })).toThrow();
  });

  it('requires explicit confirmation to match a manual entry to the catalogue', () => {
    const match = {
      operationId: 'c0000000-0000-4000-8000-000000000030',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      expectedRevision: 1,
      versionId: 'c0000000-0000-4000-8000-000000000022',
      confirmed: true,
    };
    expect(() => MatchUserToolCommandSchema.parse(match)).not.toThrow();
    expect(() => MatchUserToolCommandSchema.parse({ ...match, confirmed: false })).toThrow();
    expect(() => MatchUserToolCommandSchema.parse({ ...match, versionId: null })).toThrow();
  });

  it('validates change and archive commands', () => {
    expect(() => ChangeUserToolCommandSchema.parse({
      operationId: 'c0000000-0000-4000-8000-000000000040',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      expectedRevision: 1,
      availability: 'out_of_stock',
      notes: 'Lent to a friend',
    })).not.toThrow();
    expect(() => ChangeUserToolCommandSchema.parse({
      operationId: 'c0000000-0000-4000-8000-000000000040',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      expectedRevision: 0,
      availability: 'available',
      notes: null,
    })).toThrow();
    expect(() => ArchiveUserToolCommandSchema.parse({
      operationId: 'c0000000-0000-4000-8000-000000000050',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      expectedRevision: 2,
    })).not.toThrow();
  });

  it('rejects notes longer than 2000 UTF-16 units', () => {
    expect(() => CreateUserToolCommandSchema.parse({
      operationId: 'c0000000-0000-4000-8000-000000000020',
      userToolId: 'c0000000-0000-4000-8000-000000000021',
      versionId: null,
      manualBrand: 'Salon brand',
      manualModel: 'Pro dryer',
      toolType: 'dryer',
      availability: 'available',
      notes: 'a'.repeat(2001),
    })).toThrow();
  });
});

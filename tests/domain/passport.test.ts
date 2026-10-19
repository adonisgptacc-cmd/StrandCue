import { describe, expect, it } from 'vitest';

import {
  PassportPatchSchema,
  PassportSchema,
} from '../../packages/domain/src/index.ts';

describe('PassportSchema', () => {
  it('preserves unknown, explicit null, and omitted answers as distinct states', () => {
    const passport = PassportSchema.parse({
      naturalPattern: 'mixed',
      strandDiameter: 'unknown',
      density: 'medium',
      lengthCm: null,
      porosity: 'unknown',
      concerns: ['unknown'],
      goals: ['none'],
      budgetPreference: 'no-preference',
    });

    expect(passport.porosity).toBe('unknown');
    expect(passport.lengthCm).toBeNull();
    expect('greyStatus' in passport).toBe(false);
  });

  it('accepts an explicit zero maximum budget without treating it as unanswered', () => {
    const passport = PassportSchema.parse({
      naturalPattern: 'straight',
      strandDiameter: 'fine',
      density: 'low',
      concerns: ['dryness'],
      goals: ['shine'],
      budgetPreference: 'use-owned-first',
      maximumProductBudgetZar: 0,
    });

    expect(passport.maximumProductBudgetZar).toBe(0);
  });

  it('rejects contradictory none and concrete concern selections', () => {
    const result = PassportSchema.safeParse({
      naturalPattern: 'wavy',
      strandDiameter: 'medium',
      density: 'high',
      concerns: ['none', 'frizz'],
      goals: ['definition'],
      budgetPreference: 'best-value',
    });

    expect(result.success).toBe(false);
  });

  it('rejects negative product budgets', () => {
    const result = PassportSchema.safeParse({
      naturalPattern: 'coily',
      strandDiameter: 'coarse',
      density: 'high',
      concerns: ['breakage'],
      goals: ['length-retention'],
      budgetPreference: 'mid-range',
      maximumProductBudgetZar: -1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an own undefined value instead of treating it as unanswered', () => {
    const result = PassportSchema.safeParse({
      naturalPattern: 'coily',
      strandDiameter: 'coarse',
      density: 'high',
      porosity: undefined,
      concerns: ['breakage'],
      goals: ['length-retention'],
      budgetPreference: 'mid-range',
    });

    expect(result.success).toBe(false);
  });
});

describe('PassportPatchSchema', () => {
  it('rejects an own undefined field that JSON serialization would drop', () => {
    expect(PassportPatchSchema.safeParse({ goals: undefined }).success).toBe(
      false,
    );
  });
});

describe('PassportSchema condition and length facts', () => {
  const baseline = {
    naturalPattern: 'wavy',
    strandDiameter: 'medium',
    density: 'medium',
    concerns: ['frizz'],
    goals: ['reduced-frizz'],
    budgetPreference: 'use-owned-first',
  } as const;

  it('keeps omission, unknown and a recorded value distinct', () => {
    const omitted = PassportSchema.parse(baseline);
    expect('damageObservation' in omitted).toBe(false);
    expect('heatPreference' in omitted).toBe(false);

    const unknown = PassportSchema.parse({
      ...baseline,
      damageObservation: 'unknown',
      heatPreference: 'unknown',
      lengthUnit: 'unknown',
      lengthPrecision: 'unknown',
      lengthMeasuredOn: null,
    });
    expect(unknown.damageObservation).toBe('unknown');
    expect(unknown.heatPreference).toBe('unknown');
    expect(unknown.lengthUnit).toBe('unknown');
    expect(unknown.lengthPrecision).toBe('unknown');
    expect(unknown.lengthMeasuredOn).toBeNull();
  });

  it('records a self-reported damage observation without implying diagnosis', () => {
    for (const value of ['none', 'mild', 'moderate', 'significant', 'unknown'] as const) {
      expect(PassportSchema.parse({ ...baseline, damageObservation: value }).damageObservation).toBe(value);
    }
    expect(() => PassportSchema.parse({ ...baseline, damageObservation: 'severe' })).toThrow();
  });

  it('records a heat preference and rejects an invented one', () => {
    for (const value of ['avoid', 'low', 'moderate', 'high', 'unknown'] as const) {
      expect(PassportSchema.parse({ ...baseline, heatPreference: value }).heatPreference).toBe(value);
    }
    expect(() => PassportSchema.parse({ ...baseline, heatPreference: 'safe' })).toThrow();
  });

  it('accepts length unit, precision and measurement date as separate facts', () => {
    const passport = PassportSchema.parse({
      ...baseline,
      lengthCm: 42,
      lengthUnit: 'in',
      lengthPrecision: 'approximate',
      lengthMeasuredOn: '2026-09-01',
    });
    expect(passport.lengthCm).toBe(42);
    expect(passport.lengthUnit).toBe('in');
    expect(passport.lengthPrecision).toBe('approximate');
    expect(passport.lengthMeasuredOn).toBe('2026-09-01');
    expect(() => PassportSchema.parse({ ...baseline, lengthMeasuredOn: '01/09/2026' })).toThrow();
  });

  it('bounds and trims known reactions and avoidances', () => {
    const passport = PassportSchema.parse({
      ...baseline,
      reactionsAvoidances: ['  fragrance  ', 'sulfates'],
    });
    expect(passport.reactionsAvoidances).toEqual(['fragrance', 'sulfates']);
    expect(() => PassportSchema.parse({ ...baseline, reactionsAvoidances: [''] })).toThrow();
    expect(() => PassportSchema.parse({ ...baseline, reactionsAvoidances: Array.from({ length: 51 }, () => 'x') })).toThrow();
  });
});

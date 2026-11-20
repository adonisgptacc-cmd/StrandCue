import { describe, expect, it } from 'vitest';

import {
  PassportPatchSchema,
  PassportReadSchema,
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

describe('PassportSchema condition, heat and length facts', () => {
  const baseline = {
    naturalPattern: 'wavy',
    strandDiameter: 'medium',
    density: 'medium',
    concerns: ['frizz'],
    goals: ['reduced-frizz'],
    budgetPreference: 'use-owned-first',
  } as const;

  it('keeps omission, unknown and a recorded answer distinct for personal conditions', () => {
    const omitted = PassportSchema.parse(baseline);
    expect('damageObservation' in omitted).toBe(false);
    expect('heatPreference' in omitted).toBe(false);

    const unknown = PassportSchema.parse({
      ...baseline,
      damageObservation: 'unknown',
      heatPreference: 'unknown',
      reactionsAvoidances: ['fragrance'],
    });
    expect(unknown.damageObservation).toBe('unknown');
    expect(unknown.heatPreference).toBe('unknown');
    expect('damageObservation' in omitted).toBe(false);
    expect('heatPreference' in omitted).toBe(false);
    expect('damageObservation' in unknown).toBe(true);
    expect('heatPreference' in unknown).toBe(true);
  });

  it('keeps a self-reported damage observation cosmetic and non-diagnostic', () => {
    for (const value of ['none', 'mild', 'moderate', 'significant', 'unknown'] as const) {
      expect(PassportSchema.parse({ ...baseline, damageObservation: value }).damageObservation).toBe(value);
    }
    expect(PassportPatchSchema.safeParse({ damageObservation: 'clinically-classified' }).success).toBe(false);
    expect(PassportPatchSchema.safeParse({ damageObservation: { severity: 3 } }).success).toBe(false);
  });

  it('records how much the person wants heat minimised, never a safety claim', () => {
    for (const value of [
      'avoid-heat',
      'minimise-heat',
      'lower-heat-when-practical',
      'no-preference',
      'unknown',
    ] as const) {
      expect(PassportSchema.parse({ ...baseline, heatPreference: value }).heatPreference).toBe(value);
    }
    for (const ambiguous of ['avoid', 'low', 'moderate', 'high', 'safe', 'unrestricted']) {
      expect(PassportPatchSchema.safeParse({ heatPreference: ambiguous }).success).toBe(false);
    }
  });

  it('keeps omitted heat preference without manufacturing a default', () => {
    const parsed = PassportSchema.parse(baseline);
    expect('heatPreference' in parsed).toBe(false);
  });
});

describe('PassportSchema structured length measurement', () => {
  const baseline = {
    naturalPattern: 'wavy',
    strandDiameter: 'medium',
    density: 'medium',
    concerns: ['frizz'],
    goals: ['length-retention'],
    budgetPreference: 'use-owned-first',
  } as const;

  it('records one self-measured length with value, unit, precision and optional date', () => {
    const measured = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: {
        value: 30,
        unit: 'cm',
        precision: 'approximate',
        measuredOn: '2026-09-01',
      },
    });
    expect(measured.lengthMeasurement).toEqual({
      value: 30,
      unit: 'cm',
      precision: 'approximate',
      measuredOn: '2026-09-01',
    });
    expect('lengthCm' in measured).toBe(false);
  });

  it('keeps unknown precision distinct from an omitted precision answer', () => {
    const noPrecision = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm' },
    });
    expect('precision' in noPrecision.lengthMeasurement!).toBe(false);

    const unknownPrecision = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm', precision: 'unknown' },
    });
    expect(unknownPrecision.lengthMeasurement!.precision).toBe('unknown');
  });

  it('keeps an omitted measurement date distinct from an explicit no-date answer', () => {
    const omitted = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm' },
    });
    expect('measuredOn' in omitted.lengthMeasurement!).toBe(false);

    const explicit = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm', measuredOn: null },
    });
    expect(explicit.lengthMeasurement!.measuredOn).toBeNull();
  });

  it('rejects a value without a known unit', () => {
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 30 } }).success).toBe(false);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 30, unit: 'unknown' } }).success).toBe(false);
  });

  it('rejects a unit without a numeric value', () => {
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { unit: 'cm' } }).success).toBe(false);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { unit: 'cm', value: null } }).success).toBe(false);
  });

  it('rejects a measurement date without a measurement value', () => {
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { measuredOn: '2026-09-01' } }).success).toBe(false);
  });

  it('rejects invalid units, precision answers and date formats', () => {
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 30, unit: 'metres' } }).success).toBe(false);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 30, unit: 'cm', precision: 'roughly' } }).success).toBe(false);
    expect(PassportSchema.safeParse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '01/09/2026' },
    }).success).toBe(false);
  });

  it('rejects impossible dates and invalid leap days, and accepts real ones', () => {
    for (const day of ['2026-02-31', '2025-02-29', '2026-09-31', '2026-13-01', '2026-00-10']) {
      expect(PassportSchema.safeParse({
        ...baseline,
        lengthMeasurement: { value: 30, unit: 'cm', measuredOn: day },
      }).success).toBe(false);
    }
    const leap = PassportSchema.parse({
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2024-02-29' },
    });
    expect(leap.lengthMeasurement!.measuredOn).toBe('2024-02-29');
  });

  it('rejects zero, negative, non-finite and unreasonable measurements by one documented bound', () => {
    for (const value of [0, -30, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value, unit: 'cm' } }).success).toBe(false);
    }
    // The documented bound: recorded length is at most 300 cm after unit conversion.
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 300, unit: 'cm', precision: 'exact' } }).success).toBe(true);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 301, unit: 'cm' } }).success).toBe(false);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 118, unit: 'in' } }).success).toBe(true);
    expect(PassportSchema.safeParse({ ...baseline, lengthMeasurement: { value: 119, unit: 'in' } }).success).toBe(false);
    expect(PassportSchema.safeParse({
      ...baseline,
      lengthMeasurement: { value: 301, unit: 'cm' },
    }).error?.issues.some((issue) => issue.message.includes('300 cm'))).toBe(true);
  });

  it('keeps legacy centimetre records readable in the read boundary and refuses new numeric writes', () => {
    // Stored history keeps parsing: the read boundary accepts the legacy
    // centimetre number verbatim.
    const legacy = PassportReadSchema.parse({ ...baseline, lengthCm: 25 });
    expect(legacy.lengthCm).toBe(25);
    expect('lengthMeasurement' in legacy).toBe(false);

    // The submission boundary refuses to write a new legacy number, exactly
    // like the SQL validator.
    expect(PassportSchema.safeParse({ ...baseline, lengthCm: 25 }).success).toBe(false);
    expect(PassportPatchSchema.safeParse({ lengthCm: 25 }).success).toBe(false);
    expect(PassportReadSchema.safeParse({
      ...baseline,
      lengthCm: 25,
      lengthMeasurement: { value: 30, unit: 'cm' },
    }).success).toBe(false);

    expect(PassportSchema.safeParse({
      ...baseline,
      lengthCm: 25,
      lengthMeasurement: { value: 30, unit: 'cm' },
    }).success).toBe(false);
    const retired = PassportSchema.parse({
      ...baseline,
      lengthCm: null,
      lengthMeasurement: { value: 30, unit: 'in', precision: 'exact' },
    });
    expect(retired.lengthCm).toBeNull();
    expect(retired.lengthMeasurement!.unit).toBe('in');
  });

  it('treats patches with the measurement contract the same as full records', () => {
    expect(PassportPatchSchema.safeParse({
      lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-02-31' },
    }).success).toBe(false);
    expect(PassportPatchSchema.safeParse({ lengthMeasurement: { value: 0, unit: 'cm' } }).success).toBe(false);
    expect(PassportPatchSchema.safeParse({ lengthMeasurement: null }).success).toBe(true);
    expect(PassportPatchSchema.safeParse({ lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } }).success).toBe(true);
    expect(PassportPatchSchema.safeParse({ lengthCm: 25, lengthMeasurement: { value: 30, unit: 'cm' } }).success).toBe(false);
  });

  it('refuses a measurement dated after today', () => {
    const today = new Intl.DateTimeFormat(
      'en-CA',
      { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' },
    ).format(new Date());
    expect(
      PassportPatchSchema.safeParse({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2030-01-01' } }).success,
    ).toBe(false);
    // Today itself is measurable; only days after today are refused.
    expect(
      PassportPatchSchema.safeParse({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: today } }).success,
    ).toBe(true);
  });

  it('never mutates the caller input while validating', () => {
    const input = {
      ...baseline,
      lengthMeasurement: { value: 30, unit: 'cm', precision: 'exact', measuredOn: '2026-09-01' },
    } as { naturalPattern?: string; lengthMeasurement?: unknown; [key: string]: unknown };
    input.naturalPattern = input.naturalPattern?.toUpperCase() ?? undefined;
    input.naturalPattern = 'wavy';
    const before = JSON.stringify(input);
    PassportSchema.parse(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('PassportSchema reactions and avoidances', () => {
  const baseline = {
    naturalPattern: 'wavy',
    strandDiameter: 'medium',
    density: 'medium',
    concerns: ['frizz'],
    goals: ['length-retention'],
    budgetPreference: 'use-owned-first',
  } as const;

  it('trims and keeps known reaction entries', () => {
    const parsed = PassportSchema.parse({
      ...baseline,
      reactionsAvoidances: ['  fragrance  ', 'sulfates'],
    });
    expect(parsed.reactionsAvoidances).toEqual(['fragrance', 'sulfates']);
  });

  it('rejects empty arrays and whitespace-only entries', () => {
    expect(PassportSchema.safeParse({ ...baseline, reactionsAvoidances: [] }).success).toBe(false);
    expect(PassportSchema.safeParse({ ...baseline, reactionsAvoidances: ['   '] }).success).toBe(false);
  });

  it('rejects more than 50 entries and entries longer than 100 characters', () => {
    expect(PassportSchema.safeParse({
      ...baseline,
      reactionsAvoidances: Array.from({ length: 51 }, () => 'x'),
    }).success).toBe(false);
    expect(PassportSchema.safeParse({
      ...baseline,
      reactionsAvoidances: ['y'.repeat(101)],
    }).success).toBe(false);
    expect(PassportSchema.safeParse({
      ...baseline,
      reactionsAvoidances: ['y'.repeat(100)],
    }).success).toBe(true);
  });
});

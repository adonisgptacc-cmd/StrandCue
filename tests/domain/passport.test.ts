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

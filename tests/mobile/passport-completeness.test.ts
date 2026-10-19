import { describe, expect, it } from 'vitest';

import { describeLength, GOAL_LABELS, goalGaps, hasRecordedLength } from '../../apps/mobile/src/passport-completeness.ts';

const base = { naturalPattern: 'unknown', strandDiameter: 'unknown', density: 'unknown', porosity: 'unknown', concerns: ['unknown'], goals: ['unknown'], budgetPreference: 'no-preference' };

describe('goal-scoped completeness', () => {
  it('lists one section per chosen passport goal, never for none or unknown', () => {
    const gaps = goalGaps({ ...base, goals: ['shine', 'none', 'unknown'] });
    expect(gaps.map((entry) => entry.goal)).toEqual(['shine']);
    expect(GOAL_LABELS.shine).toBe('Shine');
  });

  it('names the facts each goal leans on with plain questions, not scores', () => {
    const gaps = goalGaps({ ...base, goals: ['shine', 'moisture-retention'] });
    const shine = gaps.find((entry) => entry.goal === 'shine')!;
    expect(shine.label).toBe('Shine');
    expect(shine.missing).toEqual([
      'your natural pattern (straight, wavy, curly, coily or mixed)',
      'how fine or coarse a single strand feels',
      'how your hair takes on and holds water',
    ]);
    const moisture = gaps.find((entry) => entry.goal === 'moisture-retention')!;
    expect(moisture.missing.some((line) => line.includes('takes on and holds water'))).toBe(true);
    expect(moisture.missing.some((line) => line.includes('humidity'))).toBe(true);
  });

  it('counts a legacy centimetre entry as the recorded length fact', () => {
    expect(hasRecordedLength({ ...base, lengthCm: 25 })).toBe(true);
    expect(hasRecordedLength({ ...base, lengthMeasurement: { value: 30, unit: 'cm' } })).toBe(true);
    // A mixed projection (both keys) still counts as one recorded length.
    expect(hasRecordedLength({ ...base, lengthCm: 25, lengthMeasurement: { value: 30, unit: 'cm' } })).toBe(true);
    expect(hasRecordedLength({ ...base, lengthCm: null })).toBe(false);
    expect(hasRecordedLength({ ...base })).toBe(false);
  });

  it('keeps answered unknown as unrecorded, and a definite none as recorded', () => {
    const gaps = goalGaps({
      ...base,
      goals: ['reduced-frizz'],
      porosity: 'unknown',
      damageObservation: 'none',
      environmentSensitivities: ['none'],
    });
    expect(gaps[0].missing).toEqual(['how your hair takes on and holds water']);
  });

  it('returns nothing further once every foundation fact is recorded', () => {
    const gaps = goalGaps({
      ...base,
      goals: ['definition'],
      strandDiameter: 'fine',
      naturalPattern: 'curly',
      density: 'medium',
    });
    expect(gaps[0].missing).toEqual([]);
  });

  it('carries no percentage, score or progress fraction anywhere', () => {
    const gaps = goalGaps({ ...base, goals: ['volume', 'manageability'] });
    const text = JSON.stringify(gaps);
    expect(text).not.toMatch(/%|\d+ of \d+|\bscore\b|\bprogress\b/i);
    expect(Object.keys(gaps[0]).sort()).toEqual(['goal', 'label', 'missing']);
  });
});

describe('length display for current and legacy states', () => {
  it('describes a structured measurement with its precision and date', () => {
    expect(describeLength({ lengthMeasurement: { value: 30, unit: 'cm', precision: 'approximate', measuredOn: '2026-10-01' } })).toEqual({
      current: '30 centimetres, measured approximately, on 2026-10-01',
      legacyNote: null,
    });
    expect(describeLength({ lengthMeasurement: { value: 12, unit: 'in', precision: 'exact' } }).current).toBe('12 inches, measured exactly');
    // An explicit null measurement date reads without a date part.
    expect(describeLength({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: null } }).current).toBe('30 centimetres');
  });

  it('keeps a legacy-only centimetre entry readable but clearly earlier', () => {
    const shown = describeLength({ lengthCm: 25 });
    expect(shown.current).toBe('25 centimetres, recorded before this screen changed');
    expect(shown.legacyNote).toBeNull();
  });

  it('handles a mixed projection as one current length plus one readable earlier entry', () => {
    const shown = describeLength({ lengthCm: 25, lengthMeasurement: { value: 30, unit: 'cm' } });
    expect(shown.current).toBe('30 centimetres');
    expect(shown.legacyNote!.includes('25 centimetres')).toBe(true);
    expect(shown.legacyNote!.includes('your latest measurement above takes over')).toBe(true);
    expect(shown.legacyNote).not.toBe(shown.current);
  });

  it('answers null when no length fact exists at all', () => {
    expect(describeLength({ lengthCm: null })).toEqual({ current: null, legacyNote: null });
    expect(describeLength({})).toEqual({ current: null, legacyNote: null });
  });
});

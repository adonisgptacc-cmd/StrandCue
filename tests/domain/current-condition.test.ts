import { describe, expect, it } from 'vitest';

import {
  CurrentConditionSchema,
  normalizeCurrentCondition,
} from '../../packages/domain/src/index.ts';

// Injected clock for every temporal assertion: 2026-10-13 12:00 SAST.
// The contracts never read the wall clock in tests.
const NOW = new Date('2026-10-13T12:00:00+02:00');

function validCheckIn() {
  return {
    observedAt: '2026-10-13T11:30:00+02:00',
    concerns: ['dryness', 'frizz'],
    goal: 'basic_wash',
    availableMinutes: 30,
  };
}

describe('CurrentCondition contracts', () => {
  it('accepts a multi-select cosmetic concern check-in', () => {
    const parsed = normalizeCurrentCondition(validCheckIn(), NOW);

    expect(parsed.concerns).toEqual(['dryness', 'frizz']);
    expect(parsed.goal).toBe('basic_wash');
    expect(parsed.availableMinutes).toBe(30);
    expect(parsed).not.toHaveProperty('saveToPassport');
  });

  it('accepts a lone none concern as "no concerns right now"', () => {
    const parsed = normalizeCurrentCondition(
      { ...validCheckIn(), concerns: ['none'] },
      NOW,
    );

    expect(parsed.concerns).toEqual(['none']);
  });

  it('accepts a lone unknown concern as distinct from none', () => {
    const parsed = normalizeCurrentCondition(
      { ...validCheckIn(), concerns: ['unknown'] },
      NOW,
    );

    expect(parsed.concerns).toEqual(['unknown']);
  });

  it.each([
    ['none alongside a cosmetic concern', ['none', 'dryness']],
    ['unknown alongside a cosmetic concern', ['unknown', 'frizz']],
    ['none alongside unknown', ['none', 'unknown']],
  ])('rejects %s as non-exclusive', (_name, concerns) => {
    expect(() => normalizeCurrentCondition({ ...validCheckIn(), concerns }, NOW)).toThrow(
      /exclusive/i,
    );
  });

  it('rejects duplicate concerns instead of silently dropping them', () => {
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), concerns: ['dryness', 'dryness'] }, NOW),
    ).toThrow(/duplicate|unique/i);
  });

  it('rejects an empty concerns array; "none" must be stated explicitly', () => {
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), concerns: [] }, NOW),
    ).toThrow();
  });

  it('rejects concerns outside the cosmetic vocabulary without interpretation', () => {
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), concerns: ['dandruff'] }, NOW),
    ).toThrow();
  });

  it('accepts zero available minutes and the single-day upper bound', () => {
    expect(
      normalizeCurrentCondition({ ...validCheckIn(), availableMinutes: 0 }, NOW)
        .availableMinutes,
    ).toBe(0);
    expect(
      normalizeCurrentCondition({ ...validCheckIn(), availableMinutes: 1440 }, NOW)
        .availableMinutes,
    ).toBe(1440);
  });

  it.each([
    ['negative time', -1],
    ['time beyond a single day', 1441],
    ['fractional minutes', 30.5],
  ])('rejects %s', (_name, availableMinutes) => {
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), availableMinutes }, NOW),
    ).toThrow();
  });

  it('accepts an offset-aware observation at or before now', () => {
    expect(
      normalizeCurrentCondition(
        { ...validCheckIn(), observedAt: '2026-10-13T12:00:00+02:00' },
        NOW,
      ).observedAt,
    ).toBe('2026-10-13T12:00:00+02:00');
  });

  it('rejects a future observation against the injected clock', () => {
    expect(() =>
      normalizeCurrentCondition(
        { ...validCheckIn(), observedAt: '2026-10-13T12:00:01+02:00' },
        NOW,
      ),
    ).toThrow(/future/i);
  });

  it('rejects an observation timestamp without an explicit offset', () => {
    expect(() =>
      CurrentConditionSchema.parse({ ...validCheckIn(), observedAt: '2026-10-13T11:30:00' }),
    ).toThrow();
  });

  it('treats zones as optional but validates their shape when present', () => {
    const withoutZones = normalizeCurrentCondition(validCheckIn(), NOW);
    expect(withoutZones).not.toHaveProperty('zones');

    const withZones = normalizeCurrentCondition(
      {
        ...validCheckIn(),
        zones: [
          { region: 'front', segment: 'roots' },
          { region: 'crown', segment: 'ends' },
        ],
      },
      NOW,
    );
    expect(withZones.zones).toEqual([
      { region: 'crown', segment: 'ends' },
      { region: 'front', segment: 'roots' },
    ]);
  });

  it('rejects duplicate zone pairs and an empty zones array', () => {
    const zone = { region: 'front', segment: 'roots' };
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), zones: [zone, zone] }, NOW),
    ).toThrow(/unique/i);
    expect(() => normalizeCurrentCondition({ ...validCheckIn(), zones: [] }, NOW)).toThrow();
  });

  it.each([
    ['a top-level unknown key', { ...validCheckIn(), userId: 'owner-1' }],
    ['a free-text notes field', { ...validCheckIn(), notes: 'itchy scalp' }],
    ['a severity inference field', { ...validCheckIn(), severity: 'high' }],
    ['a symptom list field', { ...validCheckIn(), symptoms: ['flakes'] }],
    ['a diagnosis mapping field', { ...validCheckIn(), diagnosis: 'dermatitis' }],
    [
      'an unknown zone key',
      { ...validCheckIn(), zones: [{ region: 'front', segment: 'roots', inferred: true }] },
    ],
  ])('rejects %s with strict unknown-field rejection', (_name, input) => {
    expect(() => normalizeCurrentCondition(input, NOW)).toThrow();
  });

  it('rejects a saveToPassport persistence flag: check-ins are session-only', () => {
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), saveToPassport: true }, NOW),
    ).toThrow();
    expect(() =>
      normalizeCurrentCondition({ ...validCheckIn(), saveToPassport: false }, NOW),
    ).toThrow();
  });

  it('freezes the parsed check-in including nested arrays', () => {
    const parsed = normalizeCurrentCondition(
      {
        ...validCheckIn(),
        zones: [{ region: 'front', segment: 'roots' }],
      },
      NOW,
    );

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.concerns)).toBe(true);
    expect(Object.isFrozen(parsed.zones)).toBe(true);
    expect(Object.isFrozen((parsed.zones as { region: string; segment: string }[])[0])).toBe(
      true,
    );
    expect(() => (parsed.concerns as string[]).push('frizz')).toThrow(TypeError);
  });

  it('never mutates the caller-supplied input object', () => {
    const submitted = {
      ...validCheckIn(),
      concerns: ['frizz', 'dryness'],
      zones: [{ region: 'front', segment: 'roots' }],
    };
    const before = structuredClone(submitted);

    normalizeCurrentCondition(submitted, NOW);

    expect(submitted).toEqual(before);
  });
});

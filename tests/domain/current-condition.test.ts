import { describe, expect, it } from 'vitest';

import {
  CurrentConditionConcernSchema,
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

describe('Task 3.1: the complete cosmetic concern vocabulary', () => {
  const ZONE_FRONT_ROOTS = { region: 'front', segment: 'roots' };
  const ZONE_CROWN_ENDS = { region: 'crown', segment: 'ends' };

  it.each([
    'dryness',
    'breakage',
    'tangling',
    'frizz',
    'buildup',
    'scalp-discomfort',
    'chemical-processing-concern',
    'heat-concern',
  ])('accepts %s as its own cosmetic answer', concern => {
    const parsed = normalizeCurrentCondition({ ...validCheckIn(), concerns: [concern] }, NOW);
    expect(parsed.concerns).toEqual([concern]);
  });

  it('keeps every concern distinct: buildup is not dryness, heat is not chemical processing, scalp is not hair', () => {
    const parsed = normalizeCurrentCondition(
      { ...validCheckIn(), concerns: ['heat-concern', 'buildup', 'chemical-processing-concern', 'scalp-discomfort', 'breakage', 'tangling'] },
      NOW,
    );
    // Canonical order, nothing merged, nothing added.
    expect(parsed.concerns).toEqual(['breakage', 'buildup', 'chemical-processing-concern', 'heat-concern', 'scalp-discomfort', 'tangling']);
  });

  it('keeps none and unknown exclusive against every new concern too', () => {
    for (const concern of ['buildup', 'scalp-discomfort', 'chemical-processing-concern', 'heat-concern']) {
      expect(() => normalizeCurrentCondition({ ...validCheckIn(), concerns: ['none', concern] }, NOW)).toThrow(/exclusive/i);
      expect(() => normalizeCurrentCondition({ ...validCheckIn(), concerns: ['unknown', concern] }, NOW)).toThrow(/exclusive/i);
    }
  });

  it('is a cosmetic vocabulary: no concern names a diagnosis, a disease or a medical finding', () => {
    for (const concern of CurrentConditionConcernSchema.options) {
      expect(concern).not.toMatch(/diagnos|disease|dermatitis|infection|alopecia|psoriasis|syndrome|loss/i);
    }
  });

  it('attaches a concern to its own zone and keeps the answer sorted and frozen', () => {
    const parsed = normalizeCurrentCondition(
      {
        ...validCheckIn(),
        concerns: ['dryness', 'breakage'],
        zones: [ZONE_FRONT_ROOTS, ZONE_CROWN_ENDS],
        zoneConcerns: [
          { zone: ZONE_FRONT_ROOTS, concerns: ['dryness'] },
          { zone: ZONE_CROWN_ENDS, concerns: ['dryness', 'breakage'] },
        ],
      },
      NOW,
    );
    expect(parsed.zoneConcerns).toEqual([
      { zone: ZONE_CROWN_ENDS, concerns: ['breakage', 'dryness'] },
      { zone: ZONE_FRONT_ROOTS, concerns: ['dryness'] },
    ]);
    expect(Object.isFrozen(parsed.zoneConcerns)).toBe(true);
    expect(Object.isFrozen((parsed.zoneConcerns as { concerns: string[] }[])[0].concerns)).toBe(true);
  });

  it('treats zone concerns as optional and leaves them absent when none were given', () => {
    expect(normalizeCurrentCondition(validCheckIn(), NOW)).not.toHaveProperty('zoneConcerns');
  });

  it.each([
    ['a zone concern for a zone that was not reported', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_CROWN_ENDS, concerns: ['dryness'] }] }, /reported zones/i],
    ['a zone concern with no reported zones at all', { zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['dryness'] }] }, /reported zones/i],
    ['a zone concern the check-in did not report', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['buildup'] }] }, /reported concerns/i],
    ['none inside a zone', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['none'] }] }, /none|unknown|exclusive/i],
    ['unknown inside a zone', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['unknown'] }] }, /none|unknown|exclusive/i],
    ['the same zone twice', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['dryness'] }, { zone: ZONE_FRONT_ROOTS, concerns: ['frizz'] }] }, /unique/i],
    ['a duplicate concern inside a zone', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['dryness', 'dryness'] }] }, /unique/i],
    ['an empty zone concern list', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [] }, undefined],
    ['an empty concern list for a zone', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: [] }] }, undefined],
    ['an unknown key on a zone concern', { zones: [ZONE_FRONT_ROOTS], zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['dryness'], severity: 'high' }] }, undefined],
  ])('rejects %s instead of repairing it', (_name, extra, message) => {
    const attempt = () => normalizeCurrentCondition({ ...validCheckIn(), concerns: ['dryness', 'frizz'], ...extra }, NOW);
    if (message) expect(attempt).toThrow(message);
    else expect(attempt).toThrow();
  });

  it('does not let tap order, zone order or key order change a zone-attached answer', () => {
    const left = normalizeCurrentCondition(
      { ...validCheckIn(), concerns: ['dryness', 'breakage'], zones: [ZONE_FRONT_ROOTS, ZONE_CROWN_ENDS],
        zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['dryness'] }, { zone: ZONE_CROWN_ENDS, concerns: ['dryness', 'breakage'] }] },
      NOW,
    );
    const right = normalizeCurrentCondition(
      { zoneConcerns: [{ concerns: ['breakage', 'dryness'], zone: { segment: 'ends', region: 'crown' } }, { concerns: ['dryness'], zone: { segment: 'roots', region: 'front' } }],
        zones: [ZONE_CROWN_ENDS, ZONE_FRONT_ROOTS], concerns: ['breakage', 'dryness'], availableMinutes: 30, goal: 'basic_wash', observedAt: '2026-10-13T11:30:00+02:00' },
      NOW,
    );
    expect(JSON.stringify(left)).toBe(JSON.stringify(right));
  });

  it('never mutates the caller input when zone concerns are present', () => {
    const submitted = {
      ...validCheckIn(), concerns: ['frizz', 'dryness'], zones: [ZONE_FRONT_ROOTS],
      zoneConcerns: [{ zone: ZONE_FRONT_ROOTS, concerns: ['frizz', 'dryness'] }],
    };
    const before = structuredClone(submitted);
    normalizeCurrentCondition(submitted, NOW);
    expect(submitted).toEqual(before);
  });
});

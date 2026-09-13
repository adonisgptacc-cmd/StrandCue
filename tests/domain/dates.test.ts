import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EffectiveDateSchema,
  currentDateOnly,
  effectiveDateToInterval,
} from '../../packages/domain/src/index.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('EffectiveDateSchema', () => {
  it('accepts a real leap day', () => {
    expect(
      EffectiveDateSchema.parse({ precision: 'day', value: '2024-02-29' }),
    ).toEqual({ precision: 'day', value: '2024-02-29' });
  });

  it('rejects an impossible calendar day', () => {
    expect(
      EffectiveDateSchema.safeParse({ precision: 'day', value: '2025-02-29' })
        .success,
    ).toBe(false);
  });

  it('rejects an impossible calendar month', () => {
    expect(
      EffectiveDateSchema.safeParse({ precision: 'month', value: '2024-13' })
        .success,
    ).toBe(false);
  });

  it('rejects a future interval that cannot contain a past fact', () => {
    expect(
      EffectiveDateSchema.safeParse({ precision: 'year', value: '9999' })
        .success,
    ).toBe(false);
  });

  it('requires an explicit null value for unknown precision', () => {
    expect(
      EffectiveDateSchema.safeParse({ precision: 'unknown' }).success,
    ).toBe(false);
    expect(
      EffectiveDateSchema.parse({ precision: 'unknown', value: null }),
    ).toEqual({ precision: 'unknown', value: null });
  });

  it('expands approximate dates into honest closed intervals', () => {
    expect(
      effectiveDateToInterval({ precision: 'month', value: '2024-02' }),
    ).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(
      effectiveDateToInterval({ precision: 'unknown', value: null }),
    ).toEqual({ start: null, end: null });
  });

  it('uses the Africa/Johannesburg calendar day at the UTC date boundary', () => {
    const instant = new Date('2026-09-09T22:30:00.000Z');

    expect(currentDateOnly).toBeTypeOf('function');
    if (typeof currentDateOnly === 'function') {
      expect(currentDateOnly(instant)).toBe('2026-09-10');
    }
  });

  it('validates local today, tomorrow, current month, and current year in Johannesburg', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T22:30:00.000Z'));

    expect(
      EffectiveDateSchema.safeParse({ precision: 'day', value: '2026-09-10' })
        .success,
    ).toBe(true);
    expect(
      EffectiveDateSchema.safeParse({ precision: 'day', value: '2026-09-11' })
        .success,
    ).toBe(false);
    expect(
      EffectiveDateSchema.safeParse({ precision: 'month', value: '2026-09' })
        .success,
    ).toBe(true);
    expect(
      EffectiveDateSchema.safeParse({ precision: 'year', value: '2026' })
        .success,
    ).toBe(true);
  });
});

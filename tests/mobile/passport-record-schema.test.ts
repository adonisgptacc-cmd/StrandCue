import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { recordSchema } from '../../apps/mobile/src/passport-api';

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    Platform: { OS: 'web' },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
    Appearance: { getColorScheme: () => 'light', addChangeListener: () => undefined },
  };
});

vi.mock('../../apps/mobile/src/client', () => ({
  supabase: null,
  secureStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
}));

/** The boundary that used to lock an owner out of their own record: the
 * app reads a stored record, and the read path must accept what a trusted
 * writer can have stored - a measurement dated in the future, a measurement
 * dated on a day that does not exist, an effective date the write path
 * would refuse - so the record opens and the owner can correct it. */
describe('the stored Passport record the app reads', () => {
  const base = {
    passportId: '11111111-1111-4111-8111-111111111111',
    revision: 2,
    projection: {
      asOf: '2026-09-01',
      values: {},
      ambiguousFields: {},
      appliedRevisionIds: [],
      supersededRevisionIds: [],
    },
    revisions: [],
  };

  const revision = (overrides: Record<string, unknown>) => ({
    id: '22222222-2222-4222-8222-222222222222',
    passportId: base.passportId,
    sequence: 1,
    baseRevision: 0,
    kind: 'change',
    effectiveDate: { precision: 'day', value: '2026-02-01' },
    recordedAt: '2026-02-01T00:00:00.000Z',
    source: 'user-reported',
    patch: {},
    ...overrides,
  });

  it('opens a record whose history holds an effective date the write path would refuse', () => {
    const parsed = recordSchema.safeParse({
      ...base,
      revisions: [revision({ effectiveDate: { precision: 'year', value: '2027' }, patch: { notes: 'a future entry' } })],
    });
    expect(parsed.success).toBe(true);
  });

  it('opens a record whose history holds a measurement dated after today', () => {
    const parsed = recordSchema.safeParse({
      ...base,
      revisions: [revision({ patch: { lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2027-01-01' } } })],
    });
    expect(parsed.success).toBe(true);
  });

  it('opens a record whose history holds a measurement dated on a day that does not exist', () => {
    const parsed = recordSchema.safeParse({
      ...base,
      revisions: [revision({ patch: { lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-02-30' } } })],
    });
    expect(parsed.success).toBe(true);
  });

  it('still refuses a record that is not a record at all', () => {
    expect(recordSchema.safeParse({ ...base, revision: -1 }).success).toBe(false);
  });
});

import { createElement, type ReactElement } from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MyHairOverview } from '../../apps/mobile/src/MyHairOverview';
import type { PassportRecord } from '../../apps/mobile/src/passport-api';

const mocks = vi.hoisted(() => ({
  onRecordChange: vi.fn(),
}));

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

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
  SafeAreaView: ({ children }: { children?: unknown }) => children,
}));

vi.mock('../../apps/mobile/src/client', () => ({
  supabase: null,
  secureStorage: { getItem: vi.fn(async () => null), setItem: vi.fn(), removeItem: vi.fn() },
}));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  counter = 0;
  mocks.onRecordChange.mockReset();
});

const base = { naturalPattern: 'curly', strandDiameter: 'unknown', density: 'medium', concerns: ['frizz'], goals: ['length-retention', 'shine'], budgetPreference: 'no-preference' };

function makeRecord(values: Record<string, unknown>, revision = 4): PassportRecord {
  return {
    passportId: 'passport-1', revision,
    projection: { asOf: '2026-09-01', values, ambiguousFields: {}, appliedRevisionIds: [], supersededRevisionIds: [] },
    revisions: [],
  };
}

let counter = 0;
function revision(kind: 'baseline' | 'change' | 'correction', patch: Record<string, unknown>, extra: Partial<{ superseded: boolean }> = {}): PassportRecord['revisions'][number] {
  counter += 1;
  const id = `rev-${counter}`;
  return {
    id, passportId: 'passport-1', sequence: counter, baseRevision: Math.max(0, counter - 1), kind,
    effectiveDate: { precision: 'day', value: `2026-0${counter}-15` } as never,
    recordedAt: `2026-0${counter}-15T10:00:00.000Z`, source: 'user-reported', patch,
    ...(kind === 'correction' ? { correctsId: 'rev-other', correctionReason: 'wrong pattern answer' } : {}),
  } as PassportRecord['revisions'][number];
}

function text(root: ReactTestRenderer): string[] {
  const lines: string[] = [];
  const walk = (node: ReactTestInstance | string | null) => {
    if (node === null || typeof node !== 'object') return;
    if (typeof node.type === 'string' && node.type === 'span') {
      const children = node.props.children;
      if (typeof children === 'string') lines.push(children);
      if (Array.isArray(children)) {
        const joined = children.filter(part => typeof part === 'string').join('');
        if (joined !== '') lines.push(joined);
      }
    }
    node.children.forEach(child => walk(child as ReactTestInstance | string));
  };
  walk(root.root);
  return lines;
}

const render = async (element: ReactElement): Promise<ReactTestRenderer> => {
  let instance: ReactTestRenderer | undefined;
  await act(async () => { instance = create(element); });
  return instance as ReactTestRenderer;
};
const find = (root: ReactTestRenderer, by: (node: ReactTestInstance) => boolean) => root.root.findAll(by, { deep: true });
const press = async (root: ReactTestRenderer, label: string) => {
  const node = find(root, (node) => node.props?.title === label).at(0);
  expect(node).toBeDefined();
  await act(async () => { node!.props.onPress(); });
};

describe('MyHairOverview', () => {
  it('separates the current facts from the dated history sections', async () => {
    const record: PassportRecord = {
      ...makeRecord(base), revisions: [
        revision('baseline', { naturalPattern: 'curly' }),
        revision('change', { concerns: ['frizz'] }),
      ],
    };
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    const lines = text(root);
    expect(lines.includes('YOUR HAIR NOW')).toBe(true);
    expect(lines.includes('WHAT CHANGED, WHEN')).toBe(true);
    // Newest first, kickers visible on the dated entries.
    expect(lines.filter((line) => line === 'WHAT CHANGED, WHEN')).toHaveLength(1);
    const indexBaseline = lines.indexOf('FIRST RECORD · 2026-01-15');
    const indexChange = lines.indexOf('CHANGE · 2026-02-15');
    expect(indexChange).toBeGreaterThanOrEqual(0);
    expect(indexBaseline).toBeGreaterThan(indexChange);
  });

  it('presents one coherent length for a mixed legacy-plus-measurement projection', async () => {
    const record = makeRecord({ ...base, lengthCm: 25, lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-08-30' } });
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    const lines = text(root);
    expect(lines.includes('30 centimetres, on 2026-08-30')).toBe(true);
    expect(lines.some((line) => line.includes('earlier entry kept 25 centimetres'))).toBe(true);
    // The raw keys never appear as two independent field rows.
    expect(lines.some((line) => /length cm/i.test(line))).toBe(false);
    expect(lines.some((line) => /length measurement/i.test(line))).toBe(false);
  });

  it('hides a legacy row quietly cleared with an explicit null', async () => {
    const record = makeRecord({ ...base, lengthCm: null });
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    expect(text(root).some((line) => line.includes('centimetres'))).toBe(false);
  });

  it('explains goal-specific gaps without any percentage or score', async () => {
    const record = makeRecord({ ...base, lengthMeasurement: { value: 30, unit: 'cm' } });
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    const lines = text(root);
    expect(lines.includes('For keeping length')).toBe(true);
    expect(lines.includes('For shine')).toBe(true);
    expect(lines.some((line) => /how fine or coarse a single strand feels/i.test(line))).toBe(true);
    expect(lines.some((line) => /your current length, self-measured/i.test(line))).toBe(false);
    const joined = lines.join('\n');
    expect(joined).not.toMatch(/%|\b\d of \d\b|\bscore\b/i);
  });

  it('answers politely when the chosen goals give nothing to complete', async () => {
    const record = makeRecord({ ...base, goals: ['none'] });
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    expect(text(root).some((line) => /choose a goal/i.test(line))).toBe(true);
  });

  it('marks ambiguous facts and keeps the editor one button away', async () => {
    const record: PassportRecord = {
      ...makeRecord({ ...base, porosity: 'low' }), revisions: [],
      projection: { asOf: '2026-09-01', values: base as PassportRecord['projection']['values'], ambiguousFields: { porosity: { reason: 'overlapping-effective-intervals', candidates: [] } }, appliedRevisionIds: [], supersededRevisionIds: [] },
    };
    const root = await render(createElement(MyHairOverview, { record, onRecordChange: mocks.onRecordChange }));
    const lines = text(root);
    expect(lines.includes('Porosity')).toBe(true);
    expect(lines.some((line) => line.includes('Dates overlap or are unknown'))).toBe(true);
    await press(root, 'Record a change');
    expect(mocks.onRecordChange).toHaveBeenCalledTimes(1);
  });
});

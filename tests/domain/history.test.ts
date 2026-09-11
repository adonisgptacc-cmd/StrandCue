import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  projectHistory,
  type PassportRevision,
} from '../../packages/domain/src/index.ts';

const passportId = '10000000-0000-4000-8000-000000000001';

const baseline = {
  id: '20000000-0000-4000-8000-000000000001',
  passportId,
  sequence: 1,
  baseRevision: 0,
  kind: 'baseline' as const,
  effectiveDate: { precision: 'day' as const, value: '2024-01-01' },
  recordedAt: '2024-01-01T10:00:00.000Z',
  source: 'user-reported' as const,
  patch: {
    naturalPattern: 'wavy' as const,
    strandDiameter: 'fine' as const,
    density: 'medium' as const,
    lengthCm: null,
    concerns: ['dryness' as const],
    goals: ['shine' as const],
    budgetPreference: 'best-value' as const,
    maximumProductBudgetZar: 100,
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('projectHistory', () => {
  it('composes field patches by effective time rather than entry time', () => {
    const projection = projectHistory(
      [
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000002',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-03' },
          recordedAt: '2024-03-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { maximumProductBudgetZar: 200 },
        },
        {
          id: '20000000-0000-4000-8000-000000000003',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-04-01T10:00:00.000Z',
          source: 'user-estimated',
          patch: { goals: ['length-retention'] },
        },
      ],
      { asOf: '2024-04-30' },
    );

    expect(projection.values.goals).toEqual(['length-retention']);
    expect(projection.values.maximumProductBudgetZar).toBe(200);
    expect(projection.ambiguousFields).toEqual({});
  });

  it('resolves a correction of a correction to the final replacement', () => {
    const projection = projectHistory(
      [
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000011',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000012',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000011',
          correctionReason: 'Selected the wrong goal',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['moisture-retention'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000013',
          passportId,
          sequence: 4,
          baseRevision: 3,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000012',
          correctionReason: 'Clarified the intended goal',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-04T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['length-retention'] },
        },
      ],
      { asOf: '2024-03-01' },
    );

    expect(projection.values.goals).toEqual(['length-retention']);
    expect(projection.appliedRevisionIds).toContain(
      '20000000-0000-4000-8000-000000000013',
    );
    expect(projection.supersededRevisionIds).toEqual([
      '20000000-0000-4000-8000-000000000011',
      '20000000-0000-4000-8000-000000000012',
    ]);
  });

  it('rejects branching corrections instead of choosing by recorded time', () => {
    expect(() =>
      projectHistory([
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000021',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000022',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000021',
          correctionReason: 'First replacement',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['moisture-retention'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000023',
          passportId,
          sequence: 4,
          baseRevision: 3,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000021',
          correctionReason: 'Conflicting replacement',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-04T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['length-retention'] },
        },
      ]),
    ).toThrow(/branching correction/i);
  });

  it('rejects correction cycles', () => {
    expect(() =>
      projectHistory([
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000024',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000025',
          correctionReason: 'First half of invalid cycle',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000025',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000024',
          correctionReason: 'Second half of invalid cycle',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-04T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['length-retention'] },
        },
      ]),
    ).toThrow(/correction cycle/i);
  });

  it('rejects a correction that targets a later revision', () => {
    expect(() =>
      projectHistory([
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000026',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'correction',
          correctsId: '20000000-0000-4000-8000-000000000027',
          correctionReason: 'Cannot correct a revision not yet entered',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['length-retention'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000027',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-04T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
      ]),
    ).toThrow(/must precede the correction/i);
  });

  it('reports overlapping same-field values as ambiguous and omits a false value', () => {
    const projection = projectHistory(
      [
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000031',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-03-01T10:00:00.000Z',
          source: 'user-estimated',
          patch: { goals: ['definition'] },
        },
        {
          id: '20000000-0000-4000-8000-000000000032',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-03-02T10:00:00.000Z',
          source: 'user-estimated',
          patch: { goals: ['length-retention'] },
        },
      ],
      { asOf: '2024-04-01' },
    );

    expect('goals' in projection.values).toBe(false);
    expect(projection.ambiguousFields.goals?.candidates).toEqual([
      {
        revisionId: '20000000-0000-4000-8000-000000000031',
        value: ['definition'],
        applicability: 'definite',
      },
      {
        revisionId: '20000000-0000-4000-8000-000000000032',
        value: ['length-retention'],
        applicability: 'definite',
      },
    ]);
  });

  it('keeps the prior value as a candidate during an approximate as-of interval', () => {
    const projection = projectHistory(
      [
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000041',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-03-01T10:00:00.000Z',
          source: 'user-estimated',
          patch: { maximumProductBudgetZar: 200 },
        },
      ],
      { asOf: '2024-02-10' },
    );

    expect('maximumProductBudgetZar' in projection.values).toBe(false);
    expect(
      projection.ambiguousFields.maximumProductBudgetZar?.candidates,
    ).toEqual([
      {
        revisionId: '20000000-0000-4000-8000-000000000001',
        value: 100,
        applicability: 'definite',
      },
      {
        revisionId: '20000000-0000-4000-8000-000000000041',
        value: 200,
        applicability: 'possible',
      },
    ]);
  });

  it('projects an exact historical as-of value without later changes', () => {
    const projection = projectHistory(
      [
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000051',
          passportId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-15' },
          recordedAt: '2024-02-16T10:00:00.000Z',
          source: 'user-reported',
          patch: { maximumProductBudgetZar: 150 },
        },
        {
          id: '20000000-0000-4000-8000-000000000052',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-03-01' },
          recordedAt: '2024-03-01T10:00:00.000Z',
          source: 'user-reported',
          patch: { maximumProductBudgetZar: 200 },
        },
      ],
      { asOf: '2024-02-20' },
    );

    expect(projection.values.maximumProductBudgetZar).toBe(150);
  });

  it('does not mutate revisions or nested patch values', () => {
    const revisions = [
      baseline,
      {
        id: '20000000-0000-4000-8000-000000000061',
        passportId,
        sequence: 2,
        baseRevision: 1,
        kind: 'change' as const,
        effectiveDate: { precision: 'unknown' as const, value: null },
        recordedAt: '2024-02-01T10:00:00.000Z',
        source: 'user-estimated' as const,
        patch: { porosity: 'unknown' as const },
      },
    ];
    const before = structuredClone(revisions);

    projectHistory(revisions, { asOf: '2024-04-01' });

    expect(revisions).toEqual(before);
  });

  it('rejects a revision patch containing an own undefined field', () => {
    const invalidChange = {
      id: '20000000-0000-4000-8000-000000000071',
      passportId,
      sequence: 2,
      baseRevision: 1,
      kind: 'change',
      effectiveDate: { precision: 'day', value: '2024-02-01' },
      recordedAt: '2024-02-01T10:00:00.000Z',
      source: 'user-reported',
      patch: { goals: undefined },
    } as unknown as PassportRevision;

    expect(() => projectHistory([baseline, invalidChange])).toThrow();
  });

  it('rejects a gap in complete history sequence numbers', () => {
    expect(() =>
      projectHistory([
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000072',
          passportId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-01T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
      ]),
    ).toThrow(/contiguous/i);
  });

  it('rejects a stale base revision in complete history', () => {
    expect(() =>
      projectHistory([
        baseline,
        {
          id: '20000000-0000-4000-8000-000000000073',
          passportId,
          sequence: 2,
          baseRevision: 0,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-01T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
      ]),
    ).toThrow(/base revision/i);
  });

  it('requires the complete baseline to be the first revision', () => {
    expect(() =>
      projectHistory([
        {
          ...baseline,
          sequence: 2,
          baseRevision: 1,
        },
        {
          id: '20000000-0000-4000-8000-000000000074',
          passportId,
          sequence: 1,
          baseRevision: 0,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2023-12-01' },
          recordedAt: '2023-12-01T10:00:00.000Z',
          source: 'user-reported',
          patch: { goals: ['definition'] },
        },
      ]),
    ).toThrow(/baseline.*first revision/i);
  });

  it('defaults as-of to the Africa/Johannesburg calendar date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T22:30:00.000Z'));

    expect(projectHistory([baseline]).asOf).toBe('2026-09-10');
  });
});

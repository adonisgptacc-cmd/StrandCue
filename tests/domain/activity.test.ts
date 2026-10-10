import { describe, expect, it } from 'vitest';

import {
  ActivityRevisionSchema,
  ActivityKindSchema,
  validateOperationKey,
  projectActivityHistory,
  type ActivityRevision,
} from '../../packages/domain/src/activity.ts';

const activityId = '30000000-0000-4000-8000-000000000001';

const baseline = {
  id: '40000000-0000-4000-8000-000000000001',
  activityId,
  sequence: 1,
  baseRevision: 0,
  kind: 'baseline' as const,
  effectiveDate: { precision: 'day' as const, value: '2024-01-15' },
  recordedAt: '2024-01-15T10:00:00.000Z',
  source: 'user-reported' as const,
  patch: {
    activityKind: 'wash' as const,
    precision: 'exact_day' as const,
    zones: [{ region: 'whole_head' as const, segment: 'entire_strand' as const }],
    notes: 'First wash',
    status: 'active' as const,
  },
} satisfies ActivityRevision;

describe('activity domain', () => {
  it('validates activity kind enum', () => {
    expect(() => ActivityKindSchema.parse('wash')).not.toThrow();
    expect(() => ActivityKindSchema.parse('invalid')).toThrow();
  });

  it('rejects notes longer than 2000 UTF-16 units', () => {
    const long = 'a'.repeat(2001);
    expect(() =>
      ActivityRevisionSchema.parse({ ...baseline, patch: { ...baseline.patch, notes: long } }),
    ).toThrow();
    expect(() => ActivityRevisionSchema.parse({ ...baseline, patch: { ...baseline.patch, notes: 'a'.repeat(2000) } })).not.toThrow();
  });

  it('composes activity history by effective date', () => {
    const projection = projectActivityHistory(
      [
        baseline,
        {
          id: '40000000-0000-4000-8000-000000000002',
          activityId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-02-10T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'February update' },
        },
      ],
      { asOf: '2024-03-01' },
    );
    expect(projection.values.notes).toBe('February update');
  });

  it('resolves correction to final replacement and reports superseded', () => {
    const projection = projectActivityHistory(
      [
        baseline,
        {
          id: '40000000-0000-4000-8000-000000000011',
          activityId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'wrong note' },
        },
        {
          id: '40000000-0000-4000-8000-000000000012',
          activityId,
          sequence: 3,
          baseRevision: 2,
          kind: 'correction',
          correctsId: '40000000-0000-4000-8000-000000000011',
          correctionReason: 'typo',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'corrected note' },
        },
      ],
      { asOf: '2024-03-01' },
    );
    expect(projection.values.notes).toBe('corrected note');
    expect(projection.supersededRevisionIds).toContain('40000000-0000-4000-8000-000000000011');
  });

  it('marks voided revisions as superseded and hidden from default values but audit-visible', () => {
    const revisions = [
      baseline,
      {
        id: '40000000-0000-4000-8000-000000000021',
        activityId,
        sequence: 2,
        baseRevision: 1,
        kind: 'void' as const,
        voidReason: 'duplicate entry',
        effectiveDate: { precision: 'day' as const, value: '2024-01-15' },
        recordedAt: '2024-01-16T10:00:00.000Z',
        source: 'user-reported' as const,
        patch: {},
      },
    ] satisfies ActivityRevision[];
    const projection = projectActivityHistory(revisions, { asOf: '2024-03-01' });
    // voided baseline should be considered superseded, no active values
    expect(projection.supersededRevisionIds).toContain('40000000-0000-4000-8000-000000000001');
    expect(projection.voidedRevisionIds).toContain('40000000-0000-4000-8000-000000000001');
    expect(projection.values.notes).toBeUndefined();
    // audit still contains the void revision
    expect(projection.allRevisionIds).toContain('40000000-0000-4000-8000-000000000021');
  });

  it('reports ambiguous same-month effective intervals', () => {
    const projection = projectActivityHistory(
      [
        baseline,
        {
          id: '40000000-0000-4000-8000-000000000031',
          activityId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-03-01T10:00:00.000Z',
          source: 'user-estimated',
          patch: { notes: 'option A' },
        },
        {
          id: '40000000-0000-4000-8000-000000000032',
          activityId,
          sequence: 3,
          baseRevision: 2,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2024-02' },
          recordedAt: '2024-03-02T10:00:00.000Z',
          source: 'user-estimated',
          patch: { notes: 'option B' },
        },
      ],
      { asOf: '2024-04-01' },
    );
    expect(projection.values.notes).toBeUndefined();
    expect(projection.ambiguousFields.notes).toBeDefined();
  });

  it('validates operation_key as UUID v4', () => {
    expect(() => validateOperationKey('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    expect(() => validateOperationKey('not-a-uuid')).toThrow();
    expect(() => validateOperationKey('')).toThrow();
  });

  it('rejects branching corrections', () => {
    expect(() =>
      projectActivityHistory([
        baseline,
        {
          id: '40000000-0000-4000-8000-000000000041',
          activityId,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'A' },
        },
        {
          id: '40000000-0000-4000-8000-000000000042',
          activityId,
          sequence: 3,
          baseRevision: 2,
          kind: 'correction',
          correctsId: '40000000-0000-4000-8000-000000000041',
          correctionReason: 'first',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-03T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'B' },
        },
        {
          id: '40000000-0000-4000-8000-000000000043',
          activityId,
          sequence: 4,
          baseRevision: 3,
          kind: 'correction',
          correctsId: '40000000-0000-4000-8000-000000000041',
          correctionReason: 'branch',
          effectiveDate: { precision: 'day', value: '2024-02-01' },
          recordedAt: '2024-02-04T10:00:00.000Z',
          source: 'user-reported',
          patch: { notes: 'C' },
        },
      ]),
    ).toThrow(/branching correction/i);
  });
});

import { describe, expect, it } from 'vitest';
import { CreateActivityCommandSchema } from '../../packages/domain/src/activity.ts';

const command = {
  operationId: '11111111-1111-4111-8111-111111111111',
  activityId: '22222222-2222-4222-8222-222222222222',
  kind: 'wash', occurredAt: '2024-01-15T10:00:00.000Z',
  precision: 'exact_day', notes: null,
};

describe('activity zone command limits', () => {
  it('rejects more than the 36 region/segment combinations', () => {
    const zones = Array.from({ length: 37 }, () => ({ region: 'front', segment: 'roots' }));
    expect(CreateActivityCommandSchema.safeParse({ ...command, zones }).success).toBe(false);
  });
  it('rejects unknown fields instead of silently discarding them', () => {
    const zones = [{ region: 'front', segment: 'roots', extra: 'data' }];
    expect(CreateActivityCommandSchema.safeParse({ ...command, zones }).success).toBe(false);
  });
});

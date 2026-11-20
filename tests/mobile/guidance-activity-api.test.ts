import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listGuidanceActivityHistories } from '../../apps/mobile/src/guidance/guidance-activity-api';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../apps/mobile/src/client', () => ({ supabase: { rpc: rpcMocks.rpc } }));

const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID = '22222222-2222-4222-8222-222222222222';
const RECORDED_AS_OF = '2026-10-11T10:00:00.000Z';
const CURSOR = { baselineRecordedAt: '2026-10-10T10:00:00.000Z', activityId: ACTIVITY_ID };

function page(overrides: Record<string, unknown> = {}) {
  return {
    items: [{
      activityId: ACTIVITY_ID,
      revisions: [{
        id: BASELINE_ID,
        activityId: ACTIVITY_ID,
        sequence: 1,
        baseRevision: 0,
        kind: 'baseline',
        effectiveDate: { precision: 'day', value: '2026-06-01' },
        recordedAt: CURSOR.baselineRecordedAt,
        source: 'user-reported',
        patch: { activityKind: 'wash', precision: 'exact_day', zones: [], notes: '', status: 'active' },
      }],
    }],
    nextCursor: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rpcMocks.rpc.mockResolvedValue({ data: page(), error: null });
});

describe('guidance activity history API', () => {
  it('sends exact owner-free RPC arguments with the default limit', async () => {
    const result = await listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF);
    expect(result.items[0].activityId).toBe(ACTIVITY_ID);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_guidance_activity_histories', {
      p_effective_as_of: '2026-10-11',
      p_recorded_as_of: RECORDED_AS_OF,
      p_limit: 100,
      p_cursor: null,
    });
  });

  it('forwards a validated cursor and caps an oversized positive limit at 100', async () => {
    await listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF, { limit: 500, cursor: CURSOR });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_guidance_activity_histories', {
      p_effective_as_of: '2026-10-11',
      p_recorded_as_of: RECORDED_AS_OF,
      p_limit: 100,
      p_cursor: CURSOR,
    });
  });

  it('rejects invalid dates, limits, cursors, and owner IDs before RPC', async () => {
    await expect(listGuidanceActivityHistories('2026-02-30', RECORDED_AS_OF)).rejects.toThrow();
    await expect(listGuidanceActivityHistories('2026-10-11', '2026-10-11T10:00:00')).rejects.toThrow();
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF, { limit: 0 })).rejects.toThrow();
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF, { limit: 1.5 })).rejects.toThrow();
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF, { cursor: { ...CURSOR, baselineRecordedAt: 'bad' } })).rejects.toThrow();
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF, { ownerId: 'other' } as never)).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed RPC page and surfaces a database error', async () => {
    rpcMocks.rpc.mockResolvedValueOnce({ data: page({ ownerId: 'other' }), error: null });
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF)).rejects.toThrow();
    rpcMocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection reset' } });
    await expect(listGuidanceActivityHistories('2026-10-11', RECORDED_AS_OF)).rejects.toThrow(/connection reset/);
  });
});

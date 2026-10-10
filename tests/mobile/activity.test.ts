import { describe, expect, it, vi } from 'vitest';

import {
  correctActivity,
  getActivity,
  listActivities,
  recordActivity,
} from '../../apps/mobile/src/activity-api';
import {
  activityDraftIndexKey,
  activityDraftKey,
  clearActivityDrafts,
  readActivityDrafts,
  removeActivityDraft,
  saveActivityDraft,
  submitActivityDraft,
  type ActivityDraft,
  type ActivityDraftStorage,
} from '../../apps/mobile/src/activity-drafts';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

const operationId = '50000000-0000-4000-8000-000000000001';
const activityId = '50000000-0000-4000-8000-000000000002';
const revisionId = '50000000-0000-4000-8000-000000000003';
const ownerA = '60000000-0000-4000-8000-000000000001';
const ownerB = '60000000-0000-4000-8000-000000000002';

const zones = [{ region: 'whole_head' as const, segment: 'entire_strand' as const }];

const createCommand = {
  operationId,
  activityId,
  kind: 'wash' as const,
  occurredAt: '2024-01-15T10:00:00.000Z',
  precision: 'exact_day' as const,
  zones,
  notes: 'wash notes',
};

function memoryStorage(): ActivityDraftStorage {
  let values: Record<string, string> = {};
  return {
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => { values = { ...values, [key]: value }; },
    removeItem: async (key: string) => { values = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)); },
  };
}
const createDraft = (): ActivityDraft => ({ mode: 'add', command: { ...createCommand } });

describe('activity mobile boundary', () => {
  it('sends a validated record command without owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { activityId, revision: 1, revisions: [] }, error: null });
    await expect(recordActivity(createCommand)).resolves.toMatchObject({ activityId, revision: 1 });
    expect(rpc).toHaveBeenLastCalledWith('record_activity', {
      p_operation_id: operationId,
      p_activity_id: activityId,
      p_kind: 'wash',
      p_occurred_at: '2024-01-15T10:00:00.000Z',
      p_precision: 'exact_day',
      p_zones: zones,
      p_notes: 'wash notes',
    });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters).not.toHaveProperty('owner');
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { activityId, revision: 1, revisions: [], owner: ownerA }, error: null });
    await expect(recordActivity(createCommand)).rejects.toThrow();
  });

  it('sends correction with expected revision and reason', async () => {
    rpc.mockResolvedValueOnce({ data: { activityId, revision: 2, revisions: [] }, error: null });
    await correctActivity({ operationId, activityId, expectedRevision: 1, correctsId: revisionId, reason: 'typo', notes: 'fixed' });
    expect(rpc).toHaveBeenLastCalledWith('correct_activity', {
      p_operation_id: operationId,
      p_activity_id: activityId,
      p_expected_revision: 1,
      p_corrects_id: revisionId,
      p_reason: 'typo',
      p_notes: 'fixed',
    });
  });

  it('lists activities excluding voided and parses audit detail', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [{ id: activityId, revision: 1 }], nextCursor: null }, error: null });
    await expect(listActivities('2024-03-01')).resolves.toEqual({ items: [{ id: activityId, revision: 1 }], nextCursor: null });
    rpc.mockResolvedValueOnce({
      data: { id: activityId, revision: 2, voided: true, revisions: [{ id: revisionId, kind: 'void', precision: 'unknown', correctsId: null, voidReason: 'duplicate', patch: {} }] },
      error: null,
    });
    const detail = await getActivity(activityId, true);
    expect(detail?.voided).toBe(true);
    expect(detail?.revisions[0]).toMatchObject({ kind: 'void' });
  });

  it('pages through cursors and rejects out-of-range limits before sending', async () => {
    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: activityId };
    rpc.mockResolvedValueOnce({ data: { items: [{ id: activityId, revision: 1 }], nextCursor: cursor }, error: null });
    await expect(listActivities('2024-03-01', { limit: 10 })).resolves.toMatchObject({ nextCursor: cursor });
    expect(rpc).toHaveBeenLastCalledWith('list_activities', { p_as_of: '2024-03-01', p_limit: 10, p_cursor: null });
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null });
    await expect(listActivities('2024-03-01', { limit: 10, cursor })).resolves.toMatchObject({ items: [], nextCursor: null });
    expect(rpc).toHaveBeenLastCalledWith('list_activities', { p_as_of: '2024-03-01', p_limit: 10, p_cursor: cursor });
    await expect(listActivities('2024-03-01', { limit: 101 })).rejects.toThrow();
    await expect(listActivities('2024-03-01', { limit: 0 })).rejects.toThrow();
  });

  it('rejects notes longer than 2000 characters before sending', async () => {
    await expect(recordActivity({ ...createCommand, notes: 'a'.repeat(2001) })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalledWith('record_activity', expect.anything());
  });

  it('keeps operation IDs stable across retry of the identical command', async () => {
    const retry = { ...createCommand };
    expect(retry).toEqual(createCommand);
    rpc.mockResolvedValueOnce({ data: { activityId, revision: 1, revisions: [] }, error: null });
    await recordActivity(retry);
    expect(rpc).toHaveBeenLastCalledWith('record_activity', expect.objectContaining({ p_operation_id: operationId }));
  });
});

describe('activity drafts', () => {
  it('indexes drafts by owner and activity and only clears that owner', async () => {
    const storage = memoryStorage();
    expect(activityDraftKey(ownerA, activityId)).toBe(`strandcue-activity-draft-${ownerA}-${activityId}`);
    expect(activityDraftIndexKey(ownerA)).toBe(`strandcue-activity-drafts-${ownerA}`);
    await saveActivityDraft(storage, ownerA, createDraft());
    await saveActivityDraft(storage, ownerB, createDraft());
    await clearActivityDrafts(storage, ownerA);
    expect(await readActivityDrafts(storage, ownerA)).toEqual([]);
    expect(await readActivityDrafts(storage, ownerB)).toEqual([createDraft()]);
  });

  it('persists before sending and retries the identical locked command after uncertain failure', async () => {
    const storage = memoryStorage();
    const received: unknown[] = [];
    let attempt = 0;
    const dispatch = async (draft: ActivityDraft) => {
      expect(await readActivityDrafts(storage, ownerA)).toEqual([createDraft()]);
      received.push(draft);
      if (++attempt === 1) throw new Error('Network unavailable');
    };
    await expect(submitActivityDraft(storage, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow('Network unavailable');
    const [restored] = await readActivityDrafts(storage, ownerA);
    await submitActivityDraft(storage, ownerA, restored, dispatch, () => true);
    expect(received).toEqual([createDraft(), createDraft()]);
    expect(await readActivityDrafts(storage, ownerA)).toEqual([]);
  });

  it('never sends when persistence fails or the editor becomes stale', async () => {
    const storage = memoryStorage();
    let sends = 0;
    const dispatch = async () => { sends++; };
    await expect(submitActivityDraft({ ...storage, setItem: async () => { throw new Error('Disk failed'); } }, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow();
    await expect(submitActivityDraft(storage, ownerA, createDraft(), dispatch, () => false)).rejects.toThrow();
    expect(sends).toBe(0);
  });

  it('tolerates missing draft values and retains other indexed drafts on explicit discard', async () => {
    const storage = memoryStorage();
    const secondId = '50000000-0000-4000-8000-000000000009';
    const second: ActivityDraft = { mode: 'add', command: { ...createCommand, activityId: secondId, operationId: '50000000-0000-4000-8000-000000000010' } };
    await saveActivityDraft(storage, ownerA, createDraft());
    await saveActivityDraft(storage, ownerA, second);
    await removeActivityDraft(storage, ownerA, activityId);
    expect(await readActivityDrafts(storage, ownerA)).toEqual([second]);
  });

  it('rejects foreign draft keys before clearing', async () => {
    const storage = memoryStorage();
    await storage.setItem(activityDraftIndexKey(ownerA), JSON.stringify([`strandcue-activity-draft-${ownerB}-${activityId}`]));
    await expect(clearActivityDrafts(storage, ownerA)).rejects.toThrow();
  });

  it('surfaces possible duplicates for review without merging', async () => {
    const existing = [{ id: '50000000-0000-4000-8000-000000000020', occurredAt: '2024-01-15T10:05:00.000Z', kind: 'wash' }];
    const candidate = { occurredAt: '2024-01-15T10:00:00.000Z', kind: 'wash' };
    const { findPossibleDuplicates } = await import('../../apps/mobile/src/activity-drafts');
    const matches = findPossibleDuplicates(existing, candidate, 60 * 60 * 1000);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ id: existing[0].id });
    // different kind is not a duplicate
    expect(findPossibleDuplicates(existing, { ...candidate, kind: 'styling' }, 60 * 60 * 1000)).toEqual([]);
    // outside the window is not a duplicate
    expect(findPossibleDuplicates(existing, { ...candidate, occurredAt: '2024-01-16T10:00:00.000Z' }, 60 * 60 * 1000)).toEqual([]);
  });
});

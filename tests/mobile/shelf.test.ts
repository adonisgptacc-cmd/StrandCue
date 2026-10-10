import { describe, expect, it, vi } from 'vitest';

import {
  archiveUserProduct,
  getUserProduct,
  listUserProducts,
  matchUserProduct,
  recordUserProduct,
} from '../../apps/mobile/src/shelf-api';
import {
  shelfDraftIndexKey,
  shelfDraftKey,
  clearShelfDrafts,
  readShelfDrafts,
  removeShelfDraft,
  saveShelfDraft,
  submitShelfDraft,
  type ShelfDraft,
  type ShelfDraftStorage,
} from '../../apps/mobile/src/shelf-drafts';
import {
  shelfEditorCopy,
  shelfView,
  verificationBadge,
} from '../../apps/mobile/src/shelf-history';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

const operationId = 'a0000000-0000-4000-8000-000000000001';
const userProductId = 'a0000000-0000-4000-8000-000000000002';
const versionId = 'a0000000-0000-4000-8000-000000000003';
const ownerA = 'b0000000-0000-4000-8000-000000000001';
const ownerB = 'b0000000-0000-4000-8000-000000000002';

const createCommand = {
  operationId,
  userProductId,
  versionId: null,
  manualBrand: 'House brand',
  manualName: 'Gentle shampoo',
  manualCategory: 'shampoo' as const,
  availability: 'available' as const,
  notes: null,
};

function memoryStorage(): ShelfDraftStorage {
  let values: Record<string, string> = {};
  return {
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => { values = { ...values, [key]: value }; },
    removeItem: async (key: string) => { values = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)); },
  };
}
const createDraft = (): ShelfDraft => ({ mode: 'add', command: { ...createCommand } });

describe('shelf mobile boundary', () => {
  it('sends a validated add command without owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 1, revisions: [] }, error: null });
    await expect(recordUserProduct(createCommand)).resolves.toMatchObject({ userProductId, revision: 1 });
    expect(rpc).toHaveBeenLastCalledWith('shelf_add', expect.objectContaining({
      p_operation_id: operationId,
      p_user_product_id: userProductId,
      p_manual_name: 'Gentle shampoo',
    }));
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters).not.toHaveProperty('owner');
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 1, revisions: [], owner: ownerA }, error: null });
    await expect(recordUserProduct(createCommand)).rejects.toThrow();
  });

  it('requires confirmation for match and sends archive distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 2, revisions: [] }, error: null });
    await matchUserProduct({ operationId, userProductId, expectedRevision: 1, versionId, confirmed: true });
    expect(rpc).toHaveBeenLastCalledWith('shelf_match', expect.objectContaining({ p_confirmed: true }));
    await expect(matchUserProduct({ operationId, userProductId, expectedRevision: 1, versionId, confirmed: false as unknown as true })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { userProductId, revision: 3, revisions: [] }, error: null });
    await archiveUserProduct({ operationId, userProductId, expectedRevision: 2 });
    expect(rpc).toHaveBeenLastCalledWith('shelf_archive', expect.objectContaining({ p_user_product_id: userProductId }));
  });

  it('lists non-archived items and parses history with match state', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [{ id: userProductId, revision: 1, availability: 'available', manualName: 'Gentle shampoo' }], nextCursor: null }, error: null });
    await expect(listUserProducts()).resolves.toMatchObject({ items: [{ id: userProductId }], nextCursor: null });
    rpc.mockResolvedValueOnce({
      data: { id: userProductId, revision: 2, availability: 'available', matched: true, matchConfirmed: true, manualName: 'My shampoo guess', versionId, revisions: [] },
      error: null,
    });
    const detail = await getUserProduct(userProductId, true);
    expect(detail).toMatchObject({ matched: true, manualName: 'My shampoo guess' });
  });

  it('pages through cursors and rejects out-of-range limits before sending', async () => {
    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: userProductId };
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: cursor }, error: null });
    await expect(listUserProducts({ limit: 10 })).resolves.toMatchObject({ nextCursor: cursor });
    expect(rpc).toHaveBeenLastCalledWith('shelf_list', { p_limit: 10, p_cursor: null });
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null });
    await expect(listUserProducts({ limit: 10, cursor })).resolves.toMatchObject({ nextCursor: null });
    expect(rpc).toHaveBeenLastCalledWith('shelf_list', { p_limit: 10, p_cursor: cursor });
    await expect(listUserProducts({ limit: 101 })).rejects.toThrow();
  });

  it('rejects notes longer than 2000 characters before sending', async () => {
    await expect(recordUserProduct({ ...createCommand, notes: 'a'.repeat(2001) })).rejects.toThrow();
  });

  it('labels verification status as text, never colour-only or whole-record truth', () => {
    expect(verificationBadge('verified')).toContain('Verified');
    expect(verificationBadge('unverified')).toContain('Unverified');
    expect(verificationBadge('conflicting_information')).toContain('Conflicting');
    // Unknown ingredients stay unknown; null is never presented as a finding.
    expect(verificationBadge('unverified')).not.toContain('no protein');
  });

  it('labels editor actions and list states without shopping language', () => {
    expect(shelfEditorCopy('add')).toMatchObject({ title: 'Add a product' });
    expect(shelfEditorCopy('match')).toMatchObject({ title: 'Match to catalogue entry' });
    expect(shelfEditorCopy('archive')).toMatchObject({ title: 'Archive this product' });
    expect(shelfView(true, [], null)).toBe('loading');
    expect(shelfView(false, [], null)).toBe('empty');
    expect(shelfView(false, [{ id: 'x' }], null)).toBe('list');
  });
});

describe('shelf drafts', () => {
  it('indexes drafts by owner and product and only clears that owner', async () => {
    const storage = memoryStorage();
    expect(shelfDraftKey(ownerA, userProductId)).toBe(`strandcue-shelf-draft-${ownerA}-${userProductId}`);
    expect(shelfDraftIndexKey(ownerA)).toBe(`strandcue-shelf-drafts-${ownerA}`);
    await saveShelfDraft(storage, ownerA, createDraft());
    await saveShelfDraft(storage, ownerB, createDraft());
    await clearShelfDrafts(storage, ownerA);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([]);
    expect(await readShelfDrafts(storage, ownerB)).toEqual([createDraft()]);
  });

  it('persists before sending and retries the identical locked command after uncertain failure', async () => {
    const storage = memoryStorage();
    const received: unknown[] = [];
    let attempt = 0;
    const dispatch = async (draft: ShelfDraft) => {
      expect(await readShelfDrafts(storage, ownerA)).toEqual([createDraft()]);
      received.push(draft);
      if (++attempt === 1) throw new Error('Network unavailable');
    };
    await expect(submitShelfDraft(storage, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow('Network unavailable');
    const [restored] = await readShelfDrafts(storage, ownerA);
    await submitShelfDraft(storage, ownerA, restored, dispatch, () => true);
    expect(received).toEqual([createDraft(), createDraft()]);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([]);
  });

  it('never sends when persistence fails or the editor becomes stale', async () => {
    const storage = memoryStorage();
    let sends = 0;
    const dispatch = async () => { sends++; };
    await expect(submitShelfDraft({ ...storage, setItem: async () => { throw new Error('Disk failed'); } }, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow();
    await expect(submitShelfDraft(storage, ownerA, createDraft(), dispatch, () => false)).rejects.toThrow();
    expect(sends).toBe(0);
  });

  it('retains other indexed drafts on explicit discard', async () => {
    const storage = memoryStorage();
    const secondId = 'a0000000-0000-4000-8000-000000000009';
    const second: ShelfDraft = { mode: 'add', command: { ...createCommand, userProductId: secondId, operationId: 'a0000000-0000-4000-8000-000000000010' } };
    await saveShelfDraft(storage, ownerA, createDraft());
    await saveShelfDraft(storage, ownerA, second);
    await removeShelfDraft(storage, ownerA, userProductId);
    expect(await readShelfDrafts(storage, ownerA)).toEqual([second]);
  });
});

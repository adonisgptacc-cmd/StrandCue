import { describe, expect, it, vi } from 'vitest';

import {
  archiveUserTool,
  getUserTool,
  listUserTools,
  matchUserTool,
  recordUserTool,
} from '../../apps/mobile/src/tool-api';
import {
  toolDraftIndexKey,
  toolDraftKey,
  clearToolDrafts,
  readToolDrafts,
  removeToolDraft,
  saveToolDraft,
  submitToolDraft,
  type ToolDraft,
  type ToolDraftStorage,
} from '../../apps/mobile/src/tool-drafts';
import {
  appendToolPage,
  toolEditorCopy,
  toolView,
} from '../../apps/mobile/src/tool-history';

vi.mock('react-native', () => {
  return { StyleSheet: { create: (value: unknown) => value } };
});

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

const operationId = 'e0000000-0000-4000-8000-000000000001';
const userToolId = 'e0000000-0000-4000-8000-000000000002';
const versionId = 'e0000000-0000-4000-8000-000000000003';
const ownerA = 'f0000000-0000-4000-8000-000000000001';
const ownerB = 'f0000000-0000-4000-8000-000000000002';

const createCommand = {
  operationId,
  userToolId,
  effectiveDate: { precision: 'day', value: '2026-03-01' } as const,
  versionId: null,
  manualBrand: 'Salon brand',
  manualModel: 'Pro dryer',
  toolType: 'dryer' as const,
  availability: 'available' as const,
  notes: null,
};

function memoryStorage(): ToolDraftStorage {
  let values: Record<string, string> = {};
  return {
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => { values = { ...values, [key]: value }; },
    removeItem: async (key: string) => { values = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)); },
  };
}
const createDraft = (): ToolDraft => ({ mode: 'add', command: { ...createCommand } });

describe('tools mobile boundary', () => {
  it('sends a validated add command without owner fields', async () => {
    rpc.mockResolvedValueOnce({ data: { userToolId, revision: 1, revisions: [] }, error: null });
    await expect(recordUserTool(createCommand)).resolves.toMatchObject({ userToolId, revision: 1 });
    expect(rpc).toHaveBeenLastCalledWith('tool_add', expect.objectContaining({
      p_operation_id: operationId,
      p_user_tool_id: userToolId,
      p_facts: expect.objectContaining({ manualModel: 'Pro dryer' }),
    }));
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters).not.toHaveProperty('owner');
  });

  it('rejects a receipt that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { userToolId, revision: 1, revisions: [], owner: ownerA }, error: null });
    await expect(recordUserTool(createCommand)).rejects.toThrow();
  });

  it('requires confirmation for match and sends archive distinctly', async () => {
    rpc.mockResolvedValueOnce({ data: { userToolId, revision: 2, revisions: [] }, error: null });
    await matchUserTool({ operationId, userToolId, expectedRevision: 1, versionId, confirmed: true });
    expect(rpc).toHaveBeenLastCalledWith('tool_match', expect.objectContaining({ p_confirmed: true }));
    await expect(matchUserTool({ operationId, userToolId, expectedRevision: 1, versionId, confirmed: false as unknown as true })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { userToolId, revision: 3, revisions: [] }, error: null });
    await archiveUserTool({ operationId, userToolId, expectedRevision: 2 });
    expect(rpc).toHaveBeenLastCalledWith('tool_archive', expect.objectContaining({ p_user_tool_id: userToolId }));
  });

  it('lists non-archived items and parses history with match state', async () => {
    rpc.mockResolvedValueOnce({ data: { items: [{ id: userToolId, revision: 1, availability: 'available', manualBrand: null, manualModel: 'Pro dryer', toolType: null, matched: false, catalogueLifecycle: null, condition: null, heatMethods: null }], nextCursor: null }, error: null });
    await expect(listUserTools()).resolves.toMatchObject({ items: [{ id: userToolId }], nextCursor: null });
    rpc.mockResolvedValueOnce({
      data: {
        id: userToolId, revision: 2, availability: 'available', matched: true, matchConfirmed: true, manualBrand: null, manualModel: 'My dryer guess', toolType: null,
        wattageWatts: null, adjustableTemp: null, settings: null, attachments: null, condition: null, heatMethods: null, notes: null, versionId, revisions: [],
      },
      error: null,
    });
    const detail = await getUserTool(userToolId, true);
    expect(detail).toMatchObject({ matched: true, manualModel: 'My dryer guess' });
  });

  it('pages through cursors and rejects out-of-range limits before sending', async () => {
    const cursor = { updatedAt: '2024-01-15T10:00:00.000000Z', id: userToolId };
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: cursor }, error: null });
    await expect(listUserTools({ limit: 10 })).resolves.toMatchObject({ nextCursor: cursor });
    expect(rpc).toHaveBeenLastCalledWith('tool_list', { p_limit: 10, p_cursor: null });
    rpc.mockResolvedValueOnce({ data: { items: [], nextCursor: null }, error: null });
    await expect(listUserTools({ limit: 10, cursor })).resolves.toMatchObject({ nextCursor: null });
    expect(rpc).toHaveBeenLastCalledWith('tool_list', { p_limit: 10, p_cursor: cursor });
    await expect(listUserTools({ limit: 101 })).rejects.toThrow();
  });

  it('rejects notes longer than 2000 characters before sending', async () => {
    await expect(recordUserTool({ ...createCommand, notes: 'a'.repeat(2001) })).rejects.toThrow();
  });

  it('appends a page without repeating a tool', () => {
    expect(appendToolPage([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('labels editor actions and list states without shopping language', () => {
    expect(toolEditorCopy('add')).toMatchObject({ title: 'Add a tool' });
    expect(toolEditorCopy('edit')).toMatchObject({ title: 'Edit this tool', submit: 'Save changes' });
    expect(toolEditorCopy('correct')).toMatchObject({ title: 'Correct this tool', submit: 'Save correction' });
    expect(toolEditorCopy('match')).toMatchObject({ title: 'Match to catalogue' });
    expect(toolEditorCopy('archive')).toMatchObject({ title: 'Archive this tool' });
    expect(toolView(true, [], null)).toBe('loading');
    expect(toolView(false, [], null)).toBe('empty');
    expect(toolView(false, [{ id: 'x' }], null)).toBe('list');
  });
});

describe('tool drafts', () => {
  it('indexes drafts by owner and tool and only clears that owner', async () => {
    const storage = memoryStorage();
    expect(toolDraftKey(ownerA, userToolId)).toBe(`strandcue-tool-draft-${ownerA}-${userToolId}`);
    expect(toolDraftIndexKey(ownerA)).toBe(`strandcue-tool-drafts-${ownerA}`);
    await saveToolDraft(storage, ownerA, createDraft());
    await saveToolDraft(storage, ownerB, createDraft());
    await clearToolDrafts(storage, ownerA);
    expect(await readToolDrafts(storage, ownerA)).toEqual([]);
    expect(await readToolDrafts(storage, ownerB)).toEqual([createDraft()]);
  });

  it('persists before sending and retries the identical locked command after uncertain failure', async () => {
    const storage = memoryStorage();
    const received: unknown[] = [];
    let attempt = 0;
    const dispatch = async (draft: ToolDraft) => {
      expect(await readToolDrafts(storage, ownerA)).toEqual([createDraft()]);
      received.push(draft);
      if (++attempt === 1) throw new Error('Network unavailable');
    };
    await expect(submitToolDraft(storage, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow('Network unavailable');
    const [restored] = await readToolDrafts(storage, ownerA);
    await submitToolDraft(storage, ownerA, restored, dispatch, () => true);
    expect(received).toEqual([createDraft(), createDraft()]);
    expect(await readToolDrafts(storage, ownerA)).toEqual([]);
  });

  it('never sends when persistence fails or the editor becomes stale', async () => {
    const storage = memoryStorage();
    let sends = 0;
    const dispatch = async () => { sends++; };
    await expect(submitToolDraft({ ...storage, setItem: async () => { throw new Error('Disk failed'); } }, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow();
    await expect(submitToolDraft(storage, ownerA, createDraft(), dispatch, () => false)).rejects.toThrow();
    expect(sends).toBe(0);
  });

  it('fails closed on a damaged device index or draft instead of guessing', async () => {
    const storage = memoryStorage();
    // An index naming a key that is not this owner's draft key is never followed.
    await storage.setItem(toolDraftIndexKey(ownerA), JSON.stringify([`strandcue-tool-draft-${ownerB}-${userToolId}`]));
    await expect(readToolDrafts(storage, ownerA)).rejects.toThrow('Invalid draft index');
    await expect(saveToolDraft(storage, ownerA, createDraft())).rejects.toThrow('Invalid draft index');
    // A draft stored under another tool's key is refused.
    const good = memoryStorage();
    await saveToolDraft(good, ownerA, createDraft());
    const otherId = 'e0000000-0000-4000-8000-000000000077';
    await good.setItem(toolDraftIndexKey(ownerA), JSON.stringify([toolDraftKey(ownerA, otherId)]));
    await good.setItem(toolDraftKey(ownerA, otherId), JSON.stringify(createDraft()));
    await expect(readToolDrafts(good, ownerA)).rejects.toThrow('Draft does not match tool');
    // An indexed draft whose body is gone is simply not a draft.
    await good.removeItem(toolDraftKey(ownerA, otherId));
    expect(await readToolDrafts(good, ownerA)).toEqual([]);
  });

  it('keeps at most twenty drafts, and stops sending when the editor closes while saving', async () => {
    const storage = memoryStorage();
    for (let index = 0; index < 20; index++) {
      const id = `e0000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`;
      await saveToolDraft(storage, ownerA, { mode: 'add', command: { ...createCommand, userToolId: id } });
    }
    await expect(saveToolDraft(storage, ownerA, createDraft())).rejects.toThrow('Draft limit reached');
    // Saving an existing draft again is an update, not a twenty-first draft.
    await saveToolDraft(storage, ownerA, { mode: 'add', command: { ...createCommand, userToolId: 'e0000000-0000-4000-8000-000000000100', notes: 'again' } });
    expect(await readToolDrafts(storage, ownerA)).toHaveLength(20);
    let active = true;
    let sends = 0;
    const fresh = memoryStorage();
    await expect(submitToolDraft({ ...fresh, setItem: async (key, value) => { await fresh.setItem(key, value); active = false; } }, ownerA, createDraft(), async () => { sends++; }, () => active)).rejects.toThrow('Editor is no longer active');
    expect(sends).toBe(0);
  });

  it('reports a save that landed even when tidying the device draft fails afterwards', async () => {
    const storage = memoryStorage();
    let removals = 0;
    const flaky = { ...storage, removeItem: async (key: string) => { removals++; throw new Error('storage failed ' + key); } };
    let sent = 0;
    await expect(submitToolDraft(flaky, ownerA, createDraft(), async () => { sent++; }, () => true)).resolves.toBeUndefined();
    expect(sent).toBe(1);
    expect(removals).toBeGreaterThan(0);
    // The kept copy is the same command, so a later retry cannot record a second change.
    expect(await readToolDrafts(storage, ownerA)).toEqual([createDraft()]);
  });

  it('can clear a damaged device index, which would otherwise make the drafts unreadable for good', async () => {
    const storage = memoryStorage();
    await storage.setItem(toolDraftIndexKey(ownerA), '{not json');
    await expect(readToolDrafts(storage, ownerA)).rejects.toThrow();
    await clearToolDrafts(storage, ownerA);
    expect(await readToolDrafts(storage, ownerA)).toEqual([]);
  });

  it('retains other indexed drafts on explicit discard', async () => {
    const storage = memoryStorage();
    const secondId = 'e0000000-0000-4000-8000-000000000009';
    const second: ToolDraft = { mode: 'add', command: { ...createCommand, userToolId: secondId, operationId: 'e0000000-0000-4000-8000-000000000010' } };
    await saveToolDraft(storage, ownerA, createDraft());
    await saveToolDraft(storage, ownerA, second);
    await removeToolDraft(storage, ownerA, userToolId);
    expect(await readToolDrafts(storage, ownerA)).toEqual([second]);
  });
});

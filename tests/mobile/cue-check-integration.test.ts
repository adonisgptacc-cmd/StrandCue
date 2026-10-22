import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../apps/mobile/src/cue-check-api';
import { CUE_CHECK_ERROR_COPY } from '../../apps/mobile/src/cue-check-errors';
import { createCueCheckController } from '../../apps/mobile/src/cue-check-state';
import { generateTodayGuidance } from '../../apps/mobile/src/guidance/today-guidance-service';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const clientMocks = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock('../../apps/mobile/src/client', () => ({
  get supabase() {
    return clientMocks.supabase;
  },
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: async (_algorithm: string, text: string) => createHash('sha256').update(text, 'utf8').digest('hex'),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));
vi.mock('../../apps/mobile/src/guidance/guidance-snapshot', () => ({ loadGuidanceSnapshot: vi.fn() }));

const CUE_RPCS = ['record_cue_check', 'correct_cue_check', 'void_cue_check', 'list_cue_checks', 'get_cue_check'];
const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const OBSERVED_AT = '2026-10-22T09:30:00-05:00';
const RECEIVED_AT = '2026-10-22T14:31:00.000000+00:00';

function recordId(n: number): string {
  return `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`;
}
function opId(n: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
}

let opCounter = 0;
const newOperationId = () => opId(++opCounter);

function observation(overrides: Record<string, unknown> = {}) {
  return { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', dryness: 'unknown', notes: ' as typed ', ...overrides };
}

function receipt(n = 1, overrides: Record<string, unknown> = {}) {
  return {
    recordId: recordId(n),
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    goal: 'basic_wash',
    timing: 'immediate',
    lifecycle: 'active',
    revision: 1,
    observedAt: OBSERVED_AT,
    receivedAt: RECEIVED_AT,
    observation: observation(),
    confirmedSteps: [],
    executionStatus: 'completed',
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
    ...overrides,
  };
}

function detail(n = 1, overrides: Record<string, unknown> = {}) {
  const base = receipt(n, overrides);
  const revision = base.revision as number;
  const voided = base.lifecycle === 'voided';
  const revisions: Record<string, unknown>[] = [
    {
      revisionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n * 10 + 1).padStart(12, '0')}`,
      sequence: 1,
      kind: 'create',
      observation: observation(),
      correctsId: null,
      correctionReason: null,
      voidReason: null,
      receivedAt: RECEIVED_AT,
      state: revision === 1 && !voided ? 'active' : 'corrected',
    },
  ];
  if (revision >= 2) {
    const last = voided && revision === 2;
    revisions.push(
      last
        ? {
            revisionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n * 10 + 2).padStart(12, '0')}`,
            sequence: 2,
            kind: 'void',
            observation: null,
            correctsId: revisions[0]?.revisionId,
            correctionReason: null,
            voidReason: 'Entered by mistake',
            receivedAt: RECEIVED_AT,
            state: null,
          }
        : {
            revisionId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n * 10 + 2).padStart(12, '0')}`,
            sequence: 2,
            kind: 'correct',
            observation: base.observation,
            correctsId: revisions[0]?.revisionId,
            correctionReason: 'Changed my mind',
            voidReason: null,
            receivedAt: RECEIVED_AT,
            state: voided ? 'voided' : 'active',
          },
    );
  }
  return { ...base, revisions };
}

function rpcNames(): string[] {
  return rpcMocks.rpc.mock.calls.map(call => call[0] as string);
}

function controller(ownerKey = 'owner-a') {
  return createCueCheckController({ ownerKey, api, newOperationId, pageSize: 2 });
}

beforeEach(() => {
  vi.clearAllMocks();
  opCounter = 0;
  clientMocks.supabase = { rpc: rpcMocks.rpc, from: rpcMocks.from };
});

describe('Cue Check journey through the real client boundary', () => {
  it('terminal execution context → new draft → save receipt', async () => {
    rpcMocks.rpc.mockResolvedValueOnce({ data: receipt(1), error: null }).mockResolvedValueOnce({ data: detail(1), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', dryness: 'unknown', notes: ' as typed ' });
    await c.save();
    expect(rpcMocks.rpc.mock.calls[0]).toEqual([
      'record_cue_check',
      { p_operation_id: opId(1), p_execution_id: EXECUTION_ID, p_observation: observation() },
    ]);
    const state = c.getState();
    expect(state).toMatchObject({ phase: 'detail-ready', compose: null, pending: null, failure: null });
    expect(state.selected?.recordId).toBe(recordId(1));
    expect(state.selected?.observation.notes).toBe(' as typed ');
  });

  it('refuses to start a draft from an execution that is still running', async () => {
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'in_progress' } as never);
    await c.save();
    expect(c.getState().phase).toBe('idle');
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('existing detail → correction → refreshed detail', async () => {
    rpcMocks.rpc
      .mockResolvedValueOnce({ data: detail(1), error: null })
      .mockResolvedValueOnce({ data: receipt(1, { revision: 2, observation: observation({ overallResult: 'same' }) }), error: null })
      .mockResolvedValueOnce({ data: detail(1, { revision: 2, observation: observation({ overallResult: 'same' }) }), error: null });
    const c = controller();
    await c.openDetail(recordId(1));
    c.startCorrection();
    c.editDraft({ overallResult: 'same' });
    c.setReason('Wrong tap');
    await c.save();
    expect(rpcNames()).toEqual(['get_cue_check', 'correct_cue_check', 'get_cue_check']);
    expect(rpcMocks.rpc.mock.calls[1]?.[1]).toMatchObject({ p_expected_revision: 1, p_reason: 'Wrong tap' });
    const state = c.getState();
    expect(state.phase).toBe('detail-ready');
    expect(state.selected?.revision).toBe(2);
    expect('revisions' in (state.selected ?? {}) && (state.selected as { revisions: unknown[] }).revisions.length).toBe(2);
  });

  it('existing detail → void → voided detail', async () => {
    rpcMocks.rpc
      .mockResolvedValueOnce({ data: detail(1), error: null })
      .mockResolvedValueOnce({ data: receipt(1, { revision: 2, lifecycle: 'voided' }), error: null })
      .mockResolvedValueOnce({ data: detail(1, { revision: 2, lifecycle: 'voided' }), error: null });
    const c = controller();
    await c.openDetail(recordId(1));
    c.startVoid();
    c.setReason('Entered by mistake');
    await c.save();
    expect(rpcNames()).toEqual(['get_cue_check', 'void_cue_check', 'get_cue_check']);
    expect(c.getState().selected?.lifecycle).toBe('voided');
    c.startCorrection();
    expect(c.getState().phase).toBe('detail-ready');
  });

  it('list → next page without duplicates', async () => {
    const cursor = { createdAt: RECEIVED_AT, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
    rpcMocks.rpc
      .mockResolvedValueOnce({ data: { items: [receipt(1), receipt(2)], nextCursor: cursor }, error: null })
      .mockResolvedValueOnce({ data: { items: [receipt(2), receipt(3)], nextCursor: null }, error: null });
    const c = controller();
    await c.loadList();
    await c.loadMore();
    expect(rpcMocks.rpc.mock.calls).toEqual([
      ['list_cue_checks', { p_limit: 2, p_cursor: null }],
      ['list_cue_checks', { p_limit: 2, p_cursor: cursor }],
    ]);
    expect(c.getState().items.map(item => item.recordId)).toEqual([recordId(1), recordId(2), recordId(3)]);
    expect(c.getState().hasMore).toBe(false);
  });

  it('ignores an in-flight response after the owner switches', async () => {
    let release: (value: unknown) => void = () => undefined;
    rpcMocks.rpc.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const c = controller('owner-a');
    const pending = c.loadList();
    c.setOwner('owner-b');
    expect(c.getState()).toMatchObject({ ownerKey: 'owner-b', phase: 'idle', items: [] });
    release({ data: { items: [receipt(1)], nextCursor: null }, error: null });
    await pending;
    expect(c.getState()).toMatchObject({ ownerKey: 'owner-b', phase: 'idle', items: [] });
  });

  it('discards a late save receipt after the owner switches and keeps no draft', async () => {
    let release: (value: unknown) => void = () => undefined;
    rpcMocks.rpc.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const c = controller('owner-a');
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'private' });
    const pending = c.save();
    c.setOwner('owner-b');
    release({ data: receipt(1), error: null });
    await pending;
    expect(c.getState().selected).toBeNull();
    expect(JSON.stringify(c.getState())).not.toContain('private');
  });

  it('offline save → identical retry reuses the operation id and exact command', async () => {
    rpcMocks.rpc
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: receipt(1), error: null })
      .mockResolvedValueOnce({ data: detail(1), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'abandoned' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', dryness: 'unknown', notes: ' as typed ' });
    await c.save();
    expect(c.getState()).toMatchObject({ phase: 'offline-pending' });
    expect(c.getState().failure?.message).toBe(CUE_CHECK_ERROR_COPY.offline);
    expect(c.getState().draft).toMatchObject({ notes: ' as typed ' });
    await c.retry();
    const [first, second] = rpcMocks.rpc.mock.calls;
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(opCounter).toBe(2); // a candidate was offered on retry but the first id was kept
    expect(c.getState().phase).toBe('detail-ready');
  });

  it('a changed payload after failure is sent under a new operation id', async () => {
    rpcMocks.rpc
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: receipt(1), error: null })
      .mockResolvedValueOnce({ data: detail(1), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' });
    await c.save();
    c.editDraft({ overallResult: 'worse' });
    await c.save();
    expect(rpcMocks.rpc.mock.calls[0]?.[1].p_operation_id).toBe(opId(1));
    expect(rpcMocks.rpc.mock.calls[1]?.[1].p_operation_id).toBe(opId(2));
  });

  it('two quick save taps send one request', async () => {
    let release: (value: unknown) => void = () => undefined;
    rpcMocks.rpc.mockReturnValueOnce(new Promise(resolve => { release = resolve; })).mockResolvedValueOnce({ data: detail(1), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' });
    const first = c.save();
    const second = c.save();
    release({ data: receipt(1), error: null });
    await Promise.all([first, second]);
    expect(rpcNames().filter(name => name === 'record_cue_check')).toHaveLength(1);
  });

  it('a revision conflict reloads before any further mutation', async () => {
    rpcMocks.rpc
      .mockResolvedValueOnce({ data: detail(1), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'revision-conflict', code: '40001' } })
      .mockResolvedValueOnce({ data: detail(1, { revision: 2, observation: observation({ overallResult: 'worse' }) }), error: null });
    const c = controller();
    await c.openDetail(recordId(1));
    c.startCorrection();
    c.editDraft({ overallResult: 'same' });
    c.setReason('Fix');
    await c.save();
    expect(c.getState().failure?.message).toBe(CUE_CHECK_ERROR_COPY['revision-conflict']);
    await c.save();
    expect(rpcNames()).toEqual(['get_cue_check', 'correct_cue_check']);
    await c.reload();
    expect(rpcNames()).toEqual(['get_cue_check', 'correct_cue_check', 'get_cue_check']);
    expect(c.getState()).toMatchObject({ phase: 'editing-correction', reloadRequired: false });
    expect(c.getState().compose).toMatchObject({ expectedRevision: 2 });
  });

  it('shows plain copy for a malformed response and keeps the draft', async () => {
    rpcMocks.rpc.mockResolvedValueOnce({ data: receipt(1, { goal: 'nonsense' }), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' });
    await c.save();
    expect(c.getState().failure?.message).toContain('could not confirm this was saved');
    expect(c.getState().draft).toMatchObject({ overallResult: 'better' });
  });

  it('cancel makes no RPC call', async () => {
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', notes: 'x' });
    c.cancel();
    expect(c.getState().phase).toBe('idle');
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('notifies subscribers and stops after unsubscribing', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: { items: [], nextCursor: null }, error: null });
    const c = controller();
    const seen: string[] = [];
    const unsubscribe = c.subscribe(state => seen.push(state.phase));
    await c.loadList();
    unsubscribe();
    c.setOwner('owner-z');
    expect(seen).toEqual(['loading-list', 'list-ready']);
  });

  it('retries a failed list and a failed page from the right place', async () => {
    const cursor = { createdAt: RECEIVED_AT, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
    rpcMocks.rpc
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { items: [receipt(1)], nextCursor: cursor }, error: null })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ data: { items: [receipt(2)], nextCursor: null }, error: null });
    const c = controller();
    await c.loadList();
    expect(c.getState().phase).toBe('failed');
    await c.retry();
    expect(c.getState().phase).toBe('list-ready');
    await c.loadMore();
    expect(c.getState().phase).toBe('failed');
    expect(c.getState().items).toHaveLength(1);
    await c.retry();
    expect(c.getState().items.map(item => item.recordId)).toEqual([recordId(1), recordId(2)]);
  });

  it('retries a failed detail load', async () => {
    rpcMocks.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ data: detail(4), error: null });
    const c = controller();
    await c.openDetail(recordId(4));
    expect(c.getState().phase).toBe('failed');
    await c.retry();
    expect(c.getState().selected?.recordId).toBe(recordId(4));
  });
});

describe('boundaries this work must not cross', () => {
  it('uses only Cue Check RPCs and never recommendation or execution mutations', async () => {
    rpcMocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_cue_checks') return { data: { items: [receipt(1)], nextCursor: null }, error: null };
      if (name === 'record_cue_check') return { data: receipt(2), error: null };
      return { data: detail(1), error: null };
    });
    const c = controller();
    await c.loadList();
    await c.openDetail(recordId(1));
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x' });
    await c.save();
    expect(rpcNames().length).toBeGreaterThan(0);
    for (const name of rpcNames()) expect(CUE_RPCS).toContain(name);
    expect(rpcMocks.from).not.toHaveBeenCalled();
  });

  it('reads and lists never write', async () => {
    rpcMocks.rpc.mockImplementation(async (name: string) =>
      name === 'list_cue_checks' ? { data: { items: [receipt(1)], nextCursor: null }, error: null } : { data: detail(1), error: null },
    );
    const c = controller();
    await c.loadList();
    await c.openDetail(recordId(1));
    expect(rpcNames()).toEqual(['list_cue_checks', 'get_cue_check']);
  });

  it('production draft guidance stays content_pending after Cue Check activity', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt(1), error: null });
    const c = controller();
    c.startNew({ executionId: EXECUTION_ID, status: 'completed' });
    c.editDraft({ timing: 'immediate', observedAt: OBSERVED_AT, notes: 'x' });
    await c.save();
    const result = await generateTodayGuidance({
      ownerId: 'owner-1',
      goalId: 'basic_wash',
      requestId: 'request-1',
      asOf: '2026-10-22T09:00:00.000Z',
      loadedAt: '2026-10-22T09:00:05.000Z',
    });
    expect(result.status).toBe('content_pending');
  });
});

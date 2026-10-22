import { describe, expect, it } from 'vitest';

import type { CueCheckDetail, CueCheckReceipt } from '../../apps/mobile/src/cue-check-api';
import { CUE_CHECK_ERROR_COPY, type CueCheckFailure } from '../../apps/mobile/src/cue-check-errors';
import {
  buildCueCheckCommand,
  cueCheckReducer,
  initialCueCheckState,
  type CueCheckAction,
  type CueCheckState,
} from '../../apps/mobile/src/cue-check-state';

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const OP_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OP_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const OP_3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const OBSERVED_AT = '2026-10-22T09:30:00-05:00';
const RECEIVED_AT = '2026-10-22T14:31:00.000000+00:00';

function recordId(n: number): string {
  return `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`;
}

function receipt(n = 1, overrides: Record<string, unknown> = {}): CueCheckReceipt {
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
    observation: { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', notes: ' keep ' },
    confirmedSteps: [],
    executionStatus: 'completed',
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
    ...overrides,
  } as CueCheckReceipt;
}

function detail(n = 1, overrides: Record<string, unknown> = {}): CueCheckDetail {
  return { ...receipt(n, overrides), revisions: [] } as unknown as CueCheckDetail;
}

const offline: CueCheckFailure = {
  code: 'offline',
  message: CUE_CHECK_ERROR_COPY.offline,
  retryable: true,
  source: 'create',
};
const conflict: CueCheckFailure = {
  code: 'revision-conflict',
  message: CUE_CHECK_ERROR_COPY['revision-conflict'],
  retryable: false,
  source: 'correct',
};

function run(actions: readonly CueCheckAction[], from: CueCheckState = initialCueCheckState(OWNER_A)): CueCheckState {
  return actions.reduce(cueCheckReducer, from);
}

const listLoaded = (requestId: number, items: CueCheckReceipt[], nextCursor: CueCheckState['nextCursor'] = null): CueCheckAction => ({
  type: 'list_loaded',
  ownerKey: OWNER_A,
  requestId,
  page: { items, nextCursor },
});

function withDetail(n = 1, overrides: Record<string, unknown> = {}): CueCheckState {
  return run([
    { type: 'detail_requested', requestId: 1, recordId: recordId(n) },
    { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 1, detail: detail(n, overrides) },
  ]);
}

describe('initial and loading states', () => {
  it('starts idle and empty for one owner', () => {
    const state = initialCueCheckState(OWNER_A);
    expect(state).toMatchObject({
      phase: 'idle',
      ownerKey: OWNER_A,
      items: [],
      nextCursor: null,
      hasMore: false,
      selected: null,
      compose: null,
      pending: null,
      failure: null,
    });
  });

  it('loads a list and exposes its cursor', () => {
    const cursor = { receivedAt: RECEIVED_AT, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    expect(state.phase).toBe('loading-list');
    state = cueCheckReducer(state, listLoaded(1, [receipt(1), receipt(2)], cursor));
    expect(state).toMatchObject({ phase: 'list-ready', hasMore: true, nextCursor: cursor });
    expect(state.items.map(item => item.recordId)).toEqual([recordId(1), recordId(2)]);
  });

  it('shows a failed list with plain copy and keeps no half-loaded data', () => {
    const failure: CueCheckFailure = { code: 'offline', message: CUE_CHECK_ERROR_COPY.offline, retryable: true, source: 'list' };
    const state = run([
      { type: 'list_requested', requestId: 1 },
      { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure },
    ]);
    expect(state.phase).toBe('failed');
    expect(state.failure).toEqual(failure);
  });

  it('loads detail for one record', () => {
    const state = withDetail(3);
    expect(state).toMatchObject({ phase: 'detail-ready', selectedId: recordId(3) });
    expect(state.selected?.recordId).toBe(recordId(3));
  });

  it('ignores a detail response for a record other than the one requested', () => {
    const state = run([
      { type: 'detail_requested', requestId: 1, recordId: recordId(1) },
      { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 1, detail: detail(2) },
    ]);
    expect(state.phase).toBe('loading-detail');
    expect(state.selected).toBeNull();
  });

  it('rejects an invalid record id request without entering a loading state', () => {
    const state = run([{ type: 'detail_requested', requestId: 1, recordId: 'not-a-uuid' }]);
    expect(state.phase).toBe('idle');
  });
});

describe('new draft creation', () => {
  it.each(['completed', 'abandoned'] as const)('starts a draft from a %s execution', status => {
    const state = run([{ type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status } }]);
    expect(state.phase).toBe('editing-new');
    expect(state.compose).toEqual({ mode: 'new', executionId: EXECUTION_ID });
    expect(state.draft).toEqual({});
  });

  it.each(['in_progress', 'paused', 'unknown'])('refuses a draft from a %s execution', status => {
    const state = run([{ type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status } as never }]);
    expect(state.phase).toBe('idle');
    expect(state.compose).toBeNull();
  });

  it('refuses a draft without a usable execution id', () => {
    const state = run([{ type: 'new_draft_started', execution: { executionId: 'x', status: 'completed' } }]);
    expect(state.compose).toBeNull();
  });

  it('merges answer changes and removes an answer when cleared, never filling in blanks', () => {
    const state = run([
      { type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status: 'completed' } },
      { type: 'draft_changed', observation: { timing: 'immediate', overallResult: 'better', dryness: 'unknown' } },
      { type: 'draft_changed', observation: { overallResult: undefined, notes: ' raw note ' } },
    ]);
    expect(state.draft).toEqual({ timing: 'immediate', dryness: 'unknown', notes: ' raw note ' });
    expect('frizz' in state.draft).toBe(false);
  });

  it('ignores draft edits when nothing is being composed', () => {
    const state = run([{ type: 'draft_changed', observation: { notes: 'x' } }]);
    expect(state.draft).toEqual({});
  });
});

describe('saving a new Cue Check', () => {
  const start: CueCheckAction = { type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status: 'completed' } };
  const fill: CueCheckAction = {
    type: 'draft_changed',
    observation: { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' },
  };

  it('builds exactly the record command from the draft and the stable operation id', () => {
    const state = run([start, fill, { type: 'save_requested', requestId: 1, operationId: OP_1 }]);
    expect(state.phase).toBe('saving-new');
    expect(buildCueCheckCommand(state)).toEqual({
      kind: 'create',
      command: {
        operationId: OP_1,
        executionId: EXECUTION_ID,
        observation: { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' },
      },
    });
  });

  it('replaces the draft with the server receipt on success', () => {
    const state = run([
      start,
      fill,
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'save_succeeded', ownerKey: OWNER_A, requestId: 1, receipt: receipt(1) },
    ]);
    expect(state).toMatchObject({ phase: 'detail-ready', compose: null, pending: null, draft: {}, failure: null });
    expect(state.selected?.recordId).toBe(recordId(1));
    expect(state.items[0]?.recordId).toBe(recordId(1));
  });

  it('ignores a create receipt that belongs to a different execution than the draft', () => {
    const state = run([
      start,
      fill,
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      {
        type: 'save_succeeded',
        ownerKey: OWNER_A,
        requestId: 1,
        receipt: receipt(1, { executionId: '99999999-9999-4999-8999-999999999999' }),
      },
    ]);
    expect(state.phase).toBe('saving-new');
    expect(state.selected).toBeNull();
    expect(state.items).toEqual([]);
  });

  it('ignores a second save tap while one is in flight', () => {
    const state = run([
      start,
      fill,
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'save_requested', requestId: 2, operationId: OP_2 },
    ]);
    expect(state.activeRequest?.requestId).toBe(1);
    expect(state.pending?.operationId).toBe(OP_1);
  });

  it('keeps the draft and the operation id when a save fails offline, and reuses both on an identical retry', () => {
    let state = run([start, fill, { type: 'save_requested', requestId: 1, operationId: OP_1 }]);
    const sent = JSON.stringify(buildCueCheckCommand(state));
    state = cueCheckReducer(state, { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure: offline });
    expect(state.phase).toBe('offline-pending');
    expect(state.draft).toEqual({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better' });
    expect(state.pending?.operationId).toBe(OP_1);
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_2 });
    expect(state.phase).toBe('saving-new');
    expect(state.pending?.operationId).toBe(OP_1);
    expect(JSON.stringify(buildCueCheckCommand(state))).toBe(sent);
  });

  it('issues a new operation id when the payload changed after a failure', () => {
    let state = run([start, fill, { type: 'save_requested', requestId: 1, operationId: OP_1 }]);
    state = cueCheckReducer(state, { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure: offline });
    state = cueCheckReducer(state, { type: 'draft_changed', observation: { dryness: 'less' } });
    expect(state.phase).toBe('editing-new');
    expect(state.draft).toMatchObject({ overallResult: 'better', dryness: 'less' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_2 });
    expect(state.pending?.operationId).toBe(OP_2);
  });

  it('treats key order as irrelevant when comparing retry payloads', () => {
    let state = run([
      start,
      { type: 'draft_changed', observation: { observedAt: OBSERVED_AT, timing: 'immediate', overallResult: 'better' } },
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure: offline },
    ]);
    state = cueCheckReducer(state, { type: 'draft_changed', observation: { overallResult: undefined } });
    state = cueCheckReducer(state, { type: 'draft_changed', observation: { overallResult: 'better' } });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_2 });
    expect(state.pending?.operationId).toBe(OP_1);
  });

  it('keeps the draft when the server rejects the save', () => {
    const failure: CueCheckFailure = {
      code: 'duplicate-active',
      message: CUE_CHECK_ERROR_COPY['duplicate-active'],
      retryable: false,
      source: 'create',
    };
    const state = run([
      start,
      fill,
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure },
    ]);
    expect(state.phase).toBe('failed');
    expect(state.failure?.message).toBe(CUE_CHECK_ERROR_COPY['duplicate-active']);
    expect(state.draft).toMatchObject({ overallResult: 'better' });
  });

  it('cancel clears the draft and requests nothing', () => {
    const state = run([start, fill, { type: 'cancelled' }]);
    expect(state).toMatchObject({ phase: 'idle', compose: null, draft: {}, pending: null, activeRequest: null });
    expect(buildCueCheckCommand(state)).toBeNull();
  });

  it('cannot cancel an in-flight save', () => {
    const state = run([start, fill, { type: 'save_requested', requestId: 1, operationId: OP_1 }, { type: 'cancelled' }]);
    expect(state.phase).toBe('saving-new');
  });

  it('does not save without a draft', () => {
    const state = run([{ type: 'save_requested', requestId: 1, operationId: OP_1 }]);
    expect(state.phase).toBe('idle');
    expect(buildCueCheckCommand(state)).toBeNull();
  });
});

describe('correction and void flows', () => {
  it('starts a correction from the latest detail with its exact revision and answers', () => {
    const state = cueCheckReducer(withDetail(1, { revision: 4 }), { type: 'correction_started' });
    expect(state.phase).toBe('editing-correction');
    expect(state.compose).toEqual({ mode: 'correction', recordId: recordId(1), expectedRevision: 4 });
    expect(state.draft).toEqual({ timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', notes: ' keep ' });
  });

  it('builds the correct command with the reason draft', () => {
    let state = cueCheckReducer(withDetail(1, { revision: 2 }), { type: 'correction_started' });
    state = cueCheckReducer(state, { type: 'draft_changed', observation: { overallResult: 'same' } });
    state = cueCheckReducer(state, { type: 'reason_changed', reason: 'Wrong tap' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    expect(state.phase).toBe('saving-correction');
    expect(buildCueCheckCommand(state)).toEqual({
      kind: 'correct',
      command: {
        operationId: OP_1,
        recordId: recordId(1),
        expectedRevision: 2,
        observation: { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'same', notes: ' keep ' },
        reason: 'Wrong tap',
      },
    });
  });

  it('returns to the refreshed detail after a correction succeeds', () => {
    let state = cueCheckReducer(withDetail(1), { type: 'correction_started' });
    state = run(
      [
        { type: 'save_requested', requestId: 2, operationId: OP_1 },
        { type: 'save_succeeded', ownerKey: OWNER_A, requestId: 2, receipt: receipt(1, { revision: 2 }) },
      ],
      state,
    );
    expect(state).toMatchObject({ phase: 'detail-ready', compose: null, pending: null, reason: '' });
    expect(state.selected?.revision).toBe(2);
  });

  it('never re-enters correction mode for a voided record', () => {
    const state = cueCheckReducer(withDetail(1, { lifecycle: 'voided', revision: 2 }), { type: 'correction_started' });
    expect(state.phase).toBe('detail-ready');
    expect(state.compose).toBeNull();
    const voidState = cueCheckReducer(withDetail(1, { lifecycle: 'voided', revision: 2 }), { type: 'void_started' });
    expect(voidState.phase).toBe('detail-ready');
  });

  it('asks for confirmation before voiding and cancelling makes no request', () => {
    let state = cueCheckReducer(withDetail(1, { revision: 3 }), { type: 'void_started' });
    expect(state.phase).toBe('void-confirmation');
    expect(state.compose).toEqual({ mode: 'void', recordId: recordId(1), expectedRevision: 3 });
    state = cueCheckReducer(state, { type: 'cancelled' });
    expect(state.phase).toBe('detail-ready');
    expect(state.activeRequest).toBeNull();
    expect(buildCueCheckCommand(state)).toBeNull();
  });

  it('voids with the exact revision and shows the voided record', () => {
    let state = cueCheckReducer(withDetail(1, { revision: 3 }), { type: 'void_started' });
    state = cueCheckReducer(state, { type: 'reason_changed', reason: 'Entered by mistake' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    expect(state.phase).toBe('voiding');
    expect(buildCueCheckCommand(state)).toEqual({
      kind: 'void',
      command: { operationId: OP_1, recordId: recordId(1), expectedRevision: 3, reason: 'Entered by mistake' },
    });
    state = cueCheckReducer(state, {
      type: 'save_succeeded',
      ownerKey: OWNER_A,
      requestId: 2,
      receipt: receipt(1, { revision: 4, lifecycle: 'voided' }),
    });
    expect(state.phase).toBe('detail-ready');
    expect(state.selected?.lifecycle).toBe('voided');
  });

  it('retries a failed void with the same operation id and exact command bytes', () => {
    let state = cueCheckReducer(withDetail(1), { type: 'void_started' });
    state = cueCheckReducer(state, { type: 'reason_changed', reason: 'Mistake' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    const sent = JSON.stringify(buildCueCheckCommand(state));
    state = cueCheckReducer(state, {
      type: 'request_failed',
      ownerKey: OWNER_A,
      requestId: 2,
      failure: { ...offline, source: 'void' },
    });
    expect(state.phase).toBe('offline-pending');
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 3, operationId: OP_2 });
    expect(state.phase).toBe('voiding');
    expect(JSON.stringify(buildCueCheckCommand(state))).toBe(sent);
  });

  it('requires a reload after a revision conflict before another mutation', () => {
    let state = cueCheckReducer(withDetail(1), { type: 'correction_started' });
    state = cueCheckReducer(state, { type: 'reason_changed', reason: 'Fix' });
    state = cueCheckReducer(state, { type: 'draft_changed', observation: { overallResult: 'same' } });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    state = cueCheckReducer(state, { type: 'request_failed', ownerKey: OWNER_A, requestId: 2, failure: conflict });
    expect(state).toMatchObject({ phase: 'failed', reloadRequired: true });

    const blocked = cueCheckReducer(state, { type: 'save_requested', requestId: 3, operationId: OP_2 });
    expect(blocked.phase).toBe('failed');
    expect(blocked.activeRequest).toBeNull();
    expect(cueCheckReducer(blocked, { type: 'void_started' }).phase).toBe('failed');

    state = cueCheckReducer(state, { type: 'detail_requested', requestId: 4, recordId: recordId(1) });
    state = cueCheckReducer(state, { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 4, detail: detail(1, { revision: 5 }) });
    expect(state.reloadRequired).toBe(false);
    expect(state.phase).toBe('editing-correction');
    expect(state.compose).toEqual({ mode: 'correction', recordId: recordId(1), expectedRevision: 5 });
    expect(state.pending).toBeNull();
    expect(state.draft).toMatchObject({ overallResult: 'same' });
    expect(state.reason).toBe('Fix');
  });

  it('drops the edit session when the reloaded record turns out to be voided', () => {
    let state = cueCheckReducer(withDetail(1), { type: 'correction_started' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    const gone: CueCheckFailure = {
      code: 'record-voided',
      message: CUE_CHECK_ERROR_COPY['record-voided'],
      retryable: false,
      source: 'correct',
    };
    state = cueCheckReducer(state, { type: 'request_failed', ownerKey: OWNER_A, requestId: 2, failure: gone });
    expect(state.reloadRequired).toBe(true);
    state = run(
      [
        { type: 'detail_requested', requestId: 3, recordId: recordId(1) },
        { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 3, detail: detail(1, { lifecycle: 'voided', revision: 3 }) },
      ],
      state,
    );
    expect(state).toMatchObject({ phase: 'detail-ready', compose: null, reloadRequired: false });
    expect(cueCheckReducer(state, { type: 'correction_started' }).compose).toBeNull();
  });

  it('keeps the detail visible during a background refresh without changing phase', () => {
    let state = cueCheckReducer(withDetail(1), { type: 'correction_started' });
    state = cueCheckReducer(state, { type: 'save_requested', requestId: 2, operationId: OP_1 });
    state = cueCheckReducer(state, {
      type: 'save_succeeded',
      ownerKey: OWNER_A,
      requestId: 2,
      receipt: receipt(1, { revision: 2 }),
    });
    state = cueCheckReducer(state, { type: 'detail_requested', requestId: 3, recordId: recordId(1), background: true });
    expect(state.phase).toBe('detail-ready');
    expect(state.selected?.revision).toBe(2);
    state = cueCheckReducer(state, { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 3, detail: detail(1, { revision: 2 }) });
    expect(state.phase).toBe('detail-ready');
    expect('revisions' in (state.selected as object)).toBe(true);
  });

  it('drops a failed background refresh quietly', () => {
    let state = withDetail(1);
    state = cueCheckReducer(state, { type: 'detail_requested', requestId: 2, recordId: recordId(1), background: true });
    state = cueCheckReducer(state, {
      type: 'request_failed',
      ownerKey: OWNER_A,
      requestId: 2,
      failure: { ...offline, source: 'detail' },
    });
    expect(state.phase).toBe('detail-ready');
    expect(state.failure).toBeNull();
    expect(state.activeRequest).toBeNull();
  });
});

describe('stale and cross-owner protection', () => {
  it('ignores a response from an older request', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }, { type: 'list_requested', requestId: 2 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(9)]));
    expect(state.phase).toBe('loading-list');
    expect(state.items).toEqual([]);
    state = cueCheckReducer(state, listLoaded(2, [receipt(1)]));
    expect(state.items.map(item => item.recordId)).toEqual([recordId(1)]);
    // A late duplicate of the older request must not overwrite the newer one.
    state = cueCheckReducer(state, listLoaded(1, [receipt(9)]));
    expect(state.items.map(item => item.recordId)).toEqual([recordId(1)]);
  });

  it('ignores a late failure from an older request', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }, { type: 'list_requested', requestId: 2 }]);
    state = cueCheckReducer(state, {
      type: 'request_failed',
      ownerKey: OWNER_A,
      requestId: 1,
      failure: { ...offline, source: 'list' },
    });
    expect(state.phase).toBe('loading-list');
    expect(state.failure).toBeNull();
  });

  it('ignores a detail response that arrives after the owner opened another record', () => {
    let state = run([
      { type: 'detail_requested', requestId: 1, recordId: recordId(1) },
      { type: 'detail_requested', requestId: 2, recordId: recordId(2) },
    ]);
    state = cueCheckReducer(state, { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 1, detail: detail(1) });
    expect(state.selected).toBeNull();
    state = cueCheckReducer(state, { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 2, detail: detail(2) });
    expect(state.selected?.recordId).toBe(recordId(2));
  });

  it('clears everything synchronously when the owner changes', () => {
    let state = run([
      { type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status: 'completed' } },
      { type: 'draft_changed', observation: { timing: 'immediate', notes: 'private' } },
      { type: 'reason_changed', reason: 'private reason' },
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'request_failed', ownerKey: OWNER_A, requestId: 1, failure: offline },
    ]);
    state = cueCheckReducer(state, { type: 'owner_changed', ownerKey: OWNER_B });
    expect(state).toEqual({ ...initialCueCheckState(OWNER_B), ownerEpoch: 1 });
    expect(JSON.stringify(state)).not.toContain('private');
  });

  it('clears loaded lists, details and pagination on owner change', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(1)], { receivedAt: RECEIVED_AT, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
    state = cueCheckReducer(state, { type: 'owner_changed', ownerKey: OWNER_B });
    expect(state).toMatchObject({ items: [], nextCursor: null, hasMore: false, selected: null, selectedId: null, phase: 'idle' });
  });

  it('ignores an unchanged owner', () => {
    const before = withDetail(1);
    expect(cueCheckReducer(before, { type: 'owner_changed', ownerKey: OWNER_A })).toBe(before);
  });

  it('ignores a response that belongs to the previous owner', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, { type: 'owner_changed', ownerKey: OWNER_B });
    state = cueCheckReducer(state, { type: 'list_requested', requestId: 2 });
    state = cueCheckReducer(state, listLoaded(1, [receipt(1)]));
    expect(state.items).toEqual([]);
    expect(state.phase).toBe('loading-list');
    state = cueCheckReducer(state, { type: 'list_loaded', ownerKey: OWNER_A, requestId: 2, page: { items: [receipt(5)], nextCursor: null } });
    expect(state.items).toEqual([]);
  });

  it('ignores a save receipt that belongs to the previous owner', () => {
    let state = run([
      { type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status: 'completed' } },
      { type: 'draft_changed', observation: { timing: 'immediate', notes: 'x' } },
      { type: 'save_requested', requestId: 1, operationId: OP_1 },
      { type: 'owner_changed', ownerKey: OWNER_B },
    ]);
    state = cueCheckReducer(state, { type: 'save_succeeded', ownerKey: OWNER_A, requestId: 1, receipt: receipt(1) });
    expect(state.selected).toBeNull();
    expect(state.items).toEqual([]);
  });
});

describe('reads in flight when a draft starts', () => {
  it('drops the outstanding read so its response cannot overwrite the draft', () => {
    let state = run([
      { type: 'list_requested', requestId: 1 },
      { type: 'new_draft_started', execution: { executionId: EXECUTION_ID, status: 'completed' } },
      { type: 'draft_changed', observation: { notes: 'mine' } },
    ]);
    expect(state.activeRequest).toBeNull();
    state = cueCheckReducer(state, listLoaded(1, [receipt(1)]));
    expect(state).toMatchObject({ phase: 'editing-new', items: [], draft: { notes: 'mine' } });
  });
});

describe('pagination', () => {
  const cursor = { receivedAt: RECEIVED_AT, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

  it('appends the next page without duplicating records', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(1), receipt(2)], cursor));
    state = cueCheckReducer(state, { type: 'page_requested', requestId: 2 });
    expect(state.phase).toBe('loading-list');
    expect(state.items).toHaveLength(2);
    state = cueCheckReducer(state, {
      type: 'page_loaded',
      ownerKey: OWNER_A,
      requestId: 2,
      page: { items: [receipt(2), receipt(3)], nextCursor: null },
    });
    expect(state.items.map(item => item.recordId)).toEqual([recordId(1), recordId(2), recordId(3)]);
    expect(state).toMatchObject({ phase: 'list-ready', hasMore: false, nextCursor: null });
  });

  it('refuses to page without a cursor', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(1)]));
    expect(cueCheckReducer(state, { type: 'page_requested', requestId: 2 }).activeRequest).toBeNull();
  });

  it('keeps loaded items when a page fails and can page again', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(1)], cursor));
    state = cueCheckReducer(state, { type: 'page_requested', requestId: 2 });
    state = cueCheckReducer(state, {
      type: 'request_failed',
      ownerKey: OWNER_A,
      requestId: 2,
      failure: { ...offline, source: 'page' },
    });
    expect(state).toMatchObject({ phase: 'failed', nextCursor: cursor });
    expect(state.items).toHaveLength(1);
  });

  it('merges a new receipt into a loaded list in place of its older copy', () => {
    let state = run([{ type: 'list_requested', requestId: 1 }]);
    state = cueCheckReducer(state, listLoaded(1, [receipt(1), receipt(2)]));
    state = run(
      [
        { type: 'detail_requested', requestId: 2, recordId: recordId(2) },
        { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 2, detail: detail(2) },
        { type: 'correction_started' },
        { type: 'save_requested', requestId: 3, operationId: OP_3 },
        { type: 'save_succeeded', ownerKey: OWNER_A, requestId: 3, receipt: receipt(2, { revision: 2 }) },
      ],
      state,
    );
    expect(state.items.map(item => [item.recordId, item.revision])).toEqual([
      [recordId(1), 1],
      [recordId(2), 2],
    ]);
  });
});

describe('reads never mutate', () => {
  it('only listing and detail actions touch no pending command or compose state', () => {
    const state = run([
      { type: 'list_requested', requestId: 1 },
      listLoaded(1, [receipt(1)]),
      { type: 'detail_requested', requestId: 2, recordId: recordId(1) },
      { type: 'detail_loaded', ownerKey: OWNER_A, requestId: 2, detail: detail(1) },
    ]);
    expect(state.pending).toBeNull();
    expect(state.compose).toBeNull();
    expect(buildCueCheckCommand(state)).toBeNull();
  });

  it('never mutates a previous state object', () => {
    const before = Object.freeze(initialCueCheckState(OWNER_A));
    const after = cueCheckReducer(before, { type: 'list_requested', requestId: 1 });
    expect(before.phase).toBe('idle');
    expect(after).not.toBe(before);
  });
});

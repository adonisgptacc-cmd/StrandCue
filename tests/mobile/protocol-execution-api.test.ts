import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveProtocolExecution,
  listProtocolExecutions,
  startProtocolExecution,
  transitionProtocolExecution,
} from '../../apps/mobile/src/guidance/protocol-execution-api';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn() }));
const clientMocks = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock('../../apps/mobile/src/client', () => ({
  get supabase() {
    return clientMocks.supabase;
  },
}));

const OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const SHELF_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const STARTED_AT = '2026-10-13T09:00:00.000Z';
const AT = '2026-10-13T09:05:00.000Z';

function plannedStep(stepId: string, position: number) {
  return {
    stepId,
    position,
    action: `Test action ${position}`,
    productId: null,
    productVersionId: null,
    toolId: null,
    toolVersionId: null,
    waitSeconds: null,
    rinse: null,
    reasons: ['test reason'],
  };
}

function pendingStep(stepId: string, position: number) {
  return {
    stepId,
    position,
    planned: plannedStep(stepId, position),
    state: 'pending',
    confirmedAt: null,
    deviation: null,
  };
}

function decisionFixture() {
  return {
    status: 'ready',
    requestId: RUN_ID,
    steps: [plannedStep('step-1', 1), plannedStep('step-2', 2)],
  };
}

function executionFixture(overrides: Record<string, unknown> = {}) {
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    startedAt: STARTED_AT,
    updatedAt: STARTED_AT,
    status: 'in_progress',
    steps: [pendingStep('step-1', 1), pendingStep('step-2', 2)],
    finishedAt: null,
    closeReason: null,
    ...overrides,
  };
}

function receiptFixture(overrides: Record<string, unknown> = {}) {
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    status: 'in_progress',
    revision: 0,
    updatedAt: STARTED_AT,
    createdAt: STARTED_AT,
    execution: executionFixture(),
    ...overrides,
  };
}

function validStart(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID,
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    startedAt: STARTED_AT,
    ...overrides,
  };
}

function validTransition(overrides: Record<string, unknown> = {}) {
  // SC-003: the wire command carries only bounded command fields. There is
  // no `result` snapshot: the server constructs the authoritative execution.
  return {
    operationId: OPERATION_ID,
    executionId: EXECUTION_ID,
    expectedRevision: 0,
    command: { kind: 'pause' },
    at: AT,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientMocks.supabase = { rpc: rpcMocks.rpc };
});

describe('protocol execution persistence boundary', () => {
  it('sends exactly the start parameters the database expects', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture(), error: null });
    const result = await startProtocolExecution(validStart());
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('start_protocol_execution', {
      p_operation_id: OPERATION_ID,
      p_execution_id: EXECUTION_ID,
      p_recommendation_run_id: RUN_ID,
      p_started_at: STARTED_AT,
    });
    expect(result.executionId).toBe(EXECUTION_ID);
    expect(result.revision).toBe(0);
  });

  it('rejects a caller-supplied decision before calling the database', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      startProtocolExecution(validStart({ decision: decisionFixture() })),
    ).rejects.toThrow();
    await expect(
      startProtocolExecution(validStart({ p_decision: decisionFixture() })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('sends exactly the transition parameters the database expects', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture({ revision: 1 }), error: null });
    const result = await transitionProtocolExecution(validTransition());
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('apply_protocol_execution_command', {
      p_operation_id: OPERATION_ID,
      p_execution_id: EXECUTION_ID,
      p_expected_revision: 0,
      p_command: { kind: 'pause' },
      p_at: AT,
    });
    const parameters = rpcMocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('p_result');
    expect(result.revision).toBe(1);
  });

  it('rejects a caller-supplied result snapshot before calling the database', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      transitionProtocolExecution(
        validTransition({ result: executionFixture({ status: 'paused', updatedAt: AT }) }),
      ),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(validTransition({ p_result: { status: 'paused' } })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses an owner id from the caller rather than forwarding it', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      startProtocolExecution(validStart({ ownerId: 'somebody' })),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(validTransition({ userId: 'somebody' })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();

    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture(), error: null });
    await startProtocolExecution(validStart());
    const parameters = rpcMocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(parameters).some(key => /owner|user_id/i.test(key))).toBe(false);
  });

  it('validates every plan command shape before calling the database', async () => {
    rpcMocks.rpc.mockClear();
    const commands: unknown[] = [
      { kind: 'complete-step', stepId: 'step-1' },
      { kind: 'skip-step', stepId: 'step-1', reason: 'owner skipped' },
      {
        kind: 'substitute-step',
        stepId: 'step-1',
        reason: 'owner swapped',
        replacement: { shelfItemId: SHELF_ITEM_ID },
      },
      { kind: 'modify-step', stepId: 'step-1', reason: 'owner changed', detail: 'less water' },
      { kind: 'pause' },
      { kind: 'resume' },
      { kind: 'abandon', reason: 'owner stopped' },
      { kind: 'complete' },
    ];
    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture({ revision: 1 }), error: null });
    for (const command of commands) {
      await transitionProtocolExecution(validTransition({ command }));
    }
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(commands.length);

    rpcMocks.rpc.mockClear();
    await expect(
      transitionProtocolExecution(validTransition({ command: { kind: 'celebrate' } })),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(validTransition({ command: { kind: 'pause', extra: true } })),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(
        validTransition({ command: { kind: 'skip-step', stepId: 'step-1' } }),
      ),
    ).rejects.toThrow();
    // A result smuggled inside the command is an unknown key, not a snapshot.
    await expect(
      transitionProtocolExecution(
        validTransition({ command: { kind: 'pause', result: executionFixture() } }),
      ),
    ).rejects.toThrow();
    // SC-004: the client submits an owned shelf-item id, never free-form
    // product ids plus self-asserted `owned: true`. The old shape is
    // rejected client-side before any database call.
    await expect(
      transitionProtocolExecution(
        validTransition({
          command: {
            kind: 'substitute-step',
            stepId: 'step-1',
            reason: 'owner swapped',
            replacement: { productId: 'p', productVersionId: 'v', owned: true },
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(
        validTransition({
          command: {
            kind: 'substitute-step',
            stepId: 'step-1',
            reason: 'owner swapped',
            replacement: { shelfItemId: SHELF_ITEM_ID, owned: true },
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      transitionProtocolExecution(
        validTransition({
          command: {
            kind: 'substitute-step',
            stepId: 'step-1',
            reason: 'owner swapped',
            replacement: { shelfItemId: 'not-a-uuid' },
          },
        }),
      ),
    ).rejects.toThrow();
    // Deviation text past the 2 KiB server cap fails fast client-side.
    await expect(
      transitionProtocolExecution(
        validTransition({
          command: { kind: 'skip-step', stepId: 'step-1', reason: 'r'.repeat(2049) },
        }),
      ),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed operation ids, revisions, and timestamps before calling', async () => {
    rpcMocks.rpc.mockClear();
    await expect(startProtocolExecution(validStart({ operationId: 'not-a-uuid' }))).rejects.toThrow();
    await expect(
      transitionProtocolExecution(validTransition({ expectedRevision: -1 })),
    ).rejects.toThrow();
    await expect(transitionProtocolExecution(validTransition({ at: 'yesterday' }))).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('never builds facts, snapshots, or recommendation input from deviation free text', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture({ revision: 1 }), error: null });
    await transitionProtocolExecution(
      validTransition({
        command: { kind: 'modify-step', stepId: 'step-1', reason: 'free text', detail: 'free detail' },
      }),
    );
    const parameters = rpcMocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    const serialized = JSON.stringify(parameters);
    expect(serialized).not.toMatch(/"facts"|"snapshot"|"profileFacts"|"historyFacts"|"environmentFacts"/i);
    expect(parameters).not.toHaveProperty('p_facts');
    expect(parameters).not.toHaveProperty('p_input');
  });

  it('reads the active execution without caller-supplied ownership', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receiptFixture(), error: null });
    const result = await getActiveProtocolExecution();
    expect(rpcMocks.rpc).toHaveBeenCalledWith('get_active_protocol_execution', {});
    expect(result?.executionId).toBe(EXECUTION_ID);
  });

  it('returns null when no execution is active', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(getActiveProtocolExecution()).resolves.toBeNull();
  });

  it('lists history with a bounded limit and optional cursor', async () => {
    const page = { items: [receiptFixture()], nextCursor: null };
    rpcMocks.rpc.mockResolvedValue({ data: page, error: null });
    const result = await listProtocolExecutions({ limit: 25, cursor: null });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_protocol_executions', {
      p_limit: 25,
      p_cursor: null,
    });
    expect(result.items).toHaveLength(1);
    await expect(listProtocolExecutions({ limit: 500, cursor: null })).rejects.toThrow();
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed receipt from the database', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: { executionId: EXECUTION_ID }, error: null });
    await expect(startProtocolExecution(validStart())).rejects.toThrow();
  });

  it('maps stable conflict errors without pretending the write succeeded', async () => {
    for (const message of [
      'operation-conflict',
      'revision-conflict',
      'run-not-owned',
      'execution-terminal',
      'execution-not-active',
      'invalid-status-transition',
      'pending-steps-remain',
      'unknown-step',
      'step-already-resolved',
      'unknown-command',
      'invalid-command',
      'timestamp-out-of-range',
      'too-many-active-executions',
      'too-many-events',
      'too-many-steps',
      'text-too-large',
      'unowned-substitution',
      'unknown-shelf-item',
      'archived-shelf-item',
      'unknown-product-version',
      'not-ready-decision',
      'untrusted-decision',
      'malformed-protocol',
      'account-not-active',
      'authentication-required',
    ]) {
      rpcMocks.rpc.mockResolvedValue({ data: null, error: { message, code: 'P0001' } });
      await expect(startProtocolExecution(validStart())).rejects.toThrow(new RegExp(message, 'i'));
    }
  });

  it('surfaces a generic database failure without pretending it saved', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection reset', code: '08006' },
    });
    await expect(startProtocolExecution(validStart())).rejects.toThrow(/connection reset/i);
  });

  it('maps stable errors on transitions, reads, and history without raw text', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'revision-conflict', code: 'P0001' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^revision-conflict$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'invalid-command', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^invalid-command$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'text-too-large', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^text-too-large$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'timestamp-out-of-range', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^timestamp-out-of-range$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'too-many-events', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^too-many-events$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'unowned-substitution', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^unowned-substitution$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'unknown-shelf-item', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^unknown-shelf-item$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'archived-shelf-item', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^archived-shelf-item$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'unknown-product-version', code: '22023' } });
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/^unknown-product-version$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'account-not-active', code: '42501' } });
    await expect(getActiveProtocolExecution()).rejects.toThrow(/^account-not-active$/);
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'invalid-limit', code: '22023' } });
    await expect(listProtocolExecutions({ limit: 25, cursor: null })).rejects.toThrow(/^invalid-limit$/);
  });

  it('throws unavailable on every entry point until the client is configured', async () => {
    clientMocks.supabase = null;
    await expect(startProtocolExecution(validStart())).rejects.toThrow(/unavailable until the client is configured/i);
    await expect(transitionProtocolExecution(validTransition())).rejects.toThrow(/unavailable until the client is configured/i);
    await expect(getActiveProtocolExecution()).rejects.toThrow(/unavailable until the client is configured/i);
    await expect(listProtocolExecutions({ limit: 25, cursor: null })).rejects.toThrow(/unavailable until the client is configured/i);
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';

import type { ProtocolExecution } from '../../packages/domain/src/index.ts';
import {
  buildExecutionCompletion,
  executionUiReducer,
  initialExecutionUi,
  type ExecutionUiAction,
} from '../../apps/mobile/src/guidance/protocol-execution-state.ts';

const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';

function startedExecution(): ProtocolExecution {
  return {
    executionId: 'exec-1',
    recommendationRunId: 'run-2026-10-13-001',
    startedAt: T0,
    updatedAt: T0,
    status: 'in_progress',
    steps: [
      {
        stepId: 'step-1',
        position: 1,
        planned: {
          stepId: 'step-1',
          position: 1,
          action: 'apply',
          productId: 'prod-cleanse',
          productVersionId: 'v3',
          toolId: null,
          toolVersionId: null,
          waitSeconds: null,
          rinse: null,
          reasons: ['rule a@1 requires cleansing'],
        },
        state: 'pending',
        confirmedAt: null,
        deviation: null,
      },
      {
        stepId: 'step-2',
        position: 2,
        planned: {
          stepId: 'step-2',
          position: 2,
          action: 'rinse',
          productId: null,
          productVersionId: null,
          toolId: null,
          toolVersionId: null,
          waitSeconds: null,
          rinse: true,
          reasons: ['rule a@1 requires rinsing'],
        },
        state: 'pending',
        confirmedAt: null,
        deviation: null,
      },
    ],
    finishedAt: null,
    closeReason: null,
  } as unknown as ProtocolExecution;
}

function confirmedExecution(): ProtocolExecution {
  const base = startedExecution();
  return {
    ...base,
    updatedAt: T1,
    steps: base.steps.map(step =>
      step.stepId === 'step-1'
        ? { ...step, state: 'confirmed', confirmedAt: T1, deviation: null }
        : step,
    ),
  } as unknown as ProtocolExecution;
}

describe('protocol execution UI state', () => {
  function started() {
    let state = initialExecutionUi('owner-1');
    state = executionUiReducer(state, {
      type: 'start_requested',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      executionId: 'exec-1',
      recommendationRunId: 'run-2026-10-13-001',
      startedAt: T0,
    });
    return executionUiReducer(state, {
      type: 'start_succeeded',
      execution: startedExecution(),
      revision: 0,
    });
  }

  it('starts idle with no execution and no pending work', () => {
    const state = initialExecutionUi('owner-1');
    expect(state.phase).toBe('idle');
    expect(state.execution).toBeNull();
    expect(state.pending).toBeNull();
    expect(state.error).toBeNull();
  });

  it('tracks an explicit start request without recording history', () => {
    const idle = initialExecutionUi('owner-1');
    const action: ExecutionUiAction = {
      type: 'start_requested',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      executionId: 'exec-1',
      recommendationRunId: 'run-2026-10-13-001',
      startedAt: T0,
    };
    const state = executionUiReducer(idle, action);
    expect(state.phase).toBe('starting');
    expect(state.execution).toBeNull();
    expect(state.pending).toBeNull();
  });

  it('holds the server execution only after a confirmed start', () => {
    let state = initialExecutionUi('owner-1');
    state = executionUiReducer(state, {
      type: 'start_requested',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      executionId: 'exec-1',
      recommendationRunId: 'run-2026-10-13-001',
      startedAt: T0,
    });
    state = executionUiReducer(state, {
      type: 'start_succeeded',
      execution: startedExecution(),
      revision: 0,
    });
    expect(state.phase).toBe('ready');
    expect(state.execution?.executionId).toBe('exec-1');
    expect(state.revision).toBe(0);
    expect(state.error).toBeNull();
  });

  it('keeps the confirmed result across a transition request and applies the receipt on success', () => {
    let state = started();
    const next = confirmedExecution();
    state = executionUiReducer(state, {
      type: 'transition_requested',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      command: { kind: 'complete-step', stepId: 'step-1' },
      at: T1,
      result: next,
      expectedRevision: 0,
    });
    expect(state.phase).toBe('saving');
    expect(state.execution?.steps.find(step => step.stepId === 'step-1')?.state).toBe('confirmed');
    expect(state.pending?.operationId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    state = executionUiReducer(state, {
      type: 'transition_succeeded',
      execution: next,
      revision: 1,
    });
    expect(state.phase).toBe('ready');
    expect(state.revision).toBe(1);
    expect(state.pending).toBeNull();
  });

  it('records a save failure without losing the pending operation for retry', () => {
    let state = started();
    state = executionUiReducer(state, {
      type: 'transition_requested',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      command: { kind: 'pause' },
      at: T1,
      result: { ...startedExecution(), status: 'paused', updatedAt: T1 },
      expectedRevision: 0,
    });
    state = executionUiReducer(state, { type: 'transition_failed', error: 'connection reset' });
    expect(state.phase).toBe('save_failed');
    expect(state.error).toBe('connection reset');
    expect(state.pending?.operationId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('retries with the same operation id so the server stays idempotent', () => {
    let state = started();
    state = executionUiReducer(state, {
      type: 'transition_requested',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      command: { kind: 'pause' },
      at: T1,
      result: { ...startedExecution(), status: 'paused', updatedAt: T1 },
      expectedRevision: 0,
    });
    state = executionUiReducer(state, { type: 'transition_failed', error: 'connection reset' });
    state = executionUiReducer(state, { type: 'retry_requested' });
    expect(state.phase).toBe('saving');
    expect(state.pending?.operationId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('keeps the start request after a start failure so a retry reuses its ids', () => {
    let state = initialExecutionUi('owner-1');
    state = executionUiReducer(state, {
      type: 'start_requested',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      executionId: 'exec-1',
      recommendationRunId: 'run-2026-10-13-001',
      startedAt: T0,
    });
    state = executionUiReducer(state, { type: 'start_failed', error: 'connection reset' });
    expect(state.phase).toBe('save_failed');
    expect(state.error).toBe('connection reset');
    expect(state.startRequest?.operationId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(state.startRequest?.recommendationRunId).toBe('run-2026-10-13-001');
    expect(state.startRequest).not.toHaveProperty('decision');
    state = executionUiReducer(state, { type: 'retry_requested' });
    expect(state.phase).toBe('starting');
    expect(state.startRequest?.operationId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('applies a receipt that lands while a retry is saving', () => {
    let state = started();
    state = executionUiReducer(state, {
      type: 'transition_requested',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      command: { kind: 'pause' },
      at: T1,
      result: { ...startedExecution(), status: 'paused', updatedAt: T1 },
      expectedRevision: 0,
    });
    state = executionUiReducer(state, { type: 'transition_failed', error: 'connection reset' });
    state = executionUiReducer(state, { type: 'retry_requested' });
    const paused: ProtocolExecution = { ...startedExecution(), status: 'paused', updatedAt: T1 };
    state = executionUiReducer(state, { type: 'transition_succeeded', execution: paused, revision: 1 });
    expect(state.phase).toBe('ready');
    expect(state.execution?.status).toBe('paused');
    expect(state.revision).toBe(1);
  });

  it('ignores requests that do not match the current phase', () => {
    const idle = initialExecutionUi('owner-1');
    expect(executionUiReducer(idle, { type: 'retry_requested' })).toBe(idle);
    expect(
      executionUiReducer(idle, {
        type: 'transition_requested',
        operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        command: { kind: 'pause' },
        at: T1,
        result: startedExecution(),
        expectedRevision: 0,
      }),
    ).toBe(idle);
    const active = started();
    expect(
      executionUiReducer(active, {
        type: 'start_requested',
        operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        executionId: 'exec-2',
        recommendationRunId: 'run-2026-10-13-001',
        startedAt: T0,
      }),
    ).toBe(active);
  });

  it('keeps state identical when the same owner is reported again', () => {
    const state = started();
    expect(executionUiReducer(state, { type: 'owner_changed', ownerId: 'owner-1' })).toBe(state);
  });

  it('discards in-flight work when the owner changes', () => {
    let state = started();
    state = executionUiReducer(state, { type: 'owner_changed', ownerId: 'owner-2' });
    expect(state.phase).toBe('idle');
    expect(state.execution).toBeNull();
    expect(state.pending).toBeNull();
    expect(state.ownerId).toBe('owner-2');
    expect(state.ownerEpoch).toBe(1);
  });

  it('discards in-flight work on unmount without keeping the old execution', () => {
    let state = started();
    state = executionUiReducer(state, {
      type: 'transition_requested',
      operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      command: { kind: 'pause' },
      at: T1,
      result: { ...startedExecution(), status: 'paused', updatedAt: T1 },
      expectedRevision: 0,
    });
    expect(state.phase).toBe('saving');
    state = executionUiReducer(state, { type: 'discarded' });
    expect(state.phase).toBe('idle');
    expect(state.execution).toBeNull();
    expect(state.pending).toBeNull();
  });

  it('ignores a late success after the owner changed', () => {
    let state = initialExecutionUi('owner-1');
    state = executionUiReducer(state, {
      type: 'start_requested',
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      executionId: 'exec-1',
      recommendationRunId: 'run-2026-10-13-001',
      startedAt: T0,
    });
    state = executionUiReducer(state, { type: 'owner_changed', ownerId: 'owner-2' });
    state = executionUiReducer(state, {
      type: 'start_succeeded',
      execution: startedExecution(),
      revision: 0,
    });
    expect(state.phase).toBe('idle');
    expect(state.execution).toBeNull();
  });

  it('builds a completion result from confirmed steps only', () => {
    const completion = buildExecutionCompletion(confirmedExecution());
    expect(completion.executionId).toBe('exec-1');
    expect(completion.recommendationRunId).toBe('run-2026-10-13-001');
    expect(completion.status).toBe('in_progress');
    expect(completion.confirmed).toHaveLength(1);
    expect(completion.confirmed[0]).toMatchObject({ stepId: 'step-1', position: 1 });
  });

  it('reports no confirmed events for an untouched execution', () => {
    const completion = buildExecutionCompletion(startedExecution());
    expect(completion.confirmed).toHaveLength(0);
  });
});

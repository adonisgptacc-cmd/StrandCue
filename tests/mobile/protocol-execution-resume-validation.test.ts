import { describe, expect, it, vi } from 'vitest';

import {
  fingerprintOfDecision,
  resumeErrorCopy,
  validateResumedReceipt,
} from '../../apps/mobile/src/guidance/protocol-execution-resume.ts';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  StyleSheet: { create: (value: unknown) => value },
}));

vi.mock('../../apps/mobile/src/client', () => ({
  supabase: null,
}));

const T0 = '2026-10-13T12:00:00+02:00';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_RUN_ID = '99999999-9999-4999-8999-999999999999';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

function decisionFixture() {
  return {
    requestId: RUN_ID,
    steps: [
      { stepId: 'step-1', position: 1 },
      { stepId: 'step-2', position: 2 },
    ],
  };
}

function pendingStep(stepId: string, position: number) {
  return {
    stepId,
    position,
    planned: {
      stepId,
      position,
      action: 'apply',
      productId: null,
      productVersionId: null,
      toolId: null,
      toolVersionId: null,
      waitSeconds: null,
      rinse: null,
      reasons: ['rule a@1 requires it'],
    },
    state: 'pending',
    confirmedAt: null,
    deviation: null,
  };
}

function executionFixture(overrides: Record<string, unknown> = {}) {
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    startedAt: T0,
    updatedAt: T0,
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
    updatedAt: T0,
    createdAt: T0,
    execution: executionFixture(),
    ...overrides,
  };
}

describe('resumed execution fingerprint', () => {
  it('derives the run identity plus the ordered decision step set', () => {
    expect(fingerprintOfDecision(decisionFixture())).toEqual({
      recommendationRunId: RUN_ID,
      stepIds: ['step-1', 'step-2'],
    });
  });

  it('accepts a receipt whose run identity and step set match the decision', () => {
    const outcome = validateResumedReceipt(receiptFixture({ revision: 2 }), decisionFixture());
    expect(outcome.status).toBe('resumable');
    if (outcome.status !== 'resumable') throw new Error('expected resumable');
    expect(outcome.revision).toBe(2);
    expect(outcome.execution.executionId).toBe(EXECUTION_ID);
  });

  it('accepts a terminal receipt so the surface shows it instead of a fresh start', () => {
    const outcome = validateResumedReceipt(
      receiptFixture({
        status: 'completed',
        revision: 3,
        execution: executionFixture({ status: 'completed', finishedAt: T0, updatedAt: T0 }),
      }),
      decisionFixture(),
    );
    expect(outcome.status).toBe('resumable');
  });

  it('rejects a receipt built from a different recommendation run', () => {
    const outcome = validateResumedReceipt(
      receiptFixture({
        recommendationRunId: OTHER_RUN_ID,
        execution: executionFixture({ recommendationRunId: OTHER_RUN_ID }),
      }),
      decisionFixture(),
    );
    expect(outcome).toEqual({ status: 'unverified' });
  });

  it('rejects a receipt whose step set no longer matches the decision', () => {
    const outcome = validateResumedReceipt(
      receiptFixture({
        execution: executionFixture({ steps: [pendingStep('step-1', 1), pendingStep('step-9', 2)] }),
      }),
      decisionFixture(),
    );
    expect(outcome).toEqual({ status: 'unverified' });
  });

  it('rejects a receipt whose step order differs from the decision', () => {
    // Task-15 carry: the fingerprint is an *ordered* step set, so a server-side
    // reorder (same ids, different order) must fall to `unverified` rather than
    // render best-effort. The step-set test above swaps an id, which a
    // set-insensitive comparison would also reject, so it cannot pin the order
    // rule on its own - this case is the one that discriminates.
    const outcome = validateResumedReceipt(
      receiptFixture({
        execution: executionFixture({ steps: [pendingStep('step-2', 1), pendingStep('step-1', 2)] }),
      }),
      decisionFixture(),
    );
    expect(outcome).toEqual({ status: 'unverified' });
  });

  it('rejects a receipt whose envelope disagrees with its own snapshot', () => {
    const envelopeMismatch = validateResumedReceipt(
      receiptFixture({ executionId: '33333333-3333-4333-8333-333333333333' }),
      decisionFixture(),
    );
    expect(envelopeMismatch).toEqual({ status: 'unverified' });
    const statusMismatch = validateResumedReceipt(
      receiptFixture({ status: 'paused' }),
      decisionFixture(),
    );
    expect(statusMismatch).toEqual({ status: 'unverified' });
  });

  it('rejects a malformed execution snapshot instead of partially rendering it', () => {
    expect(
      validateResumedReceipt(receiptFixture({ execution: { executionId: EXECUTION_ID } }), decisionFixture()),
    ).toEqual({ status: 'unverified' });
    expect(validateResumedReceipt(null, decisionFixture())).toEqual({ status: 'absent' });
    expect(validateResumedReceipt(undefined, decisionFixture())).toEqual({ status: 'absent' });
  });
});

describe('resume error copy', () => {
  it('maps stable codes to user copy without raw text', () => {
    expect(resumeErrorCopy(new Error('account-not-active')).copy).toMatch(/not active/i);
    expect(resumeErrorCopy(new Error('account-not-active')).offline).toBe(false);
  });

  it('treats transport failures as offline with retry copy', () => {
    for (const message of ['Network request failed', 'fetch failed', 'connection reset']) {
      const mapped = resumeErrorCopy(new Error(message));
      expect(mapped.offline).toBe(true);
      expect(mapped.copy).toMatch(/offline/i);
    }
  });

  it('treats a zod parse failure as unverified rather than offline', () => {
    const parseError = new Error('Invalid input: expected string');
    parseError.name = 'ZodError';
    const mapped = resumeErrorCopy(parseError);
    expect(mapped.offline).toBe(false);
    expect(mapped.copy).toMatch(/verified/i);
  });
});

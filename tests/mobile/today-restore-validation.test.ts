import { describe, expect, it, vi } from 'vitest';

import { validateRestoredBundle } from '../../apps/mobile/src/guidance/protocol-execution-resume.ts';

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
const FINGERPRINT = 'a'.repeat(64);

function decisionFixture(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    requestId: RUN_ID,
    confidence: 'moderate',
    noPurchaseNeeded: true,
    steps: [
      {
        stepId: 'step-1',
        position: 1,
        action: 'apply',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: null,
        reasons: ['rule a@1 requires it'],
      },
      {
        stepId: 'step-2',
        position: 2,
        action: 'rinse',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: true,
        reasons: ['rule b@1 requires rinsing'],
      },
    ],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: RUN_ID,
      engineVersion: '1',
      evaluatedRules: [{ ruleId: 'rule-a', versionId: '1', outcome: 'applied', reason: 'ok', evidenceIds: ['e1'] }],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
    ...overrides,
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
    status: 'paused',
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
    status: 'paused',
    revision: 2,
    updatedAt: T0,
    createdAt: T0,
    execution: executionFixture(),
    ...overrides,
  };
}

function runFixture(overrides: Record<string, unknown> = {}) {
  const { decision: decisionOverride, ...rest } = overrides;
  const decision = decisionFixture(
    (decisionOverride ?? {}) as Record<string, unknown>,
  );
  return {
    requestId: RUN_ID,
    inputFingerprint: FINGERPRINT,
    asOf: T0,
    engineVersion: '1',
    bundleId: 'bundle-synthetic',
    bundleVersion: '1',
    status: 'ready',
    input: { requestId: RUN_ID },
    decision,
    trusted: true,
    createdAt: T0,
    ...rest,
  };
}

function bundleFixture(overrides: Record<string, unknown> = {}) {
  const decision = decisionFixture();
  const run = runFixture({ decision });
  return {
    execution: receiptFixture(),
    run,
    storedDecision: decision,
    ...overrides,
  };
}

describe('restored bundle validation', () => {
  it('treats a missing bundle as absent, never as failure', () => {
    expect(validateRestoredBundle(null)).toEqual({ status: 'absent' });
    expect(validateRestoredBundle(undefined)).toEqual({ status: 'absent' });
  });

  it('resumes a byte-honest bundle with decision and run identifiers', () => {
    const outcome = validateRestoredBundle(bundleFixture());
    expect(outcome.status).toBe('resumable');
    if (outcome.status !== 'resumable') throw new Error('expected resumable');
    expect(outcome.revision).toBe(2);
    expect(outcome.execution.executionId).toBe(EXECUTION_ID);
    expect(outcome.decision.requestId).toBe(RUN_ID);
    expect(outcome.run).toEqual({
      requestId: RUN_ID,
      inputFingerprint: FINGERPRINT,
      asOf: T0,
      engineVersion: '1',
      bundleId: 'bundle-synthetic',
      bundleVersion: '1',
    });
  });

  it('rejects a non-object bundle', () => {
    expect(validateRestoredBundle('bundle')).toEqual({ status: 'unverified' });
    expect(validateRestoredBundle([bundleFixture()])).toEqual({ status: 'unverified' });
  });

  it('fails closed when the bundle claims an execution but carries none', () => {
    expect(validateRestoredBundle({ ...bundleFixture(), execution: null })).toEqual({
      status: 'unverified',
    });
    expect(validateRestoredBundle({ ...bundleFixture(), execution: undefined })).toEqual({
      status: 'unverified',
    });
  });

  it('fails closed when the cited run row is gone or malformed', () => {
    expect(validateRestoredBundle({ ...bundleFixture(), run: null })).toEqual({
      status: 'unverified',
    });
    expect(validateRestoredBundle({ ...bundleFixture(), run: 'run' })).toEqual({
      status: 'unverified',
    });
  });

  it('fails closed on an untrusted or non-ready run row', () => {
    const untrusted = bundleFixture();
    expect(
      validateRestoredBundle({ ...untrusted, run: { ...untrusted.run, trusted: false } }),
    ).toEqual({ status: 'unverified' });
    const nonReady = bundleFixture();
    expect(
      validateRestoredBundle({ ...nonReady, run: { ...nonReady.run, status: 'needs_input' } }),
    ).toEqual({ status: 'unverified' });
  });

  it('fails closed on malformed run identity fields', () => {
    const base = bundleFixture();
    const cases: Record<string, unknown>[] = [
      { requestId: 'not-a-uuid' },
      { requestId: OTHER_RUN_ID },
      { inputFingerprint: 'xyz' },
      { asOf: '' },
      { engineVersion: '  ' },
      { bundleId: '' },
      { bundleVersion: '' },
      { input: null },
      { input: [1, 2] },
    ];
    for (const patch of cases) {
      expect(validateRestoredBundle({ ...base, run: { ...base.run, ...patch } })).toEqual({
        status: 'unverified',
      });
    }
  });

  it('fails closed when the run names a different run than the receipt', () => {
    const base = bundleFixture();
    // Run row retargeted at another run: receipt still cites RUN_ID.
    const other = runFixture({ requestId: OTHER_RUN_ID, decision: { requestId: OTHER_RUN_ID } });
    expect(validateRestoredBundle({ ...base, run: other })).toEqual({ status: 'unverified' });
  });

  it('fails closed when the stored decision names a different run', () => {
    const base = bundleFixture();
    const renamed = decisionFixture({ requestId: OTHER_RUN_ID });
    expect(
      validateRestoredBundle({
        ...base,
        run: { ...base.run, decision: renamed },
        storedDecision: renamed,
      }),
    ).toEqual({ status: 'unverified' });
  });

  it('fails closed when the execution-row copy disagrees with the run decision', () => {
    const base = bundleFixture();
    const altered = decisionFixture({ confidence: 'high' });
    expect(validateRestoredBundle({ ...base, storedDecision: altered })).toEqual({
      status: 'unverified',
    });
    expect(validateRestoredBundle({ ...base, storedDecision: null })).toEqual({
      status: 'unverified',
    });
  });

  it('fails closed on a decision that cannot be rendered', () => {
    const base = bundleFixture();
    const patches: Record<string, unknown>[] = [
      { status: 'needs_input' },
      { confidence: 'absolute' },
      { steps: [] },
      { steps: [{ stepId: '', position: 1, action: 'apply', reasons: [] }] },
      { steps: 'steps' },
      { omissions: null },
      { audit: null },
      { audit: { evaluatedRules: [{ ruleId: 'r' }] } },
    ];
    for (const patch of patches) {
      const decision = { ...decisionFixture(), ...patch };
      expect(
        validateRestoredBundle({
          ...base,
          run: { ...base.run, decision },
          storedDecision: decision,
        }),
      ).toEqual({ status: 'unverified' });
    }
    const missing = base;
    expect(
      validateRestoredBundle({
        ...missing,
        run: { ...missing.run, decision: null },
        storedDecision: null,
      }),
    ).toEqual({ status: 'unverified' });
  });

  it('fails closed when the receipt cites another run or reshaped steps', () => {
    const base = bundleFixture();
    expect(
      validateRestoredBundle({
        ...base,
        execution: receiptFixture({
          recommendationRunId: OTHER_RUN_ID,
          execution: executionFixture({ recommendationRunId: OTHER_RUN_ID }),
        }),
      }),
    ).toEqual({ status: 'unverified' });
    expect(
      validateRestoredBundle({
        ...base,
        execution: receiptFixture({
          execution: executionFixture({ steps: [pendingStep('step-1', 1), pendingStep('step-9', 2)] }),
        }),
      }),
    ).toEqual({ status: 'unverified' });
    expect(
      validateRestoredBundle({
        ...base,
        execution: receiptFixture({ execution: { executionId: EXECUTION_ID } }),
      }),
    ).toEqual({ status: 'unverified' });
  });

  it('never restores a terminal execution on relaunch (Fix F)', () => {
    // Active restore handles in_progress/paused only. The server aggregate
    // returns null once the execution is terminal, so Today relaunches to
    // idle/check-in; a non-null bundle claiming a terminal status
    // contradicts the aggregate contract and must fail closed, never paint.
    for (const status of ['completed', 'abandoned'] as const) {
      const terminal = executionFixture({
        status,
        finishedAt: T0,
        closeReason: status === 'abandoned' ? 'done for now' : null,
      });
      expect(
        validateRestoredBundle({
          ...bundleFixture(),
          execution: receiptFixture({ status, execution: terminal }),
        }),
      ).toEqual({ status: 'unverified' });
    }
  });
});

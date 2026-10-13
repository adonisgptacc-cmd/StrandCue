import { describe, expect, it } from 'vitest';

import {
  ExecutionCommandSchema,
  ProtocolExecutionSchema,
  applyExecutionCommand,
  executionEvents,
  parseProtocolExecution,
  startProtocolExecution,
  type ExecutionCommand,
  type ProtocolDecision,
  type ProtocolExecution,
} from '../../packages/domain/src/index.ts';

// Injected clock for every temporal assertion: 2026-10-13 SAST.
// The contracts never read the wall clock; every timestamp is passed in.
const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';
const T2 = '2026-10-13T12:10:00+02:00';
const T3 = '2026-10-13T12:15:00+02:00';
const T4 = '2026-10-13T12:20:00+02:00';

function readyDecision() {
  return {
    status: 'ready',
    requestId: 'run-2026-10-13-001',
    confidence: 'high',
    noPurchaseNeeded: true,
    steps: [
      {
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
      {
        stepId: 'step-2',
        position: 2,
        action: 'wait',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: 120,
        rinse: null,
        reasons: ['rule a@1 requires a 120s wait'],
      },
      {
        stepId: 'step-3',
        position: 3,
        action: 'rinse',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: true,
        reasons: ['rule a@1 requires rinsing'],
      },
    ],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: {
      requestId: 'run-2026-10-13-001',
      engineVersion: '1',
      evaluatedRules: [],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
  } as unknown as ProtocolDecision;
}

function started(): ProtocolExecution {
  return startProtocolExecution({
    executionId: 'exec-001',
    decision: readyDecision(),
    startedAt: T0,
  });
}

function run(command: ExecutionCommand, at: string, execution?: ProtocolExecution): ProtocolExecution {
  return applyExecutionCommand(execution ?? started(), command, { at });
}

describe('ProtocolExecution run reference', () => {
  it('references one immutable recommendation run and copies stable step identities', () => {
    const execution = started();

    expect(execution.recommendationRunId).toBe('run-2026-10-13-001');
    expect(execution.status).toBe('in_progress');
    expect(execution.steps.map(step => [step.stepId, step.position])).toEqual([
      ['step-1', 1],
      ['step-2', 2],
      ['step-3', 3],
    ]);
    expect(execution.steps.every(step => step.state === 'pending')).toBe(true);
  });

  it('preserves the original plan reference on every copied step', () => {
    const decision = readyDecision();
    const execution = startProtocolExecution({ executionId: 'exec-001', decision, startedAt: T0 });

    execution.steps.forEach((step, index) => {
      expect(step.planned).toEqual(decision.steps[index]);
    });
  });

  it('leaves the source decision byte-identical before and after transitions', () => {
    const decision = readyDecision();
    const before = JSON.stringify(decision);

    const execution = startProtocolExecution({ executionId: 'exec-001', decision, startedAt: T0 });
    let next = applyExecutionCommand(execution, { kind: 'complete-step', stepId: 'step-1' }, { at: T1 });
    next = applyExecutionCommand(
      next,
      { kind: 'substitute-step', stepId: 'step-2', reason: 'owned swap', replacement: { productId: 'prod-gentle', productVersionId: 'v1', owned: true } },
      { at: T2 },
    );
    next = applyExecutionCommand(next, { kind: 'skip-step', stepId: 'step-3', reason: 'no time' }, { at: T3 });
    void next;

    expect(JSON.stringify(decision)).toBe(before);
  });

  it('rejects starting from a non-ready decision without recording anything', () => {
    const blocked = { ...readyDecision(), status: 'needs_input', steps: [] } as unknown as ProtocolDecision;

    expect(() => startProtocolExecution({ executionId: 'exec-001', decision: blocked, startedAt: T0 })).toThrow(
      expect.objectContaining({ code: 'not-ready-decision' }),
    );
  });

  it('rejects starting from an empty plan', () => {
    const empty = { ...readyDecision(), steps: [] } as unknown as ProtocolDecision;

    expect(() => startProtocolExecution({ executionId: 'exec-001', decision: empty, startedAt: T0 })).toThrow(
      expect.objectContaining({ code: 'empty-plan' }),
    );
  });

  it('rejects a plan with duplicate step identities', () => {
    const decision = readyDecision();
    const duplicated = {
      ...decision,
      steps: [decision.steps[0], decision.steps[0]],
    } as unknown as ProtocolDecision;

    expect(() => startProtocolExecution({ executionId: 'exec-001', decision: duplicated, startedAt: T0 })).toThrow(
      /repeats stable step/i,
    );
  });
});

describe('ProtocolExecution transitions', () => {
  it('walks a full valid path: complete, skip, substitute, modify, pause, resume, complete', () => {
    let execution = started();

    execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1, execution);
    expect(execution.steps[0]?.state).toBe('confirmed');

    execution = run({ kind: 'skip-step', stepId: 'step-2', reason: 'running late' }, T2, execution);
    expect(execution.steps[1]?.state).toBe('skipped');

    execution = run(
      {
        kind: 'substitute-step',
        stepId: 'step-3',
        reason: 'gentler option on hand',
        replacement: { productId: 'prod-gentle', productVersionId: 'v1', owned: true },
      },
      T3,
      execution,
    );
    expect(execution.steps[2]?.state).toBe('substituted');

    execution = run({ kind: 'pause' }, T3, execution);
    expect(execution.status).toBe('paused');

    execution = run({ kind: 'resume' }, T4, execution);
    expect(execution.status).toBe('in_progress');

    execution = run({ kind: 'complete' }, T4, execution);
    expect(execution.status).toBe('completed');
  });

  it('supports modify-step as a deviation that keeps the original plan reference', () => {
    const decision = readyDecision();
    let execution = startProtocolExecution({ executionId: 'exec-001', decision, startedAt: T0 });

    execution = applyExecutionCommand(
      execution,
      { kind: 'modify-step', stepId: 'step-2', reason: 'short on time', detail: 'wait cut to 60s' },
      { at: T1 },
    );

    expect(execution.steps[1]?.state).toBe('modified');
    expect(execution.steps[1]?.deviation).toEqual({
      kind: 'modify',
      reason: 'short on time',
      detail: 'wait cut to 60s',
    });
    expect(execution.steps[1]?.planned).toEqual(decision.steps[1]);
  });

  it('rejects completing an execution while steps are still unconfirmed', () => {
    const execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1);

    expect(() => run({ kind: 'complete' }, T2, execution)).toThrow(
      expect.objectContaining({ code: 'pending-steps-remain' }),
    );
  });

  it('rejects resuming a completed execution', () => {
    let execution = started();
    execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1, execution);
    execution = run({ kind: 'skip-step', stepId: 'step-2', reason: 'late' }, T2, execution);
    execution = run({ kind: 'skip-step', stepId: 'step-3', reason: 'late' }, T3, execution);
    execution = run({ kind: 'complete' }, T4, execution);

    expect(() => run({ kind: 'resume' }, T4, execution)).toThrow(
      expect.objectContaining({ code: 'execution-terminal' }),
    );
  });

  it('rejects resuming an execution that was never paused', () => {
    expect(() => run({ kind: 'resume' }, T1)).toThrow(
      expect.objectContaining({ code: 'invalid-status-transition' }),
    );
  });

  it('rejects a duplicate step confirmation', () => {
    const execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1);

    expect(() => run({ kind: 'complete-step', stepId: 'step-1' }, T2, execution)).toThrow(
      expect.objectContaining({ code: 'step-already-resolved' }),
    );
  });

  it('rejects substitutions without an owned product reference', () => {
    expect(() =>
      run(
        {
          kind: 'substitute-step',
          stepId: 'step-1',
          reason: 'borrowed bottle',
          replacement: { productId: 'prod-borrowed', productVersionId: 'v1', owned: false as unknown as true },
        },
        T1,
      ),
    ).toThrow(/owned/i);
  });

  it('rejects pausing an already-paused execution and completing a paused one', () => {
    const paused = run({ kind: 'pause' }, T1);

    expect(() => run({ kind: 'pause' }, T2, paused)).toThrow(
      expect.objectContaining({ code: 'invalid-status-transition' }),
    );
    expect(() => run({ kind: 'complete' }, T2, paused)).toThrow(
      expect.objectContaining({ code: 'invalid-status-transition' }),
    );
  });

  it('rejects confirming an unknown step', () => {
    expect(() => run({ kind: 'complete-step', stepId: 'step-9' }, T1)).toThrow(
      expect.objectContaining({ code: 'unknown-step' }),
    );
  });

  it('rejects step commands while paused and after abandon', () => {
    let execution = run({ kind: 'pause' }, T1);
    expect(() => run({ kind: 'complete-step', stepId: 'step-1' }, T2, execution)).toThrow(
      expect.objectContaining({ code: 'execution-not-active' }),
    );

    execution = run({ kind: 'abandon', reason: 'changed mind' }, T2, execution);
    expect(execution.status).toBe('abandoned');
    expect(() => run({ kind: 'complete-step', stepId: 'step-1' }, T3, execution)).toThrow(
      expect.objectContaining({ code: 'execution-terminal' }),
    );
  });

  it('rejects every command once the execution is completed', () => {
    let execution = started();
    execution = run({ kind: 'skip-step', stepId: 'step-1', reason: 'a' }, T1, execution);
    execution = run({ kind: 'skip-step', stepId: 'step-2', reason: 'b' }, T2, execution);
    execution = run({ kind: 'skip-step', stepId: 'step-3', reason: 'c' }, T3, execution);
    execution = run({ kind: 'complete' }, T4, execution);

    expect(() => run({ kind: 'pause' }, T4, execution)).toThrow(
      expect.objectContaining({ code: 'execution-terminal' }),
    );
  });

  it('requires an injected timestamp instead of reading the wall clock', () => {
    expect(() => applyExecutionCommand(started(), { kind: 'complete-step', stepId: 'step-1' })).toThrow(
      /timestamp/i,
    );
  });
});

describe('ProtocolExecution partial and abandoned history', () => {
  it('preserves exactly the confirmed events on a partial execution, with no phantoms', () => {
    let execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1);
    execution = run({ kind: 'skip-step', stepId: 'step-2', reason: 'late' }, T2, execution);

    const events = executionEvents(execution);

    expect(events).toEqual([{ stepId: 'step-1', position: 1, confirmedAt: T1 }]);
    expect(events.map(event => event.stepId)).not.toContain('step-2');
    expect(events.map(event => event.stepId)).not.toContain('step-3');
  });

  it('preserves confirmed events on abandon and never implies remaining steps occurred', () => {
    let execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1);
    execution = run({ kind: 'abandon', reason: 'interrupted' }, T2, execution);

    expect(execution.status).toBe('abandoned');
    expect(executionEvents(execution)).toEqual([{ stepId: 'step-1', position: 1, confirmedAt: T1 }]);
  });

  it('records confirmed events on a completed execution and nothing else', () => {
    let execution = run({ kind: 'complete-step', stepId: 'step-1' }, T1);
    execution = run({ kind: 'complete-step', stepId: 'step-2' }, T2, execution);
    execution = run({ kind: 'skip-step', stepId: 'step-3', reason: 'optional' }, T3, execution);
    execution = run({ kind: 'complete' }, T4, execution);

    expect(executionEvents(execution)).toEqual([
      { stepId: 'step-1', position: 1, confirmedAt: T1 },
      { stepId: 'step-2', position: 2, confirmedAt: T2 },
    ]);
  });
});

describe('ProtocolExecution purity and schemas', () => {
  it('returns frozen objects and never mutates its inputs', () => {
    const execution = started();
    const snapshot = JSON.stringify(execution);

    const next = run({ kind: 'complete-step', stepId: 'step-1' }, T1, execution);

    expect(JSON.stringify(execution)).toBe(snapshot);
    expect(next).not.toBe(execution);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.steps)).toBe(true);
    expect(next.steps.every(step => Object.isFrozen(step))).toBe(true);
  });

  it('parses a stored execution and rejects unknown fields', () => {
    const parsed = parseProtocolExecution(JSON.parse(JSON.stringify(started())));

    expect(parsed.executionId).toBe('exec-001');
    expect(() => parseProtocolExecution({ ...JSON.parse(JSON.stringify(started())), extra: true })).toThrow();
  });

  it('rejects commands with unknown fields and bad timestamps', () => {
    expect(() => ExecutionCommandSchema.parse({ kind: 'pause', extra: true })).toThrow();
    expect(() =>
      startProtocolExecution({ executionId: 'exec-001', decision: readyDecision(), startedAt: 'not-a-date' }),
    ).toThrow();
    expect(() => ProtocolExecutionSchema.parse({})).toThrow();
  });

  it('rejects a resume command parsed without its strict shape', () => {
    expect(() => ExecutionCommandSchema.parse({ kind: 'complete-step' })).toThrow();
    expect(() => ExecutionCommandSchema.parse({ kind: 'nope' })).toThrow();
  });
});

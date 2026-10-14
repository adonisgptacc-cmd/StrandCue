import { describe, expect, it, vi } from 'vitest';

import {
  applyExecutionCommand,
  type ProtocolExecution,
} from '../../packages/domain/src/index.ts';
import {
  createProtocolTransitionDispatcher,
  startErrorCopy,
  TRANSITION_SAVE_FAILED_COPY,
  TRANSITION_START_FAILED_COPY,
  TRANSITION_USER_COPY,
  transitionErrorCopy,
} from '../../apps/mobile/src/guidance/protocol-transition-dispatch.ts';

vi.mock('../../apps/mobile/src/client', () => ({
  supabase: null,
}));

const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';
const T2 = '2026-10-13T12:06:00+02:00';
const OP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
    ],
    finishedAt: null,
    closeReason: null,
  } as unknown as ProtocolExecution;
}

function setup() {
  const nowIso = vi.fn((): string => T1);
  const newOperationId = vi.fn((): string => OP);
  const persist = vi.fn(
    async (request: unknown): Promise<unknown> =>
      ({
        executionId: 'exec-1',
        recommendationRunId: 'run-2026-10-13-001',
        status: 'paused',
        revision: 1,
        updatedAt: T2,
        createdAt: T0,
        execution: { ...(startedExecution() as object), status: 'paused', updatedAt: T2 },
        request,
      }) as unknown,
  );
  const dispatcher = createProtocolTransitionDispatcher({ nowIso, newOperationId, persist: persist as never });
  return { dispatcher, nowIso, newOperationId, persist };
}

describe('protocol transition dispatch', () => {
  it('documents the structural hazard: two clock reads in a dispatch path can diverge', () => {
    // TDD adaptation (controller ruling, binding): the brief's RED predates
    // Task 4 — the call site already threads one `at` through preview and
    // wire, and the server no longer emits `result-mismatch`. This test pins
    // the remaining structural hazard instead: with a deterministic clock
    // returning t1 then t2, ANY dispatch path that reads the clock twice
    // (once for the optimistic preview, once for the wire command) stamps
    // preview.at = t1 while wire.at = t2. The dispatcher below eliminates the
    // pattern by reading the clock exactly once per action.
    const nowIso = vi.fn((): string => T1).mockReturnValueOnce(T1).mockReturnValueOnce(T2);
    const previewAt = nowIso();
    const wireAt = nowIso();
    expect(previewAt).not.toBe(wireAt);
  });

  it('reads the clock exactly once per action and threads one eventAt through preview and wire', async () => {
    const { dispatcher, nowIso, persist } = setup();
    const begun = dispatcher.begin({
      command: { kind: 'pause' },
      execution: startedExecution(),
      executionId: 'exec-1',
      expectedRevision: 0,
    });
    expect(begun.status).toBe('ready');
    if (begun.status !== 'ready') throw new Error('expected a ready transition');
    expect(nowIso).toHaveBeenCalledTimes(1);
    expect(begun.request.at).toBe(T1);
    expect(begun.preview.updatedAt).toBe(T1);
    const outcome = await dispatcher.deliver(begun.request);
    expect(outcome.status).toBe('succeeded');
    expect(nowIso).toHaveBeenCalledTimes(1);
    const wire = persist.mock.calls[0][0] as Record<string, unknown>;
    expect(wire.at).toBe(T1);
    expect(wire).toMatchObject({ command: { kind: 'pause' }, expectedRevision: 0 });
    expect(wire).not.toHaveProperty('result');
  });

  it('blocks a concurrent second action while one is pending', async () => {
    const { dispatcher, nowIso, persist } = setup();
    expect(dispatcher.isPending()).toBe(false);
    const first = dispatcher.begin({
      command: { kind: 'pause' },
      execution: startedExecution(),
      executionId: 'exec-1',
      expectedRevision: 0,
    });
    expect(first.status).toBe('ready');
    expect(dispatcher.isPending()).toBe(true);
    const second = dispatcher.begin({
      command: { kind: 'resume' },
      execution: startedExecution(),
      executionId: 'exec-1',
      expectedRevision: 0,
    });
    expect(second).toMatchObject({ status: 'busy' });
    expect(nowIso).toHaveBeenCalledTimes(1);
    if (first.status !== 'ready') throw new Error('expected a ready transition');
    const foreign = await dispatcher.deliver({ ...first.request, operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    expect(foreign).toMatchObject({ status: 'busy' });
    const outcome = await dispatcher.deliver(first.request);
    expect(outcome.status).toBe('succeeded');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(dispatcher.isPending()).toBe(false);
  });

  it('rejects a domain-invalid preview without persisting and with user copy', () => {
    const { dispatcher, persist } = setup();
    const terminal = { ...startedExecution(), status: 'abandoned' } as ProtocolExecution;
    const begun = dispatcher.begin({
      command: { kind: 'pause' },
      execution: terminal,
      executionId: 'exec-1',
      expectedRevision: 3,
    });
    expect(begun).toMatchObject({ status: 'invalid', code: 'execution-terminal' });
    if (begun.status !== 'invalid') throw new Error('expected an invalid transition');
    expect(begun.copy).toBe(TRANSITION_USER_COPY['execution-terminal']);
    expect(begun.copy).not.toContain('execution-terminal');
    expect(persist).not.toHaveBeenCalled();
  });

  it('reconciles the authoritative receipt without asserting preview/receipt equality', async () => {
    const { dispatcher } = setup();
    const begun = dispatcher.begin({
      command: { kind: 'pause' },
      execution: startedExecution(),
      executionId: 'exec-1',
      expectedRevision: 0,
    });
    if (begun.status !== 'ready') throw new Error('expected a ready transition');
    const outcome = await dispatcher.deliver(begun.request);
    expect(outcome.status).toBe('succeeded');
    if (outcome.status !== 'succeeded') throw new Error('expected success');
    // By design the server owns updatedAt: the optimistic preview stamps the
    // client eventAt while the receipt stamps the server clock. The
    // dispatcher carries both and never asserts equality — the receipt wins.
    expect(begun.preview.updatedAt).toBe(T1);
    expect(outcome.receipt.updatedAt).toBe(T2);
    expect(outcome.receipt.updatedAt).not.toBe(begun.preview.updatedAt);
    expect(outcome.receipt.execution).toMatchObject({ status: 'paused' });
  });

  it('retries with the same operation id and timestamp without re-reading the clock', async () => {
    const { dispatcher, nowIso, persist } = setup();
    const begun = dispatcher.begin({
      command: { kind: 'pause' },
      execution: startedExecution(),
      executionId: 'exec-1',
      expectedRevision: 0,
    });
    if (begun.status !== 'ready') throw new Error('expected a ready transition');
    persist.mockRejectedValueOnce(new Error('revision-conflict'));
    const failed = await dispatcher.deliver(begun.request);
    expect(failed).toMatchObject({ status: 'failed', code: 'revision-conflict' });
    if (failed.status !== 'failed') throw new Error('expected failure');
    expect(failed.copy).toBe(TRANSITION_USER_COPY['revision-conflict']);
    const retried = await dispatcher.deliver(begun.request);
    expect(retried.status).toBe('succeeded');
    expect(persist).toHaveBeenCalledTimes(2);
    const first = persist.mock.calls[0][0] as Record<string, unknown>;
    const second = persist.mock.calls[1][0] as Record<string, unknown>;
    expect(second.operationId).toBe(first.operationId);
    expect(second.at).toBe(first.at);
    expect(nowIso).toHaveBeenCalledTimes(1);
  });

  it('maps every stable code to user copy that never leaks the raw code', () => {
    const codes = Object.keys(TRANSITION_USER_COPY);
    expect(codes).toContain('text-too-large');
    expect(codes).toContain('unowned-substitution');
    expect(codes).toContain('unknown-shelf-item');
    expect(codes).toContain('archived-shelf-item');
    expect(codes).toContain('unknown-product-version');
    expect(codes).toContain('revision-conflict');
    expect(codes).toContain('operation-conflict');
    for (const code of codes) {
      const { code: returned, copy } = transitionErrorCopy(new Error(code));
      expect(returned).toBe(code);
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.toLowerCase()).not.toContain(code);
    }
    // Multibyte free text can pass the client character bound then fail the
    // server octet bound: the copy must say the note was kept on screen while
    // the server rejected it, instead of echoing `text-too-large`.
    expect(TRANSITION_USER_COPY['text-too-large']).toMatch(/server/i);
    expect(TRANSITION_USER_COPY['text-too-large']).toMatch(/shorten/i);
  });

  it('falls back to honest generic copy for unmapped failures', () => {
    const { copy } = transitionErrorCopy(new Error('connection reset'));
    expect(copy).toBe(TRANSITION_SAVE_FAILED_COPY);
    expect(transitionErrorCopy('boom').copy).toBe(TRANSITION_SAVE_FAILED_COPY);
  });

  it('maps start failures through the shared stable-code table with a start-appropriate fallback', () => {
    expect(startErrorCopy(new Error('run-not-owned'))).toMatchObject({
      code: 'run-not-owned',
      copy: TRANSITION_USER_COPY['run-not-owned'],
    });
    const { code, copy } = startErrorCopy(new Error('connection reset'));
    expect(code).toBe('unmapped');
    expect(copy).toBe(TRANSITION_START_FAILED_COPY);
    expect(copy.toLowerCase()).not.toContain('connection reset');
  });

  it('pins terminal-vs-shape precedence: domain shape errors surface before terminal, the server is authoritative', () => {
    // Intended precedence, pinned because the layers order checks
    // differently for terminal + malformed input:
    // - Domain (`applyExecutionCommand`) parses the command shape BEFORE the
    //   terminal guard, so terminal + malformed command surfaces a shape
    //   error, NOT `execution-terminal`. Terminal + well-formed command with
    //   a missing timestamp surfaces `execution-terminal` (terminal guard runs
    //   before the timestamp is required).
    // - SQL (`apply_protocol_execution_command`) raises `execution-terminal`
    //   BEFORE command-shape validation (but AFTER the null-envelope
    //   `invalid-operation` check and the `operation-conflict` replay check).
    // The dispatcher therefore never asserts cross-layer parity for
    // terminal + malformed input: a preview rejection maps the domain outcome
    // locally, and any server rejection maps the server's stable code. The
    // server receipt is authoritative on success.
    const terminal = { ...startedExecution(), status: 'abandoned' } as ProtocolExecution;
    let shapeThrown: unknown = null;
    try {
      applyExecutionCommand(terminal, { kind: 'nope' } as never, { at: T1 });
    } catch (error) {
      shapeThrown = error;
    }
    expect(shapeThrown).not.toBeNull();
    expect((shapeThrown as { code?: string }).code ?? '').not.toBe('execution-terminal');

    let terminalThrown: unknown = null;
    try {
      applyExecutionCommand(terminal, { kind: 'pause' }, {});
    } catch (error) {
      terminalThrown = error;
    }
    expect((terminalThrown as { code?: string }).code).toBe('execution-terminal');

    const { dispatcher } = setup();
    const begun = dispatcher.begin({
      command: { kind: 'pause' },
      execution: terminal,
      executionId: 'exec-1',
      expectedRevision: 3,
    });
    expect(begun).toMatchObject({ status: 'invalid', code: 'execution-terminal' });
  });
});

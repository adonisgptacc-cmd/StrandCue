import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolDecision } from '../../packages/domain/src/index.ts';
import { applyExecutionCommand } from '../../packages/domain/src/index.ts';
import {
  useProtocolExecutionController,
  type ProtocolExecutionController,
} from '../../apps/mobile/src/useProtocolExecutionController.ts';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  transition: vi.fn(),
  getActive: vi.fn(),
  uuidCounter: { value: 0 },
  server: { execution: null as unknown, revision: 0 },
}));

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));

vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: mocks.start,
  transitionProtocolExecution: mocks.transition,
  getActiveProtocolExecution: mocks.getActive,
}));

const shelfMocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
}));

vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: shelfMocks.list,
  getUserProduct: shelfMocks.detail,
}));

const OWNER = 'owner-1';
const OTHER_OWNER = 'owner-2';
const RUN_A = '11111111-1111-4111-8111-111111111111';
const RUN_B = '33333333-3333-4333-8333-333333333333';
const EXECUTION_B = '44444444-4444-4444-8444-444444444444';
const T0 = '2026-10-13T12:00:00+02:00';
const SHELF_ITEM_ID = '66666666-6666-4666-8666-666666666666';

function readyDecision(requestId: string = RUN_A): ProtocolDecision {
  return {
    status: 'ready',
    requestId,
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
      requestId,
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

function pendingStep(stepId: string, position: number, action: string) {
  return {
    stepId,
    position,
    planned: {
      stepId,
      position,
      action,
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

function executionFixture(runId: string = RUN_A, overrides: Record<string, unknown> = {}) {
  return {
    executionId: '22222222-2222-4222-8222-222222222222',
    recommendationRunId: runId,
    startedAt: T0,
    updatedAt: T0,
    status: 'in_progress',
    steps: [pendingStep('step-1', 1, 'apply'), pendingStep('step-2', 2, 'rinse')],
    finishedAt: null,
    closeReason: null,
    ...overrides,
  };
}

function receiptFixture(runId: string = RUN_A, overrides: Record<string, unknown> = {}) {
  return {
    executionId: '22222222-2222-4222-8222-222222222222',
    recommendationRunId: runId,
    status: 'in_progress',
    revision: 0,
    updatedAt: T0,
    createdAt: T0,
    execution: executionFixture(runId),
    ...overrides,
  };
}

let latest: ProtocolExecutionController | null = null;
function Probe({ ownerId, decision }: { readonly ownerId: string; readonly decision: ProtocolDecision }) {
  const controller = useProtocolExecutionController(ownerId, decision);
  useEffect(() => {
    latest = controller;
  });
  return null;
}

async function mount(
  decision: ProtocolDecision = readyDecision(),
  ownerId: string = OWNER,
): Promise<ReactTestRenderer> {
  latest = null;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(Probe, { ownerId, decision }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer;
}

function controller(): ProtocolExecutionController {
  if (latest === null) throw new Error('expected the controller probe to mount');
  return latest;
}

const originalConsoleError = console.error.bind(console);
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uuidCounter.value = 0;
  mocks.getActive.mockResolvedValue(null);
  mocks.start.mockResolvedValue(receiptFixture());
  shelfMocks.list.mockResolvedValue({ items: [], nextCursor: null });
  shelfMocks.detail.mockResolvedValue(null);
  mocks.server.execution = executionFixture();
  mocks.server.revision = 0;
  mocks.transition.mockImplementation(async (command: unknown) => {
    const parsed = command as {
      expectedRevision: number;
      executionId: string;
      command: Parameters<typeof applyExecutionCommand>[1];
      at: string;
    };
    mocks.server.execution = applyExecutionCommand(
      mocks.server.execution as never,
      parsed.command,
      { at: parsed.at },
    );
    mocks.server.revision = parsed.expectedRevision + 1;
    return receiptFixture(RUN_A, {
      revision: mocks.server.revision,
      status: (mocks.server.execution as { status: string }).status,
      execution: mocks.server.execution,
    });
  });
});

describe('protocol execution controller (Task 17)', () => {
  it('mount loads the owner execution and resumes at the authoritative revision', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await mount();
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(controller().ui.phase).toBe('ready');
    expect(controller().execution?.recommendationRunId).toBe(RUN_A);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('mount resumes a saved execution without recording anything', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture(RUN_A, { revision: 2 }));
    const renderer = await mount();
    expect(controller().ui.phase).toBe('ready');
    expect(controller().ui.revision).toBe(2);
    expect(controller().execution?.recommendationRunId).toBe(RUN_A);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('start then transition flows through arm, confirm, and the single dispatcher', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    expect(controller().ui.phase).toBe('ready');
    expect(controller().execution).not.toBeNull();
    await act(async () => {
      controller().arm({ flow: 'skip', stepId: 'step-1' });
    });
    expect(controller().armed).toEqual({ flow: 'skip', stepId: 'step-1' });
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      controller().setReason('ran out of time');
    });
    await act(async () => {
      controller().confirmArmed();
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({
      command: { kind: 'skip-step', stepId: 'step-1', reason: 'ran out of time' },
      expectedRevision: 0,
    });
    expect(controller().armed).toBeNull();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('error maps the stable code to copy and retry reuses the same operation id', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    mocks.transition.mockRejectedValueOnce(new Error('revision-conflict'));
    await act(async () => {
      controller().arm({ flow: 'complete', stepId: 'step-1' });
    });
    await act(async () => {
      controller().confirmArmed();
      await Promise.resolve();
    });
    expect(controller().ui.phase).toBe('save_failed');
    expect(controller().ui.error).toContain('latest confirmed record');
    expect(controller().ui.error).not.toContain('revision-conflict');
    const first = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    mocks.transition.mockClear();
    await act(async () => {
      await controller().handleRetry();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect((mocks.transition.mock.calls[0][0] as Record<string, unknown>).operationId).toBe(
      first.operationId,
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('owner switch discards armed flow and form input and reloads the new owner', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await mount(readyDecision(), OWNER);
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'skip', stepId: 'step-1' });
      controller().setReason('stale note');
    });
    expect(controller().armed).not.toBeNull();
    mocks.getActive.mockResolvedValue(null);
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OTHER_OWNER, decision: readyDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(controller().armed).toBeNull();
    // The owner-switch guard discards the armed flow (so no form renders) but
    // preserves the reason text; the decision-swap guard clears both.
    expect(controller().reason).toBe('stale note');
    expect(controller().ownerMatches).toBe(true);
    expect(controller().ui.phase).toBe('idle');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('decision swap reloads and re-validates; the same requestId never reloads', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await mount(readyDecision(RUN_A), OWNER);
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OWNER, decision: readyDecision(RUN_A) }));
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    mocks.getActive.mockResolvedValue(
      receiptFixture(RUN_B, {
        executionId: EXECUTION_B,
        execution: executionFixture(RUN_B, { executionId: EXECUTION_B }),
      }),
    );
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OWNER, decision: readyDecision(RUN_B) }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(controller().execution?.recommendationRunId).toBe(RUN_B);
    expect(controller().runAgrees).toBe(true);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('substitute confirm sends only {shelfItemId} after a shelf choice', async () => {
    shelfMocks.list.mockResolvedValue({
      items: [{ id: SHELF_ITEM_ID, revision: 1, availability: 'available', manualName: 'Gentle Shampoo' }],
      nextCursor: null,
    });
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'substitute', stepId: 'step-1' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(shelfMocks.list).toHaveBeenCalled();
    expect(controller().shelfItems?.length).toBe(1);
    await act(async () => {
      controller().selectShelfItem(controller().shelfItems?.[0] as never);
      await Promise.resolve();
    });
    await act(async () => {
      controller().setReason('used what I own');
    });
    await act(async () => {
      controller().confirmArmed();
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect((command.command as { replacement: unknown }).replacement).toEqual({
      shelfItemId: SHELF_ITEM_ID,
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('pause, resume, and finish route through the same begin path', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().beginTransition({ kind: 'pause' });
      await Promise.resolve();
    });
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({ command: { kind: 'pause' } });
    await act(async () => {
      controller().beginTransition({ kind: 'resume' });
      await Promise.resolve();
    });
    expect(mocks.transition.mock.calls[1][0]).toMatchObject({ command: { kind: 'resume' } });
    expect(controller().terminal).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });
});

describe('protocol execution controller guards (Task 17)', () => {
  it('discards a load failure that arrives after an owner switch', async () => {
    let rejectFirst!: (error: unknown) => void;
    mocks.getActive.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectFirst = reject;
      }),
    );
    mocks.getActive.mockResolvedValue(null);
    const renderer = await mount(readyDecision(), OWNER);
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OTHER_OWNER, decision: readyDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      rejectFirst(new Error('Network request failed'));
      await Promise.resolve();
    });
    expect(controller().ui.phase).toBe('idle');
    expect(controller().ownerMatches).toBe(true);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('ignores a reload request outside the load-failed phase', async () => {
    const renderer = await mount();
    expect(controller().ui.phase).toBe('idle');
    await act(async () => {
      await controller().handleReload();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(controller().ui.phase).toBe('idle');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('ignores a retry with nothing pending and a transition outside ready', async () => {
    const renderer = await mount();
    expect(controller().ui.phase).toBe('idle');
    await act(async () => {
      await controller().handleRetry();
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      controller().beginTransition({ kind: 'pause' });
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      controller().confirmArmed();
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('routes a start-failure retry through the saved start request', async () => {
    mocks.start.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    expect(controller().ui.phase).toBe('save_failed');
    const first = mocks.start.mock.calls[0][0] as Record<string, unknown>;
    mocks.start.mockClear();
    await act(async () => {
      await controller().handleRetry();
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const retry = mocks.start.mock.calls[0][0] as Record<string, unknown>;
    expect(retry.operationId).toBe(first.operationId);
    expect(controller().ui.phase).toBe('ready');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records a repeated start failure as a fresh honest error', async () => {
    mocks.start.mockRejectedValueOnce(new Error('connection reset'));
    mocks.start.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    expect(controller().ui.phase).toBe('save_failed');
    await act(async () => {
      await controller().handleStart();
    });
    expect(controller().ui.phase).toBe('save_failed');
    expect(mocks.start).toHaveBeenCalledTimes(2);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards a late start rejection after the owner changes', async () => {
    let rejectStart!: (error: unknown) => void;
    mocks.start.mockImplementationOnce(
      () => new Promise((_, reject) => {
        rejectStart = reject;
      }),
    );
    const renderer = await mount();
    let pendingStart!: Promise<void>;
    await act(async () => {
      pendingStart = controller().handleStart();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OTHER_OWNER, decision: readyDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      rejectStart(new Error('connection reset'));
      await pendingStart;
      await Promise.resolve();
    });
    expect(controller().ui.phase).toBe('idle');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('drops a second synchronous begin while the first owns the pending guard', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    mocks.transition.mockClear();
    await act(async () => {
      controller().beginTransition({ kind: 'pause' });
      controller().beginTransition({ kind: 'resume' });
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({ command: { kind: 'pause' } });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requires detail before confirming a modification', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'modify', stepId: 'step-2' });
    });
    await act(async () => {
      controller().setReason('less time today');
    });
    await act(async () => {
      controller().confirmArmed();
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(controller().formError).not.toBeNull();
    await act(async () => {
      controller().setDetail('rinsed sooner');
    });
    await act(async () => {
      controller().confirmArmed();
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('confirms nothing for a step flow armed without an execution', async () => {
    const renderer = await mount();
    expect(controller().execution).toBeNull();
    await act(async () => {
      controller().arm({ flow: 'skip', stepId: 'step-1' });
    });
    await act(async () => {
      controller().setReason('ran out of time');
    });
    await act(async () => {
      controller().confirmArmed();
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards shelf results that settle after the picker is disarmed', async () => {
    let releaseList!: (value: { items: never[]; nextCursor: null }) => void;
    shelfMocks.list.mockImplementationOnce(
      () => new Promise(resolve => {
        releaseList = resolve;
      }),
    );
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'substitute', stepId: 'step-1' });
      await Promise.resolve();
    });
    await act(async () => {
      controller().cancelArmed();
    });
    await act(async () => {
      releaseList({ items: [], nextCursor: null });
      await Promise.resolve();
    });
    expect(controller().shelfItems).toBeNull();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows a shelf load failure without recording anything', async () => {
    shelfMocks.list.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'substitute', stepId: 'step-1' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller().shelfError).not.toBeNull();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards a shelf detail rejection like every other late async result', async () => {
    shelfMocks.list.mockResolvedValue({
      items: [{ id: SHELF_ITEM_ID, revision: 1, availability: 'available', manualName: 'Gentle Shampoo' }],
      nextCursor: null,
    });
    shelfMocks.detail.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'substitute', stepId: 'step-1' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      controller().selectShelfItem(controller().shelfItems?.[0] as never);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(controller().shelfDetail).toBeNull();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requires a reason before confirming an abandon', async () => {
    const renderer = await mount();
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'abandon' });
    });
    await act(async () => {
      controller().confirmArmed();
    });
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(controller().formError).not.toBeNull();
    await act(async () => {
      controller().setReason('no time left');
    });
    await act(async () => {
      controller().confirmArmed();
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({
      command: { kind: 'abandon', reason: 'no time left' },
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards a shelf detail that arrives after an owner switch', async () => {
    let releaseDetail!: (value: unknown) => void;
    shelfMocks.list.mockResolvedValue({
      items: [{ id: SHELF_ITEM_ID, revision: 1, availability: 'available', manualName: 'Gentle Shampoo' }],
      nextCursor: null,
    });
    shelfMocks.detail.mockImplementationOnce(
      () => new Promise(resolve => {
        releaseDetail = resolve;
      }),
    );
    const renderer = await mount(readyDecision(), OWNER);
    await act(async () => {
      await controller().handleStart();
    });
    await act(async () => {
      controller().arm({ flow: 'substitute', stepId: 'step-1' });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      controller().selectShelfItem(controller().shelfItems?.[0] as never);
      await Promise.resolve();
    });
    mocks.getActive.mockResolvedValue(null);
    await act(async () => {
      renderer.update(createElement(Probe, { ownerId: OTHER_OWNER, decision: readyDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      releaseDetail(null);
      await Promise.resolve();
    });
    expect(controller().shelfDetail).toBeNull();
    await act(async () => {
      renderer.unmount();
    });
  });
});

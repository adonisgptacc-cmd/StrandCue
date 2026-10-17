import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyExecutionCommand } from '../../packages/domain/src/index.ts';
import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';
import { ProtocolExecution } from '../../apps/mobile/src/ProtocolExecution';
import {
  CHECK_IN_START_LABEL,
  EXECUTION_ABANDON_LABEL,
  EXECUTION_CONFIRM_STOP_LABEL,
  EXECUTION_REASON_ABANDON_LABEL,
  EXECUTION_RESUME_LABEL,
  EXECUTION_RETRY_LABEL,
  EXECUTION_SAVE_FAILED,
  START_OVER_LABEL,
} from '../../apps/mobile/src/guidance/guidance-copy';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  recordRun: vi.fn(),
  executionStart: vi.fn(),
  executionTransition: vi.fn(),
  executionGetActive: vi.fn(),
  restoreAggregate: vi.fn(),
  uuidCounter: { value: 0 },
  server: { execution: null as unknown, revision: 0 },
}));

vi.mock('react-native', () => {
  const host = (tag: string) => {
    function HostComponent({ children, ...props }: { children?: unknown } & Record<string, unknown>) {
      return createElement(tag, props, children as never);
    }
    HostComponent.displayName = `Mock${tag}`;
    return HostComponent;
  };
  return {
    Platform: { OS: 'web' },
    Pressable: host('button'),
    ScrollView: host('main'),
    StyleSheet: { create: (value: unknown) => value },
    Text: host('span'),
    TextInput: host('input'),
    View: host('div'),
  };
});

vi.mock('expo-crypto', () => ({
  randomUUID: () => {
    mocks.uuidCounter.value += 1;
    return `00000000-0000-4000-8000-${String(mocks.uuidCounter.value).padStart(12, '0')}`;
  },
}));

vi.mock('../../apps/mobile/src/guidance/today-guidance-service', () => ({
  generateTodayGuidance: mocks.generate,
}));

vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({
  recordRecommendationRun: mocks.recordRun,
}));

vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: mocks.executionStart,
  transitionProtocolExecution: mocks.executionTransition,
  getActiveProtocolExecution: mocks.executionGetActive,
  getActiveExecutionWithDecision: mocks.restoreAggregate,
}));

vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: vi.fn(async () => ({ items: [], nextCursor: null })),
  getUserProduct: vi.fn(async () => null),
}));

const OWNER = 'owner-1';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';
const T0 = '2026-10-13T12:00:00+02:00';
const FINGERPRINT = 'a'.repeat(64);

function storedDecision() {
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
      evaluatedRules: [],
      conflicts: [],
      rankedCandidates: [],
      rejectedCandidates: [],
      restrictions: [],
      missingInputs: [],
    },
  };
}

function executionSnapshot(overrides: Record<string, unknown> = {}) {
  const pending = (stepId: string, position: number) => ({
    stepId,
    position,
    planned: {
      stepId,
      position,
      action: stepId === 'step-1' ? 'apply' : 'rinse',
      productId: null,
      productVersionId: null,
      toolId: null,
      toolVersionId: null,
      waitSeconds: null,
      rinse: stepId === 'step-1' ? null : true,
      reasons: ['rule a@1 requires it'],
    },
    state: 'pending',
    confirmedAt: null,
    deviation: null,
  });
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    startedAt: T0,
    updatedAt: T0,
    status: 'paused',
    steps: [pending('step-1', 1), pending('step-2', 2)],
    finishedAt: null,
    closeReason: null,
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    status: 'paused',
    revision: 2,
    updatedAt: T0,
    createdAt: T0,
    execution: executionSnapshot(),
    ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    requestId: RUN_ID,
    inputFingerprint: FINGERPRINT,
    asOf: T0,
    engineVersion: '1',
    bundleId: 'bundle-synthetic',
    bundleVersion: '1',
    status: 'ready',
    input: { requestId: RUN_ID },
    decision: storedDecision(),
    trusted: true,
    createdAt: T0,
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  const decision = storedDecision();
  return {
    execution: receipt(),
    run: runRow({ decision }),
    storedDecision: decision,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

function hasButton(renderer: ReactTestRenderer, label: string): boolean {
  return (
    renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityLabel === label,
    ).length > 0
  );
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === label,
  );
}

function field(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'input' && node.props.accessibilityLabel === label,
  );
}

async function flush(rounds = 5): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

async function settle(renderer: ReactTestRenderer, rounds = 10): Promise<void> {
  await act(async () => {
    await flush(rounds);
  });
  await act(async () => {
    await flush(rounds);
  });
}

async function mountToday(ownerId: string = OWNER): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayGuidance, { ownerId, onNavigate: (() => undefined) as never }),
    );
    await flush();
  });
  await settle(renderer);
  return renderer;
}

async function mountRestored(): Promise<ReactTestRenderer> {
  mocks.restoreAggregate.mockResolvedValue(bundle());
  mocks.executionGetActive.mockResolvedValue(receipt());
  const renderer = await mountToday();
  expect(text(renderer)).toContain('step 1');
  return renderer;
}

async function armAbandon(renderer: ReactTestRenderer): Promise<void> {
  await act(async () => {
    button(renderer, EXECUTION_ABANDON_LABEL).props.onPress();
    await flush();
  });
  await act(async () => {
    field(renderer, EXECUTION_REASON_ABANDON_LABEL).props.onChangeText('no time left');
    await flush();
  });
}

function installFakeTransitionServer(): void {
  mocks.server.execution = executionSnapshot();
  mocks.server.revision = 2;
  mocks.executionTransition.mockImplementation(async (command: unknown) => {
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
    const status = (mocks.server.execution as { status: string }).status;
    const snapshot = mocks.server.execution as Record<string, unknown>;
    return {
      executionId: EXECUTION_ID,
      recommendationRunId: RUN_ID,
      status,
      revision: mocks.server.revision,
      updatedAt: parsed.at,
      createdAt: T0,
      execution: snapshot,
    };
  });
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
afterAll(() => { consoleErrorSpy.mockRestore(); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uuidCounter.value = 0;
  mocks.generate.mockResolvedValue({ status: 'content_pending' });
  mocks.recordRun.mockResolvedValue({ requestId: RUN_ID });
  mocks.restoreAggregate.mockResolvedValue(null);
  mocks.executionGetActive.mockResolvedValue(null);
  installFakeTransitionServer();
});

describe('fix G: no unaudited local-dismiss path over a live restored execution', () => {
  it('offers no start-over dismiss while the restored execution is active', async () => {
    const renderer = await mountRestored();
    expect(hasButton(renderer, EXECUTION_ABANDON_LABEL)).toBe(true);
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('returns to idle only after the server confirms terminal abandoned status', async () => {
    const renderer = await mountRestored();
    const gate = deferred<unknown>();
    mocks.executionTransition.mockImplementationOnce(() => gate.promise);
    await armAbandon(renderer);
    await act(async () => {
      button(renderer, EXECUTION_CONFIRM_STOP_LABEL).props.onPress();
      await flush();
    });
    // The audited abandonment reuses the dispatcher + transition RPC with an
    // op id, revision, and bounded command — never a client-built snapshot.
    expect(mocks.executionTransition).toHaveBeenCalledTimes(1);
    const wire = mocks.executionTransition.mock.calls[0][0] as Record<string, unknown>;
    expect(wire).toMatchObject({
      command: { kind: 'abandon', reason: 'no time left' },
      expectedRevision: 2,
    });
    expect(wire).not.toHaveProperty('result');
    expect(wire).not.toHaveProperty('execution');
    // While the server has not answered, the execution stays visible and no
    // fresh check-in is exposed — the optimistic preview must not return.
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    // The server confirms terminal abandoned status via receipt.
    await act(async () => {
      gate.resolve({
        executionId: EXECUTION_ID,
        recommendationRunId: RUN_ID,
        status: 'abandoned',
        revision: 3,
        updatedAt: T0,
        createdAt: T0,
        execution: executionSnapshot({ status: 'abandoned', finishedAt: T0, closeReason: 'no time left' }),
      });
      await flush(10);
    });
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(text(renderer)).not.toContain('step 1');
    // Nothing generated, recorded, or started a second execution.
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    expect(mocks.executionTransition).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the active execution visible when abandonment hits a revision conflict', async () => {
    const renderer = await mountRestored();
    mocks.executionTransition.mockRejectedValueOnce(new Error('revision-conflict'));
    await armAbandon(renderer);
    await act(async () => {
      button(renderer, EXECUTION_CONFIRM_STOP_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    expect(text(renderer)).toContain('something changed while saving');
    expect(hasButton(renderer, EXECUTION_RETRY_LABEL)).toBe(true);
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    // An honest retry reuses the same operation id and then returns to idle
    // once the server confirms the terminal receipt.
    await act(async () => {
      button(renderer, EXECUTION_RETRY_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('keeps the active execution visible when abandonment fails offline', async () => {
    const renderer = await mountRestored();
    mocks.executionTransition.mockRejectedValueOnce(new Error('Network request failed'));
    await armAbandon(renderer);
    await act(async () => {
      button(renderer, EXECUTION_CONFIRM_STOP_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    expect(text(renderer)).toContain(EXECUTION_SAVE_FAILED.toLowerCase().slice(0, 24));
    expect(hasButton(renderer, EXECUTION_RETRY_LABEL)).toBe(true);
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('fires the terminal-abandon callback only after the authoritative receipt', async () => {
    const onTerminalAbandoned = vi.fn();
    mocks.executionGetActive.mockResolvedValue(receipt());
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(ProtocolExecution, {
          ownerId: OWNER,
          decision: storedDecision() as never,
          onTerminalAbandoned,
        }),
      );
      await flush();
    });
    await settle(renderer);
    // A non-terminal transition never fires the callback.
    await act(async () => {
      button(renderer, EXECUTION_RESUME_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    expect(onTerminalAbandoned).not.toHaveBeenCalled();
    // Arming + confirming abandonment paints the optimistic preview first:
    // abandoned on screen, but the server has not answered — still silent.
    const gate = deferred<unknown>();
    mocks.executionTransition.mockImplementationOnce(() => gate.promise);
    await act(async () => {
      button(renderer, EXECUTION_ABANDON_LABEL).props.onPress();
      await flush();
    });
    await act(async () => {
      field(renderer, EXECUTION_REASON_ABANDON_LABEL).props.onChangeText('no time left');
      await flush();
    });
    await act(async () => {
      button(renderer, EXECUTION_CONFIRM_STOP_LABEL).props.onPress();
      await flush();
    });
    expect(text(renderer)).toContain('stopped');
    expect(onTerminalAbandoned).not.toHaveBeenCalled();
    // Only the authoritative server receipt fires, exactly once.
    await act(async () => {
      gate.resolve({
        executionId: EXECUTION_ID,
        recommendationRunId: RUN_ID,
        status: 'abandoned',
        revision: 3,
        updatedAt: T0,
        createdAt: T0,
        execution: executionSnapshot({ status: 'abandoned', finishedAt: T0, closeReason: 'no time left' }),
      });
      await flush(10);
    });
    await settle(renderer);
    expect(onTerminalAbandoned).toHaveBeenCalledTimes(1);
    expect(onTerminalAbandoned.mock.calls[0][0]).toMatchObject({
      executionId: EXECUTION_ID,
      status: 'abandoned',
    });
    // A re-render over the same confirmed receipt never refires.
    await act(async () => {
      renderer.update(
        createElement(ProtocolExecution, {
          ownerId: OWNER,
          decision: storedDecision() as never,
          onTerminalAbandoned,
        }),
      );
      await flush(10);
    });
    await settle(renderer);
    expect(onTerminalAbandoned).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});

describe('fix H carried hardening: the terminal-abandon signal is execution- and owner-scoped', () => {
  const OTHER_EXECUTION_ID = '33333333-3333-4333-8333-333333333333';

  it('does not release the restored run for a terminal receipt of another execution', async () => {
    const renderer = await mountRestored();
    // The server answers the abandonment with a terminal receipt for a
    // DIFFERENT execution (a mismatched or foreign reply). The execution the
    // user restored is still live server-side, so the screen must not fall
    // back to a fresh check-in on the strength of someone else's abandonment.
    mocks.executionTransition.mockImplementationOnce(async () => ({
      executionId: OTHER_EXECUTION_ID,
      recommendationRunId: RUN_ID,
      status: 'abandoned',
      revision: 9,
      updatedAt: T0,
      createdAt: T0,
      execution: executionSnapshot({
        executionId: OTHER_EXECUTION_ID,
        status: 'abandoned',
        finishedAt: T0,
        closeReason: 'other',
      }),
    }));
    await armAbandon(renderer);
    await act(async () => {
      button(renderer, EXECUTION_CONFIRM_STOP_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    // Still bound to the restored execution: no fresh check-in is offered.
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('never notifies for a previous owner execution once the owner changes', async () => {
    const onTerminalAbandoned = vi.fn();
    // Seed the surface with the previous owner's already-abandoned execution
    // through the validated restore receipt (no second active read).
    const abandonedSeed = executionSnapshot({
      status: 'abandoned',
      finishedAt: T0,
      closeReason: 'no time left',
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        createElement(ProtocolExecution, {
          ownerId: OWNER,
          decision: storedDecision() as never,
          initialExecution: abandonedSeed as never,
          initialRevision: 7,
        }),
      );
      await flush();
    });
    await settle(renderer);
    expect(mocks.executionGetActive).not.toHaveBeenCalled();
    expect(onTerminalAbandoned).not.toHaveBeenCalled();
    // The owner changes while the previous owner's abandoned execution is
    // still on screen: the reset lands in an effect, a commit later. A
    // notification raised on that commit would release the NEW owner's
    // restored context on the strength of the OLD owner's execution.
    mocks.executionGetActive.mockResolvedValue(null);
    await act(async () => {
      renderer.update(
        createElement(ProtocolExecution, {
          ownerId: 'owner-2',
          decision: storedDecision() as never,
          onTerminalAbandoned,
        }),
      );
      await flush(10);
    });
    await settle(renderer);
    expect(onTerminalAbandoned).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});

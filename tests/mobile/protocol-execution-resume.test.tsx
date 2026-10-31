import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolDecision } from '../../packages/domain/src/index.ts';
import { ProtocolExecution } from '../../apps/mobile/src/ProtocolExecution.tsx';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  transition: vi.fn(),
  getActive: vi.fn(),
  uuidCounter: { value: 0 },
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
const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const EXECUTION_ID = '22222222-2222-4222-8222-222222222222';

function readyDecision(): ProtocolDecision {
  return {
    status: 'ready',
    requestId: RUN_ID,
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
      requestId: RUN_ID,
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

function executionFixture(overrides: Record<string, unknown> = {}) {
  return {
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    startedAt: T0,
    updatedAt: T0,
    status: 'in_progress',
    steps: [pendingStep('step-1', 1, 'apply'), pendingStep('step-2', 2, 'rinse')],
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

function confirmedExecutionFixture() {
  return executionFixture({
    updatedAt: T1,
    steps: [
      {
        ...pendingStep('step-1', 1, 'apply'),
        state: 'confirmed',
        confirmedAt: T1,
      },
      pendingStep('step-2', 2, 'rinse'),
    ],
  });
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

async function render(
  decision: ProtocolDecision = readyDecision(),
  ownerId: string = OWNER,
): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ProtocolExecution, { ownerId, decision }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer;
}

async function press(renderer: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    button(renderer, label).props.onPress();
    await Promise.resolve();
    await Promise.resolve();
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
afterAll(() => {
  consoleErrorSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.uuidCounter.value = 0;
  mocks.getActive.mockResolvedValue(null);
  mocks.start.mockResolvedValue(receiptFixture());
});

describe('protocol execution resume (MB-001)', () => {
  it('loads the owner active execution on mount instead of offering a fresh start', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render();
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(text(renderer)).toContain('planned steps');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('resumes in-progress state at the authoritative revision after a restart', async () => {
    mocks.getActive.mockResolvedValue(
      receiptFixture({ revision: 1, execution: confirmedExecutionFixture() }),
    );
    const renderer = await render();
    const rendered = text(renderer);
    expect(rendered).toContain('planned steps');
    expect(rendered).toContain('done step 1');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows the idle start card unchanged when no execution is active', async () => {
    mocks.getActive.mockResolvedValue(null);
    const renderer = await render();
    expect(text(renderer)).toContain('start this plan');
    await press(renderer, 'Start this plan');
    expect(mocks.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows a completed execution as finished with no fresh start over it', async () => {
    mocks.getActive.mockResolvedValue(
      receiptFixture({
        status: 'completed',
        revision: 3,
        execution: executionFixture({
          status: 'completed',
          finishedAt: T1,
          updatedAt: T1,
          closeReason: null,
        }),
      }),
    );
    const renderer = await render();
    expect(text(renderer)).toContain('completed');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    expect(hasButton(renderer, 'Mark done: Step 1')).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows an honest error for a malformed receipt and never a partial render', async () => {
    mocks.getActive.mockResolvedValue({ executionId: EXECUTION_ID });
    const renderer = await render();
    const rendered = text(renderer);
    expect(rendered).toContain('could not be verified');
    expect(rendered).not.toContain('planned steps');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('refuses an execution built from a different recommendation run', async () => {
    mocks.getActive.mockResolvedValue(
      receiptFixture({
        recommendationRunId: '99999999-9999-4999-8999-999999999999',
        execution: executionFixture({
          recommendationRunId: '99999999-9999-4999-8999-999999999999',
        }),
      }),
    );
    const renderer = await render();
    const rendered = text(renderer);
    expect(rendered).toContain('could not be verified');
    expect(rendered).not.toContain('planned steps');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows an explicit offline state with retry on transport failure', async () => {
    mocks.getActive.mockRejectedValueOnce(new Error('Network request failed'));
    const renderer = await render();
    expect(text(renderer)).toContain('offline');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    mocks.getActive.mockResolvedValue(null);
    await press(renderer, 'Try again');
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(text(renderer)).toContain('start this plan');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards a late load response after the owner changes and loads the new owner', async () => {
    let releaseOwner1!: (value: unknown) => void;
    mocks.getActive.mockImplementationOnce(
      () => new Promise(resolve => {
        releaseOwner1 = resolve;
      }),
    );
    mocks.getActive.mockResolvedValue(null);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ProtocolExecution, { ownerId: OWNER, decision: readyDecision() }));
      await Promise.resolve();
    });
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: OTHER_OWNER, decision: readyDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(text(renderer)).toContain('start this plan');
    await act(async () => {
      releaseOwner1(receiptFixture());
      await Promise.resolve();
      await Promise.resolve();
    });
    const rendered = text(renderer);
    expect(rendered).toContain('start this plan');
    expect(rendered).not.toContain('planned steps');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('retries a failed load with the same idempotent read and resumes when it succeeds', async () => {
    mocks.getActive.mockRejectedValueOnce(new Error('Network request failed'));
    const renderer = await render();
    expect(text(renderer)).toContain('offline');
    mocks.getActive.mockResolvedValueOnce(receiptFixture());
    await press(renderer, 'Try again');
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(text(renderer)).toContain('planned steps');
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });
});

const RUN_B = '33333333-3333-4333-8333-333333333333';
const EXECUTION_B = '44444444-4444-4444-8444-444444444444';

function alternateDecision(): ProtocolDecision {
  const base = readyDecision();
  return {
    ...base,
    requestId: RUN_B,
    steps: [
      { ...(base.steps[0] as object), stepId: 'step-1', position: 1, action: 'cleanse' },
      { ...(base.steps[1] as object), stepId: 'step-2', position: 2, action: 'condition' },
    ],
    audit: { ...(base.audit as object), requestId: RUN_B },
  } as unknown as ProtocolDecision;
}

function executionBFixture(overrides: Record<string, unknown> = {}) {
  return executionFixture({
    executionId: EXECUTION_B,
    recommendationRunId: RUN_B,
    steps: [pendingStep('step-1', 1, 'cleanse'), pendingStep('step-2', 2, 'condition')],
    ...overrides,
  });
}

function receiptBFixture(overrides: Record<string, unknown> = {}) {
  return receiptFixture({
    executionId: EXECUTION_B,
    recommendationRunId: RUN_B,
    execution: executionBFixture(),
    ...overrides,
  });
}

async function updateDecision(renderer: ReactTestRenderer, decision: ProtocolDecision): Promise<void> {
  await act(async () => {
    renderer.update(createElement(ProtocolExecution, { ownerId: OWNER, decision }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('protocol execution decision swap (Task 15 fix round 1)', () => {
  it('reloads and re-validates when the decision changes to a new run', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render(readyDecision(), OWNER);
    expect(text(renderer)).toContain('apply');
    mocks.getActive.mockResolvedValue(receiptBFixture());
    await updateDecision(renderer, alternateDecision());
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    const rendered = text(renderer);
    expect(rendered).toContain('planned steps');
    expect(rendered).toContain('cleanse');
    expect(rendered).not.toContain('apply');
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('never paints the stale run while a decision-swap reload is in flight', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    mocks.getActive.mockImplementation(
      () => new Promise(resolve => {
        resolvers.push(resolve);
      }),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(createElement(ProtocolExecution, { ownerId: OWNER, decision: readyDecision() }));
      await Promise.resolve();
    });
    expect(resolvers).toHaveLength(1);
    const resolveMount = resolvers[0] as (value: unknown) => void;
    await act(async () => {
      resolveMount(receiptFixture());
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('apply');
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: OWNER, decision: alternateDecision() }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const midFlight = text(renderer);
    expect(midFlight).toContain('checking for a saved plan');
    expect(midFlight).not.toContain('planned steps');
    expect(midFlight).not.toContain('apply');
    expect(resolvers).toHaveLength(2);
    const resolveSwap = resolvers[1] as (value: unknown) => void;
    await act(async () => {
      resolveSwap(receiptBFixture());
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('cleanse');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('does not reload when the same decision re-renders', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render(readyDecision(), OWNER);
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    await updateDecision(renderer, readyDecision());
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(text(renderer)).toContain('apply');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('targets post-swap transitions at the validated run and revision', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render(readyDecision(), OWNER);
    mocks.getActive.mockResolvedValue(receiptBFixture({ revision: 2, execution: executionBFixture() }));
    await updateDecision(renderer, alternateDecision());
    expect(text(renderer)).toContain('cleanse');
    mocks.transition.mockResolvedValue(receiptBFixture({ revision: 3 }));
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({
      executionId: EXECUTION_B,
      expectedRevision: 2,
      command: { kind: 'complete-step', stepId: 'step-1' },
    });
    await act(async () => {
      renderer.unmount();
    });
  });
});

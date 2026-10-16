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

import { createElement, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolDecision } from '../../packages/domain/src/index.ts';
import { applyExecutionCommand } from '../../packages/domain/src/index.ts';
import { ProtocolExecution } from '../../apps/mobile/src/ProtocolExecution.tsx';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  transition: vi.fn(),
  getActive: vi.fn(),
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
const T0 = '2026-10-13T12:00:00+02:00';
const SHELF_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const RUN_B = '33333333-3333-4333-8333-333333333333';

function readyDecision(requestId = '11111111-1111-4111-8111-111111111111'): ProtocolDecision {
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

function executionFixture(overrides: Record<string, unknown> = {}) {
  return {
    executionId: '22222222-2222-4222-8222-222222222222',
    recommendationRunId: '11111111-1111-4111-8111-111111111111',
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
    executionId: '22222222-2222-4222-8222-222222222222',
    recommendationRunId: '11111111-1111-4111-8111-111111111111',
    status: 'in_progress',
    revision: 0,
    updatedAt: T0,
    createdAt: T0,
    execution: executionFixture(),
    ...overrides,
  };
}

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON()).toLowerCase();
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'button' && node.props.accessibilityLabel === label,
  );
}

function hasButton(renderer: ReactTestRenderer, label: string): boolean {
  return (
    renderer.root.findAll(
      node => node.type === 'button' && node.props.accessibilityLabel === label,
    ).length > 0
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
  });
}

async function start(renderer: ReactTestRenderer): Promise<void> {
  mocks.start.mockResolvedValue(receiptFixture());
  await press(renderer, 'Start this plan');
  await act(async () => {
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
  shelfMocks.list.mockResolvedValue({
    items: [{ id: SHELF_ITEM_ID, revision: 1, availability: 'available', manualName: 'Gentle Shampoo' }],
    nextCursor: null,
  });
  shelfMocks.detail.mockResolvedValue({
    id: SHELF_ITEM_ID,
    revision: 1,
    availability: 'available',
    matched: true,
    matchConfirmed: true,
    manualName: 'Gentle Shampoo',
    versionId: '96759932-6d87-56c2-8165-8f95260447f4',
    revisions: [],
  });
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
    return receiptFixture({
      revision: mocks.server.revision,
      status: (mocks.server.execution as { status: string }).status,
      execution: mocks.server.execution,
    });
  });
});

describe('protocol execution characterization (Task 17 pre-split pins)', () => {
  it('mount loads once, renders neutral loading then the idle start card, and records nothing', async () => {
    const renderer = await render();
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(text(renderer)).toContain('start this plan');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('resume: a saved server execution paints with no start call', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render();
    expect(text(renderer)).toContain('planned steps');
    expect(hasButton(renderer, 'Start this plan')).toBe(false);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('transition: confirm records a bounded command with no client snapshot', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Mark done: Step 1');
    expect(mocks.transition).not.toHaveBeenCalled();
    await press(renderer, 'Confirm done: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({
      command: { kind: 'complete-step', stepId: 'step-1' },
      expectedRevision: 0,
    });
    expect(command).not.toHaveProperty('result');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('error: a failed transition keeps op-idempotent retry and maps the stable code to copy', async () => {
    const renderer = await render();
    await start(renderer);
    mocks.transition.mockRejectedValueOnce(new Error('revision-conflict'));
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    expect(text(renderer)).toContain('could not be saved');
    expect(text(renderer)).toContain('latest confirmed record');
    expect(text(renderer)).not.toContain('revision-conflict');
    mocks.transition.mockClear();
    await press(renderer, 'Retry save');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect((mocks.transition.mock.calls[0][0] as Record<string, unknown>).operationId).toBe(
      '00000000-0000-4000-8000-000000000003',
    );
    await act(async () => {
      renderer.unmount();
    });
  });

  it('owner-switch one-frame: the first post-switch commit never paints the previous owner execution', async () => {
    const snapshots: string[] = [];
    let probeRenderer: ReactTestRenderer | null = null;
    function OwnerProbe({ ownerId, decision, onCommit }: {
      readonly ownerId: string;
      readonly decision: ProtocolDecision;
      readonly onCommit: () => void;
    }) {
      useLayoutEffect(() => {
        onCommit();
      }, [ownerId, onCommit]);
      return createElement(ProtocolExecution, { ownerId, decision });
    }
    const handleCommit = () => {
      if (probeRenderer !== null) {
        snapshots.push(JSON.stringify(probeRenderer.toJSON()).toLowerCase());
      }
    };
    await act(async () => {
      probeRenderer = create(
        createElement(OwnerProbe, { ownerId: OWNER, decision: readyDecision(), onCommit: handleCommit }),
      );
      await Promise.resolve();
    });
    if (probeRenderer === null) throw new Error('expected the probe surface to mount');
    const renderer: ReactTestRenderer = probeRenderer;
    await start(renderer);
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    expect(text(renderer)).toContain('done step 1');
    snapshots.length = 0;
    await act(async () => {
      renderer.update(
        createElement(OwnerProbe, { ownerId: 'owner-2', decision: readyDecision(), onCommit: handleCommit }),
      );
      await Promise.resolve();
    });
    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0] ?? '').not.toContain('done step 1');
    expect(snapshots[0] ?? '').toContain('start this plan');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('decision-swap: a new requestId reloads and re-validates; the same requestId never reloads', async () => {
    mocks.getActive.mockResolvedValue(receiptFixture());
    const renderer = await render(readyDecision(), OWNER);
    expect(text(renderer)).toContain('apply');
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: OWNER, decision: readyDecision() }));
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    const swapped = readyDecision(RUN_B);
    mocks.getActive.mockResolvedValue(receiptFixture({
      recommendationRunId: RUN_B,
      execution: executionFixture({ recommendationRunId: RUN_B }),
    }));
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: OWNER, decision: swapped }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getActive).toHaveBeenCalledTimes(2);
    expect(mocks.start).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('substitute: the wire replacement carries only {shelfItemId}', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Substitute: Step 1');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await press(renderer, `Use shelf item ${SHELF_ITEM_ID}`);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      renderer.root.find(
        node => node.type === 'input' && node.props.accessibilityLabel === 'Reason for substituting',
      ).props.onChangeText('used what I own');
      await Promise.resolve();
    });
    await press(renderer, 'Confirm substitution: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect((command.command as { replacement: unknown }).replacement).toEqual({
      shelfItemId: SHELF_ITEM_ID,
    });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('terminal: a completed execution shows finished state with no action controls', async () => {
    mocks.getActive.mockResolvedValue(
      receiptFixture({
        status: 'completed',
        revision: 3,
        execution: executionFixture({ status: 'completed', finishedAt: T0, updatedAt: T0 }),
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
});

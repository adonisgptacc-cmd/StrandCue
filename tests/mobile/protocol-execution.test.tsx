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
const T1 = '2026-10-13T12:05:00+02:00';
const SHELF_ITEM_ID = '66666666-6666-4666-8666-666666666666';
const SHELF_VERSION_ID = '96759932-6d87-56c2-8165-8f95260447f4';

function shelfListFixture() {
  return {
    items: [
      { id: SHELF_ITEM_ID, revision: 1, availability: 'available', manualName: 'Gentle Shampoo' },
    ],
    nextCursor: null,
  };
}

function shelfDetailFixture() {
  return {
    id: SHELF_ITEM_ID,
    revision: 1,
    availability: 'available',
    matched: true,
    matchConfirmed: true,
    manualName: 'Gentle Shampoo',
    versionId: SHELF_VERSION_ID,
    revisions: [],
  };
}

function readyDecision(): ProtocolDecision {
  return {
    status: 'ready',
    requestId: '11111111-1111-4111-8111-111111111111',
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
      requestId: '11111111-1111-4111-8111-111111111111',
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

function input(renderer: ReactTestRenderer, label: string) {
  return renderer.root.find(
    node => node.type === 'input' && node.props.accessibilityLabel === label,
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

async function type(renderer: ReactTestRenderer, label: string, value: string): Promise<void> {
  await act(async () => {
    input(renderer, label).props.onChangeText(value);
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

async function flushShelf(): Promise<void> {
  await act(async () => {
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
  shelfMocks.list.mockResolvedValue(shelfListFixture());
  shelfMocks.detail.mockResolvedValue(shelfDetailFixture());
  // The fake server constructs the authoritative snapshot from the bounded
  // command (mirroring the database core) and never accepts a client
  // snapshot: the command carries no `result`, so the mock applies the
  // domain transition to its own stored execution instead of echoing one.
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

describe('protocol execution surface', () => {
  it('mounts, checks for a saved plan, then renders the idle start card', async () => {
    const renderer = await render();
    expect(mocks.getActive).toHaveBeenCalledTimes(1);
    expect(text(renderer)).toContain('start this plan');
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('starts only on an explicit start tap', async () => {
    const renderer = await render();
    expect(mocks.start).not.toHaveBeenCalled();
    await start(renderer);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const command = mocks.start.mock.calls[0][0] as Record<string, unknown>;
    expect(command.recommendationRunId).toBe('11111111-1111-4111-8111-111111111111');
    expect(command).not.toHaveProperty('decision');
    expect(text(renderer)).toContain('planned steps');
    expect(text(renderer)).toContain('actually done');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('viewing steps after start performs no further API calls', async () => {
    const renderer = await render();
    await start(renderer);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: OWNER, decision: readyDecision() }));
      await Promise.resolve();
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records a completed step only after confirmation', async () => {
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
    expect(text(renderer)).toContain('actually done');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('sends bounded command fields and never a client snapshot', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({
      command: { kind: 'complete-step', stepId: 'step-1' },
      expectedRevision: 0,
    });
    expect(command).not.toHaveProperty('result');
    expect(command).not.toHaveProperty('p_result');
    expect(typeof command.at).toBe('string');
    expect(typeof command.operationId).toBe('string');
    // The server-constructed receipt still confirms the step on screen.
    expect(text(renderer)).toContain('done step 1');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records nothing when a deviation is armed but never confirmed', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Skip: Step 1');
    await type(renderer, 'Reason for skipping', 'ran out of time');
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('nothing confirmed yet');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records a skip with its reason shown as record text', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Skip: Step 1');
    await type(renderer, 'Reason for skipping', 'ran out of time');
    await press(renderer, 'Confirm skip: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({
      command: { kind: 'skip-step', stepId: 'step-1', reason: 'ran out of time' },
    });
    expect(text(renderer)).toContain('ran out of time');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records a substitution naming an owned shelf item and no fact keys', async () => {
    // SC-004: the wire command carries an owned shelf-item id, never
    // free-form product ids plus self-asserted `owned: true`.
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Substitute: Step 1');
    await flushShelf();
    expect(shelfMocks.list).toHaveBeenCalled();
    await press(renderer, 'Use Gentle Shampoo (Available)');
    await flushShelf();
    await type(renderer, 'Reason for substituting', 'used what I own');
    await press(renderer, 'Confirm substitution: Step 1');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const command = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    expect(command).toMatchObject({
      command: {
        kind: 'substitute-step',
        stepId: 'step-1',
        reason: 'used what I own',
        replacement: { shelfItemId: SHELF_ITEM_ID },
      },
    });
    expect((command.command as { replacement: unknown }).replacement).toEqual({
      shelfItemId: SHELF_ITEM_ID,
    });
    const serialized = JSON.stringify(command);
    expect(serialized).not.toMatch(/facts|snapshot|profileFacts|historyFacts|environmentFacts/i);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('records a modification with its detail shown as record text', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Change: Step 2');
    await type(renderer, 'Reason for changing', 'less time today');
    await type(renderer, 'What changed', 'rinsed sooner');
    await press(renderer, 'Confirm change: Step 2');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({
      command: { kind: 'modify-step', stepId: 'step-2', reason: 'less time today', detail: 'rinsed sooner' },
    });
    expect(text(renderer)).toContain('rinsed sooner');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('pauses and resumes with confirmed transitions', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Pause this plan');
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({ command: { kind: 'pause' } });
    await press(renderer, 'Resume this plan');
    const resume = mocks.transition.mock.calls[1][0] as Record<string, unknown>;
    expect(resume).toMatchObject({ command: { kind: 'resume' }, expectedRevision: 1 });
    await act(async () => {
      renderer.unmount();
    });
  });

  it('abandons only after a confirmed reason', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Stop this plan');
    expect(mocks.transition).not.toHaveBeenCalled();
    await type(renderer, 'Reason for stopping', 'no time left');
    await press(renderer, 'Confirm stop');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    expect(mocks.transition.mock.calls[0][0]).toMatchObject({
      command: { kind: 'abandon', reason: 'no time left' },
    });
    expect(text(renderer)).toContain('no time left');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('retries a failed save with the same operation id', async () => {
    const renderer = await render();
    await start(renderer);
    mocks.transition.mockRejectedValueOnce(new Error('connection reset'));
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    expect(text(renderer)).toContain('could not be saved');
    expect(hasButton(renderer, 'Retry save')).toBe(true);
    mocks.transition.mockClear();
    await press(renderer, 'Retry save');
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    const retry = mocks.transition.mock.calls[0][0] as Record<string, unknown>;
    const firstOperation = '00000000-0000-4000-8000-000000000003';
    expect(retry.operationId).toBe(firstOperation);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows a start failure and retries with the same operation id', async () => {
    mocks.start.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await render();
    await press(renderer, 'Start this plan');
    await act(async () => {
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('could not be started');
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const first = mocks.start.mock.calls[0][0] as Record<string, unknown>;
    mocks.start.mockClear();
    await press(renderer, 'Start this plan');
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    const retry = mocks.start.mock.calls[0][0] as Record<string, unknown>;
    expect(retry.operationId).toBe(first.operationId);
    expect(retry.executionId).toBe(first.executionId);
    expect(text(renderer)).toContain('planned steps');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requires a reason before confirming a deviation', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Skip: Step 1');
    await press(renderer, 'Confirm skip: Step 1');
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('stays honest');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requires a shelf choice before confirming a substitution', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Substitute: Step 1');
    await flushShelf();
    await type(renderer, 'Reason for substituting', 'used what I own');
    await press(renderer, 'Confirm substitution: Step 1');
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('choose a product from your shelf');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('shows a shelf load failure without recording anything', async () => {
    shelfMocks.list.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Substitute: Step 1');
    await flushShelf();
    expect(text(renderer)).toContain('could not be loaded');
    await type(renderer, 'Reason for substituting', 'used what I own');
    await press(renderer, 'Confirm substitution: Step 1');
    expect(mocks.transition).not.toHaveBeenCalled();
    await act(async () => {
      renderer.unmount();
    });
  });

  it('cancels an armed flow without recording anything', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Change: Step 2');
    await press(renderer, 'Cancel');
    expect(mocks.transition).not.toHaveBeenCalled();
    expect(hasButton(renderer, 'Confirm change: Step 2')).toBe(false);
    expect(text(renderer)).toContain('nothing confirmed yet');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('finishes only after every step is handled and then stops offering controls', async () => {
    const renderer = await render();
    await start(renderer);
    expect(hasButton(renderer, 'Finish plan')).toBe(false);
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    await press(renderer, 'Mark done: Step 2');
    await press(renderer, 'Confirm done: Step 2');
    expect(hasButton(renderer, 'Finish plan')).toBe(true);
    await press(renderer, 'Finish plan');
    const finish = mocks.transition.mock.calls[2][0] as Record<string, unknown>;
    expect(finish).toMatchObject({ command: { kind: 'complete' }, expectedRevision: 2 });
    expect(text(renderer)).toContain('completed');
    expect(hasButton(renderer, 'Pause this plan')).toBe(false);
    expect(hasButton(renderer, 'Mark done: Step 1')).toBe(false);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps planned and actually-done visibly distinct after a deviation', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Skip: Step 1');
    await type(renderer, 'Reason for skipping', 'ran out of time');
    await press(renderer, 'Confirm skip: Step 1');
    const rendered = text(renderer);
    expect(rendered).toContain('planned steps');
    expect(rendered).toContain('actually done');
    expect(rendered.indexOf('planned steps')).toBeLessThan(rendered.indexOf('actually done'));
    expect(rendered).toContain('apply');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('discards a late start response after the owner changes', async () => {
    let release!: (value: unknown) => void;
    mocks.start.mockImplementation(() => new Promise(resolve => {
      release = resolve;
    }));
    const renderer = await render();
    await press(renderer, 'Start this plan');
    expect(mocks.start).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.update(createElement(ProtocolExecution, { ownerId: 'owner-2', decision: readyDecision() }));
      await Promise.resolve();
    });
    await act(async () => {
      release(receiptFixture());
      await Promise.resolve();
    });
    expect(text(renderer)).toContain('start this plan');
    expect(text(renderer)).not.toContain('planned steps');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('ignores a transition response that arrives after unmount', async () => {
    const renderer = await render();
    await start(renderer);
    let release!: (value: unknown) => void;
    mocks.transition.mockImplementationOnce(() => new Promise(resolve => {
      release = resolve;
    }));
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    await act(async () => {
      renderer.unmount();
    });
    await act(async () => {
      release(receiptFixture({ revision: 1, execution: confirmedResult() }));
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
  });

  it('never paints the previous owner execution after an owner switch', async () => {
    // Layout effects run at each commit, before the passive reset effect.
    // Capturing the tree there records the FIRST post-switch commit itself —
    // the only place a cross-owner paint can be observed.
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
    await press(renderer, 'Skip: Step 2');
    await type(renderer, 'Reason for skipping', 'ran out of time');
    await press(renderer, 'Confirm skip: Step 2');
    expect(text(renderer)).toContain('done step 1');
    expect(text(renderer)).toContain('ran out of time');
    snapshots.length = 0;
    await act(async () => {
      renderer.update(
        createElement(OwnerProbe, { ownerId: 'owner-2', decision: readyDecision(), onCommit: handleCommit }),
      );
      await Promise.resolve();
    });
    expect(snapshots.length).toBeGreaterThan(0);
    const firstCommit = snapshots[0] ?? '';
    expect(firstCommit).not.toContain('done step 1');
    expect(firstCommit).not.toContain('ran out of time');
    expect(firstCommit).toContain('start this plan');
    expect(text(renderer)).toContain('start this plan');
    expect(text(renderer)).not.toContain('ran out of time');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders every control on the shared large-target spec', async () => {
    const { styles: shared } = await import('../../apps/mobile/src/ui');
    expect(shared.button.minHeight).toBeGreaterThanOrEqual(44);
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Skip: Step 1');
    const controls = renderer.root.findAll(node => node.type === 'button');
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect((control.props.style as unknown[])).toContain(shared.button);
    }
    await act(async () => {
      renderer.unmount();
    });
  });

  it('labels controls for screen readers with large touch targets', async () => {
    const renderer = await render();
    const startButton = button(renderer, 'Start this plan');
    expect(startButton.props.accessibilityRole).toBe('button');
    await start(renderer);
    const done = button(renderer, 'Mark done: Step 1');
    expect(done.props.accessibilityRole).toBe('button');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('keeps cosmetic-boundary copy and carries no medical or outcome wording', async () => {
    const renderer = await render();
    await start(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('not a diagnosis');
    expect(rendered).toContain('promises no result');
    for (const pattern of [/\btreatment\b/i, /\bcure\b/i, /\bguarantee/i, /\bshop\b/i, /\bbuy\b/i, /will improve/i]) {
      expect(rendered).not.toMatch(pattern);
    }
    await act(async () => {
      renderer.unmount();
    });
  });

  it('dispatches a double-tapped confirmation only once', async () => {
    const renderer = await render();
    await start(renderer);
    await press(renderer, 'Mark done: Step 1');
    mocks.transition.mockClear();
    await act(async () => {
      button(renderer, 'Confirm done: Step 1').props.onPress();
      button(renderer, 'Confirm done: Step 1').props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.transition).toHaveBeenCalledTimes(1);
    await act(async () => {
      renderer.unmount();
    });
  });

  it.each([
    ['text-too-large', 'too long'],
    ['unowned-substitution', 'only a product you own'],
    ['unknown-shelf-item', 'could not be found'],
    ['archived-shelf-item', 'no longer on your shelf'],
    ['unknown-product-version', 'could not be verified'],
    ['revision-conflict', 'latest confirmed record is shown'],
    ['operation-conflict', 'already saving'],
    ['timestamp-out-of-range', 'device time'],
    ['too-many-events', 'history limit'],
    ['too-many-steps', 'too many steps'],
  ] as const)('maps %s to user copy instead of the raw code', async (code, snippet) => {
    const renderer = await render();
    await start(renderer);
    mocks.transition.mockRejectedValueOnce(new Error(code));
    await press(renderer, 'Mark done: Step 1');
    await press(renderer, 'Confirm done: Step 1');
    await act(async () => {
      await Promise.resolve();
    });
    const rendered = text(renderer);
    expect(rendered).toContain('could not be saved');
    expect(rendered).toContain(snippet);
    expect(rendered).not.toContain(code);
    await act(async () => {
      renderer.unmount();
    });
  });

  it.each([
    ['run-not-owned', 'different session'],
    ['not-ready-decision', 'not ready to follow'],
    ['operation-conflict', 'already saving'],
    ['account-not-active', 'not active'],
    ['too-many-active-executions', 'many plans'],
  ] as const)('maps start failure %s to user copy instead of the raw code', async (code, snippet) => {
    mocks.start.mockRejectedValueOnce(new Error(code));
    const renderer = await render();
    await press(renderer, 'Start this plan');
    await act(async () => {
      await Promise.resolve();
    });
    const rendered = text(renderer);
    expect(rendered).toContain('could not be started');
    expect(rendered).toContain(snippet);
    expect(rendered).not.toContain(code);
    await act(async () => {
      renderer.unmount();
    });
  });

  it('maps an unmapped start failure to generic copy with no transport text', async () => {
    mocks.start.mockRejectedValueOnce(new Error('connection reset'));
    const renderer = await render();
    await press(renderer, 'Start this plan');
    await act(async () => {
      await Promise.resolve();
    });
    const rendered = text(renderer);
    expect(rendered).toContain('could not be started');
    expect(rendered).toContain('check your connection');
    expect(rendered).not.toContain('connection reset');
    await act(async () => {
      renderer.unmount();
    });
  });

  function confirmedResult() {
    const execution = executionFixture({ updatedAt: T1 });
    return {
      ...execution,
      steps: execution.steps.map((step: { stepId: string }) => (step.stepId === 'step-1'
        ? { ...step, state: 'confirmed', confirmedAt: T1, deviation: null }
        : step)),
    };
  }
});

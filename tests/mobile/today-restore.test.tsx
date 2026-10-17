import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TodayGuidance } from '../../apps/mobile/src/TodayGuidance';
import {
  CHECK_IN_START_LABEL,
  EXECUTION_ABANDON_LABEL,
  EXECUTION_LOADING_LABEL,
  EXECUTION_LOAD_OFFLINE,
  EXECUTION_RELOAD_LABEL,
  EXECUTION_RESUME_UNVERIFIED,
  EXECUTION_START_LABEL,
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

/** Fresh-process mount: no in-memory decision, Today mounts from idle. */
async function mountFresh(ownerId: string = OWNER): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TodayGuidance, { ownerId, onNavigate: (() => undefined) as never }),
    );
    await flush();
  });
  return renderer;
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
  // Drain any state updates queued by the flushed microtasks.
  await act(async () => {
    await flush(rounds);
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
});

describe('fix E: active-execution recovery after process death', () => {
  it('checks the owner-scoped restore aggregate on fresh mount', async () => {
    const renderer = await mountFresh();
    await settle(renderer);
    expect(mocks.restoreAggregate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('renders neutral loading while restoring, never idle or start', async () => {
    let release!: (value: unknown) => void;
    mocks.restoreAggregate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const renderer = await mountFresh();
    await act(async () => { await flush(); });
    expect(text(renderer)).toContain(EXECUTION_LOADING_LABEL.toLowerCase());
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    await act(async () => { release(null); await flush(10); });
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('resumes a paused execution without generating, recording, or starting', async () => {
    mocks.restoreAggregate.mockResolvedValue(bundle());
    mocks.executionGetActive.mockResolvedValue(receipt());
    const renderer = await mountFresh();
    await settle(renderer);
    const rendered = text(renderer);
    expect(rendered).toContain('paused');
    expect(rendered).toContain('step 1');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('resumes an in-progress execution at the authoritative revision', async () => {
    const confirmed = (stepId: string, position: number) => ({
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
      state: 'confirmed',
      confirmedAt: T0,
      deviation: null,
    });
    const snapshot = executionSnapshot({
      status: 'in_progress',
      steps: [
        confirmed('step-1', 1),
        {
          stepId: 'step-2',
          position: 2,
          planned: {
            stepId: 'step-2',
            position: 2,
            action: 'rinse',
            productId: null,
            productVersionId: null,
            toolId: null,
            toolVersionId: null,
            waitSeconds: null,
            rinse: true,
            reasons: ['rule a@1 requires it'],
          },
          state: 'pending',
          confirmedAt: null,
          deviation: null,
        },
      ],
    });
    const active = receipt({ status: 'in_progress', revision: 4, execution: snapshot });
    mocks.restoreAggregate.mockResolvedValue({ ...bundle(), execution: active });
    mocks.executionGetActive.mockResolvedValue(active);
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain('done step 1');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('returns to normal idle check-in when no execution is active', async () => {
    mocks.restoreAggregate.mockResolvedValue(null);
    const renderer = await mountFresh();
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('relaunches to idle check-in when only terminal history exists (Fix F)', async () => {
    // The server aggregate returns null once the execution is terminal
    // (in_progress/paused only), so a relaunch after completion/abandonment
    // returns to the normal idle journey — never a terminal display, never a
    // start over the finished run. History belongs to a separately designed
    // history screen.
    mocks.restoreAggregate.mockResolvedValue(null);
    const renderer = await mountFresh();
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(text(renderer)).not.toContain('step 1');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('shows a retry card without idle fallback while offline', async () => {
    mocks.restoreAggregate.mockRejectedValue(new Error('Network request failed'));
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain(EXECUTION_LOAD_OFFLINE.toLowerCase().slice(0, 24));
    expect(hasButton(renderer, EXECUTION_RELOAD_LABEL)).toBe(true);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    // Retry restores the normal journey without generating.
    mocks.restoreAggregate.mockResolvedValue(null);
    await act(async () => {
      button(renderer, EXECUTION_RELOAD_LABEL).props.onPress();
      await flush(10);
    });
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('discards a late restore when the owner switches mid-restore', async () => {
    let release!: (value: unknown) => void;
    mocks.restoreAggregate.mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const renderer = await mountFresh(OWNER);
    await act(async () => { await flush(); });
    mocks.restoreAggregate.mockResolvedValue(null);
    await act(async () => {
      renderer.update(
        createElement(TodayGuidance, {
          key: 'owner-2',
          ownerId: 'owner-2',
          onNavigate: (() => undefined) as never,
        }),
      );
      await flush(10);
    });
    await act(async () => { release(bundle()); await flush(10); });
    await settle(renderer);
    expect(text(renderer)).not.toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('offers no local dismiss over the restored plan (Fix G: audited abandon only)', async () => {
    mocks.restoreAggregate.mockResolvedValue(bundle());
    mocks.executionGetActive.mockResolvedValue(receipt());
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain('step 1');
    // The unaudited local-only dismiss is gone: a live restored execution
    // can only continue, pause, or abandon through the audited transition.
    // The only start-over path back is the server-confirmed terminal receipt.
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('fails closed on a mismatched stored decision and never paints', async () => {
    const decision = { ...storedDecision(), requestId: '33333333-3333-4333-8333-333333333333' };
    mocks.restoreAggregate.mockResolvedValue({
      execution: receipt(),
      run: runRow({ decision }),
      storedDecision: decision,
    });
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain(EXECUTION_RESUME_UNVERIFIED.toLowerCase().slice(0, 24));
    expect(text(renderer)).not.toContain('step 1');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('fails closed on an untrusted stored run', async () => {
    const decision = storedDecision();
    mocks.restoreAggregate.mockResolvedValue({
      execution: receipt(),
      run: runRow({ decision, trusted: false }),
      storedDecision: decision,
    });
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain(EXECUTION_RESUME_UNVERIFIED.toLowerCase().slice(0, 24));
    expect(text(renderer)).not.toContain('step 1');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});

describe('Fix H: restored execution uses aggregate receipt, no second read', () => {
  it('restored execution uses aggregate receipt without calling getActiveProtocolExecution again', async () => {
    mocks.restoreAggregate.mockResolvedValue(bundle());
    const renderer = await mountFresh();
    await settle(renderer);
    // The controller must NOT re-read execution from the server — it must use
    // the validated aggregate receipt as the initial state.
    expect(mocks.executionGetActive).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    await act(async () => { renderer.unmount(); });
  });

  it('concurrent terminal/absent result never produces Start for restored decision', async () => {
    // The aggregate read (validated at restore time) held an active execution,
    // but by the time the execution surface would read again the execution has
    // gone — another session completed or abandoned it, so the server now
    // reports nothing active. Without carrying the validated receipt the
    // surface would fall back to that absent read and paint "start this plan"
    // over the already-used stored decision.
    mocks.restoreAggregate.mockResolvedValue(bundle());
    mocks.executionGetActive.mockResolvedValue(null);
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain('step 1');
    expect(hasButton(renderer, EXECUTION_START_LABEL)).toBe(false);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(false);
    expect(hasButton(renderer, START_OVER_LABEL)).toBe(false);
    // The only way out is the audited abandon, never a fresh start.
    expect(hasButton(renderer, EXECUTION_ABANDON_LABEL)).toBe(true);
    await act(async () => { renderer.unmount(); });
  });

  it('fresh ready decision uses normal start flow', async () => {
    mocks.restoreAggregate.mockResolvedValue(null);
    const renderer = await mountFresh();
    await settle(renderer);
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    // No restore receipt → ProtocolExecution is not mounted, so no active read occurs.
    expect(mocks.executionGetActive).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('owner switch cannot paint previous owner receipt', async () => {
    // Owner-1's read returns the receipt; owner-2's own read is empty. The
    // switch must discard owner-1's restored execution and paint owner-2's
    // honest absent result — never owner-1's steps under owner-2.
    mocks.restoreAggregate.mockResolvedValueOnce(bundle()).mockResolvedValueOnce(null);
    const renderer = await mountFresh(OWNER);
    await settle(renderer);
    expect(text(renderer)).toContain('step 1');
    await act(async () => {
      renderer.update(
        createElement(TodayGuidance, { ownerId: 'owner-2', key: 'owner-2', onNavigate: (() => undefined) as never }),
      );
      await flush(10);
    });
    await settle(renderer);
    expect(text(renderer)).not.toContain('step 1');
    expect(hasButton(renderer, CHECK_IN_START_LABEL)).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('paused receipt resumes at authoritative revision without second read', async () => {
    const pausedAtRev3 = receipt({ status: 'paused', revision: 3 });
    mocks.restoreAggregate.mockResolvedValue({ ...bundle(), execution: pausedAtRev3 });
    const renderer = await mountFresh();
    await settle(renderer);
    expect(text(renderer)).toContain('paused');
    expect(text(renderer)).toContain('step 1');
    expect(mocks.executionGetActive).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });

  it('no mount-time generation, run recording, or execution start', async () => {
    mocks.restoreAggregate.mockResolvedValue(bundle());
    const renderer = await mountFresh();
    await settle(renderer);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.recordRun).not.toHaveBeenCalled();
    expect(mocks.executionStart).not.toHaveBeenCalled();
    await act(async () => { renderer.unmount(); });
  });
});

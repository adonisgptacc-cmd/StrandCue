import { createElement, useLayoutEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolDecision } from '../../packages/domain/src/index';
import { CueCheckJourney } from '../../apps/mobile/src/CueCheckJourney';
import { ProtocolExecution } from '../../apps/mobile/src/ProtocolExecution';
import { CUE_QUESTIONS } from '../../apps/mobile/src/cue-check-copy';
import { createFakeCueServer } from './support/cue-check-fake-server';

/**
 * Increment 4 closure journey, test-only fixtures throughout:
 * server-confirmed completed routine -> immediate check-in (with "Not sure")
 * -> later check-in -> correction -> Journey list/detail/history -> honest
 * summary -> removal -> owner switch -> boundaries (no guidance generation,
 * no execution write, no catalogue or publication write, content_pending).
 */

const guards = vi.hoisted(() => ({
  recordRun: vi.fn(),
  start: vi.fn(),
  transition: vi.fn(),
  getActive: vi.fn(),
  clientRpc: vi.fn(),
  clientFrom: vi.fn(),
}));

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));
vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  let n = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: async (_a: string, value: string) => createHash('sha256').update(value, 'utf8').digest('hex'),
    randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));
vi.mock('../../apps/mobile/src/guidance/guidance-snapshot', () => ({ loadGuidanceSnapshot: vi.fn() }));
vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({ recordRecommendationRun: guards.recordRun }));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: guards.start,
  transitionProtocolExecution: guards.transition,
  getActiveProtocolExecution: guards.getActive,
  listProtocolExecutions: vi.fn(),
}));
vi.mock('../../apps/mobile/src/shelf-api', () => ({ listUserProducts: vi.fn(), getUserProduct: vi.fn() }));
// The UI path must never reach the real client: any call is a failure.
vi.mock('../../apps/mobile/src/client', () => ({
  supabase: { rpc: guards.clientRpc, from: guards.clientFrom },
  secureStorage: {},
}));

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const EXEC = '22222222-2222-4222-8222-222222222222';
const RUN = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-10-13T12:00:00+02:00';
const T1 = '2026-10-13T12:05:00+02:00';

function seededExecutionId(n: number): string {
  return `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
}

const confirmedStep = (stepId: string, position: number, action: string) => ({
  stepId,
  position,
  planned: { stepId, position, action, productId: null, productVersionId: null, toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['test reason'] },
  state: 'confirmed',
  confirmedAt: T1,
  deviation: null,
});

function completedReceipt() {
  const execution = {
    executionId: EXEC,
    recommendationRunId: RUN,
    startedAt: T0,
    updatedAt: T1,
    status: 'completed',
    steps: [confirmedStep('step-1', 1, 'apply'), confirmedStep('step-2', 2, 'rinse')],
    finishedAt: T1,
    closeReason: null,
  };
  return { executionId: EXEC, recommendationRunId: RUN, status: 'completed', revision: 3, updatedAt: T1, createdAt: T0, execution };
}

function decision(): ProtocolDecision {
  const step = (stepId: string, position: number, action: string) => ({
    stepId, position, action, productId: null, productVersionId: null, toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['test reason'],
  });
  return {
    status: 'ready',
    requestId: RUN,
    confidence: 'high',
    noPurchaseNeeded: true,
    steps: [step('step-1', 1, 'apply'), step('step-2', 2, 'rinse')],
    omissions: [],
    alternatives: [],
    missingInputs: [],
    audit: { requestId: RUN, engineVersion: '1', evaluatedRules: [], conflicts: [], rankedCandidates: [], rejectedCandidates: [], restrictions: [], missingInputs: [] },
  } as unknown as ProtocolDecision;
}

const q = (field: string) => CUE_QUESTIONS.find(entry => entry.field === field)!.prompt;
const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.clearAllMocks();
  guards.getActive.mockResolvedValue(completedReceipt());
});

let renderer: ReactTestRenderer;
const commits: string[] = [];
function Capture({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    if (renderer !== undefined) commits.push(JSON.stringify(renderer.toJSON()));
  });
  return children as never;
}
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
};
const text = () => JSON.stringify(renderer.toJSON());
const find = (label: string) => renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label);
async function press(label: string) {
  const found = find(label);
  expect(found, `control "${label}"`).toHaveLength(1);
  await act(async () => {
    found[0]!.props.onPress();
    await Promise.resolve();
  });
  await flush();
}
async function type(label: string, value: string) {
  await act(async () => find(label)[0]!.props.onChangeText(value));
}
const answer = (field: string, label: string) => press(`${q(field)}: ${label}`);
const buttonLabels = () => renderer.root.findAll(node => node.type === 'button').map(node => node.props.accessibilityLabel as string);

describe('Increment 4: private Cue Check journey, end to end at component level', () => {
  it('runs from a server-confirmed finish to a removed check-in without touching guidance, executions or the catalogue', async () => {
    // 1. A server-confirmed completed execution offers the immediate check-in.
    let handoff: { executionId: string; status: string } | null = null;
    await act(async () => {
      renderer = create(createElement(ProtocolExecution, { ownerId: OWNER_A, decision: decision(), onOpenCueCheck: ctx => { handoff = ctx; } }));
    });
    await flush();
    expect(text()).toContain('How did it go?');
    await press('Tell us how your hair felt');
    expect(handoff).toEqual({ executionId: EXEC, status: 'completed' });
    await act(async () => renderer.unmount());

    // The server (fake RPCs) holds this routine and three earlier, comparable routines.
    const server = createFakeCueServer([
      { executionId: EXEC, status: 'completed', confirmedSteps: [{ stepId: 'step-1', position: 1, confirmedAt: T1, action: 'apply', productId: 'prod-internal-1', productVersionId: null, toolId: null, toolVersionId: null }] },
      ...[1, 2, 3].map(n => ({ executionId: seededExecutionId(n), status: 'completed' as const })),
    ]);
    for (const [index, value] of ['less', 'less', 'more'].entries()) {
      await server.api.recordCueCheck({
        operationId: `00000000-0000-4000-8000-${String(index + 700).padStart(12, '0')}`,
        executionId: seededExecutionId(index + 1),
        observation: { timing: 'immediate', observedAt: '2026-10-12T09:00:00.000Z', dryness: value },
      });
    }
    const seededCalls = server.calls.length;
    const fresh = (name: string) => server.calls.slice(seededCalls).filter(call => call.name === name);
    const clock = { ms: Date.parse('2026-10-22T14:00:00.000Z') };
    const journey = (api: typeof server.api, owner: string, intent: typeof handoff = null) =>
      createElement(Capture, null, createElement(CueCheckJourney, {
        owner, api, intent, now: () => new Date(clock.ms), pageSize: 10, loadRoutines: async () => ({ items: [] }),
      }));
    commits.length = 0;
    await act(async () => { renderer = create(journey(server.api, OWNER_A, handoff)); });
    await flush();

    // 2-4. Immediate check-in with an explicit "Not sure"; nothing was written by merely opening it.
    expect(fresh('record')).toHaveLength(0);
    await answer('overallResult', 'Better than usual');
    await answer('dryness', 'Not sure');
    await type('Anything else you noticed?', '  soft after rinsing  ');
    await press('Save check-in');
    const immediate = fresh('record')[0]!.args as { observation: Record<string, unknown> };
    expect(immediate.observation).toMatchObject({ timing: 'immediate', dryness: 'unknown', notes: '  soft after rinsing  ' });
    expect('frizz' in immediate.observation).toBe(false);
    expect(text()).toContain('1. apply');
    expect(text()).not.toContain('prod-internal-1');

    // 5. Later check-in for the same routine, which may coexist with the immediate one.
    await press('Add a later check-in for this routine');
    expect(text()).toContain('How long did your style last compared with usual?');
    await answer('styleLongevity', 'Longer than usual');
    await press('Save check-in');
    expect(server.records.size).toBe(5);

    // 6-8. Correction with a reason; the history keeps the earlier answer separate.
    await press('Back to check-ins');
    const open = buttonLabels().filter(label => label.startsWith('Open check-in') && label.includes('Right after your routine'));
    await press(open[0]!);
    await press('Correct this check-in');
    await answer('overallResult', 'Worse than usual');
    await type('Why are you correcting this entry?', 'I picked the wrong answer');
    await press('Save correction');
    const detail = text();
    expect(detail).toContain('Current answers');
    expect(detail).toContain('Earlier answers (replaced)');
    expect(detail).toContain('I picked the wrong answer');
    expect(detail).toContain('First recorded');
    expect(detail).toContain('Corrected');

    // 9. Honest summary with the explicit-unknown count shown beside it.
    await press('Back to check-ins');
    const summary = text();
    expect(summary).toContain('You reported less dryness in 2 of 3 comparable uses you answered.');
    expect(summary).toContain('Not sure answers: 1');
    expect(summary).toContain('This is based on your own recorded observations.');
    expect(summary).not.toMatch(/%|score|rank|caus|proved|repair|heal|guarantee/i);

    // 10-11. Removal with a reason; the removed answers no longer count.
    await press(buttonLabels().filter(label => label.startsWith('Open check-in') && label.includes('Right after your routine'))[0]!);
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Wrong day');
    await press('Remove from active history');
    expect(text()).toContain('Removed from active history');
    await press('Back to check-ins');
    expect(text()).not.toContain('Not sure answers: 1');
    expect(text()).toContain('Removed from active history');
    expect(text()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);

    // 12-13. Owner switch while a read for the new owner is still in flight.
    const other = createFakeCueServer([{ executionId: EXEC, status: 'completed' }]);
    const release = other.hold('list');
    commits.length = 0;
    await act(async () => renderer.update(journey(other.api, OWNER_B)));
    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      expect(commit).not.toContain('soft after rinsing');
      expect(commit).not.toContain('Right after your routine');
      expect(commit).not.toContain('You reported less dryness');
    }
    release();
    await flush();
    expect(text()).toContain('No check-ins yet.');
    await act(async () => renderer.unmount());

    // 15-17. The whole journey stayed inside the Cue Check API.
    for (const call of server.calls.slice(seededCalls)) expect(['record', 'correct', 'void', 'list', 'get']).toContain(call.name);
    expect(guards.recordRun).not.toHaveBeenCalled();
    expect(guards.start).not.toHaveBeenCalled();
    expect(guards.transition).not.toHaveBeenCalled();
    expect(guards.clientRpc).not.toHaveBeenCalled();
    expect(guards.clientFrom).not.toHaveBeenCalled();
  });

  it('keeps production draft guidance content_pending after Cue Check activity', async () => {
    const { generateTodayGuidance } = await import('../../apps/mobile/src/guidance/today-guidance-service');
    const result = await generateTodayGuidance({
      ownerId: 'owner-1', goalId: 'basic_wash', requestId: 'request-1',
      asOf: '2026-10-22T09:00:00.000Z', loadedAt: '2026-10-22T09:00:05.000Z',
    });
    expect(result.status).toBe('content_pending');
    expect(guards.recordRun).not.toHaveBeenCalled();
  });

  it('shows nothing for a routine that is not yet confirmed finished', async () => {
    guards.getActive.mockResolvedValue({
      ...completedReceipt(),
      status: 'in_progress',
      execution: { ...completedReceipt().execution, status: 'in_progress', finishedAt: null, steps: [confirmedStep('step-1', 1, 'apply'), { ...confirmedStep('step-2', 2, 'rinse'), state: 'pending', confirmedAt: null }] },
    });
    await act(async () => {
      renderer = create(createElement(ProtocolExecution, { ownerId: OWNER_A, decision: decision(), onOpenCueCheck: () => undefined }));
    });
    await flush();
    expect(buttonLabels()).not.toContain('Tell us how your hair felt');
    expect(text()).not.toContain('How did it go?');
    await act(async () => renderer.unmount());
  });
});

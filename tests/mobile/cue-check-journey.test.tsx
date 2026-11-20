import { createElement, useLayoutEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';

import { CueCheckJourney, type CueCheckJourneyProps } from '../../apps/mobile/src/CueCheckJourney';
import { CUE_QUESTIONS } from '../../apps/mobile/src/cue-check-copy';
import { focusOn } from '../../apps/mobile/src/focus';
import { createFakeCueServer, type FakeExecution } from './support/cue-check-fake-server';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));
vi.mock('expo-crypto', async () => {
  const { createHash } = await import('node:crypto');
  let n = 0;
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex' },
    digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value, 'utf8').digest('hex'),
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
// Nothing in the Cue Check journey may reach guidance generation or execution writes.
const guards = vi.hoisted(() => ({ run: vi.fn(), transition: vi.fn(), start: vi.fn() }));
vi.mock('../../apps/mobile/src/guidance/recommendation-run-api', () => ({ recordRecommendationRun: guards.run }));
vi.mock('../../apps/mobile/src/guidance/protocol-execution-api', () => ({
  startProtocolExecution: guards.start,
  transitionProtocolExecution: guards.transition,
  getActiveProtocolExecution: guards.run,
  listProtocolExecutions: vi.fn(),
}));

const EXEC_A = '44444444-4444-4444-8444-aaaaaaaaaaaa';
const EXEC_B = '44444444-4444-4444-8444-bbbbbbbbbbbb';
const EXEC_RUNNING = '44444444-4444-4444-8444-cccccccccccc';
const STEP = {
  stepId: 'step-1', position: 1, confirmedAt: '2026-10-22T14:20:00+00:00', action: 'Rinse with lukewarm water',
  productId: 'prod-internal', productVersionId: null, toolId: null, toolVersionId: null,
};
const executions: FakeExecution[] = [
  { executionId: EXEC_A, status: 'completed', confirmedSteps: [STEP] },
  { executionId: EXEC_B, status: 'abandoned', confirmedSteps: [] },
  { executionId: EXEC_RUNNING, status: 'in_progress' },
];
const history = {
  items: [
    { executionId: EXEC_A, status: 'completed', execution: { finishedAt: '2026-10-22T08:00:00+02:00' } },
    { executionId: EXEC_B, status: 'abandoned', execution: { finishedAt: '2026-10-21T08:00:00+02:00' } },
  ],
  nextCursor: null,
};

const q = (field: string) => CUE_QUESTIONS.find(entry => entry.field === field)!.prompt;
const clock = { ms: Date.parse('2026-10-22T14:00:00.000Z') };
const now = () => new Date(clock.ms);

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
  clock.ms = Date.parse('2026-10-22T14:00:00.000Z');
});

type Server = ReturnType<typeof createFakeCueServer>;
let renderer: ReactTestRenderer;
const commits: string[] = [];

function Capture({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    if (renderer !== undefined) commits.push(JSON.stringify(renderer.toJSON()));
  });
  return children as never;
}

function journey(server: Server, overrides: Partial<CueCheckJourneyProps> = {}) {
  return createElement(
    Capture,
    null,
    createElement(CueCheckJourney, {
      owner: 'owner-a',
      api: server.api,
      loadRoutines: async () => history as never,
      now,
      pageSize: 2,
      ...overrides,
    } as CueCheckJourneyProps),
  );
}

async function mount(server: Server, overrides: Partial<CueCheckJourneyProps> = {}) {
  commits.length = 0;
  await act(async () => {
    renderer = create(journey(server, overrides));
  });
  await flush();
}
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};
const text = () => JSON.stringify(renderer.toJSON());
const find = (label: string) =>
  renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel === label);
const has = (label: string) => find(label).length > 0;
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
  const found = find(label);
  expect(found, `field "${label}"`).toHaveLength(1);
  await act(async () => found[0]!.props.onChangeText(value));
}
const answer = (field: string, label: string) => press(`${q(field)}: ${label}`);
function leaves(): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node !== null && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(renderer.toJSON());
  return out.join(' | ');
}
const announced = () => vi.mocked(AccessibilityInfo.announceForAccessibility).mock.calls.map(call => call[0]);

const COMPLETED = { executionId: EXEC_A, status: 'completed' };

async function recordImmediate(server: Server) {
  await mount(server, { intent: COMPLETED });
  await answer('overallResult', 'Better than usual');
  await answer('dryness', 'Not sure');
  await type('Anything else you noticed?', '  smooth, a bit tangled  ');
  await press('Save check-in');
}

describe('record how it felt right after a routine', () => {
  it('opens a draft from a completed routine without writing anything', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    expect(text()).toContain('How did your hair feel?');
    expect(server.callsNamed('record')).toHaveLength(0);
    expect(server.callsNamed('correct')).toHaveLength(0);
    expect(text()).not.toMatch(/style last/i);
    expect(has('Save check-in')).toBe(true);
  });

  it('saves a check-in with exactly what the owner entered and shows it back', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    const [call] = server.callsNamed('record');
    const sent = call!.args as { executionId: string; observation: Record<string, unknown> };
    expect(sent.executionId).toBe(EXEC_A);
    expect(sent.observation).toEqual({
      timing: 'immediate',
      observedAt: '2026-10-22T14:00:00.000Z',
      overallResult: 'better',
      dryness: 'unknown',
      notes: '  smooth, a bit tangled  ',
    });
    expect(Object.keys(sent.observation)).not.toContain('frizz');
    const out = text();
    expect(out).toContain('Right after your routine');
    expect(out).toContain('Better than usual');
    expect(out).toContain('Rinse with lukewarm water');
    expect(out).toContain('  smooth, a bit tangled  ');
    expect(out).not.toContain('prod-internal');
    expect(server.callsNamed('get').length).toBeGreaterThanOrEqual(1);
  });

  it('announces saving and the outcome once each', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    const release = server.hold('record');
    await act(async () => {
      find('Save check-in')[0]!.props.onPress();
      await Promise.resolve();
    });
    release();
    await flush();
    const spoken = announced();
    expect(spoken.filter(line => line === 'Saving your check-in…')).toHaveLength(1);
    expect(spoken.filter(line => line === 'Check-in saved.')).toHaveLength(1);
  });

  it('still announces the outcome when the save finishes before the saving state is drawn', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    expect(announced().filter(line => line === 'Check-in saved.')).toHaveLength(1);
  });

  it('opens the existing immediate check instead of creating a duplicate', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await act(async () => renderer.unmount());
    await mount(server, { intent: COMPLETED });
    expect(text()).toContain('Right after your routine');
    expect(text()).not.toContain('How did your hair feel?');
    expect(server.callsNamed('record')).toHaveLength(1);
  });

  it('never offers a check-in for a routine that is still running', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: { executionId: EXEC_RUNNING, status: 'in_progress' } });
    expect(text()).not.toContain('How did your hair feel?');
    expect(server.callsNamed('record')).toHaveLength(0);
  });

  it('is available from a stopped routine too', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: { executionId: EXEC_B, status: 'abandoned' } });
    expect(text()).toContain('How did your hair feel?');
  });
});

describe('record a later check-in', () => {
  it('offers style longevity only on the later check-in and lets both coexist', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    expect(has('Add a later check-in for this routine')).toBe(true);
    await press('Add a later check-in for this routine');
    expect(text()).toMatch(/How long did your style last/);
    await type('Anything else you noticed?', 'Still soft today');
    await press('Save check-in');
    const [, delayed] = server.callsNamed('record');
    expect((delayed!.args as { observation: { timing: string } }).observation.timing).toBe('delayed');
    expect(server.records.size).toBe(2);
    expect(text()).toContain('A later check-in');
  });

  it('opens the existing later check-in instead of duplicating it', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Add a later check-in for this routine');
    await type('Anything else you noticed?', 'later');
    await press('Save check-in');
    await act(async () => renderer.unmount());
    await mount(server);
    const routineButtons = renderer.root.findAll(node => node.type === 'button').map(node => node.props.accessibilityLabel as string);
    expect(routineButtons.some(label => label.startsWith('Open your later check-in'))).toBe(true);
    expect(routineButtons.some(label => label.startsWith('Add a later check-in') && label.includes('Completed'))).toBe(false);
  });
});

describe('offline saving and retry', () => {
  it('keeps the draft, shows plain copy and retries with identical bytes and the same time', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    server.setOffline(true);
    await press('Save check-in');
    expect(text()).toContain('You appear to be offline. Your unsent answers are still here.');
    expect(focusOn).toHaveBeenCalled();
    clock.ms += 600_000; // time passes; the draft's own time must not move
    server.setOffline(false);
    await press('Try saving again');
    const [first, second] = server.callsNamed('record');
    expect(JSON.stringify(second!.args)).toBe(JSON.stringify(first!.args));
    expect((first!.args as { operationId: string }).operationId).toBe((second!.args as { operationId: string }).operationId);
    expect(text()).toContain('Right after your routine');
  });

  it('gives a changed draft a new operation id', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    server.setOffline(true);
    await press('Save check-in');
    await answer('overallResult', 'Worse than usual');
    server.setOffline(false);
    await press('Save check-in');
    const [first, second] = server.callsNamed('record');
    expect((first!.args as { operationId: string }).operationId).not.toBe((second!.args as { operationId: string }).operationId);
  });

  it('starts a new draft with a new observed time after cancelling', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    await press('Cancel');
    expect(server.callsNamed('record')).toHaveLength(0);
    clock.ms += 3_600_000;
    await press(startLabel('Completed routine'));
    await answer('overallResult', 'Better than usual');
    await press('Save check-in');
    const [call] = server.callsNamed('record');
    expect((call!.args as { observation: { observedAt: string } }).observation.observedAt).toBe('2026-10-22T15:00:00.000Z');
  });
});

function startLabel(kind: string): string {
  const label = renderer.root
    .findAll(node => node.type === 'button')
    .map(node => node.props.accessibilityLabel as string)
    .find(entry => entry.startsWith('Tell us how your hair felt') && entry.includes(kind));
  return label!;
}

describe('correct a check-in without rewriting history', () => {
  async function recorded(): Promise<Server> {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    return server;
  }

  it('starts from the latest answers, shows the change and needs a reason', async () => {
    const server = await recorded();
    await press('Correct this check-in');
    expect(text()).toContain('Correct an earlier entry');
    expect(find(`${q('overallResult')}: Better than usual`)[0]!.props.accessibilityState).toMatchObject({ selected: true });
    expect(find('Save correction')[0]!.props.accessibilityState).toMatchObject({ disabled: true });
    await answer('overallResult', 'Worse than usual');
    expect(text()).toContain('Overall result: changed from Better than usual to Worse than usual');
    await press('Save correction');
    expect(server.callsNamed('correct')).toHaveLength(0);
    await type('Why are you correcting this entry?', 'I tapped the wrong answer');
    await press('Save correction');
    const [call] = server.callsNamed('correct');
    expect(call!.args).toMatchObject({ expectedRevision: 1, reason: 'I tapped the wrong answer' });
    expect(text()).toContain('Corrected');
    expect(text()).toContain('Current answers');
    expect(text()).toContain('Earlier answers (replaced)');
    expect(announced()).toContain('Correction saved.');
  });

  it('keeps the draft on a revision conflict and requires a reload before saving again', async () => {
    const server = await recorded();
    const id = [...server.records.keys()][0]!;
    await press('Correct this check-in');
    await answer('overallResult', 'Worse than usual');
    await type('Why are you correcting this entry?', 'Fix');
    server.changeElsewhere(id);
    await press('Save correction');
    expect(text()).toContain('This check-in changed on another session. Reload it before trying again.');
    expect(find(`${q('overallResult')}: Worse than usual`)[0]!.props.accessibilityState).toMatchObject({ selected: true });
    await press('Save correction');
    expect(server.callsNamed('correct')).toHaveLength(1);
    await press('Reload this check-in');
    expect(find('Why are you correcting this entry?')[0]!.props.value).toBe('Fix');
  });

  it('cancel performs no request', async () => {
    const server = await recorded();
    const before = server.calls.length;
    await press('Correct this check-in');
    await press('Cancel');
    expect(server.calls.length).toBe(before);
    expect(text()).toContain('Right after your routine');
  });
});

describe('remove a check-in from active history', () => {
  it('confirms with consequences, requires a reason and keeps the timeline', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Remove from active history');
    expect(text()).toContain('Your original answers stay in your private history.');
    expect(find('Remove from active history')[0]!.props.accessibilityState).toMatchObject({ disabled: true });
    await press('Keep this check-in');
    expect(server.callsNamed('void')).toHaveLength(0);
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Entered on the wrong day');
    await press('Remove from active history');
    expect(server.callsNamed('void')).toHaveLength(1);
    const out = text();
    expect(out).toContain('Removed from active history');
    expect(out).toContain('Entered on the wrong day');
    expect(out).toContain('First recorded');
    expect(has('Correct this check-in')).toBe(false);
    expect(announced()).toContain('Check-in removed from active history.');
  });

  it('shows removed records in the list with a clear label and leaves them out of summaries', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Wrong day');
    await press('Remove from active history');
    await press('Back to check-ins');
    expect(text()).toContain('Removed from active history');
    expect(text()).toContain('Summaries appear once you have recorded a few comparable check-ins.');
  });
});

describe('review fixes: recovery, retry and announcements', () => {
  it('loads the list on its own when a draft was cancelled before the first load finished', async () => {
    const server = createFakeCueServer(executions);
    const release = server.hold('list');
    await mount(server);
    await press(startLabel('Completed routine'));
    await press('Cancel');
    release();
    await flush();
    expect(text()).toContain('No check-ins yet.');
    expect(text()).not.toContain('Loading your check-ins…');
    expect(find('Reload check-ins')[0]!.props.accessibilityState?.disabled).not.toBe(true);
  });

  it('keeps the reload available when reloading after a conflict also fails', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    const id = [...server.records.keys()][0]!;
    await press('Correct this check-in');
    await answer('overallResult', 'Worse than usual');
    await type('Why are you correcting this entry?', 'Fix');
    server.changeElsewhere(id);
    await press('Save correction');
    expect(text()).toContain('This check-in changed on another session. Reload it before trying again.');
    server.setOffline(true);
    await press('Reload this check-in');
    expect(text()).toContain('You appear to be offline. Check your connection and try again.');
    expect(has('Reload this check-in')).toBe(true);
    expect(find('Save correction')[0]!.props.accessibilityState).toMatchObject({ disabled: true });
    server.setOffline(false);
    await press('Reload this check-in');
    expect(find('Save correction')[0]!.props.accessibilityState).toMatchObject({ disabled: false });
    expect(find('Why are you correcting this entry?')[0]!.props.value).toBe('Fix');
  });

  it('does not keep a request from the routine screen once the check-ins view is left', async () => {
    const server = createFakeCueServer(executions);
    const release = server.hold('list');
    const onIntentHandled = vi.fn();
    await mount(server, { intent: COMPLETED, onIntentHandled });
    expect(onIntentHandled).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
    expect(onIntentHandled).toHaveBeenCalledTimes(1);
    release();
  });

  it('survives a lost response: the identical retry replays the stored receipt and records once', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    server.loseResponse('record');
    await press('Save check-in');
    expect(text()).toContain('You appear to be offline. Your unsent answers are still here.');
    expect(server.records.size).toBe(1);
    await press('Try saving again');
    const [first, second] = server.callsNamed('record');
    expect(JSON.stringify(second!.args)).toBe(JSON.stringify(first!.args));
    expect(server.records.size).toBe(1);
    expect(text()).toContain('Right after your routine');
  });

  it('never announces a save when an edit is only cancelled, and announces a real removal exactly once', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Correct this check-in');
    await press('Cancel');
    await press('Remove from active history');
    await press('Keep this check-in');
    await press('Add a later check-in for this routine');
    await press('Cancel');
    expect(announced()).not.toContain('Correction saved.');
    expect(announced()).not.toContain('Check-in removed from active history.');
    expect(announced().filter(line => line === 'Check-in saved.')).toHaveLength(1);
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Wrong day');
    await press('Remove from active history');
    expect(announced().filter(line => line === 'Check-in removed from active history.')).toHaveLength(1);
  });

  it('announces a routines load failure once', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { loadRoutines: async () => { throw new Error('boom'); } });
    expect(announced().filter(line => line === 'Your recent routines could not be loaded.')).toHaveLength(1);
  });

  it('offers a retry when the history refresh after a save fails, rather than loading forever', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    server.failNext('get');
    await press('Save check-in');
    expect(text()).toContain('The full history could not be loaded.');
    expect(text()).not.toContain('Loading the full history…');
    const releaseHistory = server.hold('get');
    await press('Try loading the history again');
    // The retry runs in the background: the record stays on screen meanwhile.
    expect(text()).not.toContain('Loading this check-in…');
    expect(text()).toContain('Current answers');
    releaseHistory();
    await flush();
    expect(text()).toContain('First recorded');
  });
});

describe('failures around the check-in screens', () => {
  it('says plainly when recent routines cannot be loaded and still shows check-ins', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { loadRoutines: async () => { throw new Error('SQLSTATE 42P01 public.protocol_executions'); } });
    expect(text()).toContain('Your recent routines could not be loaded.');
    expect(text()).not.toMatch(/SQLSTATE|protocol_executions/);
    expect(text()).toContain('No check-ins yet.');
  });

  it('reloads a removal that hit a conflict and then lets it go through', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    const id = [...server.records.keys()][0]!;
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Wrong day');
    server.changeElsewhere(id);
    await press('Remove from active history');
    expect(text()).toContain('This check-in changed on another session. Reload it before trying again.');
    await press('Reload this check-in');
    expect(find('Why are you removing this check-in?')[0]!.props.value).toBe('Wrong day');
    await press('Remove from active history');
    expect(server.callsNamed('void')).toHaveLength(2);
    expect((server.callsNamed('void')[1]!.args as { expectedRevision: number }).expectedRevision).toBe(2);
  });

  it('reloads the list on request', async () => {
    const server = createFakeCueServer(executions);
    await mount(server);
    const before = server.callsNamed('list').length;
    await press('Reload check-ins');
    expect(server.callsNamed('list').length).toBe(before + 1);
  });

  it('retries a check-in that could not be opened', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Back to check-ins');
    const open = renderer.root.findAll(node => node.type === 'button' && String(node.props.accessibilityLabel).startsWith('Open check-in'))[0]!.props.accessibilityLabel as string;
    server.setOffline(true);
    await press(open);
    expect(text()).toContain('You appear to be offline. Check your connection and try again.');
    server.setOffline(false);
    await press('Try again');
    expect(text()).toContain('First recorded');
  });

  it('leaves a check-in that could not be opened and returns to the list', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Back to check-ins');
    const open = renderer.root.findAll(node => node.type === 'button' && String(node.props.accessibilityLabel).startsWith('Open check-in'))[0]!.props.accessibilityLabel as string;
    server.setOffline(true);
    await press(open);
    server.setOffline(false);
    await press('Reload check-ins');
    expect(text()).toContain('Your check-ins');
    expect(text()).not.toContain('You appear to be offline');
    expect(text()).toContain('Right after your routine');
  });
});

describe('Journey history', () => {
  async function seeded(): Promise<Server> {
    const server = createFakeCueServer(executions);
    for (let i = 0; i < 3; i += 1) {
      await server.api.recordCueCheck({
        operationId: `00000000-0000-4000-8000-${String(i + 900).padStart(12, '0')}`,
        executionId: i === 0 ? EXEC_A : i === 1 ? EXEC_B : EXEC_A,
        observation: { timing: i === 2 ? 'delayed' : 'immediate', observedAt: `2026-10-2${i}T09:00:00.000Z`, notes: `entry ${i}` },
      });
    }
    return server;
  }

  it('lists newest first, pages without duplicates and shows the end', async () => {
    const server = await seeded();
    await mount(server);
    const rows = () => renderer.root.findAll(node => node.type === 'button' && String(node.props.accessibilityLabel).startsWith('Open check-in'));
    expect(rows()).toHaveLength(2);
    expect(text()).toContain('A later check-in');
    await press('Load more check-ins');
    expect(rows()).toHaveLength(3);
    expect(new Set(rows().map(node => node.props.accessibilityLabel)).size).toBe(3);
    expect(text()).toContain('That is everything you have recorded.');
    expect(announced()).toContain('Loaded 1 more check-in.');
  });

  it('opens a record with its full history', async () => {
    const server = await seeded();
    await mount(server);
    await press(
      renderer.root.findAll(node => node.type === 'button' && String(node.props.accessibilityLabel).startsWith('Open check-in'))[0]!.props
        .accessibilityLabel,
    );
    expect(text()).toContain('First recorded');
    expect(server.callsNamed('get')).toHaveLength(1);
  });

  it('shows plain empty and failed states with retry', async () => {
    const server = createFakeCueServer(executions);
    server.setOffline(true);
    await mount(server);
    expect(text()).toContain('You appear to be offline. Check your connection and try again.');
    server.setOffline(false);
    await press('Try again');
    expect(text()).toContain('No check-ins yet.');
  });

  it('never shows identifiers, operation ids, raw JSON or enum keys anywhere', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    for (const screen of ['detail', 'list'] as const) {
      if (screen === 'list') await press('Back to check-ins');
      expect(text(), screen).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-|operation|none-noticed|overallResult|lifecycle|SQLSTATE|rpc/i);
      expect(leaves(), screen).not.toMatch(/[{}\[\]]/);
    }
  });

  it('shows the honest summary only at the minimum and with uncertainty counts', async () => {
    const server = createFakeCueServer([
      ...executions,
      ...['d', 'e', 'f', 'a'].map(letter => ({ executionId: `44444444-4444-4444-8444-${letter.repeat(12)}`, status: 'completed' as const })),
    ]);
    for (const [index, value] of ['less', 'less', 'more', 'unknown'].entries()) {
      await server.api.recordCueCheck({
        operationId: `00000000-0000-4000-8000-${String(index + 800).padStart(12, '0')}`,
        executionId: `44444444-4444-4444-8444-${['d', 'e', 'f', 'a'][index]!.repeat(12)}`,
        observation: { timing: 'immediate', observedAt: '2026-10-21T09:00:00.000Z', dryness: value },
      });
    }
    await mount(server, { pageSize: 10 });
    const out = text();
    expect(out).toContain('You reported less dryness in 2 of 3 comparable uses you answered.');
    expect(out).toContain('Not sure answers: 1');
    expect(out).toContain('This is based on your own recorded observations.');
  });
});

describe('switching owners', () => {
  it('never paints the previous owner’s check-ins, even for one commit', async () => {
    const serverA = createFakeCueServer(executions);
    await serverA.api.recordCueCheck({
      operationId: '00000000-0000-4000-8000-000000000501',
      executionId: EXEC_A,
      observation: { timing: 'immediate', observedAt: '2026-10-21T09:00:00.000Z', notes: 'OWNER-A-PRIVATE-NOTE' },
    });
    const serverB = createFakeCueServer(executions);
    await mount(serverA, { owner: 'owner-a' });
    expect(text()).toContain('Right after your routine');
    commits.length = 0;
    const releaseB = serverB.hold('list');
    await act(async () => renderer.update(journey(serverB, { owner: 'owner-b' })));
    expect(commits.length).toBeGreaterThan(0);
    for (const commit of commits) {
      expect(commit).not.toContain('OWNER-A-PRIVATE-NOTE');
      expect(commit).not.toContain('Right after your routine');
    }
    releaseB();
    await flush();
    expect(text()).not.toContain('OWNER-A-PRIVATE-NOTE');
    expect(text()).toContain('No check-ins yet.');
  });

  it('ignores a late response that belongs to the previous owner', async () => {
    const serverA = createFakeCueServer(executions);
    await serverA.api.recordCueCheck({
      operationId: '00000000-0000-4000-8000-000000000502',
      executionId: EXEC_A,
      observation: { timing: 'immediate', observedAt: '2026-10-21T09:00:00.000Z', notes: 'LATE-A-NOTE' },
    });
    const releaseA = serverA.hold('list');
    commits.length = 0;
    await act(async () => {
      renderer = create(journey(serverA, { owner: 'owner-a' }));
    });
    const serverB = createFakeCueServer(executions);
    await act(async () => renderer.update(journey(serverB, { owner: 'owner-b' })));
    await flush();
    releaseA();
    await flush();
    expect(text()).not.toContain('LATE-A-NOTE');
    expect(commits.some(commit => commit.includes('LATE-A-NOTE'))).toBe(false);
  });

  it('drops an unsent draft and its note when the owner changes', async () => {
    const serverA = createFakeCueServer(executions);
    await mount(serverA, { intent: COMPLETED });
    await type('Anything else you noticed?', 'PRIVATE-DRAFT');
    expect(text()).toContain('PRIVATE-DRAFT');
    const serverB = createFakeCueServer(executions);
    await act(async () => renderer.update(journey(serverB, { owner: 'owner-b' })));
    await flush();
    expect(text()).not.toContain('PRIVATE-DRAFT');
    expect(serverA.callsNamed('record')).toHaveLength(0);
  });
});

describe('accessibility behaviour of the journey', () => {
  it('keeps the same save control while saving and announces the progress', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    const release = server.hold('record');
    await act(async () => {
      find('Save check-in')[0]!.props.onPress();
      await Promise.resolve();
    });
    const saving = find('Saving check-in…');
    expect(saving).toHaveLength(1);
    expect(saving[0]!.props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => saving[0]!.props.onPress());
    release();
    await flush();
    expect(server.callsNamed('record')).toHaveLength(1);
  });

  it('shows a visible alert for a failure and moves focus to it', async () => {
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    await answer('overallResult', 'Better than usual');
    server.setOffline(true);
    await press('Save check-in');
    const alerts = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityRole === 'alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(focusOn).toHaveBeenCalled();
  });

  it('keeps every control on the shared minimum touch size', async () => {
    const { styles: shared } = await import('../../apps/mobile/src/ui');
    expect(shared.button.minHeight).toBeGreaterThanOrEqual(44);
    expect(shared.pill.minHeight).toBeGreaterThanOrEqual(44);
    const server = createFakeCueServer(executions);
    await mount(server, { intent: COMPLETED });
    const controls = renderer.root.findAll(node => node.type === 'button');
    for (const control of controls) {
      const style = (control.props.style as unknown[]).flat();
      expect(style.includes(shared.button) || style.includes(shared.pill)).toBe(true);
    }
  });
});

describe('what this journey must never touch', () => {
  it('makes no recommendation or execution write across a whole journey and production guidance stays content_pending', async () => {
    const server = createFakeCueServer(executions);
    await recordImmediate(server);
    await press('Correct this check-in');
    await answer('overallResult', 'Worse than usual');
    await type('Why are you correcting this entry?', 'Wrong tap');
    await press('Save correction');
    await press('Remove from active history');
    await type('Why are you removing this check-in?', 'Wrong day');
    await press('Remove from active history');
    expect(guards.run).not.toHaveBeenCalled();
    expect(guards.start).not.toHaveBeenCalled();
    expect(guards.transition).not.toHaveBeenCalled();
    const names = new Set(server.calls.map(call => call.name));
    for (const name of names) expect(['record', 'correct', 'void', 'list', 'get']).toContain(name);
    const { generateTodayGuidance } = await import('../../apps/mobile/src/guidance/today-guidance-service');
    const result = await generateTodayGuidance({
      ownerId: 'owner-1', goalId: 'basic_wash', requestId: 'request-1',
      asOf: '2026-10-22T09:00:00.000Z', loadedAt: '2026-10-22T09:00:05.000Z',
    });
    expect(result.status).toBe('content_pending');
  });
});

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CueCheckReceipt } from '../../apps/mobile/src/cue-check-api';
import { CueCheckEntryPoint } from '../../apps/mobile/src/CueCheckEntryPoint';
import { CueCheckRoutines } from '../../apps/mobile/src/CueCheckRoutines';
import { entryOptions } from '../../apps/mobile/src/cue-check-entry';
import { parseRoutines } from '../../apps/mobile/src/cue-check-routines';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);

const EXEC_A = '44444444-4444-4444-8444-444444444444';
const EXEC_B = '44444444-4444-4444-8444-555555555555';

function check(n: number, executionId: string, timing: 'immediate' | 'delayed', lifecycle: 'active' | 'voided' = 'active'): CueCheckReceipt {
  return {
    recordId: `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`,
    executionId,
    timing,
    lifecycle,
    observation: { timing, observedAt: '2026-10-22T09:30:00-05:00', notes: 'x' },
  } as unknown as CueCheckReceipt;
}

const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...rest: unknown[]) => {
    if (String(message).includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

async function render(element: ReturnType<typeof createElement>): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const button = (renderer: ReactTestRenderer, label: string) =>
  renderer.root.findAll(node => node.type === 'button' && node.props.accessibilityLabel === label);

describe('which check-ins a routine offers', () => {
  it.each(['completed', 'abandoned'] as const)('offers both check-ins for a %s routine with none recorded', status => {
    expect(entryOptions({ executionId: EXEC_A, status }, [])).toEqual({
      eligible: true,
      immediate: { kind: 'start' },
      delayed: { kind: 'start' },
    });
  });

  it.each(['in_progress', 'paused', 'something-else'])('offers nothing for a %s routine', status => {
    expect(entryOptions({ executionId: EXEC_A, status }, [])).toEqual({ eligible: false, immediate: null, delayed: null });
  });

  it('opens an existing active immediate check instead of offering a duplicate', () => {
    const options = entryOptions({ executionId: EXEC_A, status: 'completed' }, [check(1, EXEC_A, 'immediate')]);
    expect(options.immediate).toEqual({ kind: 'open', recordId: check(1, EXEC_A, 'immediate').recordId });
    expect(options.delayed).toEqual({ kind: 'start' });
  });

  it('opens an existing active delayed check and lets it coexist with an immediate one', () => {
    const options = entryOptions({ executionId: EXEC_A, status: 'completed' }, [check(1, EXEC_A, 'immediate'), check(2, EXEC_A, 'delayed')]);
    expect(options.immediate?.kind).toBe('open');
    expect(options.delayed).toEqual({ kind: 'open', recordId: check(2, EXEC_A, 'delayed').recordId });
  });

  it('treats a removed check as no check and ignores other routines', () => {
    const options = entryOptions({ executionId: EXEC_A, status: 'abandoned' }, [
      check(1, EXEC_A, 'immediate', 'voided'),
      check(2, EXEC_B, 'delayed'),
    ]);
    expect(options.immediate).toEqual({ kind: 'start' });
    expect(options.delayed).toEqual({ kind: 'start' });
  });
});

describe('immediate check prompt after a routine', () => {
  it('invites a completed routine and describes only the confirmed steps', async () => {
    const onOpen = vi.fn();
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status: 'completed' }, onOpen }));
    const out = text(renderer);
    expect(out).toContain('How did it go?');
    expect(out).toContain('after the steps you confirmed');
    expect(out).not.toMatch(/every step|all steps|all of your/i);
  });

  it('says plainly that a stopped routine may have fewer steps', async () => {
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status: 'abandoned' }, onOpen: vi.fn() }));
    expect(text(renderer)).toContain('You stopped this routine early.');
    expect(button(renderer, 'Tell us how your hair felt')).toHaveLength(1);
  });

  it.each(['in_progress', 'paused'])('shows nothing while a routine is %s', async status => {
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status }, onOpen: vi.fn() }));
    expect(renderer.toJSON()).toBeNull();
  });

  it('only hands the routine to the form; opening records nothing', async () => {
    const onOpen = vi.fn();
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status: 'completed' }, onOpen }));
    await act(async () => button(renderer, 'Tell us how your hair felt')[0]!.props.onPress());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ executionId: EXEC_A, status: 'completed' });
  });

  it('lets the owner do it later without recording anything', async () => {
    const onOpen = vi.fn();
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status: 'completed' }, onOpen }));
    await act(async () => button(renderer, 'Do this later')[0]!.props.onPress());
    expect(onOpen).not.toHaveBeenCalled();
    expect(text(renderer)).toContain('You can add this any time from Journey.');
    expect(button(renderer, 'Tell us how your hair felt')).toHaveLength(0);
  });

  it('carries no causal, medical or promise wording', async () => {
    const renderer = await render(createElement(CueCheckEntryPoint, { execution: { executionId: EXEC_A, status: 'abandoned' }, onOpen: vi.fn() }));
    expect(text(renderer)).not.toMatch(/caus|prov|repair|heal|fix|treat|grew|growth|strengthen|guarantee|safe for everyone/i);
  });
});

describe('routines that can take a check-in', () => {
  const history = {
    items: [
      { executionId: EXEC_A, status: 'completed', execution: { finishedAt: '2026-10-22T08:00:00+02:00' } },
      { executionId: EXEC_B, status: 'abandoned', execution: { finishedAt: 'not a date' } },
      { executionId: '44444444-4444-4444-8444-666666666666', status: 'in_progress', execution: { finishedAt: null } },
      { executionId: '44444444-4444-4444-8444-777777777777', status: 'paused', execution: {} },
    ],
    nextCursor: null,
  };

  it('keeps only terminal routines and a safe finish time', () => {
    const routines = parseRoutines(history as never);
    expect(routines.map(routine => [routine.executionId, routine.status])).toEqual([
      [EXEC_A, 'completed'],
      [EXEC_B, 'abandoned'],
    ]);
    expect(routines[0]?.finishedAt).toBe('2026-10-22T08:00:00+02:00');
    expect(routines[1]?.finishedAt).toBeNull();
  });

  it('offers a start for a routine with no check-in and opens existing ones', async () => {
    const routines = parseRoutines(history as never);
    const onStart = vi.fn();
    const onOpen = vi.fn();
    const renderer = await render(
      createElement(CueCheckRoutines, { routines, items: [check(1, EXEC_A, 'immediate')], onStart, onOpen }),
    );
    const out = text(renderer);
    expect(out).toContain('Completed routine');
    expect(out).toContain('Stopped routine');
    const labels = renderer.root.findAll(node => node.type === 'button').map(node => node.props.accessibilityLabel as string);
    expect(new Set(labels).size).toBe(labels.length);
    const open = labels.find(label => label.startsWith('Open your check-in'))!;
    await act(async () => button(renderer, open)[0]!.props.onPress());
    expect(onOpen).toHaveBeenCalledWith(check(1, EXEC_A, 'immediate').recordId);
    const later = labels.find(label => label.startsWith('Add a later check-in') && label.includes('Completed'));
    expect(later).toBeDefined();
    await act(async () => button(renderer, later!)[0]!.props.onPress());
    expect(onStart).toHaveBeenCalledWith({ executionId: EXEC_A, status: 'completed' }, 'delayed');
    const stopped = labels.find(label => label.startsWith('Tell us how your hair felt') && label.includes('Stopped'))!;
    await act(async () => button(renderer, stopped)[0]!.props.onPress());
    expect(onStart).toHaveBeenLastCalledWith({ executionId: EXEC_B, status: 'abandoned' }, 'immediate');
  });

  it('shows plain empty copy and never an identifier', async () => {
    const empty = await render(createElement(CueCheckRoutines, { routines: [], items: [], onStart: vi.fn(), onOpen: vi.fn() }));
    expect(text(empty)).toContain('Finish or stop a routine and it will appear here.');
    const filled = await render(createElement(CueCheckRoutines, { routines: parseRoutines(history as never), items: [], onStart: vi.fn(), onOpen: vi.fn() }));
    expect(text(filled)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });
});

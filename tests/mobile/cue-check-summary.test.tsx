import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MINIMUM_COMPARABLE_SAMPLE, summarizePersonalOutcomes } from '../../packages/domain/src/index';
import type { CueCheckReceipt } from '../../apps/mobile/src/cue-check-api';
import { CueCheckSummary } from '../../apps/mobile/src/CueCheckSummary';
import { formatDay, formatWhen, receiptToRecord, summarizeReceipts } from '../../apps/mobile/src/cue-check-records';

vi.mock('react-native', async () => (await import('./support/rn-mock')).rnMock);

const RUN = '55555555-5555-4555-8555-555555555555';
const T = '2026-10-22T09:30:00-05:00';

let counter = 0;
function check(
  timing: 'immediate' | 'delayed',
  answers: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): CueCheckReceipt {
  counter += 1;
  return {
    recordId: `77777777-7777-4777-8777-${String(counter).padStart(12, '0')}`,
    executionId: `44444444-4444-4444-8444-${String(counter).padStart(12, '0')}`,
    recommendationRunId: RUN,
    goal: 'basic_wash',
    timing,
    lifecycle: 'active',
    revision: 1,
    observedAt: T,
    receivedAt: '2026-10-22T14:31:00.000000+00:00',
    observation: { timing, observedAt: T, ...answers },
    confirmedSteps: [],
    executionStatus: 'completed',
    createdAt: '2026-10-22T14:31:00.000000+00:00',
    updatedAt: '2026-10-22T14:31:00.000000+00:00',
    ...overrides,
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

async function render(items: readonly CueCheckReceipt[], hasMore = false): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(CueCheckSummary, { items, hasMore }));
  });
  return renderer;
}
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

const three = () => [check('immediate', { dryness: 'less' }), check('immediate', { dryness: 'less' }), check('immediate', { dryness: 'more' })];

describe('personal summary', () => {
  it('needs the domain minimum before it shows any pattern', async () => {
    expect(MINIMUM_COMPARABLE_SAMPLE).toBe(3);
    const two = await render(three().slice(0, 2));
    const out = text(two);
    expect(out).toContain('Not enough comparable answers yet to show a pattern about dryness.');
    expect(out).not.toContain('You reported');
    expect(out).toContain('2 comparable answers so far. At least 3 are needed.');
  });

  it('shows the insufficient sentence once per question even with different answers', async () => {
    const out = text(await render(three().slice(0, 2)));
    const sentence = 'Not enough comparable answers yet to show a pattern about dryness.';
    expect(out.split(sentence)).toHaveLength(2);
  });

  it('shows pattern wording at the minimum, byte-for-byte from the domain, with its numerator and denominator', async () => {
    const items = three();
    const out = text(await render(items));
    const domain = summarizePersonalOutcomes(items.map(receiptToRecord), { goal: 'basic_wash' });
    expect(domain.length).toBeGreaterThan(0);
    for (const entry of domain) expect(out).toContain(entry.wording);
    expect(out).toContain('You reported less dryness in 2 of 3 comparable uses you answered.');
    expect(out).toContain('2 of 3 comparable answers');
    expect(out).toContain('1 of 3 comparable answers');
  });

  it('shows how many "Not sure" answers sit beside a sentence and keeps them out of the count', async () => {
    const items = [...three(), check('immediate', { dryness: 'unknown' }), check('immediate', { dryness: 'unknown' })];
    const out = text(await render(items));
    expect(out).toContain('Not sure answers: 2');
    expect(out).toContain('Answers marked “Not sure” are not included in the comparison count.');
    expect(out).toContain('2 of 3 comparable answers');
    expect(out).not.toContain('of 5 comparable');
  });

  it('keeps right-after and later answers separate', async () => {
    const items = [
      check('immediate', { dryness: 'less' }), check('immediate', { dryness: 'less' }),
      check('delayed', { dryness: 'less' }), check('delayed', { dryness: 'less' }),
    ];
    const out = text(await render(items));
    expect(out).toContain('Right after your routines');
    expect(out).toContain('Later check-ins');
    expect(out.split('2 comparable answers so far. At least 3 are needed.')).toHaveLength(3);
    expect(out).not.toContain('You reported');
  });

  it('counts only active check-ins', async () => {
    const items = [...three().slice(0, 2), check('immediate', { dryness: 'less' }, { lifecycle: 'voided' })];
    const out = text(await render(items));
    expect(out).toContain('2 comparable answers so far.');
    expect(out).not.toContain('You reported');
  });

  it('uses only the current answers, not earlier replaced ones', async () => {
    const replaced = check('immediate', { dryness: 'less' }, { revisions: [{ kind: 'create', observation: { timing: 'immediate', observedAt: T, dryness: 'more' } }] });
    const items = [replaced, check('immediate', { dryness: 'less' }), check('immediate', { dryness: 'less' })];
    const out = text(await render(items));
    expect(out).toContain('You reported less dryness in 3 of 3 comparable uses you answered.');
    expect(out).not.toContain('more dryness');
  });

  it('adds no score, percentage, ranking, advice or causal wording', async () => {
    const out = text(await render([...three(), check('immediate', { overallResult: 'better', wouldUseAgain: 'yes' })]));
    expect(out).not.toMatch(/%|percent|score|grade|rank|star|confidence|best|top /i);
    expect(out).not.toMatch(/you should|try |recommend|switch|avoid|keep using|stop using/i);
    expect(out).not.toMatch(/caus|proved|proof|repair|heal|\bfix|treat|grew|growth|strengthen|guarantee|universally safe|scientifically/i);
  });

  it('says it is based on the owner’s own observations and is not medical or product evidence', async () => {
    const out = text(await render(three()));
    expect(out).toContain('This is based on your own recorded observations.');
    expect(out).toContain('It is not medical advice or product evidence.');
  });

  it('says plainly when nothing can be summarised yet', async () => {
    expect(text(await render([]))).toContain('Summaries appear once you have recorded a few comparable check-ins.');
  });

  it('is honest that older check-ins may not be loaded yet', async () => {
    expect(text(await render(three(), true))).toContain('This summary covers the check-ins loaded so far.');
    expect(text(await render(three(), false))).not.toContain('loaded so far');
  });

  it('fails closed with a plain sentence when the records cannot be summarised safely', async () => {
    const clash = check('immediate', { dryness: 'less' });
    const out = text(await render([clash, { ...clash, recordId: '77777777-7777-4777-8777-000000009999' } as CueCheckReceipt]));
    expect(out).toContain('This summary could not be built safely.');
    expect(out).not.toContain('You reported');
  });

  it('groups results by timing for the Journey screen', () => {
    const result = summarizeReceipts(three());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.groups.map(group => group.timing)).toEqual(['immediate']);
      const row = result.groups[0]!.rows.find(entry => entry.label === 'Dryness')!;
      expect(row.evidence).toBe('sufficient');
      expect(row.denominator).toBe(3);
      expect(row.unknownCount).toBe(0);
    }
  });

  it('does not mutate what it is given', () => {
    const items = three();
    const before = JSON.stringify(items);
    summarizeReceipts(items);
    expect(JSON.stringify(items)).toBe(before);
  });
});

describe('dates shown to the owner', () => {
  it('formats a recorded time for the device and says so when it cannot be read', () => {
    expect(formatWhen('2026-10-22T09:30:00-05:00')).toMatch(/2026/);
    expect(formatWhen('2026-10-22T09:30:00-05:00')).toMatch(/Oct/);
    expect(formatDay('2026-10-22T09:30:00-05:00')).toMatch(/2026/);
    expect(formatDay('2026-10-22T09:30:00-05:00')).not.toMatch(/:/);
    expect(formatWhen('not a date')).toBe('a date that could not be read');
    expect(formatDay('')).toBe('a date that could not be read');
  });

  it('keeps the offset-aware recorded string untouched when mapping a receipt', () => {
    expect(receiptToRecord(check('immediate', { dryness: 'less' })).observedAt).toBe(T);
  });
});

describe('answers that are only "Not sure"', () => {
  it('shows no pattern, no denominator and the count of uncertain answers', async () => {
    const items = [check('immediate', { dryness: 'unknown' }), check('immediate', { dryness: 'unknown' })];
    const out = text(await render(items));
    expect(out).toContain('Not enough comparable answers yet to show a pattern about dryness.');
    expect(out).toContain('0 comparable answers so far. At least 3 are needed.');
    expect(out).toContain('Not sure answers: 2');
  });

  it('groups a single answer with its own singular wording', async () => {
    const out = text(await render([check('immediate', { dryness: 'less' })]));
    expect(out).toContain('1 comparable answer so far. At least 3 are needed.');
  });
});

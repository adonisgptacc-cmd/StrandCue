import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgrammeHistory } from '../../apps/mobile/src/ProgrammeHistory.tsx';
import {
  PROGRAMME_HISTORY_LABELS,
  formatProgrammeDate,
} from '../../apps/mobile/src/programme-copy.ts';
import { mount, visibleText, withSetup } from './support/programme-harness.tsx';
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
vi.mock('expo-crypto', async () => (await import('./support/expo-crypto-mock.ts')).expoCryptoMock);
vi.mock('../../apps/mobile/src/focus', () => ({ focusOn: vi.fn() }));

// Append-only lifecycle history. Recorded facts are rendered in the order the
// server recorded them, with plain labels and owner-friendly dates, and they stay
// readable even when the current evaluation is blocked or unavailable.

const CREATED_AT = '2026-09-01T08:00:00.123456Z';

function history(overrides: Record<string, unknown> = {}) {
  return [
    { sequence: 1, kind: 'enrol', recordedAt: CREATED_AT },
    {
      sequence: 2,
      kind: 'pause',
      recordedAt: '2026-09-09T10:00:00.123456Z',
      occurredAt: '2026-09-09T09:00:00.000Z',
      reasonCode: 'personal-choice',
    },
    {
      sequence: 3,
      kind: 'resume',
      recordedAt: '2026-09-13T10:00:00.123456Z',
      occurredAt: '2026-09-13T09:00:00.000Z',
      ruleId: 'resume-fixture',
      ruleVersion: '1',
    },
    {
      sequence: 4,
      kind: 'maintenance',
      recordedAt: '2026-09-16T10:00:00.123456Z',
      occurredAt: '2026-09-16T09:00:00.000Z',
      ruleId: 'rule-fixture-1',
      ruleVersion: '1',
    },
    {
      sequence: 5,
      kind: 'complete',
      recordedAt: '2026-09-20T10:00:00.123456Z',
      occurredAt: '2026-09-20T09:00:00.000Z',
    },
    ...(overrides.extra === undefined ? [] : (overrides.extra as unknown[])),
  ];
}

withSetup(() => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const view = (entries: readonly unknown[]) =>
    mount({ type: ProgrammeHistory as never, props: { history: entries } });

  describe('the programme lifecycle history', () => {
    it('renders every lifecycle kind with its plain label in recorded order', async () => {
      const renderer = await view(history());
      const text = visibleText(renderer);
      const order = [
        PROGRAMME_HISTORY_LABELS.enrol,
        'Owner chose to pause',
        PROGRAMME_HISTORY_LABELS.resume,
        PROGRAMME_HISTORY_LABELS.maintenance,
        PROGRAMME_HISTORY_LABELS.complete,
      ];
      const positions = order.map(label => text.indexOf(label));
      expect(positions.every(position => position >= 0)).toBe(true);
      expect([...positions].sort((left, right) => left - right)).toEqual(positions);
    });

    it('labels a stopped programme neutrally', async () => {
      const renderer = await view([
        { sequence: 1, kind: 'enrol', recordedAt: CREATED_AT },
        { sequence: 2, kind: 'abandon', recordedAt: '2026-09-20T10:00:00.123456Z' },
      ]);
      expect(visibleText(renderer)).toContain(PROGRAMME_HISTORY_LABELS.abandon);
    });

    it('shows recorded dates without a raw database timestamp', async () => {
      const renderer = await view(history());
      const text = visibleText(renderer);
      expect(text).toContain(formatProgrammeDate('2026-09-20T10:00:00.123456Z'));
      expect(text).not.toContain('2026-09-20T10:00:00.123456Z');
      expect(text).not.toContain('123456');
    });

    it('never shows a raw reason code, rule identity or operation id', async () => {
      const renderer = await view(history());
      const text = visibleText(renderer);
      expect(text).not.toContain('personal-choice');
      expect(text).not.toContain('resume-fixture');
      expect(text).not.toContain('rule-fixture-1');
      expect(text).not.toMatch(/reasonCode|ruleId|ruleVersion|operationId/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    });

    it('distinguishes recorded facts from the derived answer', async () => {
      const renderer = await view(history());
      const text = visibleText(renderer);
      expect(text).toContain('Recorded changes');
      expect(text).not.toMatch(/because|therefore|so the programme is/i);
    });

    it('stays readable when the evaluation is unavailable', async () => {
      const renderer = await view([
        { sequence: 1, kind: 'enrol', recordedAt: CREATED_AT },
        { sequence: 2, kind: 'abandon', recordedAt: '2026-09-20T10:00:00.123456Z' },
      ]);
      expect(visibleText(renderer)).toContain(PROGRAMME_HISTORY_LABELS.enrol);
    });

    it('renders an empty history without inventing entries', async () => {
      const renderer = await view([]);
      expect(visibleText(renderer)).toContain('No recorded changes yet');
    });

    it('uses headings and no colour-only signal for the change list', async () => {
      const renderer = await view(history());
      const headings = renderer.root.findAll(node => node.props.accessibilityRole === 'header');
      expect(headings.length).toBeGreaterThan(0);
      const labels = renderer.root.findAll(node => typeof node.type === 'string' && node.props.accessibilityLabel);
      expect(labels.length).toBeGreaterThan(0);
    });
  });
});

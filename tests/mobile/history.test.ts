import { describe, expect, it } from 'vitest';

import {
  activityDateLabel,
  activityEditorCopy,
  activityView,
  appendActivityPage,
  composeUnifiedHistory,
  type UnifiedHistoryInput,
} from '../../apps/mobile/src/activity-history';

const passportEntry: UnifiedHistoryInput = {
  id: '80000000-0000-4000-8000-000000000001',
  source: 'passport',
  kind: 'change',
  title: 'Passport goal change',
  effectiveDate: { precision: 'day', value: '2024-02-01' },
  recordedAt: '2024-02-02T10:00:00.000Z',
};

const serviceEntry: UnifiedHistoryInput = {
  id: '80000000-0000-4000-8000-000000000002',
  source: 'service',
  kind: 'baseline',
  title: 'Keratin treatment',
  effectiveDate: { precision: 'month', value: '2024-01' },
  recordedAt: '2024-01-20T10:00:00.000Z',
};

const activityEntry: UnifiedHistoryInput = {
  id: '80000000-0000-4000-8000-000000000003',
  source: 'activity',
  kind: 'baseline',
  title: 'Wash day',
  effectiveDate: { precision: 'exact_day', value: '2024-01-15' },
  recordedAt: '2024-01-15T10:00:00.000Z',
};

describe('unified history', () => {
  it('merges passport, service and activity entries sorted by effective date', () => {
    const timeline = composeUnifiedHistory([passportEntry, serviceEntry, activityEntry]);
    expect(timeline.map(entry => entry.id)).toEqual([activityEntry.id, serviceEntry.id, passportEntry.id]);
    expect(timeline.find(entry => entry.id === activityEntry.id)).toMatchObject({ source: 'activity', title: 'Wash day' });
  });

  it('shows a new activity with its recorded precision', () => {
    const timeline = composeUnifiedHistory([activityEntry]);
    expect(timeline[0]).toMatchObject({ title: 'Wash day' });
    expect(activityDateLabel(activityEntry.effectiveDate)).toBe('2024-01-15');
    expect(activityDateLabel({ precision: 'exact_month', value: '2024-02' })).toBe('Approximately 2024-02');
    expect(activityDateLabel({ precision: 'unknown', value: null })).toBe('Date unknown');
  });

  it('hides superseded corrections in the default view but shows them in the audit', () => {
    const original: UnifiedHistoryInput = { ...activityEntry, id: '80000000-0000-4000-8000-000000000010' };
    const correction: UnifiedHistoryInput = {
      id: '80000000-0000-4000-8000-000000000011',
      source: 'activity',
      kind: 'correction',
      title: 'Wash day (corrected)',
      effectiveDate: { precision: 'exact_day', value: '2024-01-15' },
      recordedAt: '2024-01-16T10:00:00.000Z',
      supersedesId: original.id,
      reason: 'typo',
    };
    const marked = { ...original, superseded: true };
    expect(composeUnifiedHistory([marked, correction]).map(entry => entry.id)).toEqual([correction.id]);
    const audit = composeUnifiedHistory([marked, correction], { includeAudit: true });
    expect(audit.map(entry => entry.id)).toEqual([correction.id, original.id]);
    expect(audit.find(entry => entry.id === original.id)).toMatchObject({ superseded: true });
  });

  it('hides voided activities by default but keeps them audit-visible', () => {
    const voided: UnifiedHistoryInput = { ...activityEntry, voided: true, kind: 'void' };
    expect(composeUnifiedHistory([passportEntry, voided])).toHaveLength(1);
    const audit = composeUnifiedHistory([passportEntry, voided], { includeAudit: true });
    expect(audit).toHaveLength(2);
    expect(audit.find(entry => entry.id === voided.id)).toMatchObject({ voided: true });
  });

  it('sorts unknown effective dates after known dates', () => {
    const unknown: UnifiedHistoryInput = {
      id: '80000000-0000-4000-8000-000000000020',
      source: 'activity',
      kind: 'baseline',
      title: 'Undated styling',
      effectiveDate: { precision: 'unknown', value: null },
      recordedAt: '2024-03-01T10:00:00.000Z',
    };
    const timeline = composeUnifiedHistory([unknown, passportEntry]);
    expect(timeline.map(entry => entry.id)).toEqual([passportEntry.id, unknown.id]);
  });

  it('labels editor actions and list states without recommendation language', () => {
    expect(activityEditorCopy('add')).toMatchObject({ title: 'Record an activity', submit: 'Save activity' });
    expect(activityEditorCopy('correction')).toMatchObject({ title: 'Correct this activity entry', submit: 'Save correction' });
    expect(activityEditorCopy('void')).toMatchObject({ title: 'Void this activity entry', submit: 'Void activity' });
    expect(activityView(true, [], null)).toBe('loading');
    expect(activityView(false, [], null)).toBe('empty');
    expect(activityView(false, [{ id: 'x' }], null)).toBe('list');
    expect(appendActivityPage([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]).map(item => item.id)).toEqual(['a', 'b']);
  });
});

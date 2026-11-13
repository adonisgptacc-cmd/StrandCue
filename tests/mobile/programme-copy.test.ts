import { describe, expect, it } from 'vitest';

import { ProgrammeMissingFactCodeSchema } from '../../packages/domain/src/treatment-programme.ts';
import {
  BLOCKED_CONTENT_COPY,
  FORBIDDEN_PHRASES,
  MISSING_FACT_GUIDANCE,
  PAUSE_REASON_CODES,
  PAUSE_REASON_LABELS,
  PROGRAMME_ACTIVITY_DESTINATION,
  PROGRAMME_DUE_LABELS,
  PROGRAMME_EVENT_KIND_LABELS,
  PROGRAMME_HISTORY_LABELS,
  PROGRAMME_STATE_LABELS,
  PROGRAMME_UNIT_LABELS,
  formatProgrammeCount,
  formatProgrammeDate,
  formatProgrammeRange,
  ownerSafeProductLabel,
  programmeHistoryLabel,
  programmeRangeSentence,
} from '../../apps/mobile/src/programme-copy.ts';

// Owner-facing wording. The evaluator reports scheduling facts only, so no
// label may imply that a treatment worked, that hair health was assessed, or
// that an owner is overdue, non-compliant or at fault.

const HISTORY_KINDS = ['enrol', 'change', 'pause', 'resume', 'maintenance', 'complete', 'abandon'] as const;

describe('programme state and due-status copy', () => {
  it('uses the exact plain labels for every state', () => {
    expect(PROGRAMME_STATE_LABELS).toEqual({
      not_started: 'Not started',
      initial: 'Initial phase',
      reassessment: 'Ready for review',
      maintenance: 'Maintenance phase',
      paused: 'Paused',
      completed: 'Completed',
    });
  });

  it('uses the exact plain labels for every due status', () => {
    expect(PROGRAMME_DUE_LABELS).toEqual({
      not_due: 'Not due yet',
      eligible: 'Within the reviewed range',
      due: 'Ready for review',
      needs_input: 'More information needed',
    });
  });

  it('keeps wash and shampoo-session as distinct named units', () => {
    expect(PROGRAMME_UNIT_LABELS).toEqual({ wash: 'Washes', 'shampoo-session': 'Shampoo sessions' });
    expect(PROGRAMME_UNIT_LABELS.wash).not.toBe(PROGRAMME_UNIT_LABELS['shampoo-session']);
  });

  it('never renders a raw enum key anywhere in the visible vocabulary', () => {
    for (const [value, label] of [...Object.entries(PROGRAMME_STATE_LABELS), ...Object.entries(PROGRAMME_DUE_LABELS),
      ...Object.entries(PROGRAMME_UNIT_LABELS), ...Object.entries(PROGRAMME_EVENT_KIND_LABELS)]) {
      // A compound stored key form — snake_case or hyphenated — never reaches the
      // owner; every label is plain capitalised words.
      if (value.includes('_') || value.includes('-')) {
        expect(label, value).not.toContain(value);
      }
      expect(label).not.toMatch(/[a-z]+_[a-z]+/);
      expect(label).not.toMatch(/_/);
      expect(label).not.toContain('-');
      expect(label).toMatch(/^[A-Z][a-z]/);
    }
  });

  it('uses non-causal, non-medical wording everywhere', () => {
    const all = [
      ...Object.values(PROGRAMME_STATE_LABELS),
      ...Object.values(PROGRAMME_DUE_LABELS),
      ...Object.values(PROGRAMME_UNIT_LABELS),
      ...Object.values(PROGRAMME_HISTORY_LABELS),
      ...Object.values(PROGRAMME_EVENT_KIND_LABELS),
      ...Object.values(PAUSE_REASON_LABELS),
      ...Object.values(BLOCKED_CONTENT_COPY),
      ...Object.values(MISSING_FACT_GUIDANCE).map(entry => entry.explanation),
    ].join(' | ');
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(all.toLowerCase(), phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it('keeps every label free of identifiers', () => {
    const all = [
      ...Object.values(PROGRAMME_STATE_LABELS), ...Object.values(PROGRAMME_DUE_LABELS),
      ...Object.values(PROGRAMME_UNIT_LABELS), ...Object.values(PROGRAMME_HISTORY_LABELS),
      ...Object.values(PAUSE_REASON_LABELS), ...Object.values(BLOCKED_CONTENT_COPY),
      ...Object.values(MISSING_FACT_GUIDANCE).map(entry => entry.explanation),
    ].join(' | ');
    expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    expect(all).not.toMatch(/sha256/i);
    expect(all).not.toMatch(/https?:\/\//);
    expect(all).not.toMatch(/step-\d|execution-confirmed|activity-recorded/i);
  });
});

describe('blocked reviewed-content copy', () => {
  it('states the honest blocked meaning', () => {
    expect(BLOCKED_CONTENT_COPY.pending).toBe(
      'Treatment programme guidance is not available yet. It needs reviewed product instructions before StrandCue can use it.',
    );
  });

  it('keeps the blocked copy honest and non-blaming', () => {
    for (const copy of Object.values(BLOCKED_CONTENT_COPY)) {
      expect(copy).not.toMatch(/not working|broken|error|try again later|bug|fault/i);
      expect(copy).not.toMatch(/your fault|you (did not|didn'?t)|you must/i);
      expect(copy).not.toMatch(/\b(soon|next week|by \d|promised)\b/i);
      expect(copy).not.toMatch(/try this|we recommend|you should use/i);
    }
  });
});

describe('lifecycle history copy', () => {
  it('labels every recorded lifecycle kind in plain words', () => {
    expect(PROGRAMME_HISTORY_LABELS).toEqual({
      enrol: 'Enrolled',
      change: 'Updated',
      pause: 'Paused',
      resume: 'Resumed',
      maintenance: 'Entered maintenance',
      complete: 'Completed',
      abandon: 'Stopped',
    });
    for (const kind of HISTORY_KINDS) expect(PROGRAMME_HISTORY_LABELS[kind], kind).toBeTruthy();
  });

  it('uses the same neutral wording for stopping a programme', () => {
    expect(PROGRAMME_HISTORY_LABELS.abandon).toBe('Stopped');
  });
});

describe('missing facts become actionable destinations', () => {
  it('guides every structured missing fact to a safe destination', () => {
    const codes = ProgrammeMissingFactCodeSchema.options;
    for (const code of codes) {
      const guidance = MISSING_FACT_GUIDANCE[code];
      expect(guidance, code).toBeDefined();
      expect(guidance.explanation.length, code).toBeGreaterThan(10);
      expect(PROGRAMME_ACTIVITY_DESTINATION, code).toContain(guidance.destination);
    }
  });

  it('routes product problems to My Shelf', () => {
    const codes = ['product-unverified', 'product-version-missing', 'product-rule-mismatch', 'product-version-mismatch'] as const;
    for (const code of codes) {
      expect(MISSING_FACT_GUIDANCE[code].destination, code).toBe('my_shelf');
    }
  });

  it('routes applications and wash facts to Journey history', () => {
    const routineCodes = ['missing-treatment-application', 'multiple-treatment-applications', 'application-product-unknown', 'application-product-mismatch'] as const;
    for (const code of routineCodes) {
      expect(MISSING_FACT_GUIDANCE[code].destination, code).toBe('journey_routines');
    }
    const activityCodes = ['wash-date-unknown', 'shampoo-use-unknown', 'date-precision-too-coarse', 'event-after-asof', 'invalid-or-unsupported-event-facts'] as const;
    for (const code of activityCodes) {
      expect(MISSING_FACT_GUIDANCE[code].destination, code).toBe('journey_activities');
    }
  });

  it('routes a missing reviewed rule to the blocked state and never invents a fix', () => {
    const codes = ['rule-draft', 'rule-withdrawn', 'missing-transition-policy', 'rule-publication-mismatch', 'rule-id-mismatch', 'rule-version-mismatch'] as const;
    for (const code of codes) {
      const guidance = MISSING_FACT_GUIDANCE[code];
      expect(guidance.destination, code).toBe('blocked_content');
      expect(guidance.explanation, code).not.toMatch(/add|enter|record|choose|select a rule/i);
    }
  });

  it('routes pause, resumption and chronology problems to the programme history', () => {
    const codes = ['interruption-without-resumption', 'resumption-version-mismatch', 'resumption-date-invalid', 'application-before-enrolment', 'application-start-date-unknown'] as const;
    for (const code of codes) {
      const guidance = MISSING_FACT_GUIDANCE[code];
      expect(guidance.destination, code).toBe('programme_history');
    }
  });

  it('never shows a field path, an identifier or an enum key to the owner', () => {
    for (const [code, guidance] of Object.entries(MISSING_FACT_GUIDANCE)) {
      expect(guidance.explanation, code).not.toContain(code);
      expect(guidance.explanation, code).not.toMatch(/[a-z]+-[a-z]+-[a-z]+/);
      expect(guidance.explanation, code).not.toMatch(/\{|\(|\[|\/|\\|\.jsonb|->/);
      expect(guidance.explanation, code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
    }
  });
});

describe('owner-selectable pause reasons', () => {
  it('offers only neutral, bounded reason codes with plain labels', () => {
    expect(PAUSE_REASON_CODES.length).toBeGreaterThan(2);
    for (const code of PAUSE_REASON_CODES) {
      expect(code, code).toMatch(/^[a-z][a-z0-9_-]{0,63}$/);
      expect(PAUSE_REASON_LABELS[code], code).toBeTruthy();
    }
  });

  it('offers no medical or free-text explanation', () => {
    for (const label of Object.values(PAUSE_REASON_LABELS)) {
      expect(label.toLowerCase()).not.toMatch(/medical|condition|scalp|reaction|allerg|damage|treatment/);
    }
    expect(Object.keys(PAUSE_REASON_LABELS)).not.toContain('other-free-text');
  });

  it('gives every selectable pause reason a specific safe history label', () => {
    const expected = {
      'personal-choice': 'Owner chose to pause',
      scheduling: 'Schedule changed',
      'product-change': 'Product changed',
      'need-more-time': 'More time needed',
    } as const;
    for (const code of PAUSE_REASON_CODES) {
      expect(programmeHistoryLabel({ kind: 'pause', reasonCode: code }), code).toBe(expected[code as keyof typeof expected]);
      expect(programmeHistoryLabel({ kind: 'pause', reasonCode: code }), code).not.toBe('Paused');
    }
    expect(programmeHistoryLabel({ kind: 'pause' })).toBe('Paused');
    expect(programmeHistoryLabel({ kind: 'change', selectedApplicationEventId: 'recorded-application' })).toBe('Chosen application changed');
    expect(programmeHistoryLabel({ kind: 'unknown-kind' })).toBe('Programme details changed');
  });
});

describe('owner-safe product labels', () => {
  it('keeps ordinary labels and replaces technical or identifying values', () => {
    expect(ownerSafeProductLabel('Fixture treatment product')).toBe('Fixture treatment product');
    for (const unsafe of [
      'https://example.test/product',
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      'rule_fixture-1',
      'sha256:abcdef',
      '',
      undefined,
    ]) {
      expect(ownerSafeProductLabel(unsafe), unsafe).toBe('Treatment product');
    }
  });
});

describe('counts, ranges and dates are shown as owner-friendly facts', () => {
  it('keeps a reviewed range a range', () => {
    expect(formatProgrammeRange({ minimum: 2, maximum: 4 }, 'wash')).toBe('Between 2 and 4 washes');
    expect(formatProgrammeRange({ minimum: 2, maximum: 4 }, 'shampoo-session')).toBe('Between 2 and 4 shampoo sessions');
    expect(programmeRangeSentence({ minimum: 1, maximum: 1 }, 'wash')).toBe('1 wash');
    expect(programmeRangeSentence({ minimum: 2, maximum: 2 }, 'shampoo-session')).toBe('2 shampoo sessions');
  });

  it('never collapses a range to one invented due number', () => {
    expect(programmeRangeSentence({ minimum: 2, maximum: 4 }, 'wash')).not.toBe(programmeRangeSentence({ minimum: 3, maximum: 3 }, 'wash'));
    for (const sentence of [programmeRangeSentence({ minimum: 2, maximum: 4 }, 'wash')]) {
      expect(sentence).toContain('2');
      expect(sentence).toContain('4');
    }
  });

  it('shows a count in the named unit', () => {
    expect(formatProgrammeCount(0, 'wash')).toBe('0 washes');
    expect(formatProgrammeCount(1, 'wash')).toBe('1 wash');
    expect(formatProgrammeCount(3, 'shampoo-session')).toBe('3 shampoo sessions');
  });

  it('formats database timestamps as owner-friendly dates without a raw instant', () => {
    expect(formatProgrammeDate('2026-09-02T08:00:00.000Z')).toBe('2 September 2026, 08:00');
    expect(formatProgrammeDate('2026-09-02T08:04:05.123456Z')).toBe('2 September 2026, 08:04');
    expect(formatProgrammeDate('2026-09-02')).toBe('2 September 2026');
    expect(formatProgrammeDate('2026-09-02T10:00:00.000+02:00')).toBe('2 September 2026, 10:00');
    expect(formatProgrammeDate('not-a-date')).toBe('Date not recorded');
    expect(formatProgrammeDate('')).toBe('Date not recorded');
    expect(formatProgrammeDate('2026-13-02')).toBe('Date not recorded');
    expect(formatProgrammeDate('2026-02-30')).toBe('Date not recorded');
  });

  it('never leaks the raw ISO shape into owner-facing text', () => {
    for (const value of ['2026-09-02T08:00:00.000Z', '2026-09-02T08:04:05.123456Z', '2026-09-02']) {
      const formatted = formatProgrammeDate(value);
      expect(formatted, value).not.toContain('T');
      expect(formatted, value).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(formatted, value).not.toMatch(/Z$|\+00:00/);
    }
  });
});

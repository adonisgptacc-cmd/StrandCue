import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  countWashes,
  type MissingFact,
  type WashCountResult,
  type WashCountRule,
} from '../../packages/domain/src/wash-count.ts';
import { type CareEvent } from '../../packages/domain/src/care-events.ts';

const APP_RUN = 'run-2026-10-13-001';
const AS_OF = '2026-10-13T20:00:00+02:00';

function source(
  recordId: string,
  stepId: string | null,
  position: number | null,
  runId: string | null,
  revision: number | null = null,
) {
  return { recordId, revision, stepId, position, runId };
}

function exact(value: string) {
  return { precision: 'exact' as const, value };
}

function day(value: string) {
  return { precision: 'day' as const, value };
}

function approx(value: string) {
  return { precision: 'approximate' as const, value };
}

const unknownDate = { precision: 'unknown' as const, value: null };

function appEvent(
  eventId: string,
  date: CareEvent['date'],
  recordId = 'exec-app',
  stepId = 'step-application',
  position = 2,
  runId = APP_RUN,
): CareEvent {
  return {
    eventId,
    date,
    kind: 'application',
    provenance: 'execution-confirmed' as const,
    lifecycle: 'active' as const,
    source: source(recordId, stepId, position, runId),
    application: { product: { identity: 'unknown' }, zones: [] },
  } as CareEvent;
}

function washEvent(
  eventId: string,
  date: CareEvent['date'],
  shampooUsed: 'yes' | 'no' | 'unknown',
  recordId = 'exec-wash',
  stepId = 'step-wash',
  position = 1,
  runId = APP_RUN,
  lathers = 1,
): CareEvent {
  return {
    eventId,
    date,
    kind: 'wash',
    provenance: 'execution-confirmed' as const,
    lifecycle: 'active' as const,
    source: source(recordId, stepId, position, runId),
    wash: {
      shampooUsed,
      lathers: { state: 'known' as const, value: lathers },
      product: { identity: 'unknown' },
      zones: [],
    },
  } as CareEvent;
}

function activityWashEvent(
  eventId: string,
  date: CareEvent['date'],
  shampooUsed: 'yes' | 'no' | 'unknown',
  activityId = 'activity-wash',
  sequence = 1,
): CareEvent {
  return {
    eventId,
    date,
    kind: 'wash',
    provenance: 'activity-recorded' as const,
    lifecycle: 'active' as const,
    source: source(activityId, null, null, null, sequence),
    wash: {
      shampooUsed,
      lathers: { state: 'unknown' },
      product: { identity: 'unknown' },
      zones: [],
    },
  } as CareEvent;
}

function heatEvent(
  eventId: string,
  date: CareEvent['date'],
  recordId = 'exec-heat',
  stepId = 'step-heat',
  position = 3,
  runId = APP_RUN,
): CareEvent {
  return {
    eventId,
    date,
    kind: 'heat',
    provenance: 'execution-confirmed' as const,
    lifecycle: 'active' as const,
    source: source(recordId, stepId, position, runId),
    heat: {
      toolIdentity: { state: 'unknown' },
      method: { state: 'unknown' },
      temperature: { state: 'unknown' },
      setting: { state: 'unknown' },
      passes: { state: 'unknown' },
      durationMinutes: { state: 'unknown' },
      durationBand: { state: 'unknown' },
      zones: [],
      attachment: { state: 'unknown' },
    },
  } as CareEvent;
}

function countingRule(overrides: Partial<WashCountRule> = {}): WashCountRule {
  return { ruleId: 'rule-wash-1', unit: 'wash', applicationWashCounts: false, ...overrides } as WashCountRule;
}

function rangeRule(overrides: Partial<WashCountRule> = {}): WashCountRule {
  return countingRule({ range: { minimum: 2, maximum: 6 }, ...overrides });
}

function missingCode(result: WashCountResult): string[] {
  return result.missing.map(fact => fact.code);
}

describe('countWashes: counted results', () => {
  it('1. zero elapsed washes after treatment application', () => {
    const events = [appEvent('app-1', exact('2026-10-13T12:00:00+02:00'))];
    const result = countWashes(events, countingRule(), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
    expect(result.unit).toBe('wash');
    expect(result.range).toBeUndefined();
    expect(result.missing).toEqual([]);
    expect(result.eventsUsed).toEqual([]);
    expect(result.application?.eventId).toBe('app-1');
    expect(result.asOf).toBe(AS_OF);
  });

  it('2. one later active wash counts as one wash', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(1);
    expect(result.eventsUsed.map(ref => ref.eventId)).toEqual(['w-1']);
    expect(result.application?.eventId).toBe('app-1');
  });

  it('3. two later washes count as two', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
      washEvent('w-2', exact('2026-10-13T14:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(2);
  });

  it('4. two lathers in one wash remain one shampoo session', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes', undefined, undefined, undefined, APP_RUN, 2),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(1);
    expect(result.unit).toBe('shampoo-session');
  });

  it('5. explicit shampoo use yes counts as one shampoo session', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(1);
  });

  it('6. explicit shampoo use no does not count as a shampoo session', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'no'),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('7. unknown shampoo use returns needs_input when counting shampoo sessions', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'unknown'),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('shampoo-use-unknown');
    expect(result.range).toBeUndefined();
  });

  it('8. a wash before application is excluded', () => {
    const events = [
      washEvent('w-0', exact('2026-10-13T11:00:00+02:00'), 'yes'),
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
    expect(result.eventsUsed).toEqual([]);
  });

  it('9. a wash after asOf is excluded without becoming elapsed', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-late', exact('2026-10-13T21:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('10. the application wash does not count when the rule says it does not', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-app', exact('2026-10-13T12:30:00+02:00'), 'yes', 'exec-app', 'step-wash', 1, APP_RUN),
    ];
    const result = countWashes(events, countingRule({ applicationWashCounts: false }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('11. the application wash counts once when the rule explicitly says it does', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-app', exact('2026-10-13T12:30:00+02:00'), 'yes', 'exec-app', 'step-wash', 1, APP_RUN),
    ];
    const result = countWashes(events, countingRule({ applicationWashCounts: true }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(1);
    expect(result.eventsUsed.map(ref => ref.eventId)).toEqual(['w-app']);
    expect(result.application?.eventId).toBe('app-1');
  });

  it('12. same-day events are not assumed to be the same session', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      // Same calendar day, different execution: not the application wash.
      washEvent('w-other', exact('2026-10-13T13:00:00+02:00'), 'yes', 'exec-other', 'step-wash', 1, 'run-other'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash', applicationWashCounts: true }), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.count).toBe(1);
    expect(result.eventsUsed.map(ref => ref.eventId)).toEqual(['w-other']);
  });

  it('13. shared confirmed run/session identity is used only when the contract proves it', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-same', exact('2026-10-13T12:30:00+02:00'), 'yes', 'exec-app', 'step-wash', 1, APP_RUN),
      washEvent('w-diff', exact('2026-10-13T13:00:00+02:00'), 'yes', 'exec-other', 'step-wash', 1, 'run-other'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash', applicationWashCounts: true }), AS_OF);

    expect(result.status).toBe('counted');
    // w-same shares the application's execution/run identity: it is the application wash, counted once.
    // w-diff is a later separate session: counted once.
    expect(result.count).toBe(2);
    expect(result.eventsUsed.map(ref => ref.eventId).sort()).toEqual(['w-diff', 'w-same']);
  });

  describe('countWashes: application-wash policy branches', () => {
    it('application wash with shampoo-used no does not count as a shampoo session', () => {
      const events = [
        appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
        washEvent('w-app', exact('2026-10-13T12:30:00+02:00'), 'no', 'exec-app', 'step-wash', 1, APP_RUN),
      ];
      const result = countWashes(
        events,
        countingRule({ unit: 'shampoo-session', applicationWashCounts: true }),
        AS_OF,
      );
      expect(result.status).toBe('counted');
      expect(result.count).toBe(0);
    });

    it('application wash with unknown shampoo use returns needs_input', () => {
      const events = [
        appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
        washEvent('w-app', exact('2026-10-13T12:30:00+02:00'), 'unknown', 'exec-app', 'step-wash', 1, APP_RUN),
      ];
      const result = countWashes(
        events,
        countingRule({ unit: 'shampoo-session', applicationWashCounts: true }),
        AS_OF,
      );
      expect(result.status).toBe('needs_input');
      expect(result.count).toBeUndefined();
      expect(missingCode(result)).toContain('shampoo-use-unknown');
    });

    it('application wash after asOf is not counted', () => {
      const events = [
        appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
        washEvent('w-app', exact('2026-10-14T13:00:00+02:00'), 'yes', 'exec-app', 'step-wash', 1, APP_RUN),
      ];
      const result = countWashes(
        events,
        countingRule({ unit: 'wash', applicationWashCounts: true }),
        AS_OF,
      );
      expect(result.status).toBe('counted');
      expect(result.count).toBe(0);
    });

    it('an activity-recorded application cannot establish the application-wash relationship', () => {
      const events = [
        {
          eventId: 'app-1',
          date: day('2026-10-13'),
          kind: 'application',
          provenance: 'activity-recorded' as const,
          lifecycle: 'active' as const,
          source: { recordId: 'activity-app', revision: 1, stepId: null, position: null, runId: null },
          application: { product: { identity: 'unknown' }, zones: [] },
        } as CareEvent,
        washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
      ];
      const result = countWashes(
        events,
        countingRule({ unit: 'wash', applicationWashCounts: true }),
        AS_OF,
      );
      expect(result.status).toBe('needs_input');
      expect(result.count).toBeUndefined();
      expect(missingCode(result)).toContain('application-wash-relationship-unknown');
    });

    it('an application after asOf skips the application-wash block', () => {
      const events = [appEvent('app-1', exact('2026-10-14T12:00:00+02:00'))];
      const result = countWashes(events, countingRule({ applicationWashCounts: true }), '2026-10-13T20:00:00+02:00');
      expect(result.status).toBe('counted');
      expect(result.count).toBe(0);
    });
  });
});

describe('countWashes: needs_input and unknown facts', () => {
  it('14. unknown application date returns needs_input', () => {
    const events = [appEvent('app-1', unknownDate)];
    const result = countWashes(events, countingRule(), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('application-date-unknown');
    expect(result.application).toBeNull();
    expect(result.eventsUsed).toEqual([]);
  });

  it('15. unknown wash date returns needs_input when it could change the count', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', unknownDate, 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('wash-date-unknown');
  });

  it('16. approximate month precision returns needs_input when relative order is uncertain', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      // Execution-confirmed events cannot carry approximate dates; an
      // activity-recorded wash can. It is treated as an ordinary wash.
      activityWashEvent('w-1', approx('2026-10'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('date-precision-too-coarse');
  });

  it('17. approximate year precision returns needs_input when relative order is uncertain', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      activityWashEvent('w-1', approx('2026'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('date-precision-too-coarse');
  });

  it('18. day-precision ordering behaves deterministically', () => {
    const before = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), activityWashEvent('w-1', day('2026-10-14'), 'yes')],
      countingRule({ unit: 'wash' }),
      '2026-10-14T20:00:00+02:00',
    );
    expect(before.status).toBe('counted');
    expect(before.count).toBe(1);

    const after = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), activityWashEvent('w-1', day('2026-10-12'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    expect(after.status).toBe('counted');
    expect(after.count).toBe(0);
  });

  it('19. exact timestamps with different offsets represent their real chronological order', () => {
    // 12:00+02:00 == 10:00Z == 10:00+00:00: same instant, not after the application.
    const same = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), washEvent('w-1', exact('2026-10-13T10:00:00+00:00'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    expect(same.status).toBe('counted');
    expect(same.count).toBe(0);

    // 13:00+02:00 == 11:00Z is strictly after 10:00Z.
    const later = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    expect(later.status).toBe('counted');
    expect(later.count).toBe(1);
  });
});

describe('countWashes: rule validation and range', () => {
  it('20. manufacturer range is preserved exactly', () => {
    const events = [appEvent('app-1', exact('2026-10-13T12:00:00+02:00'))];
    const result = countWashes(events, rangeRule(), AS_OF);

    expect(result.status).toBe('counted');
    expect(result.range).toEqual({ minimum: 2, maximum: 6 });
  });

  it('21. invalid ranges are rejected', () => {
    expect(() =>
      countWashes(
        [],
        { ruleId: 'rule-wash-1', unit: 'wash', applicationWashCounts: false, range: { minimum: 5, maximum: 3 } } as unknown as WashCountRule,
        AS_OF,
      ),
    ).toThrow(ZodError);
  });

  it('22. negative range bounds are rejected', () => {
    expect(() =>
      countWashes(
        [],
        { ruleId: 'rule-wash-1', unit: 'wash', applicationWashCounts: false, range: { minimum: -1, maximum: 3 } } as unknown as WashCountRule,
        AS_OF,
      ),
    ).toThrow(ZodError);
    expect(() =>
      countWashes(
        [],
        { ruleId: 'rule-wash-1', unit: 'wash', applicationWashCounts: false, range: { minimum: 0, maximum: -1 } } as unknown as WashCountRule,
        AS_OF,
      ),
    ).toThrow(ZodError);
  });

  it('23. unsupported rule units are rejected', () => {
    expect(() => countWashes([], countingRule({ unit: 'shower' as unknown as 'wash' }), AS_OF)).toThrow(ZodError);
  });

  it('24. no application event returns needs_input', () => {
    const result = countWashes([washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes')], countingRule(), AS_OF);

    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('missing-treatment-application');
  });

  it('25. multiple possible active application events return needs_input unless one is selected', () => {
    const events = [
      appEvent('app-a', exact('2026-10-13T12:00:00+02:00'), 'exec-a', 'step-app', 1),
      appEvent('app-b', exact('2026-10-13T12:05:00+02:00'), 'exec-b', 'step-app', 1),
    ];
    const unselected = countWashes(events, countingRule(), AS_OF);
    expect(unselected.status).toBe('needs_input');
    expect(missingCode(unselected)).toContain('multiple-treatment-applications');

    const selected = countWashes(events, countingRule({ applicationEventId: 'app-b' }), AS_OF);
    expect(selected.status).toBe('counted');
    expect(selected.application?.eventId).toBe('app-b');
    expect(selected.count).toBe(0);
  });

  it('26. corrected and backdated event sets recompute deterministically', () => {
    const original = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    const backdated = countWashes(
      [appEvent('app-1', exact('2026-10-10T12:00:00+02:00')), washEvent('w-1', exact('2026-10-11T13:00:00+02:00'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    expect(original.status).toBe('counted');
    expect(original.count).toBe(1);
    expect(backdated.status).toBe('counted');
    expect(backdated.count).toBe(1);

    // The same input always yields byte-identical output.
    const repeated = countWashes(
      [appEvent('app-1', exact('2026-10-13T12:00:00+02:00')), washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes')],
      countingRule({ unit: 'wash' }),
      AS_OF,
    );
    expect(JSON.stringify(original)).toBe(JSON.stringify(repeated));
  });

  it('27. input order does not change output', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
      washEvent('w-2', exact('2026-10-13T14:00:00+02:00'), 'yes'),
    ];
    const first = countWashes([...events], countingRule({ unit: 'wash' }), AS_OF);
    const reversed = countWashes([...events].reverse(), countingRule({ unit: 'wash' }), AS_OF);
    expect(JSON.stringify(first)).toBe(JSON.stringify(reversed));
    expect(first.eventsUsed.map(ref => ref.eventId)).toEqual(reversed.eventsUsed.map(ref => ref.eventId));
  });

  it('28. duplicate event identities fail closed unless byte-identical duplicates are treated idempotently', () => {
    const base = appEvent('app-1', exact('2026-10-13T12:00:00+02:00'));
    const duplicate = { ...base };
    const idempotent = countWashes([base, duplicate], countingRule(), AS_OF);
    expect(idempotent.status).toBe('counted');
    expect(idempotent.count).toBe(0);
  });

  it('29. conflicting duplicate identities fail closed', () => {
    const base = appEvent('app-1', exact('2026-10-13T12:00:00+02:00'));
    const conflicting = { ...base, date: exact('2026-10-13T13:00:00+02:00') };
    expect(() => countWashes([base, conflicting], countingRule(), AS_OF)).toThrow();
  });

  it('30. future events do not count', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-future', exact('2026-10-14T13:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), '2026-10-13T20:00:00+02:00');
    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('31. non-wash events do not count', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      heatEvent('h-1', exact('2026-10-13T13:00:00+02:00')),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);
    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('32. heat events do not count', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      heatEvent('h-1', exact('2026-10-13T13:00:00+02:00'), 'exec-app', 'step-heat', 1, APP_RUN),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);
    expect(result.status).toBe('counted');
    expect(result.count).toBe(0);
  });

  it('33. Cue Check-like or arbitrary objects fail schema validation', () => {
    expect(() => countWashes([{ kind: 'cue-check' as const }] as unknown as CareEvent[], countingRule(), AS_OF)).toThrow(
      ZodError,
    );
    expect(() => countWashes([{ foo: 1 }] as unknown as CareEvent[], countingRule(), AS_OF)).toThrow(ZodError);
  });
});

describe('countWashes: immutability, freezing and honesty', () => {
  it('34. inputs are never mutated', () => {
    const app = appEvent('app-1', exact('2026-10-13T12:00:00+02:00'));
    const wash = washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes');
    const events = Object.freeze([app, wash]);
    const rule = Object.freeze(countingRule({ unit: 'wash' }));
    const before = JSON.stringify({ events, rule });

    countWashes(events, rule, AS_OF);

    expect(JSON.stringify({ events, rule })).toBe(before);
  });

  it('35. output and nested arrays/objects are frozen', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.eventsUsed)).toBe(true);
    expect(Object.isFrozen(result.missing)).toBe(true);
    expect(Object.isFrozen(result.eventsUsed[0])).toBe(true);
    expect(() => (result.eventsUsed as unknown[]).push({ eventId: 'x', kind: 'wash', date: exact('2026-10-13') })).toThrow(
      TypeError,
    );
    expect(() => (result.missing as unknown[]).push({ code: 'x', explanation: 'y' } as unknown as MissingFact)).toThrow(TypeError);
  });

  it('36. empty event input is handled honestly', () => {
    const result = countWashes([], countingRule(), AS_OF);
    expect(result.status).toBe('needs_input');
    expect(result.count).toBeUndefined();
    expect(missingCode(result)).toContain('missing-treatment-application');
  });

  it('37. no wall-clock access affects the result', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
    ];
    const first = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);
    const second = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('38. no product effectiveness or medical language appears in output', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'unknown'),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);
    const serialized = JSON.stringify(result);
    for (const word of ['worked', 'effective', 'cure', 'medical', 'diagnosis', 'efficacy', 'treated', 'stopped']) {
      expect(serialized.toLowerCase()).not.toContain(word);
    }
  });

  it('39. unknown facts remain unknown', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'unknown'),
    ];
    const result = countWashes(events, countingRule({ unit: 'shampoo-session' }), AS_OF);
    expect(result.status).toBe('needs_input');
    expect(missingCode(result)).toContain('shampoo-use-unknown');
    expect(result.count).toBeUndefined();
  });

  it('40. event references contain only the safe identifiers required for auditing', () => {
    const events = [
      appEvent('app-1', exact('2026-10-13T12:00:00+02:00')),
      washEvent('w-1', exact('2026-10-13T13:00:00+02:00'), 'yes'),
    ];
    const result = countWashes(events, countingRule({ unit: 'wash' }), AS_OF);
    const allowed = new Set(['eventId', 'kind', 'date']);
    for (const ref of result.eventsUsed) {
      for (const key of Object.keys(ref)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
    if (result.application !== null) {
      for (const key of Object.keys(result.application)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });
});

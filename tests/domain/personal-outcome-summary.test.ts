import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  CueCheckRecordSchema,
  MINIMUM_COMPARABLE_SAMPLE,
  PersonalOutcomeSummarySchema,
  summarizePersonalOutcomes,
  type CueCheckRecord,
} from '../../packages/domain/src/index.ts';

const CONTEXT = { goal: 'basic_wash' } as const;

const ANSWER_KEYS = [
  'overallResult',
  'satisfaction',
  'dryness',
  'frizz',
  'softness',
  'tangling',
  'buildup',
  'breakage',
  'styleLongevity',
  'immediateReaction',
  'wouldUseAgain',
  'notes',
] as const;

let recordCounter = 0;

/**
 * Builds one valid, parsed CueCheckRecord. Every record must record at least
 * one answer, so the factory answers "less frizz" only when the test itself
 * supplied no answer; tests always override exactly what they assert.
 */
function makeRecord(patch: Record<string, unknown> = {}): CueCheckRecord {
  recordCounter += 1;
  const hasAnswer = ANSWER_KEYS.some(key => key in patch);
  const defaultAnswer = hasAnswer ? {} : { frizz: 'less' };
  return CueCheckRecordSchema.parse({
    recordId: `1b9d6bcd-bbfd-4b97-b05d-${String(recordCounter).padStart(12, '0')}`,
    executionId: `execution-${recordCounter}`,
    recommendationRunId: `run-${recordCounter}`,
    goal: 'basic_wash',
    revision: 1,
    lifecycle: 'active',
    timing: 'immediate',
    observedAt: '2026-10-20T09:00:00+02:00',
    ...defaultAnswer,
    ...patch,
  });
}

function frizzRecords(count: number, value: string, patch: Record<string, unknown> = {}) {
  return Array.from({ length: count }, () => makeRecord({ frizz: value, ...patch }));
}

/**
 * Independent oracle copies of the owner-facing wording inventory. These are
 * deliberate duplicates of the production tables: any drift in the produced
 * sentences must fail here, because the honest-wording boundary is only as
 * strong as its weakest future edit.
 */
const EXPECTED_PHRASES: Record<string, Record<string, string>> = {
  overallResult: {
    better: 'a better result than usual',
    same: 'a similar result to usual',
    worse: 'a worse result than usual',
  },
  satisfaction: {
    satisfied: 'feeling satisfied',
    neutral: 'feeling neutral',
    dissatisfied: 'feeling dissatisfied',
  },
  dryness: { less: 'less dryness', same: 'similar dryness', more: 'more dryness' },
  frizz: { less: 'less frizz', same: 'similar frizz', more: 'more frizz' },
  softness: { less: 'less softness', same: 'similar softness', more: 'more softness' },
  tangling: { less: 'less tangling', same: 'similar tangling', more: 'more tangling' },
  buildup: {
    less: 'less buildup or heaviness',
    same: 'similar buildup or heaviness',
    more: 'more buildup or heaviness',
  },
  breakage: {
    less: 'noticing less breakage',
    same: 'noticing similar breakage',
    more: 'noticing more breakage',
  },
  styleLongevity: {
    shorter: 'a shorter-lasting style',
    similar: 'a similar-lasting style',
    longer: 'a longer-lasting style',
  },
  immediateReaction: {
    'none-noticed': 'noticing no reaction',
    'some-noticed': 'noticing a reaction',
  },
  wouldUseAgain: {
    yes: 'you would use this routine again',
    no: 'you would not use this routine again',
    unsure: 'you were unsure about using this routine again',
  },
};

const EXPECTED_SUBJECTS: Record<string, string> = {
  overallResult: 'your overall result',
  satisfaction: 'how satisfied you felt',
  dryness: 'dryness',
  frizz: 'frizz',
  softness: 'softness',
  tangling: 'tangling',
  buildup: 'buildup or heaviness',
  breakage: 'breakage',
  styleLongevity: 'how long your style lasted',
  immediateReaction: 'reactions',
  wouldUseAgain: 'using this routine again',
};

describe('personal outcome summaries', () => {
  it('defines the explicit minimum comparable sample', () => {
    expect(MINIMUM_COMPARABLE_SAMPLE).toBe(3);
  });

  it('returns no summaries for zero records without inventing an observation', () => {
    expect(summarizePersonalOutcomes([], CONTEXT)).toEqual([]);
  });

  it('reports one sparse record honestly as insufficient evidence', () => {
    const summaries = summarizePersonalOutcomes([makeRecord({ frizz: 'less' })], CONTEXT);

    expect(summaries).toEqual([
      {
        observation: 'frizz',
        timing: 'immediate',
        comparableContext: { goal: 'basic_wash' },
        reportedValue: 'less',
        numerator: 1,
        denominator: 1,
        unknownCount: 0,
        recency: { firstObservedAt: '2026-10-20T09:00:00+02:00', latestObservedAt: '2026-10-20T09:00:00+02:00' },
        evidence: 'insufficient',
        wording: 'Not enough comparable answers yet to show a pattern about frizz.',
      },
    ]);
  });

  it('does not invent a trend from two sparse records', () => {
    const summaries = summarizePersonalOutcomes(frizzRecords(2, 'less'), CONTEXT);

    expect(summaries[0].numerator).toBe(2);
    expect(summaries[0].denominator).toBe(2);
    expect(summaries[0].evidence).toBe('insufficient');
    expect(summaries[0].wording).toBe('Not enough comparable answers yet to show a pattern about frizz.');
  });

  it('counts comparable uses with exact numerator and denominator', () => {
    const records = [
      ...frizzRecords(3, 'less', { observedAt: '2026-10-19T09:00:00+02:00' }),
      makeRecord({ frizz: 'same', observedAt: '2026-10-22T09:00:00+02:00' }),
    ];

    expect(summarizePersonalOutcomes(records, CONTEXT)).toEqual([
      {
        observation: 'frizz',
        timing: 'immediate',
        comparableContext: { goal: 'basic_wash' },
        reportedValue: 'less',
        numerator: 3,
        denominator: 4,
        unknownCount: 0,
        recency: { firstObservedAt: '2026-10-19T09:00:00+02:00', latestObservedAt: '2026-10-22T09:00:00+02:00' },
        evidence: 'sufficient',
        wording: 'You reported less frizz in 3 of 4 comparable uses you answered.',
      },
      {
        observation: 'frizz',
        timing: 'immediate',
        comparableContext: { goal: 'basic_wash' },
        reportedValue: 'same',
        numerator: 1,
        denominator: 4,
        unknownCount: 0,
        recency: { firstObservedAt: '2026-10-19T09:00:00+02:00', latestObservedAt: '2026-10-22T09:00:00+02:00' },
        evidence: 'sufficient',
        wording: 'You reported similar frizz in 1 of 4 comparable uses you answered.',
      },
    ]);
  });

  it('produces pattern wording only at the minimum comparable sample', () => {
    const exactlyMinimum = summarizePersonalOutcomes(frizzRecords(3, 'less'), CONTEXT);
    expect(exactlyMinimum[0].evidence).toBe('sufficient');
    expect(exactlyMinimum[0].wording).toBe('You reported less frizz in 3 of 3 comparable uses you answered.');

    const belowMinimum = summarizePersonalOutcomes(frizzRecords(2, 'less'), CONTEXT);
    expect(belowMinimum[0].evidence).toBe('insufficient');
  });

  it('keeps explicit unknowns from unlocking pattern wording', () => {
    const summaries = summarizePersonalOutcomes(
      [...frizzRecords(2, 'less'), ...Array.from({ length: 2 }, () => makeRecord({ frizz: 'unknown' }))],
      CONTEXT,
    );

    expect(summaries[0]).toMatchObject({ numerator: 2, denominator: 2, unknownCount: 2, evidence: 'insufficient' });
  });

  it('keeps immediate and delayed observations in separate denominators', () => {
    const records = [
      ...frizzRecords(3, 'less'),
      ...frizzRecords(1, 'less', { timing: 'delayed' }),
    ];

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      observation: 'frizz',
      timing: 'immediate',
      numerator: 3,
      denominator: 3,
    });
    expect(summaries[1]).toMatchObject({
      observation: 'frizz',
      timing: 'delayed',
      numerator: 1,
      denominator: 1,
      evidence: 'insufficient',
    });
  });

  it('never counts corrected or voided records as active observations', () => {
    const records = [
      ...frizzRecords(3, 'less'),
      makeRecord({ frizz: 'more', lifecycle: 'corrected' }),
      makeRecord({ frizz: 'same', lifecycle: 'voided' }),
    ];

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ numerator: 3, denominator: 3, unknownCount: 0 });
  });

  it('never silently combines records from a different comparable context', () => {
    const foreignRecord = {
      ...makeRecord({ frizz: 'same' }),
      goal: 'treatment_day',
    } as unknown as CueCheckRecord;

    const summaries = summarizePersonalOutcomes([...frizzRecords(3, 'less'), foreignRecord], CONTEXT);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ reportedValue: 'less', numerator: 3, denominator: 3 });
    expect(summaries[0].comparableContext).toEqual({ goal: 'basic_wash' });
  });

  it('keeps explicit unknown answers out of the denominator and never turns them negative', () => {
    const allUnknown = summarizePersonalOutcomes(
      Array.from({ length: 3 }, () => makeRecord({ frizz: 'unknown' })),
      CONTEXT,
    );

    expect(allUnknown).toEqual([
      {
        observation: 'frizz',
        timing: 'immediate',
        comparableContext: { goal: 'basic_wash' },
        reportedValue: null,
        numerator: 0,
        denominator: 0,
        unknownCount: 3,
        recency: null,
        evidence: 'insufficient',
        wording: 'Not enough comparable answers yet to show a pattern about frizz.',
      },
    ]);

    const withOneUnknown = summarizePersonalOutcomes(
      [...frizzRecords(3, 'less'), makeRecord({ frizz: 'unknown' })],
      CONTEXT,
    );

    expect(withOneUnknown[0]).toMatchObject({ numerator: 3, denominator: 3, unknownCount: 1 });
  });

  it('keeps a missing answer missing instead of counting it anywhere', () => {
    const records = [
      ...frizzRecords(3, 'less'),
      makeRecord({ overallResult: 'better' }),
    ];

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    const frizz = summaries.find(summary => summary.observation === 'frizz');
    expect(frizz).toMatchObject({ numerator: 3, denominator: 3, unknownCount: 0 });
  });

  it('excludes an out-of-vocabulary answer from every count instead of inflating the denominator', () => {
    const records = [
      ...frizzRecords(2, 'less'),
      {
        ...makeRecord({ overallResult: 'better' }),
        frizz: 'sparkly',
      } as unknown as CueCheckRecord,
    ];

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    const frizz = summaries.find(summary => summary.observation === 'frizz');
    expect(frizz).toMatchObject({ numerator: 2, denominator: 2, unknownCount: 0, evidence: 'insufficient' });
  });

  it('refuses to double-count two active records for one execution and timing', () => {
    const first = makeRecord({ frizz: 'less' });
    const records = [first, makeRecord({ frizz: 'less', executionId: first.executionId })];

    expect(() => summarizePersonalOutcomes(records, CONTEXT)).toThrow(/two active Cue Checks/i);
  });

  it('fails closed with a clear error when a comparable record carries an unparseable observation time', () => {
    const records = [
      ...frizzRecords(1, 'less'),
      {
        ...makeRecord({ frizz: 'less' }),
        observedAt: 'not-a-timestamp',
      } as unknown as CueCheckRecord,
    ];

    expect(() => summarizePersonalOutcomes(records, CONTEXT)).toThrow(/parseable/i);
  });

  it('rejects a lenient, non-offset observation time at the same integrity guard', () => {
    const records = [
      ...frizzRecords(1, 'less'),
      {
        ...makeRecord({ frizz: 'same' }),
        observedAt: '2026-10-20',
      } as unknown as CueCheckRecord,
    ];

    expect(() => summarizePersonalOutcomes(records, CONTEXT)).toThrow(/parseable/i);
  });

  it('reports every distinct answer for one field with its own numerator', () => {
    const records = [
      makeRecord({ wouldUseAgain: 'yes' }),
      makeRecord({ wouldUseAgain: 'yes' }),
      makeRecord({ wouldUseAgain: 'no' }),
      makeRecord({ wouldUseAgain: 'unsure' }),
      makeRecord({ wouldUseAgain: 'unknown' }),
    ];

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    expect(summaries).toEqual([
      expect.objectContaining({
        observation: 'wouldUseAgain',
        reportedValue: 'yes',
        numerator: 2,
        denominator: 4,
        unknownCount: 1,
        wording: 'You reported you would use this routine again in 2 of 4 comparable uses you answered.',
      }),
      expect.objectContaining({
        observation: 'wouldUseAgain',
        reportedValue: 'no',
        numerator: 1,
        denominator: 4,
        wording: 'You reported you would not use this routine again in 1 of 4 comparable uses you answered.',
      }),
      expect.objectContaining({
        observation: 'wouldUseAgain',
        reportedValue: 'unsure',
        numerator: 1,
        denominator: 4,
        wording: 'You reported you were unsure about using this routine again in 1 of 4 comparable uses you answered.',
      }),
    ]);
  });

  it('orders summaries canonically by field, then timing, independent of record order', () => {
    const records = [
      makeRecord({ frizz: 'less', overallResult: 'better', wouldUseAgain: 'yes' }),
      makeRecord({ frizz: 'less', overallResult: 'better', wouldUseAgain: 'yes' }),
      makeRecord({ frizz: 'less', overallResult: 'better', wouldUseAgain: 'yes' }),
    ];
    const reversed = [...records].reverse();

    const summaries = summarizePersonalOutcomes(reversed, CONTEXT);

    expect(summaries.map(summary => summary.observation)).toEqual(['overallResult', 'frizz', 'wouldUseAgain']);
    expect(JSON.stringify(summarizePersonalOutcomes(records, CONTEXT))).toBe(
      JSON.stringify(summarizePersonalOutcomes(reversed, CONTEXT)),
    );
  });

  it('produces byte-identical output for equivalent records in a different order', () => {
    const records = [
      makeRecord({ frizz: 'less', observedAt: '2026-10-19T09:00:00+02:00' }),
      makeRecord({ frizz: 'same', observedAt: '2026-10-20T09:00:00+02:00' }),
      makeRecord({ frizz: 'less', observedAt: '2026-10-21T09:00:00+02:00' }),
      makeRecord({ frizz: 'less', observedAt: '2026-10-22T09:00:00+02:00' }),
    ];

    const first = summarizePersonalOutcomes(records, CONTEXT);
    const second = summarizePersonalOutcomes([...records].reverse(), CONTEXT);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.map(summary => summary.reportedValue)).toEqual(['less', 'same']);
  });

  it('resolves equal instants in different offset forms to the same recency window', () => {
    const plusTwo = makeRecord({ frizz: 'less', observedAt: '2026-10-20T09:00:00+02:00' });
    const zulu = makeRecord({ frizz: 'same', observedAt: '2026-10-20T07:00:00Z' });

    const first = summarizePersonalOutcomes([plusTwo, zulu], CONTEXT);
    const second = summarizePersonalOutcomes([zulu, plusTwo], CONTEXT);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0].recency).toEqual({
      firstObservedAt: '2026-10-20T07:00:00Z',
      latestObservedAt: '2026-10-20T09:00:00+02:00',
    });
  });

  it('returns frozen summaries and never mutates the caller records', () => {
    const records = frizzRecords(3, 'less');
    const before = JSON.stringify(records);

    const summaries = summarizePersonalOutcomes(records, CONTEXT);

    expect(Object.isFrozen(summaries)).toBe(true);
    expect(summaries.every(summary => Object.isFrozen(summary))).toBe(true);
    expect(JSON.stringify(records)).toBe(before);
  });

  it('fails closed on an invalid summarization context', () => {
    const records = frizzRecords(1, 'less');

    expect(() => summarizePersonalOutcomes(records, {} as unknown as typeof CONTEXT)).toThrow(ZodError);
    expect(() =>
      summarizePersonalOutcomes(records, { goal: 'basic_wash', extra: true } as unknown as typeof CONTEXT),
    ).toThrow(ZodError);
  });

  it('rejects a summary whose wording leaves the canonical owner-facing template', () => {
    const [real] = summarizePersonalOutcomes([makeRecord({ frizz: 'less' })], CONTEXT);

    expect(() =>
      PersonalOutcomeSummarySchema.parse({ ...real, wording: 'This routine works great every time.' }),
    ).toThrow(ZodError);
  });

  it('rejects a summary whose reported value does not belong to its observation field', () => {
    const [real] = summarizePersonalOutcomes([makeRecord({ frizz: 'less' })], CONTEXT);

    expect(() => PersonalOutcomeSummarySchema.parse({ ...real, reportedValue: 'better' })).toThrow(ZodError);
  });

  it('rejects a summary whose counts break the honesty invariants', () => {
    const [real] = summarizePersonalOutcomes([makeRecord({ frizz: 'less' })], CONTEXT);

    expect(() => PersonalOutcomeSummarySchema.parse({ ...real, numerator: 5 })).toThrow(ZodError);
    expect(() => PersonalOutcomeSummarySchema.parse({ ...real, denominator: 0 })).toThrow(ZodError);
    expect(() => PersonalOutcomeSummarySchema.parse({ ...real, recency: null })).toThrow(ZodError);
  });

  it('rejects pattern wording below the minimum comparable sample at the schema boundary', () => {
    const [real] = summarizePersonalOutcomes([makeRecord({ frizz: 'less' })], CONTEXT);

    expect(() =>
      PersonalOutcomeSummarySchema.parse({
        ...real,
        evidence: 'sufficient',
        wording: 'You reported less frizz in 1 of 1 comparable uses you answered.',
      }),
    ).toThrow(ZodError);
  });

  it('never uses causal, medical, repair, growth, proof, guarantee or universal-safety language', () => {
    const banned = [
      'caused', 'causes', 'cause',
      'fixed', 'repaired', 'repair',
      'proved', 'proven',
      'guarantee', 'guaranteed',
      'best', 'safest', 'safe',
      'works', 'worked',
      'grow', 'grew', 'growth',
      'medical', 'clinically', 'clinical',
      'healed', 'cures', 'cure',
      'treated', 'treats', 'treat',
      'diagnos',
      'effect', 'improv', 'heal', 'restor', 'strong', 'strength',
      'solv', 'health', 'therap', 'undefined',
      'fix', 'work',
    ];

    const fields: [string, string, 'immediate' | 'delayed'][] = [
      ['overallResult', 'better', 'immediate'],
      ['overallResult', 'same', 'immediate'],
      ['overallResult', 'worse', 'immediate'],
      ['satisfaction', 'satisfied', 'immediate'],
      ['satisfaction', 'neutral', 'immediate'],
      ['satisfaction', 'dissatisfied', 'immediate'],
      ['dryness', 'less', 'immediate'],
      ['dryness', 'same', 'immediate'],
      ['dryness', 'more', 'immediate'],
      ['frizz', 'less', 'immediate'],
      ['frizz', 'same', 'immediate'],
      ['frizz', 'more', 'immediate'],
      ['softness', 'less', 'immediate'],
      ['softness', 'same', 'immediate'],
      ['softness', 'more', 'immediate'],
      ['tangling', 'less', 'immediate'],
      ['tangling', 'same', 'immediate'],
      ['tangling', 'more', 'immediate'],
      ['buildup', 'less', 'immediate'],
      ['buildup', 'same', 'immediate'],
      ['buildup', 'more', 'immediate'],
      ['breakage', 'less', 'immediate'],
      ['breakage', 'same', 'immediate'],
      ['breakage', 'more', 'immediate'],
      ['styleLongevity', 'shorter', 'delayed'],
      ['styleLongevity', 'similar', 'delayed'],
      ['styleLongevity', 'longer', 'delayed'],
      ['immediateReaction', 'none-noticed', 'immediate'],
      ['immediateReaction', 'some-noticed', 'immediate'],
      ['wouldUseAgain', 'yes', 'immediate'],
      ['wouldUseAgain', 'no', 'immediate'],
      ['wouldUseAgain', 'unsure', 'immediate'],
    ];

    for (const [field, value, timing] of fields) {
      for (const sample of ['sparse', 'comparable'] as const) {
        const count = sample === 'comparable' ? MINIMUM_COMPARABLE_SAMPLE : 1;
        const records = Array.from({ length: count }, () => makeRecord({ timing, [field]: value }));
        const summaries = summarizePersonalOutcomes(records, CONTEXT);

        expect(summaries.length).toBeGreaterThan(0);
        const expected =
          sample === 'comparable'
            ? `You reported ${EXPECTED_PHRASES[field][value]} in ${MINIMUM_COMPARABLE_SAMPLE} of ${MINIMUM_COMPARABLE_SAMPLE} comparable uses you answered.`
            : `Not enough comparable answers yet to show a pattern about ${EXPECTED_SUBJECTS[field]}.`;

        for (const summary of summaries) {
          const lower = summary.wording.toLowerCase();
          for (const term of banned) {
            expect(lower.includes(term)).toBe(false);
          }
          expect(summary.wording).toBe(expected);
        }
      }
    }
  });
});

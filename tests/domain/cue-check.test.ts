import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import {
  CUE_CHECK_OBSERVATION_FIELDS,
  CueCheckDefiniteValueSchema,
  CueCheckOutcomeFieldSchemas,
  CueCheckRecordSchema,
  CueCheckRevisionSchema,
  normalizeCueCheckInput,
  validateCueCheckHistory,
} from '../../packages/domain/src/index.ts';

// Injected clock for every temporal assertion: 2026-10-22 12:00 SAST.
// The contracts never read the wall clock in tests.
const NOW = new Date('2026-10-22T12:00:00+02:00');

const OBSERVED_AT = '2026-10-22T11:30:00+02:00';
const RECEIVED_AT = '2026-10-22T11:31:00+02:00';
const RECORD_ID = '1b9d6bcd-bbfd-4b97-b05d-b93f1c0e0a1e';
const REVISION_ID = '9f8e7d6c-5b4a-4c3d-8e1f-0a9b8c7d6e5f';
const CORRECTS_REVISION_ID = '8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d';

function validInput() {
  return {
    timing: 'immediate',
    observedAt: OBSERVED_AT,
    overallResult: 'better',
  };
}

function validRecord() {
  return {
    recordId: RECORD_ID,
    executionId: 'execution-1',
    recommendationRunId: 'run-1',
    goal: 'basic_wash',
    revision: 1,
    lifecycle: 'active',
    timing: 'immediate',
    observedAt: OBSERVED_AT,
    overallResult: 'better',
  };
}

function validCreateRevision() {
  return {
    revisionId: REVISION_ID,
    recordId: RECORD_ID,
    sequence: 1,
    receivedAt: RECEIVED_AT,
    kind: 'create',
    observation: validInput(),
  };
}

// Every structured outcome field with every accepted value. Style longevity
// only exists on delayed observations, so its rows use that timing.
const FIELD_VALUES: [string, string, 'immediate' | 'delayed'][] = [
  ['overallResult', 'better', 'immediate'],
  ['overallResult', 'same', 'immediate'],
  ['overallResult', 'worse', 'immediate'],
  ['overallResult', 'unknown', 'immediate'],
  ['satisfaction', 'satisfied', 'immediate'],
  ['satisfaction', 'neutral', 'immediate'],
  ['satisfaction', 'dissatisfied', 'immediate'],
  ['satisfaction', 'unknown', 'immediate'],
  ['dryness', 'less', 'immediate'],
  ['dryness', 'same', 'immediate'],
  ['dryness', 'more', 'immediate'],
  ['dryness', 'unknown', 'immediate'],
  ['frizz', 'less', 'immediate'],
  ['frizz', 'same', 'immediate'],
  ['frizz', 'more', 'immediate'],
  ['frizz', 'unknown', 'immediate'],
  ['softness', 'less', 'immediate'],
  ['softness', 'same', 'immediate'],
  ['softness', 'more', 'immediate'],
  ['softness', 'unknown', 'immediate'],
  ['tangling', 'less', 'immediate'],
  ['tangling', 'same', 'immediate'],
  ['tangling', 'more', 'immediate'],
  ['tangling', 'unknown', 'immediate'],
  ['buildup', 'less', 'immediate'],
  ['buildup', 'same', 'immediate'],
  ['buildup', 'more', 'immediate'],
  ['buildup', 'unknown', 'immediate'],
  ['breakage', 'less', 'immediate'],
  ['breakage', 'same', 'immediate'],
  ['breakage', 'more', 'immediate'],
  ['breakage', 'unknown', 'immediate'],
  ['immediateReaction', 'none-noticed', 'immediate'],
  ['immediateReaction', 'some-noticed', 'immediate'],
  ['immediateReaction', 'unknown', 'immediate'],
  ['wouldUseAgain', 'yes', 'immediate'],
  ['wouldUseAgain', 'no', 'immediate'],
  ['wouldUseAgain', 'unsure', 'immediate'],
  ['wouldUseAgain', 'unknown', 'immediate'],
  ['styleLongevity', 'shorter', 'delayed'],
  ['styleLongevity', 'similar', 'delayed'],
  ['styleLongevity', 'longer', 'delayed'],
  ['styleLongevity', 'unknown', 'delayed'],
];

describe('Cue Check contracts', () => {
  it('accepts a minimal immediate observation', () => {
    const parsed = normalizeCueCheckInput(validInput(), NOW);

    expect(parsed.timing).toBe('immediate');
    expect(parsed.observedAt).toBe(OBSERVED_AT);
    expect(parsed.overallResult).toBe('better');
  });

  it('accepts a minimal delayed observation', () => {
    const parsed = normalizeCueCheckInput({ ...validInput(), timing: 'delayed' }, NOW);

    expect(parsed.timing).toBe('delayed');
  });

  it.each(FIELD_VALUES)('accepts %s "%s" as a structured outcome answer', (field, value, timing) => {
    const parsed = normalizeCueCheckInput({ timing, observedAt: OBSERVED_AT, [field]: value }, NOW);

    expect((parsed as Record<string, unknown>)[field]).toBe(value);
  });

  it('keeps an unanswered field missing instead of turning it into an answer', () => {
    const parsed = normalizeCueCheckInput(validInput(), NOW);

    expect(parsed.frizz).toBeUndefined();
    expect('frizz' in parsed).toBe(false);
  });

  it('treats an explicit unknown answer as different from a missing answer', () => {
    const parsed = normalizeCueCheckInput({ ...validInput(), frizz: 'unknown' }, NOW);

    expect(parsed.frizz).toBe('unknown');
  });

  it('preserves owner notes exactly as recorded', () => {
    const notes = '  felt fine \nsecond line ';

    expect(normalizeCueCheckInput({ ...validInput(), notes }, NOW).notes).toBe(notes);
  });

  it('accepts notes up to the 2000-character bound and rejects more', () => {
    expect(normalizeCueCheckInput({ ...validInput(), notes: 'x'.repeat(2000) }, NOW).notes).toHaveLength(2000);
    expect(() => normalizeCueCheckInput({ ...validInput(), notes: 'x'.repeat(2001) }, NOW)).toThrow(ZodError);
  });

  it('rejects an observation with no answer and no note', () => {
    expect(() => normalizeCueCheckInput({ timing: 'immediate', observedAt: OBSERVED_AT }, NOW)).toThrow(
      /at least one answer or a note/i,
    );
  });

  it('accepts an explicit unknown answer as the single recorded statement', () => {
    const parsed = normalizeCueCheckInput(
      { timing: 'immediate', observedAt: OBSERVED_AT, frizz: 'unknown' },
      NOW,
    );

    expect(parsed.frizz).toBe('unknown');
  });

  it.each([
    ['a frizz value outside the vocabulary', { frizz: 'sparkly' }],
    ['an overall result outside the vocabulary', { overallResult: 'amazing' }],
    ['a satisfaction value outside the vocabulary', { satisfaction: 'ok' }],
    ['an immediate reaction outside the vocabulary', { immediateReaction: 'burning' }],
    ['a would-use-again value outside the vocabulary', { wouldUseAgain: 'maybe' }],
    ['a style-longevity value from another field', { timing: 'delayed' as const, styleLongevity: 'more' }],
  ])('rejects %s', (_name, patch) => {
    expect(() => normalizeCueCheckInput({ ...validInput(), ...patch }, NOW)).toThrow(/invalid/i);
  });

  it('rejects a timing outside immediate or delayed', () => {
    expect(() => normalizeCueCheckInput({ ...validInput(), timing: 'later' }, NOW)).toThrow(/invalid/i);
  });

  it('rejects a style-longevity answer on an immediate observation', () => {
    expect(() => normalizeCueCheckInput({ ...validInput(), styleLongevity: 'longer' }, NOW)).toThrow(
      /delayed/i,
    );
  });

  it('accepts a style-longevity answer on a delayed observation', () => {
    const parsed = normalizeCueCheckInput(
      { ...validInput(), timing: 'delayed', styleLongevity: 'longer' },
      NOW,
    );

    expect(parsed.styleLongevity).toBe('longer');
  });

  it('requires an offset-aware observation time', () => {
    expect(() => normalizeCueCheckInput({ ...validInput(), observedAt: '2026-10-22T11:30:00' }, NOW)).toThrow(
      ZodError,
    );
  });

  it('rejects an observation time in the future', () => {
    expect(() => normalizeCueCheckInput({ ...validInput(), observedAt: '2026-10-22T12:00:01+02:00' }, NOW)).toThrow(
      /future/i,
    );
  });

  it('accepts an observation recorded exactly now', () => {
    expect(
      normalizeCueCheckInput({ ...validInput(), observedAt: '2026-10-22T12:00:00+02:00' }, NOW).observedAt,
    ).toBe('2026-10-22T12:00:00+02:00');
  });

  it('returns frozen observation values', () => {
    const parsed = normalizeCueCheckInput(validInput(), NOW);

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => {
      (parsed as Record<string, unknown>).frizz = 'more';
    }).toThrow(TypeError);
  });

  it('never mutates the caller input', () => {
    const raw = validInput();
    const before = JSON.stringify(raw);

    normalizeCueCheckInput(raw, NOW);

    expect(JSON.stringify(raw)).toBe(before);
  });

  it('produces byte-identical normalized output for reordered equivalent input', () => {
    const first = normalizeCueCheckInput(
      { timing: 'immediate', observedAt: OBSERVED_AT, overallResult: 'better', notes: 'ok' },
      NOW,
    );
    const second = normalizeCueCheckInput(
      { notes: 'ok', overallResult: 'better', timing: 'immediate', observedAt: OBSERVED_AT },
      NOW,
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('rejects an unrecognized key on an observation', () => {
    expect(() => normalizeCueCheckInput({ ...validInput(), wouldRecommend: true }, NOW)).toThrow(
      /unrecognized key/i,
    );
  });

  it('accepts a minimal bound record', () => {
    const parsed = CueCheckRecordSchema.parse(validRecord());

    expect(parsed.recordId).toBe(RECORD_ID);
    expect(parsed.goal).toBe('basic_wash');
    expect(parsed.lifecycle).toBe('active');
    expect(parsed.revision).toBe(1);
    expect(parsed.executionId).toBe('execution-1');
    expect(parsed.recommendationRunId).toBe('run-1');
  });

  it('keeps corrected and voided history records parseable with their full content', () => {
    const corrected = CueCheckRecordSchema.parse({ ...validRecord(), lifecycle: 'corrected' });

    expect(corrected.lifecycle).toBe('corrected');
    expect(corrected.overallResult).toBe('better');

    const voided = CueCheckRecordSchema.parse({ ...validRecord(), lifecycle: 'voided', revision: 2 });

    expect(voided.lifecycle).toBe('voided');
    expect(voided.overallResult).toBe('better');
  });

  it.each([
    ['revision zero', { revision: 0 }],
    ['a negative revision', { revision: -1 }],
    ['a fractional revision', { revision: 1.5 }],
    ['an empty execution id', { executionId: '' }],
    ['an empty recommendation run id', { recommendationRunId: '' }],
    ['a record id that is not a uuid', { recordId: 'not-a-uuid' }],
    ['a goal outside the vocabulary', { goal: 'treatment_day' }],
    ['a lifecycle outside the vocabulary', { lifecycle: 'deleted' }],
    ['a missing record id', { recordId: undefined }],
  ])('rejects a record with %s', (_name, patch) => {
    expect(() => CueCheckRecordSchema.parse({ ...validRecord(), ...patch })).toThrow(ZodError);
  });

  it('rejects an impossible immediate style-longevity record', () => {
    expect(() => CueCheckRecordSchema.parse({ ...validRecord(), styleLongevity: 'longer' })).toThrow(
      /delayed/i,
    );
  });

  it('rejects an unrecognized key on a record', () => {
    expect(() => CueCheckRecordSchema.parse({ ...validRecord(), ownerSuppliedRun: 'run-9' })).toThrow(
      /unrecognized key/i,
    );
  });

  it('produces byte-identical record output for reordered equivalent input', () => {
    const first = CueCheckRecordSchema.parse(validRecord());
    const second = CueCheckRecordSchema.parse(
      Object.fromEntries(Object.entries(validRecord()).reverse()),
    );

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('accepts a create revision as the first revision', () => {
    const parsed = CueCheckRevisionSchema.parse(validCreateRevision());

    expect(parsed.kind).toBe('create');
  });

  it('rejects a create revision that is not the first', () => {
    expect(() => CueCheckRevisionSchema.parse({ ...validCreateRevision(), sequence: 2 })).toThrow(/first/i);
  });

  it('validates an embedded observation with the same answer rules', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        ...validCreateRevision(),
        observation: { timing: 'immediate', observedAt: OBSERVED_AT },
      }),
    ).toThrow(/at least one answer or a note/i);
  });

  it('accepts a correction that follows a prior revision', () => {
    const parsed = CueCheckRevisionSchema.parse({
      revisionId: REVISION_ID,
      recordId: RECORD_ID,
      sequence: 2,
      receivedAt: RECEIVED_AT,
      kind: 'correct',
      observation: validInput(),
      correctsRevisionId: CORRECTS_REVISION_ID,
      correctionReason: 'I tapped the wrong answer',
    });

    expect(parsed.kind).toBe('correct');
  });

  it('rejects a correction without its target revision, reason or replacement content', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
      }),
    ).toThrow(ZodError);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        correctsRevisionId: CORRECTS_REVISION_ID,
        correctionReason: 'I tapped the wrong answer',
      }),
    ).toThrow(ZodError);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: CORRECTS_REVISION_ID,
      }),
    ).toThrow(ZodError);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: CORRECTS_REVISION_ID,
        correctionReason: '   ',
      }),
    ).toThrow(ZodError);
  });

  it('rejects a correction that would be the first revision', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 1,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: CORRECTS_REVISION_ID,
        correctionReason: 'I tapped the wrong answer',
      }),
    ).toThrow(/first/i);
  });

  it('accepts a void as an audit event with a bounded reason', () => {
    const parsed = CueCheckRevisionSchema.parse({
      revisionId: REVISION_ID,
      recordId: RECORD_ID,
      sequence: 2,
      receivedAt: RECEIVED_AT,
      kind: 'void',
      voidReason: 'Wrong execution',
    });

    expect(parsed.kind).toBe('void');
  });

  it('rejects a void carrying observation content', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'void',
        voidReason: 'Wrong execution',
        observation: validInput(),
      }),
    ).toThrow(ZodError);
  });

  it('rejects a void without a reason or as the first revision', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'void',
      }),
    ).toThrow(ZodError);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 1,
        receivedAt: RECEIVED_AT,
        kind: 'void',
        voidReason: 'Wrong execution',
      }),
    ).toThrow(/first/i);
  });

  it('bounds correction and void reasons to 500 trimmed characters', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: CORRECTS_REVISION_ID,
        correctionReason: 'x'.repeat(501),
      }),
    ).toThrow(ZodError);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'void',
        voidReason: 'x'.repeat(501),
      }),
    ).toThrow(ZodError);
  });

  it('rejects a revision kind outside create, correct and void', () => {
    expect(() => CueCheckRevisionSchema.parse({ ...validCreateRevision(), kind: 'update' })).toThrow(ZodError);
  });

  it('rejects an unrecognized key on a revision', () => {
    expect(() => CueCheckRevisionSchema.parse({ ...validCreateRevision(), extra: true })).toThrow(
      /unrecognized key/i,
    );
  });

  it('returns frozen record and revision values', () => {
    expect(Object.isFrozen(CueCheckRecordSchema.parse(validRecord()))).toBe(true);
    expect(Object.isFrozen(CueCheckRevisionSchema.parse(validCreateRevision()))).toBe(true);
  });

  it('rejects a revision observed after it was received', () => {
    const lateObservation = { ...validInput(), observedAt: '2026-10-22T11:32:00+02:00' };

    expect(() =>
      CueCheckRevisionSchema.parse({ ...validCreateRevision(), observation: lateObservation }),
    ).toThrow(/received/i);

    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: lateObservation,
        correctsRevisionId: CORRECTS_REVISION_ID,
        correctionReason: 'I tapped the wrong answer',
      }),
    ).toThrow(/received/i);
  });

  it('accepts a revision observed exactly when it was received', () => {
    const parsed = CueCheckRevisionSchema.parse({
      ...validCreateRevision(),
      observation: { ...validInput(), observedAt: RECEIVED_AT },
    });

    expect(parsed.kind).toBe('create');
  });

  it('rejects a correction that names itself as its target', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: REVISION_ID,
        correctionReason: 'I tapped the wrong answer',
      }),
    ).toThrow(/itself/i);
  });

  it('rejects an empty-string note as the only recorded statement', () => {
    expect(() => normalizeCueCheckInput({ timing: 'immediate', observedAt: OBSERVED_AT, notes: '' }, NOW)).toThrow(
      /at least one answer or a note/i,
    );
  });

  it('requires an offset-aware receipt time on revisions', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({ ...validCreateRevision(), receivedAt: '2026-10-22T11:31:00' }),
    ).toThrow(ZodError);
  });

  it('rejects a correction whose target id is not a uuid', () => {
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: RECEIVED_AT,
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: 'not-a-uuid',
        correctionReason: 'I tapped the wrong answer',
      }),
    ).toThrow(ZodError);
  });

  it('rejects revision sequences at zero or fractional values', () => {
    expect(() => CueCheckRevisionSchema.parse({ ...validCreateRevision(), sequence: 0 })).toThrow(ZodError);
    expect(() =>
      CueCheckRevisionSchema.parse({ ...validCreateRevision(), sequence: 1.5 }),
    ).toThrow(ZodError);
    expect(() =>
      CueCheckRevisionSchema.parse({
        revisionId: REVISION_ID,
        recordId: RECORD_ID,
        sequence: 2.5,
        receivedAt: RECEIVED_AT,
        kind: 'void',
        voidReason: 'Wrong execution',
      }),
    ).toThrow(ZodError);
  });

  it('keeps the canonical field list, value schemas and definite values in sync', () => {
    expect([...CUE_CHECK_OBSERVATION_FIELDS].sort()).toEqual(
      Object.keys(CueCheckOutcomeFieldSchemas).sort(),
    );

    const definiteValues = CueCheckDefiniteValueSchema.options as readonly string[];
    for (const field of CUE_CHECK_OBSERVATION_FIELDS) {
      const fieldValues = (CueCheckOutcomeFieldSchemas[field].options as readonly string[]).filter(
        value => value !== 'unknown',
      );
      expect(fieldValues.length).toBeGreaterThan(0);
      for (const value of fieldValues) {
        expect(definiteValues.includes(value)).toBe(true);
      }
    }
  });

  describe('Cue Check history validation', () => {
    const HISTORY_A = 'c0ffee01-0000-4000-8000-000000000001';
    const HISTORY_B = 'c0ffee02-0000-4000-8000-000000000002';
    const HISTORY_C = 'c0ffee03-0000-4000-8000-000000000003';

    function createRevision() {
      return {
        revisionId: HISTORY_A,
        recordId: RECORD_ID,
        sequence: 1,
        receivedAt: '2026-10-22T11:31:00+02:00',
        kind: 'create',
        observation: validInput(),
      };
    }

    function correctRevision(patch: Record<string, unknown> = {}) {
      return {
        revisionId: HISTORY_B,
        recordId: RECORD_ID,
        sequence: 2,
        receivedAt: '2026-10-22T11:40:00+02:00',
        kind: 'correct',
        observation: validInput(),
        correctsRevisionId: HISTORY_A,
        correctionReason: 'I tapped the wrong answer',
        ...patch,
      };
    }

    function voidRevision(patch: Record<string, unknown> = {}) {
      return {
        revisionId: HISTORY_C,
        recordId: RECORD_ID,
        sequence: 3,
        receivedAt: '2026-10-22T11:50:00+02:00',
        kind: 'void',
        voidReason: 'Wrong execution',
        ...patch,
      };
    }

    it('accepts a coherent create, correct and void history', () => {
      const history = validateCueCheckHistory([createRevision(), correctRevision(), voidRevision()]);

      expect(history).toHaveLength(3);
      expect(Object.isFrozen(history)).toBe(true);
    });

    it('rejects an empty history', () => {
      expect(() => validateCueCheckHistory([])).toThrow(ZodError);
    });

    it('rejects a history without exactly one create revision', () => {
      expect(() => validateCueCheckHistory([correctRevision(), voidRevision()])).toThrow(/exactly one create/i);
      expect(() =>
        validateCueCheckHistory([createRevision(), { ...createRevision(), revisionId: HISTORY_B, sequence: 2 }]),
      ).toThrow(/exactly one create/i);
    });

    it('rejects a history with a sequence gap', () => {
      expect(() => validateCueCheckHistory([createRevision(), voidRevision()])).toThrow(/contiguous/i);
    });

    it('rejects a history that mixes record identities', () => {
      expect(() =>
        validateCueCheckHistory([createRevision(), { ...voidRevision(), recordId: HISTORY_A }]),
      ).toThrow(/identity/i);
    });

    it('rejects a correction that targets a missing revision', () => {
      const dangling = 'c0ffee09-0000-4000-8000-000000000009';

      expect(() =>
        validateCueCheckHistory([createRevision(), correctRevision({ correctsRevisionId: dangling })]),
      ).toThrow(/existing/i);
    });

    it('rejects two corrections of the same target', () => {
      expect(() =>
        validateCueCheckHistory([
          createRevision(),
          correctRevision(),
          correctRevision({ revisionId: HISTORY_C, sequence: 3, receivedAt: '2026-10-22T11:50:00+02:00' }),
        ]),
      ).toThrow(/at most once/i);
    });

    it('rejects a correction received before its target', () => {
      expect(() =>
        validateCueCheckHistory([
          createRevision(),
          correctRevision({ receivedAt: '2026-10-22T11:30:00+02:00' }),
        ]),
      ).toThrow(/no later/i);
    });

    it('rejects a history that repeats a revision identity', () => {
      expect(() =>
        validateCueCheckHistory([
          createRevision(),
          correctRevision(),
          voidRevision({ revisionId: HISTORY_B }),
        ]),
      ).toThrow(/revision identity/i);
    });

    it('accepts a correction of a correction', () => {
      const history = validateCueCheckHistory([
        createRevision(),
        correctRevision(),
        correctRevision({
          revisionId: HISTORY_C,
          sequence: 3,
          receivedAt: '2026-10-22T11:50:00+02:00',
          correctsRevisionId: HISTORY_B,
        }),
      ]);

      expect(history).toHaveLength(3);
    });
  });
});

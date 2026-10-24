import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  correctCueCheck,
  getCueCheck,
  listCueChecks,
  recordCueCheck,
  voidCueCheck,
} from '../../apps/mobile/src/cue-check-api';
import {
  CUE_CHECK_ERROR_CODES,
  CUE_CHECK_ERROR_COPY,
  CueCheckError,
  toCueCheckFailure,
} from '../../apps/mobile/src/cue-check-errors';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const clientMocks = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock('../../apps/mobile/src/client', () => ({
  get supabase() {
    return clientMocks.supabase;
  },
}));

const OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
const RECORD_ID = '77777777-7777-4777-8777-777777777777';
const REVISION_ID = '88888888-8888-4888-8888-888888888888';
const REVISION_ID_2 = '99999999-9999-4999-8999-999999999999';
const ROW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const OBSERVED_AT = '2026-10-22T09:30:00-05:00';
const RECEIVED_AT = '2026-10-22T14:31:00.123456+00:00';
const NOTES = '  felt fine\nreally  ';

function observation(overrides: Record<string, unknown> = {}) {
  return {
    timing: 'immediate',
    observedAt: OBSERVED_AT,
    overallResult: 'better',
    dryness: 'unknown',
    notes: NOTES,
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    recordId: RECORD_ID,
    executionId: EXECUTION_ID,
    recommendationRunId: RUN_ID,
    goal: 'basic_wash',
    timing: 'immediate',
    lifecycle: 'active',
    revision: 1,
    observedAt: OBSERVED_AT,
    receivedAt: RECEIVED_AT,
    observation: observation(),
    confirmedSteps: [
      {
        stepId: 'step-1',
        position: 1,
        confirmedAt: '2026-10-22T14:20:00+00:00',
        action: 'Rinse',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
      },
    ],
    executionStatus: 'completed',
    createdAt: RECEIVED_AT,
    updatedAt: RECEIVED_AT,
    ...overrides,
  };
}

function createRevision(overrides: Record<string, unknown> = {}) {
  return {
    revisionId: REVISION_ID,
    sequence: 1,
    kind: 'create',
    observation: observation(),
    correctsId: null,
    correctionReason: null,
    voidReason: null,
    receivedAt: RECEIVED_AT,
    state: 'active',
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return { ...receipt(), revisions: [createRevision()], ...overrides };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return { operationId: OPERATION_ID, executionId: EXECUTION_ID, observation: observation(), ...overrides };
}

function validCorrect(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID,
    recordId: RECORD_ID,
    expectedRevision: 1,
    observation: observation({ overallResult: 'same' }),
    reason: 'Picked the wrong answer',
    ...overrides,
  };
}

function validVoid(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID,
    recordId: RECORD_ID,
    expectedRevision: 1,
    reason: 'Entered by mistake',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientMocks.supabase = { rpc: rpcMocks.rpc, from: rpcMocks.from };
});

describe('Cue Check RPC boundary', () => {
  it('records through public.record_cue_check with exactly the documented arguments', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    const result = await recordCueCheck(validRecord());
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('record_cue_check', {
      p_operation_id: OPERATION_ID,
      p_execution_id: EXECUTION_ID,
      p_observation: observation(),
    });
    expect(result.recordId).toBe(RECORD_ID);
  });

  it('corrects through public.correct_cue_check with a trimmed reason', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt({ revision: 2 }), error: null });
    await correctCueCheck(validCorrect({ reason: '  Picked the wrong answer  ' }));
    expect(rpcMocks.rpc).toHaveBeenCalledWith('correct_cue_check', {
      p_operation_id: OPERATION_ID,
      p_record_id: RECORD_ID,
      p_expected_revision: 1,
      p_observation: observation({ overallResult: 'same' }),
      p_reason: 'Picked the wrong answer',
    });
  });

  it('voids through public.void_cue_check', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt({ revision: 2, lifecycle: 'voided' }), error: null });
    const result = await voidCueCheck(validVoid());
    expect(rpcMocks.rpc).toHaveBeenCalledWith('void_cue_check', {
      p_operation_id: OPERATION_ID,
      p_record_id: RECORD_ID,
      p_expected_revision: 1,
      p_reason: 'Entered by mistake',
    });
    expect(result.lifecycle).toBe('voided');
  });

  it('lists through public.list_cue_checks with a null cursor on the first page', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: { items: [receipt()], nextCursor: null }, error: null });
    const page = await listCueChecks({ limit: 20, cursor: null });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_cue_checks', { p_limit: 20, p_cursor: null });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it('forwards a valid keyset cursor unchanged', async () => {
    const cursor = { createdAt: RECEIVED_AT, id: ROW_ID };
    rpcMocks.rpc.mockResolvedValue({ data: { items: [], nextCursor: cursor }, error: null });
    const page = await listCueChecks({ limit: 5, cursor });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_cue_checks', { p_limit: 5, p_cursor: cursor });
    expect(page.nextCursor).toEqual(cursor);
  });

  it('reads detail through public.get_cue_check with its revision history', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: detail(), error: null });
    const result = await getCueCheck(RECORD_ID);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('get_cue_check', { p_record_id: RECORD_ID });
    expect(result.revisions).toHaveLength(1);
  });

  it('parses a full correction and void history', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: detail({
        revision: 3,
        lifecycle: 'voided',
        revisions: [
          createRevision({ state: 'corrected' }),
          createRevision({
            revisionId: REVISION_ID_2,
            sequence: 2,
            kind: 'correct',
            correctsId: REVISION_ID,
            correctionReason: 'Changed my mind',
            observation: observation({ overallResult: 'same' }),
            state: 'voided',
          }),
          {
            revisionId: ROW_ID,
            sequence: 3,
            kind: 'void',
            observation: null,
            correctsId: REVISION_ID_2,
            correctionReason: null,
            voidReason: 'Entered by mistake',
            receivedAt: RECEIVED_AT,
            state: null,
          },
        ],
      }),
      error: null,
    });
    const result = await getCueCheck(RECORD_ID);
    expect(result.revisions.map(revision => revision.kind)).toEqual(['create', 'correct', 'void']);
  });

  it('never touches Cue Check tables directly', async () => {
    rpcMocks.rpc.mockResolvedValueOnce({ data: receipt(), error: null });
    rpcMocks.rpc.mockResolvedValueOnce({ data: detail(), error: null });
    await recordCueCheck(validRecord());
    await getCueCheck(RECORD_ID);
    expect(rpcMocks.from).not.toHaveBeenCalled();
  });
});

describe('Cue Check command validation', () => {
  const forbiddenFacts = [
    'userId',
    'ownerId',
    'recommendationRunId',
    'goal',
    'lifecycle',
    'confirmedSteps',
    'executionStatus',
    'receivedAt',
    'createdAt',
    'updatedAt',
  ];

  it.each(forbiddenFacts)('rejects a client-supplied %s on every mutation', async fact => {
    await expect(recordCueCheck(validRecord({ [fact]: 'x' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(correctCueCheck(validCorrect({ [fact]: 'x' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(voidCueCheck(validVoid({ [fact]: 'x' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it.each(forbiddenFacts)('rejects %s smuggled inside an observation', async fact => {
    await expect(recordCueCheck(validRecord({ observation: observation({ [fact]: 'x' }) }))).rejects.toMatchObject({
      code: 'invalid-observation',
    });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers without calling the server', async () => {
    await expect(recordCueCheck(validRecord({ operationId: 'nope' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(recordCueCheck(validRecord({ executionId: 'nope' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(correctCueCheck(validCorrect({ recordId: 'nope' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(voidCueCheck(validVoid({ operationId: '' }))).rejects.toMatchObject({ code: 'invalid-operation' });
    await expect(getCueCheck('nope')).rejects.toMatchObject({ code: 'invalid-operation' });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, '1', null])('rejects expected revision %s', async revision => {
    await expect(correctCueCheck(validCorrect({ expectedRevision: revision }))).rejects.toMatchObject({
      code: 'invalid-operation',
    });
    await expect(voidCueCheck(validVoid({ expectedRevision: revision }))).rejects.toMatchObject({
      code: 'invalid-operation',
    });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it.each(['', '   ', 'x'.repeat(501), 42])('rejects reason %j', async reason => {
    await expect(correctCueCheck(validCorrect({ reason }))).rejects.toMatchObject({ code: 'invalid-reason' });
    await expect(voidCueCheck(validVoid({ reason }))).rejects.toMatchObject({ code: 'invalid-reason' });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts a reason of exactly 500 characters', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt({ lifecycle: 'voided', revision: 2 }), error: null });
    await voidCueCheck(validVoid({ reason: 'x'.repeat(500) }));
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects observations the Cue Check domain rejects', async () => {
    const bad = [
      observation({ observedAt: '2026-10-22T09:30:00' }),
      observation({ timing: 'immediate', styleLongevity: 'longer' }),
      observation({ overallResult: 'cured' }),
      { timing: 'immediate', observedAt: OBSERVED_AT },
      observation({ notes: 'n'.repeat(2001) }),
    ];
    for (const value of bad) {
      await expect(recordCueCheck(validRecord({ observation: value }))).rejects.toMatchObject({
        code: 'invalid-observation',
      });
      await expect(correctCueCheck(validCorrect({ observation: value }))).rejects.toMatchObject({
        code: 'invalid-observation',
      });
    }
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([0, 101, 1.5, -3, '20', null, undefined])('rejects page size %s', async limit => {
    await expect(listCueChecks({ limit, cursor: null })).rejects.toMatchObject({ code: 'invalid-page' });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { createdAt: RECEIVED_AT },
    { createdAt: RECEIVED_AT, id: 'not-a-uuid' },
    { createdAt: 'yesterday', id: ROW_ID },
    { createdAt: RECEIVED_AT, id: ROW_ID, extra: 1 },
    'abc',
  ])('rejects cursor %j', async cursor => {
    await expect(listCueChecks({ limit: 10, cursor })).rejects.toMatchObject({ code: 'invalid-cursor' });
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects extra keys on a list query', async () => {
    await expect(listCueChecks({ limit: 10, cursor: null, ownerId: 'x' })).rejects.toMatchObject({
      code: 'invalid-page',
    });
  });

  it('never calls the server with a non-object command', async () => {
    await expect(recordCueCheck(null)).rejects.toBeInstanceOf(CueCheckError);
    await expect(voidCueCheck('x')).rejects.toBeInstanceOf(CueCheckError);
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });
});

describe('preservation of what the owner recorded', () => {
  it('keeps notes, explicit unknown answers and the offset-aware observedAt exactly', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    const result = await recordCueCheck(validRecord());
    expect(result.observation.notes).toBe(NOTES);
    expect(result.observation.dryness).toBe('unknown');
    expect(result.observation.observedAt).toBe(OBSERVED_AT);
    expect(result.observedAt).toBe(OBSERVED_AT);
    expect(rpcMocks.rpc.mock.calls[0]?.[1].p_observation.notes).toBe(NOTES);
  });

  it('does not turn missing answers into negative or unknown ones', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    const result = await recordCueCheck(validRecord());
    for (const field of ['frizz', 'softness', 'tangling', 'buildup', 'breakage', 'wouldUseAgain', 'satisfaction']) {
      expect(field in result.observation).toBe(false);
    }
    const sent = rpcMocks.rpc.mock.calls[0]?.[1].p_observation as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['dryness', 'notes', 'observedAt', 'overallResult', 'timing']);
  });

  it('returns frozen, immutable results', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: detail(), error: null });
    const result = await getCueCheck(RECORD_ID);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('strict response parsing fails closed', () => {
  const malformed: readonly (readonly [string, unknown])[] = [
    ['null', null],
    ['a string', 'ok'],
    ['an unknown server key', receipt({ ownerId: RECORD_ID })],
    ['a missing field', (({ confirmedSteps: _omit, ...rest }) => rest)(receipt())],
    ['a bad record id', receipt({ recordId: 'x' })],
    ['an unknown goal', receipt({ goal: 'heal' })],
    ['an unknown lifecycle', receipt({ lifecycle: 'corrected-ish' })],
    ['a zero revision', receipt({ revision: 0 })],
    ['a timezone-less receipt time', receipt({ receivedAt: '2026-10-22T14:31:00' })],
    ['an observedAt that disagrees with the observation', receipt({ observedAt: '2026-10-22T09:31:00-05:00' })],
    ['a timing that disagrees with the observation', receipt({ timing: 'delayed' })],
    ['an observation received before it was observed', receipt({ receivedAt: '2026-10-22T14:00:00+00:00' })],
    ['an unknown execution status', receipt({ executionStatus: 'in_progress' })],
    ['a confirmed step with an extra key', receipt({ confirmedSteps: [{ ...receipt().confirmedSteps[0], extra: 1 }] })],
    ['an invalid observation', receipt({ observation: observation({ dryness: 'maybe' }) })],
  ];

  it.each(malformed)('rejects %s as an untrusted response', async (_name, data) => {
    rpcMocks.rpc.mockResolvedValue({ data, error: null });
    await expect(recordCueCheck(validRecord())).rejects.toMatchObject({
      code: 'malformed-response',
      message: CUE_CHECK_ERROR_COPY['malformed-response'],
    });
  });

  it('rejects a list with an unknown key, a duplicate record or too many items', async () => {
    for (const data of [
      { items: [], nextCursor: null, extra: 1 },
      { items: [receipt(), receipt()], nextCursor: null },
      { items: [receipt(), receipt({ recordId: REVISION_ID })], nextCursor: null },
      { items: [], nextCursor: { createdAt: RECEIVED_AT } },
      { items: 'x', nextCursor: null },
    ]) {
      rpcMocks.rpc.mockResolvedValue({ data, error: null });
      await expect(listCueChecks({ limit: 1, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
    }
  });

  it('rejects incoherent detail histories', async () => {
    const histories: unknown[] = [
      [],
      [createRevision({ sequence: 2 })],
      [createRevision(), createRevision({ sequence: 3, revisionId: REVISION_ID_2, kind: 'void', observation: null, voidReason: 'x', correctsId: REVISION_ID, state: null })],
      [createRevision({ extra: 1 })],
      [createRevision({ kind: 'void' })],
      [createRevision({ recordId: ROW_ID })],
    ];
    for (const revisions of histories) {
      rpcMocks.rpc.mockResolvedValue({ data: detail({ revisions }), error: null });
      await expect(getCueCheck(RECORD_ID)).rejects.toMatchObject({ code: 'malformed-response' });
    }
  });

  it('rejects a detail whose head revision disagrees with the record revision or lifecycle', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: detail({ revision: 2 }), error: null });
    await expect(getCueCheck(RECORD_ID)).rejects.toMatchObject({ code: 'malformed-response' });
    rpcMocks.rpc.mockResolvedValue({ data: detail({ lifecycle: 'voided' }), error: null });
    await expect(getCueCheck(RECORD_ID)).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('rejects a detail for a different record than the one requested', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: detail({ recordId: ROW_ID }), error: null });
    await expect(getCueCheck(RECORD_ID)).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('never echoes the malformed payload in the error', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt({ goal: 'SECRET-PAYLOAD' }), error: null });
    const error = await recordCueCheck(validRecord()).catch((e: unknown) => e as Error);
    expect(String((error as Error).message)).not.toContain('SECRET-PAYLOAD');
    expect(JSON.stringify(error)).not.toContain('SECRET-PAYLOAD');
  });
});

describe('stable error mapping', () => {
  it('has explicit plain copy for every known code', () => {
    expect(CUE_CHECK_ERROR_CODES.length).toBe(24);
    for (const code of CUE_CHECK_ERROR_CODES) {
      const copy = CUE_CHECK_ERROR_COPY[code];
      expect(copy.length).toBeGreaterThan(8);
      expect(copy).not.toMatch(/sqlstate|uuid|rpc|public\.|function|table|cue_check|exception|stack|[0-9a-f]{8}-[0-9a-f]{4}/i);
      expect(copy).not.toMatch(/caus|fix|repair|heal|grow|strengthen|treat|guarantee|cure|proof|proves/i);
    }
  });

  const serverCodes = [
    'authentication-required',
    'account-not-active',
    'invalid-operation',
    'invalid-observation',
    'execution-not-found',
    'execution-not-terminal',
    'execution-not-usable',
    'run-not-consistent',
    'duplicate-active',
    'record-not-found',
    'revision-conflict',
    'record-voided',
    'no-op-correction',
    'timing-mismatch',
    'operation-conflict',
    'invalid-reason',
    'quota-exceeded',
    'invalid-page',
    'invalid-cursor',
    'invalid-receipt-order',
  ] as const;

  it.each(serverCodes)('maps the stable server code %s to its plain copy', async code => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: code, code: '22023', details: 'secret detail' } });
    const error = (await recordCueCheck(validRecord()).catch((e: unknown) => e)) as CueCheckError;
    expect(error).toBeInstanceOf(CueCheckError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(CUE_CHECK_ERROR_COPY[code]);
    expect(JSON.stringify(error)).not.toContain('secret detail');
  });

  it('uses the exact product wording for the headline cases', () => {
    expect(CUE_CHECK_ERROR_COPY['execution-not-terminal']).toBe('Finish or stop this routine before recording how it went.');
    expect(CUE_CHECK_ERROR_COPY['duplicate-active']).toBe('You already recorded this check-in. Open it to review or correct it.');
    expect(CUE_CHECK_ERROR_COPY['revision-conflict']).toBe('This check-in changed on another session. Reload it before trying again.');
    expect(CUE_CHECK_ERROR_COPY['record-voided']).toBe('This check-in was removed from your active history.');
    expect(CUE_CHECK_ERROR_COPY['run-not-consistent']).toBe('This routine record cannot be used for a check-in.');
    expect(CUE_CHECK_ERROR_COPY['execution-not-usable']).toBe('This routine record cannot be used for a check-in.');
    expect(CUE_CHECK_ERROR_COPY['quota-exceeded']).toBe('No more entries can be added to this routine record.');
    expect(CUE_CHECK_ERROR_COPY.offline).toBe('You appear to be offline. Your unsent answers are still here.');
    expect(CUE_CHECK_ERROR_COPY['malformed-response']).toBe('This check-in could not be read safely.');
  });

  it('fails closed to neutral copy for unknown server messages without leaking them', async () => {
    const leaky = 'duplicate key value violates unique constraint "cue_checks_pkey" (SQLSTATE 23505) at public.record_cue_check';
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: leaky, code: '23505' } });
    const error = (await recordCueCheck(validRecord()).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('unknown');
    expect(error.message).toBe(CUE_CHECK_ERROR_COPY.unknown);
    expect(JSON.stringify(error)).not.toMatch(/SQLSTATE|cue_checks|record_cue_check/);
    expect(error.stack ?? '').not.toContain('SQLSTATE');
  });

  it('does not treat a code embedded in a longer message as a stable code', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'wrapped: revision-conflict in public.fn', code: 'P0001' } });
    const error = (await recordCueCheck(validRecord()).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('unknown');
  });

  it('maps a thrown network failure to offline', async () => {
    rpcMocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = (await recordCueCheck(validRecord()).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('offline');
    expect(error.message).toBe(CUE_CHECK_ERROR_COPY.offline);
  });

  it('maps a transport error object to offline', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' } });
    const error = (await getCueCheck(RECORD_ID).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('offline');
  });

  it('does not call a server-side statement timeout "offline"', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    const error = (await getCueCheck(RECORD_ID).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('unknown');
  });

  it('never tells a failed read that unsent answers are still here', () => {
    for (const source of ['list', 'page', 'detail'] as const) {
      for (const code of ['offline', 'unknown'] as const) {
        const failure = toCueCheckFailure(new CueCheckError(code), source);
        expect(failure.message).not.toMatch(/unsent answers/i);
        expect(failure.message.length).toBeGreaterThan(10);
      }
    }
    expect(toCueCheckFailure(new CueCheckError('offline'), 'create').message).toBe(CUE_CHECK_ERROR_COPY.offline);
    expect(toCueCheckFailure(new CueCheckError('unknown'), 'correct').message).toBe(CUE_CHECK_ERROR_COPY.unknown);
  });

  it('does not promise unsent answers when a removal fails and says what did not happen', () => {
    for (const code of ['offline', 'unknown'] as const) {
      const message = toCueCheckFailure(new CueCheckError(code), 'void').message;
      expect(message).not.toMatch(/unsent answers/i);
      expect(message).toContain('may not have been removed yet');
    }
    expect(toCueCheckFailure(new CueCheckError('offline'), 'void').message).toContain('Your reason is still here.');
  });

  it('does not talk about answers when a removal hits an operation conflict', () => {
    expect(toCueCheckFailure(new CueCheckError('operation-conflict'), 'void').message).toBe('This removal changed while sending. Reload this check-in and try again.');
    expect(toCueCheckFailure(new CueCheckError('operation-conflict'), 'create').message).toContain('Your answers changed');
  });

  it('tells the owner a save could not be confirmed instead of "read safely"', () => {
    for (const source of ['create', 'correct', 'void'] as const) {
      const message = toCueCheckFailure(new CueCheckError('malformed-response'), source).message;
      expect(message).toContain('could not confirm');
      expect(message).toMatch(/reload/i);
    }
    expect(toCueCheckFailure(new CueCheckError('malformed-response'), 'list').message).toBe('Your check-ins could not be shown safely. Please reload.');
  });

  it('uses plain, actionable copy for conflict, sign-in, availability and timing cases', () => {
    expect(CUE_CHECK_ERROR_COPY['operation-conflict']).toBe('Your answers changed while saving. Check them and save again.');
    expect(CUE_CHECK_ERROR_COPY['authentication-required']).toBe('Please sign in again to continue.');
    expect(CUE_CHECK_ERROR_COPY.unavailable).toBe('Check-ins are not available right now. Please try again later.');
    expect(CUE_CHECK_ERROR_COPY['timing-mismatch']).toBe('This correction could not be saved. Reload this check-in and try again.');
  });

  it('reports an unconfigured client as unavailable', async () => {
    clientMocks.supabase = null;
    const error = (await getCueCheck(RECORD_ID).catch((e: unknown) => e)) as CueCheckError;
    expect(error.code).toBe('unavailable');
  });

  it('marks only transport failures as retryable without reload', () => {
    expect(toCueCheckFailure(new CueCheckError('offline'), 'create')).toMatchObject({
      code: 'offline',
      retryable: true,
      source: 'create',
      message: CUE_CHECK_ERROR_COPY.offline,
    });
    expect(toCueCheckFailure(new CueCheckError('revision-conflict'), 'correct').retryable).toBe(false);
    expect(toCueCheckFailure(new Error('SQLSTATE 23505 public.x'), 'create')).toMatchObject({
      code: 'unknown',
      message: CUE_CHECK_ERROR_COPY.unknown,
    });
    expect(JSON.stringify(toCueCheckFailure('boom', 'detail'))).not.toContain('boom');
  });
});

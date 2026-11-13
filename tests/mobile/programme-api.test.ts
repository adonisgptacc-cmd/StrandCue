import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProgrammeCursorSchema,
  ProgrammeDetailSchema,
  ProgrammeEvaluationSchema,
  ProgrammeEventReferenceSchema,
  ProgrammeHistoryEntrySchema,
  ProgrammePageSchema,
  ProgrammeRecordSchema,
  ProgrammeStartDateSchema,
  changeProgramme,
  enrolProgramme,
  getProgramme,
  listProgrammes,
} from '../../apps/mobile/src/programme-api.ts';
import {
  PROGRAMME_ERROR_CODES,
  ProgrammeError,
  isProgrammeFailure,
  toProgrammeFailure,
} from '../../apps/mobile/src/programme-errors.ts';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn() }));
const clientMocks = vi.hoisted(() => ({ supabase: null as unknown }));

vi.mock('../../apps/mobile/src/client.ts', () => ({
  get supabase() {
    return clientMocks.supabase;
  },
}));

const ENROLMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENROLMENT_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
const PRODUCT_ID = 'c0000000-0000-4000-8000-000000000002';
const PRODUCT_VERSION_ID = 'c0000000-0000-4000-8000-000000000003';
const OPERATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPERATION_ID_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CREATED_AT = '2026-09-01T08:00:00.123456Z';
const UPDATED_AT = '2026-09-20T10:00:00.123456Z';
const START = '2026-09-01T08:00:00.000Z';
const APP_AT = '2026-09-02T08:00:00.000Z';
const APP_EVENT = '22:execution-confirmed:36:eeeeeeee-0000-4000-8000-000000000001:8:step-1';
const WASH_EVENT = '20:execution-confirmed:36:eeeeeeee-0000-4000-8000-000000000002:8:step-1';
const AS_OF = '2026-09-20T10:00:00.000Z';

const publication = {
  artifactId: 'artifact-fixture-1',
  artifactVersion: '1',
  contentDigest: `sha256:${'a'.repeat(64)}`,
};

function evaluation(overrides: Record<string, unknown> = {}) {
  return {
    state: 'reassessment',
    dueStatus: 'eligible',
    unit: 'wash',
    count: 3,
    range: { minimum: 2, maximum: 4 },
    // Canonical order: same instant, so the application precedes the wash.
    eventsUsed: [
      { eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } },
      { eventId: WASH_EVENT, kind: 'wash', date: { precision: 'exact', value: APP_AT } },
    ],
    application: { eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } },
    asOf: AS_OF,
    missing: [],
    reasonCodes: ['application-confirmed', 'count-within-range'],
    fromCompletedSnapshot: false,
    ruleId: 'rule-fixture-1',
    ruleVersion: '1',
    ...overrides,
  };
}

/** A completed record, as the server returns one: it always carries its snapshot. */
function completedRecord(overrides: Record<string, unknown> = {}) {
  return record({
    status: 'completed',
    revision: 2,
    completed: {
      snapshot: {
        enrolmentId: ENROLMENT_ID,
        productId: PRODUCT_ID,
        productVersionId: PRODUCT_VERSION_ID,
        ruleId: 'rule-fixture-1',
        ruleVersion: '1',
        rulePublication: publication,
        state: 'completed',
        dueStatus: 'eligible',
        unit: 'wash',
        count: 3,
        range: { minimum: 2, maximum: 4 },
        eventsUsed: [
          { eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } },
          { eventId: WASH_EVENT, kind: 'wash', date: { precision: 'exact', value: APP_AT } },
        ],
        application: { eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } },
        asOf: AS_OF,
        completedAt: '2026-09-20T10:00:00.000Z',
      },
    },
    ...overrides,
  });
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    enrolmentId: ENROLMENT_ID,
    productId: PRODUCT_ID,
    productVersionId: PRODUCT_VERSION_ID,
    ruleId: 'rule-fixture-1',
    ruleVersion: '1',
    rulePublication: publication,
    startDate: { precision: 'exact', value: START },
    status: 'active',
    revision: 1,
    paused: null,
    resumed: null,
    maintenanceTransition: null,
    completed: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...record({ revision: 2 }),
    history: [
      { sequence: 1, kind: 'enrol', recordedAt: CREATED_AT },
      {
        sequence: 2,
        kind: 'pause',
        recordedAt: UPDATED_AT,
        occurredAt: '2026-09-09T00:00:00.000Z',
        reasonCode: 'personal-choice',
      },
    ],
    evaluation: evaluation(),
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return { items: [{ ...record(), evaluation: evaluation() }], nextCursor: null, ...overrides };
}

function enrolCommand(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID,
    offer: {
      productId: PRODUCT_ID,
      productVersionId: PRODUCT_VERSION_ID,
      ruleId: 'rule-fixture-1',
      ruleVersion: '1',
    },
    startDate: { precision: 'exact', value: START },
    ...overrides,
  };
}

function pauseCommand(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID,
    enrolmentId: ENROLMENT_ID,
    expectedRevision: 1,
    command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'personal-choice' },
    ...overrides,
  };
}

function completeCommand(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID_2,
    enrolmentId: ENROLMENT_ID,
    expectedRevision: 1,
    command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' },
    ...overrides,
  };
}

function abandonCommand(overrides: Record<string, unknown> = {}) {
  return {
    operationId: OPERATION_ID_2,
    enrolmentId: ENROLMENT_ID,
    expectedRevision: 1,
    command: { kind: 'abandon' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientMocks.supabase = { rpc: rpcMocks.rpc };
});

describe('treatment programme RPC boundary', () => {
  it('rejects every inconsistent date precision at the response boundary', () => {
    for (const date of [
      { precision: 'exact', value: null },
      { precision: 'exact', value: '2026-09-02' },
      { precision: 'day', value: null },
      { precision: 'day', value: '2026-02-30' },
      { precision: 'unknown', value: APP_AT },
    ]) {
      expect(ProgrammeEventReferenceSchema.safeParse({ eventId: APP_EVENT, kind: 'application', date }).success, JSON.stringify(date)).toBe(false);
    }
    expect(ProgrammeEventReferenceSchema.safeParse({ eventId: APP_EVENT, kind: 'application', date: { precision: 'unknown', value: null } }).success).toBe(true);
    expect(ProgrammeStartDateSchema.safeParse({ precision: 'day', value: '2026-09-01' }).success).toBe(true);
  });

  it('rejects internally inconsistent evaluations', () => {
    const invalid = [
      evaluation({ fromCompletedSnapshot: true, state: 'reassessment' }),
      evaluation({ fromCompletedSnapshot: true, state: 'completed', count: undefined, eventsUsed: [] }),
      evaluation({ state: 'completed', fromCompletedSnapshot: false }),
      evaluation({ application: { eventId: APP_EVENT, kind: 'wash', date: { precision: 'exact', value: APP_AT } } }),
      evaluation({ count: undefined }),
      evaluation({ eventsUsed: [evaluation().eventsUsed[0], evaluation().eventsUsed[0]] }),
      evaluation({ eventsUsed: [...evaluation().eventsUsed].reverse() }),
      evaluation({ application: { eventId: 'missing-event', kind: 'application', date: { precision: 'exact', value: APP_AT } } }),
    ];
    for (const value of invalid) expect(ProgrammeEvaluationSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    expect(ProgrammeEvaluationSchema.safeParse(evaluation({ fromCompletedSnapshot: true, state: 'completed' })).success).toBe(true);
  });

  it('validates each history event shape and the complete chain', () => {
    const recordedAt = UPDATED_AT;
    const valid = [
      { sequence: 1, kind: 'enrol', recordedAt },
      { sequence: 2, kind: 'change', recordedAt, selectedApplicationEventId: APP_EVENT },
      { sequence: 2, kind: 'pause', recordedAt, occurredAt: APP_AT, reasonCode: 'scheduling' },
      { sequence: 2, kind: 'resume', recordedAt, occurredAt: APP_AT, ruleId: 'resume-rule', ruleVersion: '1' },
      { sequence: 2, kind: 'maintenance', recordedAt, occurredAt: APP_AT, ruleId: 'maintenance-rule', ruleVersion: '1' },
      { sequence: 2, kind: 'complete', recordedAt, occurredAt: APP_AT },
      { sequence: 2, kind: 'abandon', recordedAt },
    ];
    for (const entry of valid) expect(ProgrammeHistoryEntrySchema.safeParse(entry).success, JSON.stringify(entry)).toBe(true);
    const invalid = [
      { sequence: 2, kind: 'enrol', recordedAt },
      { sequence: 1, kind: 'enrol', recordedAt, reasonCode: 'extra' },
      { sequence: 2, kind: 'change', recordedAt },
      { sequence: 2, kind: 'change', recordedAt, selectedApplicationEventId: APP_EVENT, reasonCode: 'extra' },
      { sequence: 2, kind: 'pause', recordedAt },
      { sequence: 2, kind: 'pause', recordedAt, occurredAt: APP_AT, reasonCode: 'scheduling', ruleId: 'extra' },
      { sequence: 2, kind: 'resume', recordedAt },
      { sequence: 2, kind: 'resume', recordedAt, occurredAt: APP_AT, ruleId: 'r', ruleVersion: '1', reasonCode: 'extra' },
      { sequence: 2, kind: 'complete', recordedAt },
      { sequence: 2, kind: 'complete', recordedAt, occurredAt: APP_AT, ruleId: 'extra' },
      { sequence: 1, kind: 'abandon', recordedAt },
      { sequence: 2, kind: 'abandon', recordedAt, occurredAt: APP_AT },
    ];
    for (const entry of invalid) expect(ProgrammeHistoryEntrySchema.safeParse(entry).success, JSON.stringify(entry)).toBe(false);

    expect(ProgrammeDetailSchema.safeParse(detail()).success).toBe(true);
    expect(ProgrammeDetailSchema.safeParse(detail({ revision: 3 })).success).toBe(false);
    expect(ProgrammeDetailSchema.safeParse(detail({ history: [detail().history[1], detail().history[0]] })).success).toBe(false);
    expect(ProgrammeDetailSchema.safeParse(detail({ history: [...detail().history, { ...detail().history[1], sequence: 3 }] })).success).toBe(false);
  });

  it('rejects record, page and snapshot contradictions', () => {
    expect(ProgrammeRecordSchema.safeParse(record({ status: 'abandoned', completed: completedRecord().completed })).success).toBe(false);
    const completed = completedRecord() as unknown as { completed: { snapshot: Record<string, unknown> } };
    const snapshot = completed.completed.snapshot;
    const application = snapshot.application as Record<string, unknown>;
    const eventsUsed = snapshot.eventsUsed as readonly Record<string, unknown>[];
    for (const changed of [
      { ...snapshot, enrolmentId: ENROLMENT_ID_2 },
      { ...snapshot, productId: ENROLMENT_ID_2 },
      { ...snapshot, ruleId: 'another-rule' },
      { ...snapshot, application: { ...application, date: { precision: 'day', value: '2026-09-02' } } },
      { ...snapshot, completedAt: '2026-09-21T10:00:00.000Z' },
      { ...snapshot, eventsUsed: [eventsUsed[0], eventsUsed[0]] },
      { ...snapshot, eventsUsed: [eventsUsed[1]] },
      { ...snapshot, eventsUsed: [...eventsUsed].reverse() },
    ]) {
      expect(ProgrammeRecordSchema.safeParse(completedRecord({ completed: { snapshot: changed } })).success, JSON.stringify(changed)).toBe(false);
    }
    expect(ProgrammePageSchema.safeParse({ items: [], nextCursor: { createdAt: CREATED_AT, enrolmentId: ENROLMENT_ID } }).success).toBe(false);
  });
  it('enrols through public.enrol_programme with exactly the documented arguments', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record(), error: null });
    const result = await enrolProgramme(enrolCommand());
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('enrol_programme', {
      p_operation_id: OPERATION_ID,
      p_product_id: PRODUCT_ID,
      p_product_version_id: PRODUCT_VERSION_ID,
      p_rule_id: 'rule-fixture-1',
      p_rule_version: '1',
      p_start_date: { precision: 'exact', value: START },
      p_selected_application_event_id: null,
    });
    expect(result.enrolmentId).toBe(ENROLMENT_ID);
  });

  it('sends no owner id, and no derived or authoritative fact, on enrolment', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record(), error: null });
    await enrolProgramme(enrolCommand());
    const [, args] = rpcMocks.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(args).sort()).toEqual([
      'p_operation_id', 'p_product_id', 'p_product_version_id', 'p_rule_id', 'p_rule_version',
      'p_selected_application_event_id', 'p_start_date',
    ]);
    const sent = JSON.stringify(args);
    // Owner identity is server-derived; nothing derived or authoritative travels.
    for (const forbidden of ['p_user_id', 'p_owner', 'ownerId', 'userId', 'p_count', 'p_due_status', 'p_state',
      'p_wash_count', 'p_evaluation', 'p_snapshot', 'p_publication', 'p_events_used', 'p_revision',
      'p_rule_publication', 'p_review', 'p_evidence', 'p_maintenance_count']) {
      expect(sent, forbidden).not.toContain(forbidden);
    }
  });

  it('changes through public.change_programme with only the owner facts', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record({ revision: 2 }), error: null });
    const result = await changeProgramme(pauseCommand());
    expect(rpcMocks.rpc).toHaveBeenCalledWith('change_programme', {
      p_operation_id: OPERATION_ID,
      p_enrolment_id: ENROLMENT_ID,
      p_expected_revision: 1,
      p_command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'personal-choice' },
    });
    expect(result.revision).toBe(2);
  });

  it('keeps each mutation in its own command schema, so one cannot carry another command fields', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record(), error: null });
    for (const bad of [
      pauseCommand({ command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'personal-choice', completedAt: '2026-09-20T10:00:00.000Z' } }),
      pauseCommand({ command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'personal-choice', ruleId: 'rule-fixture-1' } }),
      completeCommand({ command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z', reasonCode: 'travel' } }),
      abandonCommand({ command: { kind: 'abandon', reason: 'no longer wanted' } }),
      pauseCommand({ command: { kind: 'resume', resumedAt: '2026-09-13T00:00:00.000Z', resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1' } }),
    ]) {
      await expect(changeProgramme(bad), JSON.stringify(bad)).rejects.toBeInstanceOf(ProgrammeError);
    }
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('sends no snapshot, count, evidence or publication when completing a programme', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: completedRecord(), error: null });
    await changeProgramme(completeCommand());
    const [, args] = rpcMocks.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_command).toEqual({ kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' });
    const sent = JSON.stringify(args);
    for (const forbidden of ['snapshot', 'count', 'eventsUsed', 'rulePublication', 'dueStatus', 'state', 'evidence']) {
      expect(sent, forbidden).not.toContain(forbidden);
    }
  });

  it('lists through public.list_programmes with a null cursor on the first page', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: page(), error: null });
    const result = await listProgrammes({ limit: 20, cursor: null });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_programmes', { p_limit: 20, p_cursor: null });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('forwards a valid keyset cursor unchanged', async () => {
    const cursor = { createdAt: CREATED_AT, enrolmentId: ENROLMENT_ID };
    rpcMocks.rpc.mockResolvedValue({ data: page({ nextCursor: cursor }), error: null });
    const result = await listProgrammes({ limit: 5, cursor });
    expect(rpcMocks.rpc).toHaveBeenCalledWith('list_programmes', { p_limit: 5, p_cursor: cursor });
    expect(result.nextCursor).toEqual(cursor);
  });

  it('reads detail through public.get_programme with its append-only history', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: detail(), error: null });
    const result = await getProgramme(ENROLMENT_ID);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('get_programme', { p_enrolment_id: ENROLMENT_ID });
    expect(result.history).toHaveLength(2);
    expect(result.evaluation?.state).toBe('reassessment');
  });

  it('rejects an unknown key in every request and response', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record(), error: null });
    await expect(enrolProgramme(enrolCommand({ startDate: { precision: 'day', value: '2026-09-01', extra: 1 } })))
      .rejects.toMatchObject({ code: 'malformed-request' });
    await expect(listProgrammes({ limit: 5, cursor: { createdAt: CREATED_AT, enrolmentId: ENROLMENT_ID, extra: 1 } }))
      .rejects.toMatchObject({ code: 'malformed-request' });

    rpcMocks.rpc.mockResolvedValue({ data: record({ unexpected: true }), error: null });
    await expect(enrolProgramme(enrolCommand())).rejects.toMatchObject({ code: 'malformed-response' });
    rpcMocks.rpc.mockResolvedValue({ data: detail({ history: [] }), error: null });
    await expect(getProgramme(ENROLMENT_ID)).rejects.toMatchObject({ code: 'malformed-response' });
    rpcMocks.rpc.mockResolvedValue({ data: page({ items: [], nextCursor: { createdAt: 'nope', enrolmentId: ENROLMENT_ID } }), error: null });
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('rejects malformed identifiers, revisions, timestamps, references and cursors', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: record(), error: null });
    for (const bad of [
      enrolCommand({ offer: { productId: 'not-a-uuid', productVersionId: PRODUCT_VERSION_ID, ruleId: 'r', ruleVersion: '1' } }),
      enrolCommand({ offer: { productId: PRODUCT_ID, productVersionId: PRODUCT_VERSION_ID, ruleId: 'x'.repeat(201), ruleVersion: '1' } }),
      enrolCommand({ offer: { productId: PRODUCT_ID, productVersionId: PRODUCT_VERSION_ID, ruleId: 'r', ruleVersion: 'x'.repeat(201) } }),
      enrolCommand({ startDate: { precision: 'approximate', value: '2026-09' } }),
      enrolCommand({ startDate: { precision: 'unknown', value: null } }),
      enrolCommand({ startDate: { precision: 'day', value: '2026-9-01' } }),
      enrolCommand({ startDate: { precision: 'exact', value: '2026-09-01T08:00:00' } }),
      enrolCommand({ startDate: { precision: 'exact', value: '2026-13-01T08:00:00.000Z' } }),
    ]) {
      await expect(enrolProgramme(bad), JSON.stringify(bad)).rejects.toBeInstanceOf(ProgrammeError);
    }
    for (const bad of [
      pauseCommand({ expectedRevision: 0 }),
      pauseCommand({ expectedRevision: 1.5 }),
      pauseCommand({ enrolmentId: 'not-a-uuid' }),
      pauseCommand({ operationId: 'not-a-uuid' }),
      pauseCommand({ command: { kind: 'pause', pausedAt: '2026-09-09', reasonCode: 'personal-choice' } }),
      pauseCommand({ command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'Not A Code!' } }),
      pauseCommand({ command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'a'.repeat(65) } }),
    ]) {
      await expect(changeProgramme(bad), JSON.stringify(bad)).rejects.toBeInstanceOf(ProgrammeError);
    }
    expect(rpcMocks.rpc).not.toHaveBeenCalled();

    for (const bad of [{ limit: 0 }, { limit: 21 }, { limit: 1.5 }, { limit: '5' }]) {
      await expect(listProgrammes(bad), JSON.stringify(bad)).rejects.toBeInstanceOf(ProgrammeError);
    }
    await expect(getProgramme('not-a-uuid')).rejects.toBeInstanceOf(ProgrammeError);
    await expect(getProgramme(null)).rejects.toBeInstanceOf(ProgrammeError);
  });

  it('accepts only a cursor whose shape matches the database pagination keys', () => {
    expect(ProgrammeCursorSchema.safeParse({ createdAt: CREATED_AT, enrolmentId: ENROLMENT_ID }).success).toBe(true);
    expect(ProgrammeCursorSchema.safeParse({ createdAt: '2026-09-01T08:00:60Z', enrolmentId: ENROLMENT_ID }).success).toBe(false);
    expect(ProgrammeCursorSchema.safeParse({ createdAt: '2026-09-01 08:00:00Z', enrolmentId: ENROLMENT_ID }).success).toBe(false);
    expect(ProgrammeCursorSchema.safeParse({ createdAt: CREATED_AT, enrolmentId: 'not-a-uuid' }).success).toBe(false);
    expect(ProgrammeCursorSchema.safeParse({ createdAt: CREATED_AT, enrolmentId: ENROLMENT_ID, extra: 1 }).success).toBe(false);
    expect(ProgrammeCursorSchema.safeParse({ enrolmentId: ENROLMENT_ID }).success).toBe(false);
    expect(ProgrammeCursorSchema.safeParse(null).success).toBe(false);
  });

  it('fails closed on a page that repeats a programme or overflows the limit', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: page({ items: [record(), record()] }), error: null });
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
    rpcMocks.rpc.mockResolvedValue({ data: page({ items: [{ ...record(), evaluation: evaluation() }, { ...record({ enrolmentId: ENROLMENT_ID_2 }), evaluation: evaluation() }] }), error: null });
    const accepted = await listProgrammes({ limit: 20, cursor: null });
    expect(accepted.items).toHaveLength(2);
    rpcMocks.rpc.mockResolvedValue({ data: { items: Array.from({ length: 21 }, () => ({ ...record(), evaluation: evaluation() })), nextCursor: null }, error: null });
    await expect(listProgrammes({ limit: 20, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('fails closed when a response disagrees with itself', async () => {
    // A completed record must carry its snapshot and a snapshot evaluation.
    rpcMocks.rpc.mockResolvedValue({ data: record({ status: 'completed', revision: 2 }), error: null });
    await expect(enrolProgramme(enrolCommand())).rejects.toMatchObject({ code: 'malformed-response' });
    // An abandoned record has no evaluation; a live one must have one.
    rpcMocks.rpc.mockResolvedValue({ data: page({ items: [{ ...record({ status: 'abandoned' }), evaluation: evaluation() }] }), error: null });
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
    rpcMocks.rpc.mockResolvedValue({ data: page({ items: [{ ...record(), evaluation: null }] }), error: null });
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toMatchObject({ code: 'malformed-response' });
    // A snapshot evaluation must be a completed evaluation with a count.
    rpcMocks.rpc.mockResolvedValue({ data: detail({ evaluation: evaluation({ fromCompletedSnapshot: true }) }), error: null });
    await expect(getProgramme(ENROLMENT_ID)).rejects.toMatchObject({ code: 'malformed-response' });
    // History must be append-only and contiguous from one.
    rpcMocks.rpc.mockResolvedValue({ data: detail({ history: [{ sequence: 2, kind: 'pause', recordedAt: UPDATED_AT }] }), error: null });
    await expect(getProgramme(ENROLMENT_ID)).rejects.toMatchObject({ code: 'malformed-response' });
    // A range must stay a range.
    rpcMocks.rpc.mockResolvedValue({ data: detail({ evaluation: evaluation({ range: { minimum: 4, maximum: 2 } }) }), error: null });
    await expect(getProgramme(ENROLMENT_ID)).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('maps every stable server code to safe copy and unknown codes to the fallback', async () => {
    // Every code has copy, and the mapped message is always that safe copy —
    // never the code itself and never raw server text.
    for (const code of PROGRAMME_ERROR_CODES) {
      const failure = toProgrammeFailure(new ProgrammeError(code), 'detail');
      expect(failure.message, code).toBeTruthy();
      expect(failure.message, code).not.toBe(code);
      expect(failure.message, code).toMatch(/[a-z]/i);
    }
    for (const code of ['rule-content-pending', 'revision-conflict', 'programme-not-found', 'rule-withdrawn',
      'pause-resumption-required', 'statement-timeout', 'account-not-active']) {
      rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
      await expect(enrolProgramme(enrolCommand()), code).rejects.toMatchObject({
        code: code === 'account-not-active' ? 'inactive-account' : code,
      });
    }
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'a code nobody defined' } });
    await expect(enrolProgramme(enrolCommand())).rejects.toMatchObject({ code: 'unknown' });
  });

  it('distinguishes a timeout from an offline failure', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    const timeout = await listProgrammes({ limit: 5, cursor: null }).catch(caught => toProgrammeFailure(caught, 'list'));
    expect(isProgrammeFailure(timeout)).toBe(true);
    if (!isProgrammeFailure(timeout)) throw new Error('Expected timeout failure');
    expect(timeout.code).toBe('statement-timeout');
    expect(timeout.retryable).toBe(true);
    rpcMocks.rpc.mockRejectedValue(new Error('Failed to fetch'));
    const offline = await listProgrammes({ limit: 5, cursor: null }).catch(caught => toProgrammeFailure(caught, 'list'));
    expect(isProgrammeFailure(offline)).toBe(true);
    if (!isProgrammeFailure(offline)) throw new Error('Expected offline failure');
    expect(offline.code).toBe('offline');
    expect(offline.retryable).toBe(true);
    rpcMocks.rpc.mockRejectedValue(new Error('boom'));
    const other = await listProgrammes({ limit: 5, cursor: null }).catch(caught => toProgrammeFailure(caught, 'list'));
    expect(isProgrammeFailure(other)).toBe(true);
    if (!isProgrammeFailure(other)) throw new Error('Expected unknown failure');
    expect(other.code).toBe('unknown');
    expect(other.message).toContain('went wrong');
  });

  it('never lets a raw server message reach UI copy', async () => {
    const raw = 'insert into "public"."treatment_programmes" violates foreign-key constraint fk_product';
    rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: raw } });
    const failure = toProgrammeFailure(new Error(raw), 'detail');
    expect(failure.code).toBe('unknown');
    expect(failure.message).not.toContain('treatment_programmes');
    expect(failure.message).not.toContain('constraint');
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toThrow(/went wrong/i);
  });

  it('refuses to work at all when the client is not configured', async () => {
    clientMocks.supabase = null;
    await expect(listProgrammes({ limit: 5, cursor: null })).rejects.toMatchObject({ code: 'unavailable' });
    clientMocks.supabase = undefined;
    await expect(getProgramme(ENROLMENT_ID)).rejects.toMatchObject({ code: 'unavailable' });
  });
});

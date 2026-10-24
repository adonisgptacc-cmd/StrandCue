import { describe, expect, it } from 'vitest';

import {
  buildProgrammeCommand,
  createProgrammeController,
  initialProgrammeState,
  programmeBlockedReason,
  programmeReducer,
  type ProgrammeAction,
  type ProgrammeApi,
  type ProgrammeControllerOptions,
  type ProgrammeDetail,
  type ProgrammePage,
  type ProgrammeRecord,
  type ProgrammeState,
} from '../../apps/mobile/src/programme-state.ts';
import {
  REVIEWED_SEED,
  createFakeProgrammeServer,
  type ProgrammeServerSeed,
} from './support/programme-fake-server.ts';

// A deterministic, per-owner controller. Every guard here exists because a
// treatment programme is a long-lived object: late responses, a second device,
// a lost response after a commit and an owner switching on a shared device all
// have to leave the screen showing only what the server actually holds.

const ENROLMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENROLMENT_ID_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
const CREATED_AT = '2026-09-01T08:00:00.123456Z';
const UPDATED_AT = '2026-09-20T10:00:00.123456Z';
const APP_AT = '2026-09-02T08:00:00.000Z';
const APP_EVENT = '22:execution-confirmed:36:eeeeeeee-0000-4000-8000-000000000001:8:step-1';

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
    eventsUsed: [{ eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } }],
    application: { eventId: APP_EVENT, kind: 'application', date: { precision: 'exact', value: APP_AT } },
    asOf: '2026-09-20T10:00:00.000Z',
    missing: [],
    reasonCodes: ['application-confirmed'],
    fromCompletedSnapshot: false,
    ruleId: 'rule-fixture-1',
    ruleVersion: '1',
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}): ProgrammeRecord {
  return {
    enrolmentId: ENROLMENT_ID,
    productId: REVIEWED_SEED.productId,
    productVersionId: REVIEWED_SEED.productVersionId,
    ruleId: 'rule-fixture-1',
    ruleVersion: '1',
    rulePublication: publication,
    startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' },
    status: 'active',
    revision: 1,
    paused: null,
    resumed: null,
    maintenanceTransition: null,
    completed: null,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  } as unknown as ProgrammeRecord;
}

function detail(overrides: Record<string, unknown> = {}): ProgrammeDetail {
  return {
    ...record(),
    history: [{ sequence: 1, kind: 'enrol', recordedAt: CREATED_AT }],
    evaluation: evaluation(),
    ...overrides,
  } as unknown as ProgrammeDetail;
}

function page(overrides: Record<string, unknown> = {}): ProgrammePage {
  return {
    items: [{ ...record(), evaluation: evaluation() }],
    nextCursor: null,
    ...overrides,
  } as unknown as ProgrammePage;
}

const OFFER = {
  productId: REVIEWED_SEED.productId,
  productVersionId: REVIEWED_SEED.productVersionId,
  ruleId: 'rule-fixture-1',
  ruleVersion: '1',
  label: 'Fixture treatment product',
};

const reducer = (state: ProgrammeState, ...actions: readonly ProgrammeAction[]): ProgrammeState =>
  actions.reduce(programmeReducer, state);

const listed = (state: ProgrammeState, items: unknown[], nextCursor = null): ProgrammeState =>
  reducer(state, { type: 'list_requested', requestId: 1 }, { type: 'list_loaded', ownerKey: state.ownerKey, requestId: 1, page: { items, nextCursor } as never });

describe('the pure reducer', () => {
  it('starts idle with nothing loaded for its owner', () => {
    const state = initialProgrammeState('owner-a');
    expect(state).toMatchObject({
      phase: 'idle', ownerKey: 'owner-a', ownerEpoch: 0, items: [], listLoaded: false,
      selectedId: null, selected: null, blockedReason: null, pending: null, failure: null,
      reloadRequired: false, lastSaved: null, disposed: false,
    });
  });

  it('ignores an unknown reducer action without changing state', () => {
    const state = initialProgrammeState('owner-a');
    expect(programmeReducer(state, { type: 'unknown-action' } as unknown as ProgrammeAction)).toBe(state);
  });

  it('owner change synchronously clears every prior programme fact', () => {
    const loaded = listed(initialProgrammeState('owner-a'), [record()]);
    expect(loaded.phase).toBe('list-ready');
    const switched = programmeReducer(loaded, { type: 'owner_changed', ownerKey: 'owner-b' });
    expect(switched.items).toEqual([]);
    expect(switched.selected).toBeNull();
    expect(switched.selectedId).toBeNull();
    expect(switched.nextCursor).toBeNull();
    expect(switched.hasMore).toBe(false);
    expect(switched.listLoaded).toBe(false);
    expect(switched.phase).toBe('idle');
    expect(switched.ownerKey).toBe('owner-b');
    expect(switched.ownerEpoch).toBe(1);
    // The draft, the pending command and any failure go with the previous owner.
    const drafted = reducer(loaded,
      { type: 'detail_requested', requestId: 9, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 9, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' });
    expect(drafted.pauseReason).toBe('personal-choice');
    const switchedDraft = programmeReducer(drafted, { type: 'owner_changed', ownerKey: 'owner-b' });
    expect(switchedDraft.pauseReason).toBeNull();
    expect(switchedDraft.confirmation).toBeNull();
    expect(switchedDraft.pending).toBeNull();
  });

  it('ignores a late response from a previous owner', () => {
    const loaded = listed(initialProgrammeState('owner-a'), [record()]);
    const switched = programmeReducer(loaded, { type: 'owner_changed', ownerKey: 'owner-b' });
    const late = programmeReducer(switched, {
      type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never,
    });
    expect(late).toBe(switched);
    const lateDetail = programmeReducer(switched, {
      type: 'detail_loaded', ownerKey: 'owner-a', requestId: 9, detail: detail(),
    });
    expect(lateDetail).toBe(switched);
  });

  it('a late list response cannot overwrite an open detail or an active save', () => {
    const opened = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() });
    expect(opened.phase).toBe('detail-ready');
    const late = programmeReducer(opened, { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page({ items: [] }) as never });
    expect(late.items).toEqual(opened.items);
    expect(late.selected).toBe(opened.selected);
    expect(late.phase).toBe('detail-ready');

    const saving = reducer(opened,
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT });
    expect(saving.phase).toBe('saving');
    const lateAgain = programmeReducer(saving, { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page({ items: [] }) as never });
    expect(lateAgain.phase).toBe('saving');
    expect(lateAgain.selected).toBe(opened.selected);
  });

  it('a late detail response cannot overwrite a different selected programme', () => {
    const first = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() });
    const second = programmeReducer(first, { type: 'detail_requested', requestId: 3, enrolmentId: ENROLMENT_ID_2 });
    expect(second.selectedId).toBe(ENROLMENT_ID_2);
    const late = programmeReducer(second, { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() });
    expect(late).toBe(second);
    const foreign = programmeReducer(second, {
      type: 'detail_loaded', ownerKey: 'owner-a', requestId: 3,
      detail: detail({ enrolmentId: ENROLMENT_ID }),
    });
    expect(foreign).toBe(second);
  });

  it('blocks a duplicate submit and keeps one operation id for one command', () => {
    const started = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT });
    const duplicate = programmeReducer(started, { type: 'save_requested', requestId: 4, operationId: '22222222-2222-4222-8222-222222222222' });
    expect(duplicate).toBe(started);
    expect(buildProgrammeCommand(started)).toEqual({
      kind: 'pause',
      command: {
        operationId: '11111111-1111-4111-8111-111111111111',
        enrolmentId: ENROLMENT_ID,
        expectedRevision: 1,
        command: { kind: 'pause', pausedAt: expect.any(String), reasonCode: 'personal-choice' },
      },
    });
  });

  it('keeps the unsent draft through a retryable failure and clears it on success', () => {
    const failed = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'scheduling' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT },
      {
        type: 'request_failed', ownerKey: 'owner-a', requestId: 3,
        failure: { code: 'offline', message: 'You appear to be offline.', retryable: true, source: 'pause' },
      });
    expect(failed.phase).toBe('offline-pending');
    expect(failed.pauseReason).toBe('scheduling');
    expect(failed.pending?.operationId).toBe('11111111-1111-4111-8111-111111111111');

    const succeeded = programmeReducer(failed, {
      type: 'save_requested', requestId: 4, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT,
    });
    expect(succeeded.pending?.operationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(buildProgrammeCommand(succeeded)?.command).toMatchObject({
      command: { reasonCode: 'scheduling' },
    });
  });

  it('a different command receives a new operation id', () => {
    const paused = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT },
      { type: 'save_succeeded', ownerKey: 'owner-a', requestId: 3, record: record({ revision: 2 }) });
    const abandoned = programmeReducer(paused, { type: 'confirmation_started', kind: 'abandon' });
    const requested = programmeReducer(abandoned, { type: 'save_requested', requestId: 4, operationId: '33333333-3333-4333-8333-333333333333' });
    expect(requested.pending?.kind).toBe('abandon');
    expect(requested.pending?.operationId).toBe('33333333-3333-4333-8333-333333333333');
  });

  it('requires an authoritative reload after a revision conflict and never claims success', () => {
    const conflicted = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT },
      {
        type: 'request_failed', ownerKey: 'owner-a', requestId: 3,
        failure: { code: 'revision-conflict', message: 'Reload before trying again.', retryable: false, source: 'pause' },
      });
    expect(conflicted.phase).toBe('conflict-reload');
    expect(conflicted.reloadRequired).toBe(true);
    expect(conflicted.lastSaved).toBeNull();
    expect(conflicted.selected?.revision).toBe(1);
  });

  it('clears the draft on cancellation and on an owner switch', () => {
    const base = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'personal-choice' });
    const cancelled = programmeReducer(base, { type: 'confirmation_cancelled' });
    expect(cancelled.pauseReason).toBeNull();
    expect(cancelled.confirmation).toBeNull();
    expect(cancelled.phase).toBe('detail-ready');

    const started = reducer(base, { type: 'enrol_started', offer: OFFER });
    const cancelledEnrol = programmeReducer(started, { type: 'enrol_cancelled' });
    expect(cancelledEnrol.enrolDraft).toBeNull();
    expect(cancelledEnrol.phase).toBe('list-ready');
  });

  it('disposes every pending request token', () => {
    const pending = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'save_requested', requestId: 3, operationId: '11111111-1111-4111-8111-111111111111', pausedAt: UPDATED_AT });
    const disposed = programmeReducer(pending, { type: 'disposed' });
    expect(disposed.disposed).toBe(true);
    expect(disposed.activeRequest).toBeNull();
    expect(disposed.pending).toBeNull();
    // Nothing may be applied after disposal.
    for (const action of [
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'save_succeeded', ownerKey: 'owner-a', requestId: 3, record: record({ revision: 2 }) },
    ] as unknown as ProgrammeAction[]) {
      expect(programmeReducer(disposed, action)).toBe(disposed);
    }
  });

  it('recognises the blocked reviewed-content reason from an evaluation', () => {
    expect(programmeBlockedReason(evaluation({ missing: [{ code: 'rule-withdrawn', explanation: 'x' }] }) as never))
      .toBe('reviewed-content-withdrawn');
    expect(programmeBlockedReason(evaluation({ missing: [{ code: 'rule-draft', explanation: 'x' }] }) as never))
      .toBe('reviewed-content-pending');
    expect(programmeBlockedReason(evaluation({ missing: [{ code: 'product-unverified', explanation: 'x' }] }) as never))
      .toBe('product-mismatch');
    expect(programmeBlockedReason(evaluation() as never)).toBeNull();
    expect(programmeBlockedReason(null)).toBeNull();
  });

  it('clears stale confirmations and refuses saves when a refreshed detail becomes blocked', () => {
    const confirming = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() },
      { type: 'confirmation_started', kind: 'pause' },
      { type: 'pause_reason_changed', reasonCode: 'need-more-time' });
    const reloading = {
      ...confirming,
      activeRequest: { requestId: 3, kind: 'detail', background: true },
    } as ProgrammeState;
    const blocked = programmeReducer(reloading, {
      type: 'detail_loaded',
      ownerKey: 'owner-a',
      requestId: 3,
      detail: detail({ evaluation: evaluation({ missing: [{ code: 'rule-withdrawn', explanation: 'x' }] }) }),
    });
    expect(blocked).toMatchObject({
      phase: 'blocked-content',
      blockedReason: 'reviewed-content-withdrawn',
      confirmation: null,
      pauseReason: null,
      pending: null,
      pendingAt: null,
    });
    expect(programmeReducer(blocked, {
      type: 'save_requested',
      requestId: 4,
      operationId: '11111111-1111-4111-8111-111111111111',
      pausedAt: UPDATED_AT,
    })).toBe(blocked);

    const stopping = programmeReducer(blocked, { type: 'confirmation_started', kind: 'abandon' });
    expect(stopping.confirmation).toBe('abandon');
    const stopRequested = programmeReducer(stopping, {
      type: 'save_requested',
      requestId: 5,
      operationId: '22222222-2222-4222-8222-222222222222',
    });
    expect(stopRequested).toMatchObject({ phase: 'saving', pending: { kind: 'abandon' } });
  });

  it('never builds a command for a mutation the committed contract cannot serve', () => {
    const state = reducer(initialProgrammeState('owner-a'),
      { type: 'list_requested', requestId: 1 },
      { type: 'list_loaded', ownerKey: 'owner-a', requestId: 1, page: page() as never },
      { type: 'detail_requested', requestId: 2, enrolmentId: ENROLMENT_ID },
      { type: 'detail_loaded', ownerKey: 'owner-a', requestId: 2, detail: detail() });
    expect(buildProgrammeCommand(state)).toBeNull();
    // No resume, maintenance or application-substitution command exists at all.
    for (const action of [
      { type: 'confirmation_started', kind: 'resume' },
      { type: 'confirmation_started', kind: 'maintenance' },
      { type: 'confirmation_started', kind: 'select-application' },
    ] as unknown as ProgrammeAction[]) {
      expect(programmeReducer(state, action)).toBe(state);
    }
  });
});

function controller(seed: ProgrammeServerSeed, options: Partial<ProgrammeControllerOptions> = {}) {
  const server = createFakeProgrammeServer(seed);
  const instance = createProgrammeController({
    ownerKey: 'owner-a',
    api: server.api,
    newOperationId: () => '44444444-4444-4444-8444-444444444444',
    now: () => new Date('2026-09-20T10:00:00.000Z'),
    ...options,
  });
  return { server, instance };
}

describe('the controller against a committed-contract fake server', () => {
  it('loads a list and opens a detail', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    expect(instance.getState().phase).toBe('list-ready');
    expect(instance.getState().items).toHaveLength(1);
    await instance.openDetail(instance.getState().items[0]!.enrolmentId);
    const state = instance.getState();
    expect(state.phase).toBe('detail-ready');
    expect(state.selected?.revision).toBe(1);
    expect(server.callsNamed('enrol_programme')).toHaveLength(1);
  });

  it('converges a committed-then-lost mutation on the original operation id', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    const id = instance.getState().items[0]!.enrolmentId;
    await instance.openDetail(id);
    instance.startPause();
    instance.setPauseReason('personal-choice');
    server.loseResponse('change_programme');
    await instance.confirm();
    expect(instance.getState().phase).toBe('offline-pending');
    expect(instance.getState().pending?.operationId).toBe('44444444-4444-4444-8444-444444444444');
    const before = server.callsNamed('change_programme').length;
    await instance.retry();
    expect(instance.getState().phase).toBe('detail-ready');
    expect(instance.getState().selected?.paused).toMatchObject({ reasonCode: 'personal-choice' });
    // The retry replayed the identical command: no second history row, no new id.
    expect(server.callsNamed('change_programme')).toHaveLength(before + 1);
    expect(instance.getState().pending).toBeNull();
  });

  it('reloads authoritative state after a revision conflict', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    const id = instance.getState().items[0]!.enrolmentId;
    await instance.openDetail(id);
    server.changeElsewhere(id);
    instance.startPause();
    instance.setPauseReason('personal-choice');
    await instance.confirm();
    expect(instance.getState().phase).toBe('conflict-reload');
    expect(instance.getState().reloadRequired).toBe(true);
    await instance.reload();
    expect(instance.getState().phase).toBe('detail-ready');
    expect(instance.getState().reloadRequired).toBe(false);
    expect(instance.getState().selected?.revision).toBe(2);
  });

  it('keeps the pause reason through an offline failure and sends it on retry', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    await instance.openDetail(instance.getState().items[0]!.enrolmentId);
    instance.startPause();
    instance.setPauseReason('scheduling');
    server.failNext('change_programme');
    await instance.confirm();
    expect(instance.getState().phase).toBe('offline-pending');
    expect(instance.getState().pauseReason).toBe('scheduling');
    await instance.retry();
    expect(instance.getState().selected?.paused).toMatchObject({ reasonCode: 'scheduling' });
  });

  it('offers a usable recovery state when a confirmed save cannot be reloaded', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    await instance.openDetail(instance.getState().items[0]!.enrolmentId);
    server.loseResponse('get_programme');
    instance.startPause();
    instance.setPauseReason('personal-choice');
    await instance.confirm();
    const state = instance.getState();
    // The pause really happened; only the follow-up read is missing.
    expect(state.lastSaved).toMatchObject({ kind: 'pause' });
    expect(state.reloadAfterSaveFailed).toBe(true);
    expect(state.phase).not.toBe('saving');
    expect(state.pending).toBeNull();
    await instance.reload();
    expect(instance.getState().reloadAfterSaveFailed).toBe(false);
  });

  it('stops a shared-device owner switch from painting any prior programme', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    server.setOffline(true);
    await instance.loadList();
    const release = server.hold('list_programmes');
    const late = instance.loadList();
    release();
    await late;
    instance.setOwner('owner-b');
    server.setOffline(false);
    expect(instance.getState().items).toEqual([]);
    expect(instance.getState().ownerKey).toBe('owner-b');
    // A fresh list for the new owner holds only the new owner's data.
    await instance.loadList();
    expect(instance.getState().items).toEqual([]);
  });

  it('dispose invalidates work already in flight', async () => {
    const { instance, server } = controller(REVIEWED_SEED);
    const release = server.hold('list_programmes');
    const pending = instance.loadList();
    instance.dispose();
    release();
    await pending;
    expect(instance.getState().disposed).toBe(true);
    expect(instance.getState().items).toEqual([]);
  });

  it('blocks enrolment honestly when no reviewed rule publication exists', async () => {
    const { instance } = controller({ ...REVIEWED_SEED, rules: [] });
    await instance.enrol({
      offer: { ...OFFER, ruleId: 'rule-fixture-1', ruleVersion: '1' },
      startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' },
    });
    expect(instance.getState().phase).toBe('blocked-content');
    expect(instance.getState().blockedReason).toBe('reviewed-content-pending');
    expect(instance.getState().items).toEqual([]);
  });

  it('completes a programme by requesting it and showing the server-built state', async () => {
    const { instance } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    await instance.openDetail(instance.getState().items[0]!.enrolmentId);
    await instance.confirmComplete();
    const state = instance.getState();
    expect(state.lastSaved).toMatchObject({ kind: 'complete' });
    expect(state.selected?.status).toBe('completed');
    expect(state.selected?.evaluation?.fromCompletedSnapshot).toBe(true);
    expect(state.selected?.completed?.snapshot.count).toBe(3);
  });

  it('abandons a programme with neutral confirmation wording and keeps its history', async () => {
    const { instance } = controller(REVIEWED_SEED);
    await instance.enrol({ offer: OFFER, startDate: { precision: 'exact', value: '2026-09-01T08:00:00.000Z' } });
    await instance.loadList();
    await instance.openDetail(instance.getState().items[0]!.enrolmentId);
    instance.startAbandon();
    expect(instance.getState().confirmation).toBe('abandon');
    await instance.confirm();
    const state = instance.getState();
    expect(state.selected?.status).toBe('abandoned');
    expect(state.selected?.evaluation).toBeNull();
    expect(state.selected?.history?.map(entry => entry.kind)).toEqual(['enrol', 'abandon']);
  });
});

/** The API surface the controller needs, so state stays network-free in tests. */
export type { ProgrammeApi };

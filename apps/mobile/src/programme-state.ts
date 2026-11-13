import type {
  ProgrammeApi,
  ProgrammeCursor,
  ProgrammeDetail,
  ProgrammeOffer,
  ProgrammePage,
  ProgrammeRecord,
  ProgrammeStartDate,
  ProgrammeSummary,
} from './programme-api.ts';
import { ProgrammeError, toProgrammeFailure, type ProgrammeFailure } from './programme-errors.ts';

/**
 * Deterministic, per-owner state machine for the treatment-programme surface
 * (Task I5.5), plus a small framework-free controller that connects it to the
 * typed API.
 *
 * The reducer is pure: it never performs I/O, reads a clock or generates an id.
 * Request tokens, operation ids and the instants a change is dated at arrive on
 * actions, so every transition is reproducible. Four guards keep late or stale
 * work from painting the wrong programme:
 *
 * - a response only applies while it is still the one active request, so an
 *   older response can never overwrite newer state;
 * - a response carries the owner it was requested for, and an owner change
 *   synchronously resets everything (lists, details, drafts, pending commands,
 *   failures and pagination) while dropping the active request — the view also
 *   keys the whole screen by owner, so a new owner always gets a new
 *   controller; this guard is defence in depth;
 * - a mutation is retried under the operation id of its first attempt only when
 *   its payload is equivalent, so a retry can never double-apply a change and a
 *   changed payload can never ride an old id;
 * - the controller only ever sends the owner's own facts. It sends no owner id,
 *   count, due status, state, publication binding, evidence list or snapshot,
 *   and it never claims a lifecycle change succeeded before the server confirms
 *   it.
 */

export type ProgrammePhase =
  | 'idle'
  | 'loading-list'
  | 'list-ready'
  | 'loading-detail'
  | 'detail-ready'
  | 'blocked-content'
  | 'saving'
  | 'offline-pending'
  | 'conflict-reload'
  | 'unavailable'
  | 'failed'
  | 'disposed';

/** The mutations the committed I5.4 contract lets a client request. */
export type ProgrammeCommandKind = 'enrol' | 'pause' | 'abandon' | 'complete';

/** A step that needs an explicit owner choice before it is sent. */
export type ProgrammeConfirmation = 'pause' | 'abandon' | 'complete';

/** Why a programme cannot be evaluated, in owner-safe terms. */
export type ProgrammeBlockedReason =
  | 'reviewed-content-pending'
  | 'reviewed-content-withdrawn'
  | 'reviewed-content-mismatch'
  | 'product-mismatch';

/**
 * A reviewed programme the server confirmed is available, with the owner-safe
 * label a screen may show. The rule identity is never invented here.
 */
export interface ProgrammeOfferBinding extends ProgrammeOffer {
  readonly label: string;
}

export interface ProgrammePending {
  readonly kind: ProgrammeCommandKind;
  readonly operationId: string;
  readonly fingerprint: string;
}

export interface ProgrammeActiveRequest {
  readonly requestId: number;
  readonly kind: 'list' | 'page' | 'detail' | 'save';
  readonly background: boolean;
}

export interface ProgrammeDraft {
  readonly offer: ProgrammeOfferBinding;
  readonly startDate: ProgrammeStartDate;
}

/** A record returned by a mutation, or the fuller detail a read returns. */
export type ProgrammeSelected = ProgrammeRecord & Partial<Pick<ProgrammeDetail, 'history' | 'evaluation'>>;

export interface ProgrammeState {
  readonly phase: ProgrammePhase;
  readonly ownerKey: string;
  readonly ownerEpoch: number;
  readonly items: readonly ProgrammeSummary[];
  readonly nextCursor: ProgrammeCursor | null;
  readonly hasMore: boolean;
  /** True once a first list load succeeded; an empty list is then "ready". */
  readonly listLoaded: boolean;
  /** True once the list has loaded and holds no programme at all. */
  readonly listEmpty: boolean;
  readonly selectedId: string | null;
  readonly selected: ProgrammeSelected | null;
  /** The last record a mutation was confirmed with, for a failed follow-up read. */
  readonly savedRecord: ProgrammeRecord | null;
  readonly blockedReason: ProgrammeBlockedReason | null;
  readonly enrolDraft: ProgrammeDraft | null;
  readonly pauseReason: string | null;
  readonly confirmation: ProgrammeConfirmation | null;
  /** The instants a pending pause or completion is dated at. */
  readonly pendingAt: { readonly pausedAt: string; readonly completedAt: string } | null;
  readonly pending: ProgrammePending | null;
  readonly activeRequest: ProgrammeActiveRequest | null;
  readonly failure: ProgrammeFailure | null;
  /** Set by a revision conflict: reload authoritative state before any mutation. */
  readonly reloadRequired: boolean;
  /** The last confirmed change, so an outcome is announced only when one happened. */
  readonly lastSaved: { readonly kind: ProgrammeCommandKind; readonly requestId: number } | null;
  /** A confirmed change whose follow-up read failed. */
  readonly reloadAfterSaveFailed: boolean;
  readonly disposed: boolean;
}

export type ProgrammeAction =
  | { readonly type: 'owner_changed'; readonly ownerKey: string }
  | { readonly type: 'disposed' }
  | { readonly type: 'list_requested'; readonly requestId: number }
  | { readonly type: 'list_loaded'; readonly ownerKey: string; readonly requestId: number; readonly page: Pick<ProgrammePage, 'items' | 'nextCursor'> }
  | { readonly type: 'page_requested'; readonly requestId: number }
  | { readonly type: 'page_loaded'; readonly ownerKey: string; readonly requestId: number; readonly page: Pick<ProgrammePage, 'items' | 'nextCursor'> }
  | { readonly type: 'detail_requested'; readonly requestId: number; readonly enrolmentId: string; readonly background?: boolean }
  | { readonly type: 'detail_loaded'; readonly ownerKey: string; readonly requestId: number; readonly detail: ProgrammeDetail }
  | { readonly type: 'enrol_started'; readonly offer: ProgrammeOfferBinding }
  | { readonly type: 'enrol_start_changed'; readonly startDate: ProgrammeStartDate }
  | { readonly type: 'enrol_cancelled' }
  | { readonly type: 'pause_reason_changed'; readonly reasonCode: string }
  | { readonly type: 'confirmation_started'; readonly kind: ProgrammeConfirmation }
  | { readonly type: 'confirmation_cancelled' }
  | {
    readonly type: 'save_requested';
    readonly requestId: number;
    readonly operationId: string;
    readonly pausedAt?: string;
    readonly completedAt?: string;
  }
  | { readonly type: 'save_succeeded'; readonly ownerKey: string; readonly requestId: number; readonly record: ProgrammeRecord }
  | { readonly type: 'request_failed'; readonly ownerKey: string; readonly requestId: number; readonly failure: ProgrammeFailure }
  | { readonly type: 'detail_closed' };

export function initialProgrammeState(ownerKey: string): ProgrammeState {
  return {
    phase: 'idle',
    ownerKey,
    ownerEpoch: 0,
    items: [],
    nextCursor: null,
    hasMore: false,
    listLoaded: false,
    listEmpty: false,
    selectedId: null,
    selected: null,
    savedRecord: null,
    blockedReason: null,
    enrolDraft: null,
    pauseReason: null,
    confirmation: null,
    pendingAt: null,
    pending: null,
    activeRequest: null,
    failure: null,
    reloadRequired: false,
    lastSaved: null,
    reloadAfterSaveFailed: false,
    disposed: false,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAVING: ReadonlySet<ProgrammePhase> = new Set<ProgrammePhase>(['saving']);
/** A failure in one of these means the owner's view of the programme is stale. */
const RELOAD_CODES: ReadonlySet<string> = new Set(['revision-conflict', 'operation-conflict', 'snapshot-conflict']);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutUndefined(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) out[key] = value;
  return out;
}

function appendPage(items: readonly ProgrammeSummary[], page: readonly ProgrammeSummary[]): readonly ProgrammeSummary[] {
  const seen = new Set(items.map(item => item.enrolmentId));
  const fresh = page.filter(item => {
    if (seen.has(item.enrolmentId)) return false;
    seen.add(item.enrolmentId);
    return true;
  });
  return [...items, ...fresh];
}

function replaceIfPresent(items: readonly ProgrammeSummary[], record: ProgrammeRecord | ProgrammeSummary): readonly ProgrammeSummary[] {
  const summary = record as unknown as ProgrammeSummary;
  if (!items.some(item => item.enrolmentId === summary.enrolmentId)) return items;
  return items.map(item => (item.enrolmentId === summary.enrolmentId ? summary : item));
}

function restingPhase(state: Pick<ProgrammeState, 'selected' | 'listLoaded'>): ProgrammePhase {
  if (state.selected !== null) return 'detail-ready';
  return state.listLoaded ? 'list-ready' : 'idle';
}

/** Whether a read may begin: never while saving and never over an open choice. */
function canRead(state: ProgrammeState, enrolmentId?: string): boolean {
  if (state.disposed || SAVING.has(state.phase)) return false;
  if (state.confirmation === null && state.enrolDraft === null) return true;
  return state.reloadRequired && enrolmentId !== undefined && state.selectedId === enrolmentId;
}

function isCurrent(
  state: ProgrammeState,
  action: { ownerKey: string; requestId: number },
  kind: ProgrammeActiveRequest['kind'],
): boolean {
  return (
    !state.disposed &&
    action.ownerKey === state.ownerKey &&
    state.activeRequest !== null &&
    state.activeRequest.requestId === action.requestId &&
    state.activeRequest.kind === kind
  );
}

/** Why the server's answer means a programme cannot be evaluated. */
export function programmeBlockedReason(evaluation: { missing?: readonly { code?: string }[] } | null | undefined):
ProgrammeBlockedReason | null {
  if (evaluation === null || evaluation === undefined) return null;
  const codes = (evaluation.missing ?? []).map(entry => entry?.code ?? '');
  if (codes.includes('rule-withdrawn')) return 'reviewed-content-withdrawn';
  if (codes.some(code => code === 'rule-draft' || code === 'missing-transition-policy')) {
    return 'reviewed-content-pending';
  }
  if (codes.some(code => ['rule-publication-mismatch', 'rule-id-mismatch', 'rule-version-mismatch'].includes(code))) {
    return 'reviewed-content-mismatch';
  }
  if (codes.some(code => ['product-unverified', 'product-version-missing', 'product-rule-mismatch', 'product-version-mismatch'].includes(code))) {
    return 'product-mismatch';
  }
  return null;
}

function blockedReasonForCode(code: string): ProgrammeBlockedReason | null {
  switch (code) {
    case 'rule-withdrawn':
      return 'reviewed-content-withdrawn';
    case 'rule-content-pending':
      return 'reviewed-content-pending';
    case 'rule-publication-mismatch':
      return 'reviewed-content-mismatch';
    case 'product-mismatch':
      return 'product-mismatch';
    default:
      return null;
  }
}

/** The exact command for the pending mutation, or null when none is pending. */
export type ProgrammeCommand =
  | { readonly kind: 'enrol'; readonly command: Record<string, unknown> }
  | { readonly kind: 'pause'; readonly command: Record<string, unknown> }
  | { readonly kind: 'abandon'; readonly command: Record<string, unknown> }
  | { readonly kind: 'complete'; readonly command: Record<string, unknown> };

/**
 * The fields a mutation carries: only the owner's own facts plus the operation
 * id, the enrolment it acts on and the revision the owner last saw. Every
 * server-derived fact stays out.
 */
function mutationFields(state: ProgrammeState): { kind: ProgrammeCommandKind; fields: Record<string, unknown> } | null {
  if (state.enrolDraft !== null) {
    const { offer, startDate } = state.enrolDraft;
    return {
      kind: 'enrol',
      fields: { offer: { ...offer }, startDate },
    };
  }
  if (state.confirmation === null || state.selected === null || state.selectedId === null) return null;
  const base = { enrolmentId: state.selectedId, expectedRevision: state.selected.revision };
  const at = state.pendingAt;
  if (state.confirmation === 'pause') {
    return { kind: 'pause', fields: { ...base, command: { kind: 'pause', pausedAt: at?.pausedAt, reasonCode: state.pauseReason } } };
  }
  if (state.confirmation === 'abandon') {
    return { kind: 'abandon', fields: { ...base, command: { kind: 'abandon' } } };
  }
  return { kind: 'complete', fields: { ...base, command: { kind: 'complete', completedAt: at?.completedAt } } };
}

export function buildProgrammeCommand(state: ProgrammeState): ProgrammeCommand | null {
  const fields = mutationFields(state);
  if (fields === null || state.pending === null) return null;
  return { kind: fields.kind, command: { operationId: state.pending.operationId, ...fields.fields } } as ProgrammeCommand;
}

export function programmeReducer(state: ProgrammeState, action: ProgrammeAction): ProgrammeState {
  switch (action.type) {
    case 'owner_changed': {
      if (action.ownerKey === state.ownerKey) return state;
      // Everything of the previous owner goes: lists, detail, drafts, the
      // pending command, failures and pagination.
      return { ...initialProgrammeState(action.ownerKey), ownerEpoch: state.ownerEpoch + 1 };
    }
    case 'disposed': {
      if (state.disposed) return state;
      return { ...initialProgrammeState(state.ownerKey), ownerEpoch: state.ownerEpoch, phase: 'disposed', disposed: true };
    }
    case 'list_requested': {
      if (!canRead(state)) return state;
      return {
        ...state,
        phase: 'loading-list',
        failure: null,
        blockedReason: null,
        activeRequest: { requestId: action.requestId, kind: 'list', background: false },
      };
    }
    case 'list_loaded': {
      if (!isCurrent(state, action, 'list')) return state;
      return {
        ...state,
        phase: 'list-ready',
        items: action.page.items,
        nextCursor: action.page.nextCursor,
        hasMore: action.page.nextCursor !== null,
        listLoaded: true,
        listEmpty: action.page.items.length === 0,
        selectedId: null,
        selected: null,
        savedRecord: null,
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        reloadAfterSaveFailed: false,
      };
    }
    case 'page_requested': {
      const pageable = state.phase === 'list-ready' || (state.phase === 'failed' && state.failure?.source === 'page');
      if (!pageable || state.nextCursor === null || !canRead(state)) return state;
      return {
        ...state,
        phase: 'loading-list',
        failure: null,
        activeRequest: { requestId: action.requestId, kind: 'page', background: false },
      };
    }
    case 'page_loaded': {
      if (!isCurrent(state, action, 'page')) return state;
      return {
        ...state,
        phase: 'list-ready',
        items: appendPage(state.items, action.page.items),
        nextCursor: action.page.nextCursor,
        hasMore: action.page.nextCursor !== null,
        listEmpty: false,
        activeRequest: null,
        failure: null,
      };
    }
    case 'detail_requested': {
      if (!UUID.test(action.enrolmentId) || !canRead(state, action.enrolmentId)) return state;
      const sameRecord = state.selectedId === action.enrolmentId;
      // A background refresh never changes the visible phase and fails quietly.
      const background = action.background === true && sameRecord && state.selected !== null;
      return {
        ...state,
        phase: background ? state.phase : 'loading-detail',
        selectedId: action.enrolmentId,
        selected: background ? state.selected : null,
        failure: background ? state.failure : null,
        blockedReason: null,
        activeRequest: { requestId: action.requestId, kind: 'detail', background },
      };
    }
    case 'detail_loaded': {
      if (!isCurrent(state, action, 'detail') || action.detail.enrolmentId !== state.selectedId) return state;
      const blockedReason = programmeBlockedReason(action.detail.evaluation as never);
      const background = state.activeRequest?.background === true;
      return {
        ...state,
        selected: action.detail,
        savedRecord: null,
        items: replaceIfPresent(state.items, action.detail),
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        reloadAfterSaveFailed: false,
        blockedReason,
        confirmation: blockedReason !== null ? null : state.confirmation,
        pauseReason: blockedReason !== null ? null : state.pauseReason,
        pending: blockedReason !== null ? null : state.pending,
        pendingAt: blockedReason !== null ? null : state.pendingAt,
        phase: blockedReason !== null ? 'blocked-content' : background ? state.phase : 'detail-ready',
      };
    }
    case 'enrol_started': {
      if (state.enrolDraft !== null || SAVING.has(state.phase) || state.disposed) return state;
      return {
        ...state,
        phase: 'idle',
        enrolDraft: { offer: action.offer, startDate: null as never },
        failure: null,
        pending: null,
        selected: null,
        selectedId: null,
      };
    }
    case 'enrol_start_changed': {
      if (state.enrolDraft === null || SAVING.has(state.phase)) return state;
      return { ...state, enrolDraft: { ...state.enrolDraft, startDate: action.startDate }, failure: null };
    }
    case 'enrol_cancelled': {
      if (state.enrolDraft === null || SAVING.has(state.phase) || state.disposed) return state;
      const cleared = { ...state, enrolDraft: null, pending: null, pendingAt: null, failure: null, activeRequest: null };
      return { ...cleared, phase: restingPhase(cleared) };
    }
    case 'pause_reason_changed': {
      if (state.confirmation !== 'pause' || SAVING.has(state.phase)) return state;
      return { ...state, pauseReason: action.reasonCode, failure: null };
    }
    case 'confirmation_started': {
      // The action type is closed at compile time, but reducer actions can also
      // cross persisted/test boundaries. Refuse unsupported lifecycle commands
      // at runtime instead of retaining an unusable confirmation.
      if (!(['pause', 'abandon', 'complete'] as const).includes(action.kind)) return state;
      const blockedAbandon = state.phase === 'blocked-content'
        && state.blockedReason !== null
        && action.kind === 'abandon';
      if ((!blockedAbandon && state.phase !== 'detail-ready') || state.selected === null) return state;
      if (state.confirmation !== null || state.reloadRequired || state.disposed) return state;
      // A programme the server has already closed or stopped takes no further step.
      if (state.selected.status !== 'active') return state;
      return { ...state, confirmation: action.kind, pauseReason: null, failure: null };
    }
    case 'confirmation_cancelled': {
      if (state.confirmation === null || SAVING.has(state.phase) || state.disposed) return state;
      return { ...state, confirmation: null, pauseReason: null, pending: null, pendingAt: null, failure: null };
    }
    case 'save_requested': {
      const at = action.pausedAt ?? action.completedAt;
      const pendingAt = state.pending !== null && state.pendingAt !== null
        ? state.pendingAt
        : { pausedAt: action.pausedAt ?? at ?? '', completedAt: action.completedAt ?? at ?? '' };
      // The command fingerprint must include the dated fact on the first
      // attempt as well as on a retry. Otherwise a committed-then-lost retry
      // appears to be a different command and receives a new operation id.
      const commandState = { ...state, pendingAt };
      const fields = mutationFields(commandState);
      if (fields === null || state.reloadRequired || SAVING.has(state.phase) || state.disposed) return state;
      // Withdrawn or mismatched guidance may never drive pause or completion.
      // Stopping remains available because it only closes the owner's record
      // and the server explicitly permits abandon without a reviewed rule.
      if (state.blockedReason !== null && fields.kind !== 'abandon') return state;
      if (state.selected === null && fields.kind !== 'enrol') return state;
      if (state.enrolDraft !== null && state.enrolDraft.startDate === null) return state;
      const fingerprint = canonical({ kind: fields.kind, ...withoutUndefined(fields.fields) });
      // The same command keeps its operation id; a different one gets a new one.
      const reuse = state.pending !== null && state.pending.kind === fields.kind && state.pending.fingerprint === fingerprint;
      return {
        ...state,
        phase: 'saving',
        failure: null,
        pending: reuse ? state.pending : { kind: fields.kind, operationId: action.operationId, fingerprint },
        pendingAt,
        activeRequest: { requestId: action.requestId, kind: 'save', background: false },
      };
    }
    case 'save_succeeded': {
      if (!isCurrent(state, action, 'save')) return state;
      return {
        ...state,
        phase: 'detail-ready',
        selected: action.record,
        selectedId: action.record.enrolmentId,
        savedRecord: action.record,
        items: replaceIfPresent(state.items, action.record),
        enrolDraft: null,
        confirmation: null,
        pauseReason: null,
        pending: null,
        pendingAt: null,
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        reloadAfterSaveFailed: false,
        lastSaved: { kind: state.pending?.kind ?? 'enrol', requestId: action.requestId },
      };
    }
    case 'request_failed': {
      const active = state.activeRequest;
      if (action.ownerKey !== state.ownerKey || active === null || active.requestId !== action.requestId) return state;
      if (state.disposed) return state;
      if (active.background) {
        // A background refresh failure never paints: the confirmed change stays
        // and the owner is offered a recovery state.
        return {
          ...state,
          activeRequest: null,
          reloadAfterSaveFailed: active.kind === 'detail' && state.lastSaved !== null,
        };
      }
      const blocked = blockedReasonForCode(action.failure.code);
      if (active.kind === 'save') {
        if (blocked !== null) {
          return {
            ...state,
            phase: 'blocked-content',
            blockedReason: blocked,
            failure: action.failure,
            activeRequest: null,
            reloadRequired: false,
          };
        }
        const conflicting = RELOAD_CODES.has(action.failure.code);
        return {
          ...state,
          phase: conflicting
            ? 'conflict-reload'
            : action.failure.code === 'unavailable'
              ? 'unavailable'
              : action.failure.retryable
                ? 'offline-pending'
                : 'failed',
          failure: action.failure,
          activeRequest: null,
          reloadRequired: conflicting,
        };
      }
      if (blocked !== null) {
        return { ...state, phase: 'blocked-content', blockedReason: blocked, failure: action.failure, activeRequest: null };
      }
      if (action.failure.code === 'unavailable') {
        return { ...state, phase: 'unavailable', failure: action.failure, activeRequest: null };
      }
      // A failed read after a confirmed change keeps that change on screen.
      const afterSaveRead = active.kind === 'detail' && state.lastSaved !== null;
      if (afterSaveRead) {
        return {
          ...state,
          phase: 'detail-ready',
          selected: state.savedRecord ?? state.selected,
          failure: action.failure,
          activeRequest: null,
          reloadAfterSaveFailed: true,
        };
      }
      return { ...state, phase: 'failed', failure: action.failure, activeRequest: null };
    }
    case 'detail_closed': {
      if (state.confirmation !== null || SAVING.has(state.phase) || state.selectedId === null) return state;
      const closed = {
        ...state,
        selected: null,
        selectedId: null,
        savedRecord: null,
        failure: state.failure?.source === 'detail' ? null : state.failure,
        reloadRequired: false,
        reloadAfterSaveFailed: false,
        activeRequest: state.activeRequest?.kind === 'detail' ? null : state.activeRequest,
      };
      return { ...closed, phase: restingPhase(closed) };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export interface ProgrammeController {
  readonly getState: () => ProgrammeState;
  readonly subscribe: (listener: (state: ProgrammeState) => void) => () => void;
  readonly setOwner: (ownerKey: string) => void;
  readonly loadList: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
  readonly openDetail: (enrolmentId: string) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly startEnrol: (offer: ProgrammeOfferBinding) => void;
  readonly setEnrolStartDate: (startDate: ProgrammeStartDate) => void;
  readonly cancelEnrol: () => void;
  readonly enrol: {
    (offer: ProgrammeOfferBinding, startDate: ProgrammeStartDate): Promise<void>;
    (input: { readonly offer: ProgrammeOfferBinding; readonly startDate: ProgrammeStartDate }): Promise<void>;
  };
  readonly startPause: () => void;
  readonly startAbandon: () => void;
  readonly startComplete: () => void;
  readonly setPauseReason: (reasonCode: string) => void;
  readonly cancelConfirmation: () => void;
  readonly confirm: () => Promise<void>;
  readonly confirmComplete: () => Promise<void>;
  readonly closeDetail: () => void;
  readonly retry: () => Promise<void>;
  readonly dispose: () => void;
}

export interface ProgrammeControllerOptions {
  readonly ownerKey: string;
  readonly api: ProgrammeApi;
  /** Supplies one candidate id per save attempt; the reducer decides whether to keep it. */
  readonly newOperationId: () => string;
  /** The instants a pause or completion is dated at, and the list clock. */
  readonly now: () => Date;
  readonly pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/** A millisecond offset-aware instant, as the database stores one. */
function millisecondInstant(date: Date): string {
  return new Date(Math.floor(date.getTime())).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/**
 * Connects the reducer to the API. All networking lives here; every response is
 * dispatched with the owner and request token it was issued for, so the reducer
 * can drop anything stale. Cancel and read actions never mutate.
 */
export function createProgrammeController(options: ProgrammeControllerOptions): ProgrammeController {
  const { api, newOperationId } = options;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  let state = initialProgrammeState(options.ownerKey);
  let requestSeq = 0;
  const listeners = new Set<(next: ProgrammeState) => void>();

  const dispatch = (action: ProgrammeAction): void => {
    const next = programmeReducer(state, action);
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener(state);
  };

  const begin = (make: (requestId: number) => ProgrammeAction): number | null => {
    const requestId = ++requestSeq;
    dispatch(make(requestId));
    return state.activeRequest?.requestId === requestId ? requestId : null;
  };

  const settle = async <T>(
    requestId: number,
    source: ProgrammeFailure['source'],
    call: () => Promise<T>,
    onSuccess: (ownerKey: string, value: T) => void,
  ): Promise<boolean> => {
    const ownerKey = state.ownerKey;
    try {
      const value = await call();
      onSuccess(ownerKey, value);
      return true;
    } catch (error) {
      dispatch({ type: 'request_failed', ownerKey, requestId, failure: toProgrammeFailure(error, source) });
      return false;
    }
  };

  const openDetail = async (enrolmentId: string, background = false): Promise<void> => {
    const requestId = begin(id => ({ type: 'detail_requested', requestId: id, enrolmentId, background }));
    if (requestId === null) return;
    await settle(requestId, 'detail', () => api.getProgramme(enrolmentId), (ownerKey, detail) =>
      dispatch({ type: 'detail_loaded', ownerKey, requestId, detail }));
  };

  const loadList = async (): Promise<void> => {
    const requestId = begin(id => ({ type: 'list_requested', requestId: id }));
    if (requestId === null) return;
    await settle(requestId, 'list', () => api.listProgrammes({ limit: pageSize, cursor: null }), (ownerKey, page) =>
      dispatch({ type: 'list_loaded', ownerKey, requestId, page }));
  };

  const loadMore = async (): Promise<void> => {
    const cursor = state.nextCursor;
    const requestId = begin(id => ({ type: 'page_requested', requestId: id }));
    if (requestId === null) return;
    await settle(requestId, 'page', () => api.listProgrammes({ limit: pageSize, cursor }), (ownerKey, page) =>
      dispatch({ type: 'page_loaded', ownerKey, requestId, page }));
  };

  /** Send the pending command exactly once, then read the authoritative detail. */
  const send = async (): Promise<void> => {
    const operationId = newOperationId();
    const at = millisecondInstant(options.now());
    const requestId = begin(id => ({
      type: 'save_requested',
      requestId: id,
      operationId,
      pausedAt: at,
      completedAt: at,
    }));
    if (requestId === null) return;
    const built = buildProgrammeCommand(state);
    if (built === null) return;
    const saved = await settle(requestId, built.kind, () =>
      built.kind === 'enrol' ? api.enrolProgramme(built.command) : api.changeProgramme(built.command),
    (ownerKey, record) => dispatch({ type: 'save_succeeded', ownerKey, requestId, record }));
    // Reload the authoritative detail so the screen shows what the server now
    // holds; a failed read keeps the confirmed record and a recovery state.
    if (saved && state.selectedId !== null && !state.disposed) await openDetail(state.selectedId);
  };

  const retry = async (): Promise<void> => {
    const failure = state.failure;
    if (failure === null || state.disposed) return;
    if (failure.source === 'list') return loadList();
    if (failure.source === 'page') return loadMore();
    if (failure.source === 'detail') return openDetail(state.selectedId ?? '');
    if (state.reloadRequired) return openDetail(state.selectedId ?? '');
    return send();
  };

  return {
    getState: () => state,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setOwner: ownerKey => dispatch({ type: 'owner_changed', ownerKey }),
    loadList,
    loadMore,
    openDetail: enrolmentId => openDetail(enrolmentId),
    reload: async () => {
      if (state.selectedId !== null) return openDetail(state.selectedId);
      return loadList();
    },
    startEnrol: offer => dispatch({ type: 'enrol_started', offer }),
    setEnrolStartDate: startDate => dispatch({ type: 'enrol_start_changed', startDate }),
    cancelEnrol: () => dispatch({ type: 'enrol_cancelled' }),
    enrol: async (
      offerOrInput: ProgrammeOfferBinding | { readonly offer: ProgrammeOfferBinding; readonly startDate: ProgrammeStartDate },
      suppliedStartDate?: ProgrammeStartDate,
    ) => {
      const wrapped = 'offer' in offerOrInput && 'startDate' in offerOrInput;
      const offer = wrapped ? offerOrInput.offer : offerOrInput;
      const startDate = wrapped ? offerOrInput.startDate : suppliedStartDate;
      if (startDate === undefined) return;
      dispatch({ type: 'enrol_started', offer });
      dispatch({ type: 'enrol_start_changed', startDate });
      await send();
    },
    startPause: () => dispatch({ type: 'confirmation_started', kind: 'pause' }),
    startAbandon: () => dispatch({ type: 'confirmation_started', kind: 'abandon' }),
    startComplete: () => dispatch({ type: 'confirmation_started', kind: 'complete' }),
    setPauseReason: reasonCode => dispatch({ type: 'pause_reason_changed', reasonCode }),
    cancelConfirmation: () => dispatch({ type: 'confirmation_cancelled' }),
    confirm: () => send(),
    confirmComplete: async () => {
      dispatch({ type: 'confirmation_started', kind: 'complete' });
      await send();
    },
    closeDetail: () => dispatch({ type: 'detail_closed' }),
    retry,
    dispose: () => dispatch({ type: 'disposed' }),
  };
}

/** Kept for callers that only need the error type at this boundary. */
export { ProgrammeError };
export type { ProgrammeApi, ProgrammeDetail, ProgrammePage, ProgrammeRecord } from './programme-api.ts';

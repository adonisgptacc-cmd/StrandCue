import type { CueCheckApi, CueCheckCursor, CueCheckDetail, CueCheckPage, CueCheckReceipt } from './cue-check-api';
import { CueCheckError, toCueCheckFailure, type CueCheckFailure } from './cue-check-errors';

/**
 * Deterministic, immutable state machine for the private Cue Check surface
 * (CC-01..CC-03), plus a small framework-free controller that connects it to
 * the typed API.
 *
 * The reducer is pure: it never performs I/O, reads a clock or generates an
 * id. Request tokens and operation ids arrive on actions, so every transition
 * is reproducible. Three guards keep late work from painting the wrong data:
 *
 * - a response only applies while it is still the one active request, so an
 *   older response can never overwrite newer state;
 * - a response carries the owner it was requested for, and an owner change
 *   synchronously resets everything (lists, details, drafts, pending commands,
 *   failures and pagination) while dropping the active request (the app also
 *   keys the whole Journey view by owner, so a new owner always gets a new
 *   controller; this guard is defence in depth);
 * - a mutation is retried under the operation id of its first attempt only
 *   when its payload is equivalent (same fields and values; key order never
 *   matters to the server), so a retry can never double
 *   record, and a changed payload can never ride an old id.
 *
 * The machine holds the owner's own words as a raw draft and sends them only
 * through the API's strict schemas. It derives no summary, never infers or
 * fills in an answer, and never touches guidance or protocol execution.
 */

export type CueCheckPhase =
  | 'idle'
  | 'loading-list'
  | 'list-ready'
  | 'loading-detail'
  | 'detail-ready'
  | 'editing-new'
  | 'editing-correction'
  | 'saving-new'
  | 'saving-correction'
  | 'void-confirmation'
  | 'voiding'
  | 'failed'
  | 'offline-pending';

export type CueCheckSelected = CueCheckReceipt | CueCheckDetail;

/** The terminal execution a new check-in is about; nothing else may start one. */
export interface TerminalExecutionContext {
  readonly executionId: string;
  readonly status: string;
}

export type CueCheckCompose =
  | { readonly mode: 'new'; readonly executionId: string }
  | { readonly mode: 'correction'; readonly recordId: string; readonly expectedRevision: number }
  | { readonly mode: 'void'; readonly recordId: string; readonly expectedRevision: number };

export type CueCheckMutationKind = 'create' | 'correct' | 'void';

/** The in-flight or last-failed mutation; its id is reused only for identical payloads. */
export interface CueCheckPending {
  readonly kind: CueCheckMutationKind;
  readonly operationId: string;
  readonly fingerprint: string;
}

export interface CueCheckActiveRequest {
  readonly requestId: number;
  readonly kind: 'list' | 'page' | 'detail' | 'save';
  /** A refresh that never changes the visible phase and fails quietly. */
  readonly background: boolean;
}

export type CueCheckDraft = Readonly<Record<string, unknown>>;

export interface CueCheckState {
  readonly phase: CueCheckPhase;
  readonly ownerKey: string;
  readonly ownerEpoch: number;
  readonly items: readonly CueCheckReceipt[];
  readonly nextCursor: CueCheckCursor | null;
  readonly hasMore: boolean;
  /** True once a first list load succeeded; an empty list is then "ready", not "not started". */
  readonly listLoaded: boolean;
  readonly selectedId: string | null;
  readonly selected: CueCheckSelected | null;
  readonly compose: CueCheckCompose | null;
  readonly draft: CueCheckDraft;
  readonly reason: string;
  readonly pending: CueCheckPending | null;
  readonly activeRequest: CueCheckActiveRequest | null;
  readonly failure: CueCheckFailure | null;
  /** Set by a stale-record failure: reload before any further mutation. */
  readonly reloadRequired: boolean;
  /** The last confirmed save, so an outcome is announced only when one really happened. */
  readonly lastSaved: { readonly mode: CueCheckCompose['mode']; readonly requestId: number } | null;
  /** A refresh of the open record's history failed; the receipt alone is shown. */
  readonly historyUnavailable: boolean;
}

export type CueCheckAction =
  | { readonly type: 'owner_changed'; readonly ownerKey: string }
  | { readonly type: 'list_requested'; readonly requestId: number }
  | { readonly type: 'list_loaded'; readonly ownerKey: string; readonly requestId: number; readonly page: Pick<CueCheckPage, 'items' | 'nextCursor'> }
  | { readonly type: 'page_requested'; readonly requestId: number }
  | { readonly type: 'page_loaded'; readonly ownerKey: string; readonly requestId: number; readonly page: Pick<CueCheckPage, 'items' | 'nextCursor'> }
  | { readonly type: 'detail_requested'; readonly requestId: number; readonly recordId: string; readonly background?: boolean }
  | { readonly type: 'detail_loaded'; readonly ownerKey: string; readonly requestId: number; readonly detail: CueCheckDetail }
  | { readonly type: 'new_draft_started'; readonly execution: TerminalExecutionContext }
  | { readonly type: 'draft_changed'; readonly observation: CueCheckDraft }
  | { readonly type: 'reason_changed'; readonly reason: string }
  | { readonly type: 'correction_started' }
  | { readonly type: 'void_started' }
  | { readonly type: 'save_requested'; readonly requestId: number; readonly operationId: string }
  | { readonly type: 'save_succeeded'; readonly ownerKey: string; readonly requestId: number; readonly receipt: CueCheckReceipt }
  | { readonly type: 'request_failed'; readonly ownerKey: string; readonly requestId: number; readonly failure: CueCheckFailure }
  | { readonly type: 'detail_closed' }
  | { readonly type: 'cancelled' };

export function initialCueCheckState(ownerKey: string): CueCheckState {
  return {
    phase: 'idle',
    ownerKey,
    ownerEpoch: 0,
    items: [],
    nextCursor: null,
    hasMore: false,
    listLoaded: false,
    selectedId: null,
    selected: null,
    compose: null,
    draft: {},
    reason: '',
    pending: null,
    activeRequest: null,
    failure: null,
    reloadRequired: false,
    lastSaved: null,
    historyUnavailable: false,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAVING: ReadonlySet<CueCheckPhase> = new Set<CueCheckPhase>(['saving-new', 'saving-correction', 'voiding']);
/** Failures that mean the owner's view of the record is stale. */
const RELOAD_CODES: ReadonlySet<string> = new Set(['revision-conflict', 'record-voided']);

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

function mutationFields(state: CueCheckState): { kind: CueCheckMutationKind; fields: Record<string, unknown> } | null {
  const { compose } = state;
  if (compose === null) return null;
  if (compose.mode === 'new') {
    return { kind: 'create', fields: { executionId: compose.executionId, observation: state.draft } };
  }
  if (compose.mode === 'correction') {
    return {
      kind: 'correct',
      fields: {
        recordId: compose.recordId,
        expectedRevision: compose.expectedRevision,
        observation: state.draft,
        reason: state.reason,
      },
    };
  }
  return {
    kind: 'void',
    fields: { recordId: compose.recordId, expectedRevision: compose.expectedRevision, reason: state.reason },
  };
}

export type CueCheckCommand =
  | { readonly kind: 'create'; readonly command: Record<string, unknown> }
  | { readonly kind: 'correct'; readonly command: Record<string, unknown> }
  | { readonly kind: 'void'; readonly command: Record<string, unknown> };

/**
 * The exact command for the pending mutation, or null when none is pending.
 * It carries only the owner's own words plus ids and the expected revision;
 * every server-derived fact stays out. A retry rebuilds an equivalent command:
 * the same fields and values, which the server treats as the same operation.
 */
export function buildCueCheckCommand(state: CueCheckState): CueCheckCommand | null {
  const fields = mutationFields(state);
  if (fields === null || state.pending === null) return null;
  return { kind: fields.kind, command: { operationId: state.pending.operationId, ...fields.fields } };
}

function upsert(items: readonly CueCheckReceipt[], receipt: CueCheckReceipt): readonly CueCheckReceipt[] {
  const index = items.findIndex(item => item.recordId === receipt.recordId);
  if (index === -1) return [receipt, ...items];
  return items.map((item, position) => (position === index ? receipt : item));
}

function replaceIfPresent(items: readonly CueCheckReceipt[], receipt: CueCheckReceipt): readonly CueCheckReceipt[] {
  return items.some(item => item.recordId === receipt.recordId) ? upsert(items, receipt) : items;
}

function appendPage(items: readonly CueCheckReceipt[], page: readonly CueCheckReceipt[]): readonly CueCheckReceipt[] {
  const seen = new Set(items.map(item => item.recordId));
  const fresh = page.filter(item => {
    if (seen.has(item.recordId)) return false;
    seen.add(item.recordId);
    return true;
  });
  return [...items, ...fresh];
}

function restingPhase(state: Pick<CueCheckState, 'selected' | 'listLoaded'>): CueCheckPhase {
  if (state.selected !== null) return 'detail-ready';
  return state.listLoaded ? 'list-ready' : 'idle';
}

function composePhase(compose: CueCheckCompose): CueCheckPhase {
  if (compose.mode === 'new') return 'editing-new';
  return compose.mode === 'correction' ? 'editing-correction' : 'void-confirmation';
}

/** Resume editing after a failed save when the owner changes their words. */
function afterEdit(state: CueCheckState): Pick<CueCheckState, 'phase' | 'failure'> {
  const resumes = (state.phase === 'failed' || state.phase === 'offline-pending') && !state.reloadRequired;
  if (!resumes || state.compose === null) return { phase: state.phase, failure: state.failure };
  return { phase: composePhase(state.compose), failure: null };
}

/** Whether a read may begin: never while saving and never over an unsent draft. */
function canRead(state: CueCheckState, recordId?: string): boolean {
  if (SAVING.has(state.phase)) return false;
  if (state.compose === null) return true;
  return (
    state.reloadRequired &&
    recordId !== undefined &&
    state.compose.mode !== 'new' &&
    state.compose.recordId === recordId
  );
}

function isCurrent(
  state: CueCheckState,
  action: { ownerKey: string; requestId: number },
  kind: CueCheckActiveRequest['kind'],
): boolean {
  return (
    action.ownerKey === state.ownerKey &&
    state.activeRequest !== null &&
    state.activeRequest.requestId === action.requestId &&
    state.activeRequest.kind === kind
  );
}

export function cueCheckReducer(state: CueCheckState, action: CueCheckAction): CueCheckState {
  switch (action.type) {
    case 'owner_changed': {
      if (action.ownerKey === state.ownerKey) return state;
      return { ...initialCueCheckState(action.ownerKey), ownerEpoch: state.ownerEpoch + 1 };
    }
    case 'list_requested': {
      if (!canRead(state)) return state;
      return {
        ...state,
        phase: 'loading-list',
        failure: null,
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
        activeRequest: null,
        failure: null,
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
        activeRequest: null,
        failure: null,
      };
    }
    case 'detail_requested': {
      if (!UUID.test(action.recordId) || !canRead(state, action.recordId)) return state;
      const sameRecord = state.selectedId === action.recordId;
      const background = action.background === true && sameRecord && state.selected !== null;
      return {
        ...state,
        phase: background ? state.phase : 'loading-detail',
        selectedId: action.recordId,
        selected: sameRecord ? state.selected : null,
        failure: background ? state.failure : null,
        historyUnavailable: false,
        activeRequest: { requestId: action.requestId, kind: 'detail', background },
      };
    }
    case 'detail_loaded': {
      if (!isCurrent(state, action, 'detail') || action.detail.recordId !== state.selectedId) return state;
      const base = {
        ...state,
        selected: action.detail,
        items: replaceIfPresent(state.items, action.detail),
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        historyUnavailable: false,
      };
      const { compose } = state;
      if (compose !== null && compose.mode !== 'new' && compose.recordId === action.detail.recordId) {
        // The stale edit session resumes on the freshly loaded revision, or
        // ends if the record was removed meanwhile; the draft stays the owner's.
        if (action.detail.lifecycle === 'voided') {
          return { ...base, phase: 'detail-ready', compose: null, draft: {}, reason: '', pending: null };
        }
        const resumed: CueCheckCompose = { ...compose, expectedRevision: action.detail.revision };
        return { ...base, phase: composePhase(resumed), compose: resumed, pending: null };
      }
      return { ...base, phase: state.activeRequest?.background === true ? state.phase : 'detail-ready' };
    }
    case 'new_draft_started': {
      const { executionId, status } = action.execution;
      const terminal = status === 'completed' || status === 'abandoned';
      if (!terminal || !UUID.test(executionId) || state.compose !== null || SAVING.has(state.phase)) return state;
      return {
        ...state,
        phase: 'editing-new',
        // An outstanding read is dropped so its late response cannot repaint
        // over the draft; saves are already excluded above.
        activeRequest: null,
        compose: { mode: 'new', executionId },
        draft: {},
        reason: '',
        pending: null,
        failure: null,
        reloadRequired: false,
      };
    }
    case 'draft_changed': {
      const { compose } = state;
      if (compose === null || compose.mode === 'void' || SAVING.has(state.phase)) return state;
      const merged: Record<string, unknown> = { ...state.draft };
      for (const [key, value] of Object.entries(action.observation)) {
        if (value === undefined) delete merged[key];
        else merged[key] = value;
      }
      return { ...state, ...afterEdit(state), draft: merged };
    }
    case 'reason_changed': {
      const { compose } = state;
      if (compose === null || compose.mode === 'new' || SAVING.has(state.phase)) return state;
      return { ...state, ...afterEdit(state), reason: action.reason };
    }
    case 'correction_started':
    case 'void_started': {
      const { selected } = state;
      if (state.phase !== 'detail-ready' || selected === null || selected.lifecycle !== 'active') return state;
      if (state.compose !== null || state.reloadRequired) return state;
      const correcting = action.type === 'correction_started';
      return {
        ...state,
        phase: correcting ? 'editing-correction' : 'void-confirmation',
        compose: { mode: correcting ? 'correction' : 'void', recordId: selected.recordId, expectedRevision: selected.revision },
        draft: correcting ? { ...selected.observation } : {},
        reason: '',
        pending: null,
        failure: null,
      };
    }
    case 'save_requested': {
      const fields = mutationFields(state);
      if (fields === null || state.reloadRequired || SAVING.has(state.phase) || state.compose === null) return state;
      const fingerprint = canonical({ kind: fields.kind, ...fields.fields });
      const reuse = state.pending !== null && state.pending.kind === fields.kind && state.pending.fingerprint === fingerprint;
      const savingPhase: CueCheckPhase =
        fields.kind === 'create' ? 'saving-new' : fields.kind === 'correct' ? 'saving-correction' : 'voiding';
      return {
        ...state,
        phase: savingPhase,
        failure: null,
        pending: reuse ? state.pending : { kind: fields.kind, operationId: action.operationId, fingerprint },
        activeRequest: { requestId: action.requestId, kind: 'save', background: false },
      };
    }
    case 'save_succeeded': {
      if (!isCurrent(state, action, 'save')) return state;
      const { compose } = state;
      // A receipt must belong to what was saved: the same record for a
      // correction or void, the same execution for a new check-in.
      const mismatched =
        (compose !== null && compose.mode !== 'new' && compose.recordId !== action.receipt.recordId) ||
        (compose !== null && compose.mode === 'new' && compose.executionId !== action.receipt.executionId);
      if (mismatched) {
        // An untrusted receipt ends the save as a failure the owner can retry or
        // cancel; leaving the save "in flight" would trap the screen.
        const source = compose.mode === 'new' ? 'create' : compose.mode === 'correction' ? 'correct' : 'void';
        return {
          ...state,
          phase: 'failed',
          activeRequest: null,
          failure: toCueCheckFailure(new CueCheckError('malformed-response'), source),
        };
      }
      return {
        ...state,
        phase: 'detail-ready',
        items: upsert(state.items, action.receipt),
        selectedId: action.receipt.recordId,
        selected: action.receipt,
        compose: null,
        draft: {},
        reason: '',
        pending: null,
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        lastSaved: { mode: compose?.mode ?? 'new', requestId: action.requestId },
      };
    }
    case 'request_failed': {
      const active = state.activeRequest;
      if (action.ownerKey !== state.ownerKey || active === null || active.requestId !== action.requestId) return state;
      if (active.background) {
        return { ...state, activeRequest: null, historyUnavailable: active.kind === 'detail' && state.selected !== null };
      }
      if (active.kind === 'save') {
        return {
          ...state,
          phase: action.failure.code === 'offline' ? 'offline-pending' : 'failed',
          failure: action.failure,
          activeRequest: null,
          reloadRequired: RELOAD_CODES.has(action.failure.code),
        };
      }
      return { ...state, phase: 'failed', failure: action.failure, activeRequest: null };
    }
    case 'detail_closed': {
      if (state.compose !== null || SAVING.has(state.phase) || state.selectedId === null) return state;
      const closed = {
        ...state,
        selected: null,
        selectedId: null,
        failure: state.failure?.source === 'detail' ? null : state.failure,
        reloadRequired: false,
        historyUnavailable: false,
        activeRequest: state.activeRequest?.kind === 'detail' ? null : state.activeRequest,
      };
      return { ...closed, phase: restingPhase(closed) };
    }
    case 'cancelled': {
      if (SAVING.has(state.phase)) return state;
      const selected = state.selected;
      const cleared = {
        ...state,
        compose: null,
        draft: {},
        reason: '',
        pending: null,
        activeRequest: null,
        failure: null,
        reloadRequired: false,
        selectedId: selected === null ? null : state.selectedId,
      };
      return { ...cleared, phase: restingPhase(cleared) };
    }
  }
}

/** The state surface a screen binds to. */
export interface CueCheckController {
  readonly getState: () => CueCheckState;
  readonly subscribe: (listener: (state: CueCheckState) => void) => () => void;
  readonly setOwner: (ownerKey: string) => void;
  readonly loadList: () => Promise<void>;
  readonly loadMore: () => Promise<void>;
  readonly openDetail: (recordId: string) => Promise<void>;
  readonly reload: () => Promise<void>;
  /** Reload the open record's history without replacing what is on screen. */
  readonly reloadHistory: () => Promise<void>;
  readonly startNew: (execution: TerminalExecutionContext) => void;
  readonly editDraft: (observation: CueCheckDraft) => void;
  readonly setReason: (reason: string) => void;
  readonly startCorrection: () => void;
  readonly startVoid: () => void;
  readonly cancel: () => void;
  readonly closeDetail: () => void;
  readonly save: () => Promise<void>;
  readonly retry: () => Promise<void>;
}

export interface CueCheckControllerOptions {
  readonly ownerKey: string;
  readonly api: CueCheckApi;
  /** Supplies one candidate id per save attempt; the reducer decides whether to keep it. */
  readonly newOperationId: () => string;
  readonly pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Connects the reducer to the API. All networking lives here; every response
 * is dispatched with the owner and request token it was issued for, so the
 * reducer can drop anything stale. Cancel and read actions never mutate.
 */
export function createCueCheckController(options: CueCheckControllerOptions): CueCheckController {
  const { api, newOperationId } = options;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  let state = initialCueCheckState(options.ownerKey);
  let requestSeq = 0;
  const listeners = new Set<(next: CueCheckState) => void>();

  const dispatch = (action: CueCheckAction): void => {
    const next = cueCheckReducer(state, action);
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener(state);
  };

  /** Dispatch a request-starting action; true only when the reducer accepted it. */
  const begin = (make: (requestId: number) => CueCheckAction): number | null => {
    const requestId = ++requestSeq;
    dispatch(make(requestId));
    return state.activeRequest?.requestId === requestId ? requestId : null;
  };

  const settle = async <T>(
    requestId: number,
    source: CueCheckFailure['source'],
    call: () => Promise<T>,
    onSuccess: (ownerKey: string, value: T) => void,
  ): Promise<void> => {
    const ownerKey = state.ownerKey;
    try {
      const value = await call();
      onSuccess(ownerKey, value);
    } catch (error) {
      dispatch({ type: 'request_failed', ownerKey, requestId, failure: toCueCheckFailure(error, source) });
    }
  };

  const openDetail = async (recordId: string, background = false): Promise<void> => {
    const requestId = begin(id => ({ type: 'detail_requested', requestId: id, recordId, background }));
    if (requestId === null) return;
    await settle(requestId, 'detail', () => api.getCueCheck(recordId), (ownerKey, detail) =>
      dispatch({ type: 'detail_loaded', ownerKey, requestId, detail }),
    );
  };

  const loadList = async (): Promise<void> => {
    const requestId = begin(id => ({ type: 'list_requested', requestId: id }));
    if (requestId === null) return;
    await settle(requestId, 'list', () => api.listCueChecks({ limit: pageSize, cursor: null }), (ownerKey, page) =>
      dispatch({ type: 'list_loaded', ownerKey, requestId, page }),
    );
  };

  const loadMore = async (): Promise<void> => {
    const cursor = state.nextCursor;
    const requestId = begin(id => ({ type: 'page_requested', requestId: id }));
    if (requestId === null) return;
    await settle(requestId, 'page', () => api.listCueChecks({ limit: pageSize, cursor }), (ownerKey, page) =>
      dispatch({ type: 'page_loaded', ownerKey, requestId, page }),
    );
  };

  const save = async (): Promise<void> => {
    const operationId = newOperationId();
    const requestId = begin(id => ({ type: 'save_requested', requestId: id, operationId }));
    if (requestId === null) return;
    const built = buildCueCheckCommand(state);
    if (built === null) return;
    const source = built.kind;
    const call =
      built.kind === 'create'
        ? () => api.recordCueCheck(built.command)
        : built.kind === 'correct'
          ? () => api.correctCueCheck(built.command)
          : () => api.voidCueCheck(built.command);
    let refresh: string | null = null;
    await settle(requestId, source, call, (ownerKey, receipt) => {
      dispatch({ type: 'save_succeeded', ownerKey, requestId, receipt });
      if (state.ownerKey === ownerKey && state.selectedId === receipt.recordId) refresh = receipt.recordId;
    });
    // Reload the saved record's history so the screen shows what the server
    // now holds; a failed refresh leaves the confirmed receipt in place.
    if (refresh !== null) await openDetail(refresh, true);
  };

  const reload = async (): Promise<void> => {
    if (state.selectedId !== null) await openDetail(state.selectedId);
  };

  const reloadHistory = async (): Promise<void> => {
    if (state.selectedId !== null) await openDetail(state.selectedId, true);
  };

  const retry = async (): Promise<void> => {
    const failure = state.failure;
    if (failure === null) return;
    if (failure.source === 'list') return loadList();
    if (failure.source === 'page') return loadMore();
    if (failure.source === 'detail') return reload();
    if (state.reloadRequired) return reload();
    return save();
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
    openDetail: recordId => openDetail(recordId),
    reload,
    reloadHistory,
    startNew: execution => dispatch({ type: 'new_draft_started', execution }),
    editDraft: observation => dispatch({ type: 'draft_changed', observation }),
    setReason: reason => dispatch({ type: 'reason_changed', reason }),
    startCorrection: () => dispatch({ type: 'correction_started' }),
    startVoid: () => dispatch({ type: 'void_started' }),
    cancel: () => dispatch({ type: 'cancelled' }),
    closeDetail: () => dispatch({ type: 'detail_closed' }),
    save,
    retry,
  };
}

import {
  executionEvents,
  type ExecutionCommand,
  type ExecutionEvent,
  type ProtocolExecution,
} from '../../../../packages/domain/src/index.ts';

/**
 * UI-side orchestration for protocol execution (TD-05–TD-08).
 *
 * Ownership: this reducer owns only the screen lifecycle — which request is
 * in flight, what the last confirmed server revision is, and what is waiting
 * on a retry. It never reimplements the state machine: the confirmed `result`
 * of every transition is computed by the caller with the domain's pure
 * `applyExecutionCommand`, and the server receipt is the authority applied on
 * success. Deviation free text (`reason`/`detail`) travels only inside the
 * command and its result: there is no facts path here.
 *
 * Epochs mirror the Today preflight: `ownerEpoch` counts owner changes (an
 * owner change resets the whole surface to `idle` and discards in-flight
 * responses), and only a success that arrives while its request is still the
 * current one may apply, so late responses can never paint another owner's
 * execution onto the screen.
 */

export type ExecutionUiPhase = 'idle' | 'starting' | 'ready' | 'saving' | 'save_failed';

export interface StartRequest {
  readonly operationId: string;
  readonly executionId: string;
  readonly recommendationRunId: string;
  readonly startedAt: string;
}

export interface PendingTransition {
  readonly operationId: string;
  readonly command: ExecutionCommand;
  readonly at: string;
  readonly result: ProtocolExecution;
  readonly expectedRevision: number;
}

export interface ExecutionUiState {
  readonly phase: ExecutionUiPhase;
  readonly ownerId: string;
  readonly ownerEpoch: number;
  /** Last server-confirmed execution, or the optimistic result while saving. */
  readonly execution: ProtocolExecution | null;
  /** Last server-confirmed execution before the optimistic result, if any. */
  readonly lastConfirmed: ProtocolExecution | null;
  /** Last confirmed server revision; -1 before the first receipt. */
  readonly revision: number;
  readonly startRequest: StartRequest | null;
  readonly pending: PendingTransition | null;
  readonly error: string | null;
}

export type ExecutionUiAction =
  | {
      readonly type: 'start_requested';
      readonly operationId: string;
      readonly executionId: string;
      readonly recommendationRunId: string;
      readonly startedAt: string;
    }
  | { readonly type: 'start_succeeded'; readonly execution: ProtocolExecution; readonly revision: number }
  | { readonly type: 'start_failed'; readonly error: string }
  | {
      readonly type: 'transition_requested';
      readonly operationId: string;
      readonly command: ExecutionCommand;
      readonly at: string;
      readonly result: ProtocolExecution;
      readonly expectedRevision: number;
    }
  | {
      readonly type: 'transition_succeeded';
      readonly execution: ProtocolExecution;
      readonly revision: number;
    }
  | { readonly type: 'transition_failed'; readonly error: string }
  | { readonly type: 'retry_requested' }
  | { readonly type: 'owner_changed'; readonly ownerId: string }
  | { readonly type: 'discarded' };

export function initialExecutionUi(ownerId: string): ExecutionUiState {
  return {
    phase: 'idle',
    ownerId,
    ownerEpoch: 0,
    execution: null,
    lastConfirmed: null,
    revision: -1,
    startRequest: null,
    pending: null,
    error: null,
  };
}

export function executionUiReducer(
  state: ExecutionUiState,
  action: ExecutionUiAction,
): ExecutionUiState {
  switch (action.type) {
    case 'start_requested': {
      if (state.phase !== 'idle') return state;
      return {
        ...state,
        phase: 'starting',
        error: null,
        startRequest: {
          operationId: action.operationId,
          executionId: action.executionId,
          recommendationRunId: action.recommendationRunId,
          startedAt: action.startedAt,
        },
      };
    }
    case 'start_succeeded': {
      // A late receipt (after an owner change or unmount discard) lands while
      // idle and must not paint another owner's execution onto the screen.
      if (state.phase !== 'starting') return state;
      return {
        ...state,
        phase: 'ready',
        execution: action.execution,
        lastConfirmed: action.execution,
        revision: action.revision,
        startRequest: null,
        error: null,
      };
    }
    case 'start_failed': {
      if (state.phase !== 'starting') return state;
      return { ...state, phase: 'save_failed', error: action.error };
    }
    case 'transition_requested': {
      if (state.phase !== 'ready') return state;
      return {
        ...state,
        phase: 'saving',
        error: null,
        lastConfirmed: state.execution,
        execution: action.result,
        pending: {
          operationId: action.operationId,
          command: action.command,
          at: action.at,
          result: action.result,
          expectedRevision: action.expectedRevision,
        },
      };
    }
    case 'transition_succeeded': {
      if (state.phase !== 'saving' && state.phase !== 'save_failed') return state;
      if (state.pending === null) return state;
      return {
        ...state,
        phase: 'ready',
        execution: action.execution,
        lastConfirmed: action.execution,
        revision: action.revision,
        pending: null,
        error: null,
      };
    }
    case 'transition_failed': {
      if (state.phase !== 'saving') return state;
      // The optimistic result was never confirmed: roll back to the last
      // confirmed execution so the screen never shows unrecorded history.
      // The pending operation is kept so a retry reuses its operation id.
      return {
        ...state,
        phase: 'save_failed',
        error: action.error,
        execution: state.lastConfirmed,
      };
    }
    case 'retry_requested': {
      if (state.pending !== null) {
        if (state.phase !== 'save_failed') return state;
        return { ...state, phase: 'saving', error: null, execution: state.pending.result };
      }
      if (state.startRequest !== null) {
        if (state.phase !== 'save_failed') return state;
        return { ...state, phase: 'starting', error: null };
      }
      return state;
    }
    case 'owner_changed': {
      if (action.ownerId === state.ownerId) return state;
      return {
        ...initialExecutionUi(action.ownerId),
        ownerEpoch: state.ownerEpoch + 1,
      };
    }
    case 'discarded': {
      return { ...initialExecutionUi(state.ownerId), ownerEpoch: state.ownerEpoch };
    }
  }
}

export interface ExecutionCompletion {
  readonly executionId: string;
  readonly recommendationRunId: string;
  readonly status: ProtocolExecution['status'];
  /**
   * Confirmed actual events only, in plan order. Skipped, substituted,
   * modified and pending steps never appear here: the completion result is
   * history of what was confirmed, suitable for Cue Check creation.
   */
  readonly confirmed: readonly ExecutionEvent[];
}

/** Build the completion result the Cue Check surface will consume. Pure. */
export function buildExecutionCompletion(execution: ProtocolExecution): ExecutionCompletion {
  return {
    executionId: execution.executionId,
    recommendationRunId: execution.recommendationRunId,
    status: execution.status,
    confirmed: executionEvents(execution),
  };
}

import {
  applyExecutionCommand,
  ProtocolExecutionError,
  type ExecutionCommand,
  type ProtocolExecution,
} from '../../../../packages/domain/src/index.ts';
import {
  transitionProtocolExecution,
  type ProtocolExecutionReceipt,
} from './protocol-execution-api.ts';

/**
 * One dispatcher for every protocol transition (TD-07–TD-08).
 *
 * A user action flows through exactly three steps here:
 *
 * 1. `begin` reads the clock exactly once. That single `eventAt` stamps both
 *    the optimistic preview (the domain's pure `applyExecutionCommand`) and
 *    the wire command — the two can never diverge the way two separate clock
 *    reads could. `begin` is synchronous so the caller can paint the preview
 *    and arm the pending guard before the next tap is processed.
 * 2. `deliver` persists the bounded wire command (`operationId`,
 *    `executionId`, `expectedRevision`, `command`, `at` — never a client
 *    snapshot) via `transitionProtocolExecution`.
 * 3. The caller reconciles with the authoritative receipt: the server owns
 *    `updatedAt` (its own clock), so the receipt legitimately differs from
 *    the preview. This module carries both and never asserts equality.
 *
 * Double taps: `begin` returns `{ status: 'busy' }` without touching the
 * clock or the network while an operation is pending, and `deliver` refuses
 * a foreign operation while one is in flight. Retries resend the stored wire
 * request — same operation id, same timestamp, no clock re-read — so the
 * server stays idempotent.
 *
 * Errors: stable database codes become fixed user copy here. Raw codes and
 * raw database messages never reach the screen.
 */

/** User copy for every stable code the transition boundary can raise. */
export const TRANSITION_USER_COPY: Readonly<Record<string, string>> = {
  'operation-conflict': 'This confirmation is already saving. Check what is confirmed before trying again.',
  'revision-conflict':
    'Something changed while saving. The latest confirmed record is shown, so check it before trying again.',
  'execution-conflict': 'This plan was started more than once. The latest confirmed record is shown.',
  'execution-not-found': 'This plan could not be found. Nothing was recorded.',
  'run-not-owned': 'This plan belongs to a different session. Nothing was recorded.',
  'execution-terminal': 'This plan already ended. Nothing more can be confirmed.',
  'execution-not-active': 'This plan is not active right now. Nothing was recorded.',
  'invalid-status-transition': 'This action does not apply right now. Nothing was recorded.',
  'pending-steps-remain': 'Confirm every step above before finishing. Nothing was recorded yet.',
  'unknown-step': 'This step is no longer part of the plan. Nothing was recorded.',
  'step-already-resolved': 'This step is already confirmed. Nothing was recorded twice.',
  'unknown-command': 'This confirmation was not understood. Nothing was recorded.',
  'invalid-command': 'This confirmation was not complete. Nothing was recorded.',
  // Multibyte free text can pass the client character bound yet exceed the
  // server octet bound: say the note was kept on screen while the server
  // rejected it, instead of echoing `text-too-large`.
  'text-too-large':
    'Your note was kept on this screen, but the server rejected it as too long. Shorten it and try again.',
  'unowned-substitution': 'Only a product you own can be substituted. Nothing was recorded.',
  'not-ready-decision': 'This plan is not ready to follow yet. Nothing was recorded.',
  'untrusted-decision': 'This plan could not be verified. Nothing was recorded.',
  'malformed-protocol': 'This plan could not be read. Nothing was recorded.',
  'empty-plan': 'This plan has no steps to confirm. Nothing was recorded.',
  'duplicate-step-identity': 'This plan could not be read. Nothing was recorded.',
  'missing-timestamp': 'This confirmation could not be sent. Nothing was recorded.',
  'invalid-operation': 'This confirmation could not be sent. Nothing was recorded.',
  'invalid-limit': 'This request could not be sent. Nothing was recorded.',
  'payload-too-large': 'This confirmation is too large to save. Shorten your note and try again.',
  'account-not-active': 'Your account is not active. Nothing was recorded.',
  'authentication-required': 'Sign in again to save confirmations. Nothing was recorded.',
};

export const TRANSITION_SAVE_FAILED_COPY =
  'Your confirmation could not be saved. Nothing was recorded yet.';

export const TRANSITION_START_FAILED_COPY =
  'The plan could not be started. Check your connection and try again.';

export interface TransitionErrorMapping {
  readonly code: string;
  readonly copy: string;
}

/** Map any persistence failure to a stable code plus user copy. Unknown failures fall back to honest generic copy. */
export function transitionErrorCopy(error: unknown): TransitionErrorMapping {
  const message = error instanceof Error ? error.message : '';
  const copy = TRANSITION_USER_COPY[message];
  if (copy !== undefined) return { code: message, copy };
  return { code: 'unmapped', copy: TRANSITION_SAVE_FAILED_COPY };
}

/** Map a start failure to user copy: stable codes share the transition table, anything else gets honest generic copy. */
export function startErrorCopy(error: unknown): TransitionErrorMapping {
  const message = error instanceof Error ? error.message : '';
  const copy = TRANSITION_USER_COPY[message];
  if (copy !== undefined) return { code: message, copy };
  return { code: 'unmapped', copy: TRANSITION_START_FAILED_COPY };
}

export interface TransitionWireRequest {
  readonly operationId: string;
  readonly executionId: string;
  readonly expectedRevision: number;
  readonly command: ExecutionCommand;
  readonly at: string;
}

export type BeginTransitionOutcome =
  | { readonly status: 'ready'; readonly request: TransitionWireRequest; readonly preview: ProtocolExecution }
  | { readonly status: 'busy' }
  | { readonly status: 'invalid'; readonly code: string; readonly copy: string };

export type DeliverTransitionOutcome =
  | { readonly status: 'succeeded'; readonly receipt: ProtocolExecutionReceipt }
  | { readonly status: 'failed'; readonly code: string; readonly copy: string }
  | { readonly status: 'busy' };

export interface ProtocolTransitionDispatcherDeps {
  readonly nowIso: () => string;
  readonly newOperationId: () => string;
  readonly preview?: typeof applyExecutionCommand;
  readonly persist?: typeof transitionProtocolExecution;
}

export interface ProtocolTransitionDispatcher {
  isPending(): boolean;
  /** Discard the in-flight guard (owner change, unmount). In-flight responses stay ignored by the caller. */
  reset(): void;
  begin(input: {
    readonly command: ExecutionCommand;
    readonly execution: ProtocolExecution;
    readonly executionId: string;
    readonly expectedRevision: number;
  }): BeginTransitionOutcome;
  deliver(request: TransitionWireRequest): Promise<DeliverTransitionOutcome>;
}

export function createProtocolTransitionDispatcher(
  deps: ProtocolTransitionDispatcherDeps,
): ProtocolTransitionDispatcher {
  const previewWith = deps.preview ?? applyExecutionCommand;
  const persistWith = deps.persist ?? transitionProtocolExecution;
  let pendingOperationId: string | null = null;

  return {
    isPending(): boolean {
      return pendingOperationId !== null;
    },
    reset(): void {
      pendingOperationId = null;
    },
    begin(input): BeginTransitionOutcome {
      if (pendingOperationId !== null) return { status: 'busy' };
      const eventAt = deps.nowIso();
      let preview: ProtocolExecution;
      try {
        preview = previewWith(input.execution, input.command, { at: eventAt });
      } catch (error) {
        const code = error instanceof ProtocolExecutionError ? error.code : 'invalid-command';
        return { status: 'invalid', code, copy: TRANSITION_USER_COPY[code] ?? TRANSITION_SAVE_FAILED_COPY };
      }
      const operationId = deps.newOperationId();
      pendingOperationId = operationId;
      return {
        status: 'ready',
        request: {
          operationId,
          executionId: input.executionId,
          expectedRevision: input.expectedRevision,
          command: input.command,
          at: eventAt,
        },
        preview,
      };
    },
    async deliver(request): Promise<DeliverTransitionOutcome> {
      if (pendingOperationId !== null && pendingOperationId !== request.operationId) {
        return { status: 'busy' };
      }
      pendingOperationId = request.operationId;
      try {
        const receipt = await persistWith({
          operationId: request.operationId,
          executionId: request.executionId,
          expectedRevision: request.expectedRevision,
          command: request.command,
          at: request.at,
        });
        if (pendingOperationId === request.operationId) pendingOperationId = null;
        return { status: 'succeeded', receipt };
      } catch (error) {
        if (pendingOperationId === request.operationId) pendingOperationId = null;
        const { code, copy } = transitionErrorCopy(error);
        return { status: 'failed', code, copy };
      }
    },
  };
}

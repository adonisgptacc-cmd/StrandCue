import {
  parseProtocolExecution,
  type ProtocolExecution,
} from '../../../../packages/domain/src/index.ts';
import type { ProtocolExecutionReceipt } from './protocol-execution-api.ts';
import {
  EXECUTION_LOAD_OFFLINE,
  EXECUTION_RESUME_UNVERIFIED,
} from './guidance-copy.ts';
import { TRANSITION_USER_COPY } from './protocol-transition-dispatch.ts';

/**
 * Resume binding for an active protocol execution (MB-001).
 *
 * The stored protocol fingerprint is the owned recommendation-run identity
 * (`requestId`) plus the ordered decision step set the execution was built
 * from. The load path validates a server receipt against the decision
 * currently on screen and never trusts a bare `execution_id`: a receipt for
 * another run, a reshaped step set, or an envelope that disagrees with its
 * own snapshot is unverified and never paints.
 *
 * Server is authoritative on revision and snapshot: a validated receipt
 * resumes at `receipt.revision` with `receipt.execution` as state, and every
 * post-resume transition flows through the existing dispatcher with its
 * operation-id idempotency.
 */

export interface ProtocolFingerprint {
  readonly recommendationRunId: string;
  readonly stepIds: readonly string[];
}

type DecisionIdentity = {
  readonly requestId: string;
  readonly steps: readonly { readonly stepId: string }[];
};

export function fingerprintOfDecision(decision: DecisionIdentity): ProtocolFingerprint {
  return {
    recommendationRunId: decision.requestId,
    stepIds: decision.steps.map(step => step.stepId),
  };
}

export type ResumeValidation =
  | { readonly status: 'resumable'; readonly execution: ProtocolExecution; readonly revision: number }
  | { readonly status: 'absent' }
  | { readonly status: 'unverified' };

function sameOrderedIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * Validate a loaded receipt against the decision on screen. `null` means the
 * server holds no active execution (normal idle/new-start). Anything that is
 * not a byte-honest, fingerprint-matching receipt is `unverified`: the caller
 * shows an honest error and never a partial render.
 */
export function validateResumedReceipt(
  receipt: unknown,
  decision: DecisionIdentity,
): ResumeValidation {
  if (receipt === null || receipt === undefined) return { status: 'absent' };
  const envelope = receipt as Partial<ProtocolExecutionReceipt>;
  let execution: ProtocolExecution;
  try {
    execution = parseProtocolExecution((receipt as { execution?: unknown }).execution);
  } catch {
    return { status: 'unverified' };
  }
  const fingerprint = fingerprintOfDecision(decision);
  const envelopeRunId = typeof envelope.recommendationRunId === 'string' ? envelope.recommendationRunId : null;
  const envelopeExecutionId = typeof envelope.executionId === 'string' ? envelope.executionId : null;
  const envelopeStatus = typeof envelope.status === 'string' ? envelope.status : null;
  const envelopeRevision = typeof envelope.revision === 'number' ? envelope.revision : null;
  if (
    envelopeRunId === null
    || envelopeExecutionId === null
    || envelopeStatus === null
    || envelopeRevision === null
    || !Number.isInteger(envelopeRevision)
    || envelopeRevision < 0
    || envelopeRunId !== fingerprint.recommendationRunId
    || envelopeRunId !== execution.recommendationRunId
    || envelopeExecutionId !== execution.executionId
    || envelopeStatus !== execution.status
    || !sameOrderedIds(
      execution.steps.map(step => step.stepId),
      fingerprint.stepIds,
    )
  ) {
    return { status: 'unverified' };
  }
  return { status: 'resumable', execution, revision: envelopeRevision };
}

export interface ResumeErrorMapping {
  readonly code: string;
  readonly copy: string;
  readonly offline: boolean;
}

function isParseError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError';
}

/**
 * Map a resume-load failure to user copy. Stable database codes reuse the
 * transition table (raw codes never reach the screen); a receipt that failed
 * strict parsing is unverified, never an offline hint; every other transport
 * failure is an explicit offline state with retry, distinct from "no run".
 */
export function resumeErrorCopy(error: unknown): ResumeErrorMapping {
  if (isParseError(error)) {
    return { code: 'unverified', copy: EXECUTION_RESUME_UNVERIFIED, offline: false };
  }
  const message = error instanceof Error ? error.message : '';
  const stable = TRANSITION_USER_COPY[message];
  if (stable !== undefined) return { code: message, copy: stable, offline: false };
  return { code: 'unmapped', copy: EXECUTION_LOAD_OFFLINE, offline: true };
}

import {
  parseProtocolExecution,
  type ProtocolDecision,
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

/**
 * Run identifiers recovered with a restored execution (Fix E). Everything
 * here is server bytes: the client never supplies any of it.
 */
export interface RestoredRunIdentifiers {
  readonly requestId: string;
  readonly inputFingerprint: string;
  readonly asOf: string;
  readonly engineVersion: string;
  readonly bundleId: string;
  readonly bundleVersion: string;
}

export type RestoredBundleValidation =
  | {
    readonly status: 'resumable';
    readonly execution: ProtocolExecution;
    readonly revision: number;
    readonly decision: ProtocolDecision;
    readonly run: RestoredRunIdentifiers;
  }
  | { readonly status: 'absent' }
  | { readonly status: 'unverified' };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Render guard for a stored decision. The resume fingerprint only needs
 * `requestId` plus the ordered step set, but the restore path paints the
 * decision (DecisionView reads confidence, omissions, alternatives,
 * missingInputs and the audit evidence) and hands it to the execution
 * controller, so a decision that is fingerprint-valid yet missing rendered
 * fields must still fail closed instead of crashing the paint.
 */
function isRenderableDecision(value: unknown): value is ProtocolDecision {
  if (!isRecord(value)) return false;
  if (value.status !== 'ready') return false;
  if (typeof value.requestId !== 'string' || value.requestId === '') return false;
  if (value.confidence !== 'high' && value.confidence !== 'moderate' && value.confidence !== 'limited') {
    return false;
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0) return false;
  for (const step of value.steps) {
    if (!isRecord(step)) return false;
    if (typeof step.stepId !== 'string' || step.stepId === '') return false;
    if (typeof step.position !== 'number' || !Number.isInteger(step.position)) return false;
    if (typeof step.action !== 'string') return false;
    if (!Array.isArray(step.reasons)) return false;
  }
  if (!Array.isArray(value.omissions) || !Array.isArray(value.alternatives)) return false;
  if (!Array.isArray(value.missingInputs)) return false;
  const audit = value.audit;
  if (!isRecord(audit)) return false;
  if (!Array.isArray(audit.evaluatedRules)) return false;
  for (const entry of audit.evaluatedRules) {
    if (!isRecord(entry) || !Array.isArray(entry.evidenceIds)) return false;
  }
  return true;
}

/**
 * Validate the Fix E restore aggregate against itself. `null` means the
 * server holds no active execution (normal idle/new-start). Anything else
 * must be a byte-honest bundle: an owned run row in `ready` + `trusted`
 * shape whose request identity, input fingerprint and stored decision all
 * agree with the execution receipt and with the execution row's own stored
 * decision, and whose decision survives the fingerprint check in
 * `validateResumedReceipt`. No parallel validator: execution ID, run ID and
 * protocol-fingerprint agreement all flow through `validateResumedReceipt`,
 * and this function only adds the run-row agreements no receipt carries.
 */
export function validateRestoredBundle(bundle: unknown): RestoredBundleValidation {
  if (bundle === null || bundle === undefined) return { status: 'absent' };
  if (!isRecord(bundle)) return { status: 'unverified' };
  const { execution: receipt, run, storedDecision } = bundle;
  // A non-null bundle claims an active execution: a missing receipt or a
  // missing run row is malformed, never "absent".
  if (receipt === null || receipt === undefined) return { status: 'unverified' };
  if (!isRecord(run)) return { status: 'unverified' };
  if (
    typeof run.requestId !== 'string' || !UUID_PATTERN.test(run.requestId)
    || typeof run.inputFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(run.inputFingerprint)
    || typeof run.asOf !== 'string' || run.asOf === ''
    || typeof run.engineVersion !== 'string' || run.engineVersion.trim() === ''
    || typeof run.bundleId !== 'string' || run.bundleId.trim() === ''
    || typeof run.bundleVersion !== 'string' || run.bundleVersion.trim() === ''
    || run.status !== 'ready'
    || !isRecord(run.input)
    || run.trusted !== true
  ) {
    return { status: 'unverified' };
  }
  const decision = run.decision;
  if (!isRenderableDecision(decision)) return { status: 'unverified' };
  // Stored-decision agreement, three ways: the run's decision names the run,
  // the execution row's own stored copy is byte-identical to it, and the
  // receipt cites the same run. The input fingerprint travels bound to that
  // run row (it is only ever minted and stored together with this exact
  // request id), so the run-ID agreement is the fingerprint agreement: no
  // recompute function exists client-side, and inventing one would be a
  // parallel validator.
  if (decision.requestId !== run.requestId) return { status: 'unverified' };
  try {
    if (JSON.stringify(storedDecision) !== JSON.stringify(decision)) return { status: 'unverified' };
  } catch {
    return { status: 'unverified' };
  }
  const validated = validateResumedReceipt(receipt, decision);
  if (validated.status !== 'resumable') return { status: 'unverified' };
  return {
    status: 'resumable',
    execution: validated.execution,
    revision: validated.revision,
    decision,
    run: {
      requestId: run.requestId,
      inputFingerprint: run.inputFingerprint,
      asOf: run.asOf,
      engineVersion: run.engineVersion,
      bundleId: run.bundleId,
      bundleVersion: run.bundleVersion,
    },
  };
}function isParseError(error: unknown): boolean {
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

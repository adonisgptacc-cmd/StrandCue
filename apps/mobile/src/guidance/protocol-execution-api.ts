import { z } from 'zod';

import { supabase } from '../client';

/**
 * Owner-scoped persistence boundary for protocol executions.
 *
 * The caller never supplies an owner id: the database takes the owner from
 * `auth.uid()` and verifies run ownership before touching execution rows.
 * The caller never supplies the decision either: the database locks the
 * owned recommendation run and derives the initial snapshot solely from its
 * stored trusted decision. This module only validates and forwards, so a bug
 * here can never write another owner's row or start untrusted steps.
 *
 * Deviation free text (`reason`/`detail`) flows only into execution history
 * via the transition RPC. This module builds no facts, snapshots, or
 * recommendation input from it — there is deliberately no facts path here.
 */

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const isoTimestamp = z.iso.datetime({ offset: true });
/** Server-side deviation cap is 2 KiB (octets); this client-side character
 * bound fails fast on clearly oversized text. The server remains
 * authoritative for multibyte input. */
const deviationText = z.string().trim().min(1).max(2048);

const ShelfItemReferenceSchema = z
  .object({
    shelfItemId: uuid,
  })
  .strict();

const ExecutionCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('complete-step'), stepId: nonEmptyString }).strict(),
  z.object({ kind: z.literal('skip-step'), stepId: nonEmptyString, reason: deviationText }).strict(),
  z
    .object({
      kind: z.literal('substitute-step'),
      stepId: nonEmptyString,
      reason: deviationText,
      replacement: ShelfItemReferenceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('modify-step'),
      stepId: nonEmptyString,
      reason: deviationText,
      detail: deviationText,
    })
    .strict(),
  z.object({ kind: z.literal('pause') }).strict(),
  z.object({ kind: z.literal('resume') }).strict(),
  z.object({ kind: z.literal('abandon'), reason: deviationText }).strict(),
  z.object({ kind: z.literal('complete') }).strict(),
]);

const ExecutionStatusSchema = z.enum(['in_progress', 'paused', 'completed', 'abandoned']);

const StartProtocolExecutionCommandSchema = z
  .object({
    operationId: uuid,
    executionId: uuid,
    recommendationRunId: uuid,
    startedAt: isoTimestamp,
  })
  .strict();

/**
 * The transition command carries only bounded command fields. There is no
 * `result` snapshot: the server constructs the authoritative execution from
 * the stored row, the command, and the server clock (SC-003). A `result`
 * key is rejected client-side by this strict schema and no longer exists on
 * the RPC signature, so a forged snapshot cannot be forwarded.
 */
const TransitionProtocolExecutionCommandSchema = z
  .object({
    operationId: uuid,
    executionId: uuid,
    expectedRevision: z.number().int().nonnegative(),
    command: ExecutionCommandSchema,
    at: isoTimestamp,
  })
  .strict();

const ProtocolExecutionReceiptSchema = z
  .object({
    executionId: uuid,
    recommendationRunId: uuid,
    status: ExecutionStatusSchema,
    revision: z.number().int().nonnegative(),
    updatedAt: z.string(),
    createdAt: z.string(),
    execution: z.record(z.string(), z.unknown()),
  })
  .strict();

const HistoryCursorSchema = z
  .object({ createdAt: z.string(), id: uuid })
  .strict();

/**
 * Fix E restore aggregate: the owner's active execution receipt together
 * with the exact stored recommendation-run row it was built from. There is
 * no decision parameter: the stored decision travels inside `run` (plus the
 * execution row's own copy as `storedDecision`), so the client validates the
 * server's bytes instead of supplying its own.
 */
const RestoredRunSchema = z
  .object({
    requestId: uuid,
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    asOf: isoTimestamp,
    engineVersion: z.string().trim().min(1).max(40),
    bundleId: z.string().trim().min(1).max(120),
    bundleVersion: z.string().trim().min(1).max(40),
    status: z.enum([
      'needs_setup',
      'content_pending',
      'ready',
      'needs_input',
      'rule_conflict',
      'unsupported',
      'source_error',
    ]),
    input: z.record(z.string(), z.unknown()),
    decision: z.record(z.string(), z.unknown()),
    trusted: z.boolean(),
    createdAt: z.string(),
  })
  .strict();

const ActiveExecutionWithDecisionSchema = z
  .object({
    execution: ProtocolExecutionReceiptSchema,
    run: RestoredRunSchema.nullable(),
    storedDecision: z.unknown(),
  })
  .strict();

const ProtocolExecutionHistorySchema = z
  .object({
    items: z.array(ProtocolExecutionReceiptSchema),
    nextCursor: HistoryCursorSchema.nullable(),
  })
  .strict();

export type StartProtocolExecutionCommand = z.output<typeof StartProtocolExecutionCommandSchema>;
export type TransitionProtocolExecutionCommand = z.output<
  typeof TransitionProtocolExecutionCommandSchema
>;
export type ExecutionCommand = z.output<typeof ExecutionCommandSchema>;
export type ProtocolExecutionReceipt = z.output<typeof ProtocolExecutionReceiptSchema>;
export type ProtocolExecutionHistory = z.output<typeof ProtocolExecutionHistorySchema>;
export type RestoredRecommendationRun = z.output<typeof RestoredRunSchema>;
export type ActiveExecutionWithDecision = z.output<typeof ActiveExecutionWithDecisionSchema>;

/**
 * Stable messages for the database errors this boundary can raise. Any other
 * message is surfaced verbatim so a failure is never mistaken for a save.
 */
const STABLE_ERRORS: Readonly<Record<string, string>> = {
  'operation-conflict': 'operation-conflict',
  'revision-conflict': 'revision-conflict',
  'execution-conflict': 'execution-conflict',
  'execution-not-found': 'execution-not-found',
  'run-not-owned': 'run-not-owned',
  'execution-terminal': 'execution-terminal',
  'execution-not-active': 'execution-not-active',
  'invalid-status-transition': 'invalid-status-transition',
  'pending-steps-remain': 'pending-steps-remain',
  'unknown-step': 'unknown-step',
  'step-already-resolved': 'step-already-resolved',
  'unknown-command': 'unknown-command',
  'invalid-command': 'invalid-command',
  'timestamp-out-of-range': 'timestamp-out-of-range',
  'too-many-active-executions': 'too-many-active-executions',
  'too-many-events': 'too-many-events',
  'too-many-steps': 'too-many-steps',
  'text-too-large': 'text-too-large',
  'unowned-substitution': 'unowned-substitution',
  'unknown-shelf-item': 'unknown-shelf-item',
  'archived-shelf-item': 'archived-shelf-item',
  'unknown-product-version': 'unknown-product-version',
  'not-ready-decision': 'not-ready-decision',
  'untrusted-decision': 'untrusted-decision',
  'malformed-protocol': 'malformed-protocol',
  'empty-plan': 'empty-plan',
  'invalid-operation': 'invalid-operation',
  'invalid-limit': 'invalid-limit',
  'payload-too-large': 'payload-too-large',
  'account-not-active': 'account-not-active',
  'authentication-required': 'authentication-required',
};

function stableError(message: string): Error {
  const stable = STABLE_ERRORS[message];
  return new Error(stable === undefined ? message : stable);
}

export async function startProtocolExecution(
  command: unknown,
): Promise<ProtocolExecutionReceipt> {
  const parsed = StartProtocolExecutionCommandSchema.parse(command);
  if (!supabase) throw new Error('Protocol executions are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('start_protocol_execution', {
    p_operation_id: parsed.operationId,
    p_execution_id: parsed.executionId,
    p_recommendation_run_id: parsed.recommendationRunId,
    p_started_at: parsed.startedAt,
  });
  if (error) throw stableError(error.message);
  return ProtocolExecutionReceiptSchema.parse(data);
}

export async function transitionProtocolExecution(
  command: unknown,
): Promise<ProtocolExecutionReceipt> {
  const parsed = TransitionProtocolExecutionCommandSchema.parse(command);
  if (!supabase) throw new Error('Protocol executions are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('apply_protocol_execution_command', {
    p_operation_id: parsed.operationId,
    p_execution_id: parsed.executionId,
    p_expected_revision: parsed.expectedRevision,
    p_command: parsed.command,
    p_at: parsed.at,
  });
  if (error) throw stableError(error.message);
  return ProtocolExecutionReceiptSchema.parse(data);
}

export async function getActiveProtocolExecution(): Promise<ProtocolExecutionReceipt | null> {
  if (!supabase) throw new Error('Protocol executions are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('get_active_protocol_execution', {});
  if (error) throw stableError(error.message);
  if (data === null) return null;
  return ProtocolExecutionReceiptSchema.parse(data);
}

/**
 * Fix E restore read: the active execution plus the stored recommendation
 * decision it cites, in one owner-scoped aggregate. Takes no arguments (the
 * database derives the owner from `auth.uid()`), so a retry resends nothing
 * and there is no client-supplied decision to forge. A `null` run inside a
 * non-null bundle means the cited run row is gone: the caller must fail
 * closed, never paint.
 */
export async function getActiveExecutionWithDecision(): Promise<ActiveExecutionWithDecision | null> {
  if (!supabase) throw new Error('Protocol executions are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('get_active_execution_with_decision', {});
  if (error) throw stableError(error.message);
  if (data === null) return null;
  return ActiveExecutionWithDecisionSchema.parse(data);
}

export async function listProtocolExecutions(
  options: unknown,
): Promise<ProtocolExecutionHistory> {
  const parsed = z
    .object({
      limit: z.number().int().min(1).max(100),
      cursor: HistoryCursorSchema.nullable(),
    })
    .strict()
    .parse(options);
  if (!supabase) throw new Error('Protocol executions are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('list_protocol_executions', {
    p_limit: parsed.limit,
    p_cursor: parsed.cursor,
  });
  if (error) throw stableError(error.message);
  return ProtocolExecutionHistorySchema.parse(data);
}

import { z } from 'zod';

import { supabase } from '../client';

/**
 * Owner-scoped persistence boundary for protocol executions.
 *
 * The caller never supplies an owner id: the database takes the owner from
 * `auth.uid()` and verifies run ownership before touching execution rows.
 * This module only validates and forwards, so a bug here can never write
 * another owner's row.
 *
 * Deviation free text (`reason`/`detail`) flows only into execution history
 * via the transition RPC. This module builds no facts, snapshots, or
 * recommendation input from it — there is deliberately no facts path here.
 */

const nonEmptyString = z.string().trim().min(1);
const uuid = z.string().uuid();
const isoTimestamp = z.iso.datetime({ offset: true });

const OwnedProductReferenceSchema = z
  .object({
    productId: nonEmptyString,
    productVersionId: nonEmptyString,
    owned: z.literal(true),
  })
  .strict();

const ExecutionCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('complete-step'), stepId: nonEmptyString }).strict(),
  z.object({ kind: z.literal('skip-step'), stepId: nonEmptyString, reason: nonEmptyString }).strict(),
  z
    .object({
      kind: z.literal('substitute-step'),
      stepId: nonEmptyString,
      reason: nonEmptyString,
      replacement: OwnedProductReferenceSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('modify-step'),
      stepId: nonEmptyString,
      reason: nonEmptyString,
      detail: nonEmptyString,
    })
    .strict(),
  z.object({ kind: z.literal('pause') }).strict(),
  z.object({ kind: z.literal('resume') }).strict(),
  z.object({ kind: z.literal('abandon'), reason: nonEmptyString }).strict(),
  z.object({ kind: z.literal('complete') }).strict(),
]);

const ExecutionStatusSchema = z.enum(['in_progress', 'paused', 'completed', 'abandoned']);

const StartProtocolExecutionCommandSchema = z
  .object({
    operationId: uuid,
    executionId: uuid,
    recommendationRunId: uuid,
    decision: z.record(z.string(), z.unknown()),
    startedAt: isoTimestamp,
  })
  .strict();

const TransitionProtocolExecutionCommandSchema = z
  .object({
    operationId: uuid,
    executionId: uuid,
    expectedRevision: z.number().int().nonnegative(),
    command: ExecutionCommandSchema,
    at: isoTimestamp,
    result: z.record(z.string(), z.unknown()),
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
  'result-mismatch': 'result-mismatch',
  'not-ready-decision': 'not-ready-decision',
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
    p_decision: parsed.decision,
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
    p_result: parsed.result,
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

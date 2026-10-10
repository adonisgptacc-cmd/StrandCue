import { z } from 'zod';

import { supabase } from './client';

const DeletionRequestSchema = z.object({
  operationId: z.string().uuid(),
  reason: z.string().trim().max(500).nullable(),
}).strict();

const DeletionReceiptSchema = z.object({
  accountStatus: z.enum(['deleting', 'active']),
  message: z.string(),
}).strict();

const DeletionStatusSchema = z.object({
  accountStatus: z.enum(['active', 'deleting', 'deleted']),
  tombstoneExists: z.boolean(),
  deletedAt: z.string().nullable(),
  purgeCompletedAt: z.string().nullable(),
  deletionReason: z.string().nullable(),
}).strict();

export type DeletionReceipt = z.output<typeof DeletionReceiptSchema>;
export type DeletionStatus = z.output<typeof DeletionStatusSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Deletion is unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function requestDeletion(operationId: string, reason: string | null): Promise<DeletionReceipt> {
  const request = DeletionRequestSchema.parse({ operationId, reason });
  const data = await callRpc('deletion_request', {
    p_operation_id: request.operationId,
    p_reason: request.reason,
  });
  return DeletionReceiptSchema.parse(data);
}

export async function cancelDeletion(): Promise<DeletionReceipt> {
  const data = await callRpc('deletion_cancel', {});
  return DeletionReceiptSchema.parse(data);
}

export async function statusDeletion(): Promise<DeletionStatus> {
  const data = await callRpc('deletion_status', {});
  return DeletionStatusSchema.parse(data);
}

export function deletionStatusMessage(status: DeletionStatus): string {
  if (status.accountStatus === 'deleted') return 'This account has been permanently deleted.';
  if (status.accountStatus === 'deleting') return 'Deletion is in progress. Access is blocked. You can cancel while purging has not run.';
  return 'Account active.';
}

export function recentAuthMessage(message: string): string {
  return message.includes('recent-auth-required')
    ? 'For your security, sign out and sign in again, then retry deletion.'
    : message;
}

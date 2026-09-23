import { z } from 'zod';

import { supabase } from './client';

const JobIdSchema = z.string().uuid();
const utcTimestamp = z.iso.datetime({ offset: true, precision: 6 })
  .refine(value => value.endsWith('Z'), 'Expected a UTC timestamp');

const ExportReceiptSchema = z.object({
  jobId: JobIdSchema,
  status: z.enum(['completed', 'failed']),
  recordCount: z.number().int().nonnegative(),
  expiresAt: utcTimestamp,
}).strict();

const ExportStatusSchema = z.object({
  jobId: JobIdSchema,
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  format: z.enum(['json', 'csv']),
  recordCount: z.number().int().nonnegative(),
  createdAt: utcTimestamp,
  completedAt: utcTimestamp.nullable(),
  expiresAt: utcTimestamp,
  errorMessage: z.string().nullable(),
}).strict();

const ExportDownloadSchema = z.object({
  jobId: JobIdSchema,
  format: z.enum(['json', 'csv']),
  expiresAt: utcTimestamp,
  document: z.unknown(),
}).strict();

export type ExportReceipt = z.output<typeof ExportReceiptSchema>;
export type ExportStatus = z.output<typeof ExportStatusSchema>;
export type ExportDownload = z.output<typeof ExportDownloadSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Export is unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

const ExportFormatSchema = z.enum(['json']);

export async function requestExport(operationId: string, format: 'json'): Promise<ExportReceipt> {
  const request = z.object({ operationId: z.string().uuid(), format: ExportFormatSchema }).strict().parse({ operationId, format });
  const data = await callRpc('export_request', {
    p_operation_id: request.operationId,
    p_format: request.format,
  });
  return ExportReceiptSchema.parse(data);
}

export async function statusExport(jobId: string): Promise<ExportStatus> {
  const data = await callRpc('export_status', { p_job_id: JobIdSchema.parse(jobId) });
  return ExportStatusSchema.parse(data);
}

export async function downloadExport(jobId: string): Promise<ExportDownload> {
  const data = await callRpc('export_download', { p_job_id: JobIdSchema.parse(jobId) });
  return ExportDownloadSchema.parse(data);
}

export function exportStatusMessage(status: ExportStatus): string {
  if (status.status === 'failed') return `Export failed${status.errorMessage ? `: ${status.errorMessage}` : '.'} Contact support for help.`;
  if (status.status !== 'completed') return 'Export is being prepared. Check back shortly.';
  return `Export ready with ${status.recordCount} records. Download access expires ${status.expiresAt.slice(0, 10)}.`;
}

export function recentAuthMessage(message: string): string {
  return message.includes('recent-auth-required')
    ? 'For your security, sign out and sign in again, then request the export.'
    : message;
}

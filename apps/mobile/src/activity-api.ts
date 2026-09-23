import { z } from 'zod';

import {
  CorrectActivityCommandSchema,
  CreateActivityCommandSchema,
  VoidActivityCommandSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

const ActivityIdSchema = z.string().uuid();

const ActivityRevisionRecordSchema = z.object({
  id: ActivityIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'void']),
  precision: z.string(),
  correctsId: ActivityIdSchema.nullable(),
  voidReason: z.string().nullable(),
  patch: z.record(z.string(), z.unknown()).optional(),
}).strict();

const ActivityReceiptSchema = z.object({
  activityId: ActivityIdSchema,
  revision: z.number().int().positive(),
  revisions: z.array(ActivityRevisionRecordSchema).optional(),
}).strict();

const ActivityDetailSchema = z.object({
  id: ActivityIdSchema,
  revision: z.number().int().nonnegative(),
  voided: z.boolean(),
  revisions: z.array(ActivityRevisionRecordSchema),
}).strict();

const ActivityListSchema = z.object({
  items: z.array(z.object({ id: ActivityIdSchema, revision: z.number().int().nonnegative() }).strict()).max(100),
}).strict();

export type ActivityReceipt = z.output<typeof ActivityReceiptSchema>;
export type ActivityDetail = z.output<typeof ActivityDetailSchema>;
export type ActivityList = z.output<typeof ActivityListSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Activities are unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export async function recordActivity(command: unknown): Promise<ActivityReceipt> {
  const parsed = CreateActivityCommandSchema.parse(command);
  const data = await callRpc('record_activity', {
    p_operation_id: parsed.operationId,
    p_activity_id: parsed.activityId,
    p_kind: parsed.kind,
    p_occurred_at: parsed.occurredAt,
    p_precision: parsed.precision,
    p_zones: parsed.zones,
    p_notes: parsed.notes,
  });
  return ActivityReceiptSchema.parse(data);
}

export async function correctActivity(command: unknown): Promise<ActivityReceipt> {
  const parsed = CorrectActivityCommandSchema.parse(command);
  const data = await callRpc('correct_activity', {
    p_operation_id: parsed.operationId,
    p_activity_id: parsed.activityId,
    p_expected_revision: parsed.expectedRevision,
    p_corrects_id: parsed.correctsId,
    p_reason: parsed.reason,
    p_notes: parsed.notes,
  });
  return ActivityReceiptSchema.parse(data);
}

export async function voidActivity(command: unknown): Promise<ActivityReceipt> {
  const parsed = VoidActivityCommandSchema.parse(command);
  const data = await callRpc('void_activity', {
    p_operation_id: parsed.operationId,
    p_activity_id: parsed.activityId,
    p_expected_revision: parsed.expectedRevision,
    p_reason: parsed.reason,
  });
  return ActivityReceiptSchema.parse(data);
}

export async function getActivity(activityId: string, includeAudit = false): Promise<ActivityDetail | null> {
  const parsedId = ActivityIdSchema.parse(activityId);
  const data = await callRpc('get_activity', {
    p_activity_id: parsedId,
    p_include_audit: includeAudit,
  });
  return ActivityDetailSchema.nullable().parse(data);
}

export async function listActivities(asOf: string, limit = 25): Promise<ActivityList> {
  const request = z.object({ asOf: z.iso.date(), limit: z.number().int().min(1).max(100) }).strict().parse({ asOf, limit });
  const data = await callRpc('list_activities', {
    p_as_of: request.asOf,
    p_limit: request.limit,
    p_cursor: null,
  });
  return ActivityListSchema.parse(data);
}

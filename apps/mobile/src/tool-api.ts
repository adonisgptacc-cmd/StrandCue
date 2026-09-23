import { z } from 'zod';

import {
  ArchiveUserToolCommandSchema,
  ChangeUserToolCommandSchema,
  CreateUserToolCommandSchema,
  MatchUserToolCommandSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

const UserToolIdSchema = z.string().uuid();

const ToolRevisionRecordSchema = z.object({
  id: UserToolIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
  correctsId: UserToolIdSchema.nullable(),
  matchVersionId: UserToolIdSchema.nullable(),
}).strict();

const ToolReceiptSchema = z.object({
  userToolId: UserToolIdSchema,
  revision: z.number().int().positive(),
  revisions: z.array(ToolRevisionRecordSchema).optional(),
}).strict();

const ToolItemSchema = z.object({
  id: UserToolIdSchema,
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  manualModel: z.string().nullable(),
}).strict();

const ToolCursorSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true, precision: 6 }).refine(value => value.endsWith('Z'), 'Expected a UTC timestamp'),
  id: UserToolIdSchema,
}).strict();

const ToolListSchema = z.object({
  items: z.array(ToolItemSchema).max(100),
  nextCursor: ToolCursorSchema.nullable(),
}).strict();

const ToolDetailSchema = z.object({
  id: UserToolIdSchema,
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  manualModel: z.string().nullable(),
  versionId: UserToolIdSchema.nullable(),
  revisions: z.array(ToolRevisionRecordSchema),
}).strict();

export type ToolCursor = z.output<typeof ToolCursorSchema>;
export type ToolReceipt = z.output<typeof ToolReceiptSchema>;
export type ToolItem = z.output<typeof ToolItemSchema>;
export type ToolList = z.output<typeof ToolListSchema>;
export type ToolDetail = z.output<typeof ToolDetailSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Tools are unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

const todayEffectiveDate = () => ({
  precision: 'day',
  value: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
});

export async function recordUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = CreateUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_add', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_version_id: parsed.versionId,
    p_manual_brand: parsed.manualBrand,
    p_manual_model: parsed.manualModel,
    p_tool_type: parsed.toolType,
    p_availability: parsed.availability,
    p_notes: parsed.notes,
    p_effective_date: todayEffectiveDate(),
  });
  return ToolReceiptSchema.parse(data);
}

export async function changeUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = ChangeUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_change', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_expected_revision: parsed.expectedRevision,
    p_version_id: null,
    p_manual_brand: null,
    p_manual_model: null,
    p_tool_type: null,
    p_availability: parsed.availability ?? null,
    p_notes: parsed.notes,
    p_effective_date: todayEffectiveDate(),
  });
  return ToolReceiptSchema.parse(data);
}

export async function matchUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = MatchUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_match', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_expected_revision: parsed.expectedRevision,
    p_version_id: parsed.versionId,
    p_confirmed: parsed.confirmed,
  });
  return ToolReceiptSchema.parse(data);
}

export async function archiveUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = ArchiveUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_archive', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_expected_revision: parsed.expectedRevision,
  });
  return ToolReceiptSchema.parse(data);
}

export async function getUserTool(userToolId: string, includeAudit = false): Promise<ToolDetail | null> {
  const parsedId = UserToolIdSchema.parse(userToolId);
  const data = await callRpc('tool_history', {
    p_user_tool_id: parsedId,
    p_include_audit: includeAudit,
  });
  return ToolDetailSchema.nullable().parse(data);
}

export async function listUserTools(options: { limit?: number; cursor?: ToolCursor | null } = {}): Promise<ToolList> {
  const request = z.object({
    limit: z.number().int().min(1).max(100),
    cursor: ToolCursorSchema.nullable(),
  }).strict().parse({ limit: options.limit ?? 25, cursor: options.cursor ?? null });
  const data = await callRpc('tool_list', { p_limit: request.limit, p_cursor: request.cursor });
  return ToolListSchema.parse(data);
}

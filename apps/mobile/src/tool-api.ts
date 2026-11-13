import { z } from 'zod';

import {
  ArchiveUserToolCommandSchema,
  ChangeUserToolCommandSchema,
  CorrectUserToolCommandSchema,
  CreateUserToolCommandSchema,
  MatchUserToolCommandSchema,
  ToolAttachmentsSchema,
  ToolConditionSchema,
  ToolHeatMethodsSchema,
  ToolSettingsSchema,
  ToolTypeSchema,
  YesNoUnknownSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';
import { todayEffectiveDate } from './shelf-api';

const UserToolIdSchema = z.string().uuid();

/** The availability states a stored row can hold: the three the owner can record. */
const StoredAvailabilitySchema = z.enum(['available', 'out_of_stock', 'archived']);

/**
 * One entry of the tool's own history. The audit read carries the facts the revision recorded in `patch`
 * and the reason a correction gave; the write receipt carries neither, so both are optional here.
 */
const ToolRevisionRecordSchema = z.object({
  id: UserToolIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
  correctsId: UserToolIdSchema.nullable(),
  matchVersionId: UserToolIdSchema.nullable(),
  patch: z.record(z.string(), z.unknown()).optional(),
  correctionReason: z.string().nullable().optional(),
}).strict();

const ToolReceiptSchema = z.object({
  userToolId: UserToolIdSchema,
  revision: z.number().int().positive(),
  revisions: z.array(ToolRevisionRecordSchema).optional(),
}).strict();

const ToolItemSchema = z.object({
  id: UserToolIdSchema,
  revision: z.number().int().nonnegative(),
  availability: StoredAvailabilitySchema,
  manualBrand: z.string().nullable(),
  manualModel: z.string().nullable(),
  toolType: ToolTypeSchema.nullable(),
  matched: z.boolean(),
  // The lifecycle of the matched catalogue version and nothing else about it; null when not matched.
  catalogueLifecycle: z.enum(['active', 'retired']).nullable(),
  condition: ToolConditionSchema.nullable(),
  heatMethods: ToolHeatMethodsSchema.nullable(),
}).strict();

const ToolCursorSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true, precision: 6 }).refine(value => value.endsWith('Z'), 'Expected a UTC timestamp'),
  id: UserToolIdSchema,
}).strict();

const ToolListSchema = z.object({
  items: z.array(ToolItemSchema).max(100),
  nextCursor: ToolCursorSchema.nullable(),
}).strict();

// The detail is parsed against the same schemas the commands use: a stored answer the domain would refuse
// (an impossible temperature, a contradictory heat list) fails closed instead of being shown.
const ToolDetailSchema = z.object({
  id: UserToolIdSchema,
  revision: z.number().int().nonnegative(),
  availability: StoredAvailabilitySchema,
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  manualBrand: z.string().nullable(),
  manualModel: z.string().nullable(),
  toolType: ToolTypeSchema.nullable(),
  wattageWatts: z.number().int().min(1).max(10000).nullable(),
  adjustableTemp: YesNoUnknownSchema.nullable(),
  settings: ToolSettingsSchema.nullable(),
  attachments: ToolAttachmentsSchema.nullable(),
  condition: ToolConditionSchema.nullable(),
  heatMethods: ToolHeatMethodsSchema.nullable(),
  notes: z.string().nullable(),
  versionId: UserToolIdSchema.nullable(),
  revisions: z.array(ToolRevisionRecordSchema),
}).strict();

export type ToolCursor = z.output<typeof ToolCursorSchema>;
export type ToolReceipt = z.output<typeof ToolReceiptSchema>;
export type ToolItem = z.output<typeof ToolItemSchema>;
export type ToolList = z.output<typeof ToolListSchema>;
export type ToolDetail = z.output<typeof ToolDetailSchema>;
export type ToolRevisionRecord = z.output<typeof ToolRevisionRecordSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Tools are unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export { todayEffectiveDate };

/**
 * The owner-recorded facts travel in one patch, so three states stay distinct: an absent key means the
 * owner never answered, an explicit null means the owner took the answer back, and a value means what
 * they recorded - which may itself be an explicit "unknown".
 */
export type ToolFactsPatch = Record<string, unknown>;

const FACT_KEYS = ['wattageWatts', 'adjustableTemp', 'settings', 'attachments', 'condition', 'heatMethods', 'notes'] as const;
const IDENTITY_KEYS = ['manualBrand', 'manualModel', 'toolType'] as const;

function pick(command: Record<string, unknown>, keys: readonly string[]): ToolFactsPatch {
  const facts: ToolFactsPatch = {};
  for (const key of keys) if (command[key] !== undefined) facts[key] = command[key];
  return facts;
}

export const toolFactsPatch = (command: Record<string, unknown>): ToolFactsPatch => pick(command, FACT_KEYS);

/** The identity a command carries plus its facts, in the one patch the server reads. */
export const toolIdentityAndFactsPatch = (command: Record<string, unknown>): ToolFactsPatch => pick(command, [...IDENTITY_KEYS, ...FACT_KEYS]);

export async function recordUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = CreateUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_add', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_availability: parsed.availability,
    // The date the command carries, not the day of the call: a retry of a retained command is the same command.
    p_effective_date: parsed.effectiveDate,
    p_facts: toolIdentityAndFactsPatch(parsed),
  });
  return ToolReceiptSchema.parse(data);
}

export async function changeUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = ChangeUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_change', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_expected_revision: parsed.expectedRevision,
    p_availability: parsed.availability ?? null,
    p_effective_date: parsed.effectiveDate,
    p_facts: toolFactsPatch(parsed),
  });
  return ToolReceiptSchema.parse(data);
}

/**
 * The append-only correction: the only way a wrong owner-entered identity is replaced. The server appends a
 * correction that points at the entry it replaces, so the earlier wording stays readable.
 */
export async function correctUserTool(command: unknown): Promise<ToolReceipt> {
  const parsed = CorrectUserToolCommandSchema.parse(command);
  const data = await callRpc('tool_correct', {
    p_operation_id: parsed.operationId,
    p_user_tool_id: parsed.userToolId,
    p_expected_revision: parsed.expectedRevision,
    p_corrects_id: parsed.correctsId,
    p_reason: parsed.reason,
    p_effective_date: parsed.effectiveDate,
    p_facts: toolIdentityAndFactsPatch(parsed),
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
  const data = await callRpc('tool_history', { p_user_tool_id: parsedId, p_include_audit: includeAudit });
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

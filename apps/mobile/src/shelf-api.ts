import { z } from 'zod';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CreateUserProductCommandSchema,
  MatchUserProductCommandSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

const UserProductIdSchema = z.string().uuid();

const ShelfRevisionRecordSchema = z.object({
  id: UserProductIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
  correctsId: UserProductIdSchema.nullable(),
  matchVersionId: UserProductIdSchema.nullable(),
}).strict();

const ShelfReceiptSchema = z.object({
  userProductId: UserProductIdSchema,
  revision: z.number().int().positive(),
  revisions: z.array(ShelfRevisionRecordSchema).optional(),
}).strict();

const ShelfItemSchema = z.object({
  id: UserProductIdSchema,
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  manualName: z.string().nullable(),
}).strict();

const ShelfCursorSchema = z.object({
  updatedAt: z.iso.datetime({ offset: true, precision: 6 }).refine(value => value.endsWith('Z'), 'Expected a UTC timestamp'),
  id: UserProductIdSchema,
}).strict();

const ShelfListSchema = z.object({
  items: z.array(ShelfItemSchema).max(100),
  nextCursor: ShelfCursorSchema.nullable(),
}).strict();

const ShelfDetailSchema = z.object({
  id: UserProductIdSchema,
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  manualName: z.string().nullable(),
  versionId: UserProductIdSchema.nullable(),
  revisions: z.array(ShelfRevisionRecordSchema),
}).strict();

export type ShelfCursor = z.output<typeof ShelfCursorSchema>;
export type ShelfReceipt = z.output<typeof ShelfReceiptSchema>;
export type ShelfItem = z.output<typeof ShelfItemSchema>;
export type ShelfList = z.output<typeof ShelfListSchema>;
export type ShelfDetail = z.output<typeof ShelfDetailSchema>;

async function callRpc(name: string, parameters: Record<string, unknown>): Promise<unknown> {
  if (!supabase) throw new Error('Shelf is unavailable until the client is configured');
  const { data, error } = await supabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

const todayEffectiveDate = () => ({
  precision: 'day',
  value: new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
});

export async function recordUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = CreateUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_add', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_version_id: parsed.versionId,
    p_manual_brand: parsed.manualBrand,
    p_manual_name: parsed.manualName,
    p_manual_category: parsed.manualCategory,
    p_availability: parsed.availability,
    p_notes: parsed.notes,
    p_effective_date: todayEffectiveDate(),
  });
  return ShelfReceiptSchema.parse(data);
}

export async function changeUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = ChangeUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_change', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_expected_revision: parsed.expectedRevision,
    p_version_id: null,
    p_manual_brand: null,
    p_manual_name: null,
    p_manual_category: null,
    p_availability: parsed.availability ?? null,
    p_notes: parsed.notes,
    p_effective_date: todayEffectiveDate(),
  });
  return ShelfReceiptSchema.parse(data);
}

export async function matchUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = MatchUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_match', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_expected_revision: parsed.expectedRevision,
    p_version_id: parsed.versionId,
    p_confirmed: parsed.confirmed,
  });
  return ShelfReceiptSchema.parse(data);
}

export async function archiveUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = ArchiveUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_archive', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_expected_revision: parsed.expectedRevision,
  });
  return ShelfReceiptSchema.parse(data);
}

export async function getUserProduct(userProductId: string, includeAudit = false): Promise<ShelfDetail | null> {
  const parsedId = UserProductIdSchema.parse(userProductId);
  const data = await callRpc('shelf_history', {
    p_user_product_id: parsedId,
    p_include_audit: includeAudit,
  });
  return ShelfDetailSchema.nullable().parse(data);
}

export async function listUserProducts(options: { limit?: number; cursor?: ShelfCursor | null } = {}): Promise<ShelfList> {
  const request = z.object({
    limit: z.number().int().min(1).max(100),
    cursor: ShelfCursorSchema.nullable(),
  }).strict().parse({ limit: options.limit ?? 25, cursor: options.cursor ?? null });
  const data = await callRpc('shelf_list', { p_limit: request.limit, p_cursor: request.cursor });
  return ShelfListSchema.parse(data);
}

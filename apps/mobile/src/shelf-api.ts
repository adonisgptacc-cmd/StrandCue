import { z } from 'zod';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CorrectUserProductCommandSchema,
  CreateUserProductCommandSchema,
  MatchUserProductCommandSchema,
  StoredEffectiveDateSchema,
} from '../../../packages/domain/src/index';
import { supabase } from './client';

const UserProductIdSchema = z.string().uuid();

/**
 * The availability states a stored row can hold: the four the owner can
 * record, plus the legacy `out_of_stock` value older rows still carry. The
 * owner-facing write contract is narrower - see ShelfAvailabilitySchema in
 * packages/domain/src/shelf.ts.
 */
const StoredAvailabilitySchema = z.enum(['available', 'low', 'empty', 'archived', 'out_of_stock']);

/**
 * One entry of the product's own history.
 *
 * The audit read carries the facts the revision recorded in `patch`; the
 * write receipt does not, so the field is optional here. The patch is a
 * free-form object on the server, so only its presence is checked - the
 * client never invents a fact it did not read.
 */
const ShelfRevisionRecordSchema = z.object({
  id: UserProductIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
  correctsId: UserProductIdSchema.nullable(),
  matchVersionId: UserProductIdSchema.nullable(),
  patch: z.record(z.string(), z.unknown()).optional(),
}).strict();

const ShelfReceiptSchema = z.object({
  userProductId: UserProductIdSchema,
  revision: z.number().int().positive(),
  revisions: z.array(ShelfRevisionRecordSchema).optional(),
}).strict();

const ShelfFactsShape = {
  manualBrand: z.string().nullable(),
  manualName: z.string().nullable(),
  manualCategory: z.string().nullable(),
  manualVariant: z.string().nullable(),
  manualSize: z.string().nullable(),
  manualBarcode: z.string().nullable(),
  // The stored opened date, read as the record holds it.
  openedOn: StoredEffectiveDateSchema.nullable(),
  // A calendar day, or null when no expiry was recorded.
  expiryOn: z.string().nullable(),
  pao: z.string().nullable(),
  quantityBand: z.string().nullable(),
  repurchaseIntent: z.string().nullable(),
};

const ShelfItemSchema = z.object({
  id: UserProductIdSchema,
  revision: z.number().int().nonnegative(),
  availability: StoredAvailabilitySchema,
  ...ShelfFactsShape,
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
  availability: StoredAvailabilitySchema,
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  ...ShelfFactsShape,
  notes: z.string().nullable(),
  versionId: UserProductIdSchema.nullable(),
  revisions: z.array(ShelfRevisionRecordSchema),
}).strict();

export type ShelfCursor = z.output<typeof ShelfCursorSchema>;
export type ShelfReceipt = z.output<typeof ShelfReceiptSchema>;
export type ShelfItem = z.output<typeof ShelfItemSchema>;
export type ShelfList = z.output<typeof ShelfListSchema>;
export type ShelfDetail = z.output<typeof ShelfDetailSchema>;
export type ShelfRevisionRecord = z.output<typeof ShelfRevisionRecordSchema>;

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

/**
 * The owner-recorded facts travel in one patch, so three states stay
 * distinct: an absent key means the owner never answered, an explicit null
 * means the owner cleared the answer, and a value means what they recorded.
 */
export type ShelfFactsPatch = Record<string, unknown>;

export function shelfFactsPatch(command: {
  manualVariant?: string | null;
  manualSize?: string | null;
  manualBarcode?: string | null;
  openedOn?: { precision: string; value: string | null } | null;
  expiryOn?: string | null;
  pao?: string | null;
  quantityBand?: string | null;
  repurchaseIntent?: string | null;
  notes?: string | null;
}): ShelfFactsPatch {
  const facts: ShelfFactsPatch = {};
  const record = (key: string, value: unknown): void => {
    if (value === undefined) return;
    facts[key] = value;
  };
  record('manualVariant', command.manualVariant);
  record('manualSize', command.manualSize);
  record('manualBarcode', command.manualBarcode);
  record('openedOn', command.openedOn);
  record('expiryOn', command.expiryOn);
  record('pao', command.pao);
  record('quantityBand', command.quantityBand);
  record('repurchaseIntent', command.repurchaseIntent);
  record('notes', command.notes);
  return facts;
}

export async function recordUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = CreateUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_add', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    // A catalogue link is a confirmed match, so the server refuses one
    // here: the boundary decides, not the client.
    p_version_id: parsed.versionId,
    p_manual_brand: parsed.manualBrand,
    p_manual_name: parsed.manualName,
    p_manual_category: parsed.manualCategory,
    p_availability: parsed.availability,
    p_notes: null,
    p_effective_date: todayEffectiveDate(),
    p_facts: shelfFactsPatch(parsed),
  });
  return ShelfReceiptSchema.parse(data);
}

export async function changeUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = ChangeUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_change', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_expected_revision: parsed.expectedRevision,
    // An ordinary change never rewrites the identity the owner recorded,
    // and it never links a catalogue version: the server carries no
    // version parameter for it.
    p_manual_brand: null,
    p_manual_name: null,
    p_manual_category: null,
    p_availability: parsed.availability ?? null,
    p_notes: null,
    p_effective_date: todayEffectiveDate(),
    p_facts: shelfFactsPatch(parsed),
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

/**
 * The append-only correction (SH-03): the only way a wrong owner-entered
 * identity is replaced. It never rewrites the original entry - the server
 * appends a correction that points at the entry it replaces, so the earlier
 * wording stays readable in the owner's own history.
 */
export async function correctUserProduct(command: unknown): Promise<ShelfReceipt> {
  const parsed = CorrectUserProductCommandSchema.parse(command);
  const data = await callRpc('shelf_correct', {
    p_operation_id: parsed.operationId,
    p_user_product_id: parsed.userProductId,
    p_expected_revision: parsed.expectedRevision,
    p_corrects_id: parsed.correctsId,
    p_reason: parsed.reason,
    p_manual_brand: parsed.manualBrand,
    p_manual_name: parsed.manualName,
    p_manual_category: parsed.manualCategory,
    // The notes travel in the facts patch, so the three states of every
    // fact stay apart; the parameter itself never carries a second answer.
    p_notes: null,
    p_effective_date: todayEffectiveDate(),
    p_facts: shelfFactsPatch(parsed),
  });
  return ShelfReceiptSchema.parse(data);
}

/**
 * The revision a correction replaces: the newest revision that no
 * correction has replaced yet. A revision can only be corrected once, and
 * a correction appends, so the entry it corrects stays readable.
 */
export function correctionTarget(
  revisions: readonly ShelfRevisionRecord[] | undefined,
): ShelfRevisionRecord | null {
  if (!revisions || revisions.length === 0) return null;
  const replaced = new Set(
    revisions.map(revision => revision.correctsId).filter((id): id is string => id !== null),
  );
  for (const revision of [...revisions].reverse()) {
    if (replaced.has(revision.id)) continue;
    return revision;
  }
  return null;
}

/**
 * The identity a correction starts from: what the target revision itself
 * recorded, and the entry as it stands for the fields the revision left
 * alone. The two never disagree - an ordinary change cannot rewrite an
 * identity - so the form always opens on what the owner really recorded.
 */
export function correctionIdentity(
  target: ShelfRevisionRecord | null,
  detail: ShelfDetail | null | undefined,
): { brand: string; name: string; category: string } {
  const patch = target?.patch;
  const recorded = (key: string): string | null => {
    const value = patch?.[key];
    return typeof value === 'string' ? value : null;
  };
  const brand = recorded('manualBrand');
  const name = recorded('manualName');
  const category = recorded('manualCategory');
  return {
    brand: brand ?? detail?.manualBrand ?? '',
    name: name ?? detail?.manualName ?? '',
    category: category ?? detail?.manualCategory ?? '',
  };
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

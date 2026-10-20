import { z } from 'zod';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CorrectUserProductCommandSchema,
  correctionTargetRevision,
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
 * The audit read carries the facts the revision recorded in `patch` and the
 * reason a correction gave; the write receipt carries neither, so both are
 * optional here. The patch is a free-form object on the server, so only its
 * presence is checked - the client never invents a fact it did not read.
 */
const ShelfRevisionRecordSchema = z.object({
  id: UserProductIdSchema,
  kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
  correctsId: UserProductIdSchema.nullable(),
  matchVersionId: UserProductIdSchema.nullable(),
  patch: z.record(z.string(), z.unknown()).optional(),
  // The reason the owner gave for a correction. The server records it with
  // the revision, so the owner can read it back later.
  correctionReason: z.string().nullable().optional(),
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

/**
 * The day the owner acts on.
 *
 * It is read once, when the command is built, and it travels with the
 * command: a retained draft that is retried the next day sends the same
 * payload, so the retry replays instead of answering `operation-conflict`.
 */
export const todayEffectiveDate = () => ({
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

/**
 * The facts a correction carries: the identity it changes and the facts it
 * sets or clears.
 *
 * The identity is part of the patch, so the three states stay apart for it
 * too: a key that is absent preserves the answer, an explicit null clears
 * it, and a value replaces it. The identity never travels as a parameter of
 * its own.
 */
export function correctionFactsPatch(command: {
  manualBrand?: string | null;
  manualName?: string | null;
  manualCategory?: string | null;
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
  record('manualBrand', command.manualBrand);
  record('manualName', command.manualName);
  record('manualCategory', command.manualCategory);
  return { ...facts, ...shelfFactsPatch(command) };
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
    // The date the command carries, not the day of the call: a retry of a
    // retained command sends the same payload.
    p_effective_date: parsed.effectiveDate,
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
    // The date the command carries, not the day of the call.
    p_effective_date: parsed.effectiveDate,
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
    // The identity and the facts travel in the one patch: a key that is
    // absent preserves the answer, an explicit null clears it and a value
    // replaces it. The identity never travels as a parameter of its own.
    p_notes: null,
    // The date the command carries, not the day of the call: a retry of a
    // retained correction sends the same payload.
    p_effective_date: parsed.effectiveDate,
    p_facts: correctionFactsPatch(parsed),
  });
  return ShelfReceiptSchema.parse(data);
}

/**
 * The revision a correction replaces: the one that currently carries the
 * identity of the record.
 *
 * The rule belongs to the domain, so the client and the server never drift
 * apart: only the last link of a correction chain is still in force, and it
 * has to be the revision that carries the identity. A match, an archive, an
 * availability change and a fact-only change are never the target, however
 * recent they are.
 */
export function correctionTarget(
  revisions: readonly ShelfRevisionRecord[] | undefined,
): ShelfRevisionRecord | null {
  return correctionTargetRevision(revisions);
}

/**
 * The identity a correction starts from: what the target revision itself
 * recorded, and the entry as it stands for the fields the revision left
 * alone. The two never disagree - an ordinary change cannot rewrite an
 * identity - so the form always opens on what the owner really recorded.
 *
 * A field the owner took back is not the same as a field the owner never
 * answered, so the identity says which fields were cleared. A null in the
 * patch of a correction is an answer the owner took back; a null in the
 * patch of the first entry is an answer the owner never gave.
 */
export type ShelfCorrectionIdentity = {
  brand: string;
  name: string;
  category: string;
  cleared: { brand: boolean; name: boolean; category: boolean };
};

export function correctionIdentity(
  target: ShelfRevisionRecord | null,
  detail: ShelfDetail | null | undefined,
): ShelfCorrectionIdentity {
  const patch = target?.patch;
  const recorded = (key: string, fallback: string | null | undefined): string => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) {
      const value = patch[key];
      return typeof value === 'string' ? value : '';
    }
    return typeof fallback === 'string' ? fallback : '';
  };
  // A null in the patch of a correction is the owner taking the answer
  // back. A null in the patch of the first entry is an answer the owner
  // never gave, so it is not a cleared answer.
  const cleared = (key: string): boolean => Boolean(
    patch
    && Object.prototype.hasOwnProperty.call(patch, key)
    && patch[key] === null
    && target?.kind === 'correction',
  );
  return {
    brand: recorded('manualBrand', detail?.manualBrand),
    name: recorded('manualName', detail?.manualName),
    category: recorded('manualCategory', detail?.manualCategory),
    cleared: {
      brand: cleared('manualBrand'),
      name: cleared('manualName'),
      category: cleared('manualCategory'),
    },
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

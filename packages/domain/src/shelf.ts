import { z } from 'zod';
import { DateOnlySchema, EffectiveDateSchema } from './dates.ts';

// --- Verification status vs lifecycle (P1-VER-01: separate dimensions) ---

export const VerificationStatusSchema = z.enum([
  'unverified',
  'pending_verification',
  'partially_verified',
  'verified',
  'conflicting_information',
]);
export type VerificationStatus = z.output<typeof VerificationStatusSchema>;

export const LifecycleSchema = z.enum(['active', 'retired']);
export type Lifecycle = z.output<typeof LifecycleSchema>;

// --- Trust tiers (PRD §16: T1 strongest … T10 marketing-only, never evidence) ---

export const TrustTierSchema = z.enum(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
export type TrustTier = z.output<typeof TrustTierSchema>;

const trustTierRank = (tier: TrustTier): number => Number(tier.slice(1));

/** Negative when `left` is stronger, positive when weaker, zero when equal. */
export function compareTrustTiers(left: TrustTier, right: TrustTier): number {
  return trustTierRank(left) - trustTierRank(right);
}

/** Marketing-only claims (T10) are never evidence. */
export function isEvidenceTier(tier: TrustTier): boolean {
  return tier !== 'T10';
}

// --- Provenance sources ---

export const SourceTypeSchema = z.enum([
  'regulator',
  'peer_reviewed',
  'professional_body',
  'independent_testing',
  'manufacturer',
  'formulation_inference',
  'community_outcome',
  'consumer_signal',
  'individual_anecdote',
  'marketing',
]);
export type SourceType = z.output<typeof SourceTypeSchema>;

export const ProvenanceSourceSchema = z.object({
  sourceUrl: z.url(),
  archivedUrl: z.url().nullable(),
  sourceType: SourceTypeSchema,
  trustTier: TrustTierSchema,
  market: z.enum(['ZA', 'unknown']),
  firstSeen: z.iso.date(),
  lastChecked: z.iso.date(),
}).strict();
export type ProvenanceSource = z.output<typeof ProvenanceSourceSchema>;

// --- Claim-scoped verification (P1-VER-02: a verified name never verifies ingredients) ---

export const ProductClaimSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  claimKey: z.string().trim().min(1).max(100),
  statement: z.string().trim().max(2000).nullable(),
  status: VerificationStatusSchema,
}).strict();
export type ProductClaim = z.output<typeof ProductClaimSchema>;

// --- Verification events (privileged append-only; reviewer is server-set, never consumer input) ---

export const VerificationEventSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
  reviewedFields: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  status: VerificationStatusSchema,
  reason: z.string().trim().min(1).max(500),
  sourceIds: z.array(z.string().uuid()).max(50),
  recordedAt: z.string().datetime({ offset: true }),
}).strict();
export type VerificationEvent = z.output<typeof VerificationEventSchema>;

// --- User-product ownership commands (no owner fields; owner derives from auth) ---

export const ShelfCategorySchema = z.enum([
  'shampoo', 'clarifier', 'conditioner', 'mask', 'bond/protein treatment',
  'leave-in', 'heat protectant', 'anti-humidity', 'styling cream', 'mousse',
  'gel', 'serum', 'oil', 'scalp', 'colour', 'other',
]);
export type ShelfCategory = z.output<typeof ShelfCategorySchema>;

/**
 * What the owner records about a product they own (SH-01).
 *
 * `low` and `empty` are ordinary owner states, not failures: the shelf never
 * judges the owner for them, and the wording the app shows is neutral. The
 * legacy `out_of_stock` state is not a state the owner can record any more —
 * it only survives on rows written before this contract and stays readable.
 */
export const ShelfAvailabilitySchema = z.enum(['available', 'low', 'empty', 'archived']);
export type ShelfAvailability = z.output<typeof ShelfAvailabilitySchema>;

/** How much is left, in the owner's own coarse words (SH-04). */
export const QuantityBandSchema = z.enum([
  'full',
  'about-three-quarters',
  'about-half',
  'about-quarter',
  'nearly-empty',
  'unknown',
]);
export type QuantityBand = z.output<typeof QuantityBandSchema>;

/** Whether the owner would buy this product again (SH-04). */
export const RepurchaseIntentSchema = z.enum([
  'would-rebuy',
  'would-not-rebuy',
  'unsure',
  'unknown',
]);
export type RepurchaseIntent = z.output<typeof RepurchaseIntentSchema>;

// Owner-entered free text: bounded, trimmed, and never blank when present.
// An absent field and an explicit null stay different answers: absent means
// the owner never answered, null means the owner cleared it.
const manualVariantSchema = z.string().trim().min(1).max(200).nullable().optional();
const manualSizeSchema = z.string().trim().min(1).max(200).nullable().optional();
const manualBarcodeSchema = z.string().trim().min(1).max(100).nullable().optional();
const paoSchema = z.string().trim().min(1).max(200).nullable().optional();
const notesSchema = z.string().trim().min(1).max(2000).nullable().optional();

export const CreateUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  // The date the change takes effect. It belongs to the command, so the
  // command that is retried later is the same command: a retained draft
  // replays instead of answering `operation-conflict`.
  effectiveDate: EffectiveDateSchema,
  // A catalogue link is a confirmed match, never a side effect of recording a
  // product: the server refuses a version id here, so the domain refuses it
  // too. The link belongs to the match command, and only to that one.
  versionId: z.literal(null, { error: 'A catalogue link belongs to the confirmed match command' }),
  manualBrand: z.string().trim().min(1).max(200).nullable(),
  manualName: z.string().trim().min(1).max(200).nullable(),
  manualCategory: ShelfCategorySchema.nullable(),
  manualVariant: manualVariantSchema,
  manualSize: manualSizeSchema,
  manualBarcode: manualBarcodeSchema,
  availability: ShelfAvailabilitySchema,
  // The date the owner opened it, with the precision the owner actually knows.
  openedOn: EffectiveDateSchema.nullable().optional(),
  // An expiry may still be in the future; the domain never invents a shelf life.
  expiryOn: DateOnlySchema.nullable().optional(),
  // The owner's own wording of the period after opening, not a computed number.
  pao: paoSchema,
  quantityBand: QuantityBandSchema.nullable().optional(),
  repurchaseIntent: RepurchaseIntentSchema.nullable().optional(),
  notes: notesSchema,
}).strict().superRefine((command, context) => {
  // P1-SHELF-02: manual entries stand alone; a catalogue link may omit manual
  // fields - but an entry with neither is not a product.
  if (command.versionId === null && command.manualName === null) {
    context.addIssue({ code: 'custom', message: 'Manual entries require a product name' });
  }
});

export const ChangeUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  // The date the change takes effect, part of the command so a retry is the
  // same command.
  effectiveDate: EffectiveDateSchema,
  availability: ShelfAvailabilitySchema.optional(),
  manualVariant: manualVariantSchema,
  manualSize: manualSizeSchema,
  manualBarcode: manualBarcodeSchema,
  openedOn: EffectiveDateSchema.nullable().optional(),
  expiryOn: DateOnlySchema.nullable().optional(),
  pao: paoSchema,
  quantityBand: QuantityBandSchema.nullable().optional(),
  repurchaseIntent: RepurchaseIntentSchema.nullable().optional(),
  notes: notesSchema,
  // The owner's identity is never rewritten here (SH-03): a wrong brand, name
  // or category is corrected through the append-only correction path, so the
  // original entry and its history stay readable.
}).strict();

export const MatchUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  versionId: z.string().uuid(),
  // P1-SHELF-02: matching requires explicit confirmation; it never happens silently.
  confirmed: z.literal(true),
}).strict();

export const ArchiveUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}).strict();

/**
 * The append-only correction path (SH-03): the only way a wrong owner-entered
 * identity is replaced. It never rewrites the original entry — it appends a
 * correction that points at the entry it replaces, so the earlier wording
 * stays readable in the owner's own history.
 *
 * The correction's fields travel in one patch, and the three states stay
 * apart: a key that is absent preserves the answer, an explicit null clears
 * it, and a value replaces it. The identity is part of that patch, so a
 * correction always says something about the identity the owner recorded.
 */
/**
 * The owner-facing rule a correction has to meet.
 *
 * A correction is an identity correction: it always carries at least one
 * identity field, so the record it replaces keeps an identity to correct.
 * The wording lives here, so the domain, the editor and the intro the owner
 * reads all say the same thing.
 */
export const CORRECTION_IDENTITY_RULE = 'A correction has to change the brand, the product name or the category.';

/**
 * The wording of a refused identity correction.
 *
 * A correction that re-answers the identity with the same words corrects
 * nothing, so it is refused before it reaches the server. The wording lives
 * here, so the editor, the domain and the server all say the same thing.
 */
export const CORRECTION_IDENTITY_CHANGE_RULE =
  'Change the brand, product name or category to record an identity correction.';

/**
 * The identity a record carries.
 *
 * A field the record never answered is absent or null; both read as "no
 * answer", because the difference between "never answered" and "cleared" is
 * a difference in the history, not in the record.
 */
export type ShelfIdentity = {
  manualBrand?: string | null;
  manualName?: string | null;
  manualCategory?: string | null;
};

/** The words of an identity value, trimmed the way the server trims them. */
function identityWords(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * The identity of a record, as the domain reads it.
 *
 * A field the owner never answered reads as null, and a field the owner took
 * back reads as null too: the difference between the two lives in the
 * history, not in the record. The entry the server holds wins over the
 * values a form opened on, because that is what a correction is compared
 * against.
 */
export function shelfIdentity(
  record: { manualBrand?: string | null; manualName?: string | null; manualCategory?: string | null } | null | undefined,
  fallback?: { brand?: string | null; name?: string | null; category?: string | null } | null,
): ShelfIdentity {
  const text = (value: string | null | undefined): string | null => {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  };
  const pick = (value: string | null | undefined, other: string | null | undefined): string | null =>
    (value === undefined ? text(other) : value);
  return {
    manualBrand: pick(record?.manualBrand, fallback?.brand),
    manualName: pick(record?.manualName, fallback?.name),
    manualCategory: pick(record?.manualCategory, fallback?.category),
  };
}

/**
 * Whether a correction materially changes the identity of a record.
 *
 * A correction has to change the brand, the name or the category: re-typing
 * the same words corrects nothing, and a correction that only changes a
 * related fact - a variant, a size, a barcode, a note - does not correct
 * the identity either.
 *
 * The comparison reads the identity the write would land: a key the patch
 * names replaces the recorded answer, an explicit null clears it, and a key
 * the patch leaves out keeps it. So an explicit null over a recorded value
 * is a real change, while an explicit null over a value that was never
 * recorded changes nothing.
 *
 * The words are trimmed on both sides, so stray spaces are not a change. The
 * case is never folded: a different spelling is a different answer, and the
 * server compares the same way.
 *
 * The comparison needs the record the correction answers, so it is a
 * function and not a rule inside the command schema: the schema refuses a
 * correction that carries no identity at all, and this refuses one that
 * changes nothing about the identity the record holds. The server refuses
 * both, so the rule is never only in the app.
 */
export function correctionChangesIdentity(
  current: ShelfIdentity | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): boolean {
  const before = current ?? {};
  const facts = patch ?? {};
  return ShelfIdentityFields.some(field => {
    const lands = Object.prototype.hasOwnProperty.call(facts, field)
      ? identityWords(facts[field])
      : identityWords(before[field]);
    return lands !== identityWords(before[field]);
  });
}

export const CorrectUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  correctsId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  // The date the correction takes effect, part of the command so a retry is
  // the same command.
  effectiveDate: EffectiveDateSchema,
  // The identity the correction carries. A key that is absent is preserved,
  // an explicit null clears it and a value replaces it.
  manualBrand: z.string().trim().min(1).max(200).nullable().optional(),
  manualName: z.string().trim().min(1).max(200).nullable().optional(),
  manualCategory: ShelfCategorySchema.nullable().optional(),
  manualVariant: manualVariantSchema,
  manualSize: manualSizeSchema,
  manualBarcode: manualBarcodeSchema,
  openedOn: EffectiveDateSchema.nullable().optional(),
  expiryOn: DateOnlySchema.nullable().optional(),
  pao: paoSchema,
  quantityBand: QuantityBandSchema.nullable().optional(),
  repurchaseIntent: RepurchaseIntentSchema.nullable().optional(),
  notes: notesSchema,
}).strict().superRefine((command, context) => {
  // A correction is an identity correction: it always carries at least one
  // identity field, so the record it replaces keeps an identity to correct.
  if (command.manualBrand === undefined && command.manualName === undefined && command.manualCategory === undefined) {
    context.addIssue({ code: 'custom', message: CORRECTION_IDENTITY_RULE });
  }
});

// --- The revision a correction may replace ---------------------------------

/** The identity an owner-entered product carries. */
export const ShelfIdentityFields = ['manualBrand', 'manualName', 'manualCategory'] as const;
export type ShelfIdentityField = (typeof ShelfIdentityFields)[number];

/** The kinds of revision a product's own history holds. */
export type ShelfRevisionKind = 'baseline' | 'change' | 'correction' | 'match' | 'archive';

/**
 * One revision of a product's own history.
 *
 * A revision's `correctsId` points at the revision it replaces, so the
 * corrections of one record form a chain: the entry, then the correction
 * that replaced it, then the correction that replaced that one.
 */
export type ShelfRevision = {
  id: string;
  kind: ShelfRevisionKind;
  correctsId: string | null;
  patch?: Record<string, unknown> | null;
};

const isRecordedText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * Whether a revision carries the identity of the record.
 *
 * A match, an archive and an ordinary change never carry it: they link a
 * catalogue entry, they end the record, or they change a fact. The entry the
 * owner recorded and a correction both carry it - a correction carries it
 * whether it names the identity again or clears part of it, because a clear
 * is an answer about the identity too.
 */
export function revisionCarriesIdentity(revision: ShelfRevision): boolean {
  if (revision.kind === 'match' || revision.kind === 'archive' || revision.kind === 'change') return false;
  const patch = revision.patch;
  if (!patch) return false;
  const mentions = ShelfIdentityFields.some(field => Object.prototype.hasOwnProperty.call(patch, field));
  if (!mentions) return false;
  if (revision.kind === 'correction') return true;
  return ShelfIdentityFields.some(field => isRecordedText(patch[field]));
}

/**
 * The revision a correction may replace: the one that currently carries the
 * identity of the record.
 *
 * The corrections of a record form a chain, and only the last link of that
 * chain is still in force: a revision that a correction already replaced is
 * never the target again. Of the revisions nothing corrects, the target is
 * the one that carries the identity - a match, an archive, a change that
 * only moved the availability and a change that only touched a fact are
 * never the target, however recent they are.
 *
 * There is no target when no revision carries an identity: the server
 * answers such a correction with `invalid-correction-target`. A correction
 * that names a valid target but changes nothing about the identity is a
 * different refusal, and the server answers it with `invalid-correction-noop`.
 */
export function correctionTargetRevision<T extends ShelfRevision>(revisions: readonly T[] | null | undefined): T | null {
  if (!revisions || revisions.length === 0) return null;
  const corrected = new Set(
    revisions
      .map(revision => revision.correctsId)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  );
  const candidates = revisions.filter(revision => !corrected.has(revision.id) && revisionCarriesIdentity(revision));
  return candidates.length === 0 ? null : candidates[candidates.length - 1];
}

/**
 * The state of a record immediately before a correction.
 *
 * What a correction leaves alone depends on the whole history, not on the
 * entry it replaces alone: an entry can leave out a fact an earlier entry
 * recorded, and the entry it replaces says nothing about that fact. So the
 * state is reconstructed by replaying the history - every entry the owner
 * recorded, every ordinary change and every correction - up to the entry the
 * correction names.
 *
 * The revisions must be in the order they were recorded: the server reads
 * them back that way, and the state of the record is the order the writes
 * happened in. An ordinary change writes the record too, so the fact it
 * recorded is part of the state the correction found.
 *
 * A key that holds a value is the answer the record carried; a key that was
 * answered and then taken back is absent, because there is no answer to
 * keep; a key that was never answered is absent too.
 *
 * The replay fails closed: when the history cannot be read - the entry is
 * unknown, or the chain it belongs to is broken - it answers null, so the
 * caller never guesses what the record held.
 */
export function shelfStateBefore(
  revisions: readonly ShelfRevision[] | null | undefined,
  targetId: string | null | undefined,
): Record<string, unknown> | null {
  if (!revisions || revisions.length === 0) return null;
  if (typeof targetId !== 'string' || targetId === '') return null;
  const byId = new Map<string, ShelfRevision>();
  const positions = new Map<string, number>();
  for (const [index, revision] of revisions.entries()) {
    // Duplicate identities make both lookup and replay order ambiguous.
    if (byId.has(revision.id)) return null;
    byId.set(revision.id, revision);
    positions.set(revision.id, index);
  }
  const target = byId.get(targetId);
  if (!target) return null;
  const targetPosition = positions.get(targetId);
  if (targetPosition === undefined) return null;

  // Replay uses every entry through the target. Validate that whole prefix,
  // not only the target's ancestry, so an unrelated malformed entry cannot
  // influence the reconstructed state.
  for (const [index, revision] of revisions.entries()) {
    if (index > targetPosition) break;
    const parentId = revision.correctsId;
    if (parentId === null || parentId === undefined || parentId === '') continue;
    if (revision.kind !== 'correction') return null;
    const parentPosition = positions.get(parentId);
    if (parentPosition === undefined || parentPosition >= index) return null;
  }
  // The chain the target belongs to must be whole: an entry that points at
  // an entry nobody holds cannot be read, and nothing is guessed at.
  const seen = new Set<string>();
  let cursor: ShelfRevision | undefined = target;
  while (cursor) {
    if (seen.has(cursor.id)) return null;
    seen.add(cursor.id);
    const parentId = cursor.correctsId;
    if (parentId === null || parentId === undefined || parentId === '') break;
    const parent: ShelfRevision | undefined = byId.get(parentId);
    if (!parent) return null;
    const parentPosition = positions.get(parentId);
    const cursorPosition = positions.get(cursor.id);
    if (parentPosition === undefined || cursorPosition === undefined || parentPosition >= cursorPosition) return null;
    cursor = parent;
  }
  const state: Record<string, unknown> = {};
  for (const revision of revisions) {
    const patch = revision.patch;
    if (patch) {
      for (const [key, value] of Object.entries(patch)) {
        // An explicit null is the owner taking an answer back: there is no
        // answer left to keep.
        if (value === null) delete state[key];
        else state[key] = value;
      }
    }
    if (revision.id === targetId) break;
  }
  return state;
}

export type CreateUserProductCommand = z.output<typeof CreateUserProductCommandSchema>;
export type ChangeUserProductCommand = z.output<typeof ChangeUserProductCommandSchema>;
export type MatchUserProductCommand = z.output<typeof MatchUserProductCommandSchema>;
export type ArchiveUserProductCommand = z.output<typeof ArchiveUserProductCommandSchema>;
export type CorrectUserProductCommand = z.output<typeof CorrectUserProductCommandSchema>;

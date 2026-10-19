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
  versionId: z.string().uuid().nullable(),
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
  // P1-SHELF-02: manual entries stand alone; catalogue links may omit manual fields —
  // but an entry with neither is not a product.
  if (command.versionId === null && command.manualName === null) {
    context.addIssue({ code: 'custom', message: 'Manual entries require a product name' });
  }
});

export const ChangeUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
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
 */
export const CorrectUserProductCommandSchema = z.object({
  operationId: z.string().uuid(),
  userProductId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  correctsId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
  manualBrand: z.string().trim().min(1).max(200).nullable(),
  manualName: z.string().trim().min(1).max(200).nullable(),
  manualCategory: ShelfCategorySchema.nullable(),
  manualVariant: manualVariantSchema,
  manualSize: manualSizeSchema,
  manualBarcode: manualBarcodeSchema,
  openedOn: EffectiveDateSchema.nullable().optional(),
  expiryOn: DateOnlySchema.nullable().optional(),
  pao: paoSchema,
  quantityBand: QuantityBandSchema.nullable().optional(),
  repurchaseIntent: RepurchaseIntentSchema.nullable().optional(),
  notes: notesSchema,
}).strict();

export type CreateUserProductCommand = z.output<typeof CreateUserProductCommandSchema>;
export type ChangeUserProductCommand = z.output<typeof ChangeUserProductCommandSchema>;
export type MatchUserProductCommand = z.output<typeof MatchUserProductCommandSchema>;
export type ArchiveUserProductCommand = z.output<typeof ArchiveUserProductCommandSchema>;
export type CorrectUserProductCommand = z.output<typeof CorrectUserProductCommandSchema>;

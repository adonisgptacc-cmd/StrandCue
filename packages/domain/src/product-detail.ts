import { z } from 'zod';
import { EffectiveDateSchema } from './dates.ts';
import { QuantityBandSchema, RepurchaseIntentSchema, ShelfCategorySchema, SourceTypeSchema, TrustTierSchema, type SourceType } from './shelf.ts';

// --- Bounds -------------------------------------------------------------------

export const DETAIL_MAX_CLAIMS = 50;
export const DETAIL_MAX_EVIDENCE_PER_CLAIM = 20;

// --- Publication states -------------------------------------------------------

/**
 * A section of a product detail is in exactly one publication state, and only
 * `published` carries content. A section whose state is missing or unreadable
 * is never shown, so a draft cannot be painted as a fact: the contract has no
 * place to put one. The three states without content stay apart because they
 * say different things to the owner: nothing has been published, a review is
 * under way, or content was published and later withdrawn.
 */
function publicationSection<C extends z.ZodType>(content: C) {
  return z.discriminatedUnion('state', [
    z.object({ state: z.literal('published'), content }).strict(),
    z.object({ state: z.literal('under_review') }).strict(),
    z.object({ state: z.literal('not_published') }).strict(),
    z.object({ state: z.literal('withdrawn') }).strict(),
  ]);
}

const text = (max: number) => z.string().trim().min(1).max(max);
// A source link is only ever followed when it is https: the database holds the same rule.
const httpsUrl = z.url().max(2000).refine(value => value.startsWith('https://'), 'A source link must be https');
const catalogueText = text(200);

// --- Identity and lifecycle ---------------------------------------------------

/**
 * The exact version. The version id names the version; the product id only
 * names the family it belongs to.
 */
export const DetailIdentitySchema = z.object({
  versionId: z.string().uuid(),
  productId: z.string().uuid(),
  brand: catalogueText,
  productName: catalogueText,
  variant: catalogueText.nullable(),
  category: ShelfCategorySchema,
  market: z.enum(['ZA', 'unknown']),
  barcode: z.string().trim().min(1).max(100).nullable(),
}).strict();

const SuccessorVersionSchema = z.object({
  versionId: z.string().uuid(),
  brand: catalogueText,
  productName: catalogueText,
  variant: catalogueText.nullable(),
}).strict();

/**
 * A successor is only a pointer. It never replaces the version the owner is
 * reading, and it only appears when a reviewed successor relationship was
 * published for a retired version.
 */
const SuccessorSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('not_published') }).strict(),
  z.object({ state: z.literal('under_review') }).strict(),
  z.object({ state: z.literal('published'), version: SuccessorVersionSchema }).strict(),
]);

export const DetailLifecycleSchema = z.object({
  state: z.enum(['active', 'retired']),
  successor: SuccessorSchema,
}).strict();

// --- Directions ---------------------------------------------------------------

/**
 * Published reviewed directions. Every field is nullable: null means the
 * reviewed record does not say, which is not the same as "none".
 */
export const DetailDirectionsSchema = z.object({
  routinePlacement: text(120).nullable(),
  instructions: text(2000).nullable(),
  applicationOrder: z.number().int().min(1).max(20).nullable(),
  rinseMode: z.enum(['rinse-out', 'leave-in']).nullable(),
  waitMinutes: z.number().min(0).max(240).nullable(),
  frequency: z.object({
    count: z.number().int().min(1).max(14),
    unit: z.enum(['day', 'week', 'month', 'wash', 'use']),
  }).strict().nullable(),
  activation: text(300).nullable(),
  requiredTools: z.array(text(80)).max(10).nullable(),
  requiredConditions: z.array(text(200)).max(10).nullable(),
  incompatibilities: z.array(text(200)).max(20).nullable(),
  limitations: text(1000).nullable(),
}).strict();

// --- Claims and evidence ------------------------------------------------------

/**
 * One piece of evidence for one claim of this exact version. It carries what a
 * person may read about the source - never who reviewed it, never an internal
 * note. An excerpt is present only when the published record approved it for
 * consumer display.
 */
export const DetailEvidenceSchema = z.object({
  evidenceId: z.string().uuid(),
  sourceType: SourceTypeSchema,
  trustTier: TrustTierSchema,
  title: text(300),
  publisher: text(200),
  market: z.enum(['ZA', 'unknown']),
  firstSeen: z.iso.date(),
  lastChecked: z.iso.date(),
  applicability: text(1000),
  limitations: text(1000),
  sourceUrl: httpsUrl,
  archivedUrl: httpsUrl.nullable(),
  excerpt: text(1000).nullable(),
}).strict();

export const DetailClaimSchema = z.object({
  claimId: z.string().uuid(),
  claimKey: text(100),
  statement: text(2000).nullable(),
  evidence: z.array(DetailEvidenceSchema).max(DETAIL_MAX_EVIDENCE_PER_CLAIM),
}).strict();

// Order by code unit, the order the database uses (collate "C"): the same on every device.
const before = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
// The tier is ordered by its number, so T2 comes before T10 - the order the database uses.
const tierRank = (tier: string): number => Number(tier.slice(1));
const evidenceOrder = (a: z.output<typeof DetailEvidenceSchema>, b: z.output<typeof DetailEvidenceSchema>): number =>
  tierRank(a.trustTier) - tierRank(b.trustTier) || before(a.title, b.title) || before(a.evidenceId, b.evidenceId);
const claimOrder = (a: z.output<typeof DetailClaimSchema>, b: z.output<typeof DetailClaimSchema>): number =>
  before(a.claimKey, b.claimKey) || before(a.claimId, b.claimId);

const isSorted = <T>(items: readonly T[], compare: (a: T, b: T) => number): boolean =>
  items.every((item, index) => index === 0 || compare(items[index - 1], item) < 0);

// --- The owner's own record (present only in a Shelf context) -----------------

/** The facts the owner recorded, kept apart from everything the catalogue says. */
export const DetailOwnerFactsSchema = z.object({
  userProductId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'low', 'empty', 'archived', 'out_of_stock']),
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  manualBrand: z.string().max(200).nullable(),
  manualName: z.string().max(200).nullable(),
  manualCategory: ShelfCategorySchema.nullable(),
  manualVariant: z.string().max(200).nullable(),
  manualSize: z.string().max(200).nullable(),
  manualBarcode: z.string().max(100).nullable(),
  openedOn: EffectiveDateSchema.nullable(),
  expiryOn: z.iso.date().nullable(),
  pao: z.string().max(200).nullable(),
  quantityBand: QuantityBandSchema.nullable(),
  repurchaseIntent: RepurchaseIntentSchema.nullable(),
  notes: z.string().max(2000).nullable(),
  revisions: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
    correctsId: z.string().uuid().nullable(),
    matchVersionId: z.string().uuid().nullable(),
  }).strict()).max(500),
}).strict();

// --- The detail ---------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

/**
 * Everything the consumer may read about one exact catalogue version.
 *
 * Identity, lifecycle, reviewed directions, label ingredients, claim-scoped
 * evidence and the owner's own record are separate members, so none can be
 * mistaken for another. There is no capability, ranking, score or promotion
 * member: nothing here is derived from a category or from text.
 */
export const ProductDetailSchema = z.object({
  identity: DetailIdentitySchema,
  lifecycle: DetailLifecycleSchema,
  formulationReference: publicationSection(z.object({ value: text(200) }).strict()),
  directions: publicationSection(DetailDirectionsSchema.refine(
    directions => Object.values(directions).some(value => value !== null),
    'Published directions state at least one thing',
  )),
  // Ingredients are label text only; no member can hold an interpretation.
  ingredients: publicationSection(z.object({ text: text(4000) }).strict()),
  claims: publicationSection(z.object({
    items: z.array(DetailClaimSchema).min(1).max(DETAIL_MAX_CLAIMS)
      .refine(items => isSorted(items, claimOrder), 'Claims must be in their stable order')
      .refine(items => items.every(item => isSorted(item.evidence, evidenceOrder)), 'Evidence must be in its stable order'),
  }).strict()),
  owner: DetailOwnerFactsSchema.nullable(),
}).strict().superRefine((detail, context) => {
  const { lifecycle, identity } = detail;
  if (lifecycle.successor.state === 'published') {
    if (lifecycle.state !== 'retired') {
      context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'Only a retired version has a successor' });
    }
    if (lifecycle.successor.version.versionId === identity.versionId) {
      context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'A version is never its own successor' });
    }
  } else if (lifecycle.state === 'active' && lifecycle.successor.state !== 'none') {
    context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'An active version has no successor' });
  }
}).transform(deepFreeze);

export type ProductDetail = z.output<typeof ProductDetailSchema>;
export type DetailClaim = z.output<typeof DetailClaimSchema>;
export type DetailEvidence = z.output<typeof DetailEvidenceSchema>;
export type DetailDirections = z.output<typeof DetailDirectionsSchema>;
export type DetailOwnerFacts = z.output<typeof DetailOwnerFactsSchema>;

// --- Evidence classes ---------------------------------------------------------

export type EvidenceClass = 'independent' | 'manufacturer' | 'inference' | 'marketing' | 'experience';

/** Which kind of voice a source is. Marketing and personal experience are never independent. */
export function evidenceClass(sourceType: SourceType): EvidenceClass {
  switch (sourceType) {
    case 'regulator':
    case 'peer_reviewed':
    case 'professional_body':
    case 'independent_testing':
      return 'independent';
    case 'manufacturer':
      return 'manufacturer';
    case 'formulation_inference':
      return 'inference';
    case 'marketing':
      return 'marketing';
    case 'consumer_signal':
    case 'community_outcome':
    case 'individual_anecdote':
      return 'experience';
  }
}

const evidenceLabels: Record<SourceType, string> = {
  regulator: 'Regulator or safety source',
  peer_reviewed: 'Peer-reviewed research',
  professional_body: 'Professional organisation',
  independent_testing: 'Independent testing',
  manufacturer: 'Manufacturer direction',
  formulation_inference: 'Formulation inference, not a tested result',
  marketing: 'Marketing statement, not independent evidence',
  consumer_signal: 'Consumer signal, not a tested result',
  community_outcome: 'Community outcome, not a tested result',
  individual_anecdote: 'Individual personal account, not a tested result',
};

export function evidenceClassLabel(sourceType: SourceType): string {
  return evidenceLabels[sourceType];
}

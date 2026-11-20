import { z } from 'zod';
import { CatalogueSearchRequestSchema, CATALOGUE_SEARCH_MAX_LIMIT } from './catalogue-search.ts';
import { DetailClaimsContentSchema, freezeDetail, publicationSection } from './product-detail.ts';
import {
  ToolAttachmentsSchema,
  ToolCapabilitiesSchema,
  ToolConditionSchema,
  ToolHeatMethodsSchema,
  ToolSettingsSchema,
  ToolTypeSchema,
  YesNoUnknownSchema,
} from './tools.ts';

// --- Search (identity and lifecycle only) ---------------------------------------

/** The same bounded, normalized words as the product search: quotes and percent signs are data. */
export const ToolSearchRequestSchema = CatalogueSearchRequestSchema;
export type ToolSearchRequest = z.output<typeof ToolSearchRequestSchema>;

const catalogueText = z.string().trim().min(1).max(200);
const toolMarketSchema = z.enum(['ZA', 'unknown']);

/**
 * One exact tool version. Identity and lifecycle only: a capability, a claim, a source or a successor
 * link is never part of a search answer, and the strict shape refuses a response that carries one.
 */
export const ToolCatalogueCandidateSchema = z.object({
  versionId: z.string().uuid(),
  toolId: z.string().uuid(),
  brand: catalogueText,
  toolName: catalogueText,
  versionLabel: catalogueText,
  toolType: ToolTypeSchema,
  market: toolMarketSchema,
  lifecycle: z.enum(['active', 'retired']),
}).strict();
export type ToolCatalogueCandidate = z.output<typeof ToolCatalogueCandidateSchema>;

export const ToolSearchResultSchema = z.object({
  results: z.array(ToolCatalogueCandidateSchema).max(CATALOGUE_SEARCH_MAX_LIMIT),
  truncated: z.boolean(),
}).strict();
export type ToolSearchResult = z.output<typeof ToolSearchResultSchema>;

export function toolCandidateTitle(candidate: Pick<ToolCatalogueCandidate, 'brand' | 'toolName'>): string {
  return `${candidate.brand}: ${candidate.toolName}`;
}

// --- Detail ---------------------------------------------------------------------

const ToolDetailIdentitySchema = z.object({
  versionId: z.string().uuid(),
  toolId: z.string().uuid(),
  brand: catalogueText,
  toolName: catalogueText,
  versionLabel: catalogueText,
  toolType: ToolTypeSchema,
  market: toolMarketSchema,
}).strict();

const SuccessorSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('none') }).strict(),
  z.object({ state: z.literal('not_published') }).strict(),
  z.object({ state: z.literal('under_review') }).strict(),
  z.object({
    state: z.literal('published'),
    version: z.object({ versionId: z.string().uuid(), brand: catalogueText, toolName: catalogueText, versionLabel: catalogueText }).strict(),
  }).strict(),
]);

/** The owner's own record of this tool: their words and answers, apart from every catalogue fact. */
export const ToolDetailOwnerSchema = z.object({
  userToolId: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  availability: z.enum(['available', 'out_of_stock', 'archived']),
  matched: z.boolean(),
  matchConfirmed: z.boolean(),
  manualBrand: z.string().max(200).nullable(),
  manualModel: z.string().max(200).nullable(),
  toolType: ToolTypeSchema.nullable(),
  wattageWatts: z.number().int().min(1).max(10000).nullable(),
  adjustableTemp: YesNoUnknownSchema.nullable(),
  settings: ToolSettingsSchema.nullable(),
  attachments: ToolAttachmentsSchema.nullable(),
  condition: ToolConditionSchema.nullable(),
  heatMethods: ToolHeatMethodsSchema.nullable(),
  notes: z.string().max(2000).nullable(),
  revisions: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(['baseline', 'change', 'correction', 'match', 'archive']),
    correctsId: z.string().uuid().nullable(),
    matchVersionId: z.string().uuid().nullable(),
  }).strict()).max(500),
}).strict();
export type ToolDetailOwner = z.output<typeof ToolDetailOwnerSchema>;

/**
 * Everything the consumer may read about one exact tool version. Capabilities and claims exist only
 * when explicitly published; the owner's record is its own member and is present only in a context
 * the server bound to the signed-in owner. No score, ranking or safety member exists.
 */
export const ToolDetailSchema = z.object({
  identity: ToolDetailIdentitySchema,
  lifecycle: z.object({ state: z.enum(['active', 'retired']), successor: SuccessorSchema }).strict(),
  capabilities: publicationSection(ToolCapabilitiesSchema),
  claims: publicationSection(DetailClaimsContentSchema),
  owner: ToolDetailOwnerSchema.nullable(),
}).strict().superRefine((detail, context) => {
  const { lifecycle, identity } = detail;
  if (lifecycle.successor.state === 'published') {
    if (lifecycle.state !== 'retired') context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'Only a retired version has a successor' });
    if (lifecycle.successor.version.versionId === identity.versionId) {
      context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'A version is never its own successor' });
    }
  } else if (lifecycle.state === 'active' && lifecycle.successor.state !== 'none') {
    context.addIssue({ code: 'custom', path: ['lifecycle', 'successor'], message: 'An active version has no successor' });
  }
}).transform(freezeDetail);
export type ToolDetail = z.output<typeof ToolDetailSchema>;

// --- The owner's record against the catalogue version ------------------------------

export type ToolComparisonField = 'brand' | 'model' | 'toolType';
export type ToolComparisonStatus = 'same' | 'different' | 'unknown';
export type ToolComparisonRow = {
  field: ToolComparisonField;
  manual: string | null;
  catalogue: string;
  status: ToolComparisonStatus;
};

const toWords = (value: string | null): string | null => {
  if (value === null) return null;
  const text = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return text === '' ? null : text;
};

/**
 * The owner's identity next to the catalogue version, field by field. A field the owner never answered is
 * unknown, never different. Nothing is inferred and nothing is copied: the function reads both sides and
 * writes neither.
 */
export function compareToolRecordToCandidate(
  manual: Readonly<{ brand: string | null; model: string | null; toolType: string | null }>,
  candidate: Readonly<Pick<ToolCatalogueCandidate, 'brand' | 'toolName' | 'toolType'>>,
): ToolComparisonRow[] {
  const row = (field: ToolComparisonField, owner: string | null, catalogue: string): ToolComparisonRow => {
    const left = toWords(owner);
    const status: ToolComparisonStatus = left === null ? 'unknown' : left.toLowerCase() === toWords(catalogue)!.toLowerCase() ? 'same' : 'different';
    return { field, manual: left, catalogue, status };
  };
  return [row('brand', manual.brand, candidate.brand), row('model', manual.model, candidate.toolName), row('toolType', manual.toolType, candidate.toolType)];
}

import { z } from 'zod';
import { ShelfCategorySchema } from './shelf.ts';

// --- Search request (the owner's words; never syntax) -------------------------

export const CATALOGUE_SEARCH_MIN_LENGTH = 2;
export const CATALOGUE_SEARCH_MAX_LENGTH = 80;
export const CATALOGUE_SEARCH_MAX_TERMS = 6;
export const CATALOGUE_SEARCH_DEFAULT_LIMIT = 10;
export const CATALOGUE_SEARCH_MAX_LIMIT = 25;

/**
 * The words of a search, the way the server reads them: compatibility forms
 * folded, runs of whitespace collapsed to one space and the ends trimmed. The
 * case is left alone here; the server folds it when it compares.
 */
export function normalizeCatalogueSearchText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

const hasHiddenCharacter = (text: string): boolean => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text);

const SearchTextSchema = z.string()
  .transform(normalizeCatalogueSearchText)
  .pipe(z.string()
    .min(CATALOGUE_SEARCH_MIN_LENGTH, 'Type at least two characters to search.')
    .max(CATALOGUE_SEARCH_MAX_LENGTH, `Use at most ${CATALOGUE_SEARCH_MAX_LENGTH} characters to search.`)
    .refine(text => !hasHiddenCharacter(text), 'Search words cannot contain hidden or control characters.')
    .refine(text => text.split(' ').length <= CATALOGUE_SEARCH_MAX_TERMS, `Use at most ${CATALOGUE_SEARCH_MAX_TERMS} words to search.`)
    .refine(text => text.split(' ').every(word => word.length >= CATALOGUE_SEARCH_MIN_LENGTH), 'Each search word needs at least two characters.'));

/**
 * A catalogue search. Quotes, percent signs and SQL-shaped text are ordinary
 * words: the server compares them as data and no character is a wildcard.
 */
export const CatalogueSearchRequestSchema = z.object({
  query: SearchTextSchema,
  limit: z.number().int().min(1).max(CATALOGUE_SEARCH_MAX_LIMIT).default(CATALOGUE_SEARCH_DEFAULT_LIMIT),
}).strict();
export type CatalogueSearchRequest = z.output<typeof CatalogueSearchRequestSchema>;

// --- Search result (identity and lifecycle only) ------------------------------

const catalogueText = z.string().trim().min(1).max(200);

/**
 * One exact catalogue product version.
 *
 * The version id names the exact version the owner would be linked to; the
 * product id only names the family the version belongs to. The shape is
 * strict on purpose: a response that carries claims, capabilities,
 * ingredients, directions, sources or marketing text is refused whole, so a
 * server that leaked one would show the owner nothing instead.
 */
export const CatalogueCandidateSchema = z.object({
  versionId: z.string().uuid(),
  productId: z.string().uuid(),
  brand: catalogueText,
  productName: catalogueText,
  variant: catalogueText.nullable(),
  category: ShelfCategorySchema,
  market: z.enum(['ZA', 'unknown']),
  barcode: z.string().trim().min(1).max(100).nullable(),
  lifecycle: z.enum(['active', 'retired']),
  successorVersionId: z.string().uuid().nullable(),
}).strict();
export type CatalogueCandidate = z.output<typeof CatalogueCandidateSchema>;

export const CatalogueSearchResultSchema = z.object({
  results: z.array(CatalogueCandidateSchema).max(CATALOGUE_SEARCH_MAX_LIMIT),
  // True when more versions matched than the limit allowed.
  truncated: z.boolean(),
}).strict();
export type CatalogueSearchResult = z.output<typeof CatalogueSearchResultSchema>;

/** How many of the listed versions belong to the same product family. */
export function versionsOfSameProduct(candidates: readonly CatalogueCandidate[], candidate: CatalogueCandidate): number {
  return candidates.filter(other => other.productId === candidate.productId).length;
}

/**
 * The facts the catalogue entry does not hold. A pack size is never a
 * catalogue field, so it is always unknown here.
 */
export function candidateUnknowns(candidate: CatalogueCandidate): string[] {
  const unknown: string[] = [];
  if (candidate.variant === null) unknown.push('variant');
  if (candidate.barcode === null) unknown.push('barcode');
  unknown.push('pack size');
  return unknown;
}

// --- The owner's record against the catalogue version -------------------------

export type ManualRecord = {
  brand: string | null;
  name: string | null;
  category: string | null;
  variant: string | null;
  size: string | null;
  barcode: string | null;
};

export type ComparisonField = 'brand' | 'name' | 'category' | 'variant' | 'size' | 'barcode';
export type ComparisonStatus = 'same' | 'different' | 'unknown';
export type ComparisonRow = {
  field: ComparisonField;
  manual: string | null;
  catalogue: string | null;
  status: ComparisonStatus;
};

const words = (value: string | null): string | null => {
  if (value === null) return null;
  const text = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  return text === '' ? null : text;
};
const digits = (value: string | null): string | null => {
  const text = words(value);
  if (text === null) return null;
  const only = text.replace(/[\s-]/gu, '');
  return only === '' ? null : only;
};

function row(
  field: ComparisonField,
  manual: string | null,
  catalogue: string | null,
  key: (value: string | null) => string | null,
): ComparisonRow {
  const left = key(manual);
  const right = key(catalogue);
  const status: ComparisonStatus = left === null || right === null
    ? 'unknown'
    : left.toLowerCase() === right.toLowerCase() ? 'same' : 'different';
  return { field, manual: words(manual), catalogue: words(catalogue), status };
}

/**
 * The owner's recorded identity next to the catalogue version, field by field.
 *
 * A field either side never answered is unknown, never different: an absent
 * answer says nothing. The catalogue holds no pack size, so the owner's size
 * is always unknown against it. Nothing is inferred and nothing is copied -
 * the function reads both sides and writes neither.
 */
export function compareManualRecordToCandidate(manual: Readonly<ManualRecord>, candidate: Readonly<CatalogueCandidate>): ComparisonRow[] {
  return [
    row('brand', manual.brand, candidate.brand, words),
    row('name', manual.name, candidate.productName, words),
    row('category', manual.category, candidate.category, words),
    row('variant', manual.variant, candidate.variant, words),
    row('size', manual.size, null, words),
    row('barcode', manual.barcode, candidate.barcode, digits),
  ];
}

import { describe, expect, it } from 'vitest';

import {
  CATALOGUE_SEARCH_DEFAULT_LIMIT,
  CATALOGUE_SEARCH_MAX_LENGTH,
  CATALOGUE_SEARCH_MAX_LIMIT,
  CATALOGUE_SEARCH_MAX_TERMS,
  CatalogueCandidateSchema,
  CatalogueSearchRequestSchema,
  CatalogueSearchResultSchema,
  candidateUnknowns,
  compareManualRecordToCandidate,
  normalizeCatalogueSearchText,
  versionsOfSameProduct,
  type CatalogueCandidate,
} from '../../packages/domain/src/catalogue-search.ts';
import * as domain from '../../packages/domain/src/index.ts';

const candidate = (overrides: Partial<CatalogueCandidate> = {}): CatalogueCandidate => ({
  versionId: 'a0000000-0000-4000-8000-000000000001',
  productId: 'a0000000-0000-4000-8000-0000000000a1',
  brand: 'House Brand',
  productName: 'Gentle Shampoo',
  variant: null,
  category: 'shampoo',
  market: 'ZA',
  barcode: null,
  lifecycle: 'active',
  successorVersionId: null,
  ...overrides,
});

describe('catalogue search request contract', () => {
  it('trims and collapses whitespace so the same words are the same query', () => {
    expect(normalizeCatalogueSearchText('  Gentle \t  Shampoo \n')).toBe('Gentle Shampoo');
    expect(CatalogueSearchRequestSchema.parse({ query: '  Gentle   Shampoo  ', limit: 5 }))
      .toEqual({ query: 'Gentle Shampoo', limit: 5 });
  });

  it('folds compatibility characters so look-alike spellings are one query', () => {
    expect(normalizeCatalogueSearchText('ＧＥＮＴＬＥ')).toBe('GENTLE');
  });

  it('defaults the limit to a small page and never exceeds the maximum', () => {
    expect(CatalogueSearchRequestSchema.parse({ query: 'gentle' }).limit).toBe(CATALOGUE_SEARCH_DEFAULT_LIMIT);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle', limit: CATALOGUE_SEARCH_MAX_LIMIT }).success).toBe(true);
    for (const limit of [0, -1, CATALOGUE_SEARCH_MAX_LIMIT + 1, 1.5, Number.NaN]) {
      expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle', limit }).success).toBe(false);
    }
  });

  it('refuses too-short, blank, over-long and control-character queries', () => {
    expect(CatalogueSearchRequestSchema.safeParse({ query: '' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: '   ' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'a' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'a'.repeat(CATALOGUE_SEARCH_MAX_LENGTH) }).success).toBe(true);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'a'.repeat(CATALOGUE_SEARCH_MAX_LENGTH + 1) }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle\u0000shampoo' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle‮shampoo' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 42 }).success).toBe(false);
  });

  it('requires every word to have two characters, as the server does', () => {
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle a' }).success).toBe(false);
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'ab cd' }).success).toBe(true);
  });

  it('limits the number of terms so a query cannot fan out into a scan', () => {
    const terms = Array.from({ length: CATALOGUE_SEARCH_MAX_TERMS }, (_, index) => `t${index}x`).join(' ');
    expect(CatalogueSearchRequestSchema.safeParse({ query: terms }).success).toBe(true);
    expect(CatalogueSearchRequestSchema.safeParse({ query: `${terms} extra` }).success).toBe(false);
  });

  it('treats injection-shaped text as ordinary words, never as syntax', () => {
    const parsed = CatalogueSearchRequestSchema.parse({ query: "x'; drop table products; --" });
    expect(parsed.query).toBe("x'; drop table products; --");
    expect(CatalogueSearchRequestSchema.safeParse({ query: "L'Oréal 100%_pure" }).success).toBe(true);
  });

  it('refuses unknown request keys', () => {
    expect(CatalogueSearchRequestSchema.safeParse({ query: 'gentle', owner: 'x' }).success).toBe(false);
  });
});

describe('catalogue candidate contract', () => {
  it('accepts exactly the identity and lifecycle fields', () => {
    expect(CatalogueCandidateSchema.parse(candidate())).toEqual(candidate());
  });

  it('refuses any field that would carry draft claims, capabilities, evidence or marketing text', () => {
    for (const extra of ['ingredients', 'claims', 'capabilities', 'directions', 'sources', 'evidence', 'marketing', 'verification']) {
      expect(CatalogueCandidateSchema.safeParse({ ...candidate(), [extra]: 'anything' }).success).toBe(false);
      expect(CatalogueSearchResultSchema.safeParse({ results: [{ ...candidate(), [extra]: 'anything' }], truncated: false }).success).toBe(false);
    }
  });

  it('refuses malformed identities, categories, markets and lifecycles', () => {
    expect(CatalogueCandidateSchema.safeParse(candidate({ versionId: 'not-a-uuid' })).success).toBe(false);
    expect(CatalogueCandidateSchema.safeParse(candidate({ category: 'miracle cure' as never })).success).toBe(false);
    expect(CatalogueCandidateSchema.safeParse(candidate({ market: 'US' as never })).success).toBe(false);
    expect(CatalogueCandidateSchema.safeParse(candidate({ lifecycle: 'draft' as never })).success).toBe(false);
    expect(CatalogueCandidateSchema.safeParse(candidate({ brand: '' })).success).toBe(false);
  });

  it('bounds the number of results and requires the truncation flag', () => {
    const many = Array.from({ length: CATALOGUE_SEARCH_MAX_LIMIT + 1 }, (_, index) =>
      candidate({ versionId: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
    expect(CatalogueSearchResultSchema.safeParse({ results: many, truncated: true }).success).toBe(false);
    expect(CatalogueSearchResultSchema.safeParse({ results: [] }).success).toBe(false);
    expect(CatalogueSearchResultSchema.parse({ results: [], truncated: false })).toEqual({ results: [], truncated: false });
  });

  it('is exported from the domain barrel', () => {
    expect(domain.CatalogueSearchRequestSchema).toBe(CatalogueSearchRequestSchema);
  });
});

describe('exact version identity', () => {
  it('keeps a product family distinct from each of its versions', () => {
    const first = candidate();
    const second = candidate({ versionId: 'a0000000-0000-4000-8000-000000000002', variant: 'Travel size' });
    const other = candidate({ versionId: 'a0000000-0000-4000-8000-000000000003', productId: 'a0000000-0000-4000-8000-0000000000a2' });
    expect(first.productId).toBe(second.productId);
    expect(first.versionId).not.toBe(second.versionId);
    expect(versionsOfSameProduct([first, second, other], first)).toBe(2);
    expect(versionsOfSameProduct([first, second, other], other)).toBe(1);
  });
});

describe('unknown facts stay unknown', () => {
  it('names every fact the catalogue entry does not hold', () => {
    expect(candidateUnknowns(candidate())).toEqual(['variant', 'barcode', 'pack size']);
    expect(candidateUnknowns(candidate({ variant: 'Travel size', barcode: '6001234567890' }))).toEqual(['pack size']);
  });
});

describe('manual record versus catalogue version', () => {
  const manual = { brand: 'House brand', name: 'gentle  shampoo', category: 'shampoo', variant: null, size: '250 ml', barcode: null };

  it('compares words without folding away real differences', () => {
    const rows = compareManualRecordToCandidate(manual, candidate());
    expect(rows.find(row => row.field === 'brand')).toMatchObject({ status: 'same' });
    expect(rows.find(row => row.field === 'name')).toMatchObject({ status: 'same' });
    expect(rows.find(row => row.field === 'category')).toMatchObject({ status: 'same' });
  });

  it('marks a missing answer on either side unknown, never different', () => {
    const rows = compareManualRecordToCandidate(manual, candidate());
    expect(rows.find(row => row.field === 'variant')).toMatchObject({ status: 'unknown', manual: null, catalogue: null });
    expect(rows.find(row => row.field === 'barcode')).toMatchObject({ status: 'unknown' });
    // The catalogue holds no pack size, so the owner's size can never be compared.
    expect(rows.find(row => row.field === 'size')).toMatchObject({ status: 'unknown', manual: '250 ml', catalogue: null });
  });

  it('reports a real difference with both wordings', () => {
    const rows = compareManualRecordToCandidate({ ...manual, brand: 'Other Brand', category: 'conditioner' }, candidate());
    expect(rows.find(row => row.field === 'brand')).toMatchObject({ status: 'different', manual: 'Other Brand', catalogue: 'House Brand' });
    expect(rows.find(row => row.field === 'category')).toMatchObject({ status: 'different' });
  });

  it('compares barcodes by digits so spacing never hides or invents a difference', () => {
    const same = compareManualRecordToCandidate({ ...manual, barcode: '6001 2345-67890' }, candidate({ barcode: '6001234567890' }));
    expect(same.find(row => row.field === 'barcode')).toMatchObject({ status: 'same' });
    const different = compareManualRecordToCandidate({ ...manual, barcode: '6001234567891' }, candidate({ barcode: '6001234567890' }));
    expect(different.find(row => row.field === 'barcode')).toMatchObject({ status: 'different' });
  });

  it('never mutates the owner record or the candidate it presents', () => {
    const frozenManual = Object.freeze({ ...manual });
    const frozenCandidate = Object.freeze(candidate());
    expect(() => compareManualRecordToCandidate(frozenManual, frozenCandidate)).not.toThrow();
    expect(frozenManual).toEqual(manual);
    expect(frozenCandidate).toEqual(candidate());
  });

  it('infers nothing beyond the fields it was given', () => {
    const rows = compareManualRecordToCandidate(manual, candidate());
    expect(rows.map(row => row.field)).toEqual(['brand', 'name', 'category', 'variant', 'size', 'barcode']);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchCatalogue } from '../../apps/mobile/src/catalogue-search-api';
import {
  candidateLines,
  candidateTitle,
  comparisonLine,
  lifecycleLine,
  manualRecordLines,
  matchFailure,
  searchFailureMessage,
  suggestedSearchText,
  versionReference,
} from '../../apps/mobile/src/catalogue-match-copy';
import type { CatalogueCandidate } from '../../packages/domain/src/catalogue-search.ts';

const rpc = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ supabase: { rpc } as { rpc: typeof rpc } | null }));
vi.mock('../../apps/mobile/src/client.ts', () => ({ get supabase() { return client.supabase; } }));

const candidate = (overrides: Partial<CatalogueCandidate> = {}): CatalogueCandidate => ({
  versionId: 'a0000000-0000-4000-8000-0000000000f1',
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

beforeEach(() => { rpc.mockReset(); client.supabase = { rpc }; });

describe('catalogue search boundary', () => {
  it('sends only the normalized words and a bounded limit', async () => {
    rpc.mockResolvedValueOnce({ data: { results: [candidate()], truncated: false }, error: null });
    const result = await searchCatalogue({ query: '  gentle   shampoo ', limit: 5 });
    expect(rpc).toHaveBeenCalledWith('catalogue_search', { p_query: 'gentle shampoo', p_limit: 5 });
    expect(result.results).toHaveLength(1);
  });

  it('uses the default limit and never sends an owner field', async () => {
    rpc.mockResolvedValueOnce({ data: { results: [], truncated: false }, error: null });
    await searchCatalogue({ query: 'gentle' });
    expect(rpc.mock.calls[0][1]).toEqual({ p_query: 'gentle', p_limit: 10 });
  });

  it('rejects a malformed request before any network call', async () => {
    await expect(searchCatalogue({ query: 'a' })).rejects.toThrow();
    await expect(searchCatalogue({ query: 'gentle', limit: 99 })).rejects.toThrow();
    await expect(searchCatalogue({ query: 'gentle', owner: 'x' })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the server answers more than was asked for', async () => {
    rpc.mockResolvedValueOnce({ data: { results: [candidate(), candidate({ versionId: 'a0000000-0000-4000-8000-0000000000f2' })], truncated: false }, error: null });
    await expect(searchCatalogue({ query: 'gentle', limit: 1 })).rejects.toThrow();
  });

  it('fails closed on a response that carries anything beyond identity and lifecycle', async () => {
    rpc.mockResolvedValueOnce({ data: { results: [{ ...candidate(), ingredients: { list: 'x' } }], truncated: false }, error: null });
    await expect(searchCatalogue({ query: 'gentle' })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { results: [], truncated: false, claims: [] }, error: null });
    await expect(searchCatalogue({ query: 'gentle' })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(searchCatalogue({ query: 'gentle' })).rejects.toThrow();
  });

  it('surfaces a server refusal and an unconfigured client', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('invalid-search') });
    await expect(searchCatalogue({ query: 'gentle' })).rejects.toThrow('invalid-search');
    client.supabase = null;
    await expect(searchCatalogue({ query: 'gentle' })).rejects.toThrow(/unavailable/);
  });
});

describe('catalogue match wording', () => {
  it('suggests search words from the owner record without inventing any', () => {
    expect(suggestedSearchText({ manualBrand: 'House brand', manualName: 'Gentle shampoo' })).toBe('House brand Gentle shampoo');
    expect(suggestedSearchText({ manualBrand: null, manualName: 'Gentle shampoo' })).toBe('Gentle shampoo');
    expect(suggestedSearchText({ manualBrand: null, manualName: null })).toBe('');
    expect(suggestedSearchText({ manualBrand: 'x', manualName: null })).toBe('');
    expect(suggestedSearchText({ manualBrand: 'a b c d', manualName: 'e f g h' }).split(' ')).toHaveLength(6);
    expect(suggestedSearchText({ manualBrand: 'a'.repeat(100), manualName: null }).length).toBeLessThanOrEqual(80);
  });

  it('presents the exact version, with unknown facts said plainly', () => {
    expect(candidateTitle(candidate())).toBe('House Brand: Gentle Shampoo');
    expect(candidateLines(candidate())).toEqual([
      'Brand: House Brand',
      'Product: Gentle Shampoo',
      'Variant: Not recorded in the catalogue',
      'Category: Shampoo',
      'Market: South Africa',
      'Barcode: Not recorded in the catalogue',
      'Size: Not recorded in the catalogue',
    ]);
    expect(candidateLines(candidate({ variant: 'Travel 50 ml', barcode: '6001234567890', market: 'unknown' }))).toEqual(expect.arrayContaining([
      'Variant: Travel 50 ml', 'Barcode: 6001234567890', 'Market: Not recorded in the catalogue',
    ]));
    expect(versionReference(candidate())).toBe('Catalogue code (last 8 characters): 000000f1');
  });

  it('states the lifecycle without promoting any version', () => {
    expect(lifecycleLine(candidate())).toBe('Catalogue status: current version');
    expect(lifecycleLine(candidate({ lifecycle: 'retired' }))).toBe('Catalogue status: retired version');
    expect(lifecycleLine(candidate({ lifecycle: 'retired', successorVersionId: 'a0000000-0000-4000-8000-0000000000f9' })))
      .toBe('Catalogue status: retired version. A newer version exists in the catalogue.');
  });

  it('reads the owner record in their own words, with unanswered fields said plainly', () => {
    expect(manualRecordLines({ manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: '250 ml', manualBarcode: null })).toEqual([
      'Brand: House brand', 'Product: Gentle shampoo', 'Category: Shampoo', 'Variant: Not answered', 'Size: 250 ml', 'Barcode: Not answered',
    ]);
    expect(manualRecordLines({ manualBrand: null, manualName: null, manualCategory: null, manualVariant: null, manualSize: null, manualBarcode: null })[0]).toBe('Brand: Not answered');
  });

  it('words each comparison without calling an unknown a mismatch', () => {
    expect(comparisonLine({ field: 'brand', manual: 'A', catalogue: 'A', status: 'same' })).toBe('Brand: the same wording in both.');
    expect(comparisonLine({ field: 'name', manual: 'A', catalogue: 'B', status: 'different' })).toBe('Product: different. You recorded "A"; the catalogue lists "B".');
    expect(comparisonLine({ field: 'variant', manual: null, catalogue: null, status: 'unknown' })).toBe('Variant: not recorded in either place, so it is unknown.');
    expect(comparisonLine({ field: 'size', manual: '250 ml', catalogue: null, status: 'unknown' })).toBe('Size: you recorded "250 ml"; the catalogue does not hold it, so it cannot be compared.');
    expect(comparisonLine({ field: 'barcode', manual: null, catalogue: '600', status: 'unknown' })).toBe('Barcode: the catalogue lists "600"; you did not record one, so it cannot be compared.');
    expect(comparisonLine({ field: 'category', manual: 'shampoo', catalogue: 'conditioner', status: 'different' })).toContain('Shampoo');
  });

  it('answers a failed search in plain words and never repeats server text', () => {
    expect(searchFailureMessage(new Error('boom: select * from products'))).toBe('The catalogue search could not be completed. Nothing was changed. Try again.');
    expect(searchFailureMessage({ message: 'authentication-required' })).toBe('Sign in again to search the catalogue. Nothing was changed.');
    expect(searchFailureMessage({ message: 'invalid-search' })).toBe('Those search words were not accepted. Use two to eighty characters and at most six words.');
  });

  it('classifies a failed match so a stale entry is never retried blind', () => {
    expect(matchFailure(new Error('revision-conflict'))).toMatchObject({ kind: 'conflict' });
    expect(matchFailure(new Error('revision-conflict')).message).toContain('changed elsewhere');
    expect(matchFailure(new Error('version-not-found'))).toMatchObject({ kind: 'refused' });
    expect(matchFailure(new Error('operation-conflict'))).toMatchObject({ kind: 'refused' });
    expect(matchFailure(new Error('confirmation-required'))).toMatchObject({ kind: 'refused' });
    expect(matchFailure(new Error('not-found'))).toMatchObject({ kind: 'refused' });
    expect(matchFailure(new Error('authentication-required')).message).toContain('Sign in again');
    const network = matchFailure(new Error('Network request failed: secret detail'));
    expect(network.kind).toBe('retry');
    expect(network.message).not.toContain('secret');
    expect(network.message).toContain('retry');
  });
});

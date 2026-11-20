import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCatalogueProductDetail } from '../../apps/mobile/src/catalogue-detail-api';
import {
  detailFailure,
  directionLines,
  evidenceLines,
  identityLines,
  lifecycleLines,
  ownerLines,
  sectionNotice,
  sourceLinkLabel,
} from '../../apps/mobile/src/product-detail-copy';

const rpc = vi.hoisted(() => vi.fn());
const client = vi.hoisted(() => ({ supabase: { rpc } as { rpc: typeof rpc } | null }));
vi.mock('../../apps/mobile/src/client.ts', () => ({ get supabase() { return client.supabase; } }));

const V = 'a0000000-0000-4000-8000-0000000000f1';
const P = 'a0000000-0000-4000-8000-0000000000a1';
const U = 'a0000000-0000-4000-8000-000000000002';

const detail = (overrides: Record<string, unknown> = {}) => ({
  identity: { versionId: V, productId: P, brand: 'House Brand', productName: 'Gentle Shampoo', variant: null, category: 'shampoo', market: 'ZA', barcode: null },
  lifecycle: { state: 'active', successor: { state: 'none' } },
  formulationReference: { state: 'not_published' },
  directions: { state: 'not_published' },
  ingredients: { state: 'not_published' },
  claims: { state: 'not_published' },
  owner: null,
  ...overrides,
});
const owner = (overrides: Record<string, unknown> = {}) => ({
  userProductId: U, revision: 2, availability: 'low', matched: true, matchConfirmed: true, manualBrand: 'House brand', manualName: 'Gentle shampoo',
  manualCategory: 'shampoo', manualVariant: null, manualSize: '250 ml', manualBarcode: null, openedOn: { precision: 'month', value: '2026-02' },
  expiryOn: null, pao: '12M', quantityBand: 'about-half', repurchaseIntent: 'unsure', notes: 'Mine', revisions: [], ...overrides,
});

beforeEach(() => { rpc.mockReset(); client.supabase = { rpc }; });

describe('catalogue product detail boundary', () => {
  it('asks for one exact version, with no owner context unless one is named', async () => {
    rpc.mockResolvedValueOnce({ data: detail(), error: null });
    const result = await getCatalogueProductDetail({ versionId: V });
    expect(rpc).toHaveBeenCalledWith('catalogue_product_detail', { p_version_id: V, p_user_product_id: null });
    expect(result.identity.versionId).toBe(V);
    expect(result.owner).toBeNull();
  });

  it('binds a Shelf context and requires the owner facts to answer for it', async () => {
    rpc.mockResolvedValueOnce({ data: detail({ owner: owner() }), error: null });
    const result = await getCatalogueProductDetail({ versionId: V, userProductId: U });
    expect(rpc).toHaveBeenCalledWith('catalogue_product_detail', { p_version_id: V, p_user_product_id: U });
    expect(result.owner?.manualSize).toBe('250 ml');
  });

  it('refuses a malformed request before any network call', async () => {
    await expect(getCatalogueProductDetail({ versionId: 'not-a-uuid' })).rejects.toThrow();
    await expect(getCatalogueProductDetail({ versionId: V, userProductId: 'nope' })).rejects.toThrow();
    await expect(getCatalogueProductDetail({ versionId: V, extra: 1 })).rejects.toThrow();
    await expect(getCatalogueProductDetail(null)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed response, a missing publication state or any internal field', async () => {
    const bad: unknown[] = [
      null, 'x', {}, { ...detail(), directions: undefined },
      detail({ directions: { state: 'draft' } }),
      detail({ directions: { state: 'published' } }),
      detail({ claims: { state: 'under_review', content: { items: [] } } }),
      { ...detail(), reviewer: 'someone' },
      detail({ identity: { ...detail().identity, reviewedBy: 'someone' } }),
    ];
    for (const data of bad) {
      rpc.mockResolvedValueOnce({ data, error: null });
      await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow();
    }
  });

  it('refuses an answer for another version or another owner context', async () => {
    rpc.mockResolvedValueOnce({ data: detail({ identity: { ...detail().identity, versionId: 'a0000000-0000-4000-8000-0000000000f2' } }), error: null });
    await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow(/detail-mismatch/);
    rpc.mockResolvedValueOnce({ data: detail({ owner: owner() }), error: null });
    await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow(/detail-mismatch/);
    rpc.mockResolvedValueOnce({ data: detail(), error: null });
    await expect(getCatalogueProductDetail({ versionId: V, userProductId: U })).rejects.toThrow(/detail-mismatch/);
    rpc.mockResolvedValueOnce({ data: detail({ owner: owner({ userProductId: 'a0000000-0000-4000-8000-0000000000aa' }) }), error: null });
    await expect(getCatalogueProductDetail({ versionId: V, userProductId: U })).rejects.toThrow(/detail-mismatch/);
  });

  it('refuses a source link that is not https', async () => {
    const evidence = { evidenceId: 'a0000000-0000-4000-8000-0000000000e1', sourceType: 'manufacturer', trustTier: 'T5', title: 'T', publisher: 'P', market: 'ZA',
      firstSeen: '2024-01-01', lastChecked: '2024-02-01', applicability: 'a', limitations: 'l', sourceUrl: 'javascript:alert(1)', archivedUrl: null, excerpt: null };
    const claims = { state: 'published', content: { items: [{ claimId: 'a0000000-0000-4000-8000-0000000000c1', claimKey: 'k', statement: 's', evidence: [evidence] }] } };
    rpc.mockResolvedValueOnce({ data: detail({ claims }), error: null });
    await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: detail({ claims: { ...claims, content: { items: [{ ...claims.content.items[0], evidence: [{ ...evidence, sourceUrl: 'https://example.test/a' }] }] } } }), error: null });
    await expect(getCatalogueProductDetail({ versionId: V })).resolves.toBeTruthy();
  });

  it('surfaces a server refusal or an unconfigured client, and never logs anything', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(name => vi.spyOn(console, name).mockImplementation(() => undefined));
    rpc.mockResolvedValueOnce({ data: null, error: new Error('not-found') });
    await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow('not-found');
    client.supabase = null;
    await expect(getCatalogueProductDetail({ versionId: V })).rejects.toThrow(/unavailable/);
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled(); spy.mockRestore(); }
  });
});

describe('product detail wording', () => {
  const identity = detail().identity as never;

  it('shows the exact identity and says plainly what the catalogue does not hold', () => {
    expect(identityLines(identity)).toEqual([
      'Brand: House Brand', 'Product: Gentle Shampoo', 'Variant: Not recorded in the catalogue', 'Category: Shampoo',
      'Market: South Africa', 'Barcode: Not recorded in the catalogue', 'Size: Not recorded in the catalogue for this version',
      'Reference code (last 8 characters): 000000f1',
    ]);
    expect(identityLines({ ...(identity as object), variant: 'Travel 50 ml', barcode: '6001234567890', market: 'unknown' } as never)).toEqual(expect.arrayContaining([
      'Variant: Travel 50 ml', 'Barcode: 6001234567890', 'Market: Not recorded in the catalogue',
    ]));
  });

  it('words each lifecycle and successor state without replacing the version', () => {
    expect(lifecycleLines({ state: 'active', successor: { state: 'none' } })).toEqual(['Version status: current catalogue version.']);
    const retired = lifecycleLines({ state: 'retired', successor: { state: 'none' } });
    expect(retired[0]).toBe('Version status: retired version. This is a historical version, not the current formulation.');
    expect(retired[1]).toBe('No newer version is recorded.');
    expect(lifecycleLines({ state: 'retired', successor: { state: 'not_published' } })[1]).toBe('A newer version is recorded, but the link has not been published, so it is not shown.');
    expect(lifecycleLines({ state: 'retired', successor: { state: 'under_review' } })[1]).toBe('A newer version is recorded, and the link is under review, so it is not shown yet.');
    const published = lifecycleLines({ state: 'retired', successor: { state: 'published', version: { versionId: V, brand: 'House Brand', productName: 'Gentle Shampoo', variant: 'Reformulated' } } });
    expect(published[1]).toBe('A reviewed newer version is listed: House Brand: Gentle Shampoo (Reformulated). Your product stays linked to this version.');
  });

  it('gives each unpublished cause its own words', () => {
    const states = ['not_published', 'under_review', 'withdrawn'] as const;
    for (const section of ['directions', 'claims', 'ingredients', 'formulationReference'] as const) {
      const notices = states.map(state => sectionNotice(section, state));
      expect(new Set(notices).size).toBe(3);
    }
    expect(sectionNotice('directions', 'not_published')).toBe('No published directions are available for this exact version.');
    expect(sectionNotice('claims', 'not_published')).toBe('No reviewed claims are published for this exact version.');
    expect(sectionNotice('claims', 'under_review')).toBe('Claims for this version are under review and are not shown yet.');
    expect(sectionNotice('ingredients', 'withdrawn')).toBe('Ingredients were published and later withdrawn. They are not shown.');
    expect(sectionNotice('ingredients', 'not_published')).toBe('Ingredients are not published for this exact version.');
  });

  it('words directions field by field, with a recorded absence kept apart from a stated answer', () => {
    const lines = directionLines({
      routinePlacement: 'After shampoo', instructions: 'Apply to wet hair.', applicationOrder: 2, rinseMode: 'leave-in', waitMinutes: 3,
      frequency: { count: 2, unit: 'week' }, activation: null, requiredTools: ['wide-tooth comb'], requiredConditions: [], incompatibilities: null, limitations: null,
    });
    expect(lines).toEqual([
      'Where it fits: After shampoo', 'Directions: Apply to wet hair.', 'Application order: step 2', 'Rinse-out or leave-in: Leave-in',
      'Wait time: 3 minutes', 'How often: 2 times a week', 'Needs activation: Not stated in the reviewed directions',
      'Tools needed: wide-tooth comb', 'Conditions needed: None listed in the reviewed directions',
      'Do not combine with: Not stated in the reviewed directions', 'Limits: Not stated in the reviewed directions',
    ]);
    expect(directionLines({ routinePlacement: null, instructions: null, applicationOrder: null, rinseMode: 'rinse-out', waitMinutes: 1, frequency: { count: 1, unit: 'wash' },
      activation: 'Warm water', requiredTools: null, requiredConditions: ['Damp hair'], incompatibilities: ['Product X', 'Product Y'], limitations: 'Not for dyed hair.' }))
      .toEqual(expect.arrayContaining(['Rinse-out or leave-in: Rinse-out', 'Wait time: 1 minute', 'How often: once a wash', 'Do not combine with: Product X; Product Y']));
  });

  it('words evidence with its class, never calling marketing or personal accounts independent', () => {
    const base = { evidenceId: V, sourceType: 'marketing', trustTier: 'T10', title: 'Launch page', publisher: 'House Brand', market: 'ZA', firstSeen: '2024-01-01', lastChecked: '2024-06-01',
      applicability: 'This exact version.', limitations: 'A promotional statement.', sourceUrl: 'https://example.test/a', archivedUrl: null, excerpt: null } as const;
    const lines = evidenceLines(base);
    expect(lines).toEqual([
      'Kind of source: Marketing statement, not independent evidence', 'Source: Launch page', 'Published by: House Brand',
      'First seen 1 January 2024; last checked 1 June 2024', 'Applies to: This exact version.', 'Limits: A promotional statement.',
    ]);
    expect(evidenceLines({ ...base, excerpt: 'Approved text' })).toContain('Excerpt: Approved text');
    expect(evidenceLines({ ...base, sourceType: 'formulation_inference' })[0]).toMatch(/inference/i);
    expect(sourceLinkLabel(base)).toBe('Open source: Launch page, published by House Brand');
  });

  it('keeps the owner record separate and says what the owner did not provide', () => {
    expect(ownerLines(owner() as never)).toEqual([
      'Status: Running low', 'Linked to this catalogue version by you, after you confirmed it.',
      'You recorded: House brand, Gentle shampoo, Shampoo', 'Size you recorded: 250 ml', 'Variant you recorded: Not provided by you',
      'Opened: February 2026', 'Expiry date: Not provided by you', 'Period after opening: 12M', 'How much is left: About half left', 'Buying again: Not sure yet',
      'Your notes: Mine',
    ]);
    const empty = ownerLines(owner({ manualBrand: null, manualCategory: null, manualSize: null, openedOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: null }) as never);
    expect(empty).toEqual(expect.arrayContaining(['Opened: Not provided by you', 'Period after opening: Not provided by you', 'How much is left: Not provided by you',
      'Buying again: Not provided by you', 'Your notes: Not provided by you', 'Size you recorded: Not provided by you']));
  });

  it('classifies failures without repeating server text', () => {
    expect(detailFailure(new Error('not-found'))).toEqual({ kind: 'not_found', message: 'These product details are no longer available. Go back and choose again.' });
    expect(detailFailure(new Error('authentication-required')).kind).toBe('auth');
    const retry = detailFailure(new Error('boom: select secret from product_claims'));
    expect(retry.kind).toBe('retry');
    expect(retry.message).toBe('The product details could not be loaded. Nothing was changed. Try again.');
    expect(detailFailure(new Error('detail-mismatch')).kind).toBe('retry');
  });
});

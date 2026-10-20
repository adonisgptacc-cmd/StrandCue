import { describe, expect, it } from 'vitest';

import {
  DETAIL_MAX_CLAIMS,
  DETAIL_MAX_EVIDENCE_PER_CLAIM,
  ProductDetailSchema,
  evidenceClass,
  evidenceClassLabel,
  type ProductDetail,
} from '../../packages/domain/src/product-detail.ts';
import * as domain from '../../packages/domain/src/index.ts';

const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const identity = {
  versionId: id(31), productId: id(21), brand: 'House Brand', productName: 'Gentle Shampoo',
  variant: null, category: 'shampoo', market: 'ZA', barcode: null,
};
const evidence = (n: number, overrides: Record<string, unknown> = {}) => ({
  evidenceId: id(100 + n), sourceType: 'manufacturer', trustTier: 'T5', title: `Source ${n}`, publisher: 'House Brand',
  market: 'ZA', firstSeen: '2024-01-01', lastChecked: '2024-06-01', applicability: 'This exact version only.',
  limitations: 'A manufacturer statement, not a test.', sourceUrl: 'https://example.test/a', archivedUrl: null, excerpt: null,
  ...overrides,
});
const claim = (n: number, overrides: Record<string, unknown> = {}) => ({
  claimId: id(200 + n), claimKey: `claim-${n}`, statement: 'Use after shampooing.', evidence: [], ...overrides,
});
const directions = {
  routinePlacement: 'After shampoo', instructions: 'Apply to wet hair.', applicationOrder: 2, rinseMode: 'rinse-out',
  waitMinutes: 3, frequency: { count: 2, unit: 'week' }, activation: null, requiredTools: null,
  requiredConditions: null, incompatibilities: ['Do not combine with product X.'], limitations: null,
};
const base = (overrides: Record<string, unknown> = {}) => ({
  identity,
  lifecycle: { state: 'active', successor: { state: 'none' } },
  formulationReference: { state: 'not_published' },
  directions: { state: 'not_published' },
  ingredients: { state: 'not_published' },
  claims: { state: 'not_published' },
  owner: null,
  ...overrides,
});

describe('exact-version product detail', () => {
  it('parses an identity with every section honestly unpublished', () => {
    const parsed = ProductDetailSchema.parse(base());
    expect(parsed.identity.versionId).toBe(id(31));
    expect(parsed.directions).toEqual({ state: 'not_published' });
    expect(parsed.owner).toBeNull();
  });

  it('parses published directions, ingredients, claims and evidence', () => {
    const parsed = ProductDetailSchema.parse(base({
      formulationReference: { state: 'published', content: { value: 'F-2024-A' } },
      directions: { state: 'published', content: directions },
      ingredients: { state: 'published', content: { text: 'Aqua, Sodium Laureth Sulfate' } },
      claims: { state: 'published', content: { items: [claim(1, { evidence: [evidence(1)] })] } },
    }));
    expect(parsed.directions.state).toBe('published');
    expect(parsed.claims.state === 'published' && parsed.claims.content.items[0].evidence).toHaveLength(1);
  });

  it('keeps every unknown cause distinct', () => {
    for (const state of ['not_published', 'under_review', 'withdrawn']) {
      expect(ProductDetailSchema.parse(base({ directions: { state }, ingredients: { state }, claims: { state } })).directions.state).toBe(state);
    }
    expect(new Set(['not_published', 'under_review', 'withdrawn']).size).toBe(3);
  });

  it('refuses internal, administrative and unknown fields anywhere', () => {
    const attempts: Record<string, unknown>[] = [
      { ...base(), reviewer: 'someone' },
      base({ identity: { ...identity, reviewedBy: 'someone' } }),
      base({ identity: { ...identity, ingredients: 'x' } }),
      base({ lifecycle: { state: 'active', successor: { state: 'none' }, notes: 'x' } }),
      base({ directions: { state: 'published', content: { ...directions, internalNote: 'x' } } }),
      base({ claims: { state: 'published', content: { items: [claim(1, { reviewedBy: 'x' })] } } }),
      base({ claims: { state: 'published', content: { items: [claim(1, { evidence: [evidence(1, { reviewer: 'x' })] })] } } }),
      base({ claims: { state: 'published', content: { items: [claim(1, { capabilities: ['heat'] })] } } }),
      base({ directions: { state: 'published', content: { ...directions, capabilities: { contactHeat: true } } } }),
      base({ rank: 1 }),
      base({ promotion: 'sponsored' }),
    ];
    for (const attempt of attempts) expect(ProductDetailSchema.safeParse(attempt).success).toBe(false);
  });

  it('refuses content on any state that is not published, so a draft cannot become a fact', () => {
    for (const state of ['under_review', 'not_published', 'withdrawn', 'draft']) {
      expect(ProductDetailSchema.safeParse(base({ directions: { state, content: directions } })).success).toBe(false);
      expect(ProductDetailSchema.safeParse(base({ claims: { state, content: { items: [claim(1)] } } })).success).toBe(false);
    }
    expect(ProductDetailSchema.safeParse(base({ directions: { state: 'published' } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [] } } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'draft', content: { items: [claim(1)] } } })).success).toBe(false);
  });

  it('refuses a claim that says it is a draft or carries its own publication state', () => {
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [claim(1, { state: 'draft' })] } } })).success).toBe(false);
  });

  it('keeps identity and owner facts apart', () => {
    const owner = {
      userProductId: id(1), revision: 2, availability: 'available', matched: true, matchConfirmed: true,
      manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo', manualVariant: null, manualSize: '250 ml',
      manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: 'Mine',
      revisions: [{ id: id(2), kind: 'baseline', correctsId: null, matchVersionId: null }, { id: id(3), kind: 'match', correctsId: null, matchVersionId: id(31) }],
    };
    const parsed = ProductDetailSchema.parse(base({ owner }));
    expect(parsed.owner?.manualName).toBe('Gentle shampoo');
    expect(parsed.identity.productName).toBe('Gentle Shampoo');
    expect(ProductDetailSchema.safeParse(base({ owner: { ...owner, ownerId: id(9) } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ owner: { ...owner, revisions: [{ id: id(2), kind: 'baseline', correctsId: null, matchVersionId: null, patch: {} }] } })).success).toBe(false);
  });

  it('ties evidence to its claim and keeps the exact version identity valid', () => {
    expect(ProductDetailSchema.safeParse(base({ identity: { ...identity, versionId: 'not-a-uuid' } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ identity: { ...identity, category: 'miracle' } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [claim(1, { evidence: [evidence(1, { sourceType: 'guess' })] })] } } })).success).toBe(false);
    // Evidence can only live inside a claim: a top-level evidence list is refused.
    expect(ProductDetailSchema.safeParse(base({ evidence: [evidence(1)] })).success).toBe(false);
  });

  it('refuses published directions that state nothing, and unbounded owner facts', () => {
    const empty = Object.fromEntries(Object.keys(directions).map(key => [key, null]));
    expect(ProductDetailSchema.safeParse(base({ directions: { state: 'published', content: empty } })).success).toBe(false);
    const owner = {
      userProductId: id(1), revision: 2, availability: 'available', matched: true, matchConfirmed: true, manualBrand: null, manualName: 'x', manualCategory: 'shampoo',
      manualVariant: null, manualSize: null, manualBarcode: null, openedOn: null, expiryOn: null, pao: null, quantityBand: null, repurchaseIntent: null, notes: null, revisions: [],
    };
    expect(ProductDetailSchema.safeParse(base({ owner })).success).toBe(true);
    for (const patch of [{ quantityBand: 'a lot' }, { repurchaseIntent: 'maybe' }, { manualCategory: 'miracle' }, { notes: 'x'.repeat(2001) }, { expiryOn: 'soon' }, { manualName: 'x'.repeat(201) }]) {
      expect(ProductDetailSchema.safeParse(base({ owner: { ...owner, ...patch } })).success).toBe(false);
    }
  });

  it('refuses a source link that is not https', () => {
    for (const sourceUrl of ['javascript:alert(1)', 'http://example.test/a', 'file:///etc/passwd']) {
      expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [claim(1, { evidence: [evidence(1, { sourceUrl })] })] } } })).success).toBe(false);
    }
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [claim(1, { evidence: [evidence(1, { archivedUrl: 'http://archive.test/a' })] })] } } })).success).toBe(false);
  });

  it('requires a stable order for claims and evidence', () => {
    const ordered = [claim(1, { evidence: [evidence(1, { trustTier: 'T1', title: 'A' }), evidence(2, { trustTier: 'T5', title: 'B' })] }), claim(2)];
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: ordered } } })).success).toBe(true);
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [...ordered].reverse() } } })).success).toBe(false);
    const swapped = [claim(1, { evidence: [evidence(2, { trustTier: 'T5', title: 'B' }), evidence(1, { trustTier: 'T1', title: 'A' })] })];
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: swapped } } })).success).toBe(false);
    // Tiers are ordered by number: T2 comes before T10, whatever the text order says.
    const tiers = [claim(1, { evidence: [evidence(1, { trustTier: 'T2', title: 'A' }), evidence(2, { trustTier: 'T10', title: 'B' })] })];
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: tiers } } })).success).toBe(true);
    const textual = [claim(1, { evidence: [evidence(2, { trustTier: 'T10', title: 'B' }), evidence(1, { trustTier: 'T2', title: 'A' })] })];
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: textual } } })).success).toBe(false);
    // Case is never folded: the order is by code unit, the same on every device.
    const caseOrder = [claim(1, { claimKey: 'Zed' }), claim(2, { claimKey: 'alpha' })];
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: caseOrder } } })).success).toBe(true);
  });

  it('bounds claims and evidence', () => {
    const many = Array.from({ length: DETAIL_MAX_CLAIMS + 1 }, (_, n) => claim(n, { claimKey: `k${String(n).padStart(3, '0')}` }));
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: many } } })).success).toBe(false);
    const evidences = Array.from({ length: DETAIL_MAX_EVIDENCE_PER_CLAIM + 1 }, (_, n) => evidence(n, { title: `T${String(n).padStart(3, '0')}` }));
    expect(ProductDetailSchema.safeParse(base({ claims: { state: 'published', content: { items: [claim(1, { evidence: evidences })] } } })).success).toBe(false);
  });

  it('never substitutes a successor for a retired version', () => {
    const retired = ProductDetailSchema.parse(base({
      lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: id(32), brand: 'House Brand', productName: 'Gentle Shampoo', variant: 'Reformulated' } } },
    }));
    expect(retired.identity.versionId).toBe(id(31));
    expect(retired.lifecycle.state).toBe('retired');
    // An active version cannot carry a successor; a successor never replaces the identity.
    expect(ProductDetailSchema.safeParse(base({ lifecycle: { state: 'active', successor: { state: 'published', version: { versionId: id(32), brand: 'a', productName: 'b', variant: null } } } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: id(31), brand: 'a', productName: 'b', variant: null } } } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ lifecycle: { state: 'retired', successor: { state: 'none' } } })).success).toBe(true);
    for (const state of ['not_published', 'under_review']) {
      expect(ProductDetailSchema.safeParse(base({ lifecycle: { state: 'retired', successor: { state } } })).success).toBe(true);
    }
  });

  it('carries ingredients as label text only, never as a capability or claim', () => {
    const parsed = ProductDetailSchema.parse(base({ ingredients: { state: 'published', content: { text: 'Aqua, Keratin' } } }));
    expect(parsed.ingredients).toEqual({ state: 'published', content: { text: 'Aqua, Keratin' } });
    expect(ProductDetailSchema.safeParse(base({ ingredients: { state: 'published', content: { text: 'Aqua', efficacy: 'repairs' } } })).success).toBe(false);
    expect(ProductDetailSchema.safeParse(base({ ingredients: { state: 'published', content: { text: '' } } })).success).toBe(false);
    expect(Object.keys(parsed)).not.toContain('capabilities');
  });

  it('is deeply immutable once parsed', () => {
    const parsed: ProductDetail = ProductDetailSchema.parse(base({ directions: { state: 'published', content: directions } }));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.identity)).toBe(true);
    expect(() => { (parsed.identity as { brand: string }).brand = 'x'; }).toThrow();
    if (parsed.directions.state === 'published') expect(Object.isFrozen(parsed.directions.content.incompatibilities)).toBe(true);
  });

  it('bounds directions fields', () => {
    const bad = [
      { ...directions, applicationOrder: 0 }, { ...directions, waitMinutes: -1 }, { ...directions, waitMinutes: 241 },
      { ...directions, rinseMode: 'sometimes' }, { ...directions, frequency: { count: 0, unit: 'week' } },
      { ...directions, frequency: { count: 1, unit: 'fortnight' } }, { ...directions, instructions: 'x'.repeat(2001) },
      { ...directions, incompatibilities: Array.from({ length: 21 }, () => 'x') },
    ];
    for (const content of bad) expect(ProductDetailSchema.safeParse(base({ directions: { state: 'published', content } })).success).toBe(false);
  });
});

describe('evidence classes', () => {
  it('names every source kind in its own words and never calls marketing independent', () => {
    expect(evidenceClass('regulator')).toBe('independent');
    expect(evidenceClass('peer_reviewed')).toBe('independent');
    expect(evidenceClass('professional_body')).toBe('independent');
    expect(evidenceClass('independent_testing')).toBe('independent');
    expect(evidenceClass('manufacturer')).toBe('manufacturer');
    expect(evidenceClass('formulation_inference')).toBe('inference');
    expect(evidenceClass('marketing')).toBe('marketing');
    for (const kind of ['consumer_signal', 'community_outcome', 'individual_anecdote'] as const) expect(evidenceClass(kind)).toBe('experience');
    const labels = ['regulator', 'peer_reviewed', 'professional_body', 'independent_testing', 'manufacturer', 'formulation_inference', 'marketing', 'consumer_signal', 'community_outcome', 'individual_anecdote'] as const;
    expect(new Set(labels.map(evidenceClassLabel)).size).toBe(labels.length);
    expect(evidenceClassLabel('marketing')).toMatch(/marketing/i);
    expect(evidenceClassLabel('marketing')).toMatch(/not independent/i);
    expect(evidenceClassLabel('formulation_inference')).toMatch(/inference/i);
    expect(evidenceClassLabel('individual_anecdote')).toMatch(/personal|individual/i);
    // 'Regulator or safety source' names a kind of source; no label promises that a product is safe.
    for (const kind of labels) expect(evidenceClassLabel(kind)).not.toMatch(/proof|proven|verified|recommend|is safe|safe to/i);
  });
});

describe('barrel', () => {
  it('is exported from the domain index', () => {
    expect(domain.ProductDetailSchema).toBe(ProductDetailSchema);
  });
});

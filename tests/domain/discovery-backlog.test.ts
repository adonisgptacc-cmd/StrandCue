import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DISCOVERY_CUTOFF_DATE,
  DiscoveryRowSchema,
  buildDiscoveryBacklog,
  classifySourceType,
  fingerprintDiscoveryRow,
  parseDiscoveryTable,
  type DiscoveryBatchInput,
  type DiscoverySourceBatch,
} from '../../packages/domain/src/discovery-backlog.ts';

// Every value below is synthetic except the read-only integration fixtures in
// the "count reconciliation" block, which read the untrusted third-party
// research batches from disk and assert parsed counts only.

const SYNTHETIC_ROW = {
  temporaryResearchId: 'ZA-SHAMPOO-0001',
  category: 'shampoo',
  brand: 'Synthetic Test Brand',
  listedName: 'Synthetic Test Shampoo',
  listedVariant: 'Synthetic Variant',
  listedSize: '250 ml',
  marketClaim: 'ZA',
  discoverySourceUrl: 'https://example.test/brand/synthetic-shampoo',
  discoverySourceType: 'brand_homepage',
  sourceCheckedAt: '2026-10-12',
  identityStatus: 'identity_unverified',
  exclusionReason: null,
  unresolvedQuestions: ['Synthetic open question'],
  sourceBatch: 'shampoo-batch-01',
  fingerprint: '0'.repeat(64),
} as const;

const rowWith = (overrides: Record<string, unknown>) => ({
  ...SYNTHETIC_ROW,
  ...overrides,
});

const EIGHTEEN_COL_HEADER =
  '| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |';
const EIGHTEEN_COL_SEP = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const TEN_COL_HEADER =
  '| ID | Brand | Product name (retailer title) | Format | Size | Retailer SKU | ZAR price | Retailer URL | Claim (verbatim) | Source IDs |';
const TEN_COL_SEP = '|---|---|---|---|---|---|---|---|---|---|';

describe('discovery backlog strict schema', () => {
  it('parses a minimal valid discovery row', () => {
    const parsed = DiscoveryRowSchema.parse(SYNTHETIC_ROW);
    expect(parsed.temporaryResearchId).toBe('ZA-SHAMPOO-0001');
  });

  it('accepts exactly the seven discovery states', () => {
    for (const identityStatus of [
      'discovered',
      'identity_unverified',
      'exact_za_identity_verified',
      'evidence_incomplete',
      'excluded_scope',
      'duplicate_candidate',
      'possible_reformulation',
    ]) {
      const candidate =
        identityStatus === 'excluded_scope'
          ? rowWith({ identityStatus, exclusionReason: 'Synthetic scope note' })
          : rowWith({ identityStatus });
      expect(() => DiscoveryRowSchema.parse(candidate)).not.toThrow();
    }
    expect(() => DiscoveryRowSchema.parse(rowWith({ identityStatus: 'draft' }))).toThrow();
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ identityStatus: 'identity_verified' })),
    ).toThrow();
  });

  it('rejects executable-separation forbidden fields', () => {
    for (const forbidden of [
      { catalogueId: 'b0000000-0000-4000-8000-000000000001' },
      { productVersionId: 'b0000000-0000-4000-8000-000000000002' },
      { capability: 'cleanse' },
      { proposedCapability: 'condition' },
      { executableCapability: 'cleanse' },
      { approvedEvidence: 'SRC-1' },
      { reviewer: 'Synthetic Reviewer' },
      { reviewerIdentity: 'Synthetic Reviewer' },
      { approvedBy: 'Synthetic Reviewer' },
      { publicationStatus: 'published' },
      { status: 'approved' },
      { price: 99.99 },
      { priceZar: 99.99 },
      { retailerPrice: 'R99.99' },
    ]) {
      expect(() => DiscoveryRowSchema.parse({ ...SYNTHETIC_ROW, ...forbidden })).toThrow();
    }
  });

  it('rejects a future sourceCheckedAt and accepts the cutoff day', () => {
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ sourceCheckedAt: '2026-10-12' })),
    ).not.toThrow();
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ sourceCheckedAt: '2026-10-13' })),
    ).toThrow();
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ sourceCheckedAt: 'not-a-date' })),
    ).toThrow();
    expect(DISCOVERY_CUTOFF_DATE).toBe('2026-10-12');
  });

  it('validates the discovery source URL structurally and allows null', () => {
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ discoverySourceUrl: null })),
    ).not.toThrow();
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ discoverySourceUrl: 'not a url' })),
    ).toThrow();
  });

  it('requires an excluded_scope row to carry a reason', () => {
    expect(() =>
      DiscoveryRowSchema.parse(rowWith({ identityStatus: 'excluded_scope', exclusionReason: null })),
    ).toThrow();
    expect(() =>
      DiscoveryRowSchema.parse(
        rowWith({ identityStatus: 'excluded_scope', exclusionReason: 'Scope note' }),
      ),
    ).not.toThrow();
  });
});

describe('discovery source tier classification', () => {
  it('classifies an exact official ZA manufacturer product page', () => {
    expect(classifySourceType('https://example-manufacturer.co.za/products/synthetic-serum-100ml')).toBe(
      'official_za_product_page',
    );
  });

  it('classifies another-market manufacturer product pages as non-ZA evidence', () => {
    expect(classifySourceType('https://example-manufacturer.com/products/synthetic-mask')).toBe(
      'another_market_manufacturer_page',
    );
  });

  it('downgrades brand homepages to homepage-only', () => {
    expect(classifySourceType('https://example-manufacturer.co.za/')).toBe('brand_homepage');
    expect(classifySourceType('https://example-manufacturer.com/')).toBe('brand_homepage');
  });

  it('classifies authorised distributor product pages', () => {
    expect(classifySourceType('https://limelighthb.co.za/product/H-EL-HDR-PAR-067')).toBe(
      'authorised_distributor',
    );
  });

  it('separates retailer product pages from retailer search feeds', () => {
    expect(classifySourceType('https://www.dischem.co.za/synthetic-product-12345')).toBe(
      'retailer_product_page',
    );
    expect(
      classifySourceType('https://www.dischem.co.za/catalogsearch/result/?q=synthetic'),
    ).toBe('retailer_search_feed');
  });

  it('never counts wikipedia or missing sources as manufacturer evidence', () => {
    expect(classifySourceType('https://en.wikipedia.org/wiki/Synthetic_Brand')).toBe(
      'inaccessible_unverified',
    );
    expect(classifySourceType(null)).toBe('inaccessible_unverified');
  });
});

describe('discovery table parsing', () => {
  it('parses an 18-column manufacturer-style product row', () => {
    const markdown = [
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      '| ZA-SHAMPOO-0001 | Synthetic Brand | Synthetic Shampoo Name | Aqua Variant | shampoo | 400 ml | ZA | null | active | https://example-brand.co.za/ | confirmed (retailer listing) | unverified | unverified | none observed | cleanse | insufficient_evidence | 2026-10-12 | GTIN still open |',
      '',
      '## OUTPUT 3 — SOURCE REGISTER',
    ].join('\n');
    const rows = parseDiscoveryTable('shampoo-batch-01', markdown);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      temporaryResearchId: 'ZA-SHAMPOO-0001',
      category: 'shampoo',
      brand: 'Synthetic Brand',
      listedName: 'Synthetic Shampoo Name',
      listedVariant: 'Aqua Variant',
      listedSize: '400 ml',
      sourceBatch: 'shampoo-batch-01',
    });
  });

  it('parses a 10-column retailer-style product row without importing price', () => {
    const markdown = [
      '## OUTPUT 2 — Product Table',
      '',
      TEN_COL_HEADER,
      TEN_COL_SEP,
      '| ZA-STYLING-0001 | Synthetic Brand | Synthetic Styling Gel 250ml | Gel | 250 ml | 000000000000000001 | 49.99 | https://www.dischem.co.za/catalogsearch/result/?q=styling | "Styling Gel" token | SRC-1 |',
      '',
      '## OUTPUT 7 — Human Follow-Up List',
    ].join('\n');
    const rows = parseDiscoveryTable('styling-batch-01', markdown);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      temporaryResearchId: 'ZA-STYLING-0001',
      category: 'styling',
      listedName: 'Synthetic Styling Gel 250ml',
      listedSize: '250 ml',
      sourceBatch: 'styling-batch-01',
    });
    expect(rows[0]).not.toHaveProperty('price');
    expect(rows[0]).not.toHaveProperty('priceZar');
  });

  it('keeps missing sizes and variants as null instead of inventing them', () => {
    const markdown = [
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      '| ZA-SCALP-0001 | Synthetic Brand | Synthetic Scalp Tonic | standard | scalp_care | size not stated in feed | ZA | null | active | https://example-brand.co.za/ | confirmed | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | Size on pack still open |',
      '',
      '## OUTPUT 3 — SOURCE REGISTER',
    ].join('\n');
    const rows = parseDiscoveryTable('scalp-batch-01', markdown);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.listedSize).toBeNull();
  });

  it('ignores pipe tables outside OUTPUT 2', () => {
    const markdown = [
      '## OUTPUT 5 — CONFLICT REPORT',
      '',
      '| ZA-SHAMPOO-0009 | Synthetic note, not a candidate row |',
      '',
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      '| ZA-SHAMPOO-0001 | Synthetic Brand | Synthetic Shampoo | V | shampoo | 100 ml | ZA | null | active | https://example-brand.co.za/ | confirmed | unverified | unverified | none | none | insufficient_evidence | 2026-10-12 | Open |',
    ].join('\n');
    const rows = parseDiscoveryTable('shampoo-batch-01', markdown);
    expect(rows.map(row => row.temporaryResearchId)).toEqual(['ZA-SHAMPOO-0001']);
  });
});

describe('discovery backlog builder', () => {
  const eighteenRow = (
    id: string,
    brand: string,
    name: string,
    variant: string,
    size: string,
    url: string,
  ) =>
    `| ${id} | ${brand} | ${name} | ${variant} | product | ${size} | ZA | null | active | ${url} | confirmed | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | Open |`;

  const batchWith = (batch: DiscoverySourceBatch, lines: string[]): DiscoveryBatchInput => ({
    sourceBatch: batch,
    markdown: [
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      ...lines,
      '',
      '## OUTPUT 3 — SOURCE REGISTER',
    ].join('\n'),
  });

  it('marks an exact normalized repeat as duplicate_candidate and keeps the first', () => {
    const first = batchWith('scalp-batch-01', [
      eighteenRow(
        'ZA-SCALP-0006',
        'Synthetic Brand',
        'Synthetic Scalp Serum',
        'Grow Variant',
        '60 ml',
        'https://example-brand.co.za/',
      ),
    ]);
    const second = batchWith('serumoil-batch-01', [
      eighteenRow(
        'ZA-SERUMOIL-0031',
        'Synthetic Brand',
        'Synthetic Scalp Serum',
        'Grow Variant',
        '60 ml',
        'https://example-brand.co.za/',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([first, second]);
    expect(backlog).toHaveLength(2);
    expect(backlog[0]?.identityStatus).not.toBe('duplicate_candidate');
    expect(backlog[1]?.identityStatus).toBe('duplicate_candidate');
  });

  it('keeps same-name different-size packs as separate candidates', () => {
    const batch = batchWith('shampoo-batch-01', [
      eighteenRow(
        'ZA-SHAMPOO-0001',
        'Synthetic Brand',
        'Synthetic Shampoo',
        '400 ml pack',
        '400 ml',
        'https://example-brand.co.za/',
      ),
      eighteenRow(
        'ZA-SHAMPOO-0002',
        'Synthetic Brand',
        'Synthetic Shampoo',
        '200 ml pack',
        '200 ml',
        'https://example-brand.co.za/',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    expect(backlog.map(row => row.identityStatus)).not.toContain('duplicate_candidate');
  });

  it('quarantines medicinal and disinfectant names to excluded_scope', () => {
    const batch = batchWith('shampoo-batch-01', [
      eighteenRow(
        'ZA-SHAMPOO-0043',
        'Synthetic Brand',
        'Synthetic Selenium Sulfide Shampoo',
        '2.5% variant',
        '50 ml',
        'https://example-brand.com/',
      ),
      eighteenRow(
        'ZA-SHAMPOO-0060',
        'Synthetic Brand',
        'Synthetic Anti-Fungal Shampoo',
        'standard',
        '200 ml',
        'https://example-brand.com/',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    for (const row of backlog) {
      expect(row.identityStatus).toBe('excluded_scope');
      expect(row.exclusionReason).not.toBeNull();
    }
  });

  it('excludes heated tools and industrial equipment from basic-wash scope', () => {
    const tools = batchWith('heatedtools-batch-01', [
      eighteenRow(
        'ZA-TOOL-0001',
        'Synthetic Brand',
        'Synthetic Flat Iron',
        'Standard',
        'unverified',
        'https://example-brand.com/za',
      ),
    ]);
    const industrial = batchWith('industrial-batch-01', [
      eighteenRow(
        'ZA-INDUSTRIAL-0001',
        'Synthetic Brand',
        'Synthetic Salon Dryer 2250W',
        'Standard',
        '2250 W',
        'https://limelighthb.co.za/product/SYNTH-001',
      ),
    ]);
    expect(buildDiscoveryBacklog([tools])[0]?.identityStatus).toBe('excluded_scope');
    expect(buildDiscoveryBacklog([industrial])[0]?.identityStatus).toBe('excluded_scope');
  });

  it('flags reformulation signals as possible_reformulation', () => {
    const markdown = [
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      '| ZA-MASK-0001 | Synthetic Brand | Synthetic Mask | Standard | mask | 250 ml | ZA | null | active | https://example-brand.com/products/synthetic-mask | confirmed | unverified | unverified | possible reformulation, new formula suspected | none | insufficient_evidence | 2026-10-12 | Confirm formula |',
      '',
      '## OUTPUT 3 — SOURCE REGISTER',
    ].join('\n');
    const backlog = buildDiscoveryBacklog([{ sourceBatch: 'masks-batch-01', markdown }]);
    expect(backlog[0]?.identityStatus).toBe('possible_reformulation');
  });

  it('marks another-market product pages in basic wash as evidence_incomplete', () => {
    const batch = batchWith('conditioner-batch-01', [
      eighteenRow(
        'ZA-CONDITIONER-0004',
        'Synthetic Brand',
        'Synthetic Conditioner',
        'Repair',
        '250 ml',
        'https://example-brand.com/products/synthetic-conditioner',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    expect(backlog[0]?.identityStatus).toBe('evidence_incomplete');
    expect(backlog[0]?.discoverySourceType).toBe('another_market_manufacturer_page');
  });

  it('downgrades brand-homepage-only rows to identity_unverified', () => {
    const batch = batchWith('leavein-batch-01', [
      eighteenRow(
        'ZA-LEAVEIN-0001',
        'Synthetic Brand',
        'Synthetic Leave-In',
        'Spray',
        '250 ml',
        'https://example-brand.co.za/',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    expect(backlog[0]?.identityStatus).toBe('identity_unverified');
  });

  it('withholds retailer price figures from free-text questions', () => {
    const markdown = [
      '## OUTPUT 2 — PRODUCT TABLE',
      '',
      EIGHTEEN_COL_HEADER,
      EIGHTEEN_COL_SEP,
      '| ZA-MASK-0001 | Synthetic Brand | Synthetic Mask | Standard | mask | 250 ml | ZA | null | active | https://example-brand.com/products/synthetic-mask | confirmed | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | Price R189.99 captured; confirm SKU identity |',
      '',
      '## OUTPUT 3 — SOURCE REGISTER',
    ].join('\n');
    const backlog = buildDiscoveryBacklog([{ sourceBatch: 'masks-batch-01', markdown }]);
    const text = JSON.stringify(backlog[0]?.unresolvedQuestions ?? []);
    expect(text).toContain('[price withheld]');
    expect(text).not.toContain('189.99');
  });

  it('excludes colour-chemistry names from cosmetic scope', () => {
    const batch = batchWith('masks-batch-01', [
      eighteenRow(
        'ZA-MASK-0001',
        'Synthetic Brand',
        'Synthetic Black Hair Dye',
        'Standard',
        '100 ml',
        'https://example-brand.com/products/synthetic-dye',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    expect(backlog[0]?.identityStatus).toBe('excluded_scope');
  });

  it('verifies exact official ZA product pages and discovers retailer product pages', () => {
    const zaBatch = batchWith('masks-batch-01', [
      eighteenRow(
        'ZA-MASK-0001',
        'Synthetic Brand',
        'Synthetic Mask',
        'Standard',
        '250 ml',
        'https://example-brand.co.za/products/synthetic-mask-250ml',
      ),
    ]);
    const zaBacklog = buildDiscoveryBacklog([zaBatch]);
    expect(zaBacklog[0]?.discoverySourceType).toBe('official_za_product_page');
    expect(zaBacklog[0]?.identityStatus).toBe('exact_za_identity_verified');

    const retailBatch = batchWith('masks-batch-01', [
      eighteenRow(
        'ZA-MASK-0002',
        'Synthetic Brand',
        'Synthetic Mask Variant',
        'Standard',
        '250 ml',
        'https://www.dischem.co.za/synthetic-mask-000000000000000001',
      ),
    ]);
    const retailBacklog = buildDiscoveryBacklog([retailBatch]);
    expect(retailBacklog[0]?.discoverySourceType).toBe('retailer_product_page');
    expect(retailBacklog[0]?.identityStatus).toBe('discovered');
  });

  it('produces stable deterministic fingerprints', () => {
    const batch = batchWith('masks-batch-01', [
      eighteenRow(
        'ZA-MASK-0001',
        'Synthetic Brand',
        'Synthetic Mask',
        'Standard',
        '250 ml',
        'https://example-brand.com/products/synthetic-mask',
      ),
    ]);
    const first = buildDiscoveryBacklog([batch]);
    const second = buildDiscoveryBacklog([batch]);
    expect(first[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint);
    expect(
      fingerprintDiscoveryRow({
        sourceBatch: 'masks-batch-01',
        temporaryResearchId: 'ZA-MASK-0001',
        brand: 'Synthetic Brand',
        listedName: 'Synthetic Mask',
        listedVariant: 'Standard',
        listedSize: '250 ml',
        discoverySourceUrl: 'https://example-brand.com/products/synthetic-mask',
      }),
    ).toBe(first[0]?.fingerprint);
  });

  it('proves executable separation on every built row', () => {
    const batch = batchWith('shampoo-batch-01', [
      eighteenRow(
        'ZA-SHAMPOO-0001',
        'Synthetic Brand',
        'Synthetic Shampoo',
        'Variant',
        '400 ml',
        'https://example-brand.co.za/',
      ),
    ]);
    const backlog = buildDiscoveryBacklog([batch]);
    const allowed = new Set([
      'temporaryResearchId',
      'category',
      'brand',
      'listedName',
      'listedVariant',
      'listedSize',
      'marketClaim',
      'discoverySourceUrl',
      'discoverySourceType',
      'sourceCheckedAt',
      'identityStatus',
      'exclusionReason',
      'unresolvedQuestions',
      'sourceBatch',
      'fingerprint',
    ]);
    for (const row of backlog) {
      expect(new Set(Object.keys(row))).toEqual(allowed);
      const text = JSON.stringify(row).toLowerCase();
      expect(text).not.toContain('cleanse');
      expect(text).not.toContain('condition');
      expect(text).not.toContain('approved');
      expect(text).not.toContain('published');
      expect(text).not.toContain('reviewer');
    }
  });
});

describe('discovery count reconciliation against source batches', () => {
  const catalogueDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'docs',
    'product',
    'discovery',
    'master-catalogue',
  );

  const readBatch = (file: string): DiscoveryBatchInput => ({
    sourceBatch: file.replace('.md', '') as DiscoverySourceBatch,
    markdown: readFileSync(join(catalogueDir, file), 'utf8'),
  });

  const EXPECTED_COUNTS: { file: string; count: number }[] = [
    { file: 'shampoo-batch-01.md', count: 62 },
    { file: 'conditioner-batch-01.md', count: 26 },
    { file: 'scalp-batch-01.md', count: 25 },
    { file: 'masks-batch-01.md', count: 35 },
    { file: 'styling-batch-01.md', count: 32 },
    { file: 'leavein-batch-01.md', count: 30 },
    { file: 'heatprotect-batch-01.md', count: 12 },
    { file: 'serumoil-batch-01.md', count: 43 },
    { file: 'heatedtools-batch-01.md', count: 17 },
    { file: 'industrial-batch-01.md', count: 31 },
  ];

  it('recomputes ten per-category OUTPUT 2 counts summing to 313', () => {
    let total = 0;
    for (const { file, count } of EXPECTED_COUNTS) {
      const rows = parseDiscoveryTable(
        file.replace('.md', '') as DiscoverySourceBatch,
        readFileSync(join(catalogueDir, file), 'utf8'),
      );
      expect(rows).toHaveLength(count);
      total += rows.length;
    }
    expect(total).toBe(313);
  });

  it('builds 313 schema-valid rows with unique temporary ids and fingerprints', () => {
    const backlog = buildDiscoveryBacklog(EXPECTED_COUNTS.map(({ file }) => readBatch(file)));
    expect(backlog).toHaveLength(313);
    for (const row of backlog) {
      expect(() => DiscoveryRowSchema.parse(row)).not.toThrow();
    }
    expect(new Set(backlog.map(row => row.temporaryResearchId)).size).toBe(313);
    expect(new Set(backlog.map(row => row.fingerprint)).size).toBe(313);
  });

  it('marks the documented cross-batch repeats as duplicate_candidate', () => {
    const backlog = buildDiscoveryBacklog(EXPECTED_COUNTS.map(({ file }) => readBatch(file)));
    const byId = new Map(backlog.map(row => [row.temporaryResearchId, row]));
    for (const id of [
      'ZA-SERUMOIL-0014',
      'ZA-SERUMOIL-0019',
      'ZA-SERUMOIL-0031',
      'ZA-SERUMOIL-0041',
      'ZA-SERUMOIL-0043',
    ]) {
      expect(byId.get(id)?.identityStatus).toBe('duplicate_candidate');
    }
  });

  it('quarantines the medicinal shampoo and disinfectant rows', () => {
    const backlog = buildDiscoveryBacklog(EXPECTED_COUNTS.map(({ file }) => readBatch(file)));
    const byId = new Map(backlog.map(row => [row.temporaryResearchId, row]));
    for (const id of ['ZA-SHAMPOO-0043', 'ZA-SHAMPOO-0044', 'ZA-SHAMPOO-0060']) {
      expect(byId.get(id)?.identityStatus).toBe('excluded_scope');
    }
    expect(byId.get('ZA-INDUSTRIAL-0031')?.identityStatus).toBe('excluded_scope');
  });
});

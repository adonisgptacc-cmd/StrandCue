import { describe, expect, it } from 'vitest';

import { CatalogueIntakeSchema } from '../../packages/domain/src/catalogue-intake.ts';

// All values below are synthetic fixtures for schema tests only. They name no
// real brand, product, tool, URL, GTIN, reviewer, or date.

const SYNTHETIC_PRODUCT = {
  recordId: 'b0000000-0000-4000-8000-000000000001',
  kind: 'product',
  brand: 'Synthetic Test Brand',
  productName: 'Synthetic Test Shampoo',
  variant: 'Synthetic Variant One',
  sizeOrPack: '250 ml',
  market: 'ZA',
  gtin: '6001234567890',
  category: 'shampoo',
  lifecycle: 'active',
  manufacturerUrl: 'https://example.test/manufacturer/synthetic-shampoo',
  labelImageRefs: [],
  identityNotes: null,
  status: 'draft',
} as const;

const SYNTHETIC_TOOL = {
  recordId: 'b0000000-0000-4000-8000-000000000101',
  kind: 'tool',
  brand: 'Synthetic Test Brand',
  modelName: 'Synthetic Test Dryer',
  versionLabel: 'Synthetic Version One',
  market: 'ZA',
  gtin: '6001234567891',
  toolType: 'dryer',
  lifecycle: 'active',
  manufacturerUrl: 'https://example.test/manufacturer/synthetic-dryer',
  labelImageRefs: [],
  identityNotes: null,
  status: 'draft',
} as const;

const intakeWith = (rows: unknown[], status = 'draft') => ({ status, rows });

describe('catalogue intake strict schema', () => {
  it('parses an empty awaiting_input intake document', () => {
    const parsed = CatalogueIntakeSchema.parse({ status: 'awaiting_input', rows: [] });
    expect(parsed.status).toBe('awaiting_input');
    expect(parsed.rows).toEqual([]);
  });

  it('rejects unknown fields on product rows, tool rows, and the document', () => {
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, extraField: 'nope' }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_TOOL, extraField: 'nope' }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse({ status: 'draft', rows: [], extraField: 'nope' }),
    ).toThrow();
  });

  it('trims names and enforces trimmed lengths', () => {
    const parsed = CatalogueIntakeSchema.parse(
      intakeWith([{ ...SYNTHETIC_PRODUCT, brand: '  Synthetic Test Brand  ' }]),
    );
    expect(parsed.rows[0]).toMatchObject({ brand: 'Synthetic Test Brand' });
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, brand: '' }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, brand: '   ' }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, brand: 'b'.repeat(201) }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, productName: 'p'.repeat(201) }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, variant: 'v'.repeat(201) }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_TOOL, modelName: 'm'.repeat(201) }]),
      ),
    ).toThrow();
  });

  it('accepts ZA and unknown markets but rejects anything else', () => {
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, market: 'ZA' }])),
    ).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, market: 'unknown' }])),
    ).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, market: 'US' }])),
    ).toThrow();
  });

  it('accepts only https manufacturer URLs, or an explicit null', () => {
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, manufacturerUrl: null }]),
      ),
    ).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, manufacturerUrl: 'http://example.test/plain' }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, manufacturerUrl: 'not-a-url' }]),
      ),
    ).toThrow();
  });

  it('treats GTIN as a string, never a number', () => {
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, gtin: 6001234567890 }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, gtin: '6001234567890' }]),
      ),
    ).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, gtin: null }])),
    ).not.toThrow();
  });

  it('rejects unknown product categories and tool types, and non-uuid record ids', () => {
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, category: 'gel' }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...SYNTHETIC_PRODUCT, category: 'conditioner' }]),
      ),
    ).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_TOOL, toolType: 'toaster' }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...SYNTHETIC_PRODUCT, recordId: 'not-a-uuid' }])),
    ).toThrow();
  });

  it('requires each recordId exactly once', () => {
    const duplicate = {
      ...SYNTHETIC_TOOL,
      recordId: SYNTHETIC_PRODUCT.recordId,
      brand: 'Another Synthetic Brand',
      modelName: 'Another Synthetic Model',
    };
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, duplicate])),
    ).toThrow();
  });

  it('requires each normalized identity tuple exactly once', () => {
    const duplicate = { ...SYNTHETIC_PRODUCT, recordId: 'b0000000-0000-4000-8000-000000000002' };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, duplicate]))).toThrow();
  });

  it('returns deeply immutable parsed values', () => {
    const parsed = CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT]));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.rows)).toBe(true);
    expect(Object.isFrozen(parsed.rows[0])).toBe(true);
    expect(Object.isFrozen((parsed.rows[0] as { labelImageRefs: unknown }).labelImageRefs)).toBe(
      true,
    );
  });

  it('keeps optional identity fields explicitly nullable', () => {
    const minimal = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000003',
      variant: null,
      sizeOrPack: null,
      gtin: null,
      manufacturerUrl: null,
      identityNotes: null,
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([minimal]))).not.toThrow();
    const minimalTool = {
      ...SYNTHETIC_TOOL,
      recordId: 'b0000000-0000-4000-8000-000000000102',
      gtin: null,
      manufacturerUrl: null,
      identityNotes: null,
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([minimalTool]))).not.toThrow();
  });

  it('rejects identity_verified rows missing variant identity or a manufacturer-or-label source', () => {
    const verified = { ...SYNTHETIC_PRODUCT, status: 'identity_verified' };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([verified]))).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([{ ...verified, variant: null }])),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...verified, manufacturerUrl: null, labelImageRefs: [] }]),
      ),
    ).toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([
          { ...verified, manufacturerUrl: null, labelImageRefs: ['labels/front.jpg'] },
        ]),
      ),
    ).not.toThrow();
    const verifiedTool = { ...SYNTHETIC_TOOL, status: 'identity_verified' };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([verifiedTool]))).not.toThrow();
    expect(() =>
      CatalogueIntakeSchema.parse(
        intakeWith([{ ...verifiedTool, manufacturerUrl: null, labelImageRefs: [] }]),
      ),
    ).toThrow();
  });
});

describe('catalogue intake identity collisions', () => {
  it('keeps the same name with a different variant as separate rows', () => {
    const second = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000011',
      variant: 'Synthetic Variant Two',
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, second]))).not.toThrow();
  });

  it('keeps the same variant in different markets as separate rows', () => {
    const second = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000012',
      market: 'unknown',
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, second]))).not.toThrow();
  });

  it('keeps the same name after reformulation as separate rows', () => {
    const reformulated = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000013',
      variant: 'Synthetic Variant One Reformulated',
    };
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, reformulated])),
    ).not.toThrow();
  });

  it('keeps the same product with a different manufacturer-confirmed formulation as separate rows', () => {
    const confirmed = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000014',
      manufacturerUrl: 'https://example.test/manufacturer/synthetic-shampoo-formulation-two',
    };
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, confirmed])),
    ).not.toThrow();
  });

  it('keeps shampoo versus conditioner as separate rows', () => {
    const conditioner = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000015',
      productName: 'Synthetic Test Wash Pair',
      category: 'conditioner',
    };
    const shampoo = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000016',
      productName: 'Synthetic Test Wash Pair',
      category: 'shampoo',
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([shampoo, conditioner]))).not.toThrow();
  });

  it('keeps the same tool model with a different version label as separate rows', () => {
    const second = {
      ...SYNTHETIC_TOOL,
      recordId: 'b0000000-0000-4000-8000-000000000103',
      versionLabel: 'Synthetic Version Two',
    };
    expect(() => CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_TOOL, second]))).not.toThrow();
  });

  it('detects duplicates across case and whitespace but never merges versions', () => {
    const duplicate = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000017',
      brand: '  synthetic   TEST brand ',
      productName: 'synthetic test SHAMPOO',
    };
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, duplicate])),
    ).toThrow();
    const otherVersion = {
      ...SYNTHETIC_PRODUCT,
      recordId: 'b0000000-0000-4000-8000-000000000018',
      brand: '  synthetic   TEST brand ',
      variant: 'Synthetic Variant Two',
    };
    expect(() =>
      CatalogueIntakeSchema.parse(intakeWith([SYNTHETIC_PRODUCT, otherVersion])),
    ).not.toThrow();
  });
});

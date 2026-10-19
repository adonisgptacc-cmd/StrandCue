import { describe, expect, it } from 'vitest';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CorrectUserProductCommandSchema,
  CreateUserProductCommandSchema,
  LifecycleSchema,
  MatchUserProductCommandSchema,
  ProductClaimSchema,
  ProvenanceSourceSchema,
  QuantityBandSchema,
  RepurchaseIntentSchema,
  ShelfAvailabilitySchema,
  TrustTierSchema,
  VerificationEventSchema,
  VerificationStatusSchema,
  compareTrustTiers,
  isEvidenceTier,
} from '../../packages/domain/src/shelf.ts';

describe('shelf verification and provenance domain', () => {
  it('keeps verification and lifecycle as separate dimensions', () => {
    for (const status of ['unverified', 'pending_verification', 'partially_verified', 'verified', 'conflicting_information']) {
      expect(() => VerificationStatusSchema.parse(status)).not.toThrow();
    }
    expect(() => VerificationStatusSchema.parse('active')).toThrow();
    expect(() => VerificationStatusSchema.parse('retired')).toThrow();
    expect(() => VerificationStatusSchema.parse('scientifically_proven')).toThrow();
    for (const lifecycle of ['active', 'retired']) {
      expect(() => LifecycleSchema.parse(lifecycle)).not.toThrow();
    }
    expect(() => LifecycleSchema.parse('verified')).toThrow();
  });

  it('orders trust tiers T1 strongest to T10 weakest', () => {
    for (const tier of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']) {
      expect(() => TrustTierSchema.parse(tier)).not.toThrow();
    }
    expect(() => TrustTierSchema.parse('T0')).toThrow();
    expect(() => TrustTierSchema.parse('T11')).toThrow();
    expect(compareTrustTiers('T1', 'T10')).toBeLessThan(0);
    expect(compareTrustTiers('T5', 'T5')).toBe(0);
    expect(compareTrustTiers('T9', 'T4')).toBeGreaterThan(0);
  });

  it('never treats marketing-only claims as evidence', () => {
    expect(isEvidenceTier('T10')).toBe(false);
    for (const tier of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'] as const) {
      expect(isEvidenceTier(tier)).toBe(true);
    }
  });

  it('requires provenance on every source record', () => {
    const source = {
      sourceUrl: 'https://example.test/directions',
      archivedUrl: null,
      sourceType: 'manufacturer',
      trustTier: 'T5',
      market: 'ZA',
      firstSeen: '2024-01-01',
      lastChecked: '2024-06-01',
    };
    expect(() => ProvenanceSourceSchema.parse(source)).not.toThrow();
    expect(() => ProvenanceSourceSchema.parse({ ...source, sourceUrl: 'not-a-url' })).toThrow();
    expect(() => ProvenanceSourceSchema.parse({ ...source, trustTier: 'T0' })).toThrow();
    const { sourceUrl: _removed, ...withoutUrl } = source;
    expect(() => ProvenanceSourceSchema.parse(withoutUrl)).toThrow();
  });

  it('scopes verification to individual claims, never whole records', () => {
    const name = ProductClaimSchema.parse({
      id: '90000000-0000-4000-8000-000000000001',
      versionId: '90000000-0000-4000-8000-000000000002',
      claimKey: 'name',
      statement: 'Brand X Product Y',
      status: 'verified',
    });
    const ingredients = ProductClaimSchema.parse({
      id: '90000000-0000-4000-8000-000000000003',
      versionId: '90000000-0000-4000-8000-000000000002',
      claimKey: 'ingredients',
      statement: null,
      status: 'unverified',
    });
    // A verified name does not verify ingredients; each claim carries its own status.
    expect(name.status).toBe('verified');
    expect(ingredients.status).toBe('unverified');
    expect(ingredients.statement).toBeNull();
  });

  it('requires reviewed fields and a reason on verification events', () => {
    const event = {
      id: '90000000-0000-4000-8000-000000000010',
      versionId: '90000000-0000-4000-8000-000000000002',
      reviewedFields: ['name', 'category'],
      status: 'verified',
      reason: 'Matched manufacturer insert, archived.',
      sourceIds: ['90000000-0000-4000-8000-000000000011'],
      recordedAt: '2024-06-02T10:00:00.000Z',
    };
    expect(() => VerificationEventSchema.parse(event)).not.toThrow();
    expect(() => VerificationEventSchema.parse({ ...event, reviewedFields: [] })).toThrow();
    expect(() => VerificationEventSchema.parse({ ...event, reason: '' })).toThrow();
    expect(() => VerificationEventSchema.parse({ ...event, reason: 'a'.repeat(501) })).toThrow();
  });

  it('accepts manual-only products and catalogue links, but not empty entries', () => {
    const manual = {
      operationId: '90000000-0000-4000-8000-000000000020',
      userProductId: '90000000-0000-4000-8000-000000000021',
      versionId: null,
      manualBrand: 'House brand',
      manualName: 'Gentle shampoo',
      manualCategory: 'shampoo',
      availability: 'available',
      notes: null,
    };
    expect(() => CreateUserProductCommandSchema.parse(manual)).not.toThrow();
    const linked = { ...manual, versionId: '90000000-0000-4000-8000-000000000022', manualBrand: null, manualName: null, manualCategory: null };
    expect(() => CreateUserProductCommandSchema.parse(linked)).not.toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...manual, manualName: null })).toThrow();
  });

  it('requires explicit confirmation to match a manual entry to the catalogue', () => {
    const match = {
      operationId: '90000000-0000-4000-8000-000000000030',
      userProductId: '90000000-0000-4000-8000-000000000021',
      expectedRevision: 1,
      versionId: '90000000-0000-4000-8000-000000000022',
      confirmed: true,
    };
    expect(() => MatchUserProductCommandSchema.parse(match)).not.toThrow();
    expect(() => MatchUserProductCommandSchema.parse({ ...match, confirmed: false })).toThrow();
    expect(() => MatchUserProductCommandSchema.parse({ ...match, versionId: null })).toThrow();
  });

  it('validates change and archive commands', () => {
    expect(() => ChangeUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000040',
      userProductId: '90000000-0000-4000-8000-000000000021',
      expectedRevision: 1,
      availability: 'low',
      notes: 'Finished the bottle',
    })).not.toThrow();
    expect(() => ChangeUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000040',
      userProductId: '90000000-0000-4000-8000-000000000021',
      expectedRevision: 0,
      availability: 'available',
      notes: null,
    })).toThrow();
    expect(() => ArchiveUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000050',
      userProductId: '90000000-0000-4000-8000-000000000021',
      expectedRevision: 2,
    })).not.toThrow();
  });

  it('rejects notes longer than 2000 UTF-16 units', () => {
    expect(() => CreateUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000020',
      userProductId: '90000000-0000-4000-8000-000000000021',
      versionId: null,
      manualBrand: 'House brand',
      manualName: 'Gentle shampoo',
      manualCategory: 'shampoo',
      availability: 'available',
      notes: 'a'.repeat(2001),
    })).toThrow();
  });
});

describe('the owned-product Shelf contract', () => {
  const base = {
    operationId: '90000000-0000-4000-8000-000000000061',
    userProductId: '90000000-0000-4000-8000-000000000062',
    versionId: null,
    manualBrand: 'House brand',
    manualName: 'Gentle shampoo',
    manualCategory: 'shampoo',
    availability: 'available',
    notes: null,
  };

  it('accepts a manual product with no catalogue identity', () => {
    const command = CreateUserProductCommandSchema.parse(base);
    expect(command.versionId).toBeNull();
    expect(command.manualName).toBe('Gentle shampoo');
  });

  it('accepts the whole manual identity the owner entered', () => {
    const command = CreateUserProductCommandSchema.parse({
      ...base,
      manualVariant: 'Fragrance free',
      manualSize: '400 ml',
      manualBarcode: '6001234567890',
    });
    expect(command.manualVariant).toBe('Fragrance free');
    expect(command.manualSize).toBe('400 ml');
    expect(command.manualBarcode).toBe('6001234567890');
  });

  it('accepts every shelf availability state and refuses any other', () => {
    for (const availability of ['available', 'low', 'empty', 'archived']) {
      expect(CreateUserProductCommandSchema.parse({ ...base, availability }).availability).toBe(availability);
    }
    expect(() => CreateUserProductCommandSchema.parse({ ...base, availability: 'out_of_stock' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, availability: 'finished' })).toThrow();
  });

  it('records an opened date with day, month, year and unknown precision', () => {
    for (const openedOn of [
      { precision: 'day', value: '2026-03-01' },
      { precision: 'month', value: '2026-03' },
      { precision: 'year', value: '2026' },
      { precision: 'unknown', value: null },
    ]) {
      expect(CreateUserProductCommandSchema.parse({ ...base, openedOn }).openedOn).toEqual(openedOn);
    }
  });

  it('refuses an impossible opened date and an opened date in the future', () => {
    expect(() => CreateUserProductCommandSchema.parse({ ...base, openedOn: { precision: 'day', value: '2026-02-30' } })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, openedOn: { precision: 'day', value: '2099-01-01' } })).toThrow();
  });

  it('keeps an explicit unknown distinct from an omitted optional fact', () => {
    const omitted = CreateUserProductCommandSchema.parse(base);
    expect('quantityBand' in omitted).toBe(false);
    expect('repurchaseIntent' in omitted).toBe(false);
    expect('pao' in omitted).toBe(false);
    const explicit = CreateUserProductCommandSchema.parse({
      ...base,
      quantityBand: 'unknown',
      repurchaseIntent: 'unsure',
      pao: null,
    });
    expect(explicit.quantityBand).toBe('unknown');
    expect(explicit.repurchaseIntent).toBe('unsure');
    expect(explicit.pao).toBeNull();
  });

  it('records an expiry date and a period-after-opening without inventing one', () => {
    const command = CreateUserProductCommandSchema.parse({
      ...base,
      expiryOn: '2027-06-30',
      pao: '12 months after opening',
    });
    expect(command.expiryOn).toBe('2027-06-30');
    expect(command.pao).toBe('12 months after opening');
  });

  it('rejects whitespace-only and overlong owner-entered text', () => {
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualVariant: '   ' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualVariant: 'v'.repeat(201) })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualSize: '  ' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualBarcode: 'b'.repeat(101) })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, pao: 'p'.repeat(201) })).toThrow();
  });

  it('lets the owner change the facts they recorded without touching the identity', () => {
    const command = ChangeUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000063',
      userProductId: '90000000-0000-4000-8000-000000000062',
      expectedRevision: 2,
      availability: 'low',
      openedOn: { precision: 'month', value: '2026-02' },
      quantityBand: 'about-half',
      repurchaseIntent: 'would-rebuy',
    });
    expect(command.availability).toBe('low');
    expect(command.openedOn).toEqual({ precision: 'month', value: '2026-02' });
    expect('manualName' in command).toBe(false);
    expect('manualBrand' in command).toBe(false);
  });

  it('refuses the retired availability state and any invented one', () => {
    for (const command of [CreateUserProductCommandSchema, ChangeUserProductCommandSchema]) {
      expect(() => command.parse({ ...base, availability: 'out_of_stock' })).toThrow();
      expect(() => command.parse({ ...base, availability: 'finished' })).toThrow();
    }
  });

  it('refuses blank and overlong owner text in the identity and the notes', () => {
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualBrand: '   ' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualName: '   ' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, notes: '   ' })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, manualBrand: 'b'.repeat(201) })).toThrow();
    expect(() => CreateUserProductCommandSchema.parse({ ...base, notes: 'n'.repeat(2001) })).toThrow();
  });

  it('replaces a wrong identity only through the append-only correction path', () => {
    const correction = CorrectUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000064',
      userProductId: '90000000-0000-4000-8000-000000000062',
      expectedRevision: 2,
      correctsId: '90000000-0000-4000-8000-000000000065',
      reason: 'The name was typed wrong.',
      manualBrand: 'House brand',
      manualName: 'Gentle shampoo (fragrance free)',
      manualCategory: 'shampoo',
    });
    expect(correction.correctsId).toBe('90000000-0000-4000-8000-000000000065');
    expect(correction.reason).toBe('The name was typed wrong.');
    // A correction always explains itself and always names what it replaces.
    expect(() => CorrectUserProductCommandSchema.parse({ ...correction, reason: '   ' })).toThrow();
    expect(() => CorrectUserProductCommandSchema.parse({ ...correction, correctsId: null })).toThrow();
    expect(() => CorrectUserProductCommandSchema.parse({ ...correction, manualName: '   ' })).toThrow();
  });

  it('keeps the owner-facing vocabularies explicit', () => {
    expect(ShelfAvailabilitySchema.options).toEqual(['available', 'low', 'empty', 'archived']);
    expect(QuantityBandSchema.options).toContain('unknown');
    expect(RepurchaseIntentSchema.options).toContain('unknown');
    expect(RepurchaseIntentSchema.options).toContain('unsure');
    expect(() => QuantityBandSchema.parse('most')).toThrow();
    expect(() => RepurchaseIntentSchema.parse('maybe')).toThrow();
  });
});
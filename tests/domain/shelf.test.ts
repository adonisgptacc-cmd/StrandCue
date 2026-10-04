import { describe, expect, it } from 'vitest';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CreateUserProductCommandSchema,
  LifecycleSchema,
  MatchUserProductCommandSchema,
  ProductClaimSchema,
  ProvenanceSourceSchema,
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
      availability: 'out_of_stock',
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

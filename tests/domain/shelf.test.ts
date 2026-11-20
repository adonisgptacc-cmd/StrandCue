import { describe, expect, it } from 'vitest';

import {
  ArchiveUserProductCommandSchema,
  ChangeUserProductCommandSchema,
  CorrectUserProductCommandSchema,
  CORRECTION_IDENTITY_CHANGE_RULE,
  CORRECTION_IDENTITY_RULE,
  correctionChangesIdentity,
  correctionTargetRevision,
  CreateUserProductCommandSchema,
  LifecycleSchema,
  MatchUserProductCommandSchema,
  ProductClaimSchema,
  ProvenanceSourceSchema,
  QuantityBandSchema,
  RepurchaseIntentSchema,
  ShelfAvailabilitySchema,
  ShelfRevision,
  TrustTierSchema,
  VerificationEventSchema,
  VerificationStatusSchema,
  compareTrustTiers,
  isEvidenceTier,
  shelfStateBefore,
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

  it('accepts a manual product, refuses a catalogue link and refuses an empty entry', () => {
    const manual = {
      operationId: '90000000-0000-4000-8000-000000000020',
      userProductId: '90000000-0000-4000-8000-000000000021',
      // The date the command takes effect: it is part of the command, so a
      // command that is retried later is the same command.
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      versionId: null,
      manualBrand: 'House brand',
      manualName: 'Gentle shampoo',
      manualCategory: 'shampoo',
      availability: 'available',
      notes: null,
    };
    expect(() => CreateUserProductCommandSchema.parse(manual)).not.toThrow();
    // A catalogue link is a confirmed match, so the command that records a
    // product for the first time never carries one.
    const linked = { ...manual, versionId: '90000000-0000-4000-8000-000000000022' };
    expect(() => CreateUserProductCommandSchema.parse(linked)).toThrow();
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
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      availability: 'low',
      notes: 'Finished the bottle',
    })).not.toThrow();
    expect(() => ChangeUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000040',
      userProductId: '90000000-0000-4000-8000-000000000021',
      expectedRevision: 0,
      effectiveDate: { precision: 'day', value: '2026-03-01' },
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
      effectiveDate: { precision: 'day', value: '2026-03-01' },
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
    // The date the command takes effect: it is part of the command, so a
    // command that is retried later is the same command.
    effectiveDate: { precision: 'day', value: '2026-03-01' },
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
      effectiveDate: { precision: 'day', value: '2026-03-01' },
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
      effectiveDate: { precision: 'day', value: '2026-03-01' },
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

describe('the revision a correction may replace', () => {
  const identityPatch = { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo' };
  const emptyPatch = { manualBrand: null, manualName: null, manualCategory: null };

  const entry = (overrides: Partial<ShelfRevision> = {}): ShelfRevision => ({
    id: '90000000-0000-4000-8000-000000000070',
    kind: 'baseline',
    correctsId: null,
    patch: identityPatch,
    ...overrides,
  });

  it('targets the revision that carries the identity, whatever came after it', () => {
    // A catalogue match, an availability change, an archive and a fact-only
    // change never carry the identity, so none of them is the target.
    const after = [
      entry(),
      entry({ id: '90000000-0000-4000-8000-000000000071', kind: 'match', patch: { ...emptyPatch, matchVersionId: '90000000-0000-4000-8000-000000000072' } }),
      entry({ id: '90000000-0000-4000-8000-000000000073', kind: 'change', patch: { ...emptyPatch, availability: 'low' } }),
      entry({ id: '90000000-0000-4000-8000-000000000074', kind: 'change', patch: { ...emptyPatch, quantityBand: 'about-half' } }),
      entry({ id: '90000000-0000-4000-8000-000000000075', kind: 'archive', patch: { ...emptyPatch, availability: 'archived' } }),
    ];
    expect(correctionTargetRevision(after)?.id).toBe('90000000-0000-4000-8000-000000000070');
  });

  it('targets the correction itself once the entry it replaced has one', () => {
    const chain = [
      entry(),
      entry({
        id: '90000000-0000-4000-8000-000000000076',
        kind: 'correction',
        correctsId: '90000000-0000-4000-8000-000000000070',
        patch: { ...identityPatch, manualName: 'Gentle shampoo bar' },
      }),
    ];
    expect(correctionTargetRevision(chain)?.id).toBe('90000000-0000-4000-8000-000000000076');
  });

  it('refuses a legacy-shaped change, match and archive, whatever their patch holds', () => {
    // A history written before the contract carries the three identity keys
    // on every revision, whatever the kind was. The rule reads the kind as
    // well as the shape of the patch, so a shape-only rule would let an
    // availability-only change, an archive and a match be targeted.
    const legacyPatch = { ...identityPatch, availability: 'low' };
    const revisions = [
      entry(),
      entry({ id: '90000000-0000-4000-8000-000000000080', kind: 'change', patch: legacyPatch }),
      entry({ id: '90000000-0000-4000-8000-000000000081', kind: 'match', patch: legacyPatch }),
      entry({ id: '90000000-0000-4000-8000-000000000082', kind: 'archive', patch: legacyPatch }),
    ];
    // The entry that carries the identity is still the target.
    expect(correctionTargetRevision(revisions)?.id).toBe('90000000-0000-4000-8000-000000000070');
    // And none of the legacy-shaped revisions is a target on its own.
    for (const kind of ['change', 'match', 'archive'] as const) {
      expect(correctionTargetRevision([
        entry({ id: '90000000-0000-4000-8000-000000000083', kind, patch: legacyPatch }),
      ])).toBeNull();
    }
  });

  it('has no target when no revision carries an identity', () => {
    expect(correctionTargetRevision([entry({ kind: 'match', patch: emptyPatch })])).toBeNull();
    expect(correctionTargetRevision([])).toBeNull();
    expect(correctionTargetRevision(undefined)).toBeNull();
  });

  it('requires a correction to carry at least one identity field', () => {
    const correction = {
      operationId: '90000000-0000-4000-8000-000000000064',
      userProductId: '90000000-0000-4000-8000-000000000062',
      expectedRevision: 2,
      correctsId: '90000000-0000-4000-8000-000000000065',
      reason: 'The name was typed wrong.',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
    };
    // A correction without an identity is not an identity correction.
    expect(() => CorrectUserProductCommandSchema.parse({ ...correction, manualVariant: 'Fragrance free' })).toThrow();
    // A correction that clears the brand still carries the identity.
    expect(CorrectUserProductCommandSchema.parse({ ...correction, manualBrand: null }).manualBrand).toBeNull();
    expect(CorrectUserProductCommandSchema.parse({ ...correction, manualName: 'Gentle shampoo bar' }).manualName).toBe('Gentle shampoo bar');
    // The wording is the owner's own, and the editor and the intro use it
    // too, so the rule the owner is refused by is the rule they were told.
    expect(CORRECTION_IDENTITY_RULE).toBe('A correction has to change the brand, the product name or the category.');
  });

  describe('the material change a correction has to make', () => {
    const current = { manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo' };

    it('refuses a correction that re-answers the identity with the same words', () => {
      expect(correctionChangesIdentity(current, { manualName: 'Gentle shampoo' })).toBe(false);
      expect(correctionChangesIdentity(current, { manualBrand: 'House brand' })).toBe(false);
      expect(correctionChangesIdentity(current, { manualCategory: 'shampoo' })).toBe(false);
      // The words are trimmed before they are compared, so stray spaces are
      // not a change.
      expect(correctionChangesIdentity(current, { manualBrand: '  House brand  ' })).toBe(false);
    });

    it('accepts a correction that changes one of the three', () => {
      expect(correctionChangesIdentity(current, { manualName: 'Gentle shampoo bar' })).toBe(true);
      expect(correctionChangesIdentity(current, { manualBrand: 'Another brand' })).toBe(true);
      expect(correctionChangesIdentity(current, { manualCategory: 'conditioner' })).toBe(true);
      // A different spelling is a different answer: the case is never folded.
      expect(correctionChangesIdentity(current, { manualName: 'gentle shampoo' })).toBe(true);
    });

    it('reads an explicit null over a recorded answer as a change, and over nothing as no change', () => {
      // Taking back an answer the owner gave changes the record.
      expect(correctionChangesIdentity(current, { manualName: null })).toBe(true);
      // Taking back an answer that was never given changes nothing.
      expect(correctionChangesIdentity({ ...current, manualCategory: null }, { manualCategory: null })).toBe(false);
    });

    it('never lets a related fact make a correction valid by itself', () => {
      expect(correctionChangesIdentity(current, { manualSize: '400 ml' })).toBe(false);
      expect(correctionChangesIdentity(current, { manualVariant: 'Fragrance free' })).toBe(false);
      expect(correctionChangesIdentity(current, { notes: 'a note the owner wrote' })).toBe(false);
      expect(correctionChangesIdentity(current, { quantityBand: 'about-half' })).toBe(false);
      // The identity is what has to change; the facts may come with it.
      expect(correctionChangesIdentity(current, { manualName: 'Gentle shampoo bar', manualSize: '400 ml' })).toBe(true);
    });

    it('reads a key the correction leaves out as preserved', () => {
      expect(correctionChangesIdentity(current, {})).toBe(false);
      expect(correctionChangesIdentity(current, { manualVariant: 'Fragrance free' })).toBe(false);
    });

    it('says the same thing the editor says', () => {
      expect(CORRECTION_IDENTITY_CHANGE_RULE).toBe('Change the brand, product name or category to record an identity correction.');
    });
  });

  describe('the state of a record before a correction', () => {
    const baseline = entry({
      patch: {
        manualBrand: 'House brand', manualName: 'Gentle shampoo', manualCategory: 'shampoo',
        manualSize: '400 ml', availability: 'available',
      },
    });
    const firstCorrection = entry({
      id: '90000000-0000-4000-8000-000000000071',
      kind: 'correction',
      correctsId: '90000000-0000-4000-8000-000000000070',
      patch: { manualName: 'Gentle shampoo bar' },
    });
    const secondCorrection = entry({
      id: '90000000-0000-4000-8000-000000000072',
      kind: 'correction',
      correctsId: '90000000-0000-4000-8000-000000000071',
      patch: { manualBrand: 'Another brand' },
    });

    it('replays the whole lineage, not only the entry the correction replaces', () => {
      // The entry the second correction replaces never mentions the size, so
      // reading that entry alone would say the owner never answered it.
      const state = shelfStateBefore([baseline, firstCorrection, secondCorrection], firstCorrection.id);
      expect(state?.manualSize).toBe('400 ml');
      expect(state?.manualName).toBe('Gentle shampoo bar');
      expect(state?.manualBrand).toBe('House brand');
    });

    it('answers the state the owner recorded before the first correction', () => {
      // The first correction replaces the entry the owner recorded, so the
      // state before it is the state that entry left behind.
      const state = shelfStateBefore([baseline, firstCorrection], baseline.id);
      expect(state?.manualName).toBe('Gentle shampoo');
      expect(state?.manualSize).toBe('400 ml');
    });

    it('forgets an answer the owner took back', () => {
      const cleared = entry({
        id: '90000000-0000-4000-8000-000000000073',
        kind: 'correction',
        correctsId: '90000000-0000-4000-8000-000000000070',
        patch: { manualSize: null },
      });
      const state = shelfStateBefore([baseline, cleared], cleared.id);
      expect(state?.manualSize).toBeUndefined();
      expect(state?.manualName).toBe('Gentle shampoo');
    });

    it('fails closed when the lineage cannot be walked', () => {
      expect(shelfStateBefore([baseline, firstCorrection], '90000000-0000-4000-8000-0000000000ff')).toBeNull();
      expect(shelfStateBefore([baseline], null)).toBeNull();
      expect(shelfStateBefore([], '90000000-0000-4000-8000-000000000070')).toBeNull();
      expect(shelfStateBefore(undefined, '90000000-0000-4000-8000-000000000070')).toBeNull();
      // A chain that points at an entry nobody holds is never guessed at.
      const broken = entry({
        id: '90000000-0000-4000-8000-000000000074',
        kind: 'correction',
        correctsId: '90000000-0000-4000-8000-0000000000fe',
        patch: { manualName: 'Gentle shampoo bar' },
      });
      expect(shelfStateBefore([baseline, broken], broken.id)).toBeNull();

      // A map must never silently choose one of two entries with the same
      // identity. That would make the answer depend on array order.
      const duplicate = entry({
        id: baseline.id,
        patch: { manualName: 'A different product' },
      });
      expect(shelfStateBefore([baseline, duplicate], baseline.id)).toBeNull();

      // A correction can only replace an entry already recorded. A forward
      // reference is malformed history even when the referenced ID appears
      // later in the response.
      expect(shelfStateBefore([firstCorrection, baseline], firstCorrection.id)).toBeNull();

      // Every entry applied during replay must be readable, even when it is
      // not part of the selected target's own correction chain.
      const unrelatedBroken = entry({
        id: '90000000-0000-4000-8000-000000000075',
        kind: 'correction',
        correctsId: '90000000-0000-4000-8000-0000000000fd',
        patch: { manualSize: null },
      });
      expect(shelfStateBefore([baseline, unrelatedBroken, firstCorrection], firstCorrection.id)).toBeNull();
    });
  });

  it('carries the effective date in the command, so a retry is the same command', () => {
    const command = CorrectUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000064',
      userProductId: '90000000-0000-4000-8000-000000000062',
      expectedRevision: 2,
      correctsId: '90000000-0000-4000-8000-000000000065',
      reason: 'The name was typed wrong.',
      effectiveDate: { precision: 'day', value: '2026-03-01' },
      manualName: 'Gentle shampoo bar',
    });
    // The date the command carries is the date it was built with: a command
    // that is retried later sends the same payload.
    expect(command.effectiveDate).toEqual({ precision: 'day', value: '2026-03-01' });
    // A command without a date has no date to replay.
    expect(() => CorrectUserProductCommandSchema.parse({
      operationId: '90000000-0000-4000-8000-000000000064',
      userProductId: '90000000-0000-4000-8000-000000000062',
      expectedRevision: 2,
      correctsId: '90000000-0000-4000-8000-000000000065',
      reason: 'The name was typed wrong.',
      manualName: 'Gentle shampoo bar',
    })).toThrow();
  });
});

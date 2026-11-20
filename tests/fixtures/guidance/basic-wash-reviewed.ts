/**
 * Isolated reviewed test data for the draft `basic_wash` rule.
 *
 * Every identity below is synthetic and labelled as a fixture: the version ids
 * stand in for catalogue rows that do not exist, the people stand in for a
 * reviewer and an author who never acted, and the evidence urls are
 * unresolvable `.invalid` addresses. Nothing here may move into a production
 * file; production stays fail-closed with zero approved mappings until a human
 * approval gate records real ones.
 */

export const FIXTURE_CLEANSE_VERSION_ID = '33333333-3333-4333-8333-333333333333';
export const FIXTURE_CONDITION_VERSION_ID = '44444444-4444-4344-8344-444444444444';

export const FIXTURE_CLEANSE_EVIDENCE_ID = 'fixture-evidence-cleanse';
export const FIXTURE_CONDITION_EVIDENCE_ID = 'fixture-evidence-condition';
export const FIXTURE_ORDER_EVIDENCE_ID = 'fixture-evidence-basic-wash-order';
export const FIXTURE_MARKETING_CLEANSE_EVIDENCE_ID = 'fixture-evidence-marketing-cleanse';
export const FIXTURE_MARKETING_CONDITION_EVIDENCE_ID = 'fixture-evidence-marketing-condition';

export const FIXTURE_EVIDENCE_REGISTRY_ID = 'fixture-basic-wash-evidence-registry';
export const FIXTURE_CAPABILITY_REVIEW_ID = 'fixture-basic-wash-capability-review';
export const FIXTURE_BUNDLE_ID = 'fixture-basic-wash-bundle';

const REVIEWED_AT = '2026-10-01T00:00:00.000Z';

/**
 * The draft `basic_wash` route, written in the existing typed DSL only:
 * `cleanse` is required, `condition` is required, and `cleanse` is ordered
 * before `condition`. No tool effect appears, so no tool may be required.
 */
export const BASIC_WASH_RULE = {
  ruleId: 'basic-wash-cleanse-condition',
  versionId: '1',
  status: 'published',
  strength: 'hard',
  condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
  effects: [
    { kind: 'require_capability', capability: 'cleanse' },
    { kind: 'require_capability', capability: 'condition' },
    { kind: 'order_before', before: 'cleanse', after: 'condition' },
  ],
  reason: 'A basic wash cleanses first and then conditions; no tool is required.',
  evidenceIds: [FIXTURE_ORDER_EVIDENCE_ID],
};

export function basicWashCleanseProduct(overrides: Record<string, unknown> = {}) {
  return {
    productId: 'fixture-basic-wash-cleanser',
    versionId: FIXTURE_CLEANSE_VERSION_ID,
    name: 'Fixture Basic-Wash Cleanser',
    owned: true,
    available: true,
    verifiedCapabilities: ['cleanse'],
    unknownCapabilities: [],
    ...overrides,
  };
}

export function basicWashConditionProduct(overrides: Record<string, unknown> = {}) {
  return {
    productId: 'fixture-basic-wash-conditioner',
    versionId: FIXTURE_CONDITION_VERSION_ID,
    name: 'Fixture Basic-Wash Conditioner',
    owned: true,
    available: true,
    verifiedCapabilities: ['condition'],
    unknownCapabilities: [],
    ...overrides,
  };
}

export function basicWashContext(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'request-fixture-basic-wash',
    asOf: '2026-10-11T09:00:00.000Z',
    goal: 'basic_wash',
    profileFacts: { pattern: 'coily' },
    products: [basicWashCleanseProduct(), basicWashConditionProduct()],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [BASIC_WASH_RULE],
    ...overrides,
  };
}

/** One reviewed evidence record about one exact fixture catalogue version. */
export function basicWashEvidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: FIXTURE_CLEANSE_EVIDENCE_ID,
    sourceType: 'independent_testing',
    trustTier: 'T3',
    title: 'Synthetic independent test report recorded for this fixture only',
    sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-cleanse',
    archivedUrl: null,
    publisher: 'Synthetic fixture publisher',
    market: 'ZA',
    versionIds: [FIXTURE_CLEANSE_VERSION_ID],
    claim: 'Synthetic fixture claim about this exact catalogue version.',
    limitations: 'Synthetic fixture limitations; establishes nothing outside this test.',
    checkedAt: REVIEWED_AT,
    authoredBy: 'I. Fixture-Evidence-Author',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'I. Fixture-Evidence-Reviewer',
    status: 'reviewed',
    ...overrides,
  };
}

export function basicWashEvidenceRegistry(overrides: Record<string, unknown> = {}) {
  return {
    registryId: FIXTURE_EVIDENCE_REGISTRY_ID,
    version: '1',
    records: [
      basicWashEvidenceRecord(),
      basicWashEvidenceRecord({
        evidenceId: FIXTURE_CONDITION_EVIDENCE_ID,
        title: 'Synthetic independent test report for the fixture conditioner version',
        sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-condition',
        versionIds: [FIXTURE_CONDITION_VERSION_ID],
      }),
      basicWashEvidenceRecord({
        evidenceId: FIXTURE_ORDER_EVIDENCE_ID,
        title: 'Synthetic guidance source recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-order',
        // A washing-order claim is not a claim about one catalogue version.
        versionIds: [],
        claim: 'Synthetic fixture claim about the order of a wash.',
      }),
    ],
    ...overrides,
  };
}

/**
 * A registry where both capability approvals rest only on marketing (T10).
 * The records stay `draft` so the registry parses and the review layer can
 * name the finding; neither record may support published content.
 */
export function basicWashMarketingOnlyRegistry() {
  return basicWashEvidenceRegistry({
    records: [
      basicWashEvidenceRecord({
        evidenceId: FIXTURE_MARKETING_CLEANSE_EVIDENCE_ID,
        sourceType: 'marketing',
        trustTier: 'T10',
        title: 'Synthetic manufacturer marketing page recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-marketing-cleanse',
        publisher: 'Synthetic fixture marketing publisher',
        reviewedAt: null,
        reviewedBy: null,
        status: 'draft',
      }),
      basicWashEvidenceRecord({
        evidenceId: FIXTURE_MARKETING_CONDITION_EVIDENCE_ID,
        sourceType: 'marketing',
        trustTier: 'T10',
        title: 'Synthetic manufacturer marketing page recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-marketing-condition',
        publisher: 'Synthetic fixture marketing publisher',
        versionIds: [FIXTURE_CONDITION_VERSION_ID],
        reviewedAt: null,
        reviewedBy: null,
        status: 'draft',
      }),
      basicWashEvidenceRecord({
        evidenceId: FIXTURE_ORDER_EVIDENCE_ID,
        title: 'Synthetic guidance source recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/basic-wash-order',
        versionIds: [],
        claim: 'Synthetic fixture claim about the order of a wash.',
      }),
    ],
  });
}

export function basicWashReviewRow(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: FIXTURE_CLEANSE_VERSION_ID,
    capability: 'cleanse',
    supportingEvidenceIds: [FIXTURE_CLEANSE_EVIDENCE_ID],
    contradictedByEvidenceIds: [],
    decision: 'approved',
    rationale: 'Synthetic fixture rationale recorded for this decision.',
    authoredBy: 'I. Fixture-Row-Author',
    reviewedBy: 'I. Fixture-Row-Reviewer',
    reviewedAt: REVIEWED_AT,
    ...overrides,
  };
}

export function basicWashCapabilityReview(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: FIXTURE_CAPABILITY_REVIEW_ID,
    version: '1',
    rows: [
      basicWashReviewRow(),
      basicWashReviewRow({
        versionId: FIXTURE_CONDITION_VERSION_ID,
        capability: 'condition',
        supportingEvidenceIds: [FIXTURE_CONDITION_EVIDENCE_ID],
      }),
    ],
    ...overrides,
  };
}

export function basicWashInventory() {
  return {
    rows: [
      { kind: 'product', versionId: FIXTURE_CLEANSE_VERSION_ID },
      { kind: 'product', versionId: FIXTURE_CONDITION_VERSION_ID },
    ],
  };
}

export function basicWashCapabilityEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: FIXTURE_CLEANSE_VERSION_ID,
    displayName: 'Synthetic fixture cleanser',
    verifiedCapabilities: ['cleanse'],
    evidenceIds: [FIXTURE_CLEANSE_EVIDENCE_ID],
    status: 'published',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'I. Fixture-Entry-Reviewer',
    authoredBy: 'I. Fixture-Entry-Author',
    ...overrides,
  };
}

/** A version `2` bundle: the reviewed-content contract, fully populated. */
export function basicWashPublishedBundle(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: FIXTURE_BUNDLE_ID,
    version: '2',
    status: 'published',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'I. Fixture-Bundle-Reviewer',
    authoredBy: 'I. Fixture-Bundle-Author',
    evidenceRegistryId: FIXTURE_EVIDENCE_REGISTRY_ID,
    evidenceRegistryVersion: '1',
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['pattern'] }],
    capabilities: [
      basicWashCapabilityEntry(),
      basicWashCapabilityEntry({
        versionId: FIXTURE_CONDITION_VERSION_ID,
        displayName: 'Synthetic fixture conditioner',
        verifiedCapabilities: ['condition'],
        evidenceIds: [FIXTURE_CONDITION_EVIDENCE_ID],
      }),
    ],
    rules: [BASIC_WASH_RULE],
    ...overrides,
  };
}

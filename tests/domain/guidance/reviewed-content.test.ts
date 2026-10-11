import { describe, expect, it } from 'vitest';

import { validatePublishedBundle } from '../../../packages/domain/src/guidance/reviewed-content.ts';
import { CURRENT_REVIEWED_BUNDLE } from '../../../apps/mobile/src/guidance/reviewed-bundle.ts';
import { CHECKED_IN_CAPABILITY_REVIEW } from '../../../apps/mobile/src/guidance/capability-review.ts';
import { CHECKED_IN_EVIDENCE_REGISTRY } from '../../../apps/mobile/src/guidance/evidence-registry.ts';

const NOW = '2026-10-11T09:00:00.000Z';
const ISO = '2026-10-01T00:00:00.000Z';

/**
 * Synthetic identities and catalogue ids used by the publication tests only.
 *
 * Every value below stands in for a real person or a real catalogue row. They
 * are labelled as fixtures so that a future test can never mistake one for an
 * approved record, and they are not on the placeholder blocklist the evidence
 * schema refuses, because a refused placeholder would test the schema rather
 * than the gate.
 */
const PRODUCT_VERSION = '11111111-1111-4111-8111-111111111111';
const OTHER_VERSION = '22222222-2222-4222-8222-222222222222';
const REGISTRY_ID = 'fixture-evidence-registry';
const CLEANSE_EVIDENCE = 'fixture-evidence-cleanse';
const RULE_EVIDENCE = 'fixture-evidence-order';

const EVIDENCE_AUTHOR = 'I. Fixture-Author';
const EVIDENCE_REVIEWER = 'I. Fixture-Reviewer';
const BUNDLE_AUTHOR = 'I. Fixture-Compiler';
const BUNDLE_REVIEWER = 'I. Fixture-Approver';
const ENTRY_AUTHOR = 'I. Fixture-Entry-Author';
const ENTRY_REVIEWER = 'I. Fixture-Entry-Reviewer';
const ROW_AUTHOR = 'I. Fixture-Row-Author';
const ROW_REVIEWER = 'I. Fixture-Row-Reviewer';

function rule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-clean',
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
    effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }],
    reason: 'Reviewed reason for the fixture rule.',
    evidenceIds: ['evidence-fixture-1'],
    ...overrides,
  };
}

function capabilityEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: 'version-fixture-a',
    displayName: 'Synthetic fixture product',
    verifiedCapabilities: ['mild-cleanse'],
    evidenceIds: ['evidence-fixture-1'],
    status: 'published',
    reviewedAt: ISO,
    reviewedBy: 'reviewer-a',
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: 'bundle-fixture',
    version: '1',
    status: 'published',
    reviewedAt: ISO,
    reviewedBy: 'reviewer-a',
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['pattern'] }],
    capabilities: [capabilityEntry()],
    rules: [rule()],
    ...overrides,
  };
}

/** One reviewed evidence record about the exact fixture catalogue version. */
function evidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: CLEANSE_EVIDENCE,
    sourceType: 'independent_testing',
    trustTier: 'T3',
    title: 'Synthetic independent test report recorded for this fixture only',
    sourceUrl: 'https://strandcue.invalid/fixtures/independent-test',
    archivedUrl: null,
    publisher: 'Synthetic fixture publisher',
    market: 'ZA',
    versionIds: [PRODUCT_VERSION],
    claim: 'Synthetic fixture claim about this exact catalogue version.',
    limitations: 'Synthetic fixture limitations; establishes nothing outside this test.',
    checkedAt: ISO,
    authoredBy: EVIDENCE_AUTHOR,
    reviewedAt: ISO,
    reviewedBy: EVIDENCE_REVIEWER,
    status: 'reviewed',
    ...overrides,
  };
}

function evidenceRegistry(overrides: Record<string, unknown> = {}) {
  return {
    registryId: REGISTRY_ID,
    version: '1',
    records: [
      evidenceRecord(),
      evidenceRecord({
        evidenceId: RULE_EVIDENCE,
        title: 'Synthetic guidance source recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/order',
        // A washing-order claim is not a claim about one catalogue version.
        versionIds: [],
        claim: 'Synthetic fixture claim about the order of a wash.',
      }),
    ],
    ...overrides,
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    capability: 'cleanse',
    supportingEvidenceIds: [CLEANSE_EVIDENCE],
    contradictedByEvidenceIds: [],
    decision: 'approved',
    rationale: 'Synthetic fixture rationale recorded for this decision.',
    authoredBy: ROW_AUTHOR,
    reviewedBy: ROW_REVIEWER,
    reviewedAt: ISO,
    ...overrides,
  };
}

function capabilityReview(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: 'fixture-capability-review',
    version: '1',
    rows: [reviewRow()],
    ...overrides,
  };
}

function reviewedEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    displayName: 'Synthetic fixture product',
    verifiedCapabilities: ['cleanse'],
    evidenceIds: [CLEANSE_EVIDENCE],
    status: 'published',
    reviewedAt: ISO,
    reviewedBy: ENTRY_REVIEWER,
    authoredBy: ENTRY_AUTHOR,
    ...overrides,
  };
}

function reviewedRule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-order',
    versionId: '1',
    status: 'published',
    strength: 'hard',
    condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
    effects: [{ kind: 'require_capability', capability: 'cleanse' }],
    reason: 'Synthetic fixture reason for the wash order rule.',
    evidenceIds: [RULE_EVIDENCE],
    ...overrides,
  };
}

/** A version `2` bundle: the reviewed-content contract, fully populated. */
function reviewedBundle(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: 'bundle-fixture',
    version: '2',
    status: 'published',
    reviewedAt: ISO,
    reviewedBy: BUNDLE_REVIEWER,
    authoredBy: BUNDLE_AUTHOR,
    evidenceRegistryId: REGISTRY_ID,
    evidenceRegistryVersion: '1',
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['pattern'] }],
    capabilities: [reviewedEntry()],
    rules: [reviewedRule()],
    ...overrides,
  };
}

describe('publication gate', () => {
  it('returns the parsed bundle when it is published, evidenced and current', () => {
    const parsed = validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), NOW);
    expect(parsed.status).toBe('published');
    expect(parsed.bundleId).toBe('bundle-fixture');
  });

  it('refuses a draft bundle', () => {
    expect(() =>
      validatePublishedBundle(bundle({ status: 'draft' }), evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow(/published/i);
  });

  it('refuses a withdrawn bundle', () => {
    expect(() =>
      validatePublishedBundle(bundle({ status: 'withdrawn' }), evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow(/published/i);
  });

  it('refuses a bundle whose review is in the future', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ reviewedAt: '2026-12-01T00:00:00.000Z' }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/review/i);
  });

  it('refuses a malformed or unknown-shape bundle', () => {
    expect(() => validatePublishedBundle(null, evidenceRegistry(), capabilityReview(), NOW)).toThrow();
    expect(() =>
      validatePublishedBundle(bundle({ version: '99' }), evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow();
    expect(() =>
      validatePublishedBundle({ ...bundle(), surprise: true }, evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow();
  });

  it('refuses a published capability entry with no named reviewer', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ reviewedBy: '' })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/reviewer/i);
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ reviewedBy: undefined })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/reviewer/i);
  });

  it('refuses a bundle published without a named reviewer', () => {
    expect(() =>
      validatePublishedBundle(bundle({ reviewedBy: '   ' }), evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow(/reviewer/i);
  });

  it('refuses an entry reviewed after the bundle-level now', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ reviewedAt: '2026-12-01T00:00:00.000Z' })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/review/i);
  });

  it('refuses an unusable now, because no date could be compared against it', () => {
    expect(() =>
      validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), 'not-an-instant'),
    ).toThrow(/instant/i);
  });

  it('refuses a duplicate version mapping', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry(), capabilityEntry({ displayName: 'Clash' })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow();
  });

  it('refuses a published capability entry with no evidence', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ evidenceIds: [] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/evidence/i);
  });

  it('refuses a published rule with no evidence', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ rules: [rule({ evidenceIds: [] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/evidence/i);
  });

  it('refuses a withdrawn capability entry that would otherwise supply capabilities', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ status: 'withdrawn' })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/withdrawn/i);
  });

  it('refuses a withdrawn rule carried inside a published bundle', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ rules: [rule({ status: 'withdrawn' })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/withdrawn/i);
  });

  it('produces byte-equivalent normalized JSON for the same input', () => {
    const first = validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), NOW);
    const second = validatePublishedBundle(
      JSON.parse(JSON.stringify(bundle())),
      evidenceRegistry(),
      capabilityReview(),
      NOW,
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('publication gate referential integrity', () => {
  it('publishes a bundle whose evidence resolves and whose capabilities were independently approved', () => {
    const parsed = validatePublishedBundle(
      reviewedBundle(),
      evidenceRegistry(),
      capabilityReview(),
      NOW,
    );
    expect(parsed.status).toBe('published');
    expect(parsed.capabilities).toHaveLength(1);
    expect(parsed.rules).toHaveLength(1);
  });

  it('refuses a bundle that does not name the evidence registry it was built from', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ evidenceRegistryId: 'another-registry' }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/registry/i);
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ evidenceRegistryVersion: '7' }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/registry/i);
  });

  it('refuses a bundle that records no evidence registry at all', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ evidenceRegistryId: undefined, evidenceRegistryVersion: undefined }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/evidenceRegistry/i);
  });

  it('refuses an evidence registry this build cannot read', () => {
    expect(() =>
      validatePublishedBundle(reviewedBundle(), { records: [] }, capabilityReview(), NOW),
    ).toThrow(/registry/i);
  });

  it('refuses a capability review matrix that carries no rows', () => {
    expect(() =>
      validatePublishedBundle(reviewedBundle(), evidenceRegistry(), { rows: 'none' }, NOW),
    ).toThrow(/capability review/i);
  });

  it('refuses a capability review row this build cannot read', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ capability: 'deep_reconstruction' })] }),
        NOW,
      ),
    ).toThrow(/capability review/i);
  });

  it('refuses evidence that no record in the registry holds', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ capabilities: [reviewedEntry({ evidenceIds: ['fixture-evidence-absent'] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/fixture-evidence-absent/);
  });

  it('refuses an entry that cites the same evidence id twice', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({
          capabilities: [reviewedEntry({ evidenceIds: [CLEANSE_EVIDENCE, CLEANSE_EVIDENCE] })],
        }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/more than once/i);
  });

  it('refuses a rule that cites the same evidence id twice', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ rules: [reviewedRule({ evidenceIds: [RULE_EVIDENCE, RULE_EVIDENCE] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/more than once/i);
  });

  it('refuses draft evidence, which supports nothing', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ status: 'draft', reviewedAt: null, reviewedBy: null }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/draft/);
  });

  it('refuses withdrawn evidence, which is no longer usable', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ status: 'withdrawn' }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/withdrawn/);
  });

  it('refuses evidence whose review is dated after now', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ reviewedAt: '2026-12-01T00:00:00.000Z' }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/not at or before the supplied now/);
  });

  it('refuses evidence recorded for another market', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ market: 'unknown' }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/market/i);
  });

  it('refuses evidence whose claim scope does not cover the referenced version', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ versionIds: [OTHER_VERSION] }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/claim scope/i);
  });

  it('refuses a rule whose evidence is scoped to one version rather than to the rule itself', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ rules: [reviewedRule({ evidenceIds: [CLEANSE_EVIDENCE] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/version-independent/i);
  });

  it('refuses a capability no row in the review matrix decides', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [] }),
        NOW,
      ),
    ).toThrow(/capability review/i);
  });

  it('refuses a capability the review matrix recorded as not approved', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({
          rows: [reviewRow({ decision: 'rejected', rationale: 'Synthetic fixture rejection.' })],
        }),
        NOW,
      ),
    ).toThrow(/rejected/);
  });

  it('refuses a capability whose approval no second person checked', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ reviewedBy: null, reviewedAt: null })] }),
        NOW,
      ),
    ).toThrow(/checked/i);
  });

  it('refuses a capability the review matrix records as approved by its own author', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ reviewedBy: ROW_AUTHOR })] }),
        NOW,
      ),
    ).toThrow(/own author/i);
  });

  it('refuses a capability approved after the supplied now', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ reviewedAt: '2026-12-01T00:00:00.000Z' })] }),
        NOW,
      ),
    ).toThrow(/after the supplied now/);
  });

  it('refuses a capability approved on no supporting evidence', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ supportingEvidenceIds: [] })] }),
        NOW,
      ),
    ).toThrow(/supporting evidence/i);
  });

  it('refuses a capability approved on evidence that does not resolve', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({ rows: [reviewRow({ supportingEvidenceIds: ['fixture-evidence-absent'] })] }),
        NOW,
      ),
    ).toThrow(/fixture-evidence-absent/);
  });

  it('refuses a capability approved on evidence scoped to another version', () => {
    const registry = evidenceRegistry({
      records: [
        evidenceRecord({ versionIds: [OTHER_VERSION] }),
        evidenceRecord({ evidenceId: RULE_EVIDENCE, versionIds: [] }),
      ],
    });
    expect(() =>
      validatePublishedBundle(reviewedBundle(), registry, capabilityReview(), NOW),
    ).toThrow(/claim scope/i);
  });

  it('refuses a version 2 bundle the review matrix decides twice for one capability', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle(),
        evidenceRegistry(),
        capabilityReview({
          rows: [reviewRow(), reviewRow({ rationale: 'Synthetic fixture second decision.' })],
        }),
        NOW,
      ),
    ).toThrow(/more than once/i);
  });

  it('refuses a bundle whose reviewer is the person who authored it', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ reviewedBy: BUNDLE_AUTHOR }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/person who authored it/i);
  });

  it('refuses a capability outside the reviewed vocabulary', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ capabilities: [reviewedEntry({ verifiedCapabilities: ['mild-cleanse'] })] }),
        evidenceRegistry(),
        capabilityReview(),
        NOW,
      ),
    ).toThrow(/vocabulary/i);
  });

  it('produces the same bundle whichever order the registry records and review rows arrive in', () => {
    const registry = evidenceRegistry();
    const review = capabilityReview();
    const first = validatePublishedBundle(reviewedBundle(), registry, review, NOW);
    const second = validatePublishedBundle(
      reviewedBundle(),
      evidenceRegistry({ records: [...registry.records].reverse() }),
      capabilityReview({ rows: [...review.rows, reviewRow({ versionId: OTHER_VERSION })] }),
      NOW,
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('production reviewed registry', () => {
  it('is a parseable draft bundle', () => {
    expect(CURRENT_REVIEWED_BUNDLE.status).toBe('draft');
    expect(CURRENT_REVIEWED_BUNDLE.capabilities).toEqual([]);
    expect(CURRENT_REVIEWED_BUNDLE.rules).toEqual([]);
  });

  it('cannot be executed by the publication gate', () => {
    expect(() =>
      validatePublishedBundle(
        CURRENT_REVIEWED_BUNDLE,
        CHECKED_IN_EVIDENCE_REGISTRY,
        CHECKED_IN_CAPABILITY_REVIEW,
        NOW,
      ),
    ).toThrow(/published/i);
  });

  it('refuses any content that cites evidence the checked-in registry does not hold', () => {
    expect(() =>
      validatePublishedBundle(
        reviewedBundle({ evidenceRegistryId: 'basic-wash-evidence' }),
        CHECKED_IN_EVIDENCE_REGISTRY,
        CHECKED_IN_CAPABILITY_REVIEW,
        NOW,
      ),
    ).toThrow();
  });

  it('carries no synthetic item, fixture, or fabricated evidence', () => {
    const serialized = JSON.stringify(CURRENT_REVIEWED_BUNDLE).toLowerCase();
    for (const forbidden of ['fixture', 'fake', 'synthetic', 'dummy', 'example.test', '00000000-0000']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('publishes no real product or tool version mapping', () => {
    expect(CURRENT_REVIEWED_BUNDLE.capabilities).toHaveLength(0);
  });

  it('declares the goals Today may offer without enabling content', () => {
    expect(CURRENT_REVIEWED_BUNDLE.goals.map(goal => goal.id)).toEqual(['basic_wash']);
  });
});
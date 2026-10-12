import { describe, expect, it } from 'vitest';

import {
  generateProtocol,
  prepareGuidance,
  validateCapabilityReview,
  validatePublishedBundle,
  type GuidanceSnapshot,
  type GuidanceSourceItem,
  type ProtocolDecision,
} from '../../../packages/domain/src/index.ts';
import {
  BASIC_WASH_RULE,
  FIXTURE_CLEANSE_VERSION_ID,
  FIXTURE_CONDITION_VERSION_ID,
  FIXTURE_MARKETING_CLEANSE_EVIDENCE_ID,
  FIXTURE_MARKETING_CONDITION_EVIDENCE_ID,
  FIXTURE_ORDER_EVIDENCE_ID,
  basicWashCapabilityEntry,
  basicWashCapabilityReview,
  basicWashCleanseProduct,
  basicWashConditionProduct,
  basicWashContext,
  basicWashEvidenceRegistry,
  basicWashInventory,
  basicWashMarketingOnlyRegistry,
  basicWashPublishedBundle,
  basicWashReviewRow,
} from '../../fixtures/guidance/basic-wash-reviewed.ts';

const AS_OF = '2026-10-11T09:00:00.000Z';
const NOW = '2026-10-11T09:00:00.000Z';

function snapshotProduct(
  ownerItemId: string,
  versionId: string,
  availability: GuidanceSourceItem['availability'],
): GuidanceSourceItem {
  return {
    ownerItemId,
    versionId,
    name: `Fixture ${ownerItemId}`,
    availability,
    revision: 1,
  };
}

function basicWashSnapshot(products: readonly GuidanceSourceItem[]): GuidanceSnapshot {
  return {
    ownerId: 'owner-basic-wash',
    asOf: AS_OF,
    loadedAt: AS_OF,
    passportFacts: { pattern: 'coily' },
    services: [],
    activities: [],
    products: [...products],
    tools: [],
    completeness: {
      passport: 'complete',
      services: 'complete',
      activities: 'complete',
      products: 'complete',
      tools: 'complete',
    },
  };
}

/** The fixture bundle, gated for real: preparation tests never parse it by hand. */
function gatedFixtureBundle() {
  return validatePublishedBundle(
    basicWashPublishedBundle(),
    basicWashEvidenceRegistry(),
    basicWashCapabilityReview(),
    NOW,
  );
}

describe('basic wash reviewed rule', () => {
  it('orders cleanse before condition for an owner with reviewed available products', () => {
    const decision: ProtocolDecision = generateProtocol(basicWashContext());
    expect(decision.status).toBe('ready');
    expect(decision.steps).toHaveLength(2);
    const cleanseStep = decision.steps[0]!;
    const conditionStep = decision.steps[1]!;
    expect(cleanseStep.productVersionId).toBe(FIXTURE_CLEANSE_VERSION_ID);
    expect(conditionStep.productVersionId).toBe(FIXTURE_CONDITION_VERSION_ID);
    expect(cleanseStep.position).toBeLessThan(conditionStep.position);
    expect(cleanseStep.reasons.join(' ')).toContain(`requires 'cleanse'`);
    expect(conditionStep.reasons.join(' ')).toContain(`requires 'condition'`);
    expect(conditionStep.reasons.join(' ')).toContain(`'cleanse' before 'condition'`);
  });

  it('returns an explicit unsupported gap when no reviewed conditioner is available', () => {
    const decision = generateProtocol(basicWashContext({ products: [basicWashCleanseProduct()] }));
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability 'condition'`,
    );
  });

  it('returns an explicit unsupported gap when no reviewed cleanser is available', () => {
    const decision = generateProtocol(basicWashContext({ products: [basicWashConditionProduct()] }));
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability 'cleanse'`,
    );
  });

  it('does not let an archived cleanser qualify', () => {
    const preparation = prepareGuidance({
      snapshot: basicWashSnapshot([
        snapshotProduct('owner-cleanser', FIXTURE_CLEANSE_VERSION_ID, 'archived'),
        snapshotProduct('owner-conditioner', FIXTURE_CONDITION_VERSION_ID, 'available'),
      ]),
      bundle: gatedFixtureBundle(),
      goalId: 'basic_wash',
      requestId: 'request-basic-wash-archived',
      asOf: AS_OF,
    });
    expect(preparation.status).toBe('ready');
    if (preparation.status !== 'ready') return;
    const decision = generateProtocol(preparation.context);
    expect(decision.status).toBe('unsupported');
    expect(decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability 'cleanse'`,
    );
  });

  it('does not let an out-of-stock conditioner qualify', () => {
    const preparation = prepareGuidance({
      snapshot: basicWashSnapshot([
        snapshotProduct('owner-cleanser', FIXTURE_CLEANSE_VERSION_ID, 'available'),
        snapshotProduct('owner-conditioner', FIXTURE_CONDITION_VERSION_ID, 'out_of_stock'),
      ]),
      bundle: gatedFixtureBundle(),
      goalId: 'basic_wash',
      requestId: 'request-basic-wash-out-of-stock',
      asOf: AS_OF,
    });
    expect(preparation.status).toBe('ready');
    if (preparation.status !== 'ready') return;
    const decision = generateProtocol(preparation.context);
    expect(decision.status).toBe('unsupported');
    expect(decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability 'condition'`,
    );
  });

  it('does not let unrelated or unknown capabilities qualify', () => {
    const decision = generateProtocol(
      basicWashContext({
        products: [
          basicWashCleanseProduct({ verifiedCapabilities: ['fixture-unrelated-capability'] }),
          basicWashConditionProduct({ verifiedCapabilities: [], unknownCapabilities: ['condition'] }),
        ],
      }),
    );
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
    // Neither candidate carries a verified required capability: the first
    // required capability in sorted order names the gap.
    expect(decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability 'cleanse'`,
    );
  });

  it('refuses commercial fields on candidates instead of ranking through them', () => {
    expect(() =>
      generateProtocol(
        basicWashContext({
          products: [
            { ...basicWashCleanseProduct(), price: 99.99 },
            basicWashConditionProduct(),
          ],
        }),
      ),
    ).toThrow();
  });

  it('keeps ranking identical across display-name variants', () => {
    const first = generateProtocol(
      basicWashContext({
        products: [
          basicWashCleanseProduct({ name: 'Fixture Cleanser Alpha' }),
          basicWashConditionProduct({ name: 'Fixture Conditioner Alpha' }),
        ],
      }),
    );
    const second = generateProtocol(
      basicWashContext({
        products: [
          basicWashCleanseProduct({ name: 'Fixture Cleanser Beta' }),
          basicWashConditionProduct({ name: 'Fixture Conditioner Beta' }),
        ],
      }),
    );
    expect(first.status).toBe('ready');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('requires no tool purchase for a basic wash', () => {
    const decision = generateProtocol(basicWashContext({ tools: [] }));
    expect(decision.status).toBe('ready');
    expect(decision.steps.length).toBeGreaterThan(0);
    for (const step of decision.steps) {
      expect(step.toolId).toBeNull();
      expect(step.toolVersionId).toBeNull();
    }
    expect(decision.noPurchaseNeeded).toBe(true);
  });

  it('carries evidence references and reasons on the rule audit and the steps', () => {
    const decision = generateProtocol(basicWashContext());
    expect(decision.status).toBe('ready');
    const entry = decision.audit.evaluatedRules.find(rule => rule.ruleId === BASIC_WASH_RULE.ruleId);
    expect(entry).toMatchObject({
      versionId: '1',
      outcome: 'applied',
      evidenceIds: [FIXTURE_ORDER_EVIDENCE_ID],
    });
    expect(entry?.reason.length).toBeGreaterThan(0);
    for (const step of decision.steps) {
      expect(step.reasons.length).toBeGreaterThan(0);
    }
  });

  it('is unaffected by input order in both the decision and the fingerprint input', () => {
    const cleanse = basicWashCleanseProduct();
    const condition = basicWashConditionProduct();
    const first = generateProtocol(basicWashContext({ products: [cleanse, condition] }));
    const second = generateProtocol(basicWashContext({ products: [condition, cleanse] }));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // The Today fingerprint is a hash of the prepared context string, so equal
    // context strings mean equal fingerprints.
    const contextFor = (products: readonly GuidanceSourceItem[]) => {
      const preparation = prepareGuidance({
        snapshot: basicWashSnapshot(products),
        bundle: gatedFixtureBundle(),
        goalId: 'basic_wash',
        requestId: 'request-basic-wash-order',
        asOf: AS_OF,
      });
      expect(preparation.status).toBe('ready');
      if (preparation.status !== 'ready') throw new Error('Fixture preparation must be ready');
      return JSON.stringify(preparation.context);
    };
    expect(
      contextFor([
        snapshotProduct('owner-cleanser', FIXTURE_CLEANSE_VERSION_ID, 'available'),
        snapshotProduct('owner-conditioner', FIXTURE_CONDITION_VERSION_ID, 'available'),
      ]),
    ).toBe(
      contextFor([
        snapshotProduct('owner-conditioner', FIXTURE_CONDITION_VERSION_ID, 'available'),
        snapshotProduct('owner-cleanser', FIXTURE_CLEANSE_VERSION_ID, 'available'),
      ]),
    );
  });
});

describe('basic wash reviewed bundle (isolated fixture)', () => {
  it('publishes an isolated bundle whose approvals rest on genuine evidence tiers', () => {
    const parsed = validatePublishedBundle(
      basicWashPublishedBundle(),
      basicWashEvidenceRegistry(),
      basicWashCapabilityReview(),
      NOW,
    );
    expect(parsed.status).toBe('published');
    expect(parsed.version).toBe('2');
    expect(parsed.capabilities.map(entry => entry.verifiedCapabilities)).toEqual([
      ['cleanse'],
      ['condition'],
    ]);
    expect(parsed.rules.map(rule => rule.ruleId)).toEqual([BASIC_WASH_RULE.ruleId]);
  });

  it('does not execute an approval resting only on marketing', () => {
    const marketingReview = basicWashCapabilityReview({
      rows: [
        basicWashReviewRow({ supportingEvidenceIds: [FIXTURE_MARKETING_CLEANSE_EVIDENCE_ID] }),
        basicWashReviewRow({
          versionId: FIXTURE_CONDITION_VERSION_ID,
          capability: 'condition',
          supportingEvidenceIds: [FIXTURE_MARKETING_CONDITION_EVIDENCE_ID],
        }),
      ],
    });
    const review = validateCapabilityReview(
      marketingReview,
      basicWashMarketingOnlyRegistry(),
      basicWashInventory(),
      NOW,
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.findings.map(finding => finding.code)).toContain('APPROVAL_ON_MARKETING_ONLY');
    const marketingBundle = basicWashPublishedBundle({
      capabilities: [
        basicWashCapabilityEntry({ evidenceIds: [FIXTURE_MARKETING_CLEANSE_EVIDENCE_ID] }),
        basicWashCapabilityEntry({
          versionId: FIXTURE_CONDITION_VERSION_ID,
          displayName: 'Synthetic fixture conditioner',
          verifiedCapabilities: ['condition'],
          evidenceIds: [FIXTURE_MARKETING_CONDITION_EVIDENCE_ID],
        }),
      ],
    });
    expect(() =>
      validatePublishedBundle(
        marketingBundle,
        basicWashMarketingOnlyRegistry(),
        marketingReview,
        NOW,
      ),
    ).toThrow(/draft/i);
  });
});

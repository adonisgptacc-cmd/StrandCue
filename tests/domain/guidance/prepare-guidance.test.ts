import { describe, expect, it } from 'vitest';

import { buildPreparedInput } from '../../../packages/domain/src/guidance/prepared-input.ts';

import {
  generateProtocol,
  prepareGuidance,
  RecommendationContextSchema,
  validatePublishedBundle,
  type GuidancePreparation,
  type GuidanceSnapshot,
  type PreparedGuidanceInput,
  type PrepareGuidanceInput,
  type ReviewedGuidanceBundle,
} from '../../../packages/domain/src/index';

const AS_OF = '2026-10-11T09:00:00.000Z';
const REVIEWED_AT = '2026-10-01T00:00:00.000Z';
const NOW = '2026-10-11T09:00:00.000Z';

/**
 * Capabilities from the closed reviewed vocabulary, and synthetic catalogue
 * ids. Version `2` is the only bundle version the publication gate executes, so
 * the fixture has to be one: these tests gate their bundle for real rather than
 * parsing it, because the gate is the only route into preparation.
 */
const CAP_PRODUCT = 'cleanse';
const CAP_TOOL = 'condition';

const PRODUCT_VERSION = '11111111-1111-4111-8111-111111111111';
const TOOL_VERSION = '22222222-2222-4222-8222-222222222222';
const REGISTRY_ID = 'fixture-evidence-registry';
const PRODUCT_EVIDENCE = 'fixture-evidence-product';
const TOOL_EVIDENCE = 'fixture-evidence-tool';
const RULE_EVIDENCE = 'fixture-evidence-rule';

function evidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: PRODUCT_EVIDENCE,
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
    checkedAt: REVIEWED_AT,
    authoredBy: 'I. Fixture-Author',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'I. Fixture-Reviewer',
    status: 'reviewed',
    ...overrides,
  };
}

/** The registry this fixture publishes against: one record per claim scope. */
function evidenceRegistry() {
  return {
    registryId: REGISTRY_ID,
    version: '1',
    records: [
      evidenceRecord(),
      evidenceRecord({
        evidenceId: TOOL_EVIDENCE,
        title: 'Synthetic independent test report for the fixture tool version',
        sourceUrl: 'https://strandcue.invalid/fixtures/tool',
        versionIds: [TOOL_VERSION],
      }),
      evidenceRecord({
        evidenceId: RULE_EVIDENCE,
        title: 'Synthetic guidance source recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/order',
        // A washing-order claim is not a claim about one catalogue version.
        versionIds: [],
      }),
    ],
  };
}

function reviewRow(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    capability: CAP_PRODUCT,
    supportingEvidenceIds: [PRODUCT_EVIDENCE],
    contradictedByEvidenceIds: [],
    decision: 'approved',
    rationale: 'Synthetic fixture rationale recorded for this decision.',
    authoredBy: 'I. Fixture-Row-Author',
    reviewedBy: 'I. Fixture-Row-Reviewer',
    reviewedAt: REVIEWED_AT,
    ...overrides,
  };
}

function capabilityReview() {
  return {
    reviewId: 'fixture-capability-review',
    version: '1',
    rows: [
      reviewRow(),
      reviewRow({
        kind: 'tool',
        versionId: TOOL_VERSION,
        capability: CAP_TOOL,
        supportingEvidenceIds: [TOOL_EVIDENCE],
      }),
    ],
  };
}

function snapshot(overrides: Partial<GuidanceSnapshot> = {}): GuidanceSnapshot {
  return {
    ownerId: 'owner-1',
    asOf: AS_OF,
    loadedAt: AS_OF,
    passportFacts: { naturalPattern: 'curly' },
    services: [],
    activities: [],
    products: [
      {
        ownerItemId: 'owner-product-1',
        versionId: PRODUCT_VERSION,
        name: 'Owned shampoo',
        availability: 'available',
        revision: 3,
      },
    ],
    tools: [
      {
        ownerItemId: 'owner-tool-1',
        versionId: TOOL_VERSION,
        name: 'Owned diffuser',
        availability: 'available',
        revision: 2,
      },
    ],
    completeness: {
      passport: 'complete',
      services: 'complete',
      activities: 'complete',
      products: 'complete',
      tools: 'complete',
    },
    ...overrides,
  };
}

function bundle(overrides: Partial<ReviewedGuidanceBundle> = {}): ReviewedGuidanceBundle {
  return {
    bundleId: 'bundle-synthetic',
    version: '2',
    status: 'published',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'I. Fixture-Approver',
    authoredBy: 'I. Fixture-Compiler',
    evidenceRegistryId: REGISTRY_ID,
    evidenceRegistryVersion: '1',
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['naturalPattern'] }],
    capabilities: [
      {
        kind: 'product',
        versionId: PRODUCT_VERSION,
        displayName: 'Synthetic product',
        verifiedCapabilities: [CAP_PRODUCT],
        evidenceIds: [PRODUCT_EVIDENCE],
        status: 'published',
        reviewedAt: REVIEWED_AT,
        reviewedBy: 'I. Fixture-Entry-Reviewer',
        authoredBy: 'I. Fixture-Entry-Author',
      },
      {
        kind: 'tool',
        versionId: TOOL_VERSION,
        displayName: 'Synthetic tool',
        verifiedCapabilities: [CAP_TOOL],
        evidenceIds: [TOOL_EVIDENCE],
        status: 'published',
        reviewedAt: REVIEWED_AT,
        reviewedBy: 'I. Fixture-Entry-Reviewer',
        authoredBy: 'I. Fixture-Entry-Author',
      },
    ],
    rules: [
      {
        ruleId: 'rule-wash',
        versionId: '1',
        status: 'published',
        strength: 'hard',
        condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
        effects: [{ kind: 'require_capability', capability: CAP_PRODUCT }],
        reason: 'Synthetic wash rule.',
        evidenceIds: [RULE_EVIDENCE],
      },
    ],
    ...overrides,
  };
}

function prepare(
  snapshotInput: GuidanceSnapshot = snapshot(),
  bundleInput: ReviewedGuidanceBundle = bundle(),
  goalId = 'basic_wash' as const,
  requestId = 'request-1',
) {
  return prepareGuidance({
    snapshot: snapshotInput,
    bundle: validatePublishedBundle(bundleInput, evidenceRegistry(), capabilityReview(), NOW),
    goalId,
    requestId,
    asOf: AS_OF,
  } satisfies PrepareGuidanceInput);
}

describe('preparation gates', () => {
  it('refuses to prepare from a draft or withdrawn bundle', () => {
    for (const status of ['draft', 'withdrawn'] as const) {
      let threw = false;
      try {
        prepare(snapshot(), bundle({ status }));
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });

  it('refuses to prepare from an incomplete source', () => {
    const incomplete = snapshot({
      completeness: {
        passport: 'complete',
        services: 'complete',
        activities: 'complete',
        products: 'failed',
        tools: 'complete',
      },
    });
    const result = prepare(incomplete);
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'snapshot_incomplete',
      incompleteSources: [{ source: 'products', state: 'failed' }],
    });
  });

  it('refuses to prepare from a truncated source', () => {
    const truncated = snapshot({
      completeness: {
        passport: 'complete',
        services: 'complete',
        activities: 'complete',
        products: 'complete',
        tools: 'truncated',
      },
    });
    expect(prepare(truncated)).toEqual({
      status: 'unavailable',
      reason: 'snapshot_incomplete',
      incompleteSources: [{ source: 'tools', state: 'truncated' }],
    });
  });

  it('refuses a goal the reviewed bundle does not define', () => {
    // The bundle schema currently admits exactly one goal id, so an
    // unsupported goal can only arrive from a future bundle. This exercises
    // the defensive branch rather than a reachable production case.
    const unsupportedGoal = 'deep_reconstruction' as unknown as 'basic_wash';
    const result = prepareGuidance({
      snapshot: snapshot(),
      bundle: bundle(),
      goalId: unsupportedGoal,
      requestId: 'request-1',
      asOf: AS_OF,
    } satisfies PrepareGuidanceInput);
    expect(result).toEqual({ status: 'unavailable', reason: 'no_supported_goal' });
  });
});

describe('capability acquisition', () => {
  it('acquires only registry capabilities for an exact version match', () => {
    const result = prepare();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const product = result.context.products.find(
      entry => entry.productId === 'owner-product-1',
    );
    expect(product).toBeDefined();
    expect(product?.versionId).toBe(PRODUCT_VERSION);
    expect(product?.verifiedCapabilities).toEqual([CAP_PRODUCT]);
    expect(product?.owned).toBe(true);
  });

  it('acquires nothing for a version that is absent from the registry', () => {
    const unmatched = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: 'version-not-in-registry',
          name: 'Owned shampoo',
          availability: 'available',
          revision: 3,
        },
      ],
    });
    const result = prepare(unmatched);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.products).toEqual([]);
  });

  it('acquires nothing for a manual item with no version id', () => {
    const manual = snapshot({
      tools: [
        {
          ownerItemId: 'owner-tool-1',
          versionId: null,
          name: 'Manual dryer',
          availability: 'available',
          revision: 2,
        },
      ],
    });
    const result = prepare(manual);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.tools).toEqual([]);
  });

  it('never reaches preparation when a capability entry is withdrawn', () => {
    // The publication gate refuses a bundle carrying withdrawn content, so
    // preparation can never observe one. This asserts the boundary: the
    // gate refuses it, and prepareGuidance is therefore never handed it.
    const withdrawn = bundle({
      capabilities: bundle().capabilities.map(entry =>
        entry.kind === 'product' ? { ...entry, status: 'withdrawn' as const } : entry,
      ),
    });
    expect(() =>
      validatePublishedBundle(withdrawn, evidenceRegistry(), capabilityReview(), NOW),
    ).toThrow(/withdrawn/i);
  });

  it('marks archived and out-of-stock items as unavailable candidates', () => {
    const archived = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: PRODUCT_VERSION,
          name: 'Old shampoo',
          availability: 'archived',
          revision: 3,
        },
      ],
      tools: [
        {
          ownerItemId: 'owner-tool-1',
          versionId: TOOL_VERSION,
          name: 'Empty diffuser',
          availability: 'out_of_stock',
          revision: 2,
        },
      ],
    });
    const result = prepare(archived);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.products[0].available).toBe(false);
    expect(result.context.tools[0].available).toBe(false);
  });

  it('treats a product the owner marked low as unavailable, never as a candidate', () => {
    // Only an available product counts as an available candidate. A
    // product the owner marked "running low" is an ordinary state of a
    // product they own, so it is listed as unavailable rather than
    // offered as one.
    const low = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: PRODUCT_VERSION,
          name: 'Running low shampoo',
          availability: 'low',
          revision: 3,
        },
      ],
      tools: [
        {
          ownerItemId: 'owner-tool-1',
          versionId: TOOL_VERSION,
          name: 'Running low diffuser',
          availability: 'low',
          revision: 2,
        },
      ],
    });
    const result = prepare(low);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.products[0].available).toBe(false);
    expect(result.context.tools[0].available).toBe(false);
  });
});

describe('setup gaps', () => {
  it('reports missing passport facts as sorted hair_profile gaps', () => {
    const empty = snapshot({ passportFacts: {} });
    const result = prepare(empty);
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.map(gap => gap.kind)).toEqual(['hair_profile']);
    expect(result.missing[0].subject).toBe('naturalPattern');
  });

  it('reports unknown chemical-service presence as a service_presence gap', () => {
    const withService = snapshot({
      services: [
        {
          serviceId: 'service-1',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: { serviceType: 'bleach-or-lightener' },
        },
      ],
    });
    const result = prepare(withService);
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.map(gap => gap.kind)).toContain('service_presence');
  });

  it('reports a confirmed present service as a safety stop, not a generic fallback', () => {
    const withService = snapshot({
      services: [
        {
          serviceId: 'service-1',
          currentPresence: 'present',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: { serviceType: 'bleach-or-lightener' },
        },
      ],
    });
    const result = prepare(withService);
    expect(result.status).not.toBe('ready');
    if (result.status === 'needs_setup') {
      expect(result.missing.map(gap => gap.kind)).toContain('service_presence');
    }
  });

  it('does not block on a service explicitly recorded as no longer present', () => {
    const withService = snapshot({
      services: [
        {
          serviceId: 'service-1',
          currentPresence: 'not-present',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: { serviceType: 'bleach-or-lightener' },
        },
      ],
    });
    const result = prepare(withService);
    expect(result.status).toBe('ready');
  });

  it('orders gaps deterministically', () => {
    const result = prepare(snapshot({ passportFacts: {} }));
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    const kinds = result.missing.map(gap => gap.kind);
    expect([...kinds]).toEqual([...kinds].sort());
  });

  it('orders gaps of the same kind by subject', () => {
    const withServices = snapshot({
      services: [
        {
          serviceId: 'service-c',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: {},
        },
        {
          serviceId: 'service-a',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: {},
        },
        {
          serviceId: 'service-b',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: {},
        },
      ],
    });
    const result = prepare(withServices);
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.map(gap => gap.subject)).toEqual([
      'service-a',
      'service-b',
      'service-c',
    ]);
  });

  it('collapses repeated findings about the same subject into one gap', () => {
    // The goal lists the same required fact twice; the owner should see one
    // setup action, not two near-identical ones.
    const duplicated = bundle({
      goals: [
        {
          id: 'basic_wash',
          label: 'Basic wash',
          requiredProfileFacts: ['naturalPattern', 'naturalPattern'],
        },
      ],
    });
    const result = prepare(snapshot({ passportFacts: {} }), duplicated);
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].subject).toBe('naturalPattern');
  });

  it('returns byte-identical gaps for repeated identical input', () => {
    const withServices = snapshot({
      services: [
        {
          serviceId: 'service-a',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: {},
        },
        {
          serviceId: 'service-b',
          currentPresence: 'unknown',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: {},
        },
      ],
    });
    const first = prepare(withServices);
    const second = prepare(withServices);
    expect(first.status).toBe('needs_setup');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('prepared context', () => {
  it('produces a context the engine accepts', () => {
    const result = prepare();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(() => RecommendationContextSchema.parse(result.context)).not.toThrow();
    const decision = generateProtocol(result.context);
    expect(decision.status).toBe('ready');
    expect(decision.steps.length).toBeGreaterThan(0);
  });

  it('carries bundle identity on a ready preparation', () => {
    const result = prepare();
    expect(result.status === 'ready' && result.bundleId).toBe('bundle-synthetic');
    expect(result.status === 'ready' && result.bundleVersion).toBe('2');
  });

  it('reports no hair_profile gap when the goal requires no profile facts', () => {
    const relaxedGoal = bundle({
      goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: [] }],
    });
    const result = prepare(snapshot({ passportFacts: {} }), relaxedGoal);
    expect(result.status).toBe('ready');
  });

  it('keeps a service whose presence is confirmed present out of the ready path', () => {
    const present = snapshot({
      services: [
        {
          serviceId: 'service-a',
          currentPresence: 'present',
          effectiveStart: { precision: 'day' as const, value: '2026-06-01' },
          facts: { serviceType: 'bleach-or-lightener' },
        },
      ],
    });
    const result = prepare(present);
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].kind).toBe('service_presence');
  });

  it('produces byte-equivalent context JSON for reordered source collections', () => {
    const ordered = prepare();
    const reversed = prepare(
      snapshot({
        products: [...snapshot().products].reverse(),
        tools: [...snapshot().tools].reverse(),
      }),
    );
    expect(ordered.status).toBe('ready');
    expect(reversed.status).toBe('ready');
    if (ordered.status !== 'ready' || reversed.status !== 'ready') return;
    expect(JSON.stringify(reversed.context)).toBe(JSON.stringify(ordered.context));
  });

  it('leaves its input objects deeply equal to pre-call clones', () => {
    const snapshotInput = snapshot();
    const bundleInput = bundle();
    const snapshotClone = structuredClone(snapshotInput);
    const bundleClone = structuredClone(bundleInput);
    prepare(snapshotInput, bundleInput);
    expect(snapshotInput).toEqual(snapshotClone);
    expect(bundleInput).toEqual(bundleClone);
  });

  it('namespaces facts without merging unqualified duplicates', () => {
    const result = prepare(
      snapshot({
        passportFacts: { naturalPattern: 'curly', activityKind: 'other' },
        activities: [
          {
            activityId: 'activity-1',
            revision: 1,
            voided: false,
            appliedRevisionIds: ['revision-1'],
            facts: { activityKind: 'styling' },
          },
        ],
      }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.profileFacts.activityKind).toBe('other');
    expect(result.context.historyFacts.activityKind).toBe('styling');
  });

  it('omits conflicting activity facts and retains agreed values independent of source order', () => {
    const activities = [
      {
        activityId: 'activity-a',
        revision: 1,
        voided: false,
        appliedRevisionIds: ['revision-a'],
        facts: { activityKind: 'wash', status: 'active' },
      },
      {
        activityId: 'activity-b',
        revision: 1,
        voided: false,
        appliedRevisionIds: ['revision-b'],
        facts: { activityKind: 'treatment', status: 'active' },
      },
    ];
    const first = prepare(snapshot({ activities }));
    const reversed = prepare(snapshot({ activities: [...activities].reverse() }));

    expect(first.status).toBe('ready');
    expect(reversed.status).toBe('ready');
    if (first.status !== 'ready' || reversed.status !== 'ready') return;
    expect(first.context.historyFacts).toEqual({ status: 'active' });
    expect(reversed.context.historyFacts).toEqual({ status: 'active' });
    expect(JSON.stringify(reversed.context)).toBe(JSON.stringify(first.context));
  });

  it('copies published rules into the context without rewriting them', () => {
    const source = bundle();
    const result = prepare(snapshot(), source);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.rules).toEqual(source.rules);
  });

  it('uses the request id and as-of supplied by the caller', () => {
    const result = prepare(snapshot(), bundle(), 'basic_wash', 'request-42');
    expect(result.status === 'ready' && result.context.requestId).toBe('request-42');
    expect(result.status === 'ready' && result.context.asOf).toBe(AS_OF);
    expect(result.status === 'ready' && result.context.goal).toBe('basic_wash');
  });
});

describe('task 6 integration: exact versions through Today', () => {
  // A visually similar but different catalogue version: the owner-facing name
  // is identical to the reviewed product's name, yet the version id is a
  // different valid UUID with no registry entry. Identity is the version id,
  // never the name, so nothing is acquired.
  const SIMILAR_VERSION = '33333333-3333-4333-8333-333333333333';

  it('acquires nothing for a visually similar but different version id', () => {
    const similar = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: SIMILAR_VERSION,
          name: 'Owned shampoo',
          availability: 'available',
          revision: 3,
        },
      ],
    });
    const result = prepare(similar);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.products).toEqual([]);
  });

  it('produces byte-equivalent context when several sources arrive reordered', () => {
    const first = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: PRODUCT_VERSION,
          name: 'Owned shampoo',
          availability: 'available',
          revision: 3,
        },
        {
          ownerItemId: 'owner-product-2',
          versionId: SIMILAR_VERSION,
          name: 'Owned shampoo',
          availability: 'available',
          revision: 1,
        },
      ],
    });
    const reordered = snapshot({
      products: [...first.products].reverse(),
      tools: [...snapshot().tools].reverse(),
    });
    const orderedResult = prepare(first);
    const reorderedResult = prepare(reordered);
    expect(orderedResult.status).toBe('ready');
    expect(reorderedResult.status).toBe('ready');
    if (orderedResult.status !== 'ready' || reorderedResult.status !== 'ready') return;
    expect(JSON.stringify(reorderedResult.context)).toBe(JSON.stringify(orderedResult.context));
    expect(orderedResult.context.products.map(entry => entry.productId)).toEqual([
      'owner-product-1',
    ]);
  });
});

describe('task 4: temporary current-condition check-ins', () => {
  // Explicit reference time threaded into preparation: later than the fixture
  // observedAt (08:00+02:00) but earlier than the wall clock, so any test that
  // depends on it proves injection rather than a hidden `new Date()`.
  const CHECK_IN_NOW = new Date('2026-10-11T09:00:00.000+02:00');

  function checkIn(overrides: Record<string, unknown> = {}) {
    return {
      observedAt: '2026-10-11T08:00:00.000+02:00',
      concerns: ['dryness'],
      goal: 'basic_wash',
      availableMinutes: 20,
      ...overrides,
    };
  }

  function prepareWithCheckIn(
    currentCondition: unknown,
    snapshotInput: GuidanceSnapshot = snapshot(),
    bundleInput: ReviewedGuidanceBundle = bundle(),
    now: Date = CHECK_IN_NOW,
  ) {
    return prepareGuidance({
      snapshot: snapshotInput,
      bundle: validatePublishedBundle(bundleInput, evidenceRegistry(), capabilityReview(), NOW),
      goalId: 'basic_wash',
      requestId: 'request-checkin',
      asOf: AS_OF,
      currentCondition,
      now,
    } satisfies PrepareGuidanceInput);
  }

  function factKeys(result: GuidancePreparation): string[] {
    if (result.status !== 'ready') return [];
    return [
      ...Object.keys(result.context.environmentFacts),
      ...Object.keys(result.context.historyFacts),
      ...Object.keys(result.context.profileFacts),
    ];
  }

  it('maps a valid check-in to namespaced current.* facts and leaves the stored snapshot byte-identical', () => {
    const snapshotInput = snapshot();
    const before = JSON.stringify(snapshotInput);
    const result = prepareWithCheckIn(
      checkIn({ concerns: ['frizz', 'dryness'], availableMinutes: 20 }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.environmentFacts['current.observedAt']).toBe(
      '2026-10-11T08:00:00.000+02:00',
    );
    expect(result.context.environmentFacts['current.goal']).toBe('basic_wash');
    expect(result.context.environmentFacts['current.availableMinutes']).toBe(20);
    expect(result.context.environmentFacts['current.concerns.dryness']).toBe(true);
    expect(result.context.environmentFacts['current.concerns.frizz']).toBe(true);
    // Stored Passport facts govern nothing here: they are preserved exactly,
    // and no current.* fact leaks into the profile namespace.
    expect(result.context.profileFacts).toEqual(snapshotInput.passportFacts);
    expect(
      Object.keys(result.context.profileFacts).some(key => key.startsWith('current.')),
    ).toBe(false);
    // HP-06: the temporary answers exist only in this request's context.
    expect(JSON.stringify(snapshotInput)).toBe(before);
  });

  it('keeps inputs without a check-in byte-stable with no current.* facts', () => {
    const result = prepare();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(factKeys(result).filter(key => key.startsWith('current.'))).toEqual([]);
  });

  it.each([
    'dryness',
    'frizz',
    'tangling',
    'breakage',
    'stiffness',
    'dullness',
    'scalp-dryness',
    'scalp-oiliness',
    'reported-damage',
  ])('manufactures no capability for a %s check-in', concern => {
    const legacy = prepare();
    const result = prepareWithCheckIn(checkIn({ concerns: [concern] }));
    expect(legacy.status).toBe('ready');
    expect(result.status).toBe('ready');
    if (legacy.status !== 'ready' || result.status !== 'ready') return;
    // The check-in was admitted (positive control): namespaced facts exist.
    expect(result.context.environmentFacts[`current.concerns.${concern}`]).toBe(true);
    // Capability sets are unchanged by the check-in.
    expect(result.context.products).toEqual(legacy.context.products);
    expect(result.context.tools).toEqual(legacy.context.tools);
    const legacyJson = JSON.stringify(legacy);
    const resultJson = JSON.stringify(result);
    for (const invented of ['repair', 'protein', 'bond']) {
      expect(resultJson).not.toContain(invented);
    }
    // 'condition' is a legitimate reviewed tool capability in this fixture, so
    // the check-in must add no new occurrence of it.
    const occurrences = (json: string) => json.split('condition').length - 1;
    expect(occurrences(resultJson)).toBe(occurrences(legacyJson));
  });

  it('manufactures no capability when every concern is reported together', () => {
    const concerns = [
      'dryness',
      'frizz',
      'tangling',
      'breakage',
      'stiffness',
      'dullness',
      'scalp-dryness',
      'scalp-oiliness',
      'reported-damage',
    ];
    const legacy = prepare();
    const result = prepareWithCheckIn(checkIn({ concerns }));
    expect(legacy.status).toBe('ready');
    expect(result.status).toBe('ready');
    if (legacy.status !== 'ready' || result.status !== 'ready') return;
    // The check-in was admitted (positive control): every concern has a fact.
    for (const concern of concerns) {
      expect(result.context.environmentFacts[`current.concerns.${concern}`]).toBe(true);
    }
    expect(result.context.products).toEqual(legacy.context.products);
    expect(result.context.tools).toEqual(legacy.context.tools);
    const resultJson = JSON.stringify(result);
    for (const invented of ['repair', 'protein', 'bond']) {
      expect(resultJson).not.toContain(invented);
    }
    const occurrences = (json: string) => json.split('condition').length - 1;
    expect(occurrences(resultJson)).toBe(occurrences(JSON.stringify(legacy)));
  });

  it('returns stable targeted gaps for unknown concerns', () => {
    const first = prepareWithCheckIn(checkIn({ concerns: ['unknown'] }));
    const second = prepareWithCheckIn(checkIn({ concerns: ['unknown'] }));
    expect(first.status).toBe('needs_setup');
    if (first.status !== 'needs_setup') return;
    expect(first.missing.map(gap => gap.kind)).toEqual(['current_condition']);
    expect(first.missing.map(gap => gap.subject)).toEqual(['current.concerns']);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('returns byte-identical gaps for contradictory concerns regardless of order', () => {
    const first = prepareWithCheckIn(checkIn({ concerns: ['none', 'dryness'] }));
    const second = prepareWithCheckIn(checkIn({ concerns: ['dryness', 'none'] }));
    expect(first.status).toBe('needs_setup');
    if (first.status !== 'needs_setup') return;
    expect(first.missing.every(gap => gap.kind === 'current_condition')).toBe(true);
    expect(first.missing.map(gap => gap.subject)).toContain('current.concerns');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('returns stable targeted gaps for missing answers', () => {
    const { concerns: _dropped, ...withoutConcerns } = checkIn();
    void _dropped;
    const missingField = prepareWithCheckIn(withoutConcerns);
    expect(missingField.status).toBe('needs_setup');
    if (missingField.status !== 'needs_setup') return;
    expect(missingField.missing.map(gap => gap.subject)).toContain('current.concerns');
    // Non-object payloads carry no field path: they collapse to one stable
    // check-in-level gap.
    for (const raw of [[], null, 'dryness']) {
      const shapeless = prepareWithCheckIn(raw);
      expect(shapeless.status).toBe('needs_setup');
      if (shapeless.status !== 'needs_setup') return;
      expect(shapeless.missing.map(gap => gap.subject)).toEqual(['current.checkIn']);
    }
    const first = prepareWithCheckIn({});
    const second = prepareWithCheckIn({});
    expect(first.status).toBe('needs_setup');
    if (first.status !== 'needs_setup') return;
    expect(first.missing.length).toBeGreaterThan(0);
    expect(first.missing.every(gap => gap.kind === 'current_condition')).toBe(true);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('defaults now to asOf deterministically when omitted', () => {
    const explicit = prepareGuidance({
      snapshot: snapshot(),
      bundle: validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), NOW),
      goalId: 'basic_wash',
      requestId: 'request-checkin',
      asOf: AS_OF,
      currentCondition: checkIn(),
      now: new Date(AS_OF),
    } satisfies PrepareGuidanceInput);
    const fallback = prepareGuidance({
      snapshot: snapshot(),
      bundle: validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), NOW),
      goalId: 'basic_wash',
      requestId: 'request-checkin',
      asOf: AS_OF,
      currentCondition: checkIn(),
    } satisfies PrepareGuidanceInput);
    expect(fallback.status).toBe('ready');
    expect(JSON.stringify(fallback)).toBe(JSON.stringify(explicit));
  });

  it('rethrown unexpected failures loudly instead of turning them into gaps', () => {
    const exploding = new Proxy(
      {},
      {
        get() {
          throw new Error('boom');
        },
      },
    );
    expect(() => prepareWithCheckIn(exploding)).toThrow('boom');
  });

  it('treats none as a definitive answer and stays ready', () => {
    const result = prepareWithCheckIn(checkIn({ concerns: ['none'] }));
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.environmentFacts['current.goal']).toBe('basic_wash');
    expect(result.context.environmentFacts['current.availableMinutes']).toBe(20);
    expect(
      Object.keys(result.context.environmentFacts).filter(key =>
        key.startsWith('current.concerns.'),
      ),
    ).toEqual([]);
  });

  it('rejects notes and unrecognized keys through the allowlist', () => {
    const result = prepareWithCheckIn(
      checkIn({
        notes: 'Scribbled free-text symptom',
        extraKey: 'planted-unknown-value',
        maximumProductBudgetZar: 987654,
      }),
    );
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.every(gap => gap.kind === 'current_condition')).toBe(true);
    const output = JSON.stringify(result);
    // Planted values never reach the context: only the targeted subjects name
    // the offending fields.
    expect(output).not.toContain('Scribbled free-text symptom');
    expect(output).not.toContain('planted-unknown-value');
    expect(output).not.toContain('987654');
  });

  it('rejects a saveToPassport persistence flag at the preparation boundary', () => {
    const result = prepareWithCheckIn(checkIn({ saveToPassport: true }));
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.every(gap => gap.kind === 'current_condition')).toBe(true);
    expect(JSON.stringify(result)).not.toContain('saveToPassport');
  });

  it('rejects nested unknown zone keys through the preparation boundary', () => {
    const tainted = prepareWithCheckIn(
      checkIn({ zones: [{ region: 'front', segment: 'roots', bogusZoneKey: 'planted-zone-value' }] }),
    );
    expect(tainted.status).toBe('needs_setup');
    if (tainted.status !== 'needs_setup') return;
    const output = JSON.stringify(tainted);
    expect(output).not.toContain('bogusZoneKey');
    expect(output).not.toContain('planted-zone-value');
    // Positive control: well-formed zones are accepted, and structured zones
    // are not flattened into invented scalars.
    const accepted = prepareWithCheckIn(
      checkIn({ zones: [{ region: 'front', segment: 'roots' }] }),
    );
    expect(accepted.status).toBe('ready');
    if (accepted.status !== 'ready') return;
    expect(
      Object.keys(accepted.context.environmentFacts).filter(key => key.startsWith('current.zone')),
    ).toEqual([]);
  });

  it('honours the injected now instead of the wall clock', () => {
    // 2026-10-12 is after the injected now (10-11) but before the wall clock
    // (2026-10-13), so only explicit threading rejects it.
    const result = prepareWithCheckIn(
      checkIn({ observedAt: '2026-10-12T08:00:00.000+02:00' }),
    );
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.map(gap => gap.subject)).toContain('current.observedAt');
  });

  it('refuses draft or withdrawn bundles even with a check-in present', () => {
    // Guard: the publication gate runs before preparation, so a check-in can
    // never make draft content executable. The service maps this throw to
    // content_pending; preparation itself is never reached.
    for (const status of ['draft', 'withdrawn'] as const) {
      expect(() => prepareWithCheckIn(checkIn(), snapshot(), bundle({ status }))).toThrow();
    }
  });

  it('produces a context the engine accepts with a check-in present', () => {
    const result = prepareWithCheckIn(checkIn({ concerns: ['dryness', 'frizz'] }));
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    // The check-in was admitted (positive control): namespaced facts exist.
    expect(result.context.environmentFacts['current.concerns.dryness']).toBe(true);
    expect(() => RecommendationContextSchema.parse(result.context)).not.toThrow();
    const decision = generateProtocol(result.context);
    expect(decision.status).toBe('ready');
    expect(decision.steps.length).toBeGreaterThan(0);
  });
});

describe('task 3.1: one deterministic prepared guidance input', () => {
  const T31_NOW = new Date('2026-10-11T09:00:00.000+02:00');
  const ZONE_A = { region: 'front', segment: 'roots' } as const;
  const ZONE_B = { region: 'crown', segment: 'ends' } as const;

  function conditionInput(overrides: Record<string, unknown> = {}) {
    return { observedAt: '2026-10-11T08:00:00.000+02:00', concerns: ['dryness'], goal: 'basic_wash', availableMinutes: 25, ...overrides };
  }

  function prepareInput(snapshotInput: GuidanceSnapshot = snapshot(), currentCondition?: unknown, bundleInput: ReviewedGuidanceBundle = bundle()) {
    return prepareGuidance({
      snapshot: snapshotInput,
      bundle: validatePublishedBundle(bundleInput, evidenceRegistry(), capabilityReview(), NOW),
      goalId: 'basic_wash',
      requestId: 'request-31',
      asOf: AS_OF,
      currentCondition,
      now: T31_NOW,
    } satisfies PrepareGuidanceInput);
  }

  function readyPrepared(result: GuidancePreparation): PreparedGuidanceInput {
    if (result.status !== 'ready') throw new Error(`expected ready, got ${result.status}`);
    return result.prepared;
  }

  const sourceItem = (id: string, overrides: Record<string, unknown> = {}) => ({
    ownerItemId: id, versionId: null, name: `Synthetic ${id}`, availability: 'available' as const, revision: 1, ...overrides,
  });

  it('carries the goal, the available time, the Passport facts and the source completeness', () => {
    const prepared = readyPrepared(prepareInput(snapshot({ passportFacts: { naturalPattern: 'curly', density: 'medium' } }), conditionInput()));
    expect(prepared.schemaVersion).toBe(1);
    expect(prepared.goal).toEqual({ id: 'basic_wash', label: 'Basic wash' });
    expect(prepared.availableMinutes).toBe(25);
    expect(prepared.passport.facts).toEqual({ density: 'medium', naturalPattern: 'curly' });
    expect(Object.keys(prepared.completeness)).toEqual(['activities', 'passport', 'products', 'services', 'tools']);
    expect(Object.values(prepared.completeness)).toEqual(['complete', 'complete', 'complete', 'complete', 'complete']);
  });

  it('reaches the prepared context with dryness, and keeps no check-in answer when none was given', () => {
    const withCheckIn = readyPrepared(prepareInput(snapshot(), conditionInput({ concerns: ['dryness'] })));
    expect(withCheckIn.currentCondition?.concerns).toEqual(['dryness']);
    const without = readyPrepared(prepareInput(snapshot()));
    expect(without.currentCondition).toBeNull();
    expect(without.availableMinutes).toBeNull();
  });

  it('keeps breakage, tangling, frizz and buildup distinct, in canonical order, in the prepared input and the engine facts', () => {
    const result = prepareInput(snapshot(), conditionInput({ concerns: ['buildup', 'frizz', 'tangling', 'breakage'] }));
    expect(readyPrepared(result).currentCondition?.concerns).toEqual(['breakage', 'buildup', 'frizz', 'tangling']);
    if (result.status !== 'ready') throw new Error('not ready');
    for (const concern of ['breakage', 'buildup', 'frizz', 'tangling']) expect(result.context.environmentFacts[`current.concerns.${concern}`]).toBe(true);
    expect(result.context.environmentFacts['current.concerns.dryness']).toBeUndefined();
  });

  it('keeps scalp discomfort a cosmetic observation: no diagnosis, severity or condition name appears anywhere', () => {
    const prepared = readyPrepared(prepareInput(snapshot(), conditionInput({ concerns: ['scalp-discomfort'] })));
    expect(prepared.currentCondition?.concerns).toEqual(['scalp-discomfort']);
    expect(Object.keys(prepared.currentCondition ?? {}).sort()).toEqual(['concerns', 'explicitNone', 'observedAt', 'zoneConcerns', 'zones']);
    expect(JSON.stringify(prepared)).not.toMatch(/diagnos|disease|dermatitis|infection|severity|symptom/i);
  });

  it('keeps chemical-processing and heat concerns distinct from each other and from the stored history', () => {
    const chemical = readyPrepared(prepareInput(snapshot(), conditionInput({ concerns: ['chemical-processing-concern'] })));
    const heat = readyPrepared(prepareInput(snapshot(), conditionInput({ concerns: ['heat-concern'] })));
    expect(chemical.currentCondition?.concerns).toEqual(['chemical-processing-concern']);
    expect(heat.currentCondition?.concerns).toEqual(['heat-concern']);
    // A concern is the person's worry today. It records no service and no heat event.
    expect(chemical.chemicalServices).toEqual([]);
    expect(heat.heatHistory).toEqual([]);
  });

  it('keeps zone-specific concerns attached to their zones, sorted, with explicit none stated', () => {
    const prepared = readyPrepared(prepareInput(snapshot(), conditionInput({
      concerns: ['dryness', 'breakage'], zones: [ZONE_A, ZONE_B],
      zoneConcerns: [{ zone: ZONE_A, concerns: ['dryness'] }, { zone: ZONE_B, concerns: ['dryness', 'breakage'] }],
    })));
    expect(prepared.currentCondition?.zones).toEqual([ZONE_B, ZONE_A]);
    expect(prepared.currentCondition?.zoneConcerns).toEqual([
      { zone: ZONE_B, concerns: ['breakage', 'dryness'] },
      { zone: ZONE_A, concerns: ['dryness'] },
    ]);
    expect(readyPrepared(prepareInput(snapshot(), conditionInput({ concerns: ['none'] }))).currentCondition).toMatchObject({ explicitNone: true, concerns: ['none'] });
    expect(readyPrepared(prepareInput(snapshot(), conditionInput())).currentCondition).toMatchObject({ explicitNone: false, zones: [], zoneConcerns: [] });
  });

  describe('Passport baseline and temporary precedence', () => {
    const passportFacts = { naturalPattern: 'curly', damageObservation: 'none', heatPreference: 'minimise-heat' };
    const fact = (prepared: PreparedGuidanceInput, dimension: string) => prepared.effectiveFacts.find(entry => entry.dimension === dimension);

    it('lets a temporary answer override a recorded baseline for this request only, and keeps the baseline visible', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ passportFacts }), conditionInput({ concerns: ['reported-damage'] })));
      expect(fact(prepared, 'damage')).toEqual({
        dimension: 'damage', baseline: { state: 'recorded', value: 'none' }, current: 'reported', effective: 'current', overridden: true,
      });
      // The durable baseline is still reported as it is stored.
      expect(prepared.passport.facts.damageObservation).toBe('none');
    });

    it('adds a temporary answer where the Passport recorded nothing, without calling it an override', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ passportFacts: { naturalPattern: 'curly' } }), conditionInput({ concerns: ['heat-concern'] })));
      expect(fact(prepared, 'heat')).toEqual({
        dimension: 'heat', baseline: { state: 'not_recorded', value: null }, current: 'reported', effective: 'current', overridden: false,
      });
    });

    it('uses the unchanged Passport baseline for a second request that has no check-in', () => {
      const stored = snapshot({ passportFacts });
      const first = readyPrepared(prepareInput(stored, conditionInput({ concerns: ['reported-damage', 'heat-concern'] })));
      const second = readyPrepared(prepareInput(stored));
      expect(fact(first, 'damage')?.effective).toBe('current');
      expect(fact(second, 'damage')).toEqual({
        dimension: 'damage', baseline: { state: 'recorded', value: 'none' }, current: 'not_answered', effective: 'baseline', overridden: false,
      });
      expect(second.passport.facts).toEqual(first.passport.facts);
      expect(JSON.stringify(stored)).toBe(JSON.stringify(snapshot({ passportFacts })));
    });

    it('does not let a missing temporary answer erase a recorded Passport fact', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ passportFacts }), conditionInput({ concerns: ['dryness'] })));
      expect(fact(prepared, 'damage')).toMatchObject({ current: 'not_answered', effective: 'baseline', overridden: false });
      expect(fact(prepared, 'heat')).toMatchObject({ baseline: { state: 'recorded', value: 'minimise-heat' }, effective: 'baseline' });
      expect(prepared.passport.facts.heatPreference).toBe('minimise-heat');
    });

    it('keeps an explicit unknown unknown: a baseline of unknown is not replaced by a guess', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ passportFacts: { ...passportFacts, damageObservation: 'unknown' } }), conditionInput({ concerns: ['dryness'] })));
      expect(fact(prepared, 'damage')).toEqual({
        dimension: 'damage', baseline: { state: 'unknown', value: 'unknown' }, current: 'not_answered', effective: 'baseline', overridden: false,
      });
    });

    it('treats an explicit none today as a temporary answer that still leaves the stored baseline untouched', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ passportFacts: { ...passportFacts, damageObservation: 'moderate' } }), conditionInput({ concerns: ['none'] })));
      expect(fact(prepared, 'damage')).toEqual({
        dimension: 'damage', baseline: { state: 'recorded', value: 'moderate' }, current: 'none', effective: 'current', overridden: true,
      });
      expect(prepared.passport.facts.damageObservation).toBe('moderate');
    });
  });

  describe('owner records as context', () => {
    it('lists only available records, never archived, empty, low or out-of-stock ones', () => {
      const prepared = readyPrepared(prepareInput(snapshot({
        products: [
          sourceItem('p-ok'), sourceItem('p-archived', { availability: 'archived' }), sourceItem('p-empty', { availability: 'empty' }),
          sourceItem('p-low', { availability: 'low' }), sourceItem('p-out', { availability: 'out_of_stock' }),
        ],
        tools: [sourceItem('t-ok'), sourceItem('t-archived', { availability: 'archived' }), sourceItem('t-out', { availability: 'out_of_stock' })],
      })));
      expect(prepared.products.map(item => item.ownerItemId)).toEqual(['p-ok']);
      expect(prepared.tools.map(item => item.ownerItemId)).toEqual(['t-ok']);
    });

    it('keeps a manual product visible as context but never lets it satisfy an exact reviewed capability', () => {
      const result = prepareInput(snapshot({ products: [sourceItem('p-manual', { name: 'My unlabelled cleansing bottle' })] }));
      const prepared = readyPrepared(result);
      expect(prepared.products).toEqual([{
        ownerItemId: 'p-manual', name: 'My unlabelled cleansing bottle', identity: 'manual', versionId: null, review: 'not_applicable', verifiedCapabilities: [], satisfiesExactCapability: false,
      }]);
      if (result.status !== 'ready') throw new Error('not ready');
      expect(result.context.products).toEqual([]);
    });

    it('marks a matched exact version with no published entry as not reviewed, and a reviewed one as satisfying its capability only', () => {
      const unreviewed = '99999999-9999-4999-8999-999999999999';
      const prepared = readyPrepared(prepareInput(snapshot({
        products: [sourceItem('p-reviewed', { versionId: PRODUCT_VERSION }), sourceItem('p-unreviewed', { versionId: unreviewed })],
      })));
      expect(prepared.products.find(item => item.ownerItemId === 'p-unreviewed')).toMatchObject({
        identity: 'exact', review: 'not_reviewed', verifiedCapabilities: [], satisfiesExactCapability: false,
      });
      expect(prepared.products.find(item => item.ownerItemId === 'p-reviewed')).toMatchObject({
        identity: 'exact', review: 'reviewed', verifiedCapabilities: ['cleanse'], satisfiesExactCapability: true,
      });
    });

    it('never creates efficacy or capability from a name, a category word or an ingredient list in the name', () => {
      const prepared = readyPrepared(prepareInput(snapshot({
        products: [sourceItem('p-protein', { name: 'Protein repair shampoo with ceramides and keratin' })],
        tools: [sourceItem('t-steam', { name: 'Steam straightener 230 degrees heated air' })],
      })));
      expect(prepared.products[0].verifiedCapabilities).toEqual([]);
      expect(prepared.products[0].satisfiesExactCapability).toBe(false);
      expect(prepared.tools[0].verifiedCapabilities).toEqual([]);
      expect(prepared.tools[0].satisfiesExactCapability).toBe(false);
    });

    it('shows a tool name as a name only: it never becomes a heat method, a temperature or a wattage', () => {
      const tool = readyPrepared(prepareInput(snapshot({ tools: [sourceItem('t-steam', { name: 'Steam straightener 230 degrees 1800 watts' })] }))).tools[0];
      expect(tool.ownerFacts).toEqual({
        wattageWatts: null, adjustableTemp: 'not_answered',
        settings: { state: 'not_answered', recordedTemperatures: [] },
        heatMethods: { state: 'not_answered', methods: [] },
      });
    });

    it('keeps a recorded wattage as a wattage: an unknown temperature stays unknown and nothing is derived', () => {
      const tool = readyPrepared(prepareInput(snapshot({ tools: [sourceItem('t-dryer', { ownerFacts: {
        wattageWatts: 1900, adjustableTemp: 'unknown', settings: { state: 'unknown' }, heatMethods: { state: 'unknown' } } })] }))).tools[0];
      expect(tool.ownerFacts.wattageWatts).toBe(1900);
      expect(tool.ownerFacts.settings).toEqual({ state: 'unknown', recordedTemperatures: [] });
      expect(tool.ownerFacts.heatMethods).toEqual({ state: 'unknown', methods: [] });
      expect(JSON.stringify(tool)).not.toMatch(/temperatureC|degrees|celsius/i);
    });

    it('carries a temperature only when the owner recorded it, in the unit they recorded it in', () => {
      const tool = readyPrepared(prepareInput(snapshot({ tools: [sourceItem('t-iron', { ownerFacts: {
        wattageWatts: null, adjustableTemp: 'yes',
        settings: { state: 'recorded', items: [{ label: 'Low', temperature: null }, { label: 'Plate', temperature: { value: 350, unit: 'F' } }] },
        heatMethods: { state: 'recorded', methods: ['direct-contact'] } } })] }))).tools[0];
      expect(tool.ownerFacts.settings).toEqual({ state: 'recorded', recordedTemperatures: [{ label: 'Plate', value: 350, unit: 'F' }] });
      expect(tool.ownerFacts.heatMethods).toEqual({ state: 'recorded', methods: ['direct-contact'] });
      expect(tool.ownerFacts.adjustableTemp).toBe('yes');
    });
  });

  describe('chemical and heat history and recorded activity', () => {
    it('lists chemical services with their presence, zones and date precision, sorted by service', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ services: [
        { serviceId: 'svc-b', currentPresence: 'not-present', effectiveStart: { precision: 'month', value: '2026-06' }, facts: {}, zones: [ZONE_B] },
        { serviceId: 'svc-a', currentPresence: 'not-present', effectiveStart: null, facts: {} },
      ] })));
      expect(prepared.chemicalServices).toEqual([
        { serviceId: 'svc-a', presence: 'not-present', effectiveStart: null, zones: [] },
        { serviceId: 'svc-b', presence: 'not-present', effectiveStart: { precision: 'month', value: '2026-06' }, zones: [ZONE_B] },
      ]);
    });

    it('lists only recorded heat, leaves unrecorded values null and invents none', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ services: [
        { serviceId: 'svc-heat', currentPresence: 'not-present', effectiveStart: null, facts: {}, zones: [ZONE_A],
          heat: { method: 'flat-iron', temperatureC: 180, passes: null, source: 'user-estimated' } },
        { serviceId: 'svc-none', currentPresence: 'not-present', effectiveStart: null, facts: {}, heat: null },
        { serviceId: 'svc-unknown', currentPresence: 'not-present', effectiveStart: null, facts: {}, heat: { method: 'unknown', source: 'user-reported' } },
      ] })));
      expect(prepared.heatHistory).toEqual([
        { serviceId: 'svc-heat', method: 'flat-iron', temperatureC: 180, passes: null, durationMinutes: null, source: 'user-estimated', zones: [ZONE_A] },
        { serviceId: 'svc-unknown', method: 'unknown', temperatureC: null, passes: null, durationMinutes: null, source: 'user-reported', zones: [] },
      ]);
    });

    it('lists unvoided recorded activities with only their kind and precision', () => {
      const prepared = readyPrepared(prepareInput(snapshot({ activities: [
        { activityId: 'act-2', revision: 1, voided: false, appliedRevisionIds: ['r2'], facts: { activityKind: 'wash', precision: 'exact_day' } },
        { activityId: 'act-1', revision: 1, voided: false, appliedRevisionIds: ['r1'], facts: {} },
        { activityId: 'act-void', revision: 2, voided: true, appliedRevisionIds: ['r3'], facts: { activityKind: 'styling' } },
      ] })));
      expect(prepared.activities).toEqual([
        { activityId: 'act-1', kind: null, precision: null },
        { activityId: 'act-2', kind: 'wash', precision: 'exact_day' },
      ]);
    });
  });

  describe('determinism and immutability', () => {
    function crowded(order: 'forward' | 'reverse'): GuidanceSnapshot {
      const products = [sourceItem('p-1', { versionId: PRODUCT_VERSION }), sourceItem('p-2'), sourceItem('p-3', { availability: 'archived' })];
      const tools = [sourceItem('t-1', { versionId: TOOL_VERSION, ownerFacts: { wattageWatts: 1500, adjustableTemp: 'no', settings: null, heatMethods: null } }), sourceItem('t-2')];
      const services = [
        { serviceId: 's-1', currentPresence: 'not-present' as const, effectiveStart: null, facts: {}, zones: [ZONE_A, ZONE_B], heat: { method: 'blow-dryer' as const, source: 'user-reported' as const } },
        { serviceId: 's-2', currentPresence: 'not-present' as const, effectiveStart: null, facts: {} },
      ];
      const passportFacts = order === 'forward'
        ? { naturalPattern: 'curly', density: 'medium', heatPreference: 'avoid-heat' }
        : { heatPreference: 'avoid-heat', density: 'medium', naturalPattern: 'curly' };
      const flip = <T,>(items: T[]) => (order === 'forward' ? [...items] : [...items].reverse());
      return snapshot({ passportFacts, products: flip(products), tools: flip(tools), services: flip(services) });
    }

    it('produces byte-identical prepared input whatever the shelf, tool, service, concern, zone and key order', () => {
      const forward = prepareInput(crowded('forward'), conditionInput({ concerns: ['dryness', 'heat-concern', 'buildup'], zones: [ZONE_A, ZONE_B], zoneConcerns: [{ zone: ZONE_A, concerns: ['dryness', 'buildup'] }] }));
      const reverse = prepareInput(crowded('reverse'), {
        availableMinutes: 25, goal: 'basic_wash', observedAt: '2026-10-11T08:00:00.000+02:00',
        zoneConcerns: [{ concerns: ['buildup', 'dryness'], zone: { segment: 'roots', region: 'front' } }],
        zones: [ZONE_B, ZONE_A], concerns: ['buildup', 'heat-concern', 'dryness'],
      });
      expect(JSON.stringify(readyPrepared(forward))).toBe(JSON.stringify(readyPrepared(reverse)));
    });

    it('produces the same bytes for the same inputs and explicit time, run after run', () => {
      const input = crowded('forward');
      const first = JSON.stringify(readyPrepared(prepareInput(input, conditionInput())));
      const second = JSON.stringify(readyPrepared(prepareInput(input, conditionInput())));
      expect(first).toBe(second);
    });

    it('leaves the snapshot, the check-in and the bundle byte-equivalent, and freezes the prepared input', () => {
      const input = crowded('forward');
      const checkIn = conditionInput({ concerns: ['frizz', 'dryness'], zones: [ZONE_A], zoneConcerns: [{ zone: ZONE_A, concerns: ['frizz'] }] });
      const published = bundle();
      const before = [JSON.stringify(input), JSON.stringify(checkIn), JSON.stringify(published)];
      const prepared = readyPrepared(prepareInput(input, checkIn, published));
      expect([JSON.stringify(input), JSON.stringify(checkIn), JSON.stringify(published)]).toEqual(before);
      expect(Object.isFrozen(prepared)).toBe(true);
      expect(Object.isFrozen(prepared.products)).toBe(true);
      expect(Object.isFrozen(prepared.currentCondition?.concerns)).toBe(true);
      expect(() => (prepared.products as unknown as unknown[]).push({})).toThrow(TypeError);
    });

    it('does not put reviewer names, evidence ids, claims or rules in the prepared input', () => {
      const text = JSON.stringify(readyPrepared(prepareInput(crowded('forward'), conditionInput())));
      for (const forbidden of ['reviewedBy', 'authoredBy', 'evidenceIds', 'I. Fixture', 'fixture-evidence', 'rule-wash', 'claim']) {
        expect(text).not.toContain(forbidden);
      }
    });
  });

  describe('fail-closed and structured gaps', () => {
    it('never prepares from a source that failed, was missing or was cut short, and says which', () => {
      const result = prepareInput(snapshot({ completeness: { passport: 'failed', services: 'complete', activities: 'truncated', products: 'complete', tools: 'missing' } }), conditionInput());
      expect(result).toEqual({
        status: 'unavailable', reason: 'snapshot_incomplete',
        incompleteSources: [{ source: 'activities', state: 'truncated' }, { source: 'passport', state: 'failed' }, { source: 'tools', state: 'missing' }],
      });
    });

    it('states each gap as missing, unknown or unsupported and names where it can be resolved', () => {
      const gaps = (result: GuidancePreparation) => (result.status === 'needs_setup' ? result.missing : []);
      expect(gaps(prepareInput(snapshot({ passportFacts: {} }))).find(gap => gap.kind === 'hair_profile')).toMatchObject({
        subject: 'naturalPattern', state: 'missing', destination: 'my_hair',
      });
      const unknownService = gaps(prepareInput(snapshot({ services: [{ serviceId: 's-u', currentPresence: 'unknown', effectiveStart: null, facts: {} }] })));
      expect(unknownService[0]).toMatchObject({ kind: 'service_presence', state: 'unknown', destination: 'my_hair_services' });
      const presentService = gaps(prepareInput(snapshot({ services: [{ serviceId: 's-p', currentPresence: 'present', effectiveStart: null, facts: {} }] })));
      expect(presentService[0]).toMatchObject({ kind: 'service_presence', state: 'unsupported', destination: 'my_hair_services' });
      const unknownConcern = gaps(prepareInput(snapshot(), conditionInput({ concerns: ['unknown'] })));
      expect(unknownConcern[0]).toMatchObject({ kind: 'current_condition', state: 'unknown', destination: 'today_check_in' });
    });

    it('names a contradictory, a missing and an unsupported check-in answer differently', () => {
      const gaps = (current: unknown) => {
        const result = prepareInput(snapshot(), current);
        return result.status === 'needs_setup' ? result.missing : [];
      };
      expect(gaps(conditionInput({ concerns: ['none', 'dryness'] }))[0]).toMatchObject({ state: 'contradictory', destination: 'today_check_in' });
      expect(gaps(conditionInput({ zones: [ZONE_A], zoneConcerns: [{ zone: ZONE_B, concerns: ['dryness'] }] }))[0]).toMatchObject({ state: 'contradictory' });
      const { availableMinutes: _omitted, ...withoutMinutes } = conditionInput();
      expect(gaps(withoutMinutes)[0]).toMatchObject({ state: 'missing', destination: 'today_check_in' });
      expect(gaps(conditionInput({ notes: 'itchy' }))[0]).toMatchObject({ state: 'unsupported', destination: 'today_check_in' });
    });

    it('keeps every gap free of diagnosis, raw values and internal detail', () => {
      const result = prepareInput(snapshot({ passportFacts: {} }), conditionInput({ concerns: ['none', 'dryness'], notes: 'itchy' }));
      const text = JSON.stringify(result);
      expect(text).not.toMatch(/itchy|diagnos|zod|undefined|\[object|stack|select |owner-1/i);
    });

    it('still refuses a draft or withdrawn bundle even with a complete check-in', () => {
      expect(() => prepareInput(snapshot(), conditionInput(), bundle({ status: 'draft' }))).toThrow();
    });

    it('words every gap in plain language: no field path, record id, quoted internal term or jargon', () => {
      const services = [
        { serviceId: 'svc-zzz-internal-id', currentPresence: 'unknown' as const, effectiveStart: null, facts: {} },
        { serviceId: 'svc-yyy-internal-id', currentPresence: 'present' as const, effectiveStart: null, facts: {} },
      ];
      const texts = [
        prepareInput(snapshot({ passportFacts: {}, services })),
        prepareInput(snapshot(), conditionInput({ concerns: ['unknown'] })),
        prepareInput(snapshot(), conditionInput({ concerns: ['none', 'dryness'] })),
        prepareInput(snapshot(), conditionInput({ notes: 'x' })),
        prepareInput(snapshot(), conditionInput({ observedAt: '2026-10-12T08:00:00.000+02:00' })),
        prepareInput(snapshot(), (({ availableMinutes: _m, ...rest }) => rest)(conditionInput())),
      ].flatMap(result => (result.status === 'needs_setup' ? result.missing.map(gap => gap.detail) : []));
      expect(texts.length).toBeGreaterThanOrEqual(7);
      for (const text of texts) {
        expect(text).not.toMatch(/current\.|svc-|naturalPattern|'unknown'|reviewed rule|temporary check-in|[a-z]+[A-Z][a-z]+/);
        expect(text).toMatch(/[.!?]$/);
      }
    });

    it('never throws on a snapshot the prepared schema refuses: it fails closed as unavailable', () => {
      const unusable = snapshot({ services: [{ serviceId: 's-1', currentPresence: 'not-present', effectiveStart: null, facts: {}, heat: { method: 'flat-iron', passes: 1.5, source: 'user-reported' } }] });
      expect(prepareInput(unusable)).toEqual({ status: 'unavailable', reason: 'snapshot_incomplete' });
    });
  });

  describe('canonical ordering of recorded values', () => {
    const iron = (items: unknown[]) => sourceItem('t-iron', { ownerFacts: {
      wattageWatts: null, adjustableTemp: 'yes', settings: { state: 'recorded', items }, heatMethods: null } });
    const low = { label: 'Low', temperature: { value: 150, unit: 'C' } };
    const high = { label: 'High', temperature: { value: 230, unit: 'C' } };

    it('lists recorded setting temperatures in label order whatever order they were saved in', () => {
      const forward = readyPrepared(prepareInput(snapshot({ tools: [iron([low, high])] }))).tools[0].ownerFacts.settings;
      const reverse = readyPrepared(prepareInput(snapshot({ tools: [iron([high, low])] }))).tools[0].ownerFacts.settings;
      expect(forward.recordedTemperatures.map(entry => entry.label)).toEqual(['High', 'Low']);
      expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));
    });

    it('sorts service zones, heat zones and zone-attached concerns itself, without relying on the check-in schema', () => {
      const input = {
        snapshot: snapshot({ services: [{ serviceId: 's-1', currentPresence: 'not-present', effectiveStart: null, facts: {}, zones: [ZONE_A, ZONE_B], heat: { method: 'blow-dryer', source: 'user-reported' } }] }),
        bundle: validatePublishedBundle(bundle(), evidenceRegistry(), capabilityReview(), NOW),
        goal: { id: 'basic_wash' as const, label: 'Basic wash', requiredProfileFacts: [] },
        condition: {
          observedAt: '2026-10-11T08:00:00.000+02:00', concerns: ['dryness'] as ['dryness'], goal: 'basic_wash' as const, availableMinutes: 5,
          zones: [ZONE_A, ZONE_B], zoneConcerns: [{ zone: ZONE_A, concerns: ['dryness' as const] }, { zone: ZONE_B, concerns: ['dryness' as const] }],
        },
      };
      const prepared = buildPreparedInput(input);
      expect(prepared.chemicalServices[0].zones).toEqual([ZONE_B, ZONE_A]);
      expect(prepared.heatHistory[0].zones).toEqual([ZONE_B, ZONE_A]);
      expect(prepared.currentCondition?.zones).toEqual([ZONE_B, ZONE_A]);
      expect(prepared.currentCondition?.zoneConcerns.map(entry => entry.zone)).toEqual([ZONE_B, ZONE_A]);
    });
  });
});

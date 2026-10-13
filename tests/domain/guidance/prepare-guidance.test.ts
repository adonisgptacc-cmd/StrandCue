import { describe, expect, it } from 'vitest';

import {
  generateProtocol,
  prepareGuidance,
  RecommendationContextSchema,
  validatePublishedBundle,
  type GuidancePreparation,
  type GuidanceSnapshot,
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
    expect(result).toEqual({ status: 'unavailable', reason: 'snapshot_incomplete' });
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
      saveToPassport: false,
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

  it('never turns the saveToPassport flag into a fact', () => {
    const result = prepareWithCheckIn(checkIn({ saveToPassport: true }));
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    // The check-in was admitted (positive control): namespaced facts exist.
    expect(result.context.environmentFacts['current.goal']).toBe('basic_wash');
    expect(JSON.stringify(result.context)).not.toContain('saveToPassport');
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

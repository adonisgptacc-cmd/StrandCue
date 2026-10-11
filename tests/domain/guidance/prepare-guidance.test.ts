import { describe, expect, it } from 'vitest';

import {
  generateProtocol,
  prepareGuidance,
  RecommendationContextSchema,
  validatePublishedBundle,
  type GuidanceSnapshot,
  type PrepareGuidanceInput,
  type ReviewedGuidanceBundle,
} from '../../../packages/domain/src/index';

const AS_OF = '2026-10-11T09:00:00.000Z';
const REVIEWED_AT = '2026-10-01T00:00:00.000Z';
const NOW = '2026-10-11T09:00:00.000Z';

const CAP_PRODUCT = 'cap-product-1';
const CAP_TOOL = 'cap-tool-1';

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
        versionId: 'version-product-1',
        name: 'Owned shampoo',
        availability: 'available',
        revision: 3,
      },
    ],
    tools: [
      {
        ownerItemId: 'owner-tool-1',
        versionId: 'version-tool-1',
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
    version: '1',
    status: 'published',
    reviewedAt: REVIEWED_AT,
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['naturalPattern'] }],
    capabilities: [
      {
        kind: 'product',
        versionId: 'version-product-1',
        displayName: 'Synthetic product',
        verifiedCapabilities: [CAP_PRODUCT],
        evidenceIds: ['evidence-1'],
        status: 'published',
        reviewedAt: REVIEWED_AT,
      },
      {
        kind: 'tool',
        versionId: 'version-tool-1',
        displayName: 'Synthetic tool',
        verifiedCapabilities: [CAP_TOOL],
        evidenceIds: ['evidence-2'],
        status: 'published',
        reviewedAt: REVIEWED_AT,
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
        evidenceIds: ['evidence-1'],
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
    bundle: validatePublishedBundle(bundleInput, NOW),
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
    expect(product?.versionId).toBe('version-product-1');
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
    expect(() => validatePublishedBundle(withdrawn, NOW)).toThrow(/withdrawn/i);
  });

  it('marks archived and out-of-stock items as unavailable candidates', () => {
    const archived = snapshot({
      products: [
        {
          ownerItemId: 'owner-product-1',
          versionId: 'version-product-1',
          name: 'Old shampoo',
          availability: 'archived',
          revision: 3,
        },
      ],
      tools: [
        {
          ownerItemId: 'owner-tool-1',
          versionId: 'version-tool-1',
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
          effectiveStart: '2026-06-01',
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
          effectiveStart: '2026-06-01',
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
          effectiveStart: '2026-06-01',
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
    expect(result.status === 'ready' && result.bundleVersion).toBe('1');
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
        passportFacts: { naturalPattern: 'curly', zone: 'roots' },
        activities: [
          {
            activityId: 'activity-1',
            revision: 1,
            voided: false,
            facts: { zone: 'ends', activityKind: 'styling' },
          },
        ],
      }),
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.context.profileFacts.zone).toBe('roots');
    expect(result.context.historyFacts.zone).toBe('ends');
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
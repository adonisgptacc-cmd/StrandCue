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
import { CHECKED_IN_CAPABILITY_REVIEW } from '../../../apps/mobile/src/guidance/capability-review';
import { CHECKED_IN_EVIDENCE_REGISTRY } from '../../../apps/mobile/src/guidance/evidence-registry';

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
    reviewedBy: 'reviewer-a',
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
        reviewedBy: 'reviewer-a',
      },
      {
        kind: 'tool',
        versionId: 'version-tool-1',
        displayName: 'Synthetic tool',
        verifiedCapabilities: [CAP_TOOL],
        evidenceIds: ['evidence-2'],
        status: 'published',
        reviewedAt: REVIEWED_AT,
        reviewedBy: 'reviewer-a',
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
    bundle: validatePublishedBundle(bundleInput, CHECKED_IN_EVIDENCE_REGISTRY, CHECKED_IN_CAPABILITY_REVIEW, NOW),
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
    expect(() =>
      validatePublishedBundle(withdrawn, CHECKED_IN_EVIDENCE_REGISTRY, CHECKED_IN_CAPABILITY_REVIEW, NOW),
    ).toThrow(/withdrawn/i);
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
    expect(result.status === 'ready' && result.bundleVersion).toBe('1');
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

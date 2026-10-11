import { describe, expect, it } from 'vitest';

import {
  GuidanceActivityFactSchema,
  GuidanceGapSchema,
  GuidanceGoalSchema,
  GuidancePreparationSchema,
  GuidanceServiceFactSchema,
  GuidanceSnapshotSchema,
  GuidanceSourceItemSchema,
  ReviewedCapabilityEntrySchema,
  ReviewedGuidanceBundleSchema,
} from '../../../packages/domain/src/guidance/index.ts';

const ISO = '2026-10-10T10:00:00.000Z';

function serviceFact(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: 'service-a',
    currentPresence: 'present',
    effectiveStart: '2026-01-01',
    facts: { chemicalType: 'bleach' },
    ...overrides,
  };
}

function activityFact(overrides: Record<string, unknown> = {}) {
  return {
    activityId: 'activity-a',
    revision: 3,
    voided: false,
    facts: { kind: 'wash' },
    ...overrides,
  };
}

function sourceItem(overrides: Record<string, unknown> = {}) {
  return {
    ownerItemId: 'owner-item-a',
    versionId: 'version-a',
    name: 'Recorded item',
    availability: 'available',
    revision: 2,
    ...overrides,
  };
}

function completeness(overrides: Record<string, unknown> = {}) {
  return {
    passport: 'complete',
    services: 'complete',
    activities: 'complete',
    products: 'complete',
    tools: 'complete',
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: 'owner-a',
    asOf: ISO,
    loadedAt: ISO,
    passportFacts: { pattern: 'curly' },
    services: [serviceFact()],
    activities: [activityFact()],
    products: [sourceItem()],
    tools: [sourceItem({ ownerItemId: 'owner-tool-a', versionId: 'tool-version-a' })],
    completeness: completeness(),
    ...overrides,
  };
}

function capabilityEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: 'version-a',
    displayName: 'Reviewed product',
    verifiedCapabilities: ['mild-cleanse'],
    evidenceIds: ['evidence-1'],
    status: 'published',
    reviewedAt: ISO,
    ...overrides,
  };
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-clean',
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
    effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }],
    reason: 'Reviewed reason.',
    evidenceIds: ['evidence-1'],
    ...overrides,
  };
}

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'basic_wash',
    label: 'Basic wash',
    requiredProfileFacts: ['pattern'],
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: 'bundle-a',
    version: '1',
    status: 'published',
    reviewedAt: ISO,
    goals: [goal()],
    capabilities: [capabilityEntry()],
    rules: [rule()],
    ...overrides,
  };
}

describe('guidance source contracts', () => {
  it('parses a complete owner snapshot', () => {
    const parsed = GuidanceSnapshotSchema.parse(snapshot());
    expect(parsed.ownerId).toBe('owner-a');
    expect(parsed.services[0].currentPresence).toBe('present');
    expect(parsed.products[0].versionId).toBe('version-a');
    expect(parsed.completeness.products).toBe('complete');
  });

  it('keeps a manual item with a null version id', () => {
    const parsed = GuidanceSnapshotSchema.parse(
      snapshot({ products: [sourceItem({ versionId: null })] }),
    );
    expect(parsed.products[0].versionId).toBeNull();
  });

  it('records an unconfirmed service presence without inferring it', () => {
    const parsed = GuidanceSnapshotSchema.parse(
      snapshot({
        services: [
          serviceFact({ currentPresence: 'unknown', effectiveStart: null, facts: {} }),
        ],
      }),
    );
    expect(parsed.services[0].currentPresence).toBe('unknown');
    expect(parsed.services[0].effectiveStart).toBeNull();
  });

  it('rejects unknown keys on every guidance object', () => {
    expect(() => GuidanceSourceItemSchema.parse({ ...sourceItem(), extra: 1 })).toThrow();
    expect(() => GuidanceServiceFactSchema.parse({ ...serviceFact(), extra: 1 })).toThrow();
    expect(() => GuidanceActivityFactSchema.parse({ ...activityFact(), extra: 1 })).toThrow();
    expect(() => GuidanceGoalSchema.parse({ ...goal(), extra: 1 })).toThrow();
    expect(() =>
      ReviewedCapabilityEntrySchema.parse({ ...capabilityEntry(), extra: 1 }),
    ).toThrow();
  });

  it('rejects blank identifiers and negative revisions', () => {
    expect(() => GuidanceSourceItemSchema.parse(sourceItem({ ownerItemId: '   ' }))).toThrow();
    expect(() => GuidanceSourceItemSchema.parse(sourceItem({ name: '' }))).toThrow();
    expect(() => GuidanceActivityFactSchema.parse(activityFact({ revision: -1 }))).toThrow();
  });

  it('rejects duplicate identities inside a snapshot', () => {
    expect(() =>
      GuidanceSnapshotSchema.parse(snapshot({ services: [serviceFact(), serviceFact()] })),
    ).toThrow();
    expect(() =>
      GuidanceSnapshotSchema.parse(snapshot({ activities: [activityFact(), activityFact()] })),
    ).toThrow();
    expect(() =>
      GuidanceSnapshotSchema.parse(
        snapshot({ products: [sourceItem(), sourceItem()], tools: [] }),
      ),
    ).toThrow();
    expect(() =>
      GuidanceSnapshotSchema.parse(
        snapshot({
          tools: [sourceItem({ ownerItemId: 'same' }), sourceItem({ ownerItemId: 'same' })],
        }),
      ),
    ).toThrow();
  });

  it('rejects invalid ISO timestamps', () => {
    expect(() => GuidanceSnapshotSchema.parse(snapshot({ asOf: '2026-10-10' }))).toThrow();
    expect(() => GuidanceSnapshotSchema.parse(snapshot({ loadedAt: 'yesterday' }))).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(bundle({ reviewedAt: 'not-a-time' })),
    ).toThrow();
  });

  it('requires a completeness verdict for every source', () => {
    expect(() =>
      GuidanceSnapshotSchema.parse(
        snapshot({ completeness: { passport: 'complete' } }),
      ),
    ).toThrow();
    const partial = completeness();
    delete (partial as Record<string, unknown>).tools;
    expect(() => GuidanceSnapshotSchema.parse(snapshot({ completeness: partial }))).toThrow();
  });

  it('rejects unknown completeness and availability verdicts', () => {
    expect(() =>
      GuidanceSnapshotSchema.parse(snapshot({ completeness: completeness({ tools: 'partial' }) })),
    ).toThrow();
    expect(() =>
      GuidanceSnapshotSchema.parse(
        snapshot({ products: [sourceItem({ availability: 'low' })], tools: [] }),
      ),
    ).toThrow();
  });

  it('freezes parsed output so later mutation cannot alter a snapshot', () => {
    const parsed = GuidanceSnapshotSchema.parse(snapshot());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.products)).toBe(true);
    expect(() => {
      (parsed.products as unknown as Record<string, unknown>)[0] = sourceItem();
    }).toThrow(TypeError);
    expect(() => {
      (parsed.products[0] as unknown as Record<string, unknown>).name = 'renamed';
    }).toThrow(TypeError);
  });
});

describe('reviewed guidance bundles', () => {
  it('parses a published bundle with goals, capabilities and rules', () => {
    const parsed = ReviewedGuidanceBundleSchema.parse(bundle());
    expect(parsed.status).toBe('published');
    expect(parsed.capabilities[0].verifiedCapabilities).toEqual(['mild-cleanse']);
    expect(parsed.rules[0].ruleId).toBe('rule-clean');
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('rejects an unsupported bundle version', () => {
    expect(() => ReviewedGuidanceBundleSchema.parse(bundle({ version: '2' }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(bundle({ version: '' }))).toThrow();
  });

  it('rejects duplicate capability mappings for the same kind and version', () => {
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        bundle({
          capabilities: [capabilityEntry(), capabilityEntry({ displayName: 'Other' })],
        }),
      ),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        bundle({
          capabilities: [
            capabilityEntry(),
            capabilityEntry({ kind: 'tool', verifiedCapabilities: ['diffuser-dry'] }),
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects duplicate rule versions and duplicate goals', () => {
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(bundle({ rules: [rule(), rule()] })),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(bundle({ goals: [goal(), goal()] })),
    ).toThrow();
  });

  it('requires evidence for every capability entry and rule', () => {
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(bundle({ capabilities: [capabilityEntry({ evidenceIds: [] })] })),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(bundle({ rules: [rule({ evidenceIds: [] })] })),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        bundle({ capabilities: [capabilityEntry({ evidenceIds: [] })], rules: [] }),
      ),
    ).toThrow();
  });

  it('rejects duplicate capability names inside one entry', () => {
    expect(() =>
      ReviewedCapabilityEntrySchema.parse(
        capabilityEntry({ verifiedCapabilities: ['mild-cleanse', 'mild-cleanse'] }),
      ),
    ).toThrow();
  });
});

function recommendationContext(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'request-a',
    asOf: ISO,
    goal: 'basic_wash',
    profileFacts: { pattern: 'curly' },
    products: [],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [],
    ...overrides,
  };
}

describe('guidance preparation contracts', () => {
  it('parses a ready preparation carrying a complete engine context', () => {
    const parsed = GuidancePreparationSchema.parse({
      status: 'ready',
      context: recommendationContext(),
      bundleId: 'bundle-a',
      bundleVersion: '1',
    });
    expect(parsed.status).toBe('ready');
    expect(parsed.status === 'ready' && parsed.context.requestId).toBe('request-a');
    expect(parsed.status === 'ready' && parsed.bundleVersion).toBe('1');
  });

  it('rejects a ready preparation with an incomplete engine context', () => {
    expect(() =>
      GuidancePreparationSchema.parse({
        status: 'ready',
        context: { requestId: 'request-a' },
        bundleId: 'bundle-a',
        bundleVersion: '1',
      }),
    ).toThrow();
  });

  it('parses a needs-setup preparation with gaps', () => {
    const parsed = GuidancePreparationSchema.parse({
      status: 'needs_setup',
      missing: [
        { kind: 'hair_profile', detail: 'pattern is not recorded', subject: 'pattern' },
        { kind: 'service_presence', detail: 'presence unknown', subject: 'service-a' },
      ],
    });
    expect(parsed.status === 'needs_setup' && parsed.missing.length).toBe(2);
  });

  it('rejects a gap outside the closed enum', () => {
    expect(() =>
      GuidanceGapSchema.parse({ kind: 'marketing', detail: 'x', subject: null }),
    ).toThrow();
  });

  it('rejects a preparation status outside the closed union', () => {
    expect(() =>
      GuidancePreparationSchema.parse({ status: 'content_pending' }),
    ).toThrow();
    expect(() =>
      GuidancePreparationSchema.parse({ status: 'unavailable', reason: 'whatever' }),
    ).toThrow();
    expect(() =>
      GuidancePreparationSchema.parse({
        status: 'unavailable',
        reason: 'bundle_not_published',
      }),
    ).not.toThrow();
  });

  it('rejects an unknown key on a preparation', () => {
    expect(() =>
      GuidancePreparationSchema.parse({
        status: 'unavailable',
        reason: 'snapshot_incomplete',
        extra: true,
      }),
    ).toThrow();
  });
});
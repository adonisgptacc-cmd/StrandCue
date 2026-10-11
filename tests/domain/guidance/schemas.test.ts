import { describe, expect, it } from 'vitest';

import {
  BASIC_WASH_CAPABILITIES,
  GuidanceActivityFactSchema,
  GuidanceActivityCursorSchema,
  GuidanceActivityHistoryPageSchema,
  GuidanceActivityHistorySchema,
  GuidanceGapSchema,
  GuidanceGoalSchema,
  GuidancePreparationSchema,
  GuidanceServiceFactSchema,
  GuidanceSnapshotSchema,
  GuidanceSourceItemSchema,
  ReviewedCapabilityEntrySchema,
  ReviewedGuidanceBundleSchema,
  SUPPORTED_BUNDLE_VERSIONS,
} from '../../../packages/domain/src/guidance/index.ts';

const ISO = '2026-10-10T10:00:00.000Z';
const ACTIVITY_ID = '11111111-1111-4111-8111-111111111111';
const BASELINE_ID = '22222222-2222-4222-8222-222222222222';
const CORRECTION_ID = '33333333-3333-4333-8333-333333333333';

function baselineRevision(overrides: Record<string, unknown> = {}) {
  return {
    id: BASELINE_ID,
    activityId: ACTIVITY_ID,
    sequence: 1,
    baseRevision: 0,
    kind: 'baseline',
    effectiveDate: { precision: 'day', value: '2026-06-01' },
    recordedAt: ISO,
    source: 'user-reported',
    patch: { activityKind: 'wash', precision: 'exact_day', zones: [], notes: '', status: 'active' },
    ...overrides,
  };
}

function correctionRevision(overrides: Record<string, unknown> = {}) {
  return {
    ...baselineRevision({
      id: CORRECTION_ID,
      sequence: 2,
      baseRevision: 1,
      kind: 'correction',
      recordedAt: '2026-10-11T10:00:00.000Z',
      patch: { activityKind: 'styling' },
      correctsId: BASELINE_ID,
      correctionReason: 'Corrected the kind',
    }),
    ...overrides,
  };
}

function serviceFact(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: 'service-a',
    currentPresence: 'present',
    effectiveStart: { precision: 'day', value: '2026-01-01' },
    facts: { chemicalType: 'bleach' },
    ...overrides,
  };
}

function activityFact(overrides: Record<string, unknown> = {}) {
  return {
    activityId: 'activity-a',
    revision: 3,
    voided: false,
    appliedRevisionIds: ['revision-a'],
    facts: { activityKind: 'wash', precision: 'exact_day', status: 'active' },
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
    reviewedBy: 'reviewer-a',
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
    reviewedBy: 'reviewer-a',
    goals: [goal()],
    capabilities: [capabilityEntry()],
    rules: [rule()],
    ...overrides,
  };
}

function v2Bundle(overrides: Record<string, unknown> = {}) {
  return bundle({
    version: '2',
    authoredBy: 'author-a',
    evidenceRegistryId: 'basic-wash-evidence',
    evidenceRegistryVersion: '1',
    capabilities: [
      capabilityEntry({ authoredBy: 'author-a', verifiedCapabilities: ['cleanse'] }),
    ],
    rules: [rule({ effects: [{ kind: 'require_capability', capability: 'cleanse' }] })],
    ...overrides,
  });
}

describe('guidance source contracts', () => {
  it('accepts the activity fact allowlist with applied revision IDs', () => {
    expect(GuidanceActivityFactSchema.parse({
      activityId: ACTIVITY_ID,
      revision: 2,
      voided: false,
      appliedRevisionIds: [BASELINE_ID, CORRECTION_ID],
      facts: { activityKind: 'wash', precision: 'exact_day', status: 'active' },
    }).revision).toBe(2);
  });

  it('rejects duplicate applied revisions and facts outside the allowlist', () => {
    expect(() => GuidanceActivityFactSchema.parse(activityFact({ appliedRevisionIds: ['a', 'a'] }))).toThrow();
    expect(() => GuidanceActivityFactSchema.parse(activityFact({ facts: { activityKind: 'wash', notes: 'private' } }))).toThrow();
    expect(() => GuidanceActivityFactSchema.parse(activityFact({ facts: { zones: [] } }))).toThrow();
    expect(() => GuidanceActivityFactSchema.parse(activityFact({ appliedRevisionIds: undefined }))).toThrow();
  });

  it('requires an offset timestamp and exact cursor keys', () => {
    expect(GuidanceActivityCursorSchema.parse({ baselineRecordedAt: ISO, activityId: ACTIVITY_ID }).activityId).toBe(ACTIVITY_ID);
    expect(() => GuidanceActivityCursorSchema.parse({ baselineRecordedAt: '2026-10-10T10:00:00', activityId: ACTIVITY_ID })).toThrow();
    expect(() => GuidanceActivityCursorSchema.parse({ baselineRecordedAt: ISO, activityId: ACTIVITY_ID, ownerId: 'other' })).toThrow();
  });

  it('rejects empty, mixed, duplicate, broken and mistargeted revision histories', () => {
    const history = { activityId: ACTIVITY_ID, revisions: [baselineRevision(), correctionRevision()] };
    expect(GuidanceActivityHistorySchema.parse(history).revisions).toHaveLength(2);
    expect(() => GuidanceActivityHistorySchema.parse({ ...history, revisions: [] })).toThrow();
    expect(() => GuidanceActivityHistorySchema.parse({ ...history, revisions: [baselineRevision({ activityId: CORRECTION_ID })] })).toThrow();
    expect(() => GuidanceActivityHistorySchema.parse({ ...history, revisions: [baselineRevision(), baselineRevision()] })).toThrow();
    expect(() => GuidanceActivityHistorySchema.parse({ ...history, revisions: [baselineRevision(), correctionRevision({ sequence: 3 })] })).toThrow();
    expect(() => GuidanceActivityHistorySchema.parse({ ...history, revisions: [baselineRevision(), correctionRevision({ correctsId: ACTIVITY_ID })] })).toThrow();
    expect(() => GuidanceActivityHistorySchema.parse({
      ...history,
      revisions: [
        baselineRevision(),
        correctionRevision(),
        correctionRevision({
          id: '44444444-4444-4444-8444-444444444444',
          sequence: 3,
          baseRevision: 2,
          recordedAt: '2026-10-12T10:00:00.000Z',
        }),
      ],
    })).toThrow();
  });

  it('rejects extra page keys and duplicate activity identities', () => {
    const history = { activityId: ACTIVITY_ID, revisions: [baselineRevision()] };
    expect(GuidanceActivityHistoryPageSchema.parse({ items: [history], nextCursor: null }).items).toHaveLength(1);
    expect(() => GuidanceActivityHistoryPageSchema.parse({ items: [history], nextCursor: null, ownerId: 'other' })).toThrow();
    expect(() => GuidanceActivityHistoryPageSchema.parse({ items: [history, history], nextCursor: null })).toThrow();
  });
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

  it('keeps a service date at its recorded precision without widening it', () => {
    const month = GuidanceSnapshotSchema.parse(
      snapshot({
        services: [serviceFact({ effectiveStart: { precision: 'month', value: '2026-06' } })],
      }),
    );
    expect(month.services[0].effectiveStart).toEqual({ precision: 'month', value: '2026-06' });
    const year = GuidanceSnapshotSchema.parse(
      snapshot({
        services: [serviceFact({ effectiveStart: { precision: 'year', value: '2025' } })],
      }),
    );
    expect(year.services[0].effectiveStart).toEqual({ precision: 'year', value: '2025' });
    const unknown = GuidanceSnapshotSchema.parse(
      snapshot({
        services: [serviceFact({ effectiveStart: { precision: 'unknown', value: null } })],
      }),
    );
    expect(unknown.services[0].effectiveStart).toEqual({ precision: 'unknown', value: null });
  });

it('rejects a malformed service effective date', () => {
    expect(() =>
      GuidanceServiceFactSchema.parse(serviceFact({ effectiveStart: 'yesterday' })),
    ).toThrow();
    expect(() =>
      GuidanceServiceFactSchema.parse(
        serviceFact({ effectiveStart: { precision: 'day', value: '2026-06' } }),
      ),
    ).toThrow();
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
    expect(() => ReviewedGuidanceBundleSchema.parse(bundle({ version: '3' }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(bundle({ version: '' }))).toThrow();
  });

  it('keeps version 1 replayable and accepts version 2', () => {
    expect([...SUPPORTED_BUNDLE_VERSIONS]).toEqual(['1', '2']);
    const legacy = ReviewedGuidanceBundleSchema.parse(bundle());
    expect(legacy.version).toBe('1');
    expect(legacy.authoredBy).toBeUndefined();
    expect(ReviewedGuidanceBundleSchema.parse(v2Bundle()).version).toBe('2');
  });

  it('carries the author and evidence registry references of a version 2 bundle', () => {
    const parsed = ReviewedGuidanceBundleSchema.parse(v2Bundle());
    expect(parsed.authoredBy).toBe('author-a');
    expect(parsed.evidenceRegistryId).toBe('basic-wash-evidence');
    expect(parsed.evidenceRegistryVersion).toBe('1');
    expect(parsed.capabilities[0].authoredBy).toBe('author-a');
  });

  it('requires the author and evidence registry references on a version 2 bundle', () => {
    expect(ReviewedGuidanceBundleSchema.parse(v2Bundle()).version).toBe('2');
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ authoredBy: undefined }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ authoredBy: '  ' }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ evidenceRegistryId: undefined }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ evidenceRegistryVersion: undefined }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ evidenceRegistryVersion: '' }))).toThrow();
    expect(() => ReviewedGuidanceBundleSchema.parse(v2Bundle({ capabilities: [capabilityEntry({ verifiedCapabilities: ['cleanse'] })] }))).toThrow();
  });

  it('closes the capability vocabulary of a version 2 bundle', () => {
    expect([...BASIC_WASH_CAPABILITIES]).toEqual(['cleanse', 'condition']);
    const accepted = v2Bundle({
      capabilities: [
        capabilityEntry({ authoredBy: 'author-a', verifiedCapabilities: ['cleanse', 'condition'] }),
      ],
      rules: [
        rule({
          effects: [
            { kind: 'order_before', before: 'cleanse', after: 'condition' },
            { kind: 'order_after', before: 'cleanse', after: 'condition' },
            { kind: 'require_capability', capability: 'condition' },
            { kind: 'wait', durationSeconds: 30 },
          ],
        }),
      ],
    });
    expect(ReviewedGuidanceBundleSchema.parse(accepted).rules[0].effects).toHaveLength(4);
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({
          capabilities: [capabilityEntry({ authoredBy: 'author-a', verifiedCapabilities: ['mild-cleanse'] })],
        }),
      ),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({ rules: [rule({ effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }] })] }),
      ),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({
          rules: [
            rule({
              condition: { kind: 'all', conditions: [{ kind: 'not', condition: { kind: 'capability_available', capability: 'dry' } }] },
              effects: [{ kind: 'require_capability', capability: 'cleanse' }],
            }),
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({ rules: [rule({ effects: [{ kind: 'order_before', before: 'shampoo', after: 'condition' }] })] }),
      ),
    ).toThrow();
  });

  it('refuses a capability entry that its own author reviewed', () => {
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({ capabilities: [capabilityEntry({ authoredBy: 'reviewer-a', verifiedCapabilities: ['cleanse'] })] }),
      ),
    ).toThrow();
    expect(() =>
      ReviewedGuidanceBundleSchema.parse(
        v2Bundle({ capabilities: [capabilityEntry({ authoredBy: 'author-a', verifiedCapabilities: ['cleanse'], reviewedBy: 'author-a' })] }),
      ),
    ).toThrow();
    expect(ReviewedGuidanceBundleSchema.parse(v2Bundle()).capabilities[0].reviewedBy).toBe('reviewer-a');
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

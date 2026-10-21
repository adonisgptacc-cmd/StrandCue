import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { generateTodayGuidance, isClientPersistableGuidanceResult } from '../../apps/mobile/src/guidance/today-guidance-service';
import type {
  TodayGuidanceDependencies,
  TodayGuidanceRequest,
} from '../../apps/mobile/src/guidance/today-guidance-service';
import {
  generateProtocol as realGenerateProtocol,
  RECOMMENDATION_ENGINE_VERSION,
  ReviewedContentError,
  validatePublishedBundle,
  type GuidanceSnapshot,
  type ReviewedGuidanceBundle,
} from '../../packages/domain/src/index';

vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: async (algorithm: string, text: string) =>
    createHash('sha256').update(text, 'utf8').digest('hex'),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
}));
// The service reaches the record sources only through this module; tests
// inject their own loader, so the real API modules are never loaded.
vi.mock('../../apps/mobile/src/guidance/guidance-snapshot', () => ({
  loadGuidanceSnapshot: vi.fn(),
}));

const AS_OF = '2026-10-11T09:00:00.000Z';
const LOADED_AT = '2026-10-11T09:00:05.000Z';
const REVIEWED_AT = '2026-10-01T00:00:00.000Z';
/** A capability from the closed reviewed vocabulary. */
const CAP = 'cleanse';

/**
 * Synthetic identities and catalogue ids for the service fixtures. A version
 * `2` bundle is the only version the publication gate will execute, so the
 * harness has to carry a real registry and review matrix alongside it — which is
 * the point: the service now hands the gate everything it needs to refuse
 * unchecked content.
 */
const PRODUCT_VERSION = '11111111-1111-4111-8111-111111111111';
const REGISTRY_ID = 'fixture-evidence-registry';
const VERSION_EVIDENCE = 'fixture-evidence-version';
const RULE_EVIDENCE = 'fixture-evidence-rule';
const BUNDLE_AUTHOR = 'I. Fixture-Compiler';
const BUNDLE_REVIEWER = 'I. Fixture-Approver';
const ENTRY_AUTHOR = 'I. Fixture-Entry-Author';
const ENTRY_REVIEWER = 'I. Fixture-Entry-Reviewer';
const ROW_AUTHOR = 'I. Fixture-Row-Author';
const ROW_REVIEWER = 'I. Fixture-Row-Reviewer';

function evidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: VERSION_EVIDENCE,
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

/** The registry the harness publishes against: one version claim, one rule claim. */
function evidenceRegistry() {
  return {
    registryId: REGISTRY_ID,
    version: '1',
    records: [
      evidenceRecord(),
      evidenceRecord({
        evidenceId: RULE_EVIDENCE,
        title: 'Synthetic guidance source recorded for this fixture only',
        sourceUrl: 'https://strandcue.invalid/fixtures/order',
        versionIds: [],
        claim: 'Synthetic fixture claim about the order of a wash.',
      }),
    ],
  };
}

function capabilityReview() {
  return {
    reviewId: 'fixture-capability-review',
    version: '1',
    rows: [
      {
        kind: 'product',
        versionId: PRODUCT_VERSION,
        capability: CAP,
        supportingEvidenceIds: [VERSION_EVIDENCE],
        contradictedByEvidenceIds: [],
        decision: 'approved',
        rationale: 'Synthetic fixture rationale recorded for this decision.',
        authoredBy: ROW_AUTHOR,
        reviewedBy: ROW_REVIEWER,
        reviewedAt: REVIEWED_AT,
      },
    ],
  };
}

function snapshot(overrides: Partial<GuidanceSnapshot> = {}): GuidanceSnapshot {
  return {
    ownerId: 'owner-1',
    asOf: AS_OF,
    loadedAt: LOADED_AT,
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
    tools: [],
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

function activityFact(
  activityId: string,
  facts: Record<string, string | number | boolean | null>,
) {
  return {
    activityId,
    revision: 2,
    voided: false,
    appliedRevisionIds: [`${activityId}-baseline`, `${activityId}-correction`],
    facts,
  };
}

function publishedBundle(overrides: Partial<ReviewedGuidanceBundle> = {}): ReviewedGuidanceBundle {
  return {
    bundleId: 'bundle-synthetic',
    version: '2',
    status: 'published',
    reviewedAt: REVIEWED_AT,
    reviewedBy: BUNDLE_REVIEWER,
    authoredBy: BUNDLE_AUTHOR,
    evidenceRegistryId: REGISTRY_ID,
    evidenceRegistryVersion: '1',
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['naturalPattern'] }],
    capabilities: [
      {
        kind: 'product',
        versionId: PRODUCT_VERSION,
        displayName: 'Synthetic product',
        verifiedCapabilities: [CAP],
        evidenceIds: [VERSION_EVIDENCE],
        status: 'published',
        reviewedAt: REVIEWED_AT,
        reviewedBy: ENTRY_REVIEWER,
        authoredBy: ENTRY_AUTHOR,
      },
    ],
    rules: [
      {
        ruleId: 'rule-wash',
        versionId: '1',
        status: 'published',
        strength: 'hard',
        condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
        effects: [{ kind: 'require_capability', capability: CAP }],
        reason: 'Synthetic wash rule.',
        evidenceIds: [RULE_EVIDENCE],
      },
    ],
    ...overrides,
  };
}

function draftBundle(): ReviewedGuidanceBundle {
  return { ...publishedBundle(), status: 'draft', capabilities: [], rules: [] };
}

interface Harness {
  readonly dependencies: TodayGuidanceDependencies;
  readonly generateProtocol: ReturnType<typeof vi.fn>;
  readonly loadSnapshot: ReturnType<typeof vi.fn>;
}

function harness(options: { bundle?: ReviewedGuidanceBundle; snapshot?: GuidanceSnapshot } = {}): Harness {
  const bundle = options.bundle ?? publishedBundle();
  const snapshotValue = options.snapshot ?? snapshot();
  const loadSnapshot = vi.fn(async () => snapshotValue);
  const generateProtocol = vi.fn((context: unknown) => realGenerateProtocol(context));
  return {
    loadSnapshot,
    generateProtocol,
    dependencies: {
      loadSnapshot,
      generateProtocol,
      currentBundle: () => bundle,
      evidenceRegistry,
      capabilityReview,
      validateBundle: (input, registry, review) =>
        validatePublishedBundle(input, registry, review, AS_OF),
      hashText: text => createHash('sha256').update(text, 'utf8').digest('hex'),
    },
  };
}

function request(overrides: Partial<TodayGuidanceRequest> = {}): TodayGuidanceRequest {
  return {
    ownerId: 'owner-1',
    goalId: 'basic_wash',
    requestId: 'request-1',
    asOf: AS_OF,
    loadedAt: LOADED_AT,
    ...overrides,
  };
}

describe('today guidance orchestration', () => {
  it('never calls the engine when preparation is not ready', async () => {
    const { dependencies, generateProtocol } = harness({
      snapshot: snapshot({ passportFacts: {} }),
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('needs_setup');
    expect(generateProtocol).not.toHaveBeenCalled();
  });

  it('never calls the engine when the reviewed bundle is still draft', async () => {
    const { dependencies, generateProtocol } = harness({ bundle: draftBundle() });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('content_pending');
    expect(generateProtocol).not.toHaveBeenCalled();
  });

  it('reports content_pending for the production draft bundle', async () => {
    const result = await generateTodayGuidance(request());
    expect(result.status).toBe('content_pending');
  });

  it('maps an incomplete snapshot to source_error without inventing advice', async () => {
    const { dependencies, generateProtocol } = harness({
      snapshot: snapshot({
        completeness: {
          passport: 'complete',
          services: 'complete',
          activities: 'complete',
          products: 'failed',
          tools: 'complete',
        },
      }),
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('source_error');
    expect(generateProtocol).not.toHaveBeenCalled();
  });

  it('produces a ready result carrying engine, bundle and fingerprint identity', async () => {
    const { dependencies } = harness();
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.engineVersion).toBe(RECOMMENDATION_ENGINE_VERSION);
    expect(result.bundleId).toBe('bundle-synthetic');
    expect(result.bundleVersion).toBe('2');
    expect(result.asOf).toBe(AS_OF);
    expect(result.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.input).toMatchObject({
      requestId: 'request-1',
      asOf: AS_OF,
      goal: 'basic_wash',
    });
  });

  it('surfaces the full decision including evidence and no-purchase-need', async () => {
    const { dependencies } = harness();
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.decision.status).toBe('ready');
    expect(result.decision.steps.length).toBeGreaterThan(0);
    expect(result.decision.confidence).toBeDefined();
    expect(result.decision.audit.evaluatedRules[0].evidenceIds).toEqual([RULE_EVIDENCE]);
    expect(result.decision.noPurchaseNeeded).toBe(true);
  });

  it('keeps missing inputs and conflicts visible rather than hiding them', async () => {
    const missingInputBundle = publishedBundle({
      rules: [
        {
          ruleId: 'rule-needs-fact',
          versionId: '1',
          status: 'published',
          strength: 'hard',
          condition: { kind: 'fact_equals', fact: 'profile.unrecorded', value: 'x' },
          effects: [{ kind: 'require_capability', capability: CAP }],
          reason: 'Needs a fact nobody recorded.',
          evidenceIds: [RULE_EVIDENCE],
        },
      ],
    });
    const { dependencies } = harness({ bundle: missingInputBundle });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('needs_input');
    if (result.status !== 'needs_input') return;
    expect(result.decision.missingInputs).toEqual(['profile.unrecorded']);
  });

  it('maps a rule conflict to its own result status', async () => {
    const conflictingBundle = publishedBundle({
      rules: [
        {
          ruleId: 'rule-a',
          versionId: '1',
          status: 'published',
          strength: 'hard',
          condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
          effects: [{ kind: 'require_capability', capability: CAP }],
          reason: 'Requires the capability.',
          evidenceIds: [RULE_EVIDENCE],
        },
        {
          ruleId: 'rule-b',
          versionId: '1',
          status: 'published',
          strength: 'hard',
          condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
          effects: [{ kind: 'exclude_capability', capability: CAP }],
          reason: 'Excludes the capability.',
          evidenceIds: [RULE_EVIDENCE],
        },
      ],
    });
    const { dependencies } = harness({ bundle: conflictingBundle });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('rule_conflict');
  });

  it('maps an unsupported decision to its own result status', async () => {
    const noActionBundle = publishedBundle({
      rules: [
        {
          ruleId: 'rule-advisory-only',
          versionId: '1',
          status: 'published',
          strength: 'advisory',
          condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
          effects: [{ kind: 'prefer_capability', capability: CAP }],
          reason: 'Advisory only.',
          evidenceIds: [RULE_EVIDENCE],
        },
      ],
    });
    const { dependencies } = harness({ bundle: noActionBundle });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('unsupported');
  });

  it('is deterministic for the same explicit inputs', async () => {
    const first = await generateTodayGuidance(request(), harness().dependencies);
    const second = await generateTodayGuidance(request(), harness().dependencies);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('changes the fingerprint when the snapshot content changes', async () => {
    const first = await generateTodayGuidance(request(), harness().dependencies);
    const second = await generateTodayGuidance(
      request(),
      harness({
        snapshot: snapshot({
          products: [
            {
              ownerItemId: 'owner-product-1',
              versionId: PRODUCT_VERSION,
              name: 'Owned shampoo (different label)',
              availability: 'available',
              revision: 4,
            },
          ],
        }),
      }).dependencies,
    );
    expect(first.status === 'ready' && second.status === 'ready').toBe(true);
    if (first.status !== 'ready' || second.status !== 'ready') return;
    expect(second.inputFingerprint).not.toBe(first.inputFingerprint);
  });

  it('converts a network failure into source_error', async () => {
    const { dependencies, loadSnapshot } = harness();
    loadSnapshot.mockRejectedValue(new Error('offline'));
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('source_error');
  });

  it('rethrows an abort instead of reporting it as a source error', async () => {
    const { dependencies, loadSnapshot } = harness();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    loadSnapshot.mockRejectedValue(abort);
    await expect(generateTodayGuidance(request(), dependencies)).rejects.toThrow('aborted');
  });

  it('passes the request as-of to the snapshot loader', async () => {
    const { dependencies, loadSnapshot } = harness();
    await generateTodayGuidance(request(), dependencies);
    expect(loadSnapshot).toHaveBeenCalledWith('owner-1', AS_OF, LOADED_AT, undefined);
  });

  it('hashes and returns the exact normalized input with cutoff-projected activity facts', async () => {
    const activity = activityFact('activity-1', {
      activityKind: 'wash',
      precision: 'exact_day',
      status: 'active',
    });
    const { dependencies, loadSnapshot } = harness({
      snapshot: snapshot({ activities: [activity] }),
    });
    const result = await generateTodayGuidance(request(), dependencies);

    expect(loadSnapshot).toHaveBeenCalledWith('owner-1', AS_OF, LOADED_AT, undefined);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.input.historyFacts).toEqual({
      activityKind: 'wash',
      precision: 'exact_day',
      status: 'active',
    });
    expect(result.inputFingerprint).toBe(
      createHash('sha256').update(JSON.stringify(result.input), 'utf8').digest('hex'),
    );
  });

  it('produces byte-equivalent normalized input when activity histories arrive in another order', async () => {
    const firstSnapshot = snapshot({
      activities: [
        activityFact('activity-a', { activityKind: 'wash', status: 'active' }),
        activityFact('activity-b', { activityKind: 'treatment', status: 'active' }),
      ],
    });
    const reorderedSnapshot = snapshot({ activities: [...firstSnapshot.activities].reverse() });
    const first = await generateTodayGuidance(request(), harness({ snapshot: firstSnapshot }).dependencies);
    const reordered = await generateTodayGuidance(
      request(),
      harness({ snapshot: reorderedSnapshot }).dependencies,
    );

    expect(first.status).toBe('ready');
    expect(reordered.status).toBe('ready');
    if (first.status !== 'ready' || reordered.status !== 'ready') return;
    expect(JSON.stringify(reordered.input)).toBe(JSON.stringify(first.input));
    expect(reordered.inputFingerprint).toBe(first.inputFingerprint);
    expect(first.input.historyFacts).toEqual({ status: 'active' });
  });
});

describe('SC-001 client-persistable gate', () => {
  it('refuses a ready result on the authenticated path without changing it', async () => {
    const { dependencies } = harness();
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('ready');
    expect(isClientPersistableGuidanceResult(result)).toBe(false);
  });

  it('keeps draft content_pending persistable with no ready regression', async () => {
    const { dependencies } = harness({ bundle: draftBundle() });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('content_pending');
    expect(isClientPersistableGuidanceResult(result)).toBe(true);
  });

  it('admits every fail-closed outcome and only those', () => {
    const persistable = [
      { status: 'needs_setup', missing: [] },
      { status: 'content_pending' },
      { status: 'needs_input', decision: {}, input: {}, requestId: 'r', asOf: AS_OF, engineVersion: '1', bundleId: 'b', bundleVersion: '1', inputFingerprint: 'f' },
      { status: 'rule_conflict', decision: {}, input: {}, requestId: 'r', asOf: AS_OF, engineVersion: '1', bundleId: 'b', bundleVersion: '1', inputFingerprint: 'f' },
      { status: 'unsupported', decision: {}, input: {}, requestId: 'r', asOf: AS_OF, engineVersion: '1', bundleId: 'b', bundleVersion: '1', inputFingerprint: 'f' },
      { status: 'source_error', detail: 'x' },
    ] as never[];
    for (const result of persistable) {
      expect(isClientPersistableGuidanceResult(result)).toBe(true);
    }
    expect(
      isClientPersistableGuidanceResult({ status: 'ready' } as never),
    ).toBe(false);
  });
});

describe('engine failure fail-closed mapping', () => {
  it('keeps producing content_pending when the engine rejects draft content', async () => {
    const { dependencies, generateProtocol } = harness();
    generateProtocol.mockImplementation(() => {
      throw new ReviewedContentError('draft');
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('content_pending');
    expect(isClientPersistableGuidanceResult(result)).toBe(true);
  });

  it('maps a generic engine failure to source_error without inventing advice', async () => {
    const { dependencies, generateProtocol } = harness();
    generateProtocol.mockImplementation(() => {
      throw new Error('engine exploded');
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('source_error');
  });

  it('rethrows an engine abort instead of reporting it as a source error', async () => {
    const { dependencies, generateProtocol } = harness();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    generateProtocol.mockImplementation(() => {
      throw abort;
    });
    await expect(generateTodayGuidance(request(), dependencies)).rejects.toThrow('aborted');
  });
});

describe('task 6 integration: reviewed versions through Today without purchase pressure', () => {
  // A valid catalogue UUID with the same owner-facing name as the reviewed
  // product but no registry entry: visually similar, a different version.
  const SIMILAR_VERSION = '33333333-3333-4333-8333-333333333333';

  it('returns unsupported naming the capability when only a similar version is owned', async () => {
    const { dependencies, generateProtocol } = harness({
      snapshot: snapshot({
        products: [
          {
            ownerItemId: 'owner-product-1',
            versionId: SIMILAR_VERSION,
            name: 'Owned shampoo',
            availability: 'available',
            revision: 3,
          },
        ],
      }),
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('unsupported');
    expect(generateProtocol).toHaveBeenCalledTimes(1);
    if (result.status !== 'unsupported') return;
    expect(result.decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability '${CAP}'`,
    );
  });

  it('returns unsupported naming the capability when only manual items are owned', async () => {
    const { dependencies } = harness({
      snapshot: snapshot({
        products: [
          {
            ownerItemId: 'owner-product-1',
            versionId: null,
            name: 'Manual shampoo',
            availability: 'available',
            revision: 1,
          },
        ],
      }),
    });
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('unsupported');
    if (result.status !== 'unsupported') return;
    expect(result.decision.steps).toEqual([]);
    expect(result.decision.omissions.join(' ')).toContain(
      `No verified available candidate provides required capability '${CAP}'`,
    );
    // An unmatched shelf never becomes a candidate: the normalized input
    // carries no products and no invented version.
    expect(result.input.products).toEqual([]);
  });

  it('returns unsupported when the reviewed version is owned but unavailable', async () => {
    for (const availability of ['archived', 'out_of_stock'] as const) {
      const { dependencies } = harness({
        snapshot: snapshot({
          products: [
            {
              ownerItemId: 'owner-product-1',
              versionId: PRODUCT_VERSION,
              name: 'Owned shampoo',
              availability,
              revision: 3,
            },
          ],
        }),
      });
      const result = await generateTodayGuidance(request(), dependencies);
      expect(result.status).toBe('unsupported');
      if (result.status !== 'unsupported') return;
      expect(result.decision.omissions.join(' ')).toContain(
        `No verified available candidate provides required capability '${CAP}'`,
      );
    }
  });

  it('completes the reviewed route from owned items with no purchase needed', async () => {
    const { dependencies } = harness();
    const result = await generateTodayGuidance(request(), dependencies);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.decision.steps.length).toBeGreaterThan(0);
    for (const step of result.decision.steps) {
      expect(step.productId).toBe('owner-product-1');
    }
    expect(result.decision.noPurchaseNeeded).toBe(true);
  });

  it('produces byte-equivalent normalized input when shelf order changes', async () => {
    const secondProduct = {
      ownerItemId: 'owner-product-2',
      versionId: SIMILAR_VERSION,
      name: 'Owned shampoo',
      availability: 'available' as const,
      revision: 1,
    };
    const firstSnapshot = snapshot({
      products: [...snapshot().products, secondProduct],
    });
    const reorderedSnapshot = snapshot({
      products: [...firstSnapshot.products].reverse(),
    });
    const first = await generateTodayGuidance(request(), harness({ snapshot: firstSnapshot }).dependencies);
    const reordered = await generateTodayGuidance(
      request(),
      harness({ snapshot: reorderedSnapshot }).dependencies,
    );
    expect(first.status).toBe('ready');
    expect(reordered.status).toBe('ready');
    if (first.status !== 'ready' || reordered.status !== 'ready') return;
    expect(JSON.stringify(reordered.input)).toBe(JSON.stringify(first.input));
    expect(reordered.inputFingerprint).toBe(first.inputFingerprint);
  });
});

describe('task 5 integration: temporary check-in through the service', () => {
  const CHECK_IN = {
    observedAt: AS_OF,
    concerns: ['dryness'],
    goal: 'basic_wash',
    availableMinutes: 20,
  };

  it('returns content_pending for a draft bundle even with a completed check-in', async () => {
    const { dependencies, generateProtocol } = harness({ bundle: draftBundle() });
    const result = await generateTodayGuidance(
      request({ currentCondition: CHECK_IN, now: AS_OF }),
      dependencies,
    );
    expect(result.status).toBe('content_pending');
    expect(generateProtocol).not.toHaveBeenCalled();
  });

  it('carries normalized check-in facts into the engine input without touching the snapshot', async () => {
    const { dependencies } = harness();
    const result = await generateTodayGuidance(
      request({ currentCondition: CHECK_IN, now: AS_OF }),
      dependencies,
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.input.environmentFacts['current.observedAt']).toBe(AS_OF);
    expect(result.input.environmentFacts['current.goal']).toBe('basic_wash');
    expect(result.input.environmentFacts['current.availableMinutes']).toBe(20);
    expect(result.input.environmentFacts['current.concerns.dryness']).toBe(true);
    expect(result.input.profileFacts).toEqual({ naturalPattern: 'curly' });
  });

  it('maps an unknown check-in to targeted gaps without running the engine', async () => {
    const { dependencies, generateProtocol } = harness();
    const result = await generateTodayGuidance(
      request({
        currentCondition: { ...CHECK_IN, concerns: ['unknown'] },
        now: AS_OF,
      }),
      dependencies,
    );
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(generateProtocol).not.toHaveBeenCalled();
    expect(result.missing.map(gap => gap.kind)).toContain('current_condition');
  });

  it('keeps the normalized input byte-identical when no check-in is passed', async () => {
    const first = await generateTodayGuidance(request(), harness().dependencies);
    const second = await generateTodayGuidance(
      request({ currentCondition: undefined, now: undefined }),
      harness().dependencies,
    );
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    if (first.status !== 'ready' || second.status !== 'ready') return;
    expect(JSON.stringify(second.input)).toBe(JSON.stringify(first.input));
    expect(second.inputFingerprint).toBe(first.inputFingerprint);
  });
});

describe('task 3.1 integration: the prepared input through the service', () => {
  const CHECK_IN = {
    observedAt: AS_OF,
    concerns: ['dryness', 'buildup'],
    goal: 'basic_wash',
    availableMinutes: 20,
  };

  it('hands back one prepared input built from the Passport, the check-in and the shelf', async () => {
    const result = await generateTodayGuidance(request({ currentCondition: CHECK_IN, now: AS_OF }), harness().dependencies);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.prepared.currentCondition?.concerns).toEqual(['buildup', 'dryness']);
    expect(result.prepared.availableMinutes).toBe(20);
    expect(result.prepared.passport.facts).toEqual({ naturalPattern: 'curly' });
    expect(result.prepared.products.map(item => item.ownerItemId)).toEqual(['owner-product-1']);
    expect(Object.isFrozen(result.prepared)).toBe(true);
  });

  it('keeps the fingerprint a hash of the engine context alone, so the prepared input never changes it', async () => {
    const result = await generateTodayGuidance(request({ currentCondition: CHECK_IN, now: AS_OF }), harness().dependencies);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.inputFingerprint).toBe(createHash('sha256').update(JSON.stringify(result.input), 'utf8').digest('hex'));
    expect(JSON.stringify(result.input)).not.toContain('schemaVersion');
  });

  it('does not write the check-in back to the stored snapshot, and a second request without one sees the unchanged baseline', async () => {
    const stored = snapshot({ passportFacts: { naturalPattern: 'curly', damageObservation: 'none' } });
    const before = JSON.stringify(stored);
    const first = await generateTodayGuidance(
      request({ currentCondition: { ...CHECK_IN, concerns: ['reported-damage'] }, now: AS_OF }),
      harness({ snapshot: stored }).dependencies,
    );
    const second = await generateTodayGuidance(request(), harness({ snapshot: stored }).dependencies);
    expect(JSON.stringify(stored)).toBe(before);
    expect(first.status === 'ready' && first.prepared.effectiveFacts[0]).toMatchObject({ effective: 'current', baseline: { value: 'none' } });
    expect(second.status === 'ready' && second.prepared.effectiveFacts[0]).toMatchObject({ effective: 'baseline', current: 'not_answered' });
  });

  it('names where each setup gap is resolved, without an owner value or an internal detail', async () => {
    const result = await generateTodayGuidance(
      request({ currentCondition: { ...CHECK_IN, concerns: ['none', 'dryness'] }, now: AS_OF }),
      harness({ snapshot: snapshot({ passportFacts: {} }) }).dependencies,
    );
    expect(result.status).toBe('needs_setup');
    if (result.status !== 'needs_setup') return;
    expect(result.missing.map(gap => [gap.kind, gap.state, gap.destination])).toEqual([
      ['hair_profile', 'missing', 'my_hair'],
      ['current_condition', 'contradictory', 'today_check_in'],
    ]);
  });

  it('never prepares anything from a draft bundle: the production bundle stays content_pending with a complete check-in', async () => {
    const result = await generateTodayGuidance(request({ currentCondition: CHECK_IN, now: AS_OF }));
    expect(result).toEqual({ status: 'content_pending' });
  });
});

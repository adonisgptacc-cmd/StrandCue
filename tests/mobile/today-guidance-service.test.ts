import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { generateTodayGuidance } from '../../apps/mobile/src/guidance/today-guidance-service';
import type {
  TodayGuidanceDependencies,
  TodayGuidanceRequest,
} from '../../apps/mobile/src/guidance/today-guidance-service';
import { CHECKED_IN_CAPABILITY_REVIEW } from '../../apps/mobile/src/guidance/capability-review';
import { CHECKED_IN_EVIDENCE_REGISTRY } from '../../apps/mobile/src/guidance/evidence-registry';
import {
  generateProtocol as realGenerateProtocol,
  RECOMMENDATION_ENGINE_VERSION,
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
const CAP = 'mild-cleanse';

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
        versionId: 'version-product-1',
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
        verifiedCapabilities: [CAP],
        evidenceIds: ['evidence-1'],
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
        effects: [{ kind: 'require_capability', capability: CAP }],
        reason: 'Synthetic wash rule.',
        evidenceIds: ['evidence-1'],
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
      evidenceRegistry: () => CHECKED_IN_EVIDENCE_REGISTRY,
      capabilityReview: () => CHECKED_IN_CAPABILITY_REVIEW,
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
    expect(result.bundleVersion).toBe('1');
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
    expect(result.decision.audit.evaluatedRules[0].evidenceIds).toEqual(['evidence-1']);
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
          evidenceIds: ['evidence-2'],
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
          evidenceIds: ['evidence-1'],
        },
        {
          ruleId: 'rule-b',
          versionId: '1',
          status: 'published',
          strength: 'hard',
          condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
          effects: [{ kind: 'exclude_capability', capability: CAP }],
          reason: 'Excludes the capability.',
          evidenceIds: ['evidence-2'],
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
          evidenceIds: ['evidence-1'],
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
              versionId: 'version-product-1',
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

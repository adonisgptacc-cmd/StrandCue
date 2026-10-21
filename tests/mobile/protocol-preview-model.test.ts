import { describe, expect, it } from 'vitest';

import type {
  GuidanceEvidenceRegistry,
  ProtocolDecision,
  RecommendationContext,
  ReviewedGuidanceBundle,
} from '../../packages/domain/src/index';
import { buildProtocolPreview, type ProtocolPreviewInput } from '../../apps/mobile/src/guidance/protocol-preview-model';

/**
 * Task 3.3, Task 1: the trusted protocol preview model.
 *
 * `buildProtocolPreview` rebuilds a deterministic, fail-closed owner-facing
 * description of a stored decision. Every fixture is synthetic; no owner data
 * is used.
 */

const AS_OF = '2026-10-11T09:00:00.000Z';

const REGISTRY_ID = 'basic-wash-evidence';
const REGISTRY_VERSION = '1';

function evidenceRecord(overrides: Record<string, unknown> = {}): GuidanceEvidenceRegistry['records'][number] {
  return {
    evidenceId: 'evidence-1',
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Manufacturer directions for the exact shampoo version',
    sourceUrl: 'https://example.com/za/shampoo-directions',
    archivedUrl: null,
    publisher: 'Garnier South Africa',
    market: 'ZA',
    versionIds: ['version-1'],
    claim: 'Apply as usual, lather, rinse thoroughly.',
    limitations: 'Web-only; packaging is authoritative.',
    checkedAt: '2026-10-10T00:00:00+02:00',
    authoredBy: 'author-1',
    reviewedAt: '2026-10-10T00:00:00+02:00',
    reviewedBy: 'reviewer-1',
    status: 'reviewed',
    ...overrides,
  };
}

function evidenceRegistry(overrides: Record<string, unknown> = {}): GuidanceEvidenceRegistry {
  return Object.freeze({
    registryId: REGISTRY_ID,
    version: REGISTRY_VERSION,
    records: Object.freeze([evidenceRecord()]),
    ...overrides,
  } as GuidanceEvidenceRegistry);
}

function capabilityEntry(overrides: Record<string, unknown> = {}): ReviewedGuidanceBundle['capabilities'][number] {
  return Object.freeze({
    kind: 'product',
    versionId: 'version-1',
    displayName: 'Garnier shampoo',
    verifiedCapabilities: Object.freeze(['cleanse']),
    evidenceIds: Object.freeze(['evidence-1']),
    status: 'published',
    reviewedAt: '2026-10-10T00:00:00+02:00',
    reviewedBy: 'reviewer-1',
    authoredBy: 'author-1',
    ...overrides,
  } as ReviewedGuidanceBundle['capabilities'][number]);
}

function publishedBundle(overrides: Record<string, unknown> = {}): ReviewedGuidanceBundle {
  return Object.freeze({
    bundleId: 'today-core-guidance',
    version: '2',
    status: 'published',
    reviewedAt: '2026-10-10T00:00:00.000Z',
    reviewedBy: 'reviewer-1',
    authoredBy: 'author-1',
    evidenceRegistryId: REGISTRY_ID,
    evidenceRegistryVersion: REGISTRY_VERSION,
    goals: Object.freeze([{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: Object.freeze(['pattern']) }]),
    capabilities: Object.freeze([capabilityEntry()]),
    rules: Object.freeze([]),
    ...overrides,
  } as ReviewedGuidanceBundle);
}

function context(overrides: Record<string, unknown> = {}): RecommendationContext {
  return Object.freeze({
    requestId: 'request-1',
    asOf: AS_OF,
    goal: 'basic_wash',
    profileFacts: Object.freeze({}),
    products: Object.freeze([
      {
        productId: 'product-1',
        versionId: 'version-1',
        name: 'Garnier shampoo',
        owned: true,
        available: true,
        verifiedCapabilities: Object.freeze(['cleanse']),
        unknownCapabilities: Object.freeze([]),
      },
      {
        productId: 'product-2',
        versionId: 'version-2',
        name: 'Synthetic conditioner',
        owned: true,
        available: false,
        verifiedCapabilities: Object.freeze(['condition']),
        unknownCapabilities: Object.freeze([]),
      },
    ]),
    tools: Object.freeze([]),
    historyFacts: Object.freeze({}),
    environmentFacts: Object.freeze({}),
    rules: Object.freeze([]),
    ...overrides,
  } as RecommendationContext);
}

function readyDecision(overrides: Record<string, unknown> = {}): ProtocolDecision {
  return Object.freeze({
    status: 'ready',
    requestId: 'request-1',
    confidence: 'moderate',
    noPurchaseNeeded: true,
    steps: Object.freeze([
      {
        stepId: 'step-1',
        position: 1,
        action: 'apply',
        productId: 'product-1',
        productVersionId: 'version-1',
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: null,
        reasons: Object.freeze(["rule-wash@1 requires 'cleanse'"]),
      },
      {
        stepId: 'step-2',
        position: 2,
        action: 'wait',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: 60,
        rinse: null,
        reasons: Object.freeze(['rule-wait@1 requires a 60s wait']),
      },
      {
        stepId: 'step-3',
        position: 3,
        action: 'rinse',
        productId: null,
        productVersionId: null,
        toolId: null,
        toolVersionId: null,
        waitSeconds: null,
        rinse: true,
        reasons: Object.freeze(['rule-rinse@1 requires rinsing']),
      },
    ]),
    omissions: Object.freeze(['Omitted Synthetic conditioner (product-2): capability not verified']),
    alternatives: Object.freeze(['Alternative: Synthetic balm (product-3)']),
    missingInputs: Object.freeze([]),
    audit: Object.freeze({
      requestId: 'request-1',
      engineVersion: '1',
      evaluatedRules: Object.freeze([
        { ruleId: 'rule-a', versionId: '1', outcome: 'applied', reason: 'ok', evidenceIds: Object.freeze(['evidence-1']) },
        { ruleId: 'rule-b', versionId: '1', outcome: 'applied', reason: 'ok', evidenceIds: Object.freeze(['evidence-1']) },
      ]),
      conflicts: Object.freeze([]),
      rankedCandidates: Object.freeze([]),
      rejectedCandidates: Object.freeze([]),
      restrictions: Object.freeze([]),
      missingInputs: Object.freeze([]),
    }),
    ...overrides,
  } as ProtocolDecision);
}

function input(overrides: Partial<ProtocolPreviewInput> = {}): ProtocolPreviewInput {
  return {
    decision: readyDecision(),
    context: context(),
    bundle: publishedBundle(),
    evidenceRegistry: evidenceRegistry(),
    ...overrides,
  };
}

function isReady(model: unknown): model is { status: 'ready' } {
  return typeof model === 'object' && model !== null && (model as { status?: unknown }).status === 'ready';
}

/** Collects every string leaf value anywhere in the model output. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
  } else if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) collectStrings(entry, out);
  }
  return out;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const forbidden = (text: string): boolean =>
  UUID.test(text) ||
  text.includes('rule-') ||
  /\w\.\w/.test(text) ||
  /https?:\/\//.test(text) ||
  /evidence-/i.test(text) ||
  /reviewer-|author-/i.test(text) ||
  text === "rule-wash@1 requires 'cleanse'" ||
  text === 'rule-wait@1 requires a 60s wait' ||
  text === 'rule-rinse@1 requires rinsing' ||
  text.includes('product-') ||
  text.includes('version-') ||
  text.includes('step-');

describe('buildProtocolPreview', () => {
  it('produces a ready model with exact product and tool version joins', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    expect(model.status).toBe('ready');
    expect(model.ownedItems).toEqual([
      { kind: 'product', name: 'Garnier shampoo', available: true, owned: true },
    ]);
    expect(model.noPurchaseNeeded).toBe(true);
  });

  it('keeps steps in deterministic position order', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    expect(model.steps.map(step => step.position)).toEqual([1, 2, 3]);
    expect(model.steps.map(step => step.action)).toEqual(['apply', 'wait', 'rinse']);
  });

  it('records wait and rinse facts on the right steps', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    const wait = model.steps.find(step => step.action === 'wait');
    expect(wait?.waitSeconds).toBe(60);
    expect(wait?.reason).toBe('Wait 60 seconds.');
    const rinse = model.steps.find(step => step.action === 'rinse');
    expect(rinse?.rinse).toBe(true);
    expect(rinse?.reason).toBe('Rinse it out.');
  });

  it('derives plain-language reasons and never repeats raw engine sentences', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    const apply = model.steps.find(step => step.position === 1);
    expect(apply?.reason).toBe('Use Garnier shampoo.');
    expect(model.reasons.map(reason => reason.text)).toEqual([
      'Use Garnier shampoo.',
      'Wait 60 seconds.',
      'Rinse it out.',
    ]);
  });

  it('shows confidence with its limitation', () => {
    const model = buildProtocolPreview(input({ decision: readyDecision({ confidence: 'limited' }) }));
    expect(isReady(model)).toBe(true);
    expect(model.confidence.level).toBe('limited');
    expect(model.confidence.limitedBecause.length).toBeGreaterThan(0);
    const high = buildProtocolPreview(input({ decision: readyDecision({ confidence: 'high' }) }));
    expect(isReady(high)).toBe(true);
    expect(high.confidence.limitedBecause).toEqual([]);
  });

  it('reports no purchase needed only when the decision says so', () => {
    const model = buildProtocolPreview(input({ decision: readyDecision({ noPurchaseNeeded: true }) }));
    expect(isReady(model)).toBe(true);
    expect(model.noPurchaseNeeded).toBe(true);
    const notNeeded = buildProtocolPreview(input({ decision: readyDecision({ noPurchaseNeeded: false }) }));
    expect(isReady(notNeeded)).toBe(true);
    expect(notNeeded.noPurchaseNeeded).toBe(false);
    const unknown = buildProtocolPreview(input({ decision: readyDecision({ noPurchaseNeeded: null }) }));
    expect(isReady(unknown)).toBe(true);
    expect(unknown.noPurchaseNeeded).toBeNull();
  });

  it('lists eligible alternatives that are available and not selected', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    // product-1 is selected; product-2 is owned but unavailable; neither is an available alternative.
    expect(model.alternatives).toEqual([]);
    const withAlt = buildProtocolPreview(
      input({
        context: context({
          products: [
            {
              productId: 'product-1',
              versionId: 'version-1',
              name: 'Garnier shampoo',
              owned: true,
              available: true,
              verifiedCapabilities: Object.freeze(['cleanse']),
              unknownCapabilities: Object.freeze([]),
            },
            {
              productId: 'product-3',
              versionId: 'version-3',
              name: 'Synthetic balm',
              owned: true,
              available: true,
              verifiedCapabilities: Object.freeze(['cleanse']),
              unknownCapabilities: Object.freeze([]),
            },
          ],
        }),
        bundle: publishedBundle({
          capabilities: Object.freeze([
            capabilityEntry(),
            capabilityEntry({ versionId: 'version-3', displayName: 'Synthetic balm', verifiedCapabilities: Object.freeze(['cleanse']) }),
          ]),
        }),
      }),
    );
    expect(isReady(withAlt)).toBe(true);
    expect(withAlt.alternatives).toEqual([
      {
        kind: 'product',
        name: 'Synthetic balm',
        available: true,
        owned: true,
        coversPlan: true,
      },
    ]);
  });

  it('lists honest limitations', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    expect(model.limitations.some(limitation => limitation.text.includes('cosmetic hair care only'))).toBe(true);
    expect(model.limitations.some(limitation => limitation.text.includes('exact reviewed version only'))).toBe(true);
    expect(model.limitations.some(limitation => limitation.text.includes('not currently available'))).toBe(true);
  });

  it('deduplicates cited evidence', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    // evidence-1 is cited by two rules but appears once.
    expect(model.evidence.length).toBe(1);
    expect(model.evidence[0].covered).toBe(true);
    expect(model.evidence[0].note).toBe('Reviewed evidence supports this rule.');
  });

  it('fails to content_pending when cited evidence is not reviewed', () => {
    const model = buildProtocolPreview(
      input({ evidenceRegistry: evidenceRegistry({ records: Object.freeze([evidenceRecord({ status: 'draft' })]) }) }),
    );
    expect(model.status).toBe('content_pending');
    expect(model.explanation).toContain('evidence');
  });

  it('fails closed to unavailable when the registry identity does not match the bundle', () => {
    const model = buildProtocolPreview(
      input({ evidenceRegistry: evidenceRegistry({ registryId: 'other-registry', version: '9' }) }),
    );
    expect(model.status).toBe('unavailable');
    expect(model.explanation).toContain('verified');
  });

  it('fails closed to unavailable when a product step version no longer resolves', () => {
    const model = buildProtocolPreview(
      input({
        decision: readyDecision({
          steps: Object.freeze([
            {
              stepId: 'step-1',
              position: 1,
              action: 'apply',
              productId: 'product-1',
              productVersionId: 'version-9',
              toolId: null,
              toolVersionId: null,
              waitSeconds: null,
              rinse: null,
              reasons: Object.freeze([]),
            },
          ]),
        }),
      }),
    );
    expect(model.status).toBe('unavailable');
    expect(model.explanation).toContain('product');
  });

  it('fails closed to unavailable when a step is an apply with no product or tool', () => {
    const model = buildProtocolPreview(
      input({
        decision: readyDecision({
          steps: Object.freeze([
            {
              stepId: 'step-1',
              position: 1,
              action: 'apply',
              productId: null,
              productVersionId: null,
              toolId: null,
              toolVersionId: null,
              waitSeconds: null,
              rinse: null,
              reasons: Object.freeze([]),
            },
          ]),
        }),
      }),
    );
    expect(model.status).toBe('unavailable');
  });

  it('returns content_pending for every non-ready decision status', () => {
    for (const status of ['needs_input', 'rule_conflict', 'unsupported'] as const) {
      const model = buildProtocolPreview(input({ decision: readyDecision({ status }) }));
      expect(model.status).toBe('content_pending');
      expect(model.explanation).toBeTruthy();
    }
  });

  it('returns content_pending for a draft bundle', () => {
    const model = buildProtocolPreview(input({ bundle: publishedBundle({ status: 'draft' }) }));
    expect(model.status).toBe('content_pending');
  });

  it('returns content_pending for a bundle that is not the reviewed contract version', () => {
    const model = buildProtocolPreview(input({ bundle: publishedBundle({ version: '1' }) }));
    expect(model.status).toBe('content_pending');
  });

  it('returns content_pending when the bundle has no reviewer', () => {
    const model = buildProtocolPreview(input({ bundle: publishedBundle({ reviewedBy: '' }) }));
    expect(model.status).toBe('content_pending');
  });

  it('does not mutate the input decision or context', () => {
    const decision = readyDecision();
    const contextValue = context();
    buildProtocolPreview(input());
    expect(decision.status).toBe('ready');
    expect(decision.steps.length).toBe(3);
    expect(contextValue.products.length).toBe(2);
  });

  it('freezes the model so it cannot be mutated in place', () => {
    const model = buildProtocolPreview(input());
    expect(isReady(model)).toBe(true);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.steps)).toBe(true);
    expect(Object.isFrozen(model.steps[0])).toBe(true);
    expect(Object.isFrozen(model.confidence)).toBe(true);
    expect(Object.isFrozen(model.ownedItems)).toBe(true);
  });

  it('passes the recursive canary: no engine internals reach visible output', () => {
    const model = buildProtocolPreview(input());
    const strings = collectStrings(model);
    for (const text of strings) {
      expect(forbidden(text), `unexpected engine output: ${text}`).toBe(false);
    }
  });

  it('passes the recursive canary on an unavailable model too', () => {
    const model = buildProtocolPreview(
      input({ evidenceRegistry: evidenceRegistry({ registryId: 'other', version: '9' }) }),
    );
    const strings = collectStrings(model);
    for (const text of strings) {
      expect(forbidden(text), `unexpected engine output: ${text}`).toBe(false);
    }
  });

  it('binds a tool step to an exact published tool version', () => {
    const model = buildProtocolPreview(
      input({
        context: context({
          products: [],
          tools: [
            {
              toolId: 'tool-1',
              versionId: 'tool-version-1',
              name: 'Ionic dryer',
              available: true,
              verifiedCapabilities: Object.freeze(['heat-styling']),
              unknownCapabilities: Object.freeze([]),
            },
          ],
        }),
        bundle: publishedBundle({
          capabilities: Object.freeze([
            capabilityEntry({ kind: 'tool', versionId: 'tool-version-1', displayName: 'Ionic dryer', verifiedCapabilities: Object.freeze(['heat-styling']) }),
          ]),
        }),
        decision: readyDecision({
          steps: Object.freeze([
            {
              stepId: 'step-1',
              position: 1,
              action: 'apply',
              productId: null,
              productVersionId: null,
              toolId: 'tool-1',
              toolVersionId: 'tool-version-1',
              waitSeconds: null,
              rinse: null,
              reasons: Object.freeze([]),
            },
            {
              stepId: 'step-2',
              position: 2,
              action: 'leave_in',
              productId: null,
              productVersionId: null,
              toolId: null,
              toolVersionId: null,
              waitSeconds: null,
              rinse: false,
              reasons: Object.freeze([]),
            },
          ]),
        }),
      }),
    );
    expect(isReady(model)).toBe(true);
    expect(model.steps.map(step => step.action)).toEqual(['apply', 'leave_in']);
    expect(model.steps[0].item?.name).toBe('Ionic dryer');
    expect(model.steps[1].rinse).toBe(false);
    expect(model.steps[1].reason).toBe('Leave it in.');
  });

  it('fails closed to unavailable when a tool step version no longer resolves', () => {
    const model = buildProtocolPreview(
      input({
        context: context({
          products: [],
          tools: [
            {
              toolId: 'tool-1',
              versionId: 'tool-version-9',
              name: 'Ionic dryer',
              available: true,
              verifiedCapabilities: Object.freeze(['heat-styling']),
              unknownCapabilities: Object.freeze([]),
            },
          ],
        }),
        bundle: publishedBundle({
          capabilities: Object.freeze([
            capabilityEntry({ kind: 'tool', versionId: 'tool-version-9', displayName: 'Ionic dryer', verifiedCapabilities: Object.freeze(['heat-styling']) }),
          ]),
        }),
        decision: readyDecision({
          steps: Object.freeze([
            {
              stepId: 'step-1',
              position: 1,
              action: 'apply',
              productId: null,
              productVersionId: null,
              toolId: 'tool-1',
              toolVersionId: 'tool-version-missing',
              waitSeconds: null,
              rinse: null,
              reasons: Object.freeze([]),
            },
          ]),
        }),
      }),
    );
    expect(model.status).toBe('unavailable');
    expect(model.explanation).toContain('tool');
  });

  it('excludes alternatives whose capability is not published', () => {
    const model = buildProtocolPreview(
      input({
        context: context({
          products: [
            {
              productId: 'product-1',
              versionId: 'version-1',
              name: 'Garnier shampoo',
              owned: true,
              available: true,
              verifiedCapabilities: Object.freeze(['cleanse']),
              unknownCapabilities: Object.freeze([]),
            },
            {
              productId: 'product-3',
              versionId: 'version-3',
              name: 'Unreviewed balm',
              owned: true,
              available: true,
              verifiedCapabilities: Object.freeze(['cleanse']),
              unknownCapabilities: Object.freeze([]),
            },
          ],
        }),
        bundle: publishedBundle({ capabilities: Object.freeze([capabilityEntry()]) }),
      }),
    );
    expect(isReady(model)).toBe(true);
    expect(model.alternatives).toEqual([]);
  });

  it('flags other owned unavailable items as a limitation', () => {
    const model = buildProtocolPreview(
      input({
        context: context({
          products: [
            {
              productId: 'product-1',
              versionId: 'version-1',
              name: 'Garnier shampoo',
              owned: true,
              available: true,
              verifiedCapabilities: Object.freeze(['cleanse']),
              unknownCapabilities: Object.freeze([]),
            },
            {
              productId: 'product-2',
              versionId: 'version-2',
              name: 'Empty conditioner',
              owned: true,
              available: false,
              verifiedCapabilities: Object.freeze(['condition']),
              unknownCapabilities: Object.freeze([]),
            },
          ],
        }),
        bundle: publishedBundle({
          capabilities: Object.freeze([
            capabilityEntry(),
            capabilityEntry({ versionId: 'version-2', displayName: 'Empty conditioner', verifiedCapabilities: Object.freeze(['condition']) }),
          ]),
        }),
      }),
    );
    expect(isReady(model)).toBe(true);
    expect(model.limitations.some(limitation => limitation.text.includes('not currently available'))).toBe(true);
  });

  it('fails to content_pending when the bundle review date is after now', () => {
    const model = buildProtocolPreview(
      input({ bundle: publishedBundle({ reviewedAt: '2099-10-11T00:00:00.000Z' }) }),
    );
    expect(model.status).toBe('content_pending');
  });

  it('fails to content_pending when cited evidence is for another market', () => {
    const model = buildProtocolPreview(
      input({
        evidenceRegistry: evidenceRegistry({ records: Object.freeze([evidenceRecord({ market: 'GB' })]) }),
      }),
    );
    expect(model.status).toBe('content_pending');
  });

  it('fails to content_pending when cited evidence record is absent', () => {
    const model = buildProtocolPreview(
      input({ evidenceRegistry: evidenceRegistry({ records: Object.freeze([]) }) }),
    );
    expect(model.status).toBe('content_pending');
  });
});

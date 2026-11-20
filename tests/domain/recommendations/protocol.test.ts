import { describe, expect, it } from 'vitest';

import {
  buildProtocolDecision,
  collectEffects,
  evaluateRules,
  parseRecommendationContext,
  rankCandidates,
  type ProtocolBuildArgs,
  type ProtocolDecision,
  type RecommendationCondition,
} from '../../../packages/domain/src/index.ts';

const TRUE_CONDITION: RecommendationCondition = {
  kind: 'fact_equals',
  fact: 'goal',
  value: 'gentle-wash',
};

function product(
  productId: string,
  verified: readonly string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    productId,
    versionId: 'v1',
    name: `Fixture ${productId}`,
    owned: false,
    available: true,
    verifiedCapabilities: [...verified],
    unknownCapabilities: [],
    ...overrides,
  };
}

function tool(toolId: string, verified: readonly string[]) {
  return {
    toolId,
    versionId: 'v1',
    name: `Fixture ${toolId}`,
    available: true,
    verifiedCapabilities: [...verified],
  };
}

function hardRule(
  ruleId: string,
  condition: RecommendationCondition,
  effects: readonly Record<string, unknown>[],
  versionId = 'v1',
) {
  return {
    ruleId,
    versionId,
    status: 'published',
    strength: 'hard',
    condition,
    effects,
    reason: `Hard reason for ${ruleId}.`,
    evidenceIds: ['evidence-1'],
  };
}

function advisoryRule(
  ruleId: string,
  condition: RecommendationCondition,
  effects: readonly Record<string, unknown>[],
) {
  return {
    ruleId,
    versionId: 'v1',
    status: 'published',
    strength: 'advisory',
    condition,
    effects,
    reason: `Advisory reason for ${ruleId}.`,
    evidenceIds: ['evidence-1'],
  };
}

function rawContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'request-protocol',
    asOf: '2026-10-10T10:00:00.000Z',
    goal: 'gentle-wash',
    profileFacts: { pattern: 'curly' },
    products: [product('product-a', ['mild-cleanse'])],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [],
    ...overrides,
  };
}

function decide(raw: Record<string, unknown>): ProtocolDecision {
  const context = parseRecommendationContext(raw);
  const evaluation = evaluateRules(context);
  const collected = collectEffects(evaluation, context.rules);
  const ranking = rankCandidates({
    products: context.products,
    tools: context.tools,
    requiredCapabilities: collected.hard.required.map(entry => entry.capability),
    excludedCapabilities: collected.hard.excluded.map(entry => entry.capability),
    advisory: collected.advisory,
  });
  const args: ProtocolBuildArgs = {
    requestId: context.requestId,
    context,
    evaluation,
    collected,
    ranking,
  };
  return buildProtocolDecision(args);
}

describe('safe protocol construction and ranking', () => {
  it('emits a distinct heat reference only from a reviewed hard action', () => {
    const publicationId = '11111111-1111-4111-8111-111111111111';
    const publicationDigest = `sha256:${'a'.repeat(64)}`;
    const decision = decide(rawContext({ rules: [hardRule('rule-heat', TRUE_CONDITION, [
      { kind: 'assessed_heat_action', publicationId, publicationDigest },
    ])] }));
    expect(decision.status).toBe('ready');
    expect(decision.steps).toEqual([expect.objectContaining({
      action: 'heat', toolId: null, toolVersionId: null,
      heatActionRef: { publicationId, publicationDigest },
    })]);
  });

  it('does not turn an advisory heat action into a protocol step', () => {
    const decision = decide(rawContext({ rules: [advisoryRule('rule-heat-note', TRUE_CONDITION, [
      { kind: 'assessed_heat_action',
        publicationId: '11111111-1111-4111-8111-111111111111',
        publicationDigest: `sha256:${'a'.repeat(64)}` },
    ])] }));
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
  });

  it('blocks multiple assessed heat actions before choosing a publication', () => {
    const decision = decide(rawContext({ rules: [hardRule('rule-heat', TRUE_CONDITION, [
      { kind: 'assessed_heat_action', publicationId: '11111111-1111-4111-8111-111111111111',
        publicationDigest: `sha256:${'a'.repeat(64)}` },
      { kind: 'assessed_heat_action', publicationId: '22222222-2222-4222-8222-222222222222',
        publicationDigest: `sha256:${'b'.repeat(64)}` },
    ])] }));
    expect(decision.status).toBe('rule_conflict');
    expect(decision.steps).toEqual([]);
  });

  it('blocks an assessed heat action when a hard heat restriction prohibits exposure', () => {
    const decision = decide(rawContext({ rules: [hardRule('rule-heat', TRUE_CONDITION, [
      { kind: 'assessed_heat_action', publicationId: '11111111-1111-4111-8111-111111111111',
        publicationDigest: `sha256:${'a'.repeat(64)}` },
      { kind: 'heat_restriction', exposure: 'direct_contact', prohibited: true },
    ])] }));
    expect(decision.status).toBe('rule_conflict');
    expect(decision.steps).toEqual([]);
  });

  it('lets a hard exclusion remove a conflicting candidate', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-a', ['mild-cleanse', 'banned-x'], { owned: true }),
          product('product-b', ['mild-cleanse']),
        ],
        rules: [
          hardRule('rule-clean', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'exclude_capability', capability: 'banned-x' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps.map(step => step.productId)).toContain('product-b');
    expect(decision.steps.map(step => step.productId)).not.toContain('product-a');
    expect(decision.omissions.join(' ')).toContain('product-a');
  });

  it('returns unsupported when a hard requirement has no verified candidate', () => {
    const decision = decide(
      rawContext({
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'unobtainium' }])],
      }),
    );
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions.join(' ')).toContain('unobtainium');
  });

  it('returns needs_input when a hard rule needs an unknown fact', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-need-fact', { kind: 'fact_equals', fact: 'porosity', value: 'low' }, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('needs_input');
    expect(decision.missingInputs).toContain('porosity');
    expect(decision.steps).toEqual([]);
  });

  it('returns rule_conflict with both rule versions in the audit', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-require', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'contested' }], 'v1'),
          hardRule('rule-exclude', TRUE_CONDITION, [{ kind: 'exclude_capability', capability: 'contested' }], 'v2'),
        ],
      }),
    );
    expect(decision.status).toBe('rule_conflict');
    expect(decision.steps).toEqual([]);
    const refs = decision.audit.conflicts.flatMap(conflict => conflict.ruleRefs);
    expect(refs).toContain('rule-require@v1');
    expect(refs).toContain('rule-exclude@v2');
  });

  it('ranks an owned suitable product before an equally suitable unowned one', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-b', ['mild-cleanse']),
          product('product-a', ['mild-cleanse'], { owned: true }),
        ],
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].productId).toBe('product-a');
  });

  it('lets suitability and hard safety outrank ownership', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-owned', ['mild-cleanse', 'banned-x'], { owned: true }),
          product('product-plain', ['mild-cleanse']),
        ],
        rules: [
          hardRule('rule-safe', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'exclude_capability', capability: 'banned-x' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].productId).toBe('product-plain');
  });

  it('lets an advisory preference break ties among permitted candidates', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-b', ['mild-cleanse']),
          product('product-a', ['mild-cleanse', 'extra-gentle']),
        ],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
          advisoryRule('rule-prefer', TRUE_CONDITION, [{ kind: 'prefer_capability', capability: 'extra-gentle' }]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].productId).toBe('product-a');
    expect(decision.audit.rankedCandidates[0].candidateId).toBe('product-a');
  });

  it('resolves the final tie by stable id order', () => {
    const decision = decide(
      rawContext({
        products: [product('product-m', ['mild-cleanse']), product('product-a', ['mild-cleanse'])],
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
      }),
    );
    expect(decision.steps[0].productId).toBe('product-a');
  });

  it('surfaces order, wait, rinse, frequency, and heat effects in steps or audit', () => {
    const decision = decide(
      rawContext({
        tools: [tool('tool-a', ['heated-air'])],
        rules: [
          hardRule('rule-full', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'order_before', before: 'mild-cleanse', after: 'condition' },
            { kind: 'wait', durationSeconds: 30 },
            { kind: 'rinse', value: true },
            { kind: 'frequency', unit: 'wash_session', max: 2 },
            { kind: 'heat_restriction', exposure: 'direct_contact', prohibited: true },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    const stepText = JSON.stringify(decision.steps);
    expect(stepText).toContain('mild-cleanse');
    expect(stepText).toContain('before');
    expect(decision.steps.some(step => step.waitSeconds === 30)).toBe(true);
    expect(decision.steps.some(step => step.rinse === true)).toBe(true);
    const auditText = JSON.stringify(decision.audit.restrictions);
    expect(auditText).toContain('wash_session');
    expect(auditText).toContain('direct_contact');
  });

  it('leaves the caller input deeply equal to a pre-call clone', () => {
    const raw = rawContext({
      rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
    });
    const snapshot = JSON.parse(JSON.stringify(raw)) as unknown;
    decide(raw);
    expect(raw).toEqual(snapshot);
  });

  it('produces byte-equivalent decisions for reordered input collections', () => {
    const forward = rawContext({
      products: [product('product-a', ['mild-cleanse']), product('product-b', ['mild-cleanse'])],
      rules: [
        hardRule('rule-b', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
        hardRule('rule-a', TRUE_CONDITION, [{ kind: 'wait', durationSeconds: 10 }]),
      ],
    });
    const backward = rawContext({
      products: [product('product-b', ['mild-cleanse']), product('product-a', ['mild-cleanse'])],
      rules: [
        hardRule('rule-a', TRUE_CONDITION, [{ kind: 'wait', durationSeconds: 10 }]),
        hardRule('rule-b', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
      ],
    });
    expect(JSON.stringify(decide(forward))).toBe(JSON.stringify(decide(backward)));
  });

  it('emits no commercial ranking data', () => {
    const decision = decide(
      rawContext({
        products: [product('product-a', ['mild-cleanse'], { owned: true }), product('product-b', ['mild-cleanse'])],
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
      }),
    );
    const text = JSON.stringify(decision).toLowerCase();
    for (const banned of ['affiliate', 'sponsor', 'retailer', 'margin', 'commission']) {
      expect(text).not.toContain(banned);
    }
  });
});

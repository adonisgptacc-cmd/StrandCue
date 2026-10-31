import { describe, expect, it } from 'vitest';

import {
  RecommendationContextSchema,
  parseRecommendationContext,
  RecommendationValidationError,
  type RecommendationContext,
} from '../../../packages/domain/src/index.ts';

function validRule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-wash-order',
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition: {
      kind: 'fact_equals',
      fact: 'goal',
      value: 'gentle-wash',
    },
    effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }],
    reason: 'Mild cleansing protects sensitised zones.',
    evidenceIds: ['evidence-1'],
    ...overrides,
  };
}

function validContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'request-1',
    asOf: '2026-10-10T10:00:00.000Z',
    goal: 'gentle-wash',
    profileFacts: { pattern: 'curly', sensitised: true, washesPerWeek: 2, lastClarify: null },
    products: [
      {
        productId: 'product-a',
        versionId: 'v1',
        name: 'Fixture Mild Cleanser',
        owned: true,
        available: true,
        verifiedCapabilities: ['mild-cleanse'],
        unknownCapabilities: [],
      },
    ],
    tools: [
      {
        toolId: 'tool-a',
        versionId: 'v1',
        name: 'Fixture Dryer',
        available: true,
        verifiedCapabilities: ['heated-air'],
      },
    ],
    historyFacts: { washesSinceTreatment: 2 },
    environmentFacts: { humidity: 'high' },
    rules: [validRule()],
    ...overrides,
  };
}

describe('recommendation data contracts', () => {
  it('parses a valid context into fresh immutable structures', () => {
    const input = validContext();
    const parsed: RecommendationContext = parseRecommendationContext(input);
    expect(parsed).toEqual(input);
    expect(parsed).not.toBe(input);
    expect(parsed.products).not.toBe(input.products);
    expect(parsed.rules).not.toBe(input.rules);
    expect(RecommendationContextSchema.parse(input)).toEqual(input);
  });

  it('does not let later caller mutation leak into parsed output', () => {
    const input = validContext();
    const parsed = parseRecommendationContext(input);
    (input.products as Record<string, unknown>[])[0] = {
      ...(input.products as Record<string, unknown>[])[0],
      owned: false,
    };
    expect(parsed.products[0].owned).toBe(true);
  });

  it.each([
    ['all', { kind: 'all', conditions: [{ kind: 'fact_equals', fact: 'a', value: 1 }] }],
    ['any', { kind: 'any', conditions: [{ kind: 'fact_equals', fact: 'a', value: 1 }] }],
    ['not', { kind: 'not', condition: { kind: 'fact_equals', fact: 'a', value: 1 } }],
    ['fact_equals', { kind: 'fact_equals', fact: 'a', value: null }],
    ['fact_in', { kind: 'fact_in', fact: 'a', values: [1, 'two', true, null] }],
    ['capability_available', { kind: 'capability_available', capability: 'mild-cleanse' }],
  ])('accepts the %s condition node', (_name, condition) => {
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ condition })] })),
    ).not.toThrow();
  });

  it.each([
    ['require_capability', { kind: 'require_capability', capability: 'mild-cleanse' }],
    ['exclude_capability', { kind: 'exclude_capability', capability: 'direct-heat' }],
    ['order_before', { kind: 'order_before', before: 'cleanse', after: 'condition' }],
    ['order_after', { kind: 'order_after', before: 'cleanse', after: 'condition' }],
    ['wait', { kind: 'wait', durationSeconds: 0 }],
    ['rinse', { kind: 'rinse', value: true }],
    ['frequency', { kind: 'frequency', unit: 'wash_session', max: 2 }],
    ['heat_restriction', { kind: 'heat_restriction', exposure: 'direct_contact', prohibited: true }],
    ['assessed_heat_action', { kind: 'assessed_heat_action',
      publicationId: '11111111-1111-4111-8111-111111111111',
      publicationDigest: `sha256:${'a'.repeat(64)}` }],
    ['prefer_capability', { kind: 'prefer_capability', capability: 'mild-cleanse' }],
  ])('accepts the %s effect', (_name, effect) => {
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ effects: [effect] })] })),
    ).not.toThrow();
  });

  it('rejects unknown keys at every level', () => {
    expect(() => parseRecommendationContext({ ...validContext(), extra: 1 })).toThrow();
    const product = { ...(validContext().products as Record<string, unknown>[])[0], extra: 1 };
    expect(() => parseRecommendationContext(validContext({ products: [product] }))).toThrow();
    expect(() =>
      parseRecommendationContext(
        validContext({ rules: [validRule({ effects: [{ kind: 'wait', durationSeconds: 5, extra: 1 }] })] }),
      ),
    ).toThrow();
    expect(() =>
      parseRecommendationContext(
        validContext({ rules: [validRule({ condition: { kind: 'fact_equals', fact: 'a', value: 1, extra: 1 } })] }),
      ),
    ).toThrow();
  });

  it('rejects an unknown condition kind and effect kind', () => {
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ condition: { kind: 'sometimes' } })] })),
    ).toThrow();
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ effects: [{ kind: 'teleport' }] })] })),
    ).toThrow();
  });

  it('rejects a heat action without an exact publication identity', () => {
    for (const effect of [
      { kind: 'assessed_heat_action', publicationId: 'not-a-uuid', publicationDigest: `sha256:${'a'.repeat(64)}` },
      { kind: 'assessed_heat_action', publicationId: '11111111-1111-4111-8111-111111111111', publicationDigest: 'draft' },
      { kind: 'assessed_heat_action', publicationId: '11111111-1111-4111-8111-111111111111',
        publicationDigest: `sha256:${'a'.repeat(64)}`, maxTemperature: 300 },
    ]) {
      expect(() => parseRecommendationContext(validContext({ rules: [validRule({ effects: [effect] })] }))).toThrow();
    }
  });

  it('rejects invalid dates, waits, frequencies, and temperatures', () => {
    expect(() => parseRecommendationContext(validContext({ asOf: 'not-a-date' }))).toThrow();
    expect(() => parseRecommendationContext(validContext({ asOf: '2026-10-10' }))).toThrow();
    const badWait = [{ kind: 'wait', durationSeconds: -1 }];
    expect(() => parseRecommendationContext(validContext({ rules: [validRule({ effects: badWait })] }))).toThrow();
    const fractionalWait = [{ kind: 'wait', durationSeconds: 1.5 }];
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ effects: fractionalWait })] })),
    ).toThrow();
    const badUnit = [{ kind: 'frequency', unit: 'per_shower_thought', max: 1 }];
    expect(() => parseRecommendationContext(validContext({ rules: [validRule({ effects: badUnit })] }))).toThrow();
    const badBounds = [{ kind: 'frequency', unit: 'wash_session', min: 3, max: 2 }];
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ effects: badBounds })] })),
    ).toThrow();
    const badExposure = [{ kind: 'heat_restriction', exposure: 'sunlight', prohibited: true }];
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ effects: badExposure })] })),
    ).toThrow();
    for (const temperature of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const badHeat = [
        { kind: 'heat_restriction', exposure: 'heated_air', prohibited: false, maxTemperatureCelsius: temperature },
      ];
      expect(() =>
        parseRecommendationContext(validContext({ rules: [validRule({ effects: badHeat })] })),
      ).toThrow();
    }
  });

  it('rejects empty combinators, empty effects, and empty reasons', () => {
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ condition: { kind: 'all', conditions: [] } })] })),
    ).toThrow();
    expect(() => parseRecommendationContext(validContext({ rules: [validRule({ effects: [] })] }))).toThrow();
    expect(() => parseRecommendationContext(validContext({ rules: [validRule({ reason: '' })] }))).toThrow();
    expect(() => parseRecommendationContext(validContext({ requestId: '' }))).toThrow();
    expect(() => parseRecommendationContext(validContext({ goal: '' }))).toThrow();
  });

  it('rejects duplicate rule, product, and tool versions', () => {
    const duplicateRule = [validRule(), validRule()];
    expect(() => parseRecommendationContext(validContext({ rules: duplicateRule }))).toThrow(
      RecommendationValidationError,
    );
    try {
      parseRecommendationContext(validContext({ rules: duplicateRule }));
      expect.unreachable();
    } catch (error) {
      expect((error as RecommendationValidationError).code).toBe('duplicate-rule-version');
    }
    const products = validContext().products as Record<string, unknown>[];
    expect(() =>
      parseRecommendationContext(validContext({ products: [products[0], products[0]] })),
    ).toThrow(RecommendationValidationError);
    const tools = validContext().tools as Record<string, unknown>[];
    expect(() =>
      parseRecommendationContext(validContext({ tools: [tools[0], tools[0]] })),
    ).toThrow(RecommendationValidationError);
  });

  it('allows the same rule and product identities at different versions', () => {
    const rules = [validRule(), validRule({ versionId: 'v2' })];
    const products = validContext().products as Record<string, unknown>[];
    const diversified = [products[0], { ...products[0], versionId: 'v2' }];
    expect(() =>
      parseRecommendationContext(validContext({ rules, products: diversified })),
    ).not.toThrow();
  });

  it('requires evidence for published rules but not withdrawn ones', () => {
    expect(() =>
      parseRecommendationContext(validContext({ rules: [validRule({ evidenceIds: [] })] })),
    ).toThrow(RecommendationValidationError);
    expect(() =>
      parseRecommendationContext(
        validContext({ rules: [validRule({ status: 'withdrawn', evidenceIds: [] })] }),
      ),
    ).not.toThrow();
  });

  it('rejects non-object input', () => {
    for (const input of [null, undefined, 'request', 42, []]) {
      expect(() => parseRecommendationContext(input)).toThrow();
    }
  });
});

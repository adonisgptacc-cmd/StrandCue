import { describe, expect, it } from 'vitest';

import {
  evaluateCondition,
  evaluateRules,
  type ConditionResult,
} from '../../../packages/domain/src/index.ts';
import type {
  RecommendationCondition,
  RecommendationContext,
} from '../../../packages/domain/src/index.ts';

function baseContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'request-rules',
    asOf: '2026-10-10T10:00:00.000Z',
    goal: 'gentle-wash',
    profileFacts: { pattern: 'curly', sensitised: true },
    products: [
      {
        productId: 'product-a',
        versionId: 'v1',
        name: 'Fixture Mild Cleanser',
        owned: true,
        available: true,
        verifiedCapabilities: ['mild-cleanse'],
        unknownCapabilities: ['uv-protect'],
      },
      {
        productId: 'product-b',
        versionId: 'v1',
        name: 'Fixture Shelved Tonic',
        owned: true,
        available: false,
        verifiedCapabilities: ['shelved-only'],
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
    historyFacts: {},
    environmentFacts: { humidity: 'high' },
    rules: [],
    ...overrides,
  };
}

function contextWithRules(rules: Record<string, unknown>[]): RecommendationContext {
  return baseContext({ rules }) as unknown as RecommendationContext;
}

function rule(ruleId: string, condition: RecommendationCondition, extra: Record<string, unknown> = {}) {
  return {
    ruleId,
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition,
    effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }],
    reason: `Reason for ${ruleId}.`,
    evidenceIds: ['evidence-1'],
    ...extra,
  };
}

describe('deterministic rule evaluation', () => {
  it('resolves fact equality against merged facts including the goal', () => {
    const context = contextWithRules([]);
    const hit: ConditionResult = evaluateCondition(
      { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' },
      context,
    );
    expect(hit).toEqual({ value: 'true', missingFacts: [] });
    const miss = evaluateCondition(
      { kind: 'fact_equals', fact: 'pattern', value: 'straight' },
      context,
    );
    expect(miss.value).toBe('false');
  });

  it('treats missing and null facts as unknown rather than false', () => {
    const context = contextWithRules([]);
    const missing = evaluateCondition(
      { kind: 'fact_equals', fact: 'porosity', value: 'low' },
      context,
    );
    expect(missing).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
    const nullContext = contextWithRules([]) as unknown as Record<string, unknown>;
    (nullContext.profileFacts as Record<string, unknown>).porosity = null;
    const nullish = evaluateCondition(
      { kind: 'fact_in', fact: 'porosity', values: ['low', 'high'] },
      nullContext as unknown as RecommendationContext,
    );
    expect(nullish).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
  });

  it('keeps not-unknown as unknown', () => {
    const context = contextWithRules([]);
    const result = evaluateCondition(
      { kind: 'not', condition: { kind: 'fact_equals', fact: 'porosity', value: 'low' } },
      context,
    );
    expect(result).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
    const negated = evaluateCondition(
      { kind: 'not', condition: { kind: 'fact_equals', fact: 'pattern', value: 'straight' } },
      context,
    );
    expect(negated.value).toBe('true');
  });

  it('applies Kleene logic to nested all and any', () => {
    const context = contextWithRules([]);
    const falseChild: RecommendationCondition = { kind: 'fact_equals', fact: 'pattern', value: 'straight' };
    const trueChild: RecommendationCondition = { kind: 'fact_equals', fact: 'pattern', value: 'curly' };
    const unknownChild: RecommendationCondition = { kind: 'fact_equals', fact: 'porosity', value: 'low' };
    expect(
      evaluateCondition({ kind: 'all', conditions: [trueChild, unknownChild, falseChild] }, context).value,
    ).toBe('false');
    expect(
      evaluateCondition({ kind: 'all', conditions: [trueChild, unknownChild] }, context),
    ).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
    expect(
      evaluateCondition(
        { kind: 'any', conditions: [falseChild, { kind: 'not', condition: unknownChild }, trueChild] },
        context,
      ).value,
    ).toBe('true');
    expect(
      evaluateCondition({ kind: 'any', conditions: [falseChild, unknownChild] }, context),
    ).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
    expect(
      evaluateCondition(
        {
          kind: 'all',
          conditions: [{ kind: 'any', conditions: [trueChild] }, { kind: 'not', condition: falseChild }],
        },
        context,
      ).value,
    ).toBe('true');
  });

  it('satisfies capability checks only with verified available capabilities', () => {
    const context = contextWithRules([]);
    expect(
      evaluateCondition({ kind: 'capability_available', capability: 'mild-cleanse' }, context).value,
    ).toBe('true');
    expect(
      evaluateCondition({ kind: 'capability_available', capability: 'heated-air' }, context).value,
    ).toBe('true');
    const unavailable = evaluateCondition(
      { kind: 'capability_available', capability: 'shelved-only' },
      context,
    );
    expect(unavailable.value).toBe('false');
    const unverified = evaluateCondition(
      { kind: 'capability_available', capability: 'uv-protect' },
      context,
    );
    expect(unverified.value).toBe('false');
  });

  it('separates applied, not-applicable, unknown, and withdrawn rules', () => {
    const context = contextWithRules([
      rule('rule-applies', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }),
      rule('rule-skipped', { kind: 'fact_equals', fact: 'pattern', value: 'straight' }),
      rule('rule-unclear', { kind: 'fact_equals', fact: 'porosity', value: 'low' }),
      rule('rule-retired', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }, { status: 'withdrawn', evidenceIds: [] }),
    ]);
    const evaluation = evaluateRules(context);
    expect(evaluation.applied.map(entry => entry.ruleId)).toEqual(['rule-applies']);
    expect(evaluation.notApplicable.map(entry => entry.ruleId)).toEqual(['rule-skipped']);
    expect(evaluation.unknown.map(entry => entry.ruleId)).toEqual(['rule-unclear']);
    expect(evaluation.withdrawn.map(entry => entry.ruleId)).toEqual(['rule-retired']);
    expect(evaluation.unknown[0].missingFacts).toEqual(['porosity']);
    for (const bucket of [evaluation.applied, evaluation.notApplicable, evaluation.unknown, evaluation.withdrawn]) {
      for (const entry of bucket) {
        expect(entry.versionId).toBe('v1');
        expect(entry.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('evaluates in stable ruleId then versionId order', () => {
    const context = contextWithRules([
      rule('rule-b', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }),
      rule('rule-a', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }),
      { ...rule('rule-a', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }), versionId: 'v0' },
    ]);
    const evaluation = evaluateRules(context);
    expect(evaluation.applied.map(entry => `${entry.ruleId}@${entry.versionId}`)).toEqual([
      'rule-a@v0',
      'rule-a@v1',
      'rule-b@v1',
    ]);
  });

  it('produces byte-equivalent JSON on repeated evaluation', () => {
    const context = contextWithRules([
      rule('rule-b', { kind: 'fact_equals', fact: 'porosity', value: 'low' }),
      rule('rule-a', { kind: 'fact_equals', fact: 'pattern', value: 'curly' }),
    ]);
    expect(JSON.stringify(evaluateRules(context))).toBe(JSON.stringify(evaluateRules(context)));
    expect(JSON.stringify(evaluateCondition({ kind: 'fact_equals', fact: 'pattern', value: 'curly' }, context))).toBe(
      JSON.stringify(evaluateCondition({ kind: 'fact_equals', fact: 'pattern', value: 'curly' }, context)),
    );
  });

  it('never mutates the caller-owned context', () => {
    const raw = baseContext({
      rules: [rule('rule-a', { kind: 'fact_equals', fact: 'pattern', value: 'curly' })],
    });
    const snapshot = JSON.parse(JSON.stringify(raw)) as unknown;
    evaluateRules(raw as unknown as RecommendationContext);
    expect(raw).toEqual(snapshot);
  });
});

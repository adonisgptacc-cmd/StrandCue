import { describe, expect, it } from 'vitest';

import { generateProtocol } from '../../../packages/domain/src/recommendations/index.ts';

const active = { kind: 'fact_equals', fact: 'goal', value: 'wash' } as const;

function product(
  productId: string,
  versionId: string,
  capabilities: readonly string[],
  owned = true,
) {
  return {
    productId,
    versionId,
    name: `${productId} ${versionId}`,
    owned,
    available: true,
    verifiedCapabilities: [...capabilities],
    unknownCapabilities: [],
  };
}

function tool(toolId: string, capabilities: readonly string[]) {
  return {
    toolId,
    versionId: 'v1',
    name: toolId,
    available: true,
    verifiedCapabilities: [...capabilities],
  };
}

function rule(ruleId: string, effects: readonly Record<string, unknown>[]) {
  return {
    ruleId,
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition: active,
    effects,
    reason: `Reason for ${ruleId}`,
    evidenceIds: [`evidence-${ruleId}`],
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'request-review',
    asOf: '2026-10-11T00:00:00.000+02:00',
    goal: 'wash',
    profileFacts: {},
    products: [product('cleanser', 'v1', ['cleanse'])],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [rule('cleanse', [{ kind: 'require_capability', capability: 'cleanse' }])],
    ...overrides,
  };
}

describe('recommendation acceptance regressions', () => {
  it('retains evidence references in the rule audit', () => {
    const decision = generateProtocol(context());
    expect(decision.audit.evaluatedRules[0]).toMatchObject({
      ruleId: 'cleanse',
      versionId: 'v1',
      evidenceIds: ['evidence-cleanse'],
    });
  });

  it('supports activation as a typed hard effect', () => {
    const decision = generateProtocol(context({
      products: [product('cleanser', 'v1', ['cleanse', 'water-activated'])],
      rules: [rule('activation', [
        { kind: 'require_capability', capability: 'cleanse' },
        { kind: 'activation', capability: 'water-activated' },
      ])],
    }));
    expect(decision.status).toBe('ready');
    expect(decision.steps.map(step => step.reasons.join(' ')).join(' ')).toContain('water-activated');
  });

  it('selects one exact product version when identities repeat', () => {
    const decision = generateProtocol(context({
      products: [
        product('cleanser', 'v2', ['cleanse']),
        product('cleanser', 'v1', ['cleanse']),
      ],
    }));
    const selected = decision.audit.rankedCandidates.filter(candidate => candidate.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({ candidateId: 'cleanser', versionId: 'v1' });
  });

  it('states when a ready protocol needs no purchase', () => {
    expect(generateProtocol(context()).noPurchaseNeeded).toBe(true);
    expect(generateProtocol(context({
      products: [product('cleanser', 'v1', ['cleanse'], false)],
    })).noPurchaseNeeded).toBe(false);
  });

  it('enforces prohibited heat exposures without a duplicate exclude effect', () => {
    const decision = generateProtocol(context({
      products: [],
      tools: [tool('direct-iron', ['style', 'direct_contact']), tool('air-tool', ['style'])],
      rules: [rule('safe-heat', [
        { kind: 'require_capability', capability: 'style' },
        { kind: 'heat_restriction', exposure: 'direct_contact', prohibited: true },
      ])],
    }));
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].toolId).toBe('air-tool');
    expect(decision.audit.rejectedCandidates.map(candidate => candidate.candidateId)).toContain('direct-iron');
  });
});

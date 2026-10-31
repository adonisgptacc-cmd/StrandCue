import { describe, expect, it } from 'vitest';

import {
  buildProtocolDecision,
  collectEffects,
  evaluateCondition,
  evaluateRules,
  generateProtocol,
  parseRecommendationContext,
  rankCandidates,
  type ProtocolBuildArgs,
  type ProtocolDecision,
  type RecommendationCondition,
  type RecommendationContext,
} from '../../../packages/domain/src/index.ts';

const TRUE_CONDITION: RecommendationCondition = {
  kind: 'fact_equals',
  fact: 'goal',
  value: 'gentle-wash',
};

function product(productId: string, verified: readonly string[], overrides: Record<string, unknown> = {}) {
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

function advisoryRule(ruleId: string, condition: RecommendationCondition, effects: readonly Record<string, unknown>[]) {
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
    requestId: 'request-boundary',
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
  return generateProtocol(raw);
}

describe('recommendation boundary behavior', () => {
  it('conflicts when heat is both allowed and prohibited', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-allow', TRUE_CONDITION, [
            { kind: 'heat_restriction', exposure: 'heated_air', prohibited: false },
          ]),
          hardRule('rule-deny', TRUE_CONDITION, [
            { kind: 'heat_restriction', exposure: 'heated_air', prohibited: true },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('rule_conflict');
    expect(decision.audit.conflicts[0].kind).toBe('heat');
    expect(decision.audit.conflicts[0].ruleRefs).toEqual(['rule-allow@v1', 'rule-deny@v1']);
  });

  it('conflicts on an ordering cycle and on a self loop', () => {
    const cycle = decide(
      rawContext({
        rules: [
          hardRule('rule-first', TRUE_CONDITION, [{ kind: 'order_before', before: 'alpha', after: 'beta' }]),
          hardRule('rule-second', TRUE_CONDITION, [{ kind: 'order_before', before: 'beta', after: 'alpha' }]),
        ],
      }),
    );
    expect(cycle.status).toBe('rule_conflict');
    expect(cycle.audit.conflicts[0].kind).toBe('order');
    expect(cycle.audit.conflicts[0].detail).toContain('alpha');
    const loop = decide(
      rawContext({
        rules: [hardRule('rule-loop', TRUE_CONDITION, [{ kind: 'order_after', before: 'alpha', after: 'alpha' }])],
      }),
    );
    expect(loop.status).toBe('rule_conflict');
  });

  it('conflicts on mutually impossible frequency bounds', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-often', TRUE_CONDITION, [{ kind: 'frequency', unit: 'wash_session', min: 3 }]),
          hardRule('rule-rare', TRUE_CONDITION, [{ kind: 'frequency', unit: 'wash_session', max: 2 }]),
        ],
      }),
    );
    expect(decision.status).toBe('rule_conflict');
    expect(decision.audit.conflicts[0].kind).toBe('frequency');
    expect(decision.audit.conflicts[0].ruleRefs).toEqual(['rule-often@v1', 'rule-rare@v1']);
  });

  it('sorts multiple conflict kinds deterministically', () => {
    const decision = decide(
      rawContext({
        products: [product('product-a', ['mild-cleanse', 'zeta', 'omega'])],
        rules: [
          hardRule('rule-zeta', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'zeta' }]),
          hardRule('rule-no-zeta', TRUE_CONDITION, [{ kind: 'exclude_capability', capability: 'zeta' }]),
          hardRule('rule-omega', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'omega' }]),
          hardRule('rule-no-omega', TRUE_CONDITION, [{ kind: 'exclude_capability', capability: 'omega' }]),
          hardRule('rule-heat-a', TRUE_CONDITION, [
            { kind: 'heat_restriction', exposure: 'steam', prohibited: false },
          ]),
          hardRule('rule-heat-b', TRUE_CONDITION, [
            { kind: 'heat_restriction', exposure: 'steam', prohibited: true },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('rule_conflict');
    const kinds = decision.audit.conflicts.map(conflict => conflict.kind);
    expect(kinds).toEqual(['capability', 'capability', 'heat']);
    expect(decision.audit.conflicts[0].detail).toContain('omega');
    expect(decision.audit.conflicts[1].detail).toContain('zeta');
  });

  it('treats advisory require and exclude as preferences, not constraints', () => {
    const decision = decide(
      rawContext({
        products: [product('product-a', ['mild-cleanse'])],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
          advisoryRule('rule-wish', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'unowned-wish' }]),
          advisoryRule('rule-avoid', TRUE_CONDITION, [{ kind: 'exclude_capability', capability: 'mild-cleanse' }]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].productId).toBe('product-a');
    expect(decision.audit.rankedCandidates[0].advisoryMatches).toBe(0);
  });

  it('counts an advisory exclude satisfied only when the capability is fully absent', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-a', ['mild-cleanse'], { unknownCapabilities: ['extra-gentle'] }),
          product('product-b', ['mild-cleanse']),
        ],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
          advisoryRule('rule-avoid', TRUE_CONDITION, [{ kind: 'exclude_capability', capability: 'extra-gentle' }]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    const ranked = decision.audit.rankedCandidates;
    expect(ranked.find(entry => entry.candidateId === 'product-b')?.advisoryMatches).toBe(1);
    expect(ranked.find(entry => entry.candidateId === 'product-a')?.advisoryMatches).toBe(0);
    expect(decision.steps[0].productId).toBe('product-b');
  });

  it('records advisory order and wait effects without constraining the plan', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
          advisoryRule('rule-hint', TRUE_CONDITION, [
            { kind: 'order_before', before: 'mild-cleanse', after: 'condition' },
            { kind: 'wait', durationSeconds: 60 },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps.filter(step => step.action === 'wait')).toEqual([]);
    const notes = decision.audit.restrictions.map(entry => entry.description).join(' ');
    expect(notes).toContain('order_before');
    expect(notes).toContain('wait');
  });

  it('treats a hard prefer_capability as an advisory preference', () => {
    const decision = decide(
      rawContext({
        products: [product('product-a', ['mild-cleanse', 'extra-gentle'])],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'prefer_capability', capability: 'extra-gentle' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].reasons.join(' ')).toContain('Advisory preference from rule-need@v1');
  });

  it('orders apply steps along required order edges', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-alpha', ['alpha']),
          product('product-beta', ['beta']),
          product('product-gamma', ['gamma']),
        ],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'alpha' },
            { kind: 'require_capability', capability: 'beta' },
            { kind: 'require_capability', capability: 'gamma' },
            { kind: 'order_before', before: 'beta', after: 'gamma' },
            { kind: 'order_before', before: 'gamma', after: 'alpha' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps.map(step => step.productId)).toEqual([
      'product-beta',
      'product-gamma',
      'product-alpha',
    ]);
  });

  it('emits leave_in steps and bounded restriction text', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'rinse', value: false },
            { kind: 'frequency', unit: 'application', min: 1, max: 2 },
            { kind: 'heat_restriction', exposure: 'hooded_heat', prohibited: false, maxTemperatureCelsius: 150 },
          ]),
          hardRule('rule-air', TRUE_CONDITION, [
            { kind: 'heat_restriction', exposure: 'heated_air', prohibited: false },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps.some(step => step.action === 'leave_in' && step.rinse === false)).toBe(true);
    const text = decision.audit.restrictions.map(entry => entry.description).join(' ');
    expect(text).toContain('at least 1 and at most 2');
    expect(text).toContain('Limit');
    expect(text).toContain('150');
    expect(text).toContain('Only');
  });

  it('omits unavailable candidates and lists alternatives', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-shelved', ['mild-cleanse'], { owned: true, available: false }),
          product('product-first', ['mild-cleanse']),
          product('product-second', ['mild-cleanse']),
          product('product-third', ['mild-cleanse']),
        ],
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.steps[0].productId).toBe('product-first');
    expect(decision.omissions.join(' ')).toContain('Unavailable Fixture product-shelved (product-shelved)');
    expect(decision.alternatives).toHaveLength(2);
    expect(decision.alternatives[0]).toContain('product-second');
  });

  it('limits confidence when a selected item has uncertain relevant capabilities', () => {
    const decision = decide(
      rawContext({
        products: [product('product-a', ['mild-cleanse'], { owned: true, unknownCapabilities: ['extra-gentle'] })],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
          advisoryRule('rule-wish', TRUE_CONDITION, [{ kind: 'prefer_capability', capability: 'extra-gentle' }]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.confidence).toBe('limited');
  });

  it('collects missing inputs across hard rules in stable order', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-second', { kind: 'fact_equals', fact: 'porosity', value: 'low' }, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
          ]),
          hardRule('rule-first', { kind: 'fact_equals', fact: 'density', value: 'high' }, [
            { kind: 'wait', durationSeconds: 5 },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('needs_input');
    expect(decision.missingInputs).toEqual(['density', 'porosity']);
    expect(decision.audit.missingInputs).toEqual(['density', 'porosity']);
  });

  it('does not claim a ready protocol when no rules apply', () => {
    const decision = decide(rawContext({ products: [], tools: [], rules: [] }));
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
    expect(decision.confidence).toBe('limited');
    expect(decision.omissions.join(' ')).toContain('No published hard rule');
  });

  it('reports unsupported through tool-only requirements', () => {
    const decision = decide(
      rawContext({
        products: [],
        tools: [tool('tool-cold', ['unheated-air'])],
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'hooded_heat' }])],
      }),
    );
    expect(decision.status).toBe('unsupported');
  });

  it('keeps not-applicable and withdrawn rules visible in the audit', () => {
    const decision = decide(
      rawContext({
        rules: [
          hardRule('rule-miss', { kind: 'fact_equals', fact: 'pattern', value: 'straight' }, [
            { kind: 'wait', durationSeconds: 5 },
          ]),
          {
            ...hardRule('rule-old', TRUE_CONDITION, [{ kind: 'wait', durationSeconds: 5 }]),
            status: 'withdrawn',
            evidenceIds: [],
          },
          hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    const outcomes = new Map(decision.audit.evaluatedRules.map(entry => [entry.ruleId, entry.outcome]));
    expect(outcomes.get('rule-miss')).toBe('not_applicable');
    expect(outcomes.get('rule-old')).toBe('withdrawn');
    expect(outcomes.get('rule-need')).toBe('applied');
  });

  it('sorts rejected candidates by stable id order', () => {
    const decision = decide(
      rawContext({
        products: [
          product('product-zed', ['banned-x']),
          product('product-abc', ['banned-x']),
          product('product-ok', ['mild-cleanse']),
        ],
        rules: [
          hardRule('rule-need', TRUE_CONDITION, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
            { kind: 'exclude_capability', capability: 'banned-x' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.audit.rejectedCandidates.map(entry => entry.candidateId)).toEqual([
      'product-abc',
      'product-zed',
    ]);
  });

  it('resolves fact_in, negation, duplicate unknowns, and goal shadowing', () => {
    const context = parseRecommendationContext(
      rawContext({ profileFacts: { pattern: 'curly', goal: 'shadowed-goal' } }),
    );
    expect(
      evaluateCondition({ kind: 'fact_in', fact: 'pattern', values: ['straight', 'curly'] }, context).value,
    ).toBe('true');
    expect(
      evaluateCondition({ kind: 'fact_in', fact: 'pattern', values: ['straight'] }, context).value,
    ).toBe('false');
    expect(
      evaluateCondition(
        { kind: 'not', condition: { kind: 'fact_equals', fact: 'pattern', value: 'curly' } },
        context,
      ).value,
    ).toBe('false');
    expect(
      evaluateCondition({ kind: 'fact_equals', fact: 'goal', value: 'shadowed-goal' }, context).value,
    ).toBe('true');
    expect(
      evaluateCondition(
        {
          kind: 'all',
          conditions: [
            { kind: 'fact_equals', fact: 'porosity', value: 'low' },
            { kind: 'any', conditions: [{ kind: 'fact_equals', fact: 'porosity', value: 'high' }] },
          ],
        },
        context,
      ),
    ).toEqual({ value: 'unknown', missingFacts: ['porosity'] });
  });

  it('orders reversed rule pairs and tolerates identical references', () => {
    const ascending = parseRecommendationContext(
      rawContext({
        rules: [
          hardRule('rule-a', TRUE_CONDITION, [{ kind: 'wait', durationSeconds: 1 }]),
          hardRule('rule-b', TRUE_CONDITION, [{ kind: 'wait', durationSeconds: 2 }]),
        ],
      }),
    );
    const evaluation = evaluateRules(ascending);
    expect(evaluation.applied.map(entry => entry.ruleId)).toEqual(['rule-a', 'rule-b']);
    const duplicated = {
      ...ascending,
      rules: [...ascending.rules, ...ascending.rules],
    } as RecommendationContext;
    const repeated = evaluateRules(duplicated);
    expect(repeated.applied).toHaveLength(4);
  });

  it('skips a step defensively when ranking omits a covering candidate', () => {
    const context = parseRecommendationContext(
      rawContext({
        rules: [hardRule('rule-need', TRUE_CONDITION, [{ kind: 'require_capability', capability: 'mild-cleanse' }])],
      }),
    );
    const evaluation = evaluateRules(context);
    const collected = collectEffects(evaluation, context.rules);
    const ranking = rankCandidates({
      products: [],
      tools: [],
      requiredCapabilities: collected.hard.required.map(entry => entry.capability),
      excludedCapabilities: collected.hard.excluded.map(entry => entry.capability),
      advisory: collected.advisory,
    });
    const args: ProtocolBuildArgs = { requestId: context.requestId, context, evaluation, collected, ranking };
    const decision = buildProtocolDecision(args);
    expect(decision.status).toBe('ready');
    expect(decision.steps).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  generateProtocol,
  RecommendationValidationError,
  type ProtocolDecision,
} from '../../../packages/domain/src/index.ts';

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
  condition: Record<string, unknown>,
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

function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'request-engine',
    asOf: '2026-10-10T10:00:00.000Z',
    goal: 'gentle-wash',
    profileFacts: { pattern: 'curly' },
    products: [product('product-owned', ['mild-cleanse'], { owned: true })],
    tools: [],
    historyFacts: {},
    environmentFacts: {},
    rules: [
      hardRule('rule-clean', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
        { kind: 'require_capability', capability: 'mild-cleanse' },
      ]),
    ],
    ...overrides,
  };
}

describe('generateProtocol', () => {
  it('builds an ordinary wash protocol with an owned suitable product', () => {
    const decision: ProtocolDecision = generateProtocol(baseInput());
    expect(decision.status).toBe('ready');
    expect(decision.requestId).toBe('request-engine');
    expect(decision.confidence).toBe('high');
    expect(decision.steps.length).toBeGreaterThan(0);
    expect(decision.steps[0].productId).toBe('product-owned');
    expect(decision.audit.evaluatedRules.map(entry => entry.ruleId)).toContain('rule-clean');
    expect(decision.audit.engineVersion).toBe('1');
  });

  it('excludes direct-contact heat while permitting a lower-risk verified option', () => {
    const decision = generateProtocol(
      baseInput({
        tools: [tool('tool-direct', ['direct_contact']), tool('tool-hood', ['hooded_heat'])],
        rules: [
          hardRule('rule-clean', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
          ]),
          hardRule('rule-heat', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
            { kind: 'exclude_capability', capability: 'direct_contact' },
            { kind: 'require_capability', capability: 'hooded_heat' },
            { kind: 'heat_restriction', exposure: 'direct_contact', prohibited: true },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    const toolSteps = decision.steps.filter(step => step.toolId !== null);
    expect(toolSteps.map(step => step.toolId)).toContain('tool-hood');
    expect(toolSteps.map(step => step.toolId)).not.toContain('tool-direct');
    expect(decision.omissions.join(' ')).toContain('tool-direct');
  });

  it('asks for missing compatibility information instead of guessing', () => {
    const decision = generateProtocol(
      baseInput({
        rules: [
          hardRule('rule-check', { kind: 'fact_in', fact: 'porosity', values: ['low', 'medium'] }, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('needs_input');
    expect(decision.missingInputs).toContain('porosity');
    expect(decision.confidence).toBe('limited');
  });

  it('reports unsupported when no safe candidate exists', () => {
    const decision = generateProtocol(
      baseInput({
        products: [product('product-owned', ['other-capability'], { owned: true })],
      }),
    );
    expect(decision.status).toBe('unsupported');
    expect(decision.steps).toEqual([]);
  });

  it('reports rule_conflict for contradictory published hard rules', () => {
    const decision = generateProtocol(
      baseInput({
        products: [product('product-owned', ['mild-cleanse', 'contested'])],
        rules: [
          hardRule('rule-keep', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
            { kind: 'require_capability', capability: 'contested' },
          ]),
          hardRule('rule-drop', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
            { kind: 'exclude_capability', capability: 'contested' },
          ]),
        ],
      }),
    );
    expect(decision.status).toBe('rule_conflict');
    expect(decision.audit.conflicts.length).toBeGreaterThan(0);
  });

  it('derives moderate confidence when only an advisory preference is unknown', () => {
    const decision = generateProtocol(
      baseInput({
        rules: [
          hardRule('rule-clean', { kind: 'fact_equals', fact: 'goal', value: 'gentle-wash' }, [
            { kind: 'require_capability', capability: 'mild-cleanse' },
          ]),
          {
            ruleId: 'rule-advice',
            versionId: 'v1',
            status: 'published',
            strength: 'advisory',
            condition: { kind: 'fact_equals', fact: 'porosity', value: 'low' },
            effects: [{ kind: 'prefer_capability', capability: 'mild-cleanse' }],
            reason: 'Advisory reason.',
            evidenceIds: ['evidence-2'],
          },
        ],
      }),
    );
    expect(decision.status).toBe('ready');
    expect(decision.confidence).toBe('moderate');
  });

  it('rejects invalid external input with a validation error, never needs_input', () => {
    for (const input of [null, 'request', { requestId: 'x' }, baseInput({ asOf: 'yesterday' })]) {
      let status: string | null = null;
      try {
        const decision = generateProtocol(input) as ProtocolDecision;
        status = decision.status;
      } catch (error) {
        expect(
          error instanceof RecommendationValidationError || (error as Error).name === 'ZodError',
        ).toBe(true);
      }
      expect(status).toBeNull();
    }
  });

  it('stays deterministic across repeated and reordered calls', () => {
    const first = generateProtocol(baseInput());
    const second = generateProtocol(baseInput());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const reordered = baseInput({
      products: [product('product-spare', ['mild-cleanse']), product('product-owned', ['mild-cleanse'], { owned: true })],
    });
    const reorderedBack = baseInput({
      products: [product('product-owned', ['mild-cleanse'], { owned: true }), product('product-spare', ['mild-cleanse'])],
    });
    expect(JSON.stringify(generateProtocol(reordered))).toBe(JSON.stringify(generateProtocol(reorderedBack)));
  });
});

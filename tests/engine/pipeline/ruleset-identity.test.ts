import { describe, expect, it } from 'vitest';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import { compileRules } from '../../../packages/engine/src/rules/index.js';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import { buildInput } from './fixtures.js';

const authoringBundle = {
  bundleId: 'hash-integrity-bundle',
  version: '1',
  capabilities: [],
  tables: [
    {
      tableId: 'candidate-table',
      hitPolicy: 'first',
      rows: [
        {
          rowId: 'include-candidate',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'include_candidate', candidateId: 'original-candidate' }],
          severity: 'info',
          capabilityIds: [],
          claimIds: ['claim-synthetic'],
          evidenceIds: ['evidence-synthetic'],
        },
      ],
    },
  ],
  constraints: [],
  requiredFixtures: [],
} as const;

const compiled = () => compileRules(authoringBundle);

const evaluateRuleset = (ruleset: ReturnType<typeof compileRules>) =>
  evaluateDecision({ ...buildInput(), ruleset });

const reinsertKeysInReverseOrder = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reinsertKeysInReverseOrder);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, nested]) => [key, reinsertKeysInReverseOrder(nested)]),
  );
};

describe('compiled ruleset content identity', () => {
  it('rejects a changed rule effect under the original hash before it executes', () => {
    const original = compiled();
    const tampered = {
      ...original,
      rules: original.rules.map((rule, index) => index === 0
        ? { ...rule, effects: [{ kind: 'include_candidate' as const, candidateId: 'mutated-candidate' }] }
        : rule),
    };

    const decision = evaluateRuleset(tampered);

    expect(decision.status).toBe('blocked');
    expect(decision.steps).toEqual([]);
    expect(decision.steps.some((step) => step.actionId === 'mutated-candidate')).toBe(false);
  });

  it('rejects changed capability content under the original hash', () => {
    const original = compiled();
    const tampered = {
      ...original,
      capabilities: [{
        capabilityId: 'changed-capability',
        subjectType: 'product' as const,
        subjectId: 'synthetic-product',
        subjectVersion: '1',
        capabilityType: 'compatibility' as const,
        value: 'changed',
        claimId: 'claim-changed',
        evidenceIds: ['evidence-changed'],
        reviewRef: 'synthetic-review',
        reviewedAt: '2026-10-31T12:00:00.000Z',
      }],
    };

    expect(evaluateRuleset(tampered).status).toBe('blocked');
  });

  it('accepts valid compiler output and executes its effect', () => {
    const decision = evaluateRuleset(compiled());

    expect(decision.status).toBe('decided');
    expect(decision.steps.map((step) => step.actionId)).toEqual(['original-candidate']);
  });

  it('canonicalizes object key order while preserving array order', () => {
    const original = compiled();
    const reordered = reinsertKeysInReverseOrder(original) as typeof original;

    expect(canonicalRulesetContentHash(original)).toBe(canonicalRulesetContentHash(reordered));
    expect(evaluateRuleset(reordered).status).toBe('decided');
  });
});

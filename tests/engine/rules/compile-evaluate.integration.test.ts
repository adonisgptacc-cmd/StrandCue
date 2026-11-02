import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import { compileRules } from '../../../packages/engine/src/rules/index.js';
import { buildInput, fact } from '../pipeline/fixtures.js';

const bundle = {
  bundleId: 'compiler-evaluator-integration',
  version: '1',
  capabilities: [],
  tables: [],
  constraints: [
    {
      ruleId: 'include-when-ready',
      version: '1',
      when: { kind: 'fact_equals', factId: 'f-ready', value: true },
      effects: [{ kind: 'include_candidate', candidateId: 'prod-synthetic' }],
      severity: 'hard',
      capabilityIds: [],
      claimIds: ['claim-ready'],
      evidenceIds: ['evidence-ready'],
    },
    {
      ruleId: 'exclude-when-not-ready',
      version: '1',
      when: { kind: 'fact_equals', factId: 'f-ready', value: false },
      effects: [{ kind: 'exclude_candidate', candidateId: 'prod-synthetic', reasonCode: 'not-ready' }],
      severity: 'hard',
      capabilityIds: [],
      claimIds: ['claim-not-ready'],
      evidenceIds: ['evidence-not-ready'],
    },
  ],
  requiredFixtures: [
    { ruleId: 'include-when-ready', positiveFixtureIds: ['ready-positive'], negativeFixtureIds: ['ready-negative'] },
    { ruleId: 'exclude-when-not-ready', positiveFixtureIds: ['not-ready-positive'], negativeFixtureIds: ['not-ready-negative'] },
  ],
} as const;

const evaluateCompiled = (ready: boolean) => {
  const ruleset = compileRules(bundle);
  return evaluateDecision({
    ...buildInput({ facts: [fact('f-ready', ready)] }),
    ruleset,
  });
};

describe('compiled rules evaluate end to end', () => {
  it('compiles disjoint hard rules and executes only the condition-matching rule', () => {
    const ready = evaluateCompiled(true);
    const notReady = evaluateCompiled(false);

    expect(ready.audit.trace.flatMap((entry) => entry.ruleIds)).toContain('include-when-ready');
    expect(ready.audit.trace.flatMap((entry) => entry.ruleIds)).not.toContain('exclude-when-not-ready');
    expect(notReady.audit.trace.flatMap((entry) => entry.ruleIds)).toContain('exclude-when-not-ready');
    expect(notReady.audit.trace.flatMap((entry) => entry.ruleIds)).not.toContain('include-when-ready');
  });

  it('rejects compiled output when a row combines effects owned by different stages', () => {
    expect(() => compileRules({
      ...bundle,
      constraints: [{
        ...bundle.constraints[0],
        effects: [
          { kind: 'include_candidate', candidateId: 'prod-synthetic' },
          { kind: 'require_prerequisite', prerequisiteId: 'synthetic-prerequisite' },
        ],
      }],
      requiredFixtures: [bundle.requiredFixtures[0]],
    })).toThrow(/cross-stage-effects/);
  });
});

import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import type { CompiledRule, EngineDecision, EngineInput } from '../../../packages/engine/src/index.js';
import {
  block,
  buildInput,
  capability,
  exclude,
  fact,
  heat,
  include,
  rule,
  unknownFact,
} from '../fixtures/synthetic.js';

/**
 * Mutation evidence for the hard-rule branches.
 *
 * Every mutant below is explicit and deterministic: it takes a known-good
 * ruleset and omits or negates exactly one hard constraint. A mutant is
 * *killed* when the verification harness detects it, which is asserted here
 * as: the reference decision satisfies an invariant and the mutated decision
 * violates it.
 *
 * No mutation-testing dependency is added. The repo's isolated Stryker runner
 * (`tools/mutation-runner`) is not used here; the cost and the approval
 * status of that runner are recorded in
 * `docs/verification/phase-2-decision-engine-verification.md`.
 */

interface Scenario {
  readonly id: string;
  readonly rules: readonly CompiledRule[];
  readonly input: EngineInput;
}

interface Mutant {
  readonly id: string;
  readonly description: string;
  readonly scenarioId: string;
  /** The hard rule this mutant omits, negates or otherwise breaks. */
  readonly targetRuleId: string;
  readonly mutate: (rules: readonly CompiledRule[]) => CompiledRule[];
  /** True when the decision violates the reference invariant. */
  readonly violated: (decision: EngineDecision) => boolean;
}

const scenarios = (): Scenario[] => [
  {
    id: 'decided',
    rules: [
      rule('r-include-alpha', 'load_verified_facts', [include('cand-alpha')]),
      rule('r-include-bravo', 'load_verified_facts', [include('cand-bravo')]),
      rule('r-exclude-bravo', 'filter_candidates', [exclude('cand-bravo')]),
    ],
    input: buildInput(),
  },
  {
    id: 'blocked',
    rules: [rule('r-block-synthetic', 'apply_safety_restrictions', [block('synthetic_restriction')])],
    input: buildInput(),
  },
  {
    id: 'unknown',
    rules: [
      rule('r-require-unknown', 'load_verified_facts', [include('cand-alpha')], {
        when: { kind: 'fact_equals', factId: 'f-unknown', value: true },
      }),
    ],
    input: buildInput({ facts: [fact('f-ready', true), unknownFact('f-unknown')] }),
  },
  {
    id: 'heat',
    rules: [
      rule('r-heat-restrict', 'evaluate_heat', [heat('restricted')], {
        when: { kind: 'fact_equals', factId: 'f-heat-risk', value: true },
      }),
    ],
    input: buildInput({ facts: [fact('f-ready', true), fact('f-heat-risk', true)] }),
  },
  {
    id: 'capability',
    rules: [
      rule('r-include-bound', 'load_verified_facts', [include('cand-bound')], {
        capabilityIds: ['cap-synthetic'],
        claimIds: ['claim-cap-synthetic', 'claim-r-include-bound'],
        evidenceIds: ['ev-cap-synthetic', 'ev-r-include-bound'],
      }),
    ],
    input: buildInput({
      shelf: ['prod-synthetic'],
      capabilities: [capability('cap-synthetic', { expiresAt: '2026-10-15T00:00:00.000Z' })],
    }),
  },
];

const without = (ruleId: string) => (rules: readonly CompiledRule[]): CompiledRule[] =>
  rules.filter((entry) => entry.ruleId !== ruleId);

const negate = (ruleId: string) => (rules: readonly CompiledRule[]): CompiledRule[] =>
  rules.map((entry) => (entry.ruleId === ruleId
    ? { ...entry, when: { kind: 'fact_equals' as const, factId: 'f-ready', value: false } }
    : entry));

const downgrade = (ruleId: string) => (rules: readonly CompiledRule[]): CompiledRule[] =>
  rules.map((entry) => (entry.ruleId === ruleId ? { ...entry, severity: 'caution' as const } : entry));

const unbind = (ruleId: string) => (rules: readonly CompiledRule[]): CompiledRule[] =>
  rules.map((entry) => (entry.ruleId === ruleId ? { ...entry, capabilityIds: [] } : entry));

const swapEffect = (ruleId: string) => (rules: readonly CompiledRule[]): CompiledRule[] =>
  rules.map((entry) => (entry.ruleId === ruleId ? { ...entry, effects: [include('cand-bravo')] } : entry));

const mutants = (): Mutant[] => [
  {
    id: 'omit-hard-exclusion',
    description: 'omits the hard rule that excludes cand-bravo',
    scenarioId: 'decided',
    targetRuleId: 'r-exclude-bravo',
    mutate: without('r-exclude-bravo'),
    violated: (decision) => decision.steps.some((step) => step.actionId === 'cand-bravo'),
  },
  {
    id: 'negate-hard-exclusion',
    description: 'negates the condition of the hard rule that excludes cand-bravo',
    scenarioId: 'decided',
    targetRuleId: 'r-exclude-bravo',
    mutate: negate('r-exclude-bravo'),
    violated: (decision) => decision.steps.some((step) => step.actionId === 'cand-bravo'),
  },
  {
    id: 'swap-hard-exclusion-effect',
    description: 'replaces the hard exclusion effect with an inclusion effect, which the stage rejects',
    scenarioId: 'decided',
    targetRuleId: 'r-exclude-bravo',
    mutate: swapEffect('r-exclude-bravo'),
    // An inclusion effect is not permitted in the filtering stage, so the
    // engine fails closed instead of quietly allowing the excluded action.
    violated: (decision) => decision.status !== 'decided'
      || decision.omissions.some((omission) => omission.reasonCode === 'invalid_effect_for_stage'),
  },
  {
    id: 'omit-hard-inclusion',
    description: 'omits the hard rule that includes cand-alpha',
    scenarioId: 'decided',
    targetRuleId: 'r-include-alpha',
    mutate: without('r-include-alpha'),
    violated: (decision) => !decision.steps.some((step) => step.actionId === 'cand-alpha'),
  },
  {
    id: 'omit-hard-inclusion-bravo',
    description: 'omits the hard rule that includes cand-bravo',
    scenarioId: 'decided',
    targetRuleId: 'r-include-bravo',
    mutate: without('r-include-bravo'),
    violated: (decision) => !decision.omissions.some((omission) => omission.candidateId === 'cand-bravo'),
  },
  {
    id: 'omit-hard-block',
    description: 'omits the hard rule that blocks the decision',
    scenarioId: 'blocked',
    targetRuleId: 'r-block-synthetic',
    mutate: without('r-block-synthetic'),
    violated: (decision) => decision.status !== 'blocked',
  },
  {
    id: 'negate-hard-block',
    description: 'negates the condition of the hard rule that blocks the decision',
    scenarioId: 'blocked',
    targetRuleId: 'r-block-synthetic',
    mutate: negate('r-block-synthetic'),
    violated: (decision) => decision.status !== 'blocked',
  },
  {
    id: 'downgrade-hard-unknown-to-caution',
    description: 'downgrades the hard rule that depends on an unknown fact to a caution',
    scenarioId: 'unknown',
    targetRuleId: 'r-require-unknown',
    mutate: downgrade('r-require-unknown'),
    violated: (decision) => decision.questions.length === 0,
  },
  {
    id: 'omit-hard-unknown-rule',
    description: 'omits the hard rule that depends on an unknown fact',
    scenarioId: 'unknown',
    targetRuleId: 'r-require-unknown',
    mutate: without('r-require-unknown'),
    violated: (decision) => decision.status !== 'needs_input',
  },
  {
    id: 'negate-hard-heat-condition',
    description: 'negates the condition of the hard rule that restricts heat',
    scenarioId: 'heat',
    targetRuleId: 'r-heat-restrict',
    mutate: negate('r-heat-restrict'),
    violated: (decision) => decision.heatAssessment !== 'restricted',
  },
  {
    id: 'omit-hard-heat-rule',
    description: 'omits the hard rule that restricts heat',
    scenarioId: 'heat',
    targetRuleId: 'r-heat-restrict',
    mutate: without('r-heat-restrict'),
    violated: (decision) => decision.status !== 'blocked',
  },
  {
    id: 'unbind-hard-capability',
    description: 'removes the reviewed capability binding from a hard rule',
    scenarioId: 'capability',
    targetRuleId: 'r-include-bound',
    mutate: unbind('r-include-bound'),
    violated: (decision) => decision.status !== 'blocked',
  },
];

const evaluateWith = (scenario: Scenario, rules: readonly CompiledRule[]): EngineDecision =>
  evaluateDecision({
    ...scenario.input,
    ruleset: {
      ...scenario.input.ruleset,
      rules: [...rules],
      ref: {
        ...scenario.input.ruleset.ref,
        contentHash: canonicalRulesetContentHash({ capabilities: scenario.input.ruleset.capabilities, rules }),
      },
    },
  });

describe('hard-rule mutation evidence', () => {
  it('kills every mutant with an explicit, deterministic mutation', () => {
    const allScenarios = scenarios();
    const allMutants = mutants();
    const survivors: string[] = [];

    for (const mutant of allMutants) {
      const scenario = allScenarios.find((entry) => entry.id === mutant.scenarioId);
      expect(scenario, `unknown scenario for mutant ${mutant.id}`).toBeDefined();
      const resolved = scenario as Scenario;

      const reference = evaluateWith(resolved, resolved.rules);
      const mutatedRules = mutant.mutate(resolved.rules);
      const mutated = evaluateWith(resolved, mutatedRules);

      // The invariant must be meaningful: the reference satisfies it.
      expect(mutant.violated(reference), `${mutant.id}: the reference must satisfy the invariant`).toBe(false);
      // The mutant must be detected: the mutated decision violates it.
      expect(mutant.violated(mutated), `${mutant.id}: the mutant must be detected`).toBe(true);
      // The mutation must be deterministic.
      expect(evaluateWith(resolved, mutant.mutate(resolved.rules))).toEqual(mutated);
      expect(mutatedRules).not.toEqual(resolved.rules);

      if (!mutant.violated(mutated)) survivors.push(mutant.id);
    }

    expect(survivors).toEqual([]);
    expect(allMutants.length).toBeGreaterThan(0);
  });

  it('mutates a hard rule in every mutant', () => {
    const allScenarios = scenarios();

    for (const mutant of mutants()) {
      const scenario = allScenarios.find((entry) => entry.id === mutant.scenarioId) as Scenario;
      const target = scenario.rules.find((entry) => entry.ruleId === mutant.targetRuleId);

      expect(target, `${mutant.id}: the targeted rule must exist`).toBeDefined();
      expect(target?.severity).toBe('hard');
    }
  });

  it('covers every hard rule of every scenario with at least one mutant', () => {
    const allScenarios = scenarios();
    const allMutants = mutants();
    const covered = new Set(allMutants.map((mutant) => mutant.targetRuleId));

    for (const scenario of allScenarios) {
      for (const entry of scenario.rules) {
        if (entry.severity !== 'hard') continue;
        expect(covered.has(entry.ruleId), `${entry.ruleId} has no mutant`).toBe(true);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import type { CompiledRule, EngineDecision, EngineInput, SnapshotFact } from '../../../packages/engine/src/index.js';
import {
  buildInput,
  canonicalJson,
  exclude,
  fact,
  include,
  prerequisite,
  rule,
  seededRandom,
  seededShuffle,
  unknownFact,
  wait,
} from '../fixtures/synthetic.js';

/**
 * Seeded property tests for the deterministic decision engine.
 *
 * Every scenario is generated from a fixed seed, so a failure is always
 * reproducible from the seed printed in the test name.
 *
 * Two terms come from the Heat Coach domain vocabulary rather than the engine
 * contract, so they are mapped explicitly here:
 *
 * - GREEN is the permissive heat state. The engine expresses it as the heat
 *   assessment `appropriate`.
 * - A due status is an actionable plan. The engine expresses it as the
 *   decision status `decided` with executable steps.
 *
 * The engine must never reach either of them while a fact it depends on is
 * unknown.
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Candidates with deliberately varied suitability, including one exact tie. */
const scenarioRules = (): CompiledRule[] => [
  rule('r-include-alpha', 'load_verified_facts', [include('cand-alpha')], { severity: 'hard' }),
  rule('r-include-bravo', 'load_verified_facts', [include('cand-bravo')], { severity: 'hard' }),
  rule('r-include-charlie', 'load_verified_facts', [include('cand-charlie')], { severity: 'caution' }),
  rule('r-include-delta', 'load_verified_facts', [include('cand-delta')], { severity: 'info' }),
  rule('r-include-echo', 'load_verified_facts', [include('cand-echo')], { severity: 'hard' }),
  rule('r-include-echo-extra', 'load_verified_facts', [include('cand-echo')], { severity: 'caution' }),
  rule('r-require-alpha', 'build_dependency_graph', [prerequisite('cand-bravo')], { severity: 'hard' }),
  rule('r-insert-wait', 'build_dependency_graph', [wait('cand-alpha', 7)], { severity: 'hard' }),
];

const scenarioFacts = (): SnapshotFact[] => [
  fact('f-ready', true),
  fact('f-treatment-count', 3),
];

const scenario = (): EngineInput => buildInput({
  facts: scenarioFacts(),
  rules: scenarioRules(),
  shelf: ['prod-synthetic', 'prod-other'],
  tools: ['tool-synthetic'],
  events: [
    { eventId: 'e-wash-1', eventType: 'wash', happenedAt: '2026-10-10T00:00:00.000Z' },
    { eventId: 'e-wash-2', eventType: 'wash', happenedAt: '2026-10-20T00:00:00.000Z' },
  ],
});

/** Reorders every array in the input, without changing its content. */
const permuted = (input: EngineInput, seed: number): EngineInput => {
  const random = seededRandom(seed);
  const snapshot = input.snapshot;
  const capabilities = seededShuffle(input.ruleset.capabilities, random);
  const rules = seededShuffle(input.ruleset.rules, random).map((entry) => ({
    ...entry,
    effects: seededShuffle(entry.effects, random),
  }));
  return {
    ...input,
    snapshot: {
      ...snapshot,
      factRegistry: seededShuffle(snapshot.factRegistry, random),
      shelf: seededShuffle(snapshot.shelf, random),
      tools: seededShuffle(snapshot.tools, random),
      eventHistory: seededShuffle(snapshot.eventHistory, random),
    },
    ruleset: {
      ...input.ruleset,
      capabilities,
      rules,
      ref: {
        ...input.ruleset.ref,
        contentHash: canonicalRulesetContentHash({ capabilities, rules }),
      },
    },
  };
};

/** True when the prerequisite relation between steps contains no cycle. */
const isAcyclic = (decision: EngineDecision): boolean => {
  const steps = decision.steps;
  const ids = new Set(steps.map((step) => step.actionId));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (actionId: string): boolean => {
    if (visiting.has(actionId)) return false;
    if (visited.has(actionId)) return true;
    visiting.add(actionId);
    const step = steps.find((entry) => entry.actionId === actionId);
    for (const prerequisite of step?.prerequisiteIds ?? []) {
      if (ids.has(prerequisite) && !visit(prerequisite)) return false;
    }
    visiting.delete(actionId);
    visited.add(actionId);
    return true;
  };
  return steps.every((step) => visit(step.actionId));
};

describe('determinism properties', () => {
  it.each(SEEDS)('returns an identical decision for the same input (seed %i)', (seed) => {
    const input = permuted(scenario(), seed);
    expect(canonicalJson(evaluateDecision(input))).toBe(canonicalJson(evaluateDecision(input)));
  });

  it.each(SEEDS)('does not change when input arrays are reordered (seed %i)', (seed) => {
    const canonical = evaluateDecision(scenario());
    const reordered = evaluateDecision(permuted(scenario(), seed));
    expect(reordered.audit.ruleset.contentHash).not.toBe(canonical.audit.ruleset.contentHash);
    expect(canonicalJson({ ...reordered, audit: { ...reordered.audit, ruleset: { ...reordered.audit.ruleset, contentHash: canonical.audit.ruleset.contentHash } } }))
      .toBe(canonicalJson(canonical));
  });

  it.each(SEEDS)('is unaffected by records outside the eligible candidate set (seed %i)', (seed) => {
    const canonical = evaluateDecision(scenario());
    const base = scenario();
    const noisy: EngineInput = {
      ...base,
      snapshot: {
        ...base.snapshot,
        factRegistry: [...base.snapshot.factRegistry, fact('f-irrelevant', 'noise')],
        shelf: [...base.snapshot.shelf, { entryId: 'prod-irrelevant', revision: 1, factIds: [] }],
        tools: [...base.snapshot.tools, { entryId: 'tool-irrelevant', revision: 1, factIds: [] }],
        eventHistory: [
          ...base.snapshot.eventHistory,
          { eventId: 'e-irrelevant', revision: 1, eventType: 'unrelated', happenedAt: '2026-10-25T00:00:00.000Z', factIds: [] },
        ],
      },
    };

    const noisyDecision = evaluateDecision(permuted(noisy, seed));
    expect(canonicalJson({
      ...noisyDecision,
      audit: { ...noisyDecision.audit, ruleset: { ...noisyDecision.audit.ruleset, contentHash: canonical.audit.ruleset.contentHash } },
    })).toBe(canonicalJson(canonical));
  });

  it('breaks ties on candidate identity and keeps that order stable', () => {
    const decision = evaluateDecision(scenario());
    const order = decision.steps.map((step) => step.actionId);

    // Missing goal weights preserve candidate-id order; prerequisite edges
    // still move cand-bravo before cand-alpha, and the remaining tie stays stable.
    expect(order).toEqual(['cand-bravo', 'cand-alpha', 'cand-charlie', 'cand-delta', 'cand-echo']);
    expect(order.indexOf('cand-bravo')).toBeLessThan(order.indexOf('cand-alpha'));

    for (const seed of SEEDS) {
      expect(evaluateDecision(permuted(scenario(), seed)).steps.map((step) => step.actionId)).toEqual(order);
    }
  });

  it('produces an acyclic result', () => {
    const decision = evaluateDecision(scenario());

    expect(decision.status).toBe('decided');
    expect(isAcyclic(decision)).toBe(true);
  });

  it('returns a non-actionable result for a cyclic dependency instead of a partial plan', () => {
    const cyclic = buildInput({
      facts: scenarioFacts(),
      rules: [
        rule('r-include-alpha', 'load_verified_facts', [include('cand-alpha')]),
        rule('r-include-bravo', 'load_verified_facts', [include('cand-bravo')]),
        rule('r-require-alpha', 'build_dependency_graph', [prerequisite('cand-bravo')]),
        rule('r-require-bravo', 'build_dependency_graph', [prerequisite('cand-alpha')]),
      ],
    });

    const decision = evaluateDecision(cyclic);

    expect(decision.status).toBe('no_protocol');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions.map((omission) => omission.reasonCode)).toContain('dependency_cycle');
  });

  it.each(SEEDS)('never produces an actionable decision while a required fact is unknown (seed %i)', (seed) => {
    const input = buildInput({
      facts: [fact('f-ready', true), unknownFact('f-required')],
      rules: [rule('r-requires-unknown', 'load_verified_facts', [include('cand-alpha')], { when: { kind: 'fact_equals', factId: 'f-required', value: true } })],
    });

    const decision = evaluateDecision(permuted(input, seed));

    expect(decision.status).not.toBe('decided');
    expect(decision.steps).toEqual([]);
    expect(decision.heatAssessment).not.toBe('appropriate');
    expect(decision.questions.map((question) => question.neededFactIds)).toContainEqual(['f-required']);
  });

  it('never produces the permissive heat state while a required heat fact is unknown', () => {
    const input = buildInput({
      facts: [fact('f-ready', true), unknownFact('f-heat-risk')],
      rules: [
        rule('r-heat-unknown', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'appropriate' }], {
          when: { kind: 'fact_equals', factId: 'f-heat-risk', value: true },
        }),
      ],
    });

    const decision = evaluateDecision(input);

    expect(decision.heatAssessment).not.toBe('appropriate');
    expect(decision.status).not.toBe('decided');
    expect(decision.steps).toEqual([]);
  });

  it('does not treat a missing fact as a satisfied restriction', () => {
    const input = buildInput({
      facts: [fact('f-ready', true)],
      rules: [
        rule('r-exclude-on-missing', 'filter_candidates', [exclude('cand-alpha')], {
          when: { kind: 'fact_equals', factId: 'f-absent', value: true },
        }),
        rule('r-include-alpha', 'load_verified_facts', [include('cand-alpha')]),
      ],
    });

    const decision = evaluateDecision(input);

    // The exclusion cannot be evaluated, so the hard rule asks for the fact
    // instead of silently allowing the action.
    expect(decision.status).toBe('needs_input');
    expect(decision.steps).toEqual([]);
    expect(decision.questions.map((question) => question.questionId)).toContain('fact:f-absent');
  });
});

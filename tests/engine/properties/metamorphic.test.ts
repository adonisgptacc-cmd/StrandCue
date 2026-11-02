import { describe, expect, it } from 'vitest';
import { ENGINE_EVALUATOR_VERSION } from '../../../packages/engine/src/index.js';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import type { CompiledRule, EngineDecision, EngineInput } from '../../../packages/engine/src/index.js';
import { ReplayCaseSchema, replayDecisions } from '../../../packages/engine/src/replay/index.js';
import {
  buildInput,
  capability,
  exclude,
  fact,
  include,
  rule,
  seededRandom,
  seededShuffle,
} from '../fixtures/synthetic.js';

/**
 * Metamorphic and withdrawal properties.
 *
 * These tests state relations between two runs rather than one expected
 * result, so they keep holding when the reviewed content of a ruleset
 * changes.
 */

/**
 * How permissive an outcome is. Tightening a restriction may move an outcome
 * down this order, never up it.
 */
const PERMISSIVENESS = { decided: 3, needs_input: 2, no_protocol: 1, blocked: 0 } as const;

const permissivenessOf = (decision: EngineDecision): number => PERMISSIVENESS[decision.status];

const actionIds = (decision: EngineDecision): readonly string[] =>
  decision.steps.map((step) => step.actionId);

const ruleset = (rules: CompiledRule[], contentHash = 'sha256:synthetic-metamorphic'): EngineInput['ruleset'] => ({
  ref: {
    rulesetId: 'synthetic-ruleset-metamorphic',
    contentHash,
    schemaVersion: '1.0.0',
    evaluatorVersion: ENGINE_EVALUATOR_VERSION,
  },
  capabilities: [],
  rules,
});

const baseRules = (): CompiledRule[] => [
  rule('r-include-base', 'load_verified_facts', [include('cand-base')]),
  rule('r-include-heat', 'load_verified_facts', [include('cand-heat')]),
];

describe('metamorphic properties', () => {
  it('cannot loosen a decision when a restriction is tightened', () => {
    const base = buildInput({ rules: baseRules() });
    const before = evaluateDecision(base);

    const tightened = buildInput({
      rules: [...baseRules(), rule('r-exclude-base', 'filter_candidates', [exclude('cand-base')])],
    });
    const after = evaluateDecision(tightened);

    expect(before.status).toBe('decided');
    expect(actionIds(after).every((actionId) => actionIds(before).includes(actionId))).toBe(true);
    expect(actionIds(after)).not.toContain('cand-base');
    expect(permissivenessOf(after)).toBeLessThanOrEqual(permissivenessOf(before));
    expect(after.omissions.map((omission) => omission.candidateId)).toContain('cand-base');
  });

  it('cannot loosen a decision when a hard block is added', () => {
    const base = buildInput({ rules: baseRules() });
    const before = evaluateDecision(base);

    const blocked = buildInput({
      rules: [...baseRules(), rule('r-block', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'synthetic_blocked' }])],
    });
    const after = evaluateDecision(blocked);

    expect(before.status).toBe('decided');
    expect(after.status).toBe('blocked');
    expect(after.steps).toEqual([]);
    expect(permissivenessOf(after)).toBeLessThan(permissivenessOf(before));
  });

  it('keeps the same outcome when a rule is reordered', () => {
    const base = buildInput({ rules: baseRules() });
    const before = evaluateDecision(base);

    const random = seededRandom(99);
    const reordered = buildInput({
      rules: seededShuffle(baseRules(), random),
    });

    expect(evaluateDecision(reordered)).toEqual(before);
  });
});

describe('withdrawal properties', () => {
  it('does not run a hard rule whose reviewed capability has expired', () => {
    const expiringCapability = capability('cap-synthetic', { expiresAt: '2026-10-15T00:00:00.000Z' });
    const input = buildInput({
      shelf: ['prod-synthetic'],
      capabilities: [expiringCapability],
      rules: [
        rule('r-include-base', 'load_verified_facts', [include('cand-base')]),
        rule('r-include-bound', 'load_verified_facts', [include('cand-bound')], {
          capabilityIds: ['cap-synthetic'],
          claimIds: ['claim-cap-synthetic', 'claim-r-include-bound'],
          evidenceIds: ['ev-cap-synthetic', 'ev-r-include-bound'],
        }),
      ],
    });

    const decision = evaluateDecision(input);

    expect(decision.status).toBe('blocked');
    expect(decision.omissions.map((omission) => omission.reasonCode)).toContain('capability_unavailable');
    expect(decision.steps).toEqual([]);
  });

  it('does not run a rule whose reviewed capability has expired', () => {
    const boundRules = (): CompiledRule[] => [
      rule('r-include-base', 'load_verified_facts', [include('cand-base')]),
      rule('r-include-bound', 'load_verified_facts', [include('cand-bound')]),
      rule('r-exclude-bound', 'filter_candidates', [exclude('cand-bound')], {
        severity: 'caution',
        capabilityIds: ['cap-synthetic'],
        claimIds: ['claim-cap-synthetic', 'claim-r-exclude-bound'],
        evidenceIds: ['ev-cap-synthetic', 'ev-r-exclude-bound'],
      }),
    ];

    // While the reviewed capability is current the bound rule runs.
    const withCurrentReview = evaluateDecision(buildInput({
      shelf: ['prod-synthetic'],
      capabilities: [capability('cap-synthetic')],
      rules: boundRules(),
    }));

    expect(withCurrentReview.status).toBe('decided');
    expect(withCurrentReview.omissions.map((omission) => omission.candidateId)).toContain('cand-bound');
    expect(actionIds(withCurrentReview)).not.toContain('cand-bound');

    // Once the review has expired the bound rule is inert and never runs.
    const withExpiredReview = evaluateDecision(buildInput({
      shelf: ['prod-synthetic'],
      capabilities: [capability('cap-synthetic', { expiresAt: '2026-10-15T00:00:00.000Z' })],
      rules: boundRules(),
    }));

    expect(withExpiredReview.status).toBe('decided');
    expect(withExpiredReview.omissions.map((omission) => omission.candidateId)).not.toContain('cand-bound');
    expect(actionIds(withExpiredReview)).toContain('cand-bound');
  });

  it('keeps a withdrawn rule out of new decisions while the old decision stays replayable', () => {
    const published = buildInput({
      rules: [
        ...baseRules(),
        rule('r-exclude-heat', 'filter_candidates', [exclude('cand-heat')]),
      ],
    });
    const historicalDecision = evaluateDecision(published);
    expect(actionIds(historicalDecision)).not.toContain('cand-heat');

    const replayCase = ReplayCaseSchema.parse({
      caseId: 'case-withdrawn',
      input: published,
      decision: historicalDecision,
    });

    // The restrictive rule is withdrawn: the published ruleset no longer
    // carries it, so it no longer runs for new decisions.
    const withdrawn = ruleset(baseRules(), 'sha256:synthetic-withdrawn');
    const newDecision = evaluateDecision({ ...published, ruleset: withdrawn });

    expect(newDecision.status).toBe('decided');
    expect(actionIds(newDecision)).toContain('cand-heat');
    expect(newDecision.omissions.map((omission) => omission.candidateId)).not.toContain('cand-heat');

    // The historical decision is still exactly reproducible from its own
    // pinned ruleset.
    const report = replayDecisions([replayCase], withdrawn);
    expect(report.cases[0].pinnedReplayReproduced).toBe(true);
    expect(report.cases[0].pinnedRulesetHash).toBe(published.ruleset.ref.contentHash);
    expect(report.cases[0].candidateRulesetHash).toBe('sha256:synthetic-withdrawn');
  });

  it('allows a newly permitted action only when an explicit reviewed successor rule permits it', () => {
    const restricted = [
      rule('r-include-base', 'load_verified_facts', [include('cand-base')]),
      rule('r-include-heat', 'load_verified_facts', [include('cand-heat')]),
      rule('r-exclude-heat', 'filter_candidates', [exclude('cand-heat')]),
    ];
    const before = evaluateDecision(buildInput({ rules: restricted }));

    expect(before.status).toBe('decided');
    expect(actionIds(before)).not.toContain('cand-heat');
    expect(before.omissions.map((omission) => omission.candidateId)).toContain('cand-heat');

    // The exclusion is withdrawn, but the successor rule still permits the
    // action and attributes it to its own reviewed claim and evidence.
    const withSuccessor = [
      rule('r-include-base', 'load_verified_facts', [include('cand-base')]),
      rule('r-include-heat', 'load_verified_facts', [include('cand-heat')]),
    ];
    const after = evaluateDecision(buildInput({ rules: withSuccessor }));

    expect(after.status).toBe('decided');
    expect(actionIds(after)).toContain('cand-heat');
    const permittedStep = after.steps.find((step) => step.actionId === 'cand-heat');
    expect(permittedStep?.ruleIds).toContain('r-include-heat');
    expect(permittedStep?.claimIds.length).toBeGreaterThan(0);
    expect(permittedStep?.evidenceIds.length).toBeGreaterThan(0);

    // Without the successor rule the action is not permitted at all: it is
    // neither executed nor silently reported as omitted.
    const withoutSuccessor = [rule('r-include-base', 'load_verified_facts', [include('cand-base')])];
    const withheld = evaluateDecision(buildInput({ rules: withoutSuccessor }));

    expect(withheld.status).toBe('decided');
    expect(actionIds(withheld)).not.toContain('cand-heat');
    expect(withheld.omissions.map((omission) => omission.candidateId)).not.toContain('cand-heat');
    expect(withheld.alternatives.map((alternative) => alternative.alternativeId)).not.toContain('cand-heat');
  });

  it('does not let a later revision rewrite a stored decision', () => {
    const published = buildInput({ rules: baseRules() });
    const stored = evaluateDecision(published);

    const later = buildInput({
      facts: [fact('f-ready', true), fact('f-new', 'later')],
      rules: baseRules(),
    });
    evaluateDecision(later);

    expect(evaluateDecision(published)).toEqual(stored);
  });
});

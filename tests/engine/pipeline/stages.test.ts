import { describe, expect, it } from 'vitest';
import {
  EngineInputError,
  PIPELINE_STAGES,
  evaluateDecision,
  rankQuestions,
  topologicalOrder,
} from '../../../packages/engine/src/pipeline/index.js';
import { createPipelineState, resolveFact } from '../../../packages/engine/src/pipeline/stages/validate-snapshot.js';
import { loadVerifiedFacts } from '../../../packages/engine/src/pipeline/stages/load-verified-facts.js';
import { compareCandidates } from '../../../packages/engine/src/pipeline/stages/select-and-rank.js';
import { ENGINE_STAGE_IDS } from '../../../packages/engine/src/index.js';
import { FUTURE, NOW, PAST, buildInput, capability, fact, include, rule, when } from './fixtures.js';

const traceOf = (decision: ReturnType<typeof evaluateDecision>, stage: (typeof ENGINE_STAGE_IDS)[number]) =>
  decision.audit.trace.find((entry) => entry.stageId === stage);

describe('candidate ranking measure accumulation', () => {
  it('binds measures to their ruleset version and refuses cross-ruleset comparisons', () => {
    const firstInput = buildInput({ rules: [rule('candidate::include', 'load_verified_facts', [{
      kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 70,
      heatExposureOrdinal: 2, distinctRequiredProductCount: 3,
    }])] });
    const secondInput = buildInput({ rules: [rule('candidate::include', 'load_verified_facts', [{
      kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 70,
      heatExposureOrdinal: 1, distinctRequiredProductCount: 3,
    }])] });

    const loadCandidate = (input: typeof firstInput) => {
      const initial = createPipelineState(input);
      return loadVerifiedFacts({
        ...initial,
        facts: new Map([['f-ready', resolveFact(input.snapshot.factRegistry[0], Date.parse(input.evaluatedAt))]]),
      }).candidates.get('candidate.synthetic')!;
    };
    const first = loadCandidate(firstInput);
    const second = loadCandidate(secondInput);

    expect(firstInput.ruleset.ref.contentHash).not.toBe(secondInput.ruleset.ref.contentHash);
    expect(first.rulesetRef).toEqual(firstInput.ruleset.ref);
    expect(second.rulesetRef).toEqual(secondInput.ruleset.ref);
    expect(() => compareCandidates(first, second)).toThrow('Cannot compare candidates from different rulesets.');
    expect(() => compareCandidates(first, {
      ...first,
      rulesetRef: { ...first.rulesetRef, schemaVersion: `${first.rulesetRef.schemaVersion}.next` },
    })).toThrow('Cannot compare candidates from different rulesets.');
    expect(() => compareCandidates(first, {
      ...first,
      rulesetRef: { ...first.rulesetRef, evaluatorVersion: `${first.rulesetRef.evaluatorVersion}.next` },
    })).toThrow('Cannot compare candidates from different rulesets.');
  });

  it('retains matching reviewed measures from include effects', () => {
    const measures = { heatExposureOrdinal: 2, distinctRequiredProductCount: 3 };
    const input = buildInput({ rules: [
      rule('candidate::include-a', 'load_verified_facts', [{
        kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 60, ...measures,
      }]),
      rule('candidate::include-b', 'load_verified_facts', [{
        kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 70, ...measures,
      }]),
    ] });

    const initial = createPipelineState(input);
    const state = loadVerifiedFacts({
      ...initial,
      facts: new Map([['f-ready', resolveFact(input.snapshot.factRegistry[0], Date.parse(input.evaluatedAt))]]),
    });

    expect(state.candidates.get('candidate.synthetic')).toMatchObject({
      goalSuitability: 70,
      heatExposureOrdinal: 2,
      distinctRequiredProductCount: 3,
    });
  });

  it('keeps conflicting or missing measure values explicitly unknown', () => {
    const input = buildInput({ rules: [
      rule('candidate::include-a', 'load_verified_facts', [{
        kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 60,
        heatExposureOrdinal: 2, distinctRequiredProductCount: 3,
      }]),
      rule('candidate::include-b', 'load_verified_facts', [{
        kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 70,
        heatExposureOrdinal: 1, distinctRequiredProductCount: 3,
      }]),
      rule('candidate::include-c', 'load_verified_facts', [{
        kind: 'include_candidate', candidateId: 'candidate.synthetic', goalSuitability: 70,
        heatExposureOrdinal: 1,
      }]),
    ] });

    const initial = createPipelineState(input);
    const state = loadVerifiedFacts({
      ...initial,
      facts: new Map([['f-ready', resolveFact(input.snapshot.factRegistry[0], Date.parse(input.evaluatedAt))]]),
    });

    expect(state.candidates.get('candidate.synthetic')).toMatchObject({
      goalSuitability: 70,
      heatExposureOrdinal: null,
      distinctRequiredProductCount: null,
    });
  });
});

describe('pipeline structure', () => {
  it('exposes one pure function per public stage id', () => {
    expect(Object.keys(PIPELINE_STAGES)).toEqual([...ENGINE_STAGE_IDS]);
  });

  it('always records all ten stages in order, even when an early stage blocks', () => {
    const decision = evaluateDecision(buildInput({ events: [{ eventId: 'e1', eventType: 'wash', happenedAt: FUTURE }] }));
    expect(decision.audit.trace.map((entry) => entry.stageId)).toEqual([...ENGINE_STAGE_IDS]);
    expect(traceOf(decision, 'validate_snapshot')?.outcome).toBe('blocked');
    expect(traceOf(decision, 'filter_candidates')?.outcome).toBe('not_applicable');
    expect(traceOf(decision, 'assemble_decision')?.outcome).toBe('completed');
  });
});

describe('decision table hit policies', () => {
  it('executes only the first matching row and preserves its trace identity', () => {
    const decision = evaluateDecision(buildInput({ rules: [
      rule('table::first', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'lower_heat' }], {
        when: { kind: 'fact_exists', factId: 'f-ready' },
        severity: 'caution',
        table: { tableId: 'table', hitPolicy: 'first', rowOrder: 0 },
      }),
      rule('table::second', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'restricted' }], {
        when: { kind: 'fact_equals', factId: 'f-ready', value: true },
        severity: 'caution',
        table: { tableId: 'table', hitPolicy: 'first', rowOrder: 1 },
      }),
    ] }));

    expect(traceOf(decision, 'evaluate_heat')?.ruleIds).toEqual(['table::first']);
  });

  it('does not let an unresolved advisory row mask a known hard restriction', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-one', 'a'), fact('f-two', null, { status: 'unknown' })],
      rules: [
        rule('table::advisory', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'advisory' }], {
          when: { kind: 'all', expressions: [
            { kind: 'fact_equals', factId: 'f-one', value: 'a' },
            { kind: 'fact_equals', factId: 'f-two', value: 'b' },
          ] },
          severity: 'caution',
          table: { tableId: 'safety', hitPolicy: 'first', rowOrder: 0 },
        }),
        rule('table::hard', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'known_hard_restriction' }], {
          when: { kind: 'fact_equals', factId: 'f-one', value: 'a' },
          severity: 'hard',
          table: { tableId: 'safety', hitPolicy: 'first', rowOrder: 1 },
        }),
      ],
    }));

    expect(decision.status).toBe('blocked');
    expect(decision.omissions.some((omission) => omission.reasonCode === 'known_hard_restriction')).toBe(true);
  });

  it('asks for an unresolved first row instead of applying a later permissive hard row', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-one', 'a'), fact('f-two', null, { status: 'unknown' })],
      rules: [
        rule('table::lower-heat', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'lower_heat' }], {
          when: { kind: 'all', expressions: [
            { kind: 'fact_equals', factId: 'f-one', value: 'a' },
            { kind: 'fact_equals', factId: 'f-two', value: 'b' },
          ] },
          severity: 'caution',
          table: { tableId: 'heat', hitPolicy: 'first', rowOrder: 0 },
        }),
        rule('table::appropriate', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'appropriate' }], {
          when: { kind: 'fact_equals', factId: 'f-one', value: 'a' },
          severity: 'hard',
          table: { tableId: 'heat', hitPolicy: 'first', rowOrder: 1 },
        }),
      ],
    }));

    expect(decision.status).toBe('needs_input');
    expect(decision.heatAssessment).toBe('needs_input');
    expect(decision.status).not.toBe('decided');
  });

  it('blocks instead of executing multiple matching rows under a unique policy', () => {
    const decision = evaluateDecision(buildInput({ rules: [
      rule('table::one', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'lower_heat' }], {
        when: { kind: 'fact_exists', factId: 'f-ready' },
        severity: 'caution',
        table: { tableId: 'table', hitPolicy: 'unique', rowOrder: 0 },
      }),
      rule('table::two', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'restricted' }], {
        when: { kind: 'fact_equals', factId: 'f-ready', value: true },
        severity: 'caution',
        table: { tableId: 'table', hitPolicy: 'unique', rowOrder: 1 },
      }),
    ] }));

    expect(decision.status).toBe('blocked');
    expect(decision.omissions.some((omission) => omission.reasonCode === 'decision_table_unique_violation')).toBe(true);
  });
});

describe('stage 1 validate_snapshot', () => {
  it('rejects input that fails the public schema instead of guessing', () => {
    expect(() => evaluateDecision({ ...buildInput(), evaluatedAt: 'not-a-date' })).toThrow(EngineInputError);
  });

  it.each([
    ['a future-dated event', buildInput({ events: [{ eventId: 'e1', eventType: 'wash', happenedAt: FUTURE }] }), 'future_event_recorded'],
    ['a revision beyond the revision set', buildInput({ revisions: { shelf: 0 } }), 'revision_inconsistent'],
    ['duplicate shelf identities', buildInput({ shelf: ['dup', 'dup'] }), 'duplicate_identity'],
    ['an unsupported evaluator version', buildInput({ evaluatorVersion: '9.9.9' }), 'ruleset_version_unsupported'],
    ['a fact recorded after the evaluation time', buildInput({ facts: [fact('f-ready', true, { recordedAt: FUTURE })] }), 'fact_recorded_in_future'],
  ])('blocks on %s', (_label, input, reasonCode) => {
    const decision = evaluateDecision(input);
    expect(decision.status).toBe('blocked');
    expect(decision.omissions[0]).toMatchObject({ candidateId: 'decision', reasonCode });
  });

  it('resolves unknown, expired, not-yet-effective and valueless facts explicitly', () => {
    const now = Date.parse(NOW);
    expect(resolveFact(fact('a', true), now).resolution).toBe('verified');
    expect(resolveFact(fact('a', true, { status: 'unknown' }), now).resolution).toBe('unknown');
    expect(resolveFact(fact('a', true, { expiresAt: NOW }), now).resolution).toBe('expired');
    expect(resolveFact(fact('a', true, { effectiveAt: FUTURE }), now).resolution).toBe('unknown');
    expect(resolveFact(fact('a', true, { value: undefined }), now).resolution).toBe('unknown');
    expect(resolveFact(fact('a', true, { status: 'withdrawn' }), now).resolution).toBe('withdrawn');
  });
});

describe('catalogue-version capability applicability', () => {
  it('requires exact catalogue identity, version and market on the owned row', () => {
    const reviewedSubject = { catalogueId: 'catalogue-product-1', versionId: 'version-2', market: 'ZA' };
    const binding = {
      ...capability('cap-bound', { subjectId: 'prod-synthetic' }),
      catalogueSubject: reviewedSubject,
      reviewedUseScope: 'rinse-off-conditioner-use',
    } as never;
    const base = buildInput({
      capabilities: [binding],
      rules: [rule('r-bound', 'load_verified_facts', [include('cand-bound')], {
        capabilityIds: ['cap-bound'],
        useScope: 'rinse-off-conditioner-use',
        claimIds: ['claim-cap-bound'],
        evidenceIds: ['ev-cap-bound'],
      })],
    });
    const decisionFor = (catalogueSubject: typeof reviewedSubject) => evaluateDecision({
      ...base,
      snapshot: {
        ...base.snapshot,
        shelf: [{ ...base.snapshot.shelf[0]!, catalogueSubject }],
      },
    });

    expect(decisionFor({ ...reviewedSubject, versionId: 'version-1' }).steps.map((step) => step.actionId)).not.toContain('cand-bound');
    expect(decisionFor({ ...reviewedSubject, market: 'US' }).steps.map((step) => step.actionId)).not.toContain('cand-bound');
    expect(decisionFor(reviewedSubject).steps.map((step) => step.actionId)).toContain('cand-bound');
    const withoutIdentity = evaluateDecision({
      ...base,
      snapshot: { ...base.snapshot, shelf: [{ entryId: 'prod-synthetic', revision: 1, factIds: [] }] },
    });
    expect(withoutIdentity.steps.map((step) => step.actionId)).not.toContain('cand-bound');
    const wrongUseScope = buildInput({
      capabilities: [binding],
      rules: [rule('r-bound', 'load_verified_facts', [include('cand-bound')], {
        capabilityIds: ['cap-bound'],
        useScope: 'leave-in-treatment-use',
        claimIds: ['claim-cap-bound'],
        evidenceIds: ['ev-cap-bound'],
      })],
    });
    expect(evaluateDecision(wrongUseScope).steps.map((step) => step.actionId)).not.toContain('cand-bound');
  });
});

describe('stage 2 apply_safety_restrictions', () => {
  const blockRule = rule('r-block', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'active_reaction' }]);

  it('blocks when a restriction fires and cites its rule, claim and evidence', () => {
    const decision = evaluateDecision(buildInput({ rules: [blockRule, rule('r-in', 'load_verified_facts', [include('cand-a')])] }));
    expect(decision.status).toBe('blocked');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions[0]).toMatchObject({
      reasonCode: 'active_reaction',
      ruleIds: ['r-block'],
      ruleRefs: [{ ruleId: 'r-block', version: '1' }],
      claimIds: ['claim-r-block'],
      evidenceIds: ['ev-r-block'],
    });
    expect(traceOf(decision, 'apply_safety_restrictions')).toMatchObject({
      outcome: 'blocked',
      ruleIds: ['r-block'],
      ruleRefs: [{ ruleId: 'r-block', version: '1' }],
    });
  });

  it('asks for input instead of assuming "no" when a hard rule depends on an unknown fact', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-reaction', null, { status: 'unknown' }), fact('f-ready', true)],
      rules: [rule('r-reaction', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'active_reaction' }], { when: when('f-reaction', true) }),
        rule('r-in', 'load_verified_facts', [include('cand-a')])],
    }));
    expect(decision.status).toBe('needs_input');
    expect(decision.steps).toEqual([]);
    expect(decision.questions).toEqual([{ questionId: 'fact:f-reaction', rank: 1, reasonCode: 'fact_unknown', reasonSeverity: 'caution', ruleRefs: [{ ruleId: 'r-reaction', version: '1' }], neededFactIds: ['f-reaction'] }]);
  });

  it('treats a missing fact like an unknown fact', () => {
    const decision = evaluateDecision(buildInput({
      rules: [rule('r-missing', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'x' }], { when: when('f-absent', true) })],
    }));
    expect(decision.questions[0]?.questionId).toBe('fact:f-absent');
  });

  it('blocks, rather than asking, when the governing fact is contradictory or withdrawn', () => {
    for (const status of ['contradictory', 'withdrawn'] as const) {
      const decision = evaluateDecision(buildInput({
        facts: [fact('f-reaction', true, { status })],
        rules: [rule('r-reaction', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'x' }], { when: when('f-reaction', true) })],
      }));
      expect(decision.status).toBe('blocked');
      expect(decision.omissions[0]?.reasonCode).toBe(`fact_${status}`);
    }
  });

  it('does not let an unresolved advisory rule gate the decision', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-ready', true)],
      rules: [
        rule('r-advice', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'x' }], { severity: 'caution', when: when('f-absent', true) }),
        rule('r-in', 'load_verified_facts', [include('cand-a')]),
      ],
    }));
    expect(decision.status).toBe('decided');
  });

  it('fails closed on an effect the stage is not allowed to produce', () => {
    const decision = evaluateDecision(buildInput({ rules: [rule('r-bad', 'apply_safety_restrictions', [include('cand-a')])] }));
    expect(decision.status).toBe('blocked');
    expect(decision.omissions[0]?.reasonCode).toBe('invalid_effect_for_stage');
  });
});

describe('stage 3 load_verified_facts', () => {
  it('only applies capability-backed rules to products or tools the person owns', () => {
    const rules = [rule('r-owned', 'load_verified_facts', [include('cand-a')], { capabilityIds: ['cap-1'], claimIds: ['claim-cap-1', 'claim-r-owned'], evidenceIds: ['ev-cap-1', 'ev-r-owned'] })];
    const ruleset = { rules, capabilities: [capability('cap-1', { subjectId: 'prod-other' })] };
    const unowned = evaluateDecision(buildInput({ ...ruleset, shelf: ['prod-synthetic'] }));
    expect(unowned.status).toBe('no_protocol');
    const ownedInput = buildInput({ ...ruleset, shelf: ['prod-other'] });
    const owned = evaluateDecision({
      ...ownedInput,
      snapshot: {
        ...ownedInput.snapshot,
        shelf: [{ ...ownedInput.snapshot.shelf[0]!, catalogueSubject: ruleset.capabilities[0]!.catalogueSubject }],
      },
    });
    expect(owned.status).toBe('decided');
    expect(owned.steps[0]?.claimIds).toEqual(['claim-cap-1', 'claim-r-owned']);
  });

  it('blocks when a hard rule depends on an expired capability review', () => {
    const decision = evaluateDecision(buildInput({
      rules: [rule('r-exp', 'load_verified_facts', [include('cand-a')], { capabilityIds: ['cap-1'], claimIds: ['claim-cap-1'], evidenceIds: ['ev-cap-1'] })],
      capabilities: [capability('cap-1', { expiresAt: PAST })],
    }));
    expect(decision.status).toBe('blocked');
    expect(decision.omissions[0]).toMatchObject({ reasonCode: 'capability_unavailable', ruleIds: ['r-exp'] });
  });

  it('does not rely on a capability whose review is dated after the evaluation time', () => {
    const decision = evaluateDecision(buildInput({
      rules: [rule('r-fut', 'load_verified_facts', [include('cand-a')], { capabilityIds: ['cap-1'], claimIds: ['claim-cap-1'], evidenceIds: ['ev-cap-1'] })],
      capabilities: [capability('cap-1', { reviewedAt: FUTURE })],
    }));
    expect(decision.status).toBe('blocked');
  });
});

describe('stage 4 derive_treatment_state', () => {
  const programme = (dueStatus: 'due' | 'not_due' | 'unknown', prospective = false) => ({
    programmeId: 'programme-1',
    state: 'initial',
    dueStatus,
    ruleId: 'treatment-rule',
    ruleVersion: '3',
    evaluatedAt: NOW,
    sourceEventIds: ['application-1', 'wash-1'],
    prospective,
  });

  const decisionFor = (projection: ReturnType<typeof programme>) => {
    const base = buildInput({
      events: [
        { eventId: 'wash-1', eventType: 'wash', happenedAt: PAST },
        { eventId: 'application-1', eventType: 'treatment_application', happenedAt: PAST },
      ],
      rules: [
        rule('r-include', 'load_verified_facts', [include('cand-a')]),
        rule('r-due', 'filter_candidates', [{ kind: 'exclude_candidate', candidateId: 'cand-a', reasonCode: 'treatment_due' }], {
          when: { kind: 'fact_equals', factId: 'treatment:programme-1:due_status', value: 'due' },
        }),
      ],
    });
    return evaluateDecision({
      ...base,
      snapshot: { ...base.snapshot, treatmentPrograms: [projection] },
    } as never);
  };

  it('uses a canonical due projection, while unknown and prospective status never act as current due', () => {
    const due = decisionFor(programme('due'));
    expect(due.omissions.map((omission) => omission.reasonCode)).toContain('treatment_due');

    const unknown = decisionFor(programme('unknown'));
    expect(unknown.status).toBe('needs_input');

    const prospective = decisionFor(programme('due', true));
    expect(prospective.status).toBe('needs_input');
  });
});

describe('stage 5 filter_candidates', () => {
  const base = [rule('r-a', 'load_verified_facts', [include('cand-a')]), rule('r-b', 'load_verified_facts', [include('cand-b')])];

  it('removes an incompatible candidate and explains the omission', () => {
    const decision = evaluateDecision(buildInput({
      rules: [...base, rule('r-x', 'filter_candidates', [{ kind: 'exclude_candidate', candidateId: 'cand-a', reasonCode: 'incompatible' }])],
    }));
    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-b']);
    expect(decision.omissions).toEqual([
      { candidateId: 'cand-a', reasonCode: 'incompatible', reasonSeverity: 'caution', ruleIds: ['r-x'], ruleRefs: [{ ruleId: 'r-x', version: '1' }], claimIds: ['claim-r-x'], evidenceIds: ['ev-r-x'] },
    ]);
  });

  it('reports reason severity independently from the rule authority level', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        ...base,
        rule('r-x', 'filter_candidates', [{
          kind: 'exclude_candidate',
          candidateId: 'cand-a',
          reasonCode: 'incompatible',
          reasonSeverity: 'caution',
        }], { severity: 'hard' }),
      ],
    }));
    expect(decision.omissions[0]).toMatchObject({ reasonCode: 'incompatible', reasonSeverity: 'caution' });
    expect(decision.audit.trace.find((entry) => entry.stageId === 'filter_candidates')?.reasonSeverity).toBe('info');
  });

  it('does not keep a candidate when the exclusion cannot be evaluated', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-ready', true), fact('f-compat', null, { status: 'unknown' })],
      rules: [...base, rule('r-x', 'filter_candidates', [{ kind: 'exclude_candidate', candidateId: 'cand-a', reasonCode: 'incompatible' }], { when: when('f-compat', false) })],
    }));
    expect(decision.status).toBe('needs_input');
    expect(decision.steps).toEqual([]);
  });
});

describe('stage 6 evaluate_heat', () => {
  const inclusion = rule('r-a', 'load_verified_facts', [include('cand-a')]);
  const heat = (state: 'appropriate' | 'lower_heat' | 'no_heat' | 'restricted', extra = {}) =>
    rule(`r-heat-${state}`, 'evaluate_heat', [{ kind: 'set_heat_assessment', state }], extra);

  it('reports a decided heat state and offers lower-exposure alternatives without adding them to the plan', () => {
    const decision = evaluateDecision(buildInput({
      rules: [inclusion, heat('lower_heat'), rule('r-alt', 'evaluate_heat', [include('alt-air')])],
    }));
    expect(decision).toMatchObject({ status: 'decided', heatAssessment: 'lower_heat' });
    expect(decision.alternatives.map((alternative) => alternative.alternativeId)).toEqual(['alt-air']);
    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-a']);
  });

  it('the most restrictive fired state wins and a restricted state blocks', () => {
    const decision = evaluateDecision(buildInput({ rules: [inclusion, heat('appropriate'), heat('restricted')] }));
    expect(decision).toMatchObject({ status: 'blocked', heatAssessment: 'restricted' });
    expect(decision.steps).toEqual([]);
  });

  it('never reports appropriate when the supporting fact is unknown', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-ready', true), fact('f-tool', null, { status: 'unknown' })],
      rules: [inclusion, heat('appropriate', { when: when('f-tool', 'safe') })],
    }));
    expect(decision.status).toBe('needs_input');
    expect(decision.heatAssessment).toBe('needs_input');
  });

  it('is content_pending (blocked) when heat rules exist but none establishes a state', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-ready', true), fact('f-other', 'x')],
      rules: [inclusion, heat('appropriate', { when: when('f-other', 'y') })],
    }));
    expect(decision).toMatchObject({ status: 'blocked', heatAssessment: 'content_pending' });
  });

  it('leaves heat unset when the ruleset has no heat content at all', () => {
    const decision = evaluateDecision(buildInput({ rules: [inclusion] }));
    expect(decision.heatAssessment).toBeUndefined();
    expect(traceOf(decision, 'evaluate_heat')?.outcome).toBe('not_applicable');
  });
});

describe('stage 7 select_and_rank', () => {
  it('uses suitability precedence, then stable Pareto frontiers for heat exposure and product burden', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-a-dominates-b', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-a', goalSuitability: 5,
          heatExposureOrdinal: 1, distinctRequiredProductCount: 2,
        }]),
        rule('r-b-dominated', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-b', goalSuitability: 5,
          heatExposureOrdinal: 2, distinctRequiredProductCount: 3,
        }]),
        rule('r-c-tradeoff', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-c', goalSuitability: 5,
          heatExposureOrdinal: 2, distinctRequiredProductCount: 1,
        }]),
        rule('r-d-higher-suitability', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-d', goalSuitability: 6,
          heatExposureOrdinal: 8, distinctRequiredProductCount: 8,
        }]),
      ],
    }));

    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-d', 'cand-a', 'cand-c', 'cand-b']);
  });

  it('preserves pre-stage order for trade-offs and candidates with unknown measures', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-a-unknown-heat', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-a', goalSuitability: 5,
          heatExposureOrdinal: null, distinctRequiredProductCount: 1,
        }]),
        rule('r-b-tradeoff', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-b', goalSuitability: 5,
          heatExposureOrdinal: 0, distinctRequiredProductCount: 2,
        }]),
        rule('r-c-opposite-tradeoff', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-c', goalSuitability: 5,
          heatExposureOrdinal: 3, distinctRequiredProductCount: null,
        }]),
      ],
    }));

    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-a', 'cand-b', 'cand-c']);
    expect(decision.rankingLimitations).toEqual([
      {
        candidateId: 'cand-a',
        reasonCode: 'ranking_measure_unknown',
        reasonSeverity: 'info',
        unknownMeasures: ['heat_exposure_ordinal'],
      },
      {
        candidateId: 'cand-c',
        reasonCode: 'ranking_measure_unknown',
        reasonSeverity: 'info',
        unknownMeasures: ['distinct_required_product_count'],
      },
    ]);
  });

  it('keeps candidates with identical reviewed measures in stable tie order', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-a', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-a', goalSuitability: 5,
          heatExposureOrdinal: 2, distinctRequiredProductCount: 2,
        }]),
        rule('r-b', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-b', goalSuitability: 5,
          heatExposureOrdinal: 2, distinctRequiredProductCount: 2,
        }]),
      ],
    }));

    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-a', 'cand-b']);
  });

  it('keeps a hard-excluded candidate out regardless of its ranking measures', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-include-a', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-a', goalSuitability: 100,
          heatExposureOrdinal: 0, distinctRequiredProductCount: 0,
        }]),
        rule('r-include-b', 'load_verified_facts', [{
          kind: 'include_candidate', candidateId: 'cand-b', goalSuitability: 1,
          heatExposureOrdinal: 9, distinctRequiredProductCount: 9,
        }]),
        rule('r-exclude-a', 'filter_candidates', [{
          kind: 'exclude_candidate', candidateId: 'cand-a', reasonCode: 'hard_exclusion',
        }], { severity: 'hard' }),
      ],
    }));

    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-b']);
    expect(decision.omissions.map((omission) => omission.candidateId)).toContain('cand-a');
  });

  it('uses authored goal suitability then a stable id tie-break, independent of rule authority', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-1', 'load_verified_facts', [{ kind: 'include_candidate', candidateId: 'cand-c', goalSuitability: 2 }], { severity: 'hard' }),
        rule('r-2', 'load_verified_facts', [{ kind: 'include_candidate', candidateId: 'cand-b', goalSuitability: 3 }], { severity: 'info' }),
        rule('r-3', 'load_verified_facts', [{ kind: 'include_candidate', candidateId: 'cand-a', goalSuitability: 2 }], { severity: 'info' }),
      ],
    }));
    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-b', 'cand-a', 'cand-c']);
  });
});

describe('stages 8-9 dependency graph and ordering', () => {
  const candidates = ['cand-a', 'cand-b', 'cand-c'].map((id) => rule(`r-${id}`, 'load_verified_facts', [include(id)]));

  it('orders prerequisites first, attaches waits, and keeps ties stable', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        ...candidates,
        rule('r-pre', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-c' }]),
        rule('r-wait', 'build_dependency_graph', [{ kind: 'insert_wait', afterActionId: 'cand-c', minutes: 4 }]),
        rule('r-wait2', 'build_dependency_graph', [{ kind: 'insert_wait', afterActionId: 'cand-c', minutes: 10 }]),
      ],
    }));
    expect(decision.steps.map((step) => step.actionId)).toEqual(['cand-c', 'cand-a', 'cand-b']);
    expect(decision.steps[0]).toMatchObject({ waitMinutes: 10, prerequisiteIds: [] });
    expect(decision.steps[1]).toMatchObject({ prerequisiteIds: ['cand-c'], ruleIds: ['r-cand-a', 'r-pre'] });
  });

  it('returns no executable plan when a hard prerequisite is not available', () => {
    const decision = evaluateDecision(buildInput({
      rules: [...candidates, rule('r-pre', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-missing' }])],
    }));
    expect(decision.status).toBe('no_protocol');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions[0]).toMatchObject({ candidateId: 'decision', reasonCode: 'prerequisite_unmet:cand-missing', ruleIds: ['r-pre'] });
  });

  it('ignores an unmet advisory prerequisite', () => {
    const decision = evaluateDecision(buildInput({
      rules: [...candidates, rule('r-pre', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-missing' }], { severity: 'info' })],
    }));
    expect(decision.status).toBe('decided');
  });

  it('detects dependency cycles and returns a traced, non-actionable result', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        ...candidates,
        rule('r-pa', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-a' }]),
        rule('r-pb', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-b' }]),
      ],
    }));
    expect(decision.status).toBe('no_protocol');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions[0]).toMatchObject({ reasonCode: 'dependency_cycle', ruleIds: ['r-pa', 'r-pb'] });
  });

  it('reports no_protocol when every candidate was filtered out', () => {
    const decision = evaluateDecision(buildInput({ rules: [] }));
    expect(decision.status).toBe('no_protocol');
    expect(decision.omissions[0]?.reasonCode).toBe('no_eligible_candidates');
  });

  it('topologicalOrder reports a cycle without a partial order beyond the acyclic prefix', () => {
    const provenance = { ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [] };
    const result = topologicalOrder({
      nodes: ['x', 'y'],
      edges: [{ from: 'x', to: 'y', provenance }, { from: 'y', to: 'x', provenance }],
      waits: new Map(),
    });
    expect(result).toEqual({ order: [], cyclic: true });
  });
});

describe('stage 10 assemble_decision', () => {
  it('ranks and de-duplicates questions: authored asks, then missing facts, then heat', () => {
    expect(rankQuestions([
      { questionId: 'fact:b', reasonCode: 'fact_unknown', reasonSeverity: 'caution', neededFactIds: ['b'], origin: 'fact', ruleRefs: [], stageIndex: 1 },
      { questionId: 'heat_input_required', reasonCode: 'heat_needs_input', reasonSeverity: 'caution', neededFactIds: [], origin: 'heat', ruleRefs: [], stageIndex: 5 },
      { questionId: 'fact:a', reasonCode: 'fact_unknown', reasonSeverity: 'caution', neededFactIds: ['a'], origin: 'fact', ruleRefs: [], stageIndex: 1 },
      { questionId: 'fact:a', reasonCode: 'fact_expired', reasonSeverity: 'caution', neededFactIds: ['z'], origin: 'fact', ruleRefs: [], stageIndex: 4 },
      { questionId: 'ask', reasonCode: 'authored', reasonSeverity: 'caution', neededFactIds: [], origin: 'rule', ruleRefs: [], stageIndex: 8 },
    ]).map((question) => [question.rank, question.questionId, question.neededFactIds])).toEqual([
      [1, 'ask', []],
      [2, 'fact:a', ['a', 'z']],
      [3, 'fact:b', ['b']],
      [4, 'heat_input_required', []],
    ]);
  });

  it('does not promote suitability from evidence identifiers alone and reflects reviewed capability support', () => {
    const unbound = evaluateDecision(buildInput({ rules: [rule('r-a', 'load_verified_facts', [include('cand-a')], {
      evidenceIds: ['ev-one', 'ev-two', 'ev-three'],
    })] }));
    expect(unbound.confidence).toEqual({ instructionCompleteness: 'high', suitability: 'limited' });

    const reviewed = evaluateDecision(buildInput({
      capabilities: [capability('cap-reviewed')],
      rules: [rule('r-reviewed', 'load_verified_facts', [include('cand-a')], {
        capabilityIds: ['cap-reviewed'],
        claimIds: ['claim-cap-reviewed'],
        evidenceIds: ['ev-cap-reviewed'],
      })],
    }));
    expect(reviewed.confidence).toEqual({ instructionCompleteness: 'high', suitability: 'moderate' });

    const blocked = evaluateDecision(buildInput({ rules: [rule('r-b', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'x' }])] }));
    expect(blocked.confidence).toEqual({ instructionCompleteness: 'low', suitability: 'limited' });
  });
});

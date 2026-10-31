import { describe, expect, it } from 'vitest';
import {
  EngineInputError,
  PIPELINE_STAGES,
  createPipelineState,
  evaluateDecision,
  rankQuestions,
  topologicalOrder,
} from '../../../packages/engine/src/pipeline/index.js';
import { summariseTreatment } from '../../../packages/engine/src/pipeline/stages/derive-treatment-state.js';
import { resolveFact } from '../../../packages/engine/src/pipeline/stages/validate-snapshot.js';
import { ENGINE_STAGE_IDS } from '../../../packages/engine/src/index.js';
import { FUTURE, NOW, PAST, buildInput, capability, fact, include, rule, when } from './fixtures.js';

const traceOf = (decision: ReturnType<typeof evaluateDecision>, stage: (typeof ENGINE_STAGE_IDS)[number]) =>
  decision.audit.trace.find((entry) => entry.stageId === stage);

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

describe('stage 2 apply_safety_restrictions', () => {
  const blockRule = rule('r-block', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'active_reaction' }]);

  it('blocks when a restriction fires and cites its rule, claim and evidence', () => {
    const decision = evaluateDecision(buildInput({ rules: [blockRule, rule('r-in', 'load_verified_facts', [include('cand-a')])] }));
    expect(decision.status).toBe('blocked');
    expect(decision.steps).toEqual([]);
    expect(decision.omissions[0]).toMatchObject({
      reasonCode: 'active_reaction',
      ruleIds: ['r-block'],
      claimIds: ['claim-r-block'],
      evidenceIds: ['ev-r-block'],
    });
    expect(traceOf(decision, 'apply_safety_restrictions')).toMatchObject({ outcome: 'blocked', ruleIds: ['r-block'] });
  });

  it('asks for input instead of assuming "no" when a hard rule depends on an unknown fact', () => {
    const decision = evaluateDecision(buildInput({
      facts: [fact('f-reaction', null, { status: 'unknown' }), fact('f-ready', true)],
      rules: [rule('r-reaction', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'active_reaction' }], { when: when('f-reaction', true) }),
        rule('r-in', 'load_verified_facts', [include('cand-a')])],
    }));
    expect(decision.status).toBe('needs_input');
    expect(decision.steps).toEqual([]);
    expect(decision.questions).toEqual([{ questionId: 'fact:f-reaction', rank: 1, reasonCode: 'fact_unknown', neededFactIds: ['f-reaction'] }]);
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
    const owned = evaluateDecision(buildInput({ ...ruleset, shelf: ['prod-other'] }));
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
  it('summarises confirmed events per type independent of input order', () => {
    const events = [
      { eventId: 'e2', eventType: 'wash', happenedAt: '2026-10-10T00:00:00.000Z' },
      { eventId: 'e1', eventType: 'wash', happenedAt: '2026-10-20T00:00:00.000Z' },
      { eventId: 'e3', eventType: 'application', happenedAt: '2026-10-15T00:00:00.000Z' },
    ];
    const forward = summariseTreatment(createPipelineState(buildInput({ events })));
    const reversed = summariseTreatment(createPipelineState(buildInput({ events: [...events].reverse() })));
    expect(forward).toEqual(reversed);
    expect(forward.eventTypes).toEqual([
      { eventType: 'application', count: 1, latestHappenedAt: '2026-10-15T00:00:00.000Z' },
      { eventType: 'wash', count: 2, latestHappenedAt: '2026-10-20T00:00:00.000Z' },
    ]);
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
      { candidateId: 'cand-a', reasonCode: 'incompatible', ruleIds: ['r-x'], claimIds: ['claim-r-x'], evidenceIds: ['ev-r-x'] },
    ]);
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
  it('ranks by goal suitability, then by candidate id', () => {
    const decision = evaluateDecision(buildInput({
      rules: [
        rule('r-1', 'load_verified_facts', [include('cand-c')], { severity: 'info' }),
        rule('r-2', 'load_verified_facts', [include('cand-b')], { severity: 'hard' }),
        rule('r-3', 'load_verified_facts', [include('cand-a')], { severity: 'info' }),
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
    const provenance = { ruleIds: [], claimIds: [], evidenceIds: [] };
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
      { questionId: 'fact:b', reasonCode: 'fact_unknown', neededFactIds: ['b'], origin: 'fact', stageIndex: 1 },
      { questionId: 'heat_input_required', reasonCode: 'heat_needs_input', neededFactIds: [], origin: 'heat', stageIndex: 5 },
      { questionId: 'fact:a', reasonCode: 'fact_unknown', neededFactIds: ['a'], origin: 'fact', stageIndex: 1 },
      { questionId: 'fact:a', reasonCode: 'fact_expired', neededFactIds: ['z'], origin: 'fact', stageIndex: 4 },
      { questionId: 'ask', reasonCode: 'authored', neededFactIds: [], origin: 'rule', stageIndex: 8 },
    ]).map((question) => [question.rank, question.questionId, question.neededFactIds])).toEqual([
      [1, 'ask', []],
      [2, 'fact:a', ['a', 'z']],
      [3, 'fact:b', ['b']],
      [4, 'heat_input_required', []],
    ]);
  });

  it('only reports confidence above "low" for a decided outcome and never "strong" applicability', () => {
    const decided = evaluateDecision(buildInput({ rules: [rule('r-a', 'load_verified_facts', [include('cand-a')])] }));
    expect(decided.confidence).toEqual({ evidence: 'strong', applicability: 'limited' });
    const blocked = evaluateDecision(buildInput({ rules: [rule('r-b', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'x' }])] }));
    expect(blocked.confidence).toEqual({ evidence: 'low', applicability: 'low' });
  });
});

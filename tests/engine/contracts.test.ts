import { describe, expect, it } from 'vitest';
import {
  DECISION_STATUSES,
  ENGINE_STAGE_IDS,
  HEAT_ASSESSMENT_STATES,
  CompiledRulesetSchema,
  DecisionTableRowSchema,
  EngineDecisionSchema,
  EngineInputSchema,
  ReviewedCapabilityBindingSchema,
  RuleEffectSchema,
  RuleExpressionSchema,
  RuleAuthoringBundleSchema,
  SuccessorReviewSchema,
  type EngineDecision,
} from '../../packages/engine/src/index.js';

const audit = {
  ruleset: {
    rulesetId: 'synthetic-ruleset-v1',
    contentHash: 'sha256:synthetic-hash',
    schemaVersion: '1.1.0',
    evaluatorVersion: '1.1.0',
  },
  evaluatedAt: '2026-10-31T12:00:00.000Z',
  schemaVersion: '1.1.0',
  evaluatorVersion: '1.1.0',
  trace: ENGINE_STAGE_IDS.map((stageId) => ({
    stageId,
    outcome: 'not_applicable' as const,
    reasonSeverity: 'info' as const,
    ruleIds: [],
    ruleRefs: [],
    claimIds: [],
    evidenceIds: [],
  })),
};

const baseDecision = (status: EngineDecision['status'], heatAssessment: EngineDecision['heatAssessment']) => ({
  status,
  steps: status === 'decided' ? [{ stepId: 'step-1', actionId: 'synthetic-action', labelKey: 'step.synthetic', reasonCode: 'synthetic', reasonSeverity: 'info', ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [], prerequisiteIds: [] }] : [],
  omissions: [],
  alternatives: [],
  questions: status === 'needs_input' ? [{ questionId: 'synthetic-question', rank: 1, reasonCode: 'synthetic', reasonSeverity: 'caution', ruleRefs: [], neededFactIds: [] }] : [],
  heatAssessment,
  confidence: { instructionCompleteness: 'moderate', suitability: 'limited' },
  audit,
});

describe('decision engine public contracts', () => {
  it('requires UUID identities and a distinct authenticated successor reviewer reference', () => {
    const review = {
      parentRulesetHash: `sha256:${'a'.repeat(64)}`,
      withdrawals: [{ ruleId: 'rule.old', version: '1', affectedActionId: 'action.old' }],
      authorizations: [{
        withdrawnRuleId: 'rule.old', withdrawnRuleVersion: '1', affectedActionId: 'action.old',
        successorRuleId: 'rule.new', successorRuleVersion: '2',
        authorId: '11111111-1111-4111-8111-111111111111',
        reviewerId: '22222222-2222-4222-8222-222222222222',
        reviewedAt: '2026-11-01T00:00:00.000Z',
        reviewRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }],
    };
    expect(SuccessorReviewSchema.safeParse(review).success).toBe(true);
    expect(SuccessorReviewSchema.safeParse({
      ...review,
      authorizations: [{ ...review.authorizations[0], reviewerId: review.authorizations[0].authorId }],
    }).success).toBe(false);
    expect(SuccessorReviewSchema.safeParse({
      ...review,
      authorizations: [{ ...review.authorizations[0], reviewRef: 'synthetic-label' }],
    }).success).toBe(false);
  });

  it('rejects successor lineage when no reviewed successor packet is present', () => {
    const orphanRule = {
      ruleId: 'rule.successor',
      version: '2',
      stageId: 'filter_candidates',
      when: { kind: 'fact_exists', factId: 'fact.ready' },
      effects: [{ kind: 'include_candidate', candidateId: 'action.reopened' }],
      successorOf: {
        parentRulesetHash: `sha256:${'b'.repeat(64)}`,
        withdrawnRuleId: 'rule.withdrawn',
        withdrawnRuleVersion: '1',
      },
      severity: 'info',
      capabilityIds: [],
      claimIds: ['claim.successor'],
      evidenceIds: ['evidence.successor'],
    };
    expect(CompiledRulesetSchema.safeParse({
      ref: audit.ruleset,
      capabilities: [],
      rules: [orphanRule],
    }).success).toBe(false);
  });

  it('pins the decision and heat assessment vocabularies', () => {
    expect(DECISION_STATUSES).toEqual(['decided', 'needs_input', 'blocked', 'no_protocol']);
    expect(HEAT_ASSESSMENT_STATES).toEqual([
      'content_pending',
      'needs_input',
      'restricted',
      'lower_heat',
      'no_heat',
      'appropriate',
      'unavailable',
    ]);
  });

  it('pins the ten ordered pure evaluation stages', () => {
    expect(ENGINE_STAGE_IDS).toEqual([
      'validate_snapshot',
      'apply_safety_restrictions',
      'load_verified_facts',
      'derive_treatment_state',
      'filter_candidates',
      'evaluate_heat',
      'select_and_rank',
      'build_dependency_graph',
      'order_and_validate',
      'assemble_decision',
    ]);
  });

  it.each([
    ['decided', 'lower_heat'],
    ['decided', 'no_heat'],
    ['decided', 'appropriate'],
    ['needs_input', 'needs_input'],
    ['blocked', 'content_pending'],
    ['blocked', 'restricted'],
    ['no_protocol', 'unavailable'],
  ] as const)('accepts the valid status pair %s/%s', (status, heatAssessment) => {
    expect(EngineDecisionSchema.safeParse(baseDecision(status, heatAssessment)).success).toBe(true);
  });

  it.each([
    ['decided', 'restricted'],
    ['needs_input', 'appropriate'],
    ['blocked', 'lower_heat'],
    ['no_protocol', 'content_pending'],
  ] as const)('rejects the invalid status pair %s/%s', (status, heatAssessment) => {
    expect(EngineDecisionSchema.safeParse(baseDecision(status, heatAssessment)).success).toBe(false);
  });

  it('allows decisions outside Heat Coach without inventing a heat assessment', () => {
    const { heatAssessment: _heatAssessment, ...decision } = baseDecision('decided', 'appropriate');
    expect(EngineDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it('requires capability bindings and keeps compiled rulesets immutable', () => {
    const capability = {
      capabilityId: 'synthetic-capability',
      subjectType: 'product',
      subjectId: 'synthetic-product',
      catalogueSubject: { catalogueId: 'catalogue-synthetic-product', versionId: '1', market: 'ZA' },
      reviewedUseScope: 'synthetic-routine-use',
      capabilityType: 'compatibility',
      value: 'synthetic-compatible',
      claimId: 'claim-1',
      evidenceIds: ['evidence-1'],
      reviewRef: 'synthetic-review',
      reviewedAt: audit.evaluatedAt,
    } as const;
    const compiledRule = {
      ruleId: 'synthetic-rule',
      version: '1',
      stageId: 'filter_candidates',
      when: { kind: 'fact_exists', factId: 'synthetic-fact' },
      effects: [{ kind: 'block', reasonCode: 'synthetic' }],
      severity: 'hard',
      capabilityIds: ['synthetic-capability'],
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    } as const;
    const parsed = CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [capability], rules: [compiledRule] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.isFrozen(parsed.data)).toBe(true);
      expect(Object.isFrozen(parsed.data.capabilities)).toBe(true);
      expect(Object.isFrozen(parsed.data.rules)).toBe(true);
      expect(Object.isFrozen(parsed.data.capabilities[0])).toBe(true);
      expect(Object.isFrozen(parsed.data.rules[0])).toBe(true);
      expect(Object.isFrozen(parsed.data.rules[0].effects[0])).toBe(true);
      expect(() => (parsed.data.rules as unknown[]).push({})).toThrow();
    }

    expect(ReviewedCapabilityBindingSchema.safeParse({ ...capability, evidenceIds: [] }).success).toBe(false);
    expect(CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [], rules: [compiledRule] }).success).toBe(false);
    expect(CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [capability, { ...capability, claimId: 'other-claim' }], rules: [compiledRule] }).success).toBe(false);
    expect(CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [capability], rules: [compiledRule, { ...compiledRule, version: '2' }] }).success).toBe(false);
    expect(RuleAuthoringBundleSchema.safeParse({
      bundleId: 'synthetic-bundle',
      version: '1',
      capabilities: [capability],
      tables: [],
      constraints: [],
      requiredFixtures: [],
    }).success).toBe(true);
    expect(RuleAuthoringBundleSchema.safeParse({
      bundleId: 'synthetic-bundle',
      version: '1',
      capabilities: [capability, { ...capability, claimId: 'other-claim' }],
      tables: [],
      constraints: [],
      requiredFixtures: [],
    }).success).toBe(false);
    expect(RuleAuthoringBundleSchema.safeParse({ bundleId: 'synthetic-bundle', version: '1', tables: [], constraints: [], requiredFixtures: [] }).success).toBe(false);
    expect(CompiledRulesetSchema.safeParse({
      ref: audit.ruleset,
      capabilities: [capability],
      rules: [{ ...compiledRule, claimIds: ['unrelated-claim'], evidenceIds: ['unrelated-evidence'] }],
    }).success).toBe(false);
  });

  it('requires claim and evidence references on table rows and rejects arbitrary rules', () => {
    const tableRow = {
      rowId: 'row-1',
      when: { kind: 'fact_exists', factId: 'synthetic-fact' },
      effects: [{ kind: 'block', reasonCode: 'synthetic' }],
      severity: 'hard',
      capabilityIds: [],
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    };
    const compiledRule = {
      ruleId: 'synthetic-rule',
      version: '1',
      stageId: 'filter_candidates',
      when: { kind: 'fact_exists', factId: 'synthetic-fact' },
      effects: [{ kind: 'block', reasonCode: 'synthetic' }],
      severity: 'hard',
      capabilityIds: [],
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    };
    expect(RuleExpressionSchema.safeParse({ kind: 'execute_javascript', source: 'unsafe' }).success).toBe(false);
    expect(RuleEffectSchema.safeParse({ kind: 'run_code', code: 'unsafe' }).success).toBe(false);
    expect(DecisionTableRowSchema.safeParse(tableRow).success).toBe(true);
    expect(DecisionTableRowSchema.safeParse({ ...tableRow, evidenceIds: [] }).success).toBe(false);
    expect(CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [], rules: [compiledRule] }).success).toBe(true);
    expect(CompiledRulesetSchema.safeParse({ ref: audit.ruleset, capabilities: [], rules: [{ ...compiledRule, claimIds: [] }] }).success).toBe(false);
  });

  it('rejects commercial and free-text safety inputs at the strict engine boundary', () => {
    const input = {
      snapshot: {
        ownerScopeId: 'synthetic-owner',
        factRegistry: [],
        passport: { entryId: 'passport-1', revision: 1, factIds: [] },
        chemicalServiceHistory: [],
        shelf: [],
        tools: [],
        eventHistory: [],
        revisions: { passport: 1, chemicalServiceHistory: 0, shelf: 0, tools: 0, events: 0 },
      },
      evaluatedAt: '2026-10-31T12:00:00.000Z',
      ruleset: { ref: audit.ruleset, capabilities: [], rules: [] },
    };

    expect(EngineInputSchema.safeParse(input).success).toBe(true);
    const parsed = EngineInputSchema.parse(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot)).toBe(true);
    expect(Object.isFrozen(parsed.snapshot.factRegistry)).toBe(true);
    expect(EngineInputSchema.safeParse({
      ...input,
      snapshot: { ...input.snapshot, shelf: [{ entryId: 'shelf-1', revision: 1, factIds: ['missing-fact'] }] },
    }).success).toBe(false);
    expect(EngineInputSchema.safeParse({ ...input, freeTextSafetyInput: 'synthetic only' }).success).toBe(false);
    expect(EngineInputSchema.safeParse({ ...input, retailer: 'synthetic retailer' }).success).toBe(false);
    expect(EngineInputSchema.safeParse({ ...input, price: 100 }).success).toBe(false);
  });
  it('requires the version-pinned audit and decision fields', () => {
    const parsed = EngineDecisionSchema.safeParse(baseDecision('decided', 'appropriate'));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({
        status: 'decided',
        steps: expect.arrayContaining([expect.objectContaining({ stepId: 'step-1' })]),
        omissions: [],
        alternatives: [],
        questions: [],
        confidence: { instructionCompleteness: 'moderate', suitability: 'limited' },
        audit: { ruleset: { contentHash: 'sha256:synthetic-hash' }, trace: expect.any(Array) },
      });
    }
  });
});

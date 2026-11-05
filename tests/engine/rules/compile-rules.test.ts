import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileRules } from '../../../packages/engine/src/rules/index.js';
import { CompiledRulesetSchema } from '../../../packages/engine/src/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';

const canonicalJson = (value: unknown): string => {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input !== null && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortKeys(record[key])]));
    }
    return input;
  };
  return JSON.stringify(sortKeys(value));
};

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
  reviewedAt: '2026-10-31T12:00:00.000Z',
} as const;

const validBundle = {
  bundleId: 'synthetic-bundle',
  version: '1',
  capabilities: [capability],
  tables: [
    {
      tableId: 'synthetic-table',
      hitPolicy: 'first',
      rows: [
        {
          rowId: 'row-1',
          when: { kind: 'fact_exists', factId: 'synthetic-fact' },
          effects: [{ kind: 'block', reasonCode: 'synthetic' }],
          useScope: 'synthetic-routine-use',
          severity: 'hard',
          capabilityIds: ['synthetic-capability'],
          claimIds: ['claim-1'],
          evidenceIds: ['evidence-1'],
        },
        {
          rowId: 'row-2',
          when: { kind: 'fact_equals', factId: 'synthetic-other-fact', value: 'synthetic-value' },
          effects: [{ kind: 'set_heat_assessment', state: 'lower_heat' }],
          severity: 'caution',
          capabilityIds: [],
          claimIds: ['claim-1'],
          evidenceIds: ['evidence-1'],
        },
      ],
    },
  ],
  constraints: [
    {
      ruleId: 'synthetic-constraint',
      version: '1',
      when: { kind: 'fact_exists', factId: 'synthetic-fact' },
      effects: [{ kind: 'insert_wait', afterActionId: 'synthetic-action', minutes: 5 }],
      useScope: 'synthetic-routine-use',
      severity: 'hard',
      capabilityIds: ['synthetic-capability'],
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    },
  ],
  requiredFixtures: [
    { ruleId: 'synthetic-table::row-1', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
    { ruleId: 'synthetic-constraint', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
  ],
} as const;

describe('rule compiler', () => {
  it('preserves reviewed ranking measures on compiled candidate effects', () => {
    const rankingMeasures = {
      heatExposureOrdinal: 2,
      distinctRequiredProductCount: 3,
    };
    const bundle = {
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        rows: validBundle.tables[0].rows.map((row, index) => index === 0
          ? {
              ...row,
              effects: [{
                kind: 'include_candidate' as const,
                candidateId: 'candidate.synthetic',
                ...rankingMeasures,
              }],
            }
          : row),
      }],
    };

    const compiled = compileRules(bundle);

    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-table::row-1')?.effects).toEqual([{
      kind: 'include_candidate',
      candidateId: 'candidate.synthetic',
      ...rankingMeasures,
    }]);
    expect(CompiledRulesetSchema.safeParse(compiled).success).toBe(true);

    const changedMeasure = compileRules({
      ...bundle,
      tables: [{
        ...bundle.tables[0],
        rows: bundle.tables[0].rows.map((row, index) => index === 0
          ? { ...row, effects: [{ kind: 'include_candidate' as const, candidateId: 'candidate.synthetic', heatExposureOrdinal: 1, distinctRequiredProductCount: 3 }] }
          : row),
      }],
    });
    expect(changedMeasure.ref.contentHash).not.toBe(compiled.ref.contentHash);
  });

  it('compiles a valid bundle into a frozen ruleset', () => {
    const compiled = compileRules(validBundle);
    const parsed = CompiledRulesetSchema.safeParse(compiled);
    expect(parsed.success).toBe(true);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.rules)).toBe(true);
    expect(Object.isFrozen(compiled.capabilities)).toBe(true);
    expect(compiled.rules).toHaveLength(3);
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-table::row-1')?.useScope).toBe('synthetic-routine-use');
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-constraint')?.useScope).toBe('synthetic-routine-use');
  });

  it('preserves table policy and source row order in compiled rules', () => {
    const compiled = compileRules(validBundle);
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-table::row-1')?.table).toEqual({
      tableId: 'synthetic-table',
      hitPolicy: 'first',
      rowOrder: 0,
    });
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-table::row-2')?.table?.rowOrder).toBe(1);
  });

  it('refuses to compile a hard rule that static analysis finds without fixtures', () => {
    expect(() => compileRules({ ...validBundle, requiredFixtures: [] })).toThrow(/missing-fixture/);
  });

  it('refuses to compile an unreachable first-hit row', () => {
    const firstRow = { ...validBundle.tables[0].rows[0], capabilityIds: [] };
    expect(() => compileRules({
      ...validBundle,
      tables: [{ ...validBundle.tables[0], rows: [firstRow, { ...firstRow, rowId: 'unreachable-row', severity: 'caution' }] }],
    })).toThrow(/unreachable-row/);
  });

  it('keeps a same-condition fallback reachable when the prior capability may be absent', () => {
    const firstRow = validBundle.tables[0].rows[0];
    const compiled = compileRules({
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        rows: [
          firstRow,
          { ...firstRow, rowId: 'fallback-row', severity: 'caution', capabilityIds: [] },
        ],
      }],
    });
    expect(compiled.rules.some((rule) => rule.ruleId === 'synthetic-table::fallback-row')).toBe(true);
  });

  it('proves a same-condition row unreachable when the candidate shares the prior capability', () => {
    const firstRow = {
      ...validBundle.tables[0].rows[0],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
    } as const;
    expect(() => compileRules({
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        rows: [firstRow, { ...firstRow, rowId: 'same-capability-fallback', severity: 'caution' }],
      }],
    })).toThrow(/unreachable-row/);
  });

  it('proves a same-condition row unreachable when candidate capabilities are a superset', () => {
    const secondCapability = {
      ...capability,
      capabilityId: 'synthetic-capability-2',
      claimId: 'claim-2',
      evidenceIds: ['evidence-2'],
    } as const;
    const firstRow = {
      ...validBundle.tables[0].rows[0],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
    } as const;
    const candidateRow = {
      ...firstRow,
      rowId: 'superset-capability-fallback',
      severity: 'caution',
      capabilityIds: ['synthetic-capability', 'synthetic-capability-2'],
      claimIds: ['claim-1', 'claim-2'],
      evidenceIds: ['evidence-1', 'evidence-2'],
    } as const;
    expect(() => compileRules({
      ...validBundle,
      capabilities: [...validBundle.capabilities, secondCapability],
      tables: [{ ...validBundle.tables[0], rows: [firstRow, candidateRow] }],
    })).toThrow(/unreachable-row/);
  });

  it('proves reachability from a distinct capability with the same subject and contained validity window', () => {
    const priorCapability = {
      ...capability,
      reviewedAt: '2026-11-01T00:00:00.000Z',
      expiresAt: '2026-11-10T00:00:00.000Z',
    } as const;
    const candidateCapability = {
      ...capability,
      capabilityId: 'contained-capability',
      claimId: 'contained-claim',
      evidenceIds: ['contained-evidence'],
      reviewedAt: '2026-11-03T00:00:00.000Z',
      expiresAt: '2026-11-05T00:00:00.000Z',
    } as const;
    const firstRow = {
      ...validBundle.tables[0].rows[0],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
    } as const;
    const candidateRow = {
      ...firstRow,
      rowId: 'contained-window-row',
      severity: 'caution',
      capabilityIds: ['contained-capability'],
      claimIds: ['contained-claim'],
      evidenceIds: ['contained-evidence'],
    } as const;
    expect(() => compileRules({
      ...validBundle,
      capabilities: [priorCapability, candidateCapability],
      tables: [{ ...validBundle.tables[0], rows: [firstRow, candidateRow] }],
    })).toThrow(/unreachable-row/);
  });

  it('uses the combined candidate window to prove a prior capability is active', () => {
    const priorCapability = {
      ...capability,
      reviewedAt: '2027-05-01T00:00:00.000Z',
      expiresAt: '2027-08-01T00:00:00.000Z',
    } as const;
    const broadCandidateCapability = {
      ...capability,
      capabilityId: 'candidate-x',
      reviewedAt: '2027-01-01T00:00:00.000Z',
      expiresAt: '2027-12-01T00:00:00.000Z',
    } as const;
    const narrowOtherSubjectCapability = {
      ...capability,
      capabilityId: 'candidate-y',
      subjectId: 'synthetic-tool',
      subjectType: 'tool',
      reviewedAt: '2027-06-01T00:00:00.000Z',
      expiresAt: '2027-07-01T00:00:00.000Z',
    } as const;
    const firstRow = {
      ...validBundle.tables[0].rows[0],
      capabilityIds: ['synthetic-capability'],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
    } as const;
    const candidateRow = {
      ...firstRow,
      rowId: 'combined-window-row',
      severity: 'caution',
      capabilityIds: ['candidate-x', 'candidate-y'],
    } as const;
    expect(() => compileRules({
      ...validBundle,
      capabilities: [priorCapability, broadCandidateCapability, narrowOtherSubjectCapability],
      tables: [{ ...validBundle.tables[0], rows: [firstRow, candidateRow] }],
    })).toThrow(/unreachable-row/);
  });

  it('uses shared time and ownership across prior rows when their windows cover the candidate window', () => {
    const capabilities = [
      capability,
      { ...capability, capabilityId: 'prior-early', reviewedAt: '2027-01-01T00:00:00.000Z', expiresAt: '2027-06-01T00:00:00.000Z' },
      { ...capability, capabilityId: 'prior-late', reviewedAt: '2027-06-01T00:00:00.000Z', expiresAt: '2027-12-01T00:00:00.000Z' },
      { ...capability, capabilityId: 'candidate-full', reviewedAt: '2027-01-01T00:00:00.000Z', expiresAt: '2027-12-01T00:00:00.000Z' },
      { ...capability, capabilityId: 'candidate-owner', subjectId: 'synthetic-tool', subjectType: 'tool' },
      { ...capability, capabilityId: 'prior-owner-early', subjectId: 'synthetic-tool', subjectType: 'tool' },
      { ...capability, capabilityId: 'prior-owner-late', subjectId: 'synthetic-tool', subjectType: 'tool' },
    ] as const;
    const commonRow = {
      ...validBundle.tables[0].rows[0],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    } as const;
    const rows = [
      { ...commonRow, rowId: 'early-prior', capabilityIds: ['prior-early', 'prior-owner-early'] },
      { ...commonRow, rowId: 'late-prior', capabilityIds: ['prior-late', 'prior-owner-late'] },
      { ...commonRow, rowId: 'full-candidate', severity: 'caution', capabilityIds: ['candidate-full', 'candidate-owner'] },
    ] as const;
    expect(() => compileRules({
      ...validBundle,
      capabilities,
      tables: [{ ...validBundle.tables[0], rows }],
      requiredFixtures: [
        ...validBundle.requiredFixtures,
        { ruleId: 'synthetic-table::early-prior', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
        { ruleId: 'synthetic-table::late-prior', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
      ],
    })).toThrow(/unreachable-row/);
  });

  it('compiles block and ask-question effects in the block stage', () => {
    const firstRow = validBundle.tables[0].rows[0];
    const compiled = compileRules({
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        rows: [{
          ...firstRow,
          effects: [
            { kind: 'block', reasonCode: 'synthetic' },
            { kind: 'ask_question', questionId: 'synthetic-question', reasonCode: 'synthetic' },
          ],
        }],
      }],
    });
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-table::row-1')?.stageId).toBe('apply_safety_restrictions');
  });

  it('compiles include-candidate and ask-question effects in the inclusion stage', () => {
    const compiled = compileRules({
      ...validBundle,
      constraints: [{
        ...validBundle.constraints[0],
        effects: [
          { kind: 'include_candidate', candidateId: 'synthetic-product' },
          { kind: 'ask_question', questionId: 'synthetic-question', reasonCode: 'synthetic' },
        ],
      }],
    });
    expect(compiled.rules.find((rule) => rule.ruleId === 'synthetic-constraint')?.stageId).toBe('load_verified_facts');
  });

  it('refuses cross-stage effects with a stable analysis diagnostic', () => {
    const firstRow = validBundle.tables[0].rows[0];
    expect(() => compileRules({
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        rows: [{
          ...firstRow,
          effects: [
            { kind: 'include_candidate', candidateId: 'synthetic-product' },
            { kind: 'require_prerequisite', prerequisiteId: 'synthetic-prerequisite' },
          ],
        }],
      }],
    })).toThrow(/cross-stage-effects/);
  });

  it('refuses to compile overlapping cells under a unique hit policy', () => {
    const firstRow = validBundle.tables[0].rows[0];
    expect(() => compileRules({
      ...validBundle,
      tables: [{
        ...validBundle.tables[0],
        hitPolicy: 'unique',
        rows: [firstRow, { ...firstRow, rowId: 'overlap-row', when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true } }],
      }],
    })).toThrow(/overlapping-cells-unique/);
  });

  it('routes block effects to apply_safety_restrictions', () => {
    const compiled = compileRules(validBundle);
    const blockRule = compiled.rules.find((r) => r.ruleId === 'synthetic-table::row-1');
    expect(blockRule?.stageId).toBe('apply_safety_restrictions');
  });

  it('routes set_heat_assessment effects to evaluate_heat', () => {
    const compiled = compileRules(validBundle);
    const heatRule = compiled.rules.find((r) => r.ruleId === 'synthetic-table::row-2');
    expect(heatRule?.stageId).toBe('evaluate_heat');
  });

  it('routes insert_wait effects to build_dependency_graph', () => {
    const compiled = compileRules(validBundle);
    const waitRule = compiled.rules.find((r) => r.ruleId === 'synthetic-constraint');
    expect(waitRule?.stageId).toBe('build_dependency_graph');
  });

  it('uses a SHA-256 digest of canonical ruleset content', () => {
    const first = compileRules(validBundle);
    const second = compileRules(validBundle);
    expect(first.ref).toEqual(second.ref);
    expect(first.ref.rulesetId).toBe('synthetic-bundle');
    expect(first.ref.evaluatorVersion).toBe('1.1.0');
    const expectedDigest = createHash('sha256')
      .update(canonicalJson({ capabilities: first.capabilities, rules: first.rules }))
      .digest('hex');
    expect(first.ref.contentHash).toBe(`sha256:${expectedDigest}`);
  });

  it('compiles successor metadata and binds it into the ruleset digest', () => {
    const parentRulesetHash = `sha256:${'0'.repeat(64)}`;
    const successorReview = {
      parentRulesetHash,
      withdrawals: [{ ruleId: 'r-withdrawn', version: '1', affectedActionId: 'cand-successor' }],
      authorizations: [{
        withdrawnRuleId: 'r-withdrawn',
        withdrawnRuleVersion: '1',
        affectedActionId: 'cand-successor',
        successorRuleId: 'successor-table::row-successor',
        successorRuleVersion: '2',
        authorId: '11111111-1111-4111-8111-111111111111',
        reviewerId: '22222222-2222-4222-8222-222222222222',
        reviewedAt: '2026-10-31T12:00:00.000Z',
        reviewRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }],
    };
    const compiled = compileRules({
      bundleId: 'successor-bundle',
      version: '2',
      capabilities: [],
      tables: [{
        tableId: 'successor-table',
        hitPolicy: 'collect',
        rows: [{
          rowId: 'row-successor',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'include_candidate', candidateId: 'cand-successor' }],
          successorOf: { parentRulesetHash, withdrawnRuleId: 'r-withdrawn', withdrawnRuleVersion: '1' },
          severity: 'info',
          capabilityIds: [],
          claimIds: ['claim-successor'],
          evidenceIds: ['evidence-successor'],
        }],
      }],
      constraints: [],
      requiredFixtures: [],
      successorReview,
    });
    expect(compiled.rules[0]?.successorOf).toEqual({ parentRulesetHash, withdrawnRuleId: 'r-withdrawn', withdrawnRuleVersion: '1' });
    expect(compiled.successorReview).toEqual(successorReview);
    expect(compiled.ref.contentHash).toBe(canonicalRulesetContentHash({ capabilities: compiled.capabilities, rules: compiled.rules, successorReview }));
  });

  it('throws on an unbound capability', () => {
    expect(() =>
      compileRules({
        ...validBundle,
        tables: [
          {
            ...validBundle.tables[0],
            rows: [
              {
                ...validBundle.tables[0].rows[0],
                capabilityIds: ['unknown-capability'],
                claimIds: ['claim-1'],
                evidenceIds: ['evidence-1'],
              },
            ],
          },
        ],
      }),
    ).toThrow(/unbound capability/);
  });

  it('throws on a missing capability claim reference', () => {
    expect(() =>
      compileRules({
        ...validBundle,
        tables: [
          {
            ...validBundle.tables[0],
            rows: [
              {
                ...validBundle.tables[0].rows[0],
                claimIds: ['other-claim'],
              },
            ],
          },
        ],
      }),
    ).toThrow(/missing capability claim reference/);
  });

  it('throws on a missing capability evidence reference', () => {
    expect(() =>
      compileRules({
        ...validBundle,
        tables: [
          {
            ...validBundle.tables[0],
            rows: [
              {
                ...validBundle.tables[0].rows[0],
                claimIds: ['claim-1'],
                evidenceIds: ['other-evidence'],
              },
            ],
          },
        ],
      }),
    ).toThrow(/missing capability evidence reference/);
  });

  it('throws on duplicate compiled rule identifiers', () => {
    expect(() =>
      compileRules({
        ...validBundle,
        constraints: [
          {
            ...validBundle.constraints[0],
            ruleId: 'synthetic-table::row-1',
          },
        ],
      }),
    ).toThrow(/not unique/);
  });
});

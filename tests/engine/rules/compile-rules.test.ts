import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { compileRules } from '../../../packages/engine/src/rules/index.js';
import { CompiledRulesetSchema } from '../../../packages/engine/src/index.js';

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
  subjectVersion: '1',
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
  it('compiles a valid bundle into a frozen ruleset', () => {
    const compiled = compileRules(validBundle);
    const parsed = CompiledRulesetSchema.safeParse(compiled);
    expect(parsed.success).toBe(true);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.rules)).toBe(true);
    expect(Object.isFrozen(compiled.capabilities)).toBe(true);
    expect(compiled.rules).toHaveLength(3);
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
    expect(first.ref.evaluatorVersion).toBe('1.0.1');
    const expectedDigest = createHash('sha256')
      .update(canonicalJson({ capabilities: first.capabilities, rules: first.rules }))
      .digest('hex');
    expect(first.ref.contentHash).toBe(`sha256:${expectedDigest}`);
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

import { describe, expect, it } from 'vitest';
import { analyzeRules } from '../../../packages/engine/src/rules/index.js';
import { evaluateExpression } from '../../../packages/engine/src/pipeline/evaluate-expression.js';

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

const baseBundle = {
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
      ],
    },
  ],
  constraints: [],
  requiredFixtures: [
    { ruleId: 'synthetic-table::row-1', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
  ],
} as const;

describe('rule static analysis', () => {
  it('returns no diagnostics for a clean bundle', () => {
    const diagnostics = analyzeRules(baseBundle);
    expect(diagnostics).toEqual([]);
  });

  it('blocks capabilities whose valid review window is empty', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      capabilities: [{
        ...capability,
        reviewedAt: '2026-11-03T00:00:00.000Z',
        expiresAt: '2026-11-02T00:00:00.000Z',
      }],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'invalid-capability-window'
      && diagnostic.severity === 'error')).toBe(true);
  });

  it('does not prove rows unreachable from malformed windows or missing bindings', () => {
    const row = {
      ...baseBundle.tables[0].rows[0],
      when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
    } as const;
    const malformedWindow = analyzeRules({
      ...baseBundle,
      capabilities: [{ ...capability, reviewedAt: 'not-a-date' }],
      tables: [{ ...baseBundle.tables[0], rows: [row, { ...row, rowId: 'later-row', severity: 'caution' }] }],
    });
    const missingBinding = analyzeRules({
      ...baseBundle,
      capabilities: [],
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          { ...row, capabilityIds: ['missing-capability'] },
          { ...row, rowId: 'later-row', severity: 'caution', capabilityIds: ['missing-capability'] },
        ],
      }],
    });
    expect(malformedWindow.some((diagnostic) => diagnostic.code === 'unreachable-row')).toBe(false);
    expect(malformedWindow.some((diagnostic) => diagnostic.code === 'invalid-capability-window')).toBe(false);
    expect(missingBinding.some((diagnostic) => diagnostic.code === 'unreachable-row')).toBe(false);
  });

  it('flags unreachable rows under a first hit policy', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [
        {
          ...baseBundle.tables[0],
          rows: [
            { ...baseBundle.tables[0].rows[0], capabilityIds: [] },
            { ...baseBundle.tables[0].rows[0], rowId: 'row-2', severity: 'caution', capabilityIds: [], when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true } },
          ],
        },
      ],
    });
    expect(diagnostics.some((d) => d.code === 'unreachable-row')).toBe(true);
    const unreachable = diagnostics.find((d) => d.code === 'unreachable-row');
    expect(unreachable?.rowId).toBe('row-2');
    expect(unreachable?.severity).toBe('error');
  });

  it('detects a fully shadowed narrower row under first hit policy', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          { ...baseBundle.tables[0].rows[0], capabilityIds: [] },
          { ...baseBundle.tables[0].rows[0], rowId: 'row-2', severity: 'caution', capabilityIds: [], when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true } },
        ],
      }],
    });
    expect(diagnostics.find((diagnostic) => diagnostic.code === 'unreachable-row')?.severity).toBe('error');
  });

  it('does not treat a contradictory prior row as shadowing later rows', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          {
            ...baseBundle.tables[0].rows[0],
            when: {
              kind: 'all',
              expressions: [
                { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
                { kind: 'fact_equals', factId: 'synthetic-fact', value: false },
              ],
            },
          },
          { ...baseBundle.tables[0].rows[0], rowId: 'row-2', when: { kind: 'fact_equals', factId: 'synthetic-fact', value: true } },
        ],
      }],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'unreachable-row')).toBe(false);
  });

  it('does not prove implication when the prior condition may be unknown', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          { ...baseBundle.tables[0].rows[0], when: { kind: 'fact_exists', factId: 'f-prior' } },
          {
            ...baseBundle.tables[0].rows[0],
            rowId: 'row-2',
            when: { kind: 'fact_equals', factId: 'f-candidate', value: true },
          },
        ],
      }],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'unreachable-row')).toBe(false);
  });

  it('keeps later hard blocks reachable through the unresolved first-row fallback', () => {
    const row = {
      ...baseBundle.tables[0].rows[0],
      when: { kind: 'fact_exists', factId: 'f-ready' } as const,
    };
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [row, { ...row, rowId: 'row-2' }],
      }],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'unreachable-row')).toBe(false);
  });

  it('flags overlapping cells under a unique hit policy', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [
        {
          ...baseBundle.tables[0],
          hitPolicy: 'unique',
          rows: [
            baseBundle.tables[0].rows[0],
            { ...baseBundle.tables[0].rows[0], rowId: 'row-2' },
          ],
        },
      ],
    });
    expect(diagnostics.some((d) => d.code === 'overlapping-cells-unique')).toBe(true);
    const overlap = diagnostics.find((d) => d.code === 'overlapping-cells-unique');
    expect(overlap?.severity).toBe('error');
    expect(overlap?.rowId).toBe('row-2');
  });

  it('flags a hard capability conflict (required and excluded)', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      constraints: [
        {
          ruleId: 'synthetic-constraint-include',
          version: '1',
          when: { kind: 'fact_exists', factId: 'synthetic-fact' },
          effects: [{ kind: 'include_candidate', candidateId: 'synthetic-product' }],
          severity: 'hard',
          capabilityIds: ['synthetic-capability'],
          claimIds: ['claim-1'],
          evidenceIds: ['evidence-1'],
        },
        {
          ruleId: 'synthetic-constraint-exclude',
          version: '1',
          when: { kind: 'fact_exists', factId: 'synthetic-fact' },
          effects: [{ kind: 'exclude_candidate', candidateId: 'synthetic-product', reasonCode: 'synthetic' }],
          severity: 'hard',
          capabilityIds: ['synthetic-capability'],
          claimIds: ['claim-1'],
          evidenceIds: ['evidence-1'],
        },
      ],
      requiredFixtures: [
        ...baseBundle.requiredFixtures,
        { ruleId: 'synthetic-constraint-include', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
        { ruleId: 'synthetic-constraint-exclude', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
      ],
    });
    expect(diagnostics.some((d) => d.code === 'hard-capability-conflict')).toBe(true);
    const conflict = diagnostics.find((d) => d.code === 'hard-capability-conflict');
    expect(conflict?.severity).toBe('error');
  });

  it('does not report a hard conflict when capability validity windows do not overlap', () => {
    const includeCapability = {
      ...capability,
      capabilityId: 'capability-include',
      claimId: 'claim-include',
      evidenceIds: ['evidence-include'],
      reviewedAt: '2026-11-01T00:00:00.000Z',
      expiresAt: '2026-11-02T00:00:00.000Z',
    } as const;
    const excludeCapability = {
      ...capability,
      capabilityId: 'capability-exclude',
      claimId: 'claim-exclude',
      evidenceIds: ['evidence-exclude'],
      reviewedAt: '2026-11-02T00:00:00.000Z',
      expiresAt: '2026-11-03T00:00:00.000Z',
    } as const;
    const diagnostics = analyzeRules({
      ...baseBundle,
      capabilities: [...baseBundle.capabilities, includeCapability, excludeCapability],
      constraints: [
        {
          ruleId: 'include-windowed', version: '1',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'include_candidate', candidateId: 'synthetic-product' }],
          severity: 'hard', capabilityIds: ['capability-include'], claimIds: ['claim-include'], evidenceIds: ['evidence-include'],
        },
        {
          ruleId: 'exclude-windowed', version: '1',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'exclude_candidate', candidateId: 'synthetic-product', reasonCode: 'synthetic' }],
          severity: 'hard', capabilityIds: ['capability-exclude'], claimIds: ['claim-exclude'], evidenceIds: ['evidence-exclude'],
        },
      ],
      requiredFixtures: [
        ...baseBundle.requiredFixtures,
        { ruleId: 'include-windowed', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
        { ruleId: 'exclude-windowed', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
      ],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'hard-capability-conflict')).toBe(false);
  });

  it('keeps hard conflicts when capability validity windows overlap', () => {
    const includeCapability = {
      ...capability,
      capabilityId: 'capability-include',
      claimId: 'claim-include',
      evidenceIds: ['evidence-include'],
      reviewedAt: '2026-11-01T00:00:00.000Z',
      expiresAt: '2026-11-10T00:00:00.000Z',
    } as const;
    const excludeCapability = {
      ...capability,
      capabilityId: 'capability-exclude',
      claimId: 'claim-exclude',
      evidenceIds: ['evidence-exclude'],
      reviewedAt: '2026-11-09T00:00:00.000Z',
      expiresAt: '2026-11-12T00:00:00.000Z',
    } as const;
    const diagnostics = analyzeRules({
      ...baseBundle,
      capabilities: [...baseBundle.capabilities, includeCapability, excludeCapability],
      constraints: [
        {
          ruleId: 'include-windowed', version: '1',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'include_candidate', candidateId: 'synthetic-product' }],
          severity: 'hard', capabilityIds: ['capability-include'], claimIds: ['claim-include'], evidenceIds: ['evidence-include'],
        },
        {
          ruleId: 'exclude-windowed', version: '1',
          when: { kind: 'fact_exists', factId: 'f-ready' },
          effects: [{ kind: 'exclude_candidate', candidateId: 'synthetic-product', reasonCode: 'synthetic' }],
          severity: 'hard', capabilityIds: ['capability-exclude'], claimIds: ['claim-exclude'], evidenceIds: ['evidence-exclude'],
        },
      ],
      requiredFixtures: [
        ...baseBundle.requiredFixtures,
        { ruleId: 'include-windowed', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
        { ruleId: 'exclude-windowed', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
      ],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'hard-capability-conflict')).toBe(true);
  });

  it('does not report hard conflicts between disjoint conditions', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      constraints: [
        {
          ruleId: 'include-ready', version: '1',
          when: { kind: 'fact_equals', factId: 'f-ready', value: true },
          effects: [{ kind: 'include_candidate', candidateId: 'synthetic-product' }],
          severity: 'hard', capabilityIds: [], claimIds: ['claim-1'], evidenceIds: ['evidence-1'],
        },
        {
          ruleId: 'exclude-not-ready', version: '1',
          when: { kind: 'fact_equals', factId: 'f-ready', value: false },
          effects: [{ kind: 'exclude_candidate', candidateId: 'synthetic-product', reasonCode: 'synthetic' }],
          severity: 'hard', capabilityIds: [], claimIds: ['claim-1'], evidenceIds: ['evidence-1'],
        },
      ],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'hard-capability-conflict')).toBe(false);
  });

  it('does not treat not fact-exists as matching an absent fact', () => {
    const condition = { kind: 'not', expression: { kind: 'fact_exists', factId: 'f-optional' } } as const;
    expect(evaluateExpression(condition, new Map()).value).toBe('unknown');
    const diagnostics = analyzeRules({
      ...baseBundle,
      constraints: [
        {
          ruleId: 'include-when-absent', version: '1',
          when: condition,
          effects: [{ kind: 'include_candidate', candidateId: 'synthetic-product' }],
          severity: 'hard', capabilityIds: [], claimIds: ['claim-1'], evidenceIds: ['evidence-1'],
        },
        {
          ruleId: 'exclude-when-independent-fact', version: '1',
          when: { kind: 'fact_exists', factId: 'f-independent' },
          effects: [{ kind: 'exclude_candidate', candidateId: 'synthetic-product', reasonCode: 'synthetic' }],
          severity: 'hard', capabilityIds: [], claimIds: ['claim-1'], evidenceIds: ['evidence-1'],
        },
      ],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'hard-capability-conflict')).toBe(false);
  });

  it.each([
    ['not', { kind: 'not', expression: { kind: 'fact_equals', factId: 'synthetic-fact', value: true } }],
    ['any', { kind: 'any', expressions: [
      { kind: 'fact_equals', factId: 'synthetic-fact', value: true },
      { kind: 'fact_equals', factId: 'synthetic-other-fact', value: true },
    ] }],
  ] as const)('flags identical %s expressions as unreachable in first-hit tables', (_kind, expression) => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          { ...baseBundle.tables[0].rows[0], capabilityIds: [], when: expression },
          { ...baseBundle.tables[0].rows[0], rowId: 'row-2', severity: 'caution', capabilityIds: [], when: expression },
        ],
      }],
    });
    expect(diagnostics.find((diagnostic) => diagnostic.code === 'unreachable-row')?.rowId).toBe('row-2');
  });

  it('flags a row implied by a prior any expression as unreachable', () => {
    const p = { kind: 'fact_equals', factId: 'synthetic-fact', value: true } as const;
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [
          { ...baseBundle.tables[0].rows[0], capabilityIds: [], when: { kind: 'any', expressions: [p, { kind: 'fact_exists', factId: 'synthetic-other-fact' }] } },
          { ...baseBundle.tables[0].rows[0], rowId: 'row-2', severity: 'caution', capabilityIds: [], when: p },
        ],
      }],
    });
    expect(diagnostics.find((diagnostic) => diagnostic.code === 'unreachable-row')?.rowId).toBe('row-2');
  });

  it('rejects effects that belong to different pipeline stages', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [{
          ...baseBundle.tables[0].rows[0],
          effects: [
            { kind: 'include_candidate', candidateId: 'synthetic-product' },
            { kind: 'require_prerequisite', prerequisiteId: 'synthetic-prerequisite' },
          ],
        }],
      }],
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === 'cross-stage-effects')).toBe(true);
  });

  it('flags a hard rule without required fixtures', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      requiredFixtures: [],
    });
    expect(diagnostics.some((d) => d.code === 'missing-fixture')).toBe(true);
    const missing = diagnostics.find((d) => d.code === 'missing-fixture');
    expect(missing?.severity).toBe('error');
    expect(missing?.ruleId).toBe('synthetic-table::row-1');
  });

  it('returns diagnostics typed as RuleDiagnostic', () => {
    const diagnostics = analyzeRules(baseBundle);
    expect(diagnostics).toBeInstanceOf(Array);
    for (const diagnostic of diagnostics) {
      expect(typeof diagnostic.code).toBe('string');
      expect(['error', 'warning', 'info']).toContain(diagnostic.severity);
      expect(typeof diagnostic.messageKey).toBe('string');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { analyzeRules } from '../../../packages/engine/src/rules/index.js';

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

  it('flags unreachable rows under a first hit policy', () => {
    const diagnostics = analyzeRules({
      ...baseBundle,
      tables: [
        {
          ...baseBundle.tables[0],
          rows: [
            baseBundle.tables[0].rows[0],
            { ...baseBundle.tables[0].rows[0], rowId: 'row-2' },
          ],
        },
      ],
    });
    expect(diagnostics.some((d) => d.code === 'unreachable-row')).toBe(true);
    const unreachable = diagnostics.find((d) => d.code === 'unreachable-row');
    expect(unreachable?.rowId).toBe('row-2');
    expect(unreachable?.severity).toBe('warning');
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

import { describe, expect, it } from 'vitest';
import {
  authoringDiagnostics,
  parseAuthoringBundle,
  type RuleAuthoringBundle,
} from '../../../packages/engine/src/rules/index.js';

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

const baseBundle: RuleAuthoringBundle = {
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
      ],
    },
  ],
  constraints: [],
  requiredFixtures: [
    { ruleId: 'synthetic-table::row-1', positiveFixtureIds: ['fx-pos'], negativeFixtureIds: ['fx-neg'] },
  ],
};

describe('authoring schema', () => {
  it('parses a valid authoring bundle', () => {
    const parsed = parseAuthoringBundle(baseBundle);
    expect(parsed.bundleId).toBe('synthetic-bundle');
    expect(parsed.tables).toHaveLength(1);
  });

  it('rejects a capability-bound row whose use scope differs from the reviewed binding', () => {
    expect(() => parseAuthoringBundle({
      ...baseBundle,
      tables: [{
        ...baseBundle.tables[0],
        rows: [{ ...baseBundle.tables[0].rows[0], useScope: 'synthetic-leave-in-use' }],
      }],
    })).toThrow(/exactly matches every reviewed capability binding/);
  });

  it('rejects a missing bundle id', () => {
    expect(() =>
      parseAuthoringBundle({ ...baseBundle, bundleId: '' }),
    ).toThrow();
  });

  it('rejects an unsupported hit policy', () => {
    expect(() =>
      parseAuthoringBundle({
        ...baseBundle,
        tables: [{ ...baseBundle.tables[0], hitPolicy: 'all' as const }],
      }),
    ).toThrow();
  });

  it('rejects an unsupported effect kind', () => {
    expect(() =>
      parseAuthoringBundle({
        ...baseBundle,
        tables: [
          {
            ...baseBundle.tables[0],
            rows: [
              {
                ...baseBundle.tables[0].rows[0],
                effects: [{ kind: 'run_code', code: 'unsafe' } as any],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('requires claim and evidence references on rows', () => {
    expect(() =>
      parseAuthoringBundle({
        ...baseBundle,
        tables: [
          {
            ...baseBundle.tables[0],
            rows: [
              {
                ...baseBundle.tables[0].rows[0],
                evidenceIds: [],
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('detects duplicate table ids', () => {
    const problems = authoringDiagnostics({
      ...baseBundle,
      tables: [baseBundle.tables[0], { ...baseBundle.tables[0] }],
    });
    expect(problems.some((p) => p.code === 'duplicate-table-id')).toBe(true);
  });

  it('detects duplicate row ids within a table', () => {
    const problems = authoringDiagnostics({
      ...baseBundle,
      tables: [
        {
          ...baseBundle.tables[0],
          rows: [baseBundle.tables[0].rows[0], { ...baseBundle.tables[0].rows[0] }],
        },
      ],
    });
    expect(problems.some((p) => p.code === 'duplicate-row-id')).toBe(true);
  });

  it('detects duplicate constraint versions', () => {
    const constraint = {
      ruleId: 'synthetic-constraint',
      version: '1',
      when: { kind: 'fact_exists', factId: 'synthetic-fact' },
      effects: [{ kind: 'block', reasonCode: 'synthetic' }],
      useScope: 'synthetic-routine-use',
      severity: 'hard',
      capabilityIds: ['synthetic-capability'],
      claimIds: ['claim-1'],
      evidenceIds: ['evidence-1'],
    } as const;
    const problems = authoringDiagnostics({
      ...baseBundle,
      constraints: [constraint, { ...constraint }],
    });
    expect(problems.some((p) => p.code === 'duplicate-constraint-version')).toBe(true);
  });
});

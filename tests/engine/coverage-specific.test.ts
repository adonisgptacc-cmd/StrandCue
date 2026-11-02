import { describe, expect, it } from 'vitest';
import type { RuleExpression, SnapshotFact } from '../../packages/engine/src/contracts.js';
import { CanonicalSnapshotSchema, ENGINE_STAGE_IDS, EngineDecisionSchema, RuleExpressionSchema } from '../../packages/engine/src/contracts.js';
import type { FactResolution, ResolvedFact } from '../../packages/engine/src/pipeline/state.js';
import { collectFactIds, evaluateExpression, isBlockingResolution } from '../../packages/engine/src/pipeline/evaluate-expression.js';
import { analyzeRules } from '../../packages/engine/src/rules/analyze-rules.js';

const fact = (factId: string, value: string | number | boolean): ResolvedFact => ({
  factId,
  resolution: 'verified',
  fact: { factId, value } as SnapshotFact,
});

const unresolvedFact = (factId: string, resolution: FactResolution): ResolvedFact => ({
  factId,
  resolution,
  fact: undefined,
});

const equals = (factId: string, value: string | number | boolean): RuleExpression => ({
  kind: 'fact_equals',
  factId,
  value,
});

describe('engine expression coverage', () => {
  it('evaluates verified equality, membership and existence conditions', () => {
    const facts = new Map([fact('f-ready', true), fact('f-level', 'high')].map((entry) => [entry.factId, entry]));

    expect(evaluateExpression(equals('f-ready', true), facts)).toEqual({ value: 'true', issues: [] });
    expect(evaluateExpression(equals('f-ready', false), facts)).toEqual({ value: 'false', issues: [] });
    expect(evaluateExpression({ kind: 'fact_in', factId: 'f-level', values: ['low', 'high'] }, facts).value).toBe('true');
    expect(evaluateExpression({ kind: 'fact_in', factId: 'f-level', values: ['low'] }, facts).value).toBe('false');
    expect(evaluateExpression({ kind: 'fact_exists', factId: 'f-ready' }, facts).value).toBe('true');
  });

  it('preserves unresolved fact reasons through negation and boolean expressions', () => {
    const facts = new Map([
      unresolvedFact('f-expired', 'expired'),
      unresolvedFact('f-missing', 'missing'),
      unresolvedFact('f-unknown', 'unknown'),
      unresolvedFact('f-withdrawn', 'withdrawn'),
      unresolvedFact('f-conflict', 'contradictory'),
    ].map((entry) => [entry.factId, entry]));

    expect(evaluateExpression(equals('f-absent', 'x'), facts)).toEqual({
      value: 'unknown', issues: [{ factId: 'f-absent', resolution: 'missing' }],
    });
    expect(evaluateExpression({ kind: 'fact_exists', factId: 'f-expired' }, facts).issues).toEqual([
      { factId: 'f-expired', resolution: 'expired' },
    ]);
    expect(evaluateExpression({ kind: 'not', expression: equals('f-unknown', 'x') }, facts)).toEqual({
      value: 'unknown', issues: [{ factId: 'f-unknown', resolution: 'unknown' }],
    });
    expect(evaluateExpression({
      kind: 'all', expressions: [equals('f-expired', 'x'), equals('f-withdrawn', 'x'), equals('f-conflict', 'x')],
    }, facts)).toEqual({
      value: 'unknown',
      issues: [
        { factId: 'f-conflict', resolution: 'contradictory' },
        { factId: 'f-expired', resolution: 'expired' },
        { factId: 'f-withdrawn', resolution: 'withdrawn' },
      ],
    });
  });

  it('short circuits decisive boolean results and returns open results with sorted, deduplicated issues', () => {
    const facts = new Map([
      fact('f-no', false), fact('f-yes', true),
      unresolvedFact('f-open', 'expired'), unresolvedFact('f-open', 'withdrawn'),
    ].map((entry) => [entry.factId, entry]));
    const open = equals('f-open', true);

    expect(evaluateExpression({ kind: 'all', expressions: [open, equals('f-no', true)] }, facts)).toEqual({
      value: 'false', issues: [],
    });
    expect(evaluateExpression({ kind: 'any', expressions: [open, equals('f-yes', true)] }, facts)).toEqual({
      value: 'true', issues: [],
    });
    expect(evaluateExpression({ kind: 'all', expressions: [open, open] }, facts)).toEqual({
      value: 'unknown', issues: [{ factId: 'f-open', resolution: 'withdrawn' }],
    });
    expect(evaluateExpression({ kind: 'any', expressions: [equals('f-no', true), equals('f-yes', false)] }, facts)).toEqual({
      value: 'false', issues: [],
    });
    expect(evaluateExpression({ kind: 'all', expressions: [equals('f-yes', true), equals('f-yes', true)] }, facts)).toEqual({
      value: 'true', issues: [],
    });
  });

  it('collects unique sorted fact identifiers and distinguishes blocking resolutions', () => {
    const expression: RuleExpression = {
      kind: 'all',
      expressions: [
        { kind: 'not', expression: equals('f-z', true) },
        { kind: 'any', expressions: [
          { kind: 'fact_in', factId: 'f-a', values: ['a'] },
          { kind: 'fact_exists', factId: 'f-z' },
        ] },
      ],
    };

    expect(collectFactIds(expression)).toEqual(['f-a', 'f-z']);
    expect(isBlockingResolution('withdrawn')).toBe(true);
    expect(isBlockingResolution('contradictory')).toBe(true);
    expect(isBlockingResolution('expired')).toBe(false);
    expect(isBlockingResolution('missing')).toBe(false);
  });
});

const decision = (status: 'decided' | 'needs_input') => ({
  status,
  steps: status === 'decided'
    ? [{ stepId: 's-1', actionId: 'a-1', labelKey: 'step', reasonCode: 'ready', ruleIds: [], claimIds: [], evidenceIds: [], prerequisiteIds: [] }]
    : [],
  omissions: [],
  alternatives: [],
  questions: status === 'needs_input'
    ? [{ questionId: 'q-1', rank: 1, reasonCode: 'missing', neededFactIds: ['f-1'] }]
    : [],
  confidence: { evidence: 'limited', applicability: 'limited' },
  audit: {
    ruleset: { rulesetId: 'r-1', contentHash: 'sha256:test', schemaVersion: '1', evaluatorVersion: '1' },
    evaluatedAt: '2026-11-01T00:00:00.000Z', schemaVersion: '1', evaluatorVersion: '1',
    trace: ENGINE_STAGE_IDS.map((stageId) => ({ stageId, outcome: 'completed', ruleIds: [], claimIds: [], evidenceIds: [] })),
  },
});

describe('engine schema and analyzer edge coverage', () => {
  it('parses nested expression forms and checks fact references across every snapshot collection', () => {
    expect(RuleExpressionSchema.safeParse({
      kind: 'any', expressions: [{ kind: 'not', expression: { kind: 'fact_exists', factId: 'f-1' } }],
    }).success).toBe(true);
    const factRegistry = [{
      factId: 'f-1', revision: 1, status: 'verified', value: true,
      evidenceIds: [], recordedAt: '2026-11-01T00:00:00.000Z',
    }];
    expect(CanonicalSnapshotSchema.safeParse({
      ownerScopeId: 'owner-1', factRegistry,
      passport: { entryId: 'passport-1', revision: 1, factIds: ['f-1'] },
      chemicalServiceHistory: [{ entryId: 'history-1', revision: 1, factIds: ['f-1'] }],
      shelf: [{ entryId: 'product-1', revision: 1, factIds: ['f-1'] }],
      tools: [{ entryId: 'tool-1', revision: 1, factIds: ['f-1'] }],
      eventHistory: [{ eventId: 'event-1', revision: 1, eventType: 'wash', happenedAt: '2026-11-01T00:00:00.000Z', factIds: ['f-1'] }],
      revisions: { passport: 1, chemicalServiceHistory: 1, shelf: 1, tools: 1, events: 1 },
    }).success).toBe(true);
  });

  it('rejects decisions that violate status-specific output and trace-order contracts', () => {
    expect(EngineDecisionSchema.safeParse({ ...decision('decided'), steps: [] }).success).toBe(false);
    expect(EngineDecisionSchema.safeParse({ ...decision('needs_input'), questions: [] }).success).toBe(false);
    const reversedTrace = [...decision('decided').audit.trace].reverse();
    expect(EngineDecisionSchema.safeParse({
      ...decision('decided'), audit: { ...decision('decided').audit, trace: reversedTrace },
    }).success).toBe(false);
  });

  it('covers supported existence and equality domains and proves unique rows disjoint', () => {
    const row = (rowId: string, when: RuleExpression) => ({
      rowId, when, effects: [{ kind: 'block' as const, reasonCode: 'stop' }], severity: 'hard' as const,
      capabilityIds: [], claimIds: ['claim'], evidenceIds: ['evidence'],
    });
    const bundle = (hitPolicy: 'first' | 'unique', rows: ReturnType<typeof row>[]) => ({
      bundleId: 'b-1', version: '1', capabilities: [],
      tables: [{ tableId: 't-1', hitPolicy, rows }], constraints: [], requiredFixtures: [],
    });

    expect(analyzeRules(bundle('first', [
      row('exists', { kind: 'fact_exists', factId: 'f-1' }),
      row('equality', { kind: 'fact_equals', factId: 'f-1', value: true }),
    ])).some(({ code }) => code === 'unreachable-row')).toBe(true);
    expect(analyzeRules(bundle('first', [
      row('equality', { kind: 'fact_equals', factId: 'f-1', value: true }),
      row('exists', { kind: 'fact_exists', factId: 'f-1' }),
    ])).some(({ code }) => code === 'unreachable-row')).toBe(false);
    expect(analyzeRules(bundle('unique', [
      row('true', { kind: 'fact_equals', factId: 'f-1', value: true }),
      row('false', { kind: 'fact_equals', factId: 'f-1', value: false }),
    ])).some(({ code }) => code === 'overlapping-cells-unique')).toBe(false);
    expect(analyzeRules(bundle('first', [
      row('conjunction', { kind: 'all', expressions: [
        { kind: 'fact_equals', factId: 'f-1', value: true },
        { kind: 'fact_equals', factId: 'f-2', value: false },
      ] }),
      row('different', { kind: 'fact_equals', factId: 'f-3', value: true }),
    ])).some(({ code }) => code === 'unreachable-row')).toBe(false);
  });
});

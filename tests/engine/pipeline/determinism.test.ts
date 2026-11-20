import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import type { EngineInput } from '../../../packages/engine/src/index.js';
import { buildInput, capability, fact, include, rule } from './fixtures.js';

const rich = (): EngineInput => buildInput({
  facts: [fact('f-ready', true), fact('f-b', 'x'), fact('f-a', 'y'), fact('f-unknown', null, { status: 'unknown' })],
  shelf: ['prod-b', 'prod-a', 'prod-synthetic'],
  tools: ['tool-2', 'tool-1'],
  events: [
    { eventId: 'e2', eventType: 'wash', happenedAt: '2026-10-10T00:00:00.000Z' },
    { eventId: 'e1', eventType: 'wash', happenedAt: '2026-10-20T00:00:00.000Z' },
  ],
  capabilities: [capability('cap-2', { subjectId: 'prod-b' }), capability('cap-1', { subjectId: 'prod-a' })],
  rules: [
    rule('r-3', 'load_verified_facts', [include('cand-3')]),
    rule('r-1', 'load_verified_facts', [include('cand-1')]),
    rule('r-2', 'load_verified_facts', [include('cand-2')], { capabilityIds: ['cap-1'], claimIds: ['claim-cap-1', 'claim-r-2'], evidenceIds: ['ev-cap-1', 'ev-r-2'] }),
    rule('r-pre', 'build_dependency_graph', [{ kind: 'require_prerequisite', prerequisiteId: 'cand-3' }]),
    rule('r-wait', 'build_dependency_graph', [{ kind: 'insert_wait', afterActionId: 'cand-3', minutes: 4 }]),
    rule('r-heat', 'evaluate_heat', [{ kind: 'set_heat_assessment', state: 'lower_heat' }]),
    rule('r-soft', 'filter_candidates', [{ kind: 'exclude_candidate', candidateId: 'cand-9', reasonCode: 'x' }], { severity: 'caution' }),
  ],
});

const reordered = (input: EngineInput): EngineInput => ({
  ...input,
  snapshot: {
    ...input.snapshot,
    factRegistry: [...input.snapshot.factRegistry].reverse(),
    shelf: [...input.snapshot.shelf].reverse(),
    tools: [...input.snapshot.tools].reverse(),
    eventHistory: [...input.snapshot.eventHistory].reverse(),
  },
  ruleset: {
    ...input.ruleset,
    capabilities: [...input.ruleset.capabilities].reverse(),
    rules: [...input.ruleset.rules].reverse().map((rule) => ({ ...rule, effects: [...rule.effects] })),
    ref: {
      ...input.ruleset.ref,
      contentHash: canonicalRulesetContentHash({
        capabilities: [...input.ruleset.capabilities].reverse(),
        rules: [...input.ruleset.rules].reverse().map((rule) => ({ ...rule, effects: [...rule.effects] })),
      }),
    },
  },
});

describe('determinism', () => {
  it('returns identical decisions for identical input', () => {
    expect(evaluateDecision(rich())).toEqual(evaluateDecision(rich()));
  });

  it('does not change when input arrays are reordered', () => {
    const decision = evaluateDecision(rich());
    expect(decision.status).toBe('decided');
    const reorderedDecision = evaluateDecision(reordered(rich()));
    expect(reorderedDecision.audit.ruleset.contentHash).not.toBe(decision.audit.ruleset.contentHash);
    expect({ ...reorderedDecision, audit: { ...reorderedDecision.audit, ruleset: { ...reorderedDecision.audit.ruleset, contentHash: decision.audit.ruleset.contentHash } } }).toEqual(decision);
  });

  it('does not mutate its input', () => {
    const input = rich();
    const before = JSON.stringify(input);
    evaluateDecision(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('is unaffected by facts and records that no rule references', () => {
    const decision = evaluateDecision(rich());
    const noisy = rich();
    const withNoise: EngineInput = {
      ...noisy,
      snapshot: { ...noisy.snapshot, factRegistry: [...noisy.snapshot.factRegistry, fact('f-irrelevant', 'noise')] },
    };
    expect(evaluateDecision(withNoise)).toEqual(decision);
  });

  it('changes only through the evaluation time when a fact expires', () => {
    const input = buildInput({
      facts: [fact('f-ready', true, { expiresAt: '2026-11-15T00:00:00.000Z' })],
      rules: [rule('r-a', 'load_verified_facts', [include('cand-a')])],
    });
    expect(evaluateDecision(input).status).toBe('decided');
    expect(evaluateDecision({ ...input, evaluatedAt: '2026-11-16T00:00:00.000Z' }).status).toBe('needs_input');
  });

  it('keeps a stored decision unchanged when later history is added (stale decisions are not rewritten)', () => {
    const input = rich();
    const stored = JSON.stringify(evaluateDecision(input));
    const later: EngineInput = {
      ...input,
      snapshot: {
        ...input.snapshot,
        eventHistory: [...input.snapshot.eventHistory, { eventId: 'e3', revision: 1, eventType: 'wash', happenedAt: '2026-10-30T00:00:00.000Z', factIds: [] }],
      },
    };
    evaluateDecision(later);
    expect(JSON.stringify(evaluateDecision(input))).toBe(stored);
  });
});

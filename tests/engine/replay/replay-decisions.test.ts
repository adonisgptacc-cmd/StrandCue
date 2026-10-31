import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../../packages/engine/src/pipeline/index.js';
import type { CompiledRule, EngineInput } from '../../../packages/engine/src/index.js';
import { ReplayCaseSchema, replayDecisions } from '../../../packages/engine/src/replay/index.js';
import type { ReplayCase } from '../../../packages/engine/src/replay/index.js';
import { buildInput, canonicalJson, exclude, include, rule } from '../fixtures/synthetic.js';

const baseRules = (): CompiledRule[] => [
  rule('r-include-rinse', 'load_verified_facts', [include('cand-rinse')]),
  rule('r-include-wait', 'load_verified_facts', [include('cand-wait')]),
];

const historicalCase = (caseId: string, rules: CompiledRule[]): ReplayCase => {
  const input: EngineInput = buildInput({ rules, rulesetId: 'synthetic-ruleset-pinned', contentHash: 'sha256:synthetic-pinned' });
  return ReplayCaseSchema.parse({ caseId, input, decision: evaluateDecision(input) });
};

const candidateRuleset = (rules: CompiledRule[]): EngineInput['ruleset'] => ({
  ref: {
    rulesetId: 'synthetic-ruleset-candidate',
    contentHash: 'sha256:synthetic-candidate',
    schemaVersion: '1.0.0',
    evaluatorVersion: '1.0.0',
  },
  capabilities: [],
  rules,
});

describe('replayDecisions', () => {
  it('reproduces a historical decision exactly from its own pinned ruleset', () => {
    const replayCase = historicalCase('case-pinned', baseRules());
    const report = replayDecisions([replayCase], candidateRuleset(baseRules()));

    expect(report.cases).toHaveLength(1);
    expect(report.cases[0].pinnedReplayReproduced).toBe(true);
    expect(report.cases[0].pinnedRulesetHash).toBe('sha256:synthetic-pinned');
  });

  it('reports no change when the candidate ruleset decides the same thing', () => {
    const replayCase = historicalCase('case-stable', baseRules());
    const report = replayDecisions([replayCase], candidateRuleset(baseRules()));

    expect(report.changedCaseIds).toEqual([]);
    expect(report.cases[0].changed).toBe(false);
    expect(report.cases[0].statusChanged).toBe(false);
    expect(report.cases[0].addedStepIds).toEqual([]);
    expect(report.cases[0].removedStepIds).toEqual([]);
  });

  it('records the candidate ruleset hash and keeps the pinned hash as a stable reference', () => {
    const replayCase = historicalCase('case-hashes', baseRules());
    const report = replayDecisions([replayCase], candidateRuleset(baseRules()));

    expect(report.candidateRulesetId).toBe('synthetic-ruleset-candidate');
    expect(report.candidateRulesetHash).toBe('sha256:synthetic-candidate');
    expect(report.cases[0].candidateRulesetHash).toBe('sha256:synthetic-candidate');
    expect(report.cases[0].pinnedRulesetHash).toBe('sha256:synthetic-pinned');
  });

  it('reports the exact decision change when a candidate ruleset tightens a restriction', () => {
    const replayCase = historicalCase('case-tightened', baseRules());
    const tightened = [...baseRules(), rule('r-exclude-wait', 'filter_candidates', [exclude('cand-wait')])];
    const report = replayDecisions([replayCase], candidateRuleset(tightened));

    const outcome = report.cases[0];
    expect(outcome.changed).toBe(true);
    expect(report.changedCaseIds).toEqual(['case-tightened']);
    expect(outcome.removedStepIds).toEqual(['step:cand-wait']);
    expect(outcome.addedStepIds).toEqual([]);
    expect(outcome.addedOmissionCandidateIds).toEqual(['cand-wait']);
    expect(outcome.statusChanged).toBe(false);
    expect(outcome.previousStatus).toBe('decided');
    expect(outcome.candidateStatus).toBe('decided');
  });

  it('reports a status change when the candidate ruleset blocks what was previously decided', () => {
    const replayCase = historicalCase('case-blocked', baseRules());
    const blocked = [...baseRules(), rule('r-block', 'apply_safety_restrictions', [{ kind: 'block', reasonCode: 'synthetic_blocked' }])];
    const report = replayDecisions([replayCase], candidateRuleset(blocked));

    const outcome = report.cases[0];
    expect(outcome.changed).toBe(true);
    expect(outcome.statusChanged).toBe(true);
    expect(outcome.previousStatus).toBe('decided');
    expect(outcome.candidateStatus).toBe('blocked');
    expect(outcome.removedStepIds).toEqual(['step:cand-rinse', 'step:cand-wait']);
  });

  it('does not modify the historical snapshot or the stored decision', () => {
    const replayCase = historicalCase('case-immutable', baseRules());
    const inputBefore = canonicalJson(replayCase.input);
    const decisionBefore = canonicalJson(replayCase.decision);

    replayDecisions([replayCase], candidateRuleset([...baseRules(), rule('r-exclude-wait', 'filter_candidates', [exclude('cand-wait')])]));

    expect(canonicalJson(replayCase.input)).toBe(inputBefore);
    expect(canonicalJson(replayCase.decision)).toBe(decisionBefore);
  });

  it('returns an empty report when there is nothing to replay', () => {
    const report = replayDecisions([], candidateRuleset(baseRules()));

    expect(report.cases).toEqual([]);
    expect(report.changedCaseIds).toEqual([]);
    expect(report.candidateRulesetHash).toBe('sha256:synthetic-candidate');
  });

  it('replays every case in the order it was given', () => {
    const report = replayDecisions(
      [historicalCase('case-a', baseRules()), historicalCase('case-b', baseRules())],
      candidateRuleset(baseRules()),
    );

    expect(report.cases.map((entry) => entry.caseId)).toEqual(['case-a', 'case-b']);
  });

  it('performs no filesystem or network work', () => {
    const moduleDirectory = new URL('../../../packages/engine/src/replay/', import.meta.url);
    const sources = readdirSync(moduleDirectory)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => readFileSync(new URL(name, moduleDirectory), 'utf8'))
      .join('\n');

    expect(sources).not.toMatch(/node:fs|node:http|node:net|node:https/);
    expect(sources).not.toMatch(/\bfetch\s*\(/);
    expect(sources).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(sources).not.toMatch(/Date\.now|new Date\(/);
    expect(sources).not.toMatch(/Math\.random/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ENGINE_STAGE_IDS,
  analyzeRules,
  authoringDiagnostics,
  compileRules,
  evaluateDecision,
  parseAuthoringBundle,
  replayDecisions,
} from '../../packages/engine/src/index.js';
import { buildInput, include, rule } from './pipeline/fixtures.js';

describe('@strandcue/engine package root', () => {
  it('exports runtime values, not just types', () => {
    const exported = { evaluateDecision, compileRules, analyzeRules, parseAuthoringBundle, authoringDiagnostics, replayDecisions };
    Object.entries(exported).forEach(([name, value]) => expect(typeof value, name).toBe('function'));
  });

  it('evaluates a decision through the public entry point', () => {
    const decision = evaluateDecision(buildInput({ rules: [rule('r-a', 'load_verified_facts', [include('cand-a')])] }));
    expect(decision.status).toBe('decided');
    expect(decision.audit.trace.map((entry) => entry.stageId)).toEqual([...ENGINE_STAGE_IDS]);
  });
});

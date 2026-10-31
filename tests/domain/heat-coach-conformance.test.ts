import { describe, expect, it } from 'vitest';

import {
  HeatCoachDecisionSchema,
  HeatCoachInputSchema,
  HeatRulePublicationSchema,
  evaluateHeatCoach,
} from '../../packages/domain/src/heat-coach.ts';
import { conformance, resolveConformanceCase } from '../fixtures/heat-coach-conformance.ts';

const FIXTURES = conformance as {
  baselineInput: unknown;
  baselinePublication: unknown;
  cases: {
    name: string;
    state: string;
    necessity?: string;
    reasonCode?: string;
    destination?: string;
    alternativesContain?: string;
    input?: unknown;
    publication?: unknown;
  }[];
};

describe('Heat Coach domain/database conformance fixtures (shared contract)', () => {
  it.each(FIXTURES.cases.map(c => [c.name]))('domain decides %s', name => {
    const c = FIXTURES.cases.find(item => item.name === name)!;
    const resolved = resolveConformanceCase(c);
    const input = HeatCoachInputSchema.parse(resolved.input);
    const publication = HeatRulePublicationSchema.parse(resolved.publication);
    const decision = evaluateHeatCoach(input, publication);
    HeatCoachDecisionSchema.parse(decision);
    expect(decision.state).toBe(c.state);
    if (c.necessity !== undefined) expect(decision.necessity).toBe(c.necessity);
    if (c.reasonCode !== undefined) expect(decision.reasons[0]?.reasonCode).toBe(c.reasonCode);
    if (c.destination !== undefined) {
      expect(decision.missing.map(item => item.destination)).toContain(c.destination);
    }
    if (c.alternativesContain !== undefined) {
      expect(decision.alternatives.some(item => item.copyKey === c.alternativesContain)).toBe(true);
    }
  });
});

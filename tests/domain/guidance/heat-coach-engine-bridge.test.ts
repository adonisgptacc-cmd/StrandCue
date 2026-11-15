import { describe, expect, it } from 'vitest';

import {
  engineDecisionToHeatState,
  heatInputToEngineInput,
  heatPublicationToCompiledRuleset,
} from '../../../packages/domain/src/guidance/heat-coach-engine-bridge.ts';
import type { HeatCoachInput, HeatRulePublication } from '../../../packages/domain/src/heat-coach.ts';

const publication: HeatRulePublication = {
  schemaVersion: 1,
  publicationId: 'pub-11111111-1111-4111-8111-111111111111',
  ruleVersion: '1.0.0',
  digest: 'a'.repeat(64),
  lifecycle: 'reviewed',
  validFrom: '2026-10-01T00:00:00+02:00',
  validUntil: null,
  requiredProductCapability: null,
  allowedMethods: ['heated-air'],
  limits: {
    temperatures: [{ unit: 'C', maximum: 150 }],
    namedSettings: [],
    maximumPasses: 2,
    maximumDurationMinutes: 20,
  },
  necessityRules: [{ necessity: 'supports_goal', goals: ['basic_wash'], concerns: [] }],
  hardRestrictions: [
    {
      concerns: ['dryness'],
      servicePresence: null,
      zones: [],
      outcome: 'restricted',
      reasonCode: 'heat_restricted_dryness',
      copyKey: 'heat.restricted_dryness',
    },
  ],
  alternatives: [
    {
      method: 'unheated',
      temperature: null,
      setting: null,
      reasonCode: 'heat_alternative_unheated',
      copyKey: 'heat.alternative_unheated',
      toolVersionId: null,
      productVersionId: null,
    },
  ],
  reasonCode: 'heat.reviewed_match',
  copyKey: 'heat.reviewed_match',
};

const input: HeatCoachInput = {
  schemaVersion: 1,
  asOf: '2026-10-25T09:00:00+02:00',
  preparedInput: {
    schemaVersion: 1,
    goal: { id: 'basic_wash', label: 'Basic wash' },
    availableMinutes: 45,
    passport: { facts: {} },
    currentCondition: {
      observedAt: '2026-10-25T08:00:00+02:00',
      concerns: ['dryness'],
      explicitNone: false,
      zones: [{ region: 'whole-head', segment: 'entire-strand' }],
      zoneConcerns: [],
    },
    effectiveFacts: [],
    chemicalServices: [],
    heatHistory: [],
    activities: [],
    products: [
      {
        ownerItemId: 'prod-owner-1',
        name: 'Synthetic protection product',
        identity: 'exact',
        versionId: 'prod-ver-1',
        review: 'reviewed',
        verifiedCapabilities: ['heat-protection'],
        satisfiesExactCapability: true,
      },
    ],
    tools: [
      {
        ownerItemId: 'tool-owner-1',
        name: 'Synthetic dryer',
        identity: 'exact',
        versionId: 'tool-ver-1',
        review: 'reviewed',
        verifiedCapabilities: ['heat-tool'],
        satisfiesExactCapability: true,
        ownerFacts: {
          wattageWatts: 2200,
          adjustableTemp: 'yes',
          settings: { state: 'recorded', recordedTemperatures: [{ label: 'Low', value: 120, unit: 'C' }] },
          heatMethods: { state: 'recorded', methods: ['heated-air'] },
        },
      },
    ],
    completeness: {
      activities: 'complete',
      passport: 'complete',
      products: 'complete',
      services: 'complete',
      tools: 'complete',
    },
  },
  confirmedCareEvents: [],
  request: {
    method: { state: 'known', value: 'heated-air' },
    toolOwnerItemId: 'tool-owner-1',
    productOwnerItemId: 'prod-owner-1',
    temperature: { state: 'known', value: { value: 120, unit: 'C' } },
    setting: { state: 'known', value: 'Low' },
    passes: { state: 'known', value: 1 },
    durationMinutes: { state: 'known', value: 15 },
    zones: [{ region: 'whole_head', segment: 'entire_strand' }],
  },
};

describe('heat coach engine bridge', () => {
  it('compiles a publication into engine rules with restrictions, necessity, and alternatives', () => {
    const ruleset = heatPublicationToCompiledRuleset(publication);
    expect(ruleset.ref.rulesetId).toBe(publication.publicationId);
    expect(ruleset.ref.contentHash).toBe(`sha256:${publication.digest}`);
    expect(ruleset.rules).toHaveLength(3); // 1 restriction + 1 necessity + 1 alternative

    const restriction = ruleset.rules.find((r) => r.ruleId === 'heat-restriction:heat_restricted_dryness');
    expect(restriction).toBeDefined();
    expect(restriction!.stageId).toBe('apply_safety_restrictions');
    expect(restriction!.effects).toEqual([{ kind: 'block', reasonCode: 'heat_restricted_dryness' }]);

    const necessity = ruleset.rules.find((r) => r.ruleId === 'heat-necessity:supports_goal');
    expect(necessity).toBeDefined();
    expect(necessity!.stageId).toBe('evaluate_heat');
    expect(necessity!.effects).toEqual([{ kind: 'set_heat_assessment', state: 'appropriate' }]);

    const alternative = ruleset.rules.find((r) => r.ruleId === 'heat-alternative:heat_alternative_unheated');
    expect(alternative).toBeDefined();
    expect(alternative!.stageId).toBe('evaluate_heat');
    expect(alternative!.effects).toEqual([{ kind: 'include_candidate', candidateId: 'heat_alternative_unheated' }]);
  });

  it('converts heat input to engine input snapshot', () => {
    const ruleset = heatPublicationToCompiledRuleset(publication);
    const engineInput = heatInputToEngineInput(input, ruleset);

    expect(engineInput.evaluatedAt).toBe(input.asOf);
    expect(engineInput.snapshot.ownerScopeId).toBe('heat-coach-owner');
    expect(engineInput.snapshot.factRegistry.length).toBeGreaterThan(0);
    expect(engineInput.snapshot.shelf).toHaveLength(1);
    expect(engineInput.snapshot.tools).toHaveLength(1);
    expect(engineInput.snapshot.eventHistory).toHaveLength(0);
    expect(engineInput.ruleset).toBe(ruleset);

    // Concern fact is verified
    const concernFact = engineInput.snapshot.factRegistry.find((f) => f.factId === 'heat.condition.concern.dryness');
    expect(concernFact?.status).toBe('verified');
    expect(concernFact?.value).toBe(true);

    // Method fact is verified
    const methodFact = engineInput.snapshot.factRegistry.find((f) => f.factId === 'heat.request.method.heated-air');
    expect(methodFact?.status).toBe('verified');
  });

  it('maps engine outcomes to heat coach states correctly', () => {
    expect(engineDecisionToHeatState('decided', 'appropriate')).toBe('appropriate');
    expect(engineDecisionToHeatState('decided', 'lower_heat')).toBe('lower_heat');
    expect(engineDecisionToHeatState('decided', 'no_heat')).toBe('no_heat');
    expect(engineDecisionToHeatState('needs_input', 'needs_input')).toBe('needs_input');
    expect(engineDecisionToHeatState('blocked', 'restricted')).toBe('restricted');
    expect(engineDecisionToHeatState('blocked', 'content_pending')).toBe('content_pending');
    expect(engineDecisionToHeatState('no_protocol', 'unavailable')).toBe('unavailable');
  });

  it('rejects invalid status/heat combinations', () => {
    expect(engineDecisionToHeatState('decided', 'restricted')).toBeUndefined();
    expect(engineDecisionToHeatState('blocked', 'appropriate')).toBeUndefined();
    expect(engineDecisionToHeatState('needs_input', 'appropriate')).toBeUndefined();
    expect(engineDecisionToHeatState('no_protocol', 'content_pending')).toBeUndefined();
    expect(engineDecisionToHeatState('decided', undefined)).toBeUndefined();
  });
});

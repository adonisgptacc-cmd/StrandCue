import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import {
  HeatCoachDecisionSchema,
  HeatCoachInputSchema,
  HeatRulePublicationSchema,
  PreparedGuidanceInputSchema,
  evaluateHeatCoach,
} from '../../packages/domain/src/index.ts';

const TOOL_OWNER_ID = 'tool-owner-11111111-1111-4111-8111-111111111111';
const TOOL_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_OWNER_ID = 'product-owner-22222222-2222-4222-8222-222222222222';
const PRODUCT_VERSION_ID = '22222222-2222-4222-8222-222222222222';

function prepared(): z.input<typeof PreparedGuidanceInputSchema> {
  return {
    schemaVersion: 1 as const,
    goal: { id: 'basic_wash' as const, label: 'Basic wash' },
    availableMinutes: 45,
    passport: { facts: {} },
    currentCondition: {
      observedAt: '2026-10-25T08:00:00+02:00',
      concerns: ['dryness' as const],
      explicitNone: false,
      zones: [{ region: 'whole-head' as const, segment: 'entire-strand' as const }],
      zoneConcerns: [],
    },
    effectiveFacts: [],
    chemicalServices: [],
    heatHistory: [],
    activities: [],
    products: [{
      ownerItemId: PRODUCT_OWNER_ID,
      name: 'Synthetic protection product',
      identity: 'exact' as const,
      versionId: PRODUCT_VERSION_ID,
      review: 'reviewed' as const,
      verifiedCapabilities: ['heat-protection'],
      satisfiesExactCapability: true,
    }],
    tools: [{
      ownerItemId: TOOL_OWNER_ID,
      name: 'Synthetic dryer',
      identity: 'exact' as const,
      versionId: TOOL_VERSION_ID,
      review: 'reviewed' as const,
      verifiedCapabilities: ['heated-air'],
      satisfiesExactCapability: true,
      ownerFacts: {
        wattageWatts: 2200,
        adjustableTemp: 'yes' as const,
        settings: { state: 'recorded' as const, recordedTemperatures: [{ label: 'Low', value: 120, unit: 'C' as const }] },
        heatMethods: { state: 'recorded' as const, methods: ['heated-air'] },
      },
    }],
    completeness: { activities: 'complete' as const, passport: 'complete' as const, products: 'complete' as const, services: 'complete' as const, tools: 'complete' as const },
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    asOf: '2026-10-25T09:00:00+02:00',
    preparedInput: prepared(),
    confirmedCareEvents: [],
    request: {
      method: { state: 'known', value: 'heated-air' },
      toolOwnerItemId: TOOL_OWNER_ID,
      productOwnerItemId: PRODUCT_OWNER_ID,
      temperature: { state: 'known', value: { value: 120, unit: 'C' } },
      setting: { state: 'known', value: 'Low' },
      passes: { state: 'known', value: 1 },
      durationMinutes: { state: 'known', value: 15 },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
      ...overrides,
    },
  };
}

function publication(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    publicationId: '33333333-3333-4333-8333-333333333333',
    ruleVersion: '1.0.0',
    digest: 'a'.repeat(64),
    lifecycle: 'reviewed',
    validFrom: '2026-10-01T00:00:00+02:00',
    validUntil: null,
    requiredProductCapability: 'heat-protection',
    allowedMethods: ['heated-air'],
    limits: {
      temperatures: [{ unit: 'C', maximum: 150 }],
      namedSettings: [{ toolVersionId: TOOL_VERSION_ID, label: 'Low' }],
      maximumPasses: 2,
      maximumDurationMinutes: 20,
    },
    necessityRules: [{ necessity: 'supports_goal', goals: ['basic_wash'], concerns: [] }],
    hardRestrictions: [],
    alternatives: [{
      method: 'unheated',
      toolVersionId: null,
      productVersionId: null,
      temperature: null,
      setting: null,
      reasonCode: 'less_heat',
      copyKey: 'heat.alternative.unheated',
    }],
    reasonCode: 'reviewed_match',
    copyKey: 'heat.reviewed_match',
    ...overrides,
  };
}

function heatEvent(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'heat',
    eventId: 'heat-event-1',
    date: { precision: 'exact', value: '2026-10-24T09:00:00+02:00' },
    provenance: 'execution-confirmed',
    lifecycle: 'active',
    source: { recordId: 'execution-1', revision: null, stepId: 'step-1', position: 1, runId: 'run-1' },
    heat: {
      toolIdentity: { state: 'known', value: { toolId: 'tool-1', toolVersionId: TOOL_VERSION_ID } },
      method: { state: 'known', value: 'heated-air' },
      temperature: { state: 'known', value: { value: 120, unit: 'C' } },
      setting: { state: 'known', value: 'Low' },
      passes: { state: 'known', value: 1 },
      durationMinutes: { state: 'known', value: 15 },
      durationBand: { state: 'unknown' },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
      attachment: { state: 'unknown' },
    },
    ...overrides,
  };
}

describe('Heat Coach contracts', () => {
  it('strictly validates and deeply freezes inputs and publications', () => {
    const parsedInput = HeatCoachInputSchema.parse(input());
    const parsedPublication = HeatRulePublicationSchema.parse(publication());
    expect(Object.isFrozen(parsedInput)).toBe(true);
    expect(Object.isFrozen(parsedInput.request)).toBe(true);
    expect(Object.isFrozen(parsedPublication.limits.temperatures)).toBe(true);
    expect(() => HeatCoachInputSchema.parse({ ...input(), extra: true })).toThrow();
    expect(() => HeatRulePublicationSchema.parse({ ...publication(), digest: 'bad' })).toThrow();
  });

  it('rejects duplicate and non-canonical rule lists', () => {
    expect(() => HeatRulePublicationSchema.parse({ ...publication(), allowedMethods: ['heated-air', 'heated-air'] })).toThrow();
    expect(() => HeatRulePublicationSchema.parse({ ...publication(), allowedMethods: ['unheated', 'heated-air'] })).toThrow();
  });
});

describe('evaluateHeatCoach', () => {
  it.each(['draft', 'withdrawn'] as const)('returns content_pending for %s content', lifecycle => {
    expect(evaluateHeatCoach(input(), publication({ lifecycle })).state).toBe('content_pending');
  });

  it('returns needs_input with the exact destination for missing facts', () => {
    const cases = [
      [{ method: { state: 'unknown' } }, 'my_tools'],
      [{ toolOwnerItemId: null }, 'my_tools'],
      [{ productOwnerItemId: null }, 'my_shelf'],
      [{ zones: [] }, 'today'],
      [{ temperature: { state: 'unknown' }, setting: { state: 'unknown' } }, 'my_tools'],
    ] as const;
    for (const [request, destination] of cases) {
      const decision = evaluateHeatCoach(input(request), publication());
      expect(decision.state).toBe('needs_input');
      expect(decision.missing.map(item => item.destination)).toContain(destination);
    }
  });

  it('routes unknown chemical-service history to services when a restriction depends on it', () => {
    const preparedInput = prepared();
    preparedInput.chemicalServices = [{ serviceId: 'service', presence: 'unknown', effectiveStart: null, zones: [] }];
    const decision = evaluateHeatCoach(
      { ...input(), preparedInput },
      publication({ hardRestrictions: [{ concerns: [], servicePresence: 'present', zones: [], outcome: 'restricted', reasonCode: 'service_rule', copyKey: 'heat.restriction.service' }] }),
    );
    expect(decision.state).toBe('needs_input');
    expect(decision.missing[0]?.destination).toBe('services');
  });

  it('returns restricted when an active hard restriction matches', () => {
    const decision = evaluateHeatCoach(input(), publication({
      hardRestrictions: [{ concerns: ['dryness'], servicePresence: null, zones: [], outcome: 'restricted', reasonCode: 'dryness_rule', copyKey: 'heat.restriction.dryness' }],
    }));
    expect(decision.state).toBe('restricted');
  });

  it('does not let a missing heat fact mask an active hard restriction', () => {
    const decision = evaluateHeatCoach(
      input({ temperature: { state: 'unknown' }, setting: { state: 'unknown' } }),
      publication({
        hardRestrictions: [{ concerns: ['dryness'], servicePresence: null, zones: [], outcome: 'restricted', reasonCode: 'dryness_rule', copyKey: 'heat.restriction.dryness' }],
      }),
    );
    expect(decision.state).toBe('restricted');
    expect(decision.reasons[0]?.reasonCode).toBe('dryness_rule');
  });

  it('does not let an unheated or not-needed request mask an active hard restriction', () => {
    const decision = evaluateHeatCoach(
      input({ method: { state: 'known', value: 'unheated' }, toolOwnerItemId: null, productOwnerItemId: null }),
      publication({
        necessityRules: [{ necessity: 'not_needed', goals: ['basic_wash'], concerns: [] }],
        hardRestrictions: [{ concerns: ['dryness'], servicePresence: null, zones: [], outcome: 'restricted', reasonCode: 'dryness_rule', copyKey: 'heat.restriction.dryness' }],
      }),
    );
    expect(decision.state).toBe('restricted');
    expect(decision.reasons[0]?.reasonCode).toBe('dryness_rule');
  });

  it('returns no_heat for a matching no-heat restriction', () => {
    const decision = evaluateHeatCoach(input(), publication({
      hardRestrictions: [{ concerns: ['dryness'], servicePresence: null, zones: [], outcome: 'no_heat', reasonCode: 'no_heat_rule', copyKey: 'heat.restriction.no_heat' }],
    }));
    expect(decision.state).toBe('no_heat');
  });

  it('returns lower_heat when the exact recorded unit exceeds its reviewed limit', () => {
    const decision = evaluateHeatCoach(input({ temperature: { state: 'known', value: { value: 180, unit: 'C' } } }), publication());
    expect(decision.state).toBe('lower_heat');
    expect(decision.selected.temperature).toEqual({ value: 150, unit: 'C' });
  });

  it('does not convert Fahrenheit into an unstated Celsius limit', () => {
    const decision = evaluateHeatCoach(input({ temperature: { state: 'known', value: { value: 300, unit: 'F' } } }), publication());
    expect(decision.state).toBe('unavailable');
  });

  it('returns appropriate for exact reviewed facts within limits', () => {
    const decision = evaluateHeatCoach(input(), publication());
    expect(decision.state).toBe('appropriate');
    expect(decision.necessity).toBe('supports_goal');
  });

  it.each([
    [{ passes: { state: 'known', value: 3 } }, 'passes_exceed_limit'],
    [{ durationMinutes: { state: 'known', value: 21 } }, 'duration_exceeds_limit'],
  ] as const)('restricts a recorded value above its reviewed bound', (request, code) => {
    const decision = evaluateHeatCoach(input(request), publication());
    expect(decision.state).toBe('restricted');
    expect(decision.reasons[0]?.reasonCode).toBe(code);
  });

  it('returns no_heat when heat is not needed without converting that into a medical claim', () => {
    const rules = publication({ necessityRules: [{ necessity: 'not_needed', goals: ['basic_wash'], concerns: [] }] });
    const decision = evaluateHeatCoach(input({
      method: { state: 'known', value: 'unheated' },
      toolOwnerItemId: null,
      productOwnerItemId: null,
      temperature: { state: 'unknown' },
      setting: { state: 'unknown' },
    }), rules);
    expect(decision.state).toBe('no_heat');
    expect(decision.selected.method).toBe('unheated');
    expect(decision.missing).toEqual([]);
  });

  it('fails unavailable when the reviewed publication is not active at the decision instant', () => {
    const decision = evaluateHeatCoach(input(), publication({ validUntil: '2026-10-24T23:59:59+02:00' }));
    expect(decision.state).toBe('unavailable');
    expect(decision.reasons[0]?.reasonCode).toBe('publication_unavailable');
  });

  it('fails unavailable for an unmatched, unavailable or unpublished binding', () => {
    const manual = prepared();
    manual.products[0] = { ...manual.products[0], identity: 'manual', review: 'not_reviewed', versionId: null };
    expect(evaluateHeatCoach({ ...input(), preparedInput: manual }, publication()).state).toBe('unavailable');
    expect(evaluateHeatCoach(input({ toolOwnerItemId: 'missing-tool' }), publication()).state).toBe('unavailable');
  });

  it('never infers protection or temperature from names, marketing, photos, ingredients, model or wattage', () => {
    const unverified = prepared();
    unverified.products[0] = { ...unverified.products[0], name: 'Heat Protectant 300 C', verifiedCapabilities: [], satisfiesExactCapability: false };
    unverified.tools[0] = { ...unverified.tools[0], name: 'Model 230 C', ownerFacts: { ...unverified.tools[0].ownerFacts, settings: { state: 'unknown', recordedTemperatures: [] } } };
    const noNamedRule = publication({ limits: { ...publication().limits, namedSettings: [] } });
    expect(evaluateHeatCoach({ ...input({ temperature: { state: 'unknown' } }), preparedInput: unverified }, noNamedRule).state).toBe('needs_input');
    expect(evaluateHeatCoach({ ...input(), preparedInput: unverified }, publication()).state).toBe('unavailable');
  });

  it('requires a named setting rule for the exact tool version', () => {
    const wrongToolRule = publication({ limits: { ...publication().limits, temperatures: [], namedSettings: [{ toolVersionId: '99999999-9999-4999-8999-999999999999', label: 'Low' }] } });
    expect(evaluateHeatCoach(input({ temperature: { state: 'unknown' } }), wrongToolRule).state).toBe('needs_input');
  });

  it('emits only alternatives bound to the selected reviewed product and tool versions', () => {
    const alternatives = [
      {
        method: 'heated-air',
        toolVersionId: TOOL_VERSION_ID,
        productVersionId: PRODUCT_VERSION_ID,
        temperature: { value: 100, unit: 'C' },
        setting: 'Low',
        reasonCode: 'exact_alternative',
        copyKey: 'heat.alternative.exact',
      },
      {
        method: 'heated-air',
        toolVersionId: '99999999-9999-4999-8999-999999999999',
        productVersionId: PRODUCT_VERSION_ID,
        temperature: { value: 100, unit: 'C' },
        setting: 'Low',
        reasonCode: 'foreign_tool',
        copyKey: 'heat.alternative.foreign_tool',
      },
    ];
    const decision = evaluateHeatCoach(input(), publication({ alternatives }));
    expect(decision.alternatives.map(item => item.reasonCode)).toEqual(['exact_alternative']);
    expect(JSON.stringify(decision.alternatives)).not.toContain(TOOL_VERSION_ID);
    expect(JSON.stringify(decision.alternatives)).not.toContain(PRODUCT_VERSION_ID);
  });

  it('is deterministic, immutable and counts only supplied active heat facts at or before asOf', () => {
    const originalInput = {
      ...input(),
      confirmedCareEvents: [
        heatEvent(),
        heatEvent({ eventId: 'future', date: { precision: 'exact', value: '2026-10-26T09:00:00+02:00' } }),
        heatEvent({ eventId: 'voided', lifecycle: 'voided', provenance: 'activity-recorded', date: { precision: 'day', value: '2026-10-23' }, source: { recordId: 'activity-1', revision: 2, stepId: null, position: null, runId: null } }),
      ],
    };
    const originalPublication = publication({ allowedMethods: ['heated-air', 'unheated'] });
    const beforeInput = structuredClone(originalInput);
    const beforePublication = structuredClone(originalPublication);
    const first = evaluateHeatCoach(originalInput, originalPublication);
    const second = evaluateHeatCoach(originalInput, { ...originalPublication, allowedMethods: ['heated-air', 'unheated'] });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(originalInput).toEqual(beforeInput);
    expect(originalPublication).toEqual(beforePublication);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.recentConfirmedHeatCount).toBe(1);
  });

  it('emits only structured owner-facing output', () => {
    const decision = HeatCoachDecisionSchema.parse(evaluateHeatCoach(input(), publication()));
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toMatch(/33333333|22222222|11111111|https?:|reviewer|evidence|database|rule expression/iu);
  });
});

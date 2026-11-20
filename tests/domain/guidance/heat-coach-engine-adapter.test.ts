import { describe, expect, it } from 'vitest';

import { DECISION_STATUSES, ENGINE_STAGE_IDS, EngineDecisionSchema, HEAT_ASSESSMENT_STATES } from '@strandcue/engine';

import {
  HEAT_ENGINE_OUTCOMES,
  HeatCoachStateSchema,
  engineOutcomeToHeatState,
  evaluateHeatCoach,
  heatDecisionToEngineOutcome,
  heatStateToEngineOutcome,
} from '../../../packages/domain/src/index.ts';

const TOOL_OWNER_ID = 'tool-owner-11111111-1111-4111-8111-111111111111';
const TOOL_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_OWNER_ID = 'product-owner-22222222-2222-4222-8222-222222222222';
const PRODUCT_VERSION_ID = '22222222-2222-4222-8222-222222222222';

// Visibly synthetic fixtures; they mirror tests/domain/heat-coach.test.ts without importing it.
const heatInput = () => ({
  schemaVersion: 1,
  asOf: '2026-10-25T09:00:00+02:00',
  preparedInput: {
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
      ownerItemId: PRODUCT_OWNER_ID, name: 'Synthetic protection product', identity: 'exact' as const,
      versionId: PRODUCT_VERSION_ID, review: 'reviewed' as const, verifiedCapabilities: ['heat-protection'], satisfiesExactCapability: true,
    }],
    tools: [{
      ownerItemId: TOOL_OWNER_ID, name: 'Synthetic dryer', identity: 'exact' as const, versionId: TOOL_VERSION_ID,
      review: 'reviewed' as const, verifiedCapabilities: ['heat-tool'], satisfiesExactCapability: true,
      ownerFacts: {
        wattageWatts: 2200, adjustableTemp: 'yes' as const,
        settings: { state: 'recorded' as const, recordedTemperatures: [{ label: 'Low', value: 120, unit: 'C' as const }] },
        heatMethods: { state: 'recorded' as const, methods: ['heated-air'] },
      },
    }],
    completeness: { activities: 'complete' as const, passport: 'complete' as const, products: 'complete' as const, services: 'complete' as const, tools: 'complete' as const },
  },
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
  },
});

const publication = (overrides: Record<string, unknown> = {}) => ({
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
  alternatives: [],
  reasonCode: 'reviewed_match',
  copyKey: 'heat.reviewed_match',
  ...overrides,
});

const audit = {
  ruleset: { rulesetId: 'synthetic', contentHash: 'sha256:synthetic', schemaVersion: '1.1.0', evaluatorVersion: '1.1.0' },
  evaluatedAt: '2026-10-31T12:00:00.000Z',
  schemaVersion: '1.1.0',
  evaluatorVersion: '1.1.0',
  trace: ENGINE_STAGE_IDS.map((stageId) => ({ stageId, outcome: 'not_applicable' as const, reasonSeverity: 'info' as const, ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [] })),
};

/** A decision that is valid in every respect except possibly the status/heat pair under test. */
const engineDecision = (status: (typeof DECISION_STATUSES)[number], heatAssessment: string) => ({
  status,
  steps: status === 'decided'
    ? [{ stepId: 's1', actionId: 'a1', labelKey: 'step.a1', reasonCode: 'synthetic', reasonSeverity: 'info', ruleIds: [], ruleRefs: [], claimIds: [], evidenceIds: [], prerequisiteIds: [] }]
    : [],
  omissions: [],
  alternatives: [],
  questions: status === 'needs_input' ? [{ questionId: 'q1', rank: 1, reasonCode: 'synthetic', reasonSeverity: 'caution', ruleRefs: [], neededFactIds: [] }] : [],
  heatAssessment,
  confidence: { instructionCompleteness: 'moderate', suitability: 'limited' },
  audit,
});

describe('Heat Coach / engine status mapping', () => {
  it('covers exactly the seven Heat Coach states, and both vocabularies stay identical', () => {
    expect([...HeatCoachStateSchema.options].sort()).toEqual([...HEAT_ASSESSMENT_STATES].sort());
    expect(Object.keys(HEAT_ENGINE_OUTCOMES).sort()).toEqual([...HeatCoachStateSchema.options].sort());
  });

  it.each([
    ['appropriate', 'decided'],
    ['lower_heat', 'decided'],
    ['no_heat', 'decided'],
    ['needs_input', 'needs_input'],
    ['restricted', 'blocked'],
    ['content_pending', 'blocked'],
    ['unavailable', 'no_protocol'],
  ] as const)('maps %s to engine status %s and back', (state, status) => {
    const outcome = heatStateToEngineOutcome(state);
    expect(outcome).toEqual({ status, heatAssessment: state });
    expect(engineOutcomeToHeatState(outcome.status, outcome.heatAssessment)).toBe(state);
  });

  it('accepts exactly the status/heat pairs the engine contract accepts, and no others', () => {
    for (const status of DECISION_STATUSES) {
      for (const heat of HEAT_ASSESSMENT_STATES) {
        const engineAccepts = EngineDecisionSchema.safeParse(engineDecision(status, heat)).success;
        let adapterAccepts = true;
        try {
          engineOutcomeToHeatState(status, heat);
        } catch {
          adapterAccepts = false;
        }
        expect(adapterAccepts, `${status}/${heat}`).toBe(engineAccepts);
      }
    }
  });

  it('fails closed on values outside either vocabulary', () => {
    expect(() => engineOutcomeToHeatState('decided', 'safe')).toThrow();
    expect(() => engineOutcomeToHeatState('maybe', 'appropriate')).toThrow();
    expect(() => engineOutcomeToHeatState('decided', undefined)).toThrow();
    expect(() => heatStateToEngineOutcome('green' as never)).toThrow();
  });

  it('never maps a non-actionable state onto a decided engine status', () => {
    for (const state of ['restricted', 'content_pending', 'unavailable', 'needs_input'] as const) {
      expect(heatStateToEngineOutcome(state).status).not.toBe('decided');
    }
  });
});

describe('mapping real Heat Coach decisions', () => {
  it('maps unreviewed and withdrawn content to blocked, never to a usable outcome', () => {
    for (const lifecycle of ['draft', 'withdrawn']) {
      const decision = evaluateHeatCoach(heatInput(), publication({ lifecycle }));
      expect(decision.state).toBe('content_pending');
      expect(heatDecisionToEngineOutcome(decision)).toEqual({ status: 'blocked', heatAssessment: 'content_pending' });
    }
  });

  it('maps an expired publication window to no_protocol (stale content is not current)', () => {
    const decision = evaluateHeatCoach(heatInput(), publication({ validUntil: '2026-10-24T23:59:59+02:00' }));
    expect(heatDecisionToEngineOutcome(decision)).toEqual({ status: 'no_protocol', heatAssessment: 'unavailable' });
  });

  it('maps a reviewed, in-window match to decided/appropriate', () => {
    const decision = evaluateHeatCoach(heatInput(), publication());
    expect(heatDecisionToEngineOutcome(decision)).toEqual({ status: 'decided', heatAssessment: 'appropriate' });
  });

  it('maps a limit breach to blocked/restricted and a missing fact to needs_input', () => {
    const over = { ...heatInput(), request: { ...heatInput().request, passes: { state: 'known', value: 3 } } };
    expect(heatDecisionToEngineOutcome(evaluateHeatCoach(over, publication()))).toEqual({ status: 'blocked', heatAssessment: 'restricted' });
    const noZones = { ...heatInput(), request: { ...heatInput().request, zones: [] } };
    expect(heatDecisionToEngineOutcome(evaluateHeatCoach(noZones, publication()))).toEqual({ status: 'needs_input', heatAssessment: 'needs_input' });
  });
});

/**
 * Shared Heat Coach conformance fixtures.
 *
 * Consumed by the domain evaluator tests and the PostgreSQL evaluator tests.
 * One contract, one fixture set: the same input and publication are asserted
 * against both evaluators so domain/database parity is provable fixture by
 * fixture.
 *
 * Synthetic only: ids are well-known uuid-shaped values, product/tool names
 * are "Synthetic ...", and no real capability, reviewer or production rule is
 * invented. Production Heat Coach remains an empty draft.
 */

export const conformance = {
  schemaVersion: 1,
  publicationId: '33333333-3333-4333-8333-333333333333',
  toolVersionId: '11111111-1111-4111-8111-111111111111',
  productVersionId: '22222222-2222-4222-8222-222222222222',
  toolOwnerItemId: 'tool-owner-11111111-1111-4111-8111-111111111111',
  productOwnerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
  capabilityProduct: 'heat-protection',
  capabilityTool: 'heated-air',
  asOf: '2026-10-25T09:00:00+02:00',
  baselinePublication: {
    schemaVersion: 1,
    publicationId: '33333333-3333-4333-8333-333333333333',
    ruleVersion: '1.0.0',
    digest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lifecycle: 'reviewed',
    validFrom: '2026-10-01T00:00:00+02:00',
    validUntil: null,
    requiredProductCapability: 'heat-protection',
    allowedMethods: ['heated-air'],
    limits: {
      temperatures: [{ unit: 'C', maximum: 150 }],
      namedSettings: [{ toolVersionId: '11111111-1111-4111-8111-111111111111', label: 'Low' }],
      maximumPasses: 2,
      maximumDurationMinutes: 20,
    },
    necessityRules: [{ necessity: 'supports_goal', goals: ['basic_wash'], concerns: [] }],
    hardRestrictions: [],
    alternatives: [
      {
        method: 'unheated',
        toolVersionId: null,
        productVersionId: null,
        temperature: null,
        setting: null,
        reasonCode: 'less_heat',
        copyKey: 'heat.alternative.unheated',
      },
    ],
    reasonCode: 'reviewed_match',
    copyKey: 'heat.reviewed_match',
  },
  baselineInput: {
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
          ownerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
          name: 'Synthetic protection product',
          identity: 'exact',
          versionId: '22222222-2222-4222-8222-222222222222',
          review: 'reviewed',
          verifiedCapabilities: ['heat-protection'],
          satisfiesExactCapability: true,
        },
      ],
      tools: [
        {
          ownerItemId: 'tool-owner-11111111-1111-4111-8111-111111111111',
          name: 'Synthetic dryer',
          identity: 'exact',
          versionId: '11111111-1111-4111-8111-111111111111',
          review: 'reviewed',
          verifiedCapabilities: ['heated-air'],
          satisfiesExactCapability: true,
          ownerFacts: {
            wattageWatts: 2200,
            adjustableTemp: 'yes',
            settings: {
              state: 'recorded',
              recordedTemperatures: [{ label: 'Low', value: 120, unit: 'C' }],
            },
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
      toolOwnerItemId: 'tool-owner-11111111-1111-4111-8111-111111111111',
      productOwnerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
      temperature: { state: 'known', value: { value: 120, unit: 'C' } },
      setting: { state: 'known', value: 'Low' },
      passes: { state: 'known', value: 1 },
      durationMinutes: { state: 'known', value: 15 },
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
    },
  },
  cases: [
    {
      name: 'content_pending-draft',
      state: 'content_pending',
      publication: { lifecycle: 'draft' },
    },
    {
      name: 'content_pending-withdrawn',
      state: 'content_pending',
      publication: { lifecycle: 'withdrawn' },
    },
    {
      name: 'publication-unavailable-expired',
      state: 'unavailable',
      reasonCode: 'publication_unavailable',
      publication: { validUntil: '2026-10-24T23:59:59+02:00' },
    },
    {
      name: 'publication-unavailable-future',
      state: 'unavailable',
      reasonCode: 'publication_unavailable',
      publication: { validFrom: '2026-11-01T00:00:00+02:00' },
    },
    {
      name: 'missing-method',
      state: 'needs_input',
      destination: 'my_tools',
      input: { request: { method: { state: 'unknown' } } },
    },
    {
      name: 'missing-tool',
      state: 'needs_input',
      destination: 'my_tools',
      input: { request: { toolOwnerItemId: null } },
    },
    {
      name: 'missing-product',
      state: 'needs_input',
      destination: 'my_shelf',
      input: { request: { productOwnerItemId: null } },
    },
    {
      name: 'missing-zones',
      state: 'needs_input',
      destination: 'today',
      input: { request: { zones: [] } },
    },
    {
      name: 'missing-temperature',
      state: 'needs_input',
      destination: 'my_tools',
      input: {
        request: { temperature: { state: 'unknown' }, setting: { state: 'unknown' } },
      },
    },
    {
      name: 'missing-service-history',
      state: 'needs_input',
      destination: 'services',
      input: {
        preparedInput: {
          chemicalServices: [{ serviceId: 'svc', presence: 'unknown', effectiveStart: null, zones: [] }],
        },
      },
      publication: {
        hardRestrictions: [
          {
            concerns: [],
            servicePresence: 'present',
            zones: [],
            outcome: 'restricted',
            reasonCode: 'service_rule',
            copyKey: 'heat.restriction.service',
          },
        ],
      },
    },
    {
      name: 'restriction-before-missing-temperature',
      state: 'restricted',
      reasonCode: 'dryness_rule',
      input: {
        request: { temperature: { state: 'unknown' }, setting: { state: 'unknown' } },
      },
      publication: {
        hardRestrictions: [
          {
            concerns: ['dryness'],
            servicePresence: null,
            zones: [],
            outcome: 'restricted',
            reasonCode: 'dryness_rule',
            copyKey: 'heat.restriction.dryness',
          },
        ],
      },
    },
    {
      name: 'restriction-before-unheated',
      state: 'restricted',
      reasonCode: 'dryness_rule',
      input: {
        request: {
          method: { state: 'known', value: 'unheated' },
          toolOwnerItemId: null,
          productOwnerItemId: null,
        },
      },
      publication: {
        necessityRules: [{ necessity: 'not_needed', goals: ['basic_wash'], concerns: [] }],
        hardRestrictions: [
          {
            concerns: ['dryness'],
            servicePresence: null,
            zones: [],
            outcome: 'restricted',
            reasonCode: 'dryness_rule',
            copyKey: 'heat.restriction.dryness',
          },
        ],
      },
    },
    {
      name: 'restriction-before-not-needed',
      state: 'restricted',
      reasonCode: 'dryness_rule',
      input: {
        request: {
          method: { state: 'known', value: 'unheated' },
          toolOwnerItemId: null,
          productOwnerItemId: null,
        },
      },
      publication: {
        necessityRules: [{ necessity: 'not_needed', goals: ['basic_wash'], concerns: [] }],
        hardRestrictions: [
          {
            concerns: ['dryness'],
            servicePresence: null,
            zones: [],
            outcome: 'restricted',
            reasonCode: 'dryness_rule',
            copyKey: 'heat.restriction.dryness',
          },
        ],
      },
    },
    {
      name: 'no-heat-restriction',
      state: 'no_heat',
      reasonCode: 'no_heat_rule',
      publication: {
        hardRestrictions: [
          {
            concerns: ['dryness'],
            servicePresence: null,
            zones: [],
            outcome: 'no_heat',
            reasonCode: 'no_heat_rule',
            copyKey: 'heat.restriction.no_heat',
          },
        ],
      },
    },
    {
      name: 'necessity-not-needed',
      state: 'no_heat',
      necessity: 'not_needed',
      input: {
        request: {
          method: { state: 'known', value: 'unheated' },
          toolOwnerItemId: null,
          productOwnerItemId: null,
          temperature: { state: 'unknown' },
          setting: { state: 'unknown' },
        },
      },
      publication: {
        necessityRules: [{ necessity: 'not_needed', goals: ['basic_wash'], concerns: [] }],
      },
    },
    {
      name: 'necessity-optional',
      state: 'no_heat',
      necessity: 'optional',
      input: {
        request: {
          method: { state: 'known', value: 'unheated' },
          toolOwnerItemId: null,
          productOwnerItemId: null,
        },
      },
      publication: {
        necessityRules: [{ necessity: 'optional', goals: ['basic_wash'], concerns: [] }],
      },
    },
    {
      name: 'necessity-unknown',
      state: 'no_heat',
      necessity: 'unknown',
      input: {
        request: {
          method: { state: 'known', value: 'unheated' },
          toolOwnerItemId: null,
          productOwnerItemId: null,
        },
      },
      publication: { necessityRules: [] },
    },
    {
      name: 'unavailable-exact-tool',
      state: 'unavailable',
      reasonCode: 'tool_unavailable',
      input: { request: { toolOwnerItemId: 'missing-tool' } },
    },
    {
      name: 'unavailable-exact-product',
      state: 'unavailable',
      reasonCode: 'product_unavailable',
      input: { request: { productOwnerItemId: 'missing-product' } },
    },
    {
      name: 'unavailable-unpublished-product',
      state: 'unavailable',
      reasonCode: 'product_unavailable',
      input: {
        preparedInput: {
          products: [
            {
              ownerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
              name: 'Synthetic protection product',
              identity: 'exact',
              versionId: '22222222-2222-4222-8222-222222222222',
              review: 'withdrawn',
              verifiedCapabilities: [],
              satisfiesExactCapability: false,
            },
          ],
        },
      },
    },
    {
      name: 'mismatched-version-tool',
      state: 'unavailable',
      reasonCode: 'tool_unavailable',
      input: {
        preparedInput: {
          tools: [
            {
              ownerItemId: 'tool-owner-11111111-1111-4111-8111-111111111111',
              name: 'Synthetic dryer',
              identity: 'exact',
              versionId: '99999999-9999-4999-8999-999999999999',
              review: 'not_reviewed',
              verifiedCapabilities: [],
              satisfiesExactCapability: false,
              ownerFacts: {
                wattageWatts: 2200,
                adjustableTemp: 'yes',
                settings: {
                  state: 'recorded',
                  recordedTemperatures: [{ label: 'Low', value: 120, unit: 'C' }],
                },
                heatMethods: { state: 'recorded', methods: ['heated-air'] },
              },
            },
          ],
        },
      },
    },
    {
      name: 'mismatched-version-product',
      state: 'unavailable',
      reasonCode: 'product_unavailable',
      input: {
        preparedInput: {
          products: [
            {
              ownerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
              name: 'Synthetic protection product',
              identity: 'exact',
              versionId: '99999999-9999-4999-8999-999999999999',
              review: 'not_reviewed',
              verifiedCapabilities: [],
              satisfiesExactCapability: false,
            },
          ],
        },
      },
    },
    {
      name: 'named-setting-restriction',
      state: 'needs_input',
      destination: 'my_tools',
      input: { request: { temperature: { state: 'unknown' } } },
      publication: {
        limits: {
          temperatures: [],
          namedSettings: [{ toolVersionId: '99999999-9999-4999-8999-999999999999', label: 'Low' }],
        },
      },
    },
    {
      name: 'max-temperature-c',
      state: 'lower_heat',
      input: { request: { temperature: { state: 'known', value: { value: 180, unit: 'C' } } } },
    },
    {
      name: 'max-temperature-f-not-converted',
      state: 'unavailable',
      reasonCode: 'unit_unreviewed',
      input: { request: { temperature: { state: 'known', value: { value: 300, unit: 'F' } } } },
    },
    {
      name: 'max-passes',
      state: 'restricted',
      reasonCode: 'passes_exceed_limit',
      input: { request: { passes: { state: 'known', value: 3 } } },
    },
    {
      name: 'max-duration',
      state: 'restricted',
      reasonCode: 'duration_exceeds_limit',
      input: { request: { durationMinutes: { state: 'known', value: 21 } } },
    },
    {
      name: 'lower-heat-alternative',
      state: 'lower_heat',
      input: { request: { temperature: { state: 'known', value: { value: 180, unit: 'C' } } } },
      publication: {
        alternatives: [
          {
            method: 'heated-air',
            toolVersionId: '11111111-1111-4111-8111-111111111111',
            productVersionId: '22222222-2222-4222-8222-222222222222',
            temperature: { value: 100, unit: 'C' },
            setting: 'Low',
            reasonCode: 'exact_alternative',
            copyKey: 'heat.alternative.exact',
          },
        ],
      },
    },
    {
      name: 'no-heat-alternative',
      state: 'appropriate',
      alternativesContain: 'heat.alternative.unheated',
      publication: {
        alternatives: [
          {
            method: 'unheated',
            toolVersionId: null,
            productVersionId: null,
            temperature: null,
            setting: null,
            reasonCode: 'less_heat',
            copyKey: 'heat.alternative.unheated',
          },
        ],
      },
    },
    {
      name: 'current-condition-concern-zone',
      state: 'restricted',
      reasonCode: 'dryness_rule',
      input: { request: { zones: [{ region: 'whole_head', segment: 'entire_strand' }] } },
      publication: {
        hardRestrictions: [
          {
            concerns: ['dryness'],
            servicePresence: null,
            zones: [{ region: 'whole_head', segment: 'entire_strand' }],
            outcome: 'restricted',
            reasonCode: 'dryness_rule',
            copyKey: 'heat.restriction.dryness',
          },
        ],
      },
    },
    {
      name: 'chemical-service-history',
      state: 'appropriate',
      input: {
        preparedInput: {
          chemicalServices: [{ serviceId: 'svc', presence: 'not-present', effectiveStart: null, zones: [] }],
        },
      },
    },
    {
      name: 'recent-confirmed-heat-history',
      state: 'appropriate',
      input: {
        confirmedCareEvents: [
          {
            kind: 'heat',
            eventId: 'h1',
            date: { precision: 'exact', value: '2026-10-24T09:00:00+02:00' },
            provenance: 'execution-confirmed',
            lifecycle: 'active',
            source: {
              recordId: 'e1',
              revision: null,
              stepId: 's1',
              position: 1,
              runId: 'r1',
            },
            heat: {
              toolIdentity: {
                state: 'known',
                value: { toolId: 't1', toolVersionId: '11111111-1111-4111-8111-111111111111' },
              },
              method: { state: 'known', value: 'heated-air' },
              temperature: { state: 'known', value: { value: 120, unit: 'C' } },
              setting: { state: 'known', value: 'Low' },
              passes: { state: 'known', value: 1 },
              durationMinutes: { state: 'known', value: 15 },
              durationBand: { state: 'unknown' },
              zones: [{ region: 'whole_head', segment: 'entire_strand' }],
              attachment: { state: 'unknown' },
            },
          },
        ],
      },
    },
    {
      name: 'expired-publication',
      state: 'unavailable',
      reasonCode: 'publication_unavailable',
      publication: { validUntil: '2026-10-24T23:59:59+02:00' },
    },
    {
      name: 'future-publication',
      state: 'unavailable',
      reasonCode: 'publication_unavailable',
      publication: { validFrom: '2026-11-01T00:00:00+02:00' },
    },
    {
      name: 'appropriate-exact-reviewed',
      state: 'appropriate',
      necessity: 'supports_goal',
    },
    {
      name: 'no-marketing-inference',
      state: 'unavailable',
      reasonCode: 'tool_unavailable',
      input: {
        preparedInput: {
          products: [
            {
              ownerItemId: 'product-owner-22222222-2222-4222-8222-222222222222',
              name: 'Heat Protectant 300 C',
              identity: 'exact',
              versionId: '22222222-2222-4222-8222-222222222222',
              review: 'reviewed',
              verifiedCapabilities: [],
              satisfiesExactCapability: false,
            },
          ],
          tools: [
            {
              ownerItemId: 'tool-owner-11111111-1111-4111-8111-111111111111',
              name: 'Model 230 C',
              identity: 'exact',
              versionId: '11111111-1111-4111-8111-111111111111',
              review: 'reviewed',
              verifiedCapabilities: [],
              satisfiesExactCapability: false,
              ownerFacts: {
                wattageWatts: 2200,
                adjustableTemp: 'yes',
                settings: { state: 'unknown', recordedTemperatures: [] },
                heatMethods: { state: 'recorded', methods: ['heated-air'] },
              },
            },
          ],
        },
      },
    },
  ],
};

export type ConformanceCase = (typeof conformance.cases)[number];
export interface ConformanceCasePatch {
  readonly input?: unknown;
  readonly publication?: unknown;
}

export function mergeConformanceValue(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return structuredClone(base);
  if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) {
    return structuredClone(patch);
  }
  if (Array.isArray(patch)) return structuredClone(patch);
  const baseObject = base as Record<string, unknown>;
  const patchObject = patch as Record<string, unknown>;
  if (typeof patchObject.state === 'string') return structuredClone(patch);
  const merged: Record<string, unknown> = { ...structuredClone(baseObject) };
  for (const [key, value] of Object.entries(patchObject)) {
    merged[key] = mergeConformanceValue(baseObject[key], value);
  }
  return merged;
}

export function resolveConformanceCase(item: ConformanceCasePatch): {
  readonly input: unknown;
  readonly publication: unknown;
} {
  return {
    input: mergeConformanceValue(conformance.baselineInput, 'input' in item ? item.input : undefined),
    publication: mergeConformanceValue(
      conformance.baselinePublication,
      'publication' in item ? item.publication : undefined,
    ),
  };
}

import { z } from 'zod';

import { ZoneSchema } from './activity.ts';
import { CareEventSchema } from './care-events.ts';
import { CurrentConditionConcernSchema } from './current-condition.ts';
import { PreparedGuidanceInputSchema, frozen, nonEmptyString } from './guidance/schemas.ts';
import { HEAT_METHOD_ORDER, ToolHeatMethodSchema, ToolSettingTemperatureSchema } from './tools.ts';

const IsoInstantSchema = z.iso.datetime({ offset: true });
const IdentifierSchema = nonEmptyString.max(200);
const CodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u);
const CopyKeySchema = z.string().regex(/^heat\.[a-z0-9_.-]{1,100}$/u);

export const HeatCoachStateSchema = z.enum([
  'content_pending', 'needs_input', 'restricted', 'lower_heat', 'no_heat', 'appropriate', 'unavailable',
]);
export const HeatNecessitySchema = z.enum(['not_needed', 'optional', 'supports_goal', 'unknown']);
export const HeatMissingDestinationSchema = z.enum(['today', 'my_hair', 'services', 'my_shelf', 'my_tools']);
export const HeatPublicationLifecycleSchema = z.enum(['draft', 'reviewed', 'withdrawn']);

const KnownUnknownSchema = <T extends z.ZodType>(value: T) => z.discriminatedUnion('state', [
  z.object({ state: z.literal('known'), value }).strict(),
  z.object({ state: z.literal('unknown') }).strict(),
]);

const RequestedHeatSchema = z.object({
  method: KnownUnknownSchema(ToolHeatMethodSchema),
  toolOwnerItemId: IdentifierSchema.nullable(),
  productOwnerItemId: IdentifierSchema.nullable(),
  temperature: KnownUnknownSchema(ToolSettingTemperatureSchema),
  setting: KnownUnknownSchema(nonEmptyString.max(60)),
  passes: KnownUnknownSchema(z.number().int().nonnegative().max(100)),
  durationMinutes: KnownUnknownSchema(z.number().int().nonnegative().max(1440)),
  zones: z.array(ZoneSchema.strict()).max(36),
}).strict();

export const HeatCoachInputSchema = frozen(z.object({
  schemaVersion: z.literal(1),
  asOf: IsoInstantSchema,
  preparedInput: PreparedGuidanceInputSchema,
  confirmedCareEvents: z.array(CareEventSchema).max(500),
  request: RequestedHeatSchema,
}).strict());

const TemperatureLimitSchema = z.object({
  unit: z.enum(['C', 'F']),
  maximum: z.number().finite(),
}).strict();

const NamedSettingRuleSchema = z.object({
  toolVersionId: z.string().uuid(),
  label: nonEmptyString.max(60),
}).strict();

const RestrictionSchema = z.object({
  concerns: z.array(CurrentConditionConcernSchema).max(15),
  servicePresence: z.enum(['present', 'not-present']).nullable(),
  zones: z.array(ZoneSchema.strict()).max(36),
  outcome: z.enum(['restricted', 'no_heat']),
  reasonCode: CodeSchema,
  copyKey: CopyKeySchema,
}).strict();

const NecessityRuleSchema = z.object({
  necessity: HeatNecessitySchema,
  goals: z.array(nonEmptyString.max(60)).min(1).max(20),
  concerns: z.array(CurrentConditionConcernSchema).max(15),
}).strict();

const AlternativeSchema = z.object({
  method: ToolHeatMethodSchema,
  temperature: ToolSettingTemperatureSchema.nullable(),
  setting: nonEmptyString.max(60).nullable(),
  reasonCode: CodeSchema,
  copyKey: CopyKeySchema,
}).strict();

const PublicationAlternativeSchema = AlternativeSchema.extend({
  toolVersionId: z.string().uuid().nullable(),
  productVersionId: z.string().uuid().nullable(),
}).strict();

function strictlyAscending<T>(values: readonly T[], key: (value: T) => string): boolean {
  return values.every((value, index) => index === 0 || key(values[index - 1] as T) < key(value));
}

export const HeatRulePublicationSchema = frozen(z.object({
  schemaVersion: z.literal(1),
  publicationId: z.string().uuid(),
  ruleVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  lifecycle: HeatPublicationLifecycleSchema,
  validFrom: IsoInstantSchema,
  validUntil: IsoInstantSchema.nullable(),
  requiredProductCapability: nonEmptyString.max(100).nullable(),
  allowedMethods: z.array(ToolHeatMethodSchema).min(1).max(HEAT_METHOD_ORDER.length),
  limits: z.object({
    temperatures: z.array(TemperatureLimitSchema).max(2),
    namedSettings: z.array(NamedSettingRuleSchema).max(100),
    maximumPasses: z.number().int().nonnegative().max(100).nullable(),
    maximumDurationMinutes: z.number().int().nonnegative().max(1440).nullable(),
  }).strict(),
  necessityRules: z.array(NecessityRuleSchema).max(100),
  hardRestrictions: z.array(RestrictionSchema).max(100),
  alternatives: z.array(PublicationAlternativeSchema).max(100),
  reasonCode: CodeSchema,
  copyKey: CopyKeySchema,
}).strict().superRefine((publication, context) => {
  const methodRanks = publication.allowedMethods.map(method => HEAT_METHOD_ORDER.indexOf(method));
  if (!methodRanks.every((rank, index) => index === 0 || methodRanks[index - 1]! < rank)) {
    context.addIssue({ code: 'custom', path: ['allowedMethods'], message: 'Allowed methods must be unique and canonical' });
  }
  if (!strictlyAscending(publication.limits.temperatures, item => item.unit)) {
    context.addIssue({ code: 'custom', path: ['limits', 'temperatures'], message: 'Temperature limits must be unique and canonical' });
  }
  if (!strictlyAscending(publication.limits.namedSettings, item => `${item.toolVersionId}\u0000${item.label}`)) {
    context.addIssue({ code: 'custom', path: ['limits', 'namedSettings'], message: 'Named settings must be unique and canonical' });
  }
  if (!strictlyAscending(publication.hardRestrictions, item => item.reasonCode)) {
    context.addIssue({ code: 'custom', path: ['hardRestrictions'], message: 'Restrictions must be unique and canonical' });
  }
  if (!strictlyAscending(publication.alternatives, item => `${HEAT_METHOD_ORDER.indexOf(item.method)}\u0000${item.reasonCode}`)) {
    context.addIssue({ code: 'custom', path: ['alternatives'], message: 'Alternatives must be unique and canonical' });
  }
  if (publication.validUntil !== null && Date.parse(publication.validUntil) < Date.parse(publication.validFrom)) {
    context.addIssue({ code: 'custom', path: ['validUntil'], message: 'Validity cannot end before it starts' });
  }
}));

const MissingFactSchema = z.object({
  fact: z.enum(['current_condition', 'heat_method', 'tool', 'product', 'temperature', 'zones', 'service_history']),
  destination: HeatMissingDestinationSchema,
  reasonCode: CodeSchema,
  copyKey: CopyKeySchema,
}).strict();

const SelectedHeatSchema = z.object({
  method: ToolHeatMethodSchema.nullable(),
  temperature: ToolSettingTemperatureSchema.nullable(),
  setting: nonEmptyString.max(60).nullable(),
  passes: z.number().int().nonnegative().nullable(),
  durationMinutes: z.number().int().nonnegative().nullable(),
  zones: z.array(ZoneSchema.strict()).max(36),
}).strict();

const DecisionReasonSchema = z.object({ reasonCode: CodeSchema, copyKey: CopyKeySchema }).strict();

export const HeatCoachDecisionSchema = frozen(z.object({
  schemaVersion: z.literal(1),
  state: HeatCoachStateSchema,
  necessity: HeatNecessitySchema,
  selected: SelectedHeatSchema,
  missing: z.array(MissingFactSchema).max(10),
  reasons: z.array(DecisionReasonSchema).min(1).max(20),
  alternatives: z.array(AlternativeSchema).max(100),
  recentConfirmedHeatCount: z.number().int().nonnegative(),
}).strict());

export type HeatCoachInput = z.output<typeof HeatCoachInputSchema>;
export type HeatRulePublication = z.output<typeof HeatRulePublicationSchema>;
export type HeatCoachDecision = z.output<typeof HeatCoachDecisionSchema>;

const EMPTY_SELECTED: z.output<typeof SelectedHeatSchema> = {
  method: null,
  temperature: null,
  setting: null,
  passes: null,
  durationMinutes: null,
  zones: [],
};

function knownValue<T>(fact: { readonly state: 'known'; readonly value: T } | { readonly state: 'unknown' }): T | null {
  return fact.state === 'known' ? fact.value : null;
}

function reason(reasonCode: string, copyKey: string) {
  return { reasonCode, copyKey };
}

function decision(args: Omit<HeatCoachDecision, 'schemaVersion'>): HeatCoachDecision {
  return HeatCoachDecisionSchema.parse({ schemaVersion: 1, ...args });
}

function heatCount(events: readonly z.output<typeof CareEventSchema>[], asOf: string): number {
  const cutoff = Date.parse(asOf);
  return events.filter(event =>
    event.kind === 'heat' && event.lifecycle === 'active' &&
    event.date.precision === 'exact' && Date.parse(event.date.value) <= cutoff,
  ).length;
}

function necessityFor(input: HeatCoachInput, publication: HeatRulePublication) {
  const concerns = new Set(input.preparedInput.currentCondition?.concerns ?? []);
  return publication.necessityRules.find(rule =>
    rule.goals.includes(input.preparedInput.goal.id) && rule.concerns.every(concern => concerns.has(concern)),
  )?.necessity ?? 'unknown';
}

function base(
  input: HeatCoachInput,
  publication: HeatRulePublication,
): Omit<HeatCoachDecision, 'schemaVersion' | 'state'> {
  return {
    necessity: necessityFor(input, publication),
    selected: EMPTY_SELECTED,
    missing: [],
    reasons: [reason(publication.reasonCode, publication.copyKey)],
    alternatives: [],
    recentConfirmedHeatCount: heatCount(input.confirmedCareEvents, input.asOf),
  };
}

function missing(input: HeatCoachInput, publication: HeatRulePublication) {
  const result: z.output<typeof MissingFactSchema>[] = [];
  const add = (fact: z.output<typeof MissingFactSchema>['fact'], destination: z.output<typeof HeatMissingDestinationSchema>) => {
    result.push({ fact, destination, reasonCode: `${fact}_missing`, copyKey: `heat.missing.${fact}` });
  };
  if (input.preparedInput.currentCondition === null) add('current_condition', 'my_hair');
  if (input.request.method.state === 'unknown') add('heat_method', 'my_tools');
  if (input.request.toolOwnerItemId === null) add('tool', 'my_tools');
  if (publication.requiredProductCapability !== null && input.request.productOwnerItemId === null) add('product', 'my_shelf');
  if (input.request.zones.length === 0) add('zones', 'today');
  const method = knownValue(input.request.method);
  const tool = input.preparedInput.tools.find(item => item.ownerItemId === input.request.toolOwnerItemId);
  const requestedSetting = knownValue(input.request.setting);
  const hasExactNamedRule = requestedSetting !== null && tool?.versionId !== null &&
    publication.limits.namedSettings.some(rule => rule.toolVersionId === tool?.versionId && rule.label === requestedSetting);
  if (method !== 'unheated' && input.request.temperature.state === 'unknown' && !hasExactNamedRule) add('temperature', 'my_tools');
  if (publication.hardRestrictions.some(rule => rule.servicePresence !== null) && input.preparedInput.chemicalServices.some(service => service.presence === 'unknown')) add('service_history', 'services');
  return result;
}

function matchesRestriction(input: HeatCoachInput, restriction: z.output<typeof RestrictionSchema>): boolean {
  const concerns = new Set(input.preparedInput.currentCondition?.concerns ?? []);
  if (!restriction.concerns.every(concern => concerns.has(concern))) return false;
  if (restriction.servicePresence !== null && !input.preparedInput.chemicalServices.some(service => service.presence === restriction.servicePresence)) return false;
  if (restriction.zones.length > 0) {
    const requested = new Set(input.request.zones.map(zone => `${zone.region}:${zone.segment}`));
    if (!restriction.zones.some(zone => requested.has(`${zone.region}:${zone.segment}`))) return false;
  }
  return restriction.concerns.length > 0 || restriction.servicePresence !== null || restriction.zones.length > 0;
}

export function evaluateHeatCoach(rawInput: unknown, rawPublication: unknown): HeatCoachDecision {
  const input = HeatCoachInputSchema.parse(rawInput);
  const publication = HeatRulePublicationSchema.parse(rawPublication);
  const common = base(input, publication);
  if (publication.lifecycle !== 'reviewed') return decision({ ...common, state: 'content_pending' });
  const instant = Date.parse(input.asOf);
  if (instant < Date.parse(publication.validFrom) || (publication.validUntil !== null && instant > Date.parse(publication.validUntil))) {
    return decision({ ...common, state: 'unavailable', reasons: [reason('publication_unavailable', 'heat.unavailable.publication')] });
  }
  const requestedMethod = knownValue(input.request.method);
  if (common.necessity === 'not_needed' || requestedMethod === 'unheated') {
    return decision({ ...common, state: 'no_heat', selected: { ...EMPTY_SELECTED, method: 'unheated', zones: input.request.zones } });
  }
  const missingFacts = missing(input, publication);
  if (missingFacts.length > 0) return decision({ ...common, state: 'needs_input', missing: missingFacts });
  const restriction = publication.hardRestrictions.find(rule => matchesRestriction(input, rule));
  if (restriction !== undefined) {
    return decision({ ...common, state: restriction.outcome, reasons: [reason(restriction.reasonCode, restriction.copyKey)] });
  }
  const method = knownValue(input.request.method)!;
  const tool = input.preparedInput.tools.find(item => item.ownerItemId === input.request.toolOwnerItemId);
  const exactTool = tool !== undefined && tool.identity === 'exact' && tool.versionId !== null && tool.review === 'reviewed' && tool.satisfiesExactCapability;
  if (!exactTool || !publication.allowedMethods.includes(method) || tool.ownerFacts.heatMethods.state !== 'recorded' || !tool.ownerFacts.heatMethods.methods.includes(method)) {
    return decision({ ...common, state: 'unavailable', reasons: [reason('tool_unavailable', 'heat.unavailable.tool')] });
  }
  if (publication.requiredProductCapability !== null) {
    const product = input.preparedInput.products.find(item => item.ownerItemId === input.request.productOwnerItemId);
    const exactProduct = product !== undefined && product.identity === 'exact' && product.versionId !== null && product.review === 'reviewed' &&
      product.satisfiesExactCapability && product.verifiedCapabilities.includes(publication.requiredProductCapability);
    if (!exactProduct) return decision({ ...common, state: 'unavailable', reasons: [reason('product_unavailable', 'heat.unavailable.product')] });
  }
  const temperature = knownValue(input.request.temperature);
  const setting = knownValue(input.request.setting);
  const passes = knownValue(input.request.passes);
  const durationMinutes = knownValue(input.request.durationMinutes);
  const selected = { method, temperature, setting, passes, durationMinutes, zones: input.request.zones };
  const limit = temperature === null ? undefined : publication.limits.temperatures.find(item => item.unit === temperature.unit);
  if (temperature !== null && limit === undefined) return decision({ ...common, state: 'unavailable', reasons: [reason('unit_unreviewed', 'heat.unavailable.unit')] });
  if (passes !== null && publication.limits.maximumPasses !== null && passes > publication.limits.maximumPasses) {
    return decision({ ...common, state: 'restricted', selected, reasons: [reason('passes_exceed_limit', 'heat.restricted.passes')] });
  }
  if (durationMinutes !== null && publication.limits.maximumDurationMinutes !== null && durationMinutes > publication.limits.maximumDurationMinutes) {
    return decision({ ...common, state: 'restricted', selected, reasons: [reason('duration_exceeds_limit', 'heat.restricted.duration')] });
  }
  const selectedProduct = input.preparedInput.products.find(item => item.ownerItemId === input.request.productOwnerItemId);
  const alternatives = publication.alternatives
    .filter(value => value.method === 'unheated' || (
      value.toolVersionId !== null && value.toolVersionId === tool.versionId &&
      (value.productVersionId === null || value.productVersionId === selectedProduct?.versionId)
    ))
    .map(({ toolVersionId: _toolVersionId, productVersionId: _productVersionId, ...value }) => value);
  if (temperature !== null && limit !== undefined && temperature.value > limit.maximum) {
    return decision({ ...common, state: 'lower_heat', selected: { ...selected, temperature: { value: limit.maximum, unit: limit.unit } }, alternatives });
  }
  return decision({ ...common, state: 'appropriate', selected, alternatives });
}

import { z } from 'zod';

import type { RecommendationCondition } from './types.ts';

export const ConfidenceSchema = z.enum(['high', 'moderate', 'limited']);

export const RuleStrengthSchema = z.enum(['hard', 'advisory']);

export const RuleStatusSchema = z.enum(['published', 'withdrawn']);

export const FactValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const nonEmptyString = z.string().trim().min(1);

const AllConditionSchema = z
  .object({
    kind: z.literal('all'),
    conditions: z
      .array(z.lazy((): z.ZodType<RecommendationCondition> => RecommendationConditionSchema))
      .min(1),
  })
  .strict();

const AnyConditionSchema = z
  .object({
    kind: z.literal('any'),
    conditions: z
      .array(z.lazy((): z.ZodType<RecommendationCondition> => RecommendationConditionSchema))
      .min(1),
  })
  .strict();

const NotConditionSchema = z
  .object({
    kind: z.literal('not'),
    condition: z.lazy((): z.ZodType<RecommendationCondition> => RecommendationConditionSchema),
  })
  .strict();

const FactEqualsConditionSchema = z
  .object({
    kind: z.literal('fact_equals'),
    fact: nonEmptyString,
    value: FactValueSchema,
  })
  .strict();

const FactInConditionSchema = z
  .object({
    kind: z.literal('fact_in'),
    fact: nonEmptyString,
    values: z.array(FactValueSchema).min(1),
  })
  .strict();

const CapabilityAvailableConditionSchema = z
  .object({
    kind: z.literal('capability_available'),
    capability: nonEmptyString,
  })
  .strict();

export const RecommendationConditionSchema = z.discriminatedUnion('kind', [
  AllConditionSchema,
  AnyConditionSchema,
  NotConditionSchema,
  FactEqualsConditionSchema,
  FactInConditionSchema,
  CapabilityAvailableConditionSchema,
]);

const RequireCapabilityEffectSchema = z
  .object({
    kind: z.literal('require_capability'),
    capability: nonEmptyString,
  })
  .strict();

const ExcludeCapabilityEffectSchema = z
  .object({
    kind: z.literal('exclude_capability'),
    capability: nonEmptyString,
  })
  .strict();

const OrderBeforeEffectSchema = z
  .object({
    kind: z.literal('order_before'),
    before: nonEmptyString,
    after: nonEmptyString,
  })
  .strict();

const OrderAfterEffectSchema = z
  .object({
    kind: z.literal('order_after'),
    before: nonEmptyString,
    after: nonEmptyString,
  })
  .strict();

const WaitEffectSchema = z
  .object({
    kind: z.literal('wait'),
    durationSeconds: z.number().int().nonnegative(),
  })
  .strict();

const RinseEffectSchema = z
  .object({
    kind: z.literal('rinse'),
    value: z.boolean(),
  })
  .strict();

const FrequencyEffectSchema = z
  .object({
    kind: z.literal('frequency'),
    unit: z.enum(['application', 'shampoo_session', 'wash_session', 'calendar_time']),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(effect => effect.min !== undefined || effect.max !== undefined, {
    message: 'Frequency requires at least one bound',
  })
  .refine(effect => effect.min === undefined || effect.max === undefined || effect.min <= effect.max, {
    message: 'Frequency min must not exceed max',
  });

const HeatRestrictionEffectSchema = z
  .object({
    kind: z.literal('heat_restriction'),
    exposure: z.enum(['direct_contact', 'heated_air', 'hooded_heat', 'steam']),
    prohibited: z.boolean(),
    maxTemperatureCelsius: z.number().finite().optional(),
  })
  .strict();

const AssessedHeatActionEffectSchema = z.object({
  kind: z.literal('assessed_heat_action'),
  publicationId: z.string().uuid(),
  publicationDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();

const PreferCapabilityEffectSchema = z
  .object({
    kind: z.literal('prefer_capability'),
    capability: nonEmptyString,
  })
  .strict();

const ActivationEffectSchema = z
  .object({
    kind: z.literal('activation'),
    capability: nonEmptyString,
  })
  .strict();

export const RecommendationEffectSchema = z.discriminatedUnion('kind', [
  RequireCapabilityEffectSchema,
  ExcludeCapabilityEffectSchema,
  OrderBeforeEffectSchema,
  OrderAfterEffectSchema,
  WaitEffectSchema,
  RinseEffectSchema,
  FrequencyEffectSchema,
  HeatRestrictionEffectSchema,
  AssessedHeatActionEffectSchema,
  ActivationEffectSchema,
  PreferCapabilityEffectSchema,
]);

export const RecommendationRuleSchema = z
  .object({
    ruleId: nonEmptyString,
    versionId: nonEmptyString,
    status: RuleStatusSchema,
    strength: RuleStrengthSchema,
    condition: RecommendationConditionSchema,
    effects: z.array(RecommendationEffectSchema).min(1),
    reason: nonEmptyString,
    evidenceIds: z.array(nonEmptyString),
  })
  .strict();

const capabilityList = z.array(z.string().trim().min(1));

export const ProductCandidateSchema = z
  .object({
    productId: nonEmptyString,
    versionId: nonEmptyString,
    name: nonEmptyString,
    owned: z.boolean(),
    available: z.boolean(),
    verifiedCapabilities: capabilityList,
    unknownCapabilities: capabilityList,
  })
  .strict();

export const ToolCandidateSchema = z
  .object({
    toolId: nonEmptyString,
    versionId: nonEmptyString,
    name: nonEmptyString,
    available: z.boolean(),
    verifiedCapabilities: capabilityList,
  })
  .strict();

const factRecord = z.record(z.string(), FactValueSchema);

export const RecommendationContextSchema = z
  .object({
    requestId: nonEmptyString,
    asOf: z.string().datetime({ offset: true }),
    goal: nonEmptyString,
    profileFacts: factRecord,
    products: z.array(ProductCandidateSchema),
    tools: z.array(ToolCandidateSchema),
    historyFacts: factRecord,
    environmentFacts: factRecord,
    rules: z.array(RecommendationRuleSchema),
  })
  .strict();

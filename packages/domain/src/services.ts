import { z } from 'zod';

import { EffectiveDateSchema, type EffectiveDate } from './dates.ts';

export const ServiceTypeSchema = z.enum([
  'permanent-colour',
  'demi-permanent',
  'semi-permanent',
  'highlights',
  'balayage',
  'bleach-or-lightener',
  'colour-remover',
  'keratin',
  'brazilian-smoothing',
  'nanoplasty',
  'relaxer',
  'texturiser',
  'perm',
  'chemical-straightening',
  'other',
]);

export const ServiceRegionSchema = z.enum([
  'whole-head',
  'front',
  'crown',
  'nape',
  'other',
  'unknown',
]);

export const ServiceSegmentSchema = z.enum([
  'entire-strand',
  'roots',
  'mid-lengths',
  'ends',
  'other',
  'unknown',
]);

export const ServiceZoneSchema = z.object({
  region: ServiceRegionSchema,
  segment: ServiceSegmentSchema,
}).strict();

const ZonesSchema = z.array(ServiceZoneSchema).min(1).max(36)
  .superRefine((zones, context) => {
    const keys = zones.map(({ region, segment }) => `${region}:${segment}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: 'custom',
        message: 'Service zones must be unique',
      });
    }
  })
  .transform((zones) => [...zones].sort((left, right) =>
    `${left.region}:${left.segment}`.localeCompare(
      `${right.region}:${right.segment}`,
    ),
  ));

const utf16Max = (limit: number) => (value: string): boolean =>
  value.length <= limit;

const trimmedNonEmptyText = (limit: number) => z.string().trim().min(1)
  .refine(utf16Max(limit), {
    message: `Expected at most ${limit} UTF-16 code units`,
  });

const trimmedText = (limit: number) => z.string().trim()
  .refine(utf16Max(limit), {
    message: `Expected at most ${limit} UTF-16 code units`,
  });

export const ServiceHeatSchema = z.object({
  method: z.enum(['flat-iron', 'blow-dryer', 'hood-dryer', 'other', 'unknown']),
  temperatureC: z.number().finite().nonnegative().nullable().optional(),
  passes: z.number().finite().int().nonnegative().nullable().optional(),
  durationMinutes: z.number().finite().nonnegative().nullable().optional(),
  source: z.enum(['user-reported', 'user-estimated']),
}).strict();

function validateOtherLabel(
  facts: z.output<typeof ServiceFactsSchemaBase>,
  context: z.RefinementCtx,
): void {
  if (facts.serviceType === 'other' && facts.otherLabel === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['otherLabel'],
      message: 'Other services require an otherLabel',
    });
  }

  if (facts.serviceType === 'other' && facts.otherLabel === null) {
    context.addIssue({
      code: 'custom',
      path: ['otherLabel'],
      message: 'Other services require an otherLabel',
    });
  }

  if (facts.serviceType !== 'other' && facts.otherLabel !== undefined && facts.otherLabel !== null) {
    context.addIssue({
      code: 'custom',
      path: ['otherLabel'],
      message: 'Only other services may include an otherLabel',
    });
  }
}

const ServiceFactsSchemaBase = z.object({
  serviceType: ServiceTypeSchema,
  otherLabel: trimmedNonEmptyText(100).nullable().optional(),
  occurredOn: EffectiveDateSchema,
  productOrSystem: trimmedNonEmptyText(200).nullable().optional(),
  notes: trimmedText(2_000).nullable().optional(),
  zones: ZonesSchema,
  heat: ServiceHeatSchema.nullable().optional(),
}).strict();

export const ServiceFactsSchema = ServiceFactsSchemaBase.superRefine(
  validateOtherLabel,
);

export const ServiceObservationSchema = z.object({
  observedOn: EffectiveDateSchema,
  effectStatus: z.enum(['present', 'not-present', 'unknown']),
}).strict();

export const CreateServiceCommandSchema = z.object({
  operationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  facts: ServiceFactsSchema,
  initialObservation: ServiceObservationSchema.optional(),
}).strict();

export const CorrectServiceCommandSchema = z.object({
  operationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  correctsId: z.string().uuid(),
  reason: trimmedNonEmptyText(500),
  facts: ServiceFactsSchema,
}).strict();

export const ObserveServiceCommandSchema = z.object({
  operationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  observation: ServiceObservationSchema,
}).strict();

export type ServiceType = z.output<typeof ServiceTypeSchema>;
export type ServiceRegion = z.output<typeof ServiceRegionSchema>;
export type ServiceSegment = z.output<typeof ServiceSegmentSchema>;
export type ServiceZone = z.output<typeof ServiceZoneSchema>;
export type ServiceHeat = z.output<typeof ServiceHeatSchema>;
export type ServiceFacts = z.output<typeof ServiceFactsSchema>;
export type ServiceObservation = z.output<typeof ServiceObservationSchema>;
export type CreateServiceCommand = z.output<typeof CreateServiceCommandSchema>;
export type CorrectServiceCommand = z.output<typeof CorrectServiceCommandSchema>;
export type ObserveServiceCommand = z.output<typeof ObserveServiceCommandSchema>;

// Brands, products, and product versions schemas — Milestone 1: My Shelf and provenance

export const BrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim(),
  slug: z.string().trim(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().trim(),
  category: z.enum(['shampoo','clarifier','conditioner','mask','bond/protein treatment','leave-in','heat protectant','anti-humidity','styling cream','mousse','gel','serum','oil','scalp','colour','other']),
  market: z.enum(['ZA','unknown']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProductVersionSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  variant: z.string().trim().nullable(),
  market: z.enum(['ZA','unknown']),
  formulationRef: z.string().trim().nullable(),
  structuredDirections: z.record(z.string(), z.string()),
  ingredients: z.record(z.string(), z.string()).nullable(),
  status: z.enum(['draft','in review','published','superseded/withdrawn']),
  verifiedAt: z.string().datetime().nullable(),
  successorVersionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Brand = z.output<typeof BrandSchema>;
export type Product = z.output<typeof ProductSchema>;
export type ProductVersion = z.output<typeof ProductVersionSchema>;

export const BrandSchemaMap = {
  id: 'id' as const,
  name: 'name' as const,
  slug: 'slug' as const,
};

export const ProductSchemaMap = {
  id: 'id' as const,
  brandId: 'brandId' as const,
  name: 'name' as const,
  category: 'category' as const,
  market: 'market' as const,
};

export const ProductVersionSchemaMap = {
  id: 'id' as const,
  productId: 'productId' as const,
  variant: 'variant' as const,
  market: 'market' as const,
  formulationRef: 'formulationRef' as const,
  structuredDirections: 'structuredDirections' as const,
  ingredients: 'ingredients' as const,
  status: 'status' as const,
  verifiedAt: 'verifiedAt' as const,
  successorVersionId: 'successorVersionId' as const,
};

export type BrandSchemaMap = typeof BrandSchemaMap;
export type ProductSchemaMap = typeof ProductSchemaMap;
export type ProductVersionSchemaMap = typeof ProductVersionSchemaMap;

// User products and revisions schemas — Milestone 1: My Shelf and provenance

export const UserProductSchema = z.object({
  id: z.string().uuid(),
  owner: z.string().uuid(),
  productVersion: z.string().uuid().nullable(),
  manualBrand: z.string().trim().nullable(),
  manualName: z.string().trim().nullable(),
  manualCategory: z.enum(['shampoo','clarifier','conditioner','mask','bond/protein treatment','leave-in','heat protectant','anti-humidity','styling cream','mousse','gel','serum','oil','scalp','colour','other']).nullable(),
  availability: z.enum(['available','out_of_stock','archived']),
  matched: z.boolean(),
  matchedAt: z.string().datetime().nullable(),
  matchConfirmed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UserProductRevisionSchema = z.object({
  id: z.string().uuid(),
  userProductId: z.string().uuid(),
  baseRevision: z.number().int().nonnegative(),
  changedFields: z.record(z.string(), z.string()),
  newValues: z.record(z.string(), z.string()),
  effectiveAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  correctionId: z.string().uuid().nullable(),
});

export type UserProduct = z.output<typeof UserProductSchema>;
export type UserProductRevision = z.output<typeof UserProductRevisionSchema>;

export const UserProductSchemaMap = {
  id: 'id' as const,
  owner: 'owner' as const,
  productVersion: 'productVersion' as const,
  manualBrand: 'manualBrand' as const,
  manualName: 'manualName' as const,
  manualCategory: 'manualCategory' as const,
  availability: 'availability' as const,
  matched: 'matched' as const,
  matchedAt: 'matchedAt' as const,
  matchConfirmed: 'matchConfirmed' as const,
  createdAt: 'createdAt' as const,
  updatedAt: 'updatedAt' as const,
};

export const UserProductRevisionSchemaMap = {
  id: 'id' as const,
  userProductId: 'userProductId' as const,
  baseRevision: 'baseRevision' as const,
  changedFields: 'changedFields' as const,
  newValues: 'newValues' as const,
  effectiveAt: 'effectiveAt' as const,
  recordedAt: 'recordedAt' as const,
  correctionId: 'correctionId' as const,
};

// Manual product-to-catalogue matching schema — Milestone 1: My Shelf and provenance

export const ManualMatchRequestSchema = z.object({
  manualProductId: z.string().uuid(),
  catalogueProductVersionId: z.string().uuid(),
  confirmed: z.boolean(),
});

export const ManualMatchResponseSchema = z.object({
  success: z.boolean(),
  matched: z.boolean(),
  message: z.string(),
});

export type ManualMatchRequest = z.infer<typeof ManualMatchRequestSchema>;
export type ManualMatchResponse = z.infer<typeof ManualMatchResponseSchema>;

// Tool brands, tools, and tool versions schemas — Milestone 2: My Tools

export const ToolBrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim(),
  slug: z.string().trim(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ToolSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().trim(),
  toolType: z.enum(['dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straighter','unheated-rollers','diffusers','other']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ToolVersionSchema = z.object({
  id: z.string().uuid(),
  toolId: z.string().uuid(),
  version: z.string().trim(),
  market: z.enum(['ZA','unknown']),
  capabilities: z.record(z.string(), z.string()),
  temperatureYesNoUnknown: z.enum(['yes','no','unknown']),
  reportedTemperature: z.number().finite().nullable(),
  wattage: z.number().int().nullable(),
  provenance: z.string().trim().nullable(),
  successorVersionId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ToolBrand = z.output<typeof ToolBrandSchema>;
export type Tool = z.output<typeof ToolSchema>;
export type ToolVersion = z.output<typeof ToolVersionSchema>;

export const ToolBrandSchemaMap = {
  id: 'id' as const,
  name: 'name' as const,
  slug: 'slug' as const,
};

export const ToolSchemaMap = {
  id: 'id' as const,
  brandId: 'brandId' as const,
  name: 'name' as const,
  toolType: 'toolType' as const,
};

export const ToolVersionSchemaMap = {
  id: 'id' as const,
  toolId: 'toolId' as const,
  version: 'version' as const,
  market: 'market' as const,
  capabilities: 'capabilities' as const,
  temperatureYesNoUnknown: 'temperatureYesNoUnknown' as const,
  reportedTemperature: 'reportedTemperature' as const,
  wattage: 'wattage' as const,
  provenance: 'provenance' as const,
  successorVersionId: 'successorVersionId' as const,
};

export type ToolBrandSchemaMap = typeof ToolBrandSchemaMap;
export type ToolSchemaMap = typeof ToolSchemaMap;
export type ToolVersionSchemaMap = typeof ToolVersionSchemaMap;

// Activities and heat events schemas — Milestone 3: Activities and heat records

export const ActivityKindSchema = z.enum(['wash','styling','other']);

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  owner: z.string().uuid(),
  kind: ActivityKindSchema,
  occurredAt: z.string().datetime(),
  precision: z.enum(['exact_day','exact_month','exact_year','unknown']),
  zones: z.record(z.string(), z.string()).nullable(),
  notes: z.string().max(2000).nullable(),
  status: z.enum(['active','abandoned']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ActivityRevisionSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  baseRevision: z.number().int().nonnegative(),
  changedFields: z.record(z.string(), z.string()),
  newValues: z.record(z.string(), z.string()),
  effectiveAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  correctionId: z.string().uuid().nullable(),
});

export const HeatEventSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  method: z.enum(['dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straighter','unheated-rollers','diffuser','other']),
  toolVersion: z.string().uuid().nullable(),
  temperature: z.number().finite().nullable(),
  passes: z.number().finite().int().nullable(),
  durationMinutes: z.number().finite().int().nullable(),
  wetDryState: z.enum(['wet','dry','unknown']),
  createdAt: z.string().datetime(),
});

export const ActivityProductLinkSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  productVersion: z.string().uuid().nullable(),
  appliedAt: z.string().datetime().nullable(),
  quantity: z.number().int().nullable(),
});

export const ActivityToolLinkSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  toolVersion: z.string().uuid().nullable(),
  appliedAt: z.string().datetime().nullable(),
});

export type Activity = z.output<typeof ActivitySchema>;
export type ActivityRevision = z.output<typeof ActivityRevisionSchema>;
export type HeatEvent = z.output<typeof HeatEventSchema>;
export type ActivityProductLink = z.output<typeof ActivityProductLinkSchema>;
export type ActivityToolLink = z.output<typeof ActivityToolLinkSchema>;

export const ActivitySchemaMap = {
  id: 'id' as const,
  owner: 'owner' as const,
  kind: 'kind' as const,
  occurredAt: 'occurredAt' as const,
  precision: 'precision' as const,
  zones: 'zones' as const,
  notes: 'notes' as const,
  status: 'status' as const,
  createdAt: 'createdAt' as const,
  updatedAt: 'updatedAt' as const,
};

export const ActivityRevisionSchemaMap = {
  id: 'id' as const,
  activityId: 'activityId' as const,
  baseRevision: 'baseRevision' as const,
  changedFields: 'changedFields' as const,
  newValues: 'newValues' as const,
  effectiveAt: 'effectiveAt' as const,
  recordedAt: 'recordedAt' as const,
  correctionId: 'correctionId' as const,
};

export const HeatEventSchemaMap = {
  id: 'id' as const,
  activityId: 'activityId' as const,
  method: 'method' as const,
  toolVersion: 'toolVersion' as const,
  temperature: 'temperature' as const,
  passes: 'passes' as const,
  durationMinutes: 'durationMinutes' as const,
  wetDryState: 'wetDryState' as const,
  createdAt: 'createdAt' as const,
};

export const ActivityProductLinkSchemaMap = {
  id: 'id' as const,
  activityId: 'activityId' as const,
  productVersion: 'productVersion' as const,
  appliedAt: 'appliedAt' as const,
  quantity: 'quantity' as const,
};

export const ActivityToolLinkSchemaMap = {
  id: 'id' as const,
  activityId: 'activityId' as const,
  toolVersion: 'toolVersion' as const,
  appliedAt: 'appliedAt' as const,
};

export type ActivitySchemaMap = typeof ActivitySchemaMap;
export type ActivityRevisionSchemaMap = typeof ActivityRevisionSchemaMap;
export type HeatEventSchemaMap = typeof HeatEventSchemaMap;
export type ActivityProductLinkSchemaMap = typeof ActivityProductLinkSchemaMap;
export type ActivityToolLinkSchemaMap = typeof ActivityToolLinkSchemaMap;

// Username change schema — Milestone 4: Settings and account completion

export const UsernameChangeSchema = z.object({
  currentUsername: z.string().trim().min(3).max(24).regex(/^[a-z0-9_]+$/),
  newUsername: z.string().trim().min(3).max(24).regex(/^[a-z0-9_]+$/),
});

export type UsernameChangeInput = z.infer<typeof UsernameChangeSchema>;

// Email and password change schemas — Milestone 4: Settings and account completion

export const ChangeEmailSchema = z.object({
  currentEmail: z.string().email(),
  newEmail: z.string().email(),
}).superRefine((data, ctx) => {
  if (data.newEmail === data.currentEmail) {
    ctx.addIssue({
      code: 'custom',
      message: 'New email must be different from current email',
      path: ['newEmail'],
    });
  }
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^a-zA-Z0-9]/, 'Must contain special character'),
});

export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// Analytics consent schema — Milestone 4: Settings and account completion

export const AnalyticsConsentSchema = z.object({
  consent: z.boolean(),
});

export type AnalyticsConsentInput = z.infer<typeof AnalyticsConsentSchema>;

export type { EffectiveDate };
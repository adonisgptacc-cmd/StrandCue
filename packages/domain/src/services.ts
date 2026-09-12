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
  otherLabel: z.string().trim().min(1).max(100).nullable().optional(),
  occurredOn: EffectiveDateSchema,
  productOrSystem: z.string().trim().min(1).max(200).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
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
  reason: z.string().trim().min(1).max(500),
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

export type { EffectiveDate };

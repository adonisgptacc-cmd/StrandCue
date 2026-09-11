import { z } from 'zod';

const exclusiveSelectionValues = new Set(['none', 'unknown']);

function addExclusiveSelectionIssue(
  values: readonly string[],
  context: z.core.$RefinementCtx,
): void {
  const exclusiveValue = values.find((value) =>
    exclusiveSelectionValues.has(value),
  );

  if (exclusiveValue !== undefined && values.length > 1) {
    context.addIssue({
      code: 'custom',
      message: `${exclusiveValue} cannot be combined with another selection`,
    });
  }
}

const NaturalPatternSchema = z.enum([
  'straight',
  'wavy',
  'curly',
  'coily',
  'mixed',
  'unknown',
]);

const StrandDiameterSchema = z.enum([
  'fine',
  'medium',
  'coarse',
  'unknown',
]);

const DensitySchema = z.enum(['low', 'medium', 'high', 'unknown']);
const PorositySchema = z.enum(['low', 'medium', 'high', 'unknown']);
const GreyStatusSchema = z.enum(['none', 'some', 'mostly', 'all', 'unknown']);

const ConcernSchema = z.enum([
  'dryness',
  'frizz',
  'tangling',
  'breakage',
  'split-ends',
  'stiffness',
  'dullness',
  'scalp-dryness',
  'scalp-oiliness',
  'shedding-or-thinning',
  'reported-damage',
  'none',
  'unknown',
]);

const GoalSchema = z.enum([
  'shine',
  'length-retention',
  'definition',
  'moisture-retention',
  'reduced-frizz',
  'manageability',
  'volume',
  'none',
  'unknown',
]);

const ScalpObservationSchema = z.enum([
  'dryness',
  'oiliness',
  'flaking',
  'sensitivity',
  'none',
  'unknown',
]);

const EnvironmentSensitivitySchema = z.enum([
  'humidity',
  'dry-air',
  'wind',
  'water-quality',
  'none',
  'unknown',
]);

const BudgetPreferenceSchema = z.enum([
  'use-owned-first',
  'cheapest-effective',
  'best-value',
  'mid-range',
  'premium',
  'no-preference',
]);

const StylingFrequencySchema = z.enum([
  'daily',
  'several-times-weekly',
  'weekly',
  'less-than-weekly',
  'unknown',
]);

const WigOrExtensionsSchema = z
  .object({
    type: z.string().trim().min(1).max(100).nullable().optional(),
    material: z.string().trim().min(1).max(100).nullable().optional(),
    observationTarget: z.enum(['natural-hair', 'added-hair', 'both', 'unknown']),
  })
  .strict();

const PassportObjectSchema = z
  .object({
    naturalPattern: NaturalPatternSchema,
    strandDiameter: StrandDiameterSchema,
    density: DensitySchema,
    lengthCm: z.number().finite().nonnegative().nullable().optional(),
    greyStatus: GreyStatusSchema.nullable().optional(),
    porosity: PorositySchema.optional(),
    scalpObservations: z.array(ScalpObservationSchema).min(1).optional(),
    concerns: z.array(ConcernSchema).min(1),
    goals: z.array(GoalSchema).min(1),
    stylingHabits: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .optional(),
    stylingFrequency: StylingFrequencySchema.optional(),
    environmentSensitivities: z
      .array(EnvironmentSensitivitySchema)
      .min(1)
      .optional(),
    budgetPreference: BudgetPreferenceSchema,
    maximumProductBudgetZar: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .optional(),
    wigOrExtensions: WigOrExtensionsSchema.nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

function validateExclusiveSelections(
  passport: {
    concerns?: readonly string[];
    goals?: readonly string[];
    scalpObservations?: readonly string[];
    environmentSensitivities?: readonly string[];
  },
  context: z.core.$RefinementCtx,
): void {
  for (const values of [
    passport.concerns,
    passport.goals,
    passport.scalpObservations,
    passport.environmentSensitivities,
  ]) {
    if (values !== undefined) {
      addExclusiveSelectionIssue(values, context);
    }
  }
}

function rejectUndefinedOwnFields(
  value: Record<string, unknown>,
  context: z.core.$RefinementCtx,
): void {
  for (const field of Object.keys(value)) {
    if (value[field] === undefined) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'Explicit undefined values are not supported',
      });
    }
  }
}

export const PassportSchema = PassportObjectSchema.superRefine((passport, context) => {
  rejectUndefinedOwnFields(passport, context);
  validateExclusiveSelections(passport, context);
});

export const PassportPatchSchema = PassportObjectSchema.partial()
  .superRefine((patch, context) => {
    rejectUndefinedOwnFields(patch, context);
    validateExclusiveSelections(patch, context);
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'A Passport patch must change at least one field',
  });

export type Passport = z.output<typeof PassportSchema>;
export type PassportPatch = z.output<typeof PassportPatchSchema>;
export type PassportField = keyof Passport;

export const PASSPORT_FIELDS = [
  'naturalPattern',
  'strandDiameter',
  'density',
  'lengthCm',
  'greyStatus',
  'porosity',
  'scalpObservations',
  'concerns',
  'goals',
  'stylingHabits',
  'stylingFrequency',
  'environmentSensitivities',
  'budgetPreference',
  'maximumProductBudgetZar',
  'wigOrExtensions',
  'notes',
] as const satisfies readonly PassportField[];

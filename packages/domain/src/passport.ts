import { z } from 'zod';
import { DateOnlySchema, currentDateOnly } from './dates.ts';

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

// Self-reported cosmetic observation only: the person's own words about what
// they see, never a diagnosis, a measured severity or photo-derived analysis.
const DamageObservationSchema = z.enum([
  'none',
  'mild',
  'moderate',
  'significant',
  'unknown',
]);

// How much the person wants to minimise heat in their routine. A personal
// preference only: no value here states that any heat level is safe.
const HeatPreferenceSchema = z.enum([
  'avoid-heat',
  'minimise-heat',
  'lower-heat-when-practical',
  'no-preference',
  'unknown',
]);

const LengthUnitSchema = z.enum(['cm', 'in']);
const LengthPrecisionSchema = z.enum(['exact', 'approximate', 'unknown']);
const ReactionSchema = z.string().trim().min(1).max(100);

/** The documented unreasonable-length bound: a recorded length is at most
 * 300 cm after converting inches with factor 2.54 (tolerance 1e-9 keeps the
 * binary float conversion from rejecting the exact 300 cm edge). */
export const MAX_LENGTH_CM = 300;

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

/** One self-measured length: a numeric value always travels with its unit,
 * a known unit always travels with a value, and the measurement date is
 * optional (an explicit `null` means "no date recorded"). Omitted optional
 * answers stay omitted; the transformation never manufactures values. */
const LengthMeasurementSchema = z
  .object({
    value: z.number().finite().positive(),
    unit: LengthUnitSchema,
    precision: LengthPrecisionSchema.optional(),
    measuredOn: z.union([DateOnlySchema, z.null()]).optional(),
  })
  .strict()
  .superRefine((measurement, context) => {
    const centimetres =
      measurement.unit === 'cm'
        ? measurement.value
        : measurement.value * 2.54;
    if (centimetres > MAX_LENGTH_CM + 1e-9) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message:
          'Recorded length must be at most 300 cm after unit conversion',
      });
    }
    if (typeof measurement.measuredOn === 'string' && measurement.measuredOn > currentDateOnly()) {
      // A self-measured length cannot be observed in the future; the same
      // "not after today" rule applies to effective dates.
      context.addIssue({
        code: 'custom',
        path: ['measuredOn'],
        message: 'A measured length cannot be dated after today',
      });
    }
  });

/** A stored length measurement, read as the record holds it. The write
 * path refuses a measurement that is not a real value or that is dated
 * after today; stored history can still carry one, and refusing to open
 * the record would lock the owner out of their own data. */
const StoredLengthMeasurementSchema = z
  .object({
    value: z.number(),
    unit: LengthUnitSchema,
    precision: LengthPrecisionSchema.optional(),
    measuredOn: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const PassportObjectShape = {
    naturalPattern: NaturalPatternSchema,
    strandDiameter: StrandDiameterSchema,
    density: DensitySchema,
    // Legacy readable field: records written before the structured
    // measurement keep their centimetre value until the owner retires it.
    // New writes use `lengthMeasurement` only.
    lengthCm: z.number().finite().nonnegative().nullable().optional(),
    lengthMeasurement: LengthMeasurementSchema.nullable().optional(),
    greyStatus: GreyStatusSchema.nullable().optional(),
    porosity: PorositySchema.optional(),
    damageObservation: DamageObservationSchema.optional(),
    heatPreference: HeatPreferenceSchema.optional(),
    reactionsAvoidances: z.array(ReactionSchema).min(1).max(50).optional(),
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
};

const PassportObjectSchema = z.object(PassportObjectShape).strict();

/** The read shape: a stored measurement is read as the record holds it. */
const PassportReadObjectSchema = z
  .object({
    ...PassportObjectShape,
    lengthMeasurement: StoredLengthMeasurementSchema.nullable().optional(),
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

/** Legacy centimetres and the structured measurement can never both hold a
 * recorded value: one person・one current length, in one contract. */
function rejectMixedLengthFields(
  passport: {
    lengthCm?: number | null;
    lengthMeasurement?: unknown;
  },
  context: z.core.$RefinementCtx,
): void {
  const legacyRecorded =
    passport.lengthCm !== undefined && passport.lengthCm !== null;
  const measured =
    passport.lengthMeasurement !== undefined &&
    passport.lengthMeasurement !== null;
  if (legacyRecorded && measured) {
    context.addIssue({
      code: 'custom',
      path: ['lengthMeasurement'],
      message:
        'Record the current length with lengthMeasurement only; lengthCm is a retired legacy field',
    });
  }
}

/** A new submission can never write a fresh legacy centimetre number: the
 * SQL validator rejects it, so the submission boundary refuses it too and
 * gives the same answer as the database. Stored history stays readable
 * through `PassportReadSchema` / `PassportPatchReadSchema`. */
function rejectLegacyLengthWrite(
  lengthCm: unknown,
  context: z.core.$RefinementCtx,
): void {
  if (typeof lengthCm === 'number') {
    context.addIssue({
      code: 'custom',
      path: ['lengthCm'],
      message:
        'Record lengths in lengthMeasurement; lengthCm is a retired legacy field that history keeps readable',
    });
  }
}

/** Read boundary for stored history: legacy revisions keep their numeric
 * `lengthCm` entry and replay verbatim. */
export const PassportReadSchema = PassportReadObjectSchema.superRefine((passport, context) => {
  rejectUndefinedOwnFields(passport, context);
  validateExclusiveSelections(passport, context);
  rejectMixedLengthFields(passport, context);
});

export const PassportPatchReadSchema = PassportReadObjectSchema.partial()
  .superRefine((patch, context) => {
    rejectUndefinedOwnFields(patch, context);
    validateExclusiveSelections(patch, context);
    rejectMixedLengthFields(patch, context);
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'A Passport patch must change at least one field',
  });

export const PassportSchema = PassportObjectSchema.superRefine((passport, context) => {
  rejectUndefinedOwnFields(passport, context);
  validateExclusiveSelections(passport, context);
  rejectMixedLengthFields(passport, context);
  rejectLegacyLengthWrite(passport.lengthCm, context);
});

export const PassportPatchSchema = PassportObjectSchema.partial()
  .superRefine((patch, context) => {
    rejectUndefinedOwnFields(patch, context);
    validateExclusiveSelections(patch, context);
    rejectMixedLengthFields(patch, context);
    rejectLegacyLengthWrite(patch.lengthCm, context);
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
  'lengthMeasurement',
  'greyStatus',
  'porosity',
  'damageObservation',
  'heatPreference',
  'reactionsAvoidances',
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

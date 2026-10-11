import { z } from 'zod';

import { EffectiveDateSchema } from '../dates.ts';
import { FactValueSchema, RecommendationContextSchema, RecommendationRuleSchema } from '../recommendations/schemas.ts';

/**
 * Reviewed content bundle versions this build understands. A bundle whose
 * version is not listed here is unsupported: the publication gate refuses it
 * rather than guessing at its shape.
 */
export const SUPPORTED_BUNDLE_VERSIONS = ['1'] as const;

const nonEmptyString = z.string().trim().min(1);

const IsoTimestampSchema = z.iso.datetime({ offset: true });

/**
 * Deep-freeze helper. Guidance values cross module boundaries and are
 * persisted for reproducibility, so a later caller must not be able to mutate
 * an already-parsed snapshot, bundle or preparation in place.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
  return value;
}

function frozen<S extends z.ZodType>(schema: S): S {
  return schema.transform(value => deepFreeze(value)) as unknown as S;
}

function uniqueBy<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  message: string,
): (values: readonly T[]) => boolean {
  return values => {
    const seen = new Set<string>();
    for (const value of values) {
      const key = keyOf(value);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  };
}

export const GuidanceGoalIdSchema = z.enum(['basic_wash']);

export const GuidanceAvailabilitySchema = z.enum(['available', 'out_of_stock', 'archived']);

export const GuidanceServicePresenceSchema = z.enum(['present', 'not-present', 'unknown']);

export const GuidanceSourceCompletenessSchema = z.enum([
  'complete',
  'missing',
  'truncated',
  'failed',
]);

export const GuidanceSourceNameSchema = z.enum([
  'passport',
  'services',
  'activities',
  'products',
  'tools',
]);

const GuidanceCompletenessSchema = z
  .object({
    passport: GuidanceSourceCompletenessSchema,
    services: GuidanceSourceCompletenessSchema,
    activities: GuidanceSourceCompletenessSchema,
    products: GuidanceSourceCompletenessSchema,
    tools: GuidanceSourceCompletenessSchema,
  })
  .strict();

const factRecordSchema = z.record(z.string(), FactValueSchema);

export const GuidanceSourceItemSchema = z
  .object({
    ownerItemId: nonEmptyString,
    versionId: nonEmptyString.nullable(),
    name: nonEmptyString,
    availability: GuidanceAvailabilitySchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();

export const GuidanceServiceFactSchema = z
  .object({
    serviceId: nonEmptyString,
    currentPresence: GuidanceServicePresenceSchema,
    // The recorded date keeps its precision. A service recorded as '2026-06'
    // is not silently widened to '2026-06-01', and an unknown date stays
    // unknown rather than being defaulted to today.
    effectiveStart: EffectiveDateSchema.nullable(),
    facts: factRecordSchema,
  })
  .strict();

export const GuidanceActivityFactSchema = z
  .object({
    activityId: nonEmptyString,
    revision: z.number().int().nonnegative(),
    voided: z.boolean(),
    facts: factRecordSchema,
  })
  .strict();

export const GuidanceGoalSchema = z
  .object({
    id: GuidanceGoalIdSchema,
    label: nonEmptyString,
    requiredProfileFacts: z.array(nonEmptyString),
  })
  .strict();

export const GuidanceSnapshotSchema = frozen(
  z
    .object({
      ownerId: nonEmptyString,
      asOf: IsoTimestampSchema,
      loadedAt: IsoTimestampSchema,
      passportFacts: factRecordSchema,
      services: z.array(GuidanceServiceFactSchema),
      activities: z.array(GuidanceActivityFactSchema),
      products: z.array(GuidanceSourceItemSchema),
      tools: z.array(GuidanceSourceItemSchema),
      completeness: GuidanceCompletenessSchema,
    })
    .strict()
    .superRefine((snapshot, context) => {
      const groups = [
        { path: ['services'], label: 'services', key: (entry: { serviceId: string }) => entry.serviceId, items: snapshot.services },
        { path: ['activities'], label: 'activities', key: (entry: { activityId: string }) => entry.activityId, items: snapshot.activities },
        { path: ['products'], label: 'products', key: (entry: { ownerItemId: string }) => entry.ownerItemId, items: snapshot.products },
        { path: ['tools'], label: 'tools', key: (entry: { ownerItemId: string }) => entry.ownerItemId, items: snapshot.tools },
      ];
      for (const group of groups) {
        const isUnique = uniqueBy(
          group.items,
          group.key as (value: unknown) => string,
          `duplicate ${group.label} identity`,
        );
        if (!isUnique(group.items)) {
          context.addIssue({
            code: 'custom',
            path: group.path,
            message: `GuidanceSnapshot contains a duplicate ${group.label} identity`,
          });
        }
      }
    }),
);

export const ReviewedCapabilityEntrySchema = z
  .object({
    kind: z.enum(['product', 'tool']),
    versionId: nonEmptyString,
    displayName: nonEmptyString,
    verifiedCapabilities: z.array(nonEmptyString),
    evidenceIds: z.array(nonEmptyString),
    status: z.enum(['published', 'withdrawn']),
    reviewedAt: IsoTimestampSchema,
    reviewedBy: nonEmptyString,
  })
  .strict()
  .superRefine((entry, context) => {
    const seen = new Set<string>();
    for (const capability of entry.verifiedCapabilities) {
      if (seen.has(capability)) {
        context.addIssue({
          code: 'custom',
          path: ['verifiedCapabilities'],
          message: `Reviewed capability '${capability}' is listed twice`,
        });
      }
      seen.add(capability);
    }
  });

export const ReviewedBundleStatusSchema = z.enum(['draft', 'published', 'withdrawn']);

export const GuidanceBundleVersionSchema = z.enum(SUPPORTED_BUNDLE_VERSIONS);

const hasEvidence = z
  .array(nonEmptyString)
  .min(1, 'Published content requires at least one evidence reference');

const ReviewedCapabilityRegistryEntrySchema = ReviewedCapabilityEntrySchema.superRefine(
  (entry, context) => {
    if (entry.status === 'published' && entry.evidenceIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceIds'],
        message: 'A published capability entry requires evidence',
      });
    }
  },
);

const ReviewedBundleRuleSchema = RecommendationRuleSchema.superRefine((rule, context) => {
  if (rule.status === 'published' && rule.evidenceIds.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['evidenceIds'],
      message: 'A published recommendation rule requires evidence',
    });
  }
});

export const ReviewedGuidanceBundleSchema = frozen(
  z
    .object({
      bundleId: nonEmptyString,
      version: GuidanceBundleVersionSchema,
      status: ReviewedBundleStatusSchema,
      reviewedAt: IsoTimestampSchema,
      reviewedBy: nonEmptyString,
      goals: z.array(GuidanceGoalSchema).min(1),
      capabilities: z.array(ReviewedCapabilityRegistryEntrySchema),
      rules: z.array(ReviewedBundleRuleSchema),
    })
    .strict()
    .superRefine((bundle, context) => {
      const capabilityKeys = bundle.capabilities.map(
        entry => `${entry.kind}\u0000${entry.versionId}`,
      );
      if (new Set(capabilityKeys).size !== capabilityKeys.length) {
        context.addIssue({
          code: 'custom',
          path: ['capabilities'],
          message: 'A reviewed bundle maps one product or tool version exactly once',
        });
      }
      const ruleKeys = bundle.rules.map(rule => rule.ruleId);
      if (new Set(ruleKeys).size !== ruleKeys.length) {
        context.addIssue({
          code: 'custom',
          path: ['rules'],
          message: 'A reviewed bundle carries one version of each rule',
        });
      }
      const goalIds = bundle.goals.map(goal => goal.id);
      if (new Set(goalIds).size !== goalIds.length) {
        context.addIssue({
          code: 'custom',
          path: ['goals'],
          message: 'A reviewed bundle lists each goal once',
        });
      }
    }),
);

export const GuidanceGapKindSchema = z.enum([
  'hair_profile',
  'service_presence',
  'product_version',
  'product_capability',
  'tool_version',
  'tool_capability',
  'source_incomplete',
  'reviewed_content',
]);

export const GuidanceGapSchema = frozen(
  z
    .object({
      kind: GuidanceGapKindSchema,
      detail: nonEmptyString,
      subject: nonEmptyString.nullable(),
    })
    .strict(),
);

export const GuidanceUnavailableReasonSchema = z.enum([
  'bundle_not_published',
  'snapshot_incomplete',
  'no_supported_goal',
]);

const ReadyPreparationSchema = z
  .object({
    status: z.literal('ready'),
    context: RecommendationContextSchema,
    bundleId: nonEmptyString,
    bundleVersion: nonEmptyString,
  })
  .strict();

const NeedsSetupPreparationSchema = z
  .object({
    status: z.literal('needs_setup'),
    missing: z.array(GuidanceGapSchema).min(1),
  })
  .strict();

const UnavailablePreparationSchema = z
  .object({
    status: z.literal('unavailable'),
    reason: GuidanceUnavailableReasonSchema,
  })
  .strict();

export const GuidancePreparationSchema = frozen(
  z.discriminatedUnion('status', [
    ReadyPreparationSchema,
    NeedsSetupPreparationSchema,
    UnavailablePreparationSchema,
  ]),
);

export { deepFreeze, hasEvidence };
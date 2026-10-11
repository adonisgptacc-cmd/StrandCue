import { z } from 'zod';

import { EffectiveDateSchema } from '../dates.ts';
import { ActivityRevisionSchema } from '../activity.ts';
import { FactValueSchema, RecommendationContextSchema, RecommendationRuleSchema } from '../recommendations/schemas.ts';
import type { RecommendationCondition, RecommendationEffect } from '../recommendations/types.ts';
import { isGuidanceCapability } from './capability-vocabulary.ts';

/**
 * Reviewed content bundle versions this build understands. A bundle whose
 * version is not listed here is unsupported: the publication gate refuses it
 * rather than guessing at its shape.
 *
 * Version `1` stays supported so a historical decision run can still be
 * replayed with the exact contract it was produced under. Version `2` is the
 * reviewed-content contract: it must name its author, reference the evidence
 * registry it was built from, and may only use the reviewed capability
 * vocabulary. New tightening applies to version `2` only, so the meaning of an
 * already-executed version `1` bundle never changes.
 */
export const SUPPORTED_BUNDLE_VERSIONS = ['1', '2'] as const;

const REVIEWED_CONTRACT_BUNDLE_VERSION = '2';

export const nonEmptyString = z.string().trim().min(1);

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
    appliedRevisionIds: z.array(nonEmptyString).refine(
      ids => new Set(ids).size === ids.length,
      'Applied revision IDs must be unique',
    ),
    facts: z.object({
      activityKind: z.enum(['wash', 'styling', 'other']).optional(),
      precision: z.enum(['exact_day', 'exact_month', 'exact_year', 'unknown']).optional(),
      status: z.enum(['active', 'voided']).optional(),
    }).strict(),
  })
  .strict();

export const GuidanceActivityCursorSchema = z.object({
  baselineRecordedAt: IsoTimestampSchema,
  activityId: z.string().uuid(),
}).strict();

export const GuidanceActivityHistorySchema = z.object({
  activityId: z.string().uuid(),
  revisions: z.array(ActivityRevisionSchema).min(1),
}).strict().superRefine((history, context) => {
  const revisions = history.revisions;
  const ids = new Set<string>();
  const correctionTargets = new Set<string>();
  const baselineCount = revisions.filter(revision => revision.kind === 'baseline').length;
  if (baselineCount !== 1) {
    context.addIssue({ code: 'custom', path: ['revisions'], message: 'History requires exactly one baseline' });
  }
  revisions.forEach((revision, index) => {
    if (revision.activityId !== history.activityId) {
      context.addIssue({ code: 'custom', path: ['revisions', index, 'activityId'], message: 'Mixed activity IDs' });
    }
    if (ids.has(revision.id)) {
      context.addIssue({ code: 'custom', path: ['revisions', index, 'id'], message: 'Duplicate revision ID' });
    }
    ids.add(revision.id);
    if (revision.sequence !== index + 1 || revision.baseRevision !== index || (revision.kind === 'baseline') !== (index === 0)) {
      context.addIssue({ code: 'custom', path: ['revisions', index], message: 'Broken revision sequence' });
    }
    if (revision.kind === 'correction') {
      const target = revisions.slice(0, index).find(previous => previous.id === revision.correctsId);
      if (!target || Date.parse(target.recordedAt) > Date.parse(revision.recordedAt) || correctionTargets.has(revision.correctsId)) {
        context.addIssue({ code: 'custom', path: ['revisions', index, 'correctsId'], message: 'Invalid correction target' });
      }
      correctionTargets.add(revision.correctsId);
    }
  });
});

export const GuidanceActivityHistoryPageSchema = frozen(z.object({
  items: z.array(GuidanceActivityHistorySchema).max(100),
  nextCursor: GuidanceActivityCursorSchema.nullable(),
}).strict().superRefine((page, context) => {
  const ids = page.items.map(item => item.activityId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Duplicate activity identity' });
  }
}));

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

/** A capability name a rule reads, together with where it was found. */
interface CapabilityReference {
  readonly value: string;
  readonly path: readonly (string | number)[];
}

/**
 * Capability names inside a rule's condition tree. The engine models these as
 * reusable strings; the reviewed-guidance boundary narrows them to the
 * reviewed vocabulary without changing the engine's own types.
 */
function conditionCapabilityReferences(
  condition: RecommendationCondition,
  path: readonly (string | number)[],
): CapabilityReference[] {
  switch (condition.kind) {
    case 'capability_available':
      return [{ value: condition.capability, path: [...path, 'capability'] }];
    case 'all':
    case 'any':
      return condition.conditions.flatMap((child, index) =>
        conditionCapabilityReferences(child, [...path, 'conditions', index]),
      );
    case 'not':
      return conditionCapabilityReferences(condition.condition, [...path, 'condition']);
    default:
      return [];
  }
}

/** Capability names inside a rule's effects, including the two order effects. */
function effectCapabilityReferences(
  effect: RecommendationEffect,
  path: readonly (string | number)[],
): CapabilityReference[] {
  switch (effect.kind) {
    case 'require_capability':
    case 'exclude_capability':
    case 'prefer_capability':
    case 'activation':
      return [{ value: effect.capability, path: [...path, 'capability'] }];
    case 'order_before':
    case 'order_after':
      return [
        { value: effect.before, path: [...path, 'before'] },
        { value: effect.after, path: [...path, 'after'] },
      ];
    default:
      return [];
  }
}

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
    /**
     * Named human who wrote this entry. Optional on its own because a
     * standalone entry does not know its bundle version; a version `2` bundle
     * requires it on every entry, and that is what lets the gate refuse an
     * entry its own author reviewed.
     */
    authoredBy: nonEmptyString.optional(),
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
    if (entry.authoredBy !== undefined && entry.authoredBy === entry.reviewedBy) {
      context.addIssue({
        code: 'custom',
        path: ['authoredBy'],
        message: 'A capability entry must be reviewed by someone other than its author',
      });
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
      /** Required on a version `2` bundle; absent from replayed version `1` bundles. */
      authoredBy: nonEmptyString.optional(),
      /** The evidence registry this bundle was built from. Required on version `2`. */
      evidenceRegistryId: nonEmptyString.optional(),
      evidenceRegistryVersion: nonEmptyString.optional(),
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
      if (bundle.version !== REVIEWED_CONTRACT_BUNDLE_VERSION) return;
      for (const [field, value] of [
        ['authoredBy', bundle.authoredBy],
        ['evidenceRegistryId', bundle.evidenceRegistryId],
        ['evidenceRegistryVersion', bundle.evidenceRegistryVersion],
      ] as const) {
        if (value === undefined) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `A version ${REVIEWED_CONTRACT_BUNDLE_VERSION} bundle records ${field}`,
          });
        }
      }
      bundle.capabilities.forEach((entry, index) => {
        if (entry.authoredBy === undefined) {
          context.addIssue({
            code: 'custom',
            path: ['capabilities', index, 'authoredBy'],
            message: `A version ${REVIEWED_CONTRACT_BUNDLE_VERSION} capability entry records the person who authored it`,
          });
        }
        entry.verifiedCapabilities.forEach((capability, capabilityIndex) => {
          if (!isGuidanceCapability(capability)) {
            context.addIssue({
              code: 'custom',
              path: ['capabilities', index, 'verifiedCapabilities', capabilityIndex],
              message: `'${capability}' is outside the reviewed capability vocabulary`,
            });
          }
        });
      });
      bundle.rules.forEach((rule, index) => {
        const references = [
          ...conditionCapabilityReferences(rule.condition, ['condition']),
          ...rule.effects.flatMap((effect, effectIndex) =>
            effectCapabilityReferences(effect, ['effects', effectIndex]),
          ),
        ];
        for (const reference of references) {
          if (!isGuidanceCapability(reference.value)) {
            context.addIssue({
              code: 'custom',
              path: ['rules', index, ...reference.path],
              message: `'${reference.value}' is outside the reviewed capability vocabulary`,
            });
          }
        }
      });
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

export { deepFreeze, frozen, hasEvidence };

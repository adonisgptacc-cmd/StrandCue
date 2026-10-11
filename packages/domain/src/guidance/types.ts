/**
 * Today guidance contracts.
 *
 * These types describe what Today may read from an owner's existing records
 * (GuidanceSnapshot) and what a reviewed content bundle must contain before
 * any protocol may be generated (ReviewedGuidanceBundle). Nothing here
 * derives a capability from a name, category, image or free text: a product or
 * tool version acquires capabilities only through an exact registry entry.
 */

import type { EffectiveDate } from '../dates.ts';
import type { FactValue, RecommendationContext, RecommendationRule } from '../recommendations/types.ts';

export type GuidanceGoalId = 'basic_wash';

export type GuidanceAvailability = 'available' | 'out_of_stock' | 'archived';

export type GuidanceServicePresence = 'present' | 'not-present' | 'unknown';

export interface GuidanceSourceItem {
  readonly ownerItemId: string;
  readonly versionId: string | null;
  readonly name: string;
  readonly availability: GuidanceAvailability;
  readonly revision: number;
}

export interface GuidanceServiceFact {
  readonly serviceId: string;
  readonly currentPresence: GuidanceServicePresence;
  /** The recorded date with its original precision; `null` when none was recorded. */
  readonly effectiveStart: EffectiveDate | null;
  readonly facts: Readonly<Record<string, FactValue>>;
}

export interface GuidanceActivityFact {
  readonly activityId: string;
  readonly revision: number;
  readonly voided: boolean;
  readonly facts: Readonly<Record<string, FactValue>>;
}

export interface GuidanceGoal {
  readonly id: GuidanceGoalId;
  readonly label: string;
  readonly requiredProfileFacts: readonly string[];
}

export type GuidanceSourceName = 'passport' | 'services' | 'activities' | 'products' | 'tools';

export type GuidanceSourceCompleteness = 'complete' | 'missing' | 'truncated' | 'failed';

export type GuidanceCompleteness = Readonly<Record<GuidanceSourceName, GuidanceSourceCompleteness>>;

export interface GuidanceSnapshot {
  readonly ownerId: string;
  readonly asOf: string;
  readonly loadedAt: string;
  readonly passportFacts: Readonly<Record<string, FactValue>>;
  readonly services: readonly GuidanceServiceFact[];
  readonly activities: readonly GuidanceActivityFact[];
  readonly products: readonly GuidanceSourceItem[];
  readonly tools: readonly GuidanceSourceItem[];
  readonly completeness: GuidanceCompleteness;
}

export type ReviewedCapabilityKind = 'product' | 'tool';

export type ReviewedCapabilityStatus = 'published' | 'withdrawn';

export interface ReviewedCapabilityEntry {
  readonly kind: ReviewedCapabilityKind;
  readonly versionId: string;
  readonly displayName: string;
  readonly verifiedCapabilities: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly status: ReviewedCapabilityStatus;
  readonly reviewedAt: string;
  /** Named human reviewer. Required, so no entry can be published unowned. */
  readonly reviewedBy: string;
}

export type ReviewedBundleStatus = 'draft' | 'published' | 'withdrawn';

export interface ReviewedGuidanceBundle {
  readonly bundleId: string;
  readonly version: string;
  readonly status: ReviewedBundleStatus;
  readonly reviewedAt: string;
  /** Named human reviewer of the bundle as a whole. */
  readonly reviewedBy: string;
  readonly goals: readonly GuidanceGoal[];
  readonly capabilities: readonly ReviewedCapabilityEntry[];
  readonly rules: readonly RecommendationRule[];
}

export type GuidanceGapKind =
  | 'hair_profile'
  | 'service_presence'
  | 'product_version'
  | 'product_capability'
  | 'tool_version'
  | 'tool_capability'
  | 'source_incomplete'
  | 'reviewed_content';

export interface GuidanceGap {
  readonly kind: GuidanceGapKind;
  readonly detail: string;
  readonly subject: string | null;
}

export type GuidanceUnavailableReason =
  | 'bundle_not_published'
  | 'snapshot_incomplete'
  | 'no_supported_goal';

export type GuidancePreparation =
  | {
      readonly status: 'ready';
      readonly context: RecommendationContext;
      readonly bundleId: string;
      readonly bundleVersion: string;
    }
  | {
      readonly status: 'needs_setup';
      readonly missing: readonly GuidanceGap[];
    }
  | {
      readonly status: 'unavailable';
      readonly reason: GuidanceUnavailableReason;
    };
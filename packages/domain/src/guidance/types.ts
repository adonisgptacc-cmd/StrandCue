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
import type { ActivityRevision } from '../activity.ts';
import type { CurrentConditionConcern, CurrentConditionZone } from '../current-condition.ts';
import type { FactValue, RecommendationContext, RecommendationRule } from '../recommendations/types.ts';
import type { ServiceHeat, ServiceZone } from '../services.ts';
import type { ToolHeatMethods, ToolSettings } from '../tools.ts';

export type GuidanceGoalId = 'basic_wash';

export type GuidanceAvailability = 'available' | 'low' | 'empty' | 'out_of_stock' | 'archived';

export type GuidanceServicePresence = 'present' | 'not-present' | 'unknown';

export interface GuidanceSourceItem {
  readonly ownerItemId: string;
  readonly versionId: string | null;
  readonly name: string;
  readonly availability: GuidanceAvailability;
  readonly revision: number;
}

/**
 * What the owner recorded about a tool, exactly as recorded. `null` means the
 * owner never answered; an explicit `unknown` state is a different answer and
 * stays unknown. Nothing here is derived: a wattage is a wattage, never a
 * temperature, and a name never yields a heat method.
 */
export interface GuidanceToolOwnerFacts {
  readonly wattageWatts: number | null;
  readonly adjustableTemp: 'yes' | 'no' | 'unknown' | null;
  readonly settings: ToolSettings | null;
  readonly heatMethods: ToolHeatMethods | null;
}

export interface GuidanceToolItem extends GuidanceSourceItem {
  /** Absent on a snapshot taken before tool owner facts were read; treated as never answered. */
  readonly ownerFacts?: GuidanceToolOwnerFacts;
}

export interface GuidanceServiceFact {
  readonly serviceId: string;
  readonly currentPresence: GuidanceServicePresence;
  /** The recorded date with its original precision; `null` when none was recorded. */
  readonly effectiveStart: EffectiveDate | null;
  readonly facts: Readonly<Record<string, FactValue>>;
  /** The zones the service was recorded for, as recorded. Absent when none were read. */
  readonly zones?: readonly ServiceZone[];
  /** Heat recorded with the service, as recorded. Absent or `null` when none was recorded. */
  readonly heat?: ServiceHeat | null;
}

export interface GuidanceActivityFact {
  readonly activityId: string;
  readonly revision: number;
  readonly voided: boolean;
  readonly appliedRevisionIds: readonly string[];
  readonly facts: Readonly<Record<string, FactValue>>;
}

export interface GuidanceActivityCursor {
  readonly baselineRecordedAt: string;
  readonly activityId: string;
}

export interface GuidanceActivityHistory {
  readonly activityId: string;
  readonly revisions: readonly ActivityRevision[];
}

export interface GuidanceActivityHistoryPage {
  readonly items: readonly GuidanceActivityHistory[];
  readonly nextCursor: GuidanceActivityCursor | null;
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
  readonly tools: readonly GuidanceToolItem[];
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
  /**
   * Named human author. Absent only on replayed version `1` bundles; a
   * version `2` bundle records it on every entry, and the reviewer must then
   * be someone other than the author.
   */
  readonly authoredBy?: string;
}

export type ReviewedBundleStatus = 'draft' | 'published' | 'withdrawn';

export interface ReviewedGuidanceBundle {
  readonly bundleId: string;
  readonly version: string;
  readonly status: ReviewedBundleStatus;
  readonly reviewedAt: string;
  /** Named human reviewer of the bundle as a whole. */
  readonly reviewedBy: string;
  /**
   * Named human author. Absent only on replayed version `1` bundles; required
   * on a version `2` bundle alongside its evidence registry reference.
   */
  readonly authoredBy?: string;
  /** Identity of the checked-in evidence registry this bundle was built from. */
  readonly evidenceRegistryId?: string;
  /** Version of that evidence registry, so a run can be replayed against it. */
  readonly evidenceRegistryVersion?: string;
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
  | 'reviewed_content'
  | 'current_condition';

/**
 * Why a fact cannot be used. The five states never merge: a fact that was never
 * answered (`missing`), one the owner said they do not know (`unknown`), one
 * whose source could not be read (`failed_source`), one that contradicts
 * another answer (`contradictory`), and one no reviewed rule covers
 * (`unsupported`).
 */
export type GuidanceGapState = 'missing' | 'unknown' | 'failed_source' | 'contradictory' | 'unsupported';

/** Where the owner can resolve a gap, when it can be resolved anywhere. */
export type GuidanceGapDestination = 'my_hair' | 'my_hair_services' | 'my_shelf' | 'my_tools' | 'today_check_in';

export interface GuidanceGap {
  readonly kind: GuidanceGapKind;
  readonly detail: string;
  readonly subject: string | null;
  readonly state: GuidanceGapState;
  readonly destination: GuidanceGapDestination | null;
}

export type GuidanceUnavailableReason =
  | 'bundle_not_published'
  | 'snapshot_incomplete'
  | 'no_supported_goal';

export interface GuidanceIncompleteSource {
  readonly source: GuidanceSourceName;
  readonly state: Exclude<GuidanceSourceCompleteness, 'complete'>;
}

// --- The prepared input -------------------------------------------------------------------

/** What the check-in said about one concern today. `none` is an explicit "nothing today". */
export type PreparedConcernAnswer = 'reported' | 'none' | 'not_answered';

export interface PreparedBaseline {
  readonly state: 'recorded' | 'unknown' | 'not_recorded';
  readonly value: FactValue;
}

/**
 * One fact where the durable Passport baseline and the temporary check-in meet.
 * The baseline is always shown as stored; `effective` says which answer governs
 * this one request. The check-in never writes the baseline, and a question it
 * did not answer (`not_answered`) never erases a recorded one.
 */
export interface PreparedEffectiveFact {
  readonly dimension: 'damage' | 'heat';
  readonly baseline: PreparedBaseline;
  readonly current: PreparedConcernAnswer;
  readonly effective: 'current' | 'baseline' | 'not_recorded';
  readonly overridden: boolean;
}

export interface PreparedCondition {
  readonly observedAt: string;
  readonly concerns: readonly CurrentConditionConcern[];
  readonly explicitNone: boolean;
  readonly zones: readonly CurrentConditionZone[];
  readonly zoneConcerns: readonly { readonly zone: CurrentConditionZone; readonly concerns: readonly CurrentConditionConcern[] }[];
}

export interface PreparedService {
  readonly serviceId: string;
  readonly presence: GuidanceServicePresence;
  readonly effectiveStart: EffectiveDate | null;
  readonly zones: readonly ServiceZone[];
}

export interface PreparedHeatEvent {
  readonly serviceId: string;
  readonly method: ServiceHeat['method'];
  readonly temperatureC: number | null;
  readonly passes: number | null;
  readonly durationMinutes: number | null;
  readonly source: ServiceHeat['source'];
  readonly zones: readonly ServiceZone[];
}

export interface PreparedActivity {
  readonly activityId: string;
  readonly kind: 'wash' | 'styling' | 'other' | null;
  readonly precision: 'exact_day' | 'exact_month' | 'exact_year' | 'unknown' | null;
}

/**
 * An available owner record as context. `identity: 'exact'` means the owner
 * linked it to one exact catalogue version; `manual` means they did not. Only an
 * exact version with a published reviewed entry can satisfy a capability.
 */
export interface PreparedOwnerItem {
  readonly ownerItemId: string;
  readonly name: string;
  readonly identity: 'exact' | 'manual';
  readonly versionId: string | null;
  readonly review: 'reviewed' | 'withdrawn' | 'not_reviewed' | 'not_applicable';
  readonly verifiedCapabilities: readonly string[];
  readonly satisfiesExactCapability: boolean;
}

export interface PreparedToolFacts {
  readonly wattageWatts: number | null;
  readonly adjustableTemp: 'yes' | 'no' | 'unknown' | 'not_answered';
  readonly settings: {
    readonly state: 'not_answered' | 'unknown' | 'recorded';
    readonly recordedTemperatures: readonly { readonly label: string; readonly value: number; readonly unit: 'C' | 'F' }[];
  };
  readonly heatMethods: { readonly state: 'not_answered' | 'unknown' | 'recorded'; readonly methods: readonly string[] };
}

export interface PreparedOwnerTool extends PreparedOwnerItem {
  readonly ownerFacts: PreparedToolFacts;
}

/**
 * The one deterministic input Today prepares for a guidance request: the owner's
 * Passport baseline, the temporary check-in, chemical and heat history, relevant
 * zones, the available Shelf products and Tools, the goal, the time and the
 * completeness of every source. It is built from what was recorded and nothing
 * else, in a fixed order, and it holds no reviewer identity, claim or rule.
 */
export interface PreparedGuidanceInput {
  readonly schemaVersion: 1;
  readonly goal: { readonly id: GuidanceGoalId; readonly label: string };
  readonly availableMinutes: number | null;
  readonly passport: { readonly facts: Readonly<Record<string, FactValue>> };
  readonly currentCondition: PreparedCondition | null;
  readonly effectiveFacts: readonly PreparedEffectiveFact[];
  readonly chemicalServices: readonly PreparedService[];
  readonly heatHistory: readonly PreparedHeatEvent[];
  readonly activities: readonly PreparedActivity[];
  readonly products: readonly PreparedOwnerItem[];
  readonly tools: readonly PreparedOwnerTool[];
  readonly completeness: GuidanceCompleteness;
}

export type GuidancePreparation =
  | {
      readonly status: 'ready';
      readonly context: RecommendationContext;
      readonly prepared: PreparedGuidanceInput;
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
      /** Which sources could not be used, when the reason is an incomplete snapshot. */
      readonly incompleteSources?: readonly GuidanceIncompleteSource[];
    };

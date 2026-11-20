/**
 * Evidence contracts.
 *
 * Evidence is the record of what one source was read to support about one
 * exact claim. It is a separate, non-executable artifact: nothing in a
 * registry runs, and a record never grants a capability on its own. It exists
 * so a person can check, later, exactly which source was behind a published
 * capability and what that source could not establish (EV-01, EV-02, EV-03).
 *
 * The source kinds and trust tiers are the ones the shelf already defines, so
 * evidence cannot invent a second, friendlier taxonomy. `T10` is
 * marketing-only and is never evidence of a capability.
 */

import type { SourceType, TrustTier } from '../shelf.ts';

/**
 * `ZA` is the initial market. `unknown` records a source whose market could
 * not be established, which is a recorded gap rather than an assumption that
 * the source applies to South African versions.
 */
export type GuidanceEvidenceMarket = 'ZA' | 'unknown';

/**
 * `draft` evidence is being written and supports nothing. `reviewed` evidence
 * has been independently checked and may support publication. `withdrawn`
 * evidence is no longer usable and is kept for history.
 */
export type GuidanceEvidenceStatus = 'draft' | 'reviewed' | 'withdrawn';

export interface GuidanceEvidenceRecord {
  /** Stable identity used by capabilities and rules to cite this record. */
  readonly evidenceId: string;
  readonly sourceType: SourceType;
  readonly trustTier: TrustTier;
  readonly title: string;
  readonly sourceUrl: string;
  /** Archive copy of the source, or `null` when none was captured. */
  readonly archivedUrl: string | null;
  readonly publisher: string;
  readonly market: GuidanceEvidenceMarket;
  /**
   * The exact catalogue version ids this claim covers, in ascending order. An
   * empty list marks a version-independent claim, such as a rule-level claim
   * that is not about one product version.
   */
  readonly versionIds: readonly string[];
  /** The single claim this source is recorded to support, and nothing more. */
  readonly claim: string;
  /** What this source does not establish. Required: evidence without limits is not evidence. */
  readonly limitations: string;
  readonly checkedAt: string;
  /** Named human who recorded the claim. Never a placeholder. */
  readonly authoredBy: string;
  /** Named human reviewer and the date of that review; both `null` while `draft`. */
  readonly reviewedAt: string | null;
  readonly reviewedBy: string | null;
  readonly status: GuidanceEvidenceStatus;
}

export interface GuidanceEvidenceRegistry {
  readonly registryId: string;
  readonly version: string;
  readonly records: readonly GuidanceEvidenceRecord[];
}

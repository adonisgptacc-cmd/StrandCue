import { GuidanceEvidenceRegistrySchema } from './evidence-schemas.ts';
import type { GuidanceEvidenceRecord } from './evidence-types.ts';
import { ReviewedGuidanceBundleSchema } from './schemas.ts';
import type { ReviewedCapabilityEntry, ReviewedGuidanceBundle } from './types.ts';
import { isCapabilityReviewRow, type CapabilityReviewRow } from './validate-capability-review.ts';

/**
 * Thrown when reviewed content cannot be executed.
 *
 * The message is the only signal the rest of the app gets, so it names the
 * specific reason: an unpublished bundle, withdrawn content, missing
 * evidence, or a review date in the future.
 */
export class ReviewedContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReviewedContentError';
  }
}

/**
 * The only bundle version that may publish.
 *
 * Version `2` is the reviewed-content contract: it names its author, the
 * evidence registry it was built from, and carries only capabilities a person
 * other than the author approved. Version `1` predates all three — no author,
 * no registry reference, capability names from before the closed vocabulary
 * existed — so there is nothing in this gate to check it against. It stays a
 * supported, parseable version so a decision run already executed under it can
 * still be replayed, but replay is not publication: only version `2` executes.
 */
const REVIEWED_CONTRACT_BUNDLE_VERSION = '2';

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function decisionKey(kind: string, versionId: string, capability: string): string {
  return `${kind}\u0000${versionId}\u0000${capability}`;
}

/**
 * Whether one cited evidence id may carry one exact claim, and the refusal
 * naming why it may not.
 *
 * `covers` is the claim scope the citation has to match. A capability is a
 * claim about one exact catalogue version, so it passes that version and a
 * record scoped to anything else is about a different product. A rule about how
 * to wash is not a claim about one version at all, so it passes an empty scope
 * and only a version-independent record can carry it (EV-01, P-03).
 *
 * Only independently reviewed, current, ZA-market evidence may execute:
 * `draft` supports nothing, `withdrawn` is no longer usable, and a review dated
 * after `now` has not happened yet.
 */
function evidenceRefusal(
  subject: string,
  evidenceId: string,
  records: ReadonlyMap<string, GuidanceEvidenceRecord>,
  covers: readonly string[],
  nowAt: number,
): string | null {
  const record = records.get(evidenceId);
  if (record === undefined) {
    return `${subject} cites evidence '${evidenceId}', which no record in the evidence registry holds`;
  }
  if (record.status !== 'reviewed') {
    return `${subject} rests on evidence '${evidenceId}', which is '${record.status}'; only independently reviewed evidence may support published content`;
  }
  // An unreviewed record carries no date at all, and a date this build cannot
  // parse is as good as absent: both fail the comparison and both are refused.
  if (!(Date.parse(record.reviewedAt ?? '') <= nowAt)) {
    return `${subject} rests on evidence '${evidenceId}', whose review date is not at or before the supplied now`;
  }
  if (record.market !== 'ZA') {
    return `${subject} rests on evidence '${evidenceId}', recorded for market '${record.market}' rather than the initial ZA market (P-03)`;
  }
  const scoped =
    covers.length === 0
      ? record.versionIds.length === 0
      : covers.some(versionId => record.versionIds.includes(versionId));
  if (!scoped) {
    const scope = covers.length === 0 ? 'a version-independent claim' : `version '${covers[0]}'`;
    return `${subject} rests on evidence '${evidenceId}', whose recorded claim scope does not cover ${scope} (EV-01)`;
  }
  return null;
}

/**
 * The decisions the capability review matrix records, indexed by the exact
 * `(kind, versionId, capability)` each one settles.
 *
 * The matrix arrives raw, so this is the one place it is read: a matrix that is
 * not a list of rows, a row this build cannot read, or one row that settles the
 * same capability twice is a refusal rather than a silently shorter matrix.
 * Row shape and capability vocabulary come from the review module's own rule
 * (`isCapabilityReviewRow`) rather than a second, weaker copy of it.
 */
function reviewDecisions(
  bundleId: string,
  capabilityReview: unknown,
): ReadonlyMap<string, CapabilityReviewRow> {
  const raw = typeof capabilityReview === 'object' && capabilityReview !== null
    ? capabilityReview as Record<string, unknown>
    : {};
  if (!Array.isArray(raw.rows)) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundleId}' cannot be published: the capability review matrix it was assembled from carries no rows`,
    );
  }
  const decisions = new Map<string, CapabilityReviewRow>();
  raw.rows.forEach((row, index) => {
    if (!isCapabilityReviewRow(row)) {
      throw new ReviewedContentError(
        `Reviewed content bundle '${bundleId}' cannot be published: capability review row ${index} is not a review this build can read`,
      );
    }
    const key = decisionKey(row.kind, row.versionId, row.capability);
    if (decisions.has(key)) {
      throw new ReviewedContentError(
        `Reviewed content bundle '${bundleId}' cannot be published: the capability review matrix decides '${row.capability}' for ${row.kind} version '${row.versionId}' more than once; one version carries one decision per capability`,
      );
    }
    decisions.set(key, row);
  });
  return decisions;
}

/**
 * Whether one capability entry, and the decision behind it, may execute.
 *
 * The entry's own citations and the decision's supporting citations are both
 * checked: an entry that names evidence nobody resolved, or an approval that
 * rests on a different version's evidence, publishes a capability the record
 * does not support (EV-01, EV-05).
 */
function entryRefusal(
  entry: ReviewedCapabilityEntry,
  records: ReadonlyMap<string, GuidanceEvidenceRecord>,
  decisions: ReadonlyMap<string, CapabilityReviewRow>,
  nowAt: number,
): string | null {
  const subject = `Reviewed content bundle capability entry '${entry.versionId}'`;
  if (hasDuplicates(entry.evidenceIds)) {
    return `${subject} cites the same evidence id more than once; one citation is one source`;
  }
  for (const evidenceId of entry.evidenceIds) {
    const refusal = evidenceRefusal(subject, evidenceId, records, [entry.versionId], nowAt);
    if (refusal !== null) return refusal;
  }

  for (const capability of entry.verifiedCapabilities) {
    const about = `${subject} claims '${capability}'`;
    const decision = decisions.get(decisionKey(entry.kind, entry.versionId, capability));
    if (decision === undefined) {
      return `${about} with no row in the capability review matrix; a capability is only ever published from a recorded decision`;
    }
    if (decision.decision !== 'approved') {
      return `${about} that the capability review matrix records as '${decision.decision}'; only an approved decision may be published`;
    }
    if (decision.reviewedBy === null || decision.reviewedAt === null) {
      return `${about} on a decision no second person checked; an approval records the reviewer and the date of that review`;
    }
    if (decision.reviewedBy === decision.authoredBy) {
      return `${about} on a decision its own author approved; the point of a second reviewer is that it is a second person (EV-05)`;
    }
    if (Date.parse(decision.reviewedAt) > nowAt) {
      return `${about} on a decision approved after the supplied now`;
    }
    if (decision.supportingEvidenceIds.length === 0) {
      return `${about} on a decision with no supporting evidence; an approval rests on evidence, not on an assertion`;
    }
    for (const evidenceId of decision.supportingEvidenceIds) {
      const refusal = evidenceRefusal(about, evidenceId, records, [entry.versionId], nowAt);
      if (refusal !== null) return refusal;
    }
  }
  return null;
}

/** Whether one rule's citations may execute. */
function ruleRefusal(
  ruleId: string,
  evidenceIds: readonly string[],
  records: ReadonlyMap<string, GuidanceEvidenceRecord>,
  nowAt: number,
): string | null {
  const subject = `Reviewed content bundle rule '${ruleId}'`;
  if (hasDuplicates(evidenceIds)) {
    return `${subject} cites the same evidence id more than once; one citation is one source`;
  }
  for (const evidenceId of evidenceIds) {
    const refusal = evidenceRefusal(subject, evidenceId, records, [], nowAt);
    if (refusal !== null) return refusal;
  }
  return null;
}

/**
 * Referential integrity for a published bundle.
 *
 * Only the reviewed-content contract version reaches this, so the registry it
 * names has to be the registry actually handed in; every citation has to resolve
 * inside it to a reviewed, current, ZA record whose claim scope covers the exact
 * thing being claimed; and every capability has to come from a review-matrix
 * decision a named second person approved against that same evidence (EV-01,
 * EV-02, EV-05, P-03, P-11). Any refusal stops the whole bundle: there is no
 * partial acceptance.
 */
function assertPublicationIntegrity(
  bundle: ReviewedGuidanceBundle,
  evidenceRegistry: unknown,
  capabilityReview: unknown,
  nowAt: number,
): void {
  const registry = GuidanceEvidenceRegistrySchema.safeParse(evidenceRegistry);
  if (!registry.success) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' cannot be published: the evidence registry it was built from is not readable (${registry.error.issues[0]?.message ?? 'unknown validation failure'})`,
    );
  }
  if (
    bundle.evidenceRegistryId !== registry.data.registryId ||
    bundle.evidenceRegistryVersion !== registry.data.version
  ) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' names evidence registry '${bundle.evidenceRegistryId}' version '${bundle.evidenceRegistryVersion}', which is not the registry it was handed`,
    );
  }

  const records = new Map(registry.data.records.map(record => [record.evidenceId, record]));
  const decisions = reviewDecisions(bundle.bundleId, capabilityReview);

  for (const entry of bundle.capabilities) {
    const refusal = entryRefusal(entry, records, decisions, nowAt);
    if (refusal !== null) throw new ReviewedContentError(refusal);
  }
  for (const rule of bundle.rules) {
    const refusal = ruleRefusal(rule.ruleId, rule.evidenceIds, records, nowAt);
    if (refusal !== null) throw new ReviewedContentError(refusal);
  }
}

/**
 * Publication gate.
 *
 * `validatePublishedBundle` is the only route from reviewed content to
 * generation. It parses strictly, then refuses anything that is not the
 * reviewed-content contract version, a fully published, independently reviewed,
 * evidenced, non-withdrawn bundle reviewed no later than `now`, whose every
 * citation resolves inside the checked-in evidence registry and review matrix.
 * There is no partial acceptance: a bundle that fails any check cannot produce
 * guidance.
 */
export function validatePublishedBundle(
  input: unknown,
  evidenceRegistry: unknown,
  capabilityReview: unknown,
  now: string,
): ReviewedGuidanceBundle {
  const raw = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {};
  const rawCapabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  const entriesWithoutReviewer = rawCapabilities.filter(
    entry =>
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as Record<string, unknown>).reviewedBy !== 'string' ||
      String((entry as Record<string, unknown>).reviewedBy).trim() === '',
  );
  if (typeof raw.reviewedBy !== 'string' || raw.reviewedBy.trim() === '') {
    throw new ReviewedContentError(
      'Reviewed content must name the reviewer who checked the bundle before it can be published',
    );
  }
  if (entriesWithoutReviewer.length > 0) {
    throw new ReviewedContentError(
      'Every published capability entry must name the reviewer who checked it',
    );
  }
  // An unusable clock would silently make every later comparison false, which
  // is a bundle published without ever being dated.
  const nowAt = Date.parse(now);
  if (Number.isNaN(nowAt)) {
    throw new ReviewedContentError(
      `'${now}' is not an instant, so no review or evidence date can be compared against it`,
    );
  }
  const parsed = ReviewedGuidanceBundleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewedContentError(
      `Reviewed content is malformed and cannot be published: ${parsed.error.issues[0]?.message ?? 'unknown validation failure'}`,
    );
  }
  const bundle = parsed.data;
  if (bundle.status !== 'published') {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' is '${bundle.status}' and is not published`,
    );
  }
  if (bundle.authoredBy !== undefined && bundle.authoredBy === bundle.reviewedBy) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' is reviewed by the person who authored it; the point of a second reviewer is that it is a second person (EV-05)`,
    );
  }
  if (Date.parse(bundle.reviewedAt) > nowAt) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' carries a review date after the supplied now`,
    );
  }
  const withdrawn = bundle.capabilities.find(entry => entry.status !== 'published');
  if (withdrawn !== undefined) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' carries a withdrawn capability entry for '${withdrawn.kind}' version '${withdrawn.versionId}'`,
    );
  }
  const futureEntry = bundle.capabilities.find(entry => Date.parse(entry.reviewedAt) > nowAt);
  if (futureEntry !== undefined) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' carries a capability entry reviewed after the supplied now`,
    );
  }
  const withdrawnRule = bundle.rules.find(entry => entry.status !== 'published');
  if (withdrawnRule !== undefined) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' carries a withdrawn rule '${withdrawnRule.ruleId}'`,
    );
  }
  // Last, so that a bundle with a more specific fault — an unowned reviewer, a
  // date after now, withdrawn content — is still reported as that fault. Only a
  // bundle that survives every other check reaches the contract question, and
  // version `1` cannot answer it: the version this repository ships is `1`, so
  // publishing it here would execute content no registry or review ever checked.
  if (bundle.version !== REVIEWED_CONTRACT_BUNDLE_VERSION) {
    throw new ReviewedContentError(
      `Reviewed content bundle '${bundle.bundleId}' is version '${bundle.version}'; only version ${REVIEWED_CONTRACT_BUNDLE_VERSION}, the reviewed content contract, may publish. A version ${bundle.version} bundle stays parseable so a decision run already executed under it can still be replayed, but it never executes`,
    );
  }
  assertPublicationIntegrity(bundle, evidenceRegistry, capabilityReview, nowAt);
  return bundle;
}
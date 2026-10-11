import { ReviewedGuidanceBundleSchema } from './schemas.ts';
import type { ReviewedGuidanceBundle } from './types.ts';

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
 * Publication gate.
 *
 * `validatePublishedBundle` is the only route from reviewed content to
 * generation. It parses strictly, then refuses anything that is not a fully
 * published, evidenced, non-withdrawn bundle reviewed no later than `now`.
 * There is no partial acceptance: a bundle that fails any check cannot
 * produce guidance.
 */
export function validatePublishedBundle(input: unknown, now: string): ReviewedGuidanceBundle {
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
  if (Date.parse(bundle.reviewedAt) > Date.parse(now)) {
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
  const futureEntry = bundle.capabilities.find(
    entry => Date.parse(entry.reviewedAt) > Date.parse(now),
  );
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
  return bundle;
}
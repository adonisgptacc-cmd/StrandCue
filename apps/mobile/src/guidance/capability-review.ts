import type { CapabilityReviewMatrix } from '../../../../packages/domain/src/index';

/**
 * The claim-to-capability review matrix this build executes against.
 *
 * It mirrors `docs/product/evidence/basic-wash-v1/capability-review.json`
 * exactly and is updated with it. It records no decision: a capability may only
 * be published from a row a named reviewer other than its author approved
 * against claim-scoped evidence, and no such review has happened in this
 * repository. An empty matrix is the honest state, and the publication gate
 * refuses every capability it cannot find a decided row for.
 *
 * As with the evidence registry, the artifact is handed on unvalidated and is
 * checked once inside the publication gate.
 */
export const CHECKED_IN_CAPABILITY_REVIEW: CapabilityReviewMatrix = {
  reviewId: 'basic-wash-v1-capability-review',
  version: '1',
  rows: [],
};
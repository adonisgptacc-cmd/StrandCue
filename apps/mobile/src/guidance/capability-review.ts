import type { CapabilityReviewMatrix } from '../../../../packages/domain/src/index';

/**
 * The claim-to-capability review matrix this build executes against.
 *
 * It mirrors `docs/product/evidence/basic-wash-v1/capability-review.json`
 * exactly and is updated with it. It records two draft decisions (shampoo to
 * `cleanse`, conditioner to `condition`): a draft has not been decided, so no
 * capability may be published from it, and the publication gate refuses every
 * capability it cannot find a decided row for.
 *
 * As with the evidence registry, the artifact is handed on unvalidated and is
 * checked once inside the publication gate.
 */
export const CHECKED_IN_CAPABILITY_REVIEW: CapabilityReviewMatrix = {
  reviewId: 'basic-wash-v1-capability-review',
  version: '1',
  rows: [
    {
      kind: 'product',
      versionId: '96759932-6d87-56c2-8165-8f95260447f4',
      capability: 'cleanse',
      supportingEvidenceIds: [
        '1304be5a-122f-5032-b84d-b40451174344',
        '985e618b-9e69-5dbf-ab0e-238533dd9740',
      ],
      contradictedByEvidenceIds: [],
      decision: 'draft',
      rationale: 'Draft only: the manufacturer directions for this exact shampoo version say to squeeze, lather and rinse thoroughly, which describes a rinse-off cleansing use; nothing is decided until independent human review.',
      authoredBy: 'task-07-draft-research',
      reviewedBy: null,
      reviewedAt: null,
    },
    {
      kind: 'product',
      versionId: '6ae2cd7a-2d89-5d16-a07d-36ca44139c59',
      capability: 'condition',
      supportingEvidenceIds: [
        'c74677b0-75f8-5b64-bb3a-c18d3148d47f',
        'fdecd8f8-871e-5a0c-8ed5-e063124e51d7',
      ],
      contradictedByEvidenceIds: [],
      decision: 'draft',
      rationale: 'Draft only: the manufacturer directions for this exact conditioner version say to apply after shampoo, massage into wet hair and rinse thoroughly, which describes a rinse-off conditioning use; nothing is decided until independent human review.',
      authoredBy: 'task-07-draft-research',
      reviewedBy: null,
      reviewedAt: null,
    },
  ],
};

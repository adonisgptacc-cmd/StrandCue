import { ReviewedGuidanceBundleSchema } from '../../../../packages/domain/src/index';
import type { ReviewedGuidanceBundle } from '../../../../packages/domain/src/index';

/**
 * The production reviewed-content registry.
 *
 * It is deliberately a `draft` bundle with no capability mappings and no
 * rules. Nothing in this repository contains an approved content artifact
 * that maps a real product or tool version to reviewed capabilities with
 * evidence, so publishing anything here would be invention.
 *
 * To publish real guidance content later, follow
 * `docs/runbooks/guidance-content-publication.md`: research the exact
 * version, record evidence with reviewer and date, add the mapping and rules
 * here with status `published`, then have a second reviewer approve the
 * change before release.
 */
export const CURRENT_REVIEWED_BUNDLE: ReviewedGuidanceBundle = ReviewedGuidanceBundleSchema.parse({
  bundleId: 'today-core-guidance',
  version: '1',
  status: 'draft',
  reviewedAt: '2026-10-11T00:00:00.000Z',
  goals: [
    {
      id: 'basic_wash',
      label: 'Basic wash',
      requiredProfileFacts: ['pattern'],
    },
  ],
  capabilities: [],
  rules: [],
});
import { ReviewedGuidanceBundleSchema } from '../../../../packages/domain/src/index.ts';
import type { ReviewedGuidanceBundle } from '../../../../packages/domain/src/index.ts';

/**
 * The production reviewed-content registry.
 *
 * A version `2` draft bundle: the reviewed-content contract version, still
 * awaiting its first independent review. It carries no capability mappings —
 * this repository holds zero catalogue rows and zero approved capability rows,
 * so any mapping here would be invention — and its single rule is a
 * non-executable placeholder. `withdrawn` is the rule DSL's only
 * non-executable state, so the draft route uses it; the rule has never been
 * published, cites no evidence, and cannot execute while the bundle is a
 * draft. The named author and reviewer below are honest draft markers, not
 * people who reviewed content: no independent review has happened.
 *
 * To publish real guidance content later, follow
 * `docs/runbooks/guidance-content-publication.md`: research the exact
 * version, record evidence with reviewer and date, add the mapping and the
 * rule with an executable status, then have a second reviewer approve the
 * change before release. Version `1` stays parseable for replay but is never
 * edited in place.
 */
export const CURRENT_REVIEWED_BUNDLE: ReviewedGuidanceBundle = ReviewedGuidanceBundleSchema.parse({
  bundleId: 'today-core-guidance',
  version: '2',
  status: 'draft',
  reviewedAt: '2026-10-11T00:00:00.000Z',
  // Draft markers only. No independent review of bundle content has happened.
  reviewedBy: 'unassigned-draft-reviewer',
  authoredBy: 'unassigned-draft-author',
  evidenceRegistryId: 'basic-wash-evidence',
  evidenceRegistryVersion: '1',
  goals: [
    {
      id: 'basic_wash',
      label: 'Basic wash',
      requiredProfileFacts: ['pattern'],
    },
  ],
  capabilities: [],
  rules: [
    {
      ruleId: 'basic-wash-cleanse-condition',
      versionId: '1',
      // Non-executable placeholder for the basic wash route. Uses only the
      // reviewed capability vocabulary: cleanse, then condition, no tool.
      status: 'withdrawn',
      strength: 'hard',
      condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
      effects: [
        { kind: 'require_capability', capability: 'cleanse' },
        { kind: 'require_capability', capability: 'condition' },
        { kind: 'order_before', before: 'cleanse', after: 'condition' },
      ],
      reason: 'A basic wash cleanses first and then conditions; no tool is required.',
      evidenceIds: [],
    },
  ],
});

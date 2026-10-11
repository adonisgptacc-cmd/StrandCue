/**
 * Evidence schemas.
 *
 * The evidence registry is parsed strictly and frozen deeply: it is a checked
 * in artifact that crosses process boundaries, and a record that could be
 * edited after it was parsed would be evidence of nothing. Nothing here is
 * executable — these schemas describe what a person recorded, and the
 * publication gate decides separately what may act on it.
 */

import { z } from 'zod';

import { SourceTypeSchema, TrustTierSchema, isEvidenceTier } from '../shelf.ts';
import { frozen, nonEmptyString } from './schemas.ts';

const IsoTimestampSchema = z.iso.datetime({ offset: true });

export const GuidanceEvidenceMarketSchema = z.enum(['ZA', 'unknown']);

export const GuidanceEvidenceStatusSchema = z.enum(['draft', 'reviewed', 'withdrawn']);

/**
 * Identities that stand in for a person without naming one. A registry that
 * records "unknown" as the reviewer has recorded that nobody checked the
 * claim, which is the opposite of what the field means.
 */
const PLACEHOLDER_IDENTITIES: ReadonlySet<string> = new Set([
  'unknown',
  'unassigned',
  'unassigned-draft',
  'n/a',
  'na',
  'none',
  'null',
  'nil',
  'tbd',
  'tba',
  'todo',
  'pending',
  'placeholder',
  'example',
  'reviewer',
  'author',
  'reviewer-1',
  'reviewer-a',
  'reviewer-b',
  'author-a',
  'author-b',
  'fixture',
  'fake',
  'dummy',
  'synthetic',
  'test',
]);

export function isPlaceholderIdentity(value: string): boolean {
  return PLACEHOLDER_IDENTITIES.has(value.trim().toLowerCase());
}

const namedHumanSchema = nonEmptyString.refine(
  value => !isPlaceholderIdentity(value),
  'A named human is required; a placeholder is not a person',
);

const exactVersionIdsSchema = z
  .array(nonEmptyString)
  .refine(ids => new Set(ids).size === ids.length, 'A record lists each exact version once')
  .refine(
    ids => ids.every((id, index) => index === 0 || ids[index - 1]! < id),
    'Exact version ids must ascend, so the same claim always normalizes identically',
  );

export const GuidanceEvidenceRecordSchema = frozen(
  z
    .object({
      evidenceId: nonEmptyString,
      sourceType: SourceTypeSchema,
      trustTier: TrustTierSchema,
      title: nonEmptyString,
      sourceUrl: z.url(),
      archivedUrl: z.url().nullable(),
      publisher: nonEmptyString,
      market: GuidanceEvidenceMarketSchema,
      versionIds: exactVersionIdsSchema,
      claim: nonEmptyString,
      limitations: nonEmptyString,
      checkedAt: IsoTimestampSchema,
      authoredBy: namedHumanSchema,
      reviewedAt: IsoTimestampSchema.nullable(),
      reviewedBy: namedHumanSchema.nullable(),
      status: GuidanceEvidenceStatusSchema,
    })
    .strict()
    .superRefine((record, context) => {
      const isEvidence = isEvidenceTier(record.trustTier);
      if (!isEvidence && record.sourceType !== 'marketing') {
        context.addIssue({
          code: 'custom',
          path: ['trustTier'],
          message: 'Marketing-only evidence must be recorded as a marketing source',
        });
      }
      if (record.status === 'draft' && (record.reviewedAt !== null || record.reviewedBy !== null)) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedAt'],
          message: 'Draft evidence carries no review: it has not been checked by a second person',
        });
      }
      if (record.status === 'reviewed' && (record.reviewedAt === null || record.reviewedBy === null)) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedBy'],
          message: 'Reviewed evidence records the reviewer and the date of that review',
        });
      }
      if (record.status === 'reviewed' && !isEvidence) {
        context.addIssue({
          code: 'custom',
          path: ['trustTier'],
          message: 'Marketing-only evidence never supports reviewed content',
        });
      }
      if (record.reviewedBy !== null && record.reviewedBy === record.authoredBy) {
        context.addIssue({
          code: 'custom',
          path: ['reviewedBy'],
          message: 'Evidence must be reviewed by someone other than the person who recorded it',
        });
      }
    }),
);

export const GuidanceEvidenceRegistrySchema = frozen(
  z
    .object({
      registryId: nonEmptyString,
      version: nonEmptyString,
      records: z.array(GuidanceEvidenceRecordSchema),
    })
    .strict()
    .superRefine((registry, context) => {
      const ids = registry.records.map(record => record.evidenceId);
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: ['records'],
          message: 'An evidence registry lists each evidence id once',
        });
      }
    }),
);

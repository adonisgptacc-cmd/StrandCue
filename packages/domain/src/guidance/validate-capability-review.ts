/**
 * Claim-to-capability review matrix.
 *
 * The matrix is where one recorded claim about one exact catalogue version
 * becomes one recorded decision about one capability. It is the only source a
 * published reviewed bundle may later be assembled from, and a row is only
 * assemblable when a person other than its author reviewed it against evidence
 * whose claim scope covers that exact version (P-03, P-05, EV-01, EV-05).
 *
 * Nothing here reads a product name, a brand, a category, an ingredient list,
 * an image or any free text. A row names a catalogue `versionId` and a name
 * from the closed reviewed vocabulary, and everything else is a citation and a
 * dated, independent judgement. That is the anti-invention boundary: a
 * capability that no reviewed, claim-scoped evidence carries is recorded as
 * `insufficient_evidence`, which is a real and accepted answer to the question
 * "can this version do this?" — it is "not established", not "probably".
 *
 * Only `approved` is executable. `draft` has not been decided, `rejected` has
 * been decided against, and `insufficient_evidence` records that the sources
 * read could not establish the claim; none of the three may become a
 * capability.
 */

import { z } from 'zod';

import { isEvidenceTier } from '../shelf.ts';
import { BASIC_WASH_CAPABILITIES, type GuidanceCapability } from './capability-vocabulary.ts';
import { GuidanceEvidenceRegistrySchema, isPlaceholderIdentity } from './evidence-schemas.ts';
import type { GuidanceEvidenceRecord } from './evidence-types.ts';
import { frozen, nonEmptyString } from './schemas.ts';

export const CAPABILITY_REVIEW_DECISIONS = [
  'draft',
  'approved',
  'rejected',
  'insufficient_evidence',
] as const;

export type CapabilityReviewDecision = (typeof CAPABILITY_REVIEW_DECISIONS)[number];

export function isCapabilityReviewDecision(value: string): value is CapabilityReviewDecision {
  return (CAPABILITY_REVIEW_DECISIONS as readonly string[]).includes(value);
}

export interface CapabilityReviewRow {
  readonly kind: 'product' | 'tool';
  /** The exact catalogue row this decision is about. Never a name (SH-02). */
  readonly versionId: string;
  readonly capability: GuidanceCapability;
  /** Evidence that supports the claim, in the order it was read. */
  readonly supportingEvidenceIds: readonly string[];
  /** Evidence that tells against the claim. An approval may carry none. */
  readonly contradictedByEvidenceIds: readonly string[];
  readonly decision: CapabilityReviewDecision;
  /** Why a person reached this decision, in their words. Never empty. */
  readonly rationale: string;
  readonly authoredBy: string;
  /** The independent reviewer and the date of that review; both `null` while `draft`. */
  readonly reviewedBy: string | null;
  readonly reviewedAt: string | null;
}

export interface CapabilityReviewMatrix {
  readonly reviewId: string;
  readonly version: string;
  readonly rows: readonly CapabilityReviewRow[];
}

const IsoTimestampSchema = z.iso.datetime({ offset: true });

const CapabilityReviewKindSchema = z.enum(['product', 'tool']);

const citedEvidenceIds = z
  .array(nonEmptyString)
  .refine(ids => new Set(ids).size === ids.length, 'A row cites each evidence id once');

/**
 * One decided claim, checked for shape only: types, closed vocabulary, exact
 * ids, no extra columns. Everything that needs the registry, the inventory or
 * a clock is a separate finding, so that this schema stays a pure predicate
 * the publication gate can apply to a raw row it has not been handed a
 * validated matrix for.
 */
export const CapabilityReviewRowSchema = frozen(
  z
    .object({
      kind: CapabilityReviewKindSchema,
      versionId: z.uuid(),
      // The single place the closed capability vocabulary is enforced for a row.
      capability: z.enum(BASIC_WASH_CAPABILITIES),
      supportingEvidenceIds: citedEvidenceIds,
      contradictedByEvidenceIds: citedEvidenceIds,
      decision: z.enum(CAPABILITY_REVIEW_DECISIONS),
      rationale: nonEmptyString,
      authoredBy: nonEmptyString,
      reviewedBy: nonEmptyString.nullable(),
      reviewedAt: IsoTimestampSchema.nullable(),
    })
    .strict(),
);

export const CapabilityReviewMatrixSchema = frozen(
  z
    .object({
      reviewId: nonEmptyString,
      version: nonEmptyString,
      rows: z.array(CapabilityReviewRowSchema),
    })
    .strict(),
);

/**
 * Row shape and capability-vocabulary membership, needing no registry, no
 * inventory and no clock. The publication gate reuses this so that a raw row
 * is refused by exactly the rule that is tested here rather than by a second,
 * weaker copy of it.
 */
export function isCapabilityReviewRow(value: unknown): value is CapabilityReviewRow {
  return CapabilityReviewRowSchema.safeParse(value).success;
}

export const CAPABILITY_REVIEW_FINDING_CODES = [
  'APPROVAL_IGNORES_CONTRADICTION',
  'APPROVAL_ON_MARKETING_ONLY',
  'APPROVAL_WITHOUT_EVIDENCE',
  'ARTIFACT_SHAPE',
  'DRAFT_REVIEW_CLAIMED',
  'DUPLICATE_ROW',
  'EVIDENCE_MARKET_UNSCOPED',
  'EVIDENCE_NOT_REVIEWED',
  'EVIDENCE_UNKNOWN',
  'EVIDENCE_UNSCOPED',
  'INVALID_NOW',
  'PLACEHOLDER_REVIEWER',
  'REVIEW_FUTURE',
  'REVIEW_INCOMPLETE',
  'SELF_REVIEWED',
  'VERSION_NOT_INVENTORIED',
] as const;

export type CapabilityReviewFindingCode = (typeof CAPABILITY_REVIEW_FINDING_CODES)[number];

export interface CapabilityReviewFinding {
  readonly code: CapabilityReviewFindingCode;
  readonly message: string;
}

export type CapabilityReviewResult =
  | { readonly ok: true; readonly matrix: CapabilityReviewMatrix }
  | { readonly ok: false; readonly findings: readonly CapabilityReviewFinding[] };

/**
 * The research inventory, reduced to the two fields a capability row resolves
 * against. Unrecognised columns are stripped rather than refused: the research
 * validator owns the inventory's full contract, and restating it here would
 * let a second, weaker copy of that contract drift away from the real one.
 */
const InventoriedVersionsSchema = z.object({
  rows: z.array(
    z.object({
      kind: CapabilityReviewKindSchema,
      versionId: nonEmptyString,
    }),
  ),
});

function finding(code: CapabilityReviewFindingCode, message: string): CapabilityReviewFinding {
  return Object.freeze({ code, message });
}

function shapeFindings(
  artifact: string,
  issues: readonly z.core.$ZodIssue[],
): CapabilityReviewFinding[] {
  return issues.map(issue =>
    finding('ARTIFACT_SHAPE', `${artifact} ${issue.path.join('.')} ${issue.message}`),
  );
}

function reject(findings: readonly CapabilityReviewFinding[]): CapabilityReviewResult {
  return Object.freeze({ ok: false as const, findings: Object.freeze([...findings]) });
}

function accept(matrix: CapabilityReviewMatrix): CapabilityReviewResult {
  return Object.freeze({ ok: true as const, matrix });
}

/** Who checked a row, and when. A decision nobody second-checked is not one. */
function reviewFindings(
  label: string,
  row: CapabilityReviewRow,
  nowAt: number,
): CapabilityReviewFinding[] {
  const findings: CapabilityReviewFinding[] = [];
  if (isPlaceholderIdentity(row.authoredBy)) {
    findings.push(finding('PLACEHOLDER_REVIEWER', `${label} is authored by '${row.authoredBy}', which names nobody`));
  }

  const claimsReview = row.reviewedBy !== null || row.reviewedAt !== null;
  if (row.decision === 'draft') {
    if (claimsReview) {
      findings.push(finding('DRAFT_REVIEW_CLAIMED', `${label} records a review for a decision that is still 'draft'`));
    }
  } else if (row.reviewedBy === null || row.reviewedAt === null) {
    findings.push(finding('REVIEW_INCOMPLETE', `${label} records the decision '${row.decision}' without the reviewer and the date of that review`));
  }

  if (row.reviewedBy !== null) {
    if (isPlaceholderIdentity(row.reviewedBy)) {
      findings.push(finding('PLACEHOLDER_REVIEWER', `${label} is reviewed by '${row.reviewedBy}', which names nobody`));
    }
    if (row.reviewedBy === row.authoredBy) {
      findings.push(finding('SELF_REVIEWED', `${label} is reviewed by its own author; the point of a second reviewer is that it is a second person (EV-05)`));
    }
  }
  if (row.reviewedAt !== null && Date.parse(row.reviewedAt) > nowAt) {
    findings.push(finding('REVIEW_FUTURE', `${label} carries review date '${row.reviewedAt}', after the supplied now`));
  }
  return findings;
}

/**
 * Whether the evidence a row cites can carry the decision it records. Every
 * cited record must exist and must be scoped to this exact version, whichever
 * decision the row makes; only an approval additionally has to rest on
 * reviewed, non-marketing evidence recorded for this market.
 */
function evidenceFindings(
  label: string,
  row: CapabilityReviewRow,
  recordsById: ReadonlyMap<string, GuidanceEvidenceRecord>,
): CapabilityReviewFinding[] {
  const findings: CapabilityReviewFinding[] = [];

  for (const [field, ids] of [
    ['supportingEvidenceIds', row.supportingEvidenceIds],
    ['contradictedByEvidenceIds', row.contradictedByEvidenceIds],
  ] as const) {
    for (const evidenceId of ids) {
      const record = recordsById.get(evidenceId);
      if (record === undefined) {
        findings.push(finding('EVIDENCE_UNKNOWN', `${label} cites '${evidenceId}' in ${field}, which no registry record holds`));
      } else if (!record.versionIds.includes(row.versionId)) {
        findings.push(finding('EVIDENCE_UNSCOPED', `${label} cites '${evidenceId}', whose recorded claim scope does not cover version '${row.versionId}' (EV-01)`));
      }
    }
  }

  if (row.decision !== 'approved') return findings;

  if (row.supportingEvidenceIds.length === 0) {
    findings.push(finding('APPROVAL_WITHOUT_EVIDENCE', `${label} approves a capability with no supporting evidence`));
  }
  if (row.contradictedByEvidenceIds.length > 0) {
    findings.push(finding('APPROVAL_IGNORES_CONTRADICTION', `${label} approves a capability while ${row.contradictedByEvidenceIds.length} recorded contradiction(s) sit unread against it`));
  }

  const supporting = row.supportingEvidenceIds
    .map(evidenceId => recordsById.get(evidenceId))
    .filter((record): record is GuidanceEvidenceRecord => record !== undefined);
  if (supporting.length > 0 && supporting.every(record => !isEvidenceTier(record.trustTier))) {
    findings.push(finding('APPROVAL_ON_MARKETING_ONLY', `${label} rests only on marketing (T10), which is never evidence of a capability`));
  }
  for (const record of supporting) {
    if (record.status !== 'reviewed') {
      findings.push(finding('EVIDENCE_NOT_REVIEWED', `${label} rests on '${record.evidenceId}', which is '${record.status}'; only independently reviewed evidence may support a capability`));
    }
    if (record.market !== 'ZA') {
      findings.push(finding('EVIDENCE_MARKET_UNSCOPED', `${label} rests on '${record.evidenceId}', recorded for market '${record.market}' rather than the initial ZA market (P-03)`));
    }
  }
  return findings;
}

/**
 * Validate a review matrix against the evidence registry and the research
 * inventory it was built from.
 *
 * Pure and fail closed: every refusal is reported, an artifact that does not
 * parse is a refusal rather than an empty result, and the accepted matrix is
 * deeply frozen. The returned matrix is what a publication gate may read; the
 * registry and the inventory are read only, never rewritten.
 */
export function validateCapabilityReview(
  input: unknown,
  registry: unknown,
  inventory: unknown,
  now: string,
): CapabilityReviewResult {
  const nowAt = Date.parse(now);
  if (Number.isNaN(nowAt)) {
    return reject([finding('INVALID_NOW', `'${now}' is not an instant, so no review date can be compared against it`)]);
  }

  const matrix = CapabilityReviewMatrixSchema.safeParse(input);
  if (!matrix.success) return reject(shapeFindings('capability-review.json', matrix.error.issues));

  const evidence = GuidanceEvidenceRegistrySchema.safeParse(registry);
  if (!evidence.success) return reject(shapeFindings('evidence-registry.json', evidence.error.issues));

  const inventoried = InventoriedVersionsSchema.safeParse(inventory);
  if (!inventoried.success) return reject(shapeFindings('inventory.json', inventoried.error.issues));

  const recordsById = new Map(evidence.data.records.map(record => [record.evidenceId, record]));
  const inventoriedKeys = new Set(inventoried.data.rows.map(entry => `${entry.kind}\u0000${entry.versionId}`));
  const decided = new Set<string>();
  const findings: CapabilityReviewFinding[] = [];

  matrix.data.rows.forEach((row, index) => {
    const label = `capability review row ${index} (${row.kind} ${row.versionId} ${row.capability})`;
    const key = `${row.kind}\u0000${row.versionId}\u0000${row.capability}`;
    if (decided.has(key)) {
      findings.push(finding('DUPLICATE_ROW', `${label} is decided more than once; one version carries one decision per capability`));
    }
    decided.add(key);
    if (!inventoriedKeys.has(`${row.kind}\u0000${row.versionId}`)) {
      findings.push(finding('VERSION_NOT_INVENTORIED', `${label} names a version no inventory row holds; a capability is never read from a name, a brand, a category or an ingredient list (P-03, SH-02)`));
    }
    findings.push(...reviewFindings(label, row, nowAt));
    findings.push(...evidenceFindings(label, row, recordsById));
  });

  return findings.length > 0 ? reject(findings) : accept(matrix.data);
}
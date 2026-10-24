import { z } from 'zod';

import { HeatRulePublicationSchema } from '../../../../packages/domain/src/heat-coach.ts';
import {
  GuidanceEvidenceRegistrySchema,
  isPlaceholderIdentity,
} from '../../../../packages/domain/src/guidance/evidence-schemas.ts';
import { frozen, nonEmptyString } from '../../../../packages/domain/src/guidance/schemas.ts';
import { DRAFT_HEAT_RULE_PUBLICATION } from './heat-rule-publication.draft.ts';

const IsoInstantSchema = z.iso.datetime({ offset: true });
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const NamedHumanSchema = nonEmptyString;
const CanonicalIdsSchema = z.array(z.string().uuid()).refine(
  values => new Set(values).size === values.length && values.every((value, index) => index === 0 || values[index - 1]! < value),
  'Identifiers must be unique and canonical',
);
const CanonicalTextIdsSchema = z.array(nonEmptyString).refine(
  values => new Set(values).size === values.length && values.every((value, index) => index === 0 || values[index - 1]! < value),
  'Identifiers must be unique and canonical',
);

const EvidenceSnapshotSchema = z.object({
  evidenceId: nonEmptyString,
  sourceUrl: z.url(),
  versionIds: CanonicalIdsSchema,
  claim: nonEmptyString,
  limitations: nonEmptyString,
  checkedAt: IsoInstantSchema,
  reviewedAt: IsoInstantSchema,
}).strict();

const CapabilityDecisionSchema = z.object({
  kind: z.enum(['product', 'tool']),
  versionId: z.string().uuid(),
  capability: nonEmptyString.max(100),
  decision: z.enum(['approved', 'rejected', 'insufficient_evidence']),
  evidenceIds: CanonicalTextIdsSchema,
}).strict();

const CopyReviewSchema = z.object({
  copyKey: z.string().regex(/^heat\.[a-z0-9_.-]{1,100}$/u),
  text: nonEmptyString.max(500),
  evidenceIds: CanonicalTextIdsSchema,
  contentDigest: DigestSchema,
  status: z.enum(['draft', 'reviewed', 'withdrawn']),
  authoredBy: NamedHumanSchema,
  reviewedBy: NamedHumanSchema.nullable(),
  reviewedAt: IsoInstantSchema.nullable(),
}).strict();

const AdoptionSchema = z.object({
  decision: z.enum(['adopted', 'rejected']),
  reviewer: NamedHumanSchema,
  reviewedAt: IsoInstantSchema,
  contentDigest: DigestSchema,
}).strict();

const ApprovalSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewer: NamedHumanSchema,
  reviewedAt: IsoInstantSchema,
  contentDigest: DigestSchema,
}).strict();

const ReviewedRuleSchema = z.object({
  publication: HeatRulePublicationSchema,
  evidenceRegistryId: nonEmptyString,
  evidenceRegistryVersion: nonEmptyString,
  evidence: z.array(EvidenceSnapshotSchema).min(1).max(100),
  capabilities: z.array(CapabilityDecisionSchema).max(100),
  copy: z.array(CopyReviewSchema).max(100),
  adoption: AdoptionSchema,
  approval: ApprovalSchema,
}).strict().superRefine((value, context) => {
  const unique = (values: readonly string[], path: string): void => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: `${path} identifiers must be unique`, path: [path] });
    }
  };
  unique(value.evidence.map(item => item.evidenceId), 'evidence');
  unique(value.copy.map(item => item.copyKey), 'copy');
  unique(value.capabilities.map(item => `${item.kind}:${item.versionId}:${item.capability}`), 'capabilities');
});

export const HeatRulePublicationSetSchema = frozen(z.object({
  schemaVersion: z.literal(1),
  publicationSetId: nonEmptyString,
  version: nonEmptyString,
  state: z.enum(['draft', 'reviewed', 'withdrawn']),
  blockingReason: nonEmptyString.nullable(),
  rules: z.array(ReviewedRuleSchema).max(100),
}).strict());

export type HeatRulePublicationSet = z.output<typeof HeatRulePublicationSetSchema>;

export const HEAT_RULE_PUBLICATION_FINDING_CODES = [
  'APPROVAL_REJECTED',
  'ARTIFACT_SHAPE',
  'CAPABILITY_BINDING_MISSING',
  'CAPABILITY_NOT_APPROVED',
  'CAPABILITY_UNKNOWN',
  'CONTENT_NOT_REVIEWED',
  'COPY_REVIEW_MISSING',
  'DIGEST_MISMATCH',
  'EVIDENCE_CHANGED',
  'EVIDENCE_NOT_REVIEWED',
  'EVIDENCE_STALE',
  'EVIDENCE_UNKNOWN',
  'INVALID_NOW',
  'NUMERIC_UNIT_COVERAGE',
  'PLACEHOLDER_REVIEWER',
  'REGISTRY_MISMATCH',
  'REVIEW_FUTURE',
  'SELF_REVIEW',
  'VERSION_EVIDENCE_MISSING',
] as const;

export type HeatRulePublicationFindingCode = (typeof HEAT_RULE_PUBLICATION_FINDING_CODES)[number];
export interface HeatRulePublicationFinding {
  readonly code: HeatRulePublicationFindingCode;
  readonly message: string;
}
export type HeatRulePublicationResult =
  | { readonly ok: true; readonly state: 'reviewed'; readonly publication: HeatRulePublicationSet }
  | { readonly ok: false; readonly state: 'content_pending'; readonly findings: readonly HeatRulePublicationFinding[] };

const HEAT_CAPABILITIES: ReadonlySet<string> = new Set(['heat-protection']);

function finding(code: HeatRulePublicationFindingCode, message: string): HeatRulePublicationFinding {
  return Object.freeze({ code, message });
}

function refusal(findings: readonly HeatRulePublicationFinding[]): HeatRulePublicationResult {
  return Object.freeze({ ok: false, state: 'content_pending', findings: Object.freeze([...findings]) });
}

function shapeFindings(label: string, issues: readonly z.core.$ZodIssue[]): HeatRulePublicationFinding[] {
  return issues.map(issue => finding('ARTIFACT_SHAPE', `${label} ${issue.path.join('.')} ${issue.message}`));
}

function exactSnapshotMatches(snapshot: z.output<typeof EvidenceSnapshotSchema>, record: {
  readonly evidenceId: string;
  readonly sourceUrl: string;
  readonly versionIds: readonly string[];
  readonly claim: string;
  readonly limitations: string;
  readonly checkedAt: string;
  readonly reviewedAt: string | null;
}): boolean {
  return snapshot.evidenceId === record.evidenceId && snapshot.sourceUrl === record.sourceUrl &&
    JSON.stringify(snapshot.versionIds) === JSON.stringify(record.versionIds) &&
    snapshot.claim === record.claim && snapshot.limitations === record.limitations &&
    snapshot.checkedAt === record.checkedAt && snapshot.reviewedAt === record.reviewedAt;
}

function reviewFindings(
  record: z.output<typeof ReviewedRuleSchema>,
  nowAt: number,
): HeatRulePublicationFinding[] {
  const findings: HeatRulePublicationFinding[] = [];
  if (record.adoption.decision !== 'adopted' || record.approval.decision !== 'approved') {
    findings.push(finding('APPROVAL_REJECTED', 'A rule requires Human A adoption and Human B approval'));
  }
  if (record.adoption.reviewer === record.approval.reviewer) {
    findings.push(finding('SELF_REVIEW', 'Human A and Human B must be different people'));
  }
  for (const [label, review] of [['adoption', record.adoption], ['approval', record.approval]] as const) {
    if (isPlaceholderIdentity(review.reviewer)) {
      findings.push(finding('PLACEHOLDER_REVIEWER', `${label} names a placeholder rather than a person`));
    }
    if (Date.parse(review.reviewedAt) > nowAt) {
      findings.push(finding('REVIEW_FUTURE', `${label} is dated after the supplied now`));
    }
    if (review.contentDigest !== record.publication.digest) {
      findings.push(finding('DIGEST_MISMATCH', `${label} is not bound to the exact publication digest`));
    }
  }
  return findings;
}

function copyFindings(record: z.output<typeof ReviewedRuleSchema>, nowAt: number): HeatRulePublicationFinding[] {
  const required = new Set([
    record.publication.copyKey,
    ...record.publication.hardRestrictions.map(item => item.copyKey),
    ...record.publication.alternatives.map(item => item.copyKey),
  ]);
  const reviewed = new Map(record.copy.map(item => [item.copyKey, item]));
  const evidenceIds = new Set(record.evidence.map(item => item.evidenceId));
  const findings: HeatRulePublicationFinding[] = [];
  for (const key of required) {
    const item = reviewed.get(key);
    if (item === undefined || item.status !== 'reviewed' || item.reviewedBy === null || item.reviewedAt === null ||
      item.reviewedBy === item.authoredBy || isPlaceholderIdentity(item.authoredBy) ||
      (item.reviewedBy !== null && isPlaceholderIdentity(item.reviewedBy)) || item.evidenceIds.length === 0) {
      findings.push(finding('COPY_REVIEW_MISSING', `Owner-facing copy '${key}' is not independently reviewed and evidence-bound`));
    } else if (Date.parse(item.reviewedAt) > nowAt) {
      findings.push(finding('REVIEW_FUTURE', `Owner-facing copy '${key}' is reviewed after the supplied now`));
    }
    if (item !== undefined && item.contentDigest !== record.publication.digest) {
      findings.push(finding('DIGEST_MISMATCH', `Owner-facing copy '${key}' is not bound to the exact publication digest`));
    }
    for (const evidenceId of item?.evidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) {
        findings.push(finding('EVIDENCE_UNKNOWN', `Owner-facing copy '${key}' cites unbound evidence '${evidenceId}'`));
      }
    }
  }
  return findings;
}

function bindingFindings(
  record: z.output<typeof ReviewedRuleSchema>,
  evidenceById: ReadonlyMap<string, z.output<typeof GuidanceEvidenceRegistrySchema>['records'][number]>,
  nowAt: number,
): HeatRulePublicationFinding[] {
  const findings: HeatRulePublicationFinding[] = [];
  const snapshots = new Map(record.evidence.map(item => [item.evidenceId, item]));
  for (const snapshot of record.evidence) {
    const evidence = evidenceById.get(snapshot.evidenceId);
    if (evidence === undefined) {
      findings.push(finding('EVIDENCE_UNKNOWN', `Evidence '${snapshot.evidenceId}' is absent from the bound registry`));
    } else {
      if (!exactSnapshotMatches(snapshot, evidence)) findings.push(finding('EVIDENCE_CHANGED', `Evidence '${snapshot.evidenceId}' changed after review`));
      if (evidence.status !== 'reviewed') findings.push(finding('EVIDENCE_NOT_REVIEWED', `Evidence '${snapshot.evidenceId}' is '${evidence.status}'`));
      if (Date.parse(evidence.checkedAt) > nowAt || (evidence.reviewedAt !== null && Date.parse(evidence.reviewedAt) > nowAt)) {
        findings.push(finding('REVIEW_FUTURE', `Evidence '${snapshot.evidenceId}' is dated after the supplied now`));
      }
      const evidenceReview = evidence.reviewedAt === null ? Number.NaN : Date.parse(evidence.reviewedAt);
      if (Number.isFinite(evidenceReview) && (Date.parse(record.adoption.reviewedAt) < evidenceReview || Date.parse(record.approval.reviewedAt) < evidenceReview)) {
        findings.push(finding('EVIDENCE_STALE', `Rule review predates evidence '${snapshot.evidenceId}'`));
      }
    }
  }

  const boundVersions = new Set<string>();
  for (const item of record.publication.limits.namedSettings) boundVersions.add(item.toolVersionId);
  for (const item of record.publication.alternatives) {
    if (item.toolVersionId !== null) boundVersions.add(item.toolVersionId);
    if (item.productVersionId !== null) boundVersions.add(item.productVersionId);
  }
  for (const capability of record.capabilities) boundVersions.add(capability.versionId);
  for (const versionId of boundVersions) {
    if (![...snapshots.values()].some(item => {
      const evidence = evidenceById.get(item.evidenceId);
      return evidence !== undefined && exactSnapshotMatches(item, evidence) && evidence.versionIds.includes(versionId);
    })) {
      findings.push(finding('VERSION_EVIDENCE_MISSING', `Version '${versionId}' has no exact reviewed evidence snapshot`));
    }
  }

  for (const capability of record.capabilities) {
    if (!HEAT_CAPABILITIES.has(capability.capability)) {
      findings.push(finding('CAPABILITY_UNKNOWN', `Capability '${capability.capability}' is outside the reviewed Heat Coach vocabulary`));
    } else if (capability.decision !== 'approved') {
      findings.push(finding('CAPABILITY_NOT_APPROVED', `Capability '${capability.capability}' is '${capability.decision}'`));
    }
    for (const evidenceId of capability.evidenceIds) {
      const snapshot = snapshots.get(evidenceId);
      if (snapshot === undefined) {
        findings.push(finding('EVIDENCE_UNKNOWN', `Capability cites unbound evidence '${evidenceId}'`));
      } else if (!snapshot.versionIds.includes(capability.versionId)) {
        findings.push(finding('VERSION_EVIDENCE_MISSING', `Capability evidence '${evidenceId}' does not cover version '${capability.versionId}'`));
      }
    }
  }
  if (record.publication.requiredProductCapability !== null && !record.capabilities.some(item =>
    item.kind === 'product' && item.capability === record.publication.requiredProductCapability && item.decision === 'approved')) {
    findings.push(finding('CAPABILITY_BINDING_MISSING', `Required capability '${record.publication.requiredProductCapability}' has no exact approved product binding`));
  }
  return findings;
}

export function validateHeatRulePublication(input: unknown, registry: unknown, now: string): HeatRulePublicationResult {
  const nowAt = Date.parse(now);
  if (Number.isNaN(nowAt)) return refusal([finding('INVALID_NOW', `'${now}' is not an instant`)]);
  const parsed = HeatRulePublicationSetSchema.safeParse(input);
  if (!parsed.success) return refusal(shapeFindings('heat publication', parsed.error.issues));
  if (parsed.data.state !== 'reviewed') return refusal([finding('CONTENT_NOT_REVIEWED', `Heat publication is '${parsed.data.state}'`)]);
  const evidence = GuidanceEvidenceRegistrySchema.safeParse(registry);
  if (!evidence.success) return refusal(shapeFindings('evidence registry', evidence.error.issues));

  const evidenceById = new Map(evidence.data.records.map(item => [item.evidenceId, item]));
  const findings: HeatRulePublicationFinding[] = [];
  for (const record of parsed.data.rules) {
    if (record.publication.lifecycle !== 'reviewed') findings.push(finding('CONTENT_NOT_REVIEWED', 'A contained rule is not reviewed'));
    if (record.evidenceRegistryId !== evidence.data.registryId || record.evidenceRegistryVersion !== evidence.data.version) {
      findings.push(finding('REGISTRY_MISMATCH', 'The rule is not bound to this exact evidence registry version'));
    }
    const units = record.publication.limits.temperatures.map(item => item.unit).sort().join(',');
    if (units !== '' && units !== 'C,F') findings.push(finding('NUMERIC_UNIT_COVERAGE', 'Numeric limits require separately reviewed C and F values'));
    findings.push(...reviewFindings(record, nowAt), ...copyFindings(record, nowAt), ...bindingFindings(record, evidenceById, nowAt));
  }
  if (parsed.data.rules.length === 0) findings.push(finding('CONTENT_NOT_REVIEWED', 'A reviewed publication cannot be empty'));
  return findings.length > 0
    ? refusal(findings)
    : Object.freeze({ ok: true, state: 'reviewed', publication: parsed.data });
}

export const CURRENT_HEAT_RULE_PUBLICATION: HeatRulePublicationSet = HeatRulePublicationSetSchema.parse(DRAFT_HEAT_RULE_PUBLICATION);

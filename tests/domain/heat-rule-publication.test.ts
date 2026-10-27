import { describe, expect, it } from 'vitest';

import {
  CURRENT_HEAT_RULE_PUBLICATION,
  prepareHeatRuleReviewEnvelope,
  validateHeatRulePublication,
} from '../../apps/mobile/src/guidance/heat-rule-publication.ts';

const PRODUCT_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const TOOL_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = '44444444-4444-4444-8444-444444444444';
const DIGEST = 'a'.repeat(64);
const REVIEWED_DIGEST = `sha256:${'b'.repeat(64)}`;
const CAPABILITY_REGISTRY_ID = '55555555-5555-4555-8555-555555555555';
const CAPABILITY_REGISTRY_DIGEST = `sha256:${'c'.repeat(64)}`;
const NOW = '2026-10-25T12:00:00+02:00';

function evidenceRecord(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: EVIDENCE_ID,
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Synthetic exact-version heat evidence',
    sourceUrl: 'https://example.org/synthetic-heat-evidence',
    archivedUrl: null,
    publisher: 'Synthetic manufacturer',
    market: 'ZA',
    versionIds: [TOOL_VERSION_ID, PRODUCT_VERSION_ID].sort(),
    claim: 'Synthetic fixture claim for validator tests only.',
    limitations: 'Synthetic fixture; not production evidence or a safety promise.',
    checkedAt: '2026-10-20T10:00:00+02:00',
    authoredBy: 'Synthetic Evidence Author',
    reviewedAt: '2026-10-21T10:00:00+02:00',
    reviewedBy: 'Synthetic Evidence Reviewer',
    status: 'reviewed',
    ...overrides,
  };
}

function registry(recordOverrides: Record<string, unknown> = {}) {
  return {
    registryId: 'synthetic-heat-evidence',
    version: '1',
    records: [evidenceRecord(recordOverrides)],
  };
}

function publication() {
  return {
    schemaVersion: 1,
    publicationId: '33333333-3333-4333-8333-333333333333',
    ruleVersion: '1.0.0',
    digest: DIGEST,
    lifecycle: 'reviewed',
    validFrom: '2026-10-22T00:00:00+02:00',
    validUntil: null,
    requiredProductCapability: 'heat-protection',
    allowedMethods: ['heated-air'],
    limits: {
      temperatures: [{ unit: 'C', maximum: 150 }, { unit: 'F', maximum: 302 }],
      namedSettings: [{ toolVersionId: TOOL_VERSION_ID, label: 'Low' }],
      maximumPasses: 2,
      maximumDurationMinutes: 20,
    },
    necessityRules: [{ necessity: 'supports_goal', goals: ['basic_wash'], concerns: [] }],
    hardRestrictions: [],
    alternatives: [{
      method: 'heated-air',
      toolVersionId: TOOL_VERSION_ID,
      productVersionId: PRODUCT_VERSION_ID,
      temperature: { value: 120, unit: 'C' },
      setting: 'Low',
      reasonCode: 'lower_heat_option',
      copyKey: 'heat.alternative.lower_heat',
    }],
    reasonCode: 'reviewed_match',
    copyKey: 'heat.reviewed_match',
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const record = evidenceRecord();
  return {
    evidenceId: record.evidenceId,
    sourceUrl: record.sourceUrl,
    versionIds: record.versionIds,
    claim: record.claim,
    limitations: record.limitations,
    checkedAt: record.checkedAt,
    reviewedAt: record.reviewedAt,
    ...overrides,
  };
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    publication: publication(),
    evidenceRegistryId: 'synthetic-heat-evidence',
    evidenceRegistryVersion: '1',
    evidenceSnapshotDigest: `sha256:${'d'.repeat(64)}`,
    capabilityRegistryId: CAPABILITY_REGISTRY_ID,
    capabilityRegistryDigest: CAPABILITY_REGISTRY_DIGEST,
    copyDigest: `sha256:${'e'.repeat(64)}`,
    reviewedContentDigest: REVIEWED_DIGEST,
    evidence: [snapshot()],
    capabilities: [{
      kind: 'product',
      versionId: PRODUCT_VERSION_ID,
      capability: 'heat-protection',
      decision: 'approved',
      evidenceIds: [EVIDENCE_ID],
    }, {
      kind: 'tool',
      versionId: TOOL_VERSION_ID,
      capability: 'heat-tool',
      decision: 'approved',
      evidenceIds: [EVIDENCE_ID],
    }],
    copy: [
      { copyKey: 'heat.alternative.lower_heat', text: 'Synthetic lower-heat option.', evidenceIds: [EVIDENCE_ID], contentDigest: `sha256:${DIGEST}`, status: 'reviewed', authoredBy: 'Copy Author', reviewedBy: 'Copy Reviewer', reviewedAt: '2026-10-22T09:00:00+02:00' },
      { copyKey: 'heat.reviewed_match', text: 'Synthetic reviewed match.', evidenceIds: [EVIDENCE_ID], contentDigest: `sha256:${DIGEST}`, status: 'reviewed', authoredBy: 'Copy Author', reviewedBy: 'Copy Reviewer', reviewedAt: '2026-10-22T09:00:00+02:00' },
    ],
    adoption: { decision: 'adopted', reviewer: 'Human Alpha', reviewedAt: '2026-10-22T10:00:00+02:00', contentDigest: REVIEWED_DIGEST },
    approval: { decision: 'approved', reviewer: 'Human Beta', reviewedAt: '2026-10-22T11:00:00+02:00', contentDigest: REVIEWED_DIGEST },
    ...overrides,
  };
}

function set(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    publicationSetId: 'heat-coach-production',
    version: '1',
    state: 'reviewed',
    blockingReason: null,
    rules: [rule()],
    ...overrides,
  };
}

function refusal(input: unknown, evidence: unknown = registry()): readonly string[] {
  const result = validateHeatRulePublication(input, evidence, NOW);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.findings.map(item => item.code);
}

describe('validateHeatRulePublication', () => {
  it('accepts a fully bound synthetic reviewed publication and freezes it', () => {
    const result = validateHeatRulePublication(set(), registry(), NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publication.state).toBe('reviewed');
      expect(Object.isFrozen(result.publication.rules[0]?.publication)).toBe(true);
    }
  });

  it('requires a capability registry identity and binds Human A/B to the whole packet', () => {
    const missing = { ...rule(), capabilityRegistryId: undefined };
    expect(refusal(set({ rules: [missing] }))).toContain('ARTIFACT_SHAPE');
    const oldSignature = rule();
    oldSignature.adoption.contentDigest = `sha256:${DIGEST}`;
    expect(refusal(set({ rules: [oldSignature] }))).toContain('DIGEST_MISMATCH');
  });

  it('prepares the exact SQL review envelope from validated evidence', () => {
    const prepared = prepareHeatRuleReviewEnvelope(set(), registry(), NOW, publication().publicationId);
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.rule).toEqual(publication());
      expect(prepared.reviewEnvelope).toMatchObject({
        schemaVersion: 1,
        capabilityRegistryId: CAPABILITY_REGISTRY_ID,
        capabilityRegistryDigest: CAPABILITY_REGISTRY_DIGEST,
        evidenceSnapshotDigest: `sha256:${'d'.repeat(64)}`,
        copyDigest: `sha256:${'e'.repeat(64)}`,
        reviewedContentDigest: REVIEWED_DIGEST,
        adoption: { contentDigest: REVIEWED_DIGEST },
        approval: { contentDigest: REVIEWED_DIGEST },
        evidence: [{ evidenceId: EVIDENCE_ID, status: 'reviewed', market: 'ZA', trustTier: 'T5' }],
      });
      expect(Object.isFrozen(prepared.reviewEnvelope)).toBe(true);
    }
  });

  it('keeps the checked-in production publication empty and content pending', () => {
    expect(CURRENT_HEAT_RULE_PUBLICATION.state).toBe('draft');
    expect(CURRENT_HEAT_RULE_PUBLICATION.rules).toEqual([]);
    expect(validateHeatRulePublication(CURRENT_HEAT_RULE_PUBLICATION, { registryId: 'none', version: '1', records: [] }, NOW)).toMatchObject({
      ok: false,
      state: 'content_pending',
    });
  });

  it.each([
    ['same reviewer', { approval: { decision: 'approved', reviewer: 'Human Alpha', reviewedAt: '2026-10-22T11:00:00+02:00', contentDigest: REVIEWED_DIGEST } }, 'SELF_REVIEW'],
    ['placeholder reviewer', { adoption: { decision: 'adopted', reviewer: 'reviewer-a', reviewedAt: '2026-10-22T10:00:00+02:00', contentDigest: REVIEWED_DIGEST } }, 'PLACEHOLDER_REVIEWER'],
    ['missing decision', { approval: null }, 'ARTIFACT_SHAPE'],
    ['rejected row', { approval: { decision: 'rejected', reviewer: 'Human Beta', reviewedAt: '2026-10-22T11:00:00+02:00', contentDigest: REVIEWED_DIGEST } }, 'APPROVAL_REJECTED'],
    ['changed digest', { adoption: { decision: 'adopted', reviewer: 'Human Alpha', reviewedAt: '2026-10-22T10:00:00+02:00', contentDigest: `sha256:${'f'.repeat(64)}` } }, 'DIGEST_MISMATCH'],
    ['future review', { approval: { decision: 'approved', reviewer: 'Human Beta', reviewedAt: '2026-10-26T11:00:00+02:00', contentDigest: REVIEWED_DIGEST } }, 'REVIEW_FUTURE'],
  ] as const)('refuses %s', (_label, overrides, code) => {
    expect(refusal(set({ rules: [rule(overrides)] }))).toContain(code);
  });

  it.each(['draft', 'withdrawn'] as const)('fails closed for a %s publication set', state => {
    expect(refusal(set({ state }))).toContain('CONTENT_NOT_REVIEWED');
  });

  it('refuses stale or changed evidence snapshots', () => {
    expect(refusal(set({ rules: [rule({ evidence: [snapshot({ claim: 'Changed claim.' })] })] }))).toContain('EVIDENCE_CHANGED');
    expect(refusal(set(), registry({ status: 'withdrawn' }))).toContain('EVIDENCE_NOT_REVIEWED');
    expect(refusal(set(), registry({ checkedAt: '2026-10-26T10:00:00+02:00', reviewedAt: '2026-10-26T11:00:00+02:00' }))).toContain('REVIEW_FUTURE');
  });

  it('refuses unknown, rejected or unscoped capability decisions', () => {
    expect(refusal(set({ rules: [rule({ capabilities: [{ kind: 'product', versionId: PRODUCT_VERSION_ID, capability: 'repairs-damage', decision: 'approved', evidenceIds: [EVIDENCE_ID] }] })] }))).toContain('CAPABILITY_UNKNOWN');
    expect(refusal(set({ rules: [rule({ capabilities: [{ kind: 'product', versionId: PRODUCT_VERSION_ID, capability: 'heat-protection', decision: 'rejected', evidenceIds: [EVIDENCE_ID] }] })] }))).toContain('CAPABILITY_NOT_APPROVED');
    expect(refusal(set({ rules: [rule({ capabilities: [] })] }))).toContain('CAPABILITY_BINDING_MISSING');
    expect(refusal(set({ rules: [rule({ capabilities: [rule().capabilities[0]] })] }))).toContain('CAPABILITY_BINDING_MISSING');
  });

  it('requires exact evidence for every product and tool version binding', () => {
    const productOnly = registry({ versionIds: [PRODUCT_VERSION_ID] });
    expect(refusal(set(), productOnly)).toContain('VERSION_EVIDENCE_MISSING');
  });

  it('refuses partial numeric unit coverage and unreviewed copy', () => {
    const oneUnit = publication();
    oneUnit.limits.temperatures = [{ unit: 'C', maximum: 150 }];
    expect(refusal(set({ rules: [rule({ publication: oneUnit })] }))).toContain('NUMERIC_UNIT_COVERAGE');
    expect(refusal(set({ rules: [rule({ copy: [] })] }))).toContain('COPY_REVIEW_MISSING');
    const changedCopy = rule();
    changedCopy.copy[0]!.contentDigest = `sha256:${'b'.repeat(64)}`;
    expect(refusal(set({ rules: [changedCopy] }))).toContain('DIGEST_MISMATCH');
  });

  it('requires every capability and copy citation to resolve to its exact snapshot', () => {
    const missingCitation = rule();
    missingCitation.capabilities[0]!.evidenceIds = ['missing-evidence'];
    missingCitation.copy[0]!.evidenceIds = ['missing-evidence'];
    expect(refusal(set({ rules: [missingCitation] }))).toContain('EVIDENCE_UNKNOWN');
  });

  it('refuses malformed clocks and malformed artifacts without throwing', () => {
    expect(validateHeatRulePublication(set(), registry(), 'not-a-clock')).toMatchObject({ ok: false, findings: [{ code: 'INVALID_NOW' }] });
    expect(refusal({ ...set(), extra: true })).toContain('ARTIFACT_SHAPE');
  });

  it('refuses duplicate reviewed rows instead of allowing last-row-wins validation', () => {
    const input = set();
    const rule = input.rules[0]!;
    expect(refusal({
      ...input,
      rules: [{ ...rule, copy: [rule.copy[0]!, rule.copy[0]!] }],
    })).toContain('ARTIFACT_SHAPE');
    expect(refusal({
      ...input,
      rules: [{ ...rule, evidence: [rule.evidence[0]!, rule.evidence[0]!] }],
    })).toContain('ARTIFACT_SHAPE');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_REVIEW_DECISIONS,
  CapabilityReviewMatrixSchema,
  isCapabilityReviewDecision,
  isCapabilityReviewRow,
  validateCapabilityReview,
  type CapabilityReviewMatrix,
} from '../../../packages/domain/src/guidance/index.ts';
import { CHECKED_IN_CAPABILITY_REVIEW } from '../../../apps/mobile/src/guidance/capability-review.ts';

const root = new URL('../../..', import.meta.url);
const PACK = 'docs/product/evidence/basic-wash-v1';
const read = (relativePath: string): string => readFileSync(new URL(relativePath, root), 'utf8');

// Every value below is test scaffolding. It exists to prove the matrix
// validator refuses fabricated, unscoped or unreviewed content, and it must
// never be copied into `docs/product/evidence/`: no catalogue id, product,
// brand, reviewer or date in this file describes a real thing.
const PRODUCT_VERSION = '3f2a1c84-5d6b-4e7a-9c10-2b8f4e6d0a11';
const TOOL_VERSION = '7c4e9b02-18a3-4d5e-8f61-0a2b3c4d5e6f';
const OTHER_VERSION = '5e8b0a13-2c4d-4f60-9b27-1d3e5f7092a4';
const UNKNOWN_VERSION = '9c1d5e77-3a8b-4c02-b6d4-5e7f8091a2b3';

const NOW = '2026-10-11T12:00:00.000Z';
const REVIEWED_AT = '2026-10-10T09:00:00.000Z';
const FUTURE_REVIEWED_AT = '2026-12-01T09:00:00.000Z';

const AUTHOR = 'Matrix Author Fixture';
const REVIEWER = 'Matrix Reviewer Fixture';

function identitySource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceUrl: 'https://example.test/manufacturer-directions',
    archivedUrl: null,
    sourceType: 'manufacturer',
    trustTier: 'T5',
    market: 'ZA',
    firstSeen: '2026-10-01',
    lastChecked: '2026-10-10',
    ...overrides,
  };
}

/** A full research inventory row, exactly as Task 2 records one. */
function inventoryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    brand: 'Fixture Haircare',
    name: 'Fixture Gentle Wash',
    variantOrModel: '250ml',
    market: 'ZA',
    lifecycle: 'active',
    source: identitySource(),
    ...overrides,
  };
}

function inventory(rows: unknown[] = [inventoryRow()], overrides: Record<string, unknown> = {}): unknown {
  return { inventoryId: 'basic-wash-v1', version: '1', rows, ...overrides };
}

/** Reviewed, ZA, claim-scoped evidence about the exact product version. */
function evidenceRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidenceId: 'ev-directions-1',
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Manufacturer directions for the exact reviewed version',
    sourceUrl: 'https://example.test/manufacturer-directions',
    archivedUrl: null,
    publisher: 'Fixture Haircare',
    market: 'ZA',
    versionIds: [PRODUCT_VERSION],
    claim: 'The reviewed version is used to cleanse scalp and hair.',
    limitations: 'Directions describe use; they do not establish comparative efficacy.',
    checkedAt: '2026-10-09T08:00:00.000Z',
    authoredBy: 'Evidence Author Fixture',
    reviewedAt: REVIEWED_AT,
    reviewedBy: 'Second Reviewer Fixture',
    status: 'reviewed',
    ...overrides,
  };
}

function marketingRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return evidenceRecord({
    evidenceId: 'ev-marketing-1',
    sourceType: 'marketing',
    trustTier: 'T10',
    title: 'Fixture brand marketing page',
    publisher: 'Fixture Haircare marketing',
    claim: 'The reviewed version is the gentle choice for cleansing.',
    status: 'draft',
    reviewedAt: null,
    reviewedBy: null,
    ...overrides,
  });
}

function registry(records: unknown[] = [evidenceRecord()], overrides: Record<string, unknown> = {}): unknown {
  return { registryId: 'basic-wash-evidence', version: '1', records, ...overrides };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'product',
    versionId: PRODUCT_VERSION,
    capability: 'cleanse',
    supportingEvidenceIds: ['ev-directions-1'],
    contradictedByEvidenceIds: [],
    decision: 'approved',
    rationale: 'Manufacturer directions for this exact version state that it is used to cleanse scalp and hair.',
    authoredBy: AUTHOR,
    reviewedBy: REVIEWER,
    reviewedAt: REVIEWED_AT,
    ...overrides,
  };
}

function matrix(rows: unknown[] = [row()], overrides: Record<string, unknown> = {}): unknown {
  return { reviewId: 'basic-wash-v1-capability-review', version: '1', rows, ...overrides };
}

function review(
  matrixArtifact: unknown,
  registryArtifact: unknown = registry(),
  inventoryArtifact: unknown = inventory(),
  now: string = NOW,
) {
  return validateCapabilityReview(matrixArtifact, registryArtifact, inventoryArtifact, now);
}

function codes(
  matrixArtifact: unknown,
  registryArtifact: unknown = registry(),
  inventoryArtifact: unknown = inventory(),
  now: string = NOW,
): string[] {
  const result = review(matrixArtifact, registryArtifact, inventoryArtifact, now);
  const findings = result.ok ? [] : result.findings;
  return findings.map(finding => finding.code);
}

function accept(
  matrixArtifact: unknown,
  registryArtifact: unknown = registry(),
  inventoryArtifact: unknown = inventory(),
  now: string = NOW,
): CapabilityReviewMatrix {
  const result = review(matrixArtifact, registryArtifact, inventoryArtifact, now);
  if (!result.ok) {
    throw new Error(`Expected an accepted matrix, got ${result.findings.map(item => item.code).join(', ')}`);
  }
  return result.matrix;
}

describe('capability review matrix checked into the repository', () => {
  it('parses with the reviewed capability contract and validates against the research pack', () => {
    const parsed = CapabilityReviewMatrixSchema.parse(JSON.parse(read(`${PACK}/capability-review.json`)));
    const result = validateCapabilityReview(
      JSON.parse(read(`${PACK}/capability-review.json`)),
      JSON.parse(read(`${PACK}/evidence-registry.json`)),
      JSON.parse(read(`${PACK}/inventory.json`)),
      NOW,
    );
    expect(parsed.rows.length).toBe(2);
    expect(result.ok).toBe(true);
  });

  it('approves no mapping, so no capability can be assembled from it', () => {
    const parsed = CapabilityReviewMatrixSchema.parse(JSON.parse(read(`${PACK}/capability-review.json`)));
    expect(parsed.rows.filter(entry => entry.decision === 'approved')).toEqual([]);
  });

  it('records two draft decisions scoped to the exact inventoried versions', () => {
    const parsed = CapabilityReviewMatrixSchema.parse(JSON.parse(read(`${PACK}/capability-review.json`)));
    expect(parsed.rows.map(entry => [entry.versionId, entry.capability, entry.decision])).toEqual([
      ['96759932-6d87-56c2-8165-8f95260447f4', 'cleanse', 'draft'],
      ['6ae2cd7a-2d89-5d16-a07d-36ca44139c59', 'condition', 'draft'],
    ]);
    const registry = JSON.parse(read(`${PACK}/evidence-registry.json`)) as {
      records: { evidenceId: string; versionIds: string[] }[];
    };
    for (const entry of parsed.rows) {
      expect(entry.kind).toBe('product');
      expect(entry.authoredBy).toBe('task-07-draft-research');
      expect(entry.reviewedBy).toBeNull();
      expect(entry.reviewedAt).toBeNull();
      expect(entry.contradictedByEvidenceIds).toEqual([]);
      expect(entry.supportingEvidenceIds.length).toBeGreaterThan(0);
      // Every cited record exists and its claim scope covers this version.
      for (const evidenceId of entry.supportingEvidenceIds) {
        const record = registry.records.find(candidate => candidate.evidenceId === evidenceId);
        expect(record, `cited record ${evidenceId} is held by the registry`).toBeDefined();
        expect(record!.versionIds).toContain(entry.versionId);
      }
      // Rationale cites the manufacturer directions, never the category name.
      expect(entry.rationale.toLowerCase()).toMatch(/direction|rinse|lather|massage/);
    }
  });

  it('mirrors the docs capability review into the mobile copy exactly', () => {
    expect(JSON.parse(JSON.stringify(CHECKED_IN_CAPABILITY_REVIEW))).toEqual(
      JSON.parse(read(`${PACK}/capability-review.json`)),
    );
  });

  it('invents no reviewer identity, review date, or rejected batch date in the matrix', () => {
    const content = read(`${PACK}/capability-review.json`);
    expect(content).not.toContain('2026-10-13');
    expect(content.toLowerCase()).not.toContain('example');
    expect(content).not.toMatch(/Human [AB]/);
  });
});

describe('capability review matrix decisions', () => {
  it('accepts an approval resting on reviewed evidence about the exact version', () => {
    const accepted = accept(matrix());
    expect(accepted.rows).toHaveLength(1);
    expect(accepted.rows[0]).toMatchObject({
      kind: 'product',
      versionId: PRODUCT_VERSION,
      capability: 'cleanse',
      decision: 'approved',
      supportingEvidenceIds: ['ev-directions-1'],
      reviewedBy: REVIEWER,
    });
  });

  it('freezes the validated matrix and every level of it', () => {
    const accepted = accept(matrix());
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.rows)).toBe(true);
    expect(Object.isFrozen(accepted.rows[0])).toBe(true);
    expect(Object.isFrozen(accepted.rows[0]!.supportingEvidenceIds)).toBe(true);
    expect(() => {
      (accepted.rows[0] as unknown as Record<string, unknown>).decision = 'draft';
    }).toThrow(TypeError);
    expect(() => {
      (accepted.rows[0]!.supportingEvidenceIds as unknown as string[]).push('ev-marketing-1');
    }).toThrow(TypeError);
  });

  it('accepts a tool row for an inventoried tool version', () => {
    const accepted = accept(
      matrix([row({
        kind: 'tool',
        versionId: TOOL_VERSION,
        capability: 'condition',
        supportingEvidenceIds: ['ev-directions-2'],
      })]),
      registry([
        evidenceRecord(),
        evidenceRecord({ evidenceId: 'ev-directions-2', versionIds: [TOOL_VERSION] }),
      ]),
      inventory([
        inventoryRow(),
        inventoryRow({ kind: 'tool', versionId: TOOL_VERSION, brand: 'Fixture Tools', name: 'Fixture Dryer' }),
      ]),
    );
    expect(accepted.rows[0]).toMatchObject({ kind: 'tool', capability: 'condition' });
  });

  it('accepts insufficient_evidence with an explicit rationale and grants no mapping', () => {
    const accepted = accept(matrix([row({
      decision: 'insufficient_evidence',
      rationale: 'Directions describe use only; no independent source establishes cleansing for this exact version.',
    })]));
    expect(accepted.rows[0]).toMatchObject({
      decision: 'insufficient_evidence',
      rationale: 'Directions describe use only; no independent source establishes cleansing for this exact version.',
    });
  });

  it('accepts an explicit rejection and a draft decision that carries no review', () => {
    const accepted = accept(matrix([
      row({ decision: 'rejected', rationale: 'The only source states a different use; the claim is not supported.' }),
      row({
        capability: 'condition',
        decision: 'draft',
        supportingEvidenceIds: [],
        rationale: 'A source is being read; nothing is decided yet.',
        reviewedBy: null,
        reviewedAt: null,
      }),
    ]));
    expect(accepted.rows.map(entry => entry.decision)).toEqual(['rejected', 'draft']);
  });

  it('accepts the empty matrix that matches an empty registry and an empty inventory', () => {
    expect(accept(matrix([]), registry([]), inventory([]))).toEqual({
      reviewId: 'basic-wash-v1-capability-review',
      version: '1',
      rows: [],
    });
  });

  it('freezes the returned result and its findings', () => {
    const accepted = review(matrix());
    expect(Object.isFrozen(accepted)).toBe(true);
    const rejected = review(matrix([row({ versionId: UNKNOWN_VERSION })]));
    expect(Object.isFrozen(rejected)).toBe(true);
    expect(Object.isFrozen(rejected.ok ? [] : rejected.findings)).toBe(true);
    expect(Object.isFrozen((rejected as { findings: readonly unknown[] }).findings[0])).toBe(true);
  });
});

describe('capability review rejections', () => {
  const cases: {
    reason: string;
    matrix: unknown;
    registry?: unknown;
    inventory?: unknown;
    expected: string;
  }[] = [
    {
      reason: 'a capability outside the reviewed vocabulary',
      matrix: matrix([row({ capability: 'mild-cleanse' })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a display name copied out of the inventory onto a row',
      matrix: matrix([row({ displayName: 'Fixture Gentle Wash' })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a decision outside the four recorded states',
      matrix: matrix([row({ decision: 'published' })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a version id that is not a catalogue row id',
      matrix: matrix([row({ versionId: 'the gentle wash' })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'the same evidence cited twice in one list',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-directions-1', 'ev-directions-1'] })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a blank rationale',
      matrix: matrix([row({ rationale: '   ' })]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a matrix that is not JSON at all',
      matrix: null,
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a registry that does not parse as evidence',
      matrix: matrix(),
      registry: registry([{ evidenceId: 'ev-broken' }]),
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'an inventory with no rows key',
      matrix: matrix(),
      inventory: { inventoryId: 'basic-wash-v1', version: '1' },
      expected: 'ARTIFACT_SHAPE',
    },
    {
      reason: 'a version no inventory row holds',
      matrix: matrix([row({ versionId: UNKNOWN_VERSION, supportingEvidenceIds: [] })]),
      expected: 'VERSION_NOT_INVENTORIED',
    },
    {
      reason: 'a product version id used as a tool version',
      matrix: matrix([row({ kind: 'tool' })]),
      expected: 'VERSION_NOT_INVENTORIED',
    },
    {
      reason: 'an evidence id no registry record holds',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-never-recorded'] })]),
      expected: 'EVIDENCE_UNKNOWN',
    },
    {
      reason: 'a contradiction record no registry record holds',
      matrix: matrix([row({ contradictedByEvidenceIds: ['ev-never-recorded'] })]),
      expected: 'EVIDENCE_UNKNOWN',
    },
    {
      reason: 'evidence scoped to a different version',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-other-version'] })]),
      registry: registry([
        evidenceRecord(),
        evidenceRecord({ evidenceId: 'ev-other-version', versionIds: [OTHER_VERSION] }),
      ]),
      expected: 'EVIDENCE_UNSCOPED',
    },
    {
      reason: 'a contradiction recorded about a different version',
      matrix: matrix([row({ contradictedByEvidenceIds: ['ev-other-version'] })]),
      registry: registry([
        evidenceRecord(),
        evidenceRecord({ evidenceId: 'ev-other-version', versionIds: [OTHER_VERSION] }),
      ]),
      expected: 'EVIDENCE_UNSCOPED',
    },
    {
      reason: 'an approval with no supporting evidence',
      matrix: matrix([row({ supportingEvidenceIds: [] })]),
      expected: 'APPROVAL_WITHOUT_EVIDENCE',
    },
    {
      reason: 'an approval that ignores a recorded contradiction',
      matrix: matrix([row({ contradictedByEvidenceIds: ['ev-directions-1'] })]),
      expected: 'APPROVAL_IGNORES_CONTRADICTION',
    },
    {
      reason: 'an approval resting only on manufacturer marketing',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-marketing-1'] })]),
      registry: registry([marketingRecord()]),
      expected: 'APPROVAL_ON_MARKETING_ONLY',
    },
    {
      reason: 'an approval resting on evidence nobody reviewed',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-directions-1'] })]),
      registry: registry([evidenceRecord({ status: 'draft', reviewedAt: null, reviewedBy: null })]),
      expected: 'EVIDENCE_NOT_REVIEWED',
    },
    {
      reason: 'an approval resting on withdrawn evidence',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-directions-1'] })]),
      registry: registry([evidenceRecord({ status: 'withdrawn' })]),
      expected: 'EVIDENCE_NOT_REVIEWED',
    },
    {
      reason: 'an approval resting on evidence from an unknown market',
      matrix: matrix([row({ supportingEvidenceIds: ['ev-directions-1'] })]),
      registry: registry([evidenceRecord({ market: 'unknown' })]),
      expected: 'EVIDENCE_MARKET_UNSCOPED',
    },
    {
      reason: 'a review dated after now',
      matrix: matrix([row({ reviewedAt: FUTURE_REVIEWED_AT })]),
      expected: 'REVIEW_FUTURE',
    },
    {
      reason: 'a row reviewed by its own author',
      matrix: matrix([row({ reviewedBy: AUTHOR })]),
      expected: 'SELF_REVIEWED',
    },
    {
      reason: 'a placeholder reviewer',
      matrix: matrix([row({ reviewedBy: 'TBD' })]),
      expected: 'PLACEHOLDER_REVIEWER',
    },
    {
      reason: 'a placeholder author',
      matrix: matrix([row({ authoredBy: 'unknown' })]),
      expected: 'PLACEHOLDER_REVIEWER',
    },
    {
      reason: 'a decided row with no reviewer',
      matrix: matrix([row({ reviewedBy: null })]),
      expected: 'REVIEW_INCOMPLETE',
    },
    {
      reason: 'a decided row with no review date',
      matrix: matrix([row({ reviewedAt: null })]),
      expected: 'REVIEW_INCOMPLETE',
    },
    {
      reason: 'a draft decision claiming a second-person review',
      matrix: matrix([row({ decision: 'draft', supportingEvidenceIds: [] })]),
      expected: 'DRAFT_REVIEW_CLAIMED',
    },
    {
      reason: 'the same version and capability decided twice',
      matrix: matrix([row(), row({ reviewedAt: REVIEWED_AT })]),
      expected: 'DUPLICATE_ROW',
    },
    {
      reason: 'a now that is not an instant',
      matrix: matrix(),
      expected: 'INVALID_NOW',
    },
  ];

  it.each(cases)('rejects $reason', testCase => {
    const result = review(
      testCase.matrix,
      testCase.registry ?? registry(),
      testCase.inventory ?? inventory(),
      testCase.reason === 'a now that is not an instant' ? 'whenever' : NOW,
    );
    const findings = result.ok ? [] : result.findings;
    expect(result.ok).toBe(false);
    expect(findings.map(finding => finding.code)).toContain(testCase.expected);
  });

  it('reports every refusal rather than stopping at the first', () => {
    expect(codes(matrix([
      row({ versionId: UNKNOWN_VERSION, supportingEvidenceIds: [] }),
      row({ capability: 'condition', reviewedAt: FUTURE_REVIEWED_AT }),
      row({ capability: 'condition', supportingEvidenceIds: ['ev-never-recorded'] }),
    ]))).toEqual(expect.arrayContaining([
      'VERSION_NOT_INVENTORIED',
      'REVIEW_FUTURE',
      'EVIDENCE_UNKNOWN',
    ]));
  });

  it('names the version a capability row cannot be traced to', () => {
    const result = review(matrix([row({ versionId: UNKNOWN_VERSION, supportingEvidenceIds: [] })]));
    const findings = result.ok ? [] : result.findings;
    expect(findings.map(finding => finding.message).join('\n')).toContain(UNKNOWN_VERSION);
  });
});

describe('capability review helpers the publication gate reuses', () => {
  it('recognises a well-formed row', () => {
    expect(isCapabilityReviewRow(row())).toBe(true);
  });

  it.each([
    ['a capability outside the reviewed vocabulary', { capability: 'mild-cleanse' }],
    ['an extra column', { displayName: 'Fixture Gentle Wash' }],
    ['a missing decision', { decision: undefined }],
    ['a version id that is not a catalogue row id', { versionId: 'the gentle wash' }],
    ['a duplicate evidence reference', { supportingEvidenceIds: ['ev-directions-1', 'ev-directions-1'] }],
    ['a blank rationale', { rationale: '' }],
    ['a value that is not a row at all', 'cleanse'],
  ])('refuses %s', (_reason, overrides) => {
    const candidate = typeof overrides === 'object' && overrides !== null
      ? row(overrides as Record<string, unknown>)
      : overrides;
    expect(isCapabilityReviewRow(candidate)).toBe(false);
  });

  it('recognises exactly the four recorded decisions', () => {
    expect([...CAPABILITY_REVIEW_DECISIONS]).toEqual([
      'draft',
      'approved',
      'rejected',
      'insufficient_evidence',
    ]);
    for (const decision of CAPABILITY_REVIEW_DECISIONS) {
      expect(isCapabilityReviewDecision(decision)).toBe(true);
    }
    expect(isCapabilityReviewDecision('published')).toBe(false);
  });
});
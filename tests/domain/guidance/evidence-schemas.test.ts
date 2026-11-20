import { describe, expect, it } from 'vitest';

import {
  GuidanceEvidenceRecordSchema,
  GuidanceEvidenceRegistrySchema,
  type GuidanceEvidenceRecord,
} from '../../../packages/domain/src/guidance/index.ts';

const ISO = '2026-10-10T10:00:00.000Z';

function record(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    evidenceId: 'ev-directions-a',
    sourceType: 'manufacturer',
    trustTier: 'T5',
    title: 'Manufacturer directions for the reviewed version',
    sourceUrl: 'https://example.test/directions',
    archivedUrl: null,
    publisher: 'Manufacturer of the reviewed version',
    market: 'ZA',
    versionIds: ['product-version-a'],
    claim: 'The reviewed version is used to cleanse scalp and hair.',
    limitations: 'Directions describe use; they do not establish comparative efficacy.',
    checkedAt: ISO,
    authoredBy: 'Naledi Khumalo',
    reviewedAt: null,
    reviewedBy: null,
    status: 'draft',
    ...overrides,
  };
}

function reviewed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return record({ status: 'reviewed', reviewedAt: ISO, reviewedBy: 'Thandi Mokoena', ...overrides });
}

function registry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    registryId: 'basic-wash-evidence',
    version: '1',
    records: [reviewed()],
    ...overrides,
  };
}

describe('guidance evidence records', () => {
  it('parses a reviewed record and freezes every level of it', () => {
    const parsed: GuidanceEvidenceRecord = GuidanceEvidenceRecordSchema.parse(reviewed());
    expect(parsed.evidenceId).toBe('ev-directions-a');
    expect(parsed.status).toBe('reviewed');
    expect(parsed.market).toBe('ZA');
    expect(parsed.versionIds).toEqual(['product-version-a']);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.versionIds)).toBe(true);
    expect(() => {
      (parsed as unknown as Record<string, unknown>).claim = 'A stronger claim than the source supports';
    }).toThrow(TypeError);
    expect(() => {
      (parsed.versionIds as unknown as string[])[0] = 'another-version';
    }).toThrow(TypeError);
  });

  it('rejects an unknown key and a record with no named author', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record()).evidenceId).toBe('ev-directions-a');
    expect(() => GuidanceEvidenceRecordSchema.parse({ ...record(), confidence: 'high' })).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ authoredBy: undefined }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ authoredBy: '   ' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ evidenceId: undefined }))).toThrow();
  });

  it('refuses an empty claim or an empty limitation', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record()).claim).not.toBe('');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ claim: '' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ claim: '   ' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ limitations: '' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ limitations: '   ' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ title: '' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ publisher: '' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ sourceUrl: 'not-a-url' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ archivedUrl: 'not-a-url' }))).toThrow();
    expect(GuidanceEvidenceRecordSchema.parse(record({ archivedUrl: 'https://example.test/archive' })).archivedUrl).toBe('https://example.test/archive');
  });

  it('accepts the recorded market ZA or unknown only', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record({ market: 'ZA' })).market).toBe('ZA');
    expect(GuidanceEvidenceRecordSchema.parse(record({ market: 'unknown' })).market).toBe('unknown');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ market: 'US' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ market: null }))).toThrow();
  });

  it('accepts only the source kinds and trust tiers the shelf already defines', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'regulator', trustTier: 'T1' })).trustTier).toBe('T1');
    expect(GuidanceEvidenceRecordSchema.parse(record()).sourceType).toBe('manufacturer');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'influencer' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ trustTier: 'T0' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ trustTier: 1 }))).toThrow();
  });

  it('records marketing-only evidence as a draft but never as reviewed support', () => {
    const marketing = { sourceType: 'marketing', trustTier: 'T10' };
    expect(
      GuidanceEvidenceRecordSchema.parse(record(marketing)).status,
    ).toBe('draft');
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed(marketing))).toThrow();
    expect(() =>
      GuidanceEvidenceRecordSchema.parse(record({ ...marketing, status: 'withdrawn', reviewedAt: ISO, reviewedBy: 'Thandi Mokoena' })),
    ).not.toThrow();
    expect(
      GuidanceEvidenceRecordSchema.parse(
        record({ ...marketing, status: 'withdrawn', reviewedAt: ISO, reviewedBy: 'Thandi Mokoena' }),
      ).status,
    ).toBe('withdrawn');
  });

  it('refuses a marketing-only trust tier that is not recorded as a marketing source', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record({ trustTier: 'T9' })).trustTier).toBe('T9');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ trustTier: 'T10' }))).toThrow();
  });

  it('refuses a marketing source that claims an evidence trust tier', () => {
    expect(
      GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'marketing', trustTier: 'T10' })).trustTier,
    ).toBe('T10');
    expect(GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'regulator', trustTier: 'T1' })).sourceType).toBe('regulator');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'marketing', trustTier: 'T1' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ sourceType: 'marketing', trustTier: 'T9' }))).toThrow();
    expect(() =>
      GuidanceEvidenceRecordSchema.parse(
        reviewed({ sourceType: 'marketing', trustTier: 'T5', publisher: 'Marketer of the reviewed version' }),
      ),
    ).toThrow();
  });

  it('requires offset-aware timestamps', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record()).checkedAt).toBe(ISO);
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ checkedAt: '2026-10-10T10:00:00' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedAt: '2026-10-10T10:00:00' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedAt: 'yesterday' }))).toThrow();
    expect(
      GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedAt: '2026-10-10T12:00:00+02:00' })).reviewedAt,
    ).toBe('2026-10-10T12:00:00+02:00');
  });

  it('refuses a placeholder identity for the author or the reviewer', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record({ authoredBy: 'Sipho Dlamini' })).authoredBy).toBe('Sipho Dlamini');
    for (const placeholder of ['unknown', 'Unassigned', 'N/A', 'none', 'tbd', 'placeholder', 'reviewer-1']) {
      expect(() => GuidanceEvidenceRecordSchema.parse(record({ authoredBy: placeholder }))).toThrow();
      expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedBy: placeholder }))).toThrow();
    }
  });

  it('refuses a record whose reviewer is its author', () => {
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedBy: 'Naledi Khumalo' }))).toThrow();
    expect(
      GuidanceEvidenceRecordSchema.parse(
        record({ status: 'withdrawn', reviewedAt: ISO, reviewedBy: 'Thandi Mokoena' }),
      ).status,
    ).toBe('withdrawn');
    expect(() =>
      GuidanceEvidenceRecordSchema.parse(
        record({ status: 'withdrawn', reviewedAt: ISO, reviewedBy: 'Naledi Khumalo' }),
      ),
    ).toThrow();
    expect(GuidanceEvidenceRecordSchema.parse(reviewed()).reviewedBy).toBe('Thandi Mokoena');
  });

  it('keeps draft evidence unreviewed and requires a review on reviewed evidence', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record()).status).toBe('draft');
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ reviewedBy: 'Thandi Mokoena' }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ reviewedAt: ISO }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedBy: null }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ reviewedAt: null }))).toThrow();
    expect(() => GuidanceEvidenceRecordSchema.parse(reviewed({ status: 'approved' }))).toThrow();
  });

  it('accepts a version-independent claim and refuses repeated or unsorted version ids', () => {
    expect(GuidanceEvidenceRecordSchema.parse(record({ versionIds: [] })).versionIds).toEqual([]);
    expect(
      GuidanceEvidenceRecordSchema.parse(record({ versionIds: ['product-version-a', 'product-version-b'] }))
        .versionIds,
    ).toEqual(['product-version-a', 'product-version-b']);
    expect(() => GuidanceEvidenceRecordSchema.parse(record({ versionIds: undefined }))).toThrow();
    expect(() =>
      GuidanceEvidenceRecordSchema.parse(record({ versionIds: ['product-version-a', 'product-version-a'] })),
    ).toThrow();
    expect(() =>
      GuidanceEvidenceRecordSchema.parse(record({ versionIds: ['product-version-b', 'product-version-a'] })),
    ).toThrow();
  });
});

describe('guidance evidence registries', () => {
  it('parses a registry and freezes its records', () => {
    const parsed = GuidanceEvidenceRegistrySchema.parse(registry());
    expect(parsed.registryId).toBe('basic-wash-evidence');
    expect(parsed.records).toHaveLength(1);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.records)).toBe(true);
    expect(Object.isFrozen(parsed.records[0])).toBe(true);
    expect(() => {
      (parsed.records as unknown as Record<string, unknown>[])[0] = record();
    }).toThrow(TypeError);
  });

  it('accepts an empty registry, because no catalogue version may be invented', () => {
    const parsed = GuidanceEvidenceRegistrySchema.parse(registry({ records: [] }));
    expect(parsed.records).toEqual([]);
  });

  it('refuses a duplicate evidence id, a blank identity or an unknown key', () => {
    expect(
      GuidanceEvidenceRegistrySchema.parse(registry({ records: [reviewed(), reviewed({ evidenceId: 'ev-other' })] }))
        .records,
    ).toHaveLength(2);
    expect(() =>
      GuidanceEvidenceRegistrySchema.parse(registry({ records: [reviewed(), reviewed()] })),
    ).toThrow();
    expect(() => GuidanceEvidenceRegistrySchema.parse(registry({ records: [reviewed(), reviewed({ evidenceId: 'ev-other' }), reviewed()] }))).toThrow();
    expect(() => GuidanceEvidenceRegistrySchema.parse(registry({ registryId: '' }))).toThrow();
    expect(() => GuidanceEvidenceRegistrySchema.parse(registry({ version: '   ' }))).toThrow();
    expect(() => GuidanceEvidenceRegistrySchema.parse({ ...registry(), extra: 1 })).toThrow();
    expect(() => GuidanceEvidenceRegistrySchema.parse(registry({ records: { ...record() } }))).toThrow();
  });
});

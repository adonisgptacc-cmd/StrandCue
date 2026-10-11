import { describe, expect, it } from 'vitest';

import { validatePublishedBundle } from '../../../packages/domain/src/guidance/reviewed-content.ts';
import { CURRENT_REVIEWED_BUNDLE } from '../../../apps/mobile/src/guidance/reviewed-bundle.ts';

const NOW = '2026-10-11T09:00:00.000Z';
const ISO = '2026-10-01T00:00:00.000Z';

function rule(overrides: Record<string, unknown> = {}) {
  return {
    ruleId: 'rule-clean',
    versionId: 'v1',
    status: 'published',
    strength: 'hard',
    condition: { kind: 'fact_equals', fact: 'goal', value: 'basic_wash' },
    effects: [{ kind: 'require_capability', capability: 'mild-cleanse' }],
    reason: 'Reviewed reason for the fixture rule.',
    evidenceIds: ['evidence-fixture-1'],
    ...overrides,
  };
}

function capabilityEntry(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'product',
    versionId: 'version-fixture-a',
    displayName: 'Synthetic fixture product',
    verifiedCapabilities: ['mild-cleanse'],
    evidenceIds: ['evidence-fixture-1'],
    status: 'published',
    reviewedAt: ISO,
    ...overrides,
  };
}

function bundle(overrides: Record<string, unknown> = {}) {
  return {
    bundleId: 'bundle-fixture',
    version: '1',
    status: 'published',
    reviewedAt: ISO,
    goals: [{ id: 'basic_wash', label: 'Basic wash', requiredProfileFacts: ['pattern'] }],
    capabilities: [capabilityEntry()],
    rules: [rule()],
    ...overrides,
  };
}

describe('publication gate', () => {
  it('returns the parsed bundle when it is published, evidenced and current', () => {
    const parsed = validatePublishedBundle(bundle(), NOW);
    expect(parsed.status).toBe('published');
    expect(parsed.bundleId).toBe('bundle-fixture');
  });

  it('refuses a draft bundle', () => {
    expect(() => validatePublishedBundle(bundle({ status: 'draft' }), NOW)).toThrow(
      /published/i,
    );
  });

  it('refuses a withdrawn bundle', () => {
    expect(() => validatePublishedBundle(bundle({ status: 'withdrawn' }), NOW)).toThrow(
      /published/i,
    );
  });

  it('refuses a bundle whose review is in the future', () => {
    expect(() =>
      validatePublishedBundle(bundle({ reviewedAt: '2026-12-01T00:00:00.000Z' }), NOW),
    ).toThrow(/review/i);
  });

  it('refuses a malformed or unknown-shape bundle', () => {
    expect(() => validatePublishedBundle(null, NOW)).toThrow();
    expect(() => validatePublishedBundle(bundle({ version: '99' }), NOW)).toThrow();
    expect(() => validatePublishedBundle({ ...bundle(), surprise: true }, NOW)).toThrow();
  });

  it('refuses a duplicate version mapping', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({
          capabilities: [capabilityEntry(), capabilityEntry({ displayName: 'Clash' })],
        }),
        NOW,
      ),
    ).toThrow();
  });

  it('refuses a published capability entry with no evidence', () => {
    expect(() =>
      validatePublishedBundle(bundle({ capabilities: [capabilityEntry({ evidenceIds: [] })] }), NOW),
    ).toThrow(/evidence/i);
  });

  it('refuses a published rule with no evidence', () => {
    expect(() =>
      validatePublishedBundle(bundle({ rules: [rule({ evidenceIds: [] })] }), NOW),
    ).toThrow(/evidence/i);
  });

  it('refuses a withdrawn capability entry that would otherwise supply capabilities', () => {
    expect(() =>
      validatePublishedBundle(
        bundle({ capabilities: [capabilityEntry({ status: 'withdrawn' })] }),
        NOW,
      ),
    ).toThrow(/withdrawn/i);
  });

  it('refuses a withdrawn rule carried inside a published bundle', () => {
    expect(() =>
      validatePublishedBundle(bundle({ rules: [rule({ status: 'withdrawn' })] }), NOW),
    ).toThrow(/withdrawn/i);
  });

  it('produces byte-equivalent normalized JSON for the same input', () => {
    const first = validatePublishedBundle(bundle(), NOW);
    const second = validatePublishedBundle(JSON.parse(JSON.stringify(bundle())), NOW);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe('production reviewed registry', () => {
  it('is a parseable draft bundle', () => {
    expect(CURRENT_REVIEWED_BUNDLE.status).toBe('draft');
    expect(CURRENT_REVIEWED_BUNDLE.capabilities).toEqual([]);
    expect(CURRENT_REVIEWED_BUNDLE.rules).toEqual([]);
  });

  it('cannot be executed by the publication gate', () => {
    expect(() => validatePublishedBundle(CURRENT_REVIEWED_BUNDLE, NOW)).toThrow(/published/i);
  });

  it('carries no synthetic item, fixture, or fabricated evidence', () => {
    const serialized = JSON.stringify(CURRENT_REVIEWED_BUNDLE).toLowerCase();
    for (const forbidden of ['fixture', 'fake', 'synthetic', 'dummy', 'example.test', '00000000-0000']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('publishes no real product or tool version mapping', () => {
    expect(CURRENT_REVIEWED_BUNDLE.capabilities).toHaveLength(0);
  });

  it('declares the goals Today may offer without enabling content', () => {
    expect(CURRENT_REVIEWED_BUNDLE.goals.map(goal => goal.id)).toEqual(['basic_wash']);
  });
});
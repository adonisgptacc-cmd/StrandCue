import { describe, expect, it } from 'vitest';

import {
  ToolCatalogueCandidateSchema,
  ToolDetailSchema,
  ToolSearchRequestSchema,
  ToolSearchResultSchema,
  compareToolRecordToCandidate,
  toolCandidateTitle,
  type ToolCatalogueCandidate,
} from '../../packages/domain/src/tool-catalogue.ts';
import * as domain from '../../packages/domain/src/index.ts';

const id = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const candidate = (overrides: Record<string, unknown> = {}): ToolCatalogueCandidate => ({
  versionId: id(31), toolId: id(21), brand: 'House Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA', lifecycle: 'active', ...overrides,
}) as ToolCatalogueCandidate;
const capabilities = { wattageWatts: 2200, temperatureMaxCelsius: null, adjustableTemp: 'unknown', contactHeat: 'unknown', airHeat: 'unknown' };
const evidence = {
  evidenceId: id(101), sourceType: 'manufacturer', trustTier: 'T5', title: 'Spec sheet', publisher: 'House Brand', market: 'ZA', firstSeen: '2024-01-01',
  lastChecked: '2024-06-01', applicability: 'This exact version.', limitations: 'A manufacturer statement.', sourceUrl: 'https://example.test/a', archivedUrl: null, excerpt: null,
};
const detail = (overrides: Record<string, unknown> = {}) => ({
  identity: { versionId: id(31), toolId: id(21), brand: 'House Brand', toolName: 'Pro Dryer', versionLabel: '2024', toolType: 'dryer', market: 'ZA' },
  lifecycle: { state: 'active', successor: { state: 'none' } },
  capabilities: { state: 'not_published' },
  claims: { state: 'not_published' },
  owner: null,
  ...overrides,
});

describe('tool catalogue search', () => {
  it('uses the same bounded, normalized request as the product search', () => {
    expect(ToolSearchRequestSchema.parse({ query: '  pro   dryer ', limit: 5 })).toEqual({ query: 'pro dryer', limit: 5 });
    for (const query of ['', 'a', 'x'.repeat(81), 'one two three four five six seven', 'a b', 'bad\u0000text']) {
      expect(ToolSearchRequestSchema.safeParse({ query }).success).toBe(false);
    }
    expect(ToolSearchRequestSchema.safeParse({ query: 'pro', limit: 26 }).success).toBe(false);
    expect(ToolSearchRequestSchema.safeParse({ query: "x'; drop table tools; --" }).success).toBe(true);
  });

  it('answers identity and lifecycle only: no capability, claim, source or successor id', () => {
    expect(ToolCatalogueCandidateSchema.parse(candidate())).toEqual(candidate());
    for (const extra of ['wattageWatts', 'contactHeat', 'airHeat', 'capabilities', 'claims', 'sources', 'reviewer', 'successorVersionId']) {
      expect(ToolCatalogueCandidateSchema.safeParse({ ...candidate(), [extra]: 1 }).success).toBe(false);
      expect(ToolSearchResultSchema.safeParse({ results: [{ ...candidate(), [extra]: 1 }], truncated: false }).success).toBe(false);
    }
    expect(ToolCatalogueCandidateSchema.safeParse(candidate({ toolType: 'toaster' })).success).toBe(false);
    expect(ToolCatalogueCandidateSchema.safeParse(candidate({ lifecycle: 'draft' })).success).toBe(false);
    expect(ToolSearchResultSchema.safeParse({ results: [] }).success).toBe(false);
    expect(toolCandidateTitle(candidate())).toBe('House Brand: Pro Dryer');
  });
});

describe('tool detail', () => {
  it('parses an exact version with every section unpublished', () => {
    const parsed = ToolDetailSchema.parse(detail());
    expect(parsed.capabilities).toEqual({ state: 'not_published' });
    expect(parsed.owner).toBeNull();
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('carries published capabilities with their own independent unknowns', () => {
    const parsed = ToolDetailSchema.parse(detail({ capabilities: { state: 'published', content: capabilities } }));
    expect(parsed.capabilities.state === 'published' && parsed.capabilities.content).toMatchObject({ wattageWatts: 2200, temperatureMaxCelsius: null });
  });

  it('gives content to nothing that is not published, and keeps each cause apart', () => {
    for (const state of ['not_published', 'under_review', 'withdrawn']) {
      expect(ToolDetailSchema.safeParse(detail({ capabilities: { state } })).success).toBe(true);
      expect(ToolDetailSchema.safeParse(detail({ capabilities: { state, content: capabilities } })).success).toBe(false);
    }
    expect(ToolDetailSchema.safeParse(detail({ capabilities: { state: 'draft', content: capabilities } })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ capabilities: { state: 'published' } })).success).toBe(false);
  });

  it('refuses internal fields and ties evidence to a claim of the version', () => {
    expect(ToolDetailSchema.safeParse({ ...detail(), reviewer: 'x' }).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ identity: { ...detail().identity, reviewedBy: 'x' } })).success).toBe(false);
    const claims = { state: 'published', content: { items: [{ claimId: id(201), claimKey: 'k', statement: 'A claim.', evidence: [evidence] }] } };
    expect(ToolDetailSchema.safeParse(detail({ claims })).success).toBe(true);
    expect(ToolDetailSchema.safeParse(detail({ claims: { ...claims, content: { items: [{ ...claims.content.items[0], evidence: [{ ...evidence, reviewer: 'x' }] }] } } })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ evidence: [evidence] })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ claims: { ...claims, content: { items: [{ ...claims.content.items[0], evidence: [{ ...evidence, sourceUrl: 'http://example.test/a' }] }] } } })).success).toBe(false);
  });

  it('never substitutes a successor and keeps the owner record in its own member', () => {
    const retired = ToolDetailSchema.parse(detail({ lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: id(32), brand: 'House Brand', toolName: 'Pro Dryer', versionLabel: '2025' } } } }));
    expect(retired.identity.versionId).toBe(id(31));
    expect(ToolDetailSchema.safeParse(detail({ lifecycle: { state: 'active', successor: { state: 'published', version: { versionId: id(32), brand: 'a', toolName: 'b', versionLabel: 'c' } } } })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ lifecycle: { state: 'retired', successor: { state: 'published', version: { versionId: id(31), brand: 'a', toolName: 'b', versionLabel: 'c' } } } })).success).toBe(false);
    const owner = {
      userToolId: id(1), revision: 2, availability: 'available', matched: true, matchConfirmed: true, manualBrand: 'Mine', manualModel: 'Pro', toolType: 'dryer',
      wattageWatts: 2200, adjustableTemp: null, settings: { state: 'recorded', items: [{ label: 'High', temperature: null }] }, attachments: { state: 'none' },
      condition: 'worn', heatMethods: { state: 'unknown' }, notes: 'Mine', revisions: [{ id: id(2), kind: 'baseline', correctsId: null, matchVersionId: null }],
    };
    const parsed = ToolDetailSchema.parse(detail({ owner }));
    // Owner wattage, settings and heat answers are the owner's; the catalogue capability section stays unpublished.
    expect(parsed.owner?.wattageWatts).toBe(2200);
    expect(parsed.capabilities).toEqual({ state: 'not_published' });
    expect(ToolDetailSchema.safeParse(detail({ owner: { ...owner, ownerId: id(9) } })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ owner: { ...owner, condition: 'safe' } })).success).toBe(false);
    expect(ToolDetailSchema.safeParse(detail({ owner: { ...owner, wattageWatts: 0 } })).success).toBe(false);
  });

  it('is exported from the domain index', () => {
    expect(domain.ToolDetailSchema).toBe(ToolDetailSchema);
  });
});

describe('owner tool against a catalogue version', () => {
  it('compares the identity word by word and treats a missing answer as unknown, never different', () => {
    const rows = compareToolRecordToCandidate({ brand: 'house brand', model: 'Pro  dryer', toolType: 'dryer' }, candidate());
    expect(rows.map(row => [row.field, row.status])).toEqual([['brand', 'same'], ['model', 'same'], ['toolType', 'same']]);
    const different = compareToolRecordToCandidate({ brand: 'Other', model: 'Smooth Iron', toolType: 'flat-iron' }, candidate());
    expect(different.map(row => row.status)).toEqual(['different', 'different', 'different']);
    expect(different[0]).toMatchObject({ manual: 'Other', catalogue: 'House Brand' });
    const unknown = compareToolRecordToCandidate({ brand: null, model: ' ', toolType: null }, candidate());
    expect(unknown.map(row => row.status)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(unknown[2]).toMatchObject({ manual: null, catalogue: 'dryer' });
  });

  it('never mutates either side', () => {
    const manual = Object.freeze({ brand: 'a', model: 'b', toolType: 'dryer' });
    const frozen = Object.freeze(candidate());
    expect(() => compareToolRecordToCandidate(manual, frozen)).not.toThrow();
    expect(manual).toEqual({ brand: 'a', model: 'b', toolType: 'dryer' });
  });
});

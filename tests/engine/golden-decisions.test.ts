import { describe, expect, it } from 'vitest';
import { evaluateDecision } from '../../packages/engine/src/pipeline/index.js';
import { compileRules } from '../../packages/engine/src/rules/index.js';
import { fixtureIdentifiers, loadGoldenFixtures } from './fixtures/golden-cases.js';
import { rulesetContentHash } from './fixtures/ruleset-hash.js';

/**
 * Golden snapshots: canonical input plus the reviewed expected decision.
 *
 * Every fixture is visibly synthetic. None of them states a real product,
 * tool, person or safety claim, and none of them is production content.
 */
const fixtures = loadGoldenFixtures();

describe('golden decisions', () => {
  it('covers every engine outcome a reviewed fixture can assert', () => {
    const statuses = new Set(fixtures.map((fixture) => fixture.expectedDecision.status));
    expect(statuses).toEqual(new Set(['decided', 'needs_input', 'blocked', 'no_protocol']));
  });

  for (const fixture of fixtures) {
    it(`reproduces the reviewed expected decision for ${fixture.fixtureId}`, () => {
      const decision = evaluateDecision({ ...fixture.input, ruleset: fixture.ruleset });
      expect(decision).toEqual(fixture.expectedDecision);
    });

    it(`pins the ruleset identity of ${fixture.fixtureId}`, () => {
      expect(fixture.ruleset.ref.contentHash).toBe(rulesetContentHash(fixture.ruleset));
      expect(fixture.expectedDecision.audit.ruleset).toEqual(fixture.ruleset.ref);
    });

    it(`uses only synthetic identifiers in ${fixture.fixtureId}`, () => {
      for (const identifier of fixtureIdentifiers(fixture)) {
        expect(identifier).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(identifier).not.toMatch(/\d{3,}/);
      }
    });

    it(`records the review state of ${fixture.fixtureId}`, () => {
      expect(['pending_independent_review', 'independently_reviewed']).toContain(fixture.review.status);
      expect(fixture.review.expectedByRole).toBe('independent_reviewer');
      expect(fixture.review.note.length).toBeGreaterThan(0);
    });
  }

  it('derives the ruleset content hash the same way the rule compiler does', () => {
    const compiled = compileRules({
      bundleId: 'synthetic-hash-bundle',
      version: '1',
      capabilities: [
        {
          capabilityId: 'synthetic-capability',
          subjectType: 'product',
          subjectId: 'synthetic-product',
          catalogueSubject: { catalogueId: 'catalogue-synthetic-product', versionId: '1', market: 'ZA' },
          reviewedUseScope: 'synthetic-routine-use',
          capabilityType: 'compatibility',
          value: 'synthetic-compatible',
          claimId: 'claim-synthetic-capability',
          evidenceIds: ['ev-synthetic-capability'],
          reviewRef: 'synthetic-review',
          reviewedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
      tables: [
        {
          tableId: 'synthetic-table',
          hitPolicy: 'collect',
          rows: [
            {
              rowId: 'row-include',
              when: { kind: 'fact_equals', factId: 'f-ready', value: true },
              effects: [{ kind: 'include_candidate', candidateId: 'cand-synthetic' }],
              useScope: 'synthetic-routine-use',
              severity: 'hard',
              capabilityIds: ['synthetic-capability'],
              claimIds: ['claim-synthetic-capability'],
              evidenceIds: ['ev-synthetic-capability'],
            },
          ],
        },
      ],
      constraints: [],
      requiredFixtures: [{
        ruleId: 'synthetic-table::row-include',
        positiveFixtureIds: ['fixture-ready'],
        negativeFixtureIds: ['fixture-not-ready'],
      }],
    });

    expect(rulesetContentHash({ capabilities: compiled.capabilities, rules: compiled.rules })).toBe(compiled.ref.contentHash);
  });
});

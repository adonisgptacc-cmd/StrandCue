import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, root), 'utf8');

const CANONICAL_SPEC_PATH =
  'docs/superpowers/specs/2026-10-10-canonical-product-spec.md';
const TRACEABILITY_PATH = 'docs/product/requirement-traceability.md';

// Normalized-LF SHA-256 of the approved canonical specification (10 Oct 2026).
// Recompute from the approved file after normalizing CRLF to LF; never copy
// the digest of an older authority document.
const EXPECTED_CANONICAL_DIGEST =
  'b7c5e8f974ade449ec7d62a79d1acf23f00a8fdcc5ded14aa3d7d28a89eca525';

const HISTORICAL_PRDS = [
  'StrandCue-PRD.md',
  'StrandCue-PRD-v2.md',
  'StrandCue-PRD-v1.1-audit.md',
] as const;

function extractRequirementIds(spec: string): string[] {
  const principles = [...spec.matchAll(/^\*\*(P-\d{2})\b/gm)].map(
    match => match[1],
  );
  const requirements = [
    ...spec.matchAll(
      /^-\s\*\*((?:ID|HP|SH|TL|EN|TD|TR|CC|PH|WX|RA|RM|AI|SF|EV|CO|PR|PV|UX)-\d{2}):\*\*/gm,
    ),
  ].map(match => match[1]);
  return [...principles, ...requirements];
}

function countTableRows(document: string, id: string): number {
  const rows = document.match(new RegExp(`^\\|\\s*${id}\\s*\\|`, 'gm'));
  return rows === null ? 0 : rows.length;
}

describe('canonical product authority', () => {
  it('pins the approved canonical specification by normalized digest', () => {
    const spec = read(CANONICAL_SPEC_PATH).replace(/\r\n/g, '\n');
    expect(spec).toContain('Approved product authority');
    const digest = createHash('sha256').update(spec, 'utf8').digest('hex');
    expect(digest).toBe(EXPECTED_CANONICAL_DIGEST);
  });

  it('points README and PHASE_1 at the canonical specification path', () => {
    expect(read('README.md')).toContain(CANONICAL_SPEC_PATH);
    expect(read('docs/PHASE_1.md')).toContain(CANONICAL_SPEC_PATH);
  });

  it.each([...HISTORICAL_PRDS])(
    'marks %s as a historical input without current authority',
    file => {
      const content = read(file);
      expect(content).toMatch(/historical/i);
      expect(content).toContain(CANONICAL_SPEC_PATH);
      expect(content).not.toMatch(/authoritative working PRD/i);
    },
  );

  it('lists every canonical requirement ID in traceability exactly once', () => {
    const ids = extractRequirementIds(
      read(CANONICAL_SPEC_PATH).replace(/\r\n/g, '\n'),
    );
    expect(ids.length).toBeGreaterThan(100);
    expect(new Set(ids).size).toBe(ids.length);
    const traceability = read(TRACEABILITY_PATH);
    for (const id of ids) {
      expect(countTableRows(traceability, id)).toBe(1);
    }
  });
});

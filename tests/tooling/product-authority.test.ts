import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, root), 'utf8');

const CANONICAL_SPEC_PATH =
  'docs/superpowers/specs/2026-10-10-canonical-product-spec.md';
const TRACEABILITY_PATH = 'docs/product/requirement-traceability.md';
const HEAT_COACH_DESIGN_PATH =
  'docs/superpowers/specs/2026-10-24-heat-coach-design.md';

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

  it('pins Heat Coach vocabulary, lifecycle, unit policy and draft production state', () => {
    const design = read(HEAT_COACH_DESIGN_PATH);
    expect(design).toContain('content_pending | needs_input | restricted | lower_heat | no_heat | appropriate | unavailable');
    expect(design).toContain('not_needed | optional | supports_goal | unknown');
    expect(design).toContain('today | my_hair | services | my_shelf | my_tools');
    expect(design).toContain('draft | reviewed | withdrawn');
    expect(design).toContain('No runtime unit conversion creates a reviewed limit');
    expect(design).toContain('Production Heat Coach publication: `draft`');
  });

  it.each(['TL-05', 'TL-06'])('%s cannot be called implemented without named Heat Coach proof', id => {
    const row = read(TRACEABILITY_PATH)
      .split(/\r?\n/u)
      .find(line => line.startsWith(`| ${id} |`));
    expect(row).toBeDefined();
    if (row?.endsWith('| Implemented |')) {
      expect(row).toContain(HEAT_COACH_DESIGN_PATH);
      expect(row).toContain('tests/domain/heat-coach.test.ts');
    }
  });

  it('keeps prohibited promise wording out of Heat Coach authority and runtime paths', () => {
    const paths = [
      HEAT_COACH_DESIGN_PATH,
      'packages/domain/src/heat-coach.ts',
      'apps/mobile/src/HeatCoach.tsx',
      'apps/mobile/src/heat-coach-copy.ts',
    ];
    const combined = paths
      .filter(path => existsSync(new URL(path, root)))
      .map(path => read(path))
      .join('\n');
    expect(combined).not.toMatch(/\b(?:safe|risk[- ]free|damage[- ]free|guaranteed)\b/iu);
  });
});

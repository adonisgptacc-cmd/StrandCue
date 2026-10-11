import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, root), 'utf8');

const RUNBOOK = 'docs/runbooks/guidance-content-publication.md';
const VERIFICATION = 'docs/verification/today-guidance-integration.md';
const TRACEABILITY = 'docs/product/requirement-traceability.md';
const BUNDLE = 'apps/mobile/src/guidance/reviewed-bundle.ts';

describe('reviewed guidance content governance', () => {
  it('documents the publication runbook', () => {
    expect(read(RUNBOOK)).toContain('Guidance content publication');
  });

  it('requires exact product and tool version identity', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toContain('versionId');
    expect(runbook).toMatch(/exact/i);
    expect(runbook).toMatch(/no capability may be inferred from/i);
  });

  it('requires evidence with a reviewer and a date', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/evidence/i);
    expect(runbook).toMatch(/reviewer/i);
    expect(runbook).toMatch(/reviewedAt|date/i);
  });

  it('requires the draft, reviewed, published lifecycle', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/draft/);
    expect(runbook).toMatch(/review/);
    expect(runbook).toMatch(/published/);
  });

  it('defines withdrawal and history preservation', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/withdraw/i);
    expect(runbook).toMatch(/history/i);
    expect(runbook).toMatch(/never rewrite|must not rewrite|do not rewrite/i);
  });

  it('requires a regression fixture for every published rule', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/regression/i);
    expect(runbook).toMatch(/every published rule/i);
  });

  it('forbids name-based inference, commercial ranking, medical claims and silent replacement', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/brand|name|category/i);
    expect(runbook).toMatch(/commercial|affiliate|sponsor|price/i);
    expect(runbook).toMatch(/diagnos|medical|treatment/i);
    expect(runbook).toMatch(/replace/i);
    expect(runbook).toMatch(/never silently|silently replace/i);
  });

  it('requires independent content review before publishing', () => {
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/second reviewer|independent review|independent content review/i);
  });

  it('keeps the production registry free of real or synthetic mappings', () => {
    const bundle = read(BUNDLE);
    expect(bundle).toContain("status: 'draft'");
    expect(bundle).toContain('capabilities: []');
    expect(bundle).toContain('rules: []');
  });

it('requires a named reviewer in the schema the gate enforces', () => {
    const schema = read('packages/domain/src/guidance/schemas.ts');
    expect(schema).toMatch(/reviewedBy/);
    const gate = read('packages/domain/src/guidance/reviewed-content.ts');
    expect(gate).toMatch(/reviewer/i);
  });

it('does not overstate what the schema enforces about reviewer independence', () => {
    // Independence is a process obligation. The runbook must not claim the
    // code enforces it, because no schema can check who wrote the entry.
    const runbook = read(RUNBOOK);
    expect(runbook).toMatch(/\*\*process\*\*\s+oblig/i);
    expect(runbook).not.toMatch(/the gate enforces independence/i);
  });
});

describe('today guidance integration verification record', () => {
  it('records the bitemporal activity cutoffs and replay authority', () => {
    const verification = read(VERIFICATION);
    expect(verification).toMatch(/effective cutoff/i);
    expect(verification).toMatch(/recorded cutoff/i);
    expect(verification).toMatch(/stored normalized input/i);
    expect(verification).toMatch(/replay authority/i);
    expect(verification).toMatch(/mutable source reconstruction/i);
  });

  it('does not overstate activity revision provenance as engine input', () => {
    const verification = read(VERIFICATION);
    expect(verification).toMatch(/applied revision IDs into the guidance snapshot/i);
    expect(verification).toMatch(/activity kind, precision, and status enter recommendation input/i);
    expect(verification).not.toMatch(/applied revision IDs into the normalized recommendation context/i);
  });

  it('states that no real recommendation was activated', () => {
    expect(read(VERIFICATION)).toMatch(/no real recommendation|not activated/i);
  });

  it('records the migration as unapplied to hosted Supabase', () => {
    const verification = read(VERIFICATION);
    expect(verification).toMatch(/not applied|unapplied/i);
    expect(verification).toMatch(/hosted/i);
  });

  it('records the Technical Alpha stage is unchanged', () => {
    expect(read(VERIFICATION)).toMatch(/Technical Alpha/i);
  });

  it('separates the remaining product evidence milestone', () => {
    const verification = read(VERIFICATION);
    expect(verification).toMatch(/product\/tool evidence research/i);
    expect(verification).toMatch(/next independent milestone/i);
  });
});

describe('traceability honesty for today guidance', () => {
  const rows = read(TRACEABILITY)
    .split(/\r?\n/)
    .filter(line => /^\|\s*(TD|EN|SF|EV)-\d{2}\s*\|/.test(line));

  const cellsOf = (row: string): string[] =>
    row.split('|').map(cell => cell.trim()).filter(cell => cell !== '');

  const statusOf = (id: string): string => {
    const row = rows.find(line => line.startsWith(`| ${id} |`));
    if (row === undefined) throw new Error(`No traceability row for ${id}`);
    const cells = cellsOf(row);
    return cells[cells.length - 1];
  };

  it('keeps every TD requirement with a foundation Partial while content is draft', () => {
    // TD-07 (execution recording) and TD-08 (pause/resume) have no
    // implementation at all and stay Not started; claiming Partial for them
    // would overstate what exists.
    for (const id of ['TD-01', 'TD-02', 'TD-03', 'TD-04', 'TD-05', 'TD-06', 'TD-09']) {
      expect(statusOf(id)).toBe('Partial');
    }
  });

  it('does not claim a foundation for requirements that have none', () => {
    for (const id of ['TD-07', 'TD-08']) {
      expect(statusOf(id)).toBe('Not started');
    }
  });

  it('does not claim an Implemented requirement without source and tests', () => {
    const empty = new Set(['-', '—']);
    for (const row of rows) {
      const cells = cellsOf(row);
      const [id, , implementation, evidence, status] = cells;
      if (status !== 'Implemented') continue;
      expect(empty.has(implementation), `${id} claims Implemented with no implementation path`).toBe(false);
      expect(empty.has(evidence), `${id} claims Implemented with no test or evidence path`).toBe(false);
    }
  });

  it('traces bitemporal activity guidance without claiming hosted deployment', () => {
    const traceability = read(TRACEABILITY);
    expect(traceability).toMatch(/effective cutoff/i);
    expect(traceability).toMatch(/recorded cutoff/i);
    expect(traceability).toMatch(/stored normalized input/i);
    expect(traceability).toMatch(/not applied to hosted Supabase/i);
  });
});

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const canonicalPrd = 'StrandCue-PRD-v1.1-audit.md';
const expectedSha256 = '6579BD90E7AC420387071B07C6CB379472371CB1109FA4420DFBB6176618209B';

describe('Phase 1 product authority', () => {
  it('keeps the approved 23 September PRD unchanged across checkout line endings', async () => {
    const contents = (await readFile(canonicalPrd, 'utf8')).replaceAll('\r\n', '\n');
    expect(createHash('sha256').update(contents, 'utf8').digest('hex').toUpperCase()).toBe(expectedSha256);
  });

  it('points repository entry documents to the approved PRD and rebaseline design', async () => {
    const [readme, phaseOne] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('docs/PHASE_1.md', 'utf8'),
    ]);
    for (const document of [readme, phaseOne]) {
      expect(document).toContain('StrandCue-PRD-v1.1-audit.md');
      expect(document).toContain('2026-09-23-strandcue-phase1-rebaseline-design.md');
    }
  });
});
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const requiredGates = [
  'Signed Android build',
  'Real email verification and password recovery',
  'Fresh migration replay and authenticated API suite',
  'Backup and restore rehearsal',
  'Tombstone reapplication',
  'Provider region and data residency',
  'Named operating owners',
  'Independent reviews',
  'Beta gate review',
];

describe('beta readiness matrix', () => {
  it('maps every beta gate to evidence or a named external gate', async () => {
    const matrix = await readFile('docs/verification/beta-readiness.md', 'utf8');
    expect(matrix).toContain('Release status: **HOLD**');
    for (const gate of requiredGates) expect(matrix).toContain(gate);
    for (const status of ['Proven complete', 'Implemented, unverified', 'External gate']) {
      expect(matrix).toContain(status);
    }
  });

  it('names the blocker type on every external gate and retires stale targets', async () => {
    const matrix = await readFile('docs/verification/beta-readiness.md', 'utf8');
    const rows = matrix.split('\n').filter(line => line.startsWith('|') && line.includes('External gate'));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toMatch(/provider|device|owner|legal|human/i);
    }
    expect(matrix).not.toContain('RPO ≤24h');
    expect(matrix).not.toContain('RTO ≤8h');
    expect(matrix).not.toMatch(/not run.*\bpass\b/i);
  });
});

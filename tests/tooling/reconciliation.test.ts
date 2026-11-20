import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const requiredCapabilities = [
  'Authority and scope',
  'Authentication and recovery',
  'Hair Passport',
  'Chemical Services',
  'My Shelf and provenance',
  'My Tools',
  'Activities and unified history',
  'Settings and consent',
  'Export and portability',
  'Deletion and restore enforcement',
  'Security and RLS',
  'UX and accessibility',
  'Analytics and observability',
  'CI and automated quality',
  'Performance and resilience',
  'Backup and disaster recovery',
  'POPIA and operating ownership',
  'Beta release evidence',
];

describe('Phase 1 reconciliation matrix', () => {
  it('uses the approved evidence vocabulary and includes every capability', async () => {
    const matrix = await readFile('docs/verification/phase-1-reconciliation.md', 'utf8');
    for (const status of [
      'Proven complete',
      'Implemented, unverified',
      'Partial',
      'Missing',
      'Conflict',
      'External gate',
    ]) expect(matrix).toContain(status);
    for (const capability of requiredCapabilities) expect(matrix).toContain(`| ${capability} |`);
  });

  it('keeps the release on hold and retires stale completion tables', async () => {
    const [matrix, legacy, milestone] = await Promise.all([
      readFile('docs/verification/phase-1-reconciliation.md', 'utf8'),
      readFile('docs/verification/phase-1-acceptance-status.md', 'utf8'),
      readFile('docs/milestone8-acceptance-matrix.md', 'utf8'),
    ]);
    expect(matrix).toContain('Release status: **HOLD**');
    expect(legacy).toContain('SUPERSEDED by `phase-1-reconciliation.md`');
    expect(milestone).toContain('SUPERSEDED by `verification/phase-1-reconciliation.md`');
    expect(milestone).not.toContain('RPO ≤24h');
    expect(milestone).not.toContain('RTO ≤8h');
  });
});

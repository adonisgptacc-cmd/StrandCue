import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('backup rehearsal script contract', () => {
  it('targets the current RPO and RTO everywhere', async () => {
    const script = await readFile('scripts/backup-restore.sh', 'utf8');
    expect(script).toMatch(/RPO[^0-9]*(1 hour|3600)/i);
    expect(script).toMatch(/RTO[^0-9]*(4 hour|14400)/i);
    expect(script).toMatch(/14400/);
    expect(script).toMatch(/3600/);
  });

  it('contains no retired recovery targets', async () => {
    const script = await readFile('scripts/backup-restore.sh', 'utf8');
    expect(script).not.toMatch(/28800/);
    expect(script).not.toMatch(/8-hour|8 hour/i);
    expect(script).not.toMatch(/RPO[^0-9]*24/i);
  });

  it('reapplies deletion tombstones and re-validates RLS before reopening', async () => {
    const script = await readFile('scripts/backup-restore.sh', 'utf8');
    expect(script).toMatch(/deletion_reapply/);
    expect(script).toMatch(/tombstone/i);
    expect(script).toMatch(/row level security|RLS|relrowsecurity/i);
  });

  it('carries no credentials or personal data', async () => {
    const script = await readFile('scripts/backup-restore.sh', 'utf8');
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]+\./);
    expect(script).not.toMatch(/sk-(live|test)-[A-Za-z0-9]+/);
    expect(script).not.toMatch(/postgres(ql)?:\/\/[^/\s]*:[^/\s]*@/);
    expect(script).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });
});

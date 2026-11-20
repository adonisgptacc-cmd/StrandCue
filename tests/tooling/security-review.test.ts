import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('security review packet for D4 sign-off', () => {
  it('packet exists with findings, live evidence and a sign-off block', async () => {
    const doc = await readFile('docs/verification/security-review-packet.md', 'utf8');
    expect(doc).toMatch(/## Findings/);
    expect(doc).toMatch(/F1/);
    expect(doc).toMatch(/force row level security|force-RLS/i);
    expect(doc).toMatch(/Reviewer sign-off:\s*_{5,}/);
    expect(doc).toMatch(/Alain Ado/);
  });

  it('packet records the live anon-probe results, not assertions', async () => {
    const doc = await readFile('docs/verification/security-review-packet.md', 'utf8');
    expect(doc).toMatch(/401/);
    expect(doc).toMatch(/permission denied for schema strandcue_private/);
    expect(doc).toMatch(/no RLS policy serves/i);
  });

  it('packet carries no secrets', async () => {
    const doc = await readFile('docs/verification/security-review-packet.md', 'utf8');
    expect(doc).not.toMatch(/sbp_[A-Za-z0-9]+/);
    expect(doc).not.toMatch(/sb_secret_/);
    expect(doc).not.toMatch(/re_[A-Za-z0-9_]{10,}/);
    expect(doc).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  });
});

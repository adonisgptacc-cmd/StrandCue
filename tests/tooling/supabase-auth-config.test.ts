import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('supabase auth email config', () => {
  it('requires secure password change in the local source of truth', async () => {
    const config = await readFile('supabase/config.toml', 'utf8');
    const emailSection = config.slice(config.indexOf('[auth.email]'));
    expect(emailSection).toContain('secure_password_change = true');
    expect(emailSection).not.toContain('secure_password_change = false');
  });

  it('documents the hosted dashboard verification as a pending manual action', async () => {
    const runbook = await readFile('docs/runbooks/secure-password-change.md', 'utf8');
    expect(runbook).toContain('Secure password change');
    expect(runbook).toContain('Pending manual action');
    expect(runbook).toContain('Authentication');
  });
});

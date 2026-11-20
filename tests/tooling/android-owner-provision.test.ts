import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { cleanupAndroidOwners, provisionAndroidOwners, type ProvisionDependencies } from '../../scripts/android-owner-provision';

const ENV = {
  SUPABASE_ACCEPTANCE_TARGET: 'local-loopback', SUPABASE_ACCEPTANCE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'public-test-value', SUPABASE_ACCEPTANCE_ADMIN_KEY: 'admin-test-value',
};
const REPOSITORY_ROOT = join(tmpdir(), 'strandcue-owner-provision-repo');
const EVIDENCE_ROOT = join(tmpdir(), 'strandcue-owner-provision-evidence');
const repositoryFile = (name: string) => join(REPOSITORY_ROOT, name);
const evidenceFile = (name: string) => join(EVIDENCE_ROOT, name);

function dependencies(overrides: Partial<ProvisionDependencies> = {}) {
  const files = new Map<string, string>();
  const exec = vi.fn(async (_sql: string) => undefined);
  let created = 0;
  const fetcher = vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return new Response('{}', { status: 200 });
    return new Response(JSON.stringify({ id: `00000000-0000-4000-8000-00000000000${++created}` }), { status: 200 });
  });
  const deps: ProvisionDependencies = {
    env: ENV, fetcher, probe: { exec, counts: async () => ({}) },
    readFile: path => files.get(path) ?? '', writeFile: (path, content) => { files.set(path, content); },
    random: () => 'abcdef0123456789abcdef01', repositoryRoot: REPOSITORY_ROOT, ...overrides,
  };
  return { deps, files, exec, fetcher };
}

describe('Android owner provisioning (local stack only)', () => {
  it('creates two labelled owners, keeps credentials in a file outside the repository and prints nothing sensitive', async () => {
    const { deps, files, exec } = dependencies();
    const owners = await provisionAndroidOwners(evidenceFile('credentials.json'), deps);
    expect(owners.map(owner => owner.label)).toEqual(['SC-ANDROID-T5-OWNER-A', 'SC-ANDROID-T5-OWNER-B']);
    expect(JSON.stringify(owners)).not.toMatch(/00000000-0000-4000|abcdef0123/);
    const written = [...files.values()].at(-1) ?? '';
    expect(JSON.parse(written).owners).toHaveLength(2);
    expect(written).toContain('example.test');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('refuses a credentials file inside the repository, a hosted target and a missing key', async () => {
    await expect(provisionAndroidOwners(repositoryFile('creds.json'), dependencies().deps)).rejects.toThrow('CREDENTIALS_PATH_INSIDE_REPOSITORY');
    await expect(provisionAndroidOwners(REPOSITORY_ROOT, dependencies().deps)).rejects.toThrow('CREDENTIALS_PATH_INSIDE_REPOSITORY');
    const hosted = { SUPABASE_ACCEPTANCE_TARGET: 'isolated-test', SUPABASE_ACCEPTANCE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ACCEPTANCE_ENV_LABEL: 'isolated_test',
      SUPABASE_ACCEPTANCE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_ACCEPTANCE_PRODUCTION_REFS: 'zzzzzzzzzzzzzzzzzzzz', SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'k', SUPABASE_ACCEPTANCE_ADMIN_KEY: 'x' };
    await expect(provisionAndroidOwners(evidenceFile('b.json'), dependencies({ env: hosted }).deps)).rejects.toThrow('CONFIG_INVALID');
    await expect(provisionAndroidOwners(evidenceFile('c.json'), dependencies({ env: { ...ENV, SUPABASE_ACCEPTANCE_ADMIN_KEY: '' } }).deps)).rejects.toThrow('CONFIG_INVALID');
    await expect(provisionAndroidOwners(evidenceFile('d.json'), dependencies({ env: {} }).deps)).rejects.toThrow('CONFIG_INVALID');
  });

  it('cleans up the owners it created and the fixtures, and counts a refusal as a failure', async () => {
    const { deps, files, exec } = dependencies();
    await provisionAndroidOwners(evidenceFile('cleanup.json'), deps);
    const result = await cleanupAndroidOwners(evidenceFile('cleanup.json'), deps);
    expect(result).toEqual({ removed: 2, failed: 0 });
    expect(exec).toHaveBeenCalledTimes(2);
    const failing = dependencies({ fetcher: async () => new Response('{}', { status: 500 }) });
    failing.files.set(evidenceFile('f.json'), JSON.stringify({ owners: [{ label: 'x', id: '00000000-0000-4000-8000-000000000001', email: 'e', password: 'p' }] }));
    expect(await cleanupAndroidOwners(evidenceFile('f.json'), failing.deps)).toEqual({ removed: 0, failed: 1 });
    expect(files.size).toBe(1);
    await expect(cleanupAndroidOwners(repositoryFile('x.json'), deps)).rejects.toThrow('CREDENTIALS_PATH_INSIDE_REPOSITORY');
    await expect(cleanupAndroidOwners(evidenceFile('cleanup.json'), dependencies({ env: {} }).deps)).rejects.toThrow('CONFIG_INVALID');
  });
});

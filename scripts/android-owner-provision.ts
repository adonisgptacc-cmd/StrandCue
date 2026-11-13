import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanupOwnerIsolationFixtures, seedOwnerIsolationFixtures, type PrivilegedProbe } from './owner-isolation-scenarios.ts';
import { classifyOwnerIsolationTarget, redactIdentifier } from './supabase-owner-isolation.ts';

/**
 * Provisions the two synthetic owners (and the synthetic catalogue fixtures) for the Android device journeys, on a
 * numeric-loopback local stack only. Credentials are generated here and written to a file OUTSIDE the repository; they
 * are never printed. A hosted project is refused: it must supply its own pre-provisioned owners.
 *
 *   node scripts/android-owner-provision.ts provision <credentials-file>
 *   node scripts/android-owner-provision.ts cleanup <credentials-file>
 */
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface ProvisionDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetcher: Fetcher;
  readonly probe: PrivilegedProbe;
  readonly readFile: (path: string) => string;
  readonly writeFile: (path: string, content: string) => void;
  readonly random: () => string;
  /** The repository root, so a credentials file is never written inside it. */
  readonly repositoryRoot: string;
}

export interface OwnerCredential { readonly label: string; readonly id: string; readonly email: string; readonly password: string }

const LABELS = ['SC-ANDROID-T5-OWNER-A', 'SC-ANDROID-T5-OWNER-B'] as const;

function outsideRepository(path: string, root: string): string {
  // A drive-letter repository root is compared with Windows rules on every host, so the containment
  // answer never depends on the platform running the check.
  const flavor = process.platform === 'win32' || /^[A-Za-z]:[\\/]/.test(root) ? win32 : posix;
  const { isAbsolute, relative } = flavor;
  const absolute = flavor.resolve(path);
  const from = relative(flavor.resolve(root), absolute);
  // A path on another drive, or above the repository, is outside it. Anything else is inside.
  if (from === '' || !(from.startsWith('..') || isAbsolute(from))) throw new Error('CREDENTIALS_PATH_INSIDE_REPOSITORY');
  return absolute;
}

async function ok(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error('REQUEST_FAILED');
  const value: unknown = JSON.parse(await response.text());
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('MALFORMED_RESPONSE');
  return value as Record<string, unknown>;
}

export async function provisionAndroidOwners(path: string, deps: ProvisionDependencies): Promise<readonly { label: string; id: string }[]> {
  const target = classifyOwnerIsolationTarget(deps.env);
  const admin = deps.env.SUPABASE_ACCEPTANCE_ADMIN_KEY ?? '';
  if (target.kind !== 'local-loopback' || !admin || !deps.env.SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY) throw new Error('CONFIG_INVALID');
  const file = outsideRepository(path, deps.repositoryRoot);
  if (existsSync(file)) throw new Error('CREDENTIALS_FILE_EXISTS');
  const suffix = deps.random().slice(0, 8);
  const owners: OwnerCredential[] = [];
  for (const label of LABELS) {
    const email = `${label.toLowerCase()}-${suffix}@example.test`;
    // No shell-special characters: the device journey types this through `adb shell input text`.
    const password = `Sc-T5-${deps.random()}-Aa1x`;
    const created = await ok(await deps.fetcher(`${target.url}/auth/v1/admin/users`, {
      method: 'POST', redirect: 'error', headers: { apikey: admin, Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    }));
    owners.push({ label, id: String(created.id ?? ''), email, password });
    // Written as soon as each owner exists, so an interrupted run can still be cleaned up.
    deps.writeFile(file, JSON.stringify({ owners }, null, 2));
  }
  await seedOwnerIsolationFixtures(deps.probe);
  return owners.map(owner => ({ label: owner.label, id: redactIdentifier(owner.id) }));
}

export async function cleanupAndroidOwners(path: string, deps: ProvisionDependencies): Promise<{ removed: number; failed: number }> {
  const target = classifyOwnerIsolationTarget(deps.env);
  const admin = deps.env.SUPABASE_ACCEPTANCE_ADMIN_KEY ?? '';
  if (target.kind !== 'local-loopback' || !admin) throw new Error('CONFIG_INVALID');
  const parsed = JSON.parse(deps.readFile(outsideRepository(path, deps.repositoryRoot))) as { owners?: OwnerCredential[] };
  let removed = 0;
  let failed = 0;
  for (const owner of parsed.owners ?? []) {
    const response = await deps.fetcher(`${target.url}/auth/v1/admin/users/${owner.id}`, {
      method: 'DELETE', redirect: 'error', headers: { apikey: admin, Authorization: `Bearer ${admin}` },
    });
    if (response.ok) removed++; else failed++;
  }
  await cleanupOwnerIsolationFixtures(deps.probe);
  return { removed, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  const env = process.env;
  const psqlProbe: PrivilegedProbe = {
    exec: async sql => {
      const result = spawnSync('psql', ['-h', '127.0.0.1', '-p', env.SUPABASE_ACCEPTANCE_DB_PORT ?? '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
        { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: env.SUPABASE_ACCEPTANCE_DB_PASSWORD ?? '' } });
      if (result.status !== 0) throw new Error('PSQL_FAILED');
    },
    counts: async () => ({}),
  };
  const deps: ProvisionDependencies = {
    env, fetcher: fetch, probe: psqlProbe, readFile: path => readFileSync(path, 'utf8'),
    writeFile: (path, content) => writeFileSync(path, content, { mode: 0o600 }), random: () => randomBytes(12).toString('hex'), repositoryRoot: process.cwd(),
  };
  try {
    if (!file || (command !== 'provision' && command !== 'cleanup')) throw new Error('USAGE');
    if (command === 'provision') {
      const owners = await provisionAndroidOwners(file, deps);
      process.stdout.write(`ANDROID-OWNERS-PROVISIONED ${owners.map(owner => `${owner.label}=${owner.id}`).join(' ')}\n`);
    } else {
      const result = await cleanupAndroidOwners(file, deps);
      process.stdout.write(`ANDROID-OWNERS-CLEANED removed=${result.removed} failed=${result.failed}\n`);
      process.exitCode = result.failed === 0 ? 0 : 1;
    }
  } catch (error) {
    process.stdout.write(`ANDROID-OWNERS-${error instanceof Error ? error.message : 'FAILED'}\n`);
    process.exitCode = 1;
  }
}

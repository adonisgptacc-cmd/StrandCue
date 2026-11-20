import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cleanupOwnerIsolationFixtures,
  runOwnerIsolationScenarios,
  summarizeScenarioResults,
  type HttpResult,
  type Principal,
  type PrivilegedProbe,
  type ScenarioResult,
  type ScenarioTransport,
} from './owner-isolation-scenarios.ts';
import {
  classifyOwnerIsolationTarget,
  formatOwnerIsolationReport,
  redactIdentifier,
  runOwnerIsolationHarness,
  type OwnerIsolationReport,
  type OwnerIsolationTarget,
} from './supabase-owner-isolation.ts';

/**
 * The live runner for the two-owner scenarios. It proves the target first, provisions two synthetic owners only on a
 * numeric-loopback stack (a hosted isolated project must supply its own owners), runs the table checks and the
 * scenarios over real HTTP, and removes what it created. Credentials are generated, kept in memory and never printed.
 */

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type PsqlRunner = (sql: string) => Promise<string>;

export interface LiveRunDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetcher: Fetcher;
  /** Privileged SQL, available on a local stack only. */
  readonly psql: PsqlRunner | null;
  readonly random: () => string;
}

export interface LiveRunReport {
  readonly status: 'PASS' | 'FAIL' | 'BLOCKED' | 'CONFIG_INVALID';
  readonly target: { readonly kind: string; readonly projectRef: string };
  readonly tables: OwnerIsolationReport | null;
  readonly scenarios: readonly ScenarioResult[];
  readonly cleanup: 'DONE' | 'SKIPPED' | 'FAILED';
  readonly owners: readonly { readonly label: string; readonly id: string }[];
}

interface Owner { readonly label: string; readonly email: string; readonly password: string; readonly id: string; readonly token: string }

const PRIVILEGED_COUNTS_SQL = `select (select count(*) from public.user_products), (select count(*) from public.user_product_revisions),
  (select count(*) from strandcue_private.shelf_operations), (select count(*) from public.user_tools),
  (select count(*) from public.user_tool_revisions), (select count(*) from strandcue_private.tool_operations),
  (select count(*) from public.cue_checks), (select count(*) from public.cue_check_revisions), (select count(*) from strandcue_private.cue_check_operations),
  (select count(*) from public.treatment_programmes), (select count(*) from public.treatment_programme_events), (select count(*) from strandcue_private.treatment_programme_operations)`;
const COUNT_KEYS = ['user_products', 'user_product_revisions', 'shelf_operations', 'user_tools', 'user_tool_revisions', 'tool_operations', 'cue_checks', 'cue_check_revisions', 'cue_check_operations', 'treatment_programmes', 'treatment_programme_events', 'treatment_programme_operations'] as const;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* falls through */ }
  throw new Error('MALFORMED_RESPONSE');
}

async function provisionOwner(
  url: string, publishableKey: string, adminKey: string, label: string, suffix: string, password: string, fetcher: Fetcher,
): Promise<Owner> {
  const email = `${label.toLowerCase()}-${suffix}@example.test`;
  const created = await fetcher(`${url}/auth/v1/admin/users`, {
    method: 'POST', redirect: 'error', headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) throw new Error('PROVISION_FAILED');
  const id = String((await readJson(created)).id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('PROVISION_FAILED');
  const session = await fetcher(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', redirect: 'error', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!session.ok) throw new Error('AUTH_FAILED');
  const token = (await readJson(session)).access_token;
  if (typeof token !== 'string' || token.length === 0) throw new Error('AUTH_FAILED');
  return Object.freeze({ label, email, password, id, token });
}

function httpTransport(url: string, publishableKey: string, fetcher: Fetcher): ScenarioTransport {
  return {
    async send(principal: Principal, method, path, body): Promise<HttpResult> {
      const headers: Record<string, string> = { apikey: publishableKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      if (principal.token) headers.Authorization = `Bearer ${principal.token}`;
      const response = await fetcher(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
      return { status: response.status, text: await response.text() };
    },
  };
}

function probeOver(psql: PsqlRunner): PrivilegedProbe {
  return {
    exec: async sql => { await psql(sql); },
    counts: async () => {
      const cells = (await psql(PRIVILEGED_COUNTS_SQL)).trim().split('|').map(Number);
      if (cells.length !== COUNT_KEYS.length || cells.some(cell => !Number.isInteger(cell))) throw new Error('MALFORMED_RESPONSE');
      return Object.fromEntries(COUNT_KEYS.map((key, index) => [key, cells[index]]));
    },
  };
}

/** Real `psql` against a loopback database: the only privileged path, and only for a local stack. */
export function localPsql(env: Readonly<Record<string, string | undefined>>): PsqlRunner {
  const port = env.SUPABASE_ACCEPTANCE_DB_PORT ?? '54322';
  if (!/^\d{2,5}$/.test(port)) throw new Error('CONFIG_INVALID');
  return async sql => {
    const result = spawnSync('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSWORD: env.SUPABASE_ACCEPTANCE_DB_PASSWORD ?? '' } });
    if (result.status !== 0) throw new Error('PSQL_FAILED');
    return result.stdout;
  };
}

async function deleteOwner(url: string, adminKey: string, id: string, fetcher: Fetcher): Promise<boolean> {
  const response = await fetcher(`${url}/auth/v1/admin/users/${id}`, {
    method: 'DELETE', redirect: 'error', headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
  });
  return response.ok;
}

export async function runOwnerIsolationLive(deps: LiveRunDependencies): Promise<LiveRunReport> {
  const { env, fetcher } = deps;
  const empty = (kind: string, projectRef: string): LiveRunReport => ({ status: 'CONFIG_INVALID', target: { kind, projectRef }, tables: null, scenarios: [], cleanup: 'SKIPPED', owners: [] });
  let target: OwnerIsolationTarget;
  try { target = classifyOwnerIsolationTarget(env); } catch { return empty('unproven', '***'); }
  const publishableKey = env.SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY ?? '';
  const adminKey = env.SUPABASE_ACCEPTANCE_ADMIN_KEY ?? '';
  // A hosted project is never given an admin key by this runner, and a local stack needs both keys.
  if (!publishableKey || (target.kind === 'isolated-hosted' && adminKey !== '') || (target.kind === 'local-loopback' && !adminKey)) return empty(target.kind, redactIdentifier(target.projectRef));
  const ref = redactIdentifier(target.projectRef);
  const suffix = deps.random().slice(0, 8);
  const owners: Owner[] = [];
  let tables: OwnerIsolationReport | null = null;
  let scenarios: readonly ScenarioResult[] = [];
  let cleanup: LiveRunReport['cleanup'] = 'SKIPPED';
  const probe = target.kind === 'local-loopback' && deps.psql ? probeOver(deps.psql) : null;
  try {
    if (target.kind === 'local-loopback') {
      for (const label of ['SC-ANDROID-T5-OWNER-A', 'SC-ANDROID-T5-OWNER-B']) {
        owners.push(await provisionOwner(target.url, publishableKey, adminKey, label, suffix, `Sc-T5-${deps.random()}-Aa1!`, fetcher));
      }
    } else {
      const credentials = (label: string, key: 'A' | 'B') => ({ label, email: env[`SUPABASE_ACCEPTANCE_OWNER_${key}_EMAIL`] ?? '', password: env[`SUPABASE_ACCEPTANCE_OWNER_${key}_PASSWORD`] ?? '' });
      for (const [label, key] of [['SC-ANDROID-T5-OWNER-A', 'A'], ['SC-ANDROID-T5-OWNER-B', 'B']] as const) {
        const given = credentials(label, key);
        if (!given.email || !given.password) throw new Error('CONFIG_INVALID');
        const session = await fetcher(`${target.url}/auth/v1/token?grant_type=password`, {
          method: 'POST', redirect: 'error', headers: { apikey: publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: given.email, password: given.password }),
        });
        if (!session.ok) throw new Error('AUTH_FAILED');
        const payload = await readJson(session);
        owners.push({ ...given, id: String((payload.user as { id?: unknown } | undefined)?.id ?? ''), token: String(payload.access_token ?? '') });
      }
    }
    const [a, b] = owners;
    // The scenarios create the owner profiles and data first, so the table-level checks then see real owner rows.
    scenarios = await runOwnerIsolationScenarios({
      transport: httpTransport(target.url, publishableKey, fetcher),
      a: { name: 'owner-a', id: a.id, token: a.token }, b: { name: 'owner-b', id: b.id, token: b.token },
      anonymous: { name: 'anonymous', id: null, token: null }, probe,
    });
    tables = await runOwnerIsolationHarness({ url: target.url, publishableKey, ownerA: { email: a.email, password: a.password }, ownerB: { email: b.email, password: b.password } }, fetcher);
  } catch (error) {
    scenarios = [...scenarios, { id: 'live.run', area: 'idempotency', status: 'FAIL', detail: error instanceof Error ? error.message : 'unexpected failure' }];
  } finally {
    if (target.kind === 'local-loopback' && env.SUPABASE_ACCEPTANCE_KEEP !== '1') {
      try {
        let removed = true;
        for (const owner of owners) removed = (await deleteOwner(target.url, adminKey, owner.id, fetcher)) && removed;
        if (probe) await cleanupOwnerIsolationFixtures(probe);
        cleanup = removed ? 'DONE' : 'FAILED';
      } catch { cleanup = 'FAILED'; }
    }
  }
  const summary = summarizeScenarioResults(scenarios);
  const tableHold = tables === null || tables.status === 'HOLD';
  const status = scenarios.some(result => result.id === 'live.run') || tableHold || summary.status === 'FAIL' ? 'FAIL' : summary.status === 'BLOCKED' || tables?.status === 'BLOCKED' ? 'BLOCKED' : 'PASS';
  return { status, target: { kind: target.kind, projectRef: ref }, tables, scenarios, cleanup, owners: owners.map(owner => ({ label: owner.label, id: redactIdentifier(owner.id) })) };
}

export function formatLiveRunReport(report: LiveRunReport): string {
  const summary = summarizeScenarioResults(report.scenarios);
  const tables = report.tables ? formatOwnerIsolationReport(report.tables) : 'OWNER-ISOLATION-NOT-RUN';
  return `OWNER-ISOLATION-LIVE-${report.status} target=${report.target.kind} ref=${report.target.projectRef} scenarios pass=${summary.pass} fail=${summary.fail} blocked=${summary.blocked} cleanup=${report.cleanup} ${tables}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const report = await runOwnerIsolationLive({
    env, fetcher: fetch, psql: env.SUPABASE_ACCEPTANCE_TARGET === 'local-loopback' ? localPsql(env) : null, random: () => randomBytes(12).toString('hex'),
  });
  process.stdout.write(`${formatLiveRunReport(report)}\n`);
  for (const result of report.scenarios) if (result.status !== 'PASS') process.stdout.write(`  ${result.status} ${result.id}: ${result.detail}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

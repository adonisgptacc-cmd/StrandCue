import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type OwnerIsolationStatus = 'PASS' | 'BLOCKED' | 'HOLD';
export type OwnerIsolationCode =
  | 'ISOLATED' | 'OWN_FIXTURE_MISSING' | 'MALFORMED_RESPONSE'
  | 'OWNER_FIELD_MISSING' | 'OWNER_MISMATCH' | 'AMBIGUOUS_PROFILE'
  | 'FOREIGN_ROW_VISIBLE' | 'AUTH_FAILED' | 'IDENTITY_INVALID' | 'HTTP_FAILED' | 'CONFIG_INVALID';

export interface OwnerIsolationTableSpec {
  readonly table: string;
  readonly ownerColumn: string;
  readonly fixtureRequired: boolean;
  readonly singleton: boolean;
}

export const DEFAULT_OWNER_ISOLATION_TABLES: readonly OwnerIsolationTableSpec[] = Object.freeze([
  Object.freeze({ table: 'profiles', ownerColumn: 'user_id', fixtureRequired: true, singleton: true }),
  Object.freeze({ table: 'user_products', ownerColumn: 'owner', fixtureRequired: false, singleton: false }),
  Object.freeze({ table: 'recommendation_runs', ownerColumn: 'user_id', fixtureRequired: false, singleton: false }),
  Object.freeze({ table: 'protocol_executions', ownerColumn: 'user_id', fixtureRequired: false, singleton: false }),
  Object.freeze({ table: 'protocol_execution_events', ownerColumn: 'user_id', fixtureRequired: false, singleton: false }),
]);

export interface OwnerIsolationResult {
  readonly table: string;
  readonly status: OwnerIsolationStatus;
  readonly code: OwnerIsolationCode;
  readonly ownRows: number;
}

interface EvaluateOwnerIsolationInput {
  readonly spec: OwnerIsolationTableSpec;
  readonly ownerId: string;
  readonly ownBody: string;
  readonly foreignBody: string;
}

type JsonRow = Readonly<Record<string, unknown>>;

const frozenResult = (
  table: string, status: OwnerIsolationStatus, code: OwnerIsolationCode, ownRows: number,
): OwnerIsolationResult => Object.freeze({ table, status, code, ownRows });

function parseRows(body: string): readonly JsonRow[] | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!Array.isArray(value) || value.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) return null;
    return value as readonly JsonRow[];
  } catch {
    return null;
  }
}

export function evaluateOwnerIsolationResponse(input: EvaluateOwnerIsolationInput): OwnerIsolationResult {
  const ownRows = parseRows(input.ownBody);
  const foreignRows = parseRows(input.foreignBody);
  if (ownRows === null || foreignRows === null) {
    return frozenResult(input.spec.table, 'HOLD', 'MALFORMED_RESPONSE', ownRows?.length ?? 0);
  }
  if (foreignRows.length > 0) {
    return frozenResult(input.spec.table, 'HOLD', 'FOREIGN_ROW_VISIBLE', ownRows.length);
  }
  if (ownRows.length === 0) {
    return input.spec.fixtureRequired
      ? frozenResult(input.spec.table, 'HOLD', 'OWNER_MISMATCH', 0)
      : frozenResult(input.spec.table, 'BLOCKED', 'OWN_FIXTURE_MISSING', 0);
  }
  if (input.spec.singleton && ownRows.length !== 1) {
    return frozenResult(input.spec.table, 'HOLD', 'AMBIGUOUS_PROFILE', ownRows.length);
  }
  if (ownRows.some(row => !(input.spec.ownerColumn in row))) {
    return frozenResult(input.spec.table, 'HOLD', 'OWNER_FIELD_MISSING', ownRows.length);
  }
  if (ownRows.some(row => row[input.spec.ownerColumn] !== input.ownerId)) {
    return frozenResult(input.spec.table, 'HOLD', 'OWNER_MISMATCH', ownRows.length);
  }
  return frozenResult(input.spec.table, 'PASS', 'ISOLATED', ownRows.length);
}

interface OwnerCredentials {
  readonly email: string;
  readonly password: string;
}

export interface OwnerIsolationConfig {
  readonly url: string;
  readonly publishableKey: string;
  readonly ownerA: OwnerCredentials;
  readonly ownerB: OwnerCredentials;
}

export interface OwnerIsolationReport {
  readonly status: OwnerIsolationStatus;
  readonly code?: OwnerIsolationCode;
  readonly results: readonly OwnerIsolationResult[];
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface AuthenticatedOwner {
  readonly id: string;
  readonly accessToken: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authenticate(baseUrl: string, key: string, credentials: OwnerCredentials, fetcher: Fetcher): Promise<AuthenticatedOwner> {
  const response = await fetcher(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!response.ok) throw new Error('AUTH_FAILED');
  let payload: unknown;
  try { payload = JSON.parse(await response.text()); } catch { throw new Error('AUTH_FAILED'); }
  if (payload === null || typeof payload !== 'object') throw new Error('AUTH_FAILED');
  const candidate = payload as { access_token?: unknown; user?: { id?: unknown } };
  if (typeof candidate.access_token !== 'string' || candidate.access_token.length === 0) throw new Error('AUTH_FAILED');
  if (typeof candidate.user?.id !== 'string' || !uuidPattern.test(candidate.user.id)) throw new Error('IDENTITY_INVALID');
  return Object.freeze({ id: candidate.user.id, accessToken: candidate.access_token });
}

async function readRows(
  baseUrl: string, key: string, caller: AuthenticatedOwner,
  spec: OwnerIsolationTableSpec, requestedOwner: string, fetcher: Fetcher,
): Promise<string> {
  const url = new URL(`${baseUrl}/rest/v1/${spec.table}`);
  url.searchParams.set('select', spec.ownerColumn);
  url.searchParams.set(spec.ownerColumn, `eq.${requestedOwner}`);
  const response = await fetcher(url.toString(), {
    method: 'GET', headers: { apikey: key, Authorization: `Bearer ${caller.accessToken}` },
  });
  if (!response.ok) throw new Error('HTTP_FAILED');
  return response.text();
}

const holdReport = (code: OwnerIsolationCode): OwnerIsolationReport => Object.freeze({
  status: 'HOLD' as const, code, results: Object.freeze([]),
});

/** An identifier is never printed whole: a short prefix is enough to tell two apart in a report. */
export function redactIdentifier(value: string | null | undefined): string {
  return typeof value === 'string' && value.length > 3 ? `${value.slice(0, 3)}***` : '***';
}

export type OwnerIsolationTargetKind = 'local-loopback' | 'isolated-hosted';

export interface OwnerIsolationTarget {
  readonly kind: OwnerIsolationTargetKind;
  readonly url: string;
  readonly projectRef: string | null;
}

const HOSTED_PROJECT_HOST = /^([a-z0-9]{20})\.supabase\.co$/;

/**
 * Decides whether the harness may touch a target at all, before any request is made. It accepts exactly two
 * things: a numeric-loopback local stack, or a hosted project proven isolated by an explicit label, a project
 * reference that matches its host, and a non-empty list of known production references it is not on. Anything
 * absent, malformed, ambiguous or production-like throws CONFIG_INVALID.
 */
export function classifyOwnerIsolationTarget(env: Readonly<Record<string, string | undefined>>): OwnerIsolationTarget {
  const invalid = (): never => { throw new Error('CONFIG_INVALID'); };
  const target = env.SUPABASE_ACCEPTANCE_TARGET;
  let url: URL;
  try { url = new URL(env.SUPABASE_ACCEPTANCE_URL ?? ''); } catch { return invalid(); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return invalid();
  const ref = env.SUPABASE_ACCEPTANCE_PROJECT_REF?.trim() || null;
  if (target === 'local-loopback') {
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || !url.port || ref !== null) return invalid();
    return Object.freeze({ kind: 'local-loopback' as const, url: url.origin, projectRef: null });
  }
  if (target === 'isolated-test') {
    const host = HOSTED_PROJECT_HOST.exec(url.hostname);
    if (url.protocol !== 'https:' || !host || url.port) return invalid();
    if (env.SUPABASE_ACCEPTANCE_ENV_LABEL !== 'isolated_test' || ref === null || ref !== host[1]) return invalid();
    const production = (env.SUPABASE_ACCEPTANCE_PRODUCTION_REFS ?? '').split(',').map(entry => entry.trim()).filter(Boolean);
    if (production.length === 0 || production.includes(ref)) return invalid();
    return Object.freeze({ kind: 'isolated-hosted' as const, url: url.origin, projectRef: ref });
  }
  return invalid();
}

function validConfig(config: OwnerIsolationConfig): boolean {
  try {
    const url = new URL(config.url);
    const loopback = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname) && Boolean(url.port);
    return (url.protocol === 'https:' || loopback) && Boolean(config.publishableKey)
      && Boolean(config.ownerA.email && config.ownerA.password && config.ownerB.email && config.ownerB.password);
  } catch { return false; }
}

export async function runOwnerIsolationHarness(
  config: OwnerIsolationConfig, fetcher: Fetcher = fetch,
): Promise<OwnerIsolationReport> {
  if (!validConfig(config)) return holdReport('CONFIG_INVALID');
  try {
    const baseUrl = config.url.replace(/\/$/, '');
    const [ownerA, ownerB] = await Promise.all([
      authenticate(baseUrl, config.publishableKey, config.ownerA, fetcher),
      authenticate(baseUrl, config.publishableKey, config.ownerB, fetcher),
    ]);
    if (ownerA.id === ownerB.id) return holdReport('IDENTITY_INVALID');
    const results: OwnerIsolationResult[] = [];
    for (const [caller, foreign] of [[ownerA, ownerB], [ownerB, ownerA]] as const) {
      for (const spec of DEFAULT_OWNER_ISOLATION_TABLES) {
        const [ownBody, foreignBody] = await Promise.all([
          readRows(baseUrl, config.publishableKey, caller, spec, caller.id, fetcher),
          readRows(baseUrl, config.publishableKey, caller, spec, foreign.id, fetcher),
        ]);
        results.push(evaluateOwnerIsolationResponse({ spec, ownerId: caller.id, ownBody, foreignBody }));
      }
    }
    const immutableResults = Object.freeze([...results]);
    const status: OwnerIsolationStatus = results.some(result => result.status === 'HOLD')
      ? 'HOLD' : results.some(result => result.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
    return Object.freeze({ status, results: immutableResults });
  } catch (error) {
    const code = error instanceof Error && ['AUTH_FAILED', 'IDENTITY_INVALID', 'HTTP_FAILED'].includes(error.message)
      ? error.message as OwnerIsolationCode : 'HTTP_FAILED';
    return holdReport(code);
  }
}

export function formatOwnerIsolationReport(report: OwnerIsolationReport): string {
  const pass = report.results.filter(result => result.status === 'PASS').length;
  const blocked = report.results.filter(result => result.status === 'BLOCKED').length;
  const hold = report.results.filter(result => result.status === 'HOLD').length;
  const suffix = report.code ? ` code=${report.code}` : ` pass=${pass} blocked=${blocked} hold=${hold}`;
  return `OWNER-ISOLATION-${report.status}${suffix}`;
}

export async function runOwnerIsolationCli(
  env: Readonly<Record<string, string | undefined>> = process.env, fetcher: Fetcher = fetch,
): Promise<number> {
  let target: OwnerIsolationTarget;
  try { target = classifyOwnerIsolationTarget(env); } catch {
    process.stdout.write(`${formatOwnerIsolationReport(holdReport('CONFIG_INVALID'))}\n`);
    return 1;
  }
  const report = await runOwnerIsolationHarness({
    url: target.url,
    publishableKey: env.SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY ?? '',
    ownerA: { email: env.SUPABASE_ACCEPTANCE_OWNER_A_EMAIL ?? '', password: env.SUPABASE_ACCEPTANCE_OWNER_A_PASSWORD ?? '' },
    ownerB: { email: env.SUPABASE_ACCEPTANCE_OWNER_B_EMAIL ?? '', password: env.SUPABASE_ACCEPTANCE_OWNER_B_PASSWORD ?? '' },
  }, fetcher);
  process.stdout.write(`${formatOwnerIsolationReport(report)}\n`);
  return report.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runOwnerIsolationCli();
}

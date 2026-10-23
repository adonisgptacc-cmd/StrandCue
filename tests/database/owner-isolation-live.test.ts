import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { formatLiveRunReport, localPsql, runOwnerIsolationLive, type PsqlRunner } from '../../scripts/owner-isolation-live.ts';
import { database, USER_A, USER_B } from './harness.ts';
import { pgliteTransport } from '../helpers/postgrest-pglite-transport.ts';

/**
 * PGlite evidence only: a fake HTTP backend routes the live runner's provisioning, sign-in and REST calls to the real
 * migrations in PGlite. It proves the runner's logic (target proof, provisioning, cleanup, reporting), not the wire.
 */
let db: PGlite;
beforeAll(async () => { db = await database(); }, 60_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('delete from public.profiles');
});

const LOCAL_ENV = {
  SUPABASE_ACCEPTANCE_TARGET: 'local-loopback', SUPABASE_ACCEPTANCE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'publishable-test-value', SUPABASE_ACCEPTANCE_ADMIN_KEY: 'admin-test-value',
};

function backend(options: { failProvisioning?: boolean; failDelete?: boolean } = {}) {
  const { transport, probe } = pgliteTransport(db);
  const tokens = new Map<string, string>();
  const emails = new Map<string, string>();
  let created = 0;
  const requests: string[] = [];
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
  const fetcher = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input);
    const method = (init.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE';
    const headers = (init.headers ?? {}) as Record<string, string>;
    requests.push(`${method} ${url.pathname}`);
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      if (options.failProvisioning) return json({ message: 'nope' }, 500);
      const id = created++ === 0 ? USER_A : USER_B;
      emails.set((JSON.parse(String(init.body)) as { email: string }).email, id);
      return json({ id });
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
      if (options.failDelete) return json({}, 500);
      await probe.exec('delete from public.profiles');
      return json({});
    }
    if (url.pathname === '/auth/v1/token') {
      const id = emails.get((JSON.parse(String(init.body)) as { email: string }).email);
      if (!id) return json({ message: 'bad' }, 400);
      const token = `token-${id.slice(0, 4)}`;
      tokens.set(token, id);
      return json({ access_token: token, user: { id } });
    }
    const bearer = headers.Authorization?.replace('Bearer ', '');
    const id = bearer ? tokens.get(bearer) ?? null : null;
    const name = id === USER_A ? 'owner-a' : id === USER_B ? 'owner-b' : 'anonymous';
    const result = await transport.send({ name, id, token: bearer ?? null }, method, `${url.pathname}${url.search}`, init.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(result.text, { status: result.status });
  };
  const psql: PsqlRunner = async sql => {
    if (sql.includes('shelf_operations')) {
      const counts = await probe.counts();
      return [counts.user_products, counts.user_product_revisions, counts.shelf_operations, counts.user_tools, counts.user_tool_revisions, counts.tool_operations, counts.cue_checks, counts.cue_check_revisions, counts.cue_check_operations, counts.treatment_programmes, counts.treatment_programme_events, counts.treatment_programme_operations].join('|');
    }
    await probe.exec(sql);
    return '';
  };
  return { fetcher, psql, requests };
}

describe('the live two-owner runner (PGlite behind a fake HTTP backend)', () => {
  it('proves the target, provisions two owners, runs every scenario, and removes what it created', async () => {
    const { fetcher, psql } = backend();
    const report = await runOwnerIsolationLive({ env: LOCAL_ENV, fetcher, psql, random: () => crypto.randomUUID().replaceAll('-', '') });
    expect(report.scenarios.filter(result => result.status !== 'PASS').map(result => `${result.id}: ${result.detail}`)).toEqual([]);
    expect(report.scenarios).toHaveLength(56);
    expect(report.cleanup).toBe('DONE');
    expect(report.owners.map(owner => owner.label)).toEqual(['SC-ANDROID-T5-OWNER-A', 'SC-ANDROID-T5-OWNER-B']);
    // Nothing identifying is reported whole, and the fixtures are gone.
    expect(JSON.stringify(report)).not.toContain(USER_A);
    expect(JSON.stringify(report)).not.toContain('admin-test-value');
    expect(report.target).toEqual({ kind: 'local-loopback', projectRef: '***' });
    // Tables with no fixtures are reported as BLOCKED, never as a pass: guidance and protocol rows are not invented.
    expect(report.tables?.results.filter(result => result.status === 'BLOCKED').map(result => result.table)).toEqual(
      expect.arrayContaining(['recommendation_runs', 'protocol_executions', 'protocol_execution_events']));
    expect(report.status).toBe('BLOCKED');
    expect(formatLiveRunReport(report)).toMatch(/^OWNER-ISOLATION-LIVE-BLOCKED target=local-loopback ref=\*\*\* scenarios pass=56 fail=0 blocked=0 cleanup=DONE /);
    await db.exec('set session authorization postgres');
    const { rows } = await db.query<{ n: string }>(`select ((select count(*) from public.tool_versions) + (select count(*) from public.product_versions where id::text like 'c5%'))::text n`);
    expect(rows[0].n).toBe('0');
  }, 180_000);

  it('refuses an unproven target before any request is made', async () => {
    const { fetcher, psql, requests } = backend();
    const report = await runOwnerIsolationLive({ env: { ...LOCAL_ENV, SUPABASE_ACCEPTANCE_URL: 'http://localhost:54321' }, fetcher, psql, random: () => 'abcdef0123456789' });
    expect(report.status).toBe('CONFIG_INVALID');
    expect(requests).toEqual([]);
    expect(formatLiveRunReport(report)).toContain('OWNER-ISOLATION-LIVE-CONFIG_INVALID');
  });

  it('never hands an admin key to a hosted project, and needs the public key and both keys locally', async () => {
    const { fetcher, psql, requests } = backend();
    const hosted = {
      SUPABASE_ACCEPTANCE_TARGET: 'isolated-test', SUPABASE_ACCEPTANCE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ACCEPTANCE_ENV_LABEL: 'isolated_test',
      SUPABASE_ACCEPTANCE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_ACCEPTANCE_PRODUCTION_REFS: 'zzzzzzzzzzzzzzzzzzzz', SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'k',
    };
    for (const env of [{ ...hosted, SUPABASE_ACCEPTANCE_ADMIN_KEY: 'x' }, { ...LOCAL_ENV, SUPABASE_ACCEPTANCE_ADMIN_KEY: '' }, { ...LOCAL_ENV, SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: '' }]) {
      expect((await runOwnerIsolationLive({ env, fetcher, psql, random: () => 'abcdef0123456789' })).status).toBe('CONFIG_INVALID');
    }
    expect(requests).toEqual([]);
  });

  it('a hosted target with its own owner credentials runs the scenarios it can prove, and BLOCKS the rest', async () => {
    const { fetcher, requests } = backend();
    // The hosted path signs in pre-provisioned owners; register them in the fake backend first.
    await fetcher('http://127.0.0.1:54321/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: 'a@example.test', password: 'pw-a' }) });
    await fetcher('http://127.0.0.1:54321/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: 'b@example.test', password: 'pw-b' }) });
    const env = {
      SUPABASE_ACCEPTANCE_TARGET: 'isolated-test', SUPABASE_ACCEPTANCE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ACCEPTANCE_ENV_LABEL: 'isolated_test',
      SUPABASE_ACCEPTANCE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_ACCEPTANCE_PRODUCTION_REFS: 'zzzzzzzzzzzzzzzzzzzz', SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'k',
      SUPABASE_ACCEPTANCE_OWNER_A_EMAIL: 'a@example.test', SUPABASE_ACCEPTANCE_OWNER_A_PASSWORD: 'pw-a',
      SUPABASE_ACCEPTANCE_OWNER_B_EMAIL: 'b@example.test', SUPABASE_ACCEPTANCE_OWNER_B_PASSWORD: 'pw-b',
    };
    const report = await runOwnerIsolationLive({ env, fetcher: (input, init) => fetcher(input.replace('https://abcdefghijklmnopqrst.supabase.co', 'http://127.0.0.1:54321'), init), psql: null, random: () => 'abcdef0123456789' });
    expect(report.target).toEqual({ kind: 'isolated-hosted', projectRef: 'abc***' });
    expect(report.cleanup).toBe('SKIPPED');
    expect(report.scenarios.filter(result => result.status === 'BLOCKED').length).toBeGreaterThan(10);
    expect(report.scenarios.filter(result => result.status === 'FAIL')).toEqual([]);
    expect(report.status).toBe('BLOCKED');
    expect(requests.some(request => request.startsWith('DELETE /auth/'))).toBe(false);
  }, 180_000);

  it('reports FAIL and still cleans up when provisioning breaks, and FAILED when cleanup does', async () => {
    const broken = backend({ failProvisioning: true });
    const report = await runOwnerIsolationLive({ env: LOCAL_ENV, fetcher: broken.fetcher, psql: broken.psql, random: () => 'abcdef0123456789' });
    expect(report.status).toBe('FAIL');
    expect(report.scenarios.some(result => result.id === 'live.run')).toBe(true);
    const stuck = backend({ failDelete: true });
    const second = await runOwnerIsolationLive({ env: LOCAL_ENV, fetcher: stuck.fetcher, psql: stuck.psql, random: () => crypto.randomUUID().replaceAll('-', '') });
    expect(second.cleanup).toBe('FAILED');
  }, 180_000);

  it('keeps the owners when asked to, for a repeatable device run', async () => {
    const { fetcher, psql, requests } = backend();
    const report = await runOwnerIsolationLive({ env: { ...LOCAL_ENV, SUPABASE_ACCEPTANCE_KEEP: '1' }, fetcher, psql, random: () => crypto.randomUUID().replaceAll('-', '') });
    expect(report.cleanup).toBe('SKIPPED');
    // The direct-write scenarios send DELETEs to the REST API on purpose; no Auth account was deleted.
    expect(requests.some(request => request.startsWith('DELETE /auth/'))).toBe(false);
  }, 180_000);

  it.each([
    ['an unreadable provisioning response', (url: string) => (url.endsWith('/auth/v1/admin/users') ? new Response('<html>', { status: 200 }) : null)],
    ['a provisioning response with no usable id', (url: string) => (url.endsWith('/auth/v1/admin/users') ? new Response(JSON.stringify({ id: 'nope' }), { status: 200 }) : null)],
    ['a sign-in that is refused', (url: string) => (url.includes('/auth/v1/token') ? new Response('{}', { status: 400 }) : null)],
    ['a sign-in with no token', (url: string) => (url.includes('/auth/v1/token') ? new Response(JSON.stringify({ user: { id: USER_A } }), { status: 200 }) : null)],
  ])('fails closed on %s', async (_name, intercept) => {
    const inner = backend();
    const fetcher = async (input: string, init?: RequestInit) => intercept(input) ?? inner.fetcher(input, init);
    const report = await runOwnerIsolationLive({ env: LOCAL_ENV, fetcher, psql: inner.psql, random: () => crypto.randomUUID().replaceAll('-', '') });
    expect(report.status).toBe('FAIL');
    expect(report.scenarios.some(result => result.id === 'live.run')).toBe(true);
  }, 60_000);

  it('fails closed when the privileged counts come back malformed', async () => {
    const inner = backend();
    const psql: PsqlRunner = async sql => (sql.includes('shelf_operations') ? 'not|numbers' : inner.psql(sql));
    const report = await runOwnerIsolationLive({ env: LOCAL_ENV, fetcher: inner.fetcher, psql, random: () => crypto.randomUUID().replaceAll('-', '') });
    expect(report.status).toBe('FAIL');
    expect(report.scenarios.some(result => result.status === 'FAIL' && /malformed/i.test(result.detail))).toBe(true);
  }, 120_000);

  it('a hosted target missing an owner credential, or whose sign-in is refused, fails closed', async () => {
    const hosted = {
      SUPABASE_ACCEPTANCE_TARGET: 'isolated-test', SUPABASE_ACCEPTANCE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_ACCEPTANCE_ENV_LABEL: 'isolated_test',
      SUPABASE_ACCEPTANCE_PROJECT_REF: 'abcdefghijklmnopqrst', SUPABASE_ACCEPTANCE_PRODUCTION_REFS: 'zzzzzzzzzzzzzzzzzzzz', SUPABASE_ACCEPTANCE_PUBLISHABLE_KEY: 'k',
    };
    const refuse = async () => new Response('{}', { status: 400 });
    const missing = await runOwnerIsolationLive({ env: hosted, fetcher: refuse, psql: null, random: () => 'abcdef0123456789' });
    expect(missing.status).toBe('FAIL');
    const refused = await runOwnerIsolationLive({
      env: { ...hosted, SUPABASE_ACCEPTANCE_OWNER_A_EMAIL: 'a@example.test', SUPABASE_ACCEPTANCE_OWNER_A_PASSWORD: 'x', SUPABASE_ACCEPTANCE_OWNER_B_EMAIL: 'b@example.test', SUPABASE_ACCEPTANCE_OWNER_B_PASSWORD: 'y' },
      fetcher: refuse, psql: null, random: () => 'abcdef0123456789',
    });
    expect(refused.status).toBe('FAIL');
    expect(refused.cleanup).toBe('SKIPPED');
  });

  it('the real psql runner rejects a bad port up front and reports a failed connection without leaking anything', async () => {
    expect(() => localPsql({ SUPABASE_ACCEPTANCE_DB_PORT: 'x; drop' })).toThrow('CONFIG_INVALID');
    await expect(localPsql({ SUPABASE_ACCEPTANCE_DB_PORT: '10' })('select 1')).rejects.toThrow('PSQL_FAILED');
  });
});

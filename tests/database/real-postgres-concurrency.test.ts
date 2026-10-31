import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createLocalSupabaseFetch, readLocalSupabaseTestConfig } from '../../scripts/local-supabase-test-target.ts';

/**
 * Real wire-level concurrency on a disposable local Postgres 17 behind PostgREST and GoTrue. Concurrent requests from
 * one owner are served over separate pooled connections, so these are genuine concurrent database sessions, not
 * PGlite's single connection. Opt-in: it runs only with STRANDCUE_SUPABASE_API_TEST=1 and a numeric-loopback target,
 * exactly like the local API test. Without that it is skipped, and the skip is not a pass.
 */
const config = readLocalSupabaseTestConfig(process.env);
const describeLocal = config === null ? describe.skip : describe;

function psql(sql: string): string {
  const url = new URL(process.env.STRANDCUE_LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  if (!['127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Expected a disposable loopback database');
  const result = spawnSync('psql', [url.toString(), '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('psql failed');
  return result.stdout.trim();
}

const DAY = { precision: 'day', value: '2026-03-01' };
const ATTEMPTS = 8;

describeLocal('concurrent retries and writes against real Postgres', () => {
  const url = config?.url ?? '';
  const fetcher = config ? createLocalSupabaseFetch(url) : fetch;
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const password = `Local-only-${suffix}-Aa1!`;
  let userId = '';
  let token = '';

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const response = await fetcher(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: config!.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
    });
    return { status: response.status, text: await response.text() };
  };
  const message = (text: string): string => (JSON.parse(text) as { message?: string }).message ?? '';
  const count = (table: string): number => Number(psql(`select count(*) from ${table}`));

  beforeAll(async () => {
    const email = `strandcue-conc-${suffix}@example.test`;
    const created = await fetcher(`${url}/auth/v1/admin/users`, {
      method: 'POST', headers: { apikey: config!.secretKey, Authorization: `Bearer ${config!.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    userId = ((await created.json()) as { id: string }).id;
    const session = await fetcher(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config!.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    token = ((await session.json()) as { access_token: string }).access_token;
    expect((await rpc('complete_account', { p_username: `conc_${suffix}`, p_eligible: true })).status).toBe(200);
  }, 60_000);

  afterAll(async () => {
    if (!userId) return;
    await fetcher(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: config!.secretKey, Authorization: `Bearer ${config!.secretKey}` } });
  });

  const shelfAdd = (operationId: string, id: string, name: string) => rpc('shelf_add', {
    p_operation_id: operationId, p_user_product_id: id, p_version_id: null, p_manual_brand: 'Concurrency', p_manual_name: name, p_manual_category: 'shampoo',
    p_availability: 'available', p_notes: null, p_effective_date: DAY, p_facts: {},
  });
  const toolAdd = (operationId: string, id: string, model: string) => rpc('tool_add', {
    p_operation_id: operationId, p_user_tool_id: id, p_availability: 'available', p_effective_date: DAY, p_facts: { manualModel: model },
  });

  it('identical concurrent shelf retries converge on one receipt, one item, one revision and one operation', async () => {
    const operationId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const before = { items: count('public.user_products'), revisions: count('public.user_product_revisions'), operations: count('strandcue_private.shelf_operations') };
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, () => shelfAdd(operationId, id, 'Concurrent identical')));
    expect(replies.every(reply => reply.status === 200)).toBe(true);
    expect(new Set(replies.map(reply => reply.text)).size).toBe(1);
    expect(count('public.user_products')).toBe(before.items + 1);
    expect(count('public.user_product_revisions')).toBe(before.revisions + 1);
    expect(count('strandcue_private.shelf_operations')).toBe(before.operations + 1);
  }, 60_000);

  it('one shelf operation id with different payloads at the same time: exactly one wins and the rest conflict', async () => {
    const operationId = crypto.randomUUID();
    const before = { revisions: count('public.user_product_revisions'), operations: count('strandcue_private.shelf_operations') };
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, (_, index) => shelfAdd(operationId, crypto.randomUUID(), `Different ${index}`)));
    const winners = replies.filter(reply => reply.status === 200);
    const losers = replies.filter(reply => reply.status !== 200);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(ATTEMPTS - 1);
    expect(losers.every(reply => /operation-conflict/.test(message(reply.text)))).toBe(true);
    expect(count('public.user_product_revisions')).toBe(before.revisions + 1);
    expect(count('strandcue_private.shelf_operations')).toBe(before.operations + 1);
  }, 60_000);

  it('concurrent shelf changes from one revision: exactly one lands, the rest see a revision conflict, one entry is appended', async () => {
    const id = crypto.randomUUID();
    expect((await shelfAdd(crypto.randomUUID(), id, 'Race base')).status).toBe(200);
    const before = count('public.user_product_revisions');
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, (_, index) => rpc('shelf_change', {
      p_operation_id: crypto.randomUUID(), p_user_product_id: id, p_expected_revision: 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null,
      p_availability: 'low', p_notes: `race ${index}`, p_effective_date: DAY, p_facts: {},
    })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
    expect(replies.filter(reply => reply.status !== 200).every(reply => /revision-conflict/.test(message(reply.text)))).toBe(true);
    expect(count('public.user_product_revisions')).toBe(before + 1);
    expect(psql(`select revision from public.user_products where id = '${id}'`)).toBe('2');
  }, 60_000);

  it('identical concurrent tool retries converge on one receipt, one tool, one revision and one operation', async () => {
    const operationId = crypto.randomUUID();
    const id = crypto.randomUUID();
    const before = { items: count('public.user_tools'), revisions: count('public.user_tool_revisions'), operations: count('strandcue_private.tool_operations') };
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, () => toolAdd(operationId, id, 'Concurrent identical')));
    expect(replies.every(reply => reply.status === 200)).toBe(true);
    expect(new Set(replies.map(reply => reply.text)).size).toBe(1);
    expect(count('public.user_tools')).toBe(before.items + 1);
    expect(count('public.user_tool_revisions')).toBe(before.revisions + 1);
    expect(count('strandcue_private.tool_operations')).toBe(before.operations + 1);
  }, 60_000);

  it('one tool operation id with different payloads at the same time: exactly one wins and the rest conflict', async () => {
    const operationId = crypto.randomUUID();
    const before = { revisions: count('public.user_tool_revisions'), operations: count('strandcue_private.tool_operations') };
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, (_, index) => toolAdd(operationId, crypto.randomUUID(), `Different ${index}`)));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
    expect(replies.filter(reply => reply.status !== 200).every(reply => /operation-conflict/.test(message(reply.text)))).toBe(true);
    expect(count('public.user_tool_revisions')).toBe(before.revisions + 1);
    expect(count('strandcue_private.tool_operations')).toBe(before.operations + 1);
  }, 60_000);

  it('concurrent tool changes from one revision: exactly one lands and one entry is appended', async () => {
    const id = crypto.randomUUID();
    expect((await toolAdd(crypto.randomUUID(), id, 'Race base')).status).toBe(200);
    const before = count('public.user_tool_revisions');
    const replies = await Promise.all(Array.from({ length: ATTEMPTS }, (_, index) => rpc('tool_change', {
      p_operation_id: crypto.randomUUID(), p_user_tool_id: id, p_expected_revision: 1, p_availability: null, p_effective_date: DAY, p_facts: { notes: `race ${index}` },
    })));
    expect(replies.filter(reply => reply.status === 200)).toHaveLength(1);
    expect(replies.filter(reply => reply.status !== 200).every(reply => /revision-conflict/.test(message(reply.text)))).toBe(true);
    expect(count('public.user_tool_revisions')).toBe(before + 1);
    expect(psql(`select revision from public.user_tools where id = '${id}'`)).toBe('2');
  }, 60_000);

  it('identical concurrent shelf and tool changes with one operation id converge on a single entry', async () => {
    const shelf = crypto.randomUUID();
    const tool = crypto.randomUUID();
    expect((await shelfAdd(crypto.randomUUID(), shelf, 'Converge base')).status).toBe(200);
    expect((await toolAdd(crypto.randomUUID(), tool, 'Converge base')).status).toBe(200);
    const shelfBefore = count('public.user_product_revisions');
    const toolBefore = count('public.user_tool_revisions');
    const shelfOp = crypto.randomUUID();
    const toolOp = crypto.randomUUID();
    const replies = await Promise.all([
      ...Array.from({ length: ATTEMPTS }, () => rpc('shelf_change', { p_operation_id: shelfOp, p_user_product_id: shelf, p_expected_revision: 1, p_manual_brand: null, p_manual_name: null, p_manual_category: null, p_availability: 'low', p_notes: null, p_effective_date: DAY, p_facts: {} })),
      ...Array.from({ length: ATTEMPTS }, () => rpc('tool_change', { p_operation_id: toolOp, p_user_tool_id: tool, p_expected_revision: 1, p_availability: null, p_effective_date: DAY, p_facts: { notes: 'same' } })),
    ]);
    expect(replies.every(reply => reply.status === 200)).toBe(true);
    expect(new Set(replies.slice(0, ATTEMPTS).map(reply => reply.text)).size).toBe(1);
    expect(new Set(replies.slice(ATTEMPTS).map(reply => reply.text)).size).toBe(1);
    expect(count('public.user_product_revisions')).toBe(shelfBefore + 1);
    expect(count('public.user_tool_revisions')).toBe(toolBefore + 1);
  }, 60_000);
});

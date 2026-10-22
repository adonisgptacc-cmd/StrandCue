import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupOwnerIsolationFixtures,
  OWNER_ISOLATION_REQUIRED_AREAS,
  runOwnerIsolationScenarios,
  summarizeScenarioResults,
  type ScenarioResult,
} from '../../scripts/owner-isolation-scenarios.ts';
import { database, USER_A, USER_B } from './harness.ts';
import { pgliteTransport } from '../helpers/postgrest-pglite-transport.ts';

/**
 * PGlite evidence only. These tests prove the scenario logic and the SQL boundary behind it, and that the suite
 * fails when isolation is broken. They do not prove PostgREST, Auth or the wire: the live run does.
 */
let db: PGlite;

const principals = {
  a: { name: 'owner-a' as const, id: USER_A, token: 'unused-a' },
  b: { name: 'owner-b' as const, id: USER_B, token: 'unused-b' },
  anonymous: { name: 'anonymous' as const, id: null, token: null },
};

async function reset() {
  await db.exec('set session authorization postgres');
  await db.exec('delete from public.profiles');
  await db.exec('alter table public.tool_publications disable trigger user; alter table public.tool_claim_evidence disable trigger user');
  await db.exec('delete from public.tool_claim_evidence; delete from public.tool_publications');
  await db.exec('alter table public.tool_publications enable trigger user; alter table public.tool_claim_evidence enable trigger user');
}

beforeAll(async () => { db = await database(); }, 60_000);
beforeEach(reset);
afterAll(async () => { await db?.close(); });

const failing = (results: readonly ScenarioResult[]) => results.filter(result => result.status !== 'PASS');

describe('the live two-owner scenarios against the real migrations (PGlite)', () => {
  it('passes every scenario for correctly isolated owners, across every required area', async () => {
    const { transport, probe } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    expect(failing(results).map(result => `${result.id}: ${result.detail}`)).toEqual([]);
    const areas = new Set(results.map(result => result.area));
    for (const area of OWNER_ISOLATION_REQUIRED_AREAS) expect(areas, area).toContain(area);
    expect(results.length).toBe(51);
    expect(results.filter(result => result.area === 'cue-check')).toHaveLength(9);
    expect(new Set(results.map(result => result.id)).size).toBe(results.length);
    expect(summarizeScenarioResults(results)).toMatchObject({ status: 'PASS', fail: 0, blocked: 0 });
  }, 120_000);

  it('proves the Cue Check isolation scenarios individually, each with its own named result', async () => {
    const { transport, probe } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const cue = results.filter(result => result.area === 'cue-check');
    expect(cue.map(result => result.id)).toEqual([
      'cue-check.owner-records-and-reads-their-own',
      'cue-check.b-cannot-read-a',
      'cue-check.b-cannot-correct-or-void-as-a',
      'cue-check.foreign-and-random-ids-are-indistinguishable',
      'cue-check.anonymous-callers-are-denied',
      'cue-check.direct-writes-and-private-receipts-are-denied',
      'cue-check.export-holds-only-the-owners-records-and-no-receipts',
      'cue-check.owner-switch-leaves-no-prior-owner-rows',
      'cue-check.client-supplied-bound-facts-are-refused',
    ]);
    expect(failing(cue).map(result => `${result.id}: ${result.detail}`)).toEqual([]);
  }, 120_000);

  it('blocks, never passes, the Cue Check scenarios when no privileged probe can seed a routine', async () => {
    const { transport } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe: null });
    const cue = results.filter(result => result.area === 'cue-check');
    expect(cue).toHaveLength(9);
    expect(cue.some(result => result.status === 'PASS')).toBe(false);
    for (const result of cue) expect(result.status).toBe('BLOCKED');
  }, 120_000);

  it('fails the Cue Check scenarios when isolation is broken (every caller acts as the first owner)', async () => {
    const { transport, probe } = pgliteTransport(db, { leaky: true });
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const cue = results.filter(result => result.area === 'cue-check');
    expect(cue).toHaveLength(9);
    const broken = new Set(failing(cue).map(result => result.id));
    expect(broken.has('cue-check.b-cannot-read-a')).toBe(true);
    expect(broken.has('cue-check.anonymous-callers-are-denied')).toBe(true);
    expect(broken.has('cue-check.b-cannot-correct-or-void-as-a')).toBe(true);
    for (const id of ['cue-check.foreign-and-random-ids-are-indistinguishable', 'cue-check.export-holds-only-the-owners-records-and-no-receipts', 'cue-check.owner-switch-leaves-no-prior-owner-rows']) {
      expect(broken.has(id), id).toBe(true);
    }
  }, 120_000);

  it('refuses to treat two successful replies as the same refusal', async () => {
    const { transport, probe } = pgliteTransport(db, {
      mangle: (path, result) => (path.includes('/rpc/get_cue_check') && result.status >= 400 ? { status: 200, text: '{}' } : result),
    });
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const same = results.find(result => result.id === 'cue-check.foreign-and-random-ids-are-indistinguishable');
    expect(same?.status).toBe('FAIL');
  }, 120_000);

  it('fails closed when a Cue Check response is malformed or an expected denial succeeds', async () => {
    const { transport, probe } = pgliteTransport(db, {
      mangle: (path, result) => (path.includes('/rpc/list_cue_checks') ? { status: 200, text: '<html>gateway</html>' } : result),
    });
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const broken = failing(results.filter(result => result.area === 'cue-check'));
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.some(result => /malformed|not JSON/i.test(result.detail))).toBe(true);
    const { transport: openDoor, probe: probe2 } = pgliteTransport(db, {
      mangle: (path, result) => (path.includes('/rpc/get_cue_check') && result.status >= 400 ? { status: 200, text: '{"recordId":"x"}' } : result),
    });
    await reset();
    const results2 = await runOwnerIsolationScenarios({ transport: openDoor, ...principals, probe: probe2 });
    expect(failing(results2.filter(result => result.area === 'cue-check')).map(result => result.id)).toContain('cue-check.foreign-and-random-ids-are-indistinguishable');
  }, 120_000);

  it('removes its synthetic catalogue fixtures afterwards and leaves no owner data behind', async () => {
    const { transport, probe } = pgliteTransport(db);
    await runOwnerIsolationScenarios({ transport, ...principals, probe });
    await reset();
    await cleanupOwnerIsolationFixtures(probe);
    await db.exec('set session authorization postgres');
    const { rows } = await db.query<{ n: string }>(`select ((select count(*) from public.tool_versions) + (select count(*) from public.product_versions where id::text like 'c5%') + (select count(*) from public.user_tools))::text n`);
    expect(rows[0].n).toBe('0');
  }, 120_000);

  it('fails when isolation is broken: every caller acting as the first owner is caught', async () => {
    const { transport, probe } = pgliteTransport(db, { leaky: true });
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const broken = failing(results);
    expect(broken.length).toBeGreaterThan(10);
    expect(summarizeScenarioResults(results).status).toBe('FAIL');
    // The anonymous checks specifically notice the anonymous caller was treated as an owner.
    expect(broken.some(result => result.area === 'anonymous')).toBe(true);
  }, 120_000);

  it('fails closed on an ambiguous response: HTML or an object where rows were expected is never a pass', async () => {
    const { transport, probe } = pgliteTransport(db, {
      mangle: (path, result) => (path.includes('/rpc/shelf_list') || path.includes('/rpc/tool_list') ? { status: 200, text: '<html>gateway</html>' } : result),
    });
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const broken = failing(results);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.some(result => /malformed|not JSON/i.test(result.detail))).toBe(true);
    expect(summarizeScenarioResults(results).status).toBe('FAIL');
  }, 120_000);

  it('marks the scenarios that need a privileged probe as BLOCKED, never PASS, when none exists', async () => {
    const { transport } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe: null });
    const blocked = results.filter(result => result.status === 'BLOCKED');
    expect(blocked.length).toBeGreaterThan(10);
    for (const result of blocked) expect(result.detail).toMatch(/privileged probe/i);
    expect(results.some(result => result.status === 'PASS')).toBe(true);
    expect(summarizeScenarioResults(results).status).toBe('BLOCKED');
  }, 120_000);

  it('refuses to run when both owners are the same person or an owner has no identity', async () => {
    const { transport, probe } = pgliteTransport(db);
    await expect(runOwnerIsolationScenarios({ transport, a: principals.a, b: { ...principals.a, name: 'owner-b' }, anonymous: principals.anonymous, probe })).rejects.toThrow(/IDENTITY_INVALID/);
    await expect(runOwnerIsolationScenarios({ transport, a: { ...principals.a, id: null }, b: principals.b, anonymous: principals.anonymous, probe })).rejects.toThrow(/IDENTITY_INVALID/);
    await expect(runOwnerIsolationScenarios({ transport, a: principals.a, b: principals.b, anonymous: { ...principals.anonymous, id: USER_A }, probe })).rejects.toThrow(/IDENTITY_INVALID/);
  });
});

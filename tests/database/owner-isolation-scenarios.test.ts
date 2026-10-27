import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  cleanupOwnerIsolationFixtures,
  OWNER_ISOLATION_REQUIRED_AREAS,
  runOwnerIsolationScenarios,
  summarizeScenarioResults,
  type ScenarioResult,
} from '../../scripts/owner-isolation-scenarios.ts';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import { pgliteTransport } from '../helpers/postgrest-pglite-transport.ts';
import { seedSyntheticHeatCapabilityRegistry, SYNTHETIC_PRODUCT_VERSION_ID, SYNTHETIC_TOOL_VERSION_ID } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

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
  it('keeps Heat Coach assessment reads owner-only and foreign ids indistinguishable from random ids', async () => {
    const publication = crypto.randomUUID();
    const intent = { method:{state:'unknown'},temperature:{state:'unknown'},setting:{state:'unknown'},passes:{state:'unknown'},durationMinutes:{state:'unknown'},zones:[] };
    await asUser(db, USER_A); await complete(db, 'owner_a');
    await db.exec('set session authorization postgres');
    const query = (sql: string, params: unknown[] = []) => db.query<Record<string, unknown>>(sql, params);
    const registry = await seedSyntheticHeatCapabilityRegistry(query);
    const inserted = await seedSyntheticHeatRule(query, publication, {
      schemaVersion: 1, publicationId: publication, ruleVersion: '1.0.0', lifecycle: 'reviewed',
      validFrom: '2026-01-01T00:00:00.000Z', validUntil: null, requiredProductCapability: null,
      allowedMethods: ['heated-air'], limits: { temperatures: [], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null },
      necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit', copyKey: 'heat.reviewed_limit',
    }, registry);
    const digest = inserted.contentDigest;
    await asUser(db, USER_A);
    const created=(await db.query<{result:any}>('select public.create_heat_coach_assessment($1,$2,$3,$4::jsonb) result',[crypto.randomUUID(),publication,digest,JSON.stringify(intent)])).rows[0].result;
    await asUser(db, USER_B); await complete(db, 'owner_b');
    const messages:string[]=[];
    for (const id of [created.assessmentId,crypto.randomUUID()]) {
      try { await db.query('select public.get_heat_coach_assessment($1)',[id]); }
      catch (error) { messages.push(String((error as Error).message)); }
    }
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('assessment-not-found');
    expect(messages[1]).toContain('assessment-not-found');
    expect((await db.query<{result:any}>('select public.list_heat_coach_assessments(10,null) result')).rows[0].result.items).toEqual([]);
    await db.exec('set session authorization postgres');
    await db.exec('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
    await db.query('delete from strandcue_private.heat_rule_publications where id=$1',[publication]);
    await db.exec('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
    await db.exec('alter table strandcue_private.heat_capability_publications disable trigger heat_capability_guard');
    await db.query('delete from strandcue_private.heat_capability_publications where id=$1', [registry.id]);
    await db.exec('alter table strandcue_private.heat_capability_publications enable trigger heat_capability_guard');
    await db.query('delete from public.product_versions where id=$1', [SYNTHETIC_PRODUCT_VERSION_ID]);
    await db.query('delete from public.tool_versions where id=$1', [SYNTHETIC_TOOL_VERSION_ID]);
    await db.exec("delete from public.products where name='Synthetic capability product'; delete from public.brands where name='Synthetic capability brand'; delete from public.tools where name='Synthetic capability tool'; delete from public.tool_brands where name='Synthetic capability tool brand'");
  });
  it('passes every scenario for correctly isolated owners, across every required area', async () => {
    const { transport, probe } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    expect(failing(results).map(result => `${result.id}: ${result.detail}`)).toEqual([]);
    const areas = new Set(results.map(result => result.area));
    for (const area of OWNER_ISOLATION_REQUIRED_AREAS) expect(areas, area).toContain(area);
    expect(results.length).toBe(56);
    expect(results.filter(result => result.area === 'treatment-programme')).toHaveLength(5);
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

  it('proves the treatment-programme isolation scenarios individually, each with its own named result', async () => {
    const { transport, probe } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe });
    const programme = results.filter(result => result.area === 'treatment-programme');
    expect(programme.map(result => result.id)).toEqual([
      'treatment-programme.anonymous-callers-are-denied',
      'treatment-programme.enrolment-is-blocked-without-reviewed-content',
      'treatment-programme.foreign-and-random-ids-are-refused-identically',
      'treatment-programme.direct-writes-and-private-tables-are-denied',
      'treatment-programme.export-carries-no-programme-rows-or-private-material',
    ]);
    expect(failing(programme).map(result => `${result.id}: ${result.detail}`)).toEqual([]);
  }, 120_000);

  it('blocks, never passes, the treatment-programme scenarios when no privileged probe can count rows', async () => {
    const { transport } = pgliteTransport(db);
    const results = await runOwnerIsolationScenarios({ transport, ...principals, probe: null });
    const programme = results.filter(result => result.area === 'treatment-programme');
    expect(programme).toHaveLength(5);
    for (const result of programme) expect(result.status).toBe('BLOCKED');
  }, 120_000);

  it('fails the treatment-programme scenarios when isolation is broken or a refusal turns into a success', async () => {
    const { transport, probe } = pgliteTransport(db, { leaky: true });
    const broken = new Set(failing((await runOwnerIsolationScenarios({ transport, ...principals, probe })).filter(result => result.area === 'treatment-programme')).map(result => result.id));
    expect(broken.has('treatment-programme.anonymous-callers-are-denied')).toBe(true);
    const { transport: openDoor, probe: probe2 } = pgliteTransport(db, {
      mangle: (path, result) => (path.includes('/rpc/enrol_programme') && result.status >= 400 ? { status: 200, text: '{"enrolmentId":"x"}' } : result),
    });
    await reset();
    const results = await runOwnerIsolationScenarios({ transport: openDoor, ...principals, probe: probe2 });
    expect(failing(results.filter(result => result.area === 'treatment-programme')).map(result => result.id))
      .toContain('treatment-programme.enrolment-is-blocked-without-reviewed-content');
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

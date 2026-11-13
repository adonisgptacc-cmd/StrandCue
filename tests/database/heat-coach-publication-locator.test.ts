import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule, type SyntheticRegistryIdentity } from './support/heat-publication-fixtures.ts';

const RULE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RULE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;
let registry: SyntheticRegistryIdentity;
const privileged = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  await db.exec('set session authorization postgres');
  return db.query<T>(sql, params);
};
const read = async () => (await db.query<{ result: unknown }>(
  'select public.get_current_heat_coach_publication() result')).rows[0]!.result;
const seed = async (id: string, state: 'draft' | 'published' | 'withdrawn' = 'published') => {
  const rule = { schemaVersion: 1, publicationId: id, ruleVersion: '1.0.0',
    lifecycle: state === 'published' ? 'reviewed' : state,
    validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
    requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
    limits: { temperatures: [], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null },
    necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit',
    copyKey: 'heat.reviewed_limit' };
  return seedSyntheticHeatRule(privileged, id, rule, registry, state);
};

beforeAll(async () => { db = await database(); });
beforeEach(async () => {
  await asUser(db, USER_A);
  await complete(db, 'user_a');
  registry = await seedSyntheticHeatCapabilityRegistry(privileged);
  await asUser(db, USER_A);
});
afterEach(async () => {
  await privileged('delete from public.profiles');
  await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
  await privileged('delete from strandcue_private.heat_rule_publications');
  await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
  await privileged('alter table strandcue_private.heat_capability_publications disable trigger heat_capability_guard');
  await privileged('delete from strandcue_private.heat_capability_publications');
  await privileged('alter table strandcue_private.heat_capability_publications enable trigger heat_capability_guard');
});
afterAll(async () => { await db?.close(); });

describe('current Heat Coach publication locator', () => {
  it('returns null for empty and draft-only production states', async () => {
    expect(await read()).toBeNull();
    await seed(RULE_A, 'draft');
    await asUser(db, USER_A);
    expect(await read()).toBeNull();
  });

  it('returns only the exact identity of one reviewed active packet', async () => {
    const publication = await seed(RULE_A);
    await asUser(db, USER_A);
    expect(await read()).toEqual({ publicationId: RULE_A, publicationDigest: publication.contentDigest });
    const access = await privileged<{ rpc: boolean; tableRead: boolean }>(`select
      has_function_privilege('authenticated','public.get_current_heat_coach_publication()','EXECUTE') rpc,
      has_table_privilege('authenticated','strandcue_private.heat_rule_publications','SELECT') "tableRead"`);
    expect(access.rows[0]).toEqual({ rpc: true, tableRead: false });
  });

  it('returns null after rule or capability withdrawal', async () => {
    await seed(RULE_A);
    await privileged("update strandcue_private.heat_rule_publications set state='withdrawn' where id=$1", [RULE_A]);
    await asUser(db, USER_A);
    expect(await read()).toBeNull();
    await seed(RULE_B);
    await privileged("update strandcue_private.heat_capability_publications set state='withdrawn' where id=$1", [registry.id]);
    await asUser(db, USER_A);
    expect(await read()).toBeNull();
  });

  it('returns null when more than one valid publication exists', async () => {
    await seed(RULE_A);
    await seed(RULE_B);
    await asUser(db, USER_A);
    expect(await read()).toBeNull();
  });

  it('requires an active owner and denies anonymous execution', async () => {
    await seed(RULE_A);
    await asUser(db, USER_B);
    await expect(read()).rejects.toThrow('account-not-active');
    await asUser(db, null);
    await expect(read()).rejects.toThrow();
  });
});

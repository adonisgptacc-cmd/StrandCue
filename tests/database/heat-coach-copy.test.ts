import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, mutate, USER_A, USER_B } from './harness.ts';
import { seedSyntheticHeatCapabilityRegistry } from './support/heat-capability-fixtures.ts';
import { seedSyntheticHeatRule } from './support/heat-publication-fixtures.ts';

const RULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let db: PGlite;
let digest: string;
let assessmentId: string;
const privileged = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  await db.exec('set session authorization postgres');
  return db.query<T>(sql, params);
};
const readCopy = async (id = assessmentId, publicationId = RULE_ID, publicationDigest = digest) =>
  (await db.query<{ result: unknown }>(
    'select public.get_heat_coach_reviewed_copy($1::uuid,$2::uuid,$3::text) result',
    [id, publicationId, publicationDigest],
  )).rows[0]!.result;

beforeAll(async () => { db = await database(); });
beforeEach(async () => {
  await asUser(db, USER_A);
  await complete(db, 'user_a');
  const registry = await seedSyntheticHeatCapabilityRegistry(privileged);
  const rule = {
    schemaVersion: 1, publicationId: RULE_ID, ruleVersion: '1.0.0', lifecycle: 'reviewed',
    validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
    requiredProductCapability: 'heat-protection', allowedMethods: ['heated-air'],
    limits: { temperatures: [], namedSettings: [], maximumPasses: null, maximumDurationMinutes: null },
    necessityRules: [], hardRestrictions: [], alternatives: [], reasonCode: 'reviewed_limit',
    copyKey: 'heat.reviewed_limit',
  };
  digest = (await seedSyntheticHeatRule(privileged, RULE_ID, rule, registry)).contentDigest;
  await asUser(db, USER_A);
  const result = (await db.query<{ result: { assessmentId: string } }>(
    'select public.create_heat_coach_assessment($1::uuid,$2::uuid,$3::text,$4::jsonb) result',
    [crypto.randomUUID(), RULE_ID, digest, JSON.stringify({
      method: { state: 'unknown' }, temperature: { state: 'unknown' }, setting: { state: 'unknown' },
      passes: { state: 'unknown' }, durationMinutes: { state: 'unknown' }, zones: [],
    })],
  )).rows[0]!.result;
  assessmentId = result.assessmentId;
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

describe('reviewed Heat Coach copy', () => {
  it('returns only sorted reviewed text bound to the owned assessment and exact publication', async () => {
    const result = await readCopy();
    expect(result).toEqual({
      assessmentId, publicationId: RULE_ID, publicationDigest: digest,
      copy: [{ copyKey: 'heat.limitations', text: 'Synthetic reviewed copy for heat.limitations' },
        { copyKey: 'heat.reviewed_limit', text: 'Synthetic reviewed copy for heat.reviewed_limit' }],
    });
    const access = await privileged<{ readable: boolean; core: boolean; publicRpc: boolean }>(`select
      has_table_privilege('authenticated','strandcue_private.heat_rule_publications','SELECT') readable,
      has_function_privilege('authenticated','strandcue_private.get_heat_coach_reviewed_copy_core(uuid,uuid,text)','EXECUTE') core,
      has_function_privilege('authenticated','public.get_heat_coach_reviewed_copy(uuid,uuid,text)','EXECUTE') "publicRpc"`);
    expect(access.rows[0]).toEqual({ readable: false, core: false, publicRpc: true });
  });

  it('does not reveal another owner’s copy or an unknown assessment', async () => {
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(readCopy()).rejects.toThrow('assessment-not-found');
    await asUser(db, USER_A);
    await expect(readCopy(crypto.randomUUID())).rejects.toThrow('assessment-not-found');
  });

  it('rejects wrong publication id or digest', async () => {
    await expect(readCopy(assessmentId, crypto.randomUUID())).rejects.toThrow('publication-mismatch');
    await expect(readCopy(assessmentId, RULE_ID, `sha256:${'f'.repeat(64)}`)).rejects.toThrow('publication-mismatch');
  });

  it('fails closed after withdrawal', async () => {
    await privileged("update strandcue_private.heat_rule_publications set state='withdrawn' where id=$1", [RULE_ID]);
    await asUser(db, USER_A);
    await expect(readCopy()).rejects.toThrow('publication-mismatch');
  });

  it('fails closed when the exact capability registry is withdrawn later', async () => {
    const registry = await privileged<{ id: string }>(
      "select (review_envelope->>'capabilityRegistryId')::text id from strandcue_private.heat_rule_publications where id=$1",
      [RULE_ID],
    );
    await privileged("update strandcue_private.heat_capability_publications set state='withdrawn' where id=$1", [registry.rows[0]!.id]);
    await asUser(db, USER_A);
    await expect(readCopy()).rejects.toThrow('publication-mismatch');
  });

  it('fails closed when owner facts change after the assessment', async () => {
    await mutate(db);
    await expect(readCopy()).rejects.toThrow('publication-mismatch');
  });
});

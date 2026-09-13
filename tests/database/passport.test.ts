import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { projectHistory } from '../../packages/domain/src/history.ts';
import { asUser, BASELINE, complete, current, database, DAY, mutate, UNVERIFIED, USER_A, USER_B } from './harness.ts';

describe('PostgreSQL ownership and immutable Passport transactions', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('requires verified adult identity and normalizes a private unique username', async () => {
    await asUser(db, null);
    await expect(complete(db)).rejects.toThrow(/permission denied/);
    await asUser(db, UNVERIFIED);
    await expect(complete(db)).rejects.toThrow(/email-not-verified/);
    await asUser(db, USER_A);
    await expect(complete(db, 'user_a', false)).rejects.toThrow(/eligibility-required/);
    await expect(complete(db, 'admin')).rejects.toThrow(/invalid-username/);
    expect(await complete(db, '  Private_A  ')).toMatchObject({ userId: USER_A, username: 'private_a', country: 'ZA' });
    await asUser(db, USER_B);
    await expect(complete(db, 'PRIVATE_A')).rejects.toThrow(/username-unavailable/);
  });

  it('denies direct writes, owner reassignment and access to another owner', async () => {
    await complete(db); await mutate(db);
    for (const statement of [
      `update public.profiles set user_id='${USER_B}'`,
      "update public.profiles set account_status='deleting'",
      'update public.hair_passports set revision=99',
      "update public.passport_revisions set patch='{}'",
      'delete from public.passport_revisions',
      "insert into public.passport_revisions(id) values(gen_random_uuid())",
    ]) await expect(db.exec(statement)).rejects.toThrow(/permission denied/);
    await asUser(db, USER_B);
    for (const table of ['profiles', 'hair_passports', 'passport_revisions']) {
      expect((await db.query(`select * from public.${table}`)).rows).toEqual([]);
    }
    await asUser(db, null);
    await expect(current(db)).rejects.toThrow(/permission denied/);
    await expect(db.query('select * from public.profiles')).rejects.toThrow(/permission denied/);
  });

  it('serializes revisions, retries the stored result and conflicts on changed operation payload', async () => {
    await complete(db);
    const key = crypto.randomUUID();
    const first = await mutate(db, { key });
    expect(first.revision).toBe(1);
    await mutate(db, { kind: 'change', revision: 1, patch: { goals: ['definition'] }, date: { precision: 'day', value: '2026-02-01' } });
    expect(await mutate(db, { key })).toEqual(first);
    await expect(mutate(db, { key, patch: { ...BASELINE, density: 'high' } })).rejects.toThrow(/operation-conflict/);
    await expect(mutate(db, { kind: 'change', revision: 1, patch: { density: 'high' } })).rejects.toThrow(/revision-conflict/);
    expect((await current(db)).revisions).toHaveLength(2);
  });

  it('rejects deleting owners before idempotent retries and hides all private reads', async () => {
    await complete(db); const key = crypto.randomUUID(); await mutate(db, { key });
    await db.exec('set session authorization postgres');
    await db.query("update public.profiles set account_status='deleting' where user_id=$1", [USER_A]);
    await asUser(db, USER_A);
    await expect(mutate(db, { key })).rejects.toThrow(/account-not-active/);
    await expect(current(db)).rejects.toThrow(/account-not-active/);
    await expect(complete(db)).rejects.toThrow(/account-not-active/);
    expect((await db.query('select * from public.passport_revisions')).rows).toEqual([]);
  });

  it('composes a February goal recorded after a March budget and matches the domain projection', async () => {
    await complete(db); await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, date: { precision: 'day', value: '2026-03-01' }, patch: { budgetPreference: 'premium' } });
    await mutate(db, { kind: 'change', revision: 2, date: { precision: 'day', value: '2026-02-01' }, patch: { goals: ['definition'] } });
    const result = await current(db);
    expect(result.projection.values).toMatchObject({ goals: ['definition'], budgetPreference: 'premium' });
    expect(result.projection).toEqual(projectHistory(result.revisions, { asOf: '2026-09-01' }));
    const february = await current(db, '2026-02-15');
    expect(february.projection.values.budgetPreference).toBe('best-value');
  });

  it('preserves correction chains, prevents branching and rejects foreign targets', async () => {
    await complete(db); await mutate(db);
    const baseline = (await current(db)).revisions[0];
    await expect(mutate(db, { kind: 'correction', revision: 1, correctsId: baseline.id, reason: 'mistake', patch: { density: 'low' } })).rejects.toThrow(/complete-baseline-required/);
    await mutate(db, { kind: 'change', revision: 1, patch: { goals: ['definition'] }, date: { precision: 'month', value: '2026-02' } });
    const target = (await current(db)).revisions[1];
    await mutate(db, { kind: 'correction', revision: 2, correctsId: target.id, reason: 'Wrong goal', patch: { goals: ['volume'] }, date: target.effectiveDate });
    const corrected = (await current(db)).revisions[2];
    await mutate(db, { kind: 'correction', revision: 3, correctsId: corrected.id, reason: 'Clarified', patch: { goals: ['length-retention'] }, date: target.effectiveDate });
    await expect(mutate(db, { kind: 'correction', revision: 4, correctsId: target.id, reason: 'branch', patch: { goals: ['shine'] } })).rejects.toThrow(/already-corrected/);
    const result = await current(db);
    expect(result.projection.values.goals).toEqual(['length-retention']);
    expect(result.projection).toEqual(projectHistory(result.revisions, { asOf: '2026-09-01' }));
    await asUser(db, USER_B); await complete(db, 'user_b'); await mutate(db);
    await expect(mutate(db, { kind: 'correction', revision: 1, correctsId: target.id, reason: 'foreign', patch: { goals: ['shine'] } })).rejects.toThrow(/correction-target-not-found/);
  });

  it('reports overlapping and unknown-date ambiguity identically to the shared domain', async () => {
    await complete(db); await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, patch: { goals: ['volume'] }, date: { precision: 'month', value: '2026-02' } });
    await mutate(db, { kind: 'change', revision: 2, patch: { goals: ['definition'] }, date: { precision: 'day', value: '2026-02-10' } });
    await mutate(db, { kind: 'change', revision: 3, patch: { density: 'low' }, date: { precision: 'unknown', value: null } });
    for (const asOf of ['2025-12-31', '2026-02-15', '2026-09-01']) {
      const result = await current(db, asOf);
      expect(result.projection).toEqual(projectHistory(result.revisions, { asOf }));
    }
    const result = await current(db);
    expect(result.projection.values.goals).toBeUndefined();
    expect(result.projection.ambiguousFields.goals.reason).toBe('overlapping-effective-intervals');
    expect(result.projection.ambiguousFields.density.reason).toBe('uncertain-as-of');
  });

  it.each(['lengthCm', 'maximumProductBudgetZar'])('rejects raw JSON overflow in %s without corrupting history', async (field) => {
    await complete(db); await mutate(db);
    await expect(db.query(
      'select public.mutate_passport($1,1,\'change\',$2::jsonb,$3::jsonb,null,null)',
      [crypto.randomUUID(), JSON.stringify(DAY), `{"${field}":1e400}`],
    )).rejects.toThrow(/invalid-passport/);
    expect((await current(db)).revision).toBe(1);
  });

  it.each(['lengthCm', 'maximumProductBudgetZar'])('preserves the largest finite JavaScript number in %s', async (field) => {
    await complete(db); await mutate(db, { patch: { ...BASELINE, [field]: Number.MAX_VALUE } });
    const result = await current(db);
    expect(result.projection.values[field]).toBe(Number.MAX_VALUE);
    expect(result.projection).toEqual(projectHistory(result.revisions, { asOf: '2026-09-01' }));
  });

  it.each([
    {}, { role: 'admin' }, { source: 'verified-catalogue-reference' }, { naturalPattern: 'invalid' },
    { lengthCm: -1 }, { density: null }, { goals: [] }, { concerns: ['none', 'dryness'] },
    { scalpObservations: ['diagnosis'] }, { notes: 'a'.repeat(2001) },
    { stylingHabits: [null] }, { wigOrExtensions: { observationTarget: 'both', role: 'admin' } },
    { maximumProductBudgetZar: '12' }, { porosity: null },
  ])('rejects malformed consumer patch %j atomically', async (patch) => {
    await complete(db); await mutate(db);
    await expect(mutate(db, { kind: 'change', revision: 1, patch })).rejects.toThrow(/invalid-passport/);
    expect((await current(db)).revision).toBe(1);
  });

  it.each([
    { precision: 'day', value: '2026-02-30' }, { precision: 'month', value: '2026-13' },
    { precision: 'day', value: '2999-01-01' }, { precision: 'unknown', value: '2026' },
    { precision: 'year', value: '026' }, { precision: 'day', value: '2026-01-01', extra: true },
  ])('rejects invalid effective date %j', async (date) => {
    await complete(db);
    await expect(mutate(db, { date })).rejects.toThrow(/invalid-effective-date/);
  });

  it('gives the mutator no table ownership, bypass RLS, membership or history rewrite grants', async () => {
    await complete(db);
    await db.exec('set session authorization postgres');
    const roles = await db.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>("select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname='strandcue_mutator'");
    expect(roles.rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcanlogin: false }]);
    expect((await db.query("select 1 from pg_tables where tableowner='strandcue_mutator'")).rows).toEqual([]);
    expect((await db.query("select pg_has_role('authenticated','strandcue_mutator','MEMBER') member")).rows[0]).toEqual({ member: false });
    await asUser(db, USER_A);
    await expect(db.exec('set role strandcue_mutator')).rejects.toThrow(/permission denied/);
  });

  it('checks identity in private cores even when wrappers are bypassed', async () => {
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("select set_config('request.jwt.claims','{}',false)");
    for (const query of [
      "select strandcue_private.complete_account('user_a',true)",
      'select strandcue_private.get_passport(current_date)',
      "select strandcue_private.mutate_passport(gen_random_uuid(),0,'baseline','{}','{}',null,null)",
    ]) await expect(db.query(query)).rejects.toThrow(/authentication-required/);
    await expect(db.query("select strandcue_private.validate_passport('{}',false)")).rejects.toThrow(/permission denied/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [UNVERIFIED]);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role', user_metadata: { role: 'admin', email_verified: true } })]);
    await expect(complete(db)).rejects.toThrow(/email-not-verified/);
  });

  it('enforces composite owner foreign keys even for a trusted SQL writer', async () => {
    await complete(db); await mutate(db);
    const a = await current(db);
    await asUser(db, USER_B); await complete(db, 'user_b'); await mutate(db);
    const b = await current(db);
    await db.exec('set session authorization postgres');
    const insert = `insert into public.passport_revisions
      (user_id,passport_id,sequence,base_revision,kind,effective_date,source,patch,corrects_id,correction_reason)
      values ($1,$2,2,1,'correction',$3,'user-reported',$4,$5,'foreign')`;
    await expect(db.query(insert, [USER_B, a.passportId, DAY, { goals: ['shine'] }, a.revisions[0].id])).rejects.toThrow(/foreign key/);
    await expect(db.query(insert, [USER_B, b.passportId, DAY, { goals: ['shine'] }, a.revisions[0].id])).rejects.toThrow(/foreign key/);
  });

  it('normalizes optional values, keeps zero distinct from unanswered and rejects incomplete baseline chains', async () => {
    await complete(db);
    await mutate(db, { patch: { ...BASELINE, notes: '  initial  ', lengthCm: null, maximumProductBudgetZar: 0, stylingHabits: [], wigOrExtensions: { type: '  braid  ', material: null, observationTarget: 'both' } } });
    const baseline = (await current(db)).revisions[0];
    await mutate(db, { kind: 'correction', revision: 1, correctsId: baseline.id, reason: '  Corrected baseline  ', patch: { ...BASELINE, notes: null }, date: DAY });
    const corrected = (await current(db)).revisions[1];
    await expect(mutate(db, { kind: 'correction', revision: 2, correctsId: corrected.id, reason: 'Again', patch: { notes: 'only one field' } })).rejects.toThrow(/complete-baseline-required/);
    await mutate(db, { kind: 'change', revision: 2, patch: { maximumProductBudgetZar: 0, stylingHabits: ['  wash  '], porosity: 'unknown' }, date: { precision: 'day', value: '2026-02-01' } });
    await mutate(db, { kind: 'change', revision: 3, patch: { lengthCm: 0, greyStatus: null, environmentSensitivities: ['none'], scalpObservations: ['unknown'] }, date: { precision: 'day', value: '2026-03-01' } });
    const result = await current(db);
    expect(result.projection).toEqual(projectHistory(result.revisions, { asOf: '2026-09-01' }));
    expect(result.projection.values).toMatchObject({ maximumProductBudgetZar: 0, notes: null, stylingHabits: ['wash'], lengthCm: 0, porosity: 'unknown' });
  });

  it('rejects malformed mutation metadata without appending history', async () => {
    await complete(db);
    expect(await current(db)).toBeNull();
    await expect(mutate(db, { kind: 'change' })).rejects.toThrow(/invalid-revision-kind/);
    await expect(mutate(db, { revision: -1 })).rejects.toThrow(/invalid-operation/);
    await expect(mutate(db, { correctsId: crypto.randomUUID() })).rejects.toThrow(/invalid-correction/);
    await expect(mutate(db, { reason: 'unexpected' })).rejects.toThrow(/invalid-correction/);
    await mutate(db);
    await expect(mutate(db, { kind: 'baseline', revision: 1 })).rejects.toThrow(/invalid-revision-kind/);
    await expect(mutate(db, { kind: 'correction', revision: 1, patch: { goals: ['shine'] } })).rejects.toThrow(/invalid-correction/);
    expect((await current(db)).revision).toBe(1);
  });

  it('matches JavaScript whitespace normalization and UTF-16 string limits', async () => {
    await complete(db); await mutate(db);
    await expect(mutate(db, { kind: 'change', revision: 1, patch: { notes: '🪮'.repeat(1001) } })).rejects.toThrow(/invalid-passport/);
    await expect(mutate(db, { kind: 'change', revision: 1, patch: { stylingHabits: ['\t\n\u00a0'] } })).rejects.toThrow(/invalid-passport/);
    await mutate(db, { kind: 'change', revision: 1, patch: { notes: '\uFEFF\t note \n\u00a0', stylingHabits: ['\tbraid\n'] }, date: { precision: 'day', value: '2026-02-01' } });
    expect((await current(db)).projection.values).toMatchObject({ notes: 'note', stylingHabits: ['braid'] });
  });
});

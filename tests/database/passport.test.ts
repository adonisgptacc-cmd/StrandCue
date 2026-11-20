import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { projectHistory } from '../../packages/domain/src/history.ts';
import { asUser, BASELINE, complete, current, database, DAY, mutate, UNVERIFIED, USER_A, USER_B } from './harness.ts';

/** Store a revision the way an earlier release stored it: written straight
 * to the append-only history by a trusted writer, bypassing the API that
 * now refuses new legacy length numbers. */
async function storeLegacyRevision(
  db: PGlite,
  patch: Record<string, unknown>,
  interval: { start: string | null; end: string | null; precision: string; value: string | null },
) {
  await db.exec('set session authorization postgres');
  const passport = (await db.query<{ id: string; user_id: string }>('select id, user_id from public.hair_passports')).rows[0];
  const sequence = (await db.query<{ sequence: number }>('select coalesce(max(sequence),0)+1 sequence from public.passport_revisions')).rows[0].sequence;
  await db.query(
    `insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch)
     values ($1,$2,$3,$3-1,'change',$4::jsonb,$5,$6,$8,$7::jsonb)`,
    [passport.user_id, passport.id, sequence, JSON.stringify({ precision: interval.precision, value: interval.value }),
      interval.start, interval.end, JSON.stringify(patch),
      // The foundation records a day-precision entry as user-reported and
      // every less precise one as user-estimated.
      interval.precision === 'day' ? 'user-reported' : 'user-estimated'],
  );
  await db.query('update public.hair_passports set revision=$1 where id=$2', [sequence, passport.id]);
  await asUser(db, USER_A);
}

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
    // Reserved names raise reserved-username since the 2026-09-24 username
    // migration split them from malformed names per the product authority.
    await expect(complete(db, 'admin')).rejects.toThrow(/invalid-username|reserved-username/);
    expect(await complete(db, '  Private_A  ')).toMatchObject({ userId: USER_A, username: 'private_a', country: 'ZA' });
    await asUser(db, USER_B);
    await expect(complete(db, 'PRIVATE_A')).rejects.toThrow(/username-unavailable/);
  });

  it('offers minimal username availability and checked neutral plus personalized suggestions only to verified users', async () => {
    await complete(db, 'mark');
    await asUser(db, USER_B);
    const result = (await db.query<{ result: { available: boolean; suggestions: string[] } }>(
      'select public.username_options($1,$2) result', ['Mark', 'ZA curls!'],
    )).rows[0].result;
    expect(result.available).toBe(false);
    expect(result.suggestions).toHaveLength(6);
    expect(result.suggestions).toContain('mark_za_curls');
    expect(result.suggestions.every(value => value !== 'mark')).toBe(true);
    await asUser(db, UNVERIFIED);
    await expect(db.query('select public.username_options($1,$2)', ['mark', null])).rejects.toThrow(/email-not-verified/);
    await asUser(db, null);
    await expect(db.query('select public.username_options($1,$2)', ['mark', null])).rejects.toThrow(/permission denied/);
  });

  it('reports an existing username as available to its original owner', async () => {
    await complete(db, 'mark');
    const result = (await db.query<{ result: { available: boolean; suggestions: string[] } }>(
      'select public.username_options($1,$2) result', ['MARK', null],
    )).rows[0].result;
    expect(result).toEqual({ available: true, suggestions: [], rateLimited: false });
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

  it('preserves the largest finite JavaScript number in maximumProductBudgetZar', async () => {
    await complete(db); await mutate(db, { patch: { ...BASELINE, maximumProductBudgetZar: Number.MAX_VALUE } });
    const result = await current(db);
    expect(result.projection.values.maximumProductBudgetZar).toBe(Number.MAX_VALUE);
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
    await mutate(db, { kind: 'change', revision: 3, patch: { lengthCm: null, greyStatus: null, environmentSensitivities: ['none'], scalpObservations: ['unknown'] }, date: { precision: 'day', value: '2026-03-01' } });
    const result = await current(db);
    expect(result.projection).toEqual(projectHistory(result.revisions, { asOf: '2026-09-01' }));
    expect(result.projection.values).toMatchObject({ maximumProductBudgetZar: 0, notes: null, stylingHabits: ['wash'], lengthCm: null, porosity: 'unknown' });
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

  it('stores the structured length measurement and personal condition facts without inventing values', async () => {
    await complete(db); await mutate(db);
    const before = (await current(db)).projection.values;
    expect('damageObservation' in before).toBe(false);
    expect('heatPreference' in before).toBe(false);
    expect('lengthMeasurement' in before).toBe(false);

    await mutate(db, {
      kind: 'change',
      revision: 1,
      patch: {
        damageObservation: 'mild',
        heatPreference: 'minimise-heat',
        reactionsAvoidances: ['  fragrance  ', 'sulfates'],
        lengthMeasurement: {
          value: 30,
          unit: 'cm',
          precision: 'approximate',
          measuredOn: '2026-09-01',
        },
      },
      date: { precision: 'day', value: '2026-09-02' },
    });
    expect((await current(db, '2026-09-03')).projection.values).toMatchObject({
      damageObservation: 'mild',
      heatPreference: 'minimise-heat',
      reactionsAvoidances: ['fragrance', 'sulfates'],
      lengthMeasurement: { value: 30, unit: 'cm', precision: 'approximate', measuredOn: '2026-09-01' },
    });

    // Omitted optional answers stay absent in the projection.
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthMeasurement: { value: 118, unit: 'in' } },
      date: { precision: 'day', value: '2026-09-04' },
    });
    const replaced = (await current(db, '2026-09-05')).projection.values;
    expect(replaced.lengthMeasurement).toEqual({ value: 118, unit: 'in' });
    expect('measuredOn' in replaced.lengthMeasurement).toBe(false);

    // Clearing removes the whole measurement, never a manufactured default.
    await mutate(db, {
      kind: 'change',
      revision: 3,
      patch: { lengthMeasurement: null },
      date: { precision: 'day', value: '2026-09-06' },
    });
    expect((await current(db, '2026-09-07')).projection.values.lengthMeasurement).toBeNull();
  });

  it('agrees with the TypeScript boundary on the structured length measurement', async () => {
    await complete(db); await mutate(db);
    let revision = 1;
    const dateAt = (value: string) => ({ precision: 'day', value }) as const;
    const invalid = (patch: Record<string, unknown>) =>
      expect(mutate(db, { kind: 'change', revision, patch, date: dateAt('2026-09-02') })).rejects.toThrow(/invalid-passport/);
    const accept = async (patch: Record<string, unknown>, date: string) => {
      const result = await mutate(db, { kind: 'change', revision, patch, date: dateAt(date) });
      revision += 1;
      return result;
    };

    // Value without a known unit.
    await invalid({ lengthMeasurement: { value: 30 } });
    await invalid({ lengthMeasurement: { value: 30, unit: 'unknown' } });
    // Unit without a value.
    await invalid({ lengthMeasurement: { unit: 'cm' } });
    await invalid({ lengthMeasurement: { unit: 'cm', value: null } });
    // Date without a value.
    await invalid({ lengthMeasurement: { measuredOn: '2026-09-01' } });
    // Invalid unit and precision answers.
    await invalid({ lengthMeasurement: { value: 30, unit: 'metres' } });
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', precision: 'roughly' } });
    // Date formats.
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '01/09/2026' } });
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-2-01' } });
    // Impossible dates and invalid leap days.
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-02-31' } });
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2025-02-29' } });
    await invalid({ lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-09-31' } });
    // Zero, negative, non-finite and one documented bound (300 cm after conversion).
    await invalid({ lengthMeasurement: { value: 0, unit: 'cm' } });
    await invalid({ lengthMeasurement: { value: -30, unit: 'cm' } });
    await invalid({ lengthMeasurement: { value: 301, unit: 'cm' } });
    await invalid({ lengthMeasurement: { value: 119, unit: 'in' } });
    // Legacy and structured length facts cannot both carry a value.
    await invalid({ lengthCm: 25, lengthMeasurement: { value: 30, unit: 'cm' } });

    const okay = await accept({ lengthCm: null, lengthMeasurement: { value: 300, unit: 'cm', precision: 'exact', measuredOn: '2024-02-29' } }, '2026-09-02');
    expect(okay.projection.values.lengthMeasurement).toEqual({ value: 300, unit: 'cm', precision: 'exact', measuredOn: '2024-02-29' });
    await accept({ lengthMeasurement: { value: 118, unit: 'in', precision: 'unknown' } }, '2026-09-03');
    expect((await current(db, '2026-09-04')).projection.values.lengthMeasurement).toEqual({ value: 118, unit: 'in', precision: 'unknown' });
  });

  it('agrees with the TypeScript boundary on heat preference and reactions', async () => {
    await complete(db); await mutate(db);
    let revision = 1;
    for (const value of ['avoid-heat', 'minimise-heat', 'lower-heat-when-practical', 'no-preference', 'unknown']) {
      await mutate(db, { kind: 'change', revision, patch: { heatPreference: value } });
      revision += 1;
    }
    for (const value of ['avoid', 'low', 'moderate', 'high', 'safe']) {
      await expect(mutate(db, { kind: 'change', revision, patch: { heatPreference: value } })).rejects.toThrow(/invalid-passport/);
    }
    await expect(mutate(db, { kind: 'change', revision, patch: { reactionsAvoidances: [] } })).rejects.toThrow(/invalid-passport/);
    await expect(mutate(db, { kind: 'change', revision, patch: { reactionsAvoidances: ['   '] } })).rejects.toThrow(/invalid-passport/);
    await expect(mutate(db, { kind: 'change', revision, patch: { reactionsAvoidances: Array.from({ length: 51 }, () => 'x') } })).rejects.toThrow(/invalid-passport/);
    await expect(mutate(db, { kind: 'change', revision, patch: { reactionsAvoidances: ['y'.repeat(101)] } })).rejects.toThrow(/invalid-passport/);
    await mutate(db, { kind: 'change', revision, patch: { reactionsAvoidances: ['  ppd free mix  ', 'sulfates'] } });
    expect((await current(db)).projection.values.reactionsAvoidances).toEqual(['ppd free mix', 'sulfates']);
  });

  it('rejects new legacy length writes while keeping stored ones readable after replay', async () => {
    await complete(db);
    await mutate(db);
    // A legacy record written before the structured contract: a centimetre
    // change revision appended directly, exactly as an earlier release stored it.
    await db.exec("set session authorization postgres");
    const passportId = (await db.query<{ id: string }>("select id from public.hair_passports")).rows[0].id;
    const userId = (await db.query<{ user_id: string }>('select user_id from public.hair_passports')).rows[0].user_id;
    await db.query(
      `insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch)
       values ($1,$2,2,1,'change','{"precision":"day","value":"2026-02-01"}'::jsonb,'2026-02-01','2026-02-01','user-reported','{"lengthCm":25}'::jsonb)`,
      [userId, passportId],
    );
    await db.query('update public.hair_passports set revision=2 where id=$1', [passportId]);
    await db.exec('set session authorization authenticated');

    const legacy = await current(db);
    // Stored legacy values stay readable and history is untouched.
    expect(legacy.projection.values.lengthCm).toBe(25);
    expect(JSON.stringify(legacy.revisions[1].patch)).toBe('{"lengthCm":25}');

    // New writes of the legacy number are rejected...
    await expect(mutate(db, { kind: 'change', revision: 2, patch: { lengthCm: 30 } })).rejects.toThrow(/invalid-passport/);
    // ...and the owner can retire the legacy field while recording the
    // structured measurement in one append-only correction of history.
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 118, unit: 'in', precision: 'exact', measuredOn: '2024-02-29' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthCm).toBeNull();
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 118, unit: 'in', precision: 'exact', measuredOn: '2024-02-29' });
    expect(after.projection).toEqual(projectHistory(after.revisions, { asOf: '2026-09-01' }));
    // Corrections append: the legacy revision is still exactly as recorded.
    expect(JSON.stringify(after.revisions[1].patch)).toBe('{"lengthCm":25}');
  });

  it('keeps one current length across history without patch-local blind spots', async () => {
    await complete(db); await mutate(db);
    // A legacy record written before the structured contract: a centimetre
    // change revision appended directly, exactly as an earlier release stored it.
    await db.exec('set session authorization postgres');
    const passportId = (await db.query<{ id: string }>('select id from public.hair_passports')).rows[0].id;
    const userId = (await db.query<{ user_id: string }>('select user_id from public.hair_passports')).rows[0].user_id;
    await db.query(
      `insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch)
       values ($1,$2,2,1,'change','{"precision":"day","value":"2026-02-01"}'::jsonb,'2026-02-01','2026-02-01','user-reported','{"lengthCm":25}'::jsonb)`,
      [userId, passportId],
    );
    await db.query('update public.hair_passports set revision=2 where id=$1', [passportId]);
    await db.exec('set session authorization authenticated');

    // A measurement recorded through the API while the current projection
    // still holds a numeric legacy centimetre value would project two
    // current lengths in different units: refused at the record level.
    await expect(
      mutate(db, { kind: 'change', revision: 2, patch: { lengthMeasurement: { value: 118, unit: 'in' } } }),
    ).rejects.toThrow(/invalid-passport/);
    // An unrelated change stays appendable without any length key.
    await mutate(db, { kind: 'change', revision: 2, patch: { notes: 'a plain unrelated note' } });
    // The explicit retirement key keeps the single-save acceptance path.
    await mutate(db, {
      kind: 'change',
      revision: 3,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm', precision: 'approximate' } },
      date: { precision: 'day', value: '2026-03-03' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthCm).toBeNull();
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm', precision: 'approximate' });
    expect(after.projection).toEqual(projectHistory(after.revisions, { asOf: '2026-09-01' }));
  });

  it('refuses a structured measurement while a legacy length has an unknown effective date', async () => {
    await complete(db); await mutate(db);
    // A pre-contract record whose legacy centimetre entry carries an unknown
    // effective date: the projection cannot say which value is current, so
    // it reports the field as ambiguous instead of a current value. The
    // length is still recorded and still has to be retired.
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: null, end: null, precision: 'unknown', value: null });
    const legacy = await current(db);
    expect(legacy.projection.values.lengthCm).toBeUndefined();
    expect(legacy.projection.ambiguousFields.lengthCm).toBeDefined();

    // A structured measurement must not join a still-recorded legacy length.
    await expect(
      mutate(db, { kind: 'change', revision: 2, patch: { lengthMeasurement: { value: 30, unit: 'cm' } }, date: { precision: 'day', value: '2026-03-01' } }),
    ).rejects.toThrow(/invalid-passport/);
    // The same append retires the legacy field, so it is accepted.
    const retired = await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect(retired.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    // History stays append-only: the stored legacy revision is untouched.
    expect(JSON.stringify((await current(db)).revisions[1].patch)).toBe('{"lengthCm":25}');
  });

  it('refuses a structured measurement while legacy length entries conflict', async () => {
    await complete(db); await mutate(db);
    // Two pre-contract legacy lengths whose effective intervals overlap:
    // the projection reports the field as ambiguous, not as a current value.
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-28', precision: 'month', value: '2026-02' });
    await storeLegacyRevision(db, { lengthCm: 30 }, { start: '2026-02-10', end: '2026-02-10', precision: 'day', value: '2026-02-10' });
    const legacy = await current(db);
    expect(legacy.projection.values.lengthCm).toBeUndefined();
    expect(legacy.projection.ambiguousFields.lengthCm.reason).toBe('overlapping-effective-intervals');

    await expect(
      mutate(db, { kind: 'change', revision: 3, patch: { lengthMeasurement: { value: 30, unit: 'cm' } }, date: { precision: 'day', value: '2026-03-01' } }),
    ).rejects.toThrow(/invalid-passport/);
    // Retiring the legacy field in the same append resolves the conflict.
    const retired = await mutate(db, {
      kind: 'change',
      revision: 3,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect(retired.projection.values.lengthCm).toBeNull();
    expect(retired.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    // Both legacy entries now fall behind the retirement, so a later
    // measurement needs no retirement key any more.
    const later = await mutate(db, {
      kind: 'change',
      revision: 4,
      patch: { lengthMeasurement: { value: 32, unit: 'cm' } },
      date: { precision: 'day', value: '2026-04-01' },
    });
    expect(later.projection.values.lengthMeasurement).toEqual({ value: 32, unit: 'cm' });
    // History stays append-only: both stored legacy revisions are untouched.
    const after = await current(db);
    expect(JSON.stringify(after.revisions[1].patch)).toBe('{"lengthCm":25}');
    expect(JSON.stringify(after.revisions[2].patch)).toBe('{"lengthCm":30}');
  });

  it('lets a correction replace the legacy length with a structured measurement', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-01', precision: 'day', value: '2026-02-01' });
    const legacyRevision = (await current(db)).revisions[1];
    // Correcting the legacy entry with a structured measurement replaces
    // that entry: the legacy length is not recorded any more, so the same
    // append needs no retirement key.
    const corrected = await mutate(db, {
      kind: 'correction',
      revision: 2,
      correctsId: legacyRevision.id,
      reason: 'Recorded the length in the wrong unit',
      patch: { lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect(corrected.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    expect(corrected.projection.values.lengthCm).toBeUndefined();
    // The superseded legacy revision is still exactly as recorded.
    const after = await current(db);
    expect(after.projection.supersededRevisionIds).toContain(legacyRevision.id);
    expect(JSON.stringify(after.revisions[1].patch)).toBe('{"lengthCm":25}');
    expect(after.projection).toEqual(projectHistory(after.revisions, { asOf: '2026-09-01' }));
  });

  it('refuses a retirement that falls inside the earlier entry interval', async () => {
    await complete(db); await mutate(db);
    // A legacy length recorded for the whole of 2020.
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2020-01-01', end: '2020-12-31', precision: 'year', value: '2020' });
    // A retirement dated inside that interval does not replace the earlier
    // entry: the earlier entry would stay the record's current length next
    // to the new measurement, so the append is refused.
    await expect(mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2020-06-01' },
    })).rejects.toThrow(/invalid-passport/);
    // A retirement after the earlier entry is accepted and leaves one
    // current length.
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2021-03-01' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    expect(after.projection.values.lengthCm).toBeNull();
    expect(after.projection.ambiguousFields.lengthCm).toBeUndefined();
  });

  it('refuses a retirement dated before the earlier entry', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-01', precision: 'day', value: '2026-02-01' });
    // A retirement dated before the earlier entry leaves that entry as the
    // record's current length, so the record would hold two current lengths.
    await expect(mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-01-01' },
    })).rejects.toThrow(/invalid-passport/);
    // The record is unchanged by the refused append.
    const after = await current(db);
    expect(after.projection.values.lengthCm).toBe(25);
    expect(after.projection.values.lengthMeasurement).toBeUndefined();
  });

  it('refuses a mixed patch from a privileged writer', async () => {
    await complete(db); await mutate(db);
    // The whitelist validator runs inside the write path; the record-level
    // guard also refuses a patch that carries a numeric legacy length next
    // to a structured measurement, whoever writes it.
    await db.exec('set session authorization postgres');
    const passport = (await db.query<{ id: string; user_id: string }>('select id, user_id from public.hair_passports')).rows[0];
    await expect(db.query(
      `insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch)
       values ($1,$2,2,1,'change','{"precision":"day","value":"2026-02-01"}'::jsonb,'2026-02-01','2026-02-01','user-estimated','{"lengthCm":55,"lengthMeasurement":{"value":30,"unit":"cm"}}'::jsonb)`,
      [passport.user_id, passport.id],
    )).rejects.toThrow(/invalid-passport/);
    expect((await current(db)).revisions).toHaveLength(1);
  });

  it('keeps an undated legacy length recorded after its retirement', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: null, end: null, precision: 'unknown', value: null });
    // The first save retires the field, but an earlier entry the record
    // cannot place in time stays a candidate: the next measurement still
    // has to retire it again.
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    expect(after.projection.ambiguousFields.lengthCm).toBeDefined();
    await expect(
      mutate(db, { kind: 'change', revision: 3, patch: { lengthMeasurement: { value: 32, unit: 'cm' } }, date: { precision: 'day', value: '2026-04-01' } }),
    ).rejects.toThrow(/invalid-passport/);
    // The stored legacy revision is still exactly as recorded.
    expect(JSON.stringify((await current(db)).revisions[1].patch)).toBe('{"lengthCm":25}');
  });

  it('refuses a correction of another entry while a legacy length is live', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-01', precision: 'day', value: '2026-02-01' });
    await mutate(db, { kind: 'change', revision: 2, patch: { goals: ['volume'] }, date: { precision: 'day', value: '2026-02-10' } });
    const other = (await current(db)).revisions[2];
    // Correcting an unrelated entry does not remove the legacy length, so a
    // structured measurement in that correction is still refused.
    await expect(mutate(db, {
      kind: 'correction',
      revision: 3,
      correctsId: other.id,
      reason: 'Wrong goal',
      patch: { goals: ['volume'], lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-02-15' },
    })).rejects.toThrow(/invalid-passport/);
    // With the retirement in the same correction it is accepted.
    await mutate(db, {
      kind: 'correction',
      revision: 3,
      correctsId: other.id,
      reason: 'Wrong goal',
      patch: { goals: ['volume'], lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-02-15' },
    });
    expect((await current(db)).projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
  });

  it('treats a legacy length dated in the future as recorded', async () => {
    await complete(db); await mutate(db);
    // A trusted writer stored a legacy length for a future year. The record
    // holds it, so a structured measurement has to retire it, and no date
    // the API accepts can follow a future entry: only correcting that entry
    // removes it.
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2027-01-01', end: '2027-12-31', precision: 'year', value: '2027' });
    await expect(
      mutate(db, { kind: 'change', revision: 2, patch: { lengthMeasurement: { value: 30, unit: 'cm' } }, date: { precision: 'day', value: '2026-03-01' } }),
    ).rejects.toThrow(/invalid-passport/);
    await expect(
      mutate(db, { kind: 'change', revision: 2, patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } }, date: { precision: 'day', value: '2026-03-01' } }),
    ).rejects.toThrow(/invalid-passport/);
    // Correcting that entry replaces it, so the measurement is accepted.
    const legacyRevision = (await current(db)).revisions[1];
    await mutate(db, {
      kind: 'correction',
      revision: 2,
      correctsId: legacyRevision.id,
      reason: 'Recorded by mistake',
      patch: { lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect((await current(db)).projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
  });

  it('accepts a month precision retirement that follows the legacy length', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-01-01', end: '2026-01-31', precision: 'month', value: '2026-01' });
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'month', value: '2026-02' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthCm).toBeNull();
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    // The retirement followed the earlier entry, so a later measurement
    // needs no retirement key.
    await mutate(db, {
      kind: 'change',
      revision: 3,
      patch: { lengthMeasurement: { value: 32, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect((await current(db)).projection.values.lengthMeasurement).toEqual({ value: 32, unit: 'cm' });
  });

  it('refuses a correction of a retirement that would make the earlier length current again', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-01', precision: 'day', value: '2026-02-01' });
    // The owner retires the earlier length and records the new one.
    await mutate(db, {
      kind: 'change',
      revision: 2,
      patch: { lengthCm: null, lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    const retirement = (await current(db)).revisions[2];
    // Correcting the retirement supersedes it, so the earlier length would
    // be current again: the correction needs its own retirement.
    await expect(mutate(db, {
      kind: 'correction',
      revision: 3,
      correctsId: retirement.id,
      reason: 'Wrong date for the new length',
      patch: { lengthMeasurement: { value: 32, unit: 'cm' } },
      date: { precision: 'day', value: '2026-04-01' },
    })).rejects.toThrow(/invalid-passport/);
    // With a retirement that follows the earlier length it is accepted, and
    // the record holds one current length.
    await mutate(db, {
      kind: 'correction',
      revision: 3,
      correctsId: retirement.id,
      reason: 'Wrong date for the new length',
      patch: { lengthCm: null, lengthMeasurement: { value: 32, unit: 'cm' } },
      date: { precision: 'day', value: '2026-04-01' },
    });
    const after = await current(db);
    expect(after.projection.values.lengthCm).toBeNull();
    expect(after.projection.values.lengthMeasurement).toEqual({ value: 32, unit: 'cm' });
    expect(after.projection.ambiguousFields.lengthCm).toBeUndefined();
  });

  it('refuses a privileged writer adding a legacy number next to a live measurement', async () => {
    await complete(db); await mutate(db);
    await mutate(db, {
      kind: 'change',
      revision: 1,
      patch: { lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-02-01' },
    });
    await db.exec('set session authorization postgres');
    const passport = (await db.query<{ id: string; user_id: string }>('select id, user_id from public.hair_passports')).rows[0];
    await expect(db.query(
      `insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch)
       values ($1,$2,3,2,'change','{"precision":"day","value":"2026-03-01"}'::jsonb,'2026-03-01','2026-03-01','user-estimated','{"lengthCm":55}'::jsonb)`,
      [passport.user_id, passport.id],
    )).rejects.toThrow(/invalid-passport/);
    expect((await current(db)).revisions).toHaveLength(2);
  });

  it('does not let a superseded legacy length block a valid measurement', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: '2026-02-01', end: '2026-02-01', precision: 'day', value: '2026-02-01' });
    const legacyRevision = (await current(db)).revisions[1];
    // The owner corrects that entry: the legacy length leaves the record.
    await mutate(db, {
      kind: 'correction',
      revision: 2,
      correctsId: legacyRevision.id,
      reason: 'Recorded the wrong length',
      patch: { lengthCm: null },
      date: { precision: 'day', value: '2026-02-05' },
    });
    // No legacy length is recorded any more, so a structured measurement is
    // accepted without a retirement key.
    const measured = await mutate(db, {
      kind: 'change',
      revision: 3,
      patch: { lengthMeasurement: { value: 30, unit: 'cm' } },
      date: { precision: 'day', value: '2026-03-01' },
    });
    expect(measured.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm' });
    // The superseded revision is still exactly as recorded.
    const after = await current(db);
    expect(after.projection.supersededRevisionIds).toContain(legacyRevision.id);
    expect(JSON.stringify(after.revisions[1].patch)).toBe('{"lengthCm":25}');
  });

  it('keeps another owner unable to influence or inspect the length decision', async () => {
    await complete(db); await mutate(db);
    await storeLegacyRevision(db, { lengthCm: 25 }, { start: null, end: null, precision: 'unknown', value: null });
    const ownerARevision = (await current(db)).revisions[1].id;

    await asUser(db, USER_B);
    await complete(db, 'user_b');
    // The second owner sees no part of the first owner's record.
    expect(await current(db)).toBeNull();
    const visible = await db.query<{ user_id: string }>('select user_id from public.passport_revisions');
    expect(visible.rows.every(row => row.user_id === USER_B)).toBe(true);
    // The second owner's own record is unaffected by the first owner's
    // legacy length: their measurement is accepted.
    await mutate(db, { patch: { ...BASELINE, lengthMeasurement: { value: 28, unit: 'cm' } } });
    expect((await current(db)).projection.values.lengthMeasurement).toEqual({ value: 28, unit: 'cm' });
    // The second owner cannot correct the first owner's revision either.
    await expect(mutate(db, {
      kind: 'correction',
      revision: 1,
      correctsId: ownerARevision,
      reason: 'not mine',
      patch: { lengthCm: null },
      date: DAY,
    })).rejects.toThrow(/correction-target-not-found|revision-conflict/);

    // The first owner's decision is unchanged by the second owner's writes.
    await asUser(db, USER_A);
    await expect(
      mutate(db, { kind: 'change', revision: 2, patch: { lengthMeasurement: { value: 30, unit: 'cm' } }, date: { precision: 'day', value: '2026-03-01' } }),
    ).rejects.toThrow(/invalid-passport/);
  });

  it('declares the row lock that serializes appends for one owner', async () => {
    await complete(db); await mutate(db);
    // The write path locks the owner's passport row for update before it
    // appends, so a second append for the same owner waits for the first to
    // commit and then reads its facts. This is a structural assertion:
    // PGlite runs a single connection, so a literal two-transaction race
    // cannot be executed in this harness. The behaviour that depends on the
    // lock - the second append reading the first append's facts - is
    // asserted by the retirement cases above.
    await db.exec('set session authorization postgres');
    const writePath = (await db.query<{ definition: string }>(
      `select pg_get_functiondef('strandcue_private.mutate_passport(uuid,integer,text,jsonb,jsonb,uuid,text)'::regprocedure) definition`,
    )).rows[0].definition;
    expect(writePath).toMatch(/from public\.hair_passports[\s\S]*?for update/i);
    await asUser(db, USER_A);
  });

  it('answers pathological numeric literals with a data exception at the JSON boundary', async () => {
    await complete(db); await mutate(db);
    // Beyond-double literals overflow inside PostgreSQL's numeric parser
    // while the command is still being parsed (SQLSTATE 22003, a data
    // exception mapped to a clean 400-class answer on a hosted stack), so
    // nothing ever reaches the validator with an unrepresentable number.
    // The validator still wraps its own numeric casts in the domain
    // rejection as forward-compatible defense in depth.
    await expect(db.query<{ result: unknown }>(
      'select public.mutate_passport($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7) result',
      [crypto.randomUUID(), 1, 'change', JSON.stringify(DAY),
        '{"notes":"probe","lengthMeasurement":{"value":1e131073,"unit":"cm"},"maximumProductBudgetZar":1e131074}',
        null, null],
    )).rejects.toThrow(/overflows numeric format/);
  });

  it('refuses a measurement dated after today at the record level', async () => {
    await complete(db); await mutate(db);
    // The submission boundary refuses future-dated measurements; the same
    // rule holds for an append that reaches the record directly.
    await expect(
      mutate(db, { kind: 'change', revision: 1, patch: { lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2030-01-01' } } }),
    ).rejects.toThrow(/invalid-passport/);
  });

  it('keeps another owner unable to read or mutate the structured measurement', async () => {
    await asUser(db, USER_A);
    await complete(db);
    await mutate(db);
    await mutate(db, {
      kind: 'change',
      revision: 1,
      patch: { lengthMeasurement: { value: 30, unit: 'cm', measuredOn: '2026-09-01' }, reactionsAvoidances: ['fragrance'] },
      date: { precision: 'day', value: '2026-09-02' },
    });
    const ownerARevision = (await current(db)).revisions[1].id;

    await asUser(db, USER_B);
    // No profile yet: even reading the report is refused before completion.
    await expect(current(db)).rejects.toThrow(/account-not-active/);
    await complete(db, 'user_b');
    expect(await current(db)).toBeNull();
    // A second owner cannot reference the first owner's revision.
    await expect(mutate(db, {
      kind: 'correction',
      revision: 1,
      correctsId: ownerARevision,
      reason: 'not mine',
      patch: { lengthMeasurement: { value: 1, unit: 'cm' } },
      date: DAY,
    })).rejects.toThrow(/revision-conflict|correction-target-not-found/);
    await expect(mutate(db, { patch: { ...BASELINE, lengthMeasurement: { value: 999, unit: 'cm' } } })).rejects.toThrow(/invalid-passport/);
    await mutate(db, { patch: { ...BASELINE, lengthMeasurement: { value: 20, unit: 'cm' } } });

    await asUser(db, USER_A);
    const untouched = await current(db, '2026-09-03');
    expect(untouched.projection.values.lengthMeasurement).toEqual({ value: 30, unit: 'cm', measuredOn: '2026-09-01' });
    expect(untouched.revisions.map((r: { sequence: number }) => r.sequence)).toEqual([1, 2]);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

async function setConsent(db: PGlite, operationId = crypto.randomUUID(), purpose = 'product_analytics', granted = true) {
  return (await db.query<{ result: any }>(`select public.consent_set($1, $2, $3) result`, [operationId, purpose, granted])).rows[0].result;
}

async function listConsents(db: PGlite) {
  return (await db.query<{ result: any }>(`select public.consent_list() result`)).rows[0].result;
}

describe('consent records immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.consent_records');
  });
  afterAll(async () => { await db?.close(); });

  it('enforces RLS on consent tables', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename in ('consent_records')`,
    );
    expect(rows.rows.map((row) => row.tablename)).toEqual(['consent_records']);
    const unprotected = await db.query(
      `select relname from pg_class where relname = 'consent_records' and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('denies direct authenticated writes to consent records', async () => {
    await complete(db);
    await expect(db.exec(`insert into public.consent_records(user_id, purpose, granted) values ('${USER_A}', 'product_analytics', true)`)).rejects.toThrow(/permission denied|violates/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.consent_records')).rows).toEqual([]);
  });

  it('records consent per purpose with latest-wins reads', async () => {
    await complete(db);
    await setConsent(db, crypto.randomUUID(), 'product_analytics', true);
    await setConsent(db, crypto.randomUUID(), 'marketing_email', false);
    const list = await listConsents(db);
    expect(list).toMatchObject({ product_analytics: true, marketing_email: false });
    // Withdrawal appends; history preserved, current flips.
    await setConsent(db, crypto.randomUUID(), 'product_analytics', false);
    const after = await listConsents(db);
    expect(after).toMatchObject({ product_analytics: false });
    const rows = await db.query(`select * from public.consent_records`);
    expect(rows.rows).toHaveLength(3);
  });

  it('protects the required processing purpose while the account is active', async () => {
    await complete(db);
    await expect(setConsent(db, crypto.randomUUID(), 'hair_passport_processing', false)).rejects.toThrow(/required-purpose/i);
    // Withdrawing it means deleting the account instead; nothing was written.
    const rows = await db.query(`select * from public.consent_records`);
    expect(rows.rows).toEqual([]);
  });

  it('rejects unknown purposes without writing', async () => {
    await complete(db);
    await expect(setConsent(db, crypto.randomUUID(), 'sell_my_data', true)).rejects.toThrow(/unknown-purpose/i);
    expect((await db.query(`select * from public.consent_records`)).rows).toEqual([]);
  });

  it('is idempotent on same operation key and payload', async () => {
    await complete(db);
    const op = crypto.randomUUID();
    const first = await setConsent(db, op, 'marketing_email', true);
    expect(await setConsent(db, op, 'marketing_email', true)).toEqual(first);
    await expect(setConsent(db, op, 'marketing_email', false)).rejects.toThrow(/operation-conflict/i);
  });

  it('hides other owners consent records', async () => {
    await complete(db);
    await setConsent(db, crypto.randomUUID(), 'product_analytics', true);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    expect(await listConsents(db)).toEqual({});
    await expect(setConsent(db, crypto.randomUUID(), 'product_analytics', true)).resolves.toMatchObject({ granted: true });
  });

  it('retains consent records after profile purge for the retention schedule', async () => {
    await complete(db);
    await setConsent(db, crypto.randomUUID(), 'marketing_email', true);
    await db.exec('set session authorization postgres');
    await db.exec(`delete from public.profiles where user_id = '${USER_A}'`);
    // No foreign key cascades the audit trail away.
    expect((await db.query(`select * from public.consent_records`)).rows).toHaveLength(1);
  });
});

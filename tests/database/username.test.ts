import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, current, database, mutate, USER_A, USER_B } from './harness.ts';

async function changeUsername(db: PGlite, operationId = crypto.randomUUID(), username = 'new_name') {
  return (await db.query<{ result: any }>(`select public.username_change($1, $2) result`, [operationId, username])).rows[0].result;
}

describe('username change with product-authority policy', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('changes to a valid PRD name and keeps UUID and history', async () => {
    const before = await complete(db, 'user_a');
    await mutate(db);
    const changed = await changeUsername(db, crypto.randomUUID(), 'user.a-2');
    expect(changed).toMatchObject({ username: 'user.a-2', userId: USER_A });
    expect(changed.userId).toBe(before.userId);
    expect((await current(db)).revision).toBe(1);
  });

  it('resolves concurrent claims with one winner and preserved input', async () => {
    await complete(db, 'user_a');
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await asUser(db, USER_A);
    expect((await changeUsername(db, crypto.randomUUID(), 'taken_name')).username).toBe('taken_name');
    await asUser(db, USER_B);
    await expect(changeUsername(db, crypto.randomUUID(), 'TAKEN_NAME')).rejects.toThrow(/username-taken|username-unavailable/i);
  });

  it('enforces the 7-day change interval from the product authority', async () => {
    await complete(db, 'user_a');
    await changeUsername(db, crypto.randomUUID(), 'second_name');
    // A change 6 days later is denied; the PRD 7-day rule governs, not the older 30-day default.
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set username_changed_at = now() - interval '6 days' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    await expect(changeUsername(db, crypto.randomUUID(), 'third_name')).rejects.toThrow(/username-change-too-soon/i);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set username_changed_at = now() - interval '8 days' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    expect((await changeUsername(db, crypto.randomUUID(), 'third_name')).username).toBe('third_name');
  });

  it('rejects invalid and reserved names without changing state', async () => {
    await complete(db, 'user_a');
    for (const name of ['-leading', 'trailing-', 'double..dots', 'under__scores', 'a', 'x'.repeat(33), 'admin', 'support', ' strandcue ']) {
      await expect(changeUsername(db, crypto.randomUUID(), name)).rejects.toThrow(/invalid-username|reserved/i);
    }
    const profile = await db.query<{ username: string }>(`select username from public.profiles`);
    expect(profile.rows).toEqual([{ username: 'user_a' }]);
  });

  it('is idempotent on same operation key and payload', async () => {
    await complete(db, 'user_a');
    const op = crypto.randomUUID();
    const first = await changeUsername(db, op, 'stable_name');
    expect(await changeUsername(db, op, 'stable_name')).toEqual(first);
    await expect(changeUsername(db, op, 'other_name')).rejects.toThrow(/operation-conflict/i);
  });
});

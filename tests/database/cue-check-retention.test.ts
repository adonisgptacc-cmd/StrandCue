import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

const AS_OF = '2026-10-24T12:00:00.000Z';

async function seedOperation(db: PGlite, userId: string, operationId: string, createdAt: string) {
  await db.exec('set session authorization postgres');
  await db.query(
    `insert into strandcue_private.cue_check_operations(user_id,operation_id,payload,result,created_at)
     values ($1,$2,'{"notes":"private note"}'::jsonb,'{"recordId":"receipt"}'::jsonb,$3::timestamptz)`,
    [userId, operationId, createdAt],
  );
  await asUser(db, USER_A);
}

async function cleanup(db: PGlite, asOf: string | null): Promise<number> {
  await db.exec('set session authorization postgres');
  try {
    const result = await db.query<{ count: number }>(
      'select public.cue_check_operation_retention_cleanup($1::timestamptz) count',
      [asOf],
    );
    return result.rows[0]!.count;
  } finally {
    await asUser(db, USER_A);
  }
}

describe('Cue Check operation receipt retention', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await database();
    await asUser(db, USER_A);
    await complete(db, 'user_a');
    await asUser(db, USER_B);
    await complete(db, 'user_b');
  }, 60_000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate strandcue_private.cue_check_operations, public.cue_check_revisions, public.cue_checks cascade');
    await asUser(db, USER_A);
  });

  it('purges only receipts strictly older than 30 days across owners', async () => {
    await seedOperation(db, USER_A, '10000000-0000-4000-8000-000000000001', '2026-09-24T11:59:59.999Z');
    await seedOperation(db, USER_A, '10000000-0000-4000-8000-000000000002', '2026-09-24T12:00:00.000Z');
    await seedOperation(db, USER_B, '10000000-0000-4000-8000-000000000003', '2026-10-24T11:00:00.000Z');
    expect(await cleanup(db, AS_OF)).toBe(1);
    await db.exec('set session authorization postgres');
    const rows = await db.query<{ operation_id: string }>('select operation_id::text from strandcue_private.cue_check_operations order by operation_id');
    expect(rows.rows.map(row => row.operation_id)).toEqual([
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ]);
    await asUser(db, USER_A);
  });

  it('is rerunnable and rejects a missing as-of', async () => {
    expect(await cleanup(db, AS_OF)).toBe(0);
    expect(await cleanup(db, AS_OF)).toBe(0);
    await expect(cleanup(db, null)).rejects.toThrow(/invalid-as-of/);
  });

  it('is unavailable to consumer roles', async () => {
    await db.exec('set session authorization postgres');
    const result = await db.query<{ anon: boolean; authenticated: boolean }>(
      `select
        has_function_privilege('anon','public.cue_check_operation_retention_cleanup(timestamptz)','EXECUTE') anon,
        has_function_privilege('authenticated','public.cue_check_operation_retention_cleanup(timestamptz)','EXECUTE') authenticated`,
    );
    expect(result.rows[0]).toEqual({ anon: false, authenticated: false });
    await asUser(db, USER_A);
  });
});

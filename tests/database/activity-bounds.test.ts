import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A } from './harness.ts';

describe('activity zone input boundary', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await database();
    await asUser(db, USER_A);
    await complete(db);
  }, 120_000);
  afterAll(async () => { await db?.close(); });

  const record = (zones: unknown) => db.query(
    `select public.record_activity($1,$2,'wash','2024-01-15'::timestamptz,'exact_day',$3::jsonb,null)`,
    [crypto.randomUUID(), crypto.randomUUID(), JSON.stringify(zones)],
  );

  it.each([
    [{ region: null, segment: 'roots' }],
    [{ region: 'front', segment: null }],
    [{ region: 'front', segment: 'roots', extra: 'unbounded content' }],
    Array.from({ length: 37 }, () => ({ region: 'front', segment: 'roots' })),
  ])('rejects invalid or oversized zones without storing an activity (%j)', async (...zones) => {
    await expect(record(zones)).rejects.toThrow(/invalid-zones/);
    expect((await db.query('select id from public.activities')).rows).toEqual([]);
  });

  it('accepts an empty collection and all 36 supported region/segment combinations', async () => {
    await expect(record([])).resolves.toBeDefined();
    const regions = ['whole_head', 'front', 'crown', 'nape', 'other', 'unknown'];
    const segments = ['entire_strand', 'roots', 'mid_lengths', 'ends', 'other', 'unknown'];
    await expect(record(regions.flatMap((region) => segments.map((segment) => ({ region, segment }))))).resolves.toBeDefined();
  });
});

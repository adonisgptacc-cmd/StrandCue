import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A } from './harness.ts';

// Seven-year consent retention enforcement (Fix C). Time is frozen per test:
// every row is seeded with an explicit recorded_at relative to a DB-computed
// cutoff (as-of minus exactly 7 calendar years), so the suite is immune to
// leap-year and millisecond drift. Boundary rule: strictly older than the
// cutoff purges; exactly-at survives.
const DAY_MS = 86_400_000;

async function cutoffFor(db: PGlite, asOf: string): Promise<string> {
  await db.exec('set session authorization postgres');
  try {
    const rows = await db.query<{ cutoff: string }>(
      `select ($1::timestamptz - interval '7 years') cutoff`,
      [asOf],
    );
    return rows.rows[0].cutoff;
  } finally {
    await asUser(db, USER_A);
  }
}

function isoShift(cutoffIso: string, days: number): string {
  return new Date(new Date(cutoffIso).getTime() + days * DAY_MS).toISOString();
}

async function seedConsent(
  db: PGlite,
  userId: string,
  purpose: string,
  granted: boolean,
  recordedAt: string,
) {
  await db.exec('set session authorization postgres');
  try {
    await db.query(
      `insert into public.consent_records(user_id, purpose, granted, recorded_at)
       values ($1, $2, $3, $4::timestamptz)`,
      [userId, purpose, granted, recordedAt],
    );
  } finally {
    await asUser(db, USER_A);
  }
}

async function cleanup(db: PGlite, asOf: string): Promise<number> {
  await db.exec('set session authorization postgres');
  try {
    const rows = await db.query<{ consent_retention_cleanup: number }>(
      `select public.consent_retention_cleanup($1::timestamptz) consent_retention_cleanup`,
      [asOf],
    );
    return rows.rows[0].consent_retention_cleanup;
  } finally {
    await asUser(db, USER_A);
  }
}

async function purposes(db: PGlite): Promise<{ purpose: string; recorded_at: string }[]> {
  await db.exec('set session authorization postgres');
  try {
    return (await db.query<{ purpose: string; recorded_at: string }>(
      `select purpose, recorded_at::text recorded_at from public.consent_records order by recorded_at`,
    )).rows;
  } finally {
    await asUser(db, USER_A);
  }
}

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

describe('seven-year consent retention enforcement', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => {
    await asUser(db, USER_A);
    await complete(db);
  });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.consent_records');
  });
  afterAll(async () => { await db?.close(); });

  it('purges only rows strictly older than seven years (before/at/after boundary)', async () => {
    // Deleted owner isolates pure boundary semantics from latest-state cover.
    await db.exec('set session authorization postgres');
    await db.exec(`delete from public.profiles where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'marketing_email', true, isoShift(cutoff, -1));
    await seedConsent(db, USER_A, 'marketing_email', true, cutoff);
    await seedConsent(db, USER_A, 'marketing_email', true, isoShift(cutoff, 1));
    expect(await cleanup(db, asOf)).toBe(1);
    const rows = await purposes(db);
    expect(rows).toHaveLength(2);
    expect(new Date(rows[0].recorded_at).getTime()).toBe(new Date(cutoff).getTime());
  });

  it('preserves the active latest record per purpose no matter its age', async () => {
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'product_analytics', true, isoShift(cutoff, -400));
    expect(await cleanup(db, asOf)).toBe(0);
    expect(await purposes(db)).toHaveLength(1);
  });

  it('purges expired superseded history while keeping current state', async () => {
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'marketing_email', true, isoShift(cutoff, -400));
    await seedConsent(db, USER_A, 'marketing_email', false, new Date().toISOString());
    expect(await cleanup(db, asOf)).toBe(1);
    await db.exec('set session authorization postgres');
    const all = (await db.query<{ granted: boolean }>(`select granted from public.consent_records`)).rows;
    await asUser(db, USER_A);
    expect(all).toEqual([{ granted: false }]);
  });

  it('purges expired history for deleted owners', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`delete from public.profiles where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'community_outcomes', true, isoShift(cutoff, -400));
    await seedConsent(db, USER_A, 'community_outcomes', false, isoShift(cutoff, -300));
    expect(await cleanup(db, asOf)).toBe(2);
    expect(await purposes(db)).toEqual([]);
  });

  it('keeps recent rows for deleted owners', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`delete from public.profiles where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'product_analytics', true, isoShift(cutoff, 30));
    await seedConsent(db, USER_A, 'product_analytics', false, new Date().toISOString());
    expect(await cleanup(db, asOf)).toBe(0);
    expect(await purposes(db)).toHaveLength(2);
  });

  it('handles multiple purposes independently', async () => {
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    // Purpose A: expired superseded + fresh latest -> purge 1, keep latest.
    await seedConsent(db, USER_A, 'marketing_email', true, isoShift(cutoff, -400));
    await seedConsent(db, USER_A, 'marketing_email', false, new Date().toISOString());
    // Purpose B: single expired latest -> covered as current state, survives.
    await seedConsent(db, USER_A, 'product_analytics', true, isoShift(cutoff, -400));
    expect(await cleanup(db, asOf)).toBe(1);
    const rows = await purposes(db);
    expect(rows.map((row) => row.purpose).sort()).toEqual(['marketing_email', 'product_analytics']);
  });

  it('denies the consent retention routine to consumers', async () => {
    const asOf = new Date().toISOString();
    await expect(
      db.query(`select public.consent_retention_cleanup($1::timestamptz)`, [asOf]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('grants consent retention only to the scheduler path', async () => {
    const anon = await db.query<{ can_run: boolean }>(
      `select has_function_privilege('anon', 'public.consent_retention_cleanup(timestamptz)', 'EXECUTE') can_run`,
    );
    const consumer = await db.query<{ can_run: boolean }>(
      `select has_function_privilege('authenticated', 'public.consent_retention_cleanup(timestamptz)', 'EXECUTE') can_run`,
    );
    expect(anon.rows).toEqual([{ can_run: false }]);
    expect(consumer.rows).toEqual([{ can_run: false }]);
  });

  it('lets service_role execute the routine', async () => {
    await db.exec('set session authorization postgres');
    try {
      await db.exec(`create role service_role nologin`);
    } catch {
      // Reused database already has the role; keep going.
    }
    await db.exec(
      `grant execute on function public.consent_retention_cleanup(timestamptz) to service_role`,
    );
    await db.exec('set session authorization service_role');
    try {
      const asOf = new Date().toISOString();
      const rows = await db.query<{ consent_retention_cleanup: number }>(
        `select public.consent_retention_cleanup($1::timestamptz) consent_retention_cleanup`,
        [asOf],
      );
      expect(rows.rows[0].consent_retention_cleanup).toBe(0);
    } finally {
      await asUser(db, USER_A);
    }
  });

  it('keeps post-purge exports correct: surviving rows only, registry unchanged', async () => {
    const asOf = new Date().toISOString();
    const cutoff = await cutoffFor(db, asOf);
    await seedConsent(db, USER_A, 'marketing_email', true, isoShift(cutoff, -400));
    await seedConsent(db, USER_A, 'marketing_email', false, new Date().toISOString());
    expect(await cleanup(db, asOf)).toBe(1);
    await freshAuth(db, USER_A);
    const receipt = (await db.query<{ result: any }>(
      `select public.export_request($1, 'json') result`, [crypto.randomUUID()],
    )).rows[0].result;
    const download = (await db.query<{ result: any }>(
      `select public.export_download($1) result`, [receipt.jobId],
    )).rows[0].result;
    const records = download.document.consentRecords;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ purpose: 'marketing_email', granted: false });
    expect(download.document.schemaVersions).toMatchObject({ consentRecords: 1 });
    const columns = (await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'consent_records' order by ordinal_position`,
    )).rows.map((row) => row.column_name);
    expect(columns).toEqual(['id', 'user_id', 'purpose', 'granted', 'recorded_at']);
  });
});

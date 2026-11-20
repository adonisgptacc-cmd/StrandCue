import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A } from './harness.ts';

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const amr = JSON.stringify([{
    method: 'password',
    timestamp: Math.floor(Date.now() / 1000),
  }]);
  const claims = JSON.stringify({
    sub: userId,
    role: 'authenticated',
    email: `${userId}@example.test`,
    is_anonymous: false,
    amr: JSON.parse(amr),
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function exportRequest(db: PGlite, operationId = crypto.randomUUID(), format = 'json') {
  return (await db.query<{ result: any }>(`select public.export_request($1, $2) result`, [operationId, format])).rows[0].result;
}

async function setExportSizeConfig(db: PGlite, mb: number) {
  await db.exec('set session authorization postgres');
  await db.query(
    `insert into public.strandcue_config (key, value) values ('max_export_size_mb', $1::jsonb) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [`["${mb}"]`]
  );
  await asUser(db, USER_A);
}

describe('export size guard', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await database();
  }, 60_000);

  beforeEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('delete from public.profiles');
    await db.exec('delete from public.consent_records');
    await db.exec('delete from public.recommendation_runs');
    await db.exec('delete from public.protocol_executions');
    await db.exec('delete from public.protocol_execution_events');
    await asUser(db, USER_A);
    // Reset config to default 50 MB for each test
    await setExportSizeConfig(db, 50);
  });

  afterAll(async () => {
    await db?.close();
  });

  it('allows export within size limit', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    
    // Config already set to 50 MB in beforeEach
    const result = await exportRequest(db);
    expect(result.status).toBe('completed');
    expect(result.recordCount).toBeGreaterThanOrEqual(0);
  });

  it('rejects export exceeding configured limit with payload-too-large', async () => {
    await complete(db);
    
    // Set config to 0 MB (0 bytes limit) to ensure any export is rejected
    await setExportSizeConfig(db, 0);
    
    // Re-establish fresh auth after config change
    await freshAuth(db, USER_A);

    await expect(exportRequest(db)).rejects.toThrow(/payload-too-large/);
  });
});
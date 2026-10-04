import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, BASELINE, complete, current, database, mutate, USER_A, USER_B } from './harness.ts';

const DAY = { precision: 'day', value: '2024-01-15' };

async function freshAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const amr = JSON.stringify([{
    method: 'password',
    timestamp: new Date().toISOString(),
  }]);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false, amr: JSON.parse(amr),
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function staleAuth(db: PGlite, userId: string) {
  await asUser(db, userId);
  const claims = JSON.stringify({
    sub: userId, role: 'authenticated', email: `${userId}@example.test`,
    is_anonymous: false,
    amr: [{ method: 'password', timestamp: '2020-01-01T00:00:00.000Z' }],
  });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
}

async function exportRequest(db: PGlite, operationId = crypto.randomUUID(), format = 'json') {
  return (await db.query<{ result: any }>(`select public.export_request($1, $2) result`, [operationId, format])).rows[0].result;
}

describe('export jobs immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('enforces RLS on export tables', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename in ('export_jobs')`,
    );
    expect(rows.rows.map((row) => row.tablename)).toEqual(['export_jobs']);
    const unprotected = await db.query(
      `select relname from pg_class where relname in ('export_jobs') and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('denies direct authenticated writes to export jobs', async () => {
    await complete(db);
    await expect(db.exec(`insert into public.export_jobs(id, owner, format, status) values (gen_random_uuid(), '${USER_A}', 'json', 'completed')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.export_jobs set status = 'completed'`)).rejects.toThrow(/permission denied|violates/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.export_jobs')).rows).toEqual([]);
  });

  it('requires recent authentication to request an export', async () => {
    await complete(db);
    await staleAuth(db, USER_A);
    await expect(exportRequest(db)).rejects.toThrow(/recent-auth-required/i);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    expect(receipt.status).toBe('completed');
  });

  it('generates a complete, owner-scoped dataset', async () => {
    await complete(db);
    await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, patch: { porosity: 'unknown' }, date: DAY });
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    expect(receipt.recordCount).toBeGreaterThan(0);
    const status = await db.query<{ result: any }>(`select public.export_status($1) result`, [receipt.jobId]);
    expect(status.rows[0].result).toMatchObject({ status: 'completed', format: 'json' });
    expect(status.rows[0].result).not.toHaveProperty('document');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const document = download.rows[0].result.document;
    expect(document.profile.username).toBeDefined();
    expect(document.passport.revisions.length).toBeGreaterThan(0);
    // Unknowns round-trip through the export without invented defaults.
    expect(JSON.stringify(document)).toContain('unknown');
    // No foreign records leak in.
    expect(JSON.stringify(document)).not.toContain(USER_B);
  });

  it('is idempotent on same operation key and payload', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const op = crypto.randomUUID();
    const first = await exportRequest(db, op, 'json');
    expect(await exportRequest(db, op, 'json')).toEqual(first);
    await expect(exportRequest(db, op, 'csv')).rejects.toThrow(/operation-conflict|invalid-format/i);
  });

  it('rejects unsupported formats without creating jobs', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    await expect(exportRequest(db, crypto.randomUUID(), 'xml')).rejects.toThrow(/invalid-format/i);
    const jobs = await db.query(`select * from public.export_jobs`);
    expect(jobs.rows).toEqual([]);
  });

  it('generates one CSV file per table with headers', async () => {
    await complete(db);
    await mutate(db);
    await mutate(db, { kind: 'change', revision: 1, patch: { porosity: 'unknown' }, date: DAY });
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db, crypto.randomUUID(), 'csv');
    expect(receipt.status).toBe('completed');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const files = download.rows[0].result.document.files;
    for (const name of ['profile.csv', 'passport_revisions.csv', 'service_revisions.csv', 'activity_revisions.csv', 'user_products.csv', 'user_product_revisions.csv', 'user_tools.csv', 'user_tool_revisions.csv']) {
      expect(Object.keys(files)).toContain(name);
    }
    expect(files['profile.csv'].split('\n')[0]).toBe('username,country,currency,temperature_unit,created_at');
    expect(files['profile.csv']).toContain('user_a');
    expect(files['passport_revisions.csv'].split('\n')[0]).toContain('kind');
    // Two passport revisions exported, unknowns preserved.
    expect(files['passport_revisions.csv']).toContain('unknown');
  });

  it('quotes commas, quotes and newlines in CSV fields', async () => {
    await complete(db);
    await mutate(db, { patch: { ...BASELINE, notes: 'plain, "quoted"' } });
    // Text columns keep real newlines (unlike JSON-escaped patch text).
    const up = crypto.randomUUID();
    await db.query(`select public.shelf_add($1,$2,null,'Brand','Name','shampoo','available',$3,$4::jsonb)`,
      [crypto.randomUUID(), up, 'a,"b\nc', JSON.stringify(DAY)]);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db, crypto.randomUUID(), 'csv');
    const download = await db.query<{ result: any }>(`select public.export_download($1) result`, [receipt.jobId]);
    const files = download.rows[0].result.document.files;
    // Embedded quotes are doubled inside a wrapped field (RFC 4180).
    expect(files['passport_revisions.csv']).toContain('""');
    // Real newline survives inside the quoted text field.
    expect(files['user_products.csv']).toContain('"a,""b\nc"');
  });

  it('keeps CSV idempotent per operation key', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const op = crypto.randomUUID();
    const first = await exportRequest(db, op, 'csv');
    expect(await exportRequest(db, op, 'csv')).toEqual(first);
    await expect(exportRequest(db, op, 'json')).rejects.toThrow(/operation-conflict/i);
  });

  it('hides other owners jobs and enforces download expiry', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(db.query(`select public.export_status($1) result`, [receipt.jobId])).rejects.toThrow(/not-found/i);
    await expect(db.query(`select public.export_download($1) result`, [receipt.jobId])).rejects.toThrow(/not-found/i);
    // Expire the job as the system would after 24h; the owner then gets expiry, not data.
    await db.exec('set session authorization postgres');
    await db.exec(`update public.export_jobs set expires_at = now() - interval '1 hour' where id = '${receipt.jobId}'`);
    await freshAuth(db, USER_A);
    await expect(db.query(`select public.export_download($1) result`, [receipt.jobId])).rejects.toThrow(/download-link-expired/i);
  });

  it('retains receipts while purging expired documents', async () => {
    await complete(db);
    await freshAuth(db, USER_A);
    const receipt = await exportRequest(db);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.export_jobs set created_at = now() - interval '8 days', completed_at = now() - interval '8 days', expires_at = now() - interval '7 days' where id = '${receipt.jobId}'`);
    await db.exec(`select public.export_retention_cleanup()`);
    const row = await db.query<{ document: unknown; status: string }>(`select document, status from public.export_jobs where id = '${receipt.jobId}'`);
    expect(row.rows[0].document).toBeNull();
    expect(row.rows[0].status).toBe('completed');
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

interface RunInput {
  requestId?: string;
  fingerprint?: string;
  asOf?: string;
  engineVersion?: string;
  bundleId?: string;
  bundleVersion?: string;
  status?: string;
  input?: unknown;
  decision?: unknown;
}

function runInput(overrides: RunInput = {}): unknown[] {
  return [
    overrides.requestId ?? crypto.randomUUID(),
    overrides.fingerprint ?? 'f'.repeat(64),
    overrides.asOf ?? '2026-10-11T09:00:00.000Z',
    overrides.engineVersion ?? '1',
    overrides.bundleId ?? 'bundle-synthetic',
    overrides.bundleVersion ?? '1',
    overrides.status ?? 'content_pending',
    JSON.stringify(overrides.input ?? { requestId: 'r', goal: 'basic_wash' }),
    JSON.stringify(overrides.decision ?? { status: 'ready', steps: [] }),
  ];
}

async function record(db: PGlite, overrides: RunInput = {}) {
  const params = runInput(overrides);
  return (
    await db.query<{ result: any }>(
      `select public.record_recommendation_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result`,
      params,
    )
  ).rows[0].result;
}

async function listRuns(db: PGlite): Promise<any[]> {
  return (await db.query('select * from public.recommendation_runs')).rows;
}

async function recordTrusted(db: PGlite, overrides: RunInput = {}) {
  const params = runInput(overrides);
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    return (
      await db.query<{ result: any }>(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result`,
        params,
      )
    ).rows[0].result;
  } finally {
    await asUser(db, USER_A);
  }
}

describe('recommendation runs private immutable audit', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.recommendation_runs');
  });
  afterAll(async () => { await db?.close(); });

  it('records a run owned by the authenticated user', async () => {
    await complete(db);
    const result = await record(db, { requestId: '11111111-1111-4111-8111-111111111111' });
    expect(result).toMatchObject({
      requestId: '11111111-1111-4111-8111-111111111111',
      status: 'content_pending',
      engineVersion: '1',
    });
    const rows = await listRuns(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_A);
  });

  it('takes the owner from auth.uid and never from an argument', async () => {
    await complete(db);
    const publicSignature = (
      await db.query<{ args: string[] }>(
        `select pg_get_function_arguments(oid) args from pg_proc
         where proname = 'record_recommendation_run' and pronamespace = 'public'::regnamespace`,
      )
    ).rows[0].args;
    expect(publicSignature).not.toMatch(/owner|user_id/i);
    expect(publicSignature).toMatch(/p_request_id/);
    // No trusted-path selector either: the grant on the trusted function is
    // the only gate, so there is nothing for a client to forge. (The
    // internal core carries the enforcement flag but has no grants to
    // anon/authenticated, proven by the grant tests below.)
    const privateSignatures = (
      await db.query<{ args: string[] }>(
        `select pg_get_function_arguments(oid) args from pg_proc
         where proname in ('record_run','record_trusted_run')
           and pronamespace = 'strandcue_private'::regnamespace`,
      )
    ).rows.map(row => row.args);
    expect(privateSignatures).toHaveLength(2);
    for (const signature of privateSignatures) {
      expect(signature).not.toMatch(/owner|user_id/i);
      expect(signature).not.toMatch(/trusted|allow_executable|executable|role|path/i);
    }
  });

  it('ignores any attempt to write another owner row directly', async () => {
    await complete(db);
    await expect(
      db.exec(
        `insert into public.recommendation_runs(user_id, request_id, input_fingerprint, as_of, engine_version, bundle_id, bundle_version, status, input, decision)
         values ('${USER_B}','22222222-2222-4222-8222-222222222222','${'f'.repeat(64)}', now(), '1','b','1','ready','{}'::jsonb,'{}'::jsonb)`,
      ),
    ).rejects.toThrow(/permission denied|row-level security|violates/i);
  });

  it('denies anonymous callers', async () => {
    await asUser(db, null);
    await expect(record(db)).rejects.toThrow(/authentication|permission denied/i);
  });

  it('hides another owner runs from reads', async () => {
    await complete(db);
    await record(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    expect(await listRuns(db)).toEqual([]);
  });

  it('is idempotent for the same request id and fingerprint', async () => {
    await complete(db);
    const requestId = crypto.randomUUID();
    const first = await record(db, { requestId });
    const second = await record(db, { requestId });
    expect(second).toEqual(first);
    expect(await listRuns(db)).toHaveLength(1);
  });

  it('raises a stable conflict when the same request id has a different fingerprint', async () => {
    await complete(db);
    const requestId = crypto.randomUUID();
    await record(db, { requestId, fingerprint: 'a'.repeat(64) });
    await expect(record(db, { requestId, fingerprint: 'b'.repeat(64) })).rejects.toThrow(
      /run-conflict/i,
    );
    expect(await listRuns(db)).toHaveLength(1);
  });

  it('raises a conflict when replayed content differs even with the same fingerprint', async () => {
    await complete(db);
    const requestId = crypto.randomUUID();
    const fingerprint = 'c'.repeat(64);
    await record(db, { requestId, fingerprint, input: { goal: 'basic_wash' } });
    await expect(
      record(db, { requestId, fingerprint, input: { goal: 'something_else' } }),
    ).rejects.toThrow(/run-conflict/i);
  });

  it('caps input and decision payloads at 256 KiB', async () => {
    await complete(db);
    const oversized = 'x'.repeat(300_000);
    await expect(record(db, { input: { blob: oversized } })).rejects.toThrow(/payload-too-large/i);
    await expect(record(db, { decision: { blob: oversized } })).rejects.toThrow(/payload-too-large/i);
    expect(await listRuns(db)).toEqual([]);
    await expect(record(db, { input: { blob: 'x'.repeat(200_000) } })).resolves.toBeDefined();
  });

  it('restricts status to engine or orchestration result statuses', async () => {
    await complete(db);
    for (const status of ['needs_setup', 'content_pending', 'needs_input', 'rule_conflict', 'unsupported', 'source_error']) {
      await expect(record(db, { status })).resolves.toBeDefined();
    }
    await expect(record(db, { status: 'definitely_not_a_status' })).rejects.toThrow(/unknown-status/i);
  });

  it('rejects malformed protocol payloads instead of storing them verbatim', async () => {
    await complete(db);
    await expect(record(db, { input: 5 })).rejects.toThrow(/malformed-protocol/i);
    await expect(record(db, { input: [1, 2, 3] })).rejects.toThrow(/malformed-protocol/i);
    await expect(record(db, { decision: 'ready' })).rejects.toThrow(/malformed-protocol/i);
    await expect(record(db, { decision: [{ status: 'ready' }] })).rejects.toThrow(
      /malformed-protocol/i,
    );
    expect(await listRuns(db)).toEqual([]);
  });

  it('never accepts an email, username, or token in the stored payload', async () => {
    await complete(db);
    const result = await record(db, {
      input: { email: 'owner@example.test', username: 'owner', accessToken: 'secret' },
    });
    expect(result).not.toMatchObject({ email: 'owner@example.test' });
    // The payload is stored verbatim for reproducibility; the contract is that
    // the caller never puts identity or secrets in it. Persisted rows stay
    // owner-scoped, so the risk is confined to the owner who wrote them.
    const rows = await listRuns(db);
    expect(rows[0].user_id).toBe(USER_A);
  });

  it('is immutable: rows cannot be updated or deleted by the owner', async () => {
    await complete(db);
    await record(db);
    await expect(
      db.exec(`update public.recommendation_runs set status = 'unsupported'`),
    ).rejects.toThrow(/permission denied|row-level security/i);
    await expect(db.exec(`delete from public.recommendation_runs`)).rejects.toThrow(
      /permission denied|row-level security/i,
    );
    expect(await listRuns(db)).toHaveLength(1);
  });

  it('carries a server-side created_at the caller cannot set', async () => {
    await complete(db);
    await record(db);
    const rows = await listRuns(db);
    expect(rows[0].created_at).toBeTruthy();
    const columns = (
      await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'recommendation_runs'`,
      )
    ).rows.map(row => row.column_name);
    expect(columns).toContain('created_at');
  });

  it('hides a deleting owner runs from reads', async () => {
    await complete(db);
    await record(db);
    expect(await listRuns(db)).toHaveLength(1);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'deleting' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    expect(await listRuns(db)).toEqual([]);
    await db.exec('set session authorization postgres');
    await db.exec(`update public.profiles set account_status = 'active' where user_id = '${USER_A}'`);
    await asUser(db, USER_A);
    expect(await listRuns(db)).toHaveLength(1);
  });

it('protects the table with forced row level security', async () => {
    const unprotected = await db.query(
      `select relname from pg_class where relname = 'recommendation_runs' and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('grants execution to authenticated but never to anon or PUBLIC', async () => {
    await db.exec('set session authorization postgres');
    const rows = await db.query<{ grantee: string; privilege_type: string }>(
      `select coalesce(r.rolname, 'PUBLIC') grantee, x.privilege_type
       from pg_proc p, aclexplode(p.proacl) x
       left join pg_roles r on r.oid = x.grantee
       where p.proname = 'record_recommendation_run'
         and p.pronamespace = 'public'::regnamespace
         and x.privilege_type = 'EXECUTE'`,
    );
    const grantees = rows.rows.map(row => row.grantee);
    expect(grantees).toContain('authenticated');
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('PUBLIC');
    await asUser(db, USER_A);
  });

  it('requires an active account to record a run', async () => {
    await expect(record(db)).rejects.toThrow(/account-not-active/i);
  });

  it('refuses to mint a ready decision on the authenticated path', async () => {
    await complete(db);
    await expect(record(db, { status: 'ready' })).rejects.toThrow(/executable-status-forbidden/i);
    expect(await listRuns(db)).toEqual([]);
  });

  it('persists a ready decision only through the trusted mutator path', async () => {
    await complete(db);
    const result = await recordTrusted(db, {
      requestId: '33333333-3333-4333-8333-333333333333',
      status: 'ready',
    });
    expect(result).toMatchObject({
      requestId: '33333333-3333-4333-8333-333333333333',
      status: 'ready',
    });
    const rows = await listRuns(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(USER_A);
    expect(rows[0].status).toBe('ready');
  });

  it('denies the trusted path to authenticated and anonymous callers', async () => {
    await complete(db);
    await expect(
      db.query(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        runInput({ status: 'ready' }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await asUser(db, null);
    await expect(
      db.query(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        runInput({ status: 'ready' }),
      ),
    ).rejects.toThrow(/permission denied/i);
    await asUser(db, USER_A);
    expect(await listRuns(db)).toEqual([]);
  });

  it('grants the trusted path and the shared core to the mutator only', async () => {
    await db.exec('set session authorization postgres');
    for (const proname of ['record_trusted_run', 'record_run_core']) {
      const rows = await db.query<{ grantee: string; privilege_type: string }>(
        `select coalesce(r.rolname, 'PUBLIC') grantee, x.privilege_type
         from pg_proc p, aclexplode(p.proacl) x
         left join pg_roles r on r.oid = x.grantee
         where p.proname = '${proname}'
           and p.pronamespace = 'strandcue_private'::regnamespace
           and x.privilege_type = 'EXECUTE'`,
      );
      const grantees = rows.rows.map(row => row.grantee);
      expect(grantees).toContain('strandcue_mutator');
      expect(grantees).not.toContain('authenticated');
      expect(grantees).not.toContain('anon');
      expect(grantees).not.toContain('PUBLIC');
    }
    await asUser(db, USER_A);
  });
});
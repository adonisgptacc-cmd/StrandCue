import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

import { asUser, complete, database, mutate, USER_A, USER_B } from './harness.ts';

const REQUEST = '44444444-4444-4444-8444-444444444444';
const STARTED = '2026-10-29T08:00:00.000Z';

async function asService(db: PGlite): Promise<void> {
  await db.exec('set session authorization postgres');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", ['']);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('set session authorization service_role');
}

async function revision(db: PGlite): Promise<number> {
  return Number((await db.query<{ value: number }>('select public.get_guidance_source_revision() value')).rows[0].value);
}

async function record(db: PGlite, options: { owner?: string; request?: string; status?: string; decision?: unknown; sourceRevision?: number } = {}) {
  const owner = options.owner ?? USER_A;
  const request = options.request ?? REQUEST;
  const decision = options.decision ?? { status: 'ready', requestId: request, steps: [{ stepId: 'step-1', position: 1, action: 'wait', waitSeconds: 30 }] };
  return (await db.query<{ receipt: Record<string, unknown> }>(
    `select public.record_server_recommendation_run($1::uuid,$2::uuid,$3,$4::timestamptz,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::bigint) receipt`,
    [owner, request, 'a'.repeat(64), STARTED, '1', 'synthetic-bundle', '2', options.status ?? 'ready',
      JSON.stringify({ requestId: request, asOf: STARTED, goal: 'basic_wash' }), JSON.stringify(decision), options.sourceRevision ?? 0],
  )).rows[0].receipt;
}

describe('service-only trusted recommendation write', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('denies authenticated and anonymous callers even when they know an owner ID', async () => {
    await expect(record(db)).rejects.toThrow(/permission denied/i);
    await asUser(db, null);
    await expect(record(db)).rejects.toThrow(/permission denied/i);
  });

  it('limits each authenticated owner to 30 Today evaluator requests per hour', async () => {
    for (let count = 0; count < 30; count += 1) {
      await expect(db.query('select public.reserve_today_guidance_request()')).resolves.toBeDefined();
    }
    await expect(db.query('select public.reserve_today_guidance_request()')).rejects.toThrow(/rate-limit/i);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await expect(db.query('select public.reserve_today_guidance_request()')).resolves.toBeDefined();
    await asUser(db, null);
    await expect(db.query('select public.reserve_today_guidance_request()')).rejects.toThrow(/permission denied|authentication-required/i);
  });

  it('stores only a service-generated ready decision as trusted and replays identically', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    const first = await record(db, { sourceRevision });
    expect(first).toMatchObject({ requestId: REQUEST, status: 'ready' });
    expect(await record(db, { sourceRevision })).toEqual(first);
    await db.exec('set session authorization postgres');
    const rows = (await db.query<{ user_id: string; trusted: boolean }>('select user_id, trusted from public.recommendation_runs')).rows;
    expect(rows).toEqual([{ user_id: USER_A, trusted: true }]);
  });

  it('rejects inactive owners, mismatched decision identity and conflicting replays', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await expect(record(db, { owner: USER_B })).rejects.toThrow(/account-not-active/i);
    await expect(record(db, { decision: { status: 'ready', requestId: USER_B, steps: [] } })).rejects.toThrow(/malformed-protocol/i);
    await record(db, { sourceRevision });
    await expect(record(db, { status: 'unsupported' })).rejects.toThrow(/run-conflict|invalid-operation/i);
  });

  it('rejects an old source revision after a Passport correction', async () => {
    await mutate(db);
    await asService(db);
    await expect(record(db, { sourceRevision: 0 })).rejects.toThrow(/source-changed/i);
  });

  it('keeps source revisions owner-scoped', async () => {
    const ownerRevision = await revision(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    await mutate(db);
    const otherRevision = await revision(db);
    expect(otherRevision).toBeGreaterThan(0);
    await asUser(db, USER_A);
    expect(await revision(db)).toBe(ownerRevision);
    await asUser(db, null);
    await expect(revision(db)).rejects.toThrow(/permission denied|authentication-required/i);
  });

  it('refuses malformed trusted steps before writing a run', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await expect(record(db, {
      sourceRevision,
      decision: { status: 'ready', requestId: REQUEST, steps: [{ stepId: '', position: 0, action: 'wait' }] },
    })).rejects.toThrow(/malformed-protocol/i);
    await expect(record(db, {
      sourceRevision,
      decision: { status: 'ready', requestId: REQUEST, steps: [{ stepId: 'step-1', action: 'wait' }] },
    })).rejects.toThrow(/malformed-protocol/i);
    await expect(record(db, {
      sourceRevision,
      decision: { status: 'ready', requestId: REQUEST, steps: [
        { stepId: 'same', position: 1, action: 'wait' },
        { stepId: 'same', position: 2, action: 'wait' },
      ] },
    })).rejects.toThrow(/malformed-protocol/i);
  });

  it('refuses an unbound heat action at the database trusted writer', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await expect(record(db, { sourceRevision, decision: {
      status: 'ready', requestId: REQUEST,
      steps: [{ stepId: 'heat-1', position: 1, action: 'heat',
        heatActionRef: { publicationId: '11111111-1111-4111-8111-111111111111',
          publicationDigest: `sha256:${'a'.repeat(64)}` } }],
    } })).rejects.toThrow(/invalid-heat-binding/);
    await db.exec('set session authorization postgres');
    expect((await db.query('select id from public.recommendation_runs')).rows).toEqual([]);
  });

  it('refuses a new start of an unbound heat run stored before the hold', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await record(db, { sourceRevision });
    await db.exec('set session authorization postgres');
    try {
      await db.exec('alter table public.recommendation_runs disable trigger all');
      await db.query(`update public.recommendation_runs set decision=$1::jsonb where request_id=$2`, [
        JSON.stringify({ status: 'ready', requestId: REQUEST, steps: [
          { stepId: 'heat-1', position: 1, action: 'heat', heatActionRef: {
            publicationId: '11111111-1111-4111-8111-111111111111',
            publicationDigest: `sha256:${'a'.repeat(64)}`,
          } },
        ] }), REQUEST,
      ]);
    } finally {
      await db.exec('alter table public.recommendation_runs enable trigger all');
    }
    await asUser(db, USER_A);
    await expect(db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)',
      [crypto.randomUUID(), crypto.randomUUID(), REQUEST, new Date().toISOString()])).rejects.toThrow(/invalid-heat-binding/);
    await db.exec('set session authorization postgres');
    expect((await db.query('select id from public.protocol_executions')).rows).toEqual([]);
  });

  it('replays an identical stored receipt after source changes without starting it', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    const first = await record(db, { sourceRevision });
    await asUser(db, USER_A);
    await mutate(db);
    await asService(db);
    expect(await record(db, { sourceRevision })).toEqual(first);
  });

  it('refuses a new protocol start after the owner corrects a source fact', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await record(db, { sourceRevision });
    await asUser(db, USER_A);
    await mutate(db);
    await expect(db.query(
      'select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)',
      [crypto.randomUUID(), crypto.randomUUID(), REQUEST, new Date().toISOString()],
    )).rejects.toThrow(/source-changed/i);
    await db.exec('set session authorization postgres');
    expect((await db.query('select id from public.protocol_executions')).rows).toEqual([]);
    expect((await db.query('select id from public.protocol_execution_events')).rows).toEqual([]);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

import { asUser, complete, database, USER_A } from './harness.ts';

const REQUEST = '44444444-4444-4444-8444-444444444444';
const STARTED = '2026-10-29T08:00:00.000Z';

async function asService(db: PGlite): Promise<void> {
  await db.exec('set session authorization postgres');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", ['']);
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('set session authorization service_role');
}

async function asPostgres(db: PGlite): Promise<void> {
  await db.exec('set session authorization postgres');
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

describe('canonical decision hash', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); await complete(db); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
  });
  afterAll(async () => { await db?.close(); });

  it('stores SHA-256 hash of canonical decision JSON on trusted run creation', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await record(db, { sourceRevision });

    // Switch to postgres to query (service_role has no SELECT on recommendation_runs)
    await asPostgres(db);

    // Verify hash column populated
    const rows = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST],
    );

    expect(rows.rows.length).toBe(1);
    const hash = rows.rows[0].decision_hash;
    expect(hash).toBeDefined();
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('protocol execution inherits hash from source run', async () => {
    const sourceRevision = await revision(db);
    await asService(db);
    await record(db, { sourceRevision });

    // Start execution as authenticated user
    const opId = crypto.randomUUID();
    const execId = crypto.randomUUID();
    await asUser(db, USER_A);
    await db.query('select public.start_protocol_execution($1::uuid,$2::uuid,$3::uuid,$4::timestamptz)',
      [opId, execId, REQUEST, new Date().toISOString()]);

    // Switch to postgres to query both tables
    await asPostgres(db);

    // Verify execution has same decision_hash
    const execRows = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.protocol_executions where execution_id = $1',
      [execId],
    );

    const runRows = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST],
    );

    expect(execRows.rows.length).toBe(1);
    expect(runRows.rows.length).toBe(1);
    expect(execRows.rows[0].decision_hash).toBe(runRows.rows[0].decision_hash);
  });

  it('hash is deterministic for replayed identical request', async () => {
    const sourceRevision = await revision(db);
    await asService(db);

    const decision = { status: 'ready', requestId: REQUEST, steps: [{ stepId: 'step-1', position: 1, action: 'wait', waitSeconds: 30 }] };
    await record(db, { sourceRevision, decision });

    await asPostgres(db);
    const run1 = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST],
    );

    // Replay the exact same request - should return same receipt and same hash
    await asService(db);
    await record(db, { sourceRevision, decision });

    await asPostgres(db);
    const run2 = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST],
    );

    expect(run1.rows[0].decision_hash).toBe(run2.rows[0].decision_hash);
  });

  it('different decisions produce different hashes', async () => {
    const sourceRevision = await revision(db);
    await asService(db);

    const decision1 = { status: 'ready', requestId: REQUEST, steps: [{ stepId: 'step-1', position: 1, action: 'wait', waitSeconds: 30 }] };
    await record(db, { sourceRevision, decision: decision1 });

    await asPostgres(db);
    const run1 = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST],
    );

    // Create another run with different decision
    const REQUEST2 = '55555555-5555-5555-8555-555555555555';
    const decision2 = { status: 'ready', requestId: REQUEST2, steps: [{ stepId: 'step-1', position: 1, action: 'wait', waitSeconds: 60 }] };
    await asService(db);
    await record(db, { sourceRevision, request: REQUEST2, decision: decision2 });

    await asPostgres(db);
    const run2 = await db.query<{ decision_hash: string }>(
      'select decision_hash from public.recommendation_runs where request_id = $1',
      [REQUEST2],
    );

    expect(run1.rows[0].decision_hash).not.toBe(run2.rows[0].decision_hash);
  });
});
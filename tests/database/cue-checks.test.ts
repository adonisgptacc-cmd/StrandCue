import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B, UNVERIFIED } from './harness.ts';

// Owner-only append-only Cue Check persistence (Task 4.2, CC-01..CC-03).
// Every write goes through the hardened RPC cores; direct table writes,
// foreign identifiers and derived client facts are refused. Confirmed
// actual use derives only from the stored execution snapshot.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nowIso(): string {
  return new Date().toISOString();
}

function stepFixture(stepId: string, position: number, overrides: Record<string, unknown> = {}) {
  return {
    stepId,
    position,
    action: `Test action ${position}`,
    productId: null,
    productVersionId: null,
    toolId: null,
    toolVersionId: null,
    waitSeconds: null,
    rinse: null,
    reasons: ['test reason'],
    ...overrides,
  };
}

function decisionFixture(requestId: string, options: {
  stepCount?: number;
  stepOverrides?: Record<string, Record<string, unknown>>;
} = {}) {
  const stepCount = options.stepCount ?? 2;
  return {
    status: 'ready',
    requestId,
    steps: Array.from({ length: stepCount }, (_, index) =>
      stepFixture(`step-${index + 1}`, index + 1, options.stepOverrides?.[`step-${index + 1}`] ?? {})),
  };
}

async function privileged<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
  restoreTo: string = USER_A,
): Promise<{ rows: T[] }> {
  await db.exec('set session authorization postgres');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await asUser(db, restoreTo);
  }
}

async function seedRun(db: PGlite, owner: string, options: {
  requestId?: string;
  decision?: unknown;
  input?: Record<string, unknown>;
} = {}) {
  const requestId = options.requestId ?? crypto.randomUUID();
  const decision = options.decision ?? decisionFixture(requestId);
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    await db.query(
      `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
      [
        requestId,
        'd'.repeat(64),
        '2026-10-13T08:00:00.000Z',
        '1',
        'bundle-synthetic',
        '1',
        'ready',
        JSON.stringify(options.input ?? { requestId, goal: 'basic_wash' }),
        JSON.stringify(decision),
      ],
    );
  } finally {
    await asUser(db, owner);
  }
  return requestId;
}

async function startExecution(db: PGlite, options: {
  runId: string;
  executionId?: string;
  operationId?: string;
  startedAt?: string;
}) {
  return (await db.query<{ result: any }>(
    `select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result`,
    [
      options.operationId ?? crypto.randomUUID(),
      options.executionId ?? crypto.randomUUID(),
      options.runId,
      options.startedAt ?? nowIso(),
    ],
  )).rows[0].result;
}

async function executionCommand(db: PGlite, options: {
  executionId: string;
  expectedRevision?: number;
  command: unknown;
  operationId?: string;
  at?: string;
}) {
  return (await db.query<{ result: any }>(
    `select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz) result`,
    [
      options.operationId ?? crypto.randomUUID(),
      options.executionId,
      options.expectedRevision ?? 0,
      JSON.stringify(options.command),
      options.at ?? nowIso(),
    ],
  )).rows[0].result;
}

/** Seeds a run plus an execution in the requested terminal shape. */
async function seedTerminalExecution(db: PGlite, options: {
  mode?: 'completed' | 'abandoned' | 'in_progress';
  owner?: string;
  requestId?: string;
  decision?: unknown;
  input?: Record<string, unknown>;
  confirmSteps?: string[];
  extraCommands?: unknown[];
} = {}) {
  const owner = options.owner ?? USER_A;
  await asUser(db, owner);
  const requestId = options.requestId ?? crypto.randomUUID();
  await seedRun(db, owner, {
    requestId,
    decision: options.decision ?? decisionFixture(requestId),
    input: options.input,
  });
  const executionId = crypto.randomUUID();
  await startExecution(db, { runId: requestId, executionId });
  let revision = 0;
  const mode = options.mode ?? 'completed';
  const confirmSteps = options.confirmSteps
    ?? (mode === 'completed' ? ['step-1', 'step-2'] : mode === 'abandoned' ? ['step-1'] : []);
  for (const stepId of confirmSteps) {
    await executionCommand(db, {
      executionId,
      expectedRevision: revision,
      command: { kind: 'complete-step', stepId },
    });
    revision += 1;
  }
  for (const command of options.extraCommands ?? []) {
    await executionCommand(db, { executionId, expectedRevision: revision, command });
    revision += 1;
  }
  if (mode !== 'in_progress') {
    await executionCommand(db, {
      executionId,
      expectedRevision: revision,
      command: mode === 'abandoned'
        ? { kind: 'abandon', reason: 'owner stopped' }
        : { kind: 'complete' },
    });
  }
  return { runId: requestId, executionId };
}

function immediateObservation(overrides: Record<string, unknown> = {}) {
  return { timing: 'immediate', observedAt: nowIso(), overallResult: 'better', ...overrides };
}

function delayedObservation(overrides: Record<string, unknown> = {}) {
  return { timing: 'delayed', observedAt: nowIso(), styleLongevity: 'longer', ...overrides };
}

async function recordCue(db: PGlite, options: {
  executionId: string;
  operationId?: string;
  observation?: Record<string, unknown>;
}) {
  return (await db.query<{ result: any }>(
    'select public.record_cue_check($1,$2,$3::jsonb) result',
    [
      options.operationId ?? crypto.randomUUID(),
      options.executionId,
      JSON.stringify(options.observation ?? immediateObservation()),
    ],
  )).rows[0].result;
}

async function correctCue(db: PGlite, options: {
  recordId: string;
  expectedRevision?: number;
  operationId?: string;
  observation?: Record<string, unknown>;
  reason?: string;
}) {
  return (await db.query<{ result: any }>(
    'select public.correct_cue_check($1,$2,$3,$4::jsonb,$5) result',
    [
      options.operationId ?? crypto.randomUUID(),
      options.recordId,
      options.expectedRevision ?? 1,
      JSON.stringify(options.observation ?? immediateObservation({ notes: 'corrected' })),
      options.reason ?? 'correcting a mis-tap',
    ],
  )).rows[0].result;
}

async function voidCue(db: PGlite, options: {
  recordId: string;
  expectedRevision?: number;
  operationId?: string;
  reason?: string;
}) {
  return (await db.query<{ result: any }>(
    'select public.void_cue_check($1,$2,$3,$4) result',
    [
      options.operationId ?? crypto.randomUUID(),
      options.recordId,
      options.expectedRevision ?? 1,
      options.reason ?? 'recorded against the wrong execution',
    ],
  )).rows[0].result;
}

async function listCues(db: PGlite, limit: unknown = 25, cursor: unknown = null) {
  return (await db.query<{ result: any }>(
    'select public.list_cue_checks($1,$2::jsonb) result',
    [limit as number, JSON.stringify(cursor)],
  )).rows[0].result;
}

async function getCue(db: PGlite, recordId: string) {
  return (await db.query<{ result: any }>(
    'select public.get_cue_check($1) result',
    [recordId],
  )).rows[0].result;
}

async function failureOf(run: () => Promise<unknown>): Promise<{ message: string; code: string | null }> {
  try {
    await run();
  } catch (error) {
    const shaped = error as { message: string; code?: string };
    return { message: shaped.message, code: shaped.code ?? null };
  }
  throw new Error('expected the call to fail, but it succeeded');
}

async function cueSnapshot(db: PGlite) {
  const result = await privileged<{
    records: number;
    revisions: number;
    operations: number;
    heads: string;
  }>(db, `
    select
      (select count(*) from public.cue_checks)::int as records,
      (select count(*) from public.cue_check_revisions)::int as revisions,
      (select count(*) from strandcue_private.cue_check_operations)::int as operations,
      (select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.record_id), ''))
         from public.cue_checks x) as heads`);
  return result.rows[0];
}

const AUTHORITY_TABLES = [
  'public.brands', 'public.products', 'public.product_versions', 'public.product_claims',
  'public.product_sources', 'public.product_verification_events', 'public.product_publications',
  'public.product_claim_evidence',
  'public.tool_brands', 'public.tools', 'public.tool_versions', 'public.tool_claims',
  'public.tool_sources', 'public.tool_verification_events', 'public.tool_publications',
  'public.tool_claim_evidence',
  'public.recommendation_runs', 'public.protocol_executions', 'public.protocol_execution_events',
];

async function authorityDigest(db: PGlite): Promise<string> {
  const parts: string[] = [];
  for (const table of AUTHORITY_TABLES) {
    const digest = await privileged<{ d: string }>(
      db,
      `select md5(coalesce(string_agg(to_jsonb(t)::text, '|' order by to_jsonb(t)::text), '')) as d from ${table} t`,
    );
    parts.push(`${table}:${digest.rows[0].d}`);
  }
  return parts.join('|');
}

describe('Cue Check persistence (owner-only, append-only)', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 120_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('delete from public.profiles');
  });
  afterAll(async () => { await db?.close(); });

  describe('schema, RLS and grants', () => {
    it('forces row level security on every Cue Check table', async () => {
      const unprotected = await db.query(`
        select c.relname from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('public', 'strandcue_private')
          and c.relname in ('cue_checks', 'cue_check_revisions', 'cue_check_operations')
          and (not c.relrowsecurity or not c.relforcerowsecurity)`);
      expect(unprotected.rows).toEqual([]);
    });

    it('keeps the operation ledger private and direct consumer writes impossible', async () => {
      const grants = await db.query(`
        select
          has_table_privilege('authenticated','public.cue_checks','SELECT') owner_read,
          has_table_privilege('authenticated','public.cue_checks','INSERT,UPDATE,DELETE') owner_write,
          has_table_privilege('authenticated','public.cue_check_revisions','SELECT') history_read,
          has_table_privilege('authenticated','public.cue_check_revisions','INSERT,UPDATE,DELETE') history_write,
          has_table_privilege('anon','public.cue_checks','SELECT') anon_read,
          has_table_privilege('authenticated','strandcue_private.cue_check_operations','SELECT,INSERT,UPDATE,DELETE') ledger_access,
          has_table_privilege('anon','strandcue_private.cue_check_operations','SELECT,INSERT,UPDATE,DELETE') anon_ledger_access`);
      expect(grants.rows).toEqual([{
        owner_read: true, owner_write: false, history_read: true, history_write: false,
        anon_read: false, ledger_access: false, anon_ledger_access: false,
      }]);
    });

    it('denies direct authenticated writes to Cue Check tables', async () => {
      await complete(db);
      await expect(db.exec(
        `insert into public.cue_checks(user_id, record_id) values ('${USER_A}', '${crypto.randomUUID()}')`,
      )).rejects.toThrow(/permission denied|violates/i);
      await expect(db.exec('update public.cue_checks set revision = 99')).rejects.toThrow(/permission denied|violates/i);
      await expect(db.exec('delete from public.cue_check_revisions')).rejects.toThrow(/permission denied|violates/i);
    });

    it('pins public wrappers and private cores to the hardened shape', async () => {
      const wrappers = await db.query<{ search_path_pinned: boolean; owner: string }>(`
        select (p.proconfig @> array['search_path=""']) as search_path_pinned,
               pg_get_userbyid(p.proowner) as owner
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in
          ('record_cue_check','correct_cue_check','void_cue_check','list_cue_checks','get_cue_check')`);
      expect(wrappers.rows).toHaveLength(5);
      for (const row of wrappers.rows) {
        expect(row.search_path_pinned).toBe(true);
        expect(row.owner).toBe('migration_admin');
      }
      const cores = await db.query<{ search_path_pinned: boolean; owner: string }>(`
        select (p.proconfig @> array['search_path=""']) as search_path_pinned,
               pg_get_userbyid(p.proowner) as owner
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'strandcue_private' and p.proname in
          ('cue_check_create_core','cue_check_correct_core','cue_check_void_core',
           'cue_check_list_core','cue_check_detail_core')`);
      expect(cores.rows).toHaveLength(5);
      for (const row of cores.rows) {
        expect(row.search_path_pinned).toBe(true);
        expect(row.owner).toBe('strandcue_mutator');
      }
      const anonExecutes = await db.query(`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'strandcue_private')
          and p.proname in ('record_cue_check','correct_cue_check','void_cue_check','list_cue_checks','get_cue_check',
                           'cue_check_create_core','cue_check_correct_core','cue_check_void_core',
                           'cue_check_list_core','cue_check_detail_core',
                           'validate_cue_check_observation','cue_check_confirmed_steps')
          and has_function_privilege('anon', p.oid, 'EXECUTE')`);
      expect(anonExecutes.rows).toEqual([]);
      const helpersExecutable = await db.query(`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'strandcue_private'
          and p.proname in ('validate_cue_check_observation','cue_check_confirmed_steps')
          and (has_function_privilege('anon', p.oid, 'EXECUTE')
               or has_function_privilege('authenticated', p.oid, 'EXECUTE'))`);
      expect(helpersExecutable.rows).toEqual([]);
    });
  });

  describe('authentication and account state', () => {
    it('refuses anonymous callers on every entry point', async () => {
      await asUser(db, null);
      const recordId = crypto.randomUUID();
      // Anonymous callers have no EXECUTE grant, so PostgreSQL refuses them
      // before a wrapper body can expose any application-level distinction.
      await expect(recordCue(db, { executionId: crypto.randomUUID() })).rejects.toThrow(/permission denied/i);
      await expect(correctCue(db, { recordId })).rejects.toThrow(/permission denied/i);
      await expect(voidCue(db, { recordId })).rejects.toThrow(/permission denied/i);
      await expect(listCues(db)).rejects.toThrow(/permission denied/i);
      await expect(getCue(db, recordId)).rejects.toThrow(/permission denied/i);
      await expect(db.exec('select * from public.cue_checks')).rejects.toThrow(/permission denied/i);
    });

    it('requires an active account', async () => {
      await asUser(db, UNVERIFIED);
      await expect(recordCue(db, { executionId: crypto.randomUUID() })).rejects.toThrow(/account-not-active/i);
      await expect(listCues(db)).rejects.toThrow(/account-not-active/i);
    });
  });

  describe('create and authoritative execution binding', () => {
    it('records an immediate Cue Check against a completed execution', async () => {
      await complete(db);
      const { runId, executionId } = await seedTerminalExecution(db, { mode: 'completed' });
      const observation = immediateObservation({ frizz: 'less', notes: 'felt smoother' });
      const receipt = await recordCue(db, { executionId, observation });
      expect(receipt).toMatchObject({
        executionId,
        recommendationRunId: runId,
        goal: 'basic_wash',
        timing: 'immediate',
        lifecycle: 'active',
        revision: 1,
        executionStatus: 'completed',
      });
      expect(receipt.recordId).toMatch(UUID_RE);
      expect(receipt.observation).toEqual(observation);
      expect(receipt.confirmedSteps).toHaveLength(2);
      expect(receipt.confirmedSteps.map((step: any) => step.stepId)).toEqual(['step-1', 'step-2']);
      for (const step of receipt.confirmedSteps) {
        expect(step.position).toBeGreaterThanOrEqual(1);
        expect(step.confirmedAt).toBeTruthy();
        expect(step.action).toBeTypeOf('string');
      }
      // The server receipt time is recorded separately from the owner-observed
      // time and never precedes it.
      expect(new Date(receipt.receivedAt).getTime())
        .toBeGreaterThanOrEqual(new Date(observation.observedAt).getTime());
      expect(receipt.createdAt).toBeTruthy();
      expect(receipt.updatedAt).toBeTruthy();
    });

    it('derives confirmed actual use with product and tool identities', async () => {
      await complete(db);
      const productId = crypto.randomUUID();
      const productVersionId = crypto.randomUUID();
      const toolId = crypto.randomUUID();
      const toolVersionId = crypto.randomUUID();
      const requestId = crypto.randomUUID();
      const decision = decisionFixture(requestId, {
        stepOverrides: {
          'step-1': { productId, productVersionId, toolId, toolVersionId, action: 'Wash with the sample set' },
        },
      });
      const { executionId } = await seedTerminalExecution(db, { mode: 'completed', requestId, decision });
      const receipt = await recordCue(db, { executionId });
      expect(receipt.confirmedSteps[0]).toMatchObject({
        stepId: 'step-1',
        productId,
        productVersionId,
        toolId,
        toolVersionId,
        action: 'Wash with the sample set',
      });
      expect(receipt.confirmedSteps[1]).toMatchObject({ stepId: 'step-2', productId: null });
    });

    it('keeps missing, foreign and random executions indistinguishable', async () => {
      await complete(db);
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      const foreign = await seedTerminalExecution(db, { owner: USER_B, mode: 'completed' });
      await asUser(db, USER_A);
      const missing = await failureOf(() => recordCue(db, { executionId: crypto.randomUUID() }));
      const foreignShape = await failureOf(() => recordCue(db, { executionId: foreign.executionId }));
      const garbage = await failureOf(() => recordCue(db, {
        executionId: '00000000-0000-4000-8000-000000000000',
      }));
      expect(foreignShape).toEqual(missing);
      expect(garbage).toEqual(missing);
      expect(missing.message).toMatch(/execution-not-found/);
    });

    it('refuses a non-terminal execution', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, { mode: 'in_progress' });
      await expect(recordCue(db, { executionId })).rejects.toThrow(/execution-not-terminal/i);
      const paused = await seedTerminalExecution(db, { mode: 'in_progress' });
      await executionCommand(db, { executionId: paused.executionId, expectedRevision: 0, command: { kind: 'pause' } });
      await expect(recordCue(db, { executionId: paused.executionId })).rejects.toThrow(/execution-not-terminal/i);
      expect((await cueSnapshot(db)).records).toBe(0);
    });

    it('accepts an abandoned execution with only server-confirmed steps', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, { mode: 'abandoned' });
      const receipt = await recordCue(db, { executionId, observation: immediateObservation() });
      expect(receipt.executionStatus).toBe('abandoned');
      // Only the one confirmed step becomes actual use; the unconfirmed second
      // step is never copied into the observation record.
      expect(receipt.confirmedSteps.map((step: any) => step.stepId)).toEqual(['step-1']);
    });

    it('excludes skipped and modified steps from actual use', async () => {
      await complete(db);
      const requestId = crypto.randomUUID();
      const decision = decisionFixture(requestId, { stepCount: 3 });
      const { executionId } = await seedTerminalExecution(db, {
        mode: 'completed',
        requestId,
        decision,
        confirmSteps: ['step-1'],
        extraCommands: [
          { kind: 'skip-step', stepId: 'step-2', reason: 'product not available' },
          { kind: 'modify-step', stepId: 'step-3', reason: 'left it on longer', detail: 'about five extra minutes' },
        ],
      });
      const receipt = await recordCue(db, { executionId });
      expect(receipt.confirmedSteps.map((step: any) => step.stepId)).toEqual(['step-1']);
    });

    it('refuses an execution whose run is missing or carries no comparable goal', async () => {
      await complete(db);
      const gone = await seedTerminalExecution(db, { mode: 'completed' });
      await privileged(db, 'delete from public.recommendation_runs where request_id = $1', [gone.runId]);
      // The existing relational integrity migration cascades a deleted run to
      // its execution, so the safe public result is execution-not-found.
      await expect(recordCue(db, { executionId: gone.executionId })).rejects.toThrow(/execution-not-found/i);

      const requestId = crypto.randomUUID();
      const goalless = await seedTerminalExecution(db, {
        mode: 'completed', requestId, input: { requestId },
      });
      await expect(recordCue(db, { executionId: goalless.executionId })).rejects.toThrow(/run-not-consistent/i);
    });

    it('rejects observations that try to supply derived facts', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      for (const [label, payload] of [
        ['a recommendation run id', immediateObservation({ recommendationRunId: crypto.randomUUID() })],
        ['an execution id', immediateObservation({ executionId })],
        ['a lifecycle', immediateObservation({ lifecycle: 'voided' })],
      ] as [string, Record<string, unknown>][]) {
        await expect(recordCue(db, { executionId, observation: payload }), label)
          .rejects.toThrow(/invalid-observation/i);
      }
    });

    it('rejects untrusted execution data defensively', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, { mode: 'in_progress' });
      // A privileged corruption the RPC boundary can never produce: a
      // "confirmed" step without a confirmation time must never surface as
      // actual use.
      await privileged(db, `
        update public.protocol_executions
        set execution = jsonb_set(execution, '{steps,0,state}', '"confirmed"'),
            status = 'completed'
        where execution_id = $1`, [executionId]);
      await expect(recordCue(db, { executionId })).rejects.toThrow(/execution-not-usable/i);
    });
  });

  describe('timing coexistence and duplicate-active prevention', () => {
    it('allows one immediate and one delayed record per execution', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const immediate = await recordCue(db, { executionId, observation: immediateObservation() });
      const delayed = await recordCue(db, { executionId, observation: delayedObservation() });
      expect(immediate.timing).toBe('immediate');
      expect(delayed.timing).toBe('delayed');
      expect(immediate.recordId).not.toBe(delayed.recordId);
      const list = await listCues(db);
      expect(list.items.map((row: any) => row.recordId).sort())
        .toEqual([immediate.recordId, delayed.recordId].sort());
    });

    it('refuses a duplicate active record atomically', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const first = await recordCue(db, { executionId, observation: immediateObservation() });
      const before = await cueSnapshot(db);
      await expect(recordCue(db, { executionId, observation: immediateObservation({ notes: 'again' }) }))
        .rejects.toThrow(/duplicate-active/i);
      expect(await cueSnapshot(db)).toEqual(before);
      expect(first.lifecycle).toBe('active');
    });

    it('allows a fresh record after a void', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const first = await recordCue(db, { executionId });
      await voidCue(db, { recordId: first.recordId, expectedRevision: 1 });
      const second = await recordCue(db, { executionId });
      expect(second.recordId).not.toBe(first.recordId);
      expect(second.lifecycle).toBe('active');
    });

    it('enforces the one-active invariant against privileged direct writes', async () => {
      await complete(db);
      const { runId, executionId } = await seedTerminalExecution(db, {});
      await recordCue(db, { executionId });
      await expect(privileged(db, `
        insert into public.cue_checks(
          user_id, record_id, execution_id, recommendation_run_id, goal, timing, lifecycle, revision,
          observed_at, received_at, observation, confirmed_steps, execution_status)
        values ($1, $2, $3, $4, 'basic_wash', 'immediate', 'active', 1, now(), now(),
          '{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}'::jsonb,
          '[]'::jsonb, 'completed')`,
      [USER_A, crypto.randomUUID(), executionId, runId])).rejects.toThrow(/duplicate|unique|violates/i);
    });
  });

  describe('idempotency and conflict behavior', () => {
    it('converges identical create retries on one receipt, one record and one revision', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const operationId = crypto.randomUUID();
      const observation = immediateObservation();
      const first = await recordCue(db, { operationId, executionId, observation });
      const second = await recordCue(db, { operationId, executionId, observation });
      expect(second).toEqual(first);
      expect(await cueSnapshot(db)).toMatchObject({ records: 1, revisions: 1, operations: 1 });
    });

    it('refuses operation id reuse with a different payload', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const operationId = crypto.randomUUID();
      await recordCue(db, { operationId, executionId, observation: immediateObservation() });
      const before = await cueSnapshot(db);
      await expect(recordCue(db, {
        operationId,
        executionId,
        observation: immediateObservation({ notes: 'different content' }),
      })).rejects.toThrow(/operation-conflict/i);
      expect(await cueSnapshot(db)).toEqual(before);
    });

    it('isolates one operation id across owners', async () => {
      await complete(db);
      const mine = await seedTerminalExecution(db, {});
      const operationId = crypto.randomUUID();
      const own = await recordCue(db, { operationId, executionId: mine.executionId });
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      const theirs = await seedTerminalExecution(db, { owner: USER_B });
      const other = await recordCue(db, { operationId, executionId: theirs.executionId });
      expect(other.recordId).not.toBe(own.recordId);
      await asUser(db, USER_A);
      expect(await cueSnapshot(db)).toMatchObject({ records: 2, revisions: 2, operations: 2 });
    });

    it('replays correct and void receipts and refuses cross-kind operation reuse', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const createOperation = crypto.randomUUID();
      const created = await recordCue(db, { operationId: createOperation, executionId });
      const correctOperation = crypto.randomUUID();
      const correctedObservation = immediateObservation({ notes: 'fixed typo' });
      const corrected = await correctCue(db, {
        operationId: correctOperation,
        recordId: created.recordId,
        expectedRevision: 1,
        observation: correctedObservation,
        reason: 'typo',
      });
      expect(await correctCue(db, {
        operationId: correctOperation,
        recordId: created.recordId,
        expectedRevision: 1,
        observation: correctedObservation,
        reason: 'typo',
      })).toEqual(corrected);
      const voidOperation = crypto.randomUUID();
      const voided = await voidCue(db, {
        operationId: voidOperation,
        recordId: created.recordId,
        expectedRevision: 2,
        reason: 'wrong day',
      });
      expect(await voidCue(db, {
        operationId: voidOperation,
        recordId: created.recordId,
        expectedRevision: 2,
        reason: 'wrong day',
      })).toEqual(voided);
      // Reusing the create operation id for a void is a different command.
      await expect(voidCue(db, {
        operationId: createOperation,
        recordId: created.recordId,
        expectedRevision: 2,
        reason: 'wrong day',
      })).rejects.toThrow(/operation-conflict/i);
      expect(await cueSnapshot(db)).toMatchObject({ records: 1, revisions: 3, operations: 3 });
    });

    it('refuses conflicting operation reuse on corrections', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      const operationId = crypto.randomUUID();
      await correctCue(db, {
        operationId,
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'first fix' }),
        reason: 'typo',
      });
      const before = await cueSnapshot(db);
      await expect(correctCue(db, {
        operationId,
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'second fix' }),
        reason: 'typo',
      })).rejects.toThrow(/operation-conflict/i);
      expect(await cueSnapshot(db)).toEqual(before);
    });
  });

  describe('corrections and voids (append-only history)', () => {
    it('appends a correction and keeps the chain readable', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId, observation: immediateObservation({ frizz: 'less' }) });
      const corrected = await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ frizz: 'same', notes: 'on reflection' }),
        reason: 'mis-tapped',
      });
      expect(corrected).toMatchObject({
        recordId: created.recordId,
        revision: 2,
        lifecycle: 'active',
        timing: 'immediate',
      });
      expect(corrected.observation).toMatchObject({ frizz: 'same' });
      const detail = await getCue(db, created.recordId);
      expect(detail.revisions).toHaveLength(2);
      expect(detail.revisions[0]).toMatchObject({ kind: 'create', state: 'corrected', correctsId: null });
      expect(detail.revisions[1]).toMatchObject({
        kind: 'correct',
        state: 'active',
        correctsId: detail.revisions[0].revisionId,
        correctionReason: 'mis-tapped',
      });
      expect(detail.observation).toMatchObject({ frizz: 'same' });
    });

    it('refuses a stale expected revision without residue', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'first fix' }),
        reason: 'typo',
      });
      const before = await cueSnapshot(db);
      await expect(correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'stale write' }),
        reason: 'stale',
      })).rejects.toThrow(/revision-conflict/i);
      expect(await cueSnapshot(db)).toEqual(before);
    });

    it('supports a contiguous correction chain', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ frizz: 'same', notes: 'one' }),
        reason: 'first',
      });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 2,
        observation: immediateObservation({ frizz: 'more', notes: 'two' }),
        reason: 'second',
      });
      const detail = await getCue(db, created.recordId);
      expect(detail.revision).toBe(3);
      expect(detail.revisions.map((revision: any) => revision.sequence)).toEqual([1, 2, 3]);
      expect(detail.revisions[2].correctsId).toBe(detail.revisions[1].revisionId);
      expect(detail.revisions[1].correctsId).toBe(detail.revisions[0].revisionId);
      expect(detail.revisions.map((revision: any) => revision.state))
        .toEqual(['corrected', 'corrected', 'active']);
    });

    it('refuses a no-op correction', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const observation = immediateObservation({ frizz: 'less' });
      const created = await recordCue(db, { executionId, observation });
      await expect(correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation,
        reason: 'no change',
      })).rejects.toThrow(/no-op-correction/i);
    });

    it('refuses a timing change through a correction', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId, observation: immediateObservation() });
      await expect(correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: delayedObservation(),
        reason: 'later view',
      })).rejects.toThrow(/timing-mismatch/i);
    });

    it('refuses a correction on a voided record', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await voidCue(db, { recordId: created.recordId, expectedRevision: 1 });
      const before = await cueSnapshot(db);
      await expect(correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 2,
        observation: immediateObservation({ notes: 'after void' }),
        reason: 'late',
      })).rejects.toThrow(/record-voided/i);
      expect(await cueSnapshot(db)).toEqual(before);
    });

    it('voids by appending an audit revision and keeps the content', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const observation = immediateObservation({ frizz: 'less' });
      const created = await recordCue(db, { executionId, observation });
      const voided = await voidCue(db, { recordId: created.recordId, expectedRevision: 1, reason: 'wrong execution' });
      expect(voided).toMatchObject({ lifecycle: 'voided', revision: 2 });
      // A void never deletes the recorded content.
      expect(voided.observation).toEqual(observation);
      const detail = await getCue(db, created.recordId);
      expect(detail.revisions).toHaveLength(2);
      expect(detail.revisions[0]).toMatchObject({ kind: 'create', state: 'voided' });
      expect(detail.revisions[1]).toMatchObject({ kind: 'void', voidReason: 'wrong execution', state: null });
      expect(detail.revisions[1].observation).toBeNull();
    });

    it('refuses a double void without residue', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await voidCue(db, { recordId: created.recordId, expectedRevision: 1 });
      const before = await cueSnapshot(db);
      await expect(voidCue(db, { recordId: created.recordId, expectedRevision: 2, reason: 'again' }))
        .rejects.toThrow(/record-voided/i);
      expect(await cueSnapshot(db)).toEqual(before);
    });

    it('refuses a void with a stale expected revision', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'fix first' }),
        reason: 'typo',
      });
      await expect(voidCue(db, { recordId: created.recordId, expectedRevision: 1, reason: 'stale' }))
        .rejects.toThrow(/revision-conflict/i);
    });

    it('refuses invalid void and correction reasons', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const voided = await recordCue(db, { executionId });
      for (const [label, reason] of [
        ['an empty reason', ''],
        ['a blank reason', '   '],
        ['an oversized reason', 'x'.repeat(501)],
      ] as [string, string][]) {
        await expect(voidCue(db, { recordId: voided.recordId, expectedRevision: 1, reason }), label)
          .rejects.toThrow(/invalid-reason/i);
      }
      await expect(correctCue(db, {
        recordId: voided.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'fix' }),
        reason: 'x'.repeat(501),
      })).rejects.toThrow(/invalid-reason/i);
    });

    it('enforces receipt ordering defensively for corrections and voids', async () => {
      await complete(db);
      const { runId, executionId } = await seedTerminalExecution(db, {});
      const recordId = crypto.randomUUID();
      const observation = '{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}';
      await privileged(db, `
        insert into public.cue_checks(
          user_id, record_id, execution_id, recommendation_run_id, goal, timing, lifecycle, revision,
          observed_at, received_at, observation, confirmed_steps, execution_status)
        values ($1,$2,$3,$4,'basic_wash','immediate','active',1, now(), now() + interval '1 day',
          $5::jsonb, '[]'::jsonb, 'completed')`,
      [USER_A, recordId, executionId, runId, observation]);
      await privileged(db, `
        insert into public.cue_check_revisions(user_id, record_id, sequence, kind, observation, received_at)
        values ($1,$2,1,'create',$3::jsonb, now() + interval '1 day')`,
      [USER_A, recordId, observation]);
      await expect(correctCue(db, {
        recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'fix' }),
        reason: 'fix',
      })).rejects.toThrow(/invalid-receipt-order/i);
      await expect(voidCue(db, { recordId, expectedRevision: 1, reason: 'remove' }))
        .rejects.toThrow(/invalid-receipt-order/i);
    });

    it('makes revision identity duplication and self-reference impossible', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      const head = await privileged<{ id: string }>(
        db,
        'select id from public.cue_check_revisions where record_id = $1 and sequence = 1',
        [created.recordId]);
      const headId = head.rows[0].id;
      // The same (record, sequence) identity cannot be appended twice.
      await expect(privileged(db, `
        insert into public.cue_check_revisions(user_id, record_id, sequence, kind, observation, received_at)
        values ($1,$2,1,'create','{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}'::jsonb, now())`,
      [USER_A, created.recordId])).rejects.toThrow(/duplicate|unique|violates/i);
      // A correction cannot self-reference, and one revision cannot be
      // corrected twice.
      const selfId = crypto.randomUUID();
      await expect(privileged(db, `
        insert into public.cue_check_revisions(id, user_id, record_id, sequence, kind, observation, corrects_id, correction_reason, received_at)
        values ($1,$2,$3,2,'correct','{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}'::jsonb,$1,'self', now())`,
      [selfId, USER_A, created.recordId])).rejects.toThrow(/check|constraint|violates/i);
      await privileged(db, `
        insert into public.cue_check_revisions(user_id, record_id, sequence, kind, observation, corrects_id, correction_reason, received_at)
        values ($1,$2,2,'correct','{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}'::jsonb,$3,'first', now())`,
      [USER_A, created.recordId, headId]);
      await expect(privileged(db, `
        insert into public.cue_check_revisions(user_id, record_id, sequence, kind, observation, corrects_id, correction_reason, received_at)
        values ($1,$2,3,'correct','{"timing":"immediate","observedAt":"2026-10-24T08:00:00Z","overallResult":"better"}'::jsonb,$3,'second', now())`,
      [USER_A, created.recordId, headId])).rejects.toThrow(/duplicate|unique|violates/i);
    });

    it('blocks history rewrites and binding changes at the table level', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await expect(privileged(db,
        `update public.cue_check_revisions set correction_reason = 'rewritten' where record_id = $1`,
        [created.recordId])).rejects.toThrow(/cue-check-revision-immutable/i);
      await expect(privileged(db,
        `delete from public.cue_check_revisions where record_id = $1`,
        [created.recordId])).rejects.toThrow(/cue-check-revision-immutable/i);
      await expect(privileged(db,
        `update public.cue_checks set execution_id = $2 where record_id = $1`,
        [created.recordId, crypto.randomUUID()])).rejects.toThrow(/cue-check-binding-immutable/i);
      await expect(privileged(db,
        `update public.cue_checks set timing = 'delayed' where record_id = $1`,
        [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
      await expect(privileged(db,
        `update public.cue_checks set user_id = $2 where record_id = $1`,
        [created.recordId, USER_B])).rejects.toThrow(/cue-check-binding-immutable/i);
      await expect(privileged(db,
        `delete from public.cue_checks where record_id = $1`,
        [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
    });
  });

  describe('Increment 4 review fixes', () => {
    it('pages on the immutable creation instant, so a change made elsewhere cannot skip or repeat a record', async () => {
      await complete(db);
      const created: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const { executionId } = await seedTerminalExecution(db, {});
        created.push((await recordCue(db, { executionId, observation: immediateObservation({ notes: `record ${index}` }) })).recordId);
      }
      const firstPage = await listCues(db, 1);
      expect(firstPage.items.map((row: any) => row.recordId)).toEqual([created[2]]);
      // The oldest record, on a page the owner has not loaded yet, is corrected and another is removed.
      await correctCue(db, { recordId: created[0], observation: immediateObservation({ notes: 'changed elsewhere' }) });
      await voidCue(db, { recordId: created[1] });
      const secondPage = await listCues(db, 1, firstPage.nextCursor);
      const thirdPage = await listCues(db, 1, secondPage.nextCursor);
      const seen = [...firstPage.items, ...secondPage.items, ...thirdPage.items].map((row: any) => row.recordId);
      expect(seen).toEqual([created[2], created[1], created[0]]);
      expect(thirdPage.nextCursor).toBeNull();
    });

    it('rejects an observation without a timing with the stable code', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const failure = await failureOf(() => recordCue(db, { executionId, observation: { observedAt: nowIso(), overallResult: 'better' } }));
      expect(failure.message).toMatch(/invalid-observation/);
      expect(failure.message).not.toMatch(/null value in column/i);
    });

    it('does not let the head row rewrite derived facts or leave the removed state', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      await expect(privileged(db, `update public.cue_checks set goal = 'heat_style' where record_id = $1`, [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
      await expect(privileged(db, `update public.cue_checks set confirmed_steps = '[]'::jsonb where record_id = $1`, [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
      await expect(privileged(db, `update public.cue_checks set execution_status = 'abandoned' where record_id = $1`, [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
      await voidCue(db, { recordId: created.recordId });
      await expect(privileged(db, `update public.cue_checks set lifecycle = 'active' where record_id = $1`, [created.recordId])).rejects.toThrow(/cue-check-binding-immutable/i);
    });

    it('returns an issued export receipt and document untouched when its operation is replayed', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      await recordCue(db, { executionId });
      const operationId = crypto.randomUUID();
      const exportRequest = async () => {
        // Exports need a recent sign-in; seeding resets the session, so refresh it each time.
        await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({
          sub: USER_A, role: 'authenticated', email: `${USER_A}@example.test`, is_anonymous: false,
          amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
        })]);
        return (await db.query<{ result: any }>('select public.export_request($1, $2) result', [operationId, 'json'])).rows[0].result;
      };
      const first = await exportRequest();
      const documentOf = async () => (await db.query<{ document: any }>('select document from public.export_jobs where id = $1', [first.jobId])).rows[0].document;
      const before = await documentOf();
      expect(before.cueChecks).toHaveLength(1);
      const { executionId: second } = await seedTerminalExecution(db, {});
      await recordCue(db, { executionId: second });
      const replay = await exportRequest();
      expect(replay).toEqual(first);
      expect(await documentOf()).toEqual(before);
      const count = (await db.query<{ record_count: number }>('select record_count from public.export_jobs where id = $1', [first.jobId])).rows[0].record_count;
      expect(count).toBe(first.recordCount);
    });
  });

  describe('input validation and quotas', () => {
    it('rejects malformed observations at the public boundary', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const invalid: [string, Record<string, unknown>][] = [
        ['an unknown timing', immediateObservation({ timing: 'whenever' })],
        ['a missing observed timestamp', { timing: 'immediate', overallResult: 'better' }],
        ['a timestamp without an offset', immediateObservation({ observedAt: '2026-10-24T08:00:00' })],
        ['a future timestamp', immediateObservation({ observedAt: new Date(Date.now() + 86_400_000).toISOString() })],
        ['an out-of-vocabulary answer', immediateObservation({ frizz: 'sogreat' })],
        ['style longevity on an immediate check', immediateObservation({ styleLongevity: 'longer' })],
        ['an observation without any answer or note', { timing: 'immediate', observedAt: nowIso() }],
        ['an oversized note', immediateObservation({ notes: 'x'.repeat(2001) })],
        ['a non-string note', immediateObservation({ notes: 5 })],
        ['a null answer', immediateObservation({ frizz: null })],
      ];
      for (const [label, payload] of invalid) {
        await expect(recordCue(db, { executionId, observation: payload }), label)
          .rejects.toThrow(/invalid-observation/i);
      }
      // A null payload is an invalid operation, not an observation error.
      await expect(db.query('select public.record_cue_check($1,$2,null)', [
        crypto.randomUUID(), executionId,
      ])).rejects.toThrow(/invalid-operation/i);
      expect((await cueSnapshot(db)).records).toBe(0);
    });

    it('accepts explicit unknown answers without inventing defaults', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const observation = { timing: 'immediate', observedAt: nowIso(), frizz: 'unknown', dryness: 'unknown' };
      const receipt = await recordCue(db, { executionId, observation });
      expect(receipt.observation).toEqual(observation);
      const detail = await getCue(db, receipt.recordId);
      expect(detail.observation).toEqual(observation);
    });

    it('accepts a notes-only observation', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const observation = { timing: 'immediate', observedAt: nowIso(), notes: 'no structured answers today' };
      const receipt = await recordCue(db, { executionId, observation });
      expect(receipt.observation).toEqual(observation);
    });

    it('rejects an oversized observation at the column bound', async () => {
      await expect(privileged(db, `
        insert into public.cue_checks(
          user_id, record_id, execution_id, recommendation_run_id, goal, timing, lifecycle, revision,
          observed_at, received_at, observation, confirmed_steps, execution_status)
        values ($1,$2,$3,$3,'basic_wash','immediate','active',1, now(), now(),
          jsonb_build_object('timing','immediate','observedAt','2026-10-24T08:00:00Z','notes',$4::text),
          '[]'::jsonb, 'completed')`,
      [USER_A, crypto.randomUUID(), crypto.randomUUID(), 'y'.repeat(32_768)]))
        .rejects.toThrow(/check|violates/i);
    });

    it('enforces the per-execution-timing record quota', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      for (let index = 0; index < 10; index += 1) {
        const created = await recordCue(db, {
          executionId,
          observation: immediateObservation({ notes: `cycle ${index}` }),
        });
        await voidCue(db, { recordId: created.recordId, expectedRevision: 1, reason: `cycle ${index}` });
      }
      await expect(recordCue(db, {
        executionId,
        observation: immediateObservation({ notes: 'one too many' }),
      })).rejects.toThrow(/quota-exceeded/i);
      // The quota partitions by timing: the delayed slot is untouched.
      const delayed = await recordCue(db, { executionId, observation: delayedObservation() });
      expect(delayed.lifecycle).toBe('active');
    }, 180_000);

    it('enforces the per-record content revision quota', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId });
      for (let revision = 2; revision <= 50; revision += 1) {
        await correctCue(db, {
          recordId: created.recordId,
          expectedRevision: revision - 1,
          observation: immediateObservation({ notes: `correction ${revision}` }),
          reason: `correction ${revision}`,
        });
      }
      await expect(correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 50,
        observation: immediateObservation({ notes: 'one too many' }),
        reason: 'one too many',
      })).rejects.toThrow(/quota-exceeded/i);
      // Voiding is always available: it is one audit event, not another
      // content revision.
      const voided = await voidCue(db, { recordId: created.recordId, expectedRevision: 50, reason: 'done' });
      expect(voided).toMatchObject({ revision: 51, lifecycle: 'voided' });
    }, 180_000);

    it('validates pagination bounds and cursors', async () => {
      await complete(db);
      for (const [label, limit] of [
        ['a zero limit', 0],
        ['an oversized limit', 101],
        ['a null limit', null],
      ] as [string, number | null][]) {
        await expect(listCues(db, limit), label).rejects.toThrow(/invalid-page/i);
      }
      const invalidCursors: [string, unknown][] = [
        ['a non-object cursor', 'not-an-object'],
        ['a cursor missing keys', { createdAt: nowIso() }],
        ['a cursor with extra keys', { createdAt: nowIso(), id: crypto.randomUUID(), extra: 1 }],
        ['a cursor with non-string values', { createdAt: 5, id: 7 }],
        ['a cursor with an invalid timestamp', { createdAt: 'not-a-time', id: crypto.randomUUID() }],
        ['a cursor with an invalid uuid', { createdAt: nowIso(), id: 'not-a-uuid' }],
      ];
      for (const [label, cursor] of invalidCursors) {
        await expect(listCues(db, 25, cursor), label).rejects.toThrow(/invalid-cursor/i);
      }
    });
  });

  describe('list pagination and detail history', () => {
    it('lists newest receipts first with stable, gap-free pages', async () => {
      await complete(db);
      const executionIds: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const { executionId } = await seedTerminalExecution(db, {});
        executionIds.push(executionId);
        await recordCue(db, { executionId, observation: immediateObservation({ notes: `record ${index}` }) });
      }
      const full = await listCues(db);
      expect(full.items).toHaveLength(3);
      expect(full.nextCursor).toBeNull();
      const receipts = full.items.map((row: any) => new Date(row.createdAt).getTime());
      expect([...receipts].sort((left, right) => right - left)).toEqual(receipts);

      const firstPage = await listCues(db, 2);
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).toMatchObject({ createdAt: expect.any(String), id: expect.any(String) });
      const secondPage = await listCues(db, 2, firstPage.nextCursor);
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.nextCursor).toBeNull();
      const paged = [...firstPage.items, ...secondPage.items].map((row: any) => row.recordId);
      expect(paged).toEqual(full.items.map((row: any) => row.recordId));
      expect(new Set(paged).size).toBe(3);
    });

    it('returns an empty first page for a fresh owner', async () => {
      await complete(db);
      const list = await listCues(db);
      expect(list).toEqual({ items: [], nextCursor: null });
    });

    it('keeps other owners records out of the list', async () => {
      await complete(db);
      const mine = await seedTerminalExecution(db, {});
      const own = await recordCue(db, { executionId: mine.executionId });
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      const theirs = await seedTerminalExecution(db, { owner: USER_B });
      const other = await recordCue(db, { executionId: theirs.executionId });
      const theirList = await listCues(db);
      expect(theirList.items.map((row: any) => row.recordId)).toEqual([other.recordId]);
      await asUser(db, USER_A);
      const ownList = await listCues(db);
      expect(ownList.items.map((row: any) => row.recordId)).toEqual([own.recordId]);
      expect(JSON.stringify(ownList)).not.toContain(other.recordId);
    });

    it('returns the full revision chain with derived states', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const created = await recordCue(db, { executionId, observation: immediateObservation({ frizz: 'less' }) });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ frizz: 'same', notes: 'on reflection' }),
        reason: 'reconsidered',
      });
      await voidCue(db, { recordId: created.recordId, expectedRevision: 2, reason: 'wrong execution' });
      const detail = await getCue(db, created.recordId);
      expect(detail).toMatchObject({
        recordId: created.recordId,
        executionId,
        lifecycle: 'voided',
        revision: 3,
        timing: 'immediate',
        goal: 'basic_wash',
      });
      expect(detail.observation).toMatchObject({ frizz: 'same' });
      expect(detail.confirmedSteps).toHaveLength(2);
      expect(detail.revisions).toHaveLength(3);
      expect(detail.revisions[0]).toMatchObject({ kind: 'create', state: 'corrected' });
      expect(detail.revisions[1]).toMatchObject({ kind: 'correct', state: 'voided' });
      expect(detail.revisions[2]).toMatchObject({ kind: 'void', voidReason: 'wrong execution', state: null });
      expect(detail.revisions[1].correctsId).toBe(detail.revisions[0].revisionId);
    });

    it('keeps foreign and random record identifiers indistinguishable in detail', async () => {
      await complete(db);
      await asUser(db, USER_B);
      await complete(db, 'user_b');
      const theirs = await seedTerminalExecution(db, { owner: USER_B });
      const other = await recordCue(db, { executionId: theirs.executionId });
      await asUser(db, USER_A);
      const missing = await failureOf(() => getCue(db, crypto.randomUUID()));
      const foreign = await failureOf(() => getCue(db, other.recordId));
      expect(foreign).toEqual(missing);
      expect(missing.message).toMatch(/record-not-found/);
    });

    it('keeps operation receipts invisible to owners', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const operationId = crypto.randomUUID();
      await recordCue(db, { operationId, executionId });
      const detail = await getCue(db, (await listCues(db)).items[0].recordId);
      const serialized = JSON.stringify(detail);
      expect(serialized).not.toContain(operationId);
      expect(serialized).not.toContain('operation');
      await expect(db.exec('select * from strandcue_private.cue_check_operations'))
        .rejects.toThrow(/permission denied/i);
    });
  });

  describe('isolation from catalogue and product authority', () => {
    it('leaves catalogue, publication and authority rows byte-identical across mutations', async () => {
      await complete(db);
      const { executionId } = await seedTerminalExecution(db, {});
      const before = await authorityDigest(db);
      const created = await recordCue(db, { executionId, observation: immediateObservation() });
      await correctCue(db, {
        recordId: created.recordId,
        expectedRevision: 1,
        observation: immediateObservation({ notes: 'reconsidered' }),
        reason: 'typo',
      });
      await voidCue(db, { recordId: created.recordId, expectedRevision: 2, reason: 'wrong execution' });
      expect(await authorityDigest(db)).toBe(before);
    });
  });
});

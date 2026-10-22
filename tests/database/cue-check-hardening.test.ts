import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A, USER_B } from './harness.ts';
import {
  correctCue, cueCounts, failureOf, observation, privileged, recordCue, seedCompletedExecution, voidCue,
} from './support/cue-fixtures.ts';

// Task I5.0: remaining Cue Check database hardening (head-row integrity, trusted-run binding,
// replay convergence, TRUNCATE guard). Single-connection PGlite proves the SQL logic; the real
// two-session proof lives in cue-check-concurrency.pg.test.ts (opt-in, local Postgres only).

let db: PGlite;

beforeAll(async () => { db = await database(); }, 60_000);
beforeEach(async () => { await asUser(db, USER_A); await complete(db); });
afterEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('delete from public.profiles');
  await db.exec('delete from public.consent_records');
});
afterAll(async () => { await db?.close(); });

describe('head-row integrity', () => {
  async function created() {
    const { executionId } = await seedCompletedExecution(db);
    return recordCue(db, { executionId });
  }

  it('rejects a privileged rewrite of the observation without a matching revision', async () => {
    const record = await created();
    await expect(privileged(db, `update public.cue_checks set observation = observation || '{"notes":"silent"}'::jsonb where record_id = $1`, [record.recordId]))
      .rejects.toThrow(/cue-check-head-invalid/);
    const { rows } = await privileged<{ n: string }>(db, `select (observation ? 'notes')::text n from public.cue_checks where record_id = $1`, [record.recordId]);
    expect(rows[0].n).toBe('false');
  });

  it('rejects a privileged lifecycle rewrite without a matching revision', async () => {
    const record = await created();
    await expect(privileged(db, `update public.cue_checks set lifecycle = 'voided' where record_id = $1`, [record.recordId])).rejects.toThrow(/cue-check-head-invalid/);
  });

  it('rejects a revision jump and a revision that does not match its revision row', async () => {
    const record = await created();
    await expect(privileged(db, `update public.cue_checks set revision = 3 where record_id = $1`, [record.recordId])).rejects.toThrow(/cue-check-head-invalid/);
    await expect(privileged(db, `update public.cue_checks set revision = 2 where record_id = $1`, [record.recordId])).rejects.toThrow(/cue-check-head-invalid/);
    await privileged(db, `insert into public.cue_check_revisions(user_id,record_id,sequence,kind,observation,corrects_id,correction_reason)
      select user_id, record_id, 2, 'correct', $2::jsonb, (select id from public.cue_check_revisions r where r.record_id = c.record_id and r.sequence = 1), 'privileged fixture'
      from public.cue_checks c where record_id = $1`, [record.recordId, JSON.stringify(observation({ notes: 'other' }))]);
    // The revision row exists now, but a different observation on the head still does not match it.
    await expect(privileged(db, `update public.cue_checks set revision = 2, observation = '{"timing":"immediate","observedAt":"2026-01-01T00:00:00Z","dryness":"more"}'::jsonb where record_id = $1`, [record.recordId]))
      .rejects.toThrow(/cue-check-head-invalid/);
    // A head that matches its revision row is the valid append-only path.
    await privileged(db, `update public.cue_checks set revision = 2, observation = (select observation from public.cue_check_revisions where record_id = $1 and sequence = 2) where record_id = $1`, [record.recordId]);
    const { rows } = await privileged<{ revision: number }>(db, 'select revision from public.cue_checks where record_id = $1', [record.recordId]);
    expect(rows[0].revision).toBe(2);
  });

  it('keeps the correction and removal RPC paths working', async () => {
    const record = await created();
    const corrected = await correctCue(db, { recordId: record.recordId });
    expect(corrected.revision).toBe(2);
    const removed = await voidCue(db, { recordId: record.recordId, expectedRevision: 2 });
    expect(removed).toMatchObject({ revision: 3, lifecycle: 'voided' });
  });

  it('still lets profile deletion cascade through records, revisions and receipts', async () => {
    const record = await created();
    await correctCue(db, { recordId: record.recordId });
    await db.exec('set session authorization postgres');
    await db.query('delete from public.profiles where user_id = $1', [USER_A]);
    expect(await cueCounts(db)).toEqual({ checks: 0, revisions: 0, receipts: 0 });
  });
});

describe('TRUNCATE guard', () => {
  it('refuses to truncate Cue Check history, directly or through a profile cascade', async () => {
    const { executionId } = await seedCompletedExecution(db);
    await recordCue(db, { executionId });
    await expect(privileged(db, 'truncate public.cue_check_revisions')).rejects.toThrow(/cue-check-revision-immutable/);
    await expect(privileged(db, 'truncate public.profiles cascade')).rejects.toThrow(/cue-check-revision-immutable/);
    expect((await cueCounts(db)).revisions).toBe(1);
  });

  it('does not get in the way of a truncate while no history exists', async () => {
    await expect(privileged(db, 'truncate public.cue_check_revisions')).resolves.toBeDefined();
  });
});

describe('trusted-run binding', () => {
  it('refuses a Cue Check bound to an untrusted run', async () => {
    const { runId, executionId } = await seedCompletedExecution(db);
    await privileged(db, 'update public.recommendation_runs set trusted = false where request_id = $1', [runId]);
    const failure = await failureOf(() => recordCue(db, { executionId }));
    expect(failure.message).toMatch(/run-not-consistent/);
    expect(await cueCounts(db)).toEqual({ checks: 0, revisions: 0, receipts: 0 });
  });

  it('answers a foreign execution, a random id and a missing run identically', async () => {
    const { executionId } = await seedCompletedExecution(db);
    await asUser(db, USER_B);
    await complete(db, 'user_b');
    const foreign = await failureOf(() => recordCue(db, { executionId }));
    const random = await failureOf(() => recordCue(db, { executionId: crypto.randomUUID() }));
    expect(foreign).toEqual(random);
    expect(foreign.message).toMatch(/execution-not-found/);
    await asUser(db, USER_A);
    await privileged(db, 'delete from public.recommendation_runs where request_id = (select recommendation_run_id from public.protocol_executions where execution_id = $1)', [executionId]);
    const gone = await failureOf(() => recordCue(db, { executionId }));
    expect(gone).toEqual(random);
  });

  it('never accepts owner, run, goal or status from the client', async () => {
    const { executionId } = await seedCompletedExecution(db);
    for (const key of ['userId', 'recommendationRunId', 'goal', 'executionStatus', 'confirmedSteps']) {
      const failure = await failureOf(() => recordCue(db, { executionId, observation: observation({ [key]: 'x' }) }));
      expect(failure.message, key).toMatch(/invalid-observation/);
    }
    expect(await cueCounts(db)).toEqual({ checks: 0, revisions: 0, receipts: 0 });
  });
});

describe('operation replay', () => {
  it('converges identical creates on one record, one revision and one receipt', async () => {
    const { executionId } = await seedCompletedExecution(db);
    const operationId = crypto.randomUUID();
    const payload = observation({ notes: 'same' });
    const first = await recordCue(db, { executionId, operationId, observation: payload });
    const second = await recordCue(db, { executionId, operationId, observation: payload });
    expect(second).toEqual(first);
    expect(await cueCounts(db)).toEqual({ checks: 1, revisions: 1, receipts: 1 });
  });

  it('refuses the same operation id with a different payload and changes nothing', async () => {
    const { executionId } = await seedCompletedExecution(db);
    const operationId = crypto.randomUUID();
    await recordCue(db, { executionId, operationId, observation: observation({ notes: 'one' }) });
    const failure = await failureOf(() => recordCue(db, { executionId, operationId, observation: observation({ notes: 'two' }) }));
    expect(failure.message).toMatch(/operation-conflict/);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint/i);
    expect(await cueCounts(db)).toEqual({ checks: 1, revisions: 1, receipts: 1 });
  });

  it('returns the stored receipt to a retry after the response was lost, for create, correct and void', async () => {
    const { executionId } = await seedCompletedExecution(db);
    const create = { operationId: crypto.randomUUID(), observation: observation({ notes: 'lost' }) };
    const record = await recordCue(db, { executionId, ...create });
    expect(await recordCue(db, { executionId, ...create })).toEqual(record);
    const fix = { operationId: crypto.randomUUID(), observation: observation({ notes: 'fixed' }) };
    const corrected = await correctCue(db, { recordId: record.recordId, ...fix });
    expect(await correctCue(db, { recordId: record.recordId, ...fix })).toEqual(corrected);
    const removal = { operationId: crypto.randomUUID(), expectedRevision: 2 };
    const removed = await voidCue(db, { recordId: record.recordId, ...removal });
    expect(await voidCue(db, { recordId: record.recordId, ...removal })).toEqual(removed);
    expect(await cueCounts(db)).toEqual({ checks: 1, revisions: 3, receipts: 3 });
  });

  it('answers a second active check for the same routine and timing with the stable code, never a raw unique error', async () => {
    const { executionId } = await seedCompletedExecution(db);
    await recordCue(db, { executionId });
    const failure = await failureOf(() => recordCue(db, { executionId }));
    expect(failure.message).toMatch(/duplicate-active/);
    expect(failure.message).not.toMatch(/duplicate key|unique constraint|cue_checks_one_active/i);
    expect(await cueCounts(db)).toEqual({ checks: 1, revisions: 1, receipts: 1 });
  });

  it('leaves no partial rows after any refusal', async () => {
    const { executionId } = await seedCompletedExecution(db);
    const before = await cueCounts(db);
    for (const run of [
      () => recordCue(db, { executionId, observation: { timing: 'immediate' } }),
      () => recordCue(db, { executionId: crypto.randomUUID() }),
      () => recordCue(db, { executionId, observation: observation({ styleLongevity: 'longer' }) }),
    ]) await failureOf(run);
    expect(await cueCounts(db)).toEqual(before);
  });
});

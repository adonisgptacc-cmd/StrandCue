import type { PGlite } from '@electric-sql/pglite';

import { asUser, USER_A } from '../harness.ts';

/** Synthetic terminal-execution fixtures for the Cue Check database suites. Test data only. */

export const nowIso = (): string => new Date().toISOString();

export function decisionFixture(requestId: string, stepCount = 2) {
  return {
    status: 'ready',
    requestId,
    steps: Array.from({ length: stepCount }, (_, index) => ({
      stepId: `step-${index + 1}`, position: index + 1, action: `Test action ${index + 1}`,
      productId: null, productVersionId: null, toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: ['test reason'],
    })),
  };
}

export async function privileged<T = Record<string, unknown>>(db: PGlite, sql: string, params: unknown[] = [], restoreTo: string = USER_A) {
  await db.exec('set session authorization postgres');
  try {
    return await db.query<T>(sql, params);
  } finally {
    await asUser(db, restoreTo);
  }
}

export async function seedRun(db: PGlite, owner: string): Promise<string> {
  const requestId = crypto.randomUUID();
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    await db.query(
      'select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb)',
      [requestId, 'd'.repeat(64), '2026-10-13T08:00:00.000Z', '1', 'bundle-synthetic', '1', 'ready',
        JSON.stringify({ requestId, goal: 'basic_wash' }), JSON.stringify(decisionFixture(requestId))],
    );
  } finally {
    await asUser(db, owner);
  }
  return requestId;
}

/** A completed execution owned by `owner`, bound to a trusted run. */
export async function seedCompletedExecution(db: PGlite, owner: string = USER_A) {
  await asUser(db, owner);
  const runId = await seedRun(db, owner);
  const executionId = crypto.randomUUID();
  await db.query('select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result', [crypto.randomUUID(), executionId, runId, nowIso()]);
  let revision = 0;
  for (const command of [{ kind: 'complete-step', stepId: 'step-1' }, { kind: 'complete-step', stepId: 'step-2' }, { kind: 'complete' }]) {
    await db.query('select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz) result',
      [crypto.randomUUID(), executionId, revision, JSON.stringify(command), nowIso()]);
    revision += 1;
  }
  return { runId, executionId };
}

export const observation = (overrides: Record<string, unknown> = {}) => ({ timing: 'immediate', observedAt: nowIso(), overallResult: 'better', ...overrides });

export async function recordCue(db: PGlite, options: { executionId: string; operationId?: string; observation?: Record<string, unknown> }) {
  return (await db.query<{ result: any }>('select public.record_cue_check($1,$2,$3::jsonb) result',
    [options.operationId ?? crypto.randomUUID(), options.executionId, JSON.stringify(options.observation ?? observation())])).rows[0].result;
}

export async function correctCue(db: PGlite, options: { recordId: string; expectedRevision?: number; observation?: Record<string, unknown>; operationId?: string }) {
  return (await db.query<{ result: any }>('select public.correct_cue_check($1,$2,$3,$4::jsonb,$5) result',
    [options.operationId ?? crypto.randomUUID(), options.recordId, options.expectedRevision ?? 1,
      JSON.stringify(options.observation ?? observation({ notes: 'corrected' })), 'correcting a mis-tap'])).rows[0].result;
}

export async function voidCue(db: PGlite, options: { recordId: string; expectedRevision?: number; operationId?: string }) {
  return (await db.query<{ result: any }>('select public.void_cue_check($1,$2,$3,$4) result',
    [options.operationId ?? crypto.randomUUID(), options.recordId, options.expectedRevision ?? 1, 'recorded against the wrong routine'])).rows[0].result;
}

export async function failureOf(run: () => Promise<unknown>): Promise<{ message: string; code: string | null }> {
  try {
    await run();
  } catch (error) {
    const shaped = error as { message: string; code?: string };
    return { message: shaped.message, code: shaped.code ?? null };
  }
  throw new Error('expected the call to fail, but it succeeded');
}

export async function cueCounts(db: PGlite) {
  const { rows } = await privileged<{ checks: string; revisions: string; receipts: string }>(db,
    `select (select count(*) from public.cue_checks)::text checks, (select count(*) from public.cue_check_revisions)::text revisions,
            (select count(*) from strandcue_private.cue_check_operations)::text receipts`);
  return { checks: Number(rows[0].checks), revisions: Number(rows[0].revisions), receipts: Number(rows[0].receipts) };
}

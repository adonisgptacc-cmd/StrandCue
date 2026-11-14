import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { asUser, complete, database, USER_A } from './harness.ts';

const EXECUTION_ID = '44444444-4444-4444-8444-444444444444';
const RUN_ID = '55555555-5555-4555-8555-555555555555';
// Fixed reference time for deterministic skew boundary tests
const REFERENCE_TIME = new Date('2026-11-14T20:00:00.000Z').getTime();

function stepFixture(stepId: string, position: number) {
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
  };
}

function decisionFixture(requestId: string, statuses = 'ready', stepCount = 2) {
  return {
    status: statuses,
    requestId,
    steps: Array.from({ length: stepCount }, (_, index) =>
      stepFixture(`step-${index + 1}`, index + 1),
    ),
  };
}

async function recordRun(
  db: PGlite,
  overrides: { requestId?: string; decision?: unknown; status?: string } = {},
) {
  const requestId = overrides.requestId ?? RUN_ID;
  const decision = overrides.decision ?? decisionFixture(requestId);
  await db.exec('set session authorization postgres');
  await db.exec('set session authorization strandcue_mutator');
  try {
    return (
      await db.query<{ result: any }>(
        `select strandcue_private.record_trusted_run($1,$2,$3::timestamptz,$4,$5,$6,$7,$8::jsonb,$9::jsonb) result`,
        [
          requestId,
          'd'.repeat(64),
          '2026-10-13T08:00:00.000Z',
          '1',
          'bundle-synthetic',
          '1',
          overrides.status ?? 'ready',
          JSON.stringify({ requestId, goal: 'basic_wash' }),
          JSON.stringify(decision),
        ],
      )
    ).rows[0].result;
  } finally {
    await asUser(db, USER_A);
  }
}

async function start(
  db: PGlite,
  overrides: {
    operationId?: string;
    executionId?: string;
    runId?: string;
    startedAt?: string;
  } = {},
) {
  return (
    await db.query<{ result: any }>(
      `select public.start_protocol_execution($1,$2,$3,$4::timestamptz) result`,
      [
        overrides.operationId ?? crypto.randomUUID(),
        overrides.executionId ?? EXECUTION_ID,
        overrides.runId ?? RUN_ID,
        overrides.startedAt ?? nowIso(),
      ],
    )
  ).rows[0].result;
}

async function transition(
  db: PGlite,
  options: {
    operationId?: string;
    executionId?: string;
    expectedRevision?: number;
    command?: unknown;
    at?: string;
  } = {},
) {
  return (
    await db.query<{ result: any }>(
      `select public.apply_protocol_execution_command($1,$2,$3,$4::jsonb,$5::timestamptz) result`,
      [
        options.operationId ?? crypto.randomUUID(),
        options.executionId ?? EXECUTION_ID,
        options.expectedRevision ?? 0,
        JSON.stringify(options.command ?? { kind: 'pause' }),
        options.at ?? nowIso(),
      ],
    )
  ).rows[0].result;
}

/** Fresh caller timestamp inside the skew window (server now). */
function nowIso(): string {
  return new Date().toISOString();
}

describe('execution timestamp skew window', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await database();
  }, 60_000);
  beforeEach(async () => {
    await asUser(db, USER_A);
    await complete(db);
    await recordRun(db);
    await start(db);
  });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    await db.exec('delete from public.protocol_executions');
    await db.exec('delete from public.protocol_execution_events');
    await db.exec('delete from strandcue_private.protocol_execution_operations');
    await db.exec('delete from public.recommendation_runs');
  });
  afterAll(async () => {
    await db?.close();
  });

  it('rejects p_at > 5 min in future with timestamp-out-of-range', async () => {
    const futureAt = new Date(REFERENCE_TIME + 6 * 60 * 1000).toISOString();
    await expect(
      transition(db, {
        operationId: crypto.randomUUID(),
        command: { kind: 'complete-step', stepId: 'step-1' },
        expectedRevision: 0,
        at: futureAt,
      }),
    ).rejects.toThrow(/timestamp-out-of-range/i);
  });

  it('rejects p_at > 5 min in past with timestamp-out-of-range', async () => {
    const pastAt = new Date(REFERENCE_TIME - 6 * 60 * 1000).toISOString();
    await expect(
      transition(db, {
        operationId: crypto.randomUUID(),
        command: { kind: 'complete-step', stepId: 'step-1' },
        expectedRevision: 0,
        at: pastAt,
      }),
    ).rejects.toThrow(/timestamp-out-of-range/i);
  });

  it('accepts p_at within ±5 min window', async () => {
    const nowAt = nowIso();
    const result = await transition(db, {
      operationId: crypto.randomUUID(),
      command: { kind: 'complete-step', stepId: 'step-1' },
      expectedRevision: 0,
      at: nowAt,
    });
    expect(result).toMatchObject({ revision: 1 });
    expect(result.execution.steps.find((step: any) => step.stepId === 'step-1')).toMatchObject({
      state: 'confirmed',
    });
  });
});
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  HeatCoachDecisionSchema,
  HeatCoachInputSchema,
  HeatRulePublicationSchema,
  evaluateHeatCoach,
} from '../../packages/domain/src/heat-coach.ts';
import { conformance, resolveConformanceCase } from '../fixtures/heat-coach-conformance.ts';
import { database } from './harness.ts';

/** Run SQL as the postgres superuser (needed for private functions/tables). */
const privileged = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
  await db.exec('set session authorization postgres');
  return db.query<T>(sql, params);
};

/**
 * SQL-side conformance test for the shared Heat Coach fixtures.
 *
 * Runs the same input/publication pairs as the domain conformance tests
 * through the PostgreSQL `heat_evaluate` function. The suite began as genuine
 * RED evidence and now prevents either implementation from drifting field by
 * field from the reviewed I6.1 decision contract.
 */
let db: PGlite;

const evaluateSql = async (input: unknown, publication: unknown) => {
  const row = await privileged<{ result: any }>(
    'select strandcue_private.heat_evaluate($1::jsonb,$2::jsonb) result',
    [JSON.stringify(input), JSON.stringify(publication)],
  );
  return row.rows[0]!.result;
};

beforeAll(async () => {
  db = await database();
}, 30_000);
afterAll(async () => { await db?.close(); });

describe('Heat Coach SQL/domain conformance', () => {
  it.each(conformance.cases.map(c => [c.name]))('sql decides %s', async (name: string) => {
    const c = conformance.cases.find(item => item.name === name)!;
    const resolved = resolveConformanceCase(c);
    const input = HeatCoachInputSchema.parse(resolved.input);
    const publication = HeatRulePublicationSchema.parse(resolved.publication);
    const expected = HeatCoachDecisionSchema.parse(evaluateHeatCoach(input, publication));
    const result = HeatCoachDecisionSchema.parse(await evaluateSql(input, publication));
    expect(result).toEqual(expected);
  });
});

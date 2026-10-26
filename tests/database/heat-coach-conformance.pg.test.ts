import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  HeatCoachDecisionSchema,
  HeatCoachInputSchema,
  HeatRulePublicationSchema,
  evaluateHeatCoach,
} from '../../packages/domain/src/heat-coach.ts';
import { conformance, resolveConformanceCase } from '../fixtures/heat-coach-conformance.ts';
import { asUser, database, USER_A } from './harness.ts';

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

const rule = conformance.baselinePublication as unknown as Record<string, unknown>;
const seedRule = async (state: 'draft' | 'published' | 'withdrawn' = 'published') => {
  await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
  await privileged('delete from strandcue_private.heat_rule_publications where id=$1', [conformance.publicationId]);
  await privileged<{ content_digest: string }>(
    `with source as (select $2::jsonb - 'digest' rule), bound as (
       select rule,encode(sha256(convert_to(rule::text,'UTF8')),'hex') digest from source)
     insert into strandcue_private.heat_rule_publications
      (id, content_digest, rule, state, authored_by, reviewed_by, reviewed_at, published_at)
     select $1,'sha256:'||digest,rule||jsonb_build_object('digest',digest),$3,'fixture-author','fixture-reviewer',now(),now() from bound
     returning content_digest`,
    [conformance.publicationId, JSON.stringify(rule), state],
  );
  await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
};

const evaluateSql = async (input: unknown, publication: unknown) => {
  const row = await privileged<{ result: any }>(
    'select strandcue_private.heat_evaluate($1::jsonb,$2::jsonb) result',
    [JSON.stringify(input), JSON.stringify(publication)],
  );
  return row.rows[0]!.result;
};

beforeAll(async () => {
  db = await database();
  await asUser(db, USER_A);
  await seedRule();
});
beforeEach(async () => {
  await asUser(db, USER_A);
  await seedRule();
});
afterEach(async () => {
  await privileged('alter table strandcue_private.heat_rule_publications disable trigger heat_rule_guard');
  await privileged('delete from strandcue_private.heat_rule_publications');
  await privileged('alter table strandcue_private.heat_rule_publications enable trigger heat_rule_guard');
});
afterAll(async () => { await db?.close(); });

describe('Heat Coach SQL/domain conformance', () => {
  it.each(conformance.cases.map(c => [c.name]))('sql decides %s', async (name: string) => {
    const c = conformance.cases.find(item => item.name === name)!;
    await seedRule(c.publication?.lifecycle === 'draft' ? 'draft' : c.publication?.lifecycle === 'withdrawn' ? 'withdrawn' : 'published');
    const resolved = resolveConformanceCase(c);
    const input = HeatCoachInputSchema.parse(resolved.input);
    const publication = HeatRulePublicationSchema.parse(resolved.publication);
    const expected = HeatCoachDecisionSchema.parse(evaluateHeatCoach(input, publication));
    const result = HeatCoachDecisionSchema.parse(await evaluateSql(input, publication));
    expect(result).toEqual(expected);
  });
});

import { readFile } from 'node:fs/promises';

import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CompletedSnapshotSchema, evaluateProgramme } from '../../packages/domain/src/treatment-programme.ts';
import { asUser, complete, database, USER_A, USER_B, UNVERIFIED } from './harness.ts';
import { failureOf, privileged } from './support/cue-fixtures.ts';
import {
  OTHER_VERSION_ID, PRODUCT_ID, UNVERIFIED_VERSION_ID, VERSION_ID,
  changeProgramme, enrolProgramme, getProgramme, listProgrammes, nextIdentity, programmeCounts,
  publishedRule, recordWashActivity, ruleFixture, seedExecutionCare, seedProgrammeCatalogue, seedRulePublication, tsCareEvents,
  type CareSpec, type RuleJson,
} from './support/programme-fixtures.ts';

// Task I5.4: owner-only treatment-programme persistence. Every authoritative fact (counts, due status,
// state, publication binding, evidence, snapshot) is derived by the server from the owner's own canonical
// events and an exact reviewed rule publication; the client supplies only owner facts and an operation id.
// PGlite is single-connection: it proves the SQL logic, not wire-level concurrency (see the opt-in
// treatment-programme-concurrency.pg.test.ts for two real sessions).

const START = '2026-09-01T08:00:00.000Z';
const APP_AT = '2026-09-02T08:00:00.000Z';
const WASH_ATS = ['2026-09-05T08:00:00.000Z', '2026-09-08T08:00:00.000Z', '2026-09-11T08:00:00.000Z', '2026-09-14T08:00:00.000Z', '2026-09-17T08:00:00.000Z'];

let db: PGlite;

beforeAll(async () => {
  db = await database();
  await seedProgrammeCatalogue(db);
}, 120_000);
beforeEach(async () => { await asUser(db, USER_A); await complete(db, 'user_a'); });
afterEach(async () => {
  await db.exec('set session authorization postgres');
  await db.exec('delete from public.profiles');
  await db.exec('delete from public.consent_records');
});
afterAll(async () => { await db?.close(); });

/** Clears every owner row and recreates owner A: a fresh account with no care events. */
async function freshOwner() {
  await db.exec('set session authorization postgres');
  await db.exec('delete from public.profiles');
  await db.exec('delete from public.consent_records');
  await asUser(db, USER_A);
  await complete(db, 'user_a');
}

const careSpecs = (washes: number, options: { shampoo?: 'yes' | 'no' | 'unknown' } = {}): CareSpec[] => [
  { kind: 'application', at: APP_AT, session: 'app' },
  ...WASH_ATS.slice(0, washes).map((at, index): CareSpec => ({ kind: 'wash', at, session: `wash-${index + 1}`, shampoo: options.shampoo ?? 'yes' })),
];

/** A published rule, the owner's care, and an enrolment. */
async function enrolled(options: { washes?: number; rule?: RuleJson; specs?: CareSpec[]; owner?: string; selected?: boolean } = {}) {
  const { identity, rule } = await publishedRule(db, options.rule ?? {});
  const owner = options.owner ?? USER_A;
  const seeded = await seedExecutionCare(db, owner, options.specs ?? careSpecs(options.washes ?? 0));
  await asUser(db, owner);
  const record = await enrolProgramme(db, {
    ruleId: identity.ruleId, startDate: { precision: 'exact', value: START },
    selectedApplicationEventId: options.selected ? seeded.find(item => item.kind === 'application')!.eventId : null,
  });
  return { identity, rule, seeded, record, owner };
}

type Programme = Awaited<ReturnType<typeof enrolled>>;

async function parity(programme: Programme, activities: { eventId: string; activityId: string; date: any }[] = []) {
  const detail = await getProgramme(db, programme.record.enrolmentId);
  const evaluation = detail.evaluation;
  const record = detail;
  const state = record.completed ? 'completed' : record.paused && !record.resumed ? 'paused' : record.maintenanceTransition ? 'maintenance' : 'initial';
  const enrolment: any = {
    enrolmentId: record.enrolmentId, productId: record.productId, productVersionId: record.productVersionId,
    productVerificationStatus: 'verified', ruleId: record.ruleId, ruleVersion: record.ruleVersion,
    rulePublication: record.rulePublication, state, startDate: record.startDate, revision: record.revision,
  };
  if (record.selectedApplicationEventId) enrolment.selectedApplicationEventId = record.selectedApplicationEventId;
  if (record.paused && !record.completed) enrolment.paused = { pausedAt: { precision: 'exact', value: record.paused.pausedAt }, pauseReasonCode: record.paused.reasonCode };
  if (record.resumed && !record.completed) enrolment.resumed = { resumptionRuleId: record.resumed.resumptionRuleId, resumptionRuleVersion: record.resumed.resumptionRuleVersion, resumedAt: { precision: 'exact', value: record.resumed.resumedAt } };
  if (record.maintenanceTransition && !record.completed) enrolment.maintenanceTransition = { ruleId: record.maintenanceTransition.ruleId, ruleVersion: record.maintenanceTransition.ruleVersion, transitionedAt: { precision: 'exact', value: record.maintenanceTransition.transitionedAt } };
  if (record.completed) enrolment.completed = { snapshot: record.completed.snapshot };
  const rule = { ...programme.rule, publicationStatus: 'published', publication: record.rulePublication };
  const expected = evaluateProgramme(enrolment, tsCareEvents(programme.seeded, activities), rule, evaluation.asOf);
  expect({
    state: evaluation.state, dueStatus: evaluation.dueStatus, count: evaluation.count, range: evaluation.range, unit: evaluation.unit, ruleId: evaluation.ruleId,
    missing: evaluation.missing.map((item: any) => item.code), used: evaluation.eventsUsed.map((item: any) => item.eventId),
    application: evaluation.application?.eventId ?? null, reasons: evaluation.reasonCodes, snapshot: evaluation.fromCompletedSnapshot,
  }).toEqual({
    state: expected.state, dueStatus: expected.dueStatus, count: expected.count, range: expected.range, unit: expected.unit, ruleId: expected.ruleId,
    missing: expected.missing.map(item => item.code), used: expected.eventsUsed.map(item => item.eventId),
    application: expected.application?.eventId ?? null, reasons: [...expected.reasonCodes], snapshot: expected.fromCompletedSnapshot,
  });
  return { evaluation, expected };
}

describe('schema, grants and hardening', () => {
  const TABLES = ['public.treatment_programmes', 'public.treatment_programme_events', 'strandcue_private.treatment_programme_operations',
    'strandcue_private.programme_rule_publications', 'strandcue_private.execution_step_care'];

  it('forces row level security on every programme table', async () => {
    const { rows } = await privileged<{ name: string; rls: boolean; forced: boolean }>(db,
      `select (n.nspname || '.' || c.relname) name, c.relrowsecurity rls, c.relforcerowsecurity forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace where (n.nspname || '.' || c.relname) = any($1) order by 1`, [TABLES]);
    expect(rows.map(row => row.name).sort()).toEqual([...TABLES].sort());
    for (const row of rows) expect([row.name, row.rls, row.forced]).toEqual([row.name, true, true]);
  });

  it('gives consumers read-only owner tables and nothing on the private ones', async () => {
    const { rows } = await privileged<Record<string, boolean>>(db,
      `select has_table_privilege('authenticated','public.treatment_programmes','SELECT') head_read,
              has_table_privilege('authenticated','public.treatment_programme_events','SELECT') event_read,
              has_table_privilege('authenticated','public.treatment_programmes','INSERT,UPDATE,DELETE,TRUNCATE') head_write,
              has_table_privilege('authenticated','public.treatment_programme_events','INSERT,UPDATE,DELETE,TRUNCATE') event_write,
              has_table_privilege('authenticated','strandcue_private.treatment_programme_operations','SELECT,INSERT,UPDATE,DELETE') receipts,
              has_table_privilege('authenticated','strandcue_private.programme_rule_publications','SELECT,INSERT,UPDATE,DELETE') rules,
              has_table_privilege('authenticated','strandcue_private.execution_step_care','SELECT,INSERT,UPDATE,DELETE') care,
              has_table_privilege('anon','public.treatment_programmes','SELECT') anon_head,
              has_table_privilege('anon','public.treatment_programme_events','SELECT') anon_event`);
    expect(rows[0]).toEqual({ head_read: true, event_read: true, head_write: false, event_write: false, receipts: false, rules: false, care: false, anon_head: false, anon_event: false });
  });

  it('denies direct authenticated writes to every programme table', async () => {
    await asUser(db, USER_A);
    for (const sql of [
      `insert into public.treatment_programmes(user_id,product_id,product_version_id,rule_id,rule_version,artifact_id,artifact_version,content_digest,start_precision,start_value,status,revision) values ('${USER_A}','${PRODUCT_ID}','${VERSION_ID}','r','1','a','1','sha256:${'a'.repeat(64)}','day','2026-09-01','active',1)`,
      `update public.treatment_programmes set revision = revision + 1`,
      `delete from public.treatment_programmes`,
      `insert into public.treatment_programme_events(user_id,enrolment_id,sequence,kind) values ('${USER_A}','${crypto.randomUUID()}',1,'enrol')`,
      `delete from public.treatment_programme_events`,
      `select * from strandcue_private.treatment_programme_operations`,
      `select * from strandcue_private.programme_rule_publications`,
      `select * from strandcue_private.execution_step_care`,
    ]) {
      await expect(db.exec(sql), sql).rejects.toThrow(/permission denied|row-level security/i);
    }
  });

  it('keeps wrappers invoker-owned by the migration role and cores hardened definers', async () => {
    const { rows } = await privileged<{ name: string; definer: boolean; config: string[] | null; owner: string }>(db,
      `select p.proname name, p.prosecdef definer, p.proconfig config, pg_get_userbyid(p.proowner) owner
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname = 'public' and p.proname in ('enrol_programme','change_programme','list_programmes','get_programme','treatment_programme_operation_retention_cleanup'))
           or (n.nspname = 'strandcue_private' and p.proname like 'programme\\_%') order by 1`);
    const names = rows.map(row => row.name);
    for (const expected of ['enrol_programme', 'change_programme', 'list_programmes', 'get_programme', 'programme_enrol_core', 'programme_change_core', 'programme_list_core', 'programme_get_core', 'programme_evaluate']) {
      expect(names, expected).toContain(expected);
    }
    for (const row of rows) {
      expect((row.config ?? []).some(entry => /^search_path=(pg_catalog, pg_temp|"")$/.test(entry)), `${row.name} pins its search path`).toBe(true);
    }
    for (const row of rows.filter(row => row.name.startsWith('programme_') && row.name.endsWith('_core'))) {
      expect(row.definer, row.name).toBe(true);
      expect(row.owner, row.name).toBe('strandcue_mutator');
    }
    for (const row of rows.filter(row => ['enrol_programme', 'change_programme', 'list_programmes', 'get_programme'].includes(row.name))) {
      expect(row.definer, row.name).toBe(false);
    }
  });

  it('grants the four RPCs to authenticated only and no private function to consumers', async () => {
    const { rows } = await privileged<{ name: string; anon: boolean; authenticated: boolean; pub: boolean }>(db,
      `select p.oid::regprocedure::text name,
              has_function_privilege('anon', p.oid, 'EXECUTE') anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated,
              has_function_privilege('public', p.oid, 'EXECUTE') pub
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname = 'public' and p.proname in ('enrol_programme','change_programme','list_programmes','get_programme'))
           or (n.nspname = 'strandcue_private' and p.proname like 'programme\\_%')`);
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const row of rows) {
      expect(row.anon, row.name).toBe(false);
      expect(row.pub, row.name).toBe(false);
      if (row.name.startsWith('public.')) expect(row.authenticated, row.name).toBe(true);
    }
  });

  it('refuses TRUNCATE of programme history while any exists, and lets a profile delete cascade', async () => {
    const programme = await enrolled();
    expect(programme.record.revision).toBe(1);
    await expect(privileged(db, 'truncate public.treatment_programme_events cascade')).rejects.toThrow(/programme-event-immutable/);
    await expect(privileged(db, 'truncate public.treatment_programmes cascade')).rejects.toThrow(/programme-(event|head)-immutable/);
    await db.exec('set session authorization postgres');
    await db.exec('delete from public.profiles');
    expect(await programmeCounts(db)).toEqual({ heads: 0, events: 0, receipts: 0 });
  });
  it('replays safely: running the migration again changes no owner, ACL, setting, policy, trigger or behaviour', async () => {
    const migration = await readFile('supabase/migrations/20261025120000_treatment_programmes.sql', 'utf8');
    const fingerprint = async () => {
      const part = async (sql: string) => (await privileged<{ h: string }>(db, `select coalesce(md5(string_agg(x, ',' order by x)), '') h from (${sql}) t(x)`)).rows[0]!.h;
      return {
        functions: await part(`select concat_ws('|', p.oid::regprocedure::text, pg_get_userbyid(p.proowner), coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), ''), coalesce(p.proconfig::text, ''), p.prosecdef::text)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where (n.nspname = 'public' and p.proname ~ 'programme')
            or (n.nspname = 'strandcue_private' and (p.proname like 'programme\_%' or p.proname like 'export_build_csv%' or p.proname like 'request_export%'))`),
        tables: await part(`select concat_ws('|', c.oid::regclass::text, pg_get_userbyid(c.relowner), coalesce((select string_agg(a::text, ',' order by a::text) from unnest(c.relacl) a), ''), c.relrowsecurity::text, c.relforcerowsecurity::text)
          from pg_class c where c.oid::regclass::text ~ '(treatment_programme|programme_rule_publications|execution_step_care)' and c.relkind = 'r'`),
        policies: await part(`select concat_ws('|', schemaname, tablename, policyname, cmd, roles::text, coalesce(qual, ''), coalesce(with_check, ''))
          from pg_policies where tablename ~ '(treatment_programme|programme_rule_publications|execution_step_care)'`),
        triggers: await part(`select concat_ws('|', tgrelid::regclass::text, tgname) from pg_trigger where not tgisinternal and tgrelid::regclass::text ~ '(treatment_programme|programme_rule_publications)'`),
        indexes: await part(`select indexname from pg_indexes where tablename ~ '(treatment_programme|programme_rule_publications|execution_step_care)'`),
      };
    };
    const before = await fingerprint();
    await db.exec('set session authorization postgres');
    await db.exec(migration);
    await db.exec(migration);
    expect(await fingerprint()).toEqual(before);
    await asUser(db, USER_A);
    const programme = await enrolled({ washes: 1, selected: true });
    expect((await getProgramme(db, programme.record.enrolmentId)).evaluation).toMatchObject({ count: 1 });
  }, 60_000);
});

describe('authentication and account state', () => {
  it('refuses anonymous callers on every entry point and returns nothing', async () => {
    const { identity } = await publishedRule(db);
    await asUser(db, null);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId })).rejects.toThrow(/permission denied/i);
    await expect(changeProgramme(db, { enrolmentId: crypto.randomUUID(), expectedRevision: 1, command: { kind: 'pause' } })).rejects.toThrow(/permission denied/i);
    await expect(listProgrammes(db)).rejects.toThrow(/permission denied/i);
    await expect(getProgramme(db, crypto.randomUUID())).rejects.toThrow(/permission denied/i);
    await expect(db.exec('select * from public.treatment_programmes')).rejects.toThrow(/permission denied/i);
  });

  it('requires an active account on every entry point', async () => {
    const { identity } = await publishedRule(db);
    await asUser(db, UNVERIFIED);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId })).rejects.toThrow(/account-not-active/);
    await expect(listProgrammes(db)).rejects.toThrow(/account-not-active/);
    await expect(getProgramme(db, crypto.randomUUID())).rejects.toThrow(/account-not-active/);
    await expect(changeProgramme(db, { enrolmentId: crypto.randomUUID(), expectedRevision: 1, command: { kind: 'pause' } })).rejects.toThrow(/account-not-active/);
  });

  it('refuses an owner whose account is being deleted', async () => {
    const programme = await enrolled();
    await privileged(db, `update public.profiles set account_status = 'deleting' where user_id = $1`, [USER_A]);
    await expect(getProgramme(db, programme.record.enrolmentId)).rejects.toThrow(/account-not-active/);
    await expect(listProgrammes(db)).rejects.toThrow(/account-not-active/);
    await expect(changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'select-application', eventId: 'x' } })).rejects.toThrow(/account-not-active/);
  });
});

describe('enrolment and the reviewed rule', () => {
  it('stores identity and the server-loaded publication binding, never a count or due status', async () => {
    const { identity, record } = await enrolled();
    expect(record).toMatchObject({
      productId: PRODUCT_ID, productVersionId: VERSION_ID, ruleId: identity.ruleId, ruleVersion: '1', revision: 1, status: 'active',
      startDate: { precision: 'exact', value: START }, selectedApplicationEventId: null,
      rulePublication: { artifactId: identity.artifactId, artifactVersion: '1', contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      paused: null, resumed: null, maintenanceTransition: null, completed: null,
    });
    for (const forbidden of ['count', 'dueStatus', 'state', 'evaluation', 'eventsUsed', 'washCount']) expect(record, forbidden).not.toHaveProperty(forbidden);
    const columns = await privileged<{ column_name: string }>(db,
      `select column_name from information_schema.columns where table_schema = 'public' and table_name in ('treatment_programmes','treatment_programme_events')`);
    for (const forbidden of ['count', 'due_status', 'wash_count', 'state', 'qualifying_count', 'count_at_transition']) {
      expect(columns.rows.map(row => row.column_name), forbidden).not.toContain(forbidden);
    }
  });

  it('is blocked by reviewed content when no published rule exists, leaving no row or receipt', async () => {
    const before = await programmeCounts(db);
    const failure = await failureOf(() => enrolProgramme(db, { ruleId: 'no-such-rule' }));
    expect(failure.message).toMatch(/rule-content-pending/);
    expect(await programmeCounts(db)).toEqual(before);
  });

  it('treats a draft rule as pending content and a withdrawn rule as withdrawn', async () => {
    const draft = nextIdentity();
    await seedRulePublication(db, { identity: draft, state: 'draft' });
    await expect(enrolProgramme(db, { ruleId: draft.ruleId })).rejects.toThrow(/rule-content-pending/);
    const withdrawn = nextIdentity();
    await seedRulePublication(db, { identity: withdrawn, state: 'published' });
    await privileged(db, `update strandcue_private.programme_rule_publications set state = 'withdrawn' where artifact_id = $1`, [withdrawn.artifactId]);
    await expect(enrolProgramme(db, { ruleId: withdrawn.ruleId })).rejects.toThrow(/rule-withdrawn/);
    expect(await programmeCounts(db)).toEqual({ heads: 0, events: 0, receipts: 0 });
  });

  it('refuses a product or version that is not the rule\'s exact identity', async () => {
    const { identity } = await publishedRule(db);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId, versionId: OTHER_VERSION_ID, productId: PRODUCT_ID })).rejects.toThrow(/product-mismatch/);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId, versionId: crypto.randomUUID() })).rejects.toThrow(/product-mismatch/);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId, productId: crypto.randomUUID() })).rejects.toThrow(/product-mismatch/);
    expect(await programmeCounts(db)).toEqual({ heads: 0, events: 0, receipts: 0 });
  });

  it('bounds every external identifier and reason code', async () => {
    const { identity } = await publishedRule(db);
    for (const options of [
      { ruleId: 'x'.repeat(201) }, { ruleId: '' }, { ruleId: identity.ruleId, ruleVersion: 'v'.repeat(201) }, { ruleId: identity.ruleId, ruleVersion: '' },
      { ruleId: identity.ruleId, startDate: { precision: 'unknown', value: null } },
      { ruleId: identity.ruleId, startDate: { precision: 'approximate', value: '2026-09' } },
      { ruleId: identity.ruleId, startDate: { precision: 'day', value: '2999-01-01' } },
      { ruleId: identity.ruleId, startDate: { precision: 'exact', value: '2026-09-01T08:00:00' } },
      { ruleId: identity.ruleId, startDate: { precision: 'day', value: '2026-09-01', extra: 1 } },
      { ruleId: identity.ruleId, selectedApplicationEventId: 'e'.repeat(401) },
    ]) {
      const failure = await failureOf(() => enrolProgramme(db, options as any));
      expect(failure.message, JSON.stringify(options).slice(0, 60)).toMatch(/invalid-programme|application-missing/);
    }
    expect(await programmeCounts(db)).toEqual({ heads: 0, events: 0, receipts: 0 });
  });

  it('refuses a selected application that is not one of the owner\'s confirmed applications', async () => {
    const { identity } = await publishedRule(db);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId, selectedApplicationEventId: 'not-an-event' })).rejects.toThrow(/application-missing/);
    expect(await programmeCounts(db)).toEqual({ heads: 0, events: 0, receipts: 0 });
  });

  it('accepts a start after an earlier application (a new cycle) and reports the mismatch honestly until it is closed or a newer application arrives', async () => {
    const { identity } = await publishedRule(db);
    await seedExecutionCare(db, USER_A, careSpecs(1));
    await asUser(db, USER_A);
    const record = await enrolProgramme(db, { ruleId: identity.ruleId, startDate: { precision: 'day', value: '2026-09-10' } });
    expect((await getProgramme(db, record.enrolmentId)).evaluation.missing.map((item: any) => item.code)).toEqual(['application-before-enrolment']);
    await seedExecutionCare(db, USER_A, [{ kind: 'application', at: '2026-09-12T08:00:00.000Z', session: 'second-cycle' }]);
    await asUser(db, USER_A);
    const detail = await getProgramme(db, record.enrolmentId);
    expect(detail.evaluation.missing.map((item: any) => item.code)).toEqual(['multiple-treatment-applications']);
  });

  it('enforces a duplicate-active guard and per-owner quotas atomically', async () => {
    const first = await publishedRule(db);
    await enrolProgramme(db, { ruleId: first.identity.ruleId });
    await expect(enrolProgramme(db, { ruleId: first.identity.ruleId })).rejects.toThrow(/duplicate-active/);
    for (let index = 0; index < 4; index += 1) {
      const next = await publishedRule(db);
      await enrolProgramme(db, { ruleId: next.identity.ruleId });
    }
    const over = await publishedRule(db);
    const before = await programmeCounts(db);
    await expect(enrolProgramme(db, { ruleId: over.identity.ruleId })).rejects.toThrow(/quota-exceeded/);
    expect(await programmeCounts(db)).toEqual(before);
  }, 60_000);

  it('rejects a client trying to supply derived or authoritative facts', async () => {
    const programme = await enrolled();
    const id = programme.record.enrolmentId;
    for (const command of [
      { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel', count: 3 },
      { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel', dueStatus: 'due' },
      { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z', snapshot: { count: 9 } },
      { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z', rulePublication: { artifactId: 'x' } },
      { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z', eventsUsed: [] },
      { kind: 'maintenance', transitionedAt: '2026-09-20T00:00:00.000Z', ruleId: programme.identity.ruleId, ruleVersion: '1', countAtTransition: 3 },
      { kind: 'select-application', eventId: 'x', state: 'maintenance' },
      { kind: 'unknown-kind' }, {}, 'text', 12, null,
    ]) {
      const failure = await failureOf(() => changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command }));
      expect(failure.message, JSON.stringify(command)).toMatch(/invalid-command/);
    }
    // The enrol signature has no parameter for any authoritative fact.
    await expect(db.query(`select public.enrol_programme($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb)`,
      [crypto.randomUUID(), PRODUCT_ID, VERSION_ID, programme.identity.ruleId, '1', '{"precision":"day","value":"2026-09-01"}', null, '{"count":9}'])).rejects.toThrow(/does not exist/i);
    expect(await programmeCounts(db)).toMatchObject({ heads: 1, events: 1, receipts: 1 });
  });
});

describe('derived state, counts and due status', () => {
  it('has no application yet: needs_input naming the missing application', async () => {
    const programme = await enrolled({ specs: [] });
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ state: 'not_started', dueStatus: 'needs_input', missing: [{ code: 'missing-treatment-application' }] });
    await parity(programme);
  });

  it('derives the count and due status on read and never stores them', async () => {
    const programme = await enrolled({ washes: 0, selected: true });
    const id = programme.record.enrolmentId;
    expect((await getProgramme(db, id)).evaluation).toMatchObject({ state: 'initial', dueStatus: 'not_due', count: 0, range: { minimum: 2, maximum: 4 } });
    const more = await seedExecutionCare(db, USER_A, WASH_ATS.slice(0, 2).map((at, index): CareSpec => ({ kind: 'wash', at, session: `later-${index}` })));
    await asUser(db, USER_A);
    let detail = await getProgramme(db, id);
    expect(detail.evaluation).toMatchObject({ state: 'reassessment', dueStatus: 'eligible', count: 2, unit: 'wash' });
    expect(detail.evaluation.eventsUsed.map((item: any) => item.eventId)).toEqual(more.map(item => item.eventId));
    expect(detail.revision).toBe(1);
    await seedExecutionCare(db, USER_A, WASH_ATS.slice(2, 4).map((at, index): CareSpec => ({ kind: 'wash', at, session: `later-b${index}` })));
    await asUser(db, USER_A);
    detail = await getProgramme(db, id);
    expect(detail.evaluation).toMatchObject({ state: 'reassessment', dueStatus: 'due', count: 4 });
    expect(await programmeCounts(db)).toMatchObject({ heads: 1, events: 1 });
  });

  it('matches the TypeScript domain evaluator across the counting scenarios', async () => {
    for (const washes of [0, 1, 2, 3, 5]) {
      const programme = await enrolled({ washes, selected: washes % 2 === 0 });
      await parity(programme);
      await freshOwner();
    }
  }, 120_000);

  it('counts shampoo sessions and treats unknown shampoo use as missing', async () => {
    const programme = await enrolled({ rule: { unit: 'shampoo-session' }, specs: [
      { kind: 'application', at: APP_AT, session: 'app' },
      { kind: 'wash', at: WASH_ATS[0], session: 'w1', shampoo: 'yes' }, { kind: 'wash', at: WASH_ATS[1], session: 'w2', shampoo: 'no' },
      { kind: 'wash', at: WASH_ATS[2], session: 'w3', shampoo: 'unknown' }] });
    const { evaluation } = await parity(programme);
    expect(evaluation).toMatchObject({ dueStatus: 'needs_input', missing: [{ code: 'shampoo-use-unknown' }] });
    expect(evaluation).not.toHaveProperty('count');
  });

  it('does not count the application wash when the rule says so, and counts it when the rule says so', async () => {
    const specs: CareSpec[] = [
      { kind: 'wash', at: '2026-09-02T08:30:00.000Z', session: 'app', shampoo: 'yes' },
      { kind: 'application', at: APP_AT, session: 'app' },
      { kind: 'wash', at: WASH_ATS[0], session: 'w1' }];
    for (const applicationWashCounts of [false, true]) {
      const programme = await enrolled({ specs, rule: { applicationWashCounts } });
      const { evaluation } = await parity(programme);
      expect(evaluation.count).toBe(applicationWashCounts ? 2 : 1);
      await freshOwner();
    }
  });

  it('places owner-recorded wash activities by their recorded precision', async () => {
    const programme = await enrolled({ washes: 0, selected: true });
    const day = await recordWashActivity(db, USER_A, '2026-09-06T09:00:00.000Z', 'exact_day');
    const month = await recordWashActivity(db, USER_A, '2026-09-07T09:00:00.000Z', 'exact_month');
    await recordWashActivity(db, USER_A, '2026-08-01T09:00:00.000Z', 'exact_day');
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation.missing.map((item: any) => item.code)).toEqual(['date-precision-too-coarse']);
    expect(detail.evaluation).toMatchObject({ dueStatus: 'needs_input' });
    await parity(programme, [
      { eventId: day.eventId, activityId: day.activityId, date: { precision: 'day', value: '2026-09-06' } },
      { eventId: month.eventId, activityId: month.activityId, date: { precision: 'approximate', value: '2026-09' } },
    ]);
  });

  it('reads the offset-form confirmation instant the real execution core writes and normalises it to UTC', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    const wash = programme.seeded.find(item => item.kind === 'wash')!;
    await privileged(db, `update public.protocol_executions set execution = jsonb_set(execution, '{steps,0,confirmedAt}', '"2026-09-05T10:00:00.057+02:00"'::jsonb) where execution_id = $1`, [wash.executionId]);
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ count: 2 });
    expect(detail.evaluation.eventsUsed.find((item: any) => item.eventId === wash.eventId).date).toEqual({ precision: 'exact', value: '2026-09-05T08:00:00.057Z' });
  });

  it('fails closed on a confirmed step with no trusted classification', async () => {
    const programme = await enrolled({ washes: 1, selected: true });
    await privileged(db, `delete from strandcue_private.execution_step_care where kind = 'wash'`);
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ dueStatus: 'needs_input', missing: [{ code: 'invalid-or-unsupported-event-facts' }] });
  });

  it('is needs_input for an unverified product version without trusting the owner', async () => {
    const identity = nextIdentity();
    await seedRulePublication(db, { identity, rule: { ...ruleFixture(identity), productVersionId: UNVERIFIED_VERSION_ID } });
    const record = await enrolProgramme(db, { ruleId: identity.ruleId, versionId: UNVERIFIED_VERSION_ID });
    const detail = await getProgramme(db, record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ state: 'not_started', dueStatus: 'needs_input' });
    expect(detail.evaluation.missing.map((item: any) => item.code)).toContain('product-unverified');
  });

  it('blocks honestly when the exact publication is withdrawn or does not match the stored binding', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    await privileged(db, `update strandcue_private.programme_rule_publications set state = 'withdrawn' where artifact_id = $1`, [programme.identity.artifactId]);
    let detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation.missing.map((item: any) => item.code)).toEqual(['rule-withdrawn']);
    expect(detail.evaluation).toMatchObject({ state: 'not_started', dueStatus: 'needs_input' });
    await db.exec('set session authorization postgres');
    await db.exec("set session_replication_role = replica");
    await db.exec(`update public.treatment_programmes set content_digest = 'sha256:${'b'.repeat(64)}'`);
    await db.exec(`update strandcue_private.programme_rule_publications set state = 'published' where artifact_id = '${programme.identity.artifactId}'`);
    await db.exec("set session_replication_role = origin");
    await asUser(db, USER_A);
    detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation.missing.map((item: any) => item.code)).toContain('rule-publication-mismatch');
  });
});

describe('lifecycle: pause, resume, maintenance and completion', () => {
  const PAUSE = { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' };
  const RESUME = { kind: 'resume', resumedAt: '2026-09-13T00:00:00.000Z', resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1' };

  it('pauses without a matching resumption as paused/needs_input and appends history', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const paused = await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: PAUSE });
    expect(paused).toMatchObject({ revision: 2, paused: { pausedAt: PAUSE.pausedAt, reasonCode: 'travel' }, resumed: null });
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ state: 'paused', dueStatus: 'needs_input', missing: [{ code: 'interruption-without-resumption' }] });
    expect(detail.history.map((item: any) => item.kind)).toEqual(['enrol', 'pause']);
    await parity(programme);
  });

  it('enforces pause chronology, one pause cycle and valid reason codes', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const id = programme.record.enrolmentId;
    const before = await programmeCounts(db);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2026-08-01T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2999-01-01T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2026-09-09' } })).rejects.toThrow(/invalid-command/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, reasonCode: 'Not A Code!' } })).rejects.toThrow(/invalid-command/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, reasonCode: 'a'.repeat(65) } })).rejects.toThrow(/invalid-command/);
    expect(await programmeCounts(db)).toEqual(before);
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: PAUSE });
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: PAUSE })).rejects.toThrow(/invalid-lifecycle/);
  });

  it('resumes only with the exact reviewed resumption rule and valid chronology, then excludes pause-window events', async () => {
    const programme = await enrolled({ washes: 5, selected: true });
    const id = programme.record.enrolmentId;
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: RESUME })).rejects.toThrow(/invalid-lifecycle/);
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: PAUSE });
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumptionRuleId: 'other-rule' } })).rejects.toThrow(/resumption-rule-mismatch/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumptionRuleVersion: '9' } })).rejects.toThrow(/resumption-rule-mismatch/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-09T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-08T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2999-01-01T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    const resumed = await changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: RESUME });
    expect(resumed).toMatchObject({ revision: 3, resumed: { resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1', resumedAt: RESUME.resumedAt } });
    const { evaluation } = await parity(programme);
    expect(evaluation.count).toBe(4);
    expect(evaluation.eventsUsed.map((item: any) => item.eventId)).not.toContain(programme.seeded.find(item => item.at === WASH_ATS[2])!.eventId);
  });

  it('refuses to pause when the rule defines no approved resumption, so no programme can be stranded', async () => {
    const programme = await enrolled({ washes: 1, selected: true, rule: { resumptionRule: undefined } });
    const before = await programmeCounts(db);
    await expect(changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: PAUSE })).rejects.toThrow(/pause-resumption-required/);
    expect(await programmeCounts(db)).toEqual(before);
  });

  it('refuses a resume whose pause window would hide the confirmed application, or a maintenance dated inside the pause window', async () => {
    const programme = await enrolled({ washes: 5, selected: true });
    const id = programme.record.enrolmentId;
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2026-09-02T00:00:00.000Z' } });
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-03T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await freshOwner();
    // Another application outside the window survives, and the selected one is outside it: the resume is allowed.
    const survivor = await enrolled({ specs: [...careSpecs(1), { kind: 'application', at: '2026-09-10T08:00:00.000Z', session: 'app-late' }], selected: true });
    await changeProgramme(db, { enrolmentId: survivor.record.enrolmentId, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2026-09-09T00:00:00.000Z' } });
    await expect(changeProgramme(db, { enrolmentId: survivor.record.enrolmentId, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-11T00:00:00.000Z' } })).resolves.toBeDefined();
    await freshOwner();
    const second = await enrolled({ washes: 5, selected: true });
    const sid = second.record.enrolmentId;
    await changeProgramme(db, { enrolmentId: sid, expectedRevision: 1, command: PAUSE });
    await changeProgramme(db, { enrolmentId: sid, expectedRevision: 2, command: RESUME });
    await expect(changeProgramme(db, { enrolmentId: sid, expectedRevision: 3, command: { kind: 'maintenance', transitionedAt: '2026-09-10T00:00:00.000Z', ruleId: second.identity.ruleId, ruleVersion: '1' } })).rejects.toThrow(/invalid-chronology/);
  });

  it('records a maintenance transition only when the count at that instant meets the reviewed threshold', async () => {
    const programme = await enrolled({ washes: 5, selected: true });
    const id = programme.record.enrolmentId;
    const transition = (transitionedAt: string, extra: Record<string, unknown> = {}) => ({ kind: 'maintenance', transitionedAt, ruleId: programme.identity.ruleId, ruleVersion: '1', ...extra });
    // Only two washes had happened by 2026-09-09; the threshold is three. Later washes cannot justify it.
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: transition('2026-09-09T00:00:00.000Z') })).rejects.toThrow(/maintenance-not-proven/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: transition('2026-09-12T00:00:00.000Z', { ruleId: 'other' }) })).rejects.toThrow(/maintenance-not-proven/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: transition('2999-01-01T00:00:00.000Z') })).rejects.toThrow(/invalid-chronology/);
    const done = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: transition('2026-09-12T00:00:00.000Z') });
    expect(done).toMatchObject({ revision: 2, maintenanceTransition: { transitionedAt: '2026-09-12T00:00:00.000Z', ruleId: programme.identity.ruleId, ruleVersion: '1' } });
    expect(JSON.stringify(done)).not.toMatch(/countAtTransition|qualifying/);
    const { evaluation } = await parity(programme);
    expect(evaluation.state).toBe('maintenance');
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: transition('2026-09-15T00:00:00.000Z') })).rejects.toThrow(/invalid-lifecycle/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: PAUSE })).rejects.toThrow(/invalid-lifecycle/);
  });

  it('refuses a maintenance transition with no reviewed maintenance policy or with an unknown-date wash', async () => {
    const noPolicy = await enrolled({ washes: 5, selected: true, rule: { transitionPolicy: { initialPhaseLimit: 1, reassessmentThreshold: 3 } } });
    await expect(changeProgramme(db, { enrolmentId: noPolicy.record.enrolmentId, expectedRevision: 1, command: { kind: 'maintenance', transitionedAt: '2026-09-12T00:00:00.000Z', ruleId: noPolicy.identity.ruleId, ruleVersion: '1' } })).rejects.toThrow(/maintenance-not-proven/);
    await freshOwner();
    const unknown = await enrolled({ washes: 3, selected: true });
    await recordWashActivity(db, USER_A, '2026-09-10T09:00:00.000Z', 'exact_year');
    await expect(changeProgramme(db, { enrolmentId: unknown.record.enrolmentId, expectedRevision: 1, command: { kind: 'maintenance', transitionedAt: '2026-09-12T00:00:00.000Z', ruleId: unknown.identity.ruleId, ruleVersion: '1' } })).rejects.toThrow(/maintenance-not-proven/);
  });

  it('completes once with a server-built immutable snapshot that satisfies the domain contract', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const id = programme.record.enrolmentId;
    const completedAt = '2026-09-20T10:00:00.000Z';
    const done = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'complete', completedAt } });
    expect(done).toMatchObject({ status: 'completed', revision: 2 });
    const snapshot = done.completed.snapshot;
    expect(() => CompletedSnapshotSchema.parse(snapshot)).not.toThrow();
    const app = programme.seeded.find(item => item.kind === 'application')!;
    expect(snapshot).toMatchObject({
      enrolmentId: id, productId: PRODUCT_ID, productVersionId: VERSION_ID, ruleId: programme.identity.ruleId, ruleVersion: '1',
      rulePublication: programme.record.rulePublication, state: 'completed', dueStatus: 'eligible', unit: 'wash', count: 3,
      range: { minimum: 2, maximum: 4 }, application: { eventId: app.eventId, kind: 'application', date: { precision: 'exact', value: APP_AT } }, completedAt,
    });
    const ids = snapshot.eventsUsed.map((item: any) => item.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(app.eventId);
    expect(ids).toHaveLength(4);
    expect(Date.parse(snapshot.asOf)).toBeGreaterThanOrEqual(Date.parse(completedAt));
    await parity(programme);
  });

  it('builds a backdated completion from the evidence that existed at that time, never later events', async () => {
    const programme = await enrolled({ washes: 5, selected: true });
    const completedAt = '2026-09-09T00:00:00.000Z';
    const done = await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt } });
    const snapshot = done.completed.snapshot;
    expect(snapshot).toMatchObject({ count: 2, completedAt, asOf: completedAt });
    for (const reference of snapshot.eventsUsed) expect(Date.parse(reference.date.value)).toBeLessThanOrEqual(Date.parse(completedAt));
    expect(() => CompletedSnapshotSchema.parse(snapshot)).not.toThrow();
    await parity(programme);
  });

  it('keeps the completed snapshot byte-identical when earlier events are later corrected, and refuses reopening', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const id = programme.record.enrolmentId;
    const done = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' } });
    const before = JSON.stringify((await getProgramme(db, id)).completed);
    await privileged(db, `delete from strandcue_private.execution_step_care where kind = 'wash'`);
    await seedExecutionCare(db, USER_A, [{ kind: 'wash', at: WASH_ATS[3], session: 'late' }]);
    await asUser(db, USER_A);
    const after = await getProgramme(db, id);
    expect(JSON.stringify(after.completed)).toBe(before);
    expect(after.completed.snapshot).toEqual(done.completed.snapshot);
    expect(after.evaluation).toMatchObject({ fromCompletedSnapshot: true, count: 3, dueStatus: 'eligible' });
    for (const command of [PAUSE, { kind: 'complete', completedAt: '2026-09-21T10:00:00.000Z' }, { kind: 'select-application', eventId: 'x' }]) {
      await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command })).rejects.toThrow(/already-completed/);
    }
  });

  it('refuses completion for impossible chronology, a missing application, ambiguity or unproven counts, leaving nothing behind', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    const id = programme.record.enrolmentId;
    const before = await programmeCounts(db);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-01T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'complete', completedAt: '2999-01-01T00:00:00.000Z' } })).rejects.toThrow(/invalid-chronology/);
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: PAUSE });
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/pause-resumption-required/);
    const after = await programmeCounts(db);
    expect({ heads: after.heads, events: after.events - 1, receipts: after.receipts - 1 }).toEqual(before);

    await freshOwner();
    const none = await enrolled({ specs: [] });
    await expect(changeProgramme(db, { enrolmentId: none.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/application-missing/);
    await freshOwner();
    const two = await enrolled({ specs: [...careSpecs(1), { kind: 'application', at: '2026-09-03T08:00:00.000Z', session: 'app2' }] });
    await expect(changeProgramme(db, { enrolmentId: two.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/application-ambiguous/);
    await freshOwner();
    const shampoo = await enrolled({ rule: { unit: 'shampoo-session' }, specs: careSpecs(2, { shampoo: 'unknown' }) });
    await expect(changeProgramme(db, { enrolmentId: shampoo.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/count-not-proven/);
    const rows = await privileged(db, `select count(*)::int n from public.treatment_programme_events where kind = 'complete'`);
    expect(rows.rows[0]).toEqual({ n: 0 });
  }, 60_000);

  it('lets an owner close a programme the rule can no longer serve, frees its slot and derives nothing for it', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    const id = programme.record.enrolmentId;
    await privileged(db, `update strandcue_private.programme_rule_publications set state = 'withdrawn' where artifact_id = $1`, [programme.identity.artifactId]);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'select-application', eventId: programme.seeded[0]!.eventId } })).rejects.toThrow(/rule-withdrawn/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'abandon', reason: 'x' } })).rejects.toThrow(/invalid-command/);
    const closed = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'abandon' } });
    expect(closed).toMatchObject({ status: 'abandoned', revision: 2 });
    const detail = await getProgramme(db, id);
    expect(detail.evaluation).toBeNull();
    expect(detail.history.map((item: any) => item.kind)).toEqual(['enrol', 'abandon']);
    expect((await listProgrammes(db)).items[0].evaluation).toBeNull();
    for (const command of [{ kind: 'abandon' }, { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' }, PAUSE]) {
      await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command })).rejects.toThrow(/already-abandoned/);
    }
    // The slot is free again: the same rule can be enrolled once it is published afresh.
    const next = await publishedRule(db);
    await expect(enrolProgramme(db, { ruleId: next.identity.ruleId })).resolves.toBeDefined();
    await expect(privileged(db, `update public.treatment_programmes set status = 'active', revision = revision + 1 where enrolment_id = $1`, [id])).rejects.toThrow(/programme-head-invalid/);
  });

  it('keeps the executions behind an active programme through the execution purge and releases them afterwards', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    const finishOld = async () => privileged(db,
      `update public.protocol_executions set status = 'completed', execution = jsonb_set(execution, '{finishedAt}', '"2026-01-01T00:00:00.000Z"'::jsonb) where user_id = $1`, [USER_A]);
    const executions = async () => Number((await privileged<{ n: string }>(db, 'select count(*)::text n from public.protocol_executions')).rows[0]!.n);
    await finishOld();
    const total = await executions();
    expect(total).toBeGreaterThan(0);
    await privileged(db, 'select public.protocol_execution_retention_cleanup()');
    expect(await executions()).toBe(total);
    expect((await getProgramme(db, programme.record.enrolmentId)).evaluation).toMatchObject({ count: 2 });
    await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } });
    await privileged(db, 'select public.protocol_execution_retention_cleanup()');
    expect(await executions()).toBe(0);
    expect((await getProgramme(db, programme.record.enrolmentId)).completed.snapshot.count).toBe(2);
  });

  it('releases the executions behind a programme when it is abandoned,', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    await privileged(db, `update public.protocol_executions set status = 'completed', execution = jsonb_set(execution, '{finishedAt}', '"2026-01-01T00:00:00.000Z"'::jsonb)`);
    await privileged(db, 'select public.protocol_execution_retention_cleanup()');
    expect(Number((await privileged<{ n: string }>(db, 'select count(*)::text n from public.protocol_executions')).rows[0]!.n)).toBeGreaterThan(0);
    await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'abandon' } });
    await privileged(db, 'select public.protocol_execution_retention_cleanup()');
    expect(Number((await privileged<{ n: string }>(db, 'select count(*)::text n from public.protocol_executions')).rows[0]!.n)).toBe(0);
  });

  it('truncates stated instants to the millisecond so a pause and resume cannot collapse into an unusable pair', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    const id = programme.record.enrolmentId;
    const paused = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { ...PAUSE, pausedAt: '2026-09-09T00:00:00.000400Z' } });
    expect(paused.paused.pausedAt).toBe('2026-09-09T00:00:00.000Z');
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-09T00:00:00.000600Z' } })).rejects.toThrow(/invalid-chronology/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-13T24:00:00.000Z' } })).rejects.toThrow(/invalid-command/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { ...RESUME, resumedAt: '2026-09-13T23:59:60.000Z' } })).rejects.toThrow(/invalid-command/);
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: RESUME });
  });

  it('derives a long history in linear time', async () => {
    const programme = await enrolled({ specs: [{ kind: 'application', at: APP_AT, session: 'app' }], selected: true });
    const executionId = crypto.randomUUID();
    await privileged(db, `with run as (select request_id from public.recommendation_runs where user_id = $1 limit 1),
      ex as (insert into public.protocol_executions(user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
        select $1, $2::uuid, run.request_id, '{}'::jsonb,
               jsonb_build_object('steps', (select jsonb_agg(jsonb_build_object('stepId', 'w' || g, 'position', g, 'state', 'confirmed',
                 'confirmedAt', to_char(timestamptz '2026-09-05 00:00+00' + g * interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                 'planned', jsonb_build_object('productId', null, 'productVersionId', null))) from generate_series(1, 900) g)), 1, 'completed' from run returning execution_id, recommendation_run_id)
      insert into strandcue_private.execution_step_care(user_id, execution_id, step_id, run_id, kind, shampoo_used)
        select $1, ex.execution_id, 'w' || g, ex.recommendation_run_id, 'wash', 'yes' from ex, generate_series(1, 900) g`, [USER_A, executionId]);
    const started = Date.now();
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ count: 900, dueStatus: 'due' });
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 60_000);

  it('selects one of several confirmed applications explicitly', async () => {
    const programme = await enrolled({ specs: [...careSpecs(1), { kind: 'application', at: '2026-09-03T08:00:00.000Z', session: 'app2' }] });
    const id = programme.record.enrolmentId;
    expect((await getProgramme(db, id)).evaluation.missing.map((item: any) => item.code)).toEqual(['multiple-treatment-applications']);
    const second = programme.seeded.find(item => item.session === 'app2')!;
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'select-application', eventId: 'nope' } })).rejects.toThrow(/application-missing/);
    const changed = await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'select-application', eventId: second.eventId } });
    expect(changed).toMatchObject({ revision: 2, selectedApplicationEventId: second.eventId });
    expect((await parity(programme)).evaluation.application.eventId).toBe(second.eventId);
  });
});

describe('idempotency, concurrency-shaped retries and revisions', () => {
  it('replays an identical enrolment byte-for-byte without a second row or receipt', async () => {
    const { identity } = await publishedRule(db);
    const operationId = crypto.randomUUID();
    const first = await enrolProgramme(db, { operationId, ruleId: identity.ruleId });
    const second = await enrolProgramme(db, { operationId, ruleId: identity.ruleId });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(await programmeCounts(db)).toEqual({ heads: 1, events: 1, receipts: 1 });
  });

  it('refuses the same operation id with a different command as an operation conflict', async () => {
    const { identity } = await publishedRule(db);
    const other = await publishedRule(db);
    const operationId = crypto.randomUUID();
    await enrolProgramme(db, { operationId, ruleId: identity.ruleId });
    await expect(enrolProgramme(db, { operationId, ruleId: other.identity.ruleId })).rejects.toThrow(/operation-conflict/);
    await expect(enrolProgramme(db, { operationId, ruleId: identity.ruleId, startDate: { precision: 'day', value: '2026-09-02' } })).rejects.toThrow(/operation-conflict/);
    expect(await programmeCounts(db)).toEqual({ heads: 1, events: 1, receipts: 1 });
  });

  it('converges a committed-then-lost change on the original receipt', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const id = programme.record.enrolmentId;
    const operationId = crypto.randomUUID();
    const command = { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' };
    await changeProgramme(db, { operationId, enrolmentId: id, expectedRevision: 1, command }); // response "lost"
    const retry = await changeProgramme(db, { operationId, enrolmentId: id, expectedRevision: 1, command });
    expect(retry).toMatchObject({ revision: 2, paused: { reasonCode: 'travel' } });
    expect(await programmeCounts(db)).toMatchObject({ heads: 1, events: 2, receipts: 2 });
    await expect(changeProgramme(db, { operationId, enrolmentId: id, expectedRevision: 1, command: { ...command, reasonCode: 'illness' } })).rejects.toThrow(/operation-conflict/);
  });

  it('enforces the expected revision and keeps a different operation from replaying', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const id = programme.record.enrolmentId;
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } });
    const before = await programmeCounts(db);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'resume', resumedAt: '2026-09-13T00:00:00.000Z', resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1' } })).rejects.toThrow(/revision-conflict/);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 0, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } })).rejects.toThrow(/revision-conflict/);
    expect(await programmeCounts(db)).toEqual(before);
  });

  it('caps lifecycle revisions but always leaves room to complete, and caps per-owner private receipts, with stable codes', async () => {
    const programme = await enrolled({ specs: [...careSpecs(0), { kind: 'application', at: '2026-09-03T08:00:00.000Z', session: 'a2' }] });
    const id = programme.record.enrolmentId;
    const [first, second] = [programme.seeded[0]!.eventId, programme.seeded[1]!.eventId];
    let revision = 1;
    for (let index = 0; index < 48; index += 1) {
      const result = await changeProgramme(db, { enrolmentId: id, expectedRevision: revision, command: { kind: 'select-application', eventId: index % 2 === 0 ? second : first } });
      revision = result.revision;
    }
    expect(revision).toBe(49);
    const before = await programmeCounts(db);
    await expect(changeProgramme(db, { enrolmentId: id, expectedRevision: 49, command: { kind: 'select-application', eventId: first } })).rejects.toThrow(/quota-exceeded/);
    expect(await programmeCounts(db)).toEqual(before);
    const done = await changeProgramme(db, { enrolmentId: id, expectedRevision: 49, command: { kind: 'complete', completedAt: '2026-09-20T00:00:00.000Z' } });
    expect(done).toMatchObject({ status: 'completed', revision: 50 });
    await privileged(db, `insert into strandcue_private.treatment_programme_operations(user_id, operation_id, payload, result)
                          select $1, gen_random_uuid(), '{}'::jsonb, '{}'::jsonb from generate_series(1, 2000)`, [USER_A]);
    const { identity } = await publishedRule(db);
    await expect(enrolProgramme(db, { ruleId: identity.ruleId })).rejects.toThrow(/quota-exceeded/);
  }, 120_000);

  it('keeps one owner\'s receipts invisible: the same operation id works independently for another owner', async () => {
    const { identity } = await publishedRule(db);
    const operationId = crypto.randomUUID();
    const mine = await enrolProgramme(db, { operationId, ruleId: identity.ruleId });
    await asUser(db, USER_B); await complete(db, 'user_b');
    const theirs = await enrolProgramme(db, { operationId, ruleId: identity.ruleId });
    expect(theirs.enrolmentId).not.toBe(mine.enrolmentId);
    expect(await programmeCounts(db)).toMatchObject({ heads: 2, receipts: 2 });
  });
});

describe('owner isolation', () => {
  it('keeps foreign and random programme ids indistinguishable on read and write', async () => {
    const programme = await enrolled({ washes: 2, selected: true });
    await asUser(db, USER_B); await complete(db, 'user_b');
    const random = crypto.randomUUID();
    const foreign = await failureOf(() => getProgramme(db, programme.record.enrolmentId));
    const missing = await failureOf(() => getProgramme(db, random));
    expect(foreign).toEqual(missing);
    expect(foreign.message).toMatch(/programme-not-found/);
    const foreignChange = await failureOf(() => changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } }));
    const missingChange = await failureOf(() => changeProgramme(db, { enrolmentId: random, expectedRevision: 1, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } }));
    expect(foreignChange).toEqual(missingChange);
    expect(JSON.stringify(foreignChange)).not.toContain(programme.record.enrolmentId);
    expect((await listProgrammes(db)).items).toEqual([]);
    expect((await db.query('select * from public.treatment_programmes')).rows).toEqual([]);
    expect((await db.query('select * from public.treatment_programme_events')).rows).toEqual([]);
    const mutated = await privileged(db, `select revision from public.treatment_programmes where enrolment_id = $1`, [programme.record.enrolmentId], USER_B);
    expect(mutated.rows).toEqual([{ revision: 1 }]);
  });

  it('never lets another owner\'s care events count toward a programme', async () => {
    const programme = await enrolled({ washes: 0, selected: true });
    await asUser(db, USER_B); await complete(db, 'user_b');
    await seedExecutionCare(db, USER_B, WASH_ATS.map((at, index): CareSpec => ({ kind: 'wash', at, session: `b-${index}` })));
    await asUser(db, USER_A);
    expect((await getProgramme(db, programme.record.enrolmentId)).evaluation).toMatchObject({ count: 0, dueStatus: 'not_due' });
  });

  it('lists only the owner\'s programmes, paged on immutable keys', async () => {
    const created: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const next = await publishedRule(db);
      created.push((await enrolProgramme(db, { ruleId: next.identity.ruleId })).enrolmentId);
    }
    await asUser(db, USER_B); await complete(db, 'user_b');
    await asUser(db, USER_A);
    const seen: string[] = [];
    let cursor: unknown = null;
    for (let page = 0; page < 5; page += 1) {
      const result = await listProgrammes(db, 2, cursor);
      seen.push(...result.items.map((item: any) => item.enrolmentId));
      for (const item of result.items) expect(item.evaluation).toBeDefined();
      cursor = result.nextCursor;
      if (cursor === null) break;
    }
    expect(seen.sort()).toEqual([...created].sort());
    await expect(listProgrammes(db, 0)).rejects.toThrow(/invalid-limit/);
    await expect(listProgrammes(db, 21)).rejects.toThrow(/invalid-limit/);
    await expect(listProgrammes(db, 5, { createdAt: 'x' })).rejects.toThrow(/invalid-cursor/);
  });
});

describe('append-only history and authority integrity', () => {
  it('refuses direct rewrites and deletes of lifecycle history and snapshots, even privileged', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' } });
    for (const sql of [
      `update public.treatment_programme_events set snapshot = '{}'::jsonb where kind = 'complete'`,
      `update public.treatment_programme_events set occurred_at = now()`,
      `delete from public.treatment_programme_events where kind = 'complete'`,
      `delete from public.treatment_programme_events`,
      `delete from public.treatment_programmes`,
      `update public.treatment_programmes set status = 'active'`,
      `update public.treatment_programmes set rule_id = 'other'`,
      `update public.treatment_programmes set content_digest = 'sha256:${'c'.repeat(64)}'`,
      `update public.treatment_programmes set revision = revision + 1`,
      `update public.treatment_programmes set user_id = '${USER_B}'`,
    ]) {
      await expect(privileged(db, sql), sql).rejects.toThrow(/programme-(event|head)-(immutable|invalid)/);
    }
    expect((await programmeCounts(db))).toMatchObject({ heads: 1, events: 2 });
  });

  it('rejects a snapshot that breaks the contract at the table level', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    const done = await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' } });
    const good = done.completed.snapshot;
    const bad = [
      { ...good, count: -1 }, { ...good, eventsUsed: [...good.eventsUsed, good.eventsUsed[0]] }, { ...good, eventsUsed: [...good.eventsUsed].reverse() },
      { ...good, eventsUsed: good.eventsUsed.filter((item: any) => item.kind !== 'application') }, { ...good, completedAt: '2026-08-01T00:00:00.000Z' },
      { ...good, asOf: '2026-09-01T00:00:00.000Z' }, { ...good, extra: true }, { ...good, state: 'initial' },
      { ...good, eventsUsed: [{ ...good.eventsUsed[0], date: { precision: 'zzz', value: 5 } }, ...good.eventsUsed.slice(1)] },
    ];
    for (const snapshot of bad) {
      await expect(privileged(db,
        `insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, occurred_at, snapshot)
         values ($1, $2, 9, 'complete', now(), $3::jsonb)`, [USER_A, programme.record.enrolmentId, JSON.stringify(snapshot)])).rejects.toThrow(/violates check constraint|programme-/);
    }
  });

  it('rejects a head change that has no matching append-only history row', async () => {
    const programme = await enrolled({ washes: 1, selected: true });
    await expect(privileged(db, `update public.treatment_programmes set revision = 2 where enrolment_id = $1`, [programme.record.enrolmentId])).rejects.toThrow(/programme-head-invalid/);
    await expect(privileged(db, `update public.treatment_programmes set status = 'completed', revision = 2 where enrolment_id = $1`, [programme.record.enrolmentId])).rejects.toThrow(/programme-head-invalid/);
  });

  it('leaves catalogue, reviewed rule, evidence and publication rows byte-identical across every owner operation', async () => {
    const programme = await enrolled({ washes: 5, selected: true });
    const digest = async () => (await privileged<{ h: string }>(db,
      `select md5(concat_ws('|',
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.brands t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.products t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_versions t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_claims t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_sources t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_verification_events t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_publications t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from public.product_claim_evidence t),
        (select coalesce(string_agg(t::text, ',' order by t::text), '') from strandcue_private.programme_rule_publications t))) h`)).rows[0]!.h;
    const before = await digest();
    const id = programme.record.enrolmentId;
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } });
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 2, command: { kind: 'resume', resumedAt: '2026-09-13T00:00:00.000Z', resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1' } });
    await changeProgramme(db, { enrolmentId: id, expectedRevision: 3, command: { kind: 'maintenance', transitionedAt: '2026-09-16T00:00:00.000Z', ruleId: programme.identity.ruleId, ruleVersion: '1' } });
    await getProgramme(db, id);
    await listProgrammes(db);
    expect(await digest()).toBe(before);
  });

  it('refuses to edit or delete a published rule except by withdrawing it', async () => {
    const { identity } = await publishedRule(db);
    for (const sql of [
      `update strandcue_private.programme_rule_publications set rule = rule || '{"unit":"shampoo-session"}'::jsonb where artifact_id = '${identity.artifactId}'`,
      `update strandcue_private.programme_rule_publications set content_digest = 'sha256:${'d'.repeat(64)}' where artifact_id = '${identity.artifactId}'`,
      `delete from strandcue_private.programme_rule_publications where artifact_id = '${identity.artifactId}'`,
    ]) {
      await expect(privileged(db, sql), sql).rejects.toThrow(/programme-rule-immutable|violates check constraint/);
    }
    await privileged(db, `update strandcue_private.programme_rule_publications set state = 'withdrawn' where artifact_id = $1`, [identity.artifactId]);
    await expect(privileged(db, `update strandcue_private.programme_rule_publications set state = 'published' where artifact_id = $1`, [identity.artifactId])).rejects.toThrow(/programme-rule-immutable/);
  });

  it('refuses a rule publication that is not digest-bound, malformed, or reviewed by its own author', async () => {
    const identity = nextIdentity();
    await expect(seedRulePublication(db, { identity, digestOverride: `sha256:${'e'.repeat(64)}` })).rejects.toThrow(/violates check constraint/);
    const malformed = nextIdentity();
    await expect(seedRulePublication(db, { identity: malformed, rule: { ruleId: malformed.ruleId, unit: 'wash' } })).rejects.toThrow(/violates check constraint/);
    const self = nextIdentity();
    await expect(privileged(db,
      `insert into strandcue_private.programme_rule_publications(artifact_id, artifact_version, content_digest, rule, state, authored_by, reviewed_by, reviewed_at, published_at)
       select $1, '1', 'sha256:' || encode(sha256(convert_to(r::text,'UTF8')),'hex'), r, 'published', 'Same Person', 'same person', now(), now()
         from (select $2::jsonb r) x`, [self.artifactId, JSON.stringify(ruleFixture(self))])).rejects.toThrow(/violates check constraint/);
  });
});

describe('private operation receipt retention', () => {
  it('purges only receipts strictly older than 30 days and never programme facts', async () => {
    const programme = await enrolled({ washes: 3, selected: true });
    await changeProgramme(db, { enrolmentId: programme.record.enrolmentId, expectedRevision: 1, command: { kind: 'complete', completedAt: '2026-09-20T10:00:00.000Z' } });
    const asOf = '2026-10-24T12:00:00.000Z';
    await privileged(db, `update strandcue_private.treatment_programme_operations set created_at = '2026-09-24T11:59:59.999Z' where created_at = (select min(created_at) from strandcue_private.treatment_programme_operations)`);
    const result = await privileged<{ count: number }>(db, 'select public.treatment_programme_operation_retention_cleanup($1::timestamptz) count', [asOf]);
    expect(result.rows[0]!.count).toBe(1);
    expect(await programmeCounts(db)).toMatchObject({ heads: 1, events: 2, receipts: 1 });
    await privileged(db, `update strandcue_private.treatment_programme_operations set created_at = '2026-09-24T12:00:00.000Z'`);
    expect((await privileged<{ count: number }>(db, 'select public.treatment_programme_operation_retention_cleanup($1::timestamptz) count', [asOf])).rows[0]!.count).toBe(0);
    await expect(privileged(db, 'select public.treatment_programme_operation_retention_cleanup(null)')).rejects.toThrow(/invalid-as-of/);
    const { rows } = await privileged<{ anon: boolean; authenticated: boolean }>(db,
      `select has_function_privilege('anon','public.treatment_programme_operation_retention_cleanup(timestamptz)','EXECUTE') anon,
              has_function_privilege('authenticated','public.treatment_programme_operation_retention_cleanup(timestamptz)','EXECUTE') authenticated`);
    expect(rows[0]).toEqual({ anon: false, authenticated: false });
    expect((await getProgramme(db, programme.record.enrolmentId)).completed.snapshot.count).toBe(3);
  });
});

describe('search-path hardening', () => {
  it('does not let a caller-created temporary type run code as a definer', async () => {
    // A dedicated database: pg_temp objects live for the whole session and would shadow names for every later test.
    const attack = await database();
    try {
      await seedProgrammeCatalogue(attack);
      await asUser(attack, USER_A);
      await complete(attack, 'user_a');
      const { identity } = await publishedRule(attack);
      const next = await publishedRule(attack); // seeded before the shadow types exist: fixtures run as a privileged role
      const seeded = await seedExecutionCare(attack, USER_A, careSpecs(4));
      await asUser(attack, USER_A);
      const record = await enrolProgramme(attack, { ruleId: identity.ruleId, selectedApplicationEventId: seeded[0]!.eventId });
      const id = record.enrolmentId;
      await attack.exec(`
        create function pg_temp.pwn_check(v text) returns boolean language plpgsql as $$ begin
          if current_user <> 'authenticated' then raise exception 'PWNED as %', current_user; end if; return true; end $$;
        create domain pg_temp.jsonb as pg_catalog.jsonb check (pg_temp.pwn_check(value::text));
        create domain pg_temp.uuid as pg_catalog.uuid check (pg_temp.pwn_check(value::text));
        create domain pg_temp.timestamptz as pg_catalog.timestamptz check (pg_temp.pwn_check(value::text));
        create domain pg_temp.text as pg_catalog.text check (pg_temp.pwn_check(value));
        create domain pg_temp.int4 as pg_catalog.int4 check (pg_temp.pwn_check(value::text));
        create domain pg_temp.bool as pg_catalog.bool check (pg_temp.pwn_check(value::text));
      `);
      expect((await getProgramme(attack, id)).enrolmentId).toBe(id);
      expect((await listProgrammes(attack)).items).toHaveLength(1);
      await changeProgramme(attack, { enrolmentId: id, expectedRevision: 1, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } });
      await changeProgramme(attack, { enrolmentId: id, expectedRevision: 2, command: { kind: 'resume', resumedAt: '2026-09-13T00:00:00.000Z', resumptionRuleId: 'resume-fixture', resumptionRuleVersion: '1' } });
      await changeProgramme(attack, { enrolmentId: id, expectedRevision: 3, command: { kind: 'maintenance', transitionedAt: '2026-09-16T00:00:00.000Z', ruleId: identity.ruleId, ruleVersion: '1' } });
      await expect(enrolProgramme(attack, { ruleId: next.identity.ruleId })).resolves.toBeDefined();
      const rows = await attack.query<{ result: unknown }>(`select public.get_programme($1) result`, [id]);
      expect(rows.rows).toHaveLength(1);
      // Negative control: the same attack does reach a definer whose search path is not pinned, so the
      // checks above would have failed had the pin been missing.
      await attack.exec('set session authorization postgres');
      await attack.exec(`alter function strandcue_private.programme_get_core(pg_catalog.uuid) set search_path = ''`);
      await asUser(attack, USER_A);
      await expect(getProgramme(attack, id)).rejects.toThrow(/PWNED as strandcue_mutator/);
    } finally {
      await attack.close();
    }
  }, 180_000);
});

describe('error responses', () => {
  it('uses stable codes that carry no row existence, SQL text, identifiers or notes', async () => {
    const programme = await enrolled({ washes: 1, selected: true });
    const id = programme.record.enrolmentId;
    const messages = [
      (await failureOf(() => getProgramme(db, crypto.randomUUID()))).message,
      (await failureOf(() => changeProgramme(db, { enrolmentId: id, expectedRevision: 9, command: { kind: 'pause', pausedAt: '2026-09-09T00:00:00.000Z', reasonCode: 'travel' } }))).message,
      (await failureOf(() => enrolProgramme(db, { ruleId: 'missing-rule' }))).message,
      (await failureOf(() => changeProgramme(db, { enrolmentId: id, expectedRevision: 1, command: { kind: 'select-application', eventId: 'secret-note-text' } }))).message,
    ];
    for (const message of messages) {
      expect(message).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(message).not.toMatch(/select |insert |from |public\.|strandcue_private|[0-9a-f]{8}-[0-9a-f]{4}|secret-note-text/i);
    }
  });

  it('reports an unexpected database failure as one stable code with no SQL text', async () => {
    const programme = await enrolled({ washes: 1, selected: true });
    await privileged(db, 'revoke select on strandcue_private.execution_step_care from strandcue_mutator');
    try {
      const failure = await failureOf(() => getProgramme(db, programme.record.enrolmentId));
      expect(failure.message).toBe('programme-unavailable');
      expect((await failureOf(() => listProgrammes(db))).message).toBe('programme-unavailable');
    } finally {
      await privileged(db, 'grant select on strandcue_private.execution_step_care to strandcue_mutator');
    }
  });

  it('treats a malformed confirmation instant as an underivable event, not a database error', async () => {
    const programme = await enrolled({ washes: 1, selected: true });
    await privileged(db, `update public.protocol_executions set execution = jsonb_set(execution, '{steps,0,confirmedAt}', '"yesterday"'::jsonb)
                           where execution_id = $1`, [programme.seeded.find(item => item.kind === 'wash')!.executionId]);
    const detail = await getProgramme(db, programme.record.enrolmentId);
    expect(detail.evaluation).toMatchObject({ dueStatus: 'needs_input', missing: [{ code: 'invalid-or-unsupported-event-facts' }] });
  });
});

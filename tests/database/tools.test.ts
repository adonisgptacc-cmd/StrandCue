import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asUser, complete, database, USER_A, USER_B } from './harness.ts';

const TOOL_CATALOGUE_TABLES = [
  'tool_brands',
  'tools',
  'tool_versions',
  'tool_claims',
  'tool_sources',
  'tool_verification_events',
];

async function seedToolCatalogue(db: PGlite) {
  await db.exec('set session authorization postgres');
  await db.exec(`insert into public.tool_brands(id, name) values
    ('d0000000-0000-4000-8000-000000000001', 'Salon Brand')`);
  await db.exec(`insert into public.tools(id, brand_id, name, tool_type) values
    ('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'Pro Dryer', 'dryer')`);
  await db.exec(`insert into public.tool_versions(id, tool_id, version_label, market, wattage_watts, temperature_max_celsius, adjustable_temp, contact_heat, air_heat, lifecycle, successor_version_id) values
    ('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'v1', 'ZA', 2200, null, 'unknown', 'no', 'yes', 'active', null)`);
}

describe('tools catalogue immutable history and RLS', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 60_000);
  beforeEach(async () => { await asUser(db, USER_A); });
  afterEach(async () => {
    await db.exec('set session authorization postgres');
    await db.exec('truncate public.profiles cascade');
    for (const table of [...TOOL_CATALOGUE_TABLES].reverse()) {
      await db.exec(`delete from public.${table}`);
    }
  });
  afterAll(async () => { await db?.close(); });

  it('enforces RLS on every tool catalogue table with SELECT-only policies', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename = any($1)`,
      [TOOL_CATALOGUE_TABLES],
    );
    expect(rows.rows.map((row) => row.tablename).sort()).toEqual([...TOOL_CATALOGUE_TABLES].sort());
    const unprotected = await db.query(
      `select relname from pg_class where relname = any($1) and (not relrowsecurity or not relforcerowsecurity)`,
      [TOOL_CATALOGUE_TABLES],
    );
    expect(unprotected.rows).toEqual([]);
    const policies = await db.query<{ cmd: string }>(
      `select distinct cmd from pg_policies where schemaname = 'public' and tablename = any($1)`,
      [TOOL_CATALOGUE_TABLES],
    );
    expect(policies.rows).toEqual([{ cmd: 'SELECT' }]);
  });

  it('lets any authenticated user read catalogue rows', async () => {
    await seedToolCatalogue(db);
    await asUser(db, USER_A);
    for (const table of ['tool_brands', 'tools', 'tool_versions']) {
      const rows = await db.query(`select * from public.${table}`);
      expect(rows.rows.length).toBeGreaterThan(0);
    }
    await asUser(db, USER_B);
    const brands = await db.query<{ name: string }>('select name from public.tool_brands');
    expect(brands.rows).toEqual([{ name: 'Salon Brand' }]);
  });

  it('denies every authenticated write to tool catalogue tables', async () => {
    await complete(db);
    await seedToolCatalogue(db);
    await asUser(db, USER_A);
    await expect(db.exec(`insert into public.tool_brands(name) values ('Sneaky')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.tools set name = 'Sneaky' where id = 'd0000000-0000-4000-8000-000000000002'`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`update public.tool_versions set temperature_max_celsius = 999 where id = 'd0000000-0000-4000-8000-000000000003'`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`delete from public.tool_claims where false`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.tool_sources(id, version_id, source_url, source_type, trust_tier, market, first_seen, last_checked) values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000003', 'https://example.test/x', 'marketing', 'T10', 'ZA', '2024-01-01', '2024-01-01')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.tool_verification_events(id, version_id, reviewer, reviewed_fields, status, reason) values (gen_random_uuid(), 'd0000000-0000-4000-8000-000000000003', 'self', '{name}', 'verified', 'self-approved')`)).rejects.toThrow(/permission denied|violates/i);
  });

  it('denies direct authenticated writes to user tool tables', async () => {
    await complete(db);
    await expect(db.exec(`insert into public.user_tools(id, owner, availability) values (gen_random_uuid(), '${USER_A}', 'available')`)).rejects.toThrow(/permission denied|violates/i);
    await expect(db.exec(`insert into public.user_tool_revisions(id, owner, user_tool_id, sequence, base_revision, kind, effective_date, source, patch) values (gen_random_uuid(), '${USER_A}', gen_random_uuid(), 1, 0, 'baseline', '{"precision":"day","value":"2024-01-01"}', 'user-reported', '{}')`)).rejects.toThrow(/permission denied|violates/i);
    await asUser(db, USER_B);
    expect((await db.query('select * from public.user_tools')).rows).toEqual([]);
    expect((await db.query('select * from public.user_tool_revisions')).rows).toEqual([]);
  });

  it('enforces composite owner FK on user tool children', async () => {
    await complete(db);
    await db.exec('set session authorization postgres');
    const userToolId = crypto.randomUUID();
    await db.exec(`insert into public.user_tools(id, owner, manual_model, availability, revision) values ('${userToolId}', '${USER_A}', 'Pro Dryer', 'available', 0)`);
    await expect(db.query(`insert into public.user_tool_revisions(id, owner, user_tool_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, source, patch) values (gen_random_uuid(), '${USER_B}', '${userToolId}', 1, 0, 'baseline', '{"precision":"day","value":"2024-01-01"}', '2024-01-01', '2024-01-01', 'user-reported', '{}')`)).rejects.toThrow(/foreign key|violates/i);
  });

  it('keeps archived ownership rows with their history', async () => {
    const rows = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public' and tablename in ('user_tools', 'user_tool_revisions')`,
    );
    expect(rows.rows.map((row) => row.tablename).sort()).toEqual(['user_tool_revisions', 'user_tools']);
    const unprotected = await db.query(
      `select relname from pg_class where relname in ('user_tools', 'user_tool_revisions') and (not relrowsecurity or not relforcerowsecurity)`,
    );
    expect(unprotected.rows).toEqual([]);
  });

  it('keeps wattage and temperature as independent unknowns', async () => {
    await seedToolCatalogue(db);
    await asUser(db, USER_A);
    // 2200W known, temperature unknown — the unknown must round-trip as null, never inferred.
    const rows = await db.query<{ wattage_watts: number; temperature_max_celsius: null; adjustable_temp: string }>(
      `select wattage_watts, temperature_max_celsius, adjustable_temp from public.tool_versions where id = 'd0000000-0000-4000-8000-000000000003'`,
    );
    expect(rows.rows).toEqual([{ wattage_watts: 2200, temperature_max_celsius: null, adjustable_temp: 'unknown' }]);
  });

  it('preserves version payloads across successor links', async () => {
    await db.exec('set session authorization postgres');
    await db.exec(`insert into public.tool_brands(id, name) values ('d0000000-0000-4000-8000-000000000101', 'Salon Brand')`);
    await db.exec(`insert into public.tools(id, brand_id, name, tool_type) values ('d0000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000101', 'Pro Dryer', 'dryer')`);
    await db.exec(`insert into public.tool_versions(id, tool_id, version_label, market, lifecycle, successor_version_id) values
      ('d0000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000102', 'v2', 'ZA', 'active', null)`);
    await db.exec(`insert into public.tool_versions(id, tool_id, version_label, market, lifecycle, successor_version_id) values
      ('d0000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000102', 'v1', 'ZA', 'active', 'd0000000-0000-4000-8000-000000000104')`);
    const original = await db.query<{ version_label: string; successor_version_id: string }>(
      `select version_label, successor_version_id from public.tool_versions where id = 'd0000000-0000-4000-8000-000000000103'`,
    );
    expect(original.rows).toEqual([{ version_label: 'v1', successor_version_id: 'd0000000-0000-4000-8000-000000000104' }]);
    await db.exec(`insert into public.tool_claims(id, version_id, claim_key, statement) values
      ('d0000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000103', 'name', 'Pro Dryer')`);
    await expect(db.exec(`delete from public.tool_versions where id = 'd0000000-0000-4000-8000-000000000103'`)).rejects.toThrow(/restrict|violates/i);
  });
});

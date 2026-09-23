import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { database } from './harness.ts';

// Beta gate: structural hardening over the full trusted replay chain.
// Any table, function or grant that weakens the mutation boundary fails here.
describe('database hardening audit', () => {
  let db: PGlite;
  beforeAll(async () => { db = await database(); }, 120_000);
  afterAll(async () => { await db?.close(); });

  it('forces row level security on every application table', async () => {
    const violators = await db.query<{ tablename: string }>(`
      select t.tablename from pg_tables t join pg_class c on c.relname = t.tablename
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
      where t.schemaname in ('public', 'strandcue_private')
        and t.tablename not like 'pg_%'
        and (not c.relrowsecurity or not c.relforcerowsecurity)
    `);
    expect(violators.rows).toEqual([]);
  });

  it('pins a fixed search_path on every application routine', async () => {
    const violators = await db.query<{ signature: string }>(`
      select p.oid::regprocedure::text signature from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'strandcue_private')
        and not p.proconfig @> array['search_path=""']
    `);
    expect(violators.rows).toEqual([]);
  });

  it('gives anonymous callers nothing to execute or read', async () => {
    const functions = await db.query(
      `select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'strandcue_private') and has_function_privilege('anon', p.oid, 'EXECUTE')`,
    );
    expect(functions.rows).toEqual([]);
    const tables = await db.query(
      `select tablename from pg_tables where schemaname in ('public', 'strandcue_private')
        and tablename not like 'pg_%' and has_table_privilege('anon', schemaname || '.' || tablename, 'SELECT,INSERT,UPDATE,DELETE')`,
    );
    expect(tables.rows).toEqual([]);
  });

  it('contains the mutator role without login, bypass or owned tables', async () => {
    const roles = await db.query(
      `select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = 'strandcue_mutator'`,
    );
    expect(roles.rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcanlogin: false }]);
    expect((await db.query(`select 1 from pg_tables where tableowner = 'strandcue_mutator'`)).rows).toEqual([]);
    expect((await db.query(`select pg_has_role('authenticated', 'strandcue_mutator', 'MEMBER') member`)).rows).toEqual([{ member: false }]);
  });

  it('denies authenticated writes on every application table', async () => {
    // All consumer mutations run through transactional RPC as mutator;
    // no private or catalogue table grants direct writes to consumers.
    const writable = await db.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname in ('public', 'strandcue_private')
        and tablename not like 'pg_%'
        and has_table_privilege('authenticated', schemaname || '.' || tablename, 'INSERT,UPDATE,DELETE')`,
    );
    expect(writable.rows).toEqual([]);
  });
});

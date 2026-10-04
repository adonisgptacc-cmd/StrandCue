import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { database } from './harness.ts';

describe('Supabase migration compatibility', () => {
  it('repairs private-schema usage required by username suggestions', async () => {
    const db = await database();
    try {
      await db.exec('revoke usage on schema strandcue_private from strandcue_mutator');
      const repairs = (await readdir('supabase/migrations'))
        .filter((name) => name.endsWith('_username_schema_usage_repair.sql'));
      expect(repairs).toHaveLength(1);
      await db.exec(await readFile(join('supabase/migrations', repairs[0]), 'utf8'));
      expect((await db.query<{ can_use: boolean }>(
        "select has_schema_privilege('strandcue_mutator','strandcue_private','USAGE') can_use",
      )).rows).toEqual([{ can_use: true }]);
    } finally { await db.close(); }
  }, 60_000);

  it('repairs profile lookup access required by username suggestions', async () => {
    const db = await database();
    try {
      await db.exec('revoke select on public.profiles from strandcue_mutator');
      const repairs = (await readdir('supabase/migrations'))
        .filter((name) => name.endsWith('_username_profile_lookup_repair.sql'));
      expect(repairs).toHaveLength(1);
      await db.exec(await readFile(join('supabase/migrations', repairs[0]), 'utf8'));
      expect((await db.query<{ can_read: boolean }>(
        "select has_table_privilege('strandcue_mutator','public.profiles','SELECT') can_read",
      )).rows).toEqual([{ can_read: true }]);
    } finally { await db.close(); }
  }, 60_000);

  it('replays every SQL migration in lexical order and ignores other files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'strandcue-migrations-'));
    try {
      await writeFile(join(directory, '002_second.sql'), 'insert into public.replay_probe values (42);');
      await writeFile(join(directory, '001_first.sql'), 'create table public.replay_probe(value integer);');
      await writeFile(join(directory, 'notes.md'), 'This is not SQL');
      const db = await database(directory);
      try {
        expect((await db.query('select value from public.replay_probe')).rows).toEqual([{ value: 42 }]);
      } finally { await db.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 60_000);
  it('applies through a non-superuser migration administrator without retaining mutator access', async () => {
    const db = new PGlite();

    try {
      await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role migration_admin login createrole;
        grant create on database postgres to migration_admin;
        grant all on schema public to migration_admin with grant option;
        create schema auth authorization migration_admin;
        set session authorization migration_admin;
        create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
        $$;
        reset session authorization;
      `);

      await db.exec('set session authorization migration_admin');
      for (const migration of (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()) {
        await db.exec(await readFile(join('supabase/migrations', migration), 'utf8'));
      }
      await db.exec('reset session authorization');

      const owners = await db.query<{ owner: string }>(`
        select owner.rolname owner
        from pg_proc function
        join pg_namespace namespace on namespace.oid=function.pronamespace
        join pg_roles owner on owner.oid=function.proowner
        where namespace.nspname='strandcue_private'
          and function.proname in ('complete_account','mutate_passport','get_passport',
            'record_service','correct_service','observe_service','get_service','list_services')
        order by function.proname
      `);
      expect(owners.rows).toEqual([
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
        { owner: 'strandcue_mutator' },
      ]);
      expect((await db.query<{ can_set_role: boolean }>(
        "select pg_has_role('migration_admin','strandcue_mutator','SET') can_set_role",
      )).rows).toEqual([{ can_set_role: false }]);
      expect((await db.query<{ can_create: boolean }>(
        "select has_schema_privilege('strandcue_mutator','strandcue_private','CREATE') can_create",
      )).rows).toEqual([{ can_create: false }]);
      expect((await db.query(`
        select relname from pg_class where relname in ('chemical_services','service_revisions',
          'service_zones','heat_events','service_observations','service_operations')
          and (not relrowsecurity or not relforcerowsecurity)
      `)).rows).toEqual([]);
      expect((await db.query(`
        select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','strandcue_private')
          and p.proname in ('record_service','correct_service','observe_service','get_service','list_services')
          and (has_function_privilege('anon',p.oid,'EXECUTE') or not p.proconfig @> array['search_path=""'])
      `)).rows).toEqual([]);
      expect((await db.query(`
        select has_function_privilege('authenticated','strandcue_private.service_append_revision(uuid,integer,jsonb,uuid,text)','EXECUTE') can_append,
          has_table_privilege('authenticated','public.chemical_services','INSERT,UPDATE,DELETE') can_write,
          has_column_privilege('strandcue_mutator','public.chemical_services','user_id','UPDATE') can_reassign,
          has_column_privilege('strandcue_mutator','public.chemical_services','revision','UPDATE') can_advance
      `)).rows).toEqual([{ can_append: false, can_write: false, can_reassign: false, can_advance: true }]);
    } finally {
      await db.close();
    }
  }, 60_000);
});

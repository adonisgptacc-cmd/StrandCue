import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { database } from './harness.ts';

describe('Supabase migration compatibility', () => {
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
  });
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
          and function.proname in ('complete_account','mutate_passport','get_passport')
        order by function.proname
      `);
      expect(owners.rows).toEqual([
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
    } finally {
      await db.close();
    }
  }, 60_000);
});

import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('Supabase migration compatibility', () => {
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
      await db.exec(await readFile('supabase/migrations/20260909172924_passport_foundation.sql', 'utf8'));
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

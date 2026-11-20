-- Increment 5 Task I5.0 review follow-up (forward-only).
-- The export definers call strandcue_private.recent_auth(), a SECURITY INVOKER plpgsql function with an empty
-- search_path. Called from a definer it runs as strandcue_mutator, so a caller's temporary jsonb or timestamptz
-- type could run caller code there. Pin it, and the other invoker helpers the export reaches, like the other
-- Cue Check and export routines.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'migration_admin') then
    create role migration_admin nologin;
  end if;
  if current_user <> 'migration_admin' then
    execute format('grant migration_admin to %I with set true', current_user);
  end if;
end $$;
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

alter function strandcue_private.recent_auth(integer) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.request_claims() set search_path = pg_catalog, pg_temp;
alter function strandcue_private.csv_quote(text) set search_path = pg_catalog, pg_temp;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

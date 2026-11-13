-- Increment 5 Task I5.0 review fixes (forward-only; committed migrations untouched).
-- 1. Every Cue Check definer pins `search_path = pg_catalog, pg_temp`. With an empty path a caller's own
--    temporary types (pg_temp is searched first when unlisted) could shadow jsonb, uuid or timestamptz inside
--    a SECURITY DEFINER body and run caller code as strandcue_mutator. Listing pg_catalog first and pg_temp
--    last makes catalogue names win. The same pinning applies to the Cue Check export wrappers and the
--    receipt cleanup. Other, older definers in the project keep the empty path and are a separate follow-up.
-- 2. The head guard also protects received_at (it moves only with a revision, never backwards) and requires a
--    correction's revision row to be a valid observation of the record's own timing.

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

create or replace function strandcue_private.cue_check_head_guard()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  rev public.cue_check_revisions%rowtype;
begin
  if new.observation is not distinct from old.observation and new.lifecycle is not distinct from old.lifecycle
     and new.revision is not distinct from old.revision and new.observed_at is not distinct from old.observed_at
     and new.received_at is not distinct from old.received_at then
    return new;
  end if;
  if new.revision is distinct from old.revision + 1 or new.received_at < old.received_at then
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  select * into rev from public.cue_check_revisions r where r.record_id = new.record_id and r.sequence = new.revision;
  if not found or rev.user_id is distinct from new.user_id then
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  if rev.kind = 'correct' then
    -- The revision must also be a valid observation of this record's own timing, as the RPC path requires.
    perform strandcue_private.validate_cue_check_observation(rev.observation);
    if rev.observation ->> 'timing' is distinct from new.timing or old.lifecycle <> 'active' or new.lifecycle <> 'active'
       or new.observation is distinct from rev.observation
       or new.observed_at is distinct from (rev.observation ->> 'observedAt')::timestamptz then
      raise exception 'cue-check-head-invalid' using errcode = 'P0001';
    end if;
  elsif rev.kind = 'void' then
    if old.lifecycle <> 'active' or new.lifecycle <> 'voided'
       or new.observation is distinct from old.observation or new.observed_at is distinct from old.observed_at then
      raise exception 'cue-check-head-invalid' using errcode = 'P0001';
    end if;
  else
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The shared caller-identity helper runs as the definer when a core calls it, so it needs the same pinning.
alter function strandcue_private.request_uid() set search_path = pg_catalog, pg_temp;
alter function strandcue_private.validate_cue_check_observation(jsonb) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_confirmed_steps(jsonb) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_receipt(public.cue_checks) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_require_owner() set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_create_core(uuid,uuid,jsonb) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_correct_core(uuid,uuid,integer,jsonb,text) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_void_core(uuid,uuid,integer,text) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_list_core(integer,jsonb) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_detail_core(uuid) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_revision_immutable() set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_binding_immutable() set search_path = pg_catalog, pg_temp;
alter function strandcue_private.cue_check_refuse_truncate() set search_path = pg_catalog, pg_temp;
alter function public.cue_check_operation_retention_cleanup(timestamptz) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.export_build_csv(uuid) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.export_build_csv_before_cue_checks(uuid) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.request_export(uuid,text) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.request_export_before_cue_checks(uuid,text) set search_path = pg_catalog, pg_temp;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

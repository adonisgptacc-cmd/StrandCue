-- Add configurable export size limit (PR-001 / DP-001)
-- Default 50 MB JSON payload, configurable via strandcue_config.max_export_size_mb
-- CSV exports are not size-limited (streamed per-table)

-- Boilerplate for migration_admin compatibility
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- Allow strandcue_mutator to manage config (needed for migration_admin to insert defaults)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'strandcue_config' and policyname = 'strandcue_config_mutator_write') then
    create policy strandcue_config_mutator_write on public.strandcue_config
      for all to strandcue_mutator using (true) with check (true);
  end if;
end $$;
grant insert, update on public.strandcue_config to strandcue_mutator;

-- 1. Add config entry for max export size (default 50 MB)
-- Stored as JSON array ['50'] to match helper function's value->>0 extraction pattern
insert into public.strandcue_config (key, value)
values ('max_export_size_mb', '["50"]'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. Create helper function to get max export size in bytes
create or replace function strandcue_private.get_max_export_size_bytes()
returns bigint
language sql
security definer
set search_path = '' as $$
  select coalesce((value->>0)::bigint, 50) * 1024 * 1024
  from public.strandcue_config
  where key = 'max_export_size_mb'
$$;

-- 3. Grant execute on helper function
revoke all on function strandcue_private.get_max_export_size_bytes() from public, anon, authenticated;
grant execute on function strandcue_private.get_max_export_size_bytes() to authenticated, strandcue_mutator;

-- 4. Wrap the current request_export with size guard
-- Rename current function to preserve its logic
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='strandcue_private' and p.proname='request_export_before_size_guard') then
    alter function strandcue_private.request_export(uuid, text) rename to request_export_before_size_guard;
  end if;
end $$;

-- 5. Create new request_export with size check
create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := strandcue_private.request_uid();
  v_result jsonb;
  v_job uuid;
  v_document jsonb;
  v_estimated_size bigint;
  v_max_size_bytes bigint := strandcue_private.get_max_export_size_bytes();
begin
  -- Call the previous export function to build the document and create the job
  v_result := strandcue_private.request_export_before_size_guard(p_operation_id, p_format);
  
  -- For JSON format, check the size of the generated document
  if p_format = 'json' and v_uid is not null then
    v_job := (v_result ->> 'jobId')::uuid;
    
    -- Fetch the document that was just stored
    select document into v_document
    from public.export_jobs
    where id = v_job and owner = v_uid;
    
    if v_document is not null then
      -- Estimate size using pg_column_size on the JSON document
      v_estimated_size := pg_column_size(v_document);
      
      if v_estimated_size > v_max_size_bytes then
        -- Clean up: delete the export job and operation record
        delete from public.export_jobs where id = v_job;
        delete from strandcue_private.export_operations 
        where user_id = v_uid and operation_id = p_operation_id;
        
        raise exception 'payload-too-large'
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  
  return v_result;
end;
$$;

alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

-- 6. Grant DELETE on export tables to strandcue_mutator for size guard cleanup
grant delete on public.export_jobs to strandcue_mutator;
grant delete on strandcue_private.export_operations to strandcue_mutator;

-- 7. Re-assert grants on the wrapped functions
revoke all on function strandcue_private.request_export_before_size_guard(uuid, text),
  strandcue_private.request_export(uuid, text),
  strandcue_private.get_max_export_size_bytes()
from public, anon, authenticated;

grant execute on function strandcue_private.request_export_before_size_guard(uuid, text),
  strandcue_private.request_export(uuid, text),
  strandcue_private.get_max_export_size_bytes()
to authenticated, strandcue_mutator;

-- Cleanup boilerplate
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
-- I6.5: a service-only persistence boundary for a decision evaluated on the
-- server. The mobile/authenticated path remains unable to mint ready runs.
-- This function is called only after the Edge evaluator verifies the user
-- session and derives the owner from that verified identity. Its explicit
-- owner argument is never accepted from a mobile RPC.

-- The service writer and epoch trigger run as the migration owner. Some
-- environments use a non-BYPASSRLS migration administrator, so give that
-- trusted role the exact table access its SECURITY DEFINER functions need.
-- These policies do not grant access to anon, authenticated or service_role.
do $$ begin
  execute format(
    'create policy guidance_admin_profile_read on public.profiles for select to %I using (true)',
    current_user);
  execute format(
    'create policy guidance_admin_profile_lock on public.profiles for update to %I using (true) with check (true)',
    current_user);
  execute format(
    'create policy guidance_admin_run_write on public.recommendation_runs for all to %I using (true) with check (true)',
    current_user);
end $$;

create table strandcue_private.guidance_source_revisions (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);
alter table strandcue_private.guidance_source_revisions enable row level security;
alter table strandcue_private.guidance_source_revisions force row level security;
do $$ begin
  execute format(
    'create policy guidance_revision_internal on strandcue_private.guidance_source_revisions for all to %I using (true) with check (true)',
    current_user);
end $$;
revoke all on table strandcue_private.guidance_source_revisions from public, anon, authenticated, service_role;

create table strandcue_private.today_guidance_rate_limits (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  window_start timestamptz not null,
  used integer not null check (used between 0 and 30)
);
alter table strandcue_private.today_guidance_rate_limits enable row level security;
alter table strandcue_private.today_guidance_rate_limits force row level security;
do $$ begin
  execute format(
    'create policy today_guidance_rate_internal on strandcue_private.today_guidance_rate_limits for all to %I using (true) with check (true)',
    current_user);
end $$;
revoke all on table strandcue_private.today_guidance_rate_limits from public, anon, authenticated, service_role;

create function strandcue_private.reserve_today_guidance_request_core()
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  limit_row strandcue_private.today_guidance_rate_limits%rowtype;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  insert into strandcue_private.today_guidance_rate_limits(user_id, window_start, used)
    values (owner_id, now(), 0) on conflict (user_id) do nothing;
  select * into limit_row from strandcue_private.today_guidance_rate_limits
    where user_id = owner_id for update;
  if limit_row.window_start <= now() - interval '1 hour' then
    update strandcue_private.today_guidance_rate_limits
      set window_start = now(), used = 0 where user_id = owner_id;
    limit_row.used := 0;
  end if;
  if limit_row.used >= 30 then
    raise exception 'guidance-rate-limited' using errcode = '22023';
  end if;
  update strandcue_private.today_guidance_rate_limits
    set used = used + 1 where user_id = owner_id;
  return 29 - limit_row.used;
end;
$$;
revoke all on function strandcue_private.reserve_today_guidance_request_core()
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.reserve_today_guidance_request_core()
  to authenticated;

create function public.reserve_today_guidance_request()
returns integer language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.reserve_today_guidance_request_core()
$$;
revoke all on function public.reserve_today_guidance_request()
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_today_guidance_request()
  to authenticated;

create function strandcue_private.bump_guidance_source_revision()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  old_owner uuid;
  new_owner uuid;
  owner_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_owner := nullif(to_jsonb(old) ->> tg_argv[0], '')::uuid;
  end if;
  if tg_op <> 'DELETE' then
    new_owner := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  end if;
  for owner_id in
    select distinct id from unnest(array[old_owner, new_owner]) id where id is not null
  loop
    -- Account deletion may cascade through source tables. Do not recreate a
    -- revision row after its profile has gone away.
    insert into strandcue_private.guidance_source_revisions(user_id, revision)
      select owner_id, 1 from public.profiles where user_id = owner_id
      on conflict (user_id) do update
        set revision = strandcue_private.guidance_source_revisions.revision + 1;
  end loop;
  return null;
end;
$$;
revoke all on function strandcue_private.bump_guidance_source_revision() from public, anon, authenticated, service_role;

-- Every source read by Today's snapshot loader gets an epoch bump. Multiple
-- bumps in one mutation are harmless: only equality matters. The shared row
-- serializes a concurrent correction against a trusted write.
do $$
declare
  source record;
begin
  for source in
    select * from (values
      ('hair_passports', 'user_id'), ('passport_revisions', 'user_id'),
      ('chemical_services', 'user_id'), ('service_revisions', 'user_id'),
      ('service_zones', 'user_id'), ('heat_events', 'user_id'),
      ('service_observations', 'user_id'),
      ('activities', 'owner'), ('activity_revisions', 'owner'),
      ('activity_products', 'owner'), ('activity_tools', 'owner'),
      ('activity_heat_events', 'owner'),
      ('user_products', 'owner'), ('user_product_revisions', 'owner'),
      ('user_tools', 'owner'), ('user_tool_revisions', 'owner')
    ) as sources(table_name, owner_column)
  loop
    execute format(
      'create trigger guidance_source_revision_bump after insert or update or delete on public.%I for each row execute function strandcue_private.bump_guidance_source_revision(%L)',
      source.table_name, source.owner_column);
  end loop;
end;
$$;

create function strandcue_private.current_guidance_source_revision()
returns bigint language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  current_revision bigint;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select revision into current_revision from strandcue_private.guidance_source_revisions
    where user_id = owner_id;
  return coalesce(current_revision, 0);
end;
$$;
revoke all on function strandcue_private.current_guidance_source_revision() from public, anon, authenticated, service_role;
grant execute on function strandcue_private.current_guidance_source_revision() to authenticated;

create function public.get_guidance_source_revision()
returns bigint language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.current_guidance_source_revision()
$$;
revoke all on function public.get_guidance_source_revision() from public, anon, authenticated, service_role;
grant execute on function public.get_guidance_source_revision() to authenticated;

alter table public.recommendation_runs
  add column source_revision bigint check (source_revision is null or source_revision >= 0);

create function public.record_server_recommendation_run(
  p_owner_id uuid, p_request_id uuid, p_input_fingerprint text,
  p_as_of timestamptz, p_engine_version text, p_bundle_id text,
  p_bundle_version text, p_status text, p_input jsonb, p_decision jsonb,
  p_source_revision bigint)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  stored public.recommendation_runs%rowtype;
  current_revision bigint;
begin
  if p_owner_id is null or p_request_id is null or p_input_fingerprint is null
     or p_as_of is null or p_engine_version is null or p_bundle_id is null
     or p_bundle_version is null or p_status is null or p_input is null
     or p_decision is null or p_source_revision is null
     or p_source_revision < 0 then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if p_status <> 'ready' then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_decision) <> 'object'
     or p_input ->> 'requestId' is distinct from p_request_id::text
     or p_decision ->> 'requestId' is distinct from p_request_id::text
     or p_decision ->> 'status' is distinct from 'ready'
     or jsonb_typeof(p_decision -> 'steps') is distinct from 'array' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if jsonb_array_length(p_decision -> 'steps') < 1 or exists (
    select 1 from jsonb_array_elements(p_decision -> 'steps') step
      where jsonb_typeof(step) <> 'object'
         or nullif(step ->> 'stepId', '') is null
         or (step ->> 'position') is null
         or (step ->> 'position') !~ '^[1-9][0-9]{0,8}$'
         or nullif(step ->> 'action', '') is null) then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_decision -> 'steps') step
      group by step ->> 'stepId' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_decision -> 'steps') step
      group by step ->> 'position' having count(*) > 1
  ) then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if p_input_fingerprint !~ '^[0-9a-f]{64}$'
     or length(p_engine_version) not between 1 and 40
     or length(p_bundle_id) not between 1 and 120
     or length(p_bundle_version) not between 1 and 40 then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if octet_length(p_input::text) > 262144 or octet_length(p_decision::text) > 262144 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;
  perform 1 from public.profiles
    where user_id = p_owner_id and account_status = 'active' for update;
  if not found then
    raise exception 'account-not-active' using errcode = '42501';
  end if;

  -- A retry of a previously saved decision returns its historical receipt,
  -- even if the owner's sources changed later. Start independently checks
  -- current freshness before creating an execution.
  select * into stored from public.recommendation_runs
    where user_id = p_owner_id and request_id = p_request_id for update;
  if found then
    if stored.trusted is distinct from true
       or stored.source_revision is distinct from p_source_revision
       or stored.input_fingerprint is distinct from p_input_fingerprint
       or stored.as_of is distinct from p_as_of
       or stored.engine_version is distinct from p_engine_version
       or stored.bundle_id is distinct from p_bundle_id
       or stored.bundle_version is distinct from p_bundle_version
       or stored.status is distinct from p_status
       or stored.input is distinct from p_input
       or stored.decision is distinct from p_decision then
      raise exception 'run-conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', stored.id, 'requestId', stored.request_id,
      'inputFingerprint', stored.input_fingerprint, 'status', stored.status,
      'engineVersion', stored.engine_version, 'bundleId', stored.bundle_id,
      'bundleVersion', stored.bundle_version, 'createdAt', stored.created_at);
  end if;

  insert into strandcue_private.guidance_source_revisions(user_id, revision)
    values (p_owner_id, 0) on conflict (user_id) do nothing;
  select revision into current_revision from strandcue_private.guidance_source_revisions
    where user_id = p_owner_id for update;
  if current_revision is distinct from p_source_revision then
    raise exception 'source-changed' using errcode = '22023';
  end if;

  insert into public.recommendation_runs(
    user_id, request_id, input_fingerprint, as_of, engine_version,
    bundle_id, bundle_version, status, input, decision, trusted, source_revision)
  values (
    p_owner_id, p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
    p_bundle_id, p_bundle_version, p_status, p_input, p_decision, true, p_source_revision)
  on conflict (user_id, request_id) do nothing
  returning * into stored;

  if not found then
    select * into stored from public.recommendation_runs
      where user_id = p_owner_id and request_id = p_request_id for update;
    if stored.trusted is distinct from true
       or stored.source_revision is distinct from p_source_revision
       or stored.input_fingerprint is distinct from p_input_fingerprint
       or stored.as_of is distinct from p_as_of
       or stored.engine_version is distinct from p_engine_version
       or stored.bundle_id is distinct from p_bundle_id
       or stored.bundle_version is distinct from p_bundle_version
       or stored.status is distinct from p_status
       or stored.input is distinct from p_input
       or stored.decision is distinct from p_decision then
      raise exception 'run-conflict' using errcode = '23505';
    end if;
  end if;

  return jsonb_build_object(
    'id', stored.id, 'requestId', stored.request_id,
    'inputFingerprint', stored.input_fingerprint, 'status', stored.status,
    'engineVersion', stored.engine_version, 'bundleId', stored.bundle_id,
    'bundleVersion', stored.bundle_version, 'createdAt', stored.created_at);
end;
$$;

revoke all on function public.record_server_recommendation_run(
  uuid, uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.record_server_recommendation_run(
  uuid, uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, bigint)
  to service_role;

-- A trusted run minted by the server is startable only while its source epoch
-- still matches. The row lock prevents a correction from slipping between
-- this check and the old start core's execution/event insert. Legacy trusted
-- fixture runs have NULL source_revision and keep their existing behavior.
create policy guidance_revision_mutator_read on strandcue_private.guidance_source_revisions
  for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy guidance_revision_mutator_lock on strandcue_private.guidance_source_revisions
  for update to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()))
  with check (user_id = (select strandcue_private.request_uid()));
grant select, update(revision) on strandcue_private.guidance_source_revisions to strandcue_mutator;

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
create function strandcue_private.start_execution_with_source_revision(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  run public.recommendation_runs%rowtype;
  current_revision bigint;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into run from public.recommendation_runs
    where user_id = owner_id and request_id = p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;
  if run.source_revision is not null then
    -- Accepted operation retries must replay their original result even if
    -- the owner corrected a fact later; the core checks operation equality.
    perform 1 from strandcue_private.protocol_execution_operations
      where user_id = owner_id and operation_id = p_operation_id;
    if found then
      return strandcue_private.start_execution(
        p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
    end if;
    select revision into current_revision
      from strandcue_private.guidance_source_revisions
      where user_id = owner_id for update;
    if current_revision is distinct from run.source_revision then
      raise exception 'source-changed' using errcode = '22023';
    end if;
  end if;
  return strandcue_private.start_execution(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
end;
$$;
alter function strandcue_private.start_execution_with_source_revision(uuid, uuid, uuid, timestamptz)
  owner to strandcue_mutator;
revoke all on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  to strandcue_mutator;
revoke all on function strandcue_private.start_execution_with_source_revision(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.start_execution_with_source_revision(uuid, uuid, uuid, timestamptz)
  to authenticated, strandcue_mutator;

create or replace function public.start_protocol_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  return strandcue_private.start_execution_with_source_revision(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
end;
$$;
revoke all on function public.start_protocol_execution(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.start_protocol_execution(uuid, uuid, uuid, timestamptz)
  to authenticated;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

-- The source revision is part of the owner's stored run. JSON exports embed
-- the full row already; CSV and schema versions need a forward wrapper.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
alter function strandcue_private.export_build_csv(uuid)
  rename to export_build_csv_before_source_revision;
alter function strandcue_private.request_export(uuid, text)
  rename to request_export_before_source_revision;

create function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  base jsonb;
  runs_csv text;
  versions_csv text;
begin
  base := strandcue_private.export_build_csv_before_source_revision(p_uid);
  select 'id,request_id,input_fingerprint,as_of,engine_version,bundle_id,bundle_version,status,trusted,source_revision,input,decision,created_at'
    || chr(10) || coalesce(string_agg(
      strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.request_id::text)
      || ',' || strandcue_private.csv_quote(r.input_fingerprint) || ',' || strandcue_private.csv_quote(r.as_of::text)
      || ',' || strandcue_private.csv_quote(r.engine_version) || ',' || strandcue_private.csv_quote(r.bundle_id)
      || ',' || strandcue_private.csv_quote(r.bundle_version) || ',' || strandcue_private.csv_quote(r.status)
      || ',' || strandcue_private.csv_quote(r.trusted::text) || ',' || strandcue_private.csv_quote(r.source_revision::text)
      || ',' || strandcue_private.csv_quote(r.input::text) || ',' || strandcue_private.csv_quote(r.decision::text)
      || ',' || strandcue_private.csv_quote(r.created_at::text), chr(10) order by r.created_at, r.id), '')
    into runs_csv from public.recommendation_runs r where r.user_id = p_uid;
  versions_csv := regexp_replace(base -> 'files' ->> 'schema_versions.csv', '^export,[0-9]+$', 'export,8', 'm');
  versions_csv := regexp_replace(versions_csv, '^recommendationRuns,[0-9]+$', 'recommendationRuns,2', 'm');
  return jsonb_set(base, '{files}', (base -> 'files') || jsonb_build_object(
    'recommendation_runs.csv', runs_csv, 'schema_versions.csv', versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

create function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  receipt jsonb;
  job_id uuid;
begin
  receipt := strandcue_private.request_export_before_source_revision(p_operation_id, p_format);
  if p_format = 'json' and owner_id is not null then
    job_id := (receipt ->> 'jobId')::uuid;
    update public.export_jobs j
      set document = jsonb_set(j.document, '{schemaVersions}',
        (j.document -> 'schemaVersions') || jsonb_build_object('export', 8, 'recommendationRuns', 2))
      where j.id = job_id and j.owner = owner_id;
  end if;
  return receipt;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;
revoke all on function strandcue_private.export_build_csv_before_source_revision(uuid),
  strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_source_revision(uuid, text),
  strandcue_private.request_export(uuid, text) from public, anon, authenticated, service_role;
grant execute on function strandcue_private.export_build_csv_before_source_revision(uuid),
  strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_source_revision(uuid, text),
  strandcue_private.request_export(uuid, text) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid, text) to authenticated;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

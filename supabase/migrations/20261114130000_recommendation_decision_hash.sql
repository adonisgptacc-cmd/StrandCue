-- Add canonical decision hash for audit trail defense-in-depth
-- SHA-256 of canonical decision JSON (sorted keys, no whitespace)

-- Boilerplate for migration_admin compatibility (matches other migrations)
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- 1. Add decision_hash column to recommendation_runs
alter table public.recommendation_runs
add column if not exists decision_hash text;

-- 2. Add decision_hash column to protocol_executions
alter table public.protocol_executions
add column if not exists decision_hash text;

-- 3. Create helper function to compute canonical hash
-- Uses the same canonical JSON algorithm as the engine: sorted keys, no whitespace
create or replace function strandcue_private.canonical_decision_hash(p_decision jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical_json text;
begin
  -- Canonical JSON: sorted keys, no whitespace, deterministic
  -- We implement the same logic as engine's canonicalJson:
  -- recursively sort object keys, filter undefined, no whitespace in JSON.stringify
  v_canonical_json := strandcue_private.jsonb_canonical(p_decision);
  return encode(sha256(v_canonical_json::bytea), 'hex');
end;
$$;

-- Helper: canonical JSON serialization for jsonb (sorted keys, no whitespace)
create or replace function strandcue_private.jsonb_canonical(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text;
  v_json text;
begin
  -- Handle null
  if p_value is null then
    return 'null';
  end if;

  -- Handle scalar types
  if jsonb_typeof(p_value) in ('string', 'number', 'boolean') then
    return p_value::text;
  end if;

  -- Handle arrays: recursively canonicalize each element
  if jsonb_typeof(p_value) = 'array' then
    select '[' || string_agg(strandcue_private.jsonb_canonical(value), ',') || ']'
    into v_json
    from jsonb_array_elements(p_value);
    return v_json;
  end if;

  -- Handle objects: sort keys, filter null, recursive
  if jsonb_typeof(p_value) = 'object' then
    select '{' || string_agg('"' || key || '":' || strandcue_private.jsonb_canonical(value), ',' order by key) || '}'
    into v_json
    from jsonb_each(p_value)
    where value is not null and value <> 'null'::jsonb;
    return coalesce(v_json, '{}');
  end if;

  -- Fallback (should not reach here)
  return p_value::text;
end;
$$;

-- 4. Update record_server_recommendation_run to compute hash when trusted=true
-- This replaces the function from 20261029053934_trusted_server_recommendation_run.sql
create or replace function public.record_server_recommendation_run(
  p_owner_id uuid, p_request_id uuid, p_input_fingerprint text,
  p_as_of timestamptz, p_engine_version text, p_bundle_id text,
  p_bundle_version text, p_status text, p_input jsonb, p_decision jsonb,
  p_source_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  stored public.recommendation_runs%rowtype;
  current_revision bigint;
  v_decision_hash text;
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
    raise exception 'malformed-protocol' using errcode = '23505';
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

  -- Compute decision hash for trusted runs
  v_decision_hash := strandcue_private.canonical_decision_hash(p_decision);

  insert into public.recommendation_runs(
    user_id, request_id, input_fingerprint, as_of, engine_version,
    bundle_id, bundle_version, status, input, decision, trusted, source_revision, decision_hash)
  values (
    p_owner_id, p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
    p_bundle_id, p_bundle_version, p_status, p_input, p_decision, true, p_source_revision, v_decision_hash)
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

-- 5. Update start_execution to accept optional decision_hash parameter
-- This modifies the function from 20261030190000_validate_assessed_heat_steps.sql
-- to store the decision_hash in protocol_executions
drop function if exists strandcue_private.start_execution(uuid, uuid, uuid, timestamptz);

create or replace function strandcue_private.start_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz, p_decision_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  uid uuid := strandcue_private.request_uid();
  run public.recommendation_runs%rowtype;
  stored jsonb;
  step jsonb;
  existing public.protocol_executions%rowtype;
  existing_op strandcue_private.protocol_execution_operations%rowtype;
  request jsonb;
  execution jsonb;
  receipt jsonb;
  v_decision_hash text := p_decision_hash;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_execution_id is null or p_recommendation_run_id is null
     or p_started_at is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  
  -- Owned-run verification happens FIRST, before any execution write. The
  -- argument names the run's request_id, not its primary-key id. FOR UPDATE
  -- locks the run row for the checks below.
  select * into run from public.recommendation_runs
    where user_id = uid and request_id = p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;

  -- Operation reservation (DB-002): transaction-scoped advisory lock on
  -- (owner, operation) BEFORE the replay SELECT. A concurrent retry of the
  -- same operation blocks here until the winner commits, then replays the
  -- committed receipt instead of colliding on the operations primary key.
  -- Released automatically at COMMIT/ROLLBACK; lock order (run row first,
  -- advisory second) cannot deadlock against the transition core, which
  -- takes no row lock before its own reservation.
  perform pg_advisory_xact_lock(
    hashtext('protocol-execution-op'),
    hashtext(uid::text || ':' || p_operation_id::text));

  -- The stored request carries no caller decision: there is nothing for the
  -- caller to vary, so identical operation ids always replay identically.
  request := jsonb_build_object(
    'operationId', p_operation_id, 'executionId', p_execution_id,
    'recommendationRunId', p_recommendation_run_id,
    'startedAt', p_started_at);
  select * into existing_op from strandcue_private.protocol_execution_operations
    where user_id = uid and operation_id = p_operation_id;
  if found then
    if existing_op.request is distinct from request then
      raise exception 'operation-conflict' using errcode = '23505';
    end if;
    return existing_op.result;
  end if;

  -- Caller-time skew (DB-004): p_started_at is a CLAIMED event time, not
  -- receipt time. It must sit inside +5 minutes / -24 hours around server
  -- now() (rationale in the header). After the replay early-return above,
  -- so retries of accepted operations still replay once aged out.
  if p_started_at > now() + interval '5 minutes'
     or p_started_at < now() - interval '24 hours' then
    raise exception 'timestamp-out-of-range' using errcode = '22023';
  end if;

  -- Per-owner bound (DB-001): at most 10 non-terminal executions. Terminal
  -- rows never count, so finishing a routine frees its slot.
  if (select count(*) from public.protocol_executions
      where user_id = uid and status in ('in_progress', 'paused')) >= 10 then
    raise exception 'too-many-active-executions' using errcode = '22023';
  end if;

  stored := run.decision;
  if stored is null or jsonb_typeof(stored) != 'object' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if (stored ->> 'status') is distinct from 'ready' then
    raise exception 'not-ready-decision' using errcode = '22023';
  end if;
  if run.trusted is not true then
    raise exception 'untrusted-decision' using errcode = '22023';
  end if;
  if stored -> 'steps' is null or jsonb_typeof(stored -> 'steps') != 'array' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if jsonb_array_length(stored -> 'steps') < 1 then
    raise exception 'empty-plan' using errcode = '22023';
  end if;
  -- Per-execution step bound (DB-001): far above any human routine, and it
  -- converts an oversized plan into a stable code instead of a raw CHECK
  -- failure on the 256 KiB execution column at insert time.
  if jsonb_array_length(stored -> 'steps') > 200 then
    raise exception 'too-many-steps' using errcode = '22023';
  end if;
  for step in select jsonb_array_elements(stored -> 'steps') loop
    if jsonb_typeof(step) != 'object'
       or step ->> 'stepId' is null or length(step ->> 'stepId') < 1
       or step ->> 'position' is null
       or (step ->> 'position') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'malformed-protocol' using errcode = '22023';
    end if;
  end loop;

  -- Heat binding validation for assessed heat steps (from 20261030190000)
  if exists (
    select 1 from jsonb_array_elements(stored -> 'steps') s
    where s->>'action' = 'heat' or s ? 'heatActionRef' or s ? 'heatPrescription'
  ) then
    if not strandcue_private.assessed_heat_decision_valid(uid, stored) then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
  end if;

  select * into existing from public.protocol_executions
    where user_id = uid and execution_id = p_execution_id;
  if found then raise exception 'execution-conflict' using errcode = '23505'; end if;

  -- The initial snapshot derives SOLELY from the stored trusted decision.
  execution := strandcue_private.build_initial_execution(
    p_execution_id, p_recommendation_run_id, stored, p_started_at);

  -- Use provided decision_hash or fetch from source run
  if v_decision_hash is null then
    v_decision_hash := run.decision_hash;
  end if;

  insert into public.protocol_executions(
    user_id, execution_id, recommendation_run_id, decision, execution, revision, status, decision_hash)
  values (uid, p_execution_id, p_recommendation_run_id, stored, execution, 0, 'in_progress', v_decision_hash)
  returning * into existing;

  insert into public.protocol_execution_events(user_id, execution_id, sequence, kind, command, revision)
  values (uid, p_execution_id, 1, 'started', jsonb_build_object('kind', 'start'), 0);

  receipt := jsonb_build_object(
    'executionId', existing.execution_id, 'recommendationRunId', existing.recommendation_run_id,
    'status', existing.status, 'revision', existing.revision,
    'updatedAt', existing.updated_at, 'createdAt', existing.created_at,
    'execution', existing.execution);
  insert into strandcue_private.protocol_execution_operations(user_id, operation_id, request, result)
  values (uid, p_operation_id, request, receipt);
  return receipt;
end;
$$;
alter function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz, text)
  owner to strandcue_mutator;

-- 6. Update start_execution_with_source_revision to pass decision_hash
-- This restores the heat binding validation from 20261029161302_revalidate_heat_binding_on_start.sql
-- and passes decision_hash to start_execution
create or replace function strandcue_private.start_execution_with_source_revision(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  run public.recommendation_runs%rowtype;
  current_revision bigint;
  binding jsonb;
  assessment public.heat_coach_assessments%rowtype;
  v_decision_hash text;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into run from public.recommendation_runs
    where user_id = owner_id and request_id = p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;
  if run.source_revision is not null then
    -- A completed operation replays its original receipt after later changes.
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

  -- Heat binding validation (from 20261029161302_revalidate_heat_binding_on_start.sql)
  binding := run.decision -> 'heatAssessmentBinding';
  if binding is not null then
    if coalesce(binding ->> 'assessmentId','') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
    select * into assessment from public.heat_coach_assessments a
      where a.id = (binding ->> 'assessmentId')::uuid and a.owner = owner_id;
    if not found or assessment.status not in ('no_heat', 'appropriate')
       or assessment.source_fingerprint is distinct from binding ->> 'sourceFingerprint'
       or assessment.publication_id is distinct from (binding ->> 'publicationId')::uuid
       or assessment.publication_digest is distinct from binding ->> 'publicationDigest' then
      raise exception 'stale-heat-binding' using errcode = '22023';
    end if;
    if not strandcue_private.lock_current_heat_publication(
         assessment.publication_id, assessment.publication_digest)
       or (strandcue_private.heat_assessment_json(assessment, owner_id)->>'stale')::boolean then
      raise exception 'stale-heat-binding' using errcode = '22023';
    end if;
    if assessment.status = 'no_heat' and exists (
      select 1 from jsonb_array_elements(run.decision -> 'steps') step
        where step ->> 'action' not in ('apply','wait','rinse','leave_in')
           or coalesce(step -> 'toolId','null'::jsonb) <> 'null'::jsonb
           or coalesce(step -> 'toolVersionId','null'::jsonb) <> 'null'::jsonb
    ) then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
    if assessment.status = 'no_heat' and not strandcue_private.heat_bound_products_valid(
      owner_id, assessment.input, run.decision) then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
    if not strandcue_private.assessed_heat_decision_valid(owner_id, run.decision) then
      raise exception 'stale-heat-binding' using errcode = '22023';
    end if;
  end if;

  -- Copy decision_hash from source run
  v_decision_hash := run.decision_hash;

  -- Call the core start_execution with decision_hash
  return strandcue_private.start_execution(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at, v_decision_hash);
end;
$$;
alter function strandcue_private.start_execution_with_source_revision(uuid, uuid, uuid, timestamptz)
  owner to strandcue_mutator;

-- Grants for new functions
revoke all on function strandcue_private.canonical_decision_hash(jsonb) from public, anon, authenticated, service_role;
grant execute on function strandcue_private.canonical_decision_hash(jsonb) to strandcue_mutator;

revoke all on function strandcue_private.jsonb_canonical(jsonb) from public, anon, authenticated, service_role;
grant execute on function strandcue_private.jsonb_canonical(jsonb) to strandcue_mutator;

revoke all on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz, text)
  to authenticated, strandcue_mutator;

-- Cleanup boilerplate
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

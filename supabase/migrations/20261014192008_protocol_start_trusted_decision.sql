-- SC-002: bind protocol execution start to the stored trusted decision.
--
-- The old `start_execution` core accepted a caller-supplied `p_decision`,
-- validated THAT value, and stored/derived everything from it after only
-- confirming that an owned run row exists. A caller could therefore start an
-- execution whose snapshot never matched the recommendation it cites.
--
-- After this migration the public `start_protocol_execution` accepts only
-- owned-run identity plus bounded operation metadata
-- (p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at).
-- There is no decision argument at any layer: the old 5-argument private
-- core and public wrapper are DROPPED below (not merely superseded), so no
-- stale signature remains callable. Inside PostgreSQL the core locks and
-- loads the owned run, requires its stored decision to be executable AND
-- trusted, and derives the initial snapshot solely from that stored value.
--
-- Identity mapping (preserved, explicit): the `p_recommendation_run_id`
-- argument is matched against the run's REQUEST_ID
-- (`recommendation_runs.request_id`), NOT its primary-key `id`. The pk `id`
-- never appears on this interface.
--
-- Trustedness mechanism (option (a) from the remediation plan):
-- `public.recommendation_runs.trusted` marks rows minted through the
-- mutator-only `record_trusted_run` path (the sole writer that may persist
-- executable `ready` rows since Task 2 / SC-001). The authenticated public
-- path persists only non-executable statuses and always writes
-- trusted=false. There is no caller-supplied trusted flag anywhere: the
-- column is set exclusively from the `p_allow_executable` enforcement flag
-- inside `record_run_core`, which itself is unreachable by
-- anon/authenticated (no grants). A client therefore cannot forge trust.
--
-- Backfill policy: NONE. Every pre-existing row keeps trusted=false,
-- including any `ready` row minted via the old permissive public path, and
-- is now unstartable (`untrusted-decision`). This strands nothing real:
-- production runs the draft bundle, which never yields `ready`, so no
-- legitimate production execution can reference an untrusted ready row.
--
-- Checks inside the new core, in order:
-- authentication, active account, owned run locked with FOR UPDATE
-- (run-not-owned covers both missing and another-owner rows, before any
-- execution write), idempotent operation replay (identical request returns
-- the stored receipt; differing request raises operation-conflict), stored
-- decision is a JSON object (malformed-protocol), stored status is 'ready'
-- (not-ready-decision), stored row is trusted (untrusted-decision), stored
-- steps is a non-empty array of well-formed step objects
-- (malformed-protocol for a wrong shape, empty-plan for zero steps),
-- execution-id uniqueness (execution-conflict). Deleted/blocked owners fail
-- at the active-account check with account-not-active.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- Provenance marker. NOT NULL DEFAULT false so every pre-existing row reads
-- as untrusted with no backfill.
alter table public.recommendation_runs
  add column trusted boolean not null default false;

-- The shared record core now persists provenance from its enforcement flag.
-- The flag is an internal argument with no grants to anon/authenticated, so
-- the public path can only ever write trusted=false while the mutator-only
-- trusted path writes trusted=true.
create or replace function strandcue_private.record_run_core(
  p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz,
  p_engine_version text, p_bundle_id text, p_bundle_version text,
  p_status text, p_input jsonb, p_decision jsonb,
  p_allow_executable boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  existing public.recommendation_runs%rowtype;
  receipt jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_request_id is null or p_input_fingerprint is null or p_as_of is null
     or p_engine_version is null or p_bundle_id is null or p_bundle_version is null
     or p_status is null or p_input is null or p_decision is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if p_status not in ('needs_setup','content_pending','ready','needs_input','rule_conflict','unsupported','source_error') then
    raise exception 'unknown-status' using errcode = '22023';
  end if;
  if not p_allow_executable and p_status = 'ready' then
    raise exception 'executable-status-forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_decision) <> 'object' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if octet_length(p_input::text) > 262144 or octet_length(p_decision::text) > 262144 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  select * into existing from public.recommendation_runs where user_id = uid and request_id = p_request_id;
  if found then
    if existing.input_fingerprint is distinct from p_input_fingerprint
       or existing.engine_version is distinct from p_engine_version
       or existing.bundle_id is distinct from p_bundle_id
       or existing.bundle_version is distinct from p_bundle_version
       or existing.status is distinct from p_status
       or existing.as_of is distinct from p_as_of
       or existing.input is distinct from p_input
       or existing.decision is distinct from p_decision then
      raise exception 'run-conflict' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'id', existing.id, 'requestId', existing.request_id,
      'inputFingerprint', existing.input_fingerprint, 'status', existing.status,
      'engineVersion', existing.engine_version, 'bundleId', existing.bundle_id,
      'bundleVersion', existing.bundle_version, 'createdAt', existing.created_at);
  end if;

  insert into public.recommendation_runs(
    user_id, request_id, input_fingerprint, as_of, engine_version,
    bundle_id, bundle_version, status, input, decision, trusted)
  values (uid, p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
          p_bundle_id, p_bundle_version, p_status, p_input, p_decision,
          p_allow_executable)
  returning * into existing;

  return jsonb_build_object(
    'id', existing.id, 'requestId', existing.request_id,
    'inputFingerprint', existing.input_fingerprint, 'status', existing.status,
    'engineVersion', existing.engine_version, 'bundleId', existing.bundle_id,
    'bundleVersion', existing.bundle_version, 'createdAt', existing.created_at);
end;
$$;
alter function strandcue_private.record_run_core(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, boolean) owner to strandcue_mutator;

-- Remove the caller-decision signatures entirely so no stale entry point
-- remains callable at either layer.
drop function if exists public.start_protocol_execution(uuid, uuid, uuid, jsonb, timestamptz);
drop function if exists strandcue_private.start_execution(uuid, uuid, uuid, jsonb, timestamptz);

create function strandcue_private.start_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  for step in select jsonb_array_elements(stored -> 'steps') loop
    if jsonb_typeof(step) != 'object'
       or step ->> 'stepId' is null or length(step ->> 'stepId') < 1
       or step ->> 'position' is null
       or (step ->> 'position') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'malformed-protocol' using errcode = '22023';
    end if;
  end loop;

  select * into existing from public.protocol_executions
    where user_id = uid and execution_id = p_execution_id;
  if found then raise exception 'execution-conflict' using errcode = '23505'; end if;

  -- The initial snapshot derives SOLELY from the stored trusted decision.
  execution := strandcue_private.build_initial_execution(
    p_execution_id, p_recommendation_run_id, stored, p_started_at);

  insert into public.protocol_executions(
    user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
  values (uid, p_execution_id, p_recommendation_run_id, stored, execution, 0, 'in_progress')
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
alter function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  owner to strandcue_mutator;

create function public.start_protocol_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.start_execution(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
end;
$$;

-- Grants mirror the previous shape on the new signatures: the core stays
-- executable by authenticated (isolation is re-checked inside from
-- request_uid()) and the mutator; the public wrapper by authenticated only.
-- No grant references the removed decision-carrying signatures.
revoke all on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  to authenticated, strandcue_mutator;
revoke all on function public.start_protocol_execution(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.start_protocol_execution(uuid, uuid, uuid, timestamptz)
  to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

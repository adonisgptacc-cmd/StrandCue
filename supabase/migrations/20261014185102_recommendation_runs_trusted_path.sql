-- SC-001: block client-minted executable guidance.
--
-- The authenticated public RPC may persist only non-executable outcomes:
-- needs_setup, content_pending, needs_input, rule_conflict, unsupported,
-- source_error. (source_incomplete is a guidance-gap kind, not a persisted
-- run status, so no new status is introduced here.)
--
-- A 'ready' decision is executable: persisting one requires the dedicated
-- trusted-writer path `strandcue_private.record_trusted_run`, which is
-- executable by `strandcue_mutator` only. It is revoked from PUBLIC, anon
-- and authenticated, and no service_role material is exposed to the app:
-- the mutator role (SECURITY DEFINER owner of the private core) remains the
-- documented trusted-maintenance actor.
--
-- There is deliberately no path selector, owner argument, or role flag on
-- either RPC: the owner always comes from strandcue_private.request_uid()
-- (auth.uid()), and the grant on the trusted function is the only gate, so
-- a client cannot talk its way onto the trusted path.
--
-- Malformed protocol payloads (non-object input or decision JSON) are
-- rejected with 'malformed-protocol' instead of being stored verbatim.
-- Unknown top-level command fields are rejected by the client's strict
-- contract before any RPC call; the SQL signature below stays fixed and
-- positional, so extra arguments are impossible at this layer.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- Shared core. No grants to anon/authenticated: the authenticated wrapper
-- below runs SECURITY DEFINER as the mutator owner, which holds EXECUTE.
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
    bundle_id, bundle_version, status, input, decision)
  values (uid, p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
          p_bundle_id, p_bundle_version, p_status, p_input, p_decision)
  returning * into existing;

  return jsonb_build_object(
    'id', existing.id, 'requestId', existing.request_id,
    'inputFingerprint', existing.input_fingerprint, 'status', existing.status,
    'engineVersion', existing.engine_version, 'bundleId', existing.bundle_id,
    'bundleVersion', existing.bundle_version, 'createdAt', existing.created_at);
end;
$$;
alter function strandcue_private.record_run_core(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, boolean) owner to strandcue_mutator;

-- Authenticated path: executable outcomes stay forbidden.
create or replace function strandcue_private.record_run(
  p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz,
  p_engine_version text, p_bundle_id text, p_bundle_version text,
  p_status text, p_input jsonb, p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return strandcue_private.record_run_core(
    p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
    p_bundle_id, p_bundle_version, p_status, p_input, p_decision, false);
end;
$$;
alter function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) owner to strandcue_mutator;

-- Trusted path: executable outcomes allowed, mutator callers only. There is
-- no status, owner, or path argument to forge: the EXECUTE grant below is
-- the entire gate.
create function strandcue_private.record_trusted_run(
  p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz,
  p_engine_version text, p_bundle_id text, p_bundle_version text,
  p_status text, p_input jsonb, p_decision jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return strandcue_private.record_run_core(
    p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
    p_bundle_id, p_bundle_version, p_status, p_input, p_decision, true);
end;
$$;
alter function strandcue_private.record_trusted_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) owner to strandcue_mutator;

-- The public wrapper is SECURITY INVOKER, so the authenticated caller needs
-- EXECUTE on the core wrapper as well. Isolation does not depend on hiding
-- it: the core re-derives the owner from request_uid(), re-checks
-- authentication and account status itself, and rejects executable outcomes.
revoke all on function strandcue_private.record_run_core(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function strandcue_private.record_run_core(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb, boolean) to strandcue_mutator;
revoke all on function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) to authenticated, strandcue_mutator;
revoke all on function strandcue_private.record_trusted_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.record_trusted_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) to strandcue_mutator;
revoke all on function public.record_recommendation_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_recommendation_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

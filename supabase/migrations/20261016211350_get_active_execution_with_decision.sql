-- Fix E: owner-scoped active-execution aggregate with its stored decision.
--
-- TodayGuidance mounts the execution surface only when an in-memory ready
-- decision exists, so after a real process restart the owner-scoped
-- `get_active_protocol_execution` read is unreachable: the journey sits at
-- idle/check-in while the server still holds an in_progress/paused row. This
-- migration adds ONE aggregate RPC that returns the active execution receipt
-- TOGETHER WITH the exact trusted recommendation-run row (request identity,
-- input fingerprint, engine/bundle versions, status, input, decision, trusted
-- flag) plus the execution row's own stored decision, so the client can
-- validate and render the recovery without a client-supplied replacement
-- decision anywhere on the restore path (no decision parameter exists here).
--
-- Deliberate shape choices:
-- - Owner is always strandcue_private.request_uid() (auth.uid()). No argument
--   of any kind is accepted, so a caller cannot read another owner's row.
-- - Returns null when no in_progress/paused execution exists (normal
--   idle/new-start). A non-null bundle whose run row is missing returns
--   `run: null` rather than throwing, so the client fails closed
--   (unverified, never paints) instead of retrying a permanent condition.
--   The stored execution-row decision is always returned alongside the run
--   decision so the client can prove they agree byte-for-byte.
-- - Read-only: no writes, no operation log, no timestamps taken. Retrying the
--   read can never duplicate history.
-- - Public wrapper is security invoker; the private core is security definer
--   owned by strandcue_mutator and re-derives the owner plus authentication
--   and account-status checks itself, mirroring get_active_execution.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.get_active_execution_with_decision()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  existing public.protocol_executions%rowtype;
  run public.recommendation_runs%rowtype;
  receipt jsonb;
  stored_run jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into existing from public.protocol_executions
    where user_id = uid and status in ('in_progress', 'paused')
    order by created_at desc, id desc limit 1;
  if not found then return null; end if;
  select * into run from public.recommendation_runs
    where user_id = uid and request_id = existing.recommendation_run_id;
  receipt := jsonb_build_object(
    'executionId', existing.execution_id, 'recommendationRunId', existing.recommendation_run_id,
    'status', existing.status, 'revision', existing.revision,
    'updatedAt', existing.updated_at, 'createdAt', existing.created_at,
    'execution', existing.execution);
  if not found then
    return jsonb_build_object(
      'execution', receipt, 'run', null, 'storedDecision', existing.decision);
  end if;
  stored_run := jsonb_build_object(
    'requestId', run.request_id, 'inputFingerprint', run.input_fingerprint,
    'asOf', run.as_of, 'engineVersion', run.engine_version,
    'bundleId', run.bundle_id, 'bundleVersion', run.bundle_version,
    'status', run.status, 'input', run.input, 'decision', run.decision,
    'trusted', run.trusted, 'createdAt', run.created_at);
  return jsonb_build_object(
    'execution', receipt, 'run', stored_run, 'storedDecision', existing.decision);
end;
$$;
alter function strandcue_private.get_active_execution_with_decision() owner to strandcue_mutator;

create or replace function public.get_active_execution_with_decision()
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.get_active_execution_with_decision();
end;
$$;

revoke all on function strandcue_private.get_active_execution_with_decision() from public, anon, authenticated;
grant execute on function strandcue_private.get_active_execution_with_decision() to authenticated, strandcue_mutator;
revoke all on function public.get_active_execution_with_decision() from public, anon, authenticated;
grant execute on function public.get_active_execution_with_decision() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

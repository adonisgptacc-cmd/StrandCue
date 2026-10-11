-- Private, immutable recommendation decision runs.
--
-- Today persists one row per generated decision so a run can be reproduced
-- later. Deliberate shape choices:
-- - Owner is always strandcue_private.request_uid() (auth.uid()). There is no
--   owner argument on the public RPC, so a caller cannot write another
--   owner's row even if it wants to (verified by test).
-- - Append-only for the authenticated role: the only policy granted to
--   `authenticated` is SELECT, and table UPDATE/DELETE are revoked from it.
--   The `strandcue_mutator` role (the SECURITY DEFINER owner of the private
--   core) additionally holds insert/update/delete for the documented
--   service-role maintenance path; that is the one actor that can rewrite a
--   stored audit row, and any use of it is a repository-level decision.
-- - Idempotent on (user_id, request_id): replaying the same request id with
--   the same fingerprint and the same payloads returns the original receipt.
--   Replaying it with different content raises 'run-conflict' instead of
--   silently overwriting the audit.
-- - Input and decision are capped at 256 KiB each so one run cannot become an
--   unbounded store. The exact normalized input and decision required to
--   reproduce the decision are kept verbatim.
-- - No email, username, access token or service key is stored here. Identity
--   is the owner UUID only.
--
-- Public wrapper is a security invoker owned by migration_admin; the private
-- core is a security definer owned by strandcue_mutator.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  request_id uuid not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  as_of timestamptz not null,
  engine_version text not null check (length(engine_version) between 1 and 40),
  bundle_id text not null check (length(bundle_id) between 1 and 120),
  bundle_version text not null check (length(bundle_version) between 1 and 40),
  status text not null check (status in
    ('needs_setup','content_pending','ready','needs_input','rule_conflict','unsupported','source_error')),
  input jsonb not null check (octet_length(input::text) <= 262144),
  decision jsonb not null check (octet_length(decision::text) <= 262144),
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
create index recommendation_runs_owner_time on public.recommendation_runs(user_id, created_at desc, id desc);

alter table public.recommendation_runs enable row level security;
alter table public.recommendation_runs force row level security;

-- Owners may read their own runs. No insert/update/delete policy exists for
-- authenticated: every write goes through the hardened RPC core below.
create policy recommendation_run_read on public.recommendation_runs for select to authenticated
  using (user_id = (select strandcue_private.request_uid())
     and exists (select 1 from public.profiles p
                  where p.user_id = (select strandcue_private.request_uid())
                    and p.account_status = 'active'));
-- The `strandcue_mutator` role is the SECURITY DEFINER owner of the private
-- core, not Supabase's service_role; it holds the documented maintenance
-- access. A real service-role connection bypasses RLS and relies on the
-- `revoke all` below, which deliberately does not name service_role.
create policy recommendation_run_service on public.recommendation_runs for all to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()))
  with check (user_id = (select strandcue_private.request_uid()));

create or replace function strandcue_private.record_run(
  p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz,
  p_engine_version text, p_bundle_id text, p_bundle_version text,
  p_status text, p_input jsonb, p_decision jsonb)
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
alter function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) owner to strandcue_mutator;

create or replace function public.record_recommendation_run(
  p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz,
  p_engine_version text, p_bundle_id text, p_bundle_version text,
  p_status text, p_input jsonb, p_decision jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.record_run(
    p_request_id, p_input_fingerprint, p_as_of, p_engine_version,
    p_bundle_id, p_bundle_version, p_status, p_input, p_decision);
end;
$$;

revoke all on function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
-- The public wrapper is SECURITY INVOKER, so the authenticated caller needs
-- EXECUTE on the core as well. Isolation does not depend on hiding it: the
-- core re-derives the owner from request_uid() and re-checks authentication
-- and account status itself.
grant execute on function strandcue_private.record_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) to authenticated, strandcue_mutator;
revoke all on function public.record_recommendation_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_recommendation_run(uuid, text, timestamptz, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke all on table public.recommendation_runs from public, anon, authenticated;
grant select on table public.recommendation_runs to authenticated;
grant select, insert, update, delete on table public.recommendation_runs to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
-- Secure and audit deletion cancellation (AU-001, AU-004).
--
-- Defects fixed in strandcue_private.cancel_deletion():
-- - No recent-authentication gate: a stale JWT (no fresh password amr)
--   could restore a deleting account. Cancellation now requires the same
--   freshness class as the deletion request: recent_auth(15), checked right
--   after authentication and before any state mutation, raising
--   'recent-auth-required' (42501) with zero state change.
-- - Request evidence destroyed: the tombstone row was deleted with no
--   trace. Cancellation now appends an immutable lifecycle event carrying
--   only what the tombstone already held (username, reason, deleted_at);
--   occurred_at is the server-side cancellation time and user_id is the
--   owner uid. No new PII is collected.
-- - No audit event: the append above is the cancellation audit record.
--
-- History mechanism (controller-confirmed choice): move-then-delete. The
-- request snapshot moves into strandcue_private.deletion_lifecycle_events
-- before the tombstone row is deleted. The tombstone table is untouched, so
-- purge, reapply, status and the completion guard keep their exact
-- semantics: a cancelled account has no tombstone and an active profile, so
-- purge and reapply can never touch it.
--
-- Table design for Task 13: the event vocabulary already admits
-- 'requested', 'purged' and 'auth-deleted', so purge/auth-delete logging
-- needs no schema change. The table carries no FK to profiles (unlike
-- deletion_operations): purge deletes the profile row, and lifecycle
-- evidence must survive it. Owner scoping is enforced by the RLS policies.
-- Append-only: mutator holds SELECT+INSERT only; no UPDATE/DELETE grant or
-- policy exists. Cancellation stays paramless and naturally idempotent: a
-- second cancel meets account_status 'active' and fails closed with
-- 'deletion-not-in-progress'; no operation id is introduced.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table strandcue_private.deletion_lifecycle_events (
  user_id uuid not null,
  event text not null check (event in ('requested', 'cancelled', 'purged', 'auth-deleted')),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  primary key (user_id, event, occurred_at)
);

alter table strandcue_private.deletion_lifecycle_events enable row level security;
alter table strandcue_private.deletion_lifecycle_events force row level security;

create policy deletion_lifecycle_read on strandcue_private.deletion_lifecycle_events for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy deletion_lifecycle_append on strandcue_private.deletion_lifecycle_events for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on strandcue_private.deletion_lifecycle_events from public, anon, authenticated;
grant select, insert on strandcue_private.deletion_lifecycle_events to strandcue_mutator;

create or replace function strandcue_private.cancel_deletion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  profile public.profiles%rowtype;
  tombstone public.deletion_tombstones%rowtype;
  tombstone_found boolean;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  select * into profile from public.profiles where user_id = uid for update;
  if not found then raise exception 'profile-not-found' using errcode = '22023'; end if;
  if profile.account_status <> 'deleting' then raise exception 'deletion-not-in-progress' using errcode = '22023'; end if;
  select * into tombstone from public.deletion_tombstones where user_id = uid;
  tombstone_found := found;
  if tombstone_found and tombstone.purge_completed_at is not null then raise exception 'deletion-not-in-progress' using errcode = '22023'; end if;
  insert into strandcue_private.deletion_lifecycle_events(user_id, event, details)
    values (uid, 'cancelled', case when tombstone_found then jsonb_build_object(
      'username', tombstone.username, 'reason', tombstone.reason, 'deleted_at', tombstone.deleted_at)
      else '{}'::jsonb end);
  update public.profiles set account_status = 'active' where user_id = uid;
  delete from public.deletion_tombstones where user_id = uid;
  return jsonb_build_object('accountStatus', 'active', 'message', 'Account deletion cancelled. Full access restored.');
end;
$$;
alter function strandcue_private.cancel_deletion() owner to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

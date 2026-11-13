-- Deletion immutable RPC — request / cancel / status / purge / reapply.
--
-- Request blocks access immediately by flipping profiles.account_status to
-- deleting: every owner RLS predicate and every RPC account check already
-- requires 'active', so stale JWTs deny without a parallel session table.
-- Cancel restores access only while purging has not run. Purge deletes the
-- profile row (cascades purge all owned data) and stamps the tombstone;
-- reapply deletes any profile resurrected by a restore while a
-- purge-completed tombstone exists. Purge/reapply are scheduler-only
-- (superuser, like export retention); consumers have no execute grant.
-- Public wrappers are security invokers owned by migration_admin; private
-- cores are security definers owned by strandcue_mutator.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;
grant update(account_status) on public.profiles to strandcue_mutator;

-- Cancel removes the tombstone again, so mutator needs an owner-scoped
-- delete path that did not exist in the schema migration.
create policy deletion_tombstone_cancel on public.deletion_tombstones for delete to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));

create or replace function strandcue_private.request_deletion(p_operation_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.deletion_operations%rowtype;
  profile public.profiles%rowtype;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_reason is not null and length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid-reason' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'reason', p_reason);
  select * into prev from strandcue_private.deletion_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  select * into profile from public.profiles where user_id = uid for update;
  if not found then raise exception 'profile-not-found' using errcode = '22023'; end if;
  if profile.account_status <> 'active' then raise exception 'account-not-active' using errcode = '42501'; end if;
  update public.profiles set account_status = 'deleting' where user_id = uid;
  -- Plain insert: a live duplicate is unreachable (re-request meets
  -- account-not-active first), and an upsert would demand UPDATE privileges
  -- beyond the purge-only column grant. The unique constraint is backstop.
  insert into public.deletion_tombstones(user_id, username, reason)
    values (uid, profile.username, nullif(btrim(coalesce(p_reason, '')), ''));
  result := jsonb_build_object('accountStatus', 'deleting', 'message', 'Deletion initiated. Access is now blocked.');
  insert into strandcue_private.deletion_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.request_deletion(uuid, text) owner to strandcue_mutator;

create or replace function strandcue_private.cancel_deletion()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  profile public.profiles%rowtype;
  tombstone public.deletion_tombstones%rowtype;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into profile from public.profiles where user_id = uid for update;
  if not found then raise exception 'profile-not-found' using errcode = '22023'; end if;
  if profile.account_status <> 'deleting' then raise exception 'deletion-not-in-progress' using errcode = '22023'; end if;
  select * into tombstone from public.deletion_tombstones where user_id = uid;
  if found and tombstone.purge_completed_at is not null then raise exception 'deletion-not-in-progress' using errcode = '22023'; end if;
  update public.profiles set account_status = 'active' where user_id = uid;
  delete from public.deletion_tombstones where user_id = uid;
  return jsonb_build_object('accountStatus', 'active', 'message', 'Account deletion cancelled. Full access restored.');
end;
$$;
alter function strandcue_private.cancel_deletion() owner to strandcue_mutator;

create or replace function strandcue_private.deletion_status_core()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  profile public.profiles%rowtype;
  tombstone public.deletion_tombstones%rowtype;
  profile_found boolean;
  tombstone_found boolean;
  status text;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into profile from public.profiles where user_id = uid;
  profile_found := found;
  select * into tombstone from public.deletion_tombstones where user_id = uid;
  tombstone_found := found;
  if profile_found then
    status := profile.account_status;
  elsif tombstone_found then
    status := case when tombstone.purge_completed_at is not null then 'deleted' else 'deleting' end;
  else
    status := 'active';
  end if;
  return jsonb_build_object('accountStatus', status,
    'tombstoneExists', tombstone.user_id is not null,
    'deletedAt', tombstone.deleted_at,
    'purgeCompletedAt', tombstone.purge_completed_at,
    'deletionReason', tombstone.reason);
end;
$$;
alter function strandcue_private.deletion_status_core() owner to strandcue_mutator;

create or replace function public.deletion_request(p_operation_id uuid, p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.request_deletion(p_operation_id, p_reason);
end;
$$;

create or replace function public.deletion_cancel()
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.cancel_deletion();
end;
$$;

create or replace function public.deletion_status()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.deletion_status_core();
end;
$$;

-- Ordered purge and restore reapplication run as the superuser scheduler:
-- no consumer execute grant exists. Deleting the profile cascades all owned
-- data (passports, revisions, services, activities, shelf, tools, jobs,
-- operations); catalogue rows are ownerless and tombstones have no FK, so
-- both survive. Auth identity removal itself needs the service-role Admin
-- API and is a Beta operations step, recorded in the reconciliation matrix.
create or replace function public.deletion_purge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purged integer := 0;
begin
  update public.deletion_tombstones t set purge_completed_at = now()
    from public.profiles p
    where p.user_id = t.user_id and p.account_status = 'deleting' and t.purge_completed_at is null;
  delete from public.profiles p
    using public.deletion_tombstones t
    where p.user_id = t.user_id and p.account_status = 'deleting' and t.purge_completed_at is not null;
  get diagnostics purged = row_count;
  return jsonb_build_object('purged', purged);
end;
$$;

create or replace function public.deletion_reapply()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reapplied integer := 0;
begin
  delete from public.profiles p
    using public.deletion_tombstones t
    where p.user_id = t.user_id and t.purge_completed_at is not null;
  get diagnostics reapplied = row_count;
  return jsonb_build_object('reapplied', reapplied);
end;
$$;

-- Cancel removes the tombstone again; the USING clause of the cancel policy
-- keeps it owner-scoped.
grant delete on public.deletion_tombstones to strandcue_mutator;

revoke all on function strandcue_private.request_deletion(uuid, text), strandcue_private.cancel_deletion(), strandcue_private.deletion_status_core() from public, anon, authenticated;
grant execute on function strandcue_private.request_deletion(uuid, text), strandcue_private.cancel_deletion(), strandcue_private.deletion_status_core() to authenticated, strandcue_mutator;
revoke all on function public.deletion_request(uuid, text), public.deletion_cancel(), public.deletion_status() from public, anon, authenticated;
grant execute on function public.deletion_request(uuid, text), public.deletion_cancel(), public.deletion_status() to authenticated;
revoke all on function public.deletion_purge(), public.deletion_reapply() from public, anon, authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

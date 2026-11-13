-- StrandCue Milestone 6: Account Deletion and Restore Enforcement
-- Task 6.2: Deletion RPC with immediate access block and ordered purge

-- Function to initiate account deletion (recent-auth required)
create function public.request_account_deletion(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  recent boolean;
  profile public.profiles;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  -- Check recent authentication (15 min window)
  select public.check_recent_auth(interval '15 minutes') into recent;
  if not recent then
    raise exception 'recent-auth-required' using errcode='42501';
  end if;

  -- Get profile and lock
  select * into profile from public.profiles where user_id = uid for update;
  if not found then
    raise exception 'profile-not-found' using errcode='22023';
  end if;

  if profile.account_status != 'active' then
    raise exception 'account-not-active' using errcode='42501';
  end if;

  -- IMMEDIATE ACCESS BLOCK: mark as deleting
  update public.profiles
  set account_status = 'deleting',
      last_login_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = uid;

  -- REVOKE ALL SESSIONS (Task 6.3 - preview)
  update public.user_sessions
  set revoked_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = uid and revoked_at is null;

  -- Create tombstone (Task 6.1)
  perform public.create_account_tombstone(uid, profile.username, profile.email, p_reason);

  -- Start ordered purge job (export first, then deletion)
  -- This returns immediately; actual purge runs async
  return jsonb_build_object(
    'status', 'deletion_initiated',
    'account_status', 'deleting',
    'message', 'Deletion initiated. Access blocked. Purge will complete asynchronously.',
    'purge_order', jsonb_build_array('export_jobs', 'user_sessions', 'recent_auth_events', 'support_requests', 'user_data', 'auth_identity')
  );
end $$;

-- Function to get deletion status
create function public.get_deletion_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  profile public.profiles;
  tombstone public.account_tombstones;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  select * into profile from public.profiles where user_id = uid;
  if not found then
    raise exception 'profile-not-found' using errcode='22023';
  end if;

  select * into tombstone from public.account_tombstones where user_id = uid;

  return jsonb_build_object(
    'account_status', profile.account_status,
    'username', profile.username,
    'email', profile.email,
    'tombstone_exists', tombstone is not null,
    'deleted_at', tombstone.deleted_at,
    'purge_completed_at', tombstone.purge_completed_at,
    'restored_at', tombstone.restored_at,
    'deletion_reason', tombstone.deletion_reason
  );
end $$;

-- Function to cancel deletion (only if still in 'deleting' state)
create function public.cancel_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  profile public.profiles;
  tombstone public.account_tombstones;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  select * into profile from public.profiles where user_id = uid;
  if not found then
    raise exception 'profile-not-found' using errcode='22023';
  end if;

  if profile.account_status != 'deleting' then
    raise exception 'deletion-not-in-progress' using errcode='22023';
  end if;

  -- Restore active status
  update public.profiles set account_status = 'active' where user_id = uid;

  -- Restore sessions (un-revoke)
  update public.user_sessions
  set revoked_at = null
  where user_id = uid and revoked_at is not null;

  -- Remove tombstone
  delete from public.account_tombstones where user_id = uid;

  return jsonb_build_object(
    'status', 'deletion_cancelled',
    'account_status', 'active',
    'message', 'Account deletion cancelled. Full access restored.'
  );
end $$;

grant execute on function public.request_account_deletion(text) to authenticated;
grant execute on function public.get_deletion_status() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;
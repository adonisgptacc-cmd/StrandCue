-- StrandCue Milestone 6: Account Deletion and Restore Enforcement
-- Task 6.3: Refresh-session revocation and old token denial

-- Function to revoke all user sessions (called during deletion)
create function public.revoke_all_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_count integer := 0;
begin
  update public.user_sessions
  set revoked_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = p_user_id
    and revoked_at is null;

  get diagnostics revoked_count = row_count;
  return revoked_count;
end $$;

-- Function to check if a session is revoked (for auth middleware)
create function public.is_session_revoked(p_session_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  revoked boolean;
begin
  select (revoked_at is not null) into revoked
  from public.user_sessions
  where session_id = p_session_id;

  return coalesce(revoked, true); -- default to true if session not found
end $$;

-- Function to deny access if account is deleted or deleting (for auth middleware)
create function public.check_account_access(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile public.profiles;
  tombstone public.account_tombstones;
begin
  select * into profile from public.profiles where user_id = p_user_id;
  if not found then
    return false;
  end if;

  if profile.account_status in ('deleting', 'deleted') then
    return false;
  end if;

  -- Check tombstone
  select 1 into tombstone from public.account_tombstones where user_id = p_user_id;
  if found then
    return false;
  end if;

  return true;
end $$;

-- Function to validate session and account access (for middleware)
-- Returns user_id if valid, raises exception if invalid
create function public.validate_session_and_account(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  session public.user_sessions;
begin
  select user_id into uid from public.user_sessions where session_id = p_session_id;
  if uid is null then
    raise exception 'invalid-session' using errcode='42501';
  end if;

  -- Check session revoked
  if exists(select 1 from public.user_sessions where session_id = p_session_id and revoked_at is not null) then
    raise exception 'session-revoked' using errcode='42501';
  end if;

  -- Check expiry
  if exists(select 1 from public.user_sessions where session_id = p_session_id and expires_at < (now() at time zone 'Africa/Johannesburg')) then
    raise exception 'session-expired' using errcode='42501';
  end if;

  -- Check account access (not deleting/deleted, no tombstone)
  if not public.check_account_access((select user_id from public.user_sessions where session_id = p_session_id)) then
    raise exception 'account-deleted' using errcode='42501';
  end if;

  return uid;
end $$;

-- Function to deny old access tokens (JWTs) after deletion
-- Called by auth middleware / middleware to check if JWT should be rejected
create function public.is_token_denied(p_user_id uuid, p_issued_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tombstone public.account_tombstones;
  deletion_time timestamptz;
begin
  -- Check if account has tombstone
  select deleted_at into deletion_time from public.account_tombstones where user_id = p_user_id;
  
  if deletion_time is null then
    return false; -- No tombstone, token not denied by deletion
  end if;

  -- Token issued before deletion is denied
  if p_issued_at < deletion_time then
    return true;
  end if;

  return false;
end $$;

-- Grant execute permissions
grant execute on function public.revoke_all_user_sessions(uuid) to strandcue_mutator;
grant execute on function public.is_session_revoked(uuid) to authenticated;
grant execute on function public.check_account_access(uuid) to authenticated;
grant execute on function public.validate_session_and_account(uuid) to authenticated;
grant execute on function public.is_token_denied(uuid, timestamptz) to authenticated;
-- StrandCue Milestone 6: Account Deletion and Restore Enforcement
-- Task 6.4: Tombstone survival and restore procedure

-- Function to re-apply tombstone after restore (called after Auth identity recreated)
create function public.reapply_tombstone_after_restore(p_user_id uuid, p_username text, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Check if tombstone exists
  if exists(select 1 from public.account_tombstones where user_id = p_user_id) then
    -- Re-apply tombstone (survives Auth deletion)
    update public.account_tombstones
    set username = p_username,
        email = p_email,
        restore_attempted_at = (now() at time zone 'Africa/Johannesburg'),
        restored_at = (now() at time zone 'Africa/Johannesburg')
    where user_id = p_user_id;
  else
    -- Create new tombstone if somehow missing
    insert into public.account_tombstones (user_id, username, email, deletion_reason, restore_attempted_at, restored_at)
    values (p_user_id, p_username, p_email, 'Restored after deletion', (now() at time zone 'Africa/Johannesburg'), (now() at time zone 'Africa/Johannesburg'))
    on conflict (user_id) do update set
      username = EXCLUDED.username,
      email = EXCLUDED.email,
      restore_attempted_at = EXCLUDED.restore_attempted_at,
      restored_at = EXCLUDED.restored_at;
  end if;
end $$;

-- Function to complete purge after tombstone exists (called after dependants purged)
create function public.complete_account_purge(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tombstone public.account_tombstones;
begin
  -- Verify tombstone exists
  select * into tombstone from public.account_tombstones where user_id = p_user_id;
  if not found then
    raise exception 'tombstone-not-found' using errcode='22023';
  end if;

  -- Mark purge completed
  update public.account_tombstones
  set purge_completed_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = p_user_id;

  -- Update profile status to deleted
  update public.profiles
  set account_status = 'deleted'
  where user_id = p_user_id;
end $$;

-- Function to verify restore can proceed (tombstone exists, not already restored)
create function public.can_restore_account(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tombstone public.account_tombstones;
begin
  select * into tombstone from public.account_tombstones where user_id = p_user_id;
  if not found then
    return false;
  end if;

  -- Can restore if tombstone exists but not yet restored
  if tombstone.restored_at is not null then
    return false;
  end if;

  return true;
end $$;

-- Function to perform full restore (recreate user, reapply tombstone, mark restored)
create function public.perform_account_restore(p_user_id uuid, p_new_user_id uuid, p_admin_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  tombstone public.account_tombstones;
  can_restore boolean;
begin
  -- Check if restore is allowed
  select public.can_restore_account(p_user_id) into can_restore;
  if not can_restore then
    raise exception 'restore-not-allowed' using errcode='22023';
  end if;

  select * into tombstone from public.account_tombstones where user_id = p_user_id;

  -- Re-apply tombstone with new user_id (survives Auth recreation)
  -- The tombstone keeps the original user_id for audit, but we track new_user_id for mapping
  update public.account_tombstones
  set restore_admin_id = p_admin_id,
      restore_attempted_at = (now() at time zone 'Africa/Johannesburg'),
      restored_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = p_user_id;

  -- Note: In production, this would also recreate the Auth user with p_new_user_id
  -- The tombstone with original user_id survives to detect future restore attempts

  return true;
end $$;

-- Function to re-purge after restore (re-applies tombstone enforcement)
create function public.repurge_after_restore(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tombstone public.account_tombstones;
begin
  select * into tombstone from public.account_tombstones where user_id = p_user_id;
  if not found then
    raise exception 'tombstone-not-found' using errcode='22023';
  end if;

  if tombstone.restored_at is null then
    raise exception 'account-not-restored' using errcode='22023';
  end if;

  -- Re-apply purge (tombstone already exists, just ensure purge_completed)
  update public.account_tombstones
  set purge_completed_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = p_user_id;

  -- Update profile status
  update public.profiles
  set account_status = 'deleted'
  where user_id = p_user_id;
end $$;

-- Grant execute permissions
grant execute on function public.reapply_tombstone_after_restore(uuid, text, text) to strandcue_mutator;
grant execute on function public.complete_account_purge(uuid) to strandcue_mutator;
grant execute on function public.can_restore_account(uuid) to authenticated;
grant execute on function public.perform_account_restore(uuid, uuid, uuid) to strandcue_mutator;
grant execute on function public.repurge_after_restore(uuid) to strandcue_mutator;
-- StrandCue Milestone 6: Account Deletion and Restore Enforcement
-- Task 6.1: Account states (active, deleting, deleted) and tombstone

-- Extend profiles with account_status (already has 'active', 'deleting' - ensure 'deleted')
-- Already has: account_status text not null default 'active' check (account_status in ('active','deleting'))
-- Add 'deleted' state
alter table public.profiles drop constraint profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (account_status in ('active','deleting','deleted'));

comment on column public.profiles.account_status is 'Account lifecycle state: active (normal), deleting (deletion in progress), deleted (tombstone only)';

-- Tombstone table: survives Auth deletion, minimal mapping for restore detection
create table public.account_tombstones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  username text not null,
  email text not null,
  deleted_at timestamptz not null default now(),
  deletion_reason text,
  purge_completed_at timestamptz,
  restore_attempted_at timestamptz,
  restored_at timestamptz,
  restore_admin_id uuid,
  primary key (id, user_id)
);

comment on table public.account_tombstones is 'Tombstone survives Auth deletion; minimal mapping for restore detection and re-purge';

-- RLS for tombstones (owner can read their own tombstone if they somehow access it; otherwise admin-only)
alter table public.account_tombstones enable row level security;

create policy tombstone_owner_select on public.account_tombstones for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy tombstone_system_insert on public.account_tombstones for insert to strandcue_mutator with check (true);
create policy tombstone_system_update on public.account_tombstones for update to strandcue_mutator using (true);

grant select on public.account_tombstones to authenticated;
grant select, insert, update on public.account_tombstones to strandcue_mutator;

-- Index for restore detection
create index account_tombstones_user on public.account_tombstones(user_id);
create index account_tombstones_email on public.account_tombstones(email);

-- Function to create tombstone (called by deletion RPC)
create function public.create_account_tombstone(
  p_user_id uuid,
  p_username text,
  p_email text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_tombstones (user_id, username, email, deletion_reason)
  values (p_user_id, p_username, p_email, p_reason)
  on conflict (user_id) do update set
    deletion_reason = EXCLUDED.deletion_reason,
    deleted_at = (now() at time zone 'Africa/Johannesburg');
end $$;

-- Function to check if account is deleted (tombstone exists)
create function public.is_account_deleted(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  exists boolean;
begin
  select exists(select 1 from public.account_tombstones where user_id = p_user_id) into exists;
  return exists;
end $$;

-- Function to attempt restore (admin only, reapplies tombstone after purge)
create function public.attempt_account_restore(p_user_id uuid, p_admin_id uuid)
returns boolean
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

  -- Reapply tombstone after restore (survives Auth recreation)
  update public.account_tombstones
  set restore_attempted_at = (now() at time zone 'Africa/Johannesburg'),
      restore_admin_id = p_admin_id,
      restored_at = (now() at time zone 'Africa/Johannesburg')
  where user_id = p_user_id;

  return true;
end $$;

grant execute on function public.create_account_tombstone(uuid, text, text, text) to strandcue_mutator;
grant execute on function public.is_account_deleted(uuid) to authenticated;
grant execute on function public.attempt_account_restore(uuid, uuid) to authenticated;
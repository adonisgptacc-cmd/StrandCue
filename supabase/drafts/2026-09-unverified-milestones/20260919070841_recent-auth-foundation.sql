-- StrandCue Task 4.6: Recent-auth foundation for export and deletion
-- Milestone 4: Settings and account completion

-- Recent-auth tracking table for export/deletion gates
create table public.recent_auth_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  auth_type text not null check (auth_type in ('password', 'email_link', 'mfa', 'recovery')),
  verified_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  session_id uuid not null references public.user_sessions(session_id),
  primary key (user_id, id)
);

-- RLS policies for recent_auth_events
alter table public.recent_auth_events enable row level security;

create policy recent_auth_owner_select on public.recent_auth_events for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy recent_auth_owner_insert on public.recent_auth_events for insert to authenticated with check (user_id=(select strandcue_private.request_uid()));

grant select, insert on public.recent_auth_events to authenticated;

-- Function to check recent authentication (for export/deletion gates)
create function public.check_recent_auth(p_max_age interval default interval '15 minutes')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  recent boolean;
begin
  if uid is null then
    return false;
  end if;

  select exists(
    select 1 from public.recent_auth_events
    where user_id = uid
      and verified_at >= (now() at time zone 'Africa/Johannesburg') - p_max_age
  ) into recent;

  return recent;
end $$;

-- Function to record a recent auth event (called after successful auth)
create function public.record_recent_auth(
  p_auth_type text,
  p_session_id uuid,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  insert into public.recent_auth_events (user_id, auth_type, verified_at, ip_address, user_agent, session_id)
  values (uid, p_auth_type, (now() at time zone 'Africa/Johannesburg'), p_ip_address, p_user_agent, p_session_id);

  -- Cleanup old events (keep last 30 days)
  delete from public.recent_auth_events
  where user_id = uid
    and verified_at < (now() at time zone 'Africa/Johannesburg') - interval '30 days';
end $$;

grant execute on function public.check_recent_auth(interval) to authenticated;
grant execute on function public.record_recent_auth(text, uuid, inet, text) to authenticated;
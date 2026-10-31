-- StrandCue Task 4.5: Account/session information display
-- Milestone 4: Settings and account completion

-- Add session tracking columns to profiles
alter table public.profiles add column last_login_at timestamptz;
alter table public.profiles add column last_session_id uuid;

comment on column public.profiles.last_login_at is 'Timestamp of most recent successful authentication';
comment on column public.profiles.last_session_id is 'Identifier of most recent active session';

-- Session tracking table for recent-auth foundation
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  session_id uuid not null,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique(user_id, session_id)
);

-- RLS policies for user_sessions
alter table public.user_sessions enable row level security;

create policy session_owner_select on public.user_sessions for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy session_owner_insert on public.user_sessions for insert to authenticated with check (user_id=(select strandcue_private.request_uid()));
create policy session_owner_update on public.user_sessions for update to authenticated using (user_id=(select strandcue_private.request_uid()));

grant select, insert, update on public.user_sessions to authenticated;
grant update(revoked_at) on public.user_sessions to strandcue_mutator;

-- RLS: owner can update their own session tracking columns
create policy profile_session_update on public.profiles for update to authenticated using (owner=(select strandcue_private.request_uid()));

grant update(last_login_at, last_session_id) on public.profiles to authenticated using (owner=(select strandcue_private.request_uid()));

-- Index for session cleanup
create index user_sessions_user_expires on public.user_sessions(user_id, expires_at);
create index user_sessions_revoked on public.user_sessions(user_id) where revoked_at is not null;
-- StrandCue Task 4.2: Email and password changes without changing owner UUID
-- Milestone 4: Settings and account completion

-- Track email change history
create table public.email_change_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  old_email text not null,
  new_email text not null,
  changed_at timestamptz not null default now(),
  reason text
);

comment on table public.email_change_history is 'Audit trail of email changes; preserves history without altering owner UUID';

-- RLS policies for email change history
alter table public.email_change_history enable row level security;

create policy email_change_history_owner_read on public.email_change_history for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy email_change_history_owner_insert on public.email_change_history for insert to authenticated with check (user_id=(select strandcue_private.request_uid()));

grant select on public.email_change_history to authenticated using (user_id=(select strandcue_private.request_uid()));

-- Update the profiles table to track last email change
alter table public.profiles add column last_email_change timestamptz;

comment on column public.profiles.last_email_change is 'Tracks last email change for audit and conflict detection';

-- RLS: owner can update their own profile fields
create policy profile_email_update on public.profiles for update to authenticated using (owner=(select strandcue_private.request_uid()));

grant update on public.profiles to authenticated using (owner=(select strandcue_private.request_uid()));

-- Add comment
comment on table public.profiles is 'User profile with username, eligibility, email change tracking, and session lifecycle fields; RLS enforced on all operations';
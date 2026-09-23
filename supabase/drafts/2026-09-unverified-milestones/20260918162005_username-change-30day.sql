-- StrandCue Task 4.1: Username change with 30-day rule and conflict handling
-- Milestone 4: Settings and account completion

alter table public.profiles add column last_changed_at timestamptz;

comment on column public.profiles.last_changed_at is 'Tracks last username change for 30-day rule';

-- RLS policy: only owner can update their own profile (including username)
create policy profile_username_update on public.profiles for update to authenticated using (owner=(select strandcue_private.request_uid()));

-- Grant permissions
grant update on public.profiles to authenticated using (owner=(select strandcue_private.request_uid()));

-- Add comment to the table
comment on table public.profiles is 'User profile with username, eligibility, and session lifecycle fields; RLS enforced on all operations';
-- StrandCue Task 4.3: Optional analytics consent
-- Milestone 4: Settings and account completion

-- Add analytics consent column to profiles
alter table public.profiles add column analytics_consent boolean not null default false;

comment on column public.profiles.analytics_consent is 'User consent for analytics tracking; false by default; disabling analytics does not affect core functions';

-- RLS: owner can update their own analytics_consent
create policy profile_analytics_update on public.profiles for update to authenticated using (owner=(select strandcue_private.request_uid()));

grant update(analytics_consent) on public.profiles to authenticated using (owner=(select strandcue_private.request_uid()));
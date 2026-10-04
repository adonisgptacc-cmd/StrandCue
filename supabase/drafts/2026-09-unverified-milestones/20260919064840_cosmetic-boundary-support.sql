-- StrandCue Task 4.4: Cosmetic-record boundary and support/help route
-- Milestone 4: Settings and account completion

-- Add cosmetic boundary flag to profiles (users can opt-in to mark records as cosmetic-only)
alter table public.profiles add column cosmetic_mode boolean not null default false;

comment on column public.profiles.cosmetic_mode is 'When true, records are marked as cosmetic/visual only; no medical/functional claims inferred';

-- Support requests table for help route
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS policies for support_requests
alter table public.support_requests enable row level security;

create policy support_request_owner_select on public.support_requests for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy support_request_owner_insert on public.support_requests for insert to authenticated with check (user_id=(select strandcue_private.request_uid()));
create policy support_request_owner_update on public.support_requests for update to authenticated using (user_id=(select strandcue_private.request_uid()));

grant select, insert, update on public.support_requests to authenticated;
grant update(status, updated_at) on public.support_requests to strandcue_mutator;

-- RLS: owner can update their own cosmetic_mode
create policy profile_cosmetic_update on public.profiles for update to authenticated using (owner=(select strandcue_private.request_uid()));

grant update(cosmetic_mode) on public.profiles to authenticated using (owner=(select strandcue_private.request_uid()));
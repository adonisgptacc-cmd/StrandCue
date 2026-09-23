-- Trusted deletion tombstones baseline — replaces archived deletion drafts.
--
-- The tombstone is the minimal restore-survival mapping: user_id, username
-- and purge state. Deliberate deviations from the archived drafts:
-- - No email column (P1-AUTH-01: email lives in Auth and is never
--   duplicated into application tables).
-- - No broken composite primary key, no restore/mark functions executable
--   by consumers, no references to nonexistent session/support tables.
-- - profiles.account_status already supports 'deleting'; the existing
--   owner+active RLS predicates and RPC account checks enforce the
--   immediate access block with no schema change there.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.deletion_tombstones (
  user_id uuid primary key,
  username text not null check (length(btrim(username)) between 1 and 64),
  deleted_at timestamptz not null default now(),
  reason text check (reason is null or length(btrim(reason)) between 1 and 500),
  purge_completed_at timestamptz
);

create table strandcue_private.deletion_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.deletion_tombstones enable row level security;
alter table strandcue_private.deletion_operations enable row level security;
alter table public.deletion_tombstones force row level security;
alter table strandcue_private.deletion_operations force row level security;

-- Owners read their own tombstone without a profile join: the row must stay
-- visible while the profile is deleting, and RLS on profiles would hide it.
create policy deletion_tombstone_read on public.deletion_tombstones for select to authenticated, strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy deletion_tombstone_insert on public.deletion_tombstones for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
create policy deletion_tombstone_update on public.deletion_tombstones for update to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid())) with check (user_id = (select strandcue_private.request_uid()));
create policy deletion_operation_read on strandcue_private.deletion_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy deletion_operation_append on strandcue_private.deletion_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on public.deletion_tombstones from public, anon, authenticated;
revoke all on strandcue_private.deletion_operations from public, anon, authenticated;
grant select on public.deletion_tombstones to authenticated;
grant select, insert on public.deletion_tombstones, strandcue_private.deletion_operations to strandcue_mutator;
grant update(purge_completed_at) on public.deletion_tombstones to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

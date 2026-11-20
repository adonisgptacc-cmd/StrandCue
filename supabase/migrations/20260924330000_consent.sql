-- Trusted consent records baseline.
--
-- Per-purpose consent log: each grant or withdrawal appends a row, current
-- state is the latest row per purpose. Deliberate shape choices:
-- - No foreign key to profiles: consent records follow a 7-year retention
--   schedule and must survive account purge (verified by test).
-- - Append-only: no UPDATE or DELETE policies exist for any role.
-- - hair_passport_processing is required while the account is active;
--   withdrawing it means deleting the account (enforced in the RPC core).

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purpose text not null check (purpose in ('hair_passport_processing','marketing_email','community_outcomes','product_analytics')),
  granted boolean not null,
  recorded_at timestamptz not null default now()
);
create index consent_records_owner_purpose_time on public.consent_records(user_id, purpose, recorded_at desc, id desc);

create table strandcue_private.consent_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.consent_records enable row level security;
alter table strandcue_private.consent_operations enable row level security;
alter table public.consent_records force row level security;
alter table strandcue_private.consent_operations force row level security;

create policy consent_record_read on public.consent_records for select to authenticated, strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy consent_record_append on public.consent_records for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
create policy consent_operation_read on strandcue_private.consent_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy consent_operation_append on strandcue_private.consent_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on public.consent_records from public, anon, authenticated;
revoke all on strandcue_private.consent_operations from public, anon, authenticated;
grant select on public.consent_records to authenticated;
grant select, insert on public.consent_records, strandcue_private.consent_operations to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

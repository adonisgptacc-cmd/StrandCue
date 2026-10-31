-- Trusted export jobs baseline — replaces archived export-* drafts.
--
-- Server-side recent-auth helper plus owner-scoped export jobs with
-- operation-key idempotency. Deliberate deviations from the archived drafts:
-- - No direct consumer writes: authenticated gets SELECT only; the RPC core
--   (next migration) writes as strandcue_mutator.
-- - No OFFSET pagination, no HMAC-in-SQL download signing, no signing keys
--   in database settings. Downloads return the stored document through the
--   owner-checked RPC while unexpired; retention nulls expired documents.
-- - Recent auth reads the JWT amr timestamps (password authentication time),
--   not a parallel session table that can drift.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- True when the session JWT contains a password (or equivalent) authentication
-- within the window. Missing, malformed or stale claims mean false, never error.
create or replace function strandcue_private.recent_auth(p_window_minutes integer default 15)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare
  claims jsonb;
  amr jsonb;
  item jsonb;
  ts timestamptz;
  latest timestamptz;
begin
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return false;
  end;
  if claims is null or jsonb_typeof(claims) <> 'object' then return false; end if;
  amr := claims -> 'amr';
  if amr is null or jsonb_typeof(amr) <> 'array' then return false; end if;
  for item in select * from jsonb_array_elements(amr) loop
    begin
      ts := (item ->> 'timestamp')::timestamptz;
    exception when others then
      continue;
    end;
    if ts is not null and (latest is null or ts > latest) then latest := ts; end if;
  end loop;
  if latest is null then return false; end if;
  return latest >= now() - (p_window_minutes || ' minutes')::interval;
end;
$$;

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  format text not null check (format in ('json', 'csv')),
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  document jsonb,
  record_count integer not null default 0 check (record_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique (id, owner)
);
create index export_jobs_owner_time on public.export_jobs(owner, created_at desc, id desc);

create table strandcue_private.export_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.export_jobs enable row level security;
alter table strandcue_private.export_operations enable row level security;
alter table public.export_jobs force row level security;
alter table strandcue_private.export_operations force row level security;

create policy export_job_read on public.export_jobs for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = export_jobs.owner and p.account_status = 'active'));
create policy export_job_insert on public.export_jobs for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = export_jobs.owner and p.account_status = 'active'));
create policy export_job_update on public.export_jobs for update to strandcue_mutator
  using (owner = (select strandcue_private.request_uid())) with check (owner = (select strandcue_private.request_uid()));
create policy export_operation_read on strandcue_private.export_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy export_operation_append on strandcue_private.export_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on public.export_jobs from public, anon, authenticated;
revoke all on strandcue_private.export_operations from public, anon, authenticated;
grant select on public.export_jobs to authenticated;
grant select, insert on public.export_jobs, strandcue_private.export_operations to strandcue_mutator;
grant update(status, document, record_count, error_message, completed_at, expires_at) on public.export_jobs to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;
grant execute on function strandcue_private.recent_auth(integer) to authenticated, strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

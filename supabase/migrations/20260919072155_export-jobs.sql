-- StrandCue Milestone 5: Account Export
-- Task 5.1: Export job state table and status management

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  format text not null check (format in ('json', 'csv')),
  file_url text,
  file_path text,
  file_size_bytes bigint,
  record_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() at time zone 'Africa/Johannesburg') + interval '24 hours',
  unique (user_id, id)
);

comment on table public.export_jobs is 'Export job tracking with status, format, file references, and 24-hour download expiry';

-- RLS policies
alter table public.export_jobs enable row level security;

create policy export_job_owner_select on public.export_jobs for select to authenticated using (user_id=(select strandcue_private.request_uid()));
create policy export_job_owner_insert on public.export_jobs for insert to authenticated with check (user_id=(select strandcue_private.request_uid()));
create policy export_job_owner_update on public.export_jobs for update to authenticated using (user_id=(select strandcue_private.request_uid()));

grant select, insert, update on public.export_jobs to authenticated;

-- Indexes for cleanup and status queries
create index export_jobs_user_status on public.export_jobs(user_id, status);
create index export_jobs_expires on public.export_jobs(expires_at) where status = 'completed';

-- Function to create export job (recent-auth required)
create function public.create_export_job(p_format text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  job_id uuid;
  recent boolean;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  -- Check recent authentication (uses Task 4.6 foundation)
  select public.check_recent_auth(interval '15 minutes') into recent;
  if not recent then
    raise exception 'recent-auth-required' using errcode='42501';
  end if;

  if p_format not in ('json', 'csv') then
    raise exception 'invalid-format' using errcode='22023';
  end if;

  insert into public.export_jobs (user_id, status, format, expires_at)
  values (uid, 'pending', p_format, (now() at time zone 'Africa/Johannesburg') + interval '24 hours')
  returning id into job_id;

  return job_id;
end $$;

-- Function to get export job status (owner only)
create function public.get_export_job(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  select * into job from public.export_jobs where id = p_job_id and user_id = uid;
  if not found then
    raise exception 'export-job-not-found' using errcode='22023';
  end if;

  return jsonb_build_object(
    'id', job.id,
    'status', job.status,
    'format', job.format,
    'file_url', job.file_url,
    'file_size_bytes', job.file_size_bytes,
    'record_count', job.record_count,
    'error_message', job.error_message,
    'created_at', job.created_at,
    'started_at', job.started_at,
    'completed_at', job.completed_at,
    'expires_at', job.expires_at
  );
end $$;

-- Function to list user's export jobs
create function public.list_export_jobs(p_limit integer default 20, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  jobs jsonb;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(job order by created_at desc), '[]'::jsonb) into jobs
  from (
    select id, status, format, file_url, file_size_bytes, record_count,
           error_message, created_at, started_at, completed_at, expires_at
    from public.export_jobs
    where user_id = uid
    order by created_at desc
    limit p_limit offset p_offset
  ) job;

  return jsonb_build_object('jobs', jobs);
end $$;

grant execute on function public.create_export_job(text) to authenticated;
grant execute on function public.get_export_job(uuid) to authenticated;
grant execute on function public.list_export_jobs(integer, integer) to authenticated;
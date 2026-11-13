-- StrandCue Milestone 5: Account Export
-- Task 5.5: Retention cleanup (7-day object removal)

-- Function to cleanup expired export jobs and files (run daily via cron)
create function public.cleanup_expired_exports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
  job public.export_jobs;
begin
  -- Delete export jobs older than 7 days (created_at)
  -- Also clean up associated storage files (in production, would call storage API)
  for job in
    select id, file_path from public.export_jobs
    where status in ('completed', 'failed')
      and created_at < (now() at time zone 'Africa/Johannesburg') - interval '7 days'
  loop
    -- In production: call storage.delete_object(job.file_path)
    -- For now, just delete the job record
    delete from public.export_jobs where id = job.id;
    deleted_count := deleted_count + 1;
  end loop;

  -- Also clean up expired pending/processing jobs (stuck jobs older than 24h)
  delete from public.export_jobs
  where status in ('pending', 'processing')
    and created_at < (now() at time zone 'Africa/Johannesburg') - interval '24 hours';

  get diagnostics deleted_count = row_count;

  return deleted_count;
end $$;

-- Function to cleanup expired recent-auth events (30 days)
create function public.cleanup_expired_recent_auth()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.recent_auth_events
  where verified_at < (now() at time zone 'Africa/Johannesburg') - interval '30 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

-- Function to cleanup old support requests (90 days, resolved/closed)
create function public.cleanup_expired_support_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.support_requests
  where status in ('resolved', 'closed')
    and updated_at < (now() at time zone 'Africa/Johannesburg') - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

-- Function to cleanup expired sessions (configurable, default 30 days)
create function public.cleanup_expired_sessions(p_max_age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.user_sessions
  where expires_at < (now() at time zone 'Africa/Johannesburg') - p_max_age
     or revoked_at is not null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end $$;

-- Combined daily cleanup function (call via pg_cron or external scheduler)
create function public.run_daily_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  exports_deleted integer;
  auth_deleted integer;
  support_deleted integer;
  sessions_deleted integer;
begin
  exports_deleted := public.cleanup_expired_exports();
  auth_deleted := public.cleanup_expired_recent_auth();
  support_deleted := public.cleanup_expired_support_requests();
  sessions_deleted := public.cleanup_expired_sessions();

  return jsonb_build_object(
    'exports_deleted', exports_deleted,
    'auth_events_deleted', auth_deleted,
    'support_requests_deleted', support_deleted,
    'sessions_deleted', sessions_deleted,
    'run_at', (now() at time zone 'Africa/Johannesburg')
  );
end $$;

-- Grant execute permissions
grant execute on function public.cleanup_expired_exports() to authenticated;
grant execute on function public.cleanup_expired_recent_auth() to authenticated;
grant execute on function public.cleanup_expired_support_requests() to authenticated;
grant execute on function public.cleanup_expired_sessions(interval) to authenticated;
grant execute on function public.run_daily_cleanup() to authenticated;

-- Note: Schedule via pg_cron (if available) or external scheduler:
-- SELECT cron.schedule('daily-cleanup', '0 3 * * *', 'SELECT public.run_daily_cleanup();');
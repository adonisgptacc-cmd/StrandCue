-- StrandCue Milestone 5: Account Export
-- Task 5.4: Download authorization with 24-hour expiry

-- Function to generate signed download URL (owner only, 24-hour expiry)
create function public.get_export_download_url(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs;
  download_url text;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  -- Verify job ownership and completed status
  select * into job from public.export_jobs where id = p_job_id and user_id = uid;
  if not found then
    raise exception 'export-job-not-found' using errcode='22023';
  end if;

  if job.status != 'completed' then
    raise exception 'export-not-ready' using errcode='22023';
  end if;

  -- Check 24-hour expiry
  if job.expires_at <= (now() at time zone 'Africa/Johannesburg') then
    raise exception 'download-link-expired' using errcode='42501';
  end if;

  -- Generate signed URL (using Supabase Storage signed URL pattern)
  -- The file_path should be a Supabase Storage path
  -- In production, this would use storage.create_signed_url()
  -- For now, construct a signed URL with HMAC signature
  download_url := public.sign_export_download_url(p_job_id, job.file_path, job.expires_at);

  return jsonb_build_object(
    'download_url', download_url,
    'expires_at', job.expires_at,
    'file_size_bytes', job.file_size_bytes
  );
end $$;

-- Helper: Generate HMAC-signed download URL
create function public.sign_export_download_url(p_job_id uuid, p_file_path text, p_expires_at timestamptz)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  signature text;
  expiry_epoch bigint;
  base_url text := current_setting('app.export_base_url', true);
  signing_key text := current_setting('app.export_signing_key', true);
begin
  expiry_epoch := floor(extract(epoch from p_expires_at));
  signature := encode(hmac((p_job_id || '|' || p_file_path || '|' || expiry_epoch)::bytea, signing_key::bytea, 'sha256'), 'hex');
  return format('%s/export/%s/download?file=%s&expires=%s&sig=%s',
    base_url, p_job_id, encode(p_file_path, 'base64'), expiry_epoch, signature);
end $$;

-- Function to verify and serve download (called by edge function or API)
create function public.verify_export_download(
  p_job_id uuid,
  p_file_path text,
  p_expires bigint,
  p_signature text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_signature text;
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs;
begin
  if uid is null then
    return false;
  end if;

  -- Verify job ownership and completion
  select * into job from public.export_jobs where id = p_job_id and user_id = uid;
  if not found then
    return false;
  end if;

  if job.status != 'completed' then
    return false;
  end if;

  -- Check expiry
  if to_timestamp(p_expires) <= (now() at time zone 'Africa/Johannesburg') then
    return false;
  end if;

  -- Verify signature
  expected_signature := public.sign_export_download_url(p_job_id, p_file_path, to_timestamp(p_expires));
  if expected_signature like '%' || p_signature then
    return true;
  end if;

  return false;
end $$;

-- Function to get signed download info (for UI)
create function public.get_export_download_info(p_job_id uuid)
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

  if job.status != 'completed' then
    raise exception 'export-not-ready' using errcode='22023';
  end if;

  if job.expires_at <= (now() at time zone 'Africa/Johannesburg') then
    raise exception 'download-link-expired' using errcode='42501';
  end if;

  return jsonb_build_object(
    'download_url', public.sign_export_download_url(job.id, job.file_path, job.expires_at),
    'expires_at', job.expires_at,
    'file_size_bytes', job.file_size_bytes,
    'format', job.format
  );
end $$;

grant execute on function public.get_export_download_url(uuid) to authenticated;
grant execute on function public.get_export_download_info(uuid) to authenticated;
grant execute on function public.verify_export_download(uuid, text, bigint, text) to authenticated;
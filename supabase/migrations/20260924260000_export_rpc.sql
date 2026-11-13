-- Export immutable RPC — request / status / download / retention.
--
-- The export document is generated synchronously inside request_export, so
-- Phase 1 needs no background worker, no object storage and no signing
-- keys: download returns the stored document through the owner-checked RPC
-- while unexpired, and retention nulls expired documents. CSV is rejected
-- with invalid-format until a reviewed CSV renderer lands; csv jobs are
-- never created. Public wrappers are security invokers owned by
-- migration_admin; the generation core is a security definer owned by
-- strandcue_mutator. Status/download reads run as the caller under RLS.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.export_operations%rowtype;
  job_id uuid := gen_random_uuid();
  document jsonb;
  counts integer := 0;
  n integer;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_format is null or p_format <> 'json' then raise exception 'invalid-format' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'format', p_format);
  select * into prev from strandcue_private.export_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  select jsonb_build_object(
    'exportedAt', now(),
    'userId', uid,
    'profile', (select jsonb_build_object('username', p.username, 'country', p.country, 'currency', p.currency,
      'temperatureUnit', p.temperature_unit, 'createdAt', p.created_at)
      from public.profiles p where p.user_id = uid),
    'passport', (select jsonb_build_object('revision', h.revision, 'projection', h.current_projection,
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.passport_revisions r where r.passport_id = h.id))
      from public.hair_passports h where h.user_id = uid),
    'chemicalServices', (select coalesce(jsonb_agg(jsonb_build_object('service', to_jsonb(s),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.service_revisions r where r.service_id = s.id),
        'zones', (select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
          from public.service_zones z where z.service_id = s.id),
        'observations', (select coalesce(jsonb_agg(to_jsonb(o) order by o.recorded_at), '[]'::jsonb)
          from public.service_observations o where o.service_id = s.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.heat_events e where e.service_id = s.id))), '[]'::jsonb)
      from public.chemical_services s where s.user_id = uid),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('activity', to_jsonb(a),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.activity_revisions r where r.activity_id = a.id),
        'products', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_products l where l.activity_id = a.id),
        'tools', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_tools l where l.activity_id = a.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.activity_heat_events e where e.activity_id = a.id))), '[]'::jsonb)
      from public.activities a where a.owner = uid),
    'userProducts', (select coalesce(jsonb_agg(jsonb_build_object('product', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_product_revisions r where r.user_product_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.product_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.product_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.product_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_products u where u.owner = uid),
    'userTools', (select coalesce(jsonb_agg(jsonb_build_object('tool', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_tool_revisions r where r.user_tool_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.tool_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.tool_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.tool_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_tools u where u.owner = uid)
  ) into document;

  select coalesce((select count(*) from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = uid), 0)
    + coalesce((select count(*) from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = uid), 0)
    + coalesce((select count(*) from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = uid), 0)
    + coalesce((select count(*) from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = uid), 0)
    into n;
  counts := n;

  insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
    values (job_id, uid, p_format, 'completed', document, counts, now(), now() + interval '24 hours');
  result := jsonb_build_object('jobId', job_id, 'status', 'completed', 'recordCount', counts, 'expiresAt', now() + interval '24 hours');
  insert into strandcue_private.export_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

create or replace function public.export_request(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.request_export(p_operation_id, p_format);
end;
$$;

create or replace function public.export_status(p_job_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs%rowtype;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into job from public.export_jobs where id = p_job_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  return jsonb_build_object('jobId', job.id, 'status', job.status, 'format', job.format,
    'recordCount', job.record_count, 'createdAt', job.created_at, 'completedAt', job.completed_at,
    'expiresAt', job.expires_at, 'errorMessage', job.error_message);
end;
$$;

create or replace function public.export_download(p_job_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs%rowtype;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into job from public.export_jobs where id = p_job_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  if job.status <> 'completed' or job.document is null then raise exception 'export-not-ready' using errcode = '22023'; end if;
  if job.expires_at <= now() then raise exception 'download-link-expired' using errcode = '42501'; end if;
  return jsonb_build_object('jobId', job.id, 'format', job.format, 'expiresAt', job.expires_at, 'document', job.document);
end;
$$;

-- Retention is owned by migration_admin and has no consumer execute grant:
-- only the superuser scheduler may run it (superusers bypass RLS; the
-- definer carries the owner's table privileges). Public functions cannot
-- transfer to strandcue_mutator, which holds no CREATE on schema public.
-- Nulls documents older than 7 days; job receipts remain for audit.
create or replace function public.export_retention_cleanup()
returns integer language plpgsql security definer set search_path = '' as $$
declare purged integer;
begin
  update public.export_jobs set document = null
    where document is not null and coalesce(completed_at, created_at) < now() - interval '7 days';
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function strandcue_private.request_export(uuid, text) from public, anon, authenticated;
grant execute on function strandcue_private.request_export(uuid, text) to authenticated, strandcue_mutator;
revoke all on function public.export_request(uuid, text), public.export_status(uuid), public.export_download(uuid) from public, anon, authenticated;
grant execute on function public.export_request(uuid, text), public.export_status(uuid), public.export_download(uuid) to authenticated;
revoke all on function public.export_retention_cleanup() from public, anon, authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

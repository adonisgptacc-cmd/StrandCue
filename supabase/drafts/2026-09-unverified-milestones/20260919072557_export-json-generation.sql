-- StrandCue Milestone 5: Account Export
-- Task 5.2: JSON export generation logic

-- Function to generate complete JSON export for a user
create function public.generate_export_json(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs;
  export_json jsonb;
  passport_json jsonb;
  shelf_json jsonb;
  tools_json jsonb;
  activities_json jsonb;
  services_json jsonb;
  record_count integer := 0;
begin
  if uid is null then
    raise exception 'authentication-required' using errcode='42501';
  end if;

  -- Verify job ownership and status
  select * into job from public.export_jobs where id = p_job_id and user_id = uid;
  if not found then
    raise exception 'export-job-not-found' using errcode='22023';
  end if;

  if job.status != 'pending' and job.status != 'processing' then
    raise exception 'invalid-job-status' using errcode='22023';
  end if;

  -- Update job to processing
  update public.export_jobs set status = 'processing', started_at = (now() at time zone 'Africa/Johannesburg') where id = p_job_id;

  -- 1. Passport data
  select jsonb_build_object(
    'passport', to_jsonb(p),
    'revisions', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.sequence)
      from public.passport_revisions r
      where r.passport_id = p.id and r.user_id = uid
    ), '[]'::jsonb)
  ) into passport_json
  from public.hair_passports p
  where p.user_id = uid;

  if passport_json is not null then
    record_count := record_count + 1;
  end if;

  -- 2. Shelf data (user products with revisions)
  select jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product', to_jsonb(up),
        'revisions', coalesce((
          select jsonb_agg(to_jsonb(ur) order by ur.recorded_at)
          from public.user_product_revisions ur
          where ur.user_product_id = up.id
        ), '[]'::jsonb)
      ) order by up.created_at)
      from public.user_products up
      where up.owner = uid
    ), '[]'::jsonb)
  ) into shelf_json;

  if shelf_json is not null then
    select jsonb_array_length(shelf_json->'products') into record_count;
    record_count := record_count + coalesce(record_count, 0);
  end if;

  -- 3. Tools data (user tools)
  select jsonb_build_object(
    'tools', coalesce((
      select jsonb_agg(to_jsonb(ut) order by ut.created_at)
      from public.user_tools ut
      where ut.owner = uid
    ), '[]'::jsonb)
  ) into tools_json;

  if tools_json is not null then
    select jsonb_array_length(tools_json->'tools') into record_count;
    record_count := record_count + coalesce(record_count, 0);
  end if;

  -- 4. Activities data
  select jsonb_build_object(
    'activities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'activity', to_jsonb(a),
        'revisions', coalesce((
          select jsonb_agg(to_jsonb(ar) order by ar.recorded_at)
          from public.activity_revisions ar
          where ar.activity_id = a.id
        ), '[]'::jsonb),
        'heat_events', coalesce((
          select jsonb_agg(to_jsonb(he) order by he.created_at)
          from public.heat_events he
          where he.activity_id = a.id
        ), '[]'::jsonb),
        'product_links', coalesce((
          select jsonb_agg(to_jsonb(ap) order by ap.applied_at)
          from public.activity_products ap
          where ap.activity_id = a.id
        ), '[]'::jsonb),
        'tool_links', coalesce((
          select jsonb_agg(to_jsonb(at) order by at.applied_at)
          from public.activity_tools at
          where at.activity_id = a.id
        ), '[]'::jsonb)
      ) order by a.occurred_at desc)
      from public.activities a
      where a.owner = uid
    ), '[]'::jsonb)
  ) into activities_json;

  if activities_json is not null then
    select jsonb_array_length(activities_json->'activities') into record_count;
    record_count := record_count + coalesce(record_count, 0);
  end if;

  -- 5. Chemical services data
  select jsonb_build_object(
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'service', to_jsonb(cs),
        'revisions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'revision', to_jsonb(sr),
            'zones', coalesce((
              select jsonb_agg(to_jsonb(sz) order by sz.region, sz.segment)
              from public.service_zones sz
              where sz.service_revision_id = sr.id and sz.user_id = sr.user_id and sz.service_id = sr.service_id
            ), '[]'::jsonb),
            'heat_event', (
              select to_jsonb(he) from public.heat_events he
              where he.service_revision_id = sr.id and he.user_id = sr.user_id and he.service_id = sr.service_id
            )
          ) order by sr.sequence)
          from public.service_revisions sr
          where sr.service_id = cs.id and sr.user_id = cs.user_id
        ), '[]'::jsonb),
        'observations', coalesce((
          select jsonb_agg(to_jsonb(so) order by so.recorded_at)
          from public.service_observations so
          where so.service_id = cs.id and so.user_id = cs.user_id
        ), '[]'::jsonb)
      ) order by cs.created_at)
      from public.chemical_services cs
      where cs.user_id = uid
    ), '[]'::jsonb)
  ) into services_json;

  if services_json is not null then
    select jsonb_array_length(services_json->'services') into record_count;
    record_count := record_count + coalesce(record_count, 0);
  end if;

  -- Build complete export
  export_json := jsonb_build_object(
    'export_id', p_job_id,
    'user_id', uid,
    'exported_at', to_char((now() at time zone 'Africa/Johannesburg'), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'format', 'json',
    'data', jsonb_build_object(
      'passport', passport_json,
      'shelf', shelf_json,
      'tools', tools_json,
      'activities', activities_json,
      'services', services_json
    ),
    'metadata', jsonb_build_object(
      'record_counts', jsonb_build_object(
        'passport', case when passport_json is not null then 1 else 0 end,
        'shelf_products', (select coalesce(jsonb_array_length(shelf_json->'products'), 0)),
        'tools', (select coalesce(jsonb_array_length(tools_json->'tools'), 0)),
        'activities', (select coalesce(jsonb_array_length(activities_json->'activities'), 0)),
        'services', (select coalesce(jsonb_array_length(services_json->'services'), 0))
      ),
      'generated_by', 'strandcue',
      'export_version', 1
    )
  );

  -- Update job with completion
  update public.export_jobs
  set status = 'completed',
      completed_at = (now() at time zone 'Africa/Johannesburg'),
      record_count = record_count
  where id = p_job_id;

  return export_json;
exception when others then
  update public.export_jobs
  set status = 'failed',
      error_message = SQLERRM,
      completed_at = (now() at time zone 'Africa/Johannesburg')
  where id = p_job_id;
  raise;
end $$;

grant execute on function public.generate_export_json(uuid) to authenticated;
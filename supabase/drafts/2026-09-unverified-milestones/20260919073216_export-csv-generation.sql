-- StrandCue Milestone 5: Account Export
-- Task 5.3: CSV export generation logic

-- Helper: escape CSV value
create function public.csv_escape(p_val text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null then return ''; end if;
  if p_val ~ '["\n\r,]' then
    return '"' || replace(p_val, '"', '""') || '"';
  end if;
  return p_val;
end $$;

-- Helper: build CSV from jsonb array of objects
create function public.jsonb_array_to_csv(p_arr jsonb, p_columns text[])
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  row jsonb;
  col text;
  header text := '';
  body text := '';
  first_row boolean := true;
begin
  if p_arr is null or p_arr = '[]'::jsonb then return ''; end if;

  -- Build header
  for col in select * from unnest(p_columns) loop
    header := header || public.csv_escape(col) || ',';
  end loop;
  header := rtrim(header, ',') || E'\n';

  -- Build rows
  for row in select * from jsonb_array_elements(p_arr) loop
    for col in select * from unnest(p_columns) loop
      body := body || public.csv_escape(coalesce(row->>col, '')) || ',';
    end loop;
    body := rtrim(body, ',') || E'\n';
  end loop;

  return header || body;
end $$;

-- Function to generate CSV export for a user (multiple files in a zip-like structure)
-- Returns JSON with base64-encoded CSV files
create function public.generate_export_csv(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := strandcue_private.request_uid();
  job public.export_jobs;
  shelf_csv text;
  tools_csv text;
  activities_csv text;
  services_csv text;
  passport_csv text;
  record_count integer := 0;
  result_json jsonb;
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

  update public.export_jobs set status = 'processing', started_at = (now() at time zone 'Africa/Johannesburg') where id = p_job_id;

  -- Shelf CSV
  shelf_csv := public.jsonb_array_to_csv((
    select jsonb_agg(to_jsonb(up) order by up.created_at)
    from public.user_products up
    where up.owner = uid
  ), array['id', 'product_version', 'manual_brand', 'manual_name', 'manual_category', 'availability', 'matched', 'matched_at', 'match_confirmed', 'created_at', 'updated_at']);
  select jsonb_array_length((select jsonb_agg(to_jsonb(up)) from public.user_products up where up.owner = uid)) into record_count;

  -- Tools CSV
  tools_csv := public.jsonb_array_to_csv((
    select jsonb_agg(to_jsonb(ut) order by ut.created_at)
    from public.user_tools ut
    where ut.owner = uid
  ), array['id', 'tool_version', 'availability', 'created_at', 'updated_at']);

  -- Activities CSV
  activities_csv := public.jsonb_array_to_csv((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'kind', a.kind,
      'occurred_at', a.occurred_at,
      'precision', a.precision,
      'zones', a.zones,
      'notes', a.notes,
      'status', a.status,
      'created_at', a.created_at,
      'updated_at', a.updated_at
    ) order by a.occurred_at desc)
    from public.activities a
    where a.owner = uid
  ), array['id', 'kind', 'occurred_at', 'precision', 'zones', 'notes', 'status', 'created_at', 'updated_at']);

  -- Services CSV
  services_csv := public.jsonb_array_to_csv((
    select jsonb_agg(jsonb_build_object(
      'id', cs.id,
      'service_type', sr.facts->>'serviceType',
      'occurred_on', sr.facts->>'occurredOn',
      'product_or_system', sr.facts->>'productOrSystem',
      'notes', sr.facts->>'notes',
      'revision', sr.sequence,
      'kind', sr.kind,
      'recorded_at', sr.recorded_at
    ) order by cs.created_at)
    from public.chemical_services cs
    join public.service_revisions sr on sr.service_id = cs.id and sr.user_id = cs.user_id and sr.sequence = cs.revision
    where cs.user_id = uid
  ), array['id', 'service_type', 'occurred_on', 'product_or_system', 'notes', 'revision', 'kind', 'recorded_at']);

  -- Passport CSV (single row)
  passport_csv := public.jsonb_array_to_csv((
    select jsonb_agg(to_jsonb(p))
    from public.hair_passports p
    where p.user_id = uid
  ), array['id', 'user_id', 'revision', 'current_projection', 'created_at']);

  -- Build result with base64 encoded CSVs
  result_json := jsonb_build_object(
    'export_id', p_job_id,
    'user_id', uid,
    'exported_at', to_char((now() at time zone 'Africa/Johannesburg'), 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'format', 'csv',
    'files', jsonb_build_object(
      'shelf.csv', encode(shelf_csv, 'base64'),
      'tools.csv', encode(tools_csv, 'base64'),
      'activities.csv', encode(activities_csv, 'base64'),
      'services.csv', encode(services_csv, 'base64'),
      'passport.csv', encode(passport_csv, 'base64')
    ),
    'metadata', jsonb_build_object(
      'record_counts', jsonb_build_object(
        'shelf', (select coalesce(jsonb_array_length((select jsonb_agg(to_jsonb(up)) from public.user_products up where up.owner = uid)), 0)),
        'tools', (select coalesce(jsonb_array_length((select jsonb_agg(to_jsonb(ut)) from public.user_tools ut where ut.owner = uid)), 0)),
        'activities', (select coalesce(jsonb_array_length((select jsonb_agg(jsonb_build_object('id', a.id)) from public.activities a where a.owner = uid)), 0)),
        'services', (select coalesce(jsonb_array_length((select jsonb_agg(jsonb_build_object('id', cs.id)) from public.chemical_services cs where cs.user_id = uid)), 0)),
        'passport', case when (select count(*) from public.hair_passports where user_id = uid) > 0 then 1 else 0 end
      ),
      'generated_by', 'strandcue',
      'export_version', 1
    )
  );

  update public.export_jobs
  set status = 'completed',
      completed_at = (now() at time zone 'Africa/Johannesburg'),
      record_count = (select jsonb_array_length((select jsonb_agg(to_jsonb(up)) from public.user_products up where up.owner = uid))) +
                       (select jsonb_array_length((select jsonb_agg(to_jsonb(ut)) from public.user_tools ut where ut.owner = uid))) +
                       (select jsonb_array_length((select jsonb_agg(jsonb_build_object('id', a.id)) from public.activities a where a.owner = uid))) +
                       (select jsonb_array_length((select jsonb_agg(jsonb_build_object('id', cs.id)) from public.chemical_services cs where cs.user_id = uid))) +
                       (select count(*) from public.hair_passports where user_id = uid)
  where id = p_job_id;

  return result_json;
exception when others then
  update public.export_jobs
  set status = 'failed',
      error_message = SQLERRM,
      completed_at = (now() at time zone 'Africa/Johannesburg')
  where id = p_job_id;
  raise;
end $$;

grant execute on function public.generate_export_csv(uuid) to authenticated;
-- Reviewed CSV renderer for exports — closes the P1-PRIV-02 gap.
--
-- CSV is one file per table (profile, passport/service/activity revisions,
-- user products/tools plus their revisions): full-row dumps with headers,
-- deterministic ordering, RFC 4180 quoting. Internal identifiers stay
-- because revisions link through them (PRD allows identifiers when needed
-- to preserve relationships). The JSON dataset is unchanged.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- RFC 4180 quoting: wrap fields containing a quote, comma or line break,
-- doubling embedded quotes. Null renders as an empty field.
create or replace function strandcue_private.csv_quote(p_text text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when p_text is null then ''
    when p_text like '%"%' or p_text like '%,%'
      or p_text like '%' || chr(10) || '%' or p_text like '%' || chr(13) || '%'
      then '"' || replace(p_text, '"', '""') || '"'
    else p_text
  end
$$;
alter function strandcue_private.csv_quote(text) owner to strandcue_mutator;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile_csv text;
  passport_csv text;
  services_csv text;
  activities_csv text;
  shelf_csv text;
  shelf_revisions_csv text;
  tools_csv text;
  tool_revisions_csv text;
begin
  select 'username,country,currency,temperature_unit,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(username) || ',' || strandcue_private.csv_quote(country) || ',' || strandcue_private.csv_quote(currency) || ',' || strandcue_private.csv_quote(temperature_unit) || ',' || strandcue_private.csv_quote(created_at::text), chr(10)), '')
    into profile_csv from public.profiles where user_id = p_uid;

  select 'id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind) || ',' || strandcue_private.csv_quote(r.effective_date::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.sequence), '')
    into passport_csv from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = p_uid;

  select 'id,service_id,sequence,base_revision,kind,facts,heat_state,effective_start,effective_end,recorded_at,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.service_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.facts::text) || ',' || strandcue_private.csv_quote(r.heat_state) || ',' || strandcue_private.csv_quote(r.effective_start::text) || ',' || strandcue_private.csv_quote(r.effective_end::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.recorded_at, r.service_id, r.sequence), '')
    into services_csv from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = p_uid;

  select 'id,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,void_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.activity_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.void_reason), chr(10) order by r.recorded_at, r.activity_id, r.sequence), '')
    into activities_csv from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = p_uid;

  select 'id,version_id,manual_brand,manual_name,manual_category,availability,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_name) || ',' || strandcue_private.csv_quote(u.manual_category)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into shelf_csv from public.user_products u where u.owner = p_uid;

  select 'id,user_product_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_product_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_product_id, r.sequence), '')
    into shelf_revisions_csv from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = p_uid;

  select 'id,version_id,manual_brand,manual_model,tool_type,availability,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_model) || ',' || strandcue_private.csv_quote(u.tool_type)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into tools_csv from public.user_tools u where u.owner = p_uid;

  select 'id,user_tool_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_tool_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_tool_id, r.sequence), '')
    into tool_revisions_csv from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = p_uid;

  return jsonb_build_object('files', jsonb_build_object(
    'profile.csv', profile_csv,
    'passport_revisions.csv', passport_csv,
    'service_revisions.csv', services_csv,
    'activity_revisions.csv', activities_csv,
    'user_products.csv', shelf_csv,
    'user_product_revisions.csv', shelf_revisions_csv,
    'user_tools.csv', tools_csv,
    'user_tool_revisions.csv', tool_revisions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

-- Same request core with the csv branch. record_count counts revision rows
-- for both formats so receipts stay comparable.
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
  if p_format is null or (p_format <> 'json' and p_format <> 'csv') then raise exception 'invalid-format' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'format', p_format);
  select * into prev from strandcue_private.export_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  if p_format = 'csv' then
    select strandcue_private.export_build_csv(uid) into document;
  else
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
  end if;

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

revoke all on function strandcue_private.csv_quote(text), strandcue_private.export_build_csv(uuid) from public, anon, authenticated;
grant execute on function strandcue_private.csv_quote(text), strandcue_private.export_build_csv(uuid) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid, text) to authenticated, strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

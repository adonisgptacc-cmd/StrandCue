-- I6.5: preserve the completed Today check-in time in the server-owned
-- assessment snapshot so an exact no-heat binding can be checked later.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
create or replace function strandcue_private.heat_intent_valid(p_intent jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_key text;
  v_fact jsonb;
  v_value jsonb;
  v_item jsonb;
begin
  if jsonb_typeof(p_intent) <> 'object' or p_intent - array[
    'method','toolOwnerItemId','productOwnerItemId','temperature','setting','passes','durationMinutes','zones','currentCondition','availableMinutes'
  ] <> '{}'::jsonb then return false; end if;
  if not (p_intent ?& array['method','temperature','setting','passes','durationMinutes','zones']) then return false; end if;
  foreach v_key in array array['method','temperature','setting','passes','durationMinutes'] loop
    v_fact := p_intent -> v_key;
    if jsonb_typeof(v_fact) <> 'object' or not (v_fact ? 'state') or jsonb_typeof(v_fact -> 'state') <> 'string'
       or (v_fact ->> 'state') not in ('known','unknown') then return false; end if;
    if (v_fact ->> 'state') = 'unknown' and v_fact - 'state' <> '{}'::jsonb then return false; end if;
    if (v_fact ->> 'state') in ('known','recorded') and (not (v_fact ? 'value') or v_fact - array['state','value'] <> '{}'::jsonb) then return false; end if;
  end loop;
  v_key := 'method-value';
  if p_intent#>>'{method,state}'='known' then
    if p_intent#>>'{method,value}' not in ('direct-contact','heated-air','hooded','steam','unheated') then return false; end if;
  end if;
  if p_intent#>>'{temperature,state}'='known' then
    v_value:=p_intent#>'{temperature,value}';
    if jsonb_typeof(v_value)<>'object' or not (v_value ?& array['value','unit']) or v_value-array['value','unit']<>'{}'::jsonb
      or jsonb_typeof(v_value->'value')<>'number' or v_value->>'unit' not in ('C','F') then return false; end if;
  end if;
  v_key := 'setting-value';
  if p_intent#>>'{setting,state}'='known' then
    if jsonb_typeof(p_intent#>'{setting,value}')<>'string' or char_length(p_intent#>>'{setting,value}') not between 1 and 60 then return false; end if;
  end if;
  v_key := 'passes-value';
  if p_intent#>>'{passes,state}'='known' then
    if jsonb_typeof(p_intent#>'{passes,value}')<>'number' then return false; end if;
    if (p_intent#>>'{passes,value}')::numeric <> trunc((p_intent#>>'{passes,value}')::numeric)
      or (p_intent#>>'{passes,value}')::numeric not between 0 and 100 then return false; end if;
  end if;
  v_key := 'duration-value';
  if p_intent#>>'{durationMinutes,state}'='known' then
    if jsonb_typeof(p_intent#>'{durationMinutes,value}')<>'number' then return false; end if;
    if (p_intent#>>'{durationMinutes,value}')::numeric <> trunc((p_intent#>>'{durationMinutes,value}')::numeric)
      or (p_intent#>>'{durationMinutes,value}')::numeric not between 0 and 1440 then return false; end if;
  end if;
  v_key := 'ids';
  if p_intent ? 'toolOwnerItemId' and p_intent -> 'toolOwnerItemId' <> 'null'::jsonb
     and (jsonb_typeof(p_intent -> 'toolOwnerItemId') <> 'string' or (p_intent ->> 'toolOwnerItemId') !~* '^[0-9a-f-]{36}$') then return false; end if;
  if p_intent ? 'productOwnerItemId' and p_intent -> 'productOwnerItemId' <> 'null'::jsonb
     and (jsonb_typeof(p_intent -> 'productOwnerItemId') <> 'string' or (p_intent ->> 'productOwnerItemId') !~* '^[0-9a-f-]{36}$') then return false; end if;
  if jsonb_typeof(p_intent -> 'zones') <> 'array' or jsonb_array_length(p_intent -> 'zones') > 36 then return false; end if;
  v_key := 'zones';
  for v_item in select value from jsonb_array_elements(p_intent->'zones') loop
    if not strandcue_private.heat_zone_valid(v_item) then return false; end if;
  end loop;
  if p_intent ? 'availableMinutes' and p_intent->'availableMinutes' <> 'null'::jsonb then
    if jsonb_typeof(p_intent->'availableMinutes') <> 'number'
       or (p_intent->>'availableMinutes')::numeric <> trunc((p_intent->>'availableMinutes')::numeric)
       or (p_intent->>'availableMinutes')::numeric not between 0 and 1440 then return false; end if;
  end if;
  if p_intent ? 'currentCondition' then
    if p_intent -> 'currentCondition' <> 'null'::jsonb then
      if jsonb_typeof(p_intent -> 'currentCondition') <> 'object'
         or not ((p_intent->'currentCondition') ?& array['observedAt','concerns','explicitNone','zones','zoneConcerns'])
         or (p_intent->'currentCondition')-array['observedAt','concerns','explicitNone','zones','zoneConcerns']<>'{}'::jsonb
         or jsonb_typeof(p_intent#>'{currentCondition,observedAt}')<>'string'
         or jsonb_typeof(p_intent#>'{currentCondition,concerns}')<>'array'
         or jsonb_array_length(p_intent#>'{currentCondition,concerns}')=0
         or jsonb_typeof(p_intent#>'{currentCondition,explicitNone}')<>'boolean'
         or jsonb_typeof(p_intent#>'{currentCondition,zones}')<>'array'
         or jsonb_typeof(p_intent#>'{currentCondition,zoneConcerns}')<>'array' then return false; end if;
      if p_intent#>>'{currentCondition,observedAt}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
         or jsonb_array_length(p_intent#>'{currentCondition,concerns}') > 15
         or jsonb_array_length(p_intent#>'{currentCondition,zones}') > 36
         or jsonb_array_length(p_intent#>'{currentCondition,zoneConcerns}') > 36 then return false; end if;
      perform (p_intent#>>'{currentCondition,observedAt}')::timestamptz;
      if exists(select 1 from jsonb_array_elements(p_intent#>'{currentCondition,concerns}') concern
          where jsonb_typeof(concern)<>'string' or concern#>>'{}' not in (
            'dryness','frizz','tangling','breakage','stiffness','dullness','buildup','scalp-dryness',
            'scalp-oiliness','scalp-discomfort','reported-damage','chemical-processing-concern','heat-concern','none','unknown'))
         or (select count(*) from jsonb_array_elements(p_intent#>'{currentCondition,concerns}')) <>
            (select count(distinct concern#>>'{}') from jsonb_array_elements(p_intent#>'{currentCondition,concerns}') concern)
         or (exists(select 1 from jsonb_array_elements_text(p_intent#>'{currentCondition,concerns}') concern where concern in ('none','unknown'))
             and jsonb_array_length(p_intent#>'{currentCondition,concerns}') <> 1)
         or (p_intent#>>'{currentCondition,explicitNone}')::boolean is distinct from
            (p_intent#>'{currentCondition,concerns}' = '["none"]'::jsonb) then return false; end if;
      if exists(select 1 from jsonb_array_elements(p_intent#>'{currentCondition,zones}') zone
          where not strandcue_private.heat_condition_zone_valid(zone))
         or (select count(*) from jsonb_array_elements(p_intent#>'{currentCondition,zones}')) <>
            (select count(distinct zone::text) from jsonb_array_elements(p_intent#>'{currentCondition,zones}') zone) then return false; end if;
      if exists(select 1 from jsonb_array_elements(p_intent#>'{currentCondition,zoneConcerns}') entry
          where jsonb_typeof(entry)<>'object' or not (entry ?& array['zone','concerns'])
            or entry-array['zone','concerns']<>'{}'::jsonb or not strandcue_private.heat_condition_zone_valid(entry->'zone')
            or jsonb_typeof(entry->'concerns')<>'array' or jsonb_array_length(entry->'concerns')=0
            or exists(select 1 from jsonb_array_elements(entry->'concerns') concern
              where jsonb_typeof(concern)<>'string' or concern#>>'{}' in ('none','unknown')
                or not (p_intent#>'{currentCondition,concerns}' ? (concern#>>'{}')))
            or (select count(*) from jsonb_array_elements(entry->'concerns')) <>
               (select count(distinct concern#>>'{}') from jsonb_array_elements(entry->'concerns') concern)
            or not (p_intent#>'{currentCondition,zones}' @> jsonb_build_array(entry->'zone')))
         or (select count(*) from jsonb_array_elements(p_intent#>'{currentCondition,zoneConcerns}')) <>
            (select count(distinct (entry->'zone')::text) from jsonb_array_elements(p_intent#>'{currentCondition,zoneConcerns}') entry) then return false; end if;
    end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function strandcue_private.heat_construct_input(p_uid uuid, p_intent jsonb, p_at timestamptz)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'asOf', strandcue_private.heat_iso(p_at),
    'preparedInput', jsonb_build_object(
      'schemaVersion', 1,
      'goal', jsonb_build_object('id','basic_wash','label','Basic wash'),
      'availableMinutes', coalesce(p_intent->'availableMinutes','null'::jsonb),
      'passport', jsonb_build_object('facts', coalesce((select h.current_projection from public.hair_passports h where h.user_id=p_uid), '{}'::jsonb)),
      'currentCondition', case when p_intent ? 'currentCondition' then p_intent->'currentCondition' else 'null'::jsonb end,
      'effectiveFacts', '[]'::jsonb,
      'chemicalServices', coalesce((select jsonb_agg(jsonb_build_object(
          'serviceId', s.id, 'presence', 'present', 'effectiveStart', r.effective_start,
          'zones', coalesce((select jsonb_agg(jsonb_build_object('region',z.region,'segment',z.segment) order by z.region,z.segment)
            from public.service_zones z where z.service_revision_id=r.id), '[]'::jsonb)) order by s.id)
        from public.chemical_services s join lateral (
          select sr.* from public.service_revisions sr where sr.service_id=s.id and sr.user_id=p_uid order by sr.sequence desc limit 1
        ) r on true where s.user_id=p_uid), '[]'::jsonb),
      'heatHistory', '[]'::jsonb,
      'activities', '[]'::jsonb,
      'products', coalesce((select jsonb_agg(jsonb_build_object(
          'ownerItemId',u.id,'name',coalesce(nullif(btrim(u.manual_name),''),'Recorded product '||u.id::text),
          'identity',case when u.version_id is null then 'manual' else 'exact' end,'versionId',u.version_id,
          'review','not_reviewed','verifiedCapabilities','[]'::jsonb,'satisfiesExactCapability',false) order by u.id)
        from public.user_products u where u.owner=p_uid and u.availability='available'), '[]'::jsonb),
      'tools', coalesce((select jsonb_agg(jsonb_build_object(
          'ownerItemId',u.id,'name',coalesce(nullif(btrim(u.manual_model),''),'Recorded tool '||u.id::text),
          'identity',case when u.version_id is null then 'manual' else 'exact' end,'versionId',u.version_id,
          'review','not_reviewed','verifiedCapabilities','[]'::jsonb,'satisfiesExactCapability',false,
          'ownerFacts',jsonb_build_object(
            'wattageWatts',u.wattage_watts,
            'adjustableTemp',coalesce(u.adjustable_temp,'not_answered'),
            'settings',coalesce(u.settings,jsonb_build_object('state','not_answered','recordedTemperatures','[]'::jsonb)),
            'heatMethods',coalesce(u.heat_methods,jsonb_build_object('state','not_answered','methods','[]'::jsonb)))) order by u.id)
        from public.user_tools u where u.owner=p_uid and u.availability='available'), '[]'::jsonb),
      'completeness', jsonb_build_object('activities','complete','passport',case when exists(select 1 from public.hair_passports h where h.user_id=p_uid) then 'complete' else 'missing' end,
        'products','complete','services','complete','tools','complete')),
    'confirmedCareEvents', '[]'::jsonb,
    'request', jsonb_build_object(
      'method', case when p_intent->>'method' is null then p_intent->'method' else p_intent->'method' end,
      'toolOwnerItemId', p_intent->'toolOwnerItemId', 'productOwnerItemId', p_intent->'productOwnerItemId',
      'temperature', p_intent->'temperature', 'setting', p_intent->'setting', 'passes', p_intent->'passes',
      'durationMinutes', p_intent->'durationMinutes', 'zones', p_intent->'zones'))
$$;
alter function strandcue_private.heat_intent_valid(jsonb) owner to strandcue_mutator;
alter function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz) owner to strandcue_mutator;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;
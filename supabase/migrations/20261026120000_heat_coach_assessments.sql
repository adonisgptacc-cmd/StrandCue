-- Increment 6 Task I6.3: trusted, owner-only Heat Coach assessments.
--
-- The client supplies only a request-time heat intent, an operation id, and an exact reviewed
-- publication identity. The server reads the owner's current Passport, service, Shelf, Tools and
-- activity rows, constructs the input and decision, binds them to a source fingerprint, and stores
-- one immutable audit record. The publication registry starts EMPTY. This migration publishes no
-- rule and invents no capability, evidence or reviewer.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.heat_iso(p_at timestamptz)
returns text language sql stable set search_path = pg_catalog, pg_temp as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function strandcue_private.heat_zone_valid(p_zone jsonb)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_typeof(p_zone)='object'
    and p_zone ?& array['region','segment']
    and p_zone - array['region','segment']='{}'::jsonb
    and p_zone->>'region' in ('whole_head','front','crown','nape','other','unknown')
    and p_zone->>'segment' in ('entire_strand','roots','mid_lengths','ends','other','unknown')
$$;

-- Prepared current-condition zones intentionally use the service vocabulary,
-- while the Heat Coach request uses the activity vocabulary above.
create or replace function strandcue_private.heat_condition_zone_valid(p_zone jsonb)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_typeof(p_zone)='object'
    and p_zone ?& array['region','segment']
    and p_zone - array['region','segment']='{}'::jsonb
    and p_zone->>'region' in ('whole-head','front','crown','nape','other','unknown')
    and p_zone->>'segment' in ('entire-strand','roots','mid-lengths','ends','other','unknown')
$$;

create or replace function strandcue_private.heat_intent_valid(p_intent jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_key text;
  v_fact jsonb;
  v_value jsonb;
  v_item jsonb;
begin
  if jsonb_typeof(p_intent) <> 'object' or p_intent - array[
    'method','toolOwnerItemId','productOwnerItemId','temperature','setting','passes','durationMinutes','zones','currentCondition'
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

create table if not exists strandcue_private.heat_rule_publications (
  id uuid primary key,
  content_digest text not null check (content_digest ~ '^sha256:[a-f0-9]{64}$'),
  rule jsonb not null check (jsonb_typeof(rule) = 'object'),
  state text not null check (state in ('draft','published','withdrawn')),
  authored_by text not null check (char_length(btrim(authored_by)) between 1 and 200),
  reviewed_by text,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint heat_rule_digest_binds_content check (
    content_digest='sha256:'||encode(sha256(convert_to((rule-'digest')::text,'UTF8')),'hex')
    and rule->>'digest'=substring(content_digest from 8)),
  constraint heat_rule_reviewed check (
    state = 'draft' or (reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))))
);

create or replace function strandcue_private.heat_rule_guard()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op='DELETE' then
    if old.state='draft' then return old; end if;
    raise exception 'heat-rule-immutable' using errcode='P0001';
  end if;
  if old.state='draft' then return new; end if;
  if old.state='published' and new.state='withdrawn' and new.id=old.id and new.content_digest=old.content_digest
    and new.rule is not distinct from old.rule and new.authored_by=old.authored_by and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at and new.published_at is not distinct from old.published_at then return new; end if;
  raise exception 'heat-rule-immutable' using errcode='P0001';
end;
$$;
drop trigger if exists heat_rule_guard on strandcue_private.heat_rule_publications;
create trigger heat_rule_guard before update or delete on strandcue_private.heat_rule_publications
  for each row execute function strandcue_private.heat_rule_guard();

create table if not exists public.heat_coach_assessments (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  publication_id uuid not null,
  publication_digest text not null check (publication_digest ~ '^sha256:[a-f0-9]{64}$'),
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  status text not null check (status in ('content_pending','needs_input','restricted','lower_heat','no_heat','appropriate','unavailable')),
  source_revisions jsonb not null check (jsonb_typeof(source_revisions) = 'object'),
  source_fingerprint text not null check (source_fingerprint ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  revision integer not null default 1 check (revision = 1),
  unique (id, owner)
);
create index if not exists heat_assessments_owner_page on public.heat_coach_assessments(owner, created_at desc, id desc);

create table if not exists strandcue_private.heat_coach_operations (
  owner uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (owner, operation_id)
);

alter table strandcue_private.heat_rule_publications enable row level security;
alter table strandcue_private.heat_rule_publications force row level security;
alter table public.heat_coach_assessments enable row level security;
alter table public.heat_coach_assessments force row level security;
alter table strandcue_private.heat_coach_operations enable row level security;
alter table strandcue_private.heat_coach_operations force row level security;

revoke all on strandcue_private.heat_rule_publications from public, anon, authenticated;
revoke all on strandcue_private.heat_coach_operations from public, anon, authenticated;
revoke all on public.heat_coach_assessments from public, anon, authenticated;
grant select on public.heat_coach_assessments to authenticated;
grant select, insert on public.heat_coach_assessments to strandcue_mutator;
grant select, insert on strandcue_private.heat_coach_operations to strandcue_mutator;
grant select on strandcue_private.heat_rule_publications to strandcue_mutator;

drop policy if exists heat_assessment_owner_read on public.heat_coach_assessments;
create policy heat_assessment_owner_read on public.heat_coach_assessments for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = heat_coach_assessments.owner and p.account_status = 'active'));
drop policy if exists heat_assessment_append on public.heat_coach_assessments;
create policy heat_assessment_append on public.heat_coach_assessments for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = heat_coach_assessments.owner and p.account_status = 'active'));
drop policy if exists heat_operation_owner on strandcue_private.heat_coach_operations;
create policy heat_operation_owner on strandcue_private.heat_coach_operations for all to strandcue_mutator
  using (owner = (select strandcue_private.request_uid())) with check (owner = (select strandcue_private.request_uid()));
drop policy if exists heat_rule_mutator_read on strandcue_private.heat_rule_publications;
create policy heat_rule_mutator_read on strandcue_private.heat_rule_publications for select to strandcue_mutator using (true);

create or replace function strandcue_private.heat_immutable()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  raise exception 'heat-assessment-immutable' using errcode = 'P0001';
end;
$$;
drop trigger if exists heat_assessment_immutable on public.heat_coach_assessments;
create trigger heat_assessment_immutable before update or delete on public.heat_coach_assessments
  for each statement execute function strandcue_private.heat_immutable();

create or replace function strandcue_private.heat_require_owner()
returns uuid language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_uid uuid := strandcue_private.request_uid();
begin
  if v_uid is null or not exists(select 1 from public.profiles p where p.user_id = v_uid and p.account_status = 'active') then
    raise exception 'account-not-active' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

create or replace function strandcue_private.heat_source_revisions(p_uid uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'passport', coalesce((select jsonb_build_object('revision', h.revision, 'passportId', h.id)
      from public.hair_passports h where h.user_id = p_uid), 'null'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'revision', s.revision) order by s.id)
      from public.chemical_services s where s.user_id = p_uid), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'revision', u.revision, 'versionId', u.version_id) order by u.id)
      from public.user_products u where u.owner = p_uid), '[]'::jsonb),
    'tools', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'revision', u.revision, 'versionId', u.version_id) order by u.id)
      from public.user_tools u where u.owner = p_uid), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'revision', a.revision) order by a.id)
      from public.activities a where a.owner = p_uid), '[]'::jsonb)
  )
$$;

create or replace function strandcue_private.heat_construct_input(p_uid uuid, p_intent jsonb, p_at timestamptz)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'asOf', strandcue_private.heat_iso(p_at),
    'preparedInput', jsonb_build_object(
      'schemaVersion', 1,
      'goal', jsonb_build_object('id','basic_wash','label','Basic wash'),
      'availableMinutes', null,
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

create or replace function strandcue_private.heat_evaluate(p_input jsonb, p_rule jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_request jsonb := p_input -> 'request';
  v_missing jsonb := '[]'::jsonb;
  v_method text;
  v_temperature numeric;
  v_max numeric;
  v_state text;
  v_selected jsonb;
  v_tool jsonb;
  v_product jsonb;
  v_reason_code text := coalesce(p_rule->>'reasonCode','content_pending');
  v_copy_key text := coalesce(p_rule->>'copyKey','heat.content_pending');
begin
  v_method := case when v_request #>> '{method,state}' in ('known','recorded') then v_request #>> '{method,value}' end;
  if v_request #>> '{method,state}' = 'unknown' then v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','heat_method','destination','my_tools','reasonCode','heat_method_missing','copyKey','heat.missing.heat_method')); end if;
  if coalesce(v_request->'toolOwnerItemId','null'::jsonb) = 'null'::jsonb then v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','tool','destination','my_tools','reasonCode','tool_missing','copyKey','heat.missing.tool')); end if;
  if p_rule -> 'requiredProductCapability' <> 'null'::jsonb and coalesce(v_request->'productOwnerItemId','null'::jsonb) = 'null'::jsonb then v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','product','destination','my_shelf','reasonCode','product_missing','copyKey','heat.missing.product')); end if;
  if jsonb_array_length(coalesce(v_request->'zones','[]'::jsonb)) = 0 then v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','zones','destination','today','reasonCode','zones_missing','copyKey','heat.missing.zones')); end if;
  if v_method is distinct from 'unheated' and v_request #>> '{temperature,state}' = 'unknown' then v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','temperature','destination','my_tools','reasonCode','temperature_missing','copyKey','heat.missing.temperature')); end if;
  -- An explicit unheated choice is complete by itself. It must not be blocked
  -- by product/tool facts that are relevant only to a heated route.
  if v_method = 'unheated' then v_missing := '[]'::jsonb; v_state := 'no_heat';
  elsif jsonb_array_length(v_missing) > 0 then v_state := 'needs_input';
  else
    select item into v_tool from jsonb_array_elements(coalesce(p_input#>'{preparedInput,tools}','[]'::jsonb)) item
      where item->>'ownerItemId'=v_request->>'toolOwnerItemId' limit 1;
    if v_tool is null or v_tool->>'identity'<>'exact' or v_tool->>'review'<>'reviewed'
       or coalesce((v_tool->>'satisfiesExactCapability')::boolean,false)=false
       or v_tool#>>'{ownerFacts,heatMethods,state}'<>'recorded'
       or not coalesce(v_tool#>'{ownerFacts,heatMethods,methods}','[]'::jsonb) ? v_method
       or not coalesce(p_rule->'allowedMethods','[]'::jsonb) ? v_method then
      v_state := 'unavailable'; v_reason_code := 'tool_unavailable'; v_copy_key := 'heat.unavailable.tool';
    else
      if p_rule -> 'requiredProductCapability' <> 'null'::jsonb then
        select item into v_product from jsonb_array_elements(coalesce(p_input#>'{preparedInput,products}','[]'::jsonb)) item
          where item->>'ownerItemId'=v_request->>'productOwnerItemId' limit 1;
        if v_product is null or v_product->>'identity'<>'exact' or v_product->>'review'<>'reviewed'
           or coalesce((v_product->>'satisfiesExactCapability')::boolean,false)=false
           or not coalesce(v_product->'verifiedCapabilities','[]'::jsonb) ? (p_rule->>'requiredProductCapability') then
          v_state := 'unavailable'; v_reason_code := 'product_unavailable'; v_copy_key := 'heat.unavailable.product';
        end if;
      end if;
      if v_state is null then
        v_temperature := case when v_request #>> '{temperature,state}' = 'known' then (v_request #>> '{temperature,value,value}')::numeric end;
        select (x->>'maximum')::numeric into v_max from jsonb_array_elements(coalesce(p_rule#>'{limits,temperatures}','[]'::jsonb)) x where x->>'unit'=v_request#>>'{temperature,value,unit}' limit 1;
        if v_temperature is not null and v_max is null then
          v_state := 'unavailable'; v_reason_code := 'unit_unreviewed'; v_copy_key := 'heat.unavailable.unit';
        elsif v_request#>>'{passes,state}'='known' and p_rule#>>'{limits,maximumPasses}' is not null
          and (v_request#>>'{passes,value}')::integer > (p_rule#>>'{limits,maximumPasses}')::integer then
          v_state := 'restricted'; v_reason_code := 'passes_exceed_limit'; v_copy_key := 'heat.restricted.passes';
        elsif v_request#>>'{durationMinutes,state}'='known' and p_rule#>>'{limits,maximumDurationMinutes}' is not null
          and (v_request#>>'{durationMinutes,value}')::integer > (p_rule#>>'{limits,maximumDurationMinutes}')::integer then
          v_state := 'restricted'; v_reason_code := 'duration_exceeds_limit'; v_copy_key := 'heat.restricted.duration';
        else
          v_state := case when v_temperature is not null and v_temperature > v_max then 'lower_heat' else 'appropriate' end;
        end if;
      end if;
    end if;
  end if;
  v_selected := jsonb_build_object('method',v_method,'temperature',case when v_request#>>'{temperature,state}' in ('known','recorded') then v_request#>'{temperature,value}' else 'null'::jsonb end,
    'setting',case when v_request#>>'{setting,state}' in ('known','recorded') then to_jsonb(v_request#>>'{setting,value}') else 'null'::jsonb end,
    'passes',case when v_request#>>'{passes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{passes,value}')::integer) else 'null'::jsonb end,
    'durationMinutes',case when v_request#>>'{durationMinutes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{durationMinutes,value}')::integer) else 'null'::jsonb end,
    'zones',coalesce(v_request->'zones','[]'::jsonb));
  return jsonb_build_object('schemaVersion',1,'state',v_state,'necessity','unknown','selected',v_selected,'missing',v_missing,
    'reasons',jsonb_build_array(jsonb_build_object('reasonCode',v_reason_code,'copyKey',v_copy_key)),
    'alternatives','[]'::jsonb,'recentConfirmedHeatCount',0);
exception when others then
  return jsonb_build_object('schemaVersion',1,'state','unavailable','necessity','unknown','selected',jsonb_build_object('method',null,'temperature',null,'setting',null,'passes',null,'durationMinutes',null,'zones','[]'::jsonb),
    'missing','[]'::jsonb,'reasons',jsonb_build_array(jsonb_build_object('reasonCode','assessment_unavailable','copyKey','heat.assessment.unavailable')),'alternatives','[]'::jsonb,'recentConfirmedHeatCount',0);
end;
$$;

create or replace function strandcue_private.create_heat_coach_assessment_core(p_operation_id uuid, p_publication_id uuid, p_publication_digest text, p_intent jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_uid uuid := strandcue_private.heat_require_owner();
  v_payload jsonb;
  v_existing jsonb;
  v_publication strandcue_private.heat_rule_publications%rowtype;
  v_sources jsonb;
  v_fingerprint text;
  v_input jsonb;
  v_result jsonb;
  v_record public.heat_coach_assessments%rowtype;
  v_response jsonb;
begin
  if p_operation_id is null or p_publication_id is null or p_publication_digest !~ '^sha256:[a-f0-9]{64}$' or not strandcue_private.heat_intent_valid(p_intent) then
    raise exception 'invalid-heat-intent' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('publicationId',p_publication_id,'publicationDigest',p_publication_digest,'intent',p_intent);
  select o.result into v_existing from strandcue_private.heat_coach_operations o where o.owner=v_uid and o.operation_id=p_operation_id;
  if found then
    if (select o.payload from strandcue_private.heat_coach_operations o where o.owner=v_uid and o.operation_id=p_operation_id) is distinct from v_payload then
      raise exception 'operation-conflict' using errcode='P0001';
    end if;
    return v_existing;
  end if;
  select * into v_publication from strandcue_private.heat_rule_publications p where p.id=p_publication_id;
  if not found or v_publication.state <> 'published' then raise exception 'heat-content-pending' using errcode='P0001'; end if;
  if v_publication.content_digest <> p_publication_digest then raise exception 'publication-mismatch' using errcode='P0001'; end if;
  v_sources := strandcue_private.heat_source_revisions(v_uid);
  v_fingerprint := 'sha256:' || encode(sha256(convert_to(v_sources::text || '|' || v_publication.content_digest,'UTF8')),'hex');
  v_input := strandcue_private.heat_construct_input(v_uid,p_intent,clock_timestamp());
  -- Serialize same-owner/same-publication assessment creation. Different operation ids carrying the
  -- same intent and unchanged sources converge on the existing immutable assessment.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_publication_id::text, 0));
  select * into v_record from public.heat_coach_assessments a where a.owner=v_uid
    and a.publication_id=p_publication_id and a.publication_digest=p_publication_digest
    and a.source_revisions=v_sources and a.input->'request'=v_input->'request'
    order by a.created_at desc,a.id desc limit 1;
  if found then
    v_response := strandcue_private.heat_assessment_json(v_record,v_uid);
    insert into strandcue_private.heat_coach_operations(owner,operation_id,payload,result) values(v_uid,p_operation_id,v_payload,v_response);
    return v_response;
  end if;
  if (select count(*) from public.heat_coach_assessments a where a.owner=v_uid) >= 1000 then
    raise exception 'assessment-quota-exceeded' using errcode='P0001';
  end if;
  v_result := strandcue_private.heat_evaluate(v_input,v_publication.rule);
  insert into public.heat_coach_assessments(owner,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint)
    values(v_uid,p_publication_id,p_publication_digest,v_input,v_result,v_result->>'state',v_sources,v_fingerprint) returning * into v_record;
  v_response := jsonb_build_object('assessmentId',v_record.id,'publicationId',v_record.publication_id,'publicationDigest',v_record.publication_digest,
    'input',v_record.input,'result',v_record.result,'status',v_record.status,'sourceRevisions',v_record.source_revisions,'sourceFingerprint',v_record.source_fingerprint,
    'createdAt',strandcue_private.heat_iso(v_record.created_at),'revision',v_record.revision,'stale',false);
  insert into strandcue_private.heat_coach_operations(owner,operation_id,payload,result) values(v_uid,p_operation_id,v_payload,v_response);
  return v_response;
exception when unique_violation then
  select o.result into v_existing from strandcue_private.heat_coach_operations o where o.owner=v_uid and o.operation_id=p_operation_id and o.payload=v_payload;
  if found then return v_existing; end if;
  raise exception 'operation-conflict' using errcode='P0001';
end;
$$;

create or replace function strandcue_private.heat_assessment_json(p_row public.heat_coach_assessments, p_uid uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('assessmentId',p_row.id,'publicationId',p_row.publication_id,'publicationDigest',p_row.publication_digest,
    'input',p_row.input,'result',p_row.result,'status',p_row.status,'sourceRevisions',p_row.source_revisions,'sourceFingerprint',p_row.source_fingerprint,
    'createdAt',strandcue_private.heat_iso(p_row.created_at),'revision',p_row.revision,
    'stale',p_row.source_revisions is distinct from strandcue_private.heat_source_revisions(p_uid)
      or not exists(select 1 from strandcue_private.heat_rule_publications p where p.id=p_row.publication_id and p.content_digest=p_row.publication_digest and p.state='published'))
$$;

create or replace function strandcue_private.get_heat_coach_assessment_core(p_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_uid uuid := strandcue_private.heat_require_owner(); v_row public.heat_coach_assessments%rowtype;
begin
  select * into v_row from public.heat_coach_assessments a where a.id=p_id and a.owner=v_uid;
  if not found then raise exception 'assessment-not-found' using errcode='P0001'; end if;
  return strandcue_private.heat_assessment_json(v_row,v_uid);
end;
$$;

create or replace function strandcue_private.list_heat_coach_assessments_core(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_uid uuid := strandcue_private.heat_require_owner();
  v_items jsonb;
  v_has_more boolean;
  v_next jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or (p_cursor is not null and (
    jsonb_typeof(p_cursor)<>'object' or not (p_cursor ?& array['createdAt','assessmentId']) or p_cursor-array['createdAt','assessmentId']<>'{}'::jsonb)) then
    raise exception 'invalid-page' using errcode='22023'; end if;
  select coalesce(jsonb_agg(strandcue_private.heat_assessment_json(page.row_value,v_uid)
      order by (page.row_value).created_at desc,(page.row_value).id desc)
      filter (where page.ordinal <= p_limit),'[]'::jsonb), count(*) > p_limit
    into v_items,v_has_more
    from (select candidate.row_value,row_number() over (order by (candidate.row_value).created_at desc,(candidate.row_value).id desc) ordinal
      from (select a row_value from public.heat_coach_assessments a where a.owner=v_uid
      and (p_cursor is null or (a.created_at,a.id)<((p_cursor->>'createdAt')::timestamptz,(p_cursor->>'assessmentId')::uuid))
      order by a.created_at desc,a.id desc limit p_limit + 1) candidate) page;
  if v_has_more then
    v_next := jsonb_build_object(
      'createdAt',v_items->(jsonb_array_length(v_items)-1)->>'createdAt',
      'assessmentId',v_items->(jsonb_array_length(v_items)-1)->>'assessmentId');
  end if;
  return jsonb_build_object('items',v_items,'nextCursor',v_next);
end;
$$;

create or replace function public.create_heat_coach_assessment(p_operation_id uuid,p_publication_id uuid,p_publication_digest text,p_intent jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.create_heat_coach_assessment_core(p_operation_id,p_publication_id,p_publication_digest,p_intent)
$$;
create or replace function public.get_heat_coach_assessment(p_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.get_heat_coach_assessment_core(p_id)
$$;
create or replace function public.list_heat_coach_assessments(p_limit integer default 25,p_cursor jsonb default null)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.list_heat_coach_assessments_core(p_limit,p_cursor)
$$;

create or replace function public.heat_coach_operation_retention_cleanup(p_as_of timestamptz)
returns integer language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_count integer;
begin
  if p_as_of is null then raise exception 'invalid-as-of' using errcode='22023'; end if;
  delete from strandcue_private.heat_coach_operations where recorded_at < p_as_of - interval '30 days';
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

-- Extend the existing owner export without changing any committed migration.
do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='strandcue_private' and p.proname='export_build_csv_before_heat_coach') then
    alter function strandcue_private.export_build_csv(uuid) rename to export_build_csv_before_heat_coach;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='strandcue_private' and p.proname='request_export_before_heat_coach') then
    alter function strandcue_private.request_export(uuid,text) rename to request_export_before_heat_coach;
  end if;
end $$;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_base jsonb; v_csv text; v_versions text;
begin
  v_base := strandcue_private.export_build_csv_before_heat_coach(p_uid);
  select 'id,publication_id,publication_digest,input,result,status,source_revisions,source_fingerprint,created_at,revision' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(a.id::text)||','||strandcue_private.csv_quote(a.publication_id::text)||','||strandcue_private.csv_quote(a.publication_digest)||','||
    strandcue_private.csv_quote(a.input::text)||','||strandcue_private.csv_quote(a.result::text)||','||strandcue_private.csv_quote(a.status)||','||
    strandcue_private.csv_quote(a.source_revisions::text)||','||strandcue_private.csv_quote(a.source_fingerprint)||','||strandcue_private.csv_quote(a.created_at::text)||','||strandcue_private.csv_quote(a.revision::text),
    chr(10) order by a.created_at,a.id),'') into v_csv from public.heat_coach_assessments a where a.owner=p_uid;
  v_versions := regexp_replace(v_base->'files'->>'schema_versions.csv','^export,[0-9]+$','export,7','m')||chr(10)||'heatCoachAssessments,1';
  return jsonb_set(v_base,'{files}',(v_base->'files')||jsonb_build_object('heat_coach_assessments.csv',v_csv,'schema_versions.csv',v_versions));
end;
$$;

create or replace function strandcue_private.request_export(p_operation_id uuid,p_format text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare v_uid uuid:=strandcue_private.request_uid(); v_result jsonb; v_job uuid; v_document jsonb; v_count integer;
begin
  if v_uid is not null and p_operation_id is not null and exists(select 1 from strandcue_private.export_operations o where o.user_id=v_uid and o.operation_id=p_operation_id) then
    return strandcue_private.request_export_before_heat_coach(p_operation_id,p_format);
  end if;
  v_result := strandcue_private.request_export_before_heat_coach(p_operation_id,p_format);
  v_job := (v_result->>'jobId')::uuid;
  select j.document into v_document from public.export_jobs j where j.id=v_job and j.owner=v_uid for update;
  select count(*)::integer into v_count from public.heat_coach_assessments a where a.owner=v_uid;
  if p_format='json' then
    v_document := v_document || jsonb_build_object(
      'schemaVersions',(v_document->'schemaVersions')||jsonb_build_object('export',7,'heatCoachAssessments',1),
      'heatCoachAssessments',(select coalesce(jsonb_agg(jsonb_build_object(
        'assessmentId',a.id,'publicationId',a.publication_id,'publicationDigest',a.publication_digest,'input',a.input,'result',a.result,
        'status',a.status,'sourceRevisions',a.source_revisions,'sourceFingerprint',a.source_fingerprint,'createdAt',strandcue_private.heat_iso(a.created_at),'revision',a.revision)
        order by a.created_at,a.id),'[]'::jsonb) from public.heat_coach_assessments a where a.owner=v_uid));
  end if;
  v_result := v_result || jsonb_build_object('recordCount',(v_result->>'recordCount')::integer+v_count);
  update public.export_jobs set document=v_document,record_count=(v_result->>'recordCount')::integer where id=v_job;
  update strandcue_private.export_operations set result=v_result where user_id=v_uid and operation_id=p_operation_id;
  return v_result;
end;
$$;

alter function strandcue_private.heat_require_owner() owner to strandcue_mutator;
alter function strandcue_private.heat_source_revisions(uuid) owner to strandcue_mutator;
alter function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz) owner to strandcue_mutator;
alter function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb) owner to strandcue_mutator;
alter function strandcue_private.heat_assessment_json(public.heat_coach_assessments,uuid) owner to strandcue_mutator;
alter function strandcue_private.get_heat_coach_assessment_core(uuid) owner to strandcue_mutator;
alter function strandcue_private.list_heat_coach_assessments_core(integer,jsonb) owner to strandcue_mutator;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;
alter function strandcue_private.request_export(uuid,text) owner to strandcue_mutator;

revoke all on function public.create_heat_coach_assessment(uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.get_heat_coach_assessment(uuid) from public,anon;
revoke all on function public.list_heat_coach_assessments(integer,jsonb) from public,anon;
grant execute on function public.create_heat_coach_assessment(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.get_heat_coach_assessment(uuid) to authenticated;
grant execute on function public.list_heat_coach_assessments(integer,jsonb) to authenticated;
revoke all on function public.heat_coach_operation_retention_cleanup(timestamptz) from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.heat_coach_operation_retention_cleanup(timestamptz) to service_role;
  end if;
end $$;
grant execute on function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb),
  strandcue_private.get_heat_coach_assessment_core(uuid),
  strandcue_private.list_heat_coach_assessments_core(integer,jsonb) to authenticated;

revoke all on function strandcue_private.heat_require_owner() from public,anon,authenticated;
revoke all on function strandcue_private.heat_iso(timestamptz) from public,anon,authenticated;
revoke all on function strandcue_private.heat_zone_valid(jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.heat_condition_zone_valid(jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.heat_intent_valid(jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.heat_rule_guard() from public,anon,authenticated;
revoke all on function strandcue_private.heat_immutable() from public,anon,authenticated;
revoke all on function strandcue_private.heat_source_revisions(uuid) from public,anon,authenticated;
revoke all on function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function strandcue_private.heat_evaluate(jsonb,jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.heat_assessment_json(public.heat_coach_assessments,uuid) from public,anon,authenticated;
revoke all on function strandcue_private.get_heat_coach_assessment_core(uuid) from public,anon,authenticated;
revoke all on function strandcue_private.list_heat_coach_assessments_core(integer,jsonb) from public,anon,authenticated;
grant execute on function strandcue_private.heat_require_owner(),strandcue_private.heat_iso(timestamptz),strandcue_private.heat_zone_valid(jsonb),
  strandcue_private.heat_condition_zone_valid(jsonb),
  strandcue_private.heat_intent_valid(jsonb),strandcue_private.heat_rule_guard(),strandcue_private.heat_immutable(),
  strandcue_private.heat_source_revisions(uuid),strandcue_private.heat_construct_input(uuid,jsonb,timestamptz),
  strandcue_private.heat_evaluate(jsonb,jsonb),strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb),
  strandcue_private.heat_assessment_json(public.heat_coach_assessments,uuid),strandcue_private.get_heat_coach_assessment_core(uuid),
  strandcue_private.list_heat_coach_assessments_core(integer,jsonb) to strandcue_mutator;
revoke all on function strandcue_private.export_build_csv_before_heat_coach(uuid),strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_heat_coach(uuid,text),strandcue_private.request_export(uuid,text) from public,anon,authenticated;
grant execute on function strandcue_private.export_build_csv_before_heat_coach(uuid),strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_heat_coach(uuid,text),strandcue_private.request_export(uuid,text) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid,text) to authenticated;
grant execute on function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb),
  strandcue_private.get_heat_coach_assessment_core(uuid),
  strandcue_private.list_heat_coach_assessments_core(integer,jsonb) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke strandcue_mutator from current_user;

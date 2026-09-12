-- Chemical Service occurrence history. Zones and heat live only in revision
-- children; operation payloads are retry receipts, never read-model inputs.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

create table public.chemical_services (
  id uuid primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  unique(id,user_id)
);
create index chemical_services_owner on public.chemical_services(user_id,id);
create table public.service_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  service_id uuid not null,
  sequence integer not null check(sequence > 0),
  base_revision integer not null check(base_revision >= 0 and sequence=base_revision+1),
  kind text not null check(kind in ('baseline','correction')),
  facts jsonb not null check(jsonb_typeof(facts)='object' and not facts ?| array['zones','heat']),
  -- Presence metadata preserves omitted versus explicit null without duplicating heat.
  heat_state text not null default 'absent' check(heat_state in ('absent','null','value')),
  effective_start date,
  effective_end date,
  recorded_at timestamptz not null default now(),
  corrects_id uuid,
  correction_reason text,
  unique(id,user_id,service_id),
  unique(service_id,sequence),
  unique(corrects_id),
  foreign key(service_id,user_id) references public.chemical_services(id,user_id) on delete cascade,
  foreign key(corrects_id,user_id,service_id) references public.service_revisions(id,user_id,service_id),
  check((kind='baseline' and sequence=1 and corrects_id is null and correction_reason is null)
    or (kind='correction' and sequence>1 and corrects_id is not null
      and correction_reason is not null and length(btrim(correction_reason)) between 1 and 500))
);
create unique index service_one_baseline on public.service_revisions(service_id) where kind='baseline';
create index service_revision_owner_history on public.service_revisions(user_id,service_id,sequence);
create index service_revision_owner_time on public.service_revisions(user_id,(coalesce(effective_start,date '0001-01-01')) desc,recorded_at desc,service_id desc);
create table public.service_zones (
  service_revision_id uuid not null,
  service_id uuid not null,
  user_id uuid not null,
  region text not null check(region in ('whole-head','front','crown','nape','other','unknown')),
  segment text not null check(segment in ('entire-strand','roots','mid-lengths','ends','other','unknown')),
  primary key(service_revision_id,region,segment),
  foreign key(service_revision_id,user_id,service_id) references public.service_revisions(id,user_id,service_id) on delete cascade
);
create index service_zones_owner_revision on public.service_zones(user_id,service_id,service_revision_id);
create table public.heat_events (
  service_revision_id uuid primary key,
  service_id uuid not null,
  user_id uuid not null,
  method text not null check(method in ('flat-iron','blow-dryer','hood-dryer','other','unknown')),
  temperature_c numeric check(temperature_c >= 0 and temperature_c <= 1.7976931348623157e308::numeric),
  passes bigint check(passes between 0 and 9007199254740991),
  duration_minutes numeric check(duration_minutes >= 0 and duration_minutes <= 1.7976931348623157e308::numeric),
  source text not null check(source in ('user-reported','user-estimated')),
  provided_fields text[] not null default '{}'
    check(provided_fields <@ array['temperatureC','passes','durationMinutes']),
  foreign key(service_revision_id,user_id,service_id) references public.service_revisions(id,user_id,service_id) on delete cascade
);
create index heat_events_owner_revision on public.heat_events(user_id,service_id,service_revision_id);
create table public.service_observations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null,
  user_id uuid not null,
  effective_date jsonb not null check(jsonb_typeof(effective_date)='object'),
  effective_start date,
  effective_end date,
  effect_status text not null check(effect_status in ('present','not-present','unknown')),
  source text not null check(source in ('user-reported','user-estimated')),
  recorded_at timestamptz not null default now(),
  foreign key(service_id,user_id) references public.chemical_services(id,user_id) on delete cascade
);
create index service_observation_owner_time on public.service_observations(user_id,service_id,effective_start desc,recorded_at desc,id desc);
create index service_observation_service on public.service_observations(service_id,user_id);
create table strandcue_private.service_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key(user_id,operation_id)
);
create index service_operation_create on strandcue_private.service_operations(user_id,(payload->>'serviceId'))
  where payload->>'kind'='record';

-- Explicit consumer SELECT only; append-only mutator policies and column grants.
do $$
declare relation text;
begin
  foreach relation in array array['chemical_services','service_revisions','service_zones','heat_events','service_observations'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('alter table public.%I force row level security',relation);
    execute format('revoke all on public.%I from public, anon, authenticated',relation);
    execute format('grant select on public.%I to authenticated',relation);
    execute format('grant select,insert on public.%I to strandcue_mutator',relation);
    execute format('create policy owner_read on public.%I for select to authenticated,strandcue_mutator
      using(user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=%I.user_id and p.account_status=''active''))',relation,relation);
    execute format('create policy owner_append on public.%I for insert to strandcue_mutator
      with check(user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=%I.user_id and p.account_status=''active''))',relation,relation);
  end loop;
end $$;
grant update(revision) on public.chemical_services to strandcue_mutator;
create policy service_revision_advance on public.chemical_services for update to strandcue_mutator
  using(user_id=(select strandcue_private.request_uid()))
  with check(user_id=(select strandcue_private.request_uid()));
alter table strandcue_private.service_operations enable row level security;
alter table strandcue_private.service_operations force row level security;
revoke all on strandcue_private.service_operations from public,anon,authenticated;
grant select,insert on strandcue_private.service_operations to strandcue_mutator;
create policy owner_read on strandcue_private.service_operations for select to strandcue_mutator
  using(user_id=(select strandcue_private.request_uid()));
create policy owner_append on strandcue_private.service_operations for insert to strandcue_mutator
  with check(user_id=(select strandcue_private.request_uid()));

create function strandcue_private.validate_service_facts(p_facts jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare normalized jsonb:=p_facts; zone jsonb; heat jsonb; k text; v jsonb; limit_length integer; text_value text;
begin
  if p_facts is null or jsonb_typeof(p_facts)<>'object'
    or not p_facts ?& array['serviceType','occurredOn','zones']
    or p_facts-array['serviceType','otherLabel','occurredOn','productOrSystem','notes','zones','heat']<>'{}'::jsonb
    or jsonb_typeof(p_facts->'serviceType') is distinct from 'string'
    or p_facts->>'serviceType' not in ('permanent-colour','demi-permanent','semi-permanent','highlights','balayage','bleach-or-lightener','colour-remover','keratin','brazilian-smoothing','nanoplasty','relaxer','texturiser','perm','chemical-straightening','other') then
    raise exception 'invalid-service' using errcode='22023';
  end if;
  perform strandcue_private.date_interval(p_facts->'occurredOn');
  for k,v in select * from jsonb_each(p_facts) where key in ('otherLabel','productOrSystem','notes') loop
    if v='null'::jsonb then continue; end if;
    limit_length:=case k when 'otherLabel' then 100 when 'productOrSystem' then 200 else 2000 end;
    text_value:=strandcue_private.trim_text(v#>>'{}');
    if jsonb_typeof(v)<>'string' or strandcue_private.js_length(text_value)>limit_length
      or (k<>'notes' and text_value='') then raise exception 'invalid-service' using errcode='22023'; end if;
    normalized:=jsonb_set(normalized,array[k],to_jsonb(text_value));
  end loop;
  if (p_facts->>'serviceType'='other' and coalesce(normalized->>'otherLabel','')='')
    or (p_facts->>'serviceType'<>'other' and normalized->>'otherLabel' is not null) then
    raise exception 'invalid-service' using errcode='22023';
  end if;
  if jsonb_typeof(p_facts->'zones') is distinct from 'array' then raise exception 'invalid-service' using errcode='22023'; end if;
  if jsonb_array_length(p_facts->'zones') not between 1 and 36 then raise exception 'invalid-service' using errcode='22023'; end if;
  for zone in select * from jsonb_array_elements(p_facts->'zones') loop
    if jsonb_typeof(zone)<>'object' or not zone ?& array['region','segment'] or zone-array['region','segment']<>'{}'::jsonb
      or jsonb_typeof(zone->'region') is distinct from 'string' or jsonb_typeof(zone->'segment') is distinct from 'string'
      or zone->>'region' not in ('whole-head','front','crown','nape','other','unknown')
      or zone->>'segment' not in ('entire-strand','roots','mid-lengths','ends','other','unknown') then
      raise exception 'invalid-service' using errcode='22023';
    end if;
  end loop;
  if (select count(distinct z) from jsonb_array_elements(p_facts->'zones') z)<>jsonb_array_length(p_facts->'zones') then
    raise exception 'invalid-service' using errcode='22023';
  end if;
  normalized:=jsonb_set(normalized,'{zones}',(select jsonb_agg(z order by (z->>'region') collate "C",(z->>'segment') collate "C") from jsonb_array_elements(p_facts->'zones') z));
  heat:=p_facts->'heat';
  if heat is not null and heat<>'null'::jsonb then
    if jsonb_typeof(heat)<>'object' or not heat ?& array['method','source']
      or heat-array['method','temperatureC','passes','durationMinutes','source']<>'{}'::jsonb
      or jsonb_typeof(heat->'method') is distinct from 'string'
      or jsonb_typeof(heat->'source') is distinct from 'string'
      or heat->>'method' not in ('flat-iron','blow-dryer','hood-dryer','other','unknown')
      or heat->>'source' not in ('user-reported','user-estimated') then raise exception 'invalid-service' using errcode='22023'; end if;
    for k,v in select * from jsonb_each(heat) where key in ('temperatureC','passes','durationMinutes') loop
      if v='null'::jsonb then continue; end if;
      if jsonb_typeof(v)<>'number' then raise exception 'invalid-service' using errcode='22023'; end if;
      if (v#>>'{}')::numeric<0 or (v#>>'{}')::numeric>1.7976931348623157e308::numeric
        or (k='passes' and ((v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric>9007199254740991)) then
        raise exception 'invalid-service' using errcode='22023';
      end if;
    end loop;
  end if;
  return normalized;
end $$;

create function strandcue_private.validate_service_observation(p_observation jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if p_observation is null or jsonb_typeof(p_observation)<>'object'
    or not p_observation ?& array['observedOn','effectStatus']
    or p_observation-array['observedOn','effectStatus']<>'{}'::jsonb
    or jsonb_typeof(p_observation->'effectStatus') is distinct from 'string'
    or p_observation->>'effectStatus' not in ('present','not-present','unknown') then
    raise exception 'invalid-observation' using errcode='22023';
  end if;
  perform strandcue_private.date_interval(p_observation->'observedOn');
  return p_observation;
end $$;

-- Called only inside definer cores. All mutations lock profile before service.
create function strandcue_private.service_account(p_lock boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=strandcue_private.request_uid(); claims jsonb:=strandcue_private.request_claims(); profile public.profiles;
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  if claims->>'sub' is distinct from uid::text or claims->>'role' is distinct from 'authenticated'
    or claims->'is_anonymous' is distinct from 'false'::jsonb or nullif(claims->>'email','') is null then
    raise exception 'email-not-verified' using errcode='42501';
  end if;
  if p_lock then select * into profile from public.profiles where user_id=uid for update;
  else select * into profile from public.profiles where user_id=uid; end if;
  if not found or profile.account_status<>'active' then raise exception 'account-not-active' using errcode='42501'; end if;
  return uid;
end $$;

create function strandcue_private.service_append_revision(p_service_id uuid,p_sequence integer,p_facts jsonb,p_corrects_id uuid,p_reason text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare uid uuid:=strandcue_private.request_uid(); revision_id uuid; effective record; heat jsonb:=p_facts->'heat';
begin
  select * into effective from strandcue_private.date_interval(p_facts->'occurredOn');
  insert into public.service_revisions(user_id,service_id,sequence,base_revision,kind,facts,heat_state,effective_start,effective_end,corrects_id,correction_reason)
    values(uid,p_service_id,p_sequence,p_sequence-1,case when p_sequence=1 then 'baseline' else 'correction' end,
      p_facts-'zones'-'heat',case when heat is null then 'absent' when heat='null'::jsonb then 'null' else 'value' end,
      effective.start_date,effective.end_date,p_corrects_id,p_reason) returning id into revision_id;
  insert into public.service_zones(service_revision_id,service_id,user_id,region,segment)
    select revision_id,p_service_id,uid,z->>'region',z->>'segment' from jsonb_array_elements(p_facts->'zones') z;
  if heat is not null and heat<>'null'::jsonb then
    insert into public.heat_events(service_revision_id,service_id,user_id,method,temperature_c,passes,duration_minutes,source,provided_fields)
      values(revision_id,p_service_id,uid,heat->>'method',(heat->>'temperatureC')::numeric,(heat->>'passes')::numeric::bigint,
        (heat->>'durationMinutes')::numeric,heat->>'source',
        array(select k from jsonb_object_keys(heat) k where k in ('temperatureC','passes','durationMinutes')));
  end if;
  return revision_id;
end $$;

create function strandcue_private.service_append_observation(p_service_id uuid,p_observation jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare observation_id uuid; effective record;
begin
  select * into effective from strandcue_private.date_interval(p_observation->'observedOn');
  insert into public.service_observations(service_id,user_id,effective_date,effective_start,effective_end,effect_status,source)
    values(p_service_id,strandcue_private.request_uid(),p_observation->'observedOn',effective.start_date,effective.end_date,p_observation->>'effectStatus',
      case when p_observation->'observedOn'->>'precision'='day' then 'user-reported' else 'user-estimated' end)
    returning id into observation_id;
  return observation_id;
end $$;

create function strandcue_private.record_service(p_operation_id uuid,p_service_id uuid,p_facts jsonb,p_initial_observation jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; normalized jsonb; observation jsonb; payload_json jsonb; previous strandcue_private.service_operations;
  revision_id uuid; result_json jsonb;
begin
  uid:=strandcue_private.service_account(true);
  if p_operation_id is null or p_service_id is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  normalized:=strandcue_private.validate_service_facts(p_facts);
  if p_initial_observation is not null then observation:=strandcue_private.validate_service_observation(p_initial_observation); end if;
  payload_json:=jsonb_build_object('kind','record','serviceId',p_service_id,'facts',normalized,'initialObservation',observation);
  select * into previous from strandcue_private.service_operations where user_id=uid and operation_id=p_operation_id;
  if found then
    if previous.payload<>payload_json then raise exception 'operation-conflict' using errcode='23505'; end if;
    return previous.result;
  end if;
  -- A new operation ID for the same logical create also replays the baseline receipt.
  perform 1 from public.chemical_services where id=p_service_id and user_id=uid for update;
  if found then
    select * into previous from strandcue_private.service_operations
      where user_id=uid and payload->>'kind'='record' and payload->>'serviceId'=p_service_id::text order by recorded_at,operation_id limit 1;
    if not found or previous.payload<>payload_json then raise exception 'service-conflict' using errcode='23505'; end if;
    result_json:=previous.result;
  else
    begin
      insert into public.chemical_services(id,user_id) values(p_service_id,uid);
    exception when unique_violation then raise exception 'service-conflict' using errcode='23505'; end;
    revision_id:=strandcue_private.service_append_revision(p_service_id,1,normalized,null,null);
    if observation is not null then perform strandcue_private.service_append_observation(p_service_id,observation); end if;
    result_json:=jsonb_build_object('serviceId',p_service_id,'revision',1,'revisionId',revision_id);
  end if;
  insert into strandcue_private.service_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload_json,result_json);
  return result_json;
end $$;

create function strandcue_private.correct_service(p_operation_id uuid,p_service_id uuid,p_expected_revision integer,p_corrects_id uuid,p_reason text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; normalized jsonb; reason_text text:=strandcue_private.trim_text(p_reason); payload_json jsonb;
  previous strandcue_private.service_operations; service public.chemical_services; revision_id uuid; result_json jsonb;
begin
  uid:=strandcue_private.service_account(true);
  if p_operation_id is null or p_service_id is null or p_expected_revision is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  normalized:=strandcue_private.validate_service_facts(p_facts);
  if p_corrects_id is null or reason_text is null or strandcue_private.js_length(reason_text) not between 1 and 500 then raise exception 'invalid-correction' using errcode='22023'; end if;
  payload_json:=jsonb_build_object('kind','correct','serviceId',p_service_id,'expectedRevision',p_expected_revision,'correctsId',p_corrects_id,'reason',reason_text,'facts',normalized);
  select * into previous from strandcue_private.service_operations where user_id=uid and operation_id=p_operation_id;
  if found then
    if previous.payload<>payload_json then raise exception 'operation-conflict' using errcode='23505'; end if;
    return previous.result;
  end if;
  select * into service from public.chemical_services where id=p_service_id and user_id=uid for update;
  if not found then raise exception 'service-not-found' using errcode='22023'; end if;
  if p_expected_revision<>service.revision then raise exception 'revision-conflict' using errcode='40001'; end if;
  if not exists(select 1 from public.service_revisions where id=p_corrects_id and service_id=p_service_id and user_id=uid and sequence=service.revision) then
    raise exception 'correction-target-not-found' using errcode='22023';
  end if;
  revision_id:=strandcue_private.service_append_revision(p_service_id,service.revision+1,normalized,p_corrects_id,reason_text);
  update public.chemical_services set revision=service.revision+1 where id=p_service_id and user_id=uid;
  result_json:=jsonb_build_object('serviceId',p_service_id,'revision',service.revision+1,'revisionId',revision_id);
  insert into strandcue_private.service_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload_json,result_json);
  return result_json;
end $$;

create function strandcue_private.observe_service(p_operation_id uuid,p_service_id uuid,p_observed_on jsonb,p_effect_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; observation jsonb; payload_json jsonb; previous strandcue_private.service_operations;
  service public.chemical_services; revision_id uuid; observation_id uuid; result_json jsonb;
begin
  uid:=strandcue_private.service_account(true);
  if p_operation_id is null or p_service_id is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  observation:=strandcue_private.validate_service_observation(jsonb_build_object('observedOn',p_observed_on,'effectStatus',p_effect_status));
  payload_json:=jsonb_build_object('kind','observe','serviceId',p_service_id,'observation',observation);
  select * into previous from strandcue_private.service_operations where user_id=uid and operation_id=p_operation_id;
  if found then
    if previous.payload<>payload_json then raise exception 'operation-conflict' using errcode='23505'; end if;
    return previous.result;
  end if;
  select * into service from public.chemical_services where id=p_service_id and user_id=uid for update;
  if not found then raise exception 'service-not-found' using errcode='22023'; end if;
  select id into revision_id from public.service_revisions where service_id=p_service_id and user_id=uid and sequence=service.revision;
  observation_id:=strandcue_private.service_append_observation(p_service_id,observation);
  result_json:=jsonb_build_object('serviceId',p_service_id,'revision',service.revision,'revisionId',revision_id,'observationId',observation_id);
  insert into strandcue_private.service_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload_json,result_json);
  return result_json;
end $$;

create function strandcue_private.service_facts(p_revision public.service_revisions)
returns jsonb language sql stable security invoker set search_path='' as $$
  select p_revision.facts || jsonb_build_object('zones',
    (select coalesce(jsonb_agg(jsonb_build_object('region',z.region,'segment',z.segment) order by z.region collate "C",z.segment collate "C"),'[]'::jsonb)
      from public.service_zones z where z.service_revision_id=p_revision.id and z.user_id=p_revision.user_id and z.service_id=p_revision.service_id))
    || case p_revision.heat_state when 'absent' then '{}'::jsonb when 'null' then '{"heat":null}'::jsonb
    else jsonb_build_object('heat',(select jsonb_build_object('method',h.method,'source',h.source)
      || case when 'temperatureC'=any(h.provided_fields) then jsonb_build_object('temperatureC',h.temperature_c) else '{}'::jsonb end
      || case when 'passes'=any(h.provided_fields) then jsonb_build_object('passes',h.passes) else '{}'::jsonb end
      || case when 'durationMinutes'=any(h.provided_fields) then jsonb_build_object('durationMinutes',h.duration_minutes) else '{}'::jsonb end
      from public.heat_events h where h.service_revision_id=p_revision.id and h.user_id=p_revision.user_id and h.service_id=p_revision.service_id)) end
$$;
create function strandcue_private.service_observation_json(p_observation public.service_observations)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_observation.id,'serviceId',p_observation.service_id,
    'observedOn',p_observation.effective_date,'effectStatus',p_observation.effect_status,'source',p_observation.source,
    'recordedAt',to_char(p_observation.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;
create function strandcue_private.service_summary(p_service_id uuid,p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare service public.chemical_services; revision_row public.service_revisions; observation_json jsonb;
  candidates jsonb; candidate_count integer; distinct_statuses integer; has_definite boolean;
  agreed_status text; presence text:='unknown';
begin
  select * into service from public.chemical_services where id=p_service_id and user_id=strandcue_private.request_uid();
  if not found then return null; end if;
  select * into strict revision_row from public.service_revisions where service_id=service.id and user_id=service.user_id and sequence=service.revision;
  -- An observation is superseded only by one definitely applicable after its
  -- entire interval. Unknown/overlapping/tied dates cannot be ordered by
  -- submission time or UUID: those are audit/pagination order, not fact order.
  with applicable as (
    select o.* from public.service_observations o
    where o.service_id=service.id and o.user_id=service.user_id
      and (o.effective_start is null or o.effective_start<=p_as_of)
  ), current_candidates as (
    select o.* from applicable o where not exists (
      select 1 from applicable later
      where later.effective_end<=p_as_of and o.effective_end<later.effective_start
    )
  )
  select count(*),count(distinct o.effect_status),bool_or(o.effective_end<=p_as_of),
    min(o.effect_status),jsonb_agg(strandcue_private.service_observation_json(o))
    into candidate_count,distinct_statuses,has_definite,agreed_status,candidates
    from current_candidates o;
  if distinct_statuses=1 and has_definite then presence:=agreed_status; end if;
  if candidate_count=1 then observation_json:=candidates->0; end if;
  return jsonb_build_object('serviceId',service.id,'revision',service.revision,'revisionId',revision_row.id,
    'facts',strandcue_private.service_facts(revision_row),'currentObservation',observation_json,'currentPresence',presence);
end $$;

create function strandcue_private.get_service(p_service_id uuid,p_include_audit boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid; result_json jsonb; revisions_json jsonb; observations_json jsonb;
begin
  uid:=strandcue_private.service_account(false);
  if p_include_audit is null then raise exception 'invalid-audit' using errcode='22023'; end if;
  result_json:=strandcue_private.service_summary(p_service_id,(now() at time zone 'Africa/Johannesburg')::date);
  if result_json is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'serviceId',r.service_id,'sequence',r.sequence,'baseRevision',r.base_revision,
    'kind',r.kind,'facts',strandcue_private.service_facts(r),'correctsId',r.corrects_id,'reason',r.correction_reason,
    'recordedAt',to_char(r.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by r.sequence),'[]'::jsonb)
    into revisions_json from public.service_revisions r
    where r.service_id=p_service_id and r.user_id=uid and (p_include_audit or r.sequence=(result_json->>'revision')::integer);
  select coalesce(jsonb_agg(strandcue_private.service_observation_json(o) order by o.recorded_at,o.id),'[]'::jsonb)
    into observations_json from public.service_observations o where o.service_id=p_service_id and o.user_id=uid;
  return result_json||jsonb_build_object('revisions',revisions_json,'observations',observations_json);
end $$;

create function strandcue_private.list_services(p_as_of date,p_limit integer,p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid; cursor_start date; cursor_time timestamptz; cursor_id uuid; items jsonb:='[]'::jsonb;
  next_cursor jsonb; row_data record; count_rows integer:=0;
begin
  uid:=strandcue_private.service_account(false);
  if p_as_of is null or p_as_of<date '1000-01-01' or p_as_of>date '9999-12-31' then raise exception 'invalid-as-of' using errcode='22023'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid-page' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor)<>'object' or not p_cursor ?& array['asOf','effectiveStart','recordedAt','serviceId']
        or p_cursor-array['asOf','effectiveStart','recordedAt','serviceId']<>'{}'::jsonb
        or p_cursor->>'asOf' is distinct from p_as_of::text
        or jsonb_typeof(p_cursor->'effectiveStart') is distinct from 'string'
        or jsonb_typeof(p_cursor->'recordedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'serviceId') is distinct from 'string' then raise exception 'invalid-cursor'; end if;
      cursor_start:=(p_cursor->>'effectiveStart')::date;
      cursor_time:=(p_cursor->>'recordedAt')::timestamptz;
      cursor_id:=(p_cursor->>'serviceId')::uuid;
      if not isfinite(cursor_start) or not isfinite(cursor_time) then raise exception 'invalid-cursor'; end if;
    exception when others then raise exception 'invalid-cursor' using errcode='22023'; end;
  end if;
  for row_data in
    select s.id,coalesce(r.effective_start,date '0001-01-01') sort_start,r.recorded_at
    from public.chemical_services s join public.service_revisions r on r.service_id=s.id and r.user_id=s.user_id and r.sequence=s.revision
    where s.user_id=uid and (r.effective_start is null or r.effective_start<=p_as_of)
      and (cursor_id is null or (coalesce(r.effective_start,date '0001-01-01'),r.recorded_at,s.id)<(cursor_start,cursor_time,cursor_id))
    order by coalesce(r.effective_start,date '0001-01-01') desc,r.recorded_at desc,s.id desc limit p_limit+1
  loop
    count_rows:=count_rows+1;
    if count_rows>p_limit then return jsonb_build_object('items',items,'nextCursor',next_cursor); end if;
    items:=items||jsonb_build_array(strandcue_private.service_summary(row_data.id,p_as_of));
    next_cursor:=jsonb_build_object('asOf',p_as_of,'effectiveStart',row_data.sort_start,
      'recordedAt',to_char(row_data.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'serviceId',row_data.id);
  end loop;
  return jsonb_build_object('items',items,'nextCursor',null);
end $$;

create function public.record_service(p_operation_id uuid,p_service_id uuid,p_facts jsonb,p_initial_observation jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$
  select strandcue_private.record_service(p_operation_id,p_service_id,p_facts,p_initial_observation)
$$;
create function public.correct_service(p_operation_id uuid,p_service_id uuid,p_expected_revision integer,p_corrects_id uuid,p_reason text,p_facts jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select strandcue_private.correct_service(p_operation_id,p_service_id,p_expected_revision,p_corrects_id,p_reason,p_facts)
$$;
create function public.observe_service(p_operation_id uuid,p_service_id uuid,p_observed_on jsonb,p_effect_status text)
returns jsonb language sql security invoker set search_path='' as $$
  select strandcue_private.observe_service(p_operation_id,p_service_id,p_observed_on,p_effect_status)
$$;
create function public.get_service(p_service_id uuid,p_include_audit boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select strandcue_private.get_service(p_service_id,p_include_audit)
$$;
create function public.list_services(p_as_of date,p_limit integer default 25,p_cursor jsonb default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select strandcue_private.list_services(p_as_of,p_limit,p_cursor)
$$;

-- Revoke defaults only on this feature's functions, preserving Passport bridges.
do $$
declare function_row record;
begin
  for function_row in select p.oid::regprocedure signature,n.nspname,p.proname,p.prosecdef
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','strandcue_private') and p.proname=any(array[
      'validate_service_facts','validate_service_observation','service_account','service_append_revision','service_append_observation',
      'service_facts','service_observation_json','service_summary','record_service','correct_service','observe_service','get_service','list_services'])
  loop
    execute format('revoke all on function %s from public,anon,authenticated',function_row.signature);
    if function_row.nspname='strandcue_private' then
      execute format('grant execute on function %s to strandcue_mutator',function_row.signature);
      if function_row.prosecdef then execute format('alter function %s owner to strandcue_mutator',function_row.signature); end if;
    end if;
    if function_row.proname=any(array['record_service','correct_service','observe_service','get_service','list_services']) then
      execute format('grant execute on function %s to authenticated',function_row.signature);
    end if;
  end loop;
end $$;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

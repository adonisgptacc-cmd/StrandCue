-- Owner-only, append-only Cue Check persistence (CC-01..CC-03).
-- All owner bindings and actual-use facts are derived from trusted stored
-- executions. Public wrappers are invokers; private cores are hardened
-- definers with owner-confined RLS access.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'migration_admin') then
    create role migration_admin nologin;
  end if;
  if current_user <> 'migration_admin' then
    execute format('grant migration_admin to %I with set true', current_user);
  end if;
end $$;
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.cue_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  record_id uuid not null unique,
  execution_id uuid not null,
  recommendation_run_id uuid not null,
  goal text not null check (goal in ('basic_wash','style_refresh','heat_style','chemical_service_prep')),
  timing text not null check (timing in ('immediate','delayed')),
  lifecycle text not null check (lifecycle in ('active','voided')),
  revision integer not null check (revision >= 1 and revision <= 51),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  observation jsonb not null check (octet_length(observation::text) <= 32768),
  confirmed_steps jsonb not null check (jsonb_typeof(confirmed_steps) = 'array' and octet_length(confirmed_steps::text) <= 262144),
  execution_status text not null check (execution_status in ('completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received_at >= observed_at)
);

create unique index cue_checks_one_active_per_execution_timing
  on public.cue_checks(user_id, execution_id, timing) where lifecycle = 'active';
create index cue_checks_owner_received on public.cue_checks(user_id, received_at desc, id desc);

create table public.cue_check_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  record_id uuid not null references public.cue_checks(record_id) on delete cascade,
  sequence integer not null check (sequence >= 1 and sequence <= 51),
  kind text not null check (kind in ('create','correct','void')),
  observation jsonb,
  corrects_id uuid references public.cue_check_revisions(id),
  correction_reason text,
  void_reason text,
  received_at timestamptz not null default now(),
  unique(record_id, sequence),
  check (id <> corrects_id),
  check (
    (kind = 'create' and sequence = 1 and observation is not null and corrects_id is null and correction_reason is null and void_reason is null)
    or (kind = 'correct' and sequence >= 2 and observation is not null and corrects_id is not null and correction_reason is not null and void_reason is null)
    or (kind = 'void' and sequence >= 2 and observation is null and corrects_id is not null and correction_reason is null and void_reason is not null)
  )
);
create unique index cue_check_revisions_corrects_once on public.cue_check_revisions(corrects_id) where corrects_id is not null;
create index cue_check_revisions_record_sequence on public.cue_check_revisions(record_id, sequence);

create table strandcue_private.cue_check_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id, operation_id)
);

alter table public.cue_checks enable row level security;
alter table public.cue_checks force row level security;
alter table public.cue_check_revisions enable row level security;
alter table public.cue_check_revisions force row level security;
alter table strandcue_private.cue_check_operations enable row level security;
alter table strandcue_private.cue_check_operations force row level security;

create policy cue_checks_owner_read on public.cue_checks for select to authenticated
  using (user_id = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = (select strandcue_private.request_uid()) and p.account_status = 'active'));
create policy cue_check_revisions_owner_read on public.cue_check_revisions for select to authenticated
  using (user_id = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = (select strandcue_private.request_uid()) and p.account_status = 'active'));
create policy cue_checks_mutator_all on public.cue_checks for all to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()))
  with check (user_id = (select strandcue_private.request_uid()));
create policy cue_check_revisions_mutator_select on public.cue_check_revisions for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy cue_check_revisions_mutator_insert on public.cue_check_revisions for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
create policy cue_check_operations_mutator_select on strandcue_private.cue_check_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy cue_check_operations_mutator_insert on strandcue_private.cue_check_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

create or replace function strandcue_private.cue_check_revision_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Profile deletion cascades through the owner graph under the dedicated
  -- mutator role. Every other rewrite or delete remains forbidden.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'cue-check-revision-immutable' using errcode = 'P0001';
end;
$$;
alter function strandcue_private.cue_check_revision_immutable() owner to strandcue_mutator;
create trigger cue_check_revisions_immutable before update or delete on public.cue_check_revisions
  for each row execute function strandcue_private.cue_check_revision_immutable();

create or replace function strandcue_private.cue_check_binding_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'cue-check-binding-immutable' using errcode = 'P0001';
  end if;
  if old.user_id is distinct from new.user_id or old.record_id is distinct from new.record_id
     or old.execution_id is distinct from new.execution_id
     or old.recommendation_run_id is distinct from new.recommendation_run_id
     or old.timing is distinct from new.timing then
    raise exception 'cue-check-binding-immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
alter function strandcue_private.cue_check_binding_immutable() owner to strandcue_mutator;
create trigger cue_checks_binding_immutable before update or delete on public.cue_checks
  for each row execute function strandcue_private.cue_check_binding_immutable();

create or replace function strandcue_private.validate_cue_check_observation(p_observation jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  key text;
  timing text;
  observed timestamptz;
  allowed text[] := array['timing','observedAt','overallResult','satisfaction','dryness','frizz','softness','tangling','buildup','breakage','styleLongevity','immediateReaction','wouldUseAgain','notes'];
  answer_keys text[] := array['overallResult','satisfaction','dryness','frizz','softness','tangling','buildup','breakage','styleLongevity','immediateReaction','wouldUseAgain'];
begin
  if p_observation is null or jsonb_typeof(p_observation) <> 'object' then
    raise exception 'invalid-observation' using errcode = '22023';
  end if;
  for key in select jsonb_object_keys(p_observation) loop
    if not (key = any(allowed)) or p_observation -> key = 'null'::jsonb then
      raise exception 'invalid-observation' using errcode = '22023';
    end if;
  end loop;
  timing := p_observation ->> 'timing';
  if timing not in ('immediate','delayed') or not (p_observation ? 'observedAt') then
    raise exception 'invalid-observation' using errcode = '22023';
  end if;
  begin observed := (p_observation ->> 'observedAt')::timestamptz; exception when others then
    raise exception 'invalid-observation' using errcode = '22023';
  end;
  if (p_observation ->> 'observedAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or observed > now() then
    raise exception 'invalid-observation' using errcode = '22023';
  end if;
  if not (p_observation ? 'overallResult' or p_observation ? 'satisfaction'
     or p_observation ? 'dryness' or p_observation ? 'frizz' or p_observation ? 'softness'
     or p_observation ? 'tangling' or p_observation ? 'buildup' or p_observation ? 'breakage'
     or p_observation ? 'styleLongevity' or p_observation ? 'immediateReaction'
     or p_observation ? 'wouldUseAgain')
     and not coalesce(jsonb_typeof(p_observation -> 'notes') = 'string' and length(p_observation ->> 'notes') > 0, false) then
    raise exception 'invalid-observation' using errcode = '22023';
  end if;
  if p_observation ? 'notes' and (jsonb_typeof(p_observation -> 'notes') <> 'string' or length(p_observation ->> 'notes') > 2000) then
    raise exception 'invalid-observation' using errcode = '22023';
  end if;
  if p_observation ? 'overallResult' and (p_observation ->> 'overallResult') not in ('better','same','worse','unknown') then raise exception 'invalid-observation' using errcode='22023'; end if;
  if p_observation ? 'satisfaction' and (p_observation ->> 'satisfaction') not in ('satisfied','neutral','dissatisfied','unknown') then raise exception 'invalid-observation' using errcode='22023'; end if;
  foreach key in array array['dryness','frizz','softness','tangling','buildup','breakage'] loop
    if p_observation ? key and (p_observation ->> key) not in ('less','same','more','unknown') then raise exception 'invalid-observation' using errcode='22023'; end if;
  end loop;
  if p_observation ? 'styleLongevity' and (timing = 'immediate' or (p_observation ->> 'styleLongevity') not in ('shorter','similar','longer','unknown')) then raise exception 'invalid-observation' using errcode='22023'; end if;
  if p_observation ? 'immediateReaction' and (p_observation ->> 'immediateReaction') not in ('none-noticed','some-noticed','unknown') then raise exception 'invalid-observation' using errcode='22023'; end if;
  if p_observation ? 'wouldUseAgain' and (p_observation ->> 'wouldUseAgain') not in ('yes','no','unsure','unknown') then raise exception 'invalid-observation' using errcode='22023'; end if;
end;
$$;
alter function strandcue_private.validate_cue_check_observation(jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_confirmed_steps(p_execution jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb;
begin
  if jsonb_typeof(p_execution -> 'steps') <> 'array' then
    raise exception 'execution-not-usable' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_execution -> 'steps') s
    where s ->> 'state' = 'confirmed' and (s -> 'confirmedAt' is null or s -> 'confirmedAt' = 'null'::jsonb)) then
    raise exception 'execution-not-usable' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'stepId', s ->> 'stepId', 'position', (s ->> 'position')::integer,
    'confirmedAt', s -> 'confirmedAt', 'action', s #> '{planned,action}',
    'productId', s #> '{planned,productId}', 'productVersionId', s #> '{planned,productVersionId}',
    'toolId', s #> '{planned,toolId}', 'toolVersionId', s #> '{planned,toolVersionId}')
    order by (s ->> 'position')::integer), '[]'::jsonb) into result
  from jsonb_array_elements(p_execution -> 'steps') s where s ->> 'state' = 'confirmed';
  return result;
exception when others then
  if sqlerrm = 'execution-not-usable' then raise; end if;
  raise exception 'execution-not-usable' using errcode = '22023';
end;
$$;
alter function strandcue_private.cue_check_confirmed_steps(jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_receipt(p_row public.cue_checks)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'recordId', p_row.record_id, 'executionId', p_row.execution_id,
    'recommendationRunId', p_row.recommendation_run_id, 'goal', p_row.goal,
    'timing', p_row.timing, 'lifecycle', p_row.lifecycle, 'revision', p_row.revision,
    'observedAt', p_row.observation ->> 'observedAt', 'receivedAt', p_row.received_at,
    'observation', p_row.observation, 'confirmedSteps', p_row.confirmed_steps,
    'executionStatus', p_row.execution_status, 'createdAt', p_row.created_at, 'updatedAt', p_row.updated_at)
$$;
alter function strandcue_private.cue_check_receipt(public.cue_checks) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_require_owner()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid();
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  perform 1 from public.profiles where user_id=uid and account_status='active';
  if not found then raise exception 'account-not-active' using errcode='42501'; end if;
  return uid;
end;
$$;
alter function strandcue_private.cue_check_require_owner() owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_create_core(p_operation_id uuid, p_execution_id uuid, p_observation jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.cue_check_require_owner();
  op strandcue_private.cue_check_operations%rowtype;
  ex public.protocol_executions%rowtype;
  run public.recommendation_runs%rowtype;
  row public.cue_checks%rowtype;
  payload jsonb; result jsonb; steps jsonb; rid uuid := gen_random_uuid(); now_at timestamptz := now(); v_timing text; goal text;
begin
  if p_operation_id is null or p_execution_id is null or p_observation is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  payload := jsonb_build_object('kind','create','executionId',p_execution_id,'observation',p_observation);
  select * into op from strandcue_private.cue_check_operations where user_id=uid and operation_id=p_operation_id;
  if found then if op.payload is distinct from payload then raise exception 'operation-conflict' using errcode='23505'; end if; return op.result; end if;
  perform strandcue_private.validate_cue_check_observation(p_observation);
  select * into ex from public.protocol_executions where user_id=uid and execution_id=p_execution_id;
  if not found then raise exception 'execution-not-found' using errcode='42501'; end if;
  if ex.status not in ('completed','abandoned') then raise exception 'execution-not-terminal' using errcode='22023'; end if;
  select * into run from public.recommendation_runs where user_id=uid and request_id=ex.recommendation_run_id;
  if not found then raise exception 'run-not-consistent' using errcode='22023'; end if;
  goal := run.input ->> 'goal';
  if goal is null or goal not in ('basic_wash','style_refresh','heat_style','chemical_service_prep') then raise exception 'run-not-consistent' using errcode='22023'; end if;
  steps := strandcue_private.cue_check_confirmed_steps(ex.execution);
  v_timing := p_observation ->> 'timing';
  if (select count(*) from public.cue_checks c where c.user_id=uid and c.execution_id=p_execution_id and c.timing=v_timing) >= 10 then raise exception 'quota-exceeded' using errcode='22023'; end if;
  if exists(select 1 from public.cue_checks c where c.user_id=uid and c.execution_id=p_execution_id and c.timing=v_timing and c.lifecycle='active') then raise exception 'duplicate-active' using errcode='23505'; end if;
  if (p_observation ->> 'observedAt')::timestamptz > now_at then raise exception 'invalid-observation' using errcode='22023'; end if;
  insert into public.cue_checks(user_id,record_id,execution_id,recommendation_run_id,goal,timing,lifecycle,revision,observed_at,received_at,observation,confirmed_steps,execution_status,created_at,updated_at)
    values(uid,rid,p_execution_id,ex.recommendation_run_id,goal,v_timing,'active',1,(p_observation->>'observedAt')::timestamptz,now_at,p_observation,steps,ex.status,now_at,now_at) returning * into row;
  insert into public.cue_check_revisions(user_id,record_id,sequence,kind,observation,received_at) values(uid,rid,1,'create',p_observation,now_at);
  result := strandcue_private.cue_check_receipt(row);
  insert into strandcue_private.cue_check_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload,result);
  return result;
end;
$$;
alter function strandcue_private.cue_check_create_core(uuid,uuid,jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_correct_core(p_operation_id uuid,p_record_id uuid,p_expected_revision integer,p_observation jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := strandcue_private.cue_check_require_owner(); op strandcue_private.cue_check_operations%rowtype; row public.cue_checks%rowtype; head public.cue_check_revisions%rowtype; payload jsonb; result jsonb; now_at timestamptz:=now(); reason text;
begin
  if p_operation_id is null or p_record_id is null or p_expected_revision is null or p_observation is null or p_reason is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  payload:=jsonb_build_object('kind','correct','recordId',p_record_id,'expectedRevision',p_expected_revision,'observation',p_observation,'reason',p_reason);
  select * into op from strandcue_private.cue_check_operations where user_id=uid and operation_id=p_operation_id;
  if found then if op.payload is distinct from payload then raise exception 'operation-conflict' using errcode='23505'; end if; return op.result; end if;
  reason:=btrim(p_reason); if length(reason)<1 or length(reason)>500 then raise exception 'invalid-reason' using errcode='22023'; end if;
  perform strandcue_private.validate_cue_check_observation(p_observation);
  select * into row from public.cue_checks where user_id=uid and record_id=p_record_id for update;
  if not found then raise exception 'record-not-found' using errcode='42501'; end if;
  if row.lifecycle='voided' then raise exception 'record-voided' using errcode='22023'; end if;
  if row.revision<>p_expected_revision then raise exception 'revision-conflict' using errcode='40001'; end if;
  if row.revision>=50 then raise exception 'quota-exceeded' using errcode='22023'; end if;
  if row.received_at>now_at then raise exception 'invalid-receipt-order' using errcode='22023'; end if;
  if p_observation->>'timing' is distinct from row.timing then raise exception 'timing-mismatch' using errcode='22023'; end if;
  if p_observation=row.observation then raise exception 'no-op-correction' using errcode='22023'; end if;
  select * into head from public.cue_check_revisions where record_id=p_record_id order by sequence desc limit 1;
  insert into public.cue_check_revisions(user_id,record_id,sequence,kind,observation,corrects_id,correction_reason,received_at)
    values(uid,p_record_id,row.revision+1,'correct',p_observation,head.id,reason,now_at);
  update public.cue_checks set revision=row.revision+1, observed_at=(p_observation->>'observedAt')::timestamptz, received_at=now_at, observation=p_observation, updated_at=now_at where id=row.id returning * into row;
  result:=strandcue_private.cue_check_receipt(row);
  insert into strandcue_private.cue_check_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload,result);
  return result;
end;
$$;
alter function strandcue_private.cue_check_correct_core(uuid,uuid,integer,jsonb,text) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_void_core(p_operation_id uuid,p_record_id uuid,p_expected_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=strandcue_private.cue_check_require_owner(); op strandcue_private.cue_check_operations%rowtype; row public.cue_checks%rowtype; head public.cue_check_revisions%rowtype; payload jsonb; result jsonb; now_at timestamptz:=now(); reason text;
begin
  if p_operation_id is null or p_record_id is null or p_expected_revision is null or p_reason is null then raise exception 'invalid-operation' using errcode='22023'; end if;
  payload:=jsonb_build_object('kind','void','recordId',p_record_id,'expectedRevision',p_expected_revision,'reason',p_reason);
  select * into op from strandcue_private.cue_check_operations where user_id=uid and operation_id=p_operation_id;
  if found then if op.payload is distinct from payload then raise exception 'operation-conflict' using errcode='23505'; end if; return op.result; end if;
  reason:=btrim(p_reason); if length(reason)<1 or length(reason)>500 then raise exception 'invalid-reason' using errcode='22023'; end if;
  select * into row from public.cue_checks where user_id=uid and record_id=p_record_id for update;
  if not found then raise exception 'record-not-found' using errcode='42501'; end if;
  if row.lifecycle='voided' then raise exception 'record-voided' using errcode='22023'; end if;
  if row.revision<>p_expected_revision then raise exception 'revision-conflict' using errcode='40001'; end if;
  if row.received_at>now_at then raise exception 'invalid-receipt-order' using errcode='22023'; end if;
  select * into head from public.cue_check_revisions where record_id=p_record_id order by sequence desc limit 1;
  insert into public.cue_check_revisions(user_id,record_id,sequence,kind,observation,corrects_id,void_reason,received_at)
    values(uid,p_record_id,row.revision+1,'void',null,head.id,reason,now_at);
  update public.cue_checks set revision=row.revision+1,lifecycle='voided',received_at=now_at,updated_at=now_at where id=row.id returning * into row;
  result:=strandcue_private.cue_check_receipt(row);
  insert into strandcue_private.cue_check_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload,result);
  return result;
end;
$$;
alter function strandcue_private.cue_check_void_core(uuid,uuid,integer,text) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_list_core(p_limit integer,p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=strandcue_private.cue_check_require_owner(); items jsonb; cursor_time timestamptz; cursor_id uuid; more boolean;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid-page' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(p_cursor) k)<>array['id','receivedAt'] then raise exception 'invalid-cursor' using errcode='22023'; end if;
    begin cursor_time:=(p_cursor->>'receivedAt')::timestamptz; cursor_id:=(p_cursor->>'id')::uuid; exception when others then raise exception 'invalid-cursor' using errcode='22023'; end;
  end if;
  with selected as (select c.* from public.cue_checks c where c.user_id=uid and (p_cursor is null or p_cursor='null'::jsonb or (c.received_at,c.id)<(cursor_time,cursor_id)) order by c.received_at desc,c.id desc limit p_limit+1), numbered as (select *,row_number() over(order by received_at desc,id desc) n from selected)
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId',record_id,'executionId',execution_id,'recommendationRunId',recommendation_run_id,
    'goal',goal,'timing',timing,'lifecycle',lifecycle,'revision',revision,
    'observedAt',observation->>'observedAt','receivedAt',received_at,'observation',observation,
    'confirmedSteps',confirmed_steps,'executionStatus',execution_status,'createdAt',created_at,'updatedAt',updated_at)
    order by received_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into items,more from numbered;
  if more then return jsonb_build_object('items',items,'nextCursor',jsonb_build_object('receivedAt',(items->(p_limit-1))->>'receivedAt','id',(select id from public.cue_checks where record_id=((items->(p_limit-1))->>'recordId')::uuid))); end if;
  return jsonb_build_object('items',items,'nextCursor',null);
end;
$$;
alter function strandcue_private.cue_check_list_core(integer,jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.cue_check_detail_core(p_record_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=strandcue_private.cue_check_require_owner(); row public.cue_checks%rowtype; revisions jsonb;
begin
  if p_record_id is null then raise exception 'record-not-found' using errcode='42501'; end if;
  select * into row from public.cue_checks where user_id=uid and record_id=p_record_id;
  if not found then raise exception 'record-not-found' using errcode='42501'; end if;
  with chain as (
    select r.*,lead(r.kind) over(order by r.sequence) next_kind
    from public.cue_check_revisions r where r.record_id=p_record_id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'revisionId',r.id,'sequence',r.sequence,'kind',r.kind,'observation',r.observation,'correctsId',r.corrects_id,
    'correctionReason',r.correction_reason,'voidReason',r.void_reason,'receivedAt',r.received_at,
    'state',case when r.kind='void' then null when r.next_kind='void' then 'voided' when r.next_kind='correct' then 'corrected' else row.lifecycle end)
    order by r.sequence),'[]'::jsonb) into revisions from chain r;
  return strandcue_private.cue_check_receipt(row)||jsonb_build_object('revisions',revisions);
end;
$$;
alter function strandcue_private.cue_check_detail_core(uuid) owner to strandcue_mutator;

create or replace function public.record_cue_check(p_operation_id uuid,p_execution_id uuid,p_observation jsonb) returns jsonb language sql security invoker set search_path='' as $$ select strandcue_private.cue_check_create_core(p_operation_id,p_execution_id,p_observation) $$;
create or replace function public.correct_cue_check(p_operation_id uuid,p_record_id uuid,p_expected_revision integer,p_observation jsonb,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select strandcue_private.cue_check_correct_core(p_operation_id,p_record_id,p_expected_revision,p_observation,p_reason) $$;
create or replace function public.void_cue_check(p_operation_id uuid,p_record_id uuid,p_expected_revision integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$ select strandcue_private.cue_check_void_core(p_operation_id,p_record_id,p_expected_revision,p_reason) $$;
create or replace function public.list_cue_checks(p_limit integer,p_cursor jsonb) returns jsonb language sql security invoker set search_path='' as $$ select strandcue_private.cue_check_list_core(p_limit,p_cursor) $$;
create or replace function public.get_cue_check(p_record_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select strandcue_private.cue_check_detail_core(p_record_id) $$;

alter function public.record_cue_check(uuid,uuid,jsonb) owner to migration_admin;
alter function public.correct_cue_check(uuid,uuid,integer,jsonb,text) owner to migration_admin;
alter function public.void_cue_check(uuid,uuid,integer,text) owner to migration_admin;
alter function public.list_cue_checks(integer,jsonb) owner to migration_admin;
alter function public.get_cue_check(uuid) owner to migration_admin;

-- Extend the existing export implementation without copying its large,
-- already-reviewed owner-data query. The renamed function remains the base;
-- this layer adds Cue Check rows, revisions, schema versions and counts.
alter function strandcue_private.export_build_csv(uuid) rename to export_build_csv_before_cue_checks;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  base jsonb;
  checks_csv text;
  revisions_csv text;
  versions_csv text;
begin
  base := strandcue_private.export_build_csv_before_cue_checks(p_uid);
  select 'id,user_id,record_id,execution_id,recommendation_run_id,goal,timing,lifecycle,revision,observed_at,received_at,observation,confirmed_steps,execution_status,created_at,updated_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(c.id::text)||','||strandcue_private.csv_quote(c.user_id::text)||','||strandcue_private.csv_quote(c.record_id::text)||','||strandcue_private.csv_quote(c.execution_id::text)||','||strandcue_private.csv_quote(c.recommendation_run_id::text)||','||strandcue_private.csv_quote(c.goal)||','||strandcue_private.csv_quote(c.timing)||','||strandcue_private.csv_quote(c.lifecycle)||','||strandcue_private.csv_quote(c.revision::text)||','||strandcue_private.csv_quote(c.observed_at::text)||','||strandcue_private.csv_quote(c.received_at::text)||','||strandcue_private.csv_quote(c.observation::text)||','||strandcue_private.csv_quote(c.confirmed_steps::text)||','||strandcue_private.csv_quote(c.execution_status)||','||strandcue_private.csv_quote(c.created_at::text)||','||strandcue_private.csv_quote(c.updated_at::text), chr(10) order by c.received_at,c.id),'')
    into checks_csv from public.cue_checks c where c.user_id=p_uid;
  select 'id,user_id,record_id,sequence,kind,observation,corrects_id,correction_reason,void_reason,received_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text)||','||strandcue_private.csv_quote(r.user_id::text)||','||strandcue_private.csv_quote(r.record_id::text)||','||strandcue_private.csv_quote(r.sequence::text)||','||strandcue_private.csv_quote(r.kind)||','||strandcue_private.csv_quote(r.observation::text)||','||strandcue_private.csv_quote(r.corrects_id::text)||','||strandcue_private.csv_quote(r.correction_reason)||','||strandcue_private.csv_quote(r.void_reason)||','||strandcue_private.csv_quote(r.received_at::text), chr(10) order by r.received_at,r.record_id,r.sequence),'')
    into revisions_csv from public.cue_check_revisions r where r.user_id=p_uid;
  versions_csv := 'family,version'||chr(10)||'export,5'||chr(10)||'consentRecords,1'||chr(10)||'recommendationRuns,1'||chr(10)||'protocolExecutions,2'||chr(10)||'protocolExecutionEvents,1'||chr(10)||'cueChecks,1'||chr(10)||'cueCheckRevisions,1';
  return jsonb_set(base,'{files}',(base->'files')||jsonb_build_object(
    'cue_checks.csv',checks_csv,'cue_check_revisions.csv',revisions_csv,'schema_versions.csv',versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

alter function strandcue_private.request_export(uuid,text) rename to request_export_before_cue_checks;

create or replace function strandcue_private.request_export(p_operation_id uuid,p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  result jsonb;
  job_id uuid;
  v_document jsonb;
  cue_count integer;
begin
  result := strandcue_private.request_export_before_cue_checks(p_operation_id,p_format);
  job_id := (result->>'jobId')::uuid;
  select j.document into v_document from public.export_jobs j where j.id=job_id and j.owner=uid for update;
  select (select count(*) from public.cue_checks c where c.user_id=uid)
       + (select count(*) from public.cue_check_revisions r where r.user_id=uid) into cue_count;
  if p_format='json' then
    v_document := v_document || jsonb_build_object(
      'schemaVersions',(v_document->'schemaVersions')||jsonb_build_object('export',5,'cueChecks',1,'cueCheckRevisions',1),
      'cueChecks',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object(
        'revisions',(select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence),'[]'::jsonb)
          from public.cue_check_revisions r where r.user_id=uid and r.record_id=c.record_id)) order by c.received_at,c.id),'[]'::jsonb)
        from public.cue_checks c where c.user_id=uid));
  end if;
  update public.export_jobs set document=v_document,record_count=(result->>'recordCount')::integer+cue_count where id=job_id;
  return result||jsonb_build_object('recordCount',(result->>'recordCount')::integer+cue_count);
end;
$$;
alter function strandcue_private.request_export(uuid,text) owner to strandcue_mutator;

revoke all on table public.cue_checks,public.cue_check_revisions from public,anon,authenticated;
grant select on table public.cue_checks,public.cue_check_revisions to authenticated;
grant select,insert,update on table public.cue_checks to strandcue_mutator;
grant select,insert on table public.cue_check_revisions to strandcue_mutator;
revoke all on table strandcue_private.cue_check_operations from public,anon,authenticated;
grant select,insert on table strandcue_private.cue_check_operations to strandcue_mutator;

revoke all on function strandcue_private.validate_cue_check_observation(jsonb),strandcue_private.cue_check_confirmed_steps(jsonb),strandcue_private.cue_check_receipt(public.cue_checks),strandcue_private.cue_check_require_owner() from public,anon,authenticated;
revoke all on function strandcue_private.cue_check_revision_immutable(),strandcue_private.cue_check_binding_immutable() from public,anon,authenticated;
grant execute on function strandcue_private.validate_cue_check_observation(jsonb),strandcue_private.cue_check_confirmed_steps(jsonb),strandcue_private.cue_check_receipt(public.cue_checks),strandcue_private.cue_check_require_owner() to strandcue_mutator;
revoke all on function strandcue_private.cue_check_create_core(uuid,uuid,jsonb),strandcue_private.cue_check_correct_core(uuid,uuid,integer,jsonb,text),strandcue_private.cue_check_void_core(uuid,uuid,integer,text),strandcue_private.cue_check_list_core(integer,jsonb),strandcue_private.cue_check_detail_core(uuid) from public,anon,authenticated;
grant execute on function strandcue_private.cue_check_create_core(uuid,uuid,jsonb),strandcue_private.cue_check_correct_core(uuid,uuid,integer,jsonb,text),strandcue_private.cue_check_void_core(uuid,uuid,integer,text),strandcue_private.cue_check_list_core(integer,jsonb),strandcue_private.cue_check_detail_core(uuid) to authenticated,strandcue_mutator;
revoke all on function public.record_cue_check(uuid,uuid,jsonb),public.correct_cue_check(uuid,uuid,integer,jsonb,text),public.void_cue_check(uuid,uuid,integer,text),public.list_cue_checks(integer,jsonb),public.get_cue_check(uuid) from public,anon,authenticated;
grant execute on function public.record_cue_check(uuid,uuid,jsonb),public.correct_cue_check(uuid,uuid,integer,jsonb,text),public.void_cue_check(uuid,uuid,integer,text),public.list_cue_checks(integer,jsonb),public.get_cue_check(uuid) to authenticated;
revoke all on function strandcue_private.export_build_csv_before_cue_checks(uuid),strandcue_private.export_build_csv(uuid),strandcue_private.request_export_before_cue_checks(uuid,text),strandcue_private.request_export(uuid,text) from public,anon,authenticated;
grant execute on function strandcue_private.export_build_csv_before_cue_checks(uuid),strandcue_private.export_build_csv(uuid),strandcue_private.request_export_before_cue_checks(uuid,text),strandcue_private.request_export(uuid,text) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid,text) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

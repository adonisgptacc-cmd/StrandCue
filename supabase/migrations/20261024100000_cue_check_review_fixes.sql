-- Increment 4 review fixes (forward-only; the committed Cue Check migration is untouched).
-- 1. Pages are keyed on the immutable creation instant, so a correction or removal made
--    elsewhere cannot move a record past an owner's cursor.
-- 2. A missing observation timing is rejected with the stable code, and validation is STABLE.
-- 3. The head row cannot rewrite derived facts or return from removed to active.
-- 4. Replaying an export operation returns the stored receipt untouched.

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


create or replace function strandcue_private.validate_cue_check_observation(p_observation jsonb)
returns void language plpgsql stable set search_path = '' as $$
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
  if timing is null or timing not in ('immediate','delayed') or not (p_observation ? 'observedAt') then
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

create index if not exists cue_checks_owner_created on public.cue_checks(user_id, created_at desc, id desc);

create or replace function strandcue_private.cue_check_list_core(p_limit integer,p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=strandcue_private.cue_check_require_owner(); items jsonb; cursor_time timestamptz; cursor_id uuid; more boolean;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid-page' using errcode='22023'; end if;
  if p_cursor is not null and p_cursor<>'null'::jsonb then
    if jsonb_typeof(p_cursor)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(p_cursor) k)<>array['createdAt','id'] then raise exception 'invalid-cursor' using errcode='22023'; end if;
    begin cursor_time:=(p_cursor->>'createdAt')::timestamptz; cursor_id:=(p_cursor->>'id')::uuid; exception when others then raise exception 'invalid-cursor' using errcode='22023'; end;
  end if;
  with selected as (select c.* from public.cue_checks c where c.user_id=uid and (p_cursor is null or p_cursor='null'::jsonb or (c.created_at,c.id)<(cursor_time,cursor_id)) order by c.created_at desc,c.id desc limit p_limit+1), numbered as (select *,row_number() over(order by created_at desc,id desc) n from selected)
  select coalesce(jsonb_agg(jsonb_build_object(
    'recordId',record_id,'executionId',execution_id,'recommendationRunId',recommendation_run_id,
    'goal',goal,'timing',timing,'lifecycle',lifecycle,'revision',revision,
    'observedAt',observation->>'observedAt','receivedAt',received_at,'observation',observation,
    'confirmedSteps',confirmed_steps,'executionStatus',execution_status,'createdAt',created_at,'updatedAt',updated_at)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into items,more from numbered;
  if more then return jsonb_build_object('items',items,'nextCursor',jsonb_build_object('createdAt',(items->(p_limit-1))->>'createdAt','id',(select id from public.cue_checks where record_id=((items->(p_limit-1))->>'recordId')::uuid))); end if;
  return jsonb_build_object('items',items,'nextCursor',null);
end;
$$;
alter function strandcue_private.cue_check_list_core(integer,jsonb) owner to strandcue_mutator;

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
     or old.timing is distinct from new.timing
     or old.goal is distinct from new.goal
     or old.confirmed_steps is distinct from new.confirmed_steps
     or old.execution_status is distinct from new.execution_status
     or old.created_at is distinct from new.created_at
     or (old.lifecycle = 'voided' and new.lifecycle <> 'voided') then
    raise exception 'cue-check-binding-immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
alter function strandcue_private.cue_check_binding_immutable() owner to strandcue_mutator;

create policy export_operation_result_update on strandcue_private.export_operations for update to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid())) with check (user_id = (select strandcue_private.request_uid()));
grant update(result) on strandcue_private.export_operations to strandcue_mutator;

create or replace function strandcue_private.request_export(p_operation_id uuid,p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  result jsonb;
  adjusted jsonb;
  job_id uuid;
  v_document jsonb;
  cue_count integer;
begin
  -- A replay returns the receipt stored with the first request, so an export
  -- that was already issued never changes when records change afterwards.
  if uid is not null and p_operation_id is not null and exists (
    select 1 from strandcue_private.export_operations o where o.user_id = uid and o.operation_id = p_operation_id) then
    return strandcue_private.request_export_before_cue_checks(p_operation_id,p_format);
  end if;
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
  adjusted := result||jsonb_build_object('recordCount',(result->>'recordCount')::integer+cue_count);
  update public.export_jobs set document=v_document,record_count=(adjusted->>'recordCount')::integer where id=job_id;
  update strandcue_private.export_operations set result=adjusted where user_id=uid and operation_id=p_operation_id;
  return adjusted;
end;
$$;
alter function strandcue_private.request_export(uuid,text) owner to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

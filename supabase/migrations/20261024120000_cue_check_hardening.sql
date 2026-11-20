-- Increment 5 Task I5.0: remaining Cue Check hardening (forward-only; committed migrations untouched).
-- 1. The head row can only change through the append-only revision path: observation, lifecycle,
--    revision and observed_at changes need revision = old + 1 and a matching revision row.
-- 2. TRUNCATE of the revision history is refused while any history exists (a profile cascade included).
-- 3. A Cue Check is only created from a trusted recommendation run.
-- 4. Create, correct and void take an owner-and-operation advisory lock, so concurrent identical retries
--    converge on the stored receipt; creates for one routine and timing are serialised and a unique
--    violation is reported with the stable duplicate-active code, never as a raw constraint error.

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

create or replace function strandcue_private.cue_check_head_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  rev public.cue_check_revisions%rowtype;
begin
  if new.observation is not distinct from old.observation and new.lifecycle is not distinct from old.lifecycle
     and new.revision is not distinct from old.revision and new.observed_at is not distinct from old.observed_at then
    return new;
  end if;
  if new.revision is distinct from old.revision + 1 then
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  select * into rev from public.cue_check_revisions r where r.record_id = new.record_id and r.sequence = new.revision;
  if not found or rev.user_id is distinct from new.user_id then
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  if rev.kind = 'correct' then
    if old.lifecycle <> 'active' or new.lifecycle <> 'active'
       or new.observation is distinct from rev.observation
       or new.observed_at is distinct from (rev.observation ->> 'observedAt')::timestamptz then
      raise exception 'cue-check-head-invalid' using errcode = 'P0001';
    end if;
  elsif rev.kind = 'void' then
    if old.lifecycle <> 'active' or new.lifecycle <> 'voided'
       or new.observation is distinct from old.observation or new.observed_at is distinct from old.observed_at then
      raise exception 'cue-check-head-invalid' using errcode = 'P0001';
    end if;
  else
    raise exception 'cue-check-head-invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cue_checks_head_guard on public.cue_checks;
create trigger cue_checks_head_guard before update on public.cue_checks
  for each row execute function strandcue_private.cue_check_head_guard();

-- Row security is off inside the guard so it sees every row; a caller without that right fails closed.
create or replace function strandcue_private.cue_check_refuse_truncate()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
declare
  v_has boolean;
begin
  begin
    select exists(select 1 from public.cue_check_revisions) into v_has;
  exception when others then
    v_has := true;
  end;
  if v_has then
    raise exception 'cue-check-revision-immutable' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
drop trigger if exists cue_check_revisions_truncate on public.cue_check_revisions;
create trigger cue_check_revisions_truncate before truncate on public.cue_check_revisions
  for each statement execute function strandcue_private.cue_check_refuse_truncate();

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
  -- One owner and operation at a time: a concurrent identical retry waits here, then replays the stored receipt.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':cue-op:' || p_operation_id::text, 0));
  payload := jsonb_build_object('kind','create','executionId',p_execution_id,'observation',p_observation);
  select * into op from strandcue_private.cue_check_operations where user_id=uid and operation_id=p_operation_id;
  if found then if op.payload is distinct from payload then raise exception 'operation-conflict' using errcode='23505'; end if; return op.result; end if;
  perform strandcue_private.validate_cue_check_observation(p_observation);
  select * into ex from public.protocol_executions where user_id=uid and execution_id=p_execution_id;
  if not found then raise exception 'execution-not-found' using errcode='42501'; end if;
  if ex.status not in ('completed','abandoned') then raise exception 'execution-not-terminal' using errcode='22023'; end if;
  select * into run from public.recommendation_runs where user_id=uid and request_id=ex.recommendation_run_id;
  if not found then raise exception 'run-not-consistent' using errcode='22023'; end if;
  if run.trusted is not true then raise exception 'run-not-consistent' using errcode='22023'; end if;
  goal := run.input ->> 'goal';
  if goal is null or goal not in ('basic_wash','style_refresh','heat_style','chemical_service_prep') then raise exception 'run-not-consistent' using errcode='22023'; end if;
  steps := strandcue_private.cue_check_confirmed_steps(ex.execution);
  v_timing := p_observation ->> 'timing';
  -- Serialise creates for one routine and timing, so the quota and one-active checks below cannot race.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':cue-exec:' || p_execution_id::text || ':' || v_timing, 0));
  if (select count(*) from public.cue_checks c where c.user_id=uid and c.execution_id=p_execution_id and c.timing=v_timing) >= 10 then raise exception 'quota-exceeded' using errcode='22023'; end if;
  if exists(select 1 from public.cue_checks c where c.user_id=uid and c.execution_id=p_execution_id and c.timing=v_timing and c.lifecycle='active') then raise exception 'duplicate-active' using errcode='23505'; end if;
  if (p_observation ->> 'observedAt')::timestamptz > now_at then raise exception 'invalid-observation' using errcode='22023'; end if;
  begin
    insert into public.cue_checks(user_id,record_id,execution_id,recommendation_run_id,goal,timing,lifecycle,revision,observed_at,received_at,observation,confirmed_steps,execution_status,created_at,updated_at)
      values(uid,rid,p_execution_id,ex.recommendation_run_id,goal,v_timing,'active',1,(p_observation->>'observedAt')::timestamptz,now_at,p_observation,steps,ex.status,now_at,now_at) returning * into row;
  exception when unique_violation then
    raise exception 'duplicate-active' using errcode='23505';
  end;
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
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':cue-op:' || p_operation_id::text, 0));
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
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':cue-op:' || p_operation_id::text, 0));
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

revoke all on function strandcue_private.cue_check_head_guard(), strandcue_private.cue_check_refuse_truncate() from public, anon, authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

-- Bind one assessed heat step to the reviewed rule, exact owner facts, and
-- the same publication/registry locks used by withdrawal.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant create on schema public to strandcue_mutator;
-- The publication trigger calls a private reviewer helper. Run it with the
-- mutator owner, since local Postgres callers have no direct helper grant.
alter function strandcue_private.heat_capability_guard() security definer;

create function strandcue_private.heat_bound_steps_valid(
  p_owner uuid, p_assessment public.heat_coach_assessments,
  p_rule jsonb, p_registry_id uuid, p_registry_digest text, p_decision jsonb
) returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_step jsonb;
  v_heat jsonb;
  v_tool jsonb;
  v_product jsonb;
  v_selected jsonb := p_assessment.result->'selected';
  v_tool_id uuid;
  v_tool_version uuid;
  v_product_id uuid;
  v_product_version uuid;
begin
  if jsonb_typeof(p_decision->'steps') <> 'array'
    or not strandcue_private.heat_bound_products_valid(p_owner,p_assessment.input,p_decision)
    then return false; end if;
  if p_assessment.status='no_heat' then
    return not exists(select 1 from jsonb_array_elements(p_decision->'steps') s
      where s->>'action' not in ('apply','wait','rinse','leave_in')
        or coalesce(s->'toolId','null'::jsonb)<>'null'::jsonb
        or coalesce(s->'toolVersionId','null'::jsonb)<>'null'::jsonb
        or s ? 'heatActionRef' or s ? 'heatPrescription');
  end if;
  -- A lower-heat verdict needs a separately bound explicit owner choice.
  if p_assessment.status <> 'appropriate'
    or p_assessment.result->>'state' is distinct from p_assessment.status
    or strandcue_private.heat_evaluate(p_assessment.input,p_rule) is distinct from p_assessment.result
    or jsonb_typeof(v_selected)<>'object'
    or v_selected->>'method' is null or v_selected->>'method'='unheated'
    or jsonb_typeof(v_selected->'temperature')<>'object'
    or jsonb_typeof(v_selected->'passes')<>'number'
    or jsonb_typeof(v_selected->'durationMinutes')<>'number'
    or jsonb_typeof(v_selected->'zones')<>'array'
    or (select count(*) from jsonb_array_elements(p_decision->'steps') s where s->>'action'='heat')<>1
    then return false; end if;
  for v_step in select value from jsonb_array_elements(p_decision->'steps') loop
    if v_step->>'action'='heat' then
      v_heat := v_step;
    elsif v_step->>'action' not in ('apply','wait','rinse','leave_in')
      or v_step ? 'heatActionRef' or v_step ? 'heatPrescription'
      or coalesce(v_step->'toolId','null'::jsonb)<>'null'::jsonb
      or coalesce(v_step->'toolVersionId','null'::jsonb)<>'null'::jsonb
      then return false;
    end if;
  end loop;
  if jsonb_typeof(v_heat->'heatActionRef')<>'object'
    or (v_heat->'heatActionRef') - array['publicationId','publicationDigest']<>'{}'::jsonb
    or v_heat#>>'{heatActionRef,publicationId}' is distinct from p_assessment.publication_id::text
    or v_heat#>>'{heatActionRef,publicationDigest}' is distinct from p_assessment.publication_digest
    or v_heat->'heatPrescription' is distinct from v_selected
    or coalesce(v_heat->'productId','null'::jsonb)<>'null'::jsonb
    or coalesce(v_heat->'productVersionId','null'::jsonb)<>'null'::jsonb
    or coalesce(v_heat->>'toolId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(v_heat->>'toolVersionId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then return false; end if;
  v_tool_id := (v_heat->>'toolId')::uuid;
  v_tool_version := (v_heat->>'toolVersionId')::uuid;
  if p_assessment.input#>>'{request,toolOwnerItemId}' is distinct from v_tool_id::text
    or (select count(*) from jsonb_array_elements(p_assessment.input#>'{preparedInput,tools}') t
      where t->>'ownerItemId'=v_tool_id::text)<>1 then return false; end if;
  select t into v_tool from jsonb_array_elements(p_assessment.input#>'{preparedInput,tools}') t
    where t->>'ownerItemId'=v_tool_id::text;
  if v_tool->>'identity'<>'exact' or v_tool->>'review'<>'reviewed'
    or v_tool->>'versionId' is distinct from v_tool_version::text
    or v_tool->'satisfiesExactCapability'<>'true'::jsonb
    or not (v_tool->'verifiedCapabilities' ? 'heat-tool')
    or v_tool#>>'{ownerFacts,heatMethods,state}'<>'recorded'
    or not (v_tool#>'{ownerFacts,heatMethods,methods}' ? (v_selected->>'method'))
    or v_tool#>>'{ownerFacts,settings,state}'<>'recorded'
    or not exists(select 1 from jsonb_array_elements(v_tool#>'{ownerFacts,settings,recordedTemperatures}') t
      where t->'value'=v_selected#>'{temperature,value}'
        and t->'unit'=v_selected#>'{temperature,unit}'
        and (v_selected->'setting'='null'::jsonb or t->'label'=v_selected->'setting'))
    then return false; end if;
  -- Source revision is locked by the trusted writer before this read. An
  -- owner correction cannot commit until that writer commits; a row lock
  -- here would invert the correction trigger's item -> revision lock order.
  perform 1 from public.user_tools t where t.id=v_tool_id and t.owner=p_owner
    and t.version_id=v_tool_version and t.availability='available'
    and t.matched and t.match_confirmed;
  if not found then return false; end if;
  perform 1 from strandcue_private.heat_capability_registry c
    where c.publication_id=p_registry_id and c.registry_digest=p_registry_digest
      and c.kind='tool' and c.version_id=v_tool_version and c.capability='heat-tool';
  if not found then return false; end if;
  if p_rule->>'requiredProductCapability' is not null then
    if coalesce(p_assessment.input#>>'{request,productOwnerItemId}','') !~*
      '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
    v_product_id := (p_assessment.input#>>'{request,productOwnerItemId}')::uuid;
    if (select count(*) from jsonb_array_elements(p_assessment.input#>'{preparedInput,products}') p
      where p->>'ownerItemId'=v_product_id::text)<>1 then return false; end if;
    select p into v_product from jsonb_array_elements(p_assessment.input#>'{preparedInput,products}') p
      where p->>'ownerItemId'=v_product_id::text;
    if v_product->>'identity'<>'exact' or v_product->>'review'<>'reviewed'
      or v_product->'satisfiesExactCapability'<>'true'::jsonb
      or not (v_product->'verifiedCapabilities' ? (p_rule->>'requiredProductCapability'))
      or coalesce(v_product->>'versionId','') !~*
        '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
    v_product_version := (v_product->>'versionId')::uuid;
    if not exists(select 1 from jsonb_array_elements(p_decision->'steps') s
      where s->>'action'='apply' and (s->>'position')::integer<(v_heat->>'position')::integer
        and s->>'productId'=v_product_id::text and s->>'productVersionId'=v_product_version::text
        and coalesce(s->'toolId','null'::jsonb)='null'::jsonb
        and coalesce(s->'toolVersionId','null'::jsonb)='null'::jsonb) then return false; end if;
    perform 1 from public.user_products p where p.id=v_product_id and p.owner=p_owner
      and p.version_id=v_product_version and p.availability='available'
      and p.matched and p.match_confirmed;
    if not found then return false; end if;
    perform 1 from strandcue_private.heat_capability_registry c
      where c.publication_id=p_registry_id and c.registry_digest=p_registry_digest
        and c.kind='product' and c.version_id=v_product_version
        and c.capability=p_rule->>'requiredProductCapability';
    if not found then return false; end if;
  end if;
  return true;
exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range
  or null_value_not_allowed then return false;
end;
$$;
revoke all on function strandcue_private.heat_bound_steps_valid(uuid,public.heat_coach_assessments,jsonb,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function strandcue_private.heat_bound_steps_valid(uuid,public.heat_coach_assessments,jsonb,uuid,text,jsonb)
  to strandcue_mutator;

create function strandcue_private.assessed_heat_decision_valid(p_owner uuid,p_decision jsonb)
returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_binding jsonb := p_decision->'heatAssessmentBinding';
  v_assessment public.heat_coach_assessments%rowtype;
  v_rule strandcue_private.heat_rule_publications%rowtype;
  v_registry_id uuid;
  v_registry_digest text;
begin
  if jsonb_typeof(v_binding)<>'object'
    or v_binding - array['assessmentId','sourceFingerprint','publicationId','publicationDigest']<>'{}'::jsonb
    or not (v_binding ?& array['assessmentId','sourceFingerprint','publicationId','publicationDigest'])
    or coalesce(v_binding->>'assessmentId','') !~*
      '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(v_binding->>'publicationId','') !~*
      '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then return false; end if;
  select * into v_assessment from public.heat_coach_assessments a
    where a.id=(v_binding->>'assessmentId')::uuid and a.owner=p_owner;
  if not found or v_assessment.source_fingerprint is distinct from v_binding->>'sourceFingerprint'
    or v_assessment.publication_id is distinct from (v_binding->>'publicationId')::uuid
    or v_assessment.publication_digest is distinct from v_binding->>'publicationDigest'
    then return false; end if;
  if not strandcue_private.lock_current_heat_publication(
    v_assessment.publication_id,v_assessment.publication_digest)
    or (strandcue_private.heat_assessment_json(v_assessment,p_owner)->>'stale')::boolean
    then return false; end if;
  select * into v_rule from strandcue_private.heat_rule_publications p
    where p.id=v_assessment.publication_id and p.content_digest=v_assessment.publication_digest
      and p.state='published';
  if not found or not strandcue_private.heat_publication_review_valid(
    v_rule.id,v_rule.content_digest,v_rule.rule,v_rule.review_envelope,statement_timestamp())
    then return false; end if;
  v_registry_id := (v_rule.review_envelope->>'capabilityRegistryId')::uuid;
  v_registry_digest := v_rule.review_envelope->>'capabilityRegistryDigest';
  return strandcue_private.heat_bound_steps_valid(
    p_owner,v_assessment,v_rule.rule,v_registry_id,v_registry_digest,p_decision);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function strandcue_private.assessed_heat_decision_valid(uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function strandcue_private.assessed_heat_decision_valid(uuid,jsonb)
  to strandcue_mutator;

create or replace function strandcue_private.guard_trusted_heat_binding()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_binding jsonb := new.decision->'heatAssessmentBinding';
  v_assessment public.heat_coach_assessments%rowtype;
begin
  if v_binding is null then
    if jsonb_typeof(new.decision->'steps')='array' and exists(
      select 1 from jsonb_array_elements(new.decision->'steps') s
      where s->>'action'='heat' or s ? 'heatActionRef' or s ? 'heatPrescription')
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
    return new;
  end if;
  if new.trusted is distinct from true or new.status<>'ready' or new.source_revision is null
    or coalesce(v_binding->>'assessmentId','') !~*
      '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  select * into v_assessment from public.heat_coach_assessments a
    where a.id=(v_binding->>'assessmentId')::uuid and a.owner=new.user_id;
  if found and (not strandcue_private.lock_current_heat_publication(
      v_assessment.publication_id,v_assessment.publication_digest)
      or (strandcue_private.heat_assessment_json(v_assessment,new.user_id)->>'stale')::boolean)
    then raise exception 'stale-heat-binding' using errcode='22023'; end if;
  if not strandcue_private.assessed_heat_decision_valid(new.user_id,new.decision)
    then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  return new;
end;
$$;

-- The old hold is replaced only after the complete insert/start validator exists.
drop trigger trusted_heat_action_hold on public.recommendation_runs;
drop trigger execution_heat_action_hold on public.protocol_executions;
create function strandcue_private.guard_assessed_execution()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_run public.recommendation_runs%rowtype;
  v_revision bigint;
  v_expected jsonb;
  v_index integer;
begin
  if new.decision->'heatAssessmentBinding' is null then
    if jsonb_typeof(new.decision->'steps')='array' and exists(
      select 1 from jsonb_array_elements(new.decision->'steps') s
      where s->>'action'='heat' or s ? 'heatActionRef' or s ? 'heatPrescription')
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
    return new;
  end if;
  select * into v_run from public.recommendation_runs r
    where r.user_id=new.user_id and r.request_id=new.recommendation_run_id for share;
  if not found or v_run.trusted is distinct from true or new.decision is distinct from v_run.decision
    then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  if new.status::text is distinct from new.execution->>'status'
    then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  if tg_op='INSERT' then
    select revision into v_revision from strandcue_private.guidance_source_revisions
      where user_id=new.user_id for share;
    if v_revision is distinct from v_run.source_revision
      or not strandcue_private.assessed_heat_decision_valid(new.user_id,new.decision)
      then raise exception 'stale-heat-binding' using errcode='22023'; end if;
  end if;
  if tg_op='INSERT' then
    if new.revision<>0 or new.status<>'in_progress'
      or jsonb_typeof(new.execution->'startedAt')<>'string'
      or (new.execution->>'startedAt')::timestamptz > now()+interval '5 minutes'
      or (new.execution->>'startedAt')::timestamptz < now()-interval '24 hours'
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
    v_expected := strandcue_private.build_initial_execution(
      new.execution_id,new.recommendation_run_id,new.decision,
      (new.execution->>'startedAt')::timestamptz);
    if new.execution is distinct from v_expected
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
    return new;
  end if;
  v_expected := strandcue_private.build_initial_execution(
    new.execution_id,new.recommendation_run_id,new.decision,statement_timestamp());
  if jsonb_typeof(new.execution->'steps')<>'array'
    or jsonb_array_length(new.execution->'steps')<>
      jsonb_array_length(v_expected->'steps')
    then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  for v_index in 0..jsonb_array_length(v_expected->'steps')-1 loop
    if new.execution#>array['steps',v_index::text,'planned'] is distinct from
      v_expected#>array['steps',v_index::text,'planned']
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function strandcue_private.guard_assessed_execution()
  from public,anon,authenticated,service_role;
create trigger execution_assessed_heat_guard before insert or update
  on public.protocol_executions for each row
  execute function strandcue_private.guard_assessed_execution();

create or replace function strandcue_private.start_execution_with_source_revision(
  p_operation_id uuid,p_execution_id uuid,p_recommendation_run_id uuid,p_started_at timestamptz
) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_owner uuid := strandcue_private.request_uid();
  v_run public.recommendation_runs%rowtype;
  v_revision bigint;
  v_assessment public.heat_coach_assessments%rowtype;
begin
  if v_owner is null then raise exception 'authentication-required' using errcode='42501'; end if;
  perform 1 from public.profiles where user_id=v_owner and account_status='active';
  if not found then raise exception 'account-not-active' using errcode='42501'; end if;
  select * into v_run from public.recommendation_runs
    where user_id=v_owner and request_id=p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode='42501'; end if;
  if v_run.source_revision is not null then
    perform 1 from strandcue_private.protocol_execution_operations
      where user_id=v_owner and operation_id=p_operation_id;
    if found then return strandcue_private.start_execution(
      p_operation_id,p_execution_id,p_recommendation_run_id,p_started_at); end if;
    select revision into v_revision from strandcue_private.guidance_source_revisions
      where user_id=v_owner for update;
    if v_revision is distinct from v_run.source_revision
      then raise exception 'source-changed' using errcode='22023'; end if;
  end if;
  if v_run.decision->'heatAssessmentBinding' is not null then
    select * into v_assessment from public.heat_coach_assessments a
      where a.id=(v_run.decision#>>'{heatAssessmentBinding,assessmentId}')::uuid
        and a.owner=v_owner;
    if found and v_assessment.status='no_heat' and
      not strandcue_private.heat_bound_products_valid(
        v_owner,v_assessment.input,v_run.decision)
      then raise exception 'invalid-heat-binding' using errcode='22023'; end if;
    if not strandcue_private.assessed_heat_decision_valid(v_owner,v_run.decision)
      then raise exception 'stale-heat-binding' using errcode='22023'; end if;
  end if;
  return strandcue_private.start_execution(
    p_operation_id,p_execution_id,p_recommendation_run_id,p_started_at);
end;
$$;

create or replace function strandcue_private.build_initial_execution(
  p_execution_id uuid,p_run_id uuid,p_decision jsonb,p_started_at timestamptz
) returns jsonb language plpgsql immutable set search_path='' as $$
declare
  v_step jsonb;
  v_planned jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_started text := to_jsonb(p_started_at)#>>'{}';
begin
  for v_step in select jsonb_array_elements(p_decision->'steps') loop
    v_planned := jsonb_build_object(
      'stepId',v_step->>'stepId','position',(v_step->>'position')::integer,
      'action',v_step->>'action',
      'productId',v_step->'productId','productVersionId',v_step->'productVersionId',
      'toolId',v_step->'toolId','toolVersionId',v_step->'toolVersionId',
      'waitSeconds',v_step->'waitSeconds','rinse',v_step->'rinse',
      'reasons',coalesce(v_step->'reasons','[]'::jsonb));
    if v_step->>'action'='heat' then
      v_planned := v_planned || jsonb_build_object(
        'heatActionRef',v_step->'heatActionRef',
        'heatPrescription',v_step->'heatPrescription');
    end if;
    v_steps := v_steps || jsonb_build_object(
      'stepId',v_step->>'stepId','position',(v_step->>'position')::integer,
      'planned',v_planned,
      'state','pending','confirmedAt',null,'deviation',null);
  end loop;
  return jsonb_build_object('executionId',p_execution_id::text,
    'recommendationRunId',p_run_id::text,'startedAt',v_started,'updatedAt',v_started,
    'status','in_progress','steps',v_steps,'finishedAt',null,'closeReason',null);
end;
$$;

-- Edge reads only the exact published, fully reviewed rule.
create function public.get_published_heat_rule_for_today(p_publication_id uuid,p_digest text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  v_row strandcue_private.heat_rule_publications%rowtype;
begin
  if not strandcue_private.lock_current_heat_publication(p_publication_id,p_digest)
    then return null; end if;
  select * into v_row from strandcue_private.heat_rule_publications p
    where p.id=p_publication_id and p.content_digest=p_digest and p.state='published';
  if not found or not strandcue_private.heat_publication_review_valid(
    v_row.id,v_row.content_digest,v_row.rule,v_row.review_envelope,statement_timestamp())
    then return null; end if;
  return jsonb_build_object('publication',v_row.rule,'publicationDigest',v_row.content_digest);
end;
$$;
revoke all on function public.get_published_heat_rule_for_today(uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_published_heat_rule_for_today(uuid,text) to service_role;
alter function strandcue_private.heat_bound_steps_valid(
  uuid,public.heat_coach_assessments,jsonb,uuid,text,jsonb) owner to strandcue_mutator;
alter function strandcue_private.assessed_heat_decision_valid(uuid,jsonb) owner to strandcue_mutator;
alter function strandcue_private.guard_trusted_heat_binding() owner to strandcue_mutator;
alter function strandcue_private.guard_assessed_execution() owner to strandcue_mutator;
alter function public.get_published_heat_rule_for_today(uuid,text) owner to strandcue_mutator;
revoke create on schema public from strandcue_mutator;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

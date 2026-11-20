-- A no-heat protocol may use an owned product. Bind every such step to the
-- version in the immutable assessment snapshot and to the current owner row.
create function strandcue_private.heat_bound_products_valid(
  p_owner uuid, p_assessment_input jsonb, p_decision jsonb)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_step jsonb;
  v_product jsonb;
  v_version jsonb;
begin
  if jsonb_typeof(p_decision->'steps') <> 'array' then return false; end if;
  for v_step in select value from jsonb_array_elements(p_decision->'steps') loop
    if jsonb_typeof(v_step) <> 'object' then return false; end if;
    v_product := coalesce(v_step->'productId', 'null'::jsonb);
    v_version := coalesce(v_step->'productVersionId', 'null'::jsonb);
    if v_product = 'null'::jsonb and v_version = 'null'::jsonb then continue; end if;
    if jsonb_typeof(v_product) <> 'string' or jsonb_typeof(v_version) <> 'string'
       or v_product#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or v_version#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(p_assessment_input#>'{preparedInput,products}') <> 'array' then return false; end if;
    if not (p_assessment_input#>'{preparedInput,products}' @> jsonb_build_array(
       jsonb_build_object('ownerItemId', v_product#>>'{}', 'versionId', v_version#>>'{}')))
       or not exists(select 1 from public.user_products p
         where p.owner=p_owner and p.id=(v_product#>>'{}')::uuid
           and p.version_id=(v_version#>>'{}')::uuid and p.availability='available')
       then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function strandcue_private.heat_bound_products_valid(uuid,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.heat_bound_products_valid(uuid,jsonb,jsonb)
  to strandcue_mutator;

-- The existing binding guard checks owner, publication and capability first.
create function strandcue_private.guard_trusted_heat_products()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_input jsonb;
begin
  if new.decision->'heatAssessmentBinding' is null then return new; end if;
  select a.input into v_input from public.heat_coach_assessments a
    where a.id=(new.decision#>>'{heatAssessmentBinding,assessmentId}')::uuid
      and a.owner=new.user_id;
  if not found or not strandcue_private.heat_bound_products_valid(new.user_id, v_input, new.decision) then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function strandcue_private.guard_trusted_heat_products()
  from public, anon, authenticated, service_role;
create trigger trusted_heat_product_guard before insert on public.recommendation_runs
  for each row execute function strandcue_private.guard_trusted_heat_products();

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
create or replace function strandcue_private.start_execution_with_source_revision(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  run public.recommendation_runs%rowtype;
  current_revision bigint;
  binding jsonb;
  assessment public.heat_coach_assessments%rowtype;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into run from public.recommendation_runs
    where user_id = owner_id and request_id = p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;
  if run.source_revision is not null then
    perform 1 from strandcue_private.protocol_execution_operations
      where user_id = owner_id and operation_id = p_operation_id;
    if found then
      return strandcue_private.start_execution(
        p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
    end if;
    select revision into current_revision
      from strandcue_private.guidance_source_revisions
      where user_id = owner_id for update;
    if current_revision is distinct from run.source_revision then
      raise exception 'source-changed' using errcode = '22023';
    end if;
  end if;
  binding := run.decision -> 'heatAssessmentBinding';
  if binding is not null then
    if coalesce(binding ->> 'assessmentId','') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
    select * into assessment from public.heat_coach_assessments a
      where a.id = (binding ->> 'assessmentId')::uuid and a.owner = owner_id;
    if not found or assessment.status <> 'no_heat'
       or assessment.source_fingerprint is distinct from binding ->> 'sourceFingerprint'
       or assessment.publication_id is distinct from (binding ->> 'publicationId')::uuid
       or assessment.publication_digest is distinct from binding ->> 'publicationDigest' then
      raise exception 'stale-heat-binding' using errcode = '22023';
    end if;
    if not strandcue_private.lock_current_heat_publication(
         assessment.publication_id, assessment.publication_digest)
       or (strandcue_private.heat_assessment_json(assessment, owner_id)->>'stale')::boolean then
      raise exception 'stale-heat-binding' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(run.decision -> 'steps') step
        where step ->> 'action' not in ('apply','wait','rinse','leave_in')
           or coalesce(step -> 'toolId','null'::jsonb) <> 'null'::jsonb
           or coalesce(step -> 'toolVersionId','null'::jsonb) <> 'null'::jsonb
    ) or not strandcue_private.heat_bound_products_valid(owner_id, assessment.input, run.decision) then
      raise exception 'invalid-heat-binding' using errcode = '22023';
    end if;
  end if;
  return strandcue_private.start_execution(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_started_at);
end;
$$;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

-- I6.5: publication withdrawal does not change the guidance source epoch.
-- Recheck the bound assessment under locks immediately before any start write.
create function strandcue_private.lock_current_heat_publication(p_id uuid, p_digest text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform 1 from strandcue_private.heat_rule_publications p
    where p.id = p_id and p.content_digest = p_digest and p.state = 'published' for share;
  return found;
end;
$$;
revoke all on function strandcue_private.lock_current_heat_publication(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.lock_current_heat_publication(uuid, text)
  to strandcue_mutator;

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
    -- A completed operation replays its original receipt after later changes.
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
    if assessment.status = 'no_heat' and exists (
      select 1 from jsonb_array_elements(run.decision -> 'steps') step
        where step ->> 'action' not in ('apply','wait','rinse','leave_in')
           or coalesce(step -> 'toolId','null'::jsonb) <> 'null'::jsonb
           or coalesce(step -> 'toolVersionId','null'::jsonb) <> 'null'::jsonb
    ) then
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

-- I6.5 Task 2: a server-written ready run may cite only an owned, current,
-- eligible Heat Coach assessment and its exact published review identity.
do $$ begin
  execute format('create policy heat_binding_admin_assessment_read on public.heat_coach_assessments for select to %I using (true)', current_user);
  execute format('create policy heat_binding_admin_publication_read on strandcue_private.heat_rule_publications for select to %I using (true)', current_user);
end $$;
grant execute on function strandcue_private.heat_assessment_json(public.heat_coach_assessments, uuid) to current_user;

create function strandcue_private.guard_trusted_heat_binding()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  binding jsonb := new.decision -> 'heatAssessmentBinding';
  assessment public.heat_coach_assessments%rowtype;
  publication strandcue_private.heat_rule_publications%rowtype;
begin
  if binding is null then return new; end if;
  if new.trusted is distinct from true or new.status <> 'ready'
     or new.source_revision is null
     or jsonb_typeof(binding) <> 'object'
     or (select count(*) from jsonb_object_keys(binding)) <> 4
     or not (binding ?& array['assessmentId','sourceFingerprint','publicationId','publicationDigest'])
     or coalesce(binding ->> 'assessmentId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(binding ->> 'publicationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or coalesce(binding ->> 'sourceFingerprint','') !~ '^sha256:[a-f0-9]{64}$'
     or coalesce(binding ->> 'publicationDigest','') !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;

  select * into assessment from public.heat_coach_assessments a
    where a.id = (binding ->> 'assessmentId')::uuid and a.owner = new.user_id for share;
  if not found or assessment.source_fingerprint is distinct from binding ->> 'sourceFingerprint'
     or assessment.publication_id is distinct from (binding ->> 'publicationId')::uuid
     or assessment.publication_digest is distinct from binding ->> 'publicationDigest'
     or assessment.status <> 'no_heat' then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;
  if assessment.status = 'no_heat' and exists (
    select 1 from jsonb_array_elements(new.decision -> 'steps') step
      where step ->> 'action' not in ('apply','wait','rinse','leave_in')
         or coalesce(step -> 'toolId','null'::jsonb) <> 'null'::jsonb
         or coalesce(step -> 'toolVersionId','null'::jsonb) <> 'null'::jsonb
  ) then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;

  -- SHARE conflicts with the UPDATE used to withdraw a publication. The
  -- trusted writer holds this lock until its run insert commits.
  select * into publication from strandcue_private.heat_rule_publications p
    where p.id = assessment.publication_id for share;
  if not found or publication.state <> 'published'
     or publication.content_digest is distinct from assessment.publication_digest
     or (strandcue_private.heat_assessment_json(assessment, new.user_id)->>'stale')::boolean then
    raise exception 'stale-heat-binding' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function strandcue_private.guard_trusted_heat_binding() from public, anon, authenticated, service_role;
create trigger trusted_heat_binding_guard before insert on public.recommendation_runs
  for each row execute function strandcue_private.guard_trusted_heat_binding();

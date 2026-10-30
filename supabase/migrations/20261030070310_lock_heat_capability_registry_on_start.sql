-- A bound start must serialize with withdrawal of the exact reviewed
-- capability registry as well as withdrawal of its rule publication.
create or replace function strandcue_private.lock_current_heat_publication(p_id uuid, p_digest text)
returns boolean language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_review jsonb;
  v_registry_id uuid;
  v_registry_digest text;
begin
  select p.review_envelope into v_review
    from strandcue_private.heat_rule_publications p
    where p.id = p_id and p.content_digest = p_digest and p.state = 'published'
    for share;
  if not found or v_review is null then return false; end if;
  v_registry_id := (v_review->>'capabilityRegistryId')::uuid;
  v_registry_digest := v_review->>'capabilityRegistryDigest';
  if v_registry_id is null or v_registry_digest is null then return false; end if;
  perform 1 from strandcue_private.heat_capability_publications c
    where c.id = v_registry_id and c.content_digest = v_registry_digest
      and c.state = 'published' for share;
  return found;
exception when invalid_text_representation then return false;
end;
$$;

-- The trusted run insert has the same withdrawal boundary as execution start.
create or replace function strandcue_private.guard_trusted_heat_binding()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  binding jsonb := new.decision -> 'heatAssessmentBinding';
  assessment public.heat_coach_assessments%rowtype;
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
  if exists (
    select 1 from jsonb_array_elements(new.decision -> 'steps') step
      where step ->> 'action' not in ('apply','wait','rinse','leave_in')
         or coalesce(step -> 'toolId','null'::jsonb) <> 'null'::jsonb
         or coalesce(step -> 'toolVersionId','null'::jsonb) <> 'null'::jsonb
  ) then
    raise exception 'invalid-heat-binding' using errcode = '22023';
  end if;
  if not strandcue_private.lock_current_heat_publication(
       assessment.publication_id, assessment.publication_digest)
     or (strandcue_private.heat_assessment_json(assessment, new.user_id)->>'stale')::boolean then
    raise exception 'stale-heat-binding' using errcode = '22023';
  end if;
  return new;
end;
$$;

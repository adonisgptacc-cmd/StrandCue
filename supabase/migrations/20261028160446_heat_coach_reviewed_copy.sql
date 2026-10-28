-- The mobile decision can display only the reviewed text from the exact
-- still-published packet used by an assessment owned by the caller.
-- Every executable packet carries the separately reviewed limitations copy.
alter table strandcue_private.heat_rule_publications
  add constraint heat_rule_published_limitations_copy check (
    state <> 'published' or coalesce(review_envelope->'copy' @>
      '[{"copyKey":"heat.limitations"}]'::jsonb, false)
  );

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant create on schema public to strandcue_mutator;

create function strandcue_private.get_heat_coach_reviewed_copy_core(
  p_assessment_id uuid, p_publication_id uuid, p_publication_digest text
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_uid uuid := strandcue_private.heat_require_owner();
  v_assessment public.heat_coach_assessments%rowtype;
  v_publication strandcue_private.heat_rule_publications%rowtype;
  v_copy jsonb;
begin
  select * into v_assessment from public.heat_coach_assessments a
    where a.id=p_assessment_id and a.owner=v_uid;
  if not found then
    raise exception 'assessment-not-found' using errcode='P0001';
  end if;
  if p_publication_id is distinct from v_assessment.publication_id
    or p_publication_digest is distinct from v_assessment.publication_digest then
    raise exception 'publication-mismatch' using errcode='P0001';
  end if;
  if (strandcue_private.heat_assessment_json(v_assessment,v_uid)->>'stale')::boolean then
    raise exception 'publication-mismatch' using errcode='P0001';
  end if;
  select * into v_publication from strandcue_private.heat_rule_publications p
    where p.id=p_publication_id and p.content_digest=p_publication_digest
      and p.state='published';
  if not found or not strandcue_private.heat_publication_review_valid(
    v_publication.id, v_publication.content_digest, v_publication.rule,
    v_publication.review_envelope, statement_timestamp()) then
    raise exception 'publication-mismatch' using errcode='P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'copyKey', row->>'copyKey', 'text', row->>'text') order by row->>'copyKey'), '[]'::jsonb)
    into v_copy from jsonb_array_elements(v_publication.review_envelope->'copy') row;
  return jsonb_build_object('assessmentId',v_assessment.id,
    'publicationId',v_assessment.publication_id,
    'publicationDigest',v_assessment.publication_digest,'copy',v_copy);
end;
$$;

alter function strandcue_private.get_heat_coach_reviewed_copy_core(uuid,uuid,text)
  owner to strandcue_mutator;
revoke all on function strandcue_private.get_heat_coach_reviewed_copy_core(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function strandcue_private.get_heat_coach_reviewed_copy_core(uuid,uuid,text)
  to strandcue_mutator;

create function public.get_heat_coach_reviewed_copy(
  p_assessment_id uuid, p_publication_id uuid, p_publication_digest text
) returns jsonb language sql stable security definer
set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.get_heat_coach_reviewed_copy_core(
    p_assessment_id,p_publication_id,p_publication_digest)
$$;
alter function public.get_heat_coach_reviewed_copy(uuid,uuid,text) owner to strandcue_mutator;
revoke all on function public.get_heat_coach_reviewed_copy(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.get_heat_coach_reviewed_copy(uuid,uuid,text)
  to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke create on schema public from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

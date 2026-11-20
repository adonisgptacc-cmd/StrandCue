-- Bind trusted assessment capture to the exact reviewed capability registry.
-- Replaces only the core function; historical rows and previous migrations are unchanged.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

create or replace function strandcue_private.create_heat_coach_assessment_core(
  p_operation_id uuid,
  p_publication_id uuid,
  p_publication_digest text,
  p_intent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := strandcue_private.heat_require_owner();
  v_payload jsonb;
  v_existing jsonb;
  v_existing_payload jsonb;
  v_publication strandcue_private.heat_rule_publications%rowtype;
  v_capture jsonb;
  v_sources jsonb;
  v_fingerprint text;
  v_input jsonb;
  v_result jsonb;
  v_record public.heat_coach_assessments%rowtype;
  v_response jsonb;
  v_at timestamptz;
begin
  if p_operation_id is null or p_publication_id is null
     or p_publication_digest !~ '^sha256:[a-f0-9]{64}$'
     or not strandcue_private.heat_intent_valid(p_intent) then
    raise exception 'invalid-heat-intent' using errcode='22023';
  end if;

  v_payload := jsonb_build_object(
    'publicationId', p_publication_id,
    'publicationDigest', p_publication_digest,
    'intent', p_intent
  );

  -- One owner-wide lock covers receipts, every publication, convergence and
  -- the quota. A second publication cannot bypass the owner's global limit.
  perform pg_advisory_xact_lock(hashtextextended('heat-assessment:' || v_uid::text, 0));

  select o.payload, o.result
    into v_existing_payload, v_existing
    from strandcue_private.heat_coach_operations o
   where o.owner = v_uid and o.operation_id = p_operation_id;
  if found then
    if v_existing_payload is distinct from v_payload then
      raise exception 'operation-conflict' using errcode='P0001';
    end if;
    select * into v_record
      from public.heat_coach_assessments a
     where a.id = (v_existing->>'assessmentId')::uuid and a.owner = v_uid;
    if not found then
      raise exception 'operation-conflict' using errcode='P0001';
    end if;
    return strandcue_private.heat_assessment_json(v_record, v_uid);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('heat-publication:' || p_publication_id::text, 0));
  select * into v_publication
    from strandcue_private.heat_rule_publications p
   where p.id = p_publication_id;
  if not found or v_publication.state <> 'published' then
    raise exception 'heat-content-pending' using errcode='P0001';
  end if;
  if v_publication.content_digest <> p_publication_digest then
    raise exception 'publication-mismatch' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('heat-capability:' ||
    (v_publication.review_envelope->>'capabilityRegistryId'), 0));
  if not strandcue_private.heat_publication_review_valid(v_publication.id,
      v_publication.content_digest, v_publication.rule, v_publication.review_envelope, statement_timestamp()) then
    raise exception 'heat-content-pending' using errcode='P0001';
  end if;

  v_at := clock_timestamp();
  select strandcue_private.heat_capture_snapshot(v_uid, p_intent, v_at,
    (v_publication.review_envelope->>'capabilityRegistryId')::uuid,
    v_publication.review_envelope->>'capabilityRegistryDigest')
    into v_capture;
  v_sources := v_capture->'sourceRevisions';
  v_input := v_capture->'input';
  v_fingerprint := 'sha256:' || encode(sha256(convert_to(
    v_sources::text || '|' || v_publication.content_digest,
    'UTF8'
  )), 'hex');
  v_result := strandcue_private.heat_evaluate(v_input, v_publication.rule);

  select * into v_record
    from public.heat_coach_assessments a
   where a.owner = v_uid
     and a.publication_id = p_publication_id
     and a.publication_digest = p_publication_digest
     and a.source_revisions = v_sources
     and a.input->'request' = v_input->'request'
     and a.result = v_result
   order by a.created_at desc, a.id desc
   limit 1;
  if found then
    v_response := strandcue_private.heat_assessment_json(v_record, v_uid);
    insert into strandcue_private.heat_coach_operations(owner, operation_id, payload, result)
      values(v_uid, p_operation_id, v_payload, v_response);
    return v_response;
  end if;

  if (select count(*) from public.heat_coach_assessments a where a.owner = v_uid) >= 1000 then
    raise exception 'assessment-quota-exceeded' using errcode='P0001';
  end if;

  insert into public.heat_coach_assessments(
    owner, publication_id, publication_digest, input, result, status,
    source_revisions, source_fingerprint
  ) values (
    v_uid, p_publication_id, p_publication_digest, v_input, v_result,
    v_result->>'state', v_sources, v_fingerprint
  ) returning * into v_record;

  v_response := strandcue_private.heat_assessment_json(v_record, v_uid);
  insert into strandcue_private.heat_coach_operations(owner, operation_id, payload, result)
    values(v_uid, p_operation_id, v_payload, v_response);
  return v_response;
end;
$$;

create or replace function strandcue_private.heat_assessment_json(
  p_row public.heat_coach_assessments, p_uid uuid
)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('assessmentId',p_row.id,'publicationId',p_row.publication_id,
    'publicationDigest',p_row.publication_digest,'input',p_row.input,'result',p_row.result,
    'status',p_row.status,'sourceRevisions',p_row.source_revisions,
    'sourceFingerprint',p_row.source_fingerprint,'createdAt',strandcue_private.heat_iso(p_row.created_at),
    'revision',p_row.revision,
    'stale',p_row.source_revisions is distinct from strandcue_private.heat_source_revisions(p_uid)
      or not exists(select 1 from strandcue_private.heat_rule_publications p
        where p.id=p_row.publication_id and p.content_digest=p_row.publication_digest and p.state='published')
      or exists(select 1 from jsonb_array_elements(coalesce(p_row.input#>'{preparedInput,products}','[]'::jsonb)) item
        where item->>'identity'='exact' and item->>'review'='reviewed'
          and not exists(select 1 from public.product_versions v
            where v.id=(item->>'versionId')::uuid and v.market='ZA' and v.lifecycle='active'))
      or exists(select 1 from jsonb_array_elements(coalesce(p_row.input#>'{preparedInput,tools}','[]'::jsonb)) item
        where item->>'identity'='exact' and item->>'review'='reviewed'
          and not exists(select 1 from public.tool_versions v
            where v.id=(item->>'versionId')::uuid and v.market='ZA' and v.lifecycle='active')))
$$;

alter function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb) owner to strandcue_mutator;
alter function strandcue_private.heat_assessment_json(public.heat_coach_assessments,uuid) owner to strandcue_mutator;
revoke all on function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function strandcue_private.heat_assessment_json(public.heat_coach_assessments,uuid) from public,anon,authenticated;
grant execute on function strandcue_private.create_heat_coach_assessment_core(uuid,uuid,text,jsonb) to authenticated;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
set role strandcue_mutator;

create or replace function strandcue_private.record_engine_ruleset_hash_verification_core(
  p_publication_id uuid, p_packet_digest text, p_content_hash text, p_evaluator_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
  v_existing strandcue_private.engine_ruleset_hash_verifications%rowtype;
  v_request_role text := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claim.role',true),''),
    pg_catalog.current_setting('request.jwt.claims',true)::jsonb->>'role');
begin
  if v_request_role is distinct from 'service_role' then
    raise exception 'engine-ruleset-verification-forbidden' using errcode='42501';
  end if;
  if p_packet_digest !~ '^sha256:[a-f0-9]{64}$'
     or p_content_hash !~ '^sha256:[a-f0-9]{64}$'
     or p_evaluator_version is null or length(p_evaluator_version) not between 1 and 64 then
    raise exception 'engine-ruleset-input-invalid' using errcode='P0001';
  end if;
  select * into v_publication
    from strandcue_private.engine_ruleset_publications p
   where p.id=p_publication_id
   for update;
  if not found or v_publication.state <> 'draft'
     or v_publication.packet_digest is distinct from p_packet_digest
     or v_publication.content_hash is distinct from p_content_hash
     or v_publication.packet #>> '{ref,evaluatorVersion}' is distinct from p_evaluator_version then
    raise exception 'engine-ruleset-draft-mismatch' using errcode='P0001';
  end if;
  insert into strandcue_private.engine_ruleset_hash_verifications(
    publication_id,packet_digest,content_hash,evaluator_version)
  values(p_publication_id,p_packet_digest,p_content_hash,p_evaluator_version)
  on conflict(publication_id) do nothing;
  select * into v_existing
    from strandcue_private.engine_ruleset_hash_verifications v
   where v.publication_id=p_publication_id;
  if (v_existing.packet_digest,v_existing.content_hash,v_existing.evaluator_version)
      is distinct from (p_packet_digest,p_content_hash,p_evaluator_version) then
    raise exception 'engine-ruleset-hash-verification-immutable' using errcode='P0001';
  end if;
  return pg_catalog.jsonb_build_object('publicationId',p_publication_id,
    'packetDigest',v_existing.packet_digest,'contentHash',v_existing.content_hash,
    'evaluatorVersion',v_existing.evaluator_version,'verifiedAt',v_existing.verified_at);
end;
$$;

reset role;
alter function strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text) owner to strandcue_mutator;
revoke all on function strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text)
  to strandcue_mutator;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

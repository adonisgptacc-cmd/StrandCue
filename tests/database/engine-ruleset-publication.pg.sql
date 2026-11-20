-- Local-only smoke proof for generic ruleset approval and successor binding.
-- Run with PowerShell: psql $env:STRANDCUE_LOCAL_DB_URL -v ON_ERROR_STOP=1 -f tests/database/engine-ruleset-publication.pg.sql
-- Wrapped in a rollback so immutable verification evidence and synthetic rows do not persist.

begin;
do $verify$
declare
  v_author uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_parent_id uuid := gen_random_uuid();
  v_child_id uuid := gen_random_uuid();
  v_parent_hash text := 'sha256:' || encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  v_child_hash text := 'sha256:' || encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  v_parent_packet jsonb;
  v_child_packet jsonb;
  v_digest text;
  v_result jsonb;
  v_orphan_packet jsonb;
  v_orphan_hash text;
  v_verification jsonb;
  v_opaque_author_id text;
  v_opaque_reviewer_id text;
begin
  perform set_config('role','postgres',true);
  insert into auth.users(id,email_confirmed_at) values(v_author,now()),(v_reviewer,now());
  insert into strandcue_private.engine_ruleset_reviewers(user_id,qualification)
  values(v_reviewer,'local PostgreSQL synthetic reviewer');
  perform set_config('role','postgres',true);
  perform set_config('role','authenticated',true);

  v_parent_packet := jsonb_build_object(
    'ref',jsonb_build_object('rulesetId','pg-parent','contentHash',v_parent_hash,
      'schemaVersion','1.1.0','evaluatorVersion','1.1.0'),
    'capabilities','[]'::jsonb,
    'rules',jsonb_build_array(jsonb_build_object('ruleId','rule.old','version','1',
      'effects',jsonb_build_array(jsonb_build_object('kind','include_candidate','candidateId','action.old')))));
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  v_result := public.create_engine_ruleset_draft(v_parent_id,v_parent_packet,null);
  v_digest := v_result->>'packetDigest';
  perform public.record_engine_ruleset_review(v_parent_id,v_digest,'author');
  perform set_config('request.jwt.claim.sub',v_reviewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reviewer,'role','authenticated')::text,true);
  perform public.record_engine_ruleset_review(v_parent_id,v_digest,'reviewer');
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  begin
    perform public.record_engine_ruleset_hash_verification(v_parent_id,v_digest,v_parent_hash,'1.1.0');
    raise exception 'expected authenticated hash verification write to be rejected';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.publish_engine_ruleset(v_parent_id,v_digest);
    raise exception 'expected publication without trusted content hash to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-hash-verification-required' then raise; end if;
  end;
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  begin
    perform public.record_engine_ruleset_hash_verification(v_parent_id,v_digest,
      'sha256:' || repeat('f',64),'1.1.0');
    raise exception 'expected false content hash to be rejected by database';
  exception when others then
    if sqlerrm <> 'engine-ruleset-draft-mismatch' then raise; end if;
  end;
  v_verification := public.record_engine_ruleset_hash_verification(v_parent_id,v_digest,v_parent_hash,'1.1.0');
  if v_verification->>'contentHash' <> v_parent_hash then raise exception 'hash verification ledger write failed'; end if;
  perform set_config('role','postgres',true);
  begin
    update strandcue_private.engine_ruleset_hash_verifications
       set content_hash='sha256:' || repeat('e',64)
     where publication_id=v_parent_id;
    raise exception 'expected verified content hash mutation to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-hash-verification-immutable' then raise; end if;
  end;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  perform public.publish_engine_ruleset(v_parent_id,v_digest);

  v_child_packet := jsonb_build_object(
    'ref',jsonb_build_object('rulesetId','pg-child','contentHash',v_child_hash,
      'schemaVersion','1.1.0','evaluatorVersion','1.1.0'),
    'capabilities','[]'::jsonb,
    'rules',jsonb_build_array(jsonb_build_object('ruleId','rule.new','version','2',
      'effects',jsonb_build_array(jsonb_build_object('kind','include_candidate','candidateId','action.old')),
      'successorOf',jsonb_build_object('parentRulesetHash',v_parent_hash,
        'withdrawnRuleId','rule.old','withdrawnRuleVersion','1'))),
    'successorReview',jsonb_build_object('parentRulesetHash',v_parent_hash,
      'withdrawals',jsonb_build_array(jsonb_build_object('ruleId','rule.old','version','1','affectedActionId','action.old')),
      'authorizations',jsonb_build_array(jsonb_build_object(
        'withdrawnRuleId','rule.old','withdrawnRuleVersion','1','affectedActionId','action.old',
        'successorRuleId','rule.new','successorRuleVersion','2','authorId',v_author::text,
        'reviewerId',v_reviewer::text,'reviewedAt',statement_timestamp()::text,'reviewRef',v_child_id::text))));
  v_result := public.create_engine_ruleset_draft(v_child_id,v_child_packet,v_parent_hash);
  v_digest := v_result->>'packetDigest';
  perform set_config('role','postgres',true);
  select packet #>> '{successorReview,authorizations,0,authorId}',
         packet #>> '{successorReview,authorizations,0,reviewerId}'
    into v_opaque_author_id,v_opaque_reviewer_id
    from strandcue_private.engine_ruleset_publications where id=v_child_id;
  if v_opaque_author_id in (v_author::text,v_reviewer::text)
     or v_opaque_reviewer_id in (v_author::text,v_reviewer::text)
     or v_opaque_author_id=v_opaque_reviewer_id then
    raise exception 'successor packet retained or reused an Auth actor UUID';
  end if;
  if not exists (select 1 from strandcue_private.engine_ruleset_successor_actor_bindings
      where publication_id=v_child_id and actor_role='author'
        and actor_user_id=v_author and actor_ref=v_opaque_author_id::uuid)
     or not exists (select 1 from strandcue_private.engine_ruleset_successor_actor_bindings
      where publication_id=v_child_id and actor_role='reviewer'
        and actor_user_id=v_reviewer and actor_ref=v_opaque_reviewer_id::uuid) then
    raise exception 'opaque successor actor references are not bound to authenticated A/B';
  end if;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  perform public.record_engine_ruleset_review(v_child_id,v_digest,'author');
  perform set_config('request.jwt.claim.sub',v_reviewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reviewer,'role','authenticated')::text,true);
  perform public.record_engine_ruleset_review(v_child_id,v_digest,'reviewer');
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  begin
    perform public.publish_engine_ruleset(v_child_id,v_digest);
    raise exception 'expected successor publication without trusted hash to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-hash-verification-required' then raise; end if;
  end;
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  perform public.record_engine_ruleset_hash_verification(v_child_id,v_digest,v_child_hash,'1.1.0');
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  v_result := public.publish_engine_ruleset(v_child_id,v_digest);
  if v_result->>'state' <> 'published' then raise exception 'local successor publication proof failed'; end if;
  perform set_config('role','postgres',true);
  begin
    update strandcue_private.engine_ruleset_publications
       set published_at=published_at + interval '1 day'
     where id=v_child_id;
    raise exception 'expected published timestamp mutation to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-state-transition-invalid' then raise; end if;
  end;
  perform set_config('role','authenticated',true);

  v_orphan_hash := 'sha256:' || encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  v_orphan_packet := jsonb_build_object('ref',jsonb_build_object('rulesetId','pg-orphan','contentHash',v_orphan_hash,
    'schemaVersion','1.1.0','evaluatorVersion','1.1.0'),
    'capabilities','[]'::jsonb,'rules',jsonb_build_array(jsonb_build_object('ruleId','rule.orphan','version','2',
      'effects',jsonb_build_array(jsonb_build_object('kind','include_candidate','candidateId','action.old')),
      'successorOf',jsonb_build_object('parentRulesetHash',v_parent_hash,'withdrawnRuleId','rule.old','withdrawnRuleVersion','1'))));
  begin
    perform public.create_engine_ruleset_draft(gen_random_uuid(),v_orphan_packet,null);
    raise exception 'expected orphan successor lineage to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-successor-review-required' then raise; end if;
  end;

  perform set_config('role','postgres',true);
  delete from auth.users where id in (v_author,v_reviewer);
  if exists (select 1 from strandcue_private.engine_ruleset_successor_actor_bindings
      where publication_id=v_child_id and actor_user_id is not null) then
    raise exception 'Auth deletion did not redact successor actor bindings';
  end if;
  if exists (
    select 1 from strandcue_private.engine_ruleset_successor_actor_bindings b
    join strandcue_private.engine_ruleset_publications p on p.id=b.publication_id
     where b.publication_id=v_child_id
       and (b.actor_ref in (v_author,v_reviewer)
         or b.actor_ref::text not in (
           p.packet #>> '{successorReview,authorizations,0,authorId}',
           p.packet #>> '{successorReview,authorizations,0,reviewerId}'))
  ) then
    raise exception 'opaque successor actor references changed or retained Auth identity';
  end if;

end;
$verify$;

do $anonymize$
declare
  v_author uuid := gen_random_uuid();
  v_reviewer uuid := gen_random_uuid();
  v_publication_id uuid := gen_random_uuid();
  v_content_hash text := 'sha256:' || encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  v_packet jsonb;
  v_result jsonb;
  v_digest text;
  v_actor_id uuid;
  v_state text;
  v_packet_retained jsonb;
  v_approval_count integer;
  v_redacted_count integer;
begin
  perform set_config('role','postgres',true);
  insert into auth.users(id,email_confirmed_at) values(v_author,now()),(v_reviewer,now());
  insert into strandcue_private.engine_ruleset_reviewers(user_id,qualification)
  values(v_reviewer,'local PostgreSQL synthetic reviewer');
  v_packet := jsonb_build_object(
    'ref',jsonb_build_object('rulesetId','pg-anonymization','contentHash',v_content_hash,
      'schemaVersion','1.1.0','evaluatorVersion','1.1.0'),
    'capabilities','[]'::jsonb,'rules','[]'::jsonb);
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  v_result := public.create_engine_ruleset_draft(v_publication_id,v_packet,null);
  v_digest := v_result->>'packetDigest';
  perform public.record_engine_ruleset_review(v_publication_id,v_digest,'author');
  perform set_config('request.jwt.claim.sub',v_reviewer::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_reviewer,'role','authenticated')::text,true);
  perform public.record_engine_ruleset_review(v_publication_id,v_digest,'reviewer');
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
  perform public.record_engine_ruleset_hash_verification(v_publication_id,v_digest,v_content_hash,'1.1.0');
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_author::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_author,'role','authenticated')::text,true);
  v_result := public.publish_engine_ruleset(v_publication_id,v_digest);
  if v_result->>'state' <> 'published' then raise exception 'anonymization publication setup failed'; end if;

  perform set_config('role','postgres',true);
  begin
    update strandcue_private.engine_ruleset_publications set authored_by=null where id=v_publication_id;
    raise exception 'expected direct author redaction to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-packet-immutable' then raise; end if;
  end;
  begin
    update strandcue_private.engine_ruleset_approvals set reviewer_id=null
     where publication_id=v_publication_id and review_kind='reviewer';
    raise exception 'expected direct reviewer redaction to be rejected';
  exception when others then
    if sqlerrm <> 'engine-ruleset-approval-immutable' then raise; end if;
  end;
  delete from auth.users where id in (v_author,v_reviewer);
  select authored_by,state,packet into v_actor_id,v_state,v_packet_retained
    from strandcue_private.engine_ruleset_publications where id=v_publication_id;
  select count(*),count(*) filter (where reviewer_id is null)
    into v_approval_count,v_redacted_count from strandcue_private.engine_ruleset_approvals
   where publication_id=v_publication_id;
  if v_actor_id is not null or v_state <> 'published' or v_packet_retained is distinct from v_packet
     or v_approval_count <> 2 or v_redacted_count <> 2 then
    raise exception 'auth deletion did not retain and anonymize the publication packet and decisions';
  end if;
  if exists(select 1 from auth.users where id in (v_author,v_reviewer)) then
    raise exception 'synthetic Auth identities were not deleted';
  end if;
  if exists(select 1 from strandcue_private.engine_ruleset_reviewers where user_id=v_reviewer) then
    raise exception 'deleted reviewer qualification remained active';
  end if;
end;
$anonymize$;

rollback;

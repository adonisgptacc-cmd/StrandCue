-- Cross-check successor authorizations against both immutable rule bundles:
-- every withdrawal must exist in the published parent and every successor
-- reference must exist in the packet being reviewed.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

set role strandcue_mutator;

create or replace function strandcue_private.engine_ruleset_publication_guard()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_author strandcue_private.engine_ruleset_approvals%rowtype;
  v_reviewer strandcue_private.engine_ruleset_approvals%rowtype;
  v_reviewer_active boolean;
  v_authorization jsonb;
  v_withdrawal jsonb;
  v_parent_packet jsonb;
  v_reviewed_at timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.packet_digest is distinct from ('sha256:' || pg_catalog.encode(
        pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.jsonb_build_object('packet',new.packet,'parentContentHash',new.parent_content_hash)::text,
          'UTF8')),'hex')) then
      raise exception 'engine-ruleset-packet-digest-invalid' using errcode='P0001';
    end if;
    return new;
  end if;

  if (new.id,new.content_hash,new.packet,new.packet_digest,new.parent_content_hash,
      new.authored_by,new.created_at) is distinct from
     (old.id,old.content_hash,old.packet,old.packet_digest,old.parent_content_hash,
      old.authored_by,old.created_at) then
    raise exception 'engine-ruleset-packet-immutable' using errcode='P0001';
  end if;
  if new.state is not distinct from old.state then
    return new;
  end if;
  if new.state = 'withdrawn' then
    if old.state <> 'published' or old.published_at is null
       or new.published_at is distinct from old.published_at then
      raise exception 'engine-ruleset-state-transition-invalid' using errcode='P0001';
    end if;
    return new;
  end if;
  if old.state <> 'draft' or new.state <> 'published' then
    raise exception 'engine-ruleset-state-transition-invalid' using errcode='P0001';
  end if;

  select * into v_author from strandcue_private.engine_ruleset_approvals a
   where a.publication_id=new.id and a.packet_digest=new.packet_digest and a.review_kind='author';
  select * into v_reviewer from strandcue_private.engine_ruleset_approvals a
   where a.publication_id=new.id and a.packet_digest=new.packet_digest and a.review_kind='reviewer';
  if not found or v_author.reviewer_id is null or v_reviewer.reviewer_id is null
     or v_author.reviewer_id <> new.authored_by
     or v_author.reviewer_id = v_reviewer.reviewer_id then
    raise exception 'engine-ruleset-approvals-incomplete' using errcode='P0001';
  end if;
  select exists (
    select 1 from strandcue_private.engine_ruleset_reviewers r
     where r.user_id=v_reviewer.reviewer_id and r.revoked_at is null
       and r.created_at <= v_reviewer.reviewed_at
  ) into v_reviewer_active;
  if not v_reviewer_active then
    raise exception 'engine-ruleset-reviewer-not-authorized' using errcode='P0001';
  end if;
  if new.packet ? 'successorReview' then
    if new.parent_content_hash is null
       or new.packet #>> '{successorReview,parentRulesetHash}' is distinct from new.parent_content_hash then
      raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
    end if;
    if jsonb_typeof(new.packet #> '{successorReview,withdrawals}') <> 'array'
       or jsonb_array_length(new.packet #> '{successorReview,withdrawals}') = 0
       or jsonb_typeof(new.packet #> '{successorReview,authorizations}') <> 'array' then
      raise exception 'engine-ruleset-successor-review-invalid' using errcode='P0001';
    end if;
    select p.packet into v_parent_packet from strandcue_private.engine_ruleset_publications p
     where p.content_hash=new.parent_content_hash and p.state in ('published','withdrawn');
    if not found then
      raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
    end if;
    for v_authorization in select value from jsonb_array_elements(new.packet #> '{successorReview,authorizations}') loop
      if v_authorization->>'authorId' is distinct from v_author.reviewer_id::text
         or v_authorization->>'reviewerId' is distinct from v_reviewer.reviewer_id::text
         or v_authorization->>'reviewRef' is distinct from new.id::text then
        raise exception 'engine-ruleset-successor-identity-invalid' using errcode='P0001';
      end if;
      begin
        v_reviewed_at := (v_authorization->>'reviewedAt')::timestamptz;
      exception when others then
        raise exception 'engine-ruleset-successor-review-invalid' using errcode='P0001';
      end;
      if v_reviewed_at is null or v_reviewed_at > v_reviewer.reviewed_at then
        raise exception 'engine-ruleset-successor-review-invalid' using errcode='P0001';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(new.packet #> '{successorReview,withdrawals}') w(value)
         where w.value->>'ruleId'=v_authorization->>'withdrawnRuleId'
           and w.value->>'version'=v_authorization->>'withdrawnRuleVersion'
           and w.value->>'affectedActionId'=v_authorization->>'affectedActionId') then
        raise exception 'engine-ruleset-successor-review-invalid' using errcode='P0001';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(new.packet->'rules') successor_rule(value)
         where successor_rule.value->>'ruleId'=v_authorization->>'successorRuleId'
           and successor_rule.value->>'version'=v_authorization->>'successorRuleVersion'
           and successor_rule.value #>> '{successorOf,parentRulesetHash}'=new.parent_content_hash
           and successor_rule.value #>> '{successorOf,withdrawnRuleId}'=v_authorization->>'withdrawnRuleId'
           and successor_rule.value #>> '{successorOf,withdrawnRuleVersion}'=v_authorization->>'withdrawnRuleVersion') then
        raise exception 'engine-ruleset-successor-rule-invalid' using errcode='P0001';
      end if;
    end loop;
    for v_withdrawal in select value from jsonb_array_elements(new.packet #> '{successorReview,withdrawals}') loop
      if not exists (
        select 1 from jsonb_array_elements(v_parent_packet->'rules') parent_rule(value)
        cross join lateral jsonb_array_elements(parent_rule.value->'effects') parent_effect(value)
         where parent_rule.value->>'ruleId'=v_withdrawal->>'ruleId'
           and parent_rule.value->>'version'=v_withdrawal->>'version'
           and parent_effect.value->>'candidateId'=v_withdrawal->>'affectedActionId') then
        raise exception 'engine-ruleset-withdrawal-not-in-parent' using errcode='P0001';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(new.packet #> '{successorReview,authorizations}') a(value)
         where a.value->>'withdrawnRuleId'=v_withdrawal->>'ruleId'
           and a.value->>'withdrawnRuleVersion'=v_withdrawal->>'version'
           and a.value->>'affectedActionId'=v_withdrawal->>'affectedActionId') then
        raise exception 'engine-ruleset-successor-review-invalid' using errcode='P0001';
      end if;
    end loop;
  elsif new.parent_content_hash is not null then
    raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
  end if;
  return new;
end;
$$;

reset role;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

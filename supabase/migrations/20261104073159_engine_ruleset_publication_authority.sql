-- Authoritative, immutable ruleset packets and authenticated two-person review.
-- This store is separate from the Heat Coach publication ledger and remains empty
-- in the Phase 2a synthetic-content environment.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant create on schema public to strandcue_mutator;
grant usage on schema strandcue_private to strandcue_mutator;

create table strandcue_private.engine_ruleset_reviewers (
  user_id uuid not null references auth.users(id) on delete restrict,
  qualification text not null check (length(btrim(qualification)) > 0),
  created_at timestamptz not null default statement_timestamp(),
  revoked_at timestamptz,
  primary key (user_id),
  constraint engine_ruleset_reviewer_revocation_time check (
    revoked_at is null or revoked_at >= created_at)
);

create table strandcue_private.engine_ruleset_publications (
  id uuid primary key,
  content_hash text not null unique check (content_hash ~ '^sha256:[a-f0-9]{64}$'),
  packet jsonb not null check (jsonb_typeof(packet) = 'object'),
  packet_digest text not null check (packet_digest ~ '^sha256:[a-f0-9]{64}$'),
  parent_content_hash text references strandcue_private.engine_ruleset_publications(content_hash) on delete restrict,
  state text not null default 'draft' check (state in ('draft','published','withdrawn')),
  authored_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  constraint engine_ruleset_packet_hash_matches_ref check (
    packet #>> '{ref,contentHash}' = content_hash),
  constraint engine_ruleset_publication_time check (
    (state = 'draft' and published_at is null)
    or (state in ('published','withdrawn') and published_at is not null))
);

create table strandcue_private.engine_ruleset_approvals (
  publication_id uuid not null references strandcue_private.engine_ruleset_publications(id) on delete restrict,
  packet_digest text not null check (packet_digest ~ '^sha256:[a-f0-9]{64}$'),
  review_kind text not null check (review_kind in ('author','reviewer')),
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default statement_timestamp(),
  primary key (publication_id, packet_digest, review_kind),
  unique (publication_id, packet_digest, reviewer_id)
);

alter table strandcue_private.engine_ruleset_reviewers enable row level security;
alter table strandcue_private.engine_ruleset_reviewers force row level security;
alter table strandcue_private.engine_ruleset_publications enable row level security;
alter table strandcue_private.engine_ruleset_publications force row level security;
alter table strandcue_private.engine_ruleset_approvals enable row level security;
alter table strandcue_private.engine_ruleset_approvals force row level security;

revoke all on strandcue_private.engine_ruleset_reviewers,
  strandcue_private.engine_ruleset_publications,
  strandcue_private.engine_ruleset_approvals from public, anon, authenticated, service_role;
grant select on strandcue_private.engine_ruleset_reviewers to strandcue_mutator;
grant select, insert, update on strandcue_private.engine_ruleset_publications to strandcue_mutator;
grant select, insert on strandcue_private.engine_ruleset_approvals to strandcue_mutator;

create policy engine_ruleset_reviewer_mutator_read
  on strandcue_private.engine_ruleset_reviewers for select to strandcue_mutator using (true);
create policy engine_ruleset_publication_mutator_read
  on strandcue_private.engine_ruleset_publications for select to strandcue_mutator using (true);
create policy engine_ruleset_publication_mutator_insert
  on strandcue_private.engine_ruleset_publications for insert to strandcue_mutator with check (true);
create policy engine_ruleset_publication_mutator_update
  on strandcue_private.engine_ruleset_publications for update to strandcue_mutator
  using (true) with check (true);
create policy engine_ruleset_approval_mutator_read
  on strandcue_private.engine_ruleset_approvals for select to strandcue_mutator using (true);
create policy engine_ruleset_approval_mutator_insert
  on strandcue_private.engine_ruleset_approvals for insert to strandcue_mutator with check (true);

create function strandcue_private.engine_ruleset_publication_guard()
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
    if old.state <> 'published' or old.published_at is null then
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
       and (r.revoked_at is null or r.revoked_at > statement_timestamp())
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

create trigger engine_ruleset_publication_guard
  before insert or update on strandcue_private.engine_ruleset_publications
  for each row execute function strandcue_private.engine_ruleset_publication_guard();

create function strandcue_private.create_engine_ruleset_draft_core(
  p_publication_id uuid, p_packet jsonb, p_parent_content_hash text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_author_id uuid := strandcue_private.request_uid();
  v_content_hash text := p_packet #>> '{ref,contentHash}';
  v_packet_digest text;
begin
  if v_author_id is null then
    raise exception 'engine-ruleset-authentication-required' using errcode='P0001';
  end if;
  if p_publication_id is null or jsonb_typeof(p_packet) <> 'object'
     or v_content_hash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'engine-ruleset-input-invalid' using errcode='P0001';
  end if;
  if p_packet ? 'successorReview' then
    if p_parent_content_hash is null
       or p_packet #>> '{successorReview,parentRulesetHash}' is distinct from p_parent_content_hash then
      raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
    end if;
    if not exists (select 1 from strandcue_private.engine_ruleset_publications p
      where p.content_hash=p_parent_content_hash and p.state in ('published','withdrawn')) then
      raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
    end if;
  elsif p_parent_content_hash is not null then
    raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
  end if;
  v_packet_digest := 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('packet',p_packet,'parentContentHash',p_parent_content_hash)::text,'UTF8')),'hex');
  insert into strandcue_private.engine_ruleset_publications(
    id,content_hash,packet,packet_digest,parent_content_hash,authored_by)
  values(p_publication_id,v_content_hash,p_packet,v_packet_digest,p_parent_content_hash,v_author_id);
  return pg_catalog.jsonb_build_object('publicationId',p_publication_id,'contentHash',v_content_hash,
    'packetDigest',v_packet_digest,'authoredBy',v_author_id);
end;
$$;

create function strandcue_private.record_engine_ruleset_review_core(
  p_publication_id uuid, p_packet_digest text, p_review_kind text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_reviewer_id uuid := strandcue_private.request_uid();
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
  v_existing strandcue_private.engine_ruleset_approvals%rowtype;
  v_reviewed_at timestamptz := statement_timestamp();
begin
  if v_reviewer_id is null then
    raise exception 'engine-ruleset-authentication-required' using errcode='P0001';
  end if;
  if p_publication_id is null or p_packet_digest is null or p_review_kind not in ('author','reviewer') then
    raise exception 'engine-ruleset-input-invalid' using errcode='P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('engine-ruleset:'||p_publication_id::text,0));
  select * into v_publication from strandcue_private.engine_ruleset_publications p where p.id=p_publication_id;
  if not found or v_publication.state <> 'draft' or v_publication.packet_digest is distinct from p_packet_digest then
    raise exception 'engine-ruleset-draft-mismatch' using errcode='P0001';
  end if;
  if p_review_kind='author' and v_reviewer_id <> v_publication.authored_by then
    raise exception 'engine-ruleset-author-mismatch' using errcode='P0001';
  end if;
  if exists (select 1 from strandcue_private.engine_ruleset_approvals a
      where a.publication_id=p_publication_id and a.packet_digest=p_packet_digest
        and a.review_kind<>p_review_kind and a.reviewer_id=v_reviewer_id) then
    raise exception 'engine-ruleset-reviewer-not-distinct' using errcode='P0001';
  end if;
  if p_review_kind='reviewer' and not exists (
    select 1 from strandcue_private.engine_ruleset_reviewers r
     where r.user_id=v_reviewer_id and r.revoked_at is null and r.created_at <= v_reviewed_at) then
    raise exception 'engine-ruleset-reviewer-not-authorized' using errcode='P0001';
  end if;
  select * into v_existing from strandcue_private.engine_ruleset_approvals a
   where a.publication_id=p_publication_id and a.packet_digest=p_packet_digest and a.review_kind=p_review_kind;
  if found then
    if v_existing.reviewer_id <> v_reviewer_id then
      raise exception 'engine-ruleset-review-already-recorded' using errcode='P0001';
    end if;
    return pg_catalog.jsonb_build_object('publicationId',p_publication_id,'packetDigest',p_packet_digest,
      'reviewKind',p_review_kind,'reviewerId',v_reviewer_id,'reviewedAt',v_existing.reviewed_at);
  end if;
  insert into strandcue_private.engine_ruleset_approvals(publication_id,packet_digest,review_kind,reviewer_id,reviewed_at)
  values(p_publication_id,p_packet_digest,p_review_kind,v_reviewer_id,v_reviewed_at);
  return pg_catalog.jsonb_build_object('publicationId',p_publication_id,'packetDigest',p_packet_digest,
    'reviewKind',p_review_kind,'reviewerId',v_reviewer_id,'reviewedAt',v_reviewed_at);
end;
$$;

create function strandcue_private.publish_engine_ruleset_core(
  p_publication_id uuid, p_packet_digest text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_actor uuid := strandcue_private.request_uid();
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
begin
  if v_actor is null then
    raise exception 'engine-ruleset-authentication-required' using errcode='P0001';
  end if;
  select * into v_publication from strandcue_private.engine_ruleset_publications p where p.id=p_publication_id;
  if not found or v_publication.state <> 'draft' or v_publication.packet_digest is distinct from p_packet_digest then
    raise exception 'engine-ruleset-draft-mismatch' using errcode='P0001';
  end if;
  if v_actor <> v_publication.authored_by then
    raise exception 'engine-ruleset-author-mismatch' using errcode='P0001';
  end if;
  update strandcue_private.engine_ruleset_publications p
     set state='published',published_at=statement_timestamp()
   where p.id=p_publication_id;
  return pg_catalog.jsonb_build_object('publicationId',v_publication.id,'contentHash',v_publication.content_hash,
    'packetDigest',v_publication.packet_digest,'state','published');
end;
$$;

create function strandcue_private.load_engine_ruleset_publication(p_content_hash text)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
  v_expected_digest text;
begin
  if p_content_hash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'engine-ruleset-publication-not-found' using errcode='P0001';
  end if;
  select * into v_publication from strandcue_private.engine_ruleset_publications p
   where p.content_hash=p_content_hash and p.state in ('published','withdrawn');
  if not found then
    raise exception 'engine-ruleset-publication-not-found' using errcode='P0001';
  end if;
  v_expected_digest := 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('packet',v_publication.packet,
      'parentContentHash',v_publication.parent_content_hash)::text,'UTF8')),'hex');
  if v_expected_digest is distinct from v_publication.packet_digest then
    raise exception 'engine-ruleset-publication-invalid' using errcode='P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'publicationId',v_publication.id,'contentHash',v_publication.content_hash,
    'packetDigest',v_publication.packet_digest,'parentContentHash',v_publication.parent_content_hash,
    'state',v_publication.state,'packet',v_publication.packet);
end;
$$;

create function public.create_engine_ruleset_draft(
  p_publication_id uuid, p_packet jsonb, p_parent_content_hash text default null
) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
  select strandcue_private.create_engine_ruleset_draft_core(p_publication_id,p_packet,p_parent_content_hash)
$$;
create function public.record_engine_ruleset_review(
  p_publication_id uuid, p_packet_digest text, p_review_kind text
) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
  select strandcue_private.record_engine_ruleset_review_core(p_publication_id,p_packet_digest,p_review_kind)
$$;
create function public.publish_engine_ruleset(
  p_publication_id uuid, p_packet_digest text
) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
  select strandcue_private.publish_engine_ruleset_core(p_publication_id,p_packet_digest)
$$;

alter function strandcue_private.engine_ruleset_publication_guard() owner to strandcue_mutator;
alter function strandcue_private.create_engine_ruleset_draft_core(uuid,jsonb,text) owner to strandcue_mutator;
alter function strandcue_private.record_engine_ruleset_review_core(uuid,text,text) owner to strandcue_mutator;
alter function strandcue_private.publish_engine_ruleset_core(uuid,text) owner to strandcue_mutator;
alter function strandcue_private.load_engine_ruleset_publication(text) owner to strandcue_mutator;
alter function public.create_engine_ruleset_draft(uuid,jsonb,text) owner to strandcue_mutator;
alter function public.record_engine_ruleset_review(uuid,text,text) owner to strandcue_mutator;
alter function public.publish_engine_ruleset(uuid,text) owner to strandcue_mutator;

revoke all on function strandcue_private.engine_ruleset_publication_guard() from public,anon,authenticated;
revoke all on function strandcue_private.create_engine_ruleset_draft_core(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function strandcue_private.record_engine_ruleset_review_core(uuid,text,text) from public,anon,authenticated;
revoke all on function strandcue_private.publish_engine_ruleset_core(uuid,text) from public,anon,authenticated;
revoke all on function strandcue_private.load_engine_ruleset_publication(text) from public,anon,authenticated;
revoke all on function public.create_engine_ruleset_draft(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.record_engine_ruleset_review(uuid,text,text) from public,anon,authenticated;
revoke all on function public.publish_engine_ruleset(uuid,text) from public,anon,authenticated;
grant execute on function strandcue_private.engine_ruleset_publication_guard(),
  strandcue_private.create_engine_ruleset_draft_core(uuid,jsonb,text),
  strandcue_private.record_engine_ruleset_review_core(uuid,text,text),
  strandcue_private.publish_engine_ruleset_core(uuid,text),
  strandcue_private.load_engine_ruleset_publication(text) to strandcue_mutator;
grant execute on function public.create_engine_ruleset_draft(uuid,jsonb,text),
  public.record_engine_ruleset_review(uuid,text,text),
  public.publish_engine_ruleset(uuid,text) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke create on schema public from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

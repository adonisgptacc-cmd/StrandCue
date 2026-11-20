-- Preserve publication and approval records when an Auth identity is deleted.
-- Only a foreign-key-driven actor-ID nulling is allowed through the immutable
-- ledger guards; packet content, digests, decisions, timestamps, and state stay fixed.

-- Older drafts stored Auth UUIDs directly in successorReview and lack the
-- actor-binding ledger. Refuse an in-place upgrade of those immutable packets;
-- they require an explicit migration plan before this contract can be applied.
do $$
begin
  if exists (
    select 1 from strandcue_private.engine_ruleset_publications p
     where p.packet ? 'successorReview'
  ) then
    raise exception 'engine-ruleset-actor-anonymization-requires-empty-successor-ledger';
  end if;
end;
$$;

alter table strandcue_private.engine_ruleset_publications
  alter column authored_by drop not null;
alter table strandcue_private.engine_ruleset_publications
  drop constraint engine_ruleset_publications_authored_by_fkey,
  add constraint engine_ruleset_publications_authored_by_fkey
    foreign key (authored_by) references auth.users(id) on delete set null;

alter table strandcue_private.engine_ruleset_approvals
  alter column reviewer_id drop not null;
alter table strandcue_private.engine_ruleset_approvals
  drop constraint engine_ruleset_approvals_reviewer_id_fkey,
  add constraint engine_ruleset_approvals_reviewer_id_fkey
    foreign key (reviewer_id) references auth.users(id) on delete set null;

-- Reviewer qualifications are operational authorization records, not approval
-- history. Remove them with the deleted identity; approvals remain above.
alter table strandcue_private.engine_ruleset_reviewers
  drop constraint engine_ruleset_reviewers_user_id_fkey,
  add constraint engine_ruleset_reviewers_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

create table strandcue_private.engine_ruleset_successor_actor_bindings (
  publication_id uuid not null references strandcue_private.engine_ruleset_publications(id) on delete restrict,
  authorization_index integer not null check (authorization_index >= 0),
  actor_role text not null check (actor_role in ('author','reviewer')),
  actor_ref uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  primary key (publication_id,authorization_index,actor_role),
  unique (publication_id,actor_ref)
);
alter table strandcue_private.engine_ruleset_successor_actor_bindings enable row level security;
alter table strandcue_private.engine_ruleset_successor_actor_bindings force row level security;
revoke all on strandcue_private.engine_ruleset_successor_actor_bindings from public,anon,authenticated,service_role;
grant select,insert on strandcue_private.engine_ruleset_successor_actor_bindings to strandcue_mutator;
create policy engine_ruleset_successor_actor_binding_mutator_read
  on strandcue_private.engine_ruleset_successor_actor_bindings for select to strandcue_mutator using (true);
create policy engine_ruleset_successor_actor_binding_mutator_insert
  on strandcue_private.engine_ruleset_successor_actor_bindings for insert to strandcue_mutator with check (true);

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
  v_authorization_index bigint;
  v_author_actor_id uuid;
  v_reviewer_actor_id uuid;
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

  if (new.id,new.content_hash,new.packet,new.packet_digest,new.parent_content_hash,new.created_at)
      is distinct from
     (old.id,old.content_hash,old.packet,old.packet_digest,old.parent_content_hash,old.created_at)
     or (new.authored_by is distinct from old.authored_by and not (
       old.authored_by is not null and new.authored_by is null and pg_catalog.pg_trigger_depth() > 1
     )) then
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
    for v_authorization,v_authorization_index in
      select value,ordinality-1 from jsonb_array_elements(new.packet #> '{successorReview,authorizations}') with ordinality
    loop
      if v_authorization->>'authorId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or v_authorization->>'reviewerId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or v_authorization->>'authorId' = v_authorization->>'reviewerId'
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
      select actor_user_id into v_author_actor_id
        from strandcue_private.engine_ruleset_successor_actor_bindings b
       where b.publication_id=new.id and b.authorization_index=v_authorization_index
         and b.actor_role='author' and b.actor_ref=(v_authorization->>'authorId')::uuid;
      if not found or v_author_actor_id is distinct from v_author.reviewer_id then
        raise exception 'engine-ruleset-successor-identity-invalid' using errcode='P0001';
      end if;
      select actor_user_id into v_reviewer_actor_id
        from strandcue_private.engine_ruleset_successor_actor_bindings b
       where b.publication_id=new.id and b.authorization_index=v_authorization_index
         and b.actor_role='reviewer' and b.actor_ref=(v_authorization->>'reviewerId')::uuid;
      if not found or v_reviewer_actor_id is distinct from v_reviewer.reviewer_id then
        raise exception 'engine-ruleset-successor-identity-invalid' using errcode='P0001';
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

-- Successor packets retain opaque, per-packet reviewer references rather than
-- copying Auth user UUIDs into immutable JSON. Auth identities remain bound by
-- the author/reviewer approval rows and are redacted there on account deletion.
create or replace function strandcue_private.create_engine_ruleset_draft_core(
  p_publication_id uuid, p_packet jsonb, p_parent_content_hash text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_author_id uuid := strandcue_private.request_uid();
  v_content_hash text := p_packet #>> '{ref,contentHash}';
  v_packet jsonb := p_packet;
  v_packet_digest text;
  v_authorization jsonb;
  v_source_authorization jsonb;
  v_index bigint;
  v_author_actor_id uuid;
  v_reviewer_actor_id uuid;
  v_reviewed_at timestamptz;
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
    if jsonb_typeof(p_packet #> '{successorReview,authorizations}') = 'array' then
      for v_authorization,v_index in
        select value,ordinality-1 from jsonb_array_elements(p_packet #> '{successorReview,authorizations}') with ordinality
      loop
        v_source_authorization := p_packet #> array['successorReview','authorizations',v_index::text];
        begin
          v_author_actor_id := (v_source_authorization->>'authorId')::uuid;
          v_reviewer_actor_id := (v_source_authorization->>'reviewerId')::uuid;
          v_reviewed_at := (v_source_authorization->>'reviewedAt')::timestamptz;
        exception when others then
          raise exception 'engine-ruleset-successor-actor-input-invalid' using errcode='P0001';
        end;
        if v_author_actor_id is distinct from v_author_id
           or v_reviewer_actor_id is null or v_reviewer_actor_id=v_author_actor_id
           or v_reviewed_at is null then
          raise exception 'engine-ruleset-successor-actor-input-invalid' using errcode='P0001';
        end if;
        if not exists (
          select 1 from strandcue_private.engine_ruleset_reviewers r
           where r.user_id=v_reviewer_actor_id and r.revoked_at is null
        ) then
          raise exception 'engine-ruleset-reviewer-not-authorized' using errcode='P0001';
        end if;
        v_authorization := pg_catalog.jsonb_set(v_authorization,'{authorId}',
          pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()::text),true);
        v_authorization := pg_catalog.jsonb_set(v_authorization,'{reviewerId}',
          pg_catalog.to_jsonb(pg_catalog.gen_random_uuid()::text),true);
        v_packet := pg_catalog.jsonb_set(v_packet,
          array['successorReview','authorizations',v_index::text],v_authorization,true);
      end loop;
    end if;
  elsif p_parent_content_hash is not null then
    raise exception 'engine-ruleset-parent-not-published' using errcode='P0001';
  end if;
  v_packet_digest := 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('packet',v_packet,'parentContentHash',p_parent_content_hash)::text,'UTF8')),'hex');
  insert into strandcue_private.engine_ruleset_publications(
    id,content_hash,packet,packet_digest,parent_content_hash,authored_by)
  values(p_publication_id,v_content_hash,v_packet,v_packet_digest,p_parent_content_hash,v_author_id);
  if jsonb_typeof(p_packet #> '{successorReview,authorizations}')='array' then
    for v_authorization,v_index in
      select value,ordinality-1 from jsonb_array_elements(v_packet #> '{successorReview,authorizations}') with ordinality
    loop
      v_source_authorization := p_packet #> array['successorReview','authorizations',v_index::text];
      insert into strandcue_private.engine_ruleset_successor_actor_bindings(
        publication_id,authorization_index,actor_role,actor_ref,actor_user_id)
      values
        (p_publication_id,v_index::integer,'author',
          (v_packet #>> array['successorReview','authorizations',v_index::text,'authorId'])::uuid,
          (v_source_authorization->>'authorId')::uuid),
        (p_publication_id,v_index::integer,'reviewer',
          (v_packet #>> array['successorReview','authorizations',v_index::text,'reviewerId'])::uuid,
          (v_source_authorization->>'reviewerId')::uuid);
    end loop;
  end if;
  return pg_catalog.jsonb_build_object('publicationId',p_publication_id,'contentHash',v_content_hash,
    'packetDigest',v_packet_digest,'authoredBy',v_author_id);
end;
$$;

create or replace function strandcue_private.engine_ruleset_approval_anonymization_guard()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if (new.publication_id,new.packet_digest,new.review_kind,new.reviewed_at)
      is distinct from (old.publication_id,old.packet_digest,old.review_kind,old.reviewed_at)
     or (new.reviewer_id is distinct from old.reviewer_id and not (
       old.reviewer_id is not null and new.reviewer_id is null and pg_catalog.pg_trigger_depth() > 1
     )) then
    raise exception 'engine-ruleset-approval-immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;

create or replace function strandcue_private.engine_ruleset_successor_actor_binding_guard()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if (new.publication_id,new.authorization_index,new.actor_role,new.actor_ref,new.created_at)
      is distinct from (old.publication_id,old.authorization_index,old.actor_role,old.actor_ref,old.created_at)
     or (new.actor_user_id is distinct from old.actor_user_id and not (
       old.actor_user_id is not null and new.actor_user_id is null and pg_catalog.pg_trigger_depth() > 1
     )) then
    raise exception 'engine-ruleset-successor-actor-binding-immutable' using errcode='P0001';
  end if;
  return new;
end;
$$;

reset role;
create trigger engine_ruleset_approval_anonymization_guard
  before update on strandcue_private.engine_ruleset_approvals
  for each row execute function strandcue_private.engine_ruleset_approval_anonymization_guard();
create trigger engine_ruleset_successor_actor_binding_guard
  before update on strandcue_private.engine_ruleset_successor_actor_bindings
  for each row execute function strandcue_private.engine_ruleset_successor_actor_binding_guard();
alter function strandcue_private.engine_ruleset_publication_guard() owner to strandcue_mutator;
alter function strandcue_private.create_engine_ruleset_draft_core(uuid,jsonb,text) owner to strandcue_mutator;
alter function strandcue_private.engine_ruleset_approval_anonymization_guard() owner to strandcue_mutator;
alter function strandcue_private.engine_ruleset_successor_actor_binding_guard() owner to strandcue_mutator;
revoke all on function strandcue_private.engine_ruleset_publication_guard() from public,anon,authenticated;
revoke all on function strandcue_private.engine_ruleset_approval_anonymization_guard() from public,anon,authenticated;
revoke all on function strandcue_private.create_engine_ruleset_draft_core(uuid,jsonb,text) from public,anon,authenticated;
revoke all on function strandcue_private.engine_ruleset_successor_actor_binding_guard() from public,anon,authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

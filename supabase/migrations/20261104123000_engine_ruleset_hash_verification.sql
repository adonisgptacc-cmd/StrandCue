create table strandcue_private.engine_ruleset_hash_verifications (
  publication_id uuid primary key
    references strandcue_private.engine_ruleset_publications(id) on delete restrict,
  packet_digest text not null check (packet_digest ~ '^sha256:[a-f0-9]{64}$'),
  content_hash text not null check (content_hash ~ '^sha256:[a-f0-9]{64}$'),
  evaluator_version text not null check (length(evaluator_version) between 1 and 64),
  verified_at timestamptz not null default statement_timestamp(),
  unique(publication_id,packet_digest,content_hash)
);

alter table strandcue_private.engine_ruleset_hash_verifications enable row level security;
alter table strandcue_private.engine_ruleset_hash_verifications force row level security;
revoke all on strandcue_private.engine_ruleset_hash_verifications from public,anon,authenticated,service_role;
grant select,insert on strandcue_private.engine_ruleset_hash_verifications to strandcue_mutator;
create policy engine_ruleset_hash_verification_mutator_read
  on strandcue_private.engine_ruleset_hash_verifications for select to strandcue_mutator using (true);
create policy engine_ruleset_hash_verification_mutator_insert
  on strandcue_private.engine_ruleset_hash_verifications for insert to strandcue_mutator with check (true);

create function strandcue_private.engine_ruleset_hash_verification_guard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
begin
  raise exception 'engine-ruleset-hash-verification-immutable' using errcode='P0001';
end;
$$;
create trigger engine_ruleset_hash_verification_immutable
  before update or delete on strandcue_private.engine_ruleset_hash_verifications
  for each row execute function strandcue_private.engine_ruleset_hash_verification_guard();

create function strandcue_private.read_engine_ruleset_draft_for_verification_core(
  p_publication_id uuid, p_packet_digest text
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,pg_temp as $$
declare
  v_actor uuid := strandcue_private.request_uid();
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
begin
  if v_actor is null then
    raise exception 'engine-ruleset-authentication-required' using errcode='P0001';
  end if;
  select * into v_publication
    from strandcue_private.engine_ruleset_publications p
   where p.id=p_publication_id and p.authored_by=v_actor
     and p.state='draft' and p.packet_digest=p_packet_digest;
  if not found then
    raise exception 'engine-ruleset-draft-mismatch' using errcode='P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'publicationId',v_publication.id,'packetDigest',v_publication.packet_digest,
    'contentHash',v_publication.content_hash,'parentContentHash',v_publication.parent_content_hash,
    'packet',v_publication.packet);
end;
$$;

create function strandcue_private.record_engine_ruleset_hash_verification_core(
  p_publication_id uuid, p_packet_digest text, p_content_hash text, p_evaluator_version text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
declare
  v_publication strandcue_private.engine_ruleset_publications%rowtype;
  v_existing strandcue_private.engine_ruleset_hash_verifications%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
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

create function public.read_engine_ruleset_draft_for_verification(
  p_publication_id uuid, p_packet_digest text
) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
  select strandcue_private.read_engine_ruleset_draft_for_verification_core(p_publication_id,p_packet_digest)
$$;
create function public.record_engine_ruleset_hash_verification(
  p_publication_id uuid, p_packet_digest text, p_content_hash text, p_evaluator_version text
) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
  select strandcue_private.record_engine_ruleset_hash_verification_core(
    p_publication_id,p_packet_digest,p_content_hash,p_evaluator_version)
$$;

create function strandcue_private.require_engine_ruleset_hash_verification()
returns trigger language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op='UPDATE' and old.state='draft' and new.state='published' and not exists (
    select 1 from strandcue_private.engine_ruleset_hash_verifications v
     where v.publication_id=new.id and v.packet_digest=new.packet_digest
       and v.content_hash=new.content_hash
       and v.evaluator_version=new.packet #>> '{ref,evaluatorVersion}') then
    raise exception 'engine-ruleset-hash-verification-required' using errcode='P0001';
  end if;
  return new;
end;
$$;
create trigger engine_ruleset_hash_verification_required
  before update on strandcue_private.engine_ruleset_publications
  for each row execute function strandcue_private.require_engine_ruleset_hash_verification();

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
set role strandcue_mutator;

create or replace function strandcue_private.load_engine_ruleset_publication(p_content_hash text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,pg_temp as $$
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
  if v_expected_digest is distinct from v_publication.packet_digest
     or not exists (
       select 1 from strandcue_private.engine_ruleset_hash_verifications v
        where v.publication_id=v_publication.id
          and v.packet_digest=v_publication.packet_digest
          and v.content_hash=v_publication.content_hash
          and v.evaluator_version=v_publication.packet #>> '{ref,evaluatorVersion}') then
    raise exception 'engine-ruleset-publication-invalid' using errcode='P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'publicationId',v_publication.id,'contentHash',v_publication.content_hash,
    'packetDigest',v_publication.packet_digest,'parentContentHash',v_publication.parent_content_hash,
    'state',v_publication.state,'packet',v_publication.packet);
end;
$$;

reset role;

alter function strandcue_private.engine_ruleset_hash_verification_guard() owner to strandcue_mutator;
alter function strandcue_private.read_engine_ruleset_draft_for_verification_core(uuid,text) owner to strandcue_mutator;
alter function strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text) owner to strandcue_mutator;
alter function strandcue_private.require_engine_ruleset_hash_verification() owner to strandcue_mutator;
grant create on schema public to strandcue_mutator;
alter function public.read_engine_ruleset_draft_for_verification(uuid,text) owner to strandcue_mutator;
alter function public.record_engine_ruleset_hash_verification(uuid,text,text,text) owner to strandcue_mutator;
alter function strandcue_private.load_engine_ruleset_publication(text) owner to strandcue_mutator;

revoke all on function strandcue_private.engine_ruleset_hash_verification_guard(),
  strandcue_private.read_engine_ruleset_draft_for_verification_core(uuid,text),
  strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text),
  strandcue_private.require_engine_ruleset_hash_verification(),
  strandcue_private.load_engine_ruleset_publication(text),
  public.read_engine_ruleset_draft_for_verification(uuid,text),
  public.record_engine_ruleset_hash_verification(uuid,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function strandcue_private.engine_ruleset_hash_verification_guard(),
  strandcue_private.read_engine_ruleset_draft_for_verification_core(uuid,text),
  strandcue_private.record_engine_ruleset_hash_verification_core(uuid,text,text,text),
  strandcue_private.require_engine_ruleset_hash_verification(),
  strandcue_private.load_engine_ruleset_publication(text) to strandcue_mutator;
grant execute on function public.read_engine_ruleset_draft_for_verification(uuid,text) to authenticated;
grant execute on function public.record_engine_ruleset_hash_verification(uuid,text,text,text) to service_role;

revoke create on schema strandcue_private from strandcue_mutator;
revoke create on schema public from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

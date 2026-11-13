-- Reviewed, exact-version Heat Coach capability registry. Empty in production.
-- A published registry is an immutable digest-bound evidence and decision packet;
-- the read-only projection cannot acquire independently writable capabilities.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

create table if not exists strandcue_private.heat_capability_publications (
  id uuid primary key,
  content_digest text not null check (content_digest ~ '^sha256:[a-f0-9]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  state text not null check (state in ('draft','published','withdrawn')),
  adopted_by text,
  adopted_at timestamptz,
  adopted_digest text,
  approved_by text,
  approved_at timestamptz,
  approved_digest text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint heat_capability_digest_binds_content check (
    content_digest = 'sha256:' || encode(sha256(convert_to(content::text,'UTF8')),'hex')
  )
);

create or replace function strandcue_private.heat_named_reviewer(p_name text)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_name is not null and length(btrim(p_name)) between 2 and 200
    and lower(btrim(p_name)) !~ '^(placeholder|tbd|unknown|n/a|reviewer[-_ ]?[ab]?)$'
$$;

create or replace function strandcue_private.heat_capability_content_valid(p_content jsonb, p_id uuid, p_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_evidence jsonb;
  v_binding jsonb;
  v_id text;
  v_evidence_ids text[] := '{}';
  v_binding_keys text[] := '{}';
  v_version uuid;
  v_kind text;
  v_capability text;
  v_cited jsonb;
  v_previous text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object'
     or p_content - array['schemaVersion','registryId','evidenceRegistryId','evidenceRegistryVersion','evidence','bindings'] <> '{}'::jsonb
     or (select count(*) from jsonb_object_keys(p_content)) <> 6
     or p_content->>'schemaVersion' is distinct from '1' or p_content->>'registryId' is distinct from p_id::text
     or length(btrim(coalesce(p_content->>'evidenceRegistryId',''))) not between 1 and 200
     or length(btrim(coalesce(p_content->>'evidenceRegistryVersion',''))) not between 1 and 100
     or jsonb_typeof(p_content->'evidence') is distinct from 'array'
     or jsonb_typeof(p_content->'bindings') is distinct from 'array'
     or jsonb_array_length(p_content->'evidence') not between 1 and 100
     or jsonb_array_length(p_content->'bindings') not between 1 and 100 then return false; end if;

  for v_evidence in select value from jsonb_array_elements(p_content->'evidence') loop
    if jsonb_typeof(v_evidence) <> 'object'
       or v_evidence - array['evidenceId','sourceUrl','versionIds','claim','limitations','checkedAt','reviewedAt','status','market','trustTier'] <> '{}'::jsonb
       or (select count(*) from jsonb_object_keys(v_evidence)) <> 10
       or length(btrim(coalesce(v_evidence->>'evidenceId',''))) not between 1 and 200
       or coalesce(v_evidence->>'sourceUrl','') !~ '^https://[^[:space:]]+$'
       or length(btrim(coalesce(v_evidence->>'claim',''))) not between 1 and 2000
       or length(btrim(coalesce(v_evidence->>'limitations',''))) not between 1 and 2000
       or v_evidence->>'status' is distinct from 'reviewed' or v_evidence->>'market' is distinct from 'ZA'
       or coalesce(v_evidence->>'trustTier','') not in ('T1','T2','T3','T4','T5','T6','T7','T8','T9')
       or jsonb_typeof(v_evidence->'versionIds') is distinct from 'array'
       or jsonb_array_length(v_evidence->'versionIds') < 1
       or jsonb_typeof(v_evidence->'checkedAt') is distinct from 'string'
       or jsonb_typeof(v_evidence->'reviewedAt') is distinct from 'string'
       or (v_evidence->>'checkedAt')::timestamptz > p_at
       or (v_evidence->>'reviewedAt')::timestamptz > p_at then return false; end if;
    v_id := v_evidence->>'evidenceId';
    if v_id = any(v_evidence_ids) then return false; end if;
    v_evidence_ids := array_append(v_evidence_ids,v_id);
    v_previous := null;
    for v_cited in select value from jsonb_array_elements(v_evidence->'versionIds') loop
      if jsonb_typeof(v_cited) <> 'string' then return false; end if;
      v_id := v_cited #>> '{}';
      v_version := v_id::uuid;
      if v_previous is not null and v_id <= v_previous then return false; end if;
      v_previous := v_id;
    end loop;
  end loop;

  for v_binding in select value from jsonb_array_elements(p_content->'bindings') loop
    if jsonb_typeof(v_binding) <> 'object'
       or v_binding - array['kind','versionId','capability','evidenceIds','decision','authoredBy','reviewedBy','reviewedAt'] <> '{}'::jsonb
       or (select count(*) from jsonb_object_keys(v_binding)) <> 8
       or coalesce(v_binding->>'kind','') not in ('product','tool')
       or v_binding->>'decision' is distinct from 'approved'
       or jsonb_typeof(v_binding->'evidenceIds') is distinct from 'array'
       or jsonb_array_length(v_binding->'evidenceIds') < 1
       or jsonb_typeof(v_binding->'reviewedAt') is distinct from 'string'
       or not strandcue_private.heat_named_reviewer(v_binding->>'authoredBy')
       or not strandcue_private.heat_named_reviewer(v_binding->>'reviewedBy')
       or lower(btrim(v_binding->>'authoredBy')) = lower(btrim(v_binding->>'reviewedBy'))
       or (v_binding->>'reviewedAt')::timestamptz > p_at then return false; end if;
    v_kind := v_binding->>'kind';
    v_version := (v_binding->>'versionId')::uuid;
    v_capability := v_binding->>'capability';
    if (v_kind = 'product' and v_capability <> 'heat-protection')
       or (v_kind = 'tool' and v_capability <> 'heat-tool') then return false; end if;
    v_id := v_kind || ':' || v_version::text || ':' || v_capability;
    if v_id = any(v_binding_keys) then return false; end if;
    v_binding_keys := array_append(v_binding_keys,v_id);
    if v_kind = 'product' and not exists(select 1 from public.product_versions v where v.id=v_version and v.market='ZA' and v.lifecycle='active') then return false; end if;
    if v_kind = 'tool' and not exists(select 1 from public.tool_versions v where v.id=v_version and v.market='ZA' and v.lifecycle='active') then return false; end if;
    v_previous := null;
    for v_cited in select value from jsonb_array_elements(v_binding->'evidenceIds') loop
      if jsonb_typeof(v_cited) <> 'string' then return false; end if;
      v_id := v_cited #>> '{}';
      if v_previous is not null and v_id <= v_previous then return false; end if;
      v_previous := v_id;
      if not exists(select 1 from jsonb_array_elements(p_content->'evidence') e
        where e->>'evidenceId'=v_id and e->'versionIds' ? v_version::text
          and (e->>'reviewedAt')::timestamptz <= (v_binding->>'reviewedAt')::timestamptz) then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function strandcue_private.heat_capability_guard()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op <> 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('heat-capability:' || old.id::text, 0));
  end if;
  if tg_op = 'DELETE' then
    if old.state = 'draft' then return old; end if;
    raise exception 'heat-capability-immutable' using errcode='P0001';
  end if;
  if tg_op = 'UPDATE' and old.state <> 'draft' then
    if old.state='published' and new.state='withdrawn'
       and (to_jsonb(new)-'state') = (to_jsonb(old)-'state') then return new; end if;
    raise exception 'heat-capability-immutable' using errcode='P0001';
  end if;
  if new.state='published' then
    if new.published_at is null or new.published_at > transaction_timestamp()
       or new.adopted_at is null or new.approved_at is null
       or new.adopted_at > new.published_at or new.approved_at > new.published_at
       or not strandcue_private.heat_named_reviewer(new.adopted_by)
       or not strandcue_private.heat_named_reviewer(new.approved_by)
       or lower(btrim(new.adopted_by)) = lower(btrim(new.approved_by))
       or new.adopted_digest is distinct from new.content_digest
       or new.approved_digest is distinct from new.content_digest
       or not strandcue_private.heat_capability_content_valid(new.content,new.id,new.published_at) then
      raise exception 'heat-capability-not-reviewed' using errcode='P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists heat_capability_guard on strandcue_private.heat_capability_publications;
create trigger heat_capability_guard before insert or update or delete on strandcue_private.heat_capability_publications
  for each row execute function strandcue_private.heat_capability_guard();

create or replace view strandcue_private.heat_capability_registry as
  select p.id publication_id, p.content_digest registry_digest,
    binding->>'kind' kind, (binding->>'versionId')::uuid version_id,
    binding->>'capability' capability
  from strandcue_private.heat_capability_publications p
  cross join lateral jsonb_array_elements(p.content->'bindings') binding
  where p.state='published';

create or replace function strandcue_private.heat_capability_binding(
  p_registry_id uuid, p_registry_digest text, p_kind text, p_version_id uuid
)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when exists (
    select 1 from strandcue_private.heat_capability_registry r
    where r.publication_id=p_registry_id and r.registry_digest=p_registry_digest
      and r.kind=p_kind and r.version_id=p_version_id
      and ((p_kind='product' and exists(select 1 from public.product_versions v
          where v.id=p_version_id and v.market='ZA' and v.lifecycle='active'))
        or (p_kind='tool' and exists(select 1 from public.tool_versions v
          where v.id=p_version_id and v.market='ZA' and v.lifecycle='active')))
  ) then jsonb_build_object(
    'review','reviewed',
    'verifiedCapabilities',coalesce((select jsonb_agg(r.capability order by r.capability)
      from strandcue_private.heat_capability_registry r
      where r.publication_id=p_registry_id and r.registry_digest=p_registry_digest
        and r.kind=p_kind and r.version_id=p_version_id),'[]'::jsonb),
    'satisfiesExactCapability',true
  ) else jsonb_build_object('review','not_reviewed','verifiedCapabilities','[]'::jsonb,'satisfiesExactCapability',false) end
$$;

create or replace function strandcue_private.heat_construct_input(
  p_uid uuid, p_intent jsonb, p_at timestamptz, p_registry_id uuid, p_registry_digest text
)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  with original as (select strandcue_private.heat_construct_input(p_uid,p_intent,p_at) value),
  products as (
    select coalesce(jsonb_agg(case when exists (
      select 1 from public.user_products u where u.id=(item->>'ownerItemId')::uuid and u.owner=p_uid
        and u.version_id=(item->>'versionId')::uuid and u.matched and u.match_confirmed
      ) then item || strandcue_private.heat_capability_binding(
        p_registry_id,p_registry_digest,'product',(item->>'versionId')::uuid)
      else item || jsonb_build_object('identity','manual','versionId',null,'review','not_applicable',
        'verifiedCapabilities','[]'::jsonb,'satisfiesExactCapability',false) end order by item->>'ownerItemId'),'[]'::jsonb) value
    from original, jsonb_array_elements(original.value#>'{preparedInput,products}') item
  ),
  tools as (
    select coalesce(jsonb_agg(case when exists (
      select 1 from public.user_tools u where u.id=(item->>'ownerItemId')::uuid and u.owner=p_uid
        and u.version_id=(item->>'versionId')::uuid and u.matched and u.match_confirmed
      ) then item || strandcue_private.heat_capability_binding(
        p_registry_id,p_registry_digest,'tool',(item->>'versionId')::uuid)
      else item || jsonb_build_object('identity','manual','versionId',null,'review','not_applicable',
        'verifiedCapabilities','[]'::jsonb,'satisfiesExactCapability',false) end order by item->>'ownerItemId'),'[]'::jsonb) value
    from original, jsonb_array_elements(original.value#>'{preparedInput,tools}') item
  )
  select jsonb_set(jsonb_set(original.value,'{preparedInput,products}',products.value),'{preparedInput,tools}',tools.value)
  from original,products,tools
$$;

create or replace function strandcue_private.heat_capture_snapshot(
  p_uid uuid, p_intent jsonb, p_at timestamptz, p_registry_id uuid, p_registry_digest text
)
returns jsonb language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'sourceRevisions',strandcue_private.heat_source_revisions(p_uid),
    'input',strandcue_private.heat_construct_input(p_uid,p_intent,p_at,p_registry_id,p_registry_digest)
  )
$$;

alter table strandcue_private.heat_capability_publications enable row level security;
alter table strandcue_private.heat_capability_publications force row level security;
revoke all on strandcue_private.heat_capability_publications from public,anon,authenticated;
revoke all on strandcue_private.heat_capability_registry from public,anon,authenticated;
grant select on strandcue_private.heat_capability_publications to strandcue_mutator;
grant select on strandcue_private.heat_capability_registry to strandcue_mutator;
drop policy if exists heat_capability_mutator_read on strandcue_private.heat_capability_publications;
create policy heat_capability_mutator_read on strandcue_private.heat_capability_publications
  for select to strandcue_mutator using (true);

alter function strandcue_private.heat_named_reviewer(text) owner to strandcue_mutator;
alter function strandcue_private.heat_capability_content_valid(jsonb,uuid,timestamptz) owner to strandcue_mutator;
alter function strandcue_private.heat_capability_guard() owner to strandcue_mutator;
alter function strandcue_private.heat_capability_binding(uuid,text,text,uuid) owner to strandcue_mutator;
alter function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz,uuid,text) owner to strandcue_mutator;
alter function strandcue_private.heat_capture_snapshot(uuid,jsonb,timestamptz,uuid,text) owner to strandcue_mutator;
revoke all on function strandcue_private.heat_named_reviewer(text) from public,anon,authenticated;
revoke all on function strandcue_private.heat_capability_content_valid(jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function strandcue_private.heat_capability_guard() from public,anon,authenticated;
revoke all on function strandcue_private.heat_capability_binding(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz,uuid,text) from public,anon,authenticated;
revoke all on function strandcue_private.heat_capture_snapshot(uuid,jsonb,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function strandcue_private.heat_capability_binding(uuid,text,text,uuid) to strandcue_mutator;
grant execute on function strandcue_private.heat_construct_input(uuid,jsonb,timestamptz,uuid,text) to strandcue_mutator;
grant execute on function strandcue_private.heat_capture_snapshot(uuid,jsonb,timestamptz,uuid,text) to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

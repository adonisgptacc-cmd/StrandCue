-- A published Heat Coach rule is executable only with an independently reviewed,
-- immutable packet binding exact evidence, copy and capability publication.
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

alter table strandcue_private.heat_rule_publications
  add column if not exists review_envelope jsonb;

create or replace function strandcue_private.heat_publication_review_valid(
  p_id uuid, p_digest text, p_rule jsonb, p_envelope jsonb, p_now timestamptz
) returns boolean language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
declare
  v_evidence jsonb;
  v_copy jsonb;
  v_item jsonb;
  v_key text;
  v_registry_id uuid;
  v_registry_digest text;
  v_evidence_digest text;
  v_copy_digest text;
  v_reviewed_digest text;
begin
  if jsonb_typeof(p_rule) <> 'object' or jsonb_typeof(p_envelope) <> 'object'
    or p_rule->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(p_rule->'publicationId') is distinct from 'string'
    or p_rule->>'publicationId' is distinct from p_id::text
    or p_rule - array['schemaVersion','publicationId','ruleVersion','digest','lifecycle',
      'validFrom','validUntil','requiredProductCapability','allowedMethods','limits',
      'necessityRules','hardRestrictions','alternatives','reasonCode','copyKey'] <> '{}'::jsonb
    or not (p_rule ?& array['schemaVersion','publicationId','ruleVersion','digest','lifecycle',
      'validFrom','validUntil','requiredProductCapability','allowedMethods','limits',
      'necessityRules','hardRestrictions','alternatives','reasonCode','copyKey'])
    or coalesce(p_rule->>'ruleVersion','') !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    or p_rule->>'digest' is distinct from substring(p_digest from 8)
    or (p_rule->>'requiredProductCapability' is not null
      and p_rule->>'requiredProductCapability' <> 'heat-protection')
    or p_rule->>'lifecycle' is distinct from 'reviewed'
    or jsonb_typeof(p_rule->'validFrom') is distinct from 'string'
    or jsonb_typeof(p_rule->'allowedMethods') is distinct from 'array'
    or jsonb_typeof(p_rule->'necessityRules') is distinct from 'array'
    or jsonb_typeof(p_rule->'reasonCode') is distinct from 'string'
    or jsonb_typeof(p_rule->'copyKey') is distinct from 'string'
    or p_envelope->'schemaVersion' is distinct from '1'::jsonb
    or p_envelope - array['schemaVersion','evidenceRegistryId','evidenceRegistryVersion',
      'evidenceSnapshotDigest','evidence','capabilityRegistryId','capabilityRegistryDigest',
      'copyDigest','copy','reviewedContentDigest','adoption','approval'] <> '{}'::jsonb
    or not (p_envelope ?& array['schemaVersion','evidenceRegistryId','evidenceRegistryVersion',
      'evidenceSnapshotDigest','evidence','capabilityRegistryId','capabilityRegistryDigest',
      'copyDigest','copy','reviewedContentDigest','adoption','approval'])
    or nullif(btrim(p_envelope->>'evidenceRegistryId'),'') is null
    or nullif(btrim(p_envelope->>'evidenceRegistryVersion'),'') is null
    or (p_rule->>'validFrom')::timestamptz > p_now
    or ((p_rule->>'validUntil') is not null and (p_rule->>'validUntil')::timestamptz <= p_now)
    or jsonb_typeof(p_rule->'limits') <> 'object'
    or jsonb_typeof(p_rule#>'{limits,temperatures}') <> 'array'
    or jsonb_typeof(p_rule#>'{limits,namedSettings}') <> 'array'
    or jsonb_typeof(p_rule->'hardRestrictions') <> 'array'
    or jsonb_typeof(p_rule->'alternatives') <> 'array' then return false; end if;

  if jsonb_array_length(p_rule->'allowedMethods') not between 1 and 5
    or exists(select 1 from jsonb_array_elements_text(p_rule->'allowedMethods') method
      where method not in ('direct-contact','heated-air','hooded','steam','unheated'))
    or (select count(*) from jsonb_array_elements_text(p_rule->'allowedMethods')) <>
       (select count(distinct method) from jsonb_array_elements_text(p_rule->'allowedMethods') method)
    or coalesce(p_rule->>'reasonCode','') !~ '^[a-z][a-z0-9_]{0,63}$'
    or coalesce(p_rule->>'copyKey','') !~ '^heat\.[a-z0-9_.-]{1,100}$'
    then return false; end if;

  if jsonb_array_length(p_rule#>'{limits,temperatures}') not in (0,2) then return false; end if;
  if jsonb_array_length(p_rule#>'{limits,temperatures}')=2 and
    (select array_agg(item->>'unit' order by item->>'unit')
      from jsonb_array_elements(p_rule#>'{limits,temperatures}') item) <> array['C','F'] then return false; end if;
  if (p_rule->'limits') - array['temperatures','namedSettings','maximumPasses','maximumDurationMinutes'] <> '{}'::jsonb
    or not ((p_rule->'limits') ?& array['temperatures','namedSettings','maximumPasses','maximumDurationMinutes'])
    or jsonb_typeof(p_rule->'limits'->'maximumPasses') not in ('number','null')
    or jsonb_typeof(p_rule->'limits'->'maximumDurationMinutes') not in ('number','null')
    or (p_rule->'limits'->>'maximumPasses') is not null and
      (p_rule->'limits'->>'maximumPasses')::numeric not between 0 and 100
    or (p_rule->'limits'->>'maximumDurationMinutes') is not null and
      (p_rule->'limits'->>'maximumDurationMinutes')::numeric not between 0 and 1440
    then return false; end if;
  for v_item in select value from jsonb_array_elements(p_rule#>'{limits,temperatures}') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['unit','maximum'] <> '{}'::jsonb
      or not (v_item ?& array['unit','maximum'])
      or v_item->>'unit' not in ('C','F')
      or jsonb_typeof(v_item->'maximum') is distinct from 'number' then return false; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_rule->'necessityRules') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['necessity','goals','concerns'] <> '{}'::jsonb
      or not (v_item ?& array['necessity','goals','concerns'])
      or coalesce(v_item->>'necessity','') not in ('not_needed','optional','supports_goal','unknown')
      or jsonb_typeof(v_item->'goals') is distinct from 'array'
      or jsonb_array_length(v_item->'goals') not between 1 and 20
      or jsonb_typeof(v_item->'concerns') is distinct from 'array'
      then return false; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_rule->'hardRestrictions') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['concerns','servicePresence','zones','outcome','reasonCode','copyKey'] <> '{}'::jsonb
      or not (v_item ?& array['concerns','servicePresence','zones','outcome','reasonCode','copyKey'])
      or jsonb_typeof(v_item->'concerns') is distinct from 'array'
      or jsonb_typeof(v_item->'zones') is distinct from 'array'
      or v_item->>'servicePresence' not in ('present','not-present') and v_item->'servicePresence' <> 'null'::jsonb
      or coalesce(v_item->>'outcome','') not in ('restricted','no_heat')
      or coalesce(v_item->>'reasonCode','') !~ '^[a-z][a-z0-9_]{0,63}$'
      or coalesce(v_item->>'copyKey','') !~ '^heat\.[a-z0-9_.-]{1,100}$'
      then return false; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_rule#>'{limits,namedSettings}') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['toolVersionId','label'] <> '{}'::jsonb
      or not (v_item ?& array['toolVersionId','label'])
      or jsonb_typeof(v_item->'toolVersionId') is distinct from 'string'
      or (v_item->>'toolVersionId')::uuid is null
      or jsonb_typeof(v_item->'label') is distinct from 'string'
      or nullif(btrim(v_item->>'label'),'') is null
      or length(v_item->>'label') > 60 then return false; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_rule->'alternatives') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['method','temperature','setting','reasonCode','copyKey','toolVersionId','productVersionId'] <> '{}'::jsonb
      or not (v_item ?& array['method','temperature','setting','reasonCode','copyKey','toolVersionId','productVersionId'])
      or coalesce(v_item->>'method','') not in ('direct-contact','heated-air','hooded','steam','unheated')
      or jsonb_typeof(v_item->'temperature') not in ('object','null')
      or (jsonb_typeof(v_item->'temperature')='object' and (
        (v_item->'temperature') - array['unit','value'] <> '{}'::jsonb
        or not ((v_item->'temperature') ?& array['unit','value'])
        or (v_item#>>'{temperature,unit}') not in ('C','F')
        or jsonb_typeof(v_item#>'{temperature,value}') is distinct from 'number'
        or (v_item#>>'{temperature,value}')::numeric <> trunc((v_item#>>'{temperature,value}')::numeric)
        or ((v_item#>>'{temperature,unit}')='C' and (v_item#>>'{temperature,value}')::numeric not between 30 and 300)
        or ((v_item#>>'{temperature,unit}')='F' and (v_item#>>'{temperature,value}')::numeric not between 86 and 572)))
      or jsonb_typeof(v_item->'setting') not in ('string','null')
      or (jsonb_typeof(v_item->'setting')='string' and
        (nullif(btrim(v_item->>'setting'),'') is null or length(v_item->>'setting') > 60))
      or coalesce(v_item->>'reasonCode','') !~ '^[a-z][a-z0-9_]{0,63}$'
      or coalesce(v_item->>'copyKey','') !~ '^heat\.[a-z0-9_.-]{1,100}$'
      or jsonb_typeof(v_item->'toolVersionId') not in ('string','null')
      or jsonb_typeof(v_item->'productVersionId') not in ('string','null')
      then return false; end if;
  end loop;

  v_evidence := p_envelope->'evidence';
  v_copy := p_envelope->'copy';
  if jsonb_typeof(v_evidence) <> 'array' or jsonb_array_length(v_evidence) < 1
    or jsonb_typeof(v_copy) <> 'array' then return false; end if;
  v_evidence_digest := 'sha256:'||encode(sha256(convert_to(v_evidence::text,'UTF8')),'hex');
  v_copy_digest := 'sha256:'||encode(sha256(convert_to(v_copy::text,'UTF8')),'hex');
  if p_envelope->>'evidenceSnapshotDigest' is distinct from v_evidence_digest
    or p_envelope->>'copyDigest' is distinct from v_copy_digest then return false; end if;

  v_registry_id := (p_envelope->>'capabilityRegistryId')::uuid;
  v_registry_digest := p_envelope->>'capabilityRegistryDigest';
  if v_registry_digest !~ '^sha256:[a-f0-9]{64}$'
    or not exists(select 1 from strandcue_private.heat_capability_publications r
      where r.id=v_registry_id and r.content_digest=v_registry_digest and r.state='published'
      and r.content->>'evidenceRegistryId'=p_envelope->>'evidenceRegistryId'
      and r.content->>'evidenceRegistryVersion'=p_envelope->>'evidenceRegistryVersion'
      and r.content->'evidence'=v_evidence)
    then return false; end if;
  v_reviewed_digest := 'sha256:'||encode(sha256(convert_to(
    p_digest||'|'||v_evidence_digest||'|'||v_copy_digest||'|'||v_registry_id::text||'|'||v_registry_digest,
    'UTF8')),'hex');
  if p_envelope->>'reviewedContentDigest' is distinct from v_reviewed_digest then return false; end if;

  for v_item in select value from jsonb_array_elements(v_evidence) loop
    if jsonb_typeof(v_item)<>'object' or
      v_item - array['evidenceId','sourceUrl','versionIds','claim','limitations',
        'checkedAt','reviewedAt','status','market','trustTier'] <> '{}'::jsonb
      or not (v_item ?& array['evidenceId','sourceUrl','versionIds','claim','limitations',
        'checkedAt','reviewedAt','status','market','trustTier'])
      or nullif(btrim(v_item->>'evidenceId'),'') is null
      or nullif(btrim(v_item->>'sourceUrl'),'') is null
      or nullif(btrim(v_item->>'claim'),'') is null
      or nullif(btrim(v_item->>'limitations'),'') is null
      or jsonb_typeof(v_item->'versionIds')<>'array'
      or v_item->>'status'<>'reviewed' or v_item->>'market'<>'ZA'
      or v_item->>'trustTier' not in ('T1','T2','T3','T4','T5','T6','T7','T8','T9')
      or (v_item->>'checkedAt')::timestamptz > p_now
      or (v_item->>'reviewedAt')::timestamptz > p_now then return false; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(v_evidence)) <>
    (select count(distinct item->>'evidenceId') from jsonb_array_elements(v_evidence) item)
    then return false; end if;

  for v_key in select distinct key from (
    select p_rule->>'copyKey' key union all
    select item->>'copyKey' from jsonb_array_elements(p_rule->'hardRestrictions') item union all
    select item->>'copyKey' from jsonb_array_elements(p_rule->'alternatives') item
  ) required loop
    if v_key !~ '^heat\.[a-z0-9_.-]{1,100}$' then return false; end if;
    select item into v_item from jsonb_array_elements(v_copy) item where item->>'copyKey'=v_key;
    if v_item is null or not (v_item ?& array['copyKey','text','evidenceIds','contentDigest',
        'status','authoredBy','reviewedBy','reviewedAt'])
      or v_item->>'status' is distinct from 'reviewed'
      or v_item->>'contentDigest' is distinct from p_digest
      or nullif(btrim(v_item->>'text'),'') is null
      or nullif(btrim(v_item->>'authoredBy'),'') is null
      or nullif(btrim(v_item->>'reviewedBy'),'') is null
      or lower(btrim(v_item->>'authoredBy'))=lower(btrim(v_item->>'reviewedBy'))
      or jsonb_typeof(v_item->'evidenceIds')<>'array'
      or jsonb_array_length(v_item->'evidenceIds')<1
      or jsonb_typeof(v_item->'reviewedAt') is distinct from 'string'
      or (v_item->>'reviewedAt')::timestamptz > p_now
      or exists(select 1 from jsonb_array_elements_text(v_item->'evidenceIds') e(id)
        where not exists(select 1 from jsonb_array_elements(v_evidence) source
          where source->>'evidenceId'=e.id)) then return false; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_copy) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or v_item - array['copyKey','text','evidenceIds','contentDigest','status',
        'authoredBy','reviewedBy','reviewedAt'] <> '{}'::jsonb
      or not (v_item ?& array['copyKey','text','evidenceIds','contentDigest','status',
        'authoredBy','reviewedBy','reviewedAt'])
      or coalesce(v_item->>'copyKey','') !~ '^heat\.[a-z0-9_.-]{1,100}$'
      or nullif(btrim(v_item->>'text'),'') is null
      or v_item->>'status' is distinct from 'reviewed'
      or v_item->>'contentDigest' is distinct from p_digest
      or not strandcue_private.heat_named_reviewer(v_item->>'authoredBy')
      or not strandcue_private.heat_named_reviewer(v_item->>'reviewedBy')
      or lower(btrim(v_item->>'authoredBy'))=lower(btrim(v_item->>'reviewedBy'))
      or jsonb_typeof(v_item->'reviewedAt') is distinct from 'string'
      or (v_item->>'reviewedAt')::timestamptz > p_now
      or jsonb_typeof(v_item->'evidenceIds') is distinct from 'array'
      or jsonb_array_length(v_item->'evidenceIds')<1
      or exists(select 1 from jsonb_array_elements_text(v_item->'evidenceIds') e(id)
        where not exists(select 1 from jsonb_array_elements(v_evidence) source
          where source->>'evidenceId'=e.id)) then return false; end if;
  end loop;
  if (select count(*) from jsonb_array_elements(v_copy)) <>
    (select count(distinct item->>'copyKey') from jsonb_array_elements(v_copy) item)
    then return false; end if;

  for v_key in select 'adoption' union all select 'approval' loop
    v_item := p_envelope->v_key;
    if jsonb_typeof(v_item)<>'object'
      or not (v_item ?& array['decision','reviewer','reviewedAt','contentDigest'])
      or v_item - array['decision','reviewer','reviewedAt','contentDigest'] <> '{}'::jsonb
      or v_item->>'decision' is distinct from (case when v_key='adoption' then 'adopted' else 'approved' end)
      or v_item->>'contentDigest' is distinct from v_reviewed_digest
      or not strandcue_private.heat_named_reviewer(v_item->>'reviewer')
      or jsonb_typeof(v_item->'reviewedAt') is distinct from 'string'
      or (v_item->>'reviewedAt')::timestamptz > p_now
      or exists(select 1 from jsonb_array_elements(v_evidence) e
        where (v_item->>'reviewedAt')::timestamptz < (e->>'reviewedAt')::timestamptz)
      then return false; end if;
  end loop;
  if lower(btrim(p_envelope#>>'{adoption,reviewer}')) =
    lower(btrim(p_envelope#>>'{approval,reviewer}')) then return false; end if;
  if (p_envelope#>>'{approval,reviewedAt}')::timestamptz <
    (p_envelope#>>'{adoption,reviewedAt}')::timestamptz then return false; end if;

  -- Every referenced exact version has source evidence and an approved registry row.
  for v_item in select value from (
    select value from jsonb_array_elements(p_rule#>'{limits,namedSettings}')
    union all select value from jsonb_array_elements(p_rule->'alternatives')
  ) referenced_items loop
    if v_item ? 'toolVersionId' and v_item->>'toolVersionId' is not null then
      if not exists(select 1 from strandcue_private.heat_capability_registry c
        where c.publication_id=v_registry_id and c.kind='tool'
        and c.version_id=(v_item->>'toolVersionId')::uuid and c.capability='heat-tool')
        or not exists(select 1 from jsonb_array_elements(v_evidence) e
          where e->'versionIds' ? (v_item->>'toolVersionId')) then return false; end if;
    end if;
    if v_item ? 'productVersionId' and v_item->>'productVersionId' is not null then
      if not exists(select 1 from strandcue_private.heat_capability_registry c
        where c.publication_id=v_registry_id and c.kind='product'
        and c.version_id=(v_item->>'productVersionId')::uuid
        and c.capability=coalesce(p_rule->>'requiredProductCapability','heat-protection'))
        or not exists(select 1 from jsonb_array_elements(v_evidence) e
          where e->'versionIds' ? (v_item->>'productVersionId')) then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function strandcue_private.heat_rule_publish_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.state='published' and not strandcue_private.heat_publication_review_valid(
    new.id,new.content_digest,new.rule,new.review_envelope,statement_timestamp()) then
    raise exception 'heat-publication-review-invalid' using errcode='P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists heat_rule_publish_guard on strandcue_private.heat_rule_publications;
create trigger heat_rule_publish_guard before insert or update on strandcue_private.heat_rule_publications
  for each row execute function strandcue_private.heat_rule_publish_guard();

-- Every trusted server read must recheck the packet. A later capability
-- withdrawal hides the executable rule and makes historical assessments stale.
drop policy if exists heat_rule_mutator_read on strandcue_private.heat_rule_publications;
create policy heat_rule_mutator_read on strandcue_private.heat_rule_publications
  for select to strandcue_mutator using (
    state <> 'published' or strandcue_private.heat_publication_review_valid(
      id, content_digest, rule, review_envelope, statement_timestamp())
  );

create or replace function strandcue_private.heat_rule_guard()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('heat-publication:' || old.id::text, 0));
  if tg_op='DELETE' then
    if old.state='draft' then return old; end if;
    raise exception 'heat-rule-immutable' using errcode='P0001';
  end if;
  if old.state='draft' then return new; end if;
  if old.state='published' and new.state='withdrawn' and new.id=old.id and new.content_digest=old.content_digest
    and new.rule is not distinct from old.rule and new.review_envelope is not distinct from old.review_envelope
    and new.authored_by=old.authored_by and new.reviewed_by is not distinct from old.reviewed_by
    and new.reviewed_at is not distinct from old.reviewed_at and new.published_at is not distinct from old.published_at then return new; end if;
  raise exception 'heat-rule-immutable' using errcode='P0001';
end;
$$;

alter function strandcue_private.heat_publication_review_valid(uuid,text,jsonb,jsonb,timestamptz) owner to strandcue_mutator;
alter function strandcue_private.heat_rule_publish_guard() owner to strandcue_mutator;
alter function strandcue_private.heat_rule_guard() owner to strandcue_mutator;
revoke all on function strandcue_private.heat_publication_review_valid(uuid,text,jsonb,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function strandcue_private.heat_rule_publish_guard() from public,anon,authenticated;
revoke all on function strandcue_private.heat_rule_guard() from public,anon,authenticated;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

-- Tool catalogue publication boundary, search, detail and the owner export (Increment 2, Task 2.4).
--
-- Task 2.3 closed this exposure for products and recorded the tool catalogue as follow-up work: any
-- signed-in consumer could read every tool claim, source, verification event (with reviewer names)
-- and the capability columns of every tool version, draft or not, and the owner export embedded whole
-- tool version rows, claims and events. This migration does for tools what 20261022120000 did for
-- products, and nothing is published by it:
--
-- 1. `tool_publications` (capabilities, successor link, each claim) and `tool_claim_evidence` record
--    publication; no consumer can read or write them. Only a `published` row is ever shown; a missing,
--    draft, rejected, superseded or withdrawn row never is. No row is created here, so no capability,
--    claim or evidence is published and no reviewer decision is invented.
-- 2. Publishing needs a second, named person and dates (table constraint), and a digest taken when the
--    review begins must still match at publication, for publications and for evidence. A row cannot be
--    published without having been in review.
-- 3. Published content is immutable: guards refuse editing or deleting published, superseded and
--    withdrawn rows and the claim, source or version they depend on (a version may only be retired
--    once and gain a successor link once, and never one that has been reviewed). TRUNCATE is refused.
--    The guards run with row security off, so a role that cannot see the tables gets an error, never
--    a silent edit.
-- 4. Consumers lose direct reads of claims, sources, verification events and the capability and
--    successor columns of `tool_versions`; identity and lifecycle columns stay readable.
-- 5. One narrow SECURITY DEFINER core owned by the existing read-only role returns an allowlisted,
--    bounded, ordered detail; an invoker wrapper binds an optional owner context to the caller.
--    Search answers identity and lifecycle only and never returns a successor id.
-- 6. The owner export carries owner-entered tool facts, immutable history and the matched identity and
--    lifecycle only (never whole version rows, claims, events or reviewer names). The document shape
--    changed, so the export schema version moves 3 -> 4 in the JSON and the CSV.
--
-- Forward-only and rerunnable: `if not exists`, `create or replace`, recreated policies and triggers,
-- idempotent grants.

grant strandcue_catalogue_reader to current_user with set true;
grant create on schema strandcue_private to strandcue_catalogue_reader;
grant usage on schema public to strandcue_catalogue_reader;
grant usage on schema strandcue_private to strandcue_catalogue_reader;

create unique index if not exists tool_claim_id_version_uidx on public.tool_claims(id, version_id);
create unique index if not exists tool_source_id_version_uidx on public.tool_sources(id, version_id);

-- --- Publication ------------------------------------------------------------

create table if not exists public.tool_publications (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.tool_versions(id) on delete restrict,
  subject text not null check (subject in ('capabilities', 'successor', 'claim')),
  claim_id uuid,
  state text not null check (state in ('review', 'published', 'rejected', 'superseded', 'withdrawn')),
  authored_by text not null check (length(btrim(authored_by)) between 1 and 200),
  reviewed_by text check (reviewed_by is null or length(btrim(reviewed_by)) between 1 and 200),
  reviewed_at timestamptz,
  published_at timestamptz,
  reviewed_digest text,
  created_at timestamptz not null default now(),
  constraint tool_publication_claim_subject check ((subject = 'claim') = (claim_id is not null)),
  constraint tool_publication_claim_fk foreign key (claim_id, version_id)
    references public.tool_claims(id, version_id) on delete restrict,
  constraint tool_publication_review check (
    state <> 'published' or (
      reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))
      and lower(btrim(reviewed_by)) <> all (array[
        'unknown', 'unassigned', 'unassigned-draft', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'tba', 'todo',
        'pending', 'placeholder', 'example', 'reviewer', 'author', 'reviewer-1', 'reviewer-a', 'reviewer-b',
        'author-a', 'author-b', 'fixture', 'fake', 'dummy', 'synthetic', 'test'])
    ))
);
create index if not exists tool_publication_version_idx on public.tool_publications(version_id);
create unique index if not exists tool_publication_one_published_subject
  on public.tool_publications(version_id, subject) where state = 'published' and claim_id is null;
create unique index if not exists tool_publication_one_published_claim
  on public.tool_publications(claim_id) where state = 'published';

create table if not exists public.tool_claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null,
  version_id uuid not null,
  source_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  publisher text not null check (length(btrim(publisher)) between 1 and 200),
  applicability text not null check (length(btrim(applicability)) between 1 and 1000),
  limitations text not null check (length(btrim(limitations)) between 1 and 1000),
  excerpt text check (excerpt is null or length(btrim(excerpt)) between 1 and 1000),
  excerpt_consumer_approved boolean not null default false,
  state text not null check (state in ('review', 'published', 'rejected', 'superseded', 'withdrawn')),
  authored_by text not null check (length(btrim(authored_by)) between 1 and 200),
  reviewed_by text check (reviewed_by is null or length(btrim(reviewed_by)) between 1 and 200),
  reviewed_at timestamptz,
  published_at timestamptz,
  reviewed_digest text,
  created_at timestamptz not null default now(),
  constraint tool_evidence_claim_fk foreign key (claim_id, version_id)
    references public.tool_claims(id, version_id) on delete restrict,
  constraint tool_evidence_source_fk foreign key (source_id, version_id)
    references public.tool_sources(id, version_id) on delete restrict,
  constraint tool_evidence_review check (
    state <> 'published' or (
      reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))
      and lower(btrim(reviewed_by)) <> all (array[
        'unknown', 'unassigned', 'unassigned-draft', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'tba', 'todo',
        'pending', 'placeholder', 'example', 'reviewer', 'author', 'reviewer-1', 'reviewer-a', 'reviewer-b',
        'author-a', 'author-b', 'fixture', 'fake', 'dummy', 'synthetic', 'test'])
    ))
);
create index if not exists tool_evidence_claim_idx on public.tool_claim_evidence(claim_id);
create index if not exists tool_evidence_source_idx on public.tool_claim_evidence(source_id);

alter table public.tool_publications enable row level security;
alter table public.tool_claim_evidence enable row level security;
alter table public.tool_publications force row level security;
alter table public.tool_claim_evidence force row level security;

drop policy if exists tool_publication_reader on public.tool_publications;
drop policy if exists tool_evidence_reader on public.tool_claim_evidence;
create policy tool_publication_reader on public.tool_publications for select to strandcue_catalogue_reader using (true);
create policy tool_evidence_reader on public.tool_claim_evidence for select to strandcue_catalogue_reader using (true);
revoke all on public.tool_publications, public.tool_claim_evidence from public, anon, authenticated;
grant select on public.tool_publications, public.tool_claim_evidence to strandcue_catalogue_reader;

drop policy if exists tool_brand_reader on public.tool_brands;
drop policy if exists tool_reader on public.tools;
drop policy if exists tool_version_reader on public.tool_versions;
drop policy if exists tool_claim_reader on public.tool_claims;
drop policy if exists tool_source_reader on public.tool_sources;
create policy tool_brand_reader on public.tool_brands for select to strandcue_catalogue_reader using (true);
create policy tool_reader on public.tools for select to strandcue_catalogue_reader using (true);
create policy tool_version_reader on public.tool_versions for select to strandcue_catalogue_reader using (true);
create policy tool_claim_reader on public.tool_claims for select to strandcue_catalogue_reader using (true);
create policy tool_source_reader on public.tool_sources for select to strandcue_catalogue_reader using (true);
grant select on public.tool_brands, public.tools, public.tool_versions, public.tool_claims, public.tool_sources
  to strandcue_catalogue_reader;

-- --- Close the draft content consumers could read directly -------------------

revoke select on public.tool_claims, public.tool_sources, public.tool_verification_events from authenticated;
drop policy if exists tool_claim_read on public.tool_claims;
drop policy if exists tool_source_read on public.tool_sources;
drop policy if exists tool_verification_event_read on public.tool_verification_events;
create policy tool_claim_read on public.tool_claims for select to strandcue_mutator using (true);
create policy tool_source_read on public.tool_sources for select to strandcue_mutator using (true);
create policy tool_verification_event_read on public.tool_verification_events for select to strandcue_mutator using (true);

-- Identity and lifecycle only: the capability facts and the successor link are published content.
revoke select on public.tool_versions from authenticated;
grant select (id, tool_id, version_label, market, lifecycle, created_at) on public.tool_versions to authenticated;

-- --- Digests, binding and immutability ---------------------------------------

create or replace function strandcue_private.tool_publication_digest(p_version_id uuid, p_subject text, p_claim_id uuid)
returns text language sql stable set search_path = '' as $$
  select md5(case p_subject
    when 'capabilities' then coalesce((select concat_ws(chr(31), coalesce(ver.wattage_watts::text, '<none>'), coalesce(ver.temperature_max_celsius::text, '<none>'),
      ver.adjustable_temp, ver.contact_heat, ver.air_heat) from public.tool_versions ver where ver.id = p_version_id), '')
    when 'successor' then coalesce((select ver.successor_version_id::text from public.tool_versions ver where ver.id = p_version_id), '')
    else coalesce((select c.claim_key || chr(31) || coalesce(c.statement, '') from public.tool_claims c where c.id = p_claim_id), '')
  end);
$$;

create or replace function strandcue_private.tool_evidence_digest(
  p_source_id uuid, p_title text, p_publisher text, p_applicability text, p_limitations text, p_excerpt text, p_approved boolean)
returns text language sql stable set search_path = '' as $$
  select md5(concat_ws(chr(31), p_title, p_publisher, p_applicability, p_limitations, coalesce(p_excerpt, ''), p_approved::text,
    coalesce((select concat_ws(chr(31), s.source_url, coalesce(s.archived_url, ''), s.source_type, s.trust_tier, s.market,
                               s.first_seen::text, s.last_checked::text)
                from public.tool_sources s where s.id = p_source_id), '')));
$$;

create or replace function strandcue_private.bind_tool_publication_review()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
begin
  if tg_op = 'UPDATE' and old.state in ('published', 'superseded', 'withdrawn') then return new; end if;
  if new.state = 'review' then
    new.reviewed_digest := case when tg_op = 'INSERT'
      then strandcue_private.tool_publication_digest(new.version_id, new.subject, new.claim_id) else old.reviewed_digest end;
  elsif new.state = 'published' then
    if tg_op = 'INSERT' or old.state <> 'review' then raise exception 'review-required' using errcode = '23000'; end if;
    if old.reviewed_digest is distinct from strandcue_private.tool_publication_digest(new.version_id, new.subject, new.claim_id) then
      raise exception 'content-changed-since-review' using errcode = '23000';
    end if;
    new.reviewed_digest := old.reviewed_digest;
  end if;
  return new;
end;
$$;

create or replace function strandcue_private.bind_tool_evidence_review()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
begin
  if tg_op = 'UPDATE' and old.state in ('published', 'superseded', 'withdrawn') then return new; end if;
  if new.state = 'review' then
    new.reviewed_digest := case when tg_op = 'INSERT'
      then strandcue_private.tool_evidence_digest(new.source_id, new.title, new.publisher, new.applicability, new.limitations,
        new.excerpt, new.excerpt_consumer_approved) else old.reviewed_digest end;
  elsif new.state = 'published' then
    if tg_op = 'INSERT' or old.state <> 'review' then raise exception 'review-required' using errcode = '23000'; end if;
    if old.reviewed_digest is distinct from strandcue_private.tool_evidence_digest(new.source_id, new.title, new.publisher,
        new.applicability, new.limitations, new.excerpt, new.excerpt_consumer_approved) then
      raise exception 'content-changed-since-review' using errcode = '23000';
    end if;
    new.reviewed_digest := old.reviewed_digest;
  end if;
  return new;
end;
$$;

create or replace function strandcue_private.guard_published_tool_content()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
declare
  locked boolean;
begin
  if tg_table_name = 'tool_versions' then
    locked := exists (select 1 from public.tool_publications p where p.version_id = old.id and p.state = 'published');
    if not locked then return case when tg_op = 'DELETE' then old else new end; end if;
    if tg_op = 'DELETE' then raise exception 'published-immutable' using errcode = '23000'; end if;
    -- A published version may only be retired (once) and gain a successor link (once), and a successor
    -- link that has any review at all is never changed.
    if (to_jsonb(new) - 'lifecycle' - 'successor_version_id') = (to_jsonb(old) - 'lifecycle' - 'successor_version_id')
      and (new.lifecycle = old.lifecycle or (old.lifecycle = 'active' and new.lifecycle = 'retired'))
      and (new.successor_version_id is not distinct from old.successor_version_id
           or (old.successor_version_id is null
               and not exists (select 1 from public.tool_publications p where p.version_id = old.id and p.subject = 'successor'))) then
      return new;
    end if;
    raise exception 'published-immutable' using errcode = '23000';
  elsif tg_table_name = 'tool_claims' then
    locked := exists (select 1 from public.tool_publications p where p.claim_id = old.id and p.state = 'published');
  else
    locked := exists (select 1 from public.tool_claim_evidence e where e.source_id = old.id and e.state = 'published');
  end if;
  if locked then raise exception 'published-immutable' using errcode = '23000'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function strandcue_private.tool_publication_digest(uuid, text, uuid),
  strandcue_private.tool_evidence_digest(uuid, text, text, text, text, text, boolean),
  strandcue_private.bind_tool_publication_review(), strandcue_private.bind_tool_evidence_review(),
  strandcue_private.guard_published_tool_content() from public, anon, authenticated;

drop trigger if exists tool_publication_bind on public.tool_publications;
create trigger tool_publication_bind before insert or update on public.tool_publications
  for each row execute function strandcue_private.bind_tool_publication_review();
drop trigger if exists tool_evidence_bind on public.tool_claim_evidence;
create trigger tool_evidence_bind before insert or update on public.tool_claim_evidence
  for each row execute function strandcue_private.bind_tool_evidence_review();
drop trigger if exists tool_publication_guard on public.tool_publications;
create trigger tool_publication_guard before update or delete on public.tool_publications
  for each row execute function strandcue_private.guard_publication_row();
drop trigger if exists tool_evidence_guard on public.tool_claim_evidence;
create trigger tool_evidence_guard before update or delete on public.tool_claim_evidence
  for each row execute function strandcue_private.guard_publication_row();
drop trigger if exists tool_publication_truncate on public.tool_publications;
create trigger tool_publication_truncate before truncate on public.tool_publications
  for each statement execute function strandcue_private.refuse_truncate();
drop trigger if exists tool_evidence_truncate on public.tool_claim_evidence;
create trigger tool_evidence_truncate before truncate on public.tool_claim_evidence
  for each statement execute function strandcue_private.refuse_truncate();
drop trigger if exists tool_version_guard on public.tool_versions;
create trigger tool_version_guard before update or delete on public.tool_versions
  for each row execute function strandcue_private.guard_published_tool_content();
drop trigger if exists tool_claim_guard on public.tool_claims;
create trigger tool_claim_guard before update or delete on public.tool_claims
  for each row execute function strandcue_private.guard_published_tool_content();
drop trigger if exists tool_source_guard on public.tool_sources;
create trigger tool_source_guard before update or delete on public.tool_sources
  for each row execute function strandcue_private.guard_published_tool_content();

-- --- Search (identity and lifecycle only) --------------------------------------

create or replace function public.tool_catalogue_search(p_query text, p_limit integer default 10)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_query text;
  v_terms text[];
  v_found integer;
  v_results jsonb;
  v_hidden text := '[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159)
    || chr(173) || chr(1564) || chr(6158) || chr(8203) || '-' || chr(8207)
    || chr(8232) || '-' || chr(8238) || chr(8288) || '-' || chr(8303) || chr(65279) || ']';
begin
  if strandcue_private.request_uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if p_query is null or p_limit is null or p_limit < 1 or p_limit > 25 or length(p_query) > 400 then
    raise exception 'invalid-search' using errcode = '22023';
  end if;
  v_query := btrim(regexp_replace(normalize(p_query, nfkc), '\s+', ' ', 'g'));
  if length(v_query) < 2 or length(v_query) > 80 or v_query ~ v_hidden then
    raise exception 'invalid-search' using errcode = '22023';
  end if;
  v_terms := string_to_array(lower(v_query), ' ');
  if cardinality(v_terms) > 6 or exists (select 1 from unnest(v_terms) as t(word) where length(t.word) < 2) then
    raise exception 'invalid-search' using errcode = '22023';
  end if;

  with versions as (
    select ver.id as version_id, t.id as tool_id, b.name as brand, t.name as tool_name, ver.version_label, t.tool_type,
           ver.market, ver.lifecycle,
           lower(normalize(b.name, nfkc)) as l_brand, lower(normalize(t.name, nfkc)) as l_name,
           lower(normalize(ver.version_label, nfkc)) as l_label
      from public.tool_versions ver
      join public.tools t on t.id = ver.tool_id
      join public.tool_brands b on b.id = t.brand_id
  ), matched as (
    select m.*,
           (select count(*) from unnest(v_terms) as t(word)
             where strpos(m.l_brand, t.word) > 0 or strpos(m.l_name, t.word) > 0) as coverage
      from versions m
     where not exists (
       select 1 from unnest(v_terms) as t(word)
        where not (strpos(m.l_brand, t.word) > 0 or strpos(m.l_name, t.word) > 0
                   or strpos(m.l_label, t.word) > 0 or strpos(m.tool_type, t.word) > 0)
     )
  ), ranked as (
    select m.*, row_number() over (
             order by m.coverage desc, (m.lifecycle = 'active') desc, m.l_brand, m.l_name, m.l_label, m.version_id) as position
      from matched m
     order by position
     limit p_limit + 1
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'versionId', r.version_id, 'toolId', r.tool_id, 'brand', r.brand, 'toolName', r.tool_name,
           'versionLabel', r.version_label, 'toolType', r.tool_type, 'market', r.market, 'lifecycle', r.lifecycle)
           order by r.position) filter (where r.position <= p_limit), '[]'::jsonb)
    into v_found, v_results
    from ranked r;

  return jsonb_build_object('results', v_results, 'truncated', v_found > p_limit);
end;
$$;

-- --- Detail ---------------------------------------------------------------------

create or replace function strandcue_private.tool_publication_state(p_version_id uuid, p_subject text)
returns text language sql stable set search_path = '' as $$
  select case
    when exists (select 1 from public.tool_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'published'
                   and p.reviewed_digest = strandcue_private.tool_publication_digest(p_version_id, p_subject, null)) then 'published'
    when exists (select 1 from public.tool_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'review') then 'under_review'
    when exists (select 1 from public.tool_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'withdrawn') then 'withdrawn'
    else 'not_published' end;
$$;

create or replace function strandcue_private.tool_detail_core(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v record;
  capabilities_state text;
  claims_state text;
  claim_items jsonb;
  successor jsonb;
begin
  if strandcue_private.request_uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if p_version_id is null then
    raise exception 'invalid-detail' using errcode = '22023';
  end if;
  select ver.id, ver.tool_id, b.name as brand, t.name as tool_name, ver.version_label, t.tool_type, ver.market,
         ver.lifecycle, ver.successor_version_id, ver.wattage_watts, ver.temperature_max_celsius,
         ver.adjustable_temp, ver.contact_heat, ver.air_heat
    into v
    from public.tool_versions ver
    join public.tools t on t.id = ver.tool_id
    join public.tool_brands b on b.id = t.brand_id
   where ver.id = p_version_id;
  if not found then
    raise exception 'not-found' using errcode = '42501';
  end if;

  capabilities_state := strandcue_private.tool_publication_state(v.id, 'capabilities');

  select coalesce(jsonb_agg(jsonb_build_object(
           'claimId', c.id, 'claimKey', btrim(c.claim_key), 'statement', nullif(btrim(c.statement), ''),
           'evidence', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'evidenceId', ev.id, 'sourceType', ev.source_type, 'trustTier', ev.trust_tier,
                      'title', btrim(ev.title), 'publisher', btrim(ev.publisher), 'market', ev.market,
                      'firstSeen', ev.first_seen, 'lastChecked', ev.last_checked,
                      'applicability', btrim(ev.applicability), 'limitations', btrim(ev.limitations),
                      'sourceUrl', ev.source_url, 'archivedUrl', ev.archived_url,
                      'excerpt', case when ev.excerpt_consumer_approved then nullif(btrim(ev.excerpt), '') end)
                    order by substr(ev.trust_tier, 2)::integer, btrim(ev.title) collate "C", ev.id)
               from (
                 select e.id, e.title, e.publisher, e.applicability, e.limitations, e.excerpt, e.excerpt_consumer_approved,
                        s.source_type, s.trust_tier, s.market, s.first_seen, s.last_checked, s.source_url, s.archived_url
                   from public.tool_claim_evidence e
                   join public.tool_sources s on s.id = e.source_id and s.version_id = e.version_id
                  where e.claim_id = c.id and e.version_id = v.id and e.state = 'published'
                    and e.reviewed_digest = strandcue_private.tool_evidence_digest(e.source_id, e.title, e.publisher, e.applicability,
                                                                                   e.limitations, e.excerpt, e.excerpt_consumer_approved)
                  order by substr(s.trust_tier, 2)::integer, btrim(e.title) collate "C", e.id
                  limit 20
               ) ev), '[]'::jsonb))
         order by btrim(c.claim_key) collate "C", c.id), '[]'::jsonb)
    into claim_items
    from (
      select cl.id, cl.claim_key, cl.statement
        from public.tool_claims cl
        join public.tool_publications pub on pub.claim_id = cl.id and pub.state = 'published'
         and pub.reviewed_digest = strandcue_private.tool_publication_digest(cl.version_id, 'claim', cl.id)
       where cl.version_id = v.id
       order by btrim(cl.claim_key) collate "C", cl.id
       limit 50
    ) c;
  claims_state := case
    when jsonb_array_length(claim_items) > 0 then 'published'
    when exists (select 1 from public.tool_publications p where p.version_id = v.id and p.subject = 'claim' and p.state = 'review') then 'under_review'
    when exists (select 1 from public.tool_publications p where p.version_id = v.id and p.subject = 'claim' and p.state = 'withdrawn') then 'withdrawn'
    else 'not_published' end;

  successor := case
    when v.lifecycle = 'active' or v.successor_version_id is null then jsonb_build_object('state', 'none')
    else case strandcue_private.tool_publication_state(v.id, 'successor')
      when 'published' then coalesce((
        select jsonb_build_object('state', 'published', 'version', jsonb_build_object(
                 'versionId', sv.id, 'brand', sb.name, 'toolName', st.name, 'versionLabel', sv.version_label))
          from public.tool_versions sv
          join public.tools st on st.id = sv.tool_id
          join public.tool_brands sb on sb.id = st.brand_id
         where sv.id = v.successor_version_id), jsonb_build_object('state', 'not_published'))
      when 'under_review' then jsonb_build_object('state', 'under_review')
      else jsonb_build_object('state', 'not_published') end
    end;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'versionId', v.id, 'toolId', v.tool_id, 'brand', v.brand, 'toolName', v.tool_name,
      'versionLabel', v.version_label, 'toolType', v.tool_type, 'market', v.market),
    'lifecycle', jsonb_build_object('state', v.lifecycle, 'successor', successor),
    'capabilities', case capabilities_state
      when 'published' then jsonb_build_object('state', 'published', 'content', jsonb_build_object(
        'wattageWatts', v.wattage_watts, 'temperatureMaxCelsius', v.temperature_max_celsius,
        'adjustableTemp', v.adjustable_temp, 'contactHeat', v.contact_heat, 'airHeat', v.air_heat))
      else jsonb_build_object('state', capabilities_state) end,
    'claims', case claims_state
      when 'published' then jsonb_build_object('state', 'published', 'content', jsonb_build_object('items', claim_items))
      else jsonb_build_object('state', claims_state) end);
end;
$$;

alter function strandcue_private.tool_detail_core(uuid) owner to strandcue_catalogue_reader;

revoke all on function strandcue_private.tool_publication_state(uuid, text), strandcue_private.tool_detail_core(uuid) from public, anon, authenticated;
grant execute on function strandcue_private.tool_publication_state(uuid, text), strandcue_private.tool_publication_digest(uuid, text, uuid),
  strandcue_private.tool_evidence_digest(uuid, text, text, text, text, text, boolean) to strandcue_catalogue_reader;
grant execute on function strandcue_private.tool_detail_core(uuid) to authenticated, strandcue_catalogue_reader;

create or replace function public.tool_catalogue_detail(p_version_id uuid, p_user_tool_id uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  core jsonb;
  mine jsonb;
begin
  if strandcue_private.request_uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if p_version_id is null then
    raise exception 'invalid-detail' using errcode = '22023';
  end if;
  core := strandcue_private.tool_detail_core(p_version_id);
  if p_user_tool_id is null then
    return core || jsonb_build_object('owner', null);
  end if;
  -- An owner context is bound to the caller by the owner-scoped core, which answers a tool that is not
  -- theirs exactly as a tool that does not exist, and must be matched to this exact version.
  mine := strandcue_private.get_user_tool_core(p_user_tool_id, true);
  if mine ->> 'versionId' is distinct from p_version_id::text then
    raise exception 'not-found' using errcode = '42501';
  end if;
  return core || jsonb_build_object('owner', jsonb_build_object(
    'userToolId', mine -> 'id', 'revision', mine -> 'revision', 'availability', mine -> 'availability',
    'matched', mine -> 'matched', 'matchConfirmed', mine -> 'matchConfirmed',
    'manualBrand', mine -> 'manualBrand', 'manualModel', mine -> 'manualModel', 'toolType', mine -> 'toolType',
    'wattageWatts', mine -> 'wattageWatts', 'adjustableTemp', mine -> 'adjustableTemp', 'settings', mine -> 'settings',
    'attachments', mine -> 'attachments', 'condition', mine -> 'condition', 'heatMethods', mine -> 'heatMethods',
    'notes', mine -> 'notes',
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.element -> 'id', 'kind', r.element -> 'kind',
                                          'correctsId', r.element -> 'correctsId', 'matchVersionId', r.element -> 'matchVersionId')
                       order by r.position)
        from jsonb_array_elements(mine -> 'revisions') with ordinality as r(element, position)
       where r.position <= 500), '[]'::jsonb)));
end;
$$;

revoke all on function public.tool_catalogue_search(text, integer), public.tool_catalogue_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tool_catalogue_search(text, integer), public.tool_catalogue_detail(uuid, uuid) to authenticated;


-- --- The owner export ---------------------------------------------------------------------------
--
-- The owner's own tool facts and immutable history are exported (the JSON branch embeds the whole
-- owner row and its revisions, so the new fact columns arrive with them; the CSV lists the columns
-- explicitly and now names them). The linked catalogue version is exported as identity and
-- lifecycle only. The document shape changed, so the export schema version moves 3 -> 4 in both
-- the JSON and the CSV manifest.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile_csv text;
  passport_csv text;
  services_csv text;
  activities_csv text;
  shelf_csv text;
  shelf_revisions_csv text;
  tools_csv text;
  tool_revisions_csv text;
  consent_csv text;
  runs_csv text;
  executions_csv text;
  execution_events_csv text;
  schema_versions_csv text;
begin
  select 'username,country,currency,temperature_unit,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(username) || ',' || strandcue_private.csv_quote(country) || ',' || strandcue_private.csv_quote(currency) || ',' || strandcue_private.csv_quote(temperature_unit) || ',' || strandcue_private.csv_quote(created_at::text), chr(10)), '')
    into profile_csv from public.profiles where user_id = p_uid;

  select 'id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind) || ',' || strandcue_private.csv_quote(r.effective_date::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.sequence), '')
    into passport_csv from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = p_uid;

  select 'id,service_id,sequence,base_revision,kind,facts,heat_state,effective_start,effective_end,recorded_at,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.service_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.facts::text) || ',' || strandcue_private.csv_quote(r.heat_state) || ',' || strandcue_private.csv_quote(r.effective_start::text) || ',' || strandcue_private.csv_quote(r.effective_end::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.recorded_at, r.service_id, r.sequence), '')
    into services_csv from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = p_uid;

  select 'id,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,void_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.activity_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.void_reason), chr(10) order by r.recorded_at, r.activity_id, r.sequence), '')
    into activities_csv from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = p_uid;

  select 'id,version_id,manual_brand,manual_name,manual_category,manual_variant,manual_size,manual_barcode,availability,opened_on,expiry_on,pao,quantity_band,repurchase_intent,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_name) || ',' || strandcue_private.csv_quote(u.manual_category)
      || ',' || strandcue_private.csv_quote(u.manual_variant) || ',' || strandcue_private.csv_quote(u.manual_size) || ',' || strandcue_private.csv_quote(u.manual_barcode)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.opened_on::text) || ',' || strandcue_private.csv_quote(u.expiry_on::text)
      || ',' || strandcue_private.csv_quote(u.pao) || ',' || strandcue_private.csv_quote(u.quantity_band) || ',' || strandcue_private.csv_quote(u.repurchase_intent)
      || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into shelf_csv from public.user_products u where u.owner = p_uid;

  select 'id,user_product_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_product_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_product_id, r.sequence), '')
    into shelf_revisions_csv from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = p_uid;

  select 'id,version_id,manual_brand,manual_model,tool_type,availability,matched,matched_at,match_confirmed,revision,notes,wattage_watts,adjustable_temp,settings,attachments,condition,heat_methods,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_model) || ',' || strandcue_private.csv_quote(u.tool_type)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes)
      || ',' || strandcue_private.csv_quote(u.wattage_watts::text) || ',' || strandcue_private.csv_quote(u.adjustable_temp) || ',' || strandcue_private.csv_quote(u.settings::text)
      || ',' || strandcue_private.csv_quote(u.attachments::text) || ',' || strandcue_private.csv_quote(u.condition) || ',' || strandcue_private.csv_quote(u.heat_methods::text)
      || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into tools_csv from public.user_tools u where u.owner = p_uid;

  select 'id,user_tool_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_tool_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_tool_id, r.sequence), '')
    into tool_revisions_csv from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = p_uid;

  select 'id,purpose,granted,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(c.id::text) || ',' || strandcue_private.csv_quote(c.purpose) || ',' || strandcue_private.csv_quote(c.granted::text) || ',' || strandcue_private.csv_quote(c.recorded_at::text), chr(10) order by c.recorded_at, c.id), '')
    into consent_csv from public.consent_records c where c.user_id = p_uid;

  select 'id,request_id,input_fingerprint,as_of,engine_version,bundle_id,bundle_version,status,trusted,input,decision,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.request_id::text) || ',' || strandcue_private.csv_quote(r.input_fingerprint) || ',' || strandcue_private.csv_quote(r.as_of::text)
      || ',' || strandcue_private.csv_quote(r.engine_version) || ',' || strandcue_private.csv_quote(r.bundle_id) || ',' || strandcue_private.csv_quote(r.bundle_version) || ',' || strandcue_private.csv_quote(r.status)
      || ',' || strandcue_private.csv_quote(r.trusted::text) || ',' || strandcue_private.csv_quote(r.input::text) || ',' || strandcue_private.csv_quote(r.decision::text) || ',' || strandcue_private.csv_quote(r.created_at::text), chr(10) order by r.created_at, r.id), '')
    into runs_csv from public.recommendation_runs r where r.user_id = p_uid;

  select 'id,execution_id,recommendation_run_id,revision,status,legal_hold,decision,execution,created_at,updated_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(e.id::text) || ',' || strandcue_private.csv_quote(e.execution_id::text) || ',' || strandcue_private.csv_quote(e.recommendation_run_id::text) || ',' || strandcue_private.csv_quote(e.revision::text)
      || ',' || strandcue_private.csv_quote(e.status) || ',' || strandcue_private.csv_quote(e.legal_hold::text) || ',' || strandcue_private.csv_quote(e.decision::text) || ',' || strandcue_private.csv_quote(e.execution::text)
      || ',' || strandcue_private.csv_quote(e.created_at::text) || ',' || strandcue_private.csv_quote(e.updated_at::text), chr(10) order by e.created_at, e.id), '')
    into executions_csv from public.protocol_executions e where e.user_id = p_uid;

  select 'id,execution_id,sequence,kind,command,revision,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(v.id::text) || ',' || strandcue_private.csv_quote(v.execution_id::text) || ',' || strandcue_private.csv_quote(v.sequence::text) || ',' || strandcue_private.csv_quote(v.kind)
      || ',' || strandcue_private.csv_quote(v.command::text) || ',' || strandcue_private.csv_quote(v.revision::text) || ',' || strandcue_private.csv_quote(v.recorded_at::text), chr(10) order by v.execution_id, v.sequence), '')
    into execution_events_csv from public.protocol_execution_events v where v.user_id = p_uid;

  -- Owner-independent version manifest: mirrors the JSON schemaVersions block.
  select 'family,version' || chr(10)
    || 'export,4' || chr(10)
    || 'consentRecords,1' || chr(10)
    || 'recommendationRuns,1' || chr(10)
    || 'protocolExecutions,2' || chr(10)
    || 'protocolExecutionEvents,1'
    into schema_versions_csv;

  return jsonb_build_object('files', jsonb_build_object(
    'profile.csv', profile_csv,
    'passport_revisions.csv', passport_csv,
    'service_revisions.csv', services_csv,
    'activity_revisions.csv', activities_csv,
    'user_products.csv', shelf_csv,
    'user_product_revisions.csv', shelf_revisions_csv,
    'user_tools.csv', tools_csv,
    'user_tool_revisions.csv', tool_revisions_csv,
    'consent_records.csv', consent_csv,
    'recommendation_runs.csv', runs_csv,
    'protocol_executions.csv', executions_csv,
    'protocol_execution_events.csv', execution_events_csv,
    'schema_versions.csv', schema_versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.export_operations%rowtype;
  job_id uuid := gen_random_uuid();
  document jsonb;
  counts integer := 0;
  n integer;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_format is null or (p_format <> 'json' and p_format <> 'csv') then raise exception 'invalid-format' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'format', p_format);
  select * into prev from strandcue_private.export_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  if p_format = 'csv' then
    select strandcue_private.export_build_csv(uid) into document;
  else
    select jsonb_build_object(
    'exportedAt', now(),
    'userId', uid,
    'schemaVersions', jsonb_build_object('export', 4, 'consentRecords', 1, 'recommendationRuns', 1,
      'protocolExecutions', 2, 'protocolExecutionEvents', 1),
    'profile', (select jsonb_build_object('username', p.username, 'country', p.country, 'currency', p.currency,
      'temperatureUnit', p.temperature_unit, 'createdAt', p.created_at)
      from public.profiles p where p.user_id = uid),
    'passport', (select jsonb_build_object('revision', h.revision, 'projection', h.current_projection,
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.passport_revisions r where r.passport_id = h.id))
      from public.hair_passports h where h.user_id = uid),
    'chemicalServices', (select coalesce(jsonb_agg(jsonb_build_object('service', to_jsonb(s),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.service_revisions r where r.service_id = s.id),
        'zones', (select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
          from public.service_zones z where z.service_id = s.id),
        'observations', (select coalesce(jsonb_agg(to_jsonb(o) order by o.recorded_at), '[]'::jsonb)
          from public.service_observations o where o.service_id = s.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.heat_events e where e.service_id = s.id))), '[]'::jsonb)
      from public.chemical_services s where s.user_id = uid),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('activity', to_jsonb(a),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.activity_revisions r where r.activity_id = a.id),
        'products', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_products l where l.activity_id = a.id),
        'tools', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_tools l where l.activity_id = a.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.activity_heat_events e where e.activity_id = a.id))), '[]'::jsonb)
      from public.activities a where a.owner = uid),
    'userProducts', (select coalesce(jsonb_agg(jsonb_build_object('product', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_product_revisions r where r.user_product_id = u.id),
        -- Only the identity and lifecycle of the linked version: draft claims, sources, directions,
        -- ingredients and verification events (with reviewer names) never leave through the export.
        -- The keys stay so the document keeps its shape; published content is read through the detail.
        'catalogueVersion', (select jsonb_build_object('id', v.id, 'product_id', v.product_id, 'variant', v.variant,
            'market', v.market, 'barcode', v.barcode, 'lifecycle', v.lifecycle,
            'successor_version_id', v.successor_version_id, 'created_at', v.created_at)
          from public.product_versions v where v.id = u.version_id),
        'claims', '[]'::jsonb,
        'verificationEvents', '[]'::jsonb)), '[]'::jsonb)
      from public.user_products u where u.owner = uid),
    'userTools', (select coalesce(jsonb_agg(jsonb_build_object('tool', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_tool_revisions r where r.user_tool_id = u.id),
        -- Only the identity and lifecycle of the linked version: draft capabilities, claims, sources and
        -- verification events (with reviewer names) never leave through the export, and neither does an
        -- unreviewed successor link. The keys stay so the document keeps its shape.
        'catalogueVersion', (select jsonb_build_object('id', v.id, 'tool_id', v.tool_id, 'version_label', v.version_label,
            'market', v.market, 'lifecycle', v.lifecycle, 'created_at', v.created_at)
          from public.tool_versions v where v.id = u.version_id),
        'claims', '[]'::jsonb,
        'verificationEvents', '[]'::jsonb)), '[]'::jsonb)
      from public.user_tools u where u.owner = uid),
    'consentRecords', (select coalesce(jsonb_agg(to_jsonb(c) order by c.recorded_at, c.id), '[]'::jsonb)
      from public.consent_records c where c.user_id = uid),
    'recommendationRuns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb)
      from public.recommendation_runs r where r.user_id = uid),
    'protocolExecutions', (select coalesce(jsonb_agg(
        to_jsonb(e) || jsonb_build_object('events',
          (select coalesce(jsonb_agg(to_jsonb(v) order by v.sequence), '[]'::jsonb)
            from public.protocol_execution_events v where v.user_id = uid and v.execution_id = e.execution_id))
        order by e.created_at, e.id), '[]'::jsonb)
      from public.protocol_executions e where e.user_id = uid)
    ) into document;
  end if;

  select coalesce((select count(*) from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = uid), 0)
    + coalesce((select count(*) from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = uid), 0)
    + coalesce((select count(*) from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = uid), 0)
    + coalesce((select count(*) from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.consent_records c where c.user_id = uid), 0)
    + coalesce((select count(*) from public.recommendation_runs r where r.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_executions e where e.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_execution_events v where v.user_id = uid), 0)
    into n;
  counts := n;

  insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
    values (job_id, uid, p_format, 'completed', document, counts, now(), now() + interval '24 hours');
  result := jsonb_build_object('jobId', job_id, 'status', 'completed', 'recordCount', counts, 'expiresAt', now() + interval '24 hours');
  insert into strandcue_private.export_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

revoke create on schema strandcue_private from strandcue_catalogue_reader;
revoke set option for strandcue_catalogue_reader from current_user;

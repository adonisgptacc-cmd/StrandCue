-- Consumer product detail and the publication boundary (Increment 2, Task 2.3).
--
-- Until now the catalogue had no publication state: claims, sources,
-- verification events and a version's directions and ingredients were all
-- readable by any signed-in consumer, draft or not. This migration makes the
-- boundary explicit and fail-closed:
--
-- 1. Publication is recorded in two new tables that no consumer can read or
--    write: `product_publications` (directions, ingredients, formulation
--    reference, successor link and each claim) and `product_claim_evidence`
--    (evidence tied to one claim of the same exact version). Content is shown
--    only when its row is `published`; a missing row, a draft, a rejected,
--    superseded or withdrawn row never is. No row is created here: nothing is
--    published, no reviewer decision is invented and the draft Banana rows
--    stay draft.
-- 2. Consumers lose direct read access to claims, sources, verification
--    events and to the non-identity columns of `product_versions`
--    (formulation_ref, structured_directions, ingredients). Identity and
--    lifecycle columns stay readable, as the catalogue search needs.
-- 3. One narrow SECURITY DEFINER core, owned by a dedicated read-only role,
--    returns an allowlisted, bounded, deterministic detail. A SECURITY INVOKER
--    wrapper binds an optional Shelf context to the caller (`auth.uid()`
--    through the existing owner-scoped Shelf core).
-- 4. Published content is immutable: row guards refuse editing or deleting a
--    published publication or evidence row (only withdrawal or supersession),
--    and refuse editing a published claim, source or version (a version may
--    only be retired, once, and gain a successor link once).
-- 5. Publishing needs a second, named person and a review date, enforced by
--    a table constraint, never by the client.
--
-- 6. The owner's data export carried whole version rows, claims and verification
--    events (reviewer names included); it now carries identity and lifecycle only.
--
-- Forward-only and rerunnable: `if not exists`, `create or replace`, dropped
-- and recreated policies and triggers, idempotent grants.

-- --- A read-only role for the detail core ------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'strandcue_catalogue_reader') then
    create role strandcue_catalogue_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end;
$$;

grant strandcue_catalogue_reader to current_user with set true;
grant usage on schema public to strandcue_catalogue_reader;
grant usage on schema strandcue_private to strandcue_catalogue_reader;
grant create on schema strandcue_private to strandcue_catalogue_reader;

-- --- Keys the publication tables point at --------------------------------------

create unique index if not exists product_claim_id_version_uidx on public.product_claims(id, version_id);
create unique index if not exists product_source_id_version_uidx on public.product_sources(id, version_id);

-- --- Publication -----------------------------------------------------------------

create table if not exists public.product_publications (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.product_versions(id) on delete restrict,
  subject text not null check (subject in ('directions', 'ingredients', 'formulation_reference', 'successor', 'claim')),
  claim_id uuid,
  state text not null check (state in ('review', 'published', 'rejected', 'superseded', 'withdrawn')),
  authored_by text not null check (length(btrim(authored_by)) between 1 and 200),
  reviewed_by text check (reviewed_by is null or length(btrim(reviewed_by)) between 1 and 200),
  reviewed_at timestamptz,
  published_at timestamptz,
  -- A digest of the content as it stood when the review began: publishing is refused if it changed.
  reviewed_digest text,
  created_at timestamptz not null default now(),
  constraint product_publication_claim_subject check ((subject = 'claim') = (claim_id is not null)),
  constraint product_publication_claim_fk foreign key (claim_id, version_id)
    references public.product_claims(id, version_id) on delete restrict,
  constraint product_publication_review check (
    state <> 'published' or (
      reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))
      and lower(btrim(reviewed_by)) <> all (array[
        'unknown', 'unassigned', 'unassigned-draft', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'tba', 'todo',
        'pending', 'placeholder', 'example', 'reviewer', 'author', 'reviewer-1', 'reviewer-a', 'reviewer-b',
        'author-a', 'author-b', 'fixture', 'fake', 'dummy', 'synthetic', 'test'])
    ))
);
create index if not exists product_publication_version_idx on public.product_publications(version_id);
create unique index if not exists product_publication_one_published_subject
  on public.product_publications(version_id, subject) where state = 'published' and claim_id is null;
create unique index if not exists product_publication_one_published_claim
  on public.product_publications(claim_id) where state = 'published';

create table if not exists public.product_claim_evidence (
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
  -- A digest of the evidence and its source as they stood when the review began.
  reviewed_digest text,
  created_at timestamptz not null default now(),
  constraint product_evidence_claim_fk foreign key (claim_id, version_id)
    references public.product_claims(id, version_id) on delete restrict,
  constraint product_evidence_source_fk foreign key (source_id, version_id)
    references public.product_sources(id, version_id) on delete restrict,
  constraint product_evidence_review check (
    state <> 'published' or (
      reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))
      and lower(btrim(reviewed_by)) <> all (array[
        'unknown', 'unassigned', 'unassigned-draft', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'tba', 'todo',
        'pending', 'placeholder', 'example', 'reviewer', 'author', 'reviewer-1', 'reviewer-a', 'reviewer-b',
        'author-a', 'author-b', 'fixture', 'fake', 'dummy', 'synthetic', 'test'])
    ))
);
create index if not exists product_evidence_claim_idx on public.product_claim_evidence(claim_id);
create index if not exists product_evidence_source_idx on public.product_claim_evidence(source_id);

alter table public.product_publications enable row level security;
alter table public.product_claim_evidence enable row level security;
alter table public.product_publications force row level security;
alter table public.product_claim_evidence force row level security;

-- Only the read-only detail role can read them; no policy exists for any consumer role.
drop policy if exists product_publication_reader on public.product_publications;
drop policy if exists product_evidence_reader on public.product_claim_evidence;
create policy product_publication_reader on public.product_publications for select to strandcue_catalogue_reader using (true);
create policy product_evidence_reader on public.product_claim_evidence for select to strandcue_catalogue_reader using (true);

revoke all on public.product_publications, public.product_claim_evidence from public, anon, authenticated;
grant select on public.product_publications, public.product_claim_evidence to strandcue_catalogue_reader;

-- The reader sees the catalogue tables through its own policies.
drop policy if exists brand_reader on public.brands;
drop policy if exists product_reader on public.products;
drop policy if exists product_version_reader on public.product_versions;
drop policy if exists product_claim_reader on public.product_claims;
drop policy if exists product_source_reader on public.product_sources;
create policy brand_reader on public.brands for select to strandcue_catalogue_reader using (true);
create policy product_reader on public.products for select to strandcue_catalogue_reader using (true);
create policy product_version_reader on public.product_versions for select to strandcue_catalogue_reader using (true);
create policy product_claim_reader on public.product_claims for select to strandcue_catalogue_reader using (true);
create policy product_source_reader on public.product_sources for select to strandcue_catalogue_reader using (true);
grant select on public.brands, public.products, public.product_versions, public.product_claims, public.product_sources
  to strandcue_catalogue_reader;

-- --- Close the draft content that consumers could read directly ----------------

revoke select on public.product_claims, public.product_sources, public.product_verification_events from authenticated;
drop policy if exists product_claim_read on public.product_claims;
drop policy if exists product_source_read on public.product_sources;
drop policy if exists product_verification_event_read on public.product_verification_events;
create policy product_claim_read on public.product_claims for select to strandcue_mutator using (true);
create policy product_source_read on public.product_sources for select to strandcue_mutator using (true);
create policy product_verification_event_read on public.product_verification_events for select to strandcue_mutator using (true);
revoke select on public.product_versions from authenticated;
grant select (id, product_id, variant, market, barcode, lifecycle, successor_version_id, created_at)
  on public.product_versions to authenticated;

-- --- Published content is immutable --------------------------------------------

-- What a publication covers, as one digest: the content itself, never its reviewers.
create or replace function strandcue_private.publication_digest(p_version_id uuid, p_subject text, p_claim_id uuid)
returns text language sql stable set search_path = '' as $$
  -- No row_security setting here: the guard triggers set it off for their whole call, and the reader
  -- reads through its own policies.
  select md5(case p_subject
    when 'directions' then coalesce((select ver.structured_directions::text from public.product_versions ver where ver.id = p_version_id), '')
    when 'ingredients' then coalesce((select ver.ingredients::text from public.product_versions ver where ver.id = p_version_id), '')
    when 'formulation_reference' then coalesce((select ver.formulation_ref from public.product_versions ver where ver.id = p_version_id), '')
    when 'successor' then coalesce((select ver.successor_version_id::text from public.product_versions ver where ver.id = p_version_id), '')
    else coalesce((select c.claim_key || chr(31) || coalesce(c.statement, '') from public.product_claims c where c.id = p_claim_id), '')
  end);
$$;

create or replace function strandcue_private.bind_publication_review()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
begin
  -- A row that is already final is left to the immutability guard.
  if tg_op = 'UPDATE' and old.state in ('published', 'superseded', 'withdrawn') then
    return new;
  end if;
  if new.state = 'review' then
    -- The digest is taken when the review begins and never again: touching the row cannot re-bind it
    -- to content edited since. A fresh review is a fresh row.
    new.reviewed_digest := case when tg_op = 'INSERT'
      then strandcue_private.publication_digest(new.version_id, new.subject, new.claim_id) else old.reviewed_digest end;
  elsif new.state = 'published' then
    -- Nothing is published without a review that began on the content as it is now.
    if tg_op = 'INSERT' or old.state <> 'review' then
      raise exception 'review-required' using errcode = '23000';
    end if;
    if old.reviewed_digest is distinct from strandcue_private.publication_digest(new.version_id, new.subject, new.claim_id) then
      raise exception 'content-changed-since-review' using errcode = '23000';
    end if;
    new.reviewed_digest := old.reviewed_digest;
  end if;
  return new;
end;
$$;

-- What a piece of evidence covers: its own text and the source row it cites.
create or replace function strandcue_private.evidence_digest(
  p_source_id uuid, p_title text, p_publisher text, p_applicability text, p_limitations text, p_excerpt text, p_approved boolean)
returns text language sql stable set search_path = '' as $$
  select md5(concat_ws(chr(31), p_title, p_publisher, p_applicability, p_limitations, coalesce(p_excerpt, ''), p_approved::text,
    coalesce((select concat_ws(chr(31), s.source_url, coalesce(s.archived_url, ''), s.source_type, s.trust_tier, s.market,
                               s.first_seen::text, s.last_checked::text)
                from public.product_sources s where s.id = p_source_id), '')));
$$;

create or replace function strandcue_private.bind_evidence_review()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
begin
  if tg_op = 'UPDATE' and old.state in ('published', 'superseded', 'withdrawn') then
    return new;
  end if;
  if new.state = 'review' then
    new.reviewed_digest := case when tg_op = 'INSERT'
      then strandcue_private.evidence_digest(new.source_id, new.title, new.publisher, new.applicability, new.limitations,
        new.excerpt, new.excerpt_consumer_approved) else old.reviewed_digest end;
  elsif new.state = 'published' then
    if tg_op = 'INSERT' or old.state <> 'review' then
      raise exception 'review-required' using errcode = '23000';
    end if;
    if old.reviewed_digest is distinct from strandcue_private.evidence_digest(new.source_id, new.title, new.publisher, new.applicability,
        new.limitations, new.excerpt, new.excerpt_consumer_approved) then
      raise exception 'content-changed-since-review' using errcode = '23000';
    end if;
    new.reviewed_digest := old.reviewed_digest;
  end if;
  return new;
end;
$$;

create or replace function strandcue_private.refuse_truncate()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'published-immutable' using errcode = '23000';
end;
$$;

create or replace function strandcue_private.guard_publication_row()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.state in ('published', 'superseded', 'withdrawn') then
      raise exception 'published-immutable' using errcode = '23000';
    end if;
    return old;
  end if;
  -- A superseded or withdrawn row is final.
  if old.state in ('superseded', 'withdrawn') then
    raise exception 'published-immutable' using errcode = '23000';
  end if;
  if old.state = 'published' then
    -- The only change a published row accepts is its own withdrawal or supersession.
    if new.state in ('superseded', 'withdrawn') and (to_jsonb(new) - 'state') = (to_jsonb(old) - 'state') then
      return new;
    end if;
    raise exception 'published-immutable' using errcode = '23000';
  end if;
  return new;
end;
$$;

create or replace function strandcue_private.guard_published_content()
returns trigger language plpgsql set search_path = '' set row_security = off as $$
declare
  locked boolean;
begin
  if tg_table_name = 'product_versions' then
    locked := exists (select 1 from public.product_publications p where p.version_id = old.id and p.state = 'published');
    if not locked then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    if tg_op = 'DELETE' then raise exception 'published-immutable' using errcode = '23000'; end if;
    -- A published version may only be retired (once) and gain a successor link (once), and a
    -- successor link that has any review at all is never changed.
    if (to_jsonb(new) - 'lifecycle' - 'successor_version_id') = (to_jsonb(old) - 'lifecycle' - 'successor_version_id')
      and (new.lifecycle = old.lifecycle or (old.lifecycle = 'active' and new.lifecycle = 'retired'))
      and (new.successor_version_id is not distinct from old.successor_version_id
           or (old.successor_version_id is null
               and not exists (select 1 from public.product_publications p where p.version_id = old.id and p.subject = 'successor'))) then
      return new;
    end if;
    raise exception 'published-immutable' using errcode = '23000';
  elsif tg_table_name = 'product_claims' then
    locked := exists (select 1 from public.product_publications p where p.claim_id = old.id and p.state = 'published');
  else
    locked := exists (select 1 from public.product_claim_evidence e where e.source_id = old.id and e.state = 'published');
  end if;
  if locked then raise exception 'published-immutable' using errcode = '23000'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Trigger functions are checked for execute only when a trigger is created, so nobody needs the grant.
revoke all on function strandcue_private.guard_publication_row(), strandcue_private.guard_published_content(),
  strandcue_private.bind_publication_review(), strandcue_private.bind_evidence_review(), strandcue_private.refuse_truncate(),
  strandcue_private.publication_digest(uuid, text, uuid),
  strandcue_private.evidence_digest(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;

drop trigger if exists product_publication_bind on public.product_publications;
create trigger product_publication_bind before insert or update on public.product_publications
  for each row execute function strandcue_private.bind_publication_review();
drop trigger if exists product_publication_truncate on public.product_publications;
create trigger product_publication_truncate before truncate on public.product_publications
  for each statement execute function strandcue_private.refuse_truncate();
drop trigger if exists product_evidence_truncate on public.product_claim_evidence;
create trigger product_evidence_truncate before truncate on public.product_claim_evidence
  for each statement execute function strandcue_private.refuse_truncate();
drop trigger if exists product_publication_guard on public.product_publications;
create trigger product_publication_guard before update or delete on public.product_publications
  for each row execute function strandcue_private.guard_publication_row();
drop trigger if exists product_evidence_bind on public.product_claim_evidence;
create trigger product_evidence_bind before insert or update on public.product_claim_evidence
  for each row execute function strandcue_private.bind_evidence_review();
drop trigger if exists product_evidence_guard on public.product_claim_evidence;
create trigger product_evidence_guard before update or delete on public.product_claim_evidence
  for each row execute function strandcue_private.guard_publication_row();
drop trigger if exists product_version_guard on public.product_versions;
create trigger product_version_guard before update or delete on public.product_versions
  for each row execute function strandcue_private.guard_published_content();
drop trigger if exists product_claim_guard on public.product_claims;
create trigger product_claim_guard before update or delete on public.product_claims
  for each row execute function strandcue_private.guard_published_content();
drop trigger if exists product_source_guard on public.product_sources;
create trigger product_source_guard before update or delete on public.product_sources
  for each row execute function strandcue_private.guard_published_content();

-- --- Allowlist helpers (pure, used only by the detail core) -----------------------

create or replace function strandcue_private.detail_text(p_value jsonb, p_max integer)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'string' and length(btrim(p_value #>> '{}')) between 1 and p_max
    then to_jsonb(btrim(p_value #>> '{}')) end;
$$;

create or replace function strandcue_private.detail_int(p_value jsonb, p_min integer, p_max integer)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number'
      and (p_value #>> '{}')::numeric between p_min and p_max
      and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    then to_jsonb(((p_value #>> '{}')::numeric)::integer) end;
$$;

create or replace function strandcue_private.detail_number(p_value jsonb, p_min integer, p_max integer)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number' and (p_value #>> '{}')::numeric between p_min and p_max then p_value end;
$$;

create or replace function strandcue_private.detail_list(p_value jsonb, p_items integer, p_max integer)
returns jsonb language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'array' then (
    select coalesce(jsonb_agg(item.value order by item.position), '[]'::jsonb)
      from (
        select to_jsonb(btrim(e.element #>> '{}')) as value, e.position
          from jsonb_array_elements(p_value) with ordinality as e(element, position)
         where jsonb_typeof(e.element) = 'string' and length(btrim(e.element #>> '{}')) between 1 and p_max
         order by e.position
         limit p_items
      ) item
  ) end;
$$;

-- True when every field the record states survived the allowlist whole: nothing mistyped, nothing
-- dropped from a list, nothing cut at a limit. Directions that fail this are not shown at all.
create or replace function strandcue_private.detail_directions_lossless(p_raw jsonb, p_clean jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select not exists (
    select 1
      from unnest(array['routinePlacement', 'instructions', 'applicationOrder', 'rinseMode', 'waitMinutes', 'frequency',
                        'activation', 'requiredTools', 'requiredConditions', 'incompatibilities', 'limitations']) as k(key)
     where p_raw -> k.key is not null and jsonb_typeof(p_raw -> k.key) <> 'null'
       and (p_clean -> k.key is null or jsonb_typeof(p_clean -> k.key) = 'null'
            or (jsonb_typeof(p_raw -> k.key) = 'array'
                and jsonb_array_length(p_raw -> k.key) <> jsonb_array_length(p_clean -> k.key)))
  );
$$;

create or replace function strandcue_private.detail_directions(p_value jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'routinePlacement', strandcue_private.detail_text(p_value -> 'routinePlacement', 120),
    'instructions', strandcue_private.detail_text(p_value -> 'instructions', 2000),
    'applicationOrder', strandcue_private.detail_int(p_value -> 'applicationOrder', 1, 20),
    'rinseMode', case when jsonb_typeof(p_value -> 'rinseMode') = 'string' and (p_value ->> 'rinseMode') in ('rinse-out', 'leave-in')
      then p_value -> 'rinseMode' end,
    'waitMinutes', strandcue_private.detail_number(p_value -> 'waitMinutes', 0, 240),
    'frequency', case when jsonb_typeof(p_value -> 'frequency') = 'object'
        and strandcue_private.detail_int(p_value -> 'frequency' -> 'count', 1, 14) is not null
        and jsonb_typeof(p_value -> 'frequency' -> 'unit') = 'string'
        and (p_value -> 'frequency' ->> 'unit') in ('day', 'week', 'month', 'wash', 'use')
      then jsonb_build_object('count', strandcue_private.detail_int(p_value -> 'frequency' -> 'count', 1, 14),
                              'unit', p_value -> 'frequency' -> 'unit') end,
    'activation', strandcue_private.detail_text(p_value -> 'activation', 300),
    'requiredTools', strandcue_private.detail_list(p_value -> 'requiredTools', 10, 80),
    'requiredConditions', strandcue_private.detail_list(p_value -> 'requiredConditions', 10, 200),
    'incompatibilities', strandcue_private.detail_list(p_value -> 'incompatibilities', 20, 200),
    'limitations', strandcue_private.detail_text(p_value -> 'limitations', 1000));
$$;

-- The state of one subject: published wins, then a review under way, then a
-- withdrawal; everything else (nothing, a draft, a rejection, a superseded
-- copy) is simply not published.
create or replace function strandcue_private.publication_state(p_version_id uuid, p_subject text)
returns text language sql stable set search_path = '' as $$
  select case
    when exists (select 1 from public.product_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'published'
                   and p.reviewed_digest = strandcue_private.publication_digest(p_version_id, p_subject, null)) then 'published'
    when exists (select 1 from public.product_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'review') then 'under_review'
    when exists (select 1 from public.product_publications p where p.version_id = p_version_id and p.subject = p_subject and p.claim_id is null and p.state = 'withdrawn') then 'withdrawn'
    else 'not_published' end;
$$;

-- --- The detail core ------------------------------------------------------------

create or replace function strandcue_private.catalogue_detail_core(p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v record;
  directions_state text;
  directions_content jsonb;
  ingredients_text text;
  ingredients_state text;
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
  select ver.id, ver.product_id, b.name as brand, p.name as product_name, ver.variant, p.category, ver.market,
         ver.barcode, ver.lifecycle, ver.successor_version_id, ver.formulation_ref,
         ver.structured_directions, ver.ingredients
    into v
    from public.product_versions ver
    join public.products p on p.id = ver.product_id
    join public.brands b on b.id = p.brand_id
   where ver.id = p_version_id;
  if not found then
    raise exception 'not-found' using errcode = '42501';
  end if;

  directions_state := strandcue_private.publication_state(v.id, 'directions');
  directions_content := strandcue_private.detail_directions(
    case when jsonb_typeof(v.structured_directions) = 'object' then v.structured_directions else '{}'::jsonb end);
  -- Published directions from which no field survives the allowlist, or that lose anything on the way
  -- (a mistyped field, a dropped list item, a cut list), are not a fact to show: safety content is never
  -- shown as complete when it is not.
  if directions_state = 'published' and (
       not exists (select 1 from jsonb_each(directions_content) d where d.value <> 'null'::jsonb)
       or not strandcue_private.detail_directions_lossless(
            case when jsonb_typeof(v.structured_directions) = 'object' then v.structured_directions else '{}'::jsonb end, directions_content)) then
    directions_state := 'not_published';
  end if;
  ingredients_state := strandcue_private.publication_state(v.id, 'ingredients');
  ingredients_text := nullif(btrim(case when jsonb_typeof(v.ingredients -> 'text') = 'string' then v.ingredients ->> 'text' end), '');
  -- Published ingredients with no recorded label text are not a fact to show.
  if ingredients_state = 'published' and (ingredients_text is null or length(ingredients_text) > 4000) then
    ingredients_state := 'not_published';
  end if;

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
                   from public.product_claim_evidence e
                   join public.product_sources s on s.id = e.source_id and s.version_id = e.version_id
                  where e.claim_id = c.id and e.version_id = v.id and e.state = 'published'
                    and e.reviewed_digest = strandcue_private.evidence_digest(e.source_id, e.title, e.publisher, e.applicability,
                                                                              e.limitations, e.excerpt, e.excerpt_consumer_approved)
                  order by substr(s.trust_tier, 2)::integer, btrim(e.title) collate "C", e.id
                  limit 20
               ) ev), '[]'::jsonb))
         order by btrim(c.claim_key) collate "C", c.id), '[]'::jsonb)
    into claim_items
    from (
      select cl.id, cl.claim_key, cl.statement
        from public.product_claims cl
        join public.product_publications pub on pub.claim_id = cl.id and pub.state = 'published'
         and pub.reviewed_digest = strandcue_private.publication_digest(cl.version_id, 'claim', cl.id)
       where cl.version_id = v.id
       order by btrim(cl.claim_key) collate "C", cl.id
       limit 50
    ) c;
  claims_state := case
    when jsonb_array_length(claim_items) > 0 then 'published'
    when exists (select 1 from public.product_publications p where p.version_id = v.id and p.subject = 'claim' and p.state = 'review') then 'under_review'
    when exists (select 1 from public.product_publications p where p.version_id = v.id and p.subject = 'claim' and p.state = 'withdrawn') then 'withdrawn'
    else 'not_published' end;

  successor := case
    when v.lifecycle = 'active' or v.successor_version_id is null then jsonb_build_object('state', 'none')
    else case strandcue_private.publication_state(v.id, 'successor')
      when 'published' then coalesce((
        select jsonb_build_object('state', 'published', 'version', jsonb_build_object(
                 'versionId', sv.id, 'brand', sb.name, 'productName', sp.name, 'variant', sv.variant))
          from public.product_versions sv
          join public.products sp on sp.id = sv.product_id
          join public.brands sb on sb.id = sp.brand_id
         where sv.id = v.successor_version_id), jsonb_build_object('state', 'not_published'))
      when 'under_review' then jsonb_build_object('state', 'under_review')
      else jsonb_build_object('state', 'not_published') end
    end;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'versionId', v.id, 'productId', v.product_id, 'brand', v.brand, 'productName', v.product_name,
      'variant', v.variant, 'category', v.category, 'market', v.market, 'barcode', v.barcode),
    'lifecycle', jsonb_build_object('state', v.lifecycle, 'successor', successor),
    'formulationReference', case strandcue_private.publication_state(v.id, 'formulation_reference')
      when 'published' then case when nullif(btrim(v.formulation_ref), '') is null
        then jsonb_build_object('state', 'not_published')
        else jsonb_build_object('state', 'published', 'content', jsonb_build_object('value', btrim(v.formulation_ref))) end
      when 'under_review' then jsonb_build_object('state', 'under_review')
      when 'withdrawn' then jsonb_build_object('state', 'withdrawn')
      else jsonb_build_object('state', 'not_published') end,
    'directions', case directions_state
      when 'published' then jsonb_build_object('state', 'published', 'content', directions_content)
      else jsonb_build_object('state', directions_state) end,
    'ingredients', case ingredients_state
      when 'published' then jsonb_build_object('state', 'published', 'content', jsonb_build_object('text', ingredients_text))
      else jsonb_build_object('state', ingredients_state) end,
    'claims', case claims_state
      when 'published' then jsonb_build_object('state', 'published', 'content', jsonb_build_object('items', claim_items))
      else jsonb_build_object('state', claims_state) end);
end;
$$;

alter function strandcue_private.catalogue_detail_core(uuid) owner to strandcue_catalogue_reader;

-- The helpers run inside the core, as the reader; nobody else needs them.
revoke all on function
  strandcue_private.detail_text(jsonb, integer), strandcue_private.detail_int(jsonb, integer, integer),
  strandcue_private.detail_number(jsonb, integer, integer), strandcue_private.detail_list(jsonb, integer, integer),
  strandcue_private.detail_directions(jsonb), strandcue_private.detail_directions_lossless(jsonb, jsonb),
  strandcue_private.publication_state(uuid, text), strandcue_private.catalogue_detail_core(uuid)
  from public, anon, authenticated;
grant execute on function
  strandcue_private.detail_text(jsonb, integer), strandcue_private.detail_int(jsonb, integer, integer),
  strandcue_private.detail_number(jsonb, integer, integer), strandcue_private.detail_list(jsonb, integer, integer),
  strandcue_private.detail_directions(jsonb), strandcue_private.detail_directions_lossless(jsonb, jsonb),
  strandcue_private.publication_state(uuid, text)
  to strandcue_catalogue_reader;
grant execute on function strandcue_private.request_uid() to strandcue_catalogue_reader;
grant execute on function strandcue_private.publication_digest(uuid, text, uuid),
  strandcue_private.evidence_digest(uuid, text, text, text, text, text, boolean) to strandcue_catalogue_reader;
grant execute on function strandcue_private.catalogue_detail_core(uuid) to authenticated, strandcue_catalogue_reader;

-- --- The public read --------------------------------------------------------------

create or replace function public.catalogue_product_detail(p_version_id uuid, p_user_product_id uuid default null)
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
  core := strandcue_private.catalogue_detail_core(p_version_id);
  if p_user_product_id is null then
    return core || jsonb_build_object('owner', null);
  end if;
  -- A Shelf context is bound to the caller by the owner-scoped Shelf core, which
  -- answers a product that is not theirs exactly as a product that does not exist.
  mine := strandcue_private.get_user_product_core(p_user_product_id, true);
  if mine ->> 'versionId' is distinct from p_version_id::text then
    raise exception 'not-found' using errcode = '42501';
  end if;
  return core || jsonb_build_object('owner', jsonb_build_object(
    'userProductId', mine -> 'id', 'revision', mine -> 'revision', 'availability', mine -> 'availability',
    'matched', mine -> 'matched', 'matchConfirmed', mine -> 'matchConfirmed',
    'manualBrand', mine -> 'manualBrand', 'manualName', mine -> 'manualName', 'manualCategory', mine -> 'manualCategory',
    'manualVariant', mine -> 'manualVariant', 'manualSize', mine -> 'manualSize', 'manualBarcode', mine -> 'manualBarcode',
    'openedOn', mine -> 'openedOn', 'expiryOn', mine -> 'expiryOn', 'pao', mine -> 'pao',
    'quantityBand', mine -> 'quantityBand', 'repurchaseIntent', mine -> 'repurchaseIntent', 'notes', mine -> 'notes',
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.element -> 'id', 'kind', r.element -> 'kind',
                                          'correctsId', r.element -> 'correctsId', 'matchVersionId', r.element -> 'matchVersionId')
                       order by r.position)
        from jsonb_array_elements(mine -> 'revisions') with ordinality as r(element, position)
       -- A summary, bounded like the contract; the full history stays in the Shelf audit.
       where r.position <= 500), '[]'::jsonb)));
end;
$$;

revoke all on function public.catalogue_product_detail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.catalogue_product_detail(uuid, uuid) to authenticated;


-- --- The owner's export no longer carries draft catalogue content ---------------------------
--
-- request_export embedded the whole product_versions row, every claim and every verification
-- event of each linked version. That bypassed the publication gate (and exposed reviewer names).
-- The user-product block now carries identity and lifecycle only. The tool block reads the tools
-- catalogue, which has no publication model yet; it is recorded as follow-up work for Task 2.4.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

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
    'schemaVersions', jsonb_build_object('export', 3, 'consentRecords', 1, 'recommendationRuns', 1,
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
        'catalogueVersion', (select to_jsonb(v) from public.tool_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.tool_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.tool_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
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

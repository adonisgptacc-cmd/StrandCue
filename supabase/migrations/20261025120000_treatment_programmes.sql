-- Increment 5 Task I5.4: owner-only treatment-programme persistence (TR-05..TR-08 groundwork).
-- Forward-only and rerunnable; no committed migration is edited.
--
-- What is stored: the owner's enrolment (exact product, product version, rule and the exact reviewed rule
-- publication the server loaded) and an append-only lifecycle history (enrol, change, pause, resume,
-- maintenance, complete). What is NEVER stored as mutable state: a wash count, a due status or a state
-- derived from counts. Those are derived on every read from the owner's canonical care events and the
-- exact reviewed rule publication. The single stored derived result is the completion snapshot, built
-- once by the server inside the completing function and immutable afterwards.
--
-- Trust boundary: the client supplies owner facts and an operation id only. It cannot supply or influence
-- counts, due status, state, publication status or binding, evidence, snapshots, rule capabilities or
-- product capabilities. The server joins, under the authenticated owner:
--   enrolment + canonical care events (confirmed, classified execution steps and active wash activities)
--   + the exact reviewed rule publication (id, version, lowercase sha-256 digest) + the exact product
--   version identity and its verification state.
--
-- Honest production state: `programme_rule_publications` and `execution_step_care` are created EMPTY and
-- nothing in this migration writes to them. No rule, product mapping, reviewer, capability or content is
-- invented. With no published rule, enrolment is refused with `rule-content-pending`; with no trusted
-- step classification no execution step can become a care event, so a programme resolves to
-- `needs_input`. A future reviewed-content release and a trusted step-classification writer fill them.
--
-- Hardened definers: every SECURITY DEFINER function pins `search_path = pg_catalog, pg_temp` and
-- schema-qualifies every relation and function, uses no dynamic SQL, and takes the owner only from
-- `strandcue_private.request_uid()`.
--
-- Receipts (`treatment_programme_operations`) are service-internal idempotency material: never exported,
-- never owner-readable, purged after 30 days by `treatment_programme_operation_retention_cleanup`. Programme
-- facts, lifecycle history and completion snapshots remain until account deletion.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'migration_admin') then
    create role migration_admin nologin;
  end if;
  if current_user <> 'migration_admin' then
    execute format('grant migration_admin to %I with set true', current_user);
  end if;
end $$;
grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- ---------------------------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------------------------

create or replace function strandcue_private.programme_iso(p_at timestamptz)
returns text language sql stable set search_path = pg_catalog, pg_temp as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

create or replace function strandcue_private.programme_iso_us(p_at timestamptz)
returns text language sql stable set search_path = pg_catalog, pg_temp as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$$;

-- A strict offset-aware instant, or null. Never accepts a bare date or a local time.
create or replace function strandcue_private.programme_parse_instant(p_text text)
returns timestamptz language plpgsql stable set search_path = pg_catalog, pg_temp as $$
begin
  if p_text is null or p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
    return null;
  end if;
  return p_text::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function strandcue_private.programme_is_count(p_value jsonb)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_value is not null and jsonb_typeof(p_value) = 'number' and p_value::text ~ '^[0-9]{1,9}$'
$$;

create or replace function strandcue_private.programme_is_text(p_value jsonb, p_max integer)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select p_value is not null and jsonb_typeof(p_value) = 'string'
     and char_length(p_value #>> '{}') between 1 and p_max and (p_value #>> '{}') = btrim(p_value #>> '{}')
$$;

create or replace function strandcue_private.programme_keys_within(p_object jsonb, p_required text[], p_optional text[])
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select jsonb_typeof(p_object) = 'object'
     and not exists (select 1 from jsonb_object_keys(p_object) k where k <> all (p_required || p_optional))
     and not exists (select 1 from unnest(p_required) r where not (p_object ? r))
$$;

-- A reviewed programme rule, as typed data (no expressions). Mirrors the domain ProgrammeRuleSchema.
create or replace function strandcue_private.programme_rule_valid(p_rule jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_policy jsonb;
  v_range jsonb;
  v_resume jsonb;
begin
  if not strandcue_private.programme_keys_within(p_rule,
       array['ruleId','ruleVersion','productId','productVersionId','unit','applicationWashCounts','transitionPolicy'],
       array['range','interruptionPolicy','resumptionRule']) then
    return false;
  end if;
  if not strandcue_private.programme_is_text(p_rule -> 'ruleId', 200) or not strandcue_private.programme_is_text(p_rule -> 'ruleVersion', 200) then return false; end if;
  if (p_rule ->> 'productId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (p_rule ->> 'productVersionId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if jsonb_typeof(p_rule -> 'productId') <> 'string' or jsonb_typeof(p_rule -> 'productVersionId') <> 'string' then return false; end if;
  if (p_rule ->> 'unit') is null or (p_rule ->> 'unit') not in ('wash', 'shampoo-session') then return false; end if;
  if jsonb_typeof(p_rule -> 'applicationWashCounts') <> 'boolean' then return false; end if;
  v_policy := p_rule -> 'transitionPolicy';
  if not strandcue_private.programme_keys_within(v_policy, array['initialPhaseLimit','reassessmentThreshold'], array['maintenanceThreshold']) then return false; end if;
  if not strandcue_private.programme_is_count(v_policy -> 'initialPhaseLimit') or not strandcue_private.programme_is_count(v_policy -> 'reassessmentThreshold') then return false; end if;
  if (v_policy ->> 'initialPhaseLimit')::integer >= (v_policy ->> 'reassessmentThreshold')::integer then return false; end if;
  if v_policy ? 'maintenanceThreshold' then
    if not strandcue_private.programme_is_count(v_policy -> 'maintenanceThreshold')
       or (v_policy ->> 'maintenanceThreshold')::integer < (v_policy ->> 'reassessmentThreshold')::integer then return false; end if;
  end if;
  if p_rule ? 'range' then
    v_range := p_rule -> 'range';
    if not strandcue_private.programme_keys_within(v_range, array['minimum','maximum'], array[]::text[]) then return false; end if;
    if not strandcue_private.programme_is_count(v_range -> 'minimum') or not strandcue_private.programme_is_count(v_range -> 'maximum') then return false; end if;
    if (v_range ->> 'minimum')::integer > (v_range ->> 'maximum')::integer then return false; end if;
  end if;
  if p_rule ? 'interruptionPolicy' and (p_rule -> 'interruptionPolicy') is distinct from to_jsonb('requires_resumption'::text) then return false; end if;
  if p_rule ? 'resumptionRule' then
    v_resume := p_rule -> 'resumptionRule';
    if not strandcue_private.programme_keys_within(v_resume, array['ruleId','ruleVersion','policy'], array[]::text[]) then return false; end if;
    if not strandcue_private.programme_is_text(v_resume -> 'ruleId', 200) or not strandcue_private.programme_is_text(v_resume -> 'ruleVersion', 200) then return false; end if;
    if (v_resume -> 'policy') is distinct from to_jsonb('resume_from_pause'::text) then return false; end if;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

-- The completion snapshot contract (domain CompletedSnapshotSchema), enforced again at the table.
create or replace function strandcue_private.programme_snapshot_valid(p_snapshot jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_pub jsonb;
  v_app jsonb;
  v_events jsonb;
  v_count integer;
  v_completed timestamptz;
  v_asof timestamptz;
  v_app_at timestamptz;
begin
  if not strandcue_private.programme_keys_within(p_snapshot,
       array['enrolmentId','productId','productVersionId','ruleId','ruleVersion','rulePublication','state','dueStatus','unit','count','eventsUsed','application','asOf','completedAt'],
       array['range']) then return false; end if;
  if (p_snapshot -> 'state') is distinct from to_jsonb('completed'::text) then return false; end if;
  if (p_snapshot ->> 'dueStatus') is null or (p_snapshot ->> 'dueStatus') not in ('not_due','eligible','due') then return false; end if;
  if (p_snapshot ->> 'unit') is null or (p_snapshot ->> 'unit') not in ('wash','shampoo-session') then return false; end if;
  if not strandcue_private.programme_is_count(p_snapshot -> 'count') then return false; end if;
  if not strandcue_private.programme_is_text(p_snapshot -> 'enrolmentId', 200) or not strandcue_private.programme_is_text(p_snapshot -> 'productId', 200)
     or not strandcue_private.programme_is_text(p_snapshot -> 'productVersionId', 200) or not strandcue_private.programme_is_text(p_snapshot -> 'ruleId', 200)
     or not strandcue_private.programme_is_text(p_snapshot -> 'ruleVersion', 200) then return false; end if;
  v_pub := p_snapshot -> 'rulePublication';
  if not strandcue_private.programme_keys_within(v_pub, array['artifactId','artifactVersion','contentDigest'], array[]::text[]) then return false; end if;
  if not strandcue_private.programme_is_text(v_pub -> 'artifactId', 200) or not strandcue_private.programme_is_text(v_pub -> 'artifactVersion', 200)
     or jsonb_typeof(v_pub -> 'contentDigest') <> 'string' or (v_pub ->> 'contentDigest') !~ '^sha256:[a-f0-9]{64}$' then return false; end if;
  if p_snapshot ? 'range' then
    if not strandcue_private.programme_keys_within(p_snapshot -> 'range', array['minimum','maximum'], array[]::text[])
       or not strandcue_private.programme_is_count(p_snapshot #> '{range,minimum}') or not strandcue_private.programme_is_count(p_snapshot #> '{range,maximum}')
       or (p_snapshot #>> '{range,minimum}')::integer > (p_snapshot #>> '{range,maximum}')::integer then return false; end if;
  end if;
  v_events := p_snapshot -> 'eventsUsed';
  v_app := p_snapshot -> 'application';
  if jsonb_typeof(v_events) <> 'array' or jsonb_array_length(v_events) < 1 or jsonb_array_length(v_events) > 1001 then return false; end if;
  if not strandcue_private.programme_keys_within(v_app, array['eventId','kind','date'], array[]::text[]) then return false; end if;
  if (v_app -> 'kind') is distinct from to_jsonb('application'::text) then return false; end if;
  if not strandcue_private.programme_keys_within(v_app -> 'date', array['precision','value'], array[]::text[])
     or (v_app #>> '{date,precision}') is distinct from 'exact' then return false; end if;
  v_app_at := strandcue_private.programme_parse_instant(v_app #>> '{date,value}');
  v_completed := strandcue_private.programme_parse_instant(p_snapshot ->> 'completedAt');
  v_asof := strandcue_private.programme_parse_instant(p_snapshot ->> 'asOf');
  if v_app_at is null or v_completed is null or v_asof is null then return false; end if;
  if v_completed > v_asof or v_completed < v_app_at then return false; end if;
  if exists (
    select 1 from jsonb_array_elements(v_events) e(value)
     where not strandcue_private.programme_keys_within(e.value, array['eventId','kind','date'], array[]::text[])
        or (e.value ->> 'kind') is null or (e.value ->> 'kind') not in ('wash','application')
        or not strandcue_private.programme_is_text(e.value -> 'eventId', 400)
        or not strandcue_private.programme_keys_within(e.value -> 'date', array['precision','value'], array[]::text[])
        or (e.value #>> '{date,precision}') is null or (e.value #>> '{date,precision}') not in ('exact', 'day', 'approximate')
        or jsonb_typeof(e.value #> '{date,value}') is distinct from 'string'
        or ((e.value #>> '{date,precision}') = 'exact' and strandcue_private.programme_parse_instant(e.value #>> '{date,value}') is null)
        or ((e.value #>> '{date,precision}') = 'day' and (e.value #>> '{date,value}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) then return false; end if;
  select count(*) into v_count from jsonb_array_elements(v_events) e(value) where e.value = v_app;
  if v_count <> 1 then return false; end if;
  if (select count(distinct e.value ->> 'eventId') from jsonb_array_elements(v_events) e(value)) <> jsonb_array_length(v_events) then return false; end if;
  if exists (
    select 1 from (
      select (e.value #>> '{date,precision}') p, coalesce(e.value #>> '{date,value}', '') v, (e.value ->> 'kind') k, (e.value ->> 'eventId') i,
             lag(e.value #>> '{date,precision}') over (order by e.ordinality) pp, lag(coalesce(e.value #>> '{date,value}', '')) over (order by e.ordinality) pv,
             lag(e.value ->> 'kind') over (order by e.ordinality) pk, lag(e.value ->> 'eventId') over (order by e.ordinality) pi
        from jsonb_array_elements(v_events) with ordinality e(value, ordinality)) ordered
     where ordered.pp is not null
       and (ordered.pp collate "C", ordered.pv collate "C", ordered.pk collate "C", ordered.pi collate "C")
         > (ordered.p collate "C", ordered.v collate "C", ordered.k collate "C", ordered.i collate "C")) then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reviewed rule publications (authority content). Created empty; nothing here publishes a rule.
-- ---------------------------------------------------------------------------------------------

create table if not exists strandcue_private.programme_rule_publications (
  id uuid primary key default gen_random_uuid(),
  artifact_id text not null check (char_length(artifact_id) between 1 and 200),
  artifact_version text not null check (char_length(artifact_version) between 1 and 200),
  content_digest text not null check (content_digest ~ '^sha256:[a-f0-9]{64}$'),
  rule jsonb not null check (strandcue_private.programme_rule_valid(rule)),
  state text not null check (state in ('draft', 'published', 'withdrawn')),
  authored_by text not null check (char_length(btrim(authored_by)) between 1 and 200),
  reviewed_by text check (reviewed_by is null or char_length(btrim(reviewed_by)) between 1 and 200),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (artifact_id, artifact_version),
  -- The digest binds the exact rule bytes: a rule that differs from its digest cannot exist.
  constraint programme_rule_digest_binds_content check (
    content_digest = 'sha256:' || encode(sha256(convert_to(rule::text, 'UTF8')), 'hex')),
  constraint programme_rule_review check (
    state = 'draft' or (
      reviewed_by is not null and reviewed_at is not null and published_at is not null
      and lower(btrim(reviewed_by)) <> lower(btrim(authored_by))
      and lower(btrim(reviewed_by)) <> all (array[
        'unknown', 'unassigned', 'unassigned-draft', 'n/a', 'na', 'none', 'null', 'nil', 'tbd', 'tba', 'todo',
        'pending', 'placeholder', 'example', 'reviewer', 'author', 'reviewer-1', 'reviewer-a', 'reviewer-b',
        'author-a', 'author-b', 'fixture', 'fake', 'dummy', 'synthetic', 'test'])
    ))
);
create unique index if not exists programme_rule_one_published
  on strandcue_private.programme_rule_publications ((rule ->> 'ruleId'), (rule ->> 'ruleVersion')) where state = 'published';

create or replace function strandcue_private.programme_rule_guard()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'draft' or pg_trigger_depth() > 1 then return old; end if;
    raise exception 'programme-rule-immutable' using errcode = 'P0001';
  end if;
  if old.state = 'draft' then
    return new;
  end if;
  -- A published row can only be withdrawn; a withdrawn row never changes.
  if old.state = 'published' and new.state = 'withdrawn'
     and new.id = old.id and new.artifact_id = old.artifact_id and new.artifact_version = old.artifact_version
     and new.content_digest = old.content_digest and new.rule is not distinct from old.rule
     and new.authored_by = old.authored_by and new.reviewed_by is not distinct from old.reviewed_by
     and new.reviewed_at is not distinct from old.reviewed_at and new.published_at is not distinct from old.published_at then
    return new;
  end if;
  raise exception 'programme-rule-immutable' using errcode = 'P0001';
end;
$$;
drop trigger if exists programme_rule_publications_guard on strandcue_private.programme_rule_publications;
create trigger programme_rule_publications_guard before update or delete on strandcue_private.programme_rule_publications
  for each row execute function strandcue_private.programme_rule_guard();

-- ---------------------------------------------------------------------------------------------
-- Trusted care classification of confirmed execution steps (no writer exists yet: created empty)
-- ---------------------------------------------------------------------------------------------

create table if not exists strandcue_private.execution_step_care (
  user_id uuid not null,
  execution_id uuid not null,
  step_id text not null check (char_length(step_id) between 1 and 200),
  run_id uuid not null,
  kind text not null check (kind in ('none', 'wash', 'application', 'heat')),
  shampoo_used text check (shampoo_used is null or shampoo_used in ('yes', 'no', 'unknown')),
  created_at timestamptz not null default now(),
  primary key (user_id, execution_id, step_id),
  foreign key (user_id, execution_id) references public.protocol_executions(user_id, execution_id) on delete cascade,
  check ((kind = 'wash') = (shampoo_used is not null))
);

-- ---------------------------------------------------------------------------------------------
-- Owner programme tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.treatment_programmes (
  enrolment_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_version_id uuid not null references public.product_versions(id) on delete restrict,
  rule_id text not null check (char_length(rule_id) between 1 and 200),
  rule_version text not null check (char_length(rule_version) between 1 and 200),
  artifact_id text not null check (char_length(artifact_id) between 1 and 200),
  artifact_version text not null check (char_length(artifact_version) between 1 and 200),
  content_digest text not null check (content_digest ~ '^sha256:[a-f0-9]{64}$'),
  start_precision text not null check (start_precision in ('exact', 'day')),
  start_value text not null,
  selected_application_event_id text check (selected_application_event_id is null or char_length(selected_application_event_id) between 1 and 400),
  status text not null check (status in ('active', 'completed', 'abandoned')),
  revision integer not null check (revision between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrolment_id, user_id),
  foreign key (artifact_id, artifact_version) references strandcue_private.programme_rule_publications(artifact_id, artifact_version) on delete restrict,
  check (
    (start_precision = 'exact' and start_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$')
    or (start_precision = 'day' and start_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'))
);
create unique index if not exists treatment_programmes_one_active
  on public.treatment_programmes(user_id, product_version_id, rule_id, rule_version) where status = 'active';
create index if not exists treatment_programmes_owner_created on public.treatment_programmes(user_id, created_at desc, enrolment_id desc);

create table if not exists public.treatment_programme_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  enrolment_id uuid not null,
  sequence integer not null check (sequence between 1 and 50),
  kind text not null check (kind in ('enrol', 'change', 'pause', 'resume', 'maintenance', 'complete', 'abandon')),
  occurred_at timestamptz,
  reason_code text check (reason_code is null or reason_code ~ '^[a-z][a-z0-9_-]{0,63}$'),
  rule_id text check (rule_id is null or char_length(rule_id) between 1 and 200),
  rule_version text check (rule_version is null or char_length(rule_version) between 1 and 200),
  selected_application_event_id text check (selected_application_event_id is null or char_length(selected_application_event_id) between 1 and 400),
  snapshot jsonb check (snapshot is null or octet_length(snapshot::text) <= 262144),
  recorded_at timestamptz not null default now(),
  unique (enrolment_id, sequence),
  foreign key (enrolment_id, user_id) references public.treatment_programmes(enrolment_id, user_id) on delete cascade,
  check ((sequence = 1) = (kind = 'enrol')),
  check (
    (kind = 'enrol' and occurred_at is null and reason_code is null and rule_id is null and rule_version is null and selected_application_event_id is null and snapshot is null)
    or (kind = 'change' and occurred_at is null and reason_code is null and rule_id is null and rule_version is null and selected_application_event_id is not null and snapshot is null)
    or (kind = 'pause' and occurred_at is not null and reason_code is not null and rule_id is null and rule_version is null and selected_application_event_id is null and snapshot is null)
    or (kind = 'resume' and occurred_at is not null and reason_code is null and rule_id is not null and rule_version is not null and selected_application_event_id is null and snapshot is null)
    or (kind = 'maintenance' and occurred_at is not null and reason_code is null and rule_id is not null and rule_version is not null and selected_application_event_id is null and snapshot is null)
    or (kind = 'abandon' and sequence >= 2 and occurred_at is null and reason_code is null and rule_id is null and rule_version is null and selected_application_event_id is null and snapshot is null)
    or (kind = 'complete' and occurred_at is not null and reason_code is null and rule_id is null and rule_version is null and selected_application_event_id is null
        and snapshot is not null and strandcue_private.programme_snapshot_valid(snapshot))
  )
);
create unique index if not exists treatment_programme_events_one_pause on public.treatment_programme_events(enrolment_id) where kind = 'pause';
create unique index if not exists treatment_programme_events_one_resume on public.treatment_programme_events(enrolment_id) where kind = 'resume';
create unique index if not exists treatment_programme_events_one_maintenance on public.treatment_programme_events(enrolment_id) where kind = 'maintenance';
create unique index if not exists treatment_programme_events_one_complete on public.treatment_programme_events(enrolment_id) where kind = 'complete';
create unique index if not exists treatment_programme_events_one_abandon on public.treatment_programme_events(enrolment_id) where kind = 'abandon';
create index if not exists treatment_programme_events_owner on public.treatment_programme_events(user_id, enrolment_id, sequence);

create table if not exists strandcue_private.treatment_programme_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.treatment_programmes enable row level security;
alter table public.treatment_programmes force row level security;
alter table public.treatment_programme_events enable row level security;
alter table public.treatment_programme_events force row level security;
alter table strandcue_private.treatment_programme_operations enable row level security;
alter table strandcue_private.treatment_programme_operations force row level security;
alter table strandcue_private.programme_rule_publications enable row level security;
alter table strandcue_private.programme_rule_publications force row level security;
alter table strandcue_private.execution_step_care enable row level security;
alter table strandcue_private.execution_step_care force row level security;

drop policy if exists treatment_programmes_owner_read on public.treatment_programmes;
create policy treatment_programmes_owner_read on public.treatment_programmes for select to authenticated
  using (user_id = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = (select strandcue_private.request_uid()) and p.account_status = 'active'));
drop policy if exists treatment_programme_events_owner_read on public.treatment_programme_events;
create policy treatment_programme_events_owner_read on public.treatment_programme_events for select to authenticated
  using (user_id = (select strandcue_private.request_uid()) and exists (
    select 1 from public.profiles p where p.user_id = (select strandcue_private.request_uid()) and p.account_status = 'active'));
drop policy if exists treatment_programmes_mutator_select on public.treatment_programmes;
create policy treatment_programmes_mutator_select on public.treatment_programmes for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programmes_mutator_insert on public.treatment_programmes;
create policy treatment_programmes_mutator_insert on public.treatment_programmes for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programmes_mutator_update on public.treatment_programmes;
create policy treatment_programmes_mutator_update on public.treatment_programmes for update to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid())) with check (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programme_events_mutator_select on public.treatment_programme_events;
create policy treatment_programme_events_mutator_select on public.treatment_programme_events for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programme_events_mutator_insert on public.treatment_programme_events;
create policy treatment_programme_events_mutator_insert on public.treatment_programme_events for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programme_operations_mutator_select on strandcue_private.treatment_programme_operations;
create policy treatment_programme_operations_mutator_select on strandcue_private.treatment_programme_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
drop policy if exists treatment_programme_operations_mutator_insert on strandcue_private.treatment_programme_operations;
create policy treatment_programme_operations_mutator_insert on strandcue_private.treatment_programme_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
drop policy if exists programme_rule_publications_mutator_select on strandcue_private.programme_rule_publications;
create policy programme_rule_publications_mutator_select on strandcue_private.programme_rule_publications for select to strandcue_mutator using (true);
drop policy if exists execution_step_care_mutator_select on strandcue_private.execution_step_care;
create policy execution_step_care_mutator_select on strandcue_private.execution_step_care for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));

revoke all on table public.treatment_programmes, public.treatment_programme_events from public, anon, authenticated;
grant select on table public.treatment_programmes, public.treatment_programme_events to authenticated;
grant select, insert, update on table public.treatment_programmes to strandcue_mutator;
grant select, insert on table public.treatment_programme_events to strandcue_mutator;
revoke all on table strandcue_private.treatment_programme_operations, strandcue_private.programme_rule_publications, strandcue_private.execution_step_care from public, anon, authenticated;
grant select, insert on table strandcue_private.treatment_programme_operations to strandcue_mutator;
grant select on table strandcue_private.programme_rule_publications to strandcue_mutator;
grant select on table strandcue_private.execution_step_care to strandcue_mutator;
-- The cores read the owner's executions and wash activities under the same owner-confined policies.
grant select on public.protocol_executions to strandcue_mutator;

-- ---------------------------------------------------------------------------------------------
-- Append-only guards
-- ---------------------------------------------------------------------------------------------

create or replace function strandcue_private.programme_event_immutable()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  -- Profile deletion cascades through the owner graph; every other rewrite or delete is forbidden.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'programme-event-immutable' using errcode = 'P0001';
end;
$$;
drop trigger if exists treatment_programme_events_immutable on public.treatment_programme_events;
create trigger treatment_programme_events_immutable before update or delete on public.treatment_programme_events
  for each row execute function strandcue_private.programme_event_immutable();

create or replace function strandcue_private.programme_refuse_truncate()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp set row_security = off as $$
declare
  v_has boolean;
begin
  begin
    select exists (select 1 from public.treatment_programmes) or exists (select 1 from public.treatment_programme_events) into v_has;
  exception when others then
    v_has := true;
  end;
  if v_has then
    raise exception 'programme-event-immutable' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
drop trigger if exists treatment_programme_events_truncate on public.treatment_programme_events;
create trigger treatment_programme_events_truncate before truncate on public.treatment_programme_events
  for each statement execute function strandcue_private.programme_refuse_truncate();
drop trigger if exists treatment_programmes_truncate on public.treatment_programmes;
create trigger treatment_programmes_truncate before truncate on public.treatment_programmes
  for each statement execute function strandcue_private.programme_refuse_truncate();

-- The head moves only with a matching append-only event row: revision + 1 and exactly the facts that
-- event records. Identity, rule binding and start date never change.
create or replace function strandcue_private.programme_head_guard()
returns trigger language plpgsql set search_path = pg_catalog, pg_temp as $$
declare
  v_event public.treatment_programme_events%rowtype;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then return old; end if;
    raise exception 'programme-head-immutable' using errcode = 'P0001';
  end if;
  if new.user_id is distinct from old.user_id or new.enrolment_id is distinct from old.enrolment_id
     or new.product_id is distinct from old.product_id or new.product_version_id is distinct from old.product_version_id
     or new.rule_id is distinct from old.rule_id or new.rule_version is distinct from old.rule_version
     or new.artifact_id is distinct from old.artifact_id or new.artifact_version is distinct from old.artifact_version
     or new.content_digest is distinct from old.content_digest or new.start_precision is distinct from old.start_precision
     or new.start_value is distinct from old.start_value or new.created_at is distinct from old.created_at
     or new.revision is distinct from old.revision + 1 then
    raise exception 'programme-head-invalid' using errcode = 'P0001';
  end if;
  select * into v_event from public.treatment_programme_events e where e.enrolment_id = new.enrolment_id and e.sequence = new.revision;
  if not found or v_event.user_id is distinct from new.user_id then
    raise exception 'programme-head-invalid' using errcode = 'P0001';
  end if;
  if v_event.kind = 'change' then
    if new.status is distinct from old.status or old.status <> 'active' or new.selected_application_event_id is distinct from v_event.selected_application_event_id then
      raise exception 'programme-head-invalid' using errcode = 'P0001';
    end if;
  elsif v_event.kind in ('pause', 'resume', 'maintenance') then
    if new.status is distinct from old.status or old.status <> 'active' or new.selected_application_event_id is distinct from old.selected_application_event_id then
      raise exception 'programme-head-invalid' using errcode = 'P0001';
    end if;
  elsif v_event.kind = 'complete' then
    if old.status <> 'active' or new.status <> 'completed' or new.selected_application_event_id is distinct from old.selected_application_event_id then
      raise exception 'programme-head-invalid' using errcode = 'P0001';
    end if;
  elsif v_event.kind = 'abandon' then
    if old.status <> 'active' or new.status <> 'abandoned' or new.selected_application_event_id is distinct from old.selected_application_event_id then
      raise exception 'programme-head-invalid' using errcode = 'P0001';
    end if;
  else
    raise exception 'programme-head-invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists treatment_programmes_head_guard on public.treatment_programmes;
create trigger treatment_programmes_head_guard before update or delete on public.treatment_programmes
  for each row execute function strandcue_private.programme_head_guard();

-- ---------------------------------------------------------------------------------------------
-- Derived-state helpers (pure)
-- ---------------------------------------------------------------------------------------------

create or replace function strandcue_private.programme_missing(p_code text, p_event_id text, p_explanation text)
returns jsonb language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when p_event_id is null then jsonb_build_object('code', p_code, 'explanation', p_explanation)
              else jsonb_build_object('code', p_code, 'eventId', p_event_id, 'explanation', p_explanation) end
$$;

create or replace function strandcue_private.programme_instant(p_date jsonb)
returns timestamptz language sql stable set search_path = pg_catalog, pg_temp as $$
  select case p_date ->> 'precision'
    when 'exact' then strandcue_private.programme_parse_instant(p_date ->> 'value')
    when 'day' then strandcue_private.programme_parse_instant((p_date ->> 'value') || 'T00:00:00.000Z')
    else null end
$$;

create or replace function strandcue_private.programme_exact_instant(p_date jsonb)
returns timestamptz language sql stable set search_path = pg_catalog, pg_temp as $$
  select case when p_date ->> 'precision' = 'exact' then strandcue_private.programme_parse_instant(p_date ->> 'value') else null end
$$;

-- The canonical ordering value (domain compareCareEvents): approximate dates order by their first day.
create or replace function strandcue_private.programme_order_value(p_date jsonb)
returns timestamptz language sql stable set search_path = pg_catalog, pg_temp as $$
  select case p_date ->> 'precision'
    when 'exact' then strandcue_private.programme_parse_instant(p_date ->> 'value')
    when 'day' then strandcue_private.programme_parse_instant((p_date ->> 'value') || 'T00:00:00.000Z')
    when 'approximate' then strandcue_private.programme_parse_instant(
      case when char_length(p_date ->> 'value') = 7 then (p_date ->> 'value') || '-01T00:00:00.000Z' else (p_date ->> 'value') || '-01-01T00:00:00.000Z' end)
    else null end
$$;

create or replace function strandcue_private.programme_sort_events(p_events jsonb)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(e.value order by strandcue_private.programme_order_value(e.value -> 'date') asc nulls last, (e.value ->> 'eventId') collate "C"), '[]'::jsonb)
    from jsonb_array_elements(p_events) e
$$;

create or replace function strandcue_private.programme_refs(p_events jsonb)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('eventId', e.value -> 'eventId', 'kind', e.value -> 'kind', 'date', e.value -> 'date') order by e.ordinality), '[]'::jsonb)
    from jsonb_array_elements(strandcue_private.programme_sort_events(p_events)) with ordinality e(value, ordinality)
$$;

create or replace function strandcue_private.programme_sort_missing(p_missing jsonb)
returns jsonb language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(m.value order by (m.value ->> 'code') collate "C", (m.value ->> 'explanation') collate "C", coalesce(m.value ->> 'eventId', '') collate "C"), '[]'::jsonb)
    from jsonb_array_elements(p_missing) m
$$;

create or replace function strandcue_private.programme_sort_texts(p_texts jsonb)
returns jsonb language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(jsonb_agg(t.value order by (t.value #>> '{}') collate "C"), '[]'::jsonb) from jsonb_array_elements(p_texts) t
$$;

create or replace function strandcue_private.programme_is_application_wash(p_application jsonb, p_wash jsonb)
returns boolean language sql immutable set search_path = pg_catalog, pg_temp as $$
  select (p_wash ->> 'eventId') <> (p_application ->> 'eventId')
     and (p_wash ->> 'provenance') = 'execution-confirmed' and (p_application ->> 'provenance') = 'execution-confirmed'
     and (p_wash ->> 'recordId') = (p_application ->> 'recordId') and (p_wash ->> 'runId') = (p_application ->> 'runId')
$$;

create or replace function strandcue_private.programme_count_result(
  p_unit text, p_count integer, p_range jsonb, p_status text, p_missing jsonb, p_used jsonb, p_application jsonb, p_asof text)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('unit', p_unit, 'status', p_status, 'missing', strandcue_private.programme_sort_missing(p_missing),
           'eventsUsed', strandcue_private.programme_refs(p_used), 'asOf', p_asof,
           'application', case when p_application is null then 'null'::jsonb else jsonb_build_object('eventId', p_application -> 'eventId', 'kind', p_application -> 'kind', 'date', p_application -> 'date') end)
      || case when p_count is null then '{}'::jsonb else jsonb_build_object('count', p_count) end
      || case when p_range is null then '{}'::jsonb else jsonb_build_object('range', p_range) end
$$;

-- Named-unit wash counting after one confirmed treatment application (domain countWashes).
create or replace function strandcue_private.programme_count(
  p_events jsonb, p_unit text, p_app_washes boolean, p_selected text, p_range jsonb, p_asof timestamptz)
returns jsonb language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  v_asof text := strandcue_private.programme_iso(p_asof);
  v_apps jsonb;
  v_app jsonb;
  v_app_inst timestamptz;
  v_missing jsonb;
  v_used jsonb;
  v_count integer;
begin
  select coalesce(jsonb_agg(e.value), '[]'::jsonb) into v_apps
    from jsonb_array_elements(p_events) e where e.value ->> 'kind' = 'application' and e.value ->> 'lifecycle' = 'active';
  if jsonb_array_length(v_apps) = 0 then
    return strandcue_private.programme_count_result(p_unit, null, p_range, 'needs_input',
      jsonb_build_array(strandcue_private.programme_missing('missing-treatment-application', null, 'No confirmed treatment application was recorded to count washes from.')),
      '[]'::jsonb, null, v_asof);
  end if;
  if jsonb_array_length(v_apps) > 1 then
    select e.value into v_app from jsonb_array_elements(v_apps) e where p_selected is not null and e.value ->> 'eventId' = p_selected limit 1;
    if v_app is null then
      return strandcue_private.programme_count_result(p_unit, null, p_range, 'needs_input',
        jsonb_build_array(strandcue_private.programme_missing('multiple-treatment-applications', null,
          case when p_selected is null then 'More than one confirmed treatment application was recorded; select one to count from.'
               else 'The selected treatment application was not found among the confirmed applications.' end)),
        '[]'::jsonb, null, v_asof);
    end if;
  else
    v_app := v_apps -> 0;
  end if;
  v_app_inst := strandcue_private.programme_instant(v_app -> 'date');
  if v_app_inst is null then
    return strandcue_private.programme_count_result(p_unit, null, p_range, 'needs_input',
      jsonb_build_array(strandcue_private.programme_missing('application-date-unknown', v_app ->> 'eventId',
        'The treatment application date is unknown, so washes cannot be placed before or after it.')),
      '[]'::jsonb, null, v_asof);
  end if;

  -- One pass over the wash events (linear): each wash is either the application wash or an elapsed candidate.
  with wash as (
    select e.value w, strandcue_private.programme_instant(e.value -> 'date') inst,
           strandcue_private.programme_is_application_wash(v_app, e.value) app_wash
      from jsonb_array_elements(p_events) e where e.value ->> 'kind' = 'wash' and e.value ->> 'lifecycle' = 'active'),
  eligible as (
    select w, inst, app_wash,
           case when app_wash then p_app_washes and v_app_inst <= p_asof and inst is not null and inst <= p_asof
                else inst is not null and inst <= p_asof and inst > v_app_inst end as in_scope
      from wash),
  judged as (
    select w, in_scope,
           case when p_unit = 'shampoo-session' then in_scope and w ->> 'shampooUsed' = 'yes' else in_scope end as counted,
           case
             when inst is null and not app_wash then
               case when w #>> '{date,precision}' = 'unknown'
                 then strandcue_private.programme_missing('wash-date-unknown', w ->> 'eventId', 'This wash date is unknown, so it cannot be placed before or after the treatment or as-of date.')
                 else strandcue_private.programme_missing('date-precision-too-coarse', w ->> 'eventId', 'This wash is recorded only to month or year precision, so it cannot be placed reliably before or after the treatment or as-of date.') end
             when inst is null and app_wash and p_app_washes and v_app_inst <= p_asof then
               strandcue_private.programme_missing('wash-date-unknown', w ->> 'eventId', 'The wash containing the treatment application has an unknown date, so it cannot be placed relative to the as-of date.')
             when in_scope and p_unit = 'shampoo-session' and w ->> 'shampooUsed' = 'unknown' then
               strandcue_private.programme_missing('shampoo-use-unknown', w ->> 'eventId',
                 case when app_wash then 'Shampoo use is unknown for the wash containing the treatment application, so it may or may not count as a shampoo session.'
                      else 'Shampoo use is unknown for this wash, so it may or may not count as a shampoo session.' end)
           end as missing_fact
      from eligible)
  select coalesce(jsonb_agg(w) filter (where counted), '[]'::jsonb), count(*) filter (where counted)::integer,
         coalesce(jsonb_agg(missing_fact) filter (where missing_fact is not null), '[]'::jsonb)
    into v_used, v_count, v_missing from judged;

  if v_app ->> 'provenance' <> 'execution-confirmed' and p_app_washes and exists (
       select 1 from jsonb_array_elements(p_events) e
        where e.value ->> 'kind' = 'wash' and e.value ->> 'lifecycle' = 'active'
          and strandcue_private.programme_instant(e.value -> 'date') is not null and strandcue_private.programme_instant(e.value -> 'date') <= p_asof) then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('application-wash-relationship-unknown', null,
      'The treatment was not recorded in a confirmed execution session, so the wash containing it cannot be identified from the event record.'));
  end if;

  if jsonb_array_length(v_missing) > 0 then
    return strandcue_private.programme_count_result(p_unit, null, p_range, 'needs_input', v_missing, '[]'::jsonb, null, v_asof);
  end if;
  return strandcue_private.programme_count_result(p_unit, v_count, p_range, 'counted', '[]'::jsonb, v_used, v_app, v_asof);
end;
$$;

create or replace function strandcue_private.programme_start_order(p_application_date jsonb, p_start_precision text, p_start_value text)
returns text language sql stable set search_path = pg_catalog, pg_temp as $$
  select case
    when p_application_date ->> 'precision' <> 'exact' then 'allowed'
    when p_start_precision = 'exact' then
      case when strandcue_private.programme_parse_instant(p_application_date ->> 'value') < strandcue_private.programme_parse_instant(p_start_value) then 'before' else 'allowed' end
    when p_start_precision = 'day' then
      case when left(p_application_date ->> 'value', 10) < p_start_value then 'before' else 'allowed' end
    else 'unknown' end
$$;

create or replace function strandcue_private.programme_build(
  p_state text, p_due text, p_unit text, p_count integer, p_range jsonb, p_missing jsonb, p_used_refs jsonb, p_application jsonb,
  p_asof text, p_reasons jsonb, p_from_snapshot boolean, p_rule_id text, p_rule_version text)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('state', p_state, 'dueStatus', p_due, 'eventsUsed', p_used_refs, 'application', coalesce(p_application, 'null'::jsonb),
           'asOf', p_asof, 'missing', strandcue_private.programme_sort_missing(p_missing),
           'reasonCodes', strandcue_private.programme_sort_texts(p_reasons), 'fromCompletedSnapshot', p_from_snapshot,
           'ruleId', p_rule_id, 'ruleVersion', p_rule_version, 'unit', to_jsonb(p_unit))
      || case when p_count is null then '{}'::jsonb else jsonb_build_object('count', p_count) end
      || case when p_range is null then '{}'::jsonb else jsonb_build_object('range', p_range) end
$$;

-- The error a refused operation reports for a derived missing fact (priority order, stable codes only).
create or replace function strandcue_private.programme_error_for(p_missing jsonb)
returns text language sql immutable set search_path = pg_catalog, pg_temp as $$
  with mapped as (
    select case m.value ->> 'code'
      when 'rule-withdrawn' then 'rule-withdrawn'
      when 'rule-draft' then 'rule-content-pending' when 'missing-transition-policy' then 'rule-content-pending'
      when 'rule-id-mismatch' then 'rule-publication-mismatch' when 'rule-version-mismatch' then 'rule-publication-mismatch' when 'rule-publication-mismatch' then 'rule-publication-mismatch'
      when 'product-unverified' then 'product-unverified'
      when 'product-rule-mismatch' then 'product-mismatch' when 'product-version-mismatch' then 'product-mismatch' when 'product-version-missing' then 'product-mismatch'
      when 'application-product-unknown' then 'product-mismatch' when 'application-product-mismatch' then 'product-mismatch'
      when 'interruption-without-resumption' then 'pause-resumption-required'
      when 'resumption-version-mismatch' then 'resumption-rule-mismatch'
      when 'missing-treatment-application' then 'application-missing' when 'application-date-unknown' then 'application-missing'
      when 'multiple-treatment-applications' then 'application-ambiguous'
      when 'application-before-enrolment' then 'invalid-chronology' when 'application-start-date-unknown' then 'invalid-chronology' when 'resumption-date-invalid' then 'invalid-chronology'
      when 'maintenance-transition-missing' then 'maintenance-not-proven' when 'maintenance-transition-mismatch' then 'maintenance-not-proven'
      when 'snapshot-mismatch' then 'snapshot-conflict' when 'snapshot-invalid' then 'snapshot-conflict'
      else 'count-not-proven' end code
    from jsonb_array_elements(p_missing) m)
  select coalesce((select code from mapped order by array_position(array['rule-withdrawn','rule-content-pending','rule-publication-mismatch','product-unverified',
    'product-mismatch','pause-resumption-required','resumption-rule-mismatch','application-missing','application-ambiguous','invalid-chronology','maintenance-not-proven',
    'snapshot-conflict','count-not-proven'], code) limit 1), 'count-not-proven')
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner-scoped joins (read the owner's own rows through the mutator's owner-confined policies)
-- ---------------------------------------------------------------------------------------------

create or replace function strandcue_private.programme_product_verified(p_product_id uuid, p_version_id uuid)
returns boolean language sql stable set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.product_versions v where v.id = p_version_id and v.product_id = p_product_id)
     and coalesce((select e.status = 'verified' from public.product_verification_events e
                    where e.version_id = p_version_id order by e.recorded_at desc, e.id desc limit 1), false)
$$;

-- Canonical care events for one owner: confirmed execution steps with a trusted classification (wash or
-- application) and active owner-recorded wash activities. A confirmed step with no (or a mis-bound)
-- classification blocks derivation, because ignoring it could undercount (the domain fails closed too).
create or replace function strandcue_private.programme_care_events(p_uid uuid)
returns jsonb language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  v_executions integer;
  v_unclassified integer;
  v_events jsonb;
begin
  select count(*) into v_executions from public.protocol_executions e where e.user_id = p_uid;
  if v_executions > 200 then
    return jsonb_build_object('events', '[]'::jsonb, 'blocked', 'source-too-large');
  end if;
  select count(*) into v_unclassified
    from public.protocol_executions e
    cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution -> 'steps') = 'array' then e.execution -> 'steps' else '[]'::jsonb end) s(step)
    left join strandcue_private.execution_step_care c
      on c.user_id = e.user_id and c.execution_id = e.execution_id and c.step_id = (s.step ->> 'stepId')
   where e.user_id = p_uid and s.step ->> 'state' = 'confirmed' and jsonb_typeof(s.step -> 'confirmedAt') = 'string'
     and (c.step_id is null or c.run_id is distinct from e.recommendation_run_id
          or strandcue_private.programme_parse_instant(s.step ->> 'confirmedAt') is null);
  if v_unclassified > 0 then
    return jsonb_build_object('events', '[]'::jsonb, 'blocked', 'unclassified-actual-use');
  end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_events from (
    select jsonb_build_object(
             'eventId', length('execution-confirmed')::text || ':execution-confirmed:' || length(e.execution_id::text)::text || ':' || e.execution_id::text || ':' || length(c.step_id)::text || ':' || c.step_id,
             'kind', c.kind, 'provenance', 'execution-confirmed', 'lifecycle', 'active',
             'date', jsonb_build_object('precision', 'exact', 'value', strandcue_private.programme_iso(strandcue_private.programme_parse_instant(s.step ->> 'confirmedAt'))),
             'recordId', e.execution_id::text, 'runId', e.recommendation_run_id::text,
             'shampooUsed', c.shampoo_used,
             'productId', case when (s.step #>> '{planned,productId}') is not null and (s.step #>> '{planned,productVersionId}') is not null then s.step #>> '{planned,productId}' end,
             'productVersionId', case when (s.step #>> '{planned,productId}') is not null and (s.step #>> '{planned,productVersionId}') is not null then s.step #>> '{planned,productVersionId}' end) item
      from public.protocol_executions e
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.execution -> 'steps') = 'array' then e.execution -> 'steps' else '[]'::jsonb end) s(step)
      join strandcue_private.execution_step_care c
        on c.user_id = e.user_id and c.execution_id = e.execution_id and c.step_id = (s.step ->> 'stepId')
     where e.user_id = p_uid and s.step ->> 'state' = 'confirmed' and jsonb_typeof(s.step -> 'confirmedAt') = 'string'
       and c.run_id = e.recommendation_run_id and c.kind in ('wash', 'application')
    union all
    select jsonb_build_object(
             'eventId', length('activity-recorded')::text || ':activity-recorded:' || length(a.id::text)::text || ':' || a.id::text,
             'kind', 'wash', 'provenance', 'activity-recorded', 'lifecycle', 'active',
             'date', case
               when a.precision = 'unknown' or (base.effective_date ->> 'precision') = 'unknown' or (base.effective_date ->> 'value') is null
                 then jsonb_build_object('precision', 'unknown', 'value', null)
               when a.precision = 'exact_day' and (base.effective_date ->> 'precision') in ('day', 'exact_day')
                 then jsonb_build_object('precision', 'day', 'value', left(base.effective_date ->> 'value', 10))
               when a.precision = 'exact_year'
                 then jsonb_build_object('precision', 'approximate', 'value', left(base.effective_date ->> 'value', 4))
               else jsonb_build_object('precision', 'approximate', 'value', left(base.effective_date ->> 'value', 7)) end,
             'recordId', a.id::text, 'runId', null, 'shampooUsed', 'unknown', 'productId', null, 'productVersionId', null)
      from public.activities a
      join lateral (select r.effective_date from public.activity_revisions r where r.activity_id = a.id and r.owner = a.owner and r.sequence = 1) base on true
     where a.owner = p_uid and a.kind = 'wash' and a.status = 'active') events;
  if jsonb_array_length(v_events) > 1000 then
    return jsonb_build_object('events', '[]'::jsonb, 'blocked', 'source-too-large');
  end if;
  return jsonb_build_object('events', v_events, 'blocked', null);
end;
$$;

-- The stored facts of one programme plus its folded lifecycle (never a count or a due status).
create or replace function strandcue_private.programme_record(p_programme public.treatment_programmes)
returns jsonb language sql stable set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'enrolmentId', p_programme.enrolment_id, 'productId', p_programme.product_id, 'productVersionId', p_programme.product_version_id,
    'ruleId', p_programme.rule_id, 'ruleVersion', p_programme.rule_version,
    'rulePublication', jsonb_build_object('artifactId', p_programme.artifact_id, 'artifactVersion', p_programme.artifact_version, 'contentDigest', p_programme.content_digest),
    'startDate', jsonb_build_object('precision', p_programme.start_precision, 'value', p_programme.start_value),
    'selectedApplicationEventId', p_programme.selected_application_event_id,
    'status', p_programme.status, 'revision', p_programme.revision,
    'paused', (select jsonb_build_object('pausedAt', strandcue_private.programme_iso(e.occurred_at), 'reasonCode', e.reason_code)
                 from public.treatment_programme_events e where e.enrolment_id = p_programme.enrolment_id and e.kind = 'pause'),
    'resumed', (select jsonb_build_object('resumptionRuleId', e.rule_id, 'resumptionRuleVersion', e.rule_version, 'resumedAt', strandcue_private.programme_iso(e.occurred_at))
                 from public.treatment_programme_events e where e.enrolment_id = p_programme.enrolment_id and e.kind = 'resume'),
    'maintenanceTransition', (select jsonb_build_object('ruleId', e.rule_id, 'ruleVersion', e.rule_version, 'transitionedAt', strandcue_private.programme_iso(e.occurred_at))
                 from public.treatment_programme_events e where e.enrolment_id = p_programme.enrolment_id and e.kind = 'maintenance'),
    'completed', (select jsonb_build_object('snapshot', e.snapshot) from public.treatment_programme_events e where e.enrolment_id = p_programme.enrolment_id and e.kind = 'complete'),
    'createdAt', strandcue_private.programme_iso_us(p_programme.created_at), 'updatedAt', strandcue_private.programme_iso_us(p_programme.updated_at))
$$;

-- Programme state and due status, derived now from the stored facts, the owner's canonical events and the
-- exact reviewed rule publication (domain evaluateProgramme). Nothing here is read from the client.
create or replace function strandcue_private.programme_evaluate(p_programme public.treatment_programmes, p_events jsonb, p_blocked text, p_asof timestamptz)
returns jsonb language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  v_rec jsonb := strandcue_private.programme_record(p_programme);
  v_pub strandcue_private.programme_rule_publications%rowtype;
  v_rule jsonb;
  v_unit text;
  v_range jsonb;
  v_policy jsonb;
  v_asof text := strandcue_private.programme_iso(p_asof);
  v_missing jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_ruleid text;
  v_ruleversion text;
  v_snapshot jsonb;
  v_resume_rule jsonb;
  v_paused_at timestamptz;
  v_resumed_at timestamptz;
  v_events jsonb := p_events;
  v_apps jsonb;
  v_known jsonb;
  v_unknown_n integer;
  v_mismatch_n integer;
  v_app jsonb;
  v_selected text := p_programme.selected_application_event_id;
  v_order text;
  v_wash jsonb;
  v_state text;
  v_due text;
  v_count integer;
  v_threshold integer;
  v_transition jsonb;
  v_transition_at timestamptz;
  v_transition_count jsonb;
  v_code text;
  v_reason_list jsonb;
  v_verified boolean;
  v_app_ref jsonb;
begin
  select * into v_pub from strandcue_private.programme_rule_publications p
   where p.artifact_id = p_programme.artifact_id and p.artifact_version = p_programme.artifact_version;
  if not found then
    return strandcue_private.programme_build('not_started', 'needs_input', null, null, null,
      jsonb_build_array(strandcue_private.programme_missing('rule-publication-mismatch', null, 'The enrolment does not match the exact reviewed rule publication.')),
      '[]'::jsonb, null, v_asof, '[]'::jsonb, false, p_programme.rule_id, p_programme.rule_version);
  end if;
  v_rule := v_pub.rule;
  v_unit := v_rule ->> 'unit';
  v_range := v_rule -> 'range';
  v_policy := v_rule -> 'transitionPolicy';
  v_ruleid := v_rule ->> 'ruleId';
  v_ruleversion := v_rule ->> 'ruleVersion';
  v_resume_rule := v_rule -> 'resumptionRule';
  v_verified := strandcue_private.programme_product_verified(p_programme.product_id, p_programme.product_version_id);

  -- Verification gates (fail closed), exactly the domain's list.
  if not v_verified then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('product-unverified', null, 'The programme product is not verified, so the programme cannot be evaluated.'));
  else
    v_reasons := v_reasons || jsonb_build_array('product-verified');
  end if;
  v_reasons := v_reasons || jsonb_build_array('product-version-recorded');
  if p_programme.product_id::text <> v_rule ->> 'productId' then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('product-rule-mismatch', null, 'The programme product does not match the rule product.'));
  else
    v_reasons := v_reasons || jsonb_build_array('product-matches-rule');
  end if;
  if p_programme.product_version_id::text <> v_rule ->> 'productVersionId' then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('product-version-mismatch', null, 'The programme product version does not match the rule product version.'));
  else
    v_reasons := v_reasons || jsonb_build_array('product-version-matches-rule');
  end if;
  if v_pub.state = 'draft' then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('rule-draft', null, 'The treatment rule is draft and has not been reviewed for publication.'));
  elsif v_pub.state = 'withdrawn' then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('rule-withdrawn', null, 'The treatment rule is withdrawn and must not be used.'));
  else
    v_reasons := v_reasons || jsonb_build_array('rule-published');
  end if;
  if p_programme.rule_id <> v_ruleid then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('rule-id-mismatch', null, 'The enrolment rule does not match the treatment rule.'));
  else
    v_reasons := v_reasons || jsonb_build_array('rule-id-matches');
  end if;
  if p_programme.rule_version <> v_ruleversion then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('rule-version-mismatch', null, 'The enrolment rule version does not match the treatment rule version.'));
  else
    v_reasons := v_reasons || jsonb_build_array('rule-version-matches');
  end if;
  if v_pub.state = 'published' and p_programme.content_digest is distinct from v_pub.content_digest then
    v_missing := v_missing || jsonb_build_array(strandcue_private.programme_missing('rule-publication-mismatch', null, 'The enrolment does not match the exact reviewed rule publication.'));
  elsif v_pub.state = 'published' then
    v_reasons := v_reasons || jsonb_build_array('rule-publication-matches');
  end if;
  v_reasons := v_reasons || jsonb_build_array('transition-policy-present');
  if jsonb_array_length(v_missing) > 0 then
    return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range, v_missing, '[]'::jsonb, null, v_asof, v_reasons, false, v_ruleid, v_ruleversion);
  end if;

  -- Completed snapshot stability (TR-06): returned unchanged, never recomputed.
  if v_rec -> 'completed' <> 'null'::jsonb then
    v_snapshot := v_rec #> '{completed,snapshot}';
    if not (
      v_snapshot ->> 'enrolmentId' = p_programme.enrolment_id::text and v_snapshot ->> 'productId' = p_programme.product_id::text
      and v_snapshot ->> 'productVersionId' = p_programme.product_version_id::text and v_snapshot ->> 'ruleId' = v_ruleid
      and v_snapshot ->> 'ruleVersion' = v_ruleversion
      and v_snapshot #>> '{rulePublication,artifactId}' = v_pub.artifact_id and v_snapshot #>> '{rulePublication,artifactVersion}' = v_pub.artifact_version
      and v_snapshot #>> '{rulePublication,contentDigest}' = v_pub.content_digest
      and v_snapshot ->> 'unit' = v_unit and (v_snapshot -> 'range') is not distinct from v_range
      and (v_snapshot #>> '{application,kind}') = 'application'
      and exists (select 1 from jsonb_array_elements(v_snapshot -> 'eventsUsed') e where e.value = v_snapshot -> 'application')
      and strandcue_private.programme_start_order(jsonb_build_object('precision', 'exact', 'value', v_snapshot ->> 'completedAt'), p_programme.start_precision, p_programme.start_value) = 'allowed') then
      return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('snapshot-mismatch', null, 'The completed snapshot does not match the enrolment or rule identity.')),
        '[]'::jsonb, null, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
    end if;
    return strandcue_private.programme_build('completed', v_snapshot ->> 'dueStatus', v_snapshot ->> 'unit', (v_snapshot ->> 'count')::integer, v_snapshot -> 'range',
      '[]'::jsonb, v_snapshot -> 'eventsUsed', v_snapshot -> 'application', v_snapshot ->> 'asOf', jsonb_build_array('completed-from-snapshot'), true, v_ruleid, v_ruleversion);
  end if;

  -- Derivation that cannot be proven safe blocks every live (non-completed) evaluation.
  if p_blocked is not null then
    return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range,
      jsonb_build_array(strandcue_private.programme_missing('invalid-or-unsupported-event-facts', null,
        'The care events could not be derived safely, so the programme cannot be evaluated.')),
      '[]'::jsonb, null, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
  end if;

  -- Pause / interruption (TR-07).
  if v_rec -> 'paused' <> 'null'::jsonb then
    if v_rec -> 'resumed' = 'null'::jsonb then
      return strandcue_private.programme_build('paused', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('interruption-without-resumption', null, 'The programme is paused or interrupted without an approved resumption record.')),
        '[]'::jsonb, null, v_asof, jsonb_build_array('paused-explicitly'), false, v_ruleid, v_ruleversion);
    end if;
    if v_resume_rule is null then
      return strandcue_private.programme_build('paused', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('interruption-without-resumption', null, 'The programme is paused but the rule defines no approved resumption rule.')),
        '[]'::jsonb, null, v_asof, jsonb_build_array('paused-explicitly'), false, v_ruleid, v_ruleversion);
    end if;
    if v_rec #>> '{resumed,resumptionRuleId}' <> v_resume_rule ->> 'ruleId' or v_rec #>> '{resumed,resumptionRuleVersion}' <> v_resume_rule ->> 'ruleVersion' then
      return strandcue_private.programme_build('paused', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('resumption-version-mismatch', null, 'The recorded resumption rule does not match the treatment rule.')),
        '[]'::jsonb, null, v_asof, jsonb_build_array('paused-explicitly'), false, v_ruleid, v_ruleversion);
    end if;
    v_paused_at := strandcue_private.programme_parse_instant(v_rec #>> '{paused,pausedAt}');
    v_resumed_at := strandcue_private.programme_parse_instant(v_rec #>> '{resumed,resumedAt}');
    if v_paused_at is null or v_resumed_at is null or v_resumed_at <= v_paused_at or v_resumed_at > p_asof then
      return strandcue_private.programme_build('paused', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('resumption-date-invalid', null, 'The recorded resumption must be after the pause and no later than the evaluation time.')),
        '[]'::jsonb, null, v_asof, jsonb_build_array('paused-explicitly'), false, v_ruleid, v_ruleversion);
    end if;
    -- resume_from_pause: facts inside the pause interval do not count.
    select coalesce(jsonb_agg(e.value), '[]'::jsonb) into v_events from jsonb_array_elements(p_events) e
     where strandcue_private.programme_exact_instant(e.value -> 'date') is null
        or strandcue_private.programme_exact_instant(e.value -> 'date') <= v_paused_at
        or strandcue_private.programme_exact_instant(e.value -> 'date') > v_resumed_at;
  end if;

  -- Treatment application: only a confirmed execution application starts a programme.
  select coalesce(jsonb_agg(e.value), '[]'::jsonb) into v_apps from jsonb_array_elements(v_events) e
   where e.value ->> 'kind' = 'application' and e.value ->> 'lifecycle' = 'active' and e.value ->> 'provenance' = 'execution-confirmed';
  select count(*) into v_unknown_n from jsonb_array_elements(v_apps) e where e.value ->> 'productId' is null;
  select count(*) into v_mismatch_n from jsonb_array_elements(v_apps) e
   where e.value ->> 'productId' is not null and (e.value ->> 'productId' <> p_programme.product_id::text or e.value ->> 'productVersionId' <> p_programme.product_version_id::text);
  select coalesce(jsonb_agg(e.value), '[]'::jsonb) into v_known from jsonb_array_elements(v_apps) e
   where e.value ->> 'productId' = p_programme.product_id::text and e.value ->> 'productVersionId' = p_programme.product_version_id::text;
  if jsonb_array_length(v_known) = 0 then
    v_code := case when v_unknown_n > 0 then 'application-product-unknown' when v_mismatch_n > 0 then 'application-product-mismatch' else 'missing-treatment-application' end;
    return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range,
      jsonb_build_array(strandcue_private.programme_missing(v_code, null,
        case v_code when 'application-product-unknown' then 'The confirmed application does not record an exact product identity.'
                    when 'application-product-mismatch' then 'The confirmed application does not match the programme product and version.'
                    else 'No confirmed treatment application was recorded to start the programme.' end)),
      '[]'::jsonb, null, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
  end if;
  if jsonb_array_length(v_known) > 1 or v_selected is not null then
    select e.value into v_app from jsonb_array_elements(v_known) e where v_selected is not null and e.value ->> 'eventId' = v_selected limit 1;
    if v_app is null then
      return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('multiple-treatment-applications', null,
          case when v_selected is null then 'More than one confirmed treatment application was recorded; select one to evaluate from.'
               else 'The selected treatment application was not found among the confirmed applications.' end)),
        '[]'::jsonb, null, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
    end if;
  else
    v_app := v_known -> 0;
  end if;
  v_app_ref := jsonb_build_object('eventId', v_app -> 'eventId', 'kind', v_app -> 'kind', 'date', v_app -> 'date');
  v_order := strandcue_private.programme_start_order(v_app -> 'date', p_programme.start_precision, p_programme.start_value);
  if v_order <> 'allowed' then
    return strandcue_private.programme_build('not_started', 'needs_input', v_unit, null, v_range,
      jsonb_build_array(strandcue_private.programme_missing(case when v_order = 'before' then 'application-before-enrolment' else 'application-start-date-unknown' end, v_app ->> 'eventId',
        case when v_order = 'before' then 'The confirmed application is earlier than the programme enrolment.' else 'The programme start date is not precise enough to place the confirmed application.' end)),
      '[]'::jsonb, v_app_ref, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
  end if;

  -- Named-unit wash counting.
  v_wash := strandcue_private.programme_count(v_events, v_unit, (v_rule ->> 'applicationWashCounts')::boolean, v_app ->> 'eventId', v_range, p_asof);

  v_transition := v_rec -> 'maintenanceTransition';
  if v_transition <> 'null'::jsonb then
    v_threshold := (v_policy ->> 'maintenanceThreshold')::integer;
    v_transition_at := strandcue_private.programme_parse_instant(v_transition ->> 'transitionedAt');
    v_transition_count := case when v_transition_at is null then null
      else strandcue_private.programme_count(v_events, v_unit, (v_rule ->> 'applicationWashCounts')::boolean, v_app ->> 'eventId', v_range, v_transition_at) end;
    if not (v_threshold is not null and v_transition ->> 'ruleId' = v_ruleid and v_transition ->> 'ruleVersion' = v_ruleversion
            and v_transition_at is not null and v_transition_at <= p_asof
            and v_transition_count ->> 'status' = 'counted' and (v_transition_count ->> 'count')::integer >= v_threshold) then
      return strandcue_private.programme_build('reassessment', 'needs_input', v_unit, null, v_range,
        jsonb_build_array(strandcue_private.programme_missing('maintenance-transition-mismatch', null, 'Maintenance requires an explicit transition bound to this reviewed rule and its threshold.')),
        '[]'::jsonb, v_app_ref, v_asof, '[]'::jsonb, false, v_ruleid, v_ruleversion);
    end if;
  end if;

  -- State.
  v_reason_list := jsonb_build_array('application-confirmed');
  if v_transition <> 'null'::jsonb then
    v_state := 'maintenance';
    v_reason_list := v_reason_list || jsonb_build_array('enrolment-state-maintenance');
  elsif v_wash ->> 'status' = 'needs_input' then
    v_state := 'initial';
    v_reason_list := v_reason_list || jsonb_build_array('count-needs-input');
  else
    v_count := (v_wash ->> 'count')::integer;
    if v_count > (v_policy ->> 'initialPhaseLimit')::integer then
      v_state := 'reassessment';
      v_reason_list := v_reason_list || jsonb_build_array(case when v_count >= (v_policy ->> 'reassessmentThreshold')::integer then 'count-at-reassessment-threshold' else 'count-after-initial-phase' end);
    else
      v_state := 'initial';
      v_reason_list := v_reason_list || jsonb_build_array('count-within-initial-limit');
    end if;
  end if;

  -- Due status.
  if v_wash ->> 'status' = 'needs_input' then
    v_due := 'needs_input';
  else
    v_count := (v_wash ->> 'count')::integer;
    if v_range is null then
      v_due := case v_state when 'initial' then 'not_due' when 'reassessment' then 'eligible' else 'not_due' end;
    elsif v_count < (v_range ->> 'minimum')::integer then
      v_due := 'not_due'; v_reason_list := v_reason_list || jsonb_build_array('count-below-range-minimum');
    elsif v_count < (v_range ->> 'maximum')::integer then
      v_due := 'eligible'; v_reason_list := v_reason_list || jsonb_build_array('count-within-range');
    else
      v_due := 'due'; v_reason_list := v_reason_list || jsonb_build_array('count-at-or-above-range-maximum');
    end if;
  end if;

  return strandcue_private.programme_build(v_state, v_due, v_unit,
    case when v_wash ->> 'status' = 'counted' then (v_wash ->> 'count')::integer end, v_range,
    v_wash -> 'missing', v_wash -> 'eventsUsed', v_app_ref, v_asof, v_reason_list, false, v_ruleid, v_ruleversion);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Owner gate and cores
-- ---------------------------------------------------------------------------------------------

create or replace function strandcue_private.programme_require_owner()
returns uuid language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare uid uuid := strandcue_private.request_uid();
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  return uid;
end;
$$;
alter function strandcue_private.programme_require_owner() owner to strandcue_mutator;

-- A normalised start date, or null when it is invalid.
create or replace function strandcue_private.programme_start_normalise(p_start jsonb)
returns jsonb language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare
  v_precision text;
  v_value text;
  v_instant timestamptz;
  v_day date;
  v_today date := (now() at time zone 'Africa/Johannesburg')::date;
begin
  if not strandcue_private.programme_keys_within(p_start, array['precision','value'], array[]::text[]) then return null; end if;
  if jsonb_typeof(p_start -> 'precision') <> 'string' or jsonb_typeof(p_start -> 'value') <> 'string' then return null; end if;
  v_precision := p_start ->> 'precision';
  v_value := p_start ->> 'value';
  if v_precision = 'exact' then
    v_instant := strandcue_private.programme_parse_instant(v_value);
    if v_instant is null or v_instant > now() then return null; end if;
    return jsonb_build_object('precision', 'exact', 'value', strandcue_private.programme_iso(v_instant));
  elsif v_precision = 'day' then
    if v_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
    v_day := v_value::date;
    if to_char(v_day, 'YYYY-MM-DD') <> v_value or v_day > v_today then return null; end if;
    return jsonb_build_object('precision', 'day', 'value', v_value);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function strandcue_private.programme_enrol_core(
  p_operation_id uuid, p_product_id uuid, p_product_version_id uuid, p_rule_id text, p_rule_version text, p_start_date jsonb, p_selected_application_event_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := strandcue_private.programme_require_owner();
  v_op strandcue_private.treatment_programme_operations%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_start jsonb;
  v_pub strandcue_private.programme_rule_publications%rowtype;
  v_row public.treatment_programmes%rowtype;
  v_care jsonb;
  v_at timestamptz := now();
begin
  if p_operation_id is null or p_product_id is null or p_product_version_id is null or p_rule_id is null or p_rule_version is null or p_start_date is null then
    raise exception 'invalid-programme' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':programme-op:' || p_operation_id::text, 0));
  v_payload := jsonb_build_object('kind', 'enrol', 'productId', p_product_id, 'productVersionId', p_product_version_id, 'ruleId', p_rule_id,
    'ruleVersion', p_rule_version, 'startDate', p_start_date, 'selectedApplicationEventId', p_selected_application_event_id);
  select * into v_op from strandcue_private.treatment_programme_operations o where o.user_id = uid and o.operation_id = p_operation_id;
  if found then
    if v_op.payload is distinct from v_payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return v_op.result;
  end if;
  if char_length(p_rule_id) not between 1 and 200 or char_length(p_rule_version) not between 1 and 200
     or p_rule_id <> btrim(p_rule_id) or p_rule_version <> btrim(p_rule_version)
     or (p_selected_application_event_id is not null and char_length(p_selected_application_event_id) not between 1 and 400) then
    raise exception 'invalid-programme' using errcode = '22023';
  end if;
  v_start := strandcue_private.programme_start_normalise(p_start_date);
  if v_start is null then raise exception 'invalid-programme' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':programme-owner', 0));
  v_at := clock_timestamp();
  if (select count(*) from strandcue_private.treatment_programme_operations o where o.user_id = uid) >= 2000
     or (select count(*) from public.treatment_programmes p where p.user_id = uid) >= 20
     or (select count(*) from public.treatment_programmes p where p.user_id = uid and p.status = 'active') >= 5 then
    raise exception 'quota-exceeded' using errcode = '22023';
  end if;
  if not exists (select 1 from public.product_versions v where v.id = p_product_version_id and v.product_id = p_product_id) then
    raise exception 'product-mismatch' using errcode = '22023';
  end if;
  select * into v_pub from strandcue_private.programme_rule_publications r
   where r.state = 'published' and r.rule ->> 'ruleId' = p_rule_id and r.rule ->> 'ruleVersion' = p_rule_version;
  if not found then
    if exists (select 1 from strandcue_private.programme_rule_publications r where r.state = 'withdrawn' and r.rule ->> 'ruleId' = p_rule_id and r.rule ->> 'ruleVersion' = p_rule_version) then
      raise exception 'rule-withdrawn' using errcode = '22023';
    end if;
    raise exception 'rule-content-pending' using errcode = '22023';
  end if;
  if v_pub.rule ->> 'productId' <> p_product_id::text or v_pub.rule ->> 'productVersionId' <> p_product_version_id::text then
    raise exception 'product-mismatch' using errcode = '22023';
  end if;
  if exists (select 1 from public.treatment_programmes p where p.user_id = uid and p.product_version_id = p_product_version_id
              and p.rule_id = p_rule_id and p.rule_version = p_rule_version and p.status = 'active') then
    raise exception 'duplicate-active' using errcode = '23505';
  end if;
  v_care := strandcue_private.programme_care_events(uid);
  if p_selected_application_event_id is not null then
    if not exists (select 1 from jsonb_array_elements(v_care -> 'events') e
                    where e.value ->> 'eventId' = p_selected_application_event_id and e.value ->> 'kind' = 'application'
                      and e.value ->> 'provenance' = 'execution-confirmed'
                      and e.value ->> 'productId' = p_product_id::text and e.value ->> 'productVersionId' = p_product_version_id::text) then
      raise exception 'application-missing' using errcode = '22023';
    end if;
  end if;
  begin
    insert into public.treatment_programmes(user_id, product_id, product_version_id, rule_id, rule_version, artifact_id, artifact_version, content_digest,
                                            start_precision, start_value, selected_application_event_id, status, revision, created_at, updated_at)
      values (uid, p_product_id, p_product_version_id, p_rule_id, p_rule_version, v_pub.artifact_id, v_pub.artifact_version, v_pub.content_digest,
              v_start ->> 'precision', v_start ->> 'value', p_selected_application_event_id, 'active', 1, v_at, v_at)
      returning * into v_row;
  exception when unique_violation then
    raise exception 'duplicate-active' using errcode = '23505';
  end;
  insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, recorded_at) values (uid, v_row.enrolment_id, 1, 'enrol', v_at);
  v_result := strandcue_private.programme_record(v_row);
  insert into strandcue_private.treatment_programme_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, v_payload, v_result);
  return v_result;
exception when others then
  -- A refusal keeps its stable code; infrastructure conditions (timeout, serialisation, lock) pass through so a
  -- client can retry; anything else is reported with one stable, non-sensitive code and no SQL text.
  if sqlstate in ('57014', '40001', '40P01', '55P03') or sqlerrm ~ '^[a-z]+(-[a-z]+)*$' then
    raise;
  end if;
  raise exception 'programme-unavailable' using errcode = '58000';
end;
$$;
alter function strandcue_private.programme_enrol_core(uuid, uuid, uuid, text, text, jsonb, text) owner to strandcue_mutator;

create or replace function strandcue_private.programme_change_core(p_operation_id uuid, p_enrolment_id uuid, p_expected_revision integer, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := strandcue_private.programme_require_owner();
  v_op strandcue_private.treatment_programme_operations%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_kind text;
  v_row public.treatment_programmes%rowtype;
  v_pub strandcue_private.programme_rule_publications%rowtype;
  v_rule jsonb;
  v_care jsonb;
  v_at timestamptz := now();
  v_when timestamptz;
  v_start_at timestamptz;
  v_pause public.treatment_programme_events%rowtype;
  v_resume_rule jsonb;
  v_eval jsonb;
  v_app jsonb;
  v_refs jsonb;
  v_snapshot jsonb;
  v_next integer;
  v_code text;
  v_resume_at timestamptz;
  v_cap integer;
begin
  if p_operation_id is null or p_enrolment_id is null or p_expected_revision is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':programme-op:' || p_operation_id::text, 0));
  v_payload := jsonb_build_object('kind', 'change', 'enrolmentId', p_enrolment_id, 'expectedRevision', p_expected_revision, 'command', p_command);
  select * into v_op from strandcue_private.treatment_programme_operations o where o.user_id = uid and o.operation_id = p_operation_id;
  if found then
    if v_op.payload is distinct from v_payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return v_op.result;
  end if;

  -- Strict command shape: only owner facts; any derived or authoritative field is refused.
  if p_command is null or jsonb_typeof(p_command) <> 'object' or jsonb_typeof(p_command -> 'kind') is distinct from 'string' then
    raise exception 'invalid-command' using errcode = '22023';
  end if;
  v_kind := p_command ->> 'kind';
  if v_kind = 'select-application' then
    if not strandcue_private.programme_keys_within(p_command, array['kind','eventId'], array[]::text[])
       or not strandcue_private.programme_is_text(p_command -> 'eventId', 400) then raise exception 'invalid-command' using errcode = '22023'; end if;
  elsif v_kind = 'pause' then
    if not strandcue_private.programme_keys_within(p_command, array['kind','pausedAt','reasonCode'], array[]::text[])
       or jsonb_typeof(p_command -> 'pausedAt') <> 'string' or jsonb_typeof(p_command -> 'reasonCode') <> 'string'
       or (p_command ->> 'reasonCode') !~ '^[a-z][a-z0-9_-]{0,63}$' or strandcue_private.programme_parse_instant(p_command ->> 'pausedAt') is null then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
  elsif v_kind = 'resume' then
    if not strandcue_private.programme_keys_within(p_command, array['kind','resumedAt','resumptionRuleId','resumptionRuleVersion'], array[]::text[])
       or jsonb_typeof(p_command -> 'resumedAt') <> 'string' or strandcue_private.programme_parse_instant(p_command ->> 'resumedAt') is null
       or not strandcue_private.programme_is_text(p_command -> 'resumptionRuleId', 200) or not strandcue_private.programme_is_text(p_command -> 'resumptionRuleVersion', 200) then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
  elsif v_kind = 'maintenance' then
    if not strandcue_private.programme_keys_within(p_command, array['kind','transitionedAt','ruleId','ruleVersion'], array[]::text[])
       or jsonb_typeof(p_command -> 'transitionedAt') <> 'string' or strandcue_private.programme_parse_instant(p_command ->> 'transitionedAt') is null
       or not strandcue_private.programme_is_text(p_command -> 'ruleId', 200) or not strandcue_private.programme_is_text(p_command -> 'ruleVersion', 200) then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
  elsif v_kind = 'abandon' then
    if not strandcue_private.programme_keys_within(p_command, array['kind'], array[]::text[]) then raise exception 'invalid-command' using errcode = '22023'; end if;
  elsif v_kind = 'complete' then
    if not strandcue_private.programme_keys_within(p_command, array['kind','completedAt'], array[]::text[])
       or jsonb_typeof(p_command -> 'completedAt') <> 'string' or strandcue_private.programme_parse_instant(p_command ->> 'completedAt') is null then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
  else
    raise exception 'invalid-command' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':programme-owner', 0));
  select * into v_row from public.treatment_programmes p where p.user_id = uid and p.enrolment_id = p_enrolment_id for update;
  if not found then raise exception 'programme-not-found' using errcode = '42501'; end if;
  if v_row.revision <> p_expected_revision then raise exception 'revision-conflict' using errcode = '40001'; end if;
  if v_row.status = 'completed' then raise exception 'already-completed' using errcode = '22023'; end if;
  if v_row.status = 'abandoned' then raise exception 'already-abandoned' using errcode = '22023'; end if;
  v_at := clock_timestamp();
  -- The last revision is kept for completing or closing a programme, so a long history can never lock it open.
  v_cap := case when v_kind in ('complete', 'abandon') then 50 else 49 end;
  if v_row.revision >= v_cap
     or (select count(*) from strandcue_private.treatment_programme_operations o where o.user_id = uid) >= 2000 then
    raise exception 'quota-exceeded' using errcode = '22023';
  end if;

  -- Closing a programme needs no rule: it is the way out of a programme the rule can no longer serve.
  if v_kind <> 'abandon' then
    select * into v_pub from strandcue_private.programme_rule_publications r where r.artifact_id = v_row.artifact_id and r.artifact_version = v_row.artifact_version;
    if not found or v_pub.content_digest is distinct from v_row.content_digest then raise exception 'rule-publication-mismatch' using errcode = '22023'; end if;
    if v_pub.state = 'withdrawn' then raise exception 'rule-withdrawn' using errcode = '22023'; end if;
    if v_pub.state <> 'published' then raise exception 'rule-content-pending' using errcode = '22023'; end if;
    v_rule := v_pub.rule;
  end if;
  v_next := v_row.revision + 1;
  v_start_at := strandcue_private.programme_instant(jsonb_build_object('precision', v_row.start_precision, 'value', v_row.start_value));
  select * into v_pause from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'pause';

  if v_kind = 'abandon' then
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, recorded_at) values (uid, v_row.enrolment_id, v_next, 'abandon', v_at);
    update public.treatment_programmes set revision = v_next, status = 'abandoned', updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;

  elsif v_kind = 'select-application' then
    v_care := strandcue_private.programme_care_events(uid);
    if not exists (select 1 from jsonb_array_elements(v_care -> 'events') e
                    where e.value ->> 'eventId' = p_command ->> 'eventId' and e.value ->> 'kind' = 'application' and e.value ->> 'provenance' = 'execution-confirmed'
                      and e.value ->> 'productId' = v_row.product_id::text and e.value ->> 'productVersionId' = v_row.product_version_id::text) then
      raise exception 'application-missing' using errcode = '22023';
    end if;
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, selected_application_event_id, recorded_at)
      values (uid, v_row.enrolment_id, v_next, 'change', p_command ->> 'eventId', v_at);
    update public.treatment_programmes set revision = v_next, selected_application_event_id = p_command ->> 'eventId', updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;

  elsif v_kind = 'pause' then
    if v_pause.id is not null or exists (select 1 from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'maintenance') then
      raise exception 'invalid-lifecycle' using errcode = '22023';
    end if;
    if (v_rule -> 'resumptionRule') is null then raise exception 'pause-resumption-required' using errcode = '22023'; end if;
    v_when := date_trunc('milliseconds', strandcue_private.programme_parse_instant(p_command ->> 'pausedAt'));
    if v_when > v_at or (v_start_at is not null and v_when < v_start_at) then raise exception 'invalid-chronology' using errcode = '22023'; end if;
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, occurred_at, reason_code, recorded_at)
      values (uid, v_row.enrolment_id, v_next, 'pause', v_when, p_command ->> 'reasonCode', v_at);
    update public.treatment_programmes set revision = v_next, updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;

  elsif v_kind = 'resume' then
    if v_pause.id is null or exists (select 1 from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'resume') then
      raise exception 'invalid-lifecycle' using errcode = '22023';
    end if;
    v_resume_rule := v_rule -> 'resumptionRule';
    if v_resume_rule is null then raise exception 'pause-resumption-required' using errcode = '22023'; end if;
    if p_command ->> 'resumptionRuleId' <> v_resume_rule ->> 'ruleId' or p_command ->> 'resumptionRuleVersion' <> v_resume_rule ->> 'ruleVersion' then
      raise exception 'resumption-rule-mismatch' using errcode = '22023';
    end if;
    v_when := date_trunc('milliseconds', strandcue_private.programme_parse_instant(p_command ->> 'resumedAt'));
    if v_when <= v_pause.occurred_at or v_when > v_at then raise exception 'invalid-chronology' using errcode = '22023'; end if;
    -- A pause window that swallows the application the programme runs from would leave it unable to evaluate.
    -- Refuse only when the selected application is inside the window, or no application would remain outside it.
    v_care := strandcue_private.programme_care_events(uid);
    if exists (select 1 from jsonb_array_elements(v_care -> 'events') e
                where e.value ->> 'kind' = 'application' and e.value ->> 'provenance' = 'execution-confirmed'
                  and e.value ->> 'productId' = v_row.product_id::text and e.value ->> 'productVersionId' = v_row.product_version_id::text
                  and strandcue_private.programme_instant(e.value -> 'date') > v_pause.occurred_at
                  and strandcue_private.programme_instant(e.value -> 'date') <= v_when
                  and (e.value ->> 'eventId' = v_row.selected_application_event_id
                       or not exists (select 1 from jsonb_array_elements(v_care -> 'events') o
                                       where o.value ->> 'kind' = 'application' and o.value ->> 'provenance' = 'execution-confirmed'
                                         and o.value ->> 'productId' = v_row.product_id::text and o.value ->> 'productVersionId' = v_row.product_version_id::text
                                         and (strandcue_private.programme_instant(o.value -> 'date') <= v_pause.occurred_at
                                              or strandcue_private.programme_instant(o.value -> 'date') > v_when)))) then
      raise exception 'invalid-chronology' using errcode = '22023';
    end if;
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, occurred_at, rule_id, rule_version, recorded_at)
      values (uid, v_row.enrolment_id, v_next, 'resume', v_when, p_command ->> 'resumptionRuleId', p_command ->> 'resumptionRuleVersion', v_at);
    update public.treatment_programmes set revision = v_next, updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;

  elsif v_kind = 'maintenance' then
    if exists (select 1 from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'maintenance')
       or (v_pause.id is not null and not exists (select 1 from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'resume')) then
      raise exception 'invalid-lifecycle' using errcode = '22023';
    end if;
    v_when := date_trunc('milliseconds', strandcue_private.programme_parse_instant(p_command ->> 'transitionedAt'));
    if v_when > v_at then raise exception 'invalid-chronology' using errcode = '22023'; end if;
    select e.occurred_at into v_resume_at from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id and e.kind = 'resume';
    -- Facts inside the pause window do not count, so a transition cannot be dated inside it.
    if v_pause.id is not null and v_when > v_pause.occurred_at and v_when <= v_resume_at then raise exception 'invalid-chronology' using errcode = '22023'; end if;
    if (v_rule -> 'transitionPolicy' -> 'maintenanceThreshold') is null
       or p_command ->> 'ruleId' <> v_rule ->> 'ruleId' or p_command ->> 'ruleVersion' <> v_rule ->> 'ruleVersion' then
      raise exception 'maintenance-not-proven' using errcode = '22023';
    end if;
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, occurred_at, rule_id, rule_version, recorded_at)
      values (uid, v_row.enrolment_id, v_next, 'maintenance', v_when, p_command ->> 'ruleId', p_command ->> 'ruleVersion', v_at);
    update public.treatment_programmes set revision = v_next, updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;
    -- The qualifying count is derived at the transition instant from the owner's canonical events, now.
    v_care := strandcue_private.programme_care_events(uid);
    v_eval := strandcue_private.programme_evaluate(v_row, v_care -> 'events', v_care ->> 'blocked', v_at);
    if v_eval ->> 'state' <> 'maintenance' then
      v_code := strandcue_private.programme_error_for(v_eval -> 'missing');
      raise exception '%', case when v_code = 'count-not-proven' then 'maintenance-not-proven' else v_code end using errcode = '22023';
    end if;

  elsif v_kind = 'complete' then
    v_when := date_trunc('milliseconds', strandcue_private.programme_parse_instant(p_command ->> 'completedAt'));
    v_care := strandcue_private.programme_care_events(uid);
    -- The snapshot is the programme as it stood at the stated completion time: later events are not its evidence.
    v_eval := strandcue_private.programme_evaluate(v_row, v_care -> 'events', v_care ->> 'blocked', least(v_when, v_at));
    if v_eval ->> 'dueStatus' = 'needs_input' or v_eval ->> 'state' not in ('initial', 'reassessment', 'maintenance') or (v_eval -> 'count') is null or (v_eval -> 'application') = 'null'::jsonb then
      raise exception '%', strandcue_private.programme_error_for(v_eval -> 'missing') using errcode = '22023';
    end if;
    v_app := v_eval -> 'application';
    if v_when > v_at or v_when < strandcue_private.programme_parse_instant(v_app #>> '{date,value}') then
      raise exception 'invalid-chronology' using errcode = '22023';
    end if;
    -- Evidence = the washes used plus the one application, in the contract's canonical order.
    select coalesce(jsonb_agg(r.value order by (r.value #>> '{date,precision}') collate "C", coalesce(r.value #>> '{date,value}', '') collate "C",
                                              (r.value ->> 'kind') collate "C", (r.value ->> 'eventId') collate "C"), '[]'::jsonb)
      into v_refs from jsonb_array_elements((v_eval -> 'eventsUsed') || jsonb_build_array(v_app)) r;
    v_snapshot := jsonb_build_object('enrolmentId', v_row.enrolment_id, 'productId', v_row.product_id, 'productVersionId', v_row.product_version_id,
        'ruleId', v_row.rule_id, 'ruleVersion', v_row.rule_version,
        'rulePublication', jsonb_build_object('artifactId', v_row.artifact_id, 'artifactVersion', v_row.artifact_version, 'contentDigest', v_row.content_digest),
        'state', 'completed', 'dueStatus', v_eval ->> 'dueStatus', 'unit', v_eval ->> 'unit', 'count', (v_eval ->> 'count')::integer,
        'eventsUsed', v_refs, 'application', v_app, 'asOf', v_eval ->> 'asOf', 'completedAt', strandcue_private.programme_iso(v_when))
      || case when (v_eval -> 'range') is null then '{}'::jsonb else jsonb_build_object('range', v_eval -> 'range') end;
    if not strandcue_private.programme_snapshot_valid(v_snapshot) then raise exception 'snapshot-conflict' using errcode = '22023'; end if;
    insert into public.treatment_programme_events(user_id, enrolment_id, sequence, kind, occurred_at, snapshot, recorded_at)
      values (uid, v_row.enrolment_id, v_next, 'complete', v_when, v_snapshot, v_at);
    update public.treatment_programmes set revision = v_next, status = 'completed', updated_at = v_at where enrolment_id = v_row.enrolment_id returning * into v_row;
    v_eval := strandcue_private.programme_evaluate(v_row, v_care -> 'events', v_care ->> 'blocked', v_at);
    if v_eval ->> 'fromCompletedSnapshot' <> 'true' then
      raise exception 'snapshot-conflict' using errcode = '22023';
    end if;
  end if;

  v_result := strandcue_private.programme_record(v_row);
  insert into strandcue_private.treatment_programme_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, v_payload, v_result);
  return v_result;
exception when others then
  -- A refusal keeps its stable code; infrastructure conditions (timeout, serialisation, lock) pass through so a
  -- client can retry; anything else is reported with one stable, non-sensitive code and no SQL text.
  if sqlstate in ('57014', '40001', '40P01', '55P03') or sqlerrm ~ '^[a-z]+(-[a-z]+)*$' then
    raise;
  end if;
  raise exception 'programme-unavailable' using errcode = '58000';
end;
$$;
alter function strandcue_private.programme_change_core(uuid, uuid, integer, jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.programme_list_core(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := strandcue_private.programme_require_owner();
  v_created timestamptz;
  v_id uuid;
  v_care jsonb;
  v_items jsonb := '[]'::jsonb;
  v_n integer := 0;
  v_row public.treatment_programmes%rowtype;
  v_last_created timestamptz;
  v_last_id uuid;
  v_more boolean := false;
  v_at timestamptz := now();
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then raise exception 'invalid-limit' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    if not strandcue_private.programme_keys_within(p_cursor, array['createdAt','enrolmentId'], array[]::text[]) then raise exception 'invalid-cursor' using errcode = '22023'; end if;
    begin
      v_created := strandcue_private.programme_parse_instant(p_cursor ->> 'createdAt');
      v_id := (p_cursor ->> 'enrolmentId')::uuid;
    exception when others then
      raise exception 'invalid-cursor' using errcode = '22023';
    end;
    if v_created is null then raise exception 'invalid-cursor' using errcode = '22023'; end if;
  end if;
  v_care := strandcue_private.programme_care_events(uid);
  for v_row in
    select p.* from public.treatment_programmes p
     where p.user_id = uid and (v_id is null or (p.created_at, p.enrolment_id) < (v_created, v_id))
     order by p.created_at desc, p.enrolment_id desc limit p_limit + 1
  loop
    v_n := v_n + 1;
    if v_n > p_limit then v_more := true; exit; end if;
    v_items := v_items || jsonb_build_array(strandcue_private.programme_record(v_row)
      || jsonb_build_object('evaluation', case when v_row.status = 'abandoned' then null
                                               else strandcue_private.programme_evaluate(v_row, v_care -> 'events', v_care ->> 'blocked', v_at) end));
    v_last_created := v_row.created_at;
    v_last_id := v_row.enrolment_id;
  end loop;
  if v_more then
    return jsonb_build_object('items', v_items, 'nextCursor', jsonb_build_object('createdAt', strandcue_private.programme_iso_us(v_last_created), 'enrolmentId', v_last_id));
  end if;
  return jsonb_build_object('items', v_items, 'nextCursor', null);
exception when others then
  -- A refusal keeps its stable code; infrastructure conditions (timeout, serialisation, lock) pass through so a
  -- client can retry; anything else is reported with one stable, non-sensitive code and no SQL text.
  if sqlstate in ('57014', '40001', '40P01', '55P03') or sqlerrm ~ '^[a-z]+(-[a-z]+)*$' then
    raise;
  end if;
  raise exception 'programme-unavailable' using errcode = '58000';
end;
$$;
alter function strandcue_private.programme_list_core(integer, jsonb) owner to strandcue_mutator;

create or replace function strandcue_private.programme_get_core(p_enrolment_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := strandcue_private.programme_require_owner();
  v_row public.treatment_programmes%rowtype;
  v_care jsonb;
  v_history jsonb;
begin
  if p_enrolment_id is null then raise exception 'programme-not-found' using errcode = '42501'; end if;
  select * into v_row from public.treatment_programmes p where p.user_id = uid and p.enrolment_id = p_enrolment_id;
  if not found then raise exception 'programme-not-found' using errcode = '42501'; end if;
  v_care := strandcue_private.programme_care_events(uid);
  select coalesce(jsonb_agg(jsonb_build_object('sequence', e.sequence, 'kind', e.kind, 'recordedAt', strandcue_private.programme_iso_us(e.recorded_at))
                            || case when e.occurred_at is null then '{}'::jsonb else jsonb_build_object('occurredAt', strandcue_private.programme_iso(e.occurred_at)) end
                            || case when e.reason_code is null then '{}'::jsonb else jsonb_build_object('reasonCode', e.reason_code) end
                            || case when e.rule_id is null then '{}'::jsonb else jsonb_build_object('ruleId', e.rule_id, 'ruleVersion', e.rule_version) end
                            || case when e.selected_application_event_id is null then '{}'::jsonb else jsonb_build_object('selectedApplicationEventId', e.selected_application_event_id) end
                            order by e.sequence), '[]'::jsonb)
    into v_history from public.treatment_programme_events e where e.enrolment_id = v_row.enrolment_id;
  return strandcue_private.programme_record(v_row)
    || jsonb_build_object('history', v_history, 'evaluation', case when v_row.status = 'abandoned' then null
                                                                    else strandcue_private.programme_evaluate(v_row, v_care -> 'events', v_care ->> 'blocked', now()) end);
exception when others then
  -- A refusal keeps its stable code; infrastructure conditions (timeout, serialisation, lock) pass through so a
  -- client can retry; anything else is reported with one stable, non-sensitive code and no SQL text.
  if sqlstate in ('57014', '40001', '40P01', '55P03') or sqlerrm ~ '^[a-z]+(-[a-z]+)*$' then
    raise;
  end if;
  raise exception 'programme-unavailable' using errcode = '58000';
end;
$$;
alter function strandcue_private.programme_get_core(uuid) owner to strandcue_mutator;

-- Invoker wrappers: the stable API. They own nothing privileged and bind the caller through the cores.
create or replace function public.enrol_programme(p_operation_id uuid, p_product_id uuid, p_product_version_id uuid, p_rule_id text, p_rule_version text, p_start_date jsonb, p_selected_application_event_id text default null)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.programme_enrol_core(p_operation_id, p_product_id, p_product_version_id, p_rule_id, p_rule_version, p_start_date, p_selected_application_event_id)
$$;
create or replace function public.change_programme(p_operation_id uuid, p_enrolment_id uuid, p_expected_revision integer, p_command jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.programme_change_core(p_operation_id, p_enrolment_id, p_expected_revision, p_command)
$$;
create or replace function public.list_programmes(p_limit integer, p_cursor jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.programme_list_core(p_limit, p_cursor)
$$;
create or replace function public.get_programme(p_enrolment_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.programme_get_core(p_enrolment_id)
$$;
-- PostgreSQL requires the new function owner to have CREATE on the target
-- schema at ownership transfer. Grant it only for this migration, then revoke.
grant create on schema public to migration_admin;
alter function public.enrol_programme(uuid, uuid, uuid, text, text, jsonb, text) owner to migration_admin;
alter function public.change_programme(uuid, uuid, integer, jsonb) owner to migration_admin;
alter function public.list_programmes(integer, jsonb) owner to migration_admin;
alter function public.get_programme(uuid) owner to migration_admin;
revoke create on schema public from migration_admin;

-- Evidence of an active programme: the confirmed, classified steps its counts are derived from. The 90-day and
-- 30-day execution purge would otherwise silently erase them and leave the programme unable to evaluate. They
-- are kept while the owner has an active programme; completing or closing the programme releases them (a
-- completed programme keeps its own immutable snapshot).
create or replace function strandcue_private.programme_execution_held(p_user uuid, p_execution uuid)
returns boolean language sql stable set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from strandcue_private.execution_step_care c
                  where c.user_id = p_user and c.execution_id = p_execution and c.kind in ('wash', 'application'))
     and exists (select 1 from public.treatment_programmes p where p.user_id = p_user and p.status = 'active')
$$;

create or replace function public.protocol_execution_retention_cleanup()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_executions integer := 0;
  v_events integer := 0;
  v_operations integer := 0;
begin
  delete from public.protocol_execution_events ev
  using public.protocol_executions e
  where ev.user_id = e.user_id
    and ev.execution_id = e.execution_id
    and e.legal_hold is not true
    and not strandcue_private.programme_execution_held(e.user_id, e.execution_id)
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_events = row_count;

  delete from strandcue_private.protocol_execution_operations o
  using public.protocol_executions e
  where o.user_id = e.user_id
    and o.request->>'executionId' = e.execution_id::text
    and e.legal_hold is not true
    and not strandcue_private.programme_execution_held(e.user_id, e.execution_id)
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_operations = row_count;

  delete from public.protocol_executions e
  where e.legal_hold is not true
    and not strandcue_private.programme_execution_held(e.user_id, e.execution_id)
    and ((e.status = 'completed'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '90 days')
      or (e.status = 'abandoned'
        and (e.execution->>'finishedAt')::timestamptz < now() - interval '30 days'));
  get diagnostics v_executions = row_count;

  return jsonb_build_object(
    'executions', v_executions, 'events', v_events, 'operations', v_operations);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Receipt retention: only private operation receipts expire (30 days); owner facts never do.
-- ---------------------------------------------------------------------------------------------

create or replace function public.treatment_programme_operation_retention_cleanup(p_as_of timestamptz)
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_purged integer := 0;
begin
  if p_as_of is null then
    raise exception 'invalid-as-of' using errcode = '22023';
  end if;
  delete from strandcue_private.treatment_programme_operations operation
   where operation.created_at < p_as_of - interval '30 days';
  get diagnostics v_purged = row_count;
  return v_purged;
end;
$$;
revoke all on function public.treatment_programme_operation_retention_cleanup(timestamptz) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.treatment_programme_operation_retention_cleanup(timestamptz) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Export version 6: add the owner's programmes and lifecycle history; never receipts or reviewer data.
-- Extends the already-reviewed export implementation without copying its owner-data query.
-- ---------------------------------------------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'strandcue_private' and p.proname = 'export_build_csv_before_programmes') then
    alter function strandcue_private.export_build_csv(uuid) rename to export_build_csv_before_programmes;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'strandcue_private' and p.proname = 'request_export_before_programmes') then
    alter function strandcue_private.request_export(uuid, text) rename to request_export_before_programmes;
  end if;
end $$;

create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  base jsonb;
  programmes_csv text;
  events_csv text;
  versions_csv text;
begin
  base := strandcue_private.export_build_csv_before_programmes(p_uid);
  select 'enrolment_id,user_id,product_id,product_version_id,rule_id,rule_version,artifact_id,artifact_version,content_digest,start_precision,start_value,selected_application_event_id,status,revision,created_at,updated_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(p.enrolment_id::text) || ',' || strandcue_private.csv_quote(p.user_id::text) || ',' || strandcue_private.csv_quote(p.product_id::text) || ',' || strandcue_private.csv_quote(p.product_version_id::text) || ',' ||
    strandcue_private.csv_quote(p.rule_id) || ',' || strandcue_private.csv_quote(p.rule_version) || ',' || strandcue_private.csv_quote(p.artifact_id) || ',' || strandcue_private.csv_quote(p.artifact_version) || ',' ||
    strandcue_private.csv_quote(p.content_digest) || ',' || strandcue_private.csv_quote(p.start_precision) || ',' || strandcue_private.csv_quote(p.start_value) || ',' || strandcue_private.csv_quote(p.selected_application_event_id) || ',' ||
    strandcue_private.csv_quote(p.status) || ',' || strandcue_private.csv_quote(p.revision::text) || ',' || strandcue_private.csv_quote(p.created_at::text) || ',' || strandcue_private.csv_quote(p.updated_at::text),
    chr(10) order by p.created_at, p.enrolment_id), '')
    into programmes_csv from public.treatment_programmes p where p.user_id = p_uid;
  select 'id,user_id,enrolment_id,sequence,kind,occurred_at,reason_code,rule_id,rule_version,selected_application_event_id,snapshot,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(e.id::text) || ',' || strandcue_private.csv_quote(e.user_id::text) || ',' || strandcue_private.csv_quote(e.enrolment_id::text) || ',' || strandcue_private.csv_quote(e.sequence::text) || ',' ||
    strandcue_private.csv_quote(e.kind) || ',' || strandcue_private.csv_quote(e.occurred_at::text) || ',' || strandcue_private.csv_quote(e.reason_code) || ',' || strandcue_private.csv_quote(e.rule_id) || ',' ||
    strandcue_private.csv_quote(e.rule_version) || ',' || strandcue_private.csv_quote(e.selected_application_event_id) || ',' || strandcue_private.csv_quote(e.snapshot::text) || ',' || strandcue_private.csv_quote(e.recorded_at::text),
    chr(10) order by e.recorded_at, e.enrolment_id, e.sequence), '')
    into events_csv from public.treatment_programme_events e where e.user_id = p_uid;
  versions_csv := regexp_replace(base -> 'files' ->> 'schema_versions.csv', '^export,[0-9]+$', 'export,6', 'm') || chr(10) || 'treatmentProgrammes,1' || chr(10) || 'treatmentProgrammeEvents,1';
  return jsonb_set(base, '{files}', (base -> 'files') || jsonb_build_object(
    'treatment_programmes.csv', programmes_csv, 'treatment_programme_events.csv', events_csv, 'schema_versions.csv', versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  uid uuid := strandcue_private.request_uid();
  result jsonb;
  job_id uuid;
  v_document jsonb;
  v_receipt jsonb;
  programme_count integer;
begin
  -- A replay returns the receipt stored with the first request, so an export that was already issued never
  -- changes when programmes change afterwards.
  if uid is not null and p_operation_id is not null and exists (
    select 1 from strandcue_private.export_operations o where o.user_id = uid and o.operation_id = p_operation_id) then
    return strandcue_private.request_export_before_programmes(p_operation_id, p_format);
  end if;
  result := strandcue_private.request_export_before_programmes(p_operation_id, p_format);
  job_id := (result ->> 'jobId')::uuid;
  select j.document into v_document from public.export_jobs j where j.id = job_id and j.owner = uid for update;
  select (select count(*) from public.treatment_programmes p where p.user_id = uid)
       + (select count(*) from public.treatment_programme_events e where e.user_id = uid) into programme_count;
  if p_format = 'json' then
    v_document := v_document || jsonb_build_object(
      'schemaVersions', (v_document -> 'schemaVersions') || jsonb_build_object('export', 6, 'treatmentProgrammes', 1, 'treatmentProgrammeEvents', 1),
      'treatmentProgrammes', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object(
        'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence), '[]'::jsonb) from public.treatment_programme_events e where e.user_id = uid and e.enrolment_id = p.enrolment_id))
        order by p.created_at, p.enrolment_id), '[]'::jsonb) from public.treatment_programmes p where p.user_id = uid));
  end if;
  v_receipt := result || jsonb_build_object('recordCount', (result ->> 'recordCount')::integer + programme_count);
  update public.export_jobs set document = v_document, record_count = (v_receipt ->> 'recordCount')::integer where id = job_id;
  update strandcue_private.export_operations set result = v_receipt where user_id = uid and operation_id = p_operation_id;
  return v_receipt;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

-- ---------------------------------------------------------------------------------------------
-- Grants, ownership and search paths
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_name text;
begin
  for v_name in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'strandcue_private' and p.proname like 'programme\_%' loop
    execute format('alter function %s set search_path = pg_catalog, pg_temp', v_name);
    execute format('revoke all on function %s from public, anon, authenticated', v_name);
    execute format('grant execute on function %s to strandcue_mutator', v_name);
  end loop;
end $$;

alter function strandcue_private.export_build_csv(uuid) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.export_build_csv_before_programmes(uuid) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.request_export(uuid, text) set search_path = pg_catalog, pg_temp;
alter function strandcue_private.request_export_before_programmes(uuid, text) set search_path = pg_catalog, pg_temp;
alter function public.treatment_programme_operation_retention_cleanup(timestamptz) set search_path = pg_catalog, pg_temp;

grant execute on function strandcue_private.programme_enrol_core(uuid, uuid, uuid, text, text, jsonb, text),
  strandcue_private.programme_change_core(uuid, uuid, integer, jsonb), strandcue_private.programme_list_core(integer, jsonb),
  strandcue_private.programme_get_core(uuid) to authenticated;
revoke all on function public.enrol_programme(uuid, uuid, uuid, text, text, jsonb, text), public.change_programme(uuid, uuid, integer, jsonb),
  public.list_programmes(integer, jsonb), public.get_programme(uuid) from public, anon, authenticated;
grant execute on function public.enrol_programme(uuid, uuid, uuid, text, text, jsonb, text), public.change_programme(uuid, uuid, integer, jsonb),
  public.list_programmes(integer, jsonb), public.get_programme(uuid) to authenticated;
revoke all on function strandcue_private.export_build_csv_before_programmes(uuid), strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_programmes(uuid, text), strandcue_private.request_export(uuid, text) from public, anon, authenticated;
grant execute on function strandcue_private.export_build_csv_before_programmes(uuid), strandcue_private.export_build_csv(uuid),
  strandcue_private.request_export_before_programmes(uuid, text), strandcue_private.request_export(uuid, text) to strandcue_mutator;
grant execute on function strandcue_private.request_export(uuid, text) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
do $$ begin
  if current_user <> 'migration_admin' then
    execute format('revoke set option for migration_admin from %I', current_user);
  end if;
end $$;

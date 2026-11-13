-- Trusted tools catalogue baseline — replaces archived 20260918155718
--
-- tool_brands → tools → tool_versions with successor links, plus
-- claim-scoped provenance (tool_claims, tool_sources) and privileged
-- verification events. Deliberate deviations from the archived draft:
-- - Drops the invalid `create trigger` statement and the definer timestamp
--   trigger without fixed search_path; versions carry no mutable columns.
-- - SELECT-only RLS for authenticated AND mutator (RPC cores validate links
--   as mutator); no INSERT/UPDATE/DELETE path for any role at runtime.
-- - RESTRICT foreign keys so catalogue history cannot be cascade-deleted.
-- - Capability unknowns are independent nullables (wattage vs temperature);
--   adjustable-temp and contact/air heat are yes/no/unknown.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.tool_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text generated always as (lower(regexp_replace(name, '[^a-z0-9]', '', 'g'))) stored unique,
  created_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.tool_brands(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  tool_type text not null check (tool_type in ('dryer','heated-air-brush','air-styler','hood-dryer','flat-iron','hot-comb','curling-iron','steam-straightener','heated-rollers','diffuser','other')),
  created_at timestamptz not null default now()
);
create index tool_brand_idx on public.tools(brand_id);

create table public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete restrict,
  version_label text not null check (length(btrim(version_label)) between 1 and 200),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  wattage_watts integer check (wattage_watts is null or wattage_watts between 0 and 10000),
  temperature_max_celsius integer check (temperature_max_celsius is null or temperature_max_celsius between 0 and 300),
  adjustable_temp text not null default 'unknown' check (adjustable_temp in ('yes','no','unknown')),
  contact_heat text not null default 'unknown' check (contact_heat in ('yes','no','unknown')),
  air_heat text not null default 'unknown' check (air_heat in ('yes','no','unknown')),
  lifecycle text not null default 'active' check (lifecycle in ('active','retired')),
  successor_version_id uuid references public.tool_versions(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index tool_version_tool_idx on public.tool_versions(tool_id);
create index tool_version_successor_idx on public.tool_versions(successor_version_id);

create table public.tool_claims (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.tool_versions(id) on delete restrict,
  claim_key text not null check (length(btrim(claim_key)) between 1 and 100),
  statement text check (statement is null or length(statement) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index tool_claim_version_idx on public.tool_claims(version_id);

create table public.tool_sources (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.tool_versions(id) on delete restrict,
  source_url text not null check (source_url like 'https://%'),
  archived_url text check (archived_url is null or archived_url like 'https://%'),
  source_type text not null check (source_type in ('regulator','peer_reviewed','professional_body','independent_testing','manufacturer','formulation_inference','community_outcome','consumer_signal','individual_anecdote','marketing')),
  trust_tier text not null check (trust_tier in ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10')),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  first_seen date not null,
  last_checked date not null check (last_checked >= first_seen),
  created_at timestamptz not null default now()
);
create index tool_source_version_idx on public.tool_sources(version_id);

create table public.tool_verification_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.tool_versions(id) on delete restrict,
  reviewer text not null check (length(btrim(reviewer)) between 1 and 200),
  reviewed_fields text[] not null check (array_length(reviewed_fields, 1) between 1 and 50),
  status text not null check (status in ('unverified','pending_verification','partially_verified','verified','conflicting_information')),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  source_ids uuid[] not null default '{}',
  recorded_at timestamptz not null default now()
);
create index tool_verification_event_version_idx on public.tool_verification_events(version_id);

alter table public.tool_brands enable row level security;
alter table public.tools enable row level security;
alter table public.tool_versions enable row level security;
alter table public.tool_claims enable row level security;
alter table public.tool_sources enable row level security;
alter table public.tool_verification_events enable row level security;
alter table public.tool_brands force row level security;
alter table public.tools force row level security;
alter table public.tool_versions force row level security;
alter table public.tool_claims force row level security;
alter table public.tool_sources force row level security;
alter table public.tool_verification_events force row level security;

-- Public catalogue reads for consumers and for mutator RPC cores alike.
-- No write policies exist: catalogue rows are managed by reviewed seed
-- migrations, which keeps every runtime write impossible.
create policy tool_brand_read on public.tool_brands for select to authenticated, strandcue_mutator using (true);
create policy tool_read on public.tools for select to authenticated, strandcue_mutator using (true);
create policy tool_version_read on public.tool_versions for select to authenticated, strandcue_mutator using (true);
create policy tool_claim_read on public.tool_claims for select to authenticated, strandcue_mutator using (true);
create policy tool_source_read on public.tool_sources for select to authenticated, strandcue_mutator using (true);
create policy tool_verification_event_read on public.tool_verification_events for select to authenticated, strandcue_mutator using (true);

revoke all on public.tool_brands, public.tools, public.tool_versions,
  public.tool_claims, public.tool_sources, public.tool_verification_events
  from public, anon, authenticated;
grant select on public.tool_brands, public.tools, public.tool_versions,
  public.tool_claims, public.tool_sources, public.tool_verification_events
  to authenticated, strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

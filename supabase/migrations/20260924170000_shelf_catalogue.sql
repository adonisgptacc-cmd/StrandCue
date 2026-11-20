-- Trusted Shelf catalogue baseline — replaces archived 20260918154343
--
-- Catalogue (brands → products → product_versions) plus claim-scoped
-- provenance (product_claims, product_sources) and privileged verification
-- events. Deliberate deviations from the archived draft:
-- - No consumer or mutator write path at all in Phase 1. Catalogue rows are
--   managed by reviewed seed migrations (P1-VER-04); SELECT-only RLS policies
--   plus minimal grants make runtime writes impossible, which also proves
--   P1-AC-13 for catalogue and verification state.
-- - Verification and lifecycle are separate dimensions (P1-VER-01).
--   Verification status lives per claim/event, never as a whole-record
--   boolean; lifecycle is a seed-managed column on versions.
-- - Version payloads are immutable: no UPDATE/DELETE policies, no
--   updated_at triggers, RESTRICT foreign keys so history cannot be
--   cascade-deleted. Reformulation is a successor link set at insert.
-- - No SECURITY DEFINER triggers; no fixed search_path workarounds.

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  slug text generated always as (lower(regexp_replace(name, '[^a-z0-9]', '', 'g'))) stored unique,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  category text not null check (category in ('shampoo','clarifier','conditioner','mask','bond/protein treatment','leave-in','heat protectant','anti-humidity','styling cream','mousse','gel','serum','oil','scalp','colour','other')),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  created_at timestamptz not null default now()
);
create index product_brand_idx on public.products(brand_id);

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variant text check (variant is null or length(btrim(variant)) between 1 and 200),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  barcode text check (barcode is null or length(btrim(barcode)) between 1 and 100),
  formulation_ref text check (formulation_ref is null or length(btrim(formulation_ref)) between 1 and 200),
  structured_directions jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_directions) = 'object'),
  ingredients jsonb check (ingredients is null or jsonb_typeof(ingredients) = 'object'),
  lifecycle text not null default 'active' check (lifecycle in ('active','retired')),
  successor_version_id uuid references public.product_versions(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index product_version_product_idx on public.product_versions(product_id);
create index product_version_successor_idx on public.product_versions(successor_version_id);

-- Claim-scoped facts (P1-VER-02): a verified name never verifies ingredients.
create table public.product_claims (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.product_versions(id) on delete restrict,
  claim_key text not null check (length(btrim(claim_key)) between 1 and 100),
  statement text check (statement is null or length(statement) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index product_claim_version_idx on public.product_claims(version_id);

-- Provenance (PRD §16): every fact carries source, tier and check dates.
create table public.product_sources (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.product_versions(id) on delete restrict,
  source_url text not null check (source_url like 'https://%'),
  archived_url text check (archived_url is null or archived_url like 'https://%'),
  source_type text not null check (source_type in ('regulator','peer_reviewed','professional_body','independent_testing','manufacturer','formulation_inference','community_outcome','consumer_signal','individual_anecdote','marketing')),
  trust_tier text not null check (trust_tier in ('T1','T2','T3','T4','T5','T6','T7','T8','T9','T10')),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  first_seen date not null,
  last_checked date not null check (last_checked >= first_seen),
  created_at timestamptz not null default now()
);
create index product_source_version_idx on public.product_sources(version_id);

-- Privileged verification events (P1-VER-03/04): append-only, reviewer is
-- server/seed-set. Phase 1 has no operator auth, so no runtime writer exists.
create table public.product_verification_events (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.product_versions(id) on delete restrict,
  reviewer text not null check (length(btrim(reviewer)) between 1 and 200),
  reviewed_fields text[] not null check (array_length(reviewed_fields, 1) between 1 and 50),
  status text not null check (status in ('unverified','pending_verification','partially_verified','verified','conflicting_information')),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  source_ids uuid[] not null default '{}',
  recorded_at timestamptz not null default now()
);
create index product_verification_event_version_idx on public.product_verification_events(version_id);

alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_versions enable row level security;
alter table public.product_claims enable row level security;
alter table public.product_sources enable row level security;
alter table public.product_verification_events enable row level security;
alter table public.brands force row level security;
alter table public.products force row level security;
alter table public.product_versions force row level security;
alter table public.product_claims force row level security;
alter table public.product_sources force row level security;
alter table public.product_verification_events force row level security;

-- Public catalogue reads only. There is intentionally no INSERT/UPDATE/DELETE
-- policy for any role: catalogue rows are managed by reviewed seed migrations.
create policy brand_read on public.brands for select to authenticated using (true);
create policy product_read on public.products for select to authenticated using (true);
create policy product_version_read on public.product_versions for select to authenticated using (true);
create policy product_claim_read on public.product_claims for select to authenticated using (true);
create policy product_source_read on public.product_sources for select to authenticated using (true);
create policy product_verification_event_read on public.product_verification_events for select to authenticated using (true);

revoke all on public.brands, public.products, public.product_versions,
  public.product_claims, public.product_sources, public.product_verification_events
  from public, anon, authenticated;
grant select on public.brands, public.products, public.product_versions,
  public.product_claims, public.product_sources, public.product_verification_events
  to authenticated;

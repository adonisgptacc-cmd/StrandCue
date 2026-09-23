-- Trusted user products baseline — replaces archived 20260918154920
--
-- Private ownership (manual or catalogue-linked) with immutable dated
-- availability/match history. Deliberate deviations from the archived draft:
-- - Drops the invalid `GRANT ... USING` statements and the broken
--   `correction_id` foreign key to nonexistent columns; uses composite
--   `(id, owner)` keys like the trusted Passport/Activity baselines.
-- - No direct consumer writes: authenticated gets SELECT only; all mutations
--   go through transactional RPC (next migration). No SECURITY DEFINER
--   timestamp triggers; the RPC maintains updated_at explicitly.
-- - Catalogue version links are RESTRICT: a referenced version cannot be
--   removed while ownership history points at it.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.user_products (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  version_id uuid references public.product_versions(id) on delete restrict,
  manual_brand text check (manual_brand is null or length(btrim(manual_brand)) between 1 and 200),
  manual_name text check (manual_name is null or length(btrim(manual_name)) between 1 and 200),
  manual_category text check (manual_category is null or manual_category in ('shampoo','clarifier','conditioner','mask','bond/protein treatment','leave-in','heat protectant','anti-humidity','styling cream','mousse','gel','serum','oil','scalp','colour','other')),
  availability text not null default 'available' check (availability in ('available','out_of_stock','archived')),
  matched boolean not null default false,
  matched_at timestamptz,
  match_confirmed boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner),
  check ((version_id is not null) or (manual_name is not null and length(btrim(manual_name)) >= 1)),
  check ((matched and match_confirmed and version_id is not null and matched_at is not null) or (not matched and not match_confirmed and matched_at is null))
);

create table public.user_product_revisions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  user_product_id uuid not null,
  sequence integer not null check (sequence > 0),
  base_revision integer not null check (base_revision >= 0 and sequence = base_revision + 1),
  kind text not null check (kind in ('baseline','change','correction','match','archive')),
  effective_date jsonb not null,
  effective_start date,
  effective_end date,
  recorded_at timestamptz not null default now(),
  source text not null check (source in ('user-reported','user-estimated')),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  corrects_id uuid,
  correction_reason text,
  match_version_id uuid,
  unique (id, owner, user_product_id),
  unique (user_product_id, sequence),
  unique (corrects_id),
  foreign key (user_product_id, owner) references public.user_products(id, owner) on delete cascade,
  foreign key (corrects_id, owner, user_product_id) references public.user_product_revisions(id, owner, user_product_id),
  foreign key (match_version_id) references public.product_versions(id) on delete restrict,
  check ((kind = 'correction' and corrects_id is not null and length(btrim(correction_reason)) between 1 and 500 and match_version_id is null)
      or (kind = 'match' and match_version_id is not null and corrects_id is null and correction_reason is null)
      or (kind in ('baseline','change','archive') and corrects_id is null and correction_reason is null and match_version_id is null)),
  check (kind <> 'baseline' or sequence = 1)
);
create unique index user_product_one_baseline on public.user_product_revisions(user_product_id) where kind = 'baseline';
create index user_product_owner_history on public.user_product_revisions(owner, user_product_id, sequence);
create index user_product_owner_idx on public.user_products(owner);

create table strandcue_private.shelf_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.user_products enable row level security;
alter table public.user_product_revisions enable row level security;
alter table strandcue_private.shelf_operations enable row level security;
alter table public.user_products force row level security;
alter table public.user_product_revisions force row level security;
alter table strandcue_private.shelf_operations force row level security;

create policy user_product_read on public.user_products for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_products.owner and p.account_status = 'active'));
create policy user_product_revision_read on public.user_product_revisions for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_product_revisions.owner and p.account_status = 'active'));

create policy user_product_insert on public.user_products for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_products.owner and p.account_status = 'active'));
create policy user_product_update on public.user_products for update to strandcue_mutator
  using (owner = (select strandcue_private.request_uid())) with check (owner = (select strandcue_private.request_uid()));
create policy user_product_revision_append on public.user_product_revisions for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_product_revisions.owner and p.account_status = 'active'));
create policy shelf_operation_read on strandcue_private.shelf_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy shelf_operation_append on strandcue_private.shelf_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on public.user_products, public.user_product_revisions from public, anon, authenticated;
revoke all on strandcue_private.shelf_operations from public, anon, authenticated;
grant select on public.user_products, public.user_product_revisions to authenticated;
grant select, insert on public.user_products, public.user_product_revisions, strandcue_private.shelf_operations to strandcue_mutator;
grant update(revision, availability, matched, matched_at, match_confirmed, version_id, manual_brand, manual_name, manual_category, notes, updated_at) on public.user_products to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

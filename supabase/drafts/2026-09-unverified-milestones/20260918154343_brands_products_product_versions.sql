-- StrandCue Task 1.1: Brands, products, and product versions with successor relationships
-- Milestone 1: My Shelf and provenance

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text generated always as (lower(regexp_replace(name, '[^a-z0-9]', '', 'g'))) stored unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brands is 'Catalogue brand identity; reported classification, not efficacy verification';

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  category text not null check (category in ('shampoo','clarifier','conditioner','mask','bond/protein treatment','leave-in','heat protectant','anti-humidity','styling cream','mousse','gel','serum','oil','scalp','colour','other')),
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.products is 'Global read-only catalogue identity; no consumer ownership';

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant text,
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  formulation_ref text,
  structured_directions jsonb not null check (jsonb_typeof(structured_directions)='object'),
  ingredients jsonb,
  status text not null default 'pending' check (status in ('draft','in review','published','superseded/withdrawn')),
  verified_at timestamptz,
  successor_version_id uuid references public.product_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_versions is 'Immutable published version; index product/market/status; successor links and market metadata';

create unique index product_version_one_active on public.product_versions(product_id,market,status) where status='published';

create index product_version_product_idx on public.product_versions(product_id);

create index product_version_successor_idx on public.product_versions(successor_version_id);

-- RLS policies for brands, products, product_versions

alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_versions enable row level security;

-- Brands: public read, insert via mutator
create policy brand_read on public.brands for select to authenticated using (true);
create policy brand_insert on public.brands for insert to strandcue_mutator with check (true);

-- Products: public read (catalogue identity), insert via mutator
create policy product_read on public.products for select to authenticated using (true);
create policy product_insert on public.products for insert to strandcue_mutator with check (true);

-- Product versions: public read (status/identity), insert/update via mutator with owner check
create policy product_version_read on public.product_versions for select to authenticated using (true);
create policy product_version_insert on public.product_versions for insert to strandcue_mutator with check (true);
create policy product_version_update on public.product_versions for update to strandcue_mutator using (true);

-- Update timestamps trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger handle_products_updated_at before update on public.products for each row execute function public.handle_updated_at();
create trigger handle_product_versions_updated_at before update on public.product_versions for each row execute function public.handle_updated_at();

-- Grant permissions
grant all on public.brands to strandcue_mutator;
grant all on public.products to strandcue_mutator;
grant all on public.product_versions to strandcue_mutator;

-- Also grant select to authenticated for catalogue reading
grant usage on schema public to authenticated;
grant select on public.brands to authenticated;
grant select on public.products to authenticated;
grant select on public.product_versions to authenticated;
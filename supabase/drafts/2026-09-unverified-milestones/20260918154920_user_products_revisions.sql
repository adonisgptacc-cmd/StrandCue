-- StrandCue Task 1.2: Private user products and revision history
-- Milestone 1: My Shelf and provenance

create table public.user_products (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  product_version uuid references public.product_versions(id) on delete set null,
  manual_brand text,
  manual_name text,
  manual_category text,
  availability text not null default 'available' check (availability in ('available','out_of_stock','archived')),
  matched boolean not null default false,
  matched_at timestamptz,
  match_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_products is 'Private manual or catalogue-linked ownership identity; dated availability/matching; historical references retained';

create table public.user_product_revisions (
  id uuid primary key default gen_random_uuid(),
  user_product_id uuid not null references public.user_products(id) on delete cascade,
  base_revision integer not null check (base_revision>=0),
  changed_fields jsonb not null check (jsonb_typeof(changed_fields)='object'),
  new_values jsonb not null check (jsonb_typeof(new_values)='object'),
  effective_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  correction_id uuid,
  unique (user_product_id,base_revision),
  unique (user_product_id,effective_at),
  foreign key (correction_id,user_id,product_id) references public.user_product_revisions(id,user_id,product_id)
);

comment on table public.user_product_revisions is 'Dated changes with immutable audit trail; corrections traceable';

create index user_product_owner_idx on public.user_products(owner);

create index user_product_revision_user_product_idx on public.user_product_revisions(user_product_id);

create index user_product_revision_correction_idx on public.user_product_revisions(correction_id);

-- RLS policies for user_products and user_product_revisions

alter table public.user_products enable row level security;
alter table public.user_product_revisions enable row level security;

-- Owner can CRUD their own user_products
create policy user_product_owner_read on public.user_products for select to authenticated using (owner=(select strandcue_private.request_uid()));
create policy user_product_owner_insert on public.user_products for insert to authenticated with check (owner=(select strandcue_private.request_uid()));
create policy user_product_owner_update on public.user_products for update to authenticated using (owner=(select strandcue_private.request_uid()));

-- Owner can CRUD their own revisions
create policy user_product_revision_owner_read on public.user_product_revisions for select to authenticated using ((select strandcue_private.request_uid()) = any((select owner from public.user_products up where up.id = user_product_id)));
create policy user_product_revision_owner_insert on public.user_product_revisions for insert to authenticated with check ((select strandcue_private.request_uid()) = any((select owner from public.user_products up where up.id = user_product_id)));

-- Update timestamps trigger
create or replace function public.handle_updated_at_user_products()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger handle_user_products_updated_at before update on public.user_products for each row execute function public.handle_updated_at_user_products();

-- Grant permissions
grant all on public.user_products to strandcue_mutator;
grant all on public.user_product_revisions to strandcue_mutator;

-- Authenticated users can select their own (via RLS)
grant select on public.user_products to authenticated using (owner=(select strandcue_private.request_uid()));
grant select on public.user_product_revisions to authenticated using ((select strandcue_private.request_uid()) = any((select owner from public.user_products up where up.id = user_product_id)));

-- Also make the request_uid function available
grant execute on function strandcue_private.request_uid() to authenticated;
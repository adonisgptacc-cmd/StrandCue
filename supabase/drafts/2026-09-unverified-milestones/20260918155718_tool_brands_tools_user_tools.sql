-- StrandCue Task 2.1: Tool brands, tools, versions, and user tools
-- Milestone 2: My Tools

create table public.tool_brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text generated always as (lower(regexp_replace(name, '[^a-z0-9]', '', 'g'))) stored unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tool_brands is 'Curated identities; published versions immutable';

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.tool_brands(id) on delete cascade,
  name text not null,
  tool_type text not null check (tool_type in ('dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straighter','unheated-rollers','diffusers','other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tools is 'Curated identities; published versions immutable';

create table public.tool_versions (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  version text not null,
  market text not null default 'ZA' check (market in ('ZA','unknown')),
  capabilities jsonb not null check (jsonb_typeof(capabilities)='object'),
  temperature_yes_no_unknown text not null check (temperature_yes_no_unknown in ('yes','no','unknown')),
  reported_temperature decimal,
  wattage integer,
  provenance text,
  successor_version_id uuid references public.tool_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tool_versions is 'Curated optional reference catalogue; published versions immutable';

create index tool_brand_idx on public.tool_brands(slug);
create index tool_tool_idx on public.tools(brand_id);
create index tool_version_tool_idx on public.tool_versions(tool_id);
create index tool_version_successor_idx on public.tool_versions(successor_version_id);

-- RLS policies for tool_brands, tools, tool_versions

alter table public.tool_brands enable row level security;
alter table public.tools enable row level security;
alter table public.tool_versions enable row level security;

-- Tool brands: public read
create policy tool_brand_read on public.tool_brands for select to authenticated using (true);

-- Tools: public read with brand check
create policy tool_read on public.tools for select to authenticated using (true);

-- Tool versions: public read
create policy tool_version_read on public.tool_versions for select to authenticated using (true);

-- Grant permissions to mutator
grant all on public.tool_brands to strandcue_mutator;
grant all on public.tools to strandcue_mutator;
grant all on public.tool_versions to strandcue_mutator;

-- Authenticated can select
grant select on public.tool_brands to authenticated;
grant select on public.tools to authenticated;
grant select on public.tool_versions to authenticated;

-- Update triggers
create or replace function public.handle_updated_at_tool()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger handle_tools_updated_at before update on public.tools for each row execute function public.handle_updated_at_tool();
create handle_tool_versions_updated_at before update on public.tool_versions for each row execute function public.handle_updated_at_tool();

-- Grant execute on functions
grant execute on function handle_updated_at_tool() to authenticated;
grant execute on function handle_updated_at_tool() to strandcue_mutator;
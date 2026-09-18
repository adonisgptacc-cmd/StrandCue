-- StrandCue Task 3.1: Activities, heat events, and links
-- Milestone 3: Activities and heat records

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('wash','styling','other')),
  occurred_at timestamptz not null,
  precision text not null check (precision in ('exact_day','exact_month','exact_year','unknown')),
  zones jsonb,
  notes text check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.activities is 'Manual factual sessions and corrections; owner and occurred date/precision';

create table public.activity_revisions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  base_revision integer not null check (base_revision>=0),
  changed_fields jsonb not null check (jsonb_typeof(changed_fields)='object'),
  new_values jsonb not null check (jsonb_typeof(new_values)='object'),
  effective_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  correction_id uuid,
  unique (activity_id,base_revision),
  foreign key (correction_id,user_id,activity_id) references public.activity_revisions(id,user_id,activity_id)
);

comment on table public.activity_revisions is 'Dated changes with immutable audit trail; corrections traceable';

create table public.heat_events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  method text not null check (method in ('dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straighter','unheated-rollers','diffuser','other')),
  tool_version uuid references public.tool_versions(id),
  temperature decimal,
  passes integer,
  duration_minutes integer,
  wet_dry_state text not null check (wet_dry_state in ('wet','dry','unknown')),
  created_at timestamptz not null default now()
);

comment on table public.heat_events is 'Separate optional event linked to an activity/service; method, tool, temperature, passes, duration, wet/dry state';

create table public.activity_products (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  product_version uuid references public.product_versions(id),
  applied_at timestamptz,
  quantity integer,
  created_at timestamptz not null default now()
);

comment on table public.activity_products is 'Links activities to product versions applied';

create table public.activity_tools (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  tool_version uuid references public.tool_versions(id),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.activity_tools is 'Links activities to tool versions applied';

create index activity_owner_idx on public.activities(owner);
create activity_precision_idx on public.activities(precision);
create activity_kind_idx on public.activities(kind);
create heat_activity_idx on public.heat_events(activity_id);
create activity_product_activity_idx on public.activity_products(activity_id);
create activity_tool_activity_idx on public.activity_tools(activity_id);

-- RLS policies for activities, revisions, heat events, and links

alter table public.activities enable row level security;
alter table public.activity_revisions enable row level security;
alter table public.heat_events enable row level security;
alter table public.activity_products enable row level security;
alter table public.activity_tools enable row level security;

-- Owner can CRUD their own activities
create policy activity_owner_read on public.activities for select to authenticated using (owner=(select strandcue_private.request_uid()));
create policy activity_owner_insert on public.activities for insert to authenticated with check (owner=(select strandcue_private.request_uid()));
create policy activity_owner_update on public.activities for update to authenticated using (owner=(select strandcue_private.request_uid()));

-- Owner can CRUD their own revisions
create policy activity_revision_owner_read on public.activity_revisions for select to authenticated using ((select strandcue_private.request_uid()) = any((select owner from public.activities up where up.id = activity_id)));
create policy activity_revision_owner_insert on public.activity_revisions for insert to authenticated with check ((select strandcue_private.request_uid()) = any((select owner from public.activities up where up.id = activity_id)));

-- Owner can CRUD their own heat events
create policy heat_event_owner_read on public.heat_events for select to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
create policy heat_event_owner_insert on public.heat_events for insert to authenticated with check (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid()))));

-- Owner can CRUD their own product and tool links
create policy activity_product_owner_read on public.activity_products for select to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
create activity_product_owner_insert on public.activity_products for insert to authenticated with check (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
create activity_tool_owner_read on public.activity_tools for select to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
create activity_tool_owner_insert on public.activity_tools for insert to authenticated with check (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid()))));

-- Update triggers
create or replace function public.handle_updated_at_activities()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

create trigger handle_activities_updated_at before update on public.activities for each row execute function public.handle_updated_at_activities();

-- Grant permissions to mutator
grant all on public.activities to strandcue_mutator;
grant all on public.activity_revisions to strandcue_mutator;
grant all on public.heat_events to strandcue_mutator;
grant all on public.activity_products to strandcue_mutator;
grant all on public.activity_tools to strandcue_mutator;

-- Authenticated can select their own (via RLS)
grant select on public.activities to authenticated using (owner=(select strandcue_private.request_uid()));
grant select on public.activity_revisions to authenticated using ((select strandcue_private.request_uid()) = any((select owner from public.activities up where up.id = activity_id)));
grant select on public.heat_events to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
grant select on public.activity_products to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));
grant select on public.activity_tools to authenticated using (activity_id in (select id from public.activities where owner=(select strandcue_private.request_uid())));

-- Grant execute on functions
grant execute on function handle_updated_at_activities() to authenticated;
grant execute on function handle_updated_at_activities() to strandcue_mutator;
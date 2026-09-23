-- Trusted Activity history baseline — replaces archived 20260918160720
-- Implements append-only activity revisions with void audit, owner-scoped RLS, and operation-key idempotency.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('wash','styling','other')),
  occurred_at timestamptz not null,
  precision text not null check (precision in ('exact_day','exact_month','exact_year','unknown')),
  zones jsonb not null default '[]'::jsonb,
  notes text check (char_length(notes) <= 2000),
  status text not null default 'active' check (status in ('active','voided')),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner)
);

create table public.activity_revisions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  activity_id uuid not null,
  sequence integer not null check (sequence > 0),
  base_revision integer not null check (base_revision >= 0 and sequence = base_revision + 1),
  kind text not null check (kind in ('baseline','change','correction','void')),
  effective_date jsonb not null,
  effective_start date,
  effective_end date,
  recorded_at timestamptz not null default now(),
  source text not null check (source in ('user-reported','user-estimated')),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  corrects_id uuid,
  correction_reason text,
  void_reason text,
  unique (id, owner, activity_id),
  unique (activity_id, sequence),
  unique (corrects_id),
  foreign key (activity_id, owner) references public.activities(id, owner) on delete cascade,
  foreign key (corrects_id, owner, activity_id) references public.activity_revisions(id, owner, activity_id),
  check ((kind = 'correction' and corrects_id is not null and length(btrim(correction_reason)) between 1 and 500 and void_reason is null)
      or (kind = 'void' and void_reason is not null and length(btrim(void_reason)) between 1 and 500 and corrects_id is null and correction_reason is null)
      or (kind in ('baseline','change') and corrects_id is null and correction_reason is null and void_reason is null)),
  check (kind <> 'baseline' or sequence = 1)
);
create unique index activity_one_baseline on public.activity_revisions(activity_id) where kind = 'baseline';
create index activity_owner_history on public.activity_revisions(owner, activity_id, sequence);
create index activity_revision_owner_idx on public.activity_revisions(owner);

create table public.activity_products (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  activity_id uuid not null,
  product_version uuid,
  applied_at timestamptz,
  quantity integer,
  created_at timestamptz not null default now(),
  unique (id, owner, activity_id),
  foreign key (activity_id, owner) references public.activities(id, owner) on delete cascade
);

create table public.activity_tools (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  activity_id uuid not null,
  tool_version uuid,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, owner, activity_id),
  foreign key (activity_id, owner) references public.activities(id, owner) on delete cascade
);

create table public.activity_heat_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  activity_id uuid not null,
  method text not null check (method in ('dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straightener','unheated-rollers','diffuser','other')),
  tool_version uuid,
  temperature numeric,
  passes integer,
  duration_minutes integer,
  wet_dry_state text not null check (wet_dry_state in ('wet','dry','unknown')),
  created_at timestamptz not null default now(),
  unique (id, owner, activity_id),
  foreign key (activity_id, owner) references public.activities(id, owner) on delete cascade
);

create table strandcue_private.activity_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.activities enable row level security;
alter table public.activity_revisions enable row level security;
alter table public.activity_products enable row level security;
alter table public.activity_tools enable row level security;
alter table public.activity_heat_events enable row level security;
alter table strandcue_private.activity_operations enable row level security;
alter table public.activities force row level security;
alter table public.activity_revisions force row level security;
alter table public.activity_products force row level security;
alter table public.activity_tools force row level security;
alter table public.activity_heat_events force row level security;
alter table strandcue_private.activity_operations force row level security;

-- Read policies: owner sees only own rows where profile still active
create policy activity_read on public.activities for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = activities.owner and p.account_status = 'active'));
create policy activity_revision_read on public.activity_revisions for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = activity_revisions.owner and p.account_status = 'active'));
create policy activity_product_read on public.activity_products for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()));
create policy activity_tool_read on public.activity_tools for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()));
create policy heat_event_read on public.activity_heat_events for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()));

-- Mutator-only writes; authenticated cannot INSERT/UPDATE/DELETE directly
create policy activity_insert on public.activities for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = activities.owner and p.account_status = 'active'));
create policy activity_update on public.activities for update to strandcue_mutator
  using (owner = (select strandcue_private.request_uid())) with check (owner = (select strandcue_private.request_uid()));
create policy activity_revision_append on public.activity_revisions for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = activity_revisions.owner and p.account_status = 'active'));
create policy activity_product_append on public.activity_products for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()));
create policy activity_tool_append on public.activity_tools for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()));
create policy heat_event_append on public.activity_heat_events for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()));
create policy activity_operation_read on strandcue_private.activity_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy activity_operation_append on strandcue_private.activity_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

-- Revoke default public grants and grant minimal
revoke all on public.activities, public.activity_revisions, public.activity_products, public.activity_tools, public.activity_heat_events from public, anon, authenticated;
revoke all on strandcue_private.activity_operations from public, anon, authenticated;
grant select on public.activities, public.activity_revisions, public.activity_products, public.activity_tools, public.activity_heat_events to authenticated;
grant select, insert on public.activities, public.activity_revisions, public.activity_products, public.activity_tools, public.activity_heat_events, strandcue_private.activity_operations to strandcue_mutator;
grant update(revision, updated_at) on public.activities to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

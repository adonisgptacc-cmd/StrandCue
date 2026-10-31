-- Trusted user tools baseline — the archived Milestone 2 draft contained no
-- ownership tables at all. Mirrors the trusted user_products baseline:
-- owner-scoped stable rows plus immutable dated revisions, composite
-- (id, owner) keys, correction links, operation-key idempotency, and
-- mutator-only writes. Catalogue version links are RESTRICT.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.user_tools (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(user_id) on delete cascade,
  version_id uuid references public.tool_versions(id) on delete restrict,
  manual_brand text check (manual_brand is null or length(btrim(manual_brand)) between 1 and 200),
  manual_model text check (manual_model is null or length(btrim(manual_model)) between 1 and 200),
  tool_type text check (tool_type is null or tool_type in ('dryer','heated-air-brush','air-styler','hood-dryer','flat-iron','hot-comb','curling-iron','steam-straightener','heated-rollers','diffuser','other')),
  availability text not null default 'available' check (availability in ('available','out_of_stock','archived')),
  matched boolean not null default false,
  matched_at timestamptz,
  match_confirmed boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner),
  check ((version_id is not null) or (manual_model is not null and length(btrim(manual_model)) >= 1)),
  check ((matched and match_confirmed and version_id is not null and matched_at is not null) or (not matched and not match_confirmed and matched_at is null))
);

create table public.user_tool_revisions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null,
  user_tool_id uuid not null,
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
  unique (id, owner, user_tool_id),
  unique (user_tool_id, sequence),
  unique (corrects_id),
  foreign key (user_tool_id, owner) references public.user_tools(id, owner) on delete cascade,
  foreign key (corrects_id, owner, user_tool_id) references public.user_tool_revisions(id, owner, user_tool_id),
  foreign key (match_version_id) references public.tool_versions(id) on delete restrict,
  check ((kind = 'correction' and corrects_id is not null and length(btrim(correction_reason)) between 1 and 500 and match_version_id is null)
      or (kind = 'match' and match_version_id is not null and corrects_id is null and correction_reason is null)
      or (kind in ('baseline','change','archive') and corrects_id is null and correction_reason is null and match_version_id is null)),
  check (kind <> 'baseline' or sequence = 1)
);
create unique index user_tool_one_baseline on public.user_tool_revisions(user_tool_id) where kind = 'baseline';
create index user_tool_owner_history on public.user_tool_revisions(owner, user_tool_id, sequence);
create index user_tool_owner_idx on public.user_tools(owner);

create table strandcue_private.tool_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.user_tools enable row level security;
alter table public.user_tool_revisions enable row level security;
alter table strandcue_private.tool_operations enable row level security;
alter table public.user_tools force row level security;
alter table public.user_tool_revisions force row level security;
alter table strandcue_private.tool_operations force row level security;

create policy user_tool_read on public.user_tools for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_tools.owner and p.account_status = 'active'));
create policy user_tool_revision_read on public.user_tool_revisions for select to authenticated, strandcue_mutator
  using (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_tool_revisions.owner and p.account_status = 'active'));

create policy user_tool_insert on public.user_tools for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_tools.owner and p.account_status = 'active'));
create policy user_tool_update on public.user_tools for update to strandcue_mutator
  using (owner = (select strandcue_private.request_uid())) with check (owner = (select strandcue_private.request_uid()));
create policy user_tool_revision_append on public.user_tool_revisions for insert to strandcue_mutator
  with check (owner = (select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id = user_tool_revisions.owner and p.account_status = 'active'));
create policy tool_operation_read on strandcue_private.tool_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy tool_operation_append on strandcue_private.tool_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

revoke all on public.user_tools, public.user_tool_revisions from public, anon, authenticated;
revoke all on strandcue_private.tool_operations from public, anon, authenticated;
grant select on public.user_tools, public.user_tool_revisions to authenticated;
grant select, insert on public.user_tools, public.user_tool_revisions, strandcue_private.tool_operations to strandcue_mutator;
grant update(revision, availability, matched, matched_at, match_confirmed, version_id, manual_brand, manual_model, tool_type, notes, updated_at) on public.user_tools to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

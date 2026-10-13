-- Private, owner-isolated protocol execution persistence (TD-05–TD-08).
--
-- An execution records what actually happened while following one immutable
-- recommendation run. It references that run by request id
-- (`recommendation_run_id`) and copies the run's stable step identities plus
-- the planned step content into its own snapshot at start time. The stored
-- decision bytes are never rewritten: transitions update only the execution
-- snapshot, revision, status, and timestamp columns.
--
-- Deliberate shape choices:
-- - Owner is always strandcue_private.request_uid() (auth.uid()). No public
--   RPC takes an owner argument, so a caller cannot write another owner's
--   row even if it wants to (verified by test).
-- - Run ownership is verified FIRST on every start and transition, before
--   any execution write. A run owned by another owner is refused
--   with 'run-not-owned' and no row or event is written.
-- - Append-only for the authenticated role: the only table policy granted
--   to `authenticated` is SELECT. Every write goes through the hardened RPC
--   core below. Events are insert-only history; decisions are immutable by a
--   BEFORE UPDATE trigger (`decision-immutable`), not merely by omission.
-- - Result integrity is enforced server-side: a transition persists only when
--   `p_result` is exactly the stored execution plus the commanded delta —
--   the commanded step moves `pending` to its terminal state with
--   well-formed fields (confirmation timestamps equal the transition time,
--   deviations equal the command content, copied plans byte-identical) and
--   every other step is byte-identical. Anything else raises
--   `result-mismatch` with the stored state untouched.
-- - Idempotent on (user_id, operation_id): replaying the same operation id
--   with the same request returns the original receipt without writing new
--   rows or events. Replaying it with different content raises
--   'operation-conflict'. Stale expected revisions raise
--   'revision-conflict' without overwriting.
-- - Substitution supply is an engine-time concern, NOT a persistence gate:
--   this migration performs no supply lookups and references no owner-product
--   tables (verified by test).
-- - Deviation free text (`reason`/`detail`) is execution history only. This
--   migration builds no facts, snapshots, or recommendation input from it.
-- - Service-role maintenance path: the `strandcue_mutator` role (the
--   SECURITY DEFINER owner of the private core) holds narrow, owner-confined,
--   per-command policies scoped to exactly the writes the core performs
--   (executions: SELECT/INSERT/UPDATE; events and operations: SELECT/INSERT).
--   ABSENT was considered and rejected: under forced RLS the definer core
--   still needs table access, and owner-confined mutator policies are the
--   narrowest mechanism that provides it. Every mutator policy is confined to
--   `user_id = request_uid()`, so no cross-owner maintenance is possible,
--   and cleanup still flows through the profiles foreign-key cascade. A real
--   service-role connection is granted nothing here.
-- - Decision and execution payloads are capped at 256 KiB each.
--
-- Public wrappers are security invokers; the private core is security
-- definer owned by strandcue_mutator. This migration is PGlite-local only
-- and must never be applied to hosted Supabase by hand.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create table public.protocol_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  execution_id uuid not null,
  recommendation_run_id uuid not null,
  decision jsonb not null check (octet_length(decision::text) <= 262144),
  execution jsonb not null check (octet_length(execution::text) <= 262144),
  revision integer not null default 0 check (revision >= 0),
  status text not null check (status in
    ('in_progress','paused','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, execution_id)
);
create index protocol_executions_owner_time
  on public.protocol_executions(user_id, created_at desc, id desc);
create index protocol_executions_owner_status
  on public.protocol_executions(user_id, status, created_at desc);

create table public.protocol_execution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  execution_id uuid not null,
  sequence integer not null check (sequence >= 1),
  kind text not null check (kind in ('started','command')),
  command jsonb not null,
  revision integer not null check (revision >= 0),
  recorded_at timestamptz not null default now(),
  unique (user_id, execution_id, sequence)
);
create index protocol_execution_events_owner_execution
  on public.protocol_execution_events(user_id, execution_id, sequence);

create table strandcue_private.protocol_execution_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.protocol_executions enable row level security;
alter table public.protocol_executions force row level security;
alter table public.protocol_execution_events enable row level security;
alter table public.protocol_execution_events force row level security;
alter table strandcue_private.protocol_execution_operations enable row level security;
alter table strandcue_private.protocol_execution_operations force row level security;

-- Owners may read their own executions and events while their account is
-- active. No insert/update/delete policy exists for authenticated.
create policy protocol_execution_read on public.protocol_executions for select to authenticated
  using (user_id = (select strandcue_private.request_uid())
     and exists (select 1 from public.profiles p
                  where p.user_id = (select strandcue_private.request_uid())
                    and p.account_status = 'active'));
create policy protocol_execution_event_read on public.protocol_execution_events for select to authenticated
  using (user_id = (select strandcue_private.request_uid())
     and exists (select 1 from public.profiles p
                  where p.user_id = (select strandcue_private.request_uid())
                    and p.account_status = 'active'));
-- Owner-confined maintenance access for the definer core only. Policies are
-- scoped per command to exactly the writes the core performs (executions:
-- SELECT/INSERT/UPDATE; events: SELECT/INSERT); there is deliberately no
-- DELETE or event-UPDATE path, and no cross-owner or anonymous path.
create policy protocol_execution_service_select on public.protocol_executions
  for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_service_insert on public.protocol_executions
  for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_service_update on public.protocol_executions
  for update to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()))
  with check (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_event_service_select on public.protocol_execution_events
  for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_event_service_insert on public.protocol_execution_events
  for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_operation_read on strandcue_private.protocol_execution_operations
  for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy protocol_execution_operation_append on strandcue_private.protocol_execution_operations
  for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));

create or replace function strandcue_private.forbid_decision_rewrite()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.decision is distinct from new.decision then
    raise exception 'decision-immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
alter function strandcue_private.forbid_decision_rewrite() owner to strandcue_mutator;

create trigger protocol_executions_decision_immutable
  before update on public.protocol_executions
  for each row execute function strandcue_private.forbid_decision_rewrite();

create or replace function strandcue_private.build_initial_execution(
  p_execution_id uuid, p_run_id uuid, p_decision jsonb, p_started_at timestamptz)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  step jsonb;
  steps jsonb := '[]'::jsonb;
  started text := to_jsonb(p_started_at) #>> '{}';
begin
  for step in select jsonb_array_elements(p_decision -> 'steps') loop
    steps := steps || jsonb_build_object(
      'stepId', step ->> 'stepId',
      'position', (step ->> 'position')::integer,
      'planned', jsonb_build_object(
        'stepId', step ->> 'stepId',
        'position', (step ->> 'position')::integer,
        'action', step ->> 'action',
        'productId', step -> 'productId',
        'productVersionId', step -> 'productVersionId',
        'toolId', step -> 'toolId',
        'toolVersionId', step -> 'toolVersionId',
        'waitSeconds', step -> 'waitSeconds',
        'rinse', step -> 'rinse',
        'reasons', coalesce(step -> 'reasons', '[]'::jsonb)),
      'state', 'pending',
      'confirmedAt', null,
      'deviation', null);
  end loop;
  return jsonb_build_object(
    'executionId', p_execution_id::text,
    'recommendationRunId', p_run_id::text,
    'startedAt', started,
    'updatedAt', started,
    'status', 'in_progress',
    'steps', steps,
    'finishedAt', null,
    'closeReason', null);
end;
$$;

create or replace function strandcue_private.start_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_decision jsonb, p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  existing_op strandcue_private.protocol_execution_operations%rowtype;
  existing public.protocol_executions%rowtype;
  request jsonb;
  execution jsonb;
  receipt jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_execution_id is null or p_recommendation_run_id is null
     or p_decision is null or p_started_at is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if octet_length(p_decision::text) > 262144 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  perform 1 from public.recommendation_runs
    where user_id = uid and request_id = p_recommendation_run_id;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;

  request := jsonb_build_object(
    'operationId', p_operation_id, 'executionId', p_execution_id,
    'recommendationRunId', p_recommendation_run_id,
    'decision', p_decision, 'startedAt', p_started_at);
  select * into existing_op from strandcue_private.protocol_execution_operations
    where user_id = uid and operation_id = p_operation_id;
  if found then
    if existing_op.request is distinct from request then
      raise exception 'operation-conflict' using errcode = '23505';
    end if;
    return existing_op.result;
  end if;

  if (p_decision ->> 'status') is distinct from 'ready' then
    raise exception 'not-ready-decision' using errcode = '22023';
  end if;
  if p_decision -> 'steps' is null or jsonb_typeof(p_decision -> 'steps') != 'array'
     or jsonb_array_length(p_decision -> 'steps') < 1 then
    raise exception 'empty-plan' using errcode = '22023';
  end if;

  select * into existing from public.protocol_executions
    where user_id = uid and execution_id = p_execution_id;
  if found then raise exception 'execution-conflict' using errcode = '23505'; end if;

  execution := strandcue_private.build_initial_execution(
    p_execution_id, p_recommendation_run_id, p_decision, p_started_at);

  insert into public.protocol_executions(
    user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
  values (uid, p_execution_id, p_recommendation_run_id, p_decision, execution, 0, 'in_progress')
  returning * into existing;

  insert into public.protocol_execution_events(user_id, execution_id, sequence, kind, command, revision)
  values (uid, p_execution_id, 1, 'started', jsonb_build_object('kind', 'start'), 0);

  receipt := jsonb_build_object(
    'executionId', existing.execution_id, 'recommendationRunId', existing.recommendation_run_id,
    'status', existing.status, 'revision', existing.revision,
    'updatedAt', existing.updated_at, 'createdAt', existing.created_at,
    'execution', existing.execution);
  insert into strandcue_private.protocol_execution_operations(user_id, operation_id, request, result)
  values (uid, p_operation_id, request, receipt);
  return receipt;
end;
$$;
alter function strandcue_private.start_execution(uuid, uuid, uuid, jsonb, timestamptz)
  owner to strandcue_mutator;

create or replace function strandcue_private.apply_execution_command(
  p_operation_id uuid, p_execution_id uuid, p_expected_revision integer,
  p_command jsonb, p_at timestamptz, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  kind text := p_command ->> 'kind';
  next_status text;
  expected_state text;
  expected_deviation jsonb;
  existing public.protocol_executions%rowtype;
  existing_op strandcue_private.protocol_execution_operations%rowtype;
  request jsonb;
  receipt jsonb;
  next_sequence integer;
  step jsonb;
  stored_ids jsonb;
  result_ids jsonb;
  nsteps integer;
  position integer;
  stored_step jsonb;
  result_step jsonb;
  resolved boolean;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_execution_id is null or p_expected_revision is null
     or p_command is null or p_at is null or p_result is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if octet_length(p_command::text) > 262144 or octet_length(p_result::text) > 262144 then
    raise exception 'payload-too-large' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into existing from public.protocol_executions
    where user_id = uid and execution_id = p_execution_id;
  if not found then raise exception 'execution-not-found' using errcode = '42501'; end if;
  perform 1 from public.recommendation_runs
    where user_id = uid and request_id = existing.recommendation_run_id;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;

  request := jsonb_build_object(
    'operationId', p_operation_id, 'executionId', p_execution_id,
    'expectedRevision', p_expected_revision, 'command', p_command,
    'at', p_at, 'result', p_result);
  select * into existing_op from strandcue_private.protocol_execution_operations
    where user_id = uid and operation_id = p_operation_id;
  if found then
    if existing_op.request is distinct from request then
      raise exception 'operation-conflict' using errcode = '23505';
    end if;
    return existing_op.result;
  end if;

  if existing.status in ('completed', 'abandoned') then
    raise exception 'execution-terminal' using errcode = '22023';
  end if;

  if kind in ('complete-step', 'skip-step', 'substitute-step', 'modify-step') then
    if existing.status is distinct from 'in_progress' then
      raise exception 'execution-not-active' using errcode = '22023';
    end if;
    step := null;
    select item.value into step
      from jsonb_array_elements(existing.execution -> 'steps') as item(value)
      where item.value ->> 'stepId' = (p_command ->> 'stepId') limit 1;
    if step is null then
      raise exception 'unknown-step' using errcode = '22023';
    end if;
    if (step ->> 'state') is distinct from 'pending' then
      raise exception 'step-already-resolved' using errcode = '22023';
    end if;
    next_status := 'in_progress';
  elsif kind = 'pause' then
    if existing.status is distinct from 'in_progress' then
      raise exception 'invalid-status-transition' using errcode = '22023';
    end if;
    next_status := 'paused';
  elsif kind = 'resume' then
    if existing.status is distinct from 'paused' then
      raise exception 'invalid-status-transition' using errcode = '22023';
    end if;
    next_status := 'in_progress';
  elsif kind = 'abandon' then
    if existing.status not in ('in_progress', 'paused') then
      raise exception 'invalid-status-transition' using errcode = '22023';
    end if;
    next_status := 'abandoned';
  elsif kind = 'complete' then
    if existing.status is distinct from 'in_progress' then
      raise exception 'invalid-status-transition' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(existing.execution -> 'steps') as item(value)
               where item.value ->> 'state' = 'pending') then
      raise exception 'pending-steps-remain' using errcode = '22023';
    end if;
    next_status := 'completed';
  else
    raise exception 'unknown-command' using errcode = '22023';
  end if;

  -- Result integrity: the caller-computed snapshot must be exactly the
  -- stored execution plus the commanded delta. Identities, order, envelope
  -- fields, and every untouched byte must match; the commanded step alone
  -- may move from pending to its terminal state with well-formed fields.
  -- Anything else raises result-mismatch with the stored state untouched.
  if (p_result ->> 'executionId') is distinct from p_execution_id::text
     or (p_result ->> 'recommendationRunId') is distinct from existing.recommendation_run_id::text
     or (p_result ->> 'status') is distinct from next_status
     or (p_result ->> 'startedAt')::timestamptz is distinct from
        (existing.execution ->> 'startedAt')::timestamptz then
    raise exception 'result-mismatch' using errcode = '22023';
  end if;
  select jsonb_agg(ordered.value ->> 'stepId' order by ordered.position) into stored_ids
    from jsonb_array_elements(existing.execution -> 'steps')
      with ordinality as ordered(value, position);
  select jsonb_agg(ordered.value ->> 'stepId' order by ordered.position) into result_ids
    from jsonb_array_elements(p_result -> 'steps')
      with ordinality as ordered(value, position);
  if stored_ids is distinct from result_ids then
    raise exception 'result-mismatch' using errcode = '22023';
  end if;
  nsteps := jsonb_array_length(existing.execution -> 'steps');

  if kind in ('complete-step', 'skip-step', 'substitute-step', 'modify-step') then
    expected_state := case kind
      when 'complete-step' then 'confirmed'
      when 'skip-step' then 'skipped'
      when 'substitute-step' then 'substituted'
      else 'modified' end;
    if kind = 'complete-step' then
      expected_deviation := 'null'::jsonb;
    elsif kind = 'skip-step' then
      expected_deviation := jsonb_build_object('kind', 'skip', 'reason', p_command ->> 'reason');
    elsif kind = 'substitute-step' then
      expected_deviation := jsonb_build_object('kind', 'substitute',
        'reason', p_command ->> 'reason', 'replacement', p_command -> 'replacement');
    else
      expected_deviation := jsonb_build_object('kind', 'modify',
        'reason', p_command ->> 'reason', 'detail', p_command ->> 'detail');
    end if;
    resolved := false;
    for position in 0..(nsteps - 1) loop
      stored_step := (existing.execution -> 'steps') -> position;
      result_step := (p_result -> 'steps') -> position;
      if (stored_step ->> 'stepId') is distinct from (p_command ->> 'stepId') then
        if result_step is distinct from stored_step then
          raise exception 'result-mismatch' using errcode = '22023';
        end if;
      else
        resolved := true;
        if (result_step ->> 'state') is distinct from expected_state
           or (result_step -> 'planned') is distinct from (stored_step -> 'planned')
           or (result_step ->> 'position') is distinct from (stored_step ->> 'position')
           or (result_step -> 'deviation') is distinct from expected_deviation
           or (p_result -> 'finishedAt') is distinct from 'null'::jsonb
           or (p_result -> 'closeReason') is distinct from (existing.execution -> 'closeReason') then
          raise exception 'result-mismatch' using errcode = '22023';
        end if;
        if kind = 'complete-step' then
          if (result_step ->> 'confirmedAt')::timestamptz is distinct from p_at then
            raise exception 'result-mismatch' using errcode = '22023';
          end if;
        elsif (result_step -> 'confirmedAt') is distinct from 'null'::jsonb then
          raise exception 'result-mismatch' using errcode = '22023';
        end if;
      end if;
    end loop;
    if not resolved then
      raise exception 'result-mismatch' using errcode = '22023';
    end if;
  else
    if (p_result -> 'steps') is distinct from (existing.execution -> 'steps') then
      raise exception 'result-mismatch' using errcode = '22023';
    end if;
    if kind in ('pause', 'resume') then
      if (p_result -> 'finishedAt') is distinct from 'null'::jsonb
         or (p_result -> 'closeReason') is distinct from (existing.execution -> 'closeReason') then
        raise exception 'result-mismatch' using errcode = '22023';
      end if;
    elsif kind = 'abandon' then
      if (p_result ->> 'finishedAt')::timestamptz is distinct from p_at
         or (p_result ->> 'closeReason') is distinct from (p_command ->> 'reason') then
        raise exception 'result-mismatch' using errcode = '22023';
      end if;
    else
      if (p_result ->> 'finishedAt')::timestamptz is distinct from p_at
         or (p_result -> 'closeReason') is distinct from 'null'::jsonb then
        raise exception 'result-mismatch' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Lost-update guard: the revision predicate makes the write conditional, so
  -- a stale expected revision updates zero rows instead of overwriting.
  update public.protocol_executions
    set execution = p_result, revision = existing.revision + 1,
        status = next_status, updated_at = now()
    where user_id = uid and execution_id = p_execution_id
      and revision = p_expected_revision
    returning * into existing;
  if not found then
    raise exception 'revision-conflict' using errcode = '23505';
  end if;

  select coalesce(max(sequence), 0) + 1 into next_sequence
    from public.protocol_execution_events
    where user_id = uid and execution_id = p_execution_id;
  insert into public.protocol_execution_events(user_id, execution_id, sequence, kind, command, revision)
  values (uid, p_execution_id, next_sequence, 'command', p_command, existing.revision);

  receipt := jsonb_build_object(
    'executionId', existing.execution_id, 'recommendationRunId', existing.recommendation_run_id,
    'status', existing.status, 'revision', existing.revision,
    'updatedAt', existing.updated_at, 'createdAt', existing.created_at,
    'execution', existing.execution);
  insert into strandcue_private.protocol_execution_operations(user_id, operation_id, request, result)
  values (uid, p_operation_id, request, receipt);
  return receipt;
end;
$$;
alter function strandcue_private.apply_execution_command(uuid, uuid, integer, jsonb, timestamptz, jsonb)
  owner to strandcue_mutator;

create or replace function strandcue_private.get_active_execution()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  existing public.protocol_executions%rowtype;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into existing from public.protocol_executions
    where user_id = uid and status in ('in_progress', 'paused')
    order by created_at desc, id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'executionId', existing.execution_id, 'recommendationRunId', existing.recommendation_run_id,
    'status', existing.status, 'revision', existing.revision,
    'updatedAt', existing.updated_at, 'createdAt', existing.created_at,
    'execution', existing.execution);
end;
$$;
alter function strandcue_private.get_active_execution() owner to strandcue_mutator;

create or replace function strandcue_private.list_executions(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  items jsonb;
  last_created timestamptz;
  last_id uuid;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid-limit' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(row order by row.created_at desc, row.id desc), '[]'::jsonb) into items
  from (
    select jsonb_build_object(
        'executionId', e.execution_id, 'recommendationRunId', e.recommendation_run_id,
        'status', e.status, 'revision', e.revision,
        'updatedAt', e.updated_at, 'createdAt', e.created_at,
        'execution', e.execution) as row,
      e.created_at, e.id
    from public.protocol_executions e
    where e.user_id = uid
      and (p_cursor is null or p_cursor = 'null'::jsonb
        or (e.created_at, e.id) < ((p_cursor ->> 'createdAt')::timestamptz, (p_cursor ->> 'id')::uuid))
    order by e.created_at desc, e.id desc
    limit p_limit + 1
  ) as row;
  if jsonb_array_length(items) > p_limit then
    select jsonb_agg(element.value order by element.position) into items
      from jsonb_array_elements(items) with ordinality as element(value, position)
      where element.position <= p_limit;
    select e.created_at, e.id into last_created, last_id
      from public.protocol_executions e
      where e.user_id = uid
        and (p_cursor is null or p_cursor = 'null'::jsonb
          or (e.created_at, e.id) < ((p_cursor ->> 'createdAt')::timestamptz, (p_cursor ->> 'id')::uuid))
      order by e.created_at desc, e.id desc
      limit 1 offset (p_limit - 1);
    return jsonb_build_object('items', items,
      'nextCursor', jsonb_build_object(
        'createdAt', to_jsonb(last_created) #>> '{}', 'id', last_id::text));
  end if;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;
alter function strandcue_private.list_executions(integer, jsonb) owner to strandcue_mutator;

create or replace function public.start_protocol_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_decision jsonb, p_started_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.start_execution(
    p_operation_id, p_execution_id, p_recommendation_run_id, p_decision, p_started_at);
end;
$$;

create or replace function public.apply_protocol_execution_command(
  p_operation_id uuid, p_execution_id uuid, p_expected_revision integer,
  p_command jsonb, p_at timestamptz, p_result jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.apply_execution_command(
    p_operation_id, p_execution_id, p_expected_revision, p_command, p_at, p_result);
end;
$$;

create or replace function public.get_active_protocol_execution()
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.get_active_execution();
end;
$$;

create or replace function public.list_protocol_executions(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_executions(p_limit, p_cursor);
end;
$$;

revoke all on function strandcue_private.forbid_decision_rewrite() from public, anon, authenticated;
revoke all on function strandcue_private.build_initial_execution(uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function strandcue_private.build_initial_execution(uuid, uuid, jsonb, timestamptz)
  to strandcue_mutator;
revoke all on function strandcue_private.start_execution(uuid, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
-- The public wrappers are SECURITY INVOKER, so the authenticated caller needs
-- EXECUTE on the core as well. Isolation does not depend on hiding it: the
-- core re-derives the owner from request_uid() and re-checks authentication,
-- account status, and run ownership itself.
grant execute on function strandcue_private.start_execution(uuid, uuid, uuid, jsonb, timestamptz)
  to authenticated, strandcue_mutator;
revoke all on function strandcue_private.apply_execution_command(uuid, uuid, integer, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function strandcue_private.apply_execution_command(uuid, uuid, integer, jsonb, timestamptz, jsonb)
  to authenticated, strandcue_mutator;
revoke all on function strandcue_private.get_active_execution() from public, anon, authenticated;
grant execute on function strandcue_private.get_active_execution() to authenticated, strandcue_mutator;
revoke all on function strandcue_private.list_executions(integer, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.list_executions(integer, jsonb) to authenticated, strandcue_mutator;
revoke all on function public.start_protocol_execution(uuid, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.start_protocol_execution(uuid, uuid, uuid, jsonb, timestamptz)
  to authenticated;
revoke all on function public.apply_protocol_execution_command(uuid, uuid, integer, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_protocol_execution_command(uuid, uuid, integer, jsonb, timestamptz, jsonb)
  to authenticated;
revoke all on function public.get_active_protocol_execution() from public, anon, authenticated;
grant execute on function public.get_active_protocol_execution() to authenticated;
revoke all on function public.list_protocol_executions(integer, jsonb) from public, anon, authenticated;
grant execute on function public.list_protocol_executions(integer, jsonb) to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke all on table public.protocol_executions from public, anon, authenticated;
grant select on table public.protocol_executions to authenticated;
grant select, insert, update on table public.protocol_executions to strandcue_mutator;
revoke all on table public.protocol_execution_events from public, anon, authenticated;
grant select on table public.protocol_execution_events to authenticated;
grant select, insert on table public.protocol_execution_events to strandcue_mutator;
revoke all on table strandcue_private.protocol_execution_operations from public, anon, authenticated;
grant select, insert on table strandcue_private.protocol_execution_operations to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

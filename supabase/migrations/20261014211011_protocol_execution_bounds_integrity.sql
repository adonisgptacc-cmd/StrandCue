-- Task 7 (DB-001/DB-002/DB-003/DB-004 + Task-4 minor): bound and harden
-- protocol persistence.
--
-- What this migration adds, and the documented number behind each choice:
--
-- 1. LIMITS (DB-001). Every bound below is a defensible constant, not a
--    guess about production traffic: each is set at >=10x headroom over the
--    largest legitimate use visible in this repository (routines carry a
--    handful of steps; the fixtures carry 2), while turning unbounded
--    growth into a stable fail-closed code.
--    - Non-terminal executions per owner: 10 (status in ('in_progress',
--      'paused')). An owner legitimately holds a few paused routines next
--      to the active one; 10 gives headroom while capping a start-spamming
--      caller. Terminal (completed/abandoned) executions never count, so a
--      finished routine frees its slot. New stable code:
--      'too-many-active-executions'.
--    - Total events per execution: 500 (sequence cap). A routine resolves
--      each step once plus a handful of pause/resume/abandon/complete
--      events, i.e. dozens of events at most; 500 is >10x headroom and
--      stops an infinite pause/resume hammer from growing history without
--      bound. New stable code: 'too-many-events'.
--    - Steps per execution: 200. Human routines are single-digit steps;
--      200 bounds the snapshot-build loop and per-step construction cost
--      while staying far above any realistic routine, and converts what
--      would otherwise surface as a raw CHECK failure on the 256 KiB
--      execution column into a stable code. New stable code:
--      'too-many-steps'.
--    - Sizes the cores never bound (defense in depth; the cores already cap
--      command/reason/detail/decision/execution): operations request and
--      result at 512 KiB each (2x the largest single bounded field they can
--      wrap, so no legitimate receipt can trip them) and events.command at
--      256 KiB (mirrors the core's command cap). Violations keep the
--      existing 'payload-too-large' code path for core checks and surface
--      as CHECK failures (23514) for direct maintenance writes.
--    - Deliberately NOT count-capped: protocol_execution_operations rows.
--      Each start/transition mints one row as the idempotency ledger, so a
--      count cap would eventually refuse legitimate work. Ledger rows are
--      size-bounded instead, and terminal-execution receipts become
--      eligible for compaction under the retention policy below (Task 13).
--
-- 2. CONCURRENCY (DB-002). Both cores reserve (user_id, operation_id) with
--    pg_advisory_xact_lock BEFORE the replay SELECT, using the identical
--    key derivation hashtext('protocol-execution-op') /
--    hashtext(uid || ':' || operation_id) in both cores. Scope is
--    transactional (one key per owner+operation, auto-released at
--    COMMIT/ROLLBACK with no manual unlock and no leak on error), so two
--    concurrent retries of the same operation serialize: the loser blocks
--    until the winner commits, then its replay SELECT reads the committed
--    receipt and returns it instead of colliding on the operations primary
--    key with a raw 23505. Lock ordering is deadlock-free: start takes the
--    run-row lock first and the advisory lock second; transition takes no
--    row lock before the advisory lock, so no two paths wait in opposite
--    order. PGlite runs a single backend, so two sessions cannot block
--    against each other in tests; the tests prove the lock is actually
--    held (pg_locks, RED without the reservation) and that concurrent
--    same-op callers converge on one receipt with one row/event set.
--
-- 3. RELATIONAL INTEGRITY (DB-003). Real composite foreign keys, plain
--    (fully validated at creation, not NOT VALID):
--    - protocol_executions(user_id, recommendation_run_id) REFERENCES
--      recommendation_runs(user_id, request_id) ON DELETE CASCADE. The
--      referenced pair is the existing UNIQUE(user_id, request_id); the
--      run side names the run's REQUEST_ID, never its pk id, matching the
--      interface contract pinned since Task 3.
--    - protocol_execution_events(user_id, execution_id) REFERENCES
--      protocol_executions(user_id, execution_id) ON DELETE CASCADE. The
--      referenced pair is the existing UNIQUE(user_id, execution_id).
--    Plain FKs are safe because every PGlite database is built by replaying
--    this chain onto empty tables (the harness and the migration_admin
--    replay both start empty), so there is no backfill to scan and nothing
--    to leave NOT VALID. ON DELETE CASCADE in both cases matches the
--    existing deletion policy: profiles rows own runs, executions, events,
--    and operations rows, and owner deletion must purge everything (a
--    parent delete never strands a child and never blocks owner deletion).
--    Proven by test: deleting the profile empties all four tables.
--
-- 4. SKEW (DB-004). p_started_at / p_at are CLAIMED event times and must
--    sit inside +5 minutes / -24 hours around server now()
--    ('timestamp-out-of-range', errcode 22023). Rationale, documented so
--    reviewers need not guess: +5 minutes absorbs worst-case phone-clock
--    drift the way Kerberos/AWS SigV4-style 5-minute skew conventions do,
--    without letting callers future-date history; -24 hours lets an owner
--    finish steps offline (no signal) and sync later the same day, while
--    older timestamps are history-shaping (the SC-003 residual this closes).
--    The window is measured against the server transaction clock (now(),
--    the same clock that stamps updatedAt/recorded_at). Position: in the
--    start core after the replay early-return and before the stored-decision
--    checks; in the transition core after the replay early-return, at the
--    head of the command-shape section (after the terminal guard, before
--    state-machine legality) — i.e. shelf verification keeps its pinned
--    shape position and every pre-existing precedence is unchanged. Replay
--    stays FIRST in both cores so retrying a previously accepted operation
--    still replays even after its timestamp has aged out of the window.
--    Receipt times are NOT new columns: events.recorded_at and
--    operations.created_at already DEFAULT now() and are hereby confirmed
--    as the server receipt times (claimed time lives in the snapshot's
--    startedAt/confirmedAt/finishedAt; receipt time lives in the row
--    columns). updatedAt stays server now() as before.
--
-- 5. TASK-4 MINOR, carried: `complete` now forces closeReason null in the
--    migrated transition construction (one line), matching the domain's
--    pure applyExecutionCommand. Previously the non-abandon branch carried
--    the stored closeReason over; unreachable via the cores (only abandon
--    writes a non-null closeReason, and terminal rows cannot complete),
--    but a maintenance-planted in_progress row with a stale closeReason
--    now normalizes to null exactly like the domain preview.
--
-- 6. RETENTION (policy documentation; enforcement is Increment 2/Task 13).
--    No purge worker is built here. The documented policy a future worker
--    must follow lives in docs/runbooks/protocol-execution-persistence.md:
--    terminal executions become purge-eligible 90 days after finishedAt
--    (abandoned: 30 days), non-terminal rows are never eligible, purge
--    order is events -> operations (matched via request->>'executionId')
--    -> executions (which cascades remaining events), and the worker must
--    freeze time in tests and prove active/legal-hold rows survive.
--
-- Check order after this migration (unchanged precedence, additions noted):
-- start: authentication, active account, owned run locked with FOR UPDATE
-- (run-not-owned), operation reservation lock + idempotent replay,
-- timestamp skew, active-execution cap, stored-decision shape/trust/steps
-- (malformed-protocol / not-ready-decision / untrusted-decision /
-- empty-plan / too-many-steps), execution-id uniqueness
-- (execution-conflict). transition: authentication, active account, owned
-- execution row, owned run (run-not-owned), operation reservation lock +
-- idempotent replay, terminal guard (execution-terminal), timestamp skew,
-- command shape incl. shelf verification (unknown-command /
-- invalid-command / text-too-large / unknown-shelf-item /
-- archived-shelf-item / unknown-product-version), state-machine legality,
-- revision compare-and-swap (revision-conflict), event sequence cap
-- (too-many-events).
--
-- No new grants, policies, or roles: the cores reuse the existing mutator
-- table grants, and the foreign keys add integrity without opening reads.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- DB-003: composite integrity with the same cascade policy as the profiles
-- chain (owner deletion purges everything; children never strand or block).
alter table public.protocol_executions
  add constraint protocol_executions_run_fk
  foreign key (user_id, recommendation_run_id)
  references public.recommendation_runs (user_id, request_id)
  on delete cascade;
alter table public.protocol_execution_events
  add constraint protocol_execution_events_execution_fk
  foreign key (user_id, execution_id)
  references public.protocol_executions (user_id, execution_id)
  on delete cascade;

-- DB-001: size caps the cores never bound. Operations request/result at
-- 512 KiB (2x headroom over the largest wrappable bounded field);
-- events.command mirrors the core's 256 KiB command cap.
alter table public.protocol_execution_events
  add constraint protocol_execution_events_command_size
  check (octet_length(command::text) <= 262144);
alter table strandcue_private.protocol_execution_operations
  add constraint protocol_execution_operations_request_size
  check (octet_length(request::text) <= 524288),
  add constraint protocol_execution_operations_result_size
  check (octet_length(result::text) <= 524288);

create or replace function strandcue_private.start_execution(
  p_operation_id uuid, p_execution_id uuid, p_recommendation_run_id uuid,
  p_started_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  run public.recommendation_runs%rowtype;
  stored jsonb;
  step jsonb;
  existing public.protocol_executions%rowtype;
  existing_op strandcue_private.protocol_execution_operations%rowtype;
  request jsonb;
  execution jsonb;
  receipt jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_execution_id is null or p_recommendation_run_id is null
     or p_started_at is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  -- Owned-run verification happens FIRST, before any execution write. The
  -- argument names the run's request_id, not its primary-key id. FOR UPDATE
  -- locks the run row for the checks below.
  select * into run from public.recommendation_runs
    where user_id = uid and request_id = p_recommendation_run_id for update;
  if not found then raise exception 'run-not-owned' using errcode = '42501'; end if;

  -- Operation reservation (DB-002): transaction-scoped advisory lock on
  -- (owner, operation) BEFORE the replay SELECT. A concurrent retry of the
  -- same operation blocks here until the winner commits, then replays the
  -- committed receipt instead of colliding on the operations primary key.
  -- Released automatically at COMMIT/ROLLBACK; lock order (run row first,
  -- advisory second) cannot deadlock against the transition core, which
  -- takes no row lock before its own reservation.
  perform pg_advisory_xact_lock(
    hashtext('protocol-execution-op'),
    hashtext(uid::text || ':' || p_operation_id::text));

  -- The stored request carries no caller decision: there is nothing for the
  -- caller to vary, so identical operation ids always replay identically.
  request := jsonb_build_object(
    'operationId', p_operation_id, 'executionId', p_execution_id,
    'recommendationRunId', p_recommendation_run_id,
    'startedAt', p_started_at);
  select * into existing_op from strandcue_private.protocol_execution_operations
    where user_id = uid and operation_id = p_operation_id;
  if found then
    if existing_op.request is distinct from request then
      raise exception 'operation-conflict' using errcode = '23505';
    end if;
    return existing_op.result;
  end if;

  -- Caller-time skew (DB-004): p_started_at is a CLAIMED event time, not
  -- receipt time. It must sit inside +5 minutes / -24 hours around server
  -- now() (rationale in the header). After the replay early-return above,
  -- so retries of accepted operations still replay once aged out.
  if p_started_at > now() + interval '5 minutes'
     or p_started_at < now() - interval '24 hours' then
    raise exception 'timestamp-out-of-range' using errcode = '22023';
  end if;

  -- Per-owner bound (DB-001): at most 10 non-terminal executions. Terminal
  -- rows never count, so finishing a routine frees its slot.
  if (select count(*) from public.protocol_executions
      where user_id = uid and status in ('in_progress', 'paused')) >= 10 then
    raise exception 'too-many-active-executions' using errcode = '22023';
  end if;

  stored := run.decision;
  if stored is null or jsonb_typeof(stored) != 'object' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if (stored ->> 'status') is distinct from 'ready' then
    raise exception 'not-ready-decision' using errcode = '22023';
  end if;
  if run.trusted is not true then
    raise exception 'untrusted-decision' using errcode = '22023';
  end if;
  if stored -> 'steps' is null or jsonb_typeof(stored -> 'steps') != 'array' then
    raise exception 'malformed-protocol' using errcode = '22023';
  end if;
  if jsonb_array_length(stored -> 'steps') < 1 then
    raise exception 'empty-plan' using errcode = '22023';
  end if;
  -- Per-execution step bound (DB-001): far above any human routine, and it
  -- converts an oversized plan into a stable code instead of a raw CHECK
  -- failure on the 256 KiB execution column at insert time.
  if jsonb_array_length(stored -> 'steps') > 200 then
    raise exception 'too-many-steps' using errcode = '22023';
  end if;
  for step in select jsonb_array_elements(stored -> 'steps') loop
    if jsonb_typeof(step) != 'object'
       or step ->> 'stepId' is null or length(step ->> 'stepId') < 1
       or step ->> 'position' is null
       or (step ->> 'position') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'malformed-protocol' using errcode = '22023';
    end if;
  end loop;

  select * into existing from public.protocol_executions
    where user_id = uid and execution_id = p_execution_id;
  if found then raise exception 'execution-conflict' using errcode = '23505'; end if;

  -- The initial snapshot derives SOLELY from the stored trusted decision.
  execution := strandcue_private.build_initial_execution(
    p_execution_id, p_recommendation_run_id, stored, p_started_at);

  insert into public.protocol_executions(
    user_id, execution_id, recommendation_run_id, decision, execution, revision, status)
  values (uid, p_execution_id, p_recommendation_run_id, stored, execution, 0, 'in_progress')
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
alter function strandcue_private.start_execution(uuid, uuid, uuid, timestamptz)
  owner to strandcue_mutator;

create or replace function strandcue_private.apply_execution_command(
  p_operation_id uuid, p_execution_id uuid, p_expected_revision integer,
  p_command jsonb, p_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  kind text := p_command ->> 'kind';
  cmd_keys text[];
  allowed_keys text[];
  next_status text;
  expected_state text;
  new_deviation jsonb;
  step_id text := p_command ->> 'stepId';
  reason text := p_command ->> 'reason';
  detail text := p_command ->> 'detail';
  replacement jsonb := p_command -> 'replacement';
  rep_keys text[];
  v_shelf_id uuid;
  shelf_row public.user_products%rowtype;
  version_row public.product_versions%rowtype;
  existing public.protocol_executions%rowtype;
  existing_op strandcue_private.protocol_execution_operations%rowtype;
  request jsonb;
  receipt jsonb;
  next_sequence integer;
  step jsonb;
  v_now timestamptz := now();
  new_steps jsonb := '[]'::jsonb;
  new_execution jsonb;
  stored_step jsonb;
  new_step jsonb;
  nsteps integer;
  position integer;
  resolved boolean;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_execution_id is null or p_expected_revision is null
     or p_command is null or p_at is null then
    raise exception 'invalid-operation' using errcode = '22023';
  end if;
  if octet_length(p_command::text) > 262144 then
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

  -- Operation reservation (DB-002): same key derivation as the start core,
  -- so a concurrent retry of the same operation serializes here and replays
  -- the winner's receipt instead of colliding on the operations PK.
  perform pg_advisory_xact_lock(
    hashtext('protocol-execution-op'),
    hashtext(uid::text || ':' || p_operation_id::text));

  -- The stored request carries no caller snapshot: there is nothing for the
  -- caller to vary, so identical operation ids always replay identically.
  request := jsonb_build_object(
    'operationId', p_operation_id, 'executionId', p_execution_id,
    'expectedRevision', p_expected_revision, 'command', p_command,
    'at', p_at);
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

  -- Caller-time skew (DB-004): p_at is a CLAIMED event time. It must sit
  -- inside +5 minutes / -24 hours around server now() (rationale in the
  -- header). Positioned at the head of the command-shape section — after
  -- the terminal guard, before state-machine legality — so every
  -- pre-existing precedence is unchanged, and after the replay
  -- early-return above so accepted-operation retries still replay.
  if p_at > now() + interval '5 minutes'
     or p_at < now() - interval '24 hours' then
    raise exception 'timestamp-out-of-range' using errcode = '22023';
  end if;

  -- Command shape: the kind allowlist is exact, and every kind accepts an
  -- exact set of top-level keys. Anything else fails closed here, before
  -- any state-machine or construction logic runs.
  if jsonb_typeof(p_command) != 'object' then
    raise exception 'invalid-command' using errcode = '22023';
  end if;
  select array_agg(k order by k) into cmd_keys from jsonb_object_keys(p_command) k;
  if kind = 'complete-step' then
    allowed_keys := array['kind', 'stepId'];
  elsif kind = 'skip-step' then
    allowed_keys := array['kind', 'reason', 'stepId'];
  elsif kind = 'substitute-step' then
    allowed_keys := array['kind', 'reason', 'replacement', 'stepId'];
  elsif kind = 'modify-step' then
    allowed_keys := array['detail', 'kind', 'reason', 'stepId'];
  elsif kind = 'pause' then
    allowed_keys := array['kind'];
  elsif kind = 'resume' then
    allowed_keys := array['kind'];
  elsif kind = 'abandon' then
    allowed_keys := array['kind', 'reason'];
  elsif kind = 'complete' then
    allowed_keys := array['kind'];
  else
    raise exception 'unknown-command' using errcode = '22023';
  end if;
  if cmd_keys is distinct from allowed_keys then
    raise exception 'invalid-command' using errcode = '22023';
  end if;

  -- Bounded fields: identifiers are short non-empty text, deviation free
  -- text is capped at 2 KiB (octets). The substitute replacement names one
  -- owned shelf item; ownership, membership, and the referenced catalogue
  -- version are verified here, in the shape position, before any
  -- state-machine or construction logic runs.
  if kind in ('complete-step', 'skip-step', 'substitute-step', 'modify-step') then
    if step_id is null or length(trim(both from step_id)) < 1
       or octet_length(step_id) > 256 then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
  end if;
  if kind in ('skip-step', 'substitute-step', 'modify-step', 'abandon') then
    if reason is null or length(trim(both from reason)) < 1 then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
    if octet_length(reason) > 2048 then
      raise exception 'text-too-large' using errcode = '22023';
    end if;
  end if;
  if kind = 'modify-step' then
    if detail is null or length(trim(both from detail)) < 1 then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
    if octet_length(detail) > 2048 then
      raise exception 'text-too-large' using errcode = '22023';
    end if;
  end if;
  if kind = 'substitute-step' then
    if replacement is null or jsonb_typeof(replacement) != 'object' then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
    select array_agg(k order by k) into rep_keys from jsonb_object_keys(replacement) k;
    if rep_keys is distinct from array['shelfItemId'] then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
    begin
      v_shelf_id := (replacement ->> 'shelfItemId')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'invalid-command' using errcode = '22023';
    end;
    if v_shelf_id is null then
      raise exception 'invalid-command' using errcode = '22023';
    end if;
    -- Owner-shelf verification: the row must exist with owner = uid. A
    -- missing row and another owner's row share one code (no enumeration).
    select * into shelf_row from public.user_products
      where id = v_shelf_id and owner = uid;
    if not found then
      raise exception 'unknown-shelf-item' using errcode = '22023';
    end if;
    if shelf_row.availability = 'archived' then
      raise exception 'archived-shelf-item' using errcode = '22023';
    end if;
    if shelf_row.version_id is null then
      raise exception 'unknown-product-version' using errcode = '22023';
    end if;
    select * into version_row from public.product_versions
      where id = shelf_row.version_id;
    if not found then
      raise exception 'unknown-product-version' using errcode = '22023';
    end if;
  end if;

  -- State-machine legality, unchanged from the previous core.
  if kind in ('complete-step', 'skip-step', 'substitute-step', 'modify-step') then
    if existing.status is distinct from 'in_progress' then
      raise exception 'execution-not-active' using errcode = '22023';
    end if;
    step := null;
    select item.value into step
      from jsonb_array_elements(existing.execution -> 'steps') as item(value)
      where item.value ->> 'stepId' = step_id limit 1;
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
  end if;

  -- Server-side construction: the next snapshot derives solely from the
  -- stored row, the validated command, the verified shelf rows, p_at, and
  -- the server clock. Owner, run, protocol identities and startedAt come
  -- from the stored row, never from the command; updatedAt is server-owned
  -- (v_now). The substitute replacement is built from the verified shelf
  -- and version rows — `owned: true` below is verified proof, never a
  -- carried-through caller claim.
  nsteps := jsonb_array_length(existing.execution -> 'steps');
  if kind in ('complete-step', 'skip-step', 'substitute-step', 'modify-step') then
    expected_state := case kind
      when 'complete-step' then 'confirmed'
      when 'skip-step' then 'skipped'
      when 'substitute-step' then 'substituted'
      else 'modified' end;
    if kind = 'complete-step' then
      new_deviation := 'null'::jsonb;
    elsif kind = 'skip-step' then
      new_deviation := jsonb_build_object('kind', 'skip', 'reason', reason);
    elsif kind = 'substitute-step' then
      new_deviation := jsonb_build_object('kind', 'substitute',
        'reason', reason,
        'replacement', jsonb_build_object(
          'shelfItemId', shelf_row.id,
          'productId', version_row.product_id,
          'productVersionId', version_row.id,
          'availability', shelf_row.availability,
          'owned', true));
    else
      new_deviation := jsonb_build_object('kind', 'modify',
        'reason', reason, 'detail', detail);
    end if;
    resolved := false;
    for position in 0..(nsteps - 1) loop
      stored_step := (existing.execution -> 'steps') -> position;
      if (stored_step ->> 'stepId') is distinct from step_id then
        new_steps := new_steps || stored_step;
      else
        resolved := true;
        new_step := jsonb_build_object(
          'stepId', stored_step ->> 'stepId',
          'position', stored_step -> 'position',
          'planned', stored_step -> 'planned',
          'state', expected_state,
          'confirmedAt', case when kind = 'complete-step' then to_jsonb(p_at) else 'null'::jsonb end,
          'deviation', new_deviation);
        new_steps := new_steps || new_step;
      end if;
    end loop;
    if not resolved then
      raise exception 'unknown-step' using errcode = '22023';
    end if;
    new_execution := jsonb_build_object(
      'executionId', p_execution_id::text,
      'recommendationRunId', existing.recommendation_run_id::text,
      'startedAt', existing.execution -> 'startedAt',
      'updatedAt', to_jsonb(v_now) #>> '{}',
      'status', next_status,
      'steps', new_steps,
      'finishedAt', existing.execution -> 'finishedAt',
      'closeReason', existing.execution -> 'closeReason');
  else
    -- Task-4 minor carried: `complete` forces closeReason null exactly like
    -- the domain's pure applyExecutionCommand; only `abandon` writes the
    -- command reason through.
    new_execution := jsonb_build_object(
      'executionId', p_execution_id::text,
      'recommendationRunId', existing.recommendation_run_id::text,
      'startedAt', existing.execution -> 'startedAt',
      'updatedAt', to_jsonb(v_now) #>> '{}',
      'status', next_status,
      'steps', existing.execution -> 'steps',
      'finishedAt', case when kind in ('abandon', 'complete')
        then to_jsonb(p_at) else (existing.execution -> 'finishedAt') end,
      'closeReason', case when kind = 'abandon'
        then to_jsonb(reason) when kind = 'complete'
        then 'null'::jsonb else (existing.execution -> 'closeReason') end);
  end if;

  -- Per-execution event bound (DB-001): the next sequence is computed before
  -- the guarded update, so an otherwise-legal command that would exceed 500
  -- total events fails here with the stored row untouched.
  select coalesce(max(sequence), 0) + 1 into next_sequence
    from public.protocol_execution_events
    where user_id = uid and execution_id = p_execution_id;
  if next_sequence > 500 then
    raise exception 'too-many-events' using errcode = '22023';
  end if;

  -- Lost-update guard: the revision predicate makes the write conditional, so
  -- a stale expected revision updates zero rows instead of overwriting.
  update public.protocol_executions
    set execution = new_execution, revision = existing.revision + 1,
        status = next_status, updated_at = v_now
    where user_id = uid and execution_id = p_execution_id
      and revision = p_expected_revision
    returning * into existing;
  if not found then
    raise exception 'revision-conflict' using errcode = '23505';
  end if;

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
alter function strandcue_private.apply_execution_command(uuid, uuid, integer, jsonb, timestamptz)
  owner to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

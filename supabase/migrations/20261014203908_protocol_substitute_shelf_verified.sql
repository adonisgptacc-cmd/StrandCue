-- SC-004: substitute-step names an owned shelf item; the server verifies it.
--
-- Until this migration the substitute UI let the caller name ANY product and
-- version ids with self-asserted `owned: true`, and the Task-4 core carried
-- that claim through unverified (its header documents this deferral). That
-- is the hole closed here. After this migration:
--
-- - The command replacement is exactly `{shelfItemId}` (one owned
--   user_products.id). The old free-form shape ({productId,
--   productVersionId, owned}) is a shape migration, NOT a silent
--   reinterpret: it fails with invalid-command like any other unknown key
--   set, including `owned: false` (which previously raised
--   unowned-substitution under the old contract).
-- - The definer core verifies, at command time with an explicit owner
--   predicate (isolation is re-checked inside from request_uid(), matching
--   every other core):
--   (1) the shelf row exists with owner = uid. A missing row and another
--       owner's row share ONE stable code (unknown-shelf-item) so the
--       failure reveals nothing about whether the item exists elsewhere
--       (no enumeration oracle).
--   (2) active/non-deleted membership from the actual availability column
--       semantics (20260924180000_user_products.sql): `archived` means gone
--       and fails with archived-shelf-item. RULING: `out_of_stock` is still
--       owned, so it is allowed with its availability RECORDED in the
--       deviation — the history stays honest about what was substituted.
--   (3) the shelf row's version_id references an existing product_versions
--       row. A manual-only item (version_id null) and a missing version row
--       both fail with unknown-product-version. The missing-row check is
--       defense in depth: RESTRICT normally makes it unreachable, but the
--       core still fails closed rather than trusting the link.
--   (4) protocol capability constraint: the substitute must resolve a
--       concrete catalogue version (rule 3 above). No same-category /
--       same-capability matching is enforced, and this is a stated
--       limitation, not an oversight: the stored step's planned product
--       references (productId/productVersionId) are engine-internal free
--       text with no verified catalogue join (products.category exists but
--       cannot be reliably joined from a free-text reference), so any
--       category check would accept or reject the same command depending on
--       id formatting. Likewise a retired lifecycle is still a concrete
--       owned version and is allowed: lifecycle is catalogue merchandising,
--       not a safety dimension, and inventing a safety meaning for it would
--       be overreach.
-- - The core CONSTRUCTS the stored deviation replacement from the verified
--   rows: {shelfItemId, productId, productVersionId, availability, owned}.
--   Resolution: `owned: true` in a stored deviation is now VERIFIED proof
--   from the owner-shelf lookup, not a carried-through caller claim.
--
-- Verification runs in the command-shape position (where the old
-- unowned-substitution check sat), i.e. BEFORE the state-machine legality
-- checks: a terminal execution plus a bad shelf reference surfaces the
-- shelf code, and shape errors still precede state errors exactly as in
-- Task 4. No revision gate on the shelf row: the row is read (not locked)
-- with the owner predicate. The residual TOCTOU window (owner archives the
-- item between the check and the write) is accepted deliberately — the only
-- party that can archive the row is the owner themselves, so the window
-- cannot forge another owner's supply; the threat this closes is
-- cross-owner forgery, which the owner predicate eliminates.
--
-- No new grants: the core reuses the existing mutator SELECT grants on
-- public.user_products (owner-scoped RLS policy) and
-- public.product_versions (catalogue mutator read). The public wrapper
-- signature is unchanged and is not touched.
--
-- This migration is PGlite-local only and must never be applied to hosted
-- Supabase by hand.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

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
        then to_jsonb(reason) else (existing.execution -> 'closeReason') end);
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
alter function strandcue_private.apply_execution_command(uuid, uuid, integer, jsonb, timestamptz)
  owner to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

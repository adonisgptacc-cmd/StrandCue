-- Activity immutable RPC — record / correct / void with operation-key idempotency and void audit

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

-- helper to validate zones and future date
create or replace function strandcue_private.validate_activity_zones(p_zones jsonb)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb;
begin
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then raise exception 'invalid-zones' using errcode = '22023'; end if;
  for item in select * from jsonb_array_elements(p_zones) loop
    if jsonb_typeof(item) <> 'object' or not (item ? 'region' and item ? 'segment') then raise exception 'invalid-zones' using errcode = '22023'; end if;
    if item->>'region' not in ('whole_head','front','crown','nape','other','unknown') then raise exception 'invalid-zones' using errcode = '22023'; end if;
    if item->>'segment' not in ('entire_strand','roots','mid_lengths','ends','other','unknown') then raise exception 'invalid-zones' using errcode = '22023'; end if;
  end loop;
end;
$$;

create or replace function strandcue_private.activity_effective_interval(p_precision text, p_occurred_at timestamptz)
returns table(start_date date, end_date date) language plpgsql stable security invoker set search_path = '' as $$
declare d date := (p_occurred_at at time zone 'Africa/Johannesburg')::date;
begin
  if p_precision = 'unknown' then
    start_date := null; end_date := null;
  elsif p_precision = 'exact_day' then
    start_date := d; end_date := d;
  elsif p_precision = 'exact_month' then
    start_date := date_trunc('month', d)::date; end_date := (date_trunc('month', d) + interval '1 month -1 day')::date;
  elsif p_precision = 'exact_year' then
    start_date := date_trunc('year', d)::date; end_date := (date_trunc('year', d) + interval '1 year -1 day')::date;
  else raise exception 'invalid-precision' using errcode = '22023';
  end if;
  if p_precision <> 'unknown' and d > (now() at time zone 'Africa/Johannesburg')::date then
    raise exception 'invalid-effective-date' using errcode = '22023';
  end if;
  return next;
end;
$$;

-- core mutate for activities (used by record/correct/void wrappers)
create or replace function strandcue_private.mutate_activity(
  p_operation_id uuid,
  p_activity_id uuid,
  p_expected_revision integer,
  p_kind text,
  p_occurred_at timestamptz,
  p_precision text,
  p_zones jsonb,
  p_notes text,
  p_corrects_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.activity_operations%rowtype;
  act public.activities%rowtype;
  rev_id uuid := gen_random_uuid();
  eff record;
  patch jsonb;
  result jsonb;
  is_void boolean := (p_kind = 'void');
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_activity_id is null or p_expected_revision is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_kind not in ('baseline','change','correction','void') then raise exception 'invalid-kind' using errcode = '22023'; end if;
  if p_precision not in ('exact_day','exact_month','exact_year','unknown') then raise exception 'invalid-precision' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 2000 then raise exception 'invalid-notes' using errcode = '22023'; end if;
  perform strandcue_private.validate_activity_zones(coalesce(p_zones,'[]'::jsonb));
  -- future date check via helper
  select * into eff from strandcue_private.activity_effective_interval(p_precision, p_occurred_at);
  -- payload for idempotency
  payload := jsonb_build_object('op', p_operation_id, 'activityId', p_activity_id, 'expectedRevision', p_expected_revision, 'kind', p_kind, 'occurredAt', p_occurred_at, 'precision', p_precision, 'zones', p_zones, 'notes', p_notes, 'correctsId', p_corrects_id, 'reason', p_reason);
  select * into prev from strandcue_private.activity_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  -- lock profile
  perform 1 from public.profiles where user_id = uid and account_status = 'active' for update;
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  -- fetch or create activity row
  select * into act from public.activities where id = p_activity_id for update;
  if not found then
    if p_expected_revision <> 0 or p_kind <> 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
    insert into public.activities(id, owner, kind, occurred_at, precision, zones, notes, status, revision) values (p_activity_id, uid, 'wash', p_occurred_at, p_precision, coalesce(p_zones,'[]'::jsonb), p_notes, 'active', 0) returning * into act;
  else
    if act.owner <> uid then raise exception 'not-found' using errcode = '42501'; end if;
    if act.revision <> p_expected_revision then raise exception 'revision-conflict' using errcode = '40001'; end if;
    if p_kind = 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  end if;
  -- correction/void target checks
  if p_kind = 'correction' then
    if p_corrects_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if not exists(select 1 from public.activity_revisions where id = p_corrects_id and activity_id = p_activity_id and owner = uid) then raise exception 'correction-target-not-found' using errcode = '22023'; end if;
    if exists(select 1 from public.activity_revisions where corrects_id = p_corrects_id) then raise exception 'already-corrected' using errcode = '23505'; end if;
  elsif p_kind = 'void' then
    if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid-void' using errcode = '22023'; end if;
    if p_corrects_id is not null then raise exception 'invalid-void' using errcode = '22023'; end if;
  else
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
  end if;
  -- build patch
  if p_kind = 'void' then
    patch := '{}'::jsonb;
  elsif p_kind = 'baseline' then
    patch := jsonb_build_object('activityKind', 'wash', 'precision', p_precision, 'zones', coalesce(p_zones,'[]'::jsonb), 'notes', p_notes, 'status', 'active');
  else
    patch := jsonb_build_object('notes', p_notes);
    if p_zones is not null then patch := patch || jsonb_build_object('zones', p_zones); end if;
    if p_precision is not null then patch := patch || jsonb_build_object('precision', p_precision); end if;
  end if;
  -- insert revision
  insert into public.activity_revisions(id, owner, activity_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, recorded_at, source, patch, corrects_id, correction_reason, void_reason)
  values (rev_id, uid, p_activity_id, act.revision+1, act.revision, p_kind, jsonb_build_object('precision', p_precision, 'value', case when p_precision='unknown' then null else (p_occurred_at at time zone 'Africa/Johannesburg')::date::text end), eff.start_date, eff.end_date, now(), 'user-reported', patch, p_corrects_id, case when p_kind='correction' then btrim(p_reason) end, case when p_kind='void' then btrim(p_reason) end);
  -- update activity revision and status
  if p_kind = 'void' then
    update public.activities set revision = revision+1, status = 'voided', updated_at = now() where id = p_activity_id;
  else
    update public.activities set revision = revision+1, occurred_at = coalesce(p_occurred_at, occurred_at), precision = coalesce(p_precision, precision), zones = coalesce(p_zones, zones), notes = coalesce(p_notes, notes), updated_at = now() where id = p_activity_id;
  end if;
  -- build result
  select jsonb_build_object('activityId', p_activity_id, 'revision', act.revision+1, 'revisions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'precision', r.effective_date->>'precision', 'correctsId', r.corrects_id, 'voidReason', r.void_reason) order by r.sequence), '[]'::jsonb) from public.activity_revisions r where r.activity_id = p_activity_id)) into result;
  insert into strandcue_private.activity_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.mutate_activity(uuid,uuid,integer,text,timestamptz,text,jsonb,text,uuid,text) owner to strandcue_mutator;

-- private read cores (definer, owned by mutator) + public invoker wrappers (owned by migration_admin, like passport/services)
create or replace function strandcue_private.get_activity_core(p_activity_id uuid, p_include_audit boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid(); act public.activities%rowtype; revs jsonb; is_void boolean;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into act from public.activities where id = p_activity_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'precision', r.effective_date->>'precision', 'correctsId', r.corrects_id, 'voidReason', r.void_reason, 'patch', r.patch) order by r.sequence), '[]'::jsonb) into revs from public.activity_revisions r where r.activity_id = p_activity_id and owner = uid;
  is_void := exists(select 1 from public.activity_revisions where activity_id = p_activity_id and kind = 'void');
  return jsonb_build_object('id', act.id, 'revision', act.revision, 'voided', is_void, 'revisions', revs);
end;
$$;
alter function strandcue_private.get_activity_core(uuid, boolean) owner to strandcue_mutator;

create or replace function strandcue_private.list_activities_core(p_as_of date, p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid();
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'revision', a.revision) order by a.updated_at desc), '[]'::jsonb) from public.activities a where a.owner = uid and a.status <> 'voided' limit p_limit));
end;
$$;
alter function strandcue_private.list_activities_core(date, integer, jsonb) owner to strandcue_mutator;

-- invoker wrappers provide the stable PostgREST API (owned by migration_admin, never transferred)
create or replace function public.record_activity(p_operation_id uuid, p_activity_id uuid, p_kind text, p_occurred_at timestamptz, p_precision text, p_zones jsonb, p_notes text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_activity(p_operation_id, p_activity_id, 0, 'baseline', p_occurred_at, p_precision, p_zones, p_notes, null, null);
end;
$$;

create or replace function public.correct_activity(p_operation_id uuid, p_activity_id uuid, p_expected_revision integer, p_corrects_id uuid, p_reason text, p_notes text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.correct_activity_core(p_operation_id, p_activity_id, p_expected_revision, p_corrects_id, p_reason, p_notes);
end;
$$;

create or replace function strandcue_private.correct_activity_core(p_operation_id uuid, p_activity_id uuid, p_expected_revision integer, p_corrects_id uuid, p_reason text, p_notes text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  rec record;
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select occurred_at, precision, zones into rec from public.activities where id = p_activity_id and owner = strandcue_private.request_uid();
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  return strandcue_private.mutate_activity(p_operation_id, p_activity_id, p_expected_revision, 'correction', rec.occurred_at, rec.precision, rec.zones, p_notes, p_corrects_id, p_reason);
end;
$$;
alter function strandcue_private.correct_activity_core(uuid,uuid,integer,uuid,text,text) owner to strandcue_mutator;

create or replace function public.void_activity(p_operation_id uuid, p_activity_id uuid, p_expected_revision integer, p_reason text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_activity(p_operation_id, p_activity_id, p_expected_revision, 'void', now(), 'unknown', '[]'::jsonb, null, null, p_reason);
end;
$$;

create or replace function public.get_activity(p_activity_id uuid, p_include_audit boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.get_activity_core(p_activity_id, p_include_audit);
end;
$$;

create or replace function public.list_activities(p_as_of date, p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_activities_core(p_as_of, p_limit, p_cursor);
end;
$$;

-- grants as migration_admin (do not SET/RESET — reset would target the wrong role)
-- helpers run inside definer cores as mutator: mutator-only
revoke all on function strandcue_private.validate_activity_zones(jsonb), strandcue_private.activity_effective_interval(text,timestamptz) from public, anon, authenticated;
grant execute on function strandcue_private.validate_activity_zones(jsonb), strandcue_private.activity_effective_interval(text,timestamptz) to strandcue_mutator;
-- cores validate auth internally (passport pattern): executable by authenticated via public invokers, owned by mutator
revoke all on function strandcue_private.mutate_activity(uuid,uuid,integer,text,timestamptz,text,jsonb,text,uuid,text), strandcue_private.correct_activity_core(uuid,uuid,integer,uuid,text,text), strandcue_private.get_activity_core(uuid,boolean), strandcue_private.list_activities_core(date,integer,jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.mutate_activity(uuid,uuid,integer,text,timestamptz,text,jsonb,text,uuid,text), strandcue_private.correct_activity_core(uuid,uuid,integer,uuid,text,text), strandcue_private.get_activity_core(uuid,boolean), strandcue_private.list_activities_core(date,integer,jsonb) to authenticated, strandcue_mutator;
revoke all on function public.record_activity(uuid,uuid,text,timestamptz,text,jsonb,text), public.correct_activity(uuid,uuid,integer,uuid,text,text), public.void_activity(uuid,uuid,integer,text), public.get_activity(uuid,boolean), public.list_activities(date,integer,jsonb) from public, anon, authenticated;
grant execute on function public.record_activity(uuid,uuid,text,timestamptz,text,jsonb,text), public.correct_activity(uuid,uuid,integer,uuid,text,text), public.void_activity(uuid,uuid,integer,text), public.get_activity(uuid,boolean), public.list_activities(date,integer,jsonb) to authenticated;
-- ensure request_uid remains executable for authenticated
grant execute on function strandcue_private.request_uid() to authenticated;
grant execute on function strandcue_private.request_claims() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

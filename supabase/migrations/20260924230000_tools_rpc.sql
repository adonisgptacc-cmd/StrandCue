-- Tools immutable RPC — add / change / correct / match / archive with
-- operation-key idempotency. Mirrors the shelf boundary: public wrappers are
-- security invokers owned by migration_admin; private cores are security
-- definers owned by strandcue_mutator. Ownership/revision checks precede
-- field validation so stale or foreign callers get revision-conflict /
-- not-found (Passport ordering).

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

create or replace function strandcue_private.mutate_user_tool(
  p_operation_id uuid,
  p_user_tool_id uuid,
  p_expected_revision integer,
  p_kind text,
  p_version_id uuid,
  p_manual_brand text,
  p_manual_model text,
  p_tool_type text,
  p_availability text,
  p_notes text,
  p_effective_date jsonb,
  p_corrects_id uuid,
  p_reason text,
  p_confirmed boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.tool_operations%rowtype;
  row public.user_tools%rowtype;
  rev_id uuid := gen_random_uuid();
  eff record;
  patch jsonb;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_user_tool_id is null or p_expected_revision is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_kind not in ('baseline','change','correction','match','archive') then raise exception 'invalid-kind' using errcode = '22023'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'userToolId', p_user_tool_id, 'expectedRevision', p_expected_revision,
    'kind', p_kind, 'versionId', p_version_id, 'manualBrand', p_manual_brand, 'manualModel', p_manual_model,
    'toolType', p_tool_type, 'availability', p_availability, 'notes', p_notes,
    'effectiveDate', p_effective_date, 'correctsId', p_corrects_id, 'reason', p_reason, 'confirmed', p_confirmed);
  select * into prev from strandcue_private.tool_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active' for update;
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into row from public.user_tools where id = p_user_tool_id for update;
  if not found then
    if p_expected_revision <> 0 or p_kind <> 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
    insert into public.user_tools(id, owner, version_id, manual_brand, manual_model, tool_type, availability, matched, matched_at, match_confirmed, revision, notes)
      values (p_user_tool_id, uid, p_version_id,
        nullif(btrim(coalesce(p_manual_brand, '')), ''), nullif(btrim(coalesce(p_manual_model, '')), ''), p_tool_type,
        coalesce(p_availability, 'available'), false, null, false, 0, p_notes)
      returning * into row;
  else
    if row.owner <> uid then raise exception 'not-found' using errcode = '42501'; end if;
    if row.revision <> p_expected_revision then raise exception 'revision-conflict' using errcode = '40001'; end if;
    if p_kind = 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  end if;
  -- Field validation runs after ownership/revision checks (Passport ordering).
  if p_tool_type is not null and p_tool_type not in ('dryer','heated-air-brush','air-styler','hood-dryer','flat-iron','hot-comb','curling-iron','steam-straightener','heated-rollers','diffuser','other') then raise exception 'invalid-tool-type' using errcode = '22023'; end if;
  if p_availability is not null and p_availability not in ('available','out_of_stock','archived') then raise exception 'invalid-availability' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 2000 then raise exception 'invalid-notes' using errcode = '22023'; end if;
  if p_version_id is null and (p_manual_model is null or length(btrim(p_manual_model)) < 1) and p_kind in ('baseline','change','correction') then
    raise exception 'invalid-tool' using errcode = '22023';
  end if;
  if p_version_id is not null and not exists(select 1 from public.tool_versions where id = p_version_id) then
    raise exception 'version-not-found' using errcode = '22023';
  end if;
  select * into eff from strandcue_private.date_interval(p_effective_date);
  if p_kind = 'correction' then
    if p_corrects_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if not exists(select 1 from public.user_tool_revisions where id = p_corrects_id and user_tool_id = p_user_tool_id and owner = uid) then raise exception 'correction-target-not-found' using errcode = '22023'; end if;
    if exists(select 1 from public.user_tool_revisions where corrects_id = p_corrects_id) then raise exception 'already-corrected' using errcode = '23505'; end if;
  elsif p_kind = 'match' then
    if p_confirmed is distinct from true then raise exception 'confirmation-required' using errcode = '22023'; end if;
    if p_version_id is null then raise exception 'invalid-match' using errcode = '22023'; end if;
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-match' using errcode = '22023'; end if;
  elsif p_kind = 'archive' then
    if p_corrects_id is not null or p_reason is not null or p_confirmed is not null then raise exception 'invalid-archive' using errcode = '22023'; end if;
  else
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if p_confirmed is not null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  end if;
  patch := jsonb_build_object('versionId', p_version_id, 'manualBrand', p_manual_brand, 'manualModel', p_manual_model,
    'toolType', p_tool_type, 'availability', p_availability, 'notes', p_notes);
  insert into public.user_tool_revisions(id, owner, user_tool_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, recorded_at, source, patch, corrects_id, correction_reason, match_version_id)
    values (rev_id, uid, p_user_tool_id, row.revision + 1, row.revision, p_kind, p_effective_date, eff.start_date, eff.end_date, now(), 'user-reported',
      patch, p_corrects_id, case when p_kind = 'correction' then btrim(p_reason) end,
      case when p_kind = 'match' then p_version_id end);
  if p_kind = 'match' then
    update public.user_tools set revision = revision + 1, version_id = p_version_id, matched = true, matched_at = now(), match_confirmed = true, updated_at = now() where id = p_user_tool_id;
  elsif p_kind = 'archive' then
    update public.user_tools set revision = revision + 1, availability = 'archived', updated_at = now() where id = p_user_tool_id;
  else
    update public.user_tools set revision = revision + 1,
      version_id = coalesce(p_version_id, version_id),
      manual_brand = coalesce(nullif(btrim(coalesce(p_manual_brand, '')), ''), manual_brand),
      manual_model = coalesce(nullif(btrim(coalesce(p_manual_model, '')), ''), manual_model),
      tool_type = coalesce(p_tool_type, tool_type),
      availability = coalesce(p_availability, availability),
      notes = coalesce(p_notes, notes),
      updated_at = now()
      where id = p_user_tool_id;
  end if;
  select jsonb_build_object('userToolId', p_user_tool_id, 'revision', row.revision + 1,
    'revisions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'matchVersionId', r.match_version_id) order by r.sequence), '[]'::jsonb)
      from public.user_tool_revisions r where r.user_tool_id = p_user_tool_id)) into result;
  insert into strandcue_private.tool_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.mutate_user_tool(uuid,uuid,integer,text,uuid,text,text,text,text,text,jsonb,uuid,text,boolean) owner to strandcue_mutator;

create or replace function strandcue_private.get_user_tool_core(p_user_tool_id uuid, p_include_audit boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid(); row public.user_tools%rowtype; revs jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into row from public.user_tools where id = p_user_tool_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'matchVersionId', r.match_version_id, 'patch', r.patch) order by r.sequence), '[]'::jsonb)
    into revs from public.user_tool_revisions r where r.user_tool_id = p_user_tool_id and owner = uid;
  return jsonb_build_object('id', row.id, 'revision', row.revision, 'availability', row.availability,
    'matched', row.matched, 'matchConfirmed', row.match_confirmed, 'manualModel', row.manual_model, 'versionId', row.version_id, 'revisions', revs);
end;
$$;
alter function strandcue_private.get_user_tool_core(uuid, boolean) owner to strandcue_mutator;

create or replace function strandcue_private.list_user_tools_core(p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid();
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'revision', u.revision, 'availability', u.availability, 'manualModel', u.manual_model) order by u.updated_at desc), '[]'::jsonb)
    from public.user_tools u where u.owner = uid and u.availability <> 'archived' limit p_limit));
end;
$$;
alter function strandcue_private.list_user_tools_core(integer) owner to strandcue_mutator;

-- Public invoker wrappers (owned by migration_admin, never transferred).
create or replace function public.tool_add(p_operation_id uuid, p_user_tool_id uuid, p_version_id uuid, p_manual_brand text, p_manual_model text, p_tool_type text, p_availability text, p_notes text, p_effective_date jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, 0, 'baseline', p_version_id, p_manual_brand, p_manual_model, p_tool_type, p_availability, p_notes, p_effective_date, null, null, null);
end;
$$;

create or replace function public.tool_change(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_version_id uuid, p_manual_brand text, p_manual_model text, p_tool_type text, p_availability text, p_notes text, p_effective_date jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'change', p_version_id, p_manual_brand, p_manual_model, p_tool_type, p_availability, p_notes, p_effective_date, null, null, null);
end;
$$;

create or replace function public.tool_correct(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_corrects_id uuid, p_reason text, p_manual_model text, p_notes text, p_effective_date jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'correction', null, null, p_manual_model, null, null, p_notes, p_effective_date, p_corrects_id, p_reason, null);
end;
$$;

create or replace function public.tool_match(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_version_id uuid, p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare today jsonb;
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  today := jsonb_build_object('precision', 'day', 'value', (now() at time zone 'Africa/Johannesburg')::date::text);
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'match', p_version_id, null, null, null, null, null, today, null, null, p_confirmed);
end;
$$;

create or replace function public.tool_archive(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare today jsonb;
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  today := jsonb_build_object('precision', 'day', 'value', (now() at time zone 'Africa/Johannesburg')::date::text);
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'archive', null, null, null, null, 'archived', null, today, null, null, null);
end;
$$;

create or replace function public.tool_history(p_user_tool_id uuid, p_include_audit boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.get_user_tool_core(p_user_tool_id, p_include_audit);
end;
$$;

create or replace function public.tool_list(p_limit integer default 25)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_user_tools_core(p_limit);
end;
$$;

revoke all on function strandcue_private.mutate_user_tool(uuid,uuid,integer,text,uuid,text,text,text,text,text,jsonb,uuid,text,boolean), strandcue_private.get_user_tool_core(uuid,boolean), strandcue_private.list_user_tools_core(integer) from public, anon, authenticated;
grant execute on function strandcue_private.mutate_user_tool(uuid,uuid,integer,text,uuid,text,text,text,text,text,jsonb,uuid,text,boolean), strandcue_private.get_user_tool_core(uuid,boolean), strandcue_private.list_user_tools_core(integer) to authenticated, strandcue_mutator;
revoke all on function public.tool_add(uuid,uuid,uuid,text,text,text,text,text,jsonb), public.tool_change(uuid,uuid,integer,uuid,text,text,text,text,text,jsonb), public.tool_correct(uuid,uuid,integer,uuid,text,text,text,jsonb), public.tool_match(uuid,uuid,integer,uuid,boolean), public.tool_archive(uuid,uuid,integer), public.tool_history(uuid,boolean), public.tool_list(integer) from public, anon, authenticated;
grant execute on function public.tool_add(uuid,uuid,uuid,text,text,text,text,text,jsonb), public.tool_change(uuid,uuid,integer,uuid,text,text,text,text,text,jsonb), public.tool_correct(uuid,uuid,integer,uuid,text,text,text,jsonb), public.tool_match(uuid,uuid,integer,uuid,boolean), public.tool_archive(uuid,uuid,integer), public.tool_history(uuid,boolean), public.tool_list(integer) to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

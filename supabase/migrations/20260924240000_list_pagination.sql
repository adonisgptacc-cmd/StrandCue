-- Keyset pagination for activity/shelf/tools lists — replaces the
-- unbounded list cores with the proven list_services contract: p_limit
-- clamped 1–100 (else invalid-page), strict {updatedAt,id} cursors (else
-- invalid-cursor), tuple keyset on (updated_at, id) so pages stay stable
-- under concurrent inserts (never OFFSET), nextCursor or null.
-- Function replacement only; no schema or grant changes.

create or replace function strandcue_private.list_activities_core(p_as_of date, p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  cursor_time timestamptz;
  cursor_id uuid;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb;
  row_data record;
  count_rows integer := 0;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid-page' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor) <> 'object' or not p_cursor ?& array['updatedAt','id']
        or p_cursor - array['updatedAt','id'] <> '{}'::jsonb
        or jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'invalid-cursor'; end if;
      cursor_time := (p_cursor->>'updatedAt')::timestamptz;
      cursor_id := (p_cursor->>'id')::uuid;
      if not isfinite(cursor_time) then raise exception 'invalid-cursor'; end if;
    exception when others then raise exception 'invalid-cursor' using errcode = '22023'; end;
  end if;
  for row_data in
    select a.id, a.revision, a.updated_at from public.activities a
    where a.owner = uid and a.status <> 'voided'
      and (cursor_id is null or (a.updated_at, a.id) < (cursor_time, cursor_id))
    order by a.updated_at desc, a.id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then return jsonb_build_object('items', items, 'nextCursor', next_cursor); end if;
    items := items || jsonb_build_array(jsonb_build_object('id', row_data.id, 'revision', row_data.revision));
    next_cursor := jsonb_build_object('updatedAt', to_char(row_data.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', row_data.id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;

create or replace function strandcue_private.list_user_products_core(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  cursor_time timestamptz;
  cursor_id uuid;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb;
  row_data record;
  count_rows integer := 0;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid-page' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor) <> 'object' or not p_cursor ?& array['updatedAt','id']
        or p_cursor - array['updatedAt','id'] <> '{}'::jsonb
        or jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'invalid-cursor'; end if;
      cursor_time := (p_cursor->>'updatedAt')::timestamptz;
      cursor_id := (p_cursor->>'id')::uuid;
      if not isfinite(cursor_time) then raise exception 'invalid-cursor'; end if;
    exception when others then raise exception 'invalid-cursor' using errcode = '22023'; end;
  end if;
  for row_data in
    select u.id, u.revision, u.availability, u.manual_name, u.updated_at from public.user_products u
    where u.owner = uid and u.availability <> 'archived'
      and (cursor_id is null or (u.updated_at, u.id) < (cursor_time, cursor_id))
    order by u.updated_at desc, u.id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then return jsonb_build_object('items', items, 'nextCursor', next_cursor); end if;
    items := items || jsonb_build_array(jsonb_build_object('id', row_data.id, 'revision', row_data.revision, 'availability', row_data.availability, 'manualName', row_data.manual_name));
    next_cursor := jsonb_build_object('updatedAt', to_char(row_data.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', row_data.id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;

create or replace function strandcue_private.list_user_tools_core(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  cursor_time timestamptz;
  cursor_id uuid;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb;
  row_data record;
  count_rows integer := 0;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid-page' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor) <> 'object' or not p_cursor ?& array['updatedAt','id']
        or p_cursor - array['updatedAt','id'] <> '{}'::jsonb
        or jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'invalid-cursor'; end if;
      cursor_time := (p_cursor->>'updatedAt')::timestamptz;
      cursor_id := (p_cursor->>'id')::uuid;
      if not isfinite(cursor_time) then raise exception 'invalid-cursor'; end if;
    exception when others then raise exception 'invalid-cursor' using errcode = '22023'; end;
  end if;
  for row_data in
    select u.id, u.revision, u.availability, u.manual_model, u.updated_at from public.user_tools u
    where u.owner = uid and u.availability <> 'archived'
      and (cursor_id is null or (u.updated_at, u.id) < (cursor_time, cursor_id))
    order by u.updated_at desc, u.id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then return jsonb_build_object('items', items, 'nextCursor', next_cursor); end if;
    items := items || jsonb_build_array(jsonb_build_object('id', row_data.id, 'revision', row_data.revision, 'availability', row_data.availability, 'manualModel', row_data.manual_model));
    next_cursor := jsonb_build_object('updatedAt', to_char(row_data.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', row_data.id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;

-- Shelf and tool lists gain the cursor parameter (default null keeps callers compatible).
-- CREATE OR REPLACE cannot change a signature, so the old 1-arg versions are
-- dropped first; they were owned by this migration chain's administrator.
drop function if exists public.shelf_list(integer);
drop function if exists public.tool_list(integer);
create or replace function public.shelf_list(p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_user_products_core(p_limit, p_cursor);
end;
$$;

create or replace function public.tool_list(p_limit integer default 25, p_cursor jsonb default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_user_tools_core(p_limit, p_cursor);
end;
$$;

revoke all on function public.shelf_list(integer, jsonb), public.tool_list(integer, jsonb) from public, anon, authenticated;
grant execute on function public.shelf_list(integer, jsonb), public.tool_list(integer, jsonb) to authenticated;

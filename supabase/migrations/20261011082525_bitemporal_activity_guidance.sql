-- Guidance reconstructs knowledge at a recorded cutoff. Effective-time
-- projection remains in the domain; even currently voided activities are read.
create index activity_guidance_baseline_page
  on public.activity_revisions(owner, recorded_at desc, activity_id desc)
  where kind = 'baseline';
create index activity_guidance_revision_cutoff
  on public.activity_revisions(owner, activity_id, recorded_at, sequence);

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

create function strandcue_private.list_guidance_activity_histories_core(
  p_effective_as_of date, p_recorded_as_of timestamptz, p_limit integer, p_cursor jsonb
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  cursor_time timestamptz;
  cursor_id uuid;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb;
  baseline_row record;
  revisions jsonb;
  count_rows integer := 0;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles where user_id = uid and account_status = 'active') then
    raise exception 'account-not-active' using errcode = '42501';
  end if;
  if p_effective_as_of is null or not isfinite(p_effective_as_of) then
    raise exception 'invalid-effective-date' using errcode = '22023';
  end if;
  if p_recorded_as_of is null or not isfinite(p_recorded_as_of)
    or p_recorded_as_of > transaction_timestamp() then
    raise exception 'invalid-recorded-cutoff' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid-page' using errcode = '22023';
  end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor) <> 'object'
        or not p_cursor ?& array['baselineRecordedAt', 'activityId']
        or p_cursor - array['baselineRecordedAt', 'activityId'] <> '{}'::jsonb
        or jsonb_typeof(p_cursor->'baselineRecordedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'activityId') is distinct from 'string'
        or (p_cursor->>'baselineRecordedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        or (p_cursor->>'activityId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid-cursor';
      end if;
      cursor_time := (p_cursor->>'baselineRecordedAt')::timestamptz;
      cursor_id := (p_cursor->>'activityId')::uuid;
      -- Foreign, absent, altered, and after-cutoff identities use the same
      -- error and only owner-scoped lookups; no existence oracle crosses owners.
      if not isfinite(cursor_time) or cursor_time > p_recorded_as_of
        or not exists(select 1 from public.activity_revisions r
          where r.owner = uid and r.kind = 'baseline'
            and r.activity_id = cursor_id and r.recorded_at = cursor_time) then
        raise exception 'invalid-cursor';
      end if;
    exception when others then
      raise exception 'invalid-cursor' using errcode = '22023';
    end;
  end if;

  for baseline_row in
    select r.activity_id, r.recorded_at from public.activity_revisions r
    where r.owner = uid and r.kind = 'baseline' and r.recorded_at <= p_recorded_as_of
      and (cursor_id is null or (r.recorded_at, r.activity_id) < (cursor_time, cursor_id))
    order by r.recorded_at desc, r.activity_id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then
      return jsonb_build_object('items', items, 'nextCursor', next_cursor);
    end if;
    select jsonb_agg(
      jsonb_build_object(
        'id', r.id, 'activityId', r.activity_id,
        'sequence', r.sequence, 'baseRevision', r.base_revision, 'kind', r.kind,
        'effectiveDate', jsonb_build_object(
          'precision', case r.effective_date->>'precision'
            when 'exact_day' then 'day' when 'exact_month' then 'month'
            when 'exact_year' then 'year' else r.effective_date->>'precision' end,
          'value', case r.effective_date->>'precision'
            when 'unknown' then null
            when 'exact_day' then left(r.effective_date->>'value', 10)
            when 'exact_month' then left(r.effective_date->>'value', 7)
            when 'exact_year' then left(r.effective_date->>'value', 4)
            else r.effective_date->>'value' end),
        'recordedAt', to_char(r.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'source', r.source,
        -- Existing mutators store JSON null for omitted notes. Baselines need
        -- a string in the strict domain schema; other kinds allow omission.
        -- Normalize only that nullable field, preserving the stored revisions.
        'patch', case
          when r.kind = 'baseline' and (r.patch->'notes' is null or r.patch->'notes' = 'null'::jsonb)
            then r.patch || jsonb_build_object('notes', '')
          when r.kind in ('change', 'correction') and r.patch->'notes' = 'null'::jsonb
            then r.patch - 'notes'
          else r.patch end
      ) || case r.kind
        when 'correction' then jsonb_build_object('correctsId', r.corrects_id, 'correctionReason', r.correction_reason)
        when 'void' then jsonb_build_object('voidReason', r.void_reason)
        else '{}'::jsonb end
      order by r.sequence
    ) into revisions
    from public.activity_revisions r
    where r.owner = uid and r.activity_id = baseline_row.activity_id and r.recorded_at <= p_recorded_as_of;
    items := items || jsonb_build_array(jsonb_build_object('activityId', baseline_row.activity_id, 'revisions', revisions));
    next_cursor := jsonb_build_object(
      'baselineRecordedAt', to_char(baseline_row.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'activityId', baseline_row.activity_id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;
alter function strandcue_private.list_guidance_activity_histories_core(date, timestamptz, integer, jsonb)
  owner to strandcue_mutator;

create function public.list_guidance_activity_histories(
  p_effective_as_of date, p_recorded_as_of timestamptz,
  p_limit integer default 100, p_cursor jsonb default null
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  return strandcue_private.list_guidance_activity_histories_core(p_effective_as_of, p_recorded_as_of, p_limit, p_cursor);
end;
$$;

revoke all on function strandcue_private.list_guidance_activity_histories_core(date, timestamptz, integer, jsonb)
  from public, anon, authenticated;
grant execute on function strandcue_private.list_guidance_activity_histories_core(date, timestamptz, integer, jsonb)
  to authenticated, strandcue_mutator;
revoke all on function public.list_guidance_activity_histories(date, timestamptz, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.list_guidance_activity_histories(date, timestamptz, integer, jsonb) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

-- Weather location sharing is a separate, owner-controlled consent purpose.
-- The quota stores only request counts and expires with the owner profile.

alter table public.consent_records
  drop constraint consent_records_purpose_check;
alter table public.consent_records
  add constraint consent_records_purpose_check
  check (purpose in (
    'hair_passport_processing', 'marketing_email', 'community_outcomes',
    'product_analytics', 'weather_context'
  ));

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;
set role strandcue_mutator;
create or replace function strandcue_private.set_consent(p_operation_id uuid, p_purpose text, p_granted boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.consent_operations%rowtype;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_purpose is null or p_granted is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_purpose not in ('hair_passport_processing','marketing_email','community_outcomes','product_analytics','weather_context') then
    raise exception 'unknown-purpose' using errcode = '22023';
  end if;
  if p_purpose = 'hair_passport_processing' and not p_granted then
    raise exception 'required-purpose' using errcode = '22023';
  end if;
  payload := jsonb_build_object('op', p_operation_id, 'purpose', p_purpose, 'granted', p_granted);
  select * into prev from strandcue_private.consent_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  insert into public.consent_records(user_id, purpose, granted) values (uid, p_purpose, p_granted);
  result := jsonb_build_object('purpose', p_purpose, 'granted', p_granted, 'recordedAt', now());
  insert into strandcue_private.consent_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
reset role;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

create table strandcue_private.weather_context_rate_limits (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  window_start timestamptz not null,
  used integer not null check (used between 0 and 20)
);
alter table strandcue_private.weather_context_rate_limits enable row level security;
alter table strandcue_private.weather_context_rate_limits force row level security;
do $$ begin
  execute format(
    'create policy weather_context_rate_internal on strandcue_private.weather_context_rate_limits for all to strandcue_mutator using (true) with check (true)');
end $$;
revoke all on table strandcue_private.weather_context_rate_limits from public, anon, authenticated, service_role;
grant select, insert, update on table strandcue_private.weather_context_rate_limits to strandcue_mutator;

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
set role strandcue_mutator;
create function strandcue_private.reserve_weather_context_request_core()
returns integer language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := strandcue_private.request_uid();
  limit_row strandcue_private.weather_context_rate_limits%rowtype;
begin
  if owner_id is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  perform 1 from public.profiles where user_id = owner_id and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  insert into strandcue_private.weather_context_rate_limits(user_id, window_start, used)
    values (owner_id, now(), 0) on conflict (user_id) do nothing;
  select * into limit_row from strandcue_private.weather_context_rate_limits
    where user_id = owner_id for update;
  if limit_row.window_start <= now() - interval '1 hour' then
    update strandcue_private.weather_context_rate_limits
      set window_start = now(), used = 0 where user_id = owner_id;
    limit_row.used := 0;
  end if;
  if limit_row.used >= 20 then
    raise exception 'weather-rate-limited' using errcode = '22023';
  end if;
  update strandcue_private.weather_context_rate_limits
    set used = used + 1 where user_id = owner_id;
  return 19 - limit_row.used;
end;
$$;
revoke all on function strandcue_private.reserve_weather_context_request_core()
  from public, anon, authenticated, service_role;
grant execute on function strandcue_private.reserve_weather_context_request_core()
  to authenticated;
reset role;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

create function public.reserve_weather_context_request()
returns integer language sql security invoker set search_path = pg_catalog, pg_temp as $$
  select strandcue_private.reserve_weather_context_request_core()
$$;
revoke all on function public.reserve_weather_context_request()
  from public, anon, authenticated, service_role;
grant execute on function public.reserve_weather_context_request()
  to authenticated;

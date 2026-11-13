-- Trusted username change — replaces archived username-change draft.
--
-- Authority conflict resolved: docs/PHASE_1.md P1-AUTH-02 proposed a 30-day
-- interval and lowercase-only handles, but the product authority
-- (StrandCue-PRD-v1.1-audit.md §11.6) sets a 7-day interval and the wider
-- 3–32 charset with reserved words. The PRD governs: 7 days win, and the
-- shared validator below implements the PRD rule for both signup and
-- change. complete_account keeps its lower() normalization (compatible:
-- the PRD does not forbid it, and it preserves case-insensitive
-- uniqueness), but now defers to the shared validator and reserved list.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- Shared PRD username rule. Immutable so CHECK constraints can use it.
-- Returns the normalized handle or raises invalid-username / reserved-username.
create or replace function strandcue_private.valid_username(p_username text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare normalized text := lower(strandcue_private.trim_text(p_username));
begin
  if normalized is null or length(normalized) not between 3 and 32
    or normalized !~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$'
    or normalized ~ '[._-]{2}' then
    raise exception 'invalid-username' using errcode = '22023';
  end if;
  if normalized in ('admin','strandcue','support','root','system','help','api','null','undefined') then
    raise exception 'reserved-username' using errcode = '22023';
  end if;
  return normalized;
end;
$$;

alter table public.profiles add column username_changed_at timestamptz;
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username = strandcue_private.valid_username(username));

create table strandcue_private.username_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table strandcue_private.username_operations enable row level security;
alter table strandcue_private.username_operations force row level security;
create policy username_operation_read on strandcue_private.username_operations for select to strandcue_mutator
  using (user_id = (select strandcue_private.request_uid()));
create policy username_operation_append on strandcue_private.username_operations for insert to strandcue_mutator
  with check (user_id = (select strandcue_private.request_uid()));
revoke all on strandcue_private.username_operations from public, anon, authenticated;
grant select, insert on strandcue_private.username_operations to strandcue_mutator;

-- Signup now defers to the shared product-authority rule.
create or replace function strandcue_private.complete_account(p_username text, p_eligible boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid(); claims jsonb := strandcue_private.request_claims(); profile public.profiles; normalized text := strandcue_private.valid_username(p_username);
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if claims->>'sub' is distinct from uid::text or claims->>'role' is distinct from 'authenticated'
    or coalesce((claims->>'is_anonymous')::boolean, true)
    or nullif(claims->>'email', '') is null then
    raise exception 'email-not-verified' using errcode = '42501';
  end if;
  if p_eligible is distinct from true then raise exception 'eligibility-required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into profile from public.profiles where user_id = uid for update;
  if found then
    if profile.account_status <> 'active' then raise exception 'account-not-active' using errcode = '42501'; end if;
    if profile.username <> normalized then raise exception 'profile-already-complete' using errcode = '23505'; end if;
  else
    begin
      insert into public.profiles(user_id, username, eligible) values(uid, normalized, true) returning * into profile;
    exception when unique_violation then raise exception 'username-unavailable' using errcode = '23505'; end;
    insert into public.hair_passports(user_id) values(uid);
  end if;
  return jsonb_build_object('userId', profile.user_id, 'username', profile.username, 'eligible', profile.eligible, 'country', profile.country, 'currency', profile.currency, 'temperatureUnit', profile.temperature_unit, 'accountStatus', profile.account_status, 'revision', profile.revision);
end;
$$;

create or replace function strandcue_private.change_username(p_operation_id uuid, p_new_username text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  normalized text := strandcue_private.valid_username(p_new_username);
  payload jsonb;
  prev strandcue_private.username_operations%rowtype;
  profile public.profiles%rowtype;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'username', normalized);
  select * into prev from strandcue_private.username_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  -- Serialize concurrent claims on the same handle namespace per account.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into profile from public.profiles where user_id = uid for update;
  if not found then raise exception 'profile-not-found' using errcode = '22023'; end if;
  if profile.account_status <> 'active' then raise exception 'account-not-active' using errcode = '42501'; end if;
  if profile.username = normalized then
    result := jsonb_build_object('userId', uid, 'username', profile.username);
    insert into strandcue_private.username_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
    return result;
  end if;
  if profile.username_changed_at is not null and profile.username_changed_at > now() - interval '7 days' then
    raise exception 'username-change-too-soon' using errcode = '22023';
  end if;
  begin
    update public.profiles set username = normalized, username_changed_at = now() where user_id = uid;
  exception when unique_violation then raise exception 'username-taken' using errcode = '23505'; end;
  result := jsonb_build_object('userId', uid, 'username', normalized);
  insert into strandcue_private.username_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.change_username(uuid, text) owner to strandcue_mutator;

create or replace function public.username_change(p_operation_id uuid, p_new_username text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.change_username(p_operation_id, p_new_username);
end;
$$;

-- complete_account was replaced above; reassert its ownership and grants
-- (ownership transfer is idempotent, grants are additive-safe).
alter function strandcue_private.complete_account(text, boolean) owner to strandcue_mutator;
revoke all on function strandcue_private.valid_username(text), strandcue_private.change_username(uuid, text) from public, anon, authenticated;
grant execute on function strandcue_private.valid_username(text), strandcue_private.change_username(uuid, text) to authenticated, strandcue_mutator;
revoke all on function public.username_change(uuid, text) from public, anon, authenticated;
grant execute on function public.username_change(uuid, text) to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;
grant update(username, username_changed_at) on public.profiles to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

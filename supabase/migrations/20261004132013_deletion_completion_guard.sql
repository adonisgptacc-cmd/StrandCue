-- Prevent an old access JWT from recreating an account after profile purge.
-- CREATE OR REPLACE preserves ownership and existing restricted grants.
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
  if exists(select 1 from public.deletion_tombstones where user_id = uid) then
    raise exception 'account-deleted' using errcode = '42501';
  end if;
  select * into profile from public.profiles where user_id = uid for update;
  if found then
    if profile.account_status <> 'active' then raise exception 'account-not-active' using errcode = '42501'; end if;
    if profile.username <> normalized then raise exception 'profile-already-complete' using errcode = '23505'; end if;
  else
    -- The profile lock may have waited for a concurrent purge after the
    -- initial tombstone read. Recheck under this statement's fresh snapshot.
    if exists(select 1 from public.deletion_tombstones where user_id = uid) then
      raise exception 'account-deleted' using errcode = '42501';
    end if;
    begin
      insert into public.profiles(user_id, username, eligible) values(uid, normalized, true) returning * into profile;
    exception when unique_violation then raise exception 'username-unavailable' using errcode = '23505'; end;
    insert into public.hair_passports(user_id) values(uid);
  end if;
  return jsonb_build_object('userId', profile.user_id, 'username', profile.username, 'eligible', profile.eligible, 'country', profile.country, 'currency', profile.currency, 'temperatureUnit', profile.temperature_unit, 'accountStatus', profile.account_status, 'revision', profile.revision);
end;
$$;

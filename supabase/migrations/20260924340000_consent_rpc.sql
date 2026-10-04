-- Consent immutable RPC — set / list over the append-only log.
--
-- Withdrawing hair_passport_processing while the account is active is
-- rejected: that processing is the account itself, so withdrawal means
-- deleting the account instead. Public wrappers are security invokers
-- owned by migration_admin; the private core is a security definer owned
-- by strandcue_mutator.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

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
  if p_purpose not in ('hair_passport_processing','marketing_email','community_outcomes','product_analytics') then
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
alter function strandcue_private.set_consent(uuid, text, boolean) owner to strandcue_mutator;

create or replace function strandcue_private.list_consents()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid();
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return coalesce((select jsonb_object_agg(latest.purpose, latest.granted)
    from (select distinct on (r.purpose) r.purpose, r.granted
      from public.consent_records r where r.user_id = uid order by r.purpose, r.recorded_at desc, r.id desc) latest), '{}'::jsonb);
end;
$$;
alter function strandcue_private.list_consents() owner to strandcue_mutator;

create or replace function public.consent_set(p_operation_id uuid, p_purpose text, p_granted boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.set_consent(p_operation_id, p_purpose, p_granted);
end;
$$;

create or replace function public.consent_list()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.list_consents();
end;
$$;

revoke all on function strandcue_private.set_consent(uuid, text, boolean), strandcue_private.list_consents() from public, anon, authenticated;
grant execute on function strandcue_private.set_consent(uuid, text, boolean), strandcue_private.list_consents() to authenticated, strandcue_mutator;
revoke all on function public.consent_set(uuid, text, boolean), public.consent_list() from public, anon, authenticated;
grant execute on function public.consent_set(uuid, text, boolean), public.consent_list() to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

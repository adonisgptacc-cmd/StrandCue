grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

-- Only SECURITY DEFINER functions owned by the non-login mutator can use this
-- policy; authenticated clients cannot SET ROLE to it or select profile rows.
create policy profile_username_lookup on public.profiles for select to strandcue_mutator using (true);

create table strandcue_private.username_option_limits (
  user_id uuid primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 1)
);
alter table strandcue_private.username_option_limits enable row level security;
alter table strandcue_private.username_option_limits force row level security;
create policy username_option_limit_owner on strandcue_private.username_option_limits
  for all to strandcue_mutator
  using (user_id=(select strandcue_private.request_uid()))
  with check (user_id=(select strandcue_private.request_uid()));
revoke all on strandcue_private.username_option_limits from public, anon, authenticated;
grant select,insert,update on strandcue_private.username_option_limits to strandcue_mutator;

create function strandcue_private.username_options(p_username text,p_suffix text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=strandcue_private.request_uid();
  claims jsonb:=strandcue_private.request_claims();
  normalized text:=lower(strandcue_private.trim_text(p_username));
  suffix text:=left(regexp_replace(lower(strandcue_private.trim_text(coalesce(p_suffix,''))),'[^a-z0-9]+','_','g'),16);
  available boolean; suggestions jsonb; count_now integer;
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  if claims->>'sub' is distinct from uid::text or claims->>'role' is distinct from 'authenticated'
    or coalesce((claims->>'is_anonymous')::boolean,true) or nullif(claims->>'email','') is null then
    raise exception 'email-not-verified' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('username-options:'||uid::text,0));
  insert into strandcue_private.username_option_limits(user_id,window_started_at,request_count)
    values(uid,clock_timestamp(),1)
  on conflict(user_id) do update set
    window_started_at=case when strandcue_private.username_option_limits.window_started_at < clock_timestamp()-interval '1 minute' then clock_timestamp() else strandcue_private.username_option_limits.window_started_at end,
    request_count=case when strandcue_private.username_option_limits.window_started_at < clock_timestamp()-interval '1 minute' then 1 else strandcue_private.username_option_limits.request_count+1 end
  returning request_count into count_now;
  if count_now>30 then
    return jsonb_build_object('available',false,'suggestions','[]'::jsonb,'rateLimited',true);
  end if;
  if normalized is null or normalized !~ '^[a-z0-9_]{3,24}$'
    or normalized in ('admin','administrator','root','system','support','strandcue','moderator','null','undefined','api','help') then
    return jsonb_build_object('available',false,'suggestions','[]'::jsonb,'rateLimited',false);
  end if;
  select not exists(select 1 from public.profiles p where p.username=normalized and p.user_id<>uid) into available;
  if available then return jsonb_build_object('available',true,'suggestions','[]'::jsonb,'rateLimited',false); end if;
  suffix:=trim(both '_' from suffix);
  with candidates(value,priority) as (
    select left(normalized,21)||'_'||n::text, n from generate_series(2,30) n
    union all select left(normalized,23-length(suffix))||'_'||suffix, 0 where suffix<>''
  ), free as (
    select value,min(priority) priority from candidates
    where value ~ '^[a-z0-9_]{3,24}$' and not exists(select 1 from public.profiles p where p.username=value)
    group by value order by min(priority),value limit 6
  ) select coalesce(jsonb_agg(value order by priority,value),'[]'::jsonb) into suggestions from free;
  return jsonb_build_object('available',false,'suggestions',suggestions,'rateLimited',false);
end $$;

create function public.username_options(p_username text,p_suffix text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  return strandcue_private.username_options(p_username,p_suffix);
end $$;

alter function strandcue_private.username_options(text,text) owner to strandcue_mutator;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke all on function strandcue_private.username_options(text,text) from public,anon,authenticated;
grant execute on function strandcue_private.username_options(text,text) to authenticated,strandcue_mutator;
revoke all on function public.username_options(text,text) from public,anon,authenticated;
grant execute on function public.username_options(text,text) to authenticated;


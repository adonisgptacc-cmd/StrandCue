-- StrandCue Task 2. Public RPC contracts are documented in
-- docs/decisions/0002-mutation-boundary.md. Auth identity is never an argument.
create role strandcue_mutator nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
-- PostgreSQL 17 gives a non-superuser CREATEROLE administrator ADMIN but not
-- SET access to roles it creates. Ownership transfer requires temporary SET.
grant strandcue_mutator to current_user with set true;
create schema strandcue_private;
revoke all on schema strandcue_private from public, anon, authenticated;
grant usage on schema strandcue_private to authenticated, strandcue_mutator;
-- The proposed function owner must temporarily be able to create in the
-- function schema. This privilege is removed immediately after transfer.
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- Supabase's managed auth schema cannot grant privileges to project roles from
-- an ordinary migration. Mirror auth.uid() from the signed PostgREST claims.
create function strandcue_private.request_uid()
returns uuid language sql stable security invoker set search_path='' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'
  )::uuid
$$;
create function strandcue_private.request_claims()
returns jsonb language sql stable security invoker set search_path='' as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  eligible boolean not null check (eligible),
  country text not null default 'ZA' check (country='ZA'),
  currency text not null default 'ZAR' check (currency='ZAR'),
  temperature_unit text not null default 'C' check (temperature_unit='C'),
  account_status text not null default 'active' check (account_status in ('active','deleting')),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default now()
);
create table public.hair_passports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(user_id) on delete cascade,
  revision integer not null default 0 check (revision>=0),
  current_projection jsonb,
  created_at timestamptz not null default now(),
  unique (id,user_id)
);
create table public.passport_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  passport_id uuid not null,
  sequence integer not null check (sequence>0),
  base_revision integer not null check (base_revision>=0 and sequence=base_revision+1),
  kind text not null check (kind in ('baseline','change','correction')),
  effective_date jsonb not null,
  effective_start date,
  effective_end date,
  recorded_at timestamptz not null default now(),
  source text not null check (source in ('user-reported','user-estimated')),
  patch jsonb not null check (jsonb_typeof(patch)='object'),
  corrects_id uuid,
  correction_reason text,
  unique (id,user_id,passport_id),
  unique (passport_id,sequence),
  unique (corrects_id),
  foreign key (passport_id,user_id) references public.hair_passports(id,user_id) on delete cascade,
  foreign key (corrects_id,user_id,passport_id) references public.passport_revisions(id,user_id,passport_id),
  check ((kind='correction' and corrects_id is not null and length(btrim(correction_reason)) between 1 and 500)
    or (kind<>'correction' and corrects_id is null and correction_reason is null)),
  check (kind<>'baseline' or sequence=1)
);
create unique index passport_one_baseline on public.passport_revisions(passport_id) where kind='baseline';
create index passport_owner_history on public.passport_revisions(user_id,passport_id,sequence);
create table strandcue_private.passport_operations (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  operation_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id,operation_id)
);

alter table public.profiles enable row level security;
alter table public.hair_passports enable row level security;
alter table public.passport_revisions enable row level security;
alter table strandcue_private.passport_operations enable row level security;
alter table public.profiles force row level security;
alter table public.hair_passports force row level security;
alter table public.passport_revisions force row level security;
alter table strandcue_private.passport_operations force row level security;

-- Profile policy is deliberately nonrecursive. Mutator sees its own inactive
-- row only to deny it explicitly while holding the account lock.
create policy profile_read on public.profiles for select to authenticated
  using (user_id=(select strandcue_private.request_uid()) and account_status='active');
create policy profile_mutator_read on public.profiles for select to strandcue_mutator
  using (user_id=(select strandcue_private.request_uid()));
create policy profile_insert on public.profiles for insert to strandcue_mutator
  with check (user_id=(select strandcue_private.request_uid()) and account_status='active' and eligible);
create policy profile_lock on public.profiles for update to strandcue_mutator
  using (user_id=(select strandcue_private.request_uid())) with check (user_id=(select strandcue_private.request_uid()));
create policy passport_read on public.hair_passports for select to authenticated, strandcue_mutator
  using (user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=hair_passports.user_id and p.account_status='active'));
create policy passport_insert on public.hair_passports for insert to strandcue_mutator
  with check (user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=hair_passports.user_id and p.account_status='active'));
create policy passport_update on public.hair_passports for update to strandcue_mutator
  using (user_id=(select strandcue_private.request_uid())) with check (user_id=(select strandcue_private.request_uid()));
create policy revision_read on public.passport_revisions for select to authenticated, strandcue_mutator
  using (user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=passport_revisions.user_id and p.account_status='active'));
create policy revision_append on public.passport_revisions for insert to strandcue_mutator
  with check (user_id=(select strandcue_private.request_uid()) and exists(select 1 from public.profiles p where p.user_id=passport_revisions.user_id and p.account_status='active'));
create policy operation_read on strandcue_private.passport_operations for select to strandcue_mutator
  using (user_id=(select strandcue_private.request_uid()));
create policy operation_append on strandcue_private.passport_operations for insert to strandcue_mutator
  with check (user_id=(select strandcue_private.request_uid()));

-- Supabase projects may have automatic default public-schema grants.
revoke all on public.profiles, public.hair_passports, public.passport_revisions from public, anon, authenticated;
revoke all on strandcue_private.passport_operations from public, anon, authenticated;
grant select on public.profiles, public.hair_passports, public.passport_revisions to authenticated;
grant select, insert on public.profiles, public.hair_passports, public.passport_revisions,
  strandcue_private.passport_operations to strandcue_mutator;
grant update(revision) on public.profiles to strandcue_mutator;
grant update(revision,current_projection) on public.hair_passports to strandcue_mutator;

-- Match Zod's JavaScript trim and UTF-16 length, including pasted whitespace
-- and supplementary-plane characters, rather than PostgreSQL codepoint count.
create function strandcue_private.trim_text(p_text text)
returns text language sql immutable strict security invoker set search_path='' as $$
  select btrim(p_text, E' \t\n\r\f\v' || chr(160) || chr(5760) || chr(8192) || chr(8193)
    || chr(8194) || chr(8195) || chr(8196) || chr(8197) || chr(8198) || chr(8199)
    || chr(8200) || chr(8201) || chr(8202) || chr(8232) || chr(8233) || chr(8239)
    || chr(8287) || chr(12288) || chr(65279))
$$;
create function strandcue_private.js_length(p_text text)
returns integer language sql immutable strict security invoker set search_path='' as $$
  select coalesce(sum(case when ascii(c)>65535 then 2 else 1 end),0)::integer
    from regexp_split_to_table(p_text,'') c where c<>''
$$;

-- Exact shared-domain whitelist. Returns the normalized patch; it never
-- accepts owner, role, source, account status or client projection fields.
create function strandcue_private.validate_passport(p_patch jsonb, p_baseline boolean)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; allowed text[]; item jsonb; normalized jsonb:=p_patch;
begin
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
    raise exception 'invalid-passport' using errcode='22023';
  end if;
  if p_baseline and not p_patch ?& array['naturalPattern','strandDiameter','density','concerns','goals','budgetPreference'] then
    raise exception 'complete-baseline-required' using errcode='22023';
  end if;
  for k,v in select * from jsonb_each(p_patch) loop
    allowed:=null;
    case k
      when 'naturalPattern' then allowed:=array['straight','wavy','curly','coily','mixed','unknown'];
      when 'strandDiameter' then allowed:=array['fine','medium','coarse','unknown'];
      when 'density','porosity' then allowed:=array['low','medium','high','unknown'];
      when 'greyStatus' then allowed:=array['none','some','mostly','all','unknown'];
      when 'budgetPreference' then allowed:=array['use-owned-first','cheapest-effective','best-value','mid-range','premium','no-preference'];
      when 'stylingFrequency' then allowed:=array['daily','several-times-weekly','weekly','less-than-weekly','unknown'];
      when 'concerns' then allowed:=array['dryness','frizz','tangling','breakage','split-ends','stiffness','dullness','scalp-dryness','scalp-oiliness','shedding-or-thinning','reported-damage','none','unknown'];
      when 'goals' then allowed:=array['shine','length-retention','definition','moisture-retention','reduced-frizz','manageability','volume','none','unknown'];
      when 'scalpObservations' then allowed:=array['dryness','oiliness','flaking','sensitivity','none','unknown'];
      when 'environmentSensitivities' then allowed:=array['humidity','dry-air','wind','water-quality','none','unknown'];
      when 'lengthCm','maximumProductBudgetZar' then
        -- JSON numbers must remain finite when consumed by the JavaScript domain.
        if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<0
          or (v#>>'{}')::numeric>1.7976931348623157e308::numeric) then
          raise exception 'invalid-passport' using errcode='22023';
        end if;
      when 'notes' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}'))>2000 then raise exception 'invalid-passport' using errcode='22023'; end if;
          normalized:=jsonb_set(normalized,array[k],to_jsonb(strandcue_private.trim_text(v#>>'{}')));
        end if;
      when 'stylingHabits' then
        if jsonb_typeof(v)<>'array' then raise exception 'invalid-passport' using errcode='22023'; end if;
        if jsonb_array_length(v)>50 then raise exception 'invalid-passport' using errcode='22023'; end if;
        for item in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(item)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(item#>>'{}')) not between 1 and 100 then raise exception 'invalid-passport' using errcode='22023'; end if;
        end loop;
        normalized:=jsonb_set(normalized,array[k],(select coalesce(jsonb_agg(strandcue_private.trim_text(x#>>'{}')),'[]'::jsonb) from jsonb_array_elements(v) x));
      when 'wigOrExtensions' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'object' then raise exception 'invalid-passport' using errcode='22023'; end if;
          if not v ? 'observationTarget' or v->>'observationTarget' not in ('natural-hair','added-hair','both','unknown')
            or jsonb_typeof(v->'observationTarget')<>'string'
            or exists(select 1 from jsonb_object_keys(v) x where x not in ('type','material','observationTarget')) then
            raise exception 'invalid-passport' using errcode='22023';
          end if;
          for item in select value from jsonb_each(v) where key in ('type','material') loop
            if item<>'null'::jsonb and (jsonb_typeof(item)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(item#>>'{}')) not between 1 and 100) then raise exception 'invalid-passport' using errcode='22023'; end if;
          end loop;
          normalized:=jsonb_set(normalized,array[k],(select jsonb_object_agg(key,case when key in ('type','material') and value<>'null'::jsonb then to_jsonb(strandcue_private.trim_text(value#>>'{}')) else value end) from jsonb_each(v)));
        end if;
      else raise exception 'invalid-passport' using errcode='22023';
    end case;
    if allowed is not null then
      if k in ('concerns','goals','scalpObservations','environmentSensitivities') then
        if jsonb_typeof(v)<>'array' then raise exception 'invalid-passport' using errcode='22023'; end if;
        if jsonb_array_length(v)<1 or (jsonb_array_length(v)>1 and (v ? 'none' or v ? 'unknown')) then raise exception 'invalid-passport' using errcode='22023'; end if;
        for item in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(item)<>'string' or not (item#>>'{}'=any(allowed)) then raise exception 'invalid-passport' using errcode='22023'; end if;
        end loop;
      elsif not (k='greyStatus' and v='null'::jsonb) then
        if jsonb_typeof(v)<>'string' or not (v#>>'{}'=any(allowed)) then raise exception 'invalid-passport' using errcode='22023'; end if;
      end if;
    end if;
  end loop;
  return normalized;
end $$;

create function strandcue_private.date_interval(p_date jsonb)
returns table(start_date date,end_date date) language plpgsql stable security invoker set search_path='' as $$
declare precision_text text:=p_date->>'precision'; value_text text:=p_date->>'value';
begin
  if p_date is null or jsonb_typeof(p_date)<>'object' then raise exception 'invalid-effective-date'; end if;
  if not p_date ?& array['precision','value'] or (select count(*) from jsonb_object_keys(p_date))<>2 then raise exception 'invalid-effective-date'; end if;
  case precision_text
    when 'unknown' then
      if p_date->'value'<>'null'::jsonb then raise exception 'invalid-effective-date'; end if;
    when 'day' then
      if value_text is null or value_text !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'invalid-effective-date'; end if;
      start_date:=value_text::date; end_date:=start_date;
    when 'month' then
      if value_text is null or value_text !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' then raise exception 'invalid-effective-date'; end if;
      start_date:=(value_text||'-01')::date; end_date:=(start_date+interval '1 month -1 day')::date;
    when 'year' then
      if value_text is null or value_text !~ '^[1-9][0-9]{3}$' then raise exception 'invalid-effective-date'; end if;
      start_date:=(value_text||'-01-01')::date; end_date:=(value_text||'-12-31')::date;
    else raise exception 'invalid-effective-date';
  end case;
  if precision_text<>'unknown' and jsonb_typeof(p_date->'value')<>'string' then raise exception 'invalid-effective-date'; end if;
  if start_date>(now() at time zone 'Africa/Johannesburg')::date then raise exception 'invalid-effective-date'; end if;
  return next;
exception when others then raise exception 'invalid-effective-date' using errcode='22023';
end $$;

-- Field-wise interval projection. Correction leaves inherit root traversal
-- order, but candidates remain in their actual revision sequence order.
create function strandcue_private.project_passport(p_passport_id uuid,p_as_of date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare field record; candidate jsonb; values_json jsonb:='{}'; ambiguous jsonb:='{}'; applied jsonb:='[]'; superseded jsonb; candidates jsonb; has_possible boolean; has_definite boolean; distinct_values integer;
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  for field in
    with recursive chain as (
      select r.*,r.sequence root_sequence from public.passport_revisions r where r.passport_id=p_passport_id and r.kind<>'correction'
      union all
      select r.*,c.root_sequence from chain c join public.passport_revisions r on r.corrects_id=c.id
    ), facts as (
      select c.*,j.key,j.value, array_position(array['naturalPattern','strandDiameter','density','lengthCm','greyStatus','porosity','scalpObservations','concerns','goals','stylingHabits','stylingFrequency','environmentSensitivities','budgetPreference','maximumProductBudgetZar','wigOrExtensions','notes'],j.key) field_order
      from chain c cross join lateral jsonb_each(c.patch) j
      where not exists(select 1 from public.passport_revisions r where r.corrects_id=c.id)
        and (c.effective_start is null or c.effective_start<=p_as_of)
    )
    select key, jsonb_agg(jsonb_build_object('revisionId',id,'value',value,'sequence',sequence,'start',effective_start,'end',effective_end,
      'applicability',case when effective_end<=p_as_of then 'definite' else 'possible' end) order by sequence) facts
    from facts group by key order by min(root_sequence*100+field_order)
  loop
    select jsonb_agg(c order by (c->>'sequence')::integer),
      bool_or(c->>'applicability'='possible'),bool_or(c->>'applicability'='definite'),count(distinct c->'value')
    into candidates,has_possible,has_definite,distinct_values
    from jsonb_array_elements(field.facts) c
    where c->>'applicability'='possible' or not exists (
      select 1 from jsonb_array_elements(field.facts) other
      where other->>'applicability'='definite' and (c->>'end')::date<(other->>'start')::date
    );
    if (has_possible and not has_definite) or distinct_values>1 then
      ambiguous:=ambiguous||jsonb_build_object(field.key,jsonb_build_object(
        'reason',case when has_possible then 'uncertain-as-of' else 'overlapping-effective-intervals' end,
        'candidates',(select jsonb_agg(c-'sequence'-'start'-'end') from jsonb_array_elements(candidates) c)));
    else
      values_json:=values_json||jsonb_build_object(field.key,candidates->0->'value');
      for candidate in select * from jsonb_array_elements(candidates) loop
        if not applied @> jsonb_build_array(candidate->'revisionId') then applied:=applied||jsonb_build_array(candidate->'revisionId'); end if;
      end loop;
    end if;
  end loop;
  select coalesce(jsonb_agg(r.id order by r.sequence),'[]'::jsonb) into superseded
    from public.passport_revisions r where r.passport_id=p_passport_id and exists(select 1 from public.passport_revisions c where c.corrects_id=r.id);
  return jsonb_build_object('asOf',p_as_of,'values',values_json,'ambiguousFields',ambiguous,'appliedRevisionIds',applied,'supersededRevisionIds',superseded);
end $$;

create function strandcue_private.complete_account(p_username text,p_eligible boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=strandcue_private.request_uid(); claims jsonb:=strandcue_private.request_claims(); profile public.profiles; normalized text:=lower(strandcue_private.trim_text(p_username));
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  if claims->>'sub' is distinct from uid::text or claims->>'role' is distinct from 'authenticated'
    or coalesce((claims->>'is_anonymous')::boolean,true)
    or nullif(claims->>'email','') is null then
    raise exception 'email-not-verified' using errcode='42501';
  end if;
  if p_eligible is distinct from true then raise exception 'eligibility-required' using errcode='22023'; end if;
  if normalized is null or normalized !~ '^[a-z0-9_]{3,24}$' or normalized in ('admin','administrator','root','system','support','strandcue','moderator','null','undefined','api','help') then raise exception 'invalid-username' using errcode='22023'; end if;
  -- Serialize first completion before there is a profile row to lock.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into profile from public.profiles where user_id=uid for update;
  if found then
    if profile.account_status<>'active' then raise exception 'account-not-active' using errcode='42501'; end if;
    if profile.username<>normalized then raise exception 'profile-already-complete' using errcode='23505'; end if;
  else
    begin
      insert into public.profiles(user_id,username,eligible) values(uid,normalized,true) returning * into profile;
    exception when unique_violation then raise exception 'username-unavailable' using errcode='23505'; end;
    insert into public.hair_passports(user_id) values(uid);
  end if;
  return jsonb_build_object('userId',profile.user_id,'username',profile.username,'eligible',profile.eligible,'country',profile.country,'currency',profile.currency,'temperatureUnit',profile.temperature_unit,'accountStatus',profile.account_status,'revision',profile.revision);
end $$;

create function strandcue_private.mutate_passport(p_operation_id uuid,p_expected_revision integer,p_kind text,p_effective_date jsonb,p_patch jsonb,p_corrects_id uuid,p_correction_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=strandcue_private.request_uid(); profile public.profiles; passport public.hair_passports; previous strandcue_private.passport_operations; payload jsonb; normalized jsonb; effective record; root_kind text; projection jsonb; result_json jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  select * into profile from public.profiles where user_id=uid for update;
  if not found or profile.account_status<>'active' then raise exception 'account-not-active' using errcode='42501'; end if;
  if p_operation_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'invalid-operation' using errcode='22023'; end if;
  payload:=jsonb_build_object('expectedRevision',p_expected_revision,'kind',p_kind,'effectiveDate',p_effective_date,'patch',p_patch,'correctsId',p_corrects_id,'correctionReason',p_correction_reason);
  select * into previous from strandcue_private.passport_operations where user_id=uid and operation_id=p_operation_id;
  if found then
    if previous.payload<>payload then raise exception 'operation-conflict' using errcode='23505'; end if;
    return previous.result;
  end if;
  select * into strict passport from public.hair_passports where user_id=uid for update;
  if passport.revision<>p_expected_revision then raise exception 'revision-conflict' using errcode='40001'; end if;
  if p_kind is null or p_kind not in ('baseline','change','correction') or (passport.revision=0)<>(p_kind='baseline') then raise exception 'invalid-revision-kind' using errcode='22023'; end if;
  if p_kind='correction' then
    if p_corrects_id is null or p_correction_reason is null or strandcue_private.js_length(strandcue_private.trim_text(p_correction_reason)) not between 1 and 500 then raise exception 'invalid-correction' using errcode='22023'; end if;
    if not exists(select 1 from public.passport_revisions where id=p_corrects_id and passport_id=passport.id and user_id=uid) then raise exception 'correction-target-not-found' using errcode='22023'; end if;
    if exists(select 1 from public.passport_revisions where corrects_id=p_corrects_id) then raise exception 'already-corrected' using errcode='23505'; end if;
    with recursive ancestors as (
      select r.id,r.kind,r.corrects_id from public.passport_revisions r where r.id=p_corrects_id
      union all select r.id,r.kind,r.corrects_id from ancestors a join public.passport_revisions r on r.id=a.corrects_id
    ) select kind into root_kind from ancestors where corrects_id is null;
  elsif p_corrects_id is not null or p_correction_reason is not null then raise exception 'invalid-correction' using errcode='22023';
  end if;
  normalized:=strandcue_private.validate_passport(p_patch,p_kind='baseline' or coalesce(root_kind='baseline',false));
  select * into effective from strandcue_private.date_interval(p_effective_date);
  insert into public.passport_revisions(user_id,passport_id,sequence,base_revision,kind,effective_date,effective_start,effective_end,source,patch,corrects_id,correction_reason)
    values(uid,passport.id,passport.revision+1,passport.revision,p_kind,p_effective_date,effective.start_date,effective.end_date,
      case when p_effective_date->>'precision'='day' then 'user-reported' else 'user-estimated' end,normalized,p_corrects_id,strandcue_private.trim_text(p_correction_reason));
  projection:=strandcue_private.project_passport(passport.id,(now() at time zone 'Africa/Johannesburg')::date);
  update public.hair_passports set revision=passport.revision+1,current_projection=projection where id=passport.id;
  result_json:=jsonb_build_object('passportId',passport.id,'revision',passport.revision+1,'projection',projection);
  insert into strandcue_private.passport_operations(user_id,operation_id,payload,result) values(uid,p_operation_id,payload,result_json);
  return result_json;
end $$;

create function strandcue_private.get_passport(p_as_of date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=strandcue_private.request_uid(); passport public.hair_passports; revisions_json jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where user_id=uid and account_status='active') then raise exception 'account-not-active' using errcode='42501'; end if;
  if p_as_of is null or p_as_of<date '1000-01-01' or p_as_of>date '9999-12-31' then raise exception 'invalid-as-of' using errcode='22023'; end if;
  select * into passport from public.hair_passports where user_id=uid;
  if not found or passport.revision=0 then return null; end if;
  select jsonb_agg(jsonb_build_object('id',r.id,'passportId',r.passport_id,'sequence',r.sequence,'baseRevision',r.base_revision,
    'kind',r.kind,'effectiveDate',r.effective_date,'recordedAt',to_char(r.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',r.source,'patch',r.patch)
    ||case when r.kind='correction' then jsonb_build_object('correctsId',r.corrects_id,'correctionReason',r.correction_reason) else '{}'::jsonb end order by r.sequence)
    into revisions_json from public.passport_revisions r where r.passport_id=passport.id;
  return jsonb_build_object('passportId',passport.id,'revision',passport.revision,'projection',strandcue_private.project_passport(passport.id,p_as_of),'revisions',revisions_json);
end $$;

-- Invoker wrappers provide the stable PostgREST API. They are not a security
-- boundary: each private core independently checks auth context and status.
create function public.complete_account(p_username text,p_eligible boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  return strandcue_private.complete_account(p_username,p_eligible);
end $$;
create function public.mutate_passport(p_operation_id uuid,p_expected_revision integer,p_kind text,p_effective_date jsonb,p_patch jsonb,p_corrects_id uuid default null,p_correction_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  return strandcue_private.mutate_passport(p_operation_id,p_expected_revision,p_kind,p_effective_date,p_patch,p_corrects_id,p_correction_reason);
end $$;
create function public.get_passport(p_as_of date default ((now() at time zone 'Africa/Johannesburg')::date))
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode='42501'; end if;
  return strandcue_private.get_passport(p_as_of);
end $$;

alter function strandcue_private.complete_account(text,boolean) owner to strandcue_mutator;
alter function strandcue_private.mutate_passport(uuid,integer,text,jsonb,jsonb,uuid,text) owner to strandcue_mutator;
alter function strandcue_private.get_passport(date) owner to strandcue_mutator;
revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke all on all functions in schema strandcue_private from public, anon, authenticated;
grant execute on all functions in schema strandcue_private to strandcue_mutator;
grant execute on function strandcue_private.request_uid() to authenticated;
grant execute on function strandcue_private.complete_account(text,boolean),strandcue_private.mutate_passport(uuid,integer,text,jsonb,jsonb,uuid,text),strandcue_private.get_passport(date) to authenticated;
revoke all on function public.complete_account(text,boolean), public.mutate_passport(uuid,integer,text,jsonb,jsonb,uuid,text),public.get_passport(date) from public, anon, authenticated;
grant execute on function public.complete_account(text,boolean),public.mutate_passport(uuid,integer,text,jsonb,jsonb,uuid,text),public.get_passport(date) to authenticated;

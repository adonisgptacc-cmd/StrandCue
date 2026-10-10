-- Supabase's verified amr timestamp is a Unix-second JSON number.
-- Only the app's supported password sign-in can establish recent auth;
-- token refresh/recovery/unknown methods cannot extend that authentication.
create or replace function strandcue_private.recent_auth(p_window_minutes integer default 15)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare claims jsonb; item jsonb; ts timestamptz;
begin
  if p_window_minutes is null or p_window_minutes not between 1 and 15 then return false; end if;
  begin
    claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  exception when others then return false;
  end;
  if claims is null or jsonb_typeof(claims)<>'object'
    or jsonb_typeof(claims->'amr') is distinct from 'array' then return false; end if;
  for item in select * from jsonb_array_elements(claims->'amr') loop
    if jsonb_typeof(item) is distinct from 'object'
      or item->>'method' is distinct from 'password'
      or jsonb_typeof(item->'timestamp') is distinct from 'number'
      or (item->>'timestamp') !~ '^[0-9]{1,12}$' then continue; end if;
    begin
      ts := to_timestamp((item->>'timestamp')::double precision);
    exception when others then continue;
    end;
    if ts >= now()-make_interval(mins=>p_window_minutes) and ts <= now() then return true; end if;
  end loop;
  return false;
end $$;
-- CREATE OR REPLACE preserves ownership, fixed search_path and existing ACL.

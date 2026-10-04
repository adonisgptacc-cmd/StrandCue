-- Forward-only input hardening: there are six regions and six segments.
-- Preserve existing history; reject malformed/new oversized input before iteration.
create or replace function strandcue_private.validate_activity_zones(p_zones jsonb)
returns void language plpgsql immutable security invoker set search_path = '' as $$
declare item jsonb;
begin
  if p_zones is null or jsonb_typeof(p_zones) <> 'array' then
    raise exception 'invalid-zones' using errcode = '22023';
  end if;
  if jsonb_array_length(p_zones) > 36 then
    raise exception 'invalid-zones' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_zones) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'invalid-zones' using errcode = '22023';
    end if;
    if not (item ? 'region' and item ? 'segment')
      or item - 'region' - 'segment' <> '{}'::jsonb
      or jsonb_typeof(item->'region') is distinct from 'string'
      or jsonb_typeof(item->'segment') is distinct from 'string'
      or item->>'region' not in ('whole_head','front','crown','nape','other','unknown')
      or item->>'segment' not in ('entire_strand','roots','mid_lengths','ends','other','unknown') then
      raise exception 'invalid-zones' using errcode = '22023';
    end if;
  end loop;
end;
$$;
-- CREATE OR REPLACE retains the existing owner and restricted ACL.

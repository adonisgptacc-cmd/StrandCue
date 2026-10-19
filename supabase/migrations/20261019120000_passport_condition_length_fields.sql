-- Forward-only extension of the shared Hair Passport contract.
--
-- Adds unknown-aware condition and length-measurement facts without inventing
-- values for existing records: old patches simply omit the new keys, and the
-- projection leaves omitted fields absent. This migration only replaces the
-- whitelist validator; projection already walks every stored patch key.
create or replace function strandcue_private.validate_passport(p_patch jsonb, p_baseline boolean)
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
      when 'damageObservation' then allowed:=array['none','mild','moderate','significant','unknown'];
      when 'heatPreference' then allowed:=array['avoid','low','moderate','high','unknown'];
      when 'lengthUnit' then allowed:=array['cm','in','unknown'];
      when 'lengthPrecision' then allowed:=array['exact','approximate','unknown'];
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
      when 'lengthMeasuredOn' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
            raise exception 'invalid-passport' using errcode='22023';
          end if;
        end if;
      when 'notes' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}'))>2000 then raise exception 'invalid-passport' using errcode='22023'; end if;
          normalized:=jsonb_set(normalized,array[k],to_jsonb(strandcue_private.trim_text(v#>>'{}')));
        end if;
      when 'reactionsAvoidances' then
        if jsonb_typeof(v)<>'array' then raise exception 'invalid-passport' using errcode='22023'; end if;
        if jsonb_array_length(v)>50 then raise exception 'invalid-passport' using errcode='22023'; end if;
        for item in select * from jsonb_array_elements(v) loop
          if jsonb_typeof(item)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(item#>>'{}')) not between 1 and 100 then raise exception 'invalid-passport' using errcode='22023'; end if;
        end loop;
        normalized:=jsonb_set(normalized,array[k],(select coalesce(jsonb_agg(strandcue_private.trim_text(x#>>'{}')),'[]'::jsonb) from jsonb_array_elements(v) x));
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

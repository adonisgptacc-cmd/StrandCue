-- Forward-only extension of the shared Hair Passport contract.
--
-- Adds unknown-aware condition, heat-preference, reaction and structured
-- length-measurement facts without inventing values for existing records:
-- old patches simply omit the new keys, and the projection leaves omitted
-- fields absent.
--
-- Length contract agreement with packages/domain/src/passport.ts:
-- * the legacy readable `lengthCm` centimetre field cannot be written with a
--   new number; new writes may only clear it with an explicit null;
-- * a new measurement is one structured object: a numeric value always with
--   its unit, a known unit always with a value, optional precision (omitted
--   stays distinct from "unknown") and an optional real calendar date
--   (leap days valid, impossible days rejected);
-- * one documented unreasonable-length bound: at most 300 cm after
--   converting inches with factor 2.54 (tolerance 1e-9 matches the
--   JavaScript float conversion edge).
--
-- This migration (1) replaces the whitelist validator, (2) restores the
-- projection field-order catalogue agreement with the domain field list,
-- and (3) adds a record-level guard so a structured measurement can never
-- project alongside a still-recorded legacy centimetre value. Projection
-- already walks every stored patch key, so stored legacy values stay
-- readable and historical revisions stay untouched.
create or replace function strandcue_private.validate_passport(p_patch jsonb, p_baseline boolean)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; allowed text[]; item jsonb; normalized jsonb:=p_patch; measurement jsonb;
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
      when 'heatPreference' then allowed:=array['avoid-heat','minimise-heat','lower-heat-when-practical','no-preference','unknown'];
      when 'budgetPreference' then allowed:=array['use-owned-first','cheapest-effective','best-value','mid-range','premium','no-preference'];
      when 'stylingFrequency' then allowed:=array['daily','several-times-weekly','weekly','less-than-weekly','unknown'];
      when 'concerns' then allowed:=array['dryness','frizz','tangling','breakage','split-ends','stiffness','dullness','scalp-dryness','scalp-oiliness','shedding-or-thinning','reported-damage','none','unknown'];
      when 'goals' then allowed:=array['shine','length-retention','definition','moisture-retention','reduced-frizz','manageability','volume','none','unknown'];
      when 'scalpObservations' then allowed:=array['dryness','oiliness','flaking','sensitivity','none','unknown'];
      when 'environmentSensitivities' then allowed:=array['humidity','dry-air','wind','water-quality','none','unknown'];
      when 'lengthCm' then
        -- Legacy compatibility is read-only: existing stored values stay
        -- readable, but new writes may only clear the legacy field so a new
        -- measurement never mixes centimetres and inches in one contract.
        if v<>'null'::jsonb then raise exception 'invalid-passport' using errcode='22023'; end if;
      when 'maximumProductBudgetZar' then
        -- JSON numbers must remain finite when consumed by the JavaScript domain,
        -- and beyond-double literals must not leak a raw numeric-overflow error.
        begin
          if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<0
            or (v#>>'{}')::numeric>1.7976931348623157e308::numeric) then
            raise exception 'invalid-passport' using errcode='22023';
          end if;
        exception when others then raise exception 'invalid-passport' using errcode='22023';
        end;
      when 'lengthMeasurement' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'object' then raise exception 'invalid-passport' using errcode='22023'; end if;
          -- A numeric value always requires its unit, and a unit cannot exist
          -- without its value: both keys are mandatory in one measurement.
          if not (v ? 'value' and v ? 'unit') then raise exception 'invalid-passport' using errcode='22023'; end if;
          if exists(select 1 from jsonb_object_keys(v) x
            where x not in ('value','unit','precision','measuredOn')) then
            raise exception 'invalid-passport' using errcode='22023';
          end if;
          measurement:=v;
          -- The unit is validated before any conversion so the centimetre
          -- comparison is always anchored on a checked unit.
          if jsonb_typeof(measurement->'unit')<>'string' or measurement->>'unit' not in ('cm','in') then
            raise exception 'invalid-passport' using errcode='22023';
          end if;
          -- Pathologically large JSON numbers would overflow the PostgreSQL
          -- numeric cast itself (SQLSTATE 22003) before any comparison runs;
          -- the boundary answers the domain message instead of a raw cast
          -- error.
          begin
            if jsonb_typeof(measurement->'value')<>'number' then raise exception 'invalid-passport' using errcode='22023'; end if;
            if (measurement->>'value')::numeric<=0
              or (measurement->>'value')::numeric>1.7976931348623157e308::numeric
              or (measurement->>'value')::numeric*(case measurement->>'unit' when 'in' then 2.54 else 1 end)>300.000000001::numeric then
              raise exception 'invalid-passport' using errcode='22023';
            end if;
          exception when others then raise exception 'invalid-passport' using errcode='22023';
          end;
          if measurement ? 'precision' then
            if jsonb_typeof(measurement->'precision')<>'string'
              or measurement->'precision' not in ('"exact"','"approximate"','"unknown"') then
              raise exception 'invalid-passport' using errcode='22023';
            end if;
          end if;
          if measurement ? 'measuredOn' and measurement->'measuredOn'<>'null'::jsonb then
            if jsonb_typeof(measurement->'measuredOn')<>'string'
              or (measurement->>'measuredOn') !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
              raise exception 'invalid-passport' using errcode='22023';
            end if;
            begin
              perform (measurement->>'measuredOn')::date;
            exception when others then raise exception 'invalid-passport' using errcode='22023';
            end;
          end if;
        end if;
      when 'notes' then
        if v<>'null'::jsonb then
          if jsonb_typeof(v)<>'string' or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}'))>2000 then raise exception 'invalid-passport' using errcode='22023'; end if;
          normalized:=jsonb_set(normalized,array[k],to_jsonb(strandcue_private.trim_text(v#>>'{}')));
        end if;
      when 'reactionsAvoidances' then
        if jsonb_typeof(v)<>'array' then raise exception 'invalid-passport' using errcode='22023'; end if;
        if jsonb_array_length(v)<1 or jsonb_array_length(v)>50 then raise exception 'invalid-passport' using errcode='22023'; end if;
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
  -- Patch-local mixing cannot happen: a numeric `lengthCm` value already
  -- raises inside its whitelist case above. The record-level invariant —
  -- no badge of one current length while a legacy centimetre value is still
  -- projected — lives in the trigger installed at the end of this file,
  -- because a plain validator is immutable and cannot see stored state.
  return normalized;
end $$;

-- Record-level invariants for length writes:
-- 1. the projection of the current record can never hold one structured
--    length while a legacy numeric centimetre value is still recorded,
--    unless the same append explicitly retires the legacy field (jsonb
--    null). A plain validator is immutable and cannot see stored state,
--    so this guard recomputes the would-merge state from all recorded
--    history as of an unbounded date (every recorded fact is definite
--    there, independent of which stored projection snapshot a prepare
--    step left behind).
-- 2. a structured measurement is never dated after today, matching the
--    submission boundary; the immutable whitelist validator cannot
--    consult a clock, so the trigger carries the rule.
create function strandcue_private.guard_mixed_passport_length()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if coalesce(jsonb_typeof(new.patch->'lengthMeasurement'),'null')='object' then
    if jsonb_typeof((select strandcue_private.project_passport(new.passport_id,'infinity'::date)->'values'->'lengthCm'))='number'
      and jsonb_typeof(new.patch->'lengthCm') is distinct from 'null' then
      raise exception 'invalid-passport' using errcode='22023';
    end if;
    -- The server here runs UTC, while the domain compares against the
    -- Africa/Johannesburg calendar day; a write is only refused when it is
    -- strictly after both today forms, so the two boundaries can disagree
    -- only in the hours where SAST is already tomorrow and the domain is
    -- the stricter answer anyway. An absent measuredOn makes the
    -- comparison NULL and passes.
    if new.patch->'lengthMeasurement'->>'measuredOn' > greatest(current_date::text,
      (current_timestamp at time zone 'Africa/Johannesburg')::date::text) then
      raise exception 'invalid-passport' using errcode='22023';
    end if;
  end if;
  return new;
end $$;

create trigger guard_mixed_passport_length
  before insert on public.passport_revisions
  for each row execute function strandcue_private.guard_mixed_passport_length();

-- New functions receive a default EXECUTE grant to PUBLIC; the hardening
-- audit requires anonymous callers to hold no execute privilege anywhere
-- in the application schemas. Trigger invocation does not consult EXECUTE.
revoke execute on function strandcue_private.guard_mixed_passport_length() from public;

-- Field-wise interval projection, restated so the deterministic field-order
-- catalogue matches the domain field list in packages/domain/src/passport.ts
-- (the v2 field keys following lengthCm). Identical to the foundation
-- definition except for the ordering array; no key is filtered, so stored
-- legacy projections stay verbatim.
create or replace function strandcue_private.project_passport(p_passport_id uuid,p_as_of date)
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
      select c.*,j.key,j.value, array_position(array['naturalPattern','strandDiameter','density','lengthCm','lengthMeasurement','greyStatus','porosity','damageObservation','heatPreference','reactionsAvoidances','scalpObservations','concerns','goals','stylingHabits','stylingFrequency','environmentSensitivities','budgetPreference','maximumProductBudgetZar','wigOrExtensions','notes'],j.key) field_order
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

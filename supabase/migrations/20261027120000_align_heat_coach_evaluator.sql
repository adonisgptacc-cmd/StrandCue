-- Forward-only migration: align the SQL Heat Coach evaluator with the reviewed
-- I6.1 domain evaluator (evaluateHeatCoach). Does not edit the committed
-- 20261026120000_heat_coach_assessments.sql migration. Publishes no rule and
-- invents no capability, evidence, or reviewer.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;

create or replace function strandcue_private.heat_evaluate(p_input jsonb, p_rule jsonb)
returns jsonb language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  v_request jsonb := p_input -> 'request';
  v_prepared jsonb := coalesce(p_input -> 'preparedInput', '{}'::jsonb);
  v_missing jsonb := '[]'::jsonb;
  v_method text;
  v_state text := null;
  v_reason_code text := coalesce(p_rule->>'reasonCode','content_pending');
  v_copy_key text := coalesce(p_rule->>'copyKey','heat.content_pending');
  v_necessity text := 'unknown';
  v_selected jsonb := jsonb_build_object(
    'method', null,
    'temperature', null,
    'setting', null,
    'passes', null,
    'durationMinutes', null,
    'zones', '[]'::jsonb
  );
  v_tool jsonb;
  v_product jsonb;
  v_temperature numeric;
  v_max numeric;
  v_limit_unit text;
  v_alternatives jsonb := '[]'::jsonb;
  v_recent_heat integer := 0;
  v_as_of timestamptz;
  v_r jsonb;
  v_concern text;
  v_found boolean;
begin
  -- These fields belong to the domain evaluator's base decision and therefore
  -- must be computed even when publication or restriction checks exit early.
  v_as_of := (p_input->>'asOf')::timestamptz;
  v_necessity := coalesce((
    select r->>'necessity'
    from jsonb_array_elements(coalesce(p_rule->'necessityRules','[]'::jsonb)) with ordinality as rules(r, ordinal)
    where coalesce(r->'goals','[]'::jsonb) ? (v_prepared#>>'{goal,id}')
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(r->'concerns','[]'::jsonb)) required(concern)
        where not coalesce(v_prepared#>'{currentCondition,concerns}','[]'::jsonb) ? (concern #>> '{}')
      )
    order by ordinal
    limit 1
  ), 'unknown');
  select count(*)::integer into v_recent_heat
  from jsonb_array_elements(coalesce(p_input->'confirmedCareEvents','[]'::jsonb)) event
  where event->>'kind' = 'heat'
    and event->>'lifecycle' = 'active'
    and event#>>'{date,precision}' = 'exact'
    and (event#>>'{date,value}')::timestamptz <= v_as_of;

  <<evaluation>>
  begin
  -- 1. Require one exact reviewed, current publication.
  if coalesce(p_rule->>'lifecycle','') <> 'reviewed' then
    v_state := 'content_pending';
    exit evaluation;
  end if;

  -- 2. Validity interval (explicit asOf, no wall clock).
  if p_rule ? 'validFrom' and p_rule->>'validFrom' is not null
     and v_as_of < (p_rule->>'validFrom')::timestamptz then
    v_state := 'unavailable'; v_reason_code := 'publication_unavailable'; v_copy_key := 'heat.unavailable.publication';
    exit evaluation;
  end if;
  if p_rule ? 'validUntil' and p_rule->>'validUntil' is not null
     and v_as_of > (p_rule->>'validUntil')::timestamptz then
    v_state := 'unavailable'; v_reason_code := 'publication_unavailable'; v_copy_key := 'heat.unavailable.publication';
    exit evaluation;
  end if;

  -- 3. Active hard restrictions run BEFORE missing-fact / necessity decisions.
  v_r := null;
  for v_r in
    select r from jsonb_array_elements(coalesce(p_rule->'hardRestrictions','[]'::jsonb)) r
  loop
    v_found := true;
    -- Every restriction concern must be present in the current condition.
    if coalesce(jsonb_array_length(v_r->'concerns'),0) > 0 then
      for v_concern in
        select q #>> '{}' from jsonb_array_elements(v_r->'concerns') q
      loop
        if not exists(select 1 from jsonb_array_elements(coalesce(v_prepared->'currentCondition'->'concerns','[]'::jsonb)) c
                        where c #>> '{}' = v_concern) then
          v_found := false; exit;
        end if;
      end loop;
    end if;
    if v_found and v_r ? 'servicePresence' and v_r->>'servicePresence' is not null then
      v_found := exists(select 1 from jsonb_array_elements(coalesce(v_prepared->'chemicalServices','[]'::jsonb)) s
                        where s->>'presence' = v_r->>'servicePresence');
    end if;
    if v_found and coalesce(jsonb_array_length(v_r->'zones'),0) > 0 then
      v_found := exists(select 1 from jsonb_array_elements(v_r->'zones') rz
                        join jsonb_array_elements(coalesce(v_request->'zones','[]'::jsonb)) qz
                          on rz->>'region' = qz->>'region' and rz->>'segment' = qz->>'segment');
    end if;
    -- A restriction with no concerns, servicePresence or zones never matches.
    if v_found and coalesce(jsonb_array_length(v_r->'concerns'),0) = 0
       and (v_r->>'servicePresence' is null)
       and coalesce(jsonb_array_length(v_r->'zones'),0) = 0 then
      v_found := false;
    end if;
    if v_found then
      v_state := coalesce(v_r->>'outcome','restricted');
      v_reason_code := coalesce(v_r->>'reasonCode','restriction');
      v_copy_key := coalesce(v_r->>'copyKey','heat.restriction');
      exit evaluation;
    end if;
  end loop;

  -- 4. Necessity / unheated short-circuit (no_heat) before missing facts.
  v_method := case when v_request #>> '{method,state}' in ('known','recorded') then v_request #>> '{method,value}' end;
  if v_necessity = 'not_needed' or v_method = 'unheated' then
    v_state := 'no_heat';
    v_selected := jsonb_build_object(
      'method', 'unheated',
      'temperature', null,
      'setting', null,
      'passes', null,
      'durationMinutes', null,
      'zones', coalesce(v_request->'zones','[]'::jsonb)
    );
    exit evaluation;
  end if;

  -- 5. Required recorded facts (missing facts) without guessing.
  if coalesce(v_prepared->'currentCondition') is null then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','current_condition','destination','my_hair','reasonCode','current_condition_missing','copyKey','heat.missing.current_condition'));
  end if;
  if v_request #>> '{method,state}' = 'unknown' then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','heat_method','destination','my_tools','reasonCode','heat_method_missing','copyKey','heat.missing.heat_method'));
  end if;
  if coalesce(v_request->'toolOwnerItemId','null'::jsonb) = 'null'::jsonb then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','tool','destination','my_tools','reasonCode','tool_missing','copyKey','heat.missing.tool'));
  end if;
  if p_rule -> 'requiredProductCapability' <> 'null'::jsonb
     and coalesce(v_request->'productOwnerItemId','null'::jsonb) = 'null'::jsonb then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','product','destination','my_shelf','reasonCode','product_missing','copyKey','heat.missing.product'));
  end if;
  if jsonb_array_length(coalesce(v_request->'zones','[]'::jsonb)) = 0 then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','zones','destination','today','reasonCode','zones_missing','copyKey','heat.missing.zones'));
  end if;
  -- Temperature: unknown only matters for a heated method without an exact named-setting rule.
  if v_method is distinct from 'unheated' and v_request #>> '{temperature,state}' = 'unknown' then
    v_found := false;
    if v_request ? 'setting' and v_request->'setting' ? 'state' and v_request->>'setting' <> 'null'
       and v_request #>> '{setting,state}' = 'known' then
      for v_r in
        select item from jsonb_array_elements(coalesce(v_prepared->'tools','[]'::jsonb)) item
        where item->>'ownerItemId' = coalesce(v_request->>'toolOwnerItemId','')
      loop
        if jsonb_array_length(coalesce(p_rule->'limits'->'namedSettings','[]'::jsonb)) > 0 then
          if exists(select 1 from jsonb_array_elements(p_rule->'limits'->'namedSettings') ns
                    where ns->>'toolVersionId' = coalesce(v_r->>'versionId','')
                      and ns->>'label' = v_request#>>'{setting,value}') then
            v_found := true; exit;
          end if;
        end if;
      end loop;
    end if;
    if not v_found then
      v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','temperature','destination','my_tools','reasonCode','temperature_missing','copyKey','heat.missing.temperature'));
    end if;
  end if;
  -- Service history: required when a restriction depends on it and a service presence is unknown.
  if exists(select 1 from jsonb_array_elements(coalesce(p_rule->'hardRestrictions','[]'::jsonb)) r where r->>'servicePresence' is not null)
     and exists(select 1 from jsonb_array_elements(coalesce(v_prepared->'chemicalServices','[]'::jsonb)) s where s->>'presence' = 'unknown') then
    v_missing := v_missing || jsonb_build_array(jsonb_build_object('fact','service_history','destination','services','reasonCode','service_history_missing','copyKey','heat.missing.service_history'));
  end if;

  if jsonb_array_length(v_missing) > 0 then
    v_state := 'needs_input';
    exit evaluation;
  end if;

  -- 6. Exact reviewed tool binding + allowed method.
  v_tool := null;
  for v_r in
    select item from jsonb_array_elements(coalesce(v_prepared->'tools','[]'::jsonb)) item
    where item->>'ownerItemId' = coalesce(v_request->>'toolOwnerItemId','')
  loop
    v_tool := v_r; exit;
  end loop;
  if v_tool is null or v_tool->>'identity' <> 'exact' or v_tool->>'review' <> 'reviewed'
     or coalesce((v_tool->>'satisfiesExactCapability')::boolean,false) = false
     or coalesce(v_tool#>>'{ownerFacts,heatMethods,state}','') <> 'recorded'
     or not coalesce(v_tool#>'{ownerFacts,heatMethods,methods}','[]'::jsonb) ? v_method
     or not coalesce(p_rule->'allowedMethods','[]'::jsonb) ? v_method then
    v_state := 'unavailable'; v_reason_code := 'tool_unavailable'; v_copy_key := 'heat.unavailable.tool';
    exit evaluation;
  end if;

  -- 7. Exact reviewed product capability binding.
  if p_rule -> 'requiredProductCapability' <> 'null'::jsonb then
    v_product := null;
    for v_r in
      select item from jsonb_array_elements(coalesce(v_prepared->'products','[]'::jsonb)) item
      where item->>'ownerItemId' = coalesce(v_request->>'productOwnerItemId','')
    loop
      v_product := v_r; exit;
    end loop;
    if v_product is null or v_product->>'identity' <> 'exact' or v_product->>'review' <> 'reviewed'
       or coalesce((v_product->>'satisfiesExactCapability')::boolean,false) = false
       or not coalesce(v_product->'verifiedCapabilities','[]'::jsonb) ? (p_rule->>'requiredProductCapability') then
      v_state := 'unavailable'; v_reason_code := 'product_unavailable'; v_copy_key := 'heat.unavailable.product';
      exit evaluation;
    end if;
  end if;

  -- 8. Temperature limit in the recorded unit (no conversion).
  v_temperature := null;
  if v_request #>> '{temperature,state}' = 'known' then
    v_temperature := (v_request #>> '{temperature,value,value}')::numeric;
  end if;
  v_limit_unit := null;
  v_max := null;
  if v_temperature is not null then
    select ns->>'unit', (ns->>'maximum')::numeric into v_limit_unit, v_max
    from jsonb_array_elements(coalesce(p_rule->'limits'->'temperatures','[]'::jsonb)) ns
    where ns->>'unit' = v_request#>>'{temperature,value,unit}'
    limit 1;
    if v_limit_unit is null then
      v_state := 'unavailable'; v_reason_code := 'unit_unreviewed'; v_copy_key := 'heat.unavailable.unit';
      exit evaluation;
    end if;
  end if;

  -- 9. Named-setting / passes / duration limits.
  if v_request#>>'{passes,state}' = 'known' and p_rule#>>'{limits,maximumPasses}' is not null
     and (v_request#>>'{passes,value}')::integer > (p_rule#>>'{limits,maximumPasses}')::integer then
    v_state := 'restricted'; v_reason_code := 'passes_exceed_limit'; v_copy_key := 'heat.restricted.passes';
    v_selected := jsonb_build_object('method',v_method,
      'temperature',case when v_request#>>'{temperature,state}' in ('known','recorded') then v_request#>'{temperature,value}' else 'null'::jsonb end,
      'setting',case when v_request#>>'{setting,state}' in ('known','recorded') then to_jsonb(v_request#>>'{setting,value}') else 'null'::jsonb end,
      'passes',case when v_request#>>'{passes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{passes,value}')::integer) else 'null'::jsonb end,
      'durationMinutes',case when v_request#>>'{durationMinutes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{durationMinutes,value}')::integer) else 'null'::jsonb end,
      'zones',coalesce(v_request->'zones','[]'::jsonb));
    exit evaluation;
  end if;
  if v_request#>>'{durationMinutes,state}' = 'known' and p_rule#>>'{limits,maximumDurationMinutes}' is not null
     and (v_request#>>'{durationMinutes,value}')::integer > (p_rule#>>'{limits,maximumDurationMinutes}')::integer then
    v_state := 'restricted'; v_reason_code := 'duration_exceeds_limit'; v_copy_key := 'heat.restricted.duration';
    v_selected := jsonb_build_object('method',v_method,
      'temperature',case when v_request#>>'{temperature,state}' in ('known','recorded') then v_request#>'{temperature,value}' else 'null'::jsonb end,
      'setting',case when v_request#>>'{setting,state}' in ('known','recorded') then to_jsonb(v_request#>>'{setting,value}') else 'null'::jsonb end,
      'passes',case when v_request#>>'{passes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{passes,value}')::integer) else 'null'::jsonb end,
      'durationMinutes',case when v_request#>>'{durationMinutes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{durationMinutes,value}')::integer) else 'null'::jsonb end,
      'zones',coalesce(v_request->'zones','[]'::jsonb));
    exit evaluation;
  end if;

  -- 10. Lower-heat clamp when the recorded temperature exceeds its reviewed limit.
  if v_temperature is not null and v_max is not null and v_temperature > v_max then
    v_alternatives := (
      select coalesce(jsonb_agg(a - 'toolVersionId' - 'productVersionId' order by ordinal),'[]'::jsonb)
      from jsonb_array_elements(coalesce(p_rule->'alternatives','[]'::jsonb)) with ordinality alternatives(a, ordinal)
      where a->>'method' = 'unheated'
         or (a->>'toolVersionId' is not null and a->>'toolVersionId' = coalesce(v_tool->>'versionId','')
             and (a->>'productVersionId' is null or a->>'productVersionId' = coalesce(v_product->>'versionId','')))
    );
    v_selected := jsonb_build_object('method',v_method,
      'temperature',jsonb_build_object('value',v_max,'unit',v_limit_unit),
      'setting',case when v_request#>>'{setting,state}' in ('known','recorded') then to_jsonb(v_request#>>'{setting,value}') else 'null'::jsonb end,
      'passes',case when v_request#>>'{passes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{passes,value}')::integer) else 'null'::jsonb end,
      'durationMinutes',case when v_request#>>'{durationMinutes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{durationMinutes,value}')::integer) else 'null'::jsonb end,
      'zones',coalesce(v_request->'zones','[]'::jsonb));
    v_state := 'lower_heat';
    exit evaluation;
  end if;

  -- 11. Appropriate.
  v_alternatives := (
    select coalesce(jsonb_agg(a - 'toolVersionId' - 'productVersionId' order by ordinal),'[]'::jsonb)
    from jsonb_array_elements(coalesce(p_rule->'alternatives','[]'::jsonb)) with ordinality alternatives(a, ordinal)
    where a->>'method' = 'unheated'
       or (a->>'toolVersionId' is not null and a->>'toolVersionId' = coalesce(v_tool->>'versionId','')
           and (a->>'productVersionId' is null or a->>'productVersionId' = coalesce(v_product->>'versionId','')))
  );
  v_state := 'appropriate';
  v_selected := jsonb_build_object('method',v_method,
    'temperature',case when v_request#>>'{temperature,state}' in ('known','recorded') then v_request#>'{temperature,value}' else 'null'::jsonb end,
    'setting',case when v_request#>>'{setting,state}' in ('known','recorded') then to_jsonb(v_request#>>'{setting,value}') else 'null'::jsonb end,
    'passes',case when v_request#>>'{passes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{passes,value}')::integer) else 'null'::jsonb end,
    'durationMinutes',case when v_request#>>'{durationMinutes,state}' in ('known','recorded') then to_jsonb((v_request#>>'{durationMinutes,value}')::integer) else 'null'::jsonb end,
    'zones',coalesce(v_request->'zones','[]'::jsonb));

  end evaluation;
  return jsonb_build_object('schemaVersion',1,'state',coalesce(v_state,'appropriate'),'necessity',coalesce(v_necessity,'unknown'),
    'selected',v_selected,'missing',v_missing,
    'reasons',jsonb_build_array(jsonb_build_object('reasonCode',v_reason_code,'copyKey',v_copy_key)),
    'alternatives',v_alternatives,'recentConfirmedHeatCount',v_recent_heat);
end;
$$;

alter function strandcue_private.heat_evaluate(jsonb,jsonb) owner to strandcue_mutator;
revoke all on function strandcue_private.heat_evaluate(jsonb,jsonb) from public,anon,authenticated;
grant execute on function strandcue_private.heat_evaluate(jsonb,jsonb) to strandcue_mutator;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;
revoke strandcue_mutator from current_user;

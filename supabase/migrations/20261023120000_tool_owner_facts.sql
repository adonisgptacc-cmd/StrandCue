-- My Tools owner facts and the append-only correction boundary (Increment 2, Task 2.4).
--
-- The owner's tool record now holds what the owner can truthfully say about the
-- tool they hold: exact brand, model and type (identity), wattage, whether the
-- temperature is adjustable, available settings with the owner's own units,
-- attachments, condition, heat methods and notes. Nothing here is derived from a
-- model name, a wattage, a tool type, an attachment or a heat method: a
-- temperature exists only when the owner typed one, in the unit they typed it,
-- and wattage and temperature stay independent.
--
-- The write core follows the trusted Shelf boundary (Task 2.1): one facts patch
-- carries every owner answer, so an absent key (never answered), an explicit
-- null (taken back) and a value (recorded, possibly an explicit "unknown") stay
-- three different answers; identity is corrected only through an append-only
-- correction that must materially change the brand, the model or the type;
-- every write is idempotent by operation id, serialized per owner and checked
-- against the expected revision; matching a catalogue version is the only way to
-- link one and it needs explicit confirmation; manual identity survives it.
--
-- Contradictions fail validation and are never repaired: a heat-method list is
-- canonical (fixed order, each method once), "unheated" cannot share a list with
-- a heated method, and an unheated tool cannot also state a temperature.
--
-- Forward-only. The old write core and wrappers (identity as separate
-- parameters, no facts) are dropped: their signatures cannot carry the facts.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- --- Schema -----------------------------------------------------------------

alter table public.user_tools
  add column if not exists wattage_watts integer,
  add column if not exists adjustable_temp text,
  add column if not exists settings jsonb,
  add column if not exists attachments jsonb,
  add column if not exists condition text,
  add column if not exists heat_methods jsonb;

-- The validators are pure and immutable so the table can hold the same rules the write path holds.
create or replace function strandcue_private.tool_heat_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  order_ text[] := array['direct-contact', 'heated-air', 'hooded', 'steam', 'unheated'];
  element jsonb;
  previous integer := 0;
  rank integer;
  total integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or not (p_value ? 'state')
    or jsonb_typeof(p_value -> 'state') <> 'string' then return false; end if;
  if p_value ->> 'state' = 'unknown' then return p_value - 'state' = '{}'::jsonb; end if;
  if p_value ->> 'state' <> 'recorded' or p_value - array['state', 'methods'] <> '{}'::jsonb
    or jsonb_typeof(p_value -> 'methods') is distinct from 'array' then return false; end if;
  total := jsonb_array_length(p_value -> 'methods');
  if total < 1 or total > 5 then return false; end if;
  for element in select value from jsonb_array_elements(p_value -> 'methods') loop
    if jsonb_typeof(element) <> 'string' then return false; end if;
    rank := array_position(order_, element #>> '{}');
    -- A canonical list: known methods only, each once, in the fixed order.
    if rank is null or rank <= previous then return false; end if;
    previous := rank;
  end loop;
  -- An unheated tool cannot also record a heated method.
  if total > 1 and (p_value -> 'methods') @> '"unheated"'::jsonb then return false; end if;
  return true;
end;
$$;

create or replace function strandcue_private.tool_attachments_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  kinds text[] := array['diffuser', 'concentrator', 'comb', 'brush', 'other'];
  item jsonb;
  previous text := '';
  key text;
  kind text;
  other text;
  total integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or not (p_value ? 'state')
    or jsonb_typeof(p_value -> 'state') <> 'string' then return false; end if;
  if p_value ->> 'state' in ('unknown', 'none') then return p_value - 'state' = '{}'::jsonb; end if;
  if p_value ->> 'state' <> 'recorded' or p_value - array['state', 'items'] <> '{}'::jsonb
    or jsonb_typeof(p_value -> 'items') is distinct from 'array' then return false; end if;
  total := jsonb_array_length(p_value -> 'items');
  if total < 1 or total > 10 then return false; end if;
  for item in select value from jsonb_array_elements(p_value -> 'items') loop
    if jsonb_typeof(item) <> 'object' or jsonb_typeof(item -> 'kind') is distinct from 'string' then return false; end if;
    kind := item ->> 'kind';
    if kind <> all (kinds) then return false; end if;
    if kind = 'other' then
      if item - array['kind', 'other'] <> '{}'::jsonb or jsonb_typeof(item -> 'other') is distinct from 'string' then return false; end if;
      other := item ->> 'other';
      if strandcue_private.js_length(strandcue_private.trim_text(other)) not between 1 and 60
        or other <> strandcue_private.trim_text(other) then return false; end if;
    else
      if item - 'kind' <> '{}'::jsonb then return false; end if;
      other := '';
    end if;
    -- Deterministic order and no duplicates: strictly ascending by (kind rank, wording), by code unit.
    key := array_position(kinds, kind)::text || '|' || other;
    if previous <> '' and not (key collate "C" > previous collate "C") then return false; end if;
    previous := key;
  end loop;
  return true;
end;
$$;

create or replace function strandcue_private.tool_settings_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  item jsonb;
  temperature jsonb;
  label text;
  seen text[] := '{}';
  number_ numeric;
  total integer;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' or not (p_value ? 'state')
    or jsonb_typeof(p_value -> 'state') <> 'string' then return false; end if;
  if p_value ->> 'state' = 'unknown' then return p_value - 'state' = '{}'::jsonb; end if;
  if p_value ->> 'state' <> 'recorded' or p_value - array['state', 'items'] <> '{}'::jsonb
    or jsonb_typeof(p_value -> 'items') is distinct from 'array' then return false; end if;
  total := jsonb_array_length(p_value -> 'items');
  if total < 1 or total > 10 then return false; end if;
  for item in select value from jsonb_array_elements(p_value -> 'items') loop
    if jsonb_typeof(item) <> 'object' or item - array['label', 'temperature'] <> '{}'::jsonb
      or not (item ?& array['label', 'temperature']) or jsonb_typeof(item -> 'label') <> 'string' then return false; end if;
    label := item ->> 'label';
    if strandcue_private.js_length(strandcue_private.trim_text(label)) not between 1 and 60
      or label <> strandcue_private.trim_text(label) or label = any (seen) then return false; end if;
    seen := seen || label;
    temperature := item -> 'temperature';
    if jsonb_typeof(temperature) = 'null' then continue; end if;
    -- A temperature exactly as the owner read it: a whole number in a stated unit, in a plausible range.
    if jsonb_typeof(temperature) <> 'object' or temperature - array['value', 'unit'] <> '{}'::jsonb
      or not (temperature ?& array['value', 'unit']) or jsonb_typeof(temperature -> 'value') <> 'number'
      or jsonb_typeof(temperature -> 'unit') <> 'string' then return false; end if;
    number_ := (temperature ->> 'value')::numeric;
    if number_ <> trunc(number_) then return false; end if;
    if temperature ->> 'unit' = 'C' then
      if number_ not between 30 and 300 then return false; end if;
    elsif temperature ->> 'unit' = 'F' then
      if number_ not between 86 and 572 then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Whether recorded settings state a temperature at all.
create or replace function strandcue_private.tool_settings_state_temperature(p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_value ->> 'state' = 'recorded' and exists (
    select 1 from jsonb_array_elements(p_value -> 'items') item where jsonb_typeof(item -> 'temperature') = 'object'), false);
$$;

alter table public.user_tools
  drop constraint if exists user_tools_wattage_check,
  drop constraint if exists user_tools_adjustable_temp_check,
  drop constraint if exists user_tools_condition_check,
  drop constraint if exists user_tools_settings_check,
  drop constraint if exists user_tools_attachments_check,
  drop constraint if exists user_tools_heat_methods_check;
alter table public.user_tools
  add constraint user_tools_wattage_check check (wattage_watts is null or wattage_watts between 1 and 10000),
  add constraint user_tools_adjustable_temp_check check (adjustable_temp is null or adjustable_temp in ('yes', 'no', 'unknown')),
  add constraint user_tools_condition_check check (condition is null or condition in ('good', 'worn', 'damaged', 'unknown')),
  add constraint user_tools_settings_check check (settings is null or strandcue_private.tool_settings_valid(settings)),
  add constraint user_tools_attachments_check check (attachments is null or strandcue_private.tool_attachments_valid(attachments)),
  add constraint user_tools_heat_methods_check check (heat_methods is null or strandcue_private.tool_heat_valid(heat_methods));

grant update(wattage_watts, adjustable_temp, settings, attachments, condition, heat_methods) on public.user_tools to strandcue_mutator;

-- --- The facts patch --------------------------------------------------------

create or replace function strandcue_private.validate_tool_facts(p_facts jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare
  k text;
  v jsonb;
begin
  if p_facts is null then return; end if;
  if jsonb_typeof(p_facts) <> 'object' then raise exception 'invalid-facts' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p_facts) loop
    case k
      when 'manualBrand' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v #>> '{}')) not between 1 and 200) then
          raise exception 'invalid-brand' using errcode = '22023'; end if;
      when 'manualModel' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v #>> '{}')) not between 1 and 200) then
          raise exception 'invalid-model' using errcode = '22023'; end if;
      when 'toolType' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or v #>> '{}' not in ('dryer','heated-air-brush','air-styler','hood-dryer','flat-iron','hot-comb','curling-iron','steam-straightener','heated-rollers','diffuser','other')) then
          raise exception 'invalid-tool-type' using errcode = '22023'; end if;
      when 'notes' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v #>> '{}')) not between 1 and 2000) then
          raise exception 'invalid-notes' using errcode = '22023'; end if;
      when 'wattageWatts' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
          or (v #>> '{}')::numeric not between 1 and 10000) then
          raise exception 'invalid-wattage' using errcode = '22023'; end if;
      when 'adjustableTemp' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string' or v #>> '{}' not in ('yes', 'no', 'unknown')) then
          raise exception 'invalid-adjustable-temperature' using errcode = '22023'; end if;
      when 'condition' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string' or v #>> '{}' not in ('good', 'worn', 'damaged', 'unknown')) then
          raise exception 'invalid-condition' using errcode = '22023'; end if;
      when 'settings' then
        if v <> 'null'::jsonb and not strandcue_private.tool_settings_valid(v) then
          raise exception 'invalid-settings' using errcode = '22023'; end if;
      when 'attachments' then
        if v <> 'null'::jsonb and not strandcue_private.tool_attachments_valid(v) then
          raise exception 'invalid-attachments' using errcode = '22023'; end if;
      when 'heatMethods' then
        if v <> 'null'::jsonb and not strandcue_private.tool_heat_valid(v) then
          raise exception 'invalid-heat-methods' using errcode = '22023'; end if;
      else
        raise exception 'invalid-facts' using errcode = '22023';
    end case;
  end loop;
end;
$$;

alter function strandcue_private.tool_heat_valid(jsonb) owner to strandcue_mutator;
alter function strandcue_private.tool_attachments_valid(jsonb) owner to strandcue_mutator;
alter function strandcue_private.tool_settings_valid(jsonb) owner to strandcue_mutator;
alter function strandcue_private.tool_settings_state_temperature(jsonb) owner to strandcue_mutator;
alter function strandcue_private.validate_tool_facts(jsonb) owner to strandcue_mutator;

-- --- The trusted core -------------------------------------------------------

drop function if exists strandcue_private.mutate_user_tool(uuid, uuid, integer, text, uuid, text, text, text, text, text, jsonb, uuid, text, boolean);

create function strandcue_private.mutate_user_tool(
  p_operation_id uuid,
  p_user_tool_id uuid,
  p_expected_revision integer,
  p_kind text,
  p_version_id uuid,
  p_availability text,
  p_effective_date jsonb,
  p_corrects_id uuid,
  p_reason text,
  p_confirmed boolean,
  p_facts jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.tool_operations%rowtype;
  row public.user_tools%rowtype;
  target public.user_tool_revisions%rowtype;
  rev_id uuid := gen_random_uuid();
  eff record;
  patch jsonb;
  result jsonb;
  facts jsonb := coalesce(p_facts, '{}'::jsonb);
  existing boolean;
  -- A match and an archive are owner events that happen now: the core dates them itself.
  eff_date jsonb := p_effective_date;
  -- An ordinary change that archives the tool is still the owner's archive event.
  recorded_kind text := p_kind;
  eff_brand text;
  eff_model text;
  eff_type text;
  resulting_model text;
  eff_heat jsonb;
  eff_adjustable text;
  eff_settings jsonb;
  target_carries_identity boolean;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_user_tool_id is null or p_expected_revision is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_kind not in ('baseline','change','correction','match','archive') then raise exception 'invalid-kind' using errcode = '22023'; end if;
  if p_kind = 'change' and p_availability = 'archived' then recorded_kind := 'archive'; end if;
  if recorded_kind in ('match','archive') then
    eff_date := jsonb_build_object('precision', 'day', 'value', (now() at time zone 'Africa/Johannesburg')::date::text);
  end if;
  payload := jsonb_build_object('op', p_operation_id, 'userToolId', p_user_tool_id, 'expectedRevision', p_expected_revision,
    'kind', p_kind, 'versionId', p_version_id, 'availability', p_availability,
    -- The date the CALLER sent, never the server's: a retry on another day is still the same command.
    'effectiveDate', p_effective_date, 'correctsId', p_corrects_id, 'reason', p_reason, 'confirmed', p_confirmed,
    'facts', facts);
  select * into prev from strandcue_private.tool_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  -- The serializing lock: the owner's own profile row. The lookup is repeated after it, so two
  -- concurrent retries of one operation replay or conflict, never raise a raw unique violation.
  perform 1 from public.profiles where user_id = uid and account_status = 'active' for update;
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into prev from strandcue_private.tool_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  select * into row from public.user_tools where id = p_user_tool_id for update;
  existing := found;
  if existing then
    if row.owner <> uid then raise exception 'not-found' using errcode = '42501'; end if;
    if row.revision <> p_expected_revision then raise exception 'revision-conflict' using errcode = '40001'; end if;
    if p_kind = 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  else
    if p_expected_revision <> 0 or p_kind <> 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  end if;
  -- Field validation runs after ownership and revision checks, so a stale or foreign caller gets
  -- revision-conflict or not-found; it runs before the row is written, so a refused value answers
  -- with its own stable code and a refused operation leaves no operation row behind.
  if p_availability is not null and p_availability not in ('available','out_of_stock','archived') then raise exception 'invalid-availability' using errcode = '22023'; end if;
  -- An availability change is an ordinary change, never a correction.
  if p_kind = 'correction' and p_availability is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
  -- An ordinary change never rewrites the identity: a wrong brand, model or type is corrected through
  -- the append-only correction path. The facts patch cannot be a back door around that rule.
  if p_kind = 'change' and facts ?| array['manualBrand','manualModel','toolType'] then
    raise exception 'invalid-identity' using errcode = '22023';
  end if;
  -- A catalogue link is a confirmed match, never a side effect of another kind.
  if p_version_id is not null then
    if p_kind = 'baseline' then raise exception 'invalid-tool' using errcode = '22023'; end if;
    if p_kind = 'change' then raise exception 'invalid-change' using errcode = '22023'; end if;
    if p_kind = 'correction' then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if p_kind = 'archive' then raise exception 'invalid-archive' using errcode = '22023'; end if;
  end if;
  -- The identity the write lands. A baseline holds what the owner typed; an ordinary change keeps what
  -- the row carries; a correction replaces only what its patch answers.
  eff_brand := case when facts ? 'manualBrand' then strandcue_private.shelf_fact_text(facts, 'manualBrand') else row.manual_brand end;
  eff_model := case when facts ? 'manualModel' then strandcue_private.shelf_fact_text(facts, 'manualModel') else row.manual_model end;
  eff_type := case when facts ? 'toolType' then strandcue_private.shelf_fact_text(facts, 'toolType') else row.tool_type end;
  if p_kind = 'correction' then
    if p_corrects_id is null or p_reason is null or strandcue_private.js_length(strandcue_private.trim_text(p_reason)) not between 1 and 500 then raise exception 'invalid-correction' using errcode = '22023'; end if;
    select * into target from public.user_tool_revisions where id = p_corrects_id and user_tool_id = p_user_tool_id and owner = uid;
    if not found then raise exception 'correction-target-not-found' using errcode = '22023'; end if;
    if exists (select 1 from public.user_tool_revisions r where r.corrects_id = p_corrects_id and r.user_tool_id = p_user_tool_id and r.owner = uid) then
      raise exception 'already-corrected' using errcode = '23505';
    end if;
    -- The target must be the final link of its chain AND carry an identity: a match, an archive and an
    -- ordinary change never do; a baseline does only when an identity field holds a value; a correction
    -- does when its patch mentions an identity key.
    target_carries_identity := case
      when target.kind in ('match','archive','change') then false
      when target.kind = 'correction' then (target.patch ?| array['manualBrand','manualModel','toolType'])
      else exists (
        select 1 from jsonb_each(coalesce(target.patch, '{}'::jsonb)) as f(key, value)
         where f.key in ('manualBrand','manualModel','toolType') and jsonb_typeof(f.value) = 'string'
           and strandcue_private.trim_text(f.value #>> '{}') <> '')
    end;
    if not target_carries_identity then raise exception 'invalid-correction-target' using errcode = '22023'; end if;
    -- A correction has to CARRY an identity, or the chain would end on a revision with nothing to correct.
    if not (facts ?| array['manualBrand','manualModel','toolType']) then raise exception 'invalid-correction' using errcode = '22023'; end if;
    -- The identity answers are checked before they are compared, so a blank or unknown answer is refused as
    -- what it is and not as a correction that changes nothing.
    perform strandcue_private.validate_tool_facts(
      coalesce((select jsonb_object_agg(f.key, f.value) from jsonb_each(facts) f where f.key in ('manualBrand','manualModel','toolType')), '{}'::jsonb));
    -- A correction must MATERIALLY change the identity: the same words, or only a related fact, correct nothing.
    if strandcue_private.same_words(eff_brand, row.manual_brand)
      and strandcue_private.same_words(eff_model, row.manual_model)
      and strandcue_private.same_words(eff_type, row.tool_type) then
      raise exception 'invalid-correction-noop' using errcode = '22023';
    end if;
  end if;
  perform strandcue_private.validate_tool_facts(facts);
  -- The model the row carries after the write: a manual tool needs one, a matched tool may not.
  resulting_model := case when p_kind = 'baseline' then eff_model when facts ? 'manualModel' then eff_model else row.manual_model end;
  if p_kind in ('baseline','change','correction') and row.version_id is null
    and nullif(btrim(coalesce(resulting_model, '')), '') is null then
    raise exception 'invalid-tool' using errcode = '22023';
  end if;
  if p_version_id is not null and not exists (select 1 from public.tool_versions where id = p_version_id) then
    raise exception 'version-not-found' using errcode = '22023';
  end if;
  -- Contradictions are refused, never repaired: an unheated tool cannot also state a temperature. The check
  -- reads the record the write would land, so a change that only adds one side is judged against the other.
  if p_kind in ('baseline','change','correction') then
    eff_heat := case when facts ? 'heatMethods' then strandcue_private.shelf_fact_jsonb(facts, 'heatMethods') else row.heat_methods end;
    eff_adjustable := case when facts ? 'adjustableTemp' then strandcue_private.shelf_fact_text(facts, 'adjustableTemp') else row.adjustable_temp end;
    eff_settings := case when facts ? 'settings' then strandcue_private.shelf_fact_jsonb(facts, 'settings') else row.settings end;
    if eff_heat is not null and (eff_heat -> 'methods') @> '"unheated"'::jsonb
      and (eff_adjustable = 'yes' or strandcue_private.tool_settings_state_temperature(eff_settings)) then
      raise exception 'invalid-heat-combination' using errcode = '22023';
    end if;
  end if;
  if not existing then
    begin
      insert into public.user_tools(id, owner, version_id, manual_brand, manual_model, tool_type, availability, matched, matched_at, match_confirmed, revision, notes,
        wattage_watts, adjustable_temp, settings, attachments, condition, heat_methods)
        values (p_user_tool_id, uid, null, eff_brand, eff_model, eff_type, coalesce(p_availability, 'available'), false, null, false, 0,
          strandcue_private.shelf_fact_text(facts, 'notes'),
          (strandcue_private.shelf_fact_jsonb(facts, 'wattageWatts') #>> '{}')::numeric::integer,
          strandcue_private.shelf_fact_text(facts, 'adjustableTemp'),
          strandcue_private.shelf_fact_jsonb(facts, 'settings'),
          strandcue_private.shelf_fact_jsonb(facts, 'attachments'),
          strandcue_private.shelf_fact_text(facts, 'condition'),
          strandcue_private.shelf_fact_jsonb(facts, 'heatMethods'))
        returning * into row;
    exception when unique_violation then
      -- Another owner may already hold this id: answered as the row-owner check answers it.
      raise exception 'not-found' using errcode = '42501';
    end;
  end if;
  select * into eff from strandcue_private.date_interval(eff_date);
  if p_kind = 'correction' then
    -- A confirmation belongs to the match kind only.
    if p_confirmed is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
  elsif p_kind = 'match' then
    if p_confirmed is distinct from true then raise exception 'confirmation-required' using errcode = '22023'; end if;
    if p_version_id is null then raise exception 'invalid-match' using errcode = '22023'; end if;
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-match' using errcode = '22023'; end if;
    -- A match writes a catalogue link, never a fact.
    if facts <> '{}'::jsonb then raise exception 'invalid-facts' using errcode = '22023'; end if;
  elsif p_kind = 'archive' then
    if p_corrects_id is not null or p_reason is not null or p_confirmed is not null then raise exception 'invalid-archive' using errcode = '22023'; end if;
    if facts <> '{}'::jsonb then raise exception 'invalid-facts' using errcode = '22023'; end if;
  else
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if p_confirmed is not null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  end if;
  -- The revision patch records what the owner actually answered: an unanswered key stays absent.
  if p_kind = 'baseline' then
    patch := jsonb_build_object('manualBrand', eff_brand, 'manualModel', eff_model, 'toolType', eff_type,
      'availability', coalesce(p_availability, 'available')) || facts;
  elsif p_kind = 'correction' then
    patch := facts;
  else
    patch := jsonb_strip_nulls(jsonb_build_object('versionId', p_version_id,
      'availability', case when recorded_kind = 'archive' then 'archived' when p_kind = 'match' then null else p_availability end)) || facts;
  end if;
  insert into public.user_tool_revisions(id, owner, user_tool_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, recorded_at, source, patch, corrects_id, correction_reason, match_version_id)
    values (rev_id, uid, p_user_tool_id, row.revision + 1, row.revision, recorded_kind, eff_date, eff.start_date, eff.end_date, now(), 'user-reported',
      patch, p_corrects_id, case when p_kind = 'correction' then btrim(p_reason) end,
      case when p_kind = 'match' then p_version_id end);
  if p_kind = 'match' then
    update public.user_tools set revision = revision + 1, version_id = p_version_id, matched = true, matched_at = now(), match_confirmed = true, updated_at = now() where id = p_user_tool_id;
  elsif p_kind = 'archive' then
    update public.user_tools set revision = revision + 1, availability = 'archived', updated_at = now() where id = p_user_tool_id;
  else
    update public.user_tools set revision = revision + 1,
      manual_brand = case when facts ? 'manualBrand' then strandcue_private.shelf_fact_text(facts, 'manualBrand') else manual_brand end,
      manual_model = case when facts ? 'manualModel' then strandcue_private.shelf_fact_text(facts, 'manualModel') else manual_model end,
      tool_type = case when facts ? 'toolType' then strandcue_private.shelf_fact_text(facts, 'toolType') else tool_type end,
      availability = coalesce(p_availability, availability),
      notes = case when facts ? 'notes' then strandcue_private.shelf_fact_text(facts, 'notes') else notes end,
      wattage_watts = case when facts ? 'wattageWatts' then (strandcue_private.shelf_fact_jsonb(facts, 'wattageWatts') #>> '{}')::numeric::integer else wattage_watts end,
      adjustable_temp = case when facts ? 'adjustableTemp' then strandcue_private.shelf_fact_text(facts, 'adjustableTemp') else adjustable_temp end,
      settings = case when facts ? 'settings' then strandcue_private.shelf_fact_jsonb(facts, 'settings') else settings end,
      attachments = case when facts ? 'attachments' then strandcue_private.shelf_fact_jsonb(facts, 'attachments') else attachments end,
      condition = case when facts ? 'condition' then strandcue_private.shelf_fact_text(facts, 'condition') else condition end,
      heat_methods = case when facts ? 'heatMethods' then strandcue_private.shelf_fact_jsonb(facts, 'heatMethods') else heat_methods end,
      updated_at = now()
      where id = p_user_tool_id;
  end if;
  select jsonb_build_object('userToolId', p_user_tool_id, 'revision', row.revision + 1,
    'revisions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'correctionReason', r.correction_reason, 'matchVersionId', r.match_version_id) order by r.sequence), '[]'::jsonb)
      from public.user_tool_revisions r where r.user_tool_id = p_user_tool_id)) into result;
  begin
    insert into strandcue_private.tool_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  exception when unique_violation then
    raise exception 'operation-conflict' using errcode = '23505';
  end;
  return result;
end;
$$;
alter function strandcue_private.mutate_user_tool(uuid, uuid, integer, text, uuid, text, jsonb, uuid, text, boolean, jsonb) owner to strandcue_mutator;

-- --- The read cores ---------------------------------------------------------

create or replace function strandcue_private.get_user_tool_core(p_user_tool_id uuid, p_include_audit boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid(); row public.user_tools%rowtype; revs jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into row from public.user_tools where id = p_user_tool_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'correctionReason', r.correction_reason, 'matchVersionId', r.match_version_id, 'patch', r.patch) order by r.sequence), '[]'::jsonb)
    into revs from public.user_tool_revisions r where r.user_tool_id = p_user_tool_id and owner = uid;
  return jsonb_build_object('id', row.id, 'revision', row.revision, 'availability', row.availability,
    'matched', row.matched, 'matchConfirmed', row.match_confirmed,
    'manualBrand', row.manual_brand, 'manualModel', row.manual_model, 'toolType', row.tool_type,
    'wattageWatts', row.wattage_watts, 'adjustableTemp', row.adjustable_temp, 'settings', row.settings,
    'attachments', row.attachments, 'condition', row.condition, 'heatMethods', row.heat_methods,
    'notes', row.notes, 'versionId', row.version_id, 'revisions', revs);
end;
$$;
alter function strandcue_private.get_user_tool_core(uuid, boolean) owner to strandcue_mutator;

create or replace function strandcue_private.list_user_tools_core(p_limit integer, p_cursor jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  cursor_time timestamptz;
  cursor_id uuid;
  items jsonb := '[]'::jsonb;
  next_cursor jsonb;
  row_data record;
  count_rows integer := 0;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid-page' using errcode = '22023'; end if;
  if p_cursor is not null and p_cursor <> 'null'::jsonb then
    begin
      if jsonb_typeof(p_cursor) <> 'object' or not p_cursor ?& array['updatedAt','id']
        or p_cursor - array['updatedAt','id'] <> '{}'::jsonb
        or jsonb_typeof(p_cursor->'updatedAt') is distinct from 'string'
        or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'invalid-cursor'; end if;
      cursor_time := (p_cursor->>'updatedAt')::timestamptz;
      cursor_id := (p_cursor->>'id')::uuid;
      if not isfinite(cursor_time) then raise exception 'invalid-cursor'; end if;
    exception when others then raise exception 'invalid-cursor' using errcode = '22023'; end;
  end if;
  for row_data in
    select u.id, u.revision, u.availability, u.manual_brand, u.manual_model, u.tool_type, u.matched, u.condition, u.heat_methods, u.updated_at,
           -- Only the lifecycle of the linked version, so a retired match is told on the list: no capability, no successor.
           (select v.lifecycle from public.tool_versions v where v.id = u.version_id) as catalogue_lifecycle
      from public.user_tools u
     where u.owner = uid and u.availability <> 'archived'
       and (cursor_id is null or (u.updated_at, u.id) < (cursor_time, cursor_id))
     order by u.updated_at desc, u.id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then return jsonb_build_object('items', items, 'nextCursor', next_cursor); end if;
    items := items || jsonb_build_array(jsonb_build_object('id', row_data.id, 'revision', row_data.revision,
      'availability', row_data.availability, 'manualBrand', row_data.manual_brand, 'manualModel', row_data.manual_model,
      'toolType', row_data.tool_type, 'matched', row_data.matched, 'catalogueLifecycle', row_data.catalogue_lifecycle,
      'condition', row_data.condition, 'heatMethods', row_data.heat_methods));
    next_cursor := jsonb_build_object('updatedAt', to_char(row_data.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', row_data.id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;
alter function strandcue_private.list_user_tools_core(integer, jsonb) owner to strandcue_mutator;

-- --- The public wrappers ------------------------------------------------------

drop function if exists public.tool_add(uuid, uuid, uuid, text, text, text, text, text, jsonb);
drop function if exists public.tool_change(uuid, uuid, integer, uuid, text, text, text, text, text, jsonb);
drop function if exists public.tool_correct(uuid, uuid, integer, uuid, text, text, text, jsonb);

create function public.tool_add(p_operation_id uuid, p_user_tool_id uuid, p_availability text, p_effective_date jsonb, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, 0, 'baseline', null, p_availability, p_effective_date, null, null, null, p_facts);
end;
$$;

create function public.tool_change(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_availability text, p_effective_date jsonb, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'change', null, p_availability, p_effective_date, null, null, null, p_facts);
end;
$$;

create function public.tool_correct(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_corrects_id uuid, p_reason text, p_effective_date jsonb, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'correction', null, null, p_effective_date, p_corrects_id, p_reason, null, p_facts);
end;
$$;

create or replace function public.tool_match(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer, p_version_id uuid, p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'match', p_version_id, null, null, null, null, p_confirmed, '{}'::jsonb);
end;
$$;

create or replace function public.tool_archive(p_operation_id uuid, p_user_tool_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_tool(p_operation_id, p_user_tool_id, p_expected_revision, 'archive', null, 'archived', null, null, null, null, '{}'::jsonb);
end;
$$;

-- --- Grants -------------------------------------------------------------------

revoke all on function strandcue_private.mutate_user_tool(uuid, uuid, integer, text, uuid, text, jsonb, uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.mutate_user_tool(uuid, uuid, integer, text, uuid, text, jsonb, uuid, text, boolean, jsonb) to authenticated, strandcue_mutator;
revoke all on function strandcue_private.get_user_tool_core(uuid, boolean), strandcue_private.list_user_tools_core(integer, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.get_user_tool_core(uuid, boolean), strandcue_private.list_user_tools_core(integer, jsonb) to authenticated, strandcue_mutator;
revoke all on function strandcue_private.tool_heat_valid(jsonb), strandcue_private.tool_attachments_valid(jsonb), strandcue_private.tool_settings_valid(jsonb),
  strandcue_private.tool_settings_state_temperature(jsonb), strandcue_private.validate_tool_facts(jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.tool_heat_valid(jsonb), strandcue_private.tool_attachments_valid(jsonb), strandcue_private.tool_settings_valid(jsonb),
  strandcue_private.tool_settings_state_temperature(jsonb), strandcue_private.validate_tool_facts(jsonb) to strandcue_mutator;
revoke all on function public.tool_add(uuid, uuid, text, jsonb, jsonb), public.tool_change(uuid, uuid, integer, text, jsonb, jsonb),
  public.tool_correct(uuid, uuid, integer, uuid, text, jsonb, jsonb), public.tool_match(uuid, uuid, integer, uuid, boolean),
  public.tool_archive(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.tool_add(uuid, uuid, text, jsonb, jsonb), public.tool_change(uuid, uuid, integer, text, jsonb, jsonb),
  public.tool_correct(uuid, uuid, integer, uuid, text, jsonb, jsonb), public.tool_match(uuid, uuid, integer, uuid, boolean),
  public.tool_archive(uuid, uuid, integer) to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

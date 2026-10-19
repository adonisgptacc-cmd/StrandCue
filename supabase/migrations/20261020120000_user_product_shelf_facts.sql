-- Forward-only extension of the owned-product shelf (Increment 2, Task 2.1).
--
-- The shelf becomes a record of what the owner actually owns and knows:
--
-- * SH-01 availability states. The owner can record `available`, `low`,
--   `empty` or `archived`. `low` and `empty` are ordinary states, not
--   failures, and the app never words them as waste or fault. The legacy
--   `out_of_stock` state stays allowed in the column because rows written
--   before this contract still carry it and the protocol substitution path
--   records it in a deviation; it is no longer a state the app writes, and
--   the new write path never invents it.
-- * SH-04 shelf facts: the opened date with the precision the owner knows,
--   an optional expiry (which may still be in the future), the owner's own
--   period-after-opening wording, a quantity band and a repurchase intent.
--   Nothing here invents a shelf life: an absent answer stays absent.
-- * The manual identity the owner typed: variant, size and barcode, so a
--   product with no catalogue entry still records what the owner saw.
--
-- The three-state rule the rest of the domain already uses holds here:
-- omitted = the owner never answered, null = the owner explicitly cleared or
-- answered "unknown", a value = what the owner recorded. The write path
-- carries that distinction in one jsonb facts patch, so the SQL boundary
-- can tell "leave this alone" from "clear this" - something a plain column
-- parameter cannot express.
--
-- The owner's identity is never rewritten by an ordinary change (SH-03): a
-- wrong brand, name or category is corrected through the append-only
-- correction path, so the original entry and its history stay readable.
--
-- Security properties are unchanged from 20260924190000: the private core
-- stays SECURITY DEFINER with a pinned empty search_path, the owner is
-- always derived from strandcue_private.request_uid() and never accepted as
-- an argument, the public wrappers stay SECURITY INVOKER, operation keys
-- stay idempotent through strandcue_private.shelf_operations, and every
-- mutation still appends an immutable public.user_product_revisions row.
-- RLS stays enabled AND forced on every touched table, no consumer write
-- path is added, and no PUBLIC execute grant is introduced.
--
-- The core keeps the invariants the wrappers used to hold, because
-- `authenticated` may call the core directly:
--
-- * A catalogue link is a confirmed match. A baseline that carries a
--   version id is refused with `invalid-product`, a change with
--   `invalid-change` (a correction with `invalid-correction`, an archive
--   with `invalid-archive`), so a version can only be linked through the
--   `match` kind, where `confirmation-required` applies. The protocol
--   substitution path reads `version_id`, so an unconfirmed link could
--   otherwise back a "verified" substitution.
-- * A match and an archive are dated by the core, not by the caller: the
--   effective date of those two kinds is the server's own day, and a facts
--   patch is refused for them with `invalid-facts`, so the append-only
--   history can never disagree with the stored row. An ordinary change
--   that archives the product is recorded as an archive, so it is dated
--   that way too: the recorded kind and the recorded date always agree.
-- * A product id another owner already holds is answered with the stable
--   `not-found`, never with a raw unique violation that names the
--   constraint.
--
-- PostgreSQL cannot change a function's signature in place, so the
-- wrappers and the private core are dropped and recreated with the facts
-- parameter. Their grants are restored explicitly below.
--
-- The change wrapper carries no version id at all: a change can never link
-- a catalogue version, so the parameter could only ever answer
-- `invalid-change`. The core keeps that guard for a direct core call.

grant strandcue_mutator to current_user with set true;
grant create on schema strandcue_private to strandcue_mutator;
grant usage on schema public to strandcue_mutator;

-- --- Schema ---------------------------------------------------------------

-- The owner can now record `low` and `empty` beside `available` and
-- `archived`. The legacy `out_of_stock` value stays allowed so existing
-- rows and the protocol substitution path keep working unchanged.
alter table public.user_products drop constraint if exists user_products_availability_check;
alter table public.user_products add constraint user_products_availability_check
  check (availability in ('available', 'low', 'empty', 'out_of_stock', 'archived'));

alter table public.user_products
  add column manual_variant text,
  add column manual_size text,
  add column manual_barcode text,
  add column opened_on jsonb,
  add column expiry_on date,
  add column pao text,
  add column quantity_band text,
  add column repurchase_intent text;

-- A real calendar day, matching packages/domain/src/dates.ts. The cast
-- inside a guarded block refuses an impossible day such as 2026-02-30.
create or replace function strandcue_private.is_calendar_day(p_value text)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  perform p_value::date;
  return true;
exception when others then
  return false;
end;
$$;

-- The stored shape of an opened date: the same precision shape the domain
-- uses, and nothing else. A value the domain would refuse to read (an
-- impossible day) is refused here too.
create or replace function strandcue_private.is_opened_on(p_value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  precision text;
  value text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then return false; end if;
  if not (p_value ?& array['precision','value']) or p_value - array['precision','value'] <> '{}'::jsonb then return false; end if;
  if jsonb_typeof(p_value->'precision') <> 'string' then return false; end if;
  precision := p_value->>'precision';
  if precision = 'unknown' then
    return jsonb_typeof(p_value->'value') = 'null';
  end if;
  if jsonb_typeof(p_value->'value') <> 'string' then return false; end if;
  value := p_value->>'value';
  if precision = 'day' then
    if value !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then return false; end if;
    return strandcue_private.is_calendar_day(value);
  elsif precision = 'month' then
    return value ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$';
  elsif precision = 'year' then
    return value ~ '^[1-9][0-9]{3}$';
  end if;
  return false;
end;
$$;

alter table public.user_products
  add constraint user_products_manual_variant_check
    check (manual_variant is null or strandcue_private.js_length(strandcue_private.trim_text(manual_variant)) between 1 and 200),
  add constraint user_products_manual_size_check
    check (manual_size is null or strandcue_private.js_length(strandcue_private.trim_text(manual_size)) between 1 and 200),
  add constraint user_products_manual_barcode_check
    check (manual_barcode is null or strandcue_private.js_length(strandcue_private.trim_text(manual_barcode)) between 1 and 100),
  add constraint user_products_pao_check
    check (pao is null or strandcue_private.js_length(strandcue_private.trim_text(pao)) between 1 and 200),
  add constraint user_products_quantity_band_check
    check (quantity_band is null or quantity_band in ('full', 'about-three-quarters', 'about-half', 'about-quarter', 'nearly-empty', 'unknown')),
  add constraint user_products_repurchase_intent_check
    check (repurchase_intent is null or repurchase_intent in ('would-rebuy', 'would-not-rebuy', 'unsure', 'unknown')),
  add constraint user_products_opened_on_check
    check (opened_on is null or strandcue_private.is_opened_on(opened_on));
-- No decorative constraint on expiry_on: the column is already a date, so a
-- cast can never fail. The real guard is validate_shelf_facts, which
-- refuses a malformed or impossible day before the row is written.

-- The mutator may write the new columns; consumers still have no write path.
grant update(manual_variant, manual_size, manual_barcode, opened_on, expiry_on, pao, quantity_band, repurchase_intent)
  on public.user_products to strandcue_mutator;

-- --- The facts patch ------------------------------------------------------

-- One jsonb patch carries every owner-recorded fact, so the boundary can
-- tell three states apart: an absent key means "not answered, leave it",
-- an explicit null means "cleared", and a value means "recorded".
create or replace function strandcue_private.shelf_fact_text(p_facts jsonb, p_key text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_facts is null or not (p_facts ? p_key) then null
    when jsonb_typeof(p_facts->p_key) = 'null' then null
    else strandcue_private.trim_text(p_facts->>p_key)
  end;
$$;

create or replace function strandcue_private.shelf_fact_jsonb(p_facts jsonb, p_key text)
returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_facts is null or not (p_facts ? p_key) then null
    when jsonb_typeof(p_facts->p_key) = 'null' then null
    else p_facts->p_key
  end;
$$;

create or replace function strandcue_private.shelf_fact_date(p_facts jsonb, p_key text)
returns date language sql immutable set search_path = '' as $$
  select case
    when p_facts is null or not (p_facts ? p_key) then null
    when jsonb_typeof(p_facts->p_key) = 'null' then null
    else (p_facts->>p_key)::date
  end;
$$;

-- Boundary validation for the facts patch. Every rule mirrors
-- packages/domain/src/shelf.ts, and every refusal answers with a stable
-- error code so a caller can tell what was wrong without guessing.
create or replace function strandcue_private.validate_shelf_facts(p_facts jsonb)
returns void language plpgsql stable set search_path = '' as $$
declare
  k text;
  v jsonb;
  precision text;
  value text;
  today text;
begin
  if p_facts is null then return; end if;
  if jsonb_typeof(p_facts) <> 'object' then raise exception 'invalid-facts' using errcode = '22023'; end if;
  -- The domain compares against the Africa/Johannesburg calendar day; a
  -- write is refused only when it is strictly after both today forms, so
  -- the two boundaries can disagree only in the hours where SAST is
  -- already tomorrow and the domain is the stricter answer anyway.
  today := greatest(current_date::text, (current_timestamp at time zone 'Africa/Johannesburg')::date::text);
  for k, v in select * from jsonb_each(p_facts) loop
    case k
      when 'manualVariant' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}')) not between 1 and 200) then
          raise exception 'invalid-variant' using errcode = '22023'; end if;
      when 'manualSize' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}')) not between 1 and 200) then
          raise exception 'invalid-size' using errcode = '22023'; end if;
      when 'manualBarcode' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}')) not between 1 and 100) then
          raise exception 'invalid-barcode' using errcode = '22023'; end if;
      when 'pao' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}')) not between 1 and 200) then
          raise exception 'invalid-pao' using errcode = '22023'; end if;
      when 'notes' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or strandcue_private.js_length(strandcue_private.trim_text(v#>>'{}')) not between 1 and 2000) then
          raise exception 'invalid-notes' using errcode = '22023'; end if;
      when 'quantityBand' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or v#>>'{}' not in ('full', 'about-three-quarters', 'about-half', 'about-quarter', 'nearly-empty', 'unknown')) then
          raise exception 'invalid-quantity-band' using errcode = '22023'; end if;
      when 'repurchaseIntent' then
        if v <> 'null'::jsonb and (jsonb_typeof(v) <> 'string'
          or v#>>'{}' not in ('would-rebuy', 'would-not-rebuy', 'unsure', 'unknown')) then
          raise exception 'invalid-repurchase-intent' using errcode = '22023'; end if;
      when 'expiryOn' then
        -- An expiry may still be in the future; only an impossible day or a
        -- malformed value is refused.
        if v <> 'null'::jsonb then
          if jsonb_typeof(v) <> 'string'
            or v#>>'{}' !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
            raise exception 'invalid-expiry-date' using errcode = '22023'; end if;
          if not strandcue_private.is_calendar_day(v#>>'{}') then
            raise exception 'invalid-expiry-date' using errcode = '22023'; end if;
        end if;
      when 'openedOn' then
        if v <> 'null'::jsonb then
          if not strandcue_private.is_opened_on(v) then
            raise exception 'invalid-opened-date' using errcode = '22023'; end if;
          precision := v->>'precision';
          if precision <> 'unknown' then
            value := v->>'value';
            -- An opened date is observed, never future-dated.
            if precision = 'day' and value > today then
              raise exception 'invalid-opened-date' using errcode = '22023'; end if;
            if precision = 'month' and (value || '-01') > today then
              raise exception 'invalid-opened-date' using errcode = '22023'; end if;
            if precision = 'year' and (value || '-01-01') > today then
              raise exception 'invalid-opened-date' using errcode = '22023'; end if;
          end if;
        end if;
      else
        raise exception 'invalid-facts' using errcode = '22023';
    end case;
  end loop;
end;
$$;

-- Every private routine in the repository is owned by the mutator, and these
-- helpers are no exception: they answer only the trusted write path.
alter function strandcue_private.is_calendar_day(text) owner to strandcue_mutator;
alter function strandcue_private.is_opened_on(jsonb) owner to strandcue_mutator;
alter function strandcue_private.shelf_fact_text(jsonb, text) owner to strandcue_mutator;
alter function strandcue_private.shelf_fact_jsonb(jsonb, text) owner to strandcue_mutator;
alter function strandcue_private.shelf_fact_date(jsonb, text) owner to strandcue_mutator;
alter function strandcue_private.validate_shelf_facts(jsonb) owner to strandcue_mutator;

-- --- The trusted core -----------------------------------------------------

drop function if exists strandcue_private.mutate_user_product(uuid, uuid, integer, text, uuid, text, text, text, text, text, jsonb, uuid, text, boolean);

create function strandcue_private.mutate_user_product(
  p_operation_id uuid,
  p_user_product_id uuid,
  p_expected_revision integer,
  p_kind text,
  p_version_id uuid,
  p_manual_brand text,
  p_manual_name text,
  p_manual_category text,
  p_availability text,
  p_notes text,
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
  prev strandcue_private.shelf_operations%rowtype;
  row public.user_products%rowtype;
  rev_id uuid := gen_random_uuid();
  eff record;
  patch jsonb;
  result jsonb;
  facts jsonb := coalesce(p_facts, '{}'::jsonb);
  existing boolean;
  -- The date the revision is recorded with. A match and an archive are
  -- owner events that happen now, so the core dates them itself and
  -- ignores whatever the caller sent: a direct core call must not be able
  -- to backdate the history, and it must agree with the public wrapper.
  eff_date jsonb := p_effective_date;
  -- The kind the revision is recorded under. An ordinary change that
  -- archives the product is still the owner's archive event, so the history
  -- records it as one whichever path carried it. The kind is settled
  -- before the date, so the recorded kind and the recorded date can never
  -- disagree.
  recorded_kind text := p_kind;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null or p_user_product_id is null or p_expected_revision is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_kind not in ('baseline','change','correction','match','archive') then raise exception 'invalid-kind' using errcode = '22023'; end if;
  if p_kind = 'change' and p_availability = 'archived' then recorded_kind := 'archive'; end if;
  if recorded_kind in ('match','archive') then
    eff_date := jsonb_build_object('precision', 'day', 'value', (now() at time zone 'Africa/Johannesburg')::date::text);
  end if;
  payload := jsonb_build_object('op', p_operation_id, 'userProductId', p_user_product_id, 'expectedRevision', p_expected_revision,
    'kind', p_kind, 'versionId', p_version_id, 'manualBrand', p_manual_brand, 'manualName', p_manual_name,
    'manualCategory', p_manual_category, 'availability', p_availability, 'notes', p_notes,
    'effectiveDate', eff_date, 'correctsId', p_corrects_id, 'reason', p_reason, 'confirmed', p_confirmed,
    'facts', facts);
  select * into prev from strandcue_private.shelf_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active' for update;
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;
  select * into row from public.user_products where id = p_user_product_id for update;
  -- FOUND is captured once: any later SQL statement (even one inside an IF
  -- condition) may set it again, and the insert below must not depend on it.
  existing := found;
  if existing then
    if row.owner <> uid then raise exception 'not-found' using errcode = '42501'; end if;
    if row.revision <> p_expected_revision then raise exception 'revision-conflict' using errcode = '40001'; end if;
    if p_kind = 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  else
    if p_expected_revision <> 0 or p_kind <> 'baseline' then raise exception 'revision-conflict' using errcode = '40001'; end if;
  end if;
  -- Field validation runs after ownership/revision checks so stale or foreign
  -- callers get revision-conflict / not-found, mirroring the Passport core.
  -- It runs before the row is written, so a refused value answers with its
  -- own stable error instead of a constraint violation.
  if p_availability is not null and p_availability not in ('available','low','empty','out_of_stock','archived') then raise exception 'invalid-availability' using errcode = '22023'; end if;
  if p_notes is not null and length(p_notes) > 2000 then raise exception 'invalid-notes' using errcode = '22023'; end if;
  perform strandcue_private.validate_shelf_facts(facts);
  -- An ordinary change never rewrites the identity the owner entered: a
  -- wrong brand, name or category is corrected through the append-only
  -- correction path, so the original wording stays readable.
  if p_kind = 'change' and (p_manual_brand is not null or p_manual_name is not null or p_manual_category is not null) then
    raise exception 'invalid-identity' using errcode = '22023';
  end if;
  -- A catalogue link is a confirmed match, never a side effect of another
  -- kind. A baseline, a change, a correction or an archive that carried a
  -- version id would link an arbitrary catalogue version without the
  -- confirmation gate, while `matched`/`match_confirmed` stayed false - and
  -- the protocol substitution path only asks whether `version_id` is set, so
  -- the unconfirmed link would back a "verified" substitution the owner
  -- never confirmed. Every version link therefore goes through the `match`
  -- kind, where `confirmation-required` applies. Each kind answers with
  -- its own stable code.
  if p_version_id is not null then
    if p_kind = 'baseline' then raise exception 'invalid-product' using errcode = '22023'; end if;
    if p_kind = 'change' then raise exception 'invalid-change' using errcode = '22023'; end if;
    if p_kind = 'correction' then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if p_kind = 'archive' then raise exception 'invalid-archive' using errcode = '22023'; end if;
  end if;
  -- The resulting row must still identify a product: a catalogue version or
  -- a name the owner recorded. This is read from the row that already
  -- exists, so an edit of a manual product is never refused for not
  -- repeating the name.
  if p_kind in ('baseline','change','correction') then
    if coalesce(p_version_id, row.version_id) is null
      and nullif(btrim(coalesce(p_manual_name, row.manual_name, '')), '') is null then
      raise exception 'invalid-product' using errcode = '22023';
    end if;
  end if;
  if p_version_id is not null and not exists(select 1 from public.product_versions where id = p_version_id) then
    raise exception 'version-not-found' using errcode = '22023';
  end if;
  if not existing then
    -- Another owner may already hold this product id: the row is invisible
    -- to the owner-scoped policy, so the insert is what discovers the
    -- collision. The raw unique violation would name the constraint and
    -- disclose that the id exists, so it is caught and answered with the
    -- same stable `not-found` the row-owner check uses.
    begin
      insert into public.user_products(id, owner, version_id, manual_brand, manual_name, manual_category, availability, matched, matched_at, match_confirmed, revision, notes,
        manual_variant, manual_size, manual_barcode, opened_on, expiry_on, pao, quantity_band, repurchase_intent)
        values (p_user_product_id, uid, null, -- a baseline never links a version: the refusal above answers that
          nullif(btrim(coalesce(p_manual_brand, '')), ''), nullif(btrim(coalesce(p_manual_name, '')), ''), p_manual_category,
          coalesce(p_availability, 'available'), false, null, false, 0,
          -- The same expression the update path uses: an explicit null in
          -- the facts patch always wins, an absent key keeps the legacy
          -- parameter.
          case when facts ? 'notes' then strandcue_private.shelf_fact_text(facts, 'notes') else p_notes end,
          strandcue_private.shelf_fact_text(facts, 'manualVariant'),
          strandcue_private.shelf_fact_text(facts, 'manualSize'),
          strandcue_private.shelf_fact_text(facts, 'manualBarcode'),
          strandcue_private.shelf_fact_jsonb(facts, 'openedOn'),
          strandcue_private.shelf_fact_date(facts, 'expiryOn'),
          strandcue_private.shelf_fact_text(facts, 'pao'),
          strandcue_private.shelf_fact_text(facts, 'quantityBand'),
          strandcue_private.shelf_fact_text(facts, 'repurchaseIntent'))
        returning * into row;
    exception when unique_violation then
      raise exception 'not-found' using errcode = '42501';
    end;
  end if;
  select * into eff from strandcue_private.date_interval(eff_date);
  if p_kind = 'correction' then
    if p_corrects_id is null or p_reason is null or length(btrim(p_reason)) not between 1 and 500 then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if not exists(select 1 from public.user_product_revisions where id = p_corrects_id and user_product_id = p_user_product_id and owner = uid) then raise exception 'correction-target-not-found' using errcode = '22023'; end if;
    if exists(select 1 from public.user_product_revisions where corrects_id = p_corrects_id) then raise exception 'already-corrected' using errcode = '23505'; end if;
    -- A correction replaces the wording the owner recorded; it never links a
    -- catalogue version. The link belongs to the confirmed `match` kind, and
    -- the refusal above answers a version id with `invalid-correction`.
  elsif p_kind = 'match' then
    -- P1-SHELF-02: matching requires explicit confirmation; it never happens silently.
    if p_confirmed is distinct from true then raise exception 'confirmation-required' using errcode = '22023'; end if;
    if p_version_id is null then raise exception 'invalid-match' using errcode = '22023'; end if;
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-match' using errcode = '22023'; end if;
    -- A match writes a catalogue link, never a fact. A facts patch (or a
    -- notes value) would be recorded in the append-only history without
    -- ever reaching the row, so the history would disagree with the stored
    -- product. The core refuses it here, where a direct call and the
    -- public wrapper answer the same way.
    if facts <> '{}'::jsonb or p_notes is not null then raise exception 'invalid-facts' using errcode = '22023'; end if;
  elsif p_kind = 'archive' then
    if p_corrects_id is not null or p_reason is not null or p_confirmed is not null then raise exception 'invalid-archive' using errcode = '22023'; end if;
    -- An archive keeps the row and its catalogue link; it never writes one.
    -- A version id is refused above, with the same `invalid-archive` code.
    if facts <> '{}'::jsonb or p_notes is not null then raise exception 'invalid-facts' using errcode = '22023'; end if;
  else
    if p_corrects_id is not null or p_reason is not null then raise exception 'invalid-correction' using errcode = '22023'; end if;
    if p_confirmed is not null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  end if;
  -- The revision patch records the facts the owner actually sent, so the
  -- history shows the recorded value and never an invented one. A match
  -- writes no availability and an archive writes the archived state, so
  -- the patch can never disagree with the row the core writes.
  patch := jsonb_build_object('versionId', p_version_id, 'manualBrand', p_manual_brand, 'manualName', p_manual_name,
    'manualCategory', p_manual_category,
    'availability', case when p_kind = 'archive' then 'archived' when p_kind = 'match' then null else p_availability end,
    'notes', p_notes) || facts;
  insert into public.user_product_revisions(id, owner, user_product_id, sequence, base_revision, kind, effective_date, effective_start, effective_end, recorded_at, source, patch, corrects_id, correction_reason, match_version_id)
    values (rev_id, uid, p_user_product_id, row.revision + 1, row.revision, recorded_kind, eff_date, eff.start_date, eff.end_date, now(), 'user-reported',
      patch, p_corrects_id, case when p_kind = 'correction' then btrim(p_reason) end,
      case when p_kind = 'match' then p_version_id end);
  if p_kind = 'match' then
    update public.user_products set revision = revision + 1, version_id = p_version_id, matched = true, matched_at = now(), match_confirmed = true, updated_at = now() where id = p_user_product_id;
  elsif p_kind = 'archive' then
    -- Archiving is an owner-recorded event: the row keeps its history and
    -- only leaves the active list.
    update public.user_products set revision = revision + 1, availability = 'archived', updated_at = now() where id = p_user_product_id;
  else
    -- A baseline, a change and a correction may not carry a version id at
    -- all, so this line never links a version behind the confirmed-match
    -- gate: it only keeps the link a confirmed match already made.
    update public.user_products set revision = revision + 1,
      version_id = coalesce(p_version_id, version_id),
      manual_brand = coalesce(nullif(btrim(coalesce(p_manual_brand, '')), ''), manual_brand),
      manual_name = coalesce(nullif(btrim(coalesce(p_manual_name, '')), ''), manual_name),
      manual_category = coalesce(p_manual_category, manual_category),
      availability = coalesce(p_availability, availability),
      notes = case when facts ? 'notes' then strandcue_private.shelf_fact_text(facts, 'notes') else coalesce(p_notes, notes) end,
      manual_variant = case when facts ? 'manualVariant' then strandcue_private.shelf_fact_text(facts, 'manualVariant') else manual_variant end,
      manual_size = case when facts ? 'manualSize' then strandcue_private.shelf_fact_text(facts, 'manualSize') else manual_size end,
      manual_barcode = case when facts ? 'manualBarcode' then strandcue_private.shelf_fact_text(facts, 'manualBarcode') else manual_barcode end,
      opened_on = case when facts ? 'openedOn' then strandcue_private.shelf_fact_jsonb(facts, 'openedOn') else opened_on end,
      expiry_on = case when facts ? 'expiryOn' then strandcue_private.shelf_fact_date(facts, 'expiryOn') else expiry_on end,
      pao = case when facts ? 'pao' then strandcue_private.shelf_fact_text(facts, 'pao') else pao end,
      quantity_band = case when facts ? 'quantityBand' then strandcue_private.shelf_fact_text(facts, 'quantityBand') else quantity_band end,
      repurchase_intent = case when facts ? 'repurchaseIntent' then strandcue_private.shelf_fact_text(facts, 'repurchaseIntent') else repurchase_intent end,
      updated_at = now()
      where id = p_user_product_id;
  end if;
  select jsonb_build_object('userProductId', p_user_product_id, 'revision', row.revision + 1,
    'revisions', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'matchVersionId', r.match_version_id) order by r.sequence), '[]'::jsonb)
      from public.user_product_revisions r where r.user_product_id = p_user_product_id)) into result;
  insert into strandcue_private.shelf_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.mutate_user_product(uuid, uuid, integer, text, uuid, text, text, text, text, text, jsonb, uuid, text, boolean, jsonb) owner to strandcue_mutator;

-- --- The read cores -------------------------------------------------------

-- The detail read carries the owner's recorded facts, so the app can show
-- what the owner wrote without a second call.
create or replace function strandcue_private.get_user_product_core(p_user_product_id uuid, p_include_audit boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := strandcue_private.request_uid(); row public.user_products%rowtype; revs jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  select * into row from public.user_products where id = p_user_product_id and owner = uid;
  if not found then raise exception 'not-found' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'correctsId', r.corrects_id, 'matchVersionId', r.match_version_id, 'patch', r.patch) order by r.sequence), '[]'::jsonb)
    into revs from public.user_product_revisions r where r.user_product_id = p_user_product_id and owner = uid;
  return jsonb_build_object('id', row.id, 'revision', row.revision, 'availability', row.availability,
    'matched', row.matched, 'matchConfirmed', row.match_confirmed, 'manualName', row.manual_name,
    'manualBrand', row.manual_brand, 'manualCategory', row.manual_category,
    'manualVariant', row.manual_variant, 'manualSize', row.manual_size, 'manualBarcode', row.manual_barcode,
    'openedOn', row.opened_on, 'expiryOn', row.expiry_on, 'pao', row.pao,
    'quantityBand', row.quantity_band, 'repurchaseIntent', row.repurchase_intent, 'notes', row.notes,
    'versionId', row.version_id, 'revisions', revs);
end;
$$;
alter function strandcue_private.get_user_product_core(uuid, boolean) owner to strandcue_mutator;

-- The list read carries the same facts, so the shelf list can show the
-- recorded state of every product without opening each one.
create or replace function strandcue_private.list_user_products_core(p_limit integer, p_cursor jsonb)
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
    select u.id, u.revision, u.availability, u.manual_name, u.manual_brand, u.manual_category,
      u.manual_variant, u.manual_size, u.manual_barcode, u.opened_on, u.expiry_on, u.pao,
      u.quantity_band, u.repurchase_intent, u.updated_at
    from public.user_products u
    where u.owner = uid and u.availability <> 'archived'
      and (cursor_id is null or (u.updated_at, u.id) < (cursor_time, cursor_id))
    order by u.updated_at desc, u.id desc limit p_limit + 1
  loop
    count_rows := count_rows + 1;
    if count_rows > p_limit then return jsonb_build_object('items', items, 'nextCursor', next_cursor); end if;
    items := items || jsonb_build_array(jsonb_build_object('id', row_data.id, 'revision', row_data.revision,
      'availability', row_data.availability, 'manualName', row_data.manual_name, 'manualBrand', row_data.manual_brand,
      'manualCategory', row_data.manual_category, 'manualVariant', row_data.manual_variant, 'manualSize', row_data.manual_size,
      'manualBarcode', row_data.manual_barcode, 'openedOn', row_data.opened_on, 'expiryOn', row_data.expiry_on,
      'pao', row_data.pao, 'quantityBand', row_data.quantity_band, 'repurchaseIntent', row_data.repurchase_intent));
    next_cursor := jsonb_build_object('updatedAt', to_char(row_data.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'id', row_data.id);
  end loop;
  return jsonb_build_object('items', items, 'nextCursor', null);
end;
$$;
alter function strandcue_private.list_user_products_core(integer, jsonb) owner to strandcue_mutator;

-- --- The public wrappers --------------------------------------------------

drop function if exists public.shelf_add(uuid, uuid, uuid, text, text, text, text, text, jsonb);
create function public.shelf_add(p_operation_id uuid, p_user_product_id uuid, p_version_id uuid, p_manual_brand text, p_manual_name text, p_manual_category text, p_availability text, p_notes text, p_effective_date jsonb, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_product(p_operation_id, p_user_product_id, 0, 'baseline', p_version_id, p_manual_brand, p_manual_name, p_manual_category, p_availability, p_notes, p_effective_date, null, null, null, p_facts);
end;
$$;

-- The change wrapper carries no version id: an ordinary change can never
-- link a catalogue version, so the parameter could only ever answer
-- `invalid-change`. The core keeps that guard for a direct core call.
drop function if exists public.shelf_change(uuid, uuid, integer, uuid, text, text, text, text, text, jsonb);
drop function if exists public.shelf_change(uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb);
create function public.shelf_change(p_operation_id uuid, p_user_product_id uuid, p_expected_revision integer, p_manual_brand text, p_manual_name text, p_manual_category text, p_availability text, p_notes text, p_effective_date jsonb, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_product(p_operation_id, p_user_product_id, p_expected_revision, 'change', null, p_manual_brand, p_manual_name, p_manual_category, p_availability, p_notes, p_effective_date, null, null, null, p_facts);
end;
$$;

drop function if exists public.shelf_correct(uuid, uuid, integer, uuid, text, text, text, jsonb);
create function public.shelf_correct(p_operation_id uuid, p_user_product_id uuid, p_expected_revision integer, p_corrects_id uuid, p_reason text, p_manual_name text, p_notes text, p_effective_date jsonb, p_manual_brand text default null, p_manual_category text default null, p_facts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_product(p_operation_id, p_user_product_id, p_expected_revision, 'correction', null, p_manual_brand, p_manual_name, p_manual_category, null, p_notes, p_effective_date, p_corrects_id, p_reason, null, p_facts);
end;
$$;

-- Matching and archiving keep their signatures; they only gain the facts
-- argument the core now takes. Neither writes a fact: a match links a
-- catalogue version and an archive is an owner-recorded event. The
-- effective date is the core's own: it dates both events from the server
-- clock, so a direct core call cannot backdate them.
create or replace function public.shelf_match(p_operation_id uuid, p_user_product_id uuid, p_expected_revision integer, p_version_id uuid, p_confirmed boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_product(p_operation_id, p_user_product_id, p_expected_revision, 'match', p_version_id, null, null, null, null, null, null, null, null, p_confirmed, '{}'::jsonb);
end;
$$;

create or replace function public.shelf_archive(p_operation_id uuid, p_user_product_id uuid, p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if strandcue_private.request_uid() is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  return strandcue_private.mutate_user_product(p_operation_id, p_user_product_id, p_expected_revision, 'archive', null, null, null, null, 'archived', null, null, null, null, null, '{}'::jsonb);
end;
$$;

-- --- The export shape -----------------------------------------------------

-- The export is the owner's own copy of their record, so the new columns
-- join the existing family: the JSON branch embeds whole rows and carries
-- them automatically, the CSV branch lists columns explicitly and now
-- lists the shelf facts too. The document shape changed, so `export` moves
-- 2 -> 3 in both the JSON schemaVersions block and schema_versions.csv -
-- the versions exist precisely to mark shape changes. Owner predicates,
-- csv_quote escaping, ordering, the recent-auth gate, op-idempotency, 24h
-- expiry, retention and record_count are all unchanged.
create or replace function strandcue_private.export_build_csv(p_uid uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  profile_csv text;
  passport_csv text;
  services_csv text;
  activities_csv text;
  shelf_csv text;
  shelf_revisions_csv text;
  tools_csv text;
  tool_revisions_csv text;
  consent_csv text;
  runs_csv text;
  executions_csv text;
  execution_events_csv text;
  schema_versions_csv text;
begin
  select 'username,country,currency,temperature_unit,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(username) || ',' || strandcue_private.csv_quote(country) || ',' || strandcue_private.csv_quote(currency) || ',' || strandcue_private.csv_quote(temperature_unit) || ',' || strandcue_private.csv_quote(created_at::text), chr(10)), '')
    into profile_csv from public.profiles where user_id = p_uid;

  select 'id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind) || ',' || strandcue_private.csv_quote(r.effective_date::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.sequence), '')
    into passport_csv from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = p_uid;

  select 'id,service_id,sequence,base_revision,kind,facts,heat_state,effective_start,effective_end,recorded_at,corrects_id,correction_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.service_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.facts::text) || ',' || strandcue_private.csv_quote(r.heat_state) || ',' || strandcue_private.csv_quote(r.effective_start::text) || ',' || strandcue_private.csv_quote(r.effective_end::text)
      || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason), chr(10) order by r.recorded_at, r.service_id, r.sequence), '')
    into services_csv from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = p_uid;

  select 'id,activity_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,void_reason' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.activity_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.void_reason), chr(10) order by r.recorded_at, r.activity_id, r.sequence), '')
    into activities_csv from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = p_uid;

  select 'id,version_id,manual_brand,manual_name,manual_category,manual_variant,manual_size,manual_barcode,availability,opened_on,expiry_on,pao,quantity_band,repurchase_intent,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_name) || ',' || strandcue_private.csv_quote(u.manual_category)
      || ',' || strandcue_private.csv_quote(u.manual_variant) || ',' || strandcue_private.csv_quote(u.manual_size) || ',' || strandcue_private.csv_quote(u.manual_barcode)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.opened_on::text) || ',' || strandcue_private.csv_quote(u.expiry_on::text)
      || ',' || strandcue_private.csv_quote(u.pao) || ',' || strandcue_private.csv_quote(u.quantity_band) || ',' || strandcue_private.csv_quote(u.repurchase_intent)
      || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into shelf_csv from public.user_products u where u.owner = p_uid;

  select 'id,user_product_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_product_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_product_id, r.sequence), '')
    into shelf_revisions_csv from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = p_uid;

  select 'id,version_id,manual_brand,manual_model,tool_type,availability,matched,matched_at,match_confirmed,revision,notes,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(u.id::text) || ',' || strandcue_private.csv_quote(u.version_id::text) || ',' || strandcue_private.csv_quote(u.manual_brand) || ',' || strandcue_private.csv_quote(u.manual_model) || ',' || strandcue_private.csv_quote(u.tool_type)
      || ',' || strandcue_private.csv_quote(u.availability) || ',' || strandcue_private.csv_quote(u.matched::text) || ',' || strandcue_private.csv_quote(u.matched_at::text) || ',' || strandcue_private.csv_quote(u.match_confirmed::text)
      || ',' || strandcue_private.csv_quote(u.revision::text) || ',' || strandcue_private.csv_quote(u.notes) || ',' || strandcue_private.csv_quote(u.created_at::text), chr(10) order by u.created_at, u.id), '')
    into tools_csv from public.user_tools u where u.owner = p_uid;

  select 'id,user_tool_id,sequence,base_revision,kind,effective_date,recorded_at,source,patch,corrects_id,correction_reason,match_version_id' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.user_tool_id::text) || ',' || strandcue_private.csv_quote(r.sequence::text) || ',' || strandcue_private.csv_quote(r.base_revision::text) || ',' || strandcue_private.csv_quote(r.kind)
      || ',' || strandcue_private.csv_quote(r.effective_date::text) || ',' || strandcue_private.csv_quote(r.recorded_at::text) || ',' || strandcue_private.csv_quote(r.source) || ',' || strandcue_private.csv_quote(r.patch::text)
      || ',' || strandcue_private.csv_quote(r.corrects_id::text) || ',' || strandcue_private.csv_quote(r.correction_reason) || ',' || strandcue_private.csv_quote(r.match_version_id::text), chr(10) order by r.recorded_at, r.user_tool_id, r.sequence), '')
    into tool_revisions_csv from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = p_uid;

  select 'id,purpose,granted,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(c.id::text) || ',' || strandcue_private.csv_quote(c.purpose) || ',' || strandcue_private.csv_quote(c.granted::text) || ',' || strandcue_private.csv_quote(c.recorded_at::text), chr(10) order by c.recorded_at, c.id), '')
    into consent_csv from public.consent_records c where c.user_id = p_uid;

  select 'id,request_id,input_fingerprint,as_of,engine_version,bundle_id,bundle_version,status,trusted,input,decision,created_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(r.id::text) || ',' || strandcue_private.csv_quote(r.request_id::text) || ',' || strandcue_private.csv_quote(r.input_fingerprint) || ',' || strandcue_private.csv_quote(r.as_of::text)
      || ',' || strandcue_private.csv_quote(r.engine_version) || ',' || strandcue_private.csv_quote(r.bundle_id) || ',' || strandcue_private.csv_quote(r.bundle_version) || ',' || strandcue_private.csv_quote(r.status)
      || ',' || strandcue_private.csv_quote(r.trusted::text) || ',' || strandcue_private.csv_quote(r.input::text) || ',' || strandcue_private.csv_quote(r.decision::text) || ',' || strandcue_private.csv_quote(r.created_at::text), chr(10) order by r.created_at, r.id), '')
    into runs_csv from public.recommendation_runs r where r.user_id = p_uid;

  select 'id,execution_id,recommendation_run_id,revision,status,legal_hold,decision,execution,created_at,updated_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(e.id::text) || ',' || strandcue_private.csv_quote(e.execution_id::text) || ',' || strandcue_private.csv_quote(e.recommendation_run_id::text) || ',' || strandcue_private.csv_quote(e.revision::text)
      || ',' || strandcue_private.csv_quote(e.status) || ',' || strandcue_private.csv_quote(e.legal_hold::text) || ',' || strandcue_private.csv_quote(e.decision::text) || ',' || strandcue_private.csv_quote(e.execution::text)
      || ',' || strandcue_private.csv_quote(e.created_at::text) || ',' || strandcue_private.csv_quote(e.updated_at::text), chr(10) order by e.created_at, e.id), '')
    into executions_csv from public.protocol_executions e where e.user_id = p_uid;

  select 'id,execution_id,sequence,kind,command,revision,recorded_at' || chr(10) || coalesce(string_agg(
    strandcue_private.csv_quote(v.id::text) || ',' || strandcue_private.csv_quote(v.execution_id::text) || ',' || strandcue_private.csv_quote(v.sequence::text) || ',' || strandcue_private.csv_quote(v.kind)
      || ',' || strandcue_private.csv_quote(v.command::text) || ',' || strandcue_private.csv_quote(v.revision::text) || ',' || strandcue_private.csv_quote(v.recorded_at::text), chr(10) order by v.execution_id, v.sequence), '')
    into execution_events_csv from public.protocol_execution_events v where v.user_id = p_uid;

  -- Owner-independent version manifest: mirrors the JSON schemaVersions block.
  select 'family,version' || chr(10)
    || 'export,3' || chr(10)
    || 'consentRecords,1' || chr(10)
    || 'recommendationRuns,1' || chr(10)
    || 'protocolExecutions,2' || chr(10)
    || 'protocolExecutionEvents,1'
    into schema_versions_csv;

  return jsonb_build_object('files', jsonb_build_object(
    'profile.csv', profile_csv,
    'passport_revisions.csv', passport_csv,
    'service_revisions.csv', services_csv,
    'activity_revisions.csv', activities_csv,
    'user_products.csv', shelf_csv,
    'user_product_revisions.csv', shelf_revisions_csv,
    'user_tools.csv', tools_csv,
    'user_tool_revisions.csv', tool_revisions_csv,
    'consent_records.csv', consent_csv,
    'recommendation_runs.csv', runs_csv,
    'protocol_executions.csv', executions_csv,
    'protocol_execution_events.csv', execution_events_csv,
    'schema_versions.csv', schema_versions_csv));
end;
$$;
alter function strandcue_private.export_build_csv(uuid) owner to strandcue_mutator;

create or replace function strandcue_private.request_export(p_operation_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := strandcue_private.request_uid();
  payload jsonb;
  prev strandcue_private.export_operations%rowtype;
  job_id uuid := gen_random_uuid();
  document jsonb;
  counts integer := 0;
  n integer;
  result jsonb;
begin
  if uid is null then raise exception 'authentication-required' using errcode = '42501'; end if;
  if p_operation_id is null then raise exception 'invalid-operation' using errcode = '22023'; end if;
  if p_format is null or (p_format <> 'json' and p_format <> 'csv') then raise exception 'invalid-format' using errcode = '22023'; end if;
  if not strandcue_private.recent_auth(15) then raise exception 'recent-auth-required' using errcode = '42501'; end if;
  payload := jsonb_build_object('op', p_operation_id, 'format', p_format);
  select * into prev from strandcue_private.export_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if prev.payload <> payload then raise exception 'operation-conflict' using errcode = '23505'; end if;
    return prev.result;
  end if;
  perform 1 from public.profiles where user_id = uid and account_status = 'active';
  if not found then raise exception 'account-not-active' using errcode = '42501'; end if;

  if p_format = 'csv' then
    select strandcue_private.export_build_csv(uid) into document;
  else
    select jsonb_build_object(
    'exportedAt', now(),
    'userId', uid,
    'schemaVersions', jsonb_build_object('export', 3, 'consentRecords', 1, 'recommendationRuns', 1,
      'protocolExecutions', 2, 'protocolExecutionEvents', 1),
    'profile', (select jsonb_build_object('username', p.username, 'country', p.country, 'currency', p.currency,
      'temperatureUnit', p.temperature_unit, 'createdAt', p.created_at)
      from public.profiles p where p.user_id = uid),
    'passport', (select jsonb_build_object('revision', h.revision, 'projection', h.current_projection,
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.passport_revisions r where r.passport_id = h.id))
      from public.hair_passports h where h.user_id = uid),
    'chemicalServices', (select coalesce(jsonb_agg(jsonb_build_object('service', to_jsonb(s),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.service_revisions r where r.service_id = s.id),
        'zones', (select coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb)
          from public.service_zones z where z.service_id = s.id),
        'observations', (select coalesce(jsonb_agg(to_jsonb(o) order by o.recorded_at), '[]'::jsonb)
          from public.service_observations o where o.service_id = s.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.heat_events e where e.service_id = s.id))), '[]'::jsonb)
      from public.chemical_services s where s.user_id = uid),
    'activities', (select coalesce(jsonb_agg(jsonb_build_object('activity', to_jsonb(a),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.activity_revisions r where r.activity_id = a.id),
        'products', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_products l where l.activity_id = a.id),
        'tools', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
          from public.activity_tools l where l.activity_id = a.id),
        'heatEvents', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
          from public.activity_heat_events e where e.activity_id = a.id))), '[]'::jsonb)
      from public.activities a where a.owner = uid),
    'userProducts', (select coalesce(jsonb_agg(jsonb_build_object('product', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_product_revisions r where r.user_product_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.product_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.product_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.product_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_products u where u.owner = uid),
    'userTools', (select coalesce(jsonb_agg(jsonb_build_object('tool', to_jsonb(u),
        'revisions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence), '[]'::jsonb)
          from public.user_tool_revisions r where r.user_tool_id = u.id),
        'catalogueVersion', (select to_jsonb(v) from public.tool_versions v where v.id = u.version_id),
        'claims', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb)
          from public.tool_claims c where c.version_id = u.version_id),
        'verificationEvents', (select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at), '[]'::jsonb)
          from public.tool_verification_events e where e.version_id = u.version_id))), '[]'::jsonb)
      from public.user_tools u where u.owner = uid),
    'consentRecords', (select coalesce(jsonb_agg(to_jsonb(c) order by c.recorded_at, c.id), '[]'::jsonb)
      from public.consent_records c where c.user_id = uid),
    'recommendationRuns', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.id), '[]'::jsonb)
      from public.recommendation_runs r where r.user_id = uid),
    'protocolExecutions', (select coalesce(jsonb_agg(
        to_jsonb(e) || jsonb_build_object('events',
          (select coalesce(jsonb_agg(to_jsonb(v) order by v.sequence), '[]'::jsonb)
            from public.protocol_execution_events v where v.user_id = uid and v.execution_id = e.execution_id))
        order by e.created_at, e.id), '[]'::jsonb)
      from public.protocol_executions e where e.user_id = uid)
    ) into document;
  end if;

  select coalesce((select count(*) from public.passport_revisions r join public.hair_passports h on h.id = r.passport_id where h.user_id = uid), 0)
    + coalesce((select count(*) from public.service_revisions r join public.chemical_services s on s.id = r.service_id where s.user_id = uid), 0)
    + coalesce((select count(*) from public.activity_revisions r join public.activities a on a.id = r.activity_id where a.owner = uid), 0)
    + coalesce((select count(*) from public.user_product_revisions r join public.user_products u on u.id = r.user_product_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.user_tool_revisions r join public.user_tools u on u.id = r.user_tool_id where u.owner = uid), 0)
    + coalesce((select count(*) from public.consent_records c where c.user_id = uid), 0)
    + coalesce((select count(*) from public.recommendation_runs r where r.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_executions e where e.user_id = uid), 0)
    + coalesce((select count(*) from public.protocol_execution_events v where v.user_id = uid), 0)
    into n;
  counts := n;

  insert into public.export_jobs(id, owner, format, status, document, record_count, completed_at, expires_at)
    values (job_id, uid, p_format, 'completed', document, counts, now(), now() + interval '24 hours');
  result := jsonb_build_object('jobId', job_id, 'status', 'completed', 'recordCount', counts, 'expiresAt', now() + interval '24 hours');
  insert into strandcue_private.export_operations(user_id, operation_id, payload, result) values (uid, p_operation_id, payload, result);
  return result;
end;
$$;
alter function strandcue_private.request_export(uuid, text) owner to strandcue_mutator;

-- --- Grants ---------------------------------------------------------------

-- The new helpers answer only the trusted write path.
revoke all on function strandcue_private.is_calendar_day(text), strandcue_private.is_opened_on(jsonb),
  strandcue_private.shelf_fact_text(jsonb, text), strandcue_private.shelf_fact_jsonb(jsonb, text),
  strandcue_private.shelf_fact_date(jsonb, text), strandcue_private.validate_shelf_facts(jsonb)
  from public, anon, authenticated;
grant execute on function strandcue_private.is_calendar_day(text), strandcue_private.is_opened_on(jsonb),
  strandcue_private.shelf_fact_text(jsonb, text), strandcue_private.shelf_fact_jsonb(jsonb, text),
  strandcue_private.shelf_fact_date(jsonb, text), strandcue_private.validate_shelf_facts(jsonb)
  to strandcue_mutator;

revoke all on function strandcue_private.mutate_user_product(uuid, uuid, integer, text, uuid, text, text, text, text, text, jsonb, uuid, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function strandcue_private.mutate_user_product(uuid, uuid, integer, text, uuid, text, text, text, text, text, jsonb, uuid, text, boolean, jsonb) to authenticated, strandcue_mutator;
revoke all on function public.shelf_add(uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb),
  public.shelf_change(uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb),
  public.shelf_correct(uuid, uuid, integer, uuid, text, text, text, jsonb, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.shelf_add(uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb),
  public.shelf_change(uuid, uuid, integer, text, text, text, text, text, jsonb, jsonb),
  public.shelf_correct(uuid, uuid, integer, uuid, text, text, text, jsonb, text, text, jsonb)
  to authenticated;
grant execute on function strandcue_private.request_uid() to authenticated;

revoke create on schema strandcue_private from strandcue_mutator;
revoke set option for strandcue_mutator from current_user;

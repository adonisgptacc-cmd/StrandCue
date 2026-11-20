-- Catalogue search for explicit Shelf matching (Increment 2, Task 2.2).
--
-- A read-only, bounded, deterministic search over catalogue product versions.
-- It answers identity and lifecycle only: brand, product name, variant,
-- category, market, barcode, lifecycle and the successor link. It never reads
-- or returns claims, sources, ingredients, directions or verification events,
-- so no draft guidance can leave through it.
--
-- Design:
-- - SECURITY INVOKER: the caller's own row-level-security policies decide
--   which versions are readable. There is no privilege escalation and no
--   second read policy to keep in step with the catalogue's.
-- - Closed to anonymous callers (no PUBLIC/anon execute) and to a token with
--   no user (`authentication-required`).
-- - The words are data. Matching uses strpos() on lower-cased columns, never
--   LIKE or a regular expression built from input, so `%`, `_`, quotes and
--   backslashes are ordinary characters and no input is a wildcard. The input
--   is also never concatenated into SQL.
-- - Bounded: an argument over 400 characters is refused before it is
--   normalized; the words are 2..80 characters in all, at most 6, each at
--   least 2 characters; the limit is 1..25; and one extra row is read only to
--   say whether the list was cut. The catalogue is small and has no text
--   index, so a search is a bounded scan; a stored search column or trigram
--   index is the next step if the catalogue grows.
-- - Deterministic: best word coverage in brand/name first, current versions
--   before retired ones, then brand, name, variant and version id.
-- - Text is compared after the same compatibility folding (NFKC) and
--   lower-casing on both sides.
-- - A barcode matches only exactly, and only when the word is 8..14 digits
--   (hyphens in the word are ignored).
-- - The catalogue has no pack-size column: size is found only where the
--   owner's word appears in a name or variant, and is never invented.
-- - Matching itself is unchanged: it stays the confirmed `shelf_match`
--   command, which keeps its operation ledger, revision check and owner
--   scope.
--
-- Forward-only and rerunnable: CREATE OR REPLACE plus idempotent grants.

create or replace function public.catalogue_search(p_query text, p_limit integer default 10)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_query text;
  v_terms text[];
  v_found integer;
  v_results jsonb;
  -- Control, invisible and bidirectional-format characters, built from code
  -- points so the source holds no invisible text.
  v_hidden text := '[' || chr(1) || '-' || chr(31) || chr(127) || '-' || chr(159)
    || chr(173) || chr(1564) || chr(6158) || chr(8203) || '-' || chr(8207)
    || chr(8232) || '-' || chr(8238) || chr(8288) || '-' || chr(8303) || chr(65279) || ']';
begin
  if strandcue_private.request_uid() is null then
    raise exception 'authentication-required' using errcode = '42501';
  end if;
  if p_query is null or p_limit is null or p_limit < 1 or p_limit > 25 or length(p_query) > 400 then
    raise exception 'invalid-search' using errcode = '22023';
  end if;
  v_query := btrim(regexp_replace(normalize(p_query, nfkc), '\s+', ' ', 'g'));
  if length(v_query) < 2 or length(v_query) > 80 or v_query ~ v_hidden then
    raise exception 'invalid-search' using errcode = '22023';
  end if;
  v_terms := string_to_array(lower(v_query), ' ');
  if cardinality(v_terms) > 6 or exists (select 1 from unnest(v_terms) as t(word) where length(t.word) < 2) then
    raise exception 'invalid-search' using errcode = '22023';
  end if;

  with versions as (
    select v.id as version_id, p.id as product_id, b.name as brand, p.name as product_name,
           v.variant, p.category, v.market, v.barcode, v.lifecycle, v.successor_version_id,
           lower(normalize(b.name, nfkc)) as l_brand, lower(normalize(p.name, nfkc)) as l_name,
           lower(normalize(coalesce(v.variant, ''), nfkc)) as l_variant,
           regexp_replace(coalesce(v.barcode, ''), '[\s-]', '', 'g') as flat_barcode
      from public.product_versions v
      join public.products p on p.id = v.product_id
      join public.brands b on b.id = p.brand_id
  ), matched as (
    select m.*,
           (select count(*) from unnest(v_terms) as t(word)
             where strpos(m.l_brand, t.word) > 0 or strpos(m.l_name, t.word) > 0) as coverage
      from versions m
     where not exists (
       select 1 from unnest(v_terms) as t(word)
        where not (
          strpos(m.l_brand, t.word) > 0 or strpos(m.l_name, t.word) > 0
          or strpos(m.l_variant, t.word) > 0 or strpos(lower(m.category), t.word) > 0
          or (replace(t.word, '-', '') ~ '^[0-9]{8,14}$' and m.flat_barcode = replace(t.word, '-', ''))
        )
     )
  ), ranked as (
    select m.*, row_number() over (
             order by m.coverage desc, (m.lifecycle = 'active') desc,
                      m.l_brand, m.l_name, m.l_variant, m.version_id) as position
      from matched m
     order by position
     limit p_limit + 1
  )
  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'versionId', r.version_id, 'productId', r.product_id, 'brand', r.brand,
           'productName', r.product_name, 'variant', r.variant, 'category', r.category,
           'market', r.market, 'barcode', r.barcode, 'lifecycle', r.lifecycle,
           'successorVersionId', r.successor_version_id) order by r.position)
           filter (where r.position <= p_limit), '[]'::jsonb)
    into v_found, v_results
    from ranked r;

  return jsonb_build_object('results', v_results, 'truncated', v_found > p_limit);
end;
$$;

revoke all on function public.catalogue_search(text, integer) from public, anon, authenticated;
grant execute on function public.catalogue_search(text, integer) to authenticated;

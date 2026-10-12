# Catalogue intake instructions — basic_wash v1

`intake.json` is currently empty (`status: 'awaiting_input'`, `rows: []`).
That is deliberate: no product or tool may be recorded from memory or guessed.
A row is added only from the physical label or the manufacturer's own page,
exactly as described below. Do not invent brands, names, variants, URLs,
GTINs, reviewers, or dates.

## Privacy: label photographs stay local

Photographs of private labels stay on your own device. They are referenced by
local file path in `labelImageRefs` and are never uploaded anywhere unless you
separately authorize an upload. This task only writes the instructions and the
empty intake file — it does not request or accept uploads.

## What to provide for each product (shampoo or conditioner)

1. **Brand** — the exact brand name printed on the label.
2. **Product name** — the exact product name printed on the label.
3. **Variant** — the variant or formulation identity (e.g. "for dry hair",
   "fragrance free"). Required before a row can be marked `identity_verified`.
   If the label names no variant, leave `variant: null` and keep the row in
   `draft`.
4. **Size or pack** — e.g. "250 ml". Leave `null` when unknown.
5. **Market** — `ZA` for products bought in South Africa.
6. **GTIN** — the barcode digits as a quoted string, never a bare number.
   Leave `null` when there is no barcode.
7. **Category** — `shampoo` or `conditioner`. Nothing else is in scope.
8. **Lifecycle** — `active`, or `retired` for discontinued lines.
9. **Manufacturer link** — the manufacturer's own `https:` page for this exact
   product. No `http:` links, no retailer or marketplace pages.
10. **Label photographs** — front and back of the label, clearly showing the
    ingredients, directions, and manufacturer details. Record the local file
    paths in `labelImageRefs`. The ingredients and directions panels are
    identity material only (they establish which exact version this is);
    they are never treated as efficacy proof.
11. **Identity notes** — anything that distinguishes this version
    (reformulation, repackaging). Leave `null` when there is nothing to note.
12. **Possession** — confirm whether you currently possess this exact item
    and can test it. This is not an intake field; it decides whether the
    row can later support reviewed guidance.

## What to provide for each tool

Brand, exact model name, version label, market, GTIN string (or `null`), tool
type, lifecycle, manufacturer `https:` link (or `null`), local rating-plate
and label photographs in `labelImageRefs`, and notes (or `null`). Tools are
schema-supported but not required for `basic_wash`.

## Identity rules

- One row per exact identity. A different variant, a different market, a
  reformulation, a manufacturer-confirmed formulation change, or shampoo
  versus conditioner is a separate row — versions are never merged.
- Two rows that match after lowercasing and collapsing whitespace are the same
  identity and are rejected as duplicates.
- A row may be marked `identity_verified` only when brand, exact name or
  model, variant or formulation identity, and lifecycle are recorded **and**
  the original manufacturer URL or label photographs are present.

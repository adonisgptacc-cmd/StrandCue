# Discovery Shortlist — Next Source-Deepening Targets (Research Effort Only)

**Status: DRAFT DISCOVERY — NOT evidence, NOT a recommendation, HUMAN REVIEW REQUIRED.**
This ranking measures *research effort and verification leverage only* — how
cheaply an exact ZA identity could be verified next. It says nothing about
product quality, and no row here carries a capability, approval, or price.

Context: the existing basic-wash drafts cover a Garnier pair (Ultimate Blends
Hair Food Nourishing Banana shampoo + conditioner, 350 ml). The ten targets
below come *after* that pair.

## P1 — official ZA product page + rinse-off + exact size/variant + directions

**Zero rows qualify.** No batch retrieved a single exact official ZA
manufacturer product page, and no batch retrieved manufacturer directions for
any row. P1 is an empty set by evidence, not by choice. Any future P1 claim
requires a genuinely fetched ZA product-detail page with visible directions.

## Next ten source-deepening targets (P2 effort order)

| # | Temp ID | Lead (brand / listed name) | Why this is cheap to verify next |
|---|---|---|---|
| 1 | ZA-CONDITIONER-0001 | Garnier Whole Blends Conditioner | Same brand family as the existing Garnier pair; `africa.garnier.com/en-za` presence confirmed, needs a rendered-page pass for exact SKU/size |
| 2 | ZA-CONDITIONER-0002 | Garnier Fructis Conditioner | Same Garnier ZA path as #1; one rendered fetch can cover #1–#3 |
| 3 | ZA-CONDITIONER-0003 | Garnier Ultra Blends Conditioner | Same Garnier ZA path as #1 |
| 4 | ZA-CONDITIONER-0004 | Olaplex N°.5 Bond Maintenance Conditioner | Exact global product page already in hand (`evidence_incomplete`); verification reduces to the ZA-pack comparison |
| 5 | ZA-SHAMPOO-0001 | Pantene Shampoo 400 ml | Exact size/variant; `pantene.co.za` brand presence + live retailer listing |
| 6 | ZA-SHAMPOO-0017 | TRESemmé Shampoo 900 ml | Exact size; `tresemme.com/za` brand presence + live retailer listing |
| 7 | ZA-SHAMPOO-0027 | Elvive Shampoo 400 ml | Exact umbrella size; `lorealparis.co.za` brand presence + live listing (sub-variant still open) |
| 8 | ZA-SHAMPOO-0033 | Organics Shampoo 400 ml | ZA-origin brand with its own `.co.za` domain + live listing; short verification path |
| 9 | ZA-SHAMPOO-0010 | Head & Shoulders 2in1 400 ml | Exact size; dedicated `headandshoulders.co.za` presence + live listing (cosmetic anti-dandruff; NOT quarantined, but reviewer to confirm classification) |
| 10 | ZA-SHAMPOO-0023 | OLAPLEX No.4 Bond Maintenance Shampoo 250 ml | Exact variant/size; global brand page reference + live listing |

P3 (retailer-product-page only) and P4 (search-feed only) rows are not
shortlisted: with zero retailer *product* pages retrieved anywhere, every
non-P2 row sits at P4-equivalent effort and must wait for the manufacturer
pass.

## Five most capability-useful targets (basic-wash leverage, still effort-only)

Named for the handoff; usefulness here means *closest to basic-wash scope
with the shortest verification path*, never product merit:

1. **ZA-CONDITIONER-0001** (Garnier Whole Blends) — conditioner complement in the Garnier family.
2. **ZA-CONDITIONER-0002** (Garnier Fructis) — same.
3. **ZA-CONDITIONER-0004** (Olaplex N°.5) — only conditioner lead with a product-level manufacturer page.
4. **ZA-SHAMPOO-0001** (Pantene 400 ml) — exact-size shampoo with ZA brand presence.
5. **ZA-SHAMPOO-0017** (TRESemmé 900 ml) — exact-size shampoo with ZA brand path.

## Batching recommendation (≤20 per batch)

- Cap every source-deepening batch at **≤20 exact versions**.
- Source **only** from official ZA manufacturer/brand *product* pages, recording
  true check dates per page (no session-date stamping of unfetched pages).
- Order: (a) Garnier conditioner deepening (#1–#3 plus the Banana conditioner
  re-verification), (b) exact-size mass shampoo (#5–#9), (c) Olaplex pair
  (#4 + #10, ZA-pack vs global comparison), (d) everything else only after
  (a)–(c) land product pages with directions.
- Do not deepen heated-tools, industrial, colour-chemistry, or quarantined
  rows under basic wash; they belong to future buckets with their own caps.

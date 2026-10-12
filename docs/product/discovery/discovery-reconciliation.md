# Discovery Reconciliation Report — Master Catalogue Batches (Discovery Only)

**Status: DRAFT DISCOVERY — NOT evidence, NOT importable, HUMAN REVIEW REQUIRED.**
Every claim below treats the ten third-party research batches as unverified
leads. No StrandCue catalogue UUID was assigned. No capability was inferred.
No price enters any ranking (this backlog's schema has no price field).

Source files: `docs/product/discovery/master-catalogue/*-batch-01.md`
(10 files) + `wave3-brief.template.md` (task-dispatch history only).
Intake artifact: `../discovery-backlog.json` (313 rows, temp IDs only),
built deterministically by `buildDiscoveryBacklog`
(`packages/domain/src/discovery-backlog.ts`).
Session date in all batches: 2026-10-12. Cutoff enforced: nothing later.

## 1. Headline reconciliation (stated vs recomputed)

| Target | Stated (in sources) | Recomputed | Verdict |
|---|---|---|---|
| Stated subtotal **289** | **Not found** — repo-wide search for `289` returns zero hits in the 10 batches, the template, and the whole worktree | 313 OUTPUT 2 product-table rows | **MISMATCH (unanchored):** no 289 claim exists in the source material; 289 must not be cited as a source figure |
| Ten per-category counts sum **313** | Sum of per-batch OUTPUT 2 tables (see §2) | **313** | **MATCH** |
| Shampoo stated 63 | OUTPUT 1: "63 distinct ZA-listed product entries", "63 confirmed" | **62** rows (`ZA-SHAMPOO-0001`–`0062`, contiguous, no gap) | **MISMATCH:** stated 63 is a counting error; one phantom entry |
| Masks stated 35 vs apparent 37 | OUTPUT 1: "35 recorded in table" | **35** rows in OUTPUT 2 (`ZA-MASK-0001`–`0035`); **36** distinct `ZA-MASK-*` IDs file-wide (extra `ZA-MASK-0040` in OUTPUT 7 continuation); **37** temp-ID *mentions* including one cross-batch reference (`ZA-CONDITIONER-0026`) | **RESOLVED:** stated 35 is correct for OUTPUT 2; extras are continuation/cross-refs, not missing rows |
| Serum OUTPUT 2 vs OUTPUT 6 | OUTPUT 6 JSON holds 30 (`0001`–`0030`) | **43** rows in OUTPUT 2 (`0001`–`0043`); OUTPUT 5 declares `ZA-SERUMOIL-0043` cross-search evidence duplicating `ZA-SERUMOIL-0003` | **MISMATCH (scope):** 13 tabled SKUs (`0031`–`0043`) have no OUTPUT 6 candidate record |

## 2. Per-category counts (all recomputed from OUTPUT 2 tables)

| Batch file | Stated | Recomputed rows | Range | Note |
|---|---|---|---|---|
| shampoo-batch-01.md | 63 | **62** | 0001–0062 | −1 phantom (§1) |
| conditioner-batch-01.md | 26 | **26** | 0001–0026 | identity claims downgraded (§4) |
| scalp-batch-01.md | 25 | **25** | 0001–0025 | |
| masks-batch-01.md | 35 | **35** | 0001–0035 | +0040 in OUTPUT 7 only |
| styling-batch-01.md | 32 | **32** | 0001–0032 | 10-col retailer shape |
| leavein-batch-01.md | 30 | **30** | 0001–0030 | |
| heatprotect-batch-01.md | 12 | **12** | 0001–0012 | 10-col retailer shape |
| serumoil-batch-01.md | (unstated; OUTPUT 6: 30) | **43** | 0001–0043 | §1 |
| heatedtools-batch-01.md | 17 | **17** | ZA-TOOL-0001–0017 | scope-excluded |
| industrial-batch-01.md | 31 | **31** | 0001–0031 | scope-excluded |
| **Total** | — | **313** | — | unique temp IDs: 313; unique fingerprints: 313 |

## 3. ZA-identity counts (backlog states, downgraded)

| identityStatus | Rows | Meaning |
|---|---|---|
| exact_za_identity_verified | **0** | No row has an exact official ZA manufacturer *product* page |
| discovered | **5** | `ZA-MASK-0006`–`0010` (global manufacturer product pages, future bucket) |
| evidence_incomplete | **13** | Basic-wash rows with product-level (non-ZA) manufacturer pages, ZA evidence missing (`ZA-CONDITIONER-0004/0005/0016–0026`, all `another_market_manufacturer_page`) |
| identity_unverified | **239** | Brand-homepage-only, retailer-search-feed-only, or inaccessible evidence |
| duplicate_candidate | **5** | `ZA-SERUMOIL-0014/0019/0031/0041/0043` (normalized repeats of scalp-batch rows / `-0003`) |
| possible_reformulation | **0** | No OUTPUT 2 row carries a reformulation/name-change signal (all batches report "none confirmed") |
| excluded_scope | **51** | 3 medicinal quarantine + 1 disinfectant quarantine + 17 heated tools + 31 industrial (one row carries both scope and quarantine grounds: `ZA-INDUSTRIAL-0031`) |

Source-type tiers behind these states: brand_homepage 203, retailer_search_feed 44,
authorised_distributor 31, another_market_manufacturer_page 18,
inaccessible_unverified 17, retailer_product_page 0, official_za_product_page 0.

## 4. Downgraded identity assertions (uniform-reliability claims REMOVED)

The following source claims assert catalogue-grade identity (and, alongside
single-day feed prices, implied reliability) on evidence this backlog does
not accept. Each is **flagged, not carried forward**:

- conditioner OUTPUT 1: "26 with confirmed South African identity" / "26 with
  official manufacturer sources" — recomputed: 13 rows cite a brand homepage
  only, 10 cite a *global category/listing* page (Wella), 3 cite a market head
  of `global`/`global/US`. Zero cite a ZA product page.
- shampoo OUTPUT 1: "63 with confirmed South African identity" — recomputed 62
  rows, every one retailer-feed-only for ZA evidence (manufacturerUrl is a
  brand homepage or absent); count itself is wrong (§1).
- heatprotect OUTPUT 1: "12 verifiable via direct retailer URL" — all 12 URLs
  are `catalogsearch` *search-feed* queries, not product pages.
- styling OUTPUT 1: "32 verifiable via direct Dis-Chem retailer URL" — same
  search-feed limitation (32/32 `catalogsearch`).
- masks/scalp/leavein/serumoil OUTPUT 1: "confirmed ZA retailer listing"
  identity — retailer feed only; manufacturer INCI/directions/GTIN uniformly
  unretrieved (the files say so themselves). Identity kept at
  `identity_unverified`.
- industrial OUTPUT 1: "31 confirmed on ZA distributor page" — accepted as
  *distributor* evidence only (`authorised_distributor`), still
  `excluded_scope` (non-cosmetic scope).
- **EU/US-equals-ZA rejected everywhere:** 18 `another_market_manufacturer_page`
  rows (Wella en-EN, Kérastase global, L'Oréal Professionnel global, Olaplex
  global, Redken global) are never ZA evidence without explicit manufacturer
  proof. Three conditioner rows state `marketClaim` `global`/`global/US`
  outright. Wikipedia (cited for heated-tools lineage and Parlux corporate
  context) is classified `inaccessible_unverified` — never manufacturer evidence.

## 5. Cross-batch duplicates and duplicate URLs

Exact normalized repeats (brand + name + variant + size) → later occurrence
is `duplicate_candidate` (canonical order: scalp before serum):

- `ZA-SCALP-0006` / `ZA-SERUMOIL-0031` (Marc Anthony Grow Long)
- `ZA-SCALP-0007` / `ZA-SERUMOIL-0041` (Curls in Bloom Feed Me)
- `ZA-SCALP-0008` / `ZA-SERUMOIL-0014` (Cantu Tea Tree + Jojoba)
- `ZA-SCALP-0005` / `ZA-SERUMOIL-0019` (Mielle Light)
- `ZA-SERUMOIL-0003` / `ZA-SERUMOIL-0043` (Redken Argan-6; OUTPUT 5 confirms)

Near-duplicates for HUMAN review (same product, variant/size wording differs;
kept as separate rows, not auto-merged): Nilotiqa Scalp And Hair Oil
(`ZA-SCALP-0003` vs `ZA-SERUMOIL-0011`), Mielle standard
(`ZA-SCALP-0004` vs `ZA-SERUMOIL-0018`), Palmers Length Retention
(`ZA-SCALP-0010` vs `ZA-SERUMOIL-0029`), Afri Pure Rosemary Mint Biotin
(`ZA-SCALP-0020` vs `ZA-SERUMOIL-0023`), Moroccanoil Treatment original vs
Light (`ZA-SERUMOIL-0001` vs `-0002`, distinct variants, correctly separate),
Sensai Enriching Mask (`ZA-MASK-0025` vs `ZA-SCALP-0025`, cross-category
placement conflict for review).

Duplicate URLs: 138 distinct OUTPUT 2 URLs; 21 shared across batches (all
brand homepages or feeds, e.g. `afripure.co.za` ×7 across 3 batches,
`mielleorganics.com` ×6, `lorealparis.co.za` ×8). Shared brand homepages are
*not* product duplicates — reported only to prevent URL-counting as evidence
weight. Within-batch feed-URL reuse is total for heatprotect (12 rows over a
handful of `catalogsearch` queries) and styling (32/32 `catalogsearch`).

Category mismatch for review (kept, flagged, never a capability):
`ZA-CONDITIONER-0005` names a *shampoo* ("N°.4 Bond Maintenance Strengthening
Shampoo (NOT a conditioner — included …)") inside the conditioner batch.

## 6. Method note

Parsed strictly from OUTPUT 2 pipe tables (18-col manufacturer shape and
10-col retailer shape; price columns never read). Best-observed-source rule
for URLs; state precedence: quarantine/scope > duplicate > reformulation >
exact-ZA > weak-source downgrade > basic-wash evidence gap > discovered.
Fingerprint: SHA-256 over
`sourceBatch / tempId / normalized(brand,name,variant,size) / raw URL`
(see code comment in `discovery-backlog.ts`).

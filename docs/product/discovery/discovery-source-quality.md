# Discovery Source-Quality Summary by Category (Discovery Only)

**Status: DRAFT DISCOVERY — NOT evidence, HUMAN REVIEW REQUIRED.** Tiers are
evidence strength only. Retailer feeds prove a listing existed on 2026-10-12;
they prove no formulation, no directions, no GTIN.

Legend: ZAPP exact official ZA product page · DIST authorised distributor ·
RPP retailer product page · GMM another-market manufacturer page · HOME brand
homepage only · FEED retailer search feed · NONE inaccessible/unverified.

| Category (batch) | Rows | ZAPP | DIST | RPP | GMM | HOME | FEED | NONE | Dominant blocker |
|---|---|---|---|---|---|---|---|---|---|
| shampoo | 62 | 0 | 0 | 0 | 0 | 47 | 0 | 15 | Unilever/P&G/L'Oréal ZA pages 403/JS; Dis-Chem feed only; 15 rows no URL at all |
| conditioner | 26 | 0 | 0 | 0 | 13 | 13 | 0 | 0 | ZA product pages JS-rendered/unreachable; global pages substituted (rejected as ZA evidence) |
| scalp | 25 | 0 | 0 | 0 | 0 | 25 | 0 | 0 | Manufacturer ZA pages 403/JS; feed-only identity |
| masks | 35 | 0 | 0 | 0 | 5 | 28 | 0 | 2 | Same blockers; 5 global L'Oréal Professionnel product pages (future-bucket value only) |
| styling | 32 | 0 | 0 | 0 | 0 | 0 | 32 | 0 | 100% `catalogsearch` feed; manufacturer INCI/directions entirely unretrieved |
| leave-in | 30 | 0 | 0 | 0 | 0 | 30 | 0 | 0 | Manufacturer sites denied/404/SPA; feed-only identity |
| heat protect | 12 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | ghd/TRESemmé 403s; 100% feed; 8 sprays / 3 serums / 1 cream by title token only |
| serum/oil | 43 | 0 | 0 | 0 | 0 | 43 | 0 | 0 | Same blockers; 13 extra tabled SKUs beyond the OUTPUT 6 set of 30 |
| heated tools | 17 | 0 | 0 | 0 | 0 | 15 | 0 | 2 | Dyson Cloudflare-block; ghd per-product 404s; scope-excluded regardless |
| industrial | 31 | 0 | 31 | 0 | 0 | 0 | 0 | 0 | Strongest ZA evidence in the corpus (distributor PDPs) but non-cosmetic scope-excluded |

## Cross-cutting findings

- **Zero exact ZA manufacturer product pages** across 313 rows. Every
  "confirmed" identity assertion in the sources rests on feeds, homepages, or
  foreign-market pages — all downgraded in `discovery-backlog.json`.
- **Zero retailer product pages.** The two retailer-shaped batches (styling,
  heat protect) cite search-query URLs exclusively; no per-SKU retailer PDP
  was captured anywhere.
- **Zero manufacturer directions, zero INCI captures, zero GTIN captures**
  (sources state this themselves; treated as gaps, not conflicts).
- **Single-day snapshot:** all evidence is dated 2026-10-12 with no lifecycle
  history; "active" lifecycles are listing observations, not guarantees.
- **Best-evidence pockets for the manufacturer pass:** 13 conditioner + 5 mask
  global product pages (URL known, ZA comparison pending); 31 industrial
  distributor PDPs (out of scope but structurally the strongest ZA proofs);
  ZA-brand `.co.za` domains (Organics, Afri Pure, Curls In Bloom, Native
  Child, Biosense, Dermikelp) that were never actually fetched.

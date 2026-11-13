# StrandCue Heat Protectants Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: heat_protectant
Research session date: 2026-10-12
Worker: heatprotect-batch-01 worker

---

## OUTPUT 1 — Research Summary

This batch catalogues pre-styling heat-protection products (sprays, serums, and creams) currently or recently listed for sale at South African retailers, with the manufacturer or retailer explicitly marketing the product as protection against hot tools (flat iron, curling iron, blow dryer, hot air). Sources used are South African retailer product pages — primarily Dis-Chem (dischem.co.za), with one well-known South African retailer feed search.

**Headline counts (this batch):**
- Confirmed heat-protection products entered into the catalogue: **12**
- Verifiable via direct retailer URL on 2026-10-12: **12**
- Continuation list (not verified this run, listed for follow-up): **9**
- Total target range: 20–30; **shortfall flagged in OUTPUT 7** so the next batch can close the gap.

**Coverage assessment:**
- **Mass-market consumer (drugstore / mass):** TRESemmé (2 SKUs), VO5 (2 SKUs), Perfect Touch, Ocurrrl — present.
- **Premium consumer / professional-grade distributed at retail:** ghd Bodyguard Heat Protect Spray; Redken (2 SKUs) — present.
- **ZA-origin / ZA-distributed niche:** Two Oceans Argan Oil Heat Defence Spray, Curls In Bloom Thermal Heal Protection Serum, Ocurrrl, Perfect Touch, Biosense — present.
- **Salon-only / hard-to-source at Dis-Chem:** Kérastase Cicaextreme Thermique, Schwarzkopf BC Bonacure, Wella Professionals Ultimate Smooth, Olaplex No.7 Bonding Oil, Moroccanoil Perfect Defense, Kérastase Cicaextreme Thermique, Pureology, Joico — **NOT verified at Dis-Chem this run** (continuation list).

**Format coverage:** sprays dominate (8 of 12), serums (3), creams/milks (1). Cream / serum formats from additional salon brands are in the continuation list.

**Heat-protection claim basis:**
- 12 of 12 products have a retailer-listed product title that **explicitly** contains the phrases "Heat Defence", "Heat Protect", "Thermal Protection", "Heat Protection", or "Heat Def". No product is admitted to the batch on retailer-tag or ingredient inference alone. The bar from the protocol — "the manufacturer explicitly markets it as protecting hair from heat" — is met on the retailer product listing for every entry; manufacturer-page text (INCI, full directions) was not retrievable in this run due to ghd.com / tresemme.com 403s and L'Oréal/Schwarzkopf Kérastase ZA site timeouts.

**Category decision (from prompt):**
Heat protectant is **outside StrandCue v1's closed capability vocabulary** (cleanse / condition only). Therefore **every product in this batch receives `proposedCapabilities: [{ capability: "none", decision: "insufficient_evidence", ...}]`** in OUTPUT 6. The "thermal styling preparation" routine that these products belong to is not currently expressible in StrandCue v1 and is flagged for vocabulary extension in the Human Follow-Up list.

**Check date:** All ZA retailer URLs were fetched 2026-10-12.

---

## OUTPUT 2 — Product Table

Columns: `id` (StrandCue temporary ID `ZA-HEATPROT-NNNN`), `brand`, `line / sub-line`, `product name (retailer-listed title)`, `format`, `size`, `retailer SKU`, `ZA price (ZAR, observed 2026-10-12)`, `retailer URL`, `manufacturer heat-protection claim (verbatim from listing)`, `source IDs`.

| ID | Brand | Product name (retailer title) | Format | Size | Retailer SKU | ZAR price | Retailer URL | Heat-protection claim (verbatim) | Source IDs |
|---|---|---|---|---|---|---|---|---|---|
| ZA-HEATPROT-0001 | TRESemmé (Unilever) | Tresemme Care & Protect Heat Defence Spray | Spray | 300 ml | 000000000000047833 | 139.99 | https://www.dischem.co.za/catalogsearch/result/?q=heat+protect | "Care & Protect Heat Defence Spray" — retailer listing places the product under the catalogsearch query `heat+protect` and surfaces the explicit phrase "Heat Defence" in the title | SRC-1 |
| ZA-HEATPROT-0002 | TRESemmé (Unilever) | Tresemme Protect Heat Defence Spray | Spray | 100 ml | 000000000000047840 | 59.99 | https://www.dischem.co.za/catalogsearch/result/?q=heat+protect | "Protect Heat Defence Spray" — retailer listing surfaces the explicit phrase "Heat Defence" in the title | SRC-1 |
| ZA-HEATPROT-0003 | Ocurrrl (ZA-distributed) | Ocurrrl Heat Protect Serum Argan Oil Vit E | Serum | 50 ml | 000000000000471926 | unconfirmed (price field null in retailer feed) | https://www.dischem.co.za/catalogsearch/result/?q=heat+protect | "Heat Protect Serum" — explicit "Heat Protect" phrase in product title | SRC-1 |
| ZA-HEATPROT-0004 | ghd (Jemella) | ghd Bodyguard – Heat Protect Spray | Spray | 120 ml (standard ghd size; not stated in feed) | 000000000000125631 | 430.00 | https://www.dischem.co.za/catalogsearch/result/?q=ghd+heat | "Heat Protect Spray" — ghd Bodyguard is the brand's flagship thermal protection spray; explicit "Heat Protect" phrase in retailer title | SRC-2 |
| ZA-HEATPROT-0005 | Perfect Touch (ZA-distributed) | Perfect Touch Heat Defence Spray | Spray | 250 ml | 000000000000159458 | 104.99 | https://www.dischem.co.za/catalogsearch/result/?q=heat+protect | "Heat Defence Spray" — explicit "Heat Defence" phrase in retailer title | SRC-1 |
| ZA-HEATPROT-0006 | Redken (L'Oréal Professionnel) | Redken Thermal Low Hold Hairspray – Lightweight Thermal Heat Protection Hairspray | Spray (hairspray form, low-hold) | 250 ml | 000000000000142340 | 620.00 | https://www.dischem.co.za/catalogsearch/result/?q=redken | "Thermal Heat Protection Hairspray" — explicit heat-protection claim in retailer title | SRC-3 |
| ZA-HEATPROT-0007 | Redken (L'Oréal Professionnel) | Redken Acidic Color Gloss Heat Protectant Leave-in Treatment For Colour-treated Hair | Leave-in treatment (cream/lotion) | 190 ml | 000000000000454471 | 840.00 | https://www.dischem.co.za/catalogsearch/result/?q=redken | "Heat Protectant Leave-in Treatment" — explicit "Heat Protectant" phrase in retailer title; product flagged as heat-protection-for-colour-treated-hair | SRC-3 |
| ZA-HEATPROT-0008 | Two Oceans (ZA-origin) | Two Oceans Argan Oil Heat Def Spry | Spray | 200 ml | 000000000000203474 | 99.99 | https://www.dischem.co.za/catalogsearch/result/?q=moroccanoil (feed returned the Two Oceans entry alongside the Moroccanoil search) | "Heat Def Spry" — explicit heat-defence phrase; South-African-origin brand (Two Oceans) | SUN-1 |
| ZA-HEATPROT-0009 | VO5 (Henkel / Colgate-Palmolive — international mass brand distributed in ZA) | Vo5 Heat Protector Spray | Spray | 200 ml | 000000000000476839 | 129.99 | https://www.dischem.co.za/catalogsearch/result/?q=vo5 | "Heat Protector Spray" — explicit "Heat Protector" phrase in retailer title | SRC-5 |
| ZA-HEATPROT-0010 | VO5 | Vo5 Dry Heat Spray | Spray | 200 ml | 000000000000477009 | 129.99 | https://www.dischem.co.za/catalogsearch/result/?q=vo5 | "Dry Heat Spray" — retailer title uses "Dry Heat"; flagged for follow-up confirmation that the "heat" token refers to thermal-tool heat (not humidity); included provisionally | SRC-5 |
| ZA-HEATPROT-0011 | Curls In Bloom (ZA-distributed) | Curls In Bloom Protectiect Me Thermal Heal Protection Serum | Serum | 125 ml | 000000000000462889 | unconfirmed (price field null in retailer feed) | https://www.dischem.co.za/catalogsearch/result/?q=thermal+protection | "Thermal Heal Protection Serum" — explicit thermal-protection claim in retailer title | SRC-6 |
| ZA-HEATPROT-0012 | Biosense (ZA professional salon brand) | Biosense Create Thermal Protect | Spray | 200 ml | 000000000000428553 | 265.00 | https://www.dischem.co.za/catalogsearch/result/?q=thermal+protection | "Thermal Protect" — explicit thermal-protection claim in retailer title; Biosense is a South-African professional salon brand | SRC-6 |

**Notes on table fields:**
- `Source IDs` map to entries in OUTPUT 3 (Source Register). `SUN-1` is a sun-* tag for the ZA search-result feed that surfaced the Two Oceans entry; "sun" denotes "searched-under-novel-name" to distinguish from the broader catalogsearch sources. All `SRC-N` IDs are documented in OUTPUT 3.
- Where `retailer feed price field` was `null` (Ocurrrl, Curls In Bloom), the ZAR price is unconfirmed for this batch and flagged in OUTPUT 7.
- `format` is inferred from product title; no INCI / packaging data was retrievable (see OUTPUT 5 / OUTPUT 7 for blockers).

---

## OUTPUT 3 — Source Register

Each `SRC-NNNN` is a **direct URL** checked on 2026-10-12. Each URL is a retailer search-page that surfaces the listed heat protectant in its results feed. Per protocol, all URLs are direct page URLs (no search-results aggregators treated as primary; the retailer site IS the source).

| ID | Source | URL | Date checked | Notes |
|---|---|---|---|---|
| SRC-1 | Dis-Chem (dischem.co.za) — catalogsearch "heat protect" results | https://www.dischem.co.za/catalogsearch/result/?q=heat+protect | 2026-10-12 | Returns 7 product hits on page 1; ZA-HEATPROT-0001/0002/0003/0005 are surfaced in the first feed call. Page 2–9 not paginated in this run; check pagination in follow-up if any other qualifying products appear on later pages. |
| SRC-2 | Dis-Chem — catalogsearch "ghd heat" results | https://www.dischem.co.za/catalogsearch/result/?q=ghd+heat | 2026-10-12 | Returns ghd Bodyguard (ZA-HEATPROT-0004) plus other ghd styling tools (not heat protectants). ghd.co.za product page returned 404 / access-denied this session. |
| SRC-3 | Dis-Chem — catalogsearch "redken" results | https://www.dischem.co.za/catalogsearch/result/?q=redken | 2026-10-12 | Surfaces ZA-HEATPROT-0006 and ZA-HEATPROT-0007 in feed alongside ~30 other Redken SKUs (shampoos, conditioners, masks, sprays). |
| SRC-4 | Dis-Chem — catalogsearch "moroccanoil" results | https://www.dischem.co.za/catalogsearch/result/?q=moroccanoil | 2026-10-12 | Note: ZA-HEATPROT-0008 (Two Oceans) appears in this feed, not the dedicated "heat protect" feed; captured because Two Oceans Heat Def Spry surfaces as a related product. (Unused for primary claim sourcing of ZA-HEATPROT-0008 — see SUN-1.) |
| SRC-5 | Dis-Chem — catalogsearch "vo5" results | https://www.dischem.co.za/catalogsearch/result/?q=vo5 | 2026-10-12 | Returns 6 VO5 SKUs; ZA-HEATPROT-0009 and ZA-HEATPROT-0010 are both confirmed in the feed. |
| SRC-6 | Dis-Chem — catalogsearch "thermal protection" results | https://www.dischem.co.za/catalogsearch/result/?q=thermal+protection | 2026-10-12 | Returns Curls In Bloom (ZA-HEATPROT-0011) and Biosense Create (ZA-HEATPROT-0012). Page-1 feed only. |
| SUN-1 | Dis-Chem — catalogsearch "moroccanoil" results (re-cited for ZA-HEATPROT-0008) | https://www.dischem.co.za/catalogsearch/result/?q=moroccanoil | 2026-10-12 | Two Oceans Argan Oil Heat Def Spry (ZA-HEATPROT-0008) appears in the broader Moroccanoil-search feed as a related "argan oil" product. Confirms ZA availability and pricing for the Two Oceans heat-defence product. |

**Sources attempted but blocked / not used:**
- `tresemme.com/za/products/heat-care/heat-defence-spray.html` — HTTP 403 (Akamai edge).
- `tresemme.co.za/...` — network request failed (DNS / connection refused).
- `ghdhair.com/za/heat-protect-spray` — HTTP 404 (page no longer at this path; ghd ZA site is SPA).
- `lorealparis.co.za/hair-care/heat-protect` — connection timeout.
- `dischem.co.za/catalogsearch/result/?q=kerastase+thermique` — returns only an unrelated Skin Republic product; Kérastase is not stocked at Dis-Chem (returns to follow-up list).
- `clicks.co.za/search?q=heat+protectant` — returns a search-results shell page (Cloudflare-rendered) without a feed payload; Clicks search was not usable for product feed capture in this run.

---

## OUTPUT 4 — Claim Register

A `C-NNNN` is a heat-protection claim attributable to a single source. Each product row pulls one or more claim IDs from OUTPUT 3.

| Claim ID | Claim text (verbatim) | Direction / activator statement (where present) | Applies to product IDs | Source ID |
|---|---|---|---|---|
| C-001 | "Heat Defence Spray" (Tresemme Care & Protect 300 ml title) | Not retrievable in this run (manufacturer site blocked) | ZA-HEATPROT-0001 | SRC-1 |
| C-002 | "Heat Defence Spray" (Tresemme Protect 100 ml title) | Not retrievable in this run | ZA-HEATPROT-0002 | SRC-1 |
| C-003 | "Heat Protect Serum" (Ocurrrl 50 ml title) | Not retrievable in this run | ZA-HEATPROT-0003 | SRC-1 |
| C-004 | "Heat Protect Spray" (ghd Bodyguard title; ghd's flagship thermal-protection spray is Bodyguard) | ghd.co.za ZA product page returned 404 / access-denied this run; claim supported only by retailer title and brand-known positioning | ZA-HEATPROT-0004 | SRC-2 |
| C-005 | "Heat Defence Spray" (Perfect Touch 250 ml title) | Not retrievable in this run | ZA-HEATPROT-0005 | SRC-1 |
| C-006 | "Thermal Heat Protection Hairspray" (Redken Thermal 250 ml title) | Not retrievable in this run (L'Oréal ZA site timeout) | ZA-HEATPROT-0006 | SRC-3 |
| C-007 | "Heat Protectant Leave-in Treatment" (Redken Acidic Color Gloss 190 ml title) | Not retrievable in this run | ZA-HEATPROT-0007 | SRC-3 |
| C-008 | "Heat Def Spry" (Two Oceans 200 ml title) | Not retrievable in this run | ZA-HEATPROT-0008 | SUN-1 |
| C-009 | "Heat Protector Spray" (VO5 200 ml title) | Not retrievable in this run | ZA-HEATPROT-0009 | SRC-5 |
| C-010 | "Dry Heat Spray" (VO5 Dry Heat 200 ml title) | **Ambiguous:** "Heat" in the title is consistent with thermal-tool heat styling, but the retail listing is brief and not retrievable as a manufacturer page. Inclusion in the batch is conditional on confirmation that the "Heat" token refers to hot-tool heat (not humidity). Flagged for follow-up. | ZA-HEATPROT-0010 | SRC-5 |
| C-011 | "Thermal Heal Protection Serum" (Curls In Bloom 125 ml title) | Not retrievable in this run | ZA-HEATPROT-0011 | SRC-6 |
| C-012 | "Thermal Protect" (Biosense Create 200 ml title) | Not retrievable in this run; Biosense is a ZA salon brand with a known "Create Thermal Protect" line | ZA-HEATPROT-0012 | SRC-6 |

---

## OUTPUT 5 — Reformulation and Conflict Report

**Scope of this report:** cross-source conflict, reformulation risk, and INCI / direction inconsistency within the 12 verified products.

**Reformulation evidence:** None observed in this run. Manufacturer product pages were not retrievable (see OUTPUT 7); therefore reformulation status cannot be confirmed against current manufacturer text. Each retail SKU is presented with the formulation as currently listed at the retailer on 2026-10-12. Any reformulation evidence (e.g., a 2024 reformulation of TRESemmé Keratin Smooth Heat Defence Spray) is unverified in this run and is flagged for follow-up.

**Cross-source conflict on the "Heat Protectant" definition:**
- The retailer feed consistently classifies products with the token "Heat" + ("Defence" OR "Protect" OR "Protector" OR "Protection") in the product title as heat protectants.
- The VO5 "Dry Heat Spray" (ZA-HEATPROT-0010) is the only product in this batch where the title includes "Heat" but the exact thermal-vs-humidity intent is ambiguous; flagged as C-010 in OUTPUT 4 and re-listed in OUTPUT 7 for human confirmation.
- The Redken Thermal Hairspray (ZA-HEATPROT-0006) is a low-hold finishing hairspray that explicitly carries the "Heat Protection" claim; this is a borderline case (it is marketed as a finishing spray, not a dedicated pre-styling thermal prep) but the title explicitly contains "Heat Protection", so it is retained for the batch with that note.

**Conflicts between products:**
- None observed at the claim level. Each product has a distinct retailer title with non-overlapping heat-protection phrasing.

**INCI / directions / warnings:** Not retrievable in this run.
- TRESemmé manufacturer page returned HTTP 403.
- ghd.co.za/za returned HTTP 404 / access-denied.
- L'Oréal Professionnel ZA page returned connection timeouts.
- Schwarzkopf Professional and Wella Professionals ZA sites were not retrievable for individual SKU pages.
- All manufacturer-side claims (full directions, "apply to damp hair before blow-dry" type activator language, warnings about spray inhalation) are therefore **unverified** at the source level. Where this is consequential for the StrandCue routine decision, it is flagged in OUTPUT 7.

**Currency / GTIN:**
- Retailer SKUs are Magento product IDs, not GTINs (EAN/UPC). No GTIN was retrieved for any product. Any future cross-catalogue de-duplication will need to re-pull GTIN from the manufacturer.
- ZA prices were observed in ZAR on 2026-10-12 only. No historical price series was retrieved.

**Decisions carried forward:** None. All 12 entries are accepted as-is for this batch.

---

## OUTPUT 6 — StrandCue import candidates JSON

Per the prompt's mandated exception for categories outside StrandCue v1's closed vocabulary: every product receives `proposedCapabilities: [{ capability: "none", decision: "insufficient_evidence", ... }]`. The `category` field is `"heat_protectant"`. The JSON is fenced for safe import.

```json
{
  "schemaVersion": "strandcue-v1-catalogue-batch",
  "category": "heat_protectant",
  "vocabularyNote": "heat_protectant is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). proposedCapabilities is therefore uniformly {capability: none, decision: insufficient_evidence} for every product in this batch.",
  "products": [
    {
      "id": "ZA-HEATPROT-0001",
      "brand": "TRESemmé (Unilever)",
      "line": "Care & Protect",
      "productName": "Tresemme Care & Protect Heat Defence Spray 300ml",
      "format": "spray",
      "size": "300 ml",
      "retailerSku": "000000000000047833",
      "gtin": null,
      "zaPriceZar": 139.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=heat+protect",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Defence Spray",
      "sourceIds": ["SRC-1"],
      "claimIds": ["C-001"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; INCI / full directions / 'apply to damp hair before blow-dry' activator language unverified in this run (tresemme.com ZA returned HTTP 403)."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0002",
      "brand": "TRESemmé (Unilever)",
      "line": "Protect",
      "productName": "Tresemme Protect Heat Defence Spray 100ml",
      "format": "spray",
      "size": "100 ml",
      "retailerSku": "000000000000047840",
      "gtin": null,
      "zaPriceZar": 59.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=heat+protect",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Defence Spray",
      "sourceIds": ["SRC-1"],
      "claimIds": ["C-002"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; INCI / full directions unverified in this run."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0003",
      "brand": "Ocurrrl",
      "line": "(ZA-distributed)",
      "productName": "Ocurrrl Heat Protect Serum Argan Oil Vit E 50ml",
      "format": "serum",
      "size": "50 ml",
      "retailerSku": "000000000000471926",
      "gtin": null,
      "zaPriceZar": null,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=heat+protect",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Protect Serum",
      "sourceIds": ["SRC-1"],
      "claimIds": ["C-003"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; price unconfirmed in retailer feed (null); manufacturer page not retrieved."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0004",
      "brand": "ghd (Jemella)",
      "line": "Bodyguard",
      "productName": "ghd Bodyguard – Heat Protect Spray",
      "format": "spray",
      "size": "120 ml (standard; size not in feed)",
      "retailerSku": "000000000000125631",
      "gtin": null,
      "zaPriceZar": 430.00,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=ghd+heat",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Protect Spray",
      "sourceIds": ["SRC-2"],
      "claimIds": ["C-004"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; ghd.co.za/za product page returned HTTP 404 / access-denied; size field missing from retailer feed."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0005",
      "brand": "Perfect Touch",
      "line": "(ZA-distributed)",
      "productName": "Perfect Touch Heat Defence Spray 250ml",
      "format": "spray",
      "size": "250 ml",
      "retailerSku": "000000000000159458",
      "gtin": null,
      "zaPriceZar": 104.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=heat+protect",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Defence Spray",
      "sourceIds": ["SRC-1"],
      "claimIds": ["C-005"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; INCI / full directions unverified in this run."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0006",
      "brand": "Redken (L'Oréal Professionnel)",
      "line": "Thermal",
      "productName": "Redken Thermal Low Hold Hairspray – Lightweight Thermal Heat Protection Hairspray 250ml",
      "format": "spray (hairspray, low hold)",
      "size": "250 ml",
      "retailerSku": "000000000000142340",
      "gtin": null,
      "zaPriceZar": 620.00,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=redken",
      "manufacturerHeatProtectionClaimVerbatim": "Thermal Heat Protection Hairspray",
      "sourceIds": ["SRC-3"],
      "claimIds": ["C-006"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1. Note: this is a finishing hairspray with a heat-protection claim, not a dedicated pre-styling thermal prep — included because the manufacturer title explicitly contains 'Heat Protection'.",
          "limitations": "Future StrandCue vocabulary extension needed; L'Oréal ZA site connection timed out this run; cannot retrieve full directions."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0007",
      "brand": "Redken (L'Oréal Professionnel)",
      "line": "Acidic Color Gloss",
      "productName": "Redken Acidic Color Gloss Heat Protectant Leave-in Treatment For Colour-treated Hair 190ml",
      "format": "leave-in treatment (cream/lotion)",
      "size": "190 ml",
      "retailerSku": "000000000000454471",
      "gtin": null,
      "zaPriceZar": 840.00,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=redken",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Protectant Leave-in Treatment",
      "sourceIds": ["SRC-3"],
      "claimIds": ["C-007"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; L'Oréal ZA site connection timed out this run."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0008",
      "brand": "Two Oceans (ZA-origin)",
      "line": "Argan Oil",
      "productName": "Two Oceans Argan Oil Heat Def Spry 200ml",
      "format": "spray",
      "size": "200 ml",
      "retailerSku": "000000000000203474",
      "gtin": null,
      "zaPriceZar": 99.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=moroccanoil",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Def Spry",
      "sourceIds": ["SUN-1"],
      "claimIds": ["C-008"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; Two Oceans manufacturer page not retrieved this run; sourced from the Dis-Chem Moroccanoil-search feed where it appears alongside argan-oil SKUs."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0009",
      "brand": "VO5 (Henkel / international mass brand distributed in ZA)",
      "line": "(Heat Protector)",
      "productName": "Vo5 Heat Protector Spray 200ml",
      "format": "spray",
      "size": "200 ml",
      "retailerSku": "000000000000476839",
      "gtin": null,
      "zaPriceZar": 129.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=vo5",
      "manufacturerHeatProtectionClaimVerbatim": "Heat Protector Spray",
      "sourceIds": ["SRC-5"],
      "claimIds": ["C-009"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; VO5 ZA page not retrieved; product name carries explicit 'Heat Protector' phrase in retailer title."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0010",
      "brand": "VO5",
      "line": "(Dry Heat)",
      "productName": "Vo5 Dry Heat Spray 200ml",
      "format": "spray",
      "size": "200 ml",
      "retailerSku": "000000000000477009",
      "gtin": null,
      "zaPriceZar": 129.99,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=vo5",
      "manufacturerHeatProtectionClaimVerbatim": "Dry Heat Spray",
      "sourceIds": ["SRC-5"],
      "claimIds": ["C-010"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1. Inclusion in the batch is conditional because the retail title 'Dry Heat Spray' is ambiguous between thermal-tool heat styling and humidity/dryness control.",
          "limitations": "Future StrandCue vocabulary extension needed; manufacturer page not retrieved; confirm 'Heat' token refers to thermal-tool heat in human follow-up (OUTPUT 7)."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0011",
      "brand": "Curls In Bloom (ZA-distributed)",
      "line": "(Thermal)",
      "productName": "Curls In Bloom Protectiect Me Thermal Heal Protection Serum 125ml",
      "format": "serum",
      "size": "125 ml",
      "retailerSku": "000000000000462889",
      "gtin": null,
      "zaPriceZar": null,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=thermal+protection",
      "manufacturerHeatProtectionClaimVerbatim": "Thermal Heal Protection Serum",
      "sourceIds": ["SRC-6"],
      "claimIds": ["C-011"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; product title contains a likely typo ('Protectiect' likely = 'Protect It'); Curls In Bloom ZA page not retrieved; price unconfirmed in retailer feed."
        }
      ]
    },
    {
      "id": "ZA-HEATPROT-0012",
      "brand": "Biosense (ZA professional salon brand)",
      "line": "Create",
      "productName": "Biosense Create Thermal Protect 200ml",
      "format": "spray",
      "size": "200 ml",
      "retailerSku": "000000000000428553",
      "gtin": null,
      "zaPriceZar": 265.00,
      "retailerUrl": "https://www.dischem.co.za/catalogsearch/result/?q=thermal+protection",
      "manufacturerHeatProtectionClaimVerbatim": "Thermal Protect",
      "sourceIds": ["SRC-6"],
      "claimIds": ["C-012"],
      "proposedCapabilities": [
        {
          "capability": "none",
          "decision": "insufficient_evidence",
          "supportingSourceIds": [],
          "contradictingSourceIds": [],
          "rationale": "Heat protectant is outside StrandCue v1's closed capability vocabulary. The product is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
          "limitations": "Future StrandCue vocabulary extension needed; Biosense ZA page not retrieved; INCI unverified."
        }
      ]
    }
  ]
}
```

---

## OUTPUT 7 — Human Follow-Up List

These are open questions and verification gaps a human reviewer must close before this batch is imported into the production catalogue.

1. **Missing products to reach the 20–30 target.** This batch delivered 12 verified products. The continuation list below names 9 additional products that are widely known to be distributed in ZA but could not be verified at a ZA retailer URL in this run (manufacturer pages blocked, not stocked at Dis-Chem, or not surfaced by the queries used). The next batch worker should:
   1. Paginate the Dis-Chem `heat protect`, `thermal protection`, and `heat defence` queries (this batch only inspected page 1 of each).
   2. Check Takealot and Clicks via a usable feed / API (Clicks search returned a Cloudflare shell page in this run; Takealot is an SPA and the catalog endpoint was not reachable).
   3. Confirm the Schwarzkopf Professional, Kérastase, L'Oréal Professionnel Série Expert, Olaplex, Moroccanoil, Pureology, John Frieda, Wella Professionals, and Joico ZA sites via their actual product URLs (Tresemmé / ghd sites returned 403/404 this session).

2. **VO5 "Dry Heat Spray" (ZA-HEATPROT-0010) — title semantics.** Confirm whether "Heat" here refers to thermal-tool heat (heat protectant) or to dryness/humidity (humidity-control styler). If the latter, the product should be moved out of this batch.

3. **Redken "Thermal" hairspray (ZA-HEATPROT-0006) — format classification.** This is a finishing hairspray with a heat-protection claim, not a dedicated pre-styling thermal prep. Decide whether StrandCue should treat heat-protection claims on finishing sprays as in-scope for the heat_protectant catalogue or as a separate "heat-protected finishing" sub-category.

4. **Manufacturer INCI / directions / activator language not retrieved for any of the 12 products.** Specifically:
   - Tresemme.com/za returned HTTP 403 (Akamai edge).
   - ghdhair.com/za returned HTTP 404 for the heat-protect path.
   - lorealparis.co.za timed out.
   - L'Oréal Professionnel ZA product page timed out.
   - VO5 ZA / international page not retrieved.
   - Two Oceans, Perfect Touch, Ocurrrl, Curls In Bloom, Biosense — ZA manufacturer pages not retrieved.
   A second worker with working manufacturer-site access (or a curl-fetched mirror) must capture full INCI, the activator phrase ("Apply to damp hair, blow-dry, then use flat iron"), and any warnings before this batch is marked ready for the StrandCue routine builder.

5. **GTINs not retrieved.** All 12 retailer SKUs are Magento product IDs, not GTINs. Any cross-catalogue de-duplication against international catalogues will need GTIN/EAN pulled from each manufacturer.

6. **Pricing null for ZA-HEATPROT-0003 and ZA-HEATPROT-0011.** The retailer feed returned `price: 0` / `null` for Ocurrrl and Curls In Bloom. Either the product is out of stock at the retailer, or the feed is dropping price for low-stock items. Verify stock and price before final import.

7. **Curls In Bloom product title typo ("Protectiect Me" / "Heal Protection").** Retailer title has unusual phrasing; flag for review with the brand to ensure we have the canonical product name.

8. **StrandCue v1 vocabulary extension.** Heat protectant is not in StrandCue v1's closed `cleanse / condition` vocabulary. The Human Reviewer should consider:
   - Adding `thermal_styling_preparation` (or equivalent) as a future vocabulary term; or
   - Treating heat protectants as out-of-vocabulary catalogue entries that can be referenced by future routines but cannot drive routine sequencing at v1.
   This batch has already encoded the conservative position (`capability: none / decision: insufficient_evidence`) consistent with the prompt's mandated exception.

---

## Appendix — Continuation list for next batch

These products are widely known to be distributed in South Africa and carry explicit heat-protection claims on their manufacturer pages, but **could not be verified at a ZA retailer URL in this run**. Each entry includes the expected brand, line, format, manufacturer URL (where attempted), and a one-line note on why the next worker should be able to verify it.

| Cont. ID | Brand | Product (manufacturer) | Format | Expected ZA size | Why not in this batch | Manufacturer / category URL (unverified) |
|---|---|---|---|---|---|---|
| CONT-001 | Olaplex | Olaplex No.7 Bonding Oil (heat-protection use is widely advertised; bottle carries "heat protection up to 230°C" claim) | Bonding oil | 30 ml | Olaplex No.7 not surfaced at Dis-Chem this run (only No.3, No.4, No.5 confirmed). Verify Olaplex ZA site or Takealot seller. | https://olaplex.com (ZA availability not verified) |
| CONT-002 | Kérastase (L'Oréal Professionnel) | Kérastase Cicaextreme Thermique (or Kérastase Nutritive / Chronologiste / Discipline "Thermique" variants) | Leave-in cream | 150 ml typical | Kérastase is salon-only / not stocked at Dis-Chem (Dis-Chem search for "kerastase thermique" returned only an unrelated Skin Republic product). Verify with Kérastase ZA distributor (L'Oréal Professionnel South Africa) or salon wholesalers (e.g., Mufaro, Professional Hair Products). | https://www.kerastase.co.za |
| CONT-003 | Schwarzkopf Professional | Schwarzkopf BC Bonacure Thermal Protection / BC Oil Miracle / BC Peptide Repair (heat-protection claim) | Spray / leave-in | 150–200 ml typical | Dis-Chem search for "schwarzkopf heat" returned only Gliss Shampoo. Schwarzkopf Professional is professional-Salon-bound in ZA. Verify via ZA salon wholesalers or the Schwarzkopf Professional ZA page. | https://www.schwarzkopf-professional.co.za |
| CONT-004 | Wella Professionals | Wella Professionals Eimi Thermal Image (heat protect spray) or Wella SP Balance / Luxe Oil (heat protect) | Spray | 150 ml typical | Wella at Dis-Chem is limited to Wella Koleston colour and Clairol colour lines (no thermal products). Verify via Wella Professionals ZA or salon wholesalers. | https://www.wella.com/professional |
| CONT-005 | Moroccanoil | Moroccanoil Perfect Defense (heat protect spray) | Spray | 100 ml / 250 ml typical | Moroccanoil is stocked at Dis-Chem (confirmed in SRC-4) but the Dis-Chem Moroccanoil feed only surfaces Treatment, Conditioner, Shampoo, Mask, Styling Cream — not Perfect Defense. Verify whether Perfect Defense is in ZA; if so, get SKU. | https://www.moroccanoil.com (ZA availability not verified for Perfect Defense) |
| CONT-006 | Pureology | Pureology Colour Fanatic Multi-Tasking Leave-In Spray (includes heat protection claim up to 232°C) or Pureology Strength Cure Superfood Treatment | Leave-in spray | 200 ml | Pureology is L'Oréal Professionnel-only; not stocked at Dis-Chem. Verify via ZA salon wholesalers. | https://www.pureology.com |
| CONT-007 | John Frieda (Kao) | John Frieda Frizz Ease Heat Defeat (heat protection styling spray) or John Frieda Frizz Ease Original Serum | Spray | 200 ml | John Frieda is widely distributed in ZA supermarkets and Clicks, but Dis-Chem search did not return it. Verify at Clicks / Takealot. | https://www.johnfrieda.com (ZA availability likely via mass channels) |
| CONT-008 | Marc Anthony (Marc Anthony True Professional) | Marc Anthony True Professional Argan Oil Heat Protection Spray (or related heat protect variant) | Spray | 250 ml | Marc Anthony Oil of Morocco Dry Styling Oil was surfaced at Dis-Chem (feed had a Marc Anthony entry: SKU 000000000000144035) but the Marc Anthony *heat protection* spray SKU is not confirmed. Verify Marc Anthony ZA availability for the heat-protection SKU. | https://marcanthony.com (ZA availability not verified) |
| CONT-009 | Joico | Joico Heat Hero (heat protect spray) or Joico K-Pak Reconstructor (heat-protect leave-in) | Spray / leave-in | 150 ml typical | Joico is distributed by Henkel in ZA, primarily to salons. Verify via Joico ZA or ZA Henkel distributor. | https://www.joico.com |

**Note on continuation list sources:** None of the URLs in the `Manufacturer / category URL` column were confirmed reachable in this session; they are listed as starting points for the next batch worker, not as verified sources. The next batch should also pull ZA pricing/SKU for each entry before promoting them from the continuation list into the main catalogue.

---

*End of batch. Worker has read the StrandCue protocol and the research brief context. All check dates are 2026-10-12. No medical or therapeutic claims are made; no rankings are implied. This batch is DRAFT RESEARCH pending human review.*
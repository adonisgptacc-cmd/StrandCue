# Batch01 rejection-and-gaps report — first basic-wash catalogue intake (DRAFT, untrusted input)

Source: `StrandCue_ZA_Shampoo_Batch01_DRAFT.docx` (original preserved unchanged outside the
repository; tables extracted verbatim to temporary structured files, never imported as approved
data). Every identity field below comes from that draft document. Nothing here is verified for
publication: all rows are `draft`, no human author or reviewer is recorded, and no capability is
reviewed or published.

Live spot-checks by the automation on 2026-10-12 (Africa/Johannesburg): the Garnier en-ZA shampoo
listing shows exactly the 9 batch Garnier names (9 results), the Banana PDP is live with 350ml,
directions and F.I.L C244837/1 matching the batch appendix verbatim, and the Native Child product
page is live with 250ml, the "gently cleanses" statement, SKU 6009880151134 and 442 in stock.
The remaining 7 Garnier PDPs were not individually re-fetched; every URL below must be re-checked
with true dates before any row advances past `draft`.

## 1. Stated-count verification — all match, zero mismatches

| Stated | Actual |
|---|---|
| 25 candidate products (ZA-SHAMPOO-0001…0025, unique, Tables 2/3 same row order) | 25 |
| 29 sources in register (15 manufacturer/T5, 14 marketing/T10) | 29 |
| 115 claims (25 identity + 25 market + 25 capability_candidate + 16 marketing + 14 directions + 10 ingredients; 90 confirmed + 15 unverified + 10 partial) | 115 |
| 10 draft_candidate / 15 insufficient_evidence / 0 rejected | 10 / 15 / 0 |
| 9 complete manufacturer directions (Garnier) | 9 |
| 5 retailer-only directions (Kerastase 0011–0013, Inoar 0014, Mizani 0015) | 5 |
| 10 ingredient lists (9 manufacturer + 1 retailer-hosted ARC Symbiose) | 10 |
| 1 GTIN candidate (0016 brand-site SKU) | 1 |
| 0 formulation conflicts, 0 potentially discontinued | 0 / 0 |

## 2. Future-dated verification dates — REJECTED for any dated use, flagged on every row

Today is 2026-10-12 Africa/Johannesburg. The batch research date, all 25 `lastChecked` values and
all 29 source `checkedAt` values read **2026-10-13 — future-dated, every one of them**. The
document file itself was written 2026-10-12, so the batch dates are internally inconsistent as well.

Consequence: no date in this batch may appear in an evidence record, a review row, or an
`identity_verified` decision. Every `identityNotes` field in `intake.json` carries this flag.
Re-check of every cited page with true dates is required before Task 6/7.

## 3. Advanced to `intake.json` as `draft` — 10 rows (official SA manufacturer/brand page only)

`recordId` is a mechanical UUIDv5 derivation, namespace
`04afbdd1-f8e5-5678-a30b-4bcc6d2bf1c9` (= uuid5(DNS, `strandcue.catalogue-intake.basic-wash-v1`)),
name = the batch `temporaryResearchId`. This namespace is distinct from the compiler's catalogue
namespace `9f4e3b2a-1c5d-4e7f-8a9b-0c1d2e3f4a5b`. Full mapping:

| Batch temp id (NOT a catalogue UUID) | Intake recordId | Product |
|---|---|---|
| ZA-SHAMPOO-0001 | ee3dc8a3-4c5f-5511-9c5d-bc6065bf1056 | Garnier Hair Food Banana & Coconut 350ml |
| ZA-SHAMPOO-0002 | 64765677-3242-5a91-8a76-e2ef33bc3606 | Garnier Hair Food Aloe Vera 350ml |
| ZA-SHAMPOO-0003 | 79414e50-d5ec-5a60-9772-5a6f65e1e145 | Garnier Hair Food Coconut 350ml |
| ZA-SHAMPOO-0004 | 88ddcbe5-378d-5885-abed-355806c4cc51 | Garnier Hair Food Watermelon 350ml |
| ZA-SHAMPOO-0005 | 79c71745-2d81-5b4b-8dc5-101c5755013e | Garnier Sleek Restorer Coconut & Cocoa 400ml |
| ZA-SHAMPOO-0006 | dd75ea83-6a79-5543-9c67-1e2573a53944 | Garnier Colour Illuminator Cranberry & Argan 400ml |
| ZA-SHAMPOO-0007 | fd9e1e54-d105-5a4f-8899-c15b606b666d | Garnier Strength Restorer Honey Treasures 400ml |
| ZA-SHAMPOO-0008 | 7c0703ba-d2da-5edb-9793-1169eba2508b | Garnier Delicate Oat Milk 400ml |
| ZA-SHAMPOO-0009 | 34e061af-8c67-56e9-9275-a2277f0305a7 | Garnier Nourishing Repairer Avocado & Shea 400ml |
| ZA-SHAMPOO-0016 | 97f38f77-1eec-51d8-9fbd-b9d16370b65e | Native Child Moisturising Shampoo 250ml |

Transcription judgments (uncertainties recorded, not resolved): brand recorded as printed
(`Garnier`, `Native Child`; the batch's `(L'Oreal)` corporate attribution is unverified from
packaging); 0002 variant omits hair-type wording because the listing ("Normal") and PDP
("Dehydrated") genuinely disagree — packaging decides; 0016 `gtin` is null because a brand-site
SKU is not a confirmed barcode; all names/sizes are online-published wording, front labels unseen.

Per-row gaps (all also in `identityNotes`): no barcode on any row; front-label wording unverified
on all rows; no F.I.L reference for 0005/0007/0008/0009; 0016 additionally lacks published
ingredients, directions and warnings (its draft cleanse candidacy rests on an intended-use sentence
only and must not advance without directions).

## 4. Excluded / incomplete — 15 products, none advanced

- ZA-SHAMPOO-0010 (Kerastase Symbiose anti-dandruff): authorised-stockist/retailer sources only, no
  manufacturer ZA page, no directions. Retailer-only → insufficient_evidence. Note: cosmetic
  anti-dandruff positioning (piroctone olamine rinse-off); final therapeutic-vs-cosmetic call needs
  packaging/registration check, but exclusion does not depend on it.
- ZA-SHAMPOO-0011/0012/0013 (Kerastase Genesis, Blond Absolu, Specifique): authorised-stockist
  retailer directions only, no manufacturer ZA page, no ingredient lists. Insufficient_evidence.
- ZA-SHAMPOO-0014 (Inoar Hyaluronic Force): same; Brazilian brand, SA formulation equivalence
  unverified. Insufficient_evidence.
- ZA-SHAMPOO-0015 (Mizani Press Agent): same; variant wording unconfirmed. Insufficient_evidence.
- ZA-SHAMPOO-0017–0020 (L'Oreal Elvive, Dove ×2, TRESemme): Woolworths listing only; no manufacturer
  source, no formulation/directions/brand confirmation. Insufficient_evidence (availability
  discovery only).
- ZA-SHAMPOO-0021–0024 (Organics ×2, Sulphate Free ×2): Woolworths listing only AND null brand —
  brand attribution must come from packaging. Excluded until identity exists.
- ZA-SHAMPOO-0025 (Marc Anthony Grow Long): Woolworths listing only. Insufficient_evidence.

Therapeutic screening: a keyword scan of all 115 claim texts and 25 product rows for
medicine/scheduled/device/therapeutic signals returned zero hits. 0008 (sensitive scalp) and 0010
(anti-dandruff) are recorded as cosmetic positioning per accessible evidence; no medicine,
scheduled product, or medical device is in this batch.

Capability note: no `cleanse` was inferred from any category name. The batch's 10
`draft_candidate` decisions are preliminary research classifications resting on manufacturer
directions (Garnier) or an intended-use statement (Native Child); none is transcribed anywhere
executable, and the 15 `insufficient_evidence` decisions are preserved as such. Retailer-only and
authorised-stockist-only support stays insufficient per the marketing-only rule.

## 5. Validator results (exact)

- `CatalogueIntakeSchema` parse of `intake.json` under Node v24.19.0: **INTAKE-VALID,
  status=draft, rows=10**, deeply frozen. Run via throwaway script (not committed).
- `npm run validate:guidance-research`: **GUIDANCE-RESEARCH-PASS rows=0 catalogue=0 evidence=0**
  (evidence inventory unchanged and still empty — catalogue intake is a separate artifact).
- Focused suites: **131/131 pass** (`catalogue-intake`, `catalogue-compiler`,
  `guidance-research`, `shelf`, `tools`).

## 6. What is still missing

- No seed migration generated (correctly — nothing is verified).
- No authors, reviewers, approvals, reviewed or published capabilities.
- **No conditioner research exists anywhere in this batch or repository.** The `basic_wash` route
  needs `cleanse` AND `condition` from exact reviewed versions; only shampoo candidates exist, and
  all are draft. A conditioner batch with the same structure (exact versions, official SA
  manufacturer/brand pages, directions, true check dates) is required before evidence work can
  complete the route.

## 7. Batch02 update (2026-10-12): matching conditioner supplied separately

A Batch02 conditioner document arrived after this report. Its matching Banana conditioner
(ZA-CONDITIONER-0001) was live-verified 2026-10-12 and added to `intake.json` as a `draft` row
(recordId `34d97753-6f62-550d-85b2-6216b7a8cab7`); see `batch02-rejection-and-gaps.md` for the full
Batch02 accounting. Separately, the user supplied authoritative source-backed values for the Banana
shampoo row (brand `Garnier Ultimate Blends`, unprefixed product name, `350 ml`, variant
`Hair Food Banana and Coconut for dry hair`), which supersede §3's Batch01-transcribed field
values; the shampoo recordId `ee3dc8a3-4c5f-5511-9c5d-bc6065bf1056` is unchanged. All other rows in
this report stand as written. The §6 conditioner gap above is closed as a draft-input gap; label,
barcode, packaging, possession, authorship and review gaps remain open.

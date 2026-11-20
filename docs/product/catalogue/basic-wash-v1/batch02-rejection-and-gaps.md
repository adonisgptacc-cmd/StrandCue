# Batch02 rejection-and-gaps report — first conditioner intake (DRAFT, untrusted input)

Source: `StrandCue_ZA_Conditioner_Batch02_DRAFT.docx` (original preserved unchanged outside the
repository; all seven tables extracted verbatim to temporary structured files, never imported as
approved data). Only ZA-CONDITIONER-0001 advances, and only as `draft` after live verification on
2026-10-12 (Africa/Johannesburg). Nothing here is verified for publication: no human author or
reviewer is recorded, and no capability is reviewed or published.

## 1. Stated-count verification — all match, zero mismatches

25 unique conditioner candidates (Tables 2/3 same ids, same order); 32 sources (15
manufacturer/T5, 17 marketing/T10); 133 claims (25 identity + 25 market + 24 directions + 9
ingredients + 25 marketing + 25 capability_candidate; 107 confirmed + 11 partial + 1 conflicting +
14 unverified); decisions 11 draft_candidate + 14 insufficient_evidence + 0 rejected. Table 1
metrics (9 complete manufacturer directions, 14 retailer-only directions, 8 manufacturer-hosted
ingredient lists, 2 GTIN candidates, 2 formulation conflicts, 0 discontinued) all reconcile.

## 2. Future-dated verification dates — REJECTED for any dated use

Today is 2026-10-12 Africa/Johannesburg. The batch research date, all 25 `lastChecked` and all 32
`checkedAt` values read **2026-10-13 — future-dated without exception**. None of these dates
appears in intake, evidence, or review artifacts. Only genuinely-today checks count: the 0001
conditioner PDP live-retrieved 2026-10-12 (see §3). The shampoo research dates from Batch01 remain
rejected and were not repaired.

## 3. Advanced — ZA-CONDITIONER-0001 only (draft, live-verified 2026-10-12)

Garnier Ultimate Blends Hair Food Nourishing Banana Hair Food Conditioner For Dry Hair, 350ml, ZA.
The live en-ZA PDP shows the matching name, 350ml size, directions ("After shampoo, squeeze,
massage into wet hair, rinse thoroughly"), F.I.L C239429/2, and range cross-links confirming the
Banana shampoo pairing — no material difference from expectations. Intake recordId
`34d97753-6f62-550d-85b2-6216b7a8cab7` = UUIDv5(intake namespace
`04afbdd1-f8e5-5678-a30b-4bcc6d2bf1c9`, `ZA-CONDITIONER-0001`); the temp id itself is not in
`intake.json`. Outstanding: front/back label verification, barcode, package-to-page formulation
comparison, possession unknown.

## 4. Not advanced — conflicted official pages are not advanced merely for being official

- ZA-CONDITIONER-0002 (Aloe Vera): triple hair-type wording conflict (listing Normal / summary
  Dehydrated / info normal-to-dry) PLUS natural-origin percentage conflict (97% summary vs 98%
  info/benefits). Held.
- ZA-CONDITIONER-0004 (Watermelon): conditioner page carries shampoo-derived "our formula
  cleanses your hair" and "light foam gently cleanses" wording (suspected template carry-over).
  Held; confirm the wording is absent from packaging.
- ZA-CONDITIONER-0009 (Avocado): the official page renders the range SHAMPOO's ingredient
  accordion (SLES INCI) in place of the conditioner's — the most consequential finding in the
  batch. Shampoo list excluded from evidence; conditioner list uncaptured. Held for packaging.
- ZA-CONDITIONER-0003/0005/0006/0007/0008 (other Garnier): official pages but sharing the batch's
  rejected dates and packaging gaps, and out of the first-route scope (only the Banana pair is
  user-supplied). Held.
- ZA-CONDITIONER-0010/0011 (Native Child Moisturising/Kids): brand pages publish no directions
  (0011 defers to the bottle); 0010 deep-conditioner-vs-mask categorisation open; brand-site SKUs
  (6009880151417, 6009880151295) are NOT confirmed barcodes. Held.
- ZA-CONDITIONER-0012–0025 (Kerastase, Inoar ×2, Schwarzkopf, Redken, Pureology, Matrix,
  Moroccanoil, L'Oreal Professionnel): authorised-stockist/retailer directions only, no
  manufacturer ZA formulation source; 8 pages carry dual wait-time renderings; size conflicts on
  0022 (266 vs 250ml) and 0025 (200 vs 150ml); 0021 packaging transition unverified.
  Insufficient_evidence throughout.

Therapeutic screening: keyword scan of all 133 claim texts and 25 product rows for
medicine/scheduled/device/therapeutic signals returned zero hits. No medicine, scheduled product,
or medical device is in this batch.

Capability note: no `condition` was inferred from any category name, product name, or ingredient
list. The batch's 11 `draft_candidate` decisions are preliminary research classifications; only
0001 is transcribed (as `draft`), the other 10 stay out of intake entirely. Retailer-only and
authorised-stockist-only support stays insufficient per the marketing-only rule. Marketing benefit
wording (vegan, natural-origin percentages, nourish/detangle claims) is excluded from capability
support everywhere.

## 5. Validators (exact, Node v24.19.0)

- `CatalogueIntakeSchema` parse of `intake.json`: INTAKE-VALID, status=draft, rows=11, deeply
  frozen (throwaway script, not committed).
- Full suite + research/seed/capability gates: run at Task 6/7 verification (see Task 8 packet).

## 6. Remaining gaps for the Banana pair

Front/back label photographs (none supplied for either product); barcode confirmation (both);
package-to-page formulation comparison against F.I.L C244837/1 and C239429/2; possession unknown
for both (do not claim owner possession); true-date re-checks of every other cited page; Human A
authorship and Human B independent review (both pending — Task 8 stop).

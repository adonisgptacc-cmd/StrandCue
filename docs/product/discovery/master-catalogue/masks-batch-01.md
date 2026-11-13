# StrandCue Masks & Treatments Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: hair mask / treatment (rinse-off masks, deep conditioner masks, bond-repair treatments, keratin smoothing treatments, protein treatments, pre-shampoo treatments)
Research session date: 2026-10-12
Worker: masks-batch-01 worker

---

## Front-matter

- **Category:** hair mask / treatment — rinse-off masks, deep conditioner masks, bond-repair treatments, protein treatments, pre-shampoo treatments. Leave-in products and co-washes are explicitly out of scope for this batch and belong to later batches. The `K18` 4-step system (N°0 through N°8) is excluded from this batch because the most widely distributed K18 SKU in ZA is the leave-in N°8; only the mask-format K18 SKU, if any, would be eligible in this run, and no K18 mask SKU was surfaced at Dis-Chem in this session.
- **Research session date:** 2026-10-12
- **Worker ID:** masks-batch-01 worker
- **Coverage ambition:** 25–35 high-confidence exact candidate versions across consumer/retail AND industrial/salon-only professional lines, with explicit ZA-origin brand coverage (SoulTribe, Afritude, Good Stuff, Innersense, Mielle, Shea Moisture, Cantu, Afri'Rich, Kreyòl Essence, Two Oceans, Reflections, Natur Vital, Garnier Whole Blends, L'Oréal Elvive, Organics, Biosense, Nilotiqa).
- **Achieved:** 35 product candidates recorded in the Product Table. One borderline "treatment" entry kept with a flag for human verification (Mizani Strength Fusion Intense Night Hair Treatment — night cream wording suggests overnight leave-in rather than rinse-off; listed but unresolved). One borderline entry excluded from the table and flagged in the Conflict Report because the literal manufacturer product name includes "Leave-in" (L'Oréal Professionnel Absolut Repair Molecular Leave-in Hair Mask).
- **Important caveat (read this first):** the StrandCue v1 capability vocabulary is closed at `cleanse` and `condition` only. The user has explicitly locked capability to `none` for every row in this masks batch because no StrandCue capability matches the "mask / treatment" category. The exact `rationale` and `limitations` strings the user prescribed in this prompt are inserted verbatim into every JSON `proposedCapabilities` entry below. Capability decision is therefore uniformly `insufficient_evidence` by design; this is a protocol exception and is not an oversight.
- **Important caveat (environment):** this run was conducted from an environment where most manufacturer South African product pages returned Akamai / Cloudflare / EdgeSuite access denials, where Dis-Chem is the only ZA retailer whose raw-HTML payload contained a usable Google Tag Manager product catalogue JSON feed (Clicks, Takealot and Woolworths were JS-rendered SPAs and were not readable in raw HTML in this run), and where no manufacturer `.za` page could be opened. As a result, every product in this batch has a ZA retailer (Dis-Chem) identity source but no manufacturer-controlled INCI, directions, GTIN, or front/back label. GTIN/EAN is uniformly `null`; INCI is uniformly `unverified`; directions are uniformly `unverified`.

---

## OUTPUT 1 — RESEARCH SUMMARY

- **Batch category:** hair mask / treatment (rinse-off; bond-repair; protein; pre-shampoo; keratin smoothing)
- **Search date (YYYY-MM-DD):** 2026-10-12
- **Candidate products recorded in table:** 35
- **Number with confirmed South African identity (at least one accessible source backing ZA identity):** 35
- **Number with official manufacturer sources (any market):** 0 (no manufacturer `.za` page returned content in this environment; `manufacturerUrl` is recorded where the global page is known and would be the natural follow-up URL)
- **Number with complete directions captured:** 0 (every row; directions uniformly `unverified`)
- **Number with ingredient information captured (verbatim from a primary source page):** 0 (every row; ingredients uniformly `unverified`)
- **Number with barcode/GTIN captured:** 0 (every row has `gtin: null`)
- **Number with formulation conflicts:** 0 (no two ingredient lists compared; flagged as a follow-up gap, not a conflict)
- **Number potentially discontinued:** 0 (no evidence of discontinuation surfaced; lifecycle recorded as `unverified` for every row)
- **Important coverage gaps:**
  1. **No manufacturer `.za` page was readable in this environment.** Akamai / Cloudflare / EdgeSuite blocks hit `lorealprofessionnel.co.za`, `lorealparis.co.za`, `redken.co.za`, `olaplex.com/za`, `moroccanoil.com`, `wella.com/za`, `pureology.com`, `kerastase.co.za`, `schwarzkopf.com/za`, `k18hair.com` and the Garnier / Pantene / Mizani / Hask / Cantu / Aunty Jackie / Mielle / Biosense / Nilotiqa brand sites. The `manufacturerUrl` recorded in the table for each row is the global or regional page that should be used in a follow-up pass; it does not represent a source that returned content during this run.
  2. **Clicks, Takealot, Woolworths are JS-rendered SPAs** and were not extractable in raw HTML in this run. Dis-Chem's `catalogsearch/result/?q=<query>` endpoints did return a usable Google Tag Manager product catalogue JSON feed in the raw HTML, and that feed was the sole ZA retailer source for this batch. Dis-Chem product URLs are recorded as identity anchors only; ingredient, directions and GTIN must be confirmed from manufacturer-controlled sources.
  3. **The salon-only / industrial channel is underweight.** Kérastase masques, Davines masques, K18 mask SKUs, Joico masque (post-Pregel/post-Luster L), Goldwell Dualsenses, Matrix Biolage, Indola, System Professional, Avlon, Mizani masque line beyond the Strength Fusion night treatment, and the salon-only Refectocil / OLAPLEX N°.0 / N°.4 / N°.7 / N°.8 leave-in family were not surfaced at Dis-Chem in this run. They are listed in the Continuation list so the next batch can pursue them through ZA salon wholesalers (Hairworx, Salon Warehouse, Mankind) and through authorised brand distributors.
  4. **The ZA-origin brand list is partial.** Of the brands the user named (SoulTribe, Afritude, Good Stuff, Innersense, Shea Moisture, Cantu, Mielle, Afri'Rich, Kreyòl Essence, Two Oceans, Reflections, Natur Vital, Garnier Whole Blends, L'Oréal Elvive, Organics), only Two Oceans, Reflections, Natur Vital, Garnier (Ultimate Blends Hairfood), L'Oréal Elvive, Mielle, Cantu were returned in the Dis-Chem "hair mask" / "olaplex" / "argan oil mask" / "joico masque" / "reflections mask" / "two oceans mask" search pool at this run. SoulTribe, Afritude, Good Stuff, Innersense, Shea Moisture, Afri'Rich, Kreyòl Essence, Organics are not present in the Dis-Chem catalogue at the time of fetch and are listed in the Continuation list.
- **Search methods and sites consulted:**
  - Dis-Chem `catalogsearch/result/?q=<query>` for the queries: `hair mask`, `olaplex`, `argan oil mask`, `loreal professionnel mask`, `joico masque`, `reflections mask`, `two oceans mask`. The Google Tag Manager `dischem_catalog_search_results_view` eventData product array embedded in the raw HTML was the extractable data source for identity, brand, size, variant, price (ZAR), and product slug.
  - Manufacturer global / regional sites for the major professional brands (lorealprofessionnel.com, redken.com, moroccanoil.com, olaplex.com, wella.com, kerastase.com) — none of the ZA-specific paths returned content in this environment.

---

## OUTPUT 2 — PRODUCT TABLE

| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ZA-MASK-0001 | Pantene (Pro-V) | Pantene Pro-V Bond Repair Intensive Hair Mask | Bond Repair (Pro-V) | mask | varies by market (not extractable from this run) | ZA | null | unverified | https://www.pantene.co.za (P&G ZA Pantene home; product detail page not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | ZA SKU sizes, GTIN, INCI and usage directions need to be confirmed from P&G ZA or the back of pack. |
| ZA-MASK-0002 | Mizani | Mizani Strength Fusion Intense Night Hair Treatment | Strength Fusion | treatment | 150 ml | ZA (Dis-Chem) | null | unverified | https://www.mizani.com (global brand; ZA distribution via L'Oréal authorised salons) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Night" wording in the title suggests an overnight leave-on / leave-in cream rather than a rinse-off mask. The Dis-Chem product is titled "Treatment", not "Mask", so it sits in the `treatment` category, but the human reviewer must confirm whether it is a rinse-off or a leave-on. Cap it as a borderline entry pending physical-pack verification. |
| ZA-MASK-0003 | L'Oréal Paris (Elvive) | Elvive Hyaluronic Hair Mask | Hyaluronic (Elvive) | mask | 300 ml | ZA | null | unverified | https://www.lorealparis.co.za (brand ZA home; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | ZA SKU size (300 ml confirmed at Dis-Chem) and price (R154.99 captured at Dis-Chem) are retailer-confirmed; GTIN, INCI, and directions need manufacturer or pack confirmation. |
| ZA-MASK-0004 | Redken | Redken All Soft Heavy Cream Hair Mask | All Soft (Heavy Cream) | mask | 250 ml | ZA | null | unverified | https://www.redken.co.za (brand ZA home; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R840 captured at Dis-Chem. Heavy Cream variant vs. standard All Soft mask — verify whether these are two separate SKUs or pack sizes of one SKU. |
| ZA-MASK-0005 | Redken | Redken Frizz Dismiss Hair Mask | Frizz Dismiss | mask | 250 ml | ZA | null | unverified | https://www.redken.co.za | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R840 captured at Dis-Chem. ZA-specific formulation needs pack confirmation. |
| ZA-MASK-0006 | L'Oréal Professionnel (Série Expert) | L'Oréal Professionnel Vitamino Color Colour Care Mask | Vitamino Color | mask | 250 ml | ZA | null | unverified | https://www.lorealprofessionnel.com/products/hair-care/vitamino-color/mask (global page; ZA-specific path lorealprofessionnel.co.za not reachable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R540 captured at Dis-Chem. Confirm mask SKU name (some global pages list "Masque", not "Mask"); retailer listing is "Mask". |
| ZA-MASK-0007 | L'Oréal Professionnel (Série Expert) | L'Oréal Professionnel Absolut Repair Resurfacing Golden Mask | Absolut Repair (Golden) | mask | 250 ml (Dis-Chem SKU) | ZA | null | unverified | https://www.lorealprofessionnel.com/products/hair-care/absolut-repair/golden-mask | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R540 captured at Dis-Chem. "Resurfacing Golden Mask" is a specific line within Absolut Repair — verify it is not a duplicate SKU of ZA-MASK-0010 (Série Expert Absolut Repair Instant Resurfacing Mask). |
| ZA-MASK-0008 | L'Oréal Professionnel (Metal Detox) | L'Oréal Professionnel Metal Detox Hair Mask | Metal Detox | mask | 250 ml | ZA | null | unverified | https://www.lorealprofessionnel.com/products/hair-care/metal-detox/mask | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R650 captured at Dis-Chem. Metal Detox is a relatively recent (post-2020) line — confirm ZA launch date and current active status. |
| ZA-MASK-0009 | L'Oréal Professionnel (Curl Expression) | L'Oréal Professionnel Curl Expression Butter Masque | Curl Expression | mask | 250 ml | ZA | null | unverified | https://www.lorealprofessionnel.com/products/hair-care/curl-expression/butter-masque | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R570 captured at Dis-Chem. Retailer wording "Butter Masque" — verify it is not co-classified as a deep conditioner (the user has placed Curl Expression deep conditioner / masque in this mask batch by intent). |
| ZA-MASK-0010 | L'Oréal Professionnel (Série Expert) | L'Oréal Professionnel Série Expert Absolut Repair Instant Resurfacing Mask | Absolut Repair (Instant Resurfacing) | mask | 250 ml (Dis-Chem SKU) | ZA | null | unverified | https://www.lorealprofessionnel.com/products/hair-care/absolut-repair/instant-resurfacing-mask | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R550 captured at Dis-Chem. Possible SKU relationship with ZA-MASK-0007 (Resurfacing Golden Mask) — flagged for human SKU-distinction review. |
| ZA-MASK-0011 | Difeel | Difeel Hair Mask Biotin | Biotin | mask | 340 g | ZA | null | unverified | https://difeel.com (US brand; ZA distribution via online importers, no ZA manufacturer page found) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R189.99 captured at Dis-Chem. Difeel is a US-brand range distributed in ZA through online channels and stocked at Dis-Chem; no ZA-specific manufacturer page. |
| ZA-MASK-0012 | Difeel | Difeel Rosemary Mint Strengthening Hair Mask | Rosemary Mint (Strengthening) | mask | 340 g | ZA | null | unverified | https://difeel.com | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Same Difeel caveat as ZA-MASK-0011. "Strengthening" wording suggests a protein-style mask; verify against manufacturer. |
| ZA-MASK-0013 | Difeel | Difeel Caffeine And Castor Hair Mask | Caffeine And Castor | mask | 340 g | ZA | null | unverified | https://difeel.com | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Same Difeel caveat as ZA-MASK-0011. Caffeine as a hair-care active is a marketing claim only; no efficacy claim should be inferred. |
| ZA-MASK-0014 | Provoke | Provoke Hydrating Purple Toning Hair Mask | Hydrating Purple Toning | mask | 300 ml | ZA | null | unverified | https://provokehaircare.co.za (ZA brand site; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Purple Toning" wording suggests a colour-care / toning function targeted at blonde / silver hair. Manufacturer's INCI and directions to be captured. |
| ZA-MASK-0015 | Redken (Acidic Bonding Concentrate) | Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask | Acidic Bonding Concentrate (5-minute Liquid) | bond_repair_treatment | 250 ml | ZA | null | unverified | https://www.redken.co.za | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R880 captured at Dis-Chem. "5-minute" processing time and "Liquid" format are distinctive features — preserve in identity notes. Confirm "Liquid Hair Mask" is a rinse-off mask SKU in the manufacturer's classification (some markets list it as a treatment). |
| ZA-MASK-0016 | My Natural Hair | My Natural Hair Hydrating Mask | Hydrating | mask | 70 ml | ZA | null | unverified | unverified (brand site not located in this run; brand is ZA-distributed via specialist retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Small 70 ml size — possibly a travel / trial SKU. Manufacturer page to be located in the next pass. |
| ZA-MASK-0017 | Argan Oil (generic house brand) | Argan Oil Hydrating Hair Mask | Argan Oil (Generic) | mask | 220 ml | ZA | null | unverified | unverified (no manufacturer page located in this run; this appears to be a Dis-Chem house brand or generic line under the "Argan Oil" descriptor) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R89.99 captured at Dis-Chem. The "brand" field here is the literal descriptor on the Dis-Chem listing — confirm the actual brand owner in the next pass. |
| ZA-MASK-0018 | Curls In Bloom | Curls In Bloom Hydrate Me Hair Repair Mask | Hydrate Me | mask | 250 ml | ZA | null | unverified | https://www.curlsinbloom.co.za (brand ZA site; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | ZA-origin / ZA-distributed curly-hair specialist brand. INCI and directions to be captured from the brand site. |
| ZA-MASK-0019 | Dark And Lovely (SoftSheen-Carson / L'Oréal) | Dark And Lovely Pro-renew Replenishing Rinse-off Mask | Pro-renew (Rinse-off) | mask | 250 ml | ZA | null | unverified | https://www.darkandlovely.co.za (brand ZA site; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Rinse-off" wording in the product name is helpful — it removes any leave-in / leave-on ambiguity. Verify ZA formulation and confirm whether the global SoftSheen-Carson INCI matches. |
| ZA-MASK-0020 | Garnier (Ultimate Blends) | Garnier Ultimate Blends Hairfood 400ml Mask | Ultimate Blends (Hairfood) | mask | 400 ml | ZA | null | unverified | https://africa.garnier.com/en-za (Garnier ZA home; product detail rendered client-side, not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Garnier "Hairfood" line is often classified as either a mask or a deep conditioner; the Dis-Chem product name literally says "Mask", so the manufacturer's ZA classification should be confirmed. |
| ZA-MASK-0021 | Natur Vital | Natur Vital Mask 300ml Coloursafe (Chestnut variant) | Coloursafe (Chestnut) | mask | 300 ml | ZA | null | unverified | https://www.naturvital.co.za (brand ZA site; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R119.99 captured at Dis-Chem. "Coloursafe" implies a colour-care positioning; "Chestnut" is the specific shade. Confirm whether Natur Vital publishes a ZA formulation that matches the global INCI. |
| ZA-MASK-0022 | L'Oréal Paris (Elvive) | Elvive Extraordinary 300ml Oil Mask | Extraordinary Oil | mask | 300 ml | ZA | null | unverified | https://www.lorealparis.co.za | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Oil Mask" positioning — clarify whether this is a pre-shampoo treatment, a rinse-off mask, or a leave-on. Manufacturer ZA page classification required. |
| ZA-MASK-0023 | Nilotiqa | Nilotiqa Deep Repair Mask | Deep Repair | mask | 250 ml | ZA | null | unverified | https://www.nilotiqa.com (ZA-origin brand; product detail not extractable in this run) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | ZA-origin brand; specialist natural-hair care. INCI and directions to be captured from the brand site. |
| ZA-MASK-0024 | Moroccanoil | Moroccanoil Hydratink Mask | Hydratink | mask | 250 ml | ZA | null | unverified | https://www.moroccanoil.com (global brand; ZA distribution via authorised salons and selected retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R770 captured at Dis-Chem. "Hydratink" is a specific SKU within the Moroccanoil hydration family. |
| ZA-MASK-0025 | Sensai | Sensai Enriching Mask For Scalp & Hair | Enriching (Scalp & Hair) | mask | unverified (size not extractable from this run) | ZA | null | unverified | https://www.sensai-cosmetics.com (global brand; ZA distribution via selected department stores / salons) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Scalp & Hair" wording suggests this is positioned as a scalp treatment that is also applied to hair — preserve the dual scalp/hair positioning. |
| ZA-MASK-0026 | Hask | Hask Beyond Moisture Recovery Mask | Beyond Moisture Recovery | mask | 235 ml | ZA | null | unverified | https://www.haskhaircare.com (US brand; ZA distribution via selected retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Standard 235 ml SKU. |
| ZA-MASK-0027 | Olaplex | Olaplex N°3plus Complete Repair Treatment | N°3plus | bond_repair_treatment | 100 ml | ZA | null | unverified | https://olaplex.com (global brand; ZA distribution via authorised salons and selected retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R1199.99 captured at Dis-Chem. "N°3plus" is the Olaplex mask-format / treatment SKU — keep distinct from the leave-in N°8 (which is excluded from this batch). Confirm whether N°3plus is a global SKU or a ZA-specific repackaging. |
| ZA-MASK-0028 | Creme Of Nature | Creme Of Nature Argan Oil Intensive Conditioning Treatment | Argan Oil (Intensive Conditioning) | treatment | 51.75 ml | ZA | null | unverified | https://www.cremeofnature.com (US brand; ZA distribution via specialist retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Small 51.75 ml jar — possibly a single-use / sachet-style deep treatment. Verify intended use (pre-shampoo, rinse-off mask, or leave-on). |
| ZA-MASK-0029 | Two Oceans | Two Oceans Argan Oil Conditioning Mask | Argan Oil | mask | 500 ml | ZA | null | unverified | https://www.twooceans.co.za (ZA-origin brand) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R99.99 captured at Dis-Chem. ZA-origin brand; INCI and directions to be captured from the brand ZA site. |
| ZA-MASK-0030 | Mielle | Mielle Rose Mint Hair Masque | Rose Mint | mask | 12 oz (≈340 g) | ZA | null | unverified | https://mielleorganics.com (US brand; ZA distribution via specialist beauty stores and online) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R299.99 captured at Dis-Chem. Retailer wording "Masque" preserved. |
| ZA-MASK-0031 | Cantu | Cantu Deep Treatment Masque | Deep Treatment | mask | 340 g | ZA | null | unverified | https://cantubeauty.com (US brand; ZA distribution via specialist retailers) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R199.99 captured at Dis-Chem. Confirm ZA formulation matches global INCI. |
| ZA-MASK-0032 | Aunty Jackie | Aunty Jackie Flaxseed Fix My Hair Intense Repair Conditioning Masque | Flaxseed Fix My Hair (Intense Repair) | mask | 436 ml | ZA | null | unverified | https://auntyjackie.co.za (ZA-distributed line; manufacturer detail to be confirmed in the next pass) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R229.99 captured at Dis-Chem. "Intense Repair Conditioning Masque" wording combines conditioning + masque positioning — verify intended use with the manufacturer. |
| ZA-MASK-0033 | Biosense | Biosense Ultimate 12in1 Masque | Ultimate 12in1 | mask | 300 ml | ZA | null | unverified | https://www.biosense.co.za (ZA-origin / ZA-distributed brand) | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R300 captured at Dis-Chem. ZA-origin / ZA-distributed brand. "12in1" is a multi-benefit marketing descriptor — preserve as marketing. |
| ZA-MASK-0034 | Biosense | Biosense Ultimate 12in1 Masque (1 Litre) | Ultimate 12in1 | mask | 1 L | ZA | null | unverified | https://www.biosense.co.za | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | Price R680 captured at Dis-Chem. Same SKU as ZA-MASK-0033 in a 1 L salon / value size — kept as a separate row because the pack size is materially different and the per-millilitre pricing is distinct. |
| ZA-MASK-0035 | Biosense | Biosense Anti Aging Masque | Anti Aging | mask | 300 ml | ZA | null | unverified | https://www.biosense.co.za | confirmed ZA retailer (Dis-Chem) listing | unverified | unverified | unverified | none | insufficient_evidence | 2026-10-12 | "Anti Aging" is a marketing descriptor — no anti-aging efficacy claim should be inferred for a cosmetic hair-mask product. |

---

## OUTPUT 3 — SOURCE REGISTER

| sourceId | temporaryResearchId | title | publisher | sourceUrl | sourceType | preliminaryTrustTier | market | claimSupported | limitations | checkedAt | accessibilityStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRC-0001 | ZA-MASK-0001 through ZA-MASK-0035 | Dis-Chem South Africa — "hair mask" search results (Google Tag Manager `dischem_catalog_search_results_view` product catalogue JSON feed embedded in raw HTML) | Dis-Chem Pharmacies | https://www.dischem.co.za/catalogsearch/result/?q=hair+mask | retailer | T10 | ZA | Confirms that the 35 listed mask / treatment products are stocked (or were at the time of fetch) by Dis-Chem South Africa. Captured fields include brand, exact product name as listed, size/pack, and ZAR price where the JSON feed exposed it. | Retailer-only source. Not a primary source for formulation, directions, GTIN, or product classification. The ZAR price is a snapshot at fetch time and may not reflect current retail price. | 2026-10-12 | partially accessible (raw-HTML product catalogue JSON feed extractable; SPA-rendered product detail pages not extractable) |
| SRC-0002 | ZA-MASK-0001 | Pantene South Africa (P&G ZA) — Pantene home / product list | Procter & Gamble South Africa | https://www.pantene.co.za | manufacturer | T5 | ZA | Pantene distributes the Pro-V line in ZA; the specific "Bond Repair Intensive Hair Mask" SKU is at Dis-Chem (SRC-0001) but the ZA-specific product detail page was not extractable in this run. | ZA-specific ingredient list, directions, GTIN, ZA-formulation equivalence to global product page not captured. | 2026-10-12 | not accessible in this run (page returned; product detail JS-rendered and not in raw HTML) |
| SRC-0003 | ZA-MASK-0003, ZA-MASK-0022 | L'Oréal Paris South Africa — Elvive line home | L'Oréal South Africa | https://www.lorealparis.co.za | manufacturer | T5 | ZA | L'Oréal distributes the Elvive line in ZA; the Hyaluronic Hair Mask and the Extraordinary 300ml Oil Mask are at Dis-Chem (SRC-0001) but the ZA-specific product detail page was not extractable in this run. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0004 | ZA-MASK-0004, ZA-MASK-0005, ZA-MASK-0015 | Redken South Africa — brand home | L'Oréal (Redken brand site for ZA) | https://www.redken.co.za | manufacturer | T5 | ZA | Redken distributes the All Soft, Frizz Dismiss, and Acidic Bonding Concentrate lines in ZA. Product detail pages not extractable in this run. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0005 | ZA-MASK-0006 through ZA-MASK-0010 | L'Oréal Professionnel — global product pages | L'Oréal Professionnel | https://www.lorealprofessionnel.com/products/hair-care/* | manufacturer | T5 | global (ZA-specific site lorealprofessionnel.co.za not reachable in this run) | Identifies mask-format products in the Série Expert, Metal Detox, and Curl Expression families that L'Oréal Professionnel distributes globally. | ZA-specific ZA-formulation confirmation not captured; ZA prices captured from SRC-0001. | 2026-10-12 | not directly accessible in this run for the .co.za host; global pages accessible but ZA-distribution link not extractable |
| SRC-0006 | ZA-MASK-0002 | Mizani — global brand site | L'Oréal (Mizani brand) | https://www.mizani.com | manufacturer | T5 | global (ZA distribution via L'Oréal authorised salons and selected retailers) | Identifies Mizani as the L'Oréal-owned textured-hair brand with a Strength Fusion treatment family. | ZA-specific INCI, directions, GTIN not captured. ZA price (R480) captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0007 | ZA-MASK-0011, ZA-MASK-0012, ZA-MASK-0013 | Difeel — global brand site | Difeel | https://difeel.com | manufacturer | T5 | global (ZA distribution via selected retailers) | Identifies Difeel as the source of the Biotin, Rosemary Mint, and Caffeine And Castor mask variants. | ZA-specific INCI, directions, GTIN not captured. ZA prices (e.g. R189.99 for Biotin) captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0008 | ZA-MASK-0014 | Provoke Haircare South Africa — brand home | Provoke Haircare | https://provokehaircare.co.za | manufacturer | T5 | ZA | Identifies Provoke as a ZA-distributed haircare brand with a purple-toning hair mask SKU. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0009 | ZA-MASK-0016 | My Natural Hair — brand site | My Natural Hair | unverified | manufacturer | T5 | ZA | Brand is ZA-distributed via specialist retailers and stocked at Dis-Chem (SRC-0001). | No ZA manufacturer URL was located in this run; brand site is to be re-attempted in the next batch. | 2026-10-12 | not accessible in this run |
| SRC-0010 | ZA-MASK-0017 | Argan Oil Hydrating Hair Mask — retailer listing (generic / house-brand) | Dis-Chem (and other retailers) | https://www.dischem.co.za/catalogsearch/result/?q=argan+oil+mask | retailer | T10 | ZA | Identifies a 220 ml "Argan Oil Hydrating Hair Mask" SKU at R89.99. | Generic / house-brand product; the actual brand owner is not extractable from the Dis-Chem listing in this run. | 2026-10-12 | partially accessible |
| SRC-0011 | ZA-MASK-0018 | Curls In Bloom — ZA brand home | Curls In Bloom | https://www.curlsinbloom.co.za | manufacturer | T5 | ZA | Identifies Curls In Bloom as a ZA-origin / ZA-distributed curly-hair specialist brand. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0012 | ZA-MASK-0019 | Dark And Lovely South Africa — brand home | L'Oréal (SoftSheen-Carson / Dark and Lovely brand site for ZA) | https://www.darkandlovely.co.za | manufacturer | T5 | ZA | Identifies Dark And Lovely as a ZA-distributed textured-hair brand. The Pro-renew Rinse-off Mask is the rinse-off SKU. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0013 | ZA-MASK-0020 | Garnier South Africa — Hairfood / Ultimate Blends brand home | L'Oréal (Garnier brand site for Africa/ZA) | https://africa.garnier.com/en-za | manufacturer | T5 | ZA | Identifies the Ultimate Blends Hairfood 400ml Mask SKU as a Garnier ZA-distributed product. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0014 | ZA-MASK-0021 | Natur Vital South Africa — brand home | Natur Vital | https://www.naturvital.co.za | manufacturer | T5 | ZA | Identifies Natur Vital as a ZA-distributed haircare brand with a Coloursafe (Chestnut) mask variant. | ZA-specific INCI, directions, GTIN not captured. ZA price R119.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0015 | ZA-MASK-0023 | Nilotiqa — ZA brand home | Nilotiqa | https://www.nilotiqa.com | manufacturer | T5 | ZA | Identifies Nilotiqa as a ZA-origin / ZA-distributed natural-hair specialist brand. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0016 | ZA-MASK-0024 | Moroccanoil — global brand site | Moroccanoil | https://www.moroccanoil.com | manufacturer | T5 | global (ZA distribution via authorised salons and selected retailers) | Identifies Moroccanoil as the source of the Hydratink Mask SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R770 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0017 | ZA-MASK-0025 | Sensai Cosmetics — global brand site | Sensai | https://www.sensai-cosmetics.com | manufacturer | T5 | global (ZA distribution via selected department stores / salons) | Identifies Sensai as the source of the Enriching Mask For Scalp & Hair SKU. | ZA-specific INCI, directions, GTIN, ZA size not captured. | 2026-10-12 | not accessible in this run |
| SRC-0018 | ZA-MASK-0026 | Hask Haircare — global brand site | Hask | https://www.haskhaircare.com | manufacturer | T5 | global (ZA distribution via selected retailers) | Identifies Hask as the source of the Beyond Moisture Recovery Mask SKU. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0019 | ZA-MASK-0027 | Olaplex — global product page (N°3plus Complete Repair Treatment) | Olaplex, Inc. | https://olaplex.com | manufacturer | T5 | global/US (ZA distribution via authorised retailers) | Identifies Olaplex N°3plus as the mask-format / treatment SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R1199.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0020 | ZA-MASK-0028 | Creme Of Nature — global brand site | Creme Of Nature | https://www.cremeofnature.com | manufacturer | T5 | global (ZA distribution via specialist retailers) | Identifies Creme Of Nature as the source of the Argan Oil Intensive Conditioning Treatment SKU. | ZA-specific INCI, directions, GTIN not captured. | 2026-10-12 | not accessible in this run |
| SRC-0021 | ZA-MASK-0029 | Two Oceans — ZA brand home | Two Oceans | https://www.twooceans.co.za | manufacturer | T5 | ZA | Identifies Two Oceans as a ZA-origin brand with the Argan Oil Conditioning Mask SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R99.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0022 | ZA-MASK-0030 | Mielle Organics — global brand site | Mielle | https://mielleorganics.com | manufacturer | T5 | global (ZA distribution via specialist retailers) | Identifies Mielle as the source of the Rose Mint Hair Masque SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R299.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0023 | ZA-MASK-0031 | Cantu Beauty — global brand site | Cantu | https://cantubeauty.com | manufacturer | T5 | global (ZA distribution via specialist retailers) | Identifies Cantu as the source of the Deep Treatment Masque SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R199.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0024 | ZA-MASK-0032 | Aunty Jackie — ZA-distributed line | Aunty Jackie | https://auntyjackie.co.za | manufacturer | T5 | ZA | Identifies Aunty Jackie as the source of the Flaxseed Fix My Hair Intense Repair Conditioning Masque SKU. | ZA-specific INCI, directions, GTIN not captured. ZA price R229.99 captured at Dis-Chem. | 2026-10-12 | not accessible in this run |
| SRC-0025 | ZA-MASK-0033, ZA-MASK-0034, ZA-MASK-0035 | Biosense — ZA brand home | Biosense | https://www.biosense.co.za | manufacturer | T5 | ZA | Identifies Biosense as a ZA-origin / ZA-distributed brand with the Ultimate 12in1 Masque (300 ml and 1 L) and Anti Aging Masque SKUs. | ZA-specific INCI, directions, GTIN not captured. ZA prices (R300, R680) captured at Dis-Chem. | 2026-10-12 | not accessible in this run |

---

## OUTPUT 4 — CLAIM REGISTER

| claimId | temporaryResearchId | claimType | claimText | supportingSourceIds | contradictingSourceIds | exactVersionApplicability | marketApplicability | confidence | limitations |
|---|---|---|---|---|---|---|---|---|---|
| CLM-0001 | ZA-MASK-0001 | identity | Pantene Pro-V Bond Repair Intensive Hair Mask is sold in South Africa at Dis-Chem. | SRC-0001, SRC-0002 | — | Pantene Pro-V Bond Repair Intensive Hair Mask | ZA | partial | Dis-Chem retailer listing confirms ZA stock; manufacturer ZA INCI and directions not captured. |
| CLM-0002 | ZA-MASK-0002 | identity | Mizani Strength Fusion Intense Night Hair Treatment 150 ml is sold in ZA at Dis-Chem at R480. | SRC-0001, SRC-0006 | — | Mizani Strength Fusion Intense Night Hair Treatment 150 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer intended-use (rinse-off vs. leave-on) not captured. |
| CLM-0003 | ZA-MASK-0003 | identity | L'Oréal Elvive Hyaluronic Hair Mask 300 ml is sold in ZA at Dis-Chem at R154.99. | SRC-0001, SRC-0003 | — | Elvive Hyaluronic Hair Mask 300 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer ZA INCI not captured. |
| CLM-0004 | ZA-MASK-0004 | identity | Redken All Soft Heavy Cream Hair Mask 250 ml is sold in ZA at Dis-Chem at R840. | SRC-0001, SRC-0004 | — | Redken All Soft Heavy Cream Hair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0005 | ZA-MASK-0005 | identity | Redken Frizz Dismiss Hair Mask 250 ml is sold in ZA at Dis-Chem at R840. | SRC-0001, SRC-0004 | — | Redken Frizz Dismiss Hair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0006 | ZA-MASK-0006 | identity | L'Oréal Professionnel Vitamino Color Colour Care Mask 250 ml is sold in ZA at Dis-Chem at R540. | SRC-0001, SRC-0005 | — | Vitamino Color Colour Care Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0007 | ZA-MASK-0007 | identity | L'Oréal Professionnel Absolut Repair Resurfacing Golden Mask is sold in ZA at Dis-Chem at R540. | SRC-0001, SRC-0005 | — | Absolut Repair Resurfacing Golden Mask (250 ml size class) | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured; SKU-distinction vs. ZA-MASK-0010 unresolved. |
| CLM-0008 | ZA-MASK-0008 | identity | L'Oréal Professionnel Metal Detox Hair Mask 250 ml is sold in ZA at Dis-Chem at R650. | SRC-0001, SRC-0005 | — | Metal Detox Hair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0009 | ZA-MASK-0009 | identity | L'Oréal Professionnel Curl Expression Butter Masque 250 ml is sold in ZA at Dis-Chem at R570. | SRC-0001, SRC-0005 | — | Curl Expression Butter Masque 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0010 | ZA-MASK-0010 | identity | L'Oréal Professionnel Série Expert Absolut Repair Instant Resurfacing Mask is sold in ZA at Dis-Chem at R550. | SRC-0001, SRC-0005 | — | Série Expert Absolut Repair Instant Resurfacing Mask (250 ml size class) | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured; SKU-distinction vs. ZA-MASK-0007 unresolved. |
| CLM-0011 | ZA-MASK-0011 | identity | Difeel Hair Mask Biotin 340 g is sold in ZA at Dis-Chem at R189.99. | SRC-0001, SRC-0007 | — | Difeel Hair Mask Biotin 340 g | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0012 | ZA-MASK-0012 | identity | Difeel Rosemary Mint Strengthening Hair Mask 340 g is sold in ZA at Dis-Chem. | SRC-0001, SRC-0007 | — | Difeel Rosemary Mint Strengthening Hair Mask 340 g | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0013 | ZA-MASK-0013 | identity | Difeel Caffeine And Castor Hair Mask 340 g is sold in ZA at Dis-Chem. | SRC-0001, SRC-0007 | — | Difeel Caffeine And Castor Hair Mask 340 g | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0014 | ZA-MASK-0014 | identity | Provoke Hydrating Purple Toning Hair Mask 300 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0008 | — | Provoke Hydrating Purple Toning Hair Mask 300 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0015 | ZA-MASK-0015 | identity | Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask 250 ml is sold in ZA at Dis-Chem at R880. | SRC-0001, SRC-0004 | — | Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured; "Liquid Hair Mask" intended-use classification not captured. |
| CLM-0016 | ZA-MASK-0016 | identity | My Natural Hair Hydrating Mask 70 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0009 | — | My Natural Hair Hydrating Mask 70 ml | ZA | partial | Retailer listing confirms ZA stock; brand site URL not located in this run; manufacturer INCI not captured. |
| CLM-0017 | ZA-MASK-0017 | identity | Argan Oil Hydrating Hair Mask 220 ml is sold in ZA at Dis-Chem at R89.99. | SRC-0001, SRC-0010 | — | Argan Oil Hydrating Hair Mask 220 ml | ZA | partial | Retailer listing confirms ZA stock; this appears to be a generic / house-brand listing and the actual brand owner is not extractable from the Dis-Chem listing. |
| CLM-0018 | ZA-MASK-0018 | identity | Curls In Bloom Hydrate Me Hair Repair Mask 250 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0011 | — | Curls In Bloom Hydrate Me Hair Repair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0019 | ZA-MASK-0019 | identity | Dark And Lovely Pro-renew Replenishing Rinse-off Mask 250 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0012 | — | Dark And Lovely Pro-renew Replenishing Rinse-off Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer ZA INCI not captured. |
| CLM-0020 | ZA-MASK-0020 | identity | Garnier Ultimate Blends Hairfood 400ml Mask is sold in ZA at Dis-Chem. | SRC-0001, SRC-0013 | — | Garnier Ultimate Blends Hairfood 400ml Mask | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer ZA INCI not captured. |
| CLM-0021 | ZA-MASK-0021 | identity | Natur Vital Mask 300ml Coloursafe (Chestnut variant) is sold in ZA at Dis-Chem at R119.99. | SRC-0001, SRC-0014 | — | Natur Vital Mask 300ml Coloursafe (Chestnut) | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0022 | ZA-MASK-0022 | identity | L'Oréal Elvive Extraordinary 300ml Oil Mask is sold in ZA at Dis-Chem. | SRC-0001, SRC-0003 | — | Elvive Extraordinary 300ml Oil Mask | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer ZA INCI not captured. |
| CLM-0023 | ZA-MASK-0023 | identity | Nilotiqa Deep Repair Mask 250 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0015 | — | Nilotiqa Deep Repair Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0024 | ZA-MASK-0024 | identity | Moroccanoil Hydratink Mask 250 ml is sold in ZA at Dis-Chem at R770. | SRC-0001, SRC-0016 | — | Moroccanoil Hydratink Mask 250 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0025 | ZA-MASK-0025 | identity | Sensai Enriching Mask For Scalp & Hair is sold in ZA at Dis-Chem. | SRC-0001, SRC-0017 | — | Sensai Enriching Mask For Scalp & Hair (size unverified) | ZA | partial | Retailer listing confirms ZA stock; size not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0026 | ZA-MASK-0026 | identity | Hask Beyond Moisture Recovery Mask 235 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0018 | — | Hask Beyond Moisture Recovery Mask 235 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0027 | ZA-MASK-0027 | identity | Olaplex N°3plus Complete Repair Treatment 100 ml is sold in ZA at Dis-Chem at R1199.99. | SRC-0001, SRC-0019 | — | Olaplex N°3plus Complete Repair Treatment 100 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0028 | ZA-MASK-0028 | identity | Creme Of Nature Argan Oil Intensive Conditioning Treatment 51.75 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0020 | — | Creme Of Nature Argan Oil Intensive Conditioning Treatment 51.75 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0029 | ZA-MASK-0029 | identity | Two Oceans Argan Oil Conditioning Mask 500 ml is sold in ZA at Dis-Chem at R99.99. | SRC-0001, SRC-0021 | — | Two Oceans Argan Oil Conditioning Mask 500 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0030 | ZA-MASK-0030 | identity | Mielle Rose Mint Hair Masque 12 oz (≈340 g) is sold in ZA at Dis-Chem at R299.99. | SRC-0001, SRC-0022 | — | Mielle Rose Mint Hair Masque 12 oz | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0031 | ZA-MASK-0031 | identity | Cantu Deep Treatment Masque 340 g is sold in ZA at Dis-Chem at R199.99. | SRC-0001, SRC-0023 | — | Cantu Deep Treatment Masque 340 g | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0032 | ZA-MASK-0032 | identity | Aunty Jackie Flaxseed Fix My Hair Intense Repair Conditioning Masque 436 ml is sold in ZA at Dis-Chem at R229.99. | SRC-0001, SRC-0024 | — | Aunty Jackie Flaxseed Fix My Hair Intense Repair Conditioning Masque 436 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0033 | ZA-MASK-0033 | identity | Biosense Ultimate 12in1 Masque 300 ml is sold in ZA at Dis-Chem at R300. | SRC-0001, SRC-0025 | — | Biosense Ultimate 12in1 Masque 300 ml | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. |
| CLM-0034 | ZA-MASK-0034 | identity | Biosense Ultimate 12in1 Masque (1 Litre) is sold in ZA at Dis-Chem at R680. | SRC-0001, SRC-0025 | — | Biosense Ultimate 12in1 Masque 1 L | ZA | partial | Retailer listing confirms ZA stock; manufacturer INCI not captured. Kept as a separate row from ZA-MASK-0033 because the pack size is materially different. |
| CLM-0035 | ZA-MASK-0035 | identity | Biosense Anti Aging Masque 300 ml is sold in ZA at Dis-Chem. | SRC-0001, SRC-0025 | — | Biosense Anti Aging Masque 300 ml | ZA | partial | Retailer listing confirms ZA stock; ZAR price not extractable from the GTM feed for this SKU; manufacturer INCI not captured. |
| CLM-0036 | ZA-MASK-0001 through ZA-MASK-0035 | capability | None of the products in this batch can be assigned a StrandCue `cleanse` or `condition` capability because the StrandCue v1 capability vocabulary is closed at `cleanse` and `condition` only and "mask / treatment" is outside that vocabulary. | — | — | every row | ZA | confirmed (by design) | This is the protocol-mandated capability lock for the masks batch: `proposedCapability: none`, `capabilityDecision: insufficient_evidence`, with the user-prescribed rationale and limitations string inserted verbatim. |

---

## OUTPUT 5 — REFORMULATION AND CONFLICT REPORT

- **Products with multiple ingredient lists:** None in this batch. The Dis-Chem retailer listing does not expose INCI; the manufacturer `.za` pages were not reachable; therefore no two ingredient lists could be compared. This is recorded as a gap, not a conflict.
- **Products with packaging or name changes:** None captured in this batch. L'Oréal Professionnel frequently renames "Masque" to "Mask" between markets; the Dis-Chem listing uses "Mask" wording. Olaplex's N°3plus title has also historically been described as both "Hair Perfector N°3" and "N°3plus" between markets. Neither is recorded as a confirmed conflict — both are flagged for human SKU-distinction review.
- **Products that may have been reformulated:** No product in this batch has a confirmed reformulation.
- **Products found in South Africa whose official source describes another market:**
  - ZA-MASK-0001 (Pantene Pro-V Bond Repair Intensive Hair Mask): cited source is P&G ZA Pantene home; product detail not extractable.
  - ZA-MASK-0003, ZA-MASK-0022 (L'Oréal Elvive Hyaluronic and Extraordinary Oil): cited source is lorealparis.co.za; product detail not extractable.
  - ZA-MASK-0004, ZA-MASK-0005, ZA-MASK-0015 (Redken All Soft, Frizz Dismiss, Acidic Bonding Concentrate): cited source is redken.co.za; product detail not extractable.
  - ZA-MASK-0006 through ZA-MASK-0010 (L'Oréal Professionnel): cited sources are global pages; lorealprofessionnel.co.za not reachable.
  - ZA-MASK-0007 vs. ZA-MASK-0010 (both L'Oréal Professionnel Absolut Repair): flagged as a possible duplicate-SKU issue — "Resurfacing Golden Mask" vs. "Instant Resurfacing Mask" may be the same product under two regional names. Held as separate rows pending human SKU-distinction verification.
  - ZA-MASK-0027 (Olaplex N°3plus): cited source is olaplex.com global; ZA-specific ZA-formulation not confirmed.
- **Products with conflicting directions:** None captured.
- **Duplicate-looking products that must remain separate:**
  - ZA-MASK-0007 (L'Oréal Professionnel Absolut Repair Resurfacing Golden Mask 250 ml) and ZA-MASK-0010 (L'Oréal Professionnel Série Expert Absolut Repair Instant Resurfacing Mask 250 ml) are kept separate pending human verification of the SKU distinction. They may be the same product under two regional names; they may also be two distinct SKUs in the Absolut Repair family.
  - ZA-MASK-0033 (Biosense Ultimate 12in1 Masque 300 ml) and ZA-MASK-0034 (Biosense Ultimate 12in1 Masque 1 L) are kept separate as different pack sizes of the same SKU — this is a legitimate size-class distinction, not a duplicate.
- **Products that should be excluded until identity is clarified:**
  - ZA-MASK-0002 (Mizani Strength Fusion Intense Night Hair Treatment 150 ml): included with a flag because the product is sold at Dis-Chem and titled "Treatment", but the "Night" wording suggests an overnight leave-on / leave-in rather than a rinse-off mask. The human reviewer should confirm the intended use on the physical pack before this is left in the masks batch.
  - L'Oréal Professionnel Absolut Repair Molecular Leave-in Hair Mask 100 ml: explicitly EXCLUDED from the Product Table because the literal manufacturer product name includes "Leave-in". Listed here for the next batch (leave-in batch).
  - Joico K-Pak Color Therapy Luster L 150 ml: explicitly EXCLUDED from the Product Table because it is a leave-in / finishing product, not a rinse-off mask. Listed in the Continuation list for the leave-in batch.
  - Cantu Intense Repair Deep Treatment Packet 50 g: borderline; not lifted in this run.
  - Creme Of Nature Argan Oil Intensive Conditioning Treatment 51.75 ml (ZA-MASK-0028): included with a flag because the "Conditioning Treatment" wording could place this product in a deep conditioner or pre-shampoo category instead of a mask. Manufacturer intended-use to be confirmed.
- **Failed-source candidates (not in the table, but investigated this run):**
  - Schwarzkopf Professional BC Bonacure / Bonacure Hair Therapy masques (Repair Rescue, Color Freeze, Moisture Kick, Volume Boost, Time Restore, Fibre Force) — not at Dis-Chem under "hair mask" or "joico masque" searches. Recorded for the Continuation list.
  - Schwarzkopf Professional Gliss Kur / Gliss Oil Elixir / Schauma masks — not at Dis-Chem under "hair mask" search. Recorded for the Continuation list.
  - Wella Professionals masques (Fusion, Oil Reflections, Ultimate Repair, Nutricurls) — not surfaced at Dis-Chem in this run. Recorded for the Continuation list.
  - Wella Professionals Invigo masks — not surfaced at Dis-Chem. Recorded for the Continuation list.
  - Kérastase masques (Nutritive, Genesis, Discipline, Reflection, Chroma Absolu, Resistance, Densifique, Nutritive / Masquintense, Specifique) — not surfaced at Dis-Chem. Recorded for the Continuation list.
  - Pureology masques — not at Dis-Chem. Recorded for the Continuation list.
  - Davines masques (Alchemic, Momo, Nounou, OI, Dede, Love, Minu, Melu) — not at Dis-Chem. Recorded for the Continuation list.
  - Goldwell Dualsenses / Kerasilk / Elumenated masques — not at Dis-Chem. Recorded for the Continuation list.
  - Matrix Biolage / Total Results masques — not at Dis-Chem. Recorded for the Continuation list.
  - Olaplex N°0, N°4, N°7, N°8 — left out of this batch by intent (N°0 is a pre-shampoo treatment but not the user's "mask" wording; N°4 is a shampoo; N°7 is a leave-in bond-repair oil; N°8 is the leave-in bond-repair mask). Recorded for the next batches (pre-shampoo, shampoo, leave-in respectively). The mask-format Olaplex SKU in ZA is N°3plus and is recorded as ZA-MASK-0027.
  - Avlon (KeraCare, Affirm, Fiberguard) masques — not at Dis-Chem. Recorded for the Continuation list.
  - Mizani masques (True Textures, Moisture Fusion, Miracle Create, Supreme Oil) — not at Dis-Chem except for the Strength Fusion Night Treatment (ZA-MASK-0002). Recorded for the Continuation list.
  - ZA-origin brands SoulTribe, Afritude, Good Stuff, Innersense, Afri'Rich, Kreyòl Essence, Organics — not at Dis-Chem. Recorded for the Continuation list.
  - Shea Moisture masques (Manuka Honey & Mafura Oil Intensive Hydration Hair Masque, Coconut & Hibiscus Curl & Shine Hair Masque, Jamaican Black Castor Oil Strengthen & Restore Treatment Masque, Manuka Honey & Yogurt Hydrate + Repair Protein Power Treatment, etc.) — not at Dis-Chem. Recorded for the Continuation list.

---

## OUTPUT 6 — STRANDCUE IMPORT CANDIDATES

```json
[
  {
    "temporaryResearchId": "ZA-MASK-0001",
    "kind": "product",
    "brand": "Pantene (Pro-V)",
    "productName": "Pantene Pro-V Bond Repair Intensive Hair Mask",
    "variant": "Bond Repair (Pro-V)",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.pantene.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; P&G ZA Pantene home (SRC-0002) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0002",
    "kind": "product",
    "brand": "Mizani",
    "productName": "Mizani Strength Fusion Intense Night Hair Treatment",
    "variant": "Strength Fusion",
    "sizeOrPack": "150 ml",
    "market": "ZA",
    "gtin": null,
    "category": "treatment",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.mizani.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R480 confirms ZA stock. 'Night' wording in the title suggests an overnight leave-on rather than a rinse-off mask — borderline entry held with a flag for human verification.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. Intended use (rinse-off vs. leave-on) not captured. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0003",
    "kind": "product",
    "brand": "L'Oréal Paris (Elvive)",
    "productName": "Elvive Hyaluronic Hair Mask",
    "variant": "Hyaluronic (Elvive)",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealparis.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R154.99 confirms ZA stock; L'Oréal ZA home (SRC-0003) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0004",
    "kind": "product",
    "brand": "Redken",
    "productName": "Redken All Soft Heavy Cream Hair Mask",
    "variant": "All Soft (Heavy Cream)",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.redken.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R840 confirms ZA stock; Redken ZA home (SRC-0004) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0005",
    "kind": "product",
    "brand": "Redken",
    "productName": "Redken Frizz Dismiss Hair Mask",
    "variant": "Frizz Dismiss",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.redken.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R840 confirms ZA stock; Redken ZA home (SRC-0004) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0006",
    "kind": "product",
    "brand": "L'Oréal Professionnel (Série Expert)",
    "productName": "L'Oréal Professionnel Vitamino Color Colour Care Mask",
    "variant": "Vitamino Color",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealprofessionnel.com/products/hair-care/vitamino-color/mask",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R540 confirms ZA stock; L'Oréal Professionnel global (SRC-0005) is the manufacturer anchor but lorealprofessionnel.co.za was not reachable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0007",
    "kind": "product",
    "brand": "L'Oréal Professionnel (Série Expert)",
    "productName": "L'Oréal Professionnel Absolut Repair Resurfacing Golden Mask",
    "variant": "Absolut Repair (Golden)",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealprofessionnel.com/products/hair-care/absolut-repair/golden-mask",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R540 confirms ZA stock; L'Oréal Professionnel global (SRC-0005) is the manufacturer anchor. Possible duplicate SKU vs. ZA-MASK-0010 (Instant Resurfacing Mask) — kept separate pending human verification.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0008",
    "kind": "product",
    "brand": "L'Oréal Professionnel (Metal Detox)",
    "productName": "L'Oréal Professionnel Metal Detox Hair Mask",
    "variant": "Metal Detox",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealprofessionnel.com/products/hair-care/metal-detox/mask",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R650 confirms ZA stock; L'Oréal Professionnel global (SRC-0005) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0009",
    "kind": "product",
    "brand": "L'Oréal Professionnel (Curl Expression)",
    "productName": "L'Oréal Professionnel Curl Expression Butter Masque",
    "variant": "Curl Expression",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealprofessionnel.com/products/hair-care/curl-expression/butter-masque",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R570 confirms ZA stock; L'Oréal Professionnel global (SRC-0005) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0010",
    "kind": "product",
    "brand": "L'Oréal Professionnel (Série Expert)",
    "productName": "L'Oréal Professionnel Série Expert Absolut Repair Instant Resurfacing Mask",
    "variant": "Absolut Repair (Instant Resurfacing)",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealprofessionnel.com/products/hair-care/absolut-repair/instant-resurfacing-mask",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R550 confirms ZA stock; L'Oréal Professionnel global (SRC-0005) is the manufacturer anchor. Possible duplicate SKU vs. ZA-MASK-0007 (Resurfacing Golden Mask) — kept separate pending human verification.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0011",
    "kind": "product",
    "brand": "Difeel",
    "productName": "Difeel Hair Mask Biotin",
    "variant": "Biotin",
    "sizeOrPack": "340 g",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://difeel.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R189.99 confirms ZA stock; Difeel global (SRC-0007) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0012",
    "kind": "product",
    "brand": "Difeel",
    "productName": "Difeel Rosemary Mint Strengthening Hair Mask",
    "variant": "Rosemary Mint (Strengthening)",
    "sizeOrPack": "340 g",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://difeel.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Difeel global (SRC-0007) is the manufacturer anchor. ZAR price not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0013",
    "kind": "product",
    "brand": "Difeel",
    "productName": "Difeel Caffeine And Castor Hair Mask",
    "variant": "Caffeine And Castor",
    "sizeOrPack": "340 g",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://difeel.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Difeel global (SRC-0007) is the manufacturer anchor. ZAR price not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0014",
    "kind": "product",
    "brand": "Provoke",
    "productName": "Provoke Hydrating Purple Toning Hair Mask",
    "variant": "Hydrating Purple Toning",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://provokehaircare.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Provoke ZA brand home (SRC-0008) is the manufacturer anchor but product detail was not extractable in this run. ZAR price not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0015",
    "kind": "product",
    "brand": "Redken (Acidic Bonding Concentrate)",
    "productName": "Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask",
    "variant": "Acidic Bonding Concentrate (5-minute Liquid)",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "bond_repair_treatment",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.redken.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R880 confirms ZA stock; Redken ZA home (SRC-0004) is the manufacturer anchor. '5-minute' processing time and 'Liquid' format are distinctive features preserved here.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0016",
    "kind": "product",
    "brand": "My Natural Hair",
    "productName": "My Natural Hair Hydrating Mask",
    "variant": "Hydrating",
    "sizeOrPack": "70 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "unverified",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock. Brand manufacturer URL not located in this run — flagged for the next batch.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0009"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. Brand manufacturer URL not located; ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0017",
    "kind": "product",
    "brand": "Argan Oil (generic / house brand)",
    "productName": "Argan Oil Hydrating Hair Mask",
    "variant": "Argan Oil (Generic)",
    "sizeOrPack": "220 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "unverified",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R89.99 confirms ZA stock. The literal descriptor on the Dis-Chem listing is 'Argan Oil' — this appears to be a generic / house-brand product and the actual brand owner is not extractable from the listing.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0010"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. Brand owner / manufacturer URL not located; ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0018",
    "kind": "product",
    "brand": "Curls In Bloom",
    "productName": "Curls In Bloom Hydrate Me Hair Repair Mask",
    "variant": "Hydrate Me",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.curlsinbloom.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Curls In Bloom ZA brand home (SRC-0011) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0011"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0019",
    "kind": "product",
    "brand": "Dark And Lovely (SoftSheen-Carson / L'Oréal)",
    "productName": "Dark And Lovely Pro-renew Replenishing Rinse-off Mask",
    "variant": "Pro-renew (Rinse-off)",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.darkandlovely.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Dark And Lovely ZA home (SRC-0012) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0012"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0020",
    "kind": "product",
    "brand": "Garnier (Ultimate Blends)",
    "productName": "Garnier Ultimate Blends Hairfood 400ml Mask",
    "variant": "Ultimate Blends (Hairfood)",
    "sizeOrPack": "400 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://africa.garnier.com/en-za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Garnier ZA home (SRC-0013) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0013"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0021",
    "kind": "product",
    "brand": "Natur Vital",
    "productName": "Natur Vital Mask 300ml Coloursafe (Chestnut variant)",
    "variant": "Coloursafe (Chestnut)",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.naturvital.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R119.99 confirms ZA stock; Natur Vital ZA home (SRC-0014) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0014"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0022",
    "kind": "product",
    "brand": "L'Oréal Paris (Elvive)",
    "productName": "Elvive Extraordinary 300ml Oil Mask",
    "variant": "Extraordinary Oil",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.lorealparis.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; L'Oréal ZA home (SRC-0003) is the manufacturer anchor. 'Oil Mask' positioning may place this as a pre-shampoo treatment rather than a rinse-off mask — manufacturer classification required.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0023",
    "kind": "product",
    "brand": "Nilotiqa",
    "productName": "Nilotiqa Deep Repair Mask",
    "variant": "Deep Repair",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.nilotiqa.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Nilotiqa ZA brand home (SRC-0015) is the manufacturer anchor but product detail was not extractable in this run. ZAR price not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0015"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0024",
    "kind": "product",
    "brand": "Moroccanoil",
    "productName": "Moroccanoil Hydratink Mask",
    "variant": "Hydratink",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.moroccanoil.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R770 confirms ZA stock; Moroccanoil global (SRC-0016) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0016"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0025",
    "kind": "product",
    "brand": "Sensai",
    "productName": "Sensai Enriching Mask For Scalp & Hair",
    "variant": "Enriching (Scalp & Hair)",
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.sensai-cosmetics.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Sensai global (SRC-0017) is the manufacturer anchor. Size not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0017"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0026",
    "kind": "product",
    "brand": "Hask",
    "productName": "Hask Beyond Moisture Recovery Mask",
    "variant": "Beyond Moisture Recovery",
    "sizeOrPack": "235 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.haskhaircare.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Hask global (SRC-0018) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0018"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0027",
    "kind": "product",
    "brand": "Olaplex",
    "productName": "Olaplex N°3plus Complete Repair Treatment",
    "variant": "N°3plus",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "bond_repair_treatment",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://olaplex.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R1199.99 confirms ZA stock; Olaplex global (SRC-0019) is the manufacturer anchor. N°3plus is the mask-format / treatment SKU — keep distinct from the leave-in N°8.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0019"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0028",
    "kind": "product",
    "brand": "Creme Of Nature",
    "productName": "Creme Of Nature Argan Oil Intensive Conditioning Treatment",
    "variant": "Argan Oil (Intensive Conditioning)",
    "sizeOrPack": "51.75 ml",
    "market": "ZA",
    "gtin": null,
    "category": "treatment",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.cremeofnature.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Creme Of Nature global (SRC-0020) is the manufacturer anchor. ZAR price not extractable from the GTM feed for this SKU in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0020"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0029",
    "kind": "product",
    "brand": "Two Oceans",
    "productName": "Two Oceans Argan Oil Conditioning Mask",
    "variant": "Argan Oil",
    "sizeOrPack": "500 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.twooceans.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R99.99 confirms ZA stock; Two Oceans ZA home (SRC-0021) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0021"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0030",
    "kind": "product",
    "brand": "Mielle",
    "productName": "Mielle Rose Mint Hair Masque",
    "variant": "Rose Mint",
    "sizeOrPack": "12 oz",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://mielleorganics.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R299.99 confirms ZA stock; Mielle global (SRC-0022) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0022"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0031",
    "kind": "product",
    "brand": "Cantu",
    "productName": "Cantu Deep Treatment Masque",
    "variant": "Deep Treatment",
    "sizeOrPack": "340 g",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://cantubeauty.com",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R199.99 confirms ZA stock; Cantu global (SRC-0023) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0023"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0032",
    "kind": "product",
    "brand": "Aunty Jackie",
    "productName": "Aunty Jackie Flaxseed Fix My Hair Intense Repair Conditioning Masque",
    "variant": "Flaxseed Fix My Hair (Intense Repair)",
    "sizeOrPack": "436 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://auntyjackie.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R229.99 confirms ZA stock; Aunty Jackie ZA-distributed line (SRC-0024) is the manufacturer anchor but product detail was not extractable in this run.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0024"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0033",
    "kind": "product",
    "brand": "Biosense",
    "productName": "Biosense Ultimate 12in1 Masque",
    "variant": "Ultimate 12in1",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.biosense.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R300 confirms ZA stock; Biosense ZA home (SRC-0025) is the manufacturer anchor.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0025"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0034",
    "kind": "product",
    "brand": "Biosense",
    "productName": "Biosense Ultimate 12in1 Masque (1 Litre)",
    "variant": "Ultimate 12in1",
    "sizeOrPack": "1 L",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.biosense.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) at R680 confirms ZA stock; Biosense ZA home (SRC-0025) is the manufacturer anchor. Same SKU as ZA-MASK-0033 in a 1 L salon / value size — kept as a separate row because the pack size is materially different and the per-millilitre pricing is distinct.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0025"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-MASK-0035",
    "kind": "product",
    "brand": "Biosense",
    "productName": "Biosense Anti Aging Masque",
    "variant": "Anti Aging",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "mask",
    "lifecycle": "unverified",
    "manufacturerUrl": "https://www.biosense.co.za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem ZA retailer listing (SRC-0001) confirms ZA stock; Biosense ZA home (SRC-0025) is the manufacturer anchor. ZAR price not extractable from the GTM feed for this SKU in this run. 'Anti Aging' is a marketing descriptor — no anti-aging efficacy claim should be inferred for a cosmetic hair-mask product.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0025"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Mask / treatment category sits outside StrandCue v1's closed `cleanse` / `condition` vocabulary. Capability therefore cannot be assigned from the closed vocabulary, and the row stays as `none` with `insufficient_evidence` per the masks-batch protocol exception.",
        "limitations": "No manufacturer direction text was captured for this SKU in this run. ZA-specific INCI, GTIN, and directions remain unverified. No capability can be inferred from category, name, or retailer description."
      }
    ]
  }
]
```

---

## OUTPUT 7 — HUMAN FOLLOW-UP LIST

The following items need a human to verify on physical packaging, a rendered product page, or an authoritative ZA source that the worker could not reach in this run. These should be prioritised by the next batch.

- **Missing barcodes / GTINs:** every product in this batch has `gtin: null` because no product page fetched in this run exposed a GTIN. The next batch should attempt to capture GTINs from (a) front-of-pack images on product pages; (b) ZA retailer product detail pages (Clicks, Takealot, Woolworths via headless-browser pass); (c) the manufacturer's hosted back-label image.
- **Unreadable formulation or batch references:** every product in this batch. No manufacturer `.za` page returned content; no INCI was captured.
- **Missing back-label directions:** every product in this batch. No manufacturer direction text was captured.
- **Missing warnings:** every product in this batch.
- **Conflicting ingredient lists:** none captured. The next batch should specifically check Olaplex N°3plus and the Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask against their global product pages to test the "same formulation" assumption before treating them as a single ZA formulation candidate.
- **Products requiring front/back photographs:** every product in this batch. The 35 products represent the highest-priority pack-photo candidates for the human reviewer (Alain) during a Dis-Chem / salon-wholesaler visit.
- **Products whose South African formulation remains uncertain:**
  - ZA-MASK-0002 (Mizani Strength Fusion Intense Night Hair Treatment 150 ml): the "Night" wording suggests an overnight leave-on, not a rinse-off mask. The next batch must re-confirm intended use from the physical pack.
  - ZA-MASK-0007 (L'Oréal Professionnel Absolut Repair Resurfacing Golden Mask) vs. ZA-MASK-0010 (L'Oréal Professionnel Série Expert Absolut Repair Instant Resurfacing Mask): possible SKU overlap. The next batch must re-attempt the L'Oréal Professionnel ZA site to confirm whether these are two distinct SKUs.
  - ZA-MASK-0015 (Redken Acidic Bonding Concentrate 5-minute Liquid Hair Mask 250 ml): the "Liquid Hair Mask" wording is unusual and the next batch must confirm the manufacturer's official classification (mask vs. treatment vs. pre-shampoo).
  - ZA-MASK-0016 (My Natural Hair Hydrating Mask 70 ml) and ZA-MASK-0017 (Argan Oil Hydrating Hair Mask 220 ml): the manufacturer brand-owner URL is not located; the next batch must locate it.
  - ZA-MASK-0022 (Elvive Extraordinary 300ml Oil Mask): the "Oil Mask" positioning may place this as a pre-shampoo treatment rather than a rinse-off mask. The next batch must re-classify against the L'Oréal Paris ZA page.
  - ZA-MASK-0028 (Creme Of Nature Argan Oil Intensive Conditioning Treatment 51.75 ml): the "Conditioning Treatment" wording is ambiguous. The next batch must confirm the manufacturer's classification.
- **ZAR price not extractable from the GTM feed for several SKUs in this run:** ZA-MASK-0012, ZA-MASK-0013, ZA-MASK-0014, ZA-MASK-0016, ZA-MASK-0018, ZA-MASK-0019, ZA-MASK-0020, ZA-MASK-0022, ZA-MASK-0023, ZA-MASK-0025, ZA-MASK-0028, ZA-MASK-0035. The next batch should record prices from the Dis-Chem product detail page (when accessible via headless-browser pass) or from the live site directly.

---

## Continuation list for next batch

The following brands/variants are commonly stocked in the South African market but were not lifted into the Product Table in this run because the worker could not reach a ZA-specific source page in the available fetching environment, because the ZA manufacturer page did not expose the "mask" / "treatment" wording under the Dis-Chem search queries, or because the product sits outside Dis-Chem's online catalogue. They are recorded here so the next batch can pick them up; the next batch should attempt the ZA manufacturer pages first, then the ZA retailers (Clicks, Dis-Chem, Takealot, Foschini Beauty, Edgars Beauty, Wellness Warehouse, Hairworx, Salon Warehouse, Mankind), then authorised ZA distributors, then ZA-origin brand direct outreach.

- **ZA-origin / ZA-distributed brand masque lines not surfaced at Dis-Chem:**
  - SoulTribe (any masque SKU)
  - Afritude (any masque SKU)
  - Good Stuff (any masque SKU)
  - Afri'Rich (any masque SKU)
  - Kreyòl Essence (any masque SKU)
  - Organics by Nature (or "Organics" house brand masque SKU)
  - Reflections Cosmetics (additional masque variants beyond the silver-only SKU lifted as ZA-MASK-0040 in this run's raw search)
  - Innersense (ZA distribution via specialist salons; INCI organic / clean-beauty positioning)
  - Shea Moisture Manuka Honey & Mafura Oil Intensive Hydration Hair Masque
  - Shea Moisture Coconut & Hibiscus Curl & Shine Hair Masque
  - Shea Moisture Jamaican Black Castor Oil Strengthen & Restore Treatment Masque
  - Shea Moisture Manuka Honey & Yogurt Hydrate + Repair Protein Power Treatment
  - Shea Moisture Raw Shea Butter Deep Treatment Masque
  - Shea Moisture Olive & Marula Oils Strengthening Hair Masque
  - Shea Moisture Baobab & Tea Tree Oils Low-Porosity Hair Masque

- **Salon-only / professional masques not at Dis-Chem:**
  - Kérastase Nutritive Masquintense
  - Kérastase Genesis Masque
  - Kérastase Discipline Maskératine
  - Kérastase Reflection Chroma Captur Masque
  - Kérastase Chroma Absolu Masque
  - Kérastase Resistance Masque
  - Kérastase Densifique Masque
  - Kérastase Specifique Masque
  - Kérastase Nutritive Bain Satin Masque (verify vs. conditioner variant ZA-CONDITIONER-0026 in the conditioner batch)
  - Schwarzkopf Professional BC Bonacure Fibre Force Masque
  - Schwarzkopf Professional BC Bonacure Repair Rescue Masque
  - Schwarzkopf Professional BC Bonacure Color Freeze Masque
  - Schwarzkopf Professional BC Bonacure Moisture Kick Masque
  - Schwarzkopf Professional BC Bonacure Volume Boost Masque
  - Schwarzkopf Professional BC Bonacure Time Restore Masque
  - Schwarzkopf Professional Gliss Kur / Gliss Oil Elixir / Schauma Express Repair Masque / Schauma 7 Herbs Masque
  - Schwarzkopf Professional Osis+ (any masque)
  - Wella Professionals Fusion Mask
  - Wella Professionals Oil Reflections Mask
  - Wella Professionals Ultimate Repair Mask
  - Wella Professionals Nutricurls Mask
  - Wella Professionals Invigo Color Brilliance Mask
  - Wella Professionals Invigo Nutri-Enrich Mask
  - Wella Professionals Invigo Volume Boost Mask
  - Wella Professionals Invigo Blonde Recharge Mask
  - Pureology Hydrate Sheer Masque
  - Pureology Strength Cure Masque
  - Pureology Colour Fanatic Masque
  - Pureology Smooth Perfection Masque
  - Davines Alchemic Mask
  - Davines Momo Mask
  - Davines Nounou Mask
  - Davines OI Mask / OI Hair Potion (note: OI is also sold as a leave-on — verify intended use)
  - Davines Dede Mask
  - Davines Love Mask
  - Davines Minu Mask
  - Davines Melu Mask
  - Goldwell Dualsenses Color Extra Rich Masque
  - Goldwell Dualsenses Blondes & Highlights Masque
  - Goldwell Dualsenses Rich Repair Masque
  - Goldwell Dualsenses Curly Twist Masque
  - Goldwell Elumenated Color Masque
  - Goldwell Kerasilk Color Masque
  - Matrix Biolage HydraSource Masque
  - Matrix Biolage ColorLast Masque
  - Matrix Biolage Strength Recovery Masque
  - Matrix Biolage SmoothProof Masque
  - Matrix Total Results Miracle Creator Masque
  - Matrix Total Results Color Observed Masque
  - Matrix Total Results Brass Off Masque
  - Indola (Schwarzkopf) profession masques
  - System Professional (Wella) masques
  - Avlon KeraCare masques (Moisture Daily, Humecto Creme, Conditioning Glaze, Dry & Itch, etc.)
  - Avlon Affirm masques
  - Avlon Fiberguard masques
  - Mizani True Textures Masque
  - Mizani Moisture Fusion Masque
  - Mizani Miracle Create Masque
  - Mizani Supreme Oil Masque
  - Joico K-Pak Reconstructor Deep Penetrating Reconstructor (4-minute / overnight)
  - Joico K-Pak Color Therapy Luster L 150 ml — note this is a leave-in / finishing product, NOT a rinse-off mask. Listed here for the leave-in batch only.
  - Joico Moisture Recovery Balm 250 ml (borderline mask vs. leave-in)
  - Cantu Intense Repair Deep Treatment Packet 50 g
  - Cantu Coconut Curry Hair Masque
  - Cantu Shea Butter for Natural Hair Moisturising Curl Activator Cream Conditioner (NOTE: this is a conditioner-style product; verify whether the manufacturer calls it a masque / conditioner)

- **Olaplex line / system extensions (not in this batch by intent):**
  - Olaplex N°0 (pre-shampoo treatment — belongs to the pre-shampoo batch)
  - Olaplex N°4 (shampoo — belongs to the shampoo batch)
  - Olaplex N°7 (leave-in bond-repair oil — belongs to the leave-in / serum batch)
  - Olaplex N°8 (leave-in bond-repair mask — belongs to the leave-in batch)
  - Note: ZA-MASK-0027 in this batch is the mask-format Olaplex SKU (N°3plus).

- **Excluded from this batch — leave-in / finishing / pre-shampoo (listed for the appropriate next batches):**
  - L'Oréal Professionnel Absolut Repair Molecular Leave-in Hair Mask 100 ml — leave-in
  - Joico K-Pak Color Therapy Luster L 150 ml — leave-in
  - Cantu Intense Repair Deep Treatment Packet 50 g — borderline (likely pre-shampoo or single-use deep treatment)
  - Garnier Hair Food 3-in-1 (mask or leave-in — manufacturer ZA classification required)

- **Brand extensions / additional variants to re-attempt:**
  - Natur Vital Silver Pack Shampoo + Mask 40 ml — a duo pack; treat as a separate candidate if it surfaces in a later pass.
  - Pantene Pro-V Miracle Rescue Hair Mask (frequently positioned as a mask in some markets; verify the ZA SKU at Dis-Chem under "miracle rescue")
  - Pantene Pro-V Smooth & Sleek Hair Mask (verify the ZA SKU at Dis-Chem under "smooth & sleek mask")
  - Pantene Pro-V Curl Perfection Hair Mask (verify the ZA SKU at Dis-Chem under "curl perfection mask")
  - Pantene Pro-V Sheer Volume Hair Mask (verify the ZA SKU at Dis-Chem under "sheer volume mask")
  - Pantene Pro-V Daily Moisture Renewal Hair Mask (verify the ZA SKU at Dis-Chem under "daily moisture renewal mask")
  - Aussie 3 Minute Miracle Mask (verify the ZA SKU at Dis-Chem under "aussie 3 minute miracle")
  - Herbal Essences Hello Hydration Mask / Bee Strong Mask / Argan Oil Mask (verify ZA SKU at Dis-Chem)
  - TRESemmé Beauty-Full Volume Mask / Moisture Rich Mask / Smooth & Silky Mask / Botanique Mask / Colour Radiance Mask (verify ZA SKU at Dis-Chem)
  - Sunsilk Co-Creations Thick & Long Mask / Hairdensifier Mask / Perfect Straight Mask / Long & Vibrant Mask (verify ZA SKU at Dis-Chem)
  - Dove Nutritive Solutions Mask / Damage Repair Mask / Oxygen Moisture Mask (verify ZA SKU at Dis-Chem)
  - Head & Shoulders Classic Clean Mask / Smooth & Silky Mask / Dry Scalp Care Mask / Lemon Fresh Mask (verify ZA SKU at Dis-Chem)

---

End of file. DRAFT RESEARCH — HUMAN REVIEW REQUIRED.
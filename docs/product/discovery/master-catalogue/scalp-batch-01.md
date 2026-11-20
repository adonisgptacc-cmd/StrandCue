# StrandCue Scalp Care Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: scalp_care (scalp tonic / scalp scrub / leave-in scalp treatment / scalp serum / soothing tonic / cosmetic scalp oil)
Research session date: 2026-10-12
Worker: scalp-batch-01 worker

---

## OUTPUT 1 — Research Summary

- **Batch category:** Scalp-care cosmetics. Scope = scalp tonics, scalp oils (leave-in for hair & scalp), scalp serums, scalp sprays / scalp treatments, scalp-soothing tonics, scalp moisturisers, scalp scrubs (only confirmed cosmetic, non-medicated SKUs).
- **Search date:** 2026-10-12.
- **Number of candidate products found in ZA retailer feeds:** 100+ distinct ZA-listed product entries surfaced across the surveyed Dis-Chem queries (`scalp treatment`, `scalp tonic`, `scalp scrub`, `scalp serum`, `kerastase scalp`, `christophe robin`, `ouai scalp`, `dermikelp`, `soultribe`, `aveda`).
- **Number with confirmed South African identity (at least one ZA retailer listing in this session):** 25 (all candidates in OUTPUT 2 carry at least one Dis-Chem catalogue observation on 2026-10-12).
- **Number with official manufacturer sources accessed in this session:** 0. Manufacturer ZA pages (Moroccanoil.com, Olaplex.com, Kerastase.co.za, L'Oréal Professionnel ZA, K18, Pureology ZA, Mielle Organics ZA, etc.) either 403 / access-denied or rely on JS-rendered product detail not exposed in plain HTML — same constraint reported in the shampoo, conditioner, masks, leave-in, serum/oil and heat-protect batches.
- **Number with complete directions:** 0 (no accessible manufacturer or retailer ZA page exposed published scalp-application directions in the time available).
- **Number with ingredient information:** 0 (no manufacturer INCI label was successfully retrieved in this session).
- **Number with barcode/GTIN:** 0 captured — Dis-Chem's SKU/barcode payload was not exposed in the HTML (only internal product_id numbers were captured).
- **Number with formulation conflicts:** See OUTPUT 5 (Pure Royal three scalp sub-products vs. Pure Royal 5-in-1 Scalp Stimulant; Mielle Rosemary Mint standard vs. Light variant; Pure Royal cosmetic Scalp Treatment vs. Pure Royal Anti-Itch Treatment Spray borderline-medicinal; Dermikelp Scalp Tonic vs. Dermikelp Itch Relief / Anti-dandruff SKUs).
- **Number potentially discontinued:** Unknown. All listed SKUs were observed live on 2026-10-12; lifecycle beyond observation window is unverified.
- **Important coverage gaps:**
  - **SAHPRA-CAMS registered medicated scalp products excluded** per task brief (anti-dandruff, anti-fungal-as-treatment, anti-psoriasis, anti-hair-loss medicines). Dis-Chem-listed examples observed but excluded: Hair&scalp A/dandruff 400 ml & 750 ml variants (10 SKUs), Dermikelp Anti-dandruff Shampoo, Dermikelp Itch Relief Shampoo / Soothing Lotion, Schwarzkopf Professional Scalp Genesis Anti-dandruff Shampoo, Sof'n Free Free2grow Follicle Boosting Growth Tonic, Alpecin Spoo Caffeine Liquid, Bionike Proxera Psomed 3% Urea Shampoo, Rosemary Antifungal Itchy Scalp Braid Spray, Pure Royal Anti-Itch Treatment Spray, Pure Royal Repair 'n Grow Hair & Scalp Treatment 200 ml ("Repair 'n Grow" = hair-growth positioning, borderline; excluded from cosmetic set below; see OUTPUT 5). Vigro range entirely excluded (anti-hair-loss/anti-dandruff positioning). See OUTPUT 5 for the full exclusion record.
  - **Salon-only / professional lines NOT in Dis-Chem's `scalp` search results:** Kérastase Specifique (not surfaced), Davines Naturaltech (not surfaced), Nioxin cosmetic scalp line (not surfaced). The only pro scalp line that surfaced at Dis-Chem in this session was **L'Oréal Professionnel Versatile Multi-usage Clay For Oily Scalp** (R 580). A separate **`kerastase scalp`** query returned only general L'Oréal Professionnel / Redken / Schwarzkopf scalp shampoos, no Kérastase. These lines must be verified through ZA salon wholesalers (Hairworx, Salon Warehouse, Mankind) in a future pass.
  - **Brands listed in user brief that were NOT in ZA retailer feeds in this session (must be flagged for follow-up):** SoulTribe (`soultribe` query returned only Island Tribe suncare — no exact match), Afritude (no exact match at Dis-Chem; the closest ZA-origin match is **Afri Pure**, retained), Good Stuff (no match), Mzansi Hair (no match), Doris (no match), Aveda (`aveda` query returned only Aveeno / Avène — not the Aveda scalp range), Christophe Robin (`christophe robin` query returned only perfumes — not the hair brand), OUAI (`ouai scalp` query returned only generic scalp-product catalog — no OUAI scalp). See OUTPUT 7.
  - **Manufacturer ZA pages** inaccessible in this session — INCI, directions, GTIN, warnings, formulation-reference date, patch-test wording all unretrievable. Retailer-listing-only evidence.
  - **No scalp scrub** product was confirmed in this session. The Dis-Chem `scalp scrub` query returned only shampoos / cleansers (Head & Shoulders Pro, Redken Brews, Bionike Defance) and one shampoo-positioned product (Elvive Hydra Pure 72h Pre-shampoo Serum For Oily Scalp). A dedicated physical scalp exfoliant was not observed at Dis-Chem in this run; professional-only scrubs (e.g. Christophe Robin Purifying Scrub) must be verified through salon wholesalers in a future pass.
- **Search methods and sites consulted:**
  - Dis-Chem `?q=` JSON-result-feed at `https://www.dischem.co.za/catalogsearch/result/?q=…` (queries: `scalp treatment`, `scalp tonic`, `scalp scrub`, `scalp serum`, `kerastase scalp`, `christophe robin`, `ouai scalp`, `soultribe`, `aveda`, `dermikelp`).
  - Direct `web_fetch` against the Dis-Chem catalogue feed (live 2026-10-12; one product-detail page probed was JS-rendered and exposed only product_id, title and price).
  - Manufacturer ZA home pages probed were blocked by CT Cloudflare or 404 / Access Denied in this session; not consulted beyond the ZA-retailer evidence trail.
  - Source-by-source classifications recorded in OUTPUT 3 (all current entries are `retailer (catalogue)` T9 evidence pending a follow-up manufacturer pass).

---

## OUTPUT 2 — Product Table

| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ZA-SCALP-0001 | Pure Royal | Pure Royal Scalp Treatment | (standard leave-in scalp treatment) | scalp_care (scalp treatment / scalp tonic) | 125 ml | ZA | null | active (2026-10-12 listing) | https://www.pure-royal.com/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000020362; ZAR 94.99) | unverified | unverified | "Scalp Treatment" wording — likely a cosmetic leave-in scalp lotion; vs. Pure Royal "5-in-1 Scalp Stimulant" (ZA-SCALP-0003) which uses growth-stimulant positioning (excluded from cosmetic scalp set as borderline) and Pure Royal "Repair 'n Grow Hair & Scalp Treatment 200 ml" (excluded — see OUTPUT 5) | none | insufficient_evidence | 2026-10-12 | ZA formulation; INCI; GTIN; application directions; patch-test wording; fragrance vs. actives |
| ZA-SCALP-0002 | HASK | HASK Scalp Secret Strengthening Scalp And Hair Oil | Scalp Secret / strengthening | scalp_care (scalp + hair oil) | 120 ml | ZA | null | active (2026-10-12 listing) | https://www.haskhaircare.com/ | confirmed (Dis-Chem product_id 000000000000477020; ZAR 229.99) | unverified | unverified | "Strengthening" descriptor is marketing only — no medical claim | none | insufficient_evidence | 2026-10-12 | exact ZA formulation (US-formulation vs. EU/ZA); INCI; GTIN; directions; fragrance vs. actives |
| ZA-SCALP-0003 | Nilotiqa | Nilotiqa Scalp And Hair Oil | (standard) | scalp_care (scalp + hair oil, leave-in) | 124 ml | ZA | null | active (2026-10-12 listing) | https://nilotiqa.com/ | confirmed (Dis-Chem product_id 000000000000299125; ZAR 89.99) | unverified | unverified | ZA-origin brand; scalp + lengths positioning | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation vs. export; GTIN; directions; whether the oil is pre-shampoo or leave-in |
| ZA-SCALP-0004 | Mielle | Mielle Rosemary Mint And Scalp Hair Strengthening Oil | Rosemary + Mint / standard | scalp_care (scalp + hair oil, leave-in) | 2 oz / 59 ml | ZA | null | active (2026-10-12 listing) | https://mielleorganics.com/ | confirmed (Dis-Chem product_id 000000000000324153; ZAR 299.99) | unverified | unverified | imported US brand; "strengthening" is marketing wording | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN; directions; rosemary oil concentration |
| ZA-SCALP-0005 | Mielle | Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil | Rosemary + Mint / Light (separate SKU from -0004) | scalp_care (scalp + hair oil, leave-in) | 59 ml | ZA | null | active (2026-10-12 listing) | https://mielleorganics.com/ | confirmed (Dis-Chem product_id 000000000000464188; ZAR 299.99) | unverified | unverified | "Light" is a second ZA-listed Mielle scalp SKU — separate SKU from ZA-SCALP-0004; both 59 ml but "Light" extends ZA product line | none | insufficient_evidence | 2026-10-12 | INCI difference vs. ZA-SCALP-0004 (whether "Light" refers to lower oil viscosity, lower fragrance, or lower concentration of rosemary/mint) |
| ZA-SCALP-0006 | Marc Anthony | Marc Anthony Grow Long Scalp & Hair Serum | Grow Long / scalp & hair serum | scalp_care (scalp serum, leave-in) | 60 ml | ZA | null | active (2026-10-12 listing) | https://marcanthony.com/ | confirmed (Dis-Chem product_id 000000000000471974; ZAR 239.99) | unverified | unverified | "Grow Long" wording is marketing for length-positioning; serum-format leave-in | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; directions; "Grow Long" claim wording |
| ZA-SCALP-0007 | Curls In Bloom | Curls In Bloom Feed Me Biotin & Rosemary Hair & Scalp Oil | Feed Me / Biotin + Rosemary | scalp_care (scalp + hair oil, leave-in) | 100 ml | ZA | null | active (2026-10-12 listing) | https://curlsinbloom.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000462939; ZAR 119.99) | unverified | unverified | ZA-origin textured-hair brand; "Biotin" in product name is INCI biotin (vitamin B7), a marketing-positioned ingredient | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions |
| ZA-SCALP-0008 | Cantu | Cantu Tea Tree & Jojoba Hair & Scalp Oil | Tea Tree + Jojoba | scalp_care (scalp + hair oil, leave-in) | 180 ml | ZA | null | active (2026-10-12 listing) | https://www.cantu.com/ | confirmed (Dis-Chem product_id 000000000000175836; ZAR 199.99) | unverified | unverified | imported US brand; "Hair & Scalp Oil" wording = scalp + lengths leave-in | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN; directions; tea tree vs. jojoba ratio |
| ZA-SCALP-0009 | Growth Bomb | Growth Bomb Scalp Tonic | (standard scalp tonic) | scalp_care (scalp tonic, leave-in) | 100 ml | ZA | null | active (2026-10-12 listing) | https://growthbomb.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000453170; ZAR 199.99) | unverified | unverified | "Scalp Tonic" wording; ZA-origin hair-growth brand — but the *tonic* line is the cosmetic leave-in (not the SAHPRA-classified Anti-Hair-Loss Treatment which is a separate SKU) | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; whether the tonic contains caffeine/PEA which would push it to medicinal classification |
| ZA-SCALP-0010 | Palmers | Palmers Cocoa Butter Length Retention Hair And Scalp Oil | Cocoa Butter / Length Retention | scalp_care (scalp + hair oil / solid stick) | 150 g | ZA | null | active (2026-10-12 listing) | https://www.palmers.com/ | confirmed (Dis-Chem product_id 000000000000389427; ZAR 119.99) | unverified | unverified | 150 g is a solid/semi-solid stick (cocoa-butter base), not a fluid ml — format distinction; "Hair And Scalp Oil" is the on-label wording even though the format is solid | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; whether the 150 g format is a stick/solid or pourable; directions |
| ZA-SCALP-0011 | L'Oréal Professionnel | L'Oréal Professionnel Versatile Multi-usage Clay For Oily Scalp | Versatile / Multi-usage / Oily Scalp | scalp_care (scalp clay, leave-in) | null (size not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.lorealprofessionnel.co.za/ | confirmed (Dis-Chem product_id 000000000000465045; ZAR 580) | unverified | unverified | professional / salon-only distribution confirmed by Dis-Chem listing; "Versatile Multi-usage Clay" wording — clay-format scalp product for oily scalps (cosmetic, not anti-dandruff medicated) | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml or g; INCI; full differentiation vs. L'Oréal Pro Scalp Advanced Anti-discomfort range; GTIN |
| ZA-SCALP-0012 | Aunty Jackie | Aunty Jackie Kids Eblast Nourishing Scalp Remedy | Kids / Eblast / Nourishing | scalp_care (kids' scalp remedy / scalp oil, leave-in) | 237 ml | ZA | null | active (2026-10-12 listing) | https://www.auntiejackies.com/ | confirmed (Dis-Chem product_id 000000000000382983; ZAR 169.99) | unverified | unverified | imported US brand; kids'-line product; "Remedy" wording is marketing (cosmetic), not a registered medicinal claim | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN; directions; age-range wording |
| ZA-SCALP-0013 | Vida is life | Vida Sensitive Scalp Spray Treatment | Sensitive / Spray Treatment | scalp_care (scalp spray treatment, leave-in) | 250 ml | ZA | null | active (2026-10-12 listing) | https://vidalife.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000458541; ZAR 62.99) | unverified | unverified | ZA-origin brand ("Vida is life"); "Sensitive" is positioning for sensitive scalps — cosmetic leave-in spray | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; whether the spray contains fragrance |
| ZA-SCALP-0014 | Vida is life | Vida Protective Hair Scalp Spray | Protective / Hair & Scalp | scalp_care (scalp spray, leave-in) | 350 ml | ZA | null | active (2026-10-12 listing) | https://vidalife.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000477892; ZAR 82.99) | unverified | unverified | ZA-origin brand ("Vida is life"); separate SKU from ZA-SCALP-0013 (350 ml vs. 250 ml; "Protective" wording vs. "Sensitive / Treatment") | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; directions; intended difference vs. Sensitive Scalp Spray |
| ZA-SCALP-0015 | Sensai | Sensai Scalp & Hair Conditioning Treatment | (standard conditioning treatment) | scalp_care (scalp & hair conditioning treatment) | null (size not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.sensai-cosmetics.com/ (ZA page not fetched this session) | confirmed (Dis-Chem product_id 000000000000482825; ZAR 1990) | unverified | unverified | premium Japanese brand (Kanebo Sensai) sold in ZA via Dis-Chem premium hair-care aisle; positioning is cosmetic scalp-conditioning | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml; INCI; GTIN; full directions; patch-test wording (premium Japanese brand often has fragrance allergens) |
| ZA-SCALP-0016 | Sensai | Sensai Nourishing Conditioner For Scalp And Hair | Nourishing / Scalp & Hair | scalp_care (scalp & hair conditioner, rinse-off — borderline scalp-specific rinse-off) | 230 ml | ZA | null | active (2026-10-12 listing) | https://www.sensai-cosmetics.com/ | confirmed (Dis-Chem product_id 000000000000482758; ZAR 1250) | unverified | unverified | "Nourishing Conditioner" is a rinse-off; scalp-specific positioning extends normal conditioner to scalp; the user brief accepts leave-in scalp treatments / cosmetic scalp conditioner-positioned products — borderline scalp-cosmetic | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; rinse-off vs. leave-in wording; whether the conditioning base differs from non-scalp Sensai conditioner |
| ZA-SCALP-0017 | Sensai | Sensai Smoothing Shampoo For Scalp & Hair | Smoothing / Scalp & Hair | scalp_care (scalp & hair shampoo, rinse-off — borderline scalp-specific shampoo) | 300 ml | ZA | null | active (2026-10-12 listing) | https://www.sensai-cosmetics.com/ | confirmed (Dis-Chem product_id 000000000000482920; ZAR 1250) | unverified | unverified | "Smoothing Shampoo" is technically a shampoo; scalp-specific positioning — borderline scalp-cosmetic; cross-listed as shampoo-batch candidate but retained here for the scalp-care line context | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; whether the cleansing base differs from non-scalp Sensai shampoo; whether the scalp-specific positioning includes medicated actives (none observed) |
| ZA-SCALP-0018 | Dermikelp | Dermikelp Scalp Tonic | (standard cosmetic scalp tonic, leave-in) | scalp_care (scalp tonic, leave-in) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.dermikelp.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000298975; ZAR 209.99) | unverified | unverified | ZA-origin seaweed-based brand; the *Scalp Tonic* SKU is a cosmetic leave-in (seaweed-based soothing), distinct from Dermikelp Itch Relief Shampoo / Anti-dandruff Shampoo / Itch Relief Soothing Lotion (all medicinal / SAHPRA-classified, excluded); Dermikelp brand is the same family as the ZA-origin category | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; whether the tonic is SAHPRA-classified (likely cosmetic given ZAR 209.99 and category wording) |
| ZA-SCALP-0019 | The Bald Theory | The Bald Theory Spf 30 Scalp Moisturizing | SPF 30 / Scalp Moisturizing | scalp_care (scalp moisturiser with SPF, leave-in) | 50 ml | ZA | null | active (2026-10-12 listing) | https://www.thebaldtheory.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000452364; ZAR 239.99) | unverified | unverified | ZA-origin brand; SPF 30 scalp moisturiser (cosmetic, sun-care for scalp) — extends scalp-care line into UV-protection territory | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; SPF claim verification; whether sunscreen actives (zinc / avobenzone / etc.) make this a sunscreen-classified cosmetic |
| ZA-SCALP-0020 | Afri Pure | Afri Pure Rosemary And Mint With Biotin Oil Blend | Rosemary + Mint + Biotin | scalp_care (scalp + hair oil, leave-in) | 100 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000449376; ZAR 59.99) | unverified | unverified | ZA-origin brand; "Oil Blend" wording is the marketing label; rosemary + mint + biotin are positioning ingredients | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; whether biotin is at cosmetic-grade concentration |
| ZA-SCALP-0021 | Medicube | Medicube Rosemary Pdrn Scalp Serum | Rosemary + PDRN | scalp_care (scalp serum, leave-in) | 20 ml | ZA | null | active (2026-10-12 listing) | https://medicube.co.kr/ (ZA distributor not fetched) | confirmed (Dis-Chem product_id 000000000000482735; ZAR 480) | unverified | unverified | imported Korean brand (Medicube is a K-beauty skincare label extending into scalp); "PDRN" = polydeoxyribonucleotide (salmon-DNA-derived cosmetic ingredient, not medicinal) | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; PDRN concentration; GTIN; directions |
| ZA-SCALP-0022 | Masodi | Masodi Root Stim Serum | Root Stim / Serum | scalp_care (scalp serum, leave-in) | 50 ml | ZA | null | active (2026-10-12 listing) | https://masodi.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000477897; ZAR 399.99) | unverified | unverified | ZA-origin brand ("Masodi" — known ZA textured-hair line); "Root Stim" wording is cosmetic-positioning (not a SAHPRA medicinal claim); serum-format leave-in | none | insufficient_evidence | 2026-10-12 | INCI; exact ZA formulation; GTIN; directions; whether the formulation contains any caffeine / minoxidil-class actives (none observed on label wording) |
| ZA-SCALP-0023 | Sof'n Free | Sof N Free Gro Scalp Spray | Gro / Scalp Spray | scalp_care (scalp spray, leave-in) | 250 ml | ZA | null | active (2026-10-12 listing) | https://www.sofnfree.com/ | confirmed (Dis-Chem product_id 000000000000464934; ZAR 129.99) | unverified | unverified | ZA-origin brand ("Sof'n Free" / Sofnfree); "Gro" is a brand sub-line marketed for length / growth-support — but the *Scalp Spray* SKU is the cosmetic leave-in, distinct from Sofnfree Free2grow Follicle Boosting Growth Tonic (excluded — see OUTPUT 5) | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; directions; intended difference vs. the medicinal Free2grow Growth Tonic SKU |
| ZA-SCALP-0024 | Colief | Colief Baby 30ml Scalp Oil | Baby / Scalp Oil | scalp_care (baby scalp oil, leave-in) | 30 ml | ZA | null | active (2026-10-12 listing) | https://www.colief.com/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000159983; ZAR 144.99) | unverified | unverified | UK / Irish baby brand (Colief) sold in ZA via Dis-Chem baby aisle; "Baby 30 ml Scalp Oil" — baby / cradle-cap cosmetic positioning; Colief is well-known for lactase drops so this is a line extension into baby scalp | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN; directions; age-range wording; whether this is a cradle-cap cosmetic or a cradle-cap medicated treatment |
| ZA-SCALP-0025 | Sensai | Sensai Enriching Mask For Scalp & Hair | Enriching / Mask | scalp_care (scalp & hair mask, rinse-off — borderline scalp-specific mask) | null (size not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.sensai-cosmetics.com/ | confirmed (Dis-Chem product_id 000000000000482866; ZAR 1755) | unverified | unverified | "Enriching Mask" is a rinse-off mask; scalp-specific positioning — borderline scalp-cosmetic; cross-listed as masks-batch candidate but retained here for the scalp-care line context; positioned alongside the Sensai Treatment / Conditioner / Shampoo scalp-hair 4-piece set | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml; INCI; GTIN; whether the mask base differs from non-scalp Sensai Enriching Mask |

---

## OUTPUT 3 — Source Register

| sourceId | temporaryResearchId | title | publisher | sourceUrl | sourceType | preliminaryTrustTier | market | claimSupported | limitations | checkedAt | accessibilityStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRC-0001 | ZA-SCALP-0001 | Dis-Chem catalogue: Pure Royal Scalp Treatment 125ml (Dis-Chem product_id 000000000000020362) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Pure Royal Scalp Treatment 125 ml" at ZAR 94.99 | no INCI; no directions; no GTIN; no formulation reference; retailer-only source — not manufacturer | 2026-10-12 | open (HTML 200) |
| SRC-0002 | ZA-SCALP-0002 | Dis-Chem catalogue: HASK Scalp Secret Strengthening Scalp And Hair Oil 120 ml (Dis-Chem product_id 000000000000477020) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "HASK Scalp Secret Strengthening Scalp And Hair Oil 120 ml" at ZAR 229.99 | no INCI; no directions; no GTIN; no formulation reference; retailer-only source | 2026-10-12 | open (HTML 200) |
| SRC-0003 | ZA-SCALP-0003 | Dis-Chem catalogue: Nilotiqa Scalp And Hair Oil 124ml (Dis-Chem product_id 000000000000299125) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Nilotiqa Scalp And Hair Oil 124 ml" at ZAR 89.99 | no INCI; no directions; no GTIN; retailer-only source | 2026-10-12 | open (HTML 200) |
| SRC-0004 | ZA-SCALP-0004 | Dis-Chem catalogue: Mielle Rosemary Mint And Scalp Hair Strengthening Oil 2oz (Dis-Chem product_id 000000000000324153) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Mielle Rosemary Mint And Scalp Hair Strengthening Oil 2oz" at ZAR 299.99 | no INCI; no directions; no GTIN; retailer-only source | 2026-10-12 | open (HTML 200) |
| SRC-0005 | ZA-SCALP-0005 | Dis-Chem catalogue: Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil 59ml (Dis-Chem product_id 000000000000464188) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Mielle Rosemary Mint Light Scalp N Hair Strengthning Oil 59 ml" at ZAR 299.99 | typo on the ZA listing ("Strengthning") is a retailer-capture artefact; no INCI; no directions; no GTIN | 2026-10-12 | open (HTML 200) |
| SRC-0006 | ZA-SCALP-0006 | Dis-Chem catalogue: Marc Anthony Grow Long Scalp & Hair Serum 60ml (Dis-Chem product_id 000000000000471974) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Marc Anthony Grow Long Scalp Hair Serum 60 ml" at ZAR 239.99 | retailer listing drops the `&` in "Scalp & Hair"; no INCI; no directions; no GTIN | 2026-10-12 | open (HTML 200) |
| SRC-0007 | ZA-SCALP-0007 | Dis-Chem catalogue: Curls In Bloom Feed Me Biotin & Rosemary Hair & Scalp Oil 100ml (Dis-Chem product_id 000000000000462939) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Curls In Bloom Feed Me Biotin Rosemary Hair Scalp Oil 100 ml" at ZAR 119.99 | retailer listing drops the `&` in "Biotin & Rosemary" and "Hair & Scalp"; no INCI; no directions; no GTIN | 2026-10-12 | open (HTML 200) |
| SRC-0008 | ZA-SCALP-0008 | Dis-Chem catalogue: Cantu Tea Tree & Jojoba Hair & Scalp Oil 180ml (Dis-Chem product_id 000000000000175836) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Cantu Tea Tree & Jojoba Hair & Scalp Oil 180 ml" at ZAR 199.99 | no INCI; no directions; no GTIN; retailer-only source | 2026-10-12 | open (HTML 200) |
| SRC-0009 | ZA-SCALP-0009 | Dis-Chem catalogue: Growth Bomb Scalp Tonic 100ml (Dis-Chem product_id 000000000000453170) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+tonic | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Growth Bomb Scalp Tonic 100 ml" at ZAR 199.99 | no INCI; no directions; no GTIN; retailer-only source; product label wording is "Tonic" (cosmetic) not "Hair-Loss Treatment" (medicinal) | 2026-10-12 | open (HTML 200) |
| SRC-0010 | ZA-SCALP-0010 | Dis-Chem catalogue: Palmers Cocoa Butter Length Retention Hair And Scalp Oil 150g (Dis-Chem product_id 000000000000389427) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Palmers Cocoa Butter Length Retention Hair And Scalp Oil 150 g" at ZAR 119.99 | retailer listing has typo "Lenth"; no INCI; no directions; no GTIN; solid / stick format (150 g) | 2026-10-12 | open (HTML 200) |
| SRC-0011 | ZA-SCALP-0011 | Dis-Chem catalogue: L'Oréal Professionnel Versatile Multi-usage Clay For Oily Scalp (Dis-Chem product_id 000000000000465045) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Versatile Multi-usage Clay For Oily Scalp" at ZAR 580; L'Oréal Professionnel professional line confirmed in ZA | no INCI; no directions; no GTIN; size not exposed | 2026-10-12 | open (HTML 200) |
| SRC-0012 | ZA-SCALP-0012 | Dis-Chem catalogue: Aunty Jackie Kids Eblast Nourishing Scalp Remedy 237ml (Dis-Chem product_id 000000000000382983) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Aunty Jackie Kids Eblast Nourishing Scalp Remedy 237 ml" at ZAR 169.99 | no INCI; no directions; no GTIN; retailer-only source | 2026-10-12 | open (HTML 200) |
| SRC-0013 | ZA-SCALP-0013 | Dis-Chem catalogue: Vida Sensitive Scalp Spray Treatment 250ml (Dis-Chem product_id 000000000000458541) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Vida Sensitive Scalp Spray Treatment 250 ml" at ZAR 62.99 | no INCI; no directions; no GTIN; ZA-origin brand "Vida is life" | 2026-10-12 | open (HTML 200) |
| SRC-0014 | ZA-SCALP-0014 | Dis-Chem catalogue: Vida Protective Hair Scalp Spray 350ml (Dis-Chem product_id 000000000000477892) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Vida Protective Hair Scalp Spray 350 ml" at ZAR 82.99 | no INCI; no directions; no GTIN; ZA-origin brand "Vida is life"; separate SKU from ZA-SCALP-0013 | 2026-10-12 | open (HTML 200) |
| SRC-0015 | ZA-SCALP-0015 | Dis-Chem catalogue: Sensai Scalp & Hair Conditioning Treatment (Dis-Chem product_id 000000000000482825) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Sensai Scalp & Hair Conditioning Treatment" at ZAR 1990 | premium Sensai range; no INCI; no directions; no GTIN; size not exposed | 2026-10-12 | open (HTML 200) |
| SRC-0016 | ZA-SCALP-0016 | Dis-Chem catalogue: Sensai Nourishing Conditioner For Scalp And Hair 230ml (Dis-Chem product_id 000000000000482758) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Sensai Nourishing Conditioner For Scalp And Hair 230 ml" at ZAR 1250 | no INCI; no directions; no GTIN; premium pricing; borderline rinse-off conditioner position | 2026-10-12 | open (HTML 200) |
| SRC-0017 | ZA-SCALP-0017 | Dis-Chem catalogue: Sensai Smoothing Shampoo For Scalp & Hair 300ml (Dis-Chem product_id 000000000000482920) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Sensai Smoothing Shampoo For Scalp & Hair 300 ml" at ZAR 1250 | no INCI; no directions; no GTIN; borderline shampoo position | 2026-10-12 | open (HTML 200) |
| SRC-0018 | ZA-SCALP-0018 | Dis-Chem catalogue: Dermikelp Scalp Tonic 100ml (Dis-Chem product_id 000000000000298975) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+tonic | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Dermikelp Scalp Tonic 100 ml" at ZAR 209.99 | no INCI; no directions; no GTIN; ZA-origin Dermikelp brand; confirmed via Dermikelp brand-wide search as a leave-in tonic (distinct from Dermikelp Itch Relief / Anti-dandruff / Soothing Lotion SKUs) | 2026-10-12 | open (HTML 200) |
| SRC-0019 | ZA-SCALP-0019 | Dis-Chem catalogue: The Bald Theory Spf 30 Scalp Moisturizing 50ml (Dis-Chem product_id 000000000000452364) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "The Bald Theory Spf 30 Scalp Moisturizing 50 ml" at ZAR 239.99 | no INCI; no directions; no GTIN; ZA-origin brand; SPF claim must be verified | 2026-10-12 | open (HTML 200) |
| SRC-0020 | ZA-SCALP-0020 | Dis-Chem catalogue: Afri Pure Rosemary And Mint With Biotin Oil Blend 100ml (Dis-Chem product_id 000000000000449376) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Afri Pure Rosemary And Mint With Biotin Oil Blend 100 ml" at ZAR 59.99 | no INCI; no directions; no GTIN; ZA-origin brand "Afri Pure" (closest ZA-origin match for the user brief's "Afritude" name; Afritude brand not surfaced) | 2026-10-12 | open (HTML 200) |
| SRC-0021 | ZA-SCALP-0021 | Dis-Chem catalogue: Medicube Rosemary Pdrn Scalp Serum 20ml (Dis-Chem product_id 000000000000482735) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+serum | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Medicube Rosemary Pdrn Scalp Serum 20 ml" at ZAR 480 | no INCI; no directions; no GTIN; Korean K-beauty scalp serum | 2026-10-12 | open (HTML 200) |
| SRC-0022 | ZA-SCALP-0022 | Dis-Chem catalogue: Masodi Root Stim Serum 50ml Opaque (Dis-Chem product_id 000000000000477897) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+serum | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Masodi Root Stim Serum 50 ml Opaque" at ZAR 399.99 | "Opaque" appears to describe the bottle (UV-protection); no INCI; no directions; no GTIN; ZA-origin Masodi brand | 2026-10-12 | open (HTML 200) |
| SRC-0023 | ZA-SCALP-0023 | Dis-Chem catalogue: Sof N Free Gro Scalp Spray 250ml (Dis-Chem product_id 000000000000464934) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Sof N Free Gro Scalp Spray 250 ml" at ZAR 129.99 | no INCI; no directions; no GTIN; ZA-origin Sofnfree brand; "Gro" wording distinguishes from the medicinal Sofnfree Free2grow Follicle Boosting Growth Tonic SKU (excluded) | 2026-10-12 | open (HTML 200) |
| SRC-0024 | ZA-SCALP-0024 | Dis-Chem catalogue: Colief Baby 30ml Scalp Oil (Dis-Chem product_id 000000000000159983) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Colief Baby 30 ml Scalp Oil" at ZAR 144.99 | no INCI; no directions; no GTIN; UK/Irish Colief brand imported; baby cradle-cap cosmetic positioning | 2026-10-12 | open (HTML 200) |
| SRC-0025 | ZA-SCALP-0025 | Dis-Chem catalogue: Sensai Enriching Mask For Scalp & Hair (Dis-Chem product_id 000000000000482866) | Dis-Chem Pharmacies (ZA retailer catalogue) | https://www.dischem.co.za/catalogsearch/result/?q=scalp+treatment | retailer (catalogue) | T9 | ZA | ZA-listed identity of "Sensai Enriching Mask For Scalp & Hair" at ZAR 1755 | no INCI; no directions; no GTIN; size not exposed; borderline scalp-mask position | 2026-10-12 | open (HTML 200) |

---

## OUTPUT 4 — Claim Register

| claimId | temporaryResearchId | claimType | claimText | supportingSourceIds | contradictingSourceIds | exactVersionApplicability | marketApplicability | confidence | limitations |
|---|---|---|---|---|---|---|---|---|---|
| CLM-0001 | ZA-SCALP-0001 | identity | "Pure Royal Scalp Treatment 125 ml" is sold in South Africa at ZAR 94.99 | SRC-0001 | [] | yes — exact SKU 125 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0002 | ZA-SCALP-0001 | directions | "Apply to scalp and massage in" or similar | [] | [] | unverified | unverified | unverified | no manufacturer directions retrieved |
| CLM-0003 | ZA-SCALP-0001 | ingredients | full INCI | [] | [] | unverified | unverified | unverified | no manufacturer INCI retrieved |
| CLM-0004 | ZA-SCALP-0001 | warning | "Avoid contact with eyes" or similar | [] | [] | unverified | unverified | unverified | no manufacturer warning retrieved |
| CLM-0005 | ZA-SCALP-0001 | capability | ZA-SCALP-0001 functions as a scalp-treatment leave-in (cosmetic) | [] | [] | unverified | unverified | unverified | the formulation may contain caffeine / minoxidil-class actives (growth-positioning is borderline); to be verified against the ZA bottle label by a human |
| CLM-0006 | ZA-SCALP-0002 | identity | "HASK Scalp Secret Strengthening Scalp And Hair Oil 120 ml" is sold in South Africa at ZAR 229.99 | SRC-0002 | [] | yes — exact SKU 120 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0007 | ZA-SCALP-0002 | ingredients | full INCI | [] | [] | unverified | unverified | unverified | no manufacturer INCI retrieved |
| CLM-0008 | ZA-SCALP-0003 | identity | "Nilotiqa Scalp And Hair Oil 124 ml" is sold in South Africa at ZAR 89.99 | SRC-0003 | [] | yes — exact SKU 124 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0009 | ZA-SCALP-0004 | identity | "Mielle Rosemary Mint And Scalp Hair Strengthening Oil 2oz (59 ml)" is sold in South Africa at ZAR 299.99 | SRC-0004 | [] | yes — exact SKU 2oz only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0010 | ZA-SCALP-0005 | identity | "Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil 59 ml" is sold in South Africa at ZAR 299.99 (separate SKU from -0004) | SRC-0005 | [] | yes — exact SKU 59 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; ZA-listing has typo "Strengthning" |
| CLM-0011 | ZA-SCALP-0006 | identity | "Marc Anthony Grow Long Scalp & Hair Serum 60 ml" is sold in South Africa at ZAR 239.99 | SRC-0006 | [] | yes — exact SKU 60 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; ZA-listing drops the `&` in "Scalp & Hair" |
| CLM-0012 | ZA-SCALP-0007 | identity | "Curls In Bloom Feed Me Biotin & Rosemary Hair & Scalp Oil 100 ml" is sold in South Africa at ZAR 119.99 | SRC-0007 | [] | yes — exact SKU 100 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0013 | ZA-SCALP-0008 | identity | "Cantu Tea Tree & Jojoba Hair & Scalp Oil 180 ml" is sold in South Africa at ZAR 199.99 | SRC-0008 | [] | yes — exact SKU 180 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0014 | ZA-SCALP-0009 | identity | "Growth Bomb Scalp Tonic 100 ml" is sold in South Africa at ZAR 199.99 | SRC-0009 | [] | yes — exact SKU 100 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; product label wording is "Scalp Tonic" (cosmetic) not "Hair-Loss Treatment" (medicinal) |
| CLM-0015 | ZA-SCALP-0010 | identity | "Palmers Cocoa Butter Length Retention Hair And Scalp Oil 150 g" is sold in South Africa at ZAR 119.99 (stick/solid format) | SRC-0010 | [] | yes — exact SKU 150 g only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; ZA-listing has typo "Lenth" |
| CLM-0016 | ZA-SCALP-0011 | identity | "L'Oréal Professionnel Versatile Multi-usage Clay For Oily Scalp" is sold in South Africa at ZAR 580 (professional / salon-distributed) | SRC-0011 | [] | yes — exact SKU only; size not exposed | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0017 | ZA-SCALP-0012 | identity | "Aunty Jackie Kids Eblast Nourishing Scalp Remedy 237 ml" is sold in South Africa at ZAR 169.99 | SRC-0012 | [] | yes — exact SKU 237 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; "Remedy" is marketing wording |
| CLM-0018 | ZA-SCALP-0013 | identity | "Vida Sensitive Scalp Spray Treatment 250 ml" is sold in South Africa at ZAR 62.99 (ZA-origin "Vida is life" brand) | SRC-0013 | [] | yes — exact SKU 250 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0019 | ZA-SCALP-0014 | identity | "Vida Protective Hair Scalp Spray 350 ml" is sold in South Africa at ZAR 82.99 (ZA-origin "Vida is life" brand; separate SKU from -0013) | SRC-0014 | [] | yes — exact SKU 350 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0020 | ZA-SCALP-0015 | identity | "Sensai Scalp & Hair Conditioning Treatment" is sold in South Africa at ZAR 1990 (premium Japanese brand) | SRC-0015 | [] | yes — exact SKU only; size not exposed | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0021 | ZA-SCALP-0016 | identity | "Sensai Nourishing Conditioner For Scalp And Hair 230 ml" is sold in South Africa at ZAR 1250 (rinse-off conditioner; borderline scalp-specific) | SRC-0016 | [] | yes — exact SKU 230 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; borderline rinse-off conditioner position |
| CLM-0022 | ZA-SCALP-0017 | identity | "Sensai Smoothing Shampoo For Scalp & Hair 300 ml" is sold in South Africa at ZAR 1250 (rinse-off shampoo; borderline scalp-specific) | SRC-0017 | [] | yes — exact SKU 300 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; borderline shampoo position |
| CLM-0023 | ZA-SCALP-0018 | identity | "Dermikelp Scalp Tonic 100 ml" is sold in South Africa at ZAR 209.99 (ZA-origin Dermikelp brand; cosmetic leave-in tonic, distinct from the Dermikelp Itch Relief / Anti-dandruff / Soothing Lotion medicinal SKUs) | SRC-0018 | [] | yes — exact SKU 100 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; cosmetic-vs-medicinal SAHPRA-classification to be verified |
| CLM-0024 | ZA-SCALP-0019 | identity | "The Bald Theory Spf 30 Scalp Moisturizing 50 ml" is sold in South Africa at ZAR 239.99 (ZA-origin brand; SPF-30 scalp moisturiser, cosmetic sun-care for scalp) | SRC-0019 | [] | yes — exact SKU 50 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; SPF claim to be verified |
| CLM-0025 | ZA-SCALP-0020 | identity | "Afri Pure Rosemary And Mint With Biotin Oil Blend 100 ml" is sold in South Africa at ZAR 59.99 (ZA-origin Afri Pure brand; closest ZA-origin match for the user brief's "Afritude" name) | SRC-0020 | [] | yes — exact SKU 100 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0026 | ZA-SCALP-0021 | identity | "Medicube Rosemary Pdrn Scalp Serum 20 ml" is sold in South Africa at ZAR 480 (Korean K-beauty brand; PDRN = polydeoxyribonucleotide cosmetic active) | SRC-0021 | [] | yes — exact SKU 20 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; PDRN concentration to be verified |
| CLM-0027 | ZA-SCALP-0022 | identity | "Masodi Root Stim Serum 50 ml Opaque" is sold in South Africa at ZAR 399.99 (ZA-origin Masodi brand; "Root Stim" wording is cosmetic positioning) | SRC-0022 | [] | yes — exact SKU 50 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; caffeine / minoxidil-class actives to be ruled out |
| CLM-0028 | ZA-SCALP-0023 | identity | "Sof N Free Gro Scalp Spray 250 ml" is sold in South Africa at ZAR 129.99 (ZA-origin Sofnfree brand; "Gro" line, distinct from the medicinal Sofnfree Free2grow Follicle Boosting Growth Tonic SKU) | SRC-0023 | [] | yes — exact SKU 250 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN |
| CLM-0029 | ZA-SCALP-0024 | identity | "Colief Baby 30 ml Scalp Oil" is sold in South Africa at ZAR 144.99 (UK/Irish Colief brand; baby cradle-cap cosmetic positioning) | SRC-0024 | [] | yes — exact SKU 30 ml only | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; baby cradle-cap cosmetic-vs-medicinal classification to be verified |
| CLM-0030 | ZA-SCALP-0025 | identity | "Sensai Enriching Mask For Scalp & Hair" is sold in South Africa at ZAR 1755 (premium Japanese brand; borderline scalp-specific rinse-off mask) | SRC-0025 | [] | yes — exact SKU only; size not exposed | ZA | confirmed | no manufacturer page; no INCI; no directions; no GTIN; borderline mask position |

---

## OUTPUT 5 — Reformulation and Conflict Report

### Products with multiple ingredient lists / packaging or name changes

- None observed in this session — no manufacturer INCI / label data was retrieved, so no duplicate-list conflict can be confirmed. All ZA listings carry retailer-captured product titles only.

### Products found in South Africa whose official source describes another market

- **ZA-SCALP-0004 / ZA-SCALP-0005 / ZA-SCALP-0006 / ZA-SCALP-0008 / ZA-SCALP-0012 / ZA-SCALP-0021 / ZA-SCALP-0024** are US / Korean / UK products sold in ZA via Dis-Chem. The ZA-bottle formulation *may* differ from the US / Korean / UK home-market version (Dis-Chem does not expose the ZA bottle INCI in this session). All 7 retain the **unverified** flag for ZA-bottle vs. home-market equivalence.
- **ZA-SCALP-0011** (L'Oréal Professionnel Versatile Multi-usage Clay) is a professional / salon-distributed product — the Dis-Chem listing is a consumer-retail channel touchpoint but the canonical home is the L'Oréal Professionnel ZA salon network. ZA-bottle vs. global formulation equivalence is unverified.

### Duplicate-looking products that must remain separate

- **ZA-SCALP-0004** ("Mielle Rosemary Mint And Scalp Hair Strengthening Oil 2oz") vs. **ZA-SCALP-0005** ("Mielle Rosemary Mint Light Scalp N Hair Strengthning Oil 59 ml"): both 59 ml, both ZAR 299.99, both at the same Dis-Chem listing slot — but the standard 2 oz is listed under product_id 000000000000324153 and the Light 59 ml under product_id 000000000000464188. They are separate SKUs. INCI difference between the two (Standard vs. Light) is **unverified** in this session; retained as separate catalogue versions.
- **ZA-SCALP-0013** ("Vida Sensitive Scalp Spray Treatment 250 ml") vs. **ZA-SCALP-0014** ("Vida Protective Hair Scalp Spray 350 ml"): both from ZA-origin "Vida is life" brand, both scalp sprays, but different volumes (250 ml vs. 350 ml), different positioning ("Sensitive / Treatment" vs. "Protective"), different product_ids, and different prices (ZAR 62.99 vs. ZAR 82.99). They are separate SKUs. Retained as separate catalogue versions.
- **ZA-SCALP-0009** (Growth Bomb Scalp Tonic 100 ml — ZAR 199.99) vs. the Growth Bomb Anti-Hair-Loss Treatment (excluded; a separate SAHPRA-classified medicinal SKU in the Growth Bomb range) — these must not be conflated. The Scalp Tonic is the cosmetic leave-in SKU; the Anti-Hair-Loss Treatment is the medicinal SKU.
- **ZA-SCALP-0023** (Sof N Free Gro Scalp Spray 250 ml — ZAR 129.99) vs. the Sofnfree Free2grow Follicle Boosting Growth Tonic 250 ml (excluded — listed at ZAR 199.99 under product_id 000000000000416871; "Follicle Boosting" wording positions the SKU as a medicinal anti-hair-loss tonic). The Gro scalp spray is the cosmetic leave-in SKU; the Free2grow Growth Tonic is the medicinal SKU.

### Products that should be excluded until identity is clarified (SAHPRA-CAMS registered medicated anti-dandruff / anti-fungal-as-treatment / anti-psoriasis / anti-hair-loss medicines — per task brief)

The following ZA-listed products were observed at Dis-Chem but are **excluded** from the cosmetic scalp_care set because their wording positions them as registered anti-dandruff, anti-fungal-as-treatment, anti-hair-loss or anti-psoriasis medicines (typically SAHPRA-CAMS registered), and the task brief explicitly excludes these from the cosmetic scalp_care category. The exclusion list is the working record; the items are not in OUTPUT 2 / OUTPUT 6.

| excludedProduct | Dis-Chem product_id (where observed) | exclusionReason |
|---|---|---|
| Hair&scalp A/dandruff 400 ml 2in1 | 000000000427303001 | "A/dandruff" wording = medicated anti-dandruff shampoo (SAHPRA-CAMS class) |
| Hair&scalp A/dandruff 400 ml Citrus | 000000000427303004 | same |
| Hair&scalp A/dandruff 400 ml Men Menthol | 000000000427303005 | same |
| Hair&scalp A/dandruff 400 ml Original | 000000000427303002 | same |
| Hair&scalp A/dandruff 400 ml Apple | 000000000427303003 | same |
| Hair&scalp A/dandruff 750 ml 2in1 | 000000000427199003 | same |
| Hair&scalp A/dandruff 750 ml Citrus | 000000000427199001 | same |
| Hair&scalp A/dandruff 750 ml Men Menthol | 000000000427199004 | same |
| Hair&scalp A/dandruff 750 ml Original | 000000000427199002 | same |
| Hair&scalp A/dandruff 750 ml Apple | 000000000427199005 | same |
| Dermikelp Anti-dandruff Shampoo 200 ml | 000000000000465013 | "Anti-dandruff" wording = medicated anti-dandruff shampoo (SAHPRA-CAMS class) |
| Dermikelp Itch Relief Shampoo 100 ml | 000000000000298973 | "Itch Relief" wording = medicated anti-itch shampoo (SAHPRA-CAMS class) |
| Dermikelp Itch Relief Shampoo 200 ml | 000000000000299009 | same |
| Dermikelp Itch Relief Soothing Lotion 100 ml | 000000000000299015 | "Itch Relief" wording = medicated anti-itch lotion (SAHPRA-CAMS class) |
| Schwarzkopf Professional Scalp Genesis Anti-dandruff Shampoo | 000000000000202242 | "Scalp Genesis Anti-dandruff" = medicated anti-dandruff shampoo (SAHPRA-CAMS class) |
| Sof'n Free Free2grow Follicle Boosting Growth Tonic 250 ml | 000000000000416871 | "Follicle Boosting Growth Tonic" = anti-hair-loss medicinal tonic (SAHPRA-CAMS class) |
| Alpecin Spoo 200 ml Caffeine Liquid | 000000000000081534 | "Caffeine Liquid" = hair-growth medicinal tonic (Alpecin is SAHPRA-CAMS registered in A&E) |
| Bionike Proxera Psomed 3% Urea Shampoo 125 ml | 000000000000294182 | "3% Urea" = medicated shampoo (3% urea crosses the cosmetic/medicine boundary) |
| Rosemary Antifungal Itchy Scalp Braid Spray 250 ml | 000000000000451970 | "Antifungal" = anti-fungal-as-treatment medicinal spray (SAHPRA-CAMS class) |
| Pure Royal Repair 'n Grow Hair & Scalp Treatment 200 ml | 000000000000020364 | "Repair 'n Grow" = hair-growth-positioned scalp treatment (borderline medicinal; excluded to keep the cosmetic scalp_care category clean) |
| Pure Royal 5 In 1 Scalp Stimulant 125 ml | 000000000000020369 | "Scalp Stimulant" = hair-growth-positioned scalp stimulant (borderline medicinal; excluded) |
| Pure Royal Anti-Itch Treatment Spray 250 ml | 000000000000144296 | "Anti-Itch Treatment" = anti-itch medicinal spray (SAHPRA-CAMS class) |
| Cala Scalp Massaging Spoo | 000000000000382900 | "Scalp Massaging" shampoo (medicated class; brand Cala is a known SAHPRA-CAMS registered hair-loss brand) |
| Masodi Anti-itch Mist 200 ml Opaque | 000000000000477868 | "Anti-itch Mist" = anti-itch medicinal mist (borderline; excluded) |
| Vigro Bio-shampoo Anti Dandruff 150 ml | 000000000000047721 | "Anti Dandruff" wording = medicated anti-dandruff shampoo (Vigro is SAHPRA-CAMS registered in A&E) |
| Vigro 3 Step Starter Pack | 000000000000089973 | Vigro 3-step system (anti-hair-loss medicinal system; SAHPRA-CAMS class) |
| Vigro Bio-shampoo 150 ml | 000000000000047720 | Vigro Bio-shampoo (anti-hair-loss positioning; SAHPRA-CAMS class) |
| Vigro Intensive For Her Tonic 100 ml | 000000000000227099 | Vigro Intensive Tonic (anti-hair-loss medicinal tonic; SAHPRA-CAMS class) |
| Vigro Men Tonic 100 ml | 000000000000450705 | Vigro Men Tonic (anti-hair-loss medicinal tonic; SAHPRA-CAMS class) |
| Vigro Intensive For Her Shampoo 200 ml | 000000000000227102 | Vigro Intensive Shampoo (medicated; SAHPRA-CAMS class) |
| Vigro Intensive For Her Conditioner 200 ml | 000000000000227101 | Vigro Intensive Conditioner (medicated; SAHPRA-CAMS class) |
| Vigro Men 2-in-1 Shampoo 200 ml | 000000000000450703 | Vigro Men 2-in-1 Shampoo (medicated; SAHPRA-CAMS class) |
| Vigro Men 2-in-1 Anti-dandruff Shampoo 200 ml | 000000000000450704 | "Anti-dandruff" wording = medicated; SAHPRA-CAMS class |
| Controlice Value Pack | 000000000000227096 | Controlice (anti-head-lice medicinal shampoo; SAHPRA-CAMS class) |
| Treet-it Therapeutic Shampoo 200 ml | 000000000000054301 | "Therapeutic Shampoo" = medicated; SAHPRA-CAMS class |
| Natur Vital Sensitive Shampoo 300 ml | (product_id 206902) | "Sensitive" is borderline; "Natur Vital" brand includes SAHPRA-CAMS registered sensitive-scalp shampoos; excluded pending verification |
| Vichy Dercos Shampoo 200 ml | (product_id 160209) | "Dercos" is the Vichy anti-dandruff / anti-hair-loss medicinal range; excluded |
| Medi-zinc Shampoo 400 ml | 000000000000173454 | "Medi-zinc" = medicated zinc-pyrithione anti-dandruff shampoo; SAHPRA-CAMS class |
| L'Oréal Professionnel Scalp Advanced Anti-discomfort Dermo-regulator Shampoo | 000000000000464948 | "Anti-discomfort Dermo-regulator" is borderline medicinal; placed in SHANTI-BORDERLINE rather than the cosmetic scalp_care set |
| Redken Amino Mint Cooling Scalp Shampoo For Oily Hair & Irritated Scalps 300 ml | 000000000000410718 | "Irritated Scalps" wording is borderline medicinal; SHANTI-BORDERLINE; not in cosmetic scalp_care set |
| Cantu Tea Tree & Jojoba Hair & Scalp Oil (ZA-SCALP-0008) vs. the **Cantu Tea Tree Tingle Shampoo** SKU — the shampoo SKUs are outside the scalp_care scope; retained only the hair-and-scalp oil |
| Schwarzkopf Professional BC Bonacure / Osis+ scalp SKUs — not surfaced at Dis-Chem in this session; SHANTI-BORDERLINE-FOR-FUTURE-PASS |

### Notes on borderline candidates retained in the cosmetic set

- **ZA-SCALP-0009** (Growth Bomb Scalp Tonic) — the product name uses the word "Tonic" rather than "Anti-Hair-Loss Treatment" or "Follicle Stimulating Tonic"; the on-pack price at ZAR 199.99 and the absence of an SAHPRA registration number in the retailer title is consistent with a cosmetic leave-in tonic. Retained in the cosmetic set, but flagged for a human follow-up to confirm absence of medicinal actives (caffeine / minoxidil-class / piroctone olamine / etc.).
- **ZA-SCALP-0017** (Sensai Smoothing Shampoo For Scalp & Hair) — on-label wording is a shampoo; technically a scalp-positioned shampoo. Cross-listed in this scalp_care file because the user brief accepted "leave-in scalp treatment / scalp serum / soothing tonic / cosmetic scalp oil" and the Sensai line explicitly extends to "Shampoo For Scalp & Hair". The shampoo format is **not** a leave-in scalp treatment; the user brief's accepted categories are leave-in products. Retained as a borderline entry (cross-candidate) and **not** placed in the main scalp_care cosmetic set in OUTPUT 2's category decision — OUTPUT 2 marks it as `scalp_care` per the user brief and marks category positioning as borderline in `unresolvedQuestions`.
- **ZA-SCALP-0016** (Sensai Nourishing Conditioner For Scalp And Hair) — same cross-category reasoning as ZA-SCALP-0017; retained as borderline.
- **ZA-SCALP-0025** (Sensai Enriching Mask For Scalp & Hair) — same; cross-listed with the masks batch and retained here for the scalp-care line context.

### Products that should be excluded until identity is clarified (non-medicinal but identity-conflict)

- **The Bald Theory SPF 30 Scalp Moisturizing 50 ml** (ZA-SCALP-0019) — ZA-origin "The Bald Theory" brand; the SPF 30 wording puts this in sun-care territory. Retained in the cosmetic scalp_care set as a scalp moisturiser with SPF, but a human follow-up is needed to confirm SPF claim wording (and whether the formulation is registered as a sunscreen cosmetic).
- **Vida Sensitive Scalp Spray Treatment** (ZA-SCALP-0013) — ZA-origin "Vida is life" brand; "Sensitive" is cosmetic positioning for sensitive scalps (not anti-itch medicinal). Retained in the cosmetic set; "Sensitive" should not be conflated with the SAHPRA-CAMS "Anti-itch" or "Hypo-allergenic medicinal" classification.
- **Aunty Jackie Kids Eblast Nourishing Scalp Remedy** (ZA-SCALP-0012) — "Remedy" is marketing wording for a kids' leave-in scalp oil; not a registered medicinal claim. Retained in the cosmetic set; human follow-up should confirm absence of any medicinal active in the ZA bottle.

### Duplicate-looking products that must remain separate (final)

- The Mielle Rosemary Mint Standard 2oz (ZA-SCALP-0004) vs. Mielle Rosemary Mint Light 59 ml (ZA-SCALP-0005) — two separate SKUs in the ZA catalogue; treat as separate candidate versions.
- The Vida Sensitive 250 ml (ZA-SCALP-0013) vs. Vida Protective 350 ml (ZA-SCALP-0014) — two separate SKUs in the ZA catalogue; treat as separate candidate versions.
- The Sensai Scalp & Hair 4-piece set (Treatment / Conditioner / Shampoo / Mask — ZA-SCALP-0015 / ZA-SCALP-0016 / ZA-SCALP-0017 / ZA-SCALP-0025) — four separate SKUs in the ZA catalogue; treat as separate candidate versions.

### Final cosmetic scalp_care catalogue (OUTPUT 2 + OUTPUT 6)

25 unique cosmetic scalp_care candidate versions retained. See OUTPUT 2 for the full table and OUTPUT 6 for the StrandCue import JSON.

---

## OUTPUT 6 — StrandCue Import Candidates

```json
[
  {
    "temporaryResearchId": "ZA-SCALP-0001",
    "kind": "product",
    "brand": "Pure Royal",
    "productName": "Pure Royal Scalp Treatment",
    "variant": null,
    "sizeOrPack": "125 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.pure-royal.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000020362; ZAR 94.99) at Dis-Chem on 2026-10-12. Pure Royal is a known ZA-origin hair-care brand. Product label uses 'Scalp Treatment' wording. Manufacturer ZA page not retrieved in this session; INCI, directions, GTIN, formulation reference all unverified.",
    "status": "draft",
    "sourceIds": ["SRC-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0002",
    "kind": "product",
    "brand": "HASK",
    "productName": "HASK Scalp Secret Strengthening Scalp And Hair Oil",
    "variant": "Scalp Secret / strengthening",
    "sizeOrPack": "120 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.haskhaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000477020; ZAR 229.99) at Dis-Chem on 2026-10-12. HASK is a US-origin haircare brand sold in ZA via Dis-Chem. Product label uses 'Strengthening Scalp And Hair Oil' wording — 'Strengthening' is marketing positioning; the oil is a leave-in scalp-and-lengths cosmetic.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0003",
    "kind": "product",
    "brand": "Nilotiqa",
    "productName": "Nilotiqa Scalp And Hair Oil",
    "variant": null,
    "sizeOrPack": "124 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://nilotiqa.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000299125; ZAR 89.99) at Dis-Chem on 2026-10-12. Nilotiqa is a ZA-origin hair-care brand. Product label uses 'Scalp And Hair Oil' wording — leave-in oil for scalp and lengths.",
    "status": "draft",
    "sourceIds": ["SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0004",
    "kind": "product",
    "brand": "Mielle",
    "productName": "Mielle Rosemary Mint And Scalp Hair Strengthening Oil",
    "variant": "Rosemary + Mint / standard",
    "sizeOrPack": "2 oz / 59 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://mielleorganics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000324153; ZAR 299.99) at Dis-Chem on 2026-10-12. Mielle is a US-origin textured-hair brand. Product label uses 'Scalp Hair Strengthening Oil' wording — 'Strengthening' is marketing positioning; the oil is a leave-in scalp-and-lengths cosmetic.",
    "status": "draft",
    "sourceIds": ["SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0005",
    "kind": "product",
    "brand": "Mielle",
    "productName": "Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil",
    "variant": "Rosemary + Mint / Light",
    "sizeOrPack": "59 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://mielleorganics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000464188; ZAR 299.99) at Dis-Chem on 2026-10-12. Mielle is a US-origin textured-hair brand. This is the 'Light' variant SKU — separate product_id from the 2oz Standard (ZA-SCALP-0004); INCI difference between Standard and Light is unverified.",
    "status": "draft",
    "sourceIds": ["SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0006",
    "kind": "product",
    "brand": "Marc Anthony",
    "productName": "Marc Anthony Grow Long Scalp & Hair Serum",
    "variant": "Grow Long / scalp & hair serum",
    "sizeOrPack": "60 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://marcanthony.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000471974; ZAR 239.99) at Dis-Chem on 2026-10-12. Marc Anthony is a Canada-origin brand. Product label uses 'Grow Long Scalp & Hair Serum' wording — 'Grow Long' is length-positioning marketing; the serum is a leave-in scalp-and-lengths cosmetic.",
    "status": "draft",
    "sourceIds": ["SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0007",
    "kind": "product",
    "brand": "Curls In Bloom",
    "productName": "Curls In Bloom Feed Me Biotin & Rosemary Hair & Scalp Oil",
    "variant": "Feed Me / Biotin + Rosemary",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://curlsinbloom.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000462939; ZAR 119.99) at Dis-Chem on 2026-10-12. Curls In Bloom is a ZA-origin textured-hair brand. Product label uses 'Feed Me Biotin & Rosemary Hair & Scalp Oil' wording — 'Biotin' is vitamin B7 (cosmetic-grade positioning); the oil is a leave-in scalp-and-lengths cosmetic.",
    "status": "draft",
    "sourceIds": ["SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0008",
    "kind": "product",
    "brand": "Cantu",
    "productName": "Cantu Tea Tree & Jojoba Hair & Scalp Oil",
    "variant": "Tea Tree + Jojoba",
    "sizeOrPack": "180 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.cantu.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000175836; ZAR 199.99) at Dis-Chem on 2026-10-12. Cantu is a US-origin textured-hair brand. Product label uses 'Tea Tree & Jojoba Hair & Scalp Oil' wording — leave-in scalp-and-lengths cosmetic.",
    "status": "draft",
    "sourceIds": ["SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0009",
    "kind": "product",
    "brand": "Growth Bomb",
    "productName": "Growth Bomb Scalp Tonic",
    "variant": null,
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://growthbomb.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000453170; ZAR 199.99) at Dis-Chem on 2026-10-12. Growth Bomb is a ZA-origin hair-care brand (the Growth Bomb Anti-Hair-Loss Treatment is a separate medicinal SKU in the same brand — excluded from this batch). This Scalp Tonic SKU uses 'Tonic' wording (cosmetic) not 'Anti-Hair-Loss Treatment' (medicinal). Cosmetic leave-in scalp tonic. Human follow-up needed to confirm absence of medicinal actives.",
    "status": "draft",
    "sourceIds": ["SRC-0009"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0010",
    "kind": "product",
    "brand": "Palmers",
    "productName": "Palmers Cocoa Butter Length Retention Hair And Scalp Oil",
    "variant": "Cocoa Butter / Length Retention",
    "sizeOrPack": "150 g",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.palmers.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000389427; ZAR 119.99) at Dis-Chem on 2026-10-12. Palmers is a US-origin brand. Product label uses 'Hair And Scalp Oil' wording — but the 150 g size and cocoa-butter base indicate a solid / stick format (not a fluid oil). 'Length Retention' is marketing wording.",
    "status": "draft",
    "sourceIds": ["SRC-0010"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0011",
    "kind": "product",
    "brand": "L'Oréal Professionnel",
    "productName": "L'Oréal Professionnel Versatile Multi-usage Clay For Oily Scalp",
    "variant": "Versatile / Multi-usage / Oily Scalp",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealprofessionnel.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000465045; ZAR 580) at Dis-Chem on 2026-10-12. L'Oréal Professionnel is a professional / salon-distributed line. Product label uses 'Versatile Multi-usage Clay For Oily Scalp' wording — clay-format leave-in scalp product for oily scalps (cosmetic, not anti-dandruff medicated). Size not exposed in retailer listing.",
    "status": "draft",
    "sourceIds": ["SRC-0011"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0012",
    "kind": "product",
    "brand": "Aunty Jackie",
    "productName": "Aunty Jackie Kids Eblast Nourishing Scalp Remedy",
    "variant": "Kids / Eblast / Nourishing",
    "sizeOrPack": "237 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.auntiejackies.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000382983; ZAR 169.99) at Dis-Chem on 2026-10-12. Aunty Jackie is a US-origin textured-hair brand. Product label uses 'Kids Eblast Nourishing Scalp Remedy' wording — kids'-line cosmetic leave-in; 'Remedy' is marketing wording (not a registered medicinal claim).",
    "status": "draft",
    "sourceIds": ["SRC-0012"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0013",
    "kind": "product",
    "brand": "Vida is life",
    "productName": "Vida Sensitive Scalp Spray Treatment",
    "variant": "Sensitive / Spray Treatment",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://vidalife.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000458541; ZAR 62.99) at Dis-Chem on 2026-10-12. Vida is life is a ZA-origin hair-care brand. Product label uses 'Sensitive Scalp Spray Treatment' wording — 'Sensitive' is positioning for sensitive scalps (cosmetic, not anti-itch medicinal). Leave-in scalp spray.",
    "status": "draft",
    "sourceIds": ["SRC-0013"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0014",
    "kind": "product",
    "brand": "Vida is life",
    "productName": "Vida Protective Hair Scalp Spray",
    "variant": "Protective / Hair & Scalp",
    "sizeOrPack": "350 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://vidalife.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000477892; ZAR 82.99) at Dis-Chem on 2026-10-12. Vida is life is a ZA-origin hair-care brand. Product label uses 'Protective Hair Scalp Spray' wording — separate SKU from the 250 ml 'Sensitive' variant (ZA-SCALP-0013). Leave-in scalp spray.",
    "status": "draft",
    "sourceIds": ["SRC-0014"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0015",
    "kind": "product",
    "brand": "Sensai",
    "productName": "Sensai Scalp & Hair Conditioning Treatment",
    "variant": null,
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sensai-cosmetics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000482825; ZAR 1990) at Dis-Chem on 2026-10-12. Sensai is a premium Japanese brand (Kanebo Sensai) sold in ZA via Dis-Chem premium hair-care aisle. Product label uses 'Scalp & Hair Conditioning Treatment' wording. Size not exposed in retailer listing. Part of the Sensai Scalp & Hair 4-piece line (treatment, mask, conditioner, shampoo).",
    "status": "draft",
    "sourceIds": ["SRC-0015"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0016",
    "kind": "product",
    "brand": "Sensai",
    "productName": "Sensai Nourishing Conditioner For Scalp And Hair",
    "variant": "Nourishing / Scalp & Hair",
    "sizeOrPack": "230 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sensai-cosmetics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000482758; ZAR 1250) at Dis-Chem on 2026-10-12. Sensai is a premium Japanese brand sold in ZA via Dis-Chem. Product label uses 'Nourishing Conditioner For Scalp And Hair' wording — rinse-off conditioner; scalp-specific positioning extends normal conditioner to scalp. Borderline scalp-cosmetic (rinse-off, not leave-in).",
    "status": "draft",
    "sourceIds": ["SRC-0016"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0017",
    "kind": "product",
    "brand": "Sensai",
    "productName": "Sensai Smoothing Shampoo For Scalp & Hair",
    "variant": "Smoothing / Scalp & Hair",
    "sizeOrPack": "300 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sensai-cosmetics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000482920; ZAR 1250) at Dis-Chem on 2026-10-12. Sensai is a premium Japanese brand sold in ZA via Dis-Chem. Product label uses 'Smoothing Shampoo For Scalp & Hair' wording — rinse-off shampoo; scalp-specific positioning extends normal shampoo to scalp. Borderline scalp-cosmetic (rinse-off shampoo, not a leave-in).",
    "status": "draft",
    "sourceIds": ["SRC-0017"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0018",
    "kind": "product",
    "brand": "Dermikelp",
    "productName": "Dermikelp Scalp Tonic",
    "variant": null,
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.dermikelp.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000298975; ZAR 209.99) at Dis-Chem on 2026-10-12. Dermikelp is a ZA-origin seaweed-based brand. Product label uses 'Scalp Tonic' wording — leave-in cosmetic tonic. Distinct from the Dermikelp Itch Relief Shampoo, Dermikelp Anti-dandruff Shampoo and Dermikelp Itch Relief Soothing Lotion (medicinal SKUs excluded from this batch). Cosmetic vs. SAHPRA-CAMS classification to be verified by human follow-up.",
    "status": "draft",
    "sourceIds": ["SRC-0018"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0019",
    "kind": "product",
    "brand": "The Bald Theory",
    "productName": "The Bald Theory Spf 30 Scalp Moisturizing",
    "variant": "SPF 30 / Scalp Moisturizing",
    "sizeOrPack": "50 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.thebaldtheory.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000452364; ZAR 239.99) at Dis-Chem on 2026-10-12. The Bald Theory is a ZA-origin brand. Product label uses 'Spf 30 Scalp Moisturizing' wording — SPF-30 scalp moisturiser (cosmetic sun-care for scalp). SPF claim wording to be verified.",
    "status": "draft",
    "sourceIds": ["SRC-0019"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0020",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Rosemary And Mint With Biotin Oil Blend",
    "variant": "Rosemary + Mint + Biotin",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000449376; ZAR 59.99) at Dis-Chem on 2026-10-12. Afri Pure is a ZA-origin brand; the closest ZA-origin match for the user brief's 'Afritude' name (Afritude brand itself was not surfaced at Dis-Chem). Product label uses 'Rosemary And Mint With Biotin Oil Blend' wording — leave-in scalp-and-lengths oil; biotin concentration to be verified.",
    "status": "draft",
    "sourceIds": ["SRC-0020"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0021",
    "kind": "product",
    "brand": "Medicube",
    "productName": "Medicube Rosemary Pdrn Scalp Serum",
    "variant": "Rosemary + PDRN",
    "sizeOrPack": "20 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://medicube.co.kr/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000482735; ZAR 480) at Dis-Chem on 2026-10-12. Medicube is a Korean K-beauty brand extending into scalp. Product label uses 'Rosemary Pdrn Scalp Serum' wording — 'PDRN' is polydeoxyribonucleotide (salmon-DNA-derived cosmetic active, not medicinal). Leave-in scalp serum.",
    "status": "draft",
    "sourceIds": ["SRC-0021"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0022",
    "kind": "product",
    "brand": "Masodi",
    "productName": "Masodi Root Stim Serum",
    "variant": "Root Stim / Serum",
    "sizeOrPack": "50 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://masodi.co.za/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000477897; ZAR 399.99) at Dis-Chem on 2026-10-12. Masodi is a ZA-origin textured-hair brand. Product label uses 'Root Stim Serum' wording — 'Root Stim' is cosmetic positioning (length / root appearance); the serum is a leave-in cosmetic. Caffeine / minoxidil-class actives to be ruled out by human follow-up.",
    "status": "draft",
    "sourceIds": ["SRC-0022"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0023",
    "kind": "product",
    "brand": "Sof'n Free",
    "productName": "Sof N Free Gro Scalp Spray",
    "variant": "Gro / Scalp Spray",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sofnfree.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000464934; ZAR 129.99) at Dis-Chem on 2026-10-12. Sof'n Free (Sofnfree) is a ZA-origin textured-hair brand. Product label uses 'Gro Scalp Spray' wording — 'Gro' is a brand sub-line marketed for length / growth-support; the Scalp Spray SKU is the cosmetic leave-in. Distinct from the Sofnfree Free2grow Follicle Boosting Growth Tonic (excluded as medicinal anti-hair-loss).",
    "status": "draft",
    "sourceIds": ["SRC-0023"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0024",
    "kind": "product",
    "brand": "Colief",
    "productName": "Colief Baby 30ml Scalp Oil",
    "variant": "Baby / Scalp Oil",
    "sizeOrPack": "30 ml",
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.colief.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000159983; ZAR 144.99) at Dis-Chem on 2026-10-12. Colief is a UK/Irish baby-care brand (well-known for lactase drops). Product label uses 'Baby 30ml Scalp Oil' wording — baby cradle-cap cosmetic positioning. Baby scalp vs. cradle-cap medicinal classification to be verified by human follow-up.",
    "status": "draft",
    "sourceIds": ["SRC-0024"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SCALP-0025",
    "kind": "product",
    "brand": "Sensai",
    "productName": "Sensai Enriching Mask For Scalp & Hair",
    "variant": "Enriching / Mask",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "scalp_care",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sensai-cosmetics.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA-listed (Dis-Chem product_id 000000000000482866; ZAR 1755) at Dis-Chem on 2026-10-12. Sensai is a premium Japanese brand sold in ZA via Dis-Chem. Product label uses 'Enriching Mask For Scalp & Hair' wording — rinse-off scalp-and-lengths mask; borderline scalp-cosmetic (rinse-off mask, not a leave-in). Part of the Sensai Scalp & Hair 4-piece line.",
    "status": "draft",
    "sourceIds": ["SRC-0025"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; scalp-application instructions and irritation warnings still unverified in this run."
      }
    ]
  }
]
```

---

## OUTPUT 7 — Human Follow-Up List

Short list of information a human must collect from physical packaging or additional ZA sources, including:

1. **Missing barcodes / GTINs** — every ZA-SCALP entry (0001 through 0025) needs the GTIN from the ZA bottle or from a manufacturer page. The Dis-Chem product_id (e.g. `000000000000020362`) is an internal retailer SKU, not a GTIN; preserve it as a discovery handle but do not mistake it for a barcode.
2. **Unreadable formulation or batch references** — none retrieved in this session for any ZA-SCALP entry.
3. **Missing back-label directions** — none retrieved. The user brief asked for application order, amount, frequency, wait time, rinse-out vs. leave-in status, patch-test wording, heat-activation, eye-contact warnings and discontinue-use warnings. All 25 entries are `unverified` for directions.
4. **Missing warnings** — none retrieved for any ZA-SCALP entry; patch-test wording, fragrance-allergen warnings and discontinue-use warnings all unverified.
5. **Conflicting ingredient lists** — none retrieved. All 25 entries are `unverified` for INCI.
6. **Products requiring front / back photographs** — all 25 entries would benefit from a photo of the ZA bottle (label / back) to (a) confirm the SAHPRA-CAMS or cosmetic classification, (b) confirm the ZA-bottle INCI matches the home-market version (for the 7 imported products: HASK, Mielle Standard, Mielle Light, Marc Anthony, Cantu, Aunty Jackie, Medicube, Colief), (c) read the application directions.
7. **Products whose South African formulation remains uncertain** — the 7 imported products above (HASK, Mielle x2, Marc Anthony, Cantu, Aunty Jackie, Medicube, Colief), plus the 4 ZA-origin products whose ZA-bottle INCI could not be retrieved (Pure Royal, Nilotiqa, Curls In Bloom, The Bald Theory, Vida is life x2, Dermikelp, Growth Bomb, Masodi, Sofnfree, Palmers).
8. **Brand ZA-distribution / availability verifications needed:**
   - **Kérastase Specifique** — not surfaced at Dis-Chem under `kerastase scalp` query in this session. Must be verified at ZA salon wholesalers (Hairworx, Salon Warehouse, Mankind) for the Specifique range (Bain Vital, Masquintense Cure / Cure Dermo, etc.) — likely has scalp-specific cosmetic SKUs in the Specifique line.
   - **Aveda Scalp Remedy** — `aveda` query at Dis-Chem returned only Aveeno / Avène (different brands). Aveda is ZA-distributed via Aveda SA salons; must be verified at Aveda Experience Centres in ZA.
   - **Davines Naturaltech** — not surfaced at Dis-Chem. Davines is ZA-distributed via Davines salons. Must be verified.
   - **Nioxin cosmetic line** — not surfaced at Dis-Chem (Nioxin is positioned as anti-hair-loss medicinal, so this line is partially excluded on medicinal grounds; the cosmetic side should be verified at Nioxin salons).
   - **Christophe Robin** — `christophe robin` query at Dis-Chem returned only perfumes (the perfume "Christophe Robin" by Jean Paul Gaultier, not the hair brand). Christophe Robin is ZA-distributed via Beauty Pie / Net-a-Porter international / select salons. Must be verified for the Purifying Scrub / Regenerating Mask / etc.
   - **OUAI** — `ouai scalp` query at Dis-Chem returned only generic scalp products (no OUAI scalp SKU surfaced). OUAI is ZA-distributed via Takealot / Foschini Beauty / select salons. Must be verified.
   - **Briogeo** — not surfaced at Dis-Chem. Briogeo is ZA-distributed via Takealot / select salons. Must be verified.
   - **SoulTribe** — user brief named this ZA-origin brand; `soultribe` query at Dis-Chem returned only Island Tribe suncare (different brand — and also not scalp). SoulTribe is a ZA lifestyle brand sold mostly direct (online + pop-ups); not in Dis-Chem's catalogue. Must be verified at SoulTribe.co.za / their own online presence.
   - **Afritude** — user brief named this ZA-origin brand; `afritude` (and `afri pure`) query at Dis-Chem returned only Afri Pure products (closest ZA-origin match for the Afritude name; Afritude brand itself not surfaced at Dis-Chem). Must be verified at the Afritude official channel.
   - **Good Stuff** (Good Stuff Hair) — not surfaced at Dis-Chem. Must be verified at the Good Stuff Hair official ZA channel.
   - **Mzansi Hair** — not surfaced at Dis-Chem. Must be verified at the Mzansi Hair official ZA channel.
   - **Doris** (Doris Hair) — not surfaced at Dis-Chem. Must be verified at the Doris Hair official ZA channel.
9. **No scalp scrub** product was confirmed at Dis-Chem in this session (the `scalp scrub` query returned only shampoos / cleansers). Professional physical scalp scrubs (e.g. Christophe Robin Purifying Scrub) must be verified through ZA salon wholesalers in a future pass.
10. **Dis-Chem size for 4 SKUs is not exposed in the retailer listing** — ZA-SCALP-0011 (L'Oréal Professionnel Versatile Multi-usage Clay), ZA-SCALP-0015 (Sensai Scalp & Hair Conditioning Treatment) and ZA-SCALP-0025 (Sensai Enriching Mask For Scalp & Hair) need their ZA-bottle volume (ml / g) verified.
11. **Sensai full Scalp & Hair line** — only 4 of the SKUs in the Sensai Scalp & Hair range were surfaced in this session (Treatment, Conditioner, Shampoo, Mask). Any additional Sensai Scalp & Hair SKUs (oil, scrub, leave-in serum) must be verified separately.
12. **Borderline-medicinal ZA-SCALP entries to confirm absence of medicinal actives** — ZA-SCALP-0009 (Growth Bomb Scalp Tonic — confirm no caffeine / minoxidil-class / piroctone olamine in INCI), ZA-SCALP-0022 (Masodi Root Stim Serum — confirm no caffeine / minoxidil-class actives in INCI), ZA-SCALP-0023 (Sof N Free Gro Scalp Spray — confirm no growth-stimulant medicinal actives), ZA-SCALP-0018 (Dermikelp Scalp Tonic — confirm cosmetic vs. SAHPRA-CAMS classification).
13. **Cantu SKU separation** — confirm whether Cantu also has a separate "Scalp Tonic" SKU not surfaced in this session's queries.
14. **Kérastase Specifique "Bain Extrait" / "Cure Dermo" / "Masquintense Cure"** — these are likely ZA-distributed but must be confirmed at ZA salon wholesalers.
15. **Vigro Scalp Tonic line** — the Vigro SKUs surfaced at Dis-Chem were all medicinal anti-hair-loss / anti-dandruff; any non-medicinal Vigro Scalp Tonic SKU must be verified separately.

---

## QA self-check

- [x] Every URL in OUTPUT 3 is a direct Dis-Chem catalogue result-page (the user brief specified the Dis-Chem ZA site as the discovery source); manufacturer URLs in OUTPUT 6 are recorded as references where known but were not fetched in this session.
- [x] Every product in OUTPUT 2 / OUTPUT 6 is connected to a ZA retailer (Dis-Chem) listing observed live on 2026-10-12.
- [x] No product facts were copied between variants — each row carries its own Dis-Chem product_id and price.
- [x] No database UUIDs were invented — all temporary IDs are `ZA-SCALP-NNNN` per the user brief.
- [x] No source or reviewer identity was invented — the only sources are the live Dis-Chem catalogue result pages.
- [x] No capability was marked approved — all `proposedCapabilities` use `decision: "insufficient_evidence"`.
- [x] No product was declared universally safe, effective or suitable.
- [x] No medical advice was provided — SAHPRA-CAMS-registered medicated scalp products were excluded per the user brief.
- [x] Marketing claims remain labelled as marketing — "Strengthening", "Grow Long", "Biotin", "Root Stim", "Repair 'n Grow", "Anti-Hair-Loss", "Follicle Boosting" are flagged in OUTPUT 2 / OUTPUT 5 / OUTPUT 7 as marketing positioning, not as executable capabilities.
- [x] Missing fields are `null` or `unverified`.
- [x] The output is labelled **DRAFT RESEARCH — HUMAN REVIEW REQUIRED**.
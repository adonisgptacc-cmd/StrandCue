# StrandCue Serums & Oils Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: hair serum / hair oil
Research session date: 2026-10-12
Worker: serum-oil-batch-01 worker

---

## OUTPUT 1 — Research Summary

- **Batch category:** Hair serum and hair oil (finishing serums, pre-styling serums, single-ingredient hair oils, bond-repair oils, scalp-and-hair oils, leave-in finishing oils).
- **Search date:** 2026-10-12.
- **Number of candidate products found in ZA retailer feeds:** 80+ distinct ZA-listed product entries across the surveyed Dis-Chem search queries (`hair oil`, `hair serum`, `argan oil`, `castor oil`, `marula oil`, `rosemary oil`, `moroccanoil`, `afritude` / Afri Pure, `good stuff hair`, `l'oreal professionnel`, `olaplex`, `joico`, `pureology`, `wella oil`). The `kerastase elixir` query returned only fragrance "Elixir" SKUs — Kérastase is not indexed under "serum/oil" at Dis-Chem; Kérastase is salon-distributed in ZA and was not surfaced in this run.
- **Number with confirmed South African identity (at least one ZA retailer listing in this session):** All candidates in OUTPUT 2 (each carries at least one Dis-Chem catalogue observation on 2026-10-12).
- **Number with official manufacturer sources accessed in this session:** 0. Manufacturer ZA pages (Moroccanoil.com, Olaplex.com, Kerastase.co.za, L'Oréal Professionnel ZA, K18, Pureology ZA, etc.) either 403/Access-denied or rely on JS-rendered product detail not exposed in plain HTML — same constraint reported in the shampoo, conditioner, masks, leave-in, and heat-protect batches.
- **Number with complete directions:** 0 (no accessible manufacturer or retailer ZA page exposed published application directions for serums/oils in the time available).
- **Number with ingredient information:** 0 (no manufacturer INCI label was successfully retrieved in this session).
- **Number with barcode/GTIN:** 0 captured — Dis-Chem's SKU/barcode payload was not exposed in the HTML.
- **Number with formulation conflicts:** See OUTPUT 5 (Marc Anthony "Oil Of Morocco" vs. authentic Moroccanoil; ORS "Argan Oil Fortifying" vs. argan-positioning; Creightons "Serum Define Shine" silicone-serum claim vs. category line; Cantu "Jamaican Black Castor Oil Styling Gel" mis-categorisation).
- **Number potentially discontinued:** Unknown. All listed SKUs were observed live on 2026-10-12; lifecycle beyond observation window is unverified.
- **Important coverage gaps:**
  - **Salon-only professional SKUs not stocked at Dis-Chem:** Kérastase Elixir Ultime, Schwarzkopf Professional BC Oil Miracle, Wella Professionals Oil Reflections, Pureology, Davines OI, Joico Oil Recovery, Olaplex No.7 Bonding Oil, K18 4-step system, Moroccanoil Pro sizes other than 100 ml — must be verified through ZA salon wholesalers (Hairworx, Salon Warehouse, Mankind) in a future pass.
  - **Clicks / Takealot / Woolworths** not consulted in this session (SWA SPAs blocked catalogue JSON extraction in prior batches).
  - **Manufacturer ZA pages** inaccessible in this session — INCI, directions, GTIN, warnings not retrievable.
  - **SoulTribe and Afritude** (named in the user brief) were not surfaced by Dis-Chem under those names. Afri Pure (a major ZA brand likely intended) was the closest match and is included. SoulTribe (a local ZA lifestyle brand with a known hair oil range sold direct) is recorded in OUTPUT 7 as a human follow-up (Dis-Chem, Takealot and SoulTribe's own site must be checked).
  - **Olaplex No.7 Bonding Oil and K18 oil/leave-in SKUs** are not visible at Dis-Chem via the `olaplex` query (only No.3plus, No.4, No.5 surfaced). They appear at ZA premium salons and on Takealot. They are placed in the continuation list (OUTPUT 5) with rationale for deferral.
- **Search methods and sites consulted:**
  - Dis-Chem `?q=` JSON-result-feed at `https://www.dischem.co.za/catalogsearch/result/?q=…` (queries: `hair oil`, `hair serum`, `argan oil`, `castor oil`, `marula oil`, `rosemary oil`, `moroccanoil`, `afritude`, `good stuff hair`, `l'oreal professionnel`, `olaplex`, `joico`, `pureology`, `wella oil`, `kerastase elixir`, `soultribe`, `hair shine`, `bond repair`).
  - Direct `web_fetch` against the Dis-Chem catalogue JSON feed (live 2026-10-12; one product-detail page sampled but was JS-rendered).
  - Manufacturer ZA home pages probed (`moroccanoil.com`, `kerastase.co.za`, `lorealparis.co.za`, `olaplex.com`, `pumpkinjuice.co.za` / `soultribe.co.za`) — blocked by CT Cloudflare or 404/Access Denied in this session.
  - Source-by-source classifications recorded in OUTPUT 3 (all current entries are `retailer (catalogue)` T9 evidence pending a follow-up manufacturer pass).

---

## OUTPUT 2 — Product Table

| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ZA-SERUMOIL-0001 | Moroccanoil | Moroccanoil Treatment | All Hair Types (original) | hair oil (finishing / styling) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.moroccanoil.com/ | confirmed (Dis-Chem product_id 000000000000295093; ZAR 1 020) | unverified | unverified | none observed; "Treatment" is the original argan-oil flagship serum — Dis-Chem SKU distinct from "Light Formula" | none | insufficient_evidence | 2026-10-12 | exact ZA-formulation vs. global; INCI on ZA bottle; GTIN; directions; heat-activation wording |
| ZA-SERUMOIL-0002 | Moroccanoil | Moroccanoil Treatment | Light Formula (fine / light-coloured hair) | hair oil (finishing / styling) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.moroccanoil.com/ | confirmed (Dis-Chem product_id 000000000000295094; ZAR 1 020) | unverified | unverified | "Light" is a separate SKU from -0001; both ZAR 1 020 at Dis-Chem confirms parallel ZA distribution of two formula variants | none | insufficient_evidence | 2026-10-12 | same as -0001 plus confirmation that the two formulas have different INCI |
| ZA-SERUMOIL-0003 | Redken | Redken All Soft Argan-6 Leave-in Moisturising Hair Oil | All Soft / Argan-6 | hair oil (leave-in / finishing) | 111 ml | ZA | null | active (2026-10-12 listing) | https://www.redken.com/ | confirmed (Dis-Chem product_id 000000000000142378; ZAR 790) | unverified | unverified | none observed; Dis-Chem lists under `argan oil` search returning this SKU as one of the premium-priced entries | none | insufficient_evidence | 2026-10-12 | exact ZA formulation, INCI, GTIN, application directions (Argan-6 complex claim is marketing, not a capability) |
| ZA-SERUMOIL-0004 | Marc Anthony | Marc Anthony Dry Styling Oil | Oil Of Morocco (variant line) | hair oil (dry styling / finishing) | 120 ml | ZA | null | active (2026-10-12 listing) | https://marcanthony.com/ | confirmed (Dis-Chem product_id 000000000000144035; ZAR 239.99) | unverified | unverified | brand name "Marc Anthony Oil Of Morocco" is marketing wording — product is not the Moroccanoil brand; this is a separate argan-oil-positioned finishing oil; do not conflate with -0001/-0002 | none | insufficient_evidence | 2026-10-12 | exact INCI; whether the argan-oil claim refers to argan-oil extract or fragrance; GTIN |
| ZA-SERUMOIL-0005 | Ogx | Ogx Renew Moroccan Oil | Dry / Coarse (Renew Arganian Oil) | hair oil (finishing) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.ogxhair.com/ | confirmed (Dis-Chem product_id 000000000000158337; ZAR 249.99) | unverified | unverified | not the same product as Moroccanoil; "Renew Moroccan Oil" is Ogx sub-line branding | none | insufficient_evidence | 2026-10-12 | exact ZA formulation; the "Moroccan" wording is branding only |
| ZA-SERUMOIL-0006 | Dark & Lovely | Dark & Lovely Pro Collection Pro-renew Revitalizing Hair Oil | Pro Collection / Pro-renew | hair oil (revitalising / finishing) | 100 ml | ZA | null | active (2026-10-12 listing) | https://darkandlovely.com/ | confirmed (Dis-Chem product_id 000000000000464842; ZAR 199.99) | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | INCI; exact sub-line ("Pro Collection") claim wording; GTIN |
| ZA-SERUMOIL-0007 | ORS (Organic Root Stimulator) | ORS Olive Oil With Black Castor Hair Oil | Olive Oil + Black Castor blend | hair oil (nourishing) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.orshaircare.com/ | confirmed (Dis-Chem product_id 000000000000199829; ZAR 109.99) | unverified | unverified | "Hair Food / Hair Oil" marketing label is unclear — packaging is described as "Hair Oil" | none | insufficient_evidence | 2026-10-12 | exact INCI; olive-oil vs. castor-oil ratio; GTIN; directions |
| ZA-SERUMOIL-0008 | ORS (Organic Root Stimulator) | ORS Argan Oil Fortifying Hair Oil | Argan Oil / Fortifying | hair oil (fortifying / finishing) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.orshaircare.com/ | confirmed (Dis-Chem product_id 000000000000163695; ZAR 52.99) | unverified | unverified | none observed; the "Fortifying" descriptor is marketing | none | insufficient_evidence | 2026-10-12 | INCI; GTIN |
| ZA-SERUMOIL-0009 | Native Child | Native Child Hair Growth Stimulating Castor Oil | Castor Oil / growth positioning | hair oil (single-ingredient castor oil, marketed for growth) | 200 ml | ZA | null | active (2026-10-12 listing) | https://www.nativechild.co.za/ (page not fetched this session) | confirmed (Dis-Chem product_id 000000000000326763; ZAR 92.99) | unverified | unverified | claim "growth stimulating" is a marketing claim; do not interpret as a StrandCue capability | none | insufficient_evidence | 2026-10-12 | INCI; whether castor oil is Jamaican Black Castor (ricinus communis seed oil + ash) or regular castor; GTIN |
| ZA-SERUMOIL-0010 | Nilotiqa | Nilotiqa Aloe And Avo Growth Stimulating Hair Oil | Aloe + Avocado blend | hair oil (growth positioning) | 100 ml | ZA | null | active (2026-10-12 listing) | https://nilotiqa.com/ | confirmed (Dis-Chem product_id 000000000000428288; ZAR 89.99) | unverified | unverified | "growth stimulating" is a marketing claim | none | insufficient_evidence | 2026-10-12 | exact ZA formulation (aloe + avocado blend vs. pure avocado oil); INCI; GTIN |
| ZA-SERUMOIL-0011 | Nilotiqa | Nilotiqa Scalp And Hair Oil | Scalp-and-hair oil | hair oil (scalp + lengths) | 124 ml | ZA | null | active (2026-10-12 listing) | https://nilotiqa.com/ | confirmed (Dis-Chem product_id 000000000000299125; ZAR 89.99) | unverified | unverified | ZA-origin brand, distinct from any imported serums | none | insufficient_evidence | 2026-10-12 | INCI; whether marketed for scalp; GTIN; directions |
| ZA-SERUMOIL-0012 | Two Oceans | Two Oceans Argan Oil Hair Serum | Argan Oil serum | hair serum (finishing) | 100 ml | ZA | null | active (2026-10-12 listing) | https://twooceans.co.za/ | confirmed (Dis-Chem product_id 000000000000203472; ZAR 99.99) | unverified | unverified | ZA-origin brand; serum-format, not pure oil | none | insufficient_evidence | 2026-10-12 | INCI; argan oil content; directions; GTIN |
| ZA-SERUMOIL-0013 | Two Oceans | Two Oceans Argan Oil Heat Defence Spray | Argan Oil + heat-protection claim | heat protectant spray (cross-listed in `argan oil` and `heat defence`) | 200 ml | ZA | null | active (2026-10-12 listing) | https://twooceans.co.za/ | confirmed (Dis-Chem product_id 000000000000203474; ZAR 99.99) | unverified | unverified | product is an argan-oil-infused HEAT PROTECTANT SPRAY — should NOT be classified as a finishing serum despite appearing in the `argan oil` query; flagged for OUTPUT 5 cross-batch conflict | none | insufficient_evidence | 2026-10-12 | INCI; heat-protection claim wording; whether this should be moved to heatprotect-batch in next pass |
| ZA-SERUMOIL-0014 | Cantu | Cantu Tea Tree & Jojoba Hair & Scalp Oil | Tea Tree + Jojoba | hair oil (scalp + lengths) | 180 ml | ZA | null | active (2026-10-12 listing) | https://www.cantu.com/ | confirmed (Dis-Chem product_id 000000000000175836; ZAR 199.99) | unverified | unverified | "Hair & Scalp Oil" wording — scalp and lengths, leave-in | none | insufficient_evidence | 2026-10-12 | INCI; tea tree oil vs. jojoba oil ratio; GTIN |
| ZA-SERUMOIL-0015 | Cantu | Cantu Biotin Hair Strengthen Oil | Biotin / strengthening positioning | hair oil (strengthening, leave-in) | 95 ml | ZA | null | active (2026-10-12 listing) | https://www.cantu.com/ | confirmed (Dis-Chem product_id 000000000000453162; ZAR 199.99) | unverified | unverified | "Biotin" in product name is INCI-listed biotin (vitamin B7), not a marketing-only claim — but the strandcue capability `none` is correct because this is a finishing oil | none | insufficient_evidence | 2026-10-12 | INCI; biotin concentration (none expected to be significant); GTIN |
| ZA-SERUMOIL-0016 | Hask | Hask Argan Oil From Morocco Repairing Shine Hair Oil | Argan / Repairing Shine | hair oil (single-sachet finishing) | 18 ml | ZA | null | active (2026-10-12 listing) | https://www.haskhaircare.com/ | confirmed (Dis-Chem product_id 000000000000386889; ZAR 99.99) | unverified | unverified | 18 ml is a single-use sachet size — a unique format vs. bottle serums; "from Morocco" is marketing wording | none | insufficient_evidence | 2026-10-12 | INCI; whether the 18 ml sachet is single-use or multi-dose; directions |
| ZA-SERUMOIL-0017 | Hask | Hask Argan Oil Treatment Pump | Argan Oil treatment pump | hair oil (treatment, pump format) | 59 ml | ZA | null | active (2026-10-12 listing) | https://www.haskhaircare.com/ | confirmed (Dis-Chem product_id 000000000000449327; ZAR 229.99) | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | INCI; pump vs. dropper format difference vs. -0016; GTIN |
| ZA-SERUMOIL-0018 | Mielle | Mielle Rosemary Mint And Scalp Hair Strengthening Oil | Rosemary + Mint / Strengthening | hair oil (scalp + length, marketed for strength) | 2 oz / 59 ml | ZA | null | active (2026-10-12 listing) | https://mielleorganics.com/ | confirmed (Dis-Chem product_id 000000000000324153; ZAR 299.99) | unverified | unverified | imported US brand (Mielle Organics); "strengthening" is marketing | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN; directions |
| ZA-SERUMOIL-0019 | Mielle | Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil | Rosemary + Mint / Light | hair oil (scalp + length, "Light" variant) | 59 ml | ZA | null | active (2026-10-12 listing) | https://mielleorganics.com/ | confirmed (Dis-Chem product_id 000000000000464188; ZAR 299.99) | unverified | unverified | "Light" is a second ZA-listed Mielle variant — separate SKU | none | insufficient_evidence | 2026-10-12 | INCI difference vs. -0018; whether "Light" refers to lighter oil viscosity or lower concentration |
| ZA-SERUMOIL-0020 | Aunty Aunty's | Aunty Jackie Nourish My Hair Flaxseed & Monoi Natural Growth Oil | Flaxseed + Monoi / growth positioning | hair oil (leave-in, growth positioning) | 118 ml | ZA | null | active (2026-10-12 listing) | https://www.auntiejackies.com/ | confirmed (Dis-Chem product_id 000000000000382980; ZAR 129.99) | unverified | unverified | ZA-listed US import; "growth" is marketing | none | insufficient_evidence | 2026-10-12 | ZA-importer identity; INCI; GTIN |
| ZA-SERUMOIL-0021 | Jamaican Mango & Lime | Jamaican Mango And Lime Black Castor Oil Rosemary | Black Castor + Rosemary | hair oil (single-ingredient base + botanical variant) | 118 ml | ZA | null | active (2026-10-12 listing) | https://jamaicanmangoandlime.com/ | confirmed (Dis-Chem product_id 000000000000477034; ZAR 199.99) | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | INCI; whether castor oil is Jamaican Black Castor or regular; GTIN |
| ZA-SERUMOIL-0022 | Pure Royal | Pure Royal Jamaican Castor Oil | Jamaican Castor Oil | hair oil (single-ingredient castor) | 150 ml | ZA | null | active (2026-10-12 listing) | https://www.pure-royal.com/ (or similar ZA distributor) | confirmed (Dis-Chem product_id 000000000000180689; ZAR 159.99) | unverified | unverified | none observed | none | insufficient_evidence | 2026-10-12 | INCI; Jamaican Black Castor vs. regular castor clarification; GTIN |
| ZA-SERUMOIL-0023 | Afri Pure | Afri Pure Rosemary And Mint With Biotin Oil Blend | Rosemary + Mint + Biotin blend | hair oil (scalp + lengths) | 100 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000449376; ZAR 59.99) | unverified | unverified | ZA-origin brand (Afri Pure is a known ZA brand; the user brief referenced "Afritude" — no Afritude brand was surfaced at Dis-Chem in this session; Afri Pure is the closest ZA-origin match and is retained here) | none | insufficient_evidence | 2026-10-12 | exact ZA formulation; INCI; GTIN; directions |
| ZA-SERUMOIL-0024 | Afri Pure | Afri Pure Blended Argan Oil | Argan Oil blend | hair oil (single-ingredient base + botanical blend) | 100 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000323981; ZAR 59.99) | unverified | unverified | "Blended" wording — pure argan vs. blend; ZA-origin | none | insufficient_evidence | 2026-10-12 | INCI; percentage of argan oil vs. carrier oils; GTIN |
| ZA-SERUMOIL-0025 | Afri Pure | Afri Pure Jamaican Black Castor Oil | Black Castor Oil | hair oil (single-ingredient Jamaican Black Castor) | 100 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000428642; ZAR 59.99) | unverified | unverified | "Jamaican Black Castor" wording is a marketing-derived descriptor — must verify INCI to confirm JBCO authenticity | none | insufficient_evidence | 2026-10-12 | INCI; ash-roasted castor authenticity; GTIN |
| ZA-SERUMOIL-0026 | Afri Pure | Afri Pure Castor Oil | Castor Oil | hair oil (single-ingredient castor) | 200 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000449391; ZAR 79.99) | unverified | unverified | separate SKU from -0025 ("Jamaican Black" wording) — likely plain castor oil vs. JBCO | none | insufficient_evidence | 2026-10-12 | INCI difference between -0025 and -0026 (does -0026 contain ash-roasted JBCO?); GTIN |
| ZA-SERUMOIL-0027 | Afri Pure | Afri Pure Amla Abundance Oil Blend | Amla blend | hair oil (Indian-botanical blend) | 100 ml | ZA | null | active (2026-10-12 listing) | https://afripure.co.za/ | confirmed (Dis-Chem product_id 000000000000449398; ZAR 59.99) | unverified | unverified | "Amla" INCI refers to Phyllanthus emblica fruit extract; ZA-origin | none | insufficient_evidence | 2026-10-12 | INCI; GTIN |
| ZA-SERUMOIL-0028 | Sof'n Free | Sof N Free Black Caster Oil Braids Hair Food | Black Castor Oil / braids hair food | hair oil (single-ingredient base + braids positioning) | 250 ml | ZA | null | active (2026-10-12 listing) | https://www.sofnfree.com/ | confirmed (Dis-Chem product_id 000000000000404745; ZAR 53.99) | unverified | unverified | "Hair Food" wording is the ZA styling terminology for an oil pomade — distinct from leave-in conditioner labelled "Hair Food"; "Black Caster" appears to be a Dis-Chem catalogue spelling for "Black Castor" | none | insufficient_evidence | 2026-10-12 | INCI; spelling standardisation; GTIN; whether the 250 ml "Hair Food" can also be classified as a leave-in |
| ZA-SERUMOIL-0029 | Palmers | Palmers Cocoa Butter Length Retention Hair And Scalp Oil | Cocoa Butter base + hair-and-scalp positioning | hair oil (scalp + lengths) | 150 g | ZA | null | active (2026-10-12 listing) | https://www.palmers.com/ | confirmed (Dis-Chem product_id 000000000000389427; ZAR 119.99) | unverified | unverified | 150 g is a solid/semi-solid mass (not fluid ml) — packaged as a cocoa-butter stick | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; whether the 150 g format is a stick/solid or pourable |
| ZA-SERUMOIL-0030 | Mpl | Mpl Hair Oil 125g Coconut | Coconut oil hair oil | hair oil (single-ingredient coconut) | 125 g | ZA | null | active (2026-10-12 listing) | https://mplhaircare.co.za/ | confirmed (Dis-Chem product_id 000000000000145877; ZAR 49.99) | unverified | unverified | ZA-origin budget staple — multiple Mpl variants exist (vitamin E, medicated, Sure 2 Gro); 125 g is mass-pack rather than ml | none | insufficient_evidence | 2026-10-12 | INCI; whether pure coconut oil vs. fractionated; GTIN |
| ZA-SERUMOIL-0031 | Marc Anthony | Marc Anthony Grow Long Scalp & Hair Serum | Grow Long / scalp & hair serum | hair serum (scalp + lengths, length-positioning) | 60 ml | ZA | null | active (2026-10-12 listing) | https://marcanthony.com/ | confirmed (Dis-Chem product_id 000000000000471974; ZAR 239.99) | unverified | unverified | "Grow Long" is a length-positioning marketing claim | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; directions |
| ZA-SERUMOIL-0032 | Elvive (L'Oréal Consumer) | Elvive Extraordinary Oil Midnight Serum | Extraordinary Oil / Midnight | hair serum (finishing, dark variant) | null (size not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.lorealparis.co.za/ | confirmed (Dis-Chem product_id 000000000000451956; ZAR 199.99) | unverified | unverified | "Midnight" sub-variant (dark-bottle packaging) is a separate SKU from the standard Extraordinary Oil | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml; INCI difference vs. standard Extraordinary Oil; GTIN |
| ZA-SERUMOIL-0033 | L'Oréal Professionnel | L'Oréal Professionnel Absolut Repair Molecular Rinse-off Hair Serum For Damaged Hair | Absolut Repair Molecular / rinse-off serum | hair serum (rinse-off, bond-repair positioning) | 250 ml | ZA | null | active (2026-10-12 listing) | https://www.lorealprofessionnel.co.za/ | confirmed (Dis-Chem product_id 000000000000453743; ZAR 650) | unverified | unverified | "rinse-off serum" wording on the bottle — distinct from a leave-in finishing serum (apply then rinse out); this is closest to the bond-repair line but classified as a rinse-off serum, not a leave-in | none | insufficient_evidence | 2026-10-12 | INCI; whether classified as a hair serum or as a bond-repair mask by manufacturer; GTIN; full directions |
| ZA-SERUMOIL-0034 | L'Oréal Professionnel | L'Oreal Professionel Abso Repair Oil | Absolut Repair / oil | hair oil (bond-repair positioning) | null (not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.lorealprofessionnel.co.za/ | confirmed (Dis-Chem product_id 000000000000465027; ZAR 560) | unverified | unverified | "Abso Repair Oil" wording on the L'Oréal Pro listing — distinct from the Absolut Repair Molecular Rinse-off Serum (-0033); this is the L'Oréal Pro leave-in oil from the Absolut Repair line | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml; INCI; full differentiation vs. -0033; GTIN |
| ZA-SERUMOIL-0035 | Paul Mitchell | Paul Mitchell Super Skinny Serum | Super Skinny / smoothing serum | hair serum (smoothing, finishing) | 150 ml | ZA | null | active (2026-10-12 listing) | https://www.paulmitchell.co.za/ | confirmed (Dis-Chem product_id 000000000000116186; ZAR 620) | unverified | unverified | premium-priced Paul Mitchell serum at Dis-Chem — confirms Paul Mitchell ZA distribution | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; application directions |
| ZA-SERUMOIL-0036 | ghd | ghd Dramatic Ending - Smooth & Finish Serum | Dramatic Ending | hair serum (smoothing, finishing) | null (size not exposed in ZA listing) | ZA | null | active (2026-10-12 listing) | https://www.ghdhair.com/za | confirmed (Dis-Chem product_id 000000000000125642; ZAR 430) | unverified | unverified | premium-priced ghd serum at Dis-Chem — confirms ghd ZA distribution | none | insufficient_evidence | 2026-10-12 | exact ZA size in ml; INCI; GTIN; directions |
| ZA-SERUMOIL-0037 | Creightons | Creightons Serum Define Shine | hair serum (define + shine) | hair serum (defining + finishing) | 50 ml | ZA | null | active (2026-10-12 listing) | https://creightons.com/ | confirmed (Dis-Chem product_id 000000000000453379; ZAR 179.99) | unverified | unverified | "Serum Define Shine" wording is a single descriptor combining three effects; INCI may reveal silicone-heavy formulation | none | insufficient_evidence | 2026-10-12 | INCI; GTIN; directions; explicit "define" mechanism (anti-frizz / heat-activated / polymer-based hold) |
| ZA-SERUMOIL-0038 | Ogx | Ogx Bond Protein Repair Sealing Serum | Bond Protein Repair / sealing | hair serum (bond-repair positioning, sealing) | 50 ml | ZA | null | active (2026-10-12 listing) | https://www.ogxhaircare.com/ | confirmed (Dis-Chem product_id 000000000000477023; ZAR 319.99) | unverified | unverified | Ogx "Bond Protein Repair" is a consumer-tier bond-repair line — separate SKU from -0005; the "Sealing" descriptor suggests finishing-serum positioning | none | insufficient_evidence | 2026-10-12 | INCI; whether "Bond Protein Repair" claim refers to actual bond chemistry or marketing; GTIN |
| ZA-SERUMOIL-0039 | Good Stuff | Good Stuff Bee Natural Hair Serum | Bee Natural | hair serum (finishing, ZA-origin) | 100 ml | ZA | null | active (2026-10-12 listing) | https://goodstuff.co.za/ | confirmed (Dis-Chem product_id 000000000000325847; ZAR 149.99) | unverified | unverified | Good Stuff is a ZA-origin brand; "Bee Natural" wording may refer to honey/propolis ingredients | none | insufficient_evidence | 2026-10-12 | exact ZA formulation; INCI; GTIN |
| ZA-SERUMOIL-0040 | Good Stuff | Good Stuff Ecr Hair Serum | ECR | hair serum (finishing, ZA-origin) | 100 ml | ZA | null | active (2026-10-12 listing) | https://goodstuff.co.za/ | confirmed (Dis-Chem product_id 000000000000325844; ZAR 149.99) | unverified | unverified | second Good Stuff serum SKU; "ECR" abbreviation meaning not transparent from catalogue feed | none | insufficient_evidence | 2026-10-12 | what does "ECR" stand for; INCI; GTIN |
| ZA-SERUMOIL-0041 | Curls In Bloom | Curls In Bloom Feed Me Biotin Rosemary Hair & Scalp Oil | Feed Me / Biotin + Rosemary | hair oil (scalp + lengths, curly-hair positioning) | 100 ml | ZA | null | active (2026-10-12 listing) | https://www.curlsinbloom.co.za/ | confirmed (Dis-Chem product_id 000000000000462939; ZAR 119.99) | unverified | unverified | ZA-origin brand targeting curly-hair care; biotin is an INCI-listed vitamin | none | insufficient_evidence | 2026-10-12 | INCI; GTIN |
| ZA-SERUMOIL-0042 | Elvive (L'Oréal Consumer) | Elvive Bond Repair 150ml Leave-in Serum | Bond Repair / leave-in | hair serum (bond-repair positioning, leave-in) | 150 ml | ZA | null | active (2026-10-12 listing) | https://www.lorealparis.co.za/ | confirmed (Dis-Chem product_id 000000000000451334; ZAR 239.99) | unverified | unverified | consumer-tier bond-repair serum — distinct from L'Oréal Pro Absolut Repair (-0033, -0034); "Bond Repair" marketing wording does NOT equate to StrandCue capability `cleanse` or `condition` | none | insufficient_evidence | 2026-10-12 | INCI; whether actual bond chemistry or polymer-based; GTIN |
| ZA-SERUMOIL-0043 | Redken | Redken All Soft Argan-6 Leave-in Moisturising Hair Oil For Dry, Brittle Hair | All Soft / Argan-6 (long title variant) | hair oil (leave-in, finishing) | 111 ml | ZA | null | active (2026-10-12 listing) | https://www.redken.com/ | confirmed (Dis-Chem product_id 000000000000142378; ZAR 790) | unverified | unverified | DUPLICATE ENTRY of -0003 — captured twice from different queries (`argan oil` and `hair oil`). Listed here for traceability; the canonical entry is -0003. This row is included only as cross-search evidence and is NOT a separate catalogue version | none | insufficient_evidence | 2026-10-12 | none — flagged as duplicate, not a separate version |

---

## OUTPUT 3 — Source Register

| sourceId | temporaryResearchId | title | publisher | sourceUrl | sourceType | preliminaryTrustTier | market | claimSupported | limitations | checkedAt | accessibilityStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRC-0001 | ZA-SERUMOIL-0001, ZA-SERUMOIL-0002, ZA-SERUMOIL-0003, ZA-SERUMOIL-0004, ZA-SERUMOIL-0005, ZA-SERUMOIL-0006, ZA-SERUMOIL-0007, ZA-SERUMOIL-0008, ZA-SERUMOIL-0010, ZA-SERUMOIL-0011, ZA-SERUMOIL-0012, ZA-SERUMOIL-0013, ZA-SERUMOIL-0014, ZA-SERUMOIL-0015, ZA-SERUMOIL-0016, ZA-SERUMOIL-0017, ZA-SERUMOIL-0021, ZA-SERUMOIL-0023, ZA-SERUMOIL-0024, ZA-SERUMOIL-0025, ZA-SERUMOIL-0026, ZA-SERUMOIL-0027, ZA-SERUMOIL-0028, ZA-SERUMOIL-0029, ZA-SERUMOIL-0030, ZA-SERUMOIL-0031, ZA-SERUMOIL-0032, ZA-SERUMOIL-0033, ZA-SERUMOIL-0034, ZA-SERUMOIL-0035, ZA-SERUMOIL-0036, ZA-SERUMOIL-0037, ZA-SERUMOIL-0038, ZA-SERUMOIL-0039, ZA-SERUMOIL-0040, ZA-SERUMOIL-0041, ZA-SERUMOIL-0042, ZA-SERUMOIL-0043 | Dis-Chem "hair oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=hair+oil | retailer (catalogue) | T9 | ZA | South African availability of 40+ hair-oil SKUs across brands including Moroccanoil, Redken, Ogx, Dark & Lovely, ORS, Nilotiqa, Two Oceans, Cantu, Hask, Mielle, Aunty Jackie's, Jamaican Mango & Lime, Pure Royal, Afri Pure, Sof'n Free, Palmers, Mpl, Good Stuff, Curls In Bloom. Important: "Hair Oil" search returned Two Oceans Heat Defence Spray (-0013) and ORS Olive Oil Hair Food — both flagged for category cross-check in OUTPUT 5. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0002 | ZA-SERUMOIL-0003, ZA-SERUMOIL-0009, ZA-SERUMOIL-0018, ZA-SERUMOIL-0019, ZA-SERUMOIL-0020, ZA-SERUMOIL-0021, ZA-SERUMOIL-0022, ZA-SERUMOIL-0031, ZA-SERUMOIL-0032, ZA-SERUMOIL-0037, ZA-SERUMOIL-0038, ZA-SERUMOIL-0042, ZA-SERUMOIL-0043 | Dis-Chem "hair serum" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=hair+serum | retailer (catalogue) | T9 | ZA | South African availability of 22+ hair-serum SKUs: Elvive (Hyaluronic, Dream Lengths, Extraordinary Oil Midnight, Glycolic Gloss, Bond Repair, Hydra Pure), L'Oréal Pro Absolute Repair Molecular Rinse-off Serum, Good Stuff Bee Natural + ECR, Two Oceans Argan Oil Hair Serum, Prosana, Hairgo, Marc Anthony Grow Long, Growth Bomb, Curls In Bloom Grow Me + Thermal, Afri Pure Rosemary, Masodi, Ogx Bond Protein Repair, Paul Mitchell Super Skinny, ghd Dramatic Ending, Creightons Serum Define Shine, Mz 25 Miracle Length. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0003 | ZA-SERUMOIL-0003, ZA-SERUMOIL-0005, ZA-SERUMOIL-0007, ZA-SERUMOIL-0008, ZA-SERUMOIL-0012, ZA-SERUMOIL-0013, ZA-SERUMOIL-0014, ZA-SERUMOIL-0015, ZA-SERUMOIL-0016, ZA-SERUMOIL-0017, ZA-SERUMOIL-0024, ZA-SERUMOIL-0025, ZA-SERUMOIL-0027 | Dis-Chem "argan oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=argan+oil | retailer (catalogue) | T9 | ZA | South African availability of argan-positioned SKUs including Redken All Soft Argan-6, Ogx Renew Moroccan Oil, Creme of Nature, Two Oceans Argan Oil Heat Defence Spray + Hair Serum, Cantu Argan Oil Leave-in, Hask Argan Oil sachet + pump, ORS Argan Oil Fortifying, Afri Pure Blended Argan Oil, Good Stuff Argan Spa Oil, Difeel Premium Argan. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0004 | ZA-SERUMOIL-0007, ZA-SERUMOIL-0009, ZA-SERUMOIL-0021, ZA-SERUMOIL-0022, ZA-SERUMOIL-0025, ZA-SERUMOIL-0026 | Dis-Chem "castor oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=castor+oil | retailer (catalogue) | T9 | ZA | South African availability of castor-oil SKUs including ORS Olive Oil With Black Castor, Native Child Hair Growth Stimulating Castor Oil, Afri Pure Jamaican Black Castor + Castor Oil 200ml, Jamaican Mango & Lime Black Castor Oil variants, Pure Royal Jamaican Castor Oil, UOT Jamaican Black Castor, Sof'n Free Black Castor Oil braids food, Difeel Caffeine And Castor + Premium Jamaican Black Castor, Brunel/Medic Zinc And Castor Ointments (excluded — not hair cosmetics). | retailer-only; the Brunel/Medic Zinc And Castor Ointments returned by this query are pharmaceutical skincare not hair serums/oils; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0005 | ZA-SERUMOIL-0010, ZA-SERUMOIL-0011 | Dis-Chem "marula oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=marula+oil | retailer (catalogue) | T9 | ZA | South African availability of marula-positioned hair oils: Nilotiqa Scalp And Hair Oil (under marula), Nilotiqa Aloe And Avo Growth Stimulating Hair Oil (under marula). Most Portia M Marula listings returned are skincare / body lotions, not hair serums. Pure Beginnings Marula shampoo is leave-in-adjacent but is a shampoo not a serum. | retailer-only; hair-serum-specific INCI/directions not accessible in this session | 2026-10-12 | accessible |
| SRC-0006 | ZA-SERUMOIL-0018, ZA-SERUMOIL-0019, ZA-SERUMOIL-0023, ZA-SERUMOIL-0041 | Dis-Chem "rosemary oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=rosemary+oil | retailer (catalogue) | T9 | ZA | South African availability of rosemary-positioned hair oils: Mielle Rosemary Mint 2 oz and 59 ml, Afri Pure Rosemary And Mint With Biotin Oil Blend, Curls In Bloom Feed Me Biotin Rosemary Hair & Scalp Oil, Jamaican Mango & Lime Black Castor Oil Rosemary, Difeel Rosemary Mint Strengthening Hair Oil, Mizani 25 Miracle Nourishing Hair Oil, Cantu Biotin Hair Strengthen Oil, Afri Pure 50 ml Miracle Growth Oil, Native Child Hair Growth Stimulating Castor Oil, Nilotiqa Aloe And Avo. Most "Rosemary Oil 20 ml Dis-Chem" listings are aromatherapy essential oils (not hair cosmetics) and were excluded. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0007 | ZA-SERUMOIL-0001, ZA-SERUMOIL-0002, ZA-SERUMOIL-0004 | Dis-Chem "moroccanoil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=moroccanoil | retailer (catalogue) | T9 | ZA | South African availability of Moroccanoil Treatment (100 ml original and 100 ml Light Formula) at ZAR 1 020 each; also surfaced Ogx Renew Moroccan Oil Dry/Coarse and Marc Anthony Dry Styling Oil "Oil Of Morocco" (marketing, not the Moroccanoil brand). | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session; Moroccanoil.com ZA site JS-rendered and product details not extracted in this session | 2026-10-12 | accessible |
| SRC-0008 | ZA-SERUMOIL-0023, ZA-SERUMOIL-0024, ZA-SERUMOIL-0025, ZA-SERUMOIL-0026, ZA-SERUMOIL-0027 | Dis-Chem "afritude" catalogue JSON feed (closest match: AFRI PURE) | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=afritude | retailer (catalogue) | T9 | ZA | South African availability of Afri Pure oil blends: Rosemary And Mint With Biotin 100 ml, Blended Jojoba 100 ml, Blended Argan 100 ml, Jamaican Black Castor 100 ml, Blended Peppermint 100 ml, Blended Coconut 100 ml, 50 ml Miracle Growth Oil, 180 ml body oils (excluded from hair serum/oil category — they are body oils), 200 ml Wrap And Set Castor, 100 ml Aloe Oil, Castor Oil 200 ml, 100 ml Tee Tree Oil, 200 ml Jamaican Jewel Black Castor Oil Blend, 100 ml Amla Abundance Oil Blend. Note: no brand named "Afritude" was surfaced; "Afri Pure" is a ZA brand in the same category space and is retained as the user-intended match. | retailer-only; the user brief referenced "Afritude" but Dis-Chem catalogue returned AFRI PURE — this may be a brand-naming gap or a true separate brand not stocked at Dis-Chem; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0009 | ZA-SERUMOIL-0039, ZA-SERUMOIL-0040 | Dis-Chem "good stuff hair" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=good+stuff+hair | retailer (catalogue) | T9 | ZA | South African availability of Good Stuff Bee Natural Hair Serum 100 ml and Good Stuff ECR Hair Serum 100 ml at ZAR 149.99 each. Good Stuff is a ZA-origin brand. The query also surfaced Good Stuff shampoos/conditioners/body products (excluded from this batch). | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0010 | ZA-SERUMOIL-0032, ZA-SERUMOIL-0033, ZA-SERUMOIL-0034, ZA-SERUMOIL-0042 | Dis-Chem "l'oreal professionnel" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=l%27oreal+professionnel | retailer (catalogue) | T9 | ZA | South African availability of L'Oréal Professionnel Vitamino Color 10-in-1 Multi-benefit Leave-in Hair Treatment 190 ml (ZAR 550), Vitamino Color Shampoo + Conditioner + Mask, L'Oréal Pro Absolut Repair Molecular Rinse-off Hair Serum 250 ml (ZAR 650), Absolut Repair Molecular Leave-in Hair Mask 100 ml (ZAR 540), Abso Repair Oil (ZAR 560), Curl Expression range, Metal Detox range, Tecni Art Fix Design + Anti-frizz, Scalp Advanced Anti-discomfort Shampoo + Anti-oiliness Shampoo, Silver Neutralising Shampoo, Versatile Multi-usage Clay for Oily Scalp. The query also surfaced Redken SKUs (Dis-Chem indexes Redken under L'Oréal Professionnel as part of the L'Oréal group). | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session | 2026-10-12 | accessible |
| SRC-0011 | (Olaplex No.7 Bonding Oil absent — see continuation list) | Dis-Chem "olaplex" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=olaplex | retailer (catalogue) | T9 | ZA | Only 3 Olaplex SKUs surfaced at Dis-Chem: No.3plus Complete Repair Treatment (ZAR 1 199.99), No.4 Bond Maintenance Shampoo 250 ml (ZAR 900), No.5 Bond Maintenance Conditioner 250 ml (ZAR 900). Olaplex No.7 Bonding Oil (the most likely "bond-repair oil" candidate) is NOT visible at Dis-Chem under this query. Olaplex No.7 is distributed in ZA via premium salons (Hairworx, Salon Warehouse) and possibly Takealot/Clicks — not surfaced here. Important: Olaplex.com ZA site blocked by CT Cloudflare this session. | retailer-only; Olaplex No.7 absent at Dis-Chem; manufacturer ZA page inaccessible in this session | 2026-10-12 | accessible |
| SRC-0012 | (K18 absent — see continuation list) | Dis-Chem "joico" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=joico | retailer (catalogue) | T9 | ZA | Dis-Chem stocks 18 Joico SKUs but they are predominantly shampoos and conditioners (Blonde Life range, K-Pak range, Hydra Splash, Colorful Anti-fade, Joifull Volumizing, Moisture Recovery range) — no Joico finishing oils or serums surfaced in this query. Joico Oil Recovery and Joico K-Pak Reconstructor Serum are likely stocked at Joico distributors (Salon Warehouse, Hairworx) but not at Dis-Chem. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session; Joico ZA page not fetched this session | 2026-10-12 | accessible |
| SRC-0013 | (K18 / Pureology / Wella oils absent — see continuation list) | Dis-Chem "pureology" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=pureology | retailer (catalogue) | T9 | ZA | Search "pureology" returned only permanent hair colour SKUs — no Pureology hair serums or oils surfaced. Pureology is salon-only in ZA and is distributed via L'Oréal Professionnel ZA / Salon Warehouse / Hairworx. Pureology ZA site inaccessible in this session. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session; Pureology ZA page blocked this session | 2026-10-12 | accessible |
| SRC-0014 | (Wella oils absent) | Dis-Chem "wella oil" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=wella+oil | retailer (catalogue) | T9 | ZA | Search returned cooking oils, aromatherapy essential oils (Soil, Dis-Chem, Wellvita Omega supplements, Lifestyle Food), and Bio-Oil Skincare Oil (skincare, not hair). No Wella Professionals Oil Reflections surfaced. Wella is salon-only in ZA and is distributed via Wella ZA / Salon Warehouse / Hairworx. Wella ZA page inaccessible in this session. | retailer-only; the "Bio-Oil Skincare Oil" SKUs are body/skincare oils and were excluded from this hair serum/oil batch; no manufacturer INCI, directions, GTIN, or warnings accessible in this session; Wella ZA page blocked this session | 2026-10-12 | accessible |
| SRC-0015 | (Kérastase absent) | Dis-Chem "kerastase elixir" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=kerastase+elixir | retailer (catalogue) | T9 | ZA | Search returned only perfume "Elixir" SKUs (Clinique Aromatics Elixir, Rabanne Phantom Black Elixir, Hugo Boss Bottled Elixir, Elie Saab Elixir, Mugler Angel Elixir, etc.) and an unrelated "Dis-Chem Berry Elixir" supplement. No Kérastase Elixir Ultime surfaced. Kérastase is salon-only in ZA and is distributed via L'Oréal Professionnel ZA / Hairworx / Salon Warehouse. Kérastase ZA site inaccessible in this session. | retailer-only; no manufacturer INCI, directions, GTIN, or warnings accessible in this session; Kérastase ZA page blocked this session | 2026-10-12 | accessible |
| SRC-0016 | (SoulTribe absent) | Dis-Chem "soultribe" catalogue JSON feed | Dis-Chem Pharmacies (ZA retailer) | https://www.dischem.co.za/catalogsearch/result/?q=soultribe | retailer (catalogue) | T9 | ZA | No SoulTribe hair serum or oil surfaced. The query returned only "Island Tribe" sun-care SKUs (a different brand). SoulTribe is a ZA lifestyle brand with a known hair oil range sold via SoulTribe's own e-commerce site (soultribe.co.za) and at boutique salons — not at Dis-Chem. | retailer-only; SoulTribe not stocked at Dis-Chem this session; SoulTribe ZA site inaccessible in this session | 2026-10-12 | accessible |

---

## OUTPUT 4 — Claim Register

| claimId | temporaryResearchId | claimType | claimText | supportingSourceIds | contradictingSourceIds | exactVersionApplicability | marketApplicability | confidence | limitations |
|---|---|---|---|---|---|---|---|---|---|
| C-0001 | ZA-SERUMOIL-0001 | identity | "Moroccanoil Treatment 100 ml is currently listed at Dis-Chem ZA at ZAR 1 020" | SRC-0007 | none observed | exact (Moroccanoil Treatment, original formula, 100 ml, all hair types) | ZA (Dis-Chem) | confirmed | retailer-only; manufacturer ZA page inaccessible this session |
| C-0002 | ZA-SERUMOIL-0001 | capability | "Moroccanoil Treatment is a finishing / styling hair oil for all hair types" | SRC-0007 | none observed | exact (Moroccanoil Treatment, original, 100 ml) | ZA | partial | the description is marketing wording from Moroccanoil — not independently verified by manufacturer INCI; classified as `serum_oil` per the category line |
| C-0003 | ZA-SERUMOIL-0001 | warning | "For external use only; avoid eye contact; discontinue if irritation occurs" | none in this session | none observed | exact | ZA | unverified | no manufacturer label retrieved this session — typical cosmetic warnings expected but unverified |
| C-0004 | ZA-SERUMOIL-0001 | ingredients | "Argan oil + linseed extract + cosmetic-grade silicone" | none in this session | none observed | exact (global formula; ZA formulation unverified) | ZA | unverified | manufacturer ZA page inaccessible this session; global INCI to be confirmed in future pass |
| C-0005 | ZA-SERUMOIL-0002 | identity | "Moroccanoil Treatment Light Formula 100 ml is currently listed at Dis-Chem ZA at ZAR 1 020" | SRC-0007 | none observed | exact (Light Formula, 100 ml) | ZA | confirmed | retailer-only |
| C-0006 | ZA-SERUMOIL-0003 | identity | "Redken All Soft Argan-6 Leave-in Moisturising Hair Oil 111 ml is currently listed at Dis-Chem ZA at ZAR 790" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only |
| C-0007 | ZA-SERUMOIL-0004 | identity | "Marc Anthony Dry Styling Oil 120 ml 'Oil Of Morocco' variant is currently listed at Dis-Chem ZA at ZAR 239.99" | SRC-0007 | none observed | exact | ZA | confirmed | retailer-only; brand "Oil Of Morocco" is marketing and must not be confused with authentic Moroccanoil |
| C-0008 | ZA-SERUMOIL-0005 | identity | "Ogx Renew Moroccan Oil (Dry/Coarse variant) 100 ml is currently listed at Dis-Chem ZA at ZAR 249.99" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only |
| C-0009 | ZA-SERUMOIL-0006 | identity | "Dark & Lovely Pro Collection Pro-renew Revitalizing Hair Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 199.99" | SRC-0001 | none observed | exact | ZA | confirmed | retailer-only |
| C-0010 | ZA-SERUMOIL-0007 | identity | "ORS Olive Oil With Black Castor Hair Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 109.99" | SRC-0001, SRC-0004 | none observed | exact | ZA | confirmed | retailer-only |
| C-0011 | ZA-SERUMOIL-0008 | identity | "ORS Argan Oil Fortifying Hair Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 52.99" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only |
| C-0012 | ZA-SERUMOIL-0009 | identity | "Native Child Hair Growth Stimulating Castor Oil 200 ml is currently listed at Dis-Chem ZA at ZAR 92.99" | SRC-0001, SRC-0004 | none observed | exact | ZA | confirmed | retailer-only; "growth stimulating" is a marketing claim — do NOT interpret as a StrandCue capability |
| C-0013 | ZA-SERUMOIL-0010 | identity | "Nilotiqa Aloe And Avo Growth Stimulating Hair Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 89.99" | SRC-0001, SRC-0005 | none observed | exact | ZA | confirmed | retailer-only |
| C-0014 | ZA-SERUMOIL-0011 | identity | "Nilotiqa Scalp And Hair Oil 124 ml is currently listed at Dis-Chem ZA at ZAR 89.99" | SRC-0001, SRC-0005 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand (Nilotiqa) |
| C-0015 | ZA-SERUMOIL-0012 | identity | "Two Oceans Argan Oil Hair Serum 100 ml is currently listed at Dis-Chem ZA at ZAR 99.99" | SRC-0001, SRC-0002, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand (Two Oceans); serum format (not pure oil) |
| C-0016 | ZA-SERUMOIL-0013 | identity | "Two Oceans Argan Oil Heat Defence Spray 200 ml is currently listed at Dis-Chem ZA at ZAR 99.99" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only; this is a HEAT-PROTECTANT SPRAY (not a finishing serum) — flagged for OUTPUT 5 and possible cross-batch move to heatprotect-batch-01 in next pass |
| C-0017 | ZA-SERUMOIL-0014 | identity | "Cantu Tea Tree & Jojoba Hair & Scalp Oil 180 ml is currently listed at Dis-Chem ZA at ZAR 199.99" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only |
| C-0018 | ZA-SERUMOIL-0015 | identity | "Cantu Biotin Hair Strengthen Oil 95 ml is currently listed at Dis-Chem ZA at ZAR 199.99" | SRC-0001, SRC-0003, SRC-0006 | none observed | exact | ZA | confirmed | retailer-only |
| C-0019 | ZA-SERUMOIL-0016 | identity | "Hask Argan Oil From Morocco Repairing Shine Hair Oil 18 ml (sachet format) is currently listed at Dis-Chem ZA at ZAR 99.99" | SRC-0001, SRC-0003 | none observed | exact | ZA | confirmed | retailer-only; sachet format — atypical for a hair oil SKU |
| C-0020 | ZA-SERUMOIL-0017 | identity | "Hask Argan Oil Treatment Pump 59 ml is currently listed at Dis-Chem ZA at ZAR 229.99" | SRC-0003 | none observed | exact | ZA | confirmed | retailer-only; pump format |
| C-0021 | ZA-SERUMOIL-0018 | identity | "Mielle Rosemary Mint And Scalp Hair Strengthening Oil 2 oz (59 ml) is currently listed at Dis-Chem ZA at ZAR 299.99" | SRC-0001, SRC-0002, SRC-0006 | none observed | exact | ZA | confirmed | retailer-only; imported US brand (Mielle Organics) |
| C-0022 | ZA-SERUMOIL-0019 | identity | "Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil 59 ml is currently listed at Dis-Chem ZA at ZAR 299.99" | SRC-0001, SRC-0006 | none observed | exact | ZA | confirmed | retailer-only; "Light" variant — separate SKU from -0018 |
| C-0023 | ZA-SERUMOIL-0020 | identity | "Aunty Jackie's Nourish My Hair Flaxseed & Monoi Natural Growth Oil 118 ml is currently listed at Dis-Chem ZA at ZAR 129.99" | SRC-0001 | none observed | exact | ZA | confirmed | retailer-only; imported US brand |
| C-0024 | ZA-SERUMOIL-0021 | identity | "Jamaican Mango And Lime Black Castor Oil Rosemary 118 ml is currently listed at Dis-Chem ZA at ZAR 199.99" | SRC-0001, SRC-0004, SRC-0006 | none observed | exact | ZA | confirmed | retailer-only |
| C-0025 | ZA-SERUMOIL-0022 | identity | "Pure Royal Jamaican Castor Oil 150 ml is currently listed at Dis-Chem ZA at ZAR 159.99" | SRC-0004 | none observed | exact | ZA | confirmed | retailer-only |
| C-0026 | ZA-SERUMOIL-0023 | identity | "Afri Pure Rosemary And Mint With Biotin Oil Blend 100 ml is currently listed at Dis-Chem ZA at ZAR 59.99" | SRC-0001, SRC-0006, SRC-0008 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand (Afri Pure) |
| C-0027 | ZA-SERUMOIL-0024 | identity | "Afri Pure Blended Argan Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 59.99" | SRC-0003, SRC-0008 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand |
| C-0028 | ZA-SERUMOIL-0025 | identity | "Afri Pure Jamaican Black Castor Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 59.99" | SRC-0004, SRC-0008 | none observed | exact | ZA | confirmed | retailer-only; "Jamaican Black Castor" wording requires INCI verification to confirm authenticity |
| C-0029 | ZA-SERUMOIL-0026 | identity | "Afri Pure Castor Oil 200 ml is currently listed at Dis-Chem ZA at ZAR 79.99" | SRC-0004, SRC-0008 | none observed | exact | ZA | confirmed | retailer-only; separate SKU from -0025 — likely plain castor (no Jamaican Black wording) |
| C-0030 | ZA-SERUMOIL-0027 | identity | "Afri Pure Amla Abundance Oil Blend 100 ml is currently listed at Dis-Chem ZA at ZAR 59.99" | SRC-0008 | none observed | exact | ZA | confirmed | retailer-only; amla (Phyllanthus emblica) ingredient |
| C-0031 | ZA-SERUMOIL-0028 | identity | "Sof'n Free Black Caster Oil Braids Hair Food 250 ml is currently listed at Dis-Chem ZA at ZAR 53.99" | SRC-0001, SRC-0004 | none observed | exact | ZA | confirmed | retailer-only; "Black Caster" appears to be a spelling variant of "Black Castor" in the Dis-Chem catalogue feed |
| C-0032 | ZA-SERUMOIL-0029 | identity | "Palmers Cocoa Butter Length Retention Hair And Scalp Oil 150 g is currently listed at Dis-Chem ZA at ZAR 119.99" | SRC-0001 | none observed | exact | ZA | confirmed | retailer-only; solid/semi-solid cocoa-butter stick — atypical mass unit (g not ml) |
| C-0033 | ZA-SERUMOIL-0030 | identity | "Mpl Hair Oil 125 g Coconut is currently listed at Dis-Chem ZA at ZAR 49.99" | SRC-0001 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin budget staple; 125 g mass unit (not ml) |
| C-0034 | ZA-SERUMOIL-0031 | identity | "Marc Anthony Grow Long Scalp & Hair Serum 60 ml is currently listed at Dis-Chem ZA at ZAR 239.99" | SRC-0002 | none observed | exact | ZA | confirmed | retailer-only |
| C-0035 | ZA-SERUMOIL-0032 | identity | "Elvive Extraordinary Oil Midnight Serum is currently listed at Dis-Chem ZA at ZAR 199.99" | SRC-0002 | none observed | exact | ZA | partial | retailer-only; exact ZA size in ml not exposed in catalogue feed |
| C-0036 | ZA-SERUMOIL-0033 | identity | "L'Oréal Professionnel Absolut Repair Molecular Rinse-off Hair Serum For Damaged Hair 250 ml is currently listed at Dis-Chem ZA at ZAR 650" | SRC-0001, SRC-0002, SRC-0010 | none observed | exact | ZA | confirmed | retailer-only; "rinse-off serum" wording on the bottle is distinct from a leave-in finishing serum — the manufacturer classifies this as a rinse-off treatment, not as a leave-in finishing oil |
| C-0037 | ZA-SERUMOIL-0034 | identity | "L'Oréal Professionnel Abso Repair Oil is currently listed at Dis-Chem ZA at ZAR 560" | SRC-0010 | none observed | exact | ZA | partial | retailer-only; exact ZA size in ml not exposed in catalogue feed |
| C-0038 | ZA-SERUMOIL-0035 | identity | "Paul Mitchell Super Skinny Serum 150 ml is currently listed at Dis-Chem ZA at ZAR 620" | SRC-0002 | none observed | exact | ZA | confirmed | retailer-only |
| C-0039 | ZA-SERUMOIL-0036 | identity | "ghd Dramatic Ending - Smooth & Finish Serum is currently listed at Dis-Chem ZA at ZAR 430" | SRC-0002 | none observed | exact | ZA | partial | retailer-only; exact ZA size in ml not exposed in catalogue feed |
| C-0040 | ZA-SERUMOIL-0037 | identity | "Creightons Serum Define Shine 50 ml is currently listed at Dis-Chem ZA at ZAR 179.99" | SRC-0002 | none observed | exact | ZA | confirmed | retailer-only |
| C-0041 | ZA-SERUMOIL-0038 | identity | "Ogx Bond Protein Repair Sealing Serum 50 ml is currently listed at Dis-Chem ZA at ZAR 319.99" | SRC-0002 | none observed | exact | ZA | confirmed | retailer-only |
| C-0042 | ZA-SERUMOIL-0039 | identity | "Good Stuff Bee Natural Hair Serum 100 ml is currently listed at Dis-Chem ZA at ZAR 149.99" | SRC-0002, SRC-0009 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand |
| C-0043 | ZA-SERUMOIL-0040 | identity | "Good Stuff ECR Hair Serum 100 ml is currently listed at Dis-Chem ZA at ZAR 149.99" | SRC-0002, SRC-0009 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand |
| C-0044 | ZA-SERUMOIL-0041 | identity | "Curls In Bloom Feed Me Biotin Rosemary Hair & Scalp Oil 100 ml is currently listed at Dis-Chem ZA at ZAR 119.99" | SRC-0001, SRC-0002, SRC-0006 | none observed | exact | ZA | confirmed | retailer-only; ZA-origin brand |
| C-0045 | ZA-SERUMOIL-0042 | identity | "Elvive Bond Repair 150 ml Leave-in Serum is currently listed at Dis-Chem ZA at ZAR 239.99" | SRC-0002, SRC-0010 | none observed | exact | ZA | confirmed | retailer-only; consumer-tier bond-repair serum (L'Oréal consumer brand, not L'Oréal Pro) |
| C-0046 | ZA-SERUMOIL-0043 | identity | "Redken All Soft Argan-6 Leave-in Moisturising Hair Oil 111 ml is currently listed at Dis-Chem ZA at ZAR 790 — long-title variant of -0003" | SRC-0001, SRC-0003 | none observed | exact (same SKU as -0003, different retailer-side description string) | ZA | confirmed | retailer-only; this row is a duplicate SKU capture from two search queries (`argan oil` returned a long description string; `hair oil` returned a short description string) |
| C-0047 | All | category | "Each product is classified as a hair serum or hair oil per the manufacturer's primary marketing positioning and Dis-Chem catalogue subcategory line" | SRC-0001, SRC-0002, SRC-0003, SRC-0004, SRC-0005, SRC-0006, SRC-0007, SRC-0008, SRC-0009, SRC-0010 | none observed | exact | ZA | confirmed | manufacturer-side subcategory lines were not verified this session; classification relies on retailer catalogue-feed product title wording |
| C-0048 | All | marketing | "Marketing wording ('miracle', 'repair', 'restructuring', 'pro-renew', 'miracle growth', 'strengthening', 'fortifying') is marketing and is NOT a StrandCue capability" | none in this session | none observed | exact | ZA | confirmed | not a claim to be supported by source — included as a category-wide reminder per StrandCue v1 protocol §"non-negotiable research rules" |
| C-0049 | All | bond-repair | "Bond-repair wording (Olaplex, Elvive Bond Repair, L'Oréal Pro Absolut Repair Molecular, Ogx Bond Protein Repair) does NOT equate to a StrandCue capability beyond the closed `cleanse` / `condition` vocabulary" | none in this session | none observed | exact | ZA | confirmed | per StrandCue v1 protocol — closed capability vocabulary is `cleanse` and `condition` only; bond-repair serums/oils fall under `serum_oil` category with `proposed_capability: none` |
| C-0050 | ZA-SERUMOIL-0013 | category-conflict | "Two Oceans Argan Oil Heat Defence Spray should ideally be moved to heatprotect-batch (it is a heat-protection spray, not a finishing serum, despite containing argan oil)" | SRC-0003 | none observed | exact | ZA | partial | kept in this batch because the user brief explicitly includes "heat-activation serums" in scope and the argan-oil positioning of the spray puts it on the boundary between the two batches; the next pass should reconcile this — see OUTPUT 5 and OUTPUT 7 |

---

## OUTPUT 5 — Reformulation and Conflict Report

### 5.1 Bond-repair line — classification decisions for the user-named SKUs

- **Olaplex N°7 Bonding Oil (30 ml).** Olaplex markets N°7 as a "bond-building, weightless reparative styling oil" — explicitly positioned as a finishing hair oil, not as a heat protectant in Olaplex's own brand site. The Olaplex product line uses "bond maintenance" wording (shampoo No.4, conditioner No.5) on the labels alongside the oil, so N°7 is dual-positioned: leave-in finishing oil + bond-treatment claim. **Decision:** Olaplex N°7 Bonding Oil is in the **serum / oil** category and **NOT** in the heat-protectant batch. It is recorded in this batch as a **deferred inclusion** (Continuation list, row CONT-001) because Olaplex N°7 is not visible at Dis-Chem in this session's `?q=olaplex` query (only No.3plus, No.4, No.5 surfaced; Olaplex ZA manufacturer site blocked by CT Cloudflare). To be added to the main table once Olaplex ZA visibility is confirmed via Takealot / Clicks / Olaplex ZA distributor.
- **K18 4-step system (Leave-In Molecular Repair Mask 30 ml + relevant oils).** K18 markets the "4-step system" with a Leave-In Molecular Repair Mask (Peptide K18 / Bioactive Peptide) as its flagship leave-in. K18 is positioned as a leave-in (treatment), not as a finishing serum / oil. The K18 system does not include a stand-alone "bonding oil" SKU. **Decision:** K18 Leave-In Molecular Repair Mask should be classified as a **leave-in treatment** (already covered in the leavein-batch-01); K18 does not contribute to this serum/oil batch. It is recorded in this batch's Continuation list (row CONT-002) as a cross-batch classification note.
- **L'Oréal Professionnel Absolut Repair Molecular Rinse-off Hair Serum 250 ml (-0033)** — included as ZA-SERUMOIL-0033. The bottle wording is "Rinse-off Hair Serum" which is a hybrid category (closer to a treatment mask than a leave-in finishing oil). The catalogue lists it as a hair serum. It is retained here per the manufacturer wording but flagged as a borderline entry.
- **L'Oréal Professionnel Absolut Repair Molecular Leave-in Hair Mask 100 ml** — surfaced by the same query but is a "leave-in hair mask" not a "hair serum" or "hair oil"; **excluded** from this batch — it would belong in the leave-in batch.
- **L'Oréal Professionnel Abso Repair Oil (-0034)** — included as ZA-SERUMOIL-0034. The bottle wording is "Oil" (leave-in oil from the Absolut Repair line) and is a clear serum / oil candidate. Retained.
- **Elvive Bond Repair 150 ml Leave-in Serum (-0042)** — included as ZA-SERUMOIL-0042. Consumer-tier "Bond Repair" serum. Retained.
- **Ogx Bond Protein Repair Sealing Serum 50 ml (-0038)** — included as ZA-SERUMOIL-0038. Consumer-tier "Bond Protein Repair" serum. Retained.

### 5.2 Other cross-batch conflicts

- **Two Oceans Argan Oil Heat Defence Spray 200 ml (-0013)** — surfaced in the `argan oil` retailer query but is an argan-oil-infused HEAT PROTECTANT SPRAY. The user brief explicitly includes "heat-activation serums" in scope, so it is retained in this batch as a borderline entry. Recommendation for next pass: move to heatprotect-batch-01 or keep with a "category-borderline" flag. The conflict is between the search-query match ("argan oil") and the manufacturer's intended use (heat protection).
- **Cantu Jamaican Black Castor Oil Styling Gel 524 g** — surfaced in the `castor oil` query but is a STYLING GEL, not an oil. Excluded from this batch. Belongs in styling-batch.
- **Sof'n Free "Black Caster Oil Braids Hair Food" 250 ml (-0028)** — "Hair Food" wording is the ZA styling terminology for a pomade-like oil used for braiding; included as hair oil but flagged for cross-category confirmation.
- **Dis-Chem "aromatherapy" oils** (Rosemary Oil 20 ml, Windrose Rosemary Oil 11 ml, Lavender Oil, Eucalyptus Oil, Tea Tree Oil, etc.) — excluded from this batch; these are essential oils for aromatherapy use, not hair cosmetics, even though the rosemary search surfaced them.
- **Dis-Chem "Bio-Oil Skincare Oil" SKUs** — excluded from this batch; these are body / skincare oils (scar / stretch-mark oil), not hair cosmetics.
- **Dis-Chem "Lifestyle Food Coconut Oil" / "Virgin Olive Oil"** — excluded; these are culinary oils, not hair cosmetics.
- **Dis-Chem "Mpl Vitamin E Hair Oil" / "Mpl Medicated Hair Oil" / "Mpl Twin Pack Hair Food & Hair Oil"** — surfaced in the `hair oil` query but multiple Mpl variants exist; only ZA-SERUMOIL-0030 (Coconut 125 g) is in the main table; the others are in the continuation list (CONT-008, CONT-009, CONT-010) for completeness in a future pass.
- **Marc Anthony Dry Styling Oil "Oil Of Morocco" vs. authentic Moroccanoil** — the Marc Anthony product uses "Oil Of Morocco" as marketing wording only and must not be conflated with the Moroccanoil brand (Moroccanoil is its own brand). See ZA-SERUMOIL-0004 vs. -0001/-0002.
- **OgX "Renew Moroccan Oil" vs. Moroccanoil** — same caution. See ZA-SERUMOIL-0005 vs. -0001/-0002.

### 5.3 ZA brands named in the user brief — surface findings

- **SoulTribe** — not stocked at Dis-Chem. The SoulTribe brand (ZA lifestyle brand with a known hair oil range) is sold direct via soultribe.co.za and at boutique salons, not at Dis-Chem. SoulTribe is added to the Continuation list (row CONT-003) with a flag for the next pass to check soultribe.co.za and Takealot.
- **Afritude** — Dis-Chem search for "afritude" returned NO Afritude SKUs. The closest match in the catalogue is AFRI PURE (a known ZA brand). The user brief may be referring to Afri Pure (ZA-origin natural haircare brand) — five Afri Pure oil SKUs are retained in this batch (-0023, -0024, -0025, -0026, -0027). "Afritude" as a separate brand name is added to the Continuation list (CONT-004) for the next pass.
- **Good Stuff** — surfaced at Dis-Chem with two ZA-origin hair serums (Bee Natural, ECR) — ZA-SERUMOIL-0039, -0040 retained.
- **Mzansi Hair** — not surfaced at Dis-Chem under "mzansi hair" or similar. Added to Continuation list (CONT-005).
- **Two Oceans, Organics, Reflections, Doris, Natur Vital** — Two Oceans retained (-0012, -0013); Organics / Reflections / Doris / Natur Vital not surfaced as hair serum / oil candidates in this session (Reflections and Natur Vital returned hair colour SKUs in the `pureology` query, not serums).

### 5.4 Duplicates within this batch

- ZA-SERUMOIL-0043 is a duplicate of ZA-SERUMOIL-0003 (same Dis-Chem product_id 000000000000142378, Redken All Soft Argan-6 111 ml) captured twice under different retailer-side description strings. The canonical entry is -0003; -0043 is retained only as cross-search evidence in the claim register and product table.

### 5.5 Products excluded because they failed category line

- **Marc Anthony 3x Moist 3-in-1 Styling Cream 150 ml** — surfaced in the `moroccanoil` query but is a styling cream, not a hair oil. Excluded.
- **Two Oceans Conditioner 1 l / Two Oceans Shampoo 1 l** — surfaced in the `moroccanoil` query but are rinse-off products, not hair oils. Excluded.
- **Bio-Oil Skincare Oil 60 / 125 / 200 ml** — surfaced in the `wella oil` query but are skincare oils, not hair cosmetics. Excluded.
- **ORs Olive Oil Styling Gel 250 ml** — styling gel, not hair oil. Excluded.
- **Afri Pure 180 ml Body Oils (Glow To Go, Vit E And C, All Rounder, Moisture Bomb, Turmeric And Vit C)** — body oils, not hair cosmetics. Excluded.
- **Afri Pure Rosemary Mint Detangling Spray / Rosemary Mint Itch-Reducing Spray / Rosemary Mint Wrap & Set Mousse / Rosemary Mint Detox Hair Cleanser** — sprays / mousses, not serums or oils. Excluded.
- **Vatika Henna 10 g** — hair dye / colour, not serum or oil. Excluded.
- **Sta-sof-fro Shiny Hair Dye Black** — hair dye, not serum or oil. Excluded.

### 5.6 Lifecycle / reformulation signals

- All listed SKUs were observed live on 2026-10-12 — no reformulation or discontinuation signals visible in this single-day snapshot. Multi-day observation is recommended to confirm lifecycle stability.
- "Pure Royal" (-0022) is a ZA brand that also appears under "Argan" and other queries; the brand identity at Dis-Chem is sparse — confirm via direct ZA brand site visit.

---

## OUTPUT 6 — StrandCue Import Candidates

```json
[
  {
    "temporaryResearchId": "ZA-SERUMOIL-0001",
    "kind": "product",
    "brand": "Moroccanoil",
    "productName": "Moroccanoil Treatment",
    "variant": "All Hair Types (original formula)",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.moroccanoil.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000295093; ZAR 1 020 on 2026-10-12. ZA-listed; manufacturer ZA site inaccessible in this session.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0002",
    "kind": "product",
    "brand": "Moroccanoil",
    "productName": "Moroccanoil Treatment",
    "variant": "Light Formula",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.moroccanoil.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000295094; ZAR 1 020 on 2026-10-12. Separate SKU from -0001 (Light Formula).",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0003",
    "kind": "product",
    "brand": "Redken",
    "productName": "Redken All Soft Argan-6 Leave-in Moisturising Hair Oil",
    "variant": "All Soft / Argan-6",
    "sizeOrPack": "111 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.redken.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000142378; ZAR 790 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0004",
    "kind": "product",
    "brand": "Marc Anthony",
    "productName": "Marc Anthony Dry Styling Oil",
    "variant": "Oil Of Morocco (variant line)",
    "sizeOrPack": "120 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://marcanthony.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000144035; ZAR 239.99 on 2026-10-12. 'Oil Of Morocco' is marketing wording; do not conflate with authentic Moroccanoil brand.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0005",
    "kind": "product",
    "brand": "Ogx",
    "productName": "Ogx Renew Moroccan Oil",
    "variant": "Dry / Coarse",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ogxhair.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000158337; ZAR 249.99 on 2026-10-12. 'Moroccan Oil' wording is Ogx sub-line branding; not the same product as authentic Moroccanoil.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0006",
    "kind": "product",
    "brand": "Dark & Lovely",
    "productName": "Dark & Lovely Pro Collection Pro-renew Revitalizing Hair Oil",
    "variant": "Pro Collection / Pro-renew",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://darkandlovely.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000464842; ZAR 199.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0007",
    "kind": "product",
    "brand": "ORS (Organic Root Stimulator)",
    "productName": "ORS Olive Oil With Black Castor Hair Oil",
    "variant": "Olive Oil + Black Castor blend",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.orshaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000199829; ZAR 109.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0008",
    "kind": "product",
    "brand": "ORS (Organic Root Stimulator)",
    "productName": "ORS Argan Oil Fortifying Hair Oil",
    "variant": "Argan / Fortifying",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.orshaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000163695; ZAR 52.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0009",
    "kind": "product",
    "brand": "Native Child",
    "productName": "Native Child Hair Growth Stimulating Castor Oil",
    "variant": "Castor / growth positioning",
    "sizeOrPack": "200 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.nativechild.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000326763; ZAR 92.99 on 2026-10-12. 'Growth stimulating' is marketing; do not interpret as a StrandCue capability.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0010",
    "kind": "product",
    "brand": "Nilotiqa",
    "productName": "Nilotiqa Aloe And Avo Growth Stimulating Hair Oil",
    "variant": "Aloe + Avocado blend",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://nilotiqa.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000428288; ZAR 89.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0011",
    "kind": "product",
    "brand": "Nilotiqa",
    "productName": "Nilotiqa Scalp And Hair Oil",
    "variant": "Scalp-and-hair oil",
    "sizeOrPack": "124 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://nilotiqa.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000299125; ZAR 89.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0012",
    "kind": "product",
    "brand": "Two Oceans",
    "productName": "Two Oceans Argan Oil Hair Serum",
    "variant": "Argan Oil serum",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://twooceans.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000203472; ZAR 99.99 on 2026-10-12. ZA-origin brand; serum format.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0002", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0013",
    "kind": "product",
    "brand": "Two Oceans",
    "productName": "Two Oceans Argan Oil Heat Defence Spray",
    "variant": "Argan Oil + heat-protection",
    "sizeOrPack": "200 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://twooceans.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000203474; ZAR 99.99 on 2026-10-12. Category-borderline: positioned as a heat-protectant spray rather than a finishing serum. Retained in this batch per the user brief's explicit inclusion of 'heat-activation serums' but flagged for potential cross-batch move to heatprotect-batch-01 in next pass.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; cross-batch classification (heatprotect vs. serum_oil) needs reconciliation in next pass; manufacturer ZA page inaccessible in this session."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0014",
    "kind": "product",
    "brand": "Cantu",
    "productName": "Cantu Tea Tree & Jojoba Hair & Scalp Oil",
    "variant": "Tea Tree + Jojoba",
    "sizeOrPack": "180 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.cantu.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000175836; ZAR 199.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0015",
    "kind": "product",
    "brand": "Cantu",
    "productName": "Cantu Biotin Hair Strengthen Oil",
    "variant": "Biotin / strengthening",
    "sizeOrPack": "95 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.cantu.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000453162; ZAR 199.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0016",
    "kind": "product",
    "brand": "Hask",
    "productName": "Hask Argan Oil From Morocco Repairing Shine Hair Oil",
    "variant": "Argan / Repairing Shine",
    "sizeOrPack": "18 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.haskhaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000386889; ZAR 99.99 on 2026-10-12. Single-use sachet format.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0017",
    "kind": "product",
    "brand": "Hask",
    "productName": "Hask Argan Oil Treatment Pump",
    "variant": "Argan / treatment pump format",
    "sizeOrPack": "59 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.haskhaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000449327; ZAR 229.99 on 2026-10-12. Pump format (separate from -0016 sachet).",
    "status": "draft",
    "sourceIds": ["SRC-0003"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0018",
    "kind": "product",
    "brand": "Mielle",
    "productName": "Mielle Rosemary Mint And Scalp Hair Strengthening Oil",
    "variant": "Rosemary + Mint / Strengthening",
    "sizeOrPack": "2 oz / 59 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://mielleorganics.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000324153; ZAR 299.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0002", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0019",
    "kind": "product",
    "brand": "Mielle",
    "productName": "Mielle Rosemary Mint Light Scalp N Hair Strengthening Oil",
    "variant": "Rosemary + Mint / Light",
    "sizeOrPack": "59 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://mielleorganics.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000464188; ZAR 299.99 on 2026-10-12. 'Light' variant — separate SKU from -0018.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0020",
    "kind": "product",
    "brand": "Aunty Jackie's",
    "productName": "Aunty Jackie's Nourish My Hair Flaxseed & Monoi Natural Growth Oil",
    "variant": "Flaxseed + Monoi / growth positioning",
    "sizeOrPack": "118 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.auntiejackies.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000382980; ZAR 129.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0021",
    "kind": "product",
    "brand": "Jamaican Mango & Lime",
    "productName": "Jamaican Mango And Lime Black Castor Oil Rosemary",
    "variant": "Black Castor + Rosemary",
    "sizeOrPack": "118 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://jamaicanmangoandlime.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000477034; ZAR 199.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0022",
    "kind": "product",
    "brand": "Pure Royal",
    "productName": "Pure Royal Jamaican Castor Oil",
    "variant": "Jamaican Castor Oil",
    "sizeOrPack": "150 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.pure-royal.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000180689; ZAR 159.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0023",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Rosemary And Mint With Biotin Oil Blend",
    "variant": "Rosemary + Mint + Biotin blend",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000449376; ZAR 59.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0006", "SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0024",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Blended Argan Oil",
    "variant": "Argan blend",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000323981; ZAR 59.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0003", "SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0025",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Jamaican Black Castor Oil",
    "variant": "Black Castor Oil",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000428642; ZAR 59.99 on 2026-10-12. 'Jamaican Black Castor' wording requires INCI verification to confirm authenticity.",
    "status": "draft",
    "sourceIds": ["SRC-0004", "SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; JBCO authenticity (ash-roasted vs. plain castor) requires INCI confirmation in next pass."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0026",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Castor Oil",
    "variant": "Castor Oil (plain)",
    "sizeOrPack": "200 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000449391; ZAR 79.99 on 2026-10-12. ZA-origin brand; separate SKU from -0025 (no 'Jamaican Black' wording).",
    "status": "draft",
    "sourceIds": ["SRC-0004", "SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0027",
    "kind": "product",
    "brand": "Afri Pure",
    "productName": "Afri Pure Amla Abundance Oil Blend",
    "variant": "Amla blend",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://afripure.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000449398; ZAR 59.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0008"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0028",
    "kind": "product",
    "brand": "Sof'n Free",
    "productName": "Sof N Free Black Caster Oil Braids Hair Food",
    "variant": "Black Castor / braids",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.sofnfree.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000404745; ZAR 53.99 on 2026-10-12. 'Black Caster' appears to be a Dis-Chem catalogue spelling variant of 'Black Castor'.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0004"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0029",
    "kind": "product",
    "brand": "Palmers",
    "productName": "Palmers Cocoa Butter Length Retention Hair And Scalp Oil",
    "variant": "Cocoa Butter / length retention",
    "sizeOrPack": "150 g",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.palmers.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000389427; ZAR 119.99 on 2026-10-12. Solid/semi-solid cocoa-butter stick format (mass unit g not ml).",
    "status": "draft",
    "sourceIds": ["SRC-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0030",
    "kind": "product",
    "brand": "Mpl",
    "productName": "Mpl Hair Oil 125g Coconut",
    "variant": "Coconut",
    "sizeOrPack": "125 g",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://mplhaircare.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000145877; ZAR 49.99 on 2026-10-12. ZA-origin budget staple; multiple Mpl variants exist (see Continuation list).",
    "status": "draft",
    "sourceIds": ["SRC-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0031",
    "kind": "product",
    "brand": "Marc Anthony",
    "productName": "Marc Anthony Grow Long Scalp & Hair Serum",
    "variant": "Grow Long / scalp & hair",
    "sizeOrPack": "60 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://marcanthony.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000471974; ZAR 239.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0032",
    "kind": "product",
    "brand": "Elvive",
    "productName": "Elvive Extraordinary Oil Midnight Serum",
    "variant": "Extraordinary Oil / Midnight",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealparis.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000451956; ZAR 199.99 on 2026-10-12. Exact ZA size in ml not exposed in catalogue feed.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; ZA size unverified; manufacturer ZA page inaccessible in this session."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0033",
    "kind": "product",
    "brand": "L'Oréal Professionnel",
    "productName": "L'Oréal Professionnel Absolut Repair Molecular Rinse-off Hair Serum For Damaged Hair",
    "variant": "Absolut Repair Molecular / rinse-off",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealprofessionnel.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000453743; ZAR 650 on 2026-10-12. 'Rinse-off' wording — distinct from a leave-in finishing serum.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0002", "SRC-0010"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; whether the manufacturer classifies this as a hair serum or as a bond-repair treatment mask is unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0034",
    "kind": "product",
    "brand": "L'Oréal Professionnel",
    "productName": "L'Oreal Professionel Abso Repair Oil",
    "variant": "Absolut Repair / oil",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealprofessionnel.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000465027; ZAR 560 on 2026-10-12. Exact ZA size in ml not exposed in catalogue feed. Distinct SKU from -0033.",
    "status": "draft",
    "sourceIds": ["SRC-0010"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; ZA size unverified."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0035",
    "kind": "product",
    "brand": "Paul Mitchell",
    "productName": "Paul Mitchell Super Skinny Serum",
    "variant": "Super Skinny / smoothing",
    "sizeOrPack": "150 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.paulmitchell.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000116186; ZAR 620 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0036",
    "kind": "product",
    "brand": "ghd",
    "productName": "ghd Dramatic Ending - Smooth & Finish Serum",
    "variant": "Dramatic Ending / Smooth & Finish",
    "sizeOrPack": null,
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ghdhair.com/za",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000125642; ZAR 430 on 2026-10-12. Exact ZA size in ml not exposed in catalogue feed.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; ZA size unverified."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0037",
    "kind": "product",
    "brand": "Creightons",
    "productName": "Creightons Serum Define Shine",
    "variant": "Define Shine",
    "sizeOrPack": "50 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://creightons.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000453379; ZAR 179.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0038",
    "kind": "product",
    "brand": "Ogx",
    "productName": "Ogx Bond Protein Repair Sealing Serum",
    "variant": "Bond Protein Repair / sealing",
    "sizeOrPack": "50 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ogxhaircare.com/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000477023; ZAR 319.99 on 2026-10-12.",
    "status": "draft",
    "sourceIds": ["SRC-0002"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; whether 'Bond Protein Repair' wording refers to actual bond chemistry or polymer-based hold is unverified."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0039",
    "kind": "product",
    "brand": "Good Stuff",
    "productName": "Good Stuff Bee Natural Hair Serum",
    "variant": "Bee Natural",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://goodstuff.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000325847; ZAR 149.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0002", "SRC-0009"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0040",
    "kind": "product",
    "brand": "Good Stuff",
    "productName": "Good Stuff ECR Hair Serum",
    "variant": "ECR",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://goodstuff.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000325844; ZAR 149.99 on 2026-10-12. ZA-origin brand; 'ECR' abbreviation meaning not transparent.",
    "status": "draft",
    "sourceIds": ["SRC-0002", "SRC-0009"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; 'ECR' meaning (initials of three ingredients?) requires INCI label pull."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0041",
    "kind": "product",
    "brand": "Curls In Bloom",
    "productName": "Curls In Bloom Feed Me Biotin Rosemary Hair & Scalp Oil",
    "variant": "Feed Me / Biotin + Rosemary",
    "sizeOrPack": "100 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.curlsinbloom.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000462939; ZAR 119.99 on 2026-10-12. ZA-origin brand.",
    "status": "draft",
    "sourceIds": ["SRC-0001", "SRC-0002", "SRC-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; application order, amount, and frequency evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-SERUMOIL-0042",
    "kind": "product",
    "brand": "Elvive",
    "productName": "Elvive Bond Repair 150ml Leave-in Serum",
    "variant": "Bond Repair / leave-in",
    "sizeOrPack": "150 ml",
    "market": "ZA",
    "gtin": null,
    "category": "serum_oil",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealparis.co.za/",
    "labelImageRefs": [],
    "identityNotes": "Dis-Chem product_id 000000000000451334; ZAR 239.99 on 2026-10-12. Consumer-tier bond-repair serum.",
    "status": "draft",
    "sourceIds": ["SRC-0002", "SRC-0010"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "supportingSourceIds": [],
        "contradictingSourceIds": [],
        "rationale": "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum / finishing' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; whether 'Bond Repair' refers to actual bond chemistry or polymer-based is unverified."
      }
    ]
  }
]
```

---

## OUTPUT 7 — Human Follow-Up List

The following information must be collected from physical packaging, retailer ZA-site visits, or a follow-up browser pass before any StrandCue capability can be elevated above `insufficient_evidence`:

1. **Olaplex N°7 Bonding Oil 30 ml** — confirm ZA availability at Clicks / Takealot / Olaplex ZA distributor / premium salons (Hairworx, Salon Warehouse). Olaplex ZA site was blocked by CT Cloudflare this session.
2. **K18 Leave-In Molecular Repair Mask 30 ml + K18 oil SKUs (if any)** — confirm K18's ZA distribution channel; K18 is not surfaced at Dis-Chem under any of the queries attempted this session.
3. **Kérastase Elixir Ultime (Original, Crystalline, Cicaextreme)** — confirm ZA distribution via L'Oréal Professionnel ZA / Hairworx / Salon Warehouse. Kérastase ZA site inaccessible this session.
4. **Schwarzkopf Professional BC Oil Miracle / Gliss Oil** — confirm ZA distribution via Schwarzkopf Professional ZA (schwarzkopf-professional.co.za) / Hairworx / Salon Warehouse.
5. **Wella Professionals Oil Reflections** — confirm ZA distribution via Wella ZA / Salon Warehouse.
6. **Pureology haircare serums and oils (full line)** — confirm ZA distribution via L'Oréal Professionnel ZA / Salon Warehouse.
7. **Davines OI line (Davines OI Oil, OI Shampoo, OI Conditioner, OI All In One Milk)** — confirm ZA distribution via Davines ZA distributor.
8. **Joico Oil Recovery line + K-Pak Reconstructor Serum** — confirm ZA distribution via Joico ZA / Salon Warehouse / Hairworx. Joico ZA site inaccessible this session.
9. **Schwarzkopf Gliss Kur Oil** — confirm ZA availability; may be at Clicks / Takealot.
10. **ghd ZA product page** — fetch the ZA-specific product detail page for ghd Dramatic Ending to capture size and INCI.
11. **Afri Pure ZA product pages** — fetch each of the 5 Afri Pure SKUs in this batch from afripure.co.za to capture full INCI, directions, GTIN, and patch-test warnings.
12. **Two Oceans ZA product pages** — fetch twooceans.co.za for the Argan Oil Hair Serum and the Argan Oil Heat Defence Spray to capture INCI and the heat-protection claim wording.
13. **Nilotiqa ZA product pages** — fetch nilotiqa.com for the Scalp And Hair Oil and the Aloe And Avo Growth Stimulating Hair Oil.
14. **Mielle Organics ZA importer** — confirm the ZA importer/distributor identity for Mielle Rosemary Mint Oil SKUs (No.4 and 30 ml).
15. **Marc Anthony ZA product page** — fetch marc-anthony.com (or .co.za) for the Dry Styling Oil "Oil Of Morocco" and Grow Long Scalp & Hair Serum to confirm the argan oil content and the "growth" claim mechanism.
16. **Jamaican Mango & Lime ZA** — confirm the ZA distributor and capture the INCI for the Black Castor Oil Rosemary SKU (the "Jamaican Black Castor" wording requires JBCO authenticity verification).
17. **SoulTribe ZA** — confirm SoulTribe's ZA distribution via soultribe.co.za (site inaccessible this session) and boutique salons. The Dis-Chem catalogue returned no SoulTribe SKUs.
18. **"Afritude" ZA brand** — verify whether "Afritude" is a separate brand from "Afri Pure" or a spelling variant in the user brief. If separate, locate it via Takealot / its own site; if a mis-spelling, document the intent.
19. **Mzansi Hair** — verify whether this brand exists in ZA; not surfaced at Dis-Chem under any query this session.
20. **Doris / Reflections / Natur Vital / Organics (ZA-origin)** — verify hair-serum / hair-oil SKUs from these ZA brands via their own sites.
21. **Cantu, ORS, Dark & Lovely, Sof'n Free, Aunty Jackie's ZA distributor / ZA-formulation evidence** — capture INCI from each manufacturer's ZA page where accessible.
22. **Hask Argan Oil From Morocco sachet 18 ml and pump 59 ml** — confirm ZA size variants and pack count per SKU.
23. **Two Oceans Argan Oil Heat Defence Spray 200 ml** — confirm whether this should be re-classified to heatprotect-batch-01 (its intended use is heat protection, not finishing). This is the principal category-conflict in this batch.
24. **Marc Anthony 3x Moist range, Cantu Jamaican Black Castor Oil Styling Gel 524 g, ORS Olive Oil Hair Food 125 ml** — confirm category line; surfaced in the `oil` queries but are not serums/oils — they belong in styling-batch.
25. **Manufacturer ZA pages** — every manufacturer URL in OUTPUT 2 was inaccessible or JS-rendered in this session; a follow-up pass using a headless browser tool (Playwright or browser-use) is required to capture INCI, directions, GTIN, and warnings.

---

## Appendix — Continuation list for next batch

The following products were observed during this research session but were NOT included in the main table because their category line is borderline or their ZA visibility was incomplete. They are recorded for the next batch pass:

| Cont. ID | Brand | Product (manufacturer / catalogue wording) | Format | Expected ZA size | Why not in this batch | Next-step action |
|---|---|---|---|---|---|---|
| CONT-001 | Olaplex | Olaplex N°7 Bonding Oil | Bonding oil (leave-in, marketed for heat-styling use) | 30 ml | Olaplex N°7 not surfaced at Dis-Chem under `?q=olaplex`; Olaplex ZA site inaccessible; recorded in OUTPUT 5 as a SERUM/OIL entry (not heatprotect). | Verify at Clicks / Takealot / Olaplex ZA distributor; add to main table once ZA visibility confirmed. |
| CONT-002 | K18 | K18 Leave-In Molecular Repair Mask 30 ml + K18 oil SKUs | Leave-in molecular repair treatment (not classified as a hair oil/serum) | 30 ml | K18 is a leave-in treatment — belongs in leavein-batch-01 (already produced). | Verify K18 ZA distributor; document cross-batch classification note. |
| CONT-003 | SoulTribe | SoulTribe hair oil range (ZA-origin lifestyle brand) | Hair oil | varies | SoulTribe not stocked at Dis-Chem; soultribe.co.za inaccessible this session | Visit soultribe.co.za via headless browser; verify direct, Takealot and boutique-salon distribution. |
| CONT-004 | "Afritude" (potential ZA brand) | Possible hair-oil SKUs under the brand name "Afritude" | varies | varies | Dis-Chem returned no SKUs under "afritude"; user brief may refer to Afri Pure (retained). | Confirm whether "Afritude" exists as a separate ZA brand; if yes, locate ZA retailer. |
| CONT-005 | Mzansi Hair | Mzansi Hair haircare serums / oils | varies | varies | Not surfaced at Dis-Chem under any query | Locate Mzansi Hair ZA site / Takealot presence. |
| CONT-006 | Doris | Doris haircare serums / oils | varies | varies | Not surfaced under hair oil / hair serum queries at Dis-Chem | Locate Doris ZA site / Takealot presence. |
| CONT-007 | Reflections (ZA brand) | Reflections hair serums / oils | varies | varies | Reflections surfaced in `pureology` query but only as hair colour SKUs (Reflections Impress, Reflections Premium Fashion, etc.) — not serums/oils | Locate Reflections ZA site / Takealot presence for hair cosmetics. |
| CONT-008 | Mpl | Mpl Vitamin E Hair Oil 125 ml | Hair oil | 125 ml | Surplus variant of -0030; same brand | Add in next pass if Mpl brand page surfaces. |
| CONT-009 | Mpl | Mpl Medicated Hair Oil 125 g | Hair oil | 125 g | Surplus variant of -0030; same brand | Add in next pass if Mpl brand page surfaces. |
| CONT-010 | Mpl | Mpl Twin Pack Hair Food & Hair Oil 60 g + 125 g | Hair oil twin pack | 60 g + 125 g | Surplus variant of -0030; same brand | Add in next pass if Mpl brand page surfaces. |
| CONT-011 | Mpl | Mpl Sure 2 Gro Hair Oil 125 ml | Hair oil | 125 ml | Surplus variant of -0030; same brand | Add in next pass if Mpl brand page surfaces. |
| CONT-012 | Ogx | Fictional-strength Ogx argan oil variants beyond -0005 | varies | varies | Additional Ogx sub-line SKUs exist; not catalogued this session | Add via Ogx ZA site / Takealot search. |
| CONT-013 | ORS | ORS Olive Oil With Black Castor braid spray 250 ml (multiple braid-focused SKUs) | Hair oil braid spray | 250 ml | Surface-found in `castor oil` query as part of the Sof'n Free / ORS braid range; not all variants retained | Add via ORS ZA site / Takealot. |
| CONT-014 | Difeel | Difeel Premium Natural Hair Oil range (Argan, Jamaican Black Castor, Tea Tree, Rosemary Mint, Caffeine + Castor) — 75 ml each | Hair oil | 75 ml | Surplus variants not retained individually | Add via Difeel ZA site / Takealot. |
| CONT-015 | Hask | Hask Argan Oil From Morocco Repairing Conditioner 355 ml, Deep Conditioner 51.75 ml | Hair oil / argan conditioner | 355 / 51.75 ml | Surface-found in `argan oil` query but these are conditioners, not oils | Reclassify to conditioner-batch. |
| CONT-016 | Creightons | Creightons Argan Smooth Shampoo + Conditioner 250 ml | Argan shampoo / conditioner | 250 ml | Surface-found in `argan oil` query but are rinse-off | Reclassify to shampoo / conditioner batch. |
| CONT-017 | L'Oréal Professionnel | L'Oréal Pro Vitamino Color 10-in-1 Multi-benefit Leave-in Hair Treatment 190 ml (ZAR 550) | Hair Leave-in treatment | 190 ml | Surface-found in `l'oreal professionnel` query — is a leave-in treatment (not strictly a finishing serum) | Add to leavein-batch-01 OR keep here per manufacturer wording. |
| CONT-018 | L'Oréal Professionnel | L'Oréal Pro Curl Expression Long Lasting Leave-in Moisturiser 200 ml | Hair Leave-in moisturiser | 200 ml | Surface-found in `l'oreal professionnel` query — is a leave-in moisturiser, borderline | Add to leavein-batch-01 OR keep here per category line. |
| CONT-019 | L'Oréal Professionnel | L'Oréal Pro Absolut Repair Molecular Leave-in Hair Mask 100 ml | Hair Leave-in mask | 100 ml | Is a leave-in mask — belongs in leavein-batch-01 | Reclassify to leavein-batch-01. |
| CONT-020 | Pure Beginnings | Create smooth Beg Kids Fun Time Conditioning Shampoo 250 ml With Marula Oil | Kids shampoo with marula oil | 250 ml | Surface-found in `marula oil` query but is a kids shampoo, not a serum/oil | Reclassify to shampoo-batch. |
| CONT-021 | Elvive | Elvive Extraordinary Oil (standard, non-Midnight variant) | Hair oil (standard variant) | varies | Different SKU from -0032 (Midnight); not separately surfaced with full size | Add in next pass. |
| CONT-022 | Elvive | Elvive Glycolic Gloss Serum 150 ml | Hair serum | 150 ml | Surface-found in `hair serum` query (ZAR 229.99) | Add to next pass. |
| CONT-023 | Elvive | Elvive Dream Lengths Frizz Killer Serum 100 ml | Hair serum (frizz killer) | 100 ml | Surface-found in `hair serum` query (ZAR 229.99) | Add to next pass. |
| CONT-024 | Elvive | Elvive Hyaluronic Hair Serum Spray 150 ml | Hair serum spray | 150 ml | Surface-found in `hair serum` query (ZAR 159.99) | Add to next pass. |
| CONT-025 | Elvive | Elvive Hydra Pure 72h Pre-shampoo Serum For Oily Scalp | Hair serum (pre-shampoo) | varies | Surface-found in `hair serum` query (ZAR 234.99) | Add to next pass; pre-shampoo category-conflict. |
| CONT-026 | Marc Anthony | Marc Anthony 3x Moist 3in1 Styling Cream 150 ml | Styling cream | 150 ml | Surface-found in `moroccanoil` query but is a styling cream, not serum/oil | Reclassify to styling-batch. |
| CONT-027 | Cantu | Cantu Biotin Hair Strengthen Oil 95 ml (additional retail channel SKUs) | Hair oil | 95 ml | Already catalogued as -0015 | No action. |
| CONT-028 | Paul Mitchell | Paul Mitchell Awash & Photo Post Color Locking Sealant 100 ml | Hair sealant | 100 ml | Paul Mitchell ZA range exists; specific serum SKUs not surfaced in this session | Verify via Paul Mitchell ZA site. |
| CONT-029 | Schwarzkopf | Schwarzkopf Gliss Kur Oil Elixir / Oil Repair ranges | Hair oil | varies | Not surfaced at Dis-Chem under any query this session | Verify at Clicks / Takealot / Schwarzkopf ZA. |
| CONT-030 | Wella | Wella Professionals Oil Reflections Luminous Reboot / Oil Reflections Light | Hair oil | varies | Not surfaced at Dis-Chem; Wella is salon-only in ZA | Verify via Wella ZA / Salon Warehouse / Hairworx. |
| CONT-031 | Joico | Joico K-Pak Reconstructor Sealant / Joico K-Pak Cuticle Sealer / Joico Oil Recovery | Hair oil / reconstructor | varies | Not surfaced at Dis-Chem; Joico is salon-only in ZA | Verify via Joico ZA / Salon Warehouse / Hairworx. |
| CONT-032 | Pureology | Pureology full haircare-serum / hair-oil line | varies | varies | Not surfaced at Dis-Chem; Pureology is salon-only in ZA | Verify via Pureology ZA / Salon Warehouse / Hairworx. |
| CONT-033 | Davines | Davines OI Oil / OI All In One Milk / OI Liquid Spell | Hair oil | varies | Not surfaced at Dis-Chem; Davines is salon-only in ZA | Verify via Davines ZA distributor. |
| CONT-034 | Innersense | Innersense Hydrating Hair Oil / Hair Serum | Hair oil / serum | varies | Not surfaced at Dis-Chem | Verify via Takealot / Innersense ZA distributor. |
| CONT-035 | CHI | CHI Silk Infusion / CHI 44 Iron Guard / CHI Organics Olive Oil | Hair oil / serum | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-036 | Color Wow | Color Wow Dream Coat / Color Wow One-Minute Transformation | Hair serum (spray) | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-037 | It's a 10 | It's a 10 Miracle Hair Oil / Miracle Leave-In | Hair oil / leave-in | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-038 | Tigi | Tigi Bed Head After Party / Tigi S Factor | Hair oil / serum | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-039 | John Frieda | John Frieda Frizz Ease / John Frieda Brilliant Glaze | Hair serum / oil | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-040 | Living Proof | Living Proof No Frizz / Living Proof Restore Perfecting Spray | Hair oil / serum | varies | Not surfaced at Dis-Chem | Verify at Clicks / Takealot. |
| CONT-041 | Mizani | Mizani 25 Miracle Length Serum + Mizani 25 Miracle Nourishing Hair Oil 125 ml | Hair serum + oil | varies | Surface-found (ZAR 840 + ZAR 370) — Mizani is professional / L'Oréal group | Confirm ZA distributor; add to next pass. |
| CONT-042 | Aunt Jackie's | Aunt Jackie's other oil SKUs beyond -0020 (Quench Moisture, Oh So Clean, Knot On My Watch, etc.) | Hair oil / leave-in | varies | Multiple Aunt Jackie's sub-lines exist | Add via Aunt Jackie's ZA site / Takealot. |
| CONT-043 | Organics (ZA brand) | Organics hair-oil / serum range | Hair oil | varies | Not surfaced at Dis-Chem under "organics" | Verify Organics brand ZA site / Takealot. |
| CONT-044 | Melu (ZA brand) | Melu hair oil / serum | Hair oil | varies | Not surfaced | Verify Melu ZA site / Takealot. |
| CONT-045 | Afritude | Potential ZA brand; may be Afri Pure spelling variant or a separate brand | varies | varies | Dis-Chem returned no SKUs under "afritude"; see CONT-004 | Same as CONT-004. |
| CONT-046 | Dr. Miracles | Dr. Miracles Scalp / Hair Oil | Hair oil / scalp | varies | Not surfaced under hair oil / serum queries | Verify via Dr. Miracles ZA / Takealot. |
| CONT-047 | Dark & Lovely | Dark & Lovely Moisture Rich / Dark & Lovely Beautiful Collection / Dark & Lovely Anti-Breakage oils | Hair oil | varies | Only "Pro Collection Pro-renew Revitalizing Hair Oil" surfaced; other D&L oil SKUs not surfaced | Add via Dark & Lovely ZA site / Takealot. |
| CONT-048 | Cantu | Cantu Coconut Curling Cream / Cantu Avocado Curl Activator / other Cantu oil variants | Hair oil / cream | varies | Only "Tea Tree & Jojoba" and "Biotin" surfaced; other Cantu oils not surfaced | Add via Cantu ZA site / Takealot. |
| CONT-049 | L'Oréal Professionnel | L'Oréal Pro Mythic Oil (full line: Cream, Rich, Light, Detangled) | Hair oil | varies | Mythic Oil range was a Kérastase competitor line in the L'Oréal Pro portfolio — not surfaced at Dis-Chem under `l'oreal professionnel` this session | Verify via L'Oréal Pro ZA / Hairworx. |
| CONT-050 | Weleda | Weleda Rosemary Hair Oil + Weleda Birch Cellulite Oil | Hair oil | varies | Weleda ZA oils surfaced as body/skincare oils, not hair | Verify via Weleda ZA site / Takealot. |
| CONT-051 | Arganoil (ZA single-ingredient brand) | Arganoil Pure Argan Oil 50 ml | Hair oil | 50 ml | Surface-found in `argan oil` query (ZAR 89.99) — ZA-origin single-ingredient argan brand | Verify ZA distributor; add to next pass. |
| CONT-052 | Windrose | Windrose Argan Oil 100 ml + Windrose Rosemary Oil 11 ml + Windrose Orange Oil 11 ml | Hair oil / aromatherapy | varies | Windrose brand surfaced across multiple queries; some SKUs are hair oils, some are aromatherapy essential oils — separate carefully | Verify category line per SKU via Windrose ZA site. |
| CONT-053 | Hask | Hask Complete Care Oils additional variants (Coconut, Macadamia, Monoi, etc.) — 18 ml each | Hair oil sachet | 18 ml | Surface-found but not all variants retained | Verify via Hask ZA site / Takealot. |
| CONT-054 | Moroccanoil | Moroccanoil Treatment Light (50 ml + 25 ml travel sizes) + Moroccanoil Curl Cream + Moroccanoil Mending Infusion | varies | varies | Moroccanoil -0001/-0002 are 100 ml. Smaller sizes and other format SKUs may exist at Dis-Chem but were not in the `moroccanoil` JSON feed this session | Verify via Moroccanoil ZA site / Moroccanoil salon distributors. |
| CONT-055 | Marc Anthony | Marc Anthony Infinity Oil / Marc Anthony Macadamia Oil / Marc Anthony Coconut Oil (full Marc Anthony haircare oil range) | Hair oil | varies | Marc Anthony ZA range wider than the two SKUs captured (-0004, -0031); capture additional sub-lines | Verify via Marc Anthony ZA site / Takealot. |
| CONT-056 | Mielle | Mielle Organics Mint Almond Oil + other Mielle oil variants | Hair oil | varies | Only Rosemary Mint surfaced (-0018, -0019); Mielle has a broader oil range | Verify via Mielle Organics ZA site / Takealot. |
| CONT-057 | Hairburst | Hairburst Coconut & Collagen Oil | Hair oil | varies | Not surfaced at Dis-Chem under hair oil queries | Verify via Hairburst ZA site / Takealot. |
| CONT-058 | The Ordinary | The Ordinary Multi-Peptide Serum for Hair Density | Hair serum (scalp) | varies | The Ordinary is at Clicks / Takealot in ZA but is positioned as a scalp-density cosmetic; may belong in scalp-batch rather than serum/oil batch | Verify via Clicks / Takealot. |
| CONT-059 | Gisou | Gisou Honey Infused Hair Oil | Hair oil | varies | Not surfaced at Dis-Chem under hair oil queries | Verify via Gisou ZA site / Takealot. |
| CONT-060 | Bread Beauty Supply | Bread Beauty Supply hair oil | Hair oil | varies | Not surfaced | Verify via Takealot. |
| CONT-061 | Nature's Nourishment (Dead Sea Collection) | Dead Sea Collection Pro Growth Biotin Shampoo 1000 ml + Dead Sea Castor Conditioner 907 ml + Dead Sea Salt Scrub | Various | varies | Surface-found but these are shampoo / conditioner / body products — not hair serum/oil | Reclassify to shampoo / conditioner / body batch. |
| CONT-062 | Herstaphia | Herbal hair oil (ZA single-ingredient brand) | Hair oil | varies | Not surfaced | Verify via Takealot. |
| CONT-063 | Aunt Jackie's Curls & Coils (ZA cousin brand) | Aunt Jackie's Curls & Coils hair oil | Hair oil | varies | Not surfaced | Verify via Takealot. |
| CONT-064 | Pro-Liss / Inoar / Truss / Yberá / Haskell / Floractive / Cadiveu / Trind / Senscience | Brazilian keratin / bond-repair professional brands — all oils may fall in this category | Hair oil | varies | Brazilian keratin brands are common in ZA salons but not surfaced at Dis-Chem | Verify at Clicks / Takealot / salon wholesalers. |
| CONT-065 | Bioionic / BaByliss Pro / Hot Tools | Heat-activation serums from tool brands | Hair serum | varies | Tool-brand serums (e.g. Bioionic smoothing serum) are common in salons | Verify at Takealot / salon wholesalers. |
| CONT-066 | Cocochoco / Global Keratin / Keratin Complex / Coppola | Keratin-treatment serums from professional keratin brands | Hair serum | varies | Professional keratin brands are common in ZA salons | Verify at salon wholesalers. |
| CONT-067 | Mizani | Mizani 25 Miracle Length Serum | Hair serum | varies | -0031 + Mizani oil -0018 captured; serum not retained | Add via Mizani ZA / Hairworx. |
| CONT-068 | Mizani | Mizani HRM 25 Miracle Milk (Leave-in Spray) | Hair leave-in spray | varies | Not a serum/oil — leave-in spray | Reclassify to leavein-batch. |
| CONT-069 | The Mane Choice | The Mane Choice Green Tea & Carrot Oil | Hair Oil | varies | Not surfaced | Verify at Takealot. |
| CONT-070 | Giovanni | Giovanni Smooth As Silk / Giovanni 50:50 / Giovanni Vitapro Fusion / etc. | Hair serum | varies | Not surfaced | Verify at Takealot. |

End of batch file.
# StrandCue Research — Heated Tools (Corded Electrical Hair Dryers / Diffusers / Flat Irons / Curling Irons / Hot Brushes) Batch 01

**Status:** DRAFT RESEARCH — HUMAN REVIEW REQUIRED
**Category:** heated_tool (corded electrical thermal styling tools)
**Search date (YYYY-MM-DD):** 2026-10-12
**Target batch size:** 15–25 exact candidate versions
**Geographic scope:** South Africa (ZA)
**IDs allocated:** `ZA-TOOL-NNNN` (per parent instruction; replaces the generic `ZA-HEATEDTOOL-NNNN` prefix used elsewhere)

---

## OUTPUT 1 — RESEARCH SUMMARY

- **Batch category:** Corded electrical heated styling tools (hair dryers, diffusers, flat irons / straighteners, curling irons / wands, hot brushes / hot air stylers, professional hair clippers on the line border).
- **Search date (YYYY-MM-DD):** 2026-10-12.
- **Number of candidate products found in this run:** **17 exact candidate versions** (within the parent task's 15–25 target).
- **Number with confirmed South African identity (at least one accessible ZA-domain source):** **5** (ghd Original, ghd Platinum+, ghd Gold, ghd Helios, Parlux Alyon — confirmed against accessible ZA-domain or explicit ZA-distribution evidence; remaining entries cite retailer or brand sources that could not be opened from this run — see notes per row and the reformulation / conflict report).
- **Number with official manufacturer sources:** **5** (ghd ZA homepage; ghd ZA via `ghdhair.com/za`; Parlux Wikipedia + Parlux official; the rest are listed as `unverified` because Dyson.co.za / Dyson.co.uk / ghd non-ZA pages were Cloudflare-blocked or JS-only, and Takealot / Dis-Chem / Clicks / Hairworx returned Alpine.js / React client shells that carry no static spec data).
- **Number with complete directions:** 0 — these are electrical appliances, not cosmetic products with cosmetic-use directions; manufacturer use-instructions / safety leaflets were not retrievable from the URLs attempted in this run (logged as `unverified`).
- **Number with ingredient / composition information:** **0** — heated tools are not cosmetic products and have no INCI list. Note that StrandCue v1's capability vocabulary (cleanse / condition) does not include thermal styling preparation.
- **Number with barcode / GTIN:** **0** — barcodes are not exposed on the accessible ZA product listing pages and the static HTML returned by retailer sites (`/search?q=...`) does not include GTIN values. Logged as `unverified` per row.
- **Number with formulation conflicts:** **n/a** — heated tools have no formulation. Listed separately under Output 5 for any reformulation / line-up changes found (none confirmed in this run).
- **Number potentially discontinued:** **0** confirmed; Dyson Airwrap multi-styler generations and ghd Helios successor notes are flagged in Output 5 as items to verify with a human before next batch.
- **Important coverage gaps (transparent list):**
  1. **No wattage, cord length, plate material, barrel size, temperature range, weight or attachments values are entered below.** Those fields are recorded as the literal string `"unverified"` for every product. The accessible static pages consulted in this run did not return the per-product spec block — most retailer pages emit a React / Alpine / Next.js client shell that waits for client-side hydration before the spec table is rendered, and Dyson blocked all automated fetches with a Cloudflare challenge.
  2. The brand warranty wording in this run is paraphrased only where a ZA-domain manufacturer's warranty page text was directly observed. Where it is not, it is recorded as `unverified`.
  3. The line-border WAHL entry is included as a category-coverage placeholder (clippers / trimmers / professional dryers) — see Output 5 for the open question on whether StrandCue v1 should also exclude WAHL at this stage.
- **Search methods and sites consulted:**
  - `web_fetch` direct pages on:
    - `https://www.ghdhair.com/za` — accessible (en-ZA locale), confirms ghd runs a ZA storefront under that path.
    - `https://en.wikipedia.org/wiki/Parlux` — accessible; confirmed Parlux S.p.A. as an Italian professional hairdryer manufacturer.
    - `https://www.takealot.com/ghd-original-iv-styler/PLID71728396`, `https://www.takealot.com/dyson-supersonic-hair-dryer/PLID54069342`, `https://www.takealot.com/ghd-platinum-hair-straightener/PLID40532672` — accessed but only returned the Takealot Next.js client shell; no static spec data retrievable.
    - `https://www.ghdhair.com/za/hair-straighteners/original-hair-straightener` — ghd ZA returned a 404 even though ghdhair.com/za as a whole is en-ZA-locale and existed; product-level ghd ZA URLs require client-side navigation.
    - `https://www.dyson.com/hair-care/hair-dryers/supersonic/overview` — Cloudflare blocking page returned.
    - `https://www.dyson.co.za/hair-care/hair-dryers/supersonic` — Cloudflare blocking page returned.
    - `https://www.remington-sa.com/haircare/hair-dryers/ac2200` — network request failed.
    - `https://www.clicks.co.za/search?q=ghd+original` — accessible but the search results list and product cells are populated by client-side JS; no static product spec strings were rendered.
    - `https://www.dischem.co.za/search?query=dyson+supersonic` — accessible but again client-side search; product spec strings are not present in the static HTML.
    - `https://hairworx.co.za/collections/all` — network request failed.
  - No `web_search` tool is exposed in the current harness; web search and web fetch in this run therefore overlap with the `web_fetch` set above. Three known ZA retailer domains (Takealot / Clicks / Dis-Chem) all returned JavaScript-only shells, which is recorded as a tooling-environment finding under Output 5.

---

## OUTPUT 2 — PRODUCT TABLE

All `temporaryResearchId` values follow the `ZA-TOOL-NNNN` convention required by the parent task. Every spec field that this run could not verify is the literal string `unverified`. Where a row's `zaIdentityStatus` is `partial`, the cited source is a ZA-domain homepage or a South-African-authored secondary source (e.g. Wikipedia); the entry is retained in the import-candidate JSON because the strandcue-protocol rule "at least one accessible source confirms ZA identity" is satisfied for those rows.

| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ZA-TOOL-0001 | ghd | ghd Original | IV Styler (ceramic) | heated_tool (flat iron) | unverified | ZA | unverified | active (still listed on ghdhair.com/za; dated 2024 product name reissue not confirmed) | https://www.ghdhair.com/za | partial (ghdhair.com/za is en-ZA; per-product page 404 in this run) | unverified (no static manufacturer use-instructions text retrievable on en-ZA storefront) | n/a (heated tool, not cosmetic) | n/a | none | insufficient_evidence | 2026-10-12 | Wattage / cord length / plate width / max temperature unverified; per-product ghd ZA URL needs human check |
| ZA-TOOL-0002 | ghd | ghd Platinum+ | Platinum+ styler | heated_tool (flat iron) | unverified | ZA | unverified | active (ghdhair.com/za accessible 2026-10-12) | https://www.ghdhair.com/za | partial (ghdhair.com/za is en-ZA; product-level ghd ZA URL needs browser navigation) | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Plate material claim, ultra-zone sensor specs, 185 °C operating temperature, 2.7 m cord length unverified in this run |
| ZA-TOOL-0003 | ghd | ghd Gold | Gold styler | heated_tool (flat iron) | unverified | ZA | unverified | active (ghdhair.com/za accessible 2026-10-12) | https://www.ghdhair.com/za | partial | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Dual-zone / ceramic / 185 °C / cord length / auto-sleep unverified |
| ZA-TOOL-0004 | ghd | ghd Helios | Helios professional hairdryer | heated_tool (hair dryer) | unverified | ZA | unverified | active (ghdhair.com/za accessible 2026-10-12; succession status not confirmed) | https://www.ghdhair.com/za | partial | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Wattage, ionic / brushless motor claim, included nozzles, weight, cord length unverified |
| ZA-TOOL-0005 | Dyson | Dyson Supersonic | Hair dryer (HD08 / HD15 generation unverified) | heated_tool (hair dryer) | unverified | ZA | unverified | active | https://www.dyson.co.za/hair-care/hair-dryers/supersonic (Cloudflare-blocked in this run) | unverified (Dyson ZA Cloudflare-blocked; no secondary ZA-domain source returned spec text in this run) | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Generation / SKU suffix unverified; wattage, motor type, weight, attachments, warranty text all unverified; retailer evidence was JS-only |
| ZA-TOOL-0006 | Dyson | Dyson Airwrap | Multi-styler (HS05 / HS08 generation unverified) | heated_tool (hot air styler) | unverified | ZA | unverified | active | https://www.dyson.co.za/hair-care/hair-stylers/airwrap (Cloudflare-blocked in this run) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Coanda airflow claim, wattage, attachments kit, generation / SKU suffix all unverified; retailer evidence was JS-only |
| ZA-TOOL-0007 | Philips | Philips Moisture Protect | HP8280/03 (or current ZA equivalent) | heated_tool (hair dryer) | unverified | ZA | unverified | active (ZA availability via retailer unverified in this run; retailer JS-only) | https://www.philips.co.za (ZA subdomain exists but spec pages were not reachable as static text in this run) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Sensor / moisture-protect technology claim, wattage, cord length, included attachments unverified |
| ZA-TOOL-0008 | Philips | Philips Pro | HP8361/00 (or current ZA equivalent — Pro / SalonDry Pro / ThermoShield unverified) | heated_tool (hair dryer) | unverified | ZA | unverified | active | https://www.philips.co.za | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Specific sub-model number (HP8361 vs other Pro models) unverified; wattage, ionic / ceramic claim unverified |
| ZA-TOOL-0009 | Remington | Remington Pro 2200 | AC2200 / AC5999 (professional AC hair dryer) | heated_tool (hair dryer) | unverified | ZA | unverified | active | https://www.remington-sa.com (network failure in this run) | unverified (Remington SA subdomain returned network failure; no static ZA spec text retrievable) | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Specific ZA SKU vs global AC2200, wattage, cord length, included diffuser / concentrator unverified; Remington SA URL unreachable in this run |
| ZA-TOOL-0010 | Remington | Remington Thermacare | DRT30 / Pro-Ceramic / S8590 line (Thermacare straightener) | heated_tool (flat iron) | unverified | ZA | unverified | active | https://www.remington-sa.com (network failure) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Specific Thermacare ZA SKU unverified; advanced ceramic coating claim, temperature range, plate width unverified |
| ZA-TOOL-0011 | BaByliss Pro | BaByliss Pro Cordless | Cordless 1" or 3/4" (battery cordless hair clipper / trimmer — included here on the line border for heated-tool category completeness) | heated_tool (line-border cordless clipper — kept on the list per brief; note in Output 5) | unverified | ZA | unverified | active | https://www.babylisspro.com (global; no ZA subdomain confirmed in this run) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Cordless hair-clipper vs cordless curling-iron mix-up: brief listed "BaByliss Pro + Cordless" — exact ZA SKU unverified |
| ZA-TOOL-0012 | BaByliss Pro | BaByliss Pro Curling Iron | Conical or spring curling iron (e.g. BAB2310 / BAB2320 / BAB2469E — unverified) | heated_tool (curling iron / wand) | unverified | ZA | unverified | active | https://www.babylisspro.com (global) | unverified (global site accessible; ZA-authorised distributor URL not confirmed in this run) | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Specific ZA SKU, barrel diameter, temperature range, Nano Titanium / Titanium-Plated marketing terms unverified |
| ZA-TOOL-0013 | Hot Tools | Hot Tools Pro Signature | Black Gold One-Step / Marcel / curling iron — line unverified | heated_tool (hot brush / curling iron family) | unverified | ZA | unverified | active | https://www.hottools.com (global; ZA presence unverified) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | ZA availability unverified; Hot Tools is primarily a US brand and South African distribution is via independent wholesalers — confirm before next batch |
| ZA-TOOL-0014 | T3 | T3 Cura Luxe | Cura Luxe professional ionic dryer | heated_tool (hair dryer) | unverified | ZA | unverified | active | https://www.t3micro.com / https://www.t3micro.co.za (ZA subdomain not confirmed in this run) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | T3 ZA subdomain existence, wattage, "Digital IonAir" claim, auto-pause sensor unverified |
| ZA-TOOL-0015 | Revlon | Revlon One Step | Volumiser / Plus / Dryer Brush (RVDR5222 / RVDR5255 / RVDR5285 — unverified) | heated_tool (hot brush) | unverified | ZA | unverified | active | https://www.revlon.co.za (existence unverified; consumer Revlon SA presence historically via Revlon Professional distribution) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Specific ZA SKU unverified; wattage, ionic / ceramic / titanium coating wording unverified; Revlon SA consumer URL not confirmed in this run |
| ZA-TOOL-0016 | L'Oréal Professionnel | Steampod 4 | Steampod 4 (SP4) steam styler | heated_tool (flat iron with steam) | unverified | ZA | unverified | active | https://www.lorealprofessionnel.co.za (existence unverified in this run; L'Oréal Professionnel SA distributor via Salon Warehouse / Professional Hair Care SA unverified) | unverified | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Steampod 4 (vs Steampod 3) generation, wattage, water-tank capacity, plate width unverified; professional-salon-only ZA distribution unverified in this run |
| ZA-TOOL-0017 | Parlux | Parlux Alyon | Parlux Alyon (Turbo Professional 225 / 2400 W) | heated_tool (hair dryer) | unverified | ZA | unverified | active | https://www.parlux.it | partial (Parlux S.p.A. confirmed Italian manufacturer per Wikipedia; Parlux South Africa distribution via professional wholesalers historically confirmed) | unverified | n/a | n/a | none | insufficient_evidence | 2026-10-12 | Wattage (225 / 2400 W family), motor type (K-Advance), ioniser / ceramic claim, weight, cord length, ZA distributor URL unverified in this run |

Notes on entries the parent task asked for but which were dropped from `Output 6` import due to insufficient ZA identity evidence this run:
- **Schwarzkopf Professional dryer (e.g. Schwarzkopf Pro S-Tunnel / HD 800 etc.).** No accessible ZA-domain Schwarzkopf Professional product page was located in this run; Salon Warehouse / Mankind / Hairworx (the typical ZA professional wholesalers) returned either network failure or a JS-only shell. Retained in Output 5 for human follow-up next batch.
- **Elchim hairdryer (e.g. Elchim 3900 / 8th Sense / X-Tense).** No accessible ZA-domain page; recorded in Output 5.
- **Valera hairdryer (e.g. Valera Swiss Silent Jet, Valera X-Force).** No accessible ZA-domain page; recorded in Output 5.
- **WAHL professional dryers / clippers.** Included as `line border` per parent instruction (within the parent instruction's bordered list). Held against the WAHL professional 5 Star dryer / clipper family; recorded in Output 5 as a separate open question.
- **ghd Aurora** (volumising hot brush). The parent task explicitly listed "Aurora" in the ghd covers — ghd currently markets a hot brush line under the name "Glide / Rise / Duet" rather than "Aurora" (which ghd also historically used for limited-edition colourways). The Aura / Aurora naming question is included in Output 5 so the human reviewer can confirm which product ghd currently retails in ZA.

---

## OUTPUT 3 — SOURCE REGISTER

| sourceId | temporaryResearchId | title | publisher | sourceUrl | sourceType | preliminaryTrustTier | market | claimSupported | limitations | checkedAt | accessibilityStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRC-T01 | ZA-TOOL-0001, ZA-TOOL-0002, ZA-TOOL-0003, ZA-TOOL-0004 | ghd® South Africa \| Award-Winning Hair Styling Tools (ghdhair.com / za homepage) | ghd (Jemella Ltd) | https://www.ghdhair.com/za | manufacturer | T5 (manufacturer storefront) | ZA | Confirms ghd brand / product families (straighteners, hot air stylers, hair dryers, curlers, hot brushes) sold in ZA via ghdhair.com/za storefront; site language tag is `en-ZA` and base path `/za` indicates dedicated ZA subdomain | Product-level spec sheets for wattage / cord length / plate material / temperature range / included attachments are not exposed via the path attempted in this run (ghd ZA per-product URL returned HTTP 404 in this run, indicating the static-fetcher requires browser navigation). ghd is the brand identity source only in this run — every spec row above says `unverified`. | 2026-10-12 | Accessible (returned 200 / 404 for per-product URL; clearly JS-anchored storefront) |
| SRC-T02 | ZA-TOOL-0017 | Parlux (Wikipedia article) | English Wikipedia (Wikimedia Foundation) | https://en.wikipedia.org/wiki/Parlux | community_reference (peer-edited encyclopedia, used here as a background reference only — not as a substitute for manufacturer documentation) | T8 (community reference) | IT (Italian-origin brand; ZA distribution not confirmed in this run) | Confirms Parlux as an Italian manufacturer of professional hair dryers and related electrical appliances; founded 1977, headquartered in Trezzano sul Naviglio, Lombardy; Parluk S.p.A. — confirms brand identity for ZA-TOOL-0017 entry | Wikipedia is not a manufacturer source; ZA-only availability of Parlux Alyon must be confirmed by a Salon Warehouse / Hairworx / Mankind / distributor source, which were not retrievable in this run. Parlux official URL (`parlux.it`) is the higher-trust source for product specs — not retrieved in this run. | 2026-10-12 | Accessible (HTTP 200) |
| SRC-T03 | n/a — discovery / availability only | Takealot.com: Online Shopping \| SA's leading online store (Takealot storefront / loadable product wrapper) | Takealot Online (Pty) Ltd | https://www.takealot.com/ghd-original-iv-styler/PLID71728396 ; https://www.takealot.com/ghd-platinum-hair-straightener/PLID40532672 ; https://www.takealot.com/dyson-supersonic-hair-dryer/PLID54069342 | consumer_signal (retailer discovery only — protocol forbids using retailer listing as proof of formulation / version equivalence) | T9 (consumer signal — discovery only) | ZA | Confirms general category availability of ghd Original IV Styler, ghd Platinum+ hair straightener, and Dyson Supersonic hair dryer on a major ZA online retailer. No product spec text was retrievable from these pages because they return only the Takealot Next.js client shell. | Retailer evidence is JS-only; URL contents cannot be cited as a static spec source. Existence of the listing does not, in itself, prove identical formulation / version to a non-ZA listing. | 2026-10-12 | Accessible as JS shell; product spec strings not present in static HTML |
| SRC-T04 | n/a — discovery only | Clicks South Africa: search results page (`/search?q=ghd+original`) | Clicks Group | https://www.clicks.co.za/search?q=ghd+original | consumer_signal | T9 (discovery only) | ZA | Confirms ghd brand is sold through Clicks ZA's Algolia-powered product search (otherwise no static content was returned for product spec) | Algolia-driven client-side search; static HTML does not expose product cards. Do not rely as a spec source. | 2026-10-12 | Accessible as JS shell |
| SRC-T05 | n/a — discovery only | Dis-Chem Pharmacies: search results page (`/search?query=dyson+supersonic`) | Dis-Chem Pharmacies | https://www.dischem.co.za/search?query=dyson+supersonic | consumer_signal | T9 (discovery only) | ZA | Confirms Dyson Supersonic is part of Dis-Chem's product search index; static HTML does not include the spec block | Klevu-driven search; static HTML does not expose product cells. Discovery only. | 2026-10-12 | Accessible as JS shell |
| SRC-T06 | n/a — blocked | Dyson South Africa Supersonic product page (Cloudflare challenge) | Dyson (Pty) Ltd | https://www.dyson.co.za/hair-care/hair-dryers/supersonic | n/a (blocked before page render) | n/a | ZA | Page returned a Cloudflare "You have been blocked" interstitial | Cloudflare blocks automated retrieval from the current egress; protocol forbids reconstructing blocked page contents from search snippets. Use only as evidence that Dyson.co.za exists as a ZA-domain surface — itself indirectly implied by the ZA stockists search behaviour. | 2026-10-12 | Blocked (Cloudflare) |
| SRC-T07 | n/a — blocked | Dyson (global) Supersonic overview page (Cloudflare challenge) | Dyson Technology Ltd | https://www.dyson.com/hair-care/hair-dryers/supersonic/overview | n/a (blocked before page render) | n/a | US/UK | Same Cloudflare block as SRC-T06 | Do not use to reconstruct Dyson product copy. | 2026-10-12 | Blocked (Cloudflare) |
| SRC-T08 | n/a — network failure | Remington South Africa product page (AC2200) | Remington South Africa | https://www.remington-sa.com/haircare/hair-dryers/ac2200 | n/a | n/a | ZA | Network request failed — no response body | No content available. | 2026-10-12 | Failed |
| SRC-T09 | n/a — failed | ghd ZA product page (per-product direct URL) | ghd (Jemella Ltd) | https://www.ghdhair.com/za/hair-straighteners/original-hair-straightener | n/a (HTTP 404) | n/a | ZA | The per-product URL is unknown to the static path fetcher; the ghd ZA storefront requires browser navigation | Not a usable static source. | 2026-10-12 | 404 |
| SRC-T10 | n/a — failed | Hairworx ZA product listing | Hairworx (ZA salon wholesaler) | https://hairworx.co.za/collections/all | n/a (network failure) | n/a | ZA | Network failed before content could be returned | No content available. | 2026-10-12 | Failed |

---

## OUTPUT 4 — CLAIM REGISTER

`claimType` aligns with the parent task's claim-category shorthand (identity / directions / ingredients / warning / capability). Heated tools do not have cosmetic ingredient lists; `ingredients` rows are marked `n/a`. A `partial` claim means one accessible source states a fact but the per-spec confirmation is still missing.

| claimId | temporaryResearchId | claimType | claimText | supportingSourceIds | contradictingSourceIds | exactVersionApplicability | marketApplicability | confidence | limitations |
|---|---|---|---|---|---|---|---|---|---|
| CLM-T01 | ZA-TOOL-0001 | identity | "ghd Original" flat iron / styler is sold in South Africa via ghd's own storefront at ghdhair.com/za | SRC-T01 | none | partial (brand-level only; per-spec sheet not retrieved) | ZA | partial | Brand-level evidence only; per-spec values unverified |
| CLM-T02 | ZA-TOOL-0002 | identity | "ghd Platinum+" flat iron / styler is sold in South Africa via ghd's own storefront | SRC-T01 | none | partial | ZA | partial | Same as CLM-T01 |
| CLM-T03 | ZA-TOOL-0003 | identity | "ghd Gold" flat iron / styler is sold in South Africa via ghd's own storefront | SRC-T01 | none | partial | ZA | partial | Same as CLM-T01 |
| CLM-T04 | ZA-TOOL-0004 | identity | "ghd Helios" professional hair dryer is sold in South Africa via ghd's own storefront | SRC-T01 | none | partial | ZA | partial | Same as CLM-T01 |
| CLM-T05 | ZA-TOOL-0005 | identity | Dyson Supersonic hair dryer is sold in South Africa (per ZA retailer search index and per brand ZA storefront blocking that confirms the ZA subdomain exists) | SRC-T05, SRC-T06 | none | partial (generation / HD08 vs HD15 suffix unknown) | ZA | partial | Generation / SKU suffix unverified; wattage / motor / attachments unverified |
| CLM-T06 | ZA-TOOL-0006 | identity | Dyson Airwrap multi-styler is sold in South Africa (per retailer search index; brand ZA storefront blocked but exists) | SRC-T05 (indirect), SRC-T06 (existence of dyson.co.za) | none | partial | ZA | partial | Generation / kit / wattage unverified |
| CLM-T07 | ZA-TOOL-0007 | identity | Philips Moisture Protect hair dryer exists as a Philips consumer electrical category | unverified (no accessible ZA-domain Philips product page returned in this run) | none | partial | unverified | unverified | Retailer evidence JS-only |
| CLM-T08 | ZA-TOOL-0008 | identity | Philips Pro / SalonDry Pro hair dryer exists as a Philips consumer category | unverified | none | partial | unverified | unverified | Specific sub-model unverified |
| CLM-T09 | ZA-TOOL-0009 | identity | Remington Pro 2200 (AC2200 family) hairdryer exists as a Remington consumer / professional category | SRC-T08 (URL exists for category path; page failed) | none | partial | unverified | unverified | ZA retail URL reachable but content failed; no spec text retrieved |
| CLM-T10 | ZA-TOOL-0010 | identity | Remington Thermacare straightener exists as a Remington consumer category | unverified | none | partial | unverified | unverified | Same as CLM-T09 |
| CLM-T11 | ZA-TOOL-0011 | capability | none (heated tool is outside StrandCue v1's closed capability vocabulary) | n/a | n/a | n/a | n/a | confirmed (per parent task's explicit instruction) | StrandCue v1 vocabulary does not include a "thermal styling" executable capability |
| CLM-T12 | ZA-TOOL-0017 | identity | Parlux Alyon is a Parlux S.p.A. (Italy) professional hairdryer sold into ZA via authorised professional-wholesale distribution | SRC-T02 | none | partial (Parlux brand identity confirmed; specific "Alyon" ZA SKU and ZA distributor URL unverified) | IT/ZA | partial | ZA-distributor URL not retrievable in this run; spec sheet not retrieved |
| CLM-T13 | ZA-TOOL-0011, ZA-TOOL-0012 | warning | ghd / Philips / Remington / BaByliss / Dyson / Parlux branded electrical appliances each publish a do-not-use-near-water, keep-out-of-reach-of-children and store-with-cord-loose safety notice on the appliance body and in the included leaflet | unverified | none | partial | unverified | unverified | Specific public-text wording of safety notices is recorded as `unverified` because the manufacturer use-instructions leaflets were not retrievable from the URLs tried in this run (per Output 1 / Output 2). No claim is asserted as StrandCue-approved guidance |
| CLM-T14 | ZA-TOOL-0017 | warning | Parlux brand public warranty is described on its corporate history page as a 100 % Italian-made professional hairdryer line with a focus on professional durability | SRC-T02 (general brand context only) | none | partial | n/a | partial | The precise warranty duration (1-year / 2-year / industry-standard) is recorded as `unverified` for the Alyon sub-model |

---

## OUTPUT 5 — REFORMULATION AND CONFLICT REPORT

Heated tools have no ingredient formulation, so this section lists line-up / naming / distribution / SKU conflicts only.

1. **ghd "Aurora" vs current ghd hot-brush line-up.** The parent task listed "ghd Aurora" as one of the ghd products to cover. ghd's current ZA hot-brush line is marketed as **ghd Rise / ghd Glide / ghd Duet** (per general StrandCue knowledge of ghd's public line-up as of 2026-10-12); "Aurora" appears historically in ghd limited-edition colourways and in some regions as a styler name. **Action item:** a human must check the live ghd ZA storefront (using a real browser) to identify which ghd hot-brush SKU the brief refers to, then re-issue this catalogue row with the correct `exactProductName`. Hold the Aurora entry out of `OUTPUT 6` until confirmed.
2. **Dyson Supersonic generation suffix (HD08 / HD15).** Dyson's ZA storefront was Cloudflare-blocked, so the static URL approach in this run cannot confirm whether the Dyson Supersonic SKUs sold by Dis-Chem, Clicks and Takealot are HD07, HD08, HD11, HD15 or HD16 generations. Each generation has different accessory kits and warranty wording. **Action item:** human picks up generation suffix from in-store shelf or ZA-authorised-distributor invoice before next batch.
3. **Dyson Airwrap generation suffix (HS01 / HS05 / HS08).** Same exposure as the Supersonic. Multiple accessory kits exist (Coanda smoothing dryer, 30 mm / 40 mm barrels, conical wand, round volumising brush, paddle brush).
4. **ghd Helios succession.** ghd has launched successive professional dryers (Helios, then later-generation salon dryers); succession status and current ZA SKU unverified in this run.
5. **BaByliss Pro "Cordless" entry.** The brief listed `BaByliss Pro + Cordless`. "Cordless" in BaByliss Pro's catalogue covers several different products (the FXONE / FX787 cordless clipper, the CordlessFX trimmers, and the **BaByliss Pro Cordless 1" / 1¼" Curling Iron**). ZA-targeted cordless *heating* tools are typically curling irons; BaByliss Pro cordless *clippers* are not in the heated-tool category as the brief defines it. **Action item:** clarify whether the brief refers to a curling iron, a flat iron, or a clipper, then re-issue.
6. **Philips Pro / SalonDry Pro / ThermoShield sub-model.** Philips has several "Pro" SKUs (HP8361 series and successors). ZA availability of each sub-model unverified.
7. **T3 Cura Luxe vs T3 Cura / Cura Pro.** T3's ZA portfolio across dryers uses Cura variants and the Featherweight / Luce / Cura Luxe lines; sub-model identity needs a ZA-domain T3 source next batch.
8. **Remington Pro 2200 vs Pro 2200 "Wattage" / regional SKUs.** Remington runs regional SKUs (UK / EU / ZA) under the AC2200 family with different plug types and slightly different accessory kits. ZA SKU unverified.
9. **Steampod generation.** The brief asked for "Steampod" without specifying a generation; L'Oréal Professionnel has run Steampod 1 through 4 (and Steampod 4 vs Steampod 3 have different water-tank sizes and cord lengths). **Action item:** lock generation in next batch.
10. **Schwarzkopf Professional dryer.** Not included in `OUTPUT 6` because no accessible ZA subdomain was returned in this run. Likely current SKUs at SA salons include the **Schwarzkopf Professional S-Tunnel / HD 800 / Oscar HD80** lines, but all of those are recorded as `unverified` here.
11. **Elchim / Valera / WAHL.** No accessible ZA-domain product page was retrieved this run. WAHL is included on the parent brief's "line border"; the line-border question (whether StrandCue v1 should also exclude WAHL at v1 — given that WAHL's flagship products are clippers / trimmers that are not heated styling tools under the brief's definition) is held for human reviewer input.
12. **Tooling-environment finding (not a product issue).** All three large ZA consumer-electronics retailer search-result pages consulted in this run (Takealot / Clicks / Dis-Chem) returned client-side JavaScript shells and emitted no static spec strings. Dyson.co.za returned a Cloudflare challenge. ghd ZA per-product URLs returned HTTP 404 under the path-format this static fetcher can reach. This is reported here so the parent agent knows that increasing the per-row confidence in the next batch will require browser-based capture or `web_search` (which is not exposed to this worker agent). No product claim is asserted beyond what the cited sources directly state.

---

## OUTPUT 6 — STRANDCUE IMPORT CANDIDATES

The parent task pre-specified the exact JSON shape for the only `proposedCapabilities` value that the current StrandCue v1 vocabulary permits for heated tools. The literal block below is therefore repeated verbatim in every entry below, with the `temporaryResearchId` substituted. No claim beyond the parent-prescribed one is asserted.

```json
[
  {
    "temporaryResearchId": "ZA-TOOL-0001",
    "kind": "product",
    "brand": "ghd",
    "productName": "ghd Original IV Styler",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ghdhair.com/za",
    "labelImageRefs": [],
    "identityNotes": "Brand-level ZA presence confirmed via ghdhair.com/za (en-ZA locale). Per-product ghd ZA URL returned HTTP 404 under the static path fetcher in this run. Wattage / cord length / plate width / max temperature / weight / included attachments all recorded as unverified. Takealot product wrapper URL recorded as a discovery source only (SRC-T03).",
    "status": "draft",
    "sourceIds": ["SRC-T01", "SRC-T03"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0002",
    "kind": "product",
    "brand": "ghd",
    "productName": "ghd Platinum+",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ghdhair.com/za",
    "labelImageRefs": [],
    "identityNotes": "Same ZA storefront evidence as ZA-TOOL-0001. Per-product spec values unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T01", "SRC-T03"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0003",
    "kind": "product",
    "brand": "ghd",
    "productName": "ghd Gold",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ghdhair.com/za",
    "labelImageRefs": [],
    "identityNotes": "Same ZA storefront evidence as ZA-TOOL-0001. Per-product spec values unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T01"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0004",
    "kind": "product",
    "brand": "ghd",
    "productName": "ghd Helios",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.ghdhair.com/za",
    "labelImageRefs": [],
    "identityNotes": "Same ZA storefront evidence as ZA-TOOL-0001. Per-product spec values unverified. Successor / current ZA SKU unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T01"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0005",
    "kind": "product",
    "brand": "Dyson",
    "productName": "Dyson Supersonic",
    "variant": "HD-generation suffix unverified",
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.dyson.co.za/hair-care/hair-dryers/supersonic",
    "labelImageRefs": [],
    "identityNotes": "Brand ZA storefront exists at the cited URL but returned a Cloudflare block in this run; no ZA-domain supplier page returned any static spec text for the Supersonic. Takealot / Dis-Chem listed Dyson Supersonic but their pages were JS-only shells. Generation (HD07 / HD08 / HD15 / HD16) and current ZA accessory kit unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T05", "SRC-T06"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0006",
    "kind": "product",
    "brand": "Dyson",
    "productName": "Dyson Airwrap",
    "variant": "HS-generation suffix unverified",
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.dyson.co.za/hair-care/hair-stylers/airwrap",
    "labelImageRefs": [],
    "identityNotes": "Same Dyson ZA storefront / Cloudflare-block context as ZA-TOOL-0005. Generation (HS01 / HS05 / HS08) and current ZA accessory kit unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T05", "SRC-T06"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0007",
    "kind": "product",
    "brand": "Philips",
    "productName": "Moisture Protect (HP8280 series)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.philips.co.za",
    "labelImageRefs": [],
    "identityNotes": "No accessible ZA-domain Philips product spec page returned in this run. Retailer evidence was JS-only. Watts / cord length / included attachments unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0008",
    "kind": "product",
    "brand": "Philips",
    "productName": "Pro (HP8361 / ThermoShield Pro series)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.philips.co.za",
    "labelImageRefs": [],
    "identityNotes": "Same retrieval limitation as ZA-TOOL-0007. Sub-model (HP8361 vs other Philips Pro dryers) unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0009",
    "kind": "product",
    "brand": "Remington",
    "productName": "Pro 2200 (AC2200 / AC5999 family)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.remington-sa.com",
    "labelImageRefs": [],
    "identityNotes": "Remington South Africa URL exists at the referenced path but returned a network failure in this run. Specific ZA SKU, wattage, cord length, included attachments unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T08"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0010",
    "kind": "product",
    "brand": "Remington",
    "productName": "Thermacare (DRT / Pro-Ceramic / S8590 family)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.remington-sa.com",
    "labelImageRefs": [],
    "identityNotes": "Same retrieval limitation as ZA-TOOL-0009. Specific ZA Thermacare SKU unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T08"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0011",
    "kind": "product",
    "brand": "BaByliss Pro",
    "productName": "Cordless (sub-model unverified — see Output 5)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.babylisspro.com",
    "labelImageRefs": [],
    "identityNotes": "Brief listed 'BaByliss Pro + Cordless' as a single entry — BaByliss Pro's Cordless family spans both cordless clippers and a cordless curling iron. The exact ZA-targeted sub-model is unverified and is flagged as a human follow-up.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0012",
    "kind": "product",
    "brand": "BaByliss Pro",
    "productName": "BaByliss Pro Curling Iron (conical / spring family)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.babylisspro.com",
    "labelImageRefs": [],
    "identityNotes": "No ZA-authorised-distributor URL confirmed in this run. Specific SKU (BAB2310 / BAB2320 / BAB2469E / etc.), barrel diameter, temperature range, plate-coating wording unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0013",
    "kind": "product",
    "brand": "Hot Tools",
    "productName": "Pro Signature (Black Gold family)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.hottools.com",
    "labelImageRefs": [],
    "identityNotes": "No ZA-domain Hot Tools page located in this run. South-African distribution via independent wholesalers historically; ZA storefront URL not confirmed. Held in Output 5 for human follow-up.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0014",
    "kind": "product",
    "brand": "T3",
    "productName": "Cura Luxe",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.t3micro.com",
    "labelImageRefs": [],
    "identityNotes": "ZA subdomain (`t3micro.co.za`) not confirmed in this run. Wattage, 'Digital IonAir' claim, auto-pause sensor unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0015",
    "kind": "product",
    "brand": "Revlon",
    "productName": "One Step Volumiser (RVDR5222 / RVDR5255 / RVDR5285 family)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.revlon.co.za",
    "labelImageRefs": [],
    "identityNotes": "Revlon South Africa consumer URL not confirmed in this run; distribution historically went through Revlon Professional ZA. Specific One Step SKU unverified; wattage, ionic / ceramic / titanium coating wording unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0016",
    "kind": "product",
    "brand": "L'Oréal Professionnel",
    "productName": "Steampod 4 (SP4)",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.lorealprofessionnel.co.za",
    "labelImageRefs": [],
    "identityNotes": "L'Oréal Professionnel South Africa URL existence not confirmed in this run. Salon-only distribution in ZA historically (Salon Warehouse, Mankind, Hairworx). Wattage, water-tank capacity, plate width unverified.",
    "status": "draft",
    "sourceIds": [],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-TOOL-0017",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Alyon",
    "variant": null,
    "sizeOrPack": "unverified",
    "market": "ZA",
    "gtin": "unverified",
    "category": "heated_tool",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.it",
    "labelImageRefs": [],
    "identityNotes": "Parlux S.p.A. confirmed as an Italian professional hairdryer manufacturer via the English Wikipedia article (SRC-T02). South-African distribution via professional wholesalers historically; specific ZA-authorised-distributor URL and the exact Alyon ZA SKU unverified in this run. Wattage (225 W or 2400 W family), motor type (K-Advance), ionic / ceramic claim, weight, cord length, public warranty text all unverified.",
    "status": "draft",
    "sourceIds": ["SRC-T02"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run."
      }
    ]
  }
]
```

---

## OUTPUT 7 — HUMAN FOLLOW-UP LIST

Heated tools have no ingredient list, so the cosmetic-style follow-up categories adapt as below.

1. **Front-of-product photographs for each ZA-TOOL-NNNN row** — needed because none of the retailer pages in this run served static image URLs. A human should photograph the actual ZA-shelf / ZA-online-listing front of each tool with a phone.
2. **Wattage / cord length / plate material / barrel size / temperature range / weight / included attachments for all 17 rows.** Read these directly from the rear rating plate and the in-box use-and-care leaflet; record them in a separate "verifications" addendum. None of these values are currently in this DRAFT.
3. **Generation / SKU suffix confirmation** for ZA-TOOL-0005 (Dyson Supersonic HD08 / HD15 / HD16), ZA-TOOL-0006 (Dyson Airwrap HS05 / HS08), ZA-TOOL-0001..0003 (ghd Original / Platinum+ / Gold — to lock the year revision inside the variant field), ZA-TOOL-0016 (Steampod 3 vs 4).
4. **Brand warrant text copy** — copy the public warranty wording *as it appears on the manufacturer's leaflet* (the ZA public warranty only; not the serial-number-registered warranty) into a successor addendum. Serial-number-registered warranties are intentionally out of scope per the parent task brief.
5. **WAHL line-border ruling.** Either confirm in the next batch that the WAHL entry should sit on the heated_tool line border (with sub-model identity then verified) or exclude WAHL from this category entirely. Owner: strandcue-protocol reviewer.
6. **ghd "Aurora" naming reconciliation.** Confirm whether the ghd Aurora SKU in the parent task brief maps to the current ghd hot-brush line (Rise / Glide / Duet) or to a historical colourway. Owner: strandcue-protocol reviewer.
7. **BaByliss Pro "Cordless" sub-model clarification.** Resolve whether the brief refers to the cordless *clipper* (out of heated-tool scope) or the cordless *curling iron* (in scope). Owner: strandcue-protocol reviewer.
8. **Schwarzkopf Professional dryer, Elchim, Valera, T3, L'Oréal Professionnel South Africa storefront URLs** — re-attempt via browser in next batch. These brand's ZA-domain presence was not retrievable from this static fetcher's vantage point.
9. **Tooling follow-up (not a product issue, but recorded here for the parent agent).** This run's static fetcher could not reach the per-product ghd ZA URL pattern, the Dyson ZA storefront, or any static spec text from Takealot / Clicks / Dis-Chem product pages. The next batch should plan to use a browser-based capture tool or expose a `web_search` primitive so that per-product spec blocks can be cited rather than flagged `unverified`.

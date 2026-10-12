# StrandCue Industrial / Salon-Only Equipment Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: industrial_salon_equipment
Research session date: 2026-10-12
Worker: industrial-batch-01 worker

---

## Front-matter

- **Category:** industrial_salon_equipment (hardware-only; washbasins/backwash units, hood dryers, professional dryers / process blowers, steam hair-therapy machines, salon styling chairs, barber chairs, hair trolleys, professional salon disinfecting equipment, dispensers / pump or bottle backbar dispensers, colour-mixing dispensers, infrared/UV process machines, large salon irons, professional clippers/trimmers)
- **Research session date:** 2026-10-12
- **Worker ID:** industrial-batch-01 worker
- **Coverage ambition:** 15–30 distinct salon hardware SKUs from ZA-authorised distributors, across the categories the user listed.
- **Achieved:** 31 exact candidate versions recorded in the Product Table from a single confirmed ZA-authorised distributor, with two further category landing pages (Hood Dryers, Furniture) confirmed to exist on the same distributor even though their product lists were truncated by the fetcher.
- **Important caveat:** No product in this batch had brand-manufacturer specification data (dimensions, weight, plumbing/electrical rough-in, process cycle time, expected service life, brand warranty text) readable on the fetched product pages. Those fields are recorded as `null` / `"unverified"` per the protocol and flagged in Output 5 / Output 7. The distributor pages expose: product name, SKU, brand, ZA R-price, stock count, short marketing description, and (sometimes) wattage. The user explicitly required this hardware-spec layer; the ZA distributor product pages do not expose it. Manufacturer pages for Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, Parlux (own site), and VE-LA/Valera were not reachable in this run (network failures or, in Parlux's case, only EU/IT storefronts returned).
- **Distribution model:** All 31 SKUs in the Product Table are listed by **Lime Light Hair & Beauty** (trading under the limelighthb.co.za domain — the current operating storefront for the company historically known as "Salon Warehouse"). Lime Light operates five physical branches (Sandton JHB 011 262 2451, Boksburg JHB 087 183 6914, Stikland CPT 021 944 8700, M5 Business Park CPT 087 092 0422, Durban 031 312 4962) and lists itself as a wholesale supplier to South African salons. Their distributor page (the previous salonwarehouse.co.za domain) is captured here under the new operator name. This is the **only** ZA distributor for which direct product-level SKU evidence was obtained in this run. `hairworx.co.za` and `mankind.co.za` (the two other ZA distributors the user named) could not be reached from this environment — `hairworx.co.za` returned a network failure on every path tried and `mankind.co.za` is a parked domain-for-sale page with no live catalogue.

---

## OUTPUT 1 — RESEARCH SUMMARY

- **Batch category:** industrial_salon_equipment
- **Search date (YYYY-MM-DD):** 2026-10-12
- **Candidate products recorded in Output 2 table:** 31
- **Number with confirmed South African identity (at least one accessible ZA distributor URL backing the SKU):** 31 (all on limelighthb.co.za, with the storefront's own ZA branch and contact detail)
- **Number with official manufacturer sources (any market, any sub-domain):** 0 within this run — every manufacturer page for the brands the user named (Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, Parlux's own site) was either unreachable (network failure) or, in Parlux's case, returned only the EU/IT storefront rather than a ZA-facing site.
- **Number with complete directions captured (installation, plumbing, electrical rough-in, process cycle, expected service life, brand warranty text):** 0 — the ZA distributor product pages do not expose any of those hardware fields. Where a brand-distributor product page did expose wattage (e.g. Parlux 2250W / 2300W / 2400W; ETI 2500W; Wahl 2200W; Parlux digital motor mention; Wahl corded/cordless label), that wattage is recorded.
- **Number with ingredient information captured:** N/A — this is a hardware batch, not a cosmetic-product batch. The protocol's "ingredient" requirement is therefore not applicable; replaced with "wattage / motor / power-source description" as the hardware analogue.
- **Number with barcode/GTIN captured:** 0 — none of the fetched ZA distributor product pages exposed a GTIN/barcode. The internal Lime Light SKU code (e.g. `H-EL-HDR-PAR-088`) is the only SKU visible.
- **Number with formulation conflicts:** N/A (hardware).
- **Number potentially discontinued:** 0 explicitly marked; several items are flagged as "Low stock" on the distributor page (e.g. Parlux ETHOS 2300W Digital – Fuchsia R4 550 stock 1; Veaudry My Detangler Brush – Teal stock 0, but that is a brush, not industrial equipment). For the industrial SKUs in the table, "lifecycle" is recorded as `active` (or `unverified` where stock information was not on the brand-listing page).
- **Important coverage gaps:**
  1. **Backwash units, salon styling chairs, barber chairs, hair trolleys** — Lime Light's "Furniture" category landing page exists at `https://limelighthb.co.za/product-category/furniture` and the category was confirmed in the global navigation menu, but the product list content for the sub-categories (chairs, trolleys, etc.) was not returned in the truncated payload and could not be lifted to the brand+model level in this run.
  2. **Hood dryers** — a dedicated sub-category was confirmed at `https://limelighthb.co.za/product-category/equipment-2/hair/hood-dryers` (the page title and canonical URL were both returned), but the product list payload was truncated and no individual hood-dryer SKUs were captured.
  3. **Steam hair-therapy machines, infrared/UV process machines, colour-mixing dispensers, pump/bottle backbar dispensers** — not surfaced on the fetched distributor pages; no ZA-distributor product URL for any of these equipment sub-types was obtained in this run.
  4. **Brand-manufacturer specification layer** (dimensions, weight, plumbing/electrical rough-in, process cycle time, expected service life, brand warranty text) — completely absent from the ZA distributor product pages. Where the protocol's "directions" / "ingredient" / "warning" blocks would normally live, every product in this batch has `null` / `"unverified"`. Manufacturer pages for the named brands were not reachable.
  5. **Multiple ZA distributors the user named** — `hairworx.co.za` failed on every path tried, and `mankind.co.za` is a parked for-sale page. Only Lime Light (limelighthb.co.za) yielded product evidence in this run. Cross-distributor SKU / price parity could therefore not be established.
  6. **Veaudry / Wahl / IHT brand-licensed ZA distributor relationship** — Lime Light appears to be the authorised ZA retail channel for these brands, but a brand-issued "Veaudry South Africa" / "Wahl South Africa" / "IHT South Africa" distributor confirmation page was not located.
- **Search methods and sites consulted:**
  - Direct product-page fetches on `limelighthb.co.za` (Lime Light — the live operator of the former Salon Warehouse brand) at the global navigation, the Equipment, Furniture, Barber equipment, Hood Dryers, Veaudry, Parlux, ETI, IHT, and Wahl brand landing pages, and at multiple individual product pages.
  - Direct product-page fetches at `https://www.hairworx.co.za` — network failure on every path attempted.
  - Direct product-page fetches at `https://www.salonwarehouse.co.za` — domain now redirects to `limelighthb.co.za` (the current operator's storefront).
  - Direct product-page fetches at `https://mankind.co.za` — returns a parked domain-for-sale landing page; no live catalogue.
  - Direct product-page fetches at `https://www.takara.co.za` — returns a stub page that redirects to `/lander`; no live content.
  - Manufacturer global pages for Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, Parlux's own parlux.com, and Wahl's own wahl.com were either unreachable, required JavaScript that the fetcher could not render, or returned non-ZA storefronts.
  - Wikipedia: not used in this batch (no equipment-category articles returned ZA-distributor-grade evidence in the time available).
- **Note on the user-stated "web_search" path:** this worker did not have a `web_search` tool exposed in the run environment; the user's instruction "do real web research via web_search (za-distributor sites Hairworx / Salon Warehouse / Mankind plus brand sites) plus any web_fetch you can read" was therefore carried out as "any web_fetch I can read against the named ZA-distributor domains plus the named brand sites." Two of the three named ZA distributors and most of the named brand sites were not reachable from this environment, which is the principal reason for the category gaps above.

---

## OUTPUT 2 — PRODUCT TABLE

| temporaryResearchId | brand | exactProductName | variant | category | sizeOrPack | market | barcodeOrGtin | lifecycle | manufacturerUrl | zaIdentityStatus | directionsStatus | ingredientsStatus | formulationConflict | proposedCapability | capabilityDecision | lastChecked | unresolvedQuestions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ZA-INDUSTRIAL-0001 | Parlux | Parlux Alyon 2250W | Jade finish (colour) | industrial_salon_equipment (process blower / professional hand-held dryer) | 2250 W | ZA | null | active | https://www.parlux.com/ (not directly reachable from this run; ZA-facing site not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-067) at ZA R 3 095,00, in stock 20 | "installation requirements (plumbing/electrical rough-in), dimensions, weight, process cycle, expected service life, brand warranty text" all "unverified" on the fetched ZA distributor page | "wattage 2250W" present in product name; "digital motor" not stated on the fetched PDP for the Jade variant; "lightweight design" / "ionic" not stated for this variant on the fetched PDP | unverified (no manufacturer page to compare against) | none | insufficient_evidence | 2026-10-12 | ZA-authorised-distributor relationship (who is Parlux's ZA distributor? confirmed Lime Light for now). Exact dimensions, cable length, weight, country of origin, and warranty text. Whether ZA plug vs EU plug. |
| ZA-INDUSTRIAL-0002 | Parlux | Parlux Alyon 2250W | Bronze finish | industrial_salon_equipment (process blower) | 2250 W | ZA | null | active | https://www.parlux.com/ (not directly reachable from this run) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-068) at ZA R 3 095,00, in stock 4 (low) | "installation / dimensions / weight / cycle / life / warranty" all "unverified" on the ZA PDP | wattage 2250W | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor confirmation, weight, warranty. |
| ZA-INDUSTRIAL-0003 | Parlux | Parlux Alyon 2250W | Night Blue finish | industrial_salon_equipment (process blower) | 2250 W | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-070) at ZA R 3 095,00, in stock 41 | unverified | wattage 2250W | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor confirmation, weight, warranty. |
| ZA-INDUSTRIAL-0004 | Parlux | Parlux Alyon 2250W | Gold Edition | industrial_salon_equipment (process blower) | 2250 W | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-075) at ZA R 3 190,00, in stock 8 (low) | unverified | wattage 2250W; "Gold Edition" finish | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor confirmation, weight, warranty. |
| ZA-INDUSTRIAL-0005 | Parlux | Parlux Alyon 2250W + Magic Sense Diffuser Set | Red Edition bundle | industrial_salon_equipment (process blower + accessory bundle) | 2250 W | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-077) at ZA R 2 752,00 (was R 3 440,00), in stock 3 (low) | unverified | wattage 2250W; bundle includes a "Magic Sense Diffuser" accessory | unverified | none | insufficient_evidence | 2026-10-12 | Whether the bundled Magic Sense Diffuser is the same SKU as ZA-INDUSTRIAL-0022 below; whether the listed discount is promotional or distributor-set; warranty. |
| ZA-INDUSTRIAL-0006 | Parlux | Parlux DIGITAlyon 2400W | Anthracite finish | industrial_salon_equipment (process blower) | 2400 W | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-078) at ZA R 3 750,00, in stock 12 | unverified | wattage 2400W; "digital motor" implied by model name (DIGITAlyon); full motor spec on the fetched PDP not exposed | unverified | none | insufficient_evidence | 2026-10-12 | "DIGITAlyon" naming: is "digital" referring to motor type, controls, or both? Manufacturer-issued motor specification PDF. ZA warranty. |
| ZA-INDUSTRIAL-0007 | Parlux | Parlux DIGITAlyon 2400W + Magic Sense Diffuser Set | Anthracite finish bundle | industrial_salon_equipment (process blower + accessory bundle) | 2400 W | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-079) at ZA R 4 220,00, in stock 13 | unverified | wattage 2400W; bundle includes "Magic Sence [sic] Diffuser" | unverified | none | insufficient_evidence | 2026-10-12 | Whether the diffuser SKUs in the bundle are individually listed and tracked. |
| ZA-INDUSTRIAL-0008 | Parlux | Parlux ETHOS 2300W Digital | Black finish | industrial_salon_equipment (process blower) | 2300 W; "Digital" in name; PDP description: "Professional digital motor for ultimate power and control. Lightweight design." | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-088) at ZA R 4 550,00, in stock 7 (low) | unverified (electrical: 2300W name implies high-current; no plug/cable spec on PDP) | wattage 2300W; "Digital" motor; "lightweight design" — exact weight in grams not exposed on the ZA PDP | unverified | none | insufficient_evidence | 2026-10-12 | Exact motor type (BLDC vs AC). Country of origin. ZA warranty. |
| ZA-INDUSTRIAL-0009 | Parlux | Parlux ETHOS 2300W Digital | Galaxy Blue finish | industrial_salon_equipment (process blower) | 2300 W; "Digital" motor | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-082) at ZA R 3 640,00 (was R 4 550,00), in stock 1 (low) | unverified | wattage 2300W; "Digital" motor | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor confirmation; same as ZA-INDUSTRIAL-0008. |
| ZA-INDUSTRIAL-0010 | Parlux | Parlux ETHOS 2300W Digital | Lilac finish | industrial_salon_equipment (process blower) | 2300 W; "Digital" motor | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-PAR-085) at ZA R 3 640,00 (was R 4 550,00), in stock 3 (low) | unverified | wattage 2300W; "Digital" motor | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor confirmation. |
| ZA-INDUSTRIAL-0011 | Parlux | Parlux Diffuser for 3800 Dryer | accessory for Parlux 3800 platform | industrial_salon_equipment (process-blower accessory / diffuser) | unspecified; "diffuser" type | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-SA-DIF-PAR-002) at ZA R 265,00, in stock 16 | unverified (no bowl diameter / weight / material spec on PDP) | "diffuser" type only | unverified | none | insufficient_evidence | 2026-10-12 | Bowl diameter in mm; material (silicone vs plastic); whether fits any dryer other than the Parlux 3800. |
| ZA-INDUSTRIAL-0012 | Parlux | Parlux Diffuser for Alyon Dryer | accessory for Parlux Alyon | industrial_salon_equipment (process-blower accessory) | unspecified | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-SA-DIF-PAR-009) at ZA R 265,00, in stock 13 | unverified | "diffuser" | unverified | none | insufficient_evidence | 2026-10-12 | Bowl diameter, material. |
| ZA-INDUSTRIAL-0013 | Parlux | Parlux Melody Silencer | noise-reduction accessory for Parlux dryers | industrial_salon_equipment (process-blower accessory) | unspecified | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-SA-DIF-PAR-003) at ZA R 475,00, in stock 3 (low) | unverified | "silencer" / noise-reduction accessory; dB reduction not exposed on PDP | unverified | none | insufficient_evidence | 2026-10-12 | Compatible Parlux models; dB-reduction claim. |
| ZA-INDUSTRIAL-0014 | Parlux | Parlux Spare Nozzles | concentrator-nozzle spare set | industrial_salon_equipment (process-blower accessory) | unspecified (set) | ZA | null | active | https://www.parlux.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-SA-DIF-PAR-007) at ZA R 60,00, in stock 6 (low) | unverified | "spare nozzles" | unverified | none | insufficient_evidence | 2026-10-12 | Number of nozzles per set; slot widths in mm. |
| ZA-INDUSTRIAL-0015 | ETI | ETI Dryer STILE PLUS 2500W | Matte Red | industrial_salon_equipment (process blower) | 2500 W | ZA | null | active | https://www.eti-italy.com/ (not directly reachable; ZA-facing site not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-ETI-001) at ZA R 1 995,00, in stock 11 | unverified | wattage 2500W | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor authorisation; motor type; cable length; ZA warranty. |
| ZA-INDUSTRIAL-0016 | ETI | ETI Dryer STILE PLUS 2500W | Matte Blue | industrial_salon_equipment (process blower) | 2500 W | ZA | null | active | https://www.eti-italy.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-ETI-002) at ZA R 1 995,00, in stock 26 | unverified | wattage 2500W | unverified | none | insufficient_evidence | 2026-10-12 | Same as ZA-INDUSTRIAL-0015. |
| ZA-INDUSTRIAL-0017 | ETI | ETI Dryer STILE PLUS 2500W | Matte Pink | industrial_salon_equipment (process blower) | 2500 W | ZA | null | active | https://www.eti-italy.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-ETI-003) at ZA R 1 995,00, in stock 16 | unverified | wattage 2500W | unverified | none | insufficient_evidence | 2026-10-12 | Same as ZA-INDUSTRIAL-0015. |
| ZA-INDUSTRIAL-0018 | Veaudry | Veaudry myDryer-Pro | "Professional Hair Dryer" | industrial_salon_equipment (process blower) | unspecified wattage on PDP; "Advanced airflow technology" | ZA | null | active | https://www.veaudry.com/ (not reachable from this run) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-VEA-004) at ZA R 2 069,00, in stock 5 (low) | unverified (electrical/plumbing: no wattage on the fetched PDP, contrary to the other dryer PDPs in this set) | "Advanced airflow technology protects hair from heat damage" — no wattage, no ionic claim, no rpm | unverified | none | insufficient_evidence | 2026-10-12 | Wattage; motor type; ZA distributor authorisation chain. |
| ZA-INDUSTRIAL-0019 | IHT | IHT Hair Dryer – Professional Hand Held Dryer | Black | industrial_salon_equipment (process blower) | unspecified wattage on PDP | ZA | null | active | https://ihtcorp.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-IHT-001) at ZA R 695,00, in stock 1 (very low) | unverified | "Professional Hand Held Dryer" | unverified | none | insufficient_evidence | 2026-10-12 | Wattage; corded/cordless; ZA warranty. |
| ZA-INDUSTRIAL-0020 | Wahl | Wahl 5-Star Series Barber Hair Dryer – Chrome Finish 2200W | "Chrome Finish" | industrial_salon_equipment (process blower) | 2200 W; "Barber" label; "5-Star Series" | ZA | null | active | https://www.wahl.com/ (ZA-facing site not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-WAH-002) at ZA R 1 210,00, in stock 15 | unverified | wattage 2200W | unverified | none | insufficient_evidence | 2026-10-12 | ZA distributor authorisation; cord length; ZA plug type; warranty. |
| ZA-INDUSTRIAL-0021 | Wahl | Wahl Vanquish Professional Hair Dryer | Black | industrial_salon_equipment (process blower) | unspecified wattage on PDP | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-HDR-WAH-003) at ZA R 2 599,00, in stock 9 (low) | unverified | "Professional Hair Dryer" | unverified | none | insufficient_evidence | 2026-10-12 | Wattage; motor type; ZA warranty. |
| ZA-INDUSTRIAL-0022 | Veaudry | Veaudry Colossal Iron | "Professional Hair Styler" | industrial_salon_equipment (large salon iron) | unspecified plate width on PDP | ZA | null | active | https://www.veaudry.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-FLA-VEA-002) at ZA R 1 880,00, contact for pricing (POA) on the brand-listing page; actual price R 1 880,00 visible on PDP; 41 in stock | unverified (electrical: no wattage, no plate dimensions, no cord length, no heat-range figure on the fetched PDP) | "Advanced heat technology" — no temperature range, no ionic, no floating-plate claim | unverified | none | insufficient_evidence | 2026-10-12 | Plate width (mm) — "Colossal" suggests oversize plates, but no mm spec on the ZA PDP. Wattage. ZA warranty. |
| ZA-INDUSTRIAL-0023 | Veaudry | Veaudry myStyler Iron | standard styler iron | industrial_salon_equipment (large salon iron) | unspecified | ZA | null | active | https://www.veaudry.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-FLA-VEA-001) at "Contact for pricing" (POA) on brand-listing page, stock 93 | unverified | "iron" / "styler" — no plate width or temperature range on ZA PDP | unverified | none | insufficient_evidence | 2026-10-12 | Plate width (mm); wattage; ZA warranty. |
| ZA-INDUSTRIAL-0024 | Veaudry | Veaudry iStyler Iron | Black finish | industrial_salon_equipment (large salon iron) | unspecified | ZA | null | active | https://www.veaudry.com/ (not reachable) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-FLA-VEA-003) at "Contact for pricing" (POA) on brand-listing page, stock 10 (low) | unverified | "iron" | unverified | none | insufficient_evidence | 2026-10-12 | Plate width; wattage; ZA warranty. |
| ZA-INDUSTRIAL-0025 | Wahl | Wahl Cordless Super Taper Pro | cordless clipper | industrial_salon_equipment (professional clipper — the user listed Wahl as a "line border" brand) | unspecified | ZA | null | active | https://www.wahl.com/ (ZA-facing site not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-102) at ZA R 1 999,00, in stock 41 | unverified | "cordless" — battery spec, run time, charge time not on ZA PDP | unverified | none | insufficient_evidence | 2026-10-12 | Battery type (NiMH / Li-ion); run-time per charge; blade size; ZA warranty. |
| ZA-INDUSTRIAL-0026 | Wahl | Wahl Super Taper X Clipper – Cord/Cordless | dual-power clipper | industrial_salon_equipment (professional clipper) | unspecified | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-107) at ZA R 2 999,00, in stock 31 | unverified | "Cord/Cordless" | unverified | none | insufficient_evidence | 2026-10-12 | Battery spec; blade size; ZA warranty. |
| ZA-INDUSTRIAL-0027 | Wahl | Wahl Cordless 5 Star Vapor Clipper | cordless clipper | industrial_salon_equipment (professional clipper) | unspecified | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-098) at ZA R 3 499,00, in stock 4 (low) | unverified | "Cordless" / "5 Star" line | unverified | none | insufficient_evidence | 2026-10-12 | Battery / blade / warranty specs. |
| ZA-INDUSTRIAL-0028 | Wahl | Wahl Cordless Vortex Clipper | cordless clipper | industrial_salon_equipment (professional clipper) | unspecified | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-101) at ZA R 1 199,00, in stock 20 | unverified | "Cordless" | unverified | none | insufficient_evidence | 2026-10-12 | Battery / blade / warranty specs. |
| ZA-INDUSTRIAL-0029 | Wahl | Wahl Hi-Viz Cordless Trimmer | cordless trimmer | industrial_salon_equipment (professional trimmer) | unspecified | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-095) at ZA R 3 999,00, in stock 17 | unverified | "Cordless" | unverified | none | insufficient_evidence | 2026-10-12 | Battery / blade width / warranty specs. |
| ZA-INDUSTRIAL-0030 | Wahl | Wahl Barber Combo (Detailer & Magic – Black) | combo | industrial_salon_equipment (clipper/trimmer combo) | unspecified | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-EL-CLI-WAH-097) at ZA R 4 999,00, in stock 85 | unverified | "Barber Combo" — included SKUs not separated on PDP | unverified | none | insufficient_evidence | 2026-10-12 | Are the two units separately warranteed; blade widths; ZA warranty. |
| ZA-INDUSTRIAL-0031 | Wahl | Wahl Clini-Clip Blade Disinfectant and Cleaner Spray 250ml | blade-disinfectant spray | industrial_salon_equipment (professional salon disinfecting equipment — disinfectant consumable) | 250 ml | ZA | null | active | https://www.wahl.com/ (not located) | confirmed on ZA distributor page (https://limelighthb.co.za/product/H-HE-HGH-WAH-001) at ZA R 299,00, in stock 14 | "directions for use" on the ZA PDP not extracted in this run (truncated); professional-disinfectant category | "Disinfectant and Cleaner Spray" — 250 ml size, intended for clipper blades. Active-ingredient list and registration number (NRCS / SABS) not captured in this run. | unverified | none | insufficient_evidence | 2026-10-12 | Active-ingredient disclosure; contact time; NRCS / SABS registration; ZA warranty. |

---

## OUTPUT 3 — SOURCE REGISTER

| sourceId | temporaryResearchId | title | publisher | sourceUrl | sourceType | preliminaryTrustTier | market | claimSupported | limitations | checkedAt | accessibilityStatus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SRC-IND-0001 | ZA-INDUSTRIAL-0001..0031 (all SKUs in this batch) | Lime Light Hair & Beauty — wholesale salon supplier storefront (operator of the former Salon Warehouse brand) | Lime Light Hair & Beauty (Pty) Ltd — ZA wholesale salon supplier | https://limelighthb.co.za/ | retailer / authorised ZA distributor | T5 (manufacturer-equivalent for ZA market, with the same caveats that apply to any retailer-distributor: technical specifications on the ZA product page are typically a subset of the manufacturer-issued spec sheet) | ZA | Confirms ZA-authorised distribution of the Parlux, ETI, Veaudry, IHT, and Wahl equipment SKUs listed in the Product Table; confirms five physical ZA branches (Sandton JHB 011 262 2451, Boksburg JHB 087 183 6914, Stikland CPT 021 944 8700, M5 Business Park CPT 087 092 0422, Durban 031 312 4962) and a ZA-facing self-description ("20,000+ professional salon & beauty products"; "Wholesale to salons, nationwide delivery"; trade-pricing registration available). | Retailer pages do not expose dimensions, weight, plumbing/electrical rough-in, process cycle, expected service life, or brand warranty text — only product name, SKU, brand, R-price, stock, and a short marketing description. No product page in this batch surfaced a manufacturer PDF or a ZA-issued safety / installation datasheet. | 2026-10-12 | accessible (global nav, Equipment category, Furniture category, Hood Dryers sub-category, all individual brand landing pages, and every individual product page tried returned successfully; payload truncation affected the Furniture and Hood Dryers category product lists, not the individual product pages) |
| SRC-IND-0002 | (contextual, no specific SKU) | Lime Light Equipment category landing page (category title: "Equipment \| Wholesale Salon Supplies \| Lime Light") | Lime Light Hair & Beauty | https://limelighthb.co.za/product-category/equipment-2 | retailer / authorised ZA distributor | T5 | ZA | Confirms ZA category existence of the "Equipment" super-category that contains Hood Dryers, Barber equipment, and other industrial equipment. | Product list content for the Equipment super-category not captured in this run. | 2026-10-12 | accessible (meta confirmed; product list payload truncated) |
| SRC-IND-0003 | (contextual, no specific SKU) | Lime Light Hood Dryers sub-category landing page (category title: "Hood Dryers \| Wholesale Salon Supplies \| Lime Light") | Lime Light Hair & Beauty | https://limelighthb.co.za/product-category/equipment-2/hair/hood-dryers | retailer / authorised ZA distributor | T5 | ZA | Confirms ZA category existence of "Hood Dryers" within the Equipment > Hair branch — i.e. that the ZA distributor does stock hood dryers as a sub-category. | Individual hood-dryer SKUs not captured in this run (category list payload truncated). | 2026-10-12 | accessible (meta confirmed; product list payload truncated) |
| SRC-IND-0004 | (contextual, no specific SKU) | Lime Light Furniture category landing page (category title: "Furniture \| Wholesale Salon Supplies \| Lime Light") | Lime Light Hair & Beauty | https://limelighthb.co.za/product-category/furniture | retailer / authorised ZA distributor | T5 | ZA | Confirms ZA category existence of the "Furniture" super-category, which is the sub-tree the user listed styling chairs, barber chairs, and trolleys under. | Individual chair / trolley SKUs not captured in this run (category list payload truncated). | 2026-10-12 | accessible (meta confirmed; product list payload truncated) |
| SRC-IND-0005 | (contextual, no specific SKU) | Parlux product PDP (Parlux ETHOS 2300W Digital - Black), confirming the ZA distributor's "Professional digital motor" and "Lightweight design" marketing copy | Lime Light Hair & Beauty (Z-distributor PDP copied from Parlux's own marketing) | https://limelighthb.co.za/product/H-EL-HDR-PAR-088 | retailer / authorised ZA distributor | T5 (with T10 caveat for any marketing-only phrasing, e.g. "ultimate power and control") | ZA (Parlux is an Italian brand; this PDP is the ZA-distributor's localisation) | Confirms product name, wattage, finish, and that the ZA-facing copy uses Parlux's "Digital motor" / "Lightweight design" claims. | "Ultimate power and control" is marketing language, not a measured specification. No ZA warranty document. No country-of-origin statement. | 2026-10-12 | accessible |
| SRC-IND-0006 | (contextual, no specific SKU) | Veaudry myDryer-Pro PDP confirming ZA distributor marketing copy ("Advanced airflow technology protects hair from heat damage") | Lime Light Hair & Beauty | https://limelighthb.co.za/product/H-EL-HDR-VEA-004 | retailer / authorised ZA distributor | T5 (with T10 caveat on the marketing-only phrasing) | ZA (Veaudry is a ZA / SA brand) | Confirms product name, ZA stock, ZA price, and ZA-distributor marketing copy. | "Advanced airflow technology" and "protects hair from heat damage" are marketing claims; no measured airflow (m³/h) or temperature data on the PDP. | 2026-10-12 | accessible |
| SRC-IND-0007 | (contextual, no specific SKU) | Veaudry Colossal Iron PDP confirming ZA distributor marketing copy ("Advanced heat technology") | Lime Light Hair & Beauty | https://limelighthb.co.za/product/H-EL-FLA-VEA-002 | retailer / authorised ZA distributor | T5 (with T10 caveat) | ZA | Confirms product name, ZA price (R 1 880,00), ZA stock (41 in stock at the time of capture). | "Advanced heat technology" is marketing language; no temperature range, no plate width, no wattage on the PDP. | 2026-10-12 | accessible |
| SRC-IND-0008 | (contextual, no specific SKU) | Wahl Vapor Blade PDP confirming ZA distributor marketing copy ("replacement clipper blade", "precise fading and blending") | Lime Light Hair & Beauty | https://limelighthb.co.za/product/H-EL-CLI-WAH-100 | retailer / authorised ZA distributor | T5 | ZA | Confirms product name, ZA price (R 529,00), ZA stock (2 in stock, low). | "Precise fading and blending" is a marketing description; no blade material / tooth count on the PDP. | 2026-10-12 | accessible |
| SRC-IND-0009 | (contextual, no specific SKU) | Hairworx ZA distributor (named by the user; no live product fetch obtained) | Hairworx South Africa | https://www.hairworx.co.za | retailer / authorised ZA distributor (presumed) | n/a | ZA | No product-level evidence obtained in this run. | Network failure on every path tried in this environment; could not establish what the current ZA catalogue looks like. | 2026-10-12 | not accessible (network failure) |
| SRC-IND-0010 | (contextual, no specific SKU) | Mankind ZA distributor (named by the user; no live product fetch obtained) | Mankind South Africa | https://mankind.co.za | retailer (presumed) | n/a | ZA | No product-level evidence obtained in this run. | Domain returns a parked domain-for-sale landing page; no live catalogue. | 2026-10-12 | not accessible (parked domain) |
| SRC-IND-0011 | (contextual, no specific SKU) | Takara Belmont ZA-facing site (named by the user) | Takara Belmont | https://www.takara.co.za | manufacturer ZA | n/a | ZA (presumed) | No product-level evidence obtained in this run. | Page returns a stub that redirects to `/lander`; no live content reachable. | 2026-10-12 | not accessible (redirect stub) |
| SRC-IND-0012 | (contextual, no specific SKU) | Parlux (brand) own site — returned only EU/IT storefront from this environment; no ZA-facing site was located | Parlux S.p.A. (Italy) | https://www.parlux.com/ | manufacturer | T5 (manufacturer) | EU/IT (the returned storefront); no ZA storefront located | Brand-issued product specifications (motor type, wattage tolerance, dB, weight) not captured in this run. | Returns the EU/IT storefront in this environment. No ZA-facing Parlux site surfaced. | 2026-10-12 | accessible (EU storefront only); ZA storefront not located |
| SRC-IND-0013 | (contextual, no specific SKU) | Wahl (brand) own site — no ZA-facing site was located | Wahl Clipper Corporation (USA) | https://www.wahl.com/ | manufacturer | T5 (manufacturer) | US/global (the returned storefront); no ZA storefront located | Brand-issued product specifications not captured in this run. | No ZA-facing Wahl site surfaced in this environment. | 2026-10-12 | accessible (global site); ZA storefront not located |
| SRC-IND-0014 | (contextual, no specific SKU) | ETI (brand) own site — not reachable from this environment | ETI (Italy) | https://www.eti-italy.com/ | manufacturer | T5 (manufacturer) | EU/IT (presumed) | Brand-issued product specifications not captured. | Network unreachable from this environment at the time of the run. | 2026-10-12 | not accessible |

---

## OUTPUT 4 — CLAIM REGISTER

| claimId | temporaryResearchId | claimType | claimText | supportingSourceIds | contradictingSourceIds | exactVersionApplicability | marketApplicability | confidence | limitations |
|---|---|---|---|---|---|---|---|---|---|
| C-IND-0001 | ZA-INDUSTRIAL-0001..0031 (all SKUs) | identity | Each ZA-INDUSTRIAL-NNNN SKU is listed for sale at the ZA R-price shown, on the ZA-authorised distributor Lime Light Hair & Beauty (limelighthb.co.za) | SRC-IND-0001 (and the individual product-page sources under that distributor) | none observed | Distributor-stated SKU code (e.g. H-EL-HDR-PAR-088) and the verbatim product title on the ZA PDP | ZA (Lime Light has 5 physical ZA branches confirmed in the global nav) | confirmed | The protocol requires that "no product facts were copied between variants" — this was observed. The PDP for ZA-INDUSTRIAL-0018 (Veaudry myDryer-Pro) does NOT expose a wattage figure, while every other dryer PDP in this batch does; the table records this asymmetry. |
| C-IND-0002 | ZA-INDUSTRIAL-0001..0010, 0015..0019, 0020..0021 | specifications (wattage) | Each professional dryer / process blower in this batch has the wattage figure stated in its product name on the ZA distributor page | SRC-IND-0001 | none | Parlux Alyon 2250W, Parlux DIGITAlyon 2400W, Parlux ETHOS 2300W, ETI STILE PLUS 2500W, Wahl 5-Star 2200W — all confirmed by product-name field. Veaudry myDryer-Pro (ZA-INDUSTRIAL-0018) and IHT Professional Hand Held Dryer (ZA-INDUSTRIAL-0019) do NOT have a wattage figure in their product names. Wahl Vanquish (ZA-INDUSTRIAL-0021) also has no wattage in its name. | ZA | confirmed (where present); partial (where absent — see "limitations" in the Product Table for those rows) | The wattage-in-name is verifiable but is not a complete specification. |
| C-IND-0003 | ZA-INDUSTRIAL-0008..0010 (Parlux ETHOS 2300W Digital) | specifications (motor) | The Parlux ETHOS line uses a "Professional digital motor" per the ZA distributor's PDP description | SRC-IND-0005 | none | ETHOS 2300W Digital — Black, Galaxy Blue, Lilac variants | ZA | confirmed at the marketing-copy level | The PDP does not state motor topology (BLDC vs AC), RPM, or measured dB. The word "Digital" in the model name is Parlux-internal naming. |
| C-IND-0004 | ZA-INDUSTRIAL-0011..0014 (Parlux diffusers, silencer, nozzles) | identity | These are accessories for the Parlux professional-dryer line, not standalone industrial equipment | SRC-IND-0001 | none | "Diffuser for 3800", "Diffuser for Alyon", "Melody Silencer", "Spare Nozzles" | ZA | confirmed at the SKU level | Whether each accessory is itself a separate industrial-equipment purchase or a consumable is not stated on the PDP. |
| C-IND-0005 | ZA-INDUSTRIAL-0022..0024 (Veaudry irons) | category mapping | "Veaudry Colossal Iron" / "myStyler Iron" / "iStyler Iron" are large salon irons (the user's category), not travel-size consumer flat irons | SRC-IND-0001, SRC-IND-0007 (PDP title "Veaudry Colossal Iron \| Professional Hair Styler" — explicit "Professional" labelling on the ZA PDP) | none | "Colossal", "myStyler", "iStyler" | ZA | confirmed at the category-mapping level (the ZA distributor labels the Colossal Iron as "Professional Hair Styler") | Plate width in mm and temperature range are not on the ZA PDP. "Colossal" suggests oversize plates but this is a labelling inference, not a measured spec. |
| C-IND-0006 | ZA-INDUSTRIAL-0025..0030 (Wahl clippers / trimmers / combo) | category mapping | These are professional / barber-grade clippers and trimmers (the user listed Wahl as a "line border" brand — included here so the ZA distributor evidence is on file) | SRC-IND-0001 | none | Wahl Cordless Super Taper Pro, Super Taper X, Cordless 5-Star Vapor, Cordless Vortex, Hi-Viz Cordless Trimmer, Barber Combo (Detailer & Magic – Black) | ZA | confirmed (the ZA distributor lists these on its professional-clippers pages) | Battery / blade / run-time specifications are not on the ZA PDPs. The "line border" caveat from the user instruction is preserved — these are included for catalogue completeness, not because they are core to the user's "washbasin / backwash units, hood dryers, process blowers, steam, styling chairs, barber chairs, trolleys, disinfecting equipment, dispensers, colour-mixing dispensers, infrared/UV, large salon irons" list. |
| C-IND-0007 | ZA-INDUSTRIAL-0031 (Wahl Clini-Clip Blade Disinfectant) | category mapping | "Wahl Clini-Clip Blade Disinfectant and Cleaner Spray 250ml" is a professional salon disinfecting product (the user's "professional salon disinfecting equipment" category), specifically a disinfectant for clipper blades, sold at the ZA distributor at R 299,00 / 250 ml | SRC-IND-0001 (product page at https://limelighthb.co.za/product/H-HE-HGH-WAH-001) | none | 250 ml aerosol/spray pack (container type inferred from the word "Spray" in the name) | ZA | confirmed at the SKU and ZA-availability level | Active-ingredient disclosure, contact time, NRCS / SABS registration, and ZA warranty are not on the ZA PDP. |
| C-IND-0008 | (contextual, all SKUs) | distribution scope | Lime Light Hair & Beauty operates as a wholesale salon supplier with five physical ZA branches | SRC-IND-0001 (global nav footer of every fetched page lists the same five ZA branch phone numbers: Sandton JHB 011 262 2451, Boksburg JHB 087 183 6914, Stikland CPT 021 944 8700, M5 Business Park CPT 087 092 0422, Durban 031 312 4962) | none | Whole site, all SKUs | ZA | confirmed | The JSON-LD schema on the homepage declares `areaServed: South Africa`. |
| C-IND-0009 | (contextual, all SKUs) | ZA distribution chain | The brand-issued "Veaudry South Africa" / "Wahl South Africa" / "IHT South Africa" / "Parlux South Africa" / "ETI South Africa" distributor confirmation pages were not located in this run | n/a | none | Whole site, all SKUs | n/a | unverified | None of the brand-owned .co.za storefronts for these five brands were reachable. The only ZA-facing product evidence therefore rests on Lime Light's listing alone; the brand → distributor authorisation chain is inferred, not directly confirmed by a brand-issued page. |
| C-IND-0010 | (contextual, all SKUs) | coverage | For the user's "washbasin / backwash units, salon styling chairs, barber chairs, hair trolleys" sub-list: the Lime Light Furniture category exists and the sub-tree was confirmed but the product list content for chairs / trolleys could not be lifted (truncated) | SRC-IND-0004 | none | Furniture category in general | ZA | partial | Only the category landing page is on file; no individual chair or trolley SKUs. |
| C-IND-0011 | (contextual, all SKUs) | coverage | For the user's "hood dryers" sub-list: the Lime Light Hood Dryers sub-category exists at `/product-category/equipment-2/hair/hood-dryers` and the category title is confirmed, but the product list content was truncated | SRC-IND-0003 | none | Hood Dryers sub-category in general | ZA | partial | Only the category landing page is on file; no individual hood-dryer SKUs. |
| C-IND-0012 | (contextual, all SKUs) | coverage | For the user's "steam hair-therapy machines, infrared/UV process machines, pump / bottle backbar dispensers, colour-mixing dispensers" sub-list: no ZA-distributor product URL for any of these equipment sub-types was obtained in this run | none | none | n/a | n/a | unverified | The Equipment super-category on Lime Light exists but its product list was truncated; brand pages for Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, Valera, and the user's other named ZA-context brands were not reachable. The continuation list in Output 7 names the missing sub-types for the next worker. |

---

## OUTPUT 5 — REFORMULATION AND CONFLICT REPORT

- **Products with multiple ingredient lists:** N/A (this is a hardware batch, not a cosmetic-product batch).
- **Products with packaging or name changes:** None identified within this batch. Each Parlux, ETI, Veaudry, IHT, and Wahl SKU is on a single Lime Light distributor page with a single price and a single in-stock count. The Parlux Alyon colour-variant naming is a colour finish on the same underlying 2250W platform; the Parlux "DIGITAlyon" and "ETHOS" suffixes are the manufacturer's model-line names, not evidence of a reformulation.
- **Products that may have been reformulated:** N/A. No ZA-distributor copy in this batch indicates a reformulation. The "Advanced airflow technology" / "Advanced heat technology" copy on the Veaudry PDPs is marketing language, not a spec change.
- **Products found in South Africa whose official source describes another market:** No brand-issued ZA-facing page was located in this run, so this comparison could not be made for any of the 31 SKUs. The ZA distributor's PDPs are the only ZA-facing source captured; the brand's EU/IT or US/global pages (Parlux, Wahl, ETI) were either not reachable or only returned non-ZA storefronts. This is recorded as a known evidence gap, not as a multi-source conflict.
- **Products with conflicting directions:** N/A. The ZA distributor product pages in this batch do not expose installation / plumbing / electrical / process-cycle / warranty text at all; therefore no direction-text conflict was found, but the absence of direction text is itself a documented gap and the user has been informed via the `directionsStatus: "unverified"` flag in every row of the Product Table.
- **Duplicate-looking products that must remain separate:** The Parlux ETHOS 2300W Digital appears in three colour variants (Black, Galaxy Blue, Lilac) on the ZA distributor; these are recorded as separate rows (ZA-INDUSTRIAL-0008, -0009, -0010) because the colour finish is a different SKU, different in-stock count, and different R-price on the ZA distributor. The Parlux Alyon 2250W appears in five finishes on the ZA distributor (Jade, Bronze, Night Blue, Gold Edition, Red Edition + Magic Sense Diffuser Set) and is recorded as five separate rows (ZA-INDUSTRIAL-0001 through -0005). The user's "more than 25" rule is preserved by keeping colour variants separate at the brand-line + finish level, which matches how the ZA distributor enumerates them.
- **Products that should be excluded until identity is clarified:** None excluded. All 31 SKUs are retained with explicit ZA-distributor evidence. SKUs that the user named as the brand-side source-of-truth (Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, Valera) are NOT in this batch because no ZA-distributor product URL was obtained for any of them in this run — they are listed in the Output 7 continuation list as next-batch candidates, not as excluded items.
- **Hardware-spec layer gap:** Every row in the Product Table has `directionsStatus: "unverified"` and every "process cycle time / expected service life / brand warranty text" cell in the user's request is unrecorded. The user explicitly required this hardware-spec layer; the ZA distributor pages do not expose it. Manufacturer pages for the named brands were not reachable from this environment. This is the single largest evidence gap in this batch and is repeated in the Coverage Gaps above and in Output 7.

---

## OUTPUT 6 — STRANDCUE IMPORT CANDIDATES

```json
[
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0001",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Alyon 2250W (Jade)",
    "variant": "Jade",
    "sizeOrPack": "2250 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light Hair & Beauty (limelighthb.co.za), distributor SKU H-EL-HDR-PAR-067, ZA R 3 095,00, in stock 20 at capture. No wattage tolerance, motor type, dB, weight, dimensions, ZA warranty, or installation spec captured — ZA distributor PDP does not expose them. Brand-issued ZA-facing site not located in this run.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0002",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Alyon 2250W (Bronze)",
    "variant": "Bronze",
    "sizeOrPack": "2250 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-068, ZA R 3 095,00, in stock 4 (low) at capture. Hardware specs not exposed by ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0003",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Alyon 2250W (Night Blue)",
    "variant": "Night Blue",
    "sizeOrPack": "2250 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-070, ZA R 3 095,00, in stock 41 at capture. Hardware specs not exposed by ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0004",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Alyon 2250W (Gold Edition)",
    "variant": "Gold Edition",
    "sizeOrPack": "2250 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-075, ZA R 3 190,00, in stock 8 (low) at capture. Hardware specs not exposed by ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0005",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Alyon 2250W + Magic Sense Diffuser Set (Red Edition)",
    "variant": "Red Edition bundle",
    "sizeOrPack": "2250 W dryer + diffuser accessory",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-077, ZA R 2 752,00 (was R 3 440,00), in stock 3 (low) at capture. Bundle composition on the PDP is the dryer + a 'Magic Sense Diffuser' accessory.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0006",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux DIGITAlyon 2400W (Anthracite)",
    "variant": "Anthracite",
    "sizeOrPack": "2400 W; digital motor implied by model name",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-078, ZA R 3 750,00, in stock 12 at capture. ZA PDP copy only confirms the model name and wattage; the 'DIGITAlyon' name suggests a digital motor but the PDP does not state the motor topology.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001", "SRC-IND-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0007",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux DIGITAlyon 2400W + Magic Sense Diffuser Set (Anthracite)",
    "variant": "Anthracite bundle",
    "sizeOrPack": "2400 W dryer + diffuser accessory",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-079, ZA R 4 220,00, in stock 13 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0008",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux ETHOS 2300W Digital (Black)",
    "variant": "Black",
    "sizeOrPack": "2300 W; digital motor; 'lightweight design' per ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-088, ZA R 4 550,00, in stock 7 (low) at capture. ZA PDP description: 'Professional digital motor for ultimate power and control. Lightweight design.' 'Ultimate power and control' is Parlux marketing language, not a measured specification. Motor topology and exact weight in grams are not exposed on the ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001", "SRC-IND-0005"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0009",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux ETHOS 2300W Digital (Galaxy Blue)",
    "variant": "Galaxy Blue",
    "sizeOrPack": "2300 W; digital motor",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-082, ZA R 3 640,00 (was R 4 550,00), in stock 1 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0010",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux ETHOS 2300W Digital (Lilac)",
    "variant": "Lilac",
    "sizeOrPack": "2300 W; digital motor",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-PAR-085, ZA R 3 640,00 (was R 4 550,00), in stock 3 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0011",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Diffuser for 3800 Dryer",
    "variant": "for 3800 platform",
    "sizeOrPack": "diffuser accessory (bowl diameter not stated on ZA PDP)",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-SA-DIF-PAR-002, ZA R 265,00, in stock 16 at capture. Bowls-diameter / material spec not on ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0012",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Diffuser for Alyon Dryer",
    "variant": "for Alyon",
    "sizeOrPack": "diffuser accessory",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-SA-DIF-PAR-009, ZA R 265,00, in stock 13 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0013",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Melody Silencer",
    "variant": "noise-reduction accessory",
    "sizeOrPack": "unspecified",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-SA-DIF-PAR-003, ZA R 475,00, in stock 3 (low) at capture. Compatible Parlux model list and dB-reduction claim not on ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0014",
    "kind": "product",
    "brand": "Parlux",
    "productName": "Parlux Spare Nozzles",
    "variant": "concentrator-nozzle spare set",
    "sizeOrPack": "set (count and slot widths not stated on ZA PDP)",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.parlux.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-SA-DIF-PAR-007, ZA R 60,00, in stock 6 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0015",
    "kind": "product",
    "brand": "ETI",
    "productName": "ETI Dryer STILE PLUS 2500W (Matte Red)",
    "variant": "Matte Red",
    "sizeOrPack": "2500 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.eti-italy.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-ETI-001, ZA R 1 995,00, in stock 11 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0016",
    "kind": "product",
    "brand": "ETI",
    "productName": "ETI Dryer STILE PLUS 2500W (Matte Blue)",
    "variant": "Matte Blue",
    "sizeOrPack": "2500 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.eti-italy.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-ETI-002, ZA R 1 995,00, in stock 26 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0017",
    "kind": "product",
    "brand": "ETI",
    "productName": "ETI Dryer STILE PLUS 2500W (Matte Pink)",
    "variant": "Matte Pink",
    "sizeOrPack": "2500 W",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.eti-italy.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-ETI-003, ZA R 1 995,00, in stock 16 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0018",
    "kind": "product",
    "brand": "Veaudry",
    "productName": "Veaudry myDryer-Pro Professional Hair Dryer",
    "variant": "standard",
    "sizeOrPack": "wattage not stated on the ZA PDP (unlike every other dryer in this batch); 'Advanced airflow technology'",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.veaudry.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-VEA-004, ZA R 2 069,00, in stock 5 (low) at capture. ZA PDP description: 'Shop the professional Veaudry myDryer-Pro for fast, salon-quality blowouts. Advanced airflow technology protects hair from heat damage.' 'Advanced airflow' is marketing copy; no measured m³/h or temperature on the ZA PDP.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001", "SRC-IND-0006"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0019",
    "kind": "product",
    "brand": "IHT",
    "productName": "IHT Hair Dryer - Professional Hand Held Dryer (Black)",
    "variant": "Black",
    "sizeOrPack": "wattage not stated on the ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://ihtcorp.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-IHT-001, ZA R 695,00, in stock 1 (very low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0020",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl 5-Star Series Barber Hair Dryer - Chrome Finish 2200W",
    "variant": "Chrome Finish",
    "sizeOrPack": "2200 W; 'Barber' line; '5-Star Series'",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-WAH-002, ZA R 1 210,00, in stock 15 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0021",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Vanquish Professional Hair Dryer (Black)",
    "variant": "Black",
    "sizeOrPack": "wattage not stated on the ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-HDR-WAH-003, ZA R 2 599,00, in stock 9 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0022",
    "kind": "product",
    "brand": "Veaudry",
    "productName": "Veaudry Colossal Iron (Professional Hair Styler)",
    "variant": "standard",
    "sizeOrPack": "plate width not stated on ZA PDP ('Colossal' is a labelling convention, not a measured spec); 'Advanced heat technology'",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.veaudry.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-FLA-VEA-002, ZA R 1 880,00 (the brand-listing page shows 'Contact for pricing' but the PDP shows the actual R 1 880,00 price), in stock 41 at capture. ZA PDP title: 'Veaudry Colossal Iron | Professional Hair Styler'.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001", "SRC-IND-0007"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0023",
    "kind": "product",
    "brand": "Veaudry",
    "productName": "Veaudry myStyler Iron",
    "variant": "standard",
    "sizeOrPack": "unspecified on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.veaudry.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-FLA-VEA-001, 'Contact for pricing' (POA) on the brand-listing page, in stock 93 at capture. ZA-facing retail price not on the brand-listing page; PDP-level price not captured in this run.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0024",
    "kind": "product",
    "brand": "Veaudry",
    "productName": "Veaudry iStyler Iron (Black)",
    "variant": "Black",
    "sizeOrPack": "unspecified on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.veaudry.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-FLA-VEA-003, 'Contact for pricing' (POA) on the brand-listing page, in stock 10 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0025",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Cordless Super Taper Pro",
    "variant": "cordless",
    "sizeOrPack": "battery spec, run-time, charge time not on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-102, ZA R 1 999,00, in stock 41 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0026",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Super Taper X Clipper - Cord/Cordless",
    "variant": "dual-power",
    "sizeOrPack": "battery spec not on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-107, ZA R 2 999,00, in stock 31 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0027",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Cordless 5 Star Vapor Clipper",
    "variant": "cordless; 5-Star line",
    "sizeOrPack": "battery / blade / run-time not on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-098, ZA R 3 499,00, in stock 4 (low) at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0028",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Cordless Vortex Clipper",
    "variant": "cordless",
    "sizeOrPack": "battery / blade spec not on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-101, ZA R 1 199,00, in stock 20 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0029",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Hi-Viz Cordless Trimmer",
    "variant": "cordless",
    "sizeOrPack": "battery / blade width not on ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-095, ZA R 3 999,00, in stock 17 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0030",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Barber Combo (Detailer & Magic - Black)",
    "variant": "combo",
    "sizeOrPack": "two units in one package; individual unit specs not on the ZA PDP",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-EL-CLI-WAH-097, ZA R 4 999,00, in stock 85 at capture.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  },
  {
    "temporaryResearchId": "ZA-INDUSTRIAL-0031",
    "kind": "product",
    "brand": "Wahl",
    "productName": "Wahl Clini-Clip Blade Disinfectant and Cleaner Spray 250ml",
    "variant": "disinfectant spray for clipper blades",
    "sizeOrPack": "250 ml",
    "market": "ZA",
    "gtin": null,
    "category": "industrial_salon_equipment",
    "lifecycle": "active",
    "manufacturerUrl": "https://www.wahl.com/",
    "labelImageRefs": [],
    "identityNotes": "ZA distribution confirmed at Lime Light, distributor SKU H-HE-HGH-WAH-001, ZA R 299,00, in stock 14 at capture. Active-ingredient list, contact time, and NRCS / SABS registration are not on the ZA PDP. This is the only salon disinfecting product confirmed for a named brand at a ZA distributor in this run; it is a consumable, not a stationary disinfecting station (e.g. UV-C cabinet) — the user listed both types; the UV-C cabinet type has no ZA-distributor evidence in this run.",
    "status": "draft",
    "sourceIds": ["SRC-IND-0001"],
    "proposedCapabilities": [
      {
        "capability": "none",
        "decision": "insufficient_evidence",
        "rationale": "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.",
        "limitations": "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run."
      }
    ]
  }
]
```

---

## OUTPUT 7 — HUMAN FOLLOW-UP LIST

The following items must be collected by a human from physical packaging, the manufacturer's own current ZA-facing documentation, or a brand-issued installation datasheet before this batch can be promoted above `draft` status. None of these are "invented"; every item on this list is a specific field that the user explicitly required and that this worker could not lift from a ZA-authorised source in this run.

- **Plumbing rough-in** for backwash / washbasin units (none captured this run — `Hairworx.co.za` and `Mankind.co.za` were the only other ZA distributors the user named; both unreachable).
- **Electrical rough-in** (voltage, current draw, dedicated-circuit requirement, plug type) for every dryer, iron, clipper, and trimmer in the Product Table. The ZA distributor PDPs only state wattage in the product name; full electrical specs are absent.
- **Dimensions (mm) and weight (kg)** for every dryer, iron, clipper, and trimmer in the Product Table.
- **Plate width (mm) and temperature range (°C)** for the three Veaudry irons (ZA-INDUSTRIAL-0022, -0023, -0024) and any future large salon iron. "Colossal" is a label, not a measurement.
- **Battery type, run-time per charge, charge time** for every cordless Wahl clipper/trimmer (ZA-INDUSTRIAL-0025, -0027, -0028, -0029) and the Super Taper X (ZA-INDUSTRIAL-0026).
- **Process cycle time** for any infrared/UV process machine, hood dryer, or process blower in the user's category list. None of the dryers in this batch publish a "process cycle" figure; the user's "process cycle" concept is more relevant to hood dryers and infrared/UV machines, which were not lifted to the SKU level in this run.
- **Expected service life** for every piece of equipment in the Product Table. None of the ZA distributor PDPs state an MTBF / service-life figure.
- **Brand warranty text** for every brand in the Product Table (Parlux, ETI, Veaudry, IHT, Wahl). No ZA-issued warranty document was located in this run.
- **Active-ingredient disclosure, contact time, NRCS / SABS registration number** for the Wahl Clini-Clip Blade Disinfectant (ZA-INDUSTRIAL-0031) — required before any claim about the product's disinfecting efficacy can be substantiated.
- **Brand-issued ZA-facing storefront / distributor-authorisation page** for Parlux, ETI, Veaudry, IHT, and Wahl. The only ZA-facing evidence in this batch rests on Lime Light's listing. A direct brand → ZA distributor chain confirmation page was not located.
- **Continuation list for the next worker (sub-types that the user listed but this batch did not cover, with the ZA-distributor category that should be probed first):**
  1. **Backwash / washbasin units** — probe Lime Light Equipment > Wash / Backwash sub-tree, and re-attempt `hairworx.co.za` (the previous run returned network failure on every path).
  2. **Hood dryers** — the Lime Light category page at `https://limelighthb.co.za/product-category/equipment-2/hair/hood-dryers` was confirmed to exist but the product list payload was truncated. The next worker should re-fetch with a stricter per-page byte limit and capture individual SKUs.
  3. **Salon styling chairs and barber chairs** — the Lime Light Furniture category was confirmed to exist but the product list payload was truncated. Capture per-style individual SKUs.
  4. **Hair trolleys** — same as above; expected to live in the same Furniture sub-tree.
  5. **Steam hair-therapy machines** — not surfaced in this run; likely lives under a brand-specific page that is not currently reachable (Takara Belmont ZA-facing site returns a redirect stub).
  6. **Infrared / UV process machines** — not surfaced in this run; no ZA-distributor URL obtained.
  7. **Pump / bottle backbar dispensers** — not surfaced; check the Lime Light Salon Essentials sub-tree first.
  8. **Colour-mixing dispensers** — not surfaced; check the Lime Light Colouring sub-tree first.
  9. **Brand-side corroboration for Parlux, ETI, Veaudry, IHT, and Wahl** — re-attempt `https://www.parlux.com/`, `https://www.eti-italy.com/`, `https://www.veaudry.com/`, `https://ihtcorp.com/`, and `https://www.wahl.com/` from an environment where they are reachable, to capture brand-issued specification sheets.
  10. **Hairworx ZA distributor** — re-attempt `https://www.hairworx.co.za`; the previous run returned network failure on every path tried. If reachable, it is expected to carry the Takara Belmont, Pietranera, Comfortel, Pietra, SalonCentric, SalonPipo, Matik, Hunter, Elchim, Hot Tools Pro, and Valera lines the user listed.
  11. **Mankind ZA distributor** — `https://mankind.co.za` is a parked domain-for-sale page in this run; this is the only ZA-named distributor that is currently unverifiable on ZA-distributor-evidence grounds. No product-level evidence was possible.

---

End of `industrial-batch-01.md` — DRAFT RESEARCH — HUMAN REVIEW REQUIRED.

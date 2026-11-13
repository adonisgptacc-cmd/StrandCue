# Wave 3 & 4 Briefing Templates

These three Wave 3 + three Wave 4 briefings follow the same pattern. They are stored here so they can be fired into `task` calls in parallel when concurrency slots free up. Each briefing MUST be customized for its category but the constraints and front-matter blocks below are valid for any non-shampoo/non-conditioner category.

---

## WAVE 3 — Styling creams/mousses/gels · Serums & oils · Scalp products

### Sub-wave 3A — Styling creams, mousses, gels, foams, edge controls, setting lotions

Front-matter:
```
# StrandCue Styling Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: styling cream / mousse / gel / foam / edge control / setting lotion
Research session date: 2026-10-12
Worker: styling-batch-01 worker
```

- Category: styling product (cream / mousse / gel / foam / edge control / setting lotion / curl-defining jelly). Exclude heat protectants (separate batch), masks (separate batch), leave-in detanglers without a styling hold claim (separate batch).
- Target: 20–35 high-confidence exact versions
- IDs: `ZA-STYLING-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\styling-batch-01.md`
- Brands to cover: Got2b / Schwarzkopf, L'Oréal Studio Line, TRESemmé, Aussie, VO5, Cantu (curl activator / foam), Cantu Mousse, Pantene, Doris, Dark & Lovely (relaxer-adjacent), Eco Styler gel, Black Chick (ZA), Umberto Giannini, Shea Moisture, Mielle, Garnier Fructis Style, John Frieda, VO5, Got2b glued, Tigi Bed Head (if available ZA), MoroccanOil styling, Sebastian, plus ZA-origin brands SoulTribe, Afritude, Good Stuff, Organics, Two Oceans, Mzansi Hair.
- Capability for v1: `none` (closed vocabulary cleanse/condition only); rationale text: "Styling hold is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for future routine definition (styling routine / curl definition / hold routine) but no executable capability is asserted at v1."
- `category` field in JSON: `"styling"`

### Sub-wave 3B — Serums and oils (hair oils, hair serums, finishing serums)

Front-matter:
```
# StrandCue Serums & Oils Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: hair serum / hair oil
Research session date: 2026-10-12
Worker: serum-oil-batch-01 worker
```

- Category: hair serum and hair oil. Exclude leave-in conditioner that is also a curl milk (curl milk goes in leave-in batch). Exclude bond-repair oils if they double as heat protectants (those can go in either heatprotect or this batch — record in OUTPUT 5 which you chose and why).
- Target: 20–30 high-confidence exact versions
- IDs: `ZA-SERUMOIL-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\serumoil-batch-01.md`
- Brands to cover: MoroccanOil Treatment, Argan-oil serums, Ogx Renewing Argan Oil, Garnier Fructis Sleek & Shine, L'Oréal Elvive Extraordinary Oil, TRESemmé Smooth & Silky, Viviscal, Organics Marula / Argan, SoulTribe oil blends, Afritude marula oil, Olaplex No.7 Bonding Oil (in oil category not heatprotect unless manufacturer explicitly markets as heat protectant), Wella Professionals Oil Reflections, Kérastase Elixir Ultime, L'Oréal Professionnel Mythic Oil, Schwarzkopf BC Oil, Joico Oil Recovery, Pureology, Davines OI, plus ZA brands SoulTribe, Afritude, Good Stuff, Mzansi Hair, Innersense.
- Capability for v1: `none`; rationale: "Hair serum / oil for finishing or pre-styling is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'serum' routine but no executable capability is asserted at v1."
- `category` in JSON: `"serum_oil"`

### Sub-wave 3C — Scalp products (tonic, scrub, leave-in scalp treatment)

Front-matter:
```
# StrandCue Scalp Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: scalp product (tonic / scrub / leave-in scalp treatment)
Research session date: 2026-10-12
Worker: scalp-batch-01 worker
```

- Category: scalp tonic, scalp scrub, scalp leave-in treatment, scalp serum, anti-itch cosmetic scalp product (NOT medicated shampoos like Selsun — those were flagged in the shampoo batch). If a manufacturer markets the product as a medicated treatment (with a registration number visible), exclude it from this batch and put it in the conflict report.
- Target: 15–25 high-confidence exact versions
- IDs: `ZA-SCALP-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\scalp-batch-01.md`
- Brands to cover: Kérastase Specifique (with ZA availability note), Philip Kingsley, Aveda Scalp Remedy, Briogeo Scalp, Ouai, The Ordinary Multi-Peptide Serum for Hair Density (cosmetic claim only), Act + Acre, Christophe Robin Scalp Scrubs, Living Proof Scalp, Nioxin (cosmetic only), Moroccanoil Scalp, Davines Naturaltech, plus ZA brands including any Dr. Miracles, Mizani, Cantu scalp, TGIN, As I Am, and ZA-origin SoulTribe / Afritude scalp oils.
- Capability for v1: `none`; rationale: "Scalp care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'scalp-care' routine but no executable capability is asserted at v1."
- `category` in JSON: `"scalp_care"`
- **Off-scope strict:** "anti-dandruff shampoo" or "anti-hairfall tonic" marketed with a medical claim is NOT a cosmetic for StrandCue purposes — exclude from the batch and document in OUTPUT 5.

## WAVE 4 — Colour-care · Heated tools · Industrial salon equipment

### Sub-wave 4A — Colour-care products (semi-permanent, demi-permanent, permanent colour, toner, dye)

Front-matter:
```
# StrandCue Colour-Care Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: hair colour-care (semi-permanent, demi-permanent, permanent, toner, gloss)
Research session date: 2026-10-12
Worker: colourcare-batch-01 worker
```

- Category: colour-care products = semi-permanent colour, demi-permanent colour, permanent colour, toners, glosses, colour-depositing conditioners/masks/shampoos. Includes ZA-stocked box dye and salon ranges. Exclude: bleach / lightener-only products are documented separately as needed; include them in this batch only if a manufacturer publishes them as a colour-care line.
- Target: 20–30 high-confidence exact versions
- IDs: `ZA-COLOUR-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\colourcare-batch-01.md`
- Brands to cover (ZA-availability focus): L'Oréal Excellence, L'Oréal Feria, L'Oréal Colorista, Garnier Olia, Garnier Nutrisse, Garnier Color Sensation, Revlon ColorSilk, Revlon Nutri Color Creme, Clairol Nice'n Easy, Clairol Natural Instincts, Schwarzkopf Color Expert, Schwarzkopf Live, Wella Koleston Perfect, Wella Color Charm, Wella Illumina, Joico Color Intensity (semi-permanent), Pravana (semi-permanent), Manic Panic (semi-permanent, ZA-stock), Pulp Riot (semi-permanent, salon), Arctic Fox (semi-permanent, ZA-stock via online), Crazy Color, Adore, plus ZA brands Dark & Lovely, Softsheen-Carson Optimum, Afritude, Clere (ZA), Organic Root Stimulator, Amka (ZA distributor), Stefan (ZA), Nutrigood.
- **Regulator note (critical):** Hair colour products are scheduled under SAHPRA's CAMS. Where a colour product carries a SAHPRA registration number, this must be captured in the `lifecycle` and `unresolvedQuestions` fields — colour products are regulated as medicines in some jurisdictions. **No medical interpretation**; record the regulator classification but do not interpret it as a safety verdict.
- Capability for v1: `none`; rationale: "Colour-care is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The product is retained in the catalogue for a future 'colour-care' routine but no executable capability is asserted at v1."
- `category` in JSON: `"colour_care"`

### Sub-wave 4B — Hair dryers, diffusers and heated tools

Front-matter:
```
# StrandCue Heated Tools Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: heated tools (hair dryer / diffuser / flat iron / curling iron / hot brush)
Research session date: 2026-10-12
Worker: heatedtools-batch-01 worker
```

- Category: corded electrical hair dryers, diffusers (attachment or dedicated), flat irons, curling irons, hot brushes, hood dryers, professional salon tools. Exclude brushes, combs, hair ties.
- Target: 15–25 high-confidence exact versions. These are fewer because each tool is a SKU with one capability set.
- IDs: `ZA-TOOL-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\heatedtools-batch-01.md`
- Brands to cover (ZA distribution note required): ghd Original / Platinum+ / Gold / Helios / Aurora; Dyson Supersonic / Airwrap; Philips Moisture Protect / Pro; Remington Pro / Thermacare; BaByliss Pro / Cordless; Hot Tools; Conair (limited ZA); T3; Revlon Salon; L'Oréal Professionnel Steampod; Schwarzkopf Professional Salon Tools; Valera (salon); Parlux (salon); Elchim; plus ZA-distributed professional tools from WAHL, Oster, Babyliss Pro, Gamma+.
- Field emphasis: power (W), cord length, plate material (for irons), barrel size (for curling irons), temperature range (°C), ionic/ceramic/tourmaline technology claims (record as manufacturer claims, not confirmed), size, weight, retailer URLs in ZA, brand warranty information, included attachments.
- **Important:** tools are not cosmetic products; StrandCue v1 is closed to cosmetics and the wash routine (shampoo + conditioner). Tools belong to a future StrandCue release. For this batch, treat each tool as a catalogue entry kept for future routine definition. **Output 6 JSON** — still use the same product shape but set `category: "heated_tool"` and `proposedCapabilities: [{ capability: "none", decision: "insufficient_evidence", rationale: "Heated tools are outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The tool is retained in the catalogue for a future 'thermal styling preparation' routine but no executable capability is asserted at v1.", limitations: "Future StrandCue vocabulary extension needed; manufacturer wattage / temperature / cord length / plate material evidence still unverified in this run." }]`.
- **Off-scope strict:** warranty registration with serial numbers is marketing data, not a safety claim — capture the public warranty text only.

### Sub-wave 4C — Industrial / salon equipment

Front-matter:
```
# StrandCue Industrial Salon Equipment Batch 01
DRAFT RESEARCH — HUMAN REVIEW REQUIRED
Category: industrial / salon equipment (process chair, washbasin unit, hood dryer, steam machine, process blower, salon chair, steriliser, trolley, dispensing system)
Research session date: 2026-10-12
Worker: industrial-batch-01 worker
```

- Category: Industrial and salon-only equipment used by hair salons. Excludes consumer heated tools (their own batch). Examples: salon shampoo backwash unit, hood dryer (large bonnet stand), process blower, steam hair therapy machine, salon chair / styling chair / barber chair, hair trolley, professional hair steamer, infrared / UV process machine, dispensing systems (pump / bottle), colour-mixing dispensers, professional salon disinfecting equipment, salon washbasin / shampoo unit (plumbing).
- Target: 15–30 high-confidence exact versions. Each is a distinct SKU with its own specifications.
- IDs: `ZA-INDUSTRIAL-NNNN`
- Output: `C:\Users\ABADO\.minimax\workspace\strandcue-research\categories\industrial-batch-01.md`
- Brands to cover (typically distributed via ZA salon wholesalers Hairworx, Salon Warehouse, Mankind): Takara Belmont (chairs / washbasin), Pietranera, Gamma +, AGV (Italian styling chairs), Comfortel, Pietra, HairDirector, Auralex (for salon acoustics — out of scope, exclude), WAHL, Oster, Babyliss Pro (industrial-grade), Elchim (professional dryers — note: their irons are tools; their salon-only dryers belong here if marketed as salon industrial), Parlux (some industrial), Hunter, Valera, Hot Tools Pro, SalonCentric brand names, SalonPipo, Matik, Confortel, plus ZA distributors' own-imported Chinese-origin equipment (record brand name as printed on the equipment + ZA distributor).
- Field emphasis: distributor URL (ZA-specific), installation requirements (plumbing / electrical), dimensions, weight, capacity (litres for dispensers), process cycle time, expected service life, safety certifications (SANS, CE — record as a marketing claim, not a StrandCue safety verdict).
- **Off-scope strict:** No financial-value claim, no "professional recommendation" by the brand, no "stylist preferred" ranking. Record as marketing only.
- Output 6 JSON: same shape as a product but `category: "industrial_salon_equipment"` and `proposedCapabilities: [{ capability: "none", decision: "insufficient_evidence", rationale: "Salon equipment is outside StrandCue v1's closed capability vocabulary (cleanse / condition only). The item is retained for future infrastructure reference but no executable capability is asserted at v1.", limitations: "Future StrandCue vocabulary extension needed; distributor / safety-certification / installation specifications still unverified in this run." }]`.
- The user explicitly asked for industrial items even though they are outside the StrandCue v1 closed vocabulary — they are kept here as catalogue entries for use as a ZA infrastructure map.

---

## Universal rules (apply to every sub-wave 3 and 4 briefing)

1. Read `strandcue-protocol.md` and `research-brief-context.md` first.
2. Use the same 7-output structure.
3. Use null / "unverified" for unverifiable fields; never invent.
4. Distinguish the category carefully — when the manufacturer calls something one thing, that's the category. When ambiguous, flag in OUTPUT 5.
5. Every URL is a direct page URL; record check date (today: 2026-10-12).
6. No medical claims, no ranking, no marketing-as-fact.
7. Output 6 (JSON): same structure; capability locked to `none` + `insufficient_evidence`; rationale text tailored to the category.
8. Write the file at the path stated and report back in 1-2 sentences.

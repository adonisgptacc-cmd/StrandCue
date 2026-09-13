# StrandCue — Master Product Requirements Document

Version 2.0 • 9 September 2026 • Data foundation first

## 1. Authority and decision

StrandCue's current release is **Phase 1: a secure, versioned, longitudinal cosmetic hair-care data foundation for South African adults aged 18+**. It records what users know about their hair, treatments, products and tools, and preserves how those facts change. It does not recommend what to do with them yet.

This version replaces the Phase 0/MVP/Phase 1 assignments in the 6 September PRD. The user approved this revision after providing the 9 September attachment containing later project instructions. The original PRD is retained as historical design material, not an alternative active specification.

Authority order for this handoff:

1. Subsequent explicit product-owner decisions, recorded as changes to these documents.
2. [Phase 1 Build Specification](docs/PHASE_1.md) for current implementation requirements and acceptance criteria.
3. This master PRD for overall purpose, phase boundaries and future requirements.
4. [Developer Instructions](docs/DEVELOPER_INSTRUCTIONS.md) as a short reference to the above, not an independent specification.
5. Historical v1 as non-authoritative context. Its old thresholds, release gates, screens and phase numbers must not be imported automatically.

The attachment refers to a separate “Locked Phase 1 Build Specification,” but that complete source document was not supplied. The build specification accompanying this PRD is a newly consolidated baseline, not a recovered copy of that document. The initial conversation also had an unavailable continuation. Source coverage is therefore the retrieved original notes, current attachment and explicit user decisions. Engineering defaults are identified in the build specification; future source material must be reconciled through a change log.

## 2. Product purpose and principles

The eventual purpose remains: “Given my actual hair, treatment history, condition, products, tools, environment, budget, previous outcomes and desired result—what should I do?”

StrandCue serves straight, wavy, curly, coily and mixed hair; grey hair; natural and processed hair; and different budgets. It is not a curly-only or brand-specific application. Founder products and hair history are examples, not exceptions coded into the model.

The foundation must know what is known, preserve what happened, represent uncertainty honestly and protect private information. Future recommendations must prefer appropriate products already owned. Product price, advertising and manufacturer popularity are not evidence of efficacy.

Authentication uses Supabase email/password, a chosen username and permanent Auth UUID. The UUID owns private data; username/email are never ownership keys. No legal name, surname, identification document, phone number, street address, exact birth date, race, ethnicity or precise GPS is collected by the product.

Current and historical truth are separate. A real change creates a historical record; correcting a mistake is an explicit audited correction. Product/tool revisions preserve the exact version relevant at the time. User entry or automated discovery is not verification. Unknown is a valid answer, never permission to invent facts.

## 3. Phase boundaries

| Phase | Scope | Entry/exit principle |
|---|---|---|
| 1 — Data foundation, current | Account/recovery; Hair Passport; zone-aware service history; My Shelf; My Tools; current and historical views; manual activity records; privacy/settings; provenance and verification foundations | Pass the Phase 1 acceptance tests. No advice-generation dependency. |
| 2 — Verified decision support, future | Deterministic rules; Today's Protocol; Heat Coach; Routine Audit/Shelf Scan; execution feedback and personal evidence | Explicit owner approval to start; sufficient reviewed facts, safety policies and independent expected-output tests |
| 3 — Context and outcomes, proposed | Weather; consented community aggregates; stronger personal-outcome ranking; optional private media | Separate privacy, evidence and usefulness gates; precise sequence remains a planning decision |
| 4 — Discovery and optional commerce, proposed | Larger catalogue, scanning/import/discovery, comparison, local prices/retailers and optional shopping | Discovery remains unverified; commercial data cannot override suitability; no automatic commitment to subscriptions/ads |

International expansion and optional AI wording require separate approval. Phase 1 is ZA, English, ZAR and Celsius. Store market/unit information cleanly without building multiple countries, currencies, translations or international retailers.

The later numbering is a proposed roadmap. Weather's former “Phase 2” label is superseded; it is not included automatically with the next release. No recommendation endpoint, evaluator, treatment scheduler, heat traffic light or disabled advice screen is required in Phase 1. Preparing data relationships is sufficient.

## 4. Current capability and user experience

Phase 1 answers: **“What have I recorded about my hair, products, tools and changes over time?”**

Navigation: Hair Passport, My Shelf, My Tools, History and Settings, with Chemical/Service History accessible from Passport and History. The home view can summarise recorded facts and incomplete records. It cannot prescribe a routine, assess suitability or tell a user that a product is due.

Essential journeys: create/verify account → claim username → create Passport using known/unknown values → record services and zones → add any owned products/tools → record a change or manual activity → inspect current and historical information → correct a mistake → export/delete the account.

Success means an accurate, recoverable private record. It does not mean a successful hair outcome, recommendation conversion or a complete verified product catalogue. A user with only unknown products must still finish onboarding and use the application.

## 5. Future requirements retained

The following preserve the original vision but are **not Phase 1 implementation instructions**.

### Deterministic decisions and Today's Protocol

A future pure TypeScript evaluator will use versioned inputs and rules to return ordered actions, waits, exclusions, reasons and feasible alternatives. Same inputs and versions must return the same decision. Safety and applicable instructions constrain selection; user preferences and outcome history cannot override them. Conflicting prerequisites return a clear unsupported/needs-information result. Unknown product variants cannot acquire invented waits, compatibility or heat claims.

Recommended steps and actual execution remain distinct. Generating a plan must not advance wash/treatment counters. Future scheduling must define qualifying wash units, range boundaries, missed-application handling, correction/recomputation and canonical cross-device event identity before shipping. The original K18/Guardian Angel schedules are illustrative and require exact product/source review before use.

### Heat Coach

Separate direct-contact heat, heated-air tools and other exposure. Do not infer temperature from wattage or the name of a salon service. Future heat signals must not promise safety; necessity and restrictions are separate. Unknown settings do not justify a GREEN signal. Numeric temperature/pass thresholds require reviewed sources and policy, not developer guesses.

### Routine Audit / Shelf Scan

Future possible outcomes: keep, use less often, remove, change order, duplicate, missing functional category, no purchase needed or insufficient verified information. Only reviewed facts and approved deterministic rules may produce these decisions. A Shelf inventory is not a Shelf Scan; Phase 1 contains the former only.

### Evidence

Evidence is claim-specific, never a single `scientifically_proven` flag. Preserve separate source kinds: regulator/safety, peer-reviewed research, professional organisation, independent testing, manufacturer instructions, consumer signal, StrandCue community outcome, individual anecdote and marketing. Also record applicability, strength and limitations.

Original A–H labels may remain as a later presentation/legacy classification: A strong science, B moderate science, C manufacturer directions, D formulation inference, E professional consensus, F consumer reports, G limited anecdote, H marketing. They do not replace source kinds or establish rule precedence. Inference is an assessment method, not a source. Manufacturer instructions can govern intended use without proving efficacy.

### Feedback, personal evidence and community

Future Cue Check captures structured outcomes, actual use and deviations. Personal summaries expose sample sizes and missing answers; they cannot prove causation. Community data requires separate opt-in, controlled aggregation, privacy review, suppression and honest denominators. No raw public reviews, community ranking or scientific claims from anecdotes in Phase 1.

### Weather, media and commerce

Weather later uses optional coarse city context and time-stamped data with outage/staleness fallback. Phase 1 stores user-reported sensitivities only. Photos, scanning and imports need separate security and consent requirements before enablement. Future discovery can populate a review queue, never silently publish trusted facts. No purchases should be recommended merely to monetise a user.

## 6. Medical boundary

The product is intended for cosmetic records and later cosmetic decision support, not diagnosis, treatment or medical claims. Do not assert regulatory exemption just by describing it this way. Phase 1 offers a clear general boundary notice and help contact; it does not implement symptom triage. Future escalation for concerning symptoms requires reviewed wording and scope before ordinary cosmetic guidance can be stopped appropriately. No photo diagnosis, medication advice or promised regrowth.

## 7. Changes from version 1

| Previous baseline | Version 2 resolution |
|---|---|
| Decision engine/Heat Coach in MVP | Deferred to explicitly authorised Phase 2 |
| Today as primary screen | Passport/inventory/history are the current experience |
| Treatment counters, generated protocols and Cue Check required | Not Phase 1 requirements; basic manual facts/activity recording only |
| Passport revisions partly supported through protocol snapshots | Standalone longitudinal histories required even without protocols |
| Chemical categories and free area field | Explicit expanded services, Nanoplasty and structured zones |
| Brand stored on product identity | Separate brand/product/version/ownership entities, tool equivalent |
| Porosity later, broad budget field | Optional porosity including unknown and defined economic preferences in foundation |
| Published/withdrawn content status | Separate verification, lifecycle and version relationships |
| 20–30 verified products as MVP gate | No fixed catalogue-size gate; unknown records must work |
| Weather Phase 2 | Later proposed context phase; not automatically authorised |
| Protocol metrics and AC-01–31 release gate | Replaced by Phase 1 tests and foundation metrics |

Authentication, RLS, privacy protection, historical product versions, brand neutrality and the no-invention principle are preserved and clarified.

## 8. Delivery and risks

Build order: document/schema audit → repository/environment foundation → migrations and ownership tests → authentication/recovery → Passport/history → services/zones → Shelf/provenance → Tools → manual records/settings/privacy → cross-device and accessibility validation → invited beta.

Primary risks are silently implementing deferred features, overwriting meaningful history, treating discovery as verification, conflating anatomical zones with root/mid/end segments, cross-owner references, and copying the historical PRD's phase assignments. Each has an explicit requirement/test in the Phase 1 specification.

Production domain/email delivery, provider region/backup commitments, privacy review, supported device matrix and content-review ownership require operational decisions before external beta. They need not block schema work or synthetic tests. No real personal founder history belongs in public fixtures.

## 9. Definition of done and handoff

Phase 1 is complete only when its build specification and all P1-AC tests pass, direct database/API isolation is demonstrated, history/version integrity is demonstrated, recovery/export/deletion work, and no deferred feature is delivered as current behaviour. An app that generates routines but loses historical truth does not meet this release definition.

Start with an implementation audit of [docs/PHASE_1.md](docs/PHASE_1.md). This handoff creates documents only; it does not create a GitHub repository, connect services or authorise a production deployment. Record future approved changes in both the applicable specification and its acceptance tests.

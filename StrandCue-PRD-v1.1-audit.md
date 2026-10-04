# StrandCue Product Requirements Document

**Document status:** Authoritative working PRD
**Version:** 1.1 — Revised Audit Edition
**Date:** 23 September 2026
**Primary market:** South Africa
**Current build phase:** Phase 1 — Trusted Hair Data Foundation
**Product type:** Personalised cosmetic hair-care decision platform
**Target users:** Adults aged 18 and older
**Classification:** StrandCue Confidential — Internal
**Supersedes:** v1.0 Consolidated (23 September 2026)

---

## 3. Document Control & Change Log (v1.0 to v1.1)

This document is the authoritative revision of StrandCue Product Requirements Document version 1.0. Version 1.1 is a strict superset of version 1.0: no section, requirement, principle, or non-goal from v1.0 has been removed, weakened, or reinterpreted. Every original section is either preserved verbatim, extended with audit subsections, or merged with adjacent sections to improve navigability. Fourteen new sections have been added to close gaps identified during the v1.0 audit. The audit was conducted across seven focus dimensions requested by the document owner: Roadmap & Risks, Metrics & KPIs, POPIA & Legal, Non-Functional Requirements & Operations, UX & Onboarding, Testing & CI, and Data Model Depth.

The intent of v1.1 is not to change product direction. The intent is to convert a strong product vision document into an engineering- and compliance-ready specification that a development team, a security reviewer, a POPIA information officer, and a future AI coding agent can all rely on without ambiguity. Where v1.0 stated an aspiration, v1.1 adds the requirement, the risk of omission, and the test that proves compliance.

### 3.1 Document Control Table

| Field | Value |
|---|---|
| Document title | StrandCue Product Requirements Document |
| Version | 1.1 — Revised Audit Edition |
| Document status | Authoritative working PRD |
| Date of issue | 23 September 2026 |
| Supersedes | v1.0 Consolidated (23 September 2026) |
| Primary market | South Africa |
| Current build phase | Phase 1 — Trusted Hair Data Foundation |
| Product type | Personalised cosmetic hair-care decision platform |
| Target users | Adults aged 18 and older |
| Classification | StrandCue Confidential — Internal |
| Distribution | Founders, engineering, design, security review, advisory |
| Review cadence | End of each Phase 1 milestone; pre-Phase 2 design sprint |

### 3.2 Change Log — Seven Audit Dimensions Added in v1.1

| Audit dimension | v1.0 coverage | v1.1 addition | Primary new sections |
|---|---|---|---|
| Metrics & KPIs | Implicit; no quantitative targets | Activation, engagement, retention, quality KPIs with measurement methods | §32 Success Metrics & KPIs |
| POPIA & legal | Mentioned in privacy section only | POPIA compliance matrix, consent management, retention schedule, information officer | §21 Privacy, Consent & POPIA Compliance |
| NFRs & ops | Not addressed | Performance, reliability, scalability, offline, observability, backup/DR | §26 Non-Functional Requirements; §27 Data Validation, Analytics & Observability; §28 Backup, DR & Account Lifecycle |
| UX & onboarding | Screen list only | Onboarding journey, wireframe-level screen specs, content guidelines, WCAG 2.2 AA | §24 Phase 1 Core Screens & Onboarding Journey; §25 UX, Content & Accessibility Guidelines |
| Testing & CI | Test personas + security tests | Test pyramid, coverage targets, E2E framework, CI pipeline, mutation testing | §29 Test Strategy, CI/CD & Test Personas |
| Roadmap & risks | Phase list, no timeline | Indicative roadmap per phase, 12-risk register, team & RACI | §7 Phase Strategy & Multi-Phase Roadmap; §33 Risk Register; §34 Team, Roles & Governance |
| Data model depth | Conceptual table list | Temporal pattern selection, per-table schema sketch, audit log, soft-delete, data export | §13 Longitudinal History Model & Temporal Patterns; §23 Conceptual Data Model & Temporal Implementation |

### 3.3 Editorial Conventions

v1.1 introduces three editorial conventions to make audit findings unambiguous. First, where a requirement is added or strengthened, it is presented in the format **Requirement**: ...; **Risk if omitted**: ...; **Test**: .... Second, new sections are marked [NEW] in their title. Third, cross-references to other sections use the §N format. The original v1.0 numbering is preserved in Appendix B so readers cross-referencing v1.0 source material can locate equivalent content.

---

## 4. Executive Summary

StrandCue is a personalised cosmetic hair-care platform designed to help users make better hair-care decisions based on their own hair, treatment history, products, styling tools, environment, goals, budget and outcomes over time. The long-term product question the platform must eventually answer is:

> Given my actual hair, treatment history, current condition, products I already own, styling tools, environment, budget, previous outcomes and desired result — what should I do?

StrandCue is not a generic product recommendation app, a curly-hair-only app, a shopping catalogue, a social beauty platform, or a medical diagnostic service. Its differentiator is a longitudinal, evidence-aware, brand-neutral decision system that can eventually evaluate products and routines against a specific person rather than against a generic hair type. The current build is Phase 1 only. Phase 1 does not implement the recommendation engine itself; Phase 1 builds the trusted, secure, versioned and longitudinal data foundation required for later intelligence.

The current priority is therefore unchanged from v1.0:

> Capture the right facts, preserve historical truth, distinguish verified information from unverified information, secure user-owned data properly, and never invent missing facts.

Version 1.1 augments this priority with seven dimensions that v1.0 left implicit. Each dimension is necessary for Phase 1 to be considered complete to a standard that supports a public beta in South Africa under the Protection of Personal Information Act (POPIA). Metrics and KPIs are necessary because a Phase 1 that ships without measurable activation and retention targets cannot be evaluated for readiness. POPIA compliance is necessary because StrandCue processes personal information of South African data subjects and is therefore subject to lawful-processing, purpose-limitation, and data-subject-participation obligations. Non-functional requirements are necessary because a mobile application without performance, reliability, offline, and observability targets will fail in field conditions. UX and onboarding details are necessary because activation rate depends on the design of the first seven screens, not on the depth of the database behind them. Testing and CI are necessary because the longitudinal-history and RLS invariants cannot be defended by manual testing alone. Roadmap and risks are necessary because Phase 1 is the foundation of a multi-year programme and the team must be able to defend sequencing decisions. Data model depth is necessary because the choice of temporal pattern (append-only event log vs current-table-plus-history-table vs event-sourced) is irreversible after Phase 1 ships.

This document is a comprehensive revision of v1.0. Every original section is preserved and either extended or audited. New sections are marked [NEW]. The audit register is structured so that any reader — founder, engineer, security reviewer, legal counsel, or future AI coding agent — can answer three questions about any requirement: what is required, what is the risk of omitting it, and what test proves it is met.

---

## 5. Product Vision & Differentiation

### 5.1 Vision (preserved from v1.0 §2)

StrandCue should eventually help a user answer questions such as: What should I do with my hair today? Which of the products I already own should I use? In what order should I use them? Is a treatment due yet? Is direct heat appropriate today? Can I achieve my desired result without using a flat iron? Is a new product genuinely useful or does it duplicate something I already own? How has my hair responded to this routine before? Does humidity materially change what I should do today? Is there enough verified information to make a safe recommendation?

The future product should be capable of saying:

> You do not need to buy anything. The products you already own are appropriate; use them differently.

That principle is central to product trust. A platform that defaults to recommending purchase is a commerce platform, not a decision platform.

### 5.2 Differentiation (extended in v1.1)

StrandCue operates in a category that contains three identifiable competitor archetypes. The first archetype is the catalogue-first customiser — services such as Function of Beauty, Prose, and Authenta that use a short quiz to generate a bespoke formula and sell it. Their weakness is that their business model requires purchase; they cannot tell a user that no purchase is needed. The second archetype is the community-first resource — properties such as NaturallyCurly, CurlTalk, and Reddit hair subreddits — whose value is crowdsourced reviews and discussion. Their weakness is that community signal is anecdotal, unverified, and rarely longitudinal per individual. The third archetype is the AI advice chatbot — general-purpose LLMs prompted with hair questions. Their weakness is hallucination risk: an LLM can confidently state that a product is colour-safe without verifying the claim, and the user cannot trace the source.

StrandCue's defensible moat is the intersection of four properties that no competitor combines: longitudinal (per-user history over years, not a single quiz), provenance-aware (every product fact carries a source and trust tier), brand-neutral (no affiliate or commerce pressure on the recommendation logic), and deterministic (Phase 2 rules are authored, evidence-attached, versioned, and auditable — not LLM-generated). The combination is defensible because each property requires sustained investment that a catalogue-first or community-first competitor will not prioritise. The combination is also explainable to a user, which builds trust over time.

- **Requirement**: Every product fact stored in the StrandCue knowledge base must carry a provenance record (source URL, source type, trust tier, first-seen date, last-checked date).
- **Risk**: Without provenance, StrandCue degenerates into another community anecdote platform. The brand-neutral, evidence-aware differentiator is destroyed.
- **Test**: Schema test: any insert into product_facts without a provenance record must fail. Query test: every product_fact row returned by the API must include its provenance.

### 5.3 Why now (extended in v1.1)

Three conditions make the South African market entry tractable in the Phase 1 window. First, POPIA is in force and South African consumers are increasingly aware of data-subject rights; a platform that is privacy-first by design has a credible trust story. Second, the South African hair-care market spans a wide income range and a wide hair-type range, which validates the brand-neutral and budget-aware design from the start. Third, the cost of mobile infrastructure (Supabase, Expo EAS) has fallen to a level where a small team can ship a credible beta without raising capital first. The beachhead strategy is to validate the data foundation with a small cohort of internal and invited users before any commerce or community features are designed.

---

## 6. Governing Product Principles

These principles apply across all phases. They are non-negotiable: where a delivery pressure conflicts with a principle, the principle prevails. Principles 6.1 through 6.7 are preserved from v1.0 §3 verbatim. Principles 6.8, 6.9 and 6.10 are added in v1.1 to close audit gaps.

### 6.1 Person first

The system must work from: Person → Hair state/history → Products → Tools → Environment → Goal → Evidence → Recommendation → Outcome. It must not work from: Hair type → generic product list. This principle is the structural defence against the dominant failure mode in the category, which is to collapse a person into a hair-type label and then recommend for the label rather than the person.

### 6.2 Brand neutral

StrandCue must not favour a manufacturer merely because a product is popular, expensive, sponsored or commercially advantageous. Products such as K18, OSMO, Olaplex and others are test cases, not platform defaults. Brand neutrality is tested by counterfactual: if a competing brand with identical functional properties existed, would the recommendation logic produce the same outcome?

### 6.3 Use what the user owns first

Future recommendation logic should first ask: Can the user achieve the desired result with products and tools they already own? Only genuine functional gaps should justify future purchase recommendations. This principle is the user-trust foundation: a platform that defaults to recommending purchase cannot earn the right to recommend anything else.

### 6.4 Unknown is valid

Missing information must never be replaced with plausible guesses. Unknown is a correct, storable state. Insufficient verified information is a valid outcome. The system must be willing to say I do not know rather than fabricate a confident-sounding answer.

### 6.5 Preserve historical truth

A meaningful real-world change must not overwrite what was previously true. StrandCue must be able to distinguish current state, past state, and data-entry correction. This principle is implemented in §13 by the choice of append-only event log with derived current-state view.

### 6.6 Evidence is claim-specific

There must never be a single `scientifically_proven` boolean for a product. Evidence attaches to specific claims. A product may have manufacturer evidence for one claim, peer-reviewed evidence for another, and no evidence for a third. The schema must represent this granularity.

### 6.7 Safety and defensibility before cleverness

A slower, explainable, auditable system is preferable to an impressive but hallucination-prone recommendation system. This principle governs the choice of deterministic rules over LLM generation for any safety-relevant recommendation in Phase 2 and beyond.

### 6.8 Auditability [NEW]

Every state change in the system must be reconstructable from an immutable event log. Auditability means that for any user-owned record, an auditor can answer the questions who changed it, when, from what, to what, and why. The why is captured as an event type (real-world change, correction, deletion, migration). The implication is that no UPDATE or DELETE ever destroys the prior state; both are modelled as new events. The test is that, given the event log, an auditor can rebuild the current-state materialised view from scratch and the result matches the production view to the byte.

- **Implication**: Soft-delete is preferred over hard-delete for the active retention window. Hard-delete is reserved for the post-retention expiry step and must preserve an audit-log entry recording the deletion.
- **Test**: For every user-owned table, write a test that inserts, updates, and deletes a row, then queries the audit log and asserts that all three events are present with correct actor, timestamp, before-state, and after-state.

### 6.9 Portability [NEW]

The user can export their full dataset at any time in a machine-readable format (JSON and CSV). Portability is a POPIA data-subject right and is also a user-trust signal: a platform that holds data hostage invites suspicion. The export must include the Hair Passport, chemical history, My Shelf, My Tools, goals, preferences, and the full event history. The export must not include StrandCue's internal metadata that is not about the user (such as platform-level rule version numbers). The export is generated server-side and delivered as a signed download link valid for seven days.

- **Requirement**: An export-my-data button must exist in Settings from Phase 1, even if the early export is JSON-only. The button must produce a complete export within five minutes for a typical user.
- **Risk**: Omitting portability creates lock-in resentment and exposes StrandCue to a POPIA data-subject-access request that the platform cannot fulfil automatically, forcing manual extraction by engineering.

### 6.10 Proportionate data minimisation [NEW]

StrandCue collects only the personal information Phase 1 needs to function. This principle operationalises the POPIA data-minimisation principle. Concretely: the platform does not collect legal name, ID number, phone number, date of birth, street address, GPS, race, or ethnicity. Each field that is collected must have a documented purpose; if a field has no documented purpose, it is removed. The audit test is a field-by-field review against the purpose register; any field without a purpose is removed before public beta.

---

## 7. Phase Strategy & Multi-Phase Roadmap

### 7.1 Phase definitions (preserved from v1.0 §4)

**Phase 1 — Trusted Hair Data Foundation**: Build now. Purpose is to create the secure, structured, versioned and longitudinal information base required for future personalised decision-making.

**Phase 2 — Deterministic Decision Engine**: Do not build during Phase 1. Future scope is hard product rules, protocol sequencing, Today's Protocol, Heat Coach, application intervals, waiting times, incompatibility rules, direct-heat decision logic, explainable recommendation reasoning, and deterministic safety gates. Critical instructions must come from structured rules and verified facts, not free-form AI generation.

**Phase 3 — Personal Learning and Context**: Future scope is wash/session logging, outcome scoring, personal routine performance, feedback-driven adaptation, weather and humidity integration, personalised style longevity insights, and consented privacy-safe community outcome aggregation.

**Phase 4 — Product Intelligence and Commerce**: Future scope is Routine Audit and Shelf Scan, barcode identification, photo-assisted product identification, URL import, large verified product catalogue, retailer and price comparison, optional shopping, optional affiliate functionality, and expanded geographic availability. Commercial features must never compromise neutral recommendation logic.

### 7.2 Indicative roadmap [NEW]

The roadmap below is indicative. Dates are planning placeholders pending team confirmation and are stated in calendar weeks from Phase 1 kick-off. Capital and headcount estimates assume a South African team operating at typical Phase 1 productivity. Headcount is stated in full-time equivalents. The roadmap is reviewed at the end of each milestone and updated; v1.1 does not commit the team to these dates, it commits the team to the sequencing.

| Phase | Indicative build window | Exit criteria summary | Headcount estimate | Capital estimate (ZAR) |
|---|---|---|---|---|
| Phase 1 — Data Foundation | 8–12 weeks | All §30 acceptance criteria met; §32 KPIs instrumented; §33 risks R1–R6 mitigated | 2.0–2.5 FTE engineering + 0.5 FTE product | 【Confirm with finance: indicative 800k–1.4M ZAR】 |
| Phase 2 — Decision Engine | 12–16 weeks | First rule published with evidence; 'Is direct heat appropriate today?' live; A/B framework operational | 3.0 FTE engineering + 0.5 FTE product + 0.25 FTE rules author | 【Confirm: 1.4M–2.2M ZAR】 |
| Phase 3 — Personal Learning | 16–20 weeks | Wash session logging live; outcome scoring live; humidity integration live; cohort n≥50 for community signal | 3.0 FTE engineering + 0.5 FTE data + 0.5 FTE product | 【Confirm: 2.0M–3.0M ZAR】 |
| Phase 4 — Product Intelligence | 20+ weeks | Barcode lookup live; verified catalogue ≥1,000 SKUs; retailer price comparison live; commerce opt-in | 4.0+ FTE engineering + 1.0 FTE catalogue ops + 0.5 FTE product | 【Confirm: 3.0M+ ZAR】 |

The capital estimates are placeholders because StrandCue's funding position is not yet confirmed in the source material. The information owner should populate the placeholders before sharing v1.1 with investors or partners. Until populated, the roadmap should be read as sequencing and scope, not as a funded plan.

### 7.3 Phase entry and exit gates

Each phase has an explicit entry gate and an explicit exit gate. The entry gate for Phase 1 is the existence of this PRD at v1.1 and a committed team. The exit gate is the satisfaction of all criteria in §30 and the absence of any Sev-1 risk in §33. The entry gate for Phase 2 is the satisfaction of all Phase 2 entry criteria in §35. The exit gate for Phase 2 is the publication of the first deterministic rule with attached evidence and an A/B test demonstrating measurable user benefit. Phase 3 and Phase 4 entry gates are defined in their respective phase design documents, to be authored at the end of Phase 2 and Phase 3 respectively.

---

## 8. Phase 1 Scope & Explicit Non-Goals

### 8.1 Explicit non-goals (preserved from v1.0 §5)

The following must NOT be implemented during Phase 1: AI or LLM hair advice; Today's Protocol; Heat Coach; deterministic recommendation output; Routine Audit and Shelf Scan decisions; automatic ingredient interpretation; product suitability scoring; product purchasing recommendations; shopping; affiliate links; advertising; subscriptions; weather; humidity logic; barcode scanning; image and photo diagnosis; scalp diagnosis; medical diagnosis; public community reviews; public user profiles; social network features; international pricing; international retailer logic; multiple currencies; foreign-law logic; multilingual UI beyond future-ready architecture. If a future feature affects the data model, Phase 1 should preserve the necessary architecture without implementing the future behaviour.

### 8.2 Scope boundary enforcement [NEW]

Phase 1 will face pressure to absorb Phase 2 features mid-build. Common pressures include founder instinct to demonstrate the recommendation value early, investor pressure to show a smarter product, and user feedback requesting specific recommendations. The scope boundary enforcement rule is: any proposal to add a Phase 2 feature to Phase 1 must be assessed against three tests. First, does the feature preserve the data-model readiness for Phase 2 without implementing Phase 2 behaviour? If yes, it may be considered. Second, does the feature require new schema that cannot be cleanly added later? If yes, the feature is rejected. Third, does the feature create a maintenance burden that competes with Phase 1 completion? If yes, the feature is rejected.

- **Requirement**: A scope-change log must be maintained in the repository. Every proposal to add a Phase 2 feature to Phase 1 — whether accepted or rejected — must be recorded with the proposal, the decision, the rationale, and the decision-maker.
- **Risk**: Without a scope-change log, scope creep is invisible until it has consumed the timeline. The log is the early-warning signal.

### 8.3 Phase 1 stretch goals [NEW]

Stretch goals are features that may be added to Phase 1 if the critical path is delivered ahead of schedule. They are explicitly non-blocking: failure to deliver a stretch goal does not delay the Phase 1 exit gate. Stretch goals for Phase 1 are: (a) draft product search across a seed catalogue of 50–100 SKUs entered by the team; (b) timeline view of chemical history with year markers; (c) draft Hair Passport completeness score shown to the user; (d) basic CSV export of My Shelf. Each stretch goal must be reverted cleanly if it interferes with Phase 1 acceptance criteria.

<!-- CHUNK1_END -->

---

## 9. Market Scope & Competitive Context [NEW]

### 9.1 Phase 1 market scope (preserved from v1.0 §6)

Phase 1 is South Africa first. Defaults are `country_code = ZA`, currency = ZAR, temperature = Celsius, language = English initially, users = adults aged 18+. The architecture should remain extensible internationally, but international behaviour must not be implemented in Phase 1. Avoid schema decisions that unnecessarily hard-code South Africa into immutable structures.

### 9.2 Competitive landscape

| Competitor | Archetype | Market | Weakness vs StrandCue |
|---|---|---|---|
| Function of Beauty | Catalogue-first customiser | US, global | Business model requires purchase; cannot say no purchase needed |
| Prose | Catalogue-first customiser | US, global | Single quiz snapshot; no longitudinal history |
| NaturallyCurly | Community-first resource | US, global | Anecdotal signal; no per-user longitudinal evidence |
| CurlTalk (Reddit) | Community-first resource | Global | No provenance; no brand neutrality enforcement |
| General LLM chatbots | AI advice chatbot | Global | Hallucination risk; no verifiable source; no personalisation beyond prompt |
| Local salon consults | In-person professional | ZA | Not scalable; not on-demand; no historical record |

### 9.3 South African regulatory environment

Three South African statutes materially affect StrandCue. The Protection of Personal Information Act 4 of 2013 (POPIA) is the primary data-protection statute and is fully in force. Compliance is addressed in §21. The Consumer Protection Act 68 of 2008 (CPA) governs fair marketing, product disclosure, and consumer rights; StrandCue's brand-neutral and no-fabrication principles align with CPA's fairness requirements. The Electronic Communications and Transactions Act 25 of 2002 (ECT Act) governs electronic transactions and data messages; StrandCue's consent capture and audit log design must produce records that satisfy the ECT Act's requirements for data-message integrity and timestamping. A formal legal opinion should be obtained before public beta; the placeholder for that opinion is in §21.

- **Requirement**: Before public beta, StrandCue must obtain a written legal opinion covering POPIA, CPA, and ECT Act compliance. The opinion must be retained for the duration of operation plus the statutory retention period.
- **Risk**: Without a legal opinion, StrandCue operates under interpretive risk. A single data-subject complaint to the Information Regulator can trigger an investigation that the platform cannot defend without documented compliance.

### 9.4 South African hair-care market sizing

Market sizing for the South African hair-care category is not confirmed in the source material. The information owner should populate the placeholder below before sharing v1.1 with investors.

> 【Confirm market size — South African hair-care category in ZAR billion; addressable segment for personalised decision platform; growth rate】

### 9.5 Beachhead strategy

The beachhead strategy is to validate the data foundation with a small cohort of internal and invited users before any commerce or community features are designed. The cohort is built in three layers. Layer 1 is the founder and immediate team — five to ten people who exercise the schema with their own hair history. Layer 2 is invited users from the founder's professional network — salon professionals and engaged consumers, fifty to one hundred people who agree to use the beta and provide structured feedback. Layer 3 is a soft launch to a waitlist — up to five hundred users who registered interest. Each layer has explicit exit criteria before the next layer opens. Layer 1 exit: all §40 test personas can be entered without special-case schema changes. Layer 2 exit: activation rate exceeds 50% and no Sev-1 defects. Layer 3 exit: D7 retention exceeds 25% and no Sev-1 security findings.

---

## 10. Target Users, Personas & Jobs-to-be-Done [NEW]

### 10.1 Target hair profiles (preserved from v1.0 §7)

StrandCue is for adults with any relevant cosmetic hair history, including straight hair; wavy hair; curly hair; coily hair; mixed patterns; untreated hair; grey hair; coloured hair; highlighted hair; bleached hair; keratin-treated hair; Brazilian smoothing; Nanoplasty and Nanoplastia; relaxed hair; texturised hair; permed hair; chemically straightened hair; heat-styled hair; and hair with mixed histories across different zones. The system must not use race or ethnicity as a proxy for hair behaviour.

### 10.2 Jobs-to-be-Done framework

Each persona is described using the Jobs-to-be-Done (JTBD) framework. A JTBD statement takes the form: When [situation], I want to [motivation], so I can [expected outcome]. The primary JTBD is the job the user most often hires StrandCue for. The secondary JTBD is the job the user values but hires less often. The success signal is the observable behaviour that indicates the user has achieved their outcome. The failure signal is the observable behaviour that indicates StrandCue has failed the user. Each persona also has a test data note describing how the persona exercises the schema.

### 10.3 Persona set

#### 10.3.1 Persona: Lerato (transitioning relaxed to natural)

| Field | Value |
|---|---|
| Age band | 25–30 |
| Hair profile | Coily roots (new growth) + relaxed mid-lengths and ends (mixed zones) |
| Primary JTBD | When I'm deciding what to do with my hair this week, I want to know what's safe for my transitioning hair, so I can avoid breakage at the line of demarcation. |
| Secondary JTBD | When I'm tempted to buy a new product, I want to know if it duplicates something I already own, so I don't waste money. |
| Budget tier | Best value / restricted |
| Success signal | Logs a chemical service; adds at least 3 products; returns within 7 days |
| Failure signal | Cannot represent mixed zones (relaxed vs natural) in a single chemical service record |
| Test data note | Exercises: mixed zone chemical_services row; budget_preference='best value'; concern='breakage'; goal='maintain natural texture' |

#### 10.3.2 Persona: Anika (chemically processed and highlighted)

| Field | Value |
|---|---|
| Age band | 30–40 |
| Hair profile | Wavy, permanent colour + balayage highlights, previous keratin treatment |
| Primary JTBD | When I'm considering another chemical service, I want to know what my hair has already been through, so I can avoid cumulative damage. |
| Secondary JTBD | When I'm choosing products, I want to know which are colour-safe and bond-repairing, so I preserve the colour and the integrity. |
| Budget tier | Premium |
| Success signal | Adds 3+ chemical services across multiple years; adds 5+ products with verification status; returns monthly |
| Failure signal | Cannot store multiple chemical services on overlapping dates with different zones |
| Test data note | Exercises: 3+ chemical_services rows with overlapping dates; premium budget; concerns='colour damage, chemical damage'; goal='maintain colour' |

#### 10.3.3 Persona: Johan (grey, coastal humidity)

| Field | Value |
|---|---|
| Age band | 50+ |
| Hair profile | Straight, grey, untreated, humidity-sensitive |
| Primary JTBD | When I wake up in a humid coastal city, I want to know if today is a direct-heat day or not, so I don't make the frizz worse. |
| Secondary JTBD | When I'm buying products, I want to know which actually control humidity reversion, so I'm not wasting money on marketing claims. |
| Budget tier | Mid-range |
| Success signal | Adds environmental_sensitivity='humidity'; adds 2+ anti-humidity products; returns weekly in humid season |
| Failure signal | Cannot store environmental sensitivity without GPS |
| Test data note | Exercises: environmental_sensitivity='humidity'; concern='humidity reversion'; styling_habit='flat iron' with frequency |

#### 10.3.4 Persona: Priya (wig and extensions wearer)

| Field | Value |
|---|---|
| Age band | 20–25 |
| Hair profile | Natural hair underneath (unknown pattern, hidden by wig); wears wigs and tape-in extensions alternately |
| Primary JTBD | When I'm rotating between my natural hair, a wig, and extensions, I want to track what's underneath, so my real hair stays healthy. |
| Secondary JTBD | When I'm shopping for wig-care products, I want to know which are safe for the hair underneath, so I don't damage it. |
| Budget tier | Mid-range |
| Success signal | Logs wig-wear periods; logs extension application and removal; tracks underlying hair separately |
| Failure signal | Cannot represent 'hair underneath' as a separate zone from 'hair worn over' |
| Test data note | Exercises: zone='whole head' for wig vs zone='roots+mid-lengths' for underlying hair; chemical_service='other' with notes |

### 10.4 Anti-persona: who StrandCue is NOT for in Phase 1

Phase 1 is not for users seeking an immediate recommendation. A user who downloads StrandCue expecting Today's Protocol on first launch will be disappointed, and that disappointment is by design. The anti-persona is: a user who wants an AI hair-advice chatbot. StrandCue in Phase 1 explicitly does not provide this. The onboarding copy must set this expectation on the welcome screen so the anti-persona self-selects out before registering.

---

## 11. Account & Authentication Model

### 11.1 Identity (preserved from v1.0 §8.1)

StrandCue does not require a legal identity. The account model is: StrandCue identity is a chosen username; authentication is a private email and password; recovery is a verified email; permanent database identity is the Supabase Auth UUID; owned-data relationship is `user_id`. StrandCue does not require legal name, surname, South African ID, passport number, phone number, exact date of birth, street address, precise GPS, race, or ethnicity.

### 11.2 Adult gate (preserved from v1.0 §8.3)

Registration begins with the question *Are you 18 years or older?* Options are Yes or No. If No, do not continue registration in Phase 1. Do not request date of birth. The adult gate is a self-attestation; StrandCue does not verify age against any external identity system in Phase 1.

### 11.3 Authentication requirements (preserved from v1.0 §9)

Use Supabase Auth with email and password. Do not build custom authentication. Do not store password data in application tables. The sign-up flow is: adult confirmation; choose username; enter private email; create password; create Supabase Auth account; create application profile linked to `auth.users.id`; complete email confirmation flow if enabled; continue to onboarding and Hair Passport.

Username is user-facing, need not be a real name, must be unique, may be changed, must never be the primary database owner key, and must not be generated automatically from email. Changing username must not affect user-owned records. Email is private authentication information, used for account creation, sign-in, email confirmation, password recovery, and security messages. Email must not be used for public identity, community display, Hair Passport sharing, product reviews, marketing without separate consent, or as a user-owned foreign key. Avoid duplicating email into `public.profiles` unless technically justified.

Password recovery is mandatory. The required flow is: user enters email; app calls supported Supabase password-reset mechanism; recovery email is sent; secure mobile deep link opens StrandCue; user reaches Create New Password screen; password is updated using Supabase Auth; user returns to account; existing history remains linked to the same UUID. Password recovery is not complete until the entire mobile deep-link flow has been tested successfully. Use neutral recovery messaging such as: *If an account is associated with that email, recovery instructions will be sent.*

### 11.4 Session policy [NEW]

Supabase Auth issues a JWT access token and a refresh token. The session policy for StrandCue Phase 1 is: access token TTL of one hour; refresh token TTL of thirty days; idle timeout of fourteen days (if no refresh occurs, the user must re-authenticate); on token refresh failure, the client must not silently retry indefinitely — three failed refreshes trigger a sign-out and a redirect to the sign-in screen with the message *Your session has expired, please sign in again*. Session state is persisted in secure storage (Expo SecureStore) and never in AsyncStorage.

- **Requirement**: All authenticated API calls must include the access token in the Authorization header. The client must proactively refresh the token before expiry, not reactively after a 401.
- **Risk**: Reactive refresh produces a visible loading flicker on every token boundary and can cascade into bulk re-authentication if multiple calls fail simultaneously.

### 11.5 Rate limiting [NEW]

Authentication endpoints are the primary target for credential-stuffing attacks. The rate-limit policy is: sign-in endpoint limited to ten attempts per IP per minute and five attempts per email per minute; password-reset endpoint limited to three requests per email per hour and ten per IP per hour; sign-up endpoint limited to five per IP per minute. Rate limits are enforced at the Supabase Edge Function layer (or equivalent API gateway) and not at the client. When a limit is exceeded, the response is HTTP 429 with a Retry-After header.

- **Test**: Automated test: a script attempts 20 sign-ins in 30 seconds from a single IP against a test account; the 11th through 20th attempts must return 429. Repeat per-email with rotating IPs; the 6th email-specific attempt must return 429.

### 11.6 Username policy [NEW]

Username must be 3–32 characters in length, must consist of letters, numbers, underscores, hyphens, and full stops, must begin and end with a letter or number, must not contain consecutive special characters, and must not match a reserved-words list (admin, strandcue, support, root, system, help, api, null, undefined). Profanity filtering is performed against a curated list and rejects obvious profanity; the list is reviewed quarterly. Username changes are limited to one per seven days to prevent abuse and to maintain recognisability within any future community feature.

### 11.7 Email change [NEW]

Email change is supported via a re-confirmation flow. The user requests a change to a new email; a confirmation link is sent to the new email; on confirmation, the old email is informed of the change and the new email becomes authoritative. The old email retains the ability to revert the change for seven days. This flow is implemented using Supabase Auth's native email-change mechanism and is not custom-coded.

### 11.8 Multi-factor authentication — Phase 2 stretch [NEW]

MFA is not implemented in Phase 1. The architecture must preserve the option to add TOTP-based MFA in Phase 2 by using Supabase Auth's MFA extension point. The `user_preferences` table must include an `mfa_enabled` boolean (default false) and an `mfa_method` enum (default null) so the schema does not need to be altered when MFA is activated.

<!-- CHUNK2_END -->

---

## 12. Hair Passport & Profile Model

### 12.1 Profile model (preserved from v1.0 §10)

A profile is linked permanently to the Supabase Auth UUID. Conceptual fields are `user_id`, `username`, `country_code`, `adult_confirmed`, `budget_preference`, `max_product_budget_zar` (nullable), `created_at`, `updated_at`. Application-owned records use `user_id`. Email remains authoritative in Supabase Auth.

### 12.2 Hair Passport enumerations (preserved from v1.0 §11)

**Natural pattern**: straight; wavy; curly; coily; mixed; not sure. Detailed curl typing may be added later but must not become the entire recommendation model.

**Strand diameter**: fine; medium; coarse; not sure.

**Density**: low; medium; high; not sure.

**Porosity**: low; medium; high; unknown or not sure. Never infer porosity.

**Length**: optional, structured but flexible.

**Cosmetic scalp observations**: non-diagnostic cosmetic observations may be captured; do not convert observations into medical diagnoses.

**Current concerns** (multiple selection): dryness; frizz; breakage; shedding; tangling; split ends; stiffness; dullness; oily or greasy scalp; dry scalp; thinning or hair-loss concern; heat damage concern; chemical damage concern; colour damage concern; humidity reversion; other. Medical red flags are handled separately.

**Goals**: maintain natural texture; improve manageability; reduce frizz; improve softness; reduce breakage; smooth blow-out; preserve curls; reduce unnecessary direct heat; maintain colour; improve style longevity; other.

**Styling habits**: natural curls; air dry; diffuser; blow-out; hot-air brush; air styler; roller set; wrap or swirl; hood dryer; flat iron; curling iron or wand; hot comb; steam straightener; heated rollers; other. Frequency must be recordable.

**Environmental sensitivities**: humidity; dryness; heat; rain; coastal conditions; unknown. Precise GPS is not required.

**Economic preference**: use what I already own first; cheapest effective; best value; mid-range; premium; no budget preference. Optional maximum budget in ZAR. Price is not evidence of efficacy.

### 12.3 Hair Passport completeness score [NEW]

The completeness score is a Phase 1 stretch goal (see §8.3). If implemented, the score is computed as the percentage of Hair Passport fields that are populated with non-null, non-unknown values across the seven core dimensions: pattern, strand diameter, density, porosity, concerns, goals, and styling habits. The score is shown to the user as a percentage with a friendly label: 0–30% (Just starting), 31–60% (Taking shape), 61–85% (Nearly complete), 86–100% (Complete). The score is never shown to anyone except the user; it is not used in any decision logic in Phase 1. The score is recomputed on every Hair Passport save.

- **Requirement**: If the completeness score is implemented, it must be derivable from the event log alone — no separate score table that can drift out of sync with the underlying data.
- **Risk**: A separately-stored score becomes a source of truth that diverges from the underlying events. The score must always be computed.

### 12.4 Edit-versus-correct flow [NEW]

The user interface must distinguish two intents when a user changes a Hair Passport field. The first intent is a real-world change: the user's hair has changed (e.g., new chemical service, growing out a relaxer, hair-loss progression). This intent creates a new event in the append-only log with `event_type='real_world_change'`. The second intent is a correction: the user entered the wrong value previously (e.g., selected 'coarse' instead of 'fine'). This intent creates a new event with `event_type='correction'` referencing the original `event_id`. The UI must ask the user which intent applies when a Hair Passport field is changed; the default selection is real-world change because that is the more common case in field use. The distinction is implemented as an event metadata field, not as a separate UI flow, to avoid forcing the user through two different screens.

- **Test**: Change a Hair Passport field twice — once as a correction, once as a real-world change — then query the current state and the history view. The current state must reflect the latest value; the history view must show both events with their distinct types.

### 12.5 Save-resume and onboarding step count [NEW]

The Hair Passport is collected over a maximum of seven onboarding screens, each capturing one or two related fields. The user may exit at any point and resume later; partial state is persisted locally on the device (Expo FileSystem) and synced to the server when the user reaches the end of the flow or pauses for more than thirty seconds. The first valuable moment is Hair Passport completion. Activation is defined in §24 as: user has saved at least one product or one chemical service (or has explicitly marked no chemical history) plus Hair Passport complete.

---

## 13. Longitudinal History Model & Temporal Patterns

### 13.1 Requirement (preserved from v1.0 §12)

This is a fundamental architectural requirement. StrandCue must distinguish between current state, previous state, and correction of erroneous data. A real-world change creates history. A data-entry correction may replace erroneous data. Information requiring historical preservation includes at minimum: hair condition and state; concerns; chemical services; styling habits; goals; relevant preferences; products owned and used; tools owned and used; user-recorded state changes; and future treatment outcomes. Future intelligence must be able to answer: what was true before; what the user changed; what routine was used; and what happened afterwards. Do not design Phase 1 in a way that destroys this future causal and longitudinal context.

### 13.2 Chosen temporal pattern [NEW]

v1.0 §35 permitted three temporal patterns: append-only records with effective dates; current record plus history table; and event model with derived current state. v1.1 commits to the third pattern: an append-only event log with a derived current-state materialised view. The choice is documented here as an architectural decision record (ADR) so it cannot be silently changed.

**Justification**: First, the append-only event log preserves historical truth trivially because no event is ever deleted or mutated; corrections are new events with `type='correction'` referencing the original event. Second, queries against current state are O(1) via a materialised view that is updated by a Postgres trigger on every insert; this gives the read performance of a current-table-plus-history-table design without the dual-write complexity. Third, future causal analysis (Phase 3) is supported directly because the event log is already in the correct shape for temporal queries. Fourth, the pattern is robust to schema evolution: new event types can be added without altering existing events, and the materialised view can be regenerated from the log if the derivation logic changes.

### 13.3 Event log schema sketch

| Column | Type | Notes |
|---|---|---|
| `event_id` | uuid (PK) | Generated server-side; never reused |
| `user_id` | uuid (FK to `auth.users.id`) | RLS policy: `user_id = auth.uid()` |
| `entity_type` | text (enum) | `hair_profile`, `concern`, `goal`, `styling_habit`, `chemical_service`, `user_product`, `user_tool`, `preference` |
| `entity_id` | uuid | Stable identifier for the logical entity (e.g., a specific chemical service) |
| `event_type` | text (enum) | `create`, `real_world_change`, `correction`, `soft_delete`, `hard_delete` |
| `corrects_event_id` | uuid (nullable) | Set when `event_type='correction'`; references the original event being corrected |
| `payload` | jsonb | Full field set of the entity at this event; never mutated |
| `actor` | text (enum) | `user`, `system`, `migration`, `admin` |
| `occurred_at` | timestamptz | Server time; not client time |
| `client_occurred_at` | timestamptz (nullable) | Client-supplied timestamp; used for offline reconciliation |
| `supersedes_event_id` | uuid (nullable) | Set when this event replaces a prior event (e.g., a correction supersedes the original) |

### 13.4 Derived current-state materialised view

A materialised view named `current_state` is built on top of the event log. For each entity, the view selects the latest event that is not superseded by a subsequent correction. The view is refreshed by a Postgres trigger on every insert into the event log; the refresh is scoped to the affected entity to avoid full re-materialisation. The view exposes one row per current entity, with the latest payload as columns. Read queries from the API hit the materialised view, not the event log; this gives O(1) read performance.

ASCII sketch of the derivation:

```
event_log (append-only)  →  trigger  →  current_state (materialised view)
       |                                |
       |  historical query             |  current-state query
       |  (Phase 3)                    |  (Phase 1 API)
       v                                v
   temporal CTEs                  API responses
```

### 13.5 Audit log requirement

Separate from the event log (which models user-facing state changes), an audit log captures every administrative and privileged operation. Audit log entries are written by server-side functions and are not user-writable. The audit log captures: operation (e.g., `auth_account_deletion`, `product_verification`, `rls_policy_change`), actor (admin user_id), target (affected user_id or table row), timestamp, before-state (jsonb), after-state (jsonb), and reason. The audit log is retained for seven years to satisfy POPIA's records-of-processing requirement.

- **Requirement**: The audit log must be append-only at the database level; no UPDATE or DELETE permission is granted to any role, including admin. Insert is the only permitted operation.
- **Risk**: If the audit log is mutable, it cannot serve as evidence in a regulatory investigation. The immutability is the audit log's reason for existing.

---

## 14. Chemical & Service History

### 14.1 Service types (preserved from v1.0 §13)

Each service is a separate historical record. Explicit types include: permanent colour; demi-permanent colour; semi-permanent colour; highlights; balayage; bleach and lightener; colour remover; keratin treatment; Brazilian smoothing; Nanoplasty and Nanoplastia; relaxer; texturiser; perm; chemical straightening; other. Fields support `user_id`; service type; approximate or exact service date where known; frequency and repeat information; salon or home where relevant; zones treated; whether the affected hair is still present; known or unknown chemical system; known or unknown heat exposure; notes; `created_at`; `updated_at`.

### 14.2 Hair zones (preserved from v1.0 §13.1)

Support roots; mid-lengths; ends; front; crown; nape; whole head; other. A user may have multiple zones in a single service. Do not assume all hair has the same treatment history.

### 14.3 Nanoplasty / Nanoplastia (preserved from v1.0 §13.2)

Nanoplasty and Nanoplastia must be explicit. It should be represented as a cosmetic smoothing or straightening service with possible salon heat exposure. Do not infer exact chemical system, ingredient chemistry, flat-iron temperature, or number of passes. If unknown, store unknown.

### 14.4 Still-present-on-head boolean and auto-expiry [NEW]

Each chemical service record has a `still_present_on_head` boolean (default true) and an `estimated_grow_out_date` computed field. The grow-out date is estimated from the service date plus a per-service-type expected growth period. Growth periods are: permanent colour 12 months, demi-permanent 6 months, semi-permanent 3 months, highlights 12 months, balayage 12 months, bleach 18 months, colour remover 3 months, keratin 6 months, Brazilian smoothing 6 months, Nanoplasty 6 months, relaxer 12 months, texturiser 12 months, perm 12 months, chemical straightening 12 months. When the current date exceeds the estimated grow-out date, the `still_present_on_head` field transitions to false automatically via a nightly job, but the service record remains queryable in history. The user can override the auto-computed boolean if they have cut the treated hair out earlier than the estimate.

- **Requirement**: The auto-expiry job must be idempotent; running it twice must produce the same result. The job must log every transition it makes to the audit log.
- **Risk**: A non-idempotent expiry job can flip-flop the `still_present_on_head` field across runs, corrupting the user's view of their current hair.

### 14.5 Zone-overlap matrix [NEW]

A single chemical service can apply to multiple zones. The schema represents this as an array of zones on the `chemical_services` row (stored as jsonb or as a linking table `service_zones`). Do not create a separate service record per zone. The zone-overlap matrix is the set of valid zone combinations; the schema does not constrain the combination, but the UI surfaces the most common combinations (roots and mid-lengths; mid-lengths and ends; whole head; roots only) as quick-selects.

### 14.6 Soft conflict detection [NEW]

Some combinations of chemical services within a short window carry elevated risk. Examples: bleach within 14 days of a relaxer; permanent colour within 7 days of a keratin treatment; multiple chemical straightening services within 90 days. The system does not block these combinations (the user may have had them done before registering, or may have had professional advice that overrides the warning). The system surfaces a soft warning to the user when such a combination is detected at entry time. The warning is non-blocking and includes a recommendation to consult a professional. The conflict detection rules are stored in a rules table that can be updated without a code change.

- **Requirement**: Conflict detection rules must be data-driven (stored in a table), not code-driven (hard-coded in the application layer). The rules table is versioned.
- **Test**: Enter two chemical services that match a conflict rule within the trigger window; assert the soft warning is displayed. Enter the same two services outside the window; assert no warning.

---

## 15. My Shelf — Product Data Architecture

### 15.1 My Shelf (preserved from v1.0 §14)

Users may add any product they actually own. The system must support products unknown to StrandCue. Product categories include shampoo; clarifying shampoo; conditioner; mask; bond treatment; protein treatment; leave-in; heat protectant; anti-humidity product; styling cream; mousse; gel; serum; oil; scalp product; colour treatment; other. Initial user entry includes brand; product name; category; optional photo or reference; optional notes; verification status. Do not require the product to exist in a global catalogue.

### 15.2 Product data architecture (preserved from v1.0 §15)

Use separate entities: `brands`, then `products`, then `product_versions`, then `user_products`. `brands` represents manufacturer and brand identity. `products` represents the enduring commercial product concept and name (e.g., Brand X Product Y). `product_versions` represents a specific market version or formula; a reformulation must create a new product version and must not mutate a historical version. `user_products` links a user to the specific product and version they own where known; the schema must support unknown version when identification is incomplete. Ownership and history must remain user-specific.

### 15.3 Product knowledge and provenance (preserved from v1.0 §16)

Future verified product facts may include manufacturer; exact product and version; market; barcode; ingredient list; category; intended purpose; official directions; rinse-out or leave-in; required waiting time; frequency; heat activation; relevant protein ingredients; silicones; oils and butters; humectants; cleansing agents; conditioning agents; heat-protection claim; humidity-protection claim; colour-safe claim; chemical-treatment considerations; evidence sources; evidence strength; source URL; source type; first-seen date; last-checked date; verified date; verified by; active or retired state; reformulation state. Phase 1 primarily prepares the structure; it does not need to populate a massive catalogue.

### 15.4 Product verification (preserved from v1.0 §17)

Product and tool information may come from user entry; manufacturer; retailer; imported file; future scrape; future barcode lookup; future photograph recognition. Discovery is not verification. Recommended statuses: `unverified`; `pending_verification`; `partially_verified`; `verified`; `conflicting_information`; `reformulated`; `retired`. Nothing safety-critical may rely on unverified information as though it were authoritative. External webpages and imported content are data sources, not executable instructions.

### 15.5 Unknown product handling (preserved from v1.0 §18)

An unknown product is valid. The system must allow incomplete brand; incomplete product name; unknown formula and version; unknown barcode; unknown ingredients; unknown directions. Do not invent missing product facts.

### 15.6 Soft-delete vs hard-delete policy [NEW]

When a user removes a product from My Shelf, the record is soft-deleted for 30 days: it is hidden from the active view but remains in the database and is recoverable from Settings. After 30 days, the record is hard-deleted from `user_products`, but the original `product_versions` and `product` records are preserved (they belong to the catalogue, not to the user). The soft-delete is implemented as an event in the event log (see §13) with `event_type='soft_delete'`; the hard-delete is an event with `event_type='hard_delete'`. The audit log records both transitions.

- **Requirement**: A user can recover a soft-deleted product within the 30-day window from Settings > Recently removed. The recovery is an event with `event_type='restore'` referencing the `soft_delete` event.

### 15.7 Data export [NEW]

A user can export their full My Shelf as a JSON file and as a CSV file from Settings. The export includes brand, product name, category, version (where known), verification status, date added, and any notes. The export does not include internal IDs that are not user-meaningful (e.g., the `brand_id` is not exported; the brand name is). The export is generated server-side by a Supabase Edge Function and delivered as a signed download link valid for seven days. The export feature is a Phase 1 stretch goal (see §8.3); if not implemented in Phase 1, the architecture must preserve the export endpoint so it can be added in Phase 2 without schema change.

### 15.8 Barcode field [NEW]

The `product_versions` table includes a `barcode` column (nullable, text). The column is reserved for Phase 4 barcode-lookup functionality. In Phase 1, the column is not populated and is not exposed in the UI. The column is included in Phase 1 to avoid a schema migration when Phase 4 is built.

### 15.9 Conflict resolution between sources [NEW]

When two sources disagree about a product fact (e.g., the manufacturer says the product is silicone-free but an independent test detects silicones), the conflict resolution rule is: the higher-trust source wins for display, but both sources are retained and the verification status is set to `conflicting_information`. The user sees both sources in the product detail view. No source is silently discarded. The trust tier hierarchy is documented in §16.

---

## 16. Product Knowledge, Provenance & Verification

### 16.1 Trust tier hierarchy [NEW]

Sources of product information are classified into a trust tier hierarchy. The hierarchy determines which source wins when sources conflict (see §15.9). The hierarchy is also surfaced to the user so they can evaluate the strength of evidence behind any product fact.

| Tier | Source type | Examples | Strength |
|---|---|---|---|
| T1 | Regulator or safety source | FDA, MHRA, SAHPRA, EU SCCS | Authoritative for safety and regulatory claims |
| T2 | Peer-reviewed evidence | Indexed journal articles, systematic reviews | Strong for efficacy claims, scoped to study population |
| T3 | Professional organisation | Professional bodies, cosmetology associations | Moderate; reflects professional consensus |
| T4 | Independent testing | Laboratory assays, third-party verifier | Strong for specific tested property |
| T5 | Manufacturer instruction | Official directions, product insert | Authoritative for usage; not for efficacy |
| T6 | Formulation-based inference | Ingredient analysis, structure-activity reasoning | Weak; theoretical, not empirically tested |
| T7 | StrandCue community outcome | Aggregated user outcomes (Phase 3) | Anecdotal unless n≥50; never labelled scientific |
| T8 | Consumer signal | Aggregated consumer behaviour | Weak; subject to selection bias |
| T9 | Individual anecdote | Single-user report | Never generalisable; never evidence |
| T10 | Marketing-only claim | Brand advertising, promotional material | Not evidence; never displayed as such |

### 16.2 Source archiving [NEW]

Source URLs are archived via an external archiving service (Wayback Machine or equivalent) at the time of first verification. The archived URL is stored alongside the original URL in the `product_sources` table. If the original URL later returns a 404 or the content changes, the archived URL remains accessible. This prevents link rot from destroying the evidence base over time.

- **Requirement**: Every `product_source` row must have an `archived_url` field populated at first verification. If archiving fails, the verification record is marked as `archive_pending` and a retry job runs nightly until success or until 14 days have elapsed, at which point the source is flagged for manual review.

### 16.3 Reverification cadence [NEW]

Verified facts are not verified forever. The reverification cadence is: tier T1 and T2 sources are re-checked every 12 months; tier T3 and T4 every 12 months; tier T5 every 6 months (manufacturers change directions more often than regulators change rules); tier T6 every 6 months; tier T7 every 3 months (community signals change fast); tier T8 and T9 every 6 months; tier T10 never re-verified (marketing claims are not evidence). The reverification job produces a queue of facts whose `last-checked` date exceeds the cadence; a human verifier works the queue. Facts that fail reverification (source no longer supports the claim) are downgraded to `conflicting_information` pending resolution.

### 16.4 Conflict resolution flow [NEW]

When a new source conflicts with an existing verified fact, the flow is: (a) the new source is stored as a `product_source` row; (b) the verification status of the affected fact is set to `conflicting_information`; (c) both sources are retained and both are displayed in the product detail view; (d) the higher-trust source is used for any decision logic in Phase 2; (e) the conflict is flagged for human review. The user is never shown a single conflated truth; the user sees the conflict and the sources.

---

## 17. My Tools Architecture

### 17.1 Tools architecture (preserved from v1.0 §19)

Use the hierarchy `tool_brands`, then `tools`, then `tool_versions`, then `user_tools`. Support: hair dryer; hot-air brush or blow-dry brush; air styler; hood dryer; flat iron; hot comb; curling iron or wand; steam straightener; heated rollers; diffuser; other. Fields include brand; model; type; market and version; temperature settings where known; wattage where relevant; adjustable temperature; direct-contact heat; verification status. Do not infer tool temperature from wattage. Unknown temperature must remain unknown. Prepare architecture for future separate heat-event logging rather than a single `used_heat` boolean.

### 17.2 Temperature unit normalisation [NEW]

Tool temperature is stored internally in Celsius. The user's locale determines the display unit: Celsius for South Africa (Phase 1 default); Fahrenheit reserved for future US market (Phase 4). The conversion is performed at the display layer, never at the storage layer. A user who switches locale after entering a temperature sees the same physical value in the new unit; the underlying record does not change.

### 17.3 Future heat-event log schema [NEW]

Phase 3 will introduce per-styling-session heat-event logging. Each heat event is a separate record capturing: `tool_id` (FK to `user_tools`); `event_date`; zone(s) treated; `temperature_setting` (if known); `duration_estimate` (if known); `pass_count` (if known); pre-heat products applied (FK to `user_products`, array); post-heat products applied (FK to `user_products`, array); `outcome_score` (Phase 3). Phase 1 preserves the schema shape (the table exists with nulls) but does not implement the UI for entering heat events. This is the architecture-readiness commitment from v1.0 §19.

### 17.4 Distinct unknowns [NEW]

Unknown wattage and unknown temperature are distinct unknowns. A tool may have a known wattage (e.g., 2200W) but an unknown temperature (the user does not know what temperature they actually use). The schema represents these as separate nullable fields: `wattage_watts` (nullable integer) and `temperature_max_celsius` (nullable integer). Neither is inferred from the other.

### 17.5 Tool photo [NEW]

A tool photo is optional in Phase 1 and is stored as a Supabase Storage URL on the `user_tools` row. The photo is never used for product identification in Phase 1; that functionality is reserved for Phase 4 (photo-assisted product identification). The photo is shown to the user as a visual aid in My Tools. Storage is private to the user (Storage RLS policy matches the database RLS policy).

<!-- CHUNK3_END -->

---

## 18. Future Routine Audit, Rules Engine & Evidence Model

### 18.1 Future routine audit (preserved from v1.0 §20)

Phase 1 must preserve the data needed for a future Routine Audit or Shelf Scan. Future outcomes may include keep; use less often; remove; change order; duplicate; missing functional category; no purchase needed; insufficient verified information. These decisions are explicitly out of scope for Phase 1.

### 18.2 Future deterministic rules engine (preserved from v1.0 §21)

Phase 2 will contain hard rules that AI may explain but not override. Examples of future rule types: wait periods; rinse and no-rinse; application order; wash-cycle intervals; treatment frequency; heat activation; incompatibility constraints; maximum and minimum use intervals; direct-heat cautions. An illustrative future rule structure is:

```
conditioner_before = false
wait_minutes = 4
rinse_after = false
initial_cycle_min_washes = 4
initial_cycle_max_washes = 6
```

Rules must be tied to verified product versions and sources.

### 18.3 Rule authoring workflow [NEW]

Rules are not written by an LLM. Rules are authored by a human rules author with subject-matter expertise, attached to evidence sources (§16), peer-reviewed by a second human reviewer, and published with a semantic version. The authoring workflow is: proposal (draft rule with rationale); evidence attachment (link to T1–T4 sources); peer review (second reviewer signs off); publish (rule becomes active with version vN.M); deprecate (rule is retired but remains queryable for historical recommendations). Every rule carries its evidence chain so that any recommendation derived from the rule can be explained to the user as *This recommendation is based on rule vX.Y, which is supported by [source T1], [source T3], and [source T4]*.

- **Requirement**: Rule proposals, reviews, and publications must be retained in a `rules_history` table. No rule is ever mutated; a new version is published instead. Historical recommendations can be reconstructed from the rule version that was active at the time.

### 18.4 Rule versioning [NEW]

Rules are immutable once published. When a rule needs to change (e.g., new evidence suggests a different waiting time), a new rule version is published with an incremented semantic version. The old version is deprecated but remains queryable. Every recommendation log records the rule version that produced it. This allows a future investigation to answer: why was this user told X in October 2026? Answer: because rule v1.3 was active, and rule v1.3 was supported by [evidence].

### 18.5 Evidence model (preserved from v1.0 §22)

Never implement `scientifically_proven = true` or `false`. Evidence must be claim-specific. Future claim evidence classes include: regulator or safety source; peer-reviewed evidence; professional organisation; independent testing; manufacturer instruction; formulation-based inference; StrandCue community outcome; consumer signal; individual anecdote; marketing-only claim. Manufacturer instructions may establish how the manufacturer says a product should be used without proving efficacy. Anecdotal reports must never be labelled scientific proof.

### 18.6 Future evidence presentation (preserved from v1.0 §23)

Future recommendation explanation should distinguish: verified product directions; scientific evidence; manufacturer claim; inference; community outcome; user's own historical outcome; uncertainty. Confidence should derive from the underlying evidence, not simply from AI confidence.

### 18.7 Community outcome data (preserved from v1.0 §25)

Future anonymous and aggregated outcomes may answer: How did this product or routine perform for users with characteristics similar to mine? Requirements are: clear consent; privacy protection; adequate aggregation; no direct identity leakage; explicit labelling as StrandCue community outcome data; never labelled as scientific proof.

### 18.8 Cohort minimum and confidence interval display [NEW]

No community outcome signal is displayed to any user unless the underlying cohort is at least 50 users. Below 50 users, the signal is suppressed and the user sees: *Insufficient community data to display an outcome for this product.* Above 50 users, the signal is displayed with a 95% confidence interval and the cohort size. For example: *62% of users with similar hair profiles reported reduced frizz (n=87, 95% CI: 51%–72%)*. The confidence interval is computed by a standard Wilson method; the computation is server-side and unit-tested.

- **Requirement**: The cohort-minimum threshold (n≥50) is configurable in a settings table and can be raised but not lowered without a governance review. The threshold of 50 is the minimum acceptable for any community signal; StrandCue may choose to be more conservative.
- **Risk**: Displaying community signals below the threshold creates false confidence in anecdotes. The threshold is the floor of statistical defensibility.

---

## 19. Medical Boundary & Safety Escalation

### 19.1 Medical boundary (preserved from v1.0 §26)

StrandCue provides cosmetic hair-care decision support. It is not a doctor, dermatologist, trichologist, medical device, or diagnostic service. Do not diagnose medical conditions. Future safety logic may identify concerning symptoms and recommend appropriate professional assessment. Examples include: sudden heavy shedding; bald patches; scalp wounds; severe inflammation; possible infection; severe allergic reaction; scarring; rapidly progressive thinning. Such escalation must not become diagnostic.

### 19.2 Escalation flow [NEW]

The escalation flow has three tiers. **Tier 1 is soft suggestion**: when a user records a cosmetic observation that overlaps with a medical concern keyword (e.g., 'shedding' or 'thinning'), the UI displays a non-blocking notice: *If this is concerning you, consider consulting a healthcare professional.* **Tier 2 is hard suggestion**: when a user records an observation that matches a medical red flag (e.g., 'bald patches' or 'sudden heavy shedding'), the UI displays a more prominent notice and offers a one-tap link to find a professional. **Tier 3 is hard block**: when a user records an observation that suggests an acute emergency (e.g., 'severe allergic reaction' or 'scarring'), the UI blocks further data entry and displays: *This sounds serious. Please seek immediate medical attention.* The block is on further cosmetic-data entry, not on closing the app.

- **Requirement**: The escalation rules table is data-driven (stored in a table) and versioned, mirroring the §18.3 rule authoring workflow. The medical advisory input to the rules must come from a licensed healthcare professional, not from internal team judgement.
- **Risk**: Hardcoded escalation logic becomes a maintenance burden and a liability if it is wrong. Data-driven rules with documented medical-advisory input are defensible.

### 19.3 Healthcare professional referral [NEW]

Phase 1 does not maintain a curated referral list of healthcare professionals. The escalation UI links to a generic find-a-dermatologist resource (e.g., the South African Dermatological Society public directory). A curated referral list with verified professionals is a Phase 3 or Phase 4 stretch goal; it requires its own compliance review (professional registration verification, liability, geographic coverage).

### 19.4 Allergy incident logging [NEW]

The architecture preserves an `allergy_incidents` table for future use. In Phase 1, the table exists with the schema (`incident_id`, `user_id`, `product_version_id`, `symptom`, `severity`, `occurred_at`, `reported_at`, `status`) but is not populated and is not exposed in the UI. In Phase 2 or Phase 3, the table is used to log user-reported allergic reactions and to support a future safety-kill-switch that flags products with elevated allergy incidence.

### 19.5 Adverse-event reporting [NEW]

If a user reports a severe adverse event (Tier 3 escalation), the report is logged with full PII scope (`user_id`, `product`, `symptom`, `severity`, `timestamp`) and is retained for seven years. StrandCue does not currently have a statutory obligation to report cosmetic adverse events to the South African Health Products Regulatory Authority (SAHPRA), but the retention period is set to satisfy any future reporting obligation. The Information Officer (see §21) reviews adverse-event reports quarterly.

---

## 20. Security Architecture & Threat Model

### 20.1 Security architecture (preserved from v1.0 §27)

Security is a Phase 1 core feature. Every exposed private user table requires Row Level Security. Authentication is not authorization. Ownership is determined through `user_id = auth.uid()`. User A must never be able to read, insert on behalf of, modify, or delete User B's private data. Test directly against database and API paths. Do not rely only on the UI hiding data. The UPDATE policy must protect both the row before update and the resulting ownership after update; prevent a user from changing `user_id` to transfer ownership. Do not use editable user metadata for authorization. The mobile client may contain only client-safe and publishable Supabase credentials. Never expose the service-role key, secret key, or privileged admin credentials. Do not put privileged credentials in React Native source, Expo public environment variables, GitHub, client bundles, or prompts. Server-side only operations include Auth account deletion, product verification, future safety kill switches, privileged moderation, and other admin-level operations. Do not use `SECURITY DEFINER` merely as a shortcut around RLS problems.

### 20.2 STRIDE threat model [NEW]

| Threat category | Material threat | Existing mitigation | Residual risk |
|---|---|---|---|
| Spoofing | Attacker acquires user credentials via credential stuffing | Rate limiting (§11.5); Supabase Auth password hashing | MFA not yet implemented (Phase 2 stretch) |
| Tampering | Attacker tampers with event log to rewrite history | Append-only event log (§13); no UPDATE permission on `event_log` | Low if RLS and immutability are tested |
| Repudiation | User denies an action; cannot prove they took it | Audit log captures actor, timestamp, before and after (§13.5) | Low |
| Information disclosure | RLS gap exposes User B data to User A | Cross-user RLS tests; postcheck RLS suite | Medium if RLS tests not run on every PR |
| Denial of service | Attacker floods auth endpoints | Rate limiting (§11.5); Supabase platform-level DDoS protection | Medium for application-layer flood; high for sophisticated volumetric |
| Elevation of privilege | Attacker extracts service-role key from client bundle | Server-side only privileged ops; no service key in client | Low if secrets scanning is enforced in CI |

### 20.3 Secrets management [NEW]

All secrets are stored in a secrets manager (Supabase Vault for database secrets, GitHub Actions secrets for CI/CD secrets, environment-based config for runtime). No secret is ever committed to the repository. A pre-commit hook scans for high-entropy strings (trufflehog or similar) and rejects commits that match known secret patterns (AWS keys, Supabase service-role keys, JWT secrets). Secret rotation policy: CI/CD secrets rotated quarterly; database secrets rotated annually; Supabase service-role key rotated only when compromised or when team membership changes. Each rotation is logged in the audit log.

### 20.4 Dependency security scanning [NEW]

`npm audit` runs on every pull request and fails the build on any high or critical severity finding. Snyk (or equivalent) runs weekly on the main branch and reports new vulnerabilities via Slack. Vulnerabilities are triaged within 48 hours of report; critical vulnerabilities are patched within 24 hours; high within 7 days; medium within 30 days; low accepted as background risk. Renovate bot opens pull requests for dependency updates; patch updates are auto-merged if CI passes; minor and major updates require human review.

### 20.5 Penetration test cadence [NEW]

An external penetration test is conducted before public beta, before public launch, and annually thereafter. The scope of each test is the public API surface, the mobile app, and the Supabase project configuration. The pentest report is retained for seven years. Findings are triaged by severity; critical and high findings block the launch until remediated; medium findings are remediated within 30 days; low findings are accepted with documented rationale.

### 20.6 Incident response plan [NEW]

The incident response plan has five phases: detection (alerting via Sentry, PagerDuty, or user report); containment (rotate affected credentials, block affected IPs, disable affected endpoints); eradication (identify root cause, patch, deploy); recovery (restore from backup if needed, verify integrity, resume service); postmortem (blameless review within 7 days, written report, action items tracked to closure). Severity classification: Sev1 is user-data exposure or full outage; Sev2 is partial outage or degraded core function; Sev3 is non-core function defect. Sev1 triggers PagerDuty escalation to the on-call engineer and the founder within 15 minutes.

---

## 21. Privacy, Consent & POPIA Compliance [NEW]

### 21.1 Privacy principles (preserved from v1.0 §29)

Do not claim: *StrandCue collects no personal information.* The preferred principle is: *StrandCue does not require your real name, ID number, phone number, date of birth or physical address. We use your email privately for account access, security and password recovery, and your chosen username identifies you inside StrandCue.* Treat as protected information: username; email; user UUID and account identifiers; Hair Passport; chemical history; goals; product ownership; tool ownership; outcome history. Marketing consent must be separate from account and security email.

### 21.2 POPIA compliance matrix

POPIA (Protection of Personal Information Act 4 of 2013) governs the processing of personal information in South Africa. The compliance matrix below maps each POPIA condition for lawful processing to StrandCue's implementation.

| POPIA condition | StrandCue implementation |
|---|---|
| Lawful processing | Processing is limited to the purposes documented in the privacy policy; no processing for undisclosed purposes |
| Purpose limitation | Each data category has a documented purpose in the purpose register (§21.3); processing outside that purpose is forbidden |
| Further processing limitation | If existing data is re-purposed (e.g., community outcome aggregation in Phase 3), separate consent is obtained |
| Information quality | Users can correct their data via the edit-versus-correct flow (§12.4); corrections are events, not overwrites |
| Openness / transparency | Privacy policy is accessible pre-registration; data subject rights are documented and accessible in Settings |
| Security safeguards | Technical: RLS, encryption in transit and at rest, secrets management (§20). Organisational: access control, training, incident response (§20.6) |
| Data subject participation | User can access (export, §15.7), correct (edit-versus-correct, §12.4), and delete (account deletion, §28) their data; can object to processing via Settings |
| Accountability | Information Officer is designated (§21.5); records of processing are maintained; audits are conducted annually |

### 21.3 Purpose register

Each data category StrandCue processes has a documented purpose in the purpose register. The register is reviewed quarterly by the Information Officer. Any new data category must be added to the register before processing begins.

| Data category | Purpose | Lawful basis | Retention |
|---|---|---|---|
| Email | Account access, security, password recovery | Contract (account relationship) | Duration of account + 30 days post-deletion |
| Username | In-app identity | Contract | Duration of account + 30 days |
| Hair Passport | Cosmetic decision support; future personalised recommendation | Consent (explicit at onboarding) | Duration of account; exportable at any time |
| Chemical history | Longitudinal cosmetic safety analysis | Consent | Duration of account; exportable |
| My Shelf | Personal product library; future shelf audit | Consent | Duration of account; exportable |
| My Tools | Personal tool library; future heat-event logging | Consent | Duration of account; exportable |
| Audit log | Regulatory compliance; incident investigation | Legal obligation (POPIA) | 7 years from event |
| Consent records | Proof of consent for each processing purpose | Legal obligation | Duration of consent + 7 years |
| Analytics events | Product improvement (anonymised) | Legitimate interest (balancing test documented) | 13 months |
| Crash reports | Stability improvement (PII-scrubbed) | Legitimate interest | 13 months |

### 21.4 Consent capture UX

Consent is captured at registration and is granular per purpose. The consent screen at registration presents three toggles, all defaulting to off: (1) Process my Hair Passport to provide personalised cosmetic decision support — required to use StrandCue, cannot be off; (2) Send me product updates and tips by email — optional, marketing; (3) Use anonymised outcomes from my data to improve community signals — optional, future Phase 3 functionality, captured now but not actioned until Phase 3. Each toggle has a one-sentence explanation and a link to the full privacy policy. Consent is recorded with: `user_id`, `purpose`, `version-of-consent-text`, `granted-at`, `withdrawn-at` (nullable).

### 21.5 Information Officer

POPIA requires designation of an Information Officer. The Information Officer for StrandCue is the founder (placeholder — to be formally designated in writing before public beta). The Information Officer's responsibilities are: maintaining the purpose register; handling data-subject requests within 30 days; quarterly review of the audit log; annual review of the POPIA compliance matrix; liaison with the Information Regulator in the event of a breach or complaint. Contact details for the Information Officer are published in the privacy policy and in Settings.

### 21.6 Data subject rights

StrandCue supports four data subject rights: access (export, §15.7), correction (edit-versus-correct, §12.4), deletion (account deletion, §28), and objection (withdraw consent via Settings, which triggers soft-deletion of the affected data within 30 days). Each right is accessible from Settings > Privacy. The Information Officer responds to data-subject requests within 30 days; complex requests may extend to 60 days with notice to the data subject.

### 21.7 Retention schedule

Retention periods are documented in the purpose register (§21.3). The general rule is: active account data is retained for the duration of the account; deleted account data is hard-deleted within 30 days of deletion, except for the audit log and consent records which are retained for 7 years to satisfy the legal obligation. Analytics and crash reports are retained for 13 months.

### 21.8 Cross-border transfer restriction

StrandCue does not transfer personal information outside South Africa without an adequacy decision from the Information Regulator. Supabase's data residency is configured for the closest available region; if no South African region is available, the data residency decision is documented in the records of processing and the Information Officer assesses whether the host country's data protection regime is materially similar to POPIA. If not, transfer is blocked until an adequacy decision or appropriate safeguards (standard contractual clauses) are in place.

---

## 22. Technical Stack & Engineering Governance

### 22.1 Approved stack (preserved from v1.0 §30)

The approved stack is React Native; Expo; TypeScript; Expo Router; Supabase PostgreSQL; Supabase Auth; and GitHub. Do not build separate iOS and Android codebases. Before implementing version-sensitive Expo or Supabase functionality, verify current official documentation. Do not rely on stale tutorials.

### 22.2 Repository governance (preserved from v1.0 §31)

The repository is named `strandcue`. The recommended root structure is: `app/`, `components/`, `features/` (with subdirectories `auth`, `hair-profile`, `chemical-history`, `products`, `tools`, `goals`, `settings`), `lib/` (with subdirectories `supabase`, `validation`), `types/`, `tests/`, `supabase/` (with subdirectories `migrations`, `tests`), `docs/` (with files `PHASE_1.md`, `PRODUCT_PRD.md`, `DATA_MODEL.md`, `SECURITY.md`), `CLAUDE.md`, `package.json`, and the lockfile. The exact structure may evolve, but rules and business logic must remain separated from UI.

### 22.3 AI coding governance (preserved from v1.0 §32)

Repository-level AI instructions belong in `CLAUDE.md`. The locked specification lives in repository documentation, e.g., `docs/PHASE_1.md` and `docs/PRODUCT_PRD.md`. Before an AI coding agent modifies architecture or schema it must: read the authoritative specification; inspect existing code; identify conflicts with established decisions; preserve current-versus-history semantics; preserve product and tool versioning; preserve RLS and security; consider migration impact; add or update tests. Repeated special-case logic for test personas is a signal that the data model may be wrong. Do not redesign major architecture only because another pattern is stylistically preferred. Prefer simple, explicit, testable code.

### 22.4 Database change governance (preserved from v1.0 §33)

All schema changes use migrations. Requirements are: preserve referential integrity; use foreign keys; use appropriate unique indexes; use constraints; preserve history; preserve version relationships; preserve RLS; test migrations. Never make undocumented production schema edits.

### 22.5 Dependency pinning policy [NEW]

All dependencies are pinned to exact versions in `package.json`. The lockfile is committed. Renovate bot is configured to open pull requests for dependency updates; patch updates auto-merge if CI passes; minor and major updates require human review and a clean CI run on the update branch. Security-critical dependencies (`supabase-js`, `expo`, `expo-router`, `react-native`) are reviewed by the Tech Lead before any minor or major update is merged. The review is logged in the PR.

### 22.6 Branching strategy [NEW]

The branching strategy is trunk-based with short-lived feature branches. The `main` branch is always deployable. Feature branches are created from `main` and merged back via pull request; the maximum lifetime of a feature branch is 72 hours before it must be rebased or merged. Pull requests require at least one approving review from a non-author; security-sensitive changes (RLS, auth, secrets, migrations) require two approving reviews. Force-push to `main` is forbidden. The `main` branch is protected in GitHub.

### 22.7 Code review checklist [NEW]

Every pull request is reviewed against a checklist that is stored in the repository as a pull request template. The checklist includes: (1) Does this change preserve current-versus-history semantics (§13)? (2) Does this change affect RLS policies — if yes, are RLS tests updated (§29)? (3) Does this change introduce any new secret — if yes, is it in the secrets manager, not in code? (4) Does this change affect the schema — if yes, is a migration added and tested? (5) Does this change introduce a new dependency — if yes, is the dependency reviewed for licence and security? (6) Does this change update documentation — if behaviour changes, docs must update. A pull request that does not satisfy the checklist is blocked from merge.

### 22.8 Migration review process [NEW]

Every database migration is reviewed by a second engineer acting as DBA-style reviewer. The review checks: referential integrity is preserved; existing data is not destroyed (history-preserving pattern is followed); RLS policies are added for any new user-owned table; indexes are appropriate; constraints are correct; the migration is reversible (a down migration exists or the migration is documented as irreversible with rationale); the migration is tested against a representative dataset. Migration review is logged in the PR; the reviewer signs off explicitly on each check.

### 22.9 Documentation freshness [NEW]

If a pull request changes user-observable behaviour, the PR must update the relevant documentation (`PRODUCT_PRD.md`, `PHASE_1.md`, `DATA_MODEL.md`, or `SECURITY.md`). A PR that changes behaviour without updating docs is blocked from merge. The `CLAUDE.md` file is the source of truth for AI coding agents and is updated whenever an architectural decision is made; the update is a separate commit in the same PR with the message format `docs(claude): <change summary>`.

---

## 23. Conceptual Data Model & Temporal Implementation

### 23.1 Conceptual model (preserved from v1.0 §34)

Final physical schema should be validated before implementation. Core areas are: Identity (`profiles`); Hair (`hair_profiles`, `hair_profile_history` or equivalent temporal model, `hair_concerns`, `user_hair_concerns`, `goals`, `user_goals`, `styling_habits`, `user_styling_habits`); Chemical history (`chemical_services`, `service_zones`, supporting lookup tables and enums); Products (`brands`, `products`, `product_versions`, `user_products`, `product_sources`, `verification_records`); Tools (`tool_brands`, `tools`, `tool_versions`, `user_tools`, `tool_sources`, `tool_verification_records`); Preferences (`user_preferences`, budget-related data); and Future-ready history (event and session structures planned without implementing recommendation logic prematurely). Avoid excessive table fragmentation where simpler constrained structures are sufficient.

### 23.2 Current-vs-history implementation (preserved from v1.0 §35)

Before finalising the physical schema, the team must explicitly choose and document how current state is represented. Permitted patterns include: append-only records with effective dates; current record plus history table; event model with derived current state. Whichever pattern is selected must preserve historical truth; make current state easy to query; distinguish correction from real-world change; support future temporal analysis; and avoid silent overwrites.

### 23.3 Pattern commitment [NEW]

v1.1 commits to the append-only event log with derived current-state materialised view pattern, as documented in §13.2. The commitment is recorded as an architectural decision record in the repository (`docs/adr/0001-temporal-pattern.md`) and cannot be changed without a new ADR superseding it. The pattern is implemented as: a single `event_log` table for all user-owned entities; a `current_state` materialised view per entity type; a Postgres trigger on `event_log` inserts that refreshes the affected entity in the relevant materialised view.

### 23.4 Per-table schema sketch [NEW]

| Table | Key columns | RLS policy | Temporal handling |
|---|---|---|---|
| `profiles` | `user_id` (PK), `username`, `country_code`, `adult_confirmed`, `budget_preference`, `created_at`, `updated_at` | `user_id = auth.uid()` | Direct UPDATE; changes logged in `audit_log` |
| `event_log` | `event_id` (PK), `user_id`, `entity_type`, `entity_id`, `event_type`, `corrects_event_id`, `payload` (jsonb), `actor`, `occurred_at` | `user_id = auth.uid()` (user events); server-only (system events) | Append-only; no UPDATE or DELETE |
| `current_hair_profiles` | `user_id` (PK), `pattern`, `strand_diameter`, `density`, `porosity`, `length`, `scalp_observations`, `derived_from_event_id` | `user_id = auth.uid()` | Materialised view; refreshed by trigger on `event_log` |
| `current_concerns` | `user_id`, `concern_code` (composite PK) | `user_id = auth.uid()` | Materialised view; current set derived from latest events |
| `current_goals` | `user_id`, `goal_code` (composite PK) | `user_id = auth.uid()` | Materialised view |
| `current_styling_habits` | `user_id`, `habit_code`, `frequency` (composite PK) | `user_id = auth.uid()` | Materialised view |
| `chemical_services` | `service_id` (PK), `user_id`, `service_type`, `service_date`, `zones` (jsonb array), `still_present_on_head`, `chemical_system_known`, `heat_exposure_known`, `notes`, `created_at` | `user_id = auth.uid()` | Append-only via `event_log`; current_state view exposes latest per `service_id` |
| `brands` | `brand_id` (PK), `name`, `normalised_name` (unique) | Public read; server-only write | Catalogue; not temporal |
| `products` | `product_id` (PK), `brand_id` (FK), `name`, `normalised_name`, `category` | Public read; server-only write | Catalogue; not temporal |
| `product_versions` | `version_id` (PK), `product_id` (FK), `version_label`, `barcode` (nullable), `active_state`, `reformulation_state` | Public read; server-only write | Catalogue; immutable once published |
| `user_products` | `user_product_id` (PK), `user_id`, `version_id` (FK nullable), `brand_text`, `product_name_text`, `category`, `verification_status`, `added_at`, `soft_deleted_at` | `user_id = auth.uid()` | Append-only via `event_log`; `soft_delete` is an event |
| `product_sources` | `source_id` (PK), `version_id` (FK), `source_url`, `archived_url`, `source_type`, `trust_tier`, `first_seen`, `last_checked` | Public read; server-only write | Catalogue; mutable (`last_checked` updates) |
| `verification_records` | `verification_id` (PK), `version_id` (FK), `status`, `verified_by`, `verified_at`, `notes` | Public read; server-only write | Catalogue; immutable per verification event |
| `tool_brands` | `tool_brand_id` (PK), `name` | Public read; server-only write | Catalogue |
| `tools` | `tool_id` (PK), `tool_brand_id` (FK), `model`, `type` | Public read; server-only write | Catalogue |
| `tool_versions` | `tool_version_id` (PK), `tool_id` (FK), `market`, `wattage_watts` (nullable), `temperature_max_celsius` (nullable), `adjustable_temp`, `direct_contact_heat` | Public read; server-only write | Catalogue; immutable once published |
| `user_tools` | `user_tool_id` (PK), `user_id`, `tool_version_id` (FK nullable), `brand_text`, `model_text`, `type`, `photo_url` (nullable), `added_at`, `soft_deleted_at` | `user_id = auth.uid()` | Append-only via `event_log` |
| `user_preferences` | `user_id` (PK), `budget_preference`, `max_budget_zar` (nullable), `mfa_enabled`, `mfa_method`, `marketing_consent`, `community_consent` | `user_id = auth.uid()` | Direct UPDATE; changes logged in `audit_log` |
| `consent_records` | `consent_id` (PK), `user_id`, `purpose`, `consent_text_version`, `granted_at`, `withdrawn_at` (nullable) | `user_id = auth.uid()` | Append-only; withdrawal is a new event |
| `audit_log` | `audit_id` (PK), `operation`, `actor`, `target_user_id`, `target_table`, `target_row_id`, `before_state` (jsonb), `after_state` (jsonb), `occurred_at`, `reason` | Server-only write; admin read for Information Officer | Append-only; no UPDATE or DELETE |
| `allergy_incidents` | `incident_id` (PK), `user_id`, `version_id` (FK), `symptom`, `severity`, `occurred_at`, `reported_at`, `status` | `user_id = auth.uid()`; admin read for review | Reserved for Phase 2; schema only in Phase 1 |
| `rules` | `rule_id` (PK), `semantic_version`, `rule_type`, `payload` (jsonb), `evidence_source_ids` (jsonb array), `status` (draft, peer_review, active, deprecated), `published_at`, `deprecated_at` | Public read; server-only write | Append-only; new version on change |
| `conflict_rules` | `rule_id` (PK), `service_type_a`, `service_type_b`, `window_days`, `warning_text` | Public read; server-only write | Versioned; updates create new `rule_id` |

The sketch includes three Phase 2+ tables (`allergy_incidents`, `rules`, `conflict_rules`) that are created in Phase 1 for architecture readiness but are not populated or used. This avoids a schema migration when Phase 2 begins.

### 23.5 Indices and query patterns [NEW]

Indices are designed for the dominant query patterns. The `event_log` table has indices on `(user_id, entity_type, occurred_at)` for temporal queries and on `(entity_id, occurred_at)` for entity-history queries. The `current_state` materialised views have primary-key indices on `user_id` (and composite keys where applicable). The `user_products` table has an index on `(user_id, soft_deleted_at)` for the active-shelf query. The `audit_log` has an index on `(target_user_id, occurred_at)` for data-subject-access requests and on `(operation, occurred_at)` for regulatory queries. The `conflict_rules` table has an index on `(service_type_a, service_type_b)` for the soft-conflict lookup.

---

## 24. Phase 1 Core Screens & Onboarding Journey [NEW]

### 24.1 Screen list (preserved from v1.0 §36)

Phase 1 screens are: Welcome (branding, Create Account, Sign In); Registration (18+ gate, username, email, password, email confirmation state); Sign In (email, password, Forgot Password); Password Recovery (request reset, deep-link callback, create new password); Hair Passport (structured data collection); Chemical History (add, view, edit, correct historical services); Goals and Preferences (including budget preference); My Shelf (add, view, edit products owned); My Tools (add, view, edit styling tools); History (show meaningful previous records); and Settings (username, private account and security settings, future email change, change password, delete account). No recommendation output is required in Phase 1.

### 24.2 Onboarding journey

The onboarding journey is the path from first app open to the first valuable moment. The first valuable moment for StrandCue is the completion of the Hair Passport. Activation is defined as: user has saved at least one product or one chemical service (or has explicitly marked no chemical history) plus Hair Passport complete. The journey is designed to minimise drop-off by breaking the Hair Passport into small, individually-saveable steps.

Journey diagram:

```
Welcome → Adult gate → Register (username, email, password) → Email confirm (if enabled)
→ Hair Passport step 1 (pattern) → Hair Passport step 2 (strand + density)
→ Hair Passport step 3 (porosity) → Hair Passport step 4 (concerns)
→ Hair Passport step 5 (goals + styling habits) → Chemical history (optional, can mark none)
→ My Shelf (optional, can skip) → My Tools (optional, can skip) → Home dashboard (first valuable moment reached)
```

### 24.3 Per-screen specification

| Screen | Primary CTA | Empty state | Error state | Success state |
|---|---|---|---|---|
| Welcome | Create Account | First-time visitor greeting | N/A (no inputs) | Route to Register |
| Adult gate | Yes, I'm 18+ | Plain question | If No: polite refusal, no further flow | Route to Register |
| Register | Create Account | Form: username, email, password | Inline validation; rate-limit if triggered | Route to Email confirm or Hair Passport step 1 |
| Email confirm | Resend email | Waiting state with countdown | Invalid or expired link message | Route to Hair Passport step 1 |
| Hair Passport step 1 | Continue | Empty pattern selector | No selection: Continue disabled | Route to step 2 |
| Hair Passport step 2 | Continue | Empty strand and density selectors | No selection: Continue disabled | Route to step 3 |
| Hair Passport step 3 | Continue | Empty porosity selector | No selection: Continue disabled | Route to step 4 |
| Hair Passport step 4 | Continue | Empty concerns multi-select | No selection: Continue enabled (concerns are optional) | Route to step 5 |
| Hair Passport step 5 | Continue | Empty goals and habits selectors | No selection: Continue disabled | Route to Chemical history |
| Chemical history | Add service or 'None' | Empty list with 'Add' CTA | Add form errors inline | Route to My Shelf or Home |
| My Shelf | Add product or 'Skip' | Empty list with 'Add' CTA | Add form errors inline | Route to My Tools or Home |
| My Tools | Add tool or 'Skip' | Empty list with 'Add' CTA | Add form errors inline | Route to Home |
| Home dashboard | View Hair Passport | Empty state with 'Complete your Hair Passport' CTA if incomplete | Error fetching data: retry CTA | User lands on Home; activation tracking fires |

### 24.4 Save-resume behaviour

The user can exit the onboarding journey at any point and resume later. Partial state is persisted locally on the device (Expo FileSystem, encrypted) and synced to the server when the user reaches the end of the Hair Passport flow or pauses for more than 30 seconds. On app relaunch, the journey resumes at the last incomplete step. A 'Start over' option in the upper-right corner of the screen allows the user to reset the local state; this does not affect already-synced server state.

### 24.5 Activation tracking

Activation is the first valuable moment and is tracked as an analytics event (see §27). The activation event fires when the user has saved at least one product or one chemical service (or has explicitly marked no chemical history) plus the Hair Passport is complete. The activation rate is the primary Phase 1 success metric (see §32) with a target of 60% within 7 days of registration.

---

## 25. UX, Content & Accessibility Guidelines [NEW]

### 25.1 Accessibility and UX requirements (preserved from v1.0 §39)

Phase 1 must be understandable to ordinary consumers. Requirements: plain language; explain unfamiliar terms; 'Not sure' or 'Unknown' where appropriate; no forced guesses; clear difference between current information and previous history; clear private email explanation; reasonable touch targets; accessible labels; readable text sizing; and error messages that explain what the user can do next. The product should not require technical hair knowledge to create a profile.

### 25.2 WCAG 2.2 AA compliance

The accessibility target is WCAG 2.2 AA compliance. The compliance is verified by an external audit before public beta and before public launch. The audit covers: perceivable (text alternatives, captions, contrast, resizable text); operable (keyboard navigation, no time limits, navigation mechanisms, no seizure-inducing content); understandable (readable, predictable, input assistance); and robust (compatible with assistive technologies). React Native accessibility properties (`accessibilityLabel`, `accessibilityRole`, `accessibilityHint`, `accessibilityState`) are set on every interactive element. axe-core runs in CI on every pull request against the rendered UI; findings fail the build.

### 25.3 Design system specification

The design system uses a token-based approach. The component library is React Native Paper or Tamagui (selection confirmed at Phase 1 kick-off based on bundle-size and theming evaluation). Theme tokens are defined for colour, spacing, typography, and elevation. Dark mode is prepared architecturally (tokens defined) but not implemented in Phase 1 UI; it is a Phase 2 stretch goal. Component variants are defined for the standard states: default, hover (where applicable on web), pressed, disabled, focused, error, loading. Every component has a Storybook story demonstrating each state.

### 25.4 Tone of voice

The tone of voice is plain English, second-person ('you'), and condescension-free. Unfamiliar terms are explained on first use with a tooltip or inline definition. Marketing language is forbidden in the UI ('amazing results', 'miracle repair', 'scientifically proven'). When the system does not know something, it says so plainly: 'We don't have enough information to make this recommendation.' When the system surfaces a conflict, it surfaces it plainly: 'Two sources disagree about this product's silicone content; see both below.'

### 25.5 Microcopy library

A microcopy library of 20+ standard strings is maintained in the repository (`lib/i18n/en/common.json`). Examples include: Save, Cancel, Continue, Back, 'Are you sure?', 'This action cannot be undone', 'Saving...', 'Saved', 'Something went wrong. Please try again.', 'You're offline. Changes will sync when you reconnect.', 'We couldn't find any results.', 'This field is required.', 'That username is taken. Try another.', 'That email doesn't look right.', 'Password must be at least 8 characters.', 'Check your email for a reset link.', 'Your session has expired. Please sign in again.', 'We've saved your progress.', 'Add a product', 'Add a chemical service'. The library is the single source of truth; no string is hardcoded in components.

### 25.6 Localisation readiness

Internationalisation is a Phase 1 architectural commitment but is not implemented in the UI. The i18n library is i18next (or equivalent). Locale files are organised as `lib/i18n/<locale>/<feature>.json`. Translation workflow is a Phase 4 concern (when multilingual UI is implemented); Phase 1 ensures that all user-facing strings flow through i18next so no string extraction is needed later. The locale is set from device locale on first launch and can be overridden in Settings.

### 25.7 Loading, empty, and error states

Every primary screen has explicit loading, empty, and error states. Loading states show a skeleton or spinner, never a blank screen. Empty states show a friendly explanation and a primary CTA (e.g., 'Your shelf is empty. Add your first product.'). Error states explain what went wrong and what the user can do next (e.g., 'We couldn't load your Hair Passport. Check your connection and try again.'). Each state is implemented as a component variant and has a Storybook story. Error states never expose technical details to the user (no stack traces, no SQL errors); technical details are logged to Sentry.

<!-- CHUNK4_END -->

---

## 26. Non-Functional Requirements [NEW]

### 26.1 Performance

| Metric | Target | Measurement method | Breach response |
|---|---|---|---|
| Cold start | ≤3s | Appium automated test on mid-tier Android, run nightly | Bundle-size investigation |
| Screen navigation | ≤300ms | React Native Performance Monitor sampled in production | Re-render investigation |
| DB query p95 | ≤200ms | Supabase query logs + p95 aggregation | Index and query-plan investigation |
| Sync resolution | ≤2s | Client-side instrumentation, event sent on sync completion | Offline-queue investigation |
| API error rate | ≤0.5% | Sentry + Supabase function logs | Investigation; if persistent, page on-call |

### 26.2 Reliability

Uptime target is 99.5% in beta and 99.9% in general availability. Uptime is measured by an external monitor (UptimeRobot or equivalent) that polls the public health endpoint every minute. Downtime is acknowledged within 5 minutes and communicated to users via in-app banner and status page. Error rate (HTTP 5xx) must be 0.5% or less of all requests. Crash-free sessions (no native crash) must be 99.5% or higher. Crash-free users (no native crash in any session in a 7-day window) must be 95% or higher.

### 26.3 Scalability

The system must scale from 1 user (founder testing) to 10,000 users (general availability) without architectural change. The schema must scale to 100,000 users without re-architecture; the only changes permitted at that scale are operational (read replicas, connection pooling, storage tiering). The Phase 1 design point is 1,000 users (beta cohort). At each scaling threshold (1k, 10k, 100k), a load test is run before the threshold is crossed to confirm the architecture holds.

### 26.4 Offline support

Offline support is read-only for cached data and queue-only for writes. When the device is offline: the user can view their cached Hair Passport, My Shelf, My Tools, and chemical history; writes are queued in a local persistent store (WatermelonDB or equivalent); when the device reconnects, the queue is drained to the server with retry and exponential backoff. Conflict resolution is last-write-wins with an audit flag (see §13) — if two writes conflict, the later one wins, but both are retained in the event log and the conflict is flagged for review. Offline support does not extend to authentication: the user must be authenticated online to access cached data; the auth token is cached in secure storage but expires per §11.4.

### 26.5 Security NFRs

Security NFRs are addressed in §20. The non-negotiable targets are: RLS test pass rate 100% on every PR; secrets scan zero findings on every PR; dependency scan zero critical findings; pentest zero critical findings before launch; incident response Sev1 acknowledgement within 15 minutes.

### 26.6 Compliance NFRs

Compliance NFRs are addressed in §21. The non-negotiable targets are: POPIA compliance matrix sign-off before public beta; written legal opinion before public beta; data-subject-request response within 30 days; consent withdrawal processed within 30 days.

### 26.7 Observability NFRs

Observability NFRs are addressed in §27. The non-negotiable targets are: Sentry operational before public beta; analytics operational before public beta; alert routing operational before public beta; dashboard available to all engineers with weekly metrics review.

### 26.8 Backup and disaster recovery NFRs

Backup and DR NFRs are addressed in §28. The non-negotiable targets are: RPO ≤1 hour; RTO ≤4 hours; quarterly restore drill passed; annual DR review passed.

---

## 27. Data Validation, Analytics & Observability [NEW]

### 27.1 Data validation (preserved from v1.0 §37)

Validation must exist at both the application level and the database level where practical. Examples include: unique username; valid ownership; allowed enum and state values; non-negative budget; valid date semantics; version relationships; verification-state integrity; and foreign-key integrity. Do not rely on client validation alone.

### 27.2 Analytics (preserved from v1.0 §38)

Phase 1 analytics should be minimal and privacy-conscious. Possible internal events include: registration completed; Hair Passport completed; chemical history added; product added; tool added; password recovery initiated and completed. Do not include private email or unnecessary sensitive Hair Passport contents in analytics payloads. No marketing consent should be inferred from analytics participation.

### 27.3 Analytics tool selection [NEW]

The analytics tool is PostHog self-hosted. Self-hosting is chosen over PostHog Cloud to keep analytics data within the StrandCue-controlled environment and to satisfy POPIA cross-border transfer restrictions (§21.8). PostHog is deployed to the same cloud provider as Supabase (or to a provider with documented POPIA adequacy). The PostHog instance is configured to capture no PII by default; PII fields are explicitly scrubbed in the event ingestion pipeline before storage.

### 27.4 Event taxonomy [NEW]

Every analytics event has a documented taxonomy: event name, properties (name, type, PII flag per property), trigger, and downstream dashboard usage. The taxonomy is stored in the repository (`docs/analytics/events.md`) and is the single source of truth. Events without a documented taxonomy are rejected in code review.

| Event name | Properties | Trigger | Used in |
|---|---|---|---|
| `user_registered` | `user_id_hashed`, `country_code`, `source` | Supabase auth signup success | Activation funnel |
| `hair_passport_step_completed` | `user_id_hashed`, `step_number`, `time_on_step_ms` | Step Continue tapped | Onboarding funnel |
| `hair_passport_completed` | `user_id_hashed`, `total_time_ms`, `steps_completed` | Final step Continue tapped | Activation rate |
| `chemical_service_added` | `user_id_hashed`, `service_type`, `zones_count` | Save on chemical service form | Engagement |
| `product_added` | `user_id_hashed`, `category`, `verification_status` | Save on product form | Engagement |
| `tool_added` | `user_id_hashed`, `tool_type` | Save on tool form | Engagement |
| `password_recovery_initiated` | `email_hashed` | Forgot Password tapped | Auth funnel |
| `password_recovery_completed` | `user_id_hashed`, `time_since_initiated_ms` | New password set | Auth funnel |
| `session_start` | `user_id_hashed`, `days_since_last_session` | App foregrounded with valid token | Retention |
| `error_displayed` | `user_id_hashed`, `error_code`, `screen` | Error state rendered | Quality |

### 27.5 PII never in analytics [NEW]

No analytics event property contains PII. User identifiers are hashed before sending to analytics (a per-user salted hash). Email addresses are never sent to analytics. Hair Passport field values (e.g., a specific concern) are not sent to analytics; only the count of fields completed is sent. The list of PII-excluded fields is reviewed quarterly by the Information Officer.

### 27.6 Crash reporting [NEW]

Crash reporting uses Sentry self-hosted (same cloud provider as PostHog for the same POPIA reason). PII scrubbing rules are configured before the SDK is initialised in the app: email, username, and free-text fields are scrubbed from breadcrumbs and attachments. Crash reports are retained for 13 months. Crash rate is monitored; a spike (more than 2x baseline in any 1-hour window) triggers an alert to the on-call engineer.

### 27.7 Application logs [NEW]

Application logs are structured JSON with the fields: `timestamp`, `level` (`debug`, `info`, `warn`, `error`), `message`, `user_id_hashed` (if available in context), `request_id`, `correlation_id`. Logs are retained for 30 days in beta and 90 days in general availability. Logs are not used for business analytics (use PostHog for that); logs are for engineering investigation only. Log level is configurable per environment (debug in dev, info in staging, warn in production).

### 27.8 Business metrics dashboard [NEW]

A business metrics dashboard is built on top of PostHog and Supabase and is available to all engineers and the founder. The dashboard shows: daily registration count, daily activation count, activation rate (rolling 7-day), Hair Passport completion funnel, retention curves D1/D7/D30, My Shelf items added per active user, chemical services added per active user, password recovery funnel, error rate by endpoint, crash-free sessions and users. The dashboard is reviewed in a weekly metrics stand-up.

### 27.9 Alerting [NEW]

Alert routing is: Sev1 (user-data exposure, full outage, security incident) via PagerDuty to the on-call engineer and the founder within 15 minutes; Sev2 (partial outage, degraded core function) via Slack to the engineering channel within 1 hour; Sev3 (non-core function defect) via a daily summary email at 09:00 SAST. Each alert has documented runbook entries in the repository (`docs/runbooks/`) with the triage steps, escalation contacts, and post-resolution checklist.

---

## 28. Backup, Disaster Recovery & Account Lifecycle

### 28.1 Account deletion (preserved from v1.0 §28)

Provide a 'Delete my StrandCue account' control. Deletion eventually requires: (1) removal or handling of application data according to retention policy; (2) deletion of the Supabase Auth account. Privileged Auth deletion must be performed server-side. Never place the service-role key in the app. The deletion flow must be designed so partially deleted accounts are not left in an unsafe or inconsistent state.

### 28.2 Backup strategy [NEW]

Supabase automated backups are configured as: daily full backup at 02:00 SAST; hourly incremental backup via WAL archiving; 7-day retention of point-in-time recovery. The daily backup is verified by an automated restore to a staging project nightly; if the restore fails, an alert is raised. The backup integrity is the foundation of the §26.8 RPO target. If the backup integrity fails, the RPO target is breached and the incident is escalated as Sev2.

### 28.3 Disaster recovery targets

Recovery point objective (RPO) is 1 hour or less — the maximum data loss acceptable in a disaster is 1 hour of writes. This is enabled by the hourly incremental backups. Recovery time objective (RTO) is 4 hours or less — the maximum time acceptable from disaster declaration to full service restoration. RTO is enabled by the automated restore pipeline (Supabase project restore plus application redeploy). Both targets are tested quarterly by a restore drill.

- **Requirement**: A restore drill is conducted at the end of each quarter. The drill: (1) restores the latest daily backup to a fresh Supabase project; (2) runs the full automated test suite against the restored project; (3) verifies a sample of user data is intact; (4) measures the time from restore start to verification pass and compares to RTO. The drill result is logged in the audit log.
- **Risk**: Untested backups are not backups. The quarterly drill is the only evidence that the backup system works.

### 28.4 Account deletion flow [NEW]

The account deletion flow has three stages. **Stage 1 is user-initiated soft-delete**: the user taps 'Delete my account' in Settings, confirms with their password, and a soft-delete event is created in the event log. The user sees a 'Recover your account' option for 30 days in case of regret. **Stage 2 is the 30-day timer expiry**: a nightly job transitions soft-delete to hard-delete. The job deletes the user's rows from `current_state` materialised views, the `event_log` (with the exception of `audit_log` entries which are retained 7 years per §21.7), `user_products`, `user_tools`, `consent_records` (retained 7 years per §21.7), and `user_preferences`. **Stage 3 is the Supabase Auth deletion**: a server-side function deletes the `auth.users` row. This is the privileged operation that must not be exposed to the client. After Auth deletion, the user can no longer sign in with that email.

### 28.5 Partial deletion safety

A partially deleted account is the worst state — the user has been told their data is gone but some rows remain. The deletion flow is designed as a saga: each step (soft-delete event, hard-delete application rows, hard-delete auth row) is idempotent and can be safely retried. If any step fails, the saga is paused and an alert is raised; the engineer resolves the failure manually and resumes the saga. The user sees a single status ('Your account is being deleted') until the saga completes; the user does not see intermediate failure states.

- **Requirement**: The deletion saga logs every step to the audit log. If a step is retried, each retry is logged. The audit log is the source of truth for deletion progress; the user-facing status is derived from the audit log.

### 28.6 Data export before deletion [NEW]

Before the user initiates account deletion, the UI strongly recommends that the user export their data first. The export is generated server-side and delivered as a signed download link valid for 7 days. The export is a ZIP archive containing: a JSON file with the full Hair Passport, chemical history, My Shelf, My Tools, goals, preferences, and consent records; a CSV file with the My Shelf data; and a README explaining the structure of the JSON. The export is generated by the same Edge Function that powers the §15.7 export feature.

---

## 29. Test Strategy, CI/CD & Test Personas [NEW]

### 29.1 Test personas (preserved from v1.0 §40)

At minimum test: (1) straight, fine, untreated hair; (2) wavy bleached hair; (3) curly highlighted hair with previous keratin; (4) coarse coily relaxed hair; (5) grey untreated hair; (6) unknown porosity; (7) unknown product; (8) unknown tool temperature; (9) mixed chemical zones; (10) keratin followed by Nanoplasty; (11) wig and extensions scenario where relevant to cosmetic history; (12) very restricted budget; (13) premium preference; (14) username change; and (15) email and password change without loss of history. No persona should require unsafe hard-coded exceptions.

### 29.2 Authentication tests (preserved from v1.0 §41)

**Registration tests**: successful account creation; duplicate email; duplicate username; invalid email; weak password handling; adult-gate rejection.

**Sign-in tests**: correct credentials; incorrect password; unknown credentials; session persistence.

**Password recovery tests**: request reset; recovery email; mobile deep link; new password creation; login with new password; old password fails; history remains linked to same `user_id`.

**Username tests**: username change; UUID unchanged; history unchanged.

### 29.3 Security tests (preserved from v1.0 §42)

The most important security test is: User A cannot access User B's data even by calling the database or API directly. Test for every private user-owned table: SELECT, INSERT, UPDATE, DELETE. Specifically test: attempt to query another `user_id`; attempt to insert row with another `user_id`; attempt to change owned row's `user_id`; attempt to delete another user's row; unauthenticated access; expired or invalid session access. Also verify: email is not exposed through normal public profile APIs; no privileged credentials exist in app bundle or source; no password fields exist in application tables.

### 29.4 Product and versioning tests (preserved from v1.0 §43)

Test: unknown product can be added; user product can exist without verified global product match; product version can be created; reformulation creates new version; historical user link remains attached to old version; retired version remains queryable historically; verification status changes do not destroy source provenance.

### 29.5 History tests (preserved from v1.0 §44)

Test: genuine concern change creates history; genuine styling-habit change creates history; new chemical service creates history; correction of mistaken entry is distinguishable from new real-world event; current state query returns correct latest state; past state remains retrievable.

### 29.6 Test pyramid [NEW]

The test pyramid is: 70% unit tests, 20% integration tests, 10% end-to-end tests. Unit tests cover pure functions in `lib/` and feature logic that does not depend on Supabase (validation, formatting, derivation, schema helpers). Integration tests cover Supabase Edge Functions, RLS policies, and the `event_log`-to-`current_state` derivation. End-to-end tests cover the user journeys in §24.2 using Maestro (preferred for React Native over Detox due to stability and speed).

### 29.7 Coverage targets [NEW]

Coverage targets are: 80% line coverage on `lib/` and `features/`; 70% branch coverage on the same directories; 100% coverage on the security-critical functions (RLS policy verification, `event_log` immutability, audit log write). Coverage is measured by Jest with the coverage reporter. Coverage is reported in the CI run and a drop of more than 5 percentage points triggers a CI warning; a drop below the target fails the build.

### 29.8 CI pipeline [NEW]

The CI pipeline (GitHub Actions) runs on every pull request and on every commit to `main`. The stages are: lint (ESLint + Prettier), typecheck (`tsc --noEmit`), unit tests (Jest), integration tests (Jest with a ephemeral Supabase project spun up per run), build (Expo EAS build for Android and iOS), and E2E (Maestro on the build artifact). The full pipeline must complete in under 15 minutes on a typical PR. A failing stage blocks merge; the failing stage is shown in the PR check status.

### 29.9 Test persona harness [NEW]

A programmatic test persona harness is built in `tests/fixtures/`. The harness exposes a builder API: `createPersona(spec)` returns a fully-populated user object with `hair_profile`, `chemical_services`, `user_products`, `user_tools`, and `user_preferences`. The 15 v1.0 test personas plus the 4 v1.1 personas (§10.3) are all implemented as fixtures. New tests use the harness; no test creates a persona inline. The harness is the single source of truth for test data; if the schema changes, the harness is updated once and all tests inherit the change.

### 29.10 Security test automation [NEW]

RLS tests run on every PR against an ephemeral Supabase project spun up per run. The test suite is generated from a script that introspects the database for tables with RLS enabled and writes a test per table per operation (SELECT, INSERT, UPDATE, DELETE) per access pattern (authenticated-as-self, authenticated-as-other, unauthenticated). The script ensures that no new RLS-enabled table is added without test coverage.

### 29.11 Mutation testing

Mutation testing is run quarterly using Stryker on `lib/`. Mutation testing measures test quality by introducing small mutations (e.g., changing `>` to `>=`, removing a function call) and checking whether the tests catch the mutation. A mutation score below 70% triggers a test-quality investigation. Mutation testing is not run on every PR due to runtime; it is a quarterly health check.

### 29.12 Performance regression testing

Performance regression tests run on the E2E build artifact for critical paths: app cold-start, Hair Passport load, My Shelf load, chemical history load. Each test measures the time for the operation and compares to a baseline; a regression of more than 20% triggers a CI warning. The baseline is updated only after a human review confirms the regression is acceptable (e.g., a deliberate feature addition that increases work).

### 29.13 Accessibility automation

axe-core runs in CI on every PR against the rendered UI of every primary screen. Findings fail the build. The axe-core ruleset is configured to WCAG 2.2 AA. Manual accessibility audits are conducted by an external auditor before public beta and before public launch; the manual audit covers screen-reader testing on iOS VoiceOver and Android TalkBack, keyboard navigation on web (if applicable), and contrast verification.

---

## 30. Phase 1 Acceptance Criteria & Public Beta Blockers

### 30.1 Phase 1 acceptance criteria (preserved from v1.0 §45)

Phase 1 is complete only when:

**Account**: adult gate works; user can register; no real name is requested; username is created; email remains private; password works; sign-in works; session persistence works; password recovery works end-to-end through mobile deep link; username can change without changing UUID; history remains intact after credential changes.

**Hair data**: Hair Passport supports all required Phase 1 characteristics; Unknown is supported where appropriate; concerns, goals, and preferences can be stored; current vs historical truth is preserved.

**Chemical history**: required services are supported; Nanoplasty is explicit; mixed zones are supported; unknown chemistry and heat values are accepted.

**Products**: any owned product can be added; unknown product is valid; product and version architecture exists; verification status exists; provenance can be stored; reformulations do not overwrite history.

**Tools**: tools can be added; unknown temperature is valid; version architecture exists; future heat-event model is not blocked.

**Security**: RLS exists on all private tables; User A cannot access User B; UPDATE ownership cannot be transferred; secrets are absent from client; privileged operations are server-side.

**Engineering**: migrations are used; dependencies are pinned; lockfile committed; core tests pass; repository documentation is current; no Phase 2 behaviour has leaked into Phase 1.

### 30.2 v1.1 acceptance extensions [NEW]

v1.1 extends the acceptance criteria to include the new dimensions. Acceptance now requires: NFR targets in §26 are met and continuously measured; observability stack in §27 is operational before beta; backup and DR drills in §28 have been completed at least once; POPIA compliance matrix in §21 has been signed off by the Information Officer; accessibility audit in §25 has been completed and zero critical findings remain; risk register in §33 has been reviewed and no Sev-1 risk is open; CI pipeline in §29 is operational and all stages pass on the main branch; test coverage targets in §29 are met.

### 30.3 Public beta blockers (preserved from v1.0 §46)

Before public beta: production SMTP; tested email confirmation and recovery delivery; tested mobile deep linking; account deletion flow; privacy wording; retention and deletion policy; security review; RLS test suite; production environment and secrets review; crash and error monitoring; and minimum accessibility review.

### 30.4 v1.1 public beta blockers (extended)

v1.1 extends the public beta blockers with the following: written POPIA legal opinion (§21); accessibility audit pass (§25); security review pass including pentest report (§20); observability stack operational (§27); backup restore drill completed at least once (§28); risk register reviewed with no open Sev-1 risks (§33); KPI dashboard available and reviewed in a weekly metrics stand-up (§32).

### 30.5 Soft launch criteria (new tier) [NEW]

v1.1 introduces a tier below public beta: the soft launch. Soft launch criteria are: Phase 1 acceptance criteria met; CI pipeline green; no Sev-1 or Sev-2 defects open; observability stack operational; backup restore drill completed. Soft launch limits the user base to 50 invited users. Soft launch is the gate between internal prototype (Layer 1 and Layer 2 in §9.5) and public beta. Soft launch runs for 2–4 weeks; at the end of the period, the team reviews KPIs and decides whether to open public beta or to iterate.

---

## 31. Phase 1 Development Sequence & Milestones

### 31.1 Development sequence (preserved from v1.0 §47)

Recommended order: (1) Create private GitHub repository; (2) Add `CLAUDE.md`; (3) Add authoritative docs; (4) Create Expo TypeScript app; (5) Pin dependencies and commit lockfile; (6) Create Supabase development project; (7) Configure email and password Auth; (8) Configure mobile deep linking; (9) Create profile and account model; (10) Build adult gate; (11) Build registration; (12) Build sign in; (13) Build password recovery; (14) Create initial database migrations; (15) Implement RLS; (16) Write cross-user security tests; (17) Implement Hair Passport; (18) Implement current-versus-history pattern; (19) Implement chemical and service history and zones; (20) Implement goals and preferences; (21) Implement brands, products, product_versions, user_products; (22) Implement product provenance and verification state; (23) Implement tools architecture; (24) Implement history views; (25) Implement Settings and security screens; (26) Run persona tests; (27) Run direct API and RLS security tests; (28) Freeze Phase 1 schema for internal prototype; (29) Internal User #1 testing; (30) Resolve issues before Phase 2 design.

### 31.2 Milestone grouping [NEW]

v1.1 groups the 30 development steps into 6 milestones with indicative durations. The milestones are sequential; each milestone's exit criteria must be met before the next milestone begins. The durations are planning placeholders pending team confirmation.

| Milestone | Indicative weeks | Steps covered | Exit criteria |
|---|---|---|---|
| M1 — Repo & Auth scaffolding | Week 1–2 | Steps 1–13 | Repo live; auth flows working end-to-end on dev environment; deep link tested |
| M2 — Profile & Hair Passport | Week 3–4 | Steps 9, 17, 18 | Profile model live; Hair Passport save-resume working; current-vs-history proven |
| M3 — Chemical history & zones | Week 5–6 | Step 19 | All chemical service types supported; mixed zones work; Nanoplasty explicit |
| M4 — My Shelf & product architecture | Week 7–8 | Steps 20–22 | Brand→product→version→user_product hierarchy live; unknown products supported; provenance stored |
| M5 — Tools, history views, Settings | Week 9–10 | Steps 23–25 | Tools architecture live; history view renders past state correctly; Settings has all security controls |
| M6 — Tests & freeze | Week 11–12 | Steps 26–28 | Persona tests pass; RLS tests pass; schema frozen for internal prototype |

### 31.3 Internal User testing and issue resolution

Internal User #1 testing (Layer 1 in §9.5) is conducted at the end of M6. The test is whether StrandCue can accurately and historically represent the founder's hair without losing information, guessing missing facts, or creating one-off schema exceptions. Issues discovered in Internal User #1 testing are logged in the issue tracker with severity (Sev1–Sev3) and are resolved before Phase 2 design begins. The exit gate from Phase 1 is the closure of all Sev1 issues and the demonstration that all 15 v1.0 test personas plus 4 v1.1 personas (§10.3) can be entered without special-case schema changes.

---

## 32. Success Metrics & KPIs [NEW]

### 32.1 Activation metrics

Activation is the first valuable moment and the primary Phase 1 success metric. The activation metric is the percentage of registered users who reach activation (Hair Passport complete + at least one product or one chemical service or explicit 'none') within 7 days of registration. The target is 60%. The leading indicator is Hair Passport step-completion rate (the funnel of step 1 → step 5); the lagging indicator is the 7-day activation rate. Activation is measured by PostHog events (`hair_passport_completed`, `product_added` or `chemical_service_added`).

| Metric | Target | Leading or lagging | Measurement |
|---|---|---|---|
| Activation rate (7-day) | 60% | Lagging | PostHog events; rolling 7-day window |
| Hair Passport step completion rate | 70% per step | Leading | PostHog funnel per step |
| Time to first product added | ≤3 days median | Leading | Time between `user_registered` and first `product_added` |
| Time to Hair Passport complete | ≤5 days median | Leading | Time between `user_registered` and `hair_passport_completed` |

### 32.2 Engagement metrics

Engagement measures how actively users interact with the data foundation. The metrics are: median sessions per week per active user (target 1.5); median products added per active user (target 3); median chemical services added per active user with chemical history (target 2); sessions with at least one data update (target 50% of sessions).

| Metric | Target | Measurement |
|---|---|---|
| Median sessions per week per active user | 1.5 | PostHog `session_start` events; median per active user |
| Median products added per active user | 3 | PostHog `product_added` events; median per active user |
| Median chemical services added per user with chemical history | 2 | PostHog `chemical_service_added` events; median per user with ≥1 service |
| Sessions with ≥1 data update | 50% of sessions | PostHog; events with `data_update` flag |

### 32.3 Retention metrics

Retention measures how many users return over time. The metrics are D1 retention (target 50%), D7 retention (target 30%), and D30 retention (target 20%). Retention is measured as the percentage of users who registered on day 0 and have at least one session on day N. The targets are conservative for a Phase 1 data foundation app because no recommendation value is delivered in Phase 1; the team should expect retention to rise substantially in Phase 2 when the decision engine ships.

| Metric | Target | Measurement |
|---|---|---|
| D1 retention | 50% | PostHog; users with session on day 1 / users who registered on day 0 |
| D7 retention | 30% | Same as above for day 7 |
| D30 retention | 20% | Same as above for day 30 |
| D7 retention among activated users | 55% | Same as D7 but restricted to users who reached activation |

### 32.4 Quality metrics

Quality metrics measure system health. The targets are: crash-free sessions 99.5% or higher; crash-free users 95% or higher; RLS test pass rate 100% on every PR; support tickets per 100 users 5 or fewer (measured after soft launch begins). Quality metrics are reviewed weekly; a breach triggers an investigation and may block the next launch tier.

| Metric | Target | Measurement |
|---|---|---|
| Crash-free sessions | ≥99.5% | Sentry; sessions without native crash / total sessions |
| Crash-free users | ≥95% | Sentry; users without native crash in 7-day window / total active users |
| RLS test pass rate | 100% on every PR | CI pipeline; RLS test suite exit code |
| Support tickets per 100 users | ≤5 | Helpdesk; tickets / active users × 100 |
| Error rate (HTTP 5xx) | ≤0.5% | Supabase function logs; 5xx / total requests |

### 32.5 Reporting cadence

Metrics are reviewed in three cadences. **Daily**: an automated metrics email at 09:00 SAST summarises the previous day's registration count, activation count, error rate, and any Sev1 or Sev2 incidents. **Weekly**: a metrics stand-up on Monday morning reviews the rolling 7-day metrics against targets, discusses any breach, and agrees actions. **Monthly**: a metrics retrospective at the end of each month reviews the rolling 30-day trends, updates the targets if needed, and reports to the founder. The targets are reviewed and may be revised at the end of Phase 1 based on actual data.

<!-- CHUNK5_END -->

---

## 33. Risk Register [NEW]

### 33.1 Risk methodology

Risks are scored on likelihood (Low / Medium / High) and impact (Low / Medium / High). The risk score is the product of likelihood and impact, with Low=1, Medium=2, High=3. A risk score of 6 or higher is a Sev-1 risk and must be mitigated before the relevant launch tier. A risk score of 4 is a Sev-2 risk and must be mitigated within 30 days. A risk score of 3 or below is a Sev-3 risk and is accepted with documented rationale. The risk register is reviewed monthly.

### 33.2 Phase 1 risk register

| ID | Risk | L | I | Score | Mitigation | Owner | Cadence |
|---|---|---|---|---|---|---|---|
| R1 | Supabase outage — no high availability in Phase 1 | L | H | 3 | Accept risk for Phase 1; Supabase 99.9% SLA is the mitigation; add HA in Phase 3 | Tech Lead | Monthly |
| R2 | POPIA non-compliance — legal penalty and brand damage | M | H | 6 | Information Officer designation; compliance matrix (§21); written legal opinion before beta | Founder/IO | Monthly |
| R3 | RLS gap — User B data exposed to User A | M | H | 6 | RLS tests on every PR (§29.10); pentest before beta (§20.5) | Tech Lead | Per PR |
| R4 | AI coding agent breaks history semantics | M | H | 6 | `CLAUDE.md` instructions; code review checklist; history-preservation tests on every PR | Tech Lead | Per PR |
| R5 | Phase 2 feature creep | H | M | 6 | Scope-change log (§8.2); three-test assessment; founder discipline | Founder | Weekly |
| R6 | Low activation rate (<30%) | M | H | 6 | Onboarding journey tested with 5 internal users before soft launch; KPI dashboard monitored | Product | Weekly |
| R7 | Persona fixture drift — tests no longer reflect real users | M | M | 4 | Quarterly review of fixtures against real user data; harness is single source of truth | QA | Quarterly |
| R8 | Email deliverability failure — recovery emails land in spam | M | H | 6 | Production SMTP configured before beta (§30.3); SPF, DKIM, DMARC configured; deliverability test before beta | Tech Lead | Pre-beta |
| R9 | Deep link breakage on OS update | M | M | 4 | Deep link tested on every PR; OS update monitoring; universal links configured per platform | Tech Lead | Per PR |
| R10 | Username squatting — bad actor registers founder-relevant usernames | L | L | 1 | Reserved-words list (§11.6); no public username display in Phase 1; accept residual risk | Product | Quarterly |
| R11 | Adverse reaction report — user experiences allergic reaction to a logged product | L | H | 3 | Medical boundary (§19); escalation flow; `allergy_incidents` table preserved | IO | Quarterly |
| R12 | Founder dependence — key-person risk | H | H | 9 | Documentation discipline (`CLAUDE.md`, ADRs); cross-training; advisor onboarding; succession plan documented | Founder | Monthly |

### 33.3 Risk closure

Risks are closed when the mitigation is fully implemented and verified. A closed risk is retained in the register with a 'closed' status, the closure date, and a brief note on the verification. Closed risks are reviewed quarterly to confirm the closure remains valid (e.g., a previously-closed risk of RLS gap may re-open if a new table is added without RLS tests).

---

## 34. Team, Roles & Governance [NEW]

### 34.1 Phase 1 roles

Phase 1 requires the following roles. The FTE estimates assume a small team; some roles may be combined in the earliest phase but the segregation-of-duties rules in §34.3 must be respected. The founder is assumed to be the Information Officer until a formal designation is made.

| Role | FTE | Responsibilities |
|---|---|---|
| Product Owner (founder) | 0.5 | Vision, prioritisation, scope enforcement, internal user testing, Information Officer |
| Tech Lead | 1.0 | Architecture, code review, security review, RLS test ownership, release management |
| Mobile Engineer | 1.0 | React Native/Expo implementation, screen building, performance |
| Part-time QA | 0.25 | Test persona harness, E2E suite, manual exploratory testing |
| Part-time Designer | 0.25 | Screen design, design system, accessibility review |
| Part-time Security Reviewer | 0.1 | Pentest liaison, RLS test review, secrets scan oversight |

### 34.2 RACI matrix

The RACI matrix documents Responsible, Accountable, Consulted, and Informed for key Phase 1 decisions. The matrix prevents decision-stalls and clarifies who has final say.

| Decision | Founder | Tech Lead | Mobile Eng | QA | Designer | Sec Reviewer |
|---|---|---|---|---|---|---|
| Schema change | A | R | C | I | I | C |
| RLS policy | I | A | C | I | I | R |
| Release to beta | A | R | C | C | C | C |
| Acceptance criteria sign-off | A | R | C | C | C | C |
| Risk closure | A | R | C | C | I | C |
| POPIA compliance sign-off | A/R | C | I | I | I | C |
| Public launch | A/R | C | C | C | C | C |

### 34.3 Segregation of duties

Two roles cannot be combined in the same person. First, the security reviewer must be a different person from the author of the code under review. The founder or Tech Lead may act as security reviewer for code written by the Mobile Engineer; an external advisor may act as security reviewer for code written by the Tech Lead. Second, the Information Officer should ideally be a different person from the founder to avoid conflict of interest; if the founder is the Information Officer, an external advisor reviews the POPIA compliance matrix quarterly.

### 34.4 Governance cadence

Governance cadence: weekly stand-up on Monday (15 minutes, blocker-focussed); bi-weekly sprint review on alternate Fridays (60 minutes, demo of completed work against milestones); monthly risk review on the first Tuesday (30 minutes, walk through the risk register); pre-beta gate review (90 minutes, walk through all §30 acceptance criteria and §30 public beta blockers). Each cadence has a written agenda stored in the repository and minutes are committed to `docs/minutes/`.

---

## 35. Phase 2 Entry Criteria & Future Decision Engine

### 35.1 Phase 2 entry criteria (preserved from v1.0 §48)

Do not begin Phase 2 until: Phase 1 authentication is stable; RLS tests pass; history semantics are proven; product and tool versioning is working; unknown and unverified states work correctly; chemical zones work; provenance model works; and internal test users can enter realistic data without special-case schema changes. Only then should the deterministic decision engine be designed.

### 35.2 Future decision engine principle (preserved from v1.0 §50)

When Phase 2 begins, the core question becomes: Is Product X, Tool Y, or Routine Z appropriate for THIS user, with THIS history, THESE owned products, THESE tools, THIS current state and TODAY'S goal? The system must never reduce this to: Product X is good for curly hair.

### 35.3 Phase 2 design sprint [NEW]

Phase 2 begins with a 2-week design sprint. The output of the sprint is a formal design document (`docs/PHASE_2.md`) that specifies: the rule schema in detail; the rule authoring workflow in detail; the explanation rendering format; the A/B testing framework; and the first rule to be built. The design sprint is conducted by the Tech Lead with input from the founder and an external subject-matter advisor.

### 35.4 First Phase 2 deliverable [NEW]

The first Phase 2 deliverable is the narrowest possible vertical slice of the decision engine: the single question *Is direct heat appropriate today?* The answer is deterministic (Yes / No / Insufficient information) and is derived from: user's chemical history (e.g., recent relaxer or bleach within a cooldown window), user's current concerns (e.g., heat damage concern), user's owned heat-protectant products, and any documented zone-specific heat cautions. The deliverable demonstrates the full rule pipeline (rule authored, evidence attached, peer-reviewed, published, evaluated against user data, explained to user) end-to-end on the narrowest possible scope.

### 35.5 A/B testing framework [NEW]

Phase 2 must include an A/B testing framework for measuring rule efficacy. The framework supports: variant assignment (`user_id` hashed to bucket); event capture (PostHog events already in place from Phase 1); statistical significance calculation (sequential testing to avoid peeking); and rule version tracking (every recommendation carries the rule version that produced it, so A/B results can be sliced by rule version). The A/B framework is used to test whether a new rule version improves user outcomes (e.g., does the new direct-heat rule reduce reported heat damage incidents?).

---

## 36. Final Product Doctrine

### 36.1 Final product doctrine (preserved and extended from v1.0 §51)

StrandCue must: know what it knows; know what it does not know; **prove** what it knows; preserve what happened previously; distinguish evidence from marketing; distinguish discovery from verification; protect user data; remain brand-neutral; support all hair types; avoid race and ethnicity proxies; use what users already own where appropriate; support users across income levels; preserve future intelligence without implementing it prematurely; never invent missing facts; **never lock user data hostage — portability is a right**.

Reliability, safety, historical truth and defensibility come before cleverness.

The two additions in v1.1 are 'prove what it knows' (operationalising the auditability principle in §6.8) and 'never lock user data hostage — portability is a right' (operationalising the portability principle in §6.9). The original 13 principles from v1.0 are preserved unchanged.

---

## 37. Appendix A: Glossary & Definitions

The glossary defines every domain term, abbreviation, and concept used in this PRD. Terms are alphabetised. Where a term has a section reference, the reference points to the section where the term is operationally defined.

| Term | Definition |
|---|---|
| ADR | Architectural Decision Record — a numbered, dated document that records a non-reversible architectural decision and its rationale. Stored in `docs/adr/`. |
| Adult gate | The self-attestation question 'Are you 18 years or older?' at the start of registration. StrandCue does not verify age against any external identity system in Phase 1. |
| Audit log | An append-only log of administrative and privileged operations. Distinct from the event log (which models user-facing state changes). Retained 7 years per POPIA. |
| Beachhead | The initial narrow user cohort used to validate the data foundation before any public launch. Three layers: founder team, invited professionals, waitlist. |
| `CLAUDE.md` | Repository-level instructions for AI coding agents. The source of truth for what an AI agent must read and respect before modifying architecture or schema. |
| Conflict rules | Data-driven rules that detect combinations of chemical services within a short window that carry elevated risk. Surfaced as soft warnings, not hard blocks. |
| Consent record | An append-only record of consent per purpose: `user_id`, `purpose`, `version of consent text`, `granted_at`, `withdrawn_at`. Retained 7 years. |
| Correction | An event in the event log with `type='correction'` referencing the original event being corrected. Distinguished from a real-world change. |
| Current-state materialised view | A Postgres materialised view derived from the event log, refreshed by a trigger on every insert. Read queries hit the view, not the event log directly. |
| Deep link | A mobile app link that opens a specific screen in the app. Used for password recovery and email confirmation flows. |
| D1/D7/D30 retention | The percentage of users who registered on day 0 and have at least one session on day 1, 7, or 30 respectively. |
| ECT Act | Electronic Communications and Transactions Act 25 of 2002 (South Africa). Governs electronic transactions and data messages. |
| Event log | An append-only log of all user-facing state changes. No event is ever mutated; corrections are new events. |
| Hair Passport | The structured set of cosmetic hair information about a user: pattern, strand diameter, density, porosity, length, scalp observations, concerns, goals, styling habits, environmental sensitivities, economic preference. |
| Hard delete | The second stage of account deletion. The user's rows are removed from `current_state` and `event_log` (with the exception of `audit_log` and `consent_records` which are retained 7 years). |
| Information Officer | The POPIA-designated person responsible for compliance, data-subject requests, and liaison with the Information Regulator. Founder until formally designated. |
| JTBD | Jobs-to-be-Done framework. Statement form: When [situation], I want to [motivation], so I can [expected outcome]. |
| Maestro | End-to-end testing framework for React Native, preferred over Detox for stability and speed. |
| MFA | Multi-Factor Authentication. TOTP-based MFA is a Phase 2 stretch goal; architecture preserved in Phase 1. |
| My Shelf | The user's product library. Each entry is a `user_product` linked to a `product_version` (where known). |
| My Tools | The user's styling tool library. Each entry is a `user_tool` linked to a `tool_version` (where known). |
| Nanoplasty / Nanoplastia | A cosmetic smoothing or straightening service with possible salon heat exposure. Must be explicit; do not infer chemical system or flat-iron temperature. |
| NFR | Non-Functional Requirement. Includes performance, reliability, scalability, offline, security, compliance, observability, and backup/DR. |
| POPIA | Protection of Personal Information Act 4 of 2013 (South Africa). The primary data-protection statute. |
| Provenance | The source-of-record metadata attached to a product fact: source URL, archived URL, source type, trust tier, first-seen date, last-checked date. |
| RACI | Responsible, Accountable, Consulted, Informed — a decision-rights matrix. |
| Real-world change | An event in the event log with `type='real_world_change'`. Distinguished from a correction (which fixes an erroneous prior entry). |
| RPO | Recovery Point Objective — the maximum data loss acceptable in a disaster. StrandCue target: 1 hour. |
| RLS | Row Level Security — Postgres feature that enforces per-row access control based on the authenticated user. The primary defence against cross-user data exposure. |
| RTO | Recovery Time Objective — the maximum time from disaster declaration to full service restoration. StrandCue target: 4 hours. |
| SAHPRA | South African Health Products Regulatory Authority. The regulator for health products, including some cosmetics if medical claims are made. |
| `SECURITY DEFINER` | A Postgres function attribute that runs with the privileges of the function owner rather than the caller. Use sparingly; never as a shortcut around RLS problems. |
| Service zone | A specific region of the head affected by a chemical service: roots, mid-lengths, ends, front, crown, nape, whole head, or other. A service may apply to multiple zones. |
| Soft delete | The first stage of account deletion. A flag is set on the user record; data is hidden but recoverable for 30 days. |
| STRIDE | Threat categorisation framework: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege. |
| Supabase Auth | The authentication component of Supabase. StrandCue's chosen auth provider; no custom auth built. |
| Trust tier | The hierarchical classification of source types from T1 (regulator) to T10 (marketing-only). Determines which source wins when sources conflict. |
| Verification status | A per-product-fact status: `unverified`, `pending_verification`, `partially_verified`, `verified`, `conflicting_information`, `reformulated`, or `retired`. |
| WCAG 2.2 AA | Web Content Accessibility Guidelines version 2.2, conformance level AA. The accessibility target for StrandCue. |

---

## 38. Appendix B: Audit Change Log (Section-by-Section v1.0 to v1.1)

This appendix maps every section of v1.0 to its location in v1.1, with the change type and an audit note. Change types: PRESERVED (unchanged); EXTENDED (added subsections); MERGED (combined with adjacent sections to improve navigability); NEW (no v1.0 equivalent). The mapping confirms that no v1.0 content was removed in v1.1.

| v1.0 § | v1.0 topic | v1.1 § | Change type | Audit note |
|---|---|---|---|---|
| 1 | Executive Summary | 4 | EXTENDED | Preserved; added the seven v1.1 audit dimensions and rationale |
| 2 | Product Vision | 5 | EXTENDED | Preserved; added differentiation and why-now subsections |
| 3 | Governing Principles | 6 | EXTENDED | Preserved 3.1–3.7 verbatim; added 6.8 Auditability, 6.9 Portability, 6.10 Data Minimisation |
| 4 | Phase Strategy | 7 | EXTENDED | Preserved; added indicative roadmap with milestones, headcount, capital placeholders |
| 5 | Phase 1 Non-Goals | 8 | EXTENDED | Preserved; added scope-boundary enforcement and stretch-goals subsections |
| 6 | Market Scope | 9 | EXTENDED | Preserved ZA defaults; added competitive landscape, regulatory environment, beachhead strategy |
| 7 | Target Users | 10 | EXTENDED | Preserved hair-type list; added JTBD framework and 4 personas with test data notes |
| 8 | Account Model | 11 | MERGED | Merged with §9 (Authentication) and §10 (Profile); added session policy, rate limiting, MFA prep |
| 9 | Authentication Requirements | 11 | MERGED | Merged with §8; all auth flows preserved verbatim |
| 10 | Profile Model | 12 | MERGED | Merged with §11 (Hair Passport); profile fields preserved |
| 11 | Hair Passport | 12 | MERGED | Preserved all enumerations; added completeness score, edit-vs-correct flow, save-resume |
| 12 | Longitudinal History Model | 13 | EXTENDED | Preserved; committed to append-only event log pattern with ADR; added audit log requirement |
| 13 | Chemical and Service History | 14 | EXTENDED | Preserved; added still-present-on-head auto-expiry, zone-overlap, soft conflict detection |
| 14 | My Shelf | 15 | MERGED | Merged with §15, §16, §17, §18 |
| 15 | Product Data Architecture | 15 | MERGED | Preserved brands→products→product_versions→user_products hierarchy |
| 16 | Product Knowledge and Provenance | 16 | MERGED | Preserved; extended with trust tier hierarchy, source archiving, reverification cadence, conflict flow |
| 17 | Product Verification | 16 | MERGED | Preserved verification statuses; integrated into trust tier hierarchy |
| 18 | Unknown Product Handling | 15 | MERGED | Preserved; integrated with soft-delete policy |
| 19 | My Tools | 17 | EXTENDED | Preserved; added temperature normalisation, future heat-event schema, distinct unknowns, photo |
| 20 | Future Routine Audit Readiness | 18 | MERGED | Merged with §21, §22, §23, §24, §25 |
| 21 | Future Deterministic Rules Engine | 18 | MERGED | Preserved; added rule authoring workflow and rule versioning |
| 22 | Evidence Model | 18 | MERGED | Preserved; integrated with trust tier hierarchy |
| 23 | Future Evidence Presentation | 18 | MERGED | Preserved |
| 24 | Future Feedback and Personal Evidence | 18 | MERGED | Preserved |
| 25 | Future Community Outcome Data | 18 | MERGED | Preserved; added cohort minimum n≥50 and confidence interval display |
| 26 | Medical Boundary | 19 | EXTENDED | Preserved; added 3-tier escalation flow, allergy incidents, adverse-event reporting |
| 27 | Security Architecture | 20 | EXTENDED | Preserved all RLS/secrets rules; added STRIDE threat model, secrets management, dep scanning, pentest cadence, incident response |
| 28 | Account Deletion | 28 | MERGED | Merged with new backup/DR section; added saga-based deletion flow and export-before-deletion |
| 29 | Privacy Requirements | 21 | EXTENDED | Preserved principles; added full POPIA compliance matrix, purpose register, consent UX, Information Officer, retention schedule, cross-border restriction |
| 30 | Technical Stack | 22 | MERGED | Merged with §31, §32, §33; added dependency pinning, branching strategy, code review checklist, migration review, doc freshness |
| 31 | Repository Governance | 22 | MERGED | Preserved structure |
| 32 | AI Coding Governance | 22 | MERGED | Preserved agent rules |
| 33 | Database Change Governance | 22 | MERGED | Preserved; extended with migration review process |
| 34 | Conceptual Phase 1 Data Model | 23 | EXTENDED | Preserved; added per-table schema sketch with RLS and temporal handling columns |
| 35 | Current-vs-History Implementation | 23 | EXTENDED | Preserved 3 permitted patterns; committed to append-only event log with derived materialised view |
| 36 | Phase 1 Core Screens | 24 | EXTENDED | Preserved screen list; added full onboarding journey, per-screen specification, activation tracking |
| 37 | Data Validation Requirements | 27 | MERGED | Merged with analytics and observability; preserved validation rules |
| 38 | Analytics | 27 | MERGED | Preserved events; added PostHog selection, event taxonomy, PII exclusion, crash reporting, logs, dashboard, alerting |
| 39 | Accessibility and UX Requirements | 25 | EXTENDED | Preserved; added WCAG 2.2 AA target, design system, tone of voice, microcopy library, i18n readiness, state requirements |
| 40 | Required Phase 1 Test Personas | 29 | EXTENDED | Preserved 15 personas; added test pyramid, coverage targets, CI pipeline, persona harness, security automation, mutation testing, performance regression, accessibility automation |
| 41 | Authentication Test Requirements | 29 | MERGED | Preserved; integrated into CI pipeline |
| 42 | Security Test Requirements | 29 | MERGED | Preserved; integrated into security test automation |
| 43 | Product/Versioning Test Requirements | 29 | MERGED | Preserved |
| 44 | History Test Requirements | 29 | MERGED | Preserved |
| 45 | Phase 1 Acceptance Criteria | 30 | EXTENDED | Preserved; added v1.1 acceptance extensions and soft launch criteria tier |
| 46 | Public Beta Blockers | 30 | EXTENDED | Preserved; added POPIA legal opinion, accessibility audit, security review, observability, backup drill |
| 47 | Phase 1 Development Sequence | 31 | EXTENDED | Preserved 30 steps; grouped into 6 milestones with indicative weeks |
| 48 | First Internal Test Profile | 31 | MERGED | Preserved; integrated into milestone M6 exit criteria |
| 49 | Phase 2 Entry Criteria | 35 | EXTENDED | Preserved; added Phase 2 design sprint and first deliverable |
| 50 | Future Decision Engine Principle | 35 | EXTENDED | Preserved; added A/B testing framework |
| 51 | Final Product Doctrine | 36 | EXTENDED | Preserved 13 principles; added 'prove what it knows' and 'portability is a right' |
| — | Document Control & Change Log | 3 | NEW | New front-matter section with document control table and 7-dimension change log |
| — | Market Scope & Competitive Context | 9 | NEW | Competitive landscape, regulatory environment, market sizing placeholder, beachhead strategy |
| — | Target Users, Personas & JTBD | 10 | NEW | 4 personas with JTBD statements and test data notes |
| — | Privacy, Consent & POPIA Compliance | 21 | NEW | POPIA compliance matrix, purpose register, consent UX, Information Officer, retention, cross-border |
| — | Phase 1 Core Screens & Onboarding Journey | 24 | NEW | Onboarding journey diagram, per-screen specification, activation tracking |
| — | UX, Content & Accessibility Guidelines | 25 | NEW | WCAG 2.2 AA, design system, tone of voice, microcopy library, i18n readiness, state requirements |
| — | Non-Functional Requirements | 26 | NEW | Performance, reliability, scalability, offline, security, compliance, observability, backup/DR NFRs |
| — | Data Validation, Analytics & Observability | 27 | NEW | PostHog selection, event taxonomy, PII exclusion, Sentry, logs, dashboard, alerting |
| — | Backup, Disaster Recovery & Account Lifecycle | 28 | NEW | Backup strategy, RPO/RTO, account deletion saga, export before deletion |
| — | Test Strategy, CI/CD & Test Personas | 29 | NEW | Test pyramid, coverage targets, CI pipeline, persona harness, security automation, mutation testing, performance regression, accessibility automation |
| — | Success Metrics & KPIs | 32 | NEW | Activation, engagement, retention, quality KPIs with measurement methods |
| — | Risk Register | 33 | NEW | 12 risks scored on likelihood × impact, with mitigation, owner, cadence |
| — | Team, Roles & Governance | 34 | NEW | Phase 1 roles, RACI matrix, segregation of duties, governance cadence |
| — | Appendix A: Glossary | 37 | NEW | 40 domain terms alphabetised |
| — | Appendix B: Audit Change Log | 38 | NEW | This mapping table |

### 38.1 Net change summary

Net new sections added in v1.1: 14 (including 2 appendices). Sections removed from v1.0: 0. Total v1.1 sections: 36 plus 2 appendices. Total v1.0 sections preserved (verbatim or extended): 51 of 51. Every v1.0 requirement, principle, non-goal, and acceptance criterion is retained; the audit confirms no regression from v1.0 to v1.1.

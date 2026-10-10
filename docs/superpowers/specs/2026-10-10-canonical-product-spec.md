# StrandCue Canonical Product Specification

**Version:** 1.0  
**Date:** 10 October 2026  
**Status:** Approved product authority  
**Implements:** `docs/superpowers/specs/2026-10-10-product-recovery-audit.md`  
**Positioning:** Your hair. Your products. Your next best step.

## 1. Product purpose

StrandCue is a private, evidence-aware, brand-neutral cosmetic hair-care decision companion for adults. It answers:

> Given my actual hair, treatment history, current condition, products and tools I own, environment, budget, previous outcomes and desired result—what should I do now, why, and what should I watch for afterward?

The product must complete a continuous loop:

1. Know the person and what is currently true.
2. Know what products and tools are available.
3. Generate a reproducible, practical plan.
4. Record what actually happened.
5. Capture the person’s observations and optional progress photos.
6. Use that personal history to improve the next safe choice.

The existing Phase 1 data foundation remains valid implementation work. It no longer defines the boundary of the intended product.

## 2. Authority and traceability

This specification was approved by the product owner on 10 October 2026. It supersedes conflicting product-scope statements in `docs/PHASE_1.md`, including sections 2 and 8 and acceptance criterion `P1-AC-23`. Those statements remain historical constraints for the earlier foundation release; they do not prohibit the recommendation engine defined here.

Current authority is:

1. Subsequent explicit product-owner decisions.
2. This specification.
3. Approved journey designs and acceptance scenarios.
4. Approved subsystem implementation plans and ADRs.
5. Product-recovery audit and historical PRDs as context.
6. `docs/PHASE_1.md` for existing foundation behavior.

Every implementation task must cite one or more requirement IDs from this specification. Every requirement must map to code, tests and a user journey in a living traceability matrix.

## 3. Principles

**P-01 Person first.** A generic hair type never determines a complete plan.

**P-02 Owned first.** Prefer a feasible routine using products/tools already owned. Say “no purchase needed” when true.

**P-03 Exact facts.** Product and tool claims apply only to the reviewed version, market and use conditions.

**P-04 Unknown is valid.** Missing facts produce a question, limited confidence, conservative alternative or unsupported result.

**P-05 Deterministic decisions.** Safety, eligibility, order, waits, frequency and treatment state are calculated by versioned rules, never by an LLM.

**P-06 Personal evidence is honest.** Report observations and sample sizes without claiming causation.

**P-07 History remains true.** Corrections are audited; later changes do not rewrite completed protocol snapshots.

**P-08 Brand and commercial neutrality.** Price, sponsorship, affiliate value and popularity cannot influence suitability or safety.

**P-09 Cosmetic boundary.** No diagnosis, medication advice, hair-loss treatment, promised growth or diagnostic interpretation of photographs.

**P-10 Privacy by design.** Collect only what a feature needs; isolate owners; exclude sensitive content from analytics; support export and deletion.

**P-11 Explainability.** Users can see why a step was selected, its evidence and uncertainty, and feasible alternatives.

**P-12 Useful before broad.** Ship narrow, reviewed end-to-end journeys before a wide but unreliable catalogue.

## 4. Intended users and coverage

StrandCue supports adults with straight, wavy, curly, coily and mixed patterns; fine, medium, coarse or unknown strand diameter; varied density; natural, grey, coloured, highlighted, bleached, relaxed, permed, keratin-treated and otherwise processed hair. The model must represent multiple conditions and different zones of the head/strand.

Initial rule coverage may be narrower than data-model coverage. Unsupported combinations must be identified honestly. Expansion requires reviewed rules and regression cases.

## 5. Primary navigation

1. **Today** — current goal, missing questions, plan, reasons and execution.
2. **My Hair** — Passport, current condition, services, zones and timeline.
3. **My Shelf** — owned products, versions, status, opened/expiry details and audit.
4. **My Tools** — owned tools, capabilities, settings and heat context.
5. **Journey** — completed routines, activities, Cue Checks, progress photos and trends.
6. **Settings** — account, consent, notifications, privacy, export, deletion, support and limitations.

On small screens, the visible bottom navigation may expose fewer destinations with the remainder grouped under Journey/My Hair. Labels must remain consistent throughout the app.

## 6. Core user journeys

### J-01 First useful plan

Create and verify account → complete minimum Passport → add available products/tools → choose goal → answer targeted missing questions → receive plan → inspect reasons and alternatives → start → record actual actions → complete Cue Check.

### J-02 Returning wash/styling day

Open Today → confirm changes since last use → confirm time, product/tool availability and environmental context → generate → choose eligible route → execute → record deviations → optionally schedule later Cue Check.

### J-03 Treatment programme

Match exact treatment → show reviewed instructions → establish history/baseline → determine not-due/eligible/due/needs-input → record actual application → progress programme state only from confirmed events → handle missed/interrupted use through an approved rule.

### J-04 Learn what works

Open product/routine history → see structured personal observations and sample count → compare eligible options → understand uncertainty → choose an option → add later outcome and optional progress photos.

### J-05 Audit the shelf

Review owned products → identify functional overlaps, incompatible order, unverified items, expired/open-too-long items and missing prerequisites → receive keep/use-less/change-order/no-purchase-needed/insufficient-information outcomes.

### J-06 Product check

Search, scan barcode or photograph label → find exact candidate → confirm match → view verified facts and limitations → compare against current goal/profile/owned alternatives → add as owned or submit for review.

### J-07 Privacy lifecycle

Review purposes and stored data → export → inspect/download private media → revoke optional consent → request/cancel deletion where allowed → complete deletion of Auth, database data, drafts and Storage objects.

## 7. Functional requirements

### 7.1 Identity, eligibility and lifecycle

- **ID-01:** Email/password and immutable Supabase UUID remain the identity model.
- **ID-02:** Username is a changeable handle, not a login identifier or owner key.
- **ID-03:** Require adult self-attestation before collecting hair records.
- **ID-04:** Preserve secure session refresh, logout, account switching, recovery, password/email change and session revocation.
- **ID-05:** Pending sensitive drafts must be retained or explicitly discarded before voluntary logout; another owner must never see them.
- **ID-06:** Export and deletion require recent authentication and idempotent operations.

### 7.2 Hair Passport and current context

- **HP-01:** Record pattern, strand diameter, density, optional porosity, length, current concerns, self-reported damage, desired results, styling habits, humidity sensitivity, heat preference and known reactions/avoidances.
- **HP-02:** Record chemical/service events with date precision, zones, frequency, exact treatment where known and whether affected hair remains present.
- **HP-03:** Distinguish current profile, dated observation, correction and real-world change.
- **HP-04:** Allow mixed states and zone-specific facts; never collapse the whole head into one value when differences matter.
- **HP-05:** Show a completeness explanation based on the selected goal, not a universal gamified percentage.
- **HP-06:** Today may ask a temporary current-condition question without permanently changing the Passport unless the user chooses to save it.
- **HP-07:** Coarse city and timezone are optional; precise GPS is not required.

### 7.3 Shelf, catalogue and product lifecycle

- **SH-01:** Users may add any product manually and mark available, low, empty or archived.
- **SH-02:** Catalogue matching requires brand, exact name, variant, market and version/formulation where known; the user confirms a match.
- **SH-03:** Preserve original manual entries and match history.
- **SH-04:** Record opened date/precision, optional expiry or period-after-opening, quantity band and repurchase intent. Do not invent shelf life.
- **SH-05:** Published product versions are immutable and support reformulated, superseded and withdrawn states.
- **SH-06:** Notify affected owners of a verified material reformulation/withdrawal without silently changing historical plans.
- **SH-07:** Product facts include directions, order, wait, rinse/leave-in, frequency unit, activation, explicit incompatibilities, supported heat/humidity/colour claims and evidence.
- **SH-08:** Ingredients may support transparent description or reviewed rules; ingredient presence alone cannot produce efficacy, “toxicity,” overload or diagnosis claims.
- **SH-09:** Barcode, OCR, label photo and URL import create discovery candidates, never automatically verified facts.
- **SH-10:** User-submitted corrections enter a moderation queue and never change global knowledge immediately.

### 7.4 Tools and heat

- **TL-01:** Record exact tool/model when known, tool type, available settings, units, attachments and condition.
- **TL-02:** Distinguish direct-contact heat, heated air, hooded heat, steam and unheated methods.
- **TL-03:** Unknown temperature is not inferred from wattage, model name or salon service.
- **TL-04:** Record actual temperature/setting, passes, duration band and zones when the user knows them.
- **TL-05:** Heat Coach returns appropriateness, necessity, restrictions, missing information, lower-heat alternatives and explanation; it never declares heat universally safe.
- **TL-06:** Roller-set, wrap, air-dry, diffuser, hot-air brush and targeted touch-up may be represented as technique alternatives when reviewed facts support them.

### 7.5 Deterministic recommendation engine

- **EN-01:** Same versioned inputs and rules produce the same decision.
- **EN-02:** Processing order is: validate facts → active safety blocks → official applicable directions → treatment state → compatibility/order → goal suitability → heat/product minimisation → personal ranking → stable tie-break.
- **EN-03:** Allowed rule effects are require, exclude, order-before/after, wait, rinse/no-rinse, frequency, activation, heat restriction and advisory preference.
- **EN-04:** Rules use a typed whitelist DSL; no arbitrary database JavaScript or prompt-authored executable rule.
- **EN-05:** Two incompatible hard constraints produce rule conflict with a feasible fallback or no protocol.
- **EN-06:** Unknown or unverified products cannot satisfy an exact verified prerequisite or acquire invented compatibility.
- **EN-07:** Outputs include ordered steps, omissions, alternatives, reasons, confidence, missing inputs, evidence references and complete audit versions.
- **EN-08:** The engine can conclude that existing products are sufficient or that no purchase is needed.
- **EN-09:** Commercial variables are excluded from evaluator input types.

### 7.6 Today and protocol execution

- **TD-01:** Today is the primary action surface.
- **TD-02:** Capture goal, time available, current condition, product/tool availability and relevant unlogged history.
- **TD-03:** Ask targeted missing questions before generation; allow explicitly limited alternatives when safe.
- **TD-04:** Show the selected route, duration estimate, reasons, evidence, confidence and alternatives before starting.
- **TD-05:** Store an immutable protocol snapshot.
- **TD-06:** Starting/viewing/generating does not count as real wash, application or heat.
- **TD-07:** During execution record completed, skipped, substituted, extra and modified steps.
- **TD-08:** Permit pause/resume, abandon and partial completion while preserving confirmed actual events.
- **TD-09:** If authoritative content changes materially, mark open plans stale and explain why; never rewrite completed plans.

### 7.7 Wash counting and treatment programmes

- **TR-01:** Count only confirmed real events using the rule’s named unit.
- **TR-02:** Two lathers in one wash count as one shampoo session unless an exact reviewed rule says otherwise.
- **TR-03:** The application wash does not count as an elapsed wash after that application.
- **TR-04:** Preserve manufacturer ranges and approved transition policies rather than inventing a single due number.
- **TR-05:** Programme states are not_started, initial, reassessment, maintenance, paused and completed.
- **TR-06:** Corrections and backdated events recompute derived state while leaving completed snapshots unchanged.
- **TR-07:** Missed/interrupted programmes require an approved resumption rule or `needs_input`.
- **TR-08:** Reminders communicate eligibility/due status, not proof that a product stopped working.

### 7.8 Cue Check and personal evidence

- **CC-01:** Capture actual product/tool use and deviations separately from the plan.
- **CC-02:** Outcome fields include overall result, satisfaction, dryness, frizz, softness, tangling, buildup/heaviness, breakage observation, style longevity, immediate reaction and would-use-again; most fields are optional/unknown-aware.
- **CC-03:** Allow immediate and delayed Cue Checks plus correction/void history.
- **CC-04:** Summaries state counts and observation context, for example “You reported less frizz in 3 of 4 uses.”
- **CC-05:** Do not state that a product caused an outcome.
- **CC-06:** Personal ranking runs only after hard eligibility filtering and preserves baseline order when evidence is sparse.
- **CC-07:** Ranking explanations show sample size, recency, relevant goal/context and uncertainty.
- **CC-08:** Users may create a controlled personal experiment that changes one selected variable while keeping recorded context visible; the app must not present it as a clinical experiment.

### 7.9 Photos and visual progress

- **PH-01:** Photos are optional, private and owner-only.
- **PH-02:** Capture/import requires an explicit action, purpose explanation and permission at use time.
- **PH-03:** Provide consistent-angle, distance, lighting and hair-state guidance.
- **PH-04:** Offer an optional ghost overlay from a selected prior photo to help alignment.
- **PH-05:** Store capture date/precision, view, lighting label, hair state/style, linked session/products and optional note.
- **PH-06:** Provide timeline and side-by-side comparison with user-entered context.
- **PH-07:** Do not infer porosity, damage severity, diagnosis, growth rate or product effectiveness from pixels.
- **PH-08:** Use private Storage, short-lived signed access, owner RLS, cache clearing on logout/switch, export and complete deletion.
- **PH-09:** Shelf/tool/label photos are a separate purpose from personal progress photos and require separate metadata/retention treatment.

### 7.10 Weather, travel and seasonal context

- **WX-01:** Weather is optional and based on user-selected coarse city or explicit location permission; city is the default privacy-preserving path.
- **WX-02:** Store observation timestamp, source and freshness; show stale/unavailable state.
- **WX-03:** Humidity, dew point, temperature, precipitation/wind where relevant and user-reported sensitivity may influence advisory ranking only through approved rules.
- **WX-04:** Weather cannot waive product directions or safety blocks.
- **WX-05:** Provide travel/temporary-location and seasonal-context controls without overwriting the permanent profile.
- **WX-06:** Automatically logged environmental context may be attached to a Cue Check so users can inspect patterns later.

### 7.11 Routine Audit and comparison

- **RA-01:** Audit outcomes are keep, use less often, change order, functional duplicate, unsupported combination, missing prerequisite/category, no purchase needed and insufficient verified information.
- **RA-02:** Show which exact facts/rules produced each outcome.
- **RA-03:** Product comparison must be person-, goal-, version- and market-specific.
- **RA-04:** Comparison distinguishes verified directions, evidence, formulation inference, community outcomes, personal outcomes, price and availability.
- **RA-05:** Do not use a universal product score or unsupported precise fit percentage.
- **RA-06:** Allow a user to compare an owned option against a possible purchase and explicitly prefer the owned option when equally feasible.

### 7.12 Reminders and planning

- **RM-01:** Users control reminders for planned routine, delayed Cue Check, treatment eligibility, product review/expiry and progress photo.
- **RM-02:** Reminders are optional, quiet-hours aware, timezone correct and individually dismissible.
- **RM-03:** Do not use punitive streaks or imply failure for missed routines.
- **RM-04:** A calendar/history view distinguishes planned, completed, partial, skipped and unknown.
- **RM-05:** Notification content avoids sensitive hair/treatment details on the lock screen by default.

### 7.13 Advice and AI explanation

- **AI-01:** The complete product works without AI credentials or availability.
- **AI-02:** AI receives only a redacted structured deterministic decision and approved evidence text.
- **AI-03:** AI may summarize, explain, compare already-eligible alternatives and answer follow-ups grounded in the decision.
- **AI-04:** AI cannot add/remove/reorder steps, change timing/frequency, create product facts, diagnose, or recommend medication.
- **AI-05:** Validate identifiers and claims against the source decision; fall back to deterministic templates on mismatch, timeout or failure.
- **AI-06:** Clearly label AI wording and provide access to underlying rules/evidence.
- **AI-07:** Do not send progress photos or free-text health details to an AI provider without a separate approved purpose, design and consent.

### 7.14 Safety boundary and escalation

- **SF-01:** StrandCue provides cosmetic guidance, not diagnosis or medical treatment.
- **SF-02:** Reports of severe burning, swelling, breathing difficulty, eye exposure, open wounds, sudden patchy loss or other reviewed red flags stop ordinary guidance and show reviewed urgent-care wording.
- **SF-03:** The app may suggest consulting an appropriate qualified professional without claiming a condition.
- **SF-04:** Record adverse reaction observations and affected product/version; do not automatically publish them as global evidence.
- **SF-05:** Product recall/withdrawal can stop new recommendations and flag open plans while preserving history.

### 7.15 Evidence, content and governance

- **EV-01:** Evidence attaches to a specific claim and product/rule version.
- **EV-02:** Store source kind, title/URL/publisher/date, retrieval date, applicability, supporting excerpt/reference, limitations, reviewer and status.
- **EV-03:** Distinguish regulator/safety, peer-reviewed research, professional organisation, independent testing, manufacturer direction, formulation inference, consumer signal, community outcome, individual anecdote and marketing.
- **EV-04:** Draft → review → published → superseded/withdrawn; published content is immutable.
- **EV-05:** Safety-relevant publication requires a second reviewer before public beta.
- **EV-06:** Withdrawals and reformulations trigger regression evaluation and affected-user handling.
- **EV-07:** Content coverage is visible; unsupported situations are not hidden behind generic advice.

### 7.16 Community outcomes

- **CO-01:** Community contribution is separately opt-in and revocable.
- **CO-02:** Never expose raw public profiles/reviews or identify contributors.
- **CO-03:** Suppress small cohorts and show denominator, missingness, context and uncertainty.
- **CO-04:** Community evidence may inform advisory ranking but cannot override verified directions/safety.
- **CO-05:** Do not launch aggregation until personal outcome data quality and privacy review pass.

### 7.17 Professional/stylist handoff

- **PR-01:** Users may generate a shareable, user-controlled summary of relevant hair/service/product history for a stylist.
- **PR-02:** Default summary excludes account identifiers and private photos; the user explicitly selects optional fields/photos.
- **PR-03:** Shared summaries expire or are exported as a user-controlled file; access is revocable where technically possible.
- **PR-04:** StrandCue does not certify a stylist or transmit data to a salon without the user’s explicit action.

### 7.18 Privacy, portability and operations

- **PV-01:** Purpose-specific consent covers required record processing and optional analytics, marketing, community, media and AI purposes.
- **PV-02:** RLS and grants enforce owner isolation for every exposed table and Storage object.
- **PV-03:** Analytics excludes email, username, UUID, notes, photos, URLs/tokens and product/service free text.
- **PV-04:** Export covers all records, rule/protocol snapshots, outcomes, consent, media metadata and a secure media retrieval mechanism.
- **PV-05:** Deletion removes Auth identity, database records, secure drafts and Storage objects through an idempotent auditable process.
- **PV-06:** Backup/restore, monitoring, incident response and recovery exercises are required before public release.
- **PV-07:** Camera/location permissions require prominent purpose disclosure where applicable and only the minimum permission is requested.
- **PV-08:** Play Console declarations, Data Safety and health-feature classification must match actual behavior and wording.

### 7.19 Accessibility and usability

- **UX-01:** Target WCAG 2.2 AA-equivalent mobile behavior: screen-reader labels, logical focus, dynamic text, contrast, reduced motion and adequate touch targets.
- **UX-02:** Every flow has loading, empty, error, offline, retry and conflict states.
- **UX-03:** Advice uses plain language, expandable detail and clearly separates instruction, evidence, inference and personal observation.
- **UX-04:** Routine execution supports a hands-busy mode with large controls and optional device text-to-speech; voice recording/listening is not required for the first beta.
- **UX-05:** Avoid shame, fear-based ingredient language and manipulative purchase prompts.

## 8. Market-informed additions and disposition

Current products advertise AI photo analysis, daily routines, barcode/OCR scanning, climate-aware advice, progress reports and large catalogues. StrandCue should adopt useful interaction patterns while rejecting unsupported claims.

| Market pattern | StrandCue decision |
|---|---|
| AI predicts porosity/damage from one photo | Reject for initial product; unsupported and risks medical/precision claims |
| Monthly/weekly progress photos | Adopt with private storage and consistent-capture guidance |
| Ghost-overlay camera alignment | Adopt as a practical non-diagnostic photo feature |
| Daily/weekly routine tracker and reminders | Adopt with user control and no punitive streaks |
| Barcode plus label OCR | Adopt as unverified discovery feeding human/reviewed matching |
| Universal ingredient/product safety score | Reject; show claim-specific evidence and limitations |
| Weather/climate-aware routine | Adopt after deterministic baseline with freshness and privacy controls |
| AI adviser chat | Adopt only as constrained explanation over deterministic results |
| Product-opened/expiry inventory | Adopt where exact label information exists |
| Visual “hair health score” | Reject unless a separately validated, explainable metric is approved |
| Controlled personal routine experiments | Adopt as non-clinical comparison with confounder visibility |
| Automatic environment attached to journal | Adopt with opt-in and coarse location |
| Stylist summary | Adopt as user-controlled export/share |
| Salon formulas and visit history | Represent through services/notes; broader professional workflow later |
| Voice/hands-free routine execution | Add accessible text-to-speech/large controls; defer full voice assistant |

## 9. Release stages and gates

### R0 — Technical Alpha

Current foundation: account, Passport, services, Shelf, Tools, activities, consent, export and deletion. It is not marketed as the complete StrandCue experience.

### R1 — Guided Founder Alpha

One reviewed Today vertical slice, deterministic engine, explanations and execution for founder scenarios. No broad claims.

### R2 — Guided Private Beta

Heat Coach, wash/treatment truth, Cue Check, personal summaries/ranking, reviewed initial catalogue and complete security/device acceptance.

### R3 — Visual and Context Beta

Private photos/comparison, reminders, environmental context and Routine Audit.

### R4 — Discovery Beta

Barcode/OCR/import queue, product comparison, reformulation alerts and broader South African catalogue.

### R5 — Public Release Candidate

Constrained explanations, accessibility audit, POPIA/legal review, monitoring, backup/restore drill, Play declarations, closed-test evidence and staged-rollout plan.

## 10. First acceptance scenarios

1. **Fine, curly, frizz-prone, highlighted, humid day:** recommends an owned-product roller-set/lower-direct-heat route, identifies overlapping products and explains omissions.
2. **Treatment at wash 2 of a 4–6 range:** does not mark due; generating a plan does not advance count.
3. **Treatment at boundary with uncertain wash history:** asks for history or returns limited `needs_input`; does not invent a due date.
4. **Unknown manual heat protectant:** can be logged as used but cannot satisfy a verified protection prerequisite.
5. **Conflicting hard directions:** returns conflict and safe fallback/no plan.
6. **Negative personal outcome:** lowers ranking among eligible options but cannot admit an excluded option.
7. **Corrected backdated wash:** recomputes current due state without changing an old completed protocol.
8. **Photo comparison:** aligns optional overlay and shows context without claiming improvement or diagnosis.
9. **Weather unavailable:** retains a usable base plan and labels weather advice unavailable/stale.
10. **Product reformulated:** historical plans preserve old version; new generation uses reviewed new version or blocks pending review.
11. **Account switch:** no prior owner history, drafts, photos or signed URLs remain visible.
12. **Deletion:** removes Auth, rows, drafts and photos; repeated worker execution remains safe.

## 11. Non-goals for the first public release

- Medical diagnosis or treatment.
- Hair-loss counting, regrowth measurement or scalp-disease detection.
- Automatic diagnosis from photos.
- Autonomous rule/product-fact publication by AI.
- Marketplace, checkout, subscription requirement or advertising-led recommendations.
- Public profiles, social feed, direct messaging or raw public reviews.
- Salon booking/management or professional certification.
- Perfect coverage of every product, tool, country or hair scenario.
- A universal ingredient toxicity score or unsupported fit percentage.
- Full offline generation using potentially stale authoritative content.

## 12. Required planning decomposition

This specification must be implemented through separate approved plans:

1. Product authority, navigation and Technical Alpha relabel.
2. Recommendation domain engine and rule governance.
3. Today protocol persistence and execution.
4. Heat events, wash counting and treatment programmes.
5. Cue Check, personal summaries and ranking.
6. Private progress photos and media lifecycle.
7. Reminders, weather/travel context and calendar.
8. Routine Audit and product comparison.
9. Barcode/OCR/import discovery and moderation.
10. Constrained AI explanation and follow-up.
11. Content catalogue, safety review and operational tooling.
12. Whole-system beta verification and Play release.

No agent should attempt all twelve plans in one branch or one unattended run.

## 13. Open decisions for product-owner review

1. Confirm whether progress photos are required for the first private beta or the following beta.
2. Confirm the initial rule-coverage cohort and exact founder scenarios.
3. Confirm whether stylist-summary sharing belongs in private beta or later.
4. Confirm whether reminders should be included before photos.
5. Confirm whether automatic coarse-city weather may be fetched by default after the user saves a city, or only after a separate opt-in.
6. Confirm whether product prices/local retailers are informational only or part of comparison ranking after suitability is fixed.
7. Confirm the intended monetisation model; it must not influence the decision engine.
8. Obtain reviewed safety-escalation wording before implementing red-flag flows.

## 14. Research references

- Google Play listings and official sites for Hair Explained, Kera and comparable personalized hair products: photo analysis, routine tracking, product scanning and progress tracking.
- My Hair Weather: environment-aware hair forecasts and recommendations.
- HadaBuddy and Skora: barcode/OCR discovery, owned shelf, conflict detection and climate-aware routines in adjacent beauty products.
- Google Play Health Apps declaration and Health Content policies: declarations, medical-claim boundaries, privacy policy and camera/location disclosure.
- Supabase official security, RLS and Storage signed-URL guidance: private object ownership and access controls.

Market claims are competitor-reported capabilities, not validation of their scientific accuracy. StrandCue decisions above use them only as interaction-pattern evidence.

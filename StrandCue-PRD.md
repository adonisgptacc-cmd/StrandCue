# StrandCue — Product Requirements Document

> **SUPERSEDED — historical version 1.0.** Use [StrandCue PRD v2](StrandCue-PRD-v2.md) and [Phase 1 Build Specification](docs/PHASE_1.md) for current work. The MVP phase assignments below are obsolete; they do not authorise building recommendations, Today’s Protocol or Heat Coach in Phase 1.

Version 1.0 • 6 September 2026 • Developer handoff baseline

**Positioning:** Your hair. Your products. Your next best step.

## 1. Document authority and source coverage

This document consolidates the retrieved “Create Haircare PRD” message and the current commissioning request. The latest explicit requirement—Supabase email/password authentication, a username, an immutable Supabase UUID, and mobile deep-link password recovery—supersedes any earlier authentication proposal. Requirements use **MUST**, **SHOULD** and **MAY** in their usual mandatory, recommended and optional senses.

**Source limitation:** The conversation reader returned only the first 20,000 characters of the source message, ending at “17. Product comparison”; it reported no older pages. Browser access required a login. Consequently, this document covers all available source requirements and every topic in the current request, but cannot certify incorporation of unseen text. Additional numeric limits, operating policies, algorithms and phase assignments below are **proposed implementation defaults**, not quotations from missing notes. They form a coherent build baseline and must be reconciled if the remaining source becomes available.

**Readiness:** Engineering can implement the application foundation, contracts and synthetic rule fixtures from this document. Publishing live product/heat recommendations requires the content and release gates in sections 22–24. This is a product specification, not validation of individual hair-product claims, clinical guidance, or trademark clearance.

## 2. Capability, users and intended outcomes

StrandCue is a South Africa-first, brand-neutral, personalised hair-care decision engine. It answers: **“Given my hair, what I have done to it, the products and tools I own, and the result I want today—what exactly should I do?”** Phase 2 adds current weather to that decision.

The decision chain is person → Hair Passport → current condition and history → My Shelf → My Tools → desired result → applicable evidence and constraints → ordered protocol → actual execution → feedback. Hair texture alone cannot determine a protocol.

Primary users are adults managing their own hair, including straight, wavy, curly and coily hair; different thicknesses and densities; natural, coloured, highlighted, relaxed and otherwise chemically treated hair. User #1 is the founder in Durban, with their actual chemical history, shelf, tools and successful routines. That case proves the workflow, not universal product suitability.

The app MUST be able to say that existing products are sufficient. It MUST prefer a feasible owned-product routine over an unnecessary purchase. It MUST NOT privilege a brand, affiliate commission, popularity or premium price over suitability. Prices, retailers and commercial relationships never enter the MVP decision engine.

Desired outcomes:

- Users understand the next steps, order, timing, product due status and styling alternatives.
- Conflicting instructions and unnecessary repeated heat are reduced through explicit constraints.
- Users can see why a step was selected and distinguish instructions, inference and personal experience.
- Completed routines and honest feedback build a useful personal record.
- Developers can reproduce every recommendation from its versioned inputs.

## 3. Scope decisions and resolved contradictions

| Earlier tension | Authoritative resolution |
|---|---|
| One screen versus multiple core features | Today is the primary surface; authentication, Passport, Shelf, Tools, history and feedback are necessary supporting flows. No standalone social or shopping surfaces in MVP. |
| 20–30 products versus any product/thousands | Seed 20–30 verified exact products. Permit any private manual entry. Exact product-specific recommendations require verified applicable facts. Catalogue scale is later. |
| Brand-specific prototype versus neutral engine | Founder products are fixtures only. Rules attach to exact product versions and capabilities, never hardcoded brand preference. |
| Weather in the vision versus “then add weather” | MVP stores optional city and user-reported humidity sensitivity; it does not fetch or imply current weather. Live weather is Phase 2. |
| AI personalisation versus critical hard rules | Deterministic TypeScript rules own selection, order, frequency and safety. Template explanations ship first. Optional AI cannot modify decisions. |
| Evidence A–H versus manufacturer directions | A–H describes evidence provenance/strength, not an executable priority ladder. Applicable official directions constrain product use even though classified C. |
| “92% fit” examples versus unsupported precision | MVP shows reasons and high/moderate/limited confidence, not percentages or claims of predictive accuracy. Future fit scores need calibration and a separate specification. |
| GREEN heat signal versus proof of safety | GREEN means no configured contraindication was found with adequate inputs; it is not a guarantee or an instruction to use heat. “Not needed” is a separate recommendation. |
| Learning from outcomes versus changing hard facts | Personal history can rank eligible alternatives; it cannot change official waits, exclusions or safety boundaries. |
| Six initial entities versus production needs | Six conceptual domains remain; normalised ownership, claims, versions, execution and consent tables support them. |
| Optional photos versus smallest useful MVP | Photo-free MVP. Private shelf and outcome photos are Phase 2 with storage/privacy controls. No photo diagnosis. |
| Old authentication ideas versus latest model | Email/password is the only MVP login. Username is a handle, UUID is identity. No username-to-email lookup, magic-link login, phone login or social login. |

## 4. Delivery phases and non-goals

| Phase | Deliverables | Exit condition |
|---|---|---|
| 0 — Founder prototype | GitHub `strandcue` project; Expo iOS/Android development builds; Supabase development environment; Passport/Shelf/Tools; deterministic engine; curated founder fixtures; basic history and feedback | Wash 1/2/3, treatment-due, roller-set and maintenance scenarios reproduce reviewed expected outputs; no App Store release required |
| 1 — MVP private beta | Production-quality auth/recovery; all MVP requirements; 20–30 reviewed products; transparent evidence; Heat Coach; actual-use logging; simple personal summaries; RLS, export/deletion, monitoring and recovery | All release acceptance tests pass, content approved, invited users complete core flows |
| 2 — Context and learning | Weather; private optional photos; deterministic personal-outcome ranking; consented aggregate community outcomes after privacy/sample gates | Separate experiments and privacy tests demonstrate useful additions without hard-rule regressions |
| 3 — Discovery and commerce | Larger catalogue; barcode/photo/ingredient scanning; URL import; verified comparison; South African availability/pricing; optional shopping/affiliate links | Proven core retention, catalogue operations, claim accuracy and commercial independence gates |
| 4 — Optional extensions | AI wording, broader regions/languages and other validated needs | Separate approved requirements; never assumed dependencies of MVP |

**MVP non-goals:** marketplace, checkout, subscriptions/billing, salon management, professional booking, public profiles, messaging, social feed, thousands of preloaded products, autonomous product scraping, ingredient-based diagnosis, hair photo analysis, medication recommendations, hair-loss treatment, clinical outcomes, full offline protocol generation, native platform codebases maintained separately, and opaque AI recommendation generation.

Not all catalogue metadata must be populated at launch. Missing fields remain unknown; the engine cannot infer negative claims from missing data. Do not delay the useful decision engine to build exhaustive ingredient science or commerce integrations.

## 5. Actors, navigation and user journeys

Actors: account owner; content editor; content reviewer/publisher; operator handling incidents and privacy requests. Editor/reviewer access is separate from consumer identity and server-controlled. MVP may use reviewed seed changes and restricted operator tools instead of a custom admin application.

Navigation: **Today**, **My Shelf**, **My Tools**, **Wash History**, **My Strands** (Hair Passport). **Cue Check** is the feedback flow. **Evidence** opens from a recommendation. Account, privacy and help sit in settings. Labels remain consistent; “Product Cabinet” is the internal domain and “My Shelf” the user-facing name.

First visit: Welcome → create account → verify email → claim username → complete essential Passport questions → add products/tools → select today's goal → see protocol → start → log actual steps → complete session → Cue Check. Optional fields and feedback can be skipped. Save onboarding progress and explain which missing inputs prevent a particular recommendation.

Returning visit: refresh current condition and goal → confirm available products/tools and any unlogged wash/heat → generate → inspect reason/alternatives → execute → record deviations → feedback. Never require recreating a profile to obtain the next protocol.

## 6. Functional requirements: identity and account

**AUTH-01 — Identity.** Supabase Auth creates `auth.users.id` (UUID). `profiles.id` references it one-to-one. Every owner reference uses this UUID. Email and username are changeable attributes, never relational keys. Do not store passwords, password hashes or reset tokens in application tables. Email is private and authoritative in Supabase Auth.

**AUTH-02 — Signup.** Collect email/password; explain email verification. Proposed password policy: minimum 12 characters, permit spaces, paste and password managers; no arbitrary composition rules. Align client validation with configured Supabase limits. Require a verified email and claimed username before the first persisted protocol. A resumable profile completion step handles signup/profile partial failures.

**AUTH-03 — Username.** Required handle, 3–24 lowercase ASCII letters, digits or underscores; trim and normalise before validation; reserve system/admin/brand-impersonation names. Store a unique normalised column with database enforcement. Claim/update in a transaction, not a client availability check. Availability is advisory; a race returns `USERNAME_TAKEN` with entered data preserved. Limit changes to once per 30 days (proposed default). No public user directory in MVP. Do not accept username in the login field or expose the associated email.

**AUTH-04 — Sign in/out.** Email/password sign-in; generic credential errors; preserve sessions securely across restart; refresh while app is active and recover gracefully on expiry. Logout clears tokens, owner data caches and pending sensitive UI. Pending unsynced records prompt a local save/discard choice before voluntary logout. Account switching must never show the previous owner's data.

**AUTH-05 — Recovery.** Request recovery using email and show the same response whether the account exists. Use Supabase recovery APIs; do not invent a reset service. Mobile callbacks open the dedicated reset screen on cold start or while running. After validated recovery, submit a new password, confirm success, revoke other refresh sessions as supported, clear recovery state and return to sign-in. A failure must not claim the password changed.

Implement email/password and recovery against the pinned SDK and documented APIs. Supabase supports password-reset requests followed by authenticated password updates. [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).

**AUTH-06 — Deep-link contract.** Register `strandcue` scheme for development builds and allowlist exact environment-specific recovery/confirmation routes. Before public release, configure an owned HTTPS domain with verified iOS Universal Links and Android App Links; the domain itself is a release decision. Never use unrestricted production redirect wildcards. Separate confirmation and recovery purposes, reject unexpected hosts/routes and consume callbacks once. No tokens/URLs in analytics, logs or crash reports.

Use PKCE for the chosen mobile flow, persist the verifier securely, and exchange a received code once. Opening a link on a different device or after losing the verifier must produce a clear “request a new link on this device” path; do not claim universal cross-device recovery. Test the configured email template and SDK flow end to end; don't mix implicit-token parsing and PKCE callbacks. App-not-installed links show a minimal HTTPS recovery help page without third-party trackers. [Supabase mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

**AUTH-07 — Lifecycle.** Support verified email change, password change, export and deletion. Do not require access to the old device to sign in normally. Rate-limit signup, resend, recovery, login and username probes. Use production email delivery configuration and test deliverability before beta. Unknown, expired, reused and scanner-consumed links all offer a safe retry; they never open a reset form merely because a route says “recovery.”

## 7. Hair Passport

**HP-01 — Structured profile.** One active Passport per account in MVP. Capture:

| Group | Fields and allowed semantics |
|---|---|
| Natural hair | Texture: straight/wavy/curly/coily/unknown; optional mixed texture; thickness: fine/medium/coarse/unknown; density: low/medium/high/unknown |
| Current condition | Dryness, frizz, breakage, shedding, tangling, split ends, stiffness, dullness, greasy scalp, dry scalp, hair loss/thinning, heat/chemical/colour damage, humidity reversion; multiple selection |
| Damage | Self-reported none/mild/moderate/severe/unknown plus observation date; never represented as a clinical measurement |
| Chemical history | Highlights, bleach, permanent colour, semi/demi colour, keratin, relaxer, perm, Brazilian treatment, other straightening; date or date precision, frequency, area treated, whether still present, optional exact treatment |
| Styling habits | Natural curls, blow-out, roller set, wrap/swirl, flat iron, curling iron, hood dryer, air dry; typical frequency |
| Sensitivity/preferences | Humidity sensitivity, known personal product reactions/avoidances, preference to minimise heat, desired outcomes |
| Context | Country default ZA, optional city, timezone default Africa/Johannesburg; budget optional and reserved for later comparison |

**HP-02 — Unknown is valid.** Do not force guesses about thickness, density, porosity, treatment dates or temperature. Distinguish unknown, not applicable and explicitly none. Porosity is optional later; never require home tests or infer it from photographs. MVP essential inputs are texture or unknown, concerns or none, chemical history or unknown, desired goal and relevant product/tool availability.

**HP-03 — Temporal accuracy.** Persist current profile revision and chemical events. Ask for updates when a new treatment occurs or condition changes. Old chemical processing does not automatically disappear after an arbitrary number of days; use still-present/area data. Store date precision and do not turn “about June” into an exact date.

**HP-04 — Safety relevance.** Request targeted missing information before affected heat/chemical-sensitive steps. Inadequate inputs yield limited confidence, a lower-risk alternative, or `needs_input`; not silent defaults. Free text is optional and not parsed into hard safety facts in MVP.

## 8. Product Cabinet / My Shelf and content governance

**SHELF-01 — Own any product.** Search verified catalogue or add brand, exact name and category manually. Categories include shampoo, clarifier, conditioner, mask, bond/protein treatment, leave-in, heat protectant, anti-humidity, styling cream, mousse, gel, serum, oil, scalp, colour and other. Private manual records do not modify global knowledge. Mark items available, out of stock or archived. Archiving preserves session history.

**SHELF-02 — Exact identity.** Catalogue identity includes brand, exact product name, variant, market and formulation/version where known. A similar name, barcode or same brand does not establish equivalence. Users confirm matching before linking an existing manual entry. Preserve the original entry and match audit. Product reformulations create new knowledge versions.

**SHELF-03 — Unknown products.** Manual items may be stored and logged as actually used. They are labelled unverified and excluded from exact treatment scheduling, compatibility and heat-protection assertions. A protocol may offer a generic non-product-specific alternative with clear limits; it cannot fill a missing verified prerequisite with an unknown product. Request label/manufacturer verification as a content task, not a promise of instant recognition.

**CAT-01 — Knowledge fields.** Each published product version contains applicable category/purpose, market, directions, rinse/leave-in status, order constraints, waiting time, frequency and counting unit, activation requirements, explicit incompatibilities, supported heat/humidity/colour claims, chemical-treatment considerations, evidence references and last review date. Ingredient list and tagged proteins, silicones, oils/butters, humectants, cleansing and conditioning agents may be unknown. Ingredient presence does not prove a product's efficacy or justify a universal protein/ingredient warning.

**CAT-02 — Claim-level evidence.** Claims, not whole brands, receive evidence records. Record exact proposition, applicability, source type/URL/title, publisher, publication date if known, retrieval date, product version, supporting excerpt or permitted snapshot reference, limitations, reviewer and status. “No evidence found” is different from evidence of no effect. Do not label a marketing page as independent science.

**CAT-03 — Publishing.** Draft → in review → published → superseded/withdrawn. A reviewer checks exact identity, current directions and applicability. Published versions are immutable. A new version requires rule regression tests and a change reason. Before public beta, a second person approves safety-related content; founder prototype can use explicitly labelled test fixtures. Review active critical instructions at least every 180 days (proposed operational interval) and immediately on reported changes.

**CAT-04 — Retraction.** Withdraw unsafe or disputed rule/product versions centrally. New generation excludes them. Open protocols are marked stale or stopped as appropriate; historical outputs remain auditable. Routine stale dates trigger review/limited confidence; withdrawn critical facts block affected recommendations. Content operators see a verification queue; no silent AI auto-publication.

## 9. Evidence hierarchy and confidence

Preserve the source taxonomy:

| Code | Classification | Required interpretation |
|---|---|---|
| A | Strong scientific evidence | Relevant peer-reviewed human/laboratory evidence; specify which and why considered strong |
| B | Moderate scientific evidence | Smaller or indirect studies; explain limitations |
| C | Manufacturer-verified instruction | Exact applicable official usage directions; not independent efficacy proof |
| D | Formulation-based inference | Plausible ingredient/formulation reasoning, clearly labelled inference |
| E | Professional consensus | Documented professional practice with limited direct trials |
| F | Consumer evidence | Consistent substantial consumer reports; source and bias disclosed |
| G | Limited anecdotal evidence | Small numbers of reports, including early personal observations |
| H | Marketing claim only | No meaningful independent support established |

**EVD-01.** Store evidence type and an independent strength/applicability assessment; these letters are not mathematical scores. An A laboratory study about an ingredient cannot override an exact product's C directions. Professional opinion and community ratings cannot waive a hard restriction. When credible safety evidence conflicts with official directions, suspend the affected use for review rather than choosing a letter automatically.

**EVD-02.** Every generated step or exclusion has a reason code, readable reason, rule/version IDs and supporting claim IDs. User-entered preferences are labelled as such. “Why this?” shows relevant sources, last checked date, uncertainty and alternatives. Never say “scientifically proven” for F/G, personal outcomes or community results.

**EVD-03.** MVP confidence is deterministic and qualitative with two separate dimensions. **Instruction confidence:** verified only when all applicable critical facts and required safety inputs are complete; otherwise affected steps are blocked or require input. **Suitability confidence:** evaluate in order—Limited when any selected suitability factor lacks adequate applicable information; otherwise Moderate when any factor relies on inference or uncertain non-critical history; otherwise High when every selected factor has applicable reviewed support and inputs are complete. The first matched category wins, making categories mutually exclusive. Sparse personal observations are shown separately and do not imply a prediction about whether the user will like the result. No statistical probability is implied; a low-confidence label never permits an unsupported critical instruction.

## 10. My Tools and Heat Coach

**TOOL-01.** Add brand, model, type, available settings, adjustable temperature yes/no/unknown, direct-contact heating surface yes/no/unknown, wet/dry-use restrictions, manufacturer source if known and optional wattage. Types: dryer, heated-air brush, air styler, flat iron, curling iron, hot comb, hood dryer, steam straightener, unheated/heated rollers. Distinguish individual exact models.

**TOOL-02.** Wattage is not temperature. “Heated air” is not heat-free. A steam tool is not automatically approved for wet hair. Unknown temperature remains unknown; do not invent numeric settings or assume all devices within a brand behave alike.

**HEAT-01.** Evaluate every styling day, including non-wash sessions. Inputs: current breakage/brittleness/stiffness, self-reported loss of curl reversion, relevant chemical history, recent and cumulative recorded heat, tool setting/temperature, passes, hair wet/dry state, planned combination of tools, protectant requirements and desired result. Missing logs mean exposure is unknown, not zero.

**HEAT-02.** Output GREEN/AMBER/RED plus plain-language label, reasons and feasible owned-tool alternatives. RED prevents the engine recommending direct-contact heat. AMBER favours reduced exposure and alternatives. GREEN requires complete relevant inputs and no matched restriction. Independently output `direct_heat_necessity = unnecessary | optional | required_for_selected_style | undetermined`; the engine can say “You probably do not need the flat iron today.” User goals cannot override exclusions.

**HEAT-03.** Never publish universal safe temperatures, “safe passes,” bleach waiting periods or a pseudo-scientific heat-dose equation without approved content. MVP conservative policy defaults: active reported substantial breakage/brittleness or flagged reaction blocks direct-contact recommendations; uncertain relevant treatment or tool information prevents GREEN; an existing adequate air/roller option is ranked ahead of added contact heat. These are product guardrails requiring reviewer sign-off, not clinical thresholds.

**HEAT-04.** Store heat events by method/tool, event time, known setting, passes if reported, duration if known and provenance. Show separate counts for contact and air heat over 7 and 30 days; these are descriptive history, not a validated damage score. Numeric threshold rules stay disabled until approved. A user may honestly log an action that the engine advised against; this does not reclassify the action as recommended.

**HEAT-05.** If an anti-humidity treatment requires heat and available heat conflicts with a restriction, omit that treatment and explain the alternative. RED for direct-contact heat does not automatically mean air heat is appropriate; evaluate the alternative's own constraints.

## 11. Today's Protocol: decision and execution

**TODAY-01 — Request.** Select wash day or styling/refresh day and one primary goal: natural curls, stretched hair, smooth with body, blow-out, roller set, very straight, humidity protection, or maximum damage protection. Optional preferences include avoiding heat and time available. Ask only material missing questions. Capture current concerns before generation.

**TODAY-02 — Output.** Show goal, applicable treatment-cycle status, product due/not due/unknown status, Heat Coach, ordered actionable steps, waits/timer controls, rinse instructions, application area/quantity only when supported, selected tool/settings when verified, exclusions, alternatives and confidence. “Guardian Angel not due” belongs in a status/explanation panel, not as a physical action in the ordered step list.

**TODAY-03 — Feasibility.** Use available owned products and tools. If the selected goal cannot be supported, explain the missing prerequisite and offer a feasible alternative goal or an explicit no-protocol outcome. Do not automatically tell users to buy a product. Never silently substitute another formula or tool.

**TODAY-04 — Lifecycle.** Protocol states: generated → active → completed, or generated/active → abandoned. Additional validity flag: valid/stale/withdrawn. Regeneration creates a new protocol with a parent link; it never overwrites past output. State changes and actual execution are separate from the recommendation snapshot.

**TODAY-05 — Execution.** Starting does not mean completing. Mark actual product use, skips, substitutions, timing deviations and heat events. Wait timers begin on user-confirmed application; persist start/end timestamps and resume after backgrounding. Timer completion cannot prove correct application. Users can record that they did not follow the wait; such a session remains valid history but is excluded from compliant-routine outcome summaries.

**TODAY-06 — Freshness.** Generation records profile/history/Shelf/Tools revisions and content versions. Recheck on start. Relevant changes require regeneration; an actively withdrawn rule stops affected guidance. A changed cosmetic label alone need not invalidate a routine. Cache reading is allowed offline with generation time and stale-state warning; generating a new authoritative protocol requires server access in MVP.

**TODAY-07 — Active/offline validity.** Revalidate active protocols on foreground/resume and immediately before advancing into a treatment application or heat step; a new relevant profile/chemical event pauses affected steps. When connectivity is absent, cached instructions are historical read-only guidance labelled “current validity cannot be checked”; do not enable a new guided treatment/heat step until validation succeeds. Existing timers and actual-use logging remain available. The app cannot detect a newly issued server withdrawal while offline and must not imply that it can. On reconnect, check withdrawals before resuming guidance. Realtime notification may improve responsiveness but cannot replace these checks.

## 12. Deterministic rules engine contract

**ENG-01 — Pure core.** Implement a shared, pure TypeScript evaluator taking a normalised snapshot, explicit evaluation time and pinned ruleset. It returns a canonical decision object without network calls, hidden clock reads, randomness or AI. Identical canonical inputs and versions produce identical decisions. Request IDs and generation timestamps are response metadata, excluded from equality tests.

Pipeline:

1. Validate schema, ownership and input revisions; resolve unknowns explicitly.
2. Apply medical-boundary and active-reaction restrictions.
3. Load published applicable exact product/tool facts and derived confirmed history.
4. Determine treatment state and shampoo-based due status.
5. Filter incompatible or unsupported candidates using hard constraints.
6. Evaluate heat feasibility and eligible lower-exposure alternatives.
7. Select a feasible goal template; rank eligible candidates using fixed suitability/preference rules.
8. Build an order/dependency graph, insert explicit waits/rinses and validate prerequisites.
9. Topologically sort with stable tie-breaking; reject cycles or unsatisfied requirements.
10. Return steps, omissions, alternatives, reasons, confidence and full audit versions.

**ENG-02 — Rule schema.** A rule includes immutable ID/version, scope (product/tool/global), applicable product version/market, condition expression, effect, hard/advisory status, priority within its class, evidence references, effective dates, reviewer, tests and withdrawal status. Allowed effects: require, exclude, order-before/after, wait, rinse/no-rinse, frequency, activation, heat restriction and advisory preference. Use a typed whitelist DSL, not arbitrary evaluated JavaScript stored in the database.

**ENG-03 — Conflict resolution.** Active medical/safety blocks constrain everything; official applicable product/tool prerequisites constrain candidate eligibility; approved scheduling rules then apply; preferences and personal outcomes rank survivors. Two incompatible hard constraints yield `RULE_CONFLICT` and a feasible fallback or no protocol. Numeric priority cannot silently waive a hard rule. Absence of a documented incompatibility does not assert tested compatibility.

**ENG-04 — Ranking.** MVP ordered factors: satisfies chosen goal and constraints → matches explicit profile suitability → respects user heat/weight preferences → minimises unnecessary additional products/heat → stable product UUID tie-break. Only use curated suitability facts; do not infer “protein overload” from ingredient counts. Personal summaries are visible in MVP but automated personal ranking begins Phase 2. Advertising variables are excluded from evaluator types.

**ENG-05 — Treatment ranges.** A manufacturer range such as 4–6 washes is stored as a range, not an unexplained single number. Each treatment programme needs an approved selection/transition policy. If continuation inside a range requires reassessment, ask at the minimum; never invent a restart/maintenance schedule. If no approved continuation policy exists, return `needs_input` or withhold the affected schedule.

**ENG-06 — Founder fixtures.** Named examples (K18, OSMO/Guardian Angel/Straight Fluid, BaByliss, Revlon, GHD) MUST be treated as unverified source examples until exact products/models and directions are reviewed. A synthetic verified fixture may encode “no conditioner before, wait 240 seconds, leave in, initial 4–6 eligible washes” for engine tests. Passing that fixture is not evidence that all variants share these directions. No source example is inserted into live published knowledge automatically.

## 13. Wash counting, treatment programmes and history

**HIST-01 — Event definition.** A wash session records a real wash at `occurred_at`. A qualifying shampoo event means the user confirmed shampoo cleansing; two lathers in one wash count as one event by default. Rinse-only, co-wash and styling-only events do not count as shampoos unless the exact rule explicitly defines another counting basis. Rules must name their unit: shampoo_session, wash_session, application or calendar_time.

**HIST-02 — Actual events.** Only confirmed actual qualifying events advance state. Generating/viewing/starting a plan, running a timer or submitting feedback does not. Product application is confirmed separately. Partial or abandoned sessions can still contain a confirmed shampoo or heat exposure; these must count. Save actual events through idempotent mutations so abandoning a protocol does not erase them.

**HIST-03 — Due semantics.** Let `c` be confirmed qualifying shampoos strictly after the most recent confirmed application of product P and before the proposed session. If today includes a planned shampoo, evaluate `prospective_count = c + 1`; otherwise use `c`. Never count the application wash itself as an elapsed shampoo after application. For an illustrative 3–4-shampoo range: 0–2 = not due, 3 = eligible, 4+ = due according to the approved scheduling policy. “Due” means schedule eligibility, not proof a product has stopped working. A default of recommending at 4 must be explicitly approved per product; high humidity cannot move use outside official constraints.

**HIST-04 — Programme state.** not_started → initial → reassessment/maintenance → paused/completed. Count qualifying product applications during the initial programme, and track any intervening shampoo without application separately. If instructions require consecutive shampoos and one is missed, flag interrupted and consult an approved resumption rule; do not automatically restart. Maintenance begins only via an approved transition. Non-wash refresh use cannot silently advance wash-based treatment cycles.

**HIST-05 — Corrections.** Permit backdated events and edit/void corrections with an audit trail. Disallow future actual events. Stable ordering is `(occurred_at, event_id)`; date-only ambiguity affecting due state requires clarification. Recompute derived counters and mark affected future/open plans stale. Completed protocol snapshots remain unchanged; corrected actual history is displayed distinctly. Do not physically delete events needed for routine edit history; account deletion still purges personal history.

**HIST-06 — Missing history.** Ask for the last application and qualifying washes since, allowing an explicitly user-estimated baseline. Unknown remains unknown. Display that a schedule relies on estimated history. Concurrent device submissions use per-user state revision checks and idempotency keys; retries cannot create extra washes or applications.

**HIST-07 — Logical uniqueness.** A protocol can have at most one execution session in MVP; repeating it creates a fresh validated protocol/session. `session.create` returns the existing session for that protocol. Protocol-linked actual events carry a server-defined logical slot such as `shampoo`, `step:<step_id>:application` or `step:<step_id>:heat`; unique `(session_id, logical_slot)` prevents two devices using different client IDs from recording the same action twice. Additional real heat/application events require an explicit extra-event flow and their own stable ID. Manual sessions have no automatically provable real-world identity: retries of the same client operation are deduplicated, but independently entered similar events require a visible possible-duplicate review and user correction; never silently merge two real washes.

**HIST-08 — Product continuity.** Archiving a shelf item does not reset its programme. Re-adding the same verified product/version offers restoration of its stable shelf identity. Linking an unverified record to a verified product preserves actual events and records the match; historical applications remain user-reported unless separately confirmed. A replacement bottle of the same exact formula can continue the programme after user confirmation. A different formula/version does not inherit progress automatically: apply a reviewed equivalence/migration policy or pause for reassessment. One active programme per owner and canonical treatment identity prevents duplicate shelf rows creating parallel progress. All programme remapping is transactional and auditable.

## 14. Cue Check and personal evidence

**FB-01.** After a session, offer 1–5 softness, smoothness, frizz control, shine and manageability; breakage less/same/more; feel too dry/balanced/too heavy or coated; repeat yes/no; optional notes. Define anchors: 1 poor, 5 excellent. Allow skipped answers; missing is never zero. Target completion under 60 seconds.

**FB-02.** Ask style longevity later or let users return to enter days lasted. Distinguish “still lasting” from final longevity. Validate non-negative values and elapsed-time plausibility without blocking ordinary correction. Record time of observation and whether the routine was followed. No fabricated reminders or push permissions; MVP uses an in-app pending-feedback prompt.

**FB-03.** One editable feedback record per session, with updated timestamp/revision. Product adverse-reaction reports use a dedicated safety flow and are not buried in optional notes. Feedback never changes product directions.

**PE-01 — MVP.** Display personal routine summaries with number of sessions, dates, mean ratings per answered measure, repeat count/denominator and final longevity sample. Group by actual product versions, sequence, goal and heat method, not merely protocol title. Mark partial/noncompliant routines separately. Fewer than three comparable sessions display “early observations.” Three is a display default, not proof of causation.

**PE-02 — Phase 2.** Personal-outcome ranking is deterministic, opt-out and explainable. Only rank already eligible routines. Proposed eligibility: at least three comparable completed compliant sessions; retain sample counts and conflicting results. Use repeat preference first, then the goal-linked rating with stable tie-break; do not hide breakage reports behind a favourable average. New adverse signals trigger the approved safety review rule. Reset learning without deleting raw history. Version the ranking policy.

## 15. Community outcomes and weather — Phase 2

**COM-01.** Separate, explicit opt-in to use structured outcomes for community aggregation; no public identity, raw notes, photographs, exact location or treatment dates. Never publish user-level records. Label outputs “StrandCue community outcome data,” not clinical evidence.

**COM-02.** Aggregate over pre-approved coarse cohorts such as texture, chemical-treatment status and goal. Proposed minimum publication threshold: 30 distinct consenting users per cohort, with suppression of small cells and complementary cells. Threshold alone does not guarantee anonymity; prohibit arbitrary filter combinations/differencing and perform disclosure review. Count users rather than allowing a prolific user to dominate. Publish date range, unique users, observation count, denominator, missing-data handling and selection bias.

**COM-03.** Define improvement only from a comparable paired baseline; without one say “rated frizz control 4–5,” not “improved.” Never attribute a multi-product routine's outcome causally to one product. Withdrawal removes linkable contributions from future recomputations; distinguish truly irreversible anonymous aggregates in the notice. Community data can inform later ranking but never hard constraints.

**WX-01.** Optional city selection; coarse location sufficient. GPS is unnecessary and off by default. Weather service runs server-side with provider credentials outside the app. Store observed/forecast time, provider, city/grid, humidity, temperature and availability; snapshot exactly the values used.

**WX-02.** Humidity modifies only approved humidity-sensitive rules and eligible alternatives. It cannot require a product before permitted frequency or override heat restrictions. Proposed freshness: fetch/cache up to 60 minutes; after 3 hours label stale and do not treat as current. Provider failure/permission denial falls back to weather-independent generation. Do not label all Durban days humid or infer personal exposure from outdoor weather. Provider, licence and thresholds require Phase 2 approval.

## 16. Medical and product-safety boundaries

**SAFE-01.** StrandCue provides cosmetic routine organisation, not diagnosis or treatment. Hair loss/thinning and shedding may be recorded as concerns but must not produce diagnoses, medication suggestions or promises of regrowth. Avoid “repairs all damage,” “safe for everyone” and health guarantees.

**SAFE-02.** Structured reports of an active scalp reaction, pain, burns, open sores or sudden concerning loss trigger reviewed escalation copy and suppress affected product/heat guidance. Severe acute reaction flows direct users to urgent help via locally reviewed copy. The precise triage text and trigger set require qualified review before release; the app does not assess severity from a photograph or free-text AI interpretation.

**SAFE-03.** Do not give at-home chemical-treatment mixing or application protocols in MVP. Manufacturer patch/strand-test directions may be linked where applicable, never invented or treated as a guarantee. A user's known reaction excludes the implicated exact product until explicitly corrected; do not infer a clinically confirmed ingredient allergy from one bad experience.

**SAFE-04.** Safety reports create an operator review item without automatically sending the user's private narrative to a manufacturer. A rule kill switch and a contact/support route must exist before inviting external users. False positives and uncertainty must yield usable, respectful copy, not blame or a claim that the hair is medically damaged.

## 17. Architecture and service ownership

**Fixed stack:** one Expo/React Native application for iOS and Android; TypeScript; Supabase Auth, PostgreSQL and Edge Functions; Supabase Storage when files enter scope; GitHub repository named `strandcue`. Select mutually compatible stable package versions at implementation time, pin them and commit the lockfile. This PRD does not prescribe unverified future version numbers.

Proposed monorepo boundaries:

| Module | Responsibility | Must not own |
|---|---|---|
| `apps/mobile` | Navigation, forms, accessibility, session adapter, protocol rendering/timers, local pending-operation queue | Authoritative eligibility, secret credentials, global catalogue publication |
| `packages/domain` | Shared schemas, enums, typed contracts, normalisation | Network/database clients |
| `packages/rules-engine` | Pure evaluator, conflict resolution, ordering, heat logic, fixtures | Auth, weather calls, AI, mutable global state |
| `packages/content` | Validated seeds, rule/evidence manifests, publication validation | Private user exports or personal production fixtures |
| `supabase/migrations` | Schema, constraints, grants, RLS, transactional routines | Dashboard-only undocumented changes |
| `supabase/functions` | Authenticated orchestration, generation, sensitive operations, external integrations | Unreviewed dynamic product facts |
| `tests` | Domain, integration, RLS, contract and mobile end-to-end tests | Production user data |
| `docs` | PRD, architecture decisions, content runbook, privacy/incident/restore runbooks | Secrets |

Direct Supabase Data API access is acceptable for owner-scoped simple reads/CRUD under RLS. Generation, treatment-affecting event mutations, username claims, export/deletion and publication use narrow server/RPC boundaries with explicit contracts. Avoid duplicating business logic across mobile and server.

Protocol generation runs authoritatively in an Edge Function. It validates the caller, reads owner data through appropriately scoped access, builds a consistent snapshot, calls the pure evaluator and commits the result only if the input revision remains current. On a revision race, retry once against fresh state; then return a conflict for the client to refresh. The client must not submit an authoritative `user_id`, confidence, counter or completed decision.

Use a per-user decision revision. Mutations affecting eligibility increment it atomically. The save step compares the expected revision, catalogue version and ruleset. Session mutation transactions lock the relevant user's state so concurrent operations cannot lose counters. Derived counters can be cached but are recomputable from actual events.

Development, staging and production have separate Supabase projects/configuration, redirect allowlists and secrets. GitHub pull requests run checks; release builds are traceable to a commit and content version. Never store real founder history as a public seed fixture. No service account keys in mobile builds or GitHub code; deployment secrets are scoped to protected environments. A CI migration smoke test builds a fresh database from committed migrations.

## 18. Logical data model and invariants

All primary IDs are UUID unless noted. Times use UTC `timestamptz`; display in the user's timezone. Use constrained enums/reference tables and checks, not unrestricted strings for business states. Personal tables include owner UUID, timestamps and revision. JSONB is allowed for immutable typed snapshots/DSL, not as a substitute for ownership constraints or queryable events.

| Entity | Key fields / relationships | Invariants and indexes |
|---|---|---|
| `profiles` | `id → auth.users.id`, `username_normalized`, locale, timezone, account_status, onboarding_state, decision_revision | PK is Auth UUID; unique username; active/deleting/deleted status; never duplicate email/password |
| `hair_passports` | owner, texture, thickness, density, damage_report, humidity_sensitivity, concerns, preferences, revision | Unique owner for active MVP Passport; enumerated unknowns; owner index |
| `chemical_events` | owner, passport, type, occurred_date, date_precision, frequency, area, still_present, supersedes_id | Owner matches Passport owner; index owner/date; corrections traceable |
| `styling_habits` | owner, method, frequency_value/unit | One per owner/method or explicit versioned replacement |
| `products` | catalogue identity: brand, name, category | Global read-only catalogue identity; no personal ownership |
| `product_versions` | product, variant, market, formulation_ref, structured_directions, ingredients, status, verified_at | Immutable published version; index product/market/status |
| `evidence_sources` | URL, title, publisher, source_type, retrieved_at, publication_date, permitted_snapshot_ref | Source metadata is not itself an approved claim |
| `claims` | product_version/tool_version nullable, proposition, evidence_code, applicability, limitations, review_status | At least one valid scope; immutable published revision |
| `claim_sources` | claim, evidence_source, support/contradict relation | Composite unique pair/relation |
| `shelf_items` | owner, product_version nullable, manual_brand/name/category, availability, matched_at | At least a manual identity or linked version; never user-edit catalogue; historical references retained |
| `tool_models` / `tool_versions` | exact model, type, capability and instruction fields, evidence refs, status | Curated optional reference catalogue; published versions immutable |
| `user_tools` | owner, tool_version nullable, manual identity, capabilities, availability | Unknown allowed; user claims cannot become verified tool facts |
| `rulesets` / `rules` | immutable version, status, DSL, scope, priority, hard flag, claims, reviewer | Published rules must pass schema + fixtures; index active/version; no arbitrary executable strings |
| `treatment_programmes` | owner, shelf_item, rule_version, state, baseline, baseline_provenance, start_date | Explicit initial/maintenance selection; derived progress recalculable |
| `protocols` | owner, parent_protocol_id, goal, session_kind, input_snapshot, input_hash, ruleset_id, decision_json, lifecycle, validity, decision_revision | Immutable decision payload; mutable lifecycle only through service; owner/time index |
| `protocol_steps` | protocol, owner, ordinal, action_type, shelf/tool refs, wait_seconds, claim/rule refs | Unique protocol/ordinal; cross-owner FK prevention; may be generated from decision JSON for display |
| `sessions` | owner, protocol nullable, kind, occurred_at, timezone, status, revision | Unique non-null protocol; manual sessions allowed; owner/time index |
| `actual_events` | owner, session, event_type, logical_slot, client_event_id, occurred_at, payload, provenance, supersedes_id, voided_at | Shampoo/application/heat/step events; unique active logical slot; corrections replace its effective value through service |
| `feedback` | owner, session, nullable ratings, breakage, feel, repeat, notes, longevity, still_lasting, observed_at | Unique session; ratings 1–5 or null; notes max 2,000 chars; owner FK match |
| `consents` | owner, purpose, policy_version, granted/withdrawn, recorded_at | Append-only decision trail; purpose-specific state derived; no bundled community consent |
| `safety_reports` | owner, session/product nullable, structured trigger, private notes, status | Narrow operator access with audit; no raw report in analytics |
| `operation_keys` | owner, operation, key, payload_hash, result_ref, created_at | Unique owner/operation/key; mismatched reuse rejected; 30-day retention minimum for retry keys |
| `audit_events` | actor, action, target, versions, time, redacted metadata | No passwords/tokens/raw notes; privileged writes only |
| `privacy_jobs` | owner, type, status, requested_at, completed_at, private output_ref | Resumable export/delete; narrow server control |
| Phase 2 additions | `weather_snapshots`, `media_assets`, `community_contributions`, `community_aggregates`, `personal_summaries` | Consent, freshness, private storage and suppression rules apply |

Use composite uniqueness such as `(id, user_id)` on owned parent rows and composite foreign keys `(parent_id, user_id)` on children, or equally strong ownership checks in transactional routines. A valid foreign UUID is not proof it belongs to the caller. Reject owner reassignment. Index every owner predicate and common owner/time, session and published-version lookup.

A protocol snapshot includes normalised Passport and relevant history facts, exact product/tool versions, relevant actual-event revision, current goal, evidence/ruleset version, explicit evaluation time and Phase 2 weather snapshot. It need not duplicate email or username. Store canonical input hash for reproducibility, not as an anonymisation claim.

Database constraints reject invalid ratings, negative waits, out-of-range humidity, invalid date precision, cross-owner links and invalid lifecycle transitions. Validate all imported seed content through the same schemas. User content never becomes trusted code or markup.

## 19. API and service contracts

These are **logical StrandCue operations**, implemented as named Edge Functions/RPCs or a small versioned router; they are not assertions about built-in Supabase endpoint paths. Publish OpenAPI/JSON schemas and generate shared TypeScript types. All personal operations require a validated session. Derive the owner from the authenticated context.

Success envelope: `{ data, meta: { requestId, schemaVersion, nextCursor? } }`. Error envelope: `{ error: { code, message, retryable, fieldErrors? }, meta: { requestId } }`. Do not return stack traces, SQL internals or another user's existence. Lists use cursor pagination (default 25, max 100).

| Logical operation | Input | Output / side effects |
|---|---|---|
| `profile.get/update` | Allowed profile fields, expected revision for update | Owner profile; cannot change ID, roles or account status |
| `username.claim/change` | Candidate, idempotency key | Normalised handle or conflict; atomic uniqueness and change-window enforcement |
| `passport.save` | Validated profile/chemical/habit changes, expected revision | New revision; invalidates relevant open plans |
| `catalogue.search` | Text, category, market, cursor | Published product versions only; no arbitrary private search |
| `shelf.save/archive` | Manual fields or confirmed version, availability, revision | Owner shelf item; increments decision revision |
| `tools.save/archive` | Known/unknown capabilities, revision | Owner tool; increments decision revision |
| `programme.configure/pause` | Owned shelf item, published programme rule, known/estimated baseline, allowed transition, expected revision, key | Validated programme state; no arbitrary counter assignment; increments decision revision |
| `protocol.generate` | Goal, session_kind, current observations, expected decision revision, idempotency key | `ready`, `needs_input`, or `no_supported_protocol`; creates immutable decision only, no wash/application events |
| `protocol.start` | Protocol ID, expected revision, idempotency key | Validated active protocol; stale content yields conflict/withdrawn result |
| `protocol.validate` | Protocol ID, expected revision, next step ID if advancing | Current validity and permitted next action; no actual-event side effects |
| `session.create` | Owned protocol ID or manual kind/time, stable client session ID, key | Canonical session for protocol or idempotent manual session; no shampoo/application increments |
| `session.record-events` | Session/protocol ID, typed actual events, expected revision, idempotency key | Atomically records actual shampoo/application/heat; returns derived schedule and new revision |
| `session.complete/abandon` | Session ID, final deviations, expected revision, key | Final lifecycle; preserves all actual events; does not double-count |
| `session.correct` | Target event, replacement/void reason, expected revision, key | Audit correction, recalculation, stale-plan invalidation |
| `feedback.upsert` | Session ID, nullable values, expected revision | Feedback and updated personal summary |
| `safety.report` | Structured trigger, owned session/product if applicable, optional private notes, key | Private report, applicable immediate restriction and operator review item |
| `consent.record` | Purpose, current notice version, grant/withdraw decision, key | Timestamped purpose-specific decision; triggers applicable withdrawal jobs |
| `history.list/detail` | Cursor/date filters or owned ID | Own historical decisions plus actual execution and feedback |
| `privacy.export/delete` | Recent-auth proof, key | Job ID/status; no public file URLs |
| `content.publish/withdraw` | Reviewed version, expected current version, reason | Admin-only immutable version/withdrawal; audit and invalidation |
| Phase 2 `weather.resolve` | City ID, session context | Timestamped bounded weather snapshot or unavailable |
| Phase 2 `community.summary` | Approved cohort key | Suppressed or privacy-reviewed aggregate; never raw rows |

`protocol.generate` decision shape must contain `status`, `goal`, `steps[]`, `treatmentStatuses[]`, `heatAssessment`, `omissions[]`, `alternatives[]`, `requiredInputs[]`, `confidence`, `reasonCodes[]`, `rulesetVersion`, `contentVersions`, `inputHash` and `validity`. A ready response requires at least one meaningful executable step and all hard prerequisites satisfied. A blocked result can return suggestions but not a misleading executable unsafe plan.

Error taxonomy: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404, also for non-owned object IDs), `REVISION_CONFLICT`/`USERNAME_TAKEN`/`IDEMPOTENCY_MISMATCH` (409), `RATE_LIMITED` (429 with retry hint), `SERVICE_UNAVAILABLE` (503). `needs_input` and `no_supported_protocol` are expected decision outcomes, not crashes. Internally distinguish `UNKNOWN_PRODUCT`, `MISSING_HISTORY`, `RULE_CONFLICT`, `WITHDRAWN_CONTENT`, `HEAT_RESTRICTION` and `MISSING_TOOL` reason codes.

Idempotency keys are scoped to owner and operation, stored with a canonical payload hash and result reference. Same key/same payload returns the original result; same key/different payload fails. Permanent uniqueness on `(session_id, client_event_id)` additionally prevents duplicates after key retention expires. Bound generation at 10 requests/minute/user and 100/day/user initially (proposed configurable defaults); rate-limits for Auth are configured separately. Apply payload size limits and timeouts at every service boundary.

## 20. Security, RLS and South African privacy

**SEC-01 — RLS matrix.** Enable RLS and explicit grants on every exposed table. Owner policies use `auth.uid() = user_id` (or `id` on profiles); both `USING` and `WITH CHECK` protect updates. Parent ownership must also hold. No anonymous personal reads. Catalogue readers can select published rows only; consumers cannot insert/update/delete catalogue, claims or rules. Snapshot/lifecycle/event tables deny direct mutations where transactional services own writes. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

| Data class | Consumer | Content staff | Privacy/operator service |
|---|---|---|---|
| Passport, Shelf, Tools, sessions, feedback | Own rows only | No default access | Purpose-limited, audited access |
| Published catalogue, sources, rules | Read published subset | Draft/review by assigned permission | Publish/withdraw through controlled service |
| Usernames | Own profile, limited availability response | No email lookup | Scoped account support |
| Private photos/exports (when enabled) | Owner only, short-lived access | No default access | Audited job access |
| Community raw contributions | No other users' rows | No default access | Dedicated aggregation process only |
| Published aggregate | Approved/suppressed output only | Same public-safe output | Aggregate generation, not unrestricted user-facing queries |

**SEC-02 — Privilege.** Use publishable client credentials and server-only privileged secrets. Validate JWTs in functions, not just decode them. Never use user-editable metadata as an admin role. Use server-controlled roles and an independent current-account-status check on sensitive operations. Privileged service access must explicitly scope user IDs because it may bypass RLS. Prefer invoker functions; any security-definer function requires restricted EXECUTE grants, fixed search path, ownership checks and review. Views must preserve caller security or remain unexposed.

**SEC-03 — Mobile/data handling.** TLS only. Persist refresh/session material in platform-secure storage through a tested adapter; no plaintext general-purpose storage for tokens. Keep sensitive cached snapshots minimal, owner-namespaced and protected; purge on logout/deletion. Redact deep-link URLs, emails, usernames, notes and symptoms from logs. Use parameterised database operations, strict schema validation and escaped rendering of user content. Secrets scanning and dependency vulnerability review gate release.

**SEC-04 — Storage, Phase 2.** Private buckets, owner path prefix and storage policies verifying ownership on upload/read/update/delete. Short-lived signed URLs (proposed 5 minutes) are bearer credentials and must not be logged. Validate actual MIME/signature, limit to 10 MB/image, strip EXIF/location metadata, produce safe resized derivatives and handle malformed files. No face recognition, public image URLs or automatic uploads. File deletion includes derivatives and orphan cleanup.

**PRIV-01 — South Africa-first obligations.** Use a privacy review mapped to POPIA before external beta: purpose and lawful basis, information notice, access/correction/deletion processes, processor agreements, safeguards and cross-border hosting review. Do not claim the application is compliant merely because Supabase is used. Confirm the actual hosting region and subprocessors; South Africa-first does not imply South African data residency. [South African Government: Protection of Personal Information Act](https://www.gov.za/documents/protection-personal-information-act).

**PRIV-02 — Minimisation and consent.** Proposed MVP audience: 18+ self-declared, no date-of-birth collection. Child profiles require a separate design and legal review. Core processing notice, optional analytics, optional photos and community aggregation have distinct purposes and controls. Declining optional uses must not block protocols. Do not collect precise GPS, race, identity numbers or contact lists. Treat hair/scalp reports and photos as sensitive in the security design without assuming a legal classification is settled.

**PRIV-03 — Proposed retention schedule.** Personal profile/history retained while account is active, subject to user correction/deletion. Raw optional analytics: 90 days; redacted operational/security logs: 30 days; content-publication audit: one year without personal routine content. Export links expire after 24 hours and export objects are removed within 7 days. Account deletion removes active-system personal data/media within 30 days, target 7; backup expiry maximum target 35 days subject to selected provider plan. Confirm actual backup retention and disclose any exceptions before beta. These are product targets, not legal statutory deadlines.

**PRIV-04 — Export.** Recent-auth request creates owner-only JSON/CSV archive of profile, owned items, session records, feedback and consent history, with a readable explanation of formats. Include private photos if enabled. Export cannot include other users' community rows or secrets. Job status is resumable; expire download access; no third-party transmission by default.

**PRIV-05 — Deletion and tokens.** Set `account_status=deleting` and block app data access immediately using a status check in applicable policies/services. Revoke refresh sessions, then purge dependent personal rows and storage, then delete Auth identity. Existing access JWTs may outlive account deletion, so token revocation alone is insufficient. Retry partial failures through a durable job/tombstone with no retained hair data. Backups remain inaccessible to normal operations; on restore reapply deletion tombstones before reopening traffic. Explain when final backup expiry occurs. Community consent withdrawals follow section 15.

Deletion control records reside in a restricted operational schema and must not cascade away with `auth.users`. Retain only an opaque subject reference plus the minimal protected mapping needed to purge backups/restores, job status and expiry; this mapping remains restricted personal data, not anonymous telemetry. Remove it after all deletion/backup obligations end. Consumer-facing job access ends with account deletion; operators can verify completion without retaining the Passport or contact details unnecessarily.

**PRIV-06 — Operations.** Name the responsible operator/Information Officer as applicable before release, publish contact routes, and maintain incident response, access audit and breach assessment procedures. No advertising SDK or sale of personal hair data in MVP. Contracts and exact legal notices are reviewed deliverables, not engineering guesses.

## 21. Non-functional requirements and analytics

Targets below are proposed acceptance targets, measured on a declared mid-range Android device and supported iPhone using representative South African mobile connectivity. Report client and server timing separately.

| ID | Requirement / measurable target |
|---|---|
| NFR-01 | Pure evaluator p95 ≤250 ms for 100 shelf items, 25 tools and 1,000 historical events; generation end-to-end p95 ≤3 seconds on stable 4G, excluding user input/authentication |
| NFR-02 | Cached Today/history shell visible ≤1 second after app readiness; show loading/error/retry states for network operations; no indefinite spinners |
| NFR-03 | ≥99.5% successful valid generation requests monthly, excluding explicit user-input/no-protocol outcomes and planned maintenance; no content-rule violations tolerated |
| NFR-04 | 99.5% crash-free sessions during beta; zero open critical/high security or data-loss defects at release |
| NFR-05 | No new authoritative offline generation. Cached guidance labelled with freshness; pending actual events retained securely and visibly until acknowledged; retries never lose or duplicate a wash |
| NFR-06 | Accessibility target WCAG 2.2 AA principles applicable to mobile: screen-reader labels/order, scalable text, adequate contrast, touch targets ≥44 pt iOS/48 dp Android, no colour-only Heat Coach meaning |
| NFR-07 | South African English at launch; metric units, °C, dates unambiguous, ZAR for any later prices; timezone-aware history; copy inclusive across hair textures and styling practices |
| NFR-08 | Core text-only protocol payload ≤100 KB compressed; catalogue pagination and local cache; no mandatory media downloads; usable when connectivity is intermittent |
| NFR-09 | Restore target RPO ≤24 hours, RTO ≤8 hours for private beta; provision backups to support this and complete a staging restore drill before release |
| NFR-10 | Schema/version compatibility checked on app launch and generation; unsupported old clients receive a clear required-update state; content rollback does not require a mobile release |
| NFR-11 | GitHub CI requires type checks, lint, meaningful tests, content validation, migration/RLS checks and no untriaged high-risk dependency findings; domain/engine/service unit coverage ≥80% with every hard-rule branch explicitly tested |
| NFR-12 | No provider-specific AI dependency in MVP; deterministic template explanations remain functional if later AI or weather services fail |

**Analytics purpose:** establish whether users obtain useful executable routines, return and give feedback; detect failures without collecting private hair narratives.

Proposed events: `onboarding_started/completed`, `shelf_item_added` (verified/manual only), `protocol_requested/generated/needs_input/unsupported`, `protocol_started`, `session_completed`, `feedback_submitted`, `evidence_opened`, `alternative_selected`, `recovery_requested/completed/failed`, `privacy_job_completed`. Properties allowlisted: event ID, pseudonymous analytics ID if opted in, time, app version, ruleset version, coarse stage, duration bucket and non-sensitive error code. Do not send exact product names, concerns, chemical history, notes, location, email or token data. Operational failure counts can be aggregated without an analytics identity.

| Metric | Exact definition | Initial decision threshold |
|---|---|---|
| Activation | Verified new users with first ready protocol within 7 days / verified new users in same cohort | ≥60% in private beta; investigate friction if lower |
| Execution conversion | Users with confirmed actual activity on a generated protocol within 7 days / users with a ready protocol | ≥50%; distinguish planning-only behaviour |
| Feedback completion | Among sessions completed at least 7 days ago, those with at least one structured outcome recorded within 7 days of completion / all sessions in that same mature cohort | ≥50%; improve prompt burden if lower |
| Repeat intent | “Yes” responses / answered repeat question | ≥60%; display denominator and selection bias |
| W4 meaningful return | Activated users with a new protocol or actual session on days 22–28 / activated users old enough for window | ≥30%; directional until cohort is large enough |
| Unsupported rate | No-supported-protocol outcomes / valid requests | Segment verified versus manual-only shelves; do not lower safety gates to improve it |
| Rule violation rate | Reviewed outputs violating a hard constraint / reviewed outputs | 0; any confirmed violation blocks affected content |
| Duplicate actual events | Duplicate logical events after retries/concurrent sync | 0 |

These are hypotheses for beta, not claims of existing performance or clinical benefit. Include cohort/sample size and do not claim statistically significant improvements from the founder's results. Safety/privacy regressions cannot be traded for conversion. Define dashboard ownership and a weekly beta review; analytics opt-out gaps must be disclosed in interpretation.

## 22. Edge cases and acceptance criteria

Every criterion is a release test with a recorded expected result. Use exact approved content for live acceptance; synthetic fixtures isolate engine mechanics.

| Test | Given / when | Required result | Requirements |
|---|---|---|---|
| AC-01 | Two users request case variants of the same username concurrently | Exactly one succeeds; loser can retry; ownership remains UUID-based | AUTH-01–03 |
| AC-02 | Verified signup succeeds but profile completion fails | Sign-in resumes completion without duplicate Auth identity or lost data | AUTH-02 |
| AC-03 | Recovery link opens with app closed and then while open | Correct recovery screen, validated session, one password change, old password rejected | AUTH-05–07 |
| AC-04 | Recovery link is expired/reused/wrong-host or verifier is absent | No account access/reset merely from the URL; safe re-request path, no token logs | AUTH-06 |
| AC-05 | User edits email or handle | All history remains attached to same UUID; no lookup leaks email | AUTH-01,07 |
| AC-06 | Passport has unknown treatment date or tool temperature | No invented values and no unjustified GREEN; targeted question/alternative | HP-02, HEAT-02 |
| AC-07 | Manual product has a familiar brand/name but no verified exact version | Saved/loggable; no invented waits, heat claims or treatment schedule | SHELF-02,03 |
| AC-08 | Eligible routine uses only current shelf and tools | Ordered protocol uses available owned items, explains omissions, no purchase requirement | TODAY-02,03 |
| AC-09 | Same snapshot/rules evaluated 100 times and on supported runtimes | Canonical decision is identical, including order and reason codes | ENG-01 |
| AC-10 | Synthetic treatment fixture specifies no pre-conditioner and 240-second wait | Conditioner excluded before treatment; wait occurs before applicable downstream product; leave-in preserved | ENG-02,06 |
| AC-11 | Synthetic initial programme on Wash 1, 2 and 3 | Correct next confirmed application number, no progress from generation | HIST-01–04 |
| AC-12 | Synthetic 3–4 interval at counts 2,3,4,5 with today wash/no-wash | Off-by-one tests pass using section 13 semantics and approved product policy | HIST-03 |
| AC-13 | Conditioner/treatment hard rules conflict or dependency graph cycles | No unsafe ready protocol; explicit conflict and feasible fallback if available | ENG-03 |
| AC-14 | Required activation tool missing or heat prohibited | Activation product omitted/blocked, not silently changed to flat iron | HEAT-05 |
| AC-15 | User wants smooth hair and eligible roller/air option exists | Alternative shown, unnecessary extra contact heat not added by default | HEAT-02, ENG-04 |
| AC-16 | Maintenance boundary reached or consecutive treatment missed | Uses approved transition/restart policy or requests reassessment; never guesses | ENG-05, HIST-04 |
| AC-17 | Generate/start/abandon without actual events | No shampoo/application increments | HIST-02 |
| AC-18 | Confirm shampoo, skip treatment, then abandon routine | Shampoo counts once, treatment does not; actual heat if used remains recorded | HIST-02 |
| AC-19 | Same protocol completion retried or submitted concurrently from two devices, including different client event IDs | One canonical session and logical event set; consistent derived state; payload-key mismatch rejected; independently entered manual duplicates flagged for review | HIST-06,07, section 19 |
| AC-20 | Backdated shampoo corrected/voided | Counters recomputed; open plans stale; original recommendation snapshot preserved | HIST-05 |
| AC-21 | Tool archived or content withdrawn after generation/start, including during offline use | Start/resume/pre-step validation stops affected guidance; offline validity labelled unknown and new guided treatment/heat steps paused; history still readable | CAT-04, TODAY-06,07 |
| AC-22 | Feedback omitted/partial or style still lasting | Nulls excluded from means; correct per-measure denominators and censoring label | FB-01,02, PE-01 |
| AC-23 | Excellent personal/community outcome conflicts with hard restriction | Restriction wins; no unsafe ranking escape | EVD-01, PE-02 |
| AC-24 | Concern includes hair thinning or active reaction | Reviewed cosmetic boundary/escalation; no diagnosis, medication or promised cure | SAFE-01–04 |
| AC-25 | User A directly requests/updates/deletes User B's UUID or child links | No disclosure/mutation across every table/service/storage policy | SEC-01,02 |
| AC-26 | Consumer sets admin metadata or calls publication RPC | Denied; no global content mutation | SEC-02 |
| AC-27 | Logout/account switch with cached history | No prior owner's private data visible; pending sync handled explicitly | AUTH-04, SEC-03 |
| AC-28 | Offline completion followed by reconnect/retry | Pending state shown, one eventual event set, conflict handled without silent loss | NFR-05 |
| AC-29 | App backgrounds/restarts during wait | Timer resumes from persisted deadline; no false application/completion | TODAY-05 |
| AC-30 | Account deletion partially fails; old JWT still exists | Data access remains blocked; job retries and completes; export/media removed per schedule | PRIV-05 |
| AC-31 | Long text, large font, screen reader and colour-vision differences | Core flow usable, heat label understandable without colour | NFR-06 |
| AC-32 | Phase 2 weather is denied, stale or unavailable | Weather-independent valid output; no invented forecast | WX-01,02 |
| AC-33 | Phase 2 cohort below threshold or consent withdrawn | Suppressed output/recomputed contributions; no raw records exposed | COM-01–03 |
| AC-34 | Phase 2 image upload has EXIF, wrong type or foreign owner path | Sanitised valid upload or rejection; no foreign read/overwrite | SEC-04 |

Additional scenarios in the regression corpus: very fine/oily straight hair versus coarse/dry processed curls; mixed texture; no tools; empty shelf; all items unavailable; double shampoo; co-wash; two real washes on one day; unknown history baseline; timezone travel/midnight; same-time estimated events; session without protocol; archived/reformulated product; expired session mid-save; network timeout after server commit; fresh bleach entry after a plan starts; no relevant scalp response supplied; repeated adverse feedback; latest rule rollback with old mobile client. Negative outcomes must be understandable and recoverable.

## 23. Test plan, rollout and operational readiness

**Unit/domain tests:** red/green tests for every hard rule and each unknown-state branch, due windows, programme transitions, dependency graph sorting/cycles, confidence derivation, ranking invariants, canonical snapshot equality and actual-event recomputation. Property tests assert no unavailable product, no unsatisfied hard prerequisite, stable tie-breaking and no personal outcome overriding an exclusion. Coverage ≥80% does not replace explicit safety branch tests.

**Integration tests:** real isolated local/staging Supabase schema and Auth identities; transaction rollback, concurrency, unique handles, idempotency, foreign ownership, profile recovery, corrections and stale-plan invalidation. Test anonymous, owner A, owner B, editor and publisher roles; direct Data API/RPC requests as well as application routes. Test RLS SELECT/INSERT/UPDATE/DELETE individually, especially moving a child or owner field. Audit views, grants and privileged functions.

**Mobile end-to-end:** run critical flows on actual iOS and Android development/release builds, not only Expo Go. Cover email confirmation and recovery from real test emails, cold/warm links, offline/reconnect, secure session persistence, account switching, timers, screen readers and primary journeys. Use a mobile E2E framework selected by engineering; browser-only tests cannot validate native links. Record supported OS/device matrix at kickoff.

**Content QA:** for each live seeded product, reviewer verifies exact market/version, directions, evidence references and generated scenarios. Independent expected outputs must be authored from approved directions, not copied from engine results. Validate no fake manufacturer facts, unsupported temperature guidance, universal ingredient claims or inflated confidence. Founder scenarios are one subset; diverse profiles must produce materially appropriate different outputs.

**Security/privacy QA:** secret scanning, dependency audit with triage, hostile payloads, auth/username rate limiting, enumeration checks, log redaction, cross-owner attacks, stale JWT during deletion, export ownership and data lifecycle tests. Perform backup restore and replay deletion tombstones. Test community/media only when those phases ship.

**Rollout sequence:**

1. Establish repository, environments, migrations and typed domain. Implement identity/Passport/Shelf/Tools plus synthetic evaluator tests.
2. Approve founder product records and run Phase 0 scenarios on both platforms. Record actual results; fix divergence before adding catalogue breadth.
3. Complete MVP execution/history/feedback/evidence, privacy flows and observability. Rehearse recovery, content withdrawal and database restore.
4. Invite a proposed 10–20 adult South African beta users across diverse hair profiles. Publish clearly bounded catalogue support and manual-product limitations. Review issues weekly; no paid acquisition required.
5. Expand only after zero unresolved critical/high defects, acceptable operational targets and credible user feedback. Public stores require final legal/content/privacy review, production email/deep links, support ownership and release checklist.
6. Introduce weather, personal ranking, media and community behind separate flags. Measure incremental benefit; do not bundle all Phase 2 features into one untestable release.

Feature flags: protocol generation, individual ruleset/product availability, contact-heat recommendations, weather, personal ranking, media and community. Kill switches operate server-side. Roll back content to a known good version while retaining audit history; withdraw affected active protocols. Database changes use backward-compatible expand/contract migrations. Avoid destructive rollback that loses user events. App rollback/update policy must be rehearsed for native binary changes.

Operators need alerts for generation exceptions, hard-rule validation failures, unusual auth failures, stuck privacy jobs and service latency. Alert payloads contain request IDs and redacted codes, not hair histories. A confirmed unsafe recommendation immediately disables the affected rule/path pending review; communicate through a scoped in-app notice and established support procedure.

## 24. Risks, decisions and definition of done

| Risk / unresolved decision | Mitigation / required owner | Gate |
|---|---|---|
| Source continuation unavailable | Product owner reconciles any remaining notes with this baseline; log deltas rather than silently adding scope | Full historical-consolidation claim |
| Exact founder products or instructions ambiguous | Content owner identifies South African SKU/formulation/model and official source; tests approved use | Live founder recommendations |
| Heat thresholds and medical escalation lack qualified review | Reviewer approves conservative policy/copy; numeric thresholds remain off | External beta |
| Small/biased catalogue or personal sample | Neutral fixture coverage, unknown-product fallback, visible sample sizes; no causal claims | Ongoing |
| Chemical treatment interaction uncertainty | Block unsupported affected step; content review rather than developer invention | Every rule publication |
| Scope grows into shopping/scanning | Enforce phase matrix and maintain independent core success metric | MVP planning |
| Deep links/email fail on real devices | Choose owned recovery domain, configure production email, test installed/not-installed and PKCE failure cases | External beta/public release respectively |
| Hosting/backup/privacy assumptions unconfirmed | Technical owner selects plan/region; privacy owner reviews POPIA, subprocessors, retention and notices | External beta |
| Brand name preliminary only | Product owner obtains appropriate trademark/domain/app-name checks; do not assume clearance | Public branding investment/release |
| Community re-identification or misleading percentages | Consent, fixed cohorts, suppression, disclosure review and denominator rules | Community enablement |
| Product reformulation/content drift | Versioned knowledge, review queue, withdrawal path, stale-plan checks | Live catalogue |
| Offline/multi-device event drift | Durable pending operations, transaction/revision checks and permanent event uniqueness | MVP beta |
| Unclear commercial influence | Keep commercial fields outside evaluator; later disclosures and ranking audits | Commerce phase |

**Confirmed product policy:** South Africa-first; personal decision engine; brand-neutral; owned products/tools; deterministic critical rules; evidence A–H; Heat Coach; feedback/history; weather later; Supabase email/password + username + UUID + mobile recovery; specified cross-platform stack.

**Proposed defaults to confirm during kickoff, with implementation unblocked:** adults-only MVP, username syntax/change window, 20–30 seed size, photo deferral, personal ranking Phase 2, numeric performance/retention/rate limits, beta cohort size and community threshold. These defaults apply unless explicitly changed; any change affecting security/content must update tests and this PRD.

**Publication blockers, not developer discretion:** exact live product directions, product-specific range/restart policies, heat/safety copy, production recovery domain and email configuration, actual backup/hosting commitments and privacy review. The app may be built with labelled synthetic content while these are resolved; it may not present unverified fixtures as live advice.

MVP definition of done:

- All Phase 1 requirements and AC-01–31 pass; Phase 2 criteria are recorded as deferred, not falsely passed.
- Founder Wash 1/2/3, treatment-due, roller-set and maintenance scenarios have reviewed expected outputs using exact verified products.
- Diverse-profile regression cases demonstrate person-first behaviour and successful no-purchase routines.
- Every live critical claim has a reviewed source, version and applicable executable rule; every ready protocol is reproducible and explains its constraints.
- Auth, verification, username races, recovery on both platforms, export and deletion work end to end.
- RLS/ownership tests prove isolation; no service secrets or private source histories are present in the app bundle or repository.
- Actual event logging, corrections, duplicate retries and concurrent devices preserve correct counts.
- Type checks, lint, meaningful unit/integration/mobile tests, content checks and security review pass; no unresolved critical/high defects.
- Accessibility, latency, crash and low-connectivity targets are measured and material exceptions explicitly accepted before release.
- Privacy notices, support ownership, content withdrawal, incident response and restore runbooks exist and are exercised.
- Build artifacts, committed migrations, seeds, test results and release/content versions are recorded in GitHub; production has a known rollback path.
- Product owner reviews the implemented journeys and content reviewer approves live instructions. Only then may the team describe the MVP as ready for external beta.

**Handoff:** Implement Phase 0 foundations and synthetic rule contracts immediately. Complete content and operational gates in parallel. Ship the small, trustworthy daily decision engine before weather, catalogue scale or commerce. This document becomes the single requirements baseline; approved changes update its version, affected acceptance tests and release scope together.

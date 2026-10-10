# StrandCue Product-Recovery Audit

**Date:** 10 October 2026
**Status:** Approved supporting audit
**Audited implementation:** `codex/repo-recovery-integration` at `2721f815f49ed66b17b3157fc019d25a1ba42d54`
**Purpose:** Recover the intended StrandCue product, identify what was lost or deferred during foundation work, and establish the evidence needed for a canonical product specification and implementation roadmap.

## 1. Executive finding

StrandCue currently has a meaningful secure data foundation, but it does not yet deliver the main product promise expressed in the earliest recovered vision:

> Given my actual hair, treatment history, current condition, products, tools, environment, budget, previous outcomes and desired result—what should I do?

The current APK primarily answers a narrower question:

> What have I recorded about my hair, services, products, tools and activities?

This is not simply a backlog problem. It is a product-authority problem. The first consolidated PRD recorded that the source conversation was truncated after 20,000 characters and ended during “Product comparison.” The later Phase 1 rewrite recorded that an additional continuation and a referenced “Locked Phase 1 Build Specification” were unavailable. That rewrite intentionally removed advice generation from Phase 1 and became the implementation authority. Infrastructure and privacy work then progressed against that reduced scope.

The secure foundation should be retained. The reduction of the product vision should not be treated as the final definition of StrandCue.

## 2. Sources recovered and limitations

### 2.1 Sources examined

1. Current product/release conversation, including product-owner corrections about missing photos, outcome learning and advice.
2. Accessible hair-restoration conversation showing the intended quality of contextual guidance: exact hair behaviour, chemical history, owned products, tool choice, humidity, product overlap, heat minimisation and practical alternatives.
3. `StrandCue-PRD.md` v1.0 dated 6 September 2026.
4. `StrandCue-PRD-v2.md` dated 9 September 2026.
5. `StrandCue-PRD-v1.1-audit.md` dated 23 September 2026.
6. `docs/PHASE_1.md`, foundation/chemical-services designs and implementation plans.
7. Git history and recovered `codex/repo-recovery` / integration work.
8. Current mobile, domain, migration, worker, website and test inventories.
9. Recent Codex threads covering branch recovery, missing screens, security hardening, authentication, Android links, release builds and launch preparation.

### 2.2 Unavailable source material

1. The remainder of the original “Create Haircare PRD” source after its 20,000-character retrieval limit.
2. The unavailable continuation referenced by `StrandCue-PRD-v2.md`.
3. The separate “Locked Phase 1 Build Specification” referenced by the later attachment but never supplied to the repository.
4. Older conversations that are no longer returned by the available conversation index.

Requirements derived only from reconstructed documents must therefore be marked **recovered**, **inferred**, or **owner-confirmed**. They must not be presented as verbatim statements from missing conversations.

## 3. Product authority repair

The following authority order should replace the current phase-only hierarchy after product-owner approval:

1. Explicit product-owner decisions made after this audit.
2. A new canonical StrandCue Product Specification derived from the recovery matrix.
3. Approved journey specifications and acceptance scenarios.
4. Technical subsystem plans and architecture decisions.
5. Historical PRDs as evidence of intent and constraints.
6. Phase 1 documents as the specification of the existing data foundation, not the full product boundary.

Every future implementation task must link to a requirement identifier and acceptance journey. A technical milestone is complete only when the user-visible capability works, not merely when its tables or types exist.

## 4. Product doctrine recovered across sources

StrandCue must:

- reason about a person rather than a generic hair type;
- use actual current condition, treatment and styling history;
- know which exact products and tools the user owns;
- prefer a safe, feasible owned-product routine before suggesting a purchase;
- detect unnecessary product duplication and overload;
- distinguish manufacturer instructions, independent evidence, inference, community signals and personal experience;
- produce ordered, practical steps with waits, exclusions and alternatives;
- reduce unnecessary repeat heat and show lower-heat alternatives;
- represent missing information honestly and ask targeted questions;
- keep recommendations deterministic and reproducible;
- record what the person actually did separately from what was recommended;
- learn from structured personal outcomes without overriding safety or exact product instructions;
- explain why a choice was made and why alternatives were rejected;
- support straight, wavy, curly, coily, mixed, grey, natural and processed hair;
- remain brand-neutral and commercially independent in its decision logic;
- protect private history, photos and account data;
- avoid medical diagnosis, medication advice, promised regrowth and diagnostic claims from photographs.

## 5. Recovered end-to-end experience

### 5.1 First-use journey

Welcome → account and age eligibility → verified email → username → Hair Passport → treatment/service history → current concerns and goals → add owned products and tools → identify unknown/unverified items → choose today’s result → answer targeted missing questions → receive a protocol → inspect reasons/evidence/alternatives → execute and record deviations → Cue Check → personal history and next-step update.

### 5.2 Returning-use journey

Open Today → confirm condition, goal, available time, product/tool availability, recent wash/treatment/heat and environmental context → generate current plan → select an eligible alternative → execute → record actual use → report results now or later → see treatment timing and personal outcome trends update.

### 5.3 Example quality bar

The system must be capable of handling a case such as: fine strands; curly, frizz-prone, coarse-feeling hair; highlights or sensitised zones; humid environment; several overlapping heat-protection/smoothing products; owned roller-set, hot-air and direct-heat tools; goal of smoothness with minimal heat. The answer must identify overlap, use exact verified directions, prefer existing products, propose a roller-set or lower-heat path, and explain uncertainty. This is a test scenario, not a hardcoded founder exception.

## 6. Capability recovery matrix

Status meanings:

- **Implemented:** meaningful current code, persistence and tests exist.
- **Partial:** foundation exists but the intended user capability is incomplete.
- **Missing:** no production capability found.
- **Deferred by rewrite:** explicitly moved out of Phase 1 despite appearing in the recovered vision.
- **Contradictory:** current product copy or behavior conflicts with the recovered promise.
- **Unverifiable:** source is known to be incomplete and needs owner confirmation.

| Capability | Recovered intent | Current evidence | Status | Required recovery |
|---|---|---|---|---|
| Identity, signup and recovery | Secure owner identity and recoverable mobile account | Auth, PKCE/deep links, username and tests exist | Implemented/needs device verification | Preserve; finish multi-device/session acceptance |
| Hair Passport | Rich structured hair, condition, habits, sensitivities, environment and goals over time | Passport domain, revisions, editor and migrations exist | Partial | Expand field coverage, onboarding, completeness and current-condition refresh |
| Chemical/service history | Date/precision, zone, still-present state, corrections and heat observations | Service domain/UI/RPC/history exist | Implemented foundation | Connect to advice and safety rules; validate all service semantics |
| My Shelf | Own any product, exact match where known, manual unknowns, versions and provenance | Shelf domain/UI/RPC/history exist | Implemented foundation | Add usable catalogue search, reviewed content and decision integration |
| My Tools | Exact owned tools, capabilities/settings, unknown-safe representation | Tool domain/UI/RPC/history exist | Implemented foundation | Add tool instructions, heat settings and decision integration |
| Manual activities/history | Record wash/styling/other facts and corrections | Activity domain/UI/RPC exists; screen explicitly says no recommendations | Partial/contradictory | Extend to actual protocol execution, wash/application/heat facts and useful history views |
| Today home | Primary question: what should I do today? | No Today feature; “today” symbols are date helpers | Missing/deferred by rewrite | Build primary Today journey |
| Deterministic decision engine | Reproducible ordered protocol using versioned inputs/rules | No recommendation domain modules found | Missing/deferred by rewrite | Build pure engine and reviewed rule pipeline |
| Ordered protocol | Steps, amounts/bands, order, waits, rinse/no-rinse and alternatives | No protocol schema/UI/persistence | Missing | Build immutable decision snapshot and execution session |
| Targeted missing questions | Ask only for facts needed to make affected decisions | Unknown handling exists in data schemas only | Partial | Add engine-produced `needs_input` questions and conservative fallbacks |
| Reasons and evidence UI | Explain decision, evidence class, applicability and limits | Provenance/trust-tier types exist; no recommendation evidence UI | Partial | Build claim-level evidence publication and user explanation screens |
| Product comparison | Compare exact products for this person and goal | No comparison journey found | Missing/unverifiable tail source | Recover original comparison requirements and implement after core engine |
| Routine Audit / Shelf Scan | Keep, use less, change order, duplicate, gap, remove, no purchase needed | Shelf inventory only | Missing/deferred by rewrite | Build deterministic audit using reviewed facts |
| Product-overlap control | Avoid stacking redundant smoothing/heat/conditioning products | No implemented decision | Missing | Model functional capabilities and duplicate/overload rules |
| Owned-first/no-purchase advice | Prefer feasible products already owned | Principle exists only in documents | Missing | Make a tested ranking constraint and visible result |
| Heat Coach | Direct heat, heated air, passes, necessity, restrictions and alternatives | Old `HeatEventForm` draft was deleted; no current coach | Missing/deferred by rewrite | Design narrow direct-heat vertical slice then broaden |
| Roller-set/blow-dry alternatives | Suggest appropriate technique based on goal/tools and reduce direct heat | Mentioned in recovered scenarios only | Missing | Encode reviewed tool/routine capabilities and alternative generation |
| Wash counting | Count qualifying real shampoos, not generated plans | Activities cannot express complete wash/application semantics | Missing/deferred by rewrite | Add canonical actual-event slots and correction recomputation |
| Treatment programmes | Initial, reassessment, maintenance, paused/completed and interrupted states | No programme implementation found | Missing/deferred by rewrite | Build product-specific reviewed scheduling state machine |
| Treatment-due reminders | Explain eligibility/due state from actual history | No scheduler | Missing | Build only after actual-event model and approved product rules |
| Actual protocol use | Separate planned steps from what happened | Generic activity notes only | Partial | Add step completion, skip, substitution, amount, application and heat events |
| Cue Check | Structured immediate/later outcome feedback and deviations | No Cue Check module | Missing/deferred by rewrite | Build structured feedback, corrections and audit |
| Personal outcome summaries | Show honest counts and trends without causation claims | No outcome model | Missing | Add aggregation with sample sizes and neutral wording |
| Personal outcome ranking | Rank safe eligible alternatives by the user’s recorded history | No ranking | Missing/deferred by rewrite | Build transparent post-filter ranking with sparse-data fallback |
| Private progress photos | Capture/import, contextual metadata, gallery and comparison | No image-picker/storage/photo domain | Missing/deferred by rewrite | Build private owner-only photo journal, export and deletion |
| Before/after comparison | Compare consistent views/dates without diagnosis | No implementation | Missing | Add guided angles and side-by-side user interpretation |
| Shelf/tool/label photos | Help identify owned items and exact versions | No implementation; tool photo appears in audit PRD | Missing | Separate private capture from verified catalogue matching |
| Barcode/label/ingredient scanning | Discover candidate product identity/facts for review | No scanner/import | Missing/deferred | Build discovery queue; never auto-publish trusted facts |
| Weather/humidity context | Use time-stamped coarse location weather with freshness/outage behavior | Passport may store sensitivity/city; no weather service | Partial/deferred | Add after deterministic baseline with stale/offline fallback |
| Budget/local availability | Respect budget and South African products/retailers | Fields/planning only; no discovery/price service | Missing/deferred | Add comparison inputs without letting commercial data affect safety |
| Community outcomes | Opt-in aggregates with privacy thresholds and honest denominators | Consent purpose exists; no aggregates | Partial foundation/deferred | Build only after personal outcomes, privacy gates and useful cohort size |
| Conversational advice | Explain the already-determined plan naturally and answer follow-ups | No AI/advice layer | Missing/deferred | Add constrained server-side explanation after engine; no decision authority |
| Safety escalation | Stop ordinary cosmetic guidance for concerning reactions and direct to appropriate help | General boundary exists; no complete triage flow | Partial | Obtain reviewed wording and implement non-diagnostic escalation |
| Content authoring/review | Draft, review, publish, version, withdraw rules and claims | Schema concepts/drafts exist; no complete operational workflow | Partial | Build restricted content pipeline and regression gates |
| Initial reviewed catalogue | Enough exact products/tools/rules for useful beta journeys | No evidence of 20–30 live reviewed items | Missing operational content | Curate a narrow tested catalogue and founder scenarios |
| Offline behavior | Preserve user-entered drafts and avoid false offline advice | Secure drafts exist for several record types | Partial | Extend to Today inputs/actual execution; require server authority for current generation |
| Export and deletion | Portable data and full deletion, later including media | Export/deletion code, migrations and worker exist | Implemented foundation | Start/schedule worker, device-test, extend to new data/media |
| Consent and privacy | Purpose-specific consent, owner isolation, no sensitive analytics | Consent/RLS/export/deletion foundations exist | Implemented foundation | Reassess every new purpose, media and AI transfer |
| Analytics/observability | Privacy-safe operational and product measurement | Analytics/crash modules and tests exist | Partial | Configure production provider/alerts and validate PII exclusion |
| Accessibility | WCAG-oriented labels, focus, readable/tappable UI and device testing | Some accessibility tests exist | Partial | Audit complete journeys on devices and remediate UI |
| Support/account information | Help, limitations, contact and account controls | Earlier screens were removed during hardening; settings exists | Partial/regressed | Restore reviewed support/account surfaces without unsafe drafts |
| iOS | Original documents included iOS/Android; current release was narrowed to Android | No current iOS release evidence | Deferred by later owner decision | Keep Android-first; revisit only by explicit owner decision |

## 7. Missing technical systems implied by the product

1. Versioned recommendation input/output contracts.
2. Deterministic rule DSL, validator, evaluator and regression fixtures.
3. Rule/content authoring, review, publication, withdrawal and audit workflow.
4. Immutable protocol snapshots and execution sessions.
5. Canonical actual-use events for shampoo, application, heat, skip and substitution.
6. Treatment-programme state and correction-driven recomputation.
7. Structured outcome model and transparent personal ranking.
8. Private media storage, signed access, offline upload, export and deletion.
9. Weather/context adapter with timestamps, freshness and fallback.
10. Discovery/matching queue for barcode, label, image and URL inputs.
11. Constrained AI explanation adapter with deterministic fallback.
12. End-to-end journey tests and physical-device acceptance suites.

## 8. Contradictions requiring explicit resolution

### 8.1 Phase 1 authority versus product usefulness

The Phase 1 rewrite correctly prioritized trusted history and security but explicitly prohibited recommendations. It cannot remain the top-level product authority now that the owner intends to build the original advice product. Resolution: retain Phase 1 as the completed foundation specification and approve a new canonical product specification.

### 8.2 Photos as optional later feature versus central feedback mechanism

The original consolidation made the MVP photo-free, while the owner has now reconfirmed that progress photos were part of the expected feedback loop. Resolution: photos become a core learning milestone after structured outcomes, with no image diagnosis.

### 8.3 AI personalization versus deterministic safety

The expected experience includes advice and conversational help, but an unconstrained AI recommendation engine conflicts with reproducibility and safety. Resolution: deterministic rules decide; personal history ranks safe alternatives; AI explains and supports follow-up questions within the structured decision.

### 8.4 “Launch candidate” versus actual capability

The signed APK is operationally distributable but lacks the central guidance loop. Resolution: label the existing build Technical Alpha and create a new private-beta build only after core guidance, execution and Cue Check work.

### 8.5 Historical plan suggests all hair profiles, while initial content is narrow

The data model should support all hair profiles, but content/rules cannot safely cover every combination immediately. Resolution: keep inclusive data contracts, launch a clearly defined rule-coverage cohort, expose unsupported/needs-input outcomes, and expand only with reviewed evidence.

## 9. Recommended canonical product structure

### Pillar A — Know me

Passport, current condition, goals, services, zones, environment, preferences and corrections.

### Pillar B — Know what I have and what I did

Shelf, tools, exact versions, availability, wash/application/heat history and actual execution.

### Pillar C — Guide me today

Deterministic protocol, Heat Coach, treatment timing, alternatives, owned-first choice, reasons and evidence.

### Pillar D — Learn what works for me

Cue Check, personal summaries, progress photos, comparisons and safe personal ranking.

### Pillar E — Help me understand and discover

Routine Audit, product comparison, scanning/import, weather context and constrained conversational explanation.

### Pillar F — Earn and preserve trust

Verification, provenance, content review, privacy, consent, export, deletion, accessibility, security and operational reliability.

## 10. Delivery sequence based on usable journeys

### Stage 0 — Authority and baseline

Approve this audit, capture any missing owner memories, create the canonical Product Specification, baseline the integration branch and relabel the current APK Technical Alpha.

### Stage 1 — First useful decision

Deliver one narrow end-to-end deterministic journey: “What should I do today?” for a reviewed set of wash/styling scenarios. Include inputs, reasons, alternatives, owned-first selection, evidence and safe unsupported states.

### Stage 2 — Heat and treatment truth

Deliver Heat Coach, canonical wash/application/heat events, treatment programmes, due state and correction-driven recomputation.

### Stage 3 — Execute and learn

Deliver protocol execution, deviations, Cue Check, outcome corrections, personal summaries and safe outcome ranking.

### Stage 4 — See progress

Deliver private progress photos, consistent capture, comparison, export and deletion. Do not perform diagnostic image analysis.

### Stage 5 — Context and audit

Deliver humidity/weather, Routine Audit, product comparison and clearer gaps/duplicates/no-purchase conclusions.

### Stage 6 — Discover and converse

Deliver scanning/import into a review queue, broader ZA catalogue/availability, and constrained AI explanations. Keep decisions deterministic.

### Stage 7 — Private beta readiness

Complete content review, device matrix, accessibility, POPIA/privacy review, monitoring, backup/restore, Play internal/closed testing and staged rollout.

## 11. OpenCode handoff rules

OpenCode must not receive a single instruction to “build all missing StrandCue features.” Each stage requires its own approved design and implementation plan. Every task must cite requirement IDs from the canonical specification, name exact files/interfaces, begin with failing tests, and end with a review gate.

OpenCode may implement code, tests, migrations and local documentation. It must stop before applying hosted migrations, changing Supabase/Cloudflare/Google Play/GitHub resources, publishing, distributing builds or adding paid services. Those actions require reviewed artifacts and explicit owner approval.

## 12. Audit conclusion

The foundation work is reusable and important; it should not be discarded. The missing layer is the product itself: the loop from personal facts and owned items to a defensible plan, actual execution, observed outcome and better next decision. Restoring that loop is the main development programme.

This audit cannot certify the unseen portion of the original conversation. It does establish a transparent recovery baseline, identifies the known missing capabilities, and provides a structure in which newly recovered memories or source material can be added without silently rewriting the product again.

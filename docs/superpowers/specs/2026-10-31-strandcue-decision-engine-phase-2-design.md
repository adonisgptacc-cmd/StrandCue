# StrandCue decision engine: Phase 2 design

**Status:** Approved for implementation planning by the product owner on 2026-10-31. This is not approval to publish safety content or to change hosted systems.

**Source:** StrandCue Decision Engine: Phase 2 design spec, draft v0.1, supplied in chat on 2026-10-31.

## Intent

Give StrandCue one deterministic, explainable way to decide what a person can safely do today from recorded and verified facts. The engine must be useful when exact product facts are missing while making unknowns visible and never turning them into safety assurances.

The engine supports Heat Coach first, then Today’s Protocol and later product capabilities. Decisions must be reproducible from the same canonical inputs, versions and ruleset; every included or excluded step must have a trace to rule and claim identifiers.

## Goals

- Use one pure evaluator with typed inputs, outputs, stages and rule definitions.
- Make a content-hash-pinned ruleset the authority for each generated decision.
- Return one of `decided`, `needs_input`, `blocked` or `no_protocol`, with ordered steps, omissions, alternatives, ranked questions, heat state, confidence and an audit trace.
- Represent unknown facts explicitly. Unknown never means safe, green, eligible or due.
- Keep safety ahead of user goals through the existing ENG-03 conflict order.
- Make decisions replayable and explainable through immutable rule, evidence, capability and schema versions.
- Keep commerce, advertising, price and retailer inputs out of evaluator types and ranking.
- Preserve useful fallback behavior only through reviewed generic guidance that states its limits; never invent product-specific claims.
- Keep production Heat Coach content empty/draft until the required distinct human reviews pass.

## Non-goals

- No user-facing engine advice during Phase 2a.
- No offline authoritative generation in v1 and no implication that cached withdrawals can be detected offline.
- No AI-authored or AI-published rules, facts, evidence or decisions.
- No diagnostic or medical treatment capability.
- No visual rule-authoring UI in Phase 2a.
- No product prices, retailers, advertising or commerce data in the evaluator.
- No reaction-report or community-aggregate feature before privacy review.
- No barcode/OCR result becoming a verified safety fact without human or governed catalogue review.

## Constraints and current project fit

- The canonical product specification already defines the deterministic recommendation engine, today/protocol execution, heat and treatment truth, evidence governance, privacy lifecycle, and later work for reminders/weather, Routine Audit/comparison and barcode/OCR discovery.
- The active Increment 6 plan already covers Heat Coach from pure assessment and two-person content review through server persistence, mobile experience, Today integration and integrated acceptance. Phase 2 must build on that work; it must not create a second Heat Coach evaluator or replace the I6.0–I6.6 plan.
- The repository already has deterministic rule evaluation in `packages/domain/src/recommendations` and a reviewed-content publication gate in `packages/domain/src/guidance/reviewed-content.ts`. That gate binds evidence-registry identity/version, claim applicability, capability review, dates and distinct authorship/review. Phase 2 should consolidate or adapt these boundaries into the shared engine architecture rather than fork their authority.
- The preferred shared package is `packages/engine`, with no I/O, clock reads or randomness. A boundary supplies `evaluatedAt`, owner-scoped canonical data, active ruleset and content versions. Server generation is authoritative; device execution of the same evaluator is limited to a clearly labelled preview and freshness/withdrawal validation.
- A server boundary must authenticate the owner and reconstruct the authoritative snapshot from trusted records. Database access, Supabase Edge Functions, clocks, persistence and network calls stay outside the pure package. Owner-scoped RLS and existing export/deletion behavior remain required for stored decisions and audit records.
- Phase 2a uses synthetic fixtures only. Before production health information, reaction reports or community aggregates are processed, a South African privacy practitioner must review the purpose, data flows, retention and applicable obligations. The dated legal statement in the chat draft is a claim to verify with that practitioner, not a legal conclusion adopted by this design.
- Product/release stages and engine phases are separate sequences. Engine phases 2a–2d do not renumber or replace canonical product plan items 7–9: reminders/weather/travel/calendar; Routine Audit and comparison; barcode/OCR/import discovery and moderation. Those still require their own approved plans.
- `StrandCue-PRD.md` §12 supplies the ten traceable stage boundaries, but is historical. Preserve the current canonical product specification’s EN-02 order inside those boundaries: verified compatibility/order constraints precede goal suitability; heat/product minimization precedes personal outcome ranking; stable tie-breaks follow ranking. The ten stages may group these operations but must not reorder them.

## Approaches considered

1. **Adopt an external decision engine such as GoRules ZEN.** This may provide established decision-table semantics and authoring affordances, but adds a runtime/dependency and a translation boundary for StrandCue’s evidence, publication, audit and deterministic replay contracts.
2. **Keep a custom evaluator embedded in the existing domain package.** This minimizes package setup and reuses current code directly, but risks growing a mixed domain/persistence/application boundary and gives the rule compiler no clear package contract.
3. **Use a thin custom pure evaluator and typed decision-table/constraint DSL, compiled to one internal representation.** This preserves portability, testability and project-specific publication controls while allowing reviewers to inspect tables. It requires building compile-time checks and defers a visual authoring UI.

**Recommended and accepted direction:** Approach 3. Reuse the current domain evaluator and publication rules as migration inputs; there must be one authoritative evaluator and one publication contract throughout the migration. No second engine may run in parallel and produce authoritative user decisions.

## Design

### Inputs and determinism

The evaluator accepts an immutable canonical snapshot containing the permitted Passport fields, versioned chemical/service history, owner’s shelf and tools, and relevant event history with revision identifiers. It also receives an explicit `evaluatedAt` instant and a `RulesetRef` pinned to a content hash. The evaluator must not read a device clock, database, network, filesystem, random source or mutable global state.

Canonicalization must provide stable ordering and tie-breaks. Same canonical inputs, evaluator/schema versions and ruleset hash produce the same canonical decision. Unrelated records outside the decision’s eligible candidate set must not change its result. Audit traces include the stage, rule ID/version, referenced claim/evidence IDs and reason for every step and omission.

### Rule model and publication

Use a typed whitelist DSL with two authoring forms compiled into one typed intermediate representation:

- Decision tables with explicit `first`, `collect` or `unique` hit policy.
- Constraint rules for ordering, waits, prerequisites and eligibility.

Rules move through `draft → in review → published → superseded/withdrawn`. A published rule is immutable. Publishing blocks on schema/type errors, unreachable rows, overlapping cells inconsistent with hit policy, unresolved hard-rule conflicts, and missing positive or negative fixtures for any hard rule. A hard conflict needs an explicit reviewed resolution or publication fails.

A ruleset is a content-addressed bundle of published rule versions and the exact reviewed product/tool capability facts those rules reference. A decision pins the bundle hash and associated schema/evaluator versions. Rule withdrawal activates a kill/withdrawal path for new authoritative decisions while preserving the old pinned bundle for replay of historic decisions.

### Outcomes and useful degradation

The four statuses have distinct meanings: `decided` has an eligible result; `needs_input` asks the smallest ranked question set needed to unlock a decision; `blocked` means a safety or authority condition prohibits proceeding; `no_protocol` means reviewed content cannot produce an applicable protocol. Each reason has a severity of blocker, caution or info. The UI always shows blockers, groups cautions and leaves info available on demand.

These are the engine-level outcome envelope, not replacements for existing domain assessment vocabularies. Heat Coach retains the Increment 6 states `content_pending`, `needs_input`, `restricted`, `lower_heat`, `no_heat`, `appropriate` and `unavailable` as a typed domain assessment. The allowed combination is: `decided` with `lower_heat | no_heat | appropriate`; `needs_input` with `needs_input`; `blocked` with `content_pending | restricted`; and `no_protocol` with `unavailable`. Validate this mapping in schemas; do not silently rename or collapse either contract.

When exact product facts are missing, degrade in this order: verified exact guidance; reviewed, generic non-product-specific guidance with explicit limits; a ranked question; then `no_protocol`. Never infer a product-specific claim from a generic fallback. Persist an owner’s answer so the same question is not repeated unless the relevant facts or versions change.

Heat Coach retains GREEN/AMBER/RED and a separate `direct_heat_necessity` axis. Unknown facts never yield GREEN. Confidence retains the two qualitative, rule-derived dimensions defined in EVD-03. The engine does not describe any outcome as universally “safe.”

### Verification and change safety

- Golden snapshots cover canonical input → canonical decision and are reviewed with changes.
- Seeded, replayable property tests cover determinism, input-order independence, stable tie-breaks, acyclic output, unknown facts never producing GREEN or a due status, and irrelevant candidate data not affecting the decision.
- Metamorphic tests verify that tightening a restriction cannot make a decision less restrictive. Withdrawal tests verify that a withdrawn rule is no longer executed and historic decisions remain replayable from their pinned ruleset. A withdrawn restrictive rule can logically allow a previously excluded step; that step may be allowed only after the new ruleset is independently reviewed and explicitly permits it.
- Every hard rule has at least one positive and one negative fixture. Independent expected outputs are written by a second reviewer who has not seen the rule before authoring their expected result.
- Mutation testing measures whether hard-rule branches are meaningfully exercised.
- A replay tool compares stored historical snapshots against a candidate ruleset and reports changed decisions before any safety-relevant publication.

### Content operations

The content pipeline includes evidence records attached to exact claims and versions, a reviewer queue, 180-day review reminders, a kill switch and rollback to a prior ruleset hash. These are part of the engine release design, not optional future polish.

Safety-relevant publication requires two distinct human approvals. Human A authors/assembles the rule bundle and evidence links. Human B independently reviews the claim scope, evidence, capability bindings, fixtures and expected outputs, with documented competence relevant to the claims being reviewed. The author and independent reviewer must be different people. The product owner must name the role qualification criteria and assign reviewers before any production safety content is published. If an appropriately qualified reviewer is unavailable, publication stays blocked. Production Heat Coach content remains empty/draft until this gate passes.

Coverage and `needs_input` rates may help prioritize content only through a separately approved, privacy-reviewed measurement path. They do not justify weakening a rule or treating unknown facts as verified.

### Offline, freshness and privacy

Cached decisions may be read offline with generation time and a clear “validity can’t be checked” label. v1 does not allow offline authoritative generation or signed validity windows. On resume and before a treatment or heat step, the client revalidates freshness and withdrawal state (TODAY-07). When this cannot be checked, it must not represent a cached decision as current.

Engine inputs are limited to approved Passport and event fields; free text is never parsed into safety facts. Decision and audit records remain owner-scoped under existing RLS, export and deletion behavior. No additional collection is introduced by the evaluator. Reaction reports, community aggregates and production coverage analytics require their own privacy design and practitioner review before implementation.

### Explainability and localization

Deterministic templates keyed by reason code explain a decision. “Why this?” exposes rule IDs/versions, evidence strength, last-checked date, limitations and eligible alternatives. AI rephrasing is outside Phase 2 and would require separate approval; it may never change a decision. Localization structure is reserved from the start, with English first and no translation delivery in this phase.

## Phasing and relationship to the roadmap

1. **2a — Engine core and synthetic fixtures.** Establish or extract the one shared pure evaluator, DSL/IR, stage contracts, synthetic verified fixtures, and golden/property/metamorphic tests. No user-facing advice and no production content.
2. **2b — Heat Coach and treatment-cycle status.** Complete the existing Increment 6 Heat Coach work as the first user-facing slice, after the engine contracts and its publication/authority gates are reconciled. Restrictive by default; production content remains blocked until two distinct humans approve it.
3. **2c — Today’s Protocol and execution tracking.** Add ordering, waits, timers and idempotent event logging using the same decision contracts and existing execution authority.
4. **2d — Routine Audit/Shelf Scan, then personal evidence and outcome ranking (PE-02).** Use the same verified facts, evidence versions and safety conflict ordering; keep commerce outside the evaluator.

These phases establish shared decision infrastructure. They do not deliver the separate canonical product plan items 7–9, which remain planned work and need their own scope, privacy decisions, acceptance criteria and approvals. In particular, OCR/barcode output remains an unverified discovery candidate until the catalogue review/moderation flow verifies it.

## Acceptance gates before an implementation plan

- Use the ten-stage pipeline in `StrandCue-PRD.md` §12 as the source sequence: (1) validate schema/ownership/revisions and resolve unknowns; (2) apply medical-boundary and active-reaction restrictions; (3) load applicable published product/tool facts and confirmed history; (4) determine treatment and due state; (5) filter incompatible/unsupported candidates by hard constraints; (6) evaluate heat feasibility and lower-exposure alternatives; (7) choose a feasible goal template and rank survivors; (8) build the dependency graph and insert waits/rinses/prerequisites; (9) stable topological ordering and cycle/requirement checks; (10) return steps, omissions, alternatives, reasons, confidence and audit versions. That PRD is historical; the canonical product specification remains authoritative when requirements differ. The implementation plan must type each stage as a pure function and preserve its trace.
- Map the Increment 6 I6.0–I6.6 deliverables and existing domain evaluator/publication gate to phases 2a and 2b, with one authoritative evaluator and no parallel source of truth.
- Use the confirmed sign-off model: Human A authors/assembles; distinct Human B independently reviews with documented relevant competence. The implementation plan must encode the distinct-person check; reviewer identities and credentials are assigned before publication.
- Define the server authority boundary and exact owner-scoped input reconstruction in the implementation plan without moving I/O into `packages/engine`.
- Define how a changed rule withdrawal affects current open plans, next-step revalidation and historical replay; any newly allowed action needs an explicit reviewed successor rule.
- Obtain privacy-practitioner review before any production health-data measurement, reaction-report or community-aggregate work.

## Planning assumptions confirmed by the product owner

- The repository PRDs already reviewed are the complete source set for this work; use the ten stages from `StrandCue-PRD.md` §12 while treating the canonical product specification as current authority.
- The Human A/Human B review gate and qualification requirement above match the intended safety sign-off.
- Phase 2 must be decomposed into parallel-capable work orders, each executed in its own worktree and independently reviewed before integration into the main worktree.

No code, database schema, production content, remote resource or hosted Supabase project is changed by this design document.

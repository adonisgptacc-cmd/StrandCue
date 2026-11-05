# Phase 2a product contract decisions

**Status:** owner decisions recorded; Phase 2a remains `PARTIAL / HOLD` until the approved contract and independent verification gates are complete.
**Prepared:** 2026-11-05
**Worktree:** `codex/phase2a-product-decisions`, based on candidate `7e4aaa3618a3b532267ad1a434aeb97693df25f5`.

This packet makes the unresolved ranking and capability rules reviewable before implementation. It records established requirements and current code separately from proposed choices. No engine behavior is changed by this document.

## Fixed decisions and source requirements

The owner has already approved this strict precedence, which is fixed for this work:

1. Verified constraints and hard eligibility.
2. Goal suitability.
3. Heat/product minimization.
4. Personal outcome ranking (deferred to Phase 2d by owner decision; not part of Phase 2a acceptance).
5. Stable deterministic tie-break.

No later stage can reverse a hard exclusion or make an ineligible candidate eligible. Same versioned input and rules must produce the same output. Commerce, price, advertising, and retailer availability remain outside the evaluator.

Canonical requirements include:

- EN-02 in `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` §7.5: the precedence above.
- CC-05–CC-07 in §7.8: no causal product claims; personal ranking only after eligibility; preserve baseline order with sparse evidence; explain sample size, recency, relevant goal/context, and uncertainty.
- First acceptance scenario 6 in §10: a negative personal outcome lowers the rank of eligible options but never admits an excluded one.
- The accepted engine design, `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md` §§2, 6, and 8, places personal evidence and outcome ranking in Phase 2d. It states that Phase 2a uses synthetic fixtures and does not process production health/reaction or community data.
- **Owner decision recorded 2026-11-05:** Phase 2a is formally scoped to its accepted core and heat/product minimization. Personal outcome ranking remains required by the canonical product contract and is assigned to Phase 2d. Phase 2a must not claim personal-outcome ranking is implemented. Phase 2d must insert it before the final stable tie-break.

## Current code and data availability

| Area | Verified repository fact | Contract gap |
|---|---|---|
| Candidate ordering | `CandidateRecord` has `candidateId`, numeric `goalSuitability`, and provenance. `compareCandidates` sorts descending by `goalSuitability`, then by stable candidate ID. | There are no heat/product minimization fields or personal-outcome inputs on the engine candidate record. The comparator cannot currently implement those stages. |
| Cue Check observations | The domain supports overall result, satisfaction, dryness, frizz, softness, tangling, buildup, breakage observation, style longevity, immediate reaction, and would-use-again. Unknown values are explicit. | The engine snapshot has no personal outcome summary input. A domain summary is not yet a ranking contract. |
| Personal summaries | `summarizePersonalOutcomes` excludes unknowns from denominators, keeps comparable contexts and observation timings separate, and requires at least 3 definite comparable answers for “sufficient” pattern wording. Summaries expose numerator, denominator, unknown count, recency, evidence status, and wording. | The existing 3-answer threshold is for summary wording. No approved rule says it is the ranking threshold, how outcome fields interact, how recency changes influence, or how positive/negative outcomes compare across fields. |
| Capability identity | `ReviewedCapabilityBindingSchema` binds product/tool type, owner-scoped row ID, catalogue ID, version ID, two-letter market, reviewed use scope, claim/evidence IDs, review reference, reviewed timestamp, and optional expiry. | The owner must confirm expected behavior when any binding is absent, stale, mismatched, or references another catalogue version/market. |
| Capability applicability | `ruleApplicability` requires the binding's owner row and catalogue ID/version/market to match, requires reviewed use scope to match, treats a future review time or expiry at/before evaluation time as inert, and returns `not_applicable` for an unowned/mismatched row. | Exact-version behavior and the distinction between “inert” and “not applicable” need a product-level contract and explicit negative-case acceptance. Missing/unknown required data must not silently allow the rule. |
| Confidence and explanation | The engine confidence schema has qualitative `instructionCompleteness` and `suitability` dimensions. The closure plan requires traceable rule/version and claim/evidence IDs, evidence strength, last-checked date, limitations, eligible alternatives, and reason severity. | The decision packet does not alter confidence. A reviewer must still verify EVD-03 derivation and explanation coverage against approved rule inputs. |

## Owner decisions requested

### 1. Phase boundary for personal outcome ranking

Choose one:

- **A — Re-scope Phase 2a to its accepted core (recommended):** Phase 2a closes only deterministic pipeline infrastructure and goal-suitability ranking over approved synthetic fixtures. Personal outcome ranking remains explicitly deferred to Phase 2d. Amend the Phase 2a acceptance record so it does not claim the full EN-02 ranking behavior is implemented. Phase 2a cannot be marked accepted if another approved 2a gate still requires personal ranking.
- **B — Require personal outcome ranking in Phase 2a:** expand 2a to include new typed engine inputs, privacy/data-boundary review, comparison semantics, explanations, and tests. This changes the accepted phase boundary and needs a separate scoped contract and review before implementation.

**Decision:** **A approved.** Re-scope Phase 2a acceptance to its accepted core plus the approved heat/product semantics. Personal outcome ranking is an explicit Phase 2d dependency. The Phase 2a status record and closure plan must reflect this boundary; the canonical product requirement itself is not removed.

### 2. Heat/product minimization semantics

The approved precedence establishes when this stage runs, but not how heat exposure trades against product burden. No approved numeric weights or common scalar score are present.

For eligible candidates with reviewed, comparable, typed inputs, a candidate outranks another at this stage only when it is no worse on both dimensions and better on at least one. Goal suitability remains the preceding stage, so Pareto comparison applies only within equal goal-suitability groups. Since Pareto dominance is a partial order, implement a deterministic linear extension by repeatedly emitting the non-dominated frontier in the existing pre-stage order (goal suitability, then stable candidate ID), removing that frontier, and repeating. A Phase 2d personal-outcome stage will be inserted before the final stable tie-break; it may reorder candidates within these unresolved trade-offs.

The owner approved these typed measures:

- **Heat exposure:** a reviewed ordinal level derived from applicable heat constraints/necessity and exposure steps. Lower ordinal values mean less exposure within the same approved measure version. This is a comparison order, not a temperature or risk score.
- **Product burden:** the count of distinct required product items/steps for the candidate. Lower counts mean fewer required products. It does not represent cost, irritation, or clinical burden.
- **Unknowns:** an unknown dimension is not treated as the lowest value, zero, or evidence of superiority. If either candidate has an unknown dimension or a different measure version, that pair is incomparable for this stage and cannot establish dominance; expose the limitation and retain the deterministic pre-stage order inside the Pareto frontier.

Measures are comparable only when they share the same pinned ruleset/measure version. Ordinal tier values are used only for ordering; arithmetic distance between tier numbers has no meaning. Hard eligibility remains earlier in the pipeline and cannot be relaxed by this preference stage. Price and retailer data remain excluded.

**Decision:** **C approved**, with the typed measures above. No weighted aggregate will be introduced. A future change to the measure definitions requires a new reviewed ruleset/measure version.

### 3. Personal outcome signal contract, if included in Phase 2a

If decision 1 selects B, choose the ranking rule before any code changes:

- **A — Defer influence when evidence is insufficient (recommended):** use only owner-entered, definite, active Cue Check answers for the same candidate identity/version, relevant goal and comparable context, with immediate/delayed timing kept separate. Use the existing minimum of 3 definite comparable answers as the initial influence threshold; below it, preserve the pre-personal baseline exactly. Explain denominator, unknown count, recency, context, and uncertainty. Do not attribute causation.
- **B — Use any definite observation:** rank from one or more definite answers and show the same context and uncertainty. This is more responsive but can overreact to a single use and weakens the existing sparse-evidence safeguard; owner must define a separate minimum before implementation.
- **C — Summary-only in this phase:** expose the existing personal summary for explanation but do not change candidate order until Phase 2d defines a reviewed multi-signal policy.

No universal score is proposed. The domain has multiple outcome dimensions with different vocabularies, and the current contract does not specify how to trade (for example) satisfaction against dryness or breakage observation. The policy must either name the field(s) that may affect ranking and their ordinal direction, or defer the affected field. “Unknown” and missing remain neutral; they are never negative outcomes. A personal signal must not raise confidence by itself.

**Decision:** **defer personal outcome influence to Phase 2d.** No Cue Check summaries are added to the Phase 2a engine input, and no personal outcome changes candidate order in Phase 2a. Phase 2d must define eligible fields, comparable-context matching, minimum sample and recency policy, sparse-evidence fallback, explanations, and versioned engine input before implementation.

### 4. Exact capability binding and fail-closed policy

The existing schema and applicability function already implement exact owner-row plus catalogue ID/version/market matching, use-scope equality, and evaluation-time validity checks. Proposed acceptance semantics are:

- A capability may apply only to the exact owner-owned row and exact catalogue identity, version, and market for which it was reviewed.
- A new catalogue version or market needs its own reviewed binding. No automatic inheritance from a prior version or another market.
- `reviewedAt` must be no later than the decision's fixed `evaluatedAt`; if `expiresAt` exists it must be strictly later than `evaluatedAt`. Evaluate these dates against the same fixed instant so replay is deterministic.
- Missing, unknown, malformed, unowned, wrong-scope, wrong-version, or wrong-market bindings cannot authorize a rule. Future-dated and expired reviews are inert. Product facts that cannot be verified must follow the existing restrictive fallback (`needs_input`, generic bounded guidance, or `no_protocol` as appropriate), never a product-specific positive claim.
- The owner row ID and catalogue identity stay separate: ownership of a shelf/tool row does not authorize a different catalogue subject.

**Decision:** **4A approved** with the exact-match and fail-closed semantics above. No cross-version, cross-market, or implicit inheritance exception is permitted.
**Implementation test boundary:** owned exact match; wrong owner row; wrong catalogue ID; wrong version; wrong market; wrong use scope; missing reference; future review timestamp; expiry equal to evaluation time; expired review; and valid exact binding. Every non-valid case must be shown not to authorize a product-specific rule.

## Decision record and next gate

All four owner choices have been recorded above. They authorize a shared typed-contract work order for the Phase 2a heat/product dimensions, followed by separately reviewed implementation work orders. Personal outcome ranking remains deferred to 2d. No code has yet changed in this decision worktree. Decisions here do not close independent database, authenticated Edge-to-RPC, Increment 6 evidence/approval, or final-review gates.

## Source references

- `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` §§7.5, 7.8, 10.
- `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md` §§2, 6, 8.
- `docs/superpowers/plans/2026-11-05-phase-2a-acceptance-closure.md` Tasks 1–2 and Phase 2a acceptance rule.
- `docs/verification/phase-2a-full-review-2026-11-02.md` “Requirements not established by the current implementation.”
- `docs/verification/phase-2a-status-2026-11-02.md` ranking and capability-version open items.
- Code reviewed through the codebase graph in `packages/engine/src/pipeline/state.ts`, `packages/engine/src/pipeline/stages/select-and-rank.ts`, `packages/engine/src/contracts.ts`, `packages/engine/src/pipeline/stage-runner.ts`, `packages/domain/src/cue-check.ts`, and `packages/domain/src/personal-outcome-summary.ts`.

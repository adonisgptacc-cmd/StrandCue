# Phase 2a acceptance closure implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task. Keep each task independently reviewable.

**Goal:** Close the remaining Phase 2a product-policy and verification gates, then prepare the isolated candidate for a reviewed local `main` integration.

**Architecture:** Keep ranking inside the pure deterministic engine and preserve the approved precedence. Complete the shared typed heat/product contract first, then run isolated work for heat/product ranking (WO-A), capability applicability (WO-B), authenticated local Edge verification (WO-C), and baseline database diagnostics (WO-D). Personal outcome ranking is deferred to Phase 2d. Integrate reviewed work into this candidate, complete combined verification, and only then prepare local `main` integration.

**Tech Stack:** TypeScript, Node 24, Vitest, Supabase CLI, local PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` §§7.5, 7.8, 12; `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md`; `docs/verification/phase-2a-status-2026-11-02.md`.

## Global constraints

- Preserve EN-01 determinism and canonical EN-02 order. Phase 2a implements through heat/product minimization; personal outcome ranking remains an explicit Phase 2d dependency and must be inserted before the final stable tie-break there.
- Hard eligibility and safety checks run before ranking. Personal outcomes cannot make an ineligible option eligible.
- Phase 2a does not consume personal outcomes. Phase 2d must preserve baseline order when personal evidence is sparse, show sample size, recency, context, and uncertainty, and avoid product-causation claims.
- Keep commerce, advertising, price, and retailer inputs out of engine types and ranking.
- Keep unknown facts explicit and restrictive; do not infer safety or due status from missing inputs.
- Run only with Node 24 and disposable local Supabase/PostgreSQL. Do not write to hosted Supabase, publish content, deploy, or push.
- Keep Increment 6 content/evidence/Human A/B closure as a separate workstream; do not import its migrations into this engine candidate.

## Review focus

1. Hard exclusions must remain binding, withdrawals must stop use in new decisions, reviewed successors must be explicitly authorized, and historical decisions must replay from their pinned ruleset.
2. Same versioned inputs and approved rules must return the same order, including stable ties. The Phase 2a heat/product stage uses Pareto dominance; trade-offs and unknown/incomparable values preserve pre-stage order. Personal-outcome handling is reviewed in Phase 2d, not claimed by this phase.
3. Decision and explanation records must retain rule IDs/versions, claim/evidence IDs, evidence strength, last-checked date, limitations, eligible alternatives, and blocker/caution/info severity; the two qualitative confidence dimensions must follow EVD-03 and derive only from approved rule inputs.
4. Exact capability applicability must bind catalogue identity/version/market and reviewed use scope; unknown, stale, unowned, or out-of-date bindings must fail closed.
5. The verifier and full migration/database chain must bind the authenticated owner, exact packet digest, computed hash, and privileged write; negative cases must fail without weakening assertions to hide timeouts.

## Parallel work order boundaries

After Task 1's ranking and capability decisions are recorded, the shared contract work order must complete first. Then the following implementation work orders may run in parallel from the latest reviewed candidate tip. Each must have its own worktree and reviewer:

- **WO-A — heat/product ranking:** `packages/engine/src/pipeline/stages/select-and-rank.ts` and engine ranking tests. Implement approved Pareto dominance over the reviewed ordinal heat-exposure level and distinct required-product count, only within equal goal-suitability groups. Since Pareto is a partial order, emit non-dominated frontiers in stable pre-stage order, then repeat. Unknown or cross-version dimensions are incomparable and cannot establish dominance. Do not implement personal-outcome influence in Phase 2a.
- **WO-B — capability applicability:** `packages/engine/src/pipeline/stage-runner.ts` and capability/ruleset tests. Reconcile exact catalogue identity, version, market, effective dates, and reviewed use scope to the approved contract. Do not edit shared schemas unless this work order is explicitly assigned that file.
- **WO-C — authenticated verification proof:** local Edge-to-RPC HTTP harness and focused server/database integration tests. Do not change the generic publication schema unless a verified defect requires a separately reviewed migration.
- **WO-D — baseline database diagnosis:** Node 24 setup, fresh local migration replay, full database suite, and timing diagnosis. No application behavior changes; any necessary fix becomes a separately scoped and reviewed work order.

The approved heat-exposure and product-burden measures require shared typed candidate fields, so a separately reviewed contract work order is required before WO-A/WO-B. It owns the include-candidate rule effect/schema, rule compiler representation, candidate state/population, and focused contract tests. WO-A and WO-B do not change those shared files independently.

The shared contract work order must complete and pass review before WO-A/WO-B start. Its commit becomes their common base and must be integrated into the candidate before either implementation work order is integrated.

Each work order reports its exact base SHA, changed paths, commands, results, skips, and unresolved items. No work order merges directly into local `main`. After review, integrate into this candidate and rerun combined verification because the work orders will not share a live test database or working tree.

---

### Task 1: Resolve ranking and capability contract decisions

**Files:**
- Read: `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`
- Read: `packages/engine/src/pipeline/stages/select-and-rank.ts`
- Read: existing verified-fact, goal-suitability, heat, and personal-outcome contracts in `packages/engine/src/`
- Read: `packages/engine/src/pipeline/stage-runner.ts` and compiled capability schemas
- Create: `docs/superpowers/specs/2026-11-05-phase-2a-product-contract-decisions.md`

**Interfaces:**
- Existing approved precedence is fixed: verified constraints → goal suitability → heat/product minimization → personal outcomes → stable tie-break.
- Existing candidate matching pins catalogue identity, version, market, and reviewed use scope. This task confirms the intended exact-version, date-validity, unknown-data, and ownership behavior against the canonical product rules.
- Owner decision on 2026-11-05: formally scope Phase 2a to its accepted core plus heat/product minimization. Personal outcome ranking remains a canonical product requirement assigned to Phase 2d; this plan must not claim it is delivered in Phase 2a.
- This task decides only the missing, reviewable inputs and comparison semantics within the approved precedence levels. It does not introduce a universal score or commerce data.

- [x] Trace every proposed ranking input to a canonical requirement and an existing verified source or approved future dependency; the reviewed ordinal heat-exposure source/version contract is owned by WO-S, with a HOLD condition if no approved source is available.
- [x] Reconcile the Phase 2a ranking acceptance requirement with the Phase 2 design's 2d personal-ranking scope; the owner approved the boundary and explicit dependency on 2026-11-05.
- [x] Present bounded choices for heat/product comparison semantics and personal-outcome signal handling, including data availability and trade-offs.
- [x] Record the owner's decisions: Pareto heat/product comparison with reviewed ordinal heat exposure and distinct required-product count; personal outcome ranking deferred to 2d.
- [x] Reconcile capability binding for exact catalogue identity/version/market, reviewed use scope, date validity, owned-row matching, and unknown/stale records; the owner approved exact-match/fail-closed behavior and negative tests.
- [x] Record that no scalar weight is approved; if a reviewed heat-exposure source cannot be established in WO-S, defer that required input and keep Phase 2a on HOLD rather than inventing a proxy.

**Exit:** Dated owner decisions and the exact Phase 2d personal-ranking handoff are recorded in `docs/superpowers/specs/2026-11-05-phase-2a-product-contract-decisions.md`.

### Task 2 / WO-S: Add the shared heat/product ranking contract

**Files:**
- Modify: `packages/engine/src/contracts.ts` (typed include-candidate measures and strict validation)
- Modify: `packages/engine/src/pipeline/state.ts` and `packages/engine/src/pipeline/stages/load-verified-facts.ts` (carry rule-provided measures into candidates)
- Modify: `packages/engine/src/rules/ir.ts` and `packages/engine/src/rules/compile-rules.ts` only as required to preserve the typed effect values
- Test: focused engine contract, compiler, and candidate-accumulation tests

**Interfaces:**
- Add typed include-candidate inputs for a reviewed ordinal heat-exposure value and the count of distinct required product items/steps; carry them into candidate state. Both are pinned by the enclosing ruleset content hash/schema version. Ordinal values support ordering only; arithmetic distance between levels has no meaning.
- Unknown heat exposure or product burden is explicit; unknown is not zero, the lowest tier, or evidence of superiority.
- Pareto comparison applies only within the same pinned ruleset. Unknown values are incomparable. Do not add scalar weights or commercial inputs.
- Preserve the canonical stage order. Personal-outcome inputs remain absent until Phase 2d.

- [ ] Add contract tests for valid, unknown, malformed, and differently versioned ruleset values; the engine must not compare records across rulesets.
- [ ] Ensure repeated include effects for one candidate combine deterministically; conflicting or missing measure inputs remain explicit unknowns rather than selecting a favorable value.
- [ ] Ensure candidate identity/provenance and deterministic serialization remain valid.
- [ ] Do not derive an ordinal from raw heat method, temperature, pass, or duration. If no reviewed ruleset input can provide the ordinal value, stop and keep Phase 2a on HOLD.
- [ ] Run focused engine tests, typecheck, and lint; obtain independent review before integrating this commit into the candidate.

**Exit:** WO-S has a reviewed typed contract and tests, suitable as the common WO-A/WO-B base. The contract carries explicit ordinal values supplied by the reviewed ruleset; it does not derive them from raw method/temperature/pass/duration. Synthetic fixtures may exercise the contract, while production content remains subject to its separate review gates.

### Task 3 / WO-A: Implement approved heat/product Pareto ranking

**Files:**
- Modify: `packages/engine/src/pipeline/stages/select-and-rank.ts`
- Test: `tests/engine/pipeline/stages.test.ts`
- Test: `tests/engine/properties/determinism.test.ts`
- Test: `tests/engine/properties/metamorphic.test.ts`

**Interfaces:**
- Preserve `selectAndRank` as the `select_and_rank` stage and `compareCandidates(left, right): number` as its deterministic ordering boundary unless the approved decision requires a typed replacement.
- Consume only the typed inputs from reviewed WO-S.

- [ ] Add failing tests for goal-suitability precedence, Pareto dominance within equal-suitability groups, stable ordering of non-dominated frontiers, and stable ties.
- [ ] Add failing tests proving hard exclusions cannot be reversed and trade-offs or unknown/incomparable dimensions preserve pre-stage order.
- [ ] Add or retain tests proving withdrawal prevents use in new decisions, historical decisions replay from the pinned parent ruleset, and successor rules require their reviewed parent/authorization bindings.
- [ ] Implement only the approved semantics; keep personal outcome influence deferred to 2d and commercial fields absent from engine contracts.
- [ ] Run the engine suite and engine coverage configuration; record exact test count and all coverage percentages.
- [ ] Run typecheck and lint; commit this task separately after independent review.

**Exit:** Phase 2a ordering through heat/product minimization is deterministic, tested, explainable, and covered by the engine coverage gate. Personal outcome ranking remains a named Phase 2d dependency and is not claimed as delivered in 2a.

### Task 4 / WO-C: Prove authenticated hash verification over local HTTP

**Files:**
- Review: `supabase/functions/verify-engine-ruleset/handler.ts` and `index.ts`
- Review: `supabase/migrations/20261104123000_engine_ruleset_hash_verification.sql` and `20261104124000_use_claim_role_for_engine_hash_verification.sql`
- Review: `tests/server/verify-engine-ruleset.test.ts` and `tests/database/engine-ruleset-publication.test.ts`
- Create or modify: a local-only integration harness/test if the existing tests do not exercise the actual Edge-to-RPC path

**Interfaces:**
- Send `POST /functions/v1/verify-engine-ruleset` with `Authorization: Bearer <owner-token>`, `Content-Type: application/json`, and exactly `{"publicationId":"<uuid>","packetDigest":"sha256:<64 lowercase hex>"}`.
- Authenticated owner reads only their exact draft by publication ID and packet digest.
- The Edge Function validates the engine schema and computes the canonical hash server-side; the service-role RPC records only the matching tuple.
- A successful response returns `status: "verified"`, the publication ID, packet digest, and computed content hash; it does not return the ruleset packet.
- Database publication and privileged loading require the exact verified tuple plus distinct packet-bound author/reviewer approvals.

- [ ] Start the disposable local Supabase stack and confirm the target project is local before applying or resetting migrations.
- [ ] Exercise a successful authenticated owner request through Edge HTTP and verify the expected private verification row exists.
- [ ] Exercise unauthenticated, wrong-owner, stale-digest, changed-packet, invalid-schema, hash-mismatch, and client-attempted privileged-write cases; confirm no invalid verification row or publication results.
- [ ] Confirm response bodies disclose no packet contents, service credentials, or unrelated account data.
- [ ] Confirm all synthetic data is rolled back or removed and that publication remains blocked without distinct approvals.

**Exit:** The successful owner-to-Edge-to-service-RPC flow and all negative cases pass against local Supabase; no hosted project was selected or touched.

### Task 5 / WO-D: Replay migrations and diagnose the database suite

**Files:**
- Verify: all candidate migrations and `tests/database/`
- Update: `docs/verification/phase-2a-status-2026-11-02.md`

**Interfaces:**
- Use Node 24 as required by `package.json`; use a fresh disposable PostgreSQL 17/Supabase instance for migration replay and opt-in real-PostgreSQL proofs.
- Do not mix the separate Increment 6 Human A/B migration pair into the Phase 2a candidate.

- [ ] Confirm Node 24 with `npm run check:runtime` and confirm the local Supabase project/ports before destructive local reset.
- [ ] Replay the candidate migration chain from a fresh local database and verify migration history is complete.
- [ ] Run the full database suite with bounded workers, then run every env-gated real-PostgreSQL proof required by the Phase 2a review.
- [ ] Investigate the prior treatment-history timing failure (14.9 seconds against an 8-second limit). Separate resource contention from algorithmic scaling; change a threshold only if the requirement owner approves the revised bound and its rationale.
- [ ] Run full repository typecheck, lint, and bounded test suite after database fixes; capture command, runtime version, counts, skips, and failures.

**Exit:** Fresh migration replay passes; database and real-PostgreSQL suites pass or any unresolved failure is documented with a named owner and Phase 2a stays HOLD.

### Task 6: Integrate reviewed work orders and rerun combined verification

**Files:**
- Integrate: reviewed WO-S first, followed by WO-A, WO-B, and WO-C commits into `codex/phase2a-integration-candidate`
- Verify: complete candidate and local migration chain

- [ ] Confirm each work-order base is the planned candidate SHA and no worktree contains unrelated dirty paths.
- [ ] Inspect and integrate reviewed WO-S first; confirm WO-A/WO-B use that exact contract base. Then inspect and integrate only the reviewed WO-A/WO-B/WO-C slices; retain WO-D as evidence unless it has a separately reviewed code fix.
- [ ] Run `npm run check:runtime`, `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=8 tests/engine tests/server tests/domain`, and `npm test -- --maxWorkers=8 tests/database` on Node 24.
- [ ] Replay migrations on a fresh disposable local PostgreSQL 17 instance and rerun the local Edge HTTP proof plus all required real-PostgreSQL proofs.
- [ ] Run the bounded full repository suite with `npm test -- --maxWorkers=8`; record exact counts, skips, runtime, and any environment constraints.

**Exit:** Reviewed work orders integrate without unrelated paths, and combined verification is green. Any failure keeps the candidate on HOLD and gets a named remediation work order.

### Task 7: Final independent acceptance review

**Files:**
- Review: complete candidate diff from local `main` to `codex/phase2a-integration-candidate`
- Update: `docs/verification/phase-2a-status-2026-11-02.md`
- Reference: `docs/verification/phase-2a-full-review-2026-11-02.md`

- [ ] Give a fresh reviewer the canonical spec, ranking decision, migration/HTTP evidence, and complete candidate diff.
- [ ] Require review of policy-to-code traceability, fail-closed paths, owner/identity boundaries, replay compatibility, deletion anonymization, and integration scope.
- [ ] Require explicit evidence that capability-version applicability is closed, and that decision/audit traces retain rule `{ id, version }`, claim/evidence IDs, reason content, and `blocker|caution|info` severity without changing hard-rule authority.
- [ ] Verify `instructionCompleteness: low|moderate|high` and `suitability: limited|moderate|high` follow EVD-03, use only approved rule-derived inputs, and do not rise from evidence IDs or personal observations alone; if not established, name the owner/work order and keep any required 2a criterion on HOLD.
- [ ] Require explicit evidence for explanation fields: evidence strength, last-checked date, limitations, and eligible alternatives; if these are a later-phase dependency, name it and keep any required Phase 2a criterion on HOLD.
- [ ] Verify withdrawal change safety: new authoritative decisions use only the current valid ruleset, open cached plans are revalidated before resume/heat/treatment steps, and the old pinned ruleset remains available for historical replay. If the client freshness path belongs to a later phase, record the exact handoff and do not claim that client behavior is delivered here.
- [ ] Fix all Critical and Important findings and rerun the checks affected by each fix.
- [ ] Update the status record from captured evidence. Mark Phase 2a ACCEPTED only if every required contract and verification gate is closed; otherwise retain HOLD and list the exact remaining gate.

**Exit:** Independent review has no unresolved Critical/Important findings and the status report accurately distinguishes verified behavior from deferred work.

### Task 8: Prepare local `main` integration

**Files:**
- Review: candidate diff and merge-base against local `main`
- Update: repository state and disposition records after any approved integration

- [ ] Confirm the candidate contains only Phase 2a work and report its merge base, commits, migrations, and verification evidence.
- [ ] Present the exact integration diff and conflict plan for the owner's final local-main approval.
- [ ] After approval, integrate locally and rerun post-merge smoke checks; do not rewrite unrelated branches or worktrees.
- [ ] Keep remote reconciliation, push, hosted Supabase, publication, and deployment as separate operations requiring their own explicit authorization.

**Exit:** The reviewed candidate is integrated locally only after the final diff is approved; remote and production systems remain unchanged.

## Phase 2a acceptance rule

Personal outcome ranking is not a Phase 2a acceptance criterion after the owner-approved 2026-11-05 scope decision; it remains required in Phase 2d. Phase 2a remains `PARTIAL / HOLD` if the approved heat/product Pareto contract is not implemented and tested, authenticated Edge-to-RPC behavior is unproven, the required database evidence is incomplete, or independent review has unresolved important findings. Passing code tests alone does not satisfy the product-policy or trust-boundary gates.

## Separate release work

Increment 6 still requires production source evidence, the reviewed product/tool capability registry, evidence-backed copy and bindings, distinct Human A/B approvals, and device/accessibility acceptance. Those gates remain on the Increment 6 workstream and do not get marked complete by Phase 2a engine acceptance. Dependency-policy clearance is also a separate release gate.

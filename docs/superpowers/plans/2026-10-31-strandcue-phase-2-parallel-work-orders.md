# StrandCue decision engine Phase 2 parallel work orders

> **For agentic workers:** Use the assigned OpenCode MiniMax or Claude session in its own Git worktree. Do not share a worktree. Work orders marked as parallel may start only after the contract baseline has been reviewed and merged. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Phase 2a deterministic decision-engine core in independently reviewable worktrees, then prepare the existing Increment 6 Heat Coach work to consume the shared engine without creating a second authority.

**Architecture:** Establish a shared `@strandcue/engine` contract first. Then implement its ten pure decision stages and typed rules compiler in separate worktrees against that frozen contract. Merge those branches into the main worktree only after individual review, then build golden/property/replay verification and reconcile the result with Increment 6.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 5, existing npm workspaces, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md`

## Global constraints

- Same canonical snapshot, evaluation time, ruleset hash and engine/schema versions produce the same decision.
- The ten stages come from `StrandCue-PRD.md` §12; the canonical product specification is current authority if requirements conflict.
- Within those ten boundaries, preserve canonical EN-02 ordering: verified compatibility/order constraints before goal suitability; heat/product minimization before personal outcome ranking; stable tie-breaks after ranking.
- Unknown or contradictory facts never become safe, green, eligible or due.
- The pure engine performs no I/O, clock reads, randomness, AI calls or mutable global access.
- The server remains authoritative; device evaluation is a labelled preview/freshness check only.
- No real product/tool facts or production Heat Coach content are introduced; use visibly synthetic fixtures.
- Heat Coach’s seven Increment 6 assessment states remain a domain contract layered with engine outcomes; do not silently replace either vocabulary.
- Human A authors/assembles; a different Human B independently reviews with documented relevant competence. Publication stays blocked until the two-person gate passes.
- Do not add product, price, retailer, advertising or commerce fields to engine input or ranking.
- Every work order is completed in a unique `codex/` branch and worktree. Do not push, deploy, apply hosted migrations or merge to the primary worktree before Codex review and the owner’s final integration approval.

## Review focus

- Missing, contradictory, expired or withdrawn facts must fail closed and remain visible in the audit trace.
- Backdated corrections and revision changes must not mutate previously stored decisions or make stale decisions current.
- A withdrawal must stop execution of the withdrawn rule for new decisions while historical decisions remain replayable from their pinned ruleset.
- Decision ordering and tie-breaks must remain stable when input arrays are reordered.
- Cyclic dependencies and unsatisfied hard requirements must return a non-actionable result with a trace, never a partial executable plan.

---

## Worktree and merge protocol

Each work order has its own branch/worktree. Do not create task branches from the current `codex/signup-consent` checkout by assumption. First confirm that the approved design and this plan are present in the designated primary/main worktree, record its exact HEAD as the base SHA, and start Work Order 1 from that base. Example pattern:

```powershell
git worktree add -b codex/phase2-contracts C:\Users\ABADO\.codex\worktrees\phase2-contracts\StrandCue <approved-base>
```

After Work Order 1 is reviewed and merged into the main worktree, create the Work Orders 2 and 3 worktrees from that same new base. They may run in parallel. Do not merge one worker branch into the other. After both pass review and are merged into the main worktree, create Work Order 4 from the updated base. Work Order 5 runs in a dedicated integration worktree, then receives a final review before the owner approves the local merge to the primary/main worktree.

The planner/operator, not the worker model, owns worktree creation, branch naming, integration, merge conflict resolution and final status. Each model must report its branch, base SHA, commit SHA, changed files, verification commands/results and any blocked item.

## Work Order 1: Freeze engine contracts and workspace boundary

**Execution:** Codex/coordinator first; separate worktree `codex/phase2-contracts`.

**Files:**
- Create: `packages/engine/package.json`
- Create: `packages/engine/src/index.ts`
- Create: `packages/engine/src/contracts.ts`
- Create: `tests/engine/contracts.test.ts`
- Modify: `package.json` (add `packages/engine` to the lint command; workspace glob and TypeScript include already cover it)

**Interfaces:**
- Produces the only public contract consumed by later work orders.
- Export `DecisionStatus`, `EngineStageId`, `HeatAssessmentState`, `RulesetRef`, `CanonicalSnapshot`, `RuleAuthoringBundle`, `RuleExpression`, `RuleEffect`, `CompiledRule`, `CompiledRuleset`, `RuleDiagnostic`, `EngineInput`, `StageTraceEntry`, `EngineDecision`, `DecisionStep`, `DecisionOmission`, `DecisionAlternative`, `DecisionQuestion`, `DecisionConfidence`, `DecisionAudit`, and `evaluateDecision(input: EngineInput): EngineDecision`.
- `EngineStageId` order is `validate_snapshot`, `apply_safety_restrictions`, `load_verified_facts`, `derive_treatment_state`, `filter_candidates`, `evaluate_heat`, `select_and_rank`, `build_dependency_graph`, `order_and_validate`, `assemble_decision`.
- `DecisionStatus` is `decided | needs_input | blocked | no_protocol`.
- `HeatAssessmentState` preserves Increment 6: `content_pending | needs_input | restricted | lower_heat | no_heat | appropriate | unavailable`.
- Valid status pairs are `decided` with `lower_heat | no_heat | appropriate`; `needs_input` with `needs_input`; `blocked` with `content_pending | restricted`; and `no_protocol` with `unavailable`.
- `RulesetRef` contains `rulesetId`, `contentHash`, `schemaVersion` and `evaluatorVersion`. `CompiledRuleset` contains that ref plus immutable compiled rules. `RuleExpression` and `RuleEffect` are discriminated whitelists, never arbitrary JavaScript. `RuleAuthoringBundle` contains the immutable bundle identity/version, decision tables, constraints and required rule fixtures. `RuleDiagnostic` contains a stable code, severity and optional rule/row identity.
- `EngineInput` contains the normalized Passport, chemical/service history, Shelf, Tools, versioned event history and revision set, explicit ISO evaluation instant, and the compiled ruleset whose ref is pinned. It contains no free-text safety input or commercial fields.
- `EngineDecision` contains `status`, ordered `steps`, `omissions`, `alternatives`, ranked `questions`, optional Heat Coach assessment, the two qualitative `confidence` dimensions, and `audit`. Audit includes the pinned ruleset hash, engine/schema versions, and ten ordered `StageTraceEntry` records; each trace records stage ID, outcome, and referenced rule/claim/evidence IDs.
- The implementation plan must define the valid outer-status/domain-state combinations in schema tests. Keep both vocabularies; fail closed on invalid pairs.

- [ ] **Step 1: Write contract tests.** Pin status enums, required decision fields, non-commercial input shape, the ten stage identifiers in order, and valid Heat Coach status combinations.
- [ ] **Step 2: Run contract tests to verify they fail.** Run `npm test -- tests/engine/contracts.test.ts`. Expected: FAIL because the package contract is absent.
- [ ] **Step 3: Add the workspace package and exported contracts.** Use Zod 4 schemas for runtime validation and inferred TypeScript types; export only stable contract names from `src/index.ts`.
- [ ] **Step 4: Include the package in lint and typecheck.** Run `npm run typecheck:domain` and `npm run lint`. Expected: PASS with the new package and its tests included.
- [ ] **Step 5: Commit the reviewed baseline.** Commit `feat: establish decision engine contracts` and merge to the primary worktree before opening parallel worktrees.

## Work Order 2: Implement the typed ten-stage evaluator

**Execution:** Claude, in its own worktree `codex/phase2-pipeline`; starts after Work Order 1 is reviewed and merged. Runs parallel with Work Order 3.

**Files:**
- Create: `packages/engine/src/pipeline/index.ts`
- Create: `packages/engine/src/pipeline/stages/validate-snapshot.ts`
- Create: `packages/engine/src/pipeline/stages/apply-safety-restrictions.ts`
- Create: `packages/engine/src/pipeline/stages/load-verified-facts.ts`
- Create: `packages/engine/src/pipeline/stages/derive-treatment-state.ts`
- Create: `packages/engine/src/pipeline/stages/filter-candidates.ts`
- Create: `packages/engine/src/pipeline/stages/evaluate-heat.ts`
- Create: `packages/engine/src/pipeline/stages/select-and-rank.ts`
- Create: `packages/engine/src/pipeline/stages/build-dependency-graph.ts`
- Create: `packages/engine/src/pipeline/stages/order-and-validate.ts`
- Create: `packages/engine/src/pipeline/stages/assemble-decision.ts`
- Create: `tests/engine/pipeline/*.test.ts`
- Create: `packages/engine/src/pipeline/index.ts` to export the pipeline module. The package root export stays owned by the coordinator/integration work order.

**Interfaces:**
- Consumes Work Order 1 contracts and the compiled ruleset contract as defined there.
- Produces `evaluateDecision(input: EngineInput): EngineDecision` and one typed pure function per `EngineStageId`.
- Each stage returns its typed next intermediate plus an ordered trace; no stage reads external state.

- [ ] **Step 1: Write failing tests for each stage boundary.** Cover unknown resolution, safety restrictions, exact fact applicability, treatment state, hard compatibility/order filtering, heat alternatives, canonical goal-suitability → heat/product-minimization → personal-outcome ranking with stable UUID tie-breaks, dependency construction, cycles/prerequisites and final audit assembly.
- [ ] **Step 2: Run focused tests to verify they fail.** Run `npm test -- tests/engine/pipeline`. Expected: FAIL with missing stage exports.
- [ ] **Step 3: Implement the ten pure stage functions.** Keep every intermediate typed and every stage trace in canonical order; use stable explicit tie-breaks.
- [ ] **Step 4: Run focused and full package verification.** Run `npm test -- tests/engine/pipeline`, `npm run typecheck:domain`, and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit the evaluator.** Commit `feat: implement deterministic decision pipeline`; report the base SHA and all verification results.

## Work Order 3: Implement typed rule DSL and compiler checks

**Execution:** OpenCode MiniMax, in its own worktree `codex/phase2-rules`; starts after Work Order 1 is reviewed and merged. Runs parallel with Work Order 2.

**Files:**
- Create: `packages/engine/src/rules/authoring-schema.ts`
- Create: `packages/engine/src/rules/ir.ts`
- Create: `packages/engine/src/rules/compile-rules.ts`
- Create: `packages/engine/src/rules/analyze-rules.ts`
- Create: `tests/engine/rules/authoring-schema.test.ts`
- Create: `tests/engine/rules/compile-rules.test.ts`
- Create: `tests/engine/rules/analyze-rules.test.ts`
- Create: `packages/engine/src/rules/index.ts` to export the rules module. The package root export stays owned by the coordinator/integration work order.

**Interfaces:**
- Consumes the frozen `RulesetRef`, `StageTraceEntry` and engine outcome contracts from Work Order 1.
- Produces `compileRules(source: RuleAuthoringBundle): CompiledRuleset` and `analyzeRules(bundle: RuleAuthoringBundle): readonly RuleDiagnostic[]`, using the frozen Work Order 1 contracts without editing `contracts.ts`.
- Rule forms are decision tables with explicit `first | collect | unique` hit policy and constraints for order, waits, prerequisites and eligibility. Both compile into one immutable typed IR.

- [ ] **Step 1: Write failing schema/compiler tests.** Include malformed types/effects, unsupported operators, table hit policies, rule identity/version requirements and evidence references.
- [ ] **Step 2: Write failing static-analysis tests.** Pin diagnostics for unreachable rows, overlapping cells incompatible with hit policy, unresolved hard conflicts, and missing positive or negative fixtures for a hard rule.
- [ ] **Step 3: Run rule tests to verify they fail.** Run `npm test -- tests/engine/rules`. Expected: FAIL with missing compiler/schema exports.
- [ ] **Step 4: Implement the whitelist schema, immutable IR compiler and deterministic diagnostics.** No arbitrary JavaScript evaluation and no database/authoring UI.
- [ ] **Step 5: Run rule tests, typecheck and lint.** Run `npm test -- tests/engine/rules`, `npm run typecheck:domain`, and `npm run lint`. Expected: PASS.
- [ ] **Step 6: Commit the compiler.** Commit `feat: compile reviewed decision rules`; report the base SHA and all verification results.

## Work Order 4: Add decision quality, replay and mutation evidence

**Execution:** Claude or OpenCode MiniMax after Work Orders 2 and 3 have both passed review and merged. Use a new worktree `codex/phase2-verification` from the updated main worktree.

**Files:**
- Create: `packages/engine/src/replay/replay-decisions.ts`
- Create: `packages/engine/src/replay/index.ts`
- Create: `packages/engine/src/replay/replay-case.ts`
- Create: `packages/engine/src/replay/replay-report.ts`
- Create: `tests/engine/fixtures/golden/*.json`
- Create: `tests/engine/golden-decisions.test.ts`
- Create: `tests/engine/properties/determinism.test.ts`
- Create: `tests/engine/properties/metamorphic.test.ts`
- Create: `tests/engine/replay/replay-decisions.test.ts`
- Create: `tests/engine/mutation/hard-rule-mutants.test.ts`
- The package root export stays owned by the coordinator/integration work order; tests may import `src/replay` directly.

**Interfaces:**
- Consumes `EngineInput`, `EngineDecision`, `CompiledRuleset`, and `evaluateDecision` from Work Orders 1–3.
- Produces `ReplayCase` (historical `EngineInput` with pinned ruleset plus historical `EngineDecision`) and `replayDecisions(cases: readonly ReplayCase[], candidate: CompiledRuleset): ReplayReport`.
- A replay report records changed decisions and stable references to the old/new ruleset hashes; it does not persist owner snapshots or contact production services.

- [ ] **Step 1: Add synthetic golden fixtures and reviewed expected decisions.** Fixtures must be clearly synthetic and contain no real user or product safety claims.
- [ ] **Step 2: Add seeded property tests.** Cover determinism, input-order independence, irrelevant-candidate invariance, stable ties, acyclic results, and unknown facts never producing GREEN or due status.
- [ ] **Step 3: Add metamorphic and withdrawal tests.** Tightening restrictions cannot loosen a decision; withdrawn rules do not run for new decisions; old decisions replay against pinned rulesets. A newly allowed action requires an explicit reviewed successor rule.
- [ ] **Step 4: Add replay comparison tests.** Candidate rulesets report exact decision changes without modifying historical snapshots.
- [ ] **Step 5: Add mutation evidence for hard-rule branches.** Use deterministic, explicit mutants for omitted/negated hard constraints; do not add a new mutation dependency without recording its cost and approval in the review summary.
- [ ] **Step 6: Run engine tests, typecheck and lint.** Run `npm test -- tests/engine`, `npm run typecheck:domain`, and `npm run lint`. Expected: PASS.
- [ ] **Step 7: Commit the verification harness.** Commit `test: verify decision engine invariants and replay`; report base SHA and results.

## Work Order 5: Reconcile Heat Coach and Increment 6 with the shared engine

**Execution:** Separate worktree `codex/phase2-heat-coach`, only after Work Order 4 passes and the active Increment 6 I6.0–I6.6 work is closed/reconciled. This work order does not replace or duplicate the existing Increment 6 plan.

**Files:**
- Modify only the existing Heat Coach domain/API/mobile files named by `docs/superpowers/plans/2026-10-24-increment-6-heat-coach.md` where an adapter is required.
- Create: `packages/domain/src/guidance/heat-coach-engine-adapter.ts` only if the current Heat Coach domain cannot consume the engine contract directly.
- Create: `tests/domain/guidance/heat-coach-engine-adapter.test.ts` if an adapter is required.
- Do not change engine contracts, engine stages, or rules compiler from this worktree.

**Interfaces:**
- Consumes the shared engine evaluator and the existing `HeatCoachInput`, exact versioned heat publication, server assessment RPC, mobile result contract and seven Heat Coach assessment states.
- Produces one validated mapping between engine-level statuses and Heat Coach assessment states. Server-generated assessment remains authoritative; device previews remain labelled non-authoritative.

- [ ] **Step 1: Re-read I6.0–I6.6 plan and current integration evidence.** Identify exact duplicate or adapter boundary; do not assume planned files are implemented.
- [ ] **Step 2: Add contract tests for the status mapping and stale/withdrawn behavior.** Production remains `content_pending` until distinct Human A/B approvals exist.
- [ ] **Step 3: Implement the thinnest adapter or document that none is needed.** Preserve server reconstruction, immutable stored assessment and owner isolation.
- [ ] **Step 4: Run focused I6/engine integration tests, typecheck and lint.** Expected: PASS; any real content remains blocked/draft.
- [ ] **Step 5: Commit the adapter/reconciliation.** Commit `feat: bind Heat Coach to shared decision engine`; report base SHA and verification.

## Work Order 6: Integrate and close in the main worktree

**Execution:** Codex integrator in a dedicated `codex/phase2-integration` worktree; final merge into the primary/main worktree only after review.

**Files:**
- Integration-only; do not add features or change task-owned behavior without returning a focused fix to its work order.

**Interfaces:**
- Consumes reviewed commits from Work Orders 1–5 and their recorded verification results.
- Produces one integrated local branch and a closure record with commit SHAs, tested base, results, unresolved gates and merge recommendation.

- [ ] **Step 1: Record base/branch/HEAD and inspect each task diff.** Confirm each task branch has a unique worktree, no unrelated changes and no secret or production content.
- [ ] **Step 2: Merge reviewed commits in dependency order.** Contracts → pipeline and rules compiler → verification/replay → Heat Coach reconciliation. Only the integration worktree edits the package root `packages/engine/src/index.ts`. Resolve conflicts in the integration worktree only.
- [ ] **Step 3: Run full local checks.** Run `npm run check:runtime`, `npm run typecheck`, `npm run lint`, `npm test -- tests/engine`, the full `npm test`, and `npm run audit:control-plane`. Record actual outputs; do not substitute skipped/blocked gates with claims of success.
- [ ] **Step 4: Request fresh code/security review.** Fix every high-severity finding in the owning worktree and repeat affected checks.
- [ ] **Step 5: Write the closure report and ask for final local merge approval.** No push, deploy, hosted migration or publication is part of this plan.

## Scope deferred to separately approved plans

- Phase 2c Today’s Protocol execution/timers and Phase 2d Routine Audit/Shelf Scan with personal ranking require separate plans after Phase 2a and Increment 6 close.
- Canonical product plan items 7–9 (reminders/weather/travel/calendar; Routine Audit/comparison; barcode/OCR/import moderation) remain separate roadmap work and are not hidden inside these work orders.
- Reviewer queue UX, the 180-day review reminder operation, production kill switch and rollback-to-prior-ruleset operation need a separate content-operations work order before any safety-relevant ruleset can publish. This is required Phase 2 scope, not optional polish; the current work orders keep production publication blocked.
- Production safety-content review, privacy-practitioner review, signed offline windows, visual rule-authoring UI, reaction reports and community aggregates remain blocked or deferred as stated in the design spec.

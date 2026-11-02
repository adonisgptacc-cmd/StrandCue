# Phase 2a closure remediation plan

> **For agentic workers:** Use isolated worktrees for each independent work order. Follow test-driven development. The coordinator owns branch creation, integration, and final review.

**Goal:** Close the Phase 2a findings from the 2 November end-to-end review without changing hosted services or activating production content.

**Architecture:** Start from the reviewed SHA-256 follow-up commit `5e9d52ff7904a8503e2f6f3cd90bcf5b38c90326`. Implement runtime identity verification, compiler/analyzer correctness, and engine coverage in separate worktrees. Then reconcile the remaining engine contracts against the approved product specification before implementing dependent behavior.

**Tech Stack:** TypeScript 6, Zod 4, Vitest 5, npm workspaces, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md`

## Global constraints

- Keep `packages/engine` pure: no I/O, clock reads, randomness, AI calls, or mutable global access.
- Same canonical input, evaluation instant, ruleset identity, and engine/schema versions must produce the same decision.
- Unknown or contradictory facts must not become safe, eligible, green, or due.
- Preserve the ten ordered engine stages and the canonical product specification's precedence.
- Ruleset identity must bind the exact capabilities and compiled rules that are executed.
- Test compiler output through the evaluator; direct synthetic `CompiledRule` fixtures do not replace those integration checks.
- Keep production content empty/draft. No publication, hosted migration, deployment, or push is part of this plan.
- Phase 2b Heat Coach authority migration remains blocked until Increment 6 is closed.

## Review focus

- A compiled ruleset altered after hashing is rejected before any effect executes; test by changing one effect while retaining the original hash.
- Cross-stage effect combinations fail at compile time with a stable diagnostic; test inclusion plus prerequisite in one rule.
- Mutually exclusive conditions do not create false hard conflicts; test `f-ready=true` against `f-ready=false`.
- Duplicate or subsumed `first` rows are reported unreachable for every supported expression form; test identical `not` and `any` expressions.
- Engine files are present in coverage collection and the configured floor is reported; prove with the targeted engine coverage command.

## Worktree protocol

Base every work order on `5e9d52ff7904a8503e2f6f3cd90bcf5b38c90326`. Each worker uses a distinct `codex/phase2a-*` branch and worktree. Do not merge worker branches into one another. The coordinator reviews each completed work order and integrates only after its focused checks pass. Do not merge into local `main` until the owner approves that integration.

## Work order 1: Bind runtime decisions to the ruleset hash

**Files:**
- Modify `packages/engine/src/canonical-json.ts` or add a focused ruleset-identity module.
- Modify `packages/engine/src/pipeline/stages/validate-snapshot.ts`.
- Test `tests/engine/pipeline/validate-snapshot.test.ts` and/or the existing engine input contract suite.

**Interface:** Export one shared function that returns the prefixed SHA-256 identity for the canonical `{ capabilities, rules }` payload. The compiler and evaluator validator must use the same function.

- [ ] Add a test that compiles a ruleset, changes a rule effect without changing the reference, and expects evaluation to reject it before executing effects.
- [ ] Run the focused test and verify it fails because the tampered ruleset is currently accepted.
- [ ] Add the shared content-hash function and evaluator-boundary comparison. Preserve array order where it affects rule/table semantics; canonicalize only semantically unordered data.
- [ ] Add cases for capability changes, rule changes, valid compiled content, and canonical object-key ordering.
- [ ] Run focused engine tests, typecheck and lint; record exact output.

## Work order 2: Make compiler and analyzer decisions sound

**Files:**
- Modify `packages/engine/src/rules/compile-rules.ts`.
- Modify `packages/engine/src/rules/analyze-rules.ts`.
- Test `tests/engine/rules/compile-rules.test.ts` and analyzer tests.
- Add compiler-to-evaluator integration cases under `tests/engine/rules/`.

**Interface:** Compilation either returns rules whose effects are supported by their assigned stage or fails with a stable diagnostic. Conflict and reachability analysis must retain rule conditions and table hit policy.

- [ ] Add failing tests for mixed `include_candidate`/`require_prerequisite` effects, disjoint hard include/exclude conditions, and repeated `first` rows using identical `not` and `any` expressions.
- [ ] Run those tests and confirm each failure demonstrates the reviewed defect.
- [ ] Reject unsupported cross-stage effects at compile time.
- [ ] Preserve conditions for conflict checks; prove disjointness conservatively and fail closed when overlap cannot be ruled out.
- [ ] Detect structurally identical or implied prior `first` rows for every accepted expression form.
- [ ] Exercise valid and invalid rules through `compileRules` and `evaluateDecision`, not only hand-built compiled rules.
- [ ] Run focused rules tests, the full engine suite, typecheck and lint.

## Work order 3: Enforce coverage for the engine package

**Files:**
- Modify `vitest.config.ts`.
- Add or adjust only the smallest focused tests needed to raise measured engine coverage.

- [ ] Include `packages/engine/src/**/*.ts` in coverage collection.
- [ ] Set a coverage threshold that matches the repository's required floor and applies to engine source files.
- [ ] Run the engine coverage command and record statement, branch, function and line percentages, including any intentionally excluded generated files.
- [ ] Raise coverage through behavior tests for uncovered decision and rejection paths; do not weaken the threshold to make the check pass.
- [ ] Run coverage, typecheck and lint.

## Work order 4: Reconcile the remaining engine contracts

This work order starts after Work Orders 1–3 are reviewed. Read the canonical product specification and the Phase 2 design before editing schemas.

**Files expected to change:** engine contracts and stages, replay contracts/implementation, targeted engine tests, and this plan's status.

- [ ] Define exact version matching for product/tool capability applicability. The executable contract must identify a catalogue version, not only a subject ID.
- [ ] Define and test how treatment history yields a due state and how rules consume that state.
- [ ] Implement the ranking order required by the canonical product specification: verified constraints first, then heat/product minimization, then goal/personal outcome ranking, followed by stable tie-breaks. Do not invent product-specific weights where the canonical source is silent; record an explicit deferred decision instead.
- [ ] Model the two qualitative confidence dimensions from EVD-03; evidence IDs alone must not imply evidence strength.
- [ ] Include reason severity and explicit rule version in audit traces.
- [ ] Define replay behavior for decisions pinned to older evaluator versions. Replay must either use the pinned compatible evaluator or return an explicit unsupported-version result; it must not silently run the current evaluator.
- [ ] Replace the withdrawal test that simply removes an exclusion with a successor-rule case that proves versioning and approval metadata are required before a newly allowed action can execute. Keep publication itself blocked.
- [ ] Add positive and negative contract tests for every changed schema and stage.
- [ ] Run the full engine suite, coverage, typecheck, lint and full repository tests with a bounded worker count appropriate for the Windows environment.

## Integration and closure

- [ ] Review each work order against its interface and changed-file ownership.
- [ ] Resolve cross-worktree conflicts only in a dedicated integration worktree based on the reviewed work-order commits.
- [ ] Run fresh full verification and an independent end-to-end review on the merged tree.
- [ ] Update `docs/verification/phase-2a-status-2026-11-02.md` only from verified evidence; keep Phase 2a NOT ACCEPTED if any required contract is deferred or a gate fails.
- [ ] Present the concrete integration diff for the owner's local merge approval. Do not push, publish, deploy, or write to hosted Supabase.

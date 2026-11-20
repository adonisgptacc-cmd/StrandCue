# Phase 2a decision engine verification (Work Order 4)

Reviewed on 2026-10-31. Work Order 4 of `docs/superpowers/plans/2026-10-31-strandcue-phase-2-parallel-work-orders.md`.

Branch: `codex/phase2-verification`. Base: `f27e2bb` (the integration of Work Order 1 contracts, Work Order 2 pipeline and Work Order 3 rules compiler onto `f5ae753`).

## What this work order adds

Decision-quality evidence for the shared engine: golden snapshots, seeded property tests, metamorphic and withdrawal relations, a replay tool, and explicit mutation evidence for the hard-rule branches.

| Area | File | Purpose |
|---|---|---|
| Golden snapshots | `tests/engine/fixtures/golden/*.json` | Six synthetic fixtures, one per engine outcome, each pinning a compiled ruleset, a canonical input and a reviewed expected decision |
| Golden test | `tests/engine/golden-decisions.test.ts` | Reproduces every expected decision and pins each ruleset identity |
| Property tests | `tests/engine/properties/determinism.test.ts` | Seeded determinism, input-order independence, irrelevant-record invariance, stable tie-breaks, acyclic results, unknown facts never producing a permissive outcome |
| Metamorphic tests | `tests/engine/properties/metamorphic.test.ts` | Tightening cannot loosen, withdrawal semantics, pinned replay, successor rule requirement |
| Replay tool | `packages/engine/src/replay/` | `ReplayCase`, `ReplayReport`, `replayDecisions(cases, candidate)` |
| Replay test | `tests/engine/replay/replay-decisions.test.ts` | Exact change reporting, immutability, no-I/O guarantee |
| Mutation evidence | `tests/engine/mutation/hard-rule-mutants.test.ts` | Twelve explicit hard-rule mutants, all detected |

Result: `npm test -- tests/engine` — 11 files, 165 tests, all passing (82 from Work Orders 1–3, 83 added here).

## Mutation approach and dependency cost

The work order requires explicit, deterministic mutants and forbids adding a mutation dependency without recording its cost and approval. This work order adds **no new dependency**.

The mutants are explicit and hand-written in `tests/engine/mutation/hard-rule-mutants.test.ts`. Each one omits or negates exactly one hard constraint (omitted hard exclusion, negated hard condition, downgraded severity, removed capability binding, swapped effect kind) and is asserted to be *detected*: the reference decision satisfies an invariant and the mutated decision violates it. Every hard rule of every scenario is covered by at least one mutant, and the test asserts that coverage.

The repository already carries an isolated, lockfile-pinned Stryker runner at `tools/mutation-runner`. It was **not** used for this work order, and no approval to use it is recorded:

- Its advisory review (`docs/verification/mutation-runner-advisory-review.json`) expired on 2026-10-31 and records `owner: "<UNASSIGNED - dependency risk owner must be named before CI-001 closes>"`.
- Its `recheckOn` date of 2026-10-24 has passed.
- Running it would add Stryker's own dependency tree to the verification path with no named risk owner and no recorded approval.

Cost of the chosen approach: the mutants cover the hard-rule branches of the Phase 2a scenarios only. They do not measure mutation score across the whole engine, and they do not replace a full mutation run. Approving the Stryker runner for Phase 2a would require a named dependency risk owner and a renewed advisory review before that coverage can be claimed.

## Findings

### F1 — A compiled authoring bundle could never produce a decided decision (fixed here)

Work Order 3's compiler routed `include_candidate` to the `filter_candidates` stage and `require_prerequisite` to `derive_treatment_state`. Work Order 2's stage runner only permits `include_candidate` in `load_verified_facts` and `evaluate_heat`, and `require_prerequisite` in `build_dependency_graph`. Every rule carrying either effect was therefore rejected at runtime with `invalid_effect_for_stage`, so any bundle compiled by `compileRules` returned `blocked` and no executable plan.

The effect-to-stage routing in `packages/engine/src/rules/compile-rules.ts` is corrected in its own commit on this branch. The correction was verified before being applied: with it, a bundle compiles to a `decided` decision with the expected step, and all 82 Work Order 1–3 tests still pass.

This file is owned by Work Order 3. The fix is isolated in its own commit so the reviewer can accept it, redirect it to `codex/phase2-rules`, or drop it.

### F2 — A rule whose effects span two stages is still not compilable safely

A compiled rule carries one stage, so a rule whose effects belong to different stages cannot be routed to a stage that permits all of them. The engine currently rejects such a rule at runtime with `invalid_effect_for_stage`, which fails closed and is safe, but it is only detected at evaluation time rather than at publication time. The compiler should reject it during compilation. This is a Work Order 3 follow-up and is not changed here.

### F3 — The workspace lockfile was out of sync

Work Order 1 added `packages/engine` to `package-lock.json` but not the `node_modules/@strandcue/engine` link entry, so `npm ci` failed for every branch built on it with `Missing: @strandcue/engine@0.1.0 from lock file`. The missing four-line entry is restored in its own commit.

## Known limitations

- **The two-person review gate is not satisfied.** The six golden fixtures record `review.status: "pending_independent_review"`. Their expected decisions were authored from the rule semantics and then checked against the engine, not captured from a run, but they were not written by a second reviewer who had not seen the rule. Publication of any safety-relevant ruleset stays blocked until that review happens.
- **GREEN and due are domain terms.** The engine contract has no GREEN token and no due token. The property tests map GREEN to the permissive heat assessment `appropriate` and a due status to a `decided` outcome with executable steps, and the mapping is stated in the test file.
- **The local runtime is on the wrong Node version.** The repository requires Node 24 (`.nvmrc`, `engines`), the machine has Node 25.1.0, and `npm run check:runtime` fails for that reason alone. The Work Order 4 gate commands (`npm test`, `npm run typecheck:domain`, `npm run lint`) pass regardless. `npm run verify` was not run.
- **Ranking coverage is partial by contract.** Goal suitability is implemented; heat/product minimisation and personal-outcome ranking have no inputs in the frozen contract and are deliberately absent rather than faked. The property tests therefore cover tie-breaks over suitability only.
- **`tests/engine/fixtures/ruleset-hash.ts` mirrors the engine's hash function.** It copies `stableHash` from `packages/engine/src/rules/compile-rules.ts` so a fixture can pin and re-derive the hash of its own compiled ruleset. The golden test cross-checks the mirror against `compileRules`, but the engine should export the helper so the copy can be removed.

## Verification run

| Command | Result |
|---|---|
| `npm test -- tests/engine` | PASS — 11 files, 165 tests |
| `npm run typecheck:domain` | PASS |
| `npm run lint` | PASS |
| `npm test` (whole repository) | PASS — 242 files, 4,969 tests, 8 files and 46 tests skipped |
| `npm run check:runtime` | FAIL — Node 25.1.0 present, Node 24 required |

## Integration note

The three commits on this branch are independent and can be taken separately:

| Commit | Files | Needed for |
|---|---|---|
| `997e639` | `package-lock.json` | `npm ci`; without it the install fails for every branch built on Work Order 1 |
| `813552d` | `packages/engine/src/rules/compile-rules.ts` | An authoring bundle producing a decided decision (finding F1) |
| `0759f98` | the Work Order 4 harness only | Nothing else; it adds new files only |

This was checked: cherry-picking `0759f98` alone onto the unrepaired base `f27e2bb` and running `npm test -- tests/engine` passes all 165 tests. The verification harness does not depend on either repair, because its golden fixtures pin compiled rulesets directly rather than rules derived from an authoring bundle.

Nothing here publishes content, touches a hosted system, or introduces production Heat Coach material. Every fixture is synthetic.

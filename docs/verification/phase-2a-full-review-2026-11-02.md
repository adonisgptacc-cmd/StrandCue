# Phase 2a end-to-end review

**Review date:** 2 November 2026
**Disposition:** NOT ACCEPTED for Phase 2a closure
**Reviewed baseline:** local main `e96b87838439421d6fad678dd72a6099eb746092`
**Reviewed follow-up:** `codex/phase2a-hash-integrity` at `77639e1a903c7eb2dfe86a9a50e9fd4867ef1e4e`
**Authority:** `docs/superpowers/specs/2026-10-31-strandcue-decision-engine-phase-2-design.md` and `docs/superpowers/plans/2026-10-31-strandcue-phase-2-parallel-work-orders.md`

## Summary

Work Orders 1–5 are present in local main, but this review found correctness and
specification gaps that passing tests did not catch. The SHA-256 follow-up is
still isolated and is not in local main. It fixes the compiler's former
32-bit FNV value, but the evaluator still accepts modified rules under the
unchanged hash. Phase 2a closure remains on HOLD.

The approved plan also says Work Order 5 starts only after active Increment 6
I6.0–I6.6 work is closed/reconciled. Increment 6 remains PARTIAL/HOLD, so WO5
must be treated as an early adapter scaffold, not as an accepted integration
or a prerequisite completion.

## Actionable findings

### P1 — Evaluator does not verify the ruleset content hash

`packages/engine/src/pipeline/stages/validate-snapshot.ts:64-66` checks
evaluator and schema versions but does not recompute `contentHash`.
`packages/engine/src/contracts.ts:30` accepts any nonempty hash string.
`packages/engine/src/rules/compile-rules.ts:62-68` computes SHA-256 only when
compiling.

Reproduction: compile a ruleset that includes candidate `a`; copy it while
changing the effect to include candidate `b`; evaluate both inputs. The
decisions execute different steps but record the same SHA-256 hash in audit.
The ruleset reference therefore does not identify the executed content.
Reject mismatched content at the evaluator boundary and add a regression test
that mutates a compiled rule while retaining its original reference.

### P2 — Compiler accepts mixed effects assigned to an unsupported stage

`packages/engine/src/rules/compile-rules.ts:23-38,164-169` assigns one stage
to a complete effects array. A rule combining `include_candidate` and
`require_prerequisite` compiles into `build_dependency_graph`, but
`packages/engine/src/pipeline/stage-runner.ts:20,199-201` rejects candidate
inclusion at that stage. Compilation succeeds and evaluation then blocks with
`invalid_effect_for_stage`. Reject incompatible effect combinations at
compile time or define a supported split-stage representation.

### P2 — Hard-conflict analysis ignores rule conditions

`packages/engine/src/rules/analyze-rules.ts:73-81,88-119` flattens rules
without their conditions and reports a hard conflict whenever inclusion and
exclusion share a candidate. Inclusion conditioned on `f-ready=true` and
exclusion conditioned on `f-ready=false` are disjoint, but the analyzer rejects
the bundle as `hard-capability-conflict`. Preserve condition and table
semantics during conflict analysis.

### P2 — First-hit analysis misses supported expression forms

`packages/engine/src/rules/analyze-rules.ts:22,45-49,167` does not prove
implication for supported `not` and `any` expressions. Two consecutive
`first`-policy rows with identical `not(f-ready=true)` conditions produce no
diagnostic and compile, even though the second row is unreachable. Add
structural-equivalence detection and analysis for accepted expression forms.

### P2 — Engine source is outside the configured coverage gate

`vitest.config.ts:60-61` includes domain source, selected scripts and named
critical modules, but omits `packages/engine`. The repository coverage
threshold therefore does not measure or enforce the stated 80% floor for the
new engine.

## Requirements not established by the current implementation

- **Ranking and minimization:** `packages/engine/src/pipeline/stages/select-and-rank.ts:5-13`
  sorts candidates, but does not implement heat/product minimization or
  personal outcome ranking described by the design.
- **Treatment and due state:** `derive-treatment-state.ts` summarizes event
  counts and dates; the summary is not consumed by rule expressions and no
  due-state contract is established.
- **Confidence and reason/audit semantics:** `assemble-decision.ts:54-57`
  treats evidence IDs as strong evidence without modeling evidence strength.
  Output reasons do not carry blocker/caution/info severity, and traces do not
  explicitly carry rule versions.
- **Withdrawal successor rule:** `tests/engine/properties/metamorphic.test.ts:171-178,188-224`
  allows a previously excluded action after removing its exclusion. The
  purported successor repeats an existing inclusion; it does not test a new,
  independently reviewed successor or a publication transition.
- **Historical evaluator replay:** `packages/engine/src/replay/replay-decisions.ts:38-40`
  runs the current evaluator, while snapshot validation rejects older
  evaluator versions. Cross-version historical replay is not implemented.
- **Heat Coach migration:** `packages/domain/src/guidance/heat-coach-engine-adapter.ts:6-10`
  maps enums only; no application/server call site uses it, and the existing
  evaluators remain authoritative. This is an adapter scaffold, not evidence
  that the shared engine is integrated as the decision authority.
- **Capability-version applicability:** stage matching is by subject ID only
  in `packages/engine/src/pipeline/stage-runner.ts:35-36`; exact product/tool
  version applicability remains unresolved.
- **Content operations and production approval:** reviewer queue, 180-day
  reminders, production kill switch and rollback, distinct qualified Human
  A/B review, and privacy review remain prerequisites before publishing
  safety-relevant production content. Production content is still empty/draft.

The engine tests also construct compiled rules directly, including combinations
that the real compiler rejects. Add compile-to-evaluate integration tests so
compiler output, evaluator support and the audit hash are checked together.

## Verification

All commands used Node 24.22.2 in the isolated follow-up worktree.

| Check | Result |
| --- | --- |
| `npm test -- tests/engine` | PASS — 12 files, 177 tests |
| `npm test -- --maxWorkers=8` | PASS — 259 files passed, 8 skipped; 5,090 tests passed, 47 skipped |
| `npm test -- --maxWorkers=2 tests/database/heat-capability-registry.test.ts tests/database/heat-coach-copy.test.ts` | PASS — 2 files, 11 tests |
| Unbounded `npm test` | FAIL — two PGlite `beforeAll` hooks timed out at 30 seconds under the 267-worker launch; both suites pass in isolation and at two workers |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS after removing trailing whitespace in the status report |

The full test suite emitted the existing Node module-type warning for
`apps/mobile/src/guidance/heat-rule-publication.ts`. No hosted database,
publication, deployment or remote push was performed.

## Recommended closure order

1. Add evaluator-boundary hash verification and regression coverage.
2. Fix compiler effect-stage validation and condition-aware conflict/reachability
   analysis; test rules through compile and evaluation.
3. Add engine coverage to the configured gate and prove the agreed threshold.
4. Reconcile the missing Phase 2a stage contracts and versioned capability
   semantics against the approved spec; mark any explicitly deferred behavior
   as a later phase with a named dependency.
5. Keep WO5 and all production publication blocked until Increment 6 closes
   and the independent human/content-operation gates are satisfied.

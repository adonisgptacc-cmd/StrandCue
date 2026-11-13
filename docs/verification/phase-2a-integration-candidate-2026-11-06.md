# Phase 2a integration candidate verification

Date: 2026-11-06
Branch: `codex/phase2a-integration-candidate`
Base: local `main` at `e96b87838439421d6fad678dd72a6099eb746092`

## Approved boundary

- Phase boundary: `1A`.
- Heat exposure and product burden: typed measures `2C`.
- Personal outcome ranking: deferred to Phase 2d.
- Capability binding: exact-match and fail-closed `4A`.

The candidate combines the reviewed shared contract and WOs A–D. No production Heat Coach publication was created.

## Final review correction

The candidate review found that successor authorization records were anonymized when the database created a draft, but their author and reviewer IDs were still included in `canonicalRulesetContentHash`. The immutable packet therefore changed after the caller computed its content hash, preventing the trusted hash-verification gate from accepting successor packets.

The engine now excludes only `authorId` and `reviewerId` from semantic content hashing. It continues to hash the parent, withdrawal and affected-action data, successor-rule bindings, review time and reference, rules, and capabilities. The full anonymized packet remains bound by `packetDigest`; `engine_ruleset_successor_actor_bindings` and the separate authenticated A/B approval rows preserve actor identity and distinct-reviewer authorization.

Regression evidence:

- The hash-stability regression was observed failing before the fix and passing afterward. It also confirms changing withdrawal semantics changes the hash.
- The PGlite publication test and an opt-in real-Postgres test both exercise create → anonymize → recompute hash → record distinct A/B approvals → record hash verification → publish.
- Independent review found the hash boundary consistent with the packet-digest and actor-binding trust contract, with no remaining blocking finding.

## Verification

All final checks used Node `v24.22.1` and four test workers where applicable.

- `npm run check:runtime`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npm test -- --maxWorkers=4 --reporter=dot` with the numeric-loopback PostgreSQL DSN enabled: 273 files passed, 1 skipped; 5,217 tests passed, 13 skipped.
- `npm run test:coverage -- --config vitest.engine-coverage.config.ts --maxWorkers=4 --reporter=dot`: 15 engine test files and 244 tests passed. Coverage: 93.09% statements, 87.28% branches, 97.03% functions, 95.26% lines; each engine source file met its 80% per-file thresholds.
- The disposable local Supabase stack replayed all 83 repository migrations. It was stopped after verification and the temporary project/port edits in `supabase/config.toml` were restored. Other local containers were not stopped.
- `git diff --check main...HEAD` still reports trailing whitespace in four inherited Markdown hard-break lines in the Phase 2a status and WO-B report; no source-code whitespace issue was reported.

## Remaining gates

- This is a review-ready isolated candidate. No merge into local `main` has been made; `origin/main` has not been reconciled or pushed.
- Human A and Human B must review and approve the exact final publication packet independently before any real ruleset publication. Synthetic local approvals prove the gate behavior only; they are not human approvals.
- `npm audit` reports 20 dependency advisories (1 low, 14 moderate, 5 high, 0 critical). This pre-existing dependency audit hold remains separate; no dependency remediation was made in this work order.
- No hosted Supabase database was accessed or changed, and nothing was deployed, published, or pushed.

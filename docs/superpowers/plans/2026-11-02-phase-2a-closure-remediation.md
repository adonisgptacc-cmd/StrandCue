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

The plan commit `67c1da74da77cd61dfcaf960c40a17b0cd824042` is based on reviewed SHA follow-up `5e9d52ff7904a8503e2f6f3cd90bcf5b38c90326`. Each work order branches from the plan commit in a distinct `codex/phase2a-*` worktree. Do not merge worker branches into one another. The coordinator reviews each completed work order and integrates only after its focused checks pass. Do not merge into local `main` until the owner approves that integration.

## Work order 1: Bind runtime decisions to the ruleset hash

**Files:**
- Modify `packages/engine/src/canonical-json.ts` or add a focused ruleset-identity module.
- Modify `packages/engine/src/pipeline/stages/validate-snapshot.ts`.
- Test `tests/engine/pipeline/validate-snapshot.test.ts` and/or the existing engine input contract suite.

**Interface:** Export one shared function that returns the prefixed SHA-256 identity for the canonical `{ capabilities, rules }` payload. The compiler and evaluator validator must use the same function.

- [x] Add a test that compiles a ruleset, changes a rule effect without changing the reference, and expects evaluation to reject it before executing effects.
- [x] Run the focused test and verify it fails because the tampered ruleset is currently accepted.
- [x] Add the shared content-hash function and evaluator-boundary comparison. Preserve array order where it affects rule/table semantics; canonicalize only semantically unordered data.
- [x] Add cases for capability changes, rule changes, valid compiled content, and canonical object-key ordering.
- [x] Run focused engine tests, typecheck and lint; record exact output.

Verified on the integrated isolated branch at commit `3fc4005`: engine tests 13/13 files and 181/181 tests passed; typecheck, full lint, and `git diff --check` passed. Commit `a21f683` was separately reviewed with no actionable findings. No main-branch or hosted changes were made.

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

### Execution update — 2026-11-03 (not accepted)

Implementation is underway on isolated branch `codex/phase2a-contracts`, based on the reviewed Work Orders 1–3 coordinator commit `f8d53e1`.

- Implemented exact owned-row to catalogue identity/version/market matching and now require each capability-bound rule's declared use scope to match the independently reviewed capability scope. Added two-dimensional confidence, explicit goal-suitability scoring with deterministic fallback, the canonical treatment projection adapter, version-pinned replay with an explicit unsupported-version result, structured reason severity, and versioned rule references through applicable decision records.
- Replaced removal-only withdrawal coverage with parent-hash-bound successor authorization, binding the withdrawn rule/version and affected action to a distinct successor rule/version and an independent reviewer. Future-dated reviews do not authorize actions before their review timestamp.
- Independent review initially found two trust-boundary gaps before this can be accepted: the engine did not prove a withdrawal existed in the parent ruleset, and distinct author/reviewer strings were not authenticated identities. The parent-content check is now implemented in the engine; the trusted immutable-publication source and generic author/reviewer identity binding remain outstanding.
- The deterministic ranking currently orders eligible candidates by goal suitability and stable candidate ID. Product-specific heat/product minimization and personal-outcome weights remain deferred because no reviewed weights or inputs are specified; they must be agreed before claiming the complete ranking order.
- Focused verification passed: 15 engine files / 216 tests; 2 treatment and adapter files / 119 tests; TypeScript `--noEmit`; and scoped ESLint.
- Added `vitest.engine-coverage.config.ts` to apply the repository's 80% floors only to the engine suite. Engine coverage passed at 93.25% statements, 86.81% branches, 96.77% functions, and 95.42% lines.
- Bounded full-repository run completed: 262 files passed and 8 files were skipped; 5,131 tests passed and 47 were skipped. The eight skips are opt-in PostgreSQL/Supabase integration suites; the disposable local target variables are unset, so this run does not prove real-PostgreSQL concurrency. No hosted target was configured or used.
- Phase 2a remains NOT ACCEPTED pending trusted immutable-parent sourcing, generic successor author/reviewer identity binding, a product decision on deferred ranking inputs, and independent end-to-end review.
- No commit, main-branch integration, push, hosted database write, publication, or deployment has occurred. Phase 2a remains NOT ACCEPTED.

### Integration candidate reconciliation — 2026-11-05

- Created the clean candidate worktree from `f8d53e1`, which contains the 15 Phase 2a work-order commits based on local `main`.
- Transferred only Phase 2a engine/compiler/analyzer/treatment-projection and generic ruleset-publication changes, their tests, migrations, verifier function, and Phase 2a records. The new candidate also includes a regression for a successor rule facing multiple withdrawals; it requires an in-date authorization for every affected withdrawal.
- Kept the two Increment 6 Heat Coach Human A/B approval migrations and their Heat-Coach-specific test adaptations in the original dirty checkout. They are unrelated to the generic engine-ruleset authority ledger and are not needed by this candidate.
- The candidate is still NOT ACCEPTED. Ranking inputs and weights, the successful authenticated Edge-to-RPC path, current full database verification, and final independent review remain open. No integration into local `main`, push, hosted write, publication, or deployment occurred.

### Execution update — 2026-11-03 continuation

- Added `priorRuleset` to engine input for successor reviews. The input boundary recomputes the parent's canonical content hash and requires every withdrawal to match an actual parent rule ID, version, and candidate effect. The replay evaluator now supplies the pinned parent ruleset. A regression test first demonstrated that a fabricated withdrawal was accepted; it now rejects it. The caller must still load the supplied parent from an authoritative immutable publication record; the pure engine cannot establish that database provenance by itself.
- Added the authenticated Human A/B publication workflow for Heat Coach: approvals bind both the rule digest and the aggregate `reviewedContentDigest` for evidence, copy, and capability registry; the two authenticated reviewer identities must differ, and reviewer eligibility comes from a private allowlist. A follow-up regression reproduced approval reuse after a valid draft packet changed and now proves that publication is rejected. Legacy approvals without an aggregate digest remain non-authorizing. The allowlist is intentionally empty until a real operator enrolls verified accounts. This Heat Coach boundary does not yet provide an authoritative identity/approval record for generic engine successor authorizations.
- Applied migrations `20261103183513_heat_publication_authenticated_approval.sql` and `20261103191622_bind_heat_publication_approval_packet.sql` to local Supabase only. The first local history row was repaired after its direct local application; the follow-up migration was applied through Supabase CLI. No hosted database was selected or changed. A post-test local query confirmed zero published rules, zero drafts, zero approval rows, and zero enrolled reviewers.
- Local verification: all database tests passed with PostgreSQL concurrency enabled (46 files passed, 2 skipped; 1,002 tests passed, 13 skipped); focused Heat Coach database regressions passed (114/114); the two real-PostgreSQL concurrency files passed (17/17); the engine suite passed (232/232); engine coverage passed at 93.07% statements, 86.77% branches, 96.80% functions, and 95.15% lines; TypeScript typecheck, full ESLint, and `git diff --check` passed. Local Supabase security advisors reported no issues. Database lint completed without errors and reported existing warnings in other routines.

### Execution update — 2026-11-04 continuation (independent review pending)

- Added a generic engine-ruleset publication ledger separate from Heat Coach. It stores immutable packet JSON and parent hash, derives author/reviewer identities from authenticated requests, requires a distinct qualified reviewer, binds approvals to the exact packet digest, and exposes the authoritative packet lookup only to `strandcue_mutator`.
- Successor publication now checks that the parent hash resolves to a published/withdrawn immutable ruleset, each withdrawn rule/version/action exists in that parent packet, and each successor rule/version points back to that withdrawal in the child packet. The engine contract now requires UUID identities, distinct author/reviewer IDs, and a UUID `reviewRef`.
- Added five database authority regressions and a schema contract regression. Focused database/export/migration tests passed (36/36); the full engine suite passed (218/218). Supabase CLI applied migrations `20261104073159_engine_ruleset_publication_authority.sql` and `20261104074330_enforce_ruleset_successor_parent_bindings.sql` to local Supabase only. Local ruleset, approval, and reviewer row counts are all zero; security advisors found no issues. Database lint returned no errors and showed the existing warnings in unrelated routines.
- A broad database suite run was interrupted after the unrelated treatment-programme performance guard failed under this machine's current load (`derives a long history in linear time`: 14.9s versus an 8s limit). The isolated rerun reproduced that timing failure (14.9s); the other 67 cases in that file passed. The full database suite has not completed in this continuation.
- Generic identity binding is implemented but not accepted until the independent review and real-PostgreSQL behavior check complete. The canonical ranking inputs/weights remain a separate product decision; no weights were invented. No commit, merge, push, hosted write, publication, or deployment occurred.

### Execution update — 2026-11-04 generic authorization verification

- Closed two independent-review bypasses in the local implementation: a ruleset cannot carry `successorOf` without a top-level reviewed authorization, and no privileged insert can start in `published` state. The admission boundary also binds the draft author to the authenticated actor and requires the successor rule to include the withdrawn affected action. Added regression coverage for each.
- Added `tests/database/engine-ruleset-publication.pg.sql` as a repeatable local PostgreSQL proof. It creates synthetic authenticated author/reviewer identities, records distinct A/B approvals against exact packet digests, publishes a parent and an authorized successor, verifies orphan lineage rejection, then removes all rows. `supabase db query --local --file ...` completed successfully; follow-up counts for publication, approval, and reviewer tables were all zero.
- Post-fix verification: focused engine and database/export/migration suites passed (18 files, 258 tests); engine suite passed separately (15 files, 219 tests); domain TypeScript typecheck passed; local Supabase security advisors found no issues. `git diff --check` passed (Git emitted only line-ending normalization warnings for existing golden JSON fixtures). `supabase db lint --local` completed with no errors and existing warnings in unrelated routines.
- A full database-suite pass is still outstanding: the prior broad run hit the unrelated treatment-programme timing guard at 14.9s against an 8s limit. Current Windows verification runtime reports Node 25.1 while the project requests Node 24; this is recorded as an environment variance, not proof of a code defect.
- Independent review remains pending. The database persists a trusted packet digest, but the claimed engine content hash is recomputed at engine runtime rather than independently derived by the SQL publication boundary; publication must remain blocked unless review accepts a trusted runtime validation boundary or that database binding is strengthened. Canonical ranking inputs/weights also remain an open product requirement.
- No commit, merge, push, hosted database write, publication, or deployment occurred.
- Follow-up review identified one additional audit gap: same-state updates could alter `published_at`. A regression failed against the old guard, then migration `20261104081700_freeze_engine_ruleset_publication_timestamp.sql` froze the timestamp. The regression passed in the focused PGlite suite and the saved real-PostgreSQL proof now checks that attempted mutation is rejected. The four generic authority migrations are applied locally only.
- Independent follow-up review found no remaining timestamp immutability or admission-guard regressions. It confirmed the database still does not recompute the engine canonical content hash. Runtime validation rejects a mismatched hash before effects, but database publication alone can record it; keep Phase 2a acceptance blocked until a trusted loader-to-runtime boundary is independently verified or the database hash binding is strengthened.

### Execution update — 2026-11-04 Auth deletion retention policy

- The owner selected “anonymize actor IDs; keep packets and decisions.” Migration `20261104182726_engine_ruleset_actor_anonymization.sql` makes publication author and approval actor IDs nullable and changes their Auth foreign keys to `ON DELETE SET NULL`. Reviewer qualification rows are removed with their Auth identity; immutable packets and approval rows remain.
- Successor packets also used to embed the Auth UUIDs. Draft creation now replaces those values with fresh opaque UUID references before packet hashing and storage. A private immutable actor-binding ledger links each opaque reference to the actual authenticated author/reviewer until account deletion; publication requires those bindings to match the approval pair, and deletion nulls the linked Auth IDs while keeping the opaque packet references.
- The migration fails closed if any successor packet from the pre-binding schema already exists. Such immutable legacy rows need a separately reviewed migration plan; this branch's fresh isolated database has none.
- The publication immutability guard now permits only nested foreign-key-driven `actor_id -> NULL` updates, and a new approval guard preserves all decision fields while allowing that redaction. Direct actor edits still fail with immutable-record errors. A null author cannot create, approve, or publish another candidate.
- Added PGlite regressions and extended the repeatable real-PostgreSQL proof. The PGlite tests reproduced the old FK `RESTRICT` failure, stored-Auth-UUID privacy gap, and missing reference-to-approver binding before the changes; the final focused run passed 17 files / 236 tests, including rejection when a different Human B attempts to publish. The real PostgreSQL proof replayed the exact branch migration chain on the isolated Docker Supabase project, verified opaque references map to the actual A/B actors, deleted synthetic author/reviewer rows, and confirmed the published packet plus both decisions remain while relational and binding actor IDs become null. All proof rows were rolled back.
- TypeScript `--noEmit` and scoped ESLint passed. Local Supabase advisors reported no error-level issues; one existing warning remains for overlapping permissive `strandcue_mutator` policies on `public.profiles`, unrelated to these tables. `git diff --check` passed with only existing golden-fixture line-ending warnings.
- This does not record real Human A/B decisions or clear the remaining product ranking and Increment 6 gates. The real PostgreSQL proof deletes synthetic rows directly from `auth.users`; it does not exercise GoTrue's HTTP admin endpoint. Independent final review and integration approval remain pending. No commit, merge, push, hosted database change, publication, or deployment occurred.

This work order starts after Work Orders 1–3 are reviewed. Read the canonical product specification and the Phase 2 design before editing schemas.

**Files expected to change:** engine contracts and stages, replay contracts/implementation, targeted engine tests, and this plan's status.

- [x] Bind capability applicability to an exact catalogue subject identity, version, market, and reviewed use scope. Keep the user's shelf/tool row ID separate from the catalogue subject reference; an owned row must not imply a different catalogue version is authorized.
- [x] Derive treatment `due`, `not_due`, or `unknown` from canonical care-event lifecycle/date semantics and an explicit reviewed transition policy. Reuse existing wash counting and treatment-programme logic rather than introducing another event counter. A prospective planned wash may affect only the prospective calculation; unknown policy/date inputs must not yield `due`.
- [ ] Implement the canonical ranking order: verified constraints, goal suitability, heat/product minimization, personal outcome ranking, then a stable tie-break. Keep eligibility constraints separate from preference ranking and do not derive suitability from rule severity. If product-specific weights are unspecified, record them as deferred and preserve deterministic baseline ordering.
- [x] Model EVD-03's two qualitative dimensions: instruction completeness/confidence from all required critical and safety inputs, and suitability confidence (`limited|moderate|high`) from reviewed support for selected factors. Evidence IDs alone and personal observations alone must not increase confidence.
- [x] Include structured reason severity (`blocker|caution|info`) and explicit rule `{ id, version }` references in applicable stage, result, omission, and alternative audit records. Keep hard/soft rule authority separate from reason severity.
- [x] Define replay behavior for decisions pinned to older evaluator/schema versions. Replay must use the pinned compatible evaluator/decoder or return an explicit unsupported-version result; it must not silently reinterpret historical cases using the current evaluator.
- [x] Validate each successor withdrawal against the actual parent ruleset content and verify its canonical hash. The engine input now binds a withdrawal to a parent rule ID, version, and affected candidate; callers must source that parent from an authoritative immutable publication record.
- [ ] Independently review and verify the new generic successor author/reviewer identity, deletion-anonymization behavior, and immutable publication record before runtime authorization. The local real-PostgreSQL proof passed, but publication remains blocked until independent review and product gates pass.
- [x] Add positive and negative contract tests for every changed schema and stage.
- [x] Run the full engine suite, engine coverage, typecheck, lint, and full repository tests with a bounded worker count appropriate for the Windows environment. The earlier baseline run skipped opt-in database suites; the 2026-11-03 continuation then ran the full database suite against local PostgreSQL and passed all enabled tests.

The contract map in the review record identifies the source requirements and example behaviors. At minimum, cover wrong product version/market, unknown ownership identity, wash/application distinction, two lathers in one session, prospective-only changes, void/backdate recomputation, ambiguous dates, ranking precedence, sparse personal evidence, severity/suitability separation, confidence precedence, versioned reasons, historical evaluator unavailable, wrong successor parent hash, self-review, and removal-only authorization.

## Integration and closure

- [ ] Review each work order against its interface and changed-file ownership.
- [ ] Resolve cross-worktree conflicts only in a dedicated integration worktree based on the reviewed work-order commits.
- [ ] Run fresh full verification and an independent end-to-end review on the merged tree.
- [ ] Update `docs/verification/phase-2a-status-2026-11-02.md` only from verified evidence; keep Phase 2a NOT ACCEPTED if any required contract is deferred or a gate fails.
- [ ] Present the concrete integration diff for the owner's local merge approval. Do not push, publish, deploy, or write to hosted Supabase.

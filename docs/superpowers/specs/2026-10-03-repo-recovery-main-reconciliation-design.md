# Repo-Recovery and Main Reconciliation Design

## Objective

Produce a verified `main` history that contains the complete Phase 1 product surface from `codex/repo-recovery`, the later stabilization protections from `main`, and the current username and recovery corrections, without rewriting history or losing the dirty checkout.

The finished Android app must expose Passport, Services, Activities, Shelf, Tools, History, and Settings. “Shelf” is the product-inventory section previously recalled as “Shell.”

## Current state

`main` and `codex/repo-recovery` diverged after their shared ancestor. `codex/repo-recovery` contains 98 commits not in `main`; `main` contains 16 commits not in `codex/repo-recovery`. The primary checkout also contains uncommitted source changes and generated evidence files. A direct checkout, reset, or merge in that directory would put recoverable work at unnecessary risk.

Reconciliation therefore occurs on an isolated integration branch created from `main`. The original checkout remains untouched until the integration result is verified.

## Source-of-truth rules

Conflict resolution follows explicit ownership rather than choosing one branch wholesale:

1. `codex/repo-recovery` is authoritative for the complete product surface: Activities, Shelf, Tools, expanded Settings, export/deletion, navigation, their domain contracts, Supabase migrations, mobile adapters, and product-flow tests.
2. `main` is authoritative for the later stabilization baseline: Node/runtime enforcement, dependency policy, linting, verification scripts, component-state protections, and the Phase 1A stabilization evidence that remains applicable.
3. The dirty primary checkout is authoritative only for the scoped username and recovery work that is not already represented in either committed branch. Those changes are transferred selectively; generated screenshots, APKs, logs, caches, and test-result captures are not merged as source.
4. Existing `sources/` material remains read-only.

No branch is force-reset, rebased destructively, or deleted during reconciliation.

## Integration structure

The integration branch starts from `main` and merges `codex/repo-recovery` with full ancestry. Conflicts are resolved by subsystem using the source-of-truth rules above. This preserves both histories and makes the final change reviewable as an ordinary merge.

Current uncommitted work is inventoried from the original checkout. Only reviewed source, tests, configuration, and migrations are reapplied to the integration branch. Each transferred change must be attributable to the username/recovery objective or explicitly retained stabilization behavior.

## Database migration reconciliation

The combined migration directory is treated as an ordered ledger, not a bag of SQL files. Reconciliation must:

- retain every migration required by the complete Phase 1 schema;
- retain the username-schema repair and username-options migrations when they are not superseded;
- identify duplicate timestamps, duplicate objects, and migrations that express the same operation under different names;
- preserve dependencies between catalogue, ownership, activity, export, deletion, consent, username, and grant-cleanup migrations;
- validate a clean-database application and the repository’s migration inventory tests;
- never edit the already-synced `sources/` reference material.

Where two migrations conflict semantically, the resolution is a new forward migration or a clearly justified selection of the authoritative migration. Previously committed migration history is not silently rewritten merely to make tests pass.

## Authentication and username preservation

The reconciled app retains the current requirements established during device testing:

- signup and recovery callbacks use the registered StrandCue deep link;
- PKCE recovery callbacks carry and validate `sb_flow_id` and exchange against the matching verifier;
- duplicate Android/Expo callback delivery is single-flight and cannot sign out a successful recovery session;
- password-change mode persists across a remount until completion or explicit cancellation;
- usernames remain unique and unavailable names produce valid suggestions;
- auth errors do not expose provider tokens, codes, or internal details.

These behaviors require focused regression tests and a real-emulator proof after the larger branch merge.

## Verification gates

The integration is not ready for `main` until all applicable gates pass:

1. Repository install and runtime checks on Node 24.
2. TypeScript type checking and lint with zero new warnings.
3. Unit, component, domain, database, migration-inventory, and tooling tests.
4. Coverage and dependency/control-plane audits under the reconciled policy.
5. Web export/build verification.
6. Clean Supabase migration application and authenticated API security checks where credentials are available.
7. Android launch and navigation proof showing all seven sections.
8. Recovery proof: newest Gmail link opens the password-change screen, survives duplicate callback delivery/remount, saves a new password, and permits sign-in with that password.
9. Username duplicate proof with suggestions.

Any unavailable external credential or service is reported as an explicit unverified gate rather than represented as passing.

## Delivery and rollback

The integration branch is reviewed before it is merged into `main`. `main` moves forward through a normal merge or fast-forward approved after verification; it is never force-pushed as part of this work. `codex/repo-recovery`, the original dirty checkout, and its attached worktree remain available until the reconciled `main` is proven.

If reconciliation fails, the isolated integration worktree can be archived without changing either source branch. If a post-merge defect is found, the merge commit provides a single reviewable rollback boundary while both original lines of history remain intact.

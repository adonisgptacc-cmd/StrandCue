# Repository recovery and hardening — 2026-10-04

Status: local integration verified in stages; production release and advancement of main remain on HOLD. This records implementation after the approved repository audit. It does not certify every source file as live or every deployed control as secure.

## Consolidation and preservation

`codex/repo-recovery-integration` contains every audited branch head, including recovery and delivery-plan work. Before this hardening batch it was 107 commits ahead of `origin/main` (`d190f21352012de2a9d5fccdf308390bbbb5a5a4`). Local main was one history commit behind origin with an identical tree. The integration branch is the reviewable candidate; main has not been advanced.

A bundle of all refs, the primary checkout's binary patch, an inventory and a copy of untracked functional changes were preserved outside the worktree. Existing primary files, branches, worktrees, generated builds and synced references were retained.

## Changes

- Documented Node 24, locked installation, Docker/Supabase replay, public environment configuration and first launch in README and the developer setup runbook.
- Removed three confirmed unrouted settings drafts, an undeployed placeholder matching function, an uncalled domain placeholder and the unused direct `jest-validate` dependency. Historical draft migrations and required Expo peers remain.
- Patched available brace-expansion versions and extended the advisory gate to development dependencies. Full verification includes coverage, Expo compatibility and dependency policy; `verify:offline` separates deterministic checks from registry-dependent checks.
- Pinned workflow actions, added dependency update automation and a fresh local Auth/PostgREST replay in CI. Android builds are manual, single-profile and gated through the `android-release` environment; automatic paid builds and store submission were removed.
- Added a forward activity-zone validator migration and matching command bounds. Missing/null fields, unexpected keys and oversized arrays are rejected; historical reads retain compatibility.
- Fixed owner-switch, pagination, StrictMode and stale asynchronous completion handling in recovered mobile screens. A missing SDK session is a normal signed-out state; other auth lookup failures remain blocked.
- Added an executable Android association check against the exact reviewed package and signing certificate. A documentation placeholder is never evidence of a deployed association.

## Verification

All commands use Node 24.21.0. Local private keys and raw generated logs are excluded from Git.

| Gate | Evidence |
| --- | --- |
| TypeScript and strict lint | Passed both projects and lint with zero warnings. |
| Coverage suite | 630 passed, 3 skipped. Domain coverage: statements 93.24%, branches 84.83%, functions 98.31%, lines 96.12%. Coverage does not include every mobile screen. |
| Real database/API | Fresh disposable Supabase project on separate ports; all migrations replayed successfully, followed by 3 passing Auth/PostgREST ownership tests. Existing primary data was not reset. |
| Metadata audit | METADATA-PASS within its documented local scope. |
| Expo compatibility | Dependencies compatible according to `expo install --check`. |
| Secret history scan | Gitleaks 8.30.1 scanned 144 committed revisions without findings before this batch was committed. |
| Dependency policy | HOLD: 0 critical, 19 high, 10 moderate; overdue review and stale exception path findings remain visible. |
| Android association | HOLD without reviewed certificate; live configured assetlinks endpoint returned HTTP 404. |

## Remaining gates and owners

1. **Dependency maintainer:** resolve or independently disposition the unpatched `braces` and `node-forge` advisories through compatible upstream releases or a tested substitution. Do not use forceful Expo/React Native downgrades or simply renew exception dates. Review the full dependency graph again after updates.
2. **Release owner:** provide the actual Play/release signing fingerprint, publish the association, and prove signed Android signup, PKCE recovery, sign-out/relaunch and verified HTTPS links on a fresh device. Unit tests and web export cannot establish this.
3. **Backend owner:** implement and test the Auth identity/session deletion operation after application-data purge, including retry/idempotency and recovery. Verify hosted email confirmation, redirect allowlists, leaked-password protection, session settings and abuse/RPC limits. The local migration is not a hosted security audit.
4. **Repository owner:** configure and verify required checks and release environment protection. GitHub rejected the private repository's branch-protection query with a plan-related HTTP 403; `environment: android-release` in YAML alone does not prove protection. Preserve repository privacy.
5. **Product/release owner:** complete signed native accessibility, offline sync/conflict, export/deletion, performance, backup/restore and privacy acceptance against the existing Phase 1 spec and runbooks.

No remote push, hosted migration, paid build, store submission, credential rotation or destructive branch cleanup was performed. Main promotion must follow the existing recovery plan's final review and device gates.

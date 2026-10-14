# Local security hardening, 2026-10-04

The forward migration `20261004104838_activity_zone_bounds.sql` replaces only the existing private activity-zone validator. It rejects null/non-string fields and unknown keys, and bounds new collections at 36 entries (six regions by six segments) before iteration. The client command and patch schemas use the same bound. Existing activity read models remain unbounded for historical compatibility. No persisted history, existing migrations, grants, owners, credentials or hosted settings were changed.

## Evidence

- Database tests first demonstrated that four invalid payloads were accepted. Domain tests first demonstrated two invalid commands were accepted.
- Focused activity, hardening and migration-inventory replay: 27 tests passed. Domain/mobile activity: 23 tests passed.
- Full suite at this point: 599 passed, 3 skipped, one failure in `assetlinks.test.ts` because its assertion demands a real signing fingerprint while the runbook contains a release placeholder. This security patch does not resolve that separate release-configuration contract.
- Synthetic PGlite replay checks ownership isolation, forced RLS, fixed search paths, anonymous routine denial, no direct consumer table writes and mutator containment. Hosted Postgres/API behavior remains a separate gate.

## Remaining release gates

- `deletion_purge` removes application profiles/dependants; the migration explicitly leaves Auth identity removal to the service-role Admin API operations step. Establish and test a worker/runbook that revokes refresh sessions, removes the Auth identity after dependent data, and records retries. The existing account-status checks deny app data immediately with the same access JWT; they do not prove Auth revocation or identity deletion.
- Recovery parsing accepts `strandcue://auth/callback`, while Android also advertises a verified HTTPS `/auth` link. Prove the signed native app's complete redirect/PKCE flow, verify the actual signing certificate on the live assetlinks endpoint and verify production exact redirect allowlists. A custom scheme alone cannot establish exclusive app ownership.
- Local `secure_password_change` remains false. Test the supported recent-login/nonce and recovery journeys before changing this setting; verify production settings independently.
- The zone bound limits stored collection size but is not a general per-user/IP RPC rate limit. Determine supported traffic, offline-sync bursts and retry semantics before adding quotas to all write paths. Verify service/record link collection bounds in that broader work.
- Verify deployed email confirmation, leaked-password protection, session expiry, abuse protection and API/database advisors. Local config cannot certify hosted settings.

## Recovery and review

Review the additive migration and domain changes independently before promotion. Local source recovery is file-by-file reversion; a fresh disposable replay verifies the unreleased chain. Production rollback/restore is not verified here, and this document authorizes no remote application. Preserve any existing data; inspect staging history for malformed zone records before promotion rather than rewriting old audit history automatically.

Function security follows [Supabase's database-function guidance](https://supabase.com/docs/guides/database/functions): retain the fixed empty search path, invoker validator and existing restricted ACL. `CREATE OR REPLACE` keeps the validator's owner/grants.

## Security audit remediation ledger — 2026-10-14 baseline (Increment 0)

Source audit: `SECURITY_AUDIT_v1.0_14-10-2026.md` (base `bceec202e5ee10f2ecaf01243f89be76c3912a58`, Node 24.19.0).
Plan: `docs/superpowers/plans/2026-10-14-security-audit-remediation.md`.
The audit names no separate ledger file, so this existing verification file carries the ID mapping rather than inventing a new top-level ledger.
Baseline gate (all with bundled Node 24.19.0): `check:runtime` pass; `typecheck` pass; `lint` pass; focused `tests/database` 18 files passed / 1 skipped, 307 tests passed / 4 skipped; full suite 99 files passed / 1 skipped, 1571 tests passed / 4 skipped; coverage 97.36 / 91.19 / 99.43 / 98.25; `export:web` pass; dependency policy pass (0 critical, 19 high, 11 moderate, 4 reviewed advisories); control-plane **HOLD** (`CLAIM-STALE expo-compatible-sdk`, exit 1 — known visible baseline failure, Task 23).
Every finding below is `open` at baseline. Owner increment follows the plan's task assignment.
Increment 1 evidence (Task 8, HEAD `ed1df0f`): the `Increment 1 evidence` column records the repair commit and reviewer verdicts. Status stays `open` for every Increment-1 ID — implementation alone never closes a finding; only the named human authority plus the required device/hosted evidence can. Increment 2-4 rows are untouched (`—`).

| ID | Severity | Status | Owner increment (plan task) | Regression tests | Evidence file | Increment 1 evidence (Task 8) |
|---|---|---|---|---|---|---|
| SC-001 | Critical | open | Increment 1 (Task 2) | tests/database/recommendation-runs.test.ts; tests/mobile/recommendation-run-api.test.ts; tests/mobile/today-guidance-service.test.ts | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ca88cfb`; code PASS/APPROVED, security SECURE (no Critical/High/Medium) |
| SC-002 | Critical | open | Increment 1 (Task 3) | tests/database/protocol-executions.test.ts; tests/mobile/protocol-execution-api.test.ts; tests/mobile/protocol-execution.test.tsx | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `448ffb4`+`29a4f41` (test-only); code PASS/APPROVED after re-review, security SECURE |
| CQ-001 | High | open | Increment 1 (Task 5) | tests/mobile/protocol-transition-dispatch.test.ts; tests/mobile/protocol-execution.test.tsx; tests/mobile/protocol-execution-state.test.ts | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `f00a5f4`+`488238c`; code PASS/APPROVED after re-review, security SECURE Low |
| SC-003 | High | open | Increment 1 (Task 4) | tests/database/protocol-executions.test.ts; tests/mobile/protocol-execution-api.test.ts; protocol-execution-state and component suites | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `76a0f40`; code PASS/APPROVED, security SC-003 closed (implementation); launch HOLD rests on Task 6/7 residuals |
| SC-004 | High | open | Increment 1 (Task 6) | shelf, execution database, API, and component suites | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `b51bdf8`; code PASS/APPROVED, security SECURE (capability-matching absence accepted as limitation) |
| AU-001 | High | open | Increment 2 (Task 9) | deletion and recent-auth tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| AU-002 | High | open | Increment 2 (Task 10) | auth tests; deployment runbook hosted-dashboard verification | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| PR-001 | High | open | Increment 2 (Task 11) | database/mobile export tests; JSON/CSV parity assertions | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| WB-001 | High | open | Increment 4 (Task 19) | tests/website/site-security.test.ts; post-deploy verification script | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| CI-001 | High | open | Increment 4 (Task 21) | tooling tests; locked EAS invocation checks | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| MB-001 | High | open | Increment 3 (Task 15) | protocol-execution mobile/state tests; Android acceptance checklist | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| MB-002 | High | open | Increment 3 (Task 16) | guidance copy and check-in tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| DB-001 | High | open | Increment 1 (Task 7) | tests/database/protocol-executions.test.ts (limits/quotas) | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ed1df0f`; code PASS/APPROVED, security SECURE with 3 carried obligations |
| WB-002 | Medium | open | Increment 4 (Task 20) | auth contracts/implementation/tests; App Links verification | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| PR-002 | Medium | open | Increment 2 (Task 13) | worker tests with frozen time; privacy retention runbook | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| AU-003 | Medium | open | Increment 2 (Task 12) | auth and UI owner-switch tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| LG-001 | Medium | open | Increment 2 (Task 12) | crash-report redaction tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| AU-004 | Medium | open | Increment 2 (Task 9) | deletion cancellation audit-event tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| TS-001 | Medium | open | Increment 4 (Task 23) | local Supabase API/RPC integration coverage | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| TS-002 | Medium | open | Increment 4 (Task 23) | per-module coverage thresholds for auth/guidance/execution | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| ER-001 | Medium | open | Increment 1 (Task 5) | protocol-execution component/API error-mapping tests | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `f00a5f4`+`488238c`; code PASS/APPROVED after re-review, security SECURE Low |
| CI-002 | Medium | open | Increment 4 (Task 21) | tooling tests; locked mutation-runner checks | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| CI-003 | Medium | open | Increment 4 (Task 22) | CI audit coverage for both lockfiles | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| DP-001 | Medium | open | Increment 4 (Task 24) | dependency-policy tests; exception registry entries | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| DB-002 | Medium | open | Increment 1 (Task 7) | two-connection concurrent retry tests | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ed1df0f`; code PASS/APPROVED, security SECURE (two-session blocking by construction; live proof carried) |
| DB-003 | Medium | open | Increment 1 (Task 7) | integrity-guard tests; manual review note | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ed1df0f`; code PASS/APPROVED, security SECURE (purge enforcement owned by Task 13) |
| DB-004 | Medium | open | Increment 1 (Task 7) | timestamp-skew window tests | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ed1df0f`; code PASS/APPROVED, security SECURE (skew values unconfirmed vs telemetry) |
| IN-001 | Medium | open | Increment 1 (Task 7) | field-limit/table tests | SECURITY_AUDIT_v1.0_14-10-2026.md | Repair `ed1df0f`; code PASS/APPROVED, security SECURE |
| GT-001 | Medium | open | Increment 4 (Task 23) | refreshed control-plane claim evidence; audit script tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| ER-002 | Low | open | Increment 2 (Task 11) | export error-handling tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| CQ-002 | Low | open | Increment 3 (Task 17) | controller integration and critical-action tests | SECURITY_AUDIT_v1.0_14-10-2026.md | — |
| DP-002 | Low | open | Increment 4 (Task 24) | dependency-policy tests; exact-pin verification | SECURITY_AUDIT_v1.0_14-10-2026.md | — |

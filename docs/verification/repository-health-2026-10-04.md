# Repository health audit — 4 October 2026

## Conclusion

StrandCue is not fully consolidated or reproducibly verified from a fresh clone. Preserve the current working state before integrating branches. This audit changes no application code, migrations, dependency versions, credentials, or remote resources.

## Verified state

- Fetched `origin`. Local `main` is `41afcad`; remote `main` is `d190f21` (one merge commit ahead).
- Five worktrees exist, including the primary checkout and `codex/repo-recovery-integration` outside the repository directory.
- Local main and remote main have identical tracked trees; the one-commit lag is history-only.
- Chemical-services, Docker-fix, stabilization and original Phase 1 branches are already ancestors of remote main. Recovery and delivery-plan work are not yet on main, but all audited branch heads are ancestors of the clean integration branch.
- `origin/main...codex/repo-recovery-integration` has 0 commits unique to main and 107 unique to integration. This is a candidate consolidation history, not proof that its code or migrations are release-ready.
- `origin/main...origin/codex/repo-recovery` has 17 commits unique to main and 98 unique to recovery. Directly replacing main with recovery would lose main's history.
- The integration candidate changes 182 files (21,519 insertions, 69 deletions) against remote main. Its existing reconciliation design, plan and inventory are under `docs/superpowers/` and `docs/verification/` in that worktree. Continue that work rather than creating another competing integration branch.
- The main checkout has nine modified tracked files, three untracked username/permission migrations and an untracked auth-recovery test. A clone does not receive these changes.
- APKs, screenshots, backup material, generated Android files and many test-result text files are untracked. These are workspace clutter; they are not all committed repository bloat. Preserve useful evidence and backups before cleanup.
- No confirmed dead application code was identified. Graph results include untracked backup/generated material, and framework callbacks can have no graph callers while still being used. Require import/export and runtime reachability evidence before deleting code.

## Verification evidence

- Default host Node is 25.1.0; the declared Node 24 runtime gate correctly rejects it.
- Temporary Node 24.21.0 was used without changing global tooling. Type checking and lint completed successfully.
- A focused coverage run reported 353 passing tests, one failure and three skipped tests. The failure is the dependency audit CLI test expecting current exceptions to permit an advisory fixture. This needs diagnosis rather than weakening the policy.
- An overlapping full/focused coverage attempt caused a report-directory lock error. The subsequent sequential full verification run passed typecheck and lint, then reproduced the same test failure (353 passed, one failed, three skipped). Later gate stages did not run. The overlapping attempt is not evidence of an application defect.
- Live `npm audit` reports 30 affected package entries: 20 high, 10 moderate, zero critical. Counts include inherited dependency findings, not 30 distinct exploitable application defects.
- `npm run audit:dependencies` returns `DEPENDENCY-POLICY-HOLD`, with 44 policy findings and codes `EXCEPTION-REVIEW-DUE`, `ADVISORY-UNEXCEPTED`, `ADVISORY-SEVERITY`, and `EXCEPTION-PATH-STALE`.
- Both existing advisory exceptions were due for review on 27 September and expire on 13 October 2026.
- The audit CLI omits development dependencies. Build/tooling dependencies need an explicit security policy too.
- Coverage thresholds cover only `packages/domain/src`, not all mobile/auth/storage code.
- Live Supabase Auth/PostgREST tests are opt-in and skipped by default. CI has no signed Android build or device end-to-end gate.
- Fresh-clone installation, local Docker/Supabase startup, web export, signed native journeys and hosted control-plane settings have not been certified by this audit.

## Security assessment

Existing strengths include native SecureStore, browser sessions in memory, forced RLS, owner checks, restricted grants, narrow non-login database mutator roles and empty SQL search paths. No obvious production credential was found in inspected source; this is not a full Git-history secret scan.

Priority gaps:

1. Review the new high-severity transitive advisories and overdue exceptions. Evaluate reachability separately for application runtime and build tooling. Do not use `npm audit fix --force`: proposed fixes include major changes and framework downgrades.
2. Verify deployed grants/RLS, email confirmation, redirect allowlists, password-change protection, auth rate limits, abuse protection and session policy. Local configuration does not establish hosted settings.
3. Complete verified HTTPS Android App Links and signed cold/warm recovery tests. The current checkout app config has a custom scheme and Android package, but no owned HTTPS intent filter.
4. Complete export/deletion, access blocking and session revocation in the canonical application history. Recovery-branch work must be reviewed before it is treated as complete on main.
5. Bound RPC payloads and collections and establish write quotas/abuse monitoring. Reviewed service/passport writes do not have the username endpoint's explicit owner rate limit.
6. Pin CI actions to reviewed immutable SHAs; add dependency update automation, static security analysis and secret scanning. Inspect hosted branch protection and security settings separately; absence of a workflow does not prove hosted scanning is disabled.
7. Review release signing, Android backup policy and permissions. The local generated Android tree uses debug signing for release by default; this is a local release hazard, not tracked main configuration.

References: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use), [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

## Recommended consolidation and hardening sequence

1. Preserve all worktree changes and untracked functional files in recoverable snapshots. Inventory backup/evidence files without putting private data into Git.
2. Reconcile the integration branch against fresh remote main and the dirty primary checkout. Review overlapping auth fixes, navigation/privacy work, migration order and native configuration. Do not blanket merge every branch or remove worktrees yet.
3. Establish one reviewed branch containing the intended source, ordered migrations and tests. Verify it in a clean checkout with `npm ci` and Node 24, not existing node_modules or manually repaired hosted tables.
4. Fix the reproducible policy/test failures and update compatible dependencies in small framework-aware batches. Remove exceptions only when the affected paths are fixed or a current reviewed assessment justifies them.
5. Rewrite startup instructions around exact prerequisites, deterministic installation, local Supabase migration application, public keys, email test inbox, emulator/device URLs and Android build requirements. Prove the documented journey from a clean clone.
6. Add live two-owner authorization tests, Android recovery/recording/privacy journeys and broader meaningful coverage. Keep development web export distinct from native release evidence.
7. Remove only proven unused code/dependencies. Ignore generated APKs/logs/native build outputs according to the chosen native-source strategy; archive useful evidence before deleting anything. Retain database migration history.
8. Require the verified CI gate and review before main integration. Publish/merge, hosted settings and production migrations remain separately scoped operations. Retire old branches/worktrees only after confirming their commits and local changes are preserved.

## Completion criteria

A new developer can clone main, install locked dependencies, initialize a fresh database and run the app using only the README. Required checks pass, live cross-owner access is denied, signed Android primary/recovery/privacy journeys have evidence, high/critical findings are fixed or formally assessed, and every remaining branch has a recorded disposition. Performance, accessibility, backup restore and release acceptance remain explicit gates rather than assumed consequences of unit tests.

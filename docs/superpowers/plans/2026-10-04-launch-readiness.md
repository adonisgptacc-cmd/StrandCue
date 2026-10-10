# StrandCue Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move StrandCue from the current release hold to a reproducible, protected Android launch with reviewed dependency risk, proven privacy operations, and signed-device evidence.

**Architecture:** Treat each launch blocker as an independent gate with durable evidence. GitHub protects source promotion, the dependency policy records only exact reviewed build-tool exposure, a private scheduled worker completes deletion, and a signed ARM64 candidate passes device journeys before release promotion.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, Vitest, Supabase, Cloudflare Workers, GitHub Actions, Android Gradle/SDK.

**Spec:** `docs/verification/release-blockers-2026-10-04.md`

## Global Constraints

- Preserve Node `>=24 <25`, Expo SDK 57, package `za.co.strandcue.app`, and the existing custom-scheme recovery flow until HTTPS recovery cutover is separately proven.
- Never commit signing keys, Supabase service credentials, temporary test identities, or literal production secrets.
- Keep the release on HOLD until every gate below has recorded evidence; a documented build-tool exception never authorizes a runtime-reachable high vulnerability.
- Hosted mutations, GitHub rules, worker deployment, push, and merge require their existing scoped approval boundaries.
- Preserve the original checkout; implement in `codex/repo-recovery-integration` or a successor isolated worktree.

## Review Focus

- A dependency path moves from build-only to shipped runtime: dependency policy must fail closed and revoke the exception.
- A deletion worker crashes after Auth deletion but before its receipt: the retry must treat an absent identity as success without restoring access.
- An old access token races profile purge: both tombstone guards must continue blocking account recreation.
- The final APK is signed by a different certificate or package: the link gate and artifact inspection must fail.
- A required GitHub check is renamed or removed: `main` protection must still block merge rather than silently stop requiring verification.

---

### Task 1: Protect the public GitHub repository

**Files:**
- Modify: `.github/workflows/verify.yml`
- Modify: `.github/workflows/android-build.yml`
- Test: `tests/tooling/ci.test.ts`
- Update: `docs/verification/release-blockers-2026-10-04.md`

**Interfaces:**
- Consumes: active `verify` and Android workflows.
- Produces: stable required check names and recorded `main` ruleset evidence.

- [ ] Add tests pinning the exact required check names: type/lint/coverage, dependency audit, Supabase API, Android build, and secret scan.
- [ ] Run `npx vitest run tests/tooling/ci.test.ts`; verify the new expectations fail before workflow changes.
- [ ] Give workflow jobs stable names and ensure pull requests run every required check with least-privilege permissions.
- [ ] Run the CI tests and workflow syntax checks; verify they pass.
- [ ] Run a full-history secret scan locally; rotate any exposed credential before continuing.
- [ ] Enable GitHub secret scanning, push protection, Dependabot alerts/security updates, and private vulnerability reporting where available.
- [ ] Create a `main` ruleset requiring pull requests, one approval, dismissed stale approvals, resolved conversations, current branches, the stable checks, no force push, no deletion, and administrator enforcement.
- [ ] Create a protected `production` environment requiring manual approval for deployment jobs.
- [ ] Query GitHub APIs and record the returned active rules and required checks in the release ledger.
- [ ] Commit workflow/test changes as `ci: enforce protected release checks`.

### Task 2: Disposition the two high build-tool advisories

**Files:**
- Modify: `docs/verification/dependency-advisory-exceptions.json`
- Create: `docs/verification/dependency-reachability-2026-10-04.md`
- Modify: `tests/tooling/dependency-policy.test.ts`
- Update: `docs/verification/release-blockers-2026-10-04.md`

**Interfaces:**
- Consumes: npm audit JSON, workspace surface classification, signed APK contents.
- Produces: two exact, expiring review records or a continuing dependency HOLD.

- [ ] Add tests that accept only the observed Expo CLI paths for `GHSA-vfj7-8cjw-p6xm` and `GHSA-86w9-cpqp-85rv`, reject Android/runtime or mixed exposure, reject new paths, and expire automatically within 30–60 days.
- [ ] Run the focused dependency-policy tests and verify they fail against the current stale records.
- [ ] Record the exact paths, vulnerable functions, threat inputs, APK/source absence evidence, CI trust boundary, code-signing non-use, owner, review date, expiry, and removal condition.
- [ ] Renew only the two exact build-tool records; do not suppress derived nodes globally.
- [ ] Run `npm run audit:dependencies`; expected result is PASS only while paths and dates exactly match the review.
- [ ] Run `npm ls braces node-forge --all`, source import scans, and signed-artifact inspection; attach output summaries to the reachability report.
- [ ] Add a weekly Dependabot/audit review and immediately remove exceptions when compatible patched packages arrive.
- [ ] Obtain security review and commit as `security: review Expo build-tool advisories`.

### Task 3: Deploy and operate the deletion worker

**Files:**
- Modify: `scripts/account-deletion-worker.ts`
- Modify: `scripts/account-deletion-cli.ts`
- Modify: `tests/tooling/account-deletion-worker.test.ts`
- Modify: `docs/runbooks/account-deletion.md`
- Create: deployment configuration for a separate private scheduled worker after selecting the hosting target.

**Interfaces:**
- Consumes: `deletion_worker_claim(uuid)` and `deletion_worker_finish(uuid,uuid,text)` hosted RPCs.
- Produces: a once-per-minute, server-only, observable deletion processor.

- [ ] Add tests for scheduler authentication, one-job bounds, no-work success, safe error codes, absent-user idempotency, lease loss, and redacted logs.
- [ ] Run focused worker tests and verify the scheduler tests fail before deployment support is added.
- [ ] Package a separate private worker; configure the Supabase URL and service-role key only in its secret store.
- [ ] Configure one bounded invocation per minute with no public request handler or require a scheduler-only secret if the platform exposes HTTP.
- [ ] Add metrics/alerts for queue age, retry count, consecutive failures, and invocation failure without logging user data.
- [ ] Create a disposable hosted user, request deletion, run the worker, and prove profile/app-data absence, Auth identity absence, refresh failure, stale-token denial, and safe retry.
- [ ] Exercise cancellation before claim and document the expected irreversible boundary after claim.
- [ ] Update the runbook with deploy, rotate, pause, resume, retry, incident, and restore/reconciliation steps.
- [ ] Obtain security review and record deployment evidence without credentials.
- [ ] Commit as `feat: operate scheduled account deletion`.

### Task 4: Produce and test the ARM64 release candidate

**Files:**
- Modify only generated isolated Android project files outside Git for signing/build configuration.
- Modify: `.maestro/*` flows where device coverage is missing.
- Modify: `tests/tooling/maestro.test.ts`
- Update: `docs/verification/release-blockers-2026-10-04.md`

**Interfaces:**
- Consumes: package `za.co.strandcue.app`, local release signing key, live App Links association.
- Produces: checksum-pinned ARM64 APK/AAB and device evidence.

- [ ] Build `arm64-v8a` release APK and AAB under Node 24/JDK 17 with `NODE_ENV=production`.
- [ ] Verify package, version, SDK levels, v2/v3 signing, certificate fingerprint, supported ABI, and SHA-256 checksum.
- [ ] Use a disposable/test phone; back up needed data, uninstall any differently signed debug package, then install the real-package release.
- [ ] Reset Android App Links state, request domain verification, and prove `https://strandcue.adonisgptacc.workers.dev/...` resolves to StrandCue without a chooser.
- [ ] Run signup, email confirmation, sign-in, password recovery, offline restart/read/write/sync, export, deletion cancellation, completed deletion, and stale-session rejection.
- [ ] Run TalkBack, 200% font scaling, focus order, accessible names, touch targets, contrast, rotation, and small-screen checks.
- [ ] Capture screenshots/log summaries that contain no credentials or personal data and record every pass/failure against the candidate checksum.
- [ ] Fix any Sev1/Sev2 finding with a failing test first, rebuild, and rerun the affected journey plus smoke suite.
- [ ] Commit automation or source fixes independently from generated/private artifacts.

### Task 5: Run the final release gate

**Files:**
- Modify: `docs/verification/release-blockers-2026-10-04.md`
- Create: `docs/verification/release-candidate-<version>.md`

**Interfaces:**
- Consumes: protected GitHub state, dependency disposition, worker proof, signed-device proof.
- Produces: one auditable GO/HOLD decision tied to a commit and artifact checksum.

- [ ] From a clean checkout of the candidate commit, run `npm ci`, typecheck, lint, coverage, control-plane audit, Expo check, web export, dependency policy, release-link check, Supabase API tests, and Android build.
- [ ] Verify hosted migrations match repository inventory and consumer maintenance grants remain revoked.
- [ ] Verify Cloudflare active version, association JSON, package, fingerprint, content type, cache policy, and no redirects.
- [ ] Verify the deletion scheduler is healthy and the disposable deletion proof is complete.
- [ ] Verify GitHub ruleset, required checks, production approval, secret scanning, and push protection are active.
- [ ] Have an independent reviewer assess code, security, test evidence, and operational runbooks; resolve every critical/high finding.
- [ ] Push the reviewed branch, open a PR with checks and test plan, obtain approval, and merge only through protected `main`.
- [ ] Tag the exact merge commit, attach checksum-pinned artifacts, and record rollback instructions.
- [ ] Mark GO only when all evidence belongs to the same commit, package, certificate, and artifact checksum; otherwise retain HOLD with the precise failing gate.

## Self-Review Result

- Coverage: all current blockers map to Tasks 1–5; the earlier generated-cache rejection is resolved and needs no launch task.
- Dependencies: GitHub protection and dependency disposition can proceed in parallel; worker proof and device proof are independent; final release depends on all four.
- Remaining external choices: select the private scheduler host and provide a disposable physical Android device/email inbox for end-to-end confirmation and recovery.

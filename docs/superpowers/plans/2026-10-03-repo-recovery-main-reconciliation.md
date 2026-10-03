# Repo-Recovery and Main Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile `codex/repo-recovery`, stabilized `main`, and the reviewed username/recovery changes into a verified integration branch that can safely advance `main` with all seven product sections intact.

**Architecture:** Start from the current `main` ancestry in the isolated worktree and merge `codex/repo-recovery` without rewriting either history. Resolve each subsystem according to the approved source-of-truth rules, then selectively transfer only the reviewed dirty-checkout changes. Treat migrations as an ordered ledger and require repository, database, and Android evidence before integration is eligible for `main`.

**Tech Stack:** Git worktrees/merge, TypeScript 6, React Native/Expo, Supabase/PostgreSQL migrations, Vitest/PGlite, ESLint, Maestro/ADB.

**Spec:** `docs/superpowers/specs/2026-10-03-repo-recovery-main-reconciliation-design.md`

## Global Constraints

- Do not reset, rebase destructively, force-push, delete either source branch, or modify the dirty primary checkout.
- Treat every file under `sources/` as read-only.
- Use Node `>=24.0.0 <25.0.0` and the committed lockfile.
- Preserve `codex/repo-recovery` product surfaces and `main` stabilization/dependency protections.
- Transfer only reviewed username/recovery source, tests, configuration, and migrations; exclude APKs, screenshots, backups, Android build output, and test-result captures.
- Never log or persist raw authentication codes, access tokens, refresh tokens, passwords, or Supabase secrets.
- Do not claim a gate passed without a fresh command or device result.

## Review Focus

- A modify/delete conflict must not silently remove `main`'s runtime/dependency policy or `codex/repo-recovery`'s product modules; Task 2 inventory and Task 3 tests pin both surfaces.
- Migration timestamps and object definitions must remain unique and ordered when the three username migrations are added; Task 4 adds inventory and clean-application checks.
- Duplicate Android deep-link callbacks must not invalidate an otherwise valid recovery session; Task 5 retains the single-flight regression test and Task 7 proves it on-device.
- The seven-tab navigation must remain usable on the emulator at narrow width without hiding Activities, Shelf, or Tools; Task 3 adds a navigation contract and Task 7 captures device evidence.
- Generated/local evidence must not enter Git history; Tasks 1 and 6 explicitly audit staged and tracked files.

---

### Task 1: Establish the integration branch and preservation inventory

**Files:**
- Create: `docs/verification/repo-recovery-integration-inventory.md`
- Inspect only: primary checkout tracked diff and untracked file list

**Interfaces:**
- Consumes: `main`, `codex/repo-recovery`, approved reconciliation spec, primary checkout at `C:/Users/ABADO/Desktop/StrandCue`.
- Produces: branch `codex/repo-recovery-integration`; an inventory classifying each dirty path as transfer, generated/excluded, or unresolved.

- [ ] **Step 1: Create the integration branch at the worktree HEAD**

Run: `git switch -c codex/repo-recovery-integration`

Expected: the worktree leaves detached HEAD and points to the new branch while retaining the committed design.

- [ ] **Step 2: Install the committed baseline and run pre-merge tests**

Run: `npm ci`

Run: `npm run typecheck && npm run lint && npm test`

Expected: record every baseline failure by exact test name; do not attribute a pre-existing failure to the merge.

- [ ] **Step 3: Inventory dirty primary-checkout paths without modifying them**

Record the tracked diff for `apps/mobile/app.json`, `apps/mobile/src/{auth,client,contracts,records}.tsx`, affected database/mobile tests, and the three untracked username migrations. Classify `apps/mobile/android/`, APKs, screenshots, `backups/`, and `test-result*.txt` as excluded generated/local evidence.

- [ ] **Step 4: Write and review the preservation inventory**

The inventory must identify the exact source paths to transfer in Task 5 and state that ambiguous paths are not transferred until reviewed.

- [ ] **Step 5: Commit the inventory**

Run: `git add docs/verification/repo-recovery-integration-inventory.md && git commit -m "docs: inventory reconciliation inputs"`

### Task 2: Merge histories and resolve repository/tooling conflicts

**Files:**
- Modify: `.github/workflows/verify.yml`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Preserve: `eslint.config.mjs`
- Preserve: `scripts/audit-dependencies-cli.ts`
- Preserve: `scripts/check-runtime.ts`
- Preserve: `scripts/dependency-policy.ts`
- Preserve: `scripts/runtime-policy.ts`
- Preserve: `scripts/workspace-manifests.ts`
- Preserve: `docs/verification/dependency-advisory-exceptions.json`
- Preserve: `tests/tooling/{dependency-policy,runtime-policy,workspace-manifests}.test.ts`

**Interfaces:**
- Consumes: both Git histories and the source-of-truth rules.
- Produces: a completed merge containing `codex/repo-recovery` workflows/features while retaining the Node 24 and dependency-policy verification surface from `main`.

- [ ] **Step 1: Start the non-squash merge**

Run: `git merge --no-ff --no-commit codex/repo-recovery`

Expected: conflicts are limited to known shared files plus any newly detected conflicts; do not commit while unmerged paths remain.

- [ ] **Step 2: Resolve workflow and package conflicts by composition**

Keep the `main` runtime, lint, dependency audit, control-plane audit, coverage, Expo check, and web export gates. Add the recovery branch's Android/EAS, mutation, assetlinks, Maestro, beta-readiness, and product-authority checks where their scripts remain supported. Regenerate `package-lock.json` with Node 24 using `npm install --package-lock-only`; never hand-edit lockfile dependency graphs.

- [ ] **Step 3: Protect generated artifacts and local worktrees**

Ensure `.gitignore` covers `.worktrees/`, `apps/mobile/android/.gradle/`, `apps/mobile/android/app/build/`, root `Screenshot_*.png`, root `strandcue-*.png`, root `strandcue-*.apk`, root `strandcue-*.aab`, and root `test-result*.txt` without ignoring committed test fixtures.

- [ ] **Step 4: Verify the combined tooling contracts**

Run: `npm run check:runtime`

Run: `npm test -- --run tests/tooling/runtime-policy.test.ts tests/tooling/dependency-policy.test.ts tests/tooling/workspace-manifests.test.ts tests/tooling/ci.test.ts tests/tooling/eas-config.test.ts tests/tooling/maestro.test.ts`

Expected: all selected tests pass with both stabilization and release surfaces present.

### Task 3: Reconcile the complete mobile and domain product surface

**Files:**
- Modify: `apps/mobile/src/records.tsx`
- Modify: `apps/mobile/src/services.tsx`
- Modify: `apps/mobile/src/passport-editor.tsx`
- Preserve/create from recovery branch: `apps/mobile/src/{activities,activity-api,activity-drafts,activity-editor,activity-history,shelf,shelf-api,shelf-drafts,shelf-editor,shelf-history,tools,tool-api,tool-drafts,tool-editor,tool-history}.ts*`
- Preserve/create from recovery branch: `apps/mobile/src/screens/*.tsx`, `apps/mobile/src/{analytics,consent-api,crash-report,deletion-api,export-api,settings-api}.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/domain/src/services.ts`
- Preserve/create from recovery branch: `packages/domain/src/{activity,shelf,tools}.ts`
- Test: `tests/mobile/component-state.test.ts`
- Test: `tests/mobile/{activity,history,shelf,tools,settings,accessibility}.test.ts`
- Test: `tests/domain/{activity,shelf,tools}.test.ts`

**Interfaces:**
- Consumes: recovery-branch feature modules and `main` owner-load/component-stability behavior.
- Produces: `Records` navigation exposing the exact ordered tabs `Passport`, `Services`, `Activities`, `Shelf`, `Tools`, `History`, `Settings`, with owner-safe async loading.

- [ ] **Step 1: Add a failing navigation contract before resolving `records.tsx`**

Add an assertion in `tests/mobile/accessibility.test.ts` that renders or inspects `Records` and requires all seven tab labels in order. It must fail while the four-tab `main` implementation is selected.

- [ ] **Step 2: Resolve `records.tsx` and supporting components**

Use the recovery branch's complete navigation and screen routes. Retain `main`'s current-owner guards, stale-request protections, double-submit protections, and draft-owner transition behavior wherever equivalent recovery code lacks them.

- [ ] **Step 3: Reconcile domain exports and expanded service contracts**

Export Activity, Shelf, and Tools contracts from `packages/domain/src/index.ts`; retain the recovery branch's complete service schema while preserving any stricter compatible validation added on `main`.

- [ ] **Step 4: Run focused product tests**

Run: `npm test -- --run tests/domain/activity.test.ts tests/domain/shelf.test.ts tests/domain/tools.test.ts tests/mobile/activity.test.ts tests/mobile/history.test.ts tests/mobile/shelf.test.ts tests/mobile/tools.test.ts tests/mobile/settings.test.ts tests/mobile/component-state.test.ts tests/mobile/accessibility.test.ts tests/mobile/services.test.ts`

Expected: all focused tests pass, including the seven-tab contract and owner-switch stale-response cases.

### Task 4: Reconcile and validate the Supabase migration ledger

**Files:**
- Preserve/create: `supabase/migrations/20260924150000_activities_history.sql` through `20260924340000_consent_rpc.sql`
- Transfer/review: `supabase/migrations/20260925182000_username_options.sql`
- Transfer/review: `supabase/migrations/20260930172000_username_schema_usage_repair.sql`
- Transfer/review: `supabase/migrations/20260930173000_username_profile_lookup_repair.sql`
- Modify: `tests/database/migration-inventory.test.ts`
- Modify: `tests/database/migration.test.ts`
- Test: `tests/database/{activity,shelf,tools,export,deletion,consent,username,hardening,supabase-api}.test.ts`

**Interfaces:**
- Consumes: the recovery branch's trusted Phase 1 migration sequence and the dirty checkout's username migrations.
- Produces: one ordered, non-duplicative migration ledger that creates all required objects and maintains least-privilege grants/RLS.

- [ ] **Step 1: Extend the migration inventory test before transferring username migrations**

Assert unique numeric prefixes, strictly ordered filenames, no trusted migration duplicated under `supabase/drafts/`, and presence of the three reviewed username migrations after their prerequisites.

- [ ] **Step 2: Review semantic overlap before copying**

Compare `20260924290000_username_change.sql` with each later username migration by functions, grants, schemas, and indexes. Transfer only forward repairs/options that are not already satisfied; document any omitted file and reason in the integration inventory.

- [ ] **Step 3: Apply the selected migrations and update database expectations**

Preserve committed migrations as immutable history. If a compatibility repair is needed, add a new forward migration with a fresh timestamp rather than editing an already-applied migration.

- [ ] **Step 4: Run migration, database, and security tests**

Run: `npm test -- --run tests/database/migration-inventory.test.ts tests/database/migration.test.ts tests/database/activity.test.ts tests/database/shelf.test.ts tests/database/tools.test.ts tests/database/export.test.ts tests/database/deletion.test.ts tests/database/consent.test.ts tests/database/username.test.ts tests/database/hardening.test.ts tests/database/supabase-api.test.ts`

Expected: all local/PGlite tests pass; live Supabase tests either pass with configured credentials or report their explicit skip/unavailable state.

### Task 5: Transfer and integrate username and recovery fixes

**Files:**
- Modify: `apps/mobile/src/auth.tsx`
- Modify: `apps/mobile/src/client.ts`
- Modify: `apps/mobile/src/contracts.ts`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/src/records.tsx`
- Test: `tests/mobile/auth-recovery.test.ts`
- Test: `tests/mobile/contracts.test.ts`
- Test: `tests/mobile/component-state.test.ts`
- Test: `tests/database/{migration,passport}.test.ts`

**Interfaces:**
- Consumes: reviewed dirty-checkout diffs and the integrated recovery-branch settings/username surface.
- Produces: `parseRecoveryCallback(raw, pending) -> {code, flowId} | null`; `createRecoveryCallbackGate()` single-flight behavior; PKCE client configuration with `appendPkceFlowIdToRedirects`; persistent recovery-mode marker; username-options parsing and suggestions.

- [ ] **Step 1: Copy the focused recovery regression test first**

Transfer `tests/mobile/auth-recovery.test.ts` and the applicable contract assertions. Run them before production transfer and confirm failures are caused by missing flow-ID/deduplication behavior.

- [ ] **Step 2: Integrate callback validation and single-flight exchange**

Validate the exact `strandcue://auth/callback` scheme/host/path, exactly one `code`, exactly one `sb_flow_id` matching `[A-Za-z0-9_-]{8,64}`, a valid pending marker, and no fragment credentials. Exchange with `{flowId}` and ensure duplicate delivery reuses the first successful result rather than signing out.

- [ ] **Step 3: Integrate recovery-state persistence and cleanup**

Persist password-change-required state across remounts. Clear it only after successful password update or an explicit safe cancellation path. Ensure failed/expired links cannot leave a privileged session behind.

- [ ] **Step 4: Integrate username normalization, uniqueness, and suggestions**

Compose the dirty-checkout username-options work with recovery branch settings/username-change behavior. Preserve the database uniqueness boundary; never rely only on client availability checks.

- [ ] **Step 5: Run focused auth and username tests**

Run: `npm test -- --run tests/mobile/auth-recovery.test.ts tests/mobile/contracts.test.ts tests/mobile/component-state.test.ts tests/database/passport.test.ts tests/database/migration.test.ts tests/database/username.test.ts`

Expected: all focused tests pass, including concurrent duplicate callbacks, remount persistence, invalid callback rejection, duplicate username rejection, and suggestion rendering.

### Task 6: Complete merge verification and audit the resulting history

**Files:**
- Modify: conflict-resolved documentation only where current claims must reflect verified state.
- Create: `docs/verification/repo-recovery-integration-result.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a merge commit plus a verification record that distinguishes passed, failed, skipped, and external gates.

- [ ] **Step 1: Audit the staged merge before committing**

Run: `git diff --check`

Run: `git status --short`

Run: `git diff --name-only --cached`

Expected: no unmerged paths; no APKs, screenshots, backups, Android build products, `node_modules`, or test-result captures are staged.

- [ ] **Step 2: Complete the merge commit**

Run: `git commit -m "merge: reconcile repo recovery into main baseline"`

- [ ] **Step 3: Run the canonical verification suite**

Run: `npm run verify`

Expected: typecheck, lint, coverage, control-plane audit, dependency audit, Expo compatibility check, and web export all pass. Report every failure by command and test name rather than hiding pre-existing issues.

- [ ] **Step 4: Run security-specific review commands**

Run: `npm audit --audit-level=high`

Run: `git grep -n -E "service_role|sb_secret_|access_token|refresh_token" -- ':!package-lock.json' ':!docs/**' ':!tests/**'`

Expected: no client-side service-role/secret credential and no committed live auth token; intentional symbolic references are reviewed individually.

- [ ] **Step 5: Write the integration result and commit it**

Record branch SHAs, merge SHA, commands/results, migration outcome, unresolved external gates, and exact device evidence still required.

Run: `git add docs/verification/repo-recovery-integration-result.md && git commit -m "docs: record repo recovery integration evidence"`

### Task 7: Prove the reconciled Android journeys and prepare `main`

**Files:**
- Update: `.maestro/03-tab-navigation.yaml` if selectors changed during reconciliation.
- Update: `.maestro/02-recovery-request.yaml` only if the approved UX changed.
- Update: `docs/verification/repo-recovery-integration-result.md` with device evidence.

**Interfaces:**
- Consumes: verified integration branch, signed-in emulator, configured Supabase redirect URLs including `strandcue://auth/**`.
- Produces: device proof for seven-section navigation, recovery/password update, and username duplicate suggestions; a reviewed branch eligible to merge into `main`.

- [ ] **Step 1: Start the reconciled Expo build and connect the emulator**

Use the repository mobile start command, `adb reverse tcp:8081 tcp:8081`, and the existing development build. Capture the exact commit SHA under test.

- [ ] **Step 2: Verify all seven product sections**

Confirm Passport, Services, Activities, Shelf, Tools, History, and Settings are visible and open without a fatal error. Run Maestro tab navigation where available and capture concise evidence.

- [ ] **Step 3: Verify recovery end to end**

Request exactly one new recovery email, open only that newest Gmail link, confirm the password-change screen, verify duplicate callback delivery does not sign out the session, save a 12+ character test password, and sign in with it.

- [ ] **Step 4: Verify duplicate username behavior**

Attempt an existing username from the second test account, confirm it is rejected, confirm suggestions are displayed, select an available suggestion, and complete the profile transition.

- [ ] **Step 5: Run Maestro 01–04 and accessibility checks**

Record pass/fail for each flow and each required accessibility check. Failures remain blockers unless explicitly classified as external and approved.

- [ ] **Step 6: Review the branch before advancing `main`**

Run: `git log --oneline --decorate --graph main..HEAD`

Run: `git diff --stat main...HEAD`

Obtain code/security review. Only after the user approves the verified result, merge `codex/repo-recovery-integration` into `main` using a normal merge or fast-forward. Do not push or delete branches without separate explicit authorization.

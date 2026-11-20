# Local signed Android APK and device acceptance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a traceable, locally signed StrandCue preview APK from commit `d8c2818`, verify its package and signing identity, and collect honest results for all nine Android acceptance scenarios.

**Architecture:** Build from a clean archive of the reviewed commit in a short Windows path so CMake and Ninja do not inherit the long worktree path that blocked Task 25. Generate native Android files only in disposable scratch space, compile one `arm64-v8a` APK first, sign it with an external local test key, and verify the artifact before installation. Record build facts separately from device results; a successful APK does not change launch status until the signed-device checklist and remaining hosted gates pass.

**Tech stack:** Node 24.19.x, Expo SDK 57, React Native 0.86.3, Java 17, Gradle, Android SDK/NDK/CMake/Ninja, Android build-tools (`apksigner`, `zipalign`, `aapt`), ADB, PowerShell, Vitest.

**Spec:** `docs/verification/security-audit-launch-decision-2026-10-18.md`; `docs/verification/android-acceptance-checklist.md`; `.superpowers/sdd/2026-10-14-security-audit-remediation/task-25-report.md`; `apps/mobile/app.json`; `apps/mobile/eas.json`.

## Global constraints

- Application-source authority is exactly commit `d8c2818a7fac0e996910a5a33d6784875800993b` on `codex/security-audit-remediation`. Later plan/evidence-only commits do not change that build input. Any application, configuration, dependency, or build-tooling change creates a new source authority and requires all evidence to be rebound to the new commit.
- Use Node `>=24 <25`, Java 17, package `za.co.strandcue.app`, and the existing Expo SDK 57 dependency graph.
- Build only an APK for direct tester installation in this increment. Google Play AAB creation and Play App Signing are later tasks.
- A Play Console signing SHA-256 can be added later. Do not replace the locally signed association fingerprint until a Play-signed build exists and the migration/cutover has been reviewed.
- Never copy a keystore, alias password, store password, Expo token, Supabase secret, or service-account JSON into the repository, build log, plan, evidence document, shell history, or APK distribution message.
- Signing inputs must be supplied through process-local environment variables or a secure prompt. Never print their values.
- Generated `android/`, `.cxx/`, Gradle caches, APKs, logs, and screenshots stay outside the Git worktree unless a task explicitly names a safe evidence file.
- Do not reuse or relabel an older APK. The artifact must prove it was built from the recorded source commit.
- Do not push, merge, deploy, publish, submit to Google Play, modify Cloudflare/Supabase, or change hosted settings in this plan.
- Tests and evidence must fail closed: missing tools, ambiguous signing identity, package mismatch, stale source, failed verification, or absent device evidence leaves the launch decision at HOLD.
- Use test-first changes for repository scripts or validators. Pure operator/build steps require captured command evidence rather than artificial unit tests.
- Every task ends with a clean-tree check and a focused review. Commit only tracked source, tests, runbooks, and redacted evidence.

## Review focus

- A native build performed from the wrong Git commit must stop before signing; Task 2 pins the archive commit and Task 5 rechecks it in the manifest.
- A Windows long path or stale Ninja manifest must not be retried blindly; Task 1 captures the toolchain and Task 3 uses a new short path and clean native caches.
- An APK with the wrong application ID, architecture, version, or certificate must be rejected; Tasks 4 and 5 verify each field from the artifact.
- Secrets must remain out of process output and Git; Task 4 uses environment-only signing inputs and Task 7 runs redacted secret/diff checks.
- Device results must describe observed outcomes, including failures, without turning NOT RUN into PASS; Task 6 updates each scenario independently.

---

### Task 1: Capture the Android build failure and toolchain baseline

**Files:**
- Create: `.superpowers/sdd/2026-10-18-local-android-apk/task-1-diagnostic.md`
- Modify: none

**Interfaces:**
- Consumes: the Task 25 failure report and local Java/Android/Gradle installation.
- Produces: a redacted diagnostic record naming the selected Java, Android SDK, build-tools, NDK, CMake, Ninja, Node, source commit, path lengths, and the exact first failing Gradle task.

- [ ] **Step 1: Confirm the source and clean tree**

Run from the remediation worktree:

```powershell
git cat-file -t d8c2818a7fac0e996910a5a33d6784875800993b
git status --short
node --version
```

Expected: the source object exists as a commit; status is empty; Node reports 24.x. Record the current documentation/evidence HEAD separately. Stop on any mismatch.

- [ ] **Step 2: Inventory the local toolchain without printing secrets**

Record `java -version`, `adb version`, installed Android platforms/build-tools/NDK/CMake folders, free disk space, Windows long-path policy state, and the resolved `node.exe` path. Record paths and versions only. Do not dump the environment.

- [ ] **Step 3: Preserve the prior failure signature**

Quote only the safe Task 25 facts: failing Gradle tasks, `build.ninja still dirty after 100 tries`, six-minute duration, source commit `02fd96a`, and the previous scratch path. Do not copy complete logs until they have been checked for credentials and private paths.

- [ ] **Step 4: Form and record the bounded hypothesis**

Primary hypothesis: the long generated/native dependency paths caused CMake/Ninja manifest churn on Windows. Competing hypotheses to test: incompatible CMake/Ninja/NDK versions, a stale native cache, and insufficient disk/permissions. Do not assert the primary hypothesis as proven yet.

- [ ] **Step 5: Commit the diagnostic record**

```powershell
git add -- .superpowers/sdd/2026-10-18-local-android-apk/task-1-diagnostic.md
git commit -m "docs: capture android build failure baseline"
```

---

### Task 2: Add a safe, repeatable short-path build preflight

**Files:**
- Create: `scripts/android-local-preflight.ts`
- Create: `tests/tooling/android-local-preflight.test.ts`
- Create: `docs/runbooks/local-android-apk.md`
- Modify: `package.json`

**Interfaces:**
- Produces: `checkAndroidLocalPreflight(input: AndroidLocalPreflightInput): AndroidLocalPreflightResult` and CLI script `npm run check:android-local`.
- The result includes source SHA, clean-tree status, Node major, Java major, SDK availability, scratch-path length, available disk, and a list of stable error codes. It contains no environment dump or secret values.
- Consumed by Task 3 before prebuild and Task 7 as a release evidence gate.

- [ ] **Step 1: Write failing tests**

Cover: exact source SHA accepted; different SHA rejected; dirty tree rejected; Node 25 rejected; Java other than 17 rejected; absent SDK rejected; scratch root outside the approved local build root rejected; scratch path over the documented maximum rejected; insufficient disk rejected; error output contains stable codes and no supplied secret-like values.

- [ ] **Step 2: Run the focused test and confirm RED**

```powershell
npx vitest run tests/tooling/android-local-preflight.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure validator and thin CLI**

Use immutable input/result objects. The CLI gathers only required facts, passes them to the pure validator, prints a one-line PASS or stable HOLD codes, and returns nonzero on HOLD. It must not enumerate or print environment variables.

- [ ] **Step 4: Add the package script and runbook**

Add `check:android-local`. Document the approved scratch root `C:\scb`, the one-build-at-a-time rule, cleanup procedure, required tools, environment variable names without values, and the prohibition on storing credentials in Git.

- [ ] **Step 5: Verify GREEN and coverage**

Run the focused test with coverage. Every metric for the new validator must be at least 80%.

- [ ] **Step 6: Review and commit**

Run typecheck, lint, `git diff --check`, a secret-pattern review of the staged diff, and a fresh code/security review. Resolve Critical, High, and Medium findings before committing.

```powershell
git commit -m "feat: add local android build preflight"
```

---

### Task 3: Reproduce and repair the native release compilation in a short path

**Files:**
- Create: `.superpowers/sdd/2026-10-18-local-android-apk/task-3-native-build.md`
- Modify: tracked files only if direct evidence proves a repository defect; otherwise none

**Interfaces:**
- Consumes: Task 2 preflight PASS.
- Produces: an unsigned or debug-signed `arm64-v8a` release APK in the disposable build directory plus a redacted build receipt.

- [ ] **Step 1: Create a fresh archive under the short root**

Use `git archive` for the exact current HEAD and extract to a new unique directory under `C:\scb`. Record the archive SHA and verify the extracted tree contains the expected commit marker supplied out of band. Never build from the old Task 25 scratch directory.

- [ ] **Step 2: Restore dependencies without modifying the lockfile**

Use the committed lockfile and Node 24. Prefer a clean `npm ci --ignore-scripts` in the short tree. If a node_modules junction is needed, its resolved target must also keep native source paths short; record the resolved path.

- [ ] **Step 3: Run Expo prebuild in the disposable copy**

From `apps/mobile`, run Expo prebuild for Android with `CI=1`. Confirm `app.json` yields `za.co.strandcue.app`. Generated native files remain disposable.

- [ ] **Step 4: Run a clean arm64 release compile**

From generated `android`, use Java 17 and run:

```powershell
.\gradlew.bat clean :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 --stacktrace
```

Do not force offline mode for the first diagnostic retry unless every dependency is known cached. Capture the first failure and relevant CMake/Ninja versions.

- [ ] **Step 5: If it fails, discriminate before changing anything**

Apply one change per retry: delete only generated `.cxx` and affected module build caches; confirm CMake/Ninja/NDK versions; shorten the dependency path further; then retry. Do not edit application source to mask an environment failure. Stop after three distinct evidence-based attempts and write a blocked report if the same error remains.

- [ ] **Step 6: Validate the successful compile output**

Require a non-empty APK produced by the current attempt. Record its path, size, SHA-256, Gradle task result, architecture, and whether it is unsigned or already signed. A successful Gradle exit without a validated APK is HOLD.

- [ ] **Step 7: Decide whether tracked changes are warranted**

If short-path clean compilation succeeds with no repo edits, commit only the redacted receipt. If a repository defect required a change, write a failing regression test first, implement the minimal fix, run the full verification gate, obtain code/security review, and commit source separately from evidence.

---

### Task 4: Sign the APK with an external local testing identity

**Files:**
- Create: `scripts/verify-android-artifact.ts`
- Create: `tests/tooling/verify-android-artifact.test.ts`
- Modify: `package.json`
- Modify: `docs/runbooks/local-android-apk.md`

**Interfaces:**
- Produces: `verifyAndroidArtifact(metadata: AndroidArtifactMetadata, expected: AndroidArtifactExpectation): AndroidArtifactVerification` and CLI `npm run verify:android-artifact -- <apk-path>`.
- Expected identity: package `za.co.strandcue.app`, source `d8c2818...` or current reviewed successor, `arm64-v8a`, version `0.1.0`, exactly one signer, and the captured public SHA-256 certificate fingerprint.
- Consumed by Tasks 5 and 7.

- [ ] **Step 1: Write failing validator tests**

Cover correct metadata plus wrong package, unsigned APK, multiple signers, wrong fingerprint, missing arm64 ABI, wrong version, malformed hash, missing source receipt, and tool-output parse failure. Confirm error messages never include password values.

- [ ] **Step 2: Run RED, then implement the pure validator and CLI**

The CLI may invoke `aapt dump badging`, `apksigner verify --verbose --print-certs`, and an ABI inspection command. Parse only their required fields. Return HOLD on missing or ambiguous fields.

- [ ] **Step 3: Select or create the external test key**

If an existing StrandCue local signing key is available, verify its public certificate and reuse it. Otherwise create a dedicated local alpha-testing key outside the repository. Store passwords securely outside Git. Record only alias-independent public certificate facts and SHA-256 fingerprint.

- [ ] **Step 4: Align and sign**

Run `zipalign` into a new output file, then `apksigner sign` with passwords supplied through secure environment variables or prompt-compatible file descriptors. Do not place passwords directly on a command line that will be recorded.

- [ ] **Step 5: Verify the signed output**

Run `apksigner verify --verbose --print-certs`, `zipalign -c`, the new artifact verifier, and SHA-256 hashing. Any mismatch deletes the distributable copy and leaves the task at HOLD.

- [ ] **Step 6: Review and commit tooling**

Run focused coverage >=80% on all metrics, typecheck, lint, diff check, staged secret review, and code/security review. Commit tooling and redacted runbook changes; do not commit the APK or key.

```powershell
git commit -m "feat: verify locally signed android artifacts"
```

---

### Task 5: Create the artifact handoff and App Links certificate evidence

**Files:**
- Modify: `docs/verification/device-evidence.md`
- Modify: `docs/verification/android-acceptance-checklist.md`
- Create: `.superpowers/sdd/2026-10-18-local-android-apk/task-5-artifact-receipt.md`

**Interfaces:**
- Consumes: verified signed APK and public signer fingerprint.
- Produces: tester-safe artifact receipt with no secrets and a certificate value suitable for the existing `STRANDCUE_ANDROID_CERT_SHA256` release-link check.

- [ ] **Step 1: Record the artifact identity**

Record source commit, build timestamp with `+02:00`, package, version, ABI, APK SHA-256, certificate SHA-256, file size, Java/Gradle/SDK versions, and verifier results. Do not record a private key path or secret.

- [ ] **Step 2: Correct the acceptance checklist source**

Replace the stale `02fd96a` source statement with the exact artifact source commit. Keep every scenario NOT RUN until it is actually exercised.

- [ ] **Step 3: Verify the existing association endpoint against the local certificate**

Supply the public fingerprint to `STRANDCUE_ANDROID_CERT_SHA256` for `npm run check:release-links`. This is a read-only check. If Cloudflare still serves a different fingerprint, record HOLD; do not change production in this plan.

- [ ] **Step 4: Prepare the tester handoff folder**

Place the APK, checksum text, installation instructions, uninstall/upgrade note, feedback template, and safety wording in a local distribution folder outside Git. Explain Android's “unknown app/source” warning: testers are sideloading a privately distributed build outside Play, so Android asks them to confirm the source. Tell testers to compare the SHA-256 and only install the file from the approved link.

- [ ] **Step 5: Commit redacted evidence**

Commit the receipt and checklist source correction. Keep the APK outside Git.

---

### Task 6: Install and execute the nine Android acceptance scenarios

**Files:**
- Modify: `docs/verification/android-acceptance-checklist.md`
- Modify: `docs/verification/device-evidence.md`
- Create: `.superpowers/sdd/2026-10-18-local-android-apk/task-6-device-run.md`

**Interfaces:**
- Consumes: Task 5 signed APK and the existing nine-scenario checklist.
- Produces: per-scenario PASS, FAIL, or BLOCKED evidence bound to artifact hash, device, account owner, and timestamp.

- [ ] **Step 1: Register the test device**

Record device model, Android/API version, ADB serial in redacted form, APK hash, package, signer fingerprint, install command result, and first-launch result. Confirm the installed package certificate matches Task 5.

- [ ] **Step 2: Run scenarios 1–4 in order**

Test start, pause, process-death resume, and confirmed-step persistence. For each scenario record preconditions, timestamp, observed server revision, visible copy, PASS/FAIL/BLOCKED, and safe screenshot/log references. Stop on owner-data leakage or executable-decision integrity failure.

- [ ] **Step 3: Run scenarios 5–6**

Test bounded deviation input and owned-versus-foreign substitution. Use two dedicated test accounts and synthetic data only. Stop immediately if owner B data paints for owner A or a foreign shelf item is accepted.

- [ ] **Step 4: Run scenarios 7–9**

Test offline/reconnect idempotency, account switching without prior-owner paint, and terminal behavior. Confirm no duplicate execution is created and terminal controls disappear.

- [ ] **Step 5: Exercise release-adjacent journeys**

On the same signed artifact, additionally record signup, email confirmation, password recovery, export/share, account deletion/cancellation, offline launch, and TalkBack/touch-target observations. These do not replace the nine protocol scenarios.

- [ ] **Step 6: Triage failures**

For each failure create a minimal reproduction with safe logs. Security/privacy failures block further distribution. Ordinary UI defects become separate TDD repair tasks; rebuild, re-sign, and rerun affected plus regression scenarios against a new artifact hash.

- [ ] **Step 7: Commit observed results**

Never mark an unrun scenario PASS. Commit only redacted evidence and checklist updates.

---

### Task 7: Run final local gates and issue the Android readiness decision

**Files:**
- Modify: `docs/verification/security-audit-launch-decision-2026-10-18.md`
- Create: `.superpowers/sdd/2026-10-18-local-android-apk/final-handoff.md`

**Interfaces:**
- Consumes: Tasks 1–6, exact release commit, artifact receipt, and device checklist.
- Produces: an Android-specific GO/HOLD decision. It cannot grant overall launch GO while hosted and human-authority gates remain open.

- [ ] **Step 1: Run the full repository verification**

```powershell
$env:VITEST_MAX_WORKERS='4'
npm run verify:offline
npm run check:expo
npm run audit:dependencies
git diff --check
git status --short
```

Record exact test/skip counts, coverage, dependency result, and clean-tree state.

- [ ] **Step 2: Rerun the Android-specific gates**

Run `check:android-local`, artifact verification, `zipalign -c`, `apksigner verify`, package/ABI inspection, SHA-256 calculation, and the release-link check with the public certificate fingerprint.

- [ ] **Step 3: Run secret and provenance checks**

Review staged changes and current commit for keys, passwords, tokens, APKs, keystores, service-account files, or private device/account data. Confirm the artifact is outside Git and its receipt names the exact source commit.

- [ ] **Step 4: Obtain fresh independent code and security review**

Review the full plan range, Android scripts, signing boundary, receipts, and device evidence. Resolve all Critical, High, and Medium findings, then rerun affected gates.

- [ ] **Step 5: State the decision honestly**

Android readiness may move from `0/9` only for scenarios with observed evidence. Overall launch stays HOLD until all other entries in the canonical launch matrix receive their required hosted, device, risk-owner, and human-review evidence.

- [ ] **Step 6: Commit the final evidence**

```powershell
git commit -m "docs: record signed android acceptance evidence"
```

No push, merge, deploy, store submission, or hosted change follows automatically.

## Stop conditions

- Stop before signing if the source commit, package, version, or generated native configuration differs from the reviewed inputs.
- Stop after three distinct, evidence-based native build attempts if the same CMake/Ninja failure persists; report the exact first failing task and safe diagnostic excerpt.
- Stop immediately on any signing-secret exposure and rotate the affected secret before resuming.
- Stop device testing on cross-owner data paint, foreign substitution acceptance, forged executable guidance, or deletion/session privacy failure.
- Keep launch at HOLD when any required scenario is NOT RUN, FAIL, or BLOCKED.

## Completion definition

This work order is complete when a locally signed APK from the recorded commit has a verified package, ABI, version, signer, SHA-256, and clean provenance receipt; all nine Android scenarios have honest outcomes on the same artifact; full local gates and independent reviews pass; and the launch matrix is updated without claiming hosted or human evidence that was not collected.

## Self-review

- Spec coverage: the plan addresses the exact Task 25 native-build failure, artifact signing, App Links certificate evidence, all nine protocol scenarios, and the canonical launch packet. Hosted rollout and product-content publication remain separate work orders.
- Step scan: every action has a measurable output or stop condition; no task asks the implementer to guess a credential, package, path, or acceptance result.
- Type consistency: Task 2 preflight feeds Task 3; Task 4 artifact metadata feeds Tasks 5 and 7; Task 5 artifact identity binds Task 6 evidence.
- Security boundary: keys and passwords remain external, only public certificate facts enter evidence, and no remote mutation is authorized.
- Proportion: diagnostics, build repair, signing, device testing, and final review are separate reviewer-sized tasks; no application feature work is mixed into the build increment.

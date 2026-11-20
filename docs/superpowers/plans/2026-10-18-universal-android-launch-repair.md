# Universal Android launch repair and acceptance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ARM64-only test artifact with a verified ARM64 and x86_64 APK, prove first launch on a clean x86_64 emulator, and run the nine Android acceptance scenarios only against isolated synthetic data.

**Architecture:** Rebuild the exact reviewed application source at `d8c2818` in a short disposable Windows path with both Android ABIs. Validate every packaged native library and ELF dependency before applying the existing local alpha signature. Install the verified artifact on a new clean emulator, isolate launch diagnosis from account/data setup, and keep all account-dependent testing blocked until a non-production or explicitly contained synthetic backend is proven.

**Tech stack:** Node 24.19.x, Expo SDK 57, React Native 0.86.3, Java 17, Gradle, Android SDK 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Ninja, `llvm-readelf`, `aapt`, `zipalign`, `apksigner`, ADB, Android 14/API 34 emulator, Vitest.

**Spec:** `docs/verification/security-audit-launch-decision-2026-10-18.md`; `docs/verification/android-acceptance-checklist.md`; `.superpowers/sdd/2026-10-18-local-android-apk/final-handoff.md`; `docs/runbooks/local-android-apk.md`; `apps/mobile/app.json`.

## Global constraints

- Application source remains exactly `d8c2818a7fac0e996910a5a33d6784875800993b` unless a diagnostic proves a tracked source defect. Any source, configuration, dependency, or build-tooling change creates a new authority and requires a complete rebuild and evidence rebind.
- Build from a fresh `git archive` under a verified short directory beneath `C:\scb`. Never reuse generated Android/CMake output from an earlier attempt.
- The universal test artifact must contain both `arm64-v8a` and `x86_64`. No other ABI is required by this plan.
- Both ABI directories must contain `libreactnative.so` and the complete expected JNI library set. Every ELF file must report the correct machine architecture and a closed `DT_NEEDED` dependency set.
- Use the existing local alpha signing identity. Its expected public certificate SHA-256 is `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
- Keep keystore paths, aliases, passwords, DPAPI records, tokens, account credentials, APKs, logs, screenshots, and generated native files outside Git. Record only redacted public evidence.
- Trust anchors for source commit, unsigned input hash, package, version name, version code, required ABIs, library manifest, and signing certificate must come from reviewed tracked configuration. Ambient environment values must not replace them.
- Do not uninstall, clear, wipe, or modify the existing `native-spike` AVD. Use a new isolated AVD for this plan.
- Do not create users or test data in a production Supabase project. Account-dependent scenarios stay BLOCKED unless an isolated test project is verified or a separately approved production-synthetic containment plan exists.
- Do not push, merge, deploy, publish, submit to Google Play, update Cloudflare, apply hosted migrations, or change hosted Auth settings in this plan.
- Use TDD for all tracked code changes. New or changed logic requires at least 80% statements, branches, functions, and lines.
- A successful build, signature, installation, or first launch does not authorize launch. Overall launch remains HOLD until the canonical launch matrix is closed by its required authorities.

## Review focus

- A universal APK that merely declares both ABIs but omits a required DSO must fail before signing.
- An x86_64 DSO with the wrong ELF machine or an unresolved `DT_NEEDED` dependency must fail before installation.
- A rebuilt APK whose source receipt or unsigned input hash differs from reviewed tracked expectations must fail closed.
- A clean emulator launch must never reuse, uninstall, or overwrite an app signed by another certificate.
- Synthetic account setup must fail closed when the backend project cannot be proven isolated from production data.

---

### Task 1: Native library and dependency inventory

**Files:**
- Create: `scripts/android-native-manifest.ts`
- Create: `tests/tooling/android-native-manifest.test.ts`
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-1-native-inventory.md`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces: `validateNativeManifest(input: NativeManifestInput, expected: NativeManifestExpectation): NativeManifestResult`.
- `NativeManifestExpectation` contains `requiredAbis`, `requiredLibraries`, and allowed system dependencies.
- Task 2 consumes the reviewed library manifest; Tasks 3 and 7 reuse the same validator.

- [ ] **Step 1: Write failing manifest tests**

Cover a valid dual-ABI manifest plus missing ABI, missing `libreactnative.so`, extra unexpected ABI, wrong ELF machine, duplicate library, unresolved `DT_NEEDED`, missing shared dependency, malformed readelf output, and unequal required-library sets between ABIs.

- [ ] **Step 2: Capture RED**

Run the focused test under Node 24.19.x. Expected: module missing.

- [ ] **Step 3: Implement the pure immutable validator**

Keep archive/ELF parsing separate from validation. Stable HOLD codes must identify ABI, library, or dependency class without printing host paths.

- [ ] **Step 4: Inventory the existing ARM64 APK read-only**

Inspect the ZIP and run NDK `llvm-readelf -h -d` for each DSO. Confirm the current artifact contains 22 ARM64 libraries, including `libreactnative.so`, and record its dependency closure. This proves the earlier emulator error did not mean the ARM64 APK universally lacked the file.

- [ ] **Step 5: Register coverage and verify**

Add the new module to standard critical coverage. Run focused tests/coverage, typecheck, lint, and diff check. Every metric must be at least 80%.

- [ ] **Step 6: Review and commit**

Obtain fresh code/security review, resolve Critical/High/Medium findings, then commit.

---

### Task 2: Build the universal release APK from exact reviewed source

**Files:**
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-2-universal-build.md`
- Modify: tracked code only if a proven repository defect requires it

**Interfaces:**
- Consumes: Task 1 manifest, Task 1/previous preflight tooling, source `d8c2818`.
- Produces: one unsigned or debug-signed universal release APK outside Git, its SHA-256, source receipt, build log receipt, and extracted native manifest.

- [ ] **Step 1: Run the local Android preflight**

Require Node 24, Java 17, SDK 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Ninja, at least 30 GiB free, a clean evidence tree, and a contained scratch path of at most 40 characters.

- [ ] **Step 2: Create and verify a fresh archive**

Generate `git archive --format=tar d8c2818...`, hash it, inspect its commit marker, extract under a new short `C:\scb\<short>` directory, and recheck real-path containment immediately before extraction.

- [ ] **Step 3: Restore locked dependencies and prebuild**

Run `npm ci --ignore-scripts`, then Expo Android prebuild with `CI=1`. Confirm package `za.co.strandcue.app`, version `0.1.0`, version code `1`, and no single-ABI `abiFilters` override.

- [ ] **Step 4: Compile both architectures**

```powershell
.\gradlew.bat clean :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --max-workers=2 --stacktrace
```

Capture the resolved Gradle property and generated native targets. Stop after three evidence-based attempts; change one variable per retry.

- [ ] **Step 5: Validate the unsigned build before signing**

Require both ABI trees, the reviewed library set, correct ELF machine for every DSO, closed dependencies, package/version/code, non-empty file, and byte-stable source receipt. Run Task 1 validator.

- [ ] **Step 6: Record and commit safe evidence**

Record archive hash, build duration, tools, APK size/hash, ABI/library counts, and validation results. Keep APK/logs/generated files outside Git.

---

### Task 3: Extend artifact verification and sign the universal APK

**Files:**
- Modify: `scripts/verify-android-artifact.ts`
- Modify: `tests/tooling/verify-android-artifact.test.ts`
- Modify: `docs/runbooks/local-android-apk.md`
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-3-universal-artifact.md`

**Interfaces:**
- Produces a verifier requiring exact source, unsigned input hash, package, version `0.1.0`, version code `1`, ABIs `{arm64-v8a,x86_64}`, required DSO manifest, exactly one signer, expected certificate, alignment, and final APK hash.
- Task 4 consumes the verified signed artifact and receipt.

- [ ] **Step 1: Write failing dual-ABI artifact tests**

Add positive universal metadata plus missing x86_64, missing ARM64, extra ABI, missing per-ABI `libreactnative.so`, unequal library sets, wrong ELF machine, dependency gap, unsigned input mismatch, and post-signing hash mismatch.

- [ ] **Step 2: Capture RED and implement minimal changes**

Replace the prior single-ABI expectation with an exact ABI set and native manifest. Keep pinned trust anchors in tracked code/config; do not reintroduce environment overrides.

- [ ] **Step 3: Verify the existing alpha certificate**

Before signing, read only its public certificate and require the expected SHA-256. Stop if it differs.

- [ ] **Step 4: Align and sign a new artifact**

Use secure prompt/environment mechanisms without placing passwords on recorded command lines. Run `zipalign`, sign into a new file, then run `zipalign -c -v 4`, `apksigner verify --verbose --print-certs`, the artifact verifier, and SHA-256 hashing.

- [ ] **Step 5: Verify and commit**

Run focused coverage >=80% on every metric, full standard coverage, typecheck, lint, diff check, secret/path review, and fresh task review. Commit only tooling, tests, runbook, and redacted receipt.

---

### Task 4: Install and diagnose first launch on a fresh x86_64 AVD

**Files:**
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-4-first-launch.md`
- Modify: `docs/verification/device-evidence.md`
- Modify: `docs/verification/android-acceptance-checklist.md`

**Interfaces:**
- Consumes: Task 3 signed universal APK.
- Produces: PASS or BLOCKED first-launch evidence bound to artifact hash, signer, AVD identity, and timestamp.

- [ ] **Step 1: Create a distinct clean AVD**

Create `strandcue-universal-api34-x86_64` from the installed API 34 Google APIs x86_64 image. Do not modify `native-spike` or the previous alpha AVD. Wait for `sys.boot_completed=1`.

- [ ] **Step 2: Prove clean state and install**

Confirm the package is absent, install the exact Task 3 APK, pull installed `base.apk`, and require matching hash, package, and signing certificate.

- [ ] **Step 3: Launch and observe**

Record CPU ABI list, resolved activity, process start, first rendered surface, crash state, and a bounded scrubbed logcat window. PASS requires the process to remain alive and render StrandCue UI.

- [ ] **Step 4: If launch fails, diagnose before editing**

Compare packaged ABI/ELF facts with device `primaryCpuAbi`, `nativeLibraryDir`, SoLoader paths, missing DSO name, and the missing DSO's dependency closure. Classify ABI translation, packaging, dependency, or tracked application defect. Stop before fixes until one hypothesis is supported.

- [ ] **Step 5: Repair only a proven tracked defect**

If a source/config fix is required, write a failing regression test, implement the smallest fix, establish a new source authority, rebuild and re-sign from Task 2, then rerun installation. Environment-only failures receive evidence, not source changes.

- [ ] **Step 6: Commit honest evidence**

Keep scenarios 1–9 BLOCKED until first launch passes.

---

### Task 5: Establish isolated synthetic acceptance data

**Files:**
- Create: `docs/runbooks/android-synthetic-acceptance.md`
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-5-synthetic-data.md`
- Modify: tracked configuration only if an isolated test environment is approved and no secrets are embedded

**Interfaces:**
- Produces: a verified backend classification (`isolated_test` or `blocked_production`), two synthetic owner labels, scenario fixture inventory, cleanup owner, and expiry date. Credentials remain external.
- Task 6 consumes only `isolated_test` fixtures.

- [ ] **Step 1: Identify the backend without exposing credentials**

Record project reference classification, callback host, and whether data is isolated. Never infer staging from a hostname.

- [ ] **Step 2: Fail closed on production**

If the app targets production or isolation cannot be proven, record `blocked_production`; create no accounts/data and leave Tasks 6 account-dependent scenarios BLOCKED.

- [ ] **Step 3: Define synthetic fixtures for all nine scenarios**

For two synthetic owners, define distinct shelf items, recommendation decision, active execution states/revisions, deviation-eligible steps, owned and foreign substitution items, terminal state, offline/retry expectations, and cleanup/retention rules.

- [ ] **Step 4: Provision only in an isolated project**

Create accounts and fixtures through reviewed APIs/migrations. Store credentials securely outside Git. Record public fixture labels/IDs only when they cannot identify a person or grant access.

- [ ] **Step 5: Verify containment and commit the runbook/evidence**

Prove cross-owner separation before device testing. Obtain database/security review.

---

### Task 6: Run the nine protocol scenarios and adjacent journeys

**Files:**
- Modify: `docs/verification/android-acceptance-checklist.md`
- Modify: `docs/verification/device-evidence.md`
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-6-device-acceptance.md`

**Interfaces:**
- Consumes: passing Task 4 launch and Task 5 isolated fixtures.
- Produces: per-scenario PASS, FAIL, or BLOCKED evidence tied to one artifact and device.

- [ ] **Step 1: Bind the run**

Record artifact SHA-256, signer, source, emulator/API/ABI, synthetic owner labels, backend classification, and timestamp.

- [ ] **Step 2: Run scenarios 1–4**

Execute start, pause, process-death resume, and confirmed-step persistence. Record authoritative server revision and no-duplicate evidence.

- [ ] **Step 3: Run scenarios 5–6**

Execute deviation skip/modify and owned-versus-foreign substitution. Stop immediately on cross-owner paint or foreign-item acceptance.

- [ ] **Step 4: Run scenarios 7–9**

Execute offline/reconnect, account switch without prior-owner paint, and terminal behavior.

- [ ] **Step 5: Run adjacent release journeys**

Test signup, confirmation, recovery, export/share, deletion/cancellation, offline launch, TalkBack, and touch targets. Keep these separate from the nine protocol results.

- [ ] **Step 6: Triage and commit**

Security/privacy/integrity failures stop distribution. Record every unrun case as BLOCKED; never infer PASS from unit tests.

---

### Task 7: Final gates, independent review, and launch decision

**Files:**
- Modify: `docs/verification/security-audit-launch-decision-2026-10-18.md`
- Create: `.superpowers/sdd/2026-10-18-universal-android-launch-repair/final-handoff.md`

**Interfaces:**
- Consumes: Tasks 1–6 and the exact final release candidate.
- Produces: an Android decision and updated overall HOLD/GO evidence without changing hosted services.

- [ ] **Step 1: Run repository gates**

Run Node 24 runtime check, typecheck, lint, full coverage with bounded workers, control-plane audit, web export, Expo check, dependency audit, and diff check.

- [ ] **Step 2: Run Android gates**

Run local preflight, native manifest validator, universal artifact verifier, `zipalign`, `apksigner`, package/version/code/ABI inspection, hash verification, and read-only release-link check.

- [ ] **Step 3: Run provenance and secret review**

Confirm no APK, keystore, DPAPI record, password, token, credential, personal test data, host-specific private path, or generated Android output is tracked.

- [ ] **Step 4: Obtain fresh independent review**

Review the complete plan range for code, security, native packaging, evidence integrity, and device results. Resolve all Critical/High/Medium findings and rerun affected gates.

- [ ] **Step 5: State the decision**

Android can leave HOLD only if the universal artifact launches and every required scenario has acceptable evidence. Overall launch remains governed by the wider canonical matrix, including App Links, hosted operations, risk ownership, and human product-content review.

## Stop conditions

- Stop signing if either ABI, `libreactnative.so`, ELF machine, dependency closure, source receipt, input hash, package, version, or version code is wrong.
- Stop installation if signer, checksum, or clean-AVD state differs from the reviewed receipt.
- Stop account work if backend isolation cannot be proven.
- Stop acceptance immediately on cross-owner data exposure, foreign substitution acceptance, forged executable guidance, session/deletion privacy failure, or repeated startup crash.
- After three evidence-based attempts at the same native failure, stop and review the architecture rather than retrying.

## Completion definition

This plan is complete when a dual-ABI APK from the recorded source is native-manifest verified, signed with the reviewed alpha identity, installed and launched on a clean x86_64 emulator, tested against isolated synthetic data, and all nine scenarios have honest outcomes. The final review and canonical decision must distinguish Android readiness from the remaining overall launch gates.

## Self-review

- Spec coverage: native packaging, universal build, signing, launch diagnosis, isolated data, nine scenarios, adjacent journeys, and final gates each have an owning task.
- Interface consistency: Task 1 manifest feeds Tasks 2/3/7; Task 3 artifact feeds Task 4; Task 5 fixtures feed Task 6.
- Security: no production test mutation, credential exposure, existing-AVD destruction, hosted change, or ambient trust-anchor override is authorized.
- Review focus: dual ABI presence, per-ABI DSO closure, source/hash trust, clean device state, and backend isolation each have explicit failing tests or gates.

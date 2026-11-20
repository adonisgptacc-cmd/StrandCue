# Maestro Device Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute all Maestro flows on a real device/emulator against the Plan A build, add a fourth flow covering privacy and deletion screens, and fix whatever the device reveals.

**Architecture:** Install Maestro CLI, run the three existing flows against the installed `za.co.strandcue.app` build, record pass/fail per flow in `device-evidence.md`, then add `04-privacy-settings.yaml` (offline-safe: navigates but never submits) and triage any fallout test-first.

**Tech Stack:** Maestro CLI, Android emulator (Android Studio) or the Plan A physical device, existing `.maestro/*.yaml` flows.

**Spec:** `StrandCue-PRD-v1.1-audit.md`; `docs/verification/device-evidence.md` (Plan A output); `.maestro/` flows; `tests/tooling/maestro.test.ts` (flow contracts: appId present, assertions exist in source, taps labeled, no secrets); `tests/tooling/d2-config.test.ts` (appId contract).

## Global Constraints

- Node 24; `npm run verify` exits 0 before and after every task (currently 469 passed).
- Flow contracts are law: every flow has `appId: za.co.strandcue.app`; every `assertVisible` string must exist verbatim in `apps/mobile` source; every `tapOn` must name a labeled control; no coordinates, no emails, no UUIDs, no keys in flows.
- Flows 01–02 stay offline-safe (never submit to the network); the new flow 04 navigates only (never toggles consent, never requests deletion).
- Flow 03 and the new flow 04 require a signed-in build — Beta device-gate session only, never CI.
- HUMAN steps (device handling, reading results) produce evidence in `device-evidence.md`.

---

### Task 1: Maestro runbook and environment check

**Files:**
- Create: `docs/runbooks/maestro-device.md`
- Modify: none.

**Interfaces:**
- Consumes: Plan A `device-evidence.md` (installed build).
- Produces: `docs/runbooks/maestro-device.md` — the exact commands Task 2 runs.

- [ ] **Step 1: Write the runbook**

```markdown
# Maestro device runs

Prerequisites: Plan A build installed (`adb shell pm list packages | grep strandcue`
shows `za.co.strandcue.app`); Maestro CLI installed
(`curl -Ls https://get.maestro.mobile.dev | bash`).

Offline-safe flows (no sign-in, no network submission):

    maestro test .maestro/01-launch-signup-validation.yaml
    maestro test .maestro/02-recovery-request.yaml

Signed-in flows (Beta device-gate session with a test account):

    maestro test .maestro/03-tab-navigation.yaml
    maestro test .maestro/04-privacy-settings.yaml

Record per-flow PASS/FAIL plus the Maestro output tail in
`docs/verification/device-evidence.md` under `## Maestro runs (<date>)`.
```

- [ ] **Step 2: Verify the runbook matches reality**

Run: `npx vitest run tests/tooling/maestro.test.ts tests/tooling/d2-config.test.ts`
Expected: PASS — no flows changed yet.

- [ ] **Step 3: Commit**

```bash
git add -- docs/runbooks/maestro-device.md
git commit -m "docs: Maestro device runbook"
```

---

### Task 2: Run flows 01–03 on device, record results

**Files:**
- Modify: `docs/verification/device-evidence.md` (append `## Maestro runs` section)

**Interfaces:**
- Consumes: runbook from Task 1; installed Plan A build.
- Produces: per-flow PASS/FAIL evidence consumed by Task 4 triage.

- [ ] **Step 1: HUMAN — run the three flows**

```bash
maestro test .maestro/01-launch-signup-validation.yaml
maestro test .maestro/02-recovery-request.yaml
maestro test .maestro/03-tab-navigation.yaml
```

Flow 03 needs the signed-in test account first (sign in manually once on the device).

- [ ] **Step 2: HUMAN — record results verbatim**

Append to `docs/verification/device-evidence.md`:

```markdown
## Maestro runs (2026-09-24)

- 01-launch-signup-validation: PASS | FAIL — <one-line observation>
- 02-recovery-request: PASS | FAIL — <one-line observation>
- 03-tab-navigation: PASS | FAIL — <one-line observation>
```

- [ ] **Step 3: Commit the evidence (even on failure)**

```bash
git add -- docs/verification/device-evidence.md
git commit -m "docs: Maestro device run results"
```

A FAIL here is data, not a plan failure — Task 4 triages it.

---

### Task 3: Fourth flow — privacy and deletion screens

**Files:**
- Create: `.maestro/04-privacy-settings.yaml`
- Modify: none.

**Interfaces:**
- Consumes: Settings tab strings in `apps/mobile/src/records.tsx` and `DeletionScreen.tsx`.
- Produces: `04-privacy-settings.yaml` asserting four verbatim source strings, never submitting.

- [ ] **Step 1: Write the flow (assertions first — the test IS the contract)**

`tests/tooling/maestro.test.ts` already enforces: appId present, every asserted string exists in `apps/mobile`, taps labeled, no secrets. The flow must satisfy it on creation. These strings are verbatim in source today (`records.tsx:65-66,108`, `DeletionScreen.tsx:74`, `records.tsx:110`):

```yaml
# Privacy and deletion screen navigation without submitting anything.
# Consent toggles are NEVER tapped (that would call the network); the
# deletion button is NEVER tapped. Signed-in build required: Beta
# device-gate session only, never CI.
# appId is the D2-decided Android application identifier (za.co.strandcue.app).
appId: za.co.strandcue.app
---
- launchApp
- tapOn: "Settings"
- assertVisible: "Account"
- tapOn: "Privacy choices"
- assertVisible: "Privacy choices"
- assertVisible: "Hair record processing (required)"
- tapOn: "Back to settings"
- tapOn: "Delete my account"
- assertVisible: "Delete account"
```

- [ ] **Step 2: Run the flow contracts to verify it passes**

Run: `npx vitest run tests/tooling/maestro.test.ts tests/tooling/d2-config.test.ts`
Expected: PASS — `appId` correct; "Account", "Privacy choices", "Hair record processing (required)", "Back to settings", "Delete my account", "Delete account" all exist verbatim in `apps/mobile`; no coordinates/secrets.

- [ ] **Step 3: HUMAN — run on device, record result**

```bash
maestro test .maestro/04-privacy-settings.yaml
```

Append `- 04-privacy-settings: PASS | FAIL — <observation>` to the `## Maestro runs` section of `docs/verification/device-evidence.md`.

- [ ] **Step 4: Commit**

```bash
git add -- .maestro/04-privacy-settings.yaml docs/verification/device-evidence.md
git commit -m "feat: Maestro privacy-settings flow with device result"
```

---

### Task 4: Fallout triage (one micro-task per failure)

**Files:**
- Per failure: the source file at fault + its test file (discovered at triage time).
- Modify: `docs/verification/device-evidence.md` (triage log).

**Interfaces:**
- Consumes: FAIL rows from Tasks 2–3.
- Produces: one committed test-first fix per failure, or a written deferral with owner and date.

- [ ] **Step 1: HUMAN — triage each FAIL into exactly one of three buckets**

Append to `device-evidence.md`:

```markdown
## Fallout triage (2026-09-24)

- <flow>: <symptom> → bucket: app-bug | flow-bug | environment
```

- `app-bug`: the app renders wrong on device (missing label, crash, wrong copy). Fix test-first in the owning source + test file, run `npm run verify`, commit `fix: <symptom>`.
- `flow-bug`: the flow taps/asserts wrong (timing, renamed control). Fix the `.yaml`, re-run `tests/tooling/maestro.test.ts`, commit `fix: <flow> selector`.
- `environment`: emulator quirk, stale install, unsigned build. Re-run after `adb uninstall za.co.strandcue.app && adb install -r <apk>`; if it persists, re-bucket.

- [ ] **Step 2: Zero open FAILs or zero undocumented deferrals**

Every FAIL from Tasks 2–3 is either fixed (commit hash in the triage log) or deferred with a named owner and date. No third state.

- [ ] **Step 3: Full verify and commit**

Run: `npm run verify`
Expected: exit 0.

```bash
git add -- docs/verification/device-evidence.md
git commit -m "docs: Maestro fallout triage complete"
```

---

### Task 5: Reconciliation update for the Maestro gate

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md` (UX row, CI row)
- Modify: `docs/verification/beta-readiness.md` (device gate rows)

**Interfaces:**
- Consumes: `device-evidence.md` Maestro sections.
- Produces: ledger rows citing dated flow results.

- [ ] **Step 1: Update rows honestly**

UX row: stays **Partial** until Plan C completes; append "Maestro 4/4 <date>" to evidence. CI row: append flow count + date. If any FAIL was deferred (not fixed), say so in the gap column.

- [ ] **Step 2: Run the reconciliation contract test**

Run: `npx vitest run tests/tooling/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -- docs/verification/phase-1-reconciliation.md docs/verification/beta-readiness.md
git commit -m "docs: reconciliation reflects Maestro device evidence"
```

## Self-Review

- Spec coverage: all three existing flows executed; fourth flow closes the consent/deletion rendering gap; fallout loop guarantees no silent FAILs. No gaps.
- Placeholder scan: no TBD/TODO; the triage task defines exact buckets and commit formats instead of "fix issues".
- Type consistency: flow file naming (`04-privacy-settings.yaml`) matches the runbook and evidence rows; assertion strings quoted verbatim from source lines cited in Task 3.

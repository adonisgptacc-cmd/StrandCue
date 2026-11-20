# First Android Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the first installable StrandCue APK from EAS, install it on a device, and record launch evidence.

**Architecture:** Link the local project to EAS (projectId in `app.json`), run the existing `build:android:preview` script (profile `preview`, internal distribution, APK), then `adb install` and capture first-launch proof. No code changes to app behavior; this plan proves the bundle that `expo export` produces also builds natively.

**Tech Stack:** Expo 57, EAS CLI >= 5.0.0, Android platform-tools (adb), preview profile (APK, internal distribution).

**Spec:** `StrandCue-PRD-v1.1-audit.md` (product authority); `docs/verification/beta-decisions.md` D2 (applicationId `za.co.strandcue.app`); `docs/verification/phase-1-reconciliation.md` (Beta release evidence row); `apps/mobile/eas.json` (profiles); `apps/mobile/app.json` (package, intent filters).

## Global Constraints

- Node 24; TypeScript 7; Expo SDK 57.
- Android applicationId is `za.co.strandcue.app` — never `com.strandcue.dev` in any new artifact.
- No secrets in the repo: no keystore files, no service-account JSON, no tokens. `google-play-service-account.json` is referenced by `eas.json` submit config and must stay gitignored if ever downloaded.
- `npm run verify` exits 0 before and after every task (currently 469 passed).
- Every code/config change is TDD: failing test first, then minimal change, then green, then commit.
- Human-executed steps (login, build trigger, device handling) are marked HUMAN and produce evidence files the tests can assert on.

---

### Task 1: EAS project link with config test

**Files:**
- Create: `tests/tooling/eas-config.test.ts`
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: D2 `android.package` (already `za.co.strandcue.app` in `app.json`).
- Produces: `config.expo.extra.eas.projectId` (string, non-empty) consumed by Task 2's build command.

- [ ] **Step 1: Write the failing test**

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('EAS project link', () => {
  it('app.json carries the EAS projectId for builds', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    expect(typeof config.expo?.extra?.eas?.projectId).toBe('string');
    expect(config.expo.extra.eas.projectId.length).toBeGreaterThan(0);
  });

  it('keeps the decided Android package alongside the link', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    expect(config.expo?.android?.package).toBe('za.co.strandcue.app');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: FAIL — `extra.eas.projectId` is undefined (no `extra` block in `app.json` today).

- [ ] **Step 3: HUMAN — login and link (produces the value the test needs)**

```bash
npm install -g eas-cli
eas login
eas init --id <project-id-from-expo-dashboard>
```

This writes `extra.eas.projectId` into `apps/mobile/app.json`. Do not hand-type a guessed UUID; copy it from https://expo.dev after creating the `strandcue` project.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -- tests/tooling/eas-config.test.ts apps/mobile/app.json
git commit -m "feat: EAS project link with config test"
```

---

### Task 2: Preview APK build with evidence record

**Files:**
- Create: `docs/verification/device-evidence.md`
- Modify: none (build runs on EAS servers).

**Interfaces:**
- Consumes: `extra.eas.projectId` from Task 1; `preview` profile from `apps/mobile/eas.json`.
- Produces: `docs/verification/device-evidence.md` with build ID, artifact URL, SHA-256, and EAS dashboard link — consumed by Task 3 and Plan B.

- [ ] **Step 1: Write the failing test**

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('first build evidence', () => {
  it('device-evidence.md records the preview APK build', async () => {
    const doc = await readFile('docs/verification/device-evidence.md', 'utf8');
    expect(doc).toMatch(/EAS build ID:\s*\S+/);
    expect(doc).toMatch(/Artifact SHA-256:\s*[0-9a-f]{64}/i);
    expect(doc).toMatch(/za\.co\.strandcue\.app/);
  });
});
```

Append this block to `tests/tooling/eas-config.test.ts` (same file, new `describe`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: FAIL — `docs/verification/device-evidence.md` does not exist.

- [ ] **Step 3: HUMAN — trigger the build and record evidence**

```bash
npm run build:android:preview --workspace @strandcue/mobile
```

Wait for completion on https://expo.dev. Then download the APK, hash it, and create `docs/verification/device-evidence.md`:

```powershell
Get-FileHash .\strandcue-preview.apk -Algorithm SHA256
```

```markdown
# Device evidence log

## Build 1 — preview APK (2026-09-24)

- EAS build ID: <id-from-expo-dashboard>
- Dashboard: https://expo.dev/accounts/<account>/projects/strandcue/builds/<id>
- Profile: preview (APK, internal distribution)
- ApplicationId: za.co.strandcue.app
- Artifact SHA-256: <64-hex-chars>
- Expo SDK: 57 · version: 0.1.0
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -- tests/tooling/eas-config.test.ts docs/verification/device-evidence.md
git commit -m "docs: first preview APK build evidence"
```

---

### Task 3: Install and first-launch proof

**Files:**
- Modify: `docs/verification/device-evidence.md` (append install section)
- Modify: `tests/tooling/eas-config.test.ts` (extend evidence test)

**Interfaces:**
- Consumes: APK artifact + SHA-256 from Task 2.
- Produces: install + launch section in `device-evidence.md` consumed by Plan B (Maestro runs against this installed build).

- [ ] **Step 1: Extend the failing test**

```ts
it('device-evidence.md records install and first launch', async () => {
  const doc = await readFile('docs/verification/device-evidence.md', 'utf8');
  expect(doc).toMatch(/Installed on:\s*\S+/);
  expect(doc).toMatch(/First launch:\s*\S+/);
  expect(doc).toMatch(/Signup screen visible|Begin your hair record/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: FAIL — no install section yet.

- [ ] **Step 3: HUMAN — install, launch, observe**

```bash
adb devices
adb install -r strandcue-preview.apk
adb shell monkey -p za.co.strandcue.app -c android.intent.category.LAUNCHER 1
```

Eyes-on check: the signup screen renders ("Begin your hair record"). Take a screenshot (`adb exec-out screencap -p > launch-01.png`, kept locally, never committed). Append to `docs/verification/device-evidence.md`:

```markdown
## Install 1 (2026-09-24)

- Installed on: <device model + Android version, e.g. Pixel 7 · Android 14>
- First launch: signup screen visible ("Begin your hair record")
- Crashes on launch: none observed
- Screenshot: launch-01.png (local only)
```

If the app crashes on launch, stop this plan and file the crash log (`adb logcat -d | Select-String strandcue`) as a bugfix task before proceeding to Plan B.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tooling/eas-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify whole repo and commit**

Run: `npm run verify`
Expected: exit 0.

```bash
git add -- tests/tooling/eas-config.test.ts docs/verification/device-evidence.md
git commit -m "docs: first install and launch evidence"
```

---

### Task 4: Reconciliation update for the build gate

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md` (Beta release evidence row)
- Modify: `docs/verification/beta-readiness.md` (build gate row, if present)

**Interfaces:**
- Consumes: `device-evidence.md` from Tasks 2–3.
- Produces: ledger rows pointing at dated build evidence.

- [ ] **Step 1: Update the Beta release evidence row**

Replace the "EAS configuration and device-matrix drafts" evidence text with the build ID, install date, and launch outcome, keeping classification honest: stays **Implemented, unverified** until Plan B (Maestro) and Plan C (accessibility) complete.

- [ ] **Step 2: Run the reconciliation contract test**

Run: `npx vitest run tests/tooling/reconciliation.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -- docs/verification/phase-1-reconciliation.md docs/verification/beta-readiness.md
git commit -m "docs: reconciliation reflects first build evidence"
```

## Self-Review

- Spec coverage: PRD authority untouched (no behavior change); D2 appId flows into build artifact; reconciliation + readiness ledgers updated. No gaps.
- Placeholder scan: no TBD/TODO; HUMAN steps name exact commands and evidence formats.
- Type consistency: `extra.eas.projectId` (string) used identically in Task 1 test and Task 2 build; `device-evidence.md` section headers match the regexes in Task 2/3 tests.

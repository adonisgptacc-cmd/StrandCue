# Assetlinks Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the recovery/confirmation link path from the custom scheme to verified HTTPS App Links, end-to-end on device.

**Architecture:** Serve `assetlinks.json` on the D2 worker host, allowlist the HTTPS redirect in Supabase Auth, then flip `resetPasswordForEmail`'s `redirectTo` and the `Linking` handler in `auth.tsx` from `strandcue://auth/*` to `https://strandcue.adonisgptacc.workers.dev/auth/*`, and prove a real recovery link opens the app on device.

**Tech Stack:** Cloudflare Worker (serves `/.well-known/assetlinks.json`), Supabase Auth URL configuration, `apps/mobile/src/auth.tsx`, release keystore SHA-256.

**Spec:** `StrandCue-PRD-v1.1-audit.md`; `docs/verification/beta-decisions.md` D2 (domain `strandcue.adonisgptacc.workers.dev`, appId `za.co.strandcue.app`); `apps/mobile/src/auth.tsx:75-76,98` (current scheme callback); `apps/mobile/app.json` (intent filter already claims the host — D2 wiring); `tests/tooling/d2-config.test.ts` (scheme guard — this plan updates it deliberately).

## Global Constraints

- Node 24; `npm run verify` exits 0 before and after every task.
- The custom-scheme path keeps working until the HTTPS path is proven on device — never break recovery in between (Tasks 1–2 change nothing in the app).
- No fingerprints, keystores, or URLs with tokens in the repo. The SHA-256 lives in the served `assetlinks.json` (on the worker host, not in git) and in EAS/Play consoles.
- assetlinks.json must serve with `Content-Type: application/json`, no redirects, within the 5 MB / 10 KB-parse limits (it will be ~500 bytes).

---

### Task 1: assetlinks.json content with shape test

**Files:**
- Create: `tests/tooling/assetlinks.test.ts`
- Create: `docs/runbooks/assetlinks.md` (hosts the exact file content for the HUMAN to deploy)

**Interfaces:**
- Consumes: D2 package `za.co.strandcue.app`; release SHA-256 (HUMAN at deploy time).
- Produces: `docs/runbooks/assetlinks.md` with the byte-exact file + deploy/verify commands.

- [ ] **Step 1: Write the failing test**

The test pins the file's contract (package name, relation, fingerprint format) against the runbook content so drift is caught:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('assetlinks runbook contract', () => {
  it('documents the exact assetlinks.json for the D2 host', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    expect(doc).toContain('"package_name": "za.co.strandcue.app"');
    expect(doc).toContain('"relation": ["delegate_permission/common.handle_all_urls"]');
    expect(doc).toMatch(/"[0-9A-F]{2}(?::[0-9A-F]{2}){31}"/);
    expect(doc).toContain('strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tooling/assetlinks.test.ts`
Expected: FAIL — `docs/runbooks/assetlinks.md` does not exist.

- [ ] **Step 3: Write the runbook with the exact file**

```markdown
# assetlinks.json deploy

Serve this byte-exact at
https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json
with `Content-Type: application/json` and no redirects:

    [{
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "za.co.strandcue.app",
        "sha256_cert_fingerprints": ["<RELEASE-KEYSTORE-SHA256>"]
      }
    }]

Fingerprint source: Play Console → Setup → App integrity → App signing key
(preferred — survives key rotation) or `keytool -list -v -keystore <release.keystore>`
for a locally-signed internal build.

Verify after deploy:

    curl -sI https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json | grep -i content-type
    curl -s https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json
```

HUMAN fills `<RELEASE-KEYSTORE-SHA256>` from the Play Console at deploy time (Task 2).

- [ ] **Step 4: Run test to verify it passes**

The regex requires a real fingerprint shape — with the placeholder `<RELEASE-KEYSTORE-SHA256>` the test FAILS. That is intentional: the test goes green only after the HUMAN inserts the real fingerprint in Task 2. State this in the commit message.

- [ ] **Step 5: Commit**

```bash
git add -- tests/tooling/assetlinks.test.ts docs/runbooks/assetlinks.md
git commit -m "docs: assetlinks runbook, test red until fingerprint lands"
```

---

### Task 2: HUMAN — serve, allowlist, verify (turns Task 1 green)

**Files:**
- Modify: `docs/runbooks/assetlinks.md` (fingerprint filled)
- Modify: `docs/verification/device-evidence.md` (verification log)

**Interfaces:**
- Consumes: runbook from Task 1; worker-host access; Supabase dashboard access.
- Produces: live `assetlinks.json`; Supabase redirect allowlist entry; green Task 1 test.

- [ ] **Step 1: HUMAN — deploy and allowlist**

1. Add the `/.well-known/assetlinks.json` route to the worker; confirm the two `curl` checks from the runbook.
2. Supabase dashboard → project `bomudijjqmoommndhxib` → Authentication → URL Configuration → Redirect URLs → add `https://strandcue.adonisgptacc.workers.dev/auth/callback`.
3. Replace `<RELEASE-KEYSTORE-SHA256>` in `docs/runbooks/assetlinks.md` with the real fingerprint (upper-case hex, colon-separated).

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/tooling/assetlinks.test.ts`
Expected: PASS — real fingerprint matches the shape regex.

- [ ] **Step 3: Log and commit**

Append to `docs/verification/device-evidence.md`:

```markdown
## Assetlinks (2026-09-24)

- Served at: https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json (content-type application/json, no redirects)
- Fingerprint source: <Play app-signing | local release keystore>
- Supabase redirect allowlisted: https://strandcue.adonisgptacc.workers.dev/auth/callback
```

```bash
git add -- tests/tooling/assetlinks.test.ts docs/runbooks/assetlinks.md docs/verification/device-evidence.md
git commit -m "docs: assetlinks live with release fingerprint"
```

---

### Task 3: Flip the app to HTTPS links (test-first)

**Files:**
- Modify: `apps/mobile/src/auth.tsx:75-76,98`
- Modify: `tests/mobile/settings.test.ts` or auth boundary test (whichever asserts `strandcue://auth/callback` — discover at implementation time; the d2-config scheme guard is updated here too)
- Modify: `tests/tooling/d2-config.test.ts` (scheme guard → dual-link guard)

**Interfaces:**
- Consumes: live assetlinks (Task 2); current handler `url?.startsWith('strandcue://auth/')` and `redirectTo: 'strandcue://auth/callback'`.
- Produces: handler accepting both `strandcue://auth/` (legacy) and the HTTPS callback; `redirectTo` on HTTPS.

- [ ] **Step 1: Write the failing test**

In the mobile auth boundary test, assert the new redirect target; in `d2-config.test.ts`, replace the scheme-only guard with:

```ts
it('accepts the HTTPS callback and keeps the legacy scheme as fallback', async () => {
  const auth = await readFile('apps/mobile/src/auth.tsx', 'utf8');
  expect(auth).toContain(`redirectTo: 'https://strandcue.adonisgptacc.workers.dev/auth/callback'`);
  expect(auth).toContain('strandcue.adonisgptacc.workers.dev/auth');
  expect(auth).toContain(`strandcue://auth/`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mobile/settings.test.ts tests/tooling/d2-config.test.ts`
Expected: FAIL — `auth.tsx` still points at the scheme.

- [ ] **Step 3: Minimal implementation in `auth.tsx`**

```tsx
const AUTH_CALLBACK_HTTPS = 'https://strandcue.adonisgptacc.workers.dev/auth/callback';

// initial URL + listener accept both forms:
void Linking.getInitialURL().then(url => {
  if (url?.startsWith('strandcue://auth/') || url?.startsWith('https://strandcue.adonisgptacc.workers.dev/auth/')) void callback(url);
});
const links = Linking.addEventListener('url', ({ url }) => {
  if (url.startsWith('strandcue://auth/') || url.startsWith('https://strandcue.adonisgptacc.workers.dev/auth/')) void callback(url);
});

// recovery request:
const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: AUTH_CALLBACK_HTTPS });
```

Keep the scheme branch: installed builds predating this change and non-verified contexts still resolve through it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npx vitest run tests/mobile/ tests/tooling/d2-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- apps/mobile/src/auth.tsx tests/mobile/<touched-test> tests/tooling/d2-config.test.ts
git commit -m "feat: HTTPS recovery callback with scheme fallback"
```

---

### Task 4: Device proof of the HTTPS recovery link

**Files:**
- Modify: `docs/verification/device-evidence.md`

**Interfaces:**
- Consumes: release/internal build containing Task 3 (rebuild via Plan A Task 2 command).
- Produces: eyes-on proof that an HTTPS recovery link opens the app to password reset.

- [ ] **Step 1: HUMAN — end-to-end recovery on device**

1. Install the fresh build. 2. Request recovery for the test account (uses Resend, D3-proven). 3. Tap the link in the email on the device. 4. Observe: opens StrandCue (not the browser) at the new-password screen ("A fresh start." — `auth.tsx:136`).

Append:

```markdown
## HTTPS recovery proof (2026-09-24)

- Link tapped: https://strandcue.adonisgptacc.workers.dev/auth/callback?…
- Opened in: StrandCue app (not browser) | BROWSER — FAIL
- Landed on: "A fresh start." password screen | other — <observation>
```

BROWSER verdict = assetlinks or intent-filter failure: check `adb shell pm get-app-links za.co.strandcue.app` (must say `verified`), fix, rebuild, retry.

- [ ] **Step 2: Commit**

```bash
git add -- docs/verification/device-evidence.md
git commit -m "docs: HTTPS recovery device proof"
```

---

### Task 5: Reconciliation update

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md` (Authentication row, Beta row)
- Modify: `docs/verification/beta-decisions.md` (D2 cutover note)

- [ ] **Step 1: Update honestly**

Authentication row: recovery evidence upgrades from "callback contracts" to device-proven HTTPS links. D2 gains a "cutover complete <date>" line. If Task 4 landed BROWSER, the gap column says so verbatim.

- [ ] **Step 2: Run contract tests and commit**

Run: `npx vitest run tests/tooling/reconciliation.test.ts`
Expected: PASS.

```bash
git add -- docs/verification/phase-1-reconciliation.md docs/verification/beta-decisions.md
git commit -m "docs: reconciliation reflects assetlinks cutover"
```

## Self-Review

- Spec coverage: serve → allowlist → flip → device proof → ledger. Recovery never breaks mid-plan (scheme fallback retained). No gaps.
- Placeholder scan: no TBD/TODO; the fingerprint placeholder is a named HUMAN input with source instructions, asserted by test shape.
- Type consistency: `AUTH_CALLBACK_HTTPS` value identical in test, implementation, Supabase allowlist, and evidence log; `assetlinks.md` package name matches `app.json`.

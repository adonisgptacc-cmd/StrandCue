# Quality Systems Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Make quality gates run on every PR (CI), and build the privacy-safe telemetry and accessibility contracts that the Beta gate will demand — with provider choices left as explicit external gates.

**Architecture:** CI YAML is treated as code and tested locally by parsing it (`tests/tooling/ci.test.ts`), mirroring the product-authority pattern. Analytics is a consent-gated, allowlisted event pipeline with an injectable sink: no SDK, no PII, disabled by default — the PostHog provider decision stays a Beta external gate. Crash reports use a scrubbing envelope (redacts emails, notes, UUIDs, tokens) with an injectable transport; the Sentry DSN stays unset until Beta. Accessibility contracts are enforced through component tests (labels, roles, 48dp targets, non-colour status) since device TalkBack needs hardware. Maestro flows are versioned YAML for the critical paths plus structural validation; emulator runs stay Beta-owned.

**Tech Stack:** TypeScript 7, Vitest 5, GitHub Actions, YAML, Expo 57 / React Native 0.86, Zod 4.

**Spec:** `StrandCue-PRD-v1.1-audit.md` §25/§27/§29, rebaseline design §5.5/§6

## Global Constraints

- Analytics never contains email, username, notes, free text, hair payloads or raw record identifiers — tested per event.
- Consent withdrawal stops collection; core recordkeeping never depends on telemetry.
- Crash payloads are scrubbed before transport; no secrets in logs.
- CI treats `audit:dependencies` as network-dependent (reported separately, never faked green).
- No provider credentials, DSNs or API keys in the repo, prompts or bundles.
- Maestro flows assert user-visible outcomes, never internal IDs or secrets.

## Review Focus

- A workflow that omits the coverage gate or folds the network audit into the deterministic gate must fail the CI contract test.
- An analytics event with an undocumented property or a PII-bearing property must fail its test.
- An unscrubbed crash field (email, notes, token) must fail the envelope test.
- A Maestro flow without assertions on visible outcomes must fail structural validation.

---

### Task 1: CI verify workflow refresh + contract test

**Files:**
- Modify: `.github/workflows/verify.yml`
- Create: `tests/tooling/ci.test.ts`
- Test: `tests/tooling/ci.test.ts`

- [ ] Step 1: Write failing CI contract test (parses YAML; requires typecheck, test+coverage, control-plane, web export jobs; requires network audit as separate job; requires secret-scan step; requires Node 24)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Refresh `verify.yml` (coverage gate, split network audit, secret scan, Node 24); fix `android-build.yml` Node version + note EAS secrets as Beta-owned
- [ ] Step 4: Contract test PASS
- [ ] Step 5: Commit `ci: refresh verification workflow`

---

### Task 2: Consent-gated analytics allowlist

**Files:**
- Create: `apps/mobile/src/analytics.ts`
- Test: `tests/mobile/analytics.test.ts`

- [ ] Documented event taxonomy (name, properties, PII flags) as code; unknown events rejected
- [ ] Disabled by default; consent flag gates emission; no email/username/notes/payloads/identifiers in any property (tests with adversarial inputs)
- [ ] Commit `feat: consent-gated analytics allowlist`

---

### Task 3: Scrubbed crash-report envelope

**Files:**
- Create: `apps/mobile/src/crash-report.ts`
- Test: `tests/mobile/crash-report.test.ts`

- [ ] Envelope scrubs emails, usernames, notes, UUIDs, tokens, URLs with secrets before transport; transport injectable; no-op without DSN
- [ ] Commit `feat: scrubbed crash-report envelope`

---

### Task 4: Accessibility contracts

**Files:**
- Test: `tests/mobile/accessibility.test.ts` (may add `apps/mobile/src/a11y.ts` helpers)

- [ ] Every interactive primitive exposes label+role; touch targets ≥48dp; statuses never colour-only; error/loading/empty states announced
- [ ] Commit `test: accessibility contracts`

---

### Task 5: Maestro critical-path flows

**Files:**
- Create: `.maestro/` flows (onboarding, passport, shelf, settings/export/deletion)
- Test: extend `tests/tooling/ci.test.ts` or new structural test

- [ ] Flows assert visible outcomes only; structural validation (valid YAML, required keys, no secrets)
- [ ] Commit `test: maestro critical-path flows`

---

### Task 6: Promotion and evidence

- [ ] Full `npm run verify` from clean tree
- [ ] Move `CI and automated quality` and `Analytics and observability` per evidence
- [ ] Commit `docs: promote quality slices`

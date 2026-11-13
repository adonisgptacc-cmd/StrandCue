# Observability Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the no-op analytics sink and crash transport with real PostHog/Sentry wiring that only fires with consent and configured providers, closing the "flies blind" gap.

**Architecture:** Keep the existing seams exactly where they are — `createAnalytics({sink})` with `AnalyticsSinkEvent` and `createCrashReporter({transport})` with `CrashEnvelope` — and add two provider adapters (`posthog-sink.ts`, `sentry-transport.ts`) that read keys/host from `EXPO_PUBLIC_` env (same pattern as `client.ts` Supabase config), stay inert when unconfigured, and are selected by the consent state for `product_analytics`.

**Tech Stack:** `posthog-react-native`, `@sentry/react-native`, existing `apps/mobile/src/analytics.ts:45-74` and `crash-report.ts:45-54`, `product_analytics` consent purpose.

**Spec:** `StrandCue-PRD-v1.1-audit.md`; `docs/verification/beta-decisions.md` D5 (DEFERRED — Task 1 un-defers it); `docs/verification/phase-1-reconciliation.md` (Analytics row); `tests/mobile/analytics.test.ts` (6), `tests/mobile/crash-report.test.ts` (4).

## Global Constraints

- Node 24; `npm run verify` exits 0 before and after every task.
- Task 1 (D5 decisions) is a hard gate: Tasks 2–5 do not start until hosting regions, subprocessor list, and adequacy assessment are recorded in `beta-decisions.md`.
- Consent supremacy: with `product_analytics` ungranted or unknown, zero network calls to any provider — same guarantee the allowlist has today.
- Scrub-first: the crash transport sends only `CrashEnvelope` post-`scrubValue`; raw errors, emails, IDs, notes never leave the device.
- No provider keys in git. Keys arrive as `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EXPO_PUBLIC_SENTRY_DSN` via EAS secrets / local `.env` (gitignored). Tests use fake keys only.
- POPIA cross-border rules (§21.8): EU hosting required unless the adequacy assessment in D5 says otherwise.

---

### Task 1: Un-defer D5 (HUMAN gate for the whole plan)

**Files:**
- Modify: `docs/verification/beta-decisions.md` (D5 section)

**Interfaces:**
- Consumes: owner decisions on regions + subprocessors.
- Produces: D5 DECIDED with values Tasks 2–5 build on. No values, no further tasks.

- [ ] **Step 1: HUMAN — record the D5 decision**

Replace the DEFERRED block with:

```markdown
- **Status:** DECIDED
- **PostHog:** <EU cloud | self-hosted EU> — subprocessor list: <list>
- **Sentry:** <EU cloud | self-hosted EU> — subprocessor list: <list>
- **Adequacy assessment:** <one line on POPIA §21.8 cross-border basis>
- **Decided by / date:** Owner / <date>
```

- [ ] **Step 2: Commit**

```bash
git add -- docs/verification/beta-decisions.md
git commit -m "docs: D5 observability hosting decided"
```

---

### Task 2: PostHog sink adapter (test-first)

**Files:**
- Create: `apps/mobile/src/posthog-sink.ts`
- Create: `tests/mobile/posthog-sink.test.ts`

**Interfaces:**
- Consumes: `AnalyticsSink`, `AnalyticsSinkEvent` from `analytics.ts:45-51`; `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`.
- Produces: `createPostHogSink(env): AnalyticsSink` — drops events when unconfigured or when consent is false; maps `AnalyticsSinkEvent` name+properties to `posthog.capture` otherwise.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ StyleSheet: { create: (v: unknown) => v } }));

import { createPostHogSink } from '../../apps/mobile/src/posthog-sink';

describe('posthog sink adapter', () => {
  it('drops events when no key is configured', () => {
    const capture = vi.fn();
    const sink = createPostHogSink({ key: '', host: 'https://eu.i.posthog.com', capture });
    sink({ name: 'passport_saved', properties: {}, consented: true });
    expect(capture).not.toHaveBeenCalled();
  });

  it('drops events when consent is false even with a key', () => {
    const capture = vi.fn();
    const sink = createPostHogSink({ key: 'fake-key', host: 'https://eu.i.posthog.com', capture });
    sink({ name: 'passport_saved', properties: {}, consented: false });
    expect(capture).not.toHaveBeenCalled();
  });

  it('forwards allowlisted events with consent and key', () => {
    const capture = vi.fn();
    const sink = createPostHogSink({ key: 'fake-key', host: 'https://eu.i.posthog.com', capture });
    sink({ name: 'passport_saved', properties: { revision: 2 }, consented: true });
    expect(capture).toHaveBeenCalledWith('passport_saved', { revision: 2 });
  });

  it('rejects non-EU hosts without an adequacy override', () => {
    expect(() => createPostHogSink({ key: 'fake-key', host: 'https://us.i.posthog.com', capture: vi.fn() }))
      .toThrow(/region/i);
  });
});
```

Adjust the exact `AnalyticsSinkEvent` field names to the real interface (`analytics.ts:45-51`) at implementation time — the drop/forward/region rules above are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mobile/posthog-sink.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Minimal implementation**

`apps/mobile/src/posthog-sink.ts`: injectable `capture` (defaults to the real PostHog client only when key+EU host present); guard order: configured → consented → forward. Non-EU host throws unless D5 adequacy names it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mobile/posthog-sink.test.ts tests/mobile/analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- apps/mobile/src/posthog-sink.ts tests/mobile/posthog-sink.test.ts
git commit -m "feat: PostHog sink behind consent and EU-region guard"
```

---

### Task 3: Sentry transport adapter (test-first)

**Files:**
- Create: `apps/mobile/src/sentry-transport.ts`
- Create: `tests/mobile/sentry-transport.test.ts`

**Interfaces:**
- Consumes: `CrashEnvelope`, `CrashTransport`, `scrubValue` from `crash-report.ts:17-52`; `EXPO_PUBLIC_SENTRY_DSN`.
- Produces: `createSentryTransport(env): CrashTransport` — drops when DSN absent; sends the scrubbed envelope only.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ StyleSheet: { create: (v: unknown) => v } }));

import { createSentryTransport } from '../../apps/mobile/src/sentry-transport';

const envelope = {
  message: 'boom', stack: 'at x', context: { screen: 'Settings' },
  email: 'a@b.c', userId: 'u1', notes: 'private',
} as never;

describe('sentry transport adapter', () => {
  it('drops envelopes when no DSN is configured', () => {
    const send = vi.fn();
    createSentryTransport({ dsn: '', send })(envelope);
    expect(send).not.toHaveBeenCalled();
  });

  it('scrubs before sending when configured', () => {
    const send = vi.fn();
    createSentryTransport({ dsn: 'https://fake@o0.ingest.sentry.io/0', send })(envelope);
    expect(send).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(send.mock.calls[0][0]);
    expect(sent).not.toContain('a@b.c');
    expect(sent).not.toContain('private');
    expect(sent).toContain('boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mobile/sentry-transport.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Minimal implementation**

`apps/mobile/src/sentry-transport.ts`: run the envelope through `scrubValue` first, then the injectable `send` (defaults to Sentry only with a DSN). Crash reporting is tied to `product_analytics` consent at the call site (Task 4).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/mobile/sentry-transport.test.ts tests/mobile/crash-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- apps/mobile/src/sentry-transport.ts tests/mobile/sentry-transport.test.ts
git commit -m "feat: Sentry transport with scrub-first guarantee"
```

---

### Task 4: Wire adapters to consent + config (test-first)

**Files:**
- Create: `apps/mobile/src/observability.ts` (selector: env + consent → sink/transport)
- Create: `tests/mobile/observability.test.ts`
- Modify: call sites that build `createAnalytics`/`createCrashReporter` (discover at implementation time; keep signatures).

**Interfaces:**
- Consumes: `createPostHogSink`, `createSentryTransport`, `listConsents()` (`consent-api.ts:52`).
- Produces: `configureObservability(env, consents)` returning the active sink/transport pair (no-ops when unconsented/unconfigured).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ StyleSheet: { create: (v: unknown) => v } }));

import { configureObservability } from '../../apps/mobile/src/observability';

describe('observability selector', () => {
  it('returns no-ops when product_analytics is ungranted despite configured keys', () => {
    const events: unknown[] = [];
    const { sink, transport } = configureObservability(
      { posthogKey: 'k', posthogHost: 'https://eu.i.posthog.com', sentryDsn: 'https://x@y/0' },
      { product_analytics: false },
      { capture: (e: unknown) => events.push(e), send: (e: unknown) => events.push(e) },
    );
    sink({ name: 'passport_saved', properties: {}, consented: false });
    transport({ message: 'x' } as never);
    expect(events).toEqual([]);
  });

  it('activates providers when consented and configured', () => {
    const events: unknown[] = [];
    const { sink } = configureObservability(
      { posthogKey: 'k', posthogHost: 'https://eu.i.posthog.com', sentryDsn: '' },
      { product_analytics: true },
      { capture: (e: unknown) => events.push(e), send: (e: unknown) => events.push(e) },
    );
    sink({ name: 'passport_saved', properties: {}, consented: true });
    expect(events).toHaveLength(1);
  });

  it('stays inert with no keys even when consented (dev builds)', () => {
    const events: unknown[] = [];
    const { sink, transport } = configureObservability(
      { posthogKey: '', posthogHost: '', sentryDsn: '' },
      { product_analytics: true },
      { capture: (e: unknown) => events.push(e), send: (e: unknown) => events.push(e) },
    );
    sink({ name: 'passport_saved', properties: {}, consented: true });
    transport({ message: 'x' } as never);
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/mobile/observability.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Minimal implementation + call-site wiring**

`observability.ts` reads `product_analytics` from the consent list and builds the pair; no keys or no consent → the existing no-ops. Wire the result into wherever `createAnalytics`/`createCrashReporter` are instantiated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run typecheck && npx vitest run tests/mobile/observability.test.ts tests/mobile/analytics.test.ts tests/mobile/crash-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- apps/mobile/src/observability.ts tests/mobile/observability.test.ts apps/mobile/src/<call-sites>
git commit -m "feat: observability selector binds providers to consent"
```

---

### Task 5: Dashboards, alerts, release proof (HUMAN + evidence)

**Files:**
- Modify: `docs/verification/device-evidence.md` (observability section)
- Modify: `docs/verification/phase-1-reconciliation.md` (Analytics row)

**Interfaces:**
- Consumes: internal-track build with Tasks 2–4 (Plan A build command, `playInternal` profile).
- Produces: live dashboard proof + ledger update.

- [ ] **Step 1: HUMAN — provider setup and live proof**

1. Create PostHog (EU) + Sentry projects; store keys in EAS secrets (`eas secret:create`) — never in git.
2. Install the internal build, grant `product_analytics`, trigger one allowlisted event + one test crash.
3. Confirm both appear in the dashboards; configure one alert (crash-rate spike → support owner, D4).

Append:

```markdown
## Observability (2026-09-24)

- PostHog EU: allowlisted event observed (<dashboard link>)
- Sentry: scrubbed test crash observed (<issue link>)
- Consent-off check: airplane-mode equivalent — no events with product_analytics ungranted
- Alert: crash-rate spike → <support owner contact>
```

- [ ] **Step 2: Update the Analytics ledger row**

Evidence column gains the dashboard proof; classification moves to Implemented, unverified with provider evidence, or Proven complete per the gate review. D5 flips to DECIDED (done in Task 1).

- [ ] **Step 3: Full verify and commit**

Run: `npm run verify`
Expected: exit 0.

```bash
git add -- docs/verification/device-evidence.md docs/verification/phase-1-reconciliation.md docs/verification/beta-decisions.md
git commit -m "docs: observability live with dashboard proof"
```

## Self-Review

- Spec coverage: D5 gate → two adapters → consent selector → live proof → ledger. POPIA region + scrub + consent rules enforced in tests, not prose. No gaps.
- Placeholder scan: no TBD/TODO; injectable `capture`/`send` doubles keep provider SDKs out of unit tests while asserting exact behavior.
- Type consistency: `AnalyticsSink`/`CrashTransport` signatures reused verbatim from `analytics.ts`/`crash-report.ts`; Task 4 test field names verified against those interfaces at implementation time (noted in Task 2).

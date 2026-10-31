# StrandCue security audit remediation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan task by task. Use `superpowers:test-driven-development` for every behavior change, `security-review` for every migration/auth/CI task, and `superpowers:verification-before-completion` before every completion claim.

**Goal:** Remove the confirmed launch blockers in `SECURITY_AUDIT_v1.0_14-10-2026.md`, restore honest user-facing behavior, and produce reviewable repair increments without publishing content or changing hosted services.

**Architecture:** Keep the deterministic TypeScript domain engine, but stop treating mobile output as trusted authority. PostgreSQL owns execution invariants and constructs persisted execution state. Authenticated clients may submit bounded commands; they may not mint executable guidance, supply authoritative decisions, assert product ownership, or provide final database snapshots. Account/privacy repairs remain behind owner-scoped RPCs and recent-auth checks. Release and website hardening stay in source control until a human separately authorizes hosted changes.

**Tech stack:** TypeScript 6, React Native/Expo 57, Vitest 5, Zod 4, Supabase/PostgreSQL migrations tested with PGlite, Cloudflare Workers/Pages, GitHub Actions, Node 24.19.x only.

**Spec:** `SECURITY_AUDIT_v1.0_14-10-2026.md`, the canonical product authority named by `docs/product/requirement-traceability.md`, and the existing Increment A/B contracts. If they conflict, preserve the stricter fail-closed security or product-governance rule and record the ruling in the gap ledger.

## Global constraints

- Start from exact commit `bceec202e5ee10f2ecaf01243f89be76c3912a58` in `C:\Users\ABADO\Desktop\StrandCue\.worktrees\protocol-execution`.
- Create an isolated branch/worktree named `codex/security-audit-remediation`. Do not modify the main checkout or sibling worktrees.
- Preserve and commit the audit report and this plan as source evidence before implementation. Never rewrite the audit to make a result appear green.
- Use Node `24.19.x`; fail immediately on Node 25.
- Follow RED → GREEN → REFACTOR. Every new or changed logic file must reach at least 80% statements, branches, functions, and lines.
- Run a fresh code review and security review after every task that changes trust boundaries. Resolve Critical/High findings before proceeding.
- Never infer hair/product capabilities, reviewer identities, catalogue facts, UUIDs, ownership, or timestamps.
- Keep `today-core-guidance` v2 draft, its rule withdrawn, and capabilities empty. Do not alter the Garnier evidence, catalogue migration, or Human A/B packet.
- Do not push, merge, deploy, publish, apply hosted migrations, change Supabase Auth, change Cloudflare settings, upload photos, or use production credentials.
- Treat any live service call as out of scope. Use PGlite, unit tests, fixtures, exported web output, and local emulators only.
- Add migrations; never edit already-applied migration files merely to hide history. Tests may load the full migration chain.
- Preserve immutability. Validate all public/RPC inputs, use bounded text/JSON, owner checks, explicit grants, and stable error codes.
- One conventional commit per task. Keep the worktree clean at every stopping point.
- If a proposed fix requires a hosted secret or irreversible action, implement and test the source change, document the manual action, then stop.

## Review focus

Reviewers must try to prove that an authenticated attacker can:

1. create a `ready` recommendation without trusted provenance;
2. start execution from a decision different from the stored run;
3. forge, enlarge, reorder, future-date, or cross-own execution state;
4. cancel deletion without recent authentication;
5. receive an incomplete export advertised as complete;
6. retain another owner’s UI/data after account or session change;
7. run unlocked third-party CI code beside release credentials.

Any successful proof keeps the launch decision at HOLD.

## Increment 0 — establish a reproducible repair baseline

### Task 1: preserve the audit, plan, and exact baseline

**Files:**
- Add: `SECURITY_AUDIT_v1.0_14-10-2026.md`
- Add: `docs/superpowers/plans/2026-10-14-security-audit-remediation.md`
- Update: the existing security/gap ledger referenced by the audit; do not invent a new top-level ledger

**Steps:**
1. Assert branch base equals `bceec202e5ee10f2ecaf01243f89be76c3912a58` and only the two evidence files are untracked.
2. Run `npm run check:runtime`, `npm run typecheck`, `npm run lint`, focused PGlite suites, `npm test -- --run`, `npm run test:coverage`, `npm run export:web`, `npm run audit:dependencies`, and `npm run audit:control-plane`.
3. Record exact pass/fail counts. The known `CLAIM-STALE expo-compatible-sdk` control-plane HOLD must remain a visible baseline failure.
4. Add a ledger table mapping every audit ID to `open`, owner increment, tests, and evidence file.
5. Commit: `docs: preserve security audit remediation baseline`.

**Stop condition:** If baseline differs materially from the audit, stop and report the drift before modifying code.

## Increment 1 — close guidance and execution trust-boundary blockers

### Task 2: prevent authenticated clients from minting executable guidance

**Files:**
- Add: next timestamped migration under `supabase/migrations/`
- Update: `apps/mobile/src/guidance/recommendation-run-api.ts`
- Update: `apps/mobile/src/guidance/today-guidance-service.ts`
- Test: `tests/database/recommendation-runs.test.ts`
- Test: `tests/mobile/recommendation-run-api.test.ts`
- Test: `tests/mobile/today-guidance-service.test.ts`

**Required behavior:**
- The authenticated public RPC may persist only non-executable outcomes such as `content_pending`, `source_incomplete`, or the exact existing fail-closed equivalents.
- A `ready` decision requires a dedicated trusted-writer path unavailable to `anon` and `authenticated`. Do not expose `service_role` material to the app.
- Reject mismatched owner IDs, unknown fields, malformed protocols, and client attempts to select the trusted path.
- Current draft guidance must continue producing `content_pending`; do not fabricate a ready fixture in production content.

**TDD:** First add PGlite and API tests demonstrating that the old authenticated RPC accepts an arbitrary ready decision. Confirm RED. Add the migration and narrowed client contract. Confirm GREEN, including grant inspection and no regression for draft decisions.

**Architecture ruling:** This task secures the current technical alpha. A future trusted guidance-generation service is a separate reviewed design. Do not build an Edge Function ad hoc in this repair branch.

**Commit:** `fix: block client-minted executable guidance`

### Task 3: bind execution start to the stored recommendation decision

**Files:**
- Add: next timestamped migration under `supabase/migrations/`
- Update: `apps/mobile/src/guidance/protocol-execution-api.ts`
- Update: `apps/mobile/src/ProtocolExecution.tsx`
- Test: `tests/database/protocol-executions.test.ts`
- Test: `tests/mobile/protocol-execution-api.test.ts`
- Test: `tests/mobile/protocol-execution.test.tsx`

**Required interface change:** Remove the caller-supplied authoritative decision from `start_protocol_execution`. Accept the owned `recommendation_run_id` plus bounded operation metadata. Inside PostgreSQL, lock and load the owned run, require its stored decision to be executable and trusted, then derive the initial snapshot from that stored value.

**Adversarial tests:** fabricated steps, another owner’s run, non-ready run, untrusted-ready run, missing run, deleted owner, duplicate operation ID, and extra JSON keys must fail with stable non-sensitive codes.

**Commit:** `fix: bind protocol starts to trusted stored decisions`

### Task 4: make the server construct transition results

**Files:**
- Add: next timestamped migration under `supabase/migrations/`
- Update: `packages/domain/src/protocol-execution.ts` only if a shared pure transition contract needs clarification
- Update: `apps/mobile/src/guidance/protocol-execution-api.ts`
- Update: `apps/mobile/src/guidance/protocol-execution-state.ts`
- Update: `apps/mobile/src/ProtocolExecution.tsx`
- Test: corresponding domain, database, API, state, and component suites

**Required interface change:** Replace public `p_result` snapshots with a bounded command: execution ID, expected revision, operation ID, transition kind, step ID when required, deviation text when allowed, optional owned substitute shelf item ID, and one explicit event timestamp. PostgreSQL validates the command and constructs the authoritative snapshot and event.

**Required validations:** exact transition allowlist; exact JSON keys; revision compare-and-swap; step membership; state-machine legality; 2 KB maximum deviation text; bounded identifiers; timestamp skew; immutable owner/run/protocol; no arbitrary top-level fields; server-owned `updatedAt`.

**TDD:** Reproduce SC-003 with forged `updatedAt` and an extra key before implementation. Add property/table tests covering every state × command pair and ensure invalid combinations fail closed.

**Commit:** `fix: construct execution transitions on the server`

### Task 5: use one timestamp and one transition dispatcher

**Files:**
- Refactor: `apps/mobile/src/ProtocolExecution.tsx`
- Add or refactor: a focused orchestration module under `apps/mobile/src/guidance/`
- Test: `tests/mobile/protocol-execution.test.tsx`
- Test: `tests/mobile/protocol-execution-state.test.ts`

**Required behavior:** Capture one `eventAt` per user action and pass it through optimistic preview and persistence. Reconcile with the server-returned authoritative snapshot. Prevent double taps while an operation is pending. Map stable database codes to user copy; never render raw database errors.

**TDD:** Add a deterministic clock test that proves the old two-call path produces different timestamps and `result-mismatch`. Confirm RED, refactor to one dispatcher, confirm GREEN.

**Commit:** `fix: unify protocol transition dispatch`

### Task 6: verify substitute product ownership against My Shelf

**Files:**
- Add: next timestamped migration under `supabase/migrations/`
- Update: `apps/mobile/src/guidance/protocol-execution-api.ts`
- Update: `apps/mobile/src/ProtocolExecution.tsx`
- Reuse: `apps/mobile/src/shelf-api.ts` and existing shelf domain contracts
- Test: shelf, execution database, API, and component suites

**Required behavior:** The client submits an owned shelf-item ID, never a free-form product-version ID plus `owned: true`. The RPC verifies current user ownership, active/non-deleted membership, referenced product version, and protocol capability constraints. Persist the verified shelf and product version identifiers. Reject another owner’s item and stale/deleted items.

**Commit:** `fix: verify execution substitutions against owner shelf`

### Task 7: add limits, idempotency, and relational integrity

**Files:**
- Add: next timestamped migration under `supabase/migrations/`
- Test: `tests/database/protocol-executions.test.ts`
- Update: database inventory/runbook docs

**Required behavior:**
- Add defensible per-owner limits for active runs, total events per execution, and payload/text sizes.
- Make concurrent retries of the same operation return the already-committed outcome. Test with two concurrent connections.
- Reject client timestamps outside a documented skew window; retain server receipt time separately.
- Add safe foreign keys or equivalent deferred integrity guards for execution → run and event → execution without breaking owner isolation/deletion policy.
- Document cleanup/retention for completed and abandoned executions.

**Commit:** `fix: bound and harden protocol persistence`

### Task 8: increment 1 review and stop

Run all focused suites, full tests, coverage, typecheck, lint, diff check, export, dependency policy, and control-plane audit. Use fresh code and security reviewers. Update each audit ID with evidence; do not mark fixed from implementation alone. Produce an Increment 1 handoff and stop. No hosted migration.

## Increment 2 — repair account lifecycle and privacy behavior

### Task 9: require recent authentication for deletion cancellation

**Files:** next migration; `apps/mobile/src/deletion-api.ts`; `DeletionScreen.tsx`; deletion/recent-auth tests.

Reuse the existing recent-auth epoch mechanism. Cancellation must require the same freshness class as destructive account actions, preserve the original request as immutable history, append a cancellation audit event, and reject blocked/deleted/wrong-owner sessions. Commit `fix: secure and audit deletion cancellation`.

### Task 10: enable secure password changes in source configuration

**Files:** `supabase/config.toml`, `apps/mobile/src/auth.tsx`, auth tests, deployment runbook.

Set the local source-of-truth configuration to require secure password change/recent reauthentication, add UI handling for reauthentication-required errors, and document the exact hosted dashboard verification as a pending manual action. Never change the hosted setting in this task. Commit `fix: require secure password changes`.

### Task 11: make JSON and CSV exports complete and honest

**Files:** next migration; `ExportScreen.tsx`; export API/delivery modules; database/mobile export tests; privacy documentation.

Add consent records, recommendation runs, protocol executions/events, and their documented schema versions to owner export. Preserve ordering and escaping. Exclude service-only secrets. Add parity assertions so JSON and CSV expose equivalent categories. If a category cannot be exported safely, change the UI promise from “complete copy” to an exact list and keep PR-001 open. Commit `fix: include guidance and consent history in exports`.

### Task 12: clear personal state on refresh or owner failure

**Files:** `apps/mobile/src/auth.tsx`, owner-keyed state containers/screens, crash-report module, auth and UI tests.

On refresh failure that means revoked/deleted/invalid session, synchronously clear user data and render signed-out state. Keep transient offline behavior explicit and bounded. Redact tokens, email, UUIDs, URLs, free text, and database payloads from crash reports. Verify owner switching never paints prior-owner data for one frame. Commit `fix: clear and redact account-bound client state`.

### Task 13: implement executable retention cleanup

**Files:** next migration and/or existing account-deletion worker, worker tests, privacy retention runbook, dependency automation if worker changes.

Implement deterministic cleanup functions for expired export artifacts, cancelled/completed deletion records under the approved legal retention rule, and expired execution/recommendation operational data. Tests must freeze time and prove active/legal-hold records survive. Scheduling and hosted secrets remain pending manual actions. Commit `feat: enforce documented privacy retention locally`.

### Task 14: increment 2 review and stop

Run focused and full gates, two fresh reviews, and produce a privacy matrix showing collection, purpose, export, deletion, retention, and owner authorization. Stop before hosted application.

## Increment 3 — restore honest and resumable mobile behavior

### Task 15: restore active protocol execution

**Files:** `ProtocolExecution.tsx`, `protocol-execution-api.ts`, state/orchestration module, mobile tests.

Load the owner’s active execution on mount, validate it against the current account and stored protocol fingerprint, show a loading state that cannot paint stale content, and resume at the authoritative revision. Handle no run, completed run, malformed response, offline cache, owner switch, and retry. Commit `feat: resume active protocol executions`.

### Task 16: remove the no-op My Hair consent promise

**Files:** `TodayCheckIn.tsx`, `TodayGuidance.tsx`, guidance copy and tests.

For this repair branch, remove or disable “Save these answers to My Hair” unless a separately approved profile-observation persistence spec already exists. Keep ephemeral check-in answers usable for the current session and state that clearly. Do not silently create a new health/profile dataset in a security fix. Add the real persistence feature through a later privacy-reviewed plan. Commit `fix: remove misleading check-in persistence control`.

### Task 17: split execution orchestration from rendering

Refactor the 658-line component into focused controller/hook, progress view, action controls, deviation form, and substitution picker without changing behavior. Keep each file focused and under the repository limits. Tests must cover controller integration and critical user actions. Commit `refactor: separate protocol execution orchestration`.

### Task 18: increment 3 review and device evidence stop

Run full gates and prepare an Android acceptance checklist for start, pause, resume after process death, confirmed steps, deviations, owned substitution, offline/reconnect, account switch, and completion. Do not claim device PASS without a physical/emulated signed-build run. Stop for device evidence.

## Increment 4 — harden website, recovery, CI, and dependency controls

### Task 19: harden website transport in source

**Files:** `website/public/_headers`, `website/wrangler.jsonc`, `tests/website/site-security.test.ts`, website runbook.

Add HSTS for HTTPS responses and document the Cloudflare “Always Use HTTPS”/redirect action. Add local/static assertions and a post-deploy verification script that checks HTTP → HTTPS and HSTS. Do not change Cloudflare. Commit `fix: define website transport security controls`.

### Task 20: move recovery to verified HTTPS links

**Files:** `apps/mobile/app.json`, auth contracts/implementation/tests, App Links verification tooling/docs, website association route if required.

Use the existing verified StrandCue HTTPS domain for recovery callbacks, keep PKCE, validate callback host/path, and reject unexpected parameters. Preserve a time-bounded compatibility path only if tests and migration copy require it. Do not use a locally signed certificate for a Play-distributed build; record both fingerprints when Play signing is later enabled. Commit `fix: use verified https recovery callbacks`.

### Task 21: lock release and mutation CI tooling

**Files:** root `package.json`, `package-lock.json`, `.github/workflows/android-build.yml`, `.github/workflows/mutation-testing.yml`, tooling tests.

Add exact EAS and mutation-runner dependencies to the lockfile, use `npm ci --ignore-scripts` where compatible, invoke local binaries, minimize job token permissions, and ensure untrusted install/build steps do not receive `EXPO_TOKEN`. Fail if resolved versions differ from the lock. Commit `ci: lock credential-bearing build tooling`.

### Task 22: include the deletion worker in dependency automation

**Files:** `.github/dependabot.yml`, worker package metadata, tooling tests.

Add the worker’s npm directory with bounded update cadence and grouped safe updates. Ensure CI audits both lockfiles using the existing exception policy. Commit `ci: monitor deletion worker dependencies`.

### Task 23: restore control-plane and coverage gates

**Files:** control-plane claim inventory, `vitest.config.ts`, relevant audit scripts/tests.

Re-evaluate and refresh or remove the stale `expo-compatible-sdk` claim using current local evidence; never merely change its date. Include mobile source in meaningful coverage or establish explicit per-module thresholds for critical auth/guidance/execution modules. Add real local Supabase API/RPC integration coverage where PGlite cannot prove Auth/PostgREST behavior. Commit `test: strengthen control-plane and mobile security gates`.

### Task 24: dependency advisory disposition

**Files:** dependency exception registry, lockfile only where a tested safe upgrade exists, dependency-policy tests.

Re-run the policy and raw npm audit. Upgrade only when compatible and verified. For unresolved `braces`, `node-forge`, `decode-uri-component`, and `uuid` paths, record reachability, runtime exposure, upstream status, compensating controls, owner, and near-term expiry. Never use `npm audit fix --force`. Commit `chore: refresh dependency advisory evidence`.

### Task 25: final review and launch decision packet

Run `npm run verify:offline`, standalone dependency/control-plane audits, all PGlite and integration tests, web export, signed Android build checks, `git diff --check`, secret scan, and independent code/security reviews. Re-run each audit exploit. Produce a matrix for every finding: original proof, repair commit, regression test, reviewer, remaining limitation, hosted/manual action. The result is GO only if every Critical/High item is fixed or explicitly accepted by the named human authority and required device/hosted evidence exists. Otherwise report HOLD honestly.

**Final stop:** Do not push, merge, deploy, apply migrations, change hosted Auth/Cloudflare, or publish guidance. Return the clean branch, commit list, exact verification output, unresolved findings, and the manual-action checklist to the user.

## OpenCode execution prompt

Copy the text below into OpenCode together with this repository/worktree:

```text
Execute docs/superpowers/plans/2026-10-14-security-audit-remediation.md using subagent-driven development and strict TDD. Start from bceec202e5ee10f2ecaf01243f89be76c3912a58 in the protocol-execution worktree, create an isolated codex/security-audit-remediation branch/worktree, and preserve the audit report unchanged. Complete only Increment 0 and Increment 1, one conventional commit per task. After each task, run its focused tests and obtain fresh code and security review; fix Critical/High findings before continuing. At Task 8 run the full gates, produce a detailed handoff, and stop. Do not begin Increment 2. Do not push, merge, deploy, publish, apply hosted migrations, call production services, change hosted settings, fill reviewer identities, or alter draft guidance/catalogue evidence. Use Node 24.19.x and report exact RED/GREEN commands and counts. If the implementation cannot preserve the plan's trust boundary, stop and report the conflict rather than weakening it.
```

## Plan self-review

- Every confirmed Critical/High audit item is assigned to a task and regression evidence.
- The first executable increment removes authority from the mobile client before adding features.
- Trusted ready-guidance generation is deliberately deferred to a separate architecture review; current draft behavior stays usable and fail-closed.
- Hosted changes are prepared and documented but cannot happen implicitly.
- Human A/B product review and catalogue publication remain untouched.
- Functional fixes do not create new personal-data categories without a privacy-reviewed specification.
- Type/interface changes are sequenced database → adapter → state/controller → UI, with tests at every boundary.

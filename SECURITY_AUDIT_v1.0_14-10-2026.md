# Security Audit Report v1.0 – 14/10/2026 18:08

## executive summary

**Repository:** StrandCue  
**Branch:** `codex/protocol-execution`  
**Audited commit:** `bceec202e5ee10f2ecaf01243f89be76c3912a58`  
**Audit posture:** **HOLD — substantial hardening exists, but the current branch is not safe to merge or launch.**

StrandCue has unusually strong foundations for an early product: strict TypeScript schemas, broad tests, forced PostgreSQL row-level security, narrowly scoped authenticated reads, immutable recommendation and execution concepts, secure native token storage, SHA-pinned GitHub Actions, strict static-site browser protections, and explicit human review gates for product content. The audit nevertheless confirmed several cross-layer defects that undermine the core promise that only reviewed guidance can become an executable protocol.

The most serious issue is the recommendation trust boundary. An authenticated client can submit an arbitrary recommendation decision to `record_recommendation_run`; execution start then checks only that a run ID belongs to the caller and accepts another caller-supplied decision. Consequently, a modified client can create fabricated “ready” guidance and turn it into execution history without passing the reviewed-content engine. Two additional execution defects compound this: transition snapshots are not fully authenticated by the database, and the mobile UI calculates the result and RPC command using two different timestamps, causing valid actions to fail intermittently.

The top five risks are:

1. **Untrusted clients can create arbitrary ready recommendation runs.**
2. **Execution start is not bound to the exact stored recommendation decision.**
3. **The execution UI uses mismatched timestamps and can reject valid actions.**
4. **Account deletion can be cancelled by a stale session without recent authentication.**
5. **User exports omit consent, recommendation and protocol-execution history despite promising a complete copy.**

The repository is not known to contain a committed secret. Raw `npm audit` reports 19 high and 11 moderate dependency findings across 30 nodes; the repository policy permits them under four time-limited reviewed exceptions, but they remain a release risk requiring continued monitoring. No code, migration, hosted service, Git history, secret, deployment or branch was changed during the audit. This report is the only intended repository addition.

## architecture and trust boundaries

### system map

- **Mobile application:** Expo 57, React Native, Expo Router and TypeScript under `apps/mobile`.
- **Domain engine:** immutable Zod-validated TypeScript state and recommendation logic under `packages/domain`.
- **Database and API:** Supabase/PostgreSQL migrations, forced RLS and authenticated RPCs under `supabase/migrations`.
- **Workers:** a scheduled account-deletion worker under `workers/account-deletion` and an App Links Cloudflare Worker source under `scripts/cloudflare-worker.ts`.
- **Public website:** static Cloudflare assets under `website/public` with Wrangler configuration.
- **CI and release:** GitHub Actions for verification, secret scanning, disposable Supabase testing, Android build and mutation testing.
- **External services:** Supabase Auth/Database, Cloudflare Workers/website, Expo/EAS build service and GitHub Actions.

### untrusted input entry points

- Email, password, recovery URLs, deep links and Supabase session responses.
- Today check-in selections, execution commands, deviation reasons and substitution product/version identifiers.
- Every mobile-to-Supabase RPC argument and every Supabase/PostgREST response.
- Pagination cursors, UUIDs, timestamps, JSON snapshots and operation identifiers.
- Shelf, tool, activity, service, Passport and profile form values.
- Public website requests and Android App Links requests.
- Cloudflare Worker environment variables and Supabase worker responses.
- Export download payloads and server-provided error text.
- Environment variables, CI inputs, package-registry artifacts and GitHub secrets.
- Product-research documents, catalogue compiler inputs and CLI arguments.

The critical boundaries are mobile client → domain validation, mobile client → authenticated RPC, JWT → `request_uid()`, security-definer RPC → forced-RLS tables, reviewed bundle → recommendation decision, stored recommendation → execution, and database receipt → rendered UI.

## findings table

| ID | Title | Severity | Rationale | Category | Evidence | Status |
|---|---|---:|---|---|---|---|
| SC-001 | Client can create arbitrary recommendation decisions | Critical | Authenticated attacker can bypass reviewed guidance and create executable content | Authorization / product integrity | `supabase/migrations/20261011090000_recommendation_runs.sql:67-87,111-116` | Confirmed |
| SC-002 | Execution start is not bound to stored decision | Critical | Fabricated steps can be attached to a legitimate owned run | Authorization / data integrity | `supabase/migrations/20261013175703_protocol_executions.sql:220-256` | Confirmed |
| CQ-001 | UI and RPC use different transition timestamps | High | Normal execution actions intermittently fail; server tightening would break all transitions | Logic / availability | `apps/mobile/src/ProtocolExecution.tsx:220-234,289-305,573-607` | Confirmed |
| SC-003 | Transition snapshot validation is incomplete | High | Caller can persist forged `updatedAt` and unexpected top-level data | API / data integrity | `supabase/migrations/20261013175703_protocol_executions.sql:376-472` | Confirmed |
| SC-004 | Product substitution ownership is self-asserted | High | Invented or another product version can be recorded as owned | Authorization / mass assignment | `apps/mobile/src/ProtocolExecution.tsx:333-345`; `packages/domain/src/protocol-execution.ts:83-94`; migration `:399-415` | Confirmed |
| AU-001 | Deletion cancellation lacks recent authentication | High | Stale or stolen JWT can restore a blocked account | Authentication / account lifecycle | `supabase/migrations/20260924280000_deletion_rpc.sql:59-75,118-123` | Confirmed |
| AU-002 | Secure password changes are disabled | High | Stolen session may become durable account takeover if hosted setting matches | Authentication | `supabase/config.toml:218-233`; `apps/mobile/src/auth.tsx:221-230` | Likely; hosted setting review required |
| PR-001 | Data export omits owner-linked records | High | “Complete copy” excludes consent, recommendation and execution history | Privacy / POPIA | `20260924260000_export_rpc.sql:41-89`; `20260924320000_export_csv.sql:27-92`; `ExportScreen.tsx:97-100` | Confirmed |
| WB-001 | Production HTTP site does not redirect and HSTS is absent | High | First-visit network attacker can alter content and links | Transport security | `website/public/_headers:1-6`; `website/wrangler.jsonc:6-12` | Confirmed by public endpoint check |
| CI-001 | Release job downloads EAS CLI outside lockfile with release token | High | Registry compromise can execute while `EXPO_TOKEN` is present | Supply chain / CI | `.github/workflows/android-build.yml:52-61` | Confirmed |
| MB-001 | Active execution is never restored | High | Restart/remount strands an in-progress protocol | Availability / data integrity | `protocol-execution-api.ts:174-179`; `ProtocolExecution.tsx:123-218` | Confirmed |
| MB-002 | “Save these answers to My Hair” performs no save | High | Explicit user consent appears accepted but observations are discarded | Consent / correctness | `guidance-copy.ts:162-164`; `TodayCheckIn.tsx:131-140`; `TodayGuidance.tsx:218-249` | Confirmed |
| DB-001 | Authenticated storage amplification lacks quotas | High | Repeated large transitions multiply JSON across tables indefinitely | Abuse / denial of service | execution migration `:217-218,304-305,348-357,483-492` | Likely |
| WB-002 | Password recovery remains on claimable custom scheme | Medium | Another app can intercept or block callback; PKCE limits token theft | Deep links | `apps/mobile/app.json:9-21`; `auth.tsx:11`; `contracts.ts:34-44` | Confirmed |
| PR-002 | Retained deletion and consent data has no cleanup enforcement | Medium | Personal/compliance data persists without executable retention schedule | Privacy / retention | `20260924270000_deletion.sql:17-23`; `20260924330000_consent.sql:3-22` | Confirmed |
| AU-003 | Refresh failure preserves previously rendered personal data | Medium | Revoked/deleted account data can remain visible on an open device | Session / local privacy | `apps/mobile/src/auth.tsx:86-93` | Confirmed |
| LG-001 | Crash scrubber misses normalized credential names | Medium | Enabling telemetry may transmit access/refresh tokens | Logging / secrets | `apps/mobile/src/crash-report.ts:10-13,34-39,54-60` | Likely; transport currently disabled |
| AU-004 | Deletion cancellation has no durable audit event | Medium | Account-lifecycle change erases request evidence | Audit logging | `20260924280000_deletion_rpc.sql:37-75` | Confirmed |
| TS-001 | New execution RPCs lack real Auth/PostgREST CI tests | Medium | PGlite cannot prove production API grants, JWT and anonymous behavior | Test coverage | `.github/workflows/verify.yml`; `tests/database/supabase-api.test.ts` | Confirmed |
| TS-002 | Coverage thresholds exclude mobile execution code | Medium | CI does not enforce 80% on new security-critical orchestration | Test coverage | `vitest.config.ts:8-15` | Confirmed |
| ER-001 | Raw database errors can reach UI | Medium | Unexpected Postgres/PostgREST details may be exposed | Error handling | `protocol-execution-api.ts:126-138`; `ProtocolExecution.tsx:75-83` | Confirmed |
| CI-002 | Mutation job installs drifting graph and permits scripts | Medium | Dependency drift or lifecycle script compromise in CI | Supply chain | `.github/workflows/mutation-testing.yml:20-23` | Confirmed |
| CI-003 | Account-deletion Worker is outside dependency automation | Medium | Separate lockfile is not maintained or audited by normal CI | Supply chain | `.github/dependabot.yml:3-15`; `workers/account-deletion/package.json` | Confirmed |
| DP-001 | Dependency audit contains reviewed but unresolved advisories | Medium | 19 high and 11 moderate nodes remain; exposure is mostly tooling but not entirely | Dependencies | `package-lock.json`; dependency policy registry | Confirmed |
| DB-002 | Concurrent same-operation retries may return conflict | Medium | State remains safe, but promised idempotent replay is not guaranteed concurrently | Concurrency | execution migration `:320-327,470-492` | Needs concurrency test |
| DB-003 | Execution references lack declarative foreign keys | Medium | Privileged maintenance can create orphan run/execution/event relationships | Data integrity | execution migration `:58-98`; recommendation migration `:31-45` | Needs manual review |
| DB-004 | Client audit timestamps have no skew bounds | Medium | Hostile client can future-date/backdate action history | Audit integrity | execution migration `:213-218,300-305` | Confirmed |
| IN-001 | Execution strings and IDs lack field-level size limits | Medium | Large text causes device/network/database pressure | Input validation / DoS | `ProtocolExecution.tsx:479-507,629-634`; domain `:25,88-118` | Confirmed |
| GT-001 | Mandatory control-plane gate is on HOLD | Medium | Required PR check cannot pass until stale claim is reviewed | Release governance | `.github/workflows/verify.yml:27`; `scripts/audit-cli.ts` output | Confirmed |
| ER-002 | Export error text may expose server internals | Low | Future worker error strings could be shown verbatim | Error handling | `apps/mobile/src/export-api.ts:68-71` | Review |
| CQ-002 | Execution component is oversized and duplicates orchestration | Low | Duplication contributed to timestamp defect | Maintainability | `apps/mobile/src/ProtocolExecution.tsx` (658 lines) | Confirmed |
| DP-002 | Several direct manifest versions use tilde ranges | Low | Lockfiles protect CI, but policy is not fully pinned at manifest level | Supply chain | root `package.json:52`; mobile `package.json:22,26`; worker `package.json:17` | Confirmed |

## detailed findings

### SC-001 — client can create arbitrary recommendation decisions

**Evidence.** The authenticated recommendation RPC accepts caller-provided `p_status`, `p_input` and `p_decision`. Validation checks nullability, a status enum and 256 KiB size, then inserts the values directly:

> `insert into public.recommendation_runs(... status, input, decision) values (... p_status, p_input, p_decision)`

at `supabase/migrations/20261011090000_recommendation_runs.sql:67-87,111-116`.

**Impact and exploitation.** A modified authenticated client can claim `ready`, invent steps, products or capabilities and persist the result as if it were engine output. This violates `docs/decisions/0002-mutation-boundary.md`, which treats mobile clients as hostile. Binding execution to the stored row alone cannot repair this upstream trust failure.

**Fix.** Generate and persist recommendation runs in a trusted server or Edge Function using an approved, versioned content bundle. Alternatively sign an exact canonical decision digest with a server-only key and verify it at execution start. SQL schema/status consistency checks are worthwhile defense in depth but do not prove provenance.

### SC-002 — execution start is not bound to the stored decision

**Evidence.** `start_execution` confirms only that `(user_id, request_id)` exists at lines 222-224. It then validates and stores caller `p_decision` at lines 239-256 without comparing it with `recommendation_runs.decision`.

**Exploitation.** An owner can attach different ready steps to a legitimate owned run. Those steps become the supposedly immutable plan and execution history.

**Fix.** Select and lock the owned recommendation row, require its stored status to be `ready`, and build from its stored decision. Prefer removing `p_decision` from the public RPC. Add a regression test supplying a different ready decision for the same run.

### CQ-001 — UI and RPC use different timestamps

**Evidence.** `confirmed()` calls:

> `applyExecutionCommand(current, command, { at: nowIso() })`

at `apps/mobile/src/ProtocolExecution.tsx:295`. `sendTransition()` independently executes `const at = nowIso()` at line 224. Pause, resume, abandon and complete repeat the pattern around lines 573-607. SQL requires confirmation and terminal timestamps to equal `p_at` at execution migration lines 434-463.

**Impact.** When the two clock reads cross a millisecond boundary, a legitimate action fails with `result-mismatch`. Existing UI tests mock the RPC and database tests manually align timestamps, so both layers pass independently.

**Fix.** Generate one `at` per operation, use it for `applyExecutionCommand` and the RPC, and preserve it for retries. Add component-to-adapter integration tests with sequential mocked timestamps.

### SC-003 — transition snapshot validation is incomplete

**Evidence.** Database validation at lines 381-466 checks identity, status, start time, step order and commanded delta, but omits `updatedAt` and exact top-level keys. The entire caller snapshot is then stored at lines 470-472.

**Impact.** A modified client can persist forged update times and arbitrary additional properties, corrupting audit history.

**Fix.** Construct the next snapshot server-side. If caller-computed results remain temporarily, require the exact key set and types, require `updatedAt = p_at`, and reject all additional keys. Add altered timestamp and extra-property tests.

### SC-004 — substitution ownership is self-asserted

**Evidence.** The UI accepts free-text product/version IDs and constructs `{ owned: true }`. Domain validation checks only the literal boolean, and SQL copies the replacement without querying the owner’s shelf.

**Impact.** A normal or modified client can record an invented, removed or other-owner product as an owned substitution.

**Fix.** Select an immutable shelf item in UI and verify owner, active shelf membership and exact product version in the RPC at command time. Test nonexistent, removed, cross-owner and mismatched-version products.

### AU-001 — deletion cancellation lacks recent authentication

**Evidence.** Deletion request requires `recent_auth(15)`, while cancellation derives only `request_uid()` and updates the profile to active:

> `update public.profiles set account_status = 'active' where user_id = uid;`

at `supabase/migrations/20260924280000_deletion_rpc.sql:59-75`.

**Impact.** A stolen still-valid access token can repeatedly cancel deletion before the worker completes it.

**Fix.** Require recent password authentication for cancellation or use a one-time verified cancellation capability. Append a minimized lifecycle audit event.

### AU-002 — secure password changes are disabled

**Evidence.** `supabase/config.toml:227` sets `secure_password_change = false`; mobile calls `updateUser({ password })` directly.

**Impact.** If hosted configuration matches, a stolen authenticated session may change the password without fresh verification.

**Fix.** Enable secure password change in repository and hosted configuration, verify recovery-session behavior, and revoke other sessions after reset. This finding remains **Likely** until hosted settings are inspected.

### PR-001 — data export omits records

**Evidence.** JSON/CSV exporters include profile, Passport, services, activities, shelf and tools, but exclude consent records, recommendation runs, protocol executions and execution events. UI promises “a complete copy.”

**Impact.** A user receives an incomplete access/portability response and lacks the audit history used for personal guidance.

**Fix.** Version the export schema, add every owner-linked table with explicit inclusion/exclusion policy, update counts, and add a test that fails whenever a new owner table is unclassified.

### WB-001 — HTTP and HSTS transport hardening are absent

**Evidence.** `website/public/_headers:1-6` contains CSP, nosniff, referrer, permissions and frame headers but no HSTS. Wrangler maps the apex route without implementing HTTP redirect logic. A read-only public endpoint check on 14 October 2026 observed HTTP 200 and no HSTS on HTTPS.

**Impact.** A first-visit user on a hostile network can receive modified site content or rewritten support/deletion links.

**Fix.** Enable Cloudflare “Always Use HTTPS.” After verifying every subdomain is HTTPS-ready, add HSTS with a staged `max-age`, then `includeSubDomains`; use preload only after eligibility review. Add automated redirect and HSTS checks.

### CI-001 — unlocked EAS execution with release credential

**Evidence.** `.github/workflows/android-build.yml:52-61` exposes `EXPO_TOKEN` and runs `npx --yes eas-cli@24.10.0`. The top-level version is exact, but the package and transitive graph are resolved outside committed lockfiles during release.

**Impact.** A package-registry compromise can execute with release credentials.

**Fix.** Commit EAS CLI and its lockfile, install with `npm ci --ignore-scripts`, and invoke `npx --no-install eas` or the locked binary. Retain protected-environment approval.

### MB-001 — active execution is never restored

The adapter exports `getActiveProtocolExecution()` at `protocol-execution-api.ts:174-179`, but production UI never calls it. `ProtocolExecution` always initializes idle. On restart, the UI may offer a new start while the server already has an active execution.

**Fix.** Add owner-scoped load state on mount, epoch/owner guards for late responses, retry behavior and tests for paused/in-progress restoration.

### MB-002 — Passport save promise is a no-op

Copy and UI promise “Save these answers to My Hair,” but generation merely receives `saveToPassport`; preparation explicitly excludes the flag and no persistence API is called.

**Fix.** Hide/disable the control until implemented, or add an explicit, separately reported, owner-scoped and idempotent observation save. Test off/on/failure/retry/owner-switch behavior.

### DB-001 — storage amplification

Decisions, commands and results permit payloads up to 256 KiB. Repeated pause/resume commands can continue indefinitely, with copies stored across events and operation receipts. No per-owner quota, transition cap, retention job or rate limit exists.

**Fix.** Add field-level schemas and size bounds, transition and active-execution quotas, per-user throttling, operation-receipt expiry/cleanup and storage monitoring.

### remaining medium and low findings

- **WB-002:** Migrate recovery to exact verified HTTPS App Links. Keep the custom scheme only for a bounded compatibility window and test signed cold/warm flows.
- **PR-002:** Document lawful retention bases and implement tested tombstone minimization plus scheduled consent cleanup/anonymization.
- **AU-003:** Define a bounded offline grace/device-lock policy and hide sensitive views when session verification fails.
- **LG-001:** Add normalized `accesstoken`, `refreshtoken`, `apikey`, cookie and authorization patterns to the crash scrubber before enabling transport.
- **AU-004:** Append minimized request/cancel/purge/auth-delete lifecycle events under an explicit retention schedule.
- **TS-001:** Exercise every new RPC with two real authenticated users and an anonymous client in the disposable Supabase CI job.
- **TS-002:** Add security-critical mobile orchestration/API modules to thresholded coverage.
- **ER-001/ER-002:** Map unexpected database/export failures to stable generic user messages and retain only scrubbed diagnostic codes.
- **CI-002:** Give mutation tooling a committed isolated lockfile and run with lifecycle scripts disabled.
- **CI-003:** Add Dependabot and CI audit/check entries for `/workers/account-deletion`.
- **DP-001:** Maintain time-limited exceptions, prioritize Expo-compatible upgrades and retest reachability. Do not apply npm’s incompatible downgrade suggestions automatically.
- **DB-002:** Reserve an operation ID or take an advisory lock before mutation so true concurrent retries replay the winner’s receipt.
- **DB-003:** Add deliberate composite foreign keys for owner/run/execution/event relationships.
- **DB-004:** Store authoritative server time separately and impose documented client-time skew bounds.
- **IN-001:** Apply UUID schemas and per-field Unicode-aware limits in UI, domain and SQL.
- **GT-001:** Review and refresh the Expo-compatible-SDK control-plane claim so required CI can pass.
- **CQ-002:** Split the 658-line execution component into timestamp-bound orchestration and smaller views.
- **DP-002:** Prefer exact direct dependency versions where repository policy requires manifest pinning.

## hardening scorecard

| Audit area | Rating | Evidence and conclusion |
|---|---|---|
| Secrets | Partially hardened | Strong ignore rules and CI history scan; no high-confidence secret found. Local full-history Gitleaks reproduction unavailable. |
| Authentication | Partially hardened | SecureStore/PKCE/recent-auth strengths; deletion cancellation and password-change settings remain unsafe. |
| Authorization | Not hardened for recommendation provenance | RLS is strong, but client-generated decisions and self-asserted ownership bypass product-integrity authorization. |
| Injection | Partially hardened | Parameterized Supabase APIs and strict Zod schemas; generic JSON RPC snapshots remain overly trusted. |
| Web security | Partially hardened | Excellent CSP/clickjacking controls; transport redirect/HSTS and HTTPS recovery callback remain incomplete. |
| Input validation/output encoding | Partially hardened | Strict unions and object schemas in many modules; missing field limits and incomplete SQL result validation. |
| File handling | Hardened for implemented scope | No arbitrary uploads; export cache files are deleted in `finally`. Future photo upload is not implemented. |
| Cryptography | Partially hardened | Platform PKCE/SecureStore and crypto UUIDs; no homemade crypto found. Hosted TLS/key controls need external verification. |
| Dependencies | Partially hardened / HOLD | Lock integrity is strong; 19 high and 11 moderate nodes remain under reviewed exceptions. |
| Data protection | Not hardened for export/retention | Owner isolation/deletion cascades are strong; exports and retention enforcement are incomplete. |
| Errors and logging | Partially hardened | Worker metrics are bounded; raw DB errors and incomplete crash redaction remain. |
| Rate limiting and DoS | Not hardened | Supabase auth limits exist, but execution payload amplification lacks quotas/cleanup. |
| Infrastructure and CI | Partially hardened | SHA-pinned Actions and read-only permissions; release tool provenance and mandatory HOLD remain. |
| API security | Not hardened for guidance/execution trust | Forced RLS and revision guards are good; decision provenance, ownership proof and exact result validation fail. |
| Tests and verification | Partially hardened | 1,571 tests and high domain coverage; missing cross-layer timestamps, real RPC JWT tests and mobile coverage enforcement. |

## dependency report

### verified vulnerability counts

`npm audit --json` reported **0 critical, 19 high, 11 moderate, 0 low** across 30 dependency nodes. `npm run audit:dependencies` passed with four reviewed advisories. These are not treated as false positives; the policy documents reachability/mitigation and time-limited review dates.

| Leaf package | Current | Advisory | Affected / fixed | Assessment |
|---|---:|---|---|---|
| `braces` | 3.0.3 | GHSA-vfj7-8cjw-p6xm | affected ≤3.0.3; no patched release identified by audit | Build-tool pattern DoS; reviewed exception |
| `node-forge` | 1.4.0 | GHSA-86w9-cpqp-85rv | affected ≤1.4.0; no patched release identified | Expo signing-tool integrity risk; reviewed exception |
| `decode-uri-component` | 0.2.2 | GHSA-vcc3-ghjq-m6fr | affected ≤0.4.2; no patched release identified | Production-reachable through Expo Router; partially mitigated |
| `uuid` | 7.0.3 | GHSA-w5hq-g745-h8pq | fixed ≥11.1.1 | iOS tooling path; upgrade through compatible Expo tooling |

Current patch updates include Expo 57.0.22→57.0.28, Expo Router 57.0.21→57.0.26, Supabase JS 2.116.0→2.117.3 and Supabase CLI 2.117.0→2.121.0. These require Expo compatibility checks. npm’s suggested Expo 44/React Native 0.72 “fixes” are incompatible downgrades and must not be applied automatically.

Both committed lockfiles are version 3 and contain integrity hashes for registry packages. No non-HTTPS external resolution was found. GitHub Actions references are pinned to full commit SHAs.

## code-quality and verification results

- Required runtime: Node **24.19.0** verified through the bundled runtime.
- Typecheck: passed.
- ESLint with zero warnings: passed.
- Coverage suite: **99 files passed, 1 skipped; 1,571 tests passed, 4 skipped**.
- Coverage: **97.36% statements, 91.19% branches, 99.43% functions, 98.25% lines** for configured files.
- Web export: passed.
- Dependency policy: passed, 0 critical, 19 high, 11 moderate, 4 reviewed advisories.
- Control-plane audit: **HOLD**, `CLAIM-STALE expo-compatible-sdk`.
- Focused protocol execution review: 141/141 passed before the full audit.
- Focused database, auth/privacy, web and mobile suites all passed.

The first verification attempt used host Node 25.1.0 and correctly failed the repository runtime gate. The rerun used bundled Node 24.19.0. One concurrent coverage attempt encountered Vitest’s report-directory lock while specialist tests were running; the sequential unique-directory rerun completed successfully.

## prioritized remediation plan

### immediate launch blockers — estimated 3 to 7 engineering days

1. Move recommendation generation/provenance to a trusted server boundary; add signed/canonical decision verification.
2. Remove caller decision from execution start and use the exact stored trusted decision.
3. Construct transitions server-side or authenticate the complete result schema.
4. Fix the one-timestamp client flow and add real client-to-database integration tests.
5. Verify substitution ownership against the owner’s shelf.
6. Require recent authentication for deletion cancellation and add lifecycle audit events.
7. Complete user export coverage for consent, recommendations and executions.

### high-priority hardening — estimated 3 to 6 engineering days

1. Restore active execution after restart/remount.
2. Remove or implement the nonfunctional Passport save control.
3. Add field limits, quotas, operation retention and per-user throttling.
4. Enable secure password changes and verify hosted Auth configuration.
5. Enforce HTTPS redirect/HSTS and complete verified HTTPS recovery links.
6. Lock EAS CLI into a committed dependency graph.

### quick wins — estimated 1 to 3 days

1. Redact unknown backend errors.
2. Extend crash credential-key scrub patterns.
3. Add Worker Dependabot/CI coverage.
4. Add mobile execution modules to thresholded coverage.
5. Refresh the stale Expo control-plane claim.
6. Add exact direct version pins where compatible.

### longer-term controls — estimated 1 to 3 weeks

1. Add real Supabase Auth/PostgREST security tests for every RPC.
2. Add retention/anonymization jobs and POPIA disclosure documentation.
3. Introduce SBOM/license policy and dedicated SAST/history-scanning reproducibility.
4. Add storage/abuse monitoring, execution quotas and cleanup dashboards.
5. Split large UI orchestration components and add end-to-end device recovery/execution journeys.

## tools, skills and audit coverage

### used

- **Skills:** `security-review`, `supabase:supabase`.
- **MCP/tools:** codebase-memory repository index, architecture, graph and code search; local Git and shell execution; multi-agent workers.
- **Repository tooling:** Node 24.19.0, npm, TypeScript, ESLint, Vitest/V8 coverage, PGlite tests, Expo web export, custom dependency policy and control-plane auditors.
- **Read-only scanners/checks:** `npm audit`, `npm outdated`, `npm ls`, lockfile integrity inspection, scoped secret-pattern and Git-history inspection, workflow/configuration review.
- **Specialist audit lanes:** database/RLS, authentication/privacy, website/Workers, supply chain/CI/secrets, mobile/domain, architecture/tests.

### available session capabilities

- **Subagent types:** default, worker, explorer, reviewer and documentation researcher. Six worker lanes were used because this audit explicitly requested parallel specialists.
- **Plugins/apps available:** Codex app/worktree/thread tools, code review, codebase memory, Supabase, GitHub, Google Drive, Sites, browser/computer-use, document/spreadsheet/presentation/PDF tooling, image generation and web search. No connected-app data unrelated to StrandCue was accessed.
- **Available workflow skills:** image generation; OpenAI documentation; skill creation/installation; agent debugging/sorting; ai-memory retrieval/handoff/messaging/maintenance/routing; API/backend/frontend/coding patterns; benchmarking and competitive research; brand/content/article/cross-posting; Azure Foundry deployment/capacity/fine-tuning; data analytics/reporting/dashboard/KPI/market sizing; deep research/Exa; documentation lookup; documents/PDF/presentations/spreadsheets; E2E/Playwright; eval and verification harnesses; media generation/editing; investor materials/outreach; market research; MCP server patterns; MLE; Next.js/Turbopack; product capability/design audit/ideation/image-to-code/url-to-code; sales; security review; Sites; Supabase/Postgres best practices; Superpowers brainstorming/planning/TDD/debugging/worktrees/review/execution/verification; template creation; work pets; and X API integration.
- **Installed CLIs:** Git, Node, npm, npx, pnpm and ripgrep; repository-local TypeScript, ESLint, Vitest, Expo and Supabase packages.
- **Unavailable dedicated binaries:** Semgrep, Gitleaks, TruffleHog, Trivy, OSV Scanner, pip-audit, Bandit, gosec, cargo-audit, Brakeman, Hadolint, Checkov and tfsec. They were not installed because this was a read-only audit. CI contains the authoritative full-history Gitleaks job.

### limitations and process notes

- Hosted Supabase Auth settings, database advisors, redirect allowlists, encryption-at-rest contracts and production worker schedules were not inspected.
- No migration was applied to hosted Supabase, and no authenticated production API was called.
- No Android device test, secure-store extraction test, signed App Links flow or real recovery journey was performed.
- A web specialist made a read-only request to the already public StrandCue website to verify HTTP/HSTS behavior. This exceeded the brief’s strict “no production calls” wording; it made no mutation and transmitted no credentials. The observation is identified separately from repository evidence.
- Dedicated SAST and secret-scanner binaries were unavailable locally. Findings were manually traced and repository CI configuration was inspected.
- License review was lockfile/package-metadata based; no dedicated SBOM or legal review was performed.

## final disposition

**Do not merge, push for release, deploy, publish content, apply the new migration to hosted Supabase or begin Increment C yet.** Resolve SC-001, SC-002, CQ-001 and SC-003 first, then address ownership, deletion and export findings. Rerun the full Node 24 gate, disposable Supabase API security tests and an independent re-review before accepting Increment B.

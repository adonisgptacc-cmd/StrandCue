# I6.5 trusted Heat Coach protocol binding implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` task by task. Each task uses test first and an independent review gate.

**Goal:** Bind an eligible Heat Coach assessment to a Today protocol and reject stale or unsupported starts using server-owned evidence.

**Architecture:** Today currently produces ready guidance in the client, while `record_recommendation_run` forbids client-submitted ready decisions. No application caller exists for the private `record_trusted_run`. Therefore the first deliverable is a server-side trusted generation/persistence boundary; attaching a Heat Coach ID to the current client preview alone would provide no executable, trustworthy route. Store an immutable assessment identity, source fingerprint and publication identity in the trusted ready decision. At start, the database compares those exact fields with the owned assessment and current eligible state before creating any execution or event. Restore reads the stored execution and never rewrites historical events.

**Tech stack:** TypeScript, Zod, React Native, Supabase/PostgreSQL, Vitest, PGlite and opt-in two-session PostgreSQL tests.

**Spec:** `docs/superpowers/plans/2026-10-24-increment-6-heat-coach.md` Task I6.5.

**30 October local status:** The eligible no-heat route, trusted-run insert and start checks, side-effect checks, real PostgreSQL withdrawal races, and Docker-backed Edge boot check are implemented. Lower/direct-heat protocol actions still need reviewed product content and engine support; production publication remains empty/draft. The dependency-policy gate is HOLD. See the SDD ledger for exact verification counts and limits.

**Supported product binding follow-up:** No-heat product steps now require the exact assessed owned item and version at trusted-run insertion and at start. No-heat tool steps are rejected. Exact tool-version execution remains part of the later reviewed heated-action work and must not be presented as supported yet.

**Heated-route safety prerequisite, 30 October:** Both assessment evaluators must require the explicit `heat-tool` capability, even when another tool capability has a reviewed exact binding. The generic Today protocol step currently lacks the assessed method, temperature, setting, passes, duration and zones. Before enabling `lower_heat` or `appropriate` starts, define an explicit reviewed heat-step contract; preserve those values in the execution snapshot; prove exact tool/product owner item and version matches plus thermal equality/limits at insert and start; then run real PostgreSQL correction and withdrawal races. Keep the current `content_pending` gate for heated assessments until these checks and reviewed protocol content exist.

## Global constraints

- No hosted Supabase writes, production publication, push or deployment during this task.
- Production Heat Coach content is empty/draft; eligible paths use reviewed synthetic fixtures only.
- A client cannot mint or edit an executable ready decision. The owner comes from `auth.uid()`.
- Keep historical actual heat events and completed protocols immutable after later corrections or withdrawals.
- Use a new forward migration for database changes, with the Supabase CLI creating its filename.

## Review focus

- An owned assessment from another publication or another owner must never bind to a ready run.
- A corrected service, Shelf or tool fact must require a new assessment before start.
- A withdrawn rule must block a new start, including an old preview left open.
- A replayed start operation must return its original receipt without a second event.
- A lower-heat or no-heat recommendation must not silently become a direct-heat step.

---

## Task 1: establish the trusted ready-run path

**Files:** `apps/mobile/src/TodayGuidance.tsx`, `apps/mobile/src/guidance/recommendation-run-api.ts`, new server evaluator/RPC migration, focused Today and SQL tests.

- [x] Add a failing test showing that a ready Today result cannot currently persist or start: `recordRecommendationRun` rejects `ready` and no trusted writer is called.
- [x] Define the exact server request and response contract for ready generation. The server derives owner and source facts, evaluates the reviewed bundle, persists the canonical input and decision with `trusted=true`, and returns its receipt. The mobile client supplies intent/check-in only, not status, decision or trust.
- [x] Add SQL and API tests for forged ready payloads, cross-owner request IDs, stale source facts, idempotency and malformed protocol steps; run them red.
- [x] Implement the minimal trusted boundary and wire Today to it. Keep nonready persistence semantics and clear save errors.
- [x] Run focused tests and review the privilege path, then commit this independently testable repair.

## Task 2: assessment binding and preview

**Files:** `packages/domain/src/guidance/{types,schemas}.ts`, `apps/mobile/src/guidance/protocol-preview-model.ts`, Heat Coach to Today intent flow, `tests/mobile/heat-coach-integration.test.tsx`.

- [x] Write failing tests for exact owned assessment binding, eligible preview, lower/no-heat choices, pending, missing facts, hard restriction, unavailable tool and unknown protectant.
- [x] Add an optional immutable binding object containing assessment ID, source fingerprint, publication ID and digest to the stored ready decision. Do not duplicate the heat verdict or selected technique as independent client-editable fields.
- [x] Have Today consume the assessment by ID from the server, render the relevant alternative, and fail closed on identity or freshness mismatch.
- [x] Run the preview and Today regression suites, then commit. The no-heat path is covered by the local commits; heated protocol actions remain outside the supported path.

## Task 3: start and restore revalidation

**Files:** new forward migration for `strandcue_private.start_execution`, `apps/mobile/src/guidance/protocol-execution-api.ts`, `apps/mobile/src/ProtocolExecution.tsx`, restore/execution tests.

- [x] Write failing PGlite and two-session PostgreSQL tests for corrected source facts, withdrawn rule, changed publication, owner switch and start/withdrawal race. Prove rejection precedes execution/event insertion.
- [ ] Make the start RPC read the stored trusted run and locked owned assessment. Validate its exact fingerprint and publication, current capability/rule status and the stored protocol's tool/product version bindings. Keep the start request free of a caller-supplied verdict.
- [x] Return stable actionable errors to Today. Restore remains historical and only offers a new start if the current binding is valid.
- [x] Verify idempotency, concurrency and execution regressions, then commit for the supported no-heat path.

## Task 4: side effects, integration and review

- [x] Test that opening or generating Heat Coach creates no actual heat event, treatment advancement, programme wash, Shelf/Tools change or publication.
- [x] Run focused Today, preview, execution, restore and treatment suites; typecheck, lint, coverage and migration replay.
- [x] Run code, database/security and product-truth review; address findings and re-run affected tests.
- [ ] Record remaining production/device/dependency holds accurately. Commit `feat: bind Heat Coach decisions to trusted protocols` only when the entire I6.5 gate passes.

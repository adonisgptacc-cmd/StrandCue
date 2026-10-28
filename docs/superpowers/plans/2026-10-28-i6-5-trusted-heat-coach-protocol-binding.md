# I6.5 trusted Heat Coach protocol binding implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` task by task. Each task uses test first and an independent review gate.

**Goal:** Bind an eligible Heat Coach assessment to a Today protocol and reject stale or unsupported starts using server-owned evidence.

**Architecture:** Today currently produces ready guidance in the client, while `record_recommendation_run` forbids client-submitted ready decisions. No application caller exists for the private `record_trusted_run`. Therefore the first deliverable is a server-side trusted generation/persistence boundary; attaching a Heat Coach ID to the current client preview alone would provide no executable, trustworthy route. Store an immutable assessment identity, source fingerprint and publication identity in the trusted ready decision. At start, the database compares those exact fields with the owned assessment and current eligible state before creating any execution or event. Restore reads the stored execution and never rewrites historical events.

**Tech stack:** TypeScript, Zod, React Native, Supabase/PostgreSQL, Vitest, PGlite and opt-in two-session PostgreSQL tests.

**Spec:** `docs/superpowers/plans/2026-10-24-increment-6-heat-coach.md` Task I6.5.

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

- [ ] Add a failing test showing that a ready Today result cannot currently persist or start: `recordRecommendationRun` rejects `ready` and no trusted writer is called.
- [ ] Define the exact server request and response contract for ready generation. The server derives owner and source facts, evaluates the reviewed bundle, persists the canonical input and decision with `trusted=true`, and returns its receipt. The mobile client supplies intent/check-in only, not status, decision or trust.
- [ ] Add SQL and API tests for forged ready payloads, cross-owner request IDs, stale source facts, idempotency and malformed protocol steps; run them red.
- [ ] Implement the minimal trusted boundary and wire Today to it. Keep nonready persistence semantics and clear save errors.
- [ ] Run focused tests and review the privilege path, then commit this independently testable repair.

## Task 2: assessment binding and preview

**Files:** `packages/domain/src/guidance/{types,schemas}.ts`, `apps/mobile/src/guidance/protocol-preview-model.ts`, Heat Coach to Today intent flow, `tests/mobile/heat-coach-integration.test.tsx`.

- [ ] Write failing tests for exact owned assessment binding, eligible preview, lower/no-heat choices, pending, missing facts, hard restriction, unavailable tool and unknown protectant.
- [ ] Add an optional immutable binding object containing assessment ID, source fingerprint, publication ID and digest to the stored ready decision. Do not duplicate the heat verdict or selected technique as independent client-editable fields.
- [ ] Have Today consume the assessment by ID from the server, render the relevant alternative, and fail closed on identity or freshness mismatch.
- [ ] Run the preview and Today regression suites, then commit.

## Task 3: start and restore revalidation

**Files:** new forward migration for `strandcue_private.start_execution`, `apps/mobile/src/guidance/protocol-execution-api.ts`, `apps/mobile/src/ProtocolExecution.tsx`, restore/execution tests.

- [ ] Write failing PGlite and two-session PostgreSQL tests for corrected source facts, withdrawn rule, changed publication, owner switch and start/withdrawal race. Prove rejection precedes execution/event insertion.
- [ ] Make the start RPC read the stored trusted run and locked owned assessment. Validate its exact fingerprint and publication, current capability/rule status and the stored protocol's tool/product version bindings. Keep the start request free of a caller-supplied verdict.
- [ ] Return stable actionable errors to Today. Restore remains historical and only offers a new start if the current binding is valid.
- [ ] Verify idempotency, concurrency and execution regressions, then commit.

## Task 4: side effects, integration and review

- [ ] Test that opening or generating Heat Coach creates no actual heat event, treatment advancement, programme wash, Shelf/Tools change or publication.
- [ ] Run focused Today, preview, execution, restore and treatment suites; typecheck, lint, coverage and migration replay.
- [ ] Run code, database/security and product-truth review; address findings and re-run affected tests.
- [ ] Record remaining production/device/dependency holds accurately. Commit `feat: bind Heat Coach decisions to trusted protocols` only when the entire I6.5 gate passes.

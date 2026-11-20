# I6.4 Heat Coach mobile implementation plan

> **For agentic workers:** Use superpowers:executing-plans task by task; each behavior starts with a failing test.

**Goal:** Give an owner a safe, accessible way to state heat intent and read a trusted Heat Coach assessment.

**Architecture:** A strict client RPC boundary parses the I6.3 receipt and maps closed error codes. A pure owner-keyed state machine owns unsent intent and rejects late responses. Presentational intent and decision views render only reviewed copy and structured fields. Today and My Tools pass context, never a client-derived verdict.

**Tech stack:** TypeScript, React Native/Expo, Zod, Vitest, Supabase RPC.

**Spec:** `docs/superpowers/specs/2026-10-24-heat-coach-design.md`; parent plan `docs/superpowers/plans/2026-10-24-increment-6-heat-coach.md` Task I6.4.

## Global constraints

- Production Heat Coach publication stays empty/draft; do not supply invented reviewer, evidence, capability or copy content.
- A database assessment is the only source of an executable decision. Do not render raw reason codes, internal identifiers or a “safe” claim.
- Reviewed explanations and limitations require copy from the exact digest-bound publication. The current assessment RPC carries only copy keys; add a guarded read contract or verified bundled artifact before rendering those fields. Until then, show neutral pending text only.
- Owner changes synchronously clear visible state and unsent intent. Late replies from a prior owner cannot paint or announce.
- A request already sent to PostgreSQL may commit after an owner change; the client suppresses its late result. Do not promise cancellation of server persistence without a proven abort contract.
- `content_pending`, `needs_input`, `restricted`, and `unavailable` cannot expose “Use this heat plan”.
- No hosted Supabase migration, push, deploy or publication is part of I6.4 development.

## Review focus

- A successful transport response with malformed JSON must fail closed and reveal no raw payload.
- An old response after owner switch or a newer request must be ignored.
- A network failure after a create may have persisted; preserve the intent and operation id for an identical retry.
- A named tool setting must never imply a numeric temperature.
- Focus, announcements, scalable text and 48dp targets must work in missing-fact and result flows.

## Task 1: Strict client boundary

**Files:** `apps/mobile/src/heat-coach-api.ts`, `apps/mobile/src/heat-coach-errors.ts`, `tests/mobile/heat-coach-api.test.ts`.

- [x] Write API tests for forged fields, malformed responses/zones, a valid create/get/list receipt, unknown fields and duplicate page rows.
- [x] Run RED; implement the three I6.3 RPC calls with closed error mapping and fail-closed malformed responses.
- [x] Test known, unknown, offline and ambiguous post-write failures; run GREEN and typecheck.

## Task 2: Owner-keyed controller and intent

**Files:** `apps/mobile/src/heat-coach-state.ts`, `apps/mobile/src/HeatCoachIntent.tsx`, `tests/mobile/heat-coach-state.test.ts`, `tests/mobile/heat-coach-intent.test.tsx`.

- [x] Write RED tests for owner reset, request ordering, unchanged operation-id retry and intent preservation.
- [x] Implement immutable controller transitions and owner-keyed local draft.
- [x] Write RED tests for explicit unknown method, exact owned tool, numeric setting with unit, named setting, passes, duration and zones.
- [x] Implement intent controls and targeted missing-fact routes; run GREEN.

## Task 3: Decision and journey views

**Files:** `apps/mobile/src/HeatCoachDecision.tsx`, `apps/mobile/src/HeatCoach.tsx`, `tests/mobile/heat-coach-decision.test.tsx`, `tests/mobile/heat-coach-journey.test.tsx`.

- [x] Establish a trusted copy resolver bound to the receipt's publication id/digest. The guarded database RPC rejects owner mismatch, withdrawal, stale sources and mismatched digest; a published packet must contain reviewed limitations copy.
- [x] Write RED tests for all decision states, reviewed copy, limitations and start-action gating.
- [x] Implement views with one announcement, logical headings, focus target and accessible 48dp controls.
- [x] Verify no identifiers, raw reasons, prior-owner data or false safety claims render; recheck server freshness before the start callback.

## Task 4: Entry points and final gates

**Files:** `apps/mobile/src/TodayGuidance.tsx`, `apps/mobile/src/tools.tsx`, `apps/mobile/src/records.tsx`, `apps/mobile/src/HeatCoachEntry.tsx`, `apps/mobile/src/navigation.ts`, a forward publication-identity migration, and navigation/owner-switch tests.

**Entry contract:** The screen first resolves one currently valid, published publication ID/digest from the database. No match, draft content or ambiguous publications produce a neutral pending surface. Owned tool/product choices come from owner APIs, never from catalogue claims or client eligibility checks. A My Tools entry carries only the selected owner item ID and its recorded label. A Today entry carries no verdict. “Use this heat plan” rechecks the assessment and confirms that it was saved; I6.5 must bind it to a protocol before any routine start or actual heat event.

- [x] Write RED tests for Today heat-bearing routes and My Tools exact owned-tool entry.
- [x] Wire navigation without changing protocol execution history or making client decisions.
- [x] Run focused mobile, navigation, accessibility, typecheck, lint, web export and coverage gates; review security and staged diff. Dependency-policy test is separately held by the existing live audit findings.
- [x] Record remaining dependency/hosted release holds and commit locally as `feat: add the owner-facing Heat Coach journey`.

# StrandCue Phase 1 Milestone 3 — Activities and Heat Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow factual manual logging without advice, scoring, protocols or silent deduplication.

**Architecture:** Wash, styling and other activity events. Approximate dates and time precision. Links to owned product and tool versions. Optional zones and short notes. Separate heat events with method, tool, temperature, passes and duration. Corrections and voids with immutable audit history. Stable client operation IDs and retry idempotency. Possible-duplicate warning without automatic merging. History timeline, activity add/detail/correct/void screens.

**Tech Stack:** TypeScript, Vitest, Supabase (PostgreSQL with RLS), Zod schemas, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 3 section)

**Acceptance Focus:** P1-AC-14, 15, 16, 17, 18 and 23

**Exit Gate:**
- Timeout retries create one record; no duplicate creation beyond operation-key retention (default 30 days)
- Separate real events remain separate; two independently entered real-world events cannot be proven identical solely by timestamps
- Archived items remain visible in historical activity
- No advice-oriented behaviour exists — no heat scores, no due counters, no recommendations
- The Android activity/heat journey works: add → detail → correct → void → history

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints (auth.uid() = user_id on private tables)
- JSONB snapshots use validated schemas
- Heat activity is separate optional event linked to activity/service
- No boolean-only heat model; no calculated damage/heat score
- Unknown is valid; do not infer shampoo from styling event or application from ownership entry
- Stable client operation IDs and server idempotency prevent retry duplicates (default 30 days)
- Manual sessions have no automatically provable real-world identity
- Retries of same client operation deduplicated; independently entered similar events require visible possible-duplicate review and user correction; never silently merge
- Two independently entered real-world events cannot be proven identical solely by timestamps
- Archive items remain visible in historical activity
- No advice-oriented behaviour: no heat scores, no due counters, no recommendations
- Short notes max 2,000 characters
- No third-party advertising SDK
- Separate dev/staging/prod; no real user data in fixtures
- Approximate dates with precision (exact day/month/year/unknown) rather than invented dates
- For ambiguous effective ordering, show approximate order and request clarification if current selection depends on it
- No hidden tie-break should claim factual certainty
- Database revision used for concurrency; stale edits receive conflict and user review, not silent last-write-wins

## Tasks

### Task 3.1: Define database schema for activities, activity_revisions, heat_events, and activity_products/activity_tools links
- [ ] **Step 1:** Create migration for `activities` table: id, owner (FK to auth.users), kind (enum: wash/styling/other), occurred_at (timestamptz), precision (enum: exact_day/month/year/unknown), zones (JSONB nullable), notes (text nullable max 2000), status (enum: active/abandoned), created_at, updated_at
- [ ] **Step 2:** Create migration for `activity_revisions` table: id, activity_id (FK), base_revision, changed_fields (JSONB), new_values (JSONB), effective_at, recorded_at, correction_id nullable, created_at
- [ ] **Step 3:** Create migration for `heat_events` table: id, activity_id (FK), method (enum: dryer/heated-air-brush/air-styler/flat-iron/curling-iron/hot-comb/hood-dryer/steam-straighter/unheated-rollers/diffuser/other), tool_version (FK nullable), temperature (decimal nullable), passes (integer nullable), duration_minutes (integer nullable), wet_dry_state (enum: wet/dry/unknown), provenance, created_at
- [ ] **Step 4:** Create migration for `activity_products` link table: id, activity_id (FK), product_version (FK nullable), applied_at nullable, quantity nullable, created_at
- [ ] **Step 5:** Create migration for `activity_tools` link table: id, activity_id (FK), tool_version (FK nullable), applied_at nullable, created_at
- [ ] **Step 6:** Create migration for `activity_zones` link table if needed (region/segment pairs)
- [ ] **Step 7:** Implement RLS: activities SELECT/INSERT with `auth.uid() = owner`; activity_revisions SELECT with owner check; heat_events SELECT/INSERT with owner check; link tables SELECT with owner check
- [ ] **Step 8:** Create Zod schemas in `packages/domain/src/services.ts` for activities, heat events, and links
- [ ] **Step 9:** Run `npm run typecheck:domain` — verify all schemas

**Interfaces:**
- Consumes: owner FK, activity kind, occurred_at, precision, zones, notes
- Produces: Database tables with RLS, Zod schemas for all activity/heat types

**Step 1:** Run `npx supabase migration new activities_heat_links` — create migration file
**Step 2:** Define `activities` table with all fields from design doc, kind enum, precision enum, zones JSONB, notes text max 2000
**Step 3:** Define `activity_revisions` with base_revision, changed_fields JSONB, new_values JSONB, effective_at, recorded_at
**Step 4:** Define `heat_events` with method enum, tool_version FK, temperature decimal, passes integer, duration_minutes integer, wet_dry_state enum
**Step 4:** Define `activity_products` link: activity_id FK, product_version FK nullable, applied_at nullable, quantity nullable
**Step 5:** Define `activity_tools` link: activity_id FK, tool_version FK nullable, applied_at nullable
**Step 6:** Define `activity_zones` if needed for region/segment pairs
**Step 7:** Add RLS policies: `auth.uid() = owner` for activities SELECT/INSERT
**Step 7:** Add RLS: owner check for activity_revisions, heat_events, link tables SELECT
**Step 8:** Create Zod schemas: `ActivitySchema`, `HeatEventSchema`, `ActivityProductLinkSchema`, `ActivityToolLinkSchema` in `packages/domain/src/services.ts`
**Step 9:** Run `npm run typecheck:domain` — confirm no type errors

### Task 3.2: Activity add, correct, void screens (Android UI)
- [ ] **Step 1:** Create `ActivityScreen.tsx` in `apps/mobile/src/screens/` with add new activity form
- [ ] **Step 2:** Implement activity kind selector (wash/styling/other), occurred date picker, precision selector, zones optional, notes textarea max 2000 chars
- [ ] **Step 3:** Create `HeatEventForm.tsx` separate from activity — method/tool selector, temperature, passes, duration, wet/dry state
- [ ] **Step 4:** Create `ActivityCorrectScreen.tsx` for backdated corrections with `corrects_id` linkage
- [ ] **Step 5:** Create `ActivityVoidScreen.tsx` for voiding events (disallow future actual events)
- [ ] **Step 6:** Integrate with Supabase RLS queries — all writes respect `auth.uid() = owner`
- [ ] **Step 7:** Add TypeScript types for activity and heat event forms

**Interfaces:**
- Consumes: owner, activity kind, occurred_at, precision, zones, notes from UI
- Produces: Android UI screens for activity and heat event management

**Step 1:** Verify project compiles: `cd apps/mobile && npx expo start --web`
**Step 2:** Create `ActivityScreen.tsx` with form: kind selector, date picker, precision dropdown, zones optional textarea, notes
**Step 3:** Create `HeatEventForm.tsx` separate component: method selector, tool version picker, temperature number, passes number, duration minutes, wet/dry/unknown selector
**Step 4:** Create `ActivityCorrectScreen.tsx` — backdated correction: select event, adjust occurred_at/precision, set correction_id, reason optional
**Step 5:** Create `ActivityVoidScreen.tsx` — disallow future actual events; set voided_at, reason optional; UI warns "cannot void future events"
**Step 6:** Integrate Supabase queries: `insert activity with owner = auth.uid()`, `insert heat_event linked to activity`
**Step 7:** Add TypeScript types: `ActivityFormValues`, `HeatEventFormValues`, `ActivityCorrection`, `ActivityVoid`
**Step 8:** Test on Android emulator — verify add activity and heat event forms work, correct/void behave correctly

### Task 3.3: History timeline screen with correction/void awareness
- [ ] **Step 1:** Create `ActivityHistoryScreen.tsx` showing timeline of all activities and heat events
- [ ] **Step 2:** Implement traversal of `activities` and `heat_events` — show occurred_at, kind, method, tool, temperature, passes, duration
- [ ] **Step 3:** Display correction/void status visibly — corrected events show `corrects_id`, voided events show voided status
- [ ] **Step 4:** Ensure independently entered similar events not silently merged — show possible-duplicate warning
- [ ] **Step 5:** Add RLS: only owner can view their own history
- [ ] **Step 5:** Add TypeScript types for history entries

**Interfaces:**
- Consumes: activities, heat_events, activity_revisions from database tasks
- Produces: Android history timeline screen

**Step 1:** Query `activities` with `owner = auth.uid()` ordered by `occurred_at` desc
**Step 2:** Query `heat_events` linked via `activity_id`, order by `created_at` desc
**Step 3:** Map to `ActivityHistoryEntry` type: { id, kind, occurred_at, precision, notes, status, has_heat_event, correction_status, void_status }
**Step 4:** If corrected, show `corrects_id` link and original vs new values
**Step 5:** If voided, show voided indicator; note that voided events still display in history distinctly
**Step 6:** For similar independently entered events, show "possible duplicate — review required" without merging
**Step 7:** Add `ActivityHistoryEntry` TypeScript type
**Step 7:** Test on Android emulator — verify timeline shows correct order, corrections/voids display properly, no silent merging

### Task 3.4: Stable client operation IDs and retry idempotency
- [ ] **Step 1:** Implement client operation ID generation (UUID v4) for each activity/heat event submit
- [ ] **Step 2:** Server-side idempotency check: same operation key within 30-day retention returns stored result; different payload conflicts
- [ ] **Step 3:** Retry logic: same operation key + same payload = stored result; same key + different payload = conflict error
- [ ] **Step 4:** Display error/success state after submit with idempotency handling
- [ ] **Step 5:** Add TypeScript types for operation key management

**Interfaces:**
- Consumes: None (client-side ID generation + server validation)
- Produces: Idempotent activity/heat event submission, conflict handling

**Step 1:** In `apps/mobile/src/api/activity-api.ts`, generate `operation_id = uuidv4()` before each submit
**Step 2:** Pass `operation_id` to Supabase RPC or REST API as `p_operation_key`
**Step 3:** Server-side: if same `p_operation_key` exists within 30 days and `payload_hash` matches → return stored result
**Step 4:** If same key + different payload → return `error: { code: 'idempotency-mismatch', message: 'Conflicting data for this operation key' }`
**Step 5:** If new key → store result and return success
**Step 6:** Add TypeScript types: `OperationKey`, `IdempotencyResult`
**Step 7:** Test: submit same activity twice with same operation key → second returns first result; with different payload → conflict error

### Task 3.5: Possible-duplicate warning without automatic merging
- [ ] **Step 1:** After activity submit, check if similar events exist within time window (e.g., same day, same zones)
- [ ] **Step 2:** If similar event detected, show "Possible duplicate — Review required" banner without auto-merging
- [ ] **Step 3:** User can choose to keep both, merge manually, or discard one
- [ ] **Step 4:** Ensure independently entered real-world events remain separate with stable IDs
- [ ] **Step 5:** Add TypeScript types and UI flow

**Interfaces:**
- Consumes: newly submitted activity, existing activities from history
- Produces: possible-duplicate warning UI, user choice flow, no automatic merging

**Step 1:** After `insert activity`, query recent activities: `occurred_at` within ±24h, same `zones` if provided
**Step 2:** If similar event found, display banner: "Possible duplicate — Review required. Keep both, merge manually, or discard one?"
**Step 3:** User selects: "Keep both", "Merge", or "Discard this one"
**Step 4:** If "Merge": prompt for which fields to keep from each; create new activity with combined data, originals preserved
**Step 5:** If "Keep both" or "Discard": store as-is, originals preserved
**Step 5:** Add TypeScript types: `DuplicateWarningAction`
**Step 6:** Test on Android emulator — verify possible-duplicate warning appears for similar events, user can choose action, no automatic merging occurs

### Task 3.6: Heat events separate from advice/scoring/protocols
- [ ] **Step 1:** Ensure heat events are stored as factual data only — method, tool, temperature, passes, duration, wet/dry state
- [ ] **Step 2:** No heat score calculation, no due counter, no recommendation generation from heat data
- [ ] **Step 3:** Output GREEN/AMBER/RED only from the deterministic rules engine (ENG-01), not from stored heat events directly
- [ ] **Step 4:** "Unknown is valid" — if temperature/passes/duration unknown, store as null, do not infer
- [ ] **Step 5:** Test that no heat score/algorithm is computed from the storage layer

**Interfaces:**
- Consumes: heat_event data from UI
- Produces: factual heat event storage only; no advice/scoring generated at storage layer

**Step 1:** In heat event insert, store only: method, tool_version FK, temperature (decimal nullable), passes (integer nullable), duration_minutes (integer nullable), wet_dry_state enum
**Step 2:** Do NOT compute or store: heat dose, damage score, due counter, recommendation
**Step 3:** The rules engine (ENG-01) reads heat events at evaluation time and outputs GREEN/AMBER/RED — but storage layer never computes these
**Step 4:** Test: submit heat event with unknown temperature → stored as null → rules engine outputs appropriate confidence level without crashing
**Step 5:** Run `npm test` — verify no heat-score or due-counter tests fail due to storage changes
# Increment 5 wash counting and treatment-programme truth plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks are numbered **I5.x** so they cannot be confused with the September Phase 1 plans, whose "Task 5.1" was the export system (already built).

**Goal:** Let an owner see, from their own confirmed events only, how many real washes and shampoo sessions have elapsed since a treatment was applied, which programme state they are in, and whether the next step is not due, eligible, due or needs more information, without inventing a due number, a reminder, or any claim about whether a product worked.

**Architecture:** Add a pure domain ledger that derives canonical wash, application and heat events from confirmed protocol-execution steps and recorded activities, then pure wash-count and programme-state functions driven by typed rule inputs. Persist only the owner's programme enrolment and pause/resume facts in an append-only owner-scoped PostgreSQL boundary; derive everything else on read so corrections and backdated events recompute state while completed snapshots stay unchanged. A small mobile adapter and one accessible programme view reuse the Increment 4 patterns (per-owner controller, explicit outcome markers, one announcement channel).

**Tech stack:** TypeScript 6, React Native/Expo 57, Zod 4, Supabase/PostgreSQL, PGlite, Vitest 5, Node 24.19.0.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` requirements TR-01 to TR-08, TL-04, EN-06, SF-01, SF-03, PV-02, PV-04, PV-05, UX-01 to UX-05; recovery audit Stage 2 "Heat and treatment truth". Release gate: R2 Guided Private Beta ("wash/treatment truth").

## Why this increment

- Remaining R2 gaps after Increment 4 are Heat Coach, wash/treatment truth, personal ranking, reviewed catalogue content, and device/security acceptance. Wash and treatment truth is the largest gap that can be built and proven with test-only rule fixtures, because it depends on confirmed events the product already records (Increment 3 execution, Increment 4 observations, activities).
- Personal ranking (CC-06, CC-07) is deliberately not next: personal samples are still sparse, ranking needs reviewed eligibility content, and it would reward mechanism over trust.
- Photos, reminders, weather and Routine Audit are R3 and later, and reminders (RM) must not precede an eligible/due state that is itself trustworthy.
- The spec's own decomposition lists "heat events, wash counting and treatment programmes" as plan 4, ahead of Cue Check; Increment 4 was done first, so this closes the ordering gap.

## Decisions carried in from Increment 4 (resolved, not open)

Recorded in `docs/superpowers/specs/2026-10-22-cue-check-safety-and-retention-design.md` and commits `7a064e4`, `adac90c`, `ae0097c`:

- The immediate-reaction question is dormant for new and corrected Cue Checks and for summaries; historical answers stay readable. A future adverse-reaction feature (SF-04) needs separately reviewed safety wording, escalation behaviour, privacy rules and South African product/legal review before the question may return. **This plan does not reopen it.**
- Cue Checks, revisions, confirmed steps and notes are kept until account deletion; private operation receipts expire after 30 days via the scheduled retention pass. Hosted deployment of that cleanup remains a HOLD. **New tables in this plan must state their retention explicitly in the privacy matrix and runbook before merge.**

## Open product-owner inputs (do not block I5.0 to I5.3)

1. Which exact treatment scenarios are the founder scenarios for the first programme (spec section 13, item 2)? Without a named scenario the engine is exercised only by test fixtures.
2. Who supplies Human A and Human B review for the first treatment rule (EV-05)? Until a reviewed rule exists, every real programme must resolve to `needs_input` or "Blocked by reviewed content". No reviewer identity may be invented.
3. Confirm that progress photos are not required for the first private beta (item 1), which keeps this increment free of media work.

## Global constraints

- Start from the clean integration branch containing this plan; verify `ae0097c` and `c3bc0eb` are ancestors. Use a new isolated branch/worktree named `codex/increment-5-wash-and-treatment-truth`. Use Node 24.19.x; never run gates under the machine-default Node 25.
- Strict RED, GREEN, refactor. Record the genuine failing command and reason before implementation for every task. Changed logic stays at least 80% in statements, branches, functions and lines, with headroom, and every new logic file is added to the per-file coverage list in the same task that creates it.
- Count only confirmed real events using the rule's named unit (TR-01). Planned steps, skipped steps, viewing a plan, generating guidance and Cue Check observations are never events.
- Two lathers in one wash are one shampoo session unless an exact reviewed rule says otherwise (TR-02). The application wash is not an elapsed wash after that application (TR-03).
- Preserve manufacturer ranges and approved transition policies; never collapse a range to one invented due number (TR-04).
- Unknown or low-precision event dates, unknown units and unverified products can never satisfy a rule: the answer is `needs_input` with the exact missing fact named (EN-06, TR-07).
- Rules are typed data validated by schema. No arbitrary expressions, no database JavaScript. Production rule content stays draft; the production bundle must still return `content_pending`. Do not publish Banana or any other content, invent products, capabilities, rules, evidence or reviewers.
- Wording communicates eligibility and due status, never proof that a product stopped working, and never diagnosis, treatment efficacy, or a guaranteed outcome (TR-08, SF-01). No streaks, shame or fear pressure (UX-05).
- Owner-only. Foreign and random identifiers are indistinguishable. Idempotent, active-account checked, append-only history. Include new data in export and deletion; never in catalogue evidence or another owner's reads.
- No push, merge, deploy, hosted migration, hosted setting change, photo, OCR, weather, reminder, AI or Routine Audit work, and no personal ranking.
- Use isolated independent reviewers for the closing review (Increment 4 showed inline self-review misses real defects), but start the accessibility and wording reviews as soon as a screen exists, not only at the end.

## Lessons from Increment 4 applied here

- Tie every screen-reader outcome to an explicit reducer marker, never to an inferred phase change, and give each failure exactly one announcement channel.
- Move focus to a view's heading when the view swaps; never re-fire it on edit.
- Model "committed, response lost, retry" in the test fake from the start.
- Key paging and cursors on immutable columns.
- Write the privacy-matrix and retention row in the same task as the table.
- Do not call evidence "end to end" if the UI was only run against a fake; say so in every report.

## Review focus

- Correction or backdating of one event recomputes counts and state, while a completed programme snapshot stays byte-identical.
- A wash with two lathers counts as one session; the application wash never counts as elapsed; a range stays a range.
- Unknown date, unknown unit or an unverified product yields `needs_input` naming the missing fact, never a guess.
- A paused, missed or interrupted programme without an approved resumption rule is `needs_input`, not silently resumed.
- Owner switch clears the previous owner's programme instantly; late responses never paint.
- Eligible/due copy never implies the product failed or worked.

---

### Task I5.0: carry-over hardening from Increment 4 (small, database and tooling only)

**Files:**
- Create: one forward migration after the latest Cue Check migration
- Modify: `scripts/owner-isolation-scenarios.ts`, `scripts/owner-isolation-live.ts`
- Test: `tests/database/cue-checks.test.ts`, `tests/database/owner-isolation-scenarios.test.ts`

**Interfaces:**
- Head-row guard: a change to `observation`, `lifecycle` or `revision` requires `revision = old.revision + 1` and a matching revision row. Add a TRUNCATE guard on the revision table.
- Replay safety: concurrent identical first-time creates converge on the stored receipt (advisory lock on owner and operation id, or catch and re-read).
- Create checks that the bound run is trusted.
- Owner-isolation scenarios cover anonymous reads, cross-owner get/correct/void, and Cue Check rows in the export counts.

- [ ] Write failing database tests for each guard, including a privileged rewrite of `observation` without a revision and a concurrent-replay case where the harness can model it; record RED.
- [ ] Implement the forward migration; keep the committed migrations untouched.
- [ ] Extend the isolation scripts and scenarios; run migration, hardening, export, deletion and owner-isolation suites.
- [ ] Commit `fix: close remaining Cue Check database hardening`.

### Task I5.1: canonical confirmed care-event ledger

**Files:**
- Create: `packages/domain/src/care-events.ts`
- Modify: `packages/domain/src/index.ts`, `vitest.config.ts`
- Test: `tests/domain/care-events.test.ts`

**Interfaces:**
- Produce `deriveCareEvents(sources): readonly CareEvent[]` where `CareEvent` is `wash | application | heat` with kind-specific fields, date and precision (`exact | day | approximate | unknown`), provenance (`execution-confirmed | activity-recorded`), the source record id, and lifecycle (`active | corrected | voided`).
- Heat events carry actual temperature, passes, duration and zones only as the owner recorded them, each independently `known | unknown` (TL-04, TL-03: wattage never implies temperature).
- Output is deterministic, canonically ordered, frozen, and never mutates inputs.

- [ ] Write failing tests: only confirmed steps produce events; skipped, substituted-without-confirmation and pending steps do not; corrected and voided activities drop out; unknown precision is preserved, not defaulted; ordering ties resolve identically for any input order; heat unknowns stay unknown.
- [ ] Run RED, implement, run GREEN, add the file to the per-file coverage list.
- [ ] Commit `feat: derive canonical care events`.

### Task I5.2: wash counting by named unit

**Files:**
- Create: `packages/domain/src/wash-count.ts`
- Test: `tests/domain/wash-count.test.ts`

**Interfaces:**
- Produce `countWashes(events, rule, asOf): WashCountResult` with `{ unit, count, range?, status: 'counted' | 'needs_input', missing: readonly MissingFact[], eventsUsed }`.
- `WashCountRule` is a schema-validated typed input: named unit (`wash | shampoo-session`), whether the application wash counts, and optional manufacturer range. Test fixtures only; no production rule content.

- [ ] Write failing tests for: two lathers in one wash equals one shampoo session; the application wash is not elapsed after that application; range preserved; events before the application excluded; unknown or approximate dates yield `needs_input` naming the event; deterministic regardless of input order; corrected and backdated events recompute.
- [ ] Run RED, implement, GREEN, add to coverage, commit `feat: count washes by named unit`.

### Task I5.3: treatment-programme state and due status

**Files:**
- Create: `packages/domain/src/treatment-programme.ts`
- Test: `tests/domain/treatment-programme.test.ts`

**Interfaces:**
- States `not_started | initial | reassessment | maintenance | paused | completed`; due status `not_due | eligible | due | needs_input`.
- `evaluateProgramme(enrolment, events, rule, asOf)` returns state, due status, the exact facts used, a range where the rule gives one, and the missing facts. A `ProgrammeRule` carries transition policy and an optional approved resumption rule.
- Missed or interrupted without an approved resumption rule is `needs_input` (TR-07). A completed programme returns its frozen snapshot unchanged when earlier events are later corrected (TR-06).

- [ ] Write failing tests for each state transition, each due status, range preservation, paused and missed handling with and without a resumption rule, backdated and corrected events, completed-snapshot stability and unverified-product refusal (EN-06).
- [ ] Run RED, implement, GREEN, add to coverage, commit `feat: evaluate treatment programme state`.

### Task I5.4: owner-only programme persistence

**Files:**
- Create: one forward migration (enrolment, append-only pause/resume/complete events, private operation receipts with a stated retention)
- Modify: export and deletion functions to export v6, `tests/database/migration-inventory.test.ts`, `docs/verification/privacy-matrix-2026-10-15.md`, `docs/runbooks/privacy-retention.md`
- Test: `tests/database/treatment-programmes.test.ts`, extend export, deletion, hardening and owner-isolation suites

**Interfaces:**
- RPCs `enrol_programme`, `change_programme`, `list_programmes`, `get_programme`: owner-keyed, active-account checked, idempotent by operation id, expected-revision checked, append-only, hardened definers with pinned search paths, forced RLS, no direct writes.
- The server stores only the owner's enrolment and lifecycle facts and a reference to the rule id and version; counts and due status are derived on read, never stored, except a frozen snapshot written once at completion.
- Page on immutable keys.

- [ ] Write failing database tests: RLS and grants, indistinguishable foreign ids, idempotent replay including a committed-then-lost response, revision conflict, append-only guards, quotas, export v6 content, deletion cascade, and byte-identical catalogue and authority rows across mutations; record RED.
- [ ] Implement the migration; verify it applies from zero and replays safely as in Increment 4.
- [ ] Document retention for every new table in the privacy matrix and runbook; run the full database suites; commit `feat: persist owner-only treatment programmes`.

### Task I5.5: mobile adapter and accessible programme view

**Files:**
- Create: `apps/mobile/src/programme-api.ts`, `programme-errors.ts`, `programme-state.ts`, `programme-copy.ts`, programme screen components under a focused `Programme*.tsx` set, and the Journey wiring
- Modify: `apps/mobile/src/records.tsx`, `vitest.config.ts`
- Test: `tests/mobile/programme-api.test.ts`, `programme-state.test.ts`, programme component, journey, accessibility and owner-switch suites, using a fake server that can commit then lose the response

**Interfaces:**
- Strict schemas, stable user-safe error copy for every server code, per-owner controller with request tokens and explicit outcome markers, no logging of notes or identifiers.
- Screens show: current state, due status in plain words, the counted unit and range, the exact events used, what is missing and where to fix it, and the history of changes. Show "Blocked by reviewed content" honestly when no reviewed rule exists.
- Wording passes the same non-causal, non-medical scan as Cue Checks; no arrows, scores, percentages, streaks or reminders.

- [ ] Write failing API, state and component tests including owner switch with first-commit capture, late-response isolation, fast-response announcements, focus on view swap, 44px targets, unique accessible names and a forbidden-wording scan; record RED.
- [ ] Implement test-first; run isolated accessibility and wording reviews now and fix Medium and above before moving on.
- [ ] Commit `feat: add treatment programme view`.

### Task I5.6: Increment 5 integration, independent review and stop

**Files:**
- Modify: `docs/product/full-product-capability-matrix.md`, `docs/product/requirement-traceability.md`
- Create: `.superpowers/sdd/<increment-5-dir>/increment-5-report.md`

- [ ] Run a test-only end-to-end component journey: confirmed execution, application event, washes accumulating, state and due-status changes, a backdated correction recomputing, a completed snapshot staying frozen, an unknown-date `needs_input`, owner switch, and production guidance still `content_pending` with zero recommendation or catalogue writes.
- [ ] Run fresh independent reviews in isolated contexts for code and state, database and privacy, accessibility and owner switching, and wording; re-review every fix; record Low findings honestly.
- [ ] Run runtime, typecheck, lint, all focused suites, the database suites, full coverage, web export, control-plane and dependency audits, research validation, `git diff --check` and a scoped secret scan. Report the dependency audit as HOLD unless it exits zero.
- [ ] Update TR-01 to TR-08 and TL-04 only as far as named tests prove; expected: TR rows Partial (mechanism proven, reviewed rules absent), TL-04 Partial, TL-05 Not started.
- [ ] Report NOT RUN for hosted owner isolation, real-database UI, device, emulator, TalkBack and VoiceOver unless actually run. Commit the report; stop. Do not begin Increment 6.

## Explicitly deferred

Heat Coach recommendations (TL-05, needs reviewed heat rules), technique alternatives (TL-06), personal ranking and explanations (CC-06, CC-07), personal experiments (CC-08), adverse-reaction record and escalation (SF-02, SF-04), reminders, photos, weather, Routine Audit, discovery, AI, community and stylist handoff.

## Suggested next increment after this one

Heat Coach (TL-05, TL-06) once a reviewed heat-rule slice exists, then personal ranking with sparse-evidence preservation (CC-06, CC-07), then the R3 context stage. Revisit this order if the product owner answers the open inputs differently.

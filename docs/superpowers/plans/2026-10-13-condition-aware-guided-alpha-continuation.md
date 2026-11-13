# Condition-aware guided alpha continuation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a condition-aware Today journey that can collect temporary cosmetic observations, generate only reviewed guidance, record actual protocol execution, capture Cue Checks, and explain every result without waiting for broader catalogue publication.

**Architecture:** Continue from the plan-bearing head of `codex/basic-wash-reviewed-content`, whose verified implementation parent is `c428c74`, in three separately reviewed increments. Current-condition data becomes an explicit, immutable input to guidance; execution and Cue Check records remain separate from the recommendation snapshot; published product capabilities and rules remain human-governed. The first increment may ship while the Garnier bundle remains draft, so its correct visible result is `content_pending`, `needs_setup`, or `unsupported` rather than invented advice.

**Tech stack:** TypeScript 6, React Native/Expo 57, Zod 4, Supabase/PostgreSQL, Vitest 5, PGlite, Node 24.19.0.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` — HP-01, HP-05, HP-06, EN-01–EN-09, TD-01–TD-09, CC-01–CC-07, P-01–P-12, SF-01, EV-01–EV-05 and UX-01–UX-04.

## Global constraints

- Start from the plan-bearing head named in the execution prompt and verify that `c428c740e968d708669c9e3ee0b50418293f7e49` is its direct implementation ancestor; create `codex/condition-aware-guided-alpha` in a new worktree. Do not modify the dirty desktop checkout.
- Use Node `24.19.0`; fail closed if the required runtime is unavailable.
- Implement with tests first. New logic must achieve at least 80% statements, branches, functions and lines.
- Use immutable parsed values and return new objects. Do not mutate Passport, recommendation snapshots, protocol decisions or execution records.
- Preserve the exact Garnier UUIDs, evidence registry, capability review, Task 8 packet and local migration. Do not fill human-review placeholders.
- The current reviewed bundle stays `draft` until genuine Human A and distinct Human B decisions pass the publication gate.
- No category, product name, ingredient, marketing statement, retailer listing, user note or photograph may create a verified capability.
- Current-condition answers are cosmetic self-reports. They must not become diagnoses, treatment advice or proof of product effectiveness.
- Guidance generation remains deterministic. AI/LLM output, price, popularity, sponsorship and affiliate data never enter the evaluator.
- Generating, viewing or starting a protocol never records a wash, application or heat event. Only explicit user confirmation records actual events.
- A recommendation snapshot is immutable. Corrections to later records must not rewrite the stored decision.
- All owner data is protected by active-account checks, RLS and narrow authenticated RPCs. Anonymous access is denied. Cross-owner reads/writes are tested directly.
- Unknown, unanswered and `none` remain distinct. Missing information produces a targeted question, limited result or unsupported outcome.
- Do not push, merge, deploy, apply hosted migrations, modify hosted services or publish content in any increment.
- Each increment ends with a clean commit series, fresh code/security review and a handoff. Do not begin the next increment until the previous handoff is accepted.

## review focus

- Owner switches while a condition draft, generation request or execution save is in flight must clear the old owner’s data and discard late responses.
- Duplicate taps, retries and lost responses must remain idempotent without duplicating recommendation, execution or Cue Check records.
- Draft/withdrawn content and unknown product versions must never become executable merely because current-condition answers are present.
- Partial, abandoned and corrected executions must preserve confirmed actual events without claiming skipped steps occurred.
- Sparse or negative Cue Checks may affect future ranking only after hard eligibility filtering and must show sample size and uncertainty.

---

## Increment A — integration, validation and current-condition preflight

### Task 1: establish the integration baseline and authority audit

**Files:**
- Create: `docs/verification/condition-aware-guided-alpha-baseline.md`
- Modify: `docs/product/requirement-traceability.md`
- Test: existing full verification suite

**Interfaces:**
- Consumes: the plan-bearing head of `codex/basic-wash-reviewed-content`, with implementation baseline `c428c74`.
- Produces: a verified baseline and a requirement-to-task map for this plan.

- [ ] Create a new worktree and branch from the exact base; record `git status`, `git rev-parse HEAD`, Node/npm versions and all relevant branch ancestry.
- [ ] Run `npm run verify:offline`, `npm run audit:dependencies`, `npm run validate:guidance-research`, and `git diff --check`; record exact pass/fail counts without weakening gates.
- [ ] Inspect the canonical specification, recovery audit, current traceability matrix, Today service/UI, recommendation engine, migrations and basic-wash review artifacts.
- [ ] Add a baseline document distinguishing implemented, partial, absent and human-blocked behavior. Explicitly record that draft content may not execute.
- [ ] Update traceability only for evidence proven at this commit; do not convert historical foundation entries to implemented by assumption.
- [ ] Run documentation/tooling tests and commit `docs: baseline condition-aware guided alpha`.

### Task 2: harden discovery validation before another catalogue batch

**Files:**
- Modify: `packages/domain/src/discovery-backlog.ts`
- Modify: discovery compiler/importer identified during Task 1
- Test: `tests/domain/discovery-backlog.test.ts`
- Modify: `docs/product/discovery/discovery-gap-ledger.md`

**Interfaces:**
- Consumes: existing discovery rows and deterministic fingerprints.
- Produces: `validateDiscoveryDate(value: string, today: string): string` and tested normalization used by the existing compiler.

- [ ] Write failing tests proving impossible dates, invalid leap days, timestamps where dates are required and dates after injected `today` are rejected; `2026-10-13` is accepted when `today` is `2026-10-13`.
- [ ] Write failing tests proving fingerprint equality under the documented case-insensitive fields and inequality where case is identity-significant.
- [ ] Write failing tests for `possible_reformulation` when two otherwise matching candidates have conflicting exact version/formulation markers.
- [ ] Write failing tests that Selsun/medicinal/antifungal uncertainty remains quarantined for human classification and never acquires a capability.
- [ ] Implement the minimum immutable validation and classification changes. Do not alter the 313 source rows or promote any discovery record.
- [ ] Run focused tests, typecheck and lint; update the gap ledger with resolved and remaining gaps.
- [ ] Commit `fix: harden discovery backlog validation`.

### Task 3: define temporary current-condition contracts

**Files:**
- Create: `packages/domain/src/current-condition.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/current-condition.test.ts`

**Interfaces:**
- Produces:
  - `CurrentConditionConcern = 'dryness' | 'frizz' | 'tangling' | 'breakage' | 'stiffness' | 'dullness' | 'scalp-dryness' | 'scalp-oiliness' | 'reported-damage' | 'none' | 'unknown'`.
  - `CurrentConditionInput` with `observedAt`, `concerns`, `goal`, `availableMinutes`, `saveToPassport`, and optional `zones`.
  - `CurrentConditionSchema` and `normalizeCurrentCondition(input: unknown): CurrentConditionInput`.

- [ ] Write failing schema tests for multi-select concerns, exclusive `none`/`unknown`, zero and bounded available time, offset-aware non-future observation timestamps, optional zones and strict unknown-field rejection.
- [ ] Write failing immutability tests proving parsed input and nested arrays cannot be changed.
- [ ] Implement the strict schema and normalization without free-text symptom interpretation.
- [ ] Export the contracts from the domain package and run focused tests, typecheck and lint.
- [ ] Commit `feat: define current condition check-in contracts`.

### Task 4: merge current condition into guidance preparation without creating capabilities

**Files:**
- Modify: `packages/domain/src/guidance/types.ts`
- Modify: `packages/domain/src/guidance/schemas.ts`
- Modify: `packages/domain/src/guidance/prepare-guidance.ts`
- Modify: `packages/domain/src/recommendations/types.ts` only if the current typed fact boundary cannot represent namespaced condition facts
- Test: `tests/domain/guidance/schemas.test.ts`
- Test: `tests/domain/guidance/prepare-guidance.test.ts`

**Interfaces:**
- Consumes: `CurrentConditionInput` from Task 3.
- Produces: an optional `currentCondition` on the guidance request/preparation boundary and allowlisted facts under `current.*`; it never modifies the stored Passport snapshot.

- [ ] Write failing tests proving a temporary check-in overrides the equivalent Passport fact only for that generated request and leaves the source snapshot unchanged.
- [ ] Write failing tests proving dry/brittle-like concerns do not manufacture `condition`, `repair`, `protein`, `bond` or any product capability.
- [ ] Write failing tests for missing, unknown and contradictory current answers, including stable targeted gaps.
- [ ] Extend strict schemas and preparation mapping with an explicit allowlist. Exclude notes and unrecognized keys.
- [ ] Run all guidance and recommendation tests, typecheck and lint.
- [ ] Commit `feat: prepare guidance from temporary condition check-ins`.

### Task 5: build the Today preflight state machine and accessible UI

**Files:**
- Create: `apps/mobile/src/guidance/current-condition-state.ts`
- Create: `apps/mobile/src/TodayCheckIn.tsx`
- Modify: `apps/mobile/src/TodayGuidance.tsx`
- Modify: `apps/mobile/src/guidance/today-guidance-service.ts`
- Modify: `apps/mobile/src/guidance/guidance-copy.ts`
- Test: `tests/mobile/current-condition-state.test.ts`
- Test: `tests/mobile/today-check-in.test.tsx`
- Modify: `tests/mobile/today-guidance.test.tsx`

**Interfaces:**
- Consumes: `CurrentConditionInput`; passes it through `TodayGuidanceRequest.currentCondition`.
- Produces: states `idle → checking_in → ready_to_generate → generating → result`, with owner/request epochs and no generation on mount.

- [ ] Write failing reducer tests for selecting multiple concerns, exclusive unknown/none, changing goals, validation errors, reset and owner change.
- [ ] Write failing component tests for labels, keyboard/screen-reader behavior, minimum 44×44 touch targets, focus movement to errors/results and large-text-safe copy structure.
- [ ] Write failing integration tests proving generation receives the exact normalized check-in, duplicate taps do not generate twice, late responses are discarded, and opening Today creates no run.
- [ ] Implement the reducer and UI using existing controls and visual language. Keep the cosmetic boundary visible.
- [ ] Ensure a draft bundle still returns `content_pending`; show the check-in without displaying invented advice.
- [ ] Add clear destinations for missing Shelf, Passport and Tool facts and preserve the current retry behavior for source errors.
- [ ] Run focused mobile tests, all guidance/recommendation tests, typecheck, lint and coverage.
- [ ] Update traceability for HP-01, HP-05, HP-06, TD-01–TD-04 and SF-01 using only demonstrated behavior.
- [ ] Run `npm run verify:offline`, request fresh code and security reviews, fix all critical/high findings, and commit `feat: add condition-aware Today preflight`.
- [ ] Stop and provide the Increment A handoff. Do not continue unattended.

---

## Increment B — immutable protocol execution

Begin only after Increment A is accepted. Create `codex/protocol-execution` from the accepted Increment A head.

### Task 6: define protocol execution and deviation contracts

**Files:**
- Create: `packages/domain/src/protocol-execution.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/protocol-execution.test.ts`

**Interfaces:**
- Produces strict schemas for `ProtocolExecution`, `ExecutionStep`, `ExecutionStatus`, `ExecutionDeviation` and commands `start`, `complete-step`, `skip-step`, `substitute-step`, `modify-step`, `pause`, `resume`, `abandon`, `complete`.

- [ ] Test that every execution references one immutable recommendation run and copies stable step identities without rewriting its decision.
- [ ] Test valid state transitions and reject completing unconfirmed steps, resuming a completed execution, duplicate step confirmation and substitutions without an owned product reference.
- [ ] Test partial and abandoned executions preserve confirmed actual events and never imply the remaining recommendation occurred.
- [ ] Implement pure immutable transition functions and strict schemas.
- [ ] Run focused tests, typecheck, lint and coverage; commit `feat: define protocol execution state machine`.

### Task 7: persist owner-isolated idempotent executions

**Files:**
- Create: `supabase/migrations/<timestamp>_protocol_executions.sql`
- Create: `apps/mobile/src/guidance/protocol-execution-api.ts`
- Test: `tests/database/protocol-executions.test.ts`
- Test: `tests/mobile/protocol-execution-api.test.ts`

**Interfaces:**
- Consumes: Task 6 commands and recommendation run IDs.
- Produces authenticated RPCs for start, transition, read active and list history using operation UUIDs and expected revisions.

- [ ] Write PGlite tests first for schema constraints, ownership, active-account checks, RLS/grants, recommendation-run ownership, append-only events and immutable source decisions.
- [ ] Test identical operation retries return the same result; reused operation IDs with different payloads fail; stale revisions do not overwrite.
- [ ] Test anonymous and cross-owner reads/writes fail and service-role maintenance remains narrow.
- [ ] Implement migration and strict mobile adapter; never apply it to hosted Supabase.
- [ ] Run migration, database, API, typecheck, lint and coverage gates; commit `feat: persist protocol execution safely`.

### Task 8: implement execution, pause/resume and deviation UI

**Files:**
- Create: `apps/mobile/src/ProtocolExecution.tsx`
- Create: `apps/mobile/src/guidance/protocol-execution-state.ts`
- Modify: `apps/mobile/src/TodayGuidance.tsx`
- Test: `tests/mobile/protocol-execution.test.tsx`
- Test: `tests/mobile/protocol-execution-state.test.ts`

**Interfaces:**
- Consumes: a persisted recommendation run and Task 7 API.
- Produces a resumable execution surface and completion result suitable for Cue Check creation.

- [ ] Test explicit start, complete, skip, substitute, modify, pause, resume, abandon and retry flows.
- [ ] Test that starting/viewing generates no activity event and only confirmed actions enter execution history.
- [ ] Test owner changes, unmounts, offline/save failures and retry idempotency.
- [ ] Implement accessible large controls, ordered steps, visible deviations and a persistent distinction between “planned” and “actually done.”
- [ ] Update traceability for TD-05–TD-09 using demonstrated behavior.
- [ ] Run the full offline gate, fresh code/security review and commit `feat: execute and record guidance protocols`.
- [ ] Stop and provide the Increment B handoff. Do not continue unattended.

---

## Increment C — Cue Check, personal history and evidence explanations

Begin only after Increment B is accepted. Create `codex/cue-check-foundation` from the accepted Increment B head.

### Task 9: define Cue Check contracts and honest summaries

**Files:**
- Create: `packages/domain/src/cue-check.ts`
- Create: `packages/domain/src/personal-summary.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/cue-check.test.ts`
- Test: `tests/domain/personal-summary.test.ts`

**Interfaces:**
- Produces immediate/delayed `CueCheck` contracts with optional unknown-aware overall result, satisfaction, dryness, frizz, softness, tangling, buildup/heaviness, breakage observation, style longevity, immediate reaction and would-use-again.
- Produces `summarizePersonalOutcomes(records): PersonalOutcomeSummary[]` containing counts, denominator, contexts and uncertainty; never causation.

- [ ] Test strict validation, correction/void history, immediate/delayed timing and no forced answers.
- [ ] Test summaries such as “reported less frizz in 3 of 4 comparable uses,” with zero/small samples labeled insufficient.
- [ ] Test negative feedback cannot make an ineligible product eligible and sparse evidence preserves baseline order.
- [ ] Implement immutable contracts and summary functions without medical inference or causal wording.
- [ ] Run focused tests, typecheck, lint and coverage; commit `feat: define Cue Check and personal summaries`.

### Task 10: persist Cue Checks and expose owner-only history

**Files:**
- Create: `supabase/migrations/<timestamp>_cue_checks.sql`
- Create: `apps/mobile/src/journey/cue-check-api.ts`
- Test: `tests/database/cue-checks.test.ts`
- Test: `tests/mobile/cue-check-api.test.ts`

**Interfaces:**
- Consumes: completed/partial/abandoned execution IDs and Task 9 contracts.
- Produces idempotent create/correct/void/list RPCs and an owner-only mobile adapter.

- [ ] Test ownership, RLS, active-account checks, operation retry/conflict behavior, correction/void audit and references to the exact execution/run/product versions.
- [ ] Test export/deletion inclusion and confirm no Cue Check changes global catalogue evidence.
- [ ] Implement locally and verify with PGlite; do not apply hosted migration.
- [ ] Run focused database/API tests, typecheck, lint and coverage; commit `feat: persist private Cue Checks`.

### Task 11: implement Cue Check, Journey summaries and decision evidence details

**Files:**
- Create: `apps/mobile/src/journey/CueCheck.tsx`
- Create: `apps/mobile/src/journey/PersonalOutcomeHistory.tsx`
- Create: `apps/mobile/src/guidance/DecisionEvidence.tsx`
- Modify: `apps/mobile/src/ProtocolExecution.tsx`
- Modify: `apps/mobile/src/TodayGuidance.tsx`
- Modify: Journey destination wiring identified during Task 1
- Test: `tests/mobile/cue-check.test.tsx`
- Test: `tests/mobile/personal-outcome-history.test.tsx`
- Test: `tests/mobile/decision-evidence.test.tsx`

**Interfaces:**
- Consumes: Tasks 9–10 records, protocol decision audit and checked-in evidence registry.
- Produces immediate/later feedback, corrected history, non-causal summaries, and claim-level explanation of reasons, evidence tier, applicability, uncertainty and alternatives.

- [ ] Test immediate completion prompt, “later” path, optional/unknown answers, correction, owner switch and save retry.
- [ ] Test evidence rendering resolves only identifiers in the exact decision’s reviewed registry version; missing references fail visibly rather than displaying unrelated text.
- [ ] Test no medical, repair guarantee, growth, causation or universal-safety wording appears.
- [ ] Implement accessible UI with separate planned, actual and observed sections.
- [ ] Update traceability for CC-01–CC-07, P-06, P-11 and applicable EV requirements.
- [ ] Run full offline verification, dependency/control-plane audits, fresh code/security review and Android component tests.
- [ ] Commit `feat: add Cue Check and evidence explanations`.

### Task 12: final integration and handoff

**Files:**
- Modify: `docs/product/requirement-traceability.md`
- Create: `docs/verification/condition-aware-guided-alpha-final.md`
- Modify: relevant runbooks only where behavior now exists

**Interfaces:**
- Consumes: all accepted increments.
- Produces: a reviewable branch that remains safe with a draft content bundle and is ready for later Human A/B transcription.

- [ ] Run exact acceptance journeys for dry, brittle-feeling, highlighted and unknown-condition cases using draft content; confirm no invented product advice.
- [ ] Run the same journeys with test-only published fixtures; confirm deterministic output, owned-first selection, explanations, execution and Cue Check linkage.
- [ ] Verify negative/sparse observations cannot bypass eligibility and that old recommendation snapshots remain byte-stable after corrections.
- [ ] Run `npm run verify:offline`, `npm run audit:dependencies`, `npm run validate:guidance-research`, `git diff --check`, migration tests and the relevant Android build/test gate.
- [ ] Perform whole-branch correctness, accessibility, privacy and security reviews; resolve critical/high findings and document deferred minor issues.
- [ ] Record exact commands, counts, coverage, migrations, known limitations and manual-device journeys still required.
- [ ] Confirm clean tree. Stop without push, merge, deploy, publication or hosted migration.

## Parallel non-code content lane

This lane may proceed while the coding increments run, but it never changes executable content automatically:

1. Complete genuine Human A and distinct Human B review of the existing Garnier Banana shampoo/conditioner pair.
2. Research exact ZA versions for moisture conditioning, leave-in conditioning, detangling, heat protection, bond/protein treatment, clarifying, styling and finishing capabilities.
3. For each exact version, collect manufacturer directions, market/version identity, formulation marker where available, limitations and packaging evidence when possible.
4. Draft claim-scoped capability mappings and rules; require the same two-person publication gate.
5. Add new capabilities only in separate reviewed-content commits after their evidence passes validation. Coding completion never authorizes content publication.

## Explicitly deferred from this programme

- Progress-photo capture, private Storage and comparison (PH-01–PH-09).
- Weather/travel integration and reminders.
- Heat Coach, wash counting and treatment-programme state.
- Routine Audit, barcode/OCR, AI explanation and broad catalogue import.
- Automatic learning or rule rewriting from Cue Checks.
- Hosted migrations, public launch and Play rollout.

These require their own approved designs and plans under section 12 of the canonical specification.

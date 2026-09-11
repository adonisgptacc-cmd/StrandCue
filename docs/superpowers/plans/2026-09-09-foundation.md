# StrandCue Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the v4.5 project workflow and implement a tested Phase 1 account/Passport/history foundation, then extend only where its contracts are proven.

**Architecture:** Expo mobile workspace consumes typed domain validation and immutable history projection. Supabase migrations enforce owner isolation and narrow transactional mutations. Governance is additive and tool observations are separate from desired state.

**Tech Stack:** React Native, Expo, TypeScript, Expo Router, Supabase PostgreSQL/Auth, Vitest, npm workspaces.

**Spec:** `docs/PHASE_1.md` and `docs/superpowers/specs/2026-09-09-foundation-design.md`.

## Global Constraints

- ZA, ZAR, Celsius, English, adults 18+; no exact DOB or legal identity fields.
- No advice/recommendation/commerce/weather/diagnostic behaviour.
- Auth UUID owns records; unknown is valid; corrections preserve audit.
- Immutable field patches, not whole-form history snapshots.
- Preserve existing source/reference files; no production changes or global installs.
- All implementation tasks run tests before and after implementation and receive review.

### Task 1: Shared recording contracts

**Files:** `packages/domain/package.json`, `packages/domain/src/{index,passport,dates,history}.ts`, `tests/domain/*.test.ts`.

**Interfaces:** Export `PassportSchema`, `EffectiveDateSchema`, `projectHistory`, and typed revisions/results. Use Zod schemas. Projection returns values plus explicit ambiguous fields; no false certainty.

- [x] Write literal fixtures covering unknown/unanswered, calendar validity, future dates, February goal entered after March budget, corrections of corrections, branching corrections, same-field ambiguity, historical as-of, nonmutation.
- [x] Run `npm test -- tests/domain` and observe expected missing behaviour failures.
- [x] Implement validated Passport fields and date intervals, correction resolution and field-level projection.
- [x] Run tests/typecheck/coverage. Review the concrete API before database/client consumers.

Example invariant: baseline `{goals:['shine'], budget:100}`, March patch `{budget:200}`, February patch entered later `{goals:['length']}` must resolve to `{goals:['length'],budget:200}` in April.

### Task 2: Ownership and transactional history

**Files:** `supabase/config.toml`, CLI-created `supabase/migrations/*`, `tests/database/*.test.ts`, `docs/decisions/0002-mutation-boundary.md`.

**Interfaces:** verified account completion and Passport change/correct/read operations; exact SQL API documented beside migration. Derive owner from auth context, require expected revision and stable operation key.

- [x] Write direct database tests for anonymous/user A/user B, owner reassignment, cross-owner correction, direct history writes, duplicate retries, mismatched retries, stale edits and deleting account denial.
- [x] Run tests against the unimplemented schema, confirm expected failures.
- [x] Implement schema and transaction functions with explicit grants, fixed search paths and owner checks. Keep privilege design deliberate; never add definer as an error workaround.
- [x] Run migrations against a fresh database and permissions tests. Record any difference between embedded SQL tests and full Supabase API validation.

Fresh-stack evidence (11 September 2026): Supabase CLI 2.117.0 rebuilt the local Postgres 17 database from the migration, and disposable verified users exercised onboarding, owner-scoped reads, denied direct writes, idempotent retries, and changed-payload conflicts through Auth and PostgREST. This exposed and fixed Postgres 17 role-transfer and managed `auth`-schema assumptions that the embedded PGlite harness had masked. Backup restore remains a separate release gate.

Example assertions: user B cannot read user A's Passport; user A cannot UPDATE their own revision; retrying an identical operation creates one revision; changed payload with the same key conflicts.

### Task 3: Account and Passport mobile journey

**Files:** `apps/mobile/package.json`, `app.json`, Expo Router routes, `src/{auth,api,components,passport}`, mobile contract tests.

**Interfaces:** consume the reviewed domain package and SQL API; session storage is native secure storage, browser preview must not masquerade as native security validation.

- [x] Test form patch generation, unknown values, stale edit handling and strict callback validation before implementation.
- [x] Implement setup/missing configuration, authentication, verified onboarding, Passport current/edit/history/correction flows with clear loading/error/unsaved states.
- [x] Run typecheck, Expo dependency compatibility check and web bundle export. Inspect running UI where tooling permits.
- [x] Record native cold/warm recovery and real email tests as unverified until performed.

### Task 4: v4.5 governance and verification handoff

**Files:** `.assistant/{tooling,governance,conformance,audit}`, `docs/decisions`, `docs/verification`, `README.md`, CI configuration.

- [x] Record baseline file inventory/hashes and current authorization. Preserve existing entry-point content.
- [x] Add project routing, extension desired/observed state, source freshness and conformance cases tailored to Codex.
- [x] Exercise any new auditor on valid and invalid fixtures; do not substitute document text matching for behavioural conformance.
- [x] Run complete available verification, independent review, and update acceptance status with evidence and remaining release blockers.

Further services/Shelf/Tools/manual/privacy slices follow the Phase 1 delivery order. No claim of full Phase 1 completion is permitted from finishing this foundation plan alone.

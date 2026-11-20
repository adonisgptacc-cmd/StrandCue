# Activity and Unified History Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Deliver factual Activity logging (wash / styling / other) with heat facts, product/tool links, short notes, immutable revisions, corrections/voids, operation-key idempotency, duplicate suggestions, owner-keyed drafts, and unified History that distinguishes current vs historical truth across Passport, Services, and Activities.

**Architecture:** Activities are temporal facts like Passport revisions but with their own entity table. Use stable `activity_id` + immutable `activity_revisions` (explicit `changed_fields`/`new_values` + `base_revision` + optional `corrects_id` + `voided` flag) plus link tables `activity_products`, `activity_tools`, `heat_events` (separate optional event linked to activity). No direct consumer writes to revision/link/heat tables — all mutations via transactional RPC that validates `owner = auth.uid()`, `expected_revision`, `effective_at`/`precision`, ownership of linked product/tool, and `operation_key` idempotency. Current projection `activities_current` is rebuildable from revisions. History UI composes `passport_revisions` + `service_revisions` + `activity_revisions` sorted by `effective_at` then `recorded_at`, showing correction audit separately and marking voided entries.

**Tech Stack:** TypeScript 7, Vitest 5, PGlite, Supabase 2.117 (Postgres 17), Expo 57 / React Native 0.86, Zod 4.

**Spec:** `StrandCue-PRD-v1.1-audit.md` §13–14, `docs/PHASE_1.md` P1-LOG-01..03 / P1-HIST-02..04 / P1-EVD-01, `docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md` §5–6

## Global Constraints

- Append-only from consumer boundary; corrections reference superseded revision via `corrects_id`, voids set `voided=true` but remain auditable.
- Unknown remains distinct from omitted/false/zero; `precision` in `exact_day/exact_month/exact_year/unknown`, no invented dates, no future `effective_at` in Phase 1.
- Every private table has RLS `user_id = auth.uid()` (or `owner`) with both `USING` and `WITH CHECK` on UPDATE; direct INSERT/UPDATE/DELETE denied on revision/link tables for `authenticated`.
- Consumer operation IDs (`operation_key` UUID + `operation_keys` unique `(owner, operation, key)`) give retry idempotency; same key + same payload → replay stored result; same key + different payload → `idempotency-mismatch`; never silent merge.
- Two independently entered real events with similar timestamps are *possible duplicates* for user review, never merged.
- Notes ≤2000 UTF-16 code units, redacted in logs.
- Activities preserve product/tool `version_id` at recording; later reformulation does not rewrite prior `activity_products` rows.
- Unified History shows `effective_at`/`precision`/`source` and separates `Update because this changed` (new revision) vs `Correct a mistake` (replacement) vs `Void`.

## Review Focus

- A direct `INSERT into activities` or `activity_revisions` from `authenticated` must be denied by RLS/GRANT.
- A stale `expected_revision` must return `revision-conflict` with current projection + diff, not silent last-write-wins.
- A replayed `operation_key` with different payload must return `idempotency-mismatch`.
- A correction must hide superseded values from default timeline but expose them in correction audit with `correctionReason`.
- Candidate migration `20260918160720` must not be copied verbatim (contains `GRANT ... USING` and `SECURITY DEFINER` without fixed `search_path`).

---

### Task 1: Activity domain contracts

**Files:**
- Create: `packages/domain/src/activity.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/activity.test.ts`

**Interfaces:**
- Consumes: PRD §13 temporal pattern, `dates.ts` EffectiveDate, `history.ts` correction semantics
- Produces: `ActivityKind = wash|styling|other`, `HeatMethod`, `ActivityPatch`, `ActivityRevision` (baseline/change/correction/void), `projectActivityHistory()`, operation-key validation

- [ ] Step 1: Write failing domain test for Activity schema, patch merge, correction supersede, void, ambiguous effective order, idempotency key shape, notes length
- [ ] Step 2: Run `npx vitest run tests/domain/activity.test.ts` — expect FAIL (file missing)
- [ ] Step 3: Implement `activity.ts` reusing `dates.ts`/`history.ts` patterns but scoped to `activityId`
- [ ] Step 4: Run domain suite — expect PASS, update `index.ts` re-export
- [ ] Step 5: Commit `feat: activity domain contracts`

---

### Task 2: Trusted activity migration and RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_activities_history.sql`
- Create: `tests/database/activity.test.ts`
- Modify: `tests/database/migration.test.ts` (expect +1 migration)
- Test: `tests/database/migration.test.ts`, `tests/database/activity.test.ts`

**Interfaces:**
- Consumes: Task 1 domain, trusted baseline (2 migrations)
- Produces: tables `activities` (stable id, owner, kind, occurred_at, precision, zones jsonb, notes, status active/voided, revision int, created_at/updated_at), `activity_revisions` (id, activity_id, owner, base_revision, changed_fields, new_values, effective_at, precision, recorded_at, corrects_id, voided, operation_key), `activity_products`, `activity_tools`, `heat_events` (activity_id, owner, method, tool_version, temperature, passes, duration_minutes, wet_dry_state), indexes, RLS, GRANTs

- [ ] Step 1: Write failing harness test: migration replays, RLS denies direct writes, child ownership enforced via composite FK `(id, owner)`
- [ ] Step 2: Run — expect FAIL (migration missing)
- [ ] Step 3: Create migration with `enable row level security`, `USING (owner = auth.uid())` + `WITH CHECK`, `GRANT SELECT to authenticated`, `GRANT ALL to strandcue_mutator` only for RPC, fixed `search_path = public, pg_temp`
- [ ] Step 4: Run PGlite replay + RLS suite — expect PASS
- [ ] Step 5: Commit `feat: trusted activity history migration`

---

### Task 3: Activity RPC — immutable boundary

**Files:**
- Create: `supabase/migrations/<timestamp>_activity_rpc.sql` (functions `record_activity`, `correct_activity`, `void_activity`, `list_activities`)
- Modify: `tests/database/activity.test.ts` (expand)
- Test: `tests/database/activity.test.ts`

**Interfaces:**
- RPCs validate `auth.uid() = owner`, `expected_revision` match, `effective_at` not future, `corrects_id` exists and not already superseded, `operation_key` unique, linked product/tool belongs to owner, then append revision + update `activities.revision`/`activities_current` projection atomically

- [ ] Step 1: Write failing RPC tests: idempotent retry same key/payload → same result, same key/different payload → mismatch, stale revision → conflict, cross-owner child → denied, unknown precision round-trips, void hides from default list but visible in audit
- [ ] Step 2: Run — expect FAIL (functions missing)
- [ ] Step 3: Implement `SECURITY DEFINER` with `SET search_path = public, pg_temp` + `REVOKE` + narrow `GRANT EXECUTE to authenticated`, `operation_keys` unique handling
- [ ] Step 4: Run RPC suite — expect PASS
- [ ] Step 5: Commit `feat: activity immutable RPC`

---

### Task 4: Mobile drafts, idempotent retry, duplicate suggestions

**Files:**
- Create: `apps/mobile/src/activity-api.ts`, `apps/mobile/src/activity-drafts.ts`
- Test: `tests/mobile/activity.test.ts` (component + storage)

**Interfaces:**
- SecureStore-backed drafts keyed `strandcue-activity-draft-${userId}-${deviceId}`, retained until `record_activity` returns 2xx; retry uses same `operation_key`; possible duplicates fetched via `list_activities` overlap window and surfaced for review

- [ ] Step 1: Write failing mobile boundary test for draft persist/clear, retry idempotency, duplicate suggestion
- [ ] Step 2: Implement `activity-api.ts` typed wrapper + `activity-drafts.ts`
- [ ] Step 3: Run mobile tests — PASS
- [ ] Step 4: Commit `feat: activity drafts and idempotency`

---

### Task 5: Unified History and Activity UI

**Files:**
- Modify: `apps/mobile/src/records.tsx` (add Activities tab + History composition)
- Create: `apps/mobile/src/screens/ActivityListScreen.tsx`, `ActivityForm.tsx`, `ActivityDetailScreen.tsx`
- Test: `tests/mobile/history.test.ts` (unified timeline)

**Interfaces:**
- History composes `passport_revisions` + `service_revisions` + `activity_revisions` by `effective_at`; default hides superseded/voided, audit toggle shows them with `correctionReason`/`voidReason`

- [ ] Step 1: Write failing component test: new activity appears in History with correct precision, correction creates replacement and hides original in default view, voided entry hidden but audit-visible
- [ ] Step 2: Implement screens respecting 44pt touch, labels/roles, empty/loading/error states, `Unknown` options, `notes` max 2000, no recommendation side effects
- [ ] Step 3: Remove `// @ts-nocheck` from `AccountInfo/Deletion/Export` if they now compile via real RPC; otherwise keep disposition
- [ ] Step 4: Commit `feat: activity UI and unified history`

---

### Task 6: Promotion and evidence

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md` (move `Activities and unified history` from Partial → Proven complete when evidence linked), `docs/verification/rebaseline-2026-09-23.md` add row

- [ ] Step 1: Run full `npm run verify` + migration replay + RLS suite from clean tree
- [ ] Step 2: Update reconciliation matrix with trusted implementation links and evidence counts
- [ ] Step 3: Commit `docs: promote activities to proven`

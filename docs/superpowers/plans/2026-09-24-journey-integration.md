# Journey Integration & Resilience Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Make every consumer list survivable at scale (keyset pagination, limit bounds), then rebuild the account journeys (export, deletion, settings/consent, recovery hardening) on trusted migrations so the app navigates end to end without unverified screens.

**Architecture:** Lists follow the proven `list_services` keyset contract: `p_limit` clamped 1–100 (else `invalid-page`), strict cursor objects (else `invalid-cursor`), `LIMIT p_limit+1` tuple-keyset on `(updated_at, id)`, `nextCursor` or null. Mobile appends pages and offers Load more. Export/deletion rebuild as resumable server-side jobs with recent-auth gates, owner-only results, expiry, and deletion tombstones that survive restore — each as its own trusted migration + RPC + UI, promoting the archived candidates only by replacement, never by copy.

**Tech Stack:** TypeScript 7, Vitest 5, PGlite, Supabase 2.117 (Postgres 17), Expo 57 / React Native 0.86, Zod 4.

**Spec:** `StrandCue-PRD-v1.1-audit.md` §21/§28, `docs/PHASE_1.md` §9 (list contract: default 25, max 100) / P1-PRIV-02/03, rebaseline design §5–6

## Global Constraints

- List default 25, max 100; cursors are opaque to the client but strictly validated server-side.
- No silent last-write-wins; stale edits conflict with review (already proven per entity).
- Export output expires (24h access) and is removed (7d); no public storage URLs.
- Deletion blocks access immediately, purges in dependency order, survives restore via tombstones.
- Every private table RLS `owner = auth.uid()`; mutator-only writes; public wrappers invoker / private cores definer-owned-by-mutator.
- Archived export/deletion/session migrations are never copied (unreviewed RLS, missing tombstone reapplication).

## Review Focus

- A `p_limit` of 0/101/negative/null must raise `invalid-page`, never truncate silently or 500.
- A malformed or foreign cursor must raise `invalid-cursor`, never leak rows.
- Pagination must be stable under concurrent inserts (keyset, never OFFSET).
- An export/deletion job for user B must be invisible and unreachable to user A.

---

### Task 1: Keyset pagination for activity/shelf/tools lists

**Files:**
- Create: `supabase/migrations/<ts>_list_pagination.sql`
- Modify: `tests/database/activity.test.ts`, `tests/database/shelf.test.ts`, `tests/database/tools.test.ts`
- Modify: `apps/mobile/src/activity-api.ts`, `shelf-api.ts`, `tool-api.ts`, `shelf-history.ts`
- Modify: `apps/mobile/src/activities.tsx`, `shelf.tsx`, `tools.tsx`
- Test: `tests/mobile/activity.test.ts`, `shelf.test.ts`, `tools.test.ts`

**Interfaces:**
- Consumes: `list_services` keyset contract, existing `*_list` RPCs
- Produces: clamped limits, `{updatedAt,id}` cursors, `nextCursor`, Load-more UI with append

- [ ] Step 1: Write failing DB tests (invalid-page, invalid-cursor, stable keyset traversal to 60 items, nextCursor null at end)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Replace the three list cores (CREATE OR REPLACE, no schema change)
- [ ] Step 4: Update mobile API parsing + components (cursor state, append, Load more) + mobile tests
- [ ] Step 5: Full DB + mobile suites PASS; update inventory only if a new migration file was added
- [ ] Step 6: Commit `feat: keyset pagination for lists`

---

### Task 2: Export journey (rebuild)

**Files:** new trusted migration + RPC + UI + tests (replaces archived `export-*` candidates)

- [ ] Schema: `export_jobs` (owner, format, status state machine, expires_at, byte count) + operations idempotency
- [ ] RPC: `export_request` (recent-auth), `export_status`, `export_download` (owner-only, expiring)
- [ ] UI: Export screen with status polling, error/support path; remove `@ts-nocheck` ExportScreen or replace
- [ ] Evidence: cross-user denial, expiry enforcement, full-dataset contents

---

### Task 3: Deletion journey (rebuild)

**Files:** new trusted migration + RPC + UI + tests (replaces archived deletion candidates)

- [ ] Schema: `deletion_jobs` + `deletion_tombstones` (survive auth deletion, reapplied on restore)
- [ ] RPC: `deletion_request` (recent-auth + confirm), `deletion_status`, `deletion_cancel` (while pending)
- [ ] UI: Deletion screen with confirm/cancel/status; session revocation; ordered purge
- [ ] Evidence: immediate access block, tombstone survival, restore reapplication

---

### Task 4: Settings/consent + recovery hardening

- [ ] Promote consent contracts to schema where missing; wire Settings journey to real RPCs
- [ ] Recovery: cold/warm deep-link parsing tests, expiry/reuse/verifier-missing paths, neutral messaging audit
- [ ] Replace remaining `@ts-nocheck` screens or record why each stays Partial

---

### Task 5: Promotion and evidence

- [ ] Full `npm run verify` from clean tree
- [ ] Move `Settings and consent`, `Export and portability`, `Deletion and restore enforcement`, `Performance and resilience` per evidence (likely `Implemented, unverified`)
- [ ] Commit `docs: promote journey slices`

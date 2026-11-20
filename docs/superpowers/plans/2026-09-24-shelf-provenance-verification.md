# My Shelf, Provenance & Verification Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Deliver private My Shelf ownership (manual or catalogue-linked, dated availability/match history, archive-not-delete) over an immutable catalogue (brands → products → product_versions with successor links), with claim-scoped provenance (source URL/type, T1–T10 trust tier, first-seen/last-checked, archived URL) and a restricted, audited verification workflow. Consumers can never set verification state (P1-AC-13).

**Architecture:** Catalogue tables (`brands`, `products`, `product_versions`) are ownerless and publicly readable; only `strandcue_mutator` writes (reviewed seed workflow in Phase 1, no consumer write path at all). Verification and lifecycle are separate dimensions (P1-VER-01): `verification = unverified/pending_verification/partially_verified/verified/conflicting_information`, `lifecycle = active/retired`; reformulation is a successor link, never a status overwrite. Version payloads referenced by history are immutable. Verification decisions append to `product_verification_events` (reviewer, reviewed fields, status, reason, time, source IDs) — privileged append-only; the consumer `verification.record` RPC exists but denies every `authenticated` caller until operator auth lands (proves P1-AC-13). `user_products` are owner-scoped stable rows plus immutable `user_product_revisions` (availability/match history, correction links); matching a manual entry to a catalogue version requires explicit confirmation and preserves original identity/provenance. Historical `activity_products` rows keep the version known at recording; successor versions never rewrite them.

**Tech Stack:** TypeScript 7, Vitest 5, PGlite, Supabase 2.117 (Postgres 17), Expo 57 / React Native 0.86, Zod 4.

**Spec:** `StrandCue-PRD-v1.1-audit.md` §15–16, `docs/PHASE_1.md` P1-SHELF-01..03 / P1-VER-01..04 / P1-AC-10..13, rebaseline design §5–6

## Global Constraints

- Unknown remains distinct from omitted/false/zero; `null` ingredients/claims stay null, never “contains no X”.
- No `scientifically_proven` boolean anywhere; evidence is claim-specific (P1-EVD-01, PRD §6.6).
- Every private table has RLS `owner = auth.uid()` with `USING`/`WITH CHECK`; direct consumer writes denied on revision/event/link tables.
- Catalogue version payloads immutable once published; successor links only.
- Consumer verification writes denied through direct API and UI (P1-AC-13).
- Manual names/notes never published to the global catalogue (P1-SHELF-02).
- Archive removes from active list, not from prior records (P1-SHELF-03).
- Short notes ≤2,000 UTF-16 code units.
- Candidate migrations `20260918154343`/`20260918154920` must not be copied verbatim (invalid `GRANT ... USING`, broken FK, definer trigger without fixed `search_path`, mutable published versions, single mixed status).

## Review Focus

- A consumer `INSERT/UPDATE` on `product_versions`, `product_claims`, `product_sources`, or `product_verification_events` must be denied by RLS/GRANT.
- A reformulation must create a successor version; the old payload and old activity links must be byte-identical.
- A match must require explicit confirmation and retain original manual identity.
- A `verification.record` call as `authenticated` must return `not-authorized`, never write.

---

### Task 1: Shelf verification/provenance domain contracts

**Files:**
- Create: `packages/domain/src/shelf.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/shelf.test.ts`

**Interfaces:**
- Consumes: PRD §16 trust tiers, P1-VER-01..02, existing brand/product row schemas in `services.ts` (reused, not duplicated)
- Produces: `VerificationStatus`, `Lifecycle`, `TrustTier` (T1–T10), `SourceType`, `ProvenanceSource`, `ProductClaim`, `VerificationEvent`, user-product `Create/Change/Match/Archive` commands

- [ ] Step 1: Write failing domain test (dimension split, tier order, claim scope, event shape, command validation, notes limit)
- [ ] Step 2: Run `npx vitest run tests/domain/shelf.test.ts` — expect FAIL (file missing)
- [ ] Step 3: Implement `shelf.ts` with collision-free export names
- [ ] Step 4: Run domain suite — expect PASS, `tsc` clean
- [ ] Step 5: Commit `feat: shelf verification domain contracts`

---

### Task 2: Trusted catalogue migration (immutable, publicly readable)

**Files:**
- Create: `supabase/migrations/<ts>_shelf_catalogue.sql`
- Test: `tests/database/shelf.test.ts` (new)

**Interfaces:**
- Produces: `brands`, `products`, `product_versions` (immutable payload, successor link, separate verification/lifecycle), `product_claims`, `product_sources` (trust tier, archived URL, first/last-checked), `product_verification_events` (append-only); public `SELECT`, mutator-only writes, `FORCE RLS`

- [ ] Step 1: Write failing test (replay, public read, authenticated write denial on all six tables, successor preservation)
- [ ] Step 2: Run — expect FAIL (`relation does not exist`)
- [ ] Step 3: Create migration (no consumer write policies at all; fixed `search_path`)
- [ ] Step 4: Run replay + denial suite — expect PASS; update `migration-inventory.test.ts`
- [ ] Step 5: Commit `feat: trusted shelf catalogue migration`

---

### Task 3: Trusted user_products migration (owner-scoped, immutable history)

**Files:**
- Create: `supabase/migrations/<ts>_user_products.sql`
- Modify: `tests/database/shelf.test.ts`

**Interfaces:**
- Produces: `user_products` (stable id/owner, nullable version link, manual fields, availability, match state) + `user_product_revisions` (immutable, composite `(id,owner)` FK, correction links) + `shelf_operations` idempotency; owner RLS, mutator-only writes

- [ ] Step 1: Write failing tests (direct-write denial, cross-owner FK, archive preserves rows)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Create migration
- [ ] Step 4: Run suite — expect PASS; update inventory
- [ ] Step 5: Commit `feat: trusted user products migration`

---

### Task 4: Shelf RPC — immutable boundary + denied verification

**Files:**
- Create: `supabase/migrations/<ts>_shelf_rpc.sql`
- Modify: `tests/database/shelf.test.ts`

**Interfaces:**
- RPCs `shelf_add`, `shelf_change`, `shelf_match` (explicit confirm), `shelf_archive`, `shelf_history` with `operation_keys` idempotency + `expected_revision` conflicts; `verification_record` denies `authenticated` (`not-authorized`, P1-AC-13); public wrappers invoker / private cores definer-owned-by-mutator

- [ ] Step 1: Write failing RPC tests (idempotency, conflict, match-confirm, archive semantics, verification denial)
- [ ] Step 2: Run — expect FAIL (functions missing)
- [ ] Step 3: Implement RPC migration
- [ ] Step 4: Run suite — expect PASS
- [ ] Step 5: Commit `feat: shelf immutable RPC`

---

### Task 5: Shelf UI with provenance display

**Files:**
- Create: `apps/mobile/src/shelf-api.ts`, `shelf-drafts.ts`, `shelf-history.ts`, `shelf.tsx`, `shelf-editor.tsx`
- Modify: `apps/mobile/src/records.tsx` (Shelf tab)
- Test: `tests/mobile/shelf.test.ts`

**Interfaces:**
- Verification badge always text + status (never colour-only); unknown ingredients shown as unknown; manual-vs-matched identity shown; restricted verification UI absent for consumers

- [ ] Step 1: Write failing boundary tests
- [ ] Step 2: Implement API/drafts/history/components/editor + Shelf tab
- [ ] Step 3: Run mobile tests + typecheck — PASS
- [ ] Step 4: Commit `feat: shelf UI with provenance display`

---

### Task 6: Promotion and evidence

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md`

- [ ] Step 1: Run full `npm run verify` from clean tree
- [ ] Step 2: Move `My Shelf and provenance` to `Implemented, unverified` with evidence links (device/operator evidence stays with Journey/Quality/Beta)
- [ ] Step 3: Commit `docs: promote shelf`

# My Tools Completion Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Deliver private My Tools ownership (manual or catalogue-linked, dated availability/match history, archive-not-delete) over an immutable tool catalogue (tool_brands → tools → tool_versions with successor links), with **explicit capability unknowns**: wattage and temperature are independent nullables, never inferred from each other; adjustable-temp and contact/air heating are yes/no/unknown; diffusers are not heat sources.

**Architecture:** Same proven shape as Shelf: catalogue tables ownerless and publicly readable (SELECT-only RLS, mutator gets SELECT in the same migration so RPC cores can validate links — no follow-up fix this time); `tool_claims`/`tool_sources`/`tool_verification_events` give tools claim-level provenance parity with products (§8 architecture table); `user_tools` are owner-scoped stable rows plus immutable `user_tool_revisions` (baseline/change/correction/match/archive, composite `(id,owner)` FKs, correction links, operation-key idempotency). Public wrappers are security invokers owned by migration_admin; private cores are security definers owned by `strandcue_mutator`. No consumer verification path (covered by the shelf `verification_record` denial, P1-AC-13).

**Tech Stack:** TypeScript 7, Vitest 5, PGlite, Supabase 2.117 (Postgres 17), Expo 57 / React Native 0.86, Zod 4.

**Spec:** `StrandCue-PRD-v1.1-audit.md` §17, `docs/PHASE_1.md` P1-TOOL-01 / P1-SHELF-03 (by analogy) / P1-VER-01..03, rebaseline design §5–6

## Global Constraints

- Unknown wattage ≠ unknown temperature ≠ omitted; `null` stays `null`, never inferred (PRD §17.4).
- No temperature inference from wattage, ever — tested at domain, DB and mobile layers.
- Catalogue version payloads immutable; successor links set at insert; RESTRICT FKs.
- Every private table RLS `owner = auth.uid()` with `USING`/`WITH CHECK`; mutator-only writes.
- Manual names never published to the catalogue; matching requires explicit confirmation.
- Archive hides from active list, preserves history.
- Notes ≤2,000 UTF-16 code units.
- Candidate migration `20260918155718` must not be copied (invalid `create trigger` syntax, definer trigger without fixed `search_path`, mutable versions, cascade deletes, missing user_tools entirely).

## Review Focus

- A version with known wattage and unknown temperature must round-trip exactly that.
- A consumer write to any catalogue or revision table must be denied.
- A match without `confirmed=true` must fail; manual identity must survive matching.
- Ownership/revision checks must precede field validation (Passport ordering).

---

### Task 1: Tools capability + ownership domain contracts

**Files:**
- Create: `packages/domain/src/tools.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/tools.test.ts`

**Interfaces:**
- Consumes: existing brand/tool/version row schemas in `services.ts` (reused), PRD §17 capability rules
- Produces: `ToolCapabilities` (independent nullable wattage/temperature, adjustable-temp, contact/air heat), `Create/Change/Match/ArchiveUserToolCommand`

- [ ] Step 1: Write failing domain test
- [ ] Step 2: Run — expect FAIL (file missing)
- [ ] Step 3: Implement `tools.ts` with collision-free names
- [ ] Step 4: Domain suite PASS + `tsc` clean
- [ ] Step 5: Commit `feat: tools domain contracts`

---

### Task 2: Trusted tool catalogue migration (immutable, mutator-readable)

**Files:**
- Create: `supabase/migrations/<ts>_tools_catalogue.sql`
- Test: `tests/database/tools.test.ts` (new)

**Interfaces:**
- Produces: `tool_brands`, `tools`, `tool_versions` (capability columns, successor link, lifecycle), `tool_claims`, `tool_sources`, `tool_verification_events`; SELECT-only for authenticated AND mutator; no write policies at all

- [ ] Step 1: Write failing test (replay, public+mutator read, authenticated write denial, wattage/temperature independence, successor preservation)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Create migration
- [ ] Step 4: Suite PASS; update `migration-inventory.test.ts`
- [ ] Step 5: Commit `feat: trusted tools catalogue migration`

---

### Task 3: Trusted user_tools migration

**Files:**
- Create: `supabase/migrations/<ts>_user_tools.sql`
- Modify: `tests/database/tools.test.ts`

**Interfaces:**
- Produces: `user_tools` + `user_tool_revisions` (5 kinds, correction links, match columns) + `tool_operations`; owner RLS, mutator-only writes, RESTRICT catalogue links

- [ ] Step 1: Write failing tests (direct-write denial, cross-owner FK, archive preserves)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Create migration
- [ ] Step 4: Suite PASS; update inventory
- [ ] Step 5: Commit `feat: trusted user tools migration`

---

### Task 4: Tools RPC — immutable boundary

**Files:**
- Create: `supabase/migrations/<ts>_tools_rpc.sql`
- Modify: `tests/database/tools.test.ts`

**Interfaces:**
- RPCs `tool_add/change/correct/match/archive/history/list` with idempotency + conflicts; public invokers / private definer cores; ownership/revision checks before field validation

- [ ] Step 1: Write failing RPC tests
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Implement RPC migration
- [ ] Step 4: Suite PASS
- [ ] Step 5: Commit `feat: tools immutable RPC`

---

### Task 5: Tools UI with explicit unknowns

**Files:**
- Create: `apps/mobile/src/tool-api.ts`, `tool-drafts.ts`, `tool-history.ts`, `tools.tsx`, `tool-editor.tsx`
- Modify: `apps/mobile/src/records.tsx` (Tools tab)
- Test: `tests/mobile/tools.test.ts`

**Interfaces:**
- Capability facts render as explicit Unknown (never inferred, never blank); manual-vs-matched identity shown; restricted verification UI absent

- [ ] Step 1: Write failing boundary tests
- [ ] Step 2: Implement + Tools tab
- [ ] Step 3: Mobile tests + typecheck PASS
- [ ] Step 4: Commit `feat: tools UI with explicit unknowns`

---

### Task 6: Promotion and evidence

**Files:**
- Modify: `docs/verification/phase-1-reconciliation.md`

- [ ] Step 1: Full `npm run verify` from clean tree
- [ ] Step 2: Move `My Tools` to `Implemented, unverified` with evidence links
- [ ] Step 3: Commit `docs: promote tools`

# StrandCue Phase 1 Milestone 1 — My Shelf and Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a user to record owned products without requiring catalogue verification.

**Architecture:** Brands, products, immutable product versions, and successor relationships. Private user products and revision history. Manual products with private reported fields. Available/out-of-stock/archived lifecycle. Explicit matching of manual products to catalogue versions. Field-scoped provenance and verification status. Restricted operator workflow for verification. Shelf list, add, detail, edit, archive, history, and explicit-match screens on Android.

**Tech Stack:** TypeScript, Vitest, Supabase (PostgreSQL with RLS), Zod schemas, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 1 section)

**Acceptance Focus:** P1-AC-05, 10, 11, 12, 13 and 17

**Exit Gate:**
- Unknown products round-trip without inventing defaults
- Reformulation does not rewrite history; predecessor references stay unchanged
- Manual records remain private; other users cannot see manual data
- Verification cannot be set by consumers through the mobile API
- The Android Shelf journey works end-to-end: list → add → detail → edit → archive → history

**Global Constraints** (from design doc and PHASE_1.md):
- RLS on every exposed private table: `auth.uid() = user_id` owner conditions on SELECT/DELETE
- Both USING/WITH CHECK for UPDATE on private tables
- Composite `(id,user_id)` foreign keys on private relationships prevent cross-owner references
- JSONB snapshots must use shared validated schemas, not arbitrary unrestricted blobs
- Categories are reported classifications, not efficacy verification
- Manual names or notes must not be published to global catalogue
- Matching later requires explicit confirmation and provenance; cannot silently convert
- Archive removes item from active list, not prior records
- Replacing a bottle of same formula preserves stable ownership identity
- Different formula creates new version/ownership link
- Historical activity snapshots retain originally known identity and optional later resolution separately
- Verification is scoped to fields/claims; verified name does not verify ingredients or safety claims
- Verification decisions append independently; current status can change without rewriting original
- Privileged review is server-side and audited; consumer updates cannot set verified status
- Reformulation is a version relationship/reason, not a replacement for verification state
- Two dimensions: verification = unverified/pending_verification/partially_verified/verified/conflicting_information; lifecycle = active/retired
- Provision schema supports claim/source records and source kinds in master PRD section 5
- No evidence ranking engine, published fit score, outcome feedback algorithm or scientifically_proven boolean
- Show factual provenance/status only; notes not analysed for safety/medical facts
- Short notes default max 2,000 characters
- No third-party advertising SDK
- Separate development/staging/production; no real user data in fixtures

## Tasks

### Task 1.1: Define database schema for brands, products, product_versions, and successors
- [ ] **Step 1:** Review existing supabase/migrations for existing schema patterns
- [ ] **Step 2:** Create migration for `brands` table: id, name, created_at, updated_at
- [ ] **Step 3:** Create migration for `products` table: id, brand_id (FK), name, category, market, created_at, updated_at
- [ ] **Step 4:** Create migration for `product_versions` table: id, product_id (FK), variant, market, formulation_ref, structured_directions, ingredients (JSONB), status, verified_at, successor_version_id (self-referencing FK), created_at, updated_at
- [ ] **Step 5:** Add RLS policies: brands SELECT/INSERT only with `auth.uid()` context; products SELECT with owner check; product_versions SELECT public, INSERT/UPDATE with owner check
- [ ] **Step 6:** Run `npm run typecheck:domain` to verify Zod schemas match database

**Interfaces:**
- Consumes: None (new schema)
- Produces: Database tables with RLS, Zod schemas matching

**Step 1:** Run `npx supabase migration new brands_products_product_versions` — create migration file
**Step 2:** Define `brands` table schema with id, name, slug, created_at, updated_at
**Step 3:** Define `products` table with id, brand_id (FK to brands), name, category, market (enum: ZA/unknown), created_at, updated_at
**Step 4:** Define `product_versions` table with all fields from design doc, successor_version_id self-referencing FK
**Step 5:** Apply RLS policies via `supabase gen rls` or manual SQL
**Step 6:** Run `npm run typecheck:domain` — ensure Zod schemas in `packages/domain/src/services.ts` match

### Task 1.2: Implement private user products (user_products) and revision history
- [ ] **Step 1:** Create migration for `user_products` table: id, owner (FK to auth.users), product_version (FK nullable), manual_brand, manual_name, manual_category, availability (enum: available/out_of_stock/archived), matched_at (timestamptz nullable), match_confirmed boolean, created_at, updated_at
- [ ] **Step 2:** Create migration for `user_product_revisions` table: id, user_product_id (FK), base_revision, changed_fields (JSONB), new_values (JSONB), effective_at, recorded_at, correction_id nullable, created_at
- [ ] **Step 3:** Implement RLS: user_products SELECT/INSERT with `auth.uid() = owner`; user_product_revisions SELECT with owner check
- [ ] **Step 4:** Create Zod schemas in `packages/domain/src/services.ts` for user products and revisions
- [ ] **Step 5:** Run `npm run typecheck:domain` — verify types

**Interfaces:**
- Consumes: brands, products, product_versions tables from Task 1.1
- Produces: user_products and user_product_revisions tables with owner isolation

**Step 1:** Run `npx supabase migration new user_products_revisions` — create migration
**Step 2:** Define `user_products` table with owner FK, product_version FK (nullable), manual fields, availability
**Step 3:** Define `user_product_revisions` with base_revision, changed_fields, new_values, effective_at, recorded_at
**Step 4:** Add RLS policies: `auth.uid() = owner` for SELECT/INSERT on user_products
**Step 5:** Add RLS: owner check for SELECT on user_product_revisions
**Step 6:** Create Zod schemas: `UserProductSchema`, `UserProductRevisionSchema` in `packages/domain/src/services.ts`
**Step 7:** Run `npm run typecheck:domain` — confirm no type errors

### Task 1.3: Manual product-to-catalogue matching workflow
- [ ] **Step 1:** Create API route/endpoint `POST /shelf/manual-match` — takes manual product ID, catalogue product version ID
- [ ] **Step 2:** Implement match logic: compare manual_brand/name against catalogue brand/name/variant; require explicit user confirmation
- [ ] **Step 3:** On match: set `user_products.matched_at = now()`, `matched = true`, link to catalogue version
- [ ] **Step 4:** On no match: keep `matched = false`, manual fields remain private
- [ ] **Step 5:** Create Zod schema for match request/response
- [ ] **Step 6:** Add RLS: only owner can match their own manual products

**Interfaces:**
- Consumes: user_products from Task 1.2, product_versions from Task 1.1
- Produces: match confirmation, private linkage, no public exposure

**Step 1:** In `supabase/functions/shelf-functions.ts`, create `manualMatch` function
**Step 2:** Implement match logic: compare manual_brand against product.brand.name, manual_name against product.name, manual_category against product.category
**Step 3:** Return match result with requires_confirmation flag
**Step 4:** Create `manualMatchSchema` Zod schema in `packages/domain/src/services.ts`
**Step 5:** Add RLS: `auth.uid() = owner` on user_products for UPDATE during match
**Step 6:** Run `npm run typecheck:domain` — verify schema types

### Task 1.4: Shelf list, add, detail, edit, archive screens (Android UI)
- [ ] **Step 1:** Create `ShelfScreen.tsx` in `apps/mobile/src/screens/` with list view
- [ ] **Step 2:** Implement `ShelfListItem` component showing brand, name, availability status
- [ ] **Step 3:** Create `ShelfAddScreen.tsx` with brand search, manual entry option, product/category selection
- [ ] **Step 4:** Implement `ShelfDetailScreen.tsx` showing product version info, availability toggle, match button
- [ ] **Step 5:** Create `ShelfEditScreen.tsx` for updating availability, notes, match status
- [ ] **Step 6:** Create `ShelfArchiveScreen.tsx` for archiving (removes from active list, preserves history)
- [ ] **Step 7:** Integrate with Supabase RLS queries — all reads respect `auth.uid() = owner`
- [ ] **Step 8:** Add TypeScript types for shelf items

**Interfaces:**
- Consumes: user_products, product_versions from database tasks
- Produces: Android UI screens for complete shelf management

**Step 1:** Run `cd apps/mobile && npx expo start --web` to verify project compiles
**Step 2:** Create `ShelfScreen.tsx` with FlatList of shelf items from `supabase from('user_products').select('*').eq('owner', auth.uid())`
**Step 3:** Create `ShelfAddScreen.tsx` with brand picker (from brands table) and manual entry fields
**Step 4:** Create `ShelfDetailScreen.tsx` showing product version details, availability switch, explicit match button
**Step 5:** Create `ShelfEditScreen.tsx` for updating availability (available/out_of_stock/archived) and adding notes
**Step 6:** Create `ShelfArchiveScreen.tsx` — on archive, set availability to 'archived', preserve historical records
**Step 7:** Add TypeScript types: `ShelfItem`, `ShelfProductVersion`, `ShelfAvailability`
**Step 8:** Run Android emulator tests: `npx expo run:android` — verify screens render without errors

### Task 1.5: Shelf history screen with revision traversal
- [ ] **Step 1:** Create `ShelfHistoryScreen.tsx` showing revision history for a product
- [ ] **Step 2:** Implement traversal of `user_product_revisions` — show base revision, changes, effective dates
- [ ] **Step 3:** Display predecessor/successor links if reformulated
- [ ] **Step 4:** Add RLS: only owner can view their own history
- [ ] **Step 5:** Add TypeScript types for history entries

**Interfaces:**
- Consumes: user_product_revisions from Task 1.2
- Produces: Android history screen showing product revision timeline

**Step 1:** Query `user_product_revisions` with `user_product_id` and `owner = auth.uid()`
**Step 2:** Map revisions to `ShelfHistoryEntry` type: { id, base_revision, changed_fields, new_values, effective_at, recorded_at }
**Step 3:** Display revision chain: base → changes → new version
**Step 4:** If reformulated, show successor/predecessor links via `successor_version_id`
**Step 5:** Add `ShelfHistoryEntry` TypeScript type
**Step 6:** Test on Android emulator — verify history shows correct revision chain

### Task 1.6: Restricted operator workflow for verification
- [ ] **Step 1:** Create reviewed seed workflow or restricted RPC for verification recording
- [ ] **Step 2:** Implement `recordVerification` RPC — takes product_version_id, verification_status, reviewed_fields, source_url, limitations, reviewer
- [ ] **Step 3:** RLS: only service-role or reviewed operator can call; consumers denied
- [ ] **Step 4:** Create Zod schema for verification record input
- [ ] **Step 5:** Add API endpoint for operator workflow

**Interfaces:**
- Consumes: product_versions, claims from design doc
- Produces: verified verification status appended independently; consumer cannot set

**Step 1:** In `supabase/functions/verification-functions.ts`, create `recordVerification` function
**Step 2:** Define input schema: { product_version_id: string, verification_code: 'unverified'|'pending'|'partial'|'verified'|'conflicting', reviewed_fields: string[], source_url: string, limitations: string, reviewer: string, status: string }
**Step 3:** RLS: only servicerole or defined invoker can execute; authenticated users DENIED
**Step 3:** Create `RecordVerificationSchema` Zod schema in `packages/domain/src/services.ts`
**Step 4:** Add API route `POST /api/verification/record` that calls the RPC
**Step 5:** Test that authenticated user gets permission denied; service role can record
**Step 6:** Run `npm run typecheck:domain` — verify RPC schema types

---
# StrandCue Phase 1 Milestone 2 — My Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users privately record tools and their known capabilities without inventing temperatures or heat exposure.

**Architecture:** Tool brands, tools, immutable versions, successors and provenance. Private manual or catalogue-linked ownership. Tool type and temperature capability states (yes/no/unknown). Reported settings, temperature and wattage with explicit unknowns. Availability/archive history. Explicit manual-to-catalogue matching. Tools list, add, detail, edit, archive and history screens on Android.

**Tech Stack:** TypeScript, Vitest, Supabase (PostgreSQL with RLS), Zod schemas, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 2 section)

**Acceptance Focus:** P1-AC-05, 11, 12, 13 and 17

**Exit Gate:**
- Tools preserve historical identity; corrections create replacement revisions with `corrects_id`
- Unknown values remain unknown; do not invent numeric settings or assume all devices within a brand behave alike
- Accessories (diffusers, etc.) are not inferred as heat sources
- All private relationships enforce owner isolation (RLS: `auth.uid() = user_id`)
- The Android Tools journey works end-to-end

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints as Milestone 1 (auth.uid() = user_id on private tables)
- JSONB snapshots use validated schemas
- Categories are reported classifications, not efficacy verification
- Manual names/notices not published globally
- Verification scoped to fields/claims only
- Two verification dimensions: status and lifecycle
- No evidence ranking engines or automated trust
- Short notes max 2,000 chars
- No third-party advertising SDK
- Separate dev/staging/prod; no real user data in fixtures
- Tool types: dryer, heated-air brush, air styler, flat iron, curling iron, hot comb, hood dryer, steam straightener, unheated/heated rollers, diffusers/accessories do not become independent heat sources
- Wattage is not temperature; "heated air" is not heat-free
- Steam tool not automatically approved for wet hair
- Unknown temperature remains unknown; do not invent numeric settings

## Tasks

### Task 2.1: Define database schema for tool brands, tools, tool_versions, and user_tools
- [ ] **Step 1:** Create migration for `tool_brands` table: id, name, created_at, updated_at
- [ ] **Step 2:** Create migration for `tools` table: id, brand_id (FK), name, tool_type (enum), created_at, updated_at
- [ ] **Step 3:** Create migration for `tool_versions` table: id, tool_id (FK), version, market, capabilities (JSONB), temperature_yes_no_unknown (enum), reported_temperature nullable, wattage nullable, provenance, successor_version_id self-referencing FK, created_at, updated_at
- [ ] **Step 4:** Create migration for `user_tools` table: id, owner (FK to auth.users), tool_version (FK nullable), manual_identity, capabilities (JSONB), availability (enum: available/out_of_stock/archived), matched_at nullable, match_confirmed boolean, created_at, updated_at
- [ ] **Step 5:** Create migration for `user_tool_revisions` table: id, user_tool_id (FK), base_revision, changed_fields (JSONB), new_values (JSONB), effective_at, recorded_at, correction_id nullable, created_at
- [ ] **Step 6:** Implement RLS: tool_brands SELECT public; tools/tool_versions SELECT with owner check; user_tools SELECT/INSERT with `auth.uid() = owner`; user_tool_revisions SELECT with owner check
- [ ] **Step 7:** Create Zod schemas in `packages/domain/src/services.ts` for all tool types
- [ ] **Step 8:** Run `npm run typecheck:domain` — verify all tool schemas

**Interfaces:**
- Consumes: None (new schema)
- Produces: Database tables with RLS, Zod schemas matching tool types

**Step 1:** Run `npx supabase migration new tool_brands_tools_user_tools` — create migration file
**Step 2:** Define `tool_brands` table with id, name, slug, created_at, updated_at
**Step 3:** Define `tools` table with id, brand_id (FK), name, tool_type enum: ['dryer','heated-air-brush','air-styler','flat-iron','curling-iron','hot-comb','hood-dryer','steam-straighter','unheated-rollers','diffusers','other']
**Step 4:** Define `tool_versions` table with all fields from design doc, temperature_yes_no_unknown enum, wattage nullable, successor_version_id self-referencing FK
**Step 5:** Define `user_tools` with owner FK, tool_version FK (nullable), manual_identity, capabilities JSONB, availability enum
**Step 6:** Define `user_tool_revisions` with base_revision, changed_fields, new_values, effective_at, recorded_at
**Step 6:** Add RLS policies via supabase gen rls or manual SQL
**Step 7:** Create Zod schemas: `ToolBrandSchema`, `ToolSchema`, `ToolVersionSchema`, `UserToolSchema`, `UserToolRevisionSchema` in `packages/domain/src/services.ts`
**Step 8:** Run `npm run typecheck:domain` — confirm no type errors

### Task 2.2: Manual tool-to-catalogue matching workflow
- [ ] **Step 1:** Create API route/endpoint `POST /tools/manual-match` — takes manual tool ID, catalogue tool version ID
- [ ] **Step 2:** Implement match logic: compare manual_brand/name against catalogue brand/name/model; require explicit user confirmation
- [ ] **Step 3:** On match: set `user_tools.matched_at = now()`, `matched = true`, link to catalogue version
- [ ] **Step 4:** On no match: keep `matched = false`, manual fields remain private and labelled unverified
- [ ] **Step 5:** Create Zod schema for match request/response
- [ ] **Step 6:** Add RLS: only owner can match their own manual tools

**Interfaces:**
- Consumes: user_tools from Task 2.1, tool_versions from Task 2.1
- Produces: match confirmation, private linkage, no public exposure

**Step 1:** In `supabase/functions/tools-functions.ts`, create `manualMatch` function
**Step 2:** Implement match logic: compare manual_brand against tool.brand.name, manual_name against tool.name, manual model against tool model variant
**Step 3:** Return match result with requires_confirmation flag
**Step 4:** Create `manualMatchSchema` Zod schema in `packages/domain/src/services.ts`
**Step 5:** Add RLS: `auth.uid() = owner` on user_tools for UPDATE during match
**Step 6:** Run `npm run typecheck:domain` — verify schema types

### Task 2.3: Tools list, add, detail, edit, archive screens (Android UI)
- [ ] **Step 1:** Create `ToolsScreen.tsx` in `apps/mobile/src/screens/` with list view
- [ ] **Step 2:** Implement `ToolsListItem` component showing brand, model, type icon, availability status
- [ ] **Step 3:** Create `ToolsAddScreen.tsx` with brand search, manual entry option, tool type selection, capability fields
- [ ] **Step 4:** Implement `ToolsDetailScreen.tsx` showing tool version info, temperature settings, wattage, availability toggle, match button
- [ ] **Step 5:** Create `ToolsEditScreen.tsx` for updating availability, reported temperature, wattage, capabilities
- [ ] **Step 6:** Create `ToolsArchiveScreen.tsx` for archiving (removes from active list, preserves history)
- [ ] **Step 7:** Integrate with Supabase RLS queries — all reads respect `auth.uid() = owner`
- [ ] **Step 8:** Add TypeScript types for tool items

**Interfaces:**
- Consumes: tool_brands, tools, tool_versions, user_tools from database tasks
- Produces: Android UI screens for complete tools management

**Step 1:** Verify project compiles: `cd apps/mobile && npx expo start --web`
**Step 2:** Create `ToolsScreen.tsx` with FlatList of tool items from `supabase from('user_tools').select('*').eq('owner', auth.uid())`
**Step 3:** Create `ToolsAddScreen.tsx` with tool type picker and manual entry fields (type, model, temperature yes/no/unknown, wattage optional)
**Step 4:** Create `ToolsDetailScreen.tsx` showing tool version details, temperature capability switch, reported temperature field, wattage field, explicit match button
**Step 5:** Create `ToolsEditScreen.tsx` for updating availability, temperature capability, reported temperature (when known), wattage (when known), capabilities checkboxes
**Step 5:** Create `ToolsArchiveScreen.tsx` — on archive, set availability to 'archived', preserve historical records
**Step 6:** Add TypeScript types: `ToolItem`, `ToolVersion`, `ToolAvailability`, `ToolTemperatureCapability`
**Step 7:** Test on Android emulator — verify screens render without errors and RLS filters correct data

### Task 2.4: Tools history screen with revision traversal
- [ ] **Step 1:** Create `ToolsHistoryScreen.tsx` showing revision history for a tool
- [ ] **Step 2:** Implement traversal of `user_tool_revisions` — show base revision, changes, effective dates
- [ ] **Step 3:** Display predecessor/successor links if reformulated
- [ ] **Step 4:** Add RLS: only owner can view their own history
- [ ] **Step 5:** Add TypeScript types for history entries

**Interfaces:**
- Consumes: user_tool_revisions from Task 2.1
- Produces: Android history screen showing tool revision timeline

**Step 1:** Query `user_tool_revisions` with `user_tool_id` and `owner = auth.uid()`
**Step 2:** Map revisions to `ToolsHistoryEntry` type: { id, base_revision, changed_fields, new_values, effective_at, recorded_at }
**Step 3:** Display revision chain: base → changes → new version
**Step 4:** If reformulated, show successor/predecessor links via `successor_version_id`
**Step 5:** Add `ToolsHistoryEntry` TypeScript type
**Step 6:** Test on Android emulator — verify history shows correct revision chain

### Task 2.5: Restricted operator workflow for tool verification
- [ ] **Step 1:** Create reviewed seed workflow or restricted RPC for tool verification recording
- [ ] **Step 2:** Implement `recordToolVerification` RPC — takes tool_version_id, verification_status, reviewed_fields, source_url, limitations, reviewer
- [ ] **Step 3:** RLS: only service-role or reviewed operator can call; consumers denied
- [ ] **Step 4:** Create Zod schema for tool verification record input
- [ ] **Step 5:** Add API endpoint for operator workflow

**Interfaces:**
- Consumes: tool_versions from Task 2.1
- Produces: verified verification status appended independently; consumer cannot set

**Step 1:** In `supabase/functions/verification-functions.ts` (or tools-specific), create `recordToolVerification` function
**Step 2:** Define input schema: { tool_version_id: string, verification_code: 'unverified'|'pending'|'partial'|'verified'|'conflicting', reviewed_fields: string[], source_url: string, limitations: string, reviewer: string, status: string }
**Step 3:** RLS: only servicerole or defined invoker can execute; authenticated users DENIED
**Step 3:** Create `RecordToolVerificationSchema` Zod schema in `packages/domain/src/services.ts`
**Step 4:** Add API route `POST /api/tool-verification/record` that calls the RPC
**Step 4:** Test that authenticated user gets permission denied; service role can record
**Step 5:** Run `npm run typecheck:domain` — verify RPC schema types

---
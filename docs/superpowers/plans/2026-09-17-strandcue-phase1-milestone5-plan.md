# StrandCue Phase 1 Milestone 5 — Account Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a private, readable export of all user-owned Phase 1 information.

**Architecture:** Durable export job states. Recent-auth requirement. Owner-only JSON and CSV generation. Current and historical Passport, services, Shelf, Tools and activities. Relevant catalogue-version and provenance snapshots. Expiring download authorization. Object deletion within configured retention window. Status, retry and failure display. No public storage URLs.

**Tech Stack:** TypeScript, Vitest, Supabase (Auth + Storage), Zod schemas, Node.js for export job processing, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 5 section)

**Acceptance Focus:** P1-AC-19 and 17

**Exit Gate:**
- An authenticated user can request and download only their own complete readable data
- Expired links and foreign access fail safely
- Export follows the final Activities schema so it does not need immediate redesign
- Durable export job states survive partial failure; retry is idempotent

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints (auth.uid() = user_id on private tables)
- Export includes readable JSON/CSV of current/history records, manual items and relevant linked version/provenance information
- No other users' records in export
- Recent-auth export is private, download access expires after 24 hours, output removed within 7 days (defaults)
- Make errors/status visible; do not provide public storage URLs
- Export follows Activities schema so it does not need immediate redesign
- Deletion follows export because it must clean up export jobs and files
- Output removed within 7 days (defaults); download access expires after 24 hours
- No raw hair notes, concern lists, or exact service history in export output
- TLS, platform-secure token storage, input length/type limits, escaped user content, dependency/secret checks and log redaction
- No passwords, callback URLs, emails, usernames, hair narratives or exact service history in logs/analytics
- Short notes default max 2,000 characters
- No third-party advertising SDK
- Separate development/staging/production; no real user data in fixtures

## Tasks

### Task 5.1: Export job state machine and recent-auth requirement
- [ ] **Step 1:** Create `export_jobs` table: id, owner (FK to auth.users), purpose (enum: export/delete), status (enum: pending/processing/completed/failed), data_scope (JSONB), file_url nullable, created_at, completed_at, expires_at, retry_count integer default 0, max_retries integer default 3
- [ ] **Step 2:** Implement RPC `request_export` — takes purpose, validates recent-auth, creates export job, returns job ID
- [ ] **Step 3:** Implement status check RPC `export_job_status` — takes job ID, returns current state
- [ ] **Step 4:** RLS: only owner can create/check their own export jobs; foreigners DENIED
- [ ] **Step 5:** Create Zod schemas for export request and status response

**Interfaces:**
- Consumes: purpose (export/delete), recent-auth token/context
- Produces: export job ID, status, expires_at, download URL (time-limited)

**Step 1:** Run `npx supabase migration new export_jobs_table` — create export_jobs table with all fields
**Step 2:** Create `request_export` RPC: validate recent-auth (token within 24h window), insert export job with status=pending, data_scope listing what entities to include
**Step 3:** Create `export_job_status` RPC: takes job_id, returns current status, progress, expires_at, download URL (signed, expires in 24h)
**Step 4:** Add RLS policies: owner SELECT/INSERT on export_jobs; foreigners DENIED SELECT
**Step 5:** Create `ExportJobRequestSchema` and `ExportJobStatusSchema` Zod schemas in `packages/domain/src/services.ts`
**Step 6:** Run `npm run typecheck:domain` — verify RPC schema types
**Step 7:** Test: request export → job created, returns job ID; check status → progresses from pending to completed; expired job → fails gracefully

### Task 5.2: JSON and CSV generation of owner-owned data
- [ ] **Step 1:** Implement export data collector — queries current/history Passport, services, Shelf, Tools, activities under RLS with owner = auth.uid()
- [ ] **Step 2:** Generate JSON format: structured, complete records with catalogue-version and provenance snapshots
- [ ] **Step 3:** Generate CSV format: flattened, human-readable format for current/history records, manual items, provenance snapshots
- [ ] **Step 4:** Ensure no other users' records included; no raw hair notes, concern lists, or exact service history
- [ ] **Step 5:** Add RLS: collector runs with owner's RLS context only

**Interfaces:**
- Consumes: export job ID, data_scope from job creation
- Produces: JSON file bytes, CSV file bytes, both owner-only

**Step 1:** In `supabase/functions/export-functions.ts`, create `generateExportData` function
**Step 2:** Query `passports` with `owner = auth.uid()` — include current and as-of projections
**Step 3:** Query `hair_passport_revisions` with owner FK — historical revisions
**Step 4:** Query `chemical_services` and `service_revisions` with owner FK — all services and corrections
**Step 5:** Query `shelf_items` and `user_product_revisions` with owner FK — all shelf items and revision history
**Step 6:** Query `user_tools` and `user_tool_revisions` with owner FK — all tools and revision history
**Step 7:** Query `activities` and `heat_events` with owner FK — all wash/styling/heat events
**Step 8:** Query relevant catalogue-version and provenance snapshots from product_versions, claims, verification events
**Step 9:** Assemble JSON structure matching export spec: { passport, services, shelf, tools, activities, provenance, generated_at }
**Step 10:** Generate CSV: flatten records to rows: { entity_type, id, version, status, key_fields... }
**Step 11:** Ensure no raw hair notes, concern lists, or exact service history in output
**Step 12:** Create `ExportJsonSchema`, `ExportCsvSchema` Zod schemas in `packages/domain/src/services.ts`
**Step 12:** Run `npm run typecheck:domain` — verify export data schemas types
**Step 12:** Test: export JSON includes only owner's data; export CSV is readable; no foreign records included; no raw notes in output

### Task 5.3: Expiring download authorization and retention
- [ ] **Step 1:** Implement signed URL generation for export files with 24-hour access expiration
- [ ] **Step 2:** Implement file deletion within 7 days of export completion
- [ ] **Step 3:** Track `expires_at` on export job; after 7 days, automatically purge file and job
- [ ] **Step 4:** Display download expiry status to user

**Interfaces:**
- Consumes: export job ID, signed URL request
- Produces: time-limited download URL, file retention status

**Step 1:** Use Supabase Storage signed URLs: `supabase.storage.from('exports').createSignedURL(file_path, 86400)` — 86400 seconds = 24 hours
**Step 2:** Set `expires_at` on export job = now() + 7 days
**Step 3:** Create background job or cron that purges export files and jobs after 7 days
**Step 4:** On status check, display download expiry: "Download link expires in X hours" or "Link expired, request new export"
**Step 4:** Create `ExportUrlSchema` Zod schema in `packages/domain/src/services.ts`
**Step 5:** Run `npm run typecheck:domain` — verify URL schema types
**Step 6:** Test: request export → get signed URL → use within 24h → file downloads; after 24h → URL returns 403/expired; after 7 days → job and file auto-purged

### Task 5.4: Export error handling and status display
- [ ] **Step 1:** Implement export failure states — retry logic, error display, user-visible messages
- [ ] **Step 2:** Implement retry idempotency — same job ID + retry creates new attempt, does not duplicate data
- [ ] **Step 3:** Display status: pending, processing, completed, failed with reasons
- [ ] **Step 4:** Add TypeScript types for export status

**Interfaces:**
- Consumes: export job ID, retry attempt
- Produces: status display, error messages, retry option

**Step 1:** In export job status RPC, include `error` field if failed: { code, message, retryable }
**Step 2:** Implement retry: same job ID increments `retry_count`, creates new processing attempt, does not duplicate exported data
**Step 3:** Display UI: "Export in progress", "Export completed - download link expires in 24 hours", "Export failed - retry"
**Step 4:** Add TypeScript types: `ExportStatus`, `ExportError`, `ExportRetryResult`
**Step 5:** Run `npm run typecheck:domain` — verify export status types
**Step 6:** Test: force export failure → status shows "failed" with retry option → retry → succeeds or shows final error

---
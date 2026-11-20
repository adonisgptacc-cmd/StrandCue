# StrandCue Phase 1 Milestone 6 — Account Deletion and Restore Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deletion durable, resumable and effective even with old tokens or restored backups.

**Architecture:** Account states including active and deleting. Immediate access block. Durable privacy job and tombstone. Refresh-session revocation. Ordered purge of records and generated exports. Auth identity deletion after dependants. Idempotent retry after partial failure. Old-access-token denial. Tombstone survival after Auth deletion. Restore procedure that reapplies tombstones before reopening service. User-visible status and support path.

**Tech Stack:** TypeScript, Vitest, Supabase (Auth + PostgreSQL with RLS), Zod schemas, Node.js for deletion job processing, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 6 section)

**Acceptance Focus:** P1-AC-20 and 17

**Exit Gate:**
- Failed deletion resumes safely; old JWTs cannot access personal data
- Restored deleted data is purged again; only the minimum protected operational mapping remains
- Tombstone survives after Auth deletion without cascading away
- Restore procedure reapplies tombstones before reopening service

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints (auth.uid() = user_id on private tables)
- Account states: active, deleting, deleted
- Deletion immediately marks account "deleting" and blocks data access through policies/services
- Refresh sessions revoked on deletion
- Purge of records and generated exports is ordered (export first, then deletion)
- Auth identity deletion happens after dependants (export jobs, tombstones) are handled
- Operational/security logs default 30 days without hair payloads
- Personal history remains while the account is active unless a user exercises correction/deletion rights
- Tombstone survival after Auth deletion without cascading away
- Restore procedure reapplies tombstones before reopening service
- Idempotent retry after partial failure
- Old-access-token denial
- No passwords, callback URLs, emails, usernames, hair narratives or exact service history in logs/analytics
- Short notes default max 2,000 characters
- No third-party advertising SDK
- Separate development/staging/production; no real user data in fixtures
- Export must complete before deletion proceeds (export jobs referenced, then terminated)

## Tasks

### Task 6.1: Account states and immediate access block
- [ ] **Step 1:** Add `account_status` column to `profiles` table: enum ('active', 'deleting', 'deleted')
- [ ] **Step 2:** Implement RLS policy: when `account_status = 'deleting'`, block ALL data SELECT except admin-led tombstone operations
- [ ] **Step 3:** Implement deletion trigger: on deletion request, immediately set `account_status = 'deleting'`, block all data access
- [ ] **Step 4:** Create Zod schema for deletion request validation
- [ ] **Step 5:** Run `npm run typecheck:domain` — verify account status types

**Interfaces:**
- Consumes: deletion request from UI/admin
- Produces: account status changed to 'deleting', immediate data access block

**Step 1:** Run `npx supabase migration new account-status` — add `account_status enum('active','deleting','deleted') default 'active'` to profiles
**Step 2:** Add RLS policy: `WHEN (account_status != 'deleting') FOR SELECT USING (auth.uid() = owner)` — blocking SELECT when deleting
**Step 3:** In `supabase/functions/profile-functions.ts`, create `requestDeletion` function: first check recent-auth, then set `account_status = 'deleting'`
**Step 4:** Create `DeletionRequestSchema` Zod schema in `packages/domain/src/services.ts`
**Step 4:** Run `npm run typecheck:domain` — verify account status types
**Step 5:** Test: deletion request → account_status → 'deleting' → all data SELECT blocked for that user

### Task 6.2: Durable privacy job and tombstone
- [ ] **Step 1:** Create `privacy_jobs` table: id, owner (FK to auth.users), type (enum: export/delete), status (enum: pending/processing/completed/failed), related_export_id nullable, tombstone_data (JSONB), created_at, completed_at, depends_on_export_ids (text[] nullable)
- [ ] **Step 2:** On deletion request, create privacy_job with type='delete', status='pending', tombstone_data containing minimal mapping needed for retries/restores
- [ ] **Step 3:** RLS: owner can SELECT their own privacy_job; foreigners DENIED
- [ ] **Step 3:** Create `PrivacyJobSchema` Zod schema in `packages/domain/src/services.ts`

**Interfaces:**
- Consumes: deletion request, recent-auth token
- Produces: privacy_job created, tombstone_data stored, status pending

**Step 1:** Run `npx supabase migration new privacy-jobs-table` — create privacy_jobs table with all fields
**Step 2:** On deletion request, insert privacy_job: owner FK, type='delete', status='pending', tombstone_data = { owner_id, export_job_ids, minimal_mapping }, created_at
**Step 3:** Add RLS: owner SELECT on own privacy_job; foreigners DENIED
**Step 3:** Create `PrivacyJobSchema` Zod schema in `packages/domain/src/services.ts`
**Step 3:** Test: deletion request → privacy_job created with tombstone_data → owner can view; foreigners DENIED SELECT

### Task 6.3: Refresh-session revocation on deletion
- [ ] **Step 1:** Implement deletion flow that revokes all refresh sessions for the deleting account
- [ ] **Step 2:** Use Supabase Auth session revocation APIs
- [ ] **Step 3:** Ensure no new sessions can be created for deleting/deleted account
- [ ] **Step 4:** Add TypeScript types for session revocation

**Interfaces:**
- Consumes: deleting account owner ID
- Produces: all refresh sessions revoked, no new sessions possible

**Step 1:** In `requestDeletion` function, after setting account_status = 'deleting', call `auth.admin.revokeRefreshTokens(owner_id)`
**Step 2:** Add policy: when account_status = 'deleted', prevent new session creation via Supabase Auth config
**Step 3:** Test: deletion → all refresh tokens invalidated → attempts to re-login fail with clear message

### Task 6.4: Ordered purge of records and generated exports
- [ ] **Step 1:** Implement ordered purge: export jobs first (mark for termination), then purge records
- [ ] **Step 2:** Purge order: (1) export jobs and files, (2) privacy_job tombstones, (3) profile data, (4) personal history (if user exercised deletion rights)
- [ ] **Step 3:** Ensure idempotent retry after partial failure
- [ ] **Step 4:** Add TypeScript types for purge state

**Interfaces:**
- Consumes: privacy_job ID, account status
- Produces: ordered purge completed, minimum mapping retained

**Step 1:** In deletion flow, after privacy_job created: (1) terminate associated export jobs via Supabase Storage API, (2) delete export files from storage, (3) purge privacy_job to 'completed', (4) set profile account_status = 'deleted', (5) purge personal history records if user confirmed deletion
**Step 2:** Implement idempotent retry: if purge partial failure, retry from last completed step, do not re-purge already-completed steps
**Step 3:** Create `PurgeStep`, `PurgeResult` TypeScript types
**Step 3:** Run `npm run typecheck:domain` — verify purge types
**Step 4:** Test: partial failure → retry from last completed step → full purge completes; no double-purge of same data

### Task 6.5: Auth identity deletion after dependants
- [ ] **Step 1:** Implement deferred Auth identity deletion: only after export jobs completed, privacy_job completed, dependants cleared
- [ ] **Step 2:** Use Supabase Auth `admin.deleteUser()` only after all dependants cleared
- [ ] **Step 3:** Ensure tombstone survives Auth deletion without cascading away
- [ ] **Step 4:** Create TypeScript types for deletion state

**Interfaces:**
- Consumes: privacy_job completed, export_jobs completed, account_status = 'deleted'
- Produces: Auth user deleted, tombstone remains in privacy_jobs, no personal data accessible

**Step 1:** After privacy_job status = 'completed' AND export_jobs all status = 'completed': call `auth.admin.deleteUser(owner_id)`
**Step 2:** Tombstone (privacy_job row) remains after Auth deletion — does not cascade away
**Step 3:** Create `DeletionState` TypeScript type: { account_status, privacy_job_id, export_jobs_completed, auth_user_deleted, tombstone_preserved }
**Step 3:** Test: deletion flow → all dependants cleared → Auth user deleted → tombstone (privacy_job) still queryable; no personal data accessible via API

### Task 6.6: Restore procedure reapplies tombstones before reopening service
- [ ] **Step 1:** Implement restore procedure: reapply tombstone data before reopening account access
- [ ] **Step 2:** Ensure restore reapply minimal protected mapping needed for retries/restores
- [ ] **Step 3:** Ensure personal data is purged again after restore if re-deletion requested
- [ ] **Step 4:** Add TypeScript types for restore state

**Interfaces:**
- Consumes: tombstone_data from privacy_job, account_status = 'deleted'
- Produces: account restored, tombstone reapplied, personal data purged if re-deletion requested

**Step 1:** Create `restoreAccount` function: takes privacy_job_id, reapply tombstone_data to profiles (restore account_status = 'active', restore minimal mapping)
**Step 2:** After restore, personal data starts fresh; if user re-requests deletion, purge proceeds from clean state
**Step 3:** Create `RestoreResult` TypeScript type: { account_restored, tombstone_reapplied, data_purged_on_redeletion }
**Step 3:** Test: delete account → restore → account active again with preserved minimal mapping; re-deletion → purge from clean state

### Task 6.7: User-visible status and support path
- [ ] **Step 1:** Create UI displaying deletion status: "Deleting", "Deleted", "Restore pending"
- [ ] **Step 2:** Add support contact path per P1-PRIV-03 and P1-SAFE-03
- [ ] **Step 3:** Ensure no raw hair narratives, concern lists, or exact service history in status display
- [ ] **Step 4:** Add TypeScript types and integrate with navigation

**Interfaces:**
- Consumes: account status, privacy_job status
- Produces: Android status screen with support path, no raw data displayed

**Step 1:** Create `DeletionStatusScreen.tsx` showing: "Your account is being deleted", "Account successfully deleted", "Restore available"
**Step 2:** Add support/help links per P1-SAFE-03: "Severe acute reaction flows direct users to urgent help via locally reviewed copy"
**Step 3:** Ensure status display contains no raw hair notes, concern lists, or exact service history
**Step 4:** Add TypeScript types: `DeletionStatus`, `SupportPath`
**Step 4:** Integrate into Settings navigation drawer
**Step 4:** Test on Android emulator — verify status screen displays correctly, support path available, no raw data in display
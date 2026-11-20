# StrandCue Phase 1 Milestone 4 — Settings and Account Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete identity, credential, preference and session-lifecycle flows.

**Architecture:** Username change with 30-day rule and conflict handling. Email and password changes without changing owner UUID. Optional analytics consent disabled without affecting core functions. Cosmetic-record boundary and support/help route. Account/session information display. Owner-cache and local-draft cleanup on logout or account switch. Recent-auth foundation for export and deletion. Settings and privacy screens.

**Tech Stack:** TypeScript, Vitest, Supabase (Auth + PostgreSQL with RLS), Zod schemas, Expo Router, React Native

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 4 section)

**Acceptance Focus:** P1-AC-02, 03, 18, 21 and 23

**Exit Gate:**
- Credential changes retain all history (same UUID, complete history retained)
- Analytics refusal does not block adult use or core functions
- No previous-owner data appears after logout or switching accounts
- Account switching must never show the previous owner's data
- Recent-auth export is private, download access expires after 24 hours, output removed within 7 days (defaults)

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints (auth.uid() = user_id on private tables)
- Username policy: 3–24 lowercase ASCII letters, digits or underscores; trim and normalise before validation; reserve system/admin/brand-impersonation names
- Default change interval 30 days; handle concurrent claims with conflict response and preserved form state
- Store past handle changes only in minimal private account audit; do not make public
- Support logout, email/password changes and session expiry without losing history
- UUID stays constant when credentials/username change
- Store sessions in platform-secure storage through tested adapter
- Logout/account switch clears owner caches and prevents disclosure on shared devices
- Sensitive export/deletion require recent authentication
- Export includes readable JSON/CSV of current/history records, manual items and relevant linked version/provenance info
- No other users' records in export
- Recent-auth export private, download access expires after 24 hours, output removed within 7 days (defaults)
- Make errors/status visible; do not provide public storage URLs
- Account states: active, deleting, deleted
- Deletion immediately marks account "deleting" and blocks data access through policies/services
- Refresh sessions revoked on deletion
- Purge of records and generated exports is ordered (export first, then deletion)
- Auth identity deletion happens after dependants (export jobs, tombstones) are handled
- Operational/security logs default 30 days without hair payloads
- Personal history remains while the account is active unless a user exercises correction/deletion rights
- TLS, platform-secure token storage, input length/type limits, escaped user content, dependency/secret checks and log redaction
- No passwords, callback URLs, emails, usernames, hair narratives or exact service history in logs/analytics
- Short notes default max 2,000 characters
- No third-party advertising SDK
- Separate development/staging/production; no real user data in fixtures

## Tasks

### Task 4.1: Username change with 30-day rule and conflict handling
- [ ] **Step 1:** Implement username validation schema: 3–24 lowercase ASCII letters, digits or underscores; trim and normalise before validation
- [ ] **Step 2:** Reserve system/admin/brand-impersonation names; reject during change validation
- [ ] **Step 3:** Enforce 30-day change interval; track last_changed_at on profiles table
- [ ] **Step 4:** Handle concurrent claims: conflict response with preserved form state, one succeeds one gets clear conflict
- [ ] **Step 5:** Store past handle changes in minimal private account audit; do not make public
- [ ] **Step 6:** Create Zod schema for username change in `packages/domain/src/services.ts`
- [ ] **Step 7:** Add RLS: only owner can change their own username
- [ ] **Step 8:** Run `npm run typecheck:domain` — verify username schema types

**Interfaces:**
- Consumes: current username, proposed new username
- Produces: username change success/failure with conflict handling

**Step 1:** In `supabase/functions/profile-functions.ts`, create `changeUsername` function
**Step 2:** Define validation: `z.string().min(3).max(24).regex(/^[a-z0-9_]+$/)` with trim
**Step 3:** Check `profiles.last_changed_at`; if within 30 days, return error with preserved form state
**Step 4:** Handle concurrent claims: if two users claim same username simultaneously, one succeeds, one gets `USERNAME_TAKEN` with entered data preserved
**Step 5:** On success, update `profiles.username`, `profiles.username_normalized`, set `last_changed_at = now()`
**Step 6:** Create `ChangeUsernameSchema` Zod schema in `packages/domain/src/services.ts`
**Step 7:** Add RLS: `auth.uid() = owner` on profiles for UPDATE during username change
**Step 7:** Test: change username within 30-day window → error; after 30 days → success; concurrent claim → conflict with data preserved

### Task 4.2: Email and password changes without changing owner UUID
- [ ] **Step 1:** Implement email change RPC — takes new email, validates format, updates profiles.email
- [ ] **Step 2:** Implement password change RPC — takes current password and new password, uses Supabase Auth APIs
- [ ] **Step 3:** Both flows must retain same owner UUID and complete history
- [ ] **Step 4:** Create Zod schemas for both change flows
- [ ] **Step 5:** Add RLS: only owner can change their own email/password

**Interfaces:**
- Consumes: current email/password, proposed new email/password
- Produces: email/password change success, same UUID retained, history intact

**Step 1:** Use Supabase Auth `updateUser` for email change: `auth.updateUser(user.id, { email: newEmail })`
**Step 3:** Update `profiles.email` with new email address
**Step 4:** For password change: use Supabase Auth `updatePassword` API: `auth.updatePassword(user.id, { password: newPassword })`
**Step 5:** Both must keep `auth.users.id` (the owner UUID) unchanged
**Step 6:** Create `ChangeEmailSchema` and `ChangePasswordSchema` Zod schemas in `packages/domain/src/services.ts`
**Step 6:** Add RLS: `auth.uid() = owner` on profiles for UPDATE during email/password change
**Step 7:** Test: change email → same UUID, history retained; change password → same UUID, history retained; old credentials still work until new password set

### Task 4.3: Optional analytics consent, disabled without affecting core functions
- [ ] **Step 1:** Add `analytics_consent` field to `profiles` table: boolean, default false
- [ ] **Step 2:** Implement settings screen toggle for analytics consent
- [ ] **Step 3:** Ensure all core functions work regardless of consent setting
- [ ] **Step 4:** Add RLS: owner can update their own analytics_consent
- [ ] **Step 5:** Create Zod schema for analytics consent update

**Interfaces:**
- Consumes: consent true/false from settings UI
- Produces: analytics consent stored; core functions unaffected

**Step 1:** Run `npx supabase migration new analytics-consent` — add `analytics_consent boolean default false` to profiles
**Step 2:** Create `SettingsScreen.tsx` with analytics consent toggle switch
**Step 3:** On toggle change, update `profiles.analytics_consent` via RPC or direct SQL with RLS
**Step 4:** Verify core functions (shelf, passport, activities) work with `analytics_consent = false`
**Step 5:** Create `AnalyticsConsentSchema` Zod schema in `packages/domain/src/services.ts`
**Step 6:** Test: toggle analytics off → core functions still work; toggle on → no unexpected data sent

### Task 4.4: Cosmetic-record boundary and support/help route screens
- [ ] **Step 1:** Create `CosmeticBoundaryScreen.tsx` displaying cosmetic-records boundary statement
- [ ] **Step 2:** Create `SupportHelpScreen.tsx` with support routes and help resources
- [ ] **Step 3:** Ensure no diagnosis, prescription, symptom assessment, or automatic interpretation of notes
- [ ] **Step 4:** Add support/help contact information without manufacturer connections
- [ ] **Step 5:** Add TypeScript types and integrate with navigation

**Interfaces:**
- Consumes: None (informational screens)
- Produces: Android screens for cosmetic boundary and support/help

**Step 1:** Create `CosmeticBoundaryScreen.tsx` with statement: "StrandCue provides cosmetic routine organisation, not diagnosis or treatment."
**Step 2:** Create `SupportHelpScreen.tsx` with support contacts, help resources, locally reviewed escalation copy info
**Step 3:** Ensure no medical advice, no symptom triage, no automatic note interpretation
**Step 4:** Add support contact info per SAFE-02: structured reports of active scalp reaction, pain, burns, open sores, suddenConcerning loss trigger reviewed escalation
**Step 5:** Add TypeScript types: `CosmeticBoundaryText`, `SupportHelpLinks`
**Step 6:** Integrate into Settings navigation drawer
**Step 6:** Test on Android emulator — verify screens display correctly, no medical claims

### Task 4.5: Account/session information display screen
- [ ] **Step 1:** Create `AccountInfoScreen.tsx` showing current account status, UUID (masked), email, username, login methods
- [ ] **Step 2:** Implement session information: last login, session active indicators
- [ ] **Step 2:** Add logout button that clears owner-cache and local-draft
- [ ] **Step 3:** Add account switch flow that never shows previous owner's data
- [ ] **Step 4:** Add TypeScript types and RLS-protected queries

**Interfaces:**
- Consumes: owner UUID, session data
- Produces: Android account info screen with logout/switch functionality

**Step 1:** Query `profiles` with `owner = auth.uid()` — display masked UUID, email, username, last_login
**Step 2:** Add session info: "Active sessions" count, session expiry indicators
**Step 3:** Implement logout: clear tokens, owner data caches, pending sensitive UI; prompt save/discard unsynced records
**Step 4:** Implement account switch: never show previous owner's data; fresh load from server with new owner's UUID
**Step 5:** Add TypeScript types: `AccountInfo`, `SessionInfo`, `LoginMethod`
**Step 6:** Test: logout → no previous owner data on login screen; account switch → new owner's data only

### Task 4.6: Recent-auth foundation for export and deletion
- [ ] **Step 1:** Implement recent-auth requirement check before export/deletion requests
- [ ] **Step 2:** Add recent-auth token validation middleware
- [ ] **Step 3:** Ensure export only includes owner's data; deletion blocks access immediately
- [ ] **Step 4:** Create Zod schemas for export/deletion recent-auth checks

**Interfaces:**
- Consumes: recent-auth token/context
- Produces: export/deletion gated by recent authentication

**Step 1:** Create auth middleware that validates user has recent authentication (within configured window, e.g., 24 hours)
**Step 2:** Export endpoint: `GET /api/export` — first validate recent-auth, then generate JSON/CSV of owner's data only
**Step 3:** Deletion endpoint: `POST /api/deletion` — first validate recent-auth, then mark account deleting, revoke sessions, start purge
**Step 3:** Create `RecentAuthCheckSchema`, `ExportSchema`, `DeletionSchema` Zod schemas in `packages/domain/src/services.ts`
**Step 4:** Test: without recent auth → export/deletion denied with clear message; with recent auth → proceeds safely

---
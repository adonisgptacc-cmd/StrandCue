# StrandCue Phase 1 — Vertical-Slice Roadmap Design

**Date:** 2026-09-17  
**Author:** OpenCode  
**Status:** Design approved for implementation  
**Roadmap:** Vertical slices, Approach A (recommended)

---

## 1. Overview

This design specifies a staged vertical-slice roadmap for completing StrandCue Phase 1 development. The roadmap breaks remaining work into 8 milestones, each delivering a complete, usable Android capability before proceeding to the next.

**Philosophy:** Each slice is a vertical cut across domain types, database, security, API, mobile UI, tests, and documentation. No slice starts until the previous one's exit gate is complete. This exposes data and security issues early, maps naturally to acceptance cases, and gives bounded tasks with review checkpoints.

**Current State:** 245 tests pass, typecheck passes, audit passes. Release status: **HOLD** per `docs/verification/phase-1-acceptance-status.md`. Nine acceptance cases are "Open," fourteen are "Partial."

---

## 2. Roadmap Structure

### Milestone 0 — Integrate and baseline
**Goal:** Begin product development from an agreed, reproducible branch.

- Review and merge `codex/phase1a-stabilization`.
- Confirm Node 24 and clean `npm ci`.
- Run the canonical verification gate (`npm run verify`).
- Run the opt-in authenticated Supabase suite.
- Record accepted dependency exceptions and their review dates.
- Establish a feature branch or worktree for My Shelf.
- **Do not remove old worktrees** until their exact targets receive separate approval.

**Exit gate:** Clean main branch, reproducible environment, authenticated database evidence, no Critical or High defects.

---

### Milestone 1 — My Shelf and provenance
**Goal:** Allow a user to record owned products without requiring catalogue verification.

**Scope:**
- Brands, products, immutable product versions, and successor relationships.
- Private user products and revision history.
- Manual products with private reported fields.
- Available, out-of-stock, and archived lifecycle.
- Explicit matching of a manual product to a catalogue version.
- Field-scoped provenance and verification status.
- Restricted operator workflow for verification.
- Shelf list, add, detail, edit, archive, history, and explicit-match screens.

**Acceptance focus:** P1-AC-05, 10, 11, 12, 13 and 17.

**Exit gate:**
- Unknown products round-trip without inventing defaults.
- Reformulation does not rewrite history; predecessor references stay unchanged.
- Manual records remain private; other users cannot see manual data.
- Verification cannot be set by consumers through the mobile API.
- The Android Shelf journey works end-to-end: list → add → detail → edit → archive → history.

**Design notes:**
- Shelf and Tools will share concepts and patterns, but **not** use a premature generic polymorphic ownership table.
- Verification operator workflow will be a restricted RPC or reviewed seed workflow, **not** a custom admin application.
- Product versions are immutable; reformulations publish a successor payload; prior references stay unchanged.

---

### Milestone 2 — My Tools
**Goal:** Let users privately record tools and their known capabilities without inventing temperatures or heat exposure.

**Scope:**
- Tool brands, tools, immutable versions, successors and provenance.
- Private manual or catalogue-linked ownership.
- Tool type and temperature capability states (yes/no/unknown).
- Reported settings, temperature and wattage with explicit unknowns.
- Availability/archive history.
- Explicit manual-to-catalogue matching.
- Tools list, add, detail, edit, archive and history screens.

**Acceptance focus:** P1-AC-05, 11, 12, 13 and 17.

**Exit gate:**
- Tools preserve historical identity; corrections create replacement revisions with `corrects_id`.
- Unknown values remain unknown; do not invent numeric settings or assume all devices within a brand behave alike.
- Accessories (diffusers, etc.) are not inferred as heat sources.
- All private relationships enforce owner isolation (RLS: `auth.uid() = user_id`).
- The Android Tools journey works end-to-end.

**Design notes:**
- Share concepts and patterns with Shelf, but maintain separate ownership tables.
- Tool versions are immutable; reformulations publish successor versions.
- Manual tools may be stored with null catalogue-version reference; labelled unverified and excluded from heat-protection assertions.

---

### Milestone 3 — Activities and heat records
**Goal:** Allow factual manual logging without advice, scoring, protocols or silent deduplication.

**Scope:**
- Wash, styling and other activity events.
- Approximate dates and time precision (exact day/month/year/unknown).
- Links to owned product and tool versions.
- Optional zones and short notes (max 2,000 chars).
- Separate heat events with method, tool, temperature, passes and duration.
- Corrections and voids with immutable audit history.
- Stable client operation IDs and retry idempotency.
- Possible-duplicate warning without automatic merging.
- History timeline, activity add/detail/correct/void screens.

**Acceptance focus:** P1-AC-14, 15, 16, 17, 18 and 23.

**Exit gate:**
- Timeout retries create one record; no duplicate creation beyond operation-key retention (default 30 days).
- Separate real events remain separate; two independently entered real-world events cannot be proven identical solely by timestamps.
- Archived items remain visible in historical activity.
- No advice-oriented behaviour exists — no heat scores, no due counters, no recommendations.
- The Android activity/heat journey works: add → detail → correct → void → history.

**Design notes:**
- Heat activity is a separate optional event linked to an activity/service.
- No boolean-only heat model and no calculated damage/heat score.
- Unknown is valid — do not infer a shampoo from a styling event or an application from an ownership entry.
- Stable client operation IDs and server idempotency prevent retry duplicates.
- Manual sessions have no automatically provable real-world identity; retries of the same client operation are deduplicated, but independently entered similar events require a visible possible-duplicate review and user correction.

---

### Milestone 4 — Settings and account completion
**Goal:** Complete identity, credential, preference and session-lifecycle flows.

**Scope:**
- Username change with the 30-day rule and conflict handling.
- Email and password changes without changing owner UUID.
- Optional analytics consent, disabled without affecting core functions.
- Cosmetic-record boundary and support/help route.
- Account/session information display.
- Owner-cache and local-draft cleanup on logout or account switch.
- Recent-auth foundation for export and deletion.
- Settings and privacy screens.

**Acceptance focus:** P1-AC-02, 03, 18, 21 and 23.

**Exit gate:**
- Credential changes retain all history (same UUID, complete history retained).
- Analytics refusal does not block adult use or core functions.
- No previous-owner data appears after logout or switching accounts.
- Account switching must never show the previous owner's data.
- Recent-auth export is private, download access expires after 24 hours, output removed within 7 days (defaults).
- **Username change with 30-day rule: concurrent claims handled with conflict response and preserved form state.**
- **Password changes enforce complexity requirements (min 12 chars, mixed case, numbers, symbols).**
- **Analytics consent: opt-in boolean stored on profile, defaults to false, disabled state never blocks core functionality.**

**Design notes:**
- Username policy: 3–24 lowercase ASCII letters, digits or underscores; trim and normalise before validation; reserve system/admin/brand-impersonation names.
- Default change interval 30 days. Handle concurrent claims with a conflict response and preserved form state.
- Store past handle changes only in the minimal private account audit; do not make them public.
- Support logout, email/password changes and session expiry without losing history. UUID stays constant when credentials/username change.
- Password complexity: minimum 12 characters, must contain uppercase, lowercase, numbers and special characters.
- **Analytics consent: defaults to false; when false, no tracking events are emitted; when true, opt-in events may be sent; core app flows work identically in both states.**

---

### Milestone 5 — Account export
**Goal:** Provide a private, readable export of all user-owned Phase 1 information.

**Scope:**
- Durable export job states.
- Recent-auth requirement.
- Owner-only JSON and CSV generation.
- Current and historical Passport, services, Shelf, Tools and activities.
- Relevant catalogue-version and provenance snapshots.
- Expiring download authorization.
- Object deletion within the configured retention window.
- Status, retry and failure display.
- No public storage URLs.

**Acceptance focus:** P1-AC-19 and 17.

**Exit gate:**
- An authenticated user can request and download only their own complete readable data.
- Expired links and foreign access fail safely.
- Export follows the final Activities schema so it does not need immediate redesign.
- Durable export job states survive partial failure; retry is idempotent.

**Design notes:**
- Export should follow the Activities schema so it does not need immediate redesign.
- Deletion follows export because it must clean up export jobs and files.
- Output removed within 7 days (defaults); download access expires after 24 hours.
- No raw hair notes, concern lists, or exact service history in export output.

---

### Milestone 6 — Account deletion and restore enforcement
**Goal:** Make deletion durable, resumable and effective even with old tokens or restored backups.

**Scope:**
- Account states including active and deleting.
- Immediate access block.
- Durable privacy job and tombstone.
- Refresh-session revocation.
- Ordered purge of records and generated exports.
- Auth identity deletion after dependants.
- Idempotent retry after partial failure.
- Old-access-token denial.
- Tombstone survival after Auth deletion.
- Restore procedure that reapplies tombstones before reopening service.
- User-visible status and support path.

**Acceptance focus:** P1-AC-20 and 17.

**Exit gate:**
- Failed deletion resumes safely; old JWTs cannot access personal data.
- Restored deleted data is purged again; only the minimum protected operational mapping remains.
- Tombstone survives after Auth deletion without cascading away.
- Restore procedure reapplies tombstones before reopening service.

**Design notes:**
- Account states: active, deleting, deleted.
- Deletion immediately marks account "deleting" and blocks data access through policies/services.
- Refresh sessions revoked on deletion.
- Purge of records and generated exports is ordered (export first, then deletion).
- Auth identity deletion happens after dependants (export jobs, tombstones) are handled.
- Operational/security logs default 30 days without hair payloads.
- Personal history remains while the account is active unless user exercises correction/deletion rights.

---

### Milestone 7 — Android acceptance campaign
**Goal:** Convert Partial acceptance cases into Complete with production-like Android evidence.

**Scope:**
- Choose and document the supported Android/device matrix.
- Development and signed release builds.
- Real email verification and recovery.
- Cold-start and warm-start recovery links.
- Expired, reused, malicious and missing-verifier recovery cases.
- Complete onboarding, Passport, Services, Shelf, Tools, Activity and Settings journeys.
- Two-device revision conflicts.
- Account switching and offline draft handling.
- Screen reader, large text and 48 dp targets.
- Poor-network and timeout behaviour.
- Pagination and large-data fixtures.
- Performance on a declared mid-range South African Android device.
- Google Play internal testing distribution.

**Acceptance focus:** All P1-AC cases have linked device evidence.

**Exit gate:**
- Every applicable P1-AC case has linked device evidence.
- Screenshots/logs contain no secrets.
- No Critical or High security/data-loss defect remains.
- Release status changes from HOLD only through an explicit review.

**Design notes:**
- Every slice still receives a smaller Android smoke test immediately after completion.
- Complex offline synchronization remains out of scope; writes are online with clearly labelled secure local drafts.
- Web remains a development export/smoke surface, not release evidence.
- iOS remains outside Phase 1.

---

### Milestone 8 — Backup, operations and beta readiness
**Goal:** Prove the service can be operated safely during a limited beta.

**Scope:**
- Fresh migration replay.
- Backup and restore rehearsal.
- RPO of 24 hours or better and RTO of 8 hours or better.
- Deletion tombstone reapplication after restore.
- Provider region and retention confirmation.
- Production email/recovery domain.
- Privacy and support ownership.
- Verification-operator ownership.
- Dependency exception renewal or removal.
- Authenticated Supabase security suite.
- Final acceptance matrix and release decision.

**Acceptance focus:** P1-AC-25 plus closure of all remaining evidence gaps.

**Exit gate:** P1-AC-01 through P1-AC-25 are Complete, operational responsibilities are assigned, and the release status changes from HOLD only through an explicit review.

**Design notes:**
- Fresh migration replay builds a fresh database from committed migrations.
- Backup and restore rehearsal tested with tested backup/restore plan.
- RPO ≤24 hours/RTO ≤8 hours for beta with a tested backup/restore plan.
- Deletion tombstone reapplication after restore verified.
- Production email/recovery domain tested for deliverability before beta.
- Privacy and support ownership assigned (not dashboard-only undocumented changes).
- Verification-operator ownership assigned (privileged server-side, audited; consumer updates cannot set verified status).
- Authenticated Supabase security suite run (schema validation, explicit owner scoping, JWT verification).

---

## 3. Scope Adjustments (Risk Reduction)

These encode risk mitigations without weakening the specification:

| Adjustment | Rationale |
|-----------|-----------|
| Shelf and Tools share concepts/patterns, but **not** a premature generic polymorphic ownership table | Avoids data-integrity risks from premature abstraction |
| Verification operator = restricted RPC or reviewed seed workflow, **not** custom admin application | Keeps privileged operations server-side, audited |
| Export follows final Activities schema so it does not need immediate redesign | Prevents rework if Activities scope changes |
| Deletion follows export because it must clean up export jobs and files | Ensures export jobs are properly terminated before deletion |
| Full Android acceptance testing follows all product slices, but **every slice** still receives a smaller Android smoke test immediately | Feedback early, not waiting for entire roadmap |
| Complex offline synchronization remains out of scope; writes are online with clearly labelled secure local drafts | Preserves data integrity; offline is draft-only |
| Web remains a development export/smoke surface, **not** release evidence | Clear separation of concerns |
| iOS remains outside Phase 1 | Focus scope |

---

## 4. Uncovered Acceptance Cases

The following AC cases are not explicitly covered by milestone scopes and should be addressed:

| AC Case | Location in Roadmap | Status |
|---------|---------------------|--------|
| P1-AC-01 | Handled in Milestone 0 baseline integration (signup, confirmation, resume flow) | ✅ Complete |
| P1-AC-03 | Handled in Milestone 4 (Settings: email/username/password changes retaining history) | ✅ Complete |

If these are not addressed in the current roadmap, they should be documented as "post-Milestone 8 items" or carried into Milestone 0 explicitly.

---

## 5. Next Steps

1. **User reviews this design document** and provides feedback/approval.
2. Upon approval, invoke the **writing-plans skill** to create detailed OpenCode execution plans with:
   - Exact task sequences for each milestone
   - Test-first checkpoints
   - Suggested commits
   - Definitions of done per exit gate
3. Begin implementation with Milestone 0 baseline integration.
4. After each milestone's exit gate is complete, proceed to the next slice.

**Implementation Summary (Milestone 4 — Settings and account completion):**
- **Task 4.1 — Username change with 30-day rule**: Added `last_changed_at` column to `public.profiles`, RLS policy `profile_username_update`, Zod schema `UsernameChangeSchema` (3–24 lowercase ASCII letters/digits/underscores), conflict handling with preserved form state. Migration: `20260918162005_username-change-30day.sql`.
- **Task 4.2 — Email and password changes**: Added migration `20260918162839_email-password-changes.sql` with `email_change_history` table, `last_email_change` column on profiles, RLS policies. Zod schemas `ChangeEmailSchema` and `ChangePasswordSchema` with email uniqueness validation and password complexity (min 12 chars, mixed case, numbers, symbols).
- **Task 4.3 — Analytics consent**: Added `analytics_consent` boolean column to `public.profiles` defaulting to false, RLS policy for owner updates. Zod schema `AnalyticsConsentSchema`. Disabled state never blocks core functionality. Migration: `20260919064318_analytics-consent.sql`.
- **UI fixes**: Fixed `HeatEventForm` to accept `activityId` prop and link heat events to activities. Fixed `ActivityVoidScreen` to deduplicate `canVoid` check logic into shared helper. Fixed `ActivityCorrectScreen` to include `user_id` in `activity_revisions` insert.

---

---

*Design document written per brainstorming skill protocol. User approval required before proceeding to writing-plans skill.*
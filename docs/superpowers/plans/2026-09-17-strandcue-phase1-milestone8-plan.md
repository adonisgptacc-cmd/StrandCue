# StrandCue Phase 1 Milestone 8 — Beta Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the service can be operated safely during a limited beta.

**Architecture:** Fresh migration replay. Backup and restore rehearsal. RPO of 24 hours or better and RTO of 8 hours or better. Deletion tombstone reapplication after restore. Provider region and retention confirmation. Production email/recovery domain. Privacy and support ownership. Verification-operator ownership. Dependency exception renewal or removal. Authenticated Supabase security suite. Final acceptance matrix and release decision.

**Tech Stack:** Node.js, Supabase, PostgreSQL, Backup tools (pg_dump/pg_restore), Node testing suites, Expo, Google Play Console

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 8 section)

**Acceptance Focus:** P1-AC-25 plus closure of all remaining evidence gaps.

**Exit Gate:** P1-AC-01 through P1-AC-25 are Complete, operational responsibilities are assigned, and the release status changes from HOLD only through an explicit review.

**Global Constraints** (from design doc and PHASE_1.md):
- Fresh migration replay builds a fresh database from committed migrations
- Backup and restore rehearsal with tested backup/restore plan
- RPO of 24 hours or better and RTO of 8 hours or better for beta with a tested backup/restore plan
- Deletion tombstone reapplication after restore verified
- Provider region and retention confirmation
- Production email/recovery domain tested for deliverability before beta
- Privacy and support ownership assigned (not dashboard-only undocumented changes)
- Verification-operator ownership assigned (privileged server-side, audited; consumer updates cannot set verified status)
- Authenticated Supabase security suite run (schema validation, explicit owner scoping, JWT verification)
- Dependency exception renewal or removal — review and either approve for production or remove
- Authenticated Supabase security suite
- Final acceptance matrix and release decision
- No hair payloads in operational/security logs
- Production/staging/production separate config; no real user data in fixtures
- Short notes default max 2,000 characters
- No third-party advertising SDK
- Separate development/staging/production; no real user data in fixtures

## Tasks

### Task 8.1: Fresh migration replay
- [ ] **Step 1:** Run `npx supabase migration reset` — reset database to clean state from committed migrations
- [ ] **Step 2:** Run all migrations in lexical order: `supabase migration up`
- [ ] **Step 3:** Verify database schema matches `supabase/migrations/` exactly
- [ ] **Step 4:** Verify RLS policies are all present and correct
- [ ] **Step 5:** Verify no orphaned tables or columns; all schema elements have purpose

**Interfaces:**
- Consumes: committed migrations in `supabase/migrations/`
- Produces: fresh database schema, verified RLS, no orphaned elements

**Step 1:** Run `npx supabase migration reset` — drops and recreates database from migrations
**Step 2:** Run `supabase migration list` — verify all migrations listed in lexical order
**Step 3:** Run `supabase migration up` — apply all migrations fresh
**Step 4:** Verify schema: `psql -d postgres -c "\dt"`, `"\dp"` for RLS policies
**Step 5:** Check for orphaned elements: compare `supabase/migrations/` files against `information_schema.tables` and `information_schema.columns`
**Step 6:** Run `npm run typecheck:domain` — verify types match fresh schema
**Step 7:** Test: fresh database build from migrations only — no seed data, no fixture data, clean state

### Task 8.2: Backup and restore rehearsal
- [ ] **Step 1:** Take full database backup using `pg_dump` — custom format, include RLS, data, schema
- [ ] **Step 2:** Store backup in secure location with retention policy
- [ ] **Step 3:** Rehearse restore: `pg_restore` to fresh database, verify data integrity, RLS policies intact
- [ ] **Step 4:** Document RPO and RTO metrics from rehearsal

**Interfaces:**
- Consumes: live database, backup configuration
- Produces: verified backup, documented RPO/RTO, restore procedure confirmed

**Step 1:** Run `pg_dump -Fc -d $DATABASE_URL -o -x -v -f backup.tar` — custom format dump with schema and data
**Step 2:** Store `backup.tar` in secure location with retention policy (e.g., 7 days as per P1-PRIV-03)
**Step 3:** Rehearse restore: `pg_restore -d new_database backup.tar` — verify all tables, RLS policies, data intact
**Step 4:** Compare row counts, critical data points between original and restored database
**Step 5:** Document RPO: time between last backup and point of failure target (≤24 hours)
**Step 5:** Document RTO: time from failure detection to restored service (≤8 hours)
**Step 5:** Create restore procedure documentation: `docs/operations/restore-procedure.md`
**Step 6:** Test: intentional data corruption → restore from backup → verify data integrity and RLS

### Task 8.3: RPO of 24 hours or better and RTO of 8 hours or better
- [ ] **Step 1:** Configure automated daily database backups (e.g., cron job, Supabase backup feature)
- [ ] **Step 2:** Test RTO: simulate failure, restore from backup, measure time to service restoration
- [ ] **Step 3:** Verify RPO ≤24 hours (data loss window) and RTO ≤8 hours (restoration time)
- [ ] **Step 4:** Document and report metrics

**Interfaces:**
- Consumes: backup configuration, failure simulation setup
- Produces: RPO ≤24h documented, RTO ≤8h documented, tested

**Step 1:** Configure automated daily backup: set up cron or Supabase native backup → runs daily at off-peak hour
**Step 2:** Record backup timestamp; simulate failure at random point → measure data age at failure (RPO)
**Step 3:** Simulate full outage → restore from backup → measure time to service restoration (RTO)
**Step 3:** Targets: RPO ≤24 hours, RTO ≤8 hours per P1-AC-25 and operational defaults
**Step 4:** If RTO >8h: optimize backup frequency, parallel restore processes, reduce data volume
**Step 5:** If RPO >24h: increase backup frequency, add incremental backups
**Step 6:** Document metrics; report to team; iterate until targets met

### Task 8.4: Deletion tombstone reapplication after restore
- [ ] **Step 1:** After restore from backup, verify tombstones are preserved and reapplied
- [ ] **Step 2:** Test that deleted account data remains purged after restore
- [ ] **Step 3:** Only minimum protected operational mapping remains after restore

**Interfaces:**
- Consumes: restored database, tombstone data from privacy_jobs
- Produces: tombstones preserved, deleted data purged, minimal mapping retained

**Step 1:** After restore, query `privacy_jobs` — verify tombstones present (not cascaded away by Auth deletion)
**Step 2:** Verify profile `account_status` reflects correct state after restore (active/deleting/deleted as intended)
**Step 3:** Verify no personal data re-appeared that was deleted prior to backup
**Step 4:** Test: delete → backup → restore → verify tombstones present, deleted data not accessible, minimal mapping retained
**Step 2:** Test: re-delete after restore → purge proceeds from clean state, no double-retained data

### Task 8.5: Provider region and retention confirmation
- [ ] **Step 1:** Confirm database provider region (e.g., AWS region, GCP region) matches intended deployment region
- [ ] **Step 2:** Confirm provider retention policies match Phase 1 requirements (operational logs 30 days, backup expiry max 35 days)
- [ ] **Step 3:** Document region and retention confirmation

**Interfaces:**
- Consumes: provider configuration, retention policies
- Produces: region confirmed, retention confirmed, documented

**Step 1:** Check Supabase project configuration → confirmed region (e.g., us-east-1, eu-west-1)
**Step 2:** Check provider retention policies → operational/security logs default 30 days without hair payloads, backup expiry max 35 days per P1-PRIV-03
**Step 3:** Document region and retention in `docs/operations/provider-retention.md`
**Step 4:** If region not optimal: plan migration to optimal region; if retention not matching: configure retention policies

### Task 8.6: Production email/recovery domain
- [ ] **Step 1:** Configure production email delivery — not development mock, but actual deliverable emails
- [ ] **Step 2:** Test email delivery: verification email, recovery email, password reset email
- [ ] **Step 3:** Confirm domain is verified and approved for production use
- [ ] **Step 4:** Test on all device matrix entries

**Interfaces:**
- Consumes: email configuration, Supabase project
- Produces: verified email delivery, production domain confirmed

**Step 1:** Configure Supabase email settings with production domain (not development placeholder)
**Step 2:** Send test emails: verification, password reset, recovery → verify delivery to inbox, not spam
**Step 3:** Verify domain is owned/verified, not a wildcard or unverified domain
**Step 4:** Test on all device matrix entries → email delivery works on each
**Step 5:** Test: expired recovery link → fresh request path; malicious link → rejected; no secret logs

### Task 8.7: Privacy and support ownership
- [ ] **Step 1:** Assign privacy and support ownership — not dashboard-only undocumented changes
- [ ] **Step 2:** Document ownership: who handles privacy requests, support tickets, incident response
- [ ] **Step 3:** Ensure operational responsibilities assigned and documented

**Interfaces:**
- Consumes: organizational assignment, documentation needs
- Produces: privacy/support ownership documented, assigned, not dashboard-only

**Step 1:** Assign privacy owner: individual team member responsible for GDPR/POPIA requests, data access/correction/deletion
**Step 2:** Assign support owner: individual team member responsible for support tickets, escalation per SAFE-02, SAFE-03
**Step 3:** Assign verification-operator owner: individual or team responsible for privileged verification reviews (not consumer-facing)
**Step 2:** Document in `docs/operations/ownership.md`: privacy owner, support owner, verification-operator owner, their contact methods, SLA expectations
**Step 3:** Ensure none are "dashboard-only undocumented changes" — each has named person, documented process

### Task 8.8: Verification-operator ownership
- [ ] **Step 1:** Assign verification-operator ownership — privileged server-side, audited; consumer updates cannot set verified status
- [ ] **Step 2:** Document the workflow: how verification records are reviewed, by whom, with what audit trail
- [ ] **Step 3:** Ensure consumer cannot set verified status through UI or API

**Interfaces:**
- Consumes: verification review workflow, audit trail requirements
- Produces: verification-operator ownership assigned, documented, consumer SET verified denied

**Step 1:** Verify `recordVerification` RPC (from Milestone 5) has RLS: only servicerole/invoker can execute; authenticated users DENIED
**Step 2:** Document review workflow: how verification records flow from consumer submit → reviewer review → status change → audit log → consumer visible status (read-only)
**Step 2:** Create `VerificationReviewWorkflow.md` documenting: submit → review → decision → audit → consumer-visible result
**Step 2:** Test: authenticated user attempts to set verification via API → permission denied; reviewer can set → status changes; audit log entry created

### Task 8.9: Dependency exception renewal or removal
- [ ] **Step 1:** Review all dependency exceptions documented in Milestone 0
- [ ] **Step 2:** Determine which exceptions are still needed for Phase 1, which can be removed/approved for production
- [ ] **Step 3:** Document renewal decisions or removal plan

**Interfaces:**
- Consumes: dependency exceptions from Milestone 0, production readiness criteria
- Produces: exceptions renewed/removed, documented decisions

**Step 1:** Review `package.json` exceptions: react-native 0.86.3, reanimated 4.5.1, uuid 11.1.1, overrides — which are still needed?
**Step 2:** Determine: which exceptions are Phase 1 blockers vs. can be removed/approved for production
**Step 3:** Document decisions: e.g., "react-native 0.86.3 pinned — confirmed working with Expo SDK 52, no upgrade path in Phase 1"; "uuid 11.1.1 — can upgrade to 13.0.0 for production"
**Step 3:** If removal possible: update `package.json`, run `npm update`, `npm run typecheck`, `npm test` — confirm no regressions
**Step 3:** If retention needed: document review date, approval date, conditions for future removal
**Step 4:** Document in `docs/dependencies/exceptions.md`

### Task 8.10: Authenticated Supabase security suite
- [ ] **Step 1:** Run authenticated Supabase security suite tests
- [ ] **Step 2:** Verify schema validation, explicit owner scoping, JWT verification
- [ ] **Step 3:** Document any findings and remediate

**Interfaces:**
- Consumes: Supabase project, security test suite
- Produces: security suite passed, findings documented, remediated if needed

**Step 1:** Run security validation checks: schema consistency, RLS policies on all exposed tables, JWT verification on all privileged functions
**Step 2:** Verify explicit owner scoping: every query/mutation that accesses user data has `auth.uid() = user_id` condition
**Step 3:** Verify JWT verification: all privileged functions verify JWT before executing; no bypass
**Step 3:** Run `supabase gen types --schema public` — verify types; run security-focused queries to test RLS bypass
**Step 4:** Document any findings; remediate; re-run until suite passes

### Task 8.11: Final acceptance matrix and release decision
- [ ] **Step 1:** compile all P1-AC acceptance evidence — per-case evidence, device logs, test results
- [ ] **Step 2:** Review each of the 25 acceptance cases — mark Complete, Partial, or Open
- [ ] **Step 3:** If any Open cases remain, document remediation plan or scope adjustment
- [ ] **Step 4:** Change release status from HOLD to READY only through explicit review

**Interfaces:**
- Consumes: all acceptance evidence, device test results, migration evidence, security suite results
- Produces: final acceptance matrix, release decision, status change from HOLD

**Step 1:** Compile per-case evidence: for each P1-AC-01 through P1-AC-25, gather: device test logs, migration replay results, security suite results, code evidence
**Step 2:** Review each case: mark Complete (evidence present and passing), Partial (evidence present but needs device/API), Open (not implemented)
**Step 3:** If any Open cases remain: document remediation plan, schedule, or scope adjustment — do not change release status until all Complete
**Step 4:** Compile final acceptance matrix — 25 cases with status and evidence links
**Step 5:** Explicit review: product owner, technical lead, and privacy/support owners sign off on release readiness
**Step 5:** Change release status from HOLD to READY only through this explicit review
**Step 5:** If status changes: update `docs/verification/phase-1-acceptance-status.md` — change "HOLD" to "READY" with review date and signatories
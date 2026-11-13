# StrandCue Phase 1 Milestone 7 — Android Acceptance Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Partial acceptance cases into Complete with production-like Android evidence.

**Architecture:** Choose and document supported Android/device matrix. Development and signed release builds. Real email verification and recovery. Cold-start and warm-start recovery links. Expired, reused, malicious and missing-verifier recovery cases. Complete onboarding, Passport, Services, Shelf, Tools, Activity and Settings journeys. Two-device revision conflicts. Account switching and offline draft handling. Screen reader, large text and 48 dp targets. Poor-network and timeout behaviour. Pagination and large-data fixtures. Performance on a declared mid-range South African Android device. Google Play internal testing distribution.

**Tech Stack:** Android Studio, Kotlin/Java, Expo Go/development builds, Firebase Crashlytics, Google Play Console, Supabase mobile SDK, test device fleet

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 7 section)

**Acceptance Focus:** All P1-AC cases have linked device evidence.

**Exit Gate:**
- Every applicable P1-AC case has linked device evidence
- Screenshots/logs contain no secrets
- No Critical or High security/data-loss defect remains
- Release status changes from HOLD only through an explicit review

**Global Constraints** (from design doc and PHASE_1.md):
- Same RLS constraints (auth.uid() = user_id on private tables)
- Complex offline synchronization remains out of scope; writes are online with clearly labelled secure local drafts
- Web remains a development export/smoke surface, not release evidence
- iOS remains outside Phase 1
- Every slice still receives a smaller Android smoke test immediately after completion
- Chosen and documented supported Android/device matrix
- Development and signed release builds
- Real email verification and recovery
- Cold-start and warm-start recovery links
- Expired, reused, malicious and missing-verifier recovery cases
- Complete onboarding, Passport, Services, Shelf, Tools, Activity and Settings journeys
- Two-device revision conflicts
- Account switching and offline draft handling
- Screen reader, large text and 48 dp targets
- Poor-network and timeout behaviour
- Pagination and large-data fixtures
- Performance on a declared mid-range South African Android device
- Google Play internal testing distribution
- No Critical or High security/data-loss defect remains

## Tasks

### Task 7.1: Document supported Android/device matrix
- [ ] **Step 1:** Choose target Android API level minimum (e.g., API 21 → Android 5.0)
- [ ] **Step 2:** Document device fleet: 3-5 representative devices covering South African market
- [ ] **Step 3:** Document OS versions, screen sizes, pixel densities
- [ ] **Step 4:** Create device matrix spreadsheet with specifications

**Interfaces:**
- Consumes: None (planning phase)
- Produces: Documented device matrix, approved for acceptance testing

**Step 1:** Review South African Android market share data — choose API level 21 (Android 5.0) as minimum
**Step 2:** Document device fleet: Samsung Galaxy A series (common in SA), Nokia, Xiaomi budget devices — 3-5 devices
**Step 3:** Document OS versions: Android 10, 11, 12, 13 coverage; note which OS versions each device runs
**Step 4:** Create shared spreadsheet: `docs/acceptance/device-matrix.md` with device, API level, OS, screen size, dp, notes
**Step 5:** Review and approve device matrix — document review date and approver

### Task 7.2: Development and signed release builds
- [ ] **Step 1:** Configure signing keys for debug and release builds
- [ ] **Step 2:** Configure Firebase Crashlytics for error tracking
- [ ] **Step 3:** Configure Google Play internal testing distribution
- [ ] **Step 4:** Build and deploy release candidate to internal testers

**Interfaces:**
- Consumes: approved device matrix, signing configs
- Produces: signed release builds on Google Play internal testing track

**Step 1:** In `android/gradle.properties`, configure `storeFile`, `storePassword`, `keyAlias`, `keyPassword`
**Step 2:** Configure `android/app/build.gradle` signing configurations for release
**Step 3:** Initialize Firebase Crashlytics: `npx firebase-crashlytics:init`
**Step 4:** Set up Google Play internal testing: create testing track in Play Console
**Step 5:** Build release: `cd android && ./gradlew assembleRelease`
**Step 6:** Upload to Play Console internal testing track
**Step 7:** Test: signed build installs, Firebase crashes reported, internal testers can login

### Task 7.3: Real email verification and recovery
- [ ] **Step 1:** Test cold-start recovery — app not running, user clicks recovery link from email
- [ ] **Step 2:** Test warm-start recovery — app running in background, user clicks recovery link
- [ ] **Step 3:** Verify recovery flow works with Supabase PKCE and development scheme
- [ ] **Step 4:** Test on all devices in the matrix

**Interfaces:**
- Consumes: recovery email links, Supabase Auth SDK
- Produces: verified recovery flows on all target devices

**Step 1:** Set up test email accounts; configure Supabase recovery email templates
**Step 2:** Cold-start test: quit app, open recovery link from email on same device → flows to password reset screen
**Step 3:** Warm-start test: app in background, click recovery link → flows to password reset screen without full restart
**Step 4:** Test on all device matrix entries → verify recovery works on each
**Step 5:** Test: recovery link expired → user can request new link; malicious link → rejected; verifier missing → fresh request path

### Task 7.4: Cold-start and warm-start recovery links
- [ ] **Step 1:** Implement and test cold-start recovery (app not running)
- [ ] **Step 2:** Implement and test warm-start recovery (app running in background)
- [ ] **Step 2:** Verify both flows follow PKCE and development scheme allowlist
- [ ] **Step 3:** Test on all device matrix entries

**Interfaces:**
- Consumes: recovery email links, Supabase Auth SDK PKCE flow
- Produces: verified cold-start and warm-start recovery on all target devices

**Step 1:** Configure development scheme `strandcue` in AndroidManifest.xml allowlist
**Step 2:** Cold-start: terminate app, open recovery link from email → app launches with recovery flow
**Step 3:** Warm-start: app running in background, click recovery notification/link → recovery flow starts without full restart
**Step 4:** Verify both flows follow exact allowlisted routes; reject unexpected hosts/routes
**Step 5:** Test on all device matrix entries

### Task 7.5: Expired, reused, malicious and missing-verifier recovery cases
- [ ] **Step 1:** Test expired recovery link → user offered fresh request path
- [ ] **Step 2:** Test reused recovery link → clearly denied, no access granted
- [ ] **Step 3:** Test malicious/unknown host route → rejected, no secret disclosure
- [ ] **Step 4:** Test verifier-missing link → clear "request new link on this device" path
- [ ] **Step 4:** Test on all device matrix entries

**Interfaces:**
- Consumes: various recovery link states (expired, reused, malicious, verifier-missing)
- Produces: correct flow behavior for each case on all devices

**Step 1:** Create test recovery links with different states: valid, expired (past expiry timestamp), reused (already consumed), malicious (unknown host), verifier-missing (no PKCE verifier)
**Step 2:** For expired: user offered "request new link on this device" path; link clearly labeled expired
**Step 3:** For reused: link rejected, no access granted, clear message "this link has already been used"
**Step 4:** For malicious/unknown host: route rejected, no error details disclosed that reveal implementation, clear "request new link" path
**Step 5:** For verifier-missing: clear path to "request a new link on this device"; do not claim universal cross-device recovery
**Step 5:** Test on all device matrix entries → each case produces expected behavior

### Task 7.6: Complete onboarding, Passport, Services, Shelf, Tools, Activity and Settings journeys
- [ ] **Step 1:** End-to-end test on each device: full onboarding flow (welcome → create account → verify email → claim username → complete Passport → add products/tools → select goal → see protocol → start → log steps → complete → Cue Check)
- [ ] **Step 2:** Test Passport current/edit/history flows on each device
- [ ] **Step 3:** Test Services list/detail/add/correct flows on each device
- [ ] **Step 4:** Test Shelf list/add/detail/archive/history flows on each device
- [ ] **Step 5:** Test Tools equivalents on each device
- [ ] **Step 6:** Test Activity/heat add/detail/correct/void flows on each device
- [ ] **Step 7:** Test Settings/privacy/export/deletion on each device
- [ ] **Step 8:** Document passing/failing cases per device

**Interfaces:**
- Consumes: signed release builds, device matrix, Supabase backend
- Produces: per-journey test results per device, documented passing/failing cases

**Step 1:** Write end-to-end test scripts for each journey using Maestro or Appium
**Step 2:** Run on each device in matrix → record pass/fail for each step
**Step 3:** Onboarding: welcome → account creation → email verification → username claim → Passport completion → product/tool addition → goal selection → protocol view → start → logging → Cue Check
**Step 3:** Passport: current view, edit, history, corrections
**Step 3:** Services: list, add, detail, correct, history
**Step 3:** Shelf: list, add (manual/catalogue), detail, edit (availability), archive, history, explicit match
**Step 3:** Tools: list, add (manual/catalogue), detail, edit (capabilities), archive, history
**Step 3:** Activities: add wash/styling event, add heat event, correct, void, history timeline
**Step 3:** Settings: username change, email/password change, analytics consent, boundary/support, account info, logout, recent-auth-required export/deletion
**Step 4:** Document: per-device passing/failing cases matrix

### Task 7.7: Two-device revision conflicts
- [ ] **Step 1:** Test two-device conflict scenario: both devices edit same revision
- [ ] **Step 2:** Verify conflict preserves newer state and unsaved input for review (P1-AC-16)
- [ ] **Step 3:** Test on all device matrix entries

**Interfaces:**
- Consumes: same revision edited by two devices simultaneously
- Produces: conflict UI preserves newer state, unsaved input available for review, no data loss

**Step 1:** Set up scenario: Device A and Device B both open same passport for editing
**Step 2:** Device A saves first → succeeds, revision incremented
**Step 3:** Device B saves → conflict detected, `command.current` non-null, editor locked with review option
**Step 3:** Conflict UI: shows "saved on another device", offers "Review and override" or "Cancel and keep my changes"
**Step 4:** "Review" shows submitted fields vs latest revision; user can choose to override or keep
**Step 4:** Test on all device matrix entries → conflict behavior consistent, no data loss, user can recover unsaved work

### Task 7.8: Account switching and offline draft handling
- [ ] **Step 1:** Test account switching: switch from Account A to Account B → never show A's data
- [ ] **Step 2:** Test offline draft handling: draft saved locally, logged out, logged in as different account → draft labeled and handled correctly
- [ ] **Step 3:** Test on all device matrix entries

**Interfaces:**
- Consumes: account switch, offline draft scenarios
- Produces: account switching never shows previous owner's data; offline drafts handled with explicit labeling

**Step 1:** Log in as Account A, create draft activity → log out → log in as Account B → verify Account A's draft not visible; if draft exists, labeled "unsaved draft from previous account"
**Step 2:** Log out while offline draft unsaved → on next login, draft labeled "unsaved - not saved to server" with Discard/Retry options
**Step 3:** Test on all device matrix entries → account switching behavior consistent, offline drafts explicitly labeled

### Task 7.9: Screen reader, large text and 48 dp targets
- [ ] **Step 1:** Verify TalkBack/Screen Reader compatibility on all device matrix entries
- [ ] **Step 2:** Verify large text scaling (accessibility font size settings)
- [ ] **Step 3:** Verify touch targets meet 48dp Android minimum
- [ ] **Step 4:** Fix any failures; re-test

**Interfaces:**
- Consumes: UI screens across all journeys
- Produces: accessibility compliance across all tested screens and targets

**Step 1:** Enable TalkBack on each device → navigate all journeys → verify all labels announced, no stuck focus, all touch targets reachable
**Step 2:** Increase accessibility font size to largest setting → verify UI scales, no cutoff, no overlap, readable text
**Step 3:** Verify touch targets: buttons, links, form fields at least 48dp × 48dp; adjust if below threshold
**Step 4:** Fix failures → re-test on all devices → document accessibility compliance status

### Task 7.10: Poor-network and timeout behaviour
- [ ] **Step 1:** Test on poor network (2G/3G conditions, ~200kbps, high latency)
- [ ] **Step 2:** Verify timeout handling: operations fail with clear message, not hanging
- [ ] **Step 3:** Verify retry behavior: operations can be retried after timeout
- [ ] **Step 4:** Test on all device matrix entries

**Interfaces:**
- Consumes: poor network conditions, timeout scenarios
- Produces: clear error messages, retry options, no hanging operations

**Step 1:** Network link condition: limit to 200kbps, 500ms latency (Android Studio profiler or device network settings)
**Step 2:** Perform operations: account login, export request, Passport edit, activity submit → verify timeout after reasonable duration (e.g., 10-30 seconds)
**Step 3:** Verify error message: "Check your connection and try again" or more specific based on operation; no "unknown error"
**Step 4:** Verify retry is available and works after network restore
**Step 4:** Test on all device matrix entries → consistent timeout/error/retry behavior

### Task 7.11: Pagination and large-data fixtures
- [ ] **Step 1:** Test with large data fixtures: 500 ownership items, 2000 activity/service records, 1000 Passport revisions per user (as per quality targets)
- [ ] **Step 2:** Verify pagination works at list default 25, max 100
- [ ] **Step 3:** Verify no performance degradation with large data
- [ ] **Step 4:** Test on all device matrix entries

**Interfaces:**
- Consumes: large data sets, pagination parameters
- Produces: usable pagination, no crashes, performance within targets

**Step 1:** Seed test database with 500 ownership items, 2000 activity/service records, 1000 Passport revisions per user (using test harness)
**Step 2:** Navigate paginated lists: shelf items, activity history, Passport revision history → verify pagination controls work
**Step 3:** Page 1-5, max 100 per page → verify no crashes, data loads correctly, performance acceptable
**Step 4:** Page beyond data range → gracefully shows "no more items"
**Step 5:** Test on all device matrix entries → pagination usable on all devices

### Task 7.12: Performance on mid-range South African Android device
- [ ] **Step 1:** Identify declared mid-range South African Android device (e.g., Samsung Galaxy A13, A23)
- [ ] **Step 2:** Profile performance: page load times, navigation transitions, scroll performance
- [ ] **Step 3:** Verify p95 ≤2 seconds on stable representative South African mobile connectivity (quality target)
- [ ] **Step 4:** Verify cached shell ≤1 second after readiness
- [ ] **Step 5:** Verify beta crash-free sessions ≥99.5%
- [ ] **Step 6:** Document performance results; optimize if targets not met

**Interfaces:**
- Consumes: profiled performance data, device characteristics
- Produces: performance metrics against quality targets, optimization plan if needed

**Step 1:** Install build on target device → profile with Android Studio Profiler or Flipper
**Step 2:** Measure: screen transition times, list load times, search performance, export generation time
**Step 3:** Targets: p95 ≤2 seconds on stable SA mobile connectivity, cached shell ≤1 second after readiness, crash-free sessions ≥99.5%
**Step 3:** If targets not met: profile bottlenecks, optimize queries, reduce payload sizes, improve caching
**Step 4:** Re-test → document whether targets met; if not, record optimization plan

### Task 7.13: Google Play internal testing distribution
- [ ] **Step 1:** Distribute build to internal testers via Google Play Console
- [ ] **Step 2:** Collect tester feedback on all journeys
- [ ] **Step 3:** Document defects, prioritize fixes
- [ ] **Step 4:** Iterate builds based on feedback

**Interfaces:**
- Consumes: internal testers, feedback channels
- Produces: collected feedback, prioritized defect list, next-build plan

**Step 1:** In Google Play Console, add internal tester emails → distribute build to test track
**Step 2:** Tester onboarding → complete all journeys → submit feedback via in-app feedback or Google Play Console feedback
**Step 3:** Collect feedback: crash reports (Crashlytics), written feedback, journey pass/fail matrix
**Step 4:** Prioritize defects: Critical/High → blocker; Medium → schedule; Low → post-beta
**Step 4:** Build next iteration → distribute to testers → repeat until exit gate criteria met

---
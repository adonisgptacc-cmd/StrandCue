# Implementation plan: item 7A reminders and calendar/history

> **For implementation agents:** Execute this plan in a dedicated item 7A
> worktree, one task at a time. Preserve the I6.6 release HOLD and do not push,
> deploy, publish, merge, or apply anything to hosted Supabase.

**Goal:** Add owner-controlled Android local reminders and a calendar/history
view that distinguishes plans from persisted outcomes, without weather or remote
notification delivery.

**Design:** `docs/superpowers/specs/2026-11-01-item-7a-reminders-calendar-design.md`

**Scope decision:** Owner selected reminders and calendar/history first on
2026-11-01. Reminder preferences are device-local in secure storage and do not
sync. Photo reminders remain deferred. Weather/travel is a separate 7B slice.

## Repository findings

- `packages/domain/src/activity.ts` already validates and projects append-only
  activity revisions with effective dates and correction/void handling.
- `apps/mobile/src/activity-history.ts` already composes unified history entries.
- `apps/mobile/src/records.tsx` has the authenticated owner surface, history
  loading, settings, and sign-out cleanup.
- `apps/mobile/src/client.ts` exposes owner-keyed secure storage backed by
  `expo-secure-store` on device. Sign-out already clears owner-specific drafts.
- Expo Router and `expo-secure-store` are configured. `expo-notifications` is
  installed at the Expo SDK 57 compatible version and configured in app plugins.
- Docker Node 24.19 environment is available for local checks. No hosted
  Supabase operation has been run for this work order.

## Implementation status — 2026-11-01 (implemented; integration gates open)

- **Implemented in `codex/item-7a-reminders-calendar`:** owner-keyed SecureStore
  preferences; optional planned-routine, delayed-check-in and product-review
  toggles; user-entered local plans; quiet-hours scheduling; generic local
  notification payloads; serialized scheduling and cancellation; owner-change,
  sign-out, invalid-session and app-foreground reconciliation; and a Journey >
  Calendar view. Calendar history adapts persisted protocol executions,
  activities, Cue Checks, programmes, services and Passport records, preserving
  correction/void and unknown-status semantics. Activity records without an
  effective or recorded date remain undated; this slice does not invent one or
  change the database contract.
- **Pagination and lifecycle safeguards:** exhausted sources are not restarted
  on subsequent pages; detail lookups are batched to at most eight requests;
  retry remains available. Per-owner serialized storage operations and
  revisions, plus UI owner epochs, prevent stale reads, permission prompts or
  saves from restoring cleared or departed-owner settings. Notification
  reconciliation rejects stale snapshots.
- **Targeted verification:** the final focused Docker run passed 8 files / 79
  tests. App TypeScript check, scoped ESLint and `git diff --check` passed on
  the latest source. Expo dependency check and web export passed earlier in
  this work order. A fresh Android debug build succeeded, installed and opened
  on the API 34 emulator; the merged manifest includes `POST_NOTIFICATIONS`
  and excludes `SCHEDULE_EXACT_ALARM` and `USE_EXACT_ALARM`. The dev client
  could not fetch its JavaScript bundle from Metro, so authenticated UI,
  permission, restart, timezone-change and delivery behavior were not verified
  end to end on-device.
- **Independent code review:** a follow-up reviewer found no remaining concrete
  blocker in the final race, pagination and date-boundary fixes. Focused review
  suites and the 79-test run passed.
- **Full-suite verification:** the final Windows Node 24 run passed 237 test
  files / 4,846 tests; 8 files / 47 tests were skipped (245 files / 4,893
  tests total), with exit code 0 in 292.34 seconds. The earlier Linux Docker
  run stalled in database-heavy PGlite workers and was stopped; the Windows
  run is the clean full-suite result. Real-Postgres concurrency suites remain
  separately blocked because `STRANDCUE_PG_DSN` is unset.
- **Dependency audit:** `npm run audit:dependencies` returned
  `DEPENDENCY-POLICY-HOLD` with 26 findings (6 high, 22 moderate). The existing
  audit plan requires human review of stale EAS/mutation-runner lock digests;
  do not change its dates or owners just to clear the hold.
- **Integration gates still open:** dependency-policy disposition;
  Metro-backed Android UI/device checks; real-Postgres evidence if release
  requires it; confirmation of source support for each reminder category and
  requirement traceability; and reconciliation with current `main`/I6.6
  history. Before integration, bring the latest `main` history into the
  feature branch, inspect conflicts and re-run checks against the resulting
  tree. The isolated branch began with two commits absent from `main`, while
  `main` has fourteen commits absent from this worktree.
- This records implementation in the isolated worktree, not integration or
  release approval. The I6.6 HOLD remains. No commit, push, merge, deploy,
  publish, or hosted database change has occurred.
- Do not build a second source of activity truth. Calendar entries must adapt
  existing records and preserve unknown/ambiguous state.

## Implementation tasks

### 1. Create the isolated worktree and establish baseline

- Create a dedicated `codex/item-7a-reminders-calendar` worktree from the current
  I6.6 branch tip; do not reuse or alter the I6.6 worktree.
- Carry the approved 7A design and this plan into the dedicated feature branch
  as review artifacts so implementation and requirements remain together.
- Check the branch, clean status, Node/package-manager versions, and current
  offline verification command.
- Keep implementation isolated there until review; integration into a shared
  branch is a separate step after the work order is reviewed.

### 2. Define calendar projection from existing facts

- Inspect existing activity, protocol execution, programme, and Cue Check
  history contracts before adding a domain adapter.
- Add a small pure projection that emits dated calendar items from supported
  persisted plans and outcomes. Reuse existing effective-date and correction
  semantics.
- Map only explicit recorded facts to `planned`, `completed`, `partial`, or
  `skipped`. Use `unknown` for absent, incomplete, ambiguous, or unsupported
  status data. Do not infer completion or failure from elapsed time.
- Keep this projection independent of presentation and notification APIs.

### 3. Add secure device-local reminder preferences

- Define a versioned schema for separately enabled reminder categories, local
  delivery time, and quiet-hours interval.
- Store preferences under an owner-specific key through the existing secure
  storage abstraction. Parse and validate on read; handle missing, malformed,
  and older-version values without crashing the owner screen.
- Do not include event titles, product names, treatment details, free text, or
  other personal content in the preference value.
- Include explicit clear-on-sign-out and owner-switch behavior.

### 4. Add local notification adapter and idempotent scheduling

- Add the Expo Notifications dependency at the Expo SDK-compatible version and
  configure its plugin/channel only after checking official package guidance and
  the repository's pinned SDK.
- Use a generic title/body for every notification type; keep event detail inside
  the authenticated app.
- Request notification permission only after the owner enables a category and
  sees the permission explanation. If denied, retain calendar/history and show
  a clear in-app state.
- Build deterministic schedule IDs and an idempotent reconciliation function.
  Reconcile on preference changes, supported source-record changes, app start,
  timezone changes, sign-out, and owner switch.
- Use device-local time. Ensure quiet hours prevent delivery; for a conflict,
  defer to the first allowed time on that local date if it is still before the
  event, otherwise suppress that notification occurrence.
- Do not request Android exact-alarm special access. Use the Expo date trigger
  without that permission and communicate that Android may delay delivery.
- Schedule only when the source record has a complete supported date. Never
  create eligibility or expiry dates from generic product assumptions.
- Cancel all StrandCue schedules before clearing the departing owner's settings.

### 5. Add calendar/history and reminder controls to the owner experience

- Add an owner-facing calendar/history route reachable from the existing
  authenticated records surface.
- Reuse the existing unified history loading and owner lifecycle patterns.
- Show planned entries separately from actual outcomes and expose the canonical
  status labels, including unknown. Do not introduce streaks or missed-routine
  language.
- Add per-category enablement, delivery-time, quiet-hours, and individual
  dismissal controls. Use clear permission-denied and unsupported-date states.
- Ensure account loading, errors, retry, sign-out, and account-switch behavior
  match existing screens.
- Do not change production content, hosted configuration, or recommendation
  behavior.

### 6. Add focused tests before implementation and verify locally

- Domain tests: status mapping, corrections/voids, effective-date boundaries,
  ambiguous/incomplete facts, and no inferred outcomes.
- Preference tests: schema versioning, invalid storage, owner-key isolation,
  clear-on-sign-out, and owner switching.
- Scheduler tests with a notification adapter mock: opt-out, permission denied,
  stable IDs/idempotency, quiet-hours conflict, timezone change, source deletion,
  individual dismissal, and cancellation on owner change.
- UI tests: calendar status labels, planned versus completed distinction,
  unknown-state display, optional controls, and generic lock-screen copy.
- Run the repository's targeted unit/integration checks and offline verification
  suite after implementation. Report any unavailable device/runtime checks
  separately from product results.

### 7. Review and close the local work order

- Perform security/privacy review of notification payloads, secure preference
  storage, owner switch, and permission timing.
- Update requirement traceability for RM-01 through RM-05 only where the
  implementation and evidence meet the requirement. Leave unsupported reminder
  categories partial or not started with explicit reasons.
- Record worktree, branch, commits, test evidence, device checks, and any
  remaining release gates in the item 7A report.
- Do not claim private beta or production readiness from local verification.

## Acceptance checklist

- [ ] Reminders are individually optional and dismissible.
- [ ] Calendar distinguishes planned, completed, partial, skipped, and unknown.
- [ ] Notification copy is generic on the lock screen.
- [ ] Quiet hours and local timezone changes are handled deterministically.
- [ ] Device-local settings are isolated per owner and cleared at sign-out.
- [ ] No activity completion, treatment eligibility, or product expiry is
      inferred without a persisted source fact.
- [ ] No weather, travel, photo reminders, server push, hosted database change,
      content publication, push, deployment, or merge occurs in 7A.
- [ ] Tests and code review pass before the local work order is presented for
      integration.

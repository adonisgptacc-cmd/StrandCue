# Item 7A: reminders and calendar/history

**Status:** scope approved 2026-11-01; implementation plan drafted
**Parent:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`, item 7
**Release posture:** local, reviewable work only; no hosted changes or release claim

## Why this slice

The canonical roadmap orders item 7 before Routine Audit (item 8) and barcode/OCR
discovery (item 9). Reminder and calendar behavior can be designed independently
of weather data. Keeping weather and travel for a later 7B slice avoids choosing
weather consent, provider, freshness, and source behavior by implication.

The canonical requirements in this proposal are RM-01 through RM-05. It also
honors the open product decision about whether photo reminders belong in scope:
photo reminders are deferred until that decision is recorded.

## Goals

- Let an owner opt into and control supported reminders individually.
- Show a calendar/history view that separates planned, completed, partial,
  skipped, and unknown states.
- Keep reminders optional, quiet-hours aware, timezone correct, and individually
  dismissible.
- Use neutral notification copy that does not reveal hair, treatment, or product
  details on the lock screen.
- Derive calendar state from recorded facts; never infer that an activity was
  completed because it was planned or because time passed.
- Keep the feature useful without weather services, AI, or hosted notification
  delivery.

## Out of scope

- Weather, city selection, location permission, travel, and seasonal context
  (separate 7B decision and work order).
- Progress-photo reminders (canonical open decision).
- Server push, remote notification delivery, or changing hosted Supabase.
- Streaks, missed-routine penalties, or claims about hair-health outcomes.
- Automatically inventing product expiry, treatment eligibility, or routine
  dates where the owner has not recorded the required source facts.

## Owner-facing behavior

1. The owner can view a month or date range and open a day’s activity.
2. Entries display one of the canonical states: planned, completed, partial,
   skipped, or unknown. Each displayed state has a source record or is clearly
   labelled as a plan.
3. The owner can opt in to supported reminder categories separately, choose a
   local delivery time, set quiet hours, and dismiss an individual reminder.
4. A reminder is scheduled only when its source record contains enough
   information to determine the event and date. Unsupported or incomplete dates
   do not produce notifications.
5. Permission is requested only after the owner enables a reminder and sees why
   notification permission is needed. Declining permission leaves in-app
   calendar/history available.
6. Lock-screen title/body remain generic (for example, “A StrandCue reminder”
   and “Open the app when convenient”). Detailed context is shown only after
   opening the authenticated app.
7. Missing or ambiguous activity data is shown as unknown; it is never rendered
   as missed, failed, or overdue without an explicit product rule.

## Supported reminder categories for 7A

- Planned routine, when a dated plan exists.
- Delayed Cue Check, only when the owner explicitly requested one and its
  scheduled date is stored.
- Treatment eligibility, only when an approved capability provides an explicit
  eligibility date; otherwise hidden or unavailable.
- Product review/expiry, only when the owner supplied the relevant review/expiry
  date.

Progress-photo reminders remain deferred. No interval, time, eligibility, or
expiry date may be inferred from product category or generic advice.

## Implementation approach options

### A. Device-scheduled reminders and read-only account history — recommended

Use Android local notifications for scheduled delivery. Keep delivery text
generic, refresh schedules from authenticated owner data when the app opens or
relevant records change, and cancel schedules on opt-out, dismissal, sign-out,
or owner switch. The calendar/history reads existing plan and execution facts.

**Benefits:** works without a push provider or hosted service; keeps delivery
simple and matches the Android-first product.
**Trade-offs:** notification schedules are device-specific and require a clear
choice about where reminder preferences persist and how they sync.

### B. In-app calendar and reminder inbox first

Build history and reminder controls as in-app surfaces, but defer operating
system notifications until a later slice.

**Benefits:** smallest privacy and platform surface; avoids notification
permission and build configuration now.
**Trade-offs:** it does not fully satisfy the ordinary meaning of reminders or
provide timely notification delivery.

### C. Server push with weather in one item-7 release

Add remote delivery, device-token lifecycle, provider configuration, and weather
fetch in a single work order.

**Benefits:** supports delivery across devices and combines all item-7
capabilities.
**Trade-offs:** expands privacy, operational, hosted-service, and consent scope;
weather fetch consent/source is still an explicit open product decision.

## Data and privacy boundaries

- Calendar data remains owner-scoped and subject to existing RLS boundaries.
- Notification payloads contain no product names, treatment names, photos,
  ingredient details, free text, or health-like inference.
- Device schedules are cancelled on sign-out/owner switch and reconciled when
  the owner’s schedule changes.
- Android exact-alarm special access is out of scope. If the operating system
  delays a local reminder, the app must not imply that delivery is exact.
- Do not record notification payloads or owner free text in analytics.
- Before implementation, choose whether reminder preferences persist only on
  device or in an owner-scoped database table. This proposal recommends
  owner-scoped persistence only if the existing local database patterns can
  enforce RLS and privacy review without changing hosted state; otherwise keep
  settings device-local for 7A and document the sync limitation.

## Acceptance criteria

- Each supported reminder category is independently enabled/disabled.
- Notifications are not scheduled when the category is off, permission is
  denied, the source date is absent/ambiguous, or the owner signs out.
- Quiet hours and local timezone changes are respected when schedules are
  reconciled.
- Dismissing one reminder does not silently disable unrelated categories.
- Calendar statuses map only from persisted plans and execution outcomes and
  preserve unknown as unknown.
- Lock-screen notification content remains generic in all reminder categories.
- No streak, shame, failure, diagnosis, or unverified recommendation copy is
  introduced.
- Existing owner data isolation and account-switch behavior remain intact.
- Tests cover date/timezone boundaries, quiet hours, permission denial,
  cancellation, dismissal, status mapping, and account switching before any
  implementation is considered complete.

## Decisions requested

The owner selected reminders and calendar/history first. This selects approach A
for 7A: device-scheduled local reminders and in-app account history, with
weather/travel reserved for 7B after its consent/source decision.

For the first delivery, reminder preferences will be device-local and stored
through the app's existing secure storage. They will not synchronize between
devices. This keeps reminder settings out of hosted services and lets the app
cancel schedules and clear settings at sign-out/owner switch. The preference
model should remain replaceable by owner-scoped persistence in a later approved
slice.

Android exact-alarm special access is out of scope. Local notifications use a
date trigger without requesting that access, and Android may delay delivery
under system power management. The app explains this before the owner enables
notifications.

Progress-photo reminders remain deferred until the canonical open decision is
resolved. Server push, hosted changes, and weather fetch remain out of scope.

The implementation plan is `docs/superpowers/plans/2026-11-01-item-7a-reminders-calendar.md`.
The plan has been implemented in the isolated `codex/item-7a-reminders-calendar`
worktree. Account history covers the supported persisted sources; missing
activity dates remain unknown, and reminder scheduling is owner-local with
generic notification content. Focused tests, typecheck, scoped lint, Android
debug build, and independent review evidence are recorded in the plan.

The latest local `main` history has been merged into the isolated feature branch
and the combined full suite, typecheck, and lint passed. The branch is ready for
local fast-forward integration into `main`. Dependency-policy disposition,
Metro-backed Android UI/device checks, and category-to-source traceability
remain open. The I6.6 release HOLD remains in force. No hosted Supabase
changes, push, deployment, or publication occurred.

# Android acceptance checklist — Increment 3 protocol execution

> **DEVICE ACCEPTANCE BLOCKED — 0/9 scenarios run.** Task 4 installed the
> verified universal APK on a fresh API 34 x86_64 AVD and its first launch
> rendered StrandCue UI with a stable process. Task 5 classified the backend
> `blocked_production`: the remote project identity and isolation are unproven.
> Reserved synthetic owner labels have no accounts or fixtures, so no
> account-dependent protocol scenario was attempted. No hosted data was
> accessed or changed, and no hosted writes were authorized. No scenario PASS
> is claimed. The prior ARM64-only artifact's SoLoader crash is superseded by
> the universal-artifact launch result. The acceptance run is bound to APK
> SHA-256 `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`,
> signer `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`,
> and AVD `strandcue-universal-api34-x86_64` at 2026-10-18 23:55:18 +02:00.
> See `docs/verification/device-evidence.md` and
> `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-6-device-acceptance.md`.
> (Prior build/install history lives in
> `docs/verification/device-evidence.md`, which is a log, not a checklist —
> hence this new file alongside it, following the `beta-gate-review-checklist.md`
> precedent.)

- Source awaiting acceptance: signed APK application source, commit `d8c2818a7fac0e996910a5a33d6784875800993b`
  (includes the post-Task-18 restore repairs and Tasks 19–24). The original
  Increment 3 checklist was authored against `b76fdab`; its historical local
  tests do not certify this final source.
- Required build flavor: signed universal APK from source commit
  `d8c2818a7fac0e996910a5a33d6784875800993b` (`za.co.strandcue.app`), installed
  on a physical device or emulator. Artifact SHA-256:
  `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`;
  package `za.co.strandcue.app`, version `0.1.0`, ABIs `arm64-v8a` and `x86_64`;
  signer SHA-256:
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
  Record device model/API in the Result column when run. All scenarios remain
  BLOCKED pending an isolated backend and synthetic accounts/fixtures.
- Conventions: "server state" = Supabase project state for the signed-in owner
  (`getActiveProtocolExecution` receipt or none); UI copy in quotes is from
  `apps/mobile/src/guidance/guidance-copy.ts`; phases (`loading`, `idle`,
  `ready`, `load_failed`) are from
  `apps/mobile/src/guidance/protocol-execution-state.ts`; `terminal` is the
  derived `controller.terminal` display condition (completed/abandoned suppress
  controls), not a phase member.

## Scenarios

### 1. Start a new execution from idle

- **Precondition:** signed build; fresh account with no active execution
  (server returns `null` for `getActiveProtocolExecution`); online.
- **Steps:** (1) Sign in. (2) Open the Today guidance surface for a decided
  recommendation run. (3) Observe the idle start card. (4) Tap Start once.
- **Expected:** idle start card renders (no "Checking for a saved plan…", no
  preview); tap transitions idle → starting → ready at revision 0 with ordered
  steps and per-step controls; `start` called exactly once.
- **Result (2026-10-18): BLOCKED.** Missing: disposable Owner A on a proven
  isolated backend, a reviewed decided recommendation, authoritative active
  execution result `null`, and an online session. No account-dependent action
  was attempted. See the Task 6 device acceptance record.

### 2. Pause an in-progress execution

- **Precondition:** signed build; signed-in owner with an active execution at
  revision > 0; online.
- **Steps:** (1) Open the execution surface. (2) Tap Pause. (3) Background the
  app. (4) Foreground the app.
- **Expected:** pause control acknowledges without data loss; foregrounding
  re-renders the same execution at the authoritative revision (no fresh start
  offered, no duplicate execution created server-side).
- **Result (2026-10-18): BLOCKED.** Missing: Owner A and a server-backed,
  pauseable active execution above revision 0 with a matching authoritative
  receipt on a proven isolated backend. No account-dependent action was
  attempted. See the Task 6 device acceptance record.

### 3. Resume after process death

- **Precondition:** signed build; signed-in owner with an active execution
  (revision > 0, some steps confirmed); server holds the matching receipt.
- **Steps:** (1) Kill the app process. (2) Relaunch. (3) Sign in as the same
  owner. (4) Open the guidance surface.
- **Expected:** neutral loading card ("Checking for a saved plan…", no start
  button, no preview, no stale content) → `resume_succeeded` → ready at the
  authoritative server revision with confirmed steps shown; `start` never
  called. Fingerprint mismatch (other run / reshaped steps) must instead show
  "This saved plan could not be verified. Nothing is shown yet." with nothing
  painted.
- **Result (2026-10-18): BLOCKED.** Missing: Owner A, an active execution with
  a confirmed step, and its matching server receipt/fingerprint at an
  authoritative revision on a proven isolated backend. No account-dependent
  action was attempted. See the Task 6 device acceptance record.

### 4. Confirmed steps persist at revision

- **Precondition:** signed build; owner with active execution; online.
- **Steps:** (1) Confirm step N with required actuals. (2) Kill + relaunch the
  app. (3) Reopen the surface. (4) Attempt the next transition.
- **Expected:** step N renders confirmed after relaunch; the next transition
  uses the confirmed revision (op-idempotent retry, same op id — no duplicate
  server effect); failed transition maps the stable code to copy with retry.
- **Result (2026-10-18): BLOCKED.** Missing: an owner identity, active run,
  pending step with valid actuals, and server-backed expected revision/receipt
  for confirmation and idempotent retry on a proven isolated backend. No
  account-dependent action was attempted. See the Task 6 device acceptance
  record.

### 5. Deviations — skip / modify with reason

- **Precondition:** signed build; owner with active execution; online.
- **Steps:** (1) Arm the deviation flow on a pending step. (2) Enter a reason
  (+ detail for modify). (3) Confirm. (4) Repeat for a skip on another step.
- **Expected:** deviation form validates reason; confirmed deviation records
  against the step at the current revision; deviation summary renders in
  progress view; no unbounded free-text is sent beyond the bounded command.
- **Result (2026-10-18): BLOCKED.** Missing: an owner identity, active run with
  eligible pending steps, and fixture-defined bounded skip/modify reasons and
  detail on a proven isolated backend. No account-dependent action was
  attempted. See the Task 6 device acceptance record.

### 6. Owned substitution (owned shelf item accepted, foreign item rejected)

- **Precondition:** signed build; owner A signed in with shelf items; a
  decision step eligible for substitution; owner B exists with their own shelf
  items; server enforces owner-scoped shelf reads.
- **Steps:** (1) Open the substitution picker on the eligible step. (2) Choose
  an owned shelf item and confirm. (3) Attempt to substitute an item owned by B
  (if reachable, e.g. via stale cache).
- **Expected:** owned choice sends a bounded replacement carrying only
  `{shelfItemId}`; foreign item is rejected (never applied, never painted —
  owner-mismatch guard renders nothing of the prior owner).
- **Result (2026-10-18): BLOCKED.** Missing: distinct isolated Owner A/B
  identities, separate shelf items, an eligible active decision step, and
  reviewed owner-scoped containment. No account-dependent action was
  attempted. See the Task 6 device acceptance record.

### 7. Offline / reconnect (explicit offline card + retry, no duplicate)

- **Precondition:** signed build; signed-in owner; device online, then network
  disabled mid-session (airplane mode); server holds an active execution.
- **Steps:** (1) Disable network. (2) Open/reload the execution surface.
  (3) Tap "Try again" while still offline. (4) Re-enable network. (5) Tap
  "Try again".
- **Expected:** offline renders the explicit card ("You appear to be offline.
  Your saved plan could not be loaded. Nothing is shown yet."), never the idle
  start card; retry is the same idempotent read and resends nothing. Which read
  depends on the path: on the **fresh/non-seeded** path the execution surface
  issues `getActiveProtocolExecution()` (takes no arguments); on the
  **restored** path the surface no longer reads at all (Fix H) and the failure
  surfaces from Today's own aggregate `getActiveExecutionWithDecision()`
  (`restore.phase === 'failed'`, same offline copy, same idempotent retry).
  After reconnect, success resumes at authoritative revision with no duplicate
  execution.
- **Result (2026-10-18): BLOCKED.** Missing: an owner identity, active
  server-backed execution/receipt, online setup session, and controllable
  network transition for offline retry/reconnect on a proven isolated backend.
  No account-dependent action was attempted. See the Task 6 device acceptance
  record.

### 8. Account switch (no prior-owner paint, fresh load per owner)

- **Precondition:** signed build; owner A with an active execution; owner B
  with a different (or no) active execution; both credentials available.
- **Steps:** (1) Sign in as A, open the surface (A's execution visible).
  (2) Sign out. (3) Sign in as B. (4) Open the surface.
- **Expected:** on switch, `owner_changed` → neutral loading (no one-frame
  paint of A's execution — owner-mismatch guard); B's surface loads fresh
  (B's execution resumed, or idle start card if B has none); late A responses
  discarded by epoch/token guards, never painted.
- **Result (2026-10-18): BLOCKED.** Missing: distinct Owner A/B identities
  with credentials and known separate server states, including A's active run,
  on a proven isolated backend. No account-dependent action was attempted. See
  the Task 6 device acceptance record.

### 9. Completion (terminal display, no further controls)

- **Precondition:** signed build; owner with an active execution one step from
  done; online.
- **Steps:** (1) Complete/finish the final step (or abandon with reason).
  (2) Observe the surface. (3) Attempt to find step controls or Start.
- **Expected:** terminal display renders in the mounted session
  (finished/abandoned with close reason); no step controls, no start button,
  no further transitions offered. On relaunch Today returns to the normal
  idle/check-in state: active restore handles `in_progress`/`paused` only and
  the server returns `null` once the execution is terminal, so no terminal
  display is restored. Execution history may be exposed later through a
  separately designed history screen.
- **Result (2026-10-18): BLOCKED.** Missing: an owner identity and active
  execution one step from completion (or fixture-approved abandonment state),
  with authoritative revision and terminal result on a proven isolated
  backend. No account-dependent action was attempted. See the Task 6 device
  acceptance record.

## Adjacent release journeys

These are tracked separately from scenarios 1–9. Each is **NOT RUN** in the
Task 6 disposition; see the bound Task 6 device acceptance record for details.

- Signup — **NOT RUN**.
- Account confirmation — **NOT RUN**.
- Recovery — **NOT RUN**.
- Export/share — **NOT RUN**.
- Deletion/cancellation — **NOT RUN**.
- Offline launch — **NOT RUN**. Protocol scenario 7 is separately BLOCKED.
- TalkBack — **NOT RUN**.
- Touch targets — **NOT RUN**.

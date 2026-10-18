# Android synthetic acceptance runbook

## Current disposition — 2026-10-18

**Backend classification: `blocked_production` (isolation unproven).** No synthetic
account or hosted record was created or accessed. All nine protocol scenarios
remain **BLOCKED**. Task 6 may not consume this plan as provisioned fixtures;
it requires a separately verified `isolated_test` backend and completed
containment review first.

The signed universal APK (`za.co.strandcue.app`, version `0.1.0`, SHA-256
`f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`) rendered
the “Connect your development environment” screen on the clean API 34 emulator.
That screen says no account or record has been created. Its receipt binds the
artifact to source commit `d8c2818a7fac0e996910a5a33d6784875800993b`, but does
not identify a Supabase backend project. The tracked `apps/mobile/.env.example`
contains blank Supabase URL and publishable-key values. The Android callback
host configured in source is
`strandcue.adonisgptacc.workers.dev/auth/callback`; that hostname does not prove
environment isolation. `supabase/config.toml` names the local CLI project
`StrandCue`, and `apps/mobile/app.json` contains an EAS project UUID; neither is
a verified remote backend reference. Therefore the remote project reference is
**unknown**, and no claim of staging or test isolation is made.

## Gate before provisioning

An operator must complete each item below and save redacted evidence before
changing this disposition to `isolated_test`:

1. Match the installed APK hash to the exact candidate artifact and inspect its
   public runtime configuration without printing keys or tokens. Record only
   the backend project reference, callback origin, app/package, artifact hash,
   and the inspection method.
2. Confirm through an authoritative project owner/dashboard that the backend is
   a dedicated disposable test project, with no production data, users,
   credentials, or shared production services. A hostname, EAS project ID,
   local Supabase alias, or “development” UI alone is insufficient.
3. Confirm current migrations, Auth settings, RLS and RPC grants with a database
   and security reviewer. Review both owners' read/write boundaries, including
   direct attempts to fetch or substitute the other owner's row. Do not use a
   service-role key in the app or on the device.
4. Provision only after the reviewer records approval. Use the app's reviewed
   Auth and protocol APIs or an approved fixture path; do not add direct client
   writes, disable RLS, publish draft content, or weaken trust checks to make a
   scenario reachable.
5. Record non-secret fixture IDs only when they neither identify a person nor
   grant access. Keep passwords, tokens, recovery codes, service credentials,
   and session material in an approved secret store outside Git. Never paste
   credentials into a report, terminal transcript, screenshot, issue, or device
   log.
6. Verify owner isolation with both authenticated users before device
   acceptance: each owner can read only their own shelf and execution; a request
   for the other owner's item is denied and paints no prior-owner data. Capture
   redacted request/result evidence and have the database/security reviewer
   approve it.

If any project identity, isolation, policy, or ownership claim is uncertain,
retain `blocked_production`, create no accounts or data, and keep all nine
scenarios BLOCKED.

## Planned owners and retention

The two non-person labels are `SC-ANDROID-T5-OWNER-A` and
`SC-ANDROID-T5-OWNER-B`. These are reserved labels only; they are not account
IDs and no corresponding accounts exist. Before any provisioning, assign a
named release test operator as both fixture owner and cleanup owner, and record
the isolated project's public reference and approval evidence. The current
cleanup owner is **unassigned** because the isolation gate has not passed.

For a future approved run, set fixture expiry to no later than seven calendar
days after creation and no later than the end of Task 6 device acceptance. The
provisioning record must contain the exact UTC expiry before the first write.
At expiry, the named cleanup owner deletes both Auth users and all associated
rows, sessions, exports, and storage objects, then verifies zero remaining
records by each synthetic owner label. If acceptance is abandoned, clean up
immediately. Do not extend expiry without renewed reviewer approval and an
updated record. No expiry date is represented as active for this unprovisioned
plan.

## Scenario execution handoff

Use the fixture inventory in
[`android-synthetic-acceptance-fixtures.md`](android-synthetic-acceptance-fixtures.md)
as a resettable recipe. Each scenario is an independent reset from the same
two-owner model; do not seed conflicting active executions simultaneously for
one owner. Task 6 records the exact artifact, owner label, fixture variant,
starting revision, outcome, and cleanup result for each scenario. An unavailable
or failed precondition is BLOCKED, not PASS.

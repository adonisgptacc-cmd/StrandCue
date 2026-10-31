# Task 5 synthetic data evidence

**Status: `blocked_production`.** The remote backend reference and isolation
are unverified, so no accounts, records, or hosted data were created or
accessed. Task 6 cannot use these recipes. All nine scenarios remain BLOCKED
(0/9 run).

The signed universal APK receipt binds package `za.co.strandcue.app`, version
`0.1.0`, source commit `d8c2818a7fac0e996910a5a33d6784875800993b`, and SHA-256
`f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`; it has no
Supabase project reference. Task 4 observed the development-environment setup
screen, which says no account or record has been created. Tracked
`apps/mobile/.env.example` has blank Supabase URL and publishable-key values.
The configured callback host and local Supabase CLI project alias do not prove
that a remote project is isolated. No secret or credential value was inspected
or recorded.

Reserved synthetic labels are `SC-ANDROID-T5-OWNER-A` and
`SC-ANDROID-T5-OWNER-B`; neither corresponds to an account. The recipes define
distinct owner shelves, reviewed recommendation decisions, active execution
states/revisions, deviation and substitution eligibility, retry/offline
behavior, terminal completion, and owner-switch checks. For scenario 8, B's
decision `SC-B-DECISION-BASE` references B's shelf and has the distinct ordered
snapshot `SC-B-STEP-1` (confirmed), `SC-B-STEP-2` (pending),
`SC-B-STEP-3` (pending); `SC-B-RUN-8` is active at revision 1 and bound to
B's distinct server-issued decision fingerprint. The named fingerprint is a
placeholder until an isolated fixture is approved; no such value exists now.

Cleanup owner is **unassigned** and no expiry date is active because nothing
was provisioned. Before future provisioning, a named release test operator
must be assigned and record an exact UTC expiry no later than seven days after
creation or completion of Task 6, whichever comes first. Database/security
review and cross-owner containment evidence are required before provisioning.
Credentials must remain in an approved secret store outside Git.

Detailed reset recipes and containment requirements:
[`android-synthetic-acceptance-fixtures.md`](../../../docs/runbooks/android-synthetic-acceptance-fixtures.md)
and [`android-synthetic-acceptance.md`](../../../docs/runbooks/android-synthetic-acceptance.md).
The decision and full evidence are in
[`task-5-report.md`](task-5-report.md).

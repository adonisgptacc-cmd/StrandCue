# Task 5 report — synthetic Android acceptance data

**Disposition: `blocked_production` (remote backend identity/isolation
unproven).** No account or hosted data was created, queried, or changed. All
nine account-dependent acceptance scenarios remain BLOCKED. No configuration,
credential, account, migration, database, Auth, Cloudflare, or app source was
changed.

## Evidence and classification

- The Task 4 signed universal APK receipt identifies package
  `za.co.strandcue.app`, version `0.1.0`, source commit
  `d8c2818a7fac0e996910a5a33d6784875800993b`, and SHA-256
  `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`.
  It does not include a Supabase backend project reference.
- Task 4 reports the clean API 34 x86_64 emulator rendered “Connect your
  development environment”; that screen says no account or record has been
  created. This shows the backend was not configured in that runtime, but does
  not identify a safe target for provisioning.
- The tracked `apps/mobile/.env.example` leaves both
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` blank.
  Mobile client source requires those values to initialize its Supabase client.
- `apps/mobile/app.json` gives an EAS project UUID and configures the callback
  host `strandcue.adonisgptacc.workers.dev`; neither identifies the Supabase
  target. `supabase/config.toml` sets the local CLI alias `StrandCue`. Neither
  proves that remote data is isolated. No project identity was inferred from a
  hostname.
- Classification rule from the Task 5 brief: when production targeting is
  possible or isolation cannot be proven, fail closed as `blocked_production`
  and do not provision. This rule applies because the remote project reference
  and isolation evidence are absent.

No credentials or environment values were read into the report. Evidence was
limited to tracked configuration, the redacted artifact receipt, and the
reported first-launch UI observation.

## Fixture model and disposition

Reserved synthetic labels are `SC-ANDROID-T5-OWNER-A` and
`SC-ANDROID-T5-OWNER-B`. They identify no real person and do not correspond to
created accounts. The fixture recipe defines distinct per-owner shelf items, a
reviewed stable recommendation decision with ordered confirm/deviation/
substitution steps, resettable active execution variants and revisions,
idempotent retry expectations, a foreign-owner substitution case, offline
recovery, account switching, terminal completion, and cross-owner denial
checks. The nine precondition recipes are listed individually in
[`android-synthetic-acceptance-fixtures.md`](../../../docs/runbooks/android-synthetic-acceptance-fixtures.md).

For scenario 8, Owner B has an explicit separate recipe: reviewed decision
`SC-B-DECISION-BASE` references only B's shelf, has the ordered snapshot
`SC-B-STEP-1` (confirmed), `SC-B-STEP-2` (pending),
`SC-B-STEP-3` (pending), and binds active run `SC-B-RUN-8` at revision 1.
Its actual decision fingerprint must differ from A's and is computed only by
the approved isolated fixture path; the documented fingerprint labels are
synthetic placeholders, not persisted values.

The concise authoritative evidence snapshot is
[`task-5-synthetic-data.md`](task-5-synthetic-data.md).

The runbook is at
[`android-synthetic-acceptance.md`](../../../docs/runbooks/android-synthetic-acceptance.md).
It requires authoritative proof of a dedicated disposable backend, database
and security review, and cross-owner containment verification before any
future provisioning. Credentials must remain in an approved secret store
outside Git. No credentials, account IDs, fixture IDs, or secret values are
published.

Cleanup owner is currently **unassigned** because no fixture exists. Before
future provisioning, assign a named release test operator and record an exact
UTC expiry no later than seven days after creation or the end of Task 6,
whichever comes first. The cleanup owner must delete both accounts and all
associated rows/sessions/objects, then verify removal. No active expiry date
exists for this unprovisioned plan.

## Task 5 result

- Backend classification: **`blocked_production`**; remote reference unknown,
  isolation unproven.
- Synthetic owner labels: **reserved only**, no account or data created.
- Scenario fixtures: **recipes documented**, not provisioned.
- Scenarios 1–9: **BLOCKED**, 0/9 run.
- Database/security review: **not performed**; required before any future
  provisioning.
- Files changed: two runbook documents, the required authoritative evidence
  snapshot, and this task report.

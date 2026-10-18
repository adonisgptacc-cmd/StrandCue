# Android synthetic acceptance fixture inventory

These are **recipes only**. No account, shelf item, decision, execution, or
other hosted data has been provisioned. They may be used only after
[`android-synthetic-acceptance.md`](android-synthetic-acceptance.md) records
`isolated_test`, named owners, exact expiry, and database/security approval.
Each scenario starts from a fresh reset; only one active execution per owner is
seeded at a time.

## Synthetic owner model

| Label | Purpose | Synthetic shelf item labels | Execution use |
|---|---|---|---|
| `SC-ANDROID-T5-OWNER-A` | Primary scenario operator | `SC-A-SHELF-BASE`, `SC-A-SHELF-SUBSTITUTE` | Scenarios 1–7 and 9; owner-switch side A |
| `SC-ANDROID-T5-OWNER-B` | Foreign-item and account-switch boundary | `SC-B-SHELF-BASE`, `SC-B-SHELF-SUBSTITUTE` | Scenario 6 foreign item; scenario 8 side B |

Labels are synthetic fixture names, not user identifiers. Each owner receives a
separate Auth account through the reviewed isolated project's Auth flow. Do not
store credentials in this inventory. Use synthetic, non-personal product names
and values. Items must have distinct IDs and owners; never reuse an item ID
across the two accounts.

Create one reviewed recommendation decision per needed reset, labeled
`SC-A-DECISION-BASE`. It must reference the A-owned shelf and a reviewed,
non-draft protocol. Give the decision at least three stable, ordered steps:
`SC-A-STEP-1` (ordinary confirm), `SC-A-STEP-2` (deviation eligible), and
`SC-A-STEP-3` (substitution eligible). For the terminal variant, prepare a
fourth final step. Keep the decision fingerprint and ordered step snapshot
unchanged for an execution's lifetime. No draft/unreviewed content may be
promoted solely for acceptance testing.

For the account-switch B side, prepare a separate reviewed decision labeled
`SC-B-DECISION-BASE`. It references only `SC-B-SHELF-BASE` and a distinct,
reviewed non-draft protocol. Its ordered snapshot is
`SC-B-STEP-1` (confirmed), `SC-B-STEP-2` (pending), and
`SC-B-STEP-3` (pending); the B decision fingerprint is
`SC-B-DECISION-FINGERPRINT-<computed-after-approved-fixture>` and must differ
from A's `SC-A-DECISION-FINGERPRINT-<computed-after-approved-fixture>`. These
fingerprint strings are placeholders, not computed or persisted values. For
scenario 8, B has an active `in_progress` run
`SC-B-RUN-8` at revision 1, owned by B and bound to that B decision fingerprint
and exact step snapshot. The seed/creation record must capture the actual
server-issued fingerprint and receipt privately in redacted evidence before
device use; never claim the placeholder itself is a valid fingerprint.

Execution reset labels are `SC-A-RUN-<scenario>` and `SC-B-RUN-<scenario>`.
These are labels for records produced by approved APIs/fixture tooling; they
are not authorization tokens. Record the authoritative receipt and revision
returned by the backend after every transition.

## Nine scenario preconditions

| # | Reset recipe before device steps | Required assertions / special fixture |
|---|---|---|
| 1. Start from idle | A has shelf base item and `SC-A-DECISION-BASE`; no active execution; online. B has its distinct shelf but no active execution. | `getActiveProtocolExecution` returns none for A. Decision is available and actionable. Start creates exactly one run at revision 0. |
| 2. Pause active execution | A has a matching active `in_progress` run at revision 2, with step 1 confirmed and step 2 pending; online. | Pause persists one authoritative revision; background/foreground does not create or replace the run. |
| 3. Resume after process death | A has a matching active run at revision 3 with step 1 confirmed and step 2 pending; server receipt/fingerprint matches the unchanged decision snapshot. | Kill process and relaunch; restore returns the same run/revision and confirmed step, without calling start. |
| 4. Confirm persistence and retry | A has an active run at revision 2 with step 1 confirmed and step 2 pending; online. | Confirm step 2 using one stable operation ID. Simulate/retry the same operation and verify one server effect and identical receipt/revision; then verify next transition uses the returned revision. |
| 5. Deviation: skip and modify | A has an active run at revision 2 with steps 2 and 3 pending and both marked eligible for deviation under the reviewed decision. | Step 2 has a valid bounded skip reason; step 3 has a valid bounded modify reason and detail. Verify validation and owner-scoped persisted summaries. |
| 6. Owned and foreign substitution | A and B each have their distinct base and substitute shelf items. A has an active run whose current pending step 3 permits substitution; online. | A-owned substitute succeeds carrying only its shelf item ID. A request using B's item ID is denied, never applied or painted. Verify B's item cannot be read through A's session, including a stale-ID attempt. |
| 7. Offline/reconnect | A has an active run at revision 2; online at setup, then device network is disabled. | Offline surface shows the explicit no-data card and retry sends no mutation. Re-enable network; retry reads the same authoritative run/revision without duplicate execution. |
| 8. Account switch | A has active run A at revision 2 bound to `SC-A-DECISION-BASE`; B has active run `SC-B-RUN-8` at revision 1 bound to `SC-B-DECISION-BASE`, B's distinct fingerprint, and snapshot (`SC-B-STEP-1` confirmed; steps 2–3 pending). Both Auth accounts usable. | A → sign out → B shows a neutral loading state before only B data. Verify B's exact run, revision, decision fingerprint, and step snapshot load. Delay an A response if the harness permits and verify it cannot paint after switch. |
| 9. Terminal completion | A has an active run at revision 3, with all but the final step confirmed; online. | Complete the final step (or use the separately specified abandon path with reason). The mounted view is terminal with no controls/start. On relaunch, active restore returns none. |

Seed execution states only through a database/security-reviewed mechanism that
preserves production-equivalent constraints, ownership checks, revisions,
idempotency, and audit behavior. If the exact reviewed path cannot create a
precondition safely, that scenario remains BLOCKED; do not forge service state
or loosen constraints.

## Isolation and cleanup evidence

Before device scenarios, authenticate as A and B separately and verify:

- A can read A's items and run; B can read B's items and run.
- A cannot read, mutate, substitute, or resolve B's item or execution ID, and
  vice versa. Denial results return no foreign row data.
- Switching accounts clears old-owner visible state before loading the new
  owner's server state; delayed responses from the old owner are discarded.
- Every execution transition receipt has the expected owner, operation ID,
  revision, and decision/step fingerprint. No credentials or access tokens are
  captured in evidence.

At expiry, the named cleanup owner removes both accounts and all fixture-owned
rows and objects through the reviewed cleanup path, then verifies the isolated
project contains no records for either fixture label. Record timestamps,
deleted counts, and reviewer initials without retaining credentials. The
current inventory has no provisioned data and therefore no active cleanup
deadline.

# Privacy retention enforcement

Deterministic cleanup for expired export artifacts, expired
execution/recommendation operational data, and expired consent history,
plus the retention rules that keep deletion records. Enforcement lives in
`supabase/migrations/20261015200000_privacy_retention_cleanup.sql` (execution
purge + legal-hold flag), `supabase/migrations/20261016155100_consent_retention_cleanup.sql`
(consent purge) and the existing `export_retention_cleanup()`
routine; the schedule lives in `workers/account-deletion`, which runs the
account-deletion claim first and the retention pass second on the same
once-per-minute Cron Trigger. Inside the retention pass the order is
exports, then executions, then consent. This runbook is the operator summary; the
migration headers document every number with rationale.

## Per-category rule, window, and order

| Category | Rule | Window | Purge order |
|---|---|---|---|
| Terminal executions | `completed` rows purge-eligible after `finishedAt`; `abandoned` rows likewise | 90 days (completed) / 30 days (abandoned) after `finishedAt`, from the Task-7 runbook | events, then operations ledger rows matched via `request->>'executionId'`, then the execution row (cascades stragglers) |
| Recommendation runs | never purged (audit root; see below) | n/a | n/a |
| Export artifacts | download gate stays 24h (`expires_at` in `export_download`); documents nulled, receipts kept | 7 days after completion | document nulling only; job rows survive |
| Cancelled deletion records | retained as audit trail (lifecycle `cancelled` events) | n/a — never eligible | n/a |
| Completed deletion records | retained (purge-completed tombstones + `purged`/`auth-deleted` events) | n/a — never eligible | n/a |
| Consent records | survive profile purge by design (no profile FK); retention pass purges rows with `recorded_at` strictly older than 7 years before the pass as-of, except the latest record per purpose while the profile exists (current state, kept at any age) | 7 years, enforced by `consent_retention_cleanup(as-of)` | expired superseded history and expired deleted-owner rows purge first within the consent step; active latest per purpose never purges |

Eligibility details for executions: non-terminal rows are never eligible;
`finishedAt` comes from the execution snapshot and a null or unreachable
`finishedAt` is never eligible (fail-closed); anything with `legal_hold =
true` is never eligible. A malformed `finishedAt` fails the run loudly
instead of silently skipping rows — alert on repeated
`retention_cleanup_run outcome=failed` metrics.

Eligibility details for consent: the pass as-of is the worker's current
time (frozen per test via the explicit `p_as_of` argument). While the
profile exists, the latest row per `(user_id, purpose)` is current state
and never purges; superseded rows purge once strictly older than 7 years
before as-of. After the profile is gone, rows purge once strictly older
than 7 years; recent rows survive. Exactly-7-years-old rows survive
(strictly-older-than purges). The routine returns a count only, runs
scheduler-only (revoked from `anon`/`authenticated`), and adds no
UPDATE/DELETE grant or policy — the append-only consumer surface is
unchanged.

## Runs are never purged (documented choice)

Executions reference runs through `protocol_executions_run_fk ON DELETE
CASCADE`, so deleting a run would cascade-delete its executions, while
deleting an execution leaves its run behind with no constraint violated.
Runs carry no terminal state and no expiry semantics, are capped at 256 KiB,
and keep finished routines reproducible. Purging executions but keeping runs
orphans nothing: the FK direction tolerates run rows with no executions.

## Deletion records are retained (legal rule)

Purge-completed tombstones back the completion guard that denies profile
recreation with a stale JWT — deleting them would reopen that hole. The
lifecycle event table is append-only by binding constraint (see below), so
there is deliberately no deletion-record purge function. Cancellation stays
move-then-delete: the tombstone row is gone, only the `cancelled` event
(username/reason/deleted_at, never email) remains.

## Legal hold (operator mechanism)

No consumer RPC sets legal hold. An operator with a privileged connection
runs:

```sql
update public.protocol_executions set legal_hold = true
 where user_id = '<owner>' and execution_id = '<execution>';
```

Clear it the same way when the hold lifts; the next retention pass then
applies the normal windows. The flag is visible to owners through the
existing SELECT policy and carries no PII.

## Task-9 lifecycle constraint compliance

- Only `cancelled` events are appended by any code path here (none — this
  task writes no lifecycle events); `purged`/`auth-deleted` vocabulary is
  not widened and no review is triggered.
- The lifecycle table stores nothing beyond tombstone-held fields; this
  task stores nothing there at all.
- No UPDATE/DELETE grant or policy is added to the lifecycle table or any
  other table in this change.
- Forced RLS stays owner-scoped on every touched table; no policy is added
  or changed.
- `authenticated`/`anon` gain nothing: the new routine is revoked from
  both, exactly like the other maintenance routines.
- No FK to profiles is added anywhere (the lifecycle table stays FK-free;
  the execution tables keep their existing cascade chain).

## Scheduling and hosted secrets (pending manual actions)

Local implementation and tests stop here. A release operator performs these
external steps; none is done in this change:

1. Deploy the reviewed forward migration before enabling the worker
   (hosted application stays HOLD until recorded, as with Tasks 9–12).
2. From `workers/account-deletion`: `npm ci`, then `npm run check`
   (boundaries + typecheck + wrangler dry-run).
3. Authenticate Wrangler to the intended Cloudflare account (`npx wrangler
   whoami`) and confirm the existing `STRANDCUE_SUPABASE_URL` /
   `STRANDCUE_SUPABASE_SERVICE_KEY` secrets are still the scheduler's
   server-only bindings. No new secret is introduced by this task.
4. `npm run deploy`. The existing once-per-minute Cron Trigger now also
   runs the retention pass after the deletion claim each invocation.
5. Inspect the first scheduled invocations: expect one redacted
   `retention_cleanup_run` metric per run alongside the existing
   `account_deletion_worker_run` metric, no HTTP route, no repeated
   failures. The metric carries counts only:

```json
{"event":"retention_cleanup_run","outcome":"completed","exportsPurged":0,"executionsPurged":0,"eventsPurged":0,"operationsPurged":0,"consentsPurged":0,"cueCheckOperationsPurged":0,"durationMs":0}
```

Alert on `outcome=failed`, on repeated failures, and on a growing backlog
of terminal executions older than their windows. To pause retention only,
there is no separate trigger — pausing the worker pauses both passes;
resume only after `npm run check` and a manual verification succeed.
Rotate the service-role key through Supabase and Cloudflare together.

## Cue Checks (Increment 4)

Cue Checks are the owner's own private observations. They are owner content:
kept for the life of the account, exported (export v5, `cueChecks` and
`cueCheckRevisions`) and removed by the profile-deletion cascade, including
their revisions and private operation receipts. They are never purged with the
execution retention window and no worker pass touches them.

The privacy owner settled the Cue Check retention policy on 2026-10-22:

- `cue_checks.confirmed_steps` is a copy of the confirmed step ids, action text
  and product/tool ids taken when the check was recorded. It outlives the
  execution row it was copied from (90 days after finish for completed
  routines, 30 days for stopped ones).
- `strandcue_private.cue_check_operations` keeps each submitted payload and
  result, including free-text notes, for 30 days. The scheduled pass calls
  `cue_check_operation_retention_cleanup(as-of)` and removes only receipts
  strictly older than that window. Exact replay is therefore a 30-day
  guarantee. The function returns a count only and does not touch Cue Checks,
  revisions, confirmed steps or owner history.

### Database guards on Cue Check history (Increment 5, Task I5.0)

`20261024120000_cue_check_hardening.sql` adds operational rules that matter to
anyone erasing or restoring data:

- `TRUNCATE` of `cue_check_revisions` is refused while any history exists. That
  includes `truncate public.profiles cascade` and `truncate public.cue_checks
  cascade`. Erasure must delete rows: the account-deletion worker, the deletion
  purge and reapply functions, or the `auth.users` cascade all do, and none is
  blocked. `pg_restore --clean` drops tables instead of truncating them.
- A Cue Check head row changes only through the append-only revision path: a
  change to its observation, lifecycle, revision or observation time needs
  `revision = old + 1` and a matching revision row.
- A Cue Check is created only from a recommendation run marked trusted.
- Retries are serialised per owner and operation, so an identical concurrent
  retry returns the stored receipt. Replay is still guaranteed only while the
  30-day receipt exists.
- Cue Check definers and the shared helpers they reach pin `search_path = pg_catalog, pg_temp`, so a caller's temporary
  types cannot run code as the definer. Older definers elsewhere keep the empty path until a separate follow-up.

## Treatment programmes (Increment 5, Task I5.4)

A treatment programme is the owner's own record that they started a programme with an exact product and product
version under an exact reviewed rule, plus the append-only history of what they did next. It is owner content:
kept for the life of the account, exported (export v6, `treatmentProgrammes` and `treatmentProgrammeEvents`) and
removed by the profile-deletion cascade together with its lifecycle history, completion snapshot and private
operation receipts.

- A wash count, due status or programme state is never stored. Each read derives it from the owner's canonical
  care events and the exact reviewed rule publication named by the enrolment. The only stored derived result is
  the completion snapshot, built once by the server at completion and immutable afterwards (including against a
  privileged rewrite; erasure still works because it deletes rows through the cascade).
- `strandcue_private.treatment_programme_operations` keeps each submitted command and its result for 30 days. The
  scheduled pass calls `treatment_programme_operation_retention_cleanup(as-of)`, which removes only receipts
  strictly older than that window and returns a count. It does not touch programmes, lifecycle history, snapshots,
  reviewed rules or audit history. Exact replay is therefore a 30-day guarantee. Hosted deployment of the
  scheduled call remains a HOLD.
- `TRUNCATE` of `treatment_programmes` or `treatment_programme_events` is refused while any history exists,
  including through `truncate public.profiles cascade`. Erasure deletes rows (the deletion worker, purge and
  reapply, or the `auth.users` cascade) and none of those is blocked.
- Two service-internal tables sit beside the owner tables and are not owner data, not exported and not
  owner-readable: `strandcue_private.programme_rule_publications` (reviewed rule content, immutable once published,
  bound to its sha-256 digest, a different reviewer from the author) and `strandcue_private.execution_step_care`
  (the trusted classification of a confirmed execution step as wash or application). Both are created empty by
  the migration. **Operator note:** no writer for either exists yet. Until reviewed rule content is published and a
  trusted step-classification writer exists, enrolment is refused with `rule-content-pending` and no execution step
  can become a programme care event. Publishing a rule is a reviewed-content release, never a migration side effect.
- Execution evidence: a programme's counts are derived from confirmed, classified execution steps. The 90-day (completed) and
  30-day (abandoned) execution purge would erase them, so `protocol_execution_retention_cleanup()` now skips an execution whose
  steps are classified as wash or application while the owner has an active programme. Completing or closing the programme
  releases them for the normal purge; a completed programme keeps its own immutable snapshot. This extends how long such
  executions are kept, only for owners who chose to run a programme.
- Closing: `change_programme` with `{kind: 'abandon'}` ends a programme the rule can no longer serve (for example after a
  rule withdrawal). History is kept, nothing is derived for it afterwards, and its enrolment slot is freed.
- Receipts are capped at 2,000 per owner (retained 30 days). An issued export is never rewritten on replay.
- Legal hold: the existing operator mechanism (`protocol_executions.legal_hold`) governs only execution
  retention. Programme tables have no hold flag because no retention pass deletes programme facts, history or
  snapshots; only the 30-day receipt cleanup runs, and receipts are replay material rather than evidence. A hold
  that must survive an owner's own account deletion would be a new design decision and is not introduced here.

# Protocol execution persistence — limits, skew, locks, integrity, retention

Owner-isolated execution history for following one immutable recommendation
run. Authoritative enforcement lives in the migration chain under
`supabase/migrations/` (latest:
`20261014211011_protocol_execution_bounds_integrity.sql`, whose header
documents every number below with rationale); this runbook is the operator
summary. The mobile client only submits bounded commands and never supplies
ownership, decisions, or snapshots.

## Limits

| What | Value | Why |
|---|---|---|
| Non-terminal executions per owner (`in_progress`, `paused`) | 10 | An owner legitimately holds a few paused routines beside the active one; 10 gives headroom while capping start-spam. Terminal rows never count. Rejects with `too-many-active-executions`. |
| Total events per execution (sequence cap) | 500 | A routine resolves each step once plus a handful of status events (dozens at most); 500 is >10x headroom and stops an infinite pause/resume hammer. Rejects with `too-many-events`. |
| Steps per execution | 200 | Human routines are single-digit steps; 200 bounds the snapshot-build loop and converts oversized plans into `too-many-steps` instead of a raw CHECK failure. |
| Decision / execution / command JSON | 256 KiB each | Pre-existing column/core caps; one routine can never become an unbounded store. |
| Deviation free text (`reason`/`detail`) | 2 KiB octets | Pre-existing; history-only text stays small. |
| Step identifiers | 256 octets | Pre-existing bounded-identifier shape. |
| Idempotency-ledger request / result | 512 KiB each | New column CHECKs; 2x the largest wrappable bounded field, so no legitimate receipt trips them. |
| Event command | 256 KiB | New column CHECK mirroring the core's command cap. |
| Ledger row count | unbounded by design | Each start/transition mints one idempotency row, so a count cap would eventually refuse legitimate work. Size-bounded instead; terminal receipts become compaction-eligible under Retention below. |

## Caller-time skew window

`p_started_at` / `p_at` are *claimed* event times and must sit inside
**+5 minutes / −24 hours around server `now()`**
(`timestamp-out-of-range`). +5 minutes absorbs worst-case phone-clock drift
(the usual 5-minute skew convention) without letting callers future-date
history; −24 hours lets an owner finish steps offline and sync later the
same day, while older timestamps are history-shaping. The check sits after
the idempotent replay early-return, so retrying an accepted operation still
replays after its timestamp ages out; claimed time is preserved in the
snapshot (`startedAt`/`confirmedAt`/`finishedAt`).

## Receipt times (server-owned)

`protocol_execution_events.recorded_at` and
`protocol_execution_operations.created_at` both `DEFAULT now()` and are the
server receipt times; `protocol_executions.created_at`/`updated_at` are
likewise server-stamped (`updatedAt` in the snapshot equals the row's
`updated_at`). No separate receipt column was needed.

## Concurrency

Both cores reserve `(user_id, operation_id)` with
`pg_advisory_xact_lock(hashtext('protocol-execution-op'),
hashtext(uid || ':' || operation_id))` before the replay SELECT.
Transaction-scoped: one key per owner+operation, auto-released at
COMMIT/ROLLBACK, no manual unlock. A concurrent retry of the same operation
blocks until the winner commits, then replays the committed receipt instead
of colliding on the operations primary key. Lock order (run-row lock first,
advisory second in start; no row lock before the advisory lock in
transition) is deadlock-free.

## Relational integrity

- `protocol_executions(user_id, recommendation_run_id)` →
  `recommendation_runs(user_id, request_id)` `ON DELETE CASCADE` (the run
  side is the request id, never the pk id).
- `protocol_execution_events(user_id, execution_id)` →
  `protocol_executions(user_id, execution_id)` `ON DELETE CASCADE`.
- Plain (fully validated) foreign keys: every database is built by
  replaying the chain onto empty tables, so there is no backfill to scan.
- Deletion policy follows the profiles chain: deleting the owner profile
  purges runs, executions, events, and operations rows (proven by test).
  Children never strand and never block owner deletion.

## Retention / cleanup (policy; enforcement is Increment 2 / Task 13)

Task 13 and its follow-up consent/scheduler repairs implement this policy in
source. See [privacy retention](privacy-retention.md) for the current routines,
seven-year consent handling, schedule and required pre-deploy alert routing.
Hosted application remains pending. The implementation follows this policy:

- Eligibility: `completed` executions 90 days after `finishedAt`;
  `abandoned` executions 30 days after `finishedAt`. Non-terminal rows are
  never eligible, and anything under legal hold is never eligible.
- Purge order per execution: events, then operations ledger rows matched
  via `request->>'executionId' = <execution id>`, then the execution row
  itself (which cascades any remaining events). Operations rows have no FK
  to executions, so the `request` match is the join format.
- Terminal receipts older than the windows above may additionally be
  compacted (drop `result`, keep `request` for audit) instead of deleted,
  at the worker author's option with its own test.
- Tests MUST freeze time and prove active, fresh-terminal, and
  legal-hold rows survive. Scheduling and hosted secrets remain pending
  manual actions and are out of scope for the source change.

# Real PostgreSQL Heat Coach concurrency proof

`heat-coach-concurrency.pg.test.ts` is opt-in. It accepts only a numeric loopback
`STRANDCUE_PG_DSN` for a disposable PostgreSQL database with the full migration
chain. A skipped Vitest run is not a concurrency proof. The suite creates only
synthetic Auth owners, capability and rule publications, assessments, and runs;
it does not contact hosted Supabase. Fixture owners and publications are removed
after the suite. The existing assessment and quota races use separate owners or
publications from the bound-run races.

On 2026-10-29, the suite passed 7/7 against a disposable PostgreSQL 18.6
instance on `127.0.0.1`, with the two trusted Heat Coach binding migrations
applied. The first run exposed a synthetic fixture carrying another owner's
JWT claim into the revision helper; the fixture now sets the correct owner
claim before creating each bound run, and the full suite passed on rerun.

## Bound no-heat start versus publication withdrawal

Each order seeds a separate published rule, an owned `no_heat` assessment with
current source revisions, and a service-written trusted ready run bound to the
assessment and exact publication digest. The start call uses the authenticated
owner. Two independent PostgreSQL clients expose their exact `pg_backend_pid()`
values. The observer polls `pg_stat_activity` for the waiting PID and requires
`wait_event_type='Lock'`, a lock wait event (`transactionid` or `tuple`),
and `pg_blocking_pids(waiting_pid)` containing the other exact PID.

1. **Start commits first:** Session A starts the run inside a transaction and
   retains the publication `FOR SHARE` lock. Session B submits withdrawal and
   must block on A. A commits; B completes. A new operation on the run must
   raise `stale-heat-binding`. Replaying the original operation with the same
   execution ID and timestamp must return the original receipt. Exactly one
   execution and one start event may exist for the run.
2. **Withdrawal commits first:** Session B updates the publication to
   `withdrawn` inside a transaction. Session A submits the bound start and
   must block on B. B commits; A must raise `stale-heat-binding`. No execution
   or event may exist for the run.

Both clients have a bounded statement timeout and are rolled back and closed
even if an assertion fails. These are local wire-protocol race proofs; they do
not establish hosted deployment or device behavior.

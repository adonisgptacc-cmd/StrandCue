# Real-Postgres two-session op-id concurrency proof (DB-002)

The automated suite `protocol-execution-concurrency.pg.test.ts` passed against
the disposable local Supabase stack during the final Increment-4 fix wave on
2026-10-18. See the Task-25 addendum for exact evidence. It remains opt-in and
skips by default. Local execution does not prove hosted behavior or close DB-002.

## Target and fixture boundary

Set `STRANDCUE_PG_DSN` only for a disposable database with the full migration
chain. Only `postgres:`/`postgresql:` URLs using numeric `127.0.0.1` or `[::1]`
are accepted. Query options and fragments are rejected, preventing `host` or
`service` options from changing the connection target. DNS hosts, including
localhost and every hosted/staging host, are refused. No DSN default exists.
The optional `pg` driver is supplied in ignored scratch dependencies; no
manifest/lockfile change is needed. Never print credentials.

Use fixture authority that can insert a synthetic confirmed Auth owner,
complete that owner's profile, and invoke the private trusted writer as
`strandcue_mutator` with the owner's claims. The suite never changes grants,
roles or schema. Fresh trusted `ready` runs contain synthetic unpublished
content. Public start/transition calls execute as `authenticated`.

## Binding choreography

1. Assert the exact current start signature exists:
   `start_protocol_execution(uuid,uuid,uuid,timestamptz)`.
2. Seed a fresh owner/profile and trusted ready run.
3. Obtain both clients' `pg_backend_pid()` values. A begins a transaction and
   executes a start operation, retaining its transaction lock.
4. B submits the *identical* operation, execution, run and timestamp. Poll
   `pg_stat_activity` by B's exact PID; require `wait_event_type='Lock'` and
   `pg_blocking_pids(B)` containing A's exact PID. No username filter, elapsed
   time substitute, arbitrary sleep or unrelated backend counts as proof.
5. Only after observation, commit A. Require B's complete receipt to equal A's
   receipt; a raw 23505 or stable conflict rejects the query and fails the test.
6. Repeat with the exact same pause transition operation, expected revision,
   command and timestamp. Start may block on `transactionid` because the run
   row locks first; transition directly observes `advisory` contention.
7. For non-contention, seed distinct runs and operations. Hold A's successful
   start uncommitted while B completes under a 2-second statement timeout.
   Require distinct execution IDs before committing A. Same-run starts
   intentionally serialize and do not belong in this sanity case.
8. In failure paths roll back A, settle B under the bounded statement timeout,
   and close both clients. After the suite delete only the freshly minted Auth
   owner and verify no owner rows remain in Auth, profile, run, execution,
   event or operations tables. Cascades remove all fixtures.

## What PGlite proves

PGlite proves replay convergence and the SQL invariants in the embedded suites.
Its single embedded backend cannot prove wire-level blocking or two backends
contending on `pg_advisory_xact_lock`. The opt-in suite above provides real local
wire-protocol observations. Required hosted/device proof and closing authority
remain separate release gates.

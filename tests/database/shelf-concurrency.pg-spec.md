# Real-Postgres two-session shelf op-id retry proof (shelf idempotency)

The automated suite `shelf-concurrency.pg.test.ts` is the wire-level half of
the shelf operation-idempotency contract (C5 of the Task 2.1 review). It is
opt-in and skips by default: without `STRANDCUE_PG_DSN` the suite reports
itself as SKIP/BLOCKED, never as a concurrency pass.

## Target and fixture boundary

Set `STRANDCUE_PG_DSN` only for a disposable database with the full migration
chain. Only `postgres:`/`postgresql:` URLs using numeric `127.0.0.1` or
`[::1]` are accepted. Query options and fragments are rejected, preventing
`host` or `service` options from changing the connection target. DNS hosts,
including localhost and every hosted/staging host, are refused. No DSN default
exists. The optional `pg` driver is supplied in ignored scratch dependencies;
no manifest/lockfile change is needed. Never print credentials.

Use fixture authority that can insert a synthetic confirmed Auth owner,
complete that owner's profile, and call the public shelf boundary as
`authenticated` with the owner's claims. The suite never changes grants, roles
or schema. The suite never writes to a database that holds real owner data.

## Binding choreography

1. Assert the exact current add signature exists:
   `public.shelf_add(uuid,uuid,uuid,text,text,text,text,text,jsonb,jsonb)`.
2. Seed a fresh Auth owner, complete that owner's profile, and mint one
   operation id and one product id.
3. Obtain both clients' `pg_backend_pid()` values. A begins a transaction and
   executes the operation, retaining its transaction lock. The lock the
   operation takes is the owner's own profile row
   (`select 1 from public.profiles where user_id = uid and account_status =
   'active' for update`), so B waits there.
4. B submits the *identical* operation id and payload. Poll `pg_stat_activity`
   by B's exact PID; require `wait_event_type='Lock'` and
   `pg_blocking_pids(B)` containing A's exact PID. No username filter, elapsed
   time substitute, arbitrary sleep or unrelated backend counts as proof.
5. Only after observation, commit A. Require B's complete receipt to equal A's
   receipt. A raw 23505, a `revision-conflict` or any other failure rejects
   the query and fails the test: the loser of the lock must replay the stored
   result.
6. Repeat with the same operation id and a *different* payload. B must answer
   the stable `operation-conflict` (23505), never `revision-conflict` and
   never a raw unique violation.
7. In failure paths roll back A, settle B under the bounded statement
   timeout, and close both clients. After the suite delete only the freshly
   minted Auth owner and verify no owner rows remain in Auth, profile, the
   shelf tables or the operations table. Cascades remove all fixtures.

## What PGlite proves

`tests/database/shelf.test.ts` proves the same rules sequentially in the
embedded engine: a repeated operation id with the same payload replays the
stored result, and a differing payload answers `operation-conflict` - never
`revision-conflict`, never a raw unique violation. Its single embedded backend
cannot prove wire-level blocking or two backends contending on the owner's
profile-row lock. The opt-in suite above provides the real local wire-protocol
observation. Hosted and device proof remain separate release gates.

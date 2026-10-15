# Real-Postgres two-session op-id concurrency spec (DB-002 live proof — SPECIFIED, NOT EXECUTED)

Status: specification only. No live Postgres is available in this environment
and hosted services are forbidden, so the choreography below has never been
run. The env-gated suite `protocol-execution-concurrency.pg.test.ts` in this
directory implements exactly this spec and skips by default.

## Why this spec exists

The op-id concurrency mechanism (`supabase/migrations/20261014211011_protocol_execution_bounds_integrity.sql:41-50,203-217,353-367`)
serializes same-owner+same-op work with
`pg_advisory_xact_lock(hashtext(uid || ':' || operation_id))` taken BEFORE the
replay SELECT, using the identical key in both the start and transition cores.
A replayed op returns the winner's receipt (`operation-conflict` is raised only
for genuinely conflicting state, never as a raw constraint violation to the
client).

PGlite CANNOT prove the blocking half of this: it runs a single embedded
backend that serializes all queries, so two "sessions" can never contend on an
advisory lock. PGlite proves replay-convergence only (same op twice → winner's
receipt, zero raw 23505). Wire-level blocking — session B demonstrably waiting
on session A's open transaction — requires two real wire-protocol sessions
against a real Postgres. That proof is specified here and stays carried until
an operator runs it against a local/staging database.

## Prerequisites (operator-provided, never hosted)

1. A real **local or staging** Postgres with the FULL migration chain applied
   in order (same chain the PGlite harness replays from `supabase/migrations`,
   including the `auth.users` stand-in or a local Supabase `db` service with
   the `strandcue_*` roles present).
2. The operator exports `STRANDCUE_PG_DSN` pointing at that database, e.g.
   `postgres://postgres:postgres@localhost:5432/strandcue_local`.
3. The DSN must NEVER point at a hosted project: any host ending in
   `supabase.co` or matching the pooler pattern (`pooler`, `*.pooler.*`) is
   refused with a hard skip + warning. There is no default DSN.
4. The `pg` driver must be resolvable (it is intentionally NOT a repo
   dependency; install it in a scratch environment, never commit it).

## Choreography (normative)

Setup (admin client on the DSN):

1. Assert the chain is present: `to_regproc('public.start_protocol_execution')`
   is not null AND `strandcue_private.protocol_execution_operations` exists.
   Otherwise fail loudly (never silently pass).
2. Mint a fresh owner UUID; ensure its `auth.users` row and a completed
   `complete_account` profile exist (act as the owner via
   `set_config('request.jwt.claim.sub', uid, false)` + `set role authenticated`,
   mirroring `tests/database/harness.ts`).
3. Seed one trusted recommendation run usable by `start_protocol_execution`.

Pair 1 — identical op must block, then converge (the proof):

4. Session A (client 1): `BEGIN`; `SELECT public.start_protocol_execution(op X,
   ...)`; hold the transaction open and `SELECT pg_sleep(5)` — the advisory
   xact lock from step 4 is held until A commits.
5. Session B (client 2, concurrent while A sleeps): issue the IDENTICAL call
   with op X and record start time.
6. While B is in flight, on the admin client assert B is blocked on a lock:
   `select wait_event_type, wait_event from pg_stat_activity where ... = B's
   backend pid` shows `wait_event_type = 'Lock'` (advisory-xact contention),
   OR equivalently B's elapsed time already exceeds the no-contention baseline.
7. A: `COMMIT`. B must now resolve.
8. Assert: B's elapsed time ≥ the sleep window (it demonstrably waited); B's
   returned receipt EQUALS A's receipt (same `execution_id` — the winner's
   receipt, replay-converged); and at no point did either session surface a raw
   `23505` to the caller (the only `23505`-coded raises are the mapped
   `operation-conflict`/`execution-conflict` stable errors, and pair 1 must
   produce neither — it produces the winner's receipt twice).
9. Cleanup pair-1 rows.

Pair 2 — distinct-op sanity (no cross-blocking):

10. Sessions C and D concurrently call `start_protocol_execution` with DISTINCT
    ops Y and Z (same owner).
11. Assert: both resolve in ≈ the no-contention baseline (no lock waiting in
    `pg_stat_activity`), each with its OWN `execution_id`. This proves the lock
    key is op-scoped (`uid || ':' || operation_id`), not owner-scoped.
12. Cleanup all seeded rows (executions, events, operations ledger, run,
    profile, auth user) so re-runs are hermetic.

## What PGlite can and CANNOT prove (binding)

- PGlite PROVES replay-convergence only: same op issued twice returns the
  winner's receipt with zero raw 23505 (covered by
  `tests/database/protocol-executions.test.ts`).
- PGlite CANNOT prove wire-level blocking: its single embedded backend
  serializes every query, so two sessions can never contend on
  `pg_advisory_xact_lock`. Any claim that PGlite demonstrates blocking is
  false. The live proof is this spec, still unexecuted.

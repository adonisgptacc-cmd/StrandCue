# Phase 2a WO-D: database diagnostics and concurrency verification

Date: 2026-11-06
Branch: `codex/phase2a-wo-d-database-diagnostics`
Base: `152bebe2ab4c791e91af252542487877a2feddac`

## Scope and result

WO-D replayed the current migrations on a fresh, disposable local Supabase stack and ran the database, local API, and full repository checks. No application behavior or database migration was changed. The only test behavior adjustment scopes real-Postgres table-count assertions to the test user so parallel tests cannot affect the proof.

The local stack used Supabase CLI 2.117.0, Edge Runtime 1.74.3, and PostgreSQL 17 on the dedicated loopback API/database ports configured for this worktree. The project was reset without seed data; all 83 repository migrations applied successfully. The worktree's temporary Supabase port/project overrides have been restored, and the named local stack has been stopped. No hosted Supabase target was used.

## Verification

- Full repository suite with local API and real PostgreSQL opt-in checks enabled, four workers: 883 files, 5,204 tests passed, 0 failed, 0 pending.
- Focused local API and real-Postgres concurrency files together, two workers: 2 files, 13 tests passed.
- The seven real-Postgres race scenarios passed against PostgreSQL 17 through PostgREST, including same-operation retries, payload conflicts, concurrent revision changes, and shelf/tool overlap.
- After independent review, the SQL helper was hardened to require an explicit `STRANDCUE_LOCAL_DB_URL` instead of silently defaulting to port 54322. The local API and real-Postgres files were rerun together against the isolated stack: 13/13 passed.
- A second review found that the Auth-returned owner ID was interpolated into SQL. The test now validates the response as a UUID before it can reach the SQL count helper. A regression rejects SQL-shaped IDs; the focused local API/Postgres files passed 14/14 against the disposable database after the fix.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings. Four pre-existing, unused `import/no-unresolved` disable comments were removed from database test files; no behavior changed.
- `npm audit`: reported 20 dependency advisories (1 low, 14 moderate, 5 high, 0 critical). No dependency changes or automatic fixes were applied because dependency remediation is outside WO-D scope.
- The treatment-history linear-time bound passed unchanged in the full database suite. Its measured test duration was approximately 5.85 seconds including fixture setup, below the existing 8-second assertion.
- A prior eight-worker run hit a PGlite locator `beforeAll` timeout under worker contention; the test passed alone and the full four-worker database run passed. Four workers were used for the accepted full run.

## Failure diagnosis and correction

The first broad opt-in run reported two revision-count failures in `tests/database/real-postgres-concurrency.test.ts`. Investigation showed two test-harness issues, not a database behavior failure:

1. The SQL helper defaulted to port 54322 even though the disposable API/database pair for this worktree used ports 55531/55532. The corrected proof explicitly supplied `STRANDCUE_LOCAL_DB_URL` for the same local database used by the API.
2. The assertions counted rows for every user. Parallel local API tests can write unrelated users' shelf/tool rows during a count. The helper now filters public records by `owner` and operation rows by `user_id`, scoped to the Auth user created by this test.

After the correction, the two formerly conflicting test files passed together (13/13), followed by the complete suite (5,204/5,204).

## Other diagnostics

- `supabase_admin` was used for the privileged local PostgreSQL test DSN because the default local `postgres` role was not a superuser in this stack. Its role behavior was checked; no grants or roles were broadened.
- `npm ci --ignore-scripts` under Node 24 installed the locked dependencies for verification. The system npm launcher uses Node 25 and was avoided; direct npm CLI invocation under Node 24 passed the runtime guard.
- Optional API tests are no longer pending in the final full run. Test credentials and the database password were read only from the dedicated local containers and were not written to this report or repository.

## Files changed

- `tests/database/real-postgres-concurrency.test.ts`: isolate cross-test row counts to the fixture's owner.
- `tests/database/cue-check-concurrency.pg.test.ts`
- `tests/database/protocol-execution-concurrency.pg.test.ts`
- `tests/database/shelf-concurrency.pg.test.ts`
- `tests/database/treatment-programme-concurrency.pg.test.ts`: remove stale no-op lint suppression comments.

## Gate status

WO-D's local database diagnostics and verification are complete. This evidence does not itself accept Phase 2a or satisfy Human A/Human B approvals. Keep the branch isolated pending independent review and the approved integration decision. Nothing was merged, pushed, deployed, published, or applied to hosted Supabase.

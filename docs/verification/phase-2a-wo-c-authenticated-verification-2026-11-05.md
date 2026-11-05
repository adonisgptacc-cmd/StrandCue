# Phase 2a WO-C authenticated verification proof

Date: 2026-11-05

## Scope

This work order verifies the real local Supabase Edge HTTP path for `verify-engine-ruleset`: user authentication, author ownership, content integrity, service-only verification writes, exact persisted verification data, and the distinct author/reviewer publication gate. The proof uses only a disposable local Supabase stack. It does not link to or call hosted Supabase.

## Environment and target safeguards

- Supabase CLI: 2.117.0; Edge runtime: 1.74.3; PostgreSQL: 17 (`server_version_num=170006`).
- The stack used a WO-C-specific project ID and dedicated API/database ports 55431/55432 after checking those ports and the container name were unused. The harness itself requires these exact ports and a local `postgres` database. Existing local StrandCue stacks were left running.
- The harness refuses non-loopback or wrong-port Supabase HTTP/database URLs before making requests. Supabase status values were passed through process environment and were not printed.
- Test accounts use generated addresses and passwords. The harness deletes created Auth accounts in `finally`; the disposable local stack was then stopped without a backup. A container check confirmed no WO-C containers remained.
- `supabase/config.toml` was restored after the local run. No remote project ref was present or created.

## HTTP cases exercised

The harness in `scripts/verify-engine-ruleset-local.ts` created synthetic local author and reviewer accounts and exercised the deployed local Edge handler over HTTP:

1. Unauthenticated request is rejected with HTTP 401.
2. Authenticated non-owner cannot verify the author's draft.
3. Stale packet digest is rejected.
4. A locally tampered, otherwise valid ruleset body is rejected with the server-computed content-hash mismatch response.
5. A packet with an unexpected schema field is rejected as invalid.
6. An authenticated client cannot write the service-only hash-verification RPC directly.
7. The authenticated owner receives a successful response containing the exact publication ID, digest, and content hash; SQL confirms exactly one corresponding immutable verification row.
8. Rejected altered/invalid packets created no verification rows.
9. The author can record author approval, cannot supply the distinct reviewer approval, and cannot publish while that independent approval is absent; SQL confirms the publication remains a draft. A separately authenticated, qualified reviewer can then approve, after which the author publishes; SQL confirms the final published state.
10. Responses were checked for generated credentials, other actors' identifiers, and packet sentinels. Approval confirmations may contain the authenticated actor's own ID, which the harness explicitly permits only for that actor's own approval response.

The tamper case modifies a content-bearing rule version only inside this disposable local database after draft creation. It does not alter project migration files or hosted data.

## Verification results

- Local Edge-to-RPC HTTP proof: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --reporter=dot`: passed, 264 files and 5,157 tests; 8 files / 47 tests were skipped by existing optional test conditions. Three real-PostgreSQL concurrency specs explicitly skipped because `STRANDCUE_PG_DSN` was unset. This work order's local Edge proof still used the disposable PostgreSQL database directly.
- `git diff --check`: passed.

The test suite emitted existing React test-renderer and `act(...)` environment warnings. They did not fail the checks.

## Limitations and status

This establishes the authenticated local Edge/RPC behavior on local Supabase/PostgreSQL. It is not hosted-environment verification. It does not by itself close Phase 2a: the remaining work orders, integration candidate review, and the agreed Human A/Human B approval are still separate gates. Nothing in this work order was merged into `main`, pushed, deployed, published, or applied to hosted Supabase.

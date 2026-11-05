# Engine ruleset hash trust boundary implementation plan

> **For agentic workers:** use the repository's test-first workflow for each task; keep this work in the isolated Phase 2a worktree.

**Goal:** Require trusted server-side verification of an engine ruleset's canonical content hash before the database can publish or load that ruleset.

**Architecture:** Add a private immutable verification ledger and narrow owner-read/service-write RPCs. A new authenticated Edge Function validates the owner's draft with the engine schema and computes the hash with the engine's canonical hash function. The database publication trigger and privileged loader both require the matching verification row.

**Tech Stack:** TypeScript, Supabase Edge Functions, PostgreSQL, Vitest, the existing engine package and Supabase client.

**Spec:** `docs/superpowers/specs/2026-11-04-engine-ruleset-hash-trust-boundary-design.md`

## Global Constraints

- Keep canonical hashing in `packages/engine`; do not copy the serializer into SQL.
- Keep A/B approval, parent binding, direct-publish rejection and published timestamp immutability.
- Do not use hosted Supabase, deploy, publish production content, commit, merge or push.
- Never accept packet contents or a verification result supplied by the client.
- Never expose the service role key outside Edge Function runtime configuration.

## Review Focus

1. A client must not forge or mutate a hash-verification record; test authenticated attempts and service-role-only execution.
2. A stale digest or changed draft must not be marked verified; test digest mismatch and concurrent state change.
3. An owner must not read another author's draft for verification; test wrong-owner request.
4. A malformed or hash-mismatched packet must fail before any verification row is written; test both paths.
5. A verified packet still needs distinct A/B approvals and immutable content; test missing approvals and post-verification mutation.

---

### Task 1: Gate database publication and loader on verified hashes

**Files:**
- Create: a migration under `supabase/migrations/`
- Modify: `tests/database/engine-ruleset-publication.test.ts`
- Modify: `tests/database/migration-inventory.test.ts`

**Interfaces:**
- Add an append-only verification row keyed by publication ID and packet digest, recording the verified engine content hash and server verification time.
- Add an owner-scoped draft read RPC and a service-role-only verification write RPC.
- Require the exact verification tuple before publishing or loading.

- [x] Add failing database tests: publishing an otherwise A/B-approved draft without a verification row is rejected; authenticated users cannot write the verification ledger; verified hash/digest mismatch is rejected.
- [x] Run the focused database test and confirm it fails because the verification gate is missing.
- [x] Add the verification table/RPCs and update the publication guard and privileged loader.
- [ ] Run authority, migration-inventory and export tests. Authority and migration-inventory ran; export tests were not rerun in this work order.

### Task 2: Add the authenticated hash verifier Edge Function

**Files:**
- Create: `supabase/functions/verify-engine-ruleset/index.ts`
- Create: `supabase/functions/verify-engine-ruleset/handler.ts`
- Create: `tests/server/verify-engine-ruleset.test.ts`
- Modify: function configuration only if the current conventions require it.

**Interfaces:**
- Handler: `handleVerifyEngineRulesetRequest(request, dependencies): Promise<Response>`
- Owner read dependency accepts authenticated owner ID, publication UUID and packet digest; service write dependency records publication UUID, digest, computed hash and evaluator version.

- [x] Add failing tests for unauthenticated request, malformed input, wrong owner, stale digest, invalid engine schema, content hash mismatch and successful exact verification.
- [x] Run the new server test and confirm expected failures.
- [x] Implement the handler using the existing bearer/auth and bounded JSON patterns; parse with `CompiledRulesetSchema` and compute with `canonicalRulesetContentHash`.
- [x] Wire the production owner client and service-role client; ensure response bodies contain no packet or credential data.
- [x] Run focused server tests and TypeScript/lint checks; the Edge Function starts locally and unauthenticated requests are rejected. A valid authenticated HTTP request through local Edge is still outstanding.

### Task 3: Prove the full local publication path

**Files:**
- Modify: `tests/database/engine-ruleset-publication.pg.sql`
- Modify: `docs/superpowers/plans/2026-11-02-phase-2a-closure-remediation.md`
- Modify: `docs/verification/phase-2a-status-2026-11-02.md`

- [x] Extend the local PostgreSQL proof to verify a valid packet through the trusted write RPC, reject a wrong hash, reject unauthenticated writes, require A/B before publication, reject ledger mutation, and roll the transaction back. Stale digest is covered by database/handler tests, not this SQL proof.
- [ ] Run the Edge Function locally and exercise the owner read plus service-only verification write against local Supabase. Runtime startup and unauthenticated rejection passed; valid authenticated HTTP flow remains outstanding.
- [ ] Run the focused engine/database/server suites, engine coverage, typecheck, lint, local security advisors and database lint. Focused DB/server tests, typecheck, and lint passed; engine coverage, security advisors and database lint were not rerun in this work order.
- [ ] Record exact output and remaining ranking/full-database-suite gates without marking Phase 2a accepted.
- [ ] Obtain a fresh independent review of the complete trust path and present the isolated integration diff for owner approval.

## Work-order execution update — 2026-11-04

- Added the append-only hash verification ledger and publication/loader gate, plus an authenticated Edge verifier that uses the engine's canonical schema and hash implementation.
- Fixed Deno resolution for the verifier's transitive engine imports using `.ts` specifiers; repository TypeScript configuration already supports these with `noEmit`.
- Verified: focused database/migration/server tests (18/18), typecheck, repository lint, local Edge runtime startup, unauthenticated HTTP rejection (401), and the rollback-only real PostgreSQL proof (`BEGIN`, `DO`, `ROLLBACK`). Independent review found no high-severity issue; it identified and prompted correction of the SQL proof's run instructions.
- Still open: valid authenticated Edge-to-RPC request against local Supabase, export tests and full current security/database audits, ranking policy inputs/weights, the unrelated full database-suite timing failure, and Phase 2a acceptance. No hosted writes, commits, merges, pushes, deployments or publication occurred.

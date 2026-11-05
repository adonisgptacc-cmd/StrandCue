# Phase 2a status and remaining gates

**Recorded:** 2 November 2026  
**Disposition:** Phase 2a closure is NOT ACCEPTED; release remains on HOLD

## Integrated work

The Phase 2 work-order commits are already ancestors of local `main` at
`e96b87838439421d6fad678dd72a6099eb746092`:

| Work order | Commit | Scope |
| --- | --- | --- |
| WO1 | `00046bbccac23bc07267c683f57aec788c9c68b8` | Engine contracts |
| WO2 | `6af8762afa00be79e8b2bde024b22f89ede16697` | Ten-stage evaluator |
| WO3 | `856e101722f80b42db9db82e363fa6e969f3cebf` | Rule compiler |
| Policy review fixes | `ab799ecbcadb1b44d597c2e02ab2bce38ab7ed84` | Hit-policy and analyzer gates |
| WO4 | `a23f129f1259ebcc713b818c757d2647fa91361e` | Golden, property and replay verification |
| WO5 | `e5497483debab620bac9161db7df43464a6481af` | Heat Coach adapter |
| Integration | `274bb45b1726d0cb9ac095e0c37cce8e8ec61ca9` | Local integration of WOs 1–5 |

The contract, pipeline, rule, verification and Heat Coach changes are retained
as local development work. The original Phase 2 checklist was left unchecked;
this status file records the verified commit ancestry without claiming that
unrecorded historical test-first steps occurred.

## Hash identity correction

Static review found that the rules compiler labeled an eight-hex-digit FNV-1a
value as `sha256`. That is not a collision-resistant content identity and was
not suitable for audit, replay or withdrawal pins. The isolated branch
`codex/phase2a-hash-integrity`, based on `e96b878`, replaces it with SHA-256 over
canonical ruleset content, shares canonical JSON serialization with replay
comparison, uses the existing `@noble/hashes` 1.8.0 package as an explicit
engine dependency, and increments the shared evaluator version to `1.0.1`.
Synthetic golden references were regenerated. No production ruleset or stored
decision requires migration; production content remains empty/draft.

The branch is not yet merged. An earlier narrow review reported no remaining
actionable findings after the version source and fixture references were
aligned. A later end-to-end review supersedes that result: it found a P1 hash
verification defect and multiple P2 compiler, analysis, coverage and contract
gaps. See `docs/verification/phase-2a-full-review-2026-11-02.md`.

## Fresh local verification on the follow-up branch

| Check | Result |
| --- | --- |
| `npm run check:runtime` | PASS — Node 24.22.2 |
| `npm run check:expo` | PASS — dependencies up to date |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test -- tests/engine` | PASS — 12 files, 177 tests |
| `npm test -- --maxWorkers=8` | PASS — 259 files, 5,090 tests; 8 files and 47 tests skipped |
| `npm run audit:control-plane` | `METADATA-PASS` after refreshing the installed Expo evidence; the existing 4 November review deadline was retained |
| `npm ci --dry-run --ignore-scripts` | PASS — lockfile/workspace dependency resolution |
| Independent end-to-end review | FAIL/HOLD — P1 and P2 findings; see full review report |

The full suite emitted the existing Node module-type warning for
`apps/mobile/src/guidance/heat-rule-publication.ts`; the suite still passed.
The local metadata audit does not verify device compatibility or host integrity.

## Local follow-up verification — 4 November 2026

On isolated branch `codex/phase2a-contracts`, the generic ruleset publication
ledger now binds author and distinct qualified reviewer identities to the
authenticated request and the exact immutable packet digest. Successor
withdrawals are checked against the parent packet and the child authorization;
direct publication inserts and orphan successor metadata are rejected.

| Check | Result |
| --- | --- |
| Local PostgreSQL publication proof (`tests/database/engine-ruleset-publication.pg.sql`) | PASS — authenticated A/B parent and successor publication; orphan successor rejected; test rows cleaned up |
| Local generic publication/approval/reviewer row counts | PASS — all zero after the proof |
| Focused engine, authority, migration and export tests | PASS — 18 files, 258 tests |
| Engine coverage | PASS — 219 tests; 93.11% statements, 86.84% branches, 96.84% functions, 95.19% lines |
| `pnpm run typecheck:domain` | PASS |
| `pnpm run lint` | PASS |
| Local Supabase security advisors | PASS — no issues |
| Local Supabase database lint | PASS — no errors; existing warnings remain |
| Same-state publication timestamp mutation | PASS — regression first failed, then passed after the guard migration; the real PostgreSQL proof also verifies rejection |

Independent review found no remaining timestamp immutability or
admission-guard regression. It confirmed the database binds an immutable packet
digest but does not itself recompute the engine's canonical content hash;
runtime validation remains the current enforcement point. The
canonical ranking order is specified, but reviewed inputs and scoring semantics
for heat/product minimization and personal outcomes remain unresolved. The full
database suite has not passed on this follow-up: its previous run reproduced an
unrelated treatment-history timing guard at 14.9s against an 8s limit. Phase 2a
therefore remains NOT ACCEPTED / HOLD. This follow-up was performed locally;
there was no commit, merge, push, hosted database write, deployment or
publication.

### Execution update — 2026-11-04 hash verification boundary

The earlier note that SQL publication could record an unverified engine content
hash is superseded by this isolated implementation. Migration
`20261104123000_engine_ruleset_hash_verification.sql` adds a private immutable
verification ledger, requires its exact tuple for publication and privileged
loading, and exposes owner-read and service-role-only write RPCs. Migration
`20261104124000_use_claim_role_for_engine_hash_verification.sql` checks the
service role from the request JWT claims without depending on the `auth` schema.
The new `verify-engine-ruleset` Edge Function authenticates the caller, loads
only that author's exact draft, parses it with the engine schema, recomputes
the canonical engine hash, and records only a match. These migrations and
function are local and uncommitted on `codex/phase2a-contracts`.

| Check | Result |
| --- | --- |
| Focused database, migration-inventory and Edge handler tests | PASS — 18 tests |
| Typecheck | PASS |
| Repository lint | PASS |
| Local Edge Function bundle/start | PASS — local Supabase served `verify-engine-ruleset` |
| Unauthenticated local Edge request | PASS — rejected with HTTP 401 |
| Real local PostgreSQL hash/publication proof | PASS — false hash and authenticated write rejected; verification enables A/B-approved publication; immutable ledger update rejected; transaction rolled back |
| Independent scoped review | No high-severity finding; corrected the SQL proof's documented invocation |

The valid authenticated Edge-to-RPC path has not yet been exercised over local
HTTP. Export tests and local security/database lint were not rerun in this
work-order slice. This does not close Phase 2a: ranking inputs and weights are
still unresolved, the full database suite's treatment-history timing failure
remains outstanding, and Increment 6's Human A/B and production evidence gates
remain open. There was no hosted Supabase write, commit, merge, push, deploy or
publication.

### Execution update — 2026-11-04 Auth deletion retention policy

The owner selected **anonymize actor IDs; keep packets and decisions**.
Migration `20261104182726_engine_ruleset_actor_anonymization.sql` changes the
publication author and approval actor foreign keys to `ON DELETE SET NULL`.
The reviewer qualification entry is deleted with its Auth identity; packet
content, packet digests, publication state, and the author/reviewer decision
rows remain. Successor packets store fresh opaque actor-reference UUIDs rather
than Auth UUIDs. A private immutable binding ledger links those references to
the actual Human A/B Auth identities until deletion; publication rejects a
reviewer mismatch. The approval rows and binding ledger both null the Auth
actor columns on deletion while preserving packet references and decisions.
Database guards permit only nested FK-driven actor-ID nulling; direct updates
to actor fields are rejected. A redacted author cannot continue draft,
approval, or publication operations. The migration refuses to run if legacy
successor packets without binding rows already exist; those immutable records
need a separate reviewed migration plan.

| Check | Result |
| --- | --- |
| Regression before migration | FAIL as expected — deleting the author hit the old `ON DELETE RESTRICT` constraint |
| Focused PGlite database, server, and engine tests | PASS — 17 files, 236 tests; mismatched Human B rejected |
| Full migration replay on isolated local Supabase/PostgreSQL 17 | PASS — branch migration chain, including actor-anonymization migration |
| Real PostgreSQL publication/deletion proof | PASS — opaque packet refs bound to A/B; synthetic author and reviewer deleted; packet and two approvals retained; relational and binding actor IDs null; direct redaction updates rejected; transaction rolled back |
| TypeScript `--noEmit` | PASS |
| Scoped ESLint | PASS — zero warnings |
| Local Supabase advisors | PASS with no errors; one existing `public.profiles` overlapping-policy warning unrelated to this migration |
| `git diff --check` | PASS — existing golden-fixture line-ending notices only |

The PostgreSQL proof deletes synthetic rows directly from `auth.users`; it does
not exercise the GoTrue HTTP admin endpoint. No real Human A/B decisions were
recorded. Product ranking inputs and weights, independent end-to-end review,
and Increment 6 evidence and approval gates remain open. The work stayed on
`codex/phase2a-contracts`; nothing was committed, merged, pushed, deployed,
published, or applied to hosted Supabase.

## Integration candidate reconciliation — 5 November 2026

The Phase 2a implementation is being separated onto
`codex/phase2a-integration-candidate`, based on `f8d53e1`. Its scope includes
the engine contract and compiler/analyzer work, canonical treatment projection,
generic authenticated ruleset publication and parent binding, server-side hash
verification, actor anonymization, and their tests and records. The branch also
contains the 15 reviewed Phase 2a work-order commits already on
`codex/phase2a-contracts`.

The separate Increment 6 Heat Coach Human A/B approval migrations
`20261103183513_heat_publication_authenticated_approval.sql` and
`20261103191622_bind_heat_publication_approval_packet.sql`, and their
Heat-Coach-specific test adaptations, remain preserved in the original dirty
`codex/phase2a-contracts` checkout. They are not dependencies of the generic
engine-ruleset authority ledger and are excluded from this candidate. The
candidate's export and migration inventory tests classify only the generic
engine reviewer roster and its seven migrations.

Independent review found and helped close a runtime authorization gap: an
included candidate now fails closed unless every withdrawal affecting it has
an in-date authorization for that exact successor rule. The regression failed
before the fix and passed afterward; the full engine suite passed (220 tests),
domain typecheck passed, and scoped ESLint passed. This is candidate evidence,
not Phase 2a acceptance. The approved ranking inputs and weights remain
unresolved; valid authenticated Edge-to-RPC verification, current full database
verification, and final independent acceptance review remain open. No merge to
local `main`, push, hosted Supabase write, publication, or deployment occurred.

## Remaining gates

- Increment 6 remains `PARTIAL / HOLD`. Its current report still lists missing
  device/emulator and screen-reader acceptance, production source evidence,
  distinct Human A/B approvals, and dependency-policy clearance. Work Order 5
  must not be treated as closing Increment 6 until that prerequisite is met.
- Exact product/tool capability-version applicability still needs an explicit
  contract reconciliation before the engine can be treated as authoritative for
  production content.
- The current engine fixtures are synthetic. Production Heat Coach rules and
  technique content remain empty/draft; no publication was authorized.
- The older Phase 2 closure record said its optional PostgreSQL proofs were
  blocked by migration-state drift. The newer Increment 6 acceptance report
  records 16/16 real PostgreSQL race cases on a fresh disposable local project.
  This hash correction did not rerun those database suites; refer to that
  acceptance record for their exact scope and limits.

- Phase 2a's plan still has historical unchecked work-order boxes. Do not use
  those boxes as completion evidence; use commit ancestry, current test output
  and the full review report.

No push, deployment, hosted Supabase or Cloudflare change, migration, or
publication occurred. Local `main` remains ahead of `origin/main`; do not push
it as a small Phase 2a change without a separate branch reconciliation review.

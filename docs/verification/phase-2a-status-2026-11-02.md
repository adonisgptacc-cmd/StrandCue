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

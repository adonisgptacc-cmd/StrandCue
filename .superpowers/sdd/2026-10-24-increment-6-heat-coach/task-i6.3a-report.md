# Task I6.3a report — Heat Coach trusted server boundary correction

## Runtime

- Node runtime used: `v24.19.0` (from `C:\Users\ABADO\AppData\Local\Temp\opencode\node24\node-v24.19.0-win-x64\node.exe`).
- Default machine Node is `v25.1.0`; it does NOT satisfy the `engines >=24.0.0 <25.0.0` policy and is not used for gates.
- `npm run check:runtime`: NODE-RUNTIME-PASS v24.19.0.
- Continuation checkpoint gates used the preserved Node `v24.22.1` runtime; it is within the repository's Node 24 policy. The machine-default Node 25 remained unused.

## Preflight

- Branch: `codex/increment-6-heat-coach`. Worktree: `C:\Users\ABADO\.codex\worktrees\increment-6-heat-coach\StrandCue`.
- Starting HEAD: `da5a59af05b365e1c39c8654088a21806100b9ee` (fix: evaluate Heat Coach restrictions before eligibility). Working tree clean.
- Commits reachable: `95f7598`, `c32c511`, `cc95729`, `3156ae9`, `da5a59a` (all `cat-file -t commit`).
- No catalogue-import commits present (`git log --oneline --all | Select-String "catalogue-import"` → none).

## Baseline results (before editing)

Focused Heat Coach suites, Node v24.19.0:

| Suite | Result |
|---|---|
| tests/domain/heat-coach.test.ts | 23 passed |
| tests/database/heat-coach-assessments.test.ts | 18 passed |
| tests/domain/heat-rule-publication.test.ts | 17 passed |

Task A conformance suite (shared fixtures `tests/fixtures/heat-coach-conformance.ts`, 36 cases):

| Suite | Result |
|---|---|
| tests/domain/heat-coach-conformance.test.ts | 36 passed (GREEN — domain baseline) |
| tests/database/heat-coach-conformance.pg.test.ts | 24 passed / 12 failed (RED — SQL disagrees with domain) |

Genuine RED evidence (SQL `heat_evaluate` vs domain `evaluateHeatCoach`, same input+publication):

| Case | Domain (expected) | SQL (actual) | Disagreement |
|---|---|---|---|
| content_pending-draft | content_pending | appropriate | SQL ignores lifecycle |
| content_pending-withdrawn | content_pending | appropriate | SQL ignores lifecycle |
| publication-unavailable-expired | unavailable | appropriate | SQL ignores validity |
| publication-unavailable-future | unavailable | appropriate | SQL ignores validity |
| missing-service-history | needs_input | appropriate | SQL omits service-history |
| restriction-before-missing-temperature | restricted | needs_input | SQL omits hard restrictions (missing fact masks restriction) |
| restriction-before-unheated | restricted | no_heat | SQL omits hard restrictions (unheated masks restriction) |
| restriction-before-not-needed | restricted | no_heat | SQL omits hard restrictions (not_needed masks restriction) |
| no-heat-restriction | no_heat | appropriate | SQL omits hard restrictions |
| current-condition-concern-zone | restricted | appropriate | SQL omits restriction zones/current condition |
| expired-publication | unavailable | appropriate | SQL ignores validity |
| future-publication | unavailable | appropriate | SQL ignores validity |

## Architectural ruling (Task D)

Option 1: PostgreSQL evaluates from a contract derived from the same domain fixtures and schema. The `HeatRulePublication` JSON stored in `strandcue_private.heat_rule_publications.rule` is the single shared executable rule representation; the domain `evaluateHeatCoach` and the SQL `heat_evaluate` both interpret it, and both are asserted against one shared conformance fixture set. No app server, no network call during evaluation, no clock except explicit `asOf`/transaction time.

## Remaining tasks

- Task B: reviewed capability binding via a `heat_capability_registry` publication adapter (forward-only migration; do not edit `20261026120000_heat_coach_assessments.sql`).
- Task C: publication validation (schema/version, id, lifecycle, validity, content digest, evidence snapshot digest, capability-registry id+digest, Human A/B, distinct reviewers, non-future timestamps, approved decisions, copy keys, digest coverage, immutability).
- Task E: align SQL `heat_evaluate` to domain (hard restrictions first, necessity, named settings, alternatives, temperature/passes/duration, current condition, service history, confirmed heat history).
- Task F: atomic source capture + fingerprint + stale detection + concurrent source-change tests.
- Task G: owner-wide quota lock + idempotency + no raw PG error leak tests.
- Task H: export/deletion/retention regression.
- Four review passes; gates; commits; report.

## Bounded checkpoint completed

The evaluator and transaction-capture portion is now implemented in forward-only migrations `20261027120000_align_heat_coach_evaluator.sql` and `20261027121000_harden_heat_coach_capture.sql`.

- The shared fixture resolver feeds identical nested inputs and publications to both evaluators.
- The database test parses and compares the complete `HeatCoachDecision`; it no longer checks only state/reason fields.
- Genuine strengthened RED was 34 database mismatches. GREEN is 72/72 domain/database conformance cases.
- Early outcomes keep an empty selection, `no_heat` explicitly selects unheated, alternatives omit internal binding ids in canonical order, necessity and confirmed heat counts match the domain, and restrictions/missing facts/limits follow the domain ordering.
- Assessment creation serializes by owner across publications, captures revisions and input in one statement snapshot, evaluates before convergence, recomputes staleness on operation replay, shares a publication advisory lock with withdrawal, and checks the owner-wide quota under the lock.
- Both migrations are replayable and revoke temporary role membership.
- Independent correctness and security re-review found no remaining Critical/High/Medium issue inside this bounded evaluator/capture scope.

This is **Partial / BLOCKED**, not completion of I6.3a. Tasks B and C remain required: the server still constructs fail-closed `not_reviewed` capability bindings, and the database does not yet validate the complete evidence/copy/capability/Human A+B publication envelope. Real PostgreSQL cross-publication quota, source-update and withdrawal races are also NOT RUN. Production publication remains empty/draft; I6.4 is not authorized.

## Continuation verification

- `check:runtime`: PASS on Node v24.22.1.
- `typecheck`: PASS; `lint --max-warnings=0`: PASS.
- Focused evaluator, publication, assessment, export, deletion and migration suites: 193/193 PASS.
- Full `test:coverage`: 4,596 passed / 30 skipped / 1 failed. The sole failure is the live dependency-policy in-process assertion; the separate dependency audit reports HOLD with 0 critical, 5 high and 9 moderate findings plus exception/runner review drift. This is recorded as HOLD, not PASS, and no dependency files changed.
- `export:web`: PASS; `audit:control-plane`: METADATA-PASS; `git diff --check`: clean.
- Hosted migration, hosted owner isolation and real-PostgreSQL concurrency: NOT RUN. Nothing was deployed or published.

## Local completion attempt — 27 October 2026

The three previously named I6.3a mechanism gaps now have local implementations:

- Forward-only `20261027122000_heat_capability_registry.sql` stores immutable,
  digest-bound, evidence-reviewed exact product/tool capabilities. The trusted
  input constructor reads only owner-confirmed exact matches and rechecks the
  current ZA catalogue version lifecycle. Production has no capability rows.
- `20261027123000_validate_heat_publication.sql` refuses a published rule
  without the exact evidence/copy/registry packet and distinct, dated Human A/B
  decisions bound to the aggregate reviewed content digest. It rechecks the
  registry on trusted reads, so withdrawal invalidates new and restored use.
- `20261027124000_bind_heat_registry_assessment.sql` connects server assessment
  capture to the registry named by that packet, serializes registry withdrawal
  with creation, and marks history stale after an exact reviewed catalogue
  version retires. The TypeScript review artifact and packet adapter now carry
  the same registry and digest fields. No real rule or reviewer was added.

New tests observed RED before the corresponding fixes for missing server
capability binding, withdrawn-registry acceptance, missing Human A/B review
dates, malformed executable rule values, registry withdrawal racing a create,
retired-version capability reuse and stale restore. The focused contract,
publication, registry, assessment and migration group reached 72/72 PASS
before the final stale-restore addition; the final targeted group reached
65/65 PASS. The final disposable native PostgreSQL 18.6 two-session suite
reached 5/5 PASS, including owner-wide quota across publication IDs, source
correction, rule withdrawal and capability-registry withdrawal. All migrations
were replayed locally; no hosted database was touched.

Gates used Node `v24.19.0`:

| Gate | Result |
|---|---|
| `check:runtime`, `typecheck`, lint, guidance research validation | PASS |
| Web export, control-plane metadata audit | PASS |
| Coverage excluding the dependency-policy test, two workers | 4,545 passed, 34 skipped; PASS after final SQL correction, all configured coverage floors met (95.68% statements, 90.1% branches, 98.1% functions, 97.65% lines overall) |
| Exact full `test:coverage` with two workers | 4,626 passed, 34 skipped, 1 failed; HOLD only at the live dependency-policy in-process assertion |
| `audit:dependencies` | HOLD: 17 findings; 0 critical, 5 high, 9 moderate; exception and runner review drift remains |
| Hosted migration/isolation, device acceptance | NOT RUN |

An independent review found three High and two Medium issues in the first
implementation. The fixes and regression tests above address all five; a
second independent review found nullable digest and nested-rule shape gaps.
Nine new database regressions failed first; strict JSON types, nested shape
checks and null-safe digest comparisons then passed all 30 publication tests.
The corrected migration was replayed on disposable native PostgreSQL 18.6;
all five two-session race tests passed again. PostgreSQL alone verifies the
reviewed digests and registry; the TypeScript adapter prepares the envelope
and does not certify it. Real digest values and distinct human decisions are
still needed before any production publication. Production Heat Coach remains
empty and draft, and no push, deploy, publication or hosted Supabase migration
occurred.

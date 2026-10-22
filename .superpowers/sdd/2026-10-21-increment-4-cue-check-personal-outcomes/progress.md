# SDD ledger — plan: docs/superpowers/plans/2026-10-21-increment-4-cue-check-personal-outcomes.md

Scope: Task 4.1 ONLY (immutable Cue Check domain contracts + deterministic non-causal
personal outcome summaries). Stop before Task 4.2.

## Setup

- Worktree: C:\Users\ABADO\Desktop\StrandCue-increment-4-cue-check-personal-outcomes
- Branch: codex/increment-4-cue-check-personal-outcomes
- Node: v24.19.0 via C:\Users\ABADO\AppData\Local\Temp\opencode\node24\node-v24.19.0-win-x64
  (machine default Node 25.1.0 unsupported; PATH prepended per command)
- Baseline: check:runtime -> NODE-RUNTIME-PASS v24.19.0; vitest run tests/domain -> 765 passed
- Pre-flight: single task in scope (4.1). Shared interfaces inside the task:
  cue-check.ts exports the record/input/revision schemas + inferred types;
  index.ts re-exports them; personal-outcome-summary.ts consumes CueCheckRecord
  values (active lifecycle, timing, goal context, outcome fields) and the barrel
  re-exports its types. No cross-task conflict (later tasks 4.2+ are out of scope).

## Rulings

- Task 4.1: Ruling: branch base is current clean HEAD 0513846, not the pinned 1a3a2fd —
  between session start and worktree creation the branch advanced by one commit
  (0513846 "feat: apply approved StrandCue brand identity", unrelated files: mobile
  assets/website/tests). 1a3a2fd and bedb71c are both ancestors of 0513846, so every
  verification the prompt asked for still holds; building on the current clean HEAD
  avoids needless divergence from just-landed work. Cost if wrong: rebase of one
  domain-only commit.
- Task 4.1: Ruling: install with `npm ci --ignore-scripts` — the portable Node 24.19.0's
  bundled npm has a broken node-gyp (postinstall of unrs-resolver fails); the repo's
  own runbook/CI standard is `npm ci --ignore-scripts` (docs/runbooks/release-tooling.md,
  .github/workflows/verify.yml). Cost if wrong: a native binding might be missing, which
  the focused/full gates would catch immediately.

## Task 4.1 design rulings (from plan + spec CC-01..CC-05, P-04/P-06/P-07/P-09/P-10)

- Shared comparative enum less|same|more|unknown for dryness, frizz, softness, tangling,
  buildup, breakage (mirrors current-condition vocabulary style); dedicated small enums
  for styleLongevity (shorter|similar|longer|unknown), overallResult
  (better|same|worse|unknown), satisfaction (satisfied|neutral|dissatisfied|unknown),
  immediateReaction (none-noticed|some-noticed|unknown), wouldUseAgain
  (yes|no|unsure|unknown). Cost if wrong: enum widening is additive.
- Impossible combination enforced: styleLongevity only on delayed checks (an immediate
  check cannot observe how long a style lasted). Empty observations (no answer, no note)
  rejected; an explicit single 'unknown' answer is a valid explicit statement. Cost if
  wrong: relaxing is additive; tightening later needs a migration.
- Comparable context = { goal } (GuidanceGoalIdSchema, single value basic_wash today).
  Records carry goal; summarizePersonalOutcomes(records, context) counts ONLY records
  whose goal equals the requested context; every summary exposes comparableContext.
  Context-separation test uses a deliberately mismatched record (runtime defensive path,
  since the schema today admits one goal). Cost if wrong: add context axes later.
- Lifecycle: active|corrected|voided on CueCheckRecord (projection of the latest content
  revision: superseded -> corrected, void appended -> voided). Revision rows:
  create (sequence 1, full observation), correct (sequence>=2, observation + corrects
  revision uuid + bounded trimmed reason), void (sequence>=2, bounded trimmed reason,
  NO observation content — an audit event). Corrections append; nothing rewrites history.
- MINIMUM_COMPARABLE_SAMPLE = 3 (denominator of definite comparable answers) before any
  pattern wording; below it the wording is "Not enough comparable uses yet to show a
  pattern about X." and structure still carries exact counts. Cost if wrong: one constant.
- Summaries are per (observation field, timing, reported value) — immediate and delayed
  never share a denominator; every value observed at least once gets its own entry with
  exact numerator/denominator; all-unknown fields get one reportedValue:null entry.
  Unknown answers never join the denominator and never become negatives. Cost if wrong:
  UI picks what to render from structure anyway.
- Summarizer does not re-parse records (read path owns that); it defensively filters
  lifecycle !== active and goal !== context.goal. Byte-deterministic output: fixed
  field order x timing order x enum value order, fresh frozen objects.
- vitest.config.ts: add packages/domain/src/cue-check.ts and
  packages/domain/src/personal-outcome-summary.ts to criticalModules for per-file 80
  floors (Task 3.3 precedent: protocol-preview-model.ts). The plan's Files list for 4.1
  doesn't name vitest.config.ts, but the global constraint demands per-file 80% and this
  is the repo's enforcement mechanism. Cost if wrong: revert two list entries.

## Task 4.1 progress

- RED-1 (schema contracts): `npx vitest run tests/domain/cue-check.test.ts` ->
  94 failed (94). Genuine: every failure was `normalizeCueCheckInput is not a
  function` / `CueCheckRecordSchema` undefined (feature missing). First RED run had
  14 vacuous passes (unpatterned toThrow() accepted the undefined-call TypeError);
  tightened those to toThrow(ZodError) before implementing — re-run: 94/94 failed.
- GREEN-1: implemented packages/domain/src/cue-check.ts + barrel export.
  `npx vitest run tests/domain/cue-check.test.ts` -> 94 passed (94).
  Full domain suite: 29 files, 859 passed (859) (baseline 765 + new 94).
  Test-data fix during GREEN: REVISION_ID constant had an invalid RFC 9562 variant
  nibble (2e1f); zod correctly rejected it; fixed the constant to 8e1f.
- RED-2 (summaries): `npx vitest run tests/domain/personal-outcome-summary.test.ts` ->
  17 failed (17). Genuine: `summarizePersonalOutcomes is not a function`,
  `MINIMUM_COMPARABLE_SAMPLE` undefined. Test-factory fix during RED phase:
  makeRecord now answers "less frizz" only when the test patch supplies no answer,
  so default answers cannot leak into per-field expectations.
- GREEN-2: implemented packages/domain/src/personal-outcome-summary.ts + barrel export.
  `npx vitest run tests/domain/personal-outcome-summary.test.ts` -> 17 passed (17).
  Refactor: shared refineFollowsFirstRevision extracted for correct/void revisions;
  focused suites re-run green (111/111).
- Gates so far: focused suites 111/111; full domain suite 876/876 (30 files);
  typecheck:domain 0 errors; full typecheck 0 errors; lint --max-warnings=0 clean
  (two @typescript-eslint/array-type warnings in test files fixed);
  vitest.config.ts criticalModules extended with the two new domain files (per ruling).
  Full test:coverage first pass: global 95.86% statements / 89.91% branches /
  98.09% functions / 97.78% lines, exit clean; full-output capture re-run started
  for exact totals and per-file rows.
- Full gate evidence (Task 4.1):
  - check:runtime -> NODE-RUNTIME-PASS v24.19.0
  - focused: cue-check 94/94, personal-outcome-summary 17/17 (111/111 together)
  - full domain suite: 30 files, 876/876
  - typecheck:domain: 0 errors; full typecheck (domain + mobile): 0 errors
  - lint --max-warnings=0: 0 errors, 0 warnings
  - npm run test:coverage -- --maxWorkers=4: exit 0; 176 test files passed |
    4 skipped (180); 3550 tests passed | 18 skipped (3568); global coverage
    95.86% statements / 89.91% branches / 98.09% functions / 97.78% lines;
    per-file 80 floors for the two new files enforced by criticalModules and green.
  - Focused per-file coverage (json-summary): packages/domain/src/cue-check.ts
    100/100/100/100 (stmts/branch/funcs/lines);
    packages/domain/src/personal-outcome-summary.ts 100/100/100/100.
    (The vitest text reporter skips fully-covered files, which is why the full
    run's table omits them; json-summary proves the numbers.)
  - git diff --check: exit 0. Tree: 2 modified (index.ts, vitest.config.ts) +
    4 new (cue-check.ts, personal-outcome-summary.ts, 2 test files).
- Reviews dispatched (fresh, parallel): (1) code correctness/maintainability,
  (2) privacy and safety language, (3) schema and validation boundaries.

## Review findings and triage

- Privacy/safety review: 0 Critical, 0 High, 2 Medium, 2 Minor, 1 Info.
  - M1 (fix): banned-stem gaps + only 5/32 sentences pinned; fix = add stems
    ('effect','improv','heal','restor','strong','cure','fix','work','solv',
    'health','therap'), independent test-oracle map pinning all 32 pattern
    sentences + 11 insufficient subjects, wording refine inside
    PersonalOutcomeSummarySchema, exhaustive phrase typing.
  - M2 (fix): "comparable uses" names a wider set than the denominator when
    unknowns exist; fix = "in N of M comparable uses you answered" and
    "Not enough comparable answers yet to show a pattern about X." (kept as
    close to the plan's exemplar as the honesty fix allows; exemplar in the
    plan is "such as"/"an acceptable pattern", not a byte contract).
  - Minor (deferred): docblock comparability overclaim (goal+timing+lifecycle
    is the enforced set; run-level grouping is the caller's contract).
  - Minor (deferred): no structural single-owner guarantee in the summarizer;
    owner scoping is Task 4.2's contract (owner-scoped RLS RPCs already
    mandated by the plan); single-owner precondition stays in the function doc.
  - Info (deferred to 4.4): rendering pressure — 4.4 must render domain wording
    verbatim, show unknownCount, never append advice.
- Schema/boundary review: 0 Critical, 0 High, 5 Medium, 4 Minor, 1 Info.
  - M1 (fix): defensive value filtering unsound — out-of-vocabulary field value
    joins the denominator; fix = CueCheckOutcomeFieldSchemas[field].safeParse
    membership check (garbage excluded from denominator AND unknownCount,
    fail-safe); document + test the malformed-observedAt fail-closed crash.
  - M2 (fix): create/correct revisions accept observedAt after receivedAt;
    fix = superRefine observedAt <= receivedAt on both members (clock-free
    internal consistency; the input path keeps its injected-clock future check).
  - M3 (fix): no aggregate history validation; fix = CueCheckHistorySchema +
    validateCueCheckHistory mirroring activity.ts: exactly one create at
    sequence 1, contiguous sequences, one recordId, correction target exists,
    precedes by sequence and receivedAt, no branching. Post-void appends left
    unconstrained (parity with activity.ts; revisit in 4.2).
  - M4 (fix): observationShape drift silent both directions; fix = derive the
    answer fields from CUE_CHECK_OBSERVATION_FIELDS x CueCheckOutcomeFieldSchemas
    via .optional() with satisfies-level typing + drift-pin test
    (keys ≡ field list; non-unknown enum values ⊆ CueCheckDefiniteValueSchema).
  - M5 (fix): REPORTED_PHRASES loosely typed -> "undefined" interpolation;
    fix = mapped exhaustive typing keyed per field over its definite values
    (same as privacy M1's typing fix).
  - Minor 8 RE-GRADED into the fix pass (my call): recencyWindow tie-break is
    order-dependent for equal instants in different offset forms — violates the
    task's explicit byte-equivalence requirement; fix = lexicographic
    tie-break on equal instants + test with reordered equal-instant records.
  - Minor 6 (deferred): record lifecycle<->revision docstring (the implied
    revision>=2 rule is NOT confirmable: create-then-void yields a valid voided
    row at revision 1).
  - Minor 7 (deferred): normalizeCueCheckInput now-default matches the
    normalizeCurrentCondition precedent (same doc + same default); changing it
    would diverge from the established contract.
  - Minor 9 (partly riding along): pin tests added where they live in files the
    fix pass already edits — notes:'' sole-content rejection, revision
    receivedAt offset-less rejection, correctsRevisionId non-uuid rejection,
    revision sequence 0/fractional rejection, 2-definite+N-unknowns stays
    insufficient. Pins are regression guards, not RED-driven changes; recorded
    honestly as such.
- Code-correctness review: 0 Critical, 0 High, 3 Medium, 6 Minor, 1 Info.
  - M1 (fix, merged with schema M1): no runtime validation of records; split failure
    modes. Fixed with safeParse answer admission + early RangeError on unparseable
    observedAt + documented single-owner/validated-projection precondition.
  - M2 (fix, same as schema Minor 8 promoted): recency tie-break order-dependent;
    fixed with lexicographic tie-break on equal instants + mixed-offset test.
  - M3 (fix): duplicate active (executionId, timing) rows double-counted; summarizer
    now throws on duplicates within the comparable set; invariant documented;
    4.2 should still add the persistence-level unique index (noted for 4.2).
  - Minors folded into the same code blocks being fixed (recorded honestly):
    self-referencing correction rejected; summary schema refine also machine-checks
    honesty invariants (numerator<=denominator; reportedValue null iff denominator 0;
    recency null iff denominator 0) and cross-field reportedValue membership;
    'undefined' added to banned stems; redundant deepFreeze in normalize removed;
    CueCheckTimestampSchema exported and shared (one fewer duplicate declaration);
    comment added for the intentional immediateReaction-on-delayed asymmetry.
  - Minor (deferred): record lifecycle<->revision docstring; normalize now-default
    (kept — matches normalizeCurrentCondition precedent).

## Fix pass evidence

- RED (fix pass): updated both test files first (new templates, oracle map, new
  rejections, integrity throws, history validator tests). Focused run:
  25 failed | 111 passed (136). All 25 failures were the intended behavior
  changes (verified by name); the passers were pre-existing green tests plus
  the pin tests (documented as pins, not RED claims).
- GREEN (fix pass): implemented cue-check.ts (derived answer shape, shared
  timestamp, observedAt<=receivedAt refine, self-reference rejection,
  CueCheckHistorySchema + validateCueCheckHistory, normalize returns parsed)
  and personal-outcome-summary.ts (new templates, exhaustive phrase typing,
  summary schema refine, safeParse filtering, early observedAt check,
  duplicate-execution throw, deterministic recency tie-break).
  Two TypeScript inference fixes during GREEN: removed a structurally impossible
  'unknown' comparison in the refine; definiteValuesOf cast routed through
  readonly string[] / unknown for the deferred generic.
- Post-fix gates: focused 136/136; full domain suite 901/901 (30 files);
  typecheck:domain 0 errors; full typecheck 0 errors; lint --max-warnings=0 clean;
  git diff --check exit 0.
- Post-fix full coverage: npm run test:coverage -- --maxWorkers=4 -> exit 0;
  176 test files passed | 4 skipped (180); 3575 tests passed | 18 skipped (3593);
  global 95.87% statements / 89.97% branches / 98.1% functions / 97.78% lines.
- Post-fix per-file coverage (json-summary): cue-check.ts 98.75% statements /
  97.29% branches / 100% functions / 98.63% lines (uncovered branch is the
  defense-in-depth target-precede check made unreachable by contiguity);
  personal-outcome-summary.ts 100/100/100/100.
- Re-reviews dispatched to the same three reviewer sessions over the applied
  fixes (user mandate: fix AND re-review every Critical/High/Medium).
- Privacy re-review: both Mediums VERIFIED resolved; 0 new Critical/High/Medium;
  2 residual Minors + 1 Info. The two residuals were incompletions in fixes I had
  claimed, so they were completed test-first rather than deferred:
  - N1 RED->GREEN: new test 'rejects pattern wording below the minimum comparable
    sample at the schema boundary' failed against the old refine, then the refine
    gained the evidence<->minimum-sample coupling (docblock updated to match).
  - N2: banned stems 'fix', 'work', 'strength' actually added this time (the
    earlier claim that 'fix' was added was wrong — the re-review caught it).
  - N3 (Info, deferred to Task 4.4): render unknownCount beside the sentence;
    'uses you answered' still excludes unknown-answer uses by the strictest reading.
  Final focused suites: 137/137; typecheck:domain 0 errors; lint clean.
- Schema-boundary re-review: all 5 Medium fixes VERIFIED; 1 new Medium (A:
  history validator accepted duplicate revisionIds — behind the activity.ts
  precedent it claims to mirror, and the byId map collapsed them) + 3 Minor
  (B: lenient date strings slipped the Date.parse NaN guard into the deep
  ZodError the fix claimed to replace; C: corrections may target voids —
  activity.ts parity, deferred to 4.2; D: bare Error for the duplicate guard —
  typed-error polish deferred) + 1 Info (E: jsdoc 'first incoherence' wording).
- Code-correctness re-review: all 3 Medium fixes VERIFIED, 0 new C/H/M; the
  same two residuals (its N1 = B above, its N2 = A above) plus secondary
  observations matching the deferred post-void/received-order questions.
- Residual fix round (test-first): RED = 2 new failing tests ('rejects a
  history that repeats a revision identity'; 'rejects a lenient, non-offset
  observation time at the same integrity guard') -> 2 failed | 137 passed.
  GREEN = duplicate-revision-identity check added to CueCheckHistorySchema
  (with jsdoc corrected to the aggregated-ZodError reality), early guard
  switched to CueCheckTimestampSchema.safeParse. Focused 139/139; full domain
  904/904; typecheck:domain exit 0; lint exit 0; git diff --check exit 0.
- Deferred to Task 4.2/4.4 (ledger decisions for the handoff):
  - corrections may target void revisions; void receivedAt ordering and
    double-voids unconstrained (parity with activity.ts; decide in 4.2)
  - duplicate-active-execution-timing needs the persistence unique index;
    typed error shape for the summarizer's integrity throws
  - 4.4 must render domain wording verbatim, show unknownCount beside the
    sentence, never append advice or interpretation
  - record jsdoc lifecycle<->revision semantics; normalize now-default
    (kept per normalizeCurrentCondition precedent)
- Final verification dispatched to the schema-boundary reviewer for the
  residual fixes (A/B/E); final full coverage run in progress.
- FINAL verification: all residual fixes VERIFIED (duplicate revision identity
  across kinds with contiguous sequences covered by the failing-then-passing
  test; lenient observedAt now rejected by the early guard using the same
  schema as the record contract, making the deep recency ZodError unreachable;
  jsdoc accurate). No remaining Critical/High/Medium anywhere. One Info nit
  (history jsdoc now lists the revision-identity invariant) applied with it.
- FINAL gate numbers: focused 139/139; full domain 904/904 (30 files);
  typecheck:domain exit 0; full typecheck exit 0; lint exit 0;
  git diff --check exit 0; full test:coverage exit 0 — 176 test files passed |
  4 skipped (180), 3578 tests passed | 18 skipped (3596), global 95.88%
  statements / 89.97% branches / 98.1% functions / 97.78% lines; per-file
  cue-check.ts 98.8 / 97.43 / 100 / 98.68 and personal-outcome-summary.ts
  100 / 100 / 100 / 100 (statements / branches / functions / lines).

Task 4.1: complete (commits 0513846..d00e533, tests: npx vitest run tests/domain/cue-check.test.ts tests/domain/personal-outcome-summary.test.ts -> 139/139 pass; full test:coverage -> exit 0, 3578 passed | 18 skipped). Working tree clean. Stopped before Task 4.2.

## Task 4.2 setup (owner-only append-only Cue Check persistence)

- Worktree: C:\Users\ABADO\Desktop\StrandCue-increment-4-cue-check-personal-outcomes (clean)
- Branch: codex/increment-4-cue-check-personal-outcomes; BASE = d00e533 (exact required start commit; verified d00e5339580bff346e96a5c3b12ac8bdfc50540f)
- Node: v24.19.0 via C:\Users\ABADO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin (per this task's prompt; PATH prepended per command; machine default 25.1.0 never used for gates)
- Latest migration: 20261023130000_tool_catalogue_publication.sql -> next valid timestamp: 20261024090000_cue_checks.sql
- Export current version: export=4 (schemaVersions block in 20261023130000) -> this task bumps to export=5, adds cueChecks=1 + cueCheckRevisions=1
- Read: plan Task 4.2, spec CC-01..CC-08 + J-01/J-02, recovery audit, cue-check.ts (contract authority),
  protocol_executions / recommendation_runs / activities_history+rpc / list_pagination / export_jobs /
  export_complete / export_csv_schema_versions / tool_catalogue_publication (current export defs) /
  deletion + deletion_rpc + deletion_worker + privacy_retention_cleanup migrations,
  harness.ts, migration-inventory/migration/hardening/export/deletion/protocol-executions tests,
  real-postgres-concurrency + protocol-execution-concurrency.pg tests, capability matrix + traceability.
- Pre-flight (interfaces Task 4.1 -> 4.2): the migration consumes Task 4.1's CueCheckInput vocabulary
  (timing enum, 11 answer fields + enums, notes<=2000, styleLongevity delayed-only,
  at-least-one-answer-or-note, offset-aware observedAt). No conflict found; 4.2 stores the observation
  payload byte-exactly as the domain contract's canonical input so the two vocabularies cannot drift.

## Task 4.2 design rulings (plan + task brief + repo conventions)

- Ruling: server-generated record identity. The task's client-submittable list (observation input,
  execution id, timing, expected revision, operation id) excludes record_id, so record_cue_check takes
  only (operation_id, execution_id, observation) and gen_random_uuid()s the record id; correct/void
  cite that returned id. Cost if wrong: one additive RPC arg later.
- Ruling: no FK from cue_checks to protocol_executions/recommendation_runs. Executions are
  retention-deleted after 90/30 days (20261015200000); a cascade would destroy owner observations and a
  restrict would block the cleanup worker. Binding is verified at create time and the execution/run ids
  + confirmed-actual-use projection + execution_status are stored on the record (self-contained after
  retention). Cost if wrong: a future FK migration if stronger integrity is ever demanded.
- Ruling: confirmed actual use = domain executionEvents vocabulary (state='confirmed' steps ONLY;
  skipped/substituted/modified are deviations, never implied occurrences - protocol-execution.ts
  ExecutionEventSchema doc). Projection extends the domain triple {stepId, position, confirmedAt} with
  the confirmed step's own planned action/product/tool identities (what was actually used, CC-01),
  derived server-side from the stored execution snapshot at create time and then immutable.
- Ruling: record head lifecycle is active|voided; 'corrected' appears as the derived state of
  superseded content revisions in history (matches Task 4.1 record projection semantics; summarizer
  counts only active heads). Corrections advance revision and keep lifecycle active.
- Ruling: correction targeting is by expected-revision number (client-submittable list has no revision
  uuid); corrects_id is derived server-side as the current head content revision id. Staleness,
  corrected-target and voided-target all refuse through expected-revision + lifecycle guards.
- Ruling: stable error codes: authentication-required 42501, invalid-operation 22023, invalid-observation
  22023, payload-too-large 22023, account-not-active 42501, execution-not-found 42501 (missing=foreign=
  random indistinguishable), execution-not-terminal 22023, execution-not-usable 22023, run-not-consistent
  42501, duplicate-active 23505, record-not-found 42501, revision-conflict 40001 (activity precedent),
  record-voided 22023, no-op-correction 22023, timing-mismatch 22023, operation-conflict 23505,
  invalid-reason 22023, quota-exceeded 22023, invalid-page/invalid-cursor 22023 (list_pagination precedent).
- Ruling: quotas MAX 10 records per (owner, execution, timing) lifetime (void/recreate cycles are the
  only unbounded path) and MAX 50 revisions per record, both 'quota-exceeded'. Defensive abuse bounds,
  not product rules. Cost if wrong: constant change.
- Ruling: observed precision = the exact owner-submitted observedAt text is preserved byte-exactly
  inside the immutable observation payload (jsonb); observed_at timestamptz is the server-side
  projection column for ordering. No second timestamp vocabulary invented.
- Ruling: receipt ordering (new received_at must not precede target revision received_at) enforced
  defensively in correct/void (unreachable with server clocks; tested by planting a future-received
  revision as a privileged fixture).
- Ruling: capability/traceability updated ONLY for CC-01, CC-02, CC-03 -> Partial (persistence legs
  proven by Task 4.2 database tests + domain evidence); CC-04/CC-05 summary display and CC-06..08
  remain unchanged (not proven by 4.2 tests; integration task decides with 4.1/4.4 evidence).
- Naming: record_cue_check / correct_cue_check / void_cue_check / get_cue_check / list_cue_checks
  (activity verb convention); private cores *_core in strandcue_private; wrappers public, invoker.
- Concurrency harness: extend the opt-in pattern with tests/database/cue-check-concurrency.pg.test.ts
  + .pg-spec.md (two-session create replay convergence + expected-revision conflict). Opt-in only;
  without a proven disposable local target it stays SKIP = HOLD.

## Task 4.2 recovery and implementation

- OpenCode stopped after creating RED tests; no migration or persistence implementation existed. The
  recovered RED run was 49 failed / 2 passed, led by missing `public.cue_checks` and missing RPCs.
- Implemented `20261024090000_cue_checks.sql` after the final tool/export migration. The initially
  CLI-generated current-date name sorted before the export authority and was corrected to the planned
  post-tool migration slot; this prevents the later tool migration from replacing Cue Check export work.
- Added forced-RLS owner tables, private operation receipts, strict observation validation, terminal
  execution and trusted-run binding, server-derived confirmed steps, one-active uniqueness, quotas,
  idempotency, append-only corrections/voids, keyset list/detail reads, narrow grants and pinned paths.
- Export moves from v4 to v5 and adds `cueChecks=1` and `cueCheckRevisions=1` in JSON and CSV. Profile
  deletion cascades Cue Check records, revisions and private receipts while direct history deletion stays
  blocked by the append-only trigger.
- Corrected four internally inconsistent RED fixtures without weakening production behavior: anonymous
  functions cannot both be non-executable and return an application error; deleting a run already
  cascades its execution; an identical operation replay must reuse the same observed timestamp; and a
  free SQL parameter required an explicit text cast.
- GREEN database evidence: focused Cue Check 51/51; Cue Check + export + deletion + inventory 102/102;
  complete database suite 28 passed / 4 skipped files, 709 passed / 18 skipped tests. Migration-admin,
  hardening, owner-isolation, shelf and tool-export regressions were fixed and re-run 154/154.
- Final gates: runtime PASS v24.19.0; typecheck PASS; lint PASS with zero warnings; full coverage
  177 files passed / 4 skipped and 3637 tests passed / 18 skipped, global 95.88 / 89.97 / 98.1 /
  97.78; web export PASS; control-plane METADATA-PASS; diff check and scoped secret scan clean.
  Dependency policy remains HOLD (0 critical, 19 high, 9 moderate; root advisory drift plus EAS and
  mutation-runner review drift) and is not claimed as a Task 4.2 pass.
- Security hardening follow-up added test-first: a privileged direct delete of a Cue Check head was
  initially accepted; the head trigger now blocks it while permitting only foreign-key cascades during
  profile deletion. Cue Check + deletion regression is 75/75 green.

# Increment 4 Cue Check and Personal Outcomes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner record immediate or delayed cosmetic observations against the exact protocol execution, correct or void them, and see honest non-causal personal summaries in Journey.

**Architecture:** Add immutable Cue Check contracts and deterministic summary functions in the domain, then an owner-scoped append-only PostgreSQL boundary tied to the authoritative execution and recommendation run. A small mobile adapter and accessible Journey UI expose create, correct, void and history flows. Cue Checks remain private observations and never modify catalogue evidence, reviewed content, eligibility, or recommendation rules.

**Tech stack:** TypeScript 6, React Native/Expo 57, Zod 4, Supabase/PostgreSQL, PGlite, Vitest 5, Node 24.19.0.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` requirements CC-01–CC-05, J-01, J-02 and the privacy/export/deletion principles; `docs/superpowers/specs/2026-10-10-product-recovery-audit.md` Cue Check and personal-outcome findings.

## Global constraints

- Start from the clean `codex/full-product-integration` HEAD containing this plan and verify `bedb71c` is an ancestor. Use a new isolated branch/worktree named `codex/increment-4-cue-check-personal-outcomes`.
- Use Node 24.19.x. Never run gates under the machine-default Node 25.
- Use strict RED → GREEN → refactor. Record the genuine failing command and reason before implementation for every task.
- New and materially changed logic must remain at least 80% statements, branches, functions and lines.
- Use immutable values and schema validation at every mobile, domain and database boundary.
- A Cue Check is an owner observation. Never phrase it as diagnosis, treatment, repair, growth, proof, causation, guaranteed outcome, universal safety, or global product evidence.
- Keep planned steps, confirmed execution events and owner observations separate. Never infer an action from the plan or an observation from execution.
- Most outcome fields are optional and unknown-aware. Never force an owner to answer every field and never convert omission into a negative answer.
- Create/correct/void/list operations must be owner-scoped, active-account checked, idempotent and auditable. Foreign and random identifiers must have indistinguishable refusal behavior.
- Bind each record to the exact authoritative execution and recommendation run. Refuse missing, foreign, non-terminal or inconsistent links. Never accept owner/run/product identifiers supplied as trusted facts by the client.
- Corrections append history; voiding appends an audit event. Do not update or delete historical Cue Check facts in place.
- Include Cue Checks and their history in owner export and deletion. Do not add them to catalogue evidence, reviewed-content publication, or another owner’s reads.
- Do not implement personal ranking, eligibility changes, automatic learning, rule rewriting or controlled experiments in Increment 4. CC-06–CC-08 remain deferred.
- Production guidance stays draft. Do not publish Banana content or invent products, capabilities, rules, evidence or reviewers.
- No push, merge, deploy, hosted migration, hosted setting change, photo/OCR/weather/reminder work, or Increment 5.

## Review focus

- Duplicate taps, lost responses and retries must produce one logical revision and return the already-committed result.
- Owner changes during load/save must clear the prior owner’s observations immediately and discard late responses.
- A Cue Check for an abandoned or partial execution must describe only confirmed actions; planned-but-unconfirmed steps must never appear as actual use.
- Immediate and delayed observations can coexist for one execution without overwriting each other; correction and void history remains readable.
- Empty, sparse or conflicting observations must produce an honest insufficient-evidence summary with counts, never a trend or causal statement.

---

### Task 4.1: define Cue Check contracts and non-causal summaries

**Files:**
- Create: `packages/domain/src/cue-check.ts`
- Create: `packages/domain/src/personal-outcome-summary.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/cue-check.test.ts`
- Test: `tests/domain/personal-outcome-summary.test.ts`

**Interfaces:**
- Produce `CueCheckInputSchema`, `CueCheckRecordSchema`, `CueCheckRevisionSchema` and exported inferred readonly types.
- Produce `summarizePersonalOutcomes(records, context): readonly PersonalOutcomeSummary[]`.
- Timing is `immediate | delayed`; lifecycle is `active | corrected | voided`.
- Outcome fields cover overall result, satisfaction, dryness, frizz, softness, tangling, buildup/heaviness, breakage observation, style longevity, immediate reaction and would-use-again. Use small explicit enums plus `unknown`; free text is optional, bounded and never interpreted.

- [ ] Write failing schema tests for valid minimal observations, each field, optional/unknown values, bounded text, impossible combinations, immutable output and unrecognized keys.
- [ ] Run the focused tests and record RED.
- [ ] Implement the contracts with deterministic canonical ordering and no mutation.
- [ ] Write failing summary tests for zero records, one/two sparse records, comparable contexts, immediate versus delayed separation, corrected/voided exclusion and wording such as “You reported less frizz in 3 of 4 comparable uses.”
- [ ] Run the summary tests and record RED.
- [ ] Implement summaries that expose numerator, denominator, context and uncertainty; require an explicit minimum comparable sample before any pattern wording; never use caused, fixed, repaired, proved, best, safe or works.
- [ ] Run focused tests, typecheck and coverage; commit `feat: define private Cue Checks and honest summaries`.

### Task 4.2: add owner-only append-only Cue Check persistence

**Files:**
- Create: `supabase/migrations/<timestamp>_cue_checks.sql`
- Test: `tests/database/cue-checks.test.ts`
- Modify: export/deletion migrations or their current wrapper migrations only through a new forward migration
- Modify: the migration inventory used by repository tests

**Interfaces:**
- Produce authenticated RPCs for create, correct, void and paginated list/detail reads.
- Every mutation accepts a stable operation ID and expected revision; the server derives owner, run, execution and confirmed actual-use bindings.
- Store server receipt time separately from owner-observed time and preserve observation precision.

- [x] Write failing PGlite tests for ownership, active-account enforcement, anonymous/direct-write denial, terminal execution binding, exact run agreement and confirmed-actual-use projection.
- [x] Write failing tests for identical retry convergence, conflicting operation reuse, expected-revision conflicts, correction chains, void history, size quotas and refusal atomicity.
- [x] Write failing export/deletion tests and a proof that catalogue evidence/publication rows never change.
- [x] Run the database suites and record RED.
- [x] Implement one forward-only migration with RLS, narrow grants, append-only guards, relational integrity, bounded payloads and stable public error codes.
- [x] Verify the full migration set applies from zero and reruns fail safely where expected.
- [x] Run database suites and coverage; commit `feat: persist owner-only Cue Checks`.

### Task 4.3: add the mobile Cue Check API and state machine

**Files:**
- Create: `apps/mobile/src/journey/cue-check-api.ts`
- Create: `apps/mobile/src/journey/cue-check-state.ts`
- Test: `tests/mobile/cue-check-api.test.ts`
- Test: `tests/mobile/cue-check-state.test.ts`

**Interfaces:**
- Produce schema-validated create/correct/void/list/detail functions that map only stable server codes to plain UI states.
- Produce a pure reducer for idle, loading, editing, saving, saved, failed and conflict states.

- [ ] Write failing tests for malformed server data, owner switching, late responses, duplicate save taps, offline retry with the same operation ID, revision conflicts and correction/void recovery.
- [ ] Run focused tests and record RED.
- [ ] Implement fail-closed adapters and immutable reducer transitions. Do not log payloads, free text, URLs, tokens, emails, UUIDs or database responses.
- [ ] Run focused tests, typecheck, lint and coverage; commit `feat: add Cue Check client boundary`.

### Task 4.4: implement accessible Cue Check and Journey history surfaces

**Files:**
- Create: `apps/mobile/src/journey/CueCheck.tsx`
- Create: `apps/mobile/src/journey/PersonalOutcomeHistory.tsx`
- Create: `apps/mobile/src/journey/cue-check-copy.ts`
- Modify: `apps/mobile/src/ProtocolExecution.tsx`
- Modify: the existing Journey destination wiring discovered in the baseline
- Test: `tests/mobile/cue-check.test.tsx`
- Test: `tests/mobile/personal-outcome-history.test.tsx`
- Test: `tests/mobile/accessibility.test.tsx`

**Interfaces:**
- A server-confirmed terminal execution offers “Tell us how your hair felt” and “Do this later.” No optimistic/local terminal state may open the form.
- Journey separates “Planned”, “Actually recorded” and “How you said it felt.”

- [ ] Write failing UI tests for immediate and later entry, optional/unknown answers, keyboard and screen-reader labels, 44px controls, focus after save/failure, correction, void, pagination and owner switch.
- [ ] Write a failing test proving partial/abandoned execution displays only confirmed actual events and never planned steps as completed.
- [ ] Run focused tests and record RED.
- [ ] Implement the smallest accessible surfaces with neutral cosmetic wording and no score, percentage fit, streak, diagnosis or outcome promise.
- [ ] Run mobile, integration, accessibility and owner-switch suites; commit `feat: add Cue Check and personal history`.

### Increment 4 integration, review and stop

**Files:**
- Modify: `docs/product/full-product-capability-matrix.md`
- Modify: `docs/product/requirement-traceability.md`
- Create: `.superpowers/sdd/2026-10-21-increment-4-cue-check-personal-outcomes/increment-4-report.md`

- [ ] Run an end-to-end component journey with test-only fixtures: terminal execution → immediate Cue Check → delayed Cue Check → correction → Journey summary → void. Prove production draft guidance still returns `content_pending`.
- [ ] Run fresh independent code-correctness, database/security/privacy and accessibility/plain-language reviews. Fix and re-review every Critical, High and Medium finding.
- [ ] Run `npm run check:runtime`, `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run test:coverage -- --maxWorkers=4`, `npm run export:web`, `npm run audit:control-plane`, `npm run audit:dependencies`, research validation if present, and `git diff --check`.
- [ ] Record exact results. Treat dependency drift, hosted owner isolation, real two-session PostgreSQL concurrency and device evidence as HOLD/NOT RUN unless actually proved; never relabel them PASS.
- [ ] Update CC-01–CC-05 only where named tests prove behavior. Leave CC-06–CC-08 Not started or Partial as the evidence supports.
- [ ] Confirm a clean tree and provide a handoff listing commits, migrations, RED/GREEN evidence, coverage, review findings, residuals and all hosted/manual HOLDs.
- [ ] Stop. Do not begin Increment 5.

## Ready-to-copy OpenCode prompt

Start StrandCue Increment 4, but execute **Task 4.1 only**. Begin from the current clean `codex/full-product-integration` HEAD that contains this plan and verify `bedb71c` is an ancestor. Read `docs/superpowers/plans/2026-10-21-increment-4-cue-check-personal-outcomes.md`, `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` (especially CC-01–CC-08), `docs/superpowers/specs/2026-10-10-product-recovery-audit.md`, the Task 3.3 plan/report, and the current requirement traceability and capability matrix before changing code. Create an isolated branch/worktree `codex/increment-4-cue-check-personal-outcomes`. Use Node 24.19.x and strict RED → GREEN → refactor with genuine failing evidence. Implement only the immutable Cue Check domain contracts and deterministic non-causal personal summary functions described in Task 4.1: optional and unknown-aware immediate/delayed observations; exact outcome vocabulary; bounded uninterpreted notes; correction/void lifecycle types; canonical immutable values; comparable-use counts, context and uncertainty; and an explicit minimum sample before any pattern wording. Never say or imply that a product caused, fixed, repaired, grew, proved, guaranteed or universally safely produced an outcome. Add the new domain exports and focused tests. Ensure new logic has at least 80% statements, branches, functions and lines. Run the focused suites, domain typecheck, full typecheck, lint and `git diff --check`. Run fresh code-correctness, privacy/safety-language and schema-boundary reviews; fix and re-review every Critical, High and Medium finding. Commit the Task 4.1 deliverable and provide a clean handoff with the branch/worktree/HEAD, changed files, genuine RED/GREEN evidence, exact test and coverage results, review findings and remaining limitations. Do not create a migration, API, state machine or UI; do not change export/deletion; do not publish Banana content or invent products, capabilities, rules, evidence or reviewers; do not push, merge, deploy or alter hosted services. Stop before Task 4.2.

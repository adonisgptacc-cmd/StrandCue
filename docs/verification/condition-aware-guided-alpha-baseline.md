# Condition-aware guided alpha — integration baseline

Date: 2026-10-13 (Africa/Johannesburg)
Branch: `codex/condition-aware-guided-alpha` @ `7460751` (`docs: plan condition-aware guided alpha continuation`)
Plan: `docs/superpowers/plans/2026-10-13-condition-aware-guided-alpha-continuation.md`
Authority: `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` v1.0 (10 October 2026)

## 1. Base evidence

- `git rev-parse HEAD` → `7460751f266e44e617aecfc71e2e9d99dc35e122`
- `git status` → clean tree, nothing to commit (verified before and after all
  verification runs; this task made no production logic changes).
- Branch ancestry: `7460751^` == `c428c740e968d708669c9e3ee0b50418293f7e49`
  (direct implementation ancestor); `git merge-base --is-ancestor c428c74 HEAD`
  exits 0. `7460751` is the plan-bearing head of
  `codex/basic-wash-reviewed-content`; this worktree's branch was created from it.
- Runtime (binding): `node --version` → `v24.19.0`; `npm --version` →
  `11.17.0`, from
  `C:\Users\ABADO\AppData\Local\Temp\opencode\node24\node-v24.19.0-win-x64\`.
  System Node is v25.1.0 and was not used; every command below ran with the
  Node 24 directory prepended to `PATH`.
- Work was confined to the worktree
  `C:\Users\ABADO\Desktop\StrandCue\.worktrees\condition-aware-guided-alpha`.
  The main checkout, other worktrees, cloud drives and hosted services were not
  touched. No hosted migration was applied, nothing was pushed/merged/deployed.

## 2. Verification results (exact, gates not weakened)

### 2.1 `npm run verify:offline` — FAILS at `audit:control-plane` (pre-existing)

Full chain exit code: **1**. The failure is the pre-existing
`audit:control-plane` HOLD described below; it is present at the base commit
on a clean tree and is not caused by this task. Stage-by-stage outcome:

| Stage | Result |
|---|---|
| `check:runtime` | PASS — `NODE-RUNTIME-PASS v24.19.0` |
| `typecheck` (domain `tsc --noEmit` + mobile `tsc --noEmit`) | PASS, both |
| `lint` (`eslint … --max-warnings=0`) | PASS, zero warnings |
| `test:coverage` (`vitest run --coverage`) | PASS — **91 test files passed, 1 file skipped (92 total); 1328 tests passed, 4 skipped (1332 total); 0 failed** |
| `audit:control-plane` (`node scripts/audit-cli.ts`) | **HOLD, exit 1** — 1 finding: `CLAIM-STALE: Review required: expo-compatible-sdk`; status `HOLD` |
| `export:web` (`expo export --platform web`) | never reached inside the chain; **passes standalone, exit 0** (web bundle + `index.html`/`metadata.json` exported to `dist`) |

Coverage (v8, thresholds met — every changed-logic-file requirement of prior
plans remains satisfied):

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 97.71 | 91.28 | 99.38 | 98.66 |
| `packages/domain/src` (activity/history/passport/services/shelf/tools) | 94.88 | 87.10 | 98.82 | 96.93 |
| `packages/domain/src/guidance` | 99.78 | 97.31 | 100 | 100 |
| `packages/domain/src/recommendations` | 98.92 | 89.39 | 99.28 | 99.07 |
| `scripts` (compiler, intake, research validator) | 98.89 | 92.30 | 100 | 99.59 |

Documentation/tooling subset (`tests/tooling/`, 23 files): **298/298 pass** —
catalogue-compiler 45, guidance-research 52, dependency-policy 68,
guidance-governance 21, ci 10, account-deletion-worker 12,
workspace-manifests 21, product-authority 6, control-plane 8, maestro 3,
cloudflare-worker 5, rebaseline 7, d2-config 4, mutation 4, reconciliation 2,
release-links 9, beta-readiness 2, rehearsal 4, line-endings 2, eas-config 4,
security-review 3, assetlinks 1, runtime-policy 5.

### 2.2 `npm run audit:dependencies` — PASS

`DEPENDENCY-POLICY-PASS` — `{"critical":0,"high":19,"moderate":11,"reviewedAdvisories":4}`.
Zero critical findings; 19 high / 11 moderate advisories remain under the
reviewed-exception policy (`docs/verification/dependency-advisory-exceptions.json`).

### 2.3 `npm run validate:guidance-research` — PASS

`GUIDANCE-RESEARCH-PASS rows=2 catalogue=2 evidence=6` — inventory 2 rows,
2 catalogue versions resolved from the local seed migration, 6 draft evidence
records.

### 2.4 `git diff --check` — PASS

No whitespace errors (exit 0).

## 3. What was inspected

- Canonical spec, recovery audit, current traceability matrix (§1 header).
- `apps/mobile/src/guidance/today-guidance-service.ts` — Today orchestration:
  load snapshot → gate reviewed bundle → prepare safe context → run the
  deterministic engine only on a `ready` preparation. Draft/withdrawn/malformed
  content returns `content_pending`; partial sources return `source_error`.
  The clock is never read inside the service.
- `apps/mobile/src/TodayGuidance.tsx` — Today state machine (`idle → loading →
  blocked | ready | error`), user-initiated generation only (never on mount),
  epoch-guarded against late/owner-changed responses, exactly-once run
  persistence, no cached or generic fallback. Goal is fixed to `basic_wash`.
- `packages/domain/src/recommendations/` (10 modules: engine, rule
  evaluation, condition evaluation, candidate ranking, protocol building,
  effect application, validation, schemas, types, index).
- `packages/domain/src/guidance/` (9 modules: evidence types/schemas,
  capability vocabulary, preparation adapter, reviewed-content gate, capability
  review validator, schemas, types, index).
- `supabase/migrations/` — 32 files listed (no modifications). Notable: the
  catalogue DDL migrations insert no rows; the only catalogue rows live in the
  local-only seed `20261012184009_basic_wash_catalogue_seed.sql`;
  `20261011082525_bitemporal_activity_guidance.sql` and
  `20261011090000_recommendation_runs.sql` are verified locally (PGlite) and
  **not applied to hosted Supabase**.
- Prior plan `docs/superpowers/plans/2026-10-11-basic-wash-reviewed-content.md`
  (completed through Task 7 Step 1; Task 8 review packet produced, publication
  blocked) and `docs/verification/today-guidance-integration.md`.
- Prior handoff artifact (lives in the sibling worktree
  `codex/basic-wash-reviewed-content`, read there, not copied here):
  `.superpowers/sdd/2026-10-12-first-catalogue-bootstrap-and-basic-wash-publication/catalogue-and-content-review-packet.md`
  — the Task 8 two-human packet. Human A and Human B sections are **empty**;
  recorded below as human-blocked.

## 4. Capability baseline at `7460751`

### 4.1 Implemented (code, persistence and tests exist)

- Deterministic recommendation core: EN-01, EN-03–EN-09
  (`packages/domain/src/recommendations/`, engine/rules/protocol/basic-wash
  suites).
- Evidence and capability contracts plus validators: evidence
  types/schemas, `BASIC_WASH_CAPABILITIES = ['cleanse', 'condition']`,
  capability-review validator, strengthened publication gate
  (`validatePublishedBundle(input, evidenceRegistry, capabilityReview, now)`).
- Today plumbing: snapshot loading with effective/recorded cutoffs,
  preparation adapter, orchestration service, Today UI state machine,
  immutable owner-scoped recommendation-run persistence with provenance
  (request id, `asOf`, engine version, bundle id/version, input fingerprint
  over the exact normalized input).
- Bitemporal activity guidance: owner-scoped history RPC, immutable
  pagination, revision-provenance boundary.
- Discovery backlog module: `packages/domain/src/discovery-backlog.ts`
  (schema + `normalizeDiscoveryText`, `fingerprintDiscoveryRow`,
  `parseDiscoveryTable`, builder entry point **`buildDiscoveryBacklog`**
  at line 663; there is **no separate discovery compiler file** — Task 2
  hardens normalization inside this module) with
  `docs/product/discovery/discovery-backlog.json` (**313 rows**,
  `generatedFrom: master-catalogue OUTPUT 2 tables`, cutoff 2026-10-12),
  gap ledger + 3 reports (`discovery-gap-ledger.md`,
  `discovery-reconciliation.md`, `discovery-shortlist.md`,
  `discovery-source-quality.md`).
- Catalogue compiler: `scripts/catalogue-compiler.ts`
  (`compileCatalogueIntake`, deterministic UUIDv5 identities) via
  `scripts/compile-catalogue-intake.ts`; local seed migration carrying
  exactly 2 ZA versions (Garnier Banana shampoo
  `96759932-6d87-56c2-8165-8f95260447f4`, conditioner
  `6ae2cd7a-2d89-5d16-a07d-36ca44139c59`) plus checked-in snapshot
  `docs/product/catalogue/basic-wash-v1/catalogue-snapshot.json`
  (isolation verified by `tests/database/catalogue-seed.test.ts`, 20 tests).

### 4.2 Partial (foundation exists, user capability incomplete)

- EN-02: deterministic ordering/validation/hard-rule/ranking exist; the
  official-direction and treatment-state adapters remain.
- TD-01–TD-06, TD-09: full records → preparation → engine → UI → persistence
  path exists and is tested, but no real guidance is published (see §4.4).
- SF-01 (cosmetic boundary in engine/UI copy), SF-05 (withdrawn rules skipped
  and audited; no live recall pipeline), UX-01–UX-04 (navigation destinations,
  release-stage banner and labels only).

### 4.3 Absent (no production capability)

- TD-07/TD-08 (execution, pause/resume, abandon), TR-01–TR-08 (wash counting,
  treatment programmes), CC-01–CC-08 (Cue Check, summaries, ranking),
  PH-01–PH-09, WX-01–WX-06, RA-01–RA-06, RM-01–RM-05, AI-01–AI-07, SF-02–SF-04,
  CO-01–CO-05, PR-01–PR-04, PV-01–PV-08 (as product requirements; foundation
  tables/code exist but no requirement-level evidence is claimed here),
  HP-05/HP-06 completeness and temporary-condition behavior, and — central to
  this programme — **temporary current-condition check-in, protocol execution
  and Cue Check** (plan Tasks 3–5, 6–8, 9–11 respectively).

### 4.4 Human-blocked (automation must not advance)

- The Task 8 two-human packet awaits **Human A (author)** and a distinct
  **Human B (independent reviewer)**; both sections are empty. Valid blocked
  outcomes include the bundle staying draft.
- Production bundle `today-core-guidance` version `2` is **`draft`** with
  **empty capabilities** and a **withdrawn placeholder rule**; the checked-in
  evidence registry holds **6 draft records** (`authoredBy:
  task-07-draft-research`, `reviewedBy/At: null`) and the capability review
  holds **2 draft rows**. No reviewer names, approval dates, catalogue UUIDs,
  evidence URLs or claims were invented.
- Seed migration `20261012184009_basic_wash_catalogue_seed.sql` is
  **local-only, unapplied to hosted Supabase**, as are the bitemporal and
  recommendation-run migrations.

### 4.5 Load-bearing rule (applies to every task in this programme)

**Draft content may not execute.** The bundle is draft, the publication gate
refuses it, and Today shows `content_pending`
(`CONTENT_PENDING_BODY`: reviewed guidance content is still being prepared).
Any change that makes draft content executable is a Critical defect regardless
of the task's own tests.

## 5. Requirement-to-task map for this programme

Spec requirements in scope (plan §Spec): HP-01, HP-05, HP-06, EN-01–EN-09,
TD-01–TD-09, CC-01–CC-07, P-01–P-12, SF-01, EV-01–EV-05, UX-01–UX-04.
Baseline status of each is the Status column of
`docs/product/requirement-traceability.md` on this commit (no status was
changed by this task). The traceability map phrases ranges as "X through Y"
and never starts a row with a bare requirement ID, preserving the
`product-authority` gate invariant that every canonical ID opens exactly one
table row. Planned coverage:

| Requirement(s) | Baseline status | Plan task(s) |
|---|---|---|
| HP-01, HP-05, HP-06 | Not started | Task 5 (demonstrated check-in behavior only) |
| EN-01–EN-09 | Implemented except EN-02 Partial | consumed as-is; Task 4 passes condition facts through the existing boundary |
| TD-01–TD-04 | Partial | Task 5 (preflight state machine + copy) |
| TD-05–TD-09 | TD-05/09 Partial, TD-06 Partial, TD-07/08 Not started | Tasks 6–8 (execution persistence + UI) |
| CC-01–CC-07 | Not started | Tasks 9–11 |
| P-01–P-05, P-07–P-10, P-12 | Not started (standing principles) | Tasks 3–5, 11 (no invention, determinism, honesty, neutrality) |
| P-06 | Not started | Task 11 (non-causal summaries) |
| P-11 | Not started | Task 11 (decision evidence details) |
| SF-01 | Partial | Task 5 (cosmetic-boundary copy) |
| EV-01–EV-05 | Not started (draft artifacts only, §4.4) | Task 11 (evidence rendering resolves only identifiers in the exact decision's registry version); content lane owns review/publication |
| UX-01–UX-04 | Partial | Task 5 (accessible check-in UI) |
| Discovery hardening (no spec requirement claimed) | — | Task 2 (validation only; no row promotion, fingerprints stable) |

## 6. Known limitations and concerns

1. `npm run verify:offline` fails at `audit:control-plane` (HOLD,
   `CLAIM-STALE expo-compatible-sdk`, exit 1) on the clean base commit.
   Later tasks must record the same command honestly; fixing or waiving that
   HOLD is out of scope for Increment A unless the controller directs it.
2. Local Supabase was not exercised beyond the PGlite-backed test suite; no
   hosted project was linked or queried.
3. The 313-row discovery backlog is a reviewed artifact: Task 2 must keep all
   existing row fingerprints byte-identical.
4. No human identities are filled anywhere in this baseline; the packet's
   Human A/B sections remain empty.
5. No publication claims are made: the production bundle is draft, Today
   yields `content_pending`, and the release stage remains Technical Alpha.

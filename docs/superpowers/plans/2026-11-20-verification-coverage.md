# Verification coverage implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository and release checks cover new mobile modules, website behavior, and real PostgreSQL concurrency.

**Architecture:** Extend existing verify tooling with a local-preview website gate, a post-deployment transport gate, explicit real-Postgres CI execution, and source-glob coverage thresholds. Keep required check names stable.

**Tech Stack:** GitHub Actions, Vitest/V8 coverage, Supabase local stack/PostgreSQL, Node 24.

**Spec:** `docs/superpowers/specs/2026-11-20-repository-health-repairs-design.md`

## Global Constraints

- Keep the required check names `quality`, `dependency-audit`, `supabase-api`, and `secret-scan` unless branch protection is updated in the same reviewed change.
- Do not make ordinary PRs depend on live website availability; run transport after deployment/release.
- Run real database tests only against disposable, least-privileged CI services.
- Keep at least 80% lines, statements, functions, and branches for covered critical modules.

## Review Focus

- A broken static website route must fail the quality gate; Task 1 adds a regression.
- A live transport outage must fail release verification without breaking an unrelated PR; Task 1 splits the gate.
- A new mobile source module must be counted by coverage; Task 3 adds a fixture assertion.
- A concurrency test must not silently skip in the dedicated CI job; Task 2 checks executed-test count.
- A failed disposable database startup must show an actionable non-secret error; Task 2 verifies sanitized diagnostics.

---

### Task 1: Gate website content and deployed transport

**Files:** Modify `.github/workflows/verify.yml`, `package.json`, and `tests/tooling/ci.test.ts`; use existing `scripts/check-website.ts`, `scripts/check-website-transport.ts`, and `website/wrangler.jsonc`.

**Interfaces:** Produces a local-preview website check in `quality` and a separate post-deployment/release transport command.

- [ ] **Step 1:** Add a failing CI configuration test asserting `quality` starts a local Wrangler preview and runs `check:website` with `STRANDCUE_WEBSITE_ORIGIN=http://127.0.0.1:8787`; assert the release preflight includes the public transport check only after the endpoint passes.
- [ ] **Step 2:** Add the preview lifecycle and commands to workflow/scripts, with cleanup on failure. Keep `check:website-transport` out of ordinary PR quality.
- [ ] **Step 3:** Run `tests/tooling/ci.test.ts`, the local preview check, and the post-deployment transport command; require green results.

### Task 2: Run real PostgreSQL concurrency tests

**Files:** Modify `.github/workflows/verify.yml` and `tests/tooling/ci.test.ts`; adapt `scripts/local-postgres-test-target.ts` or add a focused helper only if needed by the existing suites.

**Interfaces:** Produces a CI job or step that supplies `STRANDCUE_PG_DSN` to the existing `tests/database/*concurrency.pg.test.ts` suites and fails if they skip.

- [ ] **Step 1:** Add a failing CI test requiring the disposable Postgres target, DSN injection, and an executed-test count check.
- [ ] **Step 2:** Reuse the local Supabase stack or a disposable PostgreSQL service; create only the roles/schema the tests require. Keep credentials masked and logs sanitized.
- [ ] **Step 3:** Run all concurrency suites against that target, verify none skip, and run the existing Supabase ownership suite. Require the CI job green twice if startup was previously flaky.

### Task 3: Include newly added mobile modules in coverage

**Files:** Modify `vitest.config.ts` and `tests/tooling/coverage-gates.test.ts`.

**Interfaces:** Produces coverage inclusion for `apps/mobile/src/**/*.{ts,tsx}` with appropriate exclusions for declarations and generated files, while retaining critical per-file floors.

- [ ] **Step 1:** Add a failing test proving a new mobile source path matches coverage inclusion and is not hidden by the current explicit allowlist.
- [ ] **Step 2:** Add the mobile source glob and only justified exclusions; keep critical module per-file 80% floors and overall floors.
- [ ] **Step 3:** Run focused tests and `npm run test:coverage`; if the expanded denominator reveals uncovered modules, add meaningful behavior tests or record a narrowly justified staged threshold with an expiry, never delete coverage data.
- [ ] **Step 4:** Run `npm run typecheck`, `npm run lint`, and the four required CI checks; commit as `ci: cover website and database verification gaps` after independent review.

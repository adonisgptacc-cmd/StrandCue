# StrandCue Phase 1 Milestone 0 — Integrate and Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Begin product development from an agreed, reproducible branch with clean environment, authenticated database evidence, and no Critical or High defects.

**Architecture:** Reproducible environment setup, dependency verification, authenticated Supabase suite execution, feature branch creation for subsequent milestones. Baseline integration of existing codebase state.

**Tech Stack:** Node 24, npm, TypeScript, Vitest, Supabase (PGlite), Git

**Spec:** `docs/superpowers/specs/2026-09-17-strandcue-phase1-roadmap-design.md` (Milestone 0 section)

**Global Constraints** (from design doc):
- Node version: `^22.13.0 || ^24.0.0 || >=26.0.0` (package.json)
- Engine: `npm run verify` runs `npm run typecheck && npm test && npm run audit:control-plane && npm run export:web`
- No removal of old worktrees until exact targets receive separate approval
- Feature branch or worktree established for My Shelf (next milestone)
- Clean main branch required as exit gate

## Tasks

### Task 0.1: Review and merge codex/phase1a-stabilization
- [ ] **Step 1:** Checkout branch `codex/phase1a-stabilization`
- [ ] **Step 2:** Review commit history with `git log --oneline -20`
- [ ] **Step 3:** Resolve any merge conflicts with `main`
- [ ] **Step 4:** Merge into `main` with `git merge codex/phase1a-stabilization`
- [ ] **Step 5:** Verify merge commit appears in `git log`

**Interfaces:**
- Consumes: None (repository state)
- Produces: Clean `main` branch with stabilization commits

**Step 1:** Run `git checkout codex/phase1a-stabilization`
**Step 2:** Run `git log --oneline -20` — review commits
**Step 3:** Run `git checkout main && git merge codex/phase1a-stabilization` — resolve conflicts if any
**Step 4:** Run `git log --oneline -5` — verify merge
**Step 5:** Commit: `git commit -m "feat: merge phase1a-stabilization branch"`

### Task 0.2: Confirm Node 24 and clean npm ci
- [ ] **Step 1:** Verify Node version with `node --version` — must match `^22.13.0 || ^24.0.0 || >=26.0.0`
- [ ] **Step 2:** Remove `package-lock.json` and `node_modules/`
- [ ] **Step 3:** Run `npm ci` — clean install with exact versions from lockfile
- [ ] **Step 4:** Run `node --version` again to confirm
- [ ] **Step 5:** Run `npm run typecheck` — should pass with no errors
- [ ] **Step 6:** Run `npm test` — all 245 tests should pass

**Interfaces:**
- Consumes: Clean repository state (after Task 0.1)
- Produces: Node 24 environment, installed dependencies, passing typecheck and tests

**Step 1:** Run `node --version` — confirm output matches engine requirement
**Step 2:** Run `rm package-lock.json && rm -rf node_modules/`
**Step 3:** Run `npm ci`
**Step 4:** Run `node --version` again to confirm
**Step 5:** Run `npm run typecheck:domain` — verify `tsc --noEmit` passes
**Step 6:** Run `npm test` — verify all test files pass (11 test files, 245 tests)

### Task 0.3: Run the canonical verification gate
- [ ] **Step 1:** Run `npm run verify` — full verification suite
- [ ] **Step 2:** Confirm exit code is 0 (all gates pass)
- [ ] **Step 3:** Review verification output for any warnings

**Interfaces:**
- Consumes: Clean environment from Task 0.2
- Produces: Verification gate passed, ready for authenticated suite

**Step 1:** Run `npm run verify`
**Step 2:** Check exit code is 0
**Step 3:** Review full output for any failures or warnings

### Task 0.4: Run the opt-in authenticated Supabase suite
- [ ] **Step 1:** Start local Supabase with `npx supabase start`
- [ ] **Step 2:** Configure local API URL and anon/publishable key in `apps/mobile/.env`
- [ ] **Step 3:** Run authenticated database tests: `tests/database/*.test.ts`
- [ ] **Step 4:** Verify all database tests pass (migration, passport, services)
- [ ] **Step 4:** Record evidence of authenticated database state

**Interfaces:**
- Consumes: Verified environment from Task 0.3
- Produces: Authenticated Supabase suite evidence, ready for feature branch

**Step 1:** Run `npx supabase start`
**Step 2:** Copy `apps/mobile/.env.example` to `apps/mobile/.env` and configure
**Step 3:** Run `tests/database/migration.test.ts` — verify all 2 migration tests pass
**Step 4:** Run `tests/database/passport.test.ts` — verify all 37 passport tests pass
**Step 5:** Run `tests/database/services.test.ts` — verify all 44 services tests pass
**Step 6:** Record evidence: database schema, RLS policies, test results

### Task 0.5: Record dependency exceptions and review dates
- [ ] **Step 1:** Review `package.json` engines field and overrides
- [ ] **Step 2:** Document any dependency exceptions needed for Phase 1
- [ ] **Step 3:** Record review dates for each exception
- [ ] **Step 4:** Ensure no production-deployment-changing dependencies are omitted

**Interfaces:**
- Consumes: Verified environment from Tasks 0.2-0.4
- Produces: Documented dependency exceptions with review dates

**Step 1:** Review `package.json` — engines: `^22.13.0 || ^24.0.0 || >=26.0.0`, overrides for react-native, reanimated, etc.
**Step 2:** Document any exceptions (e.g., why specific react-native version is pinned)
**Step 3:** Record review dates next to each exception
**Step 4:** Commit exception documentation: `git commit -m "docs: record dependency exceptions for Phase 1"`

### Task 0.6: Establish feature branch for My Shelf
- [ ] **Step 1:** Create feature branch `feature/milestone1-shelf` from `main`
- [ ] **Step 2:** Verify branch is trackable and clean
- [ ] **Step 3:** Document branch purpose in README or branch description

**Interfaces:**
- Consumes: Clean main branch from Tasks 0.1-0.5
- Produces: Feature branch `feature/milestone1-shelf` ready for Milestone 1

**Step 1:** Run `git checkout -b feature/milestone1-shelf main`
**Step 2:** Run `git branch` — verify `feature/milestone1-shelf` is listed
**Step 3:** Document: `echo "Feature branch for My Shelf and provenance (Milestone 1)" > BRANCH-SUMMARY.md`
**Step 4:** Commit: `git add BRANCH-SUMMARY.md && git commit -m "docs: add branch summary for Milestone 1"`

---
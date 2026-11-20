# Dependabot queue implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the newly opened dependency PR queue without losing compatibility or bypassing protected main.

**Architecture:** Triage each PR against the latest main, repair failing updates in small dependency groups, and merge only final heads with passing required checks and authorized review.

**Tech Stack:** GitHub PRs and Actions, npm workspaces, Expo, Supabase CLI, TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-20-repository-health-repairs-design.md`

## Global Constraints

- Do not bulk-merge #14–26 or weaken required checks, linear history, or last-push approval.
- Treat #18's local Supabase startup failure as a diagnosis target; avoid assuming the action version caused it.
- Re-evaluate each PR's current diff and checks after main advances.

## Review Focus

- A PR with failed quality or audit cannot merge; Task 2 requires green final-head checks.
- A major tool update may require config changes; Task 2 tests the changed surface.
- A transient Supabase failure must be rerun or reproduced before blaming the diff; Task 1 records evidence.
- A stale branch must be refreshed before merge; Task 2 checks base freshness.
- A duplicate update can close only after its version is installed on main; Task 3 verifies the lockfile.

---

### Task 1: Build the queue ledger

**Files:** Create `docs/verification/dependabot-queue-2026-11.md` with no secrets or raw CI logs.

**Interfaces:** Produces for each of #14–26: changed package/action and version, major/minor/patch, diff scope, final-head check results, failure signature, and merge/supersede/hold decision.

- [ ] **Step 1:** Fetch current main and PR metadata; compare each PR's actual diff and lockfile to main.
- [ ] **Step 2:** Collect completed job results for all four required checks. Inspect failed logs for #18, #21, and #23–26, grouping only matching root causes.
- [ ] **Step 3:** Mark each PR as ready, fix, supersede, or hold with evidence; do not label pending jobs as failures.

### Task 2: Repair the failed updates

**Files:** Change only files implicated by each PR's failing job; likely `package.json`, package lockfiles, `.github/workflows/verify.yml`, and focused tests. Keep unrelated updates in separate PRs.

**Interfaces:** Consumes ledger failures. Produces a final head for each attempted update that passes its affected test and all four required GitHub checks.

- [ ] **Step 1:** For each root cause, add a focused failing regression or reproduce the exact CI failure on a clean install; record the red result.
- [ ] **Step 2:** Apply the minimum compatibility change, preserving dependency-policy and secret-scan gates.
- [ ] **Step 3:** Run the focused test locally and required CI checks on the final PR head; update the ledger with URLs and versions.

### Task 3: Merge or hold individually

**Files:** Update `docs/verification/dependabot-queue-2026-11.md` with final disposition.

**Interfaces:** Consumes green final heads and authorized reviews. Produces protected-main merges or explicit hold reasons.

- [ ] **Step 1:** Confirm each ready PR is current with main and its final diff still matches the reviewed change.
- [ ] **Step 2:** Obtain a review after the last push; merge through an allowed method only after explicit external-action authorization.
- [ ] **Step 3:** Confirm main contains the dependency version and passes `verify`; close only verified duplicates and record remaining holds.

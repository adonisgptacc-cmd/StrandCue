# Dependency advisory review implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-review all current dependency findings before their recorded review and expiry dates without weakening the high-severity gate.

**Architecture:** Audit each independent lockfile tree, match findings to exact advisory IDs and paths, upgrade where feasible, and update only still-justified reviewed exceptions.

**Tech Stack:** npm 11, Node 24, dependency audit CLI, JSON review registries, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-repository-health-repairs-design.md`

## Global Constraints

- Do not add a high- or critical-severity exception merely to pass CI.
- Use a named owner, current assessment, mitigation, review date, and short expiry for every remaining exception.
- Treat an npm audit exit status of 1 as findings data only when the report parses and policy permits every finding.

## Review Focus

- A new high advisory must hold the audit; Task 2 runs the policy regression.
- A changed package path must hold until re-reviewed; Task 2 covers path drift.
- An expired exception must hold; Task 2 covers date expiry.
- A withdrawn advisory must be removed rather than renewed; Task 1 checks advisory status.
- All four lockfile trees must be audited; Task 1 records each result.

---

### Task 1: Refresh the evidence

**Files:** Modify `docs/verification/dependency-advisory-exceptions.json`, `docs/verification/eas-runner-advisory-review.json`, and `docs/verification/mutation-runner-advisory-review.json` only after evidence is gathered.

**Interfaces:** Produces a per-advisory table with package version, path, severity, current advisory status, patched version, reachability, owner, and disposition.

- [ ] **Step 1:** Run `npm run audit:dependencies` on Node 24 and obtain raw npm audit reports for root, account-deletion worker, EAS runner, and mutation runner.
- [ ] **Step 2:** Compare each advisory with the authoritative published record and the installed path; identify withdrawn or fixed advisories and feasible safe upgrades.
- [ ] **Step 3:** Upgrade where compatible; for remaining moderate findings, record the fresh assessment, review date, and short expiry in the applicable registry. If acceptance is required, present the exact residual risk before changing the registry.

### Task 2: Prove policy behavior

**Files:** Test `tests/tooling/dependency-policy.test.ts` and `tests/tooling/runner-dependency-policy.test.ts`; modify policy code only for a demonstrated bug.

**Interfaces:** Consumes Task 1's reviewed registry. Produces passing audit and regression tests without suppressing new findings.

- [ ] **Step 1:** Add or confirm tests for expired date, new high severity, changed path, withdrawn advisory removal, and valid moderate review; run them to verify the intended hold/pass outcomes.
- [ ] **Step 2:** Make only the registry, version, or policy corrections demonstrated by those tests.
- [ ] **Step 3:** Run `npm run audit:dependencies`, both focused test files, lint, and typecheck. Require zero unreviewed findings and zero high/critical findings.
- [ ] **Step 4:** Commit as `fix: refresh reviewed dependency advisory evidence` with the audit summary and expiration in the commit/PR notes.

# Dependabot alert reconciliation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub's open security-alert inventory reflect the installed dependencies on current main.

**Architecture:** Compare every alert's manifest, vulnerable range, and patched version to the merged lockfiles; let GitHub rescan, then resolve only alerts with evidence.

**Tech Stack:** GitHub Dependabot alerts API, npm lockfiles, dependency audit CLI.

**Spec:** `docs/superpowers/specs/2026-11-20-repository-health-repairs-design.md`

## Global Constraints

- No bulk dismissal; an alert with an installed vulnerable version remains open.
- Do not equate a passing policy audit with zero vulnerability findings.
- Use exact main commit and manifest paths when recording evidence.

## Review Focus

- An old node-forge alert should resolve only if every affected manifest installs a fixed version; Task 1 checks paths.
- A still-vulnerable moderate dependency remains visible; Task 2 leaves it open.
- A stale GitHub graph must be distinguished from a stale lockfile; Task 1 compares both.
- A newly published advisory must enter the inventory; Task 1 reads the current API list.
- Any dismissal needs a specific verified reason; Task 2 records it.

---

### Task 1: Inventory current alerts

**Files:** Create `docs/verification/dependabot-alert-reconciliation-2026-11.md`.

**Interfaces:** Produces one row per current alert: number, advisory, manifest, vulnerable range, installed version on main, fixed version, and disposition.

- [ ] **Step 1:** Fetch main and query open alerts after GitHub's post-merge analysis. Record the exact main commit.
- [ ] **Step 2:** For each alert, compare all referenced manifests and installed lockfile versions to the advisory's vulnerable range; cross-check with `npm run audit:dependencies`.
- [ ] **Step 3:** Classify as actionable, already fixed but still reported, or unresolved due missing evidence; record the basis without credentials or raw payloads.

### Task 2: Resolve only verified stale alerts

**Files:** Update the reconciliation note with final outcomes.

**Interfaces:** Consumes Task 1's evidence. Produces a current GitHub alert state with unresolved risk left visible.

- [ ] **Step 1:** Re-query alerts after the repository graph refresh; allow automatically closed alerts to stand.
- [ ] **Step 2:** For any still-open fixed alert, investigate manifest mismatch or stale dependency graph. Use GitHub's documented dismissal reason only after confirming a fixed installed version and obtaining external-action approval.
- [ ] **Step 3:** Re-run audit and record remaining open alerts and their owners; commit the evidence note as `docs: reconcile dependency security alerts`.

# Beta Operations & Release Evidence Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Prove everything provable locally for beta readiness, fix the rehearsal script to the current RPO/RTO targets, and record every remaining requirement as a named external gate so the release stays honestly HOLD.

**Architecture:** Two automated gates carry this lane: a database hardening audit (every table forced-RLS, every function fixed-`search_path`, least-privilege grants, mutator containment) executed against the PGlite-replayed trusted chain; and a beta-readiness matrix mapping each design §4.5 requirement to current evidence or a named external gate (provider, device, human owner). The rehearsal script is corrected to RPO ≤1h / RTO ≤4h with tombstone reapplication and RLS re-validation steps; live rehearsal itself stays an external gate (needs a production project + Docker).

**Tech Stack:** TypeScript 7, Vitest 5, PGlite, Supabase CLI 2.117, Bash, Markdown.

**Spec:** `docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md` §4.5/§13, `StrandCue-PRD-v1.1-audit.md` §28

## Global Constraints

- The release stays HOLD until a recorded gate review changes it.
- “Not run” is reported as `External gate`, never as pass.
- RPO ≤1 hour, RTO ≤4 hours (PRD authority; the older 24h/8h targets are retired everywhere).
- No credentials, tokens, project refs or personal data in scripts, flows or tests.
- Tombstones are reapplied before service reopens after any restore.

## Review Focus

- A table without forced RLS or a function without fixed `search_path` must fail the hardening audit.
- An `authenticated` write grant on any revision/event/link/operations table must fail the audit.
- A rehearsal script mentioning the retired 8h target must fail its contract test.
- A readiness row claiming evidence without a linked, passing check must fail the matrix test.

---

### Task 1: Database hardening audit

**Files:**
- Create: `tests/database/hardening.test.ts`
- Test: `tests/database/hardening.test.ts`

- [ ] Step 1: Write failing audit (all public tables forced-RLS; all routines fixed search_path; anon zero privileges; mutator containment; authenticated denied writes on immutable tables)
- [ ] Step 2: Run — expect FAIL, fix whatever it finds (code first, test second only if the test is wrong)
- [ ] Step 3: Suite PASS with passport/services/activity/shelf/tools/export/deletion suites
- [ ] Step 4: Commit `test: database hardening audit`

---

### Task 2: Rehearsal script correction + contract

**Files:**
- Modify: `scripts/backup-restore.sh`
- Create: `tests/tooling/rehearsal.test.ts`
- Test: `tests/tooling/rehearsal.test.ts`

- [ ] Step 1: Write failing contract test (RPO≤1h/RTO≤4h constants, tombstone reapply step, RLS re-validation step, no stale targets, no credentials)
- [ ] Step 2: Run — expect FAIL
- [ ] Step 3: Fix script (typo, 4h SLA + 1h RPO check, reapply + RLS-validate steps, dry-run safe)
- [ ] Step 4: Contract PASS + `bash -n` syntax clean
- [ ] Step 5: Commit `fix: rehearse to current recovery targets`

---

### Task 3: Beta readiness matrix + contract

**Files:**
- Create: `docs/verification/beta-readiness.md`
- Create: `tests/tooling/beta-readiness.test.ts`

- [ ] Map every §4.5 requirement to evidence or a named external gate; release HOLD
- [ ] Contract test enforces vocabulary + named gates + no stale targets
- [ ] Commit `docs: beta readiness matrix`

---

### Task 4: Final gate review

- [ ] Clean tree, `npm run verify`, `git diff --check`, security-sensitive diff review
- [ ] Record review outcome, commit `docs: record beta baseline review`

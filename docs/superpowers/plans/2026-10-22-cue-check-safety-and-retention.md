# Cue Check safety and retention implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make reaction collection dormant while preserving history, and expire private Cue Check operation receipts after 30 days.

**Architecture:** Keep the stored Cue Check contract unchanged. Filter the dormant field at the new-entry question and summary boundaries, then add one service-role-only cleanup RPC to the established scheduled retention pipeline.

**Tech stack:** TypeScript, React Native, Zod, PostgreSQL/Supabase migrations, Cloudflare Worker, Vitest and PGlite.

**Spec:** `docs/superpowers/specs/2026-10-22-cue-check-safety-and-retention-design.md`

## Global constraints

- Use Node 24.19.x.
- Test first and keep every changed logic file above 80% in statements, branches, functions and lines.
- Preserve historical `immediateReaction` values and their owner-only display.
- Do not publish content, invent safety guidance, or change recommendation ranking.
- Do not apply migrations or change hosted services.

## Review focus

- Existing reaction answers remain readable but cannot be entered or summarized.
- A correction silently preserves an existing dormant answer unless the owner changes another field.
- The exact 30-day boundary survives; only strictly older receipts purge.
- Cleanup cannot remove Cue Checks, revisions, confirmed steps, notes or another owner's active data.
- Consumers cannot execute the cleanup routine and metrics contain counts only.

---

### Task 1: Make reaction collection dormant

**Files:**
- Modify: `apps/mobile/src/cue-check-copy.ts`
- Modify: `apps/mobile/src/CueCheckForm.tsx`
- Modify: `packages/domain/src/personal-outcome-summary.ts`
- Test: `tests/mobile/cue-check-form.test.tsx`
- Test: `tests/domain/personal-outcome-summary.test.ts`

**Interfaces:**
- Consumes: the existing stored `immediateReaction` field and historical `questionFor`/`answerLabel` display.
- Produces: `questionsFor(timing)` without the dormant field and summaries that never emit it.

- [ ] Add failing tests proving new/correction forms omit the question, historical labels remain available, and summaries exclude old reaction answers.
- [ ] Run the focused tests and record the expected failures.
- [ ] Filter the field from `questionsFor`, remove form-only reaction messaging, and exclude the field from summary iteration without changing stored schemas.
- [ ] Run focused tests and confirm green.
- [ ] Commit the behavior change.

### Task 2: Add 30-day receipt retention

**Files:**
- Create: `supabase/migrations/20261024110000_cue_check_operation_retention.sql`
- Create: `tests/database/cue-check-retention.test.ts`
- Modify: `tests/database/migration-inventory.test.ts`

**Interfaces:**
- Produces: `public.cue_check_operation_retention_cleanup(p_as_of timestamptz) returns integer`.

- [ ] Add failing database tests for strict boundary behavior, owner-independent cleanup, preserved Cue Check content, invalid as-of, grants and rerun safety.
- [ ] Run the database test and record RED.
- [ ] Add the forward-only migration with a service-role-only security-definer cleanup function.
- [ ] Run database tests and confirm green.
- [ ] Commit the migration and database proof.

### Task 3: Wire cleanup into the existing scheduler

**Files:**
- Modify: `workers/account-deletion/src/retention.ts`
- Modify: `workers/account-deletion/src/index.ts`
- Modify: `tests/tooling/retention-cleanup.test.ts`
- Modify: `tests/tooling/scheduled-independence.test.ts`

**Interfaces:**
- Extends: `RetentionCounts` and `RetentionMetric` with `cueCheckOperationsPurged: number`.

- [ ] Add failing worker tests for RPC order, explicit as-of, count parsing, fixed failures and redacted metrics.
- [ ] Run the worker tests and record RED.
- [ ] Call the new RPC after consent cleanup and include its count in success/failure metrics.
- [ ] Run worker tests and confirm green.
- [ ] Commit worker wiring.

### Task 4: Record governance and verify

**Files:**
- Modify: `docs/runbooks/privacy-retention.md`
- Modify: `docs/verification/privacy-matrix-2026-10-15.md`
- Modify: Increment 4 status/report and requirement traceability where present.

- [ ] Record the dormant reaction ruling, historical compatibility, 30-day idempotency window, retained Cue Check content and hosted-deployment HOLD.
- [ ] Run focused suites, typecheck, lint, full coverage, web export, control-plane audit, dependency audit and `git diff --check`.
- [ ] Report dependency findings as HOLD unless the audit actually passes.
- [ ] Review correctness, security/privacy and accessibility/plain language; fix Medium or higher findings test-first.
- [ ] Commit documentation and the final verified state.

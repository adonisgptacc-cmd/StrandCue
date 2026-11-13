# Bitemporal Activity Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Today’s mutable activity list/detail reads with an owner-scoped bitemporal history feed that separates effective time from recorded time and preserves exact recommendation replay.

**Architecture:** A new Supabase RPC pages activity identities by immutable baseline time and returns revisions known by an explicit recorded-time cutoff. A strict mobile boundary validates those histories, the existing domain projector applies corrections and voids at the effective date, and the guidance snapshot stores only allowlisted primitive facts plus applied revision provenance. Existing activity editor/read APIs remain unchanged.

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, PGlite integration tests, TypeScript 6, Zod 4, Expo/Supabase JS, Vitest 5, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-11-bitemporal-activity-guidance-design.md`

## Global Constraints

- Use Node `>=24.0.0 <25.0.0`; verify with Node 24.19.0.
- Generate the migration with `npx supabase migration new bitemporal_activity_guidance`; do not invent a migration timestamp. Use the CLI-generated file everywhere this plan says `<bitemporal migration>`.
- Keep all source-table reads owner-scoped and require an active account inside the private core.
- The public RPC wrapper is `SECURITY INVOKER`; the private core uses fixed `search_path = ''`, derives the owner from `strandcue_private.request_uid()`, and validates authentication itself.
- Revoke default function execution before granting only the roles required by the repository’s invoker-wrapper convention.
- Do not modify `get_activity`, `list_activities`, activity mutation behavior, or existing editor screens.
- Do not publish recommendation content, deploy a migration, push, merge, or change hosted Supabase.
- Do not store activity notes, correction reasons, void reasons, account metadata, tokens, or operation keys in recommendation input.
- Preserve immutable inputs and maintain at least 80% coverage on every changed logic file.

## Review Focus

- A correction inserted between page 1 and page 2 must not reorder, duplicate, or skip an activity; Task 2 pins this with an inter-page correction test.
- A correction or void exactly on the recorded cutoff must be included, while one one microsecond later must be excluded; Tasks 2 and 4 pin both boundaries.
- Database precision values `exact_day`, `exact_month`, `exact_year`, and `unknown` must map to the domain’s `day`, `month`, `year`, and `unknown`; Tasks 2 and 3 test all four.
- Malformed histories, ambiguous projections, unexpected fields, broken sequences, and incomplete pagination must fail the entire activity source closed; Tasks 3 and 4 cover these cases.
- Anonymous, inactive, and cross-owner callers must receive no activity history, and default function grants must not expose the definer core; Task 2 verifies authorization and catalog grants.

---

### Task 1: Define the bitemporal mobile and guidance contracts

**Files:**
- Create: `apps/mobile/src/guidance/guidance-activity-api.ts`
- Modify: `packages/domain/src/guidance/types.ts`
- Modify: `packages/domain/src/guidance/schemas.ts`
- Modify: `packages/domain/src/guidance/index.ts`
- Test: `tests/domain/guidance/schemas.test.ts`
- Test: `tests/mobile/guidance-activity-api.test.ts`

**Interfaces:**
- Produces: `GuidanceActivityCursor = { readonly baselineRecordedAt: string; readonly activityId: string }`.
- Produces: `GuidanceActivityHistory = { readonly activityId: string; readonly revisions: readonly ActivityRevision[] }`.
- Produces: `GuidanceActivityHistoryPage = { readonly items: readonly GuidanceActivityHistory[]; readonly nextCursor: GuidanceActivityCursor | null }`.
- Produces: `listGuidanceActivityHistories(effectiveAsOf: string, recordedAsOf: string, options?: { limit?: number; cursor?: GuidanceActivityCursor | null }): Promise<GuidanceActivityHistoryPage>`.
- Extends: `GuidanceActivityFact` with `appliedRevisionIds: readonly string[]`; `revision` remains the highest included sequence.

- [ ] **Step 1: Write failing strict-schema tests**

Add tests that assert:

```ts
expect(GuidanceActivityFactSchema.parse({
  activityId: ACTIVITY_ID,
  revision: 2,
  voided: false,
  appliedRevisionIds: [BASELINE_ID, CORRECTION_ID],
  facts: { activityKind: 'wash', precision: 'exact_day', status: 'active' },
})).toBeDefined();
```

Also reject duplicate `appliedRevisionIds`, unknown fact structures, extra fields, invalid cursor timestamps, histories with zero revisions, mixed activity IDs, and responses containing extra keys.

- [ ] **Step 2: Run the contract tests and confirm RED**

Run: `npm test -- --run tests/domain/guidance/schemas.test.ts tests/mobile/guidance-activity-api.test.ts`

Expected: FAIL because the new schemas, type field, and API function do not exist.

- [ ] **Step 3: Implement strict contracts and the RPC boundary**

Use `ActivityRevisionSchema` for every revision. The API calls `public.list_guidance_activity_histories` with exact PostgREST arguments:

```ts
{
  p_effective_as_of: effectiveAsOf,
  p_recorded_as_of: recordedAsOf,
  p_limit: limit,
  p_cursor: cursor,
}
```

Parse dates with `z.iso.date()` and timestamps with offset-aware `z.iso.datetime({ offset: true })`. Default the limit to 100 and cap it at 100. Do not accept or send an owner ID.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run tests/domain/guidance/schemas.test.ts tests/mobile/guidance-activity-api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
feat: define bitemporal activity guidance contracts
```

### Task 2: Add the owner-scoped bitemporal activity RPC

**Files:**
- Create via CLI: `supabase/migrations/<CLI-generated>_bitemporal_activity_guidance.sql` (`<bitemporal migration>`)
- Create: `tests/database/guidance-activity-history.test.ts`
- Modify: `tests/database/migration-inventory.test.ts`

**Interfaces:**
- Consumes: the response names and precision mapping from Task 1.
- Produces: `strandcue_private.list_guidance_activity_histories_core(date, timestamptz, integer, jsonb) returns jsonb`.
- Produces: `public.list_guidance_activity_histories(date, timestamptz, integer default 100, jsonb default null) returns jsonb`.

- [ ] **Step 1: Create the migration through the Supabase CLI**

Run:

```text
npx supabase --version
npx supabase migration new bitemporal_activity_guidance
```

Record the generated filename in the task handoff and add that exact basename to `trustedMigrationNames`.

- [ ] **Step 2: Write failing database tests**

Use `tests/database/harness.ts` and fixed trusted inserts. Cover:

- owner A receives only owner A histories; owner B cannot infer their IDs;
- anonymous, unverified/inactive, and deleted accounts are rejected;
- baseline after `p_recorded_as_of` is absent;
- correction/void at the cutoff is included and one microsecond later is excluded;
- every revision is ordered by `sequence` and contains the strict Task 1 fields;
- all four precision mappings produce exact truncated values (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`, `null`);
- page size defaults to 100, rejects 0 and 101, and returns at most 100;
- the cursor accepts exactly `{baselineRecordedAt, activityId}` and rejects missing, extra, malformed, non-finite, and foreign-owner values without leaking existence;
- a correction inserted after page 1 does not move the activity or change page membership for the fixed cutoff;
- public/anon lack execution, authenticated has wrapper execution, and the private core has no `PUBLIC`/anon execution;
- the baseline and revision access-path indexes exist.

- [ ] **Step 3: Run the database test and confirm RED**

Run: `npm test -- --run tests/database/guidance-activity-history.test.ts tests/database/migration-inventory.test.ts`

Expected: FAIL because the CLI-generated migration is empty and the RPC does not exist.

- [ ] **Step 4: Implement the migration**

In `<bitemporal migration>`:

- add partial index `(owner, recorded_at desc, activity_id desc) where kind = 'baseline'`;
- add revision index `(owner, activity_id, recorded_at, sequence)`;
- validate non-null finite cutoffs, `p_effective_as_of`, `p_recorded_as_of <= transaction_timestamp()`, limit, and exact cursor shape;
- verify `profiles.account_status = 'active'` for `request_uid()`;
- page baseline identities by `(recorded_at, activity_id)` descending with `limit + 1`;
- aggregate revisions where `recorded_at <= p_recorded_as_of`, ordered by sequence;
- map precision and truncate the effective value exactly as specified;
- build discriminated revision JSON, emitting correction/void fields only for their matching kinds;
- omit owner UUIDs and operation data from the response;
- apply the repository’s definer-core/invoker-wrapper ownership and grant sequence.

- [ ] **Step 5: Run database tests and verify GREEN**

Run: `npm test -- --run tests/database/guidance-activity-history.test.ts tests/database/migration-inventory.test.ts tests/database/activity.test.ts tests/database/hardening.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat: expose bitemporal activity histories
```

### Task 3: Project histories into safe guidance facts

**Files:**
- Modify: `apps/mobile/src/guidance/guidance-snapshot.ts`
- Modify: `tests/mobile/guidance-snapshot.test.ts`

**Interfaces:**
- Consumes: `listGuidanceActivityHistories` from Task 1.
- Consumes: `projectActivityHistory(revisions, { asOf })` from `packages/domain/src/activity.ts`.
- Produces: `loadActivityFacts(effectiveAsOf: string, recordedAsOf: string, signal?: AbortSignal)` through the existing private module boundary.

- [ ] **Step 1: Replace activity mocks and write failing projection tests**

Remove `listActivities`/`getActivity` from the guidance-snapshot mocks. Assert:

- `listGuidanceActivityHistories` receives `effectiveAsOf = asOf.slice(0, 10)` and `recordedAsOf = loadedAt`;
- a correction before the cutoff changes projected facts;
- a correction after the cutoff is absent from the response and cannot affect projection;
- a void before the cutoff returns `voided: true`, empty facts, and the relevant revision provenance;
- an ambiguous field makes `completeness.activities === 'failed'` and returns no partial activity list;
- facts contain only `activityKind`, `precision`, and `status`; notes and zones never enter facts;
- `revision` equals the highest included sequence and `appliedRevisionIds` are preserved;
- multi-page reads, cancellation, malformed histories, network errors, and the 500-item ceiling remain fail closed;
- neither `listActivities` nor `getActivity` is imported or called by this module.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/mobile/guidance-snapshot.test.ts`

Expected: FAIL because the loader still uses current-state list/detail calls.

- [ ] **Step 3: Implement bitemporal loading**

Replace `loadActivityFacts(asOfDate, signal)` with `loadActivityFacts(asOfDate, loadedAt, signal)`. Page the new API through the existing bounded `collectPages`, project each validated history with `projectActivityHistory`, reject non-empty `ambiguousFields`, and create immutable guidance facts using an explicit allowlist.

Remove the activity-specific use of `mapWithConcurrency`, `getActivity`, and `listActivities`. Keep `mapWithConcurrency` for Shelf and Tools.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run tests/mobile/guidance-snapshot.test.ts tests/mobile/today-guidance-service.test.ts tests/domain/activity.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
feat: project bitemporal activities for today
```

### Task 4: Prove cutoff semantics through Today and persistence

**Files:**
- Modify: `tests/mobile/today-guidance-service.test.ts`
- Modify: `tests/mobile/today-guidance.test.tsx`
- Modify if required by strict types: `apps/mobile/src/guidance/today-guidance-service.ts`
- Modify if required by strict types: `apps/mobile/src/TodayGuidance.tsx`

**Interfaces:**
- Consumes: the `GuidanceSnapshot` produced by Task 3.
- Preserves: `GuidanceProvenance.input` as the exact normalized `RecommendationContext` hashed by `inputFingerprint`.

- [ ] **Step 1: Add regression tests for reproducibility and data minimization**

Assert that a generated result:

- carries activity facts derived from the supplied cutoffs;
- hashes the exact JSON later passed to `recordRecommendationRun.input`;
- persists applied activity values but no notes, zones, correction reasons, or void reasons;
- remains byte-equivalent when source histories arrive in a different order;
- does not regenerate or re-read sources if persistence fails.

- [ ] **Step 2: Run and confirm the tests expose any integration gaps**

Run: `npm test -- --run tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx`

Expected: PASS if Task 3’s contract threads through unchanged, otherwise FAIL only at the mismatched boundary.

- [ ] **Step 3: Make the minimal boundary correction if RED**

Do not add a second fingerprint or a reconstructed replay path. The stored `input` remains the exact object hashed and executed.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/database/recommendation-runs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit only if files changed**

```text
test: prove bitemporal guidance replay
```

### Task 5: Update governance and verification evidence

**Files:**
- Modify: `docs/product/requirement-traceability.md`
- Modify: `docs/verification/today-guidance-integration.md`
- Modify: `docs/runbooks/guidance-content-publication.md` only if it currently claims mutable activity reconstruction
- Test: `tests/tooling/guidance-governance.test.ts`

**Interfaces:**
- Consumes: final RPC/API names and verified test evidence from Tasks 1–4.
- Produces: an accurate integration-review record with the remaining product-content gap separated from the completed activity-history work.

- [ ] **Step 1: Write failing governance assertions**

Require the documents to state:

- activity guidance uses both effective and recorded cutoffs;
- stored normalized input, not mutable source reconstruction, is replay authority;
- migration remains local until hosted application is separately approved;
- production recommendation content remains draft and empty;
- product/tool evidence research is the next independent milestone.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/tooling/guidance-governance.test.ts`

Expected: FAIL on missing bitemporal evidence text.

- [ ] **Step 3: Update the documents without overstating deployment**

Record exact commands and observed results. Do not mark hosted migration, real guidance, TD-07, or TD-08 complete.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/tooling/guidance-governance.test.ts tests/database/migration-inventory.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
docs: verify bitemporal today guidance
```

### Task 6: Whole-branch integration and security review

**Files:**
- Modify only files required to resolve confirmed review findings.
- Add regression tests beside each confirmed fix.

**Interfaces:**
- Reviews all changes from `codex/core-guidance-integration` through HEAD.
- Produces a local-only acceptance report and a clean branch ready for the user’s push/merge decision.

- [ ] **Step 1: Review the complete branch diff**

Check:

- SQL injection and JSON construction safety;
- definer ownership, fixed search paths, default grants, wrapper grants, active-account checks, and owner derivation;
- cursor validation and immutable ordering;
- exact cutoff inclusivity and clock handling;
- response size bounds and worst-case 500-history behavior;
- strict schemas, cancellation, malformed data, ambiguity, and no partial guidance;
- exact stored-input/fingerprint equality and absence of free-form reasons/notes;
- no use of service-role or secret keys in the client.

- [ ] **Step 2: Run focused security and integration tests**

Run:

```text
npm test -- --run tests/database/guidance-activity-history.test.ts tests/database/hardening.test.ts tests/database/recommendation-runs.test.ts tests/mobile/guidance-activity-api.test.ts tests/mobile/guidance-snapshot.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Fix confirmed findings using RED/GREEN tests**

Reject speculative changes that weaken the existing invoker-wrapper convention. Every accepted finding gets a reproducing test before its fix.

- [ ] **Step 4: Run the complete Node 24 gate**

Run:

```text
node --version
npm run verify:offline
npm run audit:dependencies
git diff --check codex/core-guidance-integration...HEAD
```

Expected:

- Node `v24.19.0` or another supported Node 24 release;
- all tests pass with at least 80% coverage on every changed logic file;
- dependency policy passes with zero critical findings;
- no whitespace errors.

- [ ] **Step 5: Verify migration state without deploying**

Run:

```text
npx supabase migration list --local
```

If the local Supabase runtime is unavailable, retain the successful PGlite evidence and report that limitation. Do not link or push a hosted project.

- [ ] **Step 6: Commit review fixes and write the handoff**

```text
fix: address bitemporal guidance review findings
```

The handoff must list commits, changed files by task, exact test counts, coverage, dependency findings, migration status, rejected review findings with reasons, and remaining gaps.

## Follow-on boundary

After this plan passes integration review, start a separate specification and plan for product/tool evidence. That project must inventory exact catalogue version IDs, gather primary manufacturer and independent safety evidence, record reviewer/date/provenance, define capability vocabulary, and publish the first `basic_wash` rule only after its content review gate passes. It must not be folded into this database-history branch.

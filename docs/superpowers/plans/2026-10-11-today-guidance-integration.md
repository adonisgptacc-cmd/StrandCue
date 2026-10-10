# Today Guidance Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Today to the owner’s existing Hair Passport, chemical services, activities, Shelf, and Tools; prepare a versioned recommendation request; generate only exact-version reviewed guidance; explain missing information and “no purchase needed”; and persist a private reproducibility audit.

**Architecture:** Add a pure domain preparation layer between existing records and `generateProtocol`, plus a mobile snapshot loader that composes the existing owner-scoped APIs. A checked-in reviewed-content registry is the only bridge from product/tool version IDs to recommendation capabilities and published rules. Today renders a state machine (`loading`, `needs_setup`, `ready`, `blocked`, `error`) and persists immutable decision runs through a new owner-scoped Supabase RPC; it never invents capabilities or executes draft content.

**Tech Stack:** TypeScript strict mode, Zod 4, React Native/Expo, Supabase/PostgreSQL RPC and RLS, Vitest, React Test Renderer, PGlite database tests.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` — primarily `HP-01`–`HP-06`, `SH-01`–`SH-09`, `TL-01`–`TL-06`, `EN-01`–`EN-09`, `TD-01`–`TD-09`, `SF-01`–`SF-05`, `EV-01`–`EV-07`, `PR-01`–`PR-05`, and `UX-01`–`UX-05`.

## Global Constraints

- Start from `codex/core-guidance-integration` at or after commit `fa7353a`; do not use `main` or `codex/core-guidance-engine` as the base.
- Create `codex/today-guidance-integration`; preserve unrelated untracked files and local changes.
- Read `AGENTS.md`, the canonical specification, `docs/product/requirement-traceability.md`, and this plan before editing.
- Node 24 is required. If system Node is not 24.x, prepend `C:\Users\ABADO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin` to `PATH`.
- Use RED → GREEN → REFACTOR and maintain at least 80% statements, branches, functions, and lines for every new domain module.
- Use only existing owner-scoped API functions. Do not weaken RLS, add service-role access to mobile, or read another owner’s data.
- Do not infer product/tool capabilities from names, categories, free text, images, brands, or model output.
- Only an exact `versionId` in a published reviewed registry may supply verified capabilities.
- Draft, withdrawn, expired, malformed, or unknown registry entries cannot generate guidance.
- The production reviewed registry starts with no enabled real product or tool mappings unless an approved content artifact already exists in the repository. Synthetic mappings belong only in tests.
- The UI may demonstrate plumbing with synthetic fixtures in tests; release code must not expose a fake protocol or synthetic product.
- Missing safety facts stop guidance and produce a concrete setup action.
- Keep the Technical Alpha banner. Do not claim public readiness.
- Guidance remains cosmetic and brand-neutral. Do not diagnose, prescribe medical treatment, guarantee outcomes, or rank by affiliate/commercial variables.
- No deployment, hosted migration application, push, merge, APK build/upload, or external-service modification is part of this plan.

## Review Focus

- **Partial pagination:** if any source exceeds the bounded snapshot or a detail fails, Today must show incomplete-data setup instead of generating from a partial snapshot; Task 3 tests this.
- **Version mismatch:** an owned item whose `versionId` is absent from the reviewed registry must remain unknown and must never satisfy a required capability; Tasks 2 and 4 test this.
- **Concurrent refresh/generation:** a late response from an older request must not overwrite the current owner or goal; Task 7 tests request epochs and unmount behavior.
- **Persistence replay/conflict:** the same request ID and input fingerprint is idempotent, while the same request ID with different content is rejected; Task 6 tests this at domain and database boundaries.
- **Safety stop:** incomplete chemical-service presence or a reviewed red-flag fact must prevent a ready protocol and must not be converted into a generic fallback; Tasks 4 and 7 test this.

---

## OpenCode entry prompt

```text
Work in C:\Users\ABADO\.codex\worktrees\repo-recovery-integration\StrandCue.

Verify that codex/core-guidance-integration contains fa7353a, then create codex/today-guidance-integration from it. Do not work from main or codex/core-guidance-engine.

Read AGENTS.md, docs/superpowers/specs/2026-10-10-canonical-product-spec.md, docs/product/requirement-traceability.md, and docs/superpowers/plans/2026-10-11-today-guidance-integration.md. Execute the plan task by task with TDD and the specified commits. Preserve unrelated untracked files. Do not invent product capabilities, evidence, or hair-care claims. Do not deploy, push, merge, or modify hosted services. Finish with the exact verification and handoff required by Task 9.
```

### Task 1: Define the Today guidance contracts

**Files:**
- Create: `packages/domain/src/guidance/types.ts`
- Create: `packages/domain/src/guidance/schemas.ts`
- Create: `packages/domain/src/guidance/index.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `tests/domain/guidance/schemas.test.ts`

**Interfaces:**
- Consumes: existing `RecommendationRule`, `ProtocolDecision`, and candidate types from `packages/domain/src/recommendations`.
- Produces: `GuidanceSnapshot`, `ReviewedGuidanceBundle`, `GuidanceGoal`, `GuidancePreparation`, and strict Zod schemas for later tasks.

- [ ] **Step 1: Write failing schema tests**

Test strict parsing, unknown-key rejection, duplicate IDs, invalid ISO timestamps, unsupported bundle versions, and immutable parsed output for these contracts:

```ts
type GuidanceGoalId = 'basic_wash';

interface GuidanceSourceItem {
  readonly ownerItemId: string;
  readonly versionId: string | null;
  readonly name: string;
  readonly availability: 'available' | 'out_of_stock' | 'archived';
  readonly revision: number;
}

interface GuidanceServiceFact {
  readonly serviceId: string;
  readonly currentPresence: 'present' | 'not-present' | 'unknown';
  readonly effectiveStart: string | null;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
}

interface GuidanceActivityFact {
  readonly activityId: string;
  readonly revision: number;
  readonly voided: boolean;
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;
}

interface GuidanceGoal {
  readonly id: GuidanceGoalId;
  readonly label: string;
  readonly requiredProfileFacts: readonly string[];
}

interface GuidanceSnapshot {
  readonly ownerId: string;
  readonly asOf: string;
  readonly loadedAt: string;
  readonly passportFacts: Readonly<Record<string, string | number | boolean | null>>;
  readonly services: readonly GuidanceServiceFact[];
  readonly activities: readonly GuidanceActivityFact[];
  readonly products: readonly GuidanceSourceItem[];
  readonly tools: readonly GuidanceSourceItem[];
  readonly completeness: Readonly<Record<'passport' | 'services' | 'activities' | 'products' | 'tools', 'complete' | 'missing' | 'truncated' | 'failed'>>;
}

interface ReviewedCapabilityEntry {
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly displayName: string;
  readonly verifiedCapabilities: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly status: 'published' | 'withdrawn';
  readonly reviewedAt: string;
}

interface ReviewedGuidanceBundle {
  readonly bundleId: string;
  readonly version: string;
  readonly status: 'draft' | 'published' | 'withdrawn';
  readonly reviewedAt: string;
  readonly goals: readonly GuidanceGoal[];
  readonly capabilities: readonly ReviewedCapabilityEntry[];
  readonly rules: readonly RecommendationRule[];
}

type GuidancePreparation =
  | { readonly status: 'ready'; readonly context: RecommendationContext; readonly bundleId: string; readonly bundleVersion: string }
  | { readonly status: 'needs_setup'; readonly missing: readonly GuidanceGap[] }
  | { readonly status: 'unavailable'; readonly reason: 'bundle_not_published' | 'snapshot_incomplete' | 'no_supported_goal' };
```

`GuidanceGap.kind` is a closed enum: `hair_profile`, `service_presence`, `product_version`, `product_capability`, `tool_version`, `tool_capability`, `source_incomplete`, `reviewed_content`.

- [ ] **Step 2: Run the schema test and confirm RED**

Run: `npm test -- --run tests/domain/guidance/schemas.test.ts`

Expected: FAIL because the guidance module does not exist.

- [ ] **Step 3: Implement the strict schemas and exports**

Use `.strict()` on objects, non-empty trimmed IDs, finite numbers, unique `(kind, versionId)` registry keys, unique rule versions, and evidence required for every published capability entry and rule.

- [ ] **Step 4: Run the test and typecheck**

Run: `npm test -- --run tests/domain/guidance/schemas.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
feat: define today guidance contracts
```

### Task 2: Add the reviewed-content publication gate

**Files:**
- Create: `packages/domain/src/guidance/reviewed-content.ts`
- Create: `apps/mobile/src/guidance/reviewed-bundle.ts`
- Test: `tests/domain/guidance/reviewed-content.test.ts`

**Interfaces:**
- Consumes: `ReviewedGuidanceBundleSchema` from Task 1.
- Produces: `validatePublishedBundle(input: unknown, now: string): ReviewedGuidanceBundle` and `CURRENT_REVIEWED_BUNDLE`.

- [ ] **Step 1: Write failing publication-gate tests**

Assert that:

- draft and withdrawn bundles cannot execute;
- a withdrawn capability entry cannot supply capabilities;
- every published rule and capability entry has evidence IDs;
- duplicate version mappings are rejected;
- `reviewedAt` cannot be later than the explicit `now` argument;
- the same parsed bundle produces byte-equivalent normalized JSON;
- `CURRENT_REVIEWED_BUNDLE` contains no synthetic item, fabricated evidence, enabled real version mapping, or published rule unless an approved content artifact is cited.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/domain/guidance/reviewed-content.test.ts`

- [ ] **Step 3: Implement the gate and production registry**

`CURRENT_REVIEWED_BUNDLE` must be a valid `draft` bundle with `capabilities: []` and `rules: []` unless repository evidence already proves approved real content. Test fixtures may construct a published synthetic bundle in the test file. Never add `Fixture`, fake UUID, or test evidence to production code.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/domain/guidance/reviewed-content.test.ts && npm run typecheck`

```text
feat: gate guidance on reviewed content
```

### Task 3: Load a complete owner snapshot through existing APIs

**Files:**
- Create: `apps/mobile/src/guidance/guidance-snapshot.ts`
- Test: `tests/mobile/guidance-snapshot.test.ts`
- Modify only if required for exported types: `apps/mobile/src/passport-api.ts`, `services-api.ts`, `activity-api.ts`, `shelf-api.ts`, `tool-api.ts`

**Interfaces:**
- Consumes: `loadPassport`, `loadServices`, `listActivities`, `getActivity`, `listUserProducts`, `getUserProduct`, `listUserTools`, `getUserTool`.
- Produces: `loadGuidanceSnapshot(ownerId: string, asOf: string, loadedAt: string, signal?: AbortSignal): Promise<GuidanceSnapshot>`.

- [ ] **Step 1: Write failing snapshot-loader tests**

Mock all API boundaries and assert:

- every list is paginated using `nextCursor` until complete;
- product, tool, and activity details are loaded with a concurrency limit of four;
- archived and out-of-stock items remain in the snapshot with their exact availability;
- matched `versionId` values are preserved exactly; manual items retain `versionId: null`;
- Passport projection values are copied, not mutated;
- service presence and effective dates are preserved without inference;
- a failed detail marks that source `failed`; a page beyond 500 items marks it `truncated`;
- `AbortError` propagates and no later result is applied;
- no partial failure is reported as `complete`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/mobile/guidance-snapshot.test.ts`

- [ ] **Step 3: Implement the bounded loader**

Use copied arrays, stable ordering by owner item ID, pages of 100, a 500-item source ceiling, and a four-worker detail queue. Do not add a new database RPC in this task.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/mobile/guidance-snapshot.test.ts && npm run typecheck`

```text
feat: load complete today guidance snapshots
```

### Task 4: Prepare safe recommendation inputs

**Files:**
- Create: `packages/domain/src/guidance/prepare-guidance.ts`
- Test: `tests/domain/guidance/prepare-guidance.test.ts`
- Modify: `packages/domain/src/guidance/index.ts`

**Interfaces:**
- Consumes: `GuidanceSnapshot`, a published `ReviewedGuidanceBundle`, `goalId`, `requestId`, and explicit `asOf`.
- Produces: `prepareGuidance(input: PrepareGuidanceInput): GuidancePreparation`.

- [ ] **Step 1: Write failing preparation tests**

Cover:

- exact product/tool version matches acquire only their registry capabilities and evidence;
- unmatched, null, withdrawn, or differently versioned items acquire none;
- archived/out-of-stock items become unavailable candidates;
- incomplete sources return `unavailable: snapshot_incomplete`;
- a draft/withdrawn bundle returns `unavailable: bundle_not_published`;
- absent Passport facts and unknown chemical-service presence return sorted `needs_setup` gaps;
- active or unknown chemical services never silently receive an ordinary fallback when the bundle lacks an applicable reviewed safety rule;
- a fully eligible synthetic snapshot produces a valid `RecommendationContext` accepted by `generateProtocol`;
- reordered source collections produce byte-equivalent context JSON;
- input objects remain deeply equal to pre-call clones.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/domain/guidance/prepare-guidance.test.ts`

- [ ] **Step 3: Implement the pure adapter**

Namespace facts as `profile.*`, `service.*`, `history.*`, and `environment.*`; do not merge duplicate unqualified keys. Candidate IDs remain owner item IDs, while candidate `versionId` remains the reviewed catalogue version. Set product `owned: true`; derive availability only from recorded availability. Copy the published bundle’s rules without rewriting them.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/domain/guidance/prepare-guidance.test.ts tests/domain/recommendations && npm run typecheck`

```text
feat: prepare safe guidance inputs
```

### Task 5: Add the Today orchestration service

**Files:**
- Create: `apps/mobile/src/guidance/today-guidance-service.ts`
- Test: `tests/mobile/today-guidance-service.test.ts`

**Interfaces:**
- Consumes: `loadGuidanceSnapshot`, `CURRENT_REVIEWED_BUNDLE`, `prepareGuidance`, and `generateProtocol`.
- Produces: `generateTodayGuidance(request: TodayGuidanceRequest): Promise<TodayGuidanceResult>`.

- [ ] **Step 1: Write failing orchestration tests**

`TodayGuidanceResult` is a closed union: `needs_setup`, `content_pending`, `ready`, `needs_input`, `rule_conflict`, `unsupported`, `source_error`.

Assert that the service:

- never calls `generateProtocol` unless preparation is `ready`;
- maps engine statuses without hiding `missingInputs`, conflicts, evidence, or `noPurchaseNeeded`;
- returns `content_pending` for the production draft bundle;
- includes `inputFingerprint`, engine version, bundle ID/version, and snapshot `asOf` in every generated result;
- hashes normalized context JSON with SHA-256 through an injected `hashText(text)` function;
- remains deterministic for the same explicit inputs;
- converts network errors to `source_error` but rethrows `AbortError`.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/mobile/today-guidance-service.test.ts`

- [ ] **Step 3: Implement orchestration**

Accept explicit dependencies in tests and default production dependencies in the exported wrapper. Do not read the clock inside the service; request supplies `asOf`, `loadedAt`, and `requestId`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/mobile/today-guidance-service.test.ts && npm run typecheck`

```text
feat: orchestrate today guidance safely
```

### Task 6: Persist private immutable decision runs

**Files:**
- Create: `supabase/migrations/20261011090000_recommendation_runs.sql`
- Create: `apps/mobile/src/guidance/recommendation-run-api.ts`
- Test: `tests/database/recommendation-runs.test.ts`
- Test: `tests/mobile/recommendation-run-api.test.ts`
- Modify: `tests/database/harness.ts` only for reusable test helpers

**Interfaces:**
- Produces database RPC `record_recommendation_run(p_request_id uuid, p_input_fingerprint text, p_as_of timestamptz, p_engine_version text, p_bundle_id text, p_bundle_version text, p_status text, p_input jsonb, p_decision jsonb) returns jsonb`.
- Produces mobile `recordRecommendationRun(run: unknown): Promise<RecommendationRunReceipt>`.

- [ ] **Step 1: Write failing database tests**

Assert:

- authenticated owner can insert and read only their runs;
- owner ID is always `auth.uid()` and is not accepted as an RPC argument;
- anon, another owner, and direct table mutation are denied;
- request ID is idempotent only when `input_fingerprint` matches;
- same request ID with different fingerprint raises a stable conflict;
- input and decision JSON are capped at 256 KiB each;
- status is restricted to engine/orchestration result statuses;
- rows are immutable and carry server `created_at`;
- service-role maintenance access follows existing repository policy without granting mobile access.

- [ ] **Step 2: Run and confirm database RED**

Run: `npm test -- --run tests/database/recommendation-runs.test.ts`

- [ ] **Step 3: Implement migration and RPC**

Follow existing migration conventions, `security definer` hardening, fixed `search_path`, explicit grants, RLS, and idempotency patterns. Store exact normalized input and decision required for reproduction; do not store email, username, access tokens, or service keys.

- [ ] **Step 4: Write failing mobile boundary tests and implement the API**

Validate request and response with strict Zod schemas. Preserve stable database conflict/error mapping. Never accept an owner ID from callers.

Run: `npm test -- --run tests/mobile/recommendation-run-api.test.ts`

- [ ] **Step 5: Verify and commit**

Run: `npm test -- --run tests/database/recommendation-runs.test.ts tests/mobile/recommendation-run-api.test.ts && npm run typecheck`

```text
feat: persist private recommendation audits
```

### Task 7: Replace the Today placeholder with the guidance state machine

**Files:**
- Create: `apps/mobile/src/TodayGuidance.tsx`
- Create: `apps/mobile/src/guidance/guidance-copy.ts`
- Modify: `apps/mobile/src/records.tsx`
- Remove: `apps/mobile/src/TodayTechnicalAlpha.tsx`
- Test: `tests/mobile/today-guidance.test.tsx`
- Modify: `tests/mobile/navigation.test.tsx`, `tests/mobile/component-state.test.ts`

**Interfaces:**
- Consumes: `generateTodayGuidance`, `recordRecommendationRun`, owner ID, and `onNavigate(destination)`.
- Produces: authenticated Today UI without enabling unreviewed content.

- [ ] **Step 1: Write failing UI state tests**

Test:

- loading skeleton and disabled Generate control;
- production draft bundle shows “Reviewed guidance content is still being prepared” and no protocol;
- setup gaps link to My Hair, My Shelf, My Tools, or Journey using the supplied callback;
- ready synthetic result renders ordered steps, reasons, confidence, evidence IDs, omissions, alternatives, and explicit “No purchase needed” when true;
- `needs_input`, `rule_conflict`, and `unsupported` are visibly distinct and never render a success heading;
- source error has Retry and retains selected goal;
- offline/network failure never substitutes cached or generic advice in this milestone;
- late responses after a newer request, owner change, or unmount are ignored;
- Generate calls persistence exactly once after a decision and persistence failure shows “Plan created, audit save failed” without regenerating;
- screen-reader labels, dynamic text layout, 44px-equivalent controls, and 320px rendering remain usable.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/mobile/today-guidance.test.tsx tests/mobile/navigation.test.tsx`

- [ ] **Step 3: Implement the focused component**

Keep `Records` responsible only for destination selection. Pass `user.id` and navigation callback into `TodayGuidance`. Keep all goal/load/generate/persist state inside the new component or a focused hook under `apps/mobile/src/guidance/`.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/mobile/today-guidance.test.tsx tests/mobile/navigation.test.tsx tests/mobile/component-state.test.ts && npm run typecheck && npm run lint`

```text
feat: connect today to reviewed guidance
```

### Task 8: Update authority, traceability, and operating documentation

**Files:**
- Modify: `docs/product/requirement-traceability.md`
- Create: `docs/runbooks/guidance-content-publication.md`
- Create: `docs/verification/today-guidance-integration.md`
- Test: `tests/tooling/guidance-governance.test.ts`

**Interfaces:**
- Documents the content publication boundary Codex will later use to add reviewed real mappings and rules.

- [ ] **Step 1: Write failing governance tests**

Assert the runbook requires:

- exact product/tool version identity;
- source/evidence IDs and reviewer/date;
- draft → reviewed → published lifecycle;
- withdrawal behavior and history preservation;
- regression fixtures for every published rule;
- no name-based inference, commercial ranking, medical claims, or silent rule replacement;
- independent content review before changing `CURRENT_REVIEWED_BUNDLE` to published.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/tooling/guidance-governance.test.ts`

- [ ] **Step 3: Write the runbook and update traceability honestly**

Mark requirements `Implemented` only when source plus tests prove the complete requirement. `TD-01`–`TD-09` remain Partial while production reviewed content is draft. Record the local migration as unapplied to hosted Supabase. State that no real recommendation was activated.

- [ ] **Step 4: Verify and commit**

Run: `npm test -- --run tests/tooling/product-authority.test.ts tests/tooling/guidance-governance.test.ts`

```text
docs: govern reviewed today guidance
```

### Task 9: Full verification and OpenCode handoff

**Files:**
- Modify only when a real defect is found by the checks below.

**Interfaces:**
- Produces a reviewable local branch for Codex; no external action.

- [ ] **Step 1: Run focused coverage**

```powershell
npm test -- --run --coverage tests/domain/guidance tests/domain/recommendations tests/mobile/guidance-snapshot.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/mobile/recommendation-run-api.test.ts tests/database/recommendation-runs.test.ts tests/tooling/guidance-governance.test.ts
```

Expected: every new guidance domain file is at least 80% for statements, branches, functions, and lines.

- [ ] **Step 2: Run the repository gates under Node 24**

```powershell
$env:PATH='C:\Users\ABADO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;'+$env:PATH
node --version
npm run verify:offline
npm run audit:dependencies
git diff --check codex/core-guidance-integration...HEAD
```

Expected: Node `v24.x`; offline verification, dependency policy, web export, and diff check pass.

- [ ] **Step 3: Review security and product integrity**

Inspect the full diff and confirm:

- no secrets or service-role values;
- no owner ID accepted by the persistence RPC;
- no cross-owner read/write path;
- no production synthetic mapping or fake evidence;
- no protocol from partial sources or draft content;
- no diagnosis, medical treatment, guaranteed outcome, affiliate signal, or name-derived capability;
- every persisted run includes engine and bundle versions plus input fingerprint;
- existing Shelf, Tools, Activities, Passport, Services, export, deletion, and settings remain reachable.

- [ ] **Step 4: Produce the handoff**

Report branch, commits, changed files by task, exact test/coverage/gate results, migration status, and unresolved product-content gaps. Explicitly state that the production bundle remains draft unless real approved content was found and cited. Do not push, merge, deploy, apply the migration remotely, or build/upload an APK.

## Completion criteria

- Today loads a bounded, owner-scoped snapshot from every existing record source.
- Partial or failed sources cannot generate guidance.
- Only exact reviewed version mappings can supply verified capabilities.
- The production bundle cannot run while draft, empty, withdrawn, or malformed.
- Synthetic published fixtures prove the complete path from records through preparation, engine, UI, and persistence.
- Ready output shows steps, reasons, confidence, evidence, alternatives, omissions, and “no purchase needed.”
- Missing setup and safety facts produce clear actions rather than generic advice.
- Decision runs are private, immutable, versioned, bounded, and idempotent.
- Existing app features remain reachable.
- Full repository verification passes on Node 24.
- No hosted or external system is changed.

## Explicit follow-on work

This plan deliberately leaves these for separate reviewed milestones:

1. Research and approve real product/tool capability mappings and evidence.
2. Publish the first real `basic_wash` rule bundle after domain/content review.
3. Apply and verify the recommendation-run migration on hosted Supabase.
4. Add protocol execution/check-off and resume behavior.
5. Add outcome feedback (`worked`, `did_not_work`, notes, reactions).
6. Add standardized progress photos and comparisons.
7. Add weather/environment context and travel mode.
8. Run Android device acceptance before changing the Technical Alpha label.

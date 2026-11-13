# Product Authority, Navigation, and Recommendation Engine Plan

**Status:** APPROVED FOR EXECUTION
**Approved specification:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`
**Supporting audit:** `docs/superpowers/specs/2026-10-10-product-recovery-audit.md`

> For agentic workers: read `AGENTS.md`, the approved specification, and this entire plan before editing. Use test-driven development. Execute tasks in order. Do not deploy, publish, migrate hosted data, or alter Cloudflare, Supabase, Google Play, or GitHub settings in this milestone.

## Goal

Turn the recovered product intent into an enforceable development baseline and the first safe implementation slice:

1. Make the canonical product specification the repository authority.
2. Label the existing signed app accurately as a Technical Alpha.
3. Replace the record-type navigation with the approved product destinations.
4. Add a pure, deterministic, auditable recommendation engine with synthetic fixtures.
5. Keep personalized advice disabled in the UI until profile, product, and rule data are connected in a later milestone.

This plan implements the foundation for requirements `TD-01`, `EN-01` through `EN-09`, `SF-01` through `SF-05`, `PV-01` through `PV-05`, and the navigation portions of `UX-01` through `UX-04`. It does not claim that the full guidance product is complete.

## Architecture

The mobile app remains a thin presentation layer. Recommendation logic belongs in `packages/domain` and accepts a complete immutable input. The engine performs validation, evaluates published rules, applies hard constraints, constructs candidate protocols, ranks permitted options, and emits both user-facing reasons and a machine-readable audit trace. It performs no network, database, clock, random, analytics, or commercial-ranking calls.

The mobile navigation exposes the approved mental model:

- Today
- My Hair
- My Shelf
- My Tools
- Journey
- Settings

Existing capabilities are preserved behind these destinations. Today initially displays an honest Technical Alpha state. It must not generate advice from incomplete or fabricated data.

## Technology

- TypeScript in strict mode
- React Native / Expo
- Zod 4 for runtime schemas
- Vitest and React Test Renderer
- Existing npm workspace scripts

## Global constraints

- Follow RED → GREEN → REFACTOR for each behavior.
- Do not mutate caller-owned arrays, objects, maps, or dates.
- Do not use `Date.now()`, `Math.random()`, environment state, or locale-sensitive sorting in the domain engine.
- Every tie must resolve with an explicit stable key.
- Unknown or unverified facts never satisfy a safety prerequisite.
- Hard safety rules always outrank preferences, convenience, ownership, and commercial concerns.
- The engine may prefer owned suitable items, but it must never contain affiliate, margin, sponsorship, or retailer ranking fields.
- A contradictory hard-rule set returns `rule_conflict`; it must never silently choose a side.
- The UI must distinguish unavailable guidance from a successful recommendation.
- No production data, migrations, edge functions, hosted jobs, or external account changes are in scope.
- Keep new functions under 50 lines and new source files under 400 lines.
- Achieve at least 80% statement, branch, function, and line coverage for the new domain module.

## OpenCode entry prompt

Paste the following into OpenCode from the repository root:

```text
Implement docs/superpowers/plans/2026-10-10-product-authority-navigation-recommendation-engine.md exactly as written. First read AGENTS.md, docs/superpowers/specs/2026-10-10-canonical-product-spec.md, and docs/superpowers/specs/2026-10-10-product-recovery-audit.md. Work on a new branch named codex/core-guidance-engine. Use test-driven development and complete tasks in order. Preserve unrelated local changes. Do not deploy or modify any hosted service. Stop if a requirement conflicts with the approved canonical specification. After implementation, run every verification command in the plan, review the complete diff for secrets and scope drift, and produce a concise handoff listing commits, checks, coverage, and unresolved risks.
```

## Task 1: Establish the approved product authority

**Modify:**

- `tests/tooling/product-authority.test.ts`
- `README.md`
- `docs/PHASE_1.md`
- `StrandCue-PRD-v1.1-audit.md`

**Create:**

- `docs/product/requirement-traceability.md`

### 1.1 Write failing authority tests

Update `tests/tooling/product-authority.test.ts` so it asserts:

- `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` is the product authority.
- README and `docs/PHASE_1.md` link to that exact path.
- Historical PRDs explicitly identify themselves as historical inputs and do not claim current authority.
- The canonical specification has a normalized-LF SHA-256 recorded by the test.
- The traceability document lists every requirement ID present in the canonical specification exactly once.

Calculate the expected digest from the approved file after normalizing `\r\n` to `\n`; do not copy the old PRD digest.

Run:

```powershell
npm test -- --run tests/tooling/product-authority.test.ts
```

Expected: failure because repository references still point at the former authority.

### 1.2 Update repository authority text

- Add a short “Product authority” section to README with the canonical specification link.
- Change `docs/PHASE_1.md` to describe itself as historical delivery context governed by the canonical specification.
- Add a prominent historical-source banner to `StrandCue-PRD-v1.1-audit.md`.
- Preserve historical content; do not rewrite old decisions as though they never happened.

### 1.3 Create the traceability table

Create columns:

| Requirement | Release stage | Implementation | Tests/evidence | Status |
|---|---|---|---|---|

Populate all IDs from the canonical specification. Use `Not started` when there is no verified implementation. Only mark an item `Implemented` when a test or evidence path proves it. This plan may later update rows it actually completes.

### 1.4 Verify and commit

```powershell
npm test -- --run tests/tooling/product-authority.test.ts
```

Expected: pass.

Commit:

```text
docs: establish canonical product authority
```

## Task 2: Add an explicit release-stage contract

**Create:**

- `apps/mobile/src/release-stage.ts`
- `apps/mobile/src/ReleaseStageBanner.tsx`
- `tests/mobile/release-stage.test.tsx`

**Modify:**

- `apps/mobile/src/records.tsx`
- `apps/mobile/src/ui.tsx` only if shared tokens are required

### 2.1 Define the contract through failing tests

Tests must establish:

- `CURRENT_RELEASE_STAGE` equals `technical_alpha`.
- Each supported stage has a stable label and description.
- The Technical Alpha copy says records and privacy controls are being tested and personalized guidance is not yet available.
- `ReleaseStageBanner` remains visible in the authenticated application regardless of Supabase configuration.
- Accessibility role and label expose the stage and limitation.

Use this interface:

```ts
export const ReleaseStageSchema = z.enum([
  'technical_alpha',
  'guided_founder_alpha',
  'closed_beta',
  'public_release',
]);

export type ReleaseStage = z.infer<typeof ReleaseStageSchema>;

export interface ReleaseStageDescriptor {
  readonly id: ReleaseStage;
  readonly label: string;
  readonly description: string;
}

export const CURRENT_RELEASE_STAGE: ReleaseStage = 'technical_alpha';
export function describeReleaseStage(stage: ReleaseStage): ReleaseStageDescriptor;
```

Run the new test and confirm RED before implementation.

### 2.2 Implement and render the banner

Use exact Technical Alpha meaning:

- Label: `TECHNICAL ALPHA`
- Description: `Records and privacy controls are being tested. Personalized guidance is not available yet.`

Render the banner near the authenticated app header so every destination inherits it. Do not couple it to missing environment variables.

### 2.3 Verify and commit

```powershell
npm test -- --run tests/mobile/release-stage.test.tsx tests/mobile/component-state.test.ts
npm run typecheck
```

Commit:

```text
feat: label the current app as technical alpha
```

## Task 3: Restore product-oriented navigation

**Create:**

- `apps/mobile/src/navigation.ts`
- `apps/mobile/src/TodayTechnicalAlpha.tsx`
- `tests/mobile/navigation.test.tsx`

**Modify:**

- `apps/mobile/src/records.tsx`
- `tests/mobile/component-state.test.ts`

### 3.1 Specify destinations in failing tests

Define:

```ts
export const DestinationIdSchema = z.enum([
  'today',
  'my_hair',
  'my_shelf',
  'my_tools',
  'journey',
  'settings',
]);

export type DestinationId = z.infer<typeof DestinationIdSchema>;

export interface DestinationDefinition {
  readonly id: DestinationId;
  readonly label: string;
  readonly accessibilityLabel: string;
}

export const DESTINATIONS: readonly DestinationDefinition[];
```

Tests must assert exact order, unique IDs, unique labels, and Today as the initial destination. Also test these compatibility mappings:

- My Hair contains Passport and Services subviews.
- My Shelf renders the existing Shelf screen.
- My Tools renders the existing Tools screen.
- Journey contains Activities and History subviews.
- Settings renders the existing Settings screen.

The tests must prove existing data entry screens remain reachable.

### 3.2 Implement the Today safety state

`TodayTechnicalAlpha` must explain:

- Today will eventually combine hair profile, shelf, tools, history, environment, and reviewed rules.
- Personalized guidance is not available in this release.
- Users can continue testing records, exports, and deletion.

It must not display a generic protocol, simulated score, purchase suggestion, or generated medical claim.

### 3.3 Refactor the authenticated shell

Refactor `Records` to use `DESTINATIONS` rather than inline record-type tab names. Keep subview state local to My Hair and Journey or extract small focused components if needed. Preserve all existing screen props and behaviors.

Use a horizontally scrollable or wrapping accessible destination selector so labels remain usable at 320px width and with enlarged text. Avoid icon-only navigation.

### 3.4 Verify and commit

```powershell
npm test -- --run tests/mobile/navigation.test.tsx tests/mobile/component-state.test.ts
npm run typecheck
npm run lint
```

Commit:

```text
feat: organize the app around product destinations
```

## Task 4: Define recommendation schemas and validation

**Create:**

- `packages/domain/src/recommendations/schemas.ts`
- `packages/domain/src/recommendations/types.ts`
- `packages/domain/src/recommendations/validate.ts`
- `packages/domain/src/recommendations/index.ts`
- `tests/domain/recommendations/schemas.test.ts`

**Modify:**

- `packages/domain/src/index.ts`

### 4.1 Add failing schema tests

Define and test immutable parsed inputs for:

```ts
type Confidence = 'high' | 'moderate' | 'limited';
type RuleStrength = 'hard' | 'advisory';
type RuleStatus = 'published' | 'withdrawn';

interface ProductCandidate {
  readonly productId: string;
  readonly versionId: string;
  readonly name: string;
  readonly owned: boolean;
  readonly available: boolean;
  readonly verifiedCapabilities: readonly string[];
  readonly unknownCapabilities: readonly string[];
}

interface ToolCandidate {
  readonly toolId: string;
  readonly versionId: string;
  readonly name: string;
  readonly available: boolean;
  readonly verifiedCapabilities: readonly string[];
}

interface RecommendationContext {
  readonly requestId: string;
  readonly asOf: string;
  readonly goal: string;
  readonly profileFacts: Readonly<Record<string, string | number | boolean | null>>;
  readonly products: readonly ProductCandidate[];
  readonly tools: readonly ToolCandidate[];
  readonly historyFacts: Readonly<Record<string, number | string | boolean | null>>;
  readonly environmentFacts: Readonly<Record<string, number | string | boolean | null>>;
  readonly rules: readonly RecommendationRule[];
}
```

Use a closed, discriminated condition AST:

- `all`
- `any`
- `not`
- `fact_equals`
- `fact_in`
- `capability_available`

Use a closed, discriminated effect union:

- `require_capability`
- `exclude_capability`
- `order_before`
- `order_after`
- `wait`
- `rinse`
- `frequency`
- `heat_restriction`
- `prefer_capability`

Each effect schema must reject unknown keys. `wait` uses a non-negative integer `durationSeconds`. Frequency must state its unit from `application`, `shampoo_session`, `wash_session`, or `calendar_time`. Heat restriction must identify `direct_contact`, `heated_air`, `hooded_heat`, or `steam`; optional temperatures are finite Celsius values.

Rule identity includes immutable `ruleId`, `versionId`, `status`, `strength`, `condition`, `effects`, `reason`, and one or more `evidenceIds`. Published rules require evidence. Reject duplicate rule versions, product versions, and tool versions.

Tests must cover valid parse, each invalid boundary, unknown keys, duplicates, invalid dates, invalid temperatures, and missing evidence.

### 4.2 Implement schemas and defensive copying

Use Zod `.strict()` objects. Return fresh parsed structures so engine stages cannot mutate caller-owned input. Sort only copied arrays.

Export the public API through both recommendation and domain indexes.

### 4.3 Verify and commit

```powershell
npm test -- --run tests/domain/recommendations/schemas.test.ts
npm run typecheck
```

Commit:

```text
feat: define recommendation data contracts
```

## Task 5: Implement deterministic rule evaluation

**Create:**

- `packages/domain/src/recommendations/evaluate-condition.ts`
- `packages/domain/src/recommendations/evaluate-rules.ts`
- `tests/domain/recommendations/rules.test.ts`

### 5.1 Write failing evaluator tests

Test all condition nodes, including nested `all`, `any`, and `not`. Every evaluation returns:

```ts
interface ConditionResult {
  readonly value: 'true' | 'false' | 'unknown';
  readonly missingFacts: readonly string[];
}
```

Required semantics:

- Missing facts yield `unknown`, not `false`.
- `not unknown` remains `unknown`.
- `all` returns false if any child is false, otherwise unknown if any child is unknown.
- `any` returns true if any child is true, otherwise unknown if any child is unknown.
- Only verified available capabilities satisfy `capability_available`.
- Withdrawn rules are reported in the audit as skipped and never apply effects.
- Evaluation order is stable by `ruleId`, then `versionId`.
- Repeated evaluation produces byte-equivalent JSON.

### 5.2 Implement without side effects

Create pure evaluator functions. Never read global state. Return applied, not-applicable, unknown, and withdrawn results separately with rule IDs and reasons.

### 5.3 Verify and commit

```powershell
npm test -- --run tests/domain/recommendations/rules.test.ts
```

Commit:

```text
feat: evaluate recommendation rules deterministically
```

## Task 6: Build and rank safe protocols

**Create:**

- `packages/domain/src/recommendations/apply-effects.ts`
- `packages/domain/src/recommendations/build-protocol.ts`
- `packages/domain/src/recommendations/rank-candidates.ts`
- `tests/domain/recommendations/protocol.test.ts`

### 6.1 Write failing protocol tests

Define the output contract:

```ts
type DecisionStatus = 'ready' | 'needs_input' | 'rule_conflict' | 'unsupported';

interface ProtocolStep {
  readonly stepId: string;
  readonly position: number;
  readonly action: string;
  readonly productId: string | null;
  readonly toolId: string | null;
  readonly waitSeconds: number | null;
  readonly rinse: boolean | null;
  readonly reasons: readonly string[];
}

interface ProtocolDecision {
  readonly status: DecisionStatus;
  readonly requestId: string;
  readonly confidence: Confidence;
  readonly steps: readonly ProtocolStep[];
  readonly omissions: readonly string[];
  readonly alternatives: readonly string[];
  readonly missingInputs: readonly string[];
  readonly audit: RecommendationAudit;
}
```

Test these invariants:

1. A hard exclusion always removes a conflicting candidate.
2. A hard requirement with no verified candidate returns `unsupported`.
3. An unknown fact needed by a hard rule returns `needs_input`.
4. Contradictory active hard effects return `rule_conflict` with both rule versions in the audit.
5. Owned suitable products rank before equally suitable unowned products.
6. Suitability and hard safety always outrank ownership.
7. Advisory preference only breaks ties among permitted candidates.
8. Stable ID order resolves the final tie.
9. Order, wait, rinse, frequency, and heat effects appear explicitly in steps or audit.
10. Input remains deeply equal to a pre-call clone.
11. Reordered input collections produce byte-equivalent decisions.
12. Output contains no affiliate, sponsor, retailer, margin, commission, or purchase-ranking data.

Use synthetic product and tool names. Do not encode real-world treatment claims in these tests.

### 6.2 Implement effect conflict detection

Normalize applied effects before building steps. Detect at minimum:

- same capability both required and excluded;
- same heat exposure both allowed and prohibited;
- cycles in `order_before` / `order_after`;
- mutually impossible frequency bounds.

Return all detected conflicts in stable order. Do not throw for a validly shaped but conflicting ruleset.

### 6.3 Implement transparent ranking

Use an explicit tuple comparator:

1. passes every hard rule;
2. verified capability coverage descending;
3. advisory matches descending;
4. owned descending;
5. available descending;
6. stable product or tool ID ascending using code-point comparison.

Record the winning tuple and rejected candidates in the audit. Do not use a hidden aggregate “health score.”

### 6.4 Verify and commit

```powershell
npm test -- --run tests/domain/recommendations/protocol.test.ts
```

Commit:

```text
feat: construct and rank safe recommendation protocols
```

## Task 7: Expose the single engine entry point

**Create:**

- `packages/domain/src/recommendations/engine.ts`
- `tests/domain/recommendations/engine.test.ts`

**Modify:**

- `packages/domain/src/recommendations/index.ts`
- `docs/product/requirement-traceability.md`

### 7.1 Write end-to-end domain tests first

Public API:

```ts
export function generateProtocol(input: unknown): ProtocolDecision;
```

The entry point must perform these exact stages:

1. Parse and defensively copy input.
2. Select published rule versions.
3. Evaluate conditions.
4. Stop with `needs_input` when an unresolved hard rule requires missing facts.
5. Apply hard effects.
6. Detect contradictions.
7. Build permitted steps.
8. Apply advisory preferences.
9. Rank permitted candidates.
10. Return reasons, omissions, alternatives, confidence, and audit data.

Add table-driven synthetic scenarios:

- ordinary wash protocol with an owned suitable product;
- a heat-sensitive scenario that excludes direct contact heat while permitting a lower-risk verified option;
- missing compatibility information that returns `needs_input`;
- no safe candidate that returns `unsupported`;
- contradictory published hard rules that return `rule_conflict`.

For invalid external input, use the repository’s existing domain validation error pattern. Do not convert invalid input to `needs_input`.

### 7.2 Implement the orchestration function

Keep orchestration readable and delegate stages to the focused modules. Confidence must be derived from explicit facts:

- `high`: all applied hard and advisory decisions use verified facts and published evidence-backed rules;
- `moderate`: safety is fully resolved but at least one non-safety preference is unknown;
- `limited`: a ready protocol is safe but has only the minimum verified facts;

Any unresolved safety fact must prevent `ready`.

### 7.3 Update traceability honestly

Link implemented engine requirements to source and test paths. Navigation and Technical Alpha requirements may be marked implemented. Leave photo capture, feedback learning, live rules, database persistence, environmental retrieval, and real advice as not started or partial.

### 7.4 Verify and commit

```powershell
npm test -- --run tests/domain/recommendations/engine.test.ts
npm run typecheck
```

Commit:

```text
feat: expose the audited recommendation engine
```

## Task 8: Full verification and review gate

### 8.1 Run focused coverage

```powershell
npm test -- --run --coverage tests/domain/recommendations tests/mobile/navigation.test.tsx tests/mobile/release-stage.test.tsx tests/tooling/product-authority.test.ts
```

Confirm the new recommendation module reaches at least 80% for statements, branches, functions, and lines. Add meaningful boundary tests if it does not.

### 8.2 Run repository checks

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run test:coverage
npm run audit:dependencies
npm run verify:offline
```

Record any pre-existing failure separately with the exact command and output. Do not weaken a check to make it pass.

### 8.3 Review security and product integrity

Review the full diff and explicitly verify:

- no secrets, tokens, signing files, service keys, or personal test data;
- no network or storage access in the recommendation engine;
- no medical diagnosis or guaranteed outcome copy;
- no silent default for missing safety facts;
- no commercial ranking signal;
- no mutation of parsed inputs;
- no removal of existing export, deletion, record, shelf, tool, service, or history flows;
- no UI claim that personalized guidance is available.

### 8.4 Produce the OpenCode handoff

The final handoff must include:

- branch and commit list;
- changed files grouped by task;
- exact verification results and coverage;
- remaining gaps against the canonical specification;
- screenshots of the authenticated shell at normal width, 320px width, and enlarged text if the environment can render them;
- a statement that no hosted service was changed.

Do not push, merge, publish, upload an APK, or deploy. Codex will inspect the branch, run an independent review, and perform the fine-tuning and cleanup.

## Completion criteria

This milestone is complete only when:

- The canonical specification is enforced as product authority.
- The authenticated app visibly identifies itself as Technical Alpha.
- The six approved destinations are present and all existing features remain reachable.
- Today accurately states that personalized guidance is unavailable.
- `generateProtocol` passes deterministic, safety, conflict, missing-input, ownership, and immutability tests.
- The recommendation module has at least 80% coverage in every required dimension.
- Repository checks pass or pre-existing failures are documented without bypasses.
- The traceability table reflects evidence rather than aspiration.
- No external system was modified.

## Follow-on plans

Create these only after Codex accepts this milestone:

1. Hair profile and setup-gap model.
2. Versioned shelf and tool capability data with provenance.
3. Today orchestration, protocol presentation, and event persistence.
4. Photo capture with consent, private storage, standardization overlay, and deletion propagation.
5. Outcome feedback: `worked`, `did_not_work`, notes, symptom flags, and controlled experiments.
6. Environment context, travel mode, and season-aware adjustments.
7. Reviewed live rule publishing, withdrawal, monitoring, and rollback.
8. Closed-beta device acceptance, accessibility, store declarations, and release operations.

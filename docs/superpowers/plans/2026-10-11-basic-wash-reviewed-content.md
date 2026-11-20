# Basic Wash Reviewed Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a claim-scoped evidence registry, inventory exact South African product/tool catalogue versions, prepare independently reviewable capability mappings, and publish the first safe `basic_wash` guidance bundle only after a named human reviewer approves the exact evidence and rule.

**Architecture:** Evidence is a checked-in, strictly parsed registry separate from executable guidance. Capability mappings reference exact catalogue version UUIDs and claim-level evidence records; the publication gate verifies referential integrity, allowed capability vocabulary, reviewer independence, dates, markets, and immutable bundle versions before rules can execute. Research produces draft artifacts first. The final publication commit is a separate, human-approved step and must never be synthesized from names, categories, ingredients, images, free text, or an AI assertion.

**Tech Stack:** TypeScript 6 strict mode, Zod 4, Vitest 5, PostgreSQL/Supabase catalogue migrations, existing deterministic recommendation DSL, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` (P-03, P-05, P-06, P-11, P-12, SH-01–SH-09, TL-01–TL-06, EN-01–EN-09, EV-01–EV-07, UX-03, UX-05); publication policy: `docs/runbooks/guidance-content-publication.md`.

## Global Constraints

- Use Node `>=24.0.0 <25.0.0`; verify with Node 24.19.0.
- Start from the accepted bitemporal/Today-guidance branch; do not modify activity-history semantics in this plan.
- Work only with exact immutable `product_versions.id` and `tool_versions.id` UUIDs. A product or tool name is never a capability identity.
- Initial market is `ZA`. Evidence for another formulation or market cannot support a ZA mapping without an explicit source proving equivalence.
- Evidence supports one explicit claim at a time. A URL, ingredient list, category, marketing phrase, or manufacturer identity does not imply unrelated capabilities.
- Manufacturer directions may prove identity and directions. They do not by themselves prove independent safety or comparative efficacy.
- Marketing-only sources (`T10`) may describe what a manufacturer advertises but cannot support an executable capability or rule.
- Ingredient presence alone cannot produce efficacy, toxicity, overload, diagnosis, or harm claims.
- No diagnosis, treatment, medical claim, guaranteed outcome, price, affiliate, sponsorship, popularity, or retailer preference may affect rules or ranking.
- Research and authoring may create only `draft` content. Changing the production bundle to `published` requires a second named human reviewer who did not author the entry.
- Never invent reviewer names, approval dates, catalogue UUIDs, evidence URLs, archived URLs, or claims. Missing information is a blocking gap recorded in the draft pack.
- A published bundle is immutable. Corrections require a new bundle version; withdrawal preserves history.
- Do not apply hosted migrations, push, merge, deploy, or publish content unless the user separately authorizes that external action.
- Maintain at least 80% coverage on every changed logic file.

## Review Focus

- A source about a similarly named product, another market, or another formulation must fail exact-version evidence validation; Task 2 tests this.
- A capability mapping whose evidence proves directions but not the capability claim must remain draft and non-executable; Tasks 2 and 4 test claim coverage.
- Duplicate, missing, withdrawn, future-dated, or dangling evidence IDs must block publication; Tasks 1 and 4 test all cases.
- An owner with none of the reviewed products must receive an honest missing-capability/no-purchase-pressure result rather than an invented substitution; Task 6 tests this.
- Reordering evidence, capability entries, or rules must not change the normalized decision or fingerprint; Tasks 4 and 6 test deterministic ordering.

---

### Task 1: Define the evidence and capability contracts

**Files:**
- Create: `packages/domain/src/guidance/evidence-types.ts`
- Create: `packages/domain/src/guidance/evidence-schemas.ts`
- Create: `packages/domain/src/guidance/capability-vocabulary.ts`
- Modify: `packages/domain/src/guidance/types.ts`
- Modify: `packages/domain/src/guidance/schemas.ts`
- Modify: `packages/domain/src/guidance/index.ts`
- Test: `tests/domain/guidance/evidence-schemas.test.ts`
- Test: `tests/domain/guidance/schemas.test.ts`

**Interfaces:**
- Produces: `BASIC_WASH_CAPABILITIES = ['cleanse', 'condition'] as const`.
- Produces: `GuidanceCapability = 'cleanse' | 'condition'` for this first vertical slice.
- Produces: `GuidanceEvidenceRecord = { evidenceId, sourceType, trustTier, title, sourceUrl, archivedUrl, publisher, market, versionIds, claim, limitations, checkedAt, authoredBy, reviewedAt, reviewedBy, status }`.
- Produces: `GuidanceEvidenceRegistry = { registryId, version, records }`.
- Extends: `ReviewedGuidanceBundle` with `authoredBy`, `evidenceRegistryId` and `evidenceRegistryVersion`.
- Extends: `ReviewedCapabilityEntry` with `authoredBy`, allowing the gate to enforce reviewer independence.
- Extends: `SUPPORTED_BUNDLE_VERSIONS` with version `2`; version `1` remains supported for historical replay.
- Narrows: `ReviewedCapabilityEntry.verifiedCapabilities` and recommendation rule capability fields at the guidance boundary through schema refinement, without changing the generic recommendation engine's reusable string types.

- [ ] **Step 1: Write failing contract tests**

Assert strict parsing, deep immutability, unique evidence IDs, unique/sorted version IDs, `ZA | unknown` market, allowed source/trust combinations from `packages/domain/src/shelf.ts`, offset-aware timestamps, non-empty claim/limitations, and exact capability vocabulary. Reject extra keys, fabricated reviewer placeholders, author/reviewer equality for reviewed/published records, future review dates at the publication gate, and `T10` evidence used as executable support.

- [ ] **Step 2: Run the contract tests and confirm RED**

Run: `npm test -- --run tests/domain/guidance/evidence-schemas.test.ts tests/domain/guidance/schemas.test.ts`

Expected: FAIL because the evidence contracts and bundle registry references do not exist.

- [ ] **Step 3: Implement the contracts**

Keep evidence records claim-scoped and immutable. `status` is `draft | reviewed | withdrawn`; only `reviewed` records can support publication. Preserve generic engine types, but make the reviewed-guidance schemas reject capability strings outside `BASIC_WASH_CAPABILITIES`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- --run tests/domain/guidance/evidence-schemas.test.ts tests/domain/guidance/schemas.test.ts tests/domain/guidance/reviewed-content.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
feat: define reviewed guidance evidence contracts
```

### Task 2: Inventory exact catalogue versions and create a research pack

**Files:**
- Create: `docs/product/evidence/basic-wash-v1/inventory.json`
- Create: `docs/product/evidence/basic-wash-v1/research-log.md`
- Create: `docs/product/evidence/basic-wash-v1/evidence-registry.json`
- Create: `scripts/validate-guidance-research.ts`
- Test: `tests/tooling/guidance-research.test.ts`

**Interfaces:**
- Consumes: `GuidanceEvidenceRegistrySchema` and exact catalogue table shapes.
- Produces: `inventory.json` with exact `{ kind, versionId, brand, name, variantOrModel, market, lifecycle, source }` rows.
- Produces: a draft `evidence-registry.json`; no record may be marked `reviewed` in this task.
- Produces: `npm run validate:guidance-research`.

- [ ] **Step 1: Write failing research-validation tests**

Require every inventory UUID to resolve to exactly one catalogue version in a trusted local seed/migration or an explicitly exported read-only catalogue snapshot. Reject test-fixture UUIDs, duplicate versions, manual Shelf/Tool entries without a catalogue match, non-ZA versions, missing formulation/model identity, mismatched evidence markets, dangling evidence version IDs, and executable claims supported only by marketing.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/tooling/guidance-research.test.ts`

Expected: FAIL because the research pack and validator do not exist.

- [ ] **Step 3: Build the inventory without inventing catalogue data**

Use existing production catalogue seed migrations or a user-approved read-only export. If there are no real catalogue versions, write an empty inventory and record the exact blocking gap in `research-log.md`; do not reuse the `example.test` fixtures from tests. Each researched item must record the exact market/formulation/model and the source used to establish identity.

- [ ] **Step 4: Research claim-scoped sources**

For each candidate version, record manufacturer directions plus independent regulator, professional-body, peer-reviewed, or independent-testing evidence when available. Quote no more than necessary; store URLs, claim paraphrases, limitations, dates, and provenance. Leave uncertain claims as draft gaps. Web research output is evidence input, not approval.

- [ ] **Step 5: Implement and run the validator**

Add `validate:guidance-research` to `package.json`, parse all three artifacts strictly, and exit non-zero on every mismatch listed above.

Run: `npm run validate:guidance-research && npm test -- --run tests/tooling/guidance-research.test.ts`

Expected: PASS for a structurally valid draft pack, including a valid empty pack when no real catalogue versions exist.

- [ ] **Step 6: Commit**

```text
docs: inventory basic wash evidence candidates
```

### Task 3: Add a claim-to-capability review matrix

**Files:**
- Create: `docs/product/evidence/basic-wash-v1/capability-review.json`
- Create: `packages/domain/src/guidance/validate-capability-review.ts`
- Modify: `packages/domain/src/guidance/index.ts`
- Test: `tests/domain/guidance/validate-capability-review.test.ts`

**Interfaces:**
- Produces: `CapabilityReviewRow = { kind, versionId, capability, supportingEvidenceIds, contradictedByEvidenceIds, decision, rationale, authoredBy, reviewedBy, reviewedAt }`.
- Produces: `validateCapabilityReview(input, registry, inventory, now)` returning a deeply immutable validated matrix or a typed validation failure.
- `decision` is `draft | approved | rejected | insufficient_evidence`.

- [ ] **Step 1: Write failing matrix tests**

Reject unknown capabilities, unknown version IDs, evidence not scoped to that version, empty supporting evidence for `approved`, future dates, author/reviewer equality, placeholder reviewers, contradictions ignored by an approval, duplicate `(kind, versionId, capability)` rows, and approval based only on manufacturer marketing. Accept `insufficient_evidence` with an explicit rationale and no executable mapping.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/domain/guidance/validate-capability-review.test.ts`

Expected: FAIL because the matrix validator does not exist.

- [ ] **Step 3: Implement the validator and draft matrix**

The matrix is the only source from which capability entries may later be assembled. Do not copy capabilities directly from inventory category, product name, ingredient list, or source prose.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/domain/guidance/validate-capability-review.test.ts tests/tooling/guidance-research.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```text
feat: validate claim scoped capability reviews
```

### Task 4: Strengthen the publication gate with referential integrity

**Files:**
- Modify: `packages/domain/src/guidance/reviewed-content.ts`
- Modify: `packages/domain/src/guidance/schemas.ts`
- Modify: `packages/domain/src/guidance/types.ts`
- Test: `tests/domain/guidance/reviewed-content.test.ts`

**Interfaces:**
- Replaces: `validatePublishedBundle(input, now)` with `validatePublishedBundle(input, evidenceRegistry, capabilityReview, now)`.
- Preserves: fail-closed `ReviewedContentError` behavior.
- Requires: every capability and rule evidence ID resolves to a reviewed, non-withdrawn, non-future evidence record whose claim scope covers the exact referenced version or the version-independent rule claim.

- [ ] **Step 1: Write failing publication tests**

Cover missing registry/version, dangling evidence, draft/withdrawn/future evidence, wrong market/version, unapproved capability row, author-reviewer equality, unsupported capability, duplicate references, deterministic ordering, and a valid independently reviewed bundle.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/domain/guidance/reviewed-content.test.ts`

Expected: FAIL on the new signature and integrity checks.

- [ ] **Step 3: Implement the strengthened gate and update callers**

Update `apps/mobile/src/guidance/today-guidance-service.ts` and its tests to supply the checked-in evidence registry and review matrix. The production bundle remains `draft` during this task.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/domain/guidance/reviewed-content.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx`

Expected: PASS with production guidance still unavailable while content is draft.

- [ ] **Step 5: Commit**

```text
feat: enforce guidance evidence integrity
```

### Task 5: Author the draft `basic_wash` rule and regression fixtures

**Files:**
- Create: `apps/mobile/src/guidance/evidence-registry.ts`
- Create: `apps/mobile/src/guidance/capability-review.ts`
- Modify: `apps/mobile/src/guidance/reviewed-bundle.ts`
- Create: `tests/fixtures/guidance/basic-wash-reviewed.ts`
- Test: `tests/domain/recommendations/basic-wash.test.ts`
- Test: `tests/domain/guidance/reviewed-content.test.ts`

**Interfaces:**
- Produces: draft bundle version `2` or another new supported immutable version; never edit the semantics of version `1` in place.
- Produces: one rule for goal `basic_wash` using only the existing typed DSL.
- Requires: `cleanse` followed by `condition`; no tool is required for the initial route unless reviewed evidence makes a tool strictly necessary.

- [ ] **Step 1: Write failing rule fixtures**

Assert: an owner with reviewed available cleanse and condition products receives ordered steps; archived/out-of-stock items do not qualify; missing either capability returns an explicit unsupported gap; unrelated and unknown capabilities do not qualify; no commercial field changes ranking; no tool purchase is required; evidence references and reasons appear; input order does not affect the decision or fingerprint.

- [ ] **Step 2: Run and confirm RED**

Run: `npm test -- --run tests/domain/recommendations/basic-wash.test.ts tests/domain/guidance/reviewed-content.test.ts`

Expected: FAIL because the draft rule and compiled artifacts do not exist.

- [ ] **Step 3: Compile only approved review rows into the draft bundle**

If zero real versions have independently approved mappings, keep `capabilities: []`, keep the rule non-executable/draft, and make the fixture use isolated reviewed test data. Do not insert fake production mappings to make the test pass.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/domain/recommendations/basic-wash.test.ts tests/domain/guidance/reviewed-content.test.ts tests/domain/recommendations/engine.test.ts`

Expected: PASS. Production remains fail closed until Task 7's human approval gate.

- [ ] **Step 5: Commit**

```text
feat: draft reviewed basic wash guidance
```

### Task 6: Integrate the draft content through Today without purchase pressure

**Files:**
- Modify: `packages/domain/src/guidance/prepare-guidance.ts` only if a confirmed gap exists
- Modify: `apps/mobile/src/guidance/guidance-copy.ts`
- Modify: `apps/mobile/src/TodayGuidance.tsx`
- Test: `tests/domain/guidance/prepare-guidance.test.ts`
- Test: `tests/mobile/today-guidance-service.test.ts`
- Test: `tests/mobile/today-guidance.test.tsx`

**Interfaces:**
- Consumes: the exact-version capability registry and draft/published gate.
- Produces: honest states for `ready`, missing reviewed product capability, unmatched manual item, and unpublished content.

- [ ] **Step 1: Write failing integration and copy tests**

Cover reviewed exact versions, visually similar but different versions, manual/unmatched items, unavailable products, no supported combination, complete no-purchase-needed route, deterministic source reordering, and screen-reader labels. Copy must state what is missing without directing the owner to a retailer or claiming that a purchase guarantees an outcome.

- [ ] **Step 2: Run and confirm RED where behavior is missing**

Run: `npm test -- --run tests/domain/guidance/prepare-guidance.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx`

Expected: FAIL only for confirmed missing behavior; do not rewrite already-correct paths.

- [ ] **Step 3: Implement the minimum boundary/copy changes**

Preserve the exact normalized input/fingerprint/persistence path. Do not add free-form evidence prose or source URLs to recommendation input.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm test -- --run tests/domain/guidance/prepare-guidance.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/database/recommendation-runs.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit only if behavior changed**

```text
feat: explain reviewed basic wash readiness
```

### Task 7: Stop for independent human content review, then publish

**Files:**
- Modify after approval: `docs/product/evidence/basic-wash-v1/evidence-registry.json`
- Modify after approval: `docs/product/evidence/basic-wash-v1/capability-review.json`
- Modify after approval: `apps/mobile/src/guidance/evidence-registry.ts`
- Modify after approval: `apps/mobile/src/guidance/capability-review.ts`
- Modify after approval: `apps/mobile/src/guidance/reviewed-bundle.ts`
- Modify after approval: `docs/verification/today-guidance-integration.md`
- Test: `tests/tooling/guidance-governance.test.ts`
- Test: `tests/domain/guidance/reviewed-content.test.ts`

**Interfaces:**
- Consumes: explicit approval from a named human reviewer who is not the author.
- Produces: the first `published` bundle only when at least one real exact product combination can satisfy the full `basic_wash` route.

- [ ] **Step 1: Produce the review packet and stop**

OpenCode must report exact version IDs, each capability decision, each evidence claim and limitation, unresolved contradictions, the draft rule, regression results, author identity, and the proposed independent reviewer. It must not mark content reviewed or published itself.

- [ ] **Step 2: Obtain explicit human review outside automation**

The reviewer checks the original sources and catalogue identity, records their real name and timestamp, and approves/rejects each row and the bundle. If no independent reviewer is available, keep the bundle draft and end with a blocked publication report; this is a valid safe outcome.

- [ ] **Step 3: Write failing governance assertions for the approved packet**

Require the production registry, evidence registry, capability matrix, verification record, and bundle version to agree exactly. Require a non-placeholder reviewer distinct from the recorded author.

- [ ] **Step 4: Apply only the approved values and publish a new immutable version**

Do not widen claims during transcription. If the approved mappings cannot cover both `cleanse` and `condition` with items available in the intended test Shelf, keep the bundle draft.

- [ ] **Step 5: Run publication tests**

Run: `npm run validate:guidance-research && npm test -- --run tests/tooling/guidance-governance.test.ts tests/domain/guidance/reviewed-content.test.ts tests/domain/recommendations/basic-wash.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx`

Expected: PASS; the published bundle validates at a fixed test `now` and a real reviewed Shelf combination generates guidance.

- [ ] **Step 6: Commit**

```text
feat: publish reviewed basic wash guidance
```

### Task 8: Whole-branch evidence, security, and release review

**Files:**
- Modify only files required by confirmed review findings.
- Add a regression test beside every accepted fix.

**Interfaces:**
- Reviews all changes from the accepted Today-guidance base through HEAD.
- Produces: a local acceptance report ready for the user's push/merge/deploy decision.

- [ ] **Step 1: Review the complete diff**

Check exact version/market identity, evidence claim scope, source/trust classification, author/reviewer separation, future dates, withdrawals, immutable versions, deterministic ordering, fail-closed behavior, absence of medical/commercial claims, absence of secrets, and no hosted mutation.

- [ ] **Step 2: Run the focused integration gate**

Run:

```text
npm run validate:guidance-research
npm test -- --run tests/domain/guidance/evidence-schemas.test.ts tests/domain/guidance/validate-capability-review.test.ts tests/domain/guidance/reviewed-content.test.ts tests/domain/recommendations/basic-wash.test.ts tests/domain/guidance/prepare-guidance.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/tooling/guidance-governance.test.ts
```

Expected: PASS.

- [ ] **Step 3: Fix confirmed findings with RED/GREEN tests**

Reject suggestions that infer capabilities from names, categories, ingredients, images, or free text. Every accepted finding gets a reproducing test before its fix.

- [ ] **Step 4: Run the complete Node 24 gate**

Run:

```text
node --version
npm run verify:offline
npm run audit:dependencies
git diff --check
```

Expected: supported Node 24; all tests pass; changed logic files remain above 80% coverage; dependency policy reports zero critical findings; no whitespace errors.

- [ ] **Step 5: Write the handoff**

List commits, exact researched catalogue versions, evidence sources and limitations, approved/rejected capability rows, reviewer identity/date, test counts, coverage, dependency findings, bundle status, and remaining evidence gaps. State explicitly whether the production bundle is still draft or is published. Do not push, merge, deploy, or update hosted Supabase without separate approval.

## OpenCode execution prompt

Give OpenCode this exact instruction with the plan:

```text
Execute docs/superpowers/plans/2026-10-11-basic-wash-reviewed-content.md task by task using the repository AGENTS.md and TDD. Start from the accepted Today-guidance branch. Use fresh implementation and review contexts where supported. Commit each completed task with the plan's conventional commit message. Do not invent catalogue IDs, evidence, reviewer identities, approvals, or claims. Stop at Task 7 Step 1 and give me the complete review packet; do not mark any content reviewed or published until I provide a real independent human review. Do not push, merge, deploy, apply hosted migrations, or change hosted services. Preserve unrelated working-tree files.
```

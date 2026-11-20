# First catalogue bootstrap and basic wash publication implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the empty-catalogue blocker by building a deterministic, reviewed catalogue-intake workflow; add the first exact South African shampoo and conditioner versions when real identity data is supplied; complete claim-scoped evidence review; and publish the first `basic_wash` bundle only after two named humans complete the required author and independent-review steps.

**Architecture:** A strict JSON intake artifact is the human-readable source for proposed catalogue records. A deterministic compiler validates exact identity, assigns explicit UUIDs, and emits a reviewed seed migration plus a matching read-only catalogue snapshot; PGlite tests prove schema, immutability, provenance, and repeatability. Evidence and capability decisions remain in the existing checked-in registries, and production guidance stays draft until exact catalogue identities, original sources, human authorship, and independent review all agree.

**Tech Stack:** Node 24.19.0, TypeScript 6 strict mode, Zod 4, Vitest 5, PostgreSQL/Supabase migrations, PGlite, existing deterministic recommendation DSL.

**Base:** `codex/basic-wash-reviewed-content` at `d22648d` or its reviewed successor. Execute inside `.worktrees/basic-wash-reviewed-content`; do not use the main checkout.

**Product authority:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`, `docs/runbooks/guidance-content-publication.md`, and `docs/superpowers/plans/2026-10-11-basic-wash-reviewed-content.md`.

## Why this plan exists

The reviewed-content system, evidence contracts, capability vocabulary, draft `basic_wash` rule, Today integration, and fail-closed publication gate already exist. Publication is blocked because the catalogue tables contain schema only: no real rows exist for `brands`, `products`, `product_versions`, `tool_brands`, `tools`, or `tool_versions`. Without an exact immutable product-version UUID, no source can be shown to apply to a specific formulation and market, so no `cleanse` or `condition` capability may be approved.

This plan solves the catalogue intake and verification problem. It does not treat a product name, product category, photograph, ingredient list, retailer page, barcode, or AI output as sufficient evidence by itself.

## Global constraints

- Use Node `>=24.0.0 <25.0.0`. The required local runtime is Node 24.19.0. Do not waive the runtime gate or substitute Node 25.
- Preserve the accepted bitemporal activity and Today-guidance behavior. This plan does not redesign recommendation input, activity history, account security, or navigation.
- Work only in `codex/basic-wash-reviewed-content` or a new `codex/` branch created from its reviewed head.
- Never edit, delete, or stage unrelated files from the main checkout or another worktree.
- Real catalogue rows require exact brand, product name, variant or formulation identity, `ZA` market, lifecycle, and at least one original identity source.
- Product-version and source UUIDs are explicit, stable, and checked in. Never generate different UUIDs when rerunning the compiler for unchanged input.
- A barcode or GTIN may strengthen identity but is never mandatory when an official manufacturer source and exact label identity are sufficient. If recorded, it must be treated as a string to preserve leading zeroes.
- Retailer pages may corroborate ZA availability or label identity but cannot be the sole source for directions, formulation equivalence, safety, or capability claims.
- Manufacturer pages and labels may prove exact identity and directions. They do not independently prove comparative efficacy or safety.
- Ingredient presence never proves `cleanse`, `condition`, toxicity, overload, diagnosis, treatment, or harm.
- Marketing-only evidence cannot support an executable capability or recommendation rule.
- Research output remains `draft`. Automation cannot mark evidence, capability rows, or bundles reviewed or published.
- Publication requires a named human content author who adopts the drafted claims and a different named human reviewer who reads the original sources and approves or rejects every row.
- Missing data produces an explicit blocked state. Never fill a gap with a guessed UUID, URL, reviewer, date, market, variant, ingredient, direction, capability, or claim.
- Published bundle versions and catalogue version rows are immutable. Corrections create successor versions and new bundle versions.
- Do not push, merge, deploy, apply a hosted migration, upload private labels, or change hosted Supabase without separate user authorization.
- Maintain at least 80% coverage on every changed logic file.

## Review focus

- CRLF and LF checkouts must produce identical website and CI-test results; Task 1 pins this on Windows.
- Running the catalogue compiler twice on identical normalized input must produce byte-identical JSON and SQL; Task 3 pins determinism.
- Similar names, another market, another size/formulation, or a retailer-only listing must not silently match an existing version; Tasks 2 and 5 pin identity isolation.
- A seed migration must not grant client write access, weaken RLS, cascade-delete history, or rewrite an existing version; Task 4 pins security and immutability.
- Evidence scoped to one exact version must not support another version or a version-independent rule unless the evidence record explicitly declares that scope; Task 6 pins claim scope.

---

### Task 1: Restore the required Node 24 and cross-platform verification baseline

**Files:**
- Modify only confirmed line-ending defects in `tests/website/*.test.ts`, `tests/tooling/ci.test.ts`, or the source fixtures they validate.
- Modify: `docs/runbooks/guidance-content-publication.md` only to replace the stale “no rules” wording with “no executable rules”.
- Modify: `.gitattributes` only if a repository-wide line-ending rule is absent or demonstrably incorrect.
- Test: existing four failing Windows tests and their source files.

**Interfaces:**
- Produces: a clean Node 24 baseline before catalogue implementation.
- Preserves: exact generated website content and CI workflow semantics.

- [ ] **Step 1: Select Node 24.19.0 and record the executable**

Use the repository's configured runtime manager or the known Codex Node 24 runtime. Run:

```text
node --version
npm run check:runtime
```

Expected: `v24.19.0` (or another supported Node 24) and `NODE-RUNTIME-PASS`. If Node 24 is unavailable, stop and report the exact installation/path issue; do not continue under Node 25.

- [ ] **Step 2: Reproduce the four baseline failures before editing**

Run the three `tests/website/*` failures and `tests/tooling/ci.test.ts` individually. Record expected versus received strings and prove whether the difference is only `\r\n` versus `\n`.

- [ ] **Step 3: Write or tighten a failing normalization regression**

The test must exercise both LF and CRLF input and assert the same semantic output. Normalize only at a text-comparison boundary; do not alter HTML, workflow YAML, hashes, or deployed files merely to satisfy a test.

- [ ] **Step 4: Implement the smallest cross-platform fix**

Prefer an explicit `normalizeLineEndings(text)` test helper when the source artifact is valid on both platforms. Add `.gitattributes` only when repository policy genuinely requires fixed line endings.

- [ ] **Step 5: Correct the stale runbook sentence**

State that the production bundle contains no executable published rule. Preserve the distinction between the checked-in withdrawn draft rule and published guidance.

- [ ] **Step 6: Verify the baseline**

Run:

```text
npm test -- --run tests/website tests/tooling/ci.test.ts
npm run typecheck
npm run lint
git diff --check
```

Expected: all focused tests pass; typecheck, lint, and whitespace checks pass.

- [ ] **Step 7: Commit**

```text
fix: restore cross platform verification baseline
```

### Task 2: Define an exact catalogue intake contract

**Files:**
- Create: `packages/domain/src/catalogue-intake.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `docs/product/catalogue/basic-wash-v1/intake.json`
- Create: `docs/product/catalogue/basic-wash-v1/intake-instructions.md`
- Test: `tests/domain/catalogue-intake.test.ts`

**Interfaces:**
- Produces: `CatalogueIntakeSchema` and deeply immutable `CatalogueIntake`.
- Produces: `CatalogueIntakeRow` discriminated by `kind: 'product' | 'tool'`.
- Product row fields: `recordId`, `kind`, `brand`, `productName`, `variant`, `sizeOrPack`, `market`, `gtin`, `category`, `lifecycle`, `manufacturerUrl`, `labelImageRefs`, `identityNotes`, `status`.
- Tool row fields: `recordId`, `kind`, `brand`, `modelName`, `versionLabel`, `market`, `gtin`, `toolType`, `lifecycle`, `manufacturerUrl`, `labelImageRefs`, `identityNotes`, `status`.
- `status` is `awaiting_input | draft | identity_verified | rejected`.
- Initial scope permits product categories `shampoo | conditioner`; tools remain schema-supported but are not required for `basic_wash`.

- [ ] **Step 1: Write failing strict-schema tests**

Test exact keys, trimmed lengths, `ZA` market, URL schemes `https:` only, GTIN-as-string, unique `recordId`, unique normalized identity tuple, immutable parsed values, explicit nullable optional identity fields, and rejection of unknown fields. Reject a row marked `identity_verified` when brand, exact name/model, variant/formulation identity, lifecycle, and original manufacturer or label source are missing.

- [ ] **Step 2: Add identity-collision tests**

Prove that these remain separate rows: same name with different variant; same variant in different markets; same name after reformulation; same product with a different manufacturer-confirmed formulation; shampoo versus conditioner. Case and whitespace normalization may detect duplicates but must not merge versions.

- [ ] **Step 3: Run and confirm RED**

Run: `npm test -- --run tests/domain/catalogue-intake.test.ts`

Expected: FAIL because the contract does not exist.

- [ ] **Step 4: Implement the contract and empty intake artifact**

Create an empty `rows: []` artifact with `status: 'awaiting_input'` at the document level. The instructions must tell the user exactly what photographs or links are needed and state that private label photographs stay local unless the user separately authorizes upload.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm test -- --run tests/domain/catalogue-intake.test.ts tests/domain/shelf.test.ts tests/domain/tools.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```text
feat: define exact catalogue intake
```

### Task 3: Build a deterministic catalogue seed compiler

**Files:**
- Create: `scripts/compile-catalogue-intake.ts`
- Create: `scripts/catalogue-compiler.ts`
- Modify: `package.json`
- Create: `tests/tooling/catalogue-compiler.test.ts`
- Create: `tests/fixtures/catalogue/valid-basic-wash-intake.json`
- Create: `tests/fixtures/catalogue/invalid-catalogue-intakes.json`
- Generate only from real approved input later: `docs/product/catalogue/basic-wash-v1/catalogue-snapshot.json`

**Interfaces:**
- Produces: `compileCatalogueIntake(input: unknown): { snapshot: CatalogueSnapshot; sql: string }`.
- Produces: `npm run compile:catalogue -- --input <path> --snapshot <path> --sql <path>`.
- `CatalogueSnapshot` carries explicit brand, product, version, source, and claim records using the existing database column names. Verification-event records are optional and may appear only when a real named reviewer has supplied the corresponding signed decision; the compiler never invents them.
- UUIDs derive deterministically from canonical record identity plus a fixed repository namespace, or are supplied explicitly and validated. The chosen method must be documented and tested.

- [ ] **Step 1: Write failing compiler tests**

Assert byte-identical output across repeated runs and input-row reordering; stable UUIDs; SQL identifier/value escaping; transaction wrapping; parent-before-child inserts; exact `ZA` market; `on conflict` behavior that fails on semantic disagreement; and snapshot/SQL parity.

- [ ] **Step 2: Write security and negative tests**

Reject SQL metacharacter attempts, unsupported categories, invalid URLs, identity-unverified rows, missing sources, duplicate GTIN conflicts, UUID collisions, a source tied to the wrong version, marketing-only identity, and any request to emit RLS/grant/role changes.

- [ ] **Step 3: Run and confirm RED**

Run: `npm test -- --run tests/tooling/catalogue-compiler.test.ts`

Expected: FAIL because the compiler does not exist.

- [ ] **Step 4: Implement the pure compiler**

The compiler may emit only schema-validated catalogue data inserts for existing tables. Human review status remains separate. It must not connect to Supabase, read environment secrets, execute SQL, create users, alter schemas, or mutate hosted services.

- [ ] **Step 5: Implement the CLI wrapper**

The CLI writes to explicit user-supplied output paths, refuses to overwrite a non-identical file without `--replace-draft`, and never accepts a `--publish`, `--deploy`, or database URL option.

- [ ] **Step 6: Run and verify GREEN**

Run:

```text
npm test -- --run tests/tooling/catalogue-compiler.test.ts
npm run compile:catalogue -- --input tests/fixtures/catalogue/valid-basic-wash-intake.json --snapshot output/catalogue-fixture.json --sql output/catalogue-fixture.sql
```

Run the CLI twice and compare hashes. Expected: tests pass and both outputs are byte-identical.

- [ ] **Step 7: Commit**

```text
feat: compile deterministic catalogue seeds
```

### Task 4: Prove catalogue seed security and database behavior

**Files:**
- Create: `tests/database/catalogue-seed.test.ts`
- Modify: `tests/database/migration-inventory.test.ts` only after a real seed migration exists.
- Create only after Task 5 receives real approved input: `supabase/migrations/<CLI-generated>_basic_wash_catalogue_seed.sql`.

**Interfaces:**
- Consumes: SQL from `compileCatalogueIntake`.
- Produces: local PGlite evidence that the seed fits the existing immutable catalogue schema and policies.

- [ ] **Step 1: Write database tests against compiler fixture output**

Prove exact row counts and foreign keys; authenticated catalogue read access; no authenticated insert/update/delete; no `anon` read; immutable version identity; `on delete restrict`; source and claim scope; lifecycle and successor semantics; and zero owner/private data in catalogue rows.

- [ ] **Step 2: Test idempotence and disagreement failure**

Applying identical seed SQL twice may be a documented no-op only if every semantic field matches. Reusing an ID with different brand, product, market, variant, directions, source URL, or claim must fail the transaction.

- [ ] **Step 3: Run and confirm RED**

Run: `npm test -- --run tests/database/catalogue-seed.test.ts`

Expected: FAIL until the fixture compiler output is replayed by the harness.

- [ ] **Step 4: Complete the fixture-only database harness**

Do not create a production seed migration from fixture products. Synthetic catalogue records remain under `tests/fixtures` and database-test setup only.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm test -- --run tests/database/catalogue-seed.test.ts tests/database/shelf.test.ts tests/database/tools.test.ts tests/database/hardening.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```text
test: verify catalogue seed isolation
```

### Task 5: Produce the exact human product-information request and stop if unanswered

**Files:**
- Modify: `docs/product/catalogue/basic-wash-v1/intake-instructions.md`
- Create: `.superpowers/sdd/2026-10-12-first-catalogue-bootstrap/product-input-request.md`
- Modify after real input arrives: `docs/product/catalogue/basic-wash-v1/intake.json`

**Interfaces:**
- Produces: one concise request containing every missing human-supplied field for the first shampoo and conditioner.
- Consumes later: user-provided official URLs or label photographs stored at user-approved local paths.

- [ ] **Step 1: Generate the request from schema gaps**

For each required product, ask for:

- exact brand;
- exact front-label product name;
- variant/formulation wording;
- size or pack wording;
- confirmation it is the South African product;
- barcode/GTIN if visible;
- official manufacturer URL if available;
- clear front and back label photographs when available;
- ingredient and directions panels as identity material, without treating them as efficacy proof;
- whether the owner currently possesses and can test that exact item.

- [ ] **Step 2: Check for existing approved local input**

Search only this StrandCue project and its approved attachment paths. Do not inspect unrelated photos, cloud drives, recordings, browser history, or other projects. If exact product material is absent, keep `intake.json` empty and stop after completing Tasks 1–4.

- [ ] **Step 3: Return the blocking handoff if input is absent**

The handoff must say that the catalogue tooling is ready, list the exact missing products/fields, and provide the path to `product-input-request.md`. This is a successful safe stop, not an implementation failure.

- [ ] **Step 4: Continue only when real product input is supplied**

Transcribe the supplied identity data as `draft`. Record uncertainties rather than resolving them by guesswork. No product row becomes `identity_verified` until an original manufacturer page or legible label source supports every identity field used.

- [ ] **Step 5: Commit only real, approved, non-private intake data**

If label photographs are private or contain personal/background data, do not commit them. Commit stable source references and verified facts only.

```text
docs: record first basic wash product intake
```

### Task 6: Verify identities and generate the first real local catalogue seed

**Files:**
- Modify: `docs/product/catalogue/basic-wash-v1/intake.json`
- Create: `docs/product/catalogue/basic-wash-v1/catalogue-snapshot.json`
- Create via CLI: `supabase/migrations/<CLI-generated>_basic_wash_catalogue_seed.sql`
- Modify: `tests/database/migration-inventory.test.ts`
- Modify: `docs/product/evidence/basic-wash-v1/inventory.json`
- Modify: `docs/product/evidence/basic-wash-v1/research-log.md`
- Test: `tests/database/catalogue-seed.test.ts`
- Test: `tests/tooling/guidance-research.test.ts`

**Interfaces:**
- Consumes: at least one identity-verified `shampoo` and one identity-verified `conditioner` row.
- Produces: explicit immutable catalogue UUIDs and a local-only reviewed seed migration.
- Produces: evidence inventory rows referencing the same exact `product_versions.id` values.

- [ ] **Step 1: Validate exact identity and separate uncertain formulations**

Do not equate products across countries, old/new packaging, renamed variants, sizes with different formulas, or reformulations unless an original source proves equivalence. Create separate draft version records when equivalence is uncertain.

- [ ] **Step 2: Generate the migration filename with Supabase CLI**

Run:

```text
npx supabase --version
npx supabase migration new basic_wash_catalogue_seed
```

Use that exact generated filename. Never invent or rename the timestamp.

- [ ] **Step 3: Compile and copy byte-identical reviewed output**

Compile to a temporary output path, review the SQL and snapshot, then copy the exact SQL into the CLI-generated migration. The migration may contain only catalogue inserts and an explicit transaction; no policy, grant, function, role, or owner change.

- [ ] **Step 4: Write failing real-seed assertions**

Add exact assertions for the new UUIDs, names, variants, market, lifecycle, source scope, and absence of fixture domains. Assert every evidence inventory UUID exists in the migration and snapshot.

- [ ] **Step 5: Run local database and research validation**

Run:

```text
npm test -- --run tests/database/catalogue-seed.test.ts tests/database/migration-inventory.test.ts tests/database/shelf.test.ts tests/database/hardening.test.ts
npm run validate:guidance-research
npm test -- --run tests/tooling/guidance-research.test.ts
```

Expected: PASS. Do not apply the migration to hosted Supabase.

- [ ] **Step 6: Commit**

```text
feat: seed first reviewed catalogue versions
```

### Task 7: Research claim-scoped evidence for the exact versions

**Files:**
- Modify: `docs/product/evidence/basic-wash-v1/evidence-registry.json`
- Modify: `docs/product/evidence/basic-wash-v1/research-log.md`
- Modify: `docs/product/evidence/basic-wash-v1/capability-review.json`
- Modify: `apps/mobile/src/guidance/evidence-registry.ts`
- Modify: `apps/mobile/src/guidance/capability-review.ts`
- Test: `tests/tooling/guidance-research.test.ts`
- Test: `tests/domain/guidance/validate-capability-review.test.ts`

**Interfaces:**
- Consumes: exact `product_versions.id` values from Task 6.
- Produces: draft evidence records and draft/insufficient/rejected capability rows.
- Does not produce: reviewed or approved rows.

- [ ] **Step 1: Research identity and directions from primary sources**

Record manufacturer label/page claims for the exact ZA version: intended use, directions, rinse/leave-in status, warnings, and formulation/market identity. Archive a source only through an approved archive service; never invent an archived URL.

- [ ] **Step 2: Research independent support and limitations**

Use regulator, professional-body, peer-reviewed, or independent-testing sources where they directly support the narrow claim. State limitations, populations, formulation mismatch, and whether the source is version-specific or version-independent.

- [ ] **Step 3: Draft only claim-scoped records**

Each evidence record supports one paraphrased claim. A source may produce multiple records only when each claim and limitation is separately stated. Keep `status: 'draft'`, record the automation research provenance, and leave human author/reviewer fields unapproved.

- [ ] **Step 4: Draft capability decisions**

Map shampoo to `cleanse` and conditioner to `condition` only when the evidence directly supports that functional role for the exact version. Use `insufficient_evidence` or `rejected` for uncertainty. Do not infer capability from category alone.

- [ ] **Step 5: Run validators**

Run:

```text
npm run validate:guidance-research
npm test -- --run tests/tooling/guidance-research.test.ts tests/domain/guidance/validate-capability-review.test.ts tests/domain/guidance/reviewed-content.test.ts
```

Expected: PASS while the production bundle remains draft and non-executable.

- [ ] **Step 6: Commit**

```text
docs: draft first product evidence reviews
```

### Task 8: Produce the two-human review packet and stop

**Files:**
- Create: `.superpowers/sdd/2026-10-12-first-catalogue-bootstrap/catalogue-and-content-review-packet.md`
- Modify only after human decisions: evidence registry, capability matrix, verification record, and production bundle.

**Interfaces:**
- Requires: Human A, the named content author who adopts or edits every claim.
- Requires: Human B, a different named independent reviewer who reads the original sources and approves or rejects every row.
- Produces: a publication-ready decision packet, never automatic approval.

- [ ] **Step 1: Assemble the packet**

Include exact catalogue UUIDs; identity fields; source URLs and retrieval dates; every claim and limitation; proposed capability decisions; contradictions; the proposed rule; focused test results; migration status; author field; reviewer field; and a checkbox/decision line for every evidence and capability row.

- [ ] **Step 2: Stop for Human A**

Human A must enter their real name, read the sources, adopt/edit each claim, and record the decision timestamp. Automation cannot populate this identity.

- [ ] **Step 3: Stop for Human B**

Human B must be different from Human A, independently check exact catalogue identity and original sources, approve/reject each row and the rule, and record their real name and timestamp. Automation cannot populate this identity.

- [ ] **Step 4: Keep the bundle draft when either review is missing**

Missing author, missing reviewer, same person in both roles, partial review, unresolved contradiction, or insufficient evidence is a valid blocked outcome. Do not weaken the gate.

### Task 9: Transcribe approved content and run final acceptance

**Files:**
- Modify: `docs/product/evidence/basic-wash-v1/evidence-registry.json`
- Modify: `docs/product/evidence/basic-wash-v1/capability-review.json`
- Modify: `apps/mobile/src/guidance/evidence-registry.ts`
- Modify: `apps/mobile/src/guidance/capability-review.ts`
- Modify: `apps/mobile/src/guidance/reviewed-bundle.ts`
- Modify: `docs/verification/today-guidance-integration.md`
- Test: all catalogue, evidence, recommendation, Today, governance, and database gates.

**Interfaces:**
- Consumes: completed Human A and Human B decisions from Task 8.
- Produces: a new immutable published bundle version only when both `cleanse` and `condition` are satisfied by exact reviewed versions.

- [ ] **Step 1: Write governance assertions from the signed packet**

Pin exact registry IDs/versions, catalogue version IDs, evidence IDs, capability rows, author/reviewer names, timestamps, bundle version, rule version, and verification record. Tests must fail before transcription.

- [ ] **Step 2: Transcribe only approved values**

Do not rewrite claims for style, widen scope, substitute sources, or convert rejected/insufficient rows. If the approved set cannot provide both required capabilities, retain the draft bundle.

- [ ] **Step 3: Run the focused publication gate**

Run:

```text
npm run validate:guidance-research
npm test -- --run tests/database/catalogue-seed.test.ts tests/tooling/guidance-research.test.ts tests/domain/guidance/validate-capability-review.test.ts tests/domain/guidance/reviewed-content.test.ts tests/domain/recommendations/basic-wash.test.ts tests/domain/guidance/prepare-guidance.test.ts tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/tooling/guidance-governance.test.ts
```

Expected: PASS and one real reviewed Shelf combination generates ordered `cleanse` then `condition` guidance with evidence references and no tool requirement.

- [ ] **Step 4: Run the complete Node 24 gate**

Run:

```text
node --version
npm run verify:offline
npm run audit:dependencies
git diff --check
```

Expected: supported Node 24; all tests pass; coverage remains above 80% on changed logic; zero critical dependency-policy findings; web export succeeds; no whitespace errors.

- [ ] **Step 5: Review hosted-state boundaries**

List the new migration as local/unapplied. Do not deploy it. Record whether the local Supabase runtime was available; PGlite remains required even when Docker is unavailable.

- [ ] **Step 6: Commit approved publication only if all gates pass**

```text
feat: publish first reviewed basic wash catalogue
```

### Task 10: Whole-branch review and handoff

**Files:**
- Modify only files required by confirmed review findings.
- Add a regression test beside every accepted fix.

**Interfaces:**
- Reviews: `d22648d...HEAD` plus the signed review packet.
- Produces: a branch ready for the user's separate push, merge, migration, and release decisions.

- [ ] **Step 1: Run independent code, database, security, and content reviews**

Review deterministic UUID generation, SQL escaping, transaction behavior, RLS/grants, immutable history, exact market/version scope, source trust classification, evidence limitations, human author/reviewer separation, commercial/medical exclusions, fail-closed behavior, and secret scanning.

- [ ] **Step 2: Fix confirmed findings with RED/GREEN tests**

Do not accept review suggestions that infer capability from names, categories, ingredients, photos, retailer copy, or AI output. Do not weaken independent review or publication gates.

- [ ] **Step 3: Produce the final handoff**

Report:

- commits and changed files by task;
- exact real catalogue versions and UUIDs;
- migration filename and local/unapplied status;
- evidence sources, claims, limitations, and contradictions;
- author and reviewer names/dates from the signed packet;
- approved/rejected/insufficient capability rows;
- bundle status and version;
- exact focused/full test counts and coverage;
- dependency-policy counts;
- unresolved gaps and rejected findings;
- confirmation that nothing was pushed, merged, deployed, or applied to hosted Supabase.

## Required stop points

OpenCode must stop and return a packet instead of guessing at these points:

1. **After Task 5** when exact shampoo and conditioner input is absent or incomplete.
2. **After Task 8 Step 1** for named Human A authorship and Human B independent review.
3. **Before any push, merge, hosted migration, deployment, or publication outside the repository.**

## OpenCode execution prompt

```text
Execute docs/superpowers/plans/2026-10-12-first-catalogue-bootstrap-and-basic-wash-publication.md task by task in C:\Users\ABADO\Desktop\StrandCue\.worktrees\basic-wash-reviewed-content, starting from codex/basic-wash-reviewed-content at d22648d or its reviewed successor. Follow AGENTS.md, use Node 24.19.0, TDD, immutable data, and fresh implementation/review contexts where supported. Commit each completed task with the plan's conventional commit message. First complete Tasks 1-4 and generate Task 5's exact product-input request. If real exact shampoo and conditioner identity material is not already present in approved StrandCue paths, stop after Task 5 and give me the request; do not invent products or continue. If I later supply product material, resume Tasks 6-8. Stop again after assembling the Task 8 review packet; do not fill human identities or mark content reviewed/published. Do not push, merge, deploy, apply hosted migrations, upload private label photos, or change hosted services. Preserve unrelated files and other worktrees.
```

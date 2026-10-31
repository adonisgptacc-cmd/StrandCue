# Increment 6 Heat Coach implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, owner-specific Heat Coach that explains whether proposed heat is necessary or optional, what is missing or restricted, and which reviewed lower-heat or no-heat techniques remain eligible, without ever claiming that heat is universally safe.

**Architecture:** Build a pure domain assessment over one immutable `HeatCoachInput`, an exact versioned `HeatRulePublication`, and owner-recorded tool, hair, service and heat-history facts. A server boundary must reconstruct the input and persist the exact assessment; the mobile surface may request and render decisions but may not manufacture rules, restrictions, temperature limits or alternatives. Production stays `content_pending` until two distinct humans approve a real heat-rule publication.

**Tech Stack:** TypeScript 6, React Native/Expo 57, Zod 4, Supabase/PostgreSQL, PGlite, Vitest 5, Node 24.19.x.

**Spec:** `docs/superpowers/specs/2026-10-10-canonical-product-spec.md` requirements TL-01 through TL-06, EN-01 through EN-09, TD-02 through TD-09, SF-01, SF-03, PV-02, PV-04, PV-05 and UX-01 through UX-05; `docs/superpowers/specs/2026-10-10-product-recovery-audit.md` Stage 2.

## Global constraints

- Start from clean `codex/full-product-integration` at `c956b4ccb00692a353815b982f1170e76305659d` or its reviewed successor. Create an isolated branch/worktree named `codex/increment-6-heat-coach`.
- Use the preserved Node 24.19.x runtime. The machine-default Node and any drifted cached runtime are not acceptable evidence.
- Use strict RED → GREEN → refactor. Every new logic file must have per-file thresholds of at least 80% statements, branches, functions and lines, with reasonable headroom.
- All structures are immutable. All lists have canonical order and stable tie-breaks. No clock, randomness, network, environment access or locale-dependent sorting inside the evaluator.
- Never infer temperature from wattage, model, tool type, attachment, service or a named setting such as “High”. Preserve the owner’s recorded unit.
- Never infer heat protection from product name, category, ingredients, a photo, marketing text, an unmatched Shelf item or an unpublished capability.
- `appropriate`, `lower_heat` and `no_heat` mean only “eligible under the exact reviewed cosmetic rule and recorded facts.” Never display or store `safe`, `risk-free`, `damage-free`, `guaranteed`, a diagnosis or a medical instruction.
- Unknown, contradictory, unavailable, draft, withdrawn, expired or mismatched facts fail closed. A hard restriction cannot be outweighed by preference, outcome history or convenience.
- Reviewed rules may name explicit numeric limits only when the source and Human A/B decisions approve those exact values and units. Test fixtures are visibly synthetic and never copied into production content.
- Production bundle and Heat Coach publication remain draft. Do not fill reviewer identities, approve heat rules, publish Banana content, create product capabilities or change hosted services.
- Owner-only throughout. Foreign and random identifiers are indistinguishable. Include persisted data in export, account deletion and retention documentation.
- No photos, OCR, weather, reminders, Routine Audit, personal ranking, adverse-reaction collection, AI advice, push, merge, deployment or hosted migration in this increment.
- Run independent code/state, database/privacy, accessibility/owner-switch and product-truth/wording reviews. Fix and re-review all Critical, High and Medium findings.

## Review focus

1. A named setting with no numeric temperature must remain unknown and must never satisfy a numeric reviewed limit.
2. A manual or unmatched “heat protectant” may be recorded as used but cannot satisfy an exact reviewed protection prerequisite.
3. A tool recorded as unheated, or with contradictory heat facts, must not receive heated instructions or a guessed repair.
4. An owner switch during an in-flight assessment must never paint, announce or persist the previous owner’s tool, history or decision.
5. A stale/withdrawn rule, altered tool/Shelf binding or corrected chemical-service history must invalidate restore and require a fresh server-built assessment.

---

### Task I6.0: Integrated baseline and Heat Coach authority

**Files:**
- Create: `.superpowers/sdd/2026-10-24-increment-6-heat-coach/baseline.md`
- Create: `.superpowers/sdd/2026-10-24-increment-6-heat-coach/progress.md`
- Create: `docs/superpowers/specs/2026-10-24-heat-coach-design.md`
- Modify: `docs/product/full-product-capability-matrix.md`
- Modify: `docs/product/requirement-traceability.md`

**Interfaces:**
- Consumes: integrated Increment 5 care events/programmes, `PreparedGuidanceInput`, owner Tool facts and reviewed-content publication controls.
- Produces: a fixed vocabulary and lifecycle for Tasks I6.1–I6.6; no runtime behavior.

- [ ] **Step 1: Record the exact baseline.** Capture branch, HEAD, Node path/version, clean-tree state, migration inventory, focused tests and every existing HOLD. Prove `c956b4c` (or the reviewed successor named by the operator) is the actual ancestor.
- [ ] **Step 2: Write authority tests first.** Extend `tests/tooling/product-authority.test.ts` so TL-05/TL-06 may not be promoted without named Heat Coach source and tests, production heat publication remains draft, and banned promise wording is absent from Heat Coach paths.
- [ ] **Step 3: Write the design vocabulary.** Fix the assessment states to `content_pending | needs_input | restricted | lower_heat | no_heat | appropriate | unavailable`; necessity to `not_needed | optional | supports_goal | unknown`; missing-fact destinations to `today | my_hair | services | my_shelf | my_tools`; and lifecycle to `draft | reviewed | withdrawn`.
- [ ] **Step 4: Resolve unit policy.** A numeric rule stores explicit reviewed bands separately for `C` and `F`; no runtime conversion creates an unstated limit. A label-only setting can match only a separately reviewed label rule for the exact tool version.
- [ ] **Step 5: Run focused authority tests and commit.** Commit `docs: establish Increment 6 Heat Coach authority`.

### Task I6.1: Pure Heat Coach contracts and evaluator

**Files:**
- Create: `packages/domain/src/heat-coach.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `vitest.config.ts`
- Create: `tests/domain/heat-coach.test.ts`

**Interfaces:**
- Consumes: `ToolHeatMethods`, `ToolSettings`, `ToolCondition`, `PreparedGuidanceInput`, confirmed `CareEvent` heat facts and exact reviewed product/tool bindings.
- Produces: `HeatCoachInputSchema`, `HeatRulePublicationSchema`, `HeatCoachDecisionSchema`, `evaluateHeatCoach(input, publication)`.

- [ ] **Step 1: Write failing contract tests.** Pin strict/frozen schemas, exact keys, bounded lists/text, ISO instants, UUIDs, rule version/digest, canonical order and rejection of unknown fields.
- [ ] **Step 2: Write failing evaluator tests.** Cover all seven states, all four missing-fact destinations, necessity, hard restrictions, exact unit/setting handling, unavailable tools/products, chemical-service history, current condition, zones, passes, duration and recent confirmed heat.
- [ ] **Step 3: Pin trust-boundary tests.** An unpublished capability, unmatched product, marketing claim, photo, ingredient, model name, wattage and unknown setting can never create protection, a temperature or an eligible alternative.
- [ ] **Step 4: Pin determinism and immutability.** Input reordering produces byte-identical decisions; inputs remain unchanged; same versioned input/rules produce the same decision; hard conflicts return `restricted` or `unavailable`, never a partial success.
- [ ] **Step 5: Implement the minimal pure evaluator.** Process in this order: validate → publication gate → active hard restrictions → required recorded facts → necessity → eligible method/tool/product combination → heat minimisation → reviewed alternatives → stable explanation.
- [ ] **Step 6: Pin owner-facing output boundaries.** The decision contains structured reason codes and reviewed copy keys, never raw rule expressions, database codes, reviewer names, evidence IDs, URLs, UUIDs or free-form engine sentences.
- [ ] **Step 7: Run focused tests, typecheck and per-file coverage; commit.** Commit `feat: evaluate reviewed Heat Coach rules deterministically`.

### Task I6.2: Reviewed Heat Coach publication gate

**Files:**
- Create: `apps/mobile/src/guidance/heat-rule-publication.ts`
- Create: `apps/mobile/src/guidance/heat-rule-publication.draft.ts`
- Create: `tests/domain/heat-rule-publication.test.ts`
- Create: `docs/runbooks/heat-rule-publication.md`
- Modify: `scripts/validate-guidance-research.ts`
- Modify: `tests/tooling/guidance-research.test.ts`

**Interfaces:**
- Consumes: the I6.1 `HeatRulePublicationSchema`, evidence registry, capability reviews and the existing two-person publication model.
- Produces: `validateHeatRulePublication(...)` and a production draft publication that always returns `content_pending`.

- [ ] **Step 1: Write failing publication tests.** Require exact evidence binding, Human A adoption, distinct Human B approval, non-future timestamps, an immutable content digest, exact product/tool versions where rules depend on them, and reviewed owner-facing copy.
- [ ] **Step 2: Test every refusal.** Same reviewer, placeholders, missing decision, rejected row, stale evidence, changed digest, future date, draft/withdrawn state, unknown capability and partial numeric unit coverage all fail closed.
- [ ] **Step 3: Implement the validator and empty production draft.** Do not add a real rule, reviewer or capability. The checked-in production value has `rules: []`, `state: 'draft'` and a documented blocking reason.
- [ ] **Step 4: Add the operator runbook.** Define the evidence packet, per-row decisions, two-person separation, publication command/checks, withdrawal, incident rollback and prohibition on deriving heat limits from general web articles or marketing claims.
- [ ] **Step 5: Run research validation and focused tests; commit.** Commit `feat: gate Heat Coach content behind independent review`.

### Task I6.3: Trusted server assessment and immutable audit record

**Files:**
- Create: `supabase/migrations/20261026120000_heat_coach_assessments.sql`
- Create: `tests/database/heat-coach-assessments.test.ts`
- Create: `tests/database/heat-coach-concurrency.pg.test.ts`
- Modify: `tests/database/export.test.ts`
- Modify: `tests/database/deletion.test.ts`
- Modify: `tests/database/owner-isolation-scenarios.test.ts`
- Modify: `docs/verification/privacy-matrix-2026-10-15.md`
- Modify: `docs/runbooks/privacy-retention.md`

**Interfaces:**
- Consumes: authenticated owner id, proposed heat intent, exact published rule id/digest, server-read Passport/services/Shelf/Tools/care history and I6.1 evaluation result.
- Produces: `create_heat_coach_assessment`, `get_heat_coach_assessment`, `list_heat_coach_assessments`; an immutable decision bound to input and publication fingerprints.

- [ ] **Step 1: Write failing real-migration tests.** Cover owner-only reads, anonymous/direct-write denial, active-account checks, exact server construction, quotas, idempotent retry, conflicting replay, transaction rollback and indistinguishable foreign/random ids.
- [ ] **Step 2: Prove clients cannot forge decisions.** Submitted status, restriction, temperature, alternative, explanation, owner id, rule digest or result fields are rejected/ignored; the server stores only its own result.
- [ ] **Step 3: Implement append-only persistence.** Store exact input/result JSON with strict checks, publication id/digest, source revisions/fingerprint, `created_at` and owner. Published assessments cannot be edited; invalidated historical decisions remain readable as historical, never current.
- [ ] **Step 4: Implement restore validation.** Re-read the exact assessment and mark it stale if a bound source revision, publication or exact product/tool version no longer matches. Never silently recompute an old decision into new facts.
- [ ] **Step 5: Add export, deletion and retention.** Export the owner’s structured input/result and history; account deletion removes rows; retain confirmed assessments until account deletion unless the approved design records a shorter window. Operation receipts use the existing bounded window.
- [ ] **Step 6: Add real two-session concurrency proof.** Identical operation ids converge; different payloads conflict; simultaneous create calls produce one assessment; the suite is opt-in and must never point at production.
- [ ] **Step 7: Run database, isolation, export and deletion suites; commit.** Commit `feat: persist owner-only Heat Coach assessments`.

### Task I6.4: Mobile boundary and accessible Heat Coach journey

**Files:**
- Create: `apps/mobile/src/heat-coach-api.ts`
- Create: `apps/mobile/src/heat-coach-errors.ts`
- Create: `apps/mobile/src/heat-coach-state.ts`
- Create: `apps/mobile/src/HeatCoach.tsx`
- Create: `apps/mobile/src/HeatCoachIntent.tsx`
- Create: `apps/mobile/src/HeatCoachDecision.tsx`
- Modify: `apps/mobile/src/TodayGuidance.tsx`
- Modify: `apps/mobile/src/records.tsx`
- Create: matching `tests/mobile/heat-coach-*.test.ts(x)` files

**Interfaces:**
- Consumes: I6.3 RPCs and strict response schemas; existing owner tools, Today draft and destination routing.
- Produces: owner-keyed controller state and an accessible Today/My Tools Heat Coach surface.

- [x] **Step 1: Write failing API and reducer tests.** Strictly parse every response/error; unknown codes fail closed; stale responses cannot overwrite a newer request; owner changes synchronously hide prior state and suppress late replies. A sent database write cannot be cancelled by the client.
- [x] **Step 2: Write failing intent tests.** Capture intended method, exact owned tool, known setting/temperature, passes, duration band, zones and whether heat is actually wanted. “Not sure” remains explicit and produces a targeted setup path.
- [x] **Step 3: Write failing decision-view tests.** Render necessity, assessment state, restrictions, missing information, eligible lower/no-heat alternatives, reviewed explanation and limitations. Never render internal identifiers, raw reasons or a `safe` label.
- [x] **Step 4: Write failing accessibility tests.** One result announcement; logical headings; 48dp Android targets; scalable text; no colour-only meaning; retry retains intent; focus moves to the result; account switch never paints/announces prior-owner data.
- [x] **Step 5: Implement the controller and views.** Keep the unsent intent owner-keyed and local. Only the trusted server response enables “Use this heat plan”; `content_pending`, `needs_input`, `restricted` and `unavailable` never expose a start action.
- [x] **Step 6: Integrate with Today and My Tools.** Today may propose Heat Coach only for an explicit heat concern. My Tools may open it for a selected owned tool. Existing protocol execution records the actual heat separately from the proposal.
- [x] **Step 7: Run focused mobile, navigation, owner-switch and accessibility tests; commit.** Commit `feat: add the owner-facing Heat Coach journey`.

### Task I6.5: Today/protocol integration and correction behavior

**Files:**
- Modify: `packages/domain/src/guidance/types.ts`
- Modify: `packages/domain/src/guidance/schemas.ts`
- Modify: `apps/mobile/src/guidance/protocol-preview-model.ts`
- Modify: `apps/mobile/src/ProtocolExecution.tsx`
- Create: `tests/mobile/heat-coach-integration.test.tsx`
- Modify: restore/execution tests that bind the exact stored context

**Interfaces:**
- Consumes: a validated I6.3 assessment and existing stored `RecommendationContext`/protocol decision.
- Produces: an optional exact `heatCoachAssessmentId` and fingerprint binding in a ready protocol; no duplicated decision fields.

- [ ] **Step 1: Write failing integration tests.** Cover eligible assessment preview/start, lower/no-heat alternative selection, content pending, missing facts, hard restriction, unavailable tool, unknown protectant, source correction and withdrawn rule.
- [ ] **Step 2: Bind rather than copy.** A protocol references the immutable assessment id/fingerprint/publication; it does not copy client-editable heat verdicts. Start revalidates the binding server-side.
- [ ] **Step 3: Preserve historical truth.** Correcting a service/tool/Shelf fact invalidates future start/restore but does not rewrite a completed protocol or actual heat event. A new assessment is required.
- [ ] **Step 4: Prove zero side effects.** Viewing or generating Heat Coach never records actual heat, advances treatment state, creates a programme wash, changes Shelf/Tools or publishes content.
- [ ] **Step 5: Run Today, preview, execution, restore and treatment regressions; commit.** Commit `feat: bind Heat Coach decisions to trusted protocols`.

### Task I6.6: Integrated acceptance, review and stop

**Files:**
- Create: `.superpowers/sdd/2026-10-24-increment-6-heat-coach/increment-6-report.md`
- Modify: `docs/product/full-product-capability-matrix.md`
- Modify: `docs/product/requirement-traceability.md`
- Create or update: `docs/verification/heat-coach-acceptance-2026-10-24.md`

**Interfaces:**
- Consumes: all prior Increment 6 tasks.
- Produces: one evidence-backed closure decision; no Increment 7 work.

- [x] **Step 1: Run the integrated synthetic journey.** Final full coverage passed 231 files / 4,807 tests with 8 files / 47 tests skipped. Focused Heat Coach mobile tests passed 10/10; see `docs/verification/heat-coach-acceptance-2026-10-24.md`.
- [x] **Step 2: Run real-database isolation.** Two opt-in PostgreSQL suites passed 16/16 against a fresh disposable local Supabase project with the branch's full migration chain. No hosted database was used.
- [ ] **Step 3: Run device acceptance when available.** Emulator/physical device: intent entry, missing-fact recovery, lower/no-heat choice, restriction, retry/offline, process restore, owner switch and actual execution logging. TalkBack/VoiceOver remain NOT RUN unless actually performed.
- [x] **Step 4: Run four independent reviews.** Code/state, database/privacy, accessibility/owner-switch and product-truth/wording follow-up reviews completed. Findings were fixed and re-reviewed. Device speech behavior remains unverified and is held in Step 3.
- [x] **Step 5: Run all gates.** Runtime, typecheck, lint, focused tests, opt-in PostgreSQL suites, full coverage, web export, control-plane audit and guidance research validation passed. Dependency audit ran and remains HOLD (26 findings: 0 critical, 6 high, 22 moderate). Device acceptance was unavailable. See the acceptance record.
- [x] **Step 6: Update traceability honestly.** TL-05/TL-06 remain Partial; production content remains empty/draft and Human A/B and device acceptance remain outstanding. Dependency-policy clearance is also recorded as a release hold.
- [x] **Step 7: Commit and stop.** Commit the local acceptance record as PARTIAL/HOLD and stop here. Do not begin photos, ranking, reminders, weather, Routine Audit or Increment 7.

## Open human inputs that do not block I6.0–I6.1

1. Name the first real founder heat scenario and exact desired result (the canonical acceptance scenario suggests highlighted, frizz-prone hair with roller-set/lower-direct-heat alternatives).
2. Supply the authoritative sources and exact product/tool versions for the first heat rule.
3. Provide distinct Human A and Human B reviewers for every real rule, restriction, numeric limit and technique alternative.

Without these inputs, build and verify the mechanism with conspicuously synthetic fixtures, keep production `content_pending`, and stop before publication.

## Ready-to-copy OpenCode prompt

Continue StrandCue from the clean `codex/full-product-integration` branch at `c956b4ccb00692a353815b982f1170e76305659d` or its reviewed successor. Read and follow `AGENTS.md`, `docs/superpowers/plans/2026-10-24-increment-6-heat-coach.md`, `docs/superpowers/specs/2026-10-10-canonical-product-spec.md`, `docs/superpowers/specs/2026-10-10-product-recovery-audit.md`, and the Increment 5 closure report before changing code. Create an isolated branch/worktree `codex/increment-6-heat-coach` and use the preserved Node 24.19.x runtime. Complete only Tasks I6.0 and I6.1, using strict RED → GREEN → refactor and immutable data. Build the pure deterministic Heat Coach contracts/evaluator and authority design; do not add persistence, UI or production rules yet. Never infer temperature from wattage/model/setting labels, never infer heat protection from names/categories/ingredients/photos/marketing, never call heat universally safe, and fail closed on unknown, contradictory, unpublished or mismatched facts. Use synthetic fixtures only; production must remain `content_pending` with no reviewers, capabilities or heat rules invented. Run fresh code, security/product-truth and accessibility/plain-language reviews appropriate to the changed boundary, fix and re-review every Critical/High/Medium finding, run the plan’s focused gates plus full typecheck/lint/diff checks, commit each completed task, and stop after I6.1 with an exact handoff. Do not push, merge, deploy, apply hosted migrations or start I6.2.

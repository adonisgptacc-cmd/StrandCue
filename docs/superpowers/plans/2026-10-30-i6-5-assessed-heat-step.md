# I6.5 Assessed Heat Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit a locally tested Heat Coach-bound protocol heat step only when reviewed authorization and the exact assessed prescription survive generation, preview, storage and start.

**Architecture:** A reviewed Today rule emits an `assessed_heat_action` reference to one Heat Coach publication. The trusted server fills a distinct heat step from the owned immutable assessment; PostgreSQL validates the same reference, prescription, owner items and versions at insert and start. Production content remains draft, so the released path stays pending.

**Tech Stack:** TypeScript, Zod, React Native, Supabase Edge/PostgreSQL, Vitest, PGlite, two-session PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-30-i6-5-assessed-heat-step-design.md`

## Global Constraints

- No push, deployment, production publication or hosted Supabase write.
- Production Heat Coach publications remain empty/draft; all positive heat fixtures are synthetic.
- No client-supplied verdict, thermal limit, trusted flag or item version is accepted.
- Existing no-heat and historical execution behavior must remain valid.
- Use a Supabase CLI generated filename for each forward migration; never edit committed migrations.
- Actual heat events require a separate explicit entry flow; protocol confirmation records protocol history only.

## Review Focus

- A generic `apply` tool step with an eligible assessment must remain pending.
- A heat step with a missing or mismatched publication reference must fail before run insertion.
- A lower-heat adjusted limit the owned tool cannot express exactly must remain pending.
- A changed owner item version or withdrawn capability registry must block a new start while replay retains its old receipt.
- A heat step without the exact earlier assessed protectant step must fail when the publication requires protection.

---

### Task 1: reviewed heat-action reference

**Files:** `packages/domain/src/recommendations/{types,schemas,apply-effects,build-protocol}.ts`; `supabase/functions/today-guidance/handler.ts`; relevant recommendation, guidance schema and Edge tests.

**Interfaces:** Consume an existing reviewed hard rule. Produce an optional protocol step `heatActionRef: { publicationId: string, publicationDigest: string }` only from `assessed_heat_action`, without inventing a prescription or enabling start.

- [x] Add RED tests: valid reviewed effect emits a distinct heat reference; malformed IDs/digests fail; advisory heat actions emit no step; generic tool `apply` never becomes `heat`; Edge returns `content_pending` for any heat action even without an assessment.
- [x] Run focused tests and confirm the intended failures.
- [x] Add the strict effect schema and hard-rule collection; emit a heat-action reference from the recommendation engine. Keep Edge persistence closed to every heat step until Task 3. A SQL insertion/start hold was added after review exposed a service-role bypass.
- [x] Run recommendation, guidance schema, typecheck and lint checks; commit `feat: represent reviewed heat action references`. Full coverage passed 4,764 tests; migration inventory includes both new forward migrations.

### Task 2: assessed prescription projection

**Files:** new focused server helper in `supabase/functions/today-guidance/`; `handler.ts`; domain step/execution schemas; Edge and domain tests.

**Interfaces:** Consume the Task 1 reference and the owner-scoped assessment `input`/`result`. Produce a structured `heatPrescription` containing `{ method, temperature, setting, passes, durationMinutes, zones }` matching `result.selected`, exact assessed tool ID/version and preceding product step when required; otherwise `content_pending`. This task tests a pure server projection helper and does not activate persistence yet.

- [x] Add RED tests for `appropriate` projection, tampered reviewed limit, duplicate owner identity and execution snapshot preservation. Also cover adjusted `lower_heat`, wrong publication reference, unexpressible setting and missing/late protectant.
- [x] Run RED tests and confirm the projection, limit and execution failures.
- [x] Implement the server-only projection and strict schemas; keep handler persistence and SQL bound-start rejection unchanged until Task 3.
- [x] Run focused Edge/domain/execution tests, typecheck and lint; commit `feat: project assessed heat prescriptions`. The focused execution set passed 166/166; review confirmed no active heated write path.

### Task 3: database insert/start proof

**Files:** CLI-generated forward migration; database binding and migration-replay tests.

**Interfaces:** Consume Task 2's heat step. Check exact assessment selected JSON fields, rule publication/digest, owned tool and product IDs/versions, protectant order, capability registry and current source revision under lock before insertion and start. Wire the trusted handler to persist only after the SQL gate exists, and copy `heatPrescription` into the execution snapshot.

- [x] Add RED PGlite tests for valid synthetic heat and invalid method, temperature/unit, setting, passes, duration, zones, item version, owner and protectant order.
- [x] Run RED tests and confirm failure on a valid synthetic step that is still gated.
- [x] Implement the forward migration; preserve no-heat, replay and historic execution behavior.
- [x] Run database/migration/Edge tests and real two-session correction/withdrawal races; commit `feat: validate assessed heat starts`. Focused tests passed 43/43; full coverage passed 4,790 tests at 95.68% statement coverage; typecheck and lint passed; isolated PostgreSQL passed 15/15 two-session cases. The dependency audit still reports a policy HOLD. A separate clean-bootstrap permission issue in older migrations remains documented outside this forward change.

### Task 4: owner preview and integration

**Files:** `apps/mobile/src/guidance/protocol-preview-model.ts`, `apps/mobile/src/ProtocolExecution.tsx`, Today/Heat Coach handoff and focused mobile tests.

**Interfaces:** Consume Task 3's server-owned heat step and receipt. Show method/thermal limits using reviewed copy; offer explicit adjusted lower option and a fresh assessment for other alternatives; never imply an actual heat event.

- [x] Add RED tests for direct and adjusted lower preview, pending/unknown/restricted cases, owner switch, restore and explicit actual-event distinction.
- [x] Run RED tests; implement the UI and handoff; run mobile/Edge/execution regressions. Focused mobile suites passed 106/106; local Edge runtime served and enforced authentication.
- [x] Run typecheck, lint, full coverage, migration inventory, security review and dependency audit. Coverage passed 4,804 tests with 46 skipped at 95.63% statement coverage; local migration inventory confirmed no Task 4 migration. Record device/content/dependency holds; commit `feat: preview assessed heat protocols` only for verified local behavior. Dependency policy HOLD remains open (62 findings, 7 high, 27 moderate, no critical); production content remains empty/draft and device acceptance remains outstanding.

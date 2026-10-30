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

**Files:** `packages/domain/src/recommendations/{types,schemas,apply-effects,build-protocol}.ts`; relevant recommendation and guidance schema tests.

**Interfaces:** Consume an existing reviewed hard rule. Produce an optional protocol step `heatActionRef: { publicationId: string, publicationDigest: string }` only from `assessed_heat_action`, without inventing a prescription or enabling start.

- [ ] Add RED tests: valid reviewed effect emits a distinct heat reference; malformed IDs/digests fail; advisory heat actions emit no step; generic tool `apply` never becomes `heat`.
- [ ] Run focused tests and confirm the intended failures.
- [ ] Add the strict effect schema and hard-rule collection; emit an inert heat-action reference from the recommendation engine.
- [ ] Run recommendation, guidance schema, typecheck and lint checks; commit `feat: represent reviewed heat action references`.

### Task 2: assessed prescription projection

**Files:** new focused server helper in `supabase/functions/today-guidance/`; `handler.ts`; domain step/execution schemas; Edge and domain tests.

**Interfaces:** Consume the Task 1 reference and the owner-scoped assessment `input`/`result`. Produce a structured `heatPrescription` containing `{ method, temperature, setting, passes, durationMinutes, zones }` matching `result.selected`, exact assessed tool ID/version and preceding product step when required; otherwise `content_pending`. This task tests a pure server projection helper and does not activate persistence yet.

- [ ] Add RED tests for `appropriate` and explicitly chosen adjusted `lower_heat`, wrong publication reference, unknown numeric value, unexpressible tool setting, missing protectant and generic tool application.
- [ ] Run RED tests and confirm expected failure.
- [ ] Implement the server-only projection and strict schemas; keep handler persistence and SQL bound-start rejection unchanged until Task 3.
- [ ] Run focused Edge/domain/execution tests, typecheck and lint; commit `feat: project assessed heat prescriptions`.

### Task 3: database insert/start proof

**Files:** CLI-generated forward migration; database binding and migration-replay tests.

**Interfaces:** Consume Task 2's heat step. Check exact assessment selected JSON fields, rule publication/digest, owned tool and product IDs/versions, protectant order, capability registry and current source revision under lock before insertion and start. Wire the trusted handler to persist only after the SQL gate exists, and copy `heatPrescription` into the execution snapshot.

- [ ] Add RED PGlite tests for valid synthetic heat and invalid method, temperature/unit, setting, passes, duration, zones, item version, owner and protectant order.
- [ ] Run RED tests and confirm failure on a valid synthetic step that is still gated.
- [ ] Implement the forward migration; preserve no-heat, replay and historic execution behavior.
- [ ] Run database/migration/Edge tests and real two-session correction/withdrawal races; commit `feat: validate assessed heat starts`.

### Task 4: owner preview and integration

**Files:** `apps/mobile/src/guidance/protocol-preview-model.ts`, `apps/mobile/src/ProtocolExecution.tsx`, Today/Heat Coach handoff and focused mobile tests.

**Interfaces:** Consume Task 3's server-owned heat step and receipt. Show method/thermal limits using reviewed copy; offer explicit adjusted lower option and a fresh assessment for other alternatives; never imply an actual heat event.

- [ ] Add RED tests for direct and adjusted lower preview, pending/unknown/restricted cases, owner switch, restore and explicit actual-event distinction.
- [ ] Run RED tests; implement the UI and handoff; run mobile/Edge/execution regressions.
- [ ] Run typecheck, lint, full coverage, migration inventory, security review and dependency audit. Record device/content/dependency holds; commit `feat: preview assessed heat protocols` only for verified local behavior.

# Requirement traceability

Living matrix mapping every requirement ID in the approved [canonical product specification](../superpowers/specs/2026-10-10-canonical-product-spec.md) (v1.0, 10 October 2026) to its implementation state.

Status meanings: **Implemented** — a listed test or evidence path proves the behavior; **Partial** — foundation or incomplete coverage exists; **Not started** — no verified implementation. Release stages R0–R5 follow section 9 of the canonical specification; `Standing` marks cross-cutting principles.

For Today activity guidance, the effective cutoff selects the activity state for
the requested day and the recorded cutoff limits revisions to what was known
when the request was prepared. The exact stored normalized input is the replay
authority; replay does not reconstruct inputs from mutable source records. The
bitemporal and recommendation-run migrations are verified locally and are not
applied to hosted Supabase.

## Condition-aware guided alpha (baseline 2026-10-13 @ `7460751`)

Requirement-to-task map for
`docs/superpowers/plans/2026-10-13-condition-aware-guided-alpha-continuation.md`.
Full audit: `docs/verification/condition-aware-guided-alpha-baseline.md`.
No Status cell was changed by this baseline: the production reviewed bundle
(`today-core-guidance` v2) is draft with empty capabilities and a withdrawn
placeholder rule, the six evidence records and two capability rows are draft
(`authoredBy: task-07-draft-research`, reviewer fields null), the catalogue
seed and guidance migrations are local-only and unapplied to hosted Supabase,
and the Task 8 two-human packet still awaits Human A and a distinct Human B —
so draft content may not execute and Today yields `content_pending`.

| Requirement(s) | Plan task(s) |
|---|---|
| HP-01 + HP-05 + HP-06 | Task 5 (demonstrated check-in behavior only) |
| EN-01 through EN-09 | consumed as-is (EN-02 Partial: adapters remain); Task 4 passes condition facts through the existing boundary |
| TD-01 through TD-04 | Task 5 (preflight state machine + copy) |
| TD-05 through TD-09 | Tasks 6–8 (execution persistence + UI) |
| CC-01 through CC-07 | Tasks 9–11 |
| P-01 through P-05, P-07 through P-10, P-12 | Tasks 3–5, 11 (standing principles: no invention, determinism, honesty, neutrality) |
| P-06 and P-11 | Task 11 (non-causal summaries, decision evidence details) |
| Cosmetic boundary (SF-01) | Task 5 (cosmetic-boundary copy) |
| EV-01 through EV-05 | Task 11 for evidence rendering only; review/publication stays in the non-code content lane behind the two-human gate |
| UX-01 through UX-04 | Task 5 (accessible check-in UI) |

| Requirement | Release stage | Implementation | Tests/evidence | Status |
|---|---|---|---|---|
| P-01 | Standing | — | — | Not started |
| P-02 | Standing | — | — | Not started |
| P-03 | Standing | — | — | Not started |
| P-04 | Standing | — | — | Not started |
| P-05 | Standing | — | — | Not started |
| P-06 | Standing | — | — | Not started |
| P-07 | Standing | — | — | Not started |
| P-08 | Standing | — | — | Not started |
| P-09 | Standing | — | — | Not started |
| P-10 | Standing | — | — | Not started |
| P-11 | Standing | — | — | Not started |
| P-12 | Standing | — | — | Not started |
| ID-01 | R0 | apps/mobile/src/auth.tsx, apps/mobile/src/client.ts (email/password; Supabase UUID is the owner key) | tests/mobile/auth-screen.test.tsx, tests/mobile/component-state.test.ts | Implemented |
| ID-02 | R0 | apps/mobile/src/settings-api.ts, supabase/migrations/20260924290000_username_change.sql | tests/mobile/settings.test.ts | Implemented |
| ID-03 | R0 | apps/mobile/src/records.tsx (`finishSetup` adult self-attestation) | tests/mobile/component-state.test.ts | Implemented |
| ID-04 | R0 | apps/mobile/src/auth.tsx (refresh, logout, recovery callbacks) | tests/mobile/auth-refresh-clear.test.tsx, tests/mobile/auth-recovery.test.ts, tests/mobile/auth-password-change.test.tsx | Implemented |
| ID-05 | R0 | Owner-keyed draft stores (shelf-drafts, tool-drafts, activity-drafts, service-form) cleared on logout | tests/mobile/shelf.test.ts, tests/mobile/owner-switch.test.tsx | Partial |
| ID-06 | R0 | supabase/migrations/20261004132028_recent_auth_epoch.sql, 20261015171425_deletion_cancel_recent_auth.sql (recent-auth gate, idempotent operations) | tests/mobile/export*.test.*, tests/mobile/deletion*.test.* | Implemented |
| HP-01 | R0 | packages/domain/src/passport.ts (pattern, diameter, density, optional porosity, lengthCm + lengthUnit/lengthPrecision/lengthMeasuredOn, concerns, self-reported damageObservation, goals, styling habits/frequency, environment sensitivities, heatPreference, reactionsAvoidances, budget, notes); apps/mobile/src/passport-editor.tsx, passport-api.ts; supabase/migrations/20261019120000_passport_condition_length_fields.sql | tests/domain/passport.test.ts, tests/database/passport.test.ts | Partial |
| HP-02 | R0 | packages/domain/src/services.ts, apps/mobile/src/services.tsx, service-editor.tsx, supabase/migrations/20260912070752_chemical_services.sql (dated service events with precision and zones) | tests/domain/services.test.ts, tests/database/services.test.ts, tests/mobile/services.test.ts | Implemented |
| HP-03 | R0 | packages/domain/src/history.ts, supabase/migrations/20260924150000_activities_history.sql (current, dated observation, correction, change) | tests/domain/history.test.ts, tests/mobile/history.test.ts, tests/database/passport.test.ts | Implemented |
| HP-04 | R0 | packages/domain/src/passport.ts (`naturalPattern: 'mixed'`), supabase/migrations/20261004104838_activity_zone_bounds.sql, packages/domain/src/activity.ts (zones) | tests/domain/passport.test.ts, tests/domain/activity-bounds.test.ts | Partial |
| HP-05 | R1 | Temporary check-in goal capture only; goal-scoped completeness explanation not implemented | tests/mobile/current-condition-state.test.ts | Not started |
| HP-06 | R1 | apps/mobile/src/TodayCheckIn.tsx, apps/mobile/src/guidance/current-condition-state.ts, apps/mobile/src/TodayGuidance.tsx (temporary session-only per-request check-in; no save flag and nothing here writes to the Passport) | tests/mobile/current-condition-state.test.ts, tests/mobile/today-check-in.test.tsx, tests/mobile/today-guidance.test.tsx | Partial |
| HP-07 | R1 | — | — | Not started |
| SH-01 | R0 | packages/domain/src/shelf.ts, apps/mobile/src/shelf.tsx, shelf-editor.tsx, shelf-api.ts (manual product, availability available/low/empty/archived) | tests/domain/shelf.test.ts, tests/mobile/shelf.test.ts, tests/database/shelf.test.ts | Implemented |
| SH-02 | R0 | MatchUserProductCommandSchema (`confirmed: true`), supabase/migrations/20260924190000_shelf_rpc.sql (explicit user-confirmed catalogue match) | tests/mobile/shelf.test.ts, tests/database/shelf.test.ts | Implemented |
| SH-03 | R0 | Shelf revision history (baseline/change/match/archive/correction) in shelf RPC and apps/mobile/src/shelf-history.ts | tests/database/shelf.test.ts, tests/mobile/shelf.test.ts | Implemented |
| SH-04 | R0 | — (opened date/precision, expiry/PAO, quantity band, repurchase intent absent) | — | Not started |
| SH-05 | R0 | packages/domain/src/catalogue-intake.ts (version lifecycle and published immutability) | tests/domain/catalogue-intake.test.ts, tests/tooling/catalogue-compiler.test.ts | Partial |
| SH-06 | R0 | — | — | Not started |
| SH-07 | R0 | packages/domain/src/guidance/reviewed-content.ts and catalogue schemas (directions/order/wait/rinse/frequency/activation/incompatibilities); consumer product-detail surface absent | tests/domain/guidance/reviewed-content.test.ts, tests/mobile/shelf.test.ts | Partial |
| SH-08 | R0 | packages/domain/src/catalogue-intake.ts (ingredient description only) | tests/domain/catalogue-intake.test.ts | Partial |
| SH-09 | R0 | packages/domain/src/discovery-backlog.ts (barcode/OCR/label/URL candidates only) | tests/domain/discovery-backlog.test.ts | Partial |
| SH-10 | R0 | packages/domain/src/discovery-backlog.ts (moderation candidate states) | tests/domain/discovery-backlog.test.ts | Partial |
| TL-01 | R0 | packages/domain/src/tools.ts, apps/mobile/src/tools.tsx, tool-editor.tsx, tool-api.ts (model, type, settings, units, attachments, condition) | tests/domain/tools.test.ts, tests/mobile/tools.test.ts, tests/database/tools.test.ts | Partial |
| TL-02 | R0 | packages/domain/src/tools.ts (contactHeat, airHeat, adjustableTemp); hooded/steam/unheated taxonomy partial | tests/domain/tools.test.ts | Partial |
| TL-03 | R0 | packages/domain/src/tools.ts (unknown temperature never inferred from wattage/model name) | tests/domain/tools.test.ts | Implemented |
| TL-04 | R0 | packages/domain/src/activity.ts (heat type/setting/passes/duration/zones) | tests/domain/activity.test.ts, tests/domain/activity-bounds.test.ts | Partial |
| TL-05 | R2 | — | — | Not started |
| TL-06 | R2 | — | — | Not started |
| EN-01 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-02 | R1 | packages/domain/src/recommendations/ (deterministic validation, hard-rule application, candidate ranking; official-direction and treatment-state adapters remain) | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Partial |
| EN-03 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-04 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-05 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-06 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-07 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-08 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| EN-09 | R1 | packages/domain/src/recommendations/ | tests/domain/recommendations/ (schemas, rules, protocol, engine suites) | Implemented |
| TD-01 | R1 | apps/mobile/src/TodayGuidance.tsx (preflight `idle → checking_in → ready_to_generate → generating → result`; user-initiated, never on mount or owner change), apps/mobile/src/TodayCheckIn.tsx | tests/mobile/today-guidance.test.tsx, tests/mobile/today-check-in.test.tsx, tests/mobile/current-condition-state.test.ts, tests/mobile/navigation.test.tsx | Partial |
| TD-02 | R1 | apps/mobile/src/guidance/guidance-activity-api.ts, apps/mobile/src/guidance/guidance-snapshot.ts, packages/domain/src/guidance/prepare-guidance.ts (owner-scoped histories use separate effective and recorded cutoffs; normalized activity facts include applied revision provenance), apps/mobile/src/TodayCheckIn.tsx + apps/mobile/src/guidance/current-condition-state.ts (check-in captures goal, available minutes and temporary condition per request) | tests/mobile/guidance-activity-api.test.ts, tests/mobile/guidance-snapshot.test.ts, tests/mobile/today-guidance-service.test.ts, tests/domain/guidance/prepare-guidance.test.ts, tests/mobile/current-condition-state.test.ts, tests/mobile/today-check-in.test.tsx | Partial |
| TD-03 | R1 | packages/domain/src/guidance/prepare-guidance.ts (sorted setup gaps naming the missing fact and its destination), apps/mobile/src/TodayGuidance.tsx (`current_condition` gaps loop back to the check-in with the draft intact) | tests/domain/guidance/prepare-guidance.test.ts, tests/mobile/today-guidance.test.tsx | Partial |
| TD-04 | R1 | apps/mobile/src/TodayGuidance.tsx, apps/mobile/src/guidance/guidance-copy.ts (steps, reasons, confidence, evidence, alternatives shown before execution; check-in summary shown before generation) | tests/mobile/today-guidance.test.tsx | Partial |
| TD-05 | R1 | supabase/migrations/20261011082525_bitemporal_activity_guidance.sql, supabase/migrations/20261011090000_recommendation_runs.sql (stored normalized input is the replay authority; migrations are not applied to hosted Supabase), supabase/migrations/20261013175703_protocol_executions.sql (each execution references one stored run and deep-copies its stable step identities; the stored decision is never rewritten), packages/domain/src/protocol-execution.ts | tests/database/guidance-activity-history.test.ts, tests/database/recommendation-runs.test.ts, tests/mobile/recommendation-run-api.test.ts, tests/mobile/today-guidance-service.test.ts, tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution.test.tsx | Partial |
| TD-06 | R1 | apps/mobile/src/TodayGuidance.tsx (generating and viewing produce no recorded wash, application or heat event), apps/mobile/src/ProtocolExecution.tsx (mounting, viewing and arming record nothing; only an explicit start and confirmed actions persist) | tests/mobile/today-guidance.test.tsx, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-07 | R1 | packages/domain/src/protocol-execution.ts (confirmed complete/skip/substitute/modify as history; deviation free text is history-only), supabase/migrations/20261013175703_protocol_executions.sql (owner-isolated idempotent persistence; migration not applied to hosted Supabase), apps/mobile/src/guidance/protocol-execution-api.ts, apps/mobile/src/ProtocolExecution.tsx + apps/mobile/src/guidance/protocol-execution-state.ts (explicit start, confirmed-only history, separate "Planned steps" and "Actually done" sections; completion result carries confirmed events only) | tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution-api.test.ts, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-08 | R1 | packages/domain/src/protocol-execution.ts (pause/resume/abandon/complete transitions; partial and abandoned executions preserve confirmed actual events and never imply remaining steps occurred), supabase/migrations/20261013175703_protocol_executions.sql (revision-guarded transitions, operation-idempotent retries), apps/mobile/src/ProtocolExecution.tsx + apps/mobile/src/guidance/protocol-execution-state.ts (pause/resume/stop/finish surface with retry reusing the same operation id; owner change/unmount discards in-flight work) | tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution-api.test.ts, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-09 | R1 | packages/domain/src/guidance/reviewed-content.ts (withdrawn content stops execution; staleness propagation not yet built) | tests/domain/guidance/reviewed-content.test.ts | Partial |
| TR-01 | R2 | — | — | Not started |
| TR-02 | R2 | — | — | Not started |
| TR-03 | R2 | — | — | Not started |
| TR-04 | R2 | — | — | Not started |
| TR-05 | R2 | — | — | Not started |
| TR-06 | R2 | — | — | Not started |
| TR-07 | R2 | — | — | Not started |
| TR-08 | R2 | — | — | Not started |
| CC-01 | R2 | — | — | Not started |
| CC-02 | R2 | — | — | Not started |
| CC-03 | R2 | — | — | Not started |
| CC-04 | R2 | — | — | Not started |
| CC-05 | R2 | — | — | Not started |
| CC-06 | R2 | — | — | Not started |
| CC-07 | R2 | — | — | Not started |
| CC-08 | R2 | — | — | Not started |
| PH-01 | R3 | — | — | Not started |
| PH-02 | R3 | — | — | Not started |
| PH-03 | R3 | — | — | Not started |
| PH-04 | R3 | — | — | Not started |
| PH-05 | R3 | — | — | Not started |
| PH-06 | R3 | — | — | Not started |
| PH-07 | R3 | — | — | Not started |
| PH-08 | R3 | — | — | Not started |
| PH-09 | R3 | — | — | Not started |
| WX-01 | R3 | — | — | Not started |
| WX-02 | R3 | — | — | Not started |
| WX-03 | R3 | — | — | Not started |
| WX-04 | R3 | — | — | Not started |
| WX-05 | R3 | — | — | Not started |
| WX-06 | R3 | — | — | Not started |
| RA-01 | R3 | — | — | Not started |
| RA-02 | R3 | — | — | Not started |
| RA-03 | R3 | — | — | Not started |
| RA-04 | R3 | — | — | Not started |
| RA-05 | R3 | — | — | Not started |
| RA-06 | R3 | — | — | Not started |
| RM-01 | R3 | — | — | Not started |
| RM-02 | R3 | — | — | Not started |
| RM-03 | R3 | — | — | Not started |
| RM-04 | R3 | — | — | Not started |
| RM-05 | R3 | — | — | Not started |
| AI-01 | R5 | — | — | Not started |
| AI-02 | R5 | — | — | Not started |
| AI-03 | R5 | — | — | Not started |
| AI-04 | R5 | — | — | Not started |
| AI-05 | R5 | — | — | Not started |
| AI-06 | R5 | — | — | Not started |
| AI-07 | R5 | — | — | Not started |
| SF-01 | R1 | Engine emits no diagnosis copy; UI keeps the cosmetic-records boundary; check-in copy states self-reported observations, never diagnosis/treatment, with no purchase pressure | tests/mobile/navigation.test.tsx, tests/domain/recommendations/, tests/mobile/today-check-in.test.tsx, tests/mobile/today-guidance.test.tsx | Partial |
| SF-02 | R5 | — | — | Not started |
| SF-03 | R1 | — | — | Not started |
| SF-04 | R1 | — | — | Not started |
| SF-05 | R1 | Withdrawn rules are skipped and audited; no live recall pipeline yet | tests/domain/recommendations/rules.test.ts | Partial |
| EV-01 | R4 | — | — | Not started |
| EV-02 | R4 | — | — | Not started |
| EV-03 | R4 | — | — | Not started |
| EV-04 | R4 | — | — | Not started |
| EV-05 | R4 | — | — | Not started |
| EV-06 | R4 | — | — | Not started |
| EV-07 | R4 | — | — | Not started |
| CO-01 | R5 | — | — | Not started |
| CO-02 | R5 | — | — | Not started |
| CO-03 | R5 | — | — | Not started |
| CO-04 | R5 | — | — | Not started |
| CO-05 | R5 | — | — | Not started |
| PR-01 | R5 | — | — | Not started |
| PR-02 | R5 | — | — | Not started |
| PR-03 | R5 | — | — | Not started |
| PR-04 | R5 | — | — | Not started |
| PV-01 | R0 | apps/mobile/src/consent-api.ts, supabase/migrations/20260924330000_consent.sql, 20260924340000_consent_rpc.sql (required record processing + optional purposes) | tests/mobile/consent.test.ts | Implemented |
| PV-02 | R0 | supabase/migrations/*, scripts/supabase-owner-isolation.ts (RLS and grants; owner isolation) | tests/database/*.test.ts, tests/tooling/workspace-manifests.test.ts | Implemented |
| PV-03 | R0 | apps/mobile/src/analytics.ts (no email/username/UUID/notes/photos/URLs/free text) | tests/mobile/analytics.test.ts | Implemented |
| PV-04 | R0 | apps/mobile/src/export-api.ts, export-delivery.ts, supabase/migrations/20260924320000_export_csv.sql, 20261015181916_export_complete.sql | tests/mobile/export.test.ts, tests/mobile/export-delivery.test.ts, tests/mobile/export-screen.test.tsx | Partial |
| PV-05 | R0 | apps/mobile/src/deletion-api.ts, workers/account-deletion/ (idempotent, auditable deletion; drafts + records; Storage pending photos) | tests/mobile/deletion.test.ts, tests/tooling/retention-cleanup.test.ts | Implemented |
| PV-06 | R5 | docs/runbooks/backup-restore-rehearsal.md; operational evidence outstanding | — | Partial |
| PV-07 | R5 | — (no camera/location permission requested yet) | — | Not started |
| PV-08 | R5 | — | — | Not started |
| UX-01 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-02 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-03 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-04 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-05 | R5 | Copy tests reject shame/fear language in navigation, shelf and check-in copy | tests/mobile/navigation.test.tsx, tests/mobile/shelf.test.ts, tests/mobile/today-check-in.test.tsx | Partial |

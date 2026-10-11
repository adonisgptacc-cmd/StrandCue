# Requirement traceability

Living matrix mapping every requirement ID in the approved [canonical product specification](../superpowers/specs/2026-10-10-canonical-product-spec.md) (v1.0, 10 October 2026) to its implementation state.

Status meanings: **Implemented** — a listed test or evidence path proves the behavior; **Partial** — foundation or incomplete coverage exists; **Not started** — no verified implementation. Release stages R0–R5 follow section 9 of the canonical specification; `Standing` marks cross-cutting principles.

For Today activity guidance, the effective cutoff selects the activity state for
the requested day and the recorded cutoff limits revisions to what was known
when the request was prepared. The exact stored normalized input is the replay
authority; replay does not reconstruct inputs from mutable source records. The
bitemporal and recommendation-run migrations are verified locally and are not
applied to hosted Supabase.

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
| ID-01 | R0 | — | — | Not started |
| ID-02 | R0 | — | — | Not started |
| ID-03 | R0 | — | — | Not started |
| ID-04 | R0 | — | — | Not started |
| ID-05 | R0 | — | — | Not started |
| ID-06 | R0 | — | — | Not started |
| HP-01 | R0 | — | — | Not started |
| HP-02 | R0 | — | — | Not started |
| HP-03 | R0 | — | — | Not started |
| HP-04 | R0 | — | — | Not started |
| HP-05 | R1 | — | — | Not started |
| HP-06 | R1 | — | — | Not started |
| HP-07 | R1 | — | — | Not started |
| SH-01 | R0 | — | — | Not started |
| SH-02 | R0 | — | — | Not started |
| SH-03 | R0 | — | — | Not started |
| SH-04 | R0 | — | — | Not started |
| SH-05 | R0 | — | — | Not started |
| SH-06 | R0 | — | — | Not started |
| SH-07 | R0 | — | — | Not started |
| SH-08 | R0 | — | — | Not started |
| SH-09 | R4 | — | — | Not started |
| SH-10 | R4 | — | — | Not started |
| TL-01 | R0 | — | — | Not started |
| TL-02 | R0 | — | — | Not started |
| TL-03 | R0 | — | — | Not started |
| TL-04 | R0 | — | — | Not started |
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
| TD-01 | R1 | apps/mobile/src/TodayGuidance.tsx (primary action surface; generation is user-initiated, execution surface later) | tests/mobile/today-guidance.test.tsx, tests/mobile/navigation.test.tsx | Partial |
| TD-02 | R1 | apps/mobile/src/guidance/guidance-activity-api.ts, apps/mobile/src/guidance/guidance-snapshot.ts, packages/domain/src/guidance/prepare-guidance.ts (owner-scoped histories use separate effective and recorded cutoffs; normalized activity facts include applied revision provenance) | tests/mobile/guidance-activity-api.test.ts, tests/mobile/guidance-snapshot.test.ts, tests/mobile/today-guidance-service.test.ts, tests/domain/guidance/prepare-guidance.test.ts | Partial |
| TD-03 | R1 | packages/domain/src/guidance/prepare-guidance.ts (sorted setup gaps naming the missing fact and its destination) | tests/domain/guidance/prepare-guidance.test.ts, tests/mobile/today-guidance.test.tsx | Partial |
| TD-04 | R1 | apps/mobile/src/TodayGuidance.tsx, apps/mobile/src/guidance/guidance-copy.ts (steps, reasons, confidence, evidence, alternatives shown before execution) | tests/mobile/today-guidance.test.tsx | Partial |
| TD-05 | R1 | supabase/migrations/20261011082525_bitemporal_activity_guidance.sql, supabase/migrations/20261011090000_recommendation_runs.sql (stored normalized input is the replay authority; migrations are not applied to hosted Supabase) | tests/database/guidance-activity-history.test.ts, tests/database/recommendation-runs.test.ts, tests/mobile/recommendation-run-api.test.ts, tests/mobile/today-guidance-service.test.ts | Partial |
| TD-06 | R1 | apps/mobile/src/TodayGuidance.tsx (generating and viewing produce no recorded wash, application or heat event) | tests/mobile/today-guidance.test.tsx | Partial |
| TD-07 | R1 | — | — | Not started |
| TD-08 | R1 | — | — | Not started |
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
| SF-01 | R1 | Engine emits no diagnosis copy; UI keeps the cosmetic-records boundary | tests/mobile/navigation.test.tsx, tests/domain/recommendations/ | Partial |
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
| PV-01 | R0 | — | — | Not started |
| PV-02 | R0 | — | — | Not started |
| PV-03 | R0 | — | — | Not started |
| PV-04 | R0 | — | — | Not started |
| PV-05 | R0 | — | — | Not started |
| PV-06 | R5 | — | — | Not started |
| PV-07 | R5 | — | — | Not started |
| PV-08 | R5 | — | — | Not started |
| UX-01 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-02 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-03 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-04 | R1 | apps/mobile/src/navigation.ts, ReleaseStageBanner.tsx (destinations, banner, labels) | tests/mobile/navigation.test.tsx, tests/mobile/release-stage.test.tsx | Partial |
| UX-05 | R5 | — | — | Not started |

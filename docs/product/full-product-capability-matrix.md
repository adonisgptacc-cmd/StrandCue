# Full product capability matrix

Honest status of every canonical requirement ID on the
`codex/full-product-integration` baseline (base `163c4af`, 19 October 2026),
reconciled against the actual code and tests rather than the 10 October
recovery snapshot.

Status meanings match `docs/product/requirement-traceability.md`:

- **Implemented** — a listed test or evidence path proves the behaviour.
- **Partial** — a foundation exists but the full stated capability is absent.
- **Not started** — no verified implementation.
- **Blocked by reviewed content** — code path exists but production behaviour
  depends on the two-person Human A/Human B review, which is still outstanding.

The production reviewed bundle (`today-core-guidance` v2) remains **draft** with
empty capabilities and a withdrawn placeholder rule. The Banana
shampoo/conditioner packet still awaits a distinct Human B. Nothing in this
matrix promotes draft content, fills reviewer identities or publishes facts.

## Evidence baseline

| Check | Result |
|---|---|
| Base commit | `163c4af` (`codex/security-audit-remediation`) |
| Node | `v24.19.0` (`NODE-RUNTIME-PASS`) |
| Full suite | 136 files passed, 1 failed, 2 skipped; 2321 tests passed, 3 failed, 9 skipped |
| Only failing file | `tests/tooling/control-plane-cli.test.ts` — `expo-sharing` absent from the shared `node_modules` (environment HOLD, not product behaviour) |

## Identity, eligibility and lifecycle

| Requirement | Status | Evidence |
|---|---|---|
| ID-01 Email/password + immutable UUID | Implemented | `apps/mobile/src/auth.tsx`, `apps/mobile/src/client.ts`; `tests/mobile/auth-*.test.*` |
| ID-02 Username is a changeable handle | Implemented | `apps/mobile/src/settings-api.ts`, `supabase/migrations/20260924290000_username_change.sql`; `tests/mobile/settings.test.ts` |
| ID-03 Adult self-attestation | Implemented | `apps/mobile/src/records.tsx` (`finishSetup`); `tests/mobile/component-state.test.ts` |
| ID-04 Session refresh/logout/switch/recovery | Implemented | `apps/mobile/src/auth.tsx`, `tests/mobile/auth-refresh-clear.test.tsx`, `auth-recovery.test.ts` |
| ID-05 Draft retention/discard before logout | Partial | Owner-keyed drafts (`shelf-drafts`, `tool-drafts`, `activity-drafts`, `service-form`) and logout clears them; not every surface prompts save/discard explicitly |
| ID-06 Recent auth for export/deletion, idempotent | Implemented | `supabase/migrations/20261004132028_recent_auth_epoch.sql`, `20261015171425_deletion_cancel_recent_auth.sql`; `tests/mobile/export*.test.*`, `deletion*.test.*` |

## Hair Passport and current context

| Requirement | Status | Evidence |
|---|---|---|
| HP-01 Structured facts | Partial | `packages/domain/src/passport.ts` (pattern, diameter, density, porosity, lengthCm, concerns, goals, styling habits/frequency, environment sensitivities, budget, notes); missing: self-reported damaged observation type, heat preference, reactions/avoidances, length unit/precision. `tests/domain/passport.test.ts` |
| HP-02 Chemical/service events with precision/zones | Implemented | `packages/domain/src/services.ts`, `apps/mobile/src/services.tsx`, `service-editor.tsx`; `tests/domain/services.test.ts`, `tests/database/services.test.ts`, `tests/mobile/services.test.ts` |
| HP-03 Current vs dated vs correction vs change | Implemented | `packages/domain/src/history.ts`, `supabase/migrations/20260924150000_activities_history.sql`; `tests/domain/history.test.ts`, `tests/mobile/history.test.ts` |
| HP-04 Mixed states and zone-specific facts | Partial | `naturalPattern: 'mixed'`, zone bounds in `20261004104838_activity_zone_bounds.sql`, `activity.ts` zones; not every Passport field supports per-zone values |
| HP-05 Goal-based completeness explanation | Not started | — |
| HP-06 Temporary current-condition without saving | Partial | `apps/mobile/src/TodayCheckIn.tsx`, `guidance/current-condition-state.ts`; session-only, no save flag |
| HP-07 Coarse city/timezone optional | Not started | — |

## Shelf, catalogue and product lifecycle

| Requirement | Status | Evidence |
|---|---|---|
| SH-01 Manual product + availability | Implemented | `packages/domain/src/shelf.ts`, `apps/mobile/src/shelf.tsx`, `shelf-editor.tsx`, `shelf-api.ts`; `tests/domain/shelf.test.ts`, `tests/mobile/shelf.test.ts`, `tests/database/shelf.test.ts` |
| SH-02 Confirmed catalogue match | Implemented | `MatchUserProductCommandSchema` (`confirmed: true`), `supabase/migrations/20260924190000_shelf_rpc.sql`; `tests/mobile/shelf.test.ts` |
| SH-03 Preserve manual entries + match history | Implemented | Revision history in shelf RPC + `shelf-history.ts`; `tests/database/shelf.test.ts` |
| SH-04 Opened date/PAO/quantity/repurchase intent | Not started | Fields absent from `shelf.ts`/migration |
| SH-05 Immutable published versions + states | Partial | `catalogue-intake.ts` version states; published immutability tested; reformulated/superseded/withdrawn lifecycle partial |
| SH-06 Reformulation/withdrawal notification | Not started | — |
| SH-07 Directions/order/wait/rinse/frequency/activation/incompatibilities/claims | Partial | `packages/domain/src/guidance/reviewed-content.ts`, catalogue schemas; no consumer product-detail surface |
| SH-08 Ingredients describe only | Partial | `catalogue-intake.ts`; no ingredient claim surface |
| SH-09 Barcode/OCR/label/URL to candidates | Partial | `packages/domain/src/discovery-backlog.ts`; `tests/domain/discovery-backlog.test.ts`; no capture UI/server queue |
| SH-10 User corrections moderation queue | Partial | `discovery-backlog.ts` candidate states; no operator UI |

## Tools and heat

| Requirement | Status | Evidence |
|---|---|---|
| TL-01 Tool/model/type/settings/units/attachments/condition | Partial | `packages/domain/src/tools.ts`, `apps/mobile/src/tools.tsx`, `tool-editor.tsx`; `tests/domain/tools.test.ts`, `tests/mobile/tools.test.ts`, `tests/database/tools.test.ts` |
| TL-02 Distinguish heat methods | Partial | `ToolCapabilitiesSchema` (contactHeat/airHeat/adjustableTemp/temperatureMaxCelsius); hood/steam/unheated taxonomy partial |
| TL-03 Unknown temperature not inferred | Implemented | `tools.ts` + `tests/domain/tools.test.ts` (wattage never implies temperature) |
| TL-04 Actual temperature/passes/duration/zones | Partial | `activity.ts` heat fields; not yet a Heat Coach |
| TL-05 Heat Coach | Not started | — |
| TL-06 Technique alternatives | Not started | — |

## Deterministic recommendation engine

| Requirement | Status | Evidence |
|---|---|---|
| EN-01 Determinism | Implemented | `packages/domain/src/recommendations/`; `tests/domain/recommendations/engine.test.ts` |
| EN-02 Processing order | Partial | Engine order implemented; official-direction/treatment-state adapters remain |
| EN-03 Allowed rule effects | Implemented | `recommendations/rules.ts`, `schemas.ts`; rule suites |
| EN-04 Typed DSL, no arbitrary JS | Implemented | `recommendations/schemas.ts`; rule suites |
| EN-05 Hard-constraint conflict | Implemented | `recommendations/protocol.ts`; protocol suite |
| EN-06 Unknown cannot satisfy exact prerequisite | Implemented | `recommendations/rules.ts`; boundaries suite |
| EN-07 Outputs with audit versions | Implemented | `recommendations/protocol.ts`; protocol suite |
| EN-08 "No purchase needed" conclusion | Partial | Protocol can conclude sufficiency; explicit no-purchase copy partial |
| EN-09 Commercial variables excluded | Implemented | Evaluator input types in `recommendations/schemas.ts` |

## Today and protocol execution

| Requirement | Status | Evidence |
|---|---|---|
| TD-01 Today primary action surface | Implemented | `apps/mobile/src/records.tsx` (Today first), `TodayGuidance.tsx` |
| TD-02 Capture goal/time/condition/availability/history | Partial | `TodayCheckIn.tsx`, `guidance/prepare-guidance.ts`, `guidance-snapshot.ts` |
| TD-03 Targeted questions before generation | Partial | `prepare-guidance.ts` gaps; `TodayGuidance.tsx` loopback |
| TD-04 Show route/reasons/evidence/confidence/alternatives | Partial | `TodayGuidance.tsx`, `guidance-copy.ts` |
| TD-05 Immutable protocol snapshot | Implemented | `supabase/migrations/20261011090000_recommendation_runs.sql`, `20261013175703_protocol_executions.sql`; `tests/database/recommendation-runs.test.ts` |
| TD-06 Generating/viewing is not a real event | Implemented | `tests/mobile/today-guidance.test.tsx`, `protocol-execution.test.tsx` |
| TD-07 Record completed/skipped/substituted/modified | Implemented | `protocol-execution.ts`, `ProtocolExecution*.tsx`; protocol suites |
| TD-08 Pause/resume/abandon/partial | Implemented | `protocol-execution.ts`; protocol suites |
| TD-09 Stale on material content change | Partial | `reviewed-content.ts` withdrawal stops execution; staleness propagation partial |

## Wash counting, treatment, Cue Check, photos, weather, audit, reminders, AI

| Requirement group | Status | Evidence |
|---|---|---|
| TR-01..TR-08 | Not started | No treatment/wash-count module |
| CC-01..CC-08 | Not started | No Cue Check module |
| PH-01..PH-09 | Not started | No photo module/storage |
| WX-01..WX-06 | Not started | No weather module |
| RA-01..RA-06 | Not started | No routine-audit module |
| RM-01..RM-05 | Not started | No reminder module |
| AI-01..AI-07 | Not started | No AI adapter |

## Safety, evidence, community, stylist, privacy, accessibility

| Requirement | Status | Evidence |
|---|---|---|
| SF-01 Cosmetic, not diagnosis | Partial | Engine emits no diagnosis copy; UI boundary copy in `records.tsx`; `tests/mobile/navigation.test.tsx` |
| SF-02 Red-flag escalation | Blocked by reviewed content | Wording gate; no reviewed escalation copy yet |
| SF-03 Suggest qualified professional | Not started | — |
| SF-04 Adverse reaction record | Not started | — |
| SF-05 Recall/withdrawal stops new recommendations | Partial | `reviewed-content.ts`; no live recall pipeline |
| EV-01..EV-07 | Partial | Evidence schema + `reviewed-content.ts`; `evidence-registry.ts`; review/publication gate outstanding |
| CO-01..CO-05 | Not started | — |
| PR-01..PR-04 | Not started | — |
| PV-01 Purpose consent | Implemented | `apps/mobile/src/consent-api.ts`, `supabase/migrations/20260924330000_consent.sql`; `tests/mobile/consent.test.ts` |
| PV-02 RLS/grants owner isolation | Implemented | Migrations + `scripts/supabase-owner-isolation.ts`; `tests/database/*.test.ts` |
| PV-03 Analytics excludes identifiers | Implemented | `apps/mobile/src/analytics.ts`; `tests/mobile/analytics.test.ts` |
| PV-04 Export covers records/media | Partial | `export-api.ts`, export RPCs; media not present |
| PV-05 Idempotent deletion | Implemented | `deletion-api.ts`, deletion worker; `tests/tooling/retention-cleanup.test.ts` |
| PV-06 Backup/monitoring/incident | Partial | `docs/runbooks/backup-restore-rehearsal.md`; operational evidence outstanding |
| PV-07 Minimum permissions + disclosure | Not started | No camera/location permissions requested yet |
| PV-08 Play declarations match behaviour | Not started | Release task |
| UX-01 WCAG-equivalent | Partial | `navigation.ts`, `ReleaseStageBanner.tsx`, `tests/mobile/accessibility.test.ts` |
| UX-02 Loading/empty/error/offline/retry/conflict | Partial | Screens implement several states; offline conflict coverage partial |
| UX-03 Plain language + evidence separation | Partial | `guidance-copy.ts`; partial |
| UX-04 Hands-busy mode | Not started | — |
| UX-05 No shame/fear pressure | Partial | Copy tests in `navigation`, `shelf`, `today-check-in` |

## Contradictions resolved against the 10 October recovery snapshot

- The snapshot listed every Shelf, Tool and Passport requirement as **Not
  started**. The baseline already contains domain, database, RPC and mobile
  foundations with passing tests; those are now **Implemented/Partial** with
  named evidence.
- The snapshot implied the Today engine was absent. The deterministic
  recommendation engine, protocol snapshot and execution persistence exist and
  are tested; the honest status is **Implemented/Partial**, with production
  content still **draft**.
- No status was promoted to **Implemented** without a named passing test.
- Every content-dependent capability that needs Human A/B review stays
  **Blocked by reviewed content** or **Partial**; no reviewer identity was
  invented.

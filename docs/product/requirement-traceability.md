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
| HP-01 | R0 | packages/domain/src/passport.ts (pattern, diameter, density, optional porosity, structured lengthMeasurement {value, unit cm\\|in, precision, measuredOn} against a documented 300 cm bound; legacy numeric lengthCm kept read/replay-only and explicitly retirable, never mixed with inches (submission schemas refuse numeric lengthCm writes and the migration's record-level guard trigger refuses a structured measurement while any unsuperseded legacy length is still recorded for that Passport - it reads the stored length facts, so a legacy length the projection can only report as ambiguous (unknown effective date, or conflicting overlapping entries) is still seen, and the same save has to retire it with an explicit null dated after that entry, so the record never holds two current lengths); concerns, self-reported damageObservation, goals, styling habits/frequency, environment sensitivities, heatPreference as personal preference, reactionsAvoidances, budget, notes); apps/mobile/src/passport-editor.tsx, passport-api.ts; supabase/migrations/20261019120000_passport_condition_length_fields.sql | tests/domain/passport.test.ts, tests/database/passport.test.ts, tests/mobile/passport-editor.test.tsx | Partial |
| HP-02 | R0 | packages/domain/src/services.ts, apps/mobile/src/services.tsx, service-editor.tsx, supabase/migrations/20260912070752_chemical_services.sql (dated service events with precision and zones) | tests/domain/services.test.ts, tests/database/services.test.ts, tests/mobile/services.test.ts | Implemented |
| HP-03 | R0 | packages/domain/src/history.ts, supabase/migrations/20260924150000_activities_history.sql (current, dated observation, correction, change; a stored effective date and a stored measurement date are read as the record holds them, so history the write path would refuse - a future or impossible date - still opens, while a new fact keeps the write path's date rules) | tests/domain/history.test.ts, tests/mobile/history.test.ts, tests/database/passport.test.ts | Implemented |
| HP-04 | R0 | packages/domain/src/passport.ts (`naturalPattern: 'mixed'`), supabase/migrations/20261004104838_activity_zone_bounds.sql, packages/domain/src/activity.ts (zones) | tests/domain/passport.test.ts, tests/domain/activity-bounds.test.ts | Partial |
| HP-05 | R2 | apps/mobile/src/MyHairOverview.tsx (separated current vs dated history, mixed legacy+measurement length shown as one current length plus one readable earlier entry, read-only screen opened through the editor callback) and apps/mobile/src/passport-completeness.ts (per-goal foundation facts and plain missing questions; deliberate no-percentage/no-score rule; goals none/unknown render guidance, not gaps) | tests/mobile/passport-completeness.test.ts, tests/mobile/my-hair-overview.test.tsx, tests/mobile/check-in-no-save-promise.test.tsx | Implemented |
| HP-06 | R1 | apps/mobile/src/TodayCheckIn.tsx, apps/mobile/src/guidance/current-condition-state.ts, apps/mobile/src/TodayGuidance.tsx (temporary session-only per-request check-in; no save flag and nothing here writes to the Passport; for the outcomes the app may store privately, the facts that plan read are kept in the owner-scoped private run record, which is the accepted Task 3.1 audit design), packages/domain/src/current-condition.ts (Task 3.1: buildup, scalp discomfort, chemical-processing and heat concerns; zone-attached concerns validated), Task 3.2: the check-in screen now offers the smallest accessible zone step (existing service-zone taxonomy, optional areas, one concern per area, canonical order, no duplicates) and the check-in survives a trip to My Hair, My Shelf or My Tools and a retry; the session draft is cleared when another owner is served, on sign-out and on account deletion | tests/mobile/current-condition-state.test.ts, tests/mobile/today-check-in.test.tsx, tests/mobile/today-guidance.test.tsx, tests/domain/current-condition.test.ts, tests/mobile/guidance-snapshot.test.ts (loading never calls the Passport write API), tests/domain/guidance/prepare-guidance.test.ts ("Passport baseline and temporary precedence": baseline unchanged for a second request), tests/mobile/guidance-gap-resolver.test.tsx ("check-in preservation") | Partial |
| HP-07 | R1 | — | — | Not started |
| SH-01 | R0 | packages/domain/src/shelf.ts, apps/mobile/src/shelf.tsx, shelf-editor.tsx, shelf-api.ts (manual product, availability available/low/empty/archived) | tests/domain/shelf.test.ts, tests/mobile/shelf.test.ts, tests/database/shelf.test.ts | Implemented |
| SH-02 | R0 | MatchUserProductCommandSchema (`confirmed: true`), supabase/migrations/20260924190000_shelf_rpc.sql (explicit user-confirmed catalogue match); Task 2.2: packages/domain/src/catalogue-search.ts, supabase/migrations/20261021120000_catalogue_search.sql (read-only identity/lifecycle search), apps/mobile/src/CatalogueMatch.tsx, catalogue-match-copy.ts, catalogue-search-api.ts (search, exact-version comparison, explicit confirmation, rematch); Task 2.5 local Android journey evidence | tests/mobile/shelf.test.ts, tests/database/shelf.test.ts, tests/domain/catalogue-search.test.ts, tests/database/catalogue-search.test.ts, tests/mobile/catalogue-match.test.tsx, tests/mobile/catalogue-match-integration.test.tsx, tests/mobile/catalogue-search-api.test.ts, docs/verification/increment-2-android-owner-journey-2026-10-21.md | Implemented |
| SH-03 | R0 | Shelf revision history (baseline/change/match/archive/correction) in shelf RPC and apps/mobile/src/shelf-history.ts; a correction must materially change the brand, product name or category (`invalid-correction-noop`), and the audit reconstructs the state before a correction from the whole lineage (packages/domain/src/shelf.ts `shelfStateBefore`) | tests/database/shelf.test.ts, tests/mobile/shelf.test.ts, tests/domain/shelf.test.ts | Implemented |
| SH-04 | R0 | packages/domain/src/shelf.ts (opened date with day/month/year/unknown precision, expiry date, the owner's own period-after-opening wording, quantity band, repurchase intent, manual variant/size/barcode), apps/mobile/src/shelf-editor.tsx, shelf-api.ts, supabase/migrations/20261020120000_user_product_shelf_facts.sql (owner-entered fact columns on public.user_products; one jsonb facts patch keeps "never answered" and "cleared" apart; export v3) | tests/domain/shelf.test.ts, tests/database/shelf.test.ts, tests/mobile/shelf.test.ts | Implemented |
| SH-05 | R0 | packages/domain/src/catalogue-intake.ts (version lifecycle and published immutability); Task 2.3 and Task 2.4 (tool catalogue, `20261023130000_tool_catalogue_publication.sql`, `tests/database/tool-catalogue.test.ts`): publication immutability in `20261022120000_product_detail_publication.sql` | tests/domain/catalogue-intake.test.ts, tests/tooling/catalogue-compiler.test.ts | Partial |
| SH-06 | R0 | — | — | Not started |
| SH-07 | R0 | packages/domain/src/guidance/reviewed-content.ts and catalogue schemas (directions/order/wait/rinse/frequency/activation/incompatibilities); consumer product-detail surface absent; Task 2.3: `packages/domain/src/product-detail.ts`, `apps/mobile/src/ProductDetail.tsx`, `catalogue-detail-api.ts`, `product-detail-copy.ts`, `20261022120000_product_detail_publication.sql` (consumer surface; no content published) | tests/domain/guidance/reviewed-content.test.ts, tests/mobile/shelf.test.ts | Partial |
| SH-08 | R0 | packages/domain/src/catalogue-intake.ts (ingredient description only); Task 2.3: label-text-only ingredients behind a publication state (`ProductDetail.tsx`) | tests/domain/catalogue-intake.test.ts | Partial |
| SH-09 | R0 | packages/domain/src/discovery-backlog.ts (barcode/OCR/label/URL candidates only) | tests/domain/discovery-backlog.test.ts | Partial |
| SH-10 | R0 | packages/domain/src/discovery-backlog.ts (moderation candidate states) | tests/domain/discovery-backlog.test.ts | Partial |
| TL-01 | R0 | packages/domain/src/tools.ts, supabase/migrations/20261023120000_tool_owner_facts.sql, apps/mobile/src/tools.tsx, tool-editor.tsx, tool-form.ts, tool-api.ts (model, type, settings, units, attachments, condition, owner facts; Task 2.4); Task 2.5 local Android journey evidence | tests/domain/tools-owner.test.ts, tests/database/tools-owner.test.ts, tests/mobile/tool-editor.test.tsx, tests/mobile/tools-integration.test.tsx, docs/verification/increment-2-android-owner-journey-2026-10-21.md | Implemented |
| TL-02 | R0 | packages/domain/src/tools.ts (heat-method taxonomy: direct-contact, heated-air, hooded, steam, unheated, explicit unknown; Task 2.4) | tests/domain/tools-owner.test.ts, tests/database/tools-owner.test.ts, tests/mobile/tool-form.test.ts | Implemented |
| TL-03 | R0 | packages/domain/src/tools.ts (unknown temperature never inferred from wattage/model name) | tests/domain/tools.test.ts | Implemented |
| TL-04 | R0 | packages/domain/src/activity.ts (heat type/setting/passes/duration/zones); packages/domain/src/care-events.ts (internal confirmed-event preservation) | tests/domain/activity.test.ts, tests/domain/activity-bounds.test.ts, tests/domain/care-events.test.ts | Partial |
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
| TD-02 | R1 | apps/mobile/src/guidance/guidance-activity-api.ts, apps/mobile/src/guidance/guidance-snapshot.ts, packages/domain/src/guidance/prepare-guidance.ts (owner-scoped histories use separate effective and recorded cutoffs; normalized activity facts include applied revision provenance), apps/mobile/src/TodayCheckIn.tsx + apps/mobile/src/guidance/current-condition-state.ts (check-in captures goal, available minutes and temporary condition per request), packages/domain/src/guidance/prepared-input.ts + schemas.ts (Task 3.1: one deterministic prepared input from Passport, check-in, chemical/heat history, zones, available Shelf and Tools, goal, time and source completeness; nothing inferred; frozen; excludes reviewer, evidence and rules), apps/mobile/src/guidance/guidance-snapshot.ts (tool owner facts, service zones and heat copied as recorded) | tests/domain/guidance/prepare-guidance.test.ts ("task 3.1: one deterministic prepared guidance input", "canonical ordering of recorded values"), tests/domain/guidance/schemas.test.ts, tests/mobile/today-guidance-service.test.ts ("task 3.1 integration"), tests/mobile/guidance-snapshot.test.ts ("task 3.1: what the snapshot copies"), tests/mobile/guidance-activity-api.test.ts, tests/mobile/guidance-snapshot.test.ts, tests/mobile/today-guidance-service.test.ts, tests/domain/guidance/prepare-guidance.test.ts, tests/mobile/current-condition-state.test.ts, tests/mobile/today-check-in.test.tsx | Partial |
| TD-03 | R1 | packages/domain/src/guidance/prepare-guidance.ts (sorted setup gaps with a stable kind, subject, state of missing/unknown/contradictory/unsupported and a destination; plain wording with no field path or record id; an incomplete source returns `unavailable` naming the source; Task 3.2: a machine-readable reason and a safe owner-facing subject label on every gap, a `content_pending` state, a required Passport fact recorded as `unknown` is an honest gap, and non-blocking owner setup items for an unmatched manual product, an unavailable product, an unknown tool temperature and an unknown heat method), apps/mobile/src/TodayGuidance.tsx + guidance-copy.ts (`current_condition` gaps loop back to the check-in with the draft intact; other gaps follow their own destination; a source error names the area), apps/mobile/src/GuidanceGapResolver.tsx + apps/mobile/src/guidance/guidance-gap-state.ts (Task 3.2: the resolver surface - one heading, one announcement, one primary action per gap with the destination named, a deterministic order and collision-resistant keys, a failed read mapped to a `failed_source` item with a retry, and content that is not published shown with no action at all) | tests/domain/guidance/prepare-guidance.test.ts ("fail-closed and structured gaps", "task 3.2: targeted setup gaps"), tests/mobile/today-guidance.test.tsx, tests/mobile/today-guidance-service.test.ts, tests/mobile/guidance-gap-state.test.ts, tests/mobile/guidance-gap-resolver.test.tsx | Partial |
| TD-04 | R1 | apps/mobile/src/TodayGuidance.tsx, apps/mobile/src/guidance/guidance-copy.ts (steps, reasons, confidence, evidence, alternatives shown before execution; check-in summary shown before generation); Task 3.3: `apps/mobile/src/ProtocolPreview.tsx` + `apps/mobile/src/guidance/protocol-preview-model.ts` replace the raw engine dump with a fail-closed plain-language preview (route, owned items, ordered steps, waits/rinse/leave-in, confidence, evidence, limitations, alternatives, gated Start; raw engine text never rendered) | tests/mobile/today-guidance.test.tsx, tests/mobile/protocol-preview-model.test.ts, tests/mobile/protocol-preview.test.tsx, tests/mobile/accessibility.test.tsx | Partial |
| TD-05 | R1 | supabase/migrations/20261011082525_bitemporal_activity_guidance.sql, supabase/migrations/20261011090000_recommendation_runs.sql (stored normalized input is the replay authority; migrations are not applied to hosted Supabase), supabase/migrations/20261013175703_protocol_executions.sql (each execution references one stored run and deep-copies its stable step identities; the stored decision is never rewritten), packages/domain/src/protocol-execution.ts | tests/database/guidance-activity-history.test.ts, tests/database/recommendation-runs.test.ts, tests/mobile/recommendation-run-api.test.ts, tests/mobile/today-guidance-service.test.ts, tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution.test.tsx | Partial |
| TD-06 | R1 | apps/mobile/src/TodayGuidance.tsx (generating and viewing produce no recorded wash, application or heat event), apps/mobile/src/ProtocolExecution.tsx (mounting, viewing and arming record nothing; only an explicit start and confirmed actions persist) | tests/mobile/today-guidance.test.tsx, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-07 | R1 | packages/domain/src/protocol-execution.ts (confirmed complete/skip/substitute/modify as history; deviation free text is history-only), supabase/migrations/20261013175703_protocol_executions.sql (owner-isolated idempotent persistence; migration not applied to hosted Supabase), apps/mobile/src/guidance/protocol-execution-api.ts, apps/mobile/src/ProtocolExecution.tsx + apps/mobile/src/guidance/protocol-execution-state.ts (explicit start, confirmed-only history, separate "Planned steps" and "Actually done" sections; completion result carries confirmed events only) | tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution-api.test.ts, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-08 | R1 | packages/domain/src/protocol-execution.ts (pause/resume/abandon/complete transitions; partial and abandoned executions preserve confirmed actual events and never imply remaining steps occurred), supabase/migrations/20261013175703_protocol_executions.sql (revision-guarded transitions, operation-idempotent retries), apps/mobile/src/ProtocolExecution.tsx + apps/mobile/src/guidance/protocol-execution-state.ts (pause/resume/stop/finish surface with retry reusing the same operation id; owner change/unmount discards in-flight work) | tests/domain/protocol-execution.test.ts, tests/database/protocol-executions.test.ts, tests/mobile/protocol-execution-api.test.ts, tests/mobile/protocol-execution.test.tsx, tests/mobile/protocol-execution-state.test.ts | Partial |
| TD-09 | R1 | packages/domain/src/guidance/reviewed-content.ts (withdrawn content stops execution; staleness propagation not yet built) | tests/domain/guidance/reviewed-content.test.ts | Partial |
| TR-01 | R2 | packages/domain/src/care-events.ts (internal confirmed-event ledger; owner-scoped server join deferred to I5.4) and packages/domain/src/wash-count.ts (named-unit counting evidence) | tests/domain/care-events.test.ts, tests/domain/wash-count.test.ts | Partial |
| TR-02 | R2 | packages/domain/src/wash-count.ts (two lathers in one wash count as one shampoo session; wash and shampoo-session are distinct named units) | tests/domain/wash-count.test.ts | Partial |
| TR-03 | R2 | packages/domain/src/wash-count.ts (application wash is not an elapsed wash after that application unless the rule explicitly says so) | tests/domain/wash-count.test.ts | Partial |
| TR-04 | R2 | packages/domain/src/wash-count.ts (optional reviewed manufacturer range preserved exactly, never collapsed to a single due number) | tests/domain/wash-count.test.ts | Partial |
| TR-05 | R2 | packages/domain/src/treatment-programme.ts (programme states and due-status evaluation) | tests/domain/treatment-programme.test.ts | Partial |
| TR-06 | R2 | packages/domain/src/treatment-programme.ts (completed snapshot stability) | tests/domain/treatment-programme.test.ts | Partial |
| TR-07 | R2 | packages/domain/src/treatment-programme.ts (interruption/resumption handling) | tests/domain/treatment-programme.test.ts | Partial |
| TR-08 | R2 | packages/domain/src/treatment-programme.ts (eligibility/due status without product claims) | tests/domain/treatment-programme.test.ts | Partial |
| CC-01 | R2 | `packages/domain/src/cue-check.ts`; `supabase/migrations/20261024090000_cue_checks.sql`; `apps/mobile/src/cue-check-api.ts`; `apps/mobile/src/cue-check-state.ts`; `apps/mobile/src/CueCheckEntryPoint.tsx`; `apps/mobile/src/CueCheckRoutines.tsx`; `apps/mobile/src/CueCheckJourney.tsx`; `apps/mobile/src/CueCheckDetail.tsx` | `tests/domain/cue-check.test.ts`; `tests/database/cue-checks.test.ts` (terminal-execution binding, server-confirmed actual use, owner isolation); `tests/mobile/cue-check-api.test.ts` (strict commands, no client-supplied owner/run/goal/confirmed-step facts); `tests/mobile/cue-check-integration.test.ts` (terminal-execution context → draft → receipt; no recommendation or execution mutation); `tests/mobile/cue-check-entry-point.test.tsx` (prompt only after a confirmed finish or stop; open instead of duplicate); `tests/mobile/protocol-execution.test.tsx` (prompt gating); `tests/mobile/cue-check-journey.test.tsx` (confirmed steps only; no recommendation or execution write); `tests/mobile/cue-check-wiring.test.tsx` | Partial |
| CC-02 | R2 | `packages/domain/src/cue-check.ts`; `supabase/migrations/20261024090000_cue_checks.sql`; `apps/mobile/src/cue-check-api.ts`; `apps/mobile/src/CueCheckForm.tsx`; `apps/mobile/src/CueCheckQuestion.tsx`; `apps/mobile/src/cue-check-copy.ts`; `apps/mobile/src/cue-check-form-model.ts` | `tests/domain/cue-check.test.ts`; `tests/database/cue-checks.test.ts` (unknown-aware immediate/delayed observations and validation); `tests/mobile/cue-check-api.test.ts` (notes, explicit unknown and offset-aware observedAt preserved; missing answers stay missing); `tests/mobile/cue-check-form.test.tsx` (skipped stays absent, "Not sure" is unknown, clear removes, style longevity only on later checks, notes exact within 2,000, no enum keys) | Partial |
| CC-03 | R2 | `supabase/migrations/20261024090000_cue_checks.sql`; `apps/mobile/src/cue-check-api.ts`; `apps/mobile/src/cue-check-state.ts`; `apps/mobile/src/cue-check-errors.ts`; `apps/mobile/src/CueCheckHistory.tsx`; `apps/mobile/src/CueCheckTimeline.tsx`; `apps/mobile/src/CueCheckVoidConfirmation.tsx` | `tests/database/cue-checks.test.ts` (append-only corrections/voids, list/detail history); `tests/database/export.test.ts`; `tests/database/deletion.test.ts`; `tests/mobile/cue-check-state.test.ts`; `tests/mobile/cue-check-integration.test.ts` (correction/void with exact revision, conflict reload, idempotent offline retry, owner switch, stale responses, pagination); `tests/mobile/cue-check-history.test.tsx` (revision timeline, removed label, no correction of removed); `tests/mobile/cue-check-journey.test.tsx` (immediate, later, correction, removal, conflict reload, offline retry, owner switch) | Partial |
| CC-04 | R2 | `apps/mobile/src/CueCheckSummary.tsx`; `apps/mobile/src/cue-check-records.ts` (renders `summarizePersonalOutcomes`) | `tests/domain/personal-outcome-summary.test.ts`; `tests/mobile/cue-check-summary.test.tsx` (counts, minimum sample, "Not sure" count, separate timing, active only); `tests/mobile/cue-check-journey.test.tsx` | Partial |
| CC-05 | R2 | `apps/mobile/src/CueCheckSummary.tsx`; `apps/mobile/src/cue-check-copy.ts` | `tests/mobile/cue-check-summary.test.tsx` (no causal, medical, score or advice wording); `tests/mobile/cue-check-form.test.tsx`; `tests/mobile/cue-check-history.test.tsx`; `tests/mobile/cue-check-entry-point.test.tsx` | Partial |
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

Increment 4 closure evidence for CC-01 to CC-05 (all remain Partial): `tests/mobile/cue-check-increment-journey.test.tsx`, `tests/database/cue-checks.test.ts` (including 'Increment 4 review fixes'), and `.superpowers/sdd/2026-10-21-increment-4-cue-check-personal-outcomes/increment-4-report.md`.

Increment 5 Task I5.0 hardening evidence (no requirement status changed; TR-01 to TR-08 remain Not started): `tests/database/cue-check-hardening.test.ts`, `tests/database/cue-check-concurrency.pg.test.ts` (opt-in real PostgreSQL), `tests/database/owner-isolation-scenarios.test.ts` and `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.0-report.md`.

Increment 5 Task I5.1 establishes the internal, deterministic confirmed-care-event ledger. TR-01 is Partial because event truth and exclusion rules are proven, while named-unit wash counting and the authenticated I5.4 server join are not yet built. TR-02 to TR-08 remain Not started. TL-04 remains Partial with preservation of independently recorded heat facts. Evidence: `tests/domain/care-events.test.ts` and `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.1-report.md`.

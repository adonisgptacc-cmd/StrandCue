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
| HP-01 Structured facts | Partial | `packages/domain/src/passport.ts` (pattern, diameter, density, porosity, structured `lengthMeasurement` {value, unit cm\\|in, precision, measuredOn} with a documented 300 cm bound; legacy numeric `lengthCm` kept read/replay-only and retirable, never mixed with inches — the record-level guard trigger in the same migration refuses a structured measurement while any unsuperseded legacy length is still recorded for that Passport (it reads the stored length facts, so a legacy length the projection can only report as ambiguous - unknown effective date, or conflicting overlapping entries - is still seen, and the same save has to retire it with an explicit null dated after that entry so the record never holds two current lengths), and submission schemas refuse numeric `lengthCm` writes exactly like the SQL validator; concerns, self-reported damage observation, goals, styling habits/frequency, environment sensitivities, heat preference as personal preference, reactions/avoidances, budget, notes); `apps/mobile/src/passport-editor.tsx`; `supabase/migrations/20261019120000_passport_condition_length_fields.sql`; `tests/domain/passport.test.ts`, `tests/database/passport.test.ts`, `tests/mobile/passport-editor.test.tsx` |
| HP-02 Chemical/service events with precision/zones | Implemented | `packages/domain/src/services.ts`, `apps/mobile/src/services.tsx`, `service-editor.tsx`; `tests/domain/services.test.ts`, `tests/database/services.test.ts`, `tests/mobile/services.test.ts` |
| HP-03 Current vs dated vs correction vs change | Implemented | `packages/domain/src/history.ts`, `supabase/migrations/20260924150000_activities_history.sql`; `tests/domain/history.test.ts`, `tests/mobile/history.test.ts` |
| HP-04 Mixed states and zone-specific facts | Partial | `naturalPattern: 'mixed'`, zone bounds in `20261004104838_activity_zone_bounds.sql`, `activity.ts` zones; not every Passport field supports per-zone values |
| HP-05 Goal-based completeness explanation | Implemented | `apps/mobile/src/MyHairOverview.tsx`, `apps/mobile/src/passport-completeness.ts` (per chosen goal, the facts its plan leans on and the plain-language questions that are still missing or answered "unknown"; no percentage, score or progress fraction anywhere; legacy `lengthCm` counts as the recorded length and mixed projections read as one current length plus one readable earlier entry); `tests/mobile/passport-completeness.test.ts`, `tests/mobile/my-hair-overview.test.tsx` |
| HP-06 Temporary current-condition without saving | Partial | `apps/mobile/src/TodayCheckIn.tsx`, `guidance/current-condition-state.ts`; session-only, no save flag. Task 3.1: the cosmetic vocabulary now also covers buildup, scalp discomfort, chemical-processing worry and heat worry, and zone-attached concerns are validated in the domain (`packages/domain/src/current-condition.ts`). Task 3.2: the check-in screen now offers the smallest accessible zone step (the existing service-zone taxonomy, optional areas, one concern attached per area, canonical order, no duplicates, no zone ever inferred), and the check-in survives a trip to My Hair, My Shelf or My Tools, a retry and a rerender without losing an answer. The draft lives in an owner-scoped session store, is never written to the Passport and is cleared when another owner is served, on a sign-out and on an account deletion. The check-in is applied to one request and never written to the Passport (`tests/domain/guidance/prepare-guidance.test.ts`, `tests/mobile/guidance-snapshot.test.ts`, `tests/mobile/guidance-gap-resolver.test.tsx`); for the outcomes the app may store privately (`needs_input`, `rule_conflict`, `unsupported`), the facts a generated plan read are kept in the owner-scoped private run record, which is the accepted Task 3.1 audit design, not the Passport |
| HP-07 Coarse city/timezone optional | Not started | — |

## Shelf, catalogue and product lifecycle

| Requirement | Status | Evidence |
|---|---|---|
| SH-01 Manual product + availability | Implemented | `packages/domain/src/shelf.ts`, `apps/mobile/src/shelf.tsx`, `shelf-editor.tsx`, `shelf-api.ts`; `tests/domain/shelf.test.ts`, `tests/mobile/shelf.test.ts`, `tests/database/shelf.test.ts` |
| SH-02 Confirmed catalogue match | Implemented | `MatchUserProductCommandSchema` (`confirmed: true`), `supabase/migrations/20260924190000_shelf_rpc.sql`; Task 2.2 adds catalogue search (`packages/domain/src/catalogue-search.ts`, `supabase/migrations/20261021120000_catalogue_search.sql`) and the search, exact-version comparison, explicit confirmation and rematch journey (`apps/mobile/src/CatalogueMatch.tsx`, `catalogue-match-copy.ts`, `catalogue-search-api.ts`); `tests/domain/catalogue-search.test.ts`, `tests/database/catalogue-search.test.ts`, `tests/mobile/catalogue-match*.test.tsx`, `tests/mobile/catalogue-search-api.test.ts`. Task 2.5 exercised search, secured unpublished detail and explicit matching on an API 34 x86_64 emulator against the disposable local stack; hosted owner isolation, physical-device and TalkBack evidence remain external gates |
| SH-03 Preserve manual entries + match history | Implemented | Revision history in shelf RPC + `shelf-history.ts`; a correction must materially change the brand, product name or category, and the audit reconstructs the state before a correction from the whole lineage (`packages/domain/src/shelf.ts`); `tests/database/shelf.test.ts`, `tests/domain/shelf.test.ts`, `tests/mobile/shelf.test.ts` |
| SH-04 Opened date/PAO/quantity/repurchase intent | Implemented | `packages/domain/src/shelf.ts` (opened date with day/month/year/unknown precision, expiry date, the owner's own period-after-opening wording, quantity band, repurchase intent, manual variant/size/barcode), `apps/mobile/src/shelf-editor.tsx`, `shelf-api.ts`, `supabase/migrations/20261020120000_user_product_shelf_facts.sql` (owner-entered fact columns, one jsonb facts patch that keeps "never answered" and "cleared" apart, export v3); `tests/domain/shelf.test.ts`, `tests/database/shelf.test.ts`, `tests/mobile/shelf.test.ts` |
| SH-05 Immutable published versions + states | Partial | `catalogue-intake.ts` version states; published immutability tested; reformulated/superseded/withdrawn lifecycle partial; Task 2.3: published rows are immutable in the database (publication guards, content-bound review, evidence binding) - `supabase/migrations/20261022120000_product_detail_publication.sql`, `tests/database/product-detail.test.ts`; no row is published, and reformulated/superseded version states are still partial |
| SH-06 Reformulation/withdrawal notification | Not started | — |
| SH-07 Directions/order/wait/rinse/frequency/activation/incompatibilities/claims | Partial | `packages/domain/src/guidance/reviewed-content.ts`, catalogue schemas; no consumer product-detail surface; Task 2.3 adds the consumer surface for exact-version directions, claim-scoped evidence and honest unpublished states (`packages/domain/src/product-detail.ts`, `apps/mobile/src/ProductDetail.tsx`, `catalogue_product_detail`); status stays Partial because **no directions, claims or evidence are published yet** |
| SH-08 Ingredients describe only | Partial | `catalogue-intake.ts`; no ingredient claim surface; Task 2.3 shows ingredients as label text only behind an explicit publication state, with no interpretation (`ProductDetail.tsx`, `tests/mobile/product-detail.test.tsx`); none are published yet, so status stays Partial |
| SH-09 Barcode/OCR/label/URL to candidates | Partial | `packages/domain/src/discovery-backlog.ts`; `tests/domain/discovery-backlog.test.ts`; no capture UI/server queue |
| SH-10 User corrections moderation queue | Partial | `discovery-backlog.ts` candidate states; no operator UI |

## Tools and heat

| Requirement | Status | Evidence |
|---|---|---|
| TL-01 Tool/model/type/settings/units/attachments/condition | Implemented | Task 2.4: owner facts with three states, settings with units, attachments, condition (`packages/domain/src/tools.ts`, `supabase/migrations/20261023120000_tool_owner_facts.sql`, `apps/mobile/src/tools.tsx`, `tool-editor.tsx`, `tool-form.ts`, `tool-api.ts`); `tests/domain/tools-owner.test.ts`, `tests/database/tools-owner.test.ts`, `tests/mobile/tool-editor.test.tsx`, `tests/mobile/tools-integration.test.tsx`. Task 2.5 exercised add, edit, correction, match, secured unpublished detail, history and archive on an API 34 x86_64 emulator against the disposable local stack; hosted owner isolation, physical-device and TalkBack evidence remain external gates |
| TL-02 Distinguish heat methods | Implemented | Task 2.4: direct-contact, heated-air, hooded, steam and unheated are distinct and explicit-unknown is separate; a diffuser is an attachment, unheated refuses any heated method, temperature and adjustable-yes (`packages/domain/src/tools.ts`, SQL core, `tool-form.ts`); `tests/domain/tools-owner.test.ts`, `tests/database/tools-owner.test.ts`, `tests/mobile/tool-form.test.ts` |
| TL-03 Unknown temperature not inferred | Implemented | `tools.ts` + `tests/domain/tools.test.ts` (wattage never implies temperature) |
| TL-04 Actual temperature/passes/duration/zones | Partial | `activity.ts` heat fields; not yet a Heat Coach |
| TL-05 Heat Coach | Partial | Local deterministic evaluator, owner-scoped assessment persistence and reviewed-copy lookup, authenticated Heat Coach surface, and trusted Today/protocol binding are implemented (`packages/domain/src/heat-coach.ts`, `supabase/migrations/20261026120000_heat_coach_assessments.sql`, `apps/mobile/src/HeatCoachEntry.tsx`, `apps/mobile/src/TodayGuidance.tsx`, `apps/mobile/src/ProtocolExecution.tsx`). Production rule publications remain empty/draft; real reviewed heat rules, distinct Human A/B approvals, device acceptance and dependency-policy clearance are outstanding. |
| TL-06 Technique alternatives | Partial | Local owner-facing preview and protocol binding preserve exact assessment, publication digest, tool/product versions and assessed prescription (`apps/mobile/src/guidance/protocol-preview-model.ts`, `supabase/migrations/20261030190000_validate_assessed_heat_steps.sql`). Synthetic tests cover alternatives and fail-closed states. Production technique content, independent Human A/B approval, device acceptance and dependency-policy clearance remain outstanding. |

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
| TD-02 Capture goal/time/condition/availability/history | Partial | `TodayCheckIn.tsx`, `guidance/prepare-guidance.ts`, `guidance-snapshot.ts`. Task 3.1: `packages/domain/src/guidance/prepared-input.ts` builds one deterministic prepared input (Passport baseline, temporary check-in with precedence, chemical and heat history, zones, available Shelf products and Tools with owner-recorded facts, goal, time, source completeness); it is trusted input only and nothing generates a plan from it yet. Task 3.2: the zone step is now enterable in the UI (the existing service-zone taxonomy, optional areas, one concern per area, canonical order, no duplicates), and the check-in survives a trip to a destination, a retry and a rerender. Photos, weather and Cue Check are not part of it |
| TD-03 Targeted questions before generation | Partial | `prepare-guidance.ts` gaps (each now states missing, unknown, contradictory or unsupported, names where to fix it, and uses plain wording); `TodayGuidance.tsx` loopback and per-gap destination. A failed or cut-short source stops preparation and names the area instead of producing a gap. Task 3.2: the `GuidanceGapResolver` surface (`apps/mobile/src/GuidanceGapResolver.tsx` + the pure `apps/mobile/src/guidance/guidance-gap-state.ts`) - one heading, one announcement, one primary action per gap with the destination named, a deterministic order and collision-resistant keys; a required Passport fact recorded as `unknown` is an honest gap; two services with the same presence state stay distinguishable without an id; a failed read becomes a `failed_source` item with one retry; content that is not published is shown with no action at all, so the owner is never sent to change their own records. A destination that the owner leaves still keeps the check-in, and the session draft is cleared when another owner is served |
| TD-04 Show route/reasons/evidence/confidence/alternatives | Partial | `TodayGuidance.tsx`, `guidance-copy.ts`; Task 3.3 replaces the raw engine dump with `apps/mobile/src/ProtocolPreview.tsx` + `apps/mobile/src/guidance/protocol-preview-model.ts`, a fail-closed plain-language preview (route, owned items, ordered steps, waits/rinse/leave-in, confidence, evidence, limitations, alternatives, gated Start). Status stays Partial because production reviewed content is still draft, so Today yields `content_pending` (`tests/mobile/protocol-preview-model.test.ts`, `tests/mobile/protocol-preview.test.tsx`, `tests/mobile/accessibility.test.tsx`) |
| TD-05 Immutable protocol snapshot | Implemented | `supabase/migrations/20261011090000_recommendation_runs.sql`, `20261013175703_protocol_executions.sql`; `tests/database/recommendation-runs.test.ts` |
| TD-06 Generating/viewing is not a real event | Implemented | `tests/mobile/today-guidance.test.tsx`, `protocol-execution.test.tsx` |
| TD-07 Record completed/skipped/substituted/modified | Implemented | `protocol-execution.ts`, `ProtocolExecution*.tsx`; protocol suites |
| TD-08 Pause/resume/abandon/partial | Implemented | `protocol-execution.ts`; protocol suites |
| TD-09 Stale on material content change | Partial | `reviewed-content.ts` withdrawal stops execution; staleness propagation partial |

## Wash counting, treatment, Cue Check, photos, weather, audit, reminders, AI

| Requirement group | Status | Evidence |
|---|---|---|
| TR-01 | Partial | Internal confirmed-care-event ledger and named-unit counting are proven; the authenticated owner-scoped server join exists and is cross-checked against the domain evaluator. Active-programme retention now protects only evidence that could contribute, rather than unrelated owner history. No trusted step-classification writer and no reviewed production rule exist, so production remains blocked or `needs_input` | `tests/domain/care-events.test.ts`, `tests/domain/wash-count.test.ts`, `tests/database/treatment-programmes.test.ts`, `tests/mobile/programme-integration.test.tsx` |
| TR-02 | Partial | Named-unit counting: two lathers in one wash count as one shampoo session; `wash` and `shampoo-session` are distinct named units | `tests/domain/wash-count.test.ts` |
| TR-03 | Partial | Application wash is not an elapsed wash after that application unless the rule explicitly counts it; same-day events are not assumed to be the same session | `tests/domain/wash-count.test.ts` |
| TR-04 | Partial | Optional reviewed manufacturer range is preserved exactly, never collapsed to a single due number; invalid/negative ranges rejected | `tests/domain/wash-count.test.ts` |
| TR-05 | Partial | Treatment-programme states and due-status evaluation are proven in the domain, re-derived by the server on every read, and shown in an owner-only mobile journey. Nothing derived is accepted from the client or stored as mutable truth. Production reviewed treatment content is still absent | `tests/domain/treatment-programme.test.ts`, `tests/database/treatment-programmes.test.ts`, `tests/mobile/programme-integration.test.tsx` |
| TR-06 | Partial | Completed snapshot stability is proven through the server and mobile client boundary; adding later source events cannot change the frozen completed result | `tests/domain/treatment-programme.test.ts`, `tests/database/treatment-programmes.test.ts`, `tests/mobile/programme-integration.test.tsx` |
| TR-07 | Partial | Missed/interrupted programmes requiring an approved resumption rule or `needs_input` are proven; pause/resume chronology, reviewed-rule binding and owner-facing recovery are covered | `tests/domain/treatment-programme.test.ts`, `tests/database/treatment-programmes.test.ts`, `tests/mobile/programme-integration.test.tsx` |
| TR-08 | Partial | Eligibility/due status without product-effectiveness claims is proven and rendered in plain language; the persistence layer stores no result claim and production guidance remains `content_pending` | `tests/domain/treatment-programme.test.ts`, `tests/database/treatment-programmes.test.ts`, `tests/mobile/programme-integration.test.tsx` |
| CC-01..CC-03 | Partial | Task 4.1 defines unknown-aware private observation contracts. Task 4.2 adds owner-only append-only persistence bound to a terminal trusted execution, copies only server-confirmed actual use, supports correction/void history, and includes that history in export and deletion. Task 4.3 adds the strict typed mobile client boundary and deterministic state machine (`apps/mobile/src/cue-check-api.ts`, `cue-check-errors.ts`, `cue-check-state.ts`; `tests/mobile/cue-check-api.test.ts`, `cue-check-state.test.ts`, `cue-check-integration.test.ts`). The visible Cue Check and Journey screens are not built yet. Task 4.4 adds the visible owner journey: an immediate prompt after a confirmed finish or stop, a Journey Check-ins view with routines, history, detail with revision timeline, correction, removal from active history and a later check-in (`CueCheckForm.tsx`, `CueCheckJourney.tsx`, `CueCheckDetail.tsx`, `CueCheckHistory.tsx` and companions; `tests/mobile/cue-check-form.test.tsx`, `cue-check-entry-point.test.tsx`, `cue-check-history.test.tsx`, `cue-check-journey.test.tsx`, `cue-check-wiring.test.tsx`, `protocol-execution.test.tsx`). Proven at component level against an in-memory fake of the five RPCs; there is no device, emulator, TalkBack, real-database UI or hosted evidence, so the rows stay Partial. J-01's closing Cue Check and J-02's optional later Cue Check are reachable for the Cue Check portion only |
| CC-04..CC-05 | Partial | The Journey Check-ins view renders the Task 4.1 `summarizePersonalOutcomes` wording unchanged with numerator, denominator and the explicit "Not sure" count, shows insufficient-sample wording before the minimum of 3 comparable answers, keeps immediate and later answers separate, counts active check-ins only, and adds no score, percentage, ranking, advice or causal wording (`CueCheckSummary.tsx`, `cue-check-records.ts`; `tests/mobile/cue-check-summary.test.tsx`, `cue-check-journey.test.tsx`). Component-level evidence only; summaries cover the check-ins loaded so far |
| Increment 4 closure | Alpha mechanism | Independent code, database, accessibility and wording reviews found no Critical or High issue after fixes (`ad1a6d1`, `20261024100000_cue_check_review_fixes.sql`); combined component journey `tests/mobile/cue-check-increment-journey.test.tsx`. Open: reaction-question safety handling and retention of copied steps and receipts. NOT RUN: device, TalkBack, hosted, real-database UI. See `increment-4-report.md` |
| Increment 5 Task I5.0 | Hardening baseline | Cue Check head-row, TRUNCATE, trusted-run, replay-convergence and `search_path` hardening (migrations `20261024120000`, `130000`, `140000`), a real two-session PostgreSQL proof and nine owner-isolation scenarios; no requirement status changed. TR-01..TR-08 remain Not started. See `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.0-report.md` |
| Increment 5 Task I5.1 | Canonical care events | Internal confirmed-only wash/application/heat ledger with stable occurrence identity, corrections/void exclusions, explicit non-care classifications, owner/execution/run bindings and independently known/unknown heat facts. I5.4 authenticated server construction remains mandatory. See `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.1-report.md` |
| Increment 5 Task I5.4 | Programme persistence mechanism | Owner-only enrolment, append-only lifecycle, server-built immutable completion snapshot, private receipts (30-day retention), export v6, cascade deletion, forced RLS, hardened definers, quotas, idempotency and two-session concurrency proof on a disposable local PostgreSQL. Reviewed rule content and a trusted step-classification writer do not exist, so production is honestly blocked (`rule-content-pending`). NOT RUN: hosted isolation, wire-level PostgREST/Auth, mobile UI, device, TalkBack/VoiceOver. See `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.4-report.md` |
| Increment 5 Task I5.5 | Programme mobile journey | Owner-only list, detail, enrolment, lifecycle actions, honest blocked states, immutable completion display and explicit owner-switch isolation are integrated into the mobile alpha. The UI consumes only server-derived evaluations and cannot manufacture counts, due status or reviewed content. See `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/task-i5.5-report.md` |
| Increment 5 Task I5.6 | Integration and review closure | One component journey proves accumulating washes, same-enrolment recomputation after a backdated source correction, honest unknown-date `needs_input`, frozen completion, every owner-switch render, and production `content_pending` with zero recommendation/catalogue/execution writes. A review-found retention defect is repaired by forward migration `20261025130000_programme_execution_retention_scope.sql`. Hosted isolation, real-database UI and device/screen-reader evidence remain NOT RUN. See `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/increment-5-report.md` |
| CC-06..CC-08 | Not started | No personal ranking, ranking explanation, learning loop or personal experiment exists; Cue Checks remain private observations and never change recommendations |
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

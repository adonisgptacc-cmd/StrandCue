# StrandCue Phase 1 Rebaseline Design

**Status:** Approved design direction, pending document review
**Date:** 23 September 2026
**Scope:** Phase 1 — Trusted Hair Data Foundation
**Product authority:** Owner-supplied *StrandCue Product Requirements Document v1.1 — Revised Audit Edition*, dated 23 September 2026

## 1. Capability

StrandCue Phase 1 will let a South African adult create a private account and maintain a trustworthy, longitudinal record of their hair characteristics, chemical services, owned products, owned tools, goals, preferences, and factual activities. Users can distinguish real-world changes from corrections, inspect history, export their data, and delete their account. Operators can verify claim-specific product facts through a restricted, audited workflow. Phase 1 produces no personalised recommendation, diagnosis, product ranking, or shopping advice.

The purpose of this rebaseline is to finish that capability from the repository's actual state. Existing implementations are retained when they satisfy the current product contract. No feature is considered complete merely because a plan, migration, screen, or test exists; completion requires current evidence through the required surface.

## 2. Authority and conflict resolution

The implementation uses the following authority order:

1. The owner-supplied PRD v1.1 dated 23 September 2026 governs product promises, scope, policy, and beta requirements.
2. `docs/PHASE_1.md` governs implementation detail where it does not conflict with the current PRD.
3. Accepted architecture decisions govern local implementation mechanics where they do not conflict with either document.
4. Existing plans describe intent but do not override current requirements or executable evidence.
5. Existing code is preserved unless it conflicts with a higher authority or cannot meet its acceptance requirement safely.

When two sources conflict, the reconciliation matrix records the conflict, selected rule, affected implementation, migration consequence, and acceptance evidence. Product-policy conflicts are resolved in favour of the current PRD. Engineering-mechanism differences may be retained when they satisfy the same invariant with equal or stronger safety and auditability.

Two known conflicts are resolved now:

- The beta recovery objectives are RPO no greater than 1 hour and RTO no greater than 4 hours, matching the current PRD. The older 24-hour/8-hour targets are retired.
- The current PRD's append-only requirement is treated as a semantic invariant, not a mandate to rewrite every entity into one physical table. Feature-specific immutable revision/event tables are acceptable when they preserve prior truth, distinguish corrections from changes, support deterministic reconstruction, and prevent destructive client updates.

## 3. Current repository baseline

The repository already contains meaningful Phase 1 work:

- Expo Router / React Native mobile application and shared TypeScript domain package.
- Supabase Auth account foundation, verified-email onboarding, private usernames, password recovery parsing, and secure-storage boundaries.
- Hair Passport current-state and immutable field-change history.
- Chemical service occurrences, zones, corrections, presence observations, and owner isolation.
- Database migrations and domain contracts for brands, products, product versions, user products, tool brands, tools, user tools, activities, heat links, analytics consent, account/session information, exports, deletion, session revocation, and restore tombstones.
- Settings/account screens, export screens, deletion screens, support boundaries, and signed Android build configuration.
- Unit, database, mobile-boundary, and governance test suites.

The baseline is not release-ready:

- `npm run verify` currently stops at TypeScript compilation because `ActivityScreen.tsx` and `ActivityVoidScreen.tsx` contain invalid JSX.
- The acceptance matrix predates later migrations and screens, so its Open/Partial statuses are not a reliable description of the current repository.
- My Shelf and My Tools do not yet have complete consumer journeys and current device evidence.
- Activity screens are unfinished, and activity idempotency, duplicate review, history integration, and device behavior are not proven end to end.
- Product verification and provenance require a complete restricted operator workflow and permission evidence.
- Signed builds, real email/recovery, accessibility, poor-network behavior, performance, backup recovery, provider settings, and operational ownership still require production-like evidence.

## 4. Rebaseline workflow

### 4.1 Stage A — Restore a green engineering baseline

The first implementation plan fixes or cleanly completes the unfinished Activity UI until the canonical verification command passes. It also replays committed migrations against a fresh local Supabase environment and records any environment-dependent exclusions explicitly.

Exit conditions:

- TypeScript compilation passes for all workspaces.
- Unit and integration tests pass.
- Coverage is measured and reported; uncovered critical paths are listed.
- Control-plane validation passes.
- Expo web export passes as a build smoke test.
- A fresh local migration replay succeeds.
- The branch contains no unexplained generated or test-result artifacts.

### 4.2 Stage B — Build the PRD-to-code reconciliation matrix

Every normative Phase 1 requirement receives a stable requirement ID and one status:

- **Proven complete:** implementation exists and the required automated, API, device, or operational evidence passes.
- **Implemented, unverified:** implementation exists but the required evidence surface has not been exercised.
- **Partial:** only part of the user-visible promise or invariant exists.
- **Missing:** no implementation exists.
- **Conflict:** existing behavior or documentation contradicts the current PRD.
- **External gate:** completion depends on a provider, device, legal review, named owner, or production configuration.

Each row records the authoritative requirement, affected capability, code or migration references, test references, missing evidence, owning milestone, and release impact. The matrix replaces status inference from commit messages or unchecked historical plans.

### 4.3 Stage C — Complete product capabilities

Work is split into independently reviewable capability plans:

1. Activity and history stabilization.
2. My Shelf and claim-specific provenance.
3. My Tools and explicit heat-capability unknowns.
4. Restricted verification operations and audit trail.
5. Onboarding, navigation, settings, export, and deletion journey integration.
6. Offline drafts, conflicts, retry idempotency, pagination, and large-data behavior.

Each capability plan starts from existing schema and contracts, uses test-driven changes, and closes its acceptance rows before the next release gate. Schema rewrites require evidence that the current model cannot satisfy a current invariant.

### 4.4 Stage D — Complete cross-cutting quality systems

Cross-cutting work includes:

- GitHub Actions for formatting, linting, type checking, unit/integration tests, build smoke, dependency audit, and selected end-to-end tests.
- At least 80% automated coverage for project-authored testable code, with security and temporal invariants tested directly even if aggregate coverage is already above target.
- Maestro coverage for critical Android journeys.
- PostHog analytics only after optional consent, with an allowlisted event schema and no email, username, notes, free text, hair payloads, or raw record identifiers.
- Sentry crash reporting with payload scrubbing and environment separation.
- WCAG 2.2 AA automated checks plus manual TalkBack, large-text, focus-order, contrast, and touch-target evidence.
- Performance and poor-network checks on the declared South African Android device matrix.

### 4.5 Stage E — Prove beta readiness

Beta readiness requires:

- Signed Android build distributed through an internal test track.
- Real email verification and password recovery on cold and warm app starts.
- Fresh migration replay and authenticated RLS/API security suite.
- Backup and restore rehearsal proving RPO at or below 1 hour and RTO at or below 4 hours.
- Restore-time tombstone reapplication before service reopens.
- Confirmed provider region, subprocessors, cross-border safeguards, and retention settings.
- Named privacy, support, security-review, and verification-operator owners.
- POPIA review, accessibility audit, security review, and acceptance evidence attached to the release decision.
- Every Phase 1 acceptance row Proven complete or explicitly removed from Phase 1 through a new product decision.

The release status remains HOLD until a recorded gate review changes it.

## 5. Architecture and component boundaries

### 5.1 Mobile application

The mobile application owns presentation, form state, accessible interaction, owner-keyed drafts, offline feedback, and calls to typed data-access functions. Screens do not implement authorization or invent server state. User-visible language distinguishes current facts, historical facts, corrections, unknown values, unverified facts, and unavailable network state.

Feature screens remain separated by capability: Passport, Services, Shelf, Tools, Activity/History, and Settings/Privacy. Shared UI primitives provide labels, roles, focus behavior, error presentation, loading states, and minimum 48 dp targets.

### 5.2 Shared domain package

The domain package owns schemas, value constraints, date precision, correction semantics, projection rules, stable operation identifiers, and response contracts that can be tested without React Native or Supabase. It does not contain provider credentials, UI behavior, or direct database calls.

### 5.3 Supabase/PostgreSQL

PostgreSQL is the source of truth. Every exposed table has RLS. Consumer access combines authenticated-role targeting with owner predicates; role membership alone is insufficient. Updates require both `USING` and `WITH CHECK`. Privileged functions have explicit execution grants, fixed `search_path`, actor checks, input validation, and audit records. `SECURITY DEFINER` is used only where an invariant cannot be enforced safely under invoker rights.

Temporal records are append-only from the consumer boundary. Corrections reference the superseded event or revision. Current-state projections are rebuildable from immutable facts. Hard deletion occurs only through the approved account-lifecycle process and does not permit deleted personal data to reappear after backup restoration.

### 5.4 Operator surface

Phase 1 does not require a public administration application. Verification may use a minimal restricted server-side or repository-operated tool. It must authenticate the operator, authorize through non-user-editable claims or server-held credentials, validate claim-specific provenance, record before/after state and actor, and prevent consumers from setting verification state.

### 5.5 Observability and analytics

Operational logs, Sentry, and PostHog use separate allowlists. Operational logs diagnose system behavior without hair payloads. Sentry records scrubbed failures. PostHog records consented product events only. Consent withdrawal stops future analytics collection without affecting core functionality.

## 6. Core data flow

For a user-authored change:

1. The mobile form validates shape and preserves the user's draft.
2. A typed API function submits the actor, stable operation ID, base revision, effective date or precision, and explicit changed fields.
3. The server validates authentication, ownership, expected revision, domain constraints, and idempotency.
4. The transaction appends an immutable revision or event and updates or refreshes the rebuildable current projection.
5. The response returns the accepted revision and current projection.
6. The client clears the draft only after confirmed success.

For a conflict, the server returns the current version and a machine-readable conflict result. The client retains the draft and offers review/rebase; it never silently overwrites or drops user input.

For a correction, the user identifies a prior fact, supplies the replacement and reason, and creates a new correction record. Default history hides superseded values while preserving the audit chain.

For verification, the operator attaches a source to one claim, records its trust tier and review timestamps, and changes only that claim's verification state. Product-level scientific truth booleans are prohibited.

## 7. Failure and recovery behavior

- Validation errors identify the field and corrective action without exposing internal schema details.
- Authentication and recovery messages do not reveal whether an email is registered.
- Network failures retain local drafts and offer bounded retry.
- Stable operation IDs make retry safe and surface possible duplicates for human review rather than automatic merging.
- Stale revision conflicts preserve both server truth and the unsaved user draft.
- Export and deletion run as resumable state machines with visible status and support escalation.
- Analytics or crash-reporting failure never blocks core recordkeeping.
- Restore procedures apply deletion tombstones and validate RLS before reopening service.

## 8. Security, privacy, and policy invariants

- Adults only through self-attestation; no date of birth or external identity verification.
- No legal name, ID number, phone number, street address, precise GPS, race, or ethnicity.
- Email and password remain in Supabase Auth; application tables do not duplicate password material.
- Mobile clients contain only public/publishable configuration, never service-role or secret keys.
- All private records are owner-scoped and tested against cross-user access through the actual API surface.
- Unknown is a first-class value and is never replaced with a plausible guess.
- Evidence is claim-specific, source-linked, versioned, and trust-tiered.
- Product and tool history is not rewritten when a catalogue item is reformulated or corrected.
- Data exports are machine-readable and user-meaningful; internal identifiers are excluded unless necessary to preserve relationships.
- Consent is purpose-specific and withdrawal is append-only.
- Account deletion immediately blocks access, revokes sessions, purges in dependency order, and survives restoration.
- Logs and analytics exclude hair payloads, free-text notes, email, username, and secrets.

## 9. Testing and evidence model

Testing uses a pyramid with explicit evidence boundaries:

- **Domain tests:** schemas, unknown states, dates, projections, corrections, operation IDs, conflict and duplicate behavior.
- **Database tests:** constraints, RLS, direct-write denial, privileged-function grants, idempotency, correction chains, export/deletion states, and rebuildability.
- **API integration tests:** authenticated PostgREST/RPC behavior with at least two users and expired or revoked sessions.
- **Component tests:** validation, accessible labels, loading, empty, error, offline, retained-draft, and conflict states.
- **Maestro device tests:** onboarding, recovery, Passport, Services, Shelf, Tools, Activity, Settings, export, deletion, and account switching.
- **Operational tests:** migration replay, backup/restore, tombstone reapplication, alerting, email delivery, provider configuration, and incident procedures.

No acceptance case is complete until its required evidence is current, reproducible, and linked from the reconciliation matrix.

## 10. Non-goals

Phase 1 does not implement:

- Personalised recommendations or deterministic decision rules.
- Heat Coach, Today's Protocol, treatment schedules, or due reminders.
- AI-generated hair advice or diagnostic interpretation.
- Product ranking, fit scores, automatic ingredient analysis, or purchase recommendations.
- Barcode scanning, image recognition, URL import, retailer comparison, affiliate commerce, advertising, or subscriptions.
- Community reviews, public profiles, social features, or aggregated outcome recommendations.
- Weather-driven guidance or automatic environmental decisions.

Schema fields needed to preserve later compatibility are allowed only when they have a documented Phase 1 purpose or prevent an irreversible migration. Unused endpoints and speculative services are excluded.

## 11. Plan decomposition

This design produces separate implementation plans so each deliverable can be reviewed and verified independently:

1. **Baseline recovery and evidence refresh** — restore the green gate, replay migrations, and publish the reconciliation matrix.
2. **Activity and unified history completion** — finish the in-progress activity work and close factual logging invariants.
3. **Shelf, provenance, and verification completion** — finish consumer product journeys and restricted claim verification.
4. **Tools completion** — finish consumer tool journeys and explicit capability unknowns.
5. **Journey integration and resilience** — onboarding/navigation/settings, offline drafts, conflicts, pagination, export, and deletion.
6. **Quality systems** — CI, coverage, analytics, crash reporting, accessibility, performance, and Maestro.
7. **Beta operations and release evidence** — devices, real email/recovery, security, backups, POPIA operations, and final gate review.

Plans 2–5 may be reordered after Plan 1 publishes the reconciliation matrix. Plans 6 and 7 depend on stable user journeys but their configuration and documentation tasks may begin earlier when they do not obscure capability failures.

## 12. Decisions reserved for external confirmation

The following do not block baseline recovery or reconciliation, but must be decided before their owning beta gate:

- Production Supabase project, region, and paid backup capability.
- Owned HTTPS domain and final Android application identifier.
- Transactional email provider and sender domain.
- Named Information Officer, privacy-request owner, support owner, security reviewer, and verification operator.
- Approved PostHog and Sentry hosting regions and subprocessors.
- External POPIA legal reviewer and accessibility auditor.
- Internal-testing device owners and Google Play Console access.

These decisions remain explicit external gates; implementations must not hardcode guessed providers, people, domains, or credentials.

## 13. Success condition

The rebaseline is successful when the repository has one current Phase 1 contract, one evidence-backed reconciliation matrix, green automated verification, complete consumer recordkeeping journeys, enforced ownership and historical truth, tested export/deletion and recovery, and an explicit beta-readiness decision supported by current technical, device, security, accessibility, privacy, and operational evidence.

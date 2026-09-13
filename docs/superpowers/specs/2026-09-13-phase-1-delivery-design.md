# StrandCue Phase 1 Delivery Design

Date: 13 September 2026

Status: Approved for implementation planning

Authority: Delivery design for `docs/PHASE_1.md`; it amends native platform scope to Android-only but does not otherwise replace the product contract

## 1. Purpose

This design turns the existing Phase 1 contract into a sequence of independently reviewable delivery increments. It incorporates the current repository-cleanup work, the remaining product capabilities, and the evidence required for an Android-only external beta.

Phase 1 remains a private, factual cosmetic hair-care record for adults in South Africa. This design does not add recommendations, diagnosis, protocols, commerce, community features, or other later-phase behaviour.

The user's Android-only decision supersedes existing Phase 1 language that requires iOS release evidence. Phase 1A must update `docs/PHASE_1.md`, the acceptance matrix, and affected verification documents so the authoritative documents agree. Future iOS work requires a separate approved scope.

## 2. Current baseline

The account/Hair Passport foundation and Chemical Services vertical slice exist. Type checking, the active automated test suite, the control-plane audit, Expo web export, and the configured domain coverage threshold pass. The Chemical Services local Supabase Auth/PostgREST path has current evidence.

The baseline is not release-ready:

- The acceptance matrix contains 0 Complete, 17 Partial, and 8 Open cases.
- The supported development runtime is Node 24, while at least one local shell has used Node 25.
- The existing local dependency tree has reported invalid relationships and must be rebuilt reproducibly under Node 24.
- Thirteen moderate transitive npm advisories remain in Expo/router dependency chains; no high or critical advisory is currently reported.
- The repository, lint, and full CI workflow do not enforce linting even though the Phase 1 contract requires it.
- Coverage thresholds apply to shared domain TypeScript, not the mobile TSX, database, or end-to-end surfaces.
- Native Android, accessibility, recovery, poor-network, shared-device, performance, and backup/restore evidence is incomplete.

## 3. Delivery strategy

Use a phased, acceptance-gated delivery train. Each phase produces a coherent, testable increment and its own verification evidence. Work proceeds sequentially when a later phase depends on schemas or interfaces from an earlier phase; independent tasks inside a phase may be delegated in parallel only when they do not share files or state.

The rejected alternatives are:

1. A single big-bang Phase 1 branch. This would combine environment work, multiple data domains, privacy orchestration, and device qualification into a review surface too large to validate safely.
2. Ad hoc implementation by acceptance-case number. Many cases cross the same domain, database, API, mobile, and device boundaries; case-by-case work would duplicate foundations and produce inconsistent interfaces.

## 4. Definition of Phase 1 completion

Phase 1 is complete only when:

- P1-AC-01 through P1-AC-25 are marked Complete with current evidence.
- There are no unresolved critical or high security or data-loss findings.
- Every allowed moderate dependency advisory has a current, time-limited exception record.
- Fresh migrations reproduce the database, constraints, grants, RLS, and transactional functions.
- The primary adult record-keeping journey passes on a signed Android build on a real device.
- Recovery, account switching, export, deletion, backup/restore, accessibility, and poor-network cases pass their defined Android checks.
- CI passes type checking, linting, tests, coverage gates, metadata checks, dependency policy checks, migration/integration checks, and the web export smoke build.
- The scope audit confirms that no recommendation, diagnosis, protocol, or other later-phase behaviour has entered the product.

## 5. Cross-cutting engineering policies

### 5.1 Runtime and reproducibility

Node 24 is the supported local and CI runtime, matching `.nvmrc` and the repository engine contract. Contributors must perform clean installs using the committed lockfile. A verification run produced from an unsupported Node version is informative but is not release evidence.

The stabilization plan must define commands that fail clearly when the Node major version is unsupported and must prove that a clean install succeeds under Node 24.

### 5.2 Dependency security

Critical and high production dependency advisories block Phase 1. Moderate advisories may remain only through a documented exception containing:

- advisory identifier and affected dependency path;
- exposure by mobile, web, development, and production surface;
- reachability assessment;
- current mitigation;
- accountable owner;
- approval date, review date, and expiry date;
- safe upgrade or upstream resolution path.

Exceptions are time-limited and must fail verification after expiry. `npm audit fix --force` is prohibited as an automatic remedy because it may install incompatible or breaking Expo versions. Dependency changes must remain compatible with the selected Expo SDK and pass Expo's dependency validation.

### 5.3 Test-first delivery

All feature and bug-fix work follows RED, GREEN, REFACTOR:

1. Add a focused failing unit, integration, security, or E2E test.
2. Run it and record the expected failure.
3. Implement the smallest correct change.
4. Run the focused test and relevant surrounding suite.
5. Refactor without changing behaviour.
6. Run the phase verification gate and update acceptance evidence.

The existing 80% domain threshold remains a minimum, not a claim of whole-application coverage. Each new phase must define coverage or behavioural gates appropriate to its boundary. Database security invariants and Android journeys require direct tests even when line coverage is high.

### 5.4 Repository hygiene

The root `AGENTS.md` is a host-supplied, read-only context file. It must not be edited, moved, deleted, or committed as application source. If it interferes with local Git status, use a verified local-only exclusion such as `.git/info/exclude`; do not add a broad repository ignore that would hide a future intentional project instruction file.

Merged worktrees and branches may be removed only after confirming that their commits are reachable from `main`, their worktrees are clean, and the user authorizes deletion. Cleanup is not allowed to discard uncommitted or unmerged work.

## 6. Phase 1A: Engineering stabilization

### Goal

Create a reproducible and enforceable development baseline before adding another data domain.

### Deliverables

- PR #3 is merged and local `main` is synchronized. Completed on 13 September 2026.
- Node 24 is enforced for local verification and CI.
- A clean lockfile installation succeeds under Node 24 and `npm ls` reports no invalid required relationships.
- ESLint is configured for the TypeScript, React, and React Native sources without weakening type checking.
- `npm run verify` and GitHub Actions run linting and the dependency policy gate.
- The Phase 1 contract and acceptance evidence consistently identify Android as the only native release target.
- Moderate advisory exceptions are stored in a reviewed project document and checked for required fields and expiry.
- The host `AGENTS.md` is handled locally without modifying the synced file.
- Merged worktrees and branches are inventoried; cleanup remains a separately confirmed destructive action.
- Verification documentation states the actual coverage surface and does not present domain coverage as whole-application coverage.

### Acceptance impact

Phase 1A strengthens the shared evidence required by P1-AC-23, P1-AC-24, and P1-AC-25. It does not mark those cases Complete by itself.

### Exit gate

A fresh Node 24 environment can install from the lockfile and run the complete CI-equivalent verification suite. No high or critical production advisory exists, every remaining moderate advisory has a current exception, and lint failures block CI.

## 7. Phase 1B: Products, Shelf, provenance, and Tools

### Goal

Complete the private ownership and factual provenance model without introducing recommendations.

### Components

1. Product identity and immutable product versions, including successor relationships and ZA availability status.
2. Private manual/unknown products that can later be matched through explicit user confirmation without losing original provenance.
3. Field-scoped verification records and restricted operator mutations; no whole-product safety or scientific badge.
4. My Shelf ownership history with dated acquire, availability, finish, archive, correction, and provenance transitions.
5. My Tools with equivalent private ownership, version, correction, and archival semantics.
6. Owner-scoped reads, transactional mutations, idempotency, direct-write denial, and adversarial RLS tests for every new private entity.
7. Android list, detail, add, change, archive, correct, empty, loading, conflict, and failure states.

### Acceptance impact

Primary: P1-AC-05, P1-AC-10, P1-AC-11, P1-AC-12, P1-AC-13, and P1-AC-22.

Cross-cutting: P1-AC-15, P1-AC-16, P1-AC-17, P1-AC-18, P1-AC-23, and P1-AC-24.

### Exit gate

Product/Shelf/Tools contracts, migrations, RLS, transactional operations, mobile adapters, and Android component flows pass. Real authenticated Supabase and Android smoke evidence exists for the primary ownership journeys.

## 8. Phase 1C: Activities, account continuity, and privacy

### Goal

Complete factual activity recording and the account lifecycle required before real personal data is accepted.

### Components

1. Manual wash, tool, heat, style, treatment, trim, protective-style, and other factual activities with corrections, voids, idempotency, approximate dates, and no recommendation side effects.
2. Email, username, and password changes that preserve the permanent owner UUID and complete history.
3. Settings, help/safety boundary, optional analytics preference, and account-switch cleanup.
4. Recent-auth private export with owner-only JSON/CSV, expiring access, retention, status, and failure handling.
5. Deletion orchestration with immediate access block, session revocation, resumable purge, restricted job/tombstone retention, Auth deletion ordering, retry safety, and restore enforcement.
6. Adversarial API/database tests for ownership, direct history mutation, old JWTs, export isolation, and deletion retries.
7. Android UI paths for activities, settings, credential changes, export, deletion, and visible failure/retry states.

### Acceptance impact

Primary: P1-AC-03, P1-AC-04, P1-AC-14, P1-AC-19, P1-AC-20, and P1-AC-21.

Cross-cutting: P1-AC-01, P1-AC-07, P1-AC-15, P1-AC-16, P1-AC-17, P1-AC-18, P1-AC-22, P1-AC-23, and P1-AC-24.

### Exit gate

An adult user can manage credentials, record and correct factual activities, export their complete data, and request deletion through authenticated Android flows. Privacy jobs and tombstones survive failure and retry conditions without exposing or resurrecting deleted personal data.

## 9. Phase 1D: Android release qualification

### Goal

Convert contract and integration coverage into production-like evidence for an Android-only external beta.

### Supported release surface

- Android is the sole Phase 1 native release target.
- iOS implementation and validation are deferred beyond Phase 1 and are not Phase 1 release gates.
- Engineering uses Android emulators for rapid feedback.
- Final evidence requires a signed Android development/release candidate installed on at least one real device.
- The external-beta candidate is distributed through a Google Play internal test track as a signed Android build.

### Qualification suites

1. Verified signup, interrupted onboarding, sign-in, session expiry, and account switching.
2. Password recovery from cold and warm app states, including expired, reused, malicious, and verifier-missing links.
3. Passport, Chemical Services, Shelf, Tools, activities, settings, export, and deletion journeys against a clean real Supabase environment.
4. TalkBack, focus order, labels, non-colour status, large text, contrast, and minimum touch-target checks.
5. Slow, interrupted, and unavailable network behaviour with explicit unsaved/retry states and retained owner-scoped drafts.
6. Pagination and representative data-volume performance on a declared mid-range Android device.
7. Backup creation and restore rehearsal, including deletion-tombstone reapplication.
8. Scope inspection for prohibited recommendation, diagnostic, protocol, commerce, community, and automatic-inference behaviour.

### Acceptance impact

Phase 1D supplies the final device and operational evidence for P1-AC-01 through P1-AC-25. A case is marked Complete only when all of its required layers have passed; Phase 1D does not waive a missing implementation from an earlier phase.

### Exit gate

All 25 acceptance cases are Complete, the signed Android candidate passes the declared real-device matrix, and no unresolved release blocker remains.

## 10. Interfaces and data flow

Each product domain follows the existing boundary pattern:

1. Shared domain schemas validate commands and returned records.
2. The mobile form produces a validated command without accepting owner IDs from UI input.
3. A mobile API adapter invokes a narrow transactional database operation.
4. The database derives the owner from authenticated claims, validates expected revision and idempotency, appends immutable history, and updates a rebuildable current projection atomically.
5. Owner-scoped reads return consistent success/error envelopes and cursor metadata.
6. Secure local draft storage is keyed by owner and record identity, retained until confirmed save, and cleared at verified account boundaries.
7. The UI presents saved, unsaved, loading, conflict, retry, correction, and historical states without exposing raw identifiers or internal errors.

Export and deletion add restricted operational jobs outside ordinary owner history. These jobs use narrow privileged execution with explicit ownership and transition validation and remain inaccessible as general consumer tables.

## 11. Error handling and observability

All new operations use the Phase 1 response envelope and defined error codes. Invalid input fails at the boundary. Foreign-resource access returns not-found parity. Network timeout after commit is resolved with the same idempotency key. Stale revisions preserve user input for review. Failed writes never appear saved.

Production-facing messages remain generic and actionable. Logs may contain request IDs, coarse operation names, timing, and redacted error categories, but never passwords, tokens, callback URLs, emails, usernames, notes, hair narratives, exact service history, product names, or export contents.

Optional product analytics remains off unless the adult user explicitly enables it. Analytics refusal cannot block any core feature.

## 12. Evidence and documentation

`docs/verification/phase-1-acceptance-status.md` remains the release matrix. Every implementation PR updates the relevant case rows with current evidence or explicitly states why no status changes.

Phase-specific review documents record:

- exact commands, runtime, and environment;
- test counts and skipped tests with reasons;
- coverage scope and thresholds;
- database/API and Android surfaces exercised;
- security findings and dependency exceptions;
- open limitations and release blockers.

The README must continue to describe the repository as a development foundation until all release gates pass.

## 13. Plan decomposition

This design is implemented through four separate plans:

1. Phase 1A engineering stabilization.
2. Phase 1B Products/Shelf/Tools.
3. Phase 1C activities/account/privacy.
4. Phase 1D Android release qualification.

The Phase 1A plan is written first. Later plans are written immediately before their phase so they incorporate verified interfaces and lessons from earlier work without reopening the approved Phase 1 scope.

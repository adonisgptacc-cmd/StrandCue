# Chemical Services and Zones Design

**Date:** 11 September 2026
**Status:** Approved for implementation planning
**Scope:** Phase 1 chemical-service recording, correction, presence observations, zones, and reported service heat. This design targets P1-AC-08 and P1-AC-09.

## Goal

Let an authenticated StrandCue owner record factual chemical services, including Keratin and Nanoplasty, preserve overlapping services and precise region/segment zones, correct mistakes without rewriting history, and represent unknown chemistry or heat without inference.

This slice does not recommend treatments, calculate risk or damage, infer chemical actives, schedule follow-ups, or decide whether an earlier treatment has disappeared.

## Chosen approach

Build a complete vertical slice using the existing Passport architecture: shared Zod contracts, immutable PostgreSQL history, narrow idempotent RPCs, owner-scoped reads, and a focused React Native flow. Chemical services remain their own domain rather than being forced through the Passport patch projector. The implementation will reuse shared date contracts and security conventions but will not extract a generic history framework during this slice.

Alternatives rejected:

- A database-only slice would leave P1-AC-08 and P1-AC-09 without a user-facing acceptance path.
- A generic event/history framework would introduce abstraction before Shelf, Tools, and Activities reveal their distinct invariants.

## Domain model

### Service occurrence

A chemical service has a stable UUID and one immutable revision chain. The supported service types are:

- `permanent-colour`
- `demi-permanent`
- `semi-permanent`
- `highlights`
- `balayage`
- `bleach-or-lightener`
- `colour-remover`
- `keratin`
- `brazilian-smoothing`
- `nanoplasty`
- `relaxer`
- `texturiser`
- `perm`
- `chemical-straightening`
- `other`

An occurrence revision contains a complete factual payload rather than a patch. Its fields are:

- service type;
- reported date using the existing day/month/year/unknown precision contract;
- optional reported product or chemical-system name, trimmed and limited to 200 UTF-16 code units;
- optional notes, trimmed and limited to 2,000 UTF-16 code units;
- one or more unique zone pairs;
- optional reported heat facts.

`other` requires a short custom service label. Other service types reject a custom label. Unknown product/system and unknown heat remain absent or explicitly unknown; the service name never supplies them automatically.

### Zones

A zone is a pair of independently selected values:

- Region: `whole-head`, `front`, `crown`, `nape`, `other`, or `unknown`.
- Segment: `entire-strand`, `roots`, `mid-lengths`, `ends`, `other`, or `unknown`.

At least one pair is required. Duplicate pairs are rejected, and accepted pairs are canonically sorted before persistence so equivalent retry payloads have stable identity. Multiple and overlapping pairs are retained exactly. The system does not collapse `front + roots` and `crown + ends` into a whole-head assumption.

### Reported heat

Reported service heat is a separate factual record associated with the specific service revision. It supports:

- method: `flat-iron`, `blow-dryer`, `hood-dryer`, `other`, or `unknown`;
- optional temperature in Celsius;
- optional non-negative integer passes;
- optional non-negative duration in minutes;
- source: `user-reported` or `user-estimated`.

Temperature, passes, and duration may all be unknown. No value is inferred from `nanoplasty`, `keratin`, a product name, or another field. This initial `heat_events` shape is service-linked; the later Activities slice may extend the same table with activity linkage without changing these service records.

### Revisions, corrections, and observations

The initial `baseline` revision contains the complete occurrence. A `correction` revision also contains a complete replacement payload plus `correctsId` and a trimmed reason of 1–500 UTF-16 code units. Corrections may form a linear chain, but branching, cycles, foreign targets, and correcting an already superseded revision are rejected.

A statement about whether an effect remains is not part of the occurrence and is not a correction. It is an append-only service observation with its own effective date, recorded time, and `present`, `not-present`, or `unknown` value. A create request may include an initial observation, but the transaction stores it separately. Later observations do not erase or update the original occurrence. Observation correction is outside this first acceptance slice; an incorrect observation remains auditable and will be handled when the complete activity/correction framework is added.

## Database design

Create a new migration after the existing foundation migration with these tables:

- `public.chemical_services`: stable `id`, `user_id`, current revision number, created time, and composite `(id, user_id)` uniqueness.
- `public.service_revisions`: immutable sequence, complete payload fields, effective interval columns, recorded time, source, correction link/reason, and composite ownership keys.
- `public.service_zones`: immutable zone pairs keyed to a service revision and owner; a unique constraint prevents duplicate pairs within one revision.
- `public.heat_events`: immutable optional heat facts keyed to a service revision and owner.
- `public.service_observations`: append-only effect-status observations keyed to a stable service and owner.
- `strandcue_private.service_operations`: owner/operation-key payload and stored result for retry idempotency.

All private relationships use composite owner foreign keys so a trusted or faulty writer cannot attach one owner's zone, heat event, correction, or observation to another owner's service.

The stable service row holds concurrency state only. Current facts are the final replacement revision, not mutable columns on the stable row. List/detail queries return the active complete revision while optionally including the private correction audit.

## Operations and data flow

Expose narrow public RPC wrappers backed by private cores:

- `record_service(operationId, serviceId, payload, initialObservation?)` creates the stable service, baseline revision, zones, optional heat event, and optional separate presence observation atomically. `serviceId` is a permanent client-generated UUID, distinct from the retry operation UUID, so a delayed duplicate cannot create a second real-world event after operation-key retention expires.
- `correct_service(operationId, serviceId, expectedRevision, correctsId, reason, payload)` appends one complete replacement revision and its zones/heat atomically.
- `observe_service(operationId, serviceId, effectiveDate, effectStatus)` appends a real-world presence observation atomically.
- `list_services()` returns owner-visible active facts ordered by effective interval and recorded time, with uncertainty preserved.
- `get_service(serviceId, includeAudit)` returns one owner-visible detail/history result or the same not-found outcome for absent and foreign IDs.

Every write derives the owner from authenticated request claims, locks the owner's active profile and stable service where applicable, validates the entire payload before inserting anything, and stores/replays the result for the same operation key and payload. Reusing a key with a different payload fails. A stale expected revision returns `revision-conflict`; it never overwrites the newer correction.

## Authorization and privacy

Follow the existing constrained `strandcue_mutator` boundary. The public wrappers are invokers; private mutation cores have fixed empty search paths, independently require a verified active owner, and are owned by the non-login, non-superuser, non-`BYPASSRLS` mutation role.

For every new table:

- enable and force RLS;
- revoke automatic public/anonymous/authenticated write privileges;
- grant authenticated owners only the required `SELECT` surface;
- allow the constrained mutator only the exact insert/update columns it needs;
- require both owner equality and an active profile in policies;
- deny direct update/delete of revisions, zones, heat events, and observations;
- avoid emails, usernames, notes, chemical history, and RPC payloads in logs.

Responses and errors must not disclose another owner's record or database internals. All string and numeric limits are enforced in both Zod and PostgreSQL validation.

## Mobile experience

Add a `Services` destination beside Passport, History, and Settings. Keep service UI in focused modules rather than expanding `records.tsx` with the full feature.

The Services list shows service type, reported date precision, zones, current reported effect status, and explicit unknown labels. It offers an empty state and an `Add a service` action. Detail shows the occurrence, zones, optional product/system, optional reported heat, later observations, and a private correction audit toggle.

The add/correct form:

- separates region from segment and permits multiple pairs;
- includes Nanoplasty as a first-class option;
- never pre-fills chemistry or heat from service type;
- uses explicit `Unknown` controls;
- distinguishes `Correct a mistake` from `Record whether the effect is still present`;
- retains an owner-keyed secure draft and a stable operation ID until save confirmation;
- retains user input on validation, network, or revision-conflict failure.

No service screen contains suitability, protocol, due-date, damage-score, diagnostic, or recommendation language.

## Error handling

Client inputs are parsed before an RPC call, and the database repeats authoritative validation. Invalid fields produce a general user-safe prompt with field-local cues where possible. Authentication/account-state, not-found, idempotency mismatch, and revision conflict use stable codes already anticipated by the Phase 1 contract.

Writes are atomic. A failure before commit leaves no service, revision, zone, heat, observation, or operation result. A timeout after commit is retried with the same operation ID. Duplicate-looking independently entered services remain separate real-world events; no timestamp-based merge occurs.

## Testing and acceptance evidence

Implementation follows red-green-refactor in this order:

1. Domain tests for every service enum, unknown handling, date precision, zones, heat values, trimming, limits, strict-object rejection, correction metadata, duplicate zones, and nonmutation.
2. PostgreSQL tests for fresh migration replay, atomic create/correct/observe operations, retry idempotency, stale revision handling, correction-chain rules, and exact round-trip serialization.
3. Adversarial database tests for owner A, owner B, anonymous, unverified, inactive, and direct-table attackers; include owner reassignment, cross-owner relationship swaps, direct revision rewrites/deletes, and private-core calls.
4. Mobile API-contract and component tests for add, correction, observation, unknown values, separate region/segment selection, retained drafts, conflicts, loading errors, and accessible labels.
5. A focused UI/device acceptance pass recording Keratin followed by Nanoplasty with overlapping zones and unknown heat/chemistry, then recording `front + roots` and `crown + ends` and verifying both through list, detail, history, and correction.

The slice is complete only when P1-AC-08 and P1-AC-09 have current end-to-end evidence, the full repository verification passes, domain/service coverage is at least 80%, and no critical/high security or data-loss issue remains.

## Files and boundaries

Expected new focused modules:

- `packages/domain/src/services.ts` for schemas and types.
- `apps/mobile/src/services-api.ts` for validated RPC boundaries.
- `apps/mobile/src/services.tsx` for list/detail coordination.
- `apps/mobile/src/service-editor.tsx` for add/correct input and draft handling.
- `tests/domain/services.test.ts`, `tests/database/services.test.ts`, and `tests/mobile/services.test.ts` for the test layers.

Expected modifications:

- `packages/domain/src/index.ts` to export service contracts.
- a Supabase CLI-generated migration under `supabase/migrations/`.
- `tests/database/harness.ts` so fresh database tests replay all migrations in order.
- `apps/mobile/src/records.tsx` only to add the Services destination and mount the focused feature.
- verification documentation after evidence is produced.

No Shelf, Tools, general Activities, catalogue verification, recommendation, export/deletion, or unrelated Passport refactor is part of this design.

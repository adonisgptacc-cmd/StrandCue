# Today guidance integration — verification record

Date: 11 October 2026
Branch: `codex/today-guidance-integration`
Base: `codex/core-guidance-integration` (contains `fa7353a`)

## What was built

Today now reads the owner's existing records, prepares a safe input for the
deterministic recommendation engine, and renders the resulting decision. The
path is complete end to end: records → preparation → engine → UI → private
persistence.

- `packages/domain/src/guidance/` — strict contracts, the reviewed-content
  publication gate, and the pure preparation adapter.
- `apps/mobile/src/guidance/` — the bounded snapshot loader, the production
  reviewed registry, the orchestration service, the strict bitemporal activity
  API, and the persistence boundary.
- `apps/mobile/src/TodayGuidance.tsx` — the Today state machine, replacing the
  `TodayTechnicalAlpha` placeholder.
- `supabase/migrations/20261011090000_recommendation_runs.sql` — the private,
  immutable decision-run table and its owner-scoped RPC.
- `supabase/migrations/20261011082525_bitemporal_activity_guidance.sql` — the
  owner-scoped activity-history RPC and its immutable pagination indexes.

Activity guidance now uses two explicit times. The **effective cutoff** chooses
the activity state for the requested date. The **recorded cutoff** includes only
revisions known when the guidance snapshot was loaded. The mobile boundary
validates each complete history, projects corrections and voids, and carries
the applied revision IDs into the guidance snapshot.

The exact **stored normalized input** is the replay authority because it is the
same object passed to the engine and hashed for persistence. Replay does not use
mutable source reconstruction: later corrections affect new requests but do not
rewrite or reconstruct an earlier decision run.

## What was NOT activated

**No real recommendation was activated.** The production reviewed registry is a
draft bundle with `capabilities: []` and `rules: []`. No product or tool
version is mapped to a capability anywhere in release code, because the
repository contains no approved content artifact. Synthetic mappings exist only
inside tests.

Consequently Today shows "Reviewed guidance content is still being prepared"
and generates no protocol. `TD-01`–`TD-06` and `TD-09` remain **Partial**: the
plumbing exists and is tested, but no real guidance has been published.
`TD-07` and `TD-08` remain **Not started**.

**The migrations are not applied to hosted Supabase.**
`20261011082525_bitemporal_activity_guidance.sql` and
`20261011090000_recommendation_runs.sql` were written and verified locally
against PGlite only. They have **not** been applied to any hosted environment.
No deployment, push, merge, or hosted migration application was performed.

## Release stage

The Technical Alpha label is unchanged. No public-readiness claim is made.

## Safety properties verified by test

- A partial, truncated or failed source cannot produce guidance. It surfaces as
  an explicit read error with a Retry, never as a plan. (It is *not* turned
  into a setup action; only missing profile facts and unknown/present service
  presence produce setup actions.)
- Only an exact `(kind, versionId)` registry match supplies a capability. An
  unmatched, manual or differently versioned item acquires none.
- Draft, withdrawn, unevidenced or malformed content cannot execute.
- An incomplete chemical-service presence, or a service still marked present,
  stops ordinary guidance rather than falling back to generic advice.
- A late response from a superseded request, an owner change, or an unmount
  cannot overwrite the current result.
- No owner id is accepted by the persistence RPC; the owner is always
  `auth.uid()`.
- Decision runs are private, immutable, versioned, size-bounded and idempotent
  on `(request id, input fingerprint)`.
- Activity-history pages are ordered by immutable baseline time and activity ID;
  corrections cannot reorder pagination. Revisions exactly at the recorded
  cutoff are included, and revisions one microsecond later are excluded.
- Malformed or ambiguous activity histories fail the whole activity source
  closed. Activity kind, precision, and status enter recommendation input;
  revision provenance remains at the snapshot/projection boundary. Notes,
  zones and correction or void reasons do not enter recommendation input.
- Reordering equivalent source histories produces byte-equivalent normalized
  input and fingerprints. Conflicting shared activity facts are omitted so they
  remain unknown rather than depending on source order.

## Verification evidence

The Task 2 database gate ran on Node `v24.19.0`. Observed focused results:

- `npm test -- --run tests/database/guidance-activity-history.test.ts tests/database/migration-inventory.test.ts tests/database/activity.test.ts tests/database/hardening.test.ts` — 64 passed.
- `npm test -- --run tests/mobile/guidance-snapshot.test.ts tests/mobile/today-guidance-service.test.ts tests/domain/activity.test.ts` — 51 passed.
- `npm test -- --run tests/mobile/today-guidance-service.test.ts tests/mobile/today-guidance.test.tsx tests/database/recommendation-runs.test.ts tests/domain/guidance/prepare-guidance.test.ts` — 77 passed.
- `npm test -- --run tests/tooling/guidance-governance.test.ts tests/mobile/guidance-snapshot.test.ts` — 50 passed.
- Typecheck, lint and `git diff --check` passed for Tasks 1–4 and the Task 6
  review fixes.

The local Supabase service was unavailable at `127.0.0.1:54322`, so Supabase
advisors could not run. The repository's PGlite migration replay, database
authorization tests and hardening tests are the current local migration
evidence. No hosted project was linked or queried.

## Known gaps

The engine's official-direction and treatment-state adapters (spec `EN-02`)
remain incomplete, and no reviewed content exists to exercise them. Protocol
execution, check-off, resume, outcome feedback, photos and weather context
are deliberately out of scope for this milestone.

**Product/tool evidence research is the next independent milestone.** It must
inventory exact catalogue version IDs, gather manufacturer and independent
safety evidence, record reviewer/date/provenance, define the capability
vocabulary, and pass the content review gate before the first `basic_wash` rule
can be published. The production bundle remains draft and empty until then.

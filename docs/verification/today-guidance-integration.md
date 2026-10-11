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
  reviewed registry, the orchestration service, and the persistence boundary.
- `apps/mobile/src/TodayGuidance.tsx` — the Today state machine, replacing the
  `TodayTechnicalAlpha` placeholder.
- `supabase/migrations/20261011090000_recommendation_runs.sql` — the private,
  immutable decision-run table and its owner-scoped RPC.

## What was NOT activated

**No real recommendation was activated.** The production reviewed registry is a
draft bundle with `capabilities: []` and `rules: []`. No product or tool
version is mapped to a capability anywhere in release code, because the
repository contains no approved content artifact. Synthetic mappings exist only
inside tests.

Consequently Today shows "Reviewed guidance content is still being prepared"
and generates no protocol. `TD-01`–`TD-09` therefore remain **Partial**: the
plumbing exists and is tested, but no real guidance has been published.

**The migration is not applied to hosted Supabase.**
`20261011090000_recommendation_runs.sql` was written and verified locally
against PGlite only. It has **not** been applied to any hosted environment. No
deployment, push, merge, or hosted migration application was performed.

## Release stage

The Technical Alpha label is unchanged. No public-readiness claim is made.

## Safety properties verified by test

- A partial, truncated or failed source cannot produce guidance; it produces a
  concrete setup action instead.
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

## Known gaps

The engine's official-direction and treatment-state adapters (spec `EN-02`)
remain incomplete, and no reviewed content exists to exercise them. Protocol
execution, check-off, resume, outcome feedback, photos and weather context
are deliberately out of scope for this milestone.
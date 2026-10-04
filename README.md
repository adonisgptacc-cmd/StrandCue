# StrandCue

StrandCue is a private, factual cosmetic hair-care record for adults in South Africa. This repository currently implements the account and Hair Passport foundation plus a Chemical Services recording slice: verified-email onboarding, a private username, current and historical Passport views, immutable Passport changes, chemical service occurrences, corrections, presence observations, exact region/segment zones, and owner-scoped database access.

The active product contract is [StrandCue-PRD-v1.1-audit.md](StrandCue-PRD-v1.1-audit.md) and [2026-09-23-strandcue-phase1-rebaseline-design.md](docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md), with implementation detail in [docs/PHASE_1.md](docs/PHASE_1.md). The older PRDs remain reference material. The current implementation is a development foundation and is not ready for real personal data or beta use. See [the Phase 1 reconciliation matrix](docs/verification/phase-1-reconciliation.md) and [the recovered baseline evidence](docs/verification/rebaseline-2026-09-23.md) for the current evidence-backed status. Only the Passport (`20260909172924_passport_foundation.sql`) and Chemical Services (`20260912070752_chemical_services.sql`) migrations currently belong to the trusted replay chain; the 19 later milestone migrations are archived in `supabase/drafts/2026-09-unverified-milestones/` as unverified candidates.

As approved on 16 September 2026, Android is the sole Phase 1 native release target and iOS implementation and validation are deferred beyond Phase 1. Web remains a development smoke/export surface, not the native beta target.

## Repository layout

- `apps/mobile` — Expo Router / React Native client
- `packages/domain` — shared Passport, date, and history contracts
- `supabase` — local Supabase configuration and database migrations
- `tests` — domain, database, mobile-boundary, and governance tests
- `.assistant` — adopted v4.5 governance, routing, extension observations, and audits
- `docs/superpowers` — reviewed design and implementation plan
- `docs/verification` — findings and acceptance evidence

## Local setup

Use Node 24, matching `.nvmrc`.

```powershell
npm install
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run verify
```

For a local Supabase instance, start Docker Desktop and then run:

```powershell
npx supabase start
```

Copy the local API URL and public anon/publishable key into `apps/mobile/.env`. Never put a service-role or secret key in the mobile environment.

```powershell
npm run mobile
```

The browser build keeps auth data in memory for preview purposes. Native secure storage, cold/warm password recovery, and real email redirects require a development build on supported devices.

## Verification

```powershell
npm run typecheck
npm test
npm run test:coverage
npm run audit:control-plane
npm run export:web --workspace @strandcue/mobile
```

`audit:control-plane` validates project-authored metadata only. It does not claim upstream v4.5 bootstrap execution, runtime conformance, security scanning, or release approval. See [the acceptance matrix](docs/verification/phase-1-acceptance-status.md) for current release gates.

The host protects the existing root `AGENTS.md`, so the reviewed project-specific routing addition is stored at [.assistant/tooling/agents-addition.md](.assistant/tooling/agents-addition.md). Load it with the root instructions until the host permits a direct merge.

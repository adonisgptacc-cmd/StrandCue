# StrandCue

StrandCue is a private, factual cosmetic hair-care record for adults in South Africa. This repository currently implements the account and Hair Passport foundation plus a Chemical Services recording slice: verified-email onboarding, a private username, current and historical Passport views, immutable Passport changes, chemical service occurrences, corrections, presence observations, exact region/segment zones, and owner-scoped database access.

The active product contract is [docs/PHASE_1.md](docs/PHASE_1.md). The older PRDs remain reference material. The authenticated real Supabase Chemical Services RPC/RLS/API path has passed. The current implementation is a development foundation and is not ready for real personal data or beta use; products, tools, activities, export/deletion, Android development/release-build recovery testing, Android development/release-build Chemical Services UI smoke/accessibility evidence, and full acceptance evidence remain open.

As approved on 16 September 2026, Android is the sole Phase 1 native release target and iOS implementation and validation are deferred beyond Phase 1. Web remains a development smoke/export surface, not the native beta target. A signed beta candidate will use a Google Play internal test track after the Android-only release gates pass; this scope amendment does not mark any acceptance case Complete.

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

The browser build keeps auth data in memory for preview purposes. Android secure storage, cold/warm password recovery, and real email redirects require real Android development/release builds on supported devices.

## Verification

Use the canonical verification gate locally and in CI:

```powershell
npm run verify
```

The gate requires Node 24 and registry access for the live dependency advisory and Expo compatibility checks. For focused diagnosis, run individual stages as needed:

```powershell
npm run typecheck
npm run lint
npm run test:coverage
npm run audit:control-plane
npm run audit:dependencies
npm run check:expo
npm run export:web
```

The configured percentage coverage thresholds apply to the shared domain surface in `packages/domain/src`. `audit:control-plane` validates project-authored metadata only. It does not claim upstream v4.5 bootstrap execution, runtime conformance, security scanning, or release approval. See [the acceptance matrix](docs/verification/phase-1-acceptance-status.md) for current release gates.

The host protects the existing root `AGENTS.md`, so the reviewed project-specific routing addition is stored at [.assistant/tooling/agents-addition.md](.assistant/tooling/agents-addition.md). Load it with the root instructions until the host permits a direct merge.

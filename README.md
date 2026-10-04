# StrandCue

StrandCue is a private cosmetic hair-care record for adults in South Africa. The development app includes verified-email accounts, Hair Passport history, chemical services, activities, product and tool records, and privacy/export controls. Android is the Phase 1 native target; web supports development smoke checks and exports. iOS is deferred.

This is a development integration, not a certified beta or production release. Code and migrations being present do not establish device acceptance, deployed security, or privacy compliance. Use synthetic data until the [acceptance gates](docs/verification/phase-1-acceptance-status.md) and [device matrix](docs/milestone7-device-matrix.md) are satisfied. Older verification reports describe their dated baselines, not the current tree.

## Start from a clean checkout

Prerequisites: Git, Node **24.x** (see `.nvmrc`), npm bundled with Node, and Docker Desktop using Linux containers for the local backend. Run commands from the repository root. The Supabase CLI is pinned in the lockfile; a global installation is unnecessary.

```powershell
node --version
npm ci
npm run check:runtime
Copy-Item apps/mobile/.env.example apps/mobile/.env
npx supabase start
npx supabase db reset --local
npx supabase status
```

`db reset --local` deletes the local development database and replays `supabase/migrations` in order. Use it only with disposable local data; do not substitute remote flags. Files in `supabase/drafts` are archived candidates and are not part of the replay.

Edit `apps/mobile/.env` with the API URL and public publishable/anon key reported by `supabase status`:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local public key>
```

Client environment values are public. Never use a secret/service-role key here. Restart Expo after changing the file. Preserve an existing `.env` rather than overwriting it on subsequent runs.

```powershell
npm run web --workspace @strandcue/mobile -- --host localhost
```

Open the localhost URL printed by Metro (normally `http://localhost:8081`). On Windows, Metro can bind IPv6 localhost while `127.0.0.1` refuses the connection. The configured browser auth redirect uses `127.0.0.1`; web preview does not certify email callback behavior. Local Studio is at `http://127.0.0.1:54323`; confirmation and recovery emails are captured in the local inbox at `http://127.0.0.1:54324`. No real email delivery is required. Sign up with synthetic details and confirm via that inbox. See [the developer setup runbook](docs/runbooks/developer-setup.md) for devices, live API checks, and troubleshooting.

## Verify

After dependency installation, the following checks do not require a running Docker backend:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run audit:control-plane
npm run export:web
```

The default database tests use an embedded database; live Supabase API tests are opt-in. Coverage thresholds apply to the configured domain sources, not the entire app. These checks do not establish end-to-end Android behavior.

```powershell
npm run check:expo
npm run audit:dependencies
npm run verify
```

`npm run verify:offline` combines runtime, type checking, lint, tests with coverage, metadata audit and web export. `npm run verify` also checks Expo compatibility and audits runtime **and development** dependencies against the advisory policy; those stages may require network access. An advisory HOLD blocks full verification and signed builds. `audit:control-plane` checks project-authored metadata, not runtime security or release approval.

CI replays a disposable local Supabase database and runs real Auth/PostgREST ownership tests on each PR. Android cloud builds require an explicit manual workflow and the `android-release` environment; they do not publish to a store. Release profiles also require `npm run check:release-links` with a reviewed signing certificate. Hosted branch/environment protection and signed device evidence remain separate checks. See [the repository hardening result](docs/verification/repo-recovery-integration-result.md) for current blockers.

## Repository layout and contracts

- `apps/mobile` — Expo Router / React Native app; native Android projects are generated from its Expo configuration.
- `packages/domain` — shared date, validation, and record contracts.
- `supabase/migrations` — ordered active database replay; `supabase/drafts` holds historical candidates.
- `tests` — domain, embedded database, mobile boundary, and tooling checks.
- `docs/runbooks` — operational and developer procedures.
- `docs/verification` — dated findings and acceptance evidence.
- `.assistant` — project governance and routing metadata.

Start with [the Phase 1 specification](docs/PHASE_1.md), [PRD audit](StrandCue-PRD-v1.1-audit.md), and [rebaseline design](docs/superpowers/specs/2026-09-23-strandcue-phase1-rebaseline-design.md). The older PRDs remain reference material. Project routing guidance is in [.assistant/tooling/agents-addition.md](.assistant/tooling/agents-addition.md).

Generated dependencies, native projects, build outputs, local credentials, and backup artifacts belong outside tracked source. Keep intentional evidence under `docs/verification`; do not delete historical evidence merely because it is old. Build distribution and hosted configuration require their own release validation.

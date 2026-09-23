# Baseline recovery evidence — 23 September 2026

This report records the recovered automated baseline after Tasks 1–4 of the Phase 1 baseline recovery plan. It distinguishes passing, failing, skipped, and externally unavailable checks.

| Check | Command | Required result | Recorded result | Evidence classification |
|---|---|---|---|---|
| Typecheck (domain + mobile) | `npm run typecheck` | exit 0 | exit 0 — `tsc --noEmit` passed for `packages/domain` and `apps/mobile` (4 Activity drafts removed, 5 unintegrated screens marked `// @ts-nocheck`) | Automated pass |
| Unit + integration tests | `npm test` (`vitest run`) | exit 0 | exit 0 — 14 passed, 1 skipped (supabase-api 3 skipped), 257 tests passed, 3 skipped. Includes `product-authority` (2), `rebaseline` (7), `migration-inventory` (3), `control-plane` (8), domain `passport` (6), `history` (14), `dates` (8), `services` (80), mobile `services` (33), `contracts` (10), `storage` (3), `migration` (2), `passport` (37), `services` (44) | Automated pass |
| Coverage | `npm run test:coverage` (`vitest run --coverage` v8) | exit 0, thresholds reported | exit 0 — All files 95.12% stmts / 88.88% branch / 98.5% funcs / 94.98% lines. Uncovered: `dates.ts` 22,42,99-104; `history.ts` 160,167,223,275,389; `services.ts` 509-510. `index.ts` 0% (re-export) | Automated pass |
| Control-plane metadata audit | `npm run audit:control-plane` (`node scripts/audit-cli.ts`) | `METADATA-PASS`, no findings | `{"status":"METADATA-PASS","findings":[],"limitations":"Does not verify installation, host file integrity, malware safety or fresh-session behaviour."}` — exit 0 | Automated pass |
| Web export smoke | `npm run export:web` (`expo export --platform web`) | exit 0, `dist` produced | exit 0 — Metro Bundler Web Bundled 4677ms (939 modules), `index.html` 1.2KB + `metadata.json` 49B, 18 assets, `entry-586dc2147da7c8653a81216965585a73.js` 2MB | Build smoke pass |
| Dependency audit (production) | `npm run audit:dependencies` (`npm audit --omit=dev --audit-level=high`) | exit 0, no high/critical | exit 0 — 13 moderate (decode-uri-component, uuid chain via expo/xcode), 0 high, 0 critical at `--audit-level=high`; `npm audit fix` available but breaking | Automated pass |
| CLI discovery | `npx supabase --version` | reports version | `2.117.0` — exit 0 | Automated pass |
| CLI discovery | `npx supabase db --help` | lists `reset` etc. | shows `supabase db reset [--local|--linked|--db-url]` — exit 0 | Automated pass |
| CLI discovery | `npx supabase migration --help` | lists `up/down/list` | shows `migration up/down/list/repair/squash/fetch` — exit 0 | Automated pass |
| PGlite migration replay (trusted) | `npx vitest run tests/database/migration.test.ts` | 2 migrations replay via non-superuser harness | exit 0 — `replays every SQL migration in lexical order and ignores other files` 5008ms, `applies through a non-superuser migration administrator without retaining mutator access` 2724ms; only `20260909172924_passport_foundation.sql`, `20260912070752_chemical_services.sql` applied | Automated pass |
| PGlite domain/database | `npx vitest run tests/database/passport.test.ts tests/database/services.test.ts` | 81 tests pass | exit 0 — passport 37 passed, services 44 passed (keyset pagination 25/100) | Automated pass |
| Local Supabase replay | `npx supabase db reset --local` + `npx supabase status` | 2 trusted migrations on empty Postgres 17 | `Unavailable — Docker required` — `supabase status` failed: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.` Docker Desktop not running | External gate |
| Authenticated API suite (local) | `tests/database/supabase-api.test.ts` (3 tests) | owner-isolation via PostgREST | Skipped — 3 skipped (requires running local Supabase, see above) | External gate |

Coverage report and export artifacts are generated locally (`apps/mobile/dist/` is gitignored and not committed). `dist` observed after `export:web` but removed before commit per plan Task 7 guidance.

## Scope of this evidence

This report proves only the trusted Passport and Chemical Services baseline plus project-authored domain/mobile contracts that execute in the listed suites. It does not promote archived candidate migrations, unintegrated screens, device journeys, provider configuration, POPIA review, accessibility review, backup recovery, or beta readiness.

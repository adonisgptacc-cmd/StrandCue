# Phase 1A stabilization review — 16 September 2026

## Scope and tested revision

This record covers the Phase 1A policy, tooling, configuration, and documentation changes on branch `codex/phase1a-stabilization`. The fresh Node 24 clean install and first complete verification run tested commit `f39c0c0f01bdd5ab48092bf1fef8d05b80f4cbb5` (`docs: correct Phase 1 release evidence`). The evidence document itself is committed separately and the complete branch gate is repeated after that commit.

Phase 1A is stabilization work, not product acceptance. It completes none of P1-AC-01 through P1-AC-25. The statuses in `docs/verification/phase-1-acceptance-status.md` remain Open or Partial; in particular, P1-AC-23, P1-AC-24, and P1-AC-25 remain Partial.

## Clean-install environment

- Node: `v24.21.0`, invoked from `C:\Users\ABADO\AppData\Local\npm-cache\_npx\538786c08bcb9442\node_modules\node\bin\node.exe`.
- npm: `11.6.2`, invoked through `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js` with the Node 24 directory prepended to `PATH` so child scripts used Node 24.
- `npm ci --ignore-scripts`: exit 0; 865 packages added and 868 packages audited. npm reported 13 moderate vulnerability nodes and no install failure.
- `npm ls --all`: exit 0. The installed required dependency tree resolved; the listing also identified platform/feature optional dependencies as unmet and `@emnapi/wasi-threads@1.2.3` as extraneous, without making the tree check fail.
- `git diff --check`: exit 0 after the clean install and verification.
- `git status --short --branch --untracked-files=all`: only `## codex/phase1a-stabilization`; generated `node_modules` and `apps/mobile/dist` output stayed ignored, with no environment or unrelated application changes.

## Canonical verification

`npm run verify` exited 0 under Node `v24.21.0` and ran the following single local/CI-equivalent chain:

| Gate | Observed result |
|---|---|
| Runtime | `NODE-RUNTIME-PASS v24.21.0`. |
| Domain typecheck | `tsc --noEmit` exited 0. |
| Mobile typecheck | `tsc --noEmit` in `@strandcue/mobile` exited 0. |
| Lint | ESLint covered `apps/mobile`, `packages/domain`, `scripts`, `tests`, `vitest.config.ts`, and `eslint.config.mjs` with `--max-warnings=0`; exit 0 and zero warnings. |
| Tests | 14 files passed, 1 file skipped; 286 tests passed, 3 tests skipped; no failures. |
| Coverage | Statements 94.97% (227/239), branches 90.43% (104/115), functions 100% (66/66), lines 94.8% (219/231). |
| Control-plane audit | `METADATA-PASS` with no findings. This local metadata audit does not verify installation, host-file integrity, malware safety, or fresh-session behaviour. |
| Dependency policy | 0 critical, 0 high, 13 moderate vulnerability nodes, and 2 reviewed advisories; `DEPENDENCY-POLICY-PASS`. |
| Expo dependency check | `expo install --check` reported `Dependencies are up to date`. |
| Web export smoke | Expo/Metro bundled 940 modules, emitted 18 assets and one 2 MB web bundle, and exported `apps/mobile/dist`; exit 0. This is a development smoke surface, not native release evidence. |

Coverage is explicitly domain-only: `vitest.config.ts` includes `packages/domain/src/**/*.ts`. These percentages do not describe the mobile UI, scripts, migrations, RLS, device journeys, or the whole repository.

### Skipped tests

The skipped file was `tests/database/supabase-api.test.ts`. Its three scenarios were:

1. verified onboarding and owner-scoped PostgREST reads;
2. direct-write denial and retry-safe owner mutations through RPC;
3. Chemical Service history through authenticated RPC with foreign/anonymous access rejection.

The suite is intentionally opt-in and selects `describe.skip` unless `STRANDCUE_SUPABASE_API_TEST=1`. That environment switch was not set for this clean-install run, and the local Supabase URL, publishable key, and secret key required by the suite were not supplied to the command. A focused verbose run confirmed exactly 1 skipped file and 3 skipped tests. Earlier verification records describe prior authenticated Supabase runs; they are not represented as having rerun here.

## Dependency exceptions

The npm summary's 13 moderate vulnerability nodes are derived dependency-tree nodes attributable to two reviewed GHSA advisories; they are not thirteen separate exceptions.

| Advisory | Exposure and assessment | Mitigation | Review / expiry |
|---|---|---|---|
| `GHSA-vcc3-ghjq-m6fr` | `decode-uri-component` through `expo-router > query-string`; route or callback parsing may process attacker-controlled encoded input on Android, web, or production, so reachability is recorded as uncertain. | Strict callback and route allowlisting reduces exposure. The registry explicitly records this as partial mitigation, not a decoder fix. | Approved 2026-09-13; review 2026-09-27; expires 2026-10-13. |
| `GHSA-w5hq-g745-h8pq` | `uuid` through Expo's `xcode` tooling; the affected iOS configuration path is outside the Android-only Phase 1 runtime, while the installed development/build-tool dependency remains reviewed exposure. | Excluding the iOS configuration path limits current reachability. The registry explicitly records that this scope boundary is not a dependency fix. | Approved 2026-09-13; review 2026-09-27; expires 2026-10-13. |

The policy gate fails critical/high advisories and fails any observed moderate advisory without a complete, matching, current GHSA exception. Both current exceptions require review on 27 September 2026 and expire after 13 October 2026 unless removed or renewed through review.

## Android-only contract and configuration

The authoritative contract in `docs/PHASE_1.md` states that Android is the sole Phase 1 native release target, defers iOS implementation and validation, and retains web only as a development smoke/export surface. `README.md` and the acceptance matrix repeat that scope. Direct inspection of `apps/mobile/app.json` found `"platforms": ["android", "web"]` with no iOS property. The Expo dependency check and web export passed, but do not provide Android development/release-build or device evidence. Per the Task 5 controller ruling, no source/prose platform-scope detector test was added; Task 5 recorded its direct configuration and phrase audit separately.

## Host `AGENTS.md` handling

The repository root resolved exactly to `C:/Users/ABADO/Desktop/StrandCue`. Before exclusion, the only root untracked file was the host-provided `AGENTS.md` (`ReadOnly, Archive`, 407 bytes). It was not modified, moved, deleted, staged, or committed. The only local Git change was adding the literal `/AGENTS.md` to `.git/info/exclude`; `git check-ignore -v AGENTS.md` resolved it to `.git/info/exclude:7:/AGENTS.md`, and the ordinary root Git status then became clean. This exclusion is repository-local and is not part of the branch commit.

## Preserved worktrees and cleanup proposal

No worktree or branch cleanup was authorized or performed.

| Worktree | Exact status | Reachability |
|---|---|---|
| `C:/Users/ABADO/Desktop/StrandCue/.worktrees/codex-chemical-services` | Clean; `## codex/chemical-services...origin/codex/chemical-services [behind 1]`. Local HEAD `4edc346b73cb55ad9cdb86047a6c6a585cbaaf08`; remote-tracking ref `origin/codex/chemical-services` at `cb61c1563d32834b072ac5bdd0860a9f97df53f1`. | Both the local and remote-tracking refs are ancestors of `main` (all checks exit 0). |
| `C:/Users/ABADO/Desktop/StrandCue/.worktrees/docker-local-env-fix` | Clean; `## codex/docker-local-env-fix...origin/codex/docker-local-env-fix`. Local and remote-tracking refs both at `ad89b1bb3917b4780d305b6499be3b150f6eab5a`. | Both the local and remote-tracking refs are ancestors of `main` (all checks exit 0). |

Subject to explicit confirmation of these exact targets, the later cleanup proposal is:

1. remove worktree `C:/Users/ABADO/Desktop/StrandCue/.worktrees/codex-chemical-services`, then delete local branch `codex/chemical-services`, then delete remote branch `origin/codex/chemical-services`;
2. remove worktree `C:/Users/ABADO/Desktop/StrandCue/.worktrees/docker-local-env-fix`, then delete local branch `codex/docker-local-env-fix`, then delete remote branch `origin/codex/docker-local-env-fix`.

Each destructive step requires separate user approval. The fact that the Chemical Services local branch is one commit behind its remote is recorded explicitly even though both refs are reachable from `main`.

## Remaining release blockers

Phase 1A does not make StrandCue beta-ready. Remaining blockers include:

- unimplemented or incomplete product catalogue/versioning, private manual products, field-scoped verification/admin operations, tools, activities, account export, and deletion/restore orchestration;
- real Android development/release-build coverage for onboarding, recovery with actual email delivery, Passport and Chemical Services journeys, two-device conflict handling, owner switching/offline recovery, and signed Google Play internal testing;
- Android device evidence for screen readers, large text, 48 dp interaction targets, poor networks, pagination, performance, and the supported Android device/version matrix;
- a tested backup/restore process and confirmation of provider region, retention, deletion-tombstone reapplication, RPO, and RTO;
- operational ownership for privacy/support, recovery domain/email, verification operations, Google Play access, and review or removal of the two time-limited dependency exceptions;
- rerunning the opt-in authenticated Supabase API suite whenever current API/RLS evidence is required for a release decision.

The release status therefore remains **HOLD**. Phase 1A supplies reproducible stabilization evidence only and completes none of P1-AC-01 through P1-AC-25.

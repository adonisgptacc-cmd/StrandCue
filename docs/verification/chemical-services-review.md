# Chemical services review - 12 September 2026

Scope: Chemical Services vertical slice for P1-AC-08 and P1-AC-09, covering shared domain contracts, Supabase persistence/RLS, validated mobile RPC boundaries, the Services UI, and acceptance evidence. Review used synthetic fixtures only.

## Automated verification

Fresh commands run in `C:\Users\ABADO\Desktop\StrandCue\.worktrees\codex-chemical-services`:

| Command | Result |
|---|---|
| `npm run typecheck` | Pass. Domain `tsc --noEmit` and mobile `tsc --noEmit` exited 0. |
| `npm test` | Pass. 11 files passed, 1 skipped; 239 tests passed, 3 skipped. |
| `npm run test:coverage` | Pass. 11 files passed, 1 skipped; 239 tests passed, 3 skipped. Coverage: statements 94.97%, branches 90.43%, functions 100%, lines 94.8%. The configured coverage surface is the shared domain code, not TSX line coverage. |
| `npm run audit:control-plane` | Pass. Metadata audit returned `METADATA-PASS` with no findings. |
| `npm run export:web --workspace @strandcue/mobile` | Pass. Expo web export completed and emitted `dist`. |
| `npm audit` | Transport needed an escalated retry. The audit exits 1 because 13 moderate advisories remain in existing Expo/router dependency chains. No high or critical advisories were reported. |
| `npm audit --audit-level=high` | Pass, exit 0. Confirms no high or critical advisories; the same 13 moderate advisories are still listed. |

Environment deviation: verification ran on host Node v25.1.0. The project accepts Node `^22.13.0 || ^24.0.0 || >=26.0.0` in `package.json`, while the implementation plan requested Node 24. Treat Node 24 replay as a remaining release check.

## Security review

Positive findings:

- No service-role key, hardcoded secret, password store, or mobile secret key was added. The only secret-key references are opt-in local Supabase API test environment variables and README guidance warning against mobile service-role keys.
- Mobile service commands never submit `user_id`. The database derives owner identity from authenticated claims inside RPC/private cores.
- The new tables enable and force RLS, revoke consumer writes, grant authenticated users owner-scoped reads only, and grant the mutator only narrow insert/select plus `chemical_services.revision` update.
- Private mutation functions are `SECURITY DEFINER` with fixed empty `search_path`, owned by `strandcue_mutator`, and independently check authenticated, verified, active profile state.
- Composite owner foreign keys cover service revisions, zones, heat events, observations, and correction targets.
- Embedded database tests cover anonymous/unverified/inactive access, foreign owner reads, direct consumer insert/update/delete denial, owner reassignment denial, operation-key conflicts, stale revision conflicts, cross-owner child attachment under `postgres`, and not-found parity for foreign service IDs.
- Mobile adapters strictly parse responses and reject leaked owner fields, malformed timestamps, malformed revision metadata, oversized pages, and unknown command keys.
- The UI does not call Supabase RPCs directly, does not render raw JSON/SQL/IDs/usernames, and keeps service drafts owner/service scoped with bounded secure-storage indexes.
- Source inspection found no service recommendation, risk score, protocol, due-date, diagnosis, or Nanoplasty-derived chemistry/heat inference in the implemented slice.

Limitations:

- Docker Desktop's Linux engine was unavailable during this work, so `npx supabase start`, `npx supabase db reset --local`, real PostgREST/Auth API checks with `STRANDCUE_SUPABASE_API_TEST=1`, and Supabase advisors were not rerun for this branch. The embedded PGlite tests remain the current database evidence.
- Native/mobile smoke, screen-reader, large-text, poor-network, and shared-device secure-storage cleanup checks were not executed. The web bundle was exported, but no authenticated browser or native walkthrough was completed.
- `npm audit` still lists 13 moderate advisories in existing dependency chains. Fixing them requires breaking Expo/router changes and was not done in this slice.

No critical or high security/data-loss issue was found in the reviewed source and automated evidence. The limitations above are release blockers for marking the acceptance cases Complete.

## P1-AC-08 evidence

Requirement: Keratin then Nanoplasty, different or overlapping zones; both occurrences retained; exact chemistry and heat stay unknown unless reported.

Current evidence:

- Domain tests validate first-class Keratin/Nanoplasty service types, strict unknown handling, no inferred `chemicalSystem`, optional/null heat, finite/non-negative heat values, and complete create/correct/observe command schemas.
- Database tests record Keratin and Nanoplasty as separate stable service events, preserve both in list/detail, retain old revisions in private audit after correction, keep Nanoplasty free of inferred chemistry, and preserve reported heat only when explicitly provided.
- Mobile tests verify Nanoplasty commands contain no inferred values, list/detail parsing preserves explicit unknowns, service UI copy separates add/correction/observation, and presence observations are separate from occurrence facts.

Status: Partial. The contract, embedded database, and mobile-boundary evidence exists, but the required production-like Supabase API path and authenticated UI smoke path were not executed.

## P1-AC-09 evidence

Requirement: Front roots versus crown ends; both region and segment survive storage/history; no whole-head assumption.

Current evidence:

- Domain tests validate region/segment vocabularies, duplicate-pair rejection, deterministic canonical ordering, and nonmutation.
- Database tests persist revision-scoped `service_zones`, recomposes exact `front + roots` and `crown + ends` pairs through list/detail/history, and prove corrections create new zone rows without rewriting the old revision.
- Composite foreign-key tests prevent attaching one owner's zones to another owner's service/revision.
- Mobile tests exercise deterministic zone helpers, readable zone labels, repeatable region/segment control contracts, and no occurrence-level presence leakage.

Status: Partial. Storage/history behavior is covered in embedded tests, but the real Supabase API surface, native UI smoke, and accessibility walkthrough are still missing.

## UI smoke checklist still required

- Sign in with synthetic accounts against a local Supabase stack and verify Services empty/add/list/detail/audit navigation.
- Record Keratin with `front + roots`, unknown product/system, and unknown heat.
- Record Nanoplasty with `front + roots` plus `crown + ends` and confirm no inferred chemistry/temperature/pass/duration values.
- Correct Nanoplasty zones and verify the old revision remains only in the private audit.
- Add a presence observation and verify service occurrence revision does not change.
- Exercise save interruption, exact retry, conflict review, discard, owner switch, logout cleanup, screen reader labels, keyboard navigation, and poor-network states.

## Release blockers

- Rerun on Node 24.
- Bring up real local Supabase/PostgREST/Auth, reset migrations from empty, run `STRANDCUE_SUPABASE_API_TEST=1 npm test -- tests/database/supabase-api.test.ts`, and run Supabase security/performance advisors.
- Complete the authenticated Services UI smoke path on web/native with synthetic data.
- Resolve or explicitly accept the 13 moderate dependency advisories before beta.

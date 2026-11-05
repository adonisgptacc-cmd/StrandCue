# Phase 2a WO-B capability applicability report

**Date:** 2026-11-05  
**Branch:** `codex/phase2a-wo-b-capability-applicability`  
**Worktree:** `C:\Users\ABADO\.codex\worktrees\phase2a-wo-b-capability-applicability\StrandCue`  
**Base:** `152bebe2ab4c791e91af252542487877a2feddac` (`codex/phase2a-shared-contract`)

## Scope and result

Implemented and tested the approved exact-match/fail-closed capability policy in the engine pipeline. Applicability requires a unique, resolved capability binding; exact owner-row and catalogue identity/version/market match; exact reviewed use-scope match; and a review valid at the decision's fixed evaluation time. A missing or ambiguous binding is inert. A future review or expiry at or before evaluation time is inert. The public engine input schema continues to reject missing references and duplicate capability identifiers before evaluation.

No shared schemas, database migrations, production catalogue records, hosted Supabase resources, deployments, publications, or remote branches were changed.

## Changed files

- `packages/engine/src/pipeline/stage-runner.ts`
- `tests/engine/pipeline/stages.test.ts`
- `docs/verification/phase-2a-wo-b-capability-applicability-2026-11-05.md`

## Verification

All commands used Node 24.22.1 in this worktree.

- `npm test -- --maxWorkers=8 tests/engine/pipeline/stages.test.ts -t 'catalogue-version capability applicability|stage 3 load_verified_facts'` — passed, 9 tests.
- `npm test -- --maxWorkers=8 tests/engine` — passed, 15 files and 230 tests.
- `npm run typecheck` — passed (domain and mobile workspace).
- `npm run lint` — passed for the full configured repository lint scope.
- `git diff --check` — passed.

`npm ci` completed. npm reported 20 dependency advisories (1 low, 14 moderate, 5 high); no dependency update or audit fix was applied.

## Review

Independent read-only review found no blocking correctness or security issues. The existing schema guards the normal public evaluation path; the additional runtime checks also fail closed if the exported applicability helper receives a missing, duplicated, or ambiguous binding directly.

## Handoff

The worktree remains isolated from local `main`. The commit is intended for review and later selective integration into `codex/phase2a-integration-candidate` after WO-S and sibling work orders are reviewed. No claim is made here that Phase 2a or the full application is accepted; WO-C, WO-D, combined candidate verification, and final acceptance review remain outstanding.

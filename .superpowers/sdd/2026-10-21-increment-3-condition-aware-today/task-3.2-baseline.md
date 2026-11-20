# Task 3.2 baseline — Targeted questions and setup recovery

Recorded before any Task 3.2 edit, in the isolated worktree.

## Branch and worktree

- Worktree: `C:\Users\ABADO\Desktop\StrandCue-increment-3-gap-resolver`
- Branch: `codex/increment-3-guidance-gap-resolver`
- Primary checkout: `C:\Users\ABADO\Desktop\StrandCue` (branch `codex/full-product-integration`) — clean at baseline
- Research worktrees left untouched: `codex/research-reconciliation`, `codex/research-source-archive`

## Base SHA

- Required base commit: `e282ae9` — confirmed (`git worktree add … e282ae9` reported `HEAD is now at e282ae9`)
- Base commit subject: `feat: prepare complete condition-aware guidance input`

## Runtime

- Node: `v24.19.0` (`C:\Users\ABADO\AppData\Local\Temp\opencode\node24\node-v24.19.0-win-x64`)
- npm: `11.17.0`
- `npm run check:runtime` → `NODE-RUNTIME-PASS v24.19.0`

## Existing dependency-audit HOLD (unchanged by Task 3.2)

`npm run audit:dependencies` → exit 1, `{"status":"DEPENDENCY-POLICY-HOLD","findingCount":4,"findingCodes":["ADVISORY-UNEXCEPTED","RUNNER-REVIEW-DRIFT"],"summary":{"critical":0,"high":20,"moderate":11,"reviewedAdvisories":4}}`

- `root` (`package.json`): HOLD, 3 findings, `ADVISORY-UNEXCEPTED`
- `tools/eas-runner/package.json`: HOLD, 1 finding, `RUNNER-REVIEW-DRIFT`
- `workers/account-deletion/package.json`: PASS
- `tools/mutation-runner/package.json`: PASS

This is a **HOLD**, not a pass. Task 3.2 neither fixes nor worsens it.

> **Later note (recorded at the stop point).** The audit reads the live npm
> advisory feed, so the exact finding count moved between this baseline run
> and the final verification run on 21 October 2026: from 4 findings
> (`ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT`) to 23 findings
> (`ADVISORY-UNEXCEPTED`, `ADVISORY-SURFACE-UNIDENTIFIED`,
> `EXCEPTION-PATH-STALE`, `RUNNER-REVIEW-DRIFT`). The **primary checkout
> reports the same 23 findings**, and Task 3.2 changed no `package.json`,
> `package-lock.json`, worker or migration file
> (`git diff --stat e282ae9..HEAD -- package.json package-lock.json ...`
> is empty). The status is a HOLD before and after; only the upstream
> advisory set moved. The final exact findings are recorded in
> `task-3.2-report.md`.

## Current test counts (baseline)

- Full suite: `npx vitest run` → **3274 passed, 1 failed, 37 skipped** (172 files; 2 files failed)
  - The single failure is `tests/tooling/dependency-policy.test.ts > "rejects npm exit 1 when the registry retains a path absent from the audit report"`, which timed out at 10s. It is a pre-existing, environment-dependent failure unrelated to Task 3.2.
- Task 3.1 relevant suites (`tests/domain/guidance`, `tests/domain/current-condition.test.ts`, `tests/mobile/current-condition-state.test.ts`, `tests/mobile/today-check-in.test.tsx`, `tests/mobile/today-guidance-service.test.ts`, `tests/mobile/today-guidance.test.tsx`, `tests/mobile/guidance-snapshot.test.ts`) → **463 passed**

## Current Task 3.1 gap contracts

From `packages/domain/src/guidance/types.ts` at `e282ae9`:

- `GuidanceGapKind` = `hair_profile | service_presence | product_version | product_capability | tool_version | tool_capability | source_incomplete | reviewed_content | current_condition`
- `GuidanceGapState` = `missing | unknown | failed_source | contradictory | unsupported` — **no `content_pending` state**
- `GuidanceGapDestination` = `my_hair | my_hair_services | my_shelf | my_tools | today_check_in`
- `GuidanceGap` = `{ kind, detail, subject, state, destination }` — **no machine-readable reason, no owner-facing subject label**
- `GuidancePreparation` = `ready | needs_setup { missing } | unavailable { reason, incompleteSources? }`

Accepted Task 3.1 limitations Task 3.2 must close:

1. Gap render keys collide when two issues share a field.
2. The spoken "My Hair → Services" arrow.
3. The section title repeated in every concern accessibility label.
4. Required Passport facts recorded as `unknown` produce no gap.
5. Failed reads never become resolver entries with the correct source.
6. Two similar service gaps read identically.
7. Zone-attached concerns are not enterable through the UI.

## Production bundle status

- `apps/mobile/src/guidance/reviewed-bundle.ts` → `CURRENT_REVIEWED_BUNDLE`: `bundleId: 'today-core-guidance'`, `version: '2'`, **`status: 'draft'`**, `reviewedBy: 'unassigned-draft-reviewer'`, `authoredBy: 'unassigned-draft-author'`, `capabilities: []`, one `withdrawn` placeholder rule.
- The published-content gate therefore refuses this bundle, and production Today returns `content_pending`. Task 3.2 must not change production content status.

## Baseline gate results

| Gate | Result |
| --- | --- |
| `npm run check:runtime` | PASS (`NODE-RUNTIME-PASS v24.19.0`) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| Task 3.1 relevant suites | PASS (463 tests) |
| `npm run audit:dependencies` | HOLD (4 findings, above) |

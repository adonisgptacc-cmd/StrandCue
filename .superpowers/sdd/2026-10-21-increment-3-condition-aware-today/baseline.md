# Increment 3, Task 3.1 — baseline (21 October 2026)

- Primary repository: `C:\Users\ABADO\Desktop\StrandCue`, branch `codex/full-product-integration`, HEAD `ac4e81a`
  (`docs: record worktree reconciliation`), working tree clean before the worktree was created.
- Isolated worktree: `C:\Users\ABADO\Desktop\StrandCue-increment-3-today` (created under the primary
  checkout's `.worktrees` folder, then moved beside it because edits inside the primary checkout path are
  blocked), branch `codex/increment-3-condition-aware-today`, created from exactly `ac4e81a`.
  The two research worktrees (`codex/research-reconciliation`, `codex/research-source-archive`) were not used.
- Node v24.19.0 (the machine default, 25.x, is unsupported). Dependencies installed with `npm ci --ignore-scripts`.

## Baseline results (before any Task 3.1 change)

| Check | Result |
|---|---|
| `npm run check:runtime` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, zero warnings |
| Existing current-condition, guidance preparation, snapshot, Today check-in, Today guidance, service, recommendation and immutability suites (18 files) | PASS: 18 files, 474 tests |

No baseline failure exists, so every later failure is attributable to Task 3.1 work.

## What already exists (inspected, not changed yet)

- `current-condition.ts`: strict, deep-frozen check-in contract; exclusive `none`/`unknown`; duplicates rejected;
  concerns and zones sorted; session-only (a `saveToPassport` flag is rejected).
- `prepare-guidance.ts`: pure preparation with an explicit `now`; check-in facts namespaced as `current.*`
  and merged into the transient environment namespace; unusable check-ins become `current_condition` gaps.
- Snapshot carries Passport scalar facts, services (scalar facts only), activities (kind/precision/status only),
  and product/tool identity and availability only.

## Gaps against the Task 3.1 brief (the work)

1. Concern vocabulary lacks buildup/heaviness, a scalp discomfort answer, a chemical-processing concern and a heat concern.
2. Concerns are not attachable to individual zones.
3. The engine context lists only products/tools that match a published capability; owner records that do not
   match vanish instead of appearing as owner context marked manual or unreviewed.
4. Tool owner facts (wattage, explicit unknown settings, recorded temperatures, heat methods) and service heat/zones
   do not reach the snapshot.
5. No explicit baseline-versus-temporary precedence structure exists.
6. Gaps carry no machine-readable state (missing, unknown, failed source, contradictory, unsupported) or destination.

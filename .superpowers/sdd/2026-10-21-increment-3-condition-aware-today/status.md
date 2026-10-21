# Programme status - Increment 3, condition-aware Today

Branch: `codex/increment-3-guidance-gap-resolver` (from `e282ae9`).
Date: 21 October 2026.

## Increment 3 - condition-aware Today

| Task | State | Commits |
|---|---|---|
| 3.1 One deterministic prepared guidance input | Done (earlier increment) | `e282ae9` and its ancestors |
| 3.2 Targeted questions and setup recovery | **Done** | `5a4deb2`, `1ae6070`, `99d92cd` |
| 3.3 Protocol-preview redesign | **Not started** | - |

### Task 3.2 - targeted questions and setup recovery

- `5a4deb2` `feat: resolve guidance gaps without guessing`
  - The `GuidanceGapResolver` surface and its pure state module.
  - The domain gap contract gained a machine-readable reason, a safe
    owner-facing subject label, a `content_pending` state, an honest gap for a
    required Passport fact recorded as `unknown`, and non-blocking owner setup
    items for an unmatched manual product, an unavailable product, an unknown
    tool temperature and an unknown heat method.
  - The check-in survived a trip to a destination, a retry and a rerender.
  - The zone step became enterable in the UI.
  - RED evidence, GREEN results and the review record in `task-3.2-report.md`.
- `1ae6070` `fix: address Task 3.2 review findings on gaps, focus and owner state`
  - The first review round: a stale zone attachment, a silent normalization
    failure, a raw NUL byte in a source file, a dead button, a stale result
    during a regeneration, a broken comparator, a missing owner switch clear
    and a set of dead exports.
- `99d92cd` `fix: re-review findings on announcements, wording and owner session`
  - The re-review round: one announcement channel per platform, a
    role-aware announcement, one state heading per screen, a plain-language
    boundary, a zone that leaves with its last answer, a previous owner's
    session cleared when another owner is served, and scalable text.

## Verification at stop point

```
npm run check:runtime        -> NODE-RUNTIME-PASS v24.19.0
npm run typecheck            -> 0 errors
npm run lint                 -> 0 errors, 0 warnings
npm run test:coverage        -> 3388 passed, 18 skipped; per-file floors met
npm run export:web           -> export succeeded
npm run audit:control-plane  -> pass
npm run audit:dependencies   -> HOLD (4 findings, unchanged from the baseline)
git diff --check             -> 0
```

## What is still open

- **Task 3.3** (protocol-preview redesign) has not been started. The engine's
  own wording inside the decision view - step reasons that carry a rule
  reference, and the omission sentences - is left exactly as it was, because
  that surface is Task 3.3's.
- **HP-06, TD-02 and TD-03 remain Partial.** The check-in still has no
  photos, no weather and no Cue Check; the resolver still cannot produce a
  plan, because the production reviewed bundle is still draft.
- **The dependency audit is a HOLD**, not a pass. Nothing in this task
  changed it, and nothing may call it a pass.
- The production reviewed bundle (`today-core-guidance` v2) is unchanged:
  `draft`, with empty capabilities and a withdrawn placeholder rule. No
  reviewer field was filled, no capability mapping was created, and no
  content was published.

## Boundaries kept

- Nothing was pushed, merged, deployed or published.
- No hosted migration was applied and no Supabase, Cloudflare or Auth setting
  was changed.
- The research worktrees `codex/research-reconciliation` and
  `codex/research-source-archive` were not touched.
- No database migration was written: Task 3.2 needed no schema change.

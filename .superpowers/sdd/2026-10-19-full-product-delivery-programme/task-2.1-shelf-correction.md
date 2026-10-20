# Task 2.1 — Shelf correction boundary

Date: 20 October 2026. Branch: `codex/full-product-integration`.

## Root cause

The six-hour loop combined three independent failures:

1. The migration's private correction core referenced a bare
   `manual_category`, which PostgreSQL could not resolve. This made most Shelf
   database tests fail before their intended assertions.
2. The domain, mobile and database did not share one material identity-change
   rule. A facts-only or no-op correction could therefore reach different
   outcomes at different boundaries.
3. The history renderer changed from patch-shape semantics to effective-state
   semantics, but several tests still supplied no earlier variant and expected
   a later null to mean “cleared.” A null over an absent answer means it was not
   answered in that entry; it removes a saved answer only when one existed.

## Final contract

- A correction targets an earlier revision that carried an identity.
- It must itself carry brand, product name or category and must materially
  change at least one of them after the shared normalization rules.
- Related facts may accompany that identity change but cannot validate it.
- The audit replays the ordered history to reconstruct the state before the
  corrected entry. Missing parents, cycles, duplicate IDs and forward
  references fail closed.
- Editor action copy remains `Cleared`. Audit copy uses
  `Removed saved answer` and `Not answered in this entry`, so opposite meanings
  are never announced with the same words.

## Verification

- Focused domain, mobile, accessibility and PGlite: 278/278 passed.
- Full coverage with four workers: 2678 passed, 11 skipped; statements 95.75%,
  branches 89.81%, functions 98.42%, lines 97.71%.
- Runtime Node 24.19.0, typecheck, lint, web export and control-plane audit pass.
- Dependency audit: HOLD `RUNNER-REVIEW-DRIFT` (not a pass).
- Hosted owner-isolation and real two-session PostgreSQL concurrency remain
  operator/device gates; no hosted service was changed.

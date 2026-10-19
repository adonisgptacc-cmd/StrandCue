# Programme status — first work order

Branch: `codex/full-product-integration` (from `163c4af`).
Date: 19 October 2026.

## Completed

### Increment 0 — integration truth and executable baseline

- `f7e3060` `docs: baseline full product integration programme`
  - `.superpowers/sdd/2026-10-19-full-product-delivery-programme/baseline.md`
  - Records base SHA, Node 24.19.0, branch containment, dirty state, command
    results and known HOLDs.
- `fe01160` `chore: reconcile StrandCue product branches`
  - `docs/verification/full-product-branch-reconciliation.md`
  - Every active branch classified: contained, superseded, research-only or
    pending review. No whole-branch merge; no product code ported.
- `ad0b1e7` `docs: reconcile canonical product capability status`
  - `docs/product/full-product-capability-matrix.md`
  - `docs/product/requirement-traceability.md` updated only where a named test
    proves the behaviour.

### Increment 1 - visible shell and Hair Passport (under correction)

- `43b61ca` `feat: complete the structured Hair Passport`
  - New unknown-aware Passport facts: self-reported damage observation, heat
    preference, length unit/precision/measurement date, reactions/avoidances.
  - Forward-only migration `20261019120000_passport_condition_length_fields.sql`
    extends the SQL whitelist without inventing values for old records.
  - Editor captures the new facts.
  - RED→GREEN evidence and verification in
    `.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-1.2-passport.md`.
- `9d36439` `fix: align Hair Passport measurement contracts` — three-review
  reconciliation (TypeScript/SQL boundary split, record-level guard trigger,
  editor round-trip fixes); evidence in `task-1.2-passport.md` §"Review
  reconciliation (v3)".
- `757d344` `feat: add the My Hair overview and goal gaps` — Task 1.3.
- `1a570bb` `test: verify the complete Hair Passport journey` — Task 1.4.
- **Increment 1 did NOT pass final integration review.** The record-level
  length guard had a High-severity blind spot: it asked the projection's
  `values`/`ambiguousFields` split whether a legacy numeric `lengthCm` was
  current, so a legacy length with an unknown effective date, or two
  conflicting overlapping legacy entries, was invisible to the guard and a
  structured `lengthMeasurement` could be appended without retiring it.
- The correction is recorded in `task-1.2-passport.md` §"Length invariant
  correction (v4)". The guard now reads the owner's stored length facts
  directly and requires a retirement the projection keeps — an explicit null
  that follows the earlier entry — and it refuses a mixed patch whoever
  writes it. The editor detects the same earlier length (in the state it
  edits, in the projection and in the stored history), retires it in the
  same save, and refuses a save dated before that entry with a plain
  message. A code review and a database/security review covered the
  correction, and a re-review of the corrected snapshot found one Critical
  (a correction of a retirement could make an earlier length current again),
  two High (an editor crash on stored dates the record cannot place, and a
  silent save failure on an impossible date) and four Medium; all of them
  are fixed and a further re-review is the last gate before Increment 1 is
  marked complete.

## Verification at stop point

```
domain typecheck → 0
mobile typecheck → 0
focused suites (passport domain/database, product authority, CI, navigation,
accessibility, owner switch) → 78 passed
git diff --check → 0
working tree → clean
```

## Not started (by design - stop for integration/device review)

- Task 1.3 My Hair overview and goal-specific completeness. → DONE
  (`757d344`).
- Task 1.4 offline/owner-switch device acceptance evidence. → EXECUTED
  (`1a570bb`): launch-level PASS on a receipted artifact; all
  account-dependent journey scenarios BLOCKED with grounds
  (`docs/verification/hair-passport-journey-acceptance-2026-10-19.md`).
- All of Increment 2 (Shelf search/detail, Tools completion, two-owner device
  journey).
- Increment 3 onward (explicitly out of scope for this run).

## HOLDs carried forward

- Node 24.19.x must be prepended to PATH; machine default is 25.1.0.
- `audit:dependencies` cannot reach the registry in this environment.
- Banana Human A/B review outstanding; production reviewed bundle draft.
- Hosted migrations not applied; no hosted mutation attempted.

## Statement

Increment 3 was not started. No push, merge, deploy, hosted migration, content
publication, photo upload or paid service was performed.

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

## Increment 2 — Task 2.1 correction round

Task 2.1 is implemented locally and verified on 20 October 2026. The repeated
failure was caused by three separate faults being handled as one: the SQL core
referenced an unresolved `manual_category`, the correction contract did not
refuse identity no-ops consistently, and UI fixtures described a value as
cleared even though their baseline never recorded it. The final boundary now:

- refuses an identity correction that changes only related facts;
- reconstructs the effective state by replaying the complete earlier history;
- fails closed on missing, cyclic, duplicate and forward-pointing history;
- distinguishes the editor action `Cleared` from the audit result
  `Removed saved answer`, and distinguishes that result from
  `Not answered in this entry`;
- maps stable database refusal codes to plain mobile copy; and
- preserves owner isolation and append-only revision history.

Verification: focused domain/mobile/accessibility/PGlite suites 278/278; full
coverage 2678 passed, 11 skipped, with 95.75/89.81/98.42/97.71 coverage;
typecheck, lint, web export and control-plane audit pass. The dependency audit
remains HOLD on `RUNNER-REVIEW-DRIFT`; it is not reported as a pass.

## Task 2.2 — catalogue search and explicit matching (20 October 2026)

Starting HEAD `c9006e9`; Node 24.19.0. SH-02 now has a consumer surface:
a read-only, bounded, deterministic identity-and-lifecycle search
(`catalogue_search`, migration `20261021120000_catalogue_search.sql`), exact
version candidates with unknown facts named, a side-by-side comparison with the
owner's record, an explicit confirmation through the unchanged `shelf_match`
command, and rematch through append-only history. Retired versions remain
matchable and are labelled retired.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS
(146 files passed, 3 skipped; 2781 tests passed, 11 skipped; 95.69 / 89.81 /
98.58 / 97.78); export:web PASS; audit:control-plane PASS; git diff --check
clean. **audit:dependencies is a HOLD** (`RUNNER-REVIEW-DRIFT`, exit 1), not a
pass. Hosted owner isolation and real two-session PostgreSQL concurrency stay
external gates. Full evidence:
`.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.2-catalogue-search-and-matching.md`.

## Task 2.3 — product details, evidence and the publication boundary (20 October 2026)

Base `95706b0`; Node 24.19.0. The catalogue had no publication state: consumers could read draft claims,
sources, verification events (with reviewer names) and every version's directions and ingredients directly,
and the owner export embedded them. The new migration `20261022120000_product_detail_publication.sql` adds
explicit publication (nothing published), a content-bound two-person review, immutability guards, a
read-only role behind one allowlisted definer core, and gates the export. The detail screen shows exact
identity, version status, reviewed directions, claim-scoped evidence, label-only ingredients and the owner's
private record separately, with a distinct sentence for every reason a section is empty.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS (151 files passed, 3 skipped;
2898 tests passed, 11 skipped; 95.8 / 89.98 / 98.65 / 97.83); export:web PASS; audit:control-plane PASS;
git diff --check clean. **audit:dependencies is a HOLD** (`RUNNER-REVIEW-DRIFT`), not a pass. SH-07 and
SH-08 stay Partial because no directions, claims, evidence or ingredients are published. The tools export
still embedded whole tool catalogue rows then; Task 2.4 closed that. Full evidence:
`.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.3-product-details-and-evidence.md`.

## Task 2.4 — My Tools and the tool catalogue publication boundary (21 October 2026)

Base `50f6311`; Node 24.19.0. The tool catalogue had the same exposure Task 2.3 closed for products: consumers
could read draft capabilities, claims, sources and verification events (with reviewer names), and the owner
export embedded whole tool rows. Migration `20261023120000_tool_owner_facts.sql` adds the owner facts, the
append-only trusted write boundary (corrections, explicit confirmed matches, archive, idempotent operations);
`20261023130000_tool_catalogue_publication.sql` adds explicit publication (nothing published), a content-bound
two-person review, immutability guards, a read-only role behind one allowlisted definer core, and export v4
without raw catalogue rows. The mobile journey covers list, add, edit, correct, catalogue search, comparison,
explicit match, secured catalogue detail, immutable history and archive.

Gates: check:runtime PASS; typecheck PASS; lint PASS; test:coverage PASS (163 files passed, 3 skipped; 3137
tests passed, 11 skipped; 95.89 / 90.4 / 98.46 / 97.9); export:web PASS; audit:control-plane PASS;
git diff --check clean. **audit:dependencies is a HOLD** (`ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT`), not a
pass; no manifest changed. TL-01 and TL-02 are now Implemented; device acceptance and hosted owner isolation stay
external gates. Full evidence: `.superpowers/sdd/2026-10-19-full-product-delivery-programme/task-2.4-my-tools-and-publication.md`.

## Statement

Increment 3 was not started. No push, merge, deploy, hosted migration, content
publication, photo upload or paid service was performed.
